(() => {
  const PA = globalThis.ProfessorAskContent;
  let loadGeneration = 0;

  function applyTranscript(segments, source, status, diagnostics = null) {
    PA.state.transcript = Array.isArray(segments) ? segments : [];
    PA.state.transcriptSource = source;
    PA.state.transcriptDiagnostics = diagnostics || null;
    PA.setTranscriptStatus(status, 100, null, diagnostics);
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
      const result = await PA.fetchYoutubeTranscript();
      if (generation !== loadGeneration || PA.state.videoId !== videoId) return;
      const transcript = Array.isArray(result) ? result : result?.segments;
      const diagnostics = Array.isArray(result) ? null : result?.diagnostics;
      if (!transcript?.length) throw new Error('empty captions');

      applyTranscript(transcript, 'youtube', 'youtube-ready', diagnostics || null);
      return;
    } catch {
      if (generation !== loadGeneration || PA.state.videoId !== videoId) return;
    }

    // No network/local companion fallback is allowed here. The next source must
    // execute entirely inside the extension package (Whisper WASM/WebGPU).
    PA.setTranscriptStatus(
      'local-engine-pending',
      null,
      'Aucun sous-titre YouTube. Le fallback doit être exécuté directement dans l’extension ; aucun serveur local ou distant n’est utilisé.',
    );
  };
})();
