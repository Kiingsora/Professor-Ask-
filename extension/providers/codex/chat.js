import { CODEX_BASE_URL, SPARK_MODEL_ID } from './config.js';
import { authorizedFetch } from './client.js';
import { resolveModel } from './models.js';
import { buildProfessorPrompt } from '../shared/prompt.js';
import { parseResponse, responseError } from './response.js';
import { parseCodexSuccess } from './stream.js';

export async function chat(payload) {
  const model = await resolveModel(payload.settings?.codexModel);
  const effort = payload.settings?.codexEffort;
  const webMode = payload.settings?.webSearch || 'auto';
  const webEnabled = webMode !== 'off';

  const body = {
    model,
    instructions: 'You are Professor Ask, an educational assistant for discussing the currently watched YouTube video. Follow the per-turn transcript, language, detail, formatting, and web-search instructions.',
    input: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: buildProfessorPrompt(payload) }],
    }],
    tools: webEnabled ? [{ type: 'web_search', external_web_access: true }] : [],
    tool_choice: webMode === 'always' && webEnabled ? 'required' : 'auto',
    parallel_tool_calls: true,
    store: false,
    stream: true,
    include: ['reasoning.encrypted_content'],
  };

  if (effort && effort !== 'auto' && model !== SPARK_MODEL_ID) {
    body.reasoning = { effort };
  }

  const response = await authorizedFetch(`${CODEX_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await parseResponse(response);
    const requestId = response.headers.get('x-request-id') || response.headers.get('cf-ray');
    const base = responseError(data, `Codex a refusé la requête (${response.status}).`);
    throw new Error(requestId ? `${base} · requête ${requestId}` : base);
  }

  const answer = await parseCodexSuccess(response);
  if (!answer) throw new Error('Codex a terminé la réponse sans texte exploitable.');
  return { answer, sources: [] };
}
