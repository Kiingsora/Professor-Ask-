const BRIDGE_ORIGINS = [
  'http://127.0.0.1:43119',
  'http://localhost:43119',
];

const ALLOWED_BRIDGE_PATHS = new Set([
  '/health',
  '/account',
  '/login',
  '/chat',
  '/providers/codex/status',
  '/providers/codex/login',
  '/providers/codex/logout',
  '/providers/codex/models',
  '/providers/antigravity/status',
  '/providers/antigravity/login',
  '/providers/antigravity/logout',
  '/providers/antigravity/models',
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

  if (message?.type === 'OPEN_EXTERNAL' && typeof message.url === 'string') {
    chrome.tabs.create({ url: message.url })
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

function validateBridgePath(rawPath) {
  const path = typeof rawPath === 'string' ? rawPath : '';
  let parsed;
  try {
    parsed = new URL(path, BRIDGE_ORIGINS[0]);
  } catch {
    return { ok: false, error: 'Route bridge invalide.' };
  }

  if (!ALLOWED_BRIDGE_PATHS.has(parsed.pathname)) {
    return { ok: false, error: 'Route bridge non autorisée.' };
  }

  return { ok: true, pathname: parsed.pathname, search: parsed.search };
}

async function proxyBridgeRequest(message) {
  const validated = validateBridgePath(message.path);
  if (!validated.ok) {
    return { ok: false, status: 400, data: null, error: validated.error };
  }

  const method = String(message.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    return { ok: false, status: 405, data: null, error: 'Méthode bridge non autorisée.' };
  }

  const init = {
    method,
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  };

  if (method === 'POST' && message.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(message.body);
  }

  const errors = [];

  for (const origin of BRIDGE_ORIGINS) {
    const url = `${origin}${validated.pathname}${validated.search}`;
    let response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      errors.push(`${origin}: ${error.message || error}`);
      continue;
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
      bridgeOrigin: origin,
      error: response.ok ? null : (data?.error || `Erreur bridge HTTP ${response.status}`),
    };
  }

  return {
    ok: false,
    status: 0,
    data: null,
    error: `Bridge local inaccessible. Tentatives: ${errors.join(' | ')}`,
  };
}
