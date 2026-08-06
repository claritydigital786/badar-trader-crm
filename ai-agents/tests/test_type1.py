"""Plain-stdlib self-tests for the Type 1 assistant. No pytest needed.

Run:  python3 tests/test_type1.py     (from the ai-agents directory)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.llm import Message, StubClient  # noqa: E402
from type1_assistant.assistant import ConversationalAssistant  # noqa: E402


def _drain(gen):
    return "".join(gen)


def test_remembers_history():
    a = ConversationalAssistant(StubClient(), "You are a test bot.")
    _drain(a.ask("hello"))
    _drain(a.ask("second message"))
    # One user + one assistant message per turn, across two turns = 4.
    assert len(a.history) == 4, a.history
    assert a.history[0] == Message("user", "hello")
    assert a.history[1].role == "assistant"
    print("ok: history grows and keeps both sides of each turn")


def test_trimming_caps_context():
    # Tiny budget so trimming triggers almost immediately.
    a = ConversationalAssistant(StubClient(), "sys", max_context_tokens=30)
    for i in range(20):
        _drain(a.ask("a fairly long message number %d that eats tokens" % i))
    # The guarantee is about the prompt SENT each turn, not the at-rest history
    # (which briefly holds the newest reply). So history must stay bounded rather
    # than grow with every turn, and the next send (after trimming) must fit the
    # budget, unless a single stored turn already exceeds it on its own.
    assert len(a.history) <= 6, "history kept growing: %d messages" % len(a.history)
    a.history.append(Message("user", "next question"))
    a._trim()
    sent_tokens = a._estimate_tokens(a._build_messages())
    assert sent_tokens <= 30 or len(a.history) == 1, "sent context too big: %d" % sent_tokens
    print("ok: long chat stays bounded and the sent context fits the budget")


def test_reset_clears_memory():
    a = ConversationalAssistant(StubClient(), "sys")
    _drain(a.ask("remember this"))
    a.reset()
    assert a.history == [], a.history
    print("ok: reset clears memory")


def test_system_prompt_always_present():
    a = ConversationalAssistant(StubClient(), "SPECIAL-ROLE")
    _drain(a.ask("hi"))
    built = a._build_messages()
    assert built[0].role == "system" and built[0].content == "SPECIAL-ROLE"
    print("ok: system prompt is always the first message")


if __name__ == "__main__":
    test_remembers_history()
    test_trimming_caps_context()
    test_reset_clears_memory()
    test_system_prompt_always_present()
    print("\nAll Type 1 self-tests passed.")
