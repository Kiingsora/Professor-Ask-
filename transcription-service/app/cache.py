import json
from pathlib import Path
from threading import Lock


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
            return json.loads(path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None

    def save(self, video_id: str, language: str, payload: dict) -> None:
        path = self._path(video_id, language)
        temporary = path.with_suffix(path.suffix + '.tmp')
        serialized = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
        with self._lock:
            temporary.write_text(serialized, encoding='utf-8')
            temporary.replace(path)
