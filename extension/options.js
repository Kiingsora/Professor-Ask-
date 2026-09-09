(() => {
  const DEFAULTS = {
    provider: 'codex',
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
    geminiAuthMode: 'vertex',
    geminiProject: '',
    geminiLocation: 'global',
    geminiModel: 'gemini-3.8-flash',
  };

  const $ = id => document.getElementById(id);
  let settings = { ...DEFAULTS };
  let saveTimer = null;

  function bridgeFetch(path, { method = 'GET', body } = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'BRIDGE_FETCH', path, method, body },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error('Aucune réponse du service worker Professor Ask.'));
            return;
          }
          resolve(response);
        },
      );
    });
  }

  function setSaveState(text, kind = '') {
    const el = $('save-state');
    el.textContent = text;
    el.className = `save-state ${kind}`.trim();
  }

  function setProviderPanels() {
    const provider = settings.provider || 'codex';
    $('codex-panel').hidden = provider !== 'codex';
    $('gemini-panel').hidden = provider !== 'gemini';
    document.querySelectorAll('[data-provider-card]').forEach(card => {
      card.classList.toggle('selected', card.dataset.providerCard === provider);
    });
    setGeminiAuthPanel();
  }

  function setGeminiAuthPanel() {
    const mode = settings.geminiAuthMode || 'vertex';
    $('gemini-vertex-fields').hidden = mode !== 'vertex';
    $('gemini-api-fields').hidden = mode !== 'apiKey';
  }

  function readForm() {
    const provider = document.querySelector('input[name="provider"]:checked')?.value || 'codex';
    return {
      provider,
      responseLanguage: $('response-language').value,
      responseStyle: $('response-style').value,
      webSearch: $('web-search').value,
      pauseOnQuestion: $('pause-on-question').checked,
      contextSeconds: Number($('context-seconds').value),
      transcriptLanguage: $('transcript-language').value,
      includeMetadata: $('include-metadata').checked,
      theme: $('theme').value,
      panelSize: $('panel-size').value,
      rememberHistory: $('remember-history').checked,
      historyLimit: Number($('history-limit').value),
      geminiAuthMode: $('gemini-auth-mode').value,
      geminiProject: $('gemini-project').value.trim(),
      geminiLocation: $('gemini-location').value.trim() || 'global',
      geminiModel: $('gemini-model').value,
    };
  }

  function writeForm(value) {
    settings = { ...DEFAULTS, ...value };
    const providerInput = document.querySelector(`input[name="provider"][value="${settings.provider}"]`);
    if (providerInput) providerInput.checked = true;
    $('response-language').value = settings.responseLanguage;
    $('response-style').value = settings.responseStyle;
    $('web-search').value = settings.webSearch;
    $('pause-on-question').checked = !!settings.pauseOnQuestion;
    $('context-seconds').value = String(settings.contextSeconds);
    $('transcript-language').value = settings.transcriptLanguage;
    $('include-metadata').checked = !!settings.includeMetadata;
    $('theme').value = settings.theme;
    $('panel-size').value = settings.panelSize;
    $('remember-history').checked = !!settings.rememberHistory;
    $('history-limit').value = String(settings.historyLimit);
    $('gemini-auth-mode').value = settings.geminiAuthMode;
    $('gemini-project').value = settings.geminiProject;
    $('gemini-location').value = settings.geminiLocation;
    $('gemini-model').value = settings.geminiModel;
    setProviderPanels();
  }

  async function loadSettings() {
    const saved = await chrome.storage.sync.get(DEFAULTS);
    writeForm(saved);
    setSaveState('Enregistré', 'ok');
  }

  function scheduleSave() {
    settings = readForm();
    setProviderPanels();
    setSaveState('Enregistrement…', 'dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await chrome.storage.sync.set(settings);
      setSaveState('Enregistré', 'ok');
    }, 180);
  }

  async function refreshCodex() {
    const status = $('codex-status');
    const button = $('connect-codex');
    status.textContent = 'Vérification…';
    status.className = 'provider-status muted';
    try {
      const response = await bridgeFetch('/account');
      const data = response.data || {};
      if (response.ok && data.connected) {
        const email = data.account?.email ? ` · ${data.account.email}` : '';
        const plan = data.account?.plan_type ? ` · ${data.account.plan_type}` : '';
        status.textContent = `Connecté${email}${plan}`;
        status.className = 'provider-status';
        button.textContent = 'ChatGPT connecté';
        button.disabled = true;
      } else {
        status.textContent = data.bridgeError ? 'Bridge/Codex indisponible' : 'Non connecté';
        status.className = 'provider-status warn';
        button.textContent = 'Se connecter avec ChatGPT';
        button.disabled = false;
      }
    } catch {
      status.textContent = 'Bridge local hors ligne';
      status.className = 'provider-status warn';
      button.textContent = 'Se connecter avec ChatGPT';
      button.disabled = false;
    }
  }

  async function connectCodex() {
    const button = $('connect-codex');
    const status = $('codex-status');
    button.disabled = true;
    button.textContent = 'Ouverture OAuth…';
    try {
      const response = await bridgeFetch('/login', { method: 'POST' });
      const data = response.data || {};
      if (!response.ok) throw new Error(response.error || data.error || 'Connexion Codex impossible.');
      if (data.connected) {
        await refreshCodex();
        return;
      }
      if (!data.authUrl) throw new Error('Codex n’a pas renvoyé de lien OAuth ChatGPT.');
      await chrome.tabs.create({ url: data.authUrl });
      status.textContent = 'OAuth ChatGPT ouvert dans un nouvel onglet…';
      status.className = 'provider-status warn';
      for (let i = 0; i < 120; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const account = await bridgeFetch('/account').catch(() => null);
        if (account?.ok && account.data?.connected) break;
      }
      await refreshCodex();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'provider-status warn';
      button.disabled = false;
      button.textContent = 'Se connecter avec ChatGPT';
    }
  }

  async function refreshGemini() {
    settings = readForm();
    const status = $('gemini-status');
    status.textContent = 'Vérification…';
    status.className = 'provider-status muted';
    try {
      const response = await bridgeFetch(`/gemini/status?mode=${encodeURIComponent(settings.geminiAuthMode)}`);
      const data = response.data || {};
      if (response.ok && data.connected) {
        if (settings.geminiAuthMode === 'vertex') {
          status.textContent = data.email ? `Google connecté · ${data.email}` : 'Google Cloud OAuth connecté';
        } else {
          status.textContent = 'Clé Gemini API configurée';
        }
        status.className = 'provider-status';
      } else {
        status.textContent = settings.geminiAuthMode === 'vertex'
          ? (data.error ? 'Google Cloud OAuth non connecté' : 'Google Cloud OAuth non connecté')
          : 'Clé Gemini API non configurée';
        status.className = 'provider-status warn';
      }
    } catch {
      status.textContent = 'Bridge local hors ligne';
      status.className = 'provider-status warn';
    }
  }

  async function connectGeminiGoogle() {
    const button = $('connect-gemini-google');
    const status = $('gemini-status');
    button.disabled = true;
    button.textContent = 'Ouverture OAuth…';
    try {
      const response = await bridgeFetch('/gemini/login', { method: 'POST' });
      if (!response.ok) throw new Error(response.error || response.data?.error || 'Connexion Google impossible.');
      status.textContent = 'Connexion Google ouverte dans le navigateur…';
      status.className = 'provider-status warn';
      for (let i = 0; i < 120; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const check = await bridgeFetch('/gemini/status?mode=vertex').catch(() => null);
        if (check?.ok && check.data?.connected) break;
      }
      await refreshGemini();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'provider-status warn';
    } finally {
      button.disabled = false;
      button.textContent = 'Se connecter avec Google';
    }
  }

  async function saveGeminiApiKey(clear = false) {
    const input = $('gemini-api-key');
    const key = clear ? '' : input.value.trim();
    if (!clear && !key) {
      $('gemini-status').textContent = 'Colle une clé Gemini API avant de l’enregistrer.';
      $('gemini-status').className = 'provider-status warn';
      return;
    }
    const response = await bridgeFetch('/gemini/api-key', {
      method: 'POST',
      body: { apiKey: key },
    });
    if (!response.ok) {
      $('gemini-status').textContent = response.error || 'Impossible d’enregistrer la clé.';
      $('gemini-status').className = 'provider-status warn';
      return;
    }
    input.value = '';
    await refreshGemini();
  }

  async function clearHistory() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter(key => key.startsWith('pa-history:'));
    if (keys.length) await chrome.storage.local.remove(keys);
    const button = $('clear-history');
    const original = button.textContent;
    button.textContent = 'Historique effacé';
    setTimeout(() => { button.textContent = original; }, 1500);
  }

  async function resetSettings() {
    writeForm(DEFAULTS);
    await chrome.storage.sync.set(DEFAULTS);
    setSaveState('Paramètres réinitialisés', 'ok');
    await refreshGemini();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await Promise.all([refreshCodex(), refreshGemini()]);

    document.querySelectorAll('select, input[type="checkbox"], input[name="provider"]').forEach(control => {
      control.addEventListener('change', async () => {
        scheduleSave();
        if (control.id === 'gemini-auth-mode') await refreshGemini();
      });
    });
    $('gemini-project').addEventListener('input', scheduleSave);
    $('gemini-location').addEventListener('input', scheduleSave);

    $('connect-codex').addEventListener('click', connectCodex);
    $('refresh-codex').addEventListener('click', refreshCodex);
    $('connect-gemini-google').addEventListener('click', connectGeminiGoogle);
    $('refresh-gemini').addEventListener('click', refreshGemini);
    $('save-gemini-api-key').addEventListener('click', () => saveGeminiApiKey(false));
    $('clear-gemini-api-key').addEventListener('click', () => saveGeminiApiKey(true));
    $('open-google-cloud').addEventListener('click', () => chrome.tabs.create({ url: 'https://console.cloud.google.com/' }));
    $('open-ai-studio').addEventListener('click', () => chrome.tabs.create({ url: 'https://aistudio.google.com/apikey' }));
    $('clear-history').addEventListener('click', clearHistory);
    $('reset-settings').addEventListener('click', resetSettings);
  });
})();
