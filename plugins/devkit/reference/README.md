# The gold reference

The workflow and architecture patterns that held up on a production web app: real users, a
customer's own server, releases every few days, one developer working with Claude Code. That app is Go +
TypeScript + PostgreSQL; **the patterns are not tied to a stack**. Each one is a rule, the reason for it, how to
build it, and how to check it, written so you can apply it without ever seeing the original code.

| File | What is in it |
|---|---|
| [`workflow.md`](workflow.md) | W1-W14: how the work is planned, proven, released and reported |
| [`architecture.md`](architecture.md) | A1-A22: how the application is structured so it stays correct as it grows |
| [`templates/`](templates/) | Files to start a project from: `CLAUDE.md`, `RESUME.md`, a plan with a status table, `.gitattributes`, GitHub issue templates and the "only the reporter closes" workflow |

The skills in this plugin carry the method: **`/devkit:new-project`** reads this folder and starts a project
from it; `/devkit:checkpoint` (W1, W2), `/devkit:watched-walk` (W5, W6, with a runnable walk template),
`/devkit:live-demo-site` (training sites), `/devkit:playwright-cli` (driving a browser).

## How to use it

- **New project:** start `claude` in the empty project folder and run `/devkit:new-project`. It asks the
  decisions that shape the project, sorts every pattern below into *now / later / not applicable*, then writes
  the starting files from `templates/`.
- **Later, in any project:** ask Claude *"how does the gold reference handle X?"*; `/devkit:new-project` finds
  the pattern and explains it for your stack.
- **By hand:** read the index below, open the pattern, copy the template you need.

Start small. A pattern earns its place when the project hits the problem it solves; the *later* column with its
trigger ("when the first customer server exists") is how you keep that promise without forgetting it.

## The index

### Workflow ([`workflow.md`](workflow.md))

| # | Pattern |
|---|---|
| W1 | One status table, written down, never derived |
| W2 | A resume doc + a checkpoint before every context clear |
| W3 | One plan file per big change, with numbered decisions |
| W4 | Decisions as choices, recommended option first |
| W5 | Definition of done: tests, walk, manual, release notes |
| W6 | The walk quotes the issue and needs a control run |
| W7 | Issue flow on a board; only the reporter closes |
| W8 | A new version on every deploy, visible in the app |
| W9 | One release, staging then production, the same commit |
| W10 | A release carries the data through; back up first |
| W11 | Test tiers by risk |
| W12 | A generated document carries a `--check` |
| W13 | A service report after every session on a customer's machine |
| W14 | A customer's machine is their zone |

### Architecture ([`architecture.md`](architecture.md))

| # | Pattern |
|---|---|
| A1 | The workflow is data |
| A2 | Two engines, one parity fixture |
| A3 | Wire types generated from the server |
| A4 | The API inventory is data |
| A5 | Permissions transcribed, with a test that reads the other side |
| A6 | Tenancy is a data boundary |
| A7 | The wrong-seat suite |
| A8 | Modules per organisation, enforced by the server |
| A9 | The product is generic; a customer is a deployment profile |
| A10 | Schema changes only as numbered migrations |
| A11 | External sign-in, no stored passwords, invite-only |
| A12 | Generic CRUD writes exactly what the browser declares |
| A13 | Every write audited; personal columns sealed |
| A14 | Side effects are a registry |
| A15 | A mock API for the browser; the same specs against the real server |
| A16 | Build configurations checked by a test |
| A17 | One allow-list for what a release opens |
| A18 | A ratchet test for gradual work |
| A19 | Operations are commands in the binary |
| A20 | Open-source notices generated, licences checked |
| A21 | The app's own dialogs and date pickers |
| A22 | The manual, its PDF and the training ship inside the release |

## The proof, in one picture

```
unit + server tests  ->  wrong-seat suite (A7)  ->  browser specs on the mock and on the real server (A15)
        ->  the walk: headless x2, control red, headed and watched (W6)
        ->  manual + PDF + training + release notes (W5)  ->  staging  ->  production, same commit (W9)
```

## Rules that come with it

- **Your project's data stays in your project.** Customer names, people, accounts, hostnames and documents do
  not go into a shared repo, a public issue, a screenshot or a fixture.
- **No credential in git, ever.** Name where a secret lives; never paste the value.
- **Every write to someone else's system is asked first**: a push, an issue, a deploy, a database change.
