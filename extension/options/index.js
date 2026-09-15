import { $, ext, store } from './core.js';
import { populateModels, updateCodexEfforts } from './form.js';
import { connectProvider, logoutProvider, refreshProvider } from './providers.js';
import { clearHistory, loadSettings, resetSettings, scheduleSave } from './storage.js';

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

document.addEventListener('DOMContentLoaded', async () => {
  const footerVersion = document.querySelector('.footer-note span:last-child');
  if (footerVersion) footerVersion.textContent = `Professor Ask v${ext.runtime.getManifest().version}`;

  await loadSettings();
  await Promise.all([
    refreshProvider('codex').catch(() => false),
    refreshProvider('api').catch(() => false),
  ]);

  document.querySelectorAll('select, input[type="checkbox"], input[name="provider"]').forEach(control => {
    control.addEventListener('change', () => {
      if (control.id === 'codex-model') {
        store.settings.codexModel = control.value;
        updateCodexEfforts();
      }
      if (control.id === 'api-provider') {
        store.settings.apiProvider = control.value;
        store.settings.apiModel = 'auto';
        populateModels('api', []);
        scheduleSave();
        refreshProvider('api').catch(() => false);
        return;
      }
      if (control.id === 'api-model') store.settings.apiModel = control.value;
      scheduleSave();
    });
  });

  $('connect-codex').addEventListener('click', () => connectProvider('codex'));
  $('refresh-codex').addEventListener('click', () => refreshProvider('codex'));
  $('logout-codex').addEventListener('click', () => logoutProvider('codex'));
  $('copy-codex-code').addEventListener('click', async () => {
    const code = $('codex-user-code')?.textContent?.trim();
    if (!code) return;

    const button = $('copy-codex-code');
    const original = button.textContent;
    try {
      await copyText(code);
      button.textContent = 'Copié';
    } catch {
      button.textContent = 'Copie impossible';
    }
    setTimeout(() => { button.textContent = original; }, 1400);
  });

  $('connect-api').addEventListener('click', () => connectProvider('api'));
  $('refresh-api').addEventListener('click', () => refreshProvider('api'));
  $('logout-api').addEventListener('click', () => logoutProvider('api'));
  $('clear-history').addEventListener('click', clearHistory);
  $('reset-settings').addEventListener('click', resetSettings);
});
