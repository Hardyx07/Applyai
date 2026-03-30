# Phase 2.2 Implementation Issues & Resolution Log

## Overview
This document captures all issues encountered during Phase 2.2 exit gate implementation, their root causes, impacts, and resolutions.

---

## Issue 1: Backend Virtual Environment Tracked in Git

**Severity:** Medium  
**Status:** ✅ Resolved

### Problem
The `backend/venv/` directory and its contents were being tracked by git, including:
- Alembic packages and migration artifacts
- Virtual environment scripts and cache files
- Compiled Python bytecode (*.pyc, *.pyo)
- `.env` files with sensitive keys

### Root Cause
No `.gitignore` file existed at the backend level to exclude development artifacts.

### Impact
- Bloated repository size
- Risk of checking in sensitive API keys
- Difficulty distinguishing real code changes from environment noise
- CI/CD pipeline confusion

### Resolution
Created `code/backend/.gitignore` with Python standard patterns:
```
venv/
__pycache__/
*.pyc
*.pyo
*.pyd
.env
.venv/
build/
dist/
*.egg-info/
```

### Validation
- Ran `git status` to confirm venv artifacts no longer listed
- Verified `.env` no longer tracked before adding to .gitignore

---

## Issue 2: Route Contract Mismatch (GET vs POST)

**Severity:** High  
**Status:** ✅ Resolved

### Problem
Initial endpoint implementation used `GET /generate/stream` but Phase 2.2 specification required `POST /generate/stream`.
- GET requests are idempotent and typically shouldn't modify state
- POST is semantically correct for stateful operations (cache writes, embeddings)
- Verifier tests expected POST method

### Root Cause
Initial implementation didn't align with specification; specification changed but code wasn't updated.

### Impact
- Verifier tests failed with HTTP 405 (Method Not Allowed)
- API contract documentation was inconsistent
- Client code expected POST but server rejected it

### Resolution
Changed route decorator in `code/backend/api/routes/generate.py` at line 20:
```python
# Before
@router.get("/stream")

# After
@router.post("/stream")
```

Updated corresponding documentation in `docs/backend-routing.md`.

### Validation
- Queried OpenAPI schema: `/generate/stream` now lists method as `POST`
- Verifier successfully called `POST /generate/stream` and received SSE response

---

## Issue 3: Shell Environment Variable Parsing Failure

**Severity:** High  
**Status:** ✅ Resolved

### Problem
When sourcing `.env`, the shell failed to parse `ALLOWED_ORIGINS` variable:
```
ALLOWED_ORIGINS=["http://localhost:3000"]
```

Error:
```
pydantic_settings.sources.SettingsError: error parsing value for field "ALLOWED_ORIGINS"
Expected `list` but received something else
```

### Root Cause
Shell interpreter consumed the double quotes during variable expansion, then Pydantic received malformed data:
```bash
# What shell saw:
ALLOWED_ORIGINS=["http://localhost:3000"]

# What Pydantic received (with quotes stripped):
[http://localhost:3000]  # Invalid JSON
```

### Impact
- Backend failed to start when loading from `.env`
- Verifier couldn't run tests against the API
- CORS middleware couldn't initialize allowed origins list

### Resolution
Wrapped JSON string with single quotes in `code/backend/.env`:
```bash
# Before
ALLOWED_ORIGINS=["http://localhost:3000"]

# After
ALLOWED_ORIGINS='["http://localhost:3000"]'
```

Validated with:
```bash
set -a && source .env && set +a
python -c "import json; print(json.loads(os.environ['ALLOWED_ORIGINS']))"
# Output: ['http://localhost:3000']  ✅
```

### Validation
- API started successfully and loaded ALLOWED_ORIGINS as list
- CORS requests from localhost:3000 were accepted
- Pydantic validation passed with proper JSON structure

---

## Issue 4: Docker Image Staleness

**Severity:** High  
**Status:** ✅ Resolved

### Problem
Container running on port 8000 was a stale image built before `/generate/stream` route was added.
- Requests to `/generate/stream` returned `404 Not Found`
- Verifier Step 7 failed: "Route not found"
- Issue only visible at runtime; no build errors indicated the problem

### Root Cause
Docker Compose continued running old container image after code changes; no rebuild performed after route implementation.

### Impact
- Verifier couldn't test generation pipeline
- Developers couldn't validate API changes without manual container restart
- Difficult to diagnose: code looked correct, container was wrong

### Resolution
Performed clean Docker rebuild cycle:
```bash
docker compose down        # Remove all containers/networks
docker compose up -d --build  # Rebuild image and start fresh
```

Verified all services healthy:
- backend-api-1: healthy
- backend-postgres-1: healthy
- backend-qdrant-1: healthy
- backend-redis-1: healthy

### Validation
- Queried OpenAPI from running container: `/generate/stream` now present
- Verifier Step 7 passed: generation route responding

---

## Issue 5: Gemini API Quota Exhaustion

**Severity:** High  
**Status:** ⚠️ Mitigated (Provider-side limit)

### Problem
All generation attempts returned error:
```
google.api_core.exceptions.ResourceExhausted: 429 You have exceeded your quota for this API.
  Resource quota units (6) exceeded limit (0)
```

Gemini free-tier quota limits hit zero; all model candidates (gemini-1.5-flash, gemini-2.0-flash, etc.) exhausted.

### Root Cause
Aggressive testing and verifier iterations consumed free-tier quota during development.

### Impact
- Generation failed at Step 7 of verifier with HTTP 502 "Failed to generate response"
- All model fallbacks exhausted
- Blocking issue for gate validation

### Potential Solutions (Applied)
1. **Model Fallback** (code change): Added iteration through multiple Gemini models in `code/backend/services/generation.py`:
   ```python
   candidate_models = [
       "gemini-1.5-flash",
       "gemini-2.0-flash",
       "gemini-1.5-pro",
   ]
   for model in candidate_models:
       try:
           # attempt generation with model
       except ResourceExhausted:
           continue
   ```

2. **Quota Management** (behavioral): Reduced test frequency, batched verification runs

3. **Key Rotation** (if needed): Use different API key with fresh quota tier

### Current Status
- Quota limit appears to have reset or key was rotated
- Latest verifier run passed Step 7 successfully
- Fallback logic remains in place for resilience

### Validation
- Later verifier runs completed Step 7 without quota errors
- Generation responses received valid completions

---

## Issue 6: Redis Service Missing from Docker

**Severity:** Critical  
**Status:** ✅ Resolved

### Problem
Verifier Step 9 (cache performance test) failed:
```
Expected cached second call to be faster than first.
first=7.256s second=12.390s
```

Cache was not functional; second query should reuse cached answer from Redis but took longer instead.

### Root Cause
Redis service was not included in Docker Compose configuration, and `.env.docker` referenced non-existent localhost Redis at container runtime.

### Technical Details
- `.env.docker` pointed to: `redis://localhost:6379`
- From inside container, `localhost` resolved to the container itself, not the host
- No Redis process running inside container
- Semantic cache fell back to skip (no error, but also no caching)

### Impact
- Cache feature was non-functional in Docker environment (worked only on host)
- Step 9 timing assertion failed
- Phase 2.2 exit gate could not close because cache requirement was not met

### Resolution
Added Redis service to `code/backend/docker-compose.yml`:
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

Updated `api` service dependencies:
```yaml
depends_on:
  postgres:
    condition: service_healthy
  qdrant:
    condition: service_healthy
  redis:
    condition: service_healthy
```

Updated `.env.docker` Redis address:
```bash
# Before
REDIS_URL=redis://localhost:6379

# After
REDIS_URL=redis://redis:6379  # Uses Docker service hostname
```

### Validation
1. Docker Compose rebuild: `docker compose down && docker compose up -d --build`
   - Output: All 6 services healthy including "Container backend-redis-1 Healthy"

2. Redis connectivity test from inside API container:
   ```bash
   docker compose exec -T api python -c \
     "import redis; r = redis.from_url('redis://redis:6379'); r.set('test','ok'); print('redis_get=', r.get('test').decode())"
   # Output: redis_get= ok ✅
   ```

3. Full verifier run Step 9:
   ```
   [verify_phase2] PASS: Step 9/10: Cache speed and answer consistency assertions passed
   ```

---

## Issue 7: BYOK Header Authorization Failures

**Severity:** Medium  
**Status:** ✅ Resolved via Testing

### Problem
Initial queries to ingest/generation routes without BYOK headers returned `422 Unprocessable Entity`:
```
detail: "Missing required headers: X-Gemini-API-Key, X-Cohere-API-Key"
```

### Root Cause
Routes protected by `require_byok_keys` dependency, but clients omitted headers or used wrong names.

### Impact
- Initial tests against `/ingest` failed with vague error
- Step 5-7 of verifier couldn't proceed without valid headers

### Resolution
Verifier script updated to include BYOK headers on all protected routes:
```python
headers = {
    "Authorization": f"Bearer {access_token}",
    "X-Gemini-API-Key": gemini_api_key,
    "X-Cohere-API-Key": cohere_api_key,
}
```

Dependency validation in `code/backend/api/deps.py` enforces presence and format.

### Validation
- Verifier Steps 5-7 passed with headers present
- Explicit negative test in Step 8: confirmed 422 returned when headers missing

---

## Issue 8: Tenant Isolation Not Validated

**Severity:** Medium  
**Status:** ✅ Validated in Step 10

### Problem
No test coverage for the critical isolation requirement: User A's query should never retrieve User B's profile data.

### Root Cause
Retrieval pipeline uses `user_id` as filter but was not explicitly tested in verifier.

### Impact
- Privacy/security risk if isolation broken
- Compliance requirement unvalidated
- Could leak sensitive profile data between users

### Resolution
Added Step 10 to verifier (`_run()` function):
```python
# Step 9: Create second user, ingest different profile
# Step 10: Query with User 1 token, verify no User 2 context
```

Explicit check:
```python
# Verify User 1's answer doesn't reference User 2's profile
assert "Jane" not in answer_user1  # User 2's name not in User 1's answer
```

### Validation
Verifier Step 10 passed:
```
[verify_phase2] PASS: Step 10/10: Tenant isolation assertion passed
```

---

## Issue 9: Re-ingest Determinism Not Tested

**Severity:** Medium  
**Status:** ✅ Validated in Step 6

### Problem
No validation that re-ingesting the same profile produces identical chunks and embeddings.

### Root Cause
Chunking algorithm or embedding model could produce non-deterministic results, silently breaking dedup.

### Impact
- Vector index could accumulate duplicate vectors
- Memory/performance waste
- Answers could change between re-ingests

### Resolution
Added Step 6 to verifier after initial ingest:
```python
# Step 5: First ingest, count chunks
# Step 6: Re-ingest same profile, verify chunk count identical
```

### Validation
Verifier Step 6 passed:
```
[verify_phase2] PASS: Step 6/10: Re-ingest determinism checks passed
```

---

## Summary Table

| Issue | Severity | Root Cause | Resolution | Status |
|-------|----------|-----------|-----------|--------|
| 1. venv in git | Medium | Missing .gitignore | Created backend/.gitignore | ✅ |
| 2. GET vs POST | High | Spec mismatch | Changed route to POST | ✅ |
| 3. Shell env parsing | High | Quote handling | Single quotes around JSON | ✅ |
| 4. Stale Docker | High | No rebuild | Clean docker compose rebuild | ✅ |
| 5. Gemini quota | High | Provider limit | Model fallback + key rotation | ⚠️ |
| 6. No Redis | Critical | Config missing | Added Redis service + hostname fix | ✅ |
| 7. BYOK headers | Medium | Header validation | Verifier includes headers | ✅ |
| 8. No isolation test | Medium | Missing test step | Added Step 10 isolation check | ✅ |
| 9. No determinism test | Medium | Missing test step | Added Step 6 re-ingest check | ✅ |

---

## Lessons Learned

1. **Environment Configuration:** Complex values (JSON, lists) need careful quoting in shell environments. Consider using `.env.example` with comments and validation scripts.

2. **Docker Compose:** Always specify `depends_on` with `condition: service_healthy` to enforce correct startup order and prevent "localhost" resolution issues in containers.

3. **Test Coverage:** End-to-end verifiers should validate non-obvious requirements (determinism, isolation, caching) explicitly, not just happy-path flows.

4. **API Contracts:** Document method (GET/POST/PUT) clearly in specs and validate against OpenAPI schema early.

5. **Provider Quotas:** Build fallback mechanisms (model rotation, key rotation, graceful degradation) for external API limits.

6. **Container Images:** After code changes, always rebuild Docker images explicitly; running containers don't auto-update.

---

## Prevention Checklist for Future Phases

- [ ] Create `.gitignore` at project root first, before committing any artifacts
- [ ] Lock API route methods (GET/POST/PUT/DELETE) in documented spec before implementation
- [ ] Write `.env` parsing tests that exercise shell + app environment loading
- [ ] Add CI post-build step to rebuild Docker images and run smoke tests
- [ ] Implement graceful fallback for all external API calls (quota, rate limits, outages)
- [ ] Use Docker internal hostnames (`service:port`) in container env vars, not `localhost`
- [ ] Add explicit negative test cases (header missing, wrong tenant, invalid auth) to verifiers
- [ ] Test determinism by running ingest twice on same data and comparing outputs
- [ ] Validate isolation by multi-user test scenarios