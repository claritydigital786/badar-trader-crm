"""Loads settings from environment variables (and an optional .env file).

Kept dependency-free on purpose so stub mode runs with nothing installed.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


def load_dotenv(path: str) -> None:
    """Minimal .env reader: KEY=VALUE per line, # comments ignored.

    Uses setdefault so a real environment variable always wins over the file.
    """
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


@dataclass
class Settings:
    provider: str
    anthropic_api_key: str
    openai_api_key: str
    claude_model: str
    openai_model: str
    max_context_tokens: int


def load_settings() -> Settings:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(project_root, ".env"))
    return Settings(
        provider=os.environ.get("AGENT_PROVIDER", "stub").strip().lower(),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", "").strip(),
        openai_api_key=os.environ.get("OPENAI_API_KEY", "").strip(),
        claude_model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-5").strip(),
        openai_model=os.environ.get("OPENAI_MODEL", "gpt-5-mini").strip(),
        max_context_tokens=int(os.environ.get("MAX_CONTEXT_TOKENS", "4000")),
    )
