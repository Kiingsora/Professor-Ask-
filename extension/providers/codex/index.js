import { login, logout, status } from './auth.js';
import { chat } from './chat.js';
import { models } from './models.js';

export const codexProvider = {
  status,
  login,
  logout,
  models,
  chat,
};
