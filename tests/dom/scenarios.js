// Inbox paging + realtime scenarios, run in a REAL browser against the harness.
// Paste into the page console (or drive with a browser tool) after opening the
// Inbox. Returns a results object; every `ok` must be true.
//
// These exist because the 2026-09-05 regression shipped past a full suite of
// static regex assertions: those proved the source CONTAINED `.range(...)`, not
// that scrolling a laid-out list produced page 2, and they never exercised
// realtime and paging together - which is precisely where the bug was.
window.inboxScenarios = async function (scope = '') {
  const el = document.getElementById(scope + 'conv-list');
  const st = convPaging(scope);
  const rows = () => el.querySelectorAll('.conv-item').length;
  const settle = async () => { while (st.loading) await new Promise(r => setTimeout(r, 20)); };
  const R = [];
  const check = (name, ok, detail) => R.push({ name, ok, ...detail });

  await renderConversations(scope); await settle();
  check('1. first page renders 75', rows() === 75, { rows: rows() });

  await loadMoreConversations(scope); await settle();
  check('2. scroll/observer loads page 2', rows() === 150 && st.pageIndex === 1, { rows: rows() });

  await loadMoreConversations(scope); await settle();
  check('3. page 3 appends', rows() === 225 && st.pageIndex === 2, { rows: rows() });

  el.scrollTop = 9000;
  const beforeTop = el.scrollTop;
  const anchorBefore = (convViewportAnchor(el) || {}).leadId;
  applyConvRealtimeRow('lead-00500', scope);
  await new Promise(r => setTimeout(r, 1200)); await settle();
  check('4. realtime keeps depth', rows() === 225 && st.pageIndex === 2, { rows: rows(), idx: st.pageIndex });
  check('5. realtime keeps scroll position', Math.abs(el.scrollTop - beforeTop) < 80,
        { before: beforeTop, after: el.scrollTop });
  check('6. realtime keeps viewport anchor', (convViewportAnchor(el) || {}).leadId === anchorBefore, {});

  await loadMoreConversations(scope); await settle();
  check('7. paging continues after realtime', rows() === 300, { rows: rows() });

  reconcileConversations(scope); await new Promise(r => setTimeout(r, 1200)); await settle();
  check('8. resubscribe keeps depth', rows() === 300, { rows: rows() });

  const ids = [...el.querySelectorAll('.conv-item')].map(n => n.dataset.lead);
  check('9. no duplicates', ids.length === new Set(ids).size, { rendered: ids.length });

  // The open conversation is pinned through a reconcile when it sits outside
  // the reloaded range - the Financial Ledger case, where a row is injected so
  // the agent can see the chat they were sent to. This shipped broken on
  // 2026-09-05: `rows` was declared const and the pin reassigned it, so EVERY
  // reconcile threw "Assignment to constant variable". Reported from production
  // by Muhammad - agents saw "Could not refresh conversations" on every send,
  // because sending calls reconcileConversations(). A static suite cannot catch
  // this; only running the function does.
  {
    const injected = { lead_id: 'lead-pinned-test', type: 'whatsapp', body: 'from the ledger',
      direction: 'inbound', created_at: new Date().toISOString(),
      leads: { full_name: 'Ledger Person', phone: '+920000000000', status: 'new' } };
    const heldRows = st.rows;
    const heldActive = _activeConvId;
    st.rows = [injected].concat(st.rows);
    _activeConvId = 'lead-pinned-test';
    let toast = null;
    const realToast = window.showToast;
    window.showToast = (m) => { toast = m; };
    await loadConvPage(scope, { reconcile: true }); await settle();
    window.showToast = realToast;
    const pinnedIds = [...el.querySelectorAll('.conv-item')].map(n => n.dataset.lead);
    check('16. reconcile with a pinned open row does not throw', toast === null, { toast });
    check('17. the open conversation survives the reconcile',
          pinnedIds[0] === 'lead-pinned-test', { first: pinnedIds[0] });
    check('18. pinning introduces no duplicate rows',
          pinnedIds.length === new Set(pinnedIds).size, { rendered: pinnedIds.length });
    _activeConvId = heldActive;
    st.rows = heldRows;
    await loadConvPage(scope, { reconcile: true }); await settle();
  }

  // A genuine dataset change MUST reset - that is the only correct reset.
  const search = document.getElementById(scope + 'conv-search-input');
  if (search) {
    search.value = 'Person 12'; filterConversations(scope);
    await new Promise(r => setTimeout(r, 600)); await settle();
    check('10. search resets to page 1', st.pageIndex === 0, { idx: st.pageIndex });
    search.value = ''; filterConversations(scope);
    await new Promise(r => setTimeout(r, 600)); await settle();
    check('11. clearing search resets and pages again', st.pageIndex === 0, { idx: st.pageIndex });
  }

  // Reachability: drive the real mechanism to exhaustion.
  let guard = 0;
  while (st.hasMore && guard++ < 400) { await loadMoreConversations(scope); await settle(); }
  const all = [...el.querySelectorAll('.conv-item')].map(n => n.dataset.lead);
  const distinct = new Set(all);
  check('12. every conversation reachable', distinct.size === window.__convs.length,
        { reached: distinct.size, total: window.__convs.length });
  check('13. no duplicates at full depth', all.length === distinct.size, { rendered: all.length });
  check('14. hasMore false only at the real end', st.hasMore === false, {});
  check('15. sentinel removed at the end', !document.getElementById(scope + 'conv-more'), {});

  return { scope, pass: R.every(r => r.ok), results: R };
};
