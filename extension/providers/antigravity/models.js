import {
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_FALLBACK_MODELS,
} from './config.js';
import { antigravityJsonRequest } from './client.js';

let cachedModels = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function normalizeModelId(value) {
  return String(value || '').replace(/^models\//, '').replace(/^antigravity-/, '').trim();
}

function normalizeModels(data) {
  const source = data?.models && typeof data.models === 'object' ? data.models : {};
  const seen = new Set();
  const result = [];

  for (const [key, entry] of Object.entries(source)) {
    const id = normalizeModelId(entry?.modelName || key);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, label: entry?.displayName || id });
  }

  return result;
}

export async function models({ force = false } = {}) {
  if (!force && cachedModels && Date.now() - cachedAt < CACHE_MS) return { models: cachedModels };

  try {
    const response = await antigravityJsonRequest(
      '/v1internal:fetchAvailableModels',
      projectId => ({ project: projectId }),
      { endpoints: [ANTIGRAVITY_ENDPOINT_PROD] },
    );
    const discovered = normalizeModels(response.data);
    cachedModels = discovered.length ? discovered : [...ANTIGRAVITY_FALLBACK_MODELS];
  } catch (error) {
    if (!cachedModels?.length) throw error;
  }

  cachedAt = Date.now();
  return { models: cachedModels };
}

export async function resolveModel(requested) {
  if (requested && requested !== 'auto') return normalizeModelId(requested);
  const catalog = (await models()).models;
  const preferred = [
    'gemini-3.5-flash',
    'gemini-3-flash',
    'gemini-3.1-pro',
    'gemini-3-pro-high',
  ];
  for (const id of preferred) {
    if (catalog.some(model => model.id === id)) return id;
  }
  return catalog[0]?.id || ANTIGRAVITY_FALLBACK_MODELS[0].id;
}

export function clearModelCache() {
  cachedModels = null;
  cachedAt = 0;
}
