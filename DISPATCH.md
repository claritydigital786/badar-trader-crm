# Dispatch (Claude Cowork) on this project

Read this alongside `CLAUDE.md` before running any Dispatch session against this repo.
`HANDOFF.md` is still the source of truth for what has been built and what is open.

## What Dispatch is, and where it actually runs

Dispatch is Claude Cowork's own feature, not something this CRM contains. It is one
long-lived conversation that runs **on Muhammad's Mac inside the Claude desktop app**,
which he drives from the Claude mobile app. The Mac has to be awake with the desktop
app open while it works, and the same conversation syncs both ways, so a task started
from the phone can be picked up at the desk in the same thread. Anthropic's own
documentation is at
[claude.com/docs/cowork/guide/dispatch](https://claude.com/docs/cowork/guide/dispatch)
and
[support.claude.com](https://support.claude.com/en/articles/13947068-assign-tasks-to-claude-from-anywhere-in-cowork).

The practical point for this project: a Dispatch session is a **local** session. Unlike
a Claude Code cloud session, it can see the repo folder on disk, write into `~/Downloads`,
use the Supabase CLI if that Mac is logged in, and reach whatever browser profile is
signed in there. It has more reach than any cloud session, not less.

## The one rule that changes: a phone is not "present"

`CLAUDE.md` gates live sends and deploys on "Muhammad's laptop, with Muhammad present."
A Dispatch session driven from the phone satisfies the first half and not the second.
**Present means at the keyboard, able to read what happened before the next step runs.**

This matters because Dispatch is the exact shape of the 2026-08-03/04 incident: a real
send fired by someone who could not see what it had matched. That test was meant for one
disposable lead, hit 39 real ones, and only failed to reach anyone because the WhatsApp
credentials happened to be broken. The difference now is that the credentials work.

So: **treat a Dispatch session as remote, the same as Junaid's laptop**, however much
Muhammad's own Mac it is running on.

## Safe to ask Dispatch from the phone

- Reading anything: the repo, `HANDOFF.md`, `git log`, code review, research.
- Read-only queries against the live database. `CLAUDE.md` already allows these anywhere.
- Writing code, docs and tests; committing and pushing to a branch.
- `deno check` and the PHP/node suites in `backup-automation/tests` and `supabase/functions/tests`.
- Demo-mode browser passes against the local preview server.
- Saving a deliverable straight into `~/Downloads`. This is the standing rule a cloud
  session cannot honour and Dispatch can, so prefer Dispatch for anything Muhammad needs
  as a file on that Mac.
- Logging the request into `REMAINING_TODOS.md`, which still applies to every session.

## Never from the phone, even on direct request

- Flipping any `_ENABLED` flag to true, however briefly.
- `supabase functions deploy` of anything, `whatsapp-webhook` most of all.
- Triggering any deployed send function against real data.
- Applying a migration to the production project.
- Anything in Conversations, Comm Log, or the leads the live campaign is producing.
- Anything at all inside WhatChimp, Meta Ads Manager, WhatsApp Manager, or Badar's own
  accounts. Note specifically that the 2026-08-14 read-only viewing carve-out does **not**
  extend here: it was granted for a session where Muhammad was watching the same screen,
  and a phone-driven session on an unattended Mac is not that.

If a Dispatch task needs one of these, it should stop and say so, and the step waits
until Muhammad is at the laptop.

## Two habits this project needs from a long-lived session

1. **Pull before trusting anything.** A Dispatch thread can stay open for days, so its
   working copy goes stale in a way a fresh session's never does. `git pull origin main`
   at the start of each task, not once when the thread was created.
2. **Claim work in `HANDOFF.md`.** Junaid and Izza cannot see a conversation running on
   Muhammad's Mac. If it is not written into Active Work Claims, to them it does not exist.

## Starting a Dispatch session on this project

Send this once at the top of the thread, with the real folder path filled in:

> Work in `~/<path>/badar-trader-crm`. Read `CLAUDE.md` and `DISPATCH.md` first, then
> `HANDOFF.md` and its Active Work Claims. You are a Dispatch session, so the phone rules
> in `DISPATCH.md` apply: no deploys, no `_ENABLED` flips, no real sends, nothing inside
> the client's live accounts. Pull `main` before trusting any local file.

## Prompts worth having on the phone

- "Pull main and tell me in five lines what changed since yesterday."
- "Read HANDOFF.md Active Work Claims and list what is still open."
- "Read-only: how many leads came in today, and how many are flagged needs_human?"
- "Run deno check on whatsapp-webhook plus all suites. Report pass or fail only."
- "Fix <x> on a branch, push it, do not deploy. Tell me what still needs my laptop."
- "Save the latest CRM review into ~/Downloads as a PDF."
