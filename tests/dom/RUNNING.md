# Real-DOM Inbox paging tests

Static assertions cannot prove that scrolling a laid-out list loads page 2, and
they cannot exercise realtime and paging together. The 2026-09-05 pagination
regression shipped past a green static suite for exactly that reason, so the
paging behaviour is verified in a real browser.

```bash
# 1. build an isolated harness (COPIES index.html; never modifies it)
node tests/dom/build-inbox-harness.mjs /tmp/inbox-harness

# 2. serve it (any static server, any free port)
python3 -m http.server 8914 --bind 127.0.0.1 --directory /tmp/inbox-harness
```

Open `http://127.0.0.1:8914/index.html?n=2875&role=super_admin`
(or `?n=430&role=agent` for the agent shell), then in the console:

```js
// paste tests/dom/scenarios.js first
adminTab('conversations', document.querySelector('#admin-tabs .nav-item[data-tab="conversations"]'));
await inboxScenarios('');          // '' = admin/super-admin shell
await inboxScenarios('agent-');    // agent shell
```

Every `ok` must be true. `n` sets how many conversations the stub serves, so the
final partial page and the `hasMore` transition are both exercised.

The harness never touches production credentials, the real database, or any
launch configuration - `stub.js` replaces the Supabase client entirely.
