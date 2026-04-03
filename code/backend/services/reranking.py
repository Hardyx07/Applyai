import httpx

from core.config import get_settings
from services.retrieval import RetrievedChunk

settings = get_settings()


async def rerank_chunks(
    *,
    query: str,
    chunks: list[RetrievedChunk],
    cohere_api_key: str,
    top_n: int,
) -> list[RetrievedChunk]:
    if not chunks:
        return []
    if len(chunks) == 1:
        return chunks

    payload = {
        "model": settings.COHERE_RERANK_MODEL,
        "query": query,
        "documents": [chunk.text for chunk in chunks],
        "top_n": min(max(top_n, 1), len(chunks)),
    }
    print(f"[model-debug] rerank model={settings.COHERE_RERANK_MODEL}", flush=True)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.cohere.com/v2/rerank",
                headers={
                    "Authorization": f"Bearer {cohere_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
    except Exception:
        return chunks

    results = data.get("results") or []
    if not results:
        return chunks

    reranked: list[RetrievedChunk] = []
    for item in results:
        index = int(item.get("index", -1))
        if index < 0 or index >= len(chunks):
            continue
        base = chunks[index]
        reranked.append(
            RetrievedChunk(
                chunk_id=base.chunk_id,
                parent_chunk_id=base.parent_chunk_id,
                section_type=base.section_type,
                entity=base.entity,
                source=base.source,
                text=base.text,
                score=float(item.get("relevance_score") or base.score),
            )
        )

    return reranked or chunks
