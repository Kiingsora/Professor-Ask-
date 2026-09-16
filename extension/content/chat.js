(() => {
  const PA = globalThis.ProfessorAskContent;

  PA.fetchProviderStatus = async function fetchProviderStatus() {
    try {
      const provider = PA.state.settings.provider === 'api' ? 'api' : 'codex';
      const options = provider === 'api'
        ? { body: { apiProvider: PA.state.settings.apiProvider } }
        : undefined;
      const response = await PA.providerRequest(`/providers/${provider}/status`, options);
      const data = response.data || {};
      PA.state.connected = !!(response.ok && data.connected);
      PA.state.providerStatus = data;
    } catch {
      PA.state.connected = false;
      PA.state.providerStatus = null;
    }
    PA.renderStatus();
  };

  PA.sendQuestion = async function sendQuestion() {
    if (PA.state.busy) return;

    const input = PA.qs('#pa-input');
    const send = PA.qs('#pa-send');
    const question = input?.value.trim();
    if (!question) return;

    if (!PA.state.connected) {
      const action = PA.state.settings.provider === 'api'
        ? 'Ouvre les paramètres pour enregistrer la clé API correspondante.'
        : 'Ouvre les paramètres pour lancer la connexion OAuth.';
      PA.addMessage('error', `${PA.providerName()} n’est pas connecté. ${action}`);
      return;
    }

    const timestamp = PA.currentTime();
    const transcriptContext = PA.state.transcript.length ? PA.transcriptContextAt(timestamp) : [];
    const hasVideoContext = transcriptContext.length > 0;

    const video = PA.qs('video');
    if (PA.state.settings.pauseOnQuestion && video && !video.paused) video.pause();

    PA.addMessage('user', question, PA.fmt(timestamp));
    input.value = '';
    PA.state.busy = true;
    send.disabled = true;

    const model = PA.selectedModelName();
    const sourceLabel = hasVideoContext
      ? (PA.state.transcriptSource === 'generated' ? 'transcription IA' : 'transcription YouTube')
      : 'aucune transcription';
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
          transcriptAvailable: hasVideoContext,
          transcriptSource: hasVideoContext ? PA.state.transcriptSource : 'none',
          transcriptDiagnostics: hasVideoContext ? (PA.state.transcriptDiagnostics || null) : null,
          settings: {
            responseLanguage: PA.state.settings.responseLanguage,
            responseStyle: PA.state.settings.responseStyle,
            webSearch: PA.state.settings.webSearch,
            codexModel: PA.state.settings.codexModel,
            codexEffort: PA.state.settings.codexEffort,
            apiProvider: PA.state.settings.apiProvider,
            apiModel: PA.state.settings.apiModel,
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
