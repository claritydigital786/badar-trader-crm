"""Command-line runner for the Type 3 action agent.

Run from the ai-agents directory:  python3 -m type3_agent.cli

Give it a task in plain English. It will show every step it takes: which
tool it picked, what came back, and - for the dangerous send_notification
tool - a real approval prompt before anything runs.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.config import load_settings  # noqa: E402
from shared.llm import get_client  # noqa: E402
from type3_agent.agent import ActionAgent  # noqa: E402
from type3_agent.stub_planner import StubReactClient  # noqa: E402
from type3_agent.tools import default_tools  # noqa: E402


def build_client(settings):
    # The stub provider gets the deterministic ReAct planner so the loop
    # actually exercises tool calls offline; a real provider reasons for
    # real using the same plain-text TOOL/FINAL protocol.
    if settings.provider == "stub":
        return StubReactClient()
    return get_client(settings)


def main() -> None:
    settings = load_settings()
    client = build_client(settings)
    agent = ActionAgent(client, default_tools())

    print(f"Type 3 action agent ready. Model: {client.name}.")
    print("Tools: " + ", ".join(agent.tools.keys()))
    print("Give it a task, 'exit' to quit.\n")

    while True:
        try:
            task = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nbye")
            break
        if not task:
            continue
        if task.lower() in ("exit", "quit"):
            print("bye")
            break

        try:
            answer = agent.run(task)
        except Exception as exc:
            print(f"[error: {exc}]\n")
            continue

        for step in agent.trace:
            if step.tool_name:
                approval = ""
                if step.approved is True:
                    approval = " (approved)"
                elif step.approved is False:
                    approval = " (denied)"
                print(f"  step {step.number}: {step.tool_name}{approval} -> {step.observation}")
            else:
                print(f"  step {step.number}: final answer")
        print(f"bot > {answer}\n")


if __name__ == "__main__":
    main()
