(() => {
  let banner;
  let retryButton;
  let statusText;
  let replayingClick = false;

  function ensureBanner() {
    if (banner) return banner;
    const shell = document.querySelector('.settings-shell');
    if (!shell) return null;

    banner = document.createElement('section');
    banner.className = 'loopback-diagnostic';
    banner.innerHTML = `
      <div>
        <strong>Professor Ask Companion</strong>
        <span id="loopback-diagnostic-text">Vérification…</span>
      </div>
      <button class="button" id="loopback-retry" type="button">Retester</button>
    `;

    const hero = shell.querySelector('.hero');
    hero?.insertAdjacentElement('afterend', banner);
    retryButton = banner.querySelector('#loopback-retry');
    statusText = banner.querySelector('#loopback-diagnostic-text');
    retryButton?.addEventListener('click', () => probeCompanion().catch(() => {}));

    const footerFirst = document.querySelector('.footer-note span:first-child');
    if (footerFirst) footerFirst.innerHTML = 'Companion : <code>Chrome Native Messaging</code>';
    const footerLast = document.querySelector('.footer-note span:last-child');
    if (footerLast) footerLast.textContent = 'Professor Ask v0.5';

    return banner;
  }

  function setState(text, kind) {
    ensureBanner();
    if (!banner || !statusText) return;
    banner.dataset.state = kind || '';
    statusText.textContent = text;
  }

  function companionRequest() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'BRIDGE_FETCH', path: '/health', method: 'GET' },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.ok) {
            reject(new Error(response?.error || 'Professor Ask Companion indisponible.'));
            return;
          }
          resolve(response.data || {});
        },
      );
    });
  }

  async function probeCompanion() {
    ensureBanner();
    setState('Vérification du companion Windows…', 'checking');

    try {
      const data = await companionRequest();
      setState(
        `Installé · Native Messaging · v${data.version || '?'} · PID ${data.pid || '?'}`,
        'ok',
      );
      window.professorAskLoopbackReady = true;
      return data;
    } catch (error) {
      window.professorAskLoopbackReady = false;
      setState(
        `${error.message} Aucun terminal ne doit rester ouvert : le companion est lancé automatiquement par Chrome une fois installé.`,
        'error',
      );
      throw error;
    }
  }

  window.professorAskProbeLoopback = probeCompanion;

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('#connect-codex, #connect-antigravity');
    if (!button || replayingClick || window.professorAskLoopbackReady) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      await probeCompanion();
      replayingClick = true;
      button.click();
    } catch {
      // The companion banner already contains the useful error.
    } finally {
      replayingClick = false;
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    ensureBanner();
    probeCompanion().catch(() => {});
  });
})();
