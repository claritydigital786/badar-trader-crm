// Runs the REAL reactionPayloadOf() and handleReactionMessage() out of
// whatsapp-webhook/index.ts, rather than a paraphrase of them, against an
// in-memory Supabase stub. Extracting the source text and evaluating it means
// a change to the webhook that breaks these behaviours breaks the tests too.
import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../supabase/functions/whatsapp-webhook/index.ts', import.meta.url), 'utf8');

function fnSource(name, endMarker) {
  let start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in whatsapp-webhook/index.ts`);
  // Back up over a preceding `async ` - indexOf('function x(') lands after it
  // and would silently drop the keyword, turning every await into a syntax
  // error in the generated module.
  if (SRC.slice(start - 6, start) === 'async ') start -= 6;
  const end = SRC.indexOf(endMarker, start);
  if (end < 0) throw new Error(`end marker for ${name} not found`);
  return SRC.slice(start, end);
}

// Strip the TypeScript annotations these two functions carry. Deliberately
// narrow: only the parameter/return types actually present here.
// Rather than hand-stripping TypeScript (fragile, and order-dependent), the
// extracted functions are written to a real .ts module and imported. Node 22
// strips the types itself, so what runs here is the actual annotated source
// from the webhook, unedited.
const GEN = new URL('./.generated_reactions.ts', import.meta.url);
writeFileSync(GEN, [
  'type SupabaseClient = any;',
  'export let upsertLead: any;',
  'export function __setUpsertLead(f: any) { upsertLead = f; }',
  fnSource('reactionPayloadOf', '\nasync function handleReactionMessage'),
  fnSource('handleReactionMessage', '\n// Records an inbound message the bot cannot act on'),
  'export { reactionPayloadOf, handleReactionMessage as _handleReactionMessage };',
].join('\n\n'), 'utf8');

const mod = await import(GEN.href + '?v=' + Date.now());

export const store = {
  communications: [],
  reactions: [],
  leads: [],
  logs: [],
  fail: { targetLookup: false, upsert: false, leadUpsert: false },
};

export function reset({ communications = [], leads = [], reactions = [] } = {}) {
  store.communications = JSON.parse(JSON.stringify(communications));
  store.leads = JSON.parse(JSON.stringify(leads));
  store.reactions = JSON.parse(JSON.stringify(reactions));
  store.logs = [];
  store.fail = { targetLookup: false, upsert: false, leadUpsert: false };
}

const tableOf = (n) => n === 'communications' ? store.communications
  : n === 'communication_customer_reactions' ? store.reactions
  : store.leads;

function makeSb() {
  return {
    from(name) {
      const eqs = [];
      const ltes = [];
      let op = null, payload = null, conflict = null;
      const rows = () => tableOf(name).filter(r =>
        eqs.every(([k, v]) => r[k] === v) &&
        ltes.every(([k, v]) => new Date(r[k]).getTime() <= new Date(v).getTime()));
      const api = {
        select() { return api; },
        eq(k, v) { eqs.push([k, v]); return api; },
        lte(k, v) { ltes.push([k, v]); return api; },
        limit() { return api; },
        async maybeSingle() {
          if (name === 'communications' && store.fail.targetLookup) {
            return { data: null, error: { message: 'forced lookup failure' } };
          }
          return { data: rows()[0] ?? null, error: null };
        },
        upsert(p, opts) { op = 'upsert'; payload = p; conflict = opts?.onConflict; return api; },
        delete() { op = 'delete'; return api; },
        then(res, rej) { return api._run().then(res, rej); },
        async _run() {
          if (op === 'upsert') {
            if (store.fail.upsert) return { data: null, error: { message: 'forced upsert failure' } };
            const t = tableOf(name);
            const existing = t.find(r => r[conflict] === payload[conflict]);
            if (existing) Object.assign(existing, payload);
            else t.push({ id: 'r-' + (t.length + 1), created_at: payload.reacted_at, ...payload });
            return { data: null, error: null };
          }
          if (op === 'delete') {
            const doomed = new Set(rows());
            const t = tableOf(name);
            for (let i = t.length - 1; i >= 0; i--) if (doomed.has(t[i])) t.splice(i, 1);
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return api;
    },
  };
}

mod.__setUpsertLead(async (_sb, phone) => {
  if (store.fail.leadUpsert) return { lead: null };
  let lead = store.leads.find(l => l.phone === phone);
  if (!lead) { lead = { id: 'lead-' + (store.leads.length + 1), phone }; store.leads.push(lead); }
  return { lead };
});

export const reactionPayloadOf = mod.reactionPayloadOf;

// The real handler logs through console when it deliberately does nothing
// (unknown target, failed lookup), and a test needs to assert on that. The
// capture is scoped to the call itself so it never swallows the test's own
// output, and is restored even if the handler throws.
export async function handleReactionMessage(message, phone, name, ts, channel) {
  const realLog = console.log, realErr = console.error;
  console.log = (...a) => store.logs.push(a.join(' '));
  console.error = (...a) => store.logs.push('ERROR ' + a.join(' '));
  try {
    return await mod._handleReactionMessage(makeSb(), message, phone, name, ts, channel);
  } finally {
    console.log = realLog; console.error = realErr;
  }
}
export { SRC as WEBHOOK_SRC };
