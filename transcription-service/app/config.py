from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    model_name: str
    device: str
    compute_type: str
    max_video_seconds: int


def load_settings() -> Settings:
    data_dir = Path(os.getenv('PROFESSOR_ASK_DATA_DIR', './data')).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        data_dir=data_dir,
        model_name=os.getenv('PROFESSOR_ASK_WHISPER_MODEL', 'small'),
        device=os.getenv('PROFESSOR_ASK_WHISPER_DEVICE', 'cpu'),
        compute_type=os.getenv('PROFESSOR_ASK_WHISPER_COMPUTE_TYPE', 'int8'),
        max_video_seconds=int(os.getenv('PROFESSOR_ASK_MAX_VIDEO_SECONDS', '10800')),
    )


settings = load_settings()
