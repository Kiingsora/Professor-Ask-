(() => {
  const REQUEST_TYPE = 'PROFESSOR_ASK_YOUTUBE_TRANSCRIPT_REQUEST';
  const RESPONSE_TYPE = 'PROFESSOR_ASK_YOUTUBE_TRANSCRIPT_RESPONSE';

  function configValue(key, fallback = null) {
    try {
      const value = globalThis.ytcfg?.get?.(key);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function currentPlayerResponse(videoId) {
    const candidates = [];

    try {
      const player = document.querySelector('#movie_player');
      if (typeof player?.getPlayerResponse === 'function') candidates.push(player.getPlayerResponse());
    } catch {
      // Ignore undocumented player method failures and continue with other sources.
    }

    candidates.push(
      globalThis.ytplayer?.bootstrapPlayerResponse,
      globalThis.ytInitialPlayerResponse,
      globalThis.ytplayer?.config?.args?.raw_player_response,
      globalThis.ytplayer?.config?.args?.player_response,
    );

    for (let candidate of candidates) {
      try {
        if (typeof candidate === 'string') candidate = JSON.parse(candidate);
      } catch {
        continue;
      }
      if (!candidate || typeof candidate !== 'object') continue;
      if (candidate.videoDetails?.videoId === videoId) return candidate;
    }

    return null;
  }

  function captionTracks(videoId) {
    const response = currentPlayerResponse(videoId);
    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    return Array.isArray(tracks) ? tracks : [];
  }

  function findFirstDeep(root, predicate) {
    if (!root || typeof root !== 'object') return null;
    const stack = [root];
    const seen = new Set();

    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);

      const result = predicate(value);
      if (result) return result;

      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index--) stack.push(value[index]);
      } else {
        for (const child of Object.values(value)) stack.push(child);
      }
    }

    return null;
  }

  function textFromRuns(value) {
    if (!value) return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map(run => run?.text || '').join('');
    return '';
  }

  function parseTranscriptResponse(data) {
    const segments = [];
    const stack = [data];
    const seen = new Set();

    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);

      const segment = value.transcriptSegmentRenderer;
      if (segment) {
        const startMs = Number(segment.startMs);
        const endMs = Number(segment.endMs);
        const text = textFromRuns(segment.snippet).replace(/\s+/g, ' ').trim();
        if (Number.isFinite(startMs) && text) {
          segments.push({
            start: startMs / 1000,
            duration: Number.isFinite(endMs) && endMs >= startMs ? (endMs - startMs) / 1000 : 0,
            text,
          });
        }
      }

      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index--) stack.push(value[index]);
      } else {
        for (const child of Object.values(value)) stack.push(child);
      }
    }

    segments.sort((a, b) => a.start - b.start);
    return segments;
  }

  function selectedLanguage(data) {
    return findFirstDeep(data, value => {
      const items = value?.sortFilterSubMenuRenderer?.subMenuItems;
      if (!Array.isArray(items)) return null;
      const selected = items.find(item => item?.selected);
      return selected?.title || null;
    });
  }

  function youtubeContext() {
    const context = configValue('INNERTUBE_CONTEXT');
    if (context && typeof context === 'object') return context;

    const clientVersion = String(configValue('INNERTUBE_CLIENT_VERSION', '2.20260901.00.00'));
    return {
      client: {
        clientName: 'WEB',
        clientVersion,
        hl: (navigator.language || 'en').split('-')[0],
      },
    };
  }

  async function youtubeApi(endpoint, body) {
    const apiKey = configValue('INNERTUBE_API_KEY');
    if (!apiKey) throw new Error('INNERTUBE_API_KEY unavailable');

    const clientVersion = String(configValue('INNERTUBE_CLIENT_VERSION', youtubeContext()?.client?.clientVersion || '2.20260901.00.00'));
    const clientName = String(configValue('INNERTUBE_CONTEXT_CLIENT_NAME', 1));
    const response = await fetch(`/youtubei/v1/${endpoint}?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Youtube-Client-Name': clientName,
        'X-Youtube-Client-Version': clientVersion,
      },
      body: JSON.stringify({ context: youtubeContext(), ...body }),
    });

    if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
    return response.json();
  }

  async function transcriptFromPanelApi(videoId) {
    const nextData = await youtubeApi('next', { videoId });
    const params = findFirstDeep(nextData, value => {
      const candidate = value?.getTranscriptEndpoint?.params;
      return typeof candidate === 'string' && candidate ? candidate : null;
    });

    if (!params) return { segments: [], hasTranscriptEndpoint: false, language: null };

    const transcriptData = await youtubeApi('get_transcript', { params });
    return {
      segments: parseTranscriptResponse(transcriptData),
      hasTranscriptEndpoint: true,
      language: selectedLanguage(transcriptData),
    };
  }

  async function handleRequest(message) {
    const videoId = String(message.videoId || '');
    if (!videoId) throw new Error('video id missing');

    const tracks = captionTracks(videoId);

    try {
      const transcript = await transcriptFromPanelApi(videoId);
      if (transcript.segments.length) {
        const last = transcript.segments[transcript.segments.length - 1];
        return {
          ok: true,
          segments: transcript.segments,
          tracks,
          diagnostics: {
            segment_count: transcript.segments.length,
            first_timestamp: transcript.segments[0].start,
            last_timestamp: last.start + last.duration,
            detected_language: transcript.language,
            source_kind: 'youtube-transcript',
            retrieval_method: 'youtubei-get-transcript',
          },
        };
      }

      if (!transcript.hasTranscriptEndpoint && !tracks.length) {
        return { ok: false, errorCode: 'no_captions', error: 'Aucune piste de sous-titres YouTube détectée.', tracks };
      }

      return { ok: false, errorCode: 'empty_transcript', error: 'YouTube a signalé des sous-titres mais la transcription est vide.', tracks };
    } catch (error) {
      return {
        ok: false,
        errorCode: tracks.length ? 'retrieval_failed' : 'unknown',
        error: error?.message || String(error),
        tracks,
      };
    }
  }

  window.addEventListener('message', async event => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== 'professor-ask-extension' || message.type !== REQUEST_TYPE) return;

    const requestId = message.requestId;
    let result;
    try {
      result = await handleRequest(message);
    } catch (error) {
      result = { ok: false, errorCode: 'bridge_failed', error: error?.message || String(error), tracks: [] };
    }

    window.postMessage({
      source: 'professor-ask-youtube-page',
      type: RESPONSE_TYPE,
      requestId,
      videoId: message.videoId,
      ...result,
    }, '*');
  });
})();
