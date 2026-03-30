


# ApplyAI — High Level Design (HLD)

**Version:** 1 (BYOK & Efficiency Update)
**Status:** Production-Ready
**Stack:** Gemini 3.1 Flash-Lite · gemini-embedding-001 · Qdrant · BM25s · Cohere Rerank · FastAPI · PostgreSQL · Redis · Modal · Next.js 15 · Plasmo MV3

---

# 1. System Overview

ApplyAI is a zero-LLM-cost, dual-surface platform utilizing a **Bring Your Own Key (BYOK)** model. 

### Part 1 — Profile Builder (Web App)
Users construct a structured professional knowledge base (work experience, projects, skills). This becomes the grounded RAG corpus. The web app also serves as the onboarding hub for users to securely input and validate their Gemini and Cohere API keys.

### Part 2 — Autofill Chrome Extension
The extension detects job-form fields, injects user API keys into requests, and generates grounded answers via a stateless backend. It features manual vision gating, semantic caching for speed, and real-time streaming (SSE) injection.

---

# 2. Architecture Diagram

```text
CLIENT LAYER (BYOK)

Next.js 15 Web App
    onboarding & key validation
    dashboard & RAG inspector

Plasmo Chrome Extension
    secure local key storage
    field detection & vision gating
    SSE answer injection


↓ HTTPS (Passes X-API-Keys in Headers)


FASTAPI BACKEND (Stateless)

/auth (JWT Validation)
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
PostgreSQL (Metadata)
Redis (Semantic Cache)
```

---

# 3. Component Breakdown

## 3.1 Profile Builder (Next.js 15)
* **Routes:** `/onboard`, `/profile`, `/settings/keys`, `/dashboard`
* **Key Manager:** Secure UI for pasting and validating Gemini/Cohere keys. Tests keys with a dry-run API call before saving.

## 3.2 Chrome Extension (Plasmo MV3)
* **Storage:** `chrome.storage.local` (encrypted) for API keys.
* **Vision Gating:** Manual "Use AI Vision" button appears only if DOM detection confidence is $< 0.6$.
* **Injection:** Listens to SSE streams and types into standard DOM elements and Shadow DOM components in real-time.

## 3.3 Backend (FastAPI Python 3.12)
* **Stateless Pass-Through:** Extracts `X-Gemini-API-Key` and `X-Cohere-API-Key` from headers to initialize clients per request.
* **Scope-Guard Middleware:** Automatically intercepts vector database calls and forces a `user_id` payload filter to prevent cross-tenant data leaks.

---

# 4. End-to-End Data Flow

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

All protected routes require a valid JWT in the `Authorization` header AND valid provider keys.

## Required Custom Headers
```http
X-Gemini-API-Key: string
X-Cohere-API-Key: string
```

## Core Endpoints
* `POST /auth/...`: Standard JWT (Access: 15m, Refresh: 7d).
* `POST /settings/validate-keys`: Dry-run to verify user keys.
* `POST /ingest`: Processes profile data.
* `POST /classify/vision`: Triggered *only* manually by user via extension.
* `GET /generate/stream`: Accepts query params, returns `text/event-stream` for UI typing effect.

---

# 6. Database Design

* **PostgreSQL (Supabase):** Users, Profiles, Evaluation Logs.
* **Qdrant:** Single collection. Payloads contain `user_id` and `parent_chunk_id`.
* **Redis (Upstash):** * `semantic_cache:{user_id}:{query_hash}` -> Stored LLM response. TTL: 30 days.

---

# 7. Constraints, Tradeoffs & Scale

| Factor | Strategy | Implication |
| :--- | :--- | :--- |
| **API Costs** | BYOK Model | Zero LLM overhead for the platform. Infinite scale potential based entirely on user quotas. |
| **Latency** | Semantic Cache & SSE | Drop perceived wait times from ~4s down to <500ms for common application questions. |
| **User Friction** | Guided Onboarding | Users must source their own keys. Requires crystal-clear instructions and deep links to API dashboards to avoid drop-off. |
| **Data Privacy** | Stateless Backend & Scope-Guard | Keys are never logged or stored on the server. Data isolation is strictly enforced at the middleware level. |

---

# 8. v2 Upgrade Roadmap

* **Local LLM Support:** Allow users to connect local models (via Ollama) to completely bypass third-party API keys.
* **BGE-M3 Hybrid Search:** Move away from separate BM25/Qdrant processing into a unified multi-vector approach.
* **Retrieval Analytics:** Dashboard showing users which profile chunks are winning the most job applications.

---

Would you like me to write the FastAPI dependency code that securely extracts those API keys from the headers and initializes the Gemini client?