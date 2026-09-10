from dataclasses import dataclass


@dataclass(frozen=True)
class TranscriptDiagnostics:
    segment_count: int
    first_timestamp: float
    last_timestamp: float
    covered_seconds: float
    audio_duration: float
    coverage_ratio: float
    detected_language: str | None
    model: str

    def as_dict(self) -> dict:
        return {
            'segment_count': self.segment_count,
            'first_timestamp': round(self.first_timestamp, 3),
            'last_timestamp': round(self.last_timestamp, 3),
            'covered_seconds': round(self.covered_seconds, 3),
            'audio_duration': round(self.audio_duration, 3),
            'coverage_ratio': round(self.coverage_ratio, 4),
            'detected_language': self.detected_language,
            'model': self.model,
        }


def validate_segments(
    segments: list[dict],
    *,
    audio_duration: float,
    detected_language: str | None,
    model: str,
) -> TranscriptDiagnostics:
    if not segments:
        raise RuntimeError('Whisper returned no usable transcript segments.')

    previous_start = -1.0
    for segment in segments:
        start = float(segment.get('start') or 0)
        duration = float(segment.get('duration') or 0)
        text = str(segment.get('text') or '').strip()
        if start < previous_start:
            raise RuntimeError('Whisper returned non-monotonic timestamps.')
        if duration <= 0 or not text:
            raise RuntimeError('Whisper returned an invalid transcript segment.')
        previous_start = start

    first_timestamp = float(segments[0]['start'])
    last = segments[-1]
    last_timestamp = float(last['start']) + float(last['duration'])
    effective_duration = max(float(audio_duration or 0), last_timestamp, 1.0)
    covered_seconds = max(0.0, last_timestamp - first_timestamp)
    coverage_ratio = min(1.0, covered_seconds / effective_duration)

    return TranscriptDiagnostics(
        segment_count=len(segments),
        first_timestamp=first_timestamp,
        last_timestamp=last_timestamp,
        covered_seconds=covered_seconds,
        audio_duration=effective_duration,
        coverage_ratio=coverage_ratio,
        detected_language=detected_language,
        model=model,
    )
