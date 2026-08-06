"""Plain-stdlib self-tests for the Type 4 multi-agent orchestrator. No pytest.

Run:  python3 tests/test_type4.py     (from the ai-agents directory)
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.llm import LLMClient  # noqa: E402
from type3_agent.stub_planner import StubReactClient  # noqa: E402
from type4_orchestrator.orchestrator import Orchestrator  # noqa: E402
from type4_orchestrator.stub_planner import StubOrchestratorClient  # noqa: E402
from type4_orchestrator.workers import default_workers  # noqa: E402


class _AlwaysDelegateClient(LLMClient):
    """Never emits FINAL - proves the delegation cap actually stops the loop."""

    name = "always-delegate"

    def stream(self, messages):
        yield "DELEGATE: math_worker | 1 + 1"


class _ScriptedClient(LLMClient):
    """Replays one fixed reply per call, in order."""

    name = "scripted"

    def __init__(self, replies):
        self._replies = list(replies)

    def stream(self, messages):
        yield self._replies.pop(0)


def _fresh_workers(approve=None):
    fd, path = tempfile.mkstemp(suffix=".log")
    os.close(fd)
    os.remove(path)  # start absent, like a real first run
    kwargs = {"outbox_path": path}
    if approve is not None:
        kwargs["approve"] = approve
    return default_workers(StubReactClient(), **kwargs), path


# ---- stub orchestrator planner --------------------------------------------


def test_single_domain_task_delegates_to_one_worker():
    workers, _ = _fresh_workers()
    orchestrator = Orchestrator(StubOrchestratorClient(), workers)
    orchestrator.run("what is 8 + 2?")
    delegations = [s for s in orchestrator.trace if s.worker_name]
    assert len(delegations) == 1, orchestrator.trace
    assert delegations[0].worker_name == "math_worker", delegations[0]
    print("ok: a single-domain task delegates to exactly one worker")


def test_compound_task_uses_two_workers():
    workers, _ = _fresh_workers()
    orchestrator = Orchestrator(StubOrchestratorClient(), workers)
    answer = orchestrator.run("what is 12 * 4, and what is your refund policy?")
    delegated_names = [s.worker_name for s in orchestrator.trace if s.worker_name]
    assert delegated_names == ["math_worker", "docs_worker"], delegated_names
    assert "48" in answer, answer
    assert "refund_policy.md" in answer, answer
    print("ok: a compound task delegates to both matching workers and combines their results")


# ---- guardrails and recovery -----------------------------------------------


def test_orchestrator_unknown_worker_recovers():
    workers, _ = _fresh_workers()
    scripted = _ScriptedClient(["DELEGATE: nonexistent_worker | x", "FINAL: done"])
    orchestrator = Orchestrator(scripted, workers, max_delegations=5)
    answer = orchestrator.run("anything")
    assert answer == "done", answer
    assert orchestrator.trace[0].result.startswith("error: unknown worker"), orchestrator.trace[0]
    print("ok: an unknown worker name is reported as a result, not a crash")


def test_delegation_cap_stops_runaway_orchestrator():
    workers, _ = _fresh_workers()
    orchestrator = Orchestrator(_AlwaysDelegateClient(), workers, max_delegations=3)
    answer = orchestrator.run("anything")
    assert answer.startswith("[delegation limit reached]"), answer
    assert len(orchestrator.trace) == 3, orchestrator.trace
    print("ok: the delegation cap stops an orchestrator that never says FINAL")


def test_malformed_orchestrator_output_treated_as_final():
    workers, _ = _fresh_workers()
    scripted = _ScriptedClient(["blah blah, no protocol followed"])
    orchestrator = Orchestrator(scripted, workers, max_delegations=5)
    answer = orchestrator.run("anything")
    assert answer == "blah blah, no protocol followed", answer
    assert len(orchestrator.trace) == 1, orchestrator.trace
    print("ok: orchestrator output that ignores the DELEGATE/FINAL protocol is treated as final")


def test_approval_gate_flows_through_to_worker_denied():
    workers, outbox_path = _fresh_workers(approve=lambda *_: False)
    orchestrator = Orchestrator(StubOrchestratorClient(), workers)
    orchestrator.run("please notify the team that the shop is closing early")
    ops_step = next(s for s in orchestrator.trace if s.worker_name == "ops_worker")
    dangerous = next(s for s in ops_step.worker_trace if s.tool_name == "send_notification")
    assert dangerous.approved is False, dangerous
    assert not os.path.exists(outbox_path) or open(outbox_path).read() == "", (
        "a denial inside a worker must never reach the outbox"
    )
    print("ok: the same worker-level approval gate applies when the orchestrator delegates a dangerous tool")


def test_approval_gate_flows_through_to_worker_approved():
    workers, outbox_path = _fresh_workers(approve=lambda *_: True)
    orchestrator = Orchestrator(StubOrchestratorClient(), workers)
    orchestrator.run("please notify the team that the shop is closing early")
    ops_step = next(s for s in orchestrator.trace if s.worker_name == "ops_worker")
    dangerous = next(s for s in ops_step.worker_trace if s.tool_name == "send_notification")
    assert dangerous.approved is True, dangerous
    assert os.path.exists(outbox_path), "an approved call should have written the outbox"
    content = open(outbox_path).read()
    assert "closing early" in content, content
    os.remove(outbox_path)
    print("ok: an approved dangerous tool call inside a worker still runs and is logged")


if __name__ == "__main__":
    test_single_domain_task_delegates_to_one_worker()
    test_compound_task_uses_two_workers()
    test_orchestrator_unknown_worker_recovers()
    test_delegation_cap_stops_runaway_orchestrator()
    test_malformed_orchestrator_output_treated_as_final()
    test_approval_gate_flows_through_to_worker_denied()
    test_approval_gate_flows_through_to_worker_approved()
    print("\nAll Type 4 self-tests passed.")
