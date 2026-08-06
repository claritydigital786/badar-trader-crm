"""A deterministic stand-in for an orchestrating model.

Mirrors type3_agent/stub_planner.py one level up: instead of picking a tool,
it picks a worker. It recognises the same three domains Type 3's tools cover
(arithmetic, docs, notifications) and delegates to whichever matching worker
has not yet reported a result, one at a time. That is what makes a compound
task like "what is 12 * 4, and what is your refund policy?" genuinely
exercise more than one worker - the actual point of Type 4 over a single
Type 3 agent doing everything itself. Used only when AGENT_PROVIDER is unset
or "stub"; a real key reasons through the same DELEGATE/FINAL protocol.
"""
from __future__ import annotations

import re
from typing import Iterator, List

from shared.llm import LLMClient, Message

_MATH_RE = re.compile(r"\d+\s*[-+*/%]|[-+*/%]\s*\d+")
_TOKEN_RE = re.compile(r"\d+\.\d+|\d+|[()+\-*/%]")

_NOTIFY_WORDS = ("notify", "send a message", "alert", "tell the team", "let them know")
_DOC_WORDS = ("refund", "shipping", "deliver", "support hours", "policy", "cancel")


class StubOrchestratorClient(LLMClient):
    name = "stub-orchestrator"

    def stream(self, messages: List[Message]) -> Iterator[str]:
        yield self._decide(messages)

    def _decide(self, messages: List[Message]) -> str:
        user_messages = [m.content for m in messages if m.role == "user"]
        if not user_messages:
            return "FINAL: I have no task to work on."

        task = user_messages[0]  # the original task, always the first user turn
        results = [c for c in user_messages[1:] if c.startswith("RESULT:")]
        delegated = self._already_delegated(messages)

        needed = self._needed_workers(task)
        for worker_name, subtask in needed:
            if worker_name not in delegated:
                return f"DELEGATE: {worker_name} | {subtask}"

        if results:
            combined = " | ".join(r[len("RESULT:"):].strip() for r in results)
            return f"FINAL: Combining the workers' results: {combined}"
        return f"FINAL: I don't have a worker for that. My best plain answer: {task}"

    @staticmethod
    def _already_delegated(messages: List[Message]) -> set:
        names = set()
        for m in messages:
            if m.role == "assistant" and m.content.upper().startswith("DELEGATE:"):
                body = m.content.split(":", 1)[1]
                names.add(body.split("|")[0].strip())
        return names

    def _needed_workers(self, task: str):
        lowered = task.lower()
        needed = []
        if _MATH_RE.search(task):
            needed.append(("math_worker", self._extract_expression(task)))
        if any(w in lowered for w in _DOC_WORDS):
            needed.append(("docs_worker", task))
        if any(w in lowered for w in _NOTIFY_WORDS):
            needed.append(("ops_worker", task))
        return needed

    @staticmethod
    def _extract_expression(text: str) -> str:
        tokens = _TOKEN_RE.findall(text)
        return " ".join(tokens) if tokens else text
