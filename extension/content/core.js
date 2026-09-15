(() => {
  const DEFAULTS = {
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

  const API_PROVIDER_NAMES = {
    gemini: 'Gemini',
    anthropic: 'Claude',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    mistral: 'Mistral',
    groq: 'Groq',
  };

  const ext = globalThis.browser ?? globalThis.chrome;
  if (!ext?.runtime || !ext?.storage) throw new Error('WebExtension API unavailable.');

  const state = {
    videoId: null,
    transcript: [],
    transcriptSource: null,
    transcriptStatus: 'idle',
    transcriptProgress: null,
    transcriptError: null,
    transcriptDiagnostics: null,
    connected: false,
    providerStatus: null,
    busy: false,
    lastUrl: location.href,
    settings: { ...DEFAULTS },
  };

  const api = {
    DEFAULTS,
    ext,
    state,
    qs(selector, root = document) {
      return root.querySelector(selector);
    },
    async providerRequest(path, { method = 'GET', body } = {}) {
      const response = await ext.runtime.sendMessage({ type: 'PROVIDER_REQUEST', path, method, body });
      if (!response) throw new Error('Aucune réponse du background Professor Ask.');
      return response;
    },
    getVideoId() {
      try { return new URL(location.href).searchParams.get('v'); }
      catch { return null; }
    },
    fmt(value) {
      let sec = Math.max(0, Math.floor(Number(value) || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    },
    currentTime() {
      const video = api.qs('video');
      return video ? video.currentTime || 0 : 0;
    },
    providerName() {
      if (state.settings.provider === 'api') return API_PROVIDER_NAMES[state.settings.apiProvider] || 'API';
      return 'Codex';
    },
    selectedModelName() {
      return state.settings.provider === 'api'
        ? state.settings.apiModel || 'auto'
        : state.settings.codexModel || 'auto';
    },
    async loadSettings() {
      const saved = await ext.storage.sync.get(DEFAULTS);
      if (saved.provider === 'antigravity') saved.provider = 'api';
      state.settings = { ...DEFAULTS, ...saved };
      api.applyAppearance?.();
      api.renderStatus?.();
    },
  };

  globalThis.ProfessorAskContent = api;
})();
