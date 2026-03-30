import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from api.deps import BYOKKeys, get_current_user, require_byok_keys
from core.config import get_settings
from schemas.generate import GenerateTrace, RetrievedContext
from services.generation import generate_answer
from services.prompting import build_grounded_prompt
from services.reranking import rerank_chunks
from services.retrieval import retrieve_hybrid
from services.semantic_cache import build_cache_key, get_cached_answer, set_cached_answer

router = APIRouter(prefix="/generate", tags=["generate"])
settings = get_settings()


@router.post("/stream")
async def generate_stream(
    prompt: str = Query(min_length=3, max_length=2000),
    field_name: str | None = Query(default=None, max_length=128),
    top_k: int = Query(default=settings.GENERATE_TOP_K, ge=1, le=20),
    user_id: str = Depends(get_current_user),
    keys: BYOKKeys = Depends(require_byok_keys),
):
    cache_key = build_cache_key(prompt=prompt, field_name=field_name)
    cached_answer = await get_cached_answer(user_id=user_id, cache_key=cache_key)

    if cached_answer:
        events = _stream_sse(
            answer=cached_answer,
            trace=GenerateTrace(
                prompt=prompt,
                field_name=field_name,
                used_cache=True,
                context_count=0,
                context=[],
            ),
        )
        return StreamingResponse(events, media_type="text/event-stream", headers=_sse_headers())

    try:
        retrieved = await retrieve_hybrid(
            user_id=user_id,
            query=prompt,
            gemini_api_key=keys.gemini,
            top_k=top_k,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to retrieve grounding context.") from exc

    if not retrieved:
        raise HTTPException(status_code=404, detail="No indexed profile data found. Run /ingest first.")

    reranked = await rerank_chunks(
        query=prompt,
        chunks=retrieved,
        cohere_api_key=keys.cohere,
        top_n=min(settings.GENERATE_RERANK_TOP_K, len(retrieved)),
    )

    effective_context = reranked if reranked else retrieved
    grounded_prompt = build_grounded_prompt(
        user_prompt=prompt,
        field_name=field_name,
        chunks=effective_context,
    )

    try:
        answer = await generate_answer(
            prompt=grounded_prompt,
            api_key=keys.gemini,
            model=settings.GEMINI_GENERATION_MODEL,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to generate response.") from exc

    await set_cached_answer(user_id=user_id, cache_key=cache_key, answer=answer)

    trace = GenerateTrace(
        prompt=prompt,
        field_name=field_name,
        used_cache=False,
        context_count=len(effective_context),
        context=[
            RetrievedContext(
                chunk_id=item.chunk_id,
                section_type=item.section_type,
                entity=item.entity,
                source=item.source,
                score=item.score,
            )
            for item in effective_context
        ],
    )
    return StreamingResponse(_stream_sse(answer=answer, trace=trace), media_type="text/event-stream", headers=_sse_headers())


def _sse_headers() -> dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }


async def _stream_sse(*, answer: str, trace: GenerateTrace):
    yield _sse("meta", trace.model_dump())

    for token in answer.split():
        yield _sse("token", token + " ")
        await asyncio.sleep(0)

    yield _sse("done", {"ok": True})


def _sse(event: str, payload: object) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=True)}\n\n"
