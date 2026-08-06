"""A tiny in-memory vector store.

Holds chunks with their embeddings and source references, and finds the most
similar chunks to a query embedding by cosine similarity. In-memory and linear
scan is fine for a learning build and small document sets. For scale you would
swap this for Chroma, pgvector, Pinecone, etc. - the interface would stay the
same shape.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from shared.embeddings import cosine_similarity


@dataclass
class Record:
    text: str
    source: str
    embedding: List[float]


@dataclass
class Hit:
    text: str
    source: str
    score: float


class InMemoryVectorStore:
    def __init__(self) -> None:
        self._records: List[Record] = []

    def add(self, text: str, source: str, embedding: List[float]) -> None:
        self._records.append(Record(text=text, source=source, embedding=embedding))

    def __len__(self) -> int:
        return len(self._records)

    def search(self, query_embedding: List[float], k: int = 3) -> List[Hit]:
        scored = [
            Hit(r.text, r.source, cosine_similarity(query_embedding, r.embedding))
            for r in self._records
        ]
        scored.sort(key=lambda h: h.score, reverse=True)
        return scored[:k]
