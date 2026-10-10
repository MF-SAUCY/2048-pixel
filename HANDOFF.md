# Handoff — where this project stands

Written 2026-09-30 at the end of a long session and updated 2026-10-06, so
the next one can pick up without the conversation. `README.md` explains *what* each feature does and
why; this file is the working state: how to ship, how to test, what's open.

## At a glance

- **Live site / installed app:** https://mf-saucy.github.io/2048-pixel/
  (Dispatch at `/dispatch/`). Installed on Joseph's Pixel 11 and his wife's
  phone as a Chrome WebAPK, `display: standalone`.
- **Repo:** `MF-SAUCY/2048-pixel`. `main` holds everything; the site deploys
  from `gh-pages`, which is `app/` pushed as a subtree.
- **Leaderboard backend:** Supabase project `https://cueswzyoejwirzjpsccw.supabase.co`,
  table `public.scores`, reached with the *publishable* key in
  `app/js/leaderboard-config.js` (public by design — see README).
- **Players:** Joseph ("J-Money") and his wife ("Mandar"). One row each.
- **claude.ai copy:** single-file bundle `dist/2048-pixel.html`, published at
  https://claude.ai/artifact/Gy5d6mnwZWd8seeuX5nkEp (classic only — no
  leaderboard, theme toggle, back guard or Dispatch; the host blocks
  third-party fetches). Republish it whenever anything in the bundle changes:
  classic markup, CSS, or any script listed in `tools/build_single_file.py`.
  It had drifted until 2026-10-06 (the `--chrome` fix never reached it).

## Live data on 2026-10-06

| | classic best | top tile | 2048s | 4096s | Dispatch today | Dispatch best | full runs |
|---|---|---|---|---|---|---|---|
| Mandar | 60,500 | 4096 | 27 | 2 | 8/8, 806 | 809 | 9 |
| J-Money | 10,476 | 1024 | 0 | 0 | 8/8, 809 | 809 | 9 |

Two rows, as it should be. Amanda got a new phone around 2026-10-01, which
minted a second "Mandar" row; she linked the phone to her original row with
`?link=` and Joseph deleted the stray one (see "A new phone" in README).

## What changed 2026-09-30 → 10-06

All live and described in README; listed here so the next session knows what
is new and lightly tested.

- **Dispatch: the first *full* run counts** (`26e15a8`). Until a run ships all
  8, every attempt counts and the day shows the best attempt so far (a worse
  retry never lowers it; ties keep the earlier one). The first full run locks
  the day; later runs are Practice. The attempt count is deliberately neither
  shown nor stored (Joseph's call). Storage keys keep their old
  `dispatch-first*` names, and old-format records still read.
- **Dispatch: a tile already waiting in the next order's bay ships at once**
  (`26e15a8`), on the same swipe, chaining down the list. The bot does
  slightly better for it (56 → 57 of 60 days).
- **`?link=<player_id>` moves a device onto an existing leaderboard row**
  (`a601d46`, in `leaderboard.js`). It drops the device's own Dispatch day and
  queued posts first, so it can't overwrite the row's result or recreate the
  old row. Used once, by Amanda; it worked.
- **Classic: up asks twice** (`10238ec`, `app/js/up_guard.js`). The first up
  shows "Swipe up again to move up" (the back guard's pill); a second up within
  3 s moves; any other move, a lapse or a new game cancels. It only asks when
  up would move a tile. Not in Dispatch. In the bundle and the precache list.
- **Classic: Auto-fill switch** (`app/js/autofill.js`, plus a `downRepeat` hook
  in `input_manager.js`). A held down swipe repeats about 5×/s and stops as
  soon as a down move changes nothing; Joseph's rule is that it must never
  bring in a tile a normal swipe wouldn't. New footer row under Tiles (mockup
  option A, approved).
- **Classic: credit line removed** at Joseph's request; the MIT notice stays in
  `app/LICENSE.txt`. The Tiles and Auto-fill switches no longer anchor on it:
  they sit under the Game switch, or at the foot of the page in the bundle.
- **Dispatch: turns left instead of points; day's best run** (2026-10-10).
  Heading boxes are "Turns left" and "Best today"; the board shows "9 left"
  and, under it, "best 12" when a practice run beat the counted one (stored as
  `dispatch-day-best` locally and `dispatch_day_best` in the table). All-time
  best and full-runs footer removed (still posted, not shown). `--chrome` with
  leaderboard is now 464 (both rows carrying a best line). Needs the
  `dispatch_day_best` column added in Supabase before deploying.
- **Dispatch: the shipping tile now draws above the others**: its z-index rule
  keys off the inner `.is-shipping` element via `:has()`, since the actuator
  rewrites the wrapper's classes a frame after adding it.

## Shipping a change

1. Edit under `app/`. Run `node tools/test_dispatch.js` if Dispatch was
   touched (24 tests; `--sim` adds the 60-day bot run, ~10 s).
2. Commit. The pre-commit hook (`.githooks/pre-commit` → `tools/stamp_sw.py`)
   stamps `CACHE` in `app/sw.js` from a fingerprint of everything staged under
   `app/`. **Never bump it by hand.** A fresh clone needs
   `git config core.hooksPath .githooks` once. `python tools/stamp_sw.py --check`
   verifies.
3. If classic markup, CSS or a bundled script changed:
   `python tools/build_single_file.py`, commit `dist/`, and republish the
   artifact above (Artifact publish with its `url`). The host refuses a publish
   until this session has Read the live version in full: diff it against the
   last committed `dist/` first, then Read it, then publish (it may ask for a
   second, identical publish). A new file under `app/` also goes in the
   precache list in `app/sw.js`, and in `SCRIPTS` in the bundler if classic
   uses it.
4. Deploy: `git push && git subtree push --prefix app origin gh-pages`.
5. **Verify live** before saying it shipped: poll
   `gh api repos/MF-SAUCY/2048-pixel/pages/builds/latest` until `built` for the
   new commit, then `curl` the live `sw.js` for the new `CACHE`. Pages builds
   have hung in `building` twice; `gh api -X POST repos/MF-SAUCY/2048-pixel/pages/builds`
   queues a fresh one. The CDN can lag a few minutes after `built`.
6. Phones pick the update up on their own: the page calls
   `registration.update()` whenever it becomes visible and reloads onto a new
   version the next time it is hidden. Manifest changes (display mode, icons,
   theme colour) still need an uninstall + re-add, done from a Chrome tab after
   a refresh; check `/manifest.webmanifest` in Chrome first.

## Changing the table

The publishable key can't alter the schema, so Joseph runs SQL in Supabase
(SQL Editor). **The SQL must run before the deploy** whenever the page starts
selecting a new column — a missing column makes the whole leaderboard read fail
on both pages. Check with a `select` of the new column (400 `42703` = missing),
and probe write permission with an upsert whose `name` is null: a `23502`
not-null error means permissions passed and nothing was written. The key also
can't delete rows; stray rows are removed by Joseph in Table Editor. Current
columns and the ALTERs used are in README → "The leaderboard".

## Testing notes (learned the hard way)

- **The built-in browser pane is usually hidden**, so `requestAnimationFrame`
  doesn't fire and tiles/game start look missing. A `computer` screenshot pumps
  a frame. For DOM tests, replace `window.requestAnimationFrame` with a
  `setTimeout` shim and call `Dispatch.start()` (it's idempotent). Screenshots
  time out when the Claude window is minimised; fall back to DOM reads.
- **Service workers won't register on localhost in the pane.** Test SW and
  update behaviour on the live site instead.
- **`python -m http.server` gets HTTP-cached** by the pane; before re-testing,
  `fetch(url, {cache: "reload"})` each changed file, then reload.
- **Never test leaderboard writes against the real table.** Copy `app/` to the
  scratchpad, replace `js/leaderboard-config.js` with a fake URL plus a `fetch`
  stub backed by an in-memory table, serve it on another port. On the live
  site, read-only checks: block `POST` in `fetch`, save a throwaway name, then
  `localStorage.clear()` afterwards. When a test reloads the page (linking
  does), keep the fake table in `sessionStorage` so it survives. Reading the
  real table with the publishable key (a `curl` GET) is fine.
- **Classic state for tests:** write a `gameState` to localStorage
  (`{grid: {size: 4, cells}, score, over, won, keepPlaying}`, `cells[x][y]`),
  reload, then drive it with `keydown` events (`which` 37–40) or
  `PointerEvent` down/up pairs on `.game-container`, and read the board back
  from `gameState`. The classic `GameManager` isn't on `window`.
- **Measure `--chrome`, don't estimate it.** It's the height of everything but
  the board; set too low, short screens cut off the bottom. Values measured at
  412 px wide: classic 281 / 388 with leaderboard (since the Auto-fill row
  went in and the credit line came out); Dispatch 328 / 464. Recheck after any
  change to the page furniture, at heights 915 → 640. Measure by summing the
  container's visible children, gaps and padding, minus the board: the
  container itself stretches to the viewport, so its own height is useless.
- Bash commands over ~8 KB are silently cut off, and heredocs mangle `\u`,
  `\0` and quotes. Write edit scripts to the scratchpad with Write and run them.

## Working agreements with Joseph

- **Colour changes are proposed and approved before they go in** — show the
  swatches/ramp first ("Run the gradient by me before you build the app").
- **UI layout changes get a mockup first** (the leaderboard badges went
  through two mockup rounds). Behaviour fixes can just be built and verified.
- Report what was actually verified, on the live site, and say plainly what
  wasn't (e.g. nothing here has been tested on a physical Pixel by Claude).
- **Commit and deploy only when Joseph says so.** He usually asks in so many
  words ("commit and deploy"); otherwise finish with the change tested locally
  and ask.
- New UI that reuses an existing pattern (the up guard reused the back guard's
  pill) was built without a mockup, and that was said up front; a genuinely
  new element still gets one.
- Brainstorms can go to Astra (see `~/.claude/CLAUDE.md` for the recipe);
  Dispatch came from an Astra session.

## Open — next things to do

1. **Dispatch scoring ties.** Players now see turns left, not points (the
   ranked number underneath is unchanged: 100 per shipment + unused turns on a
   full run). Full runs tie only on equal turns left; partial runs still tie on
   shipment count. A tiebreak is only worth it if partial days come back.
2. **Dispatch difficulty.** Full runs went from 3 to 9 each in a week, and bests
   sit at 806–809 (6–9 turns spare), so with retries allowed it may now be too
   easy to finish. How many tries a full run takes isn't recorded, so the board
   can't show it. Levers: `TURN_LIMIT`, `LADDER` in
   `app/dispatch/dispatch.js`; re-run `--sim` after changing them (bot: 57/60
   days, ~94 turns).
3. **Dispatch only stores today.** No per-day history, so "who won yesterday"
   and streaks aren't possible yet. Would need a `dispatch_runs_log` table or
   more columns.
4. **Midnight rollover.** An unfinished attempt still open at midnight is
   dropped when the page reloads next day (by design, but untested with real
   use).
5. **Stale audit artifact:** https://claude.ai/artifact/8j5b3RhgbiktpPUzZTkrow
   still compares the old ramps, not the shipped splice. Low priority.
6. **Up guard and Auto-fill: not yet tried on a phone.** Both were tested in
   the browser pane with synthetic pointer events only. Worth asking how they
   feel in play: whether 3 s is long enough for the up question and whether
   its pill gets noticed; whether the hold's 0.35 s start and 0.2 s repeat feel
   right (`repeatDelayMs`, `repeatEveryMs` in `input_manager.js`).

## Known limits (not bugs)

- Installed-app status bar is near-black in both themes: a WebAPK bakes it from
  the manifest (crbug 40634649). Fullscreen avoided it but made the layout jump
  whenever a back swipe revealed the bars, so the app runs standalone.
- The back guard can't stop Android's gesture, only absorb the first back per
  interaction; after it catches one, the next back always exits.
- No sign-in: the leaderboard can't prove who posted, and the key is public.
- Identity is per device: a new phone makes a new row until it is linked with
  `?link=<player_id>`, and the stray row then has to be deleted by hand.
