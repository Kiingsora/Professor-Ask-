# Professor Ask transcription service

This service is the zero-install fallback used only when a YouTube video has no usable native captions.

The extension starts a job automatically with the YouTube video id. The service retrieves the audio on the server, transcribes the complete video with faster-whisper, stores timestamped segments in a disk cache, and returns the cached transcript to later viewers of the same video/language.

## Development

```bash
docker compose up --build
```

The development API listens on `http://127.0.0.1:43120`.

The first transcription also downloads the Whisper model. `HF_HOME` points inside `/data`, so the model and generated transcript cache survive container restarts.

## Production

Deploy this directory on a server behind HTTPS and change the single endpoint in `extension/background/transcription/config.js`. End users do not install Python, Whisper, Docker, FFmpeg or yt-dlp.

The service queues work and defaults to one concurrent transcription per instance. Increase `PROFESSOR_ASK_MAX_CONCURRENT_JOBS` only after checking RAM/VRAM capacity.

Before public distribution, add server-side abuse protection/rate limiting and review the YouTube terms that apply to server-side media retrieval.

## Environment

- `PROFESSOR_ASK_WHISPER_MODEL`: faster-whisper model, default `small`.
- `PROFESSOR_ASK_WHISPER_DEVICE`: `cpu` or `cuda`, default `cpu`.
- `PROFESSOR_ASK_WHISPER_COMPUTE_TYPE`: default `int8`.
- `PROFESSOR_ASK_DATA_DIR`: persistent data directory, default `./data`.
- `PROFESSOR_ASK_MAX_VIDEO_SECONDS`: maximum video duration, default 10800 seconds.
- `PROFESSOR_ASK_MAX_CONCURRENT_JOBS`: transcription concurrency per server instance, default `1`.
