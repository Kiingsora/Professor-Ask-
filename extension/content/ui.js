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

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  function sourceHost(url) {
    return url.hostname.toLowerCase().replace(/^www\./, '');
  }

  function normalizeCitationWrappers(value) {
    return value.replace(/\(\s*(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))\s*\)/g, '$1');
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

  PA.renderAnswer = function renderAnswer(container, answer, sources = []) {
    if (!container) return;

    const rawAnswer = String(answer || '(Réponse vide)');
    const sourceList = Array.isArray(sources) ? sources.slice(0, 12) : [];
    container.__paRawAnswer = rawAnswer;
    container.__paSources = sourceList;
    container.replaceChildren();

    const idsByHost = new Map();
    const citationId = url => {
      const host = sourceHost(url);
      if (!idsByHost.has(host)) idsByHost.set(host, idsByHost.size + 1);
      return idsByHost.get(host);
    };

    const createCitation = (url, label = '') => {
      const id = citationId(url);
      const host = sourceHost(url);
      const link = document.createElement('a');
      link.className = 'pa-citation';
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `[${id}]`;
      link.title = label && label !== host ? `${label} — ${host}` : host;
      link.setAttribute('aria-label', `Source ${id} : ${label || host}`);
      return link;
    };

    const appendLinkedText = value => {
      const text = normalizeCitationWrappers(cleanPlainText(value));
      const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>\])]+)/g;
      let cursor = 0;
      let match;

      while ((match = pattern.exec(text))) {
        if (match.index > cursor) container.appendChild(document.createTextNode(text.slice(cursor, match.index)));

        let rawUrl = match[2] || match[3] || '';
        let trailing = '';
        if (!match[2]) {
          while (/[.,;:!?]$/.test(rawUrl)) {
            trailing = rawUrl.slice(-1) + trailing;
            rawUrl = rawUrl.slice(0, -1);
          }
        }

        const url = safeHttpUrl(rawUrl);
        if (url) {
          container.appendChild(createCitation(url, match[1] || sourceHost(url)));
          if (trailing) container.appendChild(document.createTextNode(trailing));
        } else {
          container.appendChild(document.createTextNode(match[0]));
        }
        cursor = pattern.lastIndex;
      }

      if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
    };

    appendLinkedText(rawAnswer);

    const validSources = sourceList
      .map(source => ({ source, url: safeHttpUrl(source?.url) }))
      .filter(item => item.url);

    if (validSources.length) {
      const block = document.createElement('div');
      block.className = 'pa-answer-sources';
      const label = document.createElement('span');
      label.className = 'pa-answer-sources-label';
      label.textContent = 'Sources';
      block.appendChild(label);

      const seen = new Set();
      for (const { source, url } of validSources) {
        const host = sourceHost(url);
        if (seen.has(host)) continue;
        seen.add(host);
        block.appendChild(createCitation(url, source.title || host));
      }
      container.appendChild(block);
    }
  };

  PA.addMessage = function addMessage(role, text, meta = '', sources = []) {
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
    body.className = 'pa-msg-body';
    if (role === 'assistant') PA.renderAnswer(body, text, sources);
    else body.textContent = text;
    element.appendChild(body);
    box.appendChild(element);
    box.scrollTop = box.scrollHeight;
    return element;
  };

  PA.formatAnswer = function formatAnswer(answer) {
    return cleanPlainText(answer || '(Réponse vide)');
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
