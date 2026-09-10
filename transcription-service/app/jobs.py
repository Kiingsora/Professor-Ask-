from dataclasses import dataclass, field
from threading import RLock


@dataclass
class JobState:
    video_id: str
    language: str
    status: str = 'queued'
    progress: float = 0.0
    segments: list[dict] = field(default_factory=list)
    diagnostics: dict | None = None
    error: str | None = None

    def snapshot(self) -> dict:
        return {
            'video_id': self.video_id,
            'language': self.language,
            'status': self.status,
            'progress': round(float(self.progress), 1),
            'source': 'generated',
            'segments': list(self.segments),
            'diagnostics': dict(self.diagnostics) if self.diagnostics else None,
            'error': self.error,
        }


class JobRegistry:
    def __init__(self):
        self._jobs: dict[tuple[str, str], JobState] = {}
        self._lock = RLock()

    def ensure(self, video_id: str, language: str) -> tuple[JobState, bool]:
        key = (video_id, language)
        with self._lock:
            existing = self._jobs.get(key)
            if existing and existing.status != 'failed':
                return existing, False
            job = JobState(video_id=video_id, language=language)
            self._jobs[key] = job
            return job, True

    def get(self, video_id: str, language: str) -> JobState | None:
        with self._lock:
            return self._jobs.get((video_id, language))

    def update(self, video_id: str, language: str, *, status: str | None = None, progress: float | None = None) -> None:
        with self._lock:
            job = self._jobs[(video_id, language)]
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = max(0.0, min(100.0, float(progress)))

    def complete(self, video_id: str, language: str, segments: list[dict], diagnostics: dict) -> None:
        with self._lock:
            job = self._jobs[(video_id, language)]
            job.status = 'ready'
            job.progress = 100.0
            job.segments = segments
            job.diagnostics = diagnostics
            job.error = None

    def fail(self, video_id: str, language: str, error: str) -> None:
        with self._lock:
            job = self._jobs[(video_id, language)]
            job.status = 'failed'
            job.error = error
