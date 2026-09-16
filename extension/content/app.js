(() => {
  const PA = globalThis.ProfessorAskContent;

  async function onVideoChanged() {
    if (PA.state.contextValid === false) return;

    PA.state.videoId = PA.getVideoId();
    if (!PA.state.videoId) return;

    PA.injectPanel();
    const settingsLoaded = await PA.loadSettings();
    if (!settingsLoaded || PA.state.contextValid === false) return;

    await PA.loadHistory();
    await PA.loadTranscript();
    await PA.fetchProviderStatus();
  }

  PA.ext.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync' || PA.state.contextValid === false) return;

    const previousTranscriptLanguage = PA.state.settings.transcriptLanguage;
    const previousProvider = PA.state.settings.provider;

    for (const [key, change] of Object.entries(changes)) {
      if (key in PA.DEFAULTS) PA.state.settings[key] = change.newValue;
    }

    PA.applyAppearance();
    PA.renderStatus();
    if (previousProvider !== PA.state.settings.provider) await PA.loadHistory();
    if (previousTranscriptLanguage !== PA.state.settings.transcriptLanguage) await PA.loadTranscript();
    await PA.fetchProviderStatus();
  });

  setInterval(() => {
    if (PA.state.contextValid === false) return;

    if (location.href !== PA.state.lastUrl) {
      PA.state.lastUrl = location.href;
      setTimeout(onVideoChanged, 500);
    }

    const time = PA.qs('#pa-time');
    if (time) time.textContent = PA.fmt(PA.currentTime());
    if (PA.getVideoId() && !PA.qs('#professor-ask-root')) PA.injectPanel();
  }, 500);

  setInterval(() => {
    if (PA.state.contextValid === false) return;
    if (PA.getVideoId()) PA.fetchProviderStatus();
  }, 60000);

  setTimeout(onVideoChanged, 800);
})();
