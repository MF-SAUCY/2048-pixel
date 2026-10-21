# Handoff — where this project stands

Written 2026-09-30 at the end of a long session and updated 2026-10-20, so
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

## What changed 2026-09-30 → 10-12

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
  best and full-runs footer removed (still posted, not shown). The
  `dispatch_day_best` column was added in Supabase the same day.
- **Dispatch: rules line under the board removed** (2026-10-10). The board
  gets the room; captions shorten to "Turns" / "Best" when the heading is
  under 300 px wide (a container query on `.heading`).
- **Spark layer hidden when idle** (2026-10-10, `effects.js`, also in the
  bundle). Joseph's screen recording showed a merge's sparks stuck on the
  board as a smeared band of streaks while play went on underneath. Astra
  and Claude both read it as Chrome on the phone showing a stale frame of
  the canvas. The canvas is now `display: none` except while sparks fly; when
  the last one dies the backing store is rebuilt and the canvas hidden. Each
  frame clears the whole backing store. **Not yet confirmed on the phone.**
  If it recurs, the next step is an sRGB canvas instead of display-p3, which
  makes the sparks slightly duller than the P3 tiles (a colour change: show
  Joseph first).
- **`tools/bot_classic.js`** (2026-10-12): an expectimax player that runs full
  classic games on the real GameManager. 17 of 18 games reached 8192 and 7
  reached 16384, which answered whether an 8192 can be made in normal play.
- **Fib, Threes and Turtle modes** (2026-10-12, `1d23169`, live; tested in
  the pane only, not yet on a phone). Three new pages on a five-way Game
  switch; see README → "Fib, Threes and Turtle". Turtle draws one of four
  turtle boards at random per new game (Sage, Reef Glider, Garden Keeper,
  Pocket Pal; Joseph approved all four and their colours). Rule tests:
  `node tools/test_variants.js` (23). The six columns in
  `tools/variant_columns.sql` were added in Supabase the same day; each page
  selects only its own columns, so a missing column only breaks that page's
  board. `effects.js` gained two page hooks (`fxCellCenter`,
  `fxTileToken`), so the bundle was rebuilt and the claude.ai artifact
  republished (version 13). `--chrome` for the new pages measured at 412 px:
  201 / 310 with the leaderboard (name-entry state). Classic measured 391 with
  two badge rows against its 388 setting; not changed, worth a recheck.
- **How to play cards** for Fib, Threes and Turtle (2026-10-12): a "?" beside
  the theme toggle (Joseph picked option A from a mockup) opens a rules card
  over the board. Tested in the pane: input is blocked while it is open, and
  it closes with Got it, Escape or a tap outside. Not in the bundle. Live as
  `eb64068`; that deploy's Pages build hung in `building` and a queued
  rebuild fixed it.
- **Moves instead of Best; Dispatch heading rethought** (2026-10-12).
  Classic, Fib, Threes and Turtle show a Moves box (swipes that moved
  something, saved as `moves` in each game state; old saves start at 0)
  where Best was. Dispatch: one-line heading (title + buttons), then a pill
  with the active order's tile and "Moves left" (title colour at 10 or
  fewer, `LOW_MOVES`) plus a Shipped box, and at the right of the same row
  the next tiles stacked over the two queued orders (arrows, no labels); under
  384 px of page width that stack wraps to its own line. The active order's arrow, the Best today
  box and the Practice tag are gone; on-screen "turns" became "moves".
  Fable and Astra both reviewed the old layout; Joseph picked a mix of their
  two proposals from a mockup. Dispatch `--chrome` went down 69 px.
  Tested headless at 412 px, both themes and 640 px tall. Joseph then played
  it on his phone: "it's good", though he doesn't really notice the previews
  (he thinks that's how he plays, not where they sit). Not yet asked whether
  Amanda uses the queued orders; if neither does, they could go.
- **Dispatch: the shipping tile now draws above the others**: its z-index rule
  keys off the inner `.is-shipping` element via `:has()`, since the actuator
  rewrites the wrapper's classes a frame after adding it.

## What changed 2026-10-20 (live as `701ff1c`; claude.ai copy republished, version 15)

- **A menu replaces the Game switch** on every page (`app/js/game_menu.js`,
  new; in the precache list, not in the bundle). The button sits after New
  Game, styled as the old theme toggle. It lists the five games, then How to
  play (Fib, Threes, 🐢48) and the day/night switch: `theme.js` and
  `how_to_play.js` now add rows to it with `GameMenu.add` instead of putting
  buttons in the heading. A tap or swipe outside closes it and is swallowed,
  so it never moves tiles. Joseph picked this (option B) from a mockup; option
  A kept "?" and the theme button in the heading.
- **Every page's `--chrome` went down 41 px** (the game row was 28.7 px plus a
  12 px gap): classic 240 / 347, Fib and Threes 160 / 269, Dispatch 162 / 326
  and 300 from 684 px tall (the 229 step fell into landscape and went). The
  bundle had no game row but shared classic's 281, so it was over-reserving;
  240 is now right for it too. Checked headless at 412 x 640 with each page's
  leaderboard (name-entry state): nothing cut off.
- **Turtle is now 🐢48** (the plain U+1F422 character, so the phones draw
  Android's own turtle). Only on-screen text changed: folder, classes,
  storage keys, leaderboard columns and code names still say turtle.
- **🐢48 pad and hold-to-repeat.** Six wedges under the board, one per board
  side; the wedge a swipe, key or press picked lights up. Holding a wedge
  repeats; a swipe now moves as soon as it is 30 px out (`commitDistance`)
  and repeats while held, with classic's 0.35 s / 0.2 s timing, stopping when
  a move changes nothing (`TurtleManager.lastMoved`). The pad scales with the
  board (0.42 wide, capped at 190 px), so it is in the board's divisor
  (1.406) rather than `--chrome` (172 / 281). Joseph chose it always on, no
  switch. Tested in the pane with synthetic pointer events only.
- **Not yet asked:** whether committing a swipe at 30 px reads the angle well
  enough on the phone (the old code read it from the whole swipe at the
  lift); whether the pad is big enough.
- **Classic's Tiles and Auto-fill moved into the menu too** (Joseph's call,
  same day, after the deploy above): rows that flip in place and show their
  value. Classic `--chrome` is now 159 / 266; the bundle keeps its switches
  and 240 through `:root:has(.palette-switch)`. Checked at 412 x 640 with the
  leaderboard: fits exactly. A held down swipe with Auto-fill turned on from
  the menu repeated 7 times in 1.4 s.

## Shipping a change

1. Edit under `app/`. Run `node tools/test_dispatch.js` if Dispatch was
   touched (24 tests; `--sim` adds the 60-day bot run, ~10 s), and
   `node tools/test_variants.js` for Fib, Threes or Turtle.
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
  412 px wide: classic 159 / 266 with leaderboard (the bundle, which keeps
  its switch rows, 240); Fib and Threes 160 / 269;
  🐢48 172 / 281 plus its pad, which is in the board's divisor; Dispatch
  162 / 326, or 300 with the leaderboard once the screen is tall enough for
  the one-line orders row (see the media queries in `dispatch.css`). All
  were 41 px higher before the game row moved into the menu (2026-10-20). A
  fresh measurement of the old 🐢48 page with a leaderboard row showing gave
  345 against its 310 setting, the same kind of gap classic showed. Recheck after any
  change to the page furniture, at heights 915 → 640. Measure by summing the
  container's visible children, gaps and padding, minus the board: the
  container itself stretches to the viewport, so its own height is useless.
- Bash commands over ~8 KB are silently cut off, and heredocs mangle `\u`,
  `\0` and quotes. Write edit scripts to the scratchpad with Write and run them.
- **Videos from Joseph's phone:** there is no ffmpeg or OpenCV here. Play the
  file in the browser pane and draw frames to a canvas, but load it with
  `fetch` into a blob URL first: `python -m http.server` ignores range
  requests, so every seek silently lands on frame 0 and the video looks
  frozen (this misled a whole diagnosis once).
- **The pane caches scripts hard,** even after `fetch(..., {cache: "reload"})`.
  A tiny server that sends `Cache-Control: no-store` is the reliable fix.

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
7. **Check the spark fix on the phone.** Ask whether the stuck streaks have
   come back since 2026-10-10 (see "Spark layer hidden when idle").
8. **Dispatch "best N" line not yet seen in real use.** It appears only when a
   practice run beats the counted one.

9. **New modes not yet played on a phone.** Ask how Threes' one-cell moves
   and Turtle's six-way swipes feel, whether the sideways swipe picks the
   diagonal she meant, and whether Turtle's 2048 is too easy or too hard on 19
   cells with six directions (the classic bot could be adapted to measure it).
   Fib's tiles above 144 are all the dark super tile; if that is too much dark
   late in a game, extend the ramp (a colour change: show Joseph first).

## Known limits (not bugs)

- Installed-app status bar is near-black in both themes: a WebAPK bakes it from
  the manifest (crbug 40634649). Fullscreen avoided it but made the layout jump
  whenever a back swipe revealed the bars, so the app runs standalone.
- The back guard can't stop Android's gesture, only absorb the first back per
  interaction; after it catches one, the next back always exits.
- No sign-in: the leaderboard can't prove who posted, and the key is public.
- Identity is per device: a new phone makes a new row until it is linked with
  `?link=<player_id>`, and the stray row then has to be deleted by hand.
- Dispatch with the leaderboard: below about 700 px of viewport height the
  board, and so the page, gets narrow enough that the "Dispatch" title runs
  under the score boxes (it did before 2026-10-10 too). Below a 300 px heading
  the captions shorten to "Turns" / "Best", which keeps it from starting
  sooner. A 412 x 915 phone screen is well clear of it.
