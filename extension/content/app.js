(() => {
  const PA = globalThis.ProfessorAskContent;

  async function onVideoChanged() {
    PA.state.videoId = PA.getVideoId();
    if (!PA.state.videoId) return;

    PA.injectPanel();
    await PA.loadSettings();
    await PA.loadHistory();
    await PA.loadTranscript();
    await PA.fetchProviderStatus();
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;

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
    if (location.href !== PA.state.lastUrl) {
      PA.state.lastUrl = location.href;
      setTimeout(onVideoChanged, 500);
    }

    const time = PA.qs('#pa-time');
    if (time) time.textContent = PA.fmt(PA.currentTime());
    if (PA.getVideoId() && !PA.qs('#professor-ask-root')) PA.injectPanel();
  }, 500);

  setInterval(() => {
    if (PA.getVideoId()) PA.fetchProviderStatus();
  }, 60000);

  setTimeout(onVideoChanged, 800);
})();
