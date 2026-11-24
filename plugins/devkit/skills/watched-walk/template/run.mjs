// run.mjs - run one walk section (devkit `watched-walk` skill).
//
//   node run.mjs --section=sections/example.mjs [--base=http://localhost:4200/]
//                [--serve=example] [--headed] [--narrate] [--pace=2] [--label=control]
//                [--channel=chrome|msedge] [--only=AC-1,AC-2] [--skip-quote-check]
//
// Exit code: 0 all green, 1 any ❌, 2 the runner itself failed.
//
// A section is a module:
//   export const issue = { repo: 'owner/name', number: 12 };   // optional: quotes are checked
//   export const cases = [{ id, title, steps: [...], expected: [...], arrange?, run, cleanup? }];

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Walk } from './walk.mjs';

const flags = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const flat = (s) => String(s).replace(/\s+/g, ' ').trim();

/** The script IS the issue: every step and expected line must be quoted from it (body or comments). */
function checkQuotes(issue, cases) {
  let raw;
  try {
    raw = execFileSync('gh', ['issue', 'view', String(issue.number), '-R', issue.repo, '--json', 'body,comments'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`cannot read ${issue.repo}#${issue.number} with gh (${String(e.message).split('\n')[0]}). Sign in with "gh auth login", or pass --skip-quote-check and say so in the results.`);
  }
  const data = JSON.parse(raw);
  const text = flat([data.body, ...(data.comments ?? []).map((c) => c.body)].join('\n'));
  const missing = cases.flatMap((c) => [...c.steps, ...c.expected].filter((q) => !text.includes(flat(q))).map((q) => `${c.id}: "${q}"`));
  if (missing.length) throw new Error(`not found in ${issue.repo}#${issue.number}, quote the reporter word for word:\n  ${missing.join('\n  ')}`);
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

let server;
let walk;
let code = 2;
try {
  if (!flags.section) throw new Error('--section=<file> is required');
  const section = await import(pathToFileURL(resolve(String(flags.section))).href);
  const only = flags.only ? String(flags.only).split(',') : null;
  const cases = section.cases.filter((c) => !only || only.includes(c.id));
  if (!cases.length) throw new Error('no case to run');
  if (section.issue && !flags['skip-quote-check']) checkQuotes(section.issue, cases);

  let base = flags.base ? String(flags.base) : null;
  if (flags.serve) {
    server = await serve(String(flags.serve));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  if (!base) throw new Error('--base=<url> or --serve=<dir> is required');

  const label = [flags.label, flags['skip-quote-check'] && section.issue ? 'unquoted' : ''].filter(Boolean).join('-');
  walk = new Walk({ base, headed: !!flags.headed, narrate: !!flags.narrate, pace: flags.pace ?? 1, label, out: flags.out ?? 'runs', channel: flags.channel === true ? undefined : flags.channel });
  await walk.start();
  for (const c of cases) await walk.runCase(c);
  const totals = await walk.summary();
  code = totals.fail ? 1 : 0;
} catch (e) {
  console.error(`walk: ${e.message}`);
  code = 2;
} finally {
  await walk?.close();
  server?.close();
}
process.exit(code);
