import { $, DEFAULTS, store } from './core.js';

const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const EFFORT_LABELS = {
  none: 'Aucun',
  minimal: 'Minimal',
  low: 'Faible',
  medium: 'Moyen',
  high: 'Élevé',
  xhigh: 'Très élevé',
};

function effortLabel(value) {
  const normalized = String(value || '').toLowerCase();
  return EFFORT_LABELS[normalized] || (normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '');
}

function effectiveCodexModel() {
  const selected = $('codex-model')?.value || store.settings.codexModel || 'auto';
  if (selected !== 'auto') return store.modelCatalogs.codex.find(item => item.id === selected) || null;
  return store.modelCatalogs.codex.find(item => item.isDefault) || store.modelCatalogs.codex[0] || null;
}

export function setSaveState(text, kind = '') {
  const element = $('save-state');
  element.textContent = text;
  element.className = `save-state ${kind}`.trim();
}

export function setProviderStatus(provider, text, kind = 'muted') {
  const element = $(`${provider}-status`);
  if (!element) return;
  element.textContent = text;
  element.className = `provider-status ${kind}`.trim();
}

export function syncConditionalControls() {
  const selectedProvider = document.querySelector('input[name="provider"]:checked')?.value || store.settings.provider || 'codex';
  const webField = $('web-search-field');
  const webSearch = $('web-search');
  const webHelp = $('web-search-help');
  const codexActive = selectedProvider === 'codex';

  if (webField) webField.hidden = !codexActive;
  if (webSearch) webSearch.disabled = !codexActive;
  if (webHelp) webHelp.textContent = codexActive
    ? 'Codex peut rechercher sur le web. « Toujours » force une vérification web à chaque question.'
    : 'La recherche web intégrée n’est pas disponible avec les fournisseurs par clé API.';

  const rememberHistory = $('remember-history')?.checked ?? !!store.settings.rememberHistory;
  const historyLimitField = $('history-limit-field');
  const historyLimit = $('history-limit');
  if (historyLimitField) historyLimitField.hidden = !rememberHistory;
  if (historyLimit) historyLimit.disabled = !rememberHistory;
}

export function setProviderPanels() {
  const provider = store.settings.provider || 'codex';
  $('codex-panel').hidden = provider !== 'codex';
  $('api-panel').hidden = provider !== 'api';
  document.querySelectorAll('[data-provider-card]').forEach(card => {
    card.classList.toggle('selected', card.dataset.providerCard === provider);
  });
  syncConditionalControls();
}

export function readForm() {
  return {
    provider: document.querySelector('input[name="provider"]:checked')?.value || 'codex',
    codexModel: $('codex-model').value || 'auto',
    codexEffort: $('codex-effort').value || 'auto',
    apiProvider: $('api-provider').value || 'gemini',
    apiModel: $('api-model').value || 'auto',
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
  const migrated = { ...value };
  if (migrated.provider === 'antigravity') migrated.provider = 'api';
  store.settings = { ...DEFAULTS, ...migrated };

  const providerInput = document.querySelector(`input[name="provider"][value="${store.settings.provider}"]`);
  if (providerInput) providerInput.checked = true;

  $('api-provider').value = store.settings.apiProvider;
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
  const effortSelect = $('codex-effort');
  const help = $('codex-effort-help');
  const model = effectiveCodexModel();
  const preferred = store.settings.codexEffort || 'auto';
  const efforts = [...new Set([
    ...(Array.isArray(model?.efforts) ? model.efforts : []),
    model?.defaultEffort || null,
  ].filter(value => value && value !== 'auto'))]
    .sort((a, b) => {
      const ai = EFFORT_ORDER.indexOf(String(a).toLowerCase());
      const bi = EFFORT_ORDER.indexOf(String(b).toLowerCase());
      if (ai < 0 && bi < 0) return String(a).localeCompare(String(b));
      if (ai < 0) return 1;
      if (bi < 0) return -1;
      return ai - bi;
    });

  const defaultLabel = model?.defaultEffort ? ` (${effortLabel(model.defaultEffort)})` : '';
  effortSelect.innerHTML = `<option value="auto">Automatique${defaultLabel}</option>`;

  for (const effort of efforts) {
    const option = document.createElement('option');
    option.value = effort;
    option.textContent = effortLabel(effort);
    effortSelect.appendChild(option);
  }

  effortSelect.value = [...effortSelect.options].some(option => option.value === preferred) ? preferred : 'auto';
  effortSelect.disabled = !model || efforts.length === 0;

  if (help) {
    if (!model) {
      help.textContent = 'Connecte Codex et charge les modèles pour voir les niveaux de raisonnement disponibles.';
    } else if (!efforts.length) {
      help.textContent = `${model.label || model.id} ne permet pas de choisir manuellement l’effort de raisonnement.`;
    } else if (($('codex-model')?.value || 'auto') === 'auto') {
      help.textContent = `Le mode Automatique utilise actuellement ${model.label || model.id}. Tu peux choisir un effort parmi les niveaux réellement annoncés par ce modèle.`;
    } else {
      help.textContent = `Niveaux pris en charge par ${model.label || model.id}.`;
    }
  }
}

export function populateModels(provider, models) {
  store.modelCatalogs[provider] = Array.isArray(models) ? models : [];
  const select = $(provider === 'codex' ? 'codex-model' : 'api-model');
  const savedValue = provider === 'codex' ? store.settings.codexModel : store.settings.apiModel;
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
