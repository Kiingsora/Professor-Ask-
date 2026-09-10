importScripts('codex-direct.js');

const NATIVE_HOST = 'com.professorask.bridge';
let nativePort = null;
let nextNativeId = 1;
const nativePending = new Map();

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'OPEN_EXTERNAL' && typeof message.url === 'string') {
    chrome.tabs.create({ url: message.url })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'BRIDGE_FETCH') {
    routeRequest(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: 0, data: null, error: error?.message || String(error) }));
    return true;
  }
});

function parsePath(rawPath) {
  try {
    return new URL(typeof rawPath === 'string' ? rawPath : '', 'https://professor-ask.invalid').pathname;
  } catch {
    throw new Error('Route Professor Ask invalide.');
  }
}

async function directCodex(operation, message) {
  if (operation === 'status') return ProfessorAskCodex.status();
  if (operation === 'login') return ProfessorAskCodex.login();
  if (operation === 'logout') return ProfessorAskCodex.logout();
  if (operation === 'models') return ProfessorAskCodex.models();
  if (operation === 'chat') return ProfessorAskCodex.chat(message.body || {});
  throw new Error(`Action Codex inconnue: ${operation}`);
}

async function routeRequest(message) {
  const pathname = parsePath(message.path);

  try {
    if (pathname === '/health') {
      return okResponse({
        version: '0.6.2',
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
      return okResponse(await nativeRequest({ action: `provider.${operation}`, provider: 'antigravity' }, operation === 'login' ? 60000 : (operation === 'models' ? 45000 : 30000)), 'chrome-native-messaging');
    }

    if (pathname === '/chat') {
      const provider = message.body?.provider || 'codex';
      if (provider === 'codex') return okResponse(await directCodex('chat', message), 'direct-codex-oauth');
      if (provider === 'antigravity') {
        return okResponse(await nativeRequest({ action: 'chat', payload: message.body || {} }, 210000), 'chrome-native-messaging');
      }
      throw new Error(`Fournisseur inconnu: ${provider}`);
    }

    throw new Error('Route Professor Ask non autorisée.');
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error?.message || String(error) };
  }
}

function okResponse(data, transport) {
  return { ok: true, status: 200, data, transport, error: null };
}

function friendlyNativeError(message) {
  const text = String(message || '');
  if (/native messaging host.*not found|specified native messaging host not found/i.test(text)) {
    return 'Antigravity nécessite encore son client local dans cette version. La connexion ChatGPT/Codex, elle, fonctionne directement dans le navigateur.';
  }
  if (/access.*native messaging|not allowed to access native messaging/i.test(text)) return 'Chrome refuse l’accès au connecteur Antigravity local.';
  if (/disconnected|native host has exited|communication with the native messaging host/i.test(text)) return 'Le connecteur Antigravity local s’est arrêté.';
  return text || 'Connecteur Antigravity indisponible.';
}

function failNativePending(error) {
  const message = friendlyNativeError(error);
  for (const pending of nativePending.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }
  nativePending.clear();
}

function ensureNativePort() {
  if (nativePort) return nativePort;
  const port = chrome.runtime.connectNative(NATIVE_HOST);
  nativePort = port;

  port.onMessage.addListener(message => {
    const id = String(message?.id ?? '');
    const pending = nativePending.get(id);
    if (!pending) return;
    nativePending.delete(id);
    clearTimeout(pending.timer);
    if (message?.ok) pending.resolve(message.data);
    else pending.reject(new Error(message?.error || 'Erreur Antigravity.'));
  });

  port.onDisconnect.addListener(() => {
    const lastError = chrome.runtime.lastError?.message || 'Native Messaging déconnecté.';
    if (nativePort === port) nativePort = null;
    failNativePending(lastError);
  });

  return port;
}

function nativeRequest(payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = String(nextNativeId++);
    const port = ensureNativePort();
    const timer = setTimeout(() => {
      nativePending.delete(id);
      reject(new Error('Timeout du connecteur Antigravity.'));
    }, timeoutMs);
    nativePending.set(id, { resolve, reject, timer });
    try {
      port.postMessage({ id, ...payload });
    } catch (error) {
      clearTimeout(timer);
      nativePending.delete(id);
      reject(error);
    }
  });
}
