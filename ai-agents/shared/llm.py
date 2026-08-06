"""Provider-agnostic chat model client.

Every provider implements the same tiny interface: stream(messages) yields the
reply piece by piece. Swap providers with the AGENT_PROVIDER env var; the rest
of the code never changes. This is the seam every later agent type reuses.
"""
from __future__ import annotations

import sys
import time
from dataclasses import dataclass
from typing import Iterator, List


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


class LLMClient:
    """Base interface. A provider only has to implement stream()."""

    name = "base"

    def stream(self, messages: List[Message]) -> Iterator[str]:
        raise NotImplementedError

    def complete(self, messages: List[Message]) -> str:
        return "".join(self.stream(messages))


class StubClient(LLMClient):
    """A fake model so the whole loop runs with zero setup and no API key.

    It does not think. Its only job is to prove the plumbing works: it reports
    what it received, how many turns in we are, and how much history it was
    handed, so you can literally see memory and streaming working before a real
    key is ever involved.
    """

    name = "stub"

    def stream(self, messages: List[Message]) -> Iterator[str]:
        system = next((m.content for m in messages if m.role == "system"), "")
        last_user = next(
            (m.content for m in reversed(messages) if m.role == "user"), ""
        )
        user_turns = sum(1 for m in messages if m.role == "user")
        history_size = sum(1 for m in messages if m.role != "system")
        reply = (
            f"[stub] You said: \"{last_user}\". This is turn {user_turns}, and I am "
            f"holding {history_size} message(s) of history. Set AGENT_PROVIDER to "
            f"claude or openai (with a key in .env) for real answers."
        )
        if system:
            reply += f" My system prompt begins: \"{system[:48].strip()}...\""
        for word in reply.split(" "):
            yield word + " "
            time.sleep(0.01)  # visible streaming, so the CLI feels alive


class ClaudeClient(LLMClient):
    """Anthropic Claude. Imported lazily so stub mode needs nothing installed."""

    name = "claude"

    def __init__(self, model: str, api_key: str):
        import anthropic  # lazy import

        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    def stream(self, messages: List[Message]) -> Iterator[str]:
        # Claude takes the system prompt as a separate argument, not a message.
        system = "\n".join(m.content for m in messages if m.role == "system")
        chat = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role != "system"
        ]
        with self._client.messages.stream(
            model=self._model,
            max_tokens=1024,
            system=system or None,
            messages=chat,
        ) as stream:
            for text in stream.text_stream:
                yield text


class OpenAIClient(LLMClient):
    """OpenAI chat completions. Imported lazily so stub mode needs nothing."""

    name = "openai"

    def __init__(self, model: str, api_key: str):
        import openai  # lazy import

        self._client = openai.OpenAI(api_key=api_key)
        self._model = model

    def stream(self, messages: List[Message]) -> Iterator[str]:
        chat = [{"role": m.role, "content": m.content} for m in messages]
        stream = self._client.chat.completions.create(
            model=self._model, messages=chat, stream=True
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


def get_client(settings) -> LLMClient:
    """Pick a provider from settings, falling back to the stub with a warning
    when a real provider is chosen but its key is missing."""
    provider = settings.provider
    if provider == "claude":
        if not settings.anthropic_api_key:
            print(
                "[warn] AGENT_PROVIDER=claude but ANTHROPIC_API_KEY is empty. "
                "Using the stub instead.",
                file=sys.stderr,
            )
            return StubClient()
        return ClaudeClient(settings.claude_model, settings.anthropic_api_key)
    if provider == "openai":
        if not settings.openai_api_key:
            print(
                "[warn] AGENT_PROVIDER=openai but OPENAI_API_KEY is empty. "
                "Using the stub instead.",
                file=sys.stderr,
            )
            return StubClient()
        return OpenAIClient(settings.openai_model, settings.openai_api_key)
    return StubClient()
