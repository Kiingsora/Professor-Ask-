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
    if (diagnostics.retrieval_method) parts.push(diagnostics.retrieval_method);
    if (diagnostics.model) parts.push(`modèle ${diagnostics.model}`);
    return parts.join(' · ');
  }

  function shortErrorLabel(error) {
    const text = String(error || '').replace(/^Les sous-titres n’ont pas pu être récupérés\s*\(/i, '').replace(/\)\.?$/, '');
    const technical = text.match(/(?:get_panel|get_transcript|caption)[^;,.]{0,40}HTTP\s+\d{3}(?:\s+[A-Z_]+)?/i);
    if (technical) return technical[0].replace(/^.*?(get_panel|get_transcript|caption)/i, '$1');
    return text.length > 46 ? `${text.slice(0, 43)}…` : text;
  }

  function updatePreviewButton(enabled) {
    const button = PA.qs('#pa-transcript-preview');
    if (!button) return;
    button.disabled = !enabled;
    button.title = enabled
      ? 'Afficher les lignes de transcription autour du moment actuel.'
      : 'La transcription doit être prête avant de pouvoir l’afficher.';
  }

  function updateCaptionsLed(state, text, title = '') {
    const led = PA.qs('#pa-caption-led');
    const label = PA.qs('#pa-caption-led-text');
    const container = PA.qs('#pa-captions-state');
    if (!led || !label) return;

    led.classList.remove('is-checking', 'is-ok', 'is-missing', 'is-error');
    led.classList.add(state);
    label.textContent = text;
    if (container) container.title = title || text;
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
      if (detail) detail.textContent = 'Professor Ask vérifie les pistes de sous-titres disponibles sur la vidéo.';
      bar?.classList.add('is-working');
      updateCaptionsLed('is-checking', 'Sous-titres : vérification…', 'Recherche des sous-titres YouTube en cours.');
      updatePreviewButton(false);
      return;
    }

    if (status === 'youtube-ready') {
      const kind = details?.source_kind === 'manual' ? 'manuels' : details?.source_kind === 'automatic' ? 'automatiques' : '';
      const sourceText = kind ? `Sous-titres : OK · ${kind}` : 'Sous-titres : OK';
      badge.textContent = `Sous-titres YouTube${kind ? ` ${kind}` : ''} récupérés`;
      if (detail) detail.textContent = describeDiagnostics(details) || 'La transcription horodatée YouTube est prête.';
      bar?.classList.add('is-ready');
      updateCaptionsLed('is-ok', sourceText, describeDiagnostics(details) || 'Sous-titres YouTube récupérés.');
      updatePreviewButton(true);
      return;
    }

    if (status === 'local-engine-pending') {
      badge.textContent = 'Aucun sous-titre YouTube';
      if (detail) detail.textContent = error || 'Aucune piste de sous-titres exploitable n’a été trouvée.';
      bar?.classList.add('is-error');
      updateCaptionsLed('is-missing', 'Sous-titres : absents', error || 'Aucun sous-titre YouTube exploitable trouvé.');
      updatePreviewButton(false);
      return;
    }

    if (status === 'failed') {
      const fullError = error || 'Erreur pendant la récupération des sous-titres YouTube.';
      badge.textContent = 'Transcription indisponible';
      if (detail) detail.textContent = fullError;
      bar?.classList.add('is-error');
      updateCaptionsLed('is-error', `Sous-titres : erreur · ${shortErrorLabel(fullError)}`, fullError);
      updatePreviewButton(false);
      return;
    }

    badge.textContent = 'Transcription…';
    if (detail) detail.textContent = error || '';
    updateCaptionsLed('is-checking', 'Sous-titres : vérification…');
    updatePreviewButton(false);
  };
})();
