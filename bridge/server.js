import http from 'node:http';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const HOST = '127.0.0.1';
const PORT = 43119;

class CodexClient {
  constructor() {
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.notificationWaiters = new Map();
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

    this.proc.on('error', (err) => this.failAll(new Error(`Impossible de lancer Codex CLI: ${err.message}`)));
    this.proc.on('exit', (code, signal) => {
      this.ready = false;
      this.failAll(new Error(`Codex app-server arrêté (${code ?? signal ?? 'inconnu'}).`));
    });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', line => {
      line = line.trim();
      if (!line) return;
      try { this.onMessage(JSON.parse(line)); } catch { /* Ignore non JSON output. */ }
    });

    this.proc.stderr.on('data', chunk => {
      const text = String(chunk).trim();
      if (text) console.error(`[codex] ${text}`);
    });

    await this.request('initialize', {
      clientInfo: {
        name: 'professor-ask',
        title: 'Professor Ask',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
      },
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
      const waiters = this.notificationWaiters.get(msg.method) || [];
      for (const waiter of [...waiters]) {
        try {
          if (!waiter.predicate || waiter.predicate(msg.params || {})) {
            waiter.resolve(msg.params || {});
            clearTimeout(waiter.timer);
            waiters.splice(waiters.indexOf(waiter), 1);
          }
        } catch {}
      }
      if (waiters.length) this.notificationWaiters.set(msg.method, waiters);
      else this.notificationWaiters.delete(msg.method);
    }
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

  waitFor(method, predicate = null, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const list = this.notificationWaiters.get(method) || [];
        const i = list.indexOf(waiter);
        if (i >= 0) list.splice(i, 1);
        reject(new Error(`Timeout en attendant ${method}`));
      }, timeoutMs);
      const list = this.notificationWaiters.get(method) || [];
      list.push(waiter);
      this.notificationWaiters.set(method, list);
    });
  }

  failAll(err) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    for (const list of this.notificationWaiters.values()) {
      for (const w of list) {
        clearTimeout(w.timer);
        w.reject(err);
      }
    }
    this.notificationWaiters.clear();
  }
}

const codex = new CodexClient();
const threads = new Map();

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
  const allowed = !origin ||
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('edge-extension://') ||
    origin === 'http://localhost' ||
    origin.startsWith('http://localhost:');
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

async function getAccount() {
  await codex.ensureStarted();
  const result = await codex.request('account/read', { refreshToken: false }, 15000);
  const account = result?.account || null;
  return { connected: account?.type === 'chatgpt', account };
}

function buildPrompt(payload) {
  const lines = (payload.transcript || []).map(seg =>
    `[${formatTime(seg.start)}] ${String(seg.text || '').trim()}`
  ).filter(Boolean).join('\n');

  return `Tu es Professor Ask, un assistant pédagogique intégré à YouTube.\n\nVIDEO\nTitre: ${payload.title || 'Inconnu'}\nChaîne: ${payload.channel || 'Inconnue'}\nPosition actuelle: ${formatTime(payload.timestamp)}\n\nTRANSCRIPTION AUTOUR DU MOMENT ACTUEL\n${lines || '(Aucune transcription disponible)'}\n\nQUESTION DE L'UTILISATEUR\n${payload.question}\n\nINSTRUCTIONS\n- Prends la transcription et le timestamp comme contexte principal.\n- Explique clairement ce qui est dit ou sous-entendu autour du moment actuel.\n- Si la question nécessite des informations absentes de la vidéo, des faits récents ou une vérification, utilise la recherche web disponible dans Codex.\n- Distingue clairement ce qui vient de la vidéo de ce qui vient de sources externes.\n- Quand tu utilises le web, donne les sources ou liens pertinents dans la réponse.\n- Réponds dans la langue de l'utilisateur.\n- Ne parle pas de programmation ou de modification de fichiers sauf si la vidéo ou la question porte réellement dessus.`;
}

function formatTime(value) {
  let sec = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

async function getThread(videoId) {
  if (threads.has(videoId)) return threads.get(videoId);
  const started = await codex.request('thread/start', {
    ephemeral: true,
    baseInstructions: 'You are Professor Ask, a concise educational assistant for discussing the currently watched YouTube video. Use web search when current or external verification is useful.',
  }, 30000);
  const id = started?.thread?.id;
  if (!id) throw new Error('Codex n’a pas renvoyé de threadId.');
  threads.set(videoId, id);
  return id;
}

async function askCodex(payload) {
  const account = await getAccount();
  if (!account.connected) throw new Error('Compte Codex non connecté.');
  const threadId = await getThread(payload.videoId || 'unknown');
  const prompt = buildPrompt(payload);

  const start = await codex.request('turn/start', {
    threadId,
    input: [{ type: 'text', text: prompt, text_elements: [] }],
  }, 30000);

  const turnId = start?.turn?.id;
  if (!turnId) throw new Error('Codex n’a pas renvoyé de turnId.');

  let answer = '';
  let done = false;
  let failure = null;

  const deltaLoop = (async () => {
    while (!done) {
      try {
        const event = await codex.waitFor(
          'item/agentMessage/delta',
          p => p.threadId === threadId && p.turnId === turnId,
          120000,
        );
        answer += event.delta || '';
      } catch (e) {
        if (!done) failure = e;
        break;
      }
    }
  })();

  try {
    const completed = await codex.waitFor(
      'turn/completed',
      p => p.threadId === threadId && p.turn?.id === turnId,
      180000,
    );
    if (completed?.turn?.status === 'failed') {
      throw new Error(completed?.turn?.error?.message || 'Le tour Codex a échoué.');
    }
  } finally {
    done = true;
  }

  await Promise.race([deltaLoop, new Promise(r => setTimeout(r, 80))]);
  if (!answer && failure) throw failure;
  return answer.trim();
}

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) return json(res, 403, { error: 'Origin non autorisée.' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && req.url === '/account') {
      try { return json(res, 200, await getAccount()); }
      catch (e) { return json(res, 200, { connected: false, account: null, bridgeError: e.message }); }
    }

    if (req.method === 'POST' && req.url === '/login') {
      await codex.ensureStarted();
      const current = await getAccount();
      if (current.connected) return json(res, 200, { connected: true, account: current.account });
      const login = await codex.request('account/login/start', {
        type: 'chatgpt',
        appBrand: 'codex',
        useHostedLoginSuccessPage: true,
      }, 30000);
      return json(res, 200, {
        loginId: login?.loginId || null,
        authUrl: login?.authUrl || null,
      });
    }

    if (req.method === 'POST' && req.url === '/chat') {
      const payload = await body(req);
      if (!payload.question || !payload.videoId) return json(res, 400, { error: 'Question ou videoId manquant.' });
      const answer = await askCodex(payload);
      return json(res, 200, { answer });
    }

    return json(res, 404, { error: 'Route inconnue.' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Professor Ask bridge: http://${HOST}:${PORT}`);
  console.log('Le processus Codex sera lancé automatiquement à la première requête.');
});
