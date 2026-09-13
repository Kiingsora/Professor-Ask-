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

  function captionCount(diagnostics) {
    const value = Number(diagnostics?.caption_track_count);
    return Number.isFinite(value) ? value : null;
  }

  function updatePreviewButton(enabled) {
    const button = PA.qs('#pa-transcript-preview');
    if (!button) return;
    button.disabled = !enabled;
    button.title = enabled
      ? 'Afficher les lignes de transcription autour du moment actuel.'
      : 'La transcription doit être prête avant de pouvoir l’afficher.';
  }

  function updateSourceIndicator(source, state, text, title = '') {
    const icon = PA.qs(`#pa-${source}-icon`);
    const label = PA.qs(`#pa-${source}-text`);
    const container = PA.qs(`#pa-${source === 'subtitles' ? 'subtitles' : 'transcription'}-state`);
    if (!icon || !label) return;

    icon.classList.remove('is-checking', 'is-ok', 'is-missing', 'is-error', 'is-unknown');
    icon.classList.add(state);
    label.textContent = text;
    if (container) container.title = title || text;
  }

  function updateSubtitles(status, diagnostics, error) {
    const count = captionCount(diagnostics);

    if (status === 'checking-youtube') {
      updateSourceIndicator('subtitles', 'is-checking', 'Sous-titres : vérification…', 'Recherche des pistes de sous-titres YouTube en cours.');
      return;
    }

    if (status === 'youtube-ready') {
      if (count > 0) {
        const kind = diagnostics?.source_kind === 'manual' ? 'manuels' : diagnostics?.source_kind === 'automatic' ? 'automatiques' : null;
        updateSourceIndicator(
          'subtitles',
          'is-ok',
          `Sous-titres : OK${kind ? ` · ${kind}` : ''}`,
          `${count} piste${count > 1 ? 's' : ''} de sous-titres détectée${count > 1 ? 's' : ''}.`,
        );
      } else {
        updateSourceIndicator(
          'subtitles',
          'is-unknown',
          'Sous-titres : non confirmés',
          'La transcription a été récupérée, mais le lecteur n’a pas exposé de piste de sous-titres distincte.',
        );
      }
      return;
    }

    if (status === 'local-engine-pending') {
      updateSourceIndicator('subtitles', 'is-missing', 'Sous-titres : absents', error || 'Aucune piste de sous-titres YouTube détectée.');
      return;
    }

    if (status === 'failed') {
      if (count > 0) {
        updateSourceIndicator(
          'subtitles',
          'is-ok',
          'Sous-titres : détectés',
          `${count} piste${count > 1 ? 's' : ''} détectée${count > 1 ? 's' : ''}, mais la transcription n’a pas pu être récupérée.`,
        );
      } else {
        updateSourceIndicator('subtitles', 'is-error', 'Sous-titres : erreur', error || 'Impossible de déterminer les pistes de sous-titres.');
      }
      return;
    }

    updateSourceIndicator('subtitles', 'is-unknown', 'Sous-titres : ?', 'État des sous-titres inconnu.');
  }

  function updateTranscription(status, diagnostics, error) {
    if (status === 'checking-youtube') {
      updateSourceIndicator('transcription', 'is-checking', 'Transcription : vérification…', 'Récupération de la transcription horodatée en cours.');
      return;
    }

    if (status === 'youtube-ready') {
      updateSourceIndicator(
        'transcription',
        'is-ok',
        'Transcription : OK',
        describeDiagnostics(diagnostics) || 'Transcription horodatée récupérée.',
      );
      return;
    }

    if (status === 'local-engine-pending') {
      updateSourceIndicator('transcription', 'is-missing', 'Transcription : absente', 'Aucune transcription YouTube disponible.');
      return;
    }

    if (status === 'failed') {
      updateSourceIndicator('transcription', 'is-error', `Transcription : erreur · ${shortErrorLabel(error)}`, error || 'Impossible de récupérer la transcription.');
      return;
    }

    updateSourceIndicator('transcription', 'is-unknown', 'Transcription : ?', 'État de la transcription inconnu.');
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
    updateSubtitles(status, details, error);
    updateTranscription(status, details, error);

    if (status === 'checking-youtube') {
      badge.textContent = 'Recherche du contexte YouTube…';
      if (detail) detail.textContent = 'Professor Ask vérifie séparément les sous-titres et la transcription horodatée.';
      bar?.classList.add('is-working');
      updatePreviewButton(false);
      return;
    }

    if (status === 'youtube-ready') {
      badge.textContent = 'Transcription YouTube récupérée';
      if (detail) detail.textContent = describeDiagnostics(details) || 'La transcription horodatée YouTube est prête.';
      bar?.classList.add('is-ready');
      updatePreviewButton(true);
      return;
    }

    if (status === 'local-engine-pending') {
      badge.textContent = 'Contexte vidéo indisponible';
      if (detail) detail.textContent = error || 'Aucune transcription YouTube exploitable n’a été trouvée.';
      bar?.classList.add('is-error');
      updatePreviewButton(false);
      return;
    }

    if (status === 'failed') {
      const fullError = error || 'Erreur pendant la récupération de la transcription YouTube.';
      badge.textContent = 'Transcription indisponible';
      if (detail) detail.textContent = fullError;
      bar?.classList.add('is-error');
      updatePreviewButton(false);
      return;
    }

    badge.textContent = 'Contexte vidéo…';
    if (detail) detail.textContent = error || '';
    updatePreviewButton(false);
  };
})();
