import { $, openExternal, providerRequest } from './core.js';
import { populateModels, setProviderStatus } from './form.js';

function setCodexDeviceCode(userCode = '') {
  const panel = $('codex-device-code-panel');
  const code = $('codex-user-code');
  if (!panel || !code) return;

  const value = String(userCode || '').trim();
  code.textContent = value;
  panel.hidden = !value;
}

export async function loadModels(provider) {
  const response = await providerRequest(`/providers/${provider}/models`);
  if (!response.ok) throw new Error(response.error || response.data?.error || 'Impossible de charger les modèles.');
  populateModels(provider, response.data?.models || []);
}

export async function refreshProvider(provider, { withModels = true } = {}) {
  setProviderStatus(provider, 'Vérification…', 'muted');
  const response = await providerRequest(`/providers/${provider}/status`).catch(error => ({ ok: false, error: error.message }));
  const data = response?.data || {};

  if (!response?.ok) {
    if (provider === 'codex') setCodexDeviceCode('');
    setProviderStatus(provider, response?.error || 'Fournisseur indisponible', 'warn');
    return false;
  }

  if (data.pending) {
    if (provider === 'codex') {
      setCodexDeviceCode(data.userCode || '');
      const error = data.error ? ` · ${data.error}` : '';
      setProviderStatus(provider, `Connexion ChatGPT en attente${error}`, 'warn');
    } else {
      setProviderStatus(provider, data.error || 'Connexion Google Antigravity en attente…', 'warn');
    }
    return false;
  }

  if (!data.connected) {
    if (provider === 'codex') setCodexDeviceCode('');
    setProviderStatus(provider, data.error || 'Non connecté', 'warn');
    return false;
  }

  if (provider === 'codex') {
    setCodexDeviceCode('');
    const email = data.account?.email ? ` · ${data.account.email}` : '';
    const plan = data.account?.plan_type || data.account?.planType;
    setProviderStatus(provider, `Connecté${email}${plan ? ` · ${plan}` : ''}`, '');
  } else {
    const email = data.account?.email ? ` · ${data.account.email}` : '';
    setProviderStatus(provider, `Connecté à Antigravity${email}`, '');
  }

  if (withModels) {
    try { await loadModels(provider); }
    catch (error) { setProviderStatus(provider, `Connecté · modèles indisponibles : ${error.message}`, 'warn'); }
  }
  return true;
}

export async function connectProvider(provider) {
  const button = $(`connect-${provider}`);
  button.disabled = true;
  button.textContent = provider === 'codex' ? 'Ouverture ChatGPT…' : 'Ouverture Google…';
  setProviderStatus(provider, 'Démarrage de la connexion…', 'warn');

  try {
    const response = await providerRequest(`/providers/${provider}/login`, { method: 'POST' });
    const data = response.data || {};
    if (!response.ok) throw new Error(response.error || data.error || 'Impossible de lancer la connexion.');

    if (provider === 'antigravity') {
      if (!data.connected) throw new Error(data.error || 'La connexion Google Antigravity n’a pas abouti.');
      const email = data.account?.email ? ` · ${data.account.email}` : '';
      setProviderStatus(provider, `Connecté à Antigravity${email}`, '');
      await loadModels(provider).catch(error => {
        setProviderStatus(provider, `Connecté · modèles indisponibles : ${error.message}`, 'warn');
      });
      return;
    }

    setCodexDeviceCode(data.userCode || '');
    if (data.authUrl && !data.opened) await openExternal(data.authUrl);

    setProviderStatus(
      provider,
      data.userCode
        ? 'Connexion ChatGPT ouverte · copie le code affiché ci-dessous puis colle-le sur la page OpenAI.'
        : 'Connexion ChatGPT ouverte.',
      'warn',
    );

    if (data.alreadyConnected) {
      setCodexDeviceCode('');
      await loadModels(provider).catch(() => {});
      return;
    }

    for (let i = 0; i < 180; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const connected = await refreshProvider(provider, { withModels: false });
      if (connected) {
        await loadModels(provider).catch(() => {});
        break;
      }
    }
  } catch (error) {
    if (provider === 'codex') setCodexDeviceCode('');
    setProviderStatus(provider, error.message, 'warn');
  } finally {
    button.disabled = false;
    button.textContent = provider === 'codex' ? 'Se connecter avec ChatGPT' : 'Se connecter avec Google';
  }
}

export async function logoutProvider(provider) {
  const response = await providerRequest(`/providers/${provider}/logout`, { method: 'POST' });
  if (!response.ok) {
    setProviderStatus(provider, response.error || response.data?.error || 'Déconnexion impossible.', 'warn');
    return;
  }
  if (provider === 'codex') setCodexDeviceCode('');
  populateModels(provider, []);
  setProviderStatus(provider, 'Déconnecté', 'warn');
}
