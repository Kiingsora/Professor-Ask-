import {
  ANTIGRAVITY_CHAT_ENDPOINTS,
  antigravityHeaders,
} from './config.js';
import { getValidAuth } from './auth.js';
import { ensureProjectContext } from './project.js';

async function responseError(response) {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const data = JSON.parse(text);
    return data?.error?.message || data?.error?.status || data?.message || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

async function requestOnce(endpoint, path, auth, projectId, body) {
  return fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: {
      ...antigravityHeaders(),
      Authorization: `Bearer ${auth.accessToken}`,
    },
    body: JSON.stringify(typeof body === 'function' ? body(projectId) : body),
  });
}

export async function antigravityJsonRequest(path, body, { endpoints = ANTIGRAVITY_CHAT_ENDPOINTS } = {}) {
  let auth = await getValidAuth();
  if (!auth) throw new Error('Antigravity n’est pas connecté. Ouvre les paramètres et connecte ton compte Google.');
  let context = await ensureProjectContext(auth);
  auth = context.auth;

  let refreshed = false;
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      let response = await requestOnce(endpoint, path, auth, context.projectId, body);
      if (response.status === 401 && !refreshed) {
        auth = await getValidAuth({ forceRefresh: true });
        if (!auth) throw new Error('Session Antigravity expirée.');
        context = await ensureProjectContext(auth);
        refreshed = true;
        response = await requestOnce(endpoint, path, context.auth, context.projectId, body);
      }

      if (response.ok) {
        return {
          data: await response.json(),
          projectId: context.projectId,
          endpoint,
        };
      }
      errors.push(`${endpoint}: ${await responseError(response)}`);
    } catch (error) {
      errors.push(`${endpoint}: ${error?.message || String(error)}`);
    }
  }

  throw new Error(`Antigravity a refusé la requête. ${errors.join(' · ')}`);
}
