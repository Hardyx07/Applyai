import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class PreparedChunk:
    chunk_id: str
    parent_chunk_id: str
    source: str
    section_type: str
    entity: str
    header: str
    text: str


@dataclass(slots=True)
class ChunkingResult:
    parent_count: int
    chunks: list[PreparedChunk]


def build_profile_chunks(
    profile_data: dict[str, Any],
    user_id: str,
    source: str,
    sections: list[str] | None,
) -> ChunkingResult:
    if not profile_data:
        return ChunkingResult(parent_count=0, chunks=[])

    selected = {s.strip().lower() for s in sections} if sections else None
    chunks: list[PreparedChunk] = []
    parent_count = 0

    for section, value in profile_data.items():
        section_key = str(section).strip()
        if not section_key:
            continue

        if selected and section_key.lower() not in selected:
            continue

        parents = _extract_parent_blocks(value)
        for idx, parent in enumerate(parents):
            parent_text = _stringify(parent)
            if not parent_text:
                continue

            parent_count += 1
            parent_chunk_id = _stable_hash(
                f"{user_id}|{section_key}|parent|{idx}|{parent_text}",
                length=32,
            )
            entity = _entity_from_parent(parent)
            header = f"[Source: {source} | Type: {section_key.title()} | Entity: {entity}]"

            for child_idx, child in enumerate(_extract_child_texts(parent, parent_text)):
                chunk_id = _stable_hash(
                    f"{parent_chunk_id}|child|{child_idx}|{child}",
                    length=40,
                )
                chunks.append(
                    PreparedChunk(
                        chunk_id=chunk_id,
                        parent_chunk_id=parent_chunk_id,
                        source=source,
                        section_type=section_key,
                        entity=entity,
                        header=header,
                        text=f"{header}\n{child}",
                    )
                )

    return ChunkingResult(parent_count=parent_count, chunks=chunks)


def _extract_parent_blocks(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    if isinstance(value, str):
        return [value]
    return []


def _extract_child_texts(parent: Any, fallback: str) -> list[str]:
    chunks: list[str] = []

    if isinstance(parent, dict):
        for key, value in parent.items():
            key_lower = str(key).lower()

            if isinstance(value, list):
                for item in value:
                    item_text = _stringify(item)
                    if item_text:
                        chunks.append(item_text)
                continue

            if isinstance(value, str):
                if key_lower in {"description", "summary", "details", "overview"}:
                    chunks.extend(_split_sentences(value))
                else:
                    if value.strip():
                        chunks.append(value.strip())
                continue

            value_text = _stringify(value)
            if value_text:
                chunks.append(value_text)

    elif isinstance(parent, list):
        for item in parent:
            item_text = _stringify(item)
            if item_text:
                chunks.append(item_text)

    elif isinstance(parent, str) and parent.strip():
        chunks.extend(_split_sentences(parent))

    if not chunks:
        chunks = [fallback]

    seen: set[str] = set()
    deduped: list[str] = []
    for chunk in chunks:
        clean = chunk.strip()
        if clean and clean not in seen:
            seen.add(clean)
            deduped.append(clean)

    return deduped


def _entity_from_parent(parent: Any) -> str:
    if isinstance(parent, dict):
        for key in ("company", "organization", "org", "project", "name", "title", "school"):
            value = parent.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return "Unknown"


def _split_sentences(text: str) -> list[str]:
    pieces = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in pieces if p.strip()]


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        parts = []
        for key, sub in value.items():
            sub_text = _stringify(sub)
            if sub_text:
                parts.append(f"{key}: {sub_text}")
        return " | ".join(parts)
    if isinstance(value, list):
        parts = [_stringify(item) for item in value]
        return " | ".join([p for p in parts if p])
    try:
        return json.dumps(value, ensure_ascii=True)
    except TypeError:
        return ""


def _stable_hash(value: str, length: int) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return digest[:length]
