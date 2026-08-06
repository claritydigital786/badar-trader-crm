"""Command-line runner for the Type 4 multi-agent orchestrator.

Run from the ai-agents directory:  python3 -m type4_orchestrator.cli

Try a compound task that needs more than one specialist, e.g.:
  "what is 12 * 4, and what is your refund policy?"
A single-domain task ("what is 8 + 2?") delegates to exactly one worker -
that is deliberate: the roadmap's own warning is not to reach for multi-agent
when a single Type 3 agent would do.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.config import load_settings  # noqa: E402
from shared.llm import get_client  # noqa: E402
from type3_agent.agent import default_approve  # noqa: E402
from type3_agent.stub_planner import StubReactClient  # noqa: E402
from type4_orchestrator.orchestrator import Orchestrator  # noqa: E402
from type4_orchestrator.stub_planner import StubOrchestratorClient  # noqa: E402
from type4_orchestrator.workers import default_workers  # noqa: E402


def build_orchestrator_client(settings):
    if settings.provider == "stub":
        return StubOrchestratorClient()
    return get_client(settings)


def build_worker_client(settings):
    # Workers reason too - in stub mode they get the same deterministic
    # planner Type 3 uses standalone, so tool routing inside each worker
    # works exactly like running type3_agent.cli directly.
    if settings.provider == "stub":
        return StubReactClient()
    return get_client(settings)


def main() -> None:
    settings = load_settings()
    orchestrator_client = build_orchestrator_client(settings)
    worker_client = build_worker_client(settings)
    workers = default_workers(worker_client, approve=default_approve)
    orchestrator = Orchestrator(orchestrator_client, workers)

    print(f"Type 4 orchestrator ready. Model: {orchestrator_client.name}.")
    print("Workers: " + ", ".join(workers.keys()))
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
            answer = orchestrator.run(task)
        except Exception as exc:
            print(f"[error: {exc}]\n")
            continue

        for step in orchestrator.trace:
            if step.worker_name:
                print(f"  step {step.number}: delegated to {step.worker_name} -> {step.result}")
            else:
                print(f"  step {step.number}: final answer")
        print(f"bot > {answer}\n")


if __name__ == "__main__":
    main()
