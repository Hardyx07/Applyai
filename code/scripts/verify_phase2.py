#!/usr/bin/env python3
"""Phase 2.2 exit gate: verify auth -> profile -> ingest -> generate flow end-to-end.

Usage:
    python scripts/verify_phase2.py --gemini-api-key <key> --cohere-api-key <key>

Environment variables:
    APPLYAI_BASE_URL (default: http://127.0.0.1:8000)
    APPLYAI_TEST_EMAIL (optional)
    APPLYAI_TEST_PASSWORD (default: ApplyAi123!)
    GEMINI_API_KEY (optional fallback)
    COHERE_API_KEY (optional fallback)
"""

from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx


@dataclass
class VerifyConfig:
    base_url: str
    email: str
    password: str
    full_name: str
    gemini_api_key: str
    cohere_api_key: str
    timeout_seconds: float
    source: str
    sections: list[str]
    skip_health_check: bool


def _log(message: str) -> None:
    print(f"[verify_phase2] {message}")


def _fail(message: str, exit_code: int = 1) -> int:
    _log(f"FAIL: {message}")
    return exit_code


def _ok(message: str) -> None:
    _log(f"PASS: {message}")


def _parse_iso_datetime(value: str) -> datetime:
    clean = value.strip()
    if clean.endswith("Z"):
        clean = clean[:-1] + "+00:00"
    dt = datetime.fromisoformat(clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _build_profile_payload() -> dict[str, Any]:
    return {
        "data": {
            "experience": [
                {
                    "company": "BitBloom",
                    "title": "Software Engineer",
                    "description": (
                        "Built scalable backend services for job application workflows. "
                        "Reduced response latency by optimizing API calls. "
                        "Collaborated across product and engineering teams."
                    ),
                    "highlights": [
                        "Owned ingestion and retrieval reliability",
                        "Improved production observability",
                    ],
                }
            ],
            "projects": [
                {
                    "name": "ApplyAI",
                    "summary": (
                        "Created a profile-driven assistant for application autofill. "
                        "Implemented secure BYOK key handling."
                    ),
                    "details": [
                        "Designed authenticated profile workflows",
                        "Delivered deterministic ingest reruns",
                    ],
                }
            ],
            "education": [
                {
                    "school": "State University",
                    "degree": "B.Tech Computer Science",
                    "details": (
                        "Focused on distributed systems and information retrieval. "
                        "Completed capstone on semantic search ranking."
                    ),
                }
            ],
        }
    }


def _request_json(
    client: httpx.Client,
    method: str,
    url: str,
    expected_status: int,
    **kwargs: Any,
) -> dict[str, Any]:
    resp = client.request(method, url, **kwargs)
    if resp.status_code != expected_status:
        raise AssertionError(
            f"{method} {url} expected {expected_status}, got {resp.status_code}: {resp.text}"
        )

    try:
        return resp.json()
    except Exception as exc:
        raise AssertionError(f"{method} {url} did not return JSON: {resp.text}") from exc


def _register_or_login(client: httpx.Client, email: str, full_name: str, password: str) -> str:
    register_payload = {
        "email": email,
        "full_name": full_name,
        "password": password,
    }
    register_resp = client.post("/auth/register", json=register_payload)

    if register_resp.status_code == 201:
        body = register_resp.json()
        token = body.get("access_token")
        _assert(isinstance(token, str) and token, "Register response missing access_token")
        return token

    _assert(
        register_resp.status_code == 409,
        f"Unexpected register status: {register_resp.status_code} {register_resp.text}",
    )

    login_payload = {
        "email": email,
        "password": password,
    }
    login_body = _request_json(client, "POST", "/auth/login", 200, json=login_payload)
    token = login_body.get("access_token")
    _assert(isinstance(token, str) and token, "Login response missing access_token")
    return token


def _build_generate_params(prompt: str, field_name: str | None = None, top_k: int | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {"prompt": prompt}
    if field_name:
        params["field_name"] = field_name
    if top_k is not None:
        params["top_k"] = top_k
    return params


def _stream_generate(
    client: httpx.Client,
    *,
    headers: dict[str, str],
    prompt: str,
    field_name: str | None = None,
    top_k: int | None = None,
) -> dict[str, Any]:
    params = _build_generate_params(prompt=prompt, field_name=field_name, top_k=top_k)
    started = time.perf_counter()

    events: list[tuple[str | None, Any]] = []
    tokens: list[str] = []
    content_type = ""

    with client.stream("POST", "/generate/stream", params=params, headers=headers) as resp:
        content_type = resp.headers.get("content-type", "")
        if resp.status_code != 200:
            body = resp.read().decode("utf-8", errors="replace")
            raise AssertionError(
                f"POST /generate/stream expected 200, got {resp.status_code}: {body}"
            )

        current_event: str | None = None
        for line in resp.iter_lines():
            if line is None:
                continue

            clean = line.strip()
            if not clean:
                current_event = None
                continue

            if clean.startswith("event:"):
                current_event = clean.split(":", 1)[1].strip()
                continue

            if not clean.startswith("data:"):
                continue

            payload_raw = clean.split(":", 1)[1].strip()
            try:
                payload = json.loads(payload_raw)
            except json.JSONDecodeError:
                payload = payload_raw

            events.append((current_event, payload))
            if current_event == "token" and isinstance(payload, str):
                tokens.append(payload)

    duration_seconds = time.perf_counter() - started
    answer = "".join(tokens).strip()

    return {
        "content_type": content_type,
        "events": events,
        "answer": answer,
        "duration_seconds": duration_seconds,
    }


def _latest_meta_payload(events: list[tuple[str | None, Any]]) -> dict[str, Any]:
    meta_payloads = [payload for event, payload in events if event == "meta" and isinstance(payload, dict)]
    if not meta_payloads:
        raise AssertionError("Stream did not emit meta event")
    return meta_payloads[-1]


def _run(config: VerifyConfig) -> None:
    with httpx.Client(base_url=config.base_url, timeout=config.timeout_seconds) as client:
        if not config.skip_health_check:
            health = _request_json(client, "GET", "/health", 200)
            _assert(health.get("status") == "ok", "Health endpoint returned unexpected status")
            _ok("Step 1/10: Health check succeeded")

        access_token = _register_or_login(
            client,
            email=config.email,
            full_name=config.full_name,
            password=config.password,
        )
        _ok("Step 2/10: User registration/login succeeded")

        auth_headers = {"Authorization": f"Bearer {access_token}"}

        me = _request_json(client, "GET", "/auth/me", 200, headers=auth_headers)
        user_id = me.get("user_id")
        _assert(isinstance(user_id, str) and user_id, "Missing user_id from /auth/me")
        _ok("Step 3/10: Authenticated identity check succeeded")

        profile_payload = _build_profile_payload()
        profile = _request_json(client, "PUT", "/profile", 200, headers=auth_headers, json=profile_payload)
        _assert(profile.get("user_id") == user_id, "Profile user_id does not match auth user")
        _assert(profile.get("data") == profile_payload["data"], "Stored profile data mismatch")
        _ok("Step 4/10: Profile upsert succeeded")

        ingest_headers = {
            **auth_headers,
            "X-Gemini-API-Key": config.gemini_api_key,
            "X-Cohere-API-Key": config.cohere_api_key,
        }
        ingest_payload = {
            "source": config.source,
            "sections": config.sections,
            "force_reingest": True,
        }

        first_ingest = _request_json(client, "POST", "/ingest", 200, headers=ingest_headers, json=ingest_payload)
        _assert(first_ingest.get("status") == "completed", "First ingest did not complete")
        parent_chunks = int(first_ingest.get("parent_chunks", -1))
        child_chunks = int(first_ingest.get("child_chunks", -1))
        embedded_chunks = int(first_ingest.get("embedded_chunks", -1))
        processed_sections = first_ingest.get("processed_sections")

        _assert(parent_chunks > 0, "parent_chunks must be > 0")
        _assert(child_chunks > 0, "child_chunks must be > 0")
        _assert(embedded_chunks == child_chunks, "embedded_chunks must equal child_chunks")
        _assert(isinstance(processed_sections, list) and processed_sections, "processed_sections must be non-empty")
        first_ingested_at = _parse_iso_datetime(str(first_ingest.get("ingested_at")))
        _ok("Step 5/10: First ingest succeeded with valid chunk counts")

        time.sleep(0.2)

        second_ingest = _request_json(client, "POST", "/ingest", 200, headers=ingest_headers, json=ingest_payload)
        _assert(second_ingest.get("status") == "completed", "Second ingest did not complete")
        _assert(int(second_ingest.get("child_chunks", -1)) == child_chunks, "Re-ingest child_chunks changed unexpectedly")
        _assert(
            int(second_ingest.get("embedded_chunks", -1)) == embedded_chunks,
            "Re-ingest embedded_chunks changed unexpectedly",
        )
        _assert(
            sorted(second_ingest.get("processed_sections", [])) == sorted(processed_sections),
            "Re-ingest processed_sections changed unexpectedly",
        )
        second_ingested_at = _parse_iso_datetime(str(second_ingest.get("ingested_at")))
        _assert(second_ingested_at >= first_ingested_at, "ingested_at did not move forward on re-ingest")
        _ok("Step 6/10: Re-ingest determinism checks passed")

        step7_prompt = "Summarize my backend engineering experience for a software role."
        stream_result = _stream_generate(
            client,
            headers=ingest_headers,
            prompt=step7_prompt,
            field_name="experience",
            top_k=8,
        )
        _assert(
            str(stream_result["content_type"]).startswith("text/event-stream"),
            f"Expected text/event-stream, got {stream_result['content_type']}",
        )
        events = stream_result["events"]
        meta_payload = _latest_meta_payload(events)
        _assert("cache_hit" in meta_payload and isinstance(meta_payload.get("cache_hit"), bool), "meta.cache_hit missing or invalid")
        _assert("context_count" in meta_payload and isinstance(meta_payload.get("context_count"), int), "meta.context_count missing or invalid")
        _assert(meta_payload.get("cache_hit") is False, "Step 7 first generate call should be a cache miss")
        _assert(any(event == "token" for event, _ in events), "Stream did not emit token events")
        done_payloads = [payload for event, payload in events if event == "done"]
        _assert(done_payloads, "Stream did not emit done event")
        _assert(any(isinstance(payload, dict) and payload.get("ok") is True for payload in done_payloads), "done event missing ok=true")
        _assert(stream_result["answer"], "Generated answer was empty")
        _ok("Step 7/10: Happy-path stream assertions passed")

        no_auth_resp = client.post(
            "/generate/stream",
            params=_build_generate_params(prompt="auth failure check", field_name="experience"),
            headers={
                "X-Gemini-API-Key": config.gemini_api_key,
                "X-Cohere-API-Key": config.cohere_api_key,
            },
        )
        _assert(no_auth_resp.status_code == 401, f"Expected 401 without Authorization, got {no_auth_resp.status_code}")

        no_byok_resp = client.post(
            "/generate/stream",
            params=_build_generate_params(prompt="header failure check", field_name="experience"),
            headers=auth_headers,
        )
        _assert(no_byok_resp.status_code == 422, f"Expected 422 without BYOK headers, got {no_byok_resp.status_code}")
        _ok("Step 8/10: Auth/header failure assertions passed")

        cache_prompt = f"Cache behavior validation prompt {int(time.time())}."
        first_cache = _stream_generate(
            client,
            headers=ingest_headers,
            prompt=cache_prompt,
            field_name="projects",
            top_k=8,
        )
        second_cache = _stream_generate(
            client,
            headers=ingest_headers,
            prompt=cache_prompt,
            field_name="projects",
            top_k=8,
        )

        first_cache_meta = _latest_meta_payload(first_cache["events"])
        second_cache_meta = _latest_meta_payload(second_cache["events"])
        _assert(first_cache_meta.get("cache_hit") is False, "First cache validation call should be a cache miss")
        _assert(second_cache_meta.get("cache_hit") is True, "Second cache validation call should be a cache hit")
        _assert(isinstance(first_cache_meta.get("context_count"), int), "First cache meta.context_count missing")
        _assert(isinstance(second_cache_meta.get("context_count"), int), "Second cache meta.context_count missing")

        _assert(first_cache["answer"] == second_cache["answer"], "Cached answer mismatch between repeated calls")
        _assert(
            second_cache["duration_seconds"] < first_cache["duration_seconds"],
            (
                "Expected cached second call to be faster. "
                f"first={first_cache['duration_seconds']:.3f}s second={second_cache['duration_seconds']:.3f}s"
            ),
        )
        _ok("Step 9/10: Cache speed and answer consistency assertions passed")

        isolated_email = f"verify+isolated+{int(time.time())}@applyai.local"
        isolated_token = _register_or_login(
            client,
            email=isolated_email,
            full_name="ApplyAI Isolation Verifier",
            password=config.password,
        )
        isolated_headers = {
            "Authorization": f"Bearer {isolated_token}",
            "X-Gemini-API-Key": config.gemini_api_key,
            "X-Cohere-API-Key": config.cohere_api_key,
        }
        tenant_resp = client.post(
            "/generate/stream",
            params=_build_generate_params(prompt=step7_prompt, field_name="experience", top_k=8),
            headers=isolated_headers,
        )
        _assert(
            tenant_resp.status_code == 404,
            f"Expected 404 for second user without ingest, got {tenant_resp.status_code}: {tenant_resp.text}",
        )
        _ok("Step 10/10: Tenant isolation assertion passed")

        _ok("All checks passed. Phase 2.2 exit gate is green.")


def _parse_args() -> VerifyConfig:
    parser = argparse.ArgumentParser(description="Verify Phase 2.2 flow against a live local API.")
    parser.add_argument(
        "--base-url",
        default=os.getenv("APPLYAI_BASE_URL", "http://127.0.0.1:8000"),
        help="Base URL of FastAPI server.",
    )
    parser.add_argument(
        "--email",
        default=os.getenv("APPLYAI_TEST_EMAIL", f"verify+{int(time.time())}@applyai.local"),
        help="Test account email. Uses timestamped fallback.",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("APPLYAI_TEST_PASSWORD", "ApplyAi123!"),
        help="Test account password.",
    )
    parser.add_argument(
        "--full-name",
        default="ApplyAI Verifier",
        help="Test account full name.",
    )
    parser.add_argument(
        "--gemini-api-key",
        default=os.getenv("GEMINI_API_KEY", ""),
        help="Gemini API key (or set GEMINI_API_KEY).",
    )
    parser.add_argument(
        "--cohere-api-key",
        default=os.getenv("COHERE_API_KEY", ""),
        help="Cohere API key (or set COHERE_API_KEY).",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=60.0,
        help="HTTP request timeout.",
    )
    parser.add_argument(
        "--source",
        default="Resume",
        help="Source label used for ingest header enrichment.",
    )
    parser.add_argument(
        "--sections",
        nargs="*",
        default=["experience", "projects", "education"],
        help="Profile sections to ingest.",
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip GET /health preflight.",
    )

    args = parser.parse_args()

    gemini_key = args.gemini_api_key.strip()
    cohere_key = args.cohere_api_key.strip()
    if not gemini_key:
        parser.error("Missing Gemini API key. Pass --gemini-api-key or set GEMINI_API_KEY.")
    if not cohere_key:
        parser.error("Missing Cohere API key. Pass --cohere-api-key or set COHERE_API_KEY.")

    return VerifyConfig(
        base_url=args.base_url.rstrip("/"),
        email=args.email.strip(),
        password=args.password,
        full_name=args.full_name,
        gemini_api_key=gemini_key,
        cohere_api_key=cohere_key,
        timeout_seconds=args.timeout_seconds,
        source=args.source,
        sections=args.sections,
        skip_health_check=args.skip_health_check,
    )


def main() -> int:
    config = _parse_args()
    try:
        _run(config)
        return 0
    except (AssertionError, httpx.HTTPError, ValueError) as exc:
        return _fail(str(exc), exit_code=1)
    except KeyboardInterrupt:
        return _fail("Interrupted by user", exit_code=130)


if __name__ == "__main__":
    raise SystemExit(main())
