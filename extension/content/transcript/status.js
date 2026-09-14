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
    return text.length > 52 ? `${text.slice(0, 49)}…` : text;
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
      ? 'Afficher les lignes du contexte autour du moment actuel.'
      : 'Le contexte horodaté doit être prêt avant de pouvoir l’afficher.';
  }

  function updateSourceIndicator(source, state, title = '', errorText = '') {
    const icon = PA.qs(`#pa-${source}-icon`);
    const label = PA.qs(`#pa-${source}-text`);
    const container = PA.qs(`#pa-${source === 'subtitles' ? 'subtitles' : 'transcription'}-state`);
    if (!icon || !label) return;

    icon.classList.remove('is-checking', 'is-ok', 'is-missing', 'is-error', 'is-unknown');
    icon.classList.add(state);
    label.textContent = errorText;
    label.hidden = !errorText;
    container?.classList.toggle('has-error', !!errorText);
    if (container) container.title = title || errorText || 'État du contexte vidéo';
  }

  function updateSubtitles(status, diagnostics, error) {
    const count = captionCount(diagnostics);

    if (status === 'checking-youtube') {
      updateSourceIndicator('subtitles', 'is-checking', 'Recherche des pistes YouTube en cours.');
      return;
    }

    if (status === 'youtube-ready') {
      if (count > 0) {
        const kind = diagnostics?.source_kind === 'manual' ? 'manuels' : diagnostics?.source_kind === 'automatic' ? 'automatiques' : 'disponibles';
        updateSourceIndicator('subtitles', 'is-ok', `${count} piste${count > 1 ? 's' : ''} YouTube détectée${count > 1 ? 's' : ''} · ${kind}.`);
      } else {
        updateSourceIndicator('subtitles', 'is-unknown', 'Le contexte a été récupéré mais aucune piste distincte n’a été confirmée.');
      }
      return;
    }

    if (status === 'local-engine-pending') {
      updateSourceIndicator('subtitles', 'is-missing', 'Aucune piste YouTube exploitable détectée.');
      return;
    }

    if (status === 'failed') {
      if (count > 0) {
        updateSourceIndicator('subtitles', 'is-ok', `${count} piste${count > 1 ? 's' : ''} YouTube détectée${count > 1 ? 's' : ''}.`);
      } else {
        updateSourceIndicator('subtitles', 'is-error', error || 'Impossible de déterminer les pistes YouTube.', `Erreur · ${shortErrorLabel(error)}`);
      }
      return;
    }

    updateSourceIndicator('subtitles', 'is-unknown', 'État inconnu.');
  }

  function updateTranscription(status, diagnostics, error) {
    if (status === 'checking-youtube') {
      updateSourceIndicator('transcription', 'is-checking', 'Récupération du contexte horodaté en cours.');
      return;
    }

    if (status === 'youtube-ready') {
      updateSourceIndicator('transcription', 'is-ok', describeDiagnostics(diagnostics) || 'Contexte horodaté récupéré.');
      return;
    }

    if (status === 'local-engine-pending') {
      updateSourceIndicator('transcription', 'is-missing', 'Aucun contexte horodaté YouTube disponible.');
      return;
    }

    if (status === 'failed') {
      updateSourceIndicator('transcription', 'is-error', error || 'Impossible de récupérer le contexte horodaté.', `Erreur · ${shortErrorLabel(error)}`);
      return;
    }

    updateSourceIndicator('transcription', 'is-unknown', 'État inconnu.');
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
      if (detail) detail.textContent = 'Professor Ask vérifie les sources disponibles.';
      bar?.classList.add('is-working');
      updatePreviewButton(false);
      return;
    }

    if (status === 'youtube-ready') {
      badge.textContent = 'Contexte YouTube prêt';
      if (detail) detail.textContent = describeDiagnostics(details) || 'Le contexte horodaté est prêt.';
      bar?.classList.add('is-ready');
      updatePreviewButton(true);
      return;
    }

    if (status === 'local-engine-pending') {
      badge.textContent = 'Contexte vidéo indisponible';
      if (detail) detail.textContent = error || 'Aucun contexte YouTube exploitable n’a été trouvé.';
      bar?.classList.add('is-error');
      updatePreviewButton(false);
      return;
    }

    if (status === 'failed') {
      const fullError = error || 'Erreur pendant la récupération du contexte YouTube.';
      badge.textContent = 'Contexte indisponible';
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
