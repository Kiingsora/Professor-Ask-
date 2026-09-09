(() => {
  const API = 'http://127.0.0.1:43119';
  const DEFAULTS = {
    provider: 'codex',
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
    account: null,
    busy: false,
    lastUrl: location.href,
    settings: { ...DEFAULTS },
  };

  const qs = (s, root = document) => root.querySelector(s);

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

  async function fetchAccount() {
    if (state.settings.provider !== 'codex') {
      state.connected = false;
      state.account = null;
      renderStatus();
      return;
    }
    try {
      const r = await fetch(`${API}/account`);
      const data = await r.json();
      state.connected = !!data.connected;
      state.account = data.account || null;
    } catch {
      state.connected = false;
      state.account = null;
    }
    renderStatus();
  }

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  function renderStatus() {
    const status = qs('#pa-status');
    const provider = qs('#pa-provider');
    if (provider) provider.textContent = state.settings.provider === 'gemini' ? 'Gemini' : 'Codex';
    if (!status) return;

    if (state.settings.provider === 'gemini') {
      status.innerHTML = '<span class="pa-dot warn"></span><span>Gemini à configurer</span>';
      return;
    }

    if (state.connected) {
      status.innerHTML = '<span class="pa-dot ok"></span><span>Codex connecté</span>';
    } else {
      status.innerHTML = '<span class="pa-dot warn"></span><span>Codex hors ligne</span>';
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
    qs('#pa-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendQuestion();
      }
    });

    applyAppearance();
    loadHistory();
    fetchAccount();
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
    return new Promise(resolve => chrome.storage.local.get([key], x => resolve(x[key])));
  }

  async function storageSet(key, value) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
  }

  function historyKey() {
    return `pa-history:${state.videoId || 'none'}`;
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

    history.forEach(m => addMessage(m.role, m.text, m.meta || ''));
  }

  async function saveHistory() {
    if (!state.settings.rememberHistory) return;
    const nodes = [...document.querySelectorAll('#pa-messages .pa-msg')];
    const limit = Number(state.settings.historyLimit) || 30;
    const history = nodes
      .filter(n => !n.classList.contains('error'))
      .map(n => ({
        role: n.classList.contains('user') ? 'user' : 'assistant',
        meta: n.querySelector('.pa-msg-meta')?.textContent || '',
        text: n.lastElementChild?.textContent || n.textContent,
      }))
      .slice(-limit);
    await storageSet(historyKey(), history);
  }

  function transcriptContextAt(time) {
    if (!state.transcript.length) return [];
    const radius = Number(state.settings.contextSeconds) || 180;
    const start = Math.max(0, time - radius);
    const end = time + radius;
    return state.transcript.filter(x => x.start <= end && (x.start + x.duration) >= start);
  }

  async function sendQuestion() {
    if (state.busy) return;
    const input = qs('#pa-input');
    const send = qs('#pa-send');
    const question = input?.value.trim();
    if (!question) return;

    if (state.settings.provider === 'gemini') {
      addMessage('error', 'Gemini est sélectionné, mais son connecteur chat n’est pas encore branché. Ouvre les paramètres pour changer de fournisseur.');
      return;
    }

    if (!state.connected) {
      addMessage('error', 'Codex n’est pas connecté. Ouvre les paramètres de Professor Ask pour lancer la connexion.');
      return;
    }

    const video = qs('video');
    if (state.settings.pauseOnQuestion && video && !video.paused) video.pause();

    const t = currentTime();
    addMessage('user', question, fmt(t));
    input.value = '';
    state.busy = true;
    send.disabled = true;
    const placeholder = addMessage('assistant', 'Réflexion…', 'Codex');

    try {
      const includeMetadata = !!state.settings.includeMetadata;
      const title = includeMetadata
        ? (qs('h1 yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/, ''))
        : '';
      const channel = includeMetadata ? (qs('ytd-channel-name a')?.textContent?.trim() || '') : '';
      const context = transcriptContextAt(t);

      const r = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: state.settings.provider,
          videoId: state.videoId,
          title,
          channel,
          timestamp: t,
          question,
          transcript: context,
          settings: {
            responseLanguage: state.settings.responseLanguage,
            responseStyle: state.settings.responseStyle,
            webSearch: state.settings.webSearch,
          },
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erreur Codex');
      placeholder.lastElementChild.textContent = data.answer || '(Réponse vide)';
      await saveHistory();
    } catch (e) {
      placeholder.remove();
      addMessage('error', e.message);
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
    if (preferred === 'fr') return tracks.find(t => /^fr([_-]|$)/i.test(t.languageCode)) || tracks[0];
    if (preferred === 'en') return tracks.find(t => /^en([_-]|$)/i.test(t.languageCode)) || tracks[0];

    const browserLanguage = (navigator.language || '').split('-')[0];
    return tracks.find(t => t.languageCode?.toLowerCase().startsWith(browserLanguage.toLowerCase()))
      || tracks.find(t => /^fr([_-]|$)/i.test(t.languageCode))
      || tracks.find(t => /^en([_-]|$)/i.test(t.languageCode))
      || tracks[0];
  }

  async function loadTranscript() {
    state.transcript = [];
    const badge = qs('#pa-transcript');
    if (badge) badge.textContent = 'Transcription...';

    try {
      const html = await fetch(location.href, { credentials: 'include' }).then(r => r.text());
      const m = html.match(/"captionTracks":(\[.*?\]),"audioTracks"/s);
      if (!m) throw new Error('no captions');
      const tracks = JSON.parse(m[1]);
      const preferred = chooseTrack(tracks);
      if (!preferred?.baseUrl) throw new Error('no caption url');

      const url = preferred.baseUrl + (preferred.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
      const json = await fetch(url, { credentials: 'include' }).then(r => r.json());
      state.transcript = (json.events || [])
        .filter(e => e.segs?.length)
        .map(e => ({
          start: (e.tStartMs || 0) / 1000,
          duration: (e.dDurationMs || 0) / 1000,
          text: decodeHtml(e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ')).trim(),
        }))
        .filter(x => x.text);

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
    await fetchAccount();
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    const previousTranscriptLanguage = state.settings.transcriptLanguage;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULTS) state.settings[key] = change.newValue;
    }
    applyAppearance();
    renderStatus();
    await loadHistory();
    if (previousTranscriptLanguage !== state.settings.transcriptLanguage) await loadTranscript();
    await fetchAccount();
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
    if (getVideoId()) fetchAccount();
  }, 15000);

  setTimeout(onVideoChanged, 800);
})();
