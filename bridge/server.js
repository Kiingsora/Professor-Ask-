import http from 'node:http';
import { CodexProvider } from './providers/codex.js';
import { AntigravityProvider } from './providers/antigravity.js';

const HOST = '127.0.0.1';
const PORT = 43119;
const VERSION = '0.4.1';

const providers = new Map([
  ['codex', new CodexProvider()],
  ['antigravity', new AntigravityProvider()],
]);

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

const server = http.createServer(async (req, res) => {
  if (!cors(req, res)) return json(res, 403, { error: 'Origin non autorisée.' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        version: VERSION,
        pid: process.pid,
        providers: [...providers.keys()],
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
});

server.listen(PORT, HOST, () => {
  console.log(`Professor Ask bridge v${VERSION}: http://${HOST}:${PORT}`);
  console.log(`PID: ${process.pid}`);
  console.log('Auto-reload: actif (Node watch mode).');
  console.log('Providers: Codex OAuth ChatGPT + Google Antigravity OAuth.');
});
