"""Type 3: the tool-using action agent.

Runs a think -> act -> observe loop (ReAct): each step the model either calls
one tool or gives a final answer; a tool's result is fed back as the next
observation; this repeats until the model says FINAL or a step cap is hit.

The model is not given a structured function-calling API here - it is asked,
in plain text, to reply with exactly one line in one of two shapes:

    TOOL: <tool_name> | <input text>
    FINAL: <answer>

That keeps the same tiny LLMClient.stream() interface Type 1 and Type 2
already use (see shared/llm.py) working for Type 3 too, across the stub and
every real provider, with no protocol change per provider.

Guardrail: any tool marked dangerous (see tools.py) pauses the loop and calls
`approve(tool_name, tool_input)` before it runs. A denial is fed back as an
observation rather than crashing the loop, so the agent can recover and still
finish the task. This is the non-negotiable rule from this repo's standing
instructions: nothing that could send, spend, or make an irreversible change
runs without a human saying yes first - even here, where the tool itself is
sandboxed and touches nothing real.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from shared.llm import LLMClient, Message
from type3_agent.tools import Tool

SYSTEM_PROMPT_TEMPLATE = """You are a tool-using agent. Each turn you either \
call one tool or give a final answer - never both, never more than one line.

Available tools:
{tool_list}

Respond with EXACTLY one line, in one of these two forms, nothing else:
TOOL: <tool_name> | <input text>
FINAL: <your answer to the user>

Call a tool when it would give you a real answer instead of a guess. Give a \
FINAL answer as soon as you have enough information from an OBSERVATION. \
Never invent a tool result yourself - only trust what an OBSERVATION gives \
you."""


def default_approve(tool_name: str, tool_input: str) -> bool:
    """CLI approval gate: asks a human before a dangerous tool runs."""
    answer = (
        input(f"\n[approval needed] run '{tool_name}' with input: {tool_input!r}? [y/N] ")
        .strip()
        .lower()
    )
    return answer == "y"


@dataclass
class Step:
    number: int
    raw: str
    tool_name: Optional[str] = None
    tool_input: Optional[str] = None
    approved: Optional[bool] = None  # None means "not a dangerous tool"
    observation: Optional[str] = None
    final_answer: Optional[str] = None


class ActionAgent:
    def __init__(
        self,
        client: LLMClient,
        tools: Dict[str, Tool],
        max_steps: int = 6,
        approve: Callable[[str, str], bool] = default_approve,
    ):
        self.client = client
        self.tools = tools
        self.max_steps = max_steps
        self.approve = approve
        self.trace: List[Step] = []

    def _system_prompt(self) -> str:
        tool_list = "\n".join(
            f"- {t.name}: {t.description}"
            + (" [DANGEROUS - needs approval]" if t.dangerous else "")
            for t in self.tools.values()
        )
        return SYSTEM_PROMPT_TEMPLATE.format(tool_list=tool_list)

    @staticmethod
    def _parse(raw: str) -> Tuple[str, str, Optional[str]]:
        """Returns ("tool", name, input) or ("final", answer, None).

        Output that does not follow the protocol is treated as a final
        answer rather than retried, so a model that ignores instructions
        cannot make the loop spin.
        """
        line = raw.strip().splitlines()[0].strip() if raw.strip() else ""
        if line.upper().startswith("TOOL:"):
            body = line[len("TOOL:"):].strip()
            if "|" in body:
                name, _, arg = body.partition("|")
                return "tool", name.strip(), arg.strip()
            return "tool", body, ""
        if line.upper().startswith("FINAL:"):
            return "final", line[len("FINAL:"):].strip(), None
        return "final", raw.strip(), None

    def run(self, task: str) -> str:
        self.trace = []
        messages: List[Message] = [
            Message("system", self._system_prompt()),
            Message("user", task),
        ]

        for step_num in range(1, self.max_steps + 1):
            raw = self.client.complete(messages)
            kind, first, second = self._parse(raw)
            step = Step(number=step_num, raw=raw)

            if kind == "final":
                step.final_answer = first
                self.trace.append(step)
                return first

            tool_name, tool_input = first, second or ""
            step.tool_name, step.tool_input = tool_name, tool_input
            tool = self.tools.get(tool_name)

            if tool is None:
                observation = f"error: unknown tool '{tool_name}'"
            elif tool.dangerous and not self.approve(tool_name, tool_input):
                step.approved = False
                observation = f"denied by human: '{tool_name}' was not run"
            else:
                if tool.dangerous:
                    step.approved = True
                try:
                    observation = tool.func(tool_input)
                except Exception as exc:  # a broken tool must not crash the loop
                    observation = f"error running {tool_name}: {exc}"

            step.observation = observation
            self.trace.append(step)
            messages.append(Message("assistant", raw))
            messages.append(Message("user", f"OBSERVATION: {observation}"))

        last_observation = next(
            (s.observation for s in reversed(self.trace) if s.observation), None
        )
        if last_observation:
            return f"[step limit reached] Best information gathered: {last_observation}"
        return "[step limit reached] No answer found."
