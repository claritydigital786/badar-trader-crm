"""Command-line chat loop for the Type 1 assistant.

Run from the ai-agents directory:  python3 -m type1_assistant.cli
"""
from __future__ import annotations

import os
import sys

# Allow running as a script from anywhere by putting the project root on the path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.config import load_settings  # noqa: E402
from shared.llm import get_client  # noqa: E402
from type1_assistant.assistant import ConversationalAssistant  # noqa: E402

DEFAULT_SYSTEM_PROMPT = (
    "You are a concise, friendly assistant helping the Badar Trader team learn "
    "how AI agents work. Answer plainly and briefly unless asked to expand. If "
    "you do not know something, say so rather than guessing. You do not give "
    "financial or investment advice."
)


def main() -> None:
    settings = load_settings()
    client = get_client(settings)
    assistant = ConversationalAssistant(
        client, DEFAULT_SYSTEM_PROMPT, settings.max_context_tokens
    )
    print(
        f"Type 1 assistant ready. Provider: {client.name}. "
        "Commands: 'exit' to quit, 'reset' to clear memory.\n"
    )
    while True:
        try:
            user = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nbye")
            break
        if not user:
            continue
        if user.lower() in ("exit", "quit"):
            print("bye")
            break
        if user.lower() == "reset":
            assistant.reset()
            print("(memory cleared)\n")
            continue
        print("bot > ", end="", flush=True)
        try:
            for piece in assistant.ask(user):
                sys.stdout.write(piece)
                sys.stdout.flush()
            print("\n")
        except Exception as exc:  # keep the chat alive on a failed call
            print(f"\n[error talking to the model: {exc}]\n")


if __name__ == "__main__":
    main()
