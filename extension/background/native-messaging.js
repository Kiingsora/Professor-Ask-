const NATIVE_HOST = 'com.professorask.bridge';
const ext = globalThis.browser ?? globalThis.chrome;

let nativePort = null;
let nextNativeId = 1;
const pendingRequests = new Map();

function friendlyNativeError(message) {
  const text = String(message || '');
  if (/native messaging host.*not found|specified native messaging host not found/i.test(text)) {
    return 'Antigravity nécessite encore son client local dans cette version. ChatGPT/Codex fonctionne directement dans le navigateur.';
  }
  if (/access.*native messaging|not allowed to access native messaging/i.test(text)) {
    return 'Le navigateur refuse l’accès au connecteur Antigravity local.';
  }
  if (/disconnected|native host has exited|communication with the native messaging host/i.test(text)) {
    return 'Le connecteur Antigravity local s’est arrêté.';
  }
  return text || 'Connecteur Antigravity indisponible.';
}

function rejectPending(error) {
  const message = friendlyNativeError(error);
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(message));
  }
  pendingRequests.clear();
}

function ensurePort() {
  if (nativePort) return nativePort;

  const port = ext.runtime.connectNative(NATIVE_HOST);
  nativePort = port;

  port.onMessage.addListener(message => {
    const id = String(message?.id ?? '');
    const pending = pendingRequests.get(id);
    if (!pending) return;

    pendingRequests.delete(id);
    clearTimeout(pending.timer);
    if (message?.ok) pending.resolve(message.data);
    else pending.reject(new Error(message?.error || 'Erreur Antigravity.'));
  });

  port.onDisconnect.addListener(() => {
    const lastError = ext.runtime.lastError?.message || 'Native Messaging déconnecté.';
    if (nativePort === port) nativePort = null;
    rejectPending(lastError);
  });

  return port;
}

export function nativeRequest(payload, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = String(nextNativeId++);
    const port = ensurePort();
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Timeout du connecteur Antigravity.'));
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timer });

    try {
      port.postMessage({ id, ...payload });
    } catch (error) {
      clearTimeout(timer);
      pendingRequests.delete(id);
      reject(error);
    }
  });
}
