"""A deterministic stand-in for a reasoning model.

Used when AGENT_PROVIDER is unset or "stub". It cannot actually think, but it
follows simple keyword rules to decide which tool to call, so the whole
reason-act loop - tool execution, the approval gate, and the step cap - can
be exercised offline with no API key. The moment a real key is in .env and
AGENT_PROVIDER is set to claude or openai, the real model reasons instead;
nothing else in agent.py changes.
"""
from __future__ import annotations

import re
from typing import Iterator, List

from shared.llm import LLMClient, Message

_MATH_RE = re.compile(r"\d+\s*[-+*/%]|[-+*/%]\s*\d+")
_TOKEN_RE = re.compile(r"\d+\.\d+|\d+|[()+\-*/%]")

_NOTIFY_WORDS = ("notify", "send a message", "alert", "tell the team", "let them know")
_DOC_WORDS = ("refund", "shipping", "deliver", "support hours", "policy", "cancel")


class StubReactClient(LLMClient):
    name = "stub-react"

    def stream(self, messages: List[Message]) -> Iterator[str]:
        yield self._decide(messages)

    def _decide(self, messages: List[Message]) -> str:
        user_messages = [m.content for m in messages if m.role == "user"]
        if not user_messages:
            return "FINAL: I have no task to work on."

        task = user_messages[0]  # the original task, always the first user turn
        observations = [c for c in user_messages[1:] if c.startswith("OBSERVATION:")]

        if observations:
            last = observations[-1][len("OBSERVATION:"):].strip()
            return f"FINAL: Based on the tool result, here is the answer: {last}"

        lowered = task.lower()
        if any(w in lowered for w in _NOTIFY_WORDS):
            return f"TOOL: send_notification | {task}"
        if any(w in lowered for w in _DOC_WORDS):
            return f"TOOL: doc_lookup | {task}"
        if _MATH_RE.search(task):
            return f"TOOL: calculator | {self._extract_expression(task)}"
        return f"FINAL: I don't have a tool for that. My best plain answer: {task}"

    @staticmethod
    def _extract_expression(text: str) -> str:
        # Pull out only the numbers and math operators, ignoring surrounding
        # words like "what is ... ?" - a real model would just read the
        # question; this stub has to reconstruct a clean expression instead.
        tokens = _TOKEN_RE.findall(text)
        return " ".join(tokens) if tokens else text
