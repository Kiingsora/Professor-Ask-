import http from 'node:http';
import { CodexProvider } from './providers/codex.js';
import { AntigravityProvider } from './providers/antigravity.js';

const PORT = 43119;
const VERSION = '0.4.2';
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

const providers = new Map([
  ['codex', new CodexProvider()],
  ['antigravity', new AntigravityProvider()],
]);

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function cors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = !origin
    || origin.startsWith('chrome-extension://')
    || origin.startsWith('edge-extension://')
    || origin === 'http://localhost'
    || origin.startsWith('http://localhost:')
    || origin === 'http://127.0.0.1'
    || origin.startsWith('http://127.0.0.1:');

  if (!allowed) return false;
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  // Harmless for modern LNA and required by older PNA-style Chromium checks.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  return true;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error('Requête trop volumineuse.');
  }
  return raw ? JSON.parse(raw) : {};
}

function getProvider(id) {
  const provider = providers.get(id);
  if (!provider) throw new Error(`Fournisseur inconnu: ${id}`);
  return provider;
}

async function handleRequest(req, res) {
  if (!cors(req, res)) return json(res, 403, { error: 'Origin non autorisée.' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        version: VERSION,
        pid: process.pid,
        providers: [...providers.keys()],
        loopback: LOOPBACK_HOSTS,
      });
    }

    const providerRoute = url.pathname.match(/^\/providers\/(codex|antigravity)\/(status|models)$/);
    if (req.method === 'GET' && providerRoute) {
      const [, providerId, action] = providerRoute;
      const provider = getProvider(providerId);
      const result = action === 'status'
        ? await provider.status()
        : await provider.models();
      return json(res, 200, result);
    }

    const providerMutation = url.pathname.match(/^\/providers\/(codex|antigravity)\/(login|logout)$/);
    if (req.method === 'POST' && providerMutation) {
      const [, providerId, action] = providerMutation;
      const provider = getProvider(providerId);
      const result = action === 'login'
        ? await provider.login()
        : await provider.logout();
      return json(res, 200, result);
    }

    // Compatibility with Professor Ask 0.3 during extension reloads.
    if (req.method === 'GET' && url.pathname === '/account') {
      return json(res, 200, await getProvider('codex').status());
    }
    if (req.method === 'POST' && url.pathname === '/login') {
      return json(res, 200, await getProvider('codex').login());
    }

    if (req.method === 'POST' && url.pathname === '/chat') {
      const payload = await readBody(req);
      if (!payload.question || !payload.videoId) {
        return json(res, 400, { error: 'Question ou videoId manquant.' });
      }
      const providerId = payload.provider || 'codex';
      const provider = getProvider(providerId);
      const result = await provider.chat(payload);
      return json(res, 200, { provider: providerId, ...result });
    }

    return json(res, 404, { error: 'Route inconnue.' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || String(error) });
  }
}

function listen(host, { required = false } = {}) {
  const server = http.createServer(handleRequest);

  server.on('error', error => {
    if (!required) {
      console.warn(`[Professor Ask] Loopback ${host} indisponible: ${error.message}`);
      return;
    }
    console.error(`[Professor Ask] Impossible d'ecouter sur ${host}:${PORT}: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(PORT, host, () => {
    const label = host.includes(':') ? `[${host}]` : host;
    console.log(`[Professor Ask] Listening: http://${label}:${PORT}`);
  });

  return server;
}

listen('127.0.0.1', { required: true });
listen('::1');

console.log(`Professor Ask bridge v${VERSION}`);
console.log(`PID: ${process.pid}`);
console.log('Auto-reload: gere par bridge/watch.js.');
console.log('Providers: Codex OAuth ChatGPT + Google Antigravity OAuth.');
