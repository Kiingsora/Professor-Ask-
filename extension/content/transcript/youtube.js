(() => {
  const PA = globalThis.ProfessorAskContent;
  const REQUEST_TYPE = 'PROFESSOR_ASK_YOUTUBE_TRANSCRIPT_REQUEST';
  const RESPONSE_TYPE = 'PROFESSOR_ASK_YOUTUBE_TRANSCRIPT_RESPONSE';

  function decodeHtml(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  function extractJsonArrayAfter(html, marker) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) return null;
    const start = html.indexOf('[', markerIndex + marker.length);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '[') depth++;
      if (char === ']') {
        depth--;
        if (depth === 0) return html.slice(start, i + 1);
      }
    }
    return null;
  }

  function languageScore(track, preferred, browserLanguage) {
    const code = String(track.languageCode || '').toLowerCase();
    if (preferred !== 'auto' && code.startsWith(preferred.toLowerCase())) return 40;
    if (browserLanguage && code.startsWith(browserLanguage.toLowerCase())) return 30;
    if (code.startsWith('fr')) return 20;
    if (code.startsWith('en')) return 10;
    return 0;
  }

  function rankTracks(tracks) {
    const preferred = PA.state.settings.transcriptLanguage;
    const browserLanguage = (navigator.language || '').split('-')[0];

    return [...tracks]
      .map((track, index) => ({
        track,
        index,
        score: languageScore(track, preferred, browserLanguage) + (track.kind === 'asr' ? 0 : 100),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(item => item.track);
  }

  function trackLabel(track) {
    return track?.name?.simpleText
      || track?.name?.runs?.map(run => run.text).join('')
      || track?.languageCode
      || null;
  }

  async function fetchTrack(track) {
    if (!track?.baseUrl) return null;

    const url = new URL(track.baseUrl);
    url.searchParams.set('fmt', 'json3');
    const response = await fetch(url.toString(), { credentials: 'include' });
    if (!response.ok) throw new Error(`caption HTTP ${response.status}`);

    const raw = await response.text();
    if (!raw.trim()) return null;

    const data = JSON.parse(raw);
    const segments = (data.events || [])
      .filter(event => event.segs?.length)
      .map(event => ({
        start: (event.tStartMs || 0) / 1000,
        duration: (event.dDurationMs || 0) / 1000,
        text: decodeHtml(event.segs.map(segment => segment.utf8 || '').join('').replace(/\n/g, ' ')).trim(),
      }))
      .filter(item => item.text);

    if (!segments.length) return null;

    const last = segments[segments.length - 1];
    return {
      segments,
      diagnostics: {
        segment_count: segments.length,
        first_timestamp: segments[0].start,
        last_timestamp: last.start + last.duration,
        detected_language: track.languageCode || null,
        source_kind: track.kind === 'asr' ? 'automatic' : 'manual',
        track_label: trackLabel(track),
        retrieval_method: 'timedtext',
      },
    };
  }

  function requestLiveTranscript(videoId, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      let timeout;

      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
      };

      const onMessage = event => {
        if (event.source !== window) return;
        const message = event.data;
        if (!message || message.source !== 'professor-ask-youtube-page') return;
        if (message.type !== RESPONSE_TYPE || message.requestId !== requestId) return;

        cleanup();
        resolve(message);
      };

      window.addEventListener('message', onMessage);
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error('live YouTube transcript timeout'));
      }, timeoutMs);

      window.postMessage({
        source: 'professor-ask-extension',
        type: REQUEST_TYPE,
        requestId,
        videoId,
      }, '*');
    });
  }

  async function tracksFromWatchPage() {
    const pageResponse = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
    if (!pageResponse.ok) throw new Error(`youtube page HTTP ${pageResponse.status}`);

    const html = await pageResponse.text();
    const json = extractJsonArrayAfter(html, '"captionTracks":');
    if (!json) return [];

    const tracks = JSON.parse(json);
    return Array.isArray(tracks) ? tracks : [];
  }

  async function tryTimedTextTracks(tracks) {
    let lastError = null;
    for (const track of rankTracks(tracks)) {
      try {
        const result = await fetchTrack(track);
        if (result) return result;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  PA.fetchYoutubeTranscript = async function fetchYoutubeTranscript() {
    const videoId = PA.state.videoId || PA.getVideoId();
    let liveResult = null;
    let liveError = null;

    try {
      liveResult = await requestLiveTranscript(videoId);
      if (liveResult?.ok && Array.isArray(liveResult.segments) && liveResult.segments.length) {
        return {
          segments: liveResult.segments,
          diagnostics: liveResult.diagnostics || null,
        };
      }
    } catch (error) {
      liveError = error;
    }

    let tracks = Array.isArray(liveResult?.tracks) ? liveResult.tracks : [];
    if (!tracks.length) {
      try {
        tracks = await tracksFromWatchPage();
      } catch (error) {
        if (!liveError) liveError = error;
      }
    }

    if (tracks.length) {
      const direct = await tryTimedTextTracks(tracks);
      if (direct) return direct;
    }

    if (liveResult?.errorCode === 'no_captions' && !tracks.length) throw new Error('no captions');

    const reason = liveResult?.error || liveError?.message;
    if (reason) throw new Error(`YouTube transcript retrieval failed: ${reason}`);
    if (!tracks.length) throw new Error('no captions');
    throw new Error('YouTube reported captions but returned no transcript data');
  };
})();
