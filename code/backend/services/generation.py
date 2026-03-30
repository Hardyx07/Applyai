import asyncio

import google.generativeai as genai


async def generate_answer(*, prompt: str, api_key: str, model: str) -> str:
    return await asyncio.to_thread(_generate_sync, prompt, api_key, model)


def _generate_sync(prompt: str, api_key: str, model: str) -> str:
    genai.configure(api_key=api_key)
    candidate_models = [model, "gemini-3.1-flash-lite-preview", "gemini-2.5-flash"]
    tried: set[str] = set()
    last_error: Exception | None = None

    for model_name in candidate_models:
        if model_name in tried:
            continue
        tried.add(model_name)

        try:
            client = genai.GenerativeModel(model_name)
            response = client.generate_content(prompt)
        except Exception as exc:
            last_error = exc
            continue

        text = getattr(response, "text", None)
        if isinstance(text, str) and text.strip():
            return text.strip()

        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) or []
            joined = "".join(getattr(part, "text", "") for part in parts)
            if joined.strip():
                return joined.strip()

    if last_error is not None:
        raise RuntimeError("Generation service failed for all candidate models.") from last_error

    raise RuntimeError("Generation service returned an empty response.")
