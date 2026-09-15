import { apiProviderConfig, apiProviderList } from './config.js';
import { deleteApiKey, getApiKey, setApiKey } from './storage.js';
import { buildProfessorPrompt } from '../shared/prompt.js';

const MODEL_CACHE_MS = 5 * 60 * 1000;
const modelCache = new Map();

function maxOutputTokens(style) {
  if (style === 'concise') return 1600;
  if (style === 'detailed') return 6000;
  return 3200;
}

function normalizeModelId(value) {
  return String(value || '').replace(/^models\//, '').trim();
}

function providerId(body = {}) {
  return apiProviderConfig(body.apiProvider || body.settings?.apiProvider).id;
}

function extractError(data, fallback) {
  return data?.error?.message || data?.error?.status || data?.error_description || data?.message || fallback;
}

async function requestJson(url, options = {}, fallback = 'Requête API refusée.') {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) throw new Error(extractError(data, `${fallback} HTTP ${response.status}`));
  return data;
}

function headersFor(provider, key, json = false) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';

  if (provider === 'gemini') {
    headers['x-goog-api-key'] = key;
  } else if (provider === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function isUsableModel(provider, id, entry) {
  if (!id) return false;
  if (provider === 'gemini') {
    const methods = Array.isArray(entry?.supportedGenerationMethods) ? entry.supportedGenerationMethods : [];
    return /^gemini-/i.test(id) && (!methods.length || methods.includes('generateContent'));
  }
  if (provider === 'anthropic') return /^claude-/i.test(id);
  if (provider === 'openai') return /^(gpt-|o\d|chatgpt-)/i.test(id);
  if (provider === 'mistral' && entry?.capabilities?.completion_chat === false) return false;
  return true;
}

function normalizeModels(provider, data) {
  const source = provider === 'gemini'
    ? (Array.isArray(data?.models) ? data.models : [])
    : (Array.isArray(data?.data) ? data.data : []);

  const seen = new Set();
  const models = [];
  for (const entry of source) {
    const id = normalizeModelId(entry?.id || entry?.name || entry?.model || entry?.modelName);
    if (!isUsableModel(provider, id, entry) || seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      label: entry?.display_name || entry?.displayName || entry?.name || id,
    });
  }

  return models.sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchModels(provider, key) {
  const config = apiProviderConfig(provider);
  const data = await requestJson(config.modelsUrl, {
    headers: headersFor(provider, key),
  }, `${config.label} a refusé la récupération des modèles.`);
  return normalizeModels(provider, data);
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
  modelCache.delete(provider);
  return { connected: true, provider, providerLabel: config.label };
}

export async function logout(body = {}) {
  const provider = providerId(body);
  await deleteApiKey(provider);
  modelCache.delete(provider);
  return { connected: false, provider };
}

export async function models(body = {}) {
  const provider = providerId(body);
  const config = apiProviderConfig(provider);
  const key = await getApiKey(provider);
  if (!key) throw new Error(`Aucune clé API ${config.label} n’est enregistrée.`);

  const cached = modelCache.get(provider);
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return { models: cached.models, provider };

  const discovered = await fetchModels(provider, key);
  if (!discovered.length) throw new Error(`${config.label} n’a renvoyé aucun modèle de chat exploitable.`);
  modelCache.set(provider, { at: Date.now(), models: discovered });
  return { models: discovered, provider };
}

async function resolveModel(provider, requested, key) {
  if (requested && requested !== 'auto') return normalizeModelId(requested);

  let catalog = modelCache.get(provider)?.models;
  if (!catalog?.length) {
    catalog = await fetchModels(provider, key);
    if (catalog.length) modelCache.set(provider, { at: Date.now(), models: catalog });
  }
  if (!catalog?.length) throw new Error(`Aucun modèle disponible pour ${apiProviderConfig(provider).label}.`);

  for (const preferred of apiProviderConfig(provider).preferredModels) {
    const exact = catalog.find(model => model.id === preferred);
    if (exact) return exact.id;
    const variant = catalog.find(model => model.id.startsWith(`${preferred}-`));
    if (variant) return variant.id;
  }
  return catalog[0].id;
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

async function chatOpenAiCompatible(provider, config, key, model, prompt) {
  const data = await requestJson(config.chatUrl, {
    method: 'POST',
    headers: headersFor(provider, key, true),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    }),
  }, `${config.label} a refusé la requête de chat.`);

  const content = data?.choices?.[0]?.message?.content;
  const answer = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.map(part => part?.text || '').join('').trim()
      : '';
  if (!answer) throw new Error(`${config.label} a terminé la réponse sans texte exploitable.`);
  return { answer, sources: [], model, usage: data?.usage || null };
}

async function chatAnthropic(config, key, model, prompt, style) {
  const data = await requestJson(config.chatUrl, {
    method: 'POST',
    headers: headersFor('anthropic', key, true),
    body: JSON.stringify({
      model,
      max_tokens: maxOutputTokens(style),
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 'Anthropic a refusé la requête de chat.');

  const answer = (Array.isArray(data?.content) ? data.content : [])
    .filter(part => part?.type === 'text' && typeof part?.text === 'string')
    .map(part => part.text)
    .join('')
    .trim();
  if (!answer) throw new Error('Anthropic a terminé la réponse sans texte exploitable.');
  return { answer, sources: [], model: data?.model || model, usage: data?.usage || null };
}

async function chatGemini(config, key, model, prompt, style) {
  const url = `${config.chatBaseUrl}/${encodeURIComponent(model)}:generateContent`;
  const data = await requestJson(url, {
    method: 'POST',
    headers: headersFor('gemini', key, true),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxOutputTokens(style) },
    }),
  }, 'Gemini a refusé la requête de chat.');

  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
  if (!answer) throw new Error('Gemini a terminé la réponse sans texte exploitable.');
  return { answer, sources: [], model, usage: data?.usageMetadata || null };
}

export async function chat(payload = {}) {
  const provider = providerId(payload.settings || payload);
  const config = apiProviderConfig(provider);
  const key = await getApiKey(provider);
  if (!key) throw new Error(`Aucune clé API ${config.label} n’est enregistrée. Ouvre les paramètres de Professor Ask.`);

  const model = await resolveModel(provider, payload.settings?.apiModel, key);
  const prompt = apiPrompt(payload);
  if (config.protocol === 'anthropic') {
    return chatAnthropic(config, key, model, prompt, payload.settings?.responseStyle);
  }
  if (config.protocol === 'gemini') {
    return chatGemini(config, key, model, prompt, payload.settings?.responseStyle);
  }
  return chatOpenAiCompatible(provider, config, key, model, prompt);
}

export const apiKeyProvider = {
  status,
  login,
  logout,
  models,
  chat,
};
