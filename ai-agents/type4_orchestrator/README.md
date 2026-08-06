# Type 4: Multi-agent system

An orchestrator that breaks a task into subtasks and delegates each one to a
specialised worker, reading each result before deciding the next step, then
combines everything into one final answer. Each worker is exactly a Type 3
action agent - this type adds no new tool-calling machinery, only a layer
that decides *who* handles a piece of work.

## Protocol

Same shape as Type 3, one level up. The orchestrator replies with exactly
one line:

```
DELEGATE: <worker_name> | <subtask for that worker>
FINAL: <combined answer>
```

A worker's result comes back as the next user turn, prefixed `RESULT:` (the
Type 3 equivalent is `OBSERVATION:`). Same `LLMClient.stream()` seam as
every other type - no protocol change per provider.

## Workers (`workers.py`)

Each worker is an `ActionAgent` (Type 3) constructed with exactly one tool:

- **math_worker** - `calculator` only.
- **docs_worker** - `doc_lookup` only.
- **ops_worker** - `send_notification` only (dangerous - needs approval).

Narrow on purpose: the roadmap's own warning for this type is fuzzy,
overlapping roles. One worker, one job, and each worker already carries its
own guardrails (approval gate, step cap) from Type 3 - nothing new to keep in
sync at this layer.

## Guardrails (`orchestrator.py`)

Two separate budgets, because a runaway orchestrator and a runaway worker are
different failure modes:

- Each **worker** still has its own `max_steps` cap (Type 3's guardrail,
  unchanged).
- The **orchestrator** has its own `max_delegations` cap (default 5), so an
  orchestrator that never says FINAL cannot hand out work forever even
  though no single worker is looping.

A dangerous tool inside a worker still pauses for human approval exactly as
it does running Type 3 standalone - the orchestrator does not see or bypass
that gate, it just receives whatever the worker eventually returns.

## Stub reasoning (`stub_planner.py`)

`StubOrchestratorClient` is a deterministic stand-in used only when
`AGENT_PROVIDER` is unset or `stub`. It recognises the same three domains
Type 3's tools cover and delegates to whichever matching worker has not yet
reported a result - so a compound task like *"what is 12 * 4, and what is
your refund policy?"* genuinely exercises two different workers in one run,
which is the actual point of Type 4 over a single Type 3 agent. A
single-domain task delegates to exactly one worker, on purpose: the roadmap
warns against reaching for multi-agent when one good Type 3 agent would do,
and the stub planner is built to demonstrate that restraint, not hide it.

## Run it

```bash
cd ai-agents
python3 -m type4_orchestrator.cli
```

Try a compound task: `what is 12 * 4, and what is your refund policy?`

## Test

```bash
python3 tests/test_type4.py
```
