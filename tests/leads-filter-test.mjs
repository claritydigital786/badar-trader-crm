// All Leads filter bar - behaviour, not just presence.
//
// The filter helpers live inline in index.html like the rest of the CRM, so
// this test lifts the pure ones out and runs them for real rather than only
// grepping for their source. Everything stateful (the DOM reads, the Supabase
// query) stays out of scope here and is covered by the browser pass instead.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// ── Lift the pure filter helpers out of index.html ───────────────────────────
const start = html.indexOf('const LEAD_FILTER_UNASSIGNED');
const end   = html.indexOf('function updateLeadsFilterSummary');
assert.ok(start > 0 && end > start, 'The All Leads filter helper block must exist in index.html.');
const src = html.slice(start, end);

const sandbox = {
  // Only the label helpers the chip builder reaches for, stubbed to their real shapes.
  statusLabel: s => ({ new: 'New', converted: 'Converted', qualified: 'Qualified' }[s] || s),
  sourceLabel: s => ({ meta: 'Meta Ads', manual: 'Manual' }[s] || s),
  cachedProfiles: [{ id: 'a1', full_name: 'Ahmed Ali' }],
  document: { getElementById: () => null },
};
vm.createContext(sandbox);
// Top-level `const` in a vm script stays in the script's own scope rather than
// landing on the context object, unlike a function declaration - so the one
// constant this test needs is handed over explicitly.
vm.runInContext(src + '\nthis.LEAD_FILTER_UNASSIGNED = LEAD_FILTER_UNASSIGNED;', sandbox);
const { leadMatchesFilters, leadFiltersActive, leadDateSince,
        LEAD_FILTER_UNASSIGNED } = sandbox;
// Arrays built inside the vm context carry that realm's prototype, which
// deepEqual under assert/strict rejects - copy into a host array first.
const leadFilterChips = f => Array.from(sandbox.leadFilterChips(f));

const NO_FILTER = { status:'', agent:'', source:'', human:'', date:'', search:'' };
const f = over => ({ ...NO_FILTER, ...over });
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

const lead = over => ({
  full_name: 'Test Lead', phone: '+971500000000', email: 'test@example.com',
  status: 'new', source: 'meta', assigned_agent_id: 'a1', needs_human: false,
  created_at: daysAgo(1), ...over,
});

// ── No filters means everything matches ──────────────────────────────────────
assert.equal(leadFiltersActive(NO_FILTER), false, 'An untouched filter bar is not an active filter.');
assert.equal(leadMatchesFilters(lead(), NO_FILTER), true, 'No filters must match every lead.');

// ── Status ───────────────────────────────────────────────────────────────────
assert.equal(leadMatchesFilters(lead({ status:'new' }),       f({ status:'new' })), true);
assert.equal(leadMatchesFilters(lead({ status:'converted' }), f({ status:'new' })), false);

// ── Agent, including the Unassigned case that had no way to be filtered ──────
assert.equal(leadMatchesFilters(lead({ assigned_agent_id:'a1' }), f({ agent:'a1' })), true);
assert.equal(leadMatchesFilters(lead({ assigned_agent_id:'a2' }), f({ agent:'a1' })), false);
assert.equal(
  leadMatchesFilters(lead({ assigned_agent_id:null }), f({ agent:LEAD_FILTER_UNASSIGNED })), true,
  'Unassigned must match a lead nobody owns.',
);
assert.equal(
  leadMatchesFilters(lead({ assigned_agent_id:'a1' }), f({ agent:LEAD_FILTER_UNASSIGNED })), false,
  'Unassigned must not match an assigned lead.',
);

// ── Source ───────────────────────────────────────────────────────────────────
assert.equal(leadMatchesFilters(lead({ source:'meta' }),   f({ source:'meta' })), true);
assert.equal(leadMatchesFilters(lead({ source:'manual' }), f({ source:'meta' })), false);

// ── Needs Human is a three-state filter, not a checkbox ──────────────────────
assert.equal(leadMatchesFilters(lead({ needs_human:true  }), f({ human:'1' })), true);
assert.equal(leadMatchesFilters(lead({ needs_human:false }), f({ human:'1' })), false);
assert.equal(leadMatchesFilters(lead({ needs_human:false }), f({ human:'0' })), true,
  'Bot handling must match a lead with no pending handoff.');
assert.equal(leadMatchesFilters(lead({ needs_human:true  }), f({ human:'0' })), false);
assert.equal(leadMatchesFilters(lead({ needs_human:true  }), NO_FILTER), true,
  'An empty handoff filter means all, bot and human alike.');

// ── Date added ───────────────────────────────────────────────────────────────
assert.equal(leadDateSince(''), null, 'Any time is not a date boundary.');
assert.equal(leadMatchesFilters(lead({ created_at:new Date().toISOString() }), f({ date:'today' })), true);
assert.equal(leadMatchesFilters(lead({ created_at:daysAgo(3)  }), f({ date:'today' })), false);
assert.equal(leadMatchesFilters(lead({ created_at:daysAgo(3)  }), f({ date:'7d'   })), true);
assert.equal(leadMatchesFilters(lead({ created_at:daysAgo(45) }), f({ date:'7d'   })), false);
assert.equal(leadMatchesFilters(lead({ created_at:daysAgo(45) }), f({ date:'90d'  })), true);

// ── Search covers the three fields the placeholder promises ──────────────────
for (const q of ['test lead', '0000000', 'test@example.com']) {
  assert.equal(leadMatchesFilters(lead(), f({ search:q })), true, `Search must match on "${q}".`);
}
assert.equal(leadMatchesFilters(lead(), f({ search:'nobody' })), false);

// ── Filters combine with AND, which is what the chips claim ──────────────────
const combo = f({ status:'new', source:'meta', human:'0' });
assert.equal(leadMatchesFilters(lead(), combo), true);
assert.equal(leadMatchesFilters(lead({ source:'manual' }), combo), false,
  'One non-matching filter is enough to exclude a lead.');
assert.deepEqual(leadFilterChips(combo), ['Status: New', 'Source: Meta Ads', 'Bot handling'],
  'Every active filter must be named in the summary, so an empty table is explainable.');
assert.deepEqual(leadFilterChips(f({ agent:LEAD_FILTER_UNASSIGNED, date:'7d', search:'ali' })),
  ['Unassigned', 'Added last 7 days', 'Search: "ali"']);
assert.deepEqual(leadFilterChips(NO_FILTER), [], 'No filters means no chips.');

// ── Static guards: the wiring the behaviour above depends on ─────────────────
assert.doesNotMatch(
  html,
  /renderLeadsTable\('admin-leads-tbody', cachedLeads, true\)/,
  'Inline edits must re-render through filterLeadsLocal, not around the filter.',
);
assert.match(
  html,
  /function exportLeadsCSV\(\)[\s\S]{0,400}leadMatchesFilters/,
  'Export CSV must export the rows on screen, not the whole cached set.',
);
assert.match(
  html,
  /function adminLeadsEmptyHtml[\s\S]{0,400}No leads match/,
  'An empty filtered table must say the filters matched nothing, not that no leads exist.',
);
assert.match(
  html,
  /badge\.textContent = _leadsTotalCount/,
  'The nav badge must show the unfiltered total, not the filtered subset.',
);

console.log('All Leads filter checks passed.');
