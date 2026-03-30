import asyncio
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import google.generativeai as genai
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels

from core.config import get_settings

settings = get_settings()


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: str
    parent_chunk_id: str
    section_type: str
    entity: str
    source: str
    text: str
    score: float


async def retrieve_hybrid(
    *,
    user_id: str,
    query: str,
    gemini_api_key: str,
    top_k: int,
) -> list[RetrievedChunk]:
    bm25_k = max(top_k, 6)
    vector_k = max(top_k, 6)

    bm25_task = _query_bm25(user_id=user_id, query=query, top_k=bm25_k)
    vector_task = _query_vectors(
        user_id=user_id,
        query=query,
        gemini_api_key=gemini_api_key,
        top_k=vector_k,
    )
    bm25_hits, vector_hits = await asyncio.gather(bm25_task, vector_task)

    fused = _rrf_merge(bm25_hits, vector_hits)
    return fused[:top_k]


async def _query_bm25(user_id: str, query: str, top_k: int) -> list[RetrievedChunk]:
    return await asyncio.to_thread(_query_bm25_sync, user_id, query, top_k)


def _query_bm25_sync(user_id: str, query: str, top_k: int) -> list[RetrievedChunk]:
    db_path = Path(settings.BM25_INDEX_PATH)
    if not db_path.exists():
        return []

    fts_query = _to_fts_query(query)
    if not fts_query:
        return []

    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT
                chunk_id,
                parent_chunk_id,
                section_type,
                entity,
                source,
                text,
                bm25(bm25_chunks) AS bm25_score
            FROM bm25_chunks
            WHERE user_id = ?
              AND bm25_chunks MATCH ?
            ORDER BY bm25_score ASC
            LIMIT ?
            """,
            (user_id, fts_query, top_k),
        ).fetchall()

    return [
        RetrievedChunk(
            chunk_id=row[0],
            parent_chunk_id=row[1],
            section_type=row[2],
            entity=row[3],
            source=row[4],
            text=row[5],
            score=float(-(row[6] or 0.0)),
        )
        for row in rows
    ]


async def _query_vectors(
    *,
    user_id: str,
    query: str,
    gemini_api_key: str,
    top_k: int,
) -> list[RetrievedChunk]:
    query_vector = await _embed_query(query=query, api_key=gemini_api_key)

    client = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    try:
        hits = await client.search(
            collection_name=settings.QDRANT_COLLECTION,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qmodels.Filter(
                must=[
                    qmodels.FieldCondition(
                        key="user_id",
                        match=qmodels.MatchValue(value=user_id),
                    )
                ]
            ),
            with_payload=True,
        )
    except Exception:
        return []
    finally:
        await client.close()

    results: list[RetrievedChunk] = []
    for hit in hits:
        payload = hit.payload or {}
        raw_id = getattr(hit, "id", None)
        results.append(
            RetrievedChunk(
                chunk_id=str(raw_id) if raw_id is not None else "",
                parent_chunk_id=str(payload.get("parent_chunk_id") or ""),
                section_type=str(payload.get("section_type") or "unknown"),
                entity=str(payload.get("entity") or "Unknown"),
                source=str(payload.get("source") or "Resume"),
                text=str(payload.get("text") or ""),
                score=float(getattr(hit, "score", 0.0) or 0.0),
            )
        )

    return [r for r in results if r.text]


async def _embed_query(*, query: str, api_key: str) -> list[float]:
    return await asyncio.to_thread(_embed_query_sync, query, api_key)


def _embed_query_sync(query: str, api_key: str) -> list[float]:
    genai.configure(api_key=api_key)
    response = genai.embed_content(
        model=settings.GEMINI_EMBEDDING_MODEL,
        content=[query],
        task_type="retrieval_query",
    )
    values = response.get("embedding") or response.get("embeddings")
    if values is None:
        raise RuntimeError("Query embedding service did not return vectors.")

    if values and isinstance(values[0], (int, float)):
        return [float(v) for v in values]

    first = values[0]
    if isinstance(first, dict) and "values" in first:
        return [float(v) for v in first["values"]]

    return [float(v) for v in first]


def _to_fts_query(query: str) -> str:
    tokens = ["".join(ch for ch in token if ch.isalnum()) for token in query.split()]
    clean = [token for token in tokens if token]
    return " OR ".join(clean)


def _rrf_merge(
    bm25_hits: list[RetrievedChunk],
    vector_hits: list[RetrievedChunk],
    *,
    rank_constant: int = 60,
) -> list[RetrievedChunk]:
    merged: dict[str, RetrievedChunk] = {}
    scores: dict[str, float] = {}

    for rank, hit in enumerate(bm25_hits, start=1):
        key = hit.chunk_id or f"bm25:{rank}:{hit.text[:32]}"
        merged.setdefault(key, hit)
        scores[key] = scores.get(key, 0.0) + (1.0 / (rank_constant + rank))

    for rank, hit in enumerate(vector_hits, start=1):
        key = hit.chunk_id or f"vector:{rank}:{hit.text[:32]}"
        merged.setdefault(key, hit)
        scores[key] = scores.get(key, 0.0) + (1.0 / (rank_constant + rank))

    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)

    output: list[RetrievedChunk] = []
    for key, fused_score in ordered:
        base = merged[key]
        output.append(
            RetrievedChunk(
                chunk_id=base.chunk_id,
                parent_chunk_id=base.parent_chunk_id,
                section_type=base.section_type,
                entity=base.entity,
                source=base.source,
                text=base.text,
                score=float(fused_score),
            )
        )

    return output
