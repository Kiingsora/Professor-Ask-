(() => {
  const PA = globalThis.ProfessorAskContent;

  PA.transcriptContextAt = function transcriptContextAt(time) {
    if (!PA.state.transcript.length) return [];

    const radius = Number(PA.state.settings.contextSeconds) || 180;
    const start = Math.max(0, time - radius);
    const end = time + radius;
    return PA.state.transcript.filter(item => item.start <= end && (item.start + item.duration) >= start);
  };

  PA.loadTranscript = async function loadTranscript() {
    PA.state.transcript = [];
    PA.state.transcriptSource = null;
    const badge = PA.qs('#pa-transcript');
    if (badge) badge.textContent = 'Transcription...';

    try {
      const transcript = await PA.fetchYoutubeTranscript();
      if (!transcript.length) throw new Error('empty captions');

      PA.state.transcript = transcript;
      PA.state.transcriptSource = 'youtube';
      if (badge) badge.textContent = `${transcript.length} segments`;
    } catch {
      if (badge) badge.textContent = 'Pas de transcription';
    }
  };
})();
