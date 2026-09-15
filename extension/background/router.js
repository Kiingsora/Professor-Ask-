import { apiKeyProvider } from '../providers/api/index.js';
import { codexProvider } from '../providers/codex/index.js';

const VERSION = '0.9.9';

function parsePath(rawPath) {
  try {
    return new URL(typeof rawPath === 'string' ? rawPath : '', 'https://professor-ask.invalid').pathname;
  } catch {
    throw new Error('Route Professor Ask invalide.');
  }
}

function okResponse(data, transport) {
  return { ok: true, status: 200, data, transport, error: null };
}

function validateTranscriptClaim(body) {
  if (!body?.transcriptAvailable) return;
  const hasText = Array.isArray(body?.transcript)
    && body.transcript.some(segment => String(segment?.text || '').trim());
  if (!hasText) throw new Error('Le contexte vidéo est marqué disponible mais aucun segment de sous-titre valide n’a été fourni.');
}

function providerFor(name) {
  if (name === 'codex') return codexProvider;
  if (name === 'api') return apiKeyProvider;
  throw new Error(`Fournisseur inconnu: ${name}`);
}

async function directProvider(name, operation, message) {
  const handler = providerFor(name)[operation];
  if (typeof handler !== 'function') throw new Error(`Action ${name} inconnue: ${operation}`);
  return handler(message?.body || {});
}

function transportFor(provider) {
  return provider === 'api' ? 'direct-api-key' : 'direct-codex-oauth';
}

export async function routeRequest(message) {
  const pathname = parsePath(message.path);

  try {
    if (pathname === '/health') {
      return okResponse({
        version: VERSION,
        transport: 'browser',
        providers: {
          codex: 'direct-oauth',
          api: 'direct-api-key',
        },
      }, 'browser');
    }

    if (pathname === '/account') return okResponse(await directProvider('codex', 'status', message), 'direct-codex-oauth');
    if (pathname === '/login') return okResponse(await directProvider('codex', 'login', message), 'direct-codex-oauth');

    const providerRoute = pathname.match(/^\/providers\/(codex|api)\/(status|models|login|logout)$/);
    if (providerRoute) {
      const [, provider, operation] = providerRoute;
      return okResponse(await directProvider(provider, operation, message), transportFor(provider));
    }

    if (pathname === '/chat') {
      validateTranscriptClaim(message.body);
      const provider = message.body?.provider || 'codex';
      return okResponse(await directProvider(provider, 'chat', message), transportFor(provider));
    }

    throw new Error('Route Professor Ask non autorisée.');
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error?.message || String(error) };
  }
}
