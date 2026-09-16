function maxOutputTokens(style) {
  if (style === 'concise') return 480;
  if (style === 'detailed') return 5000;
  return 2200;
}

function extractError(data, fallback) {
  return data?.error?.message || data?.error?.status || data?.error_description || data?.message || fallback;
}

export async function requestJson(url, options = {}, fallback = 'Requête API refusée.') {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) throw new Error(extractError(data, `${fallback} HTTP ${response.status}`));
  return data;
}

export function headersFor(provider, key, json = false) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';

  if (provider === 'gemini') {
    headers['x-goog-api-key'] = key;
  } else if (provider === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function textFromOpenAiResponse(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();

  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap(item => Array.isArray(item?.content) ? item.content : [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
}

async function chatOpenAiResponses(config, key, model, prompt, style) {
  const data = await requestJson(config.chatUrl, {
    method: 'POST',
    headers: headersFor('openai', key, true),
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxOutputTokens(style),
    }),
  }, `${config.label} a refusé la requête de chat.`);

  const answer = textFromOpenAiResponse(data);
  if (!answer) throw new Error(`${config.label} a terminé la réponse sans texte exploitable.`);
  return { answer, sources: [], model: data?.model || model, usage: data?.usage || null };
}

async function chatOpenAiCompatible(provider, config, key, model, prompt, style) {
  const data = await requestJson(config.chatUrl, {
    method: 'POST',
    headers: headersFor(provider, key, true),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxOutputTokens(style),
    }),
  }, `${config.label} a refusé la requête de chat.`);

  const content = data?.choices?.[0]?.message?.content;
  const answer = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content)
      ? content.map(part => part?.text || '').join('').trim()
      : '';
  if (!answer) throw new Error(`${config.label} a terminé la réponse sans texte exploitable.`);
  return { answer, sources: [], model, usage: data?.usage || null };
}

async function chatAnthropic(config, key, model, prompt, style) {
  const data = await requestJson(config.chatUrl, {
    method: 'POST',
    headers: headersFor('anthropic', key, true),
    body: JSON.stringify({
      model,
      max_tokens: maxOutputTokens(style),
      messages: [{ role: 'user', content: prompt }],
    }),
  }, 'Anthropic a refusé la requête de chat.');

  const answer = (Array.isArray(data?.content) ? data.content : [])
    .filter(part => part?.type === 'text' && typeof part?.text === 'string')
    .map(part => part.text)
    .join('')
    .trim();
  if (!answer) throw new Error('Anthropic a terminé la réponse sans texte exploitable.');
  return { answer, sources: [], model: data?.model || model, usage: data?.usage || null };
}

async function chatGemini(config, key, model, prompt, style) {
  const url = `${config.chatBaseUrl}/${encodeURIComponent(model)}:generateContent`;
  const data = await requestJson(url, {
    method: 'POST',
    headers: headersFor('gemini', key, true),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxOutputTokens(style) },
    }),
  }, 'Gemini a refusé la requête de chat.');

  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
  if (!answer) throw new Error('Gemini a terminé la réponse sans texte exploitable.');
  return { answer, sources: [], model, usage: data?.usageMetadata || null };
}

export function chatWithApiProvider(provider, config, key, model, prompt, style) {
  if (config.protocol === 'anthropic') return chatAnthropic(config, key, model, prompt, style);
  if (config.protocol === 'gemini') return chatGemini(config, key, model, prompt, style);
  if (config.protocol === 'openai-responses') return chatOpenAiResponses(config, key, model, prompt, style);
  return chatOpenAiCompatible(provider, config, key, model, prompt, style);
}
