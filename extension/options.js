(() => {
  const API = 'http://127.0.0.1:43119';
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
  };

  const $ = id => document.getElementById(id);
  let settings = { ...DEFAULTS };
  let saveTimer = null;

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
      const response = await fetch(`${API}/account`);
      const data = await response.json();
      if (data.connected) {
        const email = data.account?.email ? ` · ${data.account.email}` : '';
        status.textContent = `Connecté${email}`;
        status.className = 'provider-status';
        button.textContent = 'Codex connecté';
        button.disabled = true;
      } else {
        status.textContent = data.bridgeError ? 'Bridge/Codex indisponible' : 'Non connecté';
        status.className = 'provider-status warn';
        button.textContent = 'Connecter Codex';
        button.disabled = false;
      }
    } catch {
      status.textContent = 'Bridge local hors ligne';
      status.className = 'provider-status warn';
      button.textContent = 'Connecter Codex';
      button.disabled = false;
    }
  }

  async function connectCodex() {
    const button = $('connect-codex');
    const status = $('codex-status');
    button.disabled = true;
    button.textContent = 'Ouverture…';
    try {
      const response = await fetch(`${API}/login`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Connexion Codex impossible.');
      if (data.connected) {
        await refreshCodex();
        return;
      }
      if (!data.authUrl) throw new Error('Codex n’a pas renvoyé de lien de connexion.');
      await chrome.tabs.create({ url: data.authUrl });
      status.textContent = 'Connexion ouverte dans un nouvel onglet…';
      status.className = 'provider-status warn';
      for (let i = 0; i < 90; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          const account = await fetch(`${API}/account`).then(r => r.json());
          if (account.connected) break;
        } catch {}
      }
      await refreshCodex();
    } catch (error) {
      status.textContent = error.message;
      status.className = 'provider-status warn';
      button.disabled = false;
      button.textContent = 'Connecter Codex';
    }
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
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await refreshCodex();

    document.querySelectorAll('select, input[type="checkbox"], input[name="provider"]').forEach(control => {
      control.addEventListener('change', scheduleSave);
    });

    $('connect-codex').addEventListener('click', connectCodex);
    $('refresh-codex').addEventListener('click', refreshCodex);
    $('open-gemini').addEventListener('click', () => chrome.tabs.create({ url: 'https://gemini.google.com/app' }));
    $('open-gemini-docs').addEventListener('click', () => chrome.tabs.create({ url: 'https://github.com/google-gemini/gemini-cli' }));
    $('clear-history').addEventListener('click', clearHistory);
    $('reset-settings').addEventListener('click', resetSettings);
  });
})();
