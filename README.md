# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

The assistant receives:

- the current video timestamp;
- the YouTube transcript with timestamps;
- nearby transcript context around the current playback position;
- optional video title/channel metadata;
- optional conversation history for the current video.

## Provider architecture

Professor Ask now treats AI backends as interchangeable providers. The extension only asks a provider for four things:

- connection status;
- login/logout;
- available models;
- a response to the current YouTube question.

Provider-specific OAuth tokens are not handled by the extension.

### Codex

Codex uses the user's **ChatGPT/Codex account** through the official Codex OAuth flow.

Professor Ask starts `codex app-server`, calls `account/login/start` with `type: chatgpt`, and the bridge opens the returned ChatGPT OAuth URL in the default browser. Codex owns the callback, persisted credentials, refresh tokens and account session.

The available model selector is populated dynamically through Codex `model/list`, including the reasoning-effort levels supported by each model.

### Google Antigravity

Antigravity uses the user's **Google/Antigravity account** through the official `agy` CLI.

Professor Ask does not create or store a Google OAuth token. Clicking **Se connecter avec Google** launches the official Antigravity CLI. If no cached session exists, `agy` opens the default browser and runs its normal Google OAuth flow. The resulting session is stored in the operating system secure credential store used by Antigravity.

The model selector is populated dynamically with `agy models`. This can expose Gemini models and any other models Antigravity makes available to the connected account.

Questions are executed through Antigravity headless mode using `agy -p ... --output-format json`, and conversations are resumed per YouTube video when possible.

## Architecture

```text
YouTube page
  -> extension/content.js
      -> timestamp + transcript + chat UI
      -> extension/background.js
          -> http://127.0.0.1:43119
              -> bridge/server.js
                  -> providers/codex.js
                      -> codex app-server
                      -> ChatGPT OAuth
                  -> providers/antigravity.js
                      -> agy CLI
                      -> Google OAuth / Antigravity account
```

The local bridge does **not** run a local AI model and does not persist OAuth access tokens.

## Requirements

Base:

- Chrome or Edge (Manifest V3)
- Node.js 20+

For Codex:

- Codex CLI installed and available as `codex`

For Antigravity:

- Antigravity CLI installed and available as `agy`

Windows installation command from the official Antigravity documentation:

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

## Run the bridge

```bash
cd bridge
npm start
```

On Windows you can also run:

```text
bridge\start.bat
```

The bridge listens only on `127.0.0.1:43119`.

## Install / reload the extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Load the `extension` folder if needed.
4. After each `git pull`, click **Reload** on Professor Ask.
5. Reload the YouTube tab.

## Connect Codex

1. Start the Professor Ask bridge.
2. Open Professor Ask settings.
3. Select **Codex**.
4. Click **Se connecter avec ChatGPT**.
5. The bridge opens the ChatGPT OAuth page in the default browser.
6. Complete the login.
7. Professor Ask refreshes the account state and loads the models available to that account.

## Connect Antigravity

1. Install `agy` if needed.
2. Start the Professor Ask bridge.
3. Open Professor Ask settings.
4. Select **Antigravity**.
5. Click **Se connecter avec Google**.
6. Professor Ask launches the official Antigravity CLI in a terminal.
7. If the account is not already authenticated, Antigravity opens the browser and starts its Google OAuth flow.
8. Complete the login and return to Professor Ask.
9. The settings page detects the session and loads `agy models`.

## Settings

The options page exposes:

- provider selection: Codex / Antigravity;
- ChatGPT/Codex OAuth status, login and logout;
- Google/Antigravity OAuth status, login and logout;
- dynamic Codex model selection;
- dynamic Codex reasoning-effort selection;
- dynamic Antigravity model selection;
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

Non-secret settings are saved with `chrome.storage.sync`. Conversation history is stored with `chrome.storage.local`.

## Security notes

- The extension never receives the ChatGPT OAuth token.
- Codex owns and refreshes its ChatGPT session.
- Professor Ask never receives the Google OAuth token used by Antigravity.
- Antigravity owns its account session through its secure local credential store.
- The bridge binds to loopback only.
- No transcript or chat is sent anywhere except to the selected provider when the user asks a question.

## TipTour reference

The provider-settings organization is intentionally similar to the clean separation used by TipTour: the UI selects/configures providers while provider-specific credential logic stays outside the rest of the application. The current public TipTour source itself uses locally stored provider keys rather than the Codex/Antigravity OAuth flows used here.
