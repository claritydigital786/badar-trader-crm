// Builds a runnable, isolated copy of the CRM whose Supabase client is a test
// double, so the Inbox's paging and realtime behaviour can be exercised in a
// REAL browser with real layout, real scrolling and a real IntersectionObserver.
//
// Why this exists: the Inbox paging regression of 2026-09-05 shipped past a
// suite of static regex assertions. Those proved the source CONTAINED
// `.range(...)` and a scroll handler; they could not prove that scrolling a
// laid-out list produced page 2, and they never exercised realtime and paging
// together - which is exactly where the bug was. Anything that claims
// conversations are reachable has to actually reach them.
//
//   node tests/dom/build-inbox-harness.mjs [outDir]
//
// Writes index.html (a COPY - the real one is never modified) plus stub.js, and
// prints the directory. Serve it over http and drive it; see RUNNING.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || join(here, '.out');
mkdirSync(outDir, { recursive: true });

const src = readFileSync(join(here, '..', '..', 'index.html'), 'utf8');
const harness = src
  .replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
           '<script src="stub.js"></script>')
  .replace('<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>', '');
writeFileSync(join(outDir, 'index.html'), harness);
writeFileSync(join(outDir, 'stub.js'), readFileSync(join(here, 'stub.js'), 'utf8'));
console.log(outDir);
