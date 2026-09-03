// Reports' "Monthly Trend - New Leads (Last 6 Months)" must count every lead in
// the window, including the month currently being lived in.
//
// Real production bug, found 2026-09-03 and verified against the live database
// before any code was touched. The chart read every lead in the six-month
// window with an unbounded `select('created_at')` ordered oldest-first, and
// PostgREST silently caps an unbounded read at 1,000 rows. All 7,866 leads sit
// inside that window, so the chart saw the OLDEST 1,000 and nothing else:
//
//     month     rendered     real
//     Jul           113       113
//     Aug           887     7,148
//     Sep             0       606     <- the current month, reported as zero
//
// Same truncation class as the Dashboard (2026-08-24), All Leads search
// (2026-08-25) and the Inbox message thread (2026-09-02). Fixed here with one
// head-only count per bucket, so the chart's six integers cost six tiny
// requests and no rows at all, whatever `leads` grows to.
//
// A second, latent bug was found in the same block and fixed with it: the
// bucket loop stepped the month back BEFORE pinning the date to the 1st, which
// overflows on a long day (see the 31 March case below).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const reports = html.slice(html.indexOf('async function loadReports'),
                           html.indexOf('function renderAgentPerformanceReport'));

const START = '  // Monthly trend - last 6 months from real data';
const END   = '  renderFinancialSummaryReport(';
const startAt = reports.indexOf(START);
// END also appears in the demo-mode branch further up, so search after START.
const block = reports.slice(startAt, reports.indexOf(END, startAt));
assert.ok(block.includes('renderMonthlyTrendChart'), 'the monthly trend block was located');

// ── Static: the truncating read is gone ────────────────────────
assert.ok(!/\.from\('leads'\)\.select\('created_at'\)/.test(block),
  'the unbounded row read must be gone - it is what PostgREST truncated at 1,000');
assert.ok(/count: 'exact', head: true/.test(block),
  'the counts are head-only, so no lead row crosses the wire');
assert.ok(/\.or\(PRODUCTION_LEADS_OR_FILTER\)/.test(block),
  'bot-test traffic is excluded here like every other figure on this page');
assert.ok(/start\.setDate\(1\);\s*\n\s*start\.setMonth\(/.test(block),
  'the date is pinned to the 1st BEFORE the month is stepped back, or long days overflow');

// ── Behavioural: run the real shipped block, not a copy ────────
const run = new Function('sb', 'renderMonthlyTrendChart', 'PRODUCTION_LEADS_OR_FILTER', 'console', 'Date',
  `return (async () => {\n${block}\n})();`);

const FILTER = "wa_channel.is.null,wa_channel.neq.6541,created_at.lt.2026-09-02T00:00:00Z";

function fixedDate(iso) {
  const fixed = new Date(iso).getTime();
  return class extends Date {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  };
}

// One request per bucket, each one head-only, filtered, and half-open [start, end).
function stubSb(countFor, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const rec = { table };
      calls.push(rec);
      const chain = {
        select(cols, opts) { rec.select = cols; rec.opts = opts; return chain; },
        gte(col, val) { rec.gte = val; return chain; },
        lt(col, val) { rec.lt = val; return chain; },
        or(f) { rec.or = f; return chain; },
        then(res, rej) {
          const out = fail ? { count: null, error: { message: 'boom' } }
                           : { count: countFor(rec), error: null };
          return Promise.resolve(out).then(res, rej);
        },
      };
      return chain;
    },
  };
}

const quietConsole = { error() {}, warn() {}, log() {} };

// Local month of an ISO instant, in the PKT offset the boundaries are built in.
function monthKeyPkt(iso) {
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 7);
}

// The real production shape: leads only in Jul/Aug/Sep, with Aug far past the
// 1,000-row cap that used to swallow it.
{
  const real = { '2026-07': 113, '2026-08': 7148, '2026-09': 606 };
  const sb = stubSb(rec => real[monthKeyPkt(rec.gte)] || 0);
  let rendered = null;
  await run(sb, (labels, data) => { rendered = { labels, data }; }, FILTER, quietConsole,
            fixedDate('2026-09-03T12:00:00+05:00'));

  assert.deepEqual(rendered.labels, ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
    'six consecutive months ending with the current one');
  assert.deepEqual(rendered.data, [0, 0, 0, 113, 7148, 606],
    'every lead is counted - August is 7,148, not the 887 the 1,000-row cap left, ' +
    'and September is 606, not zero');
  assert.equal(sb.calls.length, 6, 'one head count per bucket, not one row read for the window');
  for (const rec of sb.calls) {
    assert.equal(rec.table, 'leads');
    assert.deepEqual(rec.opts, { count: 'exact', head: true }, 'head-only, zero rows transferred');
    assert.equal(rec.or, FILTER, 'bot-test traffic excluded on every bucket');
    assert.ok(rec.gte && rec.lt, 'each bucket is a half-open range, so no lead is double counted');
  }
  // Half-open and contiguous: each bucket ends exactly where the next begins.
  for (let i = 1; i < sb.calls.length; i++) {
    assert.equal(sb.calls[i - 1].lt, sb.calls[i].gte,
      'buckets tile the window with no gap and no overlap');
  }
}

// ── The 31st: the overflow that produced duplicate and missing months ──
{
  const sb = stubSb(() => 1);
  let rendered = null;
  await run(sb, (labels, data) => { rendered = { labels, data }; }, FILTER, quietConsole,
            fixedDate('2027-03-31T12:00:00+05:00'));
  assert.deepEqual(rendered.labels, ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
    'run on 31 March the months are still consecutive - the old order gave ' +
    'Oct,Dec,Dec,Jan,Mar,Mar, losing November and February entirely');
  assert.equal(new Set(rendered.labels).size, 6, 'no month appears twice');
}
{
  const sb = stubSb(() => 1);
  let rendered = null;
  await run(sb, (labels, data) => { rendered = { labels, data }; }, FILTER, quietConsole,
            fixedDate('2027-05-31T12:00:00+05:00'));
  assert.deepEqual(rendered.labels, ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'],
    'and on 31 May, where the old order gave Dec,Jan,Mar,Mar,May,May');
}

// ── A failed count is not rendered as a real zero ──────────────
{
  const sb = stubSb(() => 0, { fail: true });
  let rendered = null;
  await run(sb, (labels, data) => { rendered = { labels, data }; }, FILTER, quietConsole,
            fixedDate('2026-09-03T12:00:00+05:00'));
  assert.deepEqual(rendered, { labels: [], data: [] },
    'a query error draws the empty state, never six honest-looking zero bars');
}

console.log('reports-monthly-trend-test: all assertions passed');
