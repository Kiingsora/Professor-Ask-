export const ext = globalThis.browser ?? globalThis.chrome;

export const DEFAULTS = {
  provider: 'codex',
  codexModel: 'auto',
  codexEffort: 'auto',
  apiProvider: 'gemini',
  apiModel: 'auto',
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
  modelCatalogs: { codex: [], api: [] },
};

export const $ = id => document.getElementById(id);

export async function providerRequest(path, { method = 'GET', body } = {}) {
  const response = await ext.runtime.sendMessage({ type: 'PROVIDER_REQUEST', path, method, body });
  if (!response) throw new Error('Aucune réponse du background Professor Ask.');
  return response;
}

export async function openExternal(url) {
  const response = await ext.runtime.sendMessage({ type: 'OPEN_EXTERNAL', url });
  if (!response?.ok) throw new Error(response?.error || 'Impossible d’ouvrir le lien.');
}
