(() => {
  const PA = globalThis.ProfessorAskContent;

  function describeDiagnostics(diagnostics) {
    if (!diagnostics) return '';
    const parts = [];
    if (diagnostics.segment_count) parts.push(`${diagnostics.segment_count} segments`);
    if (Number.isFinite(Number(diagnostics.first_timestamp)) && Number.isFinite(Number(diagnostics.last_timestamp))) {
      parts.push(`${PA.fmt(diagnostics.first_timestamp)}–${PA.fmt(diagnostics.last_timestamp)}`);
    }
    if (diagnostics.detected_language) parts.push(`langue ${diagnostics.detected_language}`);
    if (diagnostics.model) parts.push(`modèle ${diagnostics.model}`);
    if (Number.isFinite(Number(diagnostics.coverage_ratio))) {
      parts.push(`couverture ${Math.round(Number(diagnostics.coverage_ratio) * 100)} %`);
    }
    return parts.join(' · ');
  }

  PA.setTranscriptStatus = function setTranscriptStatus(status, progress = null, error = null, diagnostics = null) {
    PA.state.transcriptStatus = status;
    PA.state.transcriptProgress = Number.isFinite(Number(progress)) ? Number(progress) : null;
    PA.state.transcriptError = error || null;
    if (diagnostics) PA.state.transcriptDiagnostics = diagnostics;

    const badge = PA.qs('#pa-transcript');
    if (!badge) return;

    const details = diagnostics || PA.state.transcriptDiagnostics || null;
    if (status === 'checking-youtube') badge.textContent = 'Recherche transcription…';
    else if (status === 'youtube-ready') {
      const kind = details?.source_kind === 'manual' ? 'Sous-titres YouTube manuels' : 'Sous-titres YouTube';
      badge.textContent = details?.segment_count ? `${kind} · ${details.segment_count} segments` : kind;
    } else if (status === 'queued') badge.textContent = 'Transcription IA en attente…';
    else if (status === 'downloading') badge.textContent = `Préparation audio ${Math.round(PA.state.transcriptProgress || 0)} %`;
    else if (status === 'transcribing') badge.textContent = `Transcription IA ${Math.round(PA.state.transcriptProgress || 0)} %`;
    else if (status === 'generated-ready') {
      const range = Number.isFinite(Number(details?.last_timestamp)) ? ` · ${PA.fmt(details.last_timestamp)}` : '';
      const count = details?.segment_count ? ` · ${details.segment_count} segments` : '';
      badge.textContent = `Transcription IA prête${count}${range}`;
    } else if (status === 'failed') badge.textContent = 'Transcription indisponible';
    else badge.textContent = 'Transcription…';

    badge.title = error || describeDiagnostics(details);
  };
})();
