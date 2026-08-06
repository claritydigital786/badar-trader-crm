"""Split documents into right-sized, overlapping chunks for retrieval.

Chunks that are too big flood the context; too small and they lose meaning. A
few hundred tokens with a little overlap is a sound starting point (the overlap
keeps a sentence that straddles a boundary findable from either side).

We approximate tokens as words here to stay dependency-free; a real system would
use the model's tokenizer.
"""
from __future__ import annotations

import re
from typing import List


def split_text(text: str, chunk_words: int = 120, overlap_words: int = 20) -> List[str]:
    words = text.split()
    if not words:
        return []
    if chunk_words <= 0:
        raise ValueError("chunk_words must be positive")
    step = max(1, chunk_words - overlap_words)
    chunks: List[str] = []
    for start in range(0, len(words), step):
        window = words[start : start + chunk_words]
        chunk = " ".join(window).strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_words >= len(words):
            break
    return chunks


def split_markdown(text: str, chunk_words: int = 120, overlap_words: int = 20) -> List[str]:
    """Prefer splitting on blank-line paragraphs first, then pack paragraphs up
    to the size budget. Falls back to word windows for any oversized paragraph.
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    buffer: List[str] = []
    buffer_words = 0
    for para in paragraphs:
        pwords = len(para.split())
        if pwords > chunk_words:
            if buffer:
                chunks.append("\n\n".join(buffer))
                buffer, buffer_words = [], 0
            chunks.extend(split_text(para, chunk_words, overlap_words))
            continue
        if buffer_words + pwords > chunk_words and buffer:
            chunks.append("\n\n".join(buffer))
            buffer, buffer_words = [], 0
        buffer.append(para)
        buffer_words += pwords
    if buffer:
        chunks.append("\n\n".join(buffer))
    return chunks
