(() => {
  const DEFAULTS = {
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

  const state = {
    videoId: null,
    transcript: [],
    transcriptSource: null,
    connected: false,
    providerStatus: null,
    busy: false,
    lastUrl: location.href,
    settings: { ...DEFAULTS },
  };

  const api = {
    DEFAULTS,
    state,
    qs(selector, root = document) {
      return root.querySelector(selector);
    },
    bridgeFetch(path, { method = 'GET', body } = {}) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'BRIDGE_FETCH', path, method, body }, response => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response) return reject(new Error('Aucune réponse du service worker Professor Ask.'));
          resolve(response);
        });
      });
    },
    getVideoId() {
      try {
        return new URL(location.href).searchParams.get('v');
      } catch {
        return null;
      }
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
      return state.settings.provider === 'antigravity' ? 'Antigravity' : 'Codex';
    },
    selectedModelName() {
      return state.settings.provider === 'antigravity'
        ? state.settings.antigravityModel || 'auto'
        : state.settings.codexModel || 'auto';
    },
    async loadSettings() {
      const saved = await chrome.storage.sync.get(DEFAULTS);
      state.settings = { ...DEFAULTS, ...saved };
      api.applyAppearance?.();
      api.renderStatus?.();
    },
  };

  globalThis.ProfessorAskContent = api;
})();
