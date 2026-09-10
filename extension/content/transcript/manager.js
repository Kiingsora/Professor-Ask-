(() => {
  const PA = globalThis.ProfessorAskContent;
  const POLL_INTERVAL_MS = 2500;
  let loadGeneration = 0;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function transcriptLanguage() {
    const language = PA.state.settings.transcriptLanguage;
    return language === 'fr' || language === 'en' ? language : 'auto';
  }

  function applyTranscript(segments, source, status) {
    PA.state.transcript = Array.isArray(segments) ? segments : [];
    PA.state.transcriptSource = source;
    PA.setTranscriptStatus(status, 100);
  }

  async function waitForGeneratedTranscript(videoId, language, generation, initial) {
    let snapshot = initial;

    while (generation === loadGeneration && PA.state.videoId === videoId) {
      if (snapshot?.status === 'ready' && Array.isArray(snapshot.segments)) {
        applyTranscript(snapshot.segments, 'generated', 'generated-ready');
        return;
      }

      if (snapshot?.status === 'failed') {
        PA.setTranscriptStatus('failed', snapshot.progress, snapshot.error || 'La transcription a échoué.');
        return;
      }

      PA.setTranscriptStatus(snapshot?.status || 'queued', snapshot?.progress || 0, snapshot?.error || null);
      await sleep(POLL_INTERVAL_MS);

      if (generation !== loadGeneration || PA.state.videoId !== videoId) return;
      snapshot = await PA.getRemoteTranscriptStatus(videoId, language);
    }
  }

  async function startGeneratedTranscript(videoId, generation) {
    const language = transcriptLanguage();
    try {
      const initial = await PA.startRemoteTranscript(videoId, language);
      await waitForGeneratedTranscript(videoId, language, generation, initial);
    } catch (error) {
      if (generation !== loadGeneration || PA.state.videoId !== videoId) return;
      PA.setTranscriptStatus('failed', null, error.message);
    }
  }

  PA.transcriptContextAt = function transcriptContextAt(time) {
    if (!PA.state.transcript.length) return [];

    const radius = Number(PA.state.settings.contextSeconds) || 180;
    const start = Math.max(0, time - radius);
    const end = time + radius;
    return PA.state.transcript.filter(item => item.start <= end && (item.start + item.duration) >= start);
  };

  PA.loadTranscript = async function loadTranscript() {
    const generation = ++loadGeneration;
    const videoId = PA.state.videoId;

    PA.state.transcript = [];
    PA.state.transcriptSource = null;
    PA.setTranscriptStatus('checking-youtube');

    try {
      const transcript = await PA.fetchYoutubeTranscript();
      if (generation !== loadGeneration || PA.state.videoId !== videoId) return;
      if (!transcript.length) throw new Error('empty captions');

      applyTranscript(transcript, 'youtube', 'youtube-ready');
      return;
    } catch {
      if (generation !== loadGeneration || PA.state.videoId !== videoId) return;
    }

    PA.setTranscriptStatus('queued', 0);
    void startGeneratedTranscript(videoId, generation);
  };
})();
