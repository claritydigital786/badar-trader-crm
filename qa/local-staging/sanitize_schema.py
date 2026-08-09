#!/usr/bin/env python3
"""Build and verify a local-only schema baseline with no outbound callbacks."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


PRODUCTION_PROJECT_REF = "vfskqzgphrunjxquqpks"
LOCAL_AUTOMATION_FUNCTION = """CREATE OR REPLACE FUNCTION public.fire_automation_event(p_trigger_event TEXT, p_lead_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE LOG 'Local staging disabled automation callback: %, %', p_trigger_event, p_lead_id;
END;
$$;
"""


def sanitize(source: Path, destination: Path) -> None:
    lines = source.read_text(encoding="utf-8").splitlines(keepends=True)
    output: list[str] = []
    index = 0
    removed_cron_calls = 0
    replaced_automation_function = False
    removed_notifications_phase = False

    while index < len(lines):
        line = lines[index]

        if line.startswith("SELECT cron.schedule("):
            depth = 0
            while index < len(lines):
                current = lines[index]
                depth += current.count("(") - current.count(")")
                index += 1
                if depth <= 0:
                    break
            removed_cron_calls += 1
            output.append("-- Local staging removed a production cron schedule.\n")
            continue

        if line.startswith("CREATE OR REPLACE FUNCTION public.fire_automation_event"):
            while index < len(lines):
                current = lines[index]
                index += 1
                if current.strip() == "$$;":
                    break
            output.append(LOCAL_AUTOMATION_FUNCTION)
            replaced_automation_function = True
            continue

        if "Badar Trader CRM - Phase 28 Schema" in line:
            while index < len(lines):
                current = lines[index]
                index += 1
                if "DONE (Phase 28)" in current:
                    break
            output.append("-- Local staging omitted parked Phase 28 notifications.\n")
            removed_notifications_phase = True
            continue

        output.append(line)
        index += 1

    if removed_cron_calls != 3:
        raise RuntimeError(f"Expected to remove 3 cron schedules, removed {removed_cron_calls}")
    if not replaced_automation_function:
        raise RuntimeError("Production automation callback function was not replaced")
    if not removed_notifications_phase:
        raise RuntimeError("Parked Phase 28 notifications were not removed")

    rendered = "".join(output)
    if PRODUCTION_PROJECT_REF in rendered:
        raise RuntimeError("Production project reference remains in local baseline")
    destination.write_text(rendered, encoding="utf-8")


def verify_directory(migrations_dir: Path) -> None:
    forbidden = (
        (re.escape(PRODUCTION_PROJECT_REF), "production project reference"),
        (r"https://[a-z0-9-]+\.supabase\.co/functions/v1", "hosted Edge Function URL"),
        (r"\bcron\s*\.\s*schedule\s*\(", "enabled cron schedule"),
        (r"\bnet\s*\.\s*http_post\s*\(", "outbound pg_net callback"),
        (
            r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.notifications\b",
            "parked notifications table",
        ),
    )
    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        raise RuntimeError(f"No prepared migrations found in {migrations_dir}")

    for sql_file in sql_files:
        contents = sql_file.read_text(encoding="utf-8")
        for pattern, label in forbidden:
            if re.search(pattern, contents, flags=re.IGNORECASE):
                raise RuntimeError(f"{label} remains in {sql_file.name}")

    if any(path.name == "20260807000000_notifications.sql" for path in sql_files):
        raise RuntimeError("Parked notifications migration was copied into local staging")

    baseline = migrations_dir / "20260701000000_schema_baseline.sql"
    baseline_text = baseline.read_text(encoding="utf-8")
    if "Local staging disabled automation callback" not in baseline_text:
        raise RuntimeError("Local no-op automation callback is missing")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", type=Path)
    parser.add_argument("destination", nargs="?", type=Path)
    parser.add_argument("--verify-dir", type=Path)
    args = parser.parse_args()

    if args.verify_dir:
        if args.source or args.destination:
            parser.error("--verify-dir cannot be combined with source or destination")
        verify_directory(args.verify_dir)
        return

    if not args.source or not args.destination:
        parser.error("source and destination are required")
    sanitize(args.source, args.destination)


if __name__ == "__main__":
    main()
