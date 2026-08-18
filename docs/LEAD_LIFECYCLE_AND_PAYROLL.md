# Lead Lifecycle, Conversion Verification and Payroll

_Written 2026-08-08, at Muhammad's request: "the real truth for payroll figures will
be the converted leads... tighten the hierarchy behind each of those options. Badar
won't approve each of the leads which the agents will put in the funnel of Converted.
Make any other rock solid plan for it. Just go and see what competitors are doing."_

This is a plan, not built code. Nothing in here changes behaviour until it is built,
and the parts that touch money need Badar's numbers first.

**Re-applied 2026-08-18 onto current `main`.** This was researched and written on
2026-08-08 on a branch that was never merged, and `main` has moved 97 commits since.
The research and the design hold. The observations about what this CRM currently does
were made against the 08-08 code, so **re-check any "what we have" statement against
the current file before acting on it.** Two known changes: `converted_at` is now
stamped on the status dropdown (someone else fixed that independently), and the
Settings tab exists but does **not** yet hold the five payroll numbers in section 7 -
those fields still need adding.

---

## 1. Who the competitors are

Badar Trader sits in two markets at once, so "competitor" means two different sets of
software, and the interesting answers come from the second:

**A. WhatsApp business CRM / chatbot platforms** - the tools this CRM replaces.
WhatChimp (the incumbent Badar pays for today), plus Wati, AiSensy, Interakt,
Respond.io, Gallabox, DoubleTick. This is the feature-parity track the repo has been
chasing since Part 3: inbox, broadcasts, keyword replies, templates, AI training.

**B. Forex and CFD broker CRMs** - the tools built for exactly Badar's business model
(leads to funded trading accounts, agents on commission, IB referral revenue).
FX Back Office (FXBO), Leverate LXCRM, B2Core / B2Broker, UpTrader, AltimaCRM,
Syntellicore, CurrentDesk, Skale.

**The conversion and payroll problem belongs entirely to group B.** Group A has no
opinion about it, which is why nothing in the WhatChimp parity work ever answered it.
If this list is wrong, correct it and the rest of the plan still holds - the mechanism
is what matters, not the brand names.

## 2. What group B actually does, and it is not "the owner approves each one"

The single most useful finding: **in a forex CRM, a conversion is not a status an agent
picks. It is an event the system observes.** The commission trigger is the FTD, the
first-time deposit, confirmed by deposit data from the back office. Not the agent's
opinion, not the owner's inbox.

Three mechanisms, all standard, none of which require Badar to look at individual leads:

1. **The money is the trigger.** For brokers on a CPA model the FTD is the triggering
   event for commission payouts, and back-office deposit data is what confirms an
   account is funded and qualifies for commission. The agent's job is to cause the
   deposit, not to declare it.
2. **Stage gates with observable evidence.** Good pipeline design requires exit criteria
   that are *observable, buyer-verified and binary* - "you can see the evidence", "the
   signal comes from the buyer's behaviour, not the rep's optimism", "it either happened
   or it did not". Evidence requirements exist specifically to prevent "trust me" deal
   management. Vague stages plus inconsistent accountability is exactly the environment
   where reps inflate the pipeline.
3. **Approve the exception, not the transaction.** The system calculates commission
   automatically and a human approves, edits or rejects only at that point - and the
   four-eyes principle is applied so that whoever created a record is not the person who
   confirms it. Combined with clawback: commission is reclaimed when the deal does not
   hold, detected from the source-of-truth system rather than by re-reading each deal.

**Translated to Badar:** he should never see a normal conversion. He should see (a) the
handful that fail a rule, and (b) one monthly payout sheet. That is the whole ask.

## 3. The tightened stage hierarchy

The seven statuses in the dropdown today are not defined anywhere, so they mean
whatever each agent thinks they mean. Below is a definition per stage with binary entry
evidence, who is allowed to set it, and where it can go next.

Two names are wrong for this business and should be renamed (see 3.1).

| # | Stage | What it actually means | Entry evidence - binary and observable | Who may set it | May move to |
|---|---|---|---|---|---|
| 1 | **New** | The lead exists. Nobody has spoken to them. | Row created by the WhatsApp webhook, a public form, Meta Lead Ads, CSV import or Add Lead. | System only | Contacted, Lost |
| 2 | **Contacted** | A real two-way exchange happened. | At least one **inbound** message from the lead after an outbound from us. An unanswered outbound is not contact. | System (on first inbound), Agent | Qualified, Lost |
| 3 | **Qualified** | They want it and can act on it. | All three captured: broker choice (Exness/XM), trading experience, and stated intent to fund. The bot funnel already collects exactly these. | Agent | Offer Sent, Lost |
| 4 | **Offer Sent** _(today: Proposal Sent)_ | They have everything needed to act. | The referral link and the deposit amount were sent, and the send exists in Comm Log. | Agent | Deposit Reported, Lost |
| 5 | **Deposit Reported** _(today: Pending Approval)_ | **A claim, not a fact.** The lead or the agent says money has landed. | Deposit form submitted, or agent recorded all of: platform, broker account ref, amount, and a screenshot. | Agent | Converted (**system only**), Lost |
| 6 | **Converted** | The deposit passed verification. Payroll counts this. | `verified = true`, set by the rules in section 4 or by an admin clearing an exception. | **SYSTEM ONLY - no agent, no manual dropdown** | Lost (reversal, reason required) |
| 7 | **Lost** | Dead, with a reason. | A reason from a fixed list: no answer, not interested, cannot afford, wrong number, duplicate, deposit reversed. | Agent, System | New (re-open) |

### 3.1 The one change that solves Badar's problem

**Remove Converted from the status dropdown for everyone, including admins.**

Right now an agent can pick Converted from a `<select>`, which is precisely why somebody
has to police it afterwards. Once Converted is only reachable by passing verification,
there is nothing to police: an agent moves a lead to **Deposit Reported** and the system
decides. Badar's objection disappears rather than being managed.

This is the same shape as stage-gate practice in section 2: the stage advances on
observed evidence, not on the person's say-so.

### 3.2 Renames

`proposal_sent` and `pending_approval` are generic CRM words that mislead here. There is
no proposal in this business, and "pending approval" now describes a thing nobody does.
Rename to `offer_sent` and `deposit_reported`.

**This is a migration, not a display change** - `leads.status` has a CHECK constraint
(`schema.sql`) and live rows already use the old values. Order: widen the CHECK to allow
both spellings, backfill existing rows, update the frontend, then narrow the CHECK. Do
not do it in one step against live data.

## 4. Conversion verification: the rock-solid plan

Three tiers. Most conversions clear tier 1 and no human is involved.

### Tier 1 - auto-verify (no human at all)

A lead in **Deposit Reported** is promoted to **Converted** automatically only if **all**
of these are true. Every one is binary and machine-checkable:

1. A deposit screenshot exists on the lead (`kyc_documents`, `document_type = 'deposit_screenshot'`).
2. `deposit_account_ref` is present and matches the broker's account-number format.
3. `deposit_amount >= payroll_min_deposit` (Settings).
4. `deposit_account_ref` is **not already used by another lead** - the single most
   effective anti-gaming check, because reusing one real deposit across several leads is
   the obvious way to game this.
5. The lead's phone matches the WhatsApp thread the deposit claim arrived on.
6. The lead was created at least N minutes before the claim - blocks "create a lead and
   instantly convert it".
7. The agent claiming it is the agent actually assigned to the lead.

Pass all seven, the lead becomes Converted, `verified_at` is stamped, commission accrues.
Nobody is asked anything.

### Tier 2 - exception queue (a human, but rarely, and never Badar by default)

Fail any rule and the lead goes to an **Exceptions** queue with the failed rule named.
This is a real screen with a real number on it, not an inbox.

- **Any admin can clear an exception. Badar does not have to be that admin.**
- **Four-eyes:** the person clearing it may not be the agent who claimed it. Enforced in
  the database, not by policy.
- Clearing an exception requires a typed reason, kept in the audit log.

### Tier 3 - spot check (keeps tier 1 honest)

A random `payroll_audit_sample_pct` of auto-verified conversions is queued for review
anyway. Nothing blocks on it and no commission waits for it. Its only job is to catch a
pattern of screenshots that pass the rules but are not real deposits. Without this, tier 1
is trusted forever with nothing checking it.

### Tier 4 - the real truth, later

The genuine source of truth is the **broker IB portal** (Exness and XM), where Badar can
see the deposits actually credited under his referral code. Tiers 1 to 3 are
evidence-based and can in principle be fooled by a convincing screenshot. A monthly
export from the IB portal, reconciled against Converted leads by account ref, is what
makes this airtight. **That reconciliation is the eventual answer and it is not built** -
it needs an export or an API from the broker, which is Badar's account and outside what
this CRM can reach on its own.

Stated plainly so nobody believes this is more airtight than it is.

## 5. Payroll rules

1. **Payroll counts `verified_at`, never `converted_at` and never `status`.** This is the
   "real truth" Muhammad asked for, made precise: an agent's claim never reaches payroll.
2. **Commission accrues on verification, is payable after the clawback window.**
   `payroll_clawback_days` (Settings) after `verified_at` with no reversal, the amount
   becomes payable. Before that it shows as accrued, not payable.
3. **Reversal.** If a deposit is refunded, the account closed, or a spot check fails, an
   admin sets the lead back with a reversal reason. Accrued commission reverses; already
   paid commission is recorded as a negative line on the next run.
4. **A payroll run snapshots what it paid.** It writes the amounts and the leads behind
   them into its own rows, so re-opening a past month never re-computes a different
   number after the fact.
5. **Rate is per agent, defaulting to `payroll_commission_pct`.** One agent on a
   different deal should not require a code change.

## 6. What to build, in order

Each step is independently shippable and safe on its own.

1. **Stamp `verified_at`** and stop treating `verified` as decoration. (`converted_at`
   is already stamped on the status dropdown on current `main`, verified 2026-08-18.)
2. **Take Converted out of the dropdown**, add Deposit Reported as the agent's end of the
   line. Frontend only. **This alone answers Badar's objection**, before any engine exists.
3. **Status rename migration** (3.2), widen-backfill-narrow.
4. **Exceptions queue** plus the four-eyes constraint in RLS.
5. **Tier 1 rules engine** as a Postgres function on the deposit path, reading the
   Settings keys.
6. **Spot-check sampler.**
7. **Payroll run table and snapshotting**, paying on `verified_at` and the clawback window.
8. **IB portal reconciliation** (tier 4), whenever Badar can produce an export.

Steps 1 and 2 are small and change the behaviour Badar is actually complaining about.
Everything after that is hardening.

## 7. What Badar has to decide

The engine cannot be built without these, and they are business decisions, not
engineering ones. **None of the five has a field in Settings yet** - the Settings tab
on `main` covers business name, timezone, currency and lead operations, so adding a
"Conversion verification and commission" block to it is the first small task here:

| Setting | Question for Badar |
| --- | --- |
| `payroll_min_deposit` | What is the smallest deposit that earns commission? The bot says $500 - is that the payroll floor too? |
| `payroll_commission_pct` | What percentage, and is it flat or per agent? |
| `payroll_clawback_days` | How long after a deposit before the money is safely the agent's? |
| `payroll_audit_sample_pct` | What share of clean conversions get spot-checked anyway? |
| `conversion_auto_verify` | Start with auto-verify off (everything queued) for the first month, then switch on once the rules have been watched? Recommended. |

Plus one that is a policy rather than a field: **who besides Badar may clear an
exception?** The whole plan rests on that not being only him.

---

## Sources

- [Leverate - CRM for forex brokers, lead to funded trader](https://leverate.com/blog/article/how-leverates-crm-turns-forex-leads-into-loyal-traders/)
- [ForexCryptoLeads - FTD and depositor leads, a broker's guide](https://www.forexcryptoleads.com/post/a-brokers-guide-to-understanding-ftd-and-depositor-leads)
- [AltimaCRM - what a forex CRM is and the client lifecycle it runs](https://altimacrm.com/knowledge-hub/what-is-a-forex-crm-the-operational-backbone-of-modern-forex-cfd-brokerages)
- [UpTrader - forex CRM back office, automatic commission calculation with approve/reject](https://uptrader.io/en/crm/back_office)
- [FXBO - forex CRM and back-office features](https://fxbackoffice.com/features/crm-features)
- [Track360 - IB portal reconciliation and deposit confirmation from the back office](https://track360.io/blog/forex-crm-affiliate-integration-guide)
- [Rework - stage gate criteria, evidence requirements and exit rules](https://resources.rework.com/libraries/pipeline-management/stage-gate-criteria)
- [Avoma - pipeline stages with entry and exit rules](https://www.avoma.com/blog/sales-pipeline-stages)
- [Sandler - sandbagging and what causes it](https://go.sandler.com/salessellutions360/insights/blog/categories/sales-process/sandbagging-in-sales-the-quiet-behavior-that-und/)
- [Maker-checker / four-eyes principle](https://en.wikipedia.org/wiki/Maker-checker)
- [CaptivateIQ - sales commission clawbacks](https://www.captivateiq.com/blog/sales-commission-clawbacks)
