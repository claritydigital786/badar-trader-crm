# CRM Presentation Readiness

Deadline: 2026-08-10, approximately 10:00 PM Pakistan time.

## Presentation URL

Use the local fake-data preview so the meeting cannot change customer records or
send live WhatsApp messages:

`http://127.0.0.1:8765/index.html?demo-preview=1&demo-start=dashboard`

Refresh once with Command-R before the presentation. The normal inbox-focused
preview still works at `?demo-preview=1`.

## Recommended demonstration path

1. Dashboard - explain the lead pipeline and key totals.
2. All Leads - search, filters, assignment, and the complete lead record.
3. Omnichannel Inbox - compact message bubbles, day separators, timestamps,
   24-hour reply-window state, unread control, and message actions.
4. My Team and User Manager - roles, active/suspended staff, and assigned-lead
   boundaries.
5. Reports - conversion, sources, agent performance, and recorded deposits.
6. Payroll - salary settings, commission calculation, saved runs, and CSV.
7. Appointments and Comm Log - follow-up ownership and communication history.
8. Bot Manager - show the training content and the safety gates that remain OFF.

## Module truth for the meeting

Demonstrate as working CRM capability with fake preview data:

- Dashboard, All Leads, My Team, Omnichannel Inbox and Comm Log.
- Reports, Payroll, Appointments, User Manager and Settings.

Describe as controlled preview or configuration, not fully live automation:

- Meta Ads, Bot Manager, Automation, Broadcast Signal, Subscribers and AI
  Signals.
- User Permission, Meta Integration, Sites and Guide.

Do not present Notifications as operational. Its production migration remains
parked by Muhammad's decision, and its current save control is intentionally not
a live settings write.

## Do not demonstrate as live capability yet

- Do not send a real WhatsApp message, attachment, template, signal, automation,
  or bot reply during the meeting.
- Do not change Meta, WhatChimp, Supabase, Vercel, or Hostinger settings during
  the meeting.
- Notifications and several Bot Manager reference panels are intentionally
  incomplete.
- Sites is a reference/landing-page area, not a finished site builder.
- User Permission documents the current role model; it is not a per-feature
  permission editor.

## Real remaining work

1. Finish and decide PR #16: production backup/restore readiness and a real
   disposable-staging restore test.
2. Complete the staged Meta webhook-signature rollout and audit before enabling
   enforcement.
3. Disconnect WhatChimp from number 6541, verify Meta routing, and run real
   end-to-end WhatsApp tests. Never touch number 3903.
4. Submit and obtain Meta approval for message templates, then deploy and test
   template sending.
5. Create Bilal and Faisal's real Supabase Auth accounts and set passwords
   privately.
6. Train and approve the CRM AI bot copy, configure a billed API key privately,
   and enable replies only after routing is proven clean.
7. Review the production Supabase security-advisor warnings, then performance
   advisor findings, without weakening assigned-lead isolation.
8. Decide whether to activate the parked Notifications migration and when to
   unsuspend Syed Hamza.

## Verification state

- PR #14 is merged into `main`.
- Inbox UI regression checks pass.
- Every one of the 22 Admin navigation entries, including Settings, has a
  matching page section.
- Admin and Agent sidebars use one bundled outline-SVG icon system with no CDN
  dependency and explicit dark-theme contrast.
- Settings is operational: business identity changes the sidebar branding,
  business timezone drives CRM dates and conversation day boundaries, and the
  schema-supported default transaction currency drives new transaction forms.
- Dashboard balances are no longer labelled company revenue. Reports derive
  recorded deposits from transaction rows, preserve currency buckets, and
  payroll limits commissionable deposits to USD so unlike currencies are not
  silently added together.
- The backup configuration covers all 23 active schema tables, including the
  new per-user message-actions table; its loopback integration test passes.
- Demo-preview sidebar navigation was fixed so its click handler is attached
  before the preview boot path returns.
- The refreshed local build passed the final browser walkthrough: all 22 Admin
  navigation entries opened their matching sections without horizontal
  overflow; Dashboard, Inbox, Reports, Payroll and Settings were checked at
  desktop size; Dashboard, Inbox and Settings were checked at 375 px mobile
  width; and the browser console contained no warnings or errors.
- Inbox verification confirmed compact responsive message bubbles, one day
  separator per displayed day, clock timestamps on each message and the
  WhatsApp-style per-message action menu (Message info, Reply, Copy, React,
  Forward, Pin, Star, Add text to note and Delete).
- Demo workspace settings now persist while navigating between sections. The
  final refreshed test changed the transaction currency to EUR, reopened
  Settings to verify it persisted, then restored and re-verified USD. The demo
  confirmed that no production setting was changed.
