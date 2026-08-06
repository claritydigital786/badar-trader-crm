"""Type 2: the Knowledge (RAG) agent.

Retrieval augmented generation. On a question it retrieves the most relevant
chunks from its own documents first, then asks the model to answer using only
those chunks and to cite them. If nothing relevant is found it says so instead
of guessing - the whole point of RAG.
"""
from __future__ import annotations

from typing import Iterator, List, Optional, Tuple

from shared.embeddings import Embedder
from shared.llm import LLMClient, Message
from type2_rag.chunking import split_markdown
from type2_rag.vector_store import Hit, InMemoryVectorStore

SYSTEM_PROMPT = (
    "You are a knowledge assistant. Answer the user's question using ONLY the "
    "numbered sources provided. Cite the sources you use like [1] or [2]. If the "
    "answer is not contained in the sources, reply exactly: \"I don't know based "
    "on the documents I have.\" Do not use outside knowledge and do not guess."
)


class RagAgent:
    def __init__(
        self,
        client: LLMClient,
        embedder: Embedder,
        store: Optional[InMemoryVectorStore] = None,
        k: int = 3,
        min_similarity: float = 0.10,
    ):
        self.client = client
        self.embedder = embedder
        self.store = store if store is not None else InMemoryVectorStore()
        self.k = k
        self.min_similarity = min_similarity

    def ingest(self, documents: List[Tuple[str, str]]) -> int:
        """documents: list of (source_name, text). Returns chunks stored."""
        added = 0
        for source, text in documents:
            chunks = split_markdown(text)
            if not chunks:
                continue
            embeddings = self.embedder.embed_batch(chunks)
            for chunk, emb in zip(chunks, embeddings):
                self.store.add(chunk, source, emb)
                added += 1
        return added

    def retrieve(self, question: str) -> List[Hit]:
        if len(self.store) == 0:
            return []
        return self.store.search(self.embedder.embed(question), self.k)

    def _has_relevant(self, hits: List[Hit]) -> bool:
        return bool(hits) and hits[0].score >= self.min_similarity

    def _build_messages(self, question: str, hits: List[Hit]) -> List[Message]:
        blocks = []
        for i, hit in enumerate(hits, start=1):
            blocks.append(f"[{i}] (source: {hit.source})\n{hit.text}")
        context = "\n\n".join(blocks)
        user = f"Sources:\n{context}\n\nQuestion: {question}"
        return [Message("system", SYSTEM_PROMPT), Message("user", user)]

    def answer(self, question: str) -> Iterator[str]:
        """Stream a grounded answer. Yields the refusal itself (without calling
        the model) when nothing relevant is retrieved, so 'I don't know' is a
        hard guarantee, not something we hope the model chooses to say.
        """
        hits = self.retrieve(question)
        self.last_hits = hits  # exposed so a caller can show sources
        if not self._has_relevant(hits):
            yield "I don't know based on the documents I have."
            return
        for piece in self.client.stream(self._build_messages(question, hits)):
            yield piece

    def sources_used(self) -> List[str]:
        hits = getattr(self, "last_hits", [])
        if not self._has_relevant(hits):
            return []
        # De-duplicate while preserving order.
        seen, ordered = set(), []
        for h in hits:
            if h.source not in seen:
                seen.add(h.source)
                ordered.append(h.source)
        return ordered
