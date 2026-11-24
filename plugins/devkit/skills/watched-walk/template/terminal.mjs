// terminal.mjs - for a command-line program, the walk's page is a real terminal (devkit `watched-walk`
// skill, section 15).
//
// The page is xterm.js (the terminal inside VS Code). Behind it, node-pty runs a real terminal session
// (forkpty on Linux and macOS, ConPTY on Windows) with a real shell, so the program under test sees a
// terminal exactly as in any terminal app: same bytes, same colours, same interactive questions.
//
// No listening port: this process owns the session and passes bytes to the page through Playwright
// itself (exposeFunction for keystrokes, evaluate for output), and the page's files are served by
// page.route from node_modules. Nothing on the machine can connect to the shell.
//
// The shell's prompt carries the last exit code, `[exit N] <name> $ `, so a step's exit code is on
// screen for the watcher and read from the screen by the walk.
//
// Needs, in the walk's folder: @xterm/xterm, @xterm/addon-fit, node-pty (README.md, "A command-line
// program").

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pty = require('node-pty');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ORIGIN = 'http://terminal.walk';
const WINDOWS = process.platform === 'win32';

const page = (title) => `<!doctype html><html><head><meta charset="utf-8"><title>${title} - terminal</title>
<link rel="stylesheet" href="/xterm.css">
<style>
  html, body { margin: 0; height: 100%; background: #0f1419; }
  /* Keep the bottom clear for the step caption, so the prompt line is never under it. */
  #t { position: absolute; left: 16px; right: 16px; top: 14px; bottom: 112px; }
</style></head><body><div id="t"></div>
<script src="/xterm.js"></script><script src="/addon-fit.js"></script>
<script>
  const term = new Terminal({
    fontFamily: '"DejaVu Sans Mono", "Cascadia Mono", Consolas, "Liberation Mono", monospace',
    fontSize: 15, lineHeight: 1.15, cursorBlink: true, scrollback: 10000,
    theme: { background: '#0f1419', foreground: '#e6e1cf', cursor: '#f29718' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('t'));
  fit.fit();
  term.onData((d) => window.ptyInput(d));
  window.term = term;
  window.fitTerm = () => { fit.fit(); return { cols: term.cols, rows: term.rows }; };
  window.writeAsync = (s) => new Promise((r) => term.write(s, r));
  // The whole buffer, wrapped lines joined back into one.
  window.screenText = () => {
    const b = term.buffer.active, out = [];
    for (let i = 0; i < b.length; i++) {
      const line = b.getLine(i);
      const s = line.translateToString(true);
      if (line.isWrapped && out.length) out[out.length - 1] += s; else out.push(s);
    }
    // The terminal's unused rows are empty lines at the end: leave them out, so a length measured
    // now is an offset into the text that follows, not a point past it.
    return out.join('\\n').replace(/\\s+$/, '');
  };
  term.focus();
</script></body></html>`;

/** Is a program on the PATH? */
const onPath = (env, exe) => String(env.PATH ?? env.Path ?? '').split(delimiter).some((d) => d && existsSync(join(d, exe)));

/** The shell and its prompt. No profile, no rc file, no history written: the walk leaves no trace. */
function shellFor(env, name) {
  if (WINDOWS) {
    // PowerShell 7 when it is installed, else the Windows PowerShell 5.1 every Windows has.
    const init = [
      'try { Set-PSReadLineOption -HistorySaveStyle SaveNothing } catch {}',
      'try { Set-PSReadLineOption -PredictionSource None } catch {}', // PSReadLine 2.1+ only
      `function global:prompt { $c = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }; "\`n[exit $c] ${name} > " }`,
    ].join('; ');
    const exe = env.WALK_SHELL || (onPath(env, 'pwsh.exe') ? 'pwsh.exe' : 'powershell.exe');
    return { file: exe, args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', init], env };
  }
  return {
    file: env.WALK_SHELL || 'bash',
    args: ['--noprofile', '--norc', '-i'],
    env: { ...env, HISTFILE: '', PS1: `\\n\\[\\e[2m\\][exit $?]\\[\\e[0m\\] \\[\\e[1;36m\\]${name}\\[\\e[0m\\] $ ` },
  };
}

export class Term {
  /**
   * Open the terminal page and start the shell.
   * @param walk    the Walk (its 'terminal' seat becomes this page)
   * @param o.cwd   folder the shell starts in (the tree under test)
   * @param o.env   environment for the shell (PATH with the program under test first)
   * @param o.name  the word in the prompt, `[exit 0] <name> $` (letters, digits, - and _)
   */
  static async open(walk, { cwd, env, name = 'walk' }) {
    if (!/^[\w-]+$/.test(name)) throw new Error(`terminal name "${name}": letters, digits, - and _ only`);
    const t = new Term();
    t.walk = walk;
    // A trailing space may be dropped at the end of the screen (ConPTY moves the cursor instead).
    t.promptRe = new RegExp(`\\[exit (-?\\d*)\\] ${reEsc(name)} [$>](?: |$)`, 'gm');
    const p = await walk.page('terminal');
    const files = {
      '/': ['text/html; charset=utf-8', page(name)],
      '/xterm.js': ['text/javascript', readFileSync(require.resolve('@xterm/xterm/lib/xterm.js'))],
      '/xterm.css': ['text/css', readFileSync(join(dirname(require.resolve('@xterm/xterm/package.json')), 'css', 'xterm.css'))],
      '/addon-fit.js': ['text/javascript', readFileSync(require.resolve('@xterm/addon-fit/lib/addon-fit.js'))],
    };
    await p.route(`${ORIGIN}/**`, (route) => {
      const f = files[new URL(route.request().url()).pathname];
      return f ? route.fulfill({ contentType: f[0], body: f[1] }) : route.fulfill({ status: 404, body: '' });
    });
    await p.exposeFunction('ptyInput', (d) => t.pty?.write(d));
    await p.goto(`${ORIGIN}/`);
    const { cols, rows } = await p.evaluate(() => window.fitTerm());
    const sh = shellFor(env, name);
    t.pty = pty.spawn(sh.file, sh.args, { name: 'xterm-256color', cols, rows, cwd, env: sh.env });
    // Output goes to the page in order, in small batches.
    let pending = '';
    let timer = null;
    t.flushed = Promise.resolve();
    t.pty.onData((d) => {
      pending += d;
      timer ??= setTimeout(() => {
        const s = pending;
        pending = '';
        timer = null;
        t.flushed = t.flushed.then(() => p.evaluate((x) => window.writeAsync(x), s)).catch(() => {});
      }, 12);
    });
    t.pty.onExit((e) => { t.exited = e; });
    t.page = p;
    await t.waitPrompts(1, 30000);
    return t;
  }

  /** The whole screen and scrollback as text. */
  async screen() {
    await this.flushed;
    return this.page.evaluate(() => window.screenText());
  }

  async prompts() {
    return [...(await this.screen()).matchAll(this.promptRe)];
  }

  async waitPrompts(n, timeout) {
    const end = Date.now() + timeout;
    for (;;) {
      const p = await this.prompts();
      if (p.length >= n) return p;
      if (this.exited) throw new Error(`the shell exited (${this.exited.exitCode})`);
      if (Date.now() > end) throw new Error(`no prompt after ${Math.round(timeout / 1000)} s: the command is still running or waiting for input`);
      await sleep(150);
    }
  }

  /** Type text into the terminal the way a person does: focused, visible keystrokes. */
  async type(text) {
    await this.page.evaluate(() => window.term.focus());
    await this.page.keyboard.type(text, { delay: this.walk.narrate ? 45 * this.walk.pace : 0 });
  }

  async enter() {
    await this.page.keyboard.press('Enter');
  }

  /**
   * Type a command, press Enter, wait for the next prompt.
   * @returns { exit, out } the exit code shown in the new prompt and the text the command printed
   */
  async run(cmd, { timeout = 60000 } = {}) {
    const before = await this.prompts();
    await this.type(cmd);
    await sleep(this.walk.delay / 3);
    await this.enter();
    const after = await this.waitPrompts(before.length + 1, timeout);
    const last = after[after.length - 1];
    const prev = after[after.length - 2];
    const s = await this.screen();
    const out = s.slice(prev.index + prev[0].length, last.index);
    await sleep(this.walk.delay);
    return { exit: Number(last[1] || 0), out };
  }

  /**
   * Start a command that will ask questions; returns the screen length to wait from. Answer with
   * waitFor + answer, then `done(from)` for the exit code.
   */
  async start(cmd) {
    const from = (await this.screen()).length;
    this.pendingPrompts = (await this.prompts()).length;
    await this.type(cmd);
    await sleep(this.walk.delay / 3);
    await this.enter();
    return from;
  }

  /** Wait until text printed after `from` (a screen length) matches re; returns the new text. */
  async waitFor(re, from, timeout = 30000) {
    const end = Date.now() + timeout;
    for (;;) {
      const s = (await this.screen()).slice(from);
      if (re.test(s)) return s;
      if (Date.now() > end) throw new Error(`waited ${Math.round(timeout / 1000)} s for ${re}`);
      await sleep(150);
    }
  }

  /** Answer an interactive question: type the answer, Enter. */
  async answer(text) {
    await this.type(text);
    await sleep(this.walk.delay / 3);
    await this.enter();
  }

  /** After `start` and its answers: wait for the prompt; returns { exit, out } like `run`. */
  async done(from, { timeout = 60000 } = {}) {
    const after = await this.waitPrompts((this.pendingPrompts ?? 0) + 1, timeout);
    const last = after[after.length - 1];
    const s = await this.screen();
    await sleep(this.walk.delay);
    return { exit: Number(last[1] || 0), out: s.slice(from, last.index) };
  }

  async close() {
    try { this.pty?.kill(); } catch {}
  }
}
