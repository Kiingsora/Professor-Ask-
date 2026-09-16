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

    if (container) {
      const interaction = source === 'subtitles' ? ' Cliquer pour afficher ou masquer la transcription.' : '';
      container.title = `${title || errorText || 'État de la transcription.'}${interaction}`.trim();
    }
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
        updateSourceIndicator('subtitles', 'is-unknown', 'La transcription a été récupérée mais aucune piste distincte n’a été confirmée.');
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
      updateSourceIndicator('transcription', 'is-checking', 'Récupération de la transcription en cours.');
      return;
    }

    if (status === 'youtube-ready') {
      updateSourceIndicator('transcription', 'is-ok', describeDiagnostics(diagnostics) || 'Transcription récupérée.');
      return;
    }

    if (status === 'local-engine-pending') {
      updateSourceIndicator('transcription', 'is-missing', 'Aucune transcription YouTube disponible.');
      return;
    }

    if (status === 'failed') {
      updateSourceIndicator('transcription', 'is-error', error || 'Impossible de récupérer la transcription.', `Erreur · ${shortErrorLabel(error)}`);
      return;
    }

    updateSourceIndicator('transcription', 'is-unknown', 'État inconnu.');
  }

  PA.setTranscriptStatus = function setTranscriptStatus(status, progress = null, error = null, diagnostics = null) {
    PA.state.transcriptStatus = status;
    PA.state.transcriptProgress = Number.isFinite(Number(progress)) ? Number(progress) : null;
    PA.state.transcriptError = error || null;
    if (diagnostics) PA.state.transcriptDiagnostics = diagnostics;

    const details = diagnostics || PA.state.transcriptDiagnostics || null;
    updateSubtitles(status, details, error);
    updateTranscription(status, details, error);
    PA.refreshTranscriptPreview?.();
  };
})();
