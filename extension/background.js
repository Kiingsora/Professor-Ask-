const BRIDGE_ORIGIN = 'http://127.0.0.1:43119';
const ALLOWED_BRIDGE_PATHS = new Set(['/health', '/account', '/login', '/chat']);

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
  const path = typeof message.path === 'string' ? message.path : '';
  if (!ALLOWED_BRIDGE_PATHS.has(path)) {
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
    response = await fetch(`${BRIDGE_ORIGIN}${path}`, init);
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
