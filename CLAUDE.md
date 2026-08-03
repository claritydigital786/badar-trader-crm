# Start here, every session

This is the Badar Trader CRM project. Muhammad and his brother Junaid both work on it, from separate laptops, sharing one Google/GitHub login.

**Before doing anything else, read `HANDOFF.md` in this repo.** It is the single source of truth for what's been built, what's in progress, what's still open, and who's working on what right now (see its "Active Work Claims" section). Personal memory files do not travel between machines - `HANDOFF.md` and git history are what actually carry state across laptops and accounts.

If the user says "continue" with no other context: read `HANDOFF.md`, check "Active Work Claims" for anything already claimed by the other person, and pick up from the most recent entry. Ask the user to clarify only if it's genuinely ambiguous which piece of work they mean.

Standing rules that apply everywhere in this repo, not just in one session:
- No em dashes, anywhere, ever - user-facing text, code, comments, docs. Use a plain hyphen or restructure the sentence.
- No emojis unless explicitly requested, except where the existing product design already uses them intentionally (e.g. WhatsApp bot copy emoji were deliberately removed - do not reintroduce).
- `git pull origin main` before trusting any local file or prior "done" claim - GitHub and the live Supabase project are the only real source of truth, not any one laptop.
- Verified code changes (compiles clean, tested locally where feasible) can be committed and deployed without asking each time. Sending messages on the user's behalf, destructive/irreversible operations, and anything touching money or financial credentials always still get confirmed first.
- Never say something is "fixed" or "live" without actually checking - grep the deployed code / reload the page / query the database. A HANDOFF.md note saying something was done is not itself proof.
