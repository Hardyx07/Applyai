import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import BYOKKeys, get_current_user, require_byok_keys
from db.session import get_db
from models.profile import Profile
from models.profile_chunk import ProfileChunk
from schemas.ingest import IngestRequest, IngestResponse
from services.chunking import build_profile_chunks
from services.embeddings import embed_documents
from services.vector_indexes import replace_user_bm25_index, replace_user_vectors
from core.config import get_settings

router = APIRouter(prefix="/ingest", tags=["ingest"])
settings = get_settings()


@router.post("", response_model=IngestResponse)
async def ingest_profile(
    body: IngestRequest,
    user_id: str = Depends(get_current_user),
    keys: BYOKKeys = Depends(require_byok_keys),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = _parse_user_id(user_id)

    result = await db.execute(select(Profile).where(Profile.user_id == user_uuid))
    profile = result.scalar_one_or_none()
    if profile is None or not profile.data:
        raise HTTPException(status_code=404, detail="Profile data not found.")

    chunk_result = build_profile_chunks(
        profile_data=profile.data,
        user_id=user_id,
        source=body.source,
        sections=body.sections,
    )
    if not chunk_result.chunks:
        raise HTTPException(status_code=400, detail="No ingestible profile content found.")

    try:
        embeddings = await embed_documents(
            texts=[chunk.text for chunk in chunk_result.chunks],
            api_key=keys.gemini,
            model=settings.GEMINI_EMBEDDING_MODEL,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to create embeddings.") from exc

    if len(embeddings) != len(chunk_result.chunks):
        raise HTTPException(status_code=502, detail="Embedding count mismatch.")

    try:
        await replace_user_vectors(user_id=user_id, chunks=chunk_result.chunks, embeddings=embeddings)
        await replace_user_bm25_index(user_id=user_id, chunks=chunk_result.chunks)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to write retrieval indexes.") from exc

    if body.force_reingest:
        await db.execute(
            delete(ProfileChunk).where(
                ProfileChunk.user_id == user_uuid,
                ProfileChunk.profile_id == profile.id,
            )
        )

    db.add_all(
        [
            ProfileChunk(
                user_id=user_uuid,
                profile_id=profile.id,
                chunk_id=chunk.chunk_id,
                parent_chunk_id=chunk.parent_chunk_id,
                source=chunk.source,
                section_type=chunk.section_type,
                entity=chunk.entity,
                content=chunk.text,
                header=chunk.header,
                embedding_model=settings.GEMINI_EMBEDDING_MODEL,
            )
            for chunk in chunk_result.chunks
        ]
    )

    ingested_at = datetime.now(timezone.utc)
    profile.ingested_at = ingested_at
    await db.commit()

    processed_sections = sorted({chunk.section_type for chunk in chunk_result.chunks})

    return IngestResponse(
        status="completed",
        processed_sections=processed_sections,
        parent_chunks=chunk_result.parent_count,
        child_chunks=len(chunk_result.chunks),
        embedded_chunks=len(embeddings),
        ingested_at=ingested_at,
    )


def _parse_user_id(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id.") from exc
