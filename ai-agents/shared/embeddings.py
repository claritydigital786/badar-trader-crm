"""Provider-agnostic text embeddings for the RAG agent (Type 2).

Same idea as shared/llm.py: one tiny interface, swappable providers. The default
StubEmbedder is a deterministic local bag-of-words vector, so retrieval works
offline with no key and no cost. Swap to real embeddings with EMBED_PROVIDER.
"""
from __future__ import annotations

import hashlib
import math
import re
from typing import List

# Common function words carry no topical meaning and only add noise to a
# lexical embedder, so we drop them before hashing. A real dense embedder would
# not need this, but for the stub it sharpens retrieval and the "I do not know"
# threshold considerably.
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does",
    "for", "from", "had", "has", "have", "how", "i", "in", "is", "it", "its",
    "of", "on", "or", "our", "that", "the", "to", "was", "we", "what", "when",
    "where", "which", "who", "why", "will", "with", "you", "your",
}


def _tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in _STOPWORDS]


def cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


class Embedder:
    name = "base"
    dim = 0

    def embed(self, text: str) -> List[float]:
        raise NotImplementedError

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [self.embed(t) for t in texts]


class StubEmbedder(Embedder):
    """Deterministic local embedder: hash each content word into a fixed-size
    vector and count occurrences, then L2-normalise. Cosine similarity then
    reflects shared vocabulary. Not semantic, but real, free, and repeatable -
    enough to prove the whole RAG pipeline before real embeddings go in.
    """

    name = "stub"
    dim = 512

    def embed(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        for token in _tokenize(text):
            # md5 (not Python's hash()) so the vector is identical across runs.
            idx = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % self.dim
            vec[idx] += 1.0
        norm = math.sqrt(sum(v * v for v in vec))
        if norm:
            vec = [v / norm for v in vec]
        return vec


class OpenAIEmbedder(Embedder):
    """Real embeddings via OpenAI. Imported lazily so stub mode needs nothing."""

    name = "openai"

    def __init__(self, model: str, api_key: str):
        import openai  # lazy import

        self._client = openai.OpenAI(api_key=api_key)
        self._model = model

    def embed(self, text: str) -> List[float]:
        return self.embed_batch([text])[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        resp = self._client.embeddings.create(model=self._model, input=texts)
        return [item.embedding for item in resp.data]


def get_embedder(settings) -> Embedder:
    if settings.embed_provider == "openai":
        if not settings.openai_api_key:
            import sys

            print(
                "[warn] EMBED_PROVIDER=openai but OPENAI_API_KEY is empty. "
                "Using the stub embedder instead.",
                file=sys.stderr,
            )
            return StubEmbedder()
        return OpenAIEmbedder(settings.openai_embed_model, settings.openai_api_key)
    return StubEmbedder()
