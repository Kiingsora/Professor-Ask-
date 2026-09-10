(() => {
  const PA = globalThis.ProfessorAskContent;

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

  function chooseTrack(tracks) {
    const preferred = PA.state.settings.transcriptLanguage;
    const browserLanguage = (navigator.language || '').split('-')[0];

    return [...tracks]
      .map((track, index) => ({
        track,
        index,
        score: languageScore(track, preferred, browserLanguage) + (track.kind === 'asr' ? 0 : 100),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.track || null;
  }

  function trackLabel(track) {
    return track?.name?.simpleText
      || track?.name?.runs?.map(run => run.text).join('')
      || track?.languageCode
      || null;
  }

  PA.fetchYoutubeTranscript = async function fetchYoutubeTranscript() {
    const html = await fetch(location.href, { credentials: 'include' }).then(response => response.text());
    const json = extractJsonArrayAfter(html, '"captionTracks":');
    if (!json) throw new Error('no captions');

    const tracks = JSON.parse(json);
    const preferred = chooseTrack(tracks);
    if (!preferred?.baseUrl) throw new Error('no caption url');

    const separator = preferred.baseUrl.includes('?') ? '&' : '?';
    const data = await fetch(`${preferred.baseUrl}${separator}fmt=json3`, { credentials: 'include' }).then(response => response.json());
    const segments = (data.events || [])
      .filter(event => event.segs?.length)
      .map(event => ({
        start: (event.tStartMs || 0) / 1000,
        duration: (event.dDurationMs || 0) / 1000,
        text: decodeHtml(event.segs.map(segment => segment.utf8 || '').join('').replace(/\n/g, ' ')).trim(),
      }))
      .filter(item => item.text);

    if (!segments.length) throw new Error('empty captions');

    const last = segments[segments.length - 1];
    return {
      segments,
      diagnostics: {
        segment_count: segments.length,
        first_timestamp: segments[0].start,
        last_timestamp: last.start + last.duration,
        detected_language: preferred.languageCode || null,
        source_kind: preferred.kind === 'asr' ? 'automatic' : 'manual',
        track_label: trackLabel(preferred),
      },
    };
  };
})();
