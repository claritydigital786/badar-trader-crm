"""Plain-stdlib self-tests for the Type 3 tool-using action agent. No pytest.

Run:  python3 tests/test_type3.py     (from the ai-agents directory)
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.llm import LLMClient, Message  # noqa: E402
from type3_agent.agent import ActionAgent  # noqa: E402
from type3_agent.stub_planner import StubReactClient  # noqa: E402
from type3_agent.tools import DocLookup, calculator, default_tools  # noqa: E402


class _AlwaysToolClient(LLMClient):
    """Never emits FINAL - proves the step cap actually stops the loop."""

    name = "always-tool"

    def stream(self, messages):
        yield "TOOL: calculator | 1+1"


class _ScriptedClient(LLMClient):
    """Replays one fixed reply per call, in order."""

    name = "scripted"

    def __init__(self, replies):
        self._replies = list(replies)

    def stream(self, messages):
        yield self._replies.pop(0)


def _fresh_tools():
    """default_tools() with the outbox pointed at a throwaway temp file, so
    tests never touch the real ai-agents/type3_agent/outbox.log."""
    fd, path = tempfile.mkstemp(suffix=".log")
    os.close(fd)
    os.remove(path)  # start absent, like a real first run
    return default_tools(outbox_path=path), path


# ---- calculator -------------------------------------------------------


def test_calculator_basic_arithmetic():
    assert calculator("2 + 3 * 4") == "14"
    assert calculator("(2 + 3) * 4") == "20"
    assert calculator("-5 + 2") == "-3"
    print("ok: calculator evaluates plain arithmetic correctly")


def test_calculator_rejects_code_injection():
    for payload in (
        "__import__('os').system('echo hi')",
        "[].__class__",
        "open('/etc/passwd').read()",
        "1 if True else 2",
    ):
        result = calculator(payload)
        assert result.startswith("error:"), f"expected rejection for {payload!r}, got {result!r}"
    print("ok: calculator rejects anything beyond plain arithmetic")


# ---- doc_lookup ---------------------------------------------------------


def test_doc_lookup_finds_right_source():
    lookup = DocLookup()
    result = lookup("how many days do I have to ask for a refund?")
    assert "refund_policy.md" in result, result
    print("ok: doc_lookup retrieves the right source document")


def test_doc_lookup_no_relevant_doc():
    lookup = DocLookup()
    result = lookup("what is the capital of France?")
    assert result == "no relevant document found", result
    print("ok: doc_lookup admits when nothing relevant is found")


# ---- stub planner routing ------------------------------------------------


def _plan(user_text):
    client = StubReactClient()
    messages = [Message("system", "sys"), Message("user", user_text)]
    return next(client.stream(messages))


def test_stub_planner_routes_math_to_calculator():
    assert _plan("what is 12 * 4?").startswith("TOOL: calculator")
    print("ok: stub planner routes arithmetic to calculator")


def test_stub_planner_routes_policy_to_doc_lookup():
    assert _plan("what is your refund policy?").startswith("TOOL: doc_lookup")
    print("ok: stub planner routes policy questions to doc_lookup")


def test_stub_planner_routes_notify_to_send_notification():
    assert _plan("please notify the team that stock arrived").startswith(
        "TOOL: send_notification"
    )
    print("ok: stub planner routes notification requests to send_notification")


def test_stub_planner_finalizes_after_observation():
    messages = [
        Message("system", "sys"),
        Message("user", "what is 12 * 4?"),
        Message("assistant", "TOOL: calculator | 12 * 4"),
        Message("user", "OBSERVATION: 48"),
    ]
    reply = next(StubReactClient().stream(messages))
    assert reply.startswith("FINAL:"), reply
    assert "48" in reply, reply
    print("ok: stub planner gives a final answer once it has an observation")


# ---- full ReAct loop ------------------------------------------------------


def test_full_loop_math_task():
    tools, _ = _fresh_tools()
    agent = ActionAgent(StubReactClient(), tools)
    answer = agent.run("what is 12 * 4?")
    assert "48" in answer, answer
    assert agent.trace[0].tool_name == "calculator", agent.trace
    print("ok: full loop resolves a math task via the calculator tool")


def test_full_loop_doc_task():
    tools, _ = _fresh_tools()
    agent = ActionAgent(StubReactClient(), tools)
    answer = agent.run("what is your refund policy?")
    assert "refund_policy.md" in answer, answer
    print("ok: full loop resolves a policy task via doc_lookup")


def test_dangerous_tool_denied_not_executed():
    tools, outbox_path = _fresh_tools()
    agent = ActionAgent(StubReactClient(), tools, approve=lambda *_: False)
    agent.run("please notify the team that the shop is closing early")
    dangerous_step = next(s for s in agent.trace if s.tool_name == "send_notification")
    assert dangerous_step.approved is False, dangerous_step
    assert not os.path.exists(outbox_path) or open(outbox_path).read() == "", (
        "denied tool must never write to the outbox"
    )
    print("ok: a denied dangerous tool call never runs")


def test_dangerous_tool_approved_executes():
    tools, outbox_path = _fresh_tools()
    agent = ActionAgent(StubReactClient(), tools, approve=lambda *_: True)
    agent.run("please notify the team that the shop is closing early")
    dangerous_step = next(s for s in agent.trace if s.tool_name == "send_notification")
    assert dangerous_step.approved is True, dangerous_step
    assert os.path.exists(outbox_path), "approved tool should have written the outbox"
    content = open(outbox_path).read()
    assert "closing early" in content, content
    os.remove(outbox_path)
    print("ok: an approved dangerous tool call runs and is logged to the outbox")


def test_step_cap_stops_and_returns_message():
    tools, _ = _fresh_tools()
    agent = ActionAgent(_AlwaysToolClient(), tools, max_steps=3)
    answer = agent.run("anything")
    assert answer.startswith("[step limit reached]"), answer
    assert len(agent.trace) == 3, agent.trace
    print("ok: the step cap stops a loop that never says FINAL")


def test_unknown_tool_is_reported_and_loop_recovers():
    tools, _ = _fresh_tools()
    scripted = _ScriptedClient(["TOOL: nonexistent_tool | x", "FINAL: done"])
    agent = ActionAgent(scripted, tools, max_steps=5)
    answer = agent.run("anything")
    assert answer == "done", answer
    assert agent.trace[0].observation.startswith("error: unknown tool"), agent.trace[0]
    print("ok: an unknown tool name is reported as an observation, not a crash")


def test_malformed_output_treated_as_final():
    tools, _ = _fresh_tools()
    scripted = _ScriptedClient(["blah blah, no protocol followed"])
    agent = ActionAgent(scripted, tools, max_steps=5)
    answer = agent.run("anything")
    assert answer == "blah blah, no protocol followed", answer
    assert len(agent.trace) == 1, agent.trace
    print("ok: output that ignores the TOOL/FINAL protocol is treated as final, not retried forever")


if __name__ == "__main__":
    test_calculator_basic_arithmetic()
    test_calculator_rejects_code_injection()
    test_doc_lookup_finds_right_source()
    test_doc_lookup_no_relevant_doc()
    test_stub_planner_routes_math_to_calculator()
    test_stub_planner_routes_policy_to_doc_lookup()
    test_stub_planner_routes_notify_to_send_notification()
    test_stub_planner_finalizes_after_observation()
    test_full_loop_math_task()
    test_full_loop_doc_task()
    test_dangerous_tool_denied_not_executed()
    test_dangerous_tool_approved_executes()
    test_step_cap_stops_and_returns_message()
    test_unknown_tool_is_reported_and_loop_recovers()
    test_malformed_output_treated_as_final()
    print("\nAll Type 3 self-tests passed.")
