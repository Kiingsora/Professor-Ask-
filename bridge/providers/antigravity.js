import { buildProfessorPrompt } from '../lib/prompt.js';
import { commandExists, launchInteractive, runCommand, stripAnsi } from '../lib/process-utils.js';

export class AntigravityProvider {
  constructor() {
    this.conversations = new Map();
  }

  get id() { return 'antigravity'; }
  get label() { return 'Antigravity'; }

  async installed() {
    return commandExists('agy', ['--version']);
  }

  async status() {
    if (!(await this.installed())) {
      return {
        installed: false,
        connected: false,
        error: 'Antigravity CLI (agy) n’est pas installé ou n’est pas dans le PATH.',
      };
    }

    try {
      const { stdout } = await runCommand('agy', [
        '-p', '/model',
        '--output-format', 'json',
        '--print-timeout', '15s',
      ], { timeoutMs: 22000 });

      let model = null;
      try {
        const parsed = JSON.parse(stdout);
        model = parsed?.response?.trim() || null;
      } catch {
        model = stdout.trim() || null;
      }

      return { installed: true, connected: true, model };
    } catch (error) {
      return {
        installed: true,
        connected: false,
        error: error.message,
      };
    }
  }

  async login() {
    if (!(await this.installed())) {
      throw new Error('Antigravity CLI (agy) n’est pas installé. Installe-le puis relance le bridge.');
    }

    await launchInteractive('agy');
    return {
      started: true,
      opened: true,
      message: 'Antigravity a été ouvert. S’il n’existe aucune session enregistrée, le CLI ouvre automatiquement le navigateur pour la connexion Google OAuth.',
    };
  }

  async logout() {
    if (!(await this.installed())) throw new Error('Antigravity CLI n’est pas installé.');
    await runCommand('agy', ['-p', '/logout', '--print-timeout', '15s'], { timeoutMs: 22000 });
    this.conversations.clear();
    return { connected: false };
  }

  async models() {
    if (!(await this.installed())) {
      throw new Error('Antigravity CLI (agy) n’est pas installé.');
    }

    const { stdout } = await runCommand('agy', ['models'], { timeoutMs: 25000 });
    const cleaned = stripAnsi(stdout);
    const models = [];

    for (const rawLine of cleaned.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;

      const match = line.match(/^(?:[-*]\s*)?([A-Za-z0-9][A-Za-z0-9._-]+)\s{2,}(.+)$/);
      if (!match) continue;

      const id = match[1].trim();
      const label = match[2].trim();
      if (!/^(gemini|claude|gpt|openai|anthropic)[-_.]/i.test(id)) continue;
      models.push({ id, label: label || id });
    }

    if (!models.length) {
      throw new Error('Antigravity est accessible mais aucun modèle n’a pu être lu depuis `agy models`.');
    }

    return { models };
  }

  async chat(payload) {
    if (!(await this.installed())) throw new Error('Antigravity CLI n’est pas installé.');

    const prompt = buildProfessorPrompt(payload);
    const model = payload.settings?.antigravityModel;
    const conversationKey = `${payload.videoId || 'unknown'}:${model || 'auto'}`;
    const previousConversation = this.conversations.get(conversationKey);

    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--print-timeout', '3m',
    ];

    if (model && model !== 'auto') args.push('--model', model);
    if (previousConversation) args.push('--conversation', previousConversation);

    let stdout;
    try {
      ({ stdout } = await runCommand('agy', args, { timeoutMs: 195000 }));
    } catch (error) {
      if (/authentication required|sign.?in|login|oauth/i.test(error.message)) {
        throw new Error('Antigravity n’est pas connecté. Ouvre les paramètres et clique sur “Se connecter avec Google”.');
      }
      throw error;
    }

    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      throw new Error('Réponse Antigravity invalide : le CLI n’a pas renvoyé le JSON attendu.');
    }

    if (result?.status && result.status !== 'SUCCESS') {
      throw new Error(result.error || `Antigravity a terminé avec le statut ${result.status}.`);
    }

    const answer = String(result?.response || '').trim();
    if (!answer) throw new Error('Antigravity a renvoyé une réponse vide.');

    if (result?.conversation_id) {
      this.conversations.set(conversationKey, result.conversation_id);
    }

    return {
      answer,
      sources: [],
      conversationId: result?.conversation_id || null,
      usage: result?.usage || null,
    };
  }
}
