import {
  CLIENT_ID,
  CODEX_DEVICE_URL,
  DEVICE_TOKEN_URL,
  ISSUER,
  OAUTH_TOKEN_URL,
  REFRESH_SKEW_MS,
  USER_CODE_URL,
} from './config.js';
import { accountInfo, tokenExpiresAt } from './identity.js';
import { parseResponse, responseError } from './response.js';
import { AUTH_KEY, PENDING_KEY, secretDelete, secretGet, secretSet } from './storage.js';

async function requestDeviceCode() {
  const response = await fetch(USER_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID }),
    credentials: 'omit',
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(responseError(data, `OpenAI a refusé la demande de connexion (${response.status}).`));

  const deviceAuthId = data.device_auth_id;
  const userCode = data.user_code;
  const authUrl = data.verification_uri_complete || data.verification_uri || CODEX_DEVICE_URL;
  if (!deviceAuthId || !userCode) {
    const fields = Object.keys(data || {}).join(', ');
    throw new Error(`Réponse de connexion Codex incomplète${fields ? ` (champs reçus : ${fields})` : ''}.`);
  }

  const expiresIn = Math.max(60, Number(data.expires_in) || 900);
  const interval = Math.max(3, Number(data.interval) || 5);
  await secretSet(PENDING_KEY, {
    deviceAuthId,
    userCode,
    authUrl,
    expiresAt: Date.now() + expiresIn * 1000,
    interval,
    lastPollAt: 0,
  });

  return { authUrl, userCode, expiresIn, interval };
}

async function exchangeAuthorizationCode(codeResponse) {
  const authorizationCode = codeResponse?.authorization_code;
  const codeVerifier = codeResponse?.code_verifier;
  if (!authorizationCode || !codeVerifier) {
    throw new Error('OpenAI a validé la connexion mais n’a pas renvoyé le code OAuth complet.');
  }

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: `${ISSUER}/deviceauth/callback`,
    client_id: CLIENT_ID,
    code_verifier: codeVerifier,
  });
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: form.toString(),
    credentials: 'omit',
  });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(responseError(data, `Échange OAuth Codex refusé (${response.status}).`));
  if (!data.access_token || !data.refresh_token) throw new Error('Réponse OAuth Codex incomplète.');

  const auth = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token || null,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
    updatedAt: Date.now(),
  };
  await secretSet(AUTH_KEY, auth);
  await secretDelete(PENDING_KEY);
  return auth;
}

async function pollPendingOnce() {
  const pending = await secretGet(PENDING_KEY);
  if (!pending) return { pending: false, completed: false };

  if (Date.now() >= pending.expiresAt) {
    await secretDelete(PENDING_KEY);
    return { pending: false, completed: false, expired: true };
  }

  const minInterval = Math.max(3, Number(pending.interval) || 5) * 1000;
  if (pending.lastPollAt && Date.now() - pending.lastPollAt < minInterval - 250) {
    return { pending: true, completed: false, authUrl: pending.authUrl, userCode: pending.userCode };
  }

  pending.lastPollAt = Date.now();
  await secretSet(PENDING_KEY, pending);

  const response = await fetch(DEVICE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ device_auth_id: pending.deviceAuthId, user_code: pending.userCode }),
    credentials: 'omit',
  });
  const data = await parseResponse(response);

  if (response.ok) {
    const auth = await exchangeAuthorizationCode(data);
    return { pending: false, completed: true, auth };
  }

  const errorText = responseError(data, '').toLowerCase();
  if (response.status === 403 || response.status === 404 || /pending|authorization.*wait|not.*authorized/.test(errorText)) {
    return { pending: true, completed: false, authUrl: pending.authUrl, userCode: pending.userCode };
  }
  if (response.status === 429) {
    return { pending: true, completed: false, rateLimited: true, authUrl: pending.authUrl, userCode: pending.userCode };
  }

  throw new Error(responseError(data, `Vérification OAuth Codex impossible (${response.status}).`));
}

async function refreshAuth(auth) {
  if (!auth?.refreshToken) throw new Error('Session Codex expirée : reconnecte ton compte ChatGPT.');

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
    client_id: CLIENT_ID,
  });
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: form.toString(),
    credentials: 'omit',
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) await secretDelete(AUTH_KEY);
    throw new Error(responseError(data, `Actualisation OAuth Codex impossible (${response.status}).`));
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

export async function getValidAuth({ forceRefresh = false } = {}) {
  let auth = await secretGet(AUTH_KEY);
  if (!auth?.accessToken || !auth?.refreshToken) return null;

  const expiresAt = tokenExpiresAt(auth);
  if (forceRefresh || !expiresAt || expiresAt <= Date.now() + REFRESH_SKEW_MS) {
    auth = await refreshAuth(auth);
  }
  return auth;
}

export async function status() {
  let pendingState = null;
  try {
    pendingState = await pollPendingOnce();
  } catch (error) {
    return { installed: true, connected: false, pending: true, error: error.message };
  }

  try {
    const auth = await getValidAuth();
    if (!auth) {
      return {
        installed: true,
        connected: false,
        pending: !!pendingState?.pending,
        authUrl: pendingState?.authUrl || null,
        userCode: pendingState?.userCode || null,
      };
    }
    return { installed: true, connected: true, pending: false, account: accountInfo(auth), transport: 'direct-codex-oauth' };
  } catch (error) {
    return { installed: true, connected: false, pending: false, error: error.message };
  }
}

export async function login() {
  const currentAuth = await getValidAuth().catch(() => null);
  if (currentAuth) {
    return { started: false, alreadyConnected: true, connected: true, account: accountInfo(currentAuth) };
  }

  const pending = await secretGet(PENDING_KEY);
  if (pending && pending.expiresAt > Date.now()) {
    return {
      started: true,
      opened: false,
      authUrl: pending.authUrl,
      userCode: pending.userCode,
      expiresIn: Math.max(0, Math.floor((pending.expiresAt - Date.now()) / 1000)),
    };
  }

  await secretDelete(PENDING_KEY);
  const device = await requestDeviceCode();
  return { started: true, opened: false, ...device };
}

export async function logout() {
  await Promise.all([secretDelete(AUTH_KEY), secretDelete(PENDING_KEY)]);
  return { connected: false };
}
