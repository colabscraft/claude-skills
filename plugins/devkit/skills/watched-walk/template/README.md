# Walk template

A small, runnable version of the walk the `watched-walk` skill describes. Copy this folder into a project
(for example `qa/walk/`), and it runs as is against the example page (a web app) or the example program (a
command-line program); then make it yours.

| File | What it is |
|---|---|
| `walk.mjs` | The runner: narration over the page, `step`, `click`, `type`, `check`, `wait`, the summary, `results.json` |
| `run.mjs` | Runs one section: `--base` or `--serve` for a web app, `--rev` for a program; `--headed`, `--narrate`, `--pace`, `--label`, `--only`, the quote check |
| `control.mjs` | The control run: swaps files to the pre-fix commit (`--files`), or runs a program's whole tree at it; restores on any exit; `--expect-red` names the clauses that must go red |
| `terminal.mjs` | For a command-line program: the page is a real terminal (xterm.js) on a real shell (node-pty), no listening port |
| `sections/example.mjs` | Two cases against the example page, with presence-before-absence checks |
| `example/index.html` | The tiny app the web example walks |
| `sections/example-cli.mjs` | Three cases against the example program: typed commands, an interactive question, verdicts from the data file |
| `example/cli.mjs` | The tiny program the terminal example walks (Node, so there is nothing to compile) |

## Try it

Needs Node 20+ and Google Chrome or Microsoft Edge. In the project root:

```
npm install -D @playwright/test@^1.65
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
| The control | `node control.mjs --rev=<pre-fix commit> --files=<the files the fix changed> --section=<file> --base=... --expect-red=AC-1` |

Exit codes: `run.mjs` 0 all green, 1 any ❌, 2 the run itself failed. `control.mjs` **0 when the control went
red where required** (the fix is proven), 1 when it did not (not proven), 2 when it could not run.

Each run writes `qa/walk/runs/<time>-<label>/` (or `--out`): `results.json` and one screenshot per criterion,
named with its verdict (`AC-1-AC2-FAIL.png`). Keep `runs/` out of git (`.gitignore`) and commit only what the
skill's evidence table says to keep.

## A dev server that rebuilds

When the app runs under a dev server, the control must wait for the rebuild after the swap, or it tests the
fixed code and looks like a pass. Point it at the server's log and its ready line:

```
node control.mjs --rev=abc123 --files=src/app/list.ts --section=sections/cr12.mjs \
  --base=http://localhost:4200/ --log=dev-server.log --ready="compiled successfully"
```

Start the dev server with its output going to that file (`npm run dev > dev-server.log 2>&1`).

## A command-line program (skill section 15)

The page is a real terminal: xterm.js in the browser, a real shell behind it through node-pty (forkpty on Linux
and macOS, ConPTY on Windows), the program under test first on its PATH. The walk types each command with
visible keystrokes and reads the exit code from the prompt, `[exit 0] tasks $`. Nothing listens on a port.

Install in the walk's folder (a Go, Rust or Python project has no `package.json` of its own; keep the walk's
there):

```
cd qa/walk
npm install -D @playwright/test@^1.65 @xterm/xterm@^6 @xterm/addon-fit@^0.11 node-pty@^1.1
npm approve-scripts node-pty
cd ../..
node qa/walk/run.mjs --section=sections/example-cli.mjs --channel=chrome
```

`npm approve-scripts node-pty` records node-pty's install script in `package.json` (`allowScripts`), so npm 11
stops warning about it. On Linux node-pty compiles and needs a C++ compiler (`sudo dnf install -y gcc-c++` or
`sudo apt install build-essential`; gcc alone is not enough). Windows and macOS get a ready-made binary.

| Run | Command |
|---|---|
| Headless | `node qa/walk/run.mjs --section=sections/<file>.mjs --channel=chrome` |
| Against an earlier commit (its whole tree, unpacked into the run folder) | add `--rev=<commit>` |
| Keep the built program, the unpacked tree and the scratch folder for a look | add `--keep` |
| The control, whole tree | `node qa/walk/control.mjs --rev=<pre-fix commit> --section=<file> --expect-red=CLI-1` |
| The control, file swap (a program run from the tree, no build) | add `--files=<the files the fix changed>` |

The shell is `bash` (on Windows `pwsh.exe` when PowerShell 7 is on the PATH, else the Windows PowerShell 5.1
every Windows has); `WALK_SHELL` picks another. It starts with no profile, no rc file and no history saved.

A terminal section declares how to get the program onto the PATH:

```js
export const terminal = {
  name: 'tool',                                  // the prompt: [exit 0] tool $
  build: ({ tree, bin }) => execFileSync('go', ['build', '-o', join(bin, process.platform === 'win32' ? 'tool.exe' : 'tool'), './cmd/tool'], { cwd: tree, stdio: 'inherit' }),
  env: ({ scratch }) => ({ TOOL_HOME: scratch }), // optional
  link: ['data'],                                // optional: git-ignored local data, linked into a --rev tree
};
```

Cases drive the terminal through `w.term`: `run(cmd)` types a command and returns `{ exit, out }`; for a
command that asks questions, `start(cmd)`, then `waitFor(/question/, from)` and `answer(text)`, then
`done(from)`; `screen()` is the whole screen as text. `w.ctx` holds `repo`, `tree` (the tree under test),
`rev`, `bin`, `scratch` (removed after the run) and `walkDir`.

A run removes what it built (`bin/`, `scratch/`, the unpacked tree); a `link` folder is unlinked first and
never deleted through, and the run says so loudly if the real folder is gone afterwards.

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
  line is checked against the issue's body and comments (needs `gh` signed in). Work with no issue (a plan row,
  a spec) declares `export const source = ['docs/plan.md']` and is checked against those files instead.
- Keep a `README.md` here for the project's own commands, seats, traps and the table of what has been walked.
