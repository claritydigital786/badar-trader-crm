"""Plain-stdlib self-tests for the Type 2 RAG agent. No pytest needed.

Run:  python3 tests/test_type2.py     (from the ai-agents directory)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.embeddings import StubEmbedder, cosine_similarity  # noqa: E402
from shared.llm import StubClient  # noqa: E402
from type2_rag.chunking import split_markdown, split_text  # noqa: E402
from type2_rag.rag_agent import RagAgent  # noqa: E402

DOCS = [
    ("support_hours.md", "Our support desk is open Monday to Friday from 9am to 6pm. Closed on weekends."),
    ("refund_policy.md", "Customers may request a refund within 14 days of purchase. Refunds take 5 to 7 business days."),
    ("shipping.md", "Standard delivery takes 3 to 5 working days. International shipping is not available yet."),
]


def _drain(gen):
    return "".join(gen)


def test_chunking_overlaps_and_covers():
    words = " ".join("w%d" % i for i in range(300))
    chunks = split_text(words, chunk_words=120, overlap_words=20)
    assert len(chunks) >= 3, chunks
    # Overlap: the tail of chunk 0 should reappear at the head of chunk 1.
    tail = chunks[0].split()[-20:]
    head = chunks[1].split()[:20]
    assert tail == head, "chunks are not overlapping as expected"
    print("ok: chunking splits, covers, and overlaps")


def test_embedder_is_deterministic():
    e = StubEmbedder()
    v1 = e.embed("refund within 14 days")
    v2 = e.embed("refund within 14 days")
    assert v1 == v2, "stub embedder is not deterministic"
    assert abs(sum(x * x for x in v1) - 1.0) < 1e-9, "embedding is not normalised"
    print("ok: stub embedder is deterministic and normalised")


def test_similar_text_scores_higher():
    e = StubEmbedder()
    q = e.embed("when is support open")
    close = cosine_similarity(q, e.embed("the support desk is open weekdays"))
    far = cosine_similarity(q, e.embed("international shipping is not available"))
    assert close > far, "expected support text to beat shipping text (%.3f vs %.3f)" % (close, far)
    print("ok: cosine ranks the on-topic chunk higher")


def test_retrieves_correct_source():
    agent = RagAgent(StubClient(), StubEmbedder())
    agent.ingest(DOCS)
    hits = agent.retrieve("how many days do I have to ask for a refund?")
    assert hits[0].source == "refund_policy.md", hits[0].source
    print("ok: retrieval returns the right source document")


def test_says_dont_know_when_absent():
    agent = RagAgent(StubClient(), StubEmbedder())
    agent.ingest(DOCS)
    reply = _drain(agent.answer("what is the capital of France?"))
    assert "I don't know" in reply, reply
    assert agent.sources_used() == [], agent.sources_used()
    print("ok: refuses with 'I don't know' when the answer is not in the docs")


def test_grounded_answer_cites_sources():
    agent = RagAgent(StubClient(), StubEmbedder())
    agent.ingest(DOCS)
    _drain(agent.answer("when is the support desk open?"))
    assert "support_hours.md" in agent.sources_used(), agent.sources_used()
    print("ok: a grounded answer reports the source it used")


if __name__ == "__main__":
    test_chunking_overlaps_and_covers()
    test_embedder_is_deterministic()
    test_similar_text_scores_higher()
    test_retrieves_correct_source()
    test_says_dont_know_when_absent()
    test_grounded_answer_cites_sources()
    print("\nAll Type 2 self-tests passed.")
