# ApplyAI Backend Overview

## Purpose
Complete end-to-end backend documentation showing the entire system flow, routes, data pipeline, and architecture. For onboarding developers and providing context before making changes.

> Contract note (April 2026): Current mounted routers are `/auth`, `/settings`, `/profile`, `/ingest`, `/generate`, and `/health`.
> `/classify/vision` is not currently mounted in the backend and is deferred for a later phase.

## User Journey (Complete Flow)

```
1. USER REGISTRATION
   POST /auth/register → Create account, receive JWT tokens

2. KEY SETUP (ACCOUNT PERSISTENCE)
  POST /settings/save-keys → Validate + encrypt + persist provider keys
  GET /settings/saved-keys → Hydrate web/extension local cache after login/connect

3. PROFILE SETUP
   PUT /profile → Store structured profile data (resume, skills, etc.)

4. PROFILE INDEXING
   POST /ingest → Convert profile into searchable chunks + embeddings
   - Chunks stored in: PostgreSQL (metadata), Qdrant (vectors), SQLite (keyword index)

5. QUERY & GENERATE
   POST /generate/stream → Get AI-powered answers grounded in profile
   - Cache lookup (Redis)
   - Retrieve relevant chunks via hybrid search
   - Rerank with relevance scoring
   - Generate answer via Gemini (streamed)
   - Store answer in cache for future queries
```

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FastAPI Router                          │
├─────────────────────────────────────────────────────────────────┤
│                       ScopeGuardMiddleware                       │
│          (JWT validation + BYOK header extraction)              │
├─────────────────────────────────────────────────────────────────┤
│                    Six Route Groups                             │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┬───────┤
│   Auth       │   Settings   │   Profile    │   Ingest     │  Generate  │Health │
│ (Public)     │ (Protected)  │ (Protected)  │ (Protected)  │(Protected) │(Public)│
└──────────────┴──────────────┴──────────────┴──────────────┴────────────┴───────┘
        ↓              ↓              ↓              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      Service Layer                              │
│  Auth | Chunking | Embeddings | Retrieval | Reranking | Caching │
└──────────────────────────────────────────────────────────────────┘
        ↓              ↓              ↓              ↓
┌────────────────────────────────────────────────────────────────┐
│                    Data Layer (4 Services)                     │
├──────────────┬─────────────────┬──────────────┬──────────────┤
│ PostgreSQL   │   Qdrant        │   Redis      │  SQLite BM25 │
│ (Users,      │  (Vectors,      │ (Answer      │  (Keyword    │
│  Profiles,   │   Tenant        │  Cache)      │   Index)     │
│  Chunks)     │   Isolation)    │              │              │
└──────────────┴─────────────────┴──────────────┴──────────────┘
```

## Complete Route Map

### Infra
- `GET /health`
  - Auth: Public
  - Response: `{ "status": "ok" }`

### Auth (`/auth`)
- `POST /auth/register`
  - Auth: Public
  - Body: `email`, `full_name`, `password`
  - Success: `201` with access + refresh tokens
  - Errors: `409` if email already exists

- `POST /auth/login`
  - Auth: Public
  - Body: `email`, `password`
  - Success: `200` with access + refresh tokens
  - Errors: `401` invalid credentials, `403` deactivated account

- `POST /auth/refresh`
  - Auth: Public (token in body)
  - Body: `refresh_token`
  - Success: `200` with rotated access + refresh tokens
  - Errors: `401` invalid/expired/wrong token kind

- `GET /auth/me`
  - Auth: Protected (access token)
  - Success: `200` with `{ "user_id": "..." }`

### Settings (`/settings`)
- `POST /settings/validate-keys`
  - Auth: Protected (access token)
  - Body: `gemini_api_key`, `cohere_api_key`
  - Behavior: dry-runs provider validation calls, does not persist keys
  - Success: `200` with validation booleans + detail message

- `POST /settings/save-keys`
  - Auth: Protected (access token)
  - Body: `gemini_api_key`, `cohere_api_key`
  - Behavior:
    - Reuses validation path used by `/settings/validate-keys`
    - Encrypts keys with Fernet and upserts one row per user in PostgreSQL
  - Success: `200` with `gemini_valid`, `cohere_valid`, `saved`, `detail`
  - Contract note: does not change `/ingest` or `/generate/stream` BYOK-header requirements

- `GET /settings/saved-keys`
  - Auth: Protected (access token)
  - Behavior: decrypts and returns account-saved keys for client hydration
  - Success: `200` with either:
    - `{ has_saved_keys: true, gemini_api_key: "...", cohere_api_key: "..." }`
    - `{ has_saved_keys: false, gemini_api_key: null, cohere_api_key: null }`
  - Common errors:
    - `500` stored ciphertext cannot be decrypted

### Profile (`/profile`)
- `GET /profile`
  - Auth: Protected (access token)
  - Success: `200` with `user_id` and profile `data`
  - If no profile exists: returns empty `data` object

- `PUT /profile`
  - Auth: Protected (access token)
  - Body: `{ "data": { ... } }`
  - Behavior: creates or updates profile JSON data
  - Important: resets `ingested_at` to null on update to indicate re-ingest needed

### Ingest (`/ingest`)
- `POST /ingest`
  - Auth: Protected (access token)
  - Also requires BYOK headers:
    - `X-Gemini-API-Key`
    - `X-Cohere-API-Key`
  - Body:
    - `source` (default: `Resume`)
    - `sections` (optional list)
    - `force_reingest` (default: `true`)

  - Pipeline:
    1. Load profile data for user.
    2. Build parent/child chunks from structured profile JSON.
    3. Create embeddings for child chunks with Gemini model.
    4. Replace user vectors in Qdrant.
    5. Replace user keyword index (BM25 store).
    6. Replace DB `profile_chunks` rows if `force_reingest=true`.
    7. Set profile `ingested_at` timestamp.

  - Success response includes:
    - `status`
    - `processed_sections`
    - `parent_chunks`
    - `child_chunks`
    - `embedded_chunks`
    - `ingested_at`

  - Common errors:
    - `404` profile not found or empty
    - `400` no ingestible content
    - `502` embedding provider failure
    - `502` index write failure

### Generate (`/generate`)
- `POST /generate/stream`
  - Auth: Protected (access token)
  - Also requires BYOK headers:
    - `X-Gemini-API-Key`
    - `X-Cohere-API-Key`
  - Query params:
    - `prompt` (required)
    - `field_name` (optional)
    - `top_k` (optional, default from config)

  - Pipeline:
    1. Try Redis semantic cache by `user_id + prompt hash`.
    2. On cache miss, run hybrid retrieval (BM25 + Qdrant vector search).
    3. Fuse rankings with Reciprocal Rank Fusion (RRF).
    4. Rerank final context via Cohere rerank API.
    5. Build grounded prompt using retrieved profile chunks.
    6. Generate answer with Gemini.
    7. Stream SSE events (`meta`, `token`, `done`).
    8. Save final answer to Redis cache.

  - Success behavior:
    - Returns `text/event-stream` response with incremental tokens.

  - Common errors:
    - `401` missing/invalid access token
    - `422` missing BYOK headers
    - `404` no indexed profile data (ingest required)
    - `502` retrieval/provider failure

## Data Flow & Pipeline Details

### Settings Key Persistence Flow (`POST /settings/save-keys`, `GET /settings/saved-keys`)
Persists provider keys durably while keeping runtime BYOK headers unchanged:

```
Client submits provider keys
  ↓
Provider key validation (Gemini + Cohere probe)
  ↓
Encrypt values with Fernet (ENCRYPTION_KEY)
  ↓
Upsert row in PostgreSQL user_api_keys (per-user unique key record)
  ↓
Later login/connect event:
  GET /settings/saved-keys
  ↓
Decrypt + return keys to authenticated client
  ↓
Hydrate browser/chrome local cache for runtime header injection
```

**Important:** `/ingest` and `/generate/stream` remain header-driven. There is no DB key fallback in those routes.

### Ingest Pipeline (`POST /ingest`)
Transforms profile data into searchable, retrievable format:

```
Profile JSON (PUT /profile)
    ↓
Parse & Chunk (build_profile_chunks)
    ↓
Create Embeddings (Gemini embedding model)
    ↓
PARALLEL WRITES:
  ├─ Qdrant: Store vectors with user_id tenant key
  ├─ SQLite: Build full-text search (BM25) index
  └─ PostgreSQL: Save chunk metadata (content, source, section type, entity)
    ↓
Set ingested_at timestamp
```

**Key:** User A's chunks are **isolated** by user_id at all layers. No cross-user data leakage.

### Generation Pipeline (`POST /generate/stream`)
Answers user queries using profile as grounding:

```
User Query
    ↓
[1] Check Redis Cache
    Hit? → Return cached answer immediately
    Miss? → Continue
    ↓
[2] Retrieve Relevant Chunks
    ├─ BM25 keyword search (SQLite)
    ├─ Qdrant vector search (semantic)
    ├─ Merge results with RRF (Reciprocal Rank Fusion)
    └─ Filter by user_id (multi-tenant safety)
    ↓
[3] Rerank Context
    Cohere API: Score top-20 chunks by query relevance
    ↓
[4] Build Grounded Prompt
    System: "Answer using this profile context"
    Context: Top-k reranked chunks
    User: Original query
    ↓
[5] Generate Answer
    Gemini API (with model fallback):
    - Primary: gemini-3
    - Fallback: gemini-2.5-flash
    ↓
[6] Stream Response (SSE)
    Events: meta (context), token (chunks), done (finished)
    ↓
[7] Write Cache
    Redis: Store answer with 30-day TTL
```

**Cache Hit Scenario:** Same user, same query within 30 days
- Steps [2-6] skipped
- Response returned from cache (80%+ faster)
- `meta.used_cache` flag set to `true`

## Request/Response Examples

### Authentication Flow
```bash
# 1. Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "full_name": "John Doe",
    "password": "secure_pass"
  }'
# Response: { "access_token": "...", "refresh_token": "..." }

# 2. Get identity
curl -X GET http://localhost:8000/auth/me \
  -H "Authorization: Bearer <access_token>"
# Response: { "user_id": "550e8400-e29b-41d4-a716-446655440000" }
```

### Settings, Profile & Ingest Flow
```bash
# 3. Validate + persist keys in account
curl -X POST http://localhost:8000/settings/save-keys \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "gemini_api_key": "<gemini-key>",
    "cohere_api_key": "<cohere-key>"
  }'
# Response: { "gemini_valid": true, "cohere_valid": true, "saved": true, "detail": "..." }

# 4. Fetch saved keys for hydration
curl -X GET http://localhost:8000/settings/saved-keys \
  -H "Authorization: Bearer <access_token>"
# Response: { "has_saved_keys": true, "gemini_api_key": "...", "cohere_api_key": "..." }

# 5. Store profile
curl -X PUT http://localhost:8000/profile \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "summary": "Software engineer with 5 years experience",
      "skills": ["Python", "React", "AWS"],
      "experience": [
        { "title": "Senior Engineer", "company": "TechCorp", "duration": "2+ years" }
      ]
    }
  }'
# Response: { "user_id": "...", "data": {...}, "ingested_at": null }

# 6. Index profile
curl -X POST http://localhost:8000/ingest \
  -H "Authorization: Bearer <access_token>" \
  -H "X-Gemini-API-Key: <key>" \
  -H "X-Cohere-API-Key: <key>"
# Response: { "status": "completed", "embedded_chunks": 12, "ingested_at": "2026-03-30T..." }
```

### Generation Flow
```bash
# 7. Generate answer
curl -X POST "http://localhost:8000/generate/stream?prompt=What+are+my+key+skills?" \
  -H "Authorization: Bearer <access_token>" \
  -H "X-Gemini-API-Key: <key>" \
  -H "X-Cohere-API-Key: <key>" \
  -H "Accept: text/event-stream"

# Response stream:
event: meta
data: {"prompt":"What are my key skills?","cache_hit":false,"used_cache":false,"context_count":3,"context":[...]}

event: token
data: "Based"

event: token
data: " on"

event: token
data: " your"

...

event: done
data: {"ok": true}
```

## Header Requirements Summary

| Route Type | Public? | Auth Header | BYOK Keys | Notes |
|---|---|---|---|---|
| `/health` | Yes | No | No | Always available |
| `/auth/register`, `/auth/login`, `/auth/refresh` | Yes | No | No | For getting tokens |
| `/auth/me`, `/profile`, `/settings/*` | No | Yes | No | Identity/profile/settings management |
| `/ingest`, `/generate/stream` | No | Yes | Yes | RAG operations require API keys |

Missing headers:
- No auth token → `401 Unauthorized`
- BYOK keys missing → `422 Unprocessable Entity`

## Storage Architecture

### PostgreSQL (Primary Relational Store)
- **Users**: Authentication + profiles
- **Profiles**: User data blob + ingest timestamp
- **ProfileChunk**: Chunk metadata (source, section type, entity, text)
- **UserAPIKey**: Encrypted account-saved provider keys (`encrypted_gemini_api_key`, `encrypted_cohere_api_key`)

### Qdrant (Vector Database)
- **User Collections**: Per-user embeddings with tenant isolation
- **Vector Search**: Semantic similarity matching
- **Point IDs**: UUID format, normalized from chunk IDs

### Redis (Cache Layer)
- **Key Format**: `{user_id}:{hash(prompt, field_name)}`
- **Value**: Generated answer text
- **TTL**: 30 days (configurable)
- **Pattern**: Semantic caching (answers, not query results)

### SQLite BM25 (Full-Text Search)
- **Index**: Keyword/text search for profile chunks
- **Purpose**: Fast keyword retrieval (parallel to vector search)
- **Format**: SQLite FTS5 virtual table

## Execution Environment

### Services Running
```yaml
API:         FastAPI on port 8000 (Python 3.12)
PostgreSQL:  Port 5432 (database)
Qdrant:      Port 6333 (vector store)
Redis:       Port 6379 (cache)
```

### Critical Environment Variables
```bash
# .env (host)
ALLOWED_ORIGINS=["http://localhost:3000"]   # One-line JSON array string
ENCRYPTION_KEY=<fernet-key>                  # Required for encrypted key persistence
GEMINI_API_KEY=<your-key>
COHERE_API_KEY=<your-key>
DATABASE_URL=postgresql://applyai:password@localhost:5432/applyai
QDRANT_HOST=localhost
REDIS_URL=redis://localhost:6379

# .env.docker (inside containers)
# Same, except:
ALLOWED_ORIGINS=["http://localhost:3000","chrome-extension://<id>"]
QDRANT_HOST=qdrant                    # Service name, not localhost
REDIS_URL=redis://redis:6379          # Service name, not localhost
DATABASE_URL=postgresql://...@postgres:5432/...  # Service name
```

**Rules:**
- Inside Docker containers, use service names as hostnames.
- Keep `ALLOWED_ORIGINS` as a single-line JSON array string (especially in `.env.docker`).

## Implementation Files Reference

Quick lookup for common changes:

| Task | File |
|------|------|
| Add new route | `code/backend/api/routes/*.py` |
| Change auth logic | `code/backend/middleware/scope_guard.py` |
| Modify ingest flow | `code/backend/services/chunking.py`, `embeddings.py` |
| Change generation | `code/backend/services/generation.py` |
| Cache behavior | `code/backend/services/semantic_cache.py` |
| Data models | `code/backend/models/*.py` |
| API schemas | `code/backend/schemas/*.py` |
| Router wiring | `code/backend/main.py` |

## Known Constraints & Gotchas

1. **ALLOWED_ORIGINS format:** Use a one-line JSON array string (e.g. `["http://localhost:3000","chrome-extension://<id>"]`).
2. **Container networking:** Use service names (redis, postgres, qdrant), not localhost.
3. **ENCRYPTION_KEY required:** Must be a valid Fernet key; backend validation fails fast if invalid/missing.
4. **Model fallback:** Gemini quota limits → tries multiple models (code already handles).
5. **Bcrypt:** Version 4.0.1 pinned for passlib compatibility.
6. **Qdrant IDs:** Normalized to UUID before upsert.
7. **BYOK enforcement:** Ingest and generation MUST include both Gemini + Cohere keys.

## Validation & Testing

Health check (always available):
```bash
curl http://localhost:8000/health
# Response: { "status": "ok" }
```

Full flow test sequence:
1. Register user → receive tokens
2. Save provider keys with POST /settings/save-keys
3. Confirm hydration payload with GET /settings/saved-keys
4. Store profile with PUT /profile
5. Ingest profile with POST /ingest (requires BYOK headers)
6. Generate answer with POST /generate/stream (requires BYOK headers)
7. Verify SSE events received correctly

If all succeed, backend is operational.

## Known Issues & Resolutions

See [docs/errors.md](docs/errors.md) for comprehensive issue documentation:
- 9 issues encountered, all resolved
- Lessons learned for future development
- Prevention checklist

---

**Last Updated:** Phase 2 complete. Backend fully operational with all flows validated.
