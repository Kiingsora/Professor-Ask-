(() => {
  const PA = globalThis.ProfessorAskContent;

  function storageGet(key) {
    return new Promise(resolve => chrome.storage.local.get([key], value => resolve(value[key])));
  }

  function storageSet(key, value) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
  }

  function historyKey() {
    return `pa-history:${PA.state.videoId || 'none'}:${PA.state.settings.provider}`;
  }

  PA.loadHistory = async function loadHistory() {
    if (!PA.state.videoId) return;
    const box = PA.qs('#pa-messages');
    if (!box) return;
    box.innerHTML = '';

    if (!PA.state.settings.rememberHistory) {
      box.innerHTML = '<div class="pa-empty" id="pa-empty">Pose une question sur ce qui vient d\'être dit dans la vidéo.</div>';
      return;
    }

    const history = await storageGet(historyKey()) || [];
    if (!history.length) {
      box.innerHTML = '<div class="pa-empty" id="pa-empty">Pose une question sur ce qui vient d\'être dit dans la vidéo.</div>';
      return;
    }

    history.forEach(message => PA.addMessage(message.role, message.text, message.meta || ''));
  };

  PA.saveHistory = async function saveHistory() {
    if (!PA.state.settings.rememberHistory) return;

    const nodes = [...document.querySelectorAll('#pa-messages .pa-msg')];
    const limit = Number(PA.state.settings.historyLimit) || 30;
    const history = nodes
      .filter(node => !node.classList.contains('error'))
      .map(node => ({
        role: node.classList.contains('user') ? 'user' : 'assistant',
        meta: node.querySelector('.pa-msg-meta')?.textContent || '',
        text: node.lastElementChild?.textContent || node.textContent,
      }))
      .slice(-limit);

    await storageSet(historyKey(), history);
  };
})();
