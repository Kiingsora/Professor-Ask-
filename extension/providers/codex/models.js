import { MODEL_CACHE_MS, MODELS_URL, SPARK_MODEL, SPARK_MODEL_ID } from './config.js';
import { getValidAuth } from './auth.js';
import { authorizedFetch } from './client.js';
import { accountInfo } from './identity.js';
import { parseResponse, responseError } from './response.js';

let cache = { accountId: null, at: 0, models: [] };

function normalizeEfforts(item) {
  const raw = item?.supported_reasoning_levels
    || item?.supportedReasoningLevels
    || item?.supported_reasoning_efforts
    || item?.supportedReasoningEfforts
    || item?.reasoning_efforts
    || [];
  if (!Array.isArray(raw)) return [];

  return [...new Set(raw.map(entry => {
    if (typeof entry === 'string') return entry;
    return entry?.effort || entry?.reasoning_effort || entry?.reasoningEffort || null;
  }).filter(Boolean))];
}

function normalizeDefaultEffort(item) {
  return item?.default_reasoning_level
    || item?.defaultReasoningLevel
    || item?.default_reasoning_effort
    || item?.defaultReasoningEffort
    || null;
}

function withSparkFallback(models) {
  if (models.some(model => model.id === SPARK_MODEL.id)) return models;
  return [...models, { ...SPARK_MODEL }];
}

export async function models({ force = false } = {}) {
  const auth = await getValidAuth();
  if (!auth) throw new Error('Compte ChatGPT/Codex non connecté.');

  const accountId = accountInfo(auth).account_id || 'unknown';
  if (!force && cache.accountId === accountId && cache.models.length && Date.now() - cache.at < MODEL_CACHE_MS) {
    return { models: cache.models };
  }

  const response = await authorizedFetch(MODELS_URL, { method: 'GET' });
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(responseError(data, `Impossible de récupérer les modèles Codex (${response.status}).`));
  }

  const entries = Array.isArray(data?.models) ? data.models : [];
  const normalized = entries
    .filter(item => item && (item.slug || item.id || item.model))
    .filter(item => !['hide', 'hidden'].includes(String(item.visibility || '').toLowerCase()))
    .sort((a, b) => (Number(a.priority) || 10000) - (Number(b.priority) || 10000))
    .map(item => {
      const id = item.slug || item.id || item.model;
      return {
        id,
        label: item.display_name || item.displayName || item.name || id,
        isDefault: !!(item.is_default || item.isDefault),
        defaultEffort: normalizeDefaultEffort(item),
        efforts: normalizeEfforts(item),
      };
    });

  const result = withSparkFallback(normalized);
  cache = { accountId, at: Date.now(), models: result };
  return { models: result };
}

export async function resolveModel(selected) {
  if (selected && selected !== 'auto') return selected;

  try {
    const catalog = (await models()).models;
    return catalog.find(item => item.isDefault)?.id
      || catalog.find(item => item.id !== SPARK_MODEL_ID)?.id
      || catalog[0]?.id
      || 'gpt-5.6-sol';
  } catch {
    return 'gpt-5.6-sol';
  }
}
