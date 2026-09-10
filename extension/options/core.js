export const DEFAULTS = {
  provider: 'codex',
  codexModel: 'auto',
  codexEffort: 'auto',
  antigravityModel: 'auto',
  responseLanguage: 'auto',
  responseStyle: 'balanced',
  webSearch: 'auto',
  pauseOnQuestion: true,
  contextSeconds: 180,
  transcriptLanguage: 'auto',
  includeMetadata: true,
  theme: 'auto',
  panelSize: 'standard',
  rememberHistory: true,
  historyLimit: 30,
};

export const store = {
  settings: { ...DEFAULTS },
  saveTimer: null,
  modelCatalogs: { codex: [], antigravity: [] },
};

export const $ = id => document.getElementById(id);

export function providerRequest(path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'PROVIDER_REQUEST', path, method, body }, response => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response) return reject(new Error('Aucune réponse du service worker Professor Ask.'));
      resolve(response);
    });
  });
}

export function openExternal(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'OPEN_EXTERNAL', url }, response => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response?.ok) return reject(new Error(response?.error || 'Impossible d’ouvrir le lien.'));
      resolve();
    });
  });
}
