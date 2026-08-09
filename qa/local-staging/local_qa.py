#!/usr/bin/env python3
"""Seed fake local CRM data and exercise its Data API RLS boundaries."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


LOCAL_PASSWORD = "LocalOnly!2026"
USERS = (
    ("admin@local.test", "Fake Admin", "admin"),
    ("agent.a@local.test", "Fake Agent A", "agent"),
    ("agent.b@local.test", "Fake Agent B", "agent"),
)

LEAD_A = "10000000-0000-4000-8000-000000000001"
LEAD_B = "10000000-0000-4000-8000-000000000002"
LEAD_UNASSIGNED = "10000000-0000-4000-8000-000000000003"
KB_ID = "20000000-0000-4000-8000-000000000001"
FOLLOW_UP_ID = "30000000-0000-4000-8000-000000000001"


class LocalSupabase:
    def __init__(self, runtime_dir: str, supabase_bin: str):
        if not runtime_dir.startswith("/private/tmp/badar-crm-local-staging-"):
            raise RuntimeError("Runtime must stay under /private/tmp/badar-crm-local-staging-*")

        completed = subprocess.run(
            [supabase_bin, "status", "--workdir", runtime_dir, "-o", "json"],
            check=True,
            capture_output=True,
            text=True,
        )
        self.status = json.loads(completed.stdout)
        self.api_url = self.status["API_URL"].rstrip("/")
        parsed = urllib.parse.urlparse(self.api_url)
        if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost"):
            raise RuntimeError(f"Refusing non-loopback Supabase URL: {self.api_url}")

        self.anon_key = self.status["ANON_KEY"]
        self.service_key = self.status["SERVICE_ROLE_KEY"]

    def request(
        self,
        method: str,
        path: str,
        *,
        apikey: str,
        bearer: str | None = None,
        body=None,
        prefer: str | None = None,
    ):
        payload = None if body is None else json.dumps(body).encode("utf-8")
        headers = {
            "apikey": apikey,
            "Authorization": f"Bearer {bearer or apikey}",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer

        request = urllib.request.Request(
            self.api_url + path,
            data=payload,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8")
            try:
                data = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                data = raw
            return error.code, data

    def service_rest(self, method: str, path: str, body=None, prefer: str | None = None):
        return self.request(
            method,
            "/rest/v1/" + path,
            apikey=self.service_key,
            bearer=self.service_key,
            body=body,
            prefer=prefer,
        )

    def user_rest(self, token: str, method: str, path: str, body=None, prefer: str | None = None):
        return self.request(
            method,
            "/rest/v1/" + path,
            apikey=self.anon_key,
            bearer=token,
            body=body,
            prefer=prefer,
        )

    def create_user(self, email: str, full_name: str, role: str):
        status, data = self.request(
            "POST",
            "/auth/v1/admin/users",
            apikey=self.service_key,
            bearer=self.service_key,
            body={
                "email": email,
                "password": LOCAL_PASSWORD,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name, "role": role},
            },
        )
        if status not in (200, 201):
            list_status, users_data = self.request(
                "GET",
                "/auth/v1/admin/users?per_page=100",
                apikey=self.service_key,
                bearer=self.service_key,
            )
            if list_status == 200:
                existing = next(
                    (user for user in users_data.get("users", []) if user.get("email") == email),
                    None,
                )
                if existing:
                    return existing
            raise RuntimeError(f"Could not create {email}: HTTP {status} {data}")
        return data

    def sign_in(self, email: str) -> str:
        status, data = self.request(
            "POST",
            "/auth/v1/token?grant_type=password",
            apikey=self.anon_key,
            body={"email": email, "password": LOCAL_PASSWORD},
        )
        if status != 200:
            raise RuntimeError(f"Could not sign in {email}: HTTP {status} {data}")
        return data["access_token"]


def require_status(status: int, expected: tuple[int, ...], context: str, data):
    if status not in expected:
        raise RuntimeError(f"{context}: expected HTTP {expected}, got {status}: {data}")


def upsert_rows(local: LocalSupabase, table: str, rows):
    status, data = local.service_rest(
        "POST",
        table,
        rows,
        "resolution=merge-duplicates,return=representation",
    )
    require_status(status, (200, 201), f"upsert {table}", data)


def seed(local: LocalSupabase):
    created = [local.create_user(*user) for user in USERS]
    user_ids = {item["email"]: item["id"] for item in created}
    admin_id = user_ids["admin@local.test"]
    agent_a_id = user_ids["agent.a@local.test"]
    agent_b_id = user_ids["agent.b@local.test"]

    for email, phone in (
        ("agent.a@local.test", "15550000011"),
        ("agent.b@local.test", "15550000012"),
    ):
        status, data = local.service_rest(
            "PATCH",
            "profiles?email=eq." + urllib.parse.quote(email),
            {"phone": phone},
            "return=representation",
        )
        require_status(status, (200,), f"set fake phone for {email}", data)

    upsert_rows(
        local,
        "leads",
        [
            {
                "id": LEAD_A,
                "full_name": "Fake Customer Alpha",
                "email": "alpha.customer@local.test",
                "phone": "+15550000101",
                "source": "manual",
                "instrument_type": "Forex",
                "status": "new",
                "notes": "Local QA lead owned by Agent A.",
                "assigned_agent_id": agent_a_id,
                "created_by": admin_id,
                "account_balance": 0,
                "kyc_status": "pending",
            },
            {
                "id": LEAD_B,
                "full_name": "Fake Customer Beta",
                "email": "beta.customer@local.test",
                "phone": "+15550000102",
                "source": "website",
                "instrument_type": "Stocks",
                "status": "contacted",
                "notes": "Local QA lead owned by Agent B.",
                "assigned_agent_id": agent_b_id,
                "created_by": admin_id,
                "account_balance": 2500,
                "kyc_status": "verified",
            },
            {
                "id": LEAD_UNASSIGNED,
                "full_name": "Fake Customer Gamma",
                "email": "gamma.customer@local.test",
                "phone": "+15550000103",
                "source": "referral",
                "instrument_type": "Crypto",
                "status": "qualified",
                "notes": "Local QA unassigned lead.",
                "assigned_agent_id": None,
                "created_by": admin_id,
                "account_balance": 5000,
                "kyc_status": "verified",
            },
        ],
    )

    upsert_rows(
        local,
        "lead_activity",
        [
            {
                "id": "40000000-0000-4000-8000-000000000001",
                "lead_id": LEAD_A,
                "actor_id": agent_a_id,
                "channel": "note",
                "summary": "Fake Agent A opened the local QA record.",
            },
            {
                "id": "40000000-0000-4000-8000-000000000002",
                "lead_id": LEAD_B,
                "actor_id": agent_b_id,
                "channel": "call",
                "summary": "Fake Agent B logged a local QA call.",
            },
        ],
    )

    upsert_rows(
        local,
        "transactions",
        [
            {
                "id": "50000000-0000-4000-8000-000000000001",
                "client_id": LEAD_B,
                "type": "deposit",
                "amount": 2500,
                "currency": "USD",
                "notes": "Fake local deposit.",
                "recorded_by": admin_id,
            },
            {
                "id": "50000000-0000-4000-8000-000000000002",
                "client_id": LEAD_UNASSIGNED,
                "type": "deposit",
                "amount": 5000,
                "currency": "USD",
                "notes": "Second fake local deposit.",
                "recorded_by": admin_id,
            },
        ],
    )

    upsert_rows(
        local,
        "kyc_documents",
        [
            {
                "id": "60000000-0000-4000-8000-000000000001",
                "client_id": LEAD_A,
                "document_type": "other",
                "status": "pending",
                "notes": "Fake local identity document.",
                "reviewed_by": None,
            },
            {
                "id": "60000000-0000-4000-8000-000000000002",
                "client_id": LEAD_B,
                "document_type": "other",
                "status": "verified",
                "notes": "Fake local verified document.",
                "reviewed_by": admin_id,
            },
        ],
    )

    upsert_rows(
        local,
        "communications",
        [
            {
                "id": "70000000-0000-4000-8000-000000000001",
                "lead_id": LEAD_A,
                "type": "whatsapp",
                "direction": "inbound",
                "body": "Fake inbound message for Agent A.",
                "logged_by": agent_a_id,
                "wa_message_id": "local-wamid-a-in",
                "delivery_status": None,
            },
            {
                "id": "70000000-0000-4000-8000-000000000002",
                "lead_id": LEAD_A,
                "type": "whatsapp",
                "direction": "outbound",
                "body": "Fake outbound reply from Agent A.",
                "logged_by": agent_a_id,
                "wa_message_id": "local-wamid-a-out",
                "delivery_status": "read",
            },
            {
                "id": "70000000-0000-4000-8000-000000000003",
                "lead_id": LEAD_B,
                "type": "whatsapp",
                "direction": "inbound",
                "body": "Fake inbound message for Agent B.",
                "logged_by": agent_b_id,
                "wa_message_id": "local-wamid-b-in",
                "delivery_status": None,
            },
        ],
    )

    upsert_rows(
        local,
        "settings",
        [
            {"key": "wa_access_token", "value": "fake-local-wa-token", "updated_by": admin_id},
            {"key": "wa_phone_number_id", "value": "fake-local-phone-id", "updated_by": admin_id},
            {"key": "meta_access_token", "value": "fake-local-meta-token", "updated_by": admin_id},
            {"key": "openai_api_key", "value": "fake-local-openai-key", "updated_by": admin_id},
            {"key": "wa_phone_number", "value": "+15550000999", "updated_by": admin_id},
        ],
    )

    upsert_rows(
        local,
        "automation_rules",
        [
            {
                "id": "80000000-0000-4000-8000-000000000001",
                "name": "Fake local welcome rule",
                "trigger_event": "lead_created",
                "channel": "email",
                "template_subject": "Local QA welcome",
                "template_body": "This is fake local automation copy.",
                "is_active": False,
                "created_by": admin_id,
            }
        ],
    )

    upsert_rows(
        local,
        "ai_knowledge_base",
        [
            {
                "id": KB_ID,
                "campaign_name": "Fake Local Knowledge Base",
                "bot_number": "+15550000999",
                "system_prompt": "Answer only with fake local QA information.",
                "knowledge_notes": "No production or customer content is present.",
                "is_active": True,
                "created_by": admin_id,
            }
        ],
    )

    upsert_rows(
        local,
        "ai_agents",
        [
            {
                "id": "81000000-0000-4000-8000-000000000001",
                "agent_name": "Fake Local Bot",
                "kb_id": KB_ID,
                "system_prompt": "Local QA bot. Never contact anyone.",
                "is_active": False,
                "created_by": admin_id,
            }
        ],
    )

    upsert_rows(
        local,
        "keyword_replies",
        [
            {
                "id": "82000000-0000-4000-8000-000000000001",
                "keyword": "local-test",
                "match_type": "exact",
                "reply_message": "Fake local reply only.",
                "is_active": False,
                "created_by": admin_id,
            }
        ],
    )

    upsert_rows(
        local,
        "follow_up_sequences",
        [
            {
                "id": FOLLOW_UP_ID,
                "name": "Fake local follow-up",
                "trigger_status": "new",
                "delay_hours": 24,
                "message": "Fake local follow-up message.",
                "is_active": False,
                "created_by": admin_id,
            }
        ],
    )

    upsert_rows(
        local,
        "message_templates",
        [
            {
                "id": "83000000-0000-4000-8000-000000000001",
                "name": "Fake local approved template",
                "meta_name": "fake_local_approved",
                "language": "en",
                "category": "UTILITY",
                "body": "Hello {{1}}, this is a fake local template.",
                "status": "approved",
                "notes": "Local QA only. Not submitted anywhere.",
                "is_active": True,
                "created_by": admin_id,
            }
        ],
    )

    upsert_rows(
        local,
        "subscribers",
        [
            {
                "id": "84000000-0000-4000-8000-000000000001",
                "name": "Fake Subscriber One",
                "phone": "+15550000201",
                "email": "subscriber.one@local.test",
                "community": "Local QA Community",
                "status": "active",
                "source": "manual",
                "notes": "Fake local record.",
            },
            {
                "id": "84000000-0000-4000-8000-000000000002",
                "name": "Fake Subscriber Two",
                "phone": "+15550000202",
                "email": "subscriber.two@local.test",
                "community": "Local QA Community",
                "status": "pending",
                "source": "manual",
                "notes": "Fake local record.",
            },
        ],
    )

    upsert_rows(
        local,
        "appointments",
        [
            {
                "id": "85000000-0000-4000-8000-000000000001",
                "title": "Fake Agent A follow-up",
                "contact_name": "Fake Customer Alpha",
                "contact_phone": "+15550000101",
                "scheduled_at": "2026-08-11T10:00:00Z",
                "duration_mins": 30,
                "agent_id": agent_a_id,
                "status": "scheduled",
                "notes": "Local QA appointment.",
                "created_by": admin_id,
            },
            {
                "id": "85000000-0000-4000-8000-000000000002",
                "title": "Fake Agent B review",
                "contact_name": "Fake Customer Beta",
                "contact_phone": "+15550000102",
                "scheduled_at": "2026-08-12T11:00:00Z",
                "duration_mins": 45,
                "agent_id": agent_b_id,
                "status": "scheduled",
                "notes": "Local QA appointment.",
                "created_by": admin_id,
            },
        ],
    )

    upsert_rows(
        local,
        "signal_broadcasts",
        [
            {
                "id": "86000000-0000-4000-8000-000000000001",
                "sent_by": admin_id,
                "community": "Local QA Community",
                "signal_type": "custom",
                "instrument": "LOCAL",
                "message": "Fake historical local broadcast. Nothing was sent.",
                "recipient_count": 2,
                "success_count": 0,
                "failed_count": 2,
                "results": [{"status": "not_sent", "reason": "local QA fixture"}],
            }
        ],
    )

    upsert_rows(
        local,
        "communication_logs",
        [
            {
                "id": "88000000-0000-4000-8000-000000000001",
                "lead_id": LEAD_A,
                "type": "note",
                "message": "Fake local communication log entry.",
                "created_by": agent_a_id,
            },
            {
                "id": "88000000-0000-4000-8000-000000000002",
                "lead_id": LEAD_B,
                "type": "note",
                "message": "Second fake local communication log entry.",
                "created_by": agent_b_id,
            },
        ],
    )

    upsert_rows(
        local,
        "payroll_settings",
        [
            {
                "agent_id": agent_a_id,
                "base_salary_monthly": 500,
                "commission_percent": 5,
                "updated_by": admin_id,
            },
            {
                "agent_id": agent_b_id,
                "base_salary_monthly": 600,
                "commission_percent": 4.5,
                "updated_by": admin_id,
            },
        ],
    )

    upsert_rows(
        local,
        "payroll_runs",
        [
            {
                "id": "89000000-0000-4000-8000-000000000001",
                "period_type": "monthly",
                "period_start": "2026-08-01T00:00:00Z",
                "period_end": "2026-09-01T00:00:00Z",
                "result_rows": [
                    {"agent_name": "Fake Agent A", "total_pay": 625},
                    {"agent_name": "Fake Agent B", "total_pay": 712.5},
                ],
                "total_revenue": 7500,
                "total_commission": 337.5,
                "total_pay": 1337.5,
                "created_by": admin_id,
            }
        ],
    )

    print(
        json.dumps(
            {
                "seeded": True,
                "users": [email for email, _, _ in USERS],
                "fake_leads": 3,
                "api_url": local.api_url,
            },
            indent=2,
        )
    )


def rls_matrix(local: LocalSupabase):
    # Keep the matrix repeatable on the same disposable runtime. Successful
    # write checks create clearly named fake rows, so remove only those rows
    # before counting the seeded baseline again.
    for table, column, value in (
        ("communications", "body", "Fake assigned-lead local reply. Nothing was sent."),
        ("lead_activity", "summary", "Fake assigned-lead local activity."),
        ("communication_logs", "message", "Fake assigned-lead communication log."),
        ("appointments", "title", "Fake Agent A matrix insert"),
    ):
        status, data = local.service_rest(
            "DELETE",
            f"{table}?{column}=eq.{urllib.parse.quote(value)}",
            prefer="return=minimal",
        )
        require_status(status, (200, 204), f"clear prior fake QA row from {table}", data)

    status, data = local.service_rest(
        "PATCH",
        "profiles?email=eq.agent.b%40local.test",
        {"is_suspended": False},
        "return=minimal",
    )
    require_status(status, (200, 204), "restore fake Agent B before matrix", data)

    tokens = {
        "Admin": local.sign_in("admin@local.test"),
        "Agent A": local.sign_in("agent.a@local.test"),
        "Agent B": local.sign_in("agent.b@local.test"),
    }
    rows = []

    def record(principal, action, expected, passed, actual):
        rows.append(
            {
                "principal": principal,
                "action": action,
                "expected": expected,
                "actual": actual,
                "result": "PASS" if passed else "FAIL",
            }
        )

    def select_count(principal, table, expected_count, query="select=id"):
        status, data = local.user_rest(tokens[principal], "GET", f"{table}?{query}")
        actual_count = len(data) if status == 200 and isinstance(data, list) else None
        record(
            principal,
            f"SELECT {table}",
            str(expected_count),
            status == 200 and actual_count == expected_count,
            f"HTTP {status}, rows {actual_count}",
        )

    select_count("Admin", "profiles", 3, "select=id,email,role")
    select_count("Agent A", "profiles", 1, "select=id,email,role")
    select_count("Agent B", "profiles", 1, "select=id,email,role")

    related_counts = {
        "Admin": {
            "leads": 3,
            "communications": 3,
            "transactions": 2,
            "kyc_documents": 2,
            "lead_activity": 2,
            "communication_logs": 2,
            "appointments": 2,
        },
        "Agent A": {
            "leads": 1,
            "communications": 2,
            "transactions": 0,
            "kyc_documents": 1,
            "lead_activity": 1,
            "communication_logs": 1,
            "appointments": 1,
        },
        "Agent B": {
            "leads": 1,
            "communications": 1,
            "transactions": 1,
            "kyc_documents": 1,
            "lead_activity": 1,
            "communication_logs": 1,
            "appointments": 1,
        },
    }
    for principal, counts in related_counts.items():
        for table, expected_count in counts.items():
            select_count(principal, table, expected_count)

    for table, admin_count in (
        ("ai_knowledge_base", 1),
        ("ai_agents", 1),
        ("keyword_replies", 1),
        ("follow_up_sequences", 1),
        ("message_templates", 1),
        ("subscribers", 2),
        ("automation_rules", 2),
        ("signal_broadcasts", 1),
        ("payroll_settings", 2),
        ("payroll_runs", 1),
    ):
        query = "select=agent_id" if table == "payroll_settings" else "select=id"
        select_count("Admin", table, admin_count, query)
        select_count("Agent A", table, 0, query)
        select_count("Agent B", table, 0, query)

    select_count("Admin", "settings", 5, "select=key")
    select_count("Agent A", "settings", 2, "select=key")
    select_count("Agent B", "settings", 2, "select=key")

    status, data = local.user_rest(
        tokens["Agent A"],
        "PATCH",
        f"leads?id=eq.{LEAD_B}",
        {"notes": "Cross-agent local QA update by Agent A."},
        "return=representation",
    )
    record(
        "Agent A",
        "UPDATE Agent B lead notes",
        "denied",
        status == 200 and data == [],
        f"HTTP {status}, rows {len(data) if isinstance(data, list) else None}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "PATCH",
        f"leads?id=eq.{LEAD_A}",
        {"notes": "Assigned-lead local QA update by Agent A."},
        "return=representation",
    )
    record(
        "Agent A",
        "UPDATE own assigned lead notes",
        "allowed",
        status == 200 and isinstance(data, list) and len(data) == 1,
        f"HTTP {status}, rows {len(data) if isinstance(data, list) else None}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "PATCH",
        f"leads?id=eq.{LEAD_A}",
        {"account_balance": 999999},
        "return=representation",
    )
    record(
        "Agent A",
        "UPDATE protected balance",
        "denied",
        status >= 400,
        f"HTTP {status}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "communications",
        {
            "lead_id": LEAD_B,
            "type": "whatsapp",
            "direction": "outbound",
            "body": "Fake cross-agent local reply. Nothing was sent.",
            "logged_by": user_id(local, "agent.a@local.test"),
        },
        "return=representation",
    )
    record(
        "Agent A",
        "INSERT communication on Agent B lead",
        "denied",
        status >= 400,
        f"HTTP {status}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "communications",
        {
            "lead_id": LEAD_A,
            "type": "whatsapp",
            "direction": "outbound",
            "body": "Fake assigned-lead local reply. Nothing was sent.",
            "logged_by": user_id(local, "agent.a@local.test"),
        },
        "return=representation",
    )
    record(
        "Agent A",
        "INSERT communication on own assigned lead",
        "allowed",
        status == 201 and isinstance(data, list) and len(data) == 1,
        f"HTTP {status}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "communications",
        {
            "lead_id": LEAD_A,
            "type": "whatsapp",
            "direction": "outbound",
            "body": "Fake same-lead actor forgery attempt.",
            "logged_by": user_id(local, "agent.b@local.test"),
        },
        "return=representation",
    )
    record("Agent A", "FORGE communication logged_by on own lead", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "lead_activity",
        {
            "lead_id": LEAD_B,
            "actor_id": user_id(local, "agent.a@local.test"),
            "channel": "note",
            "summary": "Fake cross-agent local activity.",
        },
        "return=representation",
    )
    record(
        "Agent A",
        "INSERT activity on Agent B lead",
        "denied",
        status >= 400,
        f"HTTP {status}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "lead_activity",
        {
            "lead_id": LEAD_A,
            "actor_id": user_id(local, "agent.a@local.test"),
            "channel": "note",
            "summary": "Fake assigned-lead local activity.",
        },
        "return=representation",
    )
    record(
        "Agent A",
        "INSERT activity on own assigned lead",
        "allowed",
        status == 201 and isinstance(data, list) and len(data) == 1,
        f"HTTP {status}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "lead_activity",
        {
            "lead_id": LEAD_A,
            "actor_id": user_id(local, "agent.b@local.test"),
            "channel": "note",
            "summary": "Fake same-lead actor forgery attempt.",
        },
        "return=representation",
    )
    record("Agent A", "FORGE activity actor_id on own lead", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "communication_logs",
        {
            "lead_id": LEAD_B,
            "type": "note",
            "message": "Fake cross-agent communication log.",
            "created_by": user_id(local, "agent.a@local.test"),
        },
        "return=representation",
    )
    record("Agent A", "INSERT log on Agent B lead", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "communication_logs",
        {
            "lead_id": LEAD_A,
            "type": "note",
            "message": "Fake assigned-lead communication log.",
            "created_by": user_id(local, "agent.a@local.test"),
        },
        "return=representation",
    )
    record(
        "Agent A",
        "INSERT log on own assigned lead",
        "allowed",
        status == 201 and isinstance(data, list) and len(data) == 1,
        f"HTTP {status}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "communication_logs",
        {
            "lead_id": LEAD_A,
            "type": "note",
            "message": "Fake same-lead actor forgery attempt.",
            "created_by": user_id(local, "agent.b@local.test"),
        },
        "return=representation",
    )
    record("Agent A", "FORGE log created_by on own lead", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "transactions",
        {
            "client_id": LEAD_A,
            "type": "deposit",
            "amount": 1,
            "currency": "USD",
            "recorded_by": user_id(local, "agent.a@local.test"),
        },
        "return=representation",
    )
    record("Agent A", "INSERT transaction", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Agent A"],
        "PATCH",
        "profiles?email=eq.agent.b%40local.test",
        {"is_suspended": True},
        "return=representation",
    )
    record(
        "Agent A",
        "SUSPEND Agent B profile",
        "denied",
        status == 200 and data == [],
        f"HTTP {status}, rows {len(data) if isinstance(data, list) else None}",
    )

    agent_a_id = user_id(local, "agent.a@local.test")
    agent_b_id = user_id(local, "agent.b@local.test")
    status, data = local.user_rest(
        tokens["Agent A"],
        "PATCH",
        "appointments?agent_id=eq." + agent_b_id,
        {"notes": "Cross-agent appointment update."},
        "return=representation",
    )
    record(
        "Agent A",
        "UPDATE Agent B appointment",
        "denied",
        status == 200 and data == [],
        f"HTTP {status}, rows {len(data) if isinstance(data, list) else None}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "PATCH",
        "appointments?agent_id=eq." + agent_a_id,
        {"notes": "Assigned appointment update."},
        "return=representation",
    )
    record(
        "Agent A",
        "UPDATE own appointment",
        "allowed",
        status == 200 and isinstance(data, list) and len(data) == 1,
        f"HTTP {status}, rows {len(data) if isinstance(data, list) else None}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "appointments",
        {
            "title": "Fake cross-agent matrix insert",
            "scheduled_at": "2026-08-13T12:00:00Z",
            "agent_id": agent_b_id,
            "created_by": agent_a_id,
        },
        "return=representation",
    )
    record("Agent A", "INSERT Agent B appointment", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "appointments",
        {
            "title": "Fake Agent A matrix insert",
            "scheduled_at": "2026-08-13T12:00:00Z",
            "agent_id": agent_a_id,
            "created_by": agent_a_id,
        },
        "return=representation",
    )
    record(
        "Agent A",
        "INSERT own appointment",
        "allowed",
        status == 201 and isinstance(data, list) and len(data) == 1,
        f"HTTP {status}",
    )

    status, data = local.user_rest(
        tokens["Agent A"],
        "POST",
        "appointments",
        {
            "title": "Fake appointment creator forgery",
            "scheduled_at": "2026-08-13T13:00:00Z",
            "agent_id": agent_a_id,
            "created_by": agent_b_id,
        },
        "return=representation",
    )
    record("Agent A", "FORGE appointment created_by on insert", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Agent A"],
        "PATCH",
        "appointments?id=eq.85000000-0000-4000-8000-000000000001",
        {"created_by": agent_b_id},
        "return=representation",
    )
    record("Agent A", "FORGE appointment created_by on update", "denied", status >= 400, f"HTTP {status}")

    status, data = local.user_rest(
        tokens["Admin"],
        "PATCH",
        "profiles?email=eq.agent.b%40local.test",
        {"is_suspended": True},
        "return=representation",
    )
    require_status(status, (200,), "admin suspends Agent B", data)
    select_count("Agent B", "leads", 0)
    select_count("Agent B", "communications", 0)
    select_count("Agent B", "appointments", 0)
    status, data = local.user_rest(
        tokens["Admin"],
        "PATCH",
        "profiles?email=eq.agent.b%40local.test",
        {"is_suspended": False},
        "return=representation",
    )
    require_status(status, (200,), "admin restores Agent B", data)

    failures = [row for row in rows if row["result"] == "FAIL"]
    print(json.dumps({"summary": {"passed": len(rows) - len(failures), "failed": len(failures)}, "matrix": rows}, indent=2))
    if failures:
        sys.exit(1)


def user_id(local: LocalSupabase, email: str) -> str:
    status, data = local.service_rest(
        "GET",
        "profiles?select=id&email=eq." + urllib.parse.quote(email),
    )
    require_status(status, (200,), f"lookup {email}", data)
    if not isinstance(data, list) or len(data) != 1:
        raise RuntimeError(f"Expected one profile for {email}, got {data}")
    return data[0]["id"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("seed", "rls"))
    parser.add_argument("--runtime", required=True)
    parser.add_argument("--supabase-bin", default="supabase")
    args = parser.parse_args()

    local = LocalSupabase(args.runtime, args.supabase_bin)
    if args.command == "seed":
        seed(local)
    else:
        rls_matrix(local)


if __name__ == "__main__":
    main()
