(() => {
  const DEFAULTS = {
    provider: 'codex',
    codexModel: 'auto',
    codexEffort: 'auto',
    antigravityModel: 'auto',
    responseLanguage: 'auto',
    responseStyle: 'balanced',
    webSearch: 'auto',
    pauseOnQuestion: true,
    contextSeconds: 180,
    transcriptLanguage: 'auto',
    includeMetadata: true,
    theme: 'auto',
    panelSize: 'standard',
    rememberHistory: true,
    historyLimit: 30,
  };

  const state = {
    videoId: null,
    transcript: [],
    connected: false,
    providerStatus: null,
    busy: false,
    lastUrl: location.href,
    settings: { ...DEFAULTS },
  };

  const qs = (s, root = document) => root.querySelector(s);

  function bridgeFetch(path, { method = 'GET', body } = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'BRIDGE_FETCH', path, method, body },
        response => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response) return reject(new Error('Aucune réponse du service worker Professor Ask.'));
          resolve(response);
        },
      );
    });
  }

  function getVideoId() {
    try { return new URL(location.href).searchParams.get('v'); } catch { return null; }
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  function currentTime() {
    const video = qs('video');
    return video ? video.currentTime || 0 : 0;
  }

  function providerName() {
    return state.settings.provider === 'antigravity' ? 'Antigravity' : 'Codex';
  }

  function selectedModelName() {
    if (state.settings.provider === 'antigravity') return state.settings.antigravityModel || 'auto';
    return state.settings.codexModel || 'auto';
  }

  async function loadSettings() {
    const saved = await chrome.storage.sync.get(DEFAULTS);
    state.settings = { ...DEFAULTS, ...saved };
    applyAppearance();
    renderStatus();
  }

  function applyAppearance() {
    const root = qs('#professor-ask-root');
    if (!root) return;
    root.classList.remove('pa-theme-dark', 'pa-theme-light', 'pa-size-compact', 'pa-size-standard', 'pa-size-large');
    const theme = state.settings.theme === 'auto'
      ? (document.documentElement.hasAttribute('dark') ? 'dark' : 'light')
      : state.settings.theme;
    root.classList.add(`pa-theme-${theme}`);
    root.classList.add(`pa-size-${state.settings.panelSize || 'standard'}`);
  }

  async function fetchProviderStatus() {
    try {
      const provider = state.settings.provider === 'antigravity' ? 'antigravity' : 'codex';
      const response = await bridgeFetch(`/providers/${provider}/status`);
      const data = response.data || {};
      state.connected = !!(response.ok && data.connected);
      state.providerStatus = data;
    } catch {
      state.connected = false;
      state.providerStatus = null;
    }
    renderStatus();
  }

  function openSettings() {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }, response => {
      if (chrome.runtime.lastError) {
        addMessage('error', `Impossible d'ouvrir les paramètres : ${chrome.runtime.lastError.message}`);
        return;
      }
      if (response && response.ok === false) addMessage('error', response.error || 'Impossible d’ouvrir les paramètres.');
    });
  }

  function renderStatus() {
    const status = qs('#pa-status');
    const provider = qs('#pa-provider');
    if (provider) provider.textContent = providerName();
    if (!status) return;

    if (state.connected) {
      status.innerHTML = `<span class="pa-dot ok"></span><span>${providerName()} connecté</span>`;
    } else if (state.providerStatus?.installed === false) {
      status.innerHTML = `<span class="pa-dot warn"></span><span>${providerName()} CLI absent</span>`;
    } else {
      status.innerHTML = `<span class="pa-dot warn"></span><span>${providerName()} hors ligne</span>`;
    }
  }

  function injectPanel() {
    if (qs('#professor-ask-root')) return;
    const secondary = qs('#secondary-inner') || qs('#secondary');
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
    qs('#pa-settings').addEventListener('click', openSettings);
    qs('#pa-send').addEventListener('click', sendQuestion);
    qs('#pa-input').addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendQuestion();
      }
    });

    applyAppearance();
    loadHistory();
    fetchProviderStatus();
  }

  function addMessage(role, text, meta = '') {
    const box = qs('#pa-messages');
    if (!box) return;
    qs('#pa-empty')?.remove();
    const el = document.createElement('div');
    el.className = `pa-msg ${role}`;

    if (meta) {
      const m = document.createElement('div');
      m.className = 'pa-msg-meta';
      m.textContent = meta;
      el.appendChild(m);
    }

    const body = document.createElement('div');
    body.textContent = text;
    el.appendChild(body);
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  async function storageGet(key) {
    return new Promise(resolve => chrome.storage.local.get([key], value => resolve(value[key])));
  }

  async function storageSet(key, value) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
  }

  function historyKey() {
    return `pa-history:${state.videoId || 'none'}:${state.settings.provider}`;
  }

  async function loadHistory() {
    if (!state.videoId) return;
    const box = qs('#pa-messages');
    if (!box) return;
    box.innerHTML = '';

    if (!state.settings.rememberHistory) {
      box.innerHTML = '<div class="pa-empty" id="pa-empty">Pose une question sur ce qui vient d\'être dit dans la vidéo.</div>';
      return;
    }

    const history = await storageGet(historyKey()) || [];
    if (!history.length) {
      box.innerHTML = '<div class="pa-empty" id="pa-empty">Pose une question sur ce qui vient d\'être dit dans la vidéo.</div>';
      return;
    }
    history.forEach(message => addMessage(message.role, message.text, message.meta || ''));
  }

  async function saveHistory() {
    if (!state.settings.rememberHistory) return;
    const nodes = [...document.querySelectorAll('#pa-messages .pa-msg')];
    const limit = Number(state.settings.historyLimit) || 30;
    const history = nodes
      .filter(node => !node.classList.contains('error'))
      .map(node => ({
        role: node.classList.contains('user') ? 'user' : 'assistant',
        meta: node.querySelector('.pa-msg-meta')?.textContent || '',
        text: node.lastElementChild?.textContent || node.textContent,
      }))
      .slice(-limit);
    await storageSet(historyKey(), history);
  }

  function transcriptContextAt(time) {
    if (!state.transcript.length) return [];
    const radius = Number(state.settings.contextSeconds) || 180;
    const start = Math.max(0, time - radius);
    const end = time + radius;
    return state.transcript.filter(item => item.start <= end && (item.start + item.duration) >= start);
  }

  function formatAnswer(answer, sources) {
    let text = answer || '(Réponse vide)';
    if (Array.isArray(sources) && sources.length) {
      text += '\n\nSources :\n' + sources.slice(0, 6).map(source => `• ${source.title || source.url} — ${source.url}`).join('\n');
    }
    return text;
  }

  async function sendQuestion() {
    if (state.busy) return;
    const input = qs('#pa-input');
    const send = qs('#pa-send');
    const question = input?.value.trim();
    if (!question) return;

    if (!state.connected) {
      addMessage('error', `${providerName()} n’est pas connecté. Ouvre les paramètres pour lancer la connexion OAuth.`);
      return;
    }

    const video = qs('video');
    if (state.settings.pauseOnQuestion && video && !video.paused) video.pause();

    const t = currentTime();
    addMessage('user', question, fmt(t));
    input.value = '';
    state.busy = true;
    send.disabled = true;
    const model = selectedModelName();
    const placeholder = addMessage('assistant', 'Réflexion…', model === 'auto' ? providerName() : `${providerName()} · ${model}`);

    try {
      const includeMetadata = !!state.settings.includeMetadata;
      const title = includeMetadata
        ? (qs('h1 yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/, ''))
        : '';
      const channel = includeMetadata ? (qs('ytd-channel-name a')?.textContent?.trim() || '') : '';

      const response = await bridgeFetch('/chat', {
        method: 'POST',
        body: {
          provider: state.settings.provider,
          videoId: state.videoId,
          title,
          channel,
          timestamp: t,
          question,
          transcript: transcriptContextAt(t),
          settings: {
            responseLanguage: state.settings.responseLanguage,
            responseStyle: state.settings.responseStyle,
            webSearch: state.settings.webSearch,
            codexModel: state.settings.codexModel,
            codexEffort: state.settings.codexEffort,
            antigravityModel: state.settings.antigravityModel,
          },
        },
      });

      const data = response.data || {};
      if (!response.ok) throw new Error(response.error || data.error || `Erreur ${providerName()}`);
      placeholder.lastElementChild.textContent = formatAnswer(data.answer, data.sources);
      await saveHistory();
    } catch (error) {
      placeholder.remove();
      addMessage('error', error.message);
    } finally {
      state.busy = false;
      send.disabled = false;
    }
  }

  function decodeHtml(text) {
    const d = document.createElement('textarea');
    d.innerHTML = text;
    return d.value;
  }

  function chooseTrack(tracks) {
    const preferred = state.settings.transcriptLanguage;
    if (preferred === 'fr') return tracks.find(track => /^fr([_-]|$)/i.test(track.languageCode)) || tracks[0];
    if (preferred === 'en') return tracks.find(track => /^en([_-]|$)/i.test(track.languageCode)) || tracks[0];

    const browserLanguage = (navigator.language || '').split('-')[0];
    return tracks.find(track => track.languageCode?.toLowerCase().startsWith(browserLanguage.toLowerCase()))
      || tracks.find(track => /^fr([_-]|$)/i.test(track.languageCode))
      || tracks.find(track => /^en([_-]|$)/i.test(track.languageCode))
      || tracks[0];
  }

  async function loadTranscript() {
    state.transcript = [];
    const badge = qs('#pa-transcript');
    if (badge) badge.textContent = 'Transcription...';

    try {
      const html = await fetch(location.href, { credentials: 'include' }).then(response => response.text());
      const match = html.match(/"captionTracks":(\[.*?\]),"audioTracks"/s);
      if (!match) throw new Error('no captions');
      const tracks = JSON.parse(match[1]);
      const preferred = chooseTrack(tracks);
      if (!preferred?.baseUrl) throw new Error('no caption url');

      const url = preferred.baseUrl + (preferred.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
      const data = await fetch(url, { credentials: 'include' }).then(response => response.json());
      state.transcript = (data.events || [])
        .filter(event => event.segs?.length)
        .map(event => ({
          start: (event.tStartMs || 0) / 1000,
          duration: (event.dDurationMs || 0) / 1000,
          text: decodeHtml(event.segs.map(segment => segment.utf8 || '').join('').replace(/\n/g, ' ')).trim(),
        }))
        .filter(item => item.text);

      if (badge) badge.textContent = `${state.transcript.length} segments`;
    } catch {
      if (badge) badge.textContent = 'Pas de transcription';
    }
  }

  async function onVideoChanged() {
    state.videoId = getVideoId();
    if (!state.videoId) return;
    injectPanel();
    await loadSettings();
    await loadHistory();
    await loadTranscript();
    await fetchProviderStatus();
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    const previousTranscriptLanguage = state.settings.transcriptLanguage;
    const previousProvider = state.settings.provider;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) state.settings[key] = change.newValue;
    }
    applyAppearance();
    renderStatus();
    if (previousProvider !== state.settings.provider) await loadHistory();
    if (previousTranscriptLanguage !== state.settings.transcriptLanguage) await loadTranscript();
    await fetchProviderStatus();
  });

  setInterval(() => {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href;
      setTimeout(onVideoChanged, 500);
    }

    const time = qs('#pa-time');
    if (time) time.textContent = fmt(currentTime());
    if (getVideoId() && !qs('#professor-ask-root')) injectPanel();
  }, 500);

  setInterval(() => {
    if (getVideoId()) fetchProviderStatus();
  }, 60000);

  setTimeout(onVideoChanged, 800);
})();
