import { routeRequest } from './router.js';
import { routeTranscriptRequest } from './transcription/client.js';

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

  if (message?.type === 'PROVIDER_REQUEST') {
    routeRequest(message)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: 0, data: null, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === 'TRANSCRIPT_REQUEST') {
    routeTranscriptRequest(message)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, data: null, error: error?.message || String(error) }));
    return true;
  }
});
