from datetime import datetime

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    source: str = Field(default="Resume", min_length=1, max_length=64)
    sections: list[str] | None = None
    force_reingest: bool = True


class IngestResponse(BaseModel):
    status: str
    processed_sections: list[str]
    parent_chunks: int
    child_chunks: int
    embedded_chunks: int
    ingested_at: datetime
