# Remaining To-Dos

Renamed from `QUESTIONS_LOG.md` on 2026-08-06 at Muhammad's request, so he can add
to-dos into it directly. It travels between laptops and accounts because it is committed
to git, unlike Claude's own memory files.

Two things live here, kept apart on purpose:
- **To-Dos** - what still needs doing. Muhammad and Junaid add to this.
- **Questions Log** - the chronological record of what was asked, kept from 2026-08-04
  onward. Nothing was deleted in the rename. What got *built* is still in `HANDOFF.md`.

---

## To-Dos

_Add items here._

- [x] ~~Deploy `whatsapp-webhook` so the Train AI model picker takes effect.~~ DONE 2026-08-06 from Muhammad's laptop with him present. Live function is now **v69**, byte-identical to the repo, `verify_jwt` still false, all reply gates still false. `settings.openai_model` is `gpt-5-mini`, so the picker is now genuinely wired - but `tryAIReply()` still never runs while `AI_REPLIES_ENABLED = false`.
- [x] ~~Apply `supabase/migrations/20260806000000_ai_agents.sql`.~~ DONE 2026-08-06 from Muhammad's laptop. Applied as a single migration rather than `supabase db push`, because that command reconciles the whole migrations folder against the remote history and many files here are named `applied_via_sql_editor` (applied by hand, possibly not recorded), so a push could have replayed old migrations against the live DB. Verified after: 8 columns, RLS on, 1 admin-only policy, updated_at trigger, 2 indexes, 2 foreign keys. Security advisors show no new warnings from this table.
- [ ] **Two accounts still to create** - human-only step (needs a real password set), so no Claude session does this. Create via Supabase Dashboard -> Authentication -> Users -> Add User, then set the number with the new Set Number button in My Team:
  - Syed Bilal Ahmad Hashmi - `syedbilalahmadhashmi786@gmail.com`, phone `923325822756`
  - Syed Faisal Shah - `syedfaisalbasit@gmail.com`, phone `923002731461`
- [ ] **Syed Hamza stays suspended for now - Muhammad's decision, 2026-08-06:** "Leave Syed Hamza. I will unsuspend him once the CRM is completed." His profile exists and his number `923201946494` is set, so unsuspending is a one-click action in My Team whenever he decides. The webhook correctly skips him until then. Note WhatChimp's own User Manager does not list him at all, only Faisal, Bilal, Hanzla and Ehsan - the two systems disagree about the team roster, which matters before any import.
- [x] ~~Agent roster numbers confirmed 2026-08-06.~~ Muhammad Hanzala (`923235163874`) and Ehsan Wazir (`923342224925`) were already correct in the database and needed no change; Syed Hamza's number was set. **One discrepancy flagged rather than silently resolved:** Muhammad's message listed Ehsan Wazir with Bilal's email and Bilal's number underneath, which reads as a copy-paste slip - Ehsan was left as `ehsanwazir8@gmail.com`, matching both the database and Muhammad's own later line giving that email to Bilal.
- [x] ~~**Agent phone numbers are hardcoded in the webhook and the list is incomplete.**~~ DONE 2026-08-06 from Muhammad's laptop, webhook v70 - see HANDOFF. Original description kept below for context.

  **Follow-up found 2026-08-06 from the AYESHA laptop: that fix left schema drift behind, now closed.** The `profiles.phone` column was applied to the live database, but migration `20260806010000_profiles_phone.sql` was never committed and `schema.sql` still described `profiles` without a `phone` column. Anyone rebuilding from `schema.sql` would get a database where `getAgentRotation()` fails its read and silently falls back to the same hardcoded two-agent list the work removed. Both files written/updated now. **Not diffed against the live column definition** - no database credentials on that laptop - so if the live column has a length limit, default or constraint, the committed file is what needs correcting.

  Original: **Agent phone numbers are hardcoded in the webhook and the list is incomplete - real bug, found 2026-08-06.** `AGENT_ROTATION` in `supabase/functions/whatsapp-webhook/index.ts:321` contains only Ehsan Wazir (`923342224925`) and Muhammad Hanzala (`923235163874`). The webhook uses those numbers to (a) recognise an inbound message as coming from an agent rather than a customer, (b) send escalation pings to the assigned agent, and (c) round-robin lead assignment. Consequences today: if Bilal, Syed Hamza or Faisal ever message the business number they get created as **leads**, escalation notifications can only ever reach Ehsan or Hanzala, and round-robin only ever splits between those two. `profiles` has no phone column at all, so there is nowhere to put the real numbers. Fix is a `profiles.phone` column plus reading the rotation from the database instead of a code constant - that is a webhook change, so it needs a deploy window.
- [ ] **Delivery ticks B3/B4: apply the migration, then deploy, then build the frontend half.** Backend is written and pushed (see HANDOFF). Order matters: apply `supabase/migrations/20260806020000_communications_delivery_status.sql` **first**, then deploy `whatsapp-webhook` (`--no-verify-jwt`, Muhammad's laptop, him present). Deploying before the migration means every status callback tries to write a column that does not exist. Also worth a `deno check` first - the AYESHA laptop has no TypeScript tooling, so the change is untyped-checked. The tick rendering itself is still to do and is blocked behind the D1/C2 claim.
- [x] ~~`AYESHA` git author is unidentified.~~ RESOLVED 2026-08-06: it is **Junaid**, working from Ayesha's laptop. Commits `45f747d`, `295eeca`, `928a01b` and everything since from that machine are his. `CLAUDE.md`'s `user.name` convention still does not cover this machine - worth either setting `git config user.name "Junaid"` there or adding a line to `CLAUDE.md`, so the next session does not have to ask again.

---

## Questions Log

## 2026-08-04

- "What's remaining on my part to build up?"
- AI Signals: simplify and explain what's needed to make it real.
- WhatChimp Renewal decision: show everything working, section by section, tested live, before recommending Badar not renew.
- "I am not in the favor of turning on the bot. You can ask me after getting it tested, but not now." (standing decision)
- "I do not want nudge agents anymore." (standing decision)
- Fetch Hanzla/Ehsan/Bilal/Syed Hamza's details from WhatChimp and create Supabase users for them.
- "Test the messages speed being sent to the subscribers" - first meant Broadcast Signal, corrected to mean the Conversations tab.
- Screenshot of All Leads (filtered, no results): "please update this section," "let me know if we could get this dashboard Live," "why does it not have that circle showing the leads and the graph?"
- "his name is Badar Tanveer. Also, if you could greet each of the agents with his or her assigned name."
- "SLA stands for??"
- "Now is the high time... go to the main dashboard and see all of those links/button/sections, and check if any of those is still malfunctioned."
- "Also I want to know if the dashboard deployment went well then please proceed with the overall new development."
- Redesign concept artifact review - scope discussion (Dashboard-only pilot vs whole-CRM vs theme-only), settled on: navy/gold dark theme as sitewide default, layout/IA unchanged.
- "Badar's resource Hanzala asked what's the hierarchy behind our Supabase CRM... build a blueprint for him."
- "We have just started testing each and everything... in all the lead sections, start testing." Screenshot from Junaid's Claude session (go-live checklist table) - "What is this?"
- "I am not sure if everything's working in My Leads section... test it while following each and every such practice which finally leads this CRM to be delivered error free."
- "Moving forward, whatever I'll ask from you as a question related to this project, you'll start memorizing it somewhere in a file... so I could access it each and every time." → this file.
- "Is it possible to update the data, of the supabase CRM while integrating it with LIVE campaign, so we don't disturb the LIVE campaign."

## 2026-08-05

- "President Faisal Shah cannot see anything on his screen... let him see or assign him the right so he could see the Omnichannel conversations." (initially assumed Supabase CRM, corrected to WhatChimp - declined to operate WhatChimp directly per standing rule, guided Muhammad through his own screenshots instead.)
- Faisal added to WhatChimp User Manager (Agent role, active) but still doesn't appear in the "Assign Agent" dropdown in Omnichannel Inbox, unlike Hanzla/Bilal/Ehsan. Confirmed he has already logged in successfully (rules out an activation theory). Checked WhatChimp's own Usage Log: Team Member limit 5, used 4 - not over the seat limit, so inconclusive. Landed on: send WhatChimp support one consolidated message with everything found, rather than continuing to click through settings screens.
- "Please remember to divide the conversations into batches." (standing instruction)
- Asked to see the CRM interface to confirm the right file was open, then to switch to demo mode, then to continue through the remaining parts of the CRM (a full tab-by-tab walkthrough of the admin dashboard).
- This laptop had no GitHub auth at all - set up an SSH key and got it added to the shared account to unblock pushing.
- "what is remaining the 5 buttons available at dashboard" - checked actual deployed logic, all 3 gated tiles (Broadcast Signal, Create Flow, Train AI) are code-complete, blocked only on non-coding steps.
- "start working on the remaining parts of 3 section" - clarified there was no real coding left on those 3, then built the one genuine gap found: a UI field for the OpenAI key in Train AI.
- "can we use same open AI key here for Train AI section which is saved in whatchimp" - confirmed yes (it's Badar's own OpenAI account either way, per the 2026-08-04 entry), flagged that the key still has to come from Muhammad/Junaid, not typed in by Claude.
- Sent a screenshot of WhatChimp's AI API Integration page, asked if the CRM's version is the same - it wasn't (no key masking, no model picker, older hardcoded model), so both were added.
- "how to fetch open AI API key from whatchimp" - explained WhatChimp's masked field can't be reverse-revealed (same as OpenAI's own dashboard), guided to generate a new key from platform.openai.com instead.
- Pasted what turned out to be a masked placeholder string (asterisks + "gmYA") into chat, then confirmed that's genuinely all WhatChimp shows - walked through creating a real new key on OpenAI's dashboard instead.
- Saved the new real OpenAI key into the CRM's Bot Manager (then Train AI) tab live - confirmed the save worked correctly by reading the screenshot back.
- "help me setting up the campaign" - guided on Campaign Name/Bot Number, recommended reusing WhatChimp's real live system prompt rather than inventing one.
- Set up a real training campaign in the live CRM (confirmed save worked correctly by checking the code's known reset-after-save behavior, not a bug).
- "how to make it reply to the real customer" then "i have changed the number to another UAE number so start testing it" - declined both: flag flips stay Muhammad-laptop-only, and separately confirmed by code that `bot_number` isn't actually used anywhere in the webhook, so a flip wouldn't have stayed scoped to just the UAE number anyway.
- "change the train ai section into bot manger" - clarified scope (rename only, not merging other tabs), renamed every user-visible occurrence of "Train AI" to "Bot Manager."
- "Continue." - picked up the one open item in HANDOFF (the undeployed webhook model-picker change). Verified it independently: `deno check` shows the same 7 pre-existing errors before and after the change (so it added none), and the live deployed function v68 differs from local by exactly that change and nothing else. Asked whether to deploy; Muhammad declined for now, so the live webhook was left untouched.
- "Create a separate section entitled Bot Manager" mirroring WhatChimp's own burger-menu item (4th or 5th in that list), move the chatbot section into it, and leave the icon on the main dashboard. Screenshots from Junaid (originally from WhatChimp/Badar) to follow in the next message.
- "I want our conversations dashboard to look inch by inch the same as WhatsApp" plus a reminder never to come back unverified. Built the WhatsApp Web skin for both themes and verified it in demo mode; held the push because deploying changes what agents see mid-conversation.
- "You can do the WhatsApp webhook change thing from my laptop. Start." - deployed it (v69) with him present, plus asked for a plainer explanation of the three cross-laptop warnings.
- Screenshot of Syed Faisal Shah's details, plus: "WhatChimp always requires the mobile number of the agent. Why does it do so, and what is the mechanism behind it?" - answered from the webhook code, which turned up the hardcoded AGENT_ROTATION gap above.
- Sent WhatsApp numbers and emails for all five agents, plus the WhatChimp data-import request: keep the live campaign untouched, export the existing data, load it into Supabase so there is real data here to test ticks against.
