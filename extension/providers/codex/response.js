export async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function responseError(data, fallback) {
  const nested = data?.error;
  if (typeof nested === 'string') return nested;
  if (nested?.message) return nested.message;
  if (nested?.code && nested?.type) return `${nested.type}: ${nested.code}`;
  if (data?.error_description) return data.error_description;
  if (data?.message) return data.message;
  if (data?.detail) return typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail).slice(0, 700);
  if (data?.raw) return String(data.raw).slice(0, 700);
  return fallback;
}
