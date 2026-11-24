#!/usr/bin/env node
// Play topics in the demo site's LIVE player (live-demo-site skill) in real
// Chrome and say which finished: the proof that every feature script still
// runs in a viewer's browser against the demo app. It drives the player only
// through its own panel and cards, as a person would.
//
//   node live-check.mjs --site=http://localhost:4292/            every topic, 2x
//   node live-check.mjs --site=... --fast                         the quick re-run's pace (?check)
//   node live-check.mjs --site=... --only=f03,f06,f03 --shots=DIR [--every=4]
//   node live-check.mjs --site=https://demo.example.com/ --credentials=FILE   (a "user password" file, never printed)
//   node live-check.mjs --site=... --headed --speed=1
//
// Options: --features=DIR (default ./features), --store-key=demo (config.storeKey), --viewport=1440x900 --dpr=2 (a
// HiDPI laptop; also try 1280x720 --dpr=1, a projector), --playwright=DIR (a
// package.json whose node_modules has @playwright/test; default this folder).
// Every play makes its own demo data: reset the demo database after.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return dflt;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : true;
};
const { chromium } = createRequire(join(resolve(String(flag('playwright', HERE))), 'package.json'))('@playwright/test');
const target = { site: String(flag('site', 'http://localhost:4292/')).replace(/\/?$/, '/'), credentials: flag('credentials') ? resolve(String(flag('credentials'))) : null };
const [vw, vh] = String(flag('viewport', '1440x900')).split('x').map(Number);
const dpr = Number(flag('dpr', 2));
const speed = String(flag('speed', 2));
const fast = !!flag('fast');
const shots = flag('shots') ? resolve(String(flag('shots'))) : null;
const every = Number(flag('every', 4)) * 1000;
if (shots) mkdirSync(shots, { recursive: true });

const keys = readdirSync(resolve(String(flag('features', join(HERE, 'features'))))).filter((f) => /^f\d\d-.*\.mjs$/.test(f)).sort().map((f) => f.slice(0, 3));
const only = flag('only') ? String(flag('only')).split(',') : keys;
// The credential is read into this process and never printed.
const credentials = target.credentials
  ? (() => {
      const [username, password] = readFileSync(target.credentials, 'utf8').trim().split(/\s+/);
      return { username, password };
    })()
  : undefined;

const browser = await chromium.launch({ channel: 'chrome', headless: !flag('headed') });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, locale: 'th-TH', timezoneId: 'Asia/Bangkok', httpCredentials: credentials });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
// A console "Failed to load resource" names no address: the response does.
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });

await page.goto(target.site);
// The player keeps its settings under config.storeKey (default 'demo').
await page.evaluate(([k, s]) => localStorage.setItem(`${k}-speed`, s), [String(flag('store-key', 'demo')), speed]);
const results = [];
// A topic that fails is played once more: a pass the second time is reported
// FLAKY, never hidden (the first play after a server start is often slow).
async function play(key) {
  const t0 = Date.now();
  errors.length = 0;
  await page.goto(`${target.site}${fast ? '?check' : ''}#${key}`);
  await page.reload();
  await page.locator('#card .actions .btn.primary').click();
  let verdict = null, shot = 0, next = Date.now() + 1500;
  while (!verdict) {
    if (Date.now() - t0 > 8 * 60_000) verdict = { ok: false, why: 'still running after 8 minutes' };
    const title = await page.locator('#card-wrap:not([hidden]) #card h2').textContent({ timeout: 200 }).catch(() => null);
    if (title?.startsWith('จบหัวข้อ')) verdict = { ok: true };
    else if (title === 'หัวข้อนี้ทำต่อไม่ได้') verdict = { ok: false, why: (await page.locator('#card').innerText()).replace(/\s+/g, ' ') };
    if (shots && Date.now() > next) {
      await page.screenshot({ path: join(shots, `${key}-${String(++shot).padStart(2, '0')}.png`) });
      next = Date.now() + every;
    }
    if (!verdict) await page.waitForTimeout(250);
  }
  if (shots) await page.screenshot({ path: join(shots, `${key}-end.png`) });
  const secs = Math.round((Date.now() - t0) / 1000);
  const steps = await page.locator('#stepList .item').count();
  return { key, ...verdict, secs, steps, errors: [...errors] };
}
for (const key of only) {
  let r = await play(key);
  if (!r.ok) {
    const first = r;
    r = await play(key);
    if (r.ok) r = { ...r, flaky: first.why };
  }
  results.push(r);
  const label = r.ok ? (r.flaky ? 'FLAKY' : 'PASS') : 'FAIL';
  const why = r.flaky ? `  first try: ${r.flaky.slice(0, 300)}` : r.why ? `  ${r.why.slice(0, 400)}` : '';
  console.log(`${label} ${key} ${r.secs}s ${r.steps} steps${why}${r.errors.length ? `  [${r.errors.length} errors: ${[...new Set(r.errors)].join(' | ').slice(0, 300)}]` : ''}`);
}
await browser.close();
const failed = results.filter((r) => !r.ok).length;
const flaky = results.filter((r) => r.flaky).length;
console.log(`\n${results.length - failed}/${results.length} topics finished${flaky ? `, ${flaky} only on a second try` : ''}${fast ? ' (fast)' : ` (speed ${speed}x)`}`);
process.exit(failed ? 1 : 0);
