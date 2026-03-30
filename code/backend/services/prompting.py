from services.retrieval import RetrievedChunk


def build_grounded_prompt(
    *,
    user_prompt: str,
    field_name: str | None,
    chunks: list[RetrievedChunk],
) -> str:
    context_lines = []
    for idx, chunk in enumerate(chunks, start=1):
        context_lines.append(
            (
                f"[{idx}] source={chunk.source}; section={chunk.section_type}; "
                f"entity={chunk.entity}; score={chunk.score:.4f}\n"
                f"{chunk.text}"
            )
        )

    field_hint = field_name.strip() if field_name else "general"
    context_block = "\n\n".join(context_lines) if context_lines else "No retrieved context."

    return (
        "You are an assistant helping a user fill job application fields. "
        "Use only the provided context. If the context is insufficient, say so briefly. "
        "Keep output concise, factual, and ready to paste into a form.\n\n"
        f"Field: {field_hint}\n"
        f"User request: {user_prompt}\n\n"
        "Retrieved context:\n"
        f"{context_block}\n\n"
        "Answer:"
    )
