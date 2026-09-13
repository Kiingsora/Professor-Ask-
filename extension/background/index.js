import { routeRequest } from './router.js';

const ext = globalThis.browser ?? globalThis.chrome;

ext.action.onClicked.addListener(() => {
  ext.runtime.openOptionsPage();
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
