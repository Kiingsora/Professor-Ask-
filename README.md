# Professor Ask

Professor Ask is a Chrome, Edge and Firefox WebExtension that adds an AI discussion panel next to a YouTube video.

## Runtime rule

The distributed extension must not depend on a Professor Ask server, localhost daemon, Docker container, Python process, Whisper executable or other companion application for its core YouTube transcript flow.

The transcript order is:

```text
video opened
  -> YouTube captions available?
      -> yes: use timestamped YouTube transcription immediately
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
│     ├─ youtube-panel-main.js  # current YouTube get_panel provider
│     ├─ youtube-main.js        # MAIN-world bridge
│     ├─ youtube.js             # isolated-world retrieval/fallbacks
│     ├─ status.js              # subtitles + transcript indicators
│     ├─ preview.js             # inspect timestamped context
│     └─ manager.js             # source orchestration
├─ options/
├─ manifest.json                # Chromium MV3
└─ manifest.firefox.json        # Firefox MV3

scripts/
└─ build-extension.mjs          # builds both browser packages

native-host/                     # optional Antigravity provider only
```

## Context indicators

Professor Ask reports two independent states in the YouTube panel:

- **Subtitles icon**: a square with one line at the bottom. It means YouTube exposes one or more caption tracks.
- **Transcript icon**: a square with multiple lines. It means timestamped transcript segments were actually retrieved and can be sent as video context.

This distinction makes failures explicit: captions can be detected while transcript retrieval fails.

## Providers

### Codex / ChatGPT

Codex is browser-only. The extension performs OpenAI device OAuth, stores the session in extension-private IndexedDB, refreshes tokens, retrieves the account model catalog and sends requests directly to the Codex backend. No localhost bridge, CLI, terminal or companion is required.

### Google Antigravity

Antigravity is isolated as an optional provider because its current account flow still uses the local `agy` client. It is not part of the core Codex/transcription path.

## Storage

- WebExtension sync storage: non-secret preferences.
- WebExtension local storage: per-video conversation history.
- extension-private IndexedDB: Codex OAuth credentials.

## Build Chrome / Edge / Firefox

Build both browser variants from the same source tree:

```bash
node scripts/build-extension.mjs
```

Outputs:

```text
dist/chromium/   # Chrome / Edge
dist/firefox/    # Firefox
```

For local Firefox testing, open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on** and select `dist/firefox/manifest.json`.

The Firefox package uses its own MV3 manifest because Firefox uses `background.scripts` for MV3 background execution and a Gecko extension ID rather than Chromium's manifest `key`.

## Development rule

A file has one clear responsibility. Provider logic belongs under `extension/providers/<provider>/`; transcript sources belong under `extension/content/transcript/`; browser event wiring belongs under `extension/background/`.
