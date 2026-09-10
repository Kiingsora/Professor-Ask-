import { codexProvider } from '../providers/codex/index.js';
import { nativeRequest } from './native-messaging.js';

const VERSION = '0.7.0';

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

async function directCodex(operation, message) {
  const handler = codexProvider[operation];
  if (typeof handler !== 'function') throw new Error(`Action Codex inconnue: ${operation}`);
  return handler(message?.body || {});
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
          antigravity: 'native-companion-optional',
        },
      }, 'browser');
    }

    if (pathname === '/account') return okResponse(await directCodex('status', message), 'direct-codex-oauth');
    if (pathname === '/login') return okResponse(await directCodex('login', message), 'direct-codex-oauth');

    const providerRoute = pathname.match(/^\/providers\/(codex|antigravity)\/(status|models|login|logout)$/);
    if (providerRoute) {
      const [, provider, operation] = providerRoute;
      if (provider === 'codex') return okResponse(await directCodex(operation, message), 'direct-codex-oauth');

      const timeout = operation === 'login' ? 60000 : (operation === 'models' ? 45000 : 30000);
      const data = await nativeRequest({ action: `provider.${operation}`, provider: 'antigravity' }, timeout);
      return okResponse(data, 'chrome-native-messaging');
    }

    if (pathname === '/chat') {
      const provider = message.body?.provider || 'codex';
      if (provider === 'codex') return okResponse(await directCodex('chat', message), 'direct-codex-oauth');
      if (provider === 'antigravity') {
        const data = await nativeRequest({ action: 'chat', payload: message.body || {} }, 210000);
        return okResponse(data, 'chrome-native-messaging');
      }
      throw new Error(`Fournisseur inconnu: ${provider}`);
    }

    throw new Error('Route Professor Ask non autorisée.');
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error?.message || String(error) };
  }
}
