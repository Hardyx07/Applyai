


# ApplyAI — High Level Design (HLD)

**Version:** 1 (BYOK & Efficiency Update)
**Status:** Production-Ready
**Stack:** Gemini 3.1 Flash-Lite · gemini-embedding-001 · Qdrant · BM25s · Cohere Rerank · FastAPI · PostgreSQL · Redis · Modal · Next.js 15 · Plasmo MV3

---

# 1. System Overview

ApplyAI is a zero-LLM-cost, dual-surface platform utilizing a **Bring Your Own Key (BYOK)** model. 

### Part 1 — Profile Builder (Web App)
Users construct a structured professional knowledge base (work experience, projects, skills). This becomes the grounded RAG corpus. The web app also serves as the onboarding hub for users to input, validate, and save Gemini/Cohere keys to their account with encrypted-at-rest storage.

### Part 2 — Autofill Chrome Extension
The extension detects job-form fields, injects user API keys into requests, and generates grounded answers via a stateless backend. V1 focuses on field generation + SSE injection with semantic caching. Vision classification flow is deferred.

---

# 2. Architecture Diagram

```text
CLIENT LAYER (BYOK)

Next.js 15 Web App
    onboarding & key validation
    dashboard & RAG inspector

Plasmo Chrome Extension
    secure local key cache (chrome.storage.local)
    account connect + key hydration
    field detection & generated fill
    SSE answer injection


↓ HTTPS (Passes X-API-Keys in Headers)


FASTAPI BACKEND (Stateless)

/auth (JWT Validation)
/settings (validate/save/fetch keys)
/ingest (Chunking & Embedding)
/generate (SSE Stream)
Scope-Guard Middleware (Enforces user_id isolation)


↓


RAG PIPELINE

semantic cache check (Redis)
query enrichment
metadata-augmented hybrid retrieval (Qdrant + BM25)
RRF merge & reranking (Cohere)
grounded generation (Gemini)


↓


DATA LAYER

Qdrant (Vector Store - Single Collection)
BM25s (Keyword Index)
PostgreSQL (Metadata + encrypted user_api_keys)
Redis (Semantic Cache)
```

---

# 3. Component Breakdown

## 3.1 Profile Builder (Next.js 15)
* **Routes:** `/dashboard/onboarding`, `/dashboard/profile`, `/dashboard/keys`, `/dashboard`
* **Key Manager:** Secure UI for pasting keys, validating via `/settings/validate-keys`, and persisting via `/settings/save-keys`.
* **Hydration:** On auth init/login/register, web client fetches `/settings/saved-keys` and hydrates browser cache.

## 3.2 Chrome Extension (Plasmo MV3)
* **Storage:** `chrome.storage.local` cache for runtime API-key header injection.
* **Connect Sync:** After account connect, extension hydrates keys from `/settings/saved-keys`.
* **Vision Gating:** Deferred in current implementation scope.
* **Injection:** Listens to SSE streams and types into standard DOM elements and Shadow DOM components in real-time.

## 3.3 Backend (FastAPI Python 3.12)
* **RAG Pass-Through:** `/ingest` and `/generate/stream` extract `X-Gemini-API-Key` and `X-Cohere-API-Key` from headers to initialize clients per request.
* **Encrypted Key Persistence:** `/settings/save-keys` validates then stores provider keys encrypted with Fernet; `/settings/saved-keys` decrypts for authenticated hydration clients.
* **Scope-Guard Middleware:** Automatically intercepts vector database calls and forces a `user_id` payload filter to prevent cross-tenant data leaks.

---

# 4. End-to-End Data Flow

## Key Lifecycle Flow (Account + Local Cache)
1. User submits keys from web/extension UI.
2. Backend validates provider keys.
3. Backend encrypts keys with Fernet (`ENCRYPTION_KEY`) and upserts per-user record.
4. On login/register/connect, client requests `/settings/saved-keys`.
5. Client hydrates local runtime cache (browser localStorage / chrome.storage.local).
6. RAG calls continue sending BYOK headers on each `/ingest` and `/generate/stream` request.

## Ingestion Flow (Metadata-Augmented)
1. User submits text via Web App.
2. Text undergoes **Parent-Child chunking** and gets prepended with contextual headers (e.g., `[Source: Resume | Entity: BitBloom]`).
3. Sent to `gemini-embedding-001` (using user's key).
4. Parallel insert into Qdrant and BM25 index.

## Generation Flow (Semantic Cache & SSE)
1. Extension detects field and user clicks "Generate".
2. Extension sends POST request with JWT and API keys in headers.
3. **Redis Check:** Backend vectors the field intent and checks Redis. If $>0.95$ match, return cached answer instantly.
4. If miss, run Hybrid Retrieval (BM25 + Qdrant) -> RRF Merge -> Cohere Rerank.
5. Gemini-3.1-Flash-Lite generates response.
6. Backend streams response via **Server-Sent Events (SSE)** back to the extension.
7. Extension injects text word-by-word into the job form.

---

# 5. API Design

All protected routes require a valid JWT in the `Authorization` header.
Provider keys are additionally required on RAG routes (`/ingest`, `/generate/stream`).

## Required Custom Headers
```http
X-Gemini-API-Key: string
X-Cohere-API-Key: string
```

## Core Endpoints
* `POST /auth/...`: Standard JWT (Access: 15m, Refresh: 7d).
* `POST /settings/validate-keys`: Dry-run to verify user keys.
* `POST /settings/save-keys`: Validate and persist encrypted account keys.
* `GET /settings/saved-keys`: Fetch decrypted keys for authenticated client hydration.
* `POST /ingest`: Processes profile data.
* `POST /generate/stream`: Accepts query params, returns `text/event-stream` for streaming output.
* Deferred (not mounted in current backend): `/classify/vision`.

### Contract Boundary
* `/ingest` and `/generate/stream` remain header-driven and still require `X-Gemini-API-Key` and `X-Cohere-API-Key`.
* Account-saved keys are for client hydration convenience, not implicit backend fallback for RAG routes.

---

# 6. Database Design

* **PostgreSQL (Supabase):** Users, Profiles, Evaluation Logs, `user_api_keys` (encrypted Gemini/Cohere key material).
* **Qdrant:** Single collection. Payloads contain `user_id` and `parent_chunk_id`.
* **Redis (Upstash):** * `semantic_cache:{user_id}:{query_hash}` -> Stored LLM response. TTL: 30 days.

---

# 7. Constraints, Tradeoffs & Scale

| Factor | Strategy | Implication |
| :--- | :--- | :--- |
| **API Costs** | BYOK Model | Zero LLM overhead for the platform. Infinite scale potential based entirely on user quotas. |
| **Latency** | Semantic Cache & SSE | Drop perceived wait times from ~4s down to <500ms for common application questions. |
| **User Friction** | Account Key Persistence + Guided Onboarding | Users still source their own keys, but no longer need repeated re-entry after login/connect. |
| **Data Privacy** | Encryption at Rest + Scope-Guard | Keys are encrypted in PostgreSQL for hydration use, not logged, and RAG data isolation remains enforced at middleware level. |

---

# 8. v2 Upgrade Roadmap

* **Local LLM Support:** Allow users to connect local models (via Ollama) to completely bypass third-party API keys.
* **BGE-M3 Hybrid Search:** Move away from separate BM25/Qdrant processing into a unified multi-vector approach.
* **Retrieval Analytics:** Dashboard showing users which profile chunks are winning the most job applications.

---