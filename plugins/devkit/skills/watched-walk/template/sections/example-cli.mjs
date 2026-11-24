// The terminal example: the same method as example.mjs, for a command-line program (skill section 15).
// Each step is a command typed into a real terminal with visible keystrokes; each verdict is read from
// the screen, the exit code in the prompt, and the data store behind it (the tasks file).
//
// With a real issue or plan, declare it and run.mjs refuses to start when a quote is not in it:
// export const issue = { repo: 'owner/name', number: 12 };
// export const source = ['docs/plan.md'];
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const holds = (cond, msg) => { if (!cond) throw new Error(msg); };
// Terminals wrap long lines differently (Windows' ConPTY breaks them itself): compare with all white
// space removed, so a wrap never decides a verdict.
const has = (text, needle) => text.replace(/\s+/g, '').includes(needle.replace(/\s+/g, ''));
const store = (w) => join(w.ctx.scratch, 'tasks.json');
const saved = (w) => {
  holds(existsSync(store(w)), 'the tasks file is not there');
  return JSON.parse(readFileSync(store(w), 'utf8'));
};

export const terminal = {
  name: 'tasks',
  /** Put the program under test first on the shell's PATH. A compiled program is built here instead:
   *  execFileSync('go', ['build', '-o', join(bin, 'tool'), './cmd/tool'], { cwd: tree, stdio: 'inherit' }) */
  build({ tree, bin, walkDir }) {
    const cli = join(tree, walkDir, 'example', 'cli.mjs');
    if (process.platform === 'win32') {
      writeFileSync(join(bin, 'tasks.cmd'), `@"${process.execPath}" "${cli}" %*\r\n`);
    } else {
      writeFileSync(join(bin, 'tasks'), `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
      chmodSync(join(bin, 'tasks'), 0o755);
    }
  },
  env: ({ scratch }) => ({ TASKS_FILE: join(scratch, 'tasks.json') }),
};

export const cases = [
  {
    id: 'CLI-1',
    title: 'An empty task is refused',
    steps: ['Run `tasks add ""`'],
    expected: [
      'It says "Please enter a title"',
      'It exits with code 2',
      'No empty task is saved',
    ],
    // Arrange through the data store: one task already saved, so the absence check below reads a
    // file that is really there.
    arrange: (w) => writeFileSync(store(w), JSON.stringify([{ title: 'Call the plumber' }])),
    async run(w) {
      const page = await w.page('terminal');
      await w.step(page, 1);
      const r = await w.term.run('tasks add ""');
      await w.check(page, 0, () => holds(has(r.out, 'Please enter a title'), `it printed: ${r.out.trim() || '(nothing)'}`));
      await w.check(page, 1, () => holds(r.exit === 2, `exit ${r.exit}`));
      await w.check(page, 2, () => {
        const tasks = saved(w);
        holds(tasks.some((t) => t.title === 'Call the plumber'), 'the task saved before is gone'); // presence first
        holds(!tasks.some((t) => !String(t.title).trim()), `an empty task was saved (${tasks.length} tasks)`); // then absence
      });
    },
  },
  {
    id: 'CLI-2',
    title: 'A task is added with a confirmation',
    steps: ['Run `tasks add "Buy milk"`', 'Run `tasks list`'],
    expected: [
      'It says "Saved"',
      'The task is in the list',
      'The task is saved',
    ],
    arrange: (w) => writeFileSync(store(w), '[]'),
    async run(w) {
      const page = await w.page('terminal');
      await w.step(page, 1);
      const r = await w.term.run('tasks add "Buy milk"');
      await w.check(page, 0, () => holds(r.exit === 0 && has(r.out, 'Saved'), `exit ${r.exit}: ${r.out.trim()}`));
      await w.step(page, 2);
      const l = await w.term.run('tasks list');
      await w.check(page, 1, () => holds(has(l.out, '1. Buy milk'), `the list: ${l.out.trim()}`));
      await w.check(page, 2, () => holds(saved(w).some((t) => t.title === 'Buy milk'), 'not in the tasks file'));
    },
  },
  {
    id: 'CLI-3',
    title: 'Asked for a title when none is given',
    steps: ['Run `tasks` with no arguments', 'Answer "Water the plants"'],
    expected: [
      'It asks "Title:"',
      'It says "Saved" and the task is saved',
    ],
    arrange: (w) => writeFileSync(store(w), '[]'),
    async run(w) {
      const page = await w.page('terminal');
      await w.step(page, 1);
      const from = await w.term.start('tasks');
      await w.check(page, 0, () => w.term.waitFor(/Title:\s*$/, from, 15000));
      await w.step(page, 2);
      await w.term.answer('Water the plants');
      const r = await w.term.done(from);
      await w.check(page, 1, () => {
        holds(r.exit === 0 && has(r.out, 'Saved'), `exit ${r.exit}: ${r.out.trim()}`);
        holds(saved(w).some((t) => t.title === 'Water the plants'), 'not in the tasks file');
      });
    },
  },
];
