import { antigravityJsonRequest } from './client.js';
import { resolveModel } from './models.js';
import { buildProfessorPrompt } from '../shared/prompt.js';

function maxOutputTokens(style) {
  if (style === 'concise') return 1600;
  if (style === 'detailed') return 6000;
  return 3200;
}

function answerText(data) {
  const candidates = data?.response?.candidates || data?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    const text = parts
      .filter(part => !part?.thought && typeof part?.text === 'string')
      .map(part => part.text)
      .join('')
      .trim();
    if (text) return text;
  }
  return '';
}

function sourcesFrom(data) {
  const candidates = data?.response?.candidates || data?.candidates || [];
  const sources = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      const url = chunk?.web?.uri;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ url, title: chunk?.web?.title || url });
    }
  }
  return sources;
}

function canUseGoogleSearch(model) {
  return /^gemini-/i.test(model);
}

export async function chat(payload) {
  const model = await resolveModel(payload.settings?.antigravityModel);
  const webEnabled = payload.settings?.webSearch !== 'off' && canUseGoogleSearch(model);
  const prompt = buildProfessorPrompt(payload);

  const request = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }],
    }],
    systemInstruction: {
      parts: [{
        text: 'You are Professor Ask, an educational assistant integrated into YouTube. Use the supplied timestamped video context faithfully and follow the language and detail instructions in the user payload.',
      }],
    },
    generationConfig: {
      maxOutputTokens: maxOutputTokens(payload.settings?.responseStyle),
      temperature: 0.4,
    },
  };

  if (webEnabled) request.tools = [{ googleSearch: {} }];

  const response = await antigravityJsonRequest('/v1internal:generateContent', projectId => ({
    project: projectId,
    model,
    request,
    userAgent: 'antigravity',
    requestId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  }));

  const answer = answerText(response.data);
  if (!answer) throw new Error('Antigravity a terminé la réponse sans texte exploitable.');

  return {
    answer,
    sources: sourcesFrom(response.data),
    model: response.data?.response?.modelVersion || model,
    usage: response.data?.response?.usageMetadata || null,
  };
}
