# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

The assistant receives the current timestamp, timestamped transcript context around that moment, optional video metadata, and the user's question.

## Provider architecture

### Codex / ChatGPT — browser only

Codex no longer needs a bridge, CLI, native host, local port, terminal, or companion application.

```text
YouTube
  -> Professor Ask extension
      -> OpenAI Codex device OAuth
          -> auth.openai.com in a new Chrome tab
          -> user authorizes the ChatGPT account
      -> ChatGPT Codex backend
```

The extension stores its Codex OAuth session in extension-private IndexedDB, refreshes the access token when needed, retrieves the account-scoped model catalog, and sends Professor Ask requests directly to the Codex Responses backend.

The model selector is populated from the connected account. Reasoning effort is exposed when the model catalog reports supported effort levels.

### Google Antigravity

Antigravity is intentionally kept separate. Google currently documents account-based Antigravity authentication through the `agy` client, whose credentials live in the operating-system keyring. Google also documents OAuth for the Gemini API, but that flow belongs to a Google Cloud/OAuth project and does not represent the user's Antigravity account quota.

The existing local Antigravity connector remains optional while a supported browser-only Antigravity integration is investigated. It is not required for Codex.

## Settings

The options page exposes provider selection, OAuth status, model selection, Codex reasoning effort, answer language/detail, web-search policy, pause-on-question, transcript context window, transcript language, optional video metadata, panel appearance, and local history controls.

Non-secret settings use `chrome.storage.sync`. Conversation history uses `chrome.storage.local`. Codex OAuth credentials use IndexedDB owned by the extension service-worker origin.

## Development files

```text
extension/
  background.js       provider router
  codex-direct.js     direct Codex OAuth + models + responses
  content.js          YouTube panel + transcript context
  options.*           settings UI

native-host/          optional Antigravity connector only
bridge/               legacy/local provider code, not required by Codex
```

## Security

- Codex does not use ChatGPT cookies.
- Passwords are entered only on OpenAI's authorization page.
- OAuth tokens are not exposed to the YouTube page.
- No localhost HTTP server is used for Codex.
- Transcript/chat content is sent only when the user submits a question.

## TipTour / Hermes references

Professor Ask keeps provider-specific auth and execution behind separate provider layers. The direct Codex flow follows the same device-auth approach used by Hermes Agent: the app obtains a device authorization, opens the provider authorization page, polls for approval, exchanges the resulting authorization code, and keeps its own provider session.
