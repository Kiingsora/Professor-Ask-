(() => {
  const PA = globalThis.ProfessorAskContent;

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
      status.innerHTML = `<span class="pa-dot ok"></span><span>${PA.providerName()} connecté</span>`;
    } else if (PA.state.providerStatus?.installed === false) {
      status.innerHTML = `<span class="pa-dot warn"></span><span>${PA.providerName()} CLI absent</span>`;
    } else {
      status.innerHTML = `<span class="pa-dot warn"></span><span>${PA.providerName()} hors ligne</span>`;
    }
  };

  PA.openSettings = function openSettings() {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, response => {
      if (chrome.runtime.lastError) {
        PA.addMessage('error', `Impossible d'ouvrir les paramètres : ${chrome.runtime.lastError.message}`);
        return;
      }
      if (response?.ok === false) PA.addMessage('error', response.error || 'Impossible d’ouvrir les paramètres.');
    });
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
    let text = answer || '(Réponse vide)';
    if (Array.isArray(sources) && sources.length) {
      text += '\n\nSources :\n' + sources.slice(0, 6).map(source => `• ${source.title || source.url} — ${source.url}`).join('\n');
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
          <span class="pa-pill" id="pa-transcript">Transcription...</span>
          <span class="pa-pill" id="pa-provider">Codex</span>
          <span class="pa-status" id="pa-status"></span>
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

    PA.applyAppearance();
    PA.loadHistory();
    PA.fetchProviderStatus();
  };
})();
