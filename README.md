# ApplyAI

> **Stop copy-pasting your resume into every job form. Let your resume answer for itself.**

---

## The Problem

I was applying for internships. Filling out the same forms, over and over.

Every company has their own application portal. Every portal has the same fields. "Describe a project you're proud of." "What's your experience with X?" "Why do you want to join us?" Same questions, different boxes.

And every time, I'd do the same stupid ritual:

1. Open my resume PDF in another tab
2. Find the relevant bullet point
3. Copy it
4. Paste it into ChatGPT
5. Type "make this into a paragraph for a job application"
6. Copy the output
7. Paste it into the form
8. Repeat 20 more times

That's not applying for a job. That's being a human copy-paste machine between my resume and an LLM.

The information already exists. Everything I've done, built, and shipped is sitting in my resume. The LLM is smart enough to turn it into a great answer. But there's so much friction between "question on a form" and "good answer in the box" that I'd lose 2-3 hours per application just to manual labor.

I'm a lazy engineer. When I find myself doing the same manual thing repeatedly, my first instinct is to automate it. So I did.

---

## The Idea

What if the whole ritual — open resume, find relevant experience, ask LLM, paste answer — happened automatically, the moment you clicked on a job form field?

You land on an application. You click "Work Experience." The extension already knows your resume. It figures out what the field is asking. It pulls the most relevant things you've actually done. It writes a grounded answer and types it in — while you sit there and review it.

No tab-switching. No copy-pasting. No re-explaining yourself to ChatGPT for the hundredth time.

That's ApplyAI. I built it for myself first. Turns out a lot of people do the same stupid ritual.

---

## What It Does

ApplyAI is a two-surface platform:

**1. Profile Builder (Web App)**
You build a structured knowledge base from your resume — work experience, projects, skills, education. Not just text. Semantically chunked, embedded, and stored so it can be retrieved with precision.

**2. Autofill Chrome Extension**
When you land on a job application form, the extension detects the fields, understands what each one is asking, retrieves the most relevant chunks from your knowledge base, and streams a grounded answer directly into the field — word by word, in real time.

No hallucinations. No made-up experience. Every answer is *grounded* in what you actually wrote about yourself.

---

## How It Works — The Technical Architecture

This is where it gets interesting.

### The Core Insight: RAG for Personal Knowledge

Most AI writing tools use a generic LLM that knows nothing about you. They hallucinate. They produce fluffy, generic answers. They sound like everyone else.

ApplyAI uses **Retrieval-Augmented Generation (RAG)** — a pattern where the LLM is *grounded* in a retrieved context before generating. The model doesn't guess. It reads your actual experience, then writes.

Here's the pipeline:

```
Your Profile Data
      ↓
  Chunking (Parent-Child)
      ↓
  Context Headers Prepended
      ↓
  Gemini Embeddings (gemini-embedding-001)
      ↓
  Qdrant (Vector Store) + BM25 (Keyword Index)
      ↓
────────────── RETRIEVAL ──────────────
Job Form Field Detected
      ↓
  Query Embedded
      ↓
  Hybrid Search (Qdrant Vector + BM25 Keyword)
      ↓
  RRF Fusion (merges both result sets)
      ↓
  Cohere Rerank (precision pass)
      ↓
  Prompt Assembly (context + field intent)
      ↓
  Gemini Generation → SSE Stream
      ↓
  Text typed into form field in real time
```

### Why Hybrid Search?

Vector search alone is *semantic* — it finds conceptually similar content even if the words don't match. But it misses exact keyword matches ("BitBloom", "FastAPI", specific technologies).

BM25 is *lexical* — it finds exact keyword matches but misses semantic meaning.

Hybrid search combines both. The two ranked lists are merged using **Reciprocal Rank Fusion (RRF)** — a formula that rewards documents appearing high in *both* lists. Then Cohere's reranker does a final precision pass, scoring each chunk's actual relevance to the query.

The result: retrieval that's both semantically aware and keyword-precise.

### Why Parent-Child Chunking?

A naive approach would split your resume into fixed-size text windows. This loses context — a bullet point without its surrounding job title is meaningless.

Parent-Child chunking preserves structure:
- **Parent chunk** = the full experience block (entire BitBloom project entry)
- **Child chunks** = individual bullets within it

Children are embedded for precise retrieval (small = specific = higher signal). But when a child is retrieved, the parent context is available for the prompt. You get precision *and* context.

### Why Context Headers?

Each chunk gets a prepended header before embedding:
```
[Source: Resume | Type: Project | Entity: BitBloom]
Built a developer ecosystem platform with MERN stack...
```

This tells the embedding model *what kind of thing this is*, not just *what it says*. A bullet about "improving latency" from a work experience chunk retrieves differently from the same words in a project description. The header makes that distinction explicit in the vector space.

### BYOK — Bring Your Own Key

ApplyAI uses a zero-cost-to-operate model. Users bring their own Gemini and Cohere API keys. The backend is stateless — keys are passed in request headers, used for that request, and never stored. The platform costs nothing to run at scale because the LLM cost is borne entirely by the user's own quota.

This is also a privacy guarantee: your resume data is embedded using *your* key, stored under *your* user ID, and never commingled with another user's data.

### Tenant Isolation via Scope Guard

Every request to the backend passes through a `ScopeGuardMiddleware` that extracts the authenticated `user_id` from the JWT and stamps it onto `request.state`. Every downstream call — Qdrant queries, BM25 lookups, database reads — is filtered by this `user_id`. There is no code path where user A's data can appear in user B's retrieval results.

### Semantic Cache

Answering the same question twice (common in applications) should be near-instant. Redis stores the generated response keyed by `user_id + SHA-256(query)`. Cache hits return in under 100ms without touching the LLM. TTL is 30 days.

---

## The Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 15 + React 19 | App Router, Server Components, streaming-native |
| Extension | Plasmo MV3 | Best-in-class Chrome extension framework |
| Backend | FastAPI + Python 3.12 | Async-first, great for SSE streaming |
| Database | PostgreSQL (self-hosted) | Full control, resume value over managed services |
| Migrations | Alembic + SQLAlchemy | Production-grade schema versioning |
| Vector Store | Qdrant | Fast, payload-filterable, self-hostable |
| Keyword Index | BM25s (SQLite FTS5) | Zero-dependency lexical search |
| Embeddings | gemini-embedding-001 | 1536-dim, strong multilingual performance |
| Reranking | Cohere Rerank v2 | Best retrieval precision pass available via API |
| Generation | Gemini Flash | Fast, capable, cost-effective |
| Cache | Redis (Upstash) | Serverless Redis for semantic response caching |
| Hosting | Modal (backend) + Vercel (frontend) | Serverless, scales to zero, cheap |

---

## What I Learned Building This

### RAG is an architecture, not a feature

Before this project, I thought RAG was "give the LLM some context before asking it something." It's not. It's an entire retrieval engineering problem — chunking strategy, embedding model choice, index design, fusion algorithms, reranking passes, prompt construction. Each layer compounds. A bad chunking strategy poisons everything downstream.

### Hybrid search is non-negotiable for precision

Pure vector search sounds impressive but fails on proper nouns — company names, technology names, specific skills. The first time I tested vector-only retrieval and asked "tell me about my FastAPI experience" and got back a chunk about "building web services" (semantically similar, lexically wrong), I understood why BM25 still exists.

### Stateless backends make multi-tenant security tractable

The BYOK + stateless design forced a clean security model. There's no session state to manage, no key storage attack surface, no complex per-tenant configuration. The middleware stamps the user identity once and every downstream call inherits it. This pattern — identity-at-middleware, propagated via request state — is something I'll use in every multi-tenant system I build.

### SSE is underrated for AI UX

WebSockets feel like the obvious choice for streaming. SSE is simpler — unidirectional, HTTP-native, works through proxies, doesn't require a connection manager. For AI token streaming where the server pushes and the client just renders, SSE is the right tool and WebSockets is overengineering.

### Self-hosting forces you to understand what managed services hide

Running PostgreSQL in Docker instead of Supabase meant I had to understand connection pooling, migration safety, async engine configuration, and healthcheck patterns. Supabase would have hidden all of that. The friction was the learning.

---

## Vision

ApplyAI v1 solves the mechanical problem: stop rewriting the same answers.

But the deeper vision is a **personal career intelligence layer** — a system that knows your professional history better than you can recall it under interview pressure, that surfaces the right experience at the right moment, that gets smarter as you add to it.

**v2 roadmap:**
- BGE-M3 multi-vector embeddings for richer semantic representation
- Local LLM support via Ollama — fully offline, zero API dependency
- Retrieval analytics — which chunks win the most applications, what experience is being underutilized
- Interview prep mode — practice answers grounded in your actual experience
- Application tracking — close the loop between what was generated and what got responses

The endgame isn't autofill. It's a system that helps you understand and articulate your own value more clearly than you could alone.

---



## Running Locally

```bash
# 1. Clone and install frontend deps
git clone https://github.com/yourusername/applyai
cd applyai
pnpm install

# 2. Start backend services
cd backend
docker compose up -d        # Postgres + Redis + Qdrant
cp .env.example .env        # fill in SECRET_KEY
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# 3. Run Phase 2 verification suite
python scripts/verify_phase2.py \
  --gemini-key YOUR_KEY \
  --cohere-key YOUR_KEY

# 4. Start frontend
cd ..
pnpm dev
```

---

## Built By

**Hardik Tailor** — 2nd year B.Tech CS, JECRC University.

Building AI products that solve real problems, not demos.

---

*Built because I was tired of being a copy-paste machine between my resume and ChatGPT.*