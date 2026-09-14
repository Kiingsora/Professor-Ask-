import {
  ANTIGRAVITY_AUTH_URL,
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_REDIRECT_URI,
  ANTIGRAVITY_REFRESH_SKEW_MS,
  ANTIGRAVITY_REVOKE_URL,
  ANTIGRAVITY_SCOPES,
  ANTIGRAVITY_TOKEN_URL,
  ANTIGRAVITY_USERINFO_URL,
} from './config.js';
import { createPkce, randomState } from './pkce.js';
import { AUTH_KEY, ERROR_KEY, PENDING_KEY, secretDelete, secretGet, secretSet } from './storage.js';

function oauthError(data, fallback) {
  return data?.error_description || data?.error?.message || data?.error || fallback;
}

async function rememberError(message) {
  const text = String(message || 'Erreur OAuth Antigravity.');
  await secretSet(ERROR_KEY, { message: text, at: Date.now() });
  return text;
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { error_description: text }; }
}

async function fetchUserInfo(accessToken) {
  try {
    const response = await fetch(ANTIGRAVITY_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

async function exchangeCode(code, verifier) {
  const response = await fetch(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: ANTIGRAVITY_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new Error(oauthError(data, `Google OAuth a refusé l’échange (${response.status}).`));
  if (!data.access_token) throw new Error('Google OAuth n’a pas renvoyé de jeton Antigravity exploitable.');

  const user = await fetchUserInfo(data.access_token);
  const auth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    idToken: data.id_token || null,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    email: user.email || null,
    name: user.name || null,
    projectId: null,
    updatedAt: Date.now(),
  };
  await secretSet(AUTH_KEY, auth);
  await Promise.all([secretDelete(PENDING_KEY), secretDelete(ERROR_KEY)]);
  return auth;
}

async function refreshAuth(auth) {
  if (!auth?.refreshToken) throw new Error('Session Antigravity expirée : reconnecte ton compte Google.');

  const response = await fetch(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await parseJson(response);
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) await secretDelete(AUTH_KEY);
    throw new Error(oauthError(data, `Actualisation Antigravity impossible (${response.status}).`));
  }

  const updated = {
    ...auth,
    accessToken: data.access_token || auth.accessToken,
    refreshToken: data.refresh_token || auth.refreshToken,
    idToken: data.id_token || auth.idToken || null,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    updatedAt: Date.now(),
  };
  await secretSet(AUTH_KEY, updated);
  return updated;
}

export async function saveAuth(auth) {
  await secretSet(AUTH_KEY, auth);
  return auth;
}

export async function getValidAuth({ forceRefresh = false } = {}) {
  let auth = await secretGet(AUTH_KEY);
  if (!auth?.accessToken) return null;

  if (forceRefresh || !auth.expiresAt || auth.expiresAt <= Date.now() + ANTIGRAVITY_REFRESH_SKEW_MS) {
    auth = await refreshAuth(auth);
  }
  return auth;
}

export async function login() {
  const current = await getValidAuth().catch(() => null);
  if (current) return { started: false, alreadyConnected: true, connected: true, account: { email: current.email } };

  const pending = await secretGet(PENDING_KEY);
  if (pending?.expiresAt > Date.now()) {
    return { started: true, opened: false, authUrl: pending.authUrl, expiresIn: Math.floor((pending.expiresAt - Date.now()) / 1000) };
  }

  await Promise.all([secretDelete(PENDING_KEY), secretDelete(ERROR_KEY)]);
  const { verifier, challenge } = await createPkce();
  const state = randomState();
  const url = new URL(ANTIGRAVITY_AUTH_URL);
  url.searchParams.set('client_id', ANTIGRAVITY_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', ANTIGRAVITY_REDIRECT_URI);
  url.searchParams.set('scope', ANTIGRAVITY_SCOPES.join(' '));
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  const authUrl = url.toString();
  await secretSet(PENDING_KEY, {
    state,
    verifier,
    authUrl,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return { started: true, opened: false, authUrl, expiresIn: 600 };
}

export async function completeLoginFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith(ANTIGRAVITY_REDIRECT_URI)) return { handled: false };
  const url = new URL(rawUrl);
  const pending = await secretGet(PENDING_KEY);
  if (!pending) {
    const error = await rememberError('Aucune connexion Antigravity en attente.');
    return { handled: true, connected: false, error };
  }
  if (pending.expiresAt <= Date.now()) {
    await secretDelete(PENDING_KEY);
    const error = await rememberError('La connexion Antigravity a expiré.');
    return { handled: true, connected: false, error };
  }

  const oauthErrorCode = url.searchParams.get('error');
  if (oauthErrorCode) {
    await secretDelete(PENDING_KEY);
    const error = await rememberError(url.searchParams.get('error_description') || oauthErrorCode);
    return { handled: true, connected: false, error };
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== pending.state) {
    const error = await rememberError('Retour OAuth Antigravity invalide.');
    return { handled: true, connected: false, error };
  }

  try {
    const auth = await exchangeCode(code, pending.verifier);
    return { handled: true, connected: true, account: { email: auth.email, name: auth.name } };
  } catch (error) {
    await secretDelete(PENDING_KEY);
    const message = await rememberError(error?.message || String(error));
    return { handled: true, connected: false, error: message };
  }
}

export async function status() {
  const [pending, lastError] = await Promise.all([secretGet(PENDING_KEY), secretGet(ERROR_KEY)]);
  try {
    const auth = await getValidAuth();
    if (!auth) {
      return {
        installed: true,
        connected: false,
        pending: !!(pending?.expiresAt > Date.now()),
        error: lastError?.message || null,
      };
    }
    return {
      installed: true,
      connected: true,
      pending: false,
      account: { email: auth.email, name: auth.name },
      projectId: auth.projectId || null,
      transport: 'direct-antigravity-oauth',
    };
  } catch (error) {
    return { installed: true, connected: false, pending: false, error: error?.message || String(error) };
  }
}

export async function logout() {
  const auth = await secretGet(AUTH_KEY);
  await Promise.all([secretDelete(AUTH_KEY), secretDelete(PENDING_KEY), secretDelete(ERROR_KEY)]);
  if (auth?.refreshToken) {
    fetch(ANTIGRAVITY_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ token: auth.refreshToken }),
    }).catch(() => {});
  }
  return { connected: false };
}
