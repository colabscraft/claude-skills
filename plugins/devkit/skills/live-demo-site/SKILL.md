---
name: live-demo-site
description: Build an interactive training / demo site for a web app - the REAL app framed full-screen on one origin, its own scripted topics played LIVE in the viewer's browser (drawn cursor, real clicks and typing, a caption per step in the audience's language) under a movable overlay panel (play/pause, previous/next step and topic, jump to any step, speed, stop-at-every-step, full screen), each play on its own demo data set up over the API, recorded videos as an optional fallback; on a temporary sub-domain with a demo database, or inside the app's own docs on its in-browser mock, proven by a live check in real Chrome, announced, then torn down. Use when the user wants a training site, a demo, a walkthrough, an interactive tutorial, "อบรม", "สาธิต", "สอนใช้งาน", or to show people how a system works without slides. Not a tour inside the app.
---

# The live demo site

A training or demo site where people **watch the real system do the work**, one step at a time, and take over
whenever they like. The topic scripts are ordinary Playwright-style scripts; the portal runs them in the
viewer's own browser against the real app, so the screen is sharp at any size and nothing is a video unless
you want one. 🏆 It was built for a production web app's training (section 9) and ships with its engine in `template/`.

**Applies to:** a web app (any stack) that a browser can drive, with an HTTP API the setup can call and a
sign-in we can replace on a demo instance. **Does NOT apply to:** a native app, a tour or "demo mode" INSIDE the
app (the app stays clean - the player lives outside it), or anything that would put real people's data on a
public page.

## Provenance, and why it is built this way

The first version (2026-10-07) recorded every topic with Playwright and played the videos in a portal. It
worked, and the owner said the video looked soft on a HiDPI screen and too small in a two-column page. Revision 1
replaced it the same day with this shape: the same scripts, driven live, the app filling the window, the controls
floating on top. Proven 15/15 topics on the real box at 2x and at the quick re-run's pace, then opened to the
trainees. Three days later the customer asked for the training on their own production box, where no extra
server was allowed: shape B (section 2b). Every 🔴 rule below was paid for once.

## 1. Ask first (AskUserQuestion, recommended option first)

| # | Decision | Recommended |
|---|---|---|
| D1 | Live player, videos, or both | **Live, with video mode as a fallback** if a recorder is cheap to add; live alone otherwise |
| D2 | Where it runs | **Shape A** (section 2) for an event on our own server; **shape B** (section 2b) when it must ship with the app or no extra server is allowed |
| D3 | Address and gate (shape A) | A NEW sub-domain on our own server, a shared Basic Auth while the owner reviews, **lifted when the owner says so** (a temporary site), `noindex` always. DNS is the owner's |
| D4 | Sign-in on the demo | **A seat picker**: a test issuer with one button per role, no password. Never the customer's real identity provider (it would need them to register the demo address) |
| D5 | Scope and language | The roles the audience has (no super-admin topics for an end-user training); captions in the audience's language, technical terms in English |

## 2. Shape A - a demo instance on its own sub-domain

```
https://DEMO_HOST/          the site: index.html + player.js (live), video.html (optional)
https://DEMO_HOST/app/      the app's DEMO instance (its own database, demo seed, never real data)
https://DEMO_HOST/idp/      the seat picker (the app's issuer on the demo instance)
```

- 🔴 **ONE origin.** The player reads and drives the framed app's DOM, and the setup's fetch sign-in follows the
  issuer's redirects: a browser allows both only on the same origin. The app's public URL and the issuer's must
  name the demo host's own paths. Locally, `front-door.mjs` is that origin (nginx's part).
- The demo instance is a SEPARATE service, port and database; its services are started by hand and **never
  enabled** (a reboot leaves them down); it is torn down after the event.

## 2b. Shape B - inside the app's own docs, on its in-browser mock

When the app already has an in-browser mock API (for development and front-end tests), the training can ship
WITH the app: the player and a `training` build of the app (mock on, a persona switcher instead of sign-in) go
into a static docs bundle the app's own server serves, signed-in only. No demo server, no demo database, no
server load: each trainee's browser holds its own world.

- 🔴 **Storage is per ORIGIN.** On the real box the training app shares the origin with the real app: prefix
  every key the training build writes (`<app>-training:`), or a trainee's theme and drafts leak into the real app.
- 🔴 **Lock it off the real API twice.** A mock that answers "any URL containing `/api/`" and passes the rest to
  the network, served from under `/api/` itself, can reach the real server. Add a second lock, and make the live
  check FAIL a topic that sends anything to the server.
- The player's per-play setup goes through a hook the training build exposes (requests through the app's own
  HTTP client, the persona switch, uploads), not through `fetch` to a server.
- The mock is a twin, not the server: prove every topic on it (`live-check`, quick and 2x) before calling it done.

## 3. 🔴 Rules that must survive a port

1. **The app gets no tour code.** The player, the scripts and the setup live outside the app; the app is the
   release the customer runs. (Shape B's training build is a build flag plus a small hook, never tour logic.)
2. **Every play has its own data.** `newRun()` gives each play a unique number and a random day; prerequisites
   are made **over the API under the seats they belong to** (`prepare()`), never by replaying earlier topics.
   A topic that writes the SAME record every play (a leave on a fixed day, a user with a fixed email if unique)
   gets a `needs` that clears or recreates it first - otherwise its second play fails.
3. **Scripts find things by role and name.** A script that works only on the first play (the first row, "the"
   record found by a shared word) breaks the moment a second viewer plays. Find this play's record by its own
   number (`t.trip`, section 5).
4. **Only a person's key drives the panel.** The scripts type through user-event, whose keystrokes are
   synthetic: a shortcut listener must check `event.isTrusted`, or the script's own space pauses the topic and
   is swallowed.
5. **Light theme, the app's own layout, before every play** (`beforeRun()`), whatever the viewer did in a
   hands-on tab: same origin, same storage.
6. **Demo data only.** Never a copy of staging or production; no real names, plates, ID numbers or phones. The
   demo database is dropped at teardown.
7. **Every write to the server is asked** (install, publish, open/close, reset, teardown), one at a time. The
   site credential lives in a 0600 file outside the repo and is **never printed**; scripts read it into a
   variable.
8. **Stop what you start**: local worlds, browsers, containers.

## 4. Build it

The template is `template/` beside this file. Copy it into the project (for example `qa/training/`):

```
template/player/            the player: src/{main,pw,take,api}.mjs, build.mjs, package.json (its OWN deps)
template/portal/index.html  the live page (Thai text; translate here and in main.mjs if needed)
template/demo.config.example.mjs   THE adapter: copy to demo.config.mjs and fill in
template/features/f01-example.mjs  one topic, annotated
template/live-check.mjs     the proof harness (real Chrome)
template/front-door.mjs     one origin locally (portal + proxied app + proxied seat picker)
template/deploy/nginx-demo.conf.example   one origin on the server, Basic Auth, noindex
```

1. **Install the player's own packages**: `cd player && pnpm install` (Testing Library, user-event, esbuild).
   Never add them to the app's dependencies; the bundle ships only on the demo site.
2. **The demo instance and its seat picker** (shape A). The app's release on its own database with a demo seed,
   its issuer replaced by a seat picker whose page is ONE form with one button per role (button text = the role
   label the topics use). Bind each demo seat's user to its picker identity in the seed, and pre-accept anything
   a first sign-in would block on (a privacy notice).
3. **`demo.config.mjs`**: title, mark, photo, the app's path, `api()` (`makeApi`'s defaults suit an app with
   OIDC sign-in at `api/auth/oidc/start` and a `csrftoken` double-submit cookie: override the sign-in
   start/session/logout paths and the CSRF pair, add the app's verbs), `newRun()`, `prepare()` per `needs`,
   `beforeRun()` with the app's own theme key.
4. **Map the API before writing `prepare()`**: one record through its whole life over HTTP, read from the code
   with file:line, then PROVE it in a browser page on the demo origin before building on it. Keep the map as a
   file beside the topics (`api-map.md`).
5. **Write the topics** (section 5): one file each, in play order, from the audience's real tasks.
6. **A local world on one origin**: the demo instance + the seat picker + `node front-door.mjs SITE --proxy=/app/=http://127.0.0.1:APP --proxy=/idp/=http://127.0.0.1:IDP,strip`,
   with the app's public URL and issuer set to `http://localhost:4292/app` and `/idp`. Moving the origin
   re-issues identities: re-seed the bindings.
7. **Build**: `node player/build.mjs --features=features --config=demo.config.mjs --out=SITE`, then add the
   photo, the app's mark (`brand/`) and font (`fonts/app-400|500|700.woff2`), and with video mode `video.html`,
   `manifest.json` (chapters feed the step list) and the videos.

Everything local is Node (front door, build, live check), so it runs the same on Windows, macOS and Linux.

## 5. Writing topics

```js
export default {
  group, title, role, summary,   // role = the seat picker's button label
  device: 'phone',               // optional: a phone frame (the driver, the field user)
  needs: 'submitted',            // optional: prepare() brings this play's data there first
  signedOut: true,               // optional: starts on the sign-in page
  async run(t) { ... },
};
```

| `t.` | Does |
|---|---|
| `step(title, detail)` | a caption in the panel; a place the viewer can jump to; where หยุดรอทุกขั้น (stop at every step) stops |
| `note(text, ms)` / `point(locator, ms)` | a yellow tip / a ring round something, held, skipped in a quick re-run |
| `click(loc)` / `type(loc, text)` | cursor moves, real events, the run's pace after |
| `tickGood(scope, regex)` | one good answer per radio group that has none (a group may hold two good words) |
| `goto(path)` / `settle()` / `pause(ms)` | navigate in the frame / requests and DOM at rest / a held moment |
| `expect(x).toBeVisible / toHaveCount / toBeEnabled / toHaveText / toContainText / toHaveURL` | polled, like Playwright |
| `t.trip` | this play's own data (`newRun` + `prepare`); named after the first project's record, it holds whatever your `newRun` returns |
| `t.page` | the Playwright subset below |

**The Playwright subset (`pw.mjs`)**: `getByRole(role, { name, exact, level })`, `getByText`, `getByPlaceholder`,
`locator(css)`, `.filter({ hasText, has })`, `.first() .last() .nth()`, `.or() .and()`, `.click() .fill()
.pressSequentially() .press() .check() .setInputFiles()` (attaches the site's photo), `.count() .isVisible()
.innerText() .inputValue() .boundingBox() .scrollIntoViewIfNeeded()`, `page.keyboard.press`, `page.mouse.wheel`,
`page.goBack`, `page.evaluate` (runs in the frame's realm). Semantics follow Playwright: lazy locators,
actionability waits (visible, enabled, still), a name string is a case-insensitive substring unless `exact`,
getByText matches the deepest element. Ambiguous locators take the first VISIBLE match (the demo world grows).
Anything else: add it to pw.mjs, do not reach around it.

## 6. Prove it (before anyone sees it)

- `node live-check.mjs --site=http://localhost:4292/ --features=features --fast` (every topic at the quick re-run's
  pace, `?check`), then without `--fast` (2x, the viewer's pace) with `--shots=DIR`. **READ the screenshots**: the
  frame, the panel, the phone frame, the cards. Play every topic **twice** in one run (`--only=f01,...,f01,...`):
  the second play is where shared-data bugs live.
- The controls by hand or script: pause holds; previous step replays to n-1 and stays paused; next step and a
  jump from the steps drawer land on their step; stop-at-every-step stops; next topic from the end card.
- Sizes: 1440x900 at DPR 2 (a laptop) and 1280x720 at DPR 1 (a projector); zoomed text must stay sharp.
- On the server after publishing: the same check with `--site=https://DEMO_HOST/ --credentials=FILE`; a slow
  server finds timing bugs the laptop does not. Then reset the demo data (every check files records).
- With video mode: the recorder's own dry run must still pass the same scripts.

## 7. Ship, open, announce, tear down

- Shape A, nginx from `deploy/nginx-demo.conf.example`: one server, `/`, `/app/`, `/idp/`; the seat picker's
  server-to-server endpoints exempt from Basic Auth (a REGEX location, and `/idp/` as a plain prefix - `^~`
  stops nginx trying the regex); `noindex` on every location; certbot. Publish = static files only.
- Basic Auth while the owner reviews; lift it when the owner says (`auth_basic off;` at server level only).
- Announce in the project's tracker (English, bullets: the link, the topics table, the panel, a review
  checklist, "playing a topic switches the role signed in on that browser") and, when asked, a SHORT email in
  the audience's language with technical terms in English.
- After the event: stop and remove the services, the site, the certificate and the vhost, drop the demo
  database and its role, revoke any special grant. Asked.
- Shape B ships inside the app's release: it follows the app's own release steps, and it is never torn down
  separately.

## 8. Traps paid for

- **A press that lands right after a page loads opens nothing** on a slow server (one quick re-run in three):
  the shared "press, then confirm" helper presses again if no confirm box opens within 4 s.
- **Synthetic keystrokes trigger your own shortcuts** (rule 3.4).
- **A record written the same way every play** fails on the second play (rule 3.2).
- **`ssh host VAR="a b" cmd` splits the value**: ssh joins its arguments into one remote line - send values
  `printf %q`-quoted.
- **`location ^~ /idp/`** disables the back-channel regex: the app meets the shared sign-in and sign-in breaks.
- **The first play after a server start** can time out: the harness retries once and reports FLAKY, never hides it.
- **esbuild metafile paths are relative to `absWorkingDir`** (the notices builder needs it pinned).
- **Recording**: a screencast size must EQUAL the viewport (bigger puts the page in a quarter of the frame);
  Playwright's own Chromium has no H.264 (check videos in real Chrome); python's http.server has no Range
  (seeking restarts at 0:00 - the front door serves ranges).
- **A seed that resets the world needs superuser-only settings**: grant the one parameter to the demo role
  (`SET ON PARAMETER session_replication_role`, PostgreSQL 15+) and revoke it at teardown.
- **A desktop topic in a narrow window** switches the app to its tablet layout, where menus differ: the player
  never renders the app narrower than `desktopMin` (it scales down instead).
- **`rm -rf $VAR/*` is refused** by the safety check: write to a fresh folder instead.
- **Shape B, a sub-path mount**: the same release may be served at `/` on one box and `/<app>/` on another;
  build the docs with relative links, or rewrite them as served.

## 9. Where it came from

Built for the training of a production web app with seven roles: one story told across topics (one topic files
a record, the next one receives it), a phone frame for the field roles, a seat picker on the demo instance. Shape
A ran for one training event on its own sub-domain and was torn down afterwards; the same topics then shipped as
shape B inside every release, 27 topics by the end. The template here was proven by rebuilding the first 15
topics through a fresh copy of it: 15/15 at the quick pace, the key topics at 2x.

What a project keeps beside its topics: a `story.mjs` of shared helpers (find this play's record, a "press,
then confirm" that retries), the `api-map.md` behind `prepare()`, a `world` script that starts the local demo
world, and the deploy scripts (install, publish, open/close, reset, teardown).

## 10. What belongs in the project, not here

The topics, the adapter, the seat list, the API map, the deploy scripts and their host names, the event's
dates and the review issue. This skill carries the method, the rules and the engine; when the engine improves
in a project, bring the change back to `template/` and re-prove it.
