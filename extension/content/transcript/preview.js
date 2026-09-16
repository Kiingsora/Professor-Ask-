(() => {
  const PA = globalThis.ProfessorAskContent;

  function nearestSegments(segments, time, limit = 12) {
    return [...segments]
      .sort((a, b) => Math.abs(a.start - time) - Math.abs(b.start - time))
      .slice(0, limit)
      .sort((a, b) => a.start - b.start);
  }

  PA.refreshTranscriptPreview = function refreshTranscriptPreview() {
    const drawer = PA.qs('#pa-transcript-drawer');
    const lines = PA.qs('#pa-transcript-lines');
    const detail = PA.qs('#pa-transcript-drawer-detail');
    if (!drawer || !lines || !detail || drawer.hidden) return;

    const time = PA.currentTime();
    if (!PA.state.transcript.length) {
      detail.textContent = PA.state.transcriptStatus === 'checking-youtube' ? 'Récupération…' : '';
      lines.textContent = PA.state.transcriptError || 'Aucune transcription disponible pour le moment.';
      return;
    }

    const context = PA.transcriptContextAt(time);
    if (!context.length) {
      detail.textContent = `autour de ${PA.fmt(time)}`;
      lines.textContent = `Aucun segment de transcription autour de ${PA.fmt(time)}.`;
      return;
    }

    const source = PA.state.transcriptSource === 'generated' ? 'Whisper' : 'YouTube';
    detail.textContent = `${source} · autour de ${PA.fmt(time)}`;
    lines.textContent = nearestSegments(context, time)
      .map(segment => `[${PA.fmt(segment.start)}] ${String(segment.text || '').trim()}`)
      .filter(Boolean)
      .join('\n');
  };

  PA.toggleTranscriptPreview = function toggleTranscriptPreview() {
    const drawer = PA.qs('#pa-transcript-drawer');
    const toggle = PA.qs('#pa-subtitles-state');
    if (!drawer) return;

    drawer.hidden = !drawer.hidden;
    toggle?.setAttribute('aria-expanded', drawer.hidden ? 'false' : 'true');
    if (!drawer.hidden) PA.refreshTranscriptPreview();
  };

  PA.closeTranscriptPreview = function closeTranscriptPreview() {
    const drawer = PA.qs('#pa-transcript-drawer');
    const toggle = PA.qs('#pa-subtitles-state');
    if (!drawer) return;
    drawer.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
  };
})();
