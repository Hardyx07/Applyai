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
    candidate_models = [model, "models/gemini-embedding-001", "models/text-embedding-004"]
    tried: set[str] = set()
    last_error: Exception | None = None

    for model_name in candidate_models:
        if model_name in tried:
            continue
        tried.add(model_name)
        print(f"[model-debug] embeddings attempt model={model_name}", flush=True)

        try:
            response = genai.embed_content(
                model=model_name,
                content=texts,
                task_type="retrieval_document",
            )
            vectors = _extract_vectors(response)
            print(f"[model-debug] embeddings success model={model_name} vectors={len(vectors)}", flush=True)
            return vectors
        except Exception as exc:
            last_error = exc
            print(
                f"[model-debug] embeddings failed model={model_name} error={type(exc).__name__}: {exc}",
                flush=True,
            )

    if last_error is not None:
        raise RuntimeError(
            f"Embedding service failed for all candidate models: {', '.join(candidate_models)}"
        ) from last_error

    raise RuntimeError("Embedding service failed with an unknown error.")


def _extract_vectors(response: dict) -> list[list[float]]:
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
