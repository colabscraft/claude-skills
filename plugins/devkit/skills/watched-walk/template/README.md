# Walk template

A small, runnable version of the walk the `watched-walk` skill describes. Copy this folder into a project
(for example `qa/walk/`), and it runs as is against the example page; then make it yours.

| File | What it is |
|---|---|
| `walk.mjs` | The runner: narration over the page, `step`, `click`, `type`, `check`, `wait`, the summary, `results.json` |
| `run.mjs` | Runs one section: `--base` or `--serve`, `--headed`, `--narrate`, `--pace`, `--label`, `--only`, the issue quote check |
| `control.mjs` | The control run: swaps files to the pre-fix commit, runs labelled `control`, restores on any exit |
| `sections/example.mjs` | Two cases, one per acceptance criterion group, with presence-before-absence checks |
| `example/index.html` | The tiny app the example walks |

## Try it

Needs Node 20+ and Google Chrome or Microsoft Edge. In the project root:

```
npm install -D @playwright/test@^1.63
cd qa/walk
node run.mjs --section=sections/example.mjs --serve=example --channel=chrome
```

On Windows without Chrome, use `--channel=msedge` (Edge comes with Windows 11). Without `--channel`, Playwright's
own Chromium is used (`npx playwright install chromium` first).

| Run | Command |
|---|---|
| Headless, no narration (fast, clean evidence) | `node run.mjs --section=<file> --base=http://localhost:4200/` |
| Headless with the narration drawn (to check it) | add `--narrate` |
| Headed, for the watcher | add `--headed`, slower with `--pace=1.5` |
| One case | add `--only=AC-1` |
| The control | `node control.mjs --rev=<pre-fix commit> --files=<the files the fix changed> --section=<file> --base=...` |

Exit codes: `run.mjs` 0 all green, 1 any ❌, 2 the run itself failed. `control.mjs` **0 when the control went
red** (the fix is proven), 1 when it stayed green (not proven), 2 when it could not run.

Each run writes `runs/<time>-<label>/`: `results.json` and one screenshot per criterion, named with its verdict
(`AC-1-AC2-FAIL.png`). Keep `runs/` out of git (`.gitignore`) and commit only what the skill's evidence table
says to keep.

## A dev server that rebuilds

When the app runs under a dev server, the control must wait for the rebuild after the swap, or it tests the
fixed code and looks like a pass. Point it at the server's log and its ready line:

```
node control.mjs --rev=abc123 --files=src/app/list.ts --section=sections/cr12.mjs \
  --base=http://localhost:4200/ --log=dev-server.log --ready="compiled successfully"
```

Start the dev server with its output going to that file (`npm run dev > dev-server.log 2>&1`).

## Make it yours

- **Sign-in.** Add a `signIn(seat)` to `walk.mjs` that drives your sign-in page, and give each seat its own
  persistent browser profile (`chromium.launchPersistentContext(dir)`) if your identity provider keeps sessions.
  Never put a password in a section: read it from an environment variable or a file outside the repo, and type it
  with `w.type(locator, value, { secret: true })` so the callout hides it.
- **Arrange and clean up over the API**, as the seat that owns the data, in each case's `arrange` and `cleanup`.
  The cleanup always runs; make it verify itself.
- **Read the data store** for the verdicts a screen cannot show (a row saved, a file written), behind a visible
  action, never instead of one.
- **Quote the issue.** Declare `export const issue = { repo, number }` in the section and every step and expected
  line is checked against the issue's body and comments (needs `gh` signed in).
- Keep a `README.md` here for the project's own commands, seats, traps and the table of what has been walked.
