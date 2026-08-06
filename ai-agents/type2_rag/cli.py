"""Command-line chat for the Type 2 RAG agent.

Ingests a folder of documents, then answers questions grounded in them.

Run from the ai-agents directory:
    python3 -m type2_rag.cli                 # uses the built-in sample_docs
    python3 -m type2_rag.cli ../docs         # point at any folder of .md/.txt
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.config import load_settings  # noqa: E402
from shared.embeddings import get_embedder  # noqa: E402
from shared.llm import get_client  # noqa: E402
from type2_rag.rag_agent import RagAgent  # noqa: E402

DOC_EXTENSIONS = (".md", ".txt")


def load_documents(folder: str):
    docs = []
    for root, _dirs, files in os.walk(folder):
        for name in sorted(files):
            if name.lower().endswith(DOC_EXTENSIONS):
                path = os.path.join(root, name)
                with open(path, "r", encoding="utf-8") as handle:
                    docs.append((os.path.relpath(path, folder), handle.read()))
    return docs


def main() -> None:
    settings = load_settings()
    here = os.path.dirname(os.path.abspath(__file__))
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "sample_docs")

    docs = load_documents(folder)
    if not docs:
        print(f"No .md or .txt documents found in {folder}")
        return

    agent = RagAgent(get_client(settings), get_embedder(settings))
    chunks = agent.ingest(docs)
    print(
        f"RAG agent ready. Model: {agent.client.name}, embedder: "
        f"{agent.embedder.name}. Ingested {len(docs)} document(s) into "
        f"{chunks} chunk(s) from {folder}."
    )
    print("Ask a question, 'exit' to quit.\n")

    while True:
        try:
            question = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nbye")
            break
        if not question:
            continue
        if question.lower() in ("exit", "quit"):
            print("bye")
            break
        print("bot > ", end="", flush=True)
        try:
            for piece in agent.answer(question):
                sys.stdout.write(piece)
                sys.stdout.flush()
            sources = agent.sources_used()
            if sources:
                print("\n      sources: " + ", ".join(sources))
            print()
        except Exception as exc:
            print(f"\n[error: {exc}]\n")


if __name__ == "__main__":
    main()
