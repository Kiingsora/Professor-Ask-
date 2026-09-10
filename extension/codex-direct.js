const ProfessorAskCodex = (() => {
  const ISSUER = 'https://auth.openai.com';
  const USER_CODE_URL = `${ISSUER}/api/accounts/deviceauth/usercode`;
  const DEVICE_TOKEN_URL = `${ISSUER}/api/accounts/deviceauth/token`;
  const OAUTH_TOKEN_URL = `${ISSUER}/oauth/token`;
  const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
  const MODELS_URL = `${CODEX_BASE_URL}/models?client_version=1.0.0`;

  // Public OAuth client identifier used by the Codex device-auth flow.
  // This is not a client secret. The flow itself never embeds a password or ChatGPT cookie.
  const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

  const DB_NAME = 'professor-ask-secrets';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const AUTH_KEY = 'codex-auth-v1';
  const PENDING_KEY = 'codex-pending-v1';
  const REFRESH_SKEW_MS = 5 * 60 * 1000;

  let dbPromise = null;

  function openSecretsDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Impossible d’ouvrir le stockage sécurisé de l’extension.'));
    });
    return dbPromise;
  }

  async function secretGet(key) {
    const db = await openSecretsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error('Lecture du stockage OAuth impossible.'));
    });
  }

  async function secretSet(key, value) {
    const db = await openSecretsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Écriture du stockage OAuth impossible.'));
    });
  }

  async function secretDelete(key) {
    const db = await openSecretsDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Suppression du stockage OAuth impossible.'));
    });
  }

  function decodeBase64Url(value) {
    const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function decodeJwt(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return {};
      return JSON.parse(decodeBase64Url(parts[1]));
    } catch {
      return {};
    }
  }

  function authClaims(auth) {
    const accessClaims = decodeJwt(auth?.accessToken);
    const idClaims = decodeJwt(auth?.idToken);
    const openAiAuth = accessClaims?.['https://api.openai.com/auth'] || {};
    return { accessClaims, idClaims, openAiAuth };
  }

  function accountInfo(auth) {
    const { accessClaims, idClaims, openAiAuth } = authClaims(auth);
    const accountId = openAiAuth.chatgpt_account_id
      || accessClaims.chatgpt_account_id
      || idClaims.chatgpt_account_id
      || null;
    const planType = openAiAuth.chatgpt_plan_type
      || accessClaims.chatgpt_plan_type
      || idClaims.chatgpt_plan_type
      || null;
    const email = idClaims.email || accessClaims.email || null;
    return {
      type: 'chatgpt',
      email,
      plan_type: planType,
      account_id: accountId,
    };
  }

  function tokenExpiresAt(auth) {
    const claims = decodeJwt(auth?.accessToken);
    if (Number.isFinite(Number(claims.exp))) return Number(claims.exp) * 1000;
    if (Number.isFinite(Number(auth?.expiresAt))) return Number(auth.expiresAt);
    return 0;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  function responseError(data, fallback) {
    const nested = data?.error;
    if (typeof nested === 'string') return nested;
    if (nested?.message) return nested.message;
    if (data?.error_description) return data.error_description;
    if (data?.message) return data.message;
    if (data?.raw) return String(data.raw).slice(0, 500);
    return fallback;
  }

  async function requestDeviceCode() {
    const response = await fetch(USER_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ client_id: CLIENT_ID }),
      credentials: 'omit',
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(responseError(data, `OpenAI a refusé la demande de connexion (${response.status}).`));

    const deviceAuthId = data.device_auth_id;
    const userCode = data.user_code;
    const authUrl = data.verification_uri_complete || data.verification_uri;
    if (!deviceAuthId || !userCode || !authUrl) {
      throw new Error('OpenAI n’a pas renvoyé les informations de connexion Codex attendues.');
    }

    const expiresIn = Math.max(60, Number(data.expires_in) || 900);
    const interval = Math.max(2, Number(data.interval) || 3);
    await secretSet(PENDING_KEY, {
      deviceAuthId,
      userCode,
      authUrl,
      expiresAt: Date.now() + expiresIn * 1000,
      interval,
      lastPollAt: 0,
    });

    return { authUrl, userCode, expiresIn, interval };
  }

  async function exchangeAuthorizationCode(codeResponse) {
    const authorizationCode = codeResponse?.authorization_code;
    const codeVerifier = codeResponse?.code_verifier;
    if (!authorizationCode || !codeVerifier) {
      throw new Error('OpenAI a validé la connexion mais n’a pas renvoyé le code OAuth complet.');
    }

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: `${ISSUER}/deviceauth/callback`,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    });

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: form.toString(),
      credentials: 'omit',
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(responseError(data, `Échange OAuth Codex refusé (${response.status}).`));
    if (!data.access_token || !data.refresh_token) throw new Error('Réponse OAuth Codex incomplète.');

    const auth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token || null,
      expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
      updatedAt: Date.now(),
    };
    await secretSet(AUTH_KEY, auth);
    await secretDelete(PENDING_KEY);
    return auth;
  }

  async function pollPendingOnce() {
    const pending = await secretGet(PENDING_KEY);
    if (!pending) return { pending: false, completed: false };
    if (Date.now() >= pending.expiresAt) {
      await secretDelete(PENDING_KEY);
      return { pending: false, completed: false, expired: true };
    }

    const minInterval = Math.max(2, Number(pending.interval) || 3) * 1000;
    if (pending.lastPollAt && Date.now() - pending.lastPollAt < minInterval - 250) {
      return { pending: true, completed: false, authUrl: pending.authUrl, userCode: pending.userCode };
    }

    pending.lastPollAt = Date.now();
    await secretSet(PENDING_KEY, pending);

    const response = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        device_auth_id: pending.deviceAuthId,
        user_code: pending.userCode,
      }),
      credentials: 'omit',
    });

    const data = await parseResponse(response);
    if (response.ok) {
      const auth = await exchangeAuthorizationCode(data);
      return { pending: false, completed: true, auth };
    }

    const errorText = responseError(data, '').toLowerCase();
    if (response.status === 403 || response.status === 404 || /pending|authorization.*wait|not.*authorized/.test(errorText)) {
      return { pending: true, completed: false, authUrl: pending.authUrl, userCode: pending.userCode };
    }
    if (response.status === 429) {
      return { pending: true, completed: false, rateLimited: true, authUrl: pending.authUrl, userCode: pending.userCode };
    }

    throw new Error(responseError(data, `Vérification OAuth Codex impossible (${response.status}).`));
  }

  async function refreshAuth(auth) {
    if (!auth?.refreshToken) throw new Error('Session Codex expirée : reconnecte ton compte ChatGPT.');
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
      client_id: CLIENT_ID,
    });
    const response = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: form.toString(),
      credentials: 'omit',
    });
    const data = await parseResponse(response);
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) await secretDelete(AUTH_KEY);
      throw new Error(responseError(data, `Actualisation OAuth Codex impossible (${response.status}).`));
    }

    const updated = {
      ...auth,
      accessToken: data.access_token || auth.accessToken,
      refreshToken: data.refresh_token || auth.refreshToken,
      idToken: data.id_token || auth.idToken || null,
      expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
      updatedAt: Date.now(),
    };
    await secretSet(AUTH_KEY, updated);
    return updated;
  }

  async function getValidAuth({ forceRefresh = false } = {}) {
    let auth = await secretGet(AUTH_KEY);
    if (!auth?.accessToken || !auth?.refreshToken) return null;
    const expiresAt = tokenExpiresAt(auth);
    if (forceRefresh || !expiresAt || expiresAt <= Date.now() + REFRESH_SKEW_MS) {
      auth = await refreshAuth(auth);
    }
    return auth;
  }

  async function status() {
    let pendingState = null;
    try {
      pendingState = await pollPendingOnce();
    } catch (error) {
      return {
        installed: true,
        connected: false,
        pending: true,
        error: error.message,
      };
    }

    try {
      const auth = await getValidAuth();
      if (!auth) {
        return {
          installed: true,
          connected: false,
          pending: !!pendingState?.pending,
          authUrl: pendingState?.authUrl || null,
          userCode: pendingState?.userCode || null,
        };
      }
      return {
        installed: true,
        connected: true,
        pending: false,
        account: accountInfo(auth),
        transport: 'direct-codex-oauth',
      };
    } catch (error) {
      return {
        installed: true,
        connected: false,
        pending: false,
        error: error.message,
      };
    }
  }

  async function login() {
    const currentAuth = await getValidAuth().catch(() => null);
    if (currentAuth) {
      return {
        started: false,
        alreadyConnected: true,
        connected: true,
        account: accountInfo(currentAuth),
      };
    }

    const pending = await secretGet(PENDING_KEY);
    if (pending && pending.expiresAt > Date.now()) {
      return {
        started: true,
        opened: false,
        authUrl: pending.authUrl,
        userCode: pending.userCode,
        expiresIn: Math.max(0, Math.floor((pending.expiresAt - Date.now()) / 1000)),
      };
    }

    await secretDelete(PENDING_KEY);
    const device = await requestDeviceCode();
    return {
      started: true,
      opened: false,
      ...device,
    };
  }

  async function logout() {
    await Promise.all([
      secretDelete(AUTH_KEY),
      secretDelete(PENDING_KEY),
    ]);
    return { connected: false };
  }

  function authHeaders(auth) {
    const headers = {
      'Authorization': `Bearer ${auth.accessToken}`,
      'Accept': 'application/json',
    };
    const account = accountInfo(auth);
    if (account.account_id) headers['ChatGPT-Account-Id'] = account.account_id;
    return headers;
  }

  async function authorizedFetch(url, options = {}, retry = true) {
    let auth = await getValidAuth();
    if (!auth) throw new Error('Compte ChatGPT/Codex non connecté.');
    const response = await fetch(url, {
      ...options,
      credentials: 'omit',
      headers: {
        ...authHeaders(auth),
        ...(options.headers || {}),
      },
    });
    if (retry && (response.status === 401 || response.status === 403)) {
      auth = await getValidAuth({ forceRefresh: true });
      if (!auth) throw new Error('Session Codex expirée. Reconnecte ton compte ChatGPT.');
      return fetch(url, {
        ...options,
        credentials: 'omit',
        headers: {
          ...authHeaders(auth),
          ...(options.headers || {}),
        },
      });
    }
    return response;
  }

  function normalizeEfforts(item) {
    const raw = item?.supported_reasoning_efforts || item?.supportedReasoningEfforts || item?.reasoning_efforts || [];
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map(entry => {
      if (typeof entry === 'string') return entry;
      return entry?.reasoning_effort || entry?.reasoningEffort || entry?.effort || null;
    }).filter(Boolean))];
  }

  async function models() {
    const response = await authorizedFetch(MODELS_URL, { method: 'GET' });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(responseError(data, `Catalogue Codex indisponible (${response.status}).`));
    const entries = Array.isArray(data?.models) ? data.models : (Array.isArray(data?.data) ? data.data : []);
    const models = entries
      .map(item => {
        const id = item?.slug || item?.id || item?.model;
        if (!id) return null;
        const visibility = String(item?.visibility || '').toLowerCase();
        if (visibility === 'hidden' || visibility === 'hide') return null;
        return {
          id,
          label: item?.display_name || item?.displayName || item?.name || id,
          isDefault: !!(item?.is_default || item?.isDefault),
          defaultEffort: item?.default_reasoning_effort || item?.defaultReasoningEffort || null,
          efforts: normalizeEfforts(item),
          priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 10000,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

    if (!models.length) throw new Error('Ton compte est connecté mais OpenAI n’a renvoyé aucun modèle Codex.');
    return { models };
  }

  function formatTime(value) {
    let sec = Math.max(0, Math.floor(Number(value) || 0));
    const h = Math.floor(sec / 3600);
    sec %= 3600;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function buildProfessorPrompt(payload) {
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
      always: 'Vérifie avec le web les faits externes ou actuels lorsque l’outil est disponible, puis appuie-toi sur des sources fiables.',
      auto: 'Utilise le web lorsque la vidéo ne suffit pas, qu’une information est récente ou qu’une vérification améliore la précision.',
    }[settings.webSearch] || 'Utilise le web lorsque cela améliore réellement la précision.';

    return `Tu es Professor Ask, un assistant pédagogique intégré à YouTube.\n\nVIDEO\nTitre: ${payload.title || '(non envoyé)'}\nChaîne: ${payload.channel || '(non envoyée)'}\nPosition actuelle: ${formatTime(payload.timestamp)}\n\nTRANSCRIPTION AUTOUR DU MOMENT ACTUEL\n${transcript || '(Aucune transcription disponible)'}\n\nQUESTION DE L'UTILISATEUR\n${payload.question}\n\nINSTRUCTIONS\n- Prends la transcription et le timestamp comme contexte principal.\n- Explique clairement ce qui est dit ou sous-entendu autour du moment actuel.\n- Distingue ce qui vient de la vidéo de ce qui vient d’informations externes.\n- ${webInstruction}\n- ${styleInstruction}\n- ${languageInstruction}`;
  }

  function extractTextFromFinal(response) {
    if (!response) return '';
    if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
    const pieces = [];
    for (const item of response.output || []) {
      if (item?.type !== 'message') continue;
      for (const part of item.content || []) {
        if ((part?.type === 'output_text' || part?.type === 'text') && part?.text) pieces.push(part.text);
      }
    }
    return pieces.join('\n').trim();
  }

  function collectSources(value, output = new Map(), seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return output;
    seen.add(value);
    if (typeof value.url === 'string' && /^https?:\/\//i.test(value.url)) {
      const title = typeof value.title === 'string' ? value.title : value.url;
      output.set(value.url, { url: value.url, title });
    }
    if (Array.isArray(value)) {
      for (const item of value) collectSources(item, output, seen);
    } else {
      for (const item of Object.values(value)) collectSources(item, output, seen);
    }
    return output;
  }

  async function readResponseStream(response) {
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/event-stream') && !response.body) {
      const data = await parseResponse(response);
      return {
        answer: extractTextFromFinal(data),
        sources: [...collectSources(data).values()],
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let finalResponse = null;
    const sources = new Map();

    const processBlock = block => {
      const dataLines = block.split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim());
      if (!dataLines.length) return;
      const raw = dataLines.join('\n');
      if (!raw || raw === '[DONE]') return;
      let event;
      try { event = JSON.parse(raw); } catch { return; }
      collectSources(event, sources);
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') answer += event.delta;
      if (event.type === 'response.completed') finalResponse = event.response || finalResponse;
      if (event.type === 'response.failed') {
        const message = event.response?.error?.message || event.error?.message || 'La réponse Codex a échoué.';
        throw new Error(message);
      }
      if (event.type === 'error') throw new Error(event.message || event.error?.message || 'Erreur Codex.');
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';
      for (const block of blocks) processBlock(block);
      if (done) break;
    }
    if (buffer.trim()) processBlock(buffer);
    if (!answer.trim()) answer = extractTextFromFinal(finalResponse);
    return { answer: answer.trim(), sources: [...sources.values()] };
  }

  async function resolveModel(requested) {
    if (requested && requested !== 'auto') return requested;
    const catalog = await models();
    return catalog.models.find(item => item.isDefault)?.id || catalog.models[0]?.id;
  }

  async function chat(payload) {
    const model = await resolveModel(payload?.settings?.codexModel);
    if (!model) throw new Error('Aucun modèle Codex disponible pour ce compte.');
    const prompt = buildProfessorPrompt(payload);
    const webMode = payload?.settings?.webSearch || 'auto';
    const effort = payload?.settings?.codexEffort;

    const body = {
      model,
      instructions: 'You are Professor Ask, an educational assistant for the YouTube video the user is currently watching. Follow the per-request transcript, timestamp, language, detail, and web verification instructions.',
      input: [{
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      }],
      store: false,
      stream: true,
      prompt_cache_key: `professor-ask-${String(payload.videoId || 'video').slice(0, 40)}`,
    };

    if (effort && effort !== 'auto') body.reasoning = { effort };
    if (webMode !== 'off') {
      body.tools = [{ type: 'web_search' }];
      body.tool_choice = 'auto';
      body.include = ['web_search_call.action.sources'];
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
      throw new Error(responseError(data, `Codex a refusé la requête (${response.status}).`));
    }

    const result = await readResponseStream(response);
    if (!result.answer) throw new Error('Codex a terminé sans renvoyer de texte.');
    return { ...result, model };
  }

  return { status, login, logout, models, chat };
})();
