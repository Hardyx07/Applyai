from pydantic import BaseModel, Field


class RetrievedContext(BaseModel):
    chunk_id: str
    section_type: str
    entity: str
    source: str
    score: float


class GenerateTrace(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)
    field_name: str | None = Field(default=None, max_length=128)
    used_cache: bool
    context_count: int
    context: list[RetrievedContext]
