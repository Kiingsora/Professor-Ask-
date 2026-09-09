# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

The assistant receives:

- the current video timestamp;
- the YouTube transcript with timestamps;
- nearby transcript context around the current playback position;
- optional video title/channel metadata;
- optional conversation history for the current video.

The first functional provider is **Codex via the user's ChatGPT/Codex account**. No OpenAI API key is stored in the extension. A small local bridge starts the official `codex app-server`, launches the official ChatGPT OAuth flow, and relays conversation events between the browser extension and Codex.

## Architecture

```text
YouTube page
  -> extension/content.js
      -> timestamp + transcript + chat UI
      -> extension/options.html
      -> http://127.0.0.1:43119
          -> bridge/server.js
              -> codex app-server --listen stdio://
                  -> ChatGPT OAuth
                  -> Codex model + web search
```

The local bridge does **not** run a local AI model. It only talks to the official Codex process over JSON-RPC.

## Requirements

- Chrome or Edge (Manifest V3)
- Node.js 20+
- Codex CLI installed and available as `codex`

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
7. Select **Codex** and click **Connect Codex**.
8. Complete the ChatGPT login in the browser window opened by Codex.

## Settings

The options page currently exposes:

- provider selection: Codex / Gemini;
- Codex account connection and status;
- direct Gemini access while the Gemini chat bridge is still pending;
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

Settings are saved with `chrome.storage.sync`. Conversation history is stored with `chrome.storage.local`.

## Current MVP

- YouTube side panel injected next to the video
- dedicated options page accessible from the panel and extension icon
- current timestamp displayed live
- timestamped transcript extraction through YouTube caption tracks
- fallback detection when a transcript is unavailable
- configurable transcript context radius
- optional chat history stored per video
- official Codex `account/login/start` OAuth flow
- account state endpoint
- Codex thread creation per YouTube video
- contextual prompt containing transcript + timestamp
- configurable answer language/detail/web-search behavior
- streaming assistant response collection from `item/agentMessage/delta`

## Security notes

- The extension never receives the ChatGPT OAuth access token.
- Codex credentials remain owned by the Codex CLI/app-server profile on the user's machine.
- The bridge binds to loopback only and applies CORS only for Chrome/Edge extension origins and local development.
- No transcript or chat is sent anywhere except to the connected AI provider when the user asks a question.

## Planned providers

The UI and settings already support provider selection. Codex is functional; Gemini currently exposes the provider page and external access links, while the Gemini conversation transport remains to be implemented in the local bridge.
