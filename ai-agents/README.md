# AI Agents (learning build)

A sandboxed, from-scratch build of the four types of AI agents described in
`../docs/ai-agent-roadmap.md`. Resume this track from any rotating Claude
account by saying **"continue 2"**. Live state lives in `../HANDOFF.md` under
the "continue 2" block.

## Safety (read this first)

This is a learning and build exercise and stays **fully sandboxed**. It does
NOT touch the live CRM, the live WhatsApp number, Meta Ads, WhatChimp, or any
real customer or lead data. Nothing here is imported by `index.html` or by any
Supabase function. It runs only from your own terminal. The Type 3 action agent
gets a human-approval gate before any tool that could send, spend, or make an
irreversible change - its one "dangerous" tool (`send_notification`) is itself
fake, appending to a local log file rather than reaching any real system, so
even an approved call touches nothing outside this sandbox.

## Build order

Each type adds one capability on top of the last:

1. **Type 1 - Conversational assistant** (system prompt + multi-turn memory). BUILT. See `type1_assistant/`.
2. **Type 2 - Knowledge / RAG agent** (retrieval over your own docs, with citations). BUILT. See `type2_rag/`.
3. **Type 3 - Tool-using action agent** (reason-act loop, tools, a human-approval gate before anything risky, a step cap). BUILT. See `type3_agent/`.
4. **Type 4 - Multi-agent system** (an orchestrator delegating to specialised Type 3 workers, its own delegation cap on top of each worker's step cap). BUILT. See `type4_orchestrator/`.

All four types from the roadmap are now built. See "What's next" below for where this could go from here.

## Setup

No install needed to try it: the default provider is a built-in **stub** model
that fakes replies so you can see the whole loop work offline.

```bash
cd ai-agents
python3 -m type1_assistant.cli
```

To use a real model, copy the example env and drop in your own key, then set
the provider:

```bash
cp .env.example .env
# edit .env: set AGENT_PROVIDER=claude (or openai) and paste your key
pip install -r requirements.txt   # only needed for real providers, not the stub
python3 -m type1_assistant.cli
```

Keys are read from environment variables only, never committed. `.env` is
gitignored. Claude never types a key for you; you paste your own into `.env`.

## Layout

```
ai-agents/
  shared/              provider-agnostic model client, embeddings, config (used by every type)
  type1_assistant/     the Type 1 conversational assistant + CLI
  type2_rag/           the Type 2 RAG agent, sample docs + CLI
  type3_agent/         the Type 3 tool-using action agent, tools, guardrails + CLI
  type4_orchestrator/  the Type 4 multi-agent orchestrator, workers (each a Type 3 agent) + CLI
  tests/               plain-stdlib self-tests (no pytest needed)
```

## Test

```bash
python3 tests/test_type1.py
python3 tests/test_type2.py
python3 tests/test_type3.py
python3 tests/test_type4.py
```

## What's next

The roadmap itself is now fully built, in stub mode, offline, with no API key.
Two separate things stand between this and something genuinely useful day to
day, and they are worth keeping apart:

1. **Real reasoning.** Nothing here has ever run against a real model - only
   the deterministic stub. Set `AGENT_PROVIDER=claude` or `openai` with a key
   in `.env` and every type reasons for real through the exact same
   protocols; no code changes needed.
2. **Real tools.** The tools today are deliberately toy and sandboxed - a
   calculator, retrieval over three sample docs, and a fake notification log.
   Connecting a worker to something real (this CRM's own data, a real send
   path, and so on) is a scope decision, not a code change, and per this
   track's hard safety rule it needs an explicit decision before any tool
   here gets anywhere near live CRM, WhatsApp, Meta, or WhatChimp data.
