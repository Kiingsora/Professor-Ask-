export function formatTime(value) {
  let sec = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function transcriptSourceLabel(payload) {
  if (payload.transcriptSource === 'generated') return 'Whisper / transcription IA horodatée';
  if (payload.transcriptSource === 'youtube') {
    const kind = payload.transcriptDiagnostics?.source_kind;
    if (kind === 'manual') return 'Sous-titres YouTube manuels';
    if (kind === 'automatic') return 'Sous-titres automatiques YouTube';
    return 'Sous-titres YouTube';
  }
  return 'Inconnue';
}

function transcriptCoverage(payload) {
  const diagnostics = payload.transcriptDiagnostics;
  if (!diagnostics) return '(non renseignée)';
  const first = Number(diagnostics.first_timestamp);
  const last = Number(diagnostics.last_timestamp);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return '(non renseignée)';
  return `${formatTime(first)} à ${formatTime(last)}`;
}

export function buildProfessorPrompt(payload) {
  const transcript = (payload.transcript || [])
    .map(segment => `[${formatTime(segment.start)}] ${String(segment.text || '').trim()}`)
    .filter(Boolean)
    .join('\n');

  const settings = payload.settings || {};
  const languageInstruction = {
    fr: 'Réponds en français.',
    en: 'Answer in English.',
    auto: 'Réponds dans la langue utilisée par l’utilisateur.',
  }[settings.responseLanguage] || 'Réponds dans la langue utilisée par l’utilisateur.';

  const styleInstruction = {
    concise: 'MODE CONCIS STRICT : réponds en 1 à 4 lignes maximum et environ 90 mots maximum. Si la demande est un résumé, garde seulement les 2 ou 3 idées essentielles. Pas d’introduction, pas de conclusion, pas de répétition et pas de transition inutile.',
    balanced: 'MODE ÉQUILIBRÉ : réponds de façon claire en quelques lignes courtes. Donne les points utiles sans développement inutile.',
    detailed: 'MODE DÉTAILLÉ : développe les éléments utiles et les nuances, mais garde des lignes courtes et lisibles.',
  }[settings.responseStyle] || 'MODE ÉQUILIBRÉ : réponds de façon claire en quelques lignes courtes.';

  const webInstruction = {
    off: 'N’utilise pas la recherche web.',
    always: 'Utilise la recherche web pour vérifier les faits externes ou actuels pertinents et cite les sources utiles.',
    auto: 'Utilise la recherche web lorsque la vidéo ne suffit pas, lorsqu’une information est récente ou lorsqu’une vérification externe améliore la précision.',
  }[settings.webSearch] || 'Utilise le web lorsque cela améliore réellement la précision.';

  const formattingInstruction = payload.transcriptAvailable
    ? 'FORMAT OBLIGATOIRE : texte brut uniquement. Aucun titre Markdown, aucun #, aucun **, aucun *, aucun soulignement Markdown et aucune puce décorative. Pour chaque idée tirée de la vidéo, écris une ligne sous la forme exacte [horodatage] contenu. Exemple : [2:14] Il explique que le modèle apprend à partir des exemples. Utilise uniquement de vrais horodatages présents dans la transcription fournie. Une idée par ligne. Si tu ajoutes une information externe, écris-la en texte simple sans inventer d’horodatage.'
    : 'FORMAT OBLIGATOIRE : texte brut uniquement. Aucun titre Markdown, aucun #, aucun **, aucun *, aucun soulignement Markdown et aucune puce décorative. N’invente aucun horodatage puisqu’aucune transcription n’est disponible.';

  const timestamp = formatTime(payload.timestamp);
  return `Tu es Professor Ask, un assistant pédagogique intégré à YouTube.\n\nVIDÉO\nTitre: ${payload.title || '(non envoyé)'}\nChaîne: ${payload.channel || '(non envoyée)'}\nPosition actuelle exacte fournie par l'extension: ${timestamp}\nSource de transcription: ${transcriptSourceLabel(payload)}\nCouverture connue de la transcription: ${transcriptCoverage(payload)}\n\nTRANSCRIPTION HORODATÉE AUTOUR DU MOMENT ACTUEL\n${transcript || '(Aucune transcription disponible)'}\n\nQUESTION DE L'UTILISATEUR\n${payload.question}\n\nINSTRUCTIONS\n- Le timestamp actuel est explicitement fourni ci-dessus : ${timestamp}. Ne dis pas que tu ne l'as pas reçu.\n- Les nombres entre crochets dans la transcription sont les timestamps réels de la vidéo.\n- Pour toute affirmation sur ce qui est dit dans la vidéo, appuie-toi sur la transcription horodatée fournie.\n- Si la transcription ne contient pas l'information demandée, dis-le au lieu de l'inventer.\n- Distingue clairement ce qui vient de la vidéo de ce qui vient d’informations externes.\n- ${formattingInstruction}\n- ${styleInstruction}\n- ${webInstruction}\n- ${languageInstruction}`;
}
