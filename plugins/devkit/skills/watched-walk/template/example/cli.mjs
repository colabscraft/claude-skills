#!/usr/bin/env node
// cli.mjs - the tiny command-line program the terminal example walks (sections/example-cli.mjs).
// The twin of example/index.html: a task list, typed instead of clicked.
//
//   tasks add <title>   save a task; an empty or missing title is refused (exit 2)
//   tasks list          the saved tasks, one per line
//   tasks               asks for a title, then saves it
//
// Tasks are kept in the JSON file named by TASKS_FILE (default tasks.json in the current folder).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const file = process.env.TASKS_FILE || 'tasks.json';
const load = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []);

function add(title) {
  if (!String(title ?? '').trim()) {
    console.error('Please enter a title');
    process.exit(2);
  }
  const tasks = load();
  tasks.push({ title: String(title).trim() });
  writeFileSync(file, JSON.stringify(tasks, null, 2) + '\n');
  console.log('Saved');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'add') {
  add(rest.join(' '));
} else if (cmd === 'list') {
  const tasks = load();
  if (!tasks.length) console.log('No tasks yet');
  tasks.forEach((t, i) => console.log(`${i + 1}. ${t.title}`));
} else if (cmd === undefined) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const title = await rl.question('Title: ');
  rl.close();
  add(title);
} else {
  console.error(`tasks: unknown command "${cmd}" (add, list)`);
  process.exit(2);
}
