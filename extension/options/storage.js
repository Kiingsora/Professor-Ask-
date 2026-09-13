import { $, DEFAULTS, ext, store } from './core.js';
import { populateModels, readForm, setProviderPanels, setSaveState, writeForm } from './form.js';

export async function loadSettings() {
  const saved = await ext.storage.sync.get(DEFAULTS);
  writeForm(saved);
  setSaveState('Enregistré', 'ok');
}

export function scheduleSave() {
  store.settings = { ...store.settings, ...readForm() };
  setProviderPanels();
  setSaveState('Enregistrement…', 'dirty');
  clearTimeout(store.saveTimer);

  store.saveTimer = setTimeout(async () => {
    await ext.storage.sync.set(store.settings);
    setSaveState('Enregistré', 'ok');
  }, 180);
}

export async function clearHistory() {
  const all = await ext.storage.local.get(null);
  const keys = Object.keys(all).filter(key => key.startsWith('pa-history:'));
  if (keys.length) await ext.storage.local.remove(keys);

  const button = $('clear-history');
  const original = button.textContent;
  button.textContent = 'Historique effacé';
  setTimeout(() => { button.textContent = original; }, 1500);
}

export async function resetSettings() {
  store.settings = { ...DEFAULTS };
  writeForm(store.settings);
  populateModels('codex', store.modelCatalogs.codex);
  populateModels('antigravity', store.modelCatalogs.antigravity);
  await ext.storage.sync.set(store.settings);
  setSaveState('Paramètres réinitialisés', 'ok');
}
