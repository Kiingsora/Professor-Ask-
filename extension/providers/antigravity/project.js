import {
  ANTIGRAVITY_DEFAULT_PROJECT_ID,
  ANTIGRAVITY_PROJECT_ENDPOINTS,
  antigravityHeaders,
} from './config.js';
import { saveAuth } from './auth.js';

function metadata(projectId = '') {
  const value = {
    ideType: 'ANTIGRAVITY',
    platform: 'WINDOWS',
    pluginType: 'GEMINI',
  };
  if (projectId) value.duetProject = projectId;
  return value;
}

function extractProjectId(data) {
  const value = data?.cloudaicompanionProject;
  if (typeof value === 'string' && value) return value;
  if (typeof value?.id === 'string' && value.id) return value.id;
  return null;
}

function defaultTier(data) {
  const tiers = Array.isArray(data?.allowedTiers) ? data.allowedTiers : [];
  return tiers.find(tier => tier?.isDefault)?.id || tiers[0]?.id || data?.currentTier?.id || 'FREE';
}

async function post(endpoint, path, accessToken, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: {
      ...antigravityHeaders(),
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, status: response.status, data: null };
  return { ok: true, status: response.status, data: await response.json() };
}

async function loadProject(accessToken, projectHint = '') {
  for (const endpoint of ANTIGRAVITY_PROJECT_ENDPOINTS) {
    try {
      const result = await post(endpoint, '/v1internal:loadCodeAssist', accessToken, {
        metadata: metadata(projectHint),
      });
      if (result.ok) return result.data;
    } catch {
      // Try the next Antigravity endpoint.
    }
  }
  return null;
}

async function onboardProject(accessToken, tierId, projectHint = '') {
  for (const endpoint of ANTIGRAVITY_PROJECT_ENDPOINTS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const result = await post(endpoint, '/v1internal:onboardUser', accessToken, {
          tierId,
          metadata: metadata(projectHint),
        });
        if (!result.ok) break;
        const projectId = result.data?.response?.cloudaicompanionProject?.id;
        if (result.data?.done && projectId) return projectId;
        if (result.data?.done && projectHint) return projectHint;
      } catch {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  return null;
}

export async function ensureProjectContext(auth) {
  if (!auth?.accessToken) throw new Error('Antigravity n’est pas connecté.');
  if (auth.projectId) return { auth, projectId: auth.projectId };

  const loaded = await loadProject(auth.accessToken, ANTIGRAVITY_DEFAULT_PROJECT_ID);
  let projectId = extractProjectId(loaded);

  if (!projectId) {
    projectId = await onboardProject(
      auth.accessToken,
      defaultTier(loaded),
      '',
    );
  }

  projectId ||= ANTIGRAVITY_DEFAULT_PROJECT_ID;
  const updated = { ...auth, projectId, updatedAt: Date.now() };
  await saveAuth(updated);
  return { auth: updated, projectId };
}
