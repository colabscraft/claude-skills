# claude-skills

Claude Code skills and a **gold reference** for building and running a web app project: how the work is
planned, proven, released and reported, and how the application is structured so it stays correct as it grows.
It is a plugin marketplace (`devkit`) with one plugin (`devkit`).

**Start here:** [`plugins/devkit/reference/`](plugins/devkit/reference/) - the gold reference: 14 workflow and
22 architecture patterns, each with the rule, why, how and a check, plus templates to start a project from.

| Skill | Use it when | Needs |
|---|---|---|
| `new-project` | Starting a fresh project: reads the gold reference, asks the decisions, sorts the patterns into now / later / not applicable, scaffolds `CLAUDE.md`, `RESUME.md`, a plan with a status table and the GitHub files. Later: "how does the reference handle X?" | nothing |
| `checkpoint` | Context is filling up, or you are about to clear it: brings memory and the plan's status table up to date, then prints the resume prompt for the fresh session | nothing |
| `watched-walk` | A UI bug or change request is fixed: proves it with a scripted walk of the issue's own criteria, a control run that must go red, then a headed run you watch. Comes with a runnable walk template | Node 20+, `@playwright/test` 1.63+ in the project, Chrome or Edge |
| `playwright-cli` | Driving a browser from the terminal: snapshots, clicks, screenshots, tests | Node 20+, `npm install -g @playwright/cli@0.1.25` |
| `live-demo-site` | A training or demo site where the real app does the work live, step by step, under a control panel | Node 20+, pnpm |

Invoke a skill as `/devkit:<skill>` (for example `/devkit:new-project`), or just by name (`/new-project`) when
nothing else on your machine already uses that name. Claude also picks a skill up by itself when the task
matches its description.

## Install on Windows 11

Checked against the Claude Code docs on 2026-11-24 (setup, plugins, troubleshooting). Report any error with
its exact text.

### 1. Prerequisites (once)

In PowerShell:

```powershell
# Claude Code itself (no Administrator needed)
irm https://claude.ai/install.ps1 | iex

# Git for Windows: plugins are fetched with git, and Claude Code's Bash tool uses Git Bash.
# In the installer, keep "Git from the command line and also from 3rd-party software" (adds git to PATH).
winget install --id Git.Git -e

# GitHub CLI: for your own repos, and for the walk's issue quote check
winget install --id GitHub.cli -e

# Node.js LTS (20 or newer) for the browser skills
winget install --id OpenJS.NodeJS.LTS -e

# Let npm's command shims run in PowerShell (the default policy blocks npm, pnpm, playwright-cli)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Close and reopen the terminal so the new commands are on PATH, then check each one answers:

```powershell
claude --version; git --version; gh --version; node --version
```

Run `claude` once and sign in, then `/exit`. Sign in to GitHub with your own account: `gh auth login`, then
`gh auth setup-git`.

### 2. Add the marketplace and install the plugin

```powershell
claude plugin marketplace add https://github.com/colabscraft/claude-skills.git
claude plugin install devkit@devkit
claude plugin list
```

Inside a session, `/plugin marketplace add ...` and `/plugin install ...` do the same. Start `claude` in any
folder and type `/devkit:` to see the five skills.

> [!NOTE]
> If this repository is made private later, adding it and updating it need read access to it for your
> GitHub account, plus the sign-in stored by `gh auth setup-git`. Without that, updates stop quietly and the
> installed copy stays as it is.

### 3. The browser tools (for `playwright-cli`, `watched-walk`, `live-demo-site`)

```powershell
npm install -g @playwright/cli@0.1.25 pnpm
playwright-cli --version
```

## Start a project

1. Create the folder under `%USERPROFILE%\projects\<name>` (not the Desktop or OneDrive) and start `claude`
   in it.
2. Run `/devkit:new-project`. It asks the decisions, shows every pattern sorted into now / later / not
   applicable for you to adjust, then writes `CLAUDE.md`, `RESUME.md`, `docs/plan/01-foundation.md` and the
   GitHub files, and commits locally. Creating the GitHub repo and pushing are asked.
3. From then on: each session starts by printing the plan's status table; before clearing context, run
   `/devkit:checkpoint` and paste its prompt into the fresh session; when a UI fix is done, `/devkit:watched-walk`.

## Updates

- **Auto-update is off** for a third-party marketplace until you turn it on: in a session, `/plugin` ->
  **Marketplaces** -> `devkit` -> enable auto-update.
- **By hand:**

  ```powershell
  claude plugin marketplace update devkit
  claude plugin update devkit@devkit
  ```

  then `/reload-plugins` in an open session, or restart it.
- The plugin has **no `version` field on purpose**: the installed version is the commit, so every commit on
  `main` is an update. (`claude plugin validate` warns about the missing version; that is expected.)

## Without the plugin (copy route)

Copy a folder from `plugins/devkit/skills/` to `%USERPROFILE%\.claude\skills\` (for example
`%USERPROFILE%\.claude\skills\checkpoint\SKILL.md`). It is then `/checkpoint` with no prefix, and it does not
update: copy again after each change here. `new-project` also needs `plugins/devkit/reference/`, which the copy
route does not carry: use the plugin for it.

## Changing a skill

1. Edit under `plugins/devkit/`. Keep it generic: no machine paths, accounts, passwords, customer names or
   customer data. A project-specific detail goes in that project's own `README.md` or `CLAUDE.md`.
2. No em-dash or en-dash characters; use a plain hyphen.
3. `claude plugin validate .` must pass (the version warning is expected).
4. Commit and push to `main`; installed copies pick it up on their next update.

`playwright-cli` is Microsoft's skill, vendored unchanged (Apache-2.0): see its `NOTICE.md` before touching it.
