"""
ScopeGuardMiddleware
────────────────────
Intercepts every request that hits a protected route and injects
the authenticated user_id into request.state.

Any downstream service (RAG pipeline, vector DB calls) MUST read
user_id exclusively from request.state.user_id — never from the
request body or query params — to guarantee tenant isolation.

The middleware also extracts BYOK API keys from custom headers and
attaches them to request.state so route handlers stay clean.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from jose import JWTError

from core.security import decode_token

# Routes that skip JWT verification entirely
PUBLIC_PATHS: set[str] = {
    "/",
    "/health",
    "/auth/register",
    "/auth/login",
    "/auth/refresh",
    "/docs",
    "/openapi.json",
}


class ScopeGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # ── 1. Skip public paths ──────────────────────────────────────────
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # ── 2. Extract & verify JWT ───────────────────────────────────────
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or malformed Authorization header."},
            )

        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = decode_token(token)
        except JWTError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired token."},
            )

        if payload.get("kind") != "access":
            return JSONResponse(
                status_code=401,
                content={"detail": "Refresh tokens cannot access this endpoint."},
            )

        # ── 3. Stamp user_id onto request.state (tenant isolation) ────────
        request.state.user_id = payload["sub"]

        # ── 4. Extract BYOK keys (required on RAG routes) ─────────────────
        request.state.gemini_api_key = request.headers.get("X-Gemini-API-Key")
        request.state.cohere_api_key = request.headers.get("X-Cohere-API-Key")

        return await call_next(request)