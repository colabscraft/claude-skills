// control.mjs - the control run (devkit `watched-walk` skill, section 4).
//
// Runs the section against the code BEFORE the fix, labelled `control`. It must go RED on the clause
// the fix is for; a control that stays green means the fix is NOT YET PROVEN.
//
// Two ways to get the code before the fix:
//   --files  swap the files the fix touched back to their content at --rev, run, and restore them on
//            ANY exit (error, Ctrl+C). A web app under a dev server, or any program run from the tree.
//   (none)   a command-line program: run.mjs unpacks the whole tree at --rev into the run folder and
//            builds the program there (terminal sections only; the working tree is never touched).
//
//   node control.mjs --rev=<pre-fix rev> --files=src/a.ts,src/b.ts --section=sections/x.mjs
//                    [--log=<dev server log> --ready=<regex>] [--wait=<ms>] [--expect-red=AC-1] [any run.mjs flag]
//   node control.mjs --rev=<pre-fix rev> --section=sections/x-cli.mjs [--expect-red=CLI-1,CLI-2.AC3] [any run.mjs flag]
//
// --expect-red names what must go red: `CLI-1` every clause of that case, `CLI-2.AC3` its third
// expected line. Every other clause should stay green; one that goes red is listed, since the control
// then shows more than the fix. Without --expect-red any red counts, which a crash also gives: name them.
//
// Wait for the rebuild (--files with a dev server): with --log and --ready it waits until the dev
// server's log prints the ready line AFTER the swap (and again after the restore); otherwise it
// waits --wait ms (default 0, right for a static build or a program built by run.mjs).
//
// Exit code: 0 the control went red where required (the fix is proven), 1 it did not (not proven),
// 2 the control could not run.

import { readFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const rev = flag('rev');
const files = (flag('files') ?? '').split(',').filter(Boolean);
const wanted = (flag('expect-red') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (!rev || !flag('section')) {
  console.error('control: --rev and --section are required (and --files to swap files instead of running the whole tree)');
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: HERE, encoding: 'utf8' });
const root = git('rev-parse', '--show-toplevel').trim();
const saved = new Map(files.map((f) => [f, existsSync(join(root, f)) ? readFileSync(join(root, f)) : null]));

let restored = false;
function restore() {
  if (restored || !files.length) return;
  restored = true;
  for (const [f, content] of saved) if (content !== null) writeFileSync(join(root, f), content);
  console.log(`control: restored ${files.join(', ')}`);
}
process.on('SIGINT', () => { restore(); process.exit(2); });
process.on('SIGTERM', () => { restore(); process.exit(2); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(sinceSize) {
  const log = flag('log');
  const ready = flag('ready');
  if (log && ready) {
    const re = new RegExp(ready);
    const until = Date.now() + 180_000;
    while (Date.now() < until) {
      const text = readFileSync(log, 'utf8').slice(sinceSize);
      if (re.test(text)) return;
      await sleep(500);
    }
    throw new Error(`no "${ready}" in ${log} within 3 minutes: the rebuild was not seen, so the run would test the wrong code`);
  }
  await sleep(Number(flag('wait') ?? 0));
}
const logSize = () => (flag('log') && existsSync(flag('log')) ? statSync(flag('log')).size : 0);

/** The verdicts of the control run, read from its results.json. */
function results(outDir, before) {
  const made = (existsSync(outDir) ? readdirSync(outDir) : []).filter((n) => !before.has(n) && n.includes('control')).sort().pop();
  if (!made) throw new Error(`no control run folder in ${outDir}`);
  return { dir: join(outDir, made), ...JSON.parse(readFileSync(join(outDir, made, 'results.json'), 'utf8')) };
}

/** Red where required? Prints one line per required clause, and every red that was not asked for. */
function judge(r) {
  const isWanted = (id, i) => wanted.includes(id) || wanted.includes(`${id}.AC${i + 1}`);
  let proven = true;
  for (const c of r.cases) {
    c.verdicts.forEach((v, i) => {
      const red = v.verdict === 'fail';
      if (isWanted(c.id, i)) {
        if (!red) proven = false;
        console.log(`${red ? 'red as required   ' : 'STAYED GREEN      '} ${c.id}.AC${i + 1} · ${v.clause}`);
      } else if (red) {
        console.log(`red, not required  ${c.id}.AC${i + 1} · ${v.clause}\n                    ${String(v.error).split('\n')[0]}`);
      }
    });
  }
  for (const w of wanted) {
    if (!r.cases.some((c) => c.id === w.split('.')[0])) { proven = false; console.log(`NOT RUN            ${w}`); }
  }
  return proven;
}

let code = 2;
try {
  let size = logSize();
  if (files.length) {
    for (const f of files) writeFileSync(join(root, f), git('show', `${rev}:${f}`));
    console.log(`control: ${files.join(', ')} swapped to ${rev}`);
    await settle(size);
  } else {
    console.log(`control: the whole tree at ${rev}`);
  }

  const outDir = resolve(flag('out') ?? join(HERE, 'runs'));
  const before = new Set(existsSync(outDir) ? readdirSync(outDir) : []);
  const drop = files.length ? /^--(rev|files|log|ready|wait|label|expect-red)=/ : /^--(files|log|ready|wait|label|expect-red)=/;
  const passOn = args.filter((a) => !drop.test(a));
  const run = spawnSync(process.execPath, [join(HERE, 'run.mjs'), ...passOn, '--label=control'], { stdio: 'inherit' });

  restore();
  if (files.length) {
    size = logSize();
    await settle(size);
  }

  if (run.status === 2 || run.status === null) {
    console.log('\nCONTROL COULD NOT RUN: no verdict. Read the error above.');
    code = 2;
  } else {
    const r = results(outDir, before);
    console.log(`\nCONTROL at ${rev} -> ${r.dir}`);
    const proven = wanted.length ? judge(r) : run.status === 1;
    if (!wanted.length) console.log('(no --expect-red: any red counts, a crash too; name the clauses the fix is for)');
    if (proven) {
      console.log('CONTROL WENT RED where required: the walk catches the original defect. The fix is proven.');
      code = 0;
    } else {
      console.log('CONTROL NOT RED where required: NOT YET PROVEN. The walk passes on the old code too; fix the case before shipping.');
      code = 1;
    }
  }
} catch (e) {
  console.error(`control: ${e.message}`);
  code = 2;
} finally {
  restore();
}
process.exit(code);
