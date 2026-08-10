# Safe local staging QA report

- Date: 2026-08-10
- Branch: `junaid/safe-local-staging-20260809`
- Base: `462ed52`
- Pull request: [#14](https://github.com/claritydigital786/badar-trader-crm/pull/14)

## Safety boundary

All work used a disposable Supabase stack at `127.0.0.1` and fake `@local.test` identities. No hosted Supabase project was linked or queried during this corrective package. No production deployment, production secret, real staff account, real customer record, live message, Meta account, WhatChimp account, WhatsApp Manager account, webhook enforcement flag, or protected WhatsApp number was accessed or changed.

The browser opened only fake messages seeded in the local database. No send action was used.

## Environment

- Docker Desktop 4.85.0
- Supabase CLI 2.113.0
- PostgreSQL 15 in the local Supabase stack
- Python 3 standard library QA harness
- In-app Chrome browser at 1280 pixel desktop width and 375 pixel mobile width

Only the local Database, Auth, and Data API services were required. Messaging and live integrations were not used.

## Migration and schema checks

- Sanitized the authoritative `supabase/schema.sql` before Docker applied it.
- Removed all three production cron schedules and replaced the production automation callback with a local no-op.
- Asserted that the prepared SQL contains no production project reference, enabled `cron.schedule`, or `net.http_post` callback.
- Omitted parked Phase 28 notifications from the baseline and skipped `20260807000000_notifications.sql`.
- Applied all 32 local migration steps successfully in chronological order.
- Applied corrective migration `20260810020000_restrict_agents_to_assigned_leads.sql` last.
- Replaced the deprecated appointment-trigger `auth.role()` test with `(SELECT auth.uid()) IS NOT NULL` in both the authoritative schema and corrective migration.
- Ran `supabase db lint --local --schema public --level warning`.
- Result: no schema errors found.

The clean replay and PR review caught five permission and staging issues before the final package was submitted. A storage policy initially referenced the active-staff helper before that helper existed in the baseline. The first permission-matrix run found that Admin lacked the expected full-access policy on `communication_logs`. Muhammad's review then found production cron and automation callbacks in the copied baseline, plus pooled appointment access. The final review found that same-lead actor forgery was not tested and that appointment creator identity was not protected. The sanitizer, authoritative schema, corrective migration, and matrix now cover all five cases.

## Fake seed

The seed created Fake Admin, Fake Agent A, Fake Agent B, three fake leads, and related fake communications, transactions, KYC records, activity, communication logs, appointments, settings, automation, Bot Manager content, broadcast history, subscribers, and payroll data. It did not create notifications because that feature remains parked.

All phone numbers use the reserved `+1 555` test range. All email addresses use `@local.test`.

## Corrected access model

- Admin can access all leads and related records.
- Agent A can access only Fake Customer Alpha, which is assigned to Agent A.
- Agent B can access only Fake Customer Beta, which is assigned to Agent B.
- Neither Agent can access the unassigned lead or the other Agent's lead.
- Related communications, transactions, KYC documents, activity, communication logs, and private lead files follow the same assigned-lead boundary.
- Agent appointments are limited to rows where `agent_id` is the signed-in Agent.
- Agent-created communications, activity, and communication logs must identify the signed-in Agent as the actor.
- Agent appointment inserts must identify the signed-in Agent in both `agent_id` and `created_by`.
- Agents can update an appointment assigned to them, including one created by Admin, but cannot alter its `created_by` audit field.
- A suspended Agent sees no protected lead records.

This replaces the earlier pooled active-staff model proposed in PR #14. The corrective migration is prepared locally only. Production remains unchanged by this package.

## Cross-agent RLS matrix

Result after the final `auth.uid()` compatibility rerun: **80 passed, 0 failed**.

Coverage includes Admin full access, assigned Agent reads and writes, cross-Agent denial, unassigned-lead denial, assigned-only appointment reads, updates and inserts, protected balance denial, same-lead `logged_by`, `actor_id`, and `created_by` forgery denial, appointment creator forgery denial on insert and update, admin-only module denial, settings boundaries, and suspended-agent denial.

## Browser QA

Admin navigation passed for all 20 active modules: Dashboard, All Leads, My Team, Meta Analytics, Bot Manager, Add Lead, Omnichannel Inbox, Communication Log, Reports, Automation, Appointments, Payroll, Broadcast Signal, Subscribers, AI Signals, User Permission, User Manager, Meta Integration, Landing Pages, and Guide. Parked Notifications is excluded from the active-module count.

Agent navigation passed for all six allowed modules: Dashboard, My Leads, Omnichannel Inbox, Comm Log, Log Activity, and Guide. Admin-only navigation was absent from the Agent view.

The browser verified:

- Admin saw all three fake leads.
- Agent A dashboard showed one assigned lead.
- Agent A's My Leads, Inbox, and Comm Log showed Fake Customer Alpha only.
- Fake Customer Beta and the unassigned fake lead were absent from Agent A's pages.
- User Permission and both guides describe assigned-lead access.
- Admin login with the parked notifications table absent produces no missing-table console error.
- The final browser console contained zero errors or warnings.

## Responsive QA

- Admin and Agent desktop pages were checked at 1280 pixels wide.
- Admin Dashboard and All Leads were checked at 375 by 812 pixels.
- Agent Dashboard and Inbox were checked at 375 by 812 pixels.
- Body and document widths remained at 375 pixels on tested mobile pages, with no page-level horizontal overflow.

## Screenshots

- [Admin desktop dashboard](admin-desktop-dashboard.png)
- [Admin mobile dashboard](admin-mobile-dashboard.png)
- [Admin mobile leads](admin-mobile-leads.png)
- [Agent desktop assigned leads](agent-desktop-my-leads.png)
- [Agent mobile inbox](agent-mobile-inbox.png)

## Final result

The disposable staging harness prepares an outbound-safe baseline, replays all 32 applicable migration steps cleanly, leaves parked notifications absent, passes schema lint, and passes 80 of 80 assigned-access and actor-forgery checks including appointments. All 20 active Admin and 6 Agent modules load, Agent A sees only the assigned fake lead, tested mobile layouts do not overflow, and the final browser console is clean. PR #14 remains unmerged and production was not changed by this corrective package.
