# Badar Trader CRM - Bug History

A quick chronological log of real bugs found and fixed since the project started, compiled from `HANDOFF.md` and `REMAINING_TODOS.md` on Muhammad's request. Feature builds and pure design passes are left out; this is bugs only.

## Early build (July 2026)

- **RLS drift caught, mobile/UI fixes.** A live database policy had drifted from what the code assumed.
- **Bot paused for WhatChimp month, deployed a 5-day-stale fix.** A fix had been sitting ready but not actually deployed for 5 days.
- **Two real dead-button bugs found and fixed** during the Follow-ups sender / Broadcast Signal build.
- **Conversations: blank-line bubble bug**, plus real send-speed problems in `send-wa-message`.

## August 2026

- **Backup script's table gap** - the automated backup was silently missing a table.
- **Agent notification flood.** `escalate()` had no guard at all: a customer sending several messages quickly triggered several WhatsApp pings to the agent for the same lead. Notifications were switched off entirely (2026-07-21) until this was fixed properly.
- **The double-reply bug** - built and tested, an early version was not deployed until verified.
- **Reply gates were fake toggles** - the on/off switches in the UI did not actually control anything until v87.
- **All Leads: an empty filtered table looked identical to a broken page**, with no message explaining why nothing showed.
- **The bot went silent on a qualified lead** - diagnosed directly from the database and fixed.
- **Signals-Group pricing: the bot stated a false price**, traced to a real routing bug that caused it, both fixed together.
- **A migration timestamp collision** that would have silently skipped a real migration - caught before it ran.
- **Deposit submissions were not alerting anyone**, and one submission could be processed more than once if resubmitted - fixed so a submission is handled exactly once.
- **AUM (Approved Deposits) was counting unapproved amounts** - fixed so only admin-approved deposits count.
- **Submitted deposit amount and admin-approved balance were the same number** - a customer's own claimed amount could move the real balance before anyone checked it. Separated so approval is a real, distinct step.
- **A full sweep for a whole class of bug**: several places in the app read an entire table with no row limit, and PostgREST silently caps an unbounded read at 1,000 rows - several screens were quietly showing incomplete data. Fixed across the app in one pass.
- **A browser-freezing regression**, introduced by the row-cap sweep above, found and fixed the same session.

## September 2026

- **Real per-message WhatsApp channel misattribution** - which of the two numbers (3903 or 6541) a message actually came in on was not being tracked correctly, then two more corrections needed on the same fix.
- **Why Badar saw the old Inbox design while Hanzala saw the new one** - not a role bug at all. Root cause: a browser tab left open across a deploy keeps running the old page forever, since an open tab never re-fetches on its own. Fixed with a build-freshness check that offers a reload banner to any signed-in user.
- **6541 was quietly built into live routing when it was only ever meant for chatbot testing** - traced the real history and formally separated "live" (3903) from "test" (6541) everywhere in the app.
- **A stale WhatChimp import had swept in real staff members' own phone numbers as fake customer leads.** Every failed notification sent TO an agent (Ehsan, 1,107 times; Muhammad's own test number, 348 times; Bilal, 7 times) was being misfiled as a fake "[DELIVERY FAILED]" customer message on that stale lead.
- **A genuine race condition in lead creation** - two messages arriving within the same second for a brand-new phone number could each create their own duplicate lead. Found 18 real cases, merged them, and closed the race with a database-level unique constraint so it cannot happen again.
- **Avatar initials broke on a name starting with an emoji**, showing an unreadable glyph instead of a real initial.
- **Unsupported image messages showed the literal type name** ("[unsupported message type: image]") instead of a proper description, even though the image itself displayed fine.
- **The Omnichannel sidebar appeared to "restart" every 5 to 10 seconds** under real traffic. Not a backend script - the conversation list was correctly reacting to every new message, but wiping itself to "Loading..." before every single re-render.
- **A real regression I introduced fixing the bug above**: the parallel-batch rewrite of a shared data-fetch helper could get stuck permanently on "-" placeholders once a lead count crossed a batch boundary the wrong way. Found and fixed the same day.
- **Agents could not attach anything except JPG, PNG or PDF** in the Inbox composer - a front-end restriction with nothing behind it, since the backend already supported any file type.
- **A real "Not signed in" send failure** - an agent's session could go stale while the rest of the app still looked fully logged in, and the first send after that would fail with a confusing error. Now auto-recovers with a silent session refresh.
- **Clicking to enlarge a photo opened a blank black screen** - the enlarge action was reusing a signed link that only lives 5 minutes, so any photo clicked more than 5 minutes after opening the conversation pointed at an already-dead link.
- **The 24-hour countdown timer could freeze on a stale value** if the browser tab was in the background - Chrome throttles background-tab timers, so the display could show wrong information indefinitely.
- **Customer reactions loaded once when a conversation opened, with no live updates** - a reaction sent while the conversation was already open never appeared until it was reopened. Root cause was two-layered: the table was never enabled for realtime, and reaction removal needed a database setting most tables here do not need.
- **"Restore hidden messages" had no scope at all** - the button visibly said "3 messages hidden" for one conversation, but clicking it silently un-hid every message the agent had ever hidden across every conversation.
- **A conversation's entire message history had no row limit**, the same silent-1,000-row-cap bug class as above - a long-running conversation would eventually have its newest messages silently cut off with no error shown.
- **Every agent's send started throwing "Assignment to constant variable"** the moment a new Financial Ledger feature shipped the same day - traced, reproduced, and fixed same-day.
- **Reports' Monthly Trend chart showed zero leads for the current month** - the same unbounded-read/1,000-row-cap bug class, this time on the page Badar is shown directly.
- **Every real user's password reset link redirected to a broken local address** (`127.0.0.1:3000`) instead of the live CRM - the project's Auth configuration had never been updated from its local-development default. Found from Farwa's own screenshot, confirmed against the live Auth service directly, and fixed.
- **Every delivery-status callback (sent/delivered/read/failed) for the real 3903 channel was being silently discarded**, project-wide, on the false assumption that 3903 "never sends anything" - agents actually send real messages, including every voice note, straight through 3903. Traced from Faisal's report that clients weren't receiving voice notes: 100% of outbound voice notes had a real WhatsApp message id but zero ever got a delivery status, so a genuine failure would have been invisible either way. Fixed so both numbers' statuses are processed, and a resulting "[DELIVERY FAILED]" note is now tagged with the channel it actually failed on instead of always defaulting to 6541.

---

Not a bug, but worth noting for context: the Meta Ads Performance widget's "403 Forbidden" error is a real, ongoing issue, but it lives in Meta's own Business Settings (a missing permission grant), not in this CRM's code.
