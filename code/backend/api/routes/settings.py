"""
/settings/validate-keys
────────────────────────
Dry-runs both Gemini and Cohere keys with the cheapest possible API call.
Never logs or stores the keys — they're used and discarded within the request.
"""

from fastapi import APIRouter, Depends
import httpx

from schemas.auth import ValidateKeysRequest, ValidateKeysResponse
from api.deps import get_current_user

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
    gemini_ok = await _check_gemini(body.gemini_api_key)
    cohere_ok = await _check_cohere(body.cohere_api_key)

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