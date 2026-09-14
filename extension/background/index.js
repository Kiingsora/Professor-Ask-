import { routeRequest } from './router.js';
import { antigravityProvider } from '../providers/antigravity/index.js';
import { ANTIGRAVITY_REDIRECT_URI } from '../providers/antigravity/config.js';

const ext = globalThis.browser ?? globalThis.chrome;

ext.action.onClicked.addListener(() => {
  ext.runtime.openOptionsPage();
});

// Antigravity's installed-app OAuth redirects to localhost. Professor Ask does not
// run a localhost server: the extension observes that navigation, exchanges the
// authorization code itself, then closes the temporary OAuth tab.
ext.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const url = changeInfo?.url;
  if (typeof url !== 'string' || !url.startsWith(ANTIGRAVITY_REDIRECT_URI)) return;

  void (async () => {
    const result = await antigravityProvider.completeLoginFromUrl(url);
    if (!result?.handled) return;
    try { await ext.tabs.remove(tabId); } catch {}
  })();
});

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_OPTIONS') {
    ext.runtime.openOptionsPage()
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'OPEN_EXTERNAL' && typeof message.url === 'string') {
    ext.tabs.create({ url: message.url })
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'PROVIDER_REQUEST') {
    routeRequest(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: 0, data: null, error: error?.message || String(error) }));
    return true;
  }
});
