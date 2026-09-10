function extractAnswerFromJson(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  if (!Array.isArray(data?.output)) return '';

  const chunks = [];
  for (const item of data.output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part.text === 'string') {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('').trim();
}

function parseSseText(text) {
  let answer = '';
  let completedResponse = null;
  let streamError = null;

  for (const block of String(text || '').split(/\r?\n\r?\n/)) {
    const dataLines = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim());
    if (!dataLines.length) continue;

    const raw = dataLines.join('\n');
    if (!raw || raw === '[DONE]') continue;

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }

    if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      answer += event.delta;
    } else if (event?.type === 'response.completed' && event.response) {
      completedResponse = event.response;
    } else if (event?.type === 'response.failed' || event?.type === 'error') {
      streamError = event.error?.message || event.message || event.response?.error?.message || 'La réponse Codex a échoué.';
    }
  }

  if (!answer && completedResponse) answer = extractAnswerFromJson(completedResponse);
  return { answer: answer.trim(), streamError };
}

export async function parseCodexSuccess(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const text = await response.text();

  if (contentType.includes('text/event-stream') || /^data:/m.test(text)) {
    const parsed = parseSseText(text);
    if (parsed.streamError) throw new Error(parsed.streamError);
    return parsed.answer;
  }

  if (!text) return '';
  try {
    return extractAnswerFromJson(JSON.parse(text));
  } catch {
    return '';
  }
}
