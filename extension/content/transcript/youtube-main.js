(() => {
  const REQUEST_TYPE = 'PROFESSOR_ASK_YOUTUBE_TRANSCRIPT_REQUEST';
  const RESPONSE_TYPE = 'PROFESSOR_ASK_YOUTUBE_TRANSCRIPT_RESPONSE';

  function trackLanguage(tracks) {
    return tracks.find(track => track?.languageCode)?.languageCode || null;
  }

  function trackKind(tracks) {
    if (!tracks.length) return 'youtube-transcript';
    const first = tracks[0];
    return first?.kind === 'asr' ? 'automatic' : 'manual';
  }

  async function handleRequest(message) {
    const videoId = String(message.videoId || '');
    if (!videoId) throw new Error('video id missing');

    const provider = globalThis.ProfessorAskYoutubePage;
    if (!provider?.fetchTranscript || !provider?.captionTracks) {
      throw new Error('YouTube transcript provider unavailable');
    }

    const tracks = provider.captionTracks(videoId);

    try {
      const transcript = await provider.fetchTranscript(videoId);
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
            detected_language: transcript.language || trackLanguage(tracks),
            source_kind: trackKind(tracks),
            retrieval_method: 'youtubei-get-panel',
          },
        };
      }

      if (!tracks.length) {
        return {
          ok: false,
          errorCode: 'no_captions',
          error: 'Aucun segment de sous-titre YouTube n’a été retourné.',
          tracks,
        };
      }

      return {
        ok: false,
        errorCode: 'empty_transcript',
        error: 'YouTube expose des sous-titres, mais get_panel n’a retourné aucun segment.',
        tracks,
      };
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

    let result;
    try {
      result = await handleRequest(message);
    } catch (error) {
      result = {
        ok: false,
        errorCode: 'bridge_failed',
        error: error?.message || String(error),
        tracks: [],
      };
    }

    window.postMessage({
      source: 'professor-ask-youtube-page',
      type: RESPONSE_TYPE,
      requestId: message.requestId,
      videoId: message.videoId,
      ...result,
    }, '*');
  });
})();
