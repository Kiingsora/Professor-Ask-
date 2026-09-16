import { apiProviderConfig, apiProviderList } from './config.js';
import { clearModelCache, listModels, resolveModel } from './models.js';
import { deleteApiKey, getApiKey, setApiKey } from './storage.js';
import { chatWithApiProvider } from './transport.js';
import { buildProfessorPrompt } from '../shared/prompt.js';

function providerId(body = {}) {
  return apiProviderConfig(body.apiProvider || body.settings?.apiProvider).id;
}

function apiPrompt(payload) {
  return buildProfessorPrompt({
    ...payload,
    settings: {
      ...(payload.settings || {}),
      webSearch: 'off',
    },
  });
}

export async function status(body = {}) {
  const provider = providerId(body);
  const config = apiProviderConfig(provider);
  const key = await getApiKey(provider);
  return {
    installed: true,
    connected: !!key,
    provider,
    providerLabel: config.label,
    availableProviders: apiProviderList(),
    transport: 'direct-api-key',
  };
}

export async function login(body = {}) {
  const provider = providerId(body);
  const config = apiProviderConfig(provider);
  const key = String(body.apiKey || '').trim();
  if (key.length < 8) throw new Error(`Saisis une clé API ${config.label} valide.`);

  await setApiKey(provider, key);
  clearModelCache(provider);
  return { connected: true, provider, providerLabel: config.label };
}

export async function logout(body = {}) {
  const provider = providerId(body);
  await deleteApiKey(provider);
  clearModelCache(provider);
  return { connected: false, provider };
}

export async function models(body = {}) {
  const provider = providerId(body);
  const config = apiProviderConfig(provider);
  const key = await getApiKey(provider);
  if (!key) throw new Error(`Aucune clé API ${config.label} n’est enregistrée.`);

  return { models: await listModels(provider, key), provider };
}

export async function chat(payload = {}) {
  const provider = providerId(payload.settings || payload);
  const config = apiProviderConfig(provider);
  const key = await getApiKey(provider);
  if (!key) throw new Error(`Aucune clé API ${config.label} n’est enregistrée. Ouvre les paramètres de Professor Ask.`);

  const model = await resolveModel(provider, payload.settings?.apiModel, key);
  return chatWithApiProvider(
    provider,
    config,
    key,
    model,
    apiPrompt(payload),
    payload.settings?.responseStyle,
  );
}

export const apiKeyProvider = {
  status,
  login,
  logout,
  models,
  chat,
};
