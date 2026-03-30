from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from core.config import get_settings
from middleware.scope_guard import ScopeGuardMiddleware
from api.routes import auth, settings, profile, ingest, generate
from db.session import engine
from models.user import Base
from models import profile_chunk  # noqa: F401

cfg = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: add any DB table creation here during dev
    # (Alembic handles migrations in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("SELECT 1"))
    yield
    # Shutdown: close connection pools, etc.
    await engine.dispose()


app = FastAPI(
    title="ApplyAI API",
    version="1.0.0",
    docs_url="/docs" if cfg.APP_ENV == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Scope Guard (must come AFTER CORSMiddleware) ──────────────────────────────
app.add_middleware(ScopeGuardMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(settings.router)
app.include_router(profile.router)
app.include_router(ingest.router)
app.include_router(generate.router)


@app.get("/health", tags=["infra"])
async def health():
    return {"status": "ok"}