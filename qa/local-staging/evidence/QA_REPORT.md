# Safe local staging QA report

- Date: 2026-08-10
- Branch: `junaid/safe-local-staging-20260809`
- Base: `462ed52`
- Draft PR: [#14](https://github.com/claritydigital786/badar-trader-crm/pull/14)

GitHub assigned #14 because draft PR #13 already existed as a documentation-only ownership note from a separate branch. PR #13 was not modified.

## Safety boundary

All work used a disposable Supabase stack at `127.0.0.1` and fake `@local.test` identities. No hosted Supabase project was linked or queried. No production deployment, production secret, real staff account, real customer record, live message, Meta account, WhatChimp account, WhatsApp Manager account, webhook enforcement flag, or protected WhatsApp number was accessed or changed.

The browser test opened messages seeded in the local database, but no send action was used.

## Environment

- Docker Desktop 4.85.0
- Supabase CLI 2.113.0
- PostgreSQL 15 in the local Supabase stack
- Python 3 standard library QA harness
- Chrome local browser session at desktop width and 375 pixel mobile width

Only the local Database, Auth, and Data API services were required. Messaging, Edge Functions, Storage, analytics, and dashboard services were excluded from startup.

## Migration and schema checks

- Rebuilt an empty local database from the authoritative `supabase/schema.sql` baseline plus all 30 committed migration files.
- Applied all 31 local migration steps successfully in chronological order.
- Repeated the reset after browser testing to prove the result from a clean database.
- Ran `supabase db lint --local --schema public --level warning`.
- Result: no schema errors found.

The clean replay exposed one permission drift issue. Phase 15 gave active agents pooled visibility over leads and activity, but the old insert policy still prevented an agent from logging activity on a colleague's lead. Migration `20260810000000_lead_activity_staff_insert.sql` aligns inserts with the documented active-staff model while requiring `actor_id = auth.uid()`.

## Fake seed

The seed created:

- Fake Admin
- Fake Agent A
- Fake Agent B
- Three fake leads and related fake communications, transactions, KYC records, activity, appointments, notifications, settings, automation, Bot Manager content, broadcast history, subscribers, and payroll data

All phone numbers use the reserved `+1 555` test range. All email addresses use `@local.test`.

## Cross-agent RLS matrix

Result: **71 passed, 0 failed**.

Coverage included:

- Admin sees all three profiles; each agent sees only their own profile.
- Active staff see the pooled leads, communications, transactions, KYC, activity, appointments, and communication logs required by the current product model.
- Agents cannot read admin-only Bot Manager, keyword, follow-up, template, subscriber, automation, broadcast, or payroll records.
- Agents see only the two permitted WhatsApp settings and cannot read admin-only settings.
- Notifications are recipient-scoped.
- Agent A can update allowed notes and add a communication or activity to Agent B's lead.
- Agent A cannot change protected balances, insert transactions, suspend Agent B, or forge Agent B as a notification sender.
- A suspended Agent B sees no leads, communications, or appointments.

## Browser QA

Admin navigation passed for 21 modules:

1. Dashboard
2. All Leads
3. My Team
4. Meta Ads
5. Bot Manager
6. Add Lead
7. Omnichannel Inbox
8. Comm Log
9. Reports
10. Automation
11. Appointments
12. Payroll
13. Broadcast Signal
14. Subscribers
15. AI Signals
16. User Permission
17. User Manager
18. Meta Integration
19. Notifications
20. Sites
21. Guide

Agent navigation passed for all six allowed modules: Dashboard, My Leads, Inbox, Comm Log, Log Activity, and Guide. Admin-only navigation was absent from the agent view.

Verified local workflows:

- Admin created a fake lead assigned to Fake Agent B, found it through search, and opened its detail view.
- Admin viewed fake keyword and AI Agent records in Bot Manager.
- Admin calculated and saved a fake payroll run.
- Agent A viewed the pooled lead list and Fake Agent B's fake conversation without sending a reply.
- Agent A logged a fake note against Fake Agent B's lead through the normal UI.
- Agent assignment text now says `Team member` when RLS correctly hides a colleague's profile, instead of incorrectly saying `Unassigned`.
- Comm Log now resolves creator names from already-visible profiles instead of requesting a database relationship that does not exist.

The final fresh browser console check returned no errors or warnings.

## Responsive QA

- Desktop dashboard verified at 1470 pixels wide.
- Admin Dashboard, All Leads, and Inbox verified at 375 pixels wide.
- Agent Dashboard verified at 375 pixels wide.
- Mobile document and body widths stayed at exactly 375 pixels on the tested pages, with no page-level horizontal overflow.

## Screenshots

- [Admin desktop dashboard](admin-desktop-dashboard.png)
- [Admin mobile dashboard menu](admin-mobile-dashboard.png)
- [Admin mobile inbox](admin-mobile-inbox.png)
- [Agent mobile dashboard](agent-mobile-dashboard.png)

## Final result

The disposable local staging harness is reproducible, the complete migration chain replays cleanly, the local schema lints cleanly, all 71 RLS checks pass, the tested admin and agent workflows pass, mobile layouts do not overflow, and the final browser console is clean.
