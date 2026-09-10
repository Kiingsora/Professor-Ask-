(() => {
  const PA = globalThis.ProfessorAskContent;

  PA.setTranscriptStatus = function setTranscriptStatus(status, progress = null, error = null) {
    PA.state.transcriptStatus = status;
    PA.state.transcriptProgress = Number.isFinite(Number(progress)) ? Number(progress) : null;
    PA.state.transcriptError = error || null;

    const badge = PA.qs('#pa-transcript');
    if (!badge) return;

    if (status === 'checking-youtube') badge.textContent = 'Recherche transcription…';
    else if (status === 'youtube-ready') badge.textContent = 'Sous-titres YouTube';
    else if (status === 'queued') badge.textContent = 'Transcription IA en attente…';
    else if (status === 'downloading') badge.textContent = `Préparation audio ${Math.round(PA.state.transcriptProgress || 0)} %`;
    else if (status === 'transcribing') badge.textContent = `Transcription IA ${Math.round(PA.state.transcriptProgress || 0)} %`;
    else if (status === 'generated-ready') badge.textContent = 'Transcription IA prête';
    else if (status === 'failed') badge.textContent = 'Transcription indisponible';
    else badge.textContent = 'Transcription…';

    badge.title = error || '';
  };
})();
