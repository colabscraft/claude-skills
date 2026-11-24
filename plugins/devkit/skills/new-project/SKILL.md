---
name: new-project
description: Start a fresh project from the devkit gold reference - read the plugin's reference/ folder (14 workflow and 22 architecture patterns, plus templates), ask the few decisions that shape the project, sort every pattern into now / later / not applicable, then scaffold CLAUDE.md, RESUME.md, a plan with a status table and the GitHub files. Also answers "how does the gold reference handle X?" later in any project. Use when the user starts a new repo or project, says "new project", "gold reference", "set up CLAUDE.md", or asks how the reference handles something.
---

# New project, from the gold reference

The gold reference is the `reference/` folder at the root of this plugin, two levels above this file
(`../../reference/` from here):

| File | Holds |
|---|---|
| `reference/README.md` | how to use it, the index of every pattern, the rules that come with it |
| `reference/workflow.md` | W1-W14: plan, prove, release, report |
| `reference/architecture.md` | A1-A22: structure that stays correct as the app grows |
| `reference/templates/` | `CLAUDE.md`, `RESUME.md`, `plan.md`, `gitattributes`, `github/ISSUE_TEMPLATE/*.yml`, `github/workflows/issue-close-guard.yml` |

If the folder cannot be found on disk, read the same files from
`https://github.com/colabscraft/claude-skills/tree/main/plugins/devkit/reference` and say that you did.

**Two modes:**
- **Start** (section 2): a new, empty or nearly empty repo.
- **Ask** (section 3): any time later, "how does the reference handle X?".

## 1. 🔴 Rules

1. **Read before you write.** `reference/README.md`, then the whole of `workflow.md` and `architecture.md`
   for the patterns you are about to adopt. Do not reconstruct a pattern from its one-line index entry.
2. **The project's own data stays in the project.** Customer names, people, accounts, hostnames and
   documents never go into a shared or public repo, an issue, a screenshot or a fixture.
3. **Scaffold only what has content.** No empty folders, placeholder harnesses or "for later" files. A
   pattern that is not needed yet is a row in the plan, with its trigger.
4. **Every GitHub write is asked** (creating the repo, pushing, issues, boards), one at a time, on the
   user's own account.
5. **No credential** in any file, prompt or commit.

## 2. Start a project

### 2.1 Ask the decisions (AskUserQuestion, recommended option first, at most 4 per call)

| # | Decision | Shapes |
|---|---|---|
| Q1 | Name, one-line purpose, who it is for | the `CLAUDE.md` header |
| Q2 | Stack: front end, back end, database (recommend what the user already knows) | commands, which A-patterns apply |
| Q3 | Who files issues and who decides scope | stakeholders, the issue flow (W7) |
| Q4 | Does it have a browser UI, or a command line people type into? Several organisations or customers in one install? Roles? | walks (W5, W6; a CLI is walked in a terminal), tenancy (A6-A8), permissions (A5) |
| Q5 | Where it runs: local only for now, a staging server, a customer's machine | releases (W8-W10), service reports (W13, W14) |
| Q6 | UI language (Thai-first?), the GitHub owner/repo and board | the `CLAUDE.md` GitHub section |

Take development details yourself (folder layout, test runner, lint) and say what you chose. Ask only what
the user must own.

### 2.2 Choose the patterns

Go through every W and A pattern and put each in one of three columns: **now**, **later (with the trigger:
"when the first customer server exists")**, **not applicable (why)**. Always **now**: W1, W2, W3, W4, W7, the
`CLAUDE.md` rules, and W12 once something is generated. Show the table and let the user move rows before
writing anything.

For each **now** pattern, follow its **How** in the reference, written for this project's stack.

### 2.3 Scaffold (local only)

| File | From |
|---|---|
| `CLAUDE.md` | `templates/CLAUDE.md`, every `<...>` filled from 2.1, unused sections deleted |
| `docs/plan/01-foundation.md` | `templates/plan.md`: the decisions (D1, D2... with date and who), the pattern table from 2.2, the status table with row 1 = the first concrete step |
| `RESUME.md` | `templates/RESUME.md`, `PICK UP HERE` filled |
| `.gitattributes` | `templates/gitattributes` |
| `.gitignore` | the stack's own |
| `.github/ISSUE_TEMPLATE/` | `templates/github/ISSUE_TEMPLATE/` with the app's name filled in, only if the repo is on GitHub |
| `.github/workflows/issue-close-guard.yml` | `templates/github/workflows/`, only if the repo is on GitHub and someone other than the developer files issues |

Then `git init` (if needed) and commit locally. Creating the GitHub repo and pushing are asked (rule 4).

### 2.4 Hand over

- Print the plan's status table.
- Say which patterns are **now** and which are **later**, with their triggers.
- Name the first concrete task (row 1 of the table).
- Remind: `/devkit:checkpoint` before clearing context; `/devkit:watched-walk` when the first UI fix is done
  (its `template/` folder is the walk runner to copy into `qa/walk/`).

## 3. Ask: "how does the reference handle X?"

1. Find the pattern in `reference/README.md`'s index; read it in `workflow.md` or `architecture.md`.
2. Explain it in THIS project's terms: the rule, why, and how it would look on this stack, with a small
   example in the project's language.
3. If the user adopts it, add a row to the project's plan, then build it there.

If no pattern covers X, say so plainly and answer from general practice, marked as not from the reference.

## 4. On Windows

- Run `git` and `claude` from PowerShell or Git Bash; both work.
- Write paths with forward slashes inside files and scripts.
- Projects go under `%USERPROFILE%\projects\<name>`, not on the Desktop or in OneDrive (sync locks files that
  git and Node are writing).
