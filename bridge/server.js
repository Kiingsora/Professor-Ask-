import http from 'node:http';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 43119;
const SECRET_FILE = fileURLToPath(new URL('./.professor-ask-secrets.json', import.meta.url));

function loadSecrets() {
  try {
    return JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSecrets(next) {
  fs.writeFileSync(SECRET_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || loadSecrets().geminiApiKey || '';
}

function setGeminiApiKey(value) {
  const secrets = loadSecrets();
  if (value) secrets.geminiApiKey = value;
  else delete secrets.geminiApiKey;
  saveSecrets(secrets);
}

function runCommand(command, args = [], timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout: ${command} ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `${command} a quitté avec le code ${code}`).trim()));
    });
  });
}

function launchCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === 'win32',
      windowsHide: false,
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

class CodexClient {
  constructor() {
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.ready = false;
    this.starting = null;
  }

  async ensureStarted() {
    if (this.ready && this.proc && !this.proc.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try { await this.starting; } finally { this.starting = null; }
  }

  async start() {
    this.proc = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.proc.on('error', err => this.failAll(new Error(`Impossible de lancer Codex CLI: ${err.message}`)));
    this.proc.on('exit', (code, signal) => {
      this.ready = false;
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
        version: '0.3.0',
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
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

const codex = new CodexClient();
const codexThreads = new Map();

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function cors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = !origin
    || origin.startsWith('chrome-extension://')
    || origin.startsWith('edge-extension://')
    || origin === 'http://localhost'
    || origin.startsWith('http://localhost:');
  if (!allowed) return false;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  return true;
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error('Requête trop volumineuse.');
  }
  return raw ? JSON.parse(raw) : {};
}

async function getCodexAccount() {
  await codex.ensureStarted();
  const result = await codex.request('account/read', { refreshToken: false }, 15000);
  const account = result?.account || null;
  return { connected: account?.type === 'chatgpt', account };
}

async function getGeminiVertexStatus() {
  try {
    const token = await runCommand('gcloud', ['auth', 'application-default', 'print-access-token'], 12000);
    let email = '';
    try {
      email = await runCommand('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], 8000);
    } catch {}
    return { connected: !!token, authMode: 'vertex', email: email || null, gcloud: true };
  } catch (error) {
    return { connected: false, authMode: 'vertex', email: null, gcloud: false, error: error.message };
  }
}

async function startGeminiVertexLogin() {
  try {
    await runCommand('gcloud', ['--version'], 8000);
  } catch {
    throw new Error('Google Cloud CLI (gcloud) n’est pas installé ou n’est pas dans le PATH.');
  }
  await launchCommand('gcloud', ['auth', 'application-default', 'login']);
  return { started: true, authMode: 'vertex' };
}

function formatTime(value) {
  let sec = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function buildPrompt(payload) {
  const transcript = (payload.transcript || [])
    .map(seg => `[${formatTime(seg.start)}] ${String(seg.text || '').trim()}`)
    .filter(Boolean)
    .join('\n');

  const settings = payload.settings || {};
  const languageInstruction = {
    fr: 'Réponds en français.',
    en: 'Answer in English.',
    auto: 'Réponds dans la langue utilisée par l’utilisateur.',
  }[settings.responseLanguage] || 'Réponds dans la langue utilisée par l’utilisateur.';

  const styleInstruction = {
    concise: 'Sois concis et va directement à l’explication utile.',
    balanced: 'Donne une réponse claire, structurée et de longueur modérée.',
    detailed: 'Donne une réponse détaillée avec le contexte et les nuances utiles.',
  }[settings.responseStyle] || 'Donne une réponse claire, structurée et de longueur modérée.';

  const webInstruction = {
    off: 'N’utilise pas la recherche web.',
    always: 'Quand la question contient un fait vérifiable, actuel ou externe à la vidéo, vérifie-le sur le web et cite les sources utiles.',
    auto: 'Utilise la recherche web lorsque la vidéo ne suffit pas, lorsqu’une information est récente ou lorsqu’une vérification externe améliore la précision.',
  }[settings.webSearch] || 'Utilise la recherche web lorsque cela améliore la précision.';

  return `Tu es Professor Ask, un assistant pédagogique intégré à YouTube.\n\nVIDEO\nTitre: ${payload.title || '(non envoyé)'}\nChaîne: ${payload.channel || '(non envoyée)'}\nPosition actuelle: ${formatTime(payload.timestamp)}\n\nTRANSCRIPTION AUTOUR DU MOMENT ACTUEL\n${transcript || '(Aucune transcription disponible)'}\n\nQUESTION DE L'UTILISATEUR\n${payload.question}\n\nINSTRUCTIONS\n- Prends la transcription et le timestamp comme contexte principal.\n- Explique clairement ce qui est dit ou sous-entendu autour du moment actuel.\n- Distingue ce qui vient de la vidéo de ce qui vient d’informations externes.\n- ${webInstruction}\n- ${styleInstruction}\n- ${languageInstruction}`;
}

async function getCodexThread(videoId) {
  if (codexThreads.has(videoId)) return codexThreads.get(videoId);
  const started = await codex.request('thread/start', {
    ephemeral: true,
    baseInstructions: 'You are Professor Ask, an educational assistant for discussing the currently watched YouTube video. Follow the per-turn instructions about transcript context, answer language, detail level, and web search.',
  }, 30000);
  const id = started?.thread?.id;
  if (!id) throw new Error('Codex n’a pas renvoyé de threadId.');
  codexThreads.set(videoId, id);
  return id;
}

async function askCodex(payload) {
  const account = await getCodexAccount();
  if (!account.connected) throw new Error('Compte Codex non connecté.');

  const threadId = await getCodexThread(payload.videoId || 'unknown');
  const prompt = buildPrompt(payload);
  let answer = '';
  let expectedTurnId = null;
  let completedResolve;
  let completedReject;

  const completed = new Promise((resolve, reject) => {
    completedResolve = resolve;
    completedReject = reject;
  });

  const timeout = setTimeout(() => completedReject(new Error('Timeout pendant la réponse Codex.')), 180000);
  const unsubscribe = codex.subscribe((method, params) => {
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
    const start = await codex.request('turn/start', {
      threadId,
      input: [{ type: 'text', text: prompt, text_elements: [] }],
    }, 30000);
    expectedTurnId = start?.turn?.id;
    if (!expectedTurnId) throw new Error('Codex n’a pas renvoyé de turnId.');
    await completed;
    return { answer: answer.trim(), sources: [] };
  } finally {
    clearTimeout(timeout);
    unsubscribe();
  }
}

function extractGeminiResponse(data) {
  const candidate = data?.candidates?.[0];
  const answer = (candidate?.content?.parts || []).map(part => part.text || '').join('').trim();
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const sources = [];
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web?.uri) continue;
    if (!sources.some(source => source.url === web.uri)) {
      sources.push({ title: web.title || web.uri, url: web.uri });
    }
  }
  return { answer, sources };
}

async function geminiRequest(url, headers, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Erreur Gemini HTTP ${response.status}`;
    throw new Error(message);
  }
  const result = extractGeminiResponse(data);
  if (!result.answer) throw new Error('Gemini a renvoyé une réponse vide.');
  return result;
}

function geminiBody(payload) {
  const tools = payload.settings?.webSearch === 'off' ? undefined : [{ google_search: {} }];
  const result = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(payload) }] }],
  };
  if (tools) result.tools = tools;
  return result;
}

async function askGeminiApi(payload) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Clé Gemini API non configurée.');
  const model = payload.settings?.geminiModel || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return geminiRequest(url, { 'x-goog-api-key': apiKey }, geminiBody(payload));
}

async function askGeminiVertex(payload) {
  const project = String(payload.settings?.geminiProject || '').trim();
  const location = String(payload.settings?.geminiLocation || 'global').trim() || 'global';
  const model = payload.settings?.geminiModel || 'gemini-3.8-flash';
  if (!project) throw new Error('Renseigne le Project ID Google Cloud dans les paramètres Gemini.');
  let accessToken;
  try {
    accessToken = await runCommand('gcloud', ['auth', 'application-default', 'print-access-token'], 15000);
  } catch {
    throw new Error('Compte Google Cloud non connecté. Lance “Se connecter avec Google” dans les paramètres.');
  }
  const url = `https://aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  return geminiRequest(url, { Authorization: `Bearer ${accessToken}` }, geminiBody(payload));
}

async function askGemini(payload) {
  const mode = payload.settings?.geminiAuthMode || 'vertex';
  return mode === 'apiKey' ? askGeminiApi(payload) : askGeminiVertex(payload);
}

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) return json(res, 403, { error: 'Origin non autorisée.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, version: '0.3.0' });
    }

    if (req.method === 'GET' && url.pathname === '/account') {
      try { return json(res, 200, await getCodexAccount()); }
      catch (e) { return json(res, 200, { connected: false, account: null, bridgeError: e.message }); }
    }

    if (req.method === 'POST' && url.pathname === '/login') {
      await codex.ensureStarted();
      const current = await getCodexAccount();
      if (current.connected) return json(res, 200, { connected: true, account: current.account });
      const login = await codex.request('account/login/start', {
        type: 'chatgpt',
        appBrand: 'codex',
        useHostedLoginSuccessPage: true,
      }, 30000);
      return json(res, 200, {
        type: login?.type || 'chatgpt',
        loginId: login?.loginId || null,
        authUrl: login?.authUrl || null,
      });
    }

    if (req.method === 'GET' && url.pathname === '/gemini/status') {
      const mode = url.searchParams.get('mode') || 'vertex';
      if (mode === 'apiKey') {
        return json(res, 200, {
          connected: !!getGeminiApiKey(),
          authMode: 'apiKey',
          apiKeyConfigured: !!getGeminiApiKey(),
        });
      }
      return json(res, 200, await getGeminiVertexStatus());
    }

    if (req.method === 'POST' && url.pathname === '/gemini/login') {
      return json(res, 200, await startGeminiVertexLogin());
    }

    if (req.method === 'POST' && url.pathname === '/gemini/api-key') {
      const payload = await body(req);
      setGeminiApiKey(String(payload.apiKey || '').trim());
      return json(res, 200, { configured: !!getGeminiApiKey() });
    }

    if (req.method === 'POST' && url.pathname === '/chat') {
      const payload = await body(req);
      if (!payload.question || !payload.videoId) {
        return json(res, 400, { error: 'Question ou videoId manquant.' });
      }
      if (payload.provider === 'gemini') {
        return json(res, 200, await askGemini(payload));
      }
      return json(res, 200, await askCodex(payload));
    }

    return json(res, 404, { error: 'Route inconnue.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Professor Ask bridge: http://${HOST}:${PORT}`);
  console.log('Codex OAuth ChatGPT + Gemini Vertex OAuth/API key disponibles.');
});
