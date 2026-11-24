---
name: watched-walk
description: Prove a UI bug/CR fix with a scripted walk through the issue's own acceptance criteria - a headless dry run green twice, a CONTROL run against the original code that must go red, then a headed run the user watches, driven on the real screen with a narration drawn over the page (bottom-left step caption, a top-centre verdict card that clears, a summary card; one issue per round, briefed first on the problem, the fix and what to expect) - before anything is deployed. Use when finishing a bug or CR fix that changes what a person sees or does in a browser, when the user says "walk it", "headed run", "control run", "prove the fix", or when about to reply to a tester/reporter that a fix is ready.
---

# The watched walk

A second proof on top of the tests, for a fix that changes what a person sees or does.
A real browser walks **the issue's own words** on the screen the issue is about - a step
caption at the bottom-left, a ✅/❌ card per acceptance criterion quoting the issue verbatim that
then gets out of the way - first headless for the machine, then **headed, on the user's screen,
while they watch**. 🏆 A runnable template comes with it: `template/` beside this file (§13).

**Applies to:** a UI bug/CR fix, before deploy or before replying to whoever reported it.
**Does NOT apply to:** CLI/library work, API-only changes with no screen, compliance
sweeps, infrastructure runbooks. If the repo has no browser, stop and say so - do not
invent a walk.

## Provenance, and why this is a skill at all

This pattern was hand-ported once between two repos. **The mechanism travelled; the safety
rules did not.** Measured on the two READMEs afterwards: the word `control` appeared **9
times in the destination and 0 times in the origin**, `presence` 1 and 0. The origin repo
kept shipping fixes on walks that could have gone green against broken code. Every rule below
that is marked 🔴 is one that failed to survive a hand-port. **Carry them deliberately.**

## 1. The loop - six steps, none skippable

1. **Fix it, and prove it its own way FIRST.** A unit/API harness red on the original code,
   or a render with a control. The walk is the *second* proof, never the first and never the
   only one.
2. **Script the section**, then **run it headless until green TWICE.** The second run is what
   proves `arrange` and `cleanup` - a section that only passes on a clean fixture is not a
   section. Diagnose every red before going on.
3. 🔴 **CONTROL RUN against the original code** - see §4. This is the step that gets skipped
   and it is the step that matters.
4. 🔴 **Brief the user, THEN ask for "go".** Before every headed round, in the chat, short
   bullets:
   - **The problem** - what the reporter saw, in their words.
   - **How it was fixed** - one or two lines, what changed on screen.
   - **What to expect this round** - the acceptance criteria in the order the walk shows them,
     plus anything that stays the same ON PURPOSE (so a non-change does not look like a miss).
   Name what the run writes and anything shared it briefly changes. A headed run takes their
   attention; do not start one unasked, and never start one unbriefed. 🚨 If the brief has to
   say *"watch the verdicts, not the screen"*, the case is not driving the screen - fix the case
   (§2), do not brief around it.
5. **Run it headed in the background**, output to a log, and read **only the summary lines**.
   They are watching the screen; you are watching the verdict. **You drive the browser; they
   only watch** - never hand them steps to click themselves. The run ends on a summary card
   (one row per criterion) held on screen before the browser closes.

**One issue per headed round by default.** Group several issues into ONE round only when that
is clearer for the watcher - same screen, same seat, one flows into the next - and say why in
the brief. A round that mixes unrelated fixes makes each verdict harder to follow.
6. **Record the verdicts in the repo**, commit, push. **A deploy is a separate ask.**

## 2. 🔴 The walk drives the screen

The headed round exists so the user SEES the fix work. Do every step the way a person does
it - open the tab, use the screen's own picker / button / field, let the toast and the result
(row, card, chart) appear - and only THEN score the verdict.

- The VERDICT may - often should - come from where a person cannot look: the data store, the
  stored file read by an independent reader, a byte search. It sits **behind** a visible action,
  never **instead of** one.
- 🚨 A background `fetch` / API call is allowed only for an endpoint **no screen calls**, and the
  step caption says so (*"no screen calls this any more - sent from this page, as a script
  would"*).
- 🚨 Measured 2026-10-04 on a reporting app: a case that uploaded through background `fetch`
  and judged the files on disk scored 7 ✅ while the page never moved - it even sat on the wrong
  tab. The watcher asked whether the walk was stuck. Reworked to use the screen's own picker,
  the same verdicts came with the toast and the new card in view.
- Pace for the eye: scroll the target into view, pause after each click, type with a visible
  keystroke delay (`pressSequentially`), and hold on the result (toast, new row) before a verdict
  card covers anything.

## 3. What the watcher sees - the narration

The template (§13) draws exactly this. When a repo's own runner and the template disagree about how a walk
LOOKS, the template wins. Port its narration; do not port anyone's auth (§10).

| Element | Where, and for how long | Built with |
|---|---|---|
| **Chapter card** - case id + title | centred, ~2.5 s, then gone | `page.screencast.showChapter` |
| **Step caption** - `case · STEP n` over the reporter's words | **bottom-left**, ≤ ~60% wide, until the next step replaces it | `page.screencast.showOverlay` |
| **Action callout** - each click / typed text, moving cursor | top-right, ~1 s each | `page.screencast.showActions` |
| **Verdict card** - ✅/❌/⏳, the criterion, the measurement | **top-centre**, ≤ ~880 px, coloured border, held ~4 s, **then gone** | `showOverlay(html, { duration })` |
| **Tally** (optional) - `case · label · ✅ n ❌ n ⏳ n` | bottom-right pill | `showOverlay` |
| **Summary card** - one row per criterion | centred over a dimmed page at the end, held before close | `showOverlay` |

- 🔴 **Never insert the narration into the page's DOM.** A full-width bar inserted at the top
  (one project, until 2026-10-04) hid the toolbar for the whole run, took clicks meant for the
  page (case after case grew "remove the banner before clicking" code) and sat in every DOM
  query. Playwright's screencast overlays are drawn OVER the page - **measured**: they never take
  a click and are not in the DOM. (`page.screencast` is in Playwright 1.63; on an older one,
  upgrade. A DOM fallback must copy the same LAYOUT, auto-hide, and
  `pointer-events:none`.)
- 🔴 **Overlays ARE in a screenshot** and hide what is under them. Take the evidence screenshot
  **before** the verdict card, and take any pixel comparison with the narration off.
- The narration is for the watcher: a **headless run draws none** (fast, clean evidence). Give
  the runner a flag (e.g. `--narrate`) that draws it headless, to check the narration itself.
- Hold times hang off ONE pace knob (`--pace`, or `--delay` + `--hold`): "slower" from the
  watcher is a flag on the next run, never a code change.
- Hide the action callout while a secret is typed (`hideActions` → type → `showActions`).
- **One window per seat**, offset so they do not stack (`--window-position`, fixed size), and
  launch Chrome without the automation strip (`ignoreDefaultArgs: ['--enable-automation']`,
  sandbox on) so no warning bar pushes the page down into the evidence.

## 4. 🔴 The control run is a law, not a nicety

Swap the files the fix touched back to their pre-fix content, re-run the case that carries
the fix, and **require it to go ❌ on the clause the fix is for.**

- **A control that stays green proves nothing.** Say *"not yet proven"* - never ship on it,
  never soften it to "probably fine". The instrument that FOUND the bug is the one that must
  clear it.
- 🚨 **Script the swap; never do it by hand.** A hand-swapped file that ran before the dev
  server had rebuilt exercised the **fixed** bundle and looked exactly like a passing control.
  Wait for the rebuild signal in the server log (or restart the backend) before running, and
  restore on exit whatever happens (a `trap` in bash, `try/finally` in Node or PowerShell).
- 🚨 **Label the run** (`--label=control`) so it is distinguishable from an ordinary one in
  the evidence tree afterwards. An unlabelled control is indistinguishable from a normal run
  a week later.
- 🚨 **A control that cannot SCORE also proves nothing.** If the runner crashes - an armed
  waiter abandoned, an unhandled rejection - you get a stack trace where you needed a row of
  ❌. Make failure render as a verdict.
- 🚨 **If the control cannot force the failing condition, it has only one arm.** See §8.

### 4b. 🔴 A change that reaches another app: walk the whole path, and cut the sync once

Measured 2026-11-13 on a content studio and the client app it publishes to: every walk judged
the client app's side on a labelled stand-in page, so "approved in the studio, never in the
app" was never walked. When the change's content or settings reach a client app:

- Walk the **whole path** on the **real client** (its own server and its own screen, from a
  pinned commit, against the local server under test): the change, the publish that carries
  it, the client's server taking it, the client's screen showing it. Headless **and** headed.
  A stand-in page no longer counts for the app's side.
- Besides the control, run a **sync-off** pass: the build under test with the client's feed
  cut once the section's setup is done (a pass-through proxy on the client's server-side
  road, the browser untouched). The sync clauses must go ❌, the server's own clauses ✅.
  A section that never says its setup is done cuts nothing: report that, never count it.
- Wait for the client's revision **inside** a verdict, never before it, so a missing sync is
  scored as ❌, not a crash.

## 5. The verdict vocabulary - three outcomes, and ⏳ is not a pass

| | Meaning |
|---|---|
| ✅ | The assertion written for that clause held |
| ⏳ | The **data** or an **outside party** cannot show this clause - and the reason is stated on the banner |
| ❌ | A real defect. Back through the loop |

⏳ is for *"this needs a real customer account we must not touch"*, not for *"the selector
was awkward"*. A clause you could not be bothered to assert is ❌ on your own work, not ⏳.

## 6. The script IS the issue

Every step line and every expected line in a case must be **the reporter's own words, quoted
word for word**, and the runner should **refuse to start** when a quote is not found in the
issue.

- 🚨 **Fetch the body AND the comments.** Acceptance criteria are not always in the body - a
  requirement reversed in a comment made every correct quote look invented. Flatten whitespace
  before comparing.
- Translating or paraphrasing the reporter's line breaks the whole point: the banner they
  watch must be the sentence they wrote.
- A section for **our own** regression (nothing filed) declares no issue and skips the check.
  That is not a way to opt out of quoting a real one.

## 7. Evidence - decide at WRITE time, not in a cleanup later

One repo reached **4.6 GB of walk evidence in ten days**, 96% of it trace files, **not one
ever cited by name**. So:

| Artefact | Write / commit when |
|---|---|
| The results file (the verdict itself) | **always** |
| A trace | the run went **red** · or it is a **CONTROL** · or it is **headed** · or explicitly asked for |
| A screenshot | always to disk; **commit** only failures, errors, headed runs, control runs |

🔑 **A control run keeps its trace even when GREEN** - a blanket retain-on-failure throws away
exactly the run you most need to replay, because a green control means the fix is unproven,
which is the hardest thing to diagnose from a summary line.
🔑 **Put the verdict in the FILENAME** (`AC1-2-FAIL.png`). Ignore rules cannot read JSON.
🔑 **A trace's life ends when the issue closes.** Prune on a schedule the runner itself calls.

## 8. 🚨 Writing a case that can actually fail

Four traps, each of which has reported a **working product as broken**, or a broken one as fine:

- 🔴 **Every absence check needs a presence check beside it, first.** A locator that matches
  nothing satisfies "count is 0" for entirely the wrong reason - including on a page that
  never rendered. Assert the thing is there, *then* assert the bad thing is not.
- 🔴 **"The request finished" from the browser-automation channel is not "the page has the
  response."** It is delivered out of band and lags the page, so correctly serialised requests
  get counted as overlapping. Measure timing **inside the page** (Resource Timing) when the
  assertion is about concurrency.
- 🔴 **A race you cannot force is not being tested.** Against a warm local backend a round trip
  can be faster than the automation's own round trips, so the "burst" never overlaps - **even
  on the broken code** - and the control comes back green. Hold the first response open
  (route interception + a delay) so the window is certain. A race that only bites on a slow
  link is exactly the one the reporter hits and you never do.
- 🔴 **Present ≠ visible ≠ clickable.** An element can be in the DOM with text and a bounding
  box and never render; a container can pass a visibility assertion and then sit thirty
  seconds unclickable reporting *"visible, enabled and stable"*. Assert the property you
  actually mean.

And three about the fixture:

- 🚨 **A precondition that is true and meaningless is worse than none.** "A live record
  exists" matched a *draft*. Demand the content the case needs and throw without it.
- 🚨 **A restored snapshot is not a current one.** Re-apply every data/deploy script newer
  than the dump. A missing seed reads exactly like a code regression.
- 🚨 **Green standalone, red in a batch** usually means a locator bound to a *position*
  ("the last textarea") and the page grew. Bind by label or test id, never by position.

## 9. Where it runs

- 🔴 **Never against the live server of whoever reports the bugs.** Their data, their mail,
  their sessions - and a fix under test can impose real state on work they are doing. The rule
  is not "servers are dangerous", it is "*their* server is".
- Default to a **local build of the fix**. A pre-production environment that is ours, and that
  holds no real people's data, is the acceptable second target.
- ⚠️ **State what a non-local run costs before asking for "go"** - mail that cannot be
  switched off, records that persist, a fixture that must be restored. Restore afterwards and
  **verify the restore in the data store**, not on screen.
- **Stop what you start.** Servers, containers, background runs. Read a background run to its
  summary rather than assuming it finished.

## 10. If the repo has no harness yet - the bootstrap contract

Do **not** copy another repo's runner wholesale. Measured across the one real port: ~60% of
the runner was rewritten, and everything that diverged was auth, tenancy, navigation and data
access. **What ports is this vocabulary - and the narration (§3), which ports as it is.**
Implement the rest against the local stack:

| Group | Methods |
|---|---|
| Narration (§3) | `decorate(page)` (action callouts) · chapter card at case start · `step(page, n)` (bottom-left) · `banner(page, text)` (an info card that auto-hides) · `tally(page)` · `note(page, text)` |
| Pacing + input (§2) | `click(locator)` (scroll into view, then pause) · `type(locator, text)` (visible keystrokes) · `typeExactly(locator, text, { secret })` (reads it back; hides callouts for a secret) |
| Assertion | `check(page, n, fn)` - indexes into the case's `expected`, screenshots FIRST, then the verdict card |
| Session | `signIn` · `signedIn(seat, path)` · `page(seat)` · `fresh()` · `settle(page)` |
| Lifecycle | `run()` · `runOne(case)` · `verdict(result)` · `summary()` (the results file + the summary card) · `close()` |

Plus whatever the stack needs for arrange/cleanup - a way to call the API **as the seat**,
and a way to read the data store directly. Assertions read the **data**, not just the screen:
a UI assertion cannot see persistence.

**A "seat" is a role, in a context** (a company, a tenant, an org). Give each seat **its own
persistent browser profile** - in many apps a sign-in page signs that context out of every
other tab, so two contexts must never share a profile.

Case shape: `{ id, title, seatLabel, steps: [<their words>], expected: [<their criteria>], run(w) }`,
with an optional `arrange` and a `cleanup` that **always** runs and verifies itself.

## 11. What belongs in the repo, not in this skill

Keep a `README.md` beside the harness carrying everything this skill deliberately omits:
the commands and flags, ports, seats and accounts (names only, never passwords), selectors and
UI labels, the environment script, the per-app traps, the local rulings, and a table of what has
been walked. **This skill is the method. That file is the machine.**

## 12. After the walk

- Verdict table into the repo's plan/record for the batch. Commit, push.
- The issue gets **one** reply, not a walk commentary: the fix, the version, and **the
  verdict of every acceptance criterion the reporter listed, by its own number and in their
  order** - a row they wrote that the reply does not answer reads as ignored, and a summary
  that does not map back to their rows is not a reply. A criterion that is not met yet says
  so and why (waiting on another item, an outside party). Follow the repo's own reply rules
  for mentions, milestones and board status.
- **Make each acceptance criterion its own case in the walk** where the issue has a checklist:
  the end-of-round summary then IS the row-by-row answer, and a red row is visible as a row.
- **The reporter closes their own issue.** Move it to review; do not close it for them.

## 13. The template - `template/` beside this file

| File | What it is |
|---|---|
| `walk.mjs` | The runner: the narration of §3, `step`, `click`, `type`, `check` (screenshot first, then the card), `wait` (⏳ with a reason), a crash scored as ❌, the summary card and `results.json` |
| `run.mjs` | Runs a section: `--base` or `--serve`, `--headed`, `--narrate`, `--pace`, `--label`, `--only`; refuses to start when a quote is not in the issue (§6) |
| `control.mjs` | §4 scripted: swaps the fix's files to the pre-fix commit, waits for the dev server's rebuild line, runs labelled `control`, restores on any exit; exit 0 only when the control went red |
| `sections/example.mjs` + `example/index.html` | Two cases against a tiny page, presence before absence |
| `README.md` | Commands, exit codes, and "make it yours": sign-in, seats, arrange/cleanup, reading the data store |

Copy the folder into the project (`qa/walk/`), run the example, then replace it with the project's sections.
Proven on 2026-11-24 with Playwright 1.63 and Chrome: green twice headless, the narration drawn, a control
on the pre-fix commit red on exactly the fixed clauses, a control on unchanged code reported "not yet proven".

## 14. On Windows

- The template is all Node, so it runs the same in PowerShell and Git Bash. Keep project additions
  in Node too.
- No Chrome? `--channel=msedge`: Edge comes with Windows 11.
- Use forward slashes in paths inside scripts; Node accepts them on Windows.
- Headed Chrome, `--window-position` and the screencast overlays behave the same as elsewhere.
- Commit a `.gitattributes` with `* text=auto eol=lf` so scripts and fixtures do not pick up
  CRLF on checkout and fail a byte comparison.
