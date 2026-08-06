"""Type 4 workers: each one is a focused Type 3 agent with a narrow toolset.

A worker is not a new abstraction - it is exactly an ActionAgent (see
../type3_agent/agent.py) constructed with only the tools its role needs. The
same guardrails Type 3 already built - the human-approval gate on dangerous
tools, the per-worker step cap - apply automatically, with no new code path
to keep in sync. This is deliberate: the roadmap's own warning for this type
is fuzzy, overlapping roles, so each worker here owns exactly one tool and
nothing else.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, Optional

from shared.llm import LLMClient
from type3_agent.agent import ActionAgent, default_approve
from type3_agent.tools import default_tools


@dataclass
class Worker:
    name: str
    description: str
    agent: ActionAgent


def default_workers(
    client: LLMClient,
    outbox_path: Optional[str] = None,
    approve: Callable[[str, str], bool] = default_approve,
    max_steps: int = 4,
) -> Dict[str, Worker]:
    tools = default_tools() if outbox_path is None else default_tools(outbox_path)
    return {
        "math_worker": Worker(
            "math_worker",
            "Handles arithmetic and calculations.",
            ActionAgent(
                client,
                {"calculator": tools["calculator"]},
                max_steps=max_steps,
                approve=approve,
            ),
        ),
        "docs_worker": Worker(
            "docs_worker",
            "Answers questions from the team's own support/refund/shipping docs.",
            ActionAgent(
                client,
                {"doc_lookup": tools["doc_lookup"]},
                max_steps=max_steps,
                approve=approve,
            ),
        ),
        "ops_worker": Worker(
            "ops_worker",
            "Sends notifications. DANGEROUS - needs human approval.",
            ActionAgent(
                client,
                {"send_notification": tools["send_notification"]},
                max_steps=max_steps,
                approve=approve,
            ),
        ),
    }
