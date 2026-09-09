export function formatTime(value) {
  let sec = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function buildProfessorPrompt(payload) {
  const transcript = (payload.transcript || [])
    .map(seg => `[${formatTime(seg.start)}] ${String(seg.text || '').trim()}`)
    .filter(Boolean)
    .join('\n');

  const settings = payload.settings || {};
  const languageInstruction = {
    fr: 'Réponds en français.',
    en: 'Answer in English.',
    auto: 'Réponds dans la langue utilisée par l’utilisateur.',
  }[settings.responseLanguage] || 'Réponds dans la langue utilisée par l’utilisateur.';

  const styleInstruction = {
    concise: 'Sois concis et va directement à l’explication utile.',
    balanced: 'Donne une réponse claire, structurée et de longueur modérée.',
    detailed: 'Donne une réponse détaillée avec le contexte et les nuances utiles.',
  }[settings.responseStyle] || 'Donne une réponse claire, structurée et de longueur modérée.';

  const webInstruction = {
    off: 'N’utilise pas la recherche web.',
    always: 'Quand un fait est vérifiable, actuel ou externe à la vidéo, vérifie-le avec le web si ton fournisseur dispose d’un outil de recherche, puis cite les sources utiles.',
    auto: 'Utilise le web lorsque la vidéo ne suffit pas, lorsqu’une information est récente ou lorsqu’une vérification externe améliore la précision.',
  }[settings.webSearch] || 'Utilise le web lorsque cela améliore réellement la précision.';

  return `Tu es Professor Ask, un assistant pédagogique intégré à YouTube.\n\nVIDEO\nTitre: ${payload.title || '(non envoyé)'}\nChaîne: ${payload.channel || '(non envoyée)'}\nPosition actuelle: ${formatTime(payload.timestamp)}\n\nTRANSCRIPTION AUTOUR DU MOMENT ACTUEL\n${transcript || '(Aucune transcription disponible)'}\n\nQUESTION DE L'UTILISATEUR\n${payload.question}\n\nINSTRUCTIONS\n- Prends la transcription et le timestamp comme contexte principal.\n- Explique clairement ce qui est dit ou sous-entendu autour du moment actuel.\n- Distingue ce qui vient de la vidéo de ce qui vient d’informations externes.\n- ${webInstruction}\n- ${styleInstruction}\n- ${languageInstruction}`;
}
