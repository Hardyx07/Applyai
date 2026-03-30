"""
deps.py — reusable FastAPI dependency functions.

Usage in route handlers:
    async def my_route(
        user_id: str = Depends(get_current_user),
        keys: BYOKKeys = Depends(require_byok_keys),
    ): ...
"""

from dataclasses import dataclass
from fastapi import Request, HTTPException


def get_current_user(request: Request) -> str:
    """
    Returns the authenticated user_id stamped by ScopeGuardMiddleware.
    Raises 401 if somehow missing (shouldn't happen on protected routes).
    """
    user_id: str | None = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return user_id


@dataclass
class BYOKKeys:
    gemini: str
    cohere: str


def require_byok_keys(request: Request) -> BYOKKeys:
    """
    Extracts BYOK API keys stamped by ScopeGuardMiddleware.
    Raises 422 if either key is missing — used on RAG routes only.
    """
    gemini = getattr(request.state, "gemini_api_key", None)
    cohere = getattr(request.state, "cohere_api_key", None)

    missing = []
    if not gemini:
        missing.append("X-Gemini-API-Key")
    if not cohere:
        missing.append("X-Cohere-API-Key")

    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required API key headers: {', '.join(missing)}",
        )

    return BYOKKeys(gemini=gemini, cohere=cohere)