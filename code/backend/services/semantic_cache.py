import hashlib

import redis.asyncio as redis

from core.config import get_settings

settings = get_settings()


async def get_cached_answer(*, user_id: str, cache_key: str) -> str | None:
    client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        value = await client.get(_build_redis_key(user_id=user_id, cache_key=cache_key))
        return value if value else None
    except Exception:
        return None
    finally:
        await client.aclose()


async def set_cached_answer(*, user_id: str, cache_key: str, answer: str) -> None:
    client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await client.set(
            _build_redis_key(user_id=user_id, cache_key=cache_key),
            answer,
            ex=settings.REDIS_CACHE_TTL_SECONDS,
        )
    except Exception:
        return
    finally:
        await client.aclose()


def build_cache_key(*, prompt: str, field_name: str | None) -> str:
    raw = f"{field_name or ''}|{prompt}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _build_redis_key(*, user_id: str, cache_key: str) -> str:
    return f"semantic_cache:{user_id}:{cache_key}"


async def clear_user_cache(*, user_id: str) -> None:
    client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    pattern = f"semantic_cache:{user_id}:*"
    try:
        keys: list[str] = []
        async for key in client.scan_iter(match=pattern, count=200):
            keys.append(key)

        if keys:
            await client.delete(*keys)
    except Exception:
        return
    finally:
        await client.aclose()
