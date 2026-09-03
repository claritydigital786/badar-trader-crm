// The account menu's theme item names its destination, not its mechanism.
//
// It read "Toggle Theme" from 2026-08-03 until Muhammad asked why on
// 2026-09-05. "Toggle" is developer vocabulary, and unlike "Log Out" sitting
// directly beneath it, the label told an agent neither what would change nor
// which way it would go. It now reads "Switch to Light Mode" while the app is
// dark and "Switch to Dark Mode" while it is light.
//
// The real risk this guards is a stale label rather than a wrong one: the text
// is only correct while something keeps it in step with the live theme, so the
// update has to run on a theme change, on load (a saved preference can be
// either theme), and when the menu opens (another tab may have changed it).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
// Comments are stripped where the check is about what a user can actually see -
// a comment recording the old name is history, not a label. HTML comments count
// too: the agent dashboard's own AUM rename comment cites "Toggle Theme" as the
// precedent for it, and that is prose about a decision, not anything rendered.
const visible = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('the jargon label is gone from every menu', () => {
  assert.ok(!/Toggle Theme/.test(visible), '"Toggle Theme" must not survive in anything rendered');
  // Both shells carry it - admin/super-admin and agent - and both are covered.
  const labels = html.match(/<span class="theme-switch-label">[^<]*<\/span>/g) || [];
  assert.equal(labels.length, 2, 'the admin and agent menus each have a label');
  for (const l of labels)
    assert.match(l, /Switch to (Light|Dark) Mode<\/span>/, 'the markup default names a destination');
  assert.equal((html.match(/id="account-menu-(admin|agent)"/g) || []).length, 2,
    'and there are exactly two account menus to keep in step');
});

test('the label names the theme being switched TO, not the one in use', () => {
  const fn = block('function updateThemeSwitchLabels', 'function toggleTheme');
  assert.match(fn, /getAttribute\('data-theme'\) === 'dark'/, 'it reads the live theme');
  assert.match(fn, /dark \? 'Switch to Light Mode' : 'Switch to Dark Mode'/,
    'dark offers light and light offers dark - naming the current theme would invert the meaning');
  assert.match(fn, /querySelectorAll\('\.theme-switch-label'\)/,
    'every menu is updated, so the two shells can never disagree');
});

test('nothing can leave the label describing the theme already in use', () => {
  // On a theme change.
  const toggle = block('function toggleTheme', '(function initTheme()');
  assert.match(toggle, /updateThemeSwitchLabels\(\);/, 'switching updates the label');
  assert.ok(toggle.indexOf("setAttribute('data-theme', next)") < toggle.indexOf('updateThemeSwitchLabels()'),
    'the label is refreshed after the theme changes, not before');
  // On load, where a saved preference can be either theme.
  const init = block('(function initTheme()', 'function toggleAccountMenu');
  assert.match(init, /updateThemeSwitchLabels\(\);/,
    'a restored light preference must not leave the markup default in place');
  // On open, catching a change made in another tab.
  const menu = block('function toggleAccountMenu', 'document.addEventListener');
  assert.match(menu, /if \(opening\) updateThemeSwitchLabels\(\);/,
    'opening the menu re-checks, so a second tab cannot leave it stale');
});

test('the switch itself is unchanged - this was a wording change only', () => {
  const toggle = block('function toggleTheme', '(function initTheme()');
  assert.match(toggle, /localStorage\.setItem\('bt-theme', next\)/, 'the preference is still saved');
  assert.match(toggle, /renderDashboardCharts\(_lastDashSummary\)/,
    'Chart.js still gets its explicit re-render - its colours are baked into a canvas');
  const init = block('(function initTheme()', 'function toggleAccountMenu');
  assert.match(init, /const theme = saved \|\| 'dark';/, 'dark is still the default for a first-time visitor');
});
