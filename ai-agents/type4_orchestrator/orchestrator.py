"""Type 4: the multi-agent orchestrator.

Breaks a task into subtasks and delegates each one to a specialised worker
(see workers.py - each worker is a narrowly-tooled Type 3 agent), reading
each worker's result before deciding the next step, until it has enough to
give one combined final answer. Reuses the same plain-text step protocol as
Type 3, one level up: DELEGATE instead of TOOL, RESULT instead of
OBSERVATION - so the same LLMClient.stream() seam every type has used since
Type 1 still needs no change here.

Guardrails at this level, on top of what each worker already enforces on its
own tool calls (its own approval gate, its own step cap): an overall
delegation cap, so an orchestrator that never says FINAL cannot hand out
work forever. Two separate budgets, not one, because a runaway orchestrator
and a runaway worker are different failure modes - a worker stuck in its own
loop is already capped by its own max_steps, but nothing stops the
orchestrator itself from delegating forever without this second cap.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from shared.llm import LLMClient, Message
from type3_agent.agent import Step
from type4_orchestrator.workers import Worker

SYSTEM_PROMPT_TEMPLATE = """You are an orchestrator. You do not do the work \
yourself - you break the task into subtasks and delegate each one to the \
right specialist, then combine their results into one final answer.

Available workers:
{worker_list}

Respond with EXACTLY one line, in one of these two forms, nothing else:
DELEGATE: <worker_name> | <subtask for that worker>
FINAL: <your combined answer to the user>

Delegate one subtask at a time and read its RESULT before deciding the next \
step. Give FINAL as soon as you have everything you need - do not delegate \
the same kind of subtask to more than one worker."""


@dataclass
class DelegationStep:
    number: int
    raw: str
    worker_name: Optional[str] = None
    subtask: Optional[str] = None
    result: Optional[str] = None
    worker_trace: List[Step] = field(default_factory=list)
    final_answer: Optional[str] = None


class Orchestrator:
    def __init__(
        self,
        client: LLMClient,
        workers: Dict[str, Worker],
        max_delegations: int = 5,
    ):
        self.client = client
        self.workers = workers
        self.max_delegations = max_delegations
        self.trace: List[DelegationStep] = []

    def _system_prompt(self) -> str:
        worker_list = "\n".join(f"- {w.name}: {w.description}" for w in self.workers.values())
        return SYSTEM_PROMPT_TEMPLATE.format(worker_list=worker_list)

    @staticmethod
    def _parse(raw: str) -> Tuple[str, str, Optional[str]]:
        line = raw.strip().splitlines()[0].strip() if raw.strip() else ""
        if line.upper().startswith("DELEGATE:"):
            body = line[len("DELEGATE:"):].strip()
            if "|" in body:
                name, _, subtask = body.partition("|")
                return "delegate", name.strip(), subtask.strip()
            return "delegate", body, ""
        if line.upper().startswith("FINAL:"):
            return "final", line[len("FINAL:"):].strip(), None
        return "final", raw.strip(), None

    def run(self, task: str) -> str:
        self.trace = []
        messages: List[Message] = [
            Message("system", self._system_prompt()),
            Message("user", task),
        ]

        for step_num in range(1, self.max_delegations + 1):
            raw = self.client.complete(messages)
            kind, first, second = self._parse(raw)
            step = DelegationStep(number=step_num, raw=raw)

            if kind == "final":
                step.final_answer = first
                self.trace.append(step)
                return first

            worker_name, subtask = first, second or ""
            step.worker_name, step.subtask = worker_name, subtask
            worker = self.workers.get(worker_name)

            if worker is None:
                result = f"error: unknown worker '{worker_name}'"
            else:
                result = worker.agent.run(subtask)
                step.worker_trace = list(worker.agent.trace)

            step.result = result
            self.trace.append(step)
            messages.append(Message("assistant", raw))
            messages.append(Message("user", f"RESULT: {result}"))

        last_result = next((s.result for s in reversed(self.trace) if s.result), None)
        if last_result:
            return f"[delegation limit reached] Best information gathered: {last_result}"
        return "[delegation limit reached] No answer found."
