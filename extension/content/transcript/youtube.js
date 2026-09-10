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

  function chooseTrack(tracks) {
    const preferred = PA.state.settings.transcriptLanguage;
    if (preferred === 'fr') return tracks.find(track => /^fr([_-]|$)/i.test(track.languageCode)) || tracks[0];
    if (preferred === 'en') return tracks.find(track => /^en([_-]|$)/i.test(track.languageCode)) || tracks[0];

    const browserLanguage = (navigator.language || '').split('-')[0];
    return tracks.find(track => track.languageCode?.toLowerCase().startsWith(browserLanguage.toLowerCase()))
      || tracks.find(track => /^fr([_-]|$)/i.test(track.languageCode))
      || tracks.find(track => /^en([_-]|$)/i.test(track.languageCode))
      || tracks[0];
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

    return (data.events || [])
      .filter(event => event.segs?.length)
      .map(event => ({
        start: (event.tStartMs || 0) / 1000,
        duration: (event.dDurationMs || 0) / 1000,
        text: decodeHtml(event.segs.map(segment => segment.utf8 || '').join('').replace(/\n/g, ' ')).trim(),
      }))
      .filter(item => item.text);
  };
})();
