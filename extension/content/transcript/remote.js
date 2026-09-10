(() => {
  const PA = globalThis.ProfessorAskContent;

  function request(action, videoId, language) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'TRANSCRIPT_REQUEST', action, videoId, language }, response => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response) return reject(new Error('Aucune réponse du service de transcription.'));
        if (!response.ok) return reject(new Error(response.error || 'Service de transcription indisponible.'));
        resolve(response.data || {});
      });
    });
  }

  PA.startRemoteTranscript = function startRemoteTranscript(videoId, language) {
    return request('start', videoId, language);
  };

  PA.getRemoteTranscriptStatus = function getRemoteTranscriptStatus(videoId, language) {
    return request('status', videoId, language);
  };
})();
