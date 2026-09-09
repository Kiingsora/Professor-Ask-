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

  // Compatibility layer: content.js and options.js keep using BRIDGE_FETCH,
  // while the transport is Chrome Native Messaging rather than localhost HTTP.
  if (message?.type === 'BRIDGE_FETCH') {
    proxyNativeRequest(message)
      .then(sendResponse)
      .catch(error => sendResponse({
        ok: false,
        status: 0,
        data: null,
        error: friendlyNativeError(error?.message || String(error)),
      }));
    return true;
  }
});

function friendlyNativeError(message) {
  const text = String(message || '');
  if (/native messaging host.*not found|specified native messaging host not found/i.test(text)) {
    return 'Le composant Professor Ask n’est pas encore installé. Lance une seule fois “Installer Professor Ask.vbs”, puis actualise l’extension.';
  }
  if (/access.*native messaging|not allowed to access native messaging/i.test(text)) {
    return 'Chrome refuse l’accès au composant Professor Ask. Relance “Installer Professor Ask.vbs”, puis actualise l’extension.';
  }
  if (/disconnected|native host has exited|communication with the native messaging host/i.test(text)) {
    return 'Le composant Professor Ask s’est arrêté de façon inattendue.';
  }
  return text || 'Le composant Professor Ask est indisponible.';
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
    else pending.reject(new Error(message?.error || 'Erreur du composant Professor Ask.'));
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
      reject(new Error(`Timeout du composant Professor Ask sur ${payload.action || 'requête'}.`));
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

function requestFromLegacyPath(message) {
  const rawPath = typeof message.path === 'string' ? message.path : '';
  let pathname;
  try {
    pathname = new URL(rawPath, 'https://professor-ask.invalid').pathname;
  } catch {
    throw new Error('Route Professor Ask invalide.');
  }

  if (pathname === '/health') return { action: 'health', timeoutMs: 10000 };
  if (pathname === '/account') return { action: 'provider.status', provider: 'codex', timeoutMs: 30000 };
  if (pathname === '/login') return { action: 'provider.login', provider: 'codex', timeoutMs: 60000 };

  const providerRoute = pathname.match(/^\/providers\/(codex|antigravity)\/(status|models|login|logout)$/);
  if (providerRoute) {
    const [, provider, operation] = providerRoute;
    const timeoutMs = operation === 'login' ? 60000 : (operation === 'models' ? 45000 : 30000);
    return {
      action: `provider.${operation}`,
      provider,
      timeoutMs,
    };
  }

  if (pathname === '/chat') {
    return {
      action: 'chat',
      payload: message.body || {},
      timeoutMs: 210000,
    };
  }

  throw new Error('Route Professor Ask non autorisée.');
}

async function proxyNativeRequest(message) {
  try {
    const mapped = requestFromLegacyPath(message);
    const { timeoutMs, ...payload } = mapped;
    const data = await nativeRequest(payload, timeoutMs);
    return {
      ok: true,
      status: 200,
      data,
      transport: 'chrome-native-messaging',
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      transport: 'chrome-native-messaging',
      error: friendlyNativeError(error?.message || String(error)),
    };
  }
}
