# Professor Ask

Professor Ask is a Chrome/Edge extension that adds an AI discussion panel next to a YouTube video.

The assistant receives the current timestamp, the timestamped transcript around that moment, optional video metadata, and the user's question.

## UX goal

The end user must not have to start a local server, keep a terminal open, manage ports, or understand the provider CLIs.

Professor Ask therefore uses **Chrome Native Messaging** instead of a localhost HTTP bridge.

```text
YouTube page
  -> Professor Ask extension
      -> Chrome Native Messaging
          -> Professor Ask Companion (started automatically by Chrome)
              -> Codex provider -> codex app-server -> ChatGPT OAuth
              -> Antigravity provider -> agy -> Google OAuth
```

There is no `127.0.0.1` port in the normal application path.

## One-time Windows setup

For the current development build:

1. Pull the repository.
2. Double-click **`Installer Professor Ask.vbs`** at the repository root.
3. A confirmation dialog appears when the companion is installed.
4. Reload Professor Ask in `chrome://extensions` or `edge://extensions`.

No terminal needs to stay open after installation. Chrome starts the native companion automatically whenever the extension needs it.

The development installer currently requires Node.js because the native launcher starts `native-host/host.js`. A packaged self-contained executable can replace that dependency for distribution later without changing the extension architecture.

## Stable extension ID

The extension manifest contains a fixed public key so its unpacked extension ID remains stable:

```text
geibmmecfgilkhncpcjjldbidnejflfb
```

The Windows Native Messaging host is registered only for that extension origin.

## Providers

### Codex / ChatGPT

Codex uses the user's ChatGPT/Codex account through the official Codex app-server OAuth flow.

Professor Ask asks `codex app-server` to start `account/login/start` with `type: chatgpt`. Codex owns the callback, tokens, refresh flow, and persisted account session. Professor Ask never receives the OAuth token.

The model selector is populated dynamically with `model/list`, including the reasoning-effort levels supported by each available model.

### Google Antigravity

Antigravity uses the official `agy` CLI and the user's Google/Antigravity session.

If no Antigravity credentials exist, Professor Ask launches the official client invisibly; Antigravity opens the default browser for Google OAuth and stores the resulting session in Windows Credential Manager. No terminal window is required by Professor Ask.

The model selector is populated dynamically with `agy models`. Questions use Antigravity headless mode and can resume a conversation per YouTube video.

## Settings

The options page exposes:

- provider selection: Codex / Antigravity;
- OAuth connection status, login and logout;
- dynamic Codex model selection;
- dynamic Codex reasoning-effort selection;
- dynamic Antigravity model selection;
- answer language;
- answer detail level;
- web-search policy;
- pause-video-on-question behavior;
- transcript context window;
- preferred transcript language;
- optional video title/channel metadata;
- panel theme and height;
- local conversation-history controls.

Non-secret settings are saved with `chrome.storage.sync`. Conversation history is stored with `chrome.storage.local`.

## Development files

```text
extension/
  background.js      Native Messaging transport
  content.js         YouTube panel + transcript context
  options.*          settings UI

native-host/
  host.js            Native Messaging protocol + provider router
  launcher.cs        tiny Windows stdio launcher
  install.ps1        registration/compiler logic
  Installer Professor Ask.vbs

bridge/
  providers/         Codex and Antigravity provider implementations
  lib/               shared prompt/process helpers
  server.js          legacy HTTP development bridge; not used by extension v0.5+
```

## Security

- No local HTTP port is required by the extension.
- Native Messaging restricts the companion to the fixed Professor Ask extension origin.
- ChatGPT credentials remain owned by Codex.
- Google/Antigravity credentials remain owned by Antigravity/Windows Credential Manager.
- The extension never reads provider OAuth tokens.
- Transcript/chat content is sent only to the selected provider when the user asks a question.

## TipTour reference

The provider separation follows the same useful design principle seen in TipTour: UI and application logic do not need to know provider-specific credential details. Each provider exposes status, authentication, model listing, and execution behind a small interface.
