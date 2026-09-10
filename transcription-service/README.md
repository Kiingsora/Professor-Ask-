# Professor Ask transcription service

This service is the zero-install fallback used when a YouTube video has no native captions.

The Chrome extension starts a job automatically with the YouTube video id. The service downloads the audio on the server, transcribes the complete video with faster-whisper, stores the timestamped segments in a disk cache, and returns the cached transcript to every later viewer of the same video/language.

## Development

```bash
docker compose up --build
```

The development API listens on `http://127.0.0.1:43120`.

## Production

Deploy this directory on a server, put it behind HTTPS and point `extension/background/transcription/config.js` to that HTTPS origin. End users do not install this service.

Before public distribution, add authentication/rate limiting and review the YouTube terms that apply to server-side media retrieval.

## Environment

- `PROFESSOR_ASK_WHISPER_MODEL`: faster-whisper model, default `small`.
- `PROFESSOR_ASK_WHISPER_DEVICE`: `cpu` or `cuda`, default `cpu`.
- `PROFESSOR_ASK_WHISPER_COMPUTE_TYPE`: default `int8`.
- `PROFESSOR_ASK_DATA_DIR`: transcript/model working data, default `./data`.
- `PROFESSOR_ASK_MAX_VIDEO_SECONDS`: maximum video duration, default 10800 seconds.
