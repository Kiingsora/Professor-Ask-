(() => {
  const PA = globalThis.ProfessorAskContent;

  function nearestSegments(segments, time, limit = 8) {
    return [...segments]
      .sort((a, b) => Math.abs(a.start - time) - Math.abs(b.start - time))
      .slice(0, limit)
      .sort((a, b) => a.start - b.start);
  }

  PA.showTranscriptPreview = function showTranscriptPreview() {
    const time = PA.currentTime();
    if (!PA.state.transcript.length) {
      PA.addMessage?.('error', 'Aucune transcription prête à vérifier pour le moment.');
      return;
    }

    const context = PA.transcriptContextAt(time);
    if (!context.length) {
      PA.addMessage?.('error', `Aucun segment de transcription trouvé autour de ${PA.fmt(time)}.`);
      return;
    }

    const source = PA.state.transcriptSource === 'generated' ? 'Whisper' : 'YouTube';
    const lines = nearestSegments(context, time)
      .map(segment => `[${PA.fmt(segment.start)}] ${segment.text}`)
      .join('\n');

    PA.addMessage?.(
      'assistant',
      lines,
      `Aperçu transcription ${source} autour de ${PA.fmt(time)}`,
    );
  };
})();
