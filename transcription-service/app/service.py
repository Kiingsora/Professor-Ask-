import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

from .cache import TranscriptCache
from .config import Settings
from .jobs import JobRegistry
from .whisper import WhisperTranscriber
from .youtube import YoutubeAudioDownloader


class TranscriptionService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.cache = TranscriptCache(settings.data_dir)
        self.jobs = JobRegistry()
        self.downloader = YoutubeAudioDownloader(settings.max_video_seconds)
        self.transcriber = WhisperTranscriber(settings.model_name, settings.device, settings.compute_type)
        self._tasks: set[asyncio.Task] = set()
        self._capacity = asyncio.Semaphore(settings.max_concurrent_jobs)

    async def start(self, video_id: str, language: str) -> dict:
        cached = self.cache.load(video_id, language)
        if cached:
            return cached

        job, created = self.jobs.ensure(video_id, language)
        if created:
            task = asyncio.create_task(self._run(video_id, language))
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
        return job.snapshot()

    async def status(self, video_id: str, language: str) -> dict | None:
        cached = self.cache.load(video_id, language)
        if cached:
            return cached
        job = self.jobs.get(video_id, language)
        return job.snapshot() if job else None

    async def _run(self, video_id: str, language: str) -> None:
        try:
            async with self._capacity:
                await asyncio.to_thread(self._process, video_id, language)
        except Exception as error:
            self.jobs.fail(video_id, language, str(error))

    def _process(self, video_id: str, language: str) -> None:
        temp_root = self.settings.data_dir / 'tmp'
        temp_root.mkdir(parents=True, exist_ok=True)

        with TemporaryDirectory(prefix=f'{video_id}-', dir=temp_root) as directory:
            work_dir = Path(directory)
            self.jobs.update(video_id, language, status='downloading', progress=0)
            audio_path = self.downloader.download(
                video_id,
                work_dir,
                lambda progress: self.jobs.update(video_id, language, status='downloading', progress=progress),
            )

            self.jobs.update(video_id, language, status='transcribing', progress=25)
            segments, diagnostics = self.transcriber.transcribe(
                audio_path,
                language,
                lambda progress: self.jobs.update(video_id, language, status='transcribing', progress=progress),
            )

        payload = {
            'video_id': video_id,
            'language': language,
            'status': 'ready',
            'progress': 100.0,
            'source': 'generated',
            'segments': segments,
            'diagnostics': diagnostics,
            'error': None,
        }
        self.cache.save(video_id, language, payload)
        self.jobs.complete(video_id, language, segments, diagnostics)
