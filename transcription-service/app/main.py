from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .schemas import StartTranscriptRequest, TranscriptJobResponse, VIDEO_ID_RE
from .service import TranscriptionService

app = FastAPI(title='Professor Ask Transcription Service', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['GET', 'POST'],
    allow_headers=['*'],
)

service = TranscriptionService(settings)


@app.get('/health')
async def health() -> dict:
    return {
        'ok': True,
        'model': settings.model_name,
        'device': settings.device,
        'compute_type': settings.compute_type,
        'max_concurrent_jobs': settings.max_concurrent_jobs,
    }


@app.post('/v1/transcripts/youtube', response_model=TranscriptJobResponse)
async def start_transcript(request: StartTranscriptRequest) -> dict:
    return await service.start(request.video_id, request.language)


@app.get('/v1/transcripts/youtube/{video_id}', response_model=TranscriptJobResponse)
async def transcript_status(video_id: str, language: str = Query(default='auto', pattern='^(auto|fr|en)$')) -> dict:
    if not VIDEO_ID_RE.fullmatch(video_id):
        raise HTTPException(status_code=400, detail='Invalid YouTube video id')
    result = await service.status(video_id, language)
    if result is None:
        raise HTTPException(status_code=404, detail='Transcript job not found')
    return result
