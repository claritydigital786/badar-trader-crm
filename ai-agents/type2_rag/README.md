# Type 2: Knowledge (RAG) agent

A Type 1 assistant that answers using your own documents instead of guessing.
RAG = retrieval augmented generation: retrieve relevant text first, then generate
an answer grounded in it, with citations.

## Run

```bash
cd ai-agents
python3 -m type2_rag.cli               # uses the built-in sample_docs/
python3 -m type2_rag.cli ../docs       # or point at any folder of .md / .txt
```

Default embedder is the offline stub (no key, no cost). Ask "when is support
open?" and it retrieves from `sample_docs/`. Ask something not in the docs and
it answers "I don't know based on the documents I have."

## The pipeline (this is the whole of RAG)

1. **Chunk** each document into overlapping pieces (`chunking.py`).
2. **Embed** each chunk into a vector (`shared/embeddings.py`).
3. **Store** the vectors with a reference back to the source (`vector_store.py`).
4. On a question, **embed the question**, **retrieve** the most similar chunks.
5. If the best match is too weak, **say "I don't know"** without calling the
   model at all. Otherwise pass the chunks to the model and instruct it to
   answer only from them and cite them (`rag_agent.py`).

## What it demonstrates (the roadmap's "done when")

- **Answers from your documents and points to the source** - the CLI prints the
  source files under each answer, and retrieval is verified to rank the correct
  document first.
- **Says it does not know when the answer is absent** - guaranteed by a
  similarity threshold, not left to the model's goodwill.

## Swapping in real embeddings

The stub embedder is lexical (bag-of-words), so it matches on shared words, not
deeper meaning. For semantic retrieval, set `EMBED_PROVIDER=openai` and a key in
`.env`; `get_embedder()` switches with no other code change. Everything else -
chunking, store, agent - stays identical. For scale, swap `InMemoryVectorStore`
for Chroma or pgvector behind the same `add` / `search` shape.

## Next

Type 3 (tool-using action agent) reuses `shared/llm.py` and adds a reason-act
loop over tools, with a human-approval gate before anything risky.
