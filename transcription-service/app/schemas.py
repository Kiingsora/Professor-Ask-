import re
from typing import Literal
from pydantic import BaseModel, Field, field_validator

VIDEO_ID_RE = re.compile(r'^[A-Za-z0-9_-]{11}$')


class StartTranscriptRequest(BaseModel):
    video_id: str = Field(min_length=11, max_length=11)
    language: Literal['auto', 'fr', 'en'] = 'auto'

    @field_validator('video_id')
    @classmethod
    def validate_video_id(cls, value: str) -> str:
        if not VIDEO_ID_RE.fullmatch(value):
            raise ValueError('Invalid YouTube video id')
        return value


class TranscriptSegment(BaseModel):
    start: float
    duration: float
    text: str


class TranscriptJobResponse(BaseModel):
    video_id: str
    language: str
    status: Literal['queued', 'downloading', 'transcribing', 'ready', 'failed']
    progress: float = 0
    source: str = 'generated'
    segments: list[TranscriptSegment] = []
    error: str | None = None
