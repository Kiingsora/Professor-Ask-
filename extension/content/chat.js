(() => {
  const PA = globalThis.ProfessorAskContent;

  PA.fetchProviderStatus = async function fetchProviderStatus() {
    try {
      const provider = PA.state.settings.provider === 'antigravity' ? 'antigravity' : 'codex';
      const response = await PA.providerRequest(`/providers/${provider}/status`);
      const data = response.data || {};
      PA.state.connected = !!(response.ok && data.connected);
      PA.state.providerStatus = data;
    } catch {
      PA.state.connected = false;
      PA.state.providerStatus = null;
    }
    PA.renderStatus();
  };

  function transcriptNotReadyMessage() {
    const status = PA.state.transcriptStatus;
    if (status === 'checking-youtube') return 'Je vérifie les sous-titres YouTube. Réessaie dans quelques secondes.';
    if (status === 'queued' || status === 'downloading' || status === 'transcribing') {
      return `La transcription de cette vidéo est encore en cours${PA.state.transcriptProgress != null ? ` (${Math.round(PA.state.transcriptProgress)} %)` : ''}. Attends qu’elle soit prête avant de poser une question sur le passage.`;
    }
    if (status === 'failed') return `La transcription est indisponible${PA.state.transcriptError ? ` : ${PA.state.transcriptError}` : '.'}`;
    return 'Aucune transcription exploitable n’est disponible pour cette vidéo.';
  }

  PA.sendQuestion = async function sendQuestion() {
    if (PA.state.busy) return;

    const input = PA.qs('#pa-input');
    const send = PA.qs('#pa-send');
    const question = input?.value.trim();
    if (!question) return;

    if (!PA.state.connected) {
      PA.addMessage('error', `${PA.providerName()} n’est pas connecté. Ouvre les paramètres pour lancer la connexion OAuth.`);
      return;
    }

    const timestamp = PA.currentTime();
    if (!PA.state.transcript.length) {
      PA.addMessage('error', transcriptNotReadyMessage());
      return;
    }

    const transcriptContext = PA.transcriptContextAt(timestamp);
    if (!transcriptContext.length) {
      PA.addMessage(
        'error',
        `La transcription est chargée, mais aucun segment ne couvre le contexte autour de ${PA.fmt(timestamp)}. La question n’a pas été envoyée à ${PA.providerName()} afin d’éviter une réponse inventée.`,
      );
      return;
    }

    const video = PA.qs('video');
    if (PA.state.settings.pauseOnQuestion && video && !video.paused) video.pause();

    PA.addMessage('user', question, PA.fmt(timestamp));
    input.value = '';
    PA.state.busy = true;
    send.disabled = true;

    const model = PA.selectedModelName();
    const sourceLabel = PA.state.transcriptSource === 'generated' ? 'transcription IA' : 'sous-titres YouTube';
    const placeholder = PA.addMessage(
      'assistant',
      'Réflexion…',
      `${model === 'auto' ? PA.providerName() : `${PA.providerName()} · ${model}`} · ${sourceLabel} @ ${PA.fmt(timestamp)}`,
    );

    try {
      const includeMetadata = !!PA.state.settings.includeMetadata;
      const title = includeMetadata
        ? (PA.qs('h1 yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/, ''))
        : '';
      const channel = includeMetadata ? (PA.qs('ytd-channel-name a')?.textContent?.trim() || '') : '';

      const response = await PA.providerRequest('/chat', {
        method: 'POST',
        body: {
          provider: PA.state.settings.provider,
          videoId: PA.state.videoId,
          title,
          channel,
          timestamp,
          question,
          transcript: transcriptContext,
          transcriptSource: PA.state.transcriptSource,
          transcriptDiagnostics: PA.state.transcriptDiagnostics || null,
          settings: {
            responseLanguage: PA.state.settings.responseLanguage,
            responseStyle: PA.state.settings.responseStyle,
            webSearch: PA.state.settings.webSearch,
            codexModel: PA.state.settings.codexModel,
            codexEffort: PA.state.settings.codexEffort,
            antigravityModel: PA.state.settings.antigravityModel,
          },
        },
      });

      const data = response.data || {};
      if (!response.ok) throw new Error(response.error || data.error || `Erreur ${PA.providerName()}`);
      placeholder.lastElementChild.textContent = PA.formatAnswer(data.answer, data.sources);
      await PA.saveHistory();
    } catch (error) {
      placeholder?.remove();
      PA.addMessage('error', error.message);
    } finally {
      PA.state.busy = false;
      send.disabled = false;
    }
  };
})();
