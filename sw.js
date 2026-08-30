// Badar Trader CRM - service worker
//
// Deliberately minimal: this exists ONLY to satisfy the browser's
// installability requirement for "Add to Home Screen" (Chrome/Android and
// most desktop browsers require an active service worker before offering an
// install prompt; iOS Safari does not require one but tolerates it fine).
//
// It does NOT cache the app shell, leads data, or any API response. This is
// a live CRM with real customer data and a bot that changes behavior day to
// day - an aggressive cache here could show an agent a stale build or,
// worse, stale conversation state. Every request is passed straight to the
// network; nothing is ever served from a cache. If real offline support is
// ever wanted, it needs a deliberate, carefully-scoped cache strategy, not
// this file grown ad hoc.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// No fetch handler at all: an absent handler means the browser falls back to
// its normal network request for everything, exactly as if this file did
// not exist for request purposes - only its presence (and install/activate)
// is what unlocks installability.
