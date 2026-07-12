# Handoff — Bot → Human Escalation + Naming/UI

Branch: `feat/bot-human-handoff` · Prepared 2026-07-10

## What was built
The WhatsApp bot handles a conversation until it gets stuck or hits a sensitive
moment, then flags the lead for a human and goes silent so it never talks over the
agent.

**Thresholds:** the deposit step escalates on the **1st** failed reply; every other
step on the **2nd** consecutive failed reply. The counter resets whenever the lead
advances a step (or, in the simulator, when the user taps the menu).

## Files changed (committed to `feat/bot-human-handoff`)
| File | Change |
|---|---|
| `supabase/functions/whatsapp-webhook/index.ts` | `handleMiss()` retry logic, `escalate()`, `needs_human` silent-guard, `$500+`→`$500`, new greeting |
| `supabase/migrations/20260710_bot_handoff.sql` | New `leads` columns `retry_count`, `needs_human`, `handoff_reason` + partial index (idempotent) |
| `index.html` | "⚠ Needs Human" filter on Leads tab + red badge in the table (one demo lead flagged for testing) |
| `simulator.html` | 2-miss handoff (resettable, silent after), renamed BT Bot → **Team Badar**, new greeting, language options rendered inline under the greeting |
| `docs/team-badar-faq.md` | Three deposit-tier Q&As (honest form, no return promise) |

## Testable now (no deploy)
- CRM Leads tab: demo mode → All Leads → the **⚠ Needs Human** dropdown filters to flagged leads; Omar Farooq shows the badge.
- Simulator: 2 unanswerable messages in a row → handoff (badge flips to HANDED OFF, bot goes silent); tapping the menu resets the counter.

## Deploy steps (need Supabase / Vercel access) — IN ORDER
1. Run `supabase/migrations/20260710_bot_handoff.sql` in the Supabase SQL editor. **Must be first** — the new webhook writes these columns.
2. `supabase functions deploy whatsapp-webhook`
3. Deploy `index.html` to Vercel (for the Needs Human filter).
4. Smoke test: WhatsApp the 3903 number, fumble the deposit question once → confirm it hands off and the bot stops replying.

## Open items / decisions
1. ~~**Name spelling**~~ — RESOLVED 2026-07-11: confirmed **Badar Tanvir** (not Tanveer) directly by Badar. Fixed in `simulator.html`, `index.html`, `ACTION_NEEDED.md`.
2. **No "Needs Human" alert/queue beyond the filter** — escalations set the flag and log into the lead's conversation, but there's no push notification. The Leads filter is the surfacing mechanism for now.
3. **FAQ tier conflict — partially resolved 2026-07-11:** deposit amount confirmed flat **$500** (not $1,000) by Badar, matching the webhook; `docs/team-badar-faq.md` Q22/Q24 updated. Still open: course fee is $200 in the doc vs $250 in the webhook — needs Badar's confirmation before the 3 new Q&As sync into `simulator.html` + `whatsapp-webhook`.
4. **Push** — new PAT generated and stored in macOS Keychain this session (old leaked one revoked); branch should now be pushable.
