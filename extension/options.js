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

  const CODEX_SPARK_MODEL = {
    id: 'gpt-5.3-codex-spark',
    label: 'GPT-5.3 Codex Spark',
    isDefault: false,
    defaultEffort: null,
    efforts: [],
  };

  const $ = id => document.getElementById(id);
  let settings = { ...DEFAULTS };
  let saveTimer = null;
  const modelCatalogs = { codex: [], antigravity: [] };

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

  function openExternal(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'OPEN_EXTERNAL', url }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || 'Impossible d’ouvrir le lien.'));
        resolve();
      });
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
    $('antigravity-panel').hidden = provider !== 'antigravity';
    document.querySelectorAll('[data-provider-card]').forEach(card => {
      card.classList.toggle('selected', card.dataset.providerCard === provider);
    });
  }

  function readForm() {
    return {
      provider: document.querySelector('input[name="provider"]:checked')?.value || 'codex',
      codexModel: $('codex-model').value || 'auto',
      codexEffort: $('codex-effort').value || 'auto',
      antigravityModel: $('antigravity-model').value || 'auto',
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
    settings = { ...settings, ...readForm() };
    setProviderPanels();
    setSaveState('Enregistrement…', 'dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await chrome.storage.sync.set(settings);
      setSaveState('Enregistré', 'ok');
    }, 180);
  }

  function setProviderStatus(provider, text, kind = 'muted') {
    const el = $(`${provider}-status`);
    el.textContent = text;
    el.className = `provider-status ${kind}`.trim();
  }

  function normalizeModelCatalog(provider, models) {
    const catalog = Array.isArray(models) ? [...models] : [];
    if (provider === 'codex' && !catalog.some(model => model?.id === CODEX_SPARK_MODEL.id)) {
      catalog.unshift({ ...CODEX_SPARK_MODEL });
    }
    return catalog;
  }

  function populateModels(provider, models) {
    modelCatalogs[provider] = normalizeModelCatalog(provider, models);
    const select = $(provider === 'codex' ? 'codex-model' : 'antigravity-model');
    const savedValue = provider === 'codex' ? settings.codexModel : settings.antigravityModel;
    select.innerHTML = '<option value="auto">Automatique</option>';

    for (const model of modelCatalogs[provider]) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.label || model.id;
      select.appendChild(option);
    }

    if ([...select.options].some(option => option.value === savedValue)) {
      select.value = savedValue;
    } else {
      select.value = 'auto';
    }

    if (provider === 'codex') updateCodexEfforts();
  }

  function updateCodexEfforts() {
    const modelId = $('codex-model').value;
    const effortSelect = $('codex-effort');
    const model = modelCatalogs.codex.find(item => item.id === modelId);
    const efforts = model?.efforts || [];
    const preferred = settings.codexEffort || 'auto';

    effortSelect.innerHTML = '<option value="auto">Automatique</option>';
    for (const effort of efforts) {
      const option = document.createElement('option');
      option.value = effort;
      option.textContent = effort.charAt(0).toUpperCase() + effort.slice(1);
      effortSelect.appendChild(option);
    }

    if ([...effortSelect.options].some(option => option.value === preferred)) {
      effortSelect.value = preferred;
    } else {
      effortSelect.value = 'auto';
    }
  }

  async function loadModels(provider) {
    const response = await bridgeFetch(`/providers/${provider}/models`);
    if (!response.ok) throw new Error(response.error || response.data?.error || 'Impossible de charger les modèles.');
    populateModels(provider, response.data?.models || []);
  }

  async function refreshProvider(provider, { withModels = true } = {}) {
    setProviderStatus(provider, 'Vérification…', 'muted');
    const response = await bridgeFetch(`/providers/${provider}/status`).catch(error => ({ ok: false, error: error.message }));
    const data = response?.data || {};

    if (!response?.ok) {
      setProviderStatus(provider, response?.error || 'Fournisseur indisponible', 'warn');
      return false;
    }

    if (provider === 'codex' && data.pending) {
      const code = data.userCode ? ` · code ${data.userCode}` : '';
      const error = data.error ? ` · ${data.error}` : '';
      setProviderStatus(provider, `Connexion ChatGPT en attente${code}${error}`, 'warn');
      return false;
    }

    if (!data.installed) {
      setProviderStatus(provider, provider === 'codex' ? 'Codex indisponible' : 'Antigravity CLI non installé', 'warn');
      return false;
    }

    if (!data.connected) {
      setProviderStatus(provider, data.error || 'Non connecté', 'warn');
      return false;
    }

    if (provider === 'codex') {
      const email = data.account?.email ? ` · ${data.account.email}` : '';
      const plan = data.account?.plan_type || data.account?.planType;
      setProviderStatus(provider, `Connecté${email}${plan ? ` · ${plan}` : ''}`, '');
    } else {
      setProviderStatus(provider, 'Compte Google Antigravity connecté', '');
    }

    if (withModels) {
      try {
        await loadModels(provider);
      } catch (error) {
        setProviderStatus(provider, `Connecté · modèles indisponibles : ${error.message}`, 'warn');
      }
    }
    return true;
  }

  async function connectProvider(provider) {
    const button = $(`connect-${provider}`);
    button.disabled = true;
    button.textContent = provider === 'codex' ? 'Ouverture ChatGPT…' : 'Ouverture Antigravity…';
    setProviderStatus(provider, 'Démarrage de la connexion…', 'warn');

    try {
      const response = await bridgeFetch(`/providers/${provider}/login`, { method: 'POST' });
      const data = response.data || {};
      if (!response.ok) throw new Error(response.error || data.error || 'Impossible de lancer la connexion.');

      if (provider === 'codex' && data.authUrl && !data.opened) {
        await openExternal(data.authUrl);
      }

      setProviderStatus(
        provider,
        provider === 'codex'
          ? `Connexion ChatGPT ouverte${data.userCode ? ` · entre le code ${data.userCode}` : ''}`
          : 'Antigravity ouvert. Termine le Google OAuth dans le navigateur…',
        'warn',
      );

      for (let i = 0; i < 180; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const connected = await refreshProvider(provider, { withModels: false });
        if (connected) {
          await loadModels(provider).catch(() => {});
          break;
        }
      }
    } catch (error) {
      setProviderStatus(provider, error.message, 'warn');
    } finally {
      button.disabled = false;
      button.textContent = provider === 'codex' ? 'Se connecter avec ChatGPT' : 'Se connecter avec Google';
    }
  }

  async function logoutProvider(provider) {
    const response = await bridgeFetch(`/providers/${provider}/logout`, { method: 'POST' });
    if (!response.ok) {
      setProviderStatus(provider, response.error || response.data?.error || 'Déconnexion impossible.', 'warn');
      return;
    }
    populateModels(provider, []);
    setProviderStatus(provider, 'Déconnecté', 'warn');
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
    settings = { ...DEFAULTS };
    writeForm(settings);
    populateModels('codex', modelCatalogs.codex);
    populateModels('antigravity', modelCatalogs.antigravity);
    await chrome.storage.sync.set(settings);
    setSaveState('Paramètres réinitialisés', 'ok');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await Promise.all([
      refreshProvider('codex').catch(() => false),
      refreshProvider('antigravity').catch(() => false),
    ]);

    document.querySelectorAll('select, input[type="checkbox"], input[name="provider"]').forEach(control => {
      control.addEventListener('change', () => {
        if (control.id === 'codex-model') {
          settings.codexModel = control.value;
          updateCodexEfforts();
        }
        scheduleSave();
      });
    });

    $('connect-codex').addEventListener('click', () => connectProvider('codex'));
    $('refresh-codex').addEventListener('click', () => refreshProvider('codex'));
    $('logout-codex').addEventListener('click', () => logoutProvider('codex'));

    $('connect-antigravity').addEventListener('click', () => connectProvider('antigravity'));
    $('refresh-antigravity').addEventListener('click', () => refreshProvider('antigravity'));
    $('logout-antigravity').addEventListener('click', () => logoutProvider('antigravity'));
    $('open-antigravity-docs').addEventListener('click', () => openExternal('https://antigravity.google/docs/cli/install/'));

    $('clear-history').addEventListener('click', clearHistory);
    $('reset-settings').addEventListener('click', resetSettings);
  });
})();
