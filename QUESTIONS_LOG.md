# Questions Log

Every question or request Muhammad (or Junaid) asks Claude about this project, logged chronologically. This is a raw log of what was asked, not a record of what was built (that's `HANDOFF.md`) and not a distillation of decisions (that's Claude's own memory files, which are per-laptop and don't travel - this file does, since it's committed to git like everything else in this repo).

Muhammad asked for this to be kept starting 2026-08-04, so he can access it from any laptop/account at any time.

---

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
