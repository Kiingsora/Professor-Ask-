import json
from pathlib import Path
from threading import Lock

CACHE_VERSION = 2


class TranscriptCache:
    def __init__(self, root: Path):
        self.root = root / 'transcripts'
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def _path(self, video_id: str, language: str) -> Path:
        return self.root / f'{video_id}.{language}.json'

    def load(self, video_id: str, language: str) -> dict | None:
        path = self._path(video_id, language)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None

        if payload.get('cache_version') != CACHE_VERSION:
            return None
        if payload.get('status') == 'ready' and not payload.get('diagnostics'):
            return None
        return payload

    def save(self, video_id: str, language: str, payload: dict) -> None:
        path = self._path(video_id, language)
        temporary = path.with_suffix(path.suffix + '.tmp')
        versioned_payload = {**payload, 'cache_version': CACHE_VERSION}
        serialized = json.dumps(versioned_payload, ensure_ascii=False, separators=(',', ':'))
        with self._lock:
            temporary.write_text(serialized, encoding='utf-8')
            temporary.replace(path)
