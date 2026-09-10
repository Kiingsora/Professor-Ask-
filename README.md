# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

## Architecture

The project is split by runtime and responsibility. Browser code never imports server or Node code, and each provider/transcript source stays behind a small boundary.

```text
extension/
├─ background/
│  ├─ index.js
│  ├─ router.js
│  ├─ native-messaging.js
│  └─ transcription/
│     ├─ config.js
│     └─ client.js
├─ providers/
│  └─ codex/
│     ├─ auth.js
│     ├─ client.js
│     ├─ config.js
│     ├─ identity.js
│     ├─ index.js
│     ├─ models.js
│     ├─ chat.js
│     ├─ prompt.js
│     ├─ response.js
│     ├─ storage.js
│     └─ stream.js
├─ content/
│  ├─ core.js
│  ├─ app.js
│  ├─ ui.js
│  ├─ chat.js
│  ├─ history.js
│  ├─ style.css
│  └─ transcript/
│     ├─ youtube.js
│     ├─ remote.js
│     ├─ status.js
│     └─ manager.js
├─ options/
│  ├─ index.html
│  ├─ index.js
│  ├─ core.js
│  ├─ form.js
│  ├─ providers.js
│  ├─ storage.js
│  └─ style.css
└─ manifest.json

transcription-service/
├─ app/
│  ├─ main.py
│  ├─ config.py
│  ├─ schemas.py
│  ├─ cache.py
│  ├─ jobs.py
│  ├─ youtube.py
│  ├─ whisper.py
│  └─ service.py
├─ Dockerfile
├─ docker-compose.yml
└─ requirements.txt

native-host/
├─ host.js
├─ providers/antigravity.js
└─ lib/
```

## Transcript flow

When a user opens a YouTube video, Professor Ask immediately checks for native YouTube captions.

```text
video opened
  -> native YouTube captions available?
      -> yes: use them immediately
      -> no: start a remote full-video transcription job automatically
              -> server retrieves audio
              -> faster-whisper transcribes the full video
              -> timestamped transcript is cached by video id + language
              -> extension polls progress and uses the transcript when ready
```

The transcript manager only orchestrates sources. `youtube.js` knows only YouTube captions; `remote.js` knows only the transcription API; `status.js` owns the progress badge. A future browser/WebGPU source can therefore be added without changing chat/provider code.

For development, the transcription API points to `http://127.0.0.1:43120`. For the distributed extension, deploy `transcription-service/` behind HTTPS and change the single URL in `extension/background/transcription/config.js`. End users do not install Whisper, Python, Docker or yt-dlp.

## Providers

### Codex / ChatGPT

Codex is browser-only. The extension performs the OpenAI device OAuth flow, stores the session in extension-private IndexedDB, refreshes tokens, retrieves the account-scoped model catalog and sends requests directly to the Codex backend. No localhost bridge, CLI, terminal or companion is required.

### Google Antigravity

Antigravity remains optional and isolated behind Native Messaging because its account quota currently depends on the local `agy` client. The native host contains no Codex or transcription code.

## Storage

- `chrome.storage.sync`: non-secret preferences.
- `chrome.storage.local`: per-video conversation history.
- extension-private IndexedDB: Codex OAuth credentials.
- transcription server disk cache: generated timestamped transcripts.

## Development rule

A file should have one clear responsibility. New provider logic belongs under `extension/providers/<provider>/`; new transcript sources belong under `extension/content/transcript/`; server-side transcription concerns stay under `transcription-service/app/`.
