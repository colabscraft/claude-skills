// The Playwright the feature scripts were written against, in the viewer's own
// browser (live-demo-site skill; first built for a production app's training site). The SAME
// scripts that can record videos with real Playwright run here against the real
// app in a same-origin frame: role and name queries are Testing Library's (the
// accessible-name rules Playwright follows too), clicks and typing are
// user-event's real event sequences. Only the subset the scripts use is here,
// with Playwright's semantics where they matter:
//
//   - a locator is LAZY: it is resolved when acted on, against whatever page
//     the frame holds by then, and an action waits for its element to be
//     visible, enabled and still (Playwright's actionability);
//   - getByRole's name: a string is a case-insensitive substring unless
//     `exact`, a RegExp is tested; getByText matches the deepest elements whose
//     text matches;
//   - expect() polls until its timeout.
//
// Where Playwright would refuse an ambiguous locator (strict mode), this takes
// the first visible match: the scripts were proven strict, and the training
// world grows records the recording world did not have.
import { queryAllByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';

export class Aborted extends Error {
  constructor() {
    super('aborted');
  }
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const ACTION_TIMEOUT = 15_000;
const EXPECT_TIMEOUT = 10_000;

function textMatcher(want, exact) {
  if (want instanceof RegExp) return (s) => { want.lastIndex = 0; return want.test(norm(s)); };
  if (exact) return (s) => norm(s) === norm(want);
  const w = norm(want).toLowerCase();
  return (s) => norm(s).toLowerCase().includes(w);
}

function describe(v) {
  if (v instanceof RegExp) return String(v);
  return JSON.stringify(v);
}

function inDocumentOrder(list) {
  const seen = new Set();
  const out = list.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
  return out.sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

function elementText(el) {
  if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) return el.value;
  return el.textContent ?? '';
}

export function isVisible(el) {
  if (!el?.isConnected) return false;
  const win = el.ownerDocument.defaultView;
  const style = win.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (style.display === 'contents') return [...el.children].some(isVisible);
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function isEnabled(el) {
  if (el.disabled) return false;
  if (el.closest?.('fieldset[disabled]')) return false;
  return el.getAttribute('aria-disabled') !== 'true';
}

// ---------------------------------------------------------------------------

/** One step of a locator's chain. Every chain starts from the page and is
 *  re-rooted for `has` (Playwright: the inner locator is relative). */
function applyOp(op, roots, page) {
  switch (op.k) {
    case 'role': {
      const name = op.opts?.name;
      const match = name === undefined ? undefined : textMatcher(name, op.opts?.exact);
      const options = { hidden: false };
      if (match) options.name = (accessibleName) => match(accessibleName);
      if (op.opts?.level !== undefined) options.level = op.opts.level;
      if (op.opts?.checked !== undefined) options.checked = op.opts.checked;
      return inDocumentOrder(roots.flatMap((r) => queryAllByRole(r, op.role, options)));
    }
    case 'text': {
      const match = textMatcher(op.text, op.exact);
      const out = [];
      for (const r of roots) {
        for (const el of r.querySelectorAll('*')) {
          if (/^(SCRIPT|STYLE|HEAD|TITLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
          if (!match(elementText(el))) continue;
          if ([...el.children].some((c) => !/^(SCRIPT|STYLE)$/.test(c.tagName) && match(elementText(c)))) continue;
          out.push(el);
        }
      }
      return inDocumentOrder(out);
    }
    case 'placeholder': {
      const match = textMatcher(op.text, op.exact);
      return inDocumentOrder(roots.flatMap((r) => [...r.querySelectorAll('[placeholder]')].filter((e) => match(e.getAttribute('placeholder')))));
    }
    case 'css':
      return inDocumentOrder(roots.flatMap((r) => [...r.querySelectorAll(op.sel)]));
    case 'filter': {
      let list = roots;
      if (op.hasText !== undefined) {
        const match = textMatcher(op.hasText, false);
        list = list.filter((e) => match(elementText(e)));
      }
      if (op.has) list = list.filter((e) => resolveChain(op.has.chain, [e], page).length > 0);
      return list;
    }
    case 'nth': {
      const i = op.i < 0 ? roots.length + op.i : op.i;
      return roots[i] ? [roots[i]] : [];
    }
    case 'or':
      return inDocumentOrder([...roots, ...op.other.all()]);
    case 'and': {
      const other = new Set(op.other.all());
      return roots.filter((e) => other.has(e));
    }
    default:
      throw new Error(`unknown locator step ${op.k}`);
  }
}

function resolveChain(chain, roots, page) {
  let list = roots;
  for (const op of chain) list = applyOp(op, list, page);
  return list;
}

// ---------------------------------------------------------------------------

export class Locator {
  constructor(page, chain, label) {
    this.page = page;
    this.chain = chain;
    this.label = label;
  }

  #then(op, label) {
    return new Locator(this.page, [...this.chain, op], `${this.label}.${label}`);
  }

  getByRole(role, opts = {}) { return this.#then({ k: 'role', role, opts }, `getByRole(${describe(role)}${opts.name !== undefined ? `, ${describe(opts.name)}` : ''})`); }
  getByText(text, opts = {}) { return this.#then({ k: 'text', text, exact: opts.exact }, `getByText(${describe(text)})`); }
  getByPlaceholder(text, opts = {}) { return this.#then({ k: 'placeholder', text, exact: opts.exact }, `getByPlaceholder(${describe(text)})`); }
  locator(sel) { return this.#then({ k: 'css', sel }, `locator(${describe(sel)})`); }
  filter(opts = {}) { return this.#then({ k: 'filter', hasText: opts.hasText, has: opts.has }, `filter(${opts.hasText !== undefined ? describe(opts.hasText) : 'has'})`); }
  first() { return this.#then({ k: 'nth', i: 0 }, 'first()'); }
  last() { return this.#then({ k: 'nth', i: -1 }, 'last()'); }
  nth(i) { return this.#then({ k: 'nth', i }, `nth(${i})`); }
  or(other) { return this.#then({ k: 'or', other }, `or(${other.label})`); }
  and(other) { return this.#then({ k: 'and', other }, `and(${other.label})`); }

  /** Every element the locator matches NOW. */
  all() {
    const doc = this.page.doc;
    if (!doc?.documentElement) return [];
    return resolveChain(this.chain, [doc.documentElement], this.page);
  }

  /** The element an action is for: the first visible match, waited for. */
  async element({ visible = true, enabled = false, timeout = ACTION_TIMEOUT } = {}) {
    const until = Date.now() + timeout;
    for (;;) {
      this.page.run.check();
      let found = null;
      try {
        const list = this.all();
        found = visible ? list.find(isVisible) : list[0];
        if (found && enabled && !isEnabled(found)) found = null;
      } catch (e) {
        if (e instanceof Aborted) throw e; // a page mid-navigation: try again
      }
      if (found) return found;
      if (Date.now() > until) throw new Error(`timed out waiting for ${this.label}${enabled ? ' (enabled)' : ''}`);
      await this.page.run.tick(100);
    }
  }

  async count() { return this.all().length; }
  async isVisible() {
    try { return this.all().some(isVisible); } catch { return false; }
  }
  async innerText(opts) { return (await this.element({ visible: false, ...opts })).innerText; }
  async inputValue(opts) { return (await this.element({ visible: false, ...opts })).value ?? ''; }
  async boundingBox(opts) {
    const el = await this.element(opts);
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  async scrollIntoViewIfNeeded(opts) {
    const el = await this.element(opts);
    await this.page.reveal(el);
  }
  async evaluate(fn, arg) { return fn(await this.element({ visible: false }), arg); }
  async evaluateAll(fn, arg) { return fn(this.all(), arg); }

  async click(opts) {
    const el = await this.element({ enabled: true, ...opts });
    await this.page.clickElement(el);
  }
  async check(opts) {
    const el = await this.element({ enabled: true, ...opts });
    if (!el.checked) await this.page.clickElement(el);
  }
  async fill(value, opts) {
    const el = await this.element({ enabled: true, ...opts });
    await this.page.fillElement(el, value);
  }
  async pressSequentially(text, opts = {}) {
    const el = await this.element({ enabled: true });
    await this.page.typeInto(el, text, opts.delay ?? 0);
  }
  async press(key) {
    const el = await this.element({ enabled: true });
    el.focus();
    await this.page.user().keyboard(`{${key}}`);
  }
  async setInputFiles() {
    const el = await this.element({ visible: false });
    await this.page.attachPhoto(el);
  }
}

// ---------------------------------------------------------------------------

/**
 * The page: the frame, plus the run it belongs to. `run` gives check() (throws
 * Aborted when the viewer stopped the topic), tick(ms) (a pausable wait) and
 * the hooks the player draws with (`onPointer`).
 */
export class FramePage {
  constructor(frame, run, { photo, onPointer = async () => {} } = {}) {
    this.frame = frame;
    this.run = run;
    this.photo = photo;
    this.onPointer = onPointer;
    this.keyboard = { press: (key) => this.#key(key) };
    this.mouse = { wheel: (dx, dy) => this.#wheel(dx, dy) };
    this._users = new WeakMap();
  }

  get doc() { return this.frame.contentDocument; }
  get win() { return this.frame.contentWindow; }

  #root(op, label) { return new Locator(this, [op], label); }
  getByRole(role, opts = {}) { return this.#root({ k: 'role', role, opts }, `getByRole(${describe(role)}${opts.name !== undefined ? `, ${describe(opts.name)}` : ''})`); }
  getByText(text, opts = {}) { return this.#root({ k: 'text', text, exact: opts.exact }, `getByText(${describe(text)})`); }
  getByPlaceholder(text, opts = {}) { return this.#root({ k: 'placeholder', text, exact: opts.exact }, `getByPlaceholder(${describe(text)})`); }
  locator(sel) { return this.#root({ k: 'css', sel }, `locator(${describe(sel)})`); }

  url() { return this.win?.location.href ?? ''; }

  /** user-event bound to the document the frame holds now (a navigation
   *  replaces it). */
  user() {
    const doc = this.doc;
    let u = this._users.get(doc);
    if (!u) {
      u = userEvent.setup({ document: doc, delay: null, pointerEventsCheck: 0, skipHover: false });
      this._users.set(doc, u);
    }
    return u;
  }

  async waitForTimeout(ms) { await this.run.tick(ms); }

  async goBack() {
    this.win.history.back();
    await this.run.tick(300);
  }

  /** A function run in the FRAME's realm, so `window` is the app's window
   *  (Playwright's evaluate); the app has no CSP, and a refusal falls back. */
  async evaluate(fn, arg) {
    try {
      return new this.win.Function('arg', `return (${fn.toString()})(arg);`)(arg);
    } catch {
      return fn(arg);
    }
  }

  async reveal(el) {
    if (this.#inSight(el)) return;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: this.run.fast ? 'instant' : 'smooth' });
    await this.#still(el);
  }

  /** Inside the window AND inside every scrolling box around it: an option below a list's fold
   *  is inside the window but hidden, and a presenter asked to press it pressed something else. */
  #inSight(el) {
    const r = el.getBoundingClientRect();
    const vh = this.win.innerHeight, vw = this.win.innerWidth;
    if (r.top < 0 || r.left < 0 || r.bottom > vh || r.right > vw) return false;
    for (let box = el.parentElement; box && box !== this.doc.body; box = box.parentElement) {
      if (this.win.getComputedStyle(box).overflowY === 'visible') continue;
      const b = box.getBoundingClientRect();
      if (r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) return false;
    }
    return true;
  }

  /** Wait until the element stops moving (a smooth scroll, an opening panel). */
  async #still(el) {
    let last = '';
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => this.win.requestAnimationFrame(() => r()));
      const r = el.getBoundingClientRect();
      const now = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (now === last) return;
      last = now;
      this.run.check();
    }
  }

  async clickElement(el) {
    await this.reveal(el);
    await this.#still(el);
    const r = el.getBoundingClientRect();
    this.pointerAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    await this.onPointer(el, 'click');
    this.run.check();
    await this.user().click(el);
  }

  /** Playwright's fill: the value replaced in one go, then `input`. */
  async fillElement(el, value) {
    await this.reveal(el);
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? this.win.HTMLTextAreaElement.prototype : this.win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new this.win.InputEvent('input', { bubbles: true, inputType: value ? 'insertText' : 'deleteContentBackward', data: value || null }));
  }

  /** Real keystrokes, one character at a time, at the run's pace. */
  async typeInto(el, text, delay) {
    if (this.doc.activeElement !== el) el.focus();
    for (const ch of String(text)) {
      this.run.check();
      await this.user().keyboard(ch.replace(/[{[]/g, (c) => c + c));
      if (delay) await this.run.tick(delay);
    }
  }

  /** setInputFiles: the training photo, as a File of the frame's own realm. */
  async attachPhoto(input) {
    const blob = await this.photo();
    const file = new this.win.File([blob], 'scene.jpg', { type: 'image/jpeg' });
    const transfer = new this.win.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new this.win.Event('input', { bubbles: true }));
    input.dispatchEvent(new this.win.Event('change', { bubbles: true }));
  }

  async #key(key) {
    this.run.check();
    await this.user().keyboard(`{${key}}`);
  }

  async #wheel(dx, dy) {
    this.run.check();
    const at = this.pointerAt ?? { x: this.win.innerWidth / 2, y: this.win.innerHeight / 2 };
    let el = this.doc.elementFromPoint(at.x, at.y);
    while (el && el !== this.doc.documentElement) {
      const s = this.win.getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) break;
      el = el.parentElement;
    }
    (el ?? this.doc.scrollingElement).scrollBy({ left: dx, top: dy, behavior: this.run.fast ? 'instant' : 'smooth' });
    await this.run.tick(400);
  }
}

// ---------------------------------------------------------------------------

/** expect() the scripts call: polled, like Playwright's web-first assertions. */
export function makeExpect(run) {
  const poll = async (label, test, timeout = EXPECT_TIMEOUT) => {
    const until = Date.now() + timeout;
    for (;;) {
      run.check();
      let ok = false;
      try { ok = await test(); } catch (e) { if (e instanceof Aborted) throw e; }
      if (ok) return;
      if (Date.now() > until) throw new Error(`expect: ${label} - timed out`);
      await run.tick(100);
    }
  };
  const firstVisible = (loc) => loc.all().find(isVisible) ?? loc.all()[0];
  const build = (target, negate) => {
    const is = (v) => (negate ? !v : v);
    const name = (what) => `${target.label ?? 'page'}${negate ? ' not' : ''} ${what}`;
    return {
      toBeVisible: (o = {}) => poll(name('visible'), () => is(target.all().some(isVisible)), o.timeout),
      toBeHidden: (o = {}) => poll(name('hidden'), () => is(!target.all().some(isVisible)), o.timeout),
      toHaveCount: (n, o = {}) => poll(name(`count ${n}`), () => is(target.all().length === n), o.timeout),
      toBeEnabled: (o = {}) => poll(name('enabled'), () => { const e = firstVisible(target); return is(!!e && isEnabled(e)); }, o.timeout),
      toBeDisabled: (o = {}) => poll(name('disabled'), () => { const e = firstVisible(target); return is(!!e && !isEnabled(e)); }, o.timeout),
      toHaveText: (want, o = {}) => {
        const match = textMatcher(want, !(want instanceof RegExp));
        return poll(name(`text ${describe(want)}`), () => { const e = firstVisible(target); return is(!!e && match(e.textContent)); }, o.timeout);
      },
      toContainText: (want, o = {}) => {
        const match = textMatcher(want, false);
        return poll(name(`contains ${describe(want)}`), () => { const e = firstVisible(target); return is(!!e && match(e.textContent)); }, o.timeout);
      },
      toHaveURL: (want, o = {}) => {
        const match = want instanceof RegExp ? (u) => want.test(u) : (u) => u === want;
        return poll(name(`URL ${describe(want)}`), () => is(match(target.url())), o.timeout);
      },
    };
  };
  return (target) => {
    const api = build(target, false);
    api.not = build(target, true);
    return api;
  };
}
