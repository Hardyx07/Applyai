from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProfileUpsertRequest(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class ProfileResponse(BaseModel):
    user_id: str
    data: dict[str, Any]
    ingested_at: datetime | None = None
