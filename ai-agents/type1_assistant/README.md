# Type 1: Conversational assistant

The foundation. An agent you can hold a multi-turn conversation with. No outside
data, no tools yet. Every later type still contains this core.

## Run

```bash
cd ai-agents
python3 -m type1_assistant.cli
```

Default provider is the stub (no key needed). Type a few messages, then ask
"what did I just say?" to see it remembering. `reset` clears memory, `exit`
quits.

## What it demonstrates (the roadmap's "done when")

- **Multi-turn memory** - `history` is passed back in full every turn, so the
  agent remembers earlier messages (`assistant.py`).
- **Controlled by a system prompt** - `DEFAULT_SYSTEM_PROMPT` in `cli.py` sets
  its role, tone, and boundaries.
- **Survives long chats** - `_trim()` drops the oldest turns once the estimated
  context passes `MAX_CONTEXT_TOKENS`, so it never overflows or crashes.
- **Streaming** - replies print piece by piece as they arrive.
- **Error handling** - a failed model call prints a message and keeps the loop
  alive instead of crashing.

## The one pitfall this avoids

The classic Type 1 bug is forgetting to send the whole history back each turn,
so the agent seems to have amnesia. Here `_build_messages()` always rebuilds
`[system] + history`, so context is never lost (until deliberately trimmed).

## Next

Type 2 (RAG) reuses `shared/llm.py` unchanged and adds retrieval over your own
documents before the model answers.
