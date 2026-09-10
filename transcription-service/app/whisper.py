from pathlib import Path
from threading import Lock
from typing import Callable
from faster_whisper import WhisperModel

ProgressCallback = Callable[[float], None]


class WhisperTranscriber:
    def __init__(self, model_name: str, device: str, compute_type: str):
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self._model: WhisperModel | None = None
        self._model_lock = Lock()

    def _get_model(self) -> WhisperModel:
        if self._model is not None:
            return self._model
        with self._model_lock:
            if self._model is None:
                self._model = WhisperModel(self.model_name, device=self.device, compute_type=self.compute_type)
        return self._model

    def transcribe(self, audio_path: Path, language: str, on_progress: ProgressCallback) -> list[dict]:
        model = self._get_model()
        segments, info = model.transcribe(
            str(audio_path),
            language=None if language == 'auto' else language,
            vad_filter=True,
            beam_size=5,
        )

        total_duration = max(float(getattr(info, 'duration', 0) or 0), 1.0)
        result: list[dict] = []

        for segment in segments:
            text = str(segment.text or '').strip()
            if text:
                result.append({
                    'start': round(float(segment.start), 3),
                    'duration': round(max(0.01, float(segment.end) - float(segment.start)), 3),
                    'text': text,
                })
            ratio = min(1.0, max(0.0, float(segment.end) / total_duration))
            on_progress(25.0 + ratio * 74.0)

        on_progress(99.0)
        return result
