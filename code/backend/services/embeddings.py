import asyncio

import google.generativeai as genai


async def embed_documents(
    texts: list[str],
    api_key: str,
    model: str,
) -> list[list[float]]:
    if not texts:
        return []

    return await asyncio.to_thread(_embed_sync, texts, api_key, model)


def _embed_sync(texts: list[str], api_key: str, model: str) -> list[list[float]]:
    genai.configure(api_key=api_key)
    response = genai.embed_content(
        model=model,
        content=texts,
        task_type="retrieval_document",
    )

    values = response.get("embedding") or response.get("embeddings")
    if values is None:
        raise RuntimeError("Embedding service did not return vectors.")

    if values and isinstance(values[0], (int, float)):
        return [list(float(v) for v in values)]

    vectors: list[list[float]] = []
    for item in values:
        if isinstance(item, dict) and "values" in item:
            vectors.append([float(v) for v in item["values"]])
        else:
            vectors.append([float(v) for v in item])

    return vectors
