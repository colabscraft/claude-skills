// An example section: one case per acceptance criterion group, the steps and
// expected lines quoted from the issue word for word.
//
// With a real issue, declare it and run.mjs refuses to start when a quote is not in it:
// export const issue = { repo: 'owner/name', number: 12 };
import { expect } from '../walk.mjs';

export const cases = [
  {
    id: 'AC-1',
    title: 'An empty task is refused',
    steps: [
      'Open the task list',
      'Press Add without typing a title',
    ],
    expected: [
      'A message says "Please enter a title"',
      'No empty task is added to the list',
    ],
    async run(w) {
      const page = await w.page('user');
      await w.step(page, 1);
      await w.goto(page, '');
      await w.step(page, 2);
      await w.click(page.getByRole('button', { name: 'Add' }));
      await w.check(page, 0, async () => {
        await expect(page.getByRole('alert')).toHaveText('Please enter a title');
      });
      await w.check(page, 1, async () => {
        await expect(page.getByRole('list', { name: 'Tasks' })).toBeAttached(); // presence first
        await expect(page.getByRole('listitem')).toHaveCount(0); // then absence
      });
    },
  },
  {
    id: 'AC-2',
    title: 'A task is added with a confirmation',
    steps: [
      'Type "Buy milk" as the title',
      'Press Add',
    ],
    expected: [
      'The task appears in the list',
      'A "Saved" message shows',
    ],
    async run(w) {
      const page = await w.page('user');
      await w.goto(page, '');
      await w.step(page, 1);
      await w.type(page.getByRole('textbox', { name: 'Title' }), 'Buy milk');
      await w.step(page, 2);
      await w.click(page.getByRole('button', { name: 'Add' }));
      await w.check(page, 0, async () => {
        await expect(page.getByRole('listitem').filter({ hasText: 'Buy milk' })).toBeVisible();
      });
      await w.check(page, 1, async () => {
        await expect(page.getByRole('status')).toHaveText('Saved');
      });
    },
  },
];
