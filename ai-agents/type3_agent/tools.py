"""Type 3 tools: small, sandboxed, clearly-described functions the agent can call.

Every tool here is read-only and safe except send_notification, which is
marked dangerous. A dangerous tool's func is never invoked without first
passing through the agent's human-approval gate (see agent.py) - that gate is
what this file cannot enforce on its own, so it never runs itself standalone.

Nothing in this file reaches a real system. calculator does plain arithmetic
in-process; doc_lookup only reads the Type 2 sample_docs already in this repo;
send_notification appends one line to a local outbox file. This repo's rules
do not allow a learning agent anywhere near WhatsApp, email, or any other live
send path, so there is no real "send" here for the guardrail to gate - only a
believable stand-in for one.
"""
from __future__ import annotations

import ast
import operator
import os
from dataclasses import dataclass
from typing import Callable, Dict

# ---- calculator ------------------------------------------------------------

_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}
_ALLOWED_UNARYOPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _safe_eval(node: ast.AST):
    # A whitelist AST walker, not eval() - only numbers, +-*/%** and unary
    # +/- are legal, so this cannot be used to run arbitrary code, import
    # anything, or reach outside this expression.
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        raise ValueError("only numbers are allowed")
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BINOPS:
        return _ALLOWED_BINOPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_UNARYOPS:
        return _ALLOWED_UNARYOPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError(f"disallowed expression near {ast.dump(node)}")


def calculator(expression: str) -> str:
    """Evaluate a plain arithmetic expression such as '12 * (3 + 4)'."""
    try:
        tree = ast.parse(expression, mode="eval")
        result = _safe_eval(tree)
    except Exception as exc:
        return f"error: could not evaluate {expression!r} ({exc})"
    return str(result)


# ---- doc_lookup (reuses Type 2's retrieval; no LLM call of its own) -------


class DocLookup:
    """Retrieval-only reuse of Type 2's pipeline: same chunker, same store,
    same stub embedder, but this tool stops after retrieval instead of
    asking a model to synthesise an answer - composition of one agent type
    inside another, not a call out to RagAgent's own LLM step.
    """

    name = "doc_lookup"

    def __init__(self, docs_dir: str = None):
        from shared.embeddings import StubEmbedder
        from type2_rag.chunking import split_markdown
        from type2_rag.vector_store import InMemoryVectorStore

        if docs_dir is None:
            here = os.path.dirname(os.path.abspath(__file__))
            docs_dir = os.path.join(os.path.dirname(here), "type2_rag", "sample_docs")

        self._embedder = StubEmbedder()
        self._store = InMemoryVectorStore()
        for name in sorted(os.listdir(docs_dir)):
            if not name.endswith((".md", ".txt")):
                continue
            with open(os.path.join(docs_dir, name), "r", encoding="utf-8") as handle:
                text = handle.read()
            for chunk in split_markdown(text):
                self._store.add(chunk, name, self._embedder.embed(chunk))

    def __call__(self, query: str) -> str:
        if len(self._store) == 0:
            return "no documents available"
        hits = self._store.search(self._embedder.embed(query), k=1)
        if not hits or hits[0].score < 0.10:
            return "no relevant document found"
        return f"(source: {hits[0].source}) {hits[0].text}"


# ---- send_notification (DANGEROUS: requires human approval) --------------

DEFAULT_OUTBOX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "outbox.log")


def make_send_notification(outbox_path: str = DEFAULT_OUTBOX) -> Callable[[str], str]:
    """Builds a send_notification tool bound to its own outbox file, so tests
    can point it at a throwaway path instead of the real one. This never
    reaches WhatsApp, email, or any live system - it appends one line to a
    local text file, standing in for "a message went out" so the approval
    gate has something concrete to guard.
    """

    def send_notification(message: str) -> str:
        with open(outbox_path, "a", encoding="utf-8") as handle:
            handle.write(message.strip() + "\n")
        return f"notification appended to {os.path.basename(outbox_path)}"

    return send_notification


# ---- registry --------------------------------------------------------------


@dataclass
class Tool:
    name: str
    description: str
    func: Callable[[str], str]
    dangerous: bool = False


def default_tools(outbox_path: str = DEFAULT_OUTBOX) -> Dict[str, Tool]:
    return {
        "calculator": Tool(
            "calculator",
            "Evaluate a plain arithmetic expression, e.g. '12 * (3 + 4)'. "
            "Input: the expression as plain text.",
            calculator,
        ),
        "doc_lookup": Tool(
            "doc_lookup",
            "Look up an answer in the team's own support/refund/shipping "
            "docs. Input: a plain-text question.",
            DocLookup(),
        ),
        "send_notification": Tool(
            "send_notification",
            "Send a notification message. DANGEROUS - requires human "
            "approval before it runs. Input: the message text.",
            make_send_notification(outbox_path),
            dangerous=True,
        ),
    }
