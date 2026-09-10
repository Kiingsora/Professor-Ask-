# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

## Runtime rule

The distributed extension must not depend on a Professor Ask server, localhost daemon, Docker container, Python process, Whisper executable or other companion application for its core YouTube transcript flow.

The transcript order is:

```text
video opened
  -> YouTube captions available?
      -> yes: use timestamped YouTube captions immediately
      -> no: use a transcription engine bundled inside the extension package
```

The previous `transcription-service/` HTTP fallback has been removed. A browser-local Whisper WASM/WebGPU source will live behind the same transcript manager boundary; chat/provider code will not depend on its implementation.

## Architecture

```text
extension/
├─ background/
│  ├─ index.js
│  ├─ router.js
│  └─ native-messaging.js       # optional Antigravity only
├─ providers/
│  └─ codex/                    # direct browser OAuth + Codex transport
├─ content/
│  ├─ core.js
│  ├─ app.js
│  ├─ ui.js
│  ├─ chat.js
│  ├─ history.js
│  ├─ style.css
│  └─ transcript/
│     ├─ youtube.js             # native/manual/ASR YouTube captions
│     ├─ status.js              # visible source and readiness state
│     ├─ preview.js             # inspect timestamped context
│     └─ manager.js             # source orchestration
├─ options/
└─ manifest.json

native-host/                     # optional Antigravity provider only
```

## Providers

### Codex / ChatGPT

Codex is browser-only. The extension performs OpenAI device OAuth, stores the session in extension-private IndexedDB, refreshes tokens, retrieves the account model catalog and sends requests directly to the Codex backend. No localhost bridge, CLI, terminal or companion is required.

### Google Antigravity

Antigravity is isolated as an optional provider because its current account flow still uses the local `agy` client. It is not part of the core Codex/transcription path.

## Storage

- `chrome.storage.sync`: non-secret preferences.
- `chrome.storage.local`: per-video conversation history.
- extension-private IndexedDB: Codex OAuth credentials.

## Development rule

A file has one clear responsibility. Provider logic belongs under `extension/providers/<provider>/`; transcript sources belong under `extension/content/transcript/`; Chrome event wiring belongs under `extension/background/`.
