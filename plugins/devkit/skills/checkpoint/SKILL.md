---
name: checkpoint
description: Verify memory and the plan are current, then produce a resume prompt to paste into a fresh context. Use when the user is about to clear or compact context, says "checkpoint"/"resume prompt"/"start fresh", or when context is filling up with work unfinished.
---

# Checkpoint - before the context is cleared

Replaces typing this every time:

> *"Ensure you have good memory and the plan can resume next fresh context, give me the best
> resume prompt before I clear context for you to start fresh."*

Same job, same output. The user then copies the prompt, clears, and pastes it into the fresh
session. **Do not change that loop** - the only thing being removed is the typing.

⚠ **Offer a checkpoint when context is filling up with work unfinished; do not wait to be asked.**
Taking one when context is nearly full is the worst time to take one.

## 1. Verify memory and the plan

Read what already exists - the memory index (`MEMORY.md`) and the project's resume doc
(`RESUME.md`, or whatever this repo uses) - **before writing anything**. Then:

- **Persist** what would be lost: a decision and the reason for it, a standing rule that
  changed, a trap that cost time, a belief that turned out wrong. Not what the code, the tests
  or git already record.
- 🔴 **Correct what is now FALSE.** Fix it in place; never add a correction under a stale line
  and leave both standing. **A stale resume doc is worse than none** - the next session cannot
  tell it is lying. This is the step that actually fails: one project's doc was rewritten 15
  times in a day, each version leaving the previous one misleading.

### The PHASE TABLE, if the project has a multi-phase plan

Many projects carry a plan that is a sequence - phases, clusters, milestones, steps - in a
committed document. **Bring its status up to date here**, in the plan itself, as part of the
checkpoint.

🔴 **THE STATUS MUST BE WRITTEN DOWN, NOT DERIVED.** A phase table whose statuses are worked
out at resume time from git log, the resume doc and memory is a GUESS wearing a table's
authority, and it is wrong in the direction that costs most: it reports finished work that was
only started. So the plan's own table gets a status column, one row per phase, and this step
updates it. If the plan has no such table and the phases are prose, add the column - once -
rather than inventing a status each session.

Each row: the phase, what it opens or delivers, its status, and (when done) the date. Statuses
stay few and blunt - `done` / `in progress` / `not started` / `blocked on <what>`. Anything you
cannot substantiate is **`unknown`**, written as `unknown`; never upgraded to a guess.

If the project genuinely has no persisted multi-phase plan, there is nothing to show. Skip it -
do not manufacture one to fill the slot.

Memory is local and per-project; the resume doc is committed.

🔴 **No credential in the resume doc, the memory or the prompt.** Name WHERE a secret lives
(a password manager entry, a `0600` file outside the repo), never its value, and never print
the file to find out.

⚠ **Absolute dates (`2026-11-24`), never "today".** ⚠ **Never state a test result you did not
run this session** - a resume prompt is read as fact.

## 2. Give the resume prompt - PRINT IT IN THE REPLY

🔴 **PRINT THE WHOLE PROMPT IN YOUR RESPONSE, in one fenced block, every single time.**

**Never** answer with *"it is in `RESUME.md`, copy it from there"* or *"between the fences in
the doc"*. The user copies it **off the terminal**, which is the entire point of the shortcut -
a pointer to a file makes them go and get it, which is the typing this skill exists to remove.
Writing it into the resume doc as well is right; it is not a substitute.

- One fenced block, nothing interleaved, nothing after it that they have to scroll past.
- Say what you persisted and corrected **before** the block, so the last thing on screen is the
  thing they copy.
- **One prompt, for the next task only.** Not a second "for later" prompt: later work belongs in
  the plan's table, where the next checkpoint will find it.
- 🔴 **THE FIRST LINE OF THE BLOCK IS THE PHASE TABLE INSTRUCTION**, whenever the project has
  a plan. It orients the fresh session before it touches anything, and it makes that session
  read the status you just wrote rather than reconstruct one. Drop the line ONLY when there is
  genuinely no such plan; a fresh session told to print a table that does not exist will go
  looking.

  ⚠ **THIS IS THE LINE THAT GETS DROPPED.** It sits at the top of a template, so it reads as
  scaffolding, and a block that opens `Continue <project>` looks finished. It went missing on a
  real project between two sessions (2026-09-08), and the user's first question
  in the next session was where the status had gone.

  **Before you print the block, read its first line back.** If it does not name a plan
  document, you dropped it. Put it back.

Short enough to read at a glance. Orientation first, history last - the reader acts on the
first thing they see.

```
FIRST, BEFORE ANYTHING ELSE: print the phase table from <plan doc> as a markdown
table - every phase, its status, and what is next - so we both start from the same
picture. Read it out of the doc; do NOT re-derive a status from git or from me.

Continue <project>. Read in this order:
  <resume doc>
  <the one or two documents that carry the work>

STATE: <one line - done / in flight / blocked and on whom>

TASK: <the next concrete action. Not a category.>

🔴 RULES: <the ones that cause damage if broken - especially any that CHANGED,
and what they replace, since older commits still assert the old version>

⚠ UNVERIFIED: <believed but not demonstrated, and how to demonstrate it>

TRAPS: <what cost time, and how it presents>
```

## 3. Close out

Commit the doc changes with a message saying what **changed**. Tell the user what you persisted
and what you **corrected**.

🔴 **Stop what you started, and name it.** Dev servers, build daemons, browsers and especially
containers: anything you started is yours to stop. List them in the reply so the machine is
visibly left clean.

⚠ **The resume doc is whatever the repo ALREADY uses** - often a section inside its `CLAUDE.md`,
not a `RESUME.md`. Update THAT one. **Never create a second**: two docs means one goes silently
stale, which is the exact failure §1 exists to prevent. Create a doc only if there is genuinely
none, and do not restructure the repo.

⚠ **The most valuable line is usually a correction, not an achievement.** "Three of the plan's
prescribed fixes were wrong - read the code first" saves more time than any list of what got
finished.

## 4. Templates

This plugin's gold reference carries the shapes this skill keeps up to date (the `reference/` folder at the
plugin root, two levels above this file):

| What | Where |
|---|---|
| The resume doc with its `PICK UP HERE` section | `reference/templates/RESUME.md` |
| A plan with its status table, written not derived | `reference/templates/plan.md` |
| The project rule that tells every session to print that table first | `reference/templates/CLAUDE.md`, "WHERE THE WORK IS" |
| Why, in full | `reference/workflow.md`, W1 and W2 |
