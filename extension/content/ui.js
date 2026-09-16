(() => {
  const PA = globalThis.ProfessorAskContent;

  function cleanPlainText(value) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/^\s{0,3}#{1,6}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/gs, '$1')
      .replace(/__(.*?)__/gs, '$1')
      .replace(/^\s*[-*•]\s+/gm, '')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  PA.applyAppearance = function applyAppearance() {
    const root = PA.qs('#professor-ask-root');
    if (!root) return;

    root.classList.remove('pa-theme-dark', 'pa-theme-light', 'pa-size-compact', 'pa-size-standard', 'pa-size-large');
    const theme = PA.state.settings.theme === 'auto'
      ? (document.documentElement.hasAttribute('dark') ? 'dark' : 'light')
      : PA.state.settings.theme;
    root.classList.add(`pa-theme-${theme}`);
    root.classList.add(`pa-size-${PA.state.settings.panelSize || 'standard'}`);
  };

  PA.renderStatus = function renderStatus() {
    const status = PA.qs('#pa-status');
    const provider = PA.qs('#pa-provider');
    if (provider) provider.textContent = PA.providerName();
    if (!status) return;

    if (PA.state.connected) {
      status.innerHTML = '<span class="pa-dot ok"></span><span>Connecté</span>';
    } else {
      status.innerHTML = '<span class="pa-dot warn"></span><span>Hors ligne</span>';
    }
  };

  PA.openSettings = async function openSettings() {
    try {
      const response = await PA.ext.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      if (response?.ok === false) PA.addMessage('error', response.error || 'Impossible d’ouvrir les paramètres.');
    } catch (error) {
      PA.addMessage('error', `Impossible d'ouvrir les paramètres : ${error.message}`);
    }
  };

  PA.addMessage = function addMessage(role, text, meta = '') {
    const box = PA.qs('#pa-messages');
    if (!box) return null;

    PA.qs('#pa-empty')?.remove();
    const element = document.createElement('div');
    element.className = `pa-msg ${role}`;

    if (meta) {
      const metadata = document.createElement('div');
      metadata.className = 'pa-msg-meta';
      metadata.textContent = meta;
      element.appendChild(metadata);
    }

    const body = document.createElement('div');
    body.textContent = text;
    element.appendChild(body);
    box.appendChild(element);
    box.scrollTop = box.scrollHeight;
    return element;
  };

  PA.formatAnswer = function formatAnswer(answer, sources) {
    let text = cleanPlainText(answer || '(Réponse vide)');
    if (Array.isArray(sources) && sources.length) {
      const sourceLines = sources.slice(0, 6)
        .map(source => `${source.title || source.url} — ${source.url}`)
        .filter(Boolean);
      if (sourceLines.length) text += `\n\nSources :\n${sourceLines.join('\n')}`;
    }
    return text;
  };

  PA.injectPanel = function injectPanel() {
    if (PA.qs('#professor-ask-root')) return;
    const secondary = PA.qs('#secondary-inner') || PA.qs('#secondary');
    if (!secondary) return;

    const root = document.createElement('div');
    root.id = 'professor-ask-root';
    root.innerHTML = `
      <section class="pa-card">
        <header class="pa-header">
          <div>
            <div class="pa-title">Professor Ask</div>
            <div class="pa-subtitle">Discute avec la vidéo au moment exact.</div>
          </div>
          <button class="pa-settings" id="pa-settings" title="Paramètres" aria-label="Paramètres">⚙</button>
        </header>
        <div class="pa-toolbar">
          <span class="pa-pill" id="pa-time">0:00</span>
          <span class="pa-source-state pa-source-toggle" id="pa-subtitles-state" role="button" tabindex="0" aria-expanded="false" aria-controls="pa-transcript-drawer" title="Vérification des pistes YouTube">
            <span class="pa-source-icon pa-source-icon-subtitles is-checking" id="pa-subtitles-icon" role="img" aria-label="État des sous-titres"></span>
            <span class="pa-source-error" id="pa-subtitles-text" hidden></span>
          </span>
          <span class="pa-source-state" id="pa-transcription-state" title="Vérification de la transcription">
            <span class="pa-source-icon pa-source-icon-transcript is-checking" id="pa-transcription-icon" role="img" aria-label="État de la transcription"></span>
            <span class="pa-source-error" id="pa-transcription-text" hidden></span>
          </span>
          <span class="pa-pill" id="pa-provider">Codex</span>
          <span class="pa-status" id="pa-status"></span>
        </div>
        <div class="pa-transcript-drawer" id="pa-transcript-drawer" hidden>
          <div class="pa-transcript-drawer-head">
            <strong>Transcription</strong>
            <span id="pa-transcript-drawer-detail"></span>
          </div>
          <div class="pa-transcript-lines" id="pa-transcript-lines">Transcription en cours de récupération…</div>
        </div>
        <div class="pa-messages" id="pa-messages">
          <div class="pa-empty" id="pa-empty">Pose une question sur ce qui vient d'être dit dans la vidéo.</div>
        </div>
        <div class="pa-composer">
          <textarea class="pa-input" id="pa-input" placeholder="Qu'est-ce qu'il veut dire ici ?"></textarea>
          <button class="pa-send" id="pa-send" title="Envoyer">↑</button>
        </div>
      </section>`;

    secondary.prepend(root);
    PA.qs('#pa-settings').addEventListener('click', PA.openSettings);
    PA.qs('#pa-send').addEventListener('click', () => PA.sendQuestion());
    PA.qs('#pa-input').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        PA.sendQuestion();
      }
    });

    const subtitleToggle = PA.qs('#pa-subtitles-state');
    subtitleToggle?.addEventListener('click', () => PA.toggleTranscriptPreview?.());
    subtitleToggle?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        PA.toggleTranscriptPreview?.();
      }
    });

    PA.applyAppearance();
    PA.loadHistory();
    PA.fetchProviderStatus();
  };
})();
