# AI Agent Roadmap

_Portable copy of `AI-Agent-Roadmap.docx` (handed over by Muhammad, August 2026), committed here so the "continue 2" track travels across laptops and Claude accounts. The original .docx only lives in Muhammad's `~/Downloads`. See the "continue 2" block in `HANDOFF.md` for the live progress checklist and open decisions._

## How to use this roadmap

Each agent adds one new capability on top of the one before it. You do not jump straight to the hardest version. Build the simplest agent first, get it working end to end, then layer on memory, tools, and finally coordination between multiple agents. By the time you reach the fourth type, you are reusing almost everything you already built.

The four types, in build order:

- **Type 1 - Conversational assistant.** A chatbot that understands and responds. Your foundation.
- **Type 2 - Knowledge (RAG) agent.** Answers grounded in your own documents and data.
- **Type 3 - Tool-using action agent.** Reasons, calls tools and APIs, and takes real actions.
- **Type 4 - Multi-agent system.** Several specialised agents coordinated to handle complex jobs.

**The one rule that saves you weeks:** ship each type as a working thing before moving on. A rough Type 1 you can actually talk to teaches you more than a perfect Type 4 that only exists on paper.

## Phase 0: Foundations (before any agent)

Concepts to be comfortable with:

- Large language models (LLMs) and what a prompt, a token, and a context window actually are.
- System vs. user vs. assistant messages and how they shape behaviour.
- Temperature and other settings that control creativity versus consistency.
- The agent loop: perceive, reason, act, observe, repeat. This is the heartbeat of every type below.

Set up your workspace:

- Pick a language. Python is the default for AI work and has the widest library support. JavaScript/TypeScript is fine if that is your world.
- Get API access to a model provider (for example Anthropic Claude, OpenAI, or an open model via a host). Store keys in environment variables, never in code.
- Set up a project with version control (Git) and a way to manage secrets.
- Install one framework so you are not wiring everything by hand.

**No-code path:** you can build Types 1 to 3 on visual platforms (n8n, Flowise, Voiceflow, Zapier Agents, Lovable, or similar). You hit limits sooner, but it is a fast way to learn the shapes before committing to code.

## Type 1: Conversational assistant

**What it is.** An agent you can hold a conversation with. It takes a message, keeps track of the conversation so far, and replies sensibly. No outside data, no tools yet. The smallest thing that feels like an agent.

**Why start here.** It forces you to learn prompting, message history, and how to shape a model's personality and guardrails. Every later type still contains this core.

Build steps:

- Send a single prompt to the model and print the reply. Confirm the whole loop works.
- Add a system prompt that defines the assistant's role, tone, and boundaries.
- Keep a running message history so the agent remembers earlier turns.
- Handle the context window: trim or summarise old messages when the conversation gets long.
- Add basic streaming so replies appear as they are generated, plus simple error handling for failed calls.
- Wrap it in a minimal interface: a command line loop first, then a simple web chat if you want.

Done with Type 1 when:

- You can have a multi-turn conversation and the agent remembers context.
- Its behaviour is controlled by a system prompt you wrote, and it stays in character.
- It handles long chats without crashing or losing the thread.

Common pitfalls: forgetting to pass the full message history back on each turn (the agent seems to have amnesia); vague system prompts (be specific about role, tone, what to do, and what to refuse).

## Type 2: Knowledge (RAG) agent

**What it is.** A Type 1 assistant that can answer using your own documents, notes, product data, or policies. RAG stands for retrieval augmented generation: the agent retrieves relevant text first, then generates an answer grounded in it.

**Why it matters.** The single most useful upgrade for real work, and it cuts down on made-up answers dramatically.

New concepts: embeddings (turning text into vectors so the system can find passages by meaning); vector database (Chroma, Pinecone, Weaviate, or pgvector); chunking (splitting documents into right-sized pieces).

Build steps:

- Gather your source material (PDFs, docs, web pages, a knowledge base).
- Split each document into chunks, then convert each chunk into an embedding.
- Store the embeddings in a vector database with references back to the source.
- On a question, embed the question, retrieve the most similar chunks, and pass them to the model as context.
- Instruct the agent to answer only from the retrieved text and to cite which source it used.
- Tune chunk size, how many chunks you retrieve, and the prompt until answers are accurate.

Done with Type 2 when:

- The agent answers questions correctly from your documents and points to the source.
- It says it does not know when the answer is not in the material, instead of inventing one.

Common pitfalls: chunks too big or too small (start around a few hundred tokens); retrieving too many chunks and flooding the context; not evaluating (keep a small set of test questions and check answers as you tune).

## Type 3: Tool-using action agent

**What it is.** An agent that does more than talk. It decides when to call external tools (search, a calculator, a database, an email or calendar API, your own functions), runs them, reads the result, and continues reasoning until the task is done. The classic reason-and-act (ReAct) pattern.

**Why it matters.** The leap from answering questions to getting things done. It is also where safety and reliability start to matter, because the agent is now taking real actions.

New concepts: tool/function calling (giving the model a set of tools with clear descriptions); the reasoning loop (think, pick a tool, act, observe, decide next step, stop when finished); guardrails (limits on what the agent can do, plus human approval for anything risky or irreversible).

Build steps:

- Define two or three simple tools first (for example a web search and a calculator). Write clear names and descriptions.
- Let the model call a tool, feed the result back, and let it continue. Get one clean tool call working before adding more.
- Build the loop: keep going through think-act-observe until the task is complete or a step limit is reached.
- Add real tools that matter for your use case, such as reading a database, calling an API, or sending a message.
- Add guardrails: a maximum number of steps, allowed actions only, and a human confirmation step before anything destructive.
- Add logging so you can see the agent's reasoning and every tool call it made.
- Consider the Model Context Protocol (MCP) to connect tools in a standard way as your toolset grows.

Done with Type 3 when:

- The agent completes a multi-step task by choosing and using tools on its own.
- It stops sensibly, respects its limits, and asks for approval on risky actions.
- You can trace exactly what it did and why from the logs.

Common pitfalls: too many tools at once; no stop condition so the agent loops forever (always cap the steps); letting it take irreversible actions without a human check.

## Type 4: Multi-agent system

**What it is.** Several specialised agents that work together. A common shape is an orchestrator (or manager) that breaks a job into parts and hands each part to a worker agent, then combines the results. Each worker is essentially a focused Type 3 agent.

**Why it matters.** Complex jobs get more reliable when each agent has one clear responsibility.

New concepts: orchestration (one agent plans and delegates, others execute); roles and specialisation (for example a researcher, a writer, and a reviewer); agent-to-agent communication.

Build steps:

- Take a task that is too big for one agent and break it into distinct roles.
- Build each worker as a focused agent with only the tools and instructions it needs.
- Build an orchestrator that plans the work, delegates to workers, and assembles the final result.
- Define how results pass between agents, and add a reviewer or checker agent to catch mistakes.
- Add shared logging and limits across the whole system so it cannot run away or loop.
- Test with real tasks and watch where hand-offs break. Tighten roles and instructions.

Done with Type 4 when:

- A single request is handled by several agents coordinating, with a combined result.
- Each agent stays in its lane, and the system is more reliable than one agent doing it all.

Common pitfalls: reaching for multi-agent too early (if one good Type 3 agent can do the job, use it); fuzzy roles that overlap; no overall budget or step cap.

## Suggested timeline

Focused blocks of effort, not fixed calendar dates. Move on only when the current type actually works.

| Phase | Focus | Rough effort |
|---|---|---|
| Phase 0 | Foundations, setup, first API call | A few days |
| Type 1 | Conversational assistant | About 1 week |
| Type 2 | Knowledge / RAG agent | 1 to 2 weeks |
| Type 3 | Tool-using action agent | 2 to 3 weeks |
| Type 4 | Multi-agent system | 2 to 4 weeks |

## The toolbox

Pick one from each row and stay consistent.

| Need | Good options |
|---|---|
| Model providers | Anthropic Claude, OpenAI, Google Gemini, or open models via a host |
| Agent frameworks | LangChain / LangGraph, LlamaIndex, CrewAI, Microsoft AutoGen, OpenAI Agents SDK, Claude Agent SDK |
| Vector databases (RAG) | Chroma, Pinecone, Weaviate, Qdrant, or Postgres with pgvector |
| Tool connectivity | Model Context Protocol (MCP) |
| No-code / low-code | n8n, Flowise, Voiceflow, Zapier Agents, Lovable |
| Tracing & evaluation | LangSmith, Langfuse, or simple structured logs to start |

## Principles to build by

- Start simple and add one capability at a time. Each type is one new muscle.
- Get it working before you make it clever.
- Watch what it actually does. Log the reasoning and every tool call.
- Put a human in the loop for anything risky, especially actions that cost money or cannot be undone.
- Test with real tasks, not just happy paths.
- Do not reach for multi-agent by default. Use the simplest type that solves the problem.
