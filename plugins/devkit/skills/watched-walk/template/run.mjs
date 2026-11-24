// run.mjs - run one walk section (devkit `watched-walk` skill).
//
//   A web app:              node run.mjs --section=sections/example.mjs --serve=example | --base=http://localhost:4200/
//   A command-line program: node run.mjs --section=sections/example-cli.mjs [--rev=<commit>] [--keep]
//   Either:                 [--headed] [--narrate] [--pace=2] [--label=control] [--only=AC-1,AC-2]
//                           [--channel=chrome|msedge] [--skip-quote-check] [--out=runs]
//
// Exit code: 0 all green, 1 any ❌, 2 the runner itself failed.
//
// A section is a module:
//   export const issue = { repo: 'owner/name', number: 12 };   // optional: quotes checked against the issue
//   export const source = ['docs/plan.md'];                     // optional: quotes checked against repo files
//   export const cases = [{ id, title, steps: [...], expected: [...], arrange?, run, cleanup? }];
//   export async function teardown(w) {}                        // optional: the section's own leftovers
//
// A command-line program's section also declares its terminal (skill section 15):
//   export const terminal = {
//     name: 'tasks',                    // the word in the prompt: [exit 0] tasks $
//     build({ tree, bin, walkDir }) {}, // put the program under test into bin/ (first on the shell's PATH)
//     env({ tree, scratch }) {},        // optional: more environment for the shell
//     link: ['data'],                   // optional: local folders git does not hold, linked into a --rev tree
//   };
// The shell starts in the tree under test: the repository, or with --rev that commit unpacked into the
// run folder (the control run). Sections read w.ctx = { repo, tree, rev, bin, scratch, walkDir } and
// drive the terminal through w.term (terminal.mjs).

import { createServer } from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { delimiter, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Walk } from './walk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const flags = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const value = (k) => (flags[k] && flags[k] !== true ? String(flags[k]) : '');

const flat = (s) => String(s).replace(/\s+/g, ' ').trim();
const missingQuotes = (text, cases) => cases.flatMap((c) => [...c.steps, ...c.expected].filter((q) => !text.includes(flat(q))).map((q) => `${c.id}: "${q}"`));

/** The script IS the issue: every step and expected line must be quoted from it (body or comments). */
function checkIssueQuotes(issue, cases) {
  let raw;
  try {
    raw = execFileSync('gh', ['issue', 'view', String(issue.number), '-R', issue.repo, '--json', 'body,comments'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`cannot read ${issue.repo}#${issue.number} with gh (${String(e.message).split('\n')[0]}). Sign in with "gh auth login", or pass --skip-quote-check and say so in the results.`);
  }
  const data = JSON.parse(raw);
  const missing = missingQuotes(flat([data.body, ...(data.comments ?? []).map((c) => c.body)].join('\n')), cases);
  if (missing.length) throw new Error(`not found in ${issue.repo}#${issue.number}, quote the reporter word for word:\n  ${missing.join('\n  ')}`);
}

/** The same check against files in the repository (a plan, a spec) when the work has no issue. */
function checkSourceQuotes(repo, source, cases) {
  const missing = missingQuotes(flat(source.map((f) => readFileSync(join(repo, f), 'utf8')).join('\n')), cases);
  if (missing.length) throw new Error(`not found in ${source.join(', ')}; quote it word for word:\n  ${missing.join('\n  ')}`);
}

/** A tiny static server for a built app or the example page (--serve=DIR). */
function serve(dir) {
  const root = resolve(dir);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(root, path);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(root, 'index.html'); // single-page apps
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

/** The repository the walk sits in (its root), or the walk's own folder outside git. */
function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim();
  } catch {
    return here;
  }
}

/** The tree under test: the repository, or `rev` unpacked into the run folder with the local folders linked in. */
function treeUnderTest(repo, runDir, rev, link) {
  if (!rev) return repo;
  const src = join(runDir, 'src');
  mkdirSync(src, { recursive: true });
  const archive = execFileSync('git', ['archive', rev], { cwd: repo, maxBuffer: 1 << 30 });
  const x = spawnSync('tar', ['-x', '-C', src], { input: archive });
  if (x.status !== 0) throw new Error(`unpacking ${rev}: ${x.stderr}`);
  for (const l of link) {
    if (existsSync(join(repo, l)) && !existsSync(join(src, l))) {
      mkdirSync(dirname(join(src, l)), { recursive: true });
      symlinkSync(join(repo, l), join(src, l), process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
  return src;
}

/**
 * Remove what the run built, keep the verdicts and screenshots. A linked folder in the unpacked tree
 * is the REAL local data: remove each link itself first, so no recursive delete can follow it, and
 * leave the tree alone if one is still there.
 */
function tidy(runDir, link) {
  let linksGone = true;
  for (const l of link) {
    const p = join(runDir, 'src', l);
    try {
      if (lstatSync(p).isSymbolicLink()) {
        try { unlinkSync(p); } catch { rmdirSync(p); } // a Windows junction
      }
    } catch {}
    if (existsSync(p)) linksGone = false;
  }
  if (!linksGone) console.error(`walk: a link is still in ${join(runDir, 'src')}; left it alone rather than delete through it`);
  for (const d of ['bin', 'scratch', ...(linksGone ? ['src'] : [])]) rmSync(join(runDir, d), { recursive: true, force: true });
}

let server;
let walk;
let term;
let section;
let repo;
let link = [];
const existed = new Map();
let code = 2;
try {
  if (!flags.section) throw new Error('--section=<file> is required');
  const sectionPath = existsSync(resolve(String(flags.section))) ? resolve(String(flags.section)) : resolve(here, String(flags.section));
  section = await import(pathToFileURL(sectionPath).href);
  const only = flags.only ? String(flags.only).split(',') : null;
  const cases = section.cases.filter((c) => !only || only.includes(c.id));
  if (!cases.length) throw new Error('no case to run');
  repo = repoRoot();
  const unquoted = flags['skip-quote-check'] && (section.issue || section.source);
  if (!flags['skip-quote-check']) {
    if (section.issue) checkIssueQuotes(section.issue, cases);
    if (section.source) checkSourceQuotes(repo, section.source, cases);
  }

  const rev = value('rev');
  const label = [value('label'), rev ? `rev-${rev}` : '', unquoted ? 'unquoted' : ''].filter(Boolean).join('-');
  const out = resolve(value('out') || join(here, 'runs'));
  const common = { headed: !!flags.headed, narrate: !!flags.narrate, pace: flags.pace ?? 1, label, out, channel: value('channel') || undefined };

  if (section.terminal) {
    // A command-line program: the page is a terminal running the program under test.
    if (flags.base || flags.serve) throw new Error('a terminal section has no --base or --serve: its page is the terminal');
    const { Term } = await import('./terminal.mjs'); // node-pty and xterm are needed only here
    link = section.terminal.link ?? [];
    for (const l of link) existed.set(l, existsSync(join(repo, l)));
    walk = new Walk(common);
    const tree = treeUnderTest(repo, walk.runDir, rev, link);
    const bin = join(walk.runDir, 'bin');
    const scratch = join(walk.runDir, 'scratch');
    mkdirSync(bin, { recursive: true });
    mkdirSync(scratch, { recursive: true });
    walk.ctx = { repo, tree, rev, bin, scratch, walkDir: relative(repo, here) };
    console.log(`building the program under test from ${rev || 'the working tree'} ...`);
    await section.terminal.build(walk.ctx);
    await walk.start();
    const env = { ...process.env, ...(await section.terminal.env?.(walk.ctx)) };
    delete env.Path; // Windows names it Path; the shell gets one PATH, the one below
    delete env.NO_COLOR;
    env.PATH = `${bin}${delimiter}${process.env.PATH}`;
    env.TERM = 'xterm-256color';
    term = await Term.open(walk, { cwd: tree, env, name: section.terminal.name });
    walk.term = term;
  } else {
    if (rev) throw new Error('--rev builds a program from that commit: terminal sections only. For a web app, the control swaps files (control.mjs --files)');
    let base = value('base') || null;
    if (flags.serve) {
      server = await serve(String(flags.serve));
      base = `http://127.0.0.1:${server.address().port}/`;
    }
    if (!base) throw new Error('--base=<url> or --serve=<dir> is required');
    walk = new Walk({ ...common, base });
    await walk.start();
  }

  try {
    for (const c of cases) await walk.runCase(c);
  } finally {
    await section.teardown?.(walk); // a section's own leftovers go, whatever happened
  }
  const totals = await walk.summary();
  code = totals.fail ? 1 : 0;
} catch (e) {
  console.error(`walk: ${e.message}`);
  code = 2;
} finally {
  await term?.close();
  await walk?.close();
  server?.close();
  if (walk && section?.terminal && !flags.keep) tidy(walk.runDir, link);
  for (const [l, was] of existed) if (was && !existsSync(join(repo, l))) console.error(`walk: ${l} IS GONE - stop and tell the user`);
}
process.exit(code);
