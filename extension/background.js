const BRIDGE_ORIGIN = 'http://127.0.0.1:43119';
const ALLOWED_BRIDGE_PATHS = new Set([
  '/health',
  '/account',
  '/login',
  '/chat',
  '/gemini/status',
  '/gemini/login',
  '/gemini/api-key',
]);

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

  if (message?.type === 'BRIDGE_FETCH') {
    proxyBridgeRequest(message)
      .then(sendResponse)
      .catch(error => sendResponse({
        ok: false,
        status: 0,
        data: null,
        error: error.message || String(error),
      }));
    return true;
  }
});

async function proxyBridgeRequest(message) {
  const rawPath = typeof message.path === 'string' ? message.path : '';
  let parsed;
  try {
    parsed = new URL(rawPath, BRIDGE_ORIGIN);
  } catch {
    return { ok: false, status: 400, data: null, error: 'Route bridge invalide.' };
  }

  if (parsed.origin !== BRIDGE_ORIGIN || !ALLOWED_BRIDGE_PATHS.has(parsed.pathname)) {
    return { ok: false, status: 400, data: null, error: 'Route bridge non autorisée.' };
  }

  const method = String(message.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    return { ok: false, status: 405, data: null, error: 'Méthode bridge non autorisée.' };
  }

  const init = {
    method,
    headers: { Accept: 'application/json' },
  };

  if (method === 'POST' && message.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(message.body);
  }

  let response;
  try {
    response = await fetch(parsed.toString(), init);
  } catch (error) {
    throw new Error(`Bridge local inaccessible: ${error.message || error}`);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: response.ok ? null : (data?.error || `Erreur bridge HTTP ${response.status}`),
  };
}
