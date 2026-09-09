(() => {
  const API = 'http://127.0.0.1:43119';
  const state = {
    videoId: null,
    transcript: [],
    connected: false,
    account: null,
    busy: false,
    lastUrl: location.href,
  };

  const qs = (s, root = document) => root.querySelector(s);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function getVideoId() {
    try { return new URL(location.href).searchParams.get('v'); } catch { return null; }
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
  }

  function currentTime() {
    const video = qs('video');
    return video ? video.currentTime || 0 : 0;
  }

  async function fetchAccount() {
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

  async function connectCodex() {
    const btn = qs('#pa-connect');
    if (btn) { btn.disabled = true; btn.textContent = 'Connexion...'; }
    try {
      const r = await fetch(`${API}/login`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Impossible de lancer la connexion Codex.');
      if (data.authUrl) window.open(data.authUrl, '_blank', 'noopener,noreferrer');
      for (let i = 0; i < 90; i++) {
        await sleep(1500);
        await fetchAccount();
        if (state.connected) break;
      }
    } catch (e) {
      addMessage('error', e.message);
    } finally {
      renderStatus();
    }
  }

  function renderStatus() {
    const status = qs('#pa-status');
    const connect = qs('#pa-connect');
    if (!status || !connect) return;
    if (state.connected) {
      status.innerHTML = `<span class="pa-dot ok"></span><span>Codex connecté</span>`;
      connect.textContent = state.account?.email || 'Connecté';
      connect.disabled = true;
    } else {
      status.innerHTML = `<span class="pa-dot warn"></span><span>Bridge/Codex hors ligne</span>`;
      connect.textContent = 'Connecter Codex';
      connect.disabled = false;
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
          <button class="pa-connect" id="pa-connect">Connecter Codex</button>
        </header>
        <div class="pa-toolbar">
          <span class="pa-pill" id="pa-time">0:00</span>
          <span class="pa-pill" id="pa-transcript">Transcription...</span>
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
    qs('#pa-connect').addEventListener('click', connectCodex);
    qs('#pa-send').addEventListener('click', sendQuestion);
    qs('#pa-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
    });
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
  function historyKey() { return `pa-history:${state.videoId || 'none'}`; }

  async function loadHistory() {
    if (!state.videoId) return;
    const history = await storageGet(historyKey()) || [];
    const box = qs('#pa-messages');
    if (!box) return;
    box.innerHTML = '';
    if (!history.length) {
      box.innerHTML = '<div class="pa-empty" id="pa-empty">Pose une question sur ce qui vient d\'être dit dans la vidéo.</div>';
      return;
    }
    history.forEach(m => addMessage(m.role, m.text, m.meta || ''));
  }

  async function saveHistory() {
    const nodes = [...document.querySelectorAll('#pa-messages .pa-msg')];
    const history = nodes.filter(n => !n.classList.contains('error')).map(n => ({
      role: n.classList.contains('user') ? 'user' : 'assistant',
      meta: n.querySelector('.pa-msg-meta')?.textContent || '',
      text: n.lastElementChild?.textContent || n.textContent,
    })).slice(-30);
    await storageSet(historyKey(), history);
  }

  function transcriptContextAt(time, radius = 150) {
    if (!state.transcript.length) return [];
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
    if (!state.connected) {
      addMessage('error', 'Démarre le bridge local puis connecte ton compte Codex.');
      return;
    }

    const t = currentTime();
    addMessage('user', question, fmt(t));
    input.value = '';
    state.busy = true;
    send.disabled = true;
    const placeholder = addMessage('assistant', 'Réflexion…', 'Codex');

    try {
      const title = qs('h1 yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/, '');
      const channel = qs('ytd-channel-name a')?.textContent?.trim() || '';
      const context = transcriptContextAt(t, 180);
      const r = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: state.videoId,
          title,
          channel,
          timestamp: t,
          question,
          transcript: context,
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

  async function loadTranscript() {
    state.transcript = [];
    const badge = qs('#pa-transcript');
    if (badge) badge.textContent = 'Transcription...';
    try {
      const html = await fetch(location.href, { credentials: 'include' }).then(r => r.text());
      const m = html.match(/"captionTracks":(\[.*?\]),"audioTracks"/s);
      if (!m) throw new Error('no captions');
      const tracks = JSON.parse(m[1]);
      const preferred = tracks.find(t => /^fr([_-]|$)/i.test(t.languageCode)) || tracks.find(t => /^en([_-]|$)/i.test(t.languageCode)) || tracks[0];
      if (!preferred?.baseUrl) throw new Error('no caption url');
      const url = preferred.baseUrl + (preferred.baseUrl.includes('?') ? '&' : '?') + 'fmt=json3';
      const json = await fetch(url, { credentials: 'include' }).then(r => r.json());
      state.transcript = (json.events || []).filter(e => e.segs?.length).map(e => ({
        start: (e.tStartMs || 0) / 1000,
        duration: (e.dDurationMs || 0) / 1000,
        text: decodeHtml(e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ')).trim(),
      })).filter(x => x.text);
      if (badge) badge.textContent = `${state.transcript.length} segments`;
    } catch {
      if (badge) badge.textContent = 'Pas de transcription';
    }
  }

  async function onVideoChanged() {
    state.videoId = getVideoId();
    if (!state.videoId) return;
    injectPanel();
    await loadHistory();
    await loadTranscript();
  }

  setInterval(() => {
    if (location.href !== state.lastUrl) {
      state.lastUrl = location.href;
      setTimeout(onVideoChanged, 500);
    }
    const time = qs('#pa-time');
    if (time) time.textContent = fmt(currentTime());
    if (getVideoId() && !qs('#professor-ask-root')) injectPanel();
  }, 500);

  setTimeout(onVideoChanged, 800);
})();
