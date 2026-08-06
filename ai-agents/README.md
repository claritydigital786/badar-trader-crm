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
(later) gets a human-approval gate before any tool that could send, spend, or
make an irreversible change.

## Build order

Each type adds one capability on top of the last:

1. **Type 1 - Conversational assistant** (system prompt + multi-turn memory). BUILT. See `type1_assistant/`.
2. **Type 2 - Knowledge / RAG agent.** Not started.
3. **Type 3 - Tool-using action agent.** Not started.
4. **Type 4 - Multi-agent system.** Not started.

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
  shared/          provider-agnostic model client + config (used by every type)
  type1_assistant/ the Type 1 conversational assistant + CLI
  tests/           plain-stdlib self-tests (no pytest needed)
```

## Test

```bash
python3 tests/test_type1.py
```
