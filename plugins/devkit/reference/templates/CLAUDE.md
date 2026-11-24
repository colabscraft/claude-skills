# <Project name> - <one line: what it does, for whom>

<Two or three lines: the problem, the users, what "done" means for the first release.>

## Stakeholders

| Who | Role |
|---|---|
| <name> | <client / sponsor / decides scope> |
| <name> | <tester: files the issues, closes them> |
| <you> | <developer> |

## WHERE THE WORK IS - print this at the start of every session

`<docs/plan/01-foundation.md>` section "Status" is THE status table: one row per item, a status
(`not started` / `in progress` / `done` / `blocked on <what>` / `unknown`) and the date it moved.
**Print it as a markdown table before touching anything**, then take the first row that is not done.
Read the status out of it; never re-derive one from git log or memory.
`RESUME.md` "PICK UP HERE" says where the last session stopped. Run `/devkit:checkpoint` before
clearing context. The patterns behind this file: the devkit plugin's gold reference
(`/devkit:new-project` explains any of them).

## Golden rules

- **A feature is not done until** it is (1) built with its tests, (2) walked in a real browser
  (`/devkit:watched-walk`: headless twice, a control run on the old code that goes red, a headed
  round I watch), (3) in the user manual <and its PDF / training>, (4) in the release notes.
- **Releases are asked, one at a time.** Back up the database first. Staging, then production,
  from the same commit. A release carries the data through; never reseed or wipe a server that holds
  real people's data.
- **Schema changes only as numbered migrations** in `<path>`.
- **No credentials in git, ever.** Secrets live in `<where: a 0600 file outside the repo / a vault>`;
  name where, never print the value.
- **Never test against the live server of the people who report bugs.** Local first, our own
  staging second.
- **Stop what you start**: dev servers, build daemons, browsers, containers. No container
  auto-starts (`restart: "no"`).
- **No em-dash or en-dash characters** anywhere; use a plain hyphen.

## GitHub

- Repo `<owner>/<repo>`, board `<project name>`: Backlog -> In Progress -> In review -> Done.
- Issues and replies in **English**; Thai only for a label the reader sees on screen
  (`<ปุ่มบันทึก>`), glossed once.
- Short, bullets and tables first; what the reader must decide goes at the top.
- @-mention the issue's creator on every reply to an issue they opened (read the handle from the
  issue, never from memory). No mention on issues we filed ourselves.
- The reply answers every row the reporter wrote, by their number. **The reporter closes their
  own issue**; we move it to In review.
- Every push, issue, comment and board change is asked first.

## Commands

| What | Command |
|---|---|
| Install | `<...>` |
| Run locally | `<...>` |
| Unit / server tests | `<...>` |
| Browser specs | `<...>` |
| Walk | `node qa/walk/run.mjs --section=<file>` |
| Build the manual | `<...>` |
| Deploy to staging (asked) | `<...>` |

## How it is built

- Stack: `<front end>`, `<back end>`, `<database>`. `<Where each lives in the repo.>`
- `<The few conventions a newcomer would get wrong: where workflow rules live, how roles are
  checked, how tenants are separated, what the UI must never use.>`
- Dependencies: latest stable, upgraded with each framework's own migration tool, ending on a
  clean build with 0 warnings.

## Decisions locked

| Date | Decision | Who | Why |
|---|---|---|---|
| <YYYY-MM-DD> | <...> | <...> | <...> |

## On Windows

- Git for Windows installed (Claude Code's Bash tool uses Git Bash); scripts in Node or bash, not cmd.
- Forward slashes in paths inside scripts and config.
- `.gitattributes` with `* text=auto eol=lf`, so scripts and fixtures stay LF.
- Projects under `%USERPROFILE%\projects\<name>`, not on the Desktop or in OneDrive.
