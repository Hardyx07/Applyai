import asyncio
import sqlite3
import uuid
from pathlib import Path

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qmodels

from core.config import get_settings
from services.chunking import PreparedChunk

settings = get_settings()


async def replace_user_vectors(
    user_id: str,
    chunks: list[PreparedChunk],
    embeddings: list[list[float]],
) -> None:
    if not chunks:
        return
    if len(chunks) != len(embeddings):
        raise RuntimeError("Chunk and embedding counts do not match.")

    client = AsyncQdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    try:
        await _ensure_collection(client, len(embeddings[0]))
        await _delete_user_points(client, user_id)

        points = [
            qmodels.PointStruct(
                id=_to_qdrant_uuid(chunk.chunk_id),
                vector=embedding,
                payload={
                    "user_id": user_id,
                    "parent_chunk_id": chunk.parent_chunk_id,
                    "section_type": chunk.section_type,
                    "entity": chunk.entity,
                    "source": chunk.source,
                    "text": chunk.text,
                },
            )
            for chunk, embedding in zip(chunks, embeddings, strict=True)
        ]

        await client.upsert(collection_name=settings.QDRANT_COLLECTION, points=points)
    finally:
        await client.close()


async def replace_user_bm25_index(user_id: str, chunks: list[PreparedChunk]) -> None:
    await asyncio.to_thread(_replace_user_bm25_index_sync, user_id, chunks)


def _replace_user_bm25_index_sync(user_id: str, chunks: list[PreparedChunk]) -> None:
    db_path = Path(settings.BM25_INDEX_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS bm25_chunks USING fts5(
                user_id UNINDEXED,
                chunk_id UNINDEXED,
                parent_chunk_id UNINDEXED,
                section_type UNINDEXED,
                entity UNINDEXED,
                source UNINDEXED,
                text
            )
            """
        )
        conn.execute("DELETE FROM bm25_chunks WHERE user_id = ?", (user_id,))

        conn.executemany(
            """
            INSERT INTO bm25_chunks(
                user_id,
                chunk_id,
                parent_chunk_id,
                section_type,
                entity,
                source,
                text
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    user_id,
                    chunk.chunk_id,
                    chunk.parent_chunk_id,
                    chunk.section_type,
                    chunk.entity,
                    chunk.source,
                    chunk.text,
                )
                for chunk in chunks
            ],
        )
        conn.commit()


async def _ensure_collection(client: AsyncQdrantClient, vector_size: int) -> None:
    try:
        await client.get_collection(settings.QDRANT_COLLECTION)
    except Exception:
        await client.create_collection(
            collection_name=settings.QDRANT_COLLECTION,
            vectors_config=qmodels.VectorParams(
                size=vector_size,
                distance=qmodels.Distance.COSINE,
            ),
        )


async def _delete_user_points(client: AsyncQdrantClient, user_id: str) -> None:
    await client.delete(
        collection_name=settings.QDRANT_COLLECTION,
        points_selector=qmodels.FilterSelector(
            filter=qmodels.Filter(
                must=[
                    qmodels.FieldCondition(
                        key="user_id",
                        match=qmodels.MatchValue(value=user_id),
                    )
                ]
            )
        ),
    )


def _to_qdrant_uuid(value: str) -> str:
    compact = "".join(ch for ch in value.lower() if ch in "0123456789abcdef")
    if len(compact) < 32:
        compact = compact.ljust(32, "0")
    return str(uuid.UUID(compact[:32]))
