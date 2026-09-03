// Supabase test double. Serves a configurable number of synthetic conversations
// through genuine .range() paging, and records every page request so a test can
// assert which windows were actually fetched.
(function () {
  const TOTAL = Number(new URLSearchParams(location.search).get('n') || 2875);
  const CONVS = Array.from({ length: TOTAL }, (_, i) => ({
    lead_id: 'lead-' + String(i).padStart(5, '0'),
    type: 'whatsapp', body: 'message body ' + i,
    direction: i % 2 ? 'inbound' : 'outbound',
    created_at: new Date(Date.now() - i * 60000).toISOString(),
    full_name: 'Person ' + i, phone: '+92300' + String(i).padStart(7, '0'),
    status: 'new', is_unread: i % 3 === 0, bot_stage: 'awaiting_menu',
    needs_human: false, handoff_reason: '', manual_tier: null, language: 'en',
    wa_channel: i % 2 ? '3903' : null, tier: 'new', priority: 10,
  }));
  const ROLE = new URLSearchParams(location.search).get('role') || 'super_admin';
  const PROFILE = { id: 'u1', full_name: 'Test User', email: 't@x.com',
                    role: ROLE, is_suspended: false, created_at: '2026-01-01T00:00:00Z' };
  window.__log = { pages: [] };
  window.__convs = CONVS;

  function builder(table) {
    const st = { table, from: 0, to: null, filters: [], single: false };
    const base = () => table === 'inbox_conversation_list' ? CONVS
               : table === 'profiles' ? [PROFILE] : [];
    const api = {
      select() { return api; }, order() { return api; },
      eq(c, v) { st.filters.push([c, v]); return api; },
      is() { return api; }, not() { return api; }, gte() { return api; },
      or() { return api; }, in() { return api; }, neq() { return api; },
      limit(n) { if (st.to === null) st.to = st.from + n - 1; return api; },
      range(a, b) { st.from = a; st.to = b; return api; },
      single() { st.single = true; return api; },
      maybeSingle() { st.single = true; return api; },
      insert() { return api; }, update() { return api; }, delete() { return api; },
      then(res) {
        let rows = base();
        for (const [c, v] of st.filters) rows = rows.filter(r => String(r[c]) === String(v));
        const total = rows.length;
        const hi = st.to === null ? total - 1 : st.to;
        const page = rows.slice(st.from, hi + 1);
        if (table === 'inbox_conversation_list') {
          window.__log.pages.push({ from: st.from, to: hi, returned: page.length });
        }
        return Promise.resolve(res({ data: st.single ? (page[0] || null) : page, error: null, count: total }));
      },
    };
    return api;
  }

  window.supabase = {
    createClient: () => ({
      from: builder,
      rpc: () => Promise.resolve({ data: {
        all: TOTAL, new: TOTAL, warm: 0, hot: 0, qualified: 0, closed: 0,
        unread: 0, awaiting: 0, needshuman: 0,
        chan_all: TOTAL, chan_3903: 0, chan_6541: 0, chan_untagged: TOTAL, chan_other: 0,
      }, error: null }),
      channel: () => { const ch = { on: () => ch, subscribe: () => ch, state: 'joined' }; return ch; },
      removeChannel: () => {},
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1', email: 't@x.com' } } } }),
        onAuthStateChange: () => {},
        refreshSession: () => Promise.resolve({ data: {}, error: null }),
        signOut: () => Promise.resolve({}),
      },
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: 'stub' }) }) },
    }),
  };
})();
