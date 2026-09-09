# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

The assistant receives:

- the current video timestamp;
- the YouTube transcript with timestamps;
- nearby transcript context around the current playback position;
- optional video title/channel metadata;
- optional conversation history for the current video.

## AI providers

### Codex

Codex uses the user's **ChatGPT/Codex account** through the official Codex OAuth flow. Professor Ask starts `codex app-server`, calls `account/login/start`, opens the returned ChatGPT OAuth URL, and then reuses the Codex-managed session. The extension never receives the OAuth access token.

### Gemini

Gemini is functional through two supported modes:

1. **Google OAuth / Vertex AI** — Professor Ask launches `gcloud auth application-default login`; Google handles browser OAuth and stores Application Default Credentials locally. A Google Cloud Project ID is required for Vertex AI requests.
2. **Gemini API key** — a Gemini API key can be configured from the settings page. The secret is stored by the local bridge in `bridge/.professor-ask-secrets.json`, which is ignored by Git.

Professor Ask does not reuse Gemini CLI consumer OAuth credentials. Google explicitly restricts third-party software from piggybacking on Gemini CLI OAuth for backend access.

## Architecture

```text
YouTube page
  -> extension/content.js
      -> timestamp + transcript + chat UI
      -> extension/background.js
          -> http://127.0.0.1:43119
              -> bridge/server.js
                  -> Codex app-server -> ChatGPT OAuth
                  -> Vertex AI -> Google OAuth / ADC
                  -> Gemini API -> API key
```

The local bridge does **not** run a local AI model. It only handles provider authentication and requests.

## Requirements

Base:

- Chrome or Edge (Manifest V3)
- Node.js 20+

For Codex:

- Codex CLI installed and available as `codex`

For Gemini with Google OAuth / Vertex AI:

- Google Cloud CLI installed and available as `gcloud`
- a Google Cloud project with Vertex AI access enabled

For Gemini API:

- a Gemini API key

## Run the bridge

```bash
cd bridge
npm start
```

On Windows you can also run `bridge/start.bat`.

The bridge listens only on `127.0.0.1:43119`.

## Install the extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select the `extension` folder.
5. Open a YouTube video.
6. Open **Professor Ask settings** from the gear button in the YouTube panel or by clicking the extension icon.

## Connect Codex

1. Select **Codex**.
2. Click **Se connecter avec ChatGPT**.
3. Complete the ChatGPT OAuth flow in the browser tab opened by Codex.
4. The settings page polls the local Codex account state and switches to connected automatically.

## Connect Gemini with Google OAuth

1. Select **Gemini**.
2. Choose **Google OAuth — Vertex AI**.
3. Enter the Google Cloud Project ID and keep the location on `global` unless needed otherwise.
4. Click **Se connecter avec Google**.
5. Complete the browser login opened by Google Cloud CLI.
6. After authentication, Professor Ask uses Application Default Credentials to call Vertex AI.

## Connect Gemini with an API key

1. Select **Gemini**.
2. Choose **Clé Gemini API**.
3. Paste the key in the Gemini settings panel.
4. Click **Enregistrer la clé**.

## Settings

The options page exposes:

- provider selection: Codex / Gemini;
- Codex ChatGPT OAuth connection and account status;
- Gemini Google OAuth / Vertex AI connection;
- Gemini API key connection;
- Gemini model selection;
- answer language;
- answer detail level;
- web-search policy;
- pause-video-on-question behavior;
- transcript context window (±1 / ±3 / ±5 / ±10 minutes);
- preferred transcript language;
- optional video title/channel metadata;
- panel theme and height;
- local conversation-history enable/disable and retention limit;
- clear-history and reset-settings actions.

Non-secret settings are saved with `chrome.storage.sync`. Conversation history is stored with `chrome.storage.local`. Gemini API secrets stay in the local bridge and are not stored in Chrome sync.

## Current MVP

- YouTube side panel injected next to the video
- dedicated settings page
- current timestamp displayed live
- timestamped transcript extraction through YouTube caption tracks
- configurable transcript context radius
- optional chat history stored per video
- Codex OAuth through `account/login/start`
- Gemini via Vertex AI OAuth/ADC or Gemini API key
- Codex thread creation per YouTube video
- Gemini 3.8 Flash as the default Gemini model
- configurable answer language/detail/web-search behavior
- Google Search grounding for Gemini when web search is enabled
- bridge traffic proxied through the extension service worker to avoid YouTube CORS restrictions

## Security notes

- The extension never receives the ChatGPT OAuth access token.
- Codex credentials remain owned by Codex app-server.
- Google OAuth credentials remain in Google Application Default Credentials.
- Gemini API keys are stored only by the local bridge in a Git-ignored file.
- The bridge binds to loopback only.
- No transcript or chat is sent anywhere except to the selected AI provider when the user asks a question.
