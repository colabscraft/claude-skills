// control.mjs - the control run (devkit `watched-walk` skill, section 4).
//
// Swaps the files a fix touched back to their pre-fix content, runs the section
// labelled `control`, and restores the files on ANY exit (error, Ctrl+C).
// A control must go RED on the clause the fix is for; a green control means
// the fix is NOT YET PROVEN.
//
//   node control.mjs --rev=<pre-fix git rev> --files=src/a.ts,src/b.ts --section=sections/x.mjs
//                    [--log=<dev server log> --ready=<regex>] [--wait=<ms>] [any run.mjs flag]
//
// Wait for the rebuild: with --log and --ready it waits until the dev server's
// log prints the ready line AFTER the swap (and again after the restore);
// otherwise it waits --wait ms (default 0, right for a static build).
//
// Exit code: 0 the control went red (the fix is proven), 1 the control stayed
// green (not proven), 2 the control could not run.

import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const rev = flag('rev');
const files = (flag('files') ?? '').split(',').filter(Boolean);
if (!rev || !files.length || !flag('section')) {
  console.error('control: --rev, --files and --section are required');
  process.exit(2);
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
const root = git('rev-parse', '--show-toplevel').trim();
const saved = new Map(files.map((f) => [f, existsSync(join(root, f)) ? readFileSync(join(root, f)) : null]));

let restored = false;
function restore() {
  if (restored) return;
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

let code = 2;
try {
  let size = logSize();
  for (const f of files) writeFileSync(join(root, f), git('show', `${rev}:${f}`));
  console.log(`control: ${files.join(', ')} swapped to ${rev}`);
  await settle(size);

  const passOn = args.filter((a) => !/^--(rev|files|log|ready|wait)=/.test(a) && !/^--label=/.test(a));
  const run = spawnSync(process.execPath, [join(HERE, 'run.mjs'), ...passOn, '--label=control'], { stdio: 'inherit' });

  restore();
  size = logSize();
  await settle(size);

  if (run.status === 1) {
    console.log('\nCONTROL WENT RED: the walk catches the original defect. The fix is proven.');
    code = 0;
  } else if (run.status === 0) {
    console.log('\nCONTROL STAYED GREEN: NOT YET PROVEN. The walk passes on the old code too; fix the case before shipping.');
    code = 1;
  } else {
    console.log('\nCONTROL COULD NOT RUN: no verdict. Read the error above.');
    code = 2;
  }
} catch (e) {
  console.error(`control: ${e.message}`);
  code = 2;
} finally {
  restore();
}
process.exit(code);
