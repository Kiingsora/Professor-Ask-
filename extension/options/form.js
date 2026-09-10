import { $, DEFAULTS, store } from './core.js';

export function setSaveState(text, kind = '') {
  const element = $('save-state');
  element.textContent = text;
  element.className = `save-state ${kind}`.trim();
}

export function setProviderStatus(provider, text, kind = 'muted') {
  const element = $(`${provider}-status`);
  element.textContent = text;
  element.className = `provider-status ${kind}`.trim();
}

export function setProviderPanels() {
  const provider = store.settings.provider || 'codex';
  $('codex-panel').hidden = provider !== 'codex';
  $('antigravity-panel').hidden = provider !== 'antigravity';
  document.querySelectorAll('[data-provider-card]').forEach(card => {
    card.classList.toggle('selected', card.dataset.providerCard === provider);
  });
}

export function readForm() {
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

export function writeForm(value) {
  store.settings = { ...DEFAULTS, ...value };
  const providerInput = document.querySelector(`input[name="provider"][value="${store.settings.provider}"]`);
  if (providerInput) providerInput.checked = true;

  $('response-language').value = store.settings.responseLanguage;
  $('response-style').value = store.settings.responseStyle;
  $('web-search').value = store.settings.webSearch;
  $('pause-on-question').checked = !!store.settings.pauseOnQuestion;
  $('context-seconds').value = String(store.settings.contextSeconds);
  $('transcript-language').value = store.settings.transcriptLanguage;
  $('include-metadata').checked = !!store.settings.includeMetadata;
  $('theme').value = store.settings.theme;
  $('panel-size').value = store.settings.panelSize;
  $('remember-history').checked = !!store.settings.rememberHistory;
  $('history-limit').value = String(store.settings.historyLimit);
  setProviderPanels();
}

export function updateCodexEfforts() {
  const modelId = $('codex-model').value;
  const effortSelect = $('codex-effort');
  const model = store.modelCatalogs.codex.find(item => item.id === modelId);
  const efforts = model?.efforts || [];
  const preferred = store.settings.codexEffort || 'auto';

  effortSelect.innerHTML = '<option value="auto">Automatique</option>';
  for (const effort of efforts) {
    const option = document.createElement('option');
    option.value = effort;
    option.textContent = effort.charAt(0).toUpperCase() + effort.slice(1);
    effortSelect.appendChild(option);
  }
  effortSelect.value = [...effortSelect.options].some(option => option.value === preferred) ? preferred : 'auto';
}

export function populateModels(provider, models) {
  store.modelCatalogs[provider] = Array.isArray(models) ? models : [];
  const select = $(provider === 'codex' ? 'codex-model' : 'antigravity-model');
  const savedValue = provider === 'codex' ? store.settings.codexModel : store.settings.antigravityModel;
  select.innerHTML = '<option value="auto">Automatique</option>';

  for (const model of store.modelCatalogs[provider]) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label || model.id;
    select.appendChild(option);
  }

  select.value = [...select.options].some(option => option.value === savedValue) ? savedValue : 'auto';
  if (provider === 'codex') updateCodexEfforts();
}
