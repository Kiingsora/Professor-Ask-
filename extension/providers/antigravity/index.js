import { completeLoginFromUrl, login, logout, status } from './auth.js';
import { chat } from './chat.js';
import { clearModelCache, models } from './models.js';

async function logoutAndClear() {
  clearModelCache();
  return logout();
}

export const antigravityProvider = {
  status,
  login,
  logout: logoutAndClear,
  models,
  chat,
  completeLoginFromUrl,
};
