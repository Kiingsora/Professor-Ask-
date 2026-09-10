import { TRANSCRIPTION_API_BASE, TRANSCRIPTION_REQUEST_TIMEOUT_MS } from './config.js';

function normalizeLanguage(value) {
  return value === 'fr' || value === 'en' ? value : 'auto';
}

function validateVideoId(value) {
  const videoId = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Identifiant de vidéo YouTube invalide.');
  return videoId;
}

async function fetchJson(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIPTION_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${TRANSCRIPTION_API_BASE}${path}`, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = { error: text.slice(0, 500) }; }
    }

    if (!response.ok) {
      const detail = data?.detail || data?.error || `HTTP ${response.status}`;
      throw new Error(`Service de transcription : ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Le service de transcription ne répond pas.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function routeTranscriptRequest(message) {
  const action = message?.action;
  const videoId = validateVideoId(message?.videoId);
  const language = normalizeLanguage(message?.language);

  if (action === 'start') {
    return fetchJson('/v1/transcripts/youtube', {
      method: 'POST',
      body: JSON.stringify({ video_id: videoId, language }),
    });
  }

  if (action === 'status') {
    return fetchJson(`/v1/transcripts/youtube/${encodeURIComponent(videoId)}?language=${encodeURIComponent(language)}`);
  }

  throw new Error(`Action de transcription inconnue : ${action || '(vide)'}.`);
}
