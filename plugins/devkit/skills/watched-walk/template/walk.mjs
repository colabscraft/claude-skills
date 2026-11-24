// walk.mjs - a minimal watched-walk runner (devkit `watched-walk` skill).
//
// Copy this folder into the project (for example qa/walk/), install
// @playwright/test 1.63+ in the project, write sections, run them with run.mjs.
// What it does, in the skill's words:
//   - narration drawn OVER the page with page.screencast (never in the DOM):
//     a chapter card per case, a step caption bottom-left, a verdict card
//     top-centre that clears, a summary card at the end;
//   - the screenshot is taken BEFORE the verdict card, named with the verdict;
//   - a crash inside a case renders as a red verdict, never as a stack trace;
//   - results.json beside the screenshots, one folder per run (labelled).
// What it does NOT do: sign in, seed data, read your database. Add those for
// your app (see README.md, "Make it yours").

import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const FONT = "font-family:system-ui,'Segoe UI','Noto Sans Thai',sans-serif;";
const COLOURS = { pass: '#15803d', fail: '#b91c1c', wait: '#a16207' };
const ICONS = { pass: '✅', fail: '❌', wait: '⏳' };

export { expect };

export class Walk {
  /**
   * @param o.base     the app's base URL (http://localhost:4200/)
   * @param o.headed   a visible browser; implies narrate
   * @param o.narrate  draw the narration (also headless, to check it)
   * @param o.pace     1 = normal; 2 = twice as slow for the watcher
   * @param o.label    names the run folder (control, headed, ...)
   * @param o.out      where run folders go
   * @param o.channel  'chrome' | 'msedge' | undefined (Playwright's own Chromium)
   */
  constructor(o) {
    this.base = o.base.replace(/\/?$/, '/');
    this.headed = !!o.headed;
    this.narrate = this.headed || !!o.narrate;
    this.pace = Number(o.pace ?? 1);
    this.delay = this.narrate ? 700 * this.pace : 0;
    this.hold = this.narrate ? 3500 * this.pace : 0;
    this.channel = o.channel;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.runDir = join(o.out ?? 'runs', `${stamp}${o.label ? `-${o.label}` : ''}`);
    mkdirSync(this.runDir, { recursive: true });
    this.label = o.label ?? '';
    this.seats = new Map();
    this.captions = new Map();
    this.results = [];
    this.current = null;
  }

  url(path = '') {
    return new URL(String(path).replace(/^\//, ''), this.base).href;
  }

  async start() {
    this.browser = await chromium.launch({
      channel: this.channel,
      headless: !this.headed,
      chromiumSandbox: true,
      ignoreDefaultArgs: ['--enable-automation'], // no "controlled by automated software" bar
      args: ['--window-size=1400,900'],
    });
  }

  /** One page per seat (a role in a context). Use a persistent profile per seat if your sign-in needs it. */
  async page(seat = 'default') {
    let s = this.seats.get(seat);
    if (!s) {
      const context = await this.browser.newContext({ viewport: { width: 1360, height: 800 } });
      const page = await context.newPage();
      if (this.narrate) await page.screencast.showActions({ duration: this.delay || 500, position: 'top-right', fontSize: 18 });
      s = { context, page };
      this.seats.set(seat, s);
    }
    await this.chapterOnce(s.page);
    return s.page;
  }

  // --- what the watcher sees ---------------------------------------------------

  async chapterOnce(page) {
    const c = this.current;
    if (!c || c.chaptered || !this.narrate) return;
    c.chaptered = true;
    await page.screencast.showChapter(c.id, { description: c.title, duration: 2500 * this.pace }).catch(() => {});
    await sleep(2500 * this.pace);
  }

  /** The step caption, bottom-left: the case's own step line n (1-based), or free text. */
  async step(page, n) {
    const c = this.current;
    const text = typeof n === 'number' ? c.steps[n - 1] ?? `Step ${n}` : n;
    if (!this.narrate) return;
    await this.captions.get(page)?.dispose?.().catch(() => {});
    const html = `<div style="position:fixed;left:16px;bottom:16px;max-width:60%;z-index:2147483646;${FONT}
      background:rgba(15,40,45,.92);color:#fff;padding:10px 16px;border-radius:10px;font-size:17px;line-height:1.5;
      box-shadow:0 4px 16px rgba(0,0,0,.3)"><span style="opacity:.7;font-size:13px">${esc(c.id)} · STEP ${typeof n === 'number' ? n : ''}</span><br>${esc(text)}</div>`;
    this.captions.set(page, await page.screencast.showOverlay(html).catch(() => null));
    await sleep(this.delay / 2);
  }

  async goto(page, path) {
    await page.goto(this.url(path));
    await sleep(this.delay);
  }

  async click(locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    await sleep(this.delay);
  }

  async type(locator, text, { secret = false } = {}) {
    if (secret && this.narrate) await locator.page().screencast.hideActions();
    await locator.click();
    await locator.pressSequentially(text, { delay: this.narrate ? 60 : 0 });
    if (secret && this.narrate) await locator.page().screencast.showActions({ duration: this.delay || 500, position: 'top-right', fontSize: 18 });
    await sleep(this.delay / 2);
  }

  async card(page, kind, clause, detail) {
    if (!this.narrate) return;
    const colour = COLOURS[kind];
    const html = `<div style="position:fixed;left:50%;top:18px;transform:translateX(-50%);width:min(880px,90%);z-index:2147483647;${FONT}
      background:#fff;border:3px solid ${colour};border-radius:14px;padding:14px 20px;box-shadow:0 8px 28px rgba(0,0,0,.28)">
      <div style="font-size:14px;color:#555">${esc(this.current.id)} · expected</div>
      <div style="font-size:19px;line-height:1.5;color:#111;margin-top:4px">${ICONS[kind]} ${esc(clause)}</div>
      ${detail ? `<div style="font-size:13px;color:${colour};margin-top:6px;white-space:pre-wrap">${esc(detail)}</div>` : ''}</div>`;
    await page.screencast.showOverlay(html, { duration: this.hold }).catch(() => {});
    await sleep(this.hold);
  }

  /**
   * One acceptance criterion: n indexes the case's `expected` (0-based), fn
   * throws when it does not hold. Screenshot FIRST, then the verdict card.
   * Assert presence before absence: a locator matching nothing passes toHaveCount(0).
   */
  async check(page, n, fn) {
    const c = this.current;
    const clause = typeof n === 'number' ? c.expected[n] ?? `criterion ${n + 1}` : n;
    let ok = true;
    let error = '';
    try {
      await fn();
    } catch (e) {
      ok = false;
      error = String(e?.message ?? e).split('\n').filter(Boolean).slice(0, 3).join('\n');
    }
    const shot = join(this.runDir, `${c.id}-AC${(typeof n === 'number' ? n : c.verdicts.length) + 1}-${ok ? 'PASS' : 'FAIL'}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    c.verdicts.push({ clause, verdict: ok ? 'pass' : 'fail', error, shot });
    await this.card(page, ok ? 'pass' : 'fail', clause, error);
    return ok;
  }

  /** ⏳ - the data or an outside party cannot show this clause. The reason is required. Not a pass. */
  async wait(page, n, reason) {
    const c = this.current;
    const clause = typeof n === 'number' ? c.expected[n] : n;
    c.verdicts.push({ clause, verdict: 'wait', error: reason });
    await this.card(page, 'wait', clause, reason);
  }

  // --- lifecycle -----------------------------------------------------------------

  async runCase(c) {
    this.current = { ...c, verdicts: [], chaptered: false };
    const started = Date.now();
    let crash = '';
    try {
      await c.arrange?.(this);
      await c.run(this);
    } catch (e) {
      crash = String(e?.stack ?? e).split('\n').slice(0, 4).join('\n');
    }
    try {
      await c.cleanup?.(this);
    } catch (e) {
      crash ||= `cleanup failed: ${e?.message ?? e}`;
    }
    const r = this.current;
    if (crash) {
      // A crash is a red verdict, so a control run still SCORES.
      r.verdicts.push({ clause: 'the case ran to the end', verdict: 'fail', error: crash });
      const page = this.seats.values().next().value?.page;
      if (page) await this.card(page, 'fail', 'the case ran to the end', crash.split('\n')[0]);
    }
    if (r.verdicts.length === 0) r.verdicts.push({ clause: 'at least one check', verdict: 'fail', error: 'the case checked nothing' });
    this.results.push({ id: r.id, title: r.title, ms: Date.now() - started, verdicts: r.verdicts.map(({ shot, ...v }) => ({ ...v, shot: shot ? shot.split(/[\\/]/).pop() : undefined })) });
    for (const v of r.verdicts) console.log(`${ICONS[v.verdict]} ${r.id} · ${v.clause}${v.error ? `\n     ${v.error.split('\n')[0]}` : ''}`);
  }

  async summary() {
    const all = this.results.flatMap((r) => r.verdicts);
    const count = (k) => all.filter((v) => v.verdict === k).length;
    const totals = { pass: count('pass'), fail: count('fail'), wait: count('wait') };
    writeFileSync(join(this.runDir, 'results.json'), JSON.stringify({ label: this.label, base: this.base, totals, cases: this.results }, null, 2));
    console.log(`\nSUMMARY ${this.label ? `[${this.label}] ` : ''}✅ ${totals.pass}  ❌ ${totals.fail}  ⏳ ${totals.wait}  -> ${this.runDir}`);
    const page = [...this.seats.values()].pop()?.page;
    if (this.narrate && page) {
      const rows = this.results.flatMap((r) => r.verdicts.map((v) => `<tr><td style="padding:4px 10px">${ICONS[v.verdict]}</td><td style="padding:4px 10px;color:#555">${esc(r.id)}</td><td style="padding:4px 10px">${esc(v.clause)}</td></tr>`)).join('');
      const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:grid;place-items:center;${FONT}">
        <div style="background:#fff;border-radius:16px;padding:20px 24px;max-width:900px;max-height:80vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.4)">
        <div style="font-size:20px;margin-bottom:10px">Summary ${esc(this.label)} · ✅ ${totals.pass} ❌ ${totals.fail} ⏳ ${totals.wait}</div>
        <table style="border-collapse:collapse;font-size:16px">${rows}</table></div></div>`;
      await page.screencast.showOverlay(html).catch(() => {});
      await sleep(6000 * this.pace);
    }
    return totals;
  }

  async close() {
    for (const s of this.seats.values()) await s.context.close().catch(() => {});
    await this.browser?.close().catch(() => {});
  }
}
