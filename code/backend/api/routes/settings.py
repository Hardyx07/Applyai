"""
/settings routes
────────────────
- /settings/validate-keys: dry-run validation only.
- /settings/save-keys: validates then stores encrypted keys for account hydration.
- /settings/saved-keys: authenticated fetch of decrypted keys for client-side cache sync.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from core.encryption import decrypt_value, encrypt_value
from db.session import get_db
from models.user_api_key import UserAPIKey
from schemas.auth import (
    SavedKeysResponse,
    SaveKeysRequest,
    SaveKeysResponse,
    ValidateKeysRequest,
    ValidateKeysResponse,
)

router = APIRouter(prefix="/settings", tags=["settings"])


async def _check_gemini(api_key: str) -> bool:
    """Hits the Gemini models list endpoint — zero token cost."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(url)
            return resp.status_code == 200
    except Exception:
        return False


async def _check_cohere(api_key: str) -> bool:
    """Uses Cohere's check-api-key endpoint."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                "https://api.cohere.com/v1/check-api-key",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            return resp.status_code == 200
    except Exception:
        return False


@router.post("/validate-keys", response_model=ValidateKeysResponse)
async def validate_keys(
    body: ValidateKeysRequest,
    _user_id: str = Depends(get_current_user),  # must be logged in
):
    return await _run_validation(body.gemini_api_key, body.cohere_api_key)


@router.post("/save-keys", response_model=SaveKeysResponse)
async def save_keys(
    body: SaveKeysRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    validation = await _run_validation(body.gemini_api_key, body.cohere_api_key)
    if not (validation.gemini_valid and validation.cohere_valid):
        return SaveKeysResponse(
            gemini_valid=validation.gemini_valid,
            cohere_valid=validation.cohere_valid,
            saved=False,
            detail=validation.detail,
        )

    user_uuid = _parse_user_id(user_id)
    result = await db.execute(select(UserAPIKey).where(UserAPIKey.user_id == user_uuid))
    key_record = result.scalar_one_or_none()

    encrypted_gemini = encrypt_value(body.gemini_api_key)
    encrypted_cohere = encrypt_value(body.cohere_api_key)

    if key_record is None:
        key_record = UserAPIKey(
            user_id=user_uuid,
            encrypted_gemini_api_key=encrypted_gemini,
            encrypted_cohere_api_key=encrypted_cohere,
        )
        db.add(key_record)
    else:
        key_record.encrypted_gemini_api_key = encrypted_gemini
        key_record.encrypted_cohere_api_key = encrypted_cohere

    await db.commit()

    return SaveKeysResponse(
        gemini_valid=True,
        cohere_valid=True,
        saved=True,
        detail="Both keys are valid and saved to your account.",
    )


@router.get("/saved-keys", response_model=SavedKeysResponse)
async def get_saved_keys(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = _parse_user_id(user_id)
    result = await db.execute(select(UserAPIKey).where(UserAPIKey.user_id == user_uuid))
    key_record = result.scalar_one_or_none()

    if (
        key_record is None
        or not key_record.encrypted_gemini_api_key
        or not key_record.encrypted_cohere_api_key
    ):
        return SavedKeysResponse(has_saved_keys=False)

    try:
        gemini_api_key = decrypt_value(key_record.encrypted_gemini_api_key)
        cohere_api_key = decrypt_value(key_record.encrypted_cohere_api_key)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Stored API keys could not be decrypted.") from exc

    return SavedKeysResponse(
        gemini_api_key=gemini_api_key,
        cohere_api_key=cohere_api_key,
        has_saved_keys=True,
    )


async def _run_validation(gemini_api_key: str, cohere_api_key: str) -> ValidateKeysResponse:
    gemini_ok = await _check_gemini(gemini_api_key)
    cohere_ok = await _check_cohere(cohere_api_key)

    return _build_validation_response(gemini_ok, cohere_ok)


def _build_validation_response(gemini_ok: bool, cohere_ok: bool) -> ValidateKeysResponse:
    if gemini_ok and cohere_ok:
        detail = "Both keys are valid."
    elif not gemini_ok and not cohere_ok:
        detail = "Both keys are invalid. Please check and re-enter them."
    elif not gemini_ok:
        detail = "Gemini key is invalid."
    else:
        detail = "Cohere key is invalid."

    return ValidateKeysResponse(
        gemini_valid=gemini_ok,
        cohere_valid=cohere_ok,
        detail=detail,
    )


def _parse_user_id(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id.") from exc