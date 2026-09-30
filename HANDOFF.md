# Handoff — where this project stands

Written 2026-09-30 at the end of a long session, so the next one can pick up
without the conversation. `README.md` explains *what* each feature does and
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
  third-party fetches). Republish it when classic CSS/markup changes.

## Live data on 2026-09-30

| | classic best | top tile | 2048s | 4096s | Dispatch today | Dispatch best | full runs |
|---|---|---|---|---|---|---|---|
| Mandar | 51,620 | 4096 | 13 | 1 | 7/8, 700 | 804 | 3 |
| J-Money | 10,476 | 1024 | 0 | 0 | 7/8, 700 | 808 | 3 |

Today's Dispatch run is a **dead tie** — see "Open" below.

## Shipping a change

1. Edit under `app/`. Run `node tools/test_dispatch.js` if Dispatch was
   touched (24 tests; `--sim` adds the 60-day bot run, ~10 s).
2. Commit. The pre-commit hook (`.githooks/pre-commit` → `tools/stamp_sw.py`)
   stamps `CACHE` in `app/sw.js` from a fingerprint of everything staged under
   `app/`. **Never bump it by hand.** A fresh clone needs
   `git config core.hooksPath .githooks` once. `python tools/stamp_sw.py --check`
   verifies.
3. If classic markup/CSS changed: `python tools/build_single_file.py`, commit
   `dist/`, and republish the artifact above.
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
  `localStorage.clear()` afterwards.
- **Measure `--chrome`, don't estimate it.** It's the height of everything but
  the board; set too low, short screens cut off the bottom. Values measured at
  412 px wide: classic 274 / 382 with leaderboard; Dispatch 328 / 460. Recheck
  after any change to the page furniture, at heights 915 → 640.
- Bash commands over ~8 KB are silently cut off, and heredocs mangle `\u`,
  `\0` and quotes. Write edit scripts to the scratchpad with Write and run them.

## Working agreements with Joseph

- **Colour changes are proposed and approved before they go in** — show the
  swatches/ramp first ("Run the gradient by me before you build the app").
- **UI layout changes get a mockup first** (the leaderboard badges went
  through two mockup rounds). Behaviour fixes can just be built and verified.
- Report what was actually verified, on the live site, and say plainly what
  wasn't (e.g. nothing here has been tested on a physical Pixel by Claude).
- Brainstorms can go to Astra (see `~/.claude/CLAUDE.md` for the recipe);
  Dispatch came from an Astra session.

## Open — next things to do

1. **Dispatch scoring ties.** Score = 100 per shipment + unused turns only on a
   full run, so partial runs tie on shipment count alone (today: 700–700).
   Less pressing since 2026-09-30: retries now count until a full run, so
   most days end on full runs, which the unused turns separate. Still needs a
   tiebreak for partial runs — e.g. turns used when the last shipment
   landed, or value still on the board. Decide with Joseph; it changes what
   posts, so the leaderboard shows the new score and maybe a new column.
2. **Dispatch difficulty tuning.** Both players finish about half their runs
   (3 full runs each over ~6 days) and bests are 804–808, i.e. finishing with
   4–8 turns spare — consistent with the sim (bot: 57/60 days, ~94 turns).
   Levers: `TURN_LIMIT`, `LADDER` in `app/dispatch/dispatch.js`. Re-run
   `--sim` after changing them.
3. **Dispatch only stores today.** No per-day history, so "who won yesterday"
   and streaks aren't possible yet. Would need a `dispatch_runs_log` table or
   more columns.
4. **Midnight rollover.** An unfinished attempt still open at midnight is
   dropped when the page reloads next day (by design, but untested with real
   use).
5. **Stale audit artifact:** https://claude.ai/artifact/8j5b3RhgbiktpPUzZTkrow
   still compares the old ramps, not the shipped splice. Low priority.

## Known limits (not bugs)

- Installed-app status bar is near-black in both themes: a WebAPK bakes it from
  the manifest (crbug 40634649). Fullscreen avoided it but made the layout jump
  whenever a back swipe revealed the bars, so the app runs standalone.
- The back guard can't stop Android's gesture, only absorb the first back per
  interaction; after it catches one, the next back always exits.
- No sign-in: the leaderboard can't prove who posted, and the key is public.
