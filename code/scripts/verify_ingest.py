#!/usr/bin/env python3
"""Phase 2.1 exit gate: verify auth -> profile -> ingest flow end-to-end.

Usage:
    python scripts/verify_ingest.py --gemini-api-key <key> --cohere-api-key <key>

Environment variables:
    APPLYAI_BASE_URL (default: http://127.0.0.1:8000)
    APPLYAI_TEST_EMAIL (optional)
    APPLYAI_TEST_PASSWORD (default: ApplyAi123!)
    GEMINI_API_KEY (optional fallback)
    COHERE_API_KEY (optional fallback)
"""

from __future__ import annotations

import argparse
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
    print(f"[verify_ingest] {message}")


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


def _register_or_login(client: httpx.Client, cfg: VerifyConfig) -> str:
    register_payload = {
        "email": cfg.email,
        "full_name": cfg.full_name,
        "password": cfg.password,
    }
    register_resp = client.post("/auth/register", json=register_payload)

    if register_resp.status_code == 201:
        body = register_resp.json()
        _ok("User registration succeeded")
        token = body.get("access_token")
        _assert(isinstance(token, str) and token, "Register response missing access_token")
        return token

    _assert(
        register_resp.status_code == 409,
        f"Unexpected register status: {register_resp.status_code} {register_resp.text}",
    )
    _log("User already exists; falling back to login")

    login_payload = {
        "email": cfg.email,
        "password": cfg.password,
    }
    login_body = _request_json(client, "POST", "/auth/login", 200, json=login_payload)
    token = login_body.get("access_token")
    _assert(isinstance(token, str) and token, "Login response missing access_token")
    _ok("User login succeeded")
    return token


def _run(config: VerifyConfig) -> None:
    with httpx.Client(base_url=config.base_url, timeout=config.timeout_seconds) as client:
        if not config.skip_health_check:
            health = _request_json(client, "GET", "/health", 200)
            _assert(health.get("status") == "ok", "Health endpoint returned unexpected status")
            _ok("Health check succeeded")

        access_token = _register_or_login(client, config)

        auth_headers = {"Authorization": f"Bearer {access_token}"}

        me = _request_json(client, "GET", "/auth/me", 200, headers=auth_headers)
        user_id = me.get("user_id")
        _assert(isinstance(user_id, str) and user_id, "Missing user_id from /auth/me")
        _ok("Authenticated identity check succeeded")

        profile_payload = _build_profile_payload()
        profile = _request_json(client, "PUT", "/profile", 200, headers=auth_headers, json=profile_payload)
        _assert(profile.get("user_id") == user_id, "Profile user_id does not match auth user")
        _assert(profile.get("data") == profile_payload["data"], "Stored profile data mismatch")
        _ok("Profile upsert succeeded")

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

        first_ingest = _request_json(
            client,
            "POST",
            "/ingest",
            200,
            headers=ingest_headers,
            json=ingest_payload,
        )

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
        _ok("First ingest succeeded with valid chunk counts")

        time.sleep(0.2)

        second_ingest = _request_json(
            client,
            "POST",
            "/ingest",
            200,
            headers=ingest_headers,
            json=ingest_payload,
        )

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
        _ok("Re-ingest determinism checks passed")

        _ok("All checks passed. Phase 2.1 ingest exit gate is green.")


def _parse_args() -> VerifyConfig:
    parser = argparse.ArgumentParser(description="Verify ingest flow against a live local API.")
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
