import { $, ext, store } from './core.js';
import { updateCodexEfforts } from './form.js';
import { connectProvider, logoutProvider, refreshProvider } from './providers.js';
import { clearHistory, loadSettings, resetSettings, scheduleSave } from './storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const footerVersion = document.querySelector('.footer-note span:last-child');
  if (footerVersion) footerVersion.textContent = `Professor Ask v${ext.runtime.getManifest().version}`;

  const extensionId = $('antigravity-extension-id');
  if (extensionId) extensionId.textContent = ext.runtime.id || '(indisponible)';

  const redirect = $('antigravity-redirect-uri');
  if (redirect) {
    try {
      redirect.textContent = ext.identity?.getRedirectURL?.('antigravity') || '(API Identity indisponible)';
    } catch {
      redirect.textContent = '(API Identity indisponible)';
    }
  }

  await loadSettings();
  await Promise.all([
    refreshProvider('codex').catch(() => false),
    refreshProvider('antigravity').catch(() => false),
  ]);

  document.querySelectorAll('select, input[type="text"], input[type="checkbox"], input[name="provider"]').forEach(control => {
    control.addEventListener('change', () => {
      if (control.id === 'codex-model') {
        store.settings.codexModel = control.value;
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
  $('clear-history').addEventListener('click', clearHistory);
  $('reset-settings').addEventListener('click', resetSettings);
});
