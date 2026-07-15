# Deployed Edge Functions — production manifest

Complete list of every function currently deployed to Supabase project
`vfskqzgphrunjxquqpks`, captured from `list_edge_functions`. All are deployed
with `--no-verify-jwt` (public endpoints).

Functions marked **[vendored]** have their source committed under
`supabase/functions/<slug>/index.ts` and match the deployed source. Functions
marked **[tooling]** are one-off maintenance/deploy scripts (they used the
GitHub API + `settings.gh_push_token` to edit repo files, or were throwaway
diagnostics); they have no ongoing runtime role and are documented here rather
than vendored, to keep the repo clean. None contain hard-coded secrets — all
read tokens from the `settings` table at runtime.

## Runtime / app functions (vendored)

| Slug | Ver | Role |
|------|-----|------|
| whatsapp-webhook | 28 | Core WhatsApp Cloud API webhook + bot state machine (language → menu → broker → experience → deposit funnel), agent round-robin, handoff logic. |
| conversion-hook | 8 | Deposit-confirmation form/thank-you hook; marks lead converted-pending-verification. |
| nudge-agents | 2 | pg_cron (every 5 min): re-pings assigned agent until acknowledged, escalates to team after 3 misses. |
| nudge-stuck-leads | 2 | Re-sends broker-choice prompt to leads stuck at `awaiting_broker`. |
| fire-automation | 1 | Executes `automation_rules` when Postgres triggers fire (lead_created / status_changed / kyc_verified / deposit_recorded). |
| meta-ads-diagnostic | 3 | Read-only diagnostic: pulls Meta campaigns + insights for the dashboard. |

## One-off maintenance / tooling (documented, not vendored)

These committed files to the repo via the GitHub Git Data API, or were
throwaway diagnostics. `gh-commit` is the canonical example of the commit
pattern.

| Slug | Ver | Purpose |
|------|-----|---------|
| gh-commit | 8 | Repo writer: committed deposit form + thank-you + bull favicon. |
| gh-put-vercel | 7 | Wrote `vercel.json`. |
| gh-edit-index | 7 | Edited `index.html`. |
| gh-edit-dash | 8 | Edited dashboard markup. |
| gh-edit-sim | 7 | Edited `simulator.html`. |
| gh-edit-dashads | 7 | Edited dashboard Meta-ads card. |
| gh-favicon | 7 | Favicon commit. |
| gh-put-privacy | 2 | Wrote `privacy.html`. |
| gh-set-bull-favicon | 2 | Favicon swap. |
| gh-favicon-remaining-pages | 2 | Favicon across remaining pages. |
| gh-swap-wordmark-logo | 2 | Logo/wordmark swap. |
| gh-fix-meta-ads-metrics | 2 | Meta-ads metric fix commit. |
| gh-fix-connect-button-label | 2 | Button label fix commit. |
| gh-fix-comm-log | 2 | Comm-log fix commit. |
| gh-fix-ticker-position | 2 | Market-ticker CSS fix commit. |
| gh-fix-unread-badge | 2 | Unread-badge fix commit. |
| fetch-logo | 7 | Fetched the brand logo asset. |
| logo-crop | 7 | Cropped/processed the logo. |
| wa-cred-check | 2 | Diagnostic: verifies WhatsApp credentials in settings. |
| wa-resend-test | 2 | Diagnostic: test outbound WhatsApp send. |

## Not deployed but present in repo

- `supabase/functions/lead-capture/index.ts` — exists in the repo but is **not**
  currently deployed to the project. Left in place; review before relying on it.
