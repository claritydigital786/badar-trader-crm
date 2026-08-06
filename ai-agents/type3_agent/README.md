# Type 3: Tool-using action agent

A think -> act -> observe (ReAct) loop. The model gets a small set of tools,
decides whether to call one or answer directly, and keeps going until it says
FINAL or hits a step cap. This is the first type in the roadmap that takes
real actions instead of only talking, so it is also the first type where
guardrails matter.

## Protocol

No structured function-calling API is used. The model is asked, in plain
text, to reply with exactly one line in one of two shapes:

```
TOOL: <tool_name> | <input text>
FINAL: <your answer>
```

A tool's result comes back to the model as the next user turn, prefixed
`OBSERVATION:`. This keeps the same `LLMClient.stream()` interface Type 1 and
Type 2 already use (see `../shared/llm.py`) - Type 3 needed no change to that
seam, and the same protocol works whether the provider is the stub, Claude,
or OpenAI.

## Tools (`tools.py`)

- **calculator** - plain arithmetic, evaluated with an AST whitelist (numbers
  and `+ - * / // % **` only), not `eval()` - it cannot run arbitrary code.
- **doc_lookup** - reuses Type 2's chunker, stub embedder, and vector store
  to retrieve from `../type2_rag/sample_docs/`, but stops after retrieval
  instead of calling a model to synthesise an answer. Composition of one
  agent type inside another.
- **send_notification** - marked `dangerous=True`. It does not send anything
  real anywhere; it appends one line to a local `outbox.log` file, standing
  in for "a message went out" so the approval gate has something concrete to
  guard. This repo's rules do not allow a learning agent anywhere near
  WhatsApp, email, or any other live send path, so there is no real send here
  to gate - only a believable stand-in for one.

## The guardrail (`agent.py`)

Any tool marked `dangerous` pauses the loop and calls
`approve(tool_name, tool_input)` before it runs. The CLI's default approval
is a real `input()` prompt. A denial is fed back to the model as an
observation rather than crashing the loop, so the agent can recover and still
finish the task instead of just failing.

Also built in: a **step cap** (`max_steps`, default 6) so an agent that never
says FINAL cannot loop forever, and a **trace** (`agent.trace`) recording
every step - the tool called, its input, whether it needed and got approval,
and the observation - so a run can always be read back after the fact.

## Stub reasoning (`stub_planner.py`)

The default `StubClient` from Type 1/2 just echoes text - it cannot decide
which tool to call. `StubReactClient` is a deterministic, keyword-based
stand-in used only when `AGENT_PROVIDER` is unset or `stub`, so the whole
loop - tool execution, the approval gate, the step cap - can be proven end to
end offline with no API key. The moment a real key is in `.env` and
`AGENT_PROVIDER=claude` (or `openai`), the real model reasons for real
through the exact same TOOL/FINAL protocol; nothing else changes.

## Run it

```bash
cd ai-agents
python3 -m type3_agent.cli
```

Try: `what is 12 * 4?`, `what is your refund policy?`, and
`please notify the team that stock arrived` (this one will prompt for
approval).

## Test

```bash
python3 tests/test_type3.py
```
