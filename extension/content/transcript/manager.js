(() => {
  const PA = globalThis.ProfessorAskContent;
  let loadGeneration = 0;

  function applyTranscript(segments, source, status, diagnostics = null) {
    PA.state.transcript = Array.isArray(segments) ? segments : [];
    PA.state.transcriptSource = source;
    PA.state.transcriptDiagnostics = diagnostics || null;
    PA.setTranscriptStatus(status, 100, null, diagnostics);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function shouldRetry(error) {
    const message = String(error?.message || '');
    if (message === 'no captions') return false;
    if (/HTTP\s+4\d\d/i.test(message)) return false;
    if (/empty captions|returned no transcript data/i.test(message)) return false;
    return true;
  }

  async function fetchYoutubeTranscriptWithRetry(generation, videoId) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (generation !== loadGeneration || PA.state.videoId !== videoId) return null;
      try {
        return await PA.fetchYoutubeTranscript();
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error)) break;
        if (attempt < 2) await sleep(600 * (attempt + 1));
      }
    }
    throw lastError || new Error('caption retrieval failed');
  }

  PA.transcriptContextAt = function transcriptContextAt(time) {
    if (!PA.state.transcript.length) return [];

    const radius = Number(PA.state.settings.contextSeconds) || 180;
    const start = Math.max(0, time - radius);
    const end = time + radius;
    return PA.state.transcript.filter(item => item.start <= end && (item.start + item.duration) >= start);
  };

  PA.hasTranscriptAt = function hasTranscriptAt(time) {
    return PA.transcriptContextAt(time).length > 0;
  };

  PA.loadTranscript = async function loadTranscript() {
    const generation = ++loadGeneration;
    const videoId = PA.state.videoId;

    PA.state.transcript = [];
    PA.state.transcriptSource = null;
    PA.state.transcriptDiagnostics = null;
    PA.setTranscriptStatus('checking-youtube');

    try {
      const result = await fetchYoutubeTranscriptWithRetry(generation, videoId);
      if (!result || generation !== loadGeneration || PA.state.videoId !== videoId) return;
      const transcript = Array.isArray(result) ? result : result?.segments;
      const diagnostics = Array.isArray(result) ? null : result?.diagnostics;
      if (!transcript?.length) throw new Error('empty captions');

      applyTranscript(transcript, 'youtube', 'youtube-ready', diagnostics || null);
      return;
    } catch (error) {
      if (generation !== loadGeneration || PA.state.videoId !== videoId) return;

      if (error?.message === 'no captions') {
        PA.setTranscriptStatus(
          'local-engine-pending',
          null,
          'Aucune piste de sous-titres YouTube n’a été détectée sur cette vidéo.',
        );
        return;
      }

      PA.setTranscriptStatus(
        'failed',
        null,
        `Les sous-titres n’ont pas pu être récupérés (${error?.message || 'erreur inconnue'}).`,
      );
    }
  };
})();
