import json

from cryptography.fernet import Fernet
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_ENV: str = "development"
    SECRET_KEY: str
    ENCRYPTION_KEY: str

    # JWT
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str

    # Qdrant
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "applyai_chunks"
    GEMINI_EMBEDDING_MODEL: str = "models/gemini-embedding-2-preview"
    GEMINI_GENERATION_MODEL: str = "gemini-3.1-flash-lite-preview"
    COHERE_RERANK_MODEL: str = "rerank-v4.0-pro"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_CACHE_TTL_SECONDS: int = 2_592_000

    # Generate route defaults
    GENERATE_TOP_K: int = 8
    GENERATE_RERANK_TOP_K: int = 5

    # BM25 index storage
    BM25_INDEX_PATH: str = "./data/bm25_index.db"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _normalize_allowed_origins(cls, value):
        if value is None:
            origins: list[str] = []
        elif isinstance(value, str):
            try:
                parsed = json.loads(value)
                origins = parsed if isinstance(parsed, list) else [str(parsed)]
            except json.JSONDecodeError:
                origins = [value]
        else:
            origins = list(value)

        for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
            if origin not in origins:
                origins.append(origin)

        return origins

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def _validate_encryption_key(cls, value: str) -> str:
        try:
            Fernet(value.encode())
        except Exception as exc:
            raise ValueError("ENCRYPTION_KEY must be a valid Fernet key.") from exc

        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
