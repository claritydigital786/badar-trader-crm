"""Type 1: the conversational assistant.

The smallest thing that feels like an agent. It holds a system prompt and a
running message history, sends both to the model each turn, and streams the
reply back. It also keeps the history from growing without bound.
"""
from __future__ import annotations

from typing import Iterator, List

from shared.llm import LLMClient, Message


class ConversationalAssistant:
    def __init__(
        self,
        client: LLMClient,
        system_prompt: str,
        max_context_tokens: int = 4000,
    ):
        self.client = client
        self.system_prompt = system_prompt
        self.max_context_tokens = max_context_tokens
        self.history: List[Message] = []

    def _estimate_tokens(self, messages: List[Message]) -> int:
        # A rough heuristic: about 4 characters per token. Good enough to decide
        # when to trim. Real token counting would use the provider's tokenizer.
        return sum(len(m.content) for m in messages) // 4

    def _build_messages(self) -> List[Message]:
        # The system prompt is prepended fresh every turn so it always applies,
        # and is never dropped by trimming.
        return [Message("system", self.system_prompt)] + self.history

    def _trim(self) -> None:
        """Drop the oldest turns until the estimated context fits the budget.

        This is the simplest way to survive a long chat. The next upgrade would
        be to summarise the dropped turns into one short note instead of losing
        them outright - noted here as where that hook goes.
        """
        while (
            self.history
            and self._estimate_tokens(self._build_messages()) > self.max_context_tokens
        ):
            self.history.pop(0)

    def ask(self, user_text: str) -> Iterator[str]:
        """Add the user's message, trim if needed, then stream the reply.

        The full reply is appended to history once streaming finishes, so the
        next turn remembers it.
        """
        self.history.append(Message("user", user_text))
        self._trim()
        pieces: List[str] = []
        for piece in self.client.stream(self._build_messages()):
            pieces.append(piece)
            yield piece
        self.history.append(Message("assistant", "".join(pieces)))

    def reset(self) -> None:
        self.history.clear()
