function decodeBase64Url(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwt(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return {};
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return {};
  }
}

export function accountInfo(auth) {
  const accessClaims = decodeJwt(auth?.accessToken);
  const idClaims = decodeJwt(auth?.idToken);
  const openAiAuth = accessClaims?.['https://api.openai.com/auth'] || {};

  return {
    type: 'chatgpt',
    email: idClaims.email || accessClaims.email || null,
    plan_type: openAiAuth.chatgpt_plan_type || accessClaims.chatgpt_plan_type || idClaims.chatgpt_plan_type || null,
    account_id: openAiAuth.chatgpt_account_id || accessClaims.chatgpt_account_id || idClaims.chatgpt_account_id || null,
  };
}

export function tokenExpiresAt(auth) {
  const claims = decodeJwt(auth?.accessToken);
  if (Number.isFinite(Number(claims.exp))) return Number(claims.exp) * 1000;
  if (Number.isFinite(Number(auth?.expiresAt))) return Number(auth.expiresAt);
  return 0;
}
