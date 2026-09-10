# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

## Architecture

The project is split by runtime and responsibility. Browser code never imports Node code, and provider-specific code stays behind a provider boundary.

```text
extension/
├─ background/
│  ├─ index.js                 # Chrome events only
│  ├─ router.js                # message routing only
│  └─ native-messaging.js      # optional Antigravity transport only
├─ providers/
│  └─ codex/
│     ├─ auth.js               # device OAuth + token refresh
│     ├─ client.js             # authenticated HTTP
│     ├─ config.js             # endpoints and constants
│     ├─ identity.js           # JWT/account parsing
│     ├─ index.js              # provider facade
│     ├─ models.js             # account model catalog
│     ├─ chat.js               # Codex Responses request
│     ├─ prompt.js             # Professor Ask prompt
│     ├─ response.js           # HTTP response helpers
│     ├─ storage.js            # private IndexedDB secrets
│     └─ stream.js             # SSE parsing
├─ content/
│  ├─ core.js                  # shared state + small utilities
│  ├─ app.js                   # YouTube lifecycle
│  ├─ ui.js                    # panel rendering
│  ├─ chat.js                  # question submission
│  ├─ history.js               # local conversation history
│  ├─ style.css
│  └─ transcript/
│     ├─ youtube.js            # YouTube caption source
│     └─ manager.js            # transcript orchestration/context
├─ options/
│  ├─ index.html
│  ├─ index.js                 # page bootstrap only
│  ├─ core.js                  # shared options state/utilities
│  ├─ form.js                  # form rendering
│  ├─ providers.js             # provider actions
│  ├─ storage.js               # settings/history persistence
│  └─ style.css
└─ manifest.json

native-host/
├─ host.js                     # Native Messaging protocol only
├─ providers/antigravity.js    # optional Antigravity provider
└─ lib/                        # Node-only helpers
```

## Providers

### Codex / ChatGPT

Codex is browser-only. The extension performs the OpenAI device OAuth flow, stores the session in extension-private IndexedDB, refreshes tokens, retrieves the account-scoped model catalog and sends requests directly to the Codex backend. No localhost bridge, CLI, terminal or companion is required.

### Google Antigravity

Antigravity remains optional and isolated behind Native Messaging because the account quota is currently exposed through the local `agy` client. The native host contains no Codex code.

## Transcription

`content/transcript/manager.js` is the single orchestration point. Today it asks `youtube.js` for native YouTube captions. A future browser transcription fallback can be added as another source without touching the UI, chat or provider code.

## Storage

- `chrome.storage.sync`: non-secret preferences.
- `chrome.storage.local`: per-video conversation history.
- extension-private IndexedDB: Codex OAuth credentials.

## Development rule

A file should have one clear responsibility. New provider logic belongs under `extension/providers/<provider>/`; new transcript sources belong under `extension/content/transcript/`; Chrome event wiring belongs under `extension/background/`.
