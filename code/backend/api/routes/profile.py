import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from db.session import get_db
from models.profile import Profile
from schemas.profile import ProfileResponse, ProfileUpsertRequest
from services.semantic_cache import clear_user_cache

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
async def get_profile(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = _parse_user_id(user_id)
    result = await db.execute(select(Profile).where(Profile.user_id == user_uuid))
    profile = result.scalar_one_or_none()

    if not profile:
        return ProfileResponse(user_id=user_id, data={}, ingested_at=None)

    return ProfileResponse(user_id=user_id, data=profile.data, ingested_at=profile.ingested_at)


@router.put("", response_model=ProfileResponse)
async def upsert_profile(
    body: ProfileUpsertRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = _parse_user_id(user_id)
    result = await db.execute(select(Profile).where(Profile.user_id == user_uuid))
    profile = result.scalar_one_or_none()

    if profile is None:
        profile = Profile(user_id=user_uuid, data=body.data)
        db.add(profile)
    else:
        profile.data = body.data
        profile.ingested_at = None

    await db.commit()
    await clear_user_cache(user_id=user_id)
    return ProfileResponse(user_id=user_id, data=profile.data, ingested_at=profile.ingested_at)


def _parse_user_id(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id.") from exc
