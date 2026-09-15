export const DEFAULT_API_PROVIDER = 'gemini';

export const API_PROVIDERS = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'gemini',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    chatBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    preferredModels: ['gemini-3.5-flash', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    protocol: 'anthropic',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    chatUrl: 'https://api.anthropic.com/v1/messages',
    preferredModels: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-sonnet-4-5'],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    modelsUrl: 'https://api.openai.com/v1/models',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    preferredModels: ['gpt-5.6', 'gpt-5.4', 'gpt-5', 'gpt-4.1'],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    protocol: 'openai',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    preferredModels: ['google/gemini-3-flash', 'anthropic/claude-sonnet-4.6', 'openai/gpt-5'],
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    chatUrl: 'https://api.mistral.ai/v1/chat/completions',
    preferredModels: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
    preferredModels: [],
  },
};

export function apiProviderConfig(value) {
  const id = String(value || DEFAULT_API_PROVIDER).trim().toLowerCase();
  const config = API_PROVIDERS[id];
  if (!config) throw new Error(`Fournisseur API inconnu : ${value}.`);
  return config;
}

export function apiProviderList() {
  return Object.values(API_PROVIDERS).map(({ id, label }) => ({ id, label }));
}
