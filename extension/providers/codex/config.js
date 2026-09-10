export const ISSUER = 'https://auth.openai.com';
export const USER_CODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`;
export const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`;
export const OAUTH_TOKEN_URL = `${ISSUER}/oauth/token`;
export const CODEX_DEVICE_URL = `${ISSUER}/codex/device`;
export const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
export const MODELS_URL = `${CODEX_BASE_URL}/models?client_version=1.0.0`;
export const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const REFRESH_SKEW_MS = 5 * 60 * 1000;
export const MODEL_CACHE_MS = 5 * 60 * 1000;
export const SPARK_MODEL_ID = 'gpt-5.3-codex-spark';
export const SPARK_MODEL = {
  id: SPARK_MODEL_ID,
  label: 'GPT-5.3 Codex Spark',
  isDefault: false,
  defaultEffort: null,
  efforts: [],
};
