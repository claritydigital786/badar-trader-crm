# Competitor research: the best CRMs in this market, and a page-by-page UI reference

**Re-applied 2026-08-18 onto current `main`.** Researched and written on 2026-08-08 on
a branch that was never merged; `main` has moved 97 commits since. The competitor
research is unaffected by that. The "what we have" observations were made against the
08-08 code, so **check the current file before acting on any of them** - several
screens have been reworked since, including the dashboard, Bot Manager and Settings.

_Researched 2026-08-08, at Muhammad's request: "extract out world's best five CRMs
being used for top-notch forex traders, or social media influencers who do forex
trading. Try to dig out which CRM they use. Otherwise, whatever THE BEST you could
search for the UI of each of the pages, please do it."_

---

## 0. The honest answer to "which CRM do they use"

**It is not public, for any of them.** I looked, and this is worth saying plainly
rather than inventing names:

- **No forex CRM vendor publishes its client list.** FXBO, B2Core, Syntellicore,
  UpTrader and the rest market on features and integration counts, not on named
  brokers. Searching for named-client case studies returns vendor comparison pages
  and nothing else.
- **No trading influencer discloses their back-office stack.** It is commercially
  sensitive and there is no upside to announcing it.
- Anyone who tells you "influencer X runs on CRM Y" is guessing. I am not going to
  put a guess in a document you will show Badar.

So this document does the thing that is actually verifiable and actually useful:
which platforms lead the market on independent comparison, and **what their screens
look like, page by page**, turned into concrete changes for our CRM.

## 1. One finding that matters more than the ranking

**Badar's business is two businesses, and they use two completely different kinds of
software.** This came out of the research and it reframes the whole product:

| Half of the business | What that market actually uses |
| --- | --- |
| Leads to funded broker accounts, agents on commission, IB referral revenue | **Forex broker CRMs**: FXBO, B2Core, Syntellicore, UpTrader, TradeCore/BrokerIQ, AltimaCRM, FYNXT |
| Paid signal group, subscribers, content, community | **Creator/subscription tooling**: Whop, Telegram subscription bots, and purpose-built "signal manager" CRMs that sync a Telegram group with a member list and auto-remove non-renewers |

Forex broker CRMs have **no concept of a paid signal subscriber**. Creator tools have
**no concept of a deposit, an IB commission or a KYC document**. Badar needs both, and
nobody sells both in one product.

**That is this CRM's actual competitive position** - not "a cheaper WhatChimp". Worth
saying to Badar in those words: the reason he cannot buy this off the shelf is that
his business sits in the gap between two software markets.

## 2. The five that lead, and what each is actually best at

From independent 2026 comparisons rather than vendor self-description. The forex CRM
market was about $530m in 2025 and is projected past $950m by 2033, so this is a real
category with real product investment behind it.

| # | Platform | What it is genuinely best at | What we should take from it |
| --- | --- | --- | --- |
| 1 | **FXBO (FX Back Office)** | The market leader on integration breadth - 320+ integrations, 8 trading platforms. Best for established brokers with a complex existing stack. | Its **client profile** is the reference design: everything about one person on one screen. See section 3.3. |
| 2 | **B2Core (B2Broker)** | Deepest unified back office across asset classes; strongest for a crypto-plus-forex hybrid at scale. | Its **wallet/ledger model** - money as an event stream on the client, not a number on a row. |
| 3 | **Syntellicore** | Compliance-first. Automated regulatory reporting, AI-driven KYC, MiFID II. The safest choice in regulated jurisdictions. | Its **KYC queue** and the idea of an immutable, export-ready audit log. |
| 4 | **TradeCore / BrokerIQ** | Rated the most complete on features in 2026 - widest platform coverage, full marketing suite, deepest automation without tier-gating. | Its **automation builder** sitting alongside the CRM rather than bolted on. |
| 5 | **UpTrader** | Strongest sales module and partner/IB engine; best for prop firms and copy trading. Commission is auto-calculated with an approve/edit/reject step. | Its **commission approval flow** - which is exactly the model already adopted in `LEAD_LIFECYCLE_AND_PAYROLL.md`. |

Honourable mention: **AltimaCRM** and **FYNXT** appear in most 2026 shortlists, FYNXT
specifically for launching fast on a low-code, modular architecture.

**On the creator side**, the relevant reference is a signal-manager CRM pattern: one
dashboard that publishes a formatted signal to Telegram in one click, tracks TP/SL
outcomes and an accuracy percentage automatically, and **auto-removes members whose
subscription lapsed, checked daily without anyone doing it by hand.** Our Subscribers
and AI Signals tabs are aiming at this and are currently well short of it.

## 3. Page-by-page: what the best do, what we do, what to change

Ordered by how much it would move the needle here.

### 3.1 Dashboard

**What the best do.** The dashboard is the home base and **every other page is one or
two clicks from it**. It shows the few numbers that drive a decision - open positions,
total P&L, IB commissions - on one screen rather than buried across pages. The two
named design mistakes are (a) too many features with no clear hierarchy, and (b)
trying to show every possible piece of information at once.

**What we have.** Six quick-action tiles, five stat cards, Pipeline Overview (donut +
trend), Upcoming Follow-ups. Structurally this is right and already close to the
pattern.

**Change:**
1. **The five stat cards are all-time totals and never change day to day.** Best-practice
   dashboards lead with movement, not totals. Add a period selector (Today / 7d / 30d)
   and show a delta against the previous period on each card.
2. **Add "needs a human right now" to the top of the dashboard.** We have the data and
   do not surface it: leads flagged `needs_human`, conversations whose 24-hour window is
   closing, and (once built) the verification exceptions queue. That is the single
   highest-value widget we could add, because it is the only one that produces an action.
3. Keep the tile count at six. Do not grow it.

### 3.2 All Leads (the list)

**What the best do.** Enterprise data-table practice is specific: let each user choose
and order their columns; put secondary data as **subtext under the primary cell** rather
than as its own column (email under name) to keep the table compact; offer a **density
control** for row height; use **inline actions behind a kebab menu** instead of a row of
visible buttons; **row checkboxes for bulk actions**, with the action bar appearing only
once something is selected; and **saved filter views** so an agent lands on their own
working list.

**What we have.** A fixed 7-column table, filters that do not persist, one View button
per row, no bulk select, no saved views.

**Change, in order of value:**
1. **Saved views.** "My unworked leads", "Deposit reported", "No answer 3+ days". This is
   the biggest single usability win on the busiest screen in the product.
2. **Bulk select with an action bar** - assign to agent, change status, export. Right now
   reassigning ten leads is ten separate page interactions.
3. **Subtext under the name** (phone and campaign under the lead name) to buy back two
   columns of width.
4. **Kebab menu per row** replacing the View button, holding View / Open conversation /
   Assign / Mark lost.
5. Persist the filter selection per user, the same way the nav groups now persist.

### 3.3 Lead detail - the single customer view

**What the best do.** This is the screen these platforms compete on. One screen shows
**personal details, lifetime value, verification status, ID documents, bank details,
transactions and trading accounts**, with **all account activity displayed in context
alongside previous communications**, so an agent has the full history in front of them
before they say a word. Syntellicore adds a combined customer profile and wallet so
multiple trading accounts roll into one view.

**What we have.** A detail panel with Overview / Financials / KYC / Activity /
Communications sub-tabs. The bones are right.

**Change:**
1. **A header strip that never scrolls away**, carrying the five facts an agent needs in
   every sentence: name, phone, status, assigned agent, deposit total, and the 24-hour
   window state. Today those are spread across sub-tabs.
2. **Merge Activity and Communications into one reverse-chronological timeline.** Every
   platform researched does this. Splitting them means an agent reads two lists and
   mentally interleaves them by timestamp, which is work the screen should do.
3. **Show the deposit evidence inline** - screenshot thumbnail, account ref, amount,
   verified state - rather than behind the KYC tab. It is the single most important fact
   about a lead in this business.
4. Add "next action" and its due date to the header. Agent workspaces in this market are
   built around next-action, and we have `follow_up_date` already.

### 3.4 Omnichannel Inbox

**What the best do.** VoIP, SMS, email and WhatsApp sit **in the same interface as lead
management and the client record**, so picking up a conversation means already having
the history. A centralised history of every interaction gives any team member full
context at a glance.

**What we have.** Genuinely strong, and the closest to parity of anything here: real
threads, 24h window pill, delivery ticks, attachments, templates, forward, day dividers,
internal forward. The contact panel already pulls lead context.

**Change:**
1. **Canned replies / snippets.** Every platform in this space has them; agents here
   retype the same broker links and deposit instructions all day.
2. **Show the lead's pipeline status and deposit state in the chat header**, not just
   the contact panel, so it is visible while typing.
3. Conversation assignment is there; add a simple "unassigned / mine / all" tab set, which
   is how work actually gets divided.

### 3.5 Reports

**What the best do.** Advanced CRM dashboards report **pipeline value, win rate, deal
stage breakdown and top-rep ranking**, and forex back offices add deposit/withdrawal
flow and IB commission by partner.

**What we have.** Four stat cards, agent performance, source breakdown, a monthly
new-leads trend, financial summary.

**Change:**
1. **A funnel/stage-conversion view** - how many leads pass New to Contacted to Qualified
   to Deposit Reported to Verified, and the drop-off at each gate. Once the lifecycle in
   `LEAD_LIFECYCLE_AND_PAYROLL.md` is in place this is the report that tells Badar where
   money leaks.
2. **Time-to-first-response and time-to-conversion**, which is exactly why `converted_at`
   is now stamped.
3. Date-range picker. Every report is currently all-time or fixed-window.

### 3.6 Payroll and IB commission

**What the best do.** Commission is **calculated automatically**, then a human
approves, edits or rejects **at that point only** - not per deal. Multi-tier partner
structures, split rates, transparent per-partner records, automated payouts.

**What we have.** A client-side calculator over an empty transaction set.

**Change:** build it against `LEAD_LIFECYCLE_AND_PAYROLL.md` - accrue on `verified_at`,
hold through the clawback window, one approval screen per pay run rather than per lead.
That plan is already written and waiting on Badar's five numbers.

### 3.7 Subscribers and Signals - the creator half

**What the best do (creator tooling, not forex CRMs).** One dashboard that publishes a
formatted signal to Telegram/WhatsApp in one click, updates trades from the CRM so
everything stays in sync, tracks TP/SL outcomes into an **automatic accuracy
percentage used as marketing proof**, and **auto-removes lapsed members daily**.

**What we have.** Subscribers is a real table; AI Signals computes for real but
delivery is manual; Broadcast Signal is built but off.

**Change:**
1. **A public, verifiable track record page** built from our own signal outcomes. This is
   the main thing that sells a signal group and we already store the data.
2. **Subscription state on the subscriber record** - paid until, renewed, lapsed - which
   is the thing that makes auto-removal possible later.
3. Formatted one-click signal publishing, reusing the templates work.

### 3.8 Settings

**What the best do.** One Settings entry that opens grouped sections, never
configuration scattered through the main nav.

**What we have.** Exactly that, as of today.

**Change:** nothing structural. Fill in the sections as features land.

## 3.9 The "these clients will not accept an ordinary-looking CRM" bar

Muhammad's point: these clients are high earners and will judge this on how it looks.
Fair, and worth being concrete rather than saying "make it premium".

What actually reads as expensive in this category, from the platforms researched:

1. **Restraint, not decoration.** The named failure mode in every dashboard reference is
   too much on screen with no hierarchy. Cheap software looks busy. Expensive software
   looks empty and answers your question in one glance.
2. **One accent colour used sparingly.** Our navy/gold is a genuinely good, expensive
   palette - gold reads as premium in finance. The risk is using it everywhere until it
   stops meaning anything. Gold should mark the primary action and nothing else.
3. **Typography does the work.** Consistent type scale, generous line height, numbers in
   a tabular figure font so columns align. Most "cheap-looking" CRMs are cheap-looking
   because of ragged type and mismatched sizes, not colour.
4. **Density that is chosen, not accidental.** A deliberate, controllable row density
   reads as a considered product. Ours is currently whatever the browser did.
5. **Empty states that explain themselves.** Already a rule in this repo, and it is one
   of the strongest signals of a product built by someone who cared.
6. **Motion that is almost invisible.** 120-180ms transitions on hover and panel open.
   Anything longer feels slow; nothing at all feels static and old.
7. **Real data density on the first screen.** A dashboard showing six zeros looks like a
   demo. Showing movement, deltas and one clear "here is what needs you now" reads as a
   system that is running the business.

The honest gap today: the product is structurally strong and visually inconsistent -
some screens are polished, others are default-browser. A single pass applying one type
scale, one spacing scale and one accent rule across all 22 sections would move the
perceived quality more than any individual feature. That is a well-defined piece of work
and worth quoting to Muhammad as its own task rather than doing it piecemeal.

## 4. Cross-cutting UI rules worth adopting

Taken from the data-table and dashboard guidance, and applicable to every screen here:

1. **Every page reachable in one or two clicks from the dashboard.** Worth auditing ours
   against; creating a training campaign was four clicks deep when this was written.
2. **Density and hierarchy over completeness.** The named failure mode is showing
   everything with no hierarchy. Our longer forms are guilty of this.
3. **Secondary data as subtext, not as another column.**
4. **Destructive and multi-step actions behind a kebab**, primary action visible.
5. **Bulk select on every list**, with the action bar appearing only on selection.
6. **Saved views per user** wherever there is a list.

## 5. What I would do first

If only three things get built from this document:

1. **Saved views plus bulk actions on All Leads** (3.2) - biggest daily time saving for
   the agents actually using this.
2. **The lead detail header strip and merged timeline** (3.3) - the screen these
   platforms compete on, and ours is closest to being genuinely good.
3. **The "needs a human right now" dashboard widget** (3.1) - the only dashboard element
   that produces an action rather than a number.

None of these need a migration or a deploy. All three are `index.html` work.

---

## Sources

- [Finance Magnates - Best CRMs for forex brokers in 2026](https://www.financemagnates.com/forex/technology/best-crms-for-forex-brokers-in-2026/)
- [TradeCore - Top 10 forex broker CRMs 2026, feature comparison](https://tradecore.com/resources/blog/top-10-forex-broker-crms-2026)
- [Finextra - Best forex CRM software 2026, top 7 platforms compared](https://www.finextra.com/blogposting/32103/best-forex-crm-software-2026-top-7-platforms-compared)
- [AltimaCRM - Best forex CRM software 2026](https://altimacrm.com/blogs/best-forex-crm-software-2026)
- [FXBO - CRM features](https://fxbackoffice.com/features/crm-features)
- [UpTrader - forex CRM back office, automatic commission with approve/edit/reject](https://uptrader.io/en/crm/back_office)
- [Syntellicore - customer profile and wallet](https://www.syntellicore.com/)
- [Kenmore Design - forex CRM client portal, what a trader room dashboard needs](https://www.kenmoredesign.com/2026/06/12/forex-crm-client-portal-what-brokers-need-in-a-trader-room-dashboard/)
- [Kenmore Design - forex CRM system architecture and modules](https://www.kenmoredesign.com/forex-solutions/forex-crm-system-explained/)
- [Pencil & Paper - enterprise data table UX patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Setproduct - data table UI design reference 2026](https://www.setproduct.com/blog/data-table-ui-design)
- [Salesforce Trailhead - list view optimisation](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)
- [Signal Manager CRM - Telegram signal business dashboard, auto-removal of lapsed members](https://usmanalisupport.gumroad.com/l/smanager)
- [Whop - forex signal communities](https://whop.com/discover/invest-in-forex/)
