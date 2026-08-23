// Decides whether handleUnmatched() should re-send the button prompt on THIS
// unmatched turn, or stay quiet and wait for the next one.
//
// WHY THIS EXISTS
// ---------------
// Muhammad's wife's real test, 2026-08-23: at a button stage she typed a
// genuine question ("Ya offer kya hai") instead of tapping a button. The bot
// replied with its "sorry, didn't understand" apology immediately followed by
// the exact same button prompt again, in one breath - she asked a question and
// was asked a question back. tryAIReply() already gets first refusal on every
// inbound message before handleUnmatched ever runs, so reaching this function
// at all means the AI already had nothing to say this turn - it cannot be
// asked again here. What handleUnmatched DOES control is whether it piles a
// second message on top of the apology.
//
// Recommendation logged in REMAINING_TODOS.md 2026-08-23 (option 1 of three,
// approved): on the customer's first unmatched turn at a stage, if what they
// sent was genuine free text - not a stray tap on a button that just didn't
// match anything - stay quiet on the prompt. Only re-show it if they are
// still stuck on their very next message. Escalation timing moves out by
// exactly one turn to make room for it (every handleUnmatched call site now
// passes limit=3, not 2).
//
// Pure and dependency-free so it is tested without a network or a database.
export function shouldSuppressRePrompt(input, retries) {
  const isFreeText = !input?.selectionId && (input?.text ?? "").trim().length > 0;
  return isFreeText && retries === 1;
}
