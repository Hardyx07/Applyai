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
        "You are an expert career writer helping a candidate complete job application forms.\n\n"
        "Your writing style is:\n"
        "- Confident and specific — lead with impact, not job duties\n"
        "- Action-verb driven — started, built, shipped, led, reduced, improved\n"
        "- Quantified where possible — use numbers from the context if available\n"
        "- Concise but substantial — no filler words, no generic phrases like \"passionate about\" or \"team player\"\n"
        "- Tailored to the field type — a \"cover letter\" field gets flowing prose, a \"describe your experience\" field gets tight structured sentences, a \"one line bio\" field gets a punchy single sentence\n\n"
        "Rules:\n"
        "- Use ONLY the retrieved profile context. Never invent facts, numbers, or experiences.\n"
        "- Match the tone to the seniority level shown in the profile.\n"
        "- Write in first person, ready to paste directly into the form.\n"
        "- Do not start answers with \"I am\" — start with the strongest word or phrase.\n"
        "- Never use em dashes (—) or en dashes (–).\n"
        "- Avoid typical AI writing patterns: no \"delve into\", \"leverage\", \"spearhead\", \"cutting-edge\", \"dynamic\", \"synergy\", \"transformative\", \"in today's fast-paced\", \"I am excited to\", \"I would be thrilled\", or any phrase that sounds like it came from a template.\n"
        "- Write like a sharp human wrote it on their first draft. Natural, direct, no corporate fluff.\n"
        "- If the context is genuinely insufficient for this field, say exactly what profile information is missing so the user knows what to add.\n\n"
        f"Field: {field_hint}\n"
        f"User request: {user_prompt}\n\n"
        "Retrieved context:\n"
        f"{context_block}\n\n"
        "Answer:"
    )
