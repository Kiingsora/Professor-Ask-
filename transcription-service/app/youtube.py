from pathlib import Path
from typing import Callable
from yt_dlp import YoutubeDL

ProgressCallback = Callable[[float], None]


class YoutubeAudioDownloader:
    def __init__(self, max_video_seconds: int):
        self.max_video_seconds = max_video_seconds

    def download(self, video_id: str, work_dir: Path, on_progress: ProgressCallback) -> Path:
        url = f'https://www.youtube.com/watch?v={video_id}'
        metadata_options = {
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'socket_timeout': 30,
            'retries': 3,
        }

        with YoutubeDL(metadata_options) as ydl:
            metadata = ydl.extract_info(url, download=False)

        duration = float(metadata.get('duration') or 0)
        if duration and duration > self.max_video_seconds:
            max_minutes = self.max_video_seconds // 60
            raise RuntimeError(f'Video too long for automatic transcription (limit: {max_minutes} minutes).')

        def hook(event: dict) -> None:
            if event.get('status') != 'downloading':
                return
            total = event.get('total_bytes') or event.get('total_bytes_estimate') or 0
            downloaded = event.get('downloaded_bytes') or 0
            if total:
                on_progress(min(25.0, (downloaded / total) * 25.0))

        options = {
            **metadata_options,
            'format': 'bestaudio/best',
            'outtmpl': str(work_dir / '%(id)s.%(ext)s'),
            'progress_hooks': [hook],
        }

        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
            candidates = [item.get('filepath') for item in (info.get('requested_downloads') or []) if item.get('filepath')]
            candidates.append(ydl.prepare_filename(info))

        for candidate in candidates:
            if candidate and Path(candidate).exists():
                on_progress(25.0)
                return Path(candidate)

        raise RuntimeError('yt-dlp did not produce an audio file.')
