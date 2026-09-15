import { $, openExternal, providerRequest, store } from './core.js';
import { populateModels, setProviderStatus } from './form.js';

function setCodexDeviceCode(userCode = '') {
  const panel = $('codex-device-code-panel');
  const code = $('codex-user-code');
  if (!panel || !code) return;

  const value = String(userCode || '').trim();
  code.textContent = value;
  panel.hidden = !value;
}

function apiProviderBody(extra = {}) {
  return { apiProvider: store.settings.apiProvider || 'gemini', ...extra };
}

function selectedApiLabel() {
  return $('api-provider')?.selectedOptions?.[0]?.textContent?.trim() || 'API';
}

export async function loadModels(provider) {
  const options = provider === 'api' ? { body: apiProviderBody() } : undefined;
  const response = await providerRequest(`/providers/${provider}/models`, options);
  if (!response.ok) throw new Error(response.error || response.data?.error || 'Impossible de charger les modèles.');
  populateModels(provider, response.data?.models || []);
}

export async function refreshProvider(provider, { withModels = true } = {}) {
  setProviderStatus(provider, 'Vérification…', 'muted');
  const options = provider === 'api' ? { body: apiProviderBody() } : undefined;
  const response = await providerRequest(`/providers/${provider}/status`, options).catch(error => ({ ok: false, error: error.message }));
  const data = response?.data || {};

  if (!response?.ok) {
    if (provider === 'codex') setCodexDeviceCode('');
    setProviderStatus(provider, response?.error || 'Fournisseur indisponible', 'warn');
    return false;
  }

  if (data.pending && provider === 'codex') {
    setCodexDeviceCode(data.userCode || '');
    const error = data.error ? ` · ${data.error}` : '';
    setProviderStatus(provider, `Connexion ChatGPT en attente${error}`, 'warn');
    return false;
  }

  if (!data.connected) {
    if (provider === 'codex') setCodexDeviceCode('');
    if (provider === 'api') populateModels('api', []);
    setProviderStatus(provider, provider === 'api' ? `Aucune clé ${selectedApiLabel()} enregistrée` : (data.error || 'Non connecté'), 'warn');
    return false;
  }

  if (provider === 'codex') {
    setCodexDeviceCode('');
    const email = data.account?.email ? ` · ${data.account.email}` : '';
    const plan = data.account?.plan_type || data.account?.planType;
    setProviderStatus(provider, `Connecté${email}${plan ? ` · ${plan}` : ''}`, '');
  } else {
    setProviderStatus(provider, `Clé ${data.providerLabel || selectedApiLabel()} enregistrée`, '');
  }

  if (withModels) {
    try {
      await loadModels(provider);
    } catch (error) {
      setProviderStatus(provider, provider === 'api'
        ? `Clé enregistrée · modèles indisponibles : ${error.message}`
        : `Connecté · modèles indisponibles : ${error.message}`, 'warn');
    }
  }
  return true;
}

export async function connectProvider(provider) {
  const button = $(`connect-${provider}`);
  button.disabled = true;
  button.textContent = provider === 'codex' ? 'Ouverture ChatGPT…' : 'Enregistrement…';
  setProviderStatus(provider, provider === 'codex' ? 'Démarrage de la connexion…' : 'Enregistrement de la clé…', 'warn');

  try {
    if (provider === 'api') {
      const input = $('api-key');
      const apiKey = input?.value?.trim() || '';
      if (!apiKey) throw new Error(`Saisis ta clé API ${selectedApiLabel()}.`);

      const response = await providerRequest('/providers/api/login', {
        method: 'POST',
        body: apiProviderBody({ apiKey }),
      });
      const data = response.data || {};
      if (!response.ok || !data.connected) throw new Error(response.error || data.error || 'Impossible d’enregistrer la clé API.');

      input.value = '';
      setProviderStatus('api', `Clé ${data.providerLabel || selectedApiLabel()} enregistrée`, '');
      try {
        await loadModels('api');
      } catch (error) {
        setProviderStatus('api', `Clé enregistrée · modèles indisponibles : ${error.message}`, 'warn');
      }
      return;
    }

    const response = await providerRequest('/providers/codex/login', { method: 'POST' });
    const data = response.data || {};
    if (!response.ok) throw new Error(response.error || data.error || 'Impossible de lancer la connexion.');

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
    button.textContent = provider === 'codex' ? 'Se connecter avec ChatGPT' : 'Enregistrer la clé';
  }
}

export async function logoutProvider(provider) {
  const options = provider === 'api'
    ? { method: 'POST', body: apiProviderBody() }
    : { method: 'POST' };
  const response = await providerRequest(`/providers/${provider}/logout`, options);
  if (!response.ok) {
    setProviderStatus(provider, response.error || response.data?.error || 'Déconnexion impossible.', 'warn');
    return;
  }
  if (provider === 'codex') setCodexDeviceCode('');
  populateModels(provider, []);
  setProviderStatus(provider, provider === 'api' ? `Clé ${selectedApiLabel()} supprimée` : 'Déconnecté', 'warn');
}
