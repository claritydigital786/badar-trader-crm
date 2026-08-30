// Recognises an impatient "are you there?" style follow-up, and decides how
// the bot should answer one - the same combined/full answer the first time,
// a short distinct acknowledgement every time after that.
//
// WHY THIS EXISTS
//
// Muhammad's own real test, 2026-08-30 ("Trade Campus" thread, an employee's
// phone): asked "course", got no reply (the reply-cap bug fixed the same
// day), then sent "Are you still there? I need an answer" and "Is anybody
// there?" back to back. Both landed as one combined answer, which was right
// - but there was no actual rule making that happen, and a THIRD nudge right
// after would have triggered the exact same OpenAI call and the exact same
// full-length reply again, which reads as robotic repetition, not patience.
//
// Muhammad's instruction: messages that are all "pointed at the one query"
// should be answered once, however many were sent - that already happens
// naturally, because the bot answers per inbound turn using the full
// conversation history, and Meta essentially never splits one customer's
// fast burst across separate webhook deliveries. What did NOT already exist
// is rule two: once that one combined answer has gone out, any FURTHER nudge
// of the same "still waiting" nature should get something short and visibly
// different, not the same script replayed.

// Recognises "still waiting" nudges - deliberately narrow (impatience only,
// not "any short message") so a real new question never gets misread as a
// nudge and short-changed with a one-liner.
const NUDGE_PATTERNS = [
  /\bare\s+you\s+(there|around|online)\b/i,
  /\banyone\s+there\b/i,
  /\banybody\s+there\b/i,
  /\bstill\s+there\b/i,
  /\bhello+\s*\?*$/i,
  /\bhi+\s*\?+$/i,
  /\bneed\s+an?\s+answer\b/i,
  /\bwaiting\s+for\s+(a\s+)?(an\s+)?(reply|response|answer)\b/i,
  /\bany\s*(update|response|reply)\b/i,
  /\bkoi\s+hai\b/i,
  /\bkahan\s+ho\b/i,
  /\bjawab\s+(do|dena|dein|chahiye)\b/i,
  /\bkoi\s+jawab\b/i,
  /\bsun\s+rahe\s+(ho|hain)\b/i,
];

/** @param {string} text @returns {boolean} */
export function isImpatienceNudge(text) {
  const t = (text ?? "").trim();
  if (!t) return false;
  // A long message is a real question even if it happens to contain one of
  // the shorter trigger phrases - keep this to genuinely short nudges.
  if (t.length > 60) return false;
  return NUDGE_PATTERNS.some((re) => re.test(t));
}

// Kept short and varied on purpose - the whole point is to not read as the
// same canned line every time. Never identifies itself as AI, a bot, or a
// "support assistant" - see the AI system prompt for the same rule applied to
// its own free-form answers.
export const NUDGE_SHORT_REPLIES_EN = [
  "Still with you, just a bit more patience please.",
  "Yes, I'm here. Someone will get back to you shortly.",
  "I hear you. Hang tight, this is being looked at.",
];
export const NUDGE_SHORT_REPLIES_UR = [
  "Ji main yahan hoon, bas thodi si sabar karein.",
  "Haan ji, hamari team jald aap se raabta kare gi.",
  "Sun raha hoon, thora sa intezaar karein, aap ka masla dekha ja raha hai.",
];

/**
 * @param {"en"|"ur"} lang
 * @returns {string}
 */
export function pickNudgeShortReply(lang) {
  const pool = lang === "ur" ? NUDGE_SHORT_REPLIES_UR : NUDGE_SHORT_REPLIES_EN;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * @param {{ isNudge: boolean, alreadyAnsweredSinceEscalation: boolean }} args
 * @returns {"full" | "short" | "normal"} "normal" means this isn't a nudge at
 *   all and the caller should just run its usual reply path. "full" means
 *   it's the first nudge of this wait, answer it properly. "short" means a
 *   nudge has already been answered once this wait - keep it brief.
 */
export function chooseNudgeReplyStyle({ isNudge, alreadyAnsweredSinceEscalation }) {
  if (!isNudge) return "normal";
  return alreadyAnsweredSinceEscalation ? "short" : "full";
}
