(() => {
  const PANEL_ID = 'PAmodern_transcript_view';
  const FALLBACK_CLIENT_VERSION = '2.20260811.01.00';
  const DEFAULT_SEGMENT_SECONDS = 5;

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
      // Continue with page globals.
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

  function encodeVarint(value) {
    const bytes = [];
    let remaining = Number(value) >>> 0;
    do {
      let byte = remaining & 0x7f;
      remaining >>>= 7;
      if (remaining) byte |= 0x80;
      bytes.push(byte);
    } while (remaining);
    return bytes;
  }

  function buildPanelParams(videoId) {
    const idBytes = Array.from(new TextEncoder().encode(videoId));
    const inner = [0x0a, ...encodeVarint(idBytes.length), ...idBytes, 0x18, 0x02];
    const envelope = [0xaa, 0x09, ...encodeVarint(inner.length), ...inner];
    return btoa(String.fromCharCode(...envelope));
  }

  function textValue(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map(run => run?.text || '').join('');
    return '';
  }

  function parseTimestamp(value) {
    const label = textValue(value).trim();
    if (!label) return null;
    const parts = label.split(':').map(Number);
    if (!parts.length || parts.some(part => !Number.isFinite(part))) return null;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  function modernText(timeline) {
    return (timeline?.contentItems || [])
      .map(item => textValue(item?.transcriptSegmentViewModel?.simpleText || item?.transcriptSegmentViewModel?.text))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseTranscriptPayload(root) {
    const rawSegments = [];
    const stack = [root];
    const seen = new Set();

    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);

      const legacy = node.transcriptSegmentRenderer;
      if (legacy) {
        const startMs = Number(legacy.startMs);
        const endMs = Number(legacy.endMs);
        const text = textValue(legacy.snippet).replace(/\s+/g, ' ').trim();
        if (Number.isFinite(startMs) && text) {
          rawSegments.push({
            start: startMs / 1000,
            end: Number.isFinite(endMs) && endMs > startMs ? endMs / 1000 : null,
            text,
          });
        }
      }

      const marker = node.macroMarkersPanelItemViewModel;
      if (marker && !marker.item?.timelineChapterViewModel) {
        const timeline = marker.item?.timelineItemViewModel;
        const text = modernText(timeline);
        const exactStart = Number(marker.onTap?.innertubeCommand?.watchEndpoint?.startTimeSeconds);
        const start = Number.isFinite(exactStart) ? exactStart : parseTimestamp(timeline?.timestamp);
        if (Number.isFinite(start) && text) rawSegments.push({ start, end: null, text });
      }

      if (Array.isArray(node)) {
        for (let index = node.length - 1; index >= 0; index--) stack.push(node[index]);
      } else {
        for (const child of Object.values(node)) stack.push(child);
      }
    }

    rawSegments.sort((a, b) => a.start - b.start);

    const unique = [];
    const keys = new Set();
    for (const segment of rawSegments) {
      const key = `${segment.start}|${segment.text}`;
      if (keys.has(key)) continue;
      keys.add(key);
      unique.push(segment);
    }

    return unique.map((segment, index) => {
      const nextStart = unique[index + 1]?.start;
      const end = Number.isFinite(segment.end) && segment.end > segment.start
        ? segment.end
        : (Number.isFinite(nextStart) && nextStart > segment.start ? nextStart : segment.start + DEFAULT_SEGMENT_SECONDS);
      return {
        start: segment.start,
        duration: Math.max(0, end - segment.start),
        text: segment.text,
      };
    });
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
      if (result != null) return result;

      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index--) stack.push(value[index]);
      } else {
        for (const child of Object.values(value)) stack.push(child);
      }
    }
    return null;
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
    if (context && typeof context === 'object' && context.client) return context;

    return {
      client: {
        clientName: 'WEB',
        clientVersion: String(configValue('INNERTUBE_CLIENT_VERSION', FALLBACK_CLIENT_VERSION)),
        hl: (navigator.language || 'en').split('-')[0],
        gl: String(configValue('GL', 'US')),
      },
    };
  }

  function responseErrorLabel(status, bodyText) {
    let serverStatus = '';
    try {
      serverStatus = JSON.parse(bodyText)?.error?.status || '';
    } catch {
      // Plain-text error bodies are allowed.
    }
    return `get_panel HTTP ${status}${serverStatus ? ` ${serverStatus}` : ''}`;
  }

  async function fetchTranscript(videoId) {
    const context = youtubeContext();
    const clientVersion = String(context?.client?.clientVersion || configValue('INNERTUBE_CLIENT_VERSION', FALLBACK_CLIENT_VERSION));
    const clientName = String(configValue('INNERTUBE_CONTEXT_CLIENT_NAME', 1));
    const visitorData = context?.client?.visitorData || configValue('VISITOR_DATA');

    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': 'https://www.youtube.com',
      'X-Youtube-Client-Name': clientName,
      'X-Youtube-Client-Version': clientVersion,
    };
    if (visitorData) headers['X-Goog-Visitor-Id'] = String(visitorData);

    const response = await fetch('/youtubei/v1/get_panel?prettyPrint=false', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        context,
        panelId: PANEL_ID,
        params: buildPanelParams(videoId),
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(responseErrorLabel(response.status, bodyText));
    }

    const data = await response.json();
    return {
      segments: parseTranscriptPayload(data),
      language: selectedLanguage(data),
    };
  }

  globalThis.ProfessorAskYoutubePage = {
    captionTracks,
    fetchTranscript,
  };
})();
