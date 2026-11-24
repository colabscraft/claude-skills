# Architecture patterns (A1-A22)

How the application is structured so it stays correct as it grows. Each pattern: the **rule**, **why**,
**how** (with a small example; adapt the language to your stack), and how to **check** it. Back to the
[index](README.md).

---

## A1. The workflow is data

**Rule.** A process with states (a request that is drafted, submitted, approved, done) is defined in ONE data
file: its states, the commands that move between them, the gates, and which roles may press each command. The
engine reads the file and enforces the role on every command.

**Why.** The process changes often, and a gate written into a screen is not a control: anyone can call the API.

**How.**

```json
{
  "states": ["draft", "submitted", "approved", "rejected", "done"],
  "commands": {
    "submit":  { "from": ["draft"],     "to": "submitted", "roles": ["requester"] },
    "approve": { "from": ["submitted"], "to": "approved",  "roles": ["approver"], "gate": "hasBudget" },
    "reject":  { "from": ["submitted"], "to": "rejected",  "roles": ["approver"], "needs": ["reason"] }
  }
}
```

- `executeCommand(instance, command, actor)` checks: the command exists, the instance is in a `from` state,
  the actor holds a listed role, the gate passes, the `needs` fields are present. Anything else is refused.
- The screen asks the engine which commands are available, instead of deciding itself.
- Change the flow in the file, not in components.

**Check.** A test presses every command as every role from every state; the allowed matrix matches the file.

## A2. Two engines, one parity fixture

**Rule.** When the same rules run in two places (the browser for instant feedback, the server for the final
word), one fixture of cases drives both: one side writes the expected answers, the other must reproduce them.

**Why.** Two implementations of one rule drift unless a test holds them together.

**How.** `engine-parity-cases.json` lists inputs (state, command, actor, fields). The browser's test runs them
and writes `engine-parity-expected.json`; the server's test reads both files and asserts identical answers.
Edit the cases, never the expected file by hand.

**Check.** Change a rule on one side only: the other side's test fails.

## A3. Wire types generated from the server

**Rule.** The front end never hand-writes the shapes of API requests and responses; they are generated from
the server's types.

**Why.** A renamed field then fails the build, not production.

**How.** A generator reads the server's request/response structs (or its OpenAPI document) and writes a
`wire.ts`; the build or a test runs it with `--check` (W12).

**Check.** Rename a server field: the front end stops compiling.

## A4. The API inventory is data

**Rule.** One file lists every endpoint: method, path, the feature family it belongs to, which implementations
serve it (the mock, the real server) and a note.

**Why.** Porting, reviews, docs and coverage questions read one list instead of grepping routes.

**How.**

```json
{ "method": "POST", "path": "/api/requests/{id}/submit", "family": "requests", "mock": true, "server": true,
  "notes": "Requester only; refused unless draft." }
```

A test compares the file with the server's registered routes, so an undeclared route fails.

**Check.** Add a route without listing it: the test fails.

## A5. Permissions transcribed, with a test that reads the other side

**Rule.** The browser's role groups ("who may edit vehicles") and the server's are written out on both sides,
and a server test parses the browser's file to prove they agree.

**Why.** Transcription fails closed: a new role gets no rights until someone adds it. Deriving rights from a
role's scope fails open.

**How.** The browser keeps `rbac-groups.ts` (`export const VEHICLE_WRITE = ['officer', 'admin']`); the
server keeps its own table; a server test reads the TypeScript file as text, extracts each group's role codes
and compares.

**Check.** Add a role to one side only: the test fails.

## A6. Tenancy is a data boundary

**Rule.** When one installation serves several organisations, every read takes the caller's boundary as a
parameter. An empty boundary holds nothing. A row outside the boundary is a **404**, never a 403. Only a
named super-administrator role crosses.

**Why.** A forgotten filter leaks another customer's data; a 403 confirms the row exists.

**How.**

```sql
-- every query takes both parameters; there is no version without them
SELECT * FROM vehicle
WHERE id = $1 AND ($2::bool /* crosses */ OR organisation_id = $3);
```

- The boundary is built once from the session and carried in the request context; a context without one
  holds nothing.
- A test scans the query files and refuses a new read that does not take the boundary.

**Check.** Sign in as organisation B and request organisation A's row by id: 404.

## A7. The wrong-seat suite

**Rule.** A test suite that runs against a real server and tries every write as the **wrong role** and as the
**wrong organisation**, expecting a refusal each time.

**Why.** A permission check that has never been tried from the wrong seat is a guess.

**How.** For each write endpoint: a table of seats (role + organisation) with the expected status. The suite
seeds a known world, signs in as each seat, sends the request, compares. It runs before any release that
touches auth or permissions (W11).

**Check.** Remove one permission check on the server: the suite goes red on that row.

## A8. Modules per organisation, enforced by the server

**Rule.** Optional parts of the product are modules switched on per organisation. A module's routes answer
**404** to an organisation without it; the browser only reads the module set from the session to decide what
to show.

**Why.** Hiding a menu item is not access control.

**How.** A table `organisation_module(organisation_id, module)`; route registration wraps each module's
routes in a check; `GET /api/auth/session` returns `modules: [...]`; the front end has one `hasModule()`.

**Check.** Call a module's route as an organisation without it: 404.

## A9. The product is generic; a customer is a deployment profile

**Rule.** The code names no customer. A customer's identity (name on the sign-in page, product name, document
numbering, seed organisations, identity provider) is a **deployment profile**: server configuration plus a
seed, never a separate front-end build or a fork.

**Why.** The next customer is a new profile, not a new codebase.

**How.** `deploy/profiles/default/` (no customer at all) and `deploy/profiles/<customer>/` (seed SQL,
settings). The server reads `PRODUCT_NAME`, `INSTALLATION_NAME` and friends from its environment; the front end
asks the server.

**Check.** A fresh install on the `default` profile shows no customer name anywhere.

## A10. Schema changes only as numbered migrations

**Rule.** Every schema change is a numbered migration file, applied in order, carrying the data through. No
one edits a live schema by hand. An old full schema dump, if one exists, is frozen.

**Why.** Every server can be brought forward with its data, and the history of the schema is readable.

**How.** A migration tool (goose, Flyway, EF migrations, Alembic, Prisma migrate); files like
`00012_vehicle_types.sql` with up and (where safe) down. The server runs pending migrations on start or by a
command (A19).

**Check.** A database built from zero by the migrations equals a long-lived one, table by table.

## A11. External sign-in, no stored passwords, invite-only

**Rule.** Sign-in goes through an external OpenID Connect provider; the app stores no password and nothing in
it can set one. Nobody self-registers: an administrator invites, and a one-time link binds the provider's
identity (`sub`) to the invited user. The session is a signed token in an **httpOnly** cookie, and every write
carries a CSRF token.

**Why.** No password database to leak or reset, and every account exists because a person granted it.

**How.**
- Ask the provider for the fewest scopes (`openid profile email`); never request a national ID.
- Invite link: random, single use, expires; opening it while signed in to the provider binds that identity.
- Recovery is a server command (A19), never a password.
- A test sweeps the source for password endpoints and fails if one appears.

**Check.** The users table has no password column, and a new user cannot get in without an invite.

## A12. Generic CRUD writes exactly what the browser declares

**Rule.** A generic create/update route for master data (vehicles, departments, lists) writes exactly the
fields the browser's model declares, and a test ties the two together. Nested rows (a vehicle's documents) get
named writers; protected fields are refused with a 400.

**Why.** A generic route that derives writable fields from the table accepts columns no screen meant to
expose (an `is_admin` flag), and a key that is not a real column is silently dropped with a 200.

**How.** `entities.json` lists each entity's writable fields; the route rejects any other key; a test compares
the list with the front end's model file.

**Check.** Post an undeclared field: 400, not 200.

## A13. Every write audited; personal columns sealed

**Rule.** Every write records who, when, what entity and what changed. Personal-data columns are encrypted at
rest ("sealed"), and the audit records **that** a sealed field changed, never its value.

**Why.** Personal-data law and every incident start with "who changed what", and an audit log must not
become a copy of the personal data.

**How.** One audit table written in the same transaction as the change; a key from the server's environment
for sealed columns, never in git, never regenerated (a restored backup cannot be read without the same key).

**Check.** Change a sealed field: the audit row says it changed and contains no value.

## A14. Side effects are a registry

**Rule.** What happens after a state change (a notification, a counter, a record on another entity) is
registered in one place, keyed by the transition, not scattered through handlers.

**Why.** One place answers "what does approving trigger?", and a test can cover every effect.

**How.** `effects = { 'request.approved': [notifyRequester, reserveVehicle], ... }`; the engine runs the list
after a successful command, in the same transaction where it can.

**Check.** A test lists every registered effect and asserts each has a test.

## A15. A mock API for the browser; the same specs against the real server

**Rule.** The front end has an in-browser mock of the API for development and its own tests, and the same
browser specs also run against the real server. The split is deliberate; the mock suite never depends on a
server.

**Why.** UI work and UI tests stay fast without a backend, and the second run proves the server agrees with
the mock.

**How.** An HTTP interceptor that answers `/api/` calls from an in-memory store in development builds only; a
second test configuration points the same specs at the real server with a known seed. The shipped build
carries no mock (A16).

**Check.** The shipped bundle contains no mock code (grep the build output for a mock-only marker).

## A16. Build configurations checked by a test

**Rule.** Every flag that differs between build configurations (mock on/off, demo clock, language switch,
gating) is asserted by a test that reads the configuration files.

**Why.** A wrong build flag fails silently in production.

**How.** A unit test parses the build config and the environment files and asserts, per configuration, the
values that matter, and that "the test build differs from the shipped build in exactly these flags".

**Check.** Flip one flag in the shipped configuration: the test fails.

## A17. One allow-list for what a release opens

**Rule.** One allow-list decides which screens a release opens. Unfinished screens show in the menu, disabled,
with a phase label ("Phase 2"); anything not on the list is hidden.

**Why.** A menu that shrinks and regrows between releases confuses users; an allow-list hides anything nobody
classified.

**How.** `release-scope.ts` exports the open routes; the menu, the home redirect and a route guard all read it.
It is a scope gate, not security: the server (A6-A8) is the control.

**Check.** A new route not on the list does not appear.

## A18. A ratchet test for gradual work

**Rule.** For work that finishes over many releases (translating strings, removing a deprecated API), a test
counts the remaining cases and fails if the count goes UP. Lower the baseline when you fix some.

**Why.** The migration finishes without a big-bang rewrite, and nobody adds new debt meanwhile.

**How.** The test counts (for example untranslated strings in templates) and compares with a `BASELINE`
constant in the test file.

**Check.** Add one untranslated string: the test fails.

## A19. Operations are commands in the binary

**Rule.** Maintenance is done by commands built into the application (`app migrate`, `app migrate down`,
`app snapshot`, `app invite <user>`, `app role grant`), never by SQL typed on a live server.

**Why.** Repeatable, tested, audited, and possible on a server with no database client installed.

**How.** A CLI entry point in the same binary/package; each command has a dry run, prints what it will change,
and refuses destructive work without an explicit flag (W10).

**Check.** Every manual intervention in the last release is a command with a test.

## A20. Open-source notices generated, licences checked

**Rule.** A file listing every bundled open-source package and its licence is generated at build time, and a
licence outside the allowed list fails the build.

**Why.** The customer's legal review gets one current file, and a GPL dependency cannot slip in unnoticed.

**How.** A script walks the dependency tree (server and front end), writes `open-source-notices.txt`, and
compares each licence with an allow-list (MIT, BSD, Apache-2.0, ISC...). Run it with `--check` (W12).

**Check.** Add a package with a licence off the list: the build fails.

## A21. The app's own dialogs and date pickers

**Rule.** No native browser dialogs (`alert`, `confirm`, `prompt`) and no native date/time inputs. The app has
one confirm-dialog service and its own date, month and time pickers. Layout uses container queries, not
viewport media queries.

**Why.** Native popups ignore the app's font, theme and locale (a Thai date shows as `mm/dd/yyyy` under an
English OS), and they block browser automation. Container queries let a component reflow inside a phone
preview, not only in a narrow window.

**How.** `await dialog.confirm({ title, message, confirmLabel })` from one service mounted once; pickers that
display the local calendar (for example the Buddhist era) but hold ISO values.

**Check.** A lint or test fails on `window.confirm` and `<input type="date">` in the source.

## A22. The manual, its PDF and the training ship inside the release

**Rule.** The user manual, its PDF and the interactive training are built with the release and served by the
app itself (signed-in only), not hosted somewhere else.

**Why.** The docs always match the version people are using, and no extra server is needed, which matters on
a customer's machine where you may not add one.

**How.** The build produces a static docs bundle (manual site + PDF + training player + a training build of the
app running on the mock, A15); the server serves it under a path it already owns (for example `/api/docs/`).
`/devkit:live-demo-site` describes the training player (its "shape B").

**Check.** The version printed in the manual equals the app's `build-info.json`.
