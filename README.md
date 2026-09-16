# Professor Ask

Professor Ask is a Chrome, Edge and Firefox WebExtension that adds an AI discussion panel next to a YouTube video.

## Runtime rule

The distributed extension must not depend on a Professor Ask server, localhost daemon, Docker container, Python process, native host or other companion application for its core functionality.

The transcript order is:

```text
video opened
  -> YouTube captions available?
      -> yes: use timestamped YouTube transcription immediately
      -> no: use a transcription engine bundled inside the extension package
```

The browser-local Whisper fallback is planned behind the existing transcript manager boundary; it is not yet integrated.

## Providers

### Codex / ChatGPT

Codex is browser-only. The extension performs OpenAI device OAuth, stores the session in extension-private IndexedDB, retrieves the account model catalog and sends requests directly to the Codex backend.

The device code is displayed in the settings UI with a one-click copy button.

### API keys

Professor Ask can also use a user-owned API key. The provider is selected from a dropdown and each provider keeps its own key in extension-private IndexedDB.

Supported providers:

- Google Gemini
- Anthropic Claude
- OpenAI
- OpenRouter
- Mistral
- Groq

API keys are never written to WebExtension sync storage. Only non-secret preferences such as selected provider and model are synchronized.

The extension retrieves each provider's model catalog directly when possible. Web search tooling is currently enabled only for the Codex path; API-key providers answer without an additional web-search tool.

## Architecture

```text
extension/
├─ background/
│  ├─ index.js
│  └─ router.js
├─ providers/
│  ├─ codex/                    # ChatGPT/Codex OAuth + transport
│  ├─ api/                      # multi-provider API-key transport
│  │  ├─ config.js
│  │  ├─ storage.js
│  │  └─ index.js
│  └─ shared/
│     └─ prompt.js
├─ content/
│  ├─ core.js
│  ├─ app.js
│  ├─ ui.js
│  ├─ chat.js
│  ├─ history.js
│  ├─ style.css
│  └─ transcript/
│     ├─ youtube-panel-main.js
│     ├─ youtube-main.js
│     ├─ youtube.js
│     ├─ status.js
│     ├─ preview.js
│     └─ manager.js
├─ options/
├─ manifest.json                # Chromium MV3
└─ manifest.firefox.json        # Firefox MV3

scripts/
└─ build-extension.mjs
```

## Context indicators

Professor Ask reports two independent states in the YouTube panel:

- square with one line at the bottom: YouTube exposes one or more caption tracks;
- square with multiple lines: timestamped transcript segments were actually retrieved and can be sent as video context.

Normal operation shows icons only. Error text is displayed when a source fails.

## Storage

- WebExtension sync storage: non-secret preferences;
- WebExtension local storage: per-video conversation history;
- extension-private IndexedDB: Codex OAuth credentials and provider API keys.

## Build Chrome / Edge / Firefox

```bash
node scripts/build-extension.mjs
```

Outputs:

```text
dist/chromium/
dist/firefox/
```

For local Firefox testing, open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on** and select `dist/firefox/manifest.json`.

## Permanent Firefox installation

Firefox Release requires a Mozilla-signed add-on for a permanent installation. Professor Ask uses the fixed Gecko ID `professor-ask@kiingsora.dev` and includes a GitHub Actions workflow that builds the Firefox package, sends it to Mozilla as an **unlisted** add-on for signing, then exposes the signed `.xpi` as a workflow artifact.

One-time setup:

1. Create/sign in to a Mozilla Add-ons developer account and generate API credentials for `web-ext`.
2. In the GitHub repository, open **Settings > Secrets and variables > Actions** and create these repository secrets:
   - `AMO_API_KEY`
   - `AMO_API_SECRET`

Do not commit or paste the secret values into source files.

To create a signed build:

1. Open **GitHub > Actions > Sign Firefox Extension**.
2. Choose **Run workflow**.
3. When the workflow finishes, download the `professor-ask-firefox-signed` artifact.
4. Extract the artifact and install the `.xpi` in Firefox.

The signing workflow is stored at `.github/workflows/firefox-sign.yml` and uses `web-ext sign --channel=unlisted`.
