import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    PORT: int = 8000
    HOST: str = "0.0.0.0"
    ENV: str = "development"
    ORCHESTRATOR_INTERNAL_SECRET: str = "praxis_internal_dev_secret_32char_minimum"

    # MongoDB
    MONGODB_URI: str = "mongodb://localhost:27017/praxis"
    MONGODB_DB_NAME: str = "praxis"

    # LLM Settings
    LLM_PROVIDER: str = "openai"
    OPENAI_API_KEY: str = ""
    PRIMARY_MODEL: str = "gpt-6-luna"
    FALLBACK_MODEL: str = "gpt-6-luna"
    GUARD_MODEL: str = "gpt-6-luna"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # LiveKit Cloud
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    # Voice / VAD
    STT_PROVIDER: str = "openai"
    TTS_PROVIDER: str = "openai"
    VAD_PROVIDER: str = "silero"

    # Per-session limits
    MAX_SESSION_DURATION_SEC: int = 3600
    MAX_SESSION_TOKENS: int = 40000

settings = Settings()
