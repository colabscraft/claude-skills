// The demo site's live player (live-demo-site skill). It plays a topic by
// running its feature script (the project's features/) against the real app in
// the page's frame: the topic's own data is set up over the API first (the
// project's demo.config.mjs), the frame is signed in as the topic's seat, and
// the script drives it through pw.mjs. The panel's controls steer the Run
// (take.mjs). Everything project-specific comes from `config`; the UI text is
// Thai - translate this file and portal/index.html for another language.
import { FEATURES } from 'virtual:features';
import config from 'virtual:demo-config';
import { Aborted } from './pw.mjs';
import { LiveTake, Run } from './take.mjs';

const $ = (id) => document.getElementById(id);
const APP = new URL(config.appPath ?? 'app/', location.href).href;
// ?check: every topic runs at the quick re-run's pace, behind the cover - the
// live check (live-check.mjs --fast) proves the scripts with it.
const CHECK = new URLSearchParams(location.search).has('check');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k, d) {
    try { return localStorage.getItem(`${config.storeKey ?? 'demo'}-${k}`) ?? d; } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(`${config.storeKey ?? 'demo'}-${k}`, String(v)); } catch { /* private mode */ }
  },
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const features = FEATURES.map(({ id, mod }) => ({ id, key: id.slice(0, 3), script: mod.default, ...mod.default }));
let chapters = {}; // id -> the recorded chapter titles (manifest.json), for the step list
let selected = 0;
let current = null; // { f, index, run, take, promise, done, failed }
let starts = 0;
let role = '';

// --- icons -----------------------------------------------------------------
const ICONS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  prevS: 'M6 6h2v12H6zm3.5 6 8.5 6V6z',
  nextS: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z',
  prevF: 'M11 18V6l-8.5 6zm.5-6 8.5 6V6z',
  nextF: 'M4 18l8.5-6L4 6zm9-12v12l8.5-6z',
  restart: 'M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6v3l4-4-4-4z',
  list: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
  steps: 'M4 5h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zM4 17h2v2H4zm4 0h12v2H8z',
  full: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z',
  unfull: 'M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z',
  fold: 'M5 11h14v2H5z',
  unfold: 'M5 5h14v14H5zm2 2v10h10V7z',
  tune: 'M3 6h8v2H3zm12 0h6v2h-6zm-2-2h2v6h-2zM3 16h4v2H3zm8 0h10v2H11zm-2-2h2v6H9z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z',
};
function icon(target, name) {
  let svg = target.tagName.toLowerCase() === 'svg' ? target : target.querySelector('svg.i');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i');
    target.prepend(svg);
  }
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${ICONS[name]}"/>`;
}
for (const e of document.querySelectorAll('[data-icon]')) {
  if (e.tagName.toLowerCase() === 'svg' && e.parentElement?.dataset.icon) continue;
  icon(e, e.dataset.icon);
}

// --- the frame -------------------------------------------------------------
const frame = $('app');
const stage = $('stage');
const frameState = { navigating: false };

/** Count the app's requests and DOM changes, as early as a new document
 *  exists (its module scripts run after parsing, so a 30 ms watch is early
 *  enough), and route the panel's keys while a topic plays. */
function instrument() {
  let win, doc;
  try {
    win = frame.contentWindow;
    doc = frame.contentDocument;
  } catch {
    return;
  }
  if (!win || !doc || win.__player) return;
  const st = { inflight: 0, changed: Date.now(), mutated: Date.now() };
  win.__player = st;
  const touch = () => { st.changed = Date.now(); };
  const XHR = win.XMLHttpRequest?.prototype;
  if (XHR) {
    const send = XHR.send;
    XHR.send = function (...a) {
      st.inflight++;
      touch();
      this.addEventListener('loadend', () => { st.inflight--; touch(); }, { once: true });
      return send.apply(this, a);
    };
  }
  const fetch0 = win.fetch;
  if (fetch0) {
    win.fetch = function (...a) {
      st.inflight++;
      touch();
      return fetch0.apply(this, a).finally(() => { st.inflight--; touch(); });
    };
  }
  new win.MutationObserver(() => { st.mutated = Date.now(); }).observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
  win.addEventListener('beforeunload', () => { frameState.navigating = true; });
  win.addEventListener('pagehide', () => { frameState.navigating = true; });
  win.addEventListener('keydown', onFrameKey, true);
}
setInterval(instrument, 30);
frame.addEventListener('load', () => {
  frameState.navigating = false;
  instrument();
});

async function navigate(url, run) {
  frameState.navigating = true;
  try {
    frame.contentWindow.location.assign(url);
  } catch {
    frame.src = url;
  }
  const t0 = Date.now();
  while (frameState.navigating || frame.contentDocument?.readyState !== 'complete') {
    if (Date.now() - t0 > 30_000) throw new Error(`the app did not load ${url}`);
    await run.tick(50);
  }
}

/** Playwright's networkidle, roughly: no request in flight for 400 ms and the
 *  page still for 250 ms - capped, so a page that never rests cannot hang. */
async function settle(run) {
  const t0 = Date.now();
  await run.tick(120); // a click that navigates announces itself by now
  for (;;) {
    run.check();
    const st = frame.contentWindow?.__player;
    const now = Date.now();
    const ready = !frameState.navigating && frame.contentDocument?.readyState === 'complete' && st;
    if (ready && st.inflight <= 0 && now - st.changed > 400 && now - st.mutated > 250) return;
    if (now - t0 > 6000 && !frameState.navigating) return;
    if (now - t0 > 30_000) return;
    await run.tick(50);
  }
}

// --- layout ----------------------------------------------------------------
let zoom = Number(store.get('zoom', '1'));
const PHONE = config.phone ?? { w: 412, h: 860 };
// A desktop topic was written at a desktop width: a narrower window shows the
// app smaller rather than in its tablet layout, where the menus differ.
const DESKTOP_MIN = config.desktopMin ?? 1280;

function layout() {
  const f = current?.f ?? features[selected];
  const phone = f?.device === 'phone';
  stage.classList.toggle('phone', phone);
  const vw = window.innerWidth, vh = window.innerHeight;
  if (phone) {
    const s = Math.min((vh - 48) / PHONE.h, (vw - 48) / PHONE.w, 1.7);
    const w = PHONE.w * s;
    // Centred, unless the panel would sit on it: then beside the panel.
    let x = (vw - w) / 2;
    const p = $('panel').getBoundingClientRect();
    if (x < p.right + 16 && x + w > p.left - 16) {
      if (p.right + 24 + w <= vw - 16) x = Math.max(x, p.right + 24);
      else if (p.left - 24 - w >= 16) x = Math.min(x, p.left - 24 - w);
    }
    frame.style.width = `${PHONE.w}px`;
    frame.style.height = `${PHONE.h}px`;
    frame.style.transform = `translate(${Math.round(x)}px, ${Math.round((vh - PHONE.h * s) / 2)}px) scale(${s})`;
  }
  const z = phone ? zoom : Math.min(zoom, vw / DESKTOP_MIN);
  if (!phone) {
    frame.style.width = `${Math.round(vw / z)}px`;
    frame.style.height = `${Math.round(vh / z)}px`;
    frame.style.transform = z === 1 ? 'none' : `scale(${z})`;
  }
  $('zoomVal').textContent = `${Math.round(z * 100)}%`;
  clampPanel();
}
window.addEventListener('resize', layout);
function setZoom(z) {
  zoom = Math.min(2, Math.max(0.5, Math.round(z * 10) / 10));
  store.set('zoom', zoom);
  layout();
}
$('zoomIn').onclick = () => setZoom(zoom + 0.1);
$('zoomOut').onclick = () => setZoom(zoom - 0.1);

/** An element of the frame, in this page's coordinates. */
function toPortal(target) {
  const r = target.getBoundingClientRect();
  const f = frame.getBoundingClientRect();
  const s = f.width / frame.offsetWidth || 1;
  return { x: f.left + r.left * s, y: f.top + r.top * s, w: r.width * s, h: r.height * s };
}

// --- drawing over the frame ------------------------------------------------
const fxLayer = $('fx');
const cursor = $('cursor');
const marks = new Set();
let pointer = { x: -100, y: -100 };

/** The panel turns see-through while what the topic is showing - the cursor
 *  or a ring - lies under it (hovering it brings it back). */
function seeThrough() {
  const panel = $('panel');
  const p = panel.getBoundingClientRect();
  const inside = (x, y) => x > p.left && x < p.right && y > p.top && y < p.bottom;
  // A ring counts when a third of it is under the panel, not when it grazes it.
  const covered = (r) => {
    const w = Math.max(0, Math.min(r.right, p.right) - Math.max(r.left, p.left));
    const h = Math.max(0, Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top));
    return w * h > (r.width * r.height) / 3;
  };
  let under = !!live() && inside(pointer.x, pointer.y);
  for (const m of marks) if (!under && m.node.classList.contains('ring') && covered(m.node.getBoundingClientRect())) under = true;
  panel.classList.toggle('see-through', under && !panel.matches(':hover'));
}

function track() {
  seeThrough();
  for (const m of marks) {
    if (!m.target.isConnected) {
      m.node.style.opacity = '0';
      continue;
    }
    const p = toPortal(m.target);
    const pad = m.pad ?? 0;
    Object.assign(m.node.style, { left: `${p.x - pad}px`, top: `${p.y - pad}px`, width: `${p.w + 2 * pad}px`, height: `${p.h + 2 * pad}px`, opacity: '1' });
  }
  requestAnimationFrame(track);
}
requestAnimationFrame(track);

function mark(target, node, pad) {
  const m = { target, node, pad };
  fxLayer.append(node);
  marks.add(m);
  return () => {
    marks.delete(m);
    node.remove();
  };
}
function clearMarks() {
  for (const m of [...marks]) {
    marks.delete(m);
    m.node.remove();
  }
  for (const n of fxLayer.querySelectorAll('.note')) n.remove();
}

const fx = {
  async pointAt(target, run) {
    const p = toPortal(target);
    const to = { x: p.x + p.w / 2, y: p.y + Math.min(p.h / 2, 22) };
    const move = (ms) => {
      cursor.style.transitionDuration = `${ms}ms`;
      cursor.style.transform = `translate(${to.x - 3}px, ${to.y - 2}px)`;
    };
    if (run.fast) {
      move(0);
      pointer = to;
      return;
    }
    const ms = Math.min(750, Math.max(250, Math.hypot(to.x - pointer.x, to.y - pointer.y) * 0.9)) / run.speed();
    move(ms);
    pointer = to;
    await run.tick(ms + 40);
    cursor.classList.remove('click');
    void cursor.offsetWidth;
    cursor.classList.add('click');
  },
  ring(target) {
    return mark(target, el('div', 'ring'), 6);
  },
  cover(target, label) {
    return mark(target, el('div', 'cover-mark', label), 0);
  },
  note(text, phone) {
    const n = el('div', `note${phone ? ' phone' : ''}`, `💡 ${text}`);
    const f = frame.getBoundingClientRect();
    if (phone) Object.assign(n.style, { left: `${f.left + 12}px`, top: `${f.top + 64}px`, width: `${Math.max(240, f.width - 24)}px` });
    else Object.assign(n.style, { right: `${Math.max(16, window.innerWidth - f.right + 20)}px`, top: `${f.top + 76}px` });
    fxLayer.append(n);
    return () => n.remove();
  },
};

// --- cover and cards -------------------------------------------------------
function showCover(title, say = '') {
  $('coverTitle').textContent = title;
  $('coverSay').textContent = say;
  $('cover').hidden = false;
}
const coverSay = (say) => { $('coverSay').textContent = say; };
const hideCover = () => { $('cover').hidden = true; };
const glass = (on) => { $('glass').hidden = !on; };

function card(build) {
  const box = $('card');
  box.replaceChildren();
  build(box);
  $('card-wrap').hidden = false;
  box.querySelector('.actions .btn')?.focus();
}
const hideCard = () => { $('card-wrap').hidden = true; };
function button(text, onClick, primary = false, iconName = null) {
  const b = el('button', `btn${primary ? ' primary' : ''}`, text);
  b.type = 'button';
  if (iconName) icon(b, iconName);
  b.onclick = onClick;
  return b;
}
function link(text, href, newTab = false) {
  const a = el('a', 'btn', text);
  a.href = href;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

function welcome() {
  const f = features[selected];
  card((box) => {
    const line = el('div', 'brandline');
    const img = el('img');
    img.src = config.mark ?? 'brand/mark.svg';
    img.alt = '';
    const words = el('div');
    words.append(el('h2', '', config.title ?? 'ศูนย์ฝึกอบรม'));
    words.lastChild.id = 'cardTitle';
    words.append(el('div', 's', config.subtitle ?? 'ข้อมูลสมมติทั้งหมด'));
    line.append(img, words);
    box.append(line);
    box.append(el('p', '', 'เลือกหัวข้อ แล้วดูระบบจริงทำงานทีละขั้นบนจอนี้ หยุด เล่นต่อ ย้อนขั้น หรือข้ามขั้นได้จากแผงควบคุมมุมล่างซ้าย ซึ่งลากย้ายหรือย่อเก็บได้'));
    box.append(el('p', '', 'เมื่อจบหัวข้อ ระบบยังเปิดค้างไว้ในบทบาทนั้น ลองกดใช้งานต่อเองได้ทันที'));
    const small = el('p', '', 'หมายเหตุ: การเล่นหัวข้อจะเข้าสู่ระบบในบทบาทของหัวข้อนั้น แท็บ "ลองใช้งานเอง" ที่เปิดไว้ในเบราว์เซอร์เดียวกันจะเปลี่ยนบทบาทตามไปด้วย');
    small.style.fontSize = '14px';
    box.append(small);
    const actions = el('div', 'actions');
    actions.append(
      button(`เริ่มหัวข้อ ${selected + 1}: ${f.title}`, () => start(selected), true, 'play'),
      button('เลือกหัวข้อ', () => { hideCard(); openDrawer('topics'); }, false, 'list'),
      ...(config.videoMode ? [link('โหมดวิดีโอ', `video.html#${f.key}`)] : []),
    );
    box.append(actions);
  });
}

async function titleCard(c) {
  const { f, run } = c;
  card((box) => {
    box.append(el('div', 'n', `หัวข้อ ${c.index + 1} จาก ${features.length} · ${f.group}`));
    box.firstChild.style.color = 'var(--muted)';
    const h = el('h2', '', f.title);
    h.id = 'cardTitle';
    box.append(h, el('span', 'chip role', `บทบาท: ${f.role}`), el('p', '', f.summary));
  });
  try {
    await run.tick(3600 / run.speed());
  } finally {
    hideCard();
  }
}

function endCard(c) {
  const next = c.index + 1 < features.length ? c.index + 1 : -1;
  card((box) => {
    const h = el('h2', '', `จบหัวข้อ: ${c.f.title}`);
    h.id = 'cardTitle';
    box.append(h, el('p', '', `ระบบยังเปิดอยู่ในบทบาท "${c.f.role}" ปิดกล่องนี้แล้วลองกดใช้งานต่อเองได้`));
    const actions = el('div', 'actions');
    if (next >= 0) actions.append(button(`หัวข้อถัดไป: ${features[next].title}`, () => start(next), true, 'nextF'));
    actions.append(button('เล่นอีกครั้ง', () => start(c.index), next < 0, 'restart'), button('ลองต่อเองในหน้านี้', hideCard));
    box.append(actions);
  });
}

function failCard(c, e) {
  const step = c.take?.chapters.at(-1);
  card((box) => {
    const h = el('h2', '', 'หัวข้อนี้ทำต่อไม่ได้');
    h.id = 'cardTitle';
    box.append(h, el('p', '', step ? `หยุดที่ขั้น: ${step}` : 'หยุดระหว่างเตรียมหัวข้อ'));
    box.append(el('p', '', 'ลองเล่นใหม่อีกครั้ง หรือดูหัวข้อนี้แบบวิดีโอแทน'));
    box.append(el('div', 'err', String(e?.message ?? e).slice(0, 400)));
    const actions = el('div', 'actions');
    actions.append(button('ลองใหม่', () => start(c.index), true, 'restart'));
    if (config.videoMode) actions.append(link('ดูแบบวิดีโอ', `video.html#${c.f.key}`));
    actions.append(button('ปิด', hideCard));
    box.append(actions);
  });
}

// --- running a topic -------------------------------------------------------
let photoBlob = null;
const photo = async () => (photoBlob ??= await (await fetch(config.photo ?? 'photo.jpg')).blob());

async function onStep(take, title, detail) {
  const run = take.run;
  run.step++;
  const n = run.step;
  if (run.fastTo) {
    if (n < run.fastTo) {
      coverSay(`ขั้นที่ ${n}: ${title}`);
      renderSteps();
      return;
    }
    run.fastTo = 0;
    run.fast = false;
    hideCover();
    if (run.pauseOnArrive) {
      run.pauseOnArrive = false;
      run.paused = true;
    }
  }
  if (n > 1 && $('hold').checked && !run.paused) run.paused = true;
  const wasPaused = run.paused;
  run.held = run.paused;
  caption(n, title, detail);
  renderPlay();
  renderSteps();
  await run.tick(0); // stands here while paused
  run.held = false;
  renderPlay();
  await run.tick(wasPaused ? 300 : run.pace().caption);
}

const player = { frame, fx, navigate, settle, onStep, photo };

async function execute(c) {
  const { f, run } = c;
  const trip = config.newRun?.(f) ?? null;
  try {
    hideCard();
    clearMarks();
    showCover(CHECK ? `ตรวจหัวข้อ "${f.title}"` : run.fast ? `กำลังข้ามไปยังขั้นที่ ${run.fastTo}` : `กำลังเตรียมหัวข้อ "${f.title}"`, '');
    layout();
    const api = config.api(APP);
    if (f.needs) await config.prepare(api, f, trip, { photo: await photo(), say: coverSay });
    run.check();
    // The framed app as every topic expects it (its light theme, its own
    // layout), whatever this browser chose in a hands-on session: same
    // origin, same storage.
    config.beforeRun?.();
    coverSay(`เข้าสู่ระบบในบทบาท ${f.role}`);
    if (f.signedOut) {
      await api.signOut();
      await navigate(`${APP}${config.signedOutPath ?? 'login'}`, run);
    } else {
      await api.signIn(f.role);
      await navigate(`${APP}${config.landingPath ?? ''}`, run);
    }
    await settle(run);
    glass(true);
    if (!run.fast) {
      hideCover();
      await titleCard(c);
    }
    c.take = new LiveTake({ feature: f.script, run, player, trip, app: APP });
    await f.script.run(c.take);
    run.check();
    c.done = true;
    hideCover();
    glass(false);
    endCard(c);
  } catch (e) {
    if (e instanceof Aborted || run.aborted) return;
    c.done = true;
    c.failed = e;
    console.error(`[training] ${f.id}`, e);
    hideCover();
    glass(false);
    failCard(c, e);
  } finally {
    renderPlay();
    renderSteps();
  }
}

async function stop() {
  const c = current;
  if (!c) return;
  c.run.aborted = true;
  c.run.changed();
  await Promise.race([c.promise, sleep(5000)]);
  clearMarks();
  hideCover();
  glass(false);
}

async function start(index, { toStep = 1, pauseOnArrive = false } = {}) {
  const token = ++starts;
  closeDrawers();
  hideCard();
  await stop();
  if (token !== starts) return;
  select(index);
  const f = features[index];
  const run = new Run({ speed: () => Number($('speed').value) });
  if (CHECK) toStep = Number.MAX_SAFE_INTEGER;
  if (toStep > 1) {
    run.fastTo = toStep;
    run.fast = true;
    run.pauseOnArrive = pauseOnArrive;
  }
  run.listeners.add(renderPlay);
  const c = { f, index, run, done: false };
  current = c;
  caption(0, 'กำลังเตรียม...', '');
  renderPlay();
  c.promise = execute(c);
}

// --- controls --------------------------------------------------------------
const live = () => (current && !current.done ? current : null);

function togglePlay() {
  const c = live();
  if (!c) return start(selected);
  c.run.paused = !c.run.paused;
  c.run.changed();
  renderPlay();
}

/** Forward to step `k` on the run in progress: quickly, behind the cover. */
function fastForward(c, k) {
  const run = c.run;
  run.fastTo = k;
  run.fast = true;
  run.pauseOnArrive = run.paused;
  showCover(`กำลังข้ามไปยังขั้นที่ ${k}`, '');
  if (run.paused) {
    run.paused = false;
    run.changed();
  }
}

function nextStep() {
  const c = live();
  if (!c) return;
  fastForward(c, c.run.step + 1);
}

function prevStep() {
  const c = live() ?? current;
  if (!c) return;
  const at = c.run.step;
  if (at <= 2) return start(c.index, { pauseOnArrive: c.run.paused });
  start(c.index, { toStep: at - 1, pauseOnArrive: c.run.paused });
}

function jump(k) {
  closeDrawers();
  const c = live();
  if (c && c.index === selected && k > c.run.step) return fastForward(c, k);
  start(selected, { toStep: k, pauseOnArrive: !!c?.run.paused });
}

$('play').onclick = togglePlay;
$('playMini').onclick = togglePlay;
$('nextS').onclick = nextStep;
$('prevS').onclick = prevStep;
$('restart').onclick = () => start(current?.index ?? selected);
$('nextF').onclick = () => { if (selected + 1 < features.length) start(selected + 1); };
$('prevF').onclick = () => { if (selected > 0) start(selected - 1); };
$('speed').value = store.get('speed', '1');
$('speed').onchange = () => store.set('speed', $('speed').value);
$('hold').checked = store.get('hold', '0') === '1';
$('hold').onchange = () => store.set('hold', $('hold').checked ? '1' : '0');

function renderPlay() {
  const c = live();
  let text = 'เริ่ม', name = 'play';
  if (c) {
    if (c.run.paused) text = 'เล่นต่อ';
    else {
      text = 'หยุดชั่วคราว';
      name = 'pause';
    }
  } else if (current && current.index === selected) text = 'เล่นอีกครั้ง';
  $('playText').textContent = text;
  icon($('play'), name);
  icon($('playMini'), name);
  $('playMini').title = text;
  $('holdHint').hidden = !(c?.run.paused && c.run.held);
  $('prevF').disabled = selected === 0;
  $('nextF').disabled = selected >= features.length - 1;
  $('nextS').disabled = !c;
  $('prevS').disabled = !current;
}

function caption(n, title, detail) {
  const total = chapters[features[selected].id]?.length;
  $('stepNo').textContent = n ? `ขั้นที่ ${n}${total ? ` จาก ${total}` : ''}` : `หัวข้อ ${selected + 1}: ${features[selected].title}`;
  $('stepTitle').textContent = title;
  $('stepDetail').textContent = detail;
  $('stepDetail').hidden = !detail;
  $('stepMini').textContent = n ? `ขั้นที่ ${n}${total ? `/${total}` : ''}` : '';
}

function select(index) {
  selected = index;
  const f = features[index];
  $('topicNo').textContent = `หัวข้อ ${index + 1}/${features.length}`;
  $('topicTitle').textContent = f.title;
  $('roleChip').textContent = f.role;
  $('roleChip').hidden = false;
  $('videoLink').href = `video.html#${f.key}`;
  history.replaceState(null, '', `#${f.key}`);
  renderTopics();
  renderSteps();
  renderPlay();
  layout();
}

// --- drawers ---------------------------------------------------------------
function openDrawer(id) {
  closeDrawers();
  const d = $(id);
  d.inert = false;
  d.classList.add('open');
  $('scrim').hidden = false;
  (d.querySelector('[aria-current="true"]') ?? d.querySelector('button'))?.focus();
}
function closeDrawers() {
  for (const d of document.querySelectorAll('.drawer')) {
    d.classList.remove('open');
    d.inert = true;
  }
  $('scrim').hidden = true;
}
$('scrim').onclick = closeDrawers;
for (const b of document.querySelectorAll('[data-close]')) b.onclick = closeDrawers;
$('topicsBtn').onclick = () => openDrawer('topics');
$('stepsBtn').onclick = () => openDrawer('steps');

function renderTopics() {
  const roles = [...new Set(features.map((f) => f.role))];
  const box = $('roles');
  box.replaceChildren();
  for (const r of ['', ...roles]) {
    const b = el('button', '', r || 'ทุกบทบาท');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(r === role));
    b.onclick = () => {
      role = r;
      renderTopics();
    };
    box.append(b);
  }
  const list = $('topicList');
  list.replaceChildren();
  let group = null;
  features.forEach((f, i) => {
    if (role && f.role !== role) return;
    if (f.group !== group) {
      group = f.group;
      list.append(el('div', 'group', group));
    }
    const b = el('button', 'item');
    b.type = 'button';
    b.setAttribute('aria-current', String(i === selected));
    b.append(el('span', 'n', `หัวข้อ ${i + 1} · ${f.role}${f.device === 'phone' ? ' · บนโทรศัพท์' : ''}`), el('span', 't', f.title), el('span', 'm', f.summary));
    b.onclick = () => start(i);
    list.append(b);
  });
}

function renderSteps() {
  const f = features[selected];
  const c = current && current.index === selected ? current : null;
  const at = c?.run.step ?? 0;
  const titles = [...(chapters[f.id] ?? [])];
  for (const [i, t] of (c?.take?.chapters ?? []).entries()) titles[i] = t;
  const list = $('stepList');
  list.replaceChildren();
  if (!titles.length) list.append(el('p', 'hint', 'ขั้นตอนจะแสดงเมื่อเริ่มเล่นหัวข้อนี้'));
  titles.forEach((t, i) => {
    const b = el('button', `item step${i + 1 < at ? ' done' : ''}`);
    b.type = 'button';
    b.setAttribute('aria-current', String(i + 1 === at && !c?.done));
    b.append(el('span', 'n', `${i + 1}.`), el('span', 't', t));
    b.onclick = () => jump(i + 1);
    list.append(b);
  });
}

// --- the panel: move, fold, full screen ------------------------------------
const panel = $('panel');
function clampPanel() {
  if (!panel.style.top) return;
  const r = panel.getBoundingClientRect();
  const x = Math.min(Math.max(8, r.left), window.innerWidth - r.width - 8);
  const y = Math.min(Math.max(8, r.top), window.innerHeight - r.height - 8);
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
}
(() => {
  const saved = store.get('panel', '');
  if (saved) {
    const [x, y] = saved.split(',').map(Number);
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, bottom: 'auto' });
  }
  if (store.get('mini', '0') === '1') panel.classList.add('mini');
  let drag = null;
  $('grip').addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, a, select, input')) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    $('grip').setPointerCapture(e.pointerId);
  });
  $('grip').addEventListener('pointermove', (e) => {
    if (!drag) return;
    Object.assign(panel.style, { left: `${e.clientX - drag.dx}px`, top: `${e.clientY - drag.dy}px`, bottom: 'auto' });
    clampPanel();
  });
  $('grip').addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    layout();
    const r = panel.getBoundingClientRect();
    store.set('panel', `${Math.round(r.left)},${Math.round(r.top)}`);
  });
})();
function fold() {
  panel.classList.toggle('mini');
  store.set('mini', panel.classList.contains('mini') ? '1' : '0');
  icon($('miniBtn'), panel.classList.contains('mini') ? 'unfold' : 'fold');
  $('miniBtn').title = panel.classList.contains('mini') ? 'ขยายแผงควบคุม (H)' : 'ย่อแผงควบคุม (H)';
  layout();
}
icon($('miniBtn'), panel.classList.contains('mini') ? 'unfold' : 'fold');
$('miniBtn').onclick = fold;
// The settings row (speed, หยุดรอทุกขั้น, size) folds away on a small screen.
function showSettings(on) {
  panel.classList.toggle('no-settings', !on);
  $('settingsBtn').setAttribute('aria-pressed', String(on));
  store.set('settings', on ? '1' : '0');
  clampPanel();
}
showSettings(store.get('settings', window.innerHeight < 800 ? '0' : '1') === '1');
$('settingsBtn').onclick = () => showSettings(panel.classList.contains('no-settings'));
function fullScreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$('fullBtn').onclick = fullScreen;
document.addEventListener('fullscreenchange', () => icon($('fullBtn'), document.fullscreenElement ? 'unfull' : 'full'));

// --- keys ------------------------------------------------------------------
function shortcut(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key;
  const act = {
    ' ': togglePlay, ArrowRight: nextStep, ArrowLeft: prevStep, n: () => $('nextF').click(), p: () => $('prevF').click(),
    r: () => $('restart').click(), f: fullScreen, t: () => openDrawer('topics'), s: () => openDrawer('steps'), h: fold,
    Escape: () => { closeDrawers(); if (!live()) hideCard(); },
  }[k.length === 1 ? k.toLowerCase() : k];
  if (!act) return false;
  act();
  return true;
}
document.addEventListener('keydown', (e) => {
  if (!e.isTrusted || e.target.closest?.('select, input[type=text], textarea')) return;
  if (e.key === ' ' && e.target.closest?.('button, a')) return; // a focused control's own Space
  if (shortcut(e)) e.preventDefault();
});
/** Keys pressed while the app has focus: the panel's, only while a topic plays
 *  - Space must not press a focused button in the app under the script. */
function onFrameKey(e) {
  // The script's own keystrokes are synthetic: a space it types into a field
  // must not pause the topic (and be swallowed) - only a person's key counts.
  if (!e.isTrusted || !live()) return;
  if (shortcut(e)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

// --- start -----------------------------------------------------------------
(async () => {
  if (config.title) document.title = config.title;
  if (config.mark) document.querySelector('link[rel=icon]')?.setAttribute('href', config.mark);
  $('try').href = APP;
  $('videoLink').hidden = !config.videoMode;
  try {
    const m = await (await fetch('manifest.json', { cache: 'no-store' })).json();
    for (const f of m.features ?? []) chapters[f.id] = (f.chapters ?? []).map((c) => c.title);
  } catch { /* the step list fills as a topic plays */ }
  const want = location.hash.slice(1);
  const i = features.findIndex((f) => want && f.id.startsWith(want));
  select(i >= 0 ? i : 0);
  welcome();
  // The real sign-in page behind the welcome, rather than an empty frame.
  if (frame.contentWindow?.location.href === 'about:blank') frame.src = `${APP}${config.signedOutPath ?? 'login'}`;
})();
