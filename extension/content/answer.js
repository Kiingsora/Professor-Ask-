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

    if (!validSources.length) return;

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
  };
})();
