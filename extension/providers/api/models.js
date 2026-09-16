import { apiProviderConfig } from './config.js';
import { headersFor, requestJson } from './transport.js';

const MODEL_CACHE_MS = 5 * 60 * 1000;
const modelCache = new Map();

function normalizeModelId(value) {
  return String(value || '').replace(/^models\//, '').trim();
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

export function clearModelCache(provider) {
  modelCache.delete(provider);
}

export async function listModels(provider, key) {
  const cached = modelCache.get(provider);
  if (cached && Date.now() - cached.at < MODEL_CACHE_MS) return cached.models;

  const config = apiProviderConfig(provider);
  const discovered = await fetchModels(provider, key);
  if (!discovered.length) throw new Error(`${config.label} n’a renvoyé aucun modèle de chat exploitable.`);

  modelCache.set(provider, { at: Date.now(), models: discovered });
  return discovered;
}

export async function resolveModel(provider, requested, key) {
  if (requested && requested !== 'auto') return normalizeModelId(requested);

  const catalog = await listModels(provider, key);
  const config = apiProviderConfig(provider);
  for (const preferred of config.preferredModels) {
    const exact = catalog.find(model => model.id === preferred);
    if (exact) return exact.id;
    const variant = catalog.find(model => model.id.startsWith(`${preferred}-`));
    if (variant) return variant.id;
  }
  return catalog[0].id;
}
