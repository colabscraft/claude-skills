# Workflow patterns (W1-W14)

How the work is planned, proven, released and reported. Each pattern: the **rule**, **why**, **how**, and how
to **check** it is working. Back to the [index](README.md).

---

## W1. One status table, written down, never derived

**Rule.** The project's plan lives in a committed file with ONE status table: one row per item, a blunt
status, the date it last moved. Every session prints that table before touching anything.

**Why.** A status worked out at the start of a session from git log, memory and the last chat is a guess, and
it is wrong in the costly direction: started work reads as finished.

**How.**
- One file, for example `docs/plan/01-foundation.md`, section "Status" (template: [`templates/plan.md`](templates/plan.md)).
- Statuses: `not started` / `in progress` / `done` / `blocked on <what>`, and `unknown` when you cannot
  substantiate one. Never upgrade a guess.
- A new request becomes a new row at the foot, with the date. A row that changes direction is moved in place,
  with the date it moved; nothing is silently deleted.
- `CLAUDE.md` tells every session to print it first (the template does).

**Check.** Ask a fresh session "what is next?": it should answer from the table, quoting a row.

## W2. A resume doc + a checkpoint before every context clear

**Rule.** `RESUME.md` holds a `PICK UP HERE` section: the state in one line, the next concrete action, the
rules that changed, the traps. Before clearing context, run `/devkit:checkpoint`: it corrects what became
false, updates the status table, and prints the resume prompt for the fresh session.

**Why.** A stale resume doc is worse than none: the next session cannot tell it is lying. The step that fails
is correcting, not adding.

**How.** [`templates/RESUME.md`](templates/RESUME.md). Newest state on top; older states move down under a
dated heading. Absolute dates only (`2026-11-24`, never "today"). Never state a test result you did not run in
that session.

**Check.** The first line of every resume prompt names the plan file and says to print its table.

## W3. One plan file per big change, with numbered decisions

**Rule.** A change that takes more than a day gets its own plan file: the problem, the decisions (D1, D2...)
with who decided and when, the steps (T1, T2...), then "what was built" once it is.

**Why.** When only the code records a decision, the next session re-opens it. A numbered decision can be cited
("per D4") and changed explicitly.

**How.**
- `docs/plan/NN-short-name.md`, numbered in order.
- Decisions as a table: `# | Decision | Chosen | Who | Date | Why`.
- Link the plan from its row in the status table (W1).

**Check.** For any non-obvious choice in the code, you can find the D-number that made it.

## W4. Decisions as choices, recommended option first

**Rule.** When a decision belongs to the client or the project owner, ask it as 2-4 concrete options with the
recommended one first and its trade-off in one line. Development details (folder layout, test runner, naming)
are the developer's: decide, say what you chose, move on.

**Why.** An open question stalls; a recommendation gets a fast yes or a useful no. Asking about every detail
wears out the person who has to answer.

**How.** In Claude Code, the question tool shows options; in an issue, a table of options with "Recommended"
on the first row. Record the answer as a D-row (W3).

**Check.** No question in an issue or chat is open-ended when it could have been a choice.

## W5. Definition of done: tests, walk, manual, release notes

**Rule.** A feature, change request or fix is done only when, in this order:
1. it is built with its tests (unit, server, browser specs as they apply);
2. it is **walked** in a real browser on the real screens (W6), with the screenshots read;
3. the **user manual** (and its PDF, and the training if there is one) shows it, from fresh screenshots;
4. a **release-notes** line says what changed for users.

A change with no new screen still takes steps 2-4 for the screens that show its effect; if the manual truly
needs no change, say so with the screenshots that prove it.

**Why.** A green test suite is not proof someone can use the feature, and an undocumented feature turns into
support calls. Skipping the manual once made every screenshot in it stale after a logo change.

**How.**
- Manual screenshots come from scripts (Playwright), one capture script per chapter, so a UI change is
  recaptured with one command, never by hand.
- Release notes: one page, newest version first, user language, no internal jargon.
- The walk's cases (W6) and the manual's steps describe the same actions; when a feature changes what a
  tester does, update both.

**Check.** Pick a feature from the last release: it has a walk result, a manual page and a release-notes line.

## W6. The walk quotes the issue and needs a control run

**Rule.** Each acceptance criterion of an issue is a case in a scripted browser walk, quoting the reporter's
own words. The walk runs headless until green twice, then **against the pre-fix code, where it must go red**
(the control), then headed while the developer or owner watches.

**Why.** A walk that cannot fail proves nothing. A control that stays green means the fix is unproven, however
good the green run looks.

**How.** `/devkit:watched-walk` carries the method and a runnable template (`skills/watched-walk/template/`):
the narration drawn over the page, verdict cards, the summary, and the scripted control swap that restores the
files whatever happens.

**Check.** Every fix that reached users has a walk result AND a red control result on record.

## W7. Issue flow on a board; only the reporter closes

**Rule.** Every issue sits on a project board: **Backlog -> In Progress -> In review -> Done**. When work is
finished, reply on the issue and move it to In review. **Only the person who raised the issue closes it.**

**Why.** "Done" must mean the person who asked has checked it. GitHub lets anyone with triage rights close
anything, so the rule needs a guard.

**How.**
- Issue templates for a bug and a change request: [`templates/github/ISSUE_TEMPLATE/`](templates/github/ISSUE_TEMPLATE/).
  Ask for the page URL, the build (W8) and a screenshot: those three let you open the exact screen.
- A workflow that reopens an issue closed by anyone but its author, with a `force-close` label as the
  agreed escape hatch: [`templates/github/workflows/issue-close-guard.yml`](templates/github/workflows/issue-close-guard.yml).
- The reply answers every row the reporter wrote, by their number and in their order; a row not met yet says
  why. Short, bullets, tables; what the reader must decide goes at the top.
- @-mention the creator on replies to an issue THEY opened. An issue we filed ourselves gets no mention.

**Check.** No issue on the board is Done without its author closing it.

## W8. A new version on every deploy, visible in the app

**Rule.** Every deployment gets a new version (for example `2026.1.0-beta12`), the bump is committed, and the
running build shows `version · commit · build time` on the sign-in page and in an About page, and serves it as
`/build-info.json`.

**Why.** A bug report or a screenshot can then be matched to the exact build, and "is it fixed?" has an answer.

**How.**
- `YEAR.MAJOR.MINOR-betaN` is valid semver; the year is the major. A script bumps `N` and commits; the deploy
  script calls it, so nobody forgets.
- The build writes `build-info.json` (version, commit, time, and a `+` when built from uncommitted work).
- A test asserts the stamp is on the sign-in page and in About.

**Check.** `curl https://<host>/build-info.json` names the commit you just deployed.

## W9. One release, staging then production, the same commit

**Rule.** A release goes to staging first, then to production **from the same commit**. The production
package refuses to build unless staging is serving that commit.

**Why.** What reaches production is exactly what was tested, nothing rebuilt or "slightly fixed" in between.

**How.** The production build script fetches staging's `/build-info.json` and compares the commit with
`git rev-parse HEAD`; a mismatch stops the build with a message saying so.

**Check.** Production's `build-info.json` and staging's name the same commit after every release.

## W10. A release carries the data through; back up first

**Rule.** Once real people use a server, a release is new code plus migrations that carry every row through,
nothing else. Back up the database before every release. Wiping, reseeding or restoring refuses to run
without an explicit override.

**Why.** Real users' data outlives every release, and a reseed meant for a test box run on the wrong box is
unrecoverable.

**How.**
- The deploy script takes a dated backup before it touches anything, and stops if the backup fails.
- Destructive commands check an environment variable with a deliberate, ugly value
  (`ALLOW_WIPE=yes-i-asked-for-this`) and refuse otherwise.
- Count the rows of every table before and after a release; the counts must match (except what the release
  meant to change).

**Check.** Each release's log shows a backup file and identical counts.

## W11. Test tiers by risk

**Rule.** Per fix: the specs that touch it. Release gate: a smoke set plus every spec the batch touched. **The
full suite** before a release that carries a schema migration, a workflow-definition change or an
auth/permission change; otherwise it can run after the release, and a red is fixed in the next one.

**Why.** A full browser run can take an hour; risk decides when that hour is worth it.

**How.** A named smoke script in the project's package scripts, listing the 5-10 specs that cover sign-in and
the main flow.

**Check.** The release notes for a migration release mention a full run.

## W12. A generated document carries a `--check`

**Rule.** Anything generated from a source (a translated diagram, a notices file, a tracker issue, API types)
has a generator with a `--check` mode that fails when the committed copy is stale, and a test or CI step runs
it.

**Why.** A copied list with no guard goes stale silently, and a stale document misleads with authority.

**How.** The generator writes to a temp file and compares; `--check` exits non-zero on a difference and prints
the command that fixes it. Record the source's hash in the output when the source is an outside file.

**Check.** Change the source without regenerating: the test fails.

## W13. A service report after every session on a customer's machine

**Rule.** After every session on a server the customer owns, write a short report: when (with the access
window), what was done, what changed, what was verified, what is left.

**Why.** The customer's IT has to account for every access to their machine; so do we. A report written after
the fact from memory is never complete, so capture the access times BEFORE disconnecting.

**How.** A dated file per session (`docs/service-reports/YYYY-MM-DD-service-report.md`), headings: Window,
Done, Changed, Verified, Left, Contact.

**Check.** Every access to a customer machine has a report.

## W14. A customer's machine is their zone

**Rule.** Least privilege, everything inside your own user's folder, nothing installed system-wide, nothing
left running unattended, every write asked, no probing beyond what was granted, no credential in git.

**Why.** Access to a customer's server exists on trust and can be withdrawn, and a security incident there is
far worse than a delay.

**How.** Bind services to localhost; run as your own user; keep releases as a package + an install script the
customer's IT could run themselves (and may one day have to).

**Check.** You could hand the customer a list of everything you ever changed on their machine.
