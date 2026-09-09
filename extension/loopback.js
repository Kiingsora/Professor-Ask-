(() => {
  const ORIGINS = [
    'http://127.0.0.1:43119',
    'http://localhost:43119',
  ];

  let banner;
  let retryButton;
  let statusText;

  function ensureBanner() {
    if (banner) return banner;
    const shell = document.querySelector('.settings-shell');
    if (!shell) return null;

    banner = document.createElement('section');
    banner.className = 'loopback-diagnostic';
    banner.innerHTML = `
      <div>
        <strong>Bridge local</strong>
        <span id="loopback-diagnostic-text">Vérification…</span>
      </div>
      <button class="button" id="loopback-retry" type="button">Retester</button>
    `;

    const hero = shell.querySelector('.hero');
    hero?.insertAdjacentElement('afterend', banner);
    retryButton = banner.querySelector('#loopback-retry');
    statusText = banner.querySelector('#loopback-diagnostic-text');
    retryButton?.addEventListener('click', () => probeLoopback(true));
    return banner;
  }

  function setState(text, kind) {
    ensureBanner();
    if (!banner || !statusText) return;
    banner.dataset.state = kind || '';
    statusText.textContent = text;
  }

  async function probeOrigin(origin) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${origin}/health`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json().catch(() => ({}));
      if (!data?.ok) throw new Error('Réponse health invalide');
      return { origin, data };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function probeLoopback(fromUserGesture = false) {
    ensureBanner();
    setState(
      fromUserGesture
        ? 'Nouvelle tentative… Si Chrome demande l’accès au réseau local, autorise-le.'
        : 'Vérification…',
      'checking',
    );

    const errors = [];
    for (const origin of ORIGINS) {
      try {
        const result = await probeOrigin(origin);
        setState(
          `Connecté à ${origin} · bridge v${result.data.version || '?'} · PID ${result.data.pid || '?'}`,
          'ok',
        );
        window.professorAskLoopbackReady = true;
        window.professorAskBridgeOrigin = origin;
        return result;
      } catch (error) {
        errors.push(`${origin}: ${error.name === 'AbortError' ? 'timeout' : (error.message || error)}`);
      }
    }

    window.professorAskLoopbackReady = false;
    setState(
      `Inaccessible. ${errors.join(' | ')}. Vérifie que bridge\\start.bat est ouvert, puis clique sur Retester.`,
      'error',
    );
    throw new Error(errors.join(' | '));
  }

  window.professorAskProbeLoopback = probeLoopback;

  document.addEventListener('DOMContentLoaded', () => {
    ensureBanner();
    probeLoopback(false).catch(() => {});
  });
})();
