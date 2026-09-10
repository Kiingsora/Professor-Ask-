import { getValidAuth } from './auth.js';
import { accountInfo } from './identity.js';

function authHeaders(auth) {
  const headers = {
    'Authorization': `Bearer ${auth.accessToken}`,
    'Accept': 'application/json',
    'originator': 'professor-ask',
  };
  const account = accountInfo(auth);
  if (account.account_id) headers['ChatGPT-Account-Id'] = account.account_id;
  return headers;
}

export async function authorizedFetch(url, options = {}, retry = true) {
  let auth = await getValidAuth();
  if (!auth) throw new Error('Compte ChatGPT/Codex non connecté.');

  const request = currentAuth => fetch(url, {
    ...options,
    credentials: 'omit',
    headers: { ...authHeaders(currentAuth), ...(options.headers || {}) },
  });

  let response = await request(auth);
  if (retry && (response.status === 401 || response.status === 403)) {
    auth = await getValidAuth({ forceRefresh: true });
    if (!auth) throw new Error('Session Codex expirée. Reconnecte ton compte ChatGPT.');
    response = await request(auth);
  }
  return response;
}
