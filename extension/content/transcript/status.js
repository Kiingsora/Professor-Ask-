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

  function updatePreviewButton(enabled) {
    const button = PA.qs('#pa-transcript-preview');
    if (!button) return;
    button.disabled = !enabled;
    button.title = enabled
      ? 'Afficher les lignes de transcription autour du moment actuel.'
      : 'La transcription doit être prête avant de pouvoir l’afficher.';
  }

  PA.setTranscriptStatus = function setTranscriptStatus(status, progress = null, error = null, diagnostics = null) {
    PA.state.transcriptStatus = status;
    PA.state.transcriptProgress = Number.isFinite(Number(progress)) ? Number(progress) : null;
    PA.state.transcriptError = error || null;
    if (diagnostics) PA.state.transcriptDiagnostics = diagnostics;

    const badge = PA.qs('#pa-transcript');
    const detail = PA.qs('#pa-transcript-detail');
    const bar = PA.qs('#pa-transcript-bar');
    if (!badge) return;

    const details = diagnostics || PA.state.transcriptDiagnostics || null;
    bar?.classList.remove('is-ready', 'is-working', 'is-error');

    if (status === 'checking-youtube') {
      badge.textContent = 'Recherche des sous-titres YouTube…';
      if (detail) detail.textContent = 'Professor Ask vérifie d’abord les sous-titres disponibles sur la vidéo.';
      bar?.classList.add('is-working');
      updatePreviewButton(false);
      return;
    }

    if (status === 'youtube-ready') {
      const kind = details?.source_kind === 'manual' ? 'manuels' : details?.source_kind === 'automatic' ? 'automatiques' : '';
      badge.textContent = `Sous-titres YouTube${kind ? ` ${kind}` : ''} récupérés`;
      if (detail) detail.textContent = describeDiagnostics(details) || 'La transcription horodatée YouTube est prête.';
      bar?.classList.add('is-ready');
      updatePreviewButton(true);
      return;
    }

    if (status === 'queued') {
      badge.textContent = 'Aucun sous-titre · Whisper va démarrer';
      if (detail) detail.textContent = 'Le service de transcription prépare une transcription complète de la vidéo.';
      bar?.classList.add('is-working');
      updatePreviewButton(false);
      return;
    }

    if (status === 'downloading') {
      badge.textContent = `Whisper · préparation audio ${Math.round(PA.state.transcriptProgress || 0)} %`;
      if (detail) detail.textContent = 'L’audio de la vidéo est en cours de préparation.';
      bar?.classList.add('is-working');
      updatePreviewButton(false);
      return;
    }

    if (status === 'transcribing') {
      badge.textContent = `Whisper · transcription ${Math.round(PA.state.transcriptProgress || 0)} %`;
      if (detail) detail.textContent = 'Whisper produit les segments texte avec leurs timestamps.';
      bar?.classList.add('is-working');
      updatePreviewButton(false);
      return;
    }

    if (status === 'generated-ready') {
      badge.textContent = 'Whisper · transcription récupérée';
      if (detail) detail.textContent = describeDiagnostics(details) || `${PA.state.transcript.length} segments horodatés disponibles.`;
      bar?.classList.add('is-ready');
      updatePreviewButton(true);
      return;
    }

    if (status === 'failed') {
      badge.textContent = 'Transcription indisponible';
      if (detail) detail.textContent = error || 'Impossible de récupérer une transcription pour cette vidéo.';
      bar?.classList.add('is-error');
      updatePreviewButton(false);
      return;
    }

    badge.textContent = 'Transcription…';
    if (detail) detail.textContent = error || '';
    updatePreviewButton(false);
  };
})();
