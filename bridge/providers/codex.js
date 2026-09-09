import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { buildProfessorPrompt } from '../lib/prompt.js';
import { openExternal } from '../lib/process-utils.js';

export class CodexProvider {
  constructor() {
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.ready = false;
    this.starting = null;
    this.threads = new Map();
  }

  get id() { return 'codex'; }
  get label() { return 'Codex'; }

  async ensureStarted() {
    if (this.ready && this.proc && !this.proc.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try { await this.starting; } finally { this.starting = null; }
  }

  async start() {
    this.proc = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.on('error', err => this.failAll(new Error(`Impossible de lancer Codex CLI: ${err.message}`)));
    this.proc.on('exit', (code, signal) => {
      this.ready = false;
      this.threads.clear();
      this.failAll(new Error(`Codex app-server arrêté (${code ?? signal ?? 'inconnu'}).`));
    });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', line => {
      line = line.trim();
      if (!line) return;
      try { this.onMessage(JSON.parse(line)); } catch {}
    });

    this.proc.stderr.on('data', chunk => {
      const text = String(chunk).trim();
      if (text) console.error(`[codex] ${text}`);
    });

    await this.request('initialize', {
      clientInfo: {
        name: 'professor-ask',
        title: 'Professor Ask',
        version: '0.4.0',
      },
      capabilities: { experimentalApi: true },
    }, 15000);

    this.notify('initialized', {});
    this.ready = true;
  }

  onMessage(msg) {
    if (msg && Object.prototype.hasOwnProperty.call(msg, 'id')) {
      const pending = this.pending.get(String(msg.id));
      if (!pending) return;
      this.pending.delete(String(msg.id));
      clearTimeout(pending.timer);
      if (msg.error) pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else pending.resolve(msg.result);
      return;
    }

    if (msg?.method) {
      for (const listener of [...this.listeners]) {
        try { listener(msg.method, msg.params || {}); } catch {}
      }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(payload) {
    if (!this.proc?.stdin?.writable) throw new Error('Codex app-server indisponible.');
    this.proc.stdin.write(JSON.stringify(payload) + '\n');
  }

  request(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Timeout Codex sur ${method}`));
      }, timeoutMs);
      this.pending.set(String(id), { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }

  notify(method, params = {}) {
    this.send({ method, params });
  }

  failAll(err) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  async status() {
    try {
      await this.ensureStarted();
      const result = await this.request('account/read', { refreshToken: false }, 15000);
      const account = result?.account || null;
      return {
        installed: true,
        connected: account?.type === 'chatgpt',
        account,
      };
    } catch (error) {
      return {
        installed: false,
        connected: false,
        account: null,
        error: error.message,
      };
    }
  }

  async login() {
    await this.ensureStarted();
    const current = await this.status();
    if (current.connected) return { ...current, alreadyConnected: true };

    const login = await this.request('account/login/start', {
      type: 'chatgpt',
      appBrand: 'chatgpt',
      useHostedLoginSuccessPage: true,
    }, 30000);

    const authUrl = login?.authUrl || null;
    let opened = false;
    if (authUrl) {
      try {
        await openExternal(authUrl);
        opened = true;
      } catch {}
    }

    return {
      started: true,
      opened,
      loginId: login?.loginId || null,
      authUrl,
    };
  }

  async logout() {
    await this.ensureStarted();
    await this.request('account/logout', {}, 15000);
    this.threads.clear();
    return { connected: false };
  }

  async models() {
    await this.ensureStarted();
    const status = await this.status();
    if (!status.connected) throw new Error('Connecte d’abord ton compte ChatGPT/Codex.');

    const models = [];
    let cursor = null;
    let pages = 0;
    do {
      const result = await this.request('model/list', {
        limit: 100,
        cursor,
        includeHidden: false,
      }, 20000);
      for (const item of result?.data || []) {
        const id = item.id || item.model;
        if (!id) continue;
        models.push({
          id,
          label: item.displayName || id,
          isDefault: !!item.isDefault,
          defaultEffort: item.defaultReasoningEffort || null,
          efforts: (item.supportedReasoningEfforts || []).map(entry => entry.reasoningEffort).filter(Boolean),
        });
      }
      cursor = result?.nextCursor || null;
      pages += 1;
    } while (cursor && pages < 5);

    return { models };
  }

  async getThread(videoId) {
    if (this.threads.has(videoId)) return this.threads.get(videoId);
    await this.ensureStarted();
    const started = await this.request('thread/start', {
      ephemeral: true,
      baseInstructions: 'You are Professor Ask, an educational assistant for discussing the currently watched YouTube video. Follow the per-turn transcript, language, detail, and web-search instructions.',
    }, 30000);
    const id = started?.thread?.id;
    if (!id) throw new Error('Codex n’a pas renvoyé de threadId.');
    this.threads.set(videoId, id);
    return id;
  }

  async chat(payload) {
    const account = await this.status();
    if (!account.connected) throw new Error('Compte Codex non connecté.');

    const threadId = await this.getThread(payload.videoId || 'unknown');
    const prompt = buildProfessorPrompt(payload);
    let answer = '';
    let expectedTurnId = null;
    let completedResolve;
    let completedReject;

    const completed = new Promise((resolve, reject) => {
      completedResolve = resolve;
      completedReject = reject;
    });

    const timeout = setTimeout(() => completedReject(new Error('Timeout pendant la réponse Codex.')), 180000);
    const unsubscribe = this.subscribe((method, params) => {
      if (params.threadId !== threadId) return;

      if (method === 'item/agentMessage/delta') {
        if (!expectedTurnId || params.turnId === expectedTurnId) answer += params.delta || '';
        return;
      }

      if (method === 'turn/completed') {
        const id = params.turn?.id;
        if (expectedTurnId && id !== expectedTurnId) return;
        if (params.turn?.status === 'failed') {
          completedReject(new Error(params.turn?.error?.message || 'Le tour Codex a échoué.'));
        } else {
          completedResolve(params);
        }
      }
    });

    try {
      const turnParams = {
        threadId,
        input: [{ type: 'text', text: prompt, text_elements: [] }],
      };

      const model = payload.settings?.codexModel;
      const effort = payload.settings?.codexEffort;
      if (model && model !== 'auto') turnParams.model = model;
      if (effort && effort !== 'auto') turnParams.effort = effort;

      const started = await this.request('turn/start', turnParams, 30000);
      expectedTurnId = started?.turn?.id;
      if (!expectedTurnId) throw new Error('Codex n’a pas renvoyé de turnId.');
      await completed;
      return { answer: answer.trim(), sources: [] };
    } finally {
      clearTimeout(timeout);
      unsubscribe();
    }
  }
}
