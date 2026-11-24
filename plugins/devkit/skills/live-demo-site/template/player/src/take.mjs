// What a feature script drives when the portal plays it live (live-demo-site
// skill): the recorder's Take, with the same methods, in the viewer's browser. The
// pace is the viewer's (speed, pause, หยุดรอทุกขั้น); captions, rings and notes
// are drawn by the portal over the frame instead of into a video.
import { Aborted, FramePage, makeExpect } from './pw.mjs';

// The recorder's paces: recorded videos and the live player feel the same.
const PACE = { action: 900, caption: 2600, typing: 45 };
// A quick re-run (previous step, a jump): still a beat per action, or a
// confirm lands before the page has its data (paid for on the first project, 2026-10-07).
const FAST = { action: 250, caption: 0, typing: 0 };

export const rethrowAbort = (e) => {
  if (e instanceof Aborted) throw e;
};

/**
 * One play of one topic. The player flips `paused`, `fast` / `fastTo` and
 * `aborted`; everything the script awaits goes through check() and tick(), so
 * a pause holds it between actions and a stop unwinds it at the next one.
 */
export class Run {
  constructor({ speed }) {
    this.speed = speed; // a function: the control is read live
    this.aborted = false;
    this.paused = false;
    this.fast = false;
    this.fastTo = 0; // the step a quick re-run is heading for
    this.pauseOnArrive = false;
    this.step = 0;
    this.listeners = new Set();
  }

  check() {
    if (this.aborted) throw new Aborted();
  }

  changed() {
    for (const f of this.listeners) f();
  }

  #resumed() {
    return new Promise((resolve) => {
      const f = () => {
        if (!this.paused || this.aborted) {
          this.listeners.delete(f);
          resolve();
        }
      };
      this.listeners.add(f);
    });
  }

  /** A wait that stands still while paused and ends at a stop. */
  async tick(ms) {
    let left = ms;
    for (;;) {
      this.check();
      if (this.paused) {
        await this.#resumed();
        continue;
      }
      if (left <= 0) return;
      const slice = Math.min(50, left);
      await new Promise((r) => setTimeout(r, slice));
      left -= slice;
    }
  }

  pace() {
    if (this.fast) return FAST;
    const s = this.speed();
    return { action: PACE.action / s, caption: PACE.caption / s, typing: PACE.typing / s };
  }
}

export class LiveTake {
  /**
   * @param o.feature  the script (features/fNN-*.mjs default export)
   * @param o.run      its Run
   * @param o.player   the portal: navigate(), settle(), onStep(), fx (drawing), photo()
   * @param o.trip     this run's own data (demo.config.mjs newRun / prepare); t.trip in a script
   * @param o.app      the app's base URL, ending in /
   */
  constructor({ feature, run, player, trip, app }) {
    this.feature = feature;
    this.run = run;
    this.player = player;
    this.trip = trip;
    this.app = app;
    this.fx = player.fx;
    this.chapters = [];
    this.phone = feature.device === 'phone';
    this.page = new FramePage(player.frame, run, { photo: player.photo, onPointer: (el) => player.fx.pointAt(el, run) });
    this.expect = makeExpect(run);
  }

  url(path) {
    return new URL(path.replace(/^\//, ''), this.app).href;
  }

  async goto(path) {
    await this.player.navigate(this.url(path), this.run);
    await this.settle();
  }

  async settle() {
    await this.player.settle(this.run);
    await this.run.tick(this.run.pace().action / 2);
  }

  async step(title, detail = '') {
    this.chapters.push(title);
    await this.player.onStep(this, title, detail);
  }

  async note(text, ms = 3200) {
    if (this.run.fast) return;
    const off = this.fx.note(text, this.phone);
    try {
      await this.run.tick(ms / this.run.speed());
    } finally {
      off();
    }
  }

  async point(locator, ms = 1800) {
    // Short waits: a ring that cannot be drawn must not hold the topic still.
    await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(rethrowAbort);
    if (this.run.fast) return;
    const el = await locator.element({ timeout: 3000 }).catch(rethrowAbort);
    if (!el) return;
    const off = this.fx.ring(el);
    try {
      await this.run.tick(ms / this.run.speed());
    } finally {
      off();
    }
  }

  /** Hide one element's text behind a label for the rest of the topic. */
  async cover(locator, label) {
    const el = await locator.element({ timeout: 3000 }).catch(rethrowAbort);
    if (el) this.fx.cover(el, label);
  }

  async click(locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    await this.run.tick(this.run.pace().action);
  }

  async type(locator, text) {
    await locator.click();
    await locator.fill('');
    await locator.pressSequentially(text, { delay: this.run.pace().typing });
    await this.run.tick(this.run.pace().action / 2);
  }

  /** The recorder's tickGood: one good answer in every radio group in `scope`
   *  that has none yet (a group may hold two good words). */
  async tickGood(scope, good = /^(.* )?(ปกติ|สะอาด|ครบ|เต็ม)$/) {
    const radios = scope.locator('input[type=radio]').all().filter((e) => e.offsetParent !== null);
    for (const name of [...new Set(radios.map((e) => e.name))]) {
      const group = scope.locator(`input[type=radio][name="${CSS.escape(name)}"]`);
      if (group.all().some((e) => e.checked)) continue;
      const pick = group.and(this.page.getByRole('radio', { name: good })).first();
      if (!(await pick.count())) continue;
      await pick.scrollIntoViewIfNeeded();
      await pick.check();
      await this.run.tick(this.run.fast ? 200 : 500 / this.run.speed());
    }
  }

  async pause(ms) {
    if (!this.run.fast) await this.run.tick(ms / this.run.speed());
  }
}
