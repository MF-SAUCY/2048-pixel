# 2048 — Pixel 11 build

Gabriele Cirulli's [2048](https://github.com/gabrielecirulli/2048), ad-free and
retuned for one device instead of for every phone at once.

The game logic is upstream's, used verbatim — `game_manager.js`, `grid.js`,
`tile.js`, `local_storage_manager.js` and `html_actuator.js` are unmodified
copies. The merge rules, the 90/10 spawn split and the scoring are the original
ones. What was rewritten is everything between the game and the screen.

## Layout

```
upstream/   pristine clone of gabrielecirulli/2048, for reference (gitignored)
app/        the phone build — a real PWA, this is the one that installs
dist/       single-file bundle produced from app/, for single-page hosts
tools/      icon generator, bundler, and the colour-ramp solver and checker
```

`upstream/` is not tracked; it is the unmodified original, so re-create it with
`git clone https://github.com/gabrielecirulli/2048.git upstream` if you want it
back for diffing.

## What changed, and why

**The board fills the screen.** Upstream pins the board to 280px on any viewport
under 520px wide and positions tiles with fixed pixel transforms per breakpoint.
On a 412px-wide Pixel that wastes a third of the display. Here the board is one
length, `--board`, and every dimension derives from it; tiles are placed with
percentages of their own box, so the geometry is resolution-independent. The
board comes out at **388px instead of 280px — 92% more playing area.**

**Swipe anywhere.** Upstream only listens for swipes on the board itself. This
build reads them on the whole document, so a flick started on the heading or in
the margin still moves tiles.

**Fixed a double-fire bug.** Upstream's `bindButtonPress` binds both `click` and
`touchend`, so one tap runs the handler twice — on the win screen that restarted
the game and dismissed the message in a single tap. This build binds `click`
only. The swipe threshold also went from 10px to 20px, so a slightly smudged tap
is no longer read as a move.

**A cool-to-warm tile ramp.** Upstream's five gold tiles (128→2048) vary almost
nothing but the blue channel, so they land within 3.3 points of lightness and the
closest pair measures **ΔE2000 2.18** — barely twice the smallest difference a
person can detect. In practice they are one colour with five numbers on it.

This build replaces the whole ramp with a temperature gradient: cool blue at 2,
warming through cyan, teal, green and gold, landing on the hot red-orange that
used to sit on 64. It is solved in CIE LCh by `tools/make_gradient.py` rather
than picked by hand — hue rotates 278°→43°, chroma climbs throughout, and
lightness *arcs* up through the yellow-greens before falling to the terminal red,
so every pair gets a lightness step to go with the hue step. The search maximises
the worst adjacent pair subject to a contrast floor.

Result: **worst adjacent pair ΔE 10.49**, against 2.18 before.

The ramp is specified in `display-p3` — the cyan-to-green stretch sits well
outside sRGB — with clipped hex values as the `@supports` fallback. The ground
and board are untouched; they carry the game's identity and gain nothing from
the extra gamut.

**One ink for every tile.** Upstream switches from dark text to white partway up
the ramp, and that switch is where its legibility goes: **nine of its twelve
tiles** put text under the 3:1 that large bold text has to meet, bottoming out at
**1.42:1** on the 128. With lightness moving the way it does here there is no
single switch point that works anyway, so every tile takes the same near-black
`#241f1a`; the worst case on the ramp is **5.43:1**, clearing even the stricter
4.5:1 normal-text bar.

**A palette switch.** The footer carries a Custom / Original toggle, so the
upstream ramp is one tap away for comparison. Original is faithful — the same
hex values, the same dark-then-white ink split, and no display-p3 extension,
since "Original" should mean what upstream ships rather than an improved version
of it. The one exception is night: the 2 and 4 tiles are still darkened, and
their ink lightened with them, because upstream has no dark theme to be faithful
to and sixteen near-white tiles on a near-black ground is unpleasant.

Each tile class sets one custom property, `--c`. Background and glow both read
from it, so a tile's hue lives in exactly one place — and the bloom on the high
tiles takes the tile's own colour via `color-mix` instead of a fixed gold, so a
green 256 glows green and the red 2048 glows red.

Run `python tools/check_ramp.py` to re-measure any ramp, and
`python tools/make_gradient.py` to regenerate this one.

**Motion tuned for 120Hz.** Slides are 90ms (about 11 frames at 120Hz) on a
decelerating curve, with the merge pop timed to land just after the slide so the
two read as one motion. Tiles carry `will-change: transform` to stay on the
compositor.

**Merge effects.** Merging throws a burst of particles in the tile's own colour,
drawn on a `display-p3` canvas, scaled by the value merged — a 4 gets a flicker,
a 1024 gets a shower and a shockwave ring. The loop is delta-timed, so it runs at
the same speed at 60Hz and 120Hz, and it parks itself when the last particle dies
rather than holding the display at a high refresh rate. Disabled under
`prefers-reduced-motion`.

**Haptics.** One short pulse per move rather than per merge, so a four-way
cascade is a single crisp tick instead of a stutter; 8–22ms, scaled by the
largest merge. Distinct patterns on win and on game over.

**Day and night.** Three states, not two: with nothing stored the page follows
the system, so Android's scheduled dark theme moves it at sunset on its own; the
toggle stores an explicit choice that overrides the system in both directions.
Only the structural colours change. The gradient is identical in both themes,
since every stop is a mid-lightness saturated colour that holds against a cream
board and a near-black one alike — something the old ramp could not claim, as its
2 and 4 were near-white and had to be darkened separately for night play. The
ground is a warm near-black rather than a neutral grey, which next to this board
would read as dirty. The toggle is injected by `theme.js` at runtime, so hosts
that own the page theme get the themed game without a control fighting them for
it.

**Offline and installable.** A service worker precaches the whole shell — a dozen
small files — and serves it cache-first, so the game works in airplane mode once
installed.

## Running it locally

```bash
cd app && python -m http.server 8412
```

Then open `http://localhost:8412`. Service workers count `localhost` as a secure
origin, so the offline behaviour works here too.

## Installing it on the phone

A service worker will not register over plain HTTP, so the files have to be on
HTTPS before the Pixel will install anything. This repo is already deployed:

**https://mf-saucy.github.io/2048-pixel/**

It is served from the root of the `gh-pages` branch, which holds the contents of
`app/` and nothing else. GitHub enabled Pages by itself the moment that branch
appeared, so there was no Settings step.

To ship a change, commit it on `main` and then republish the subtree:

```bash
git push
git subtree push --prefix app origin gh-pages
```

That second command is the deploy. It keeps the site URL clean while leaving this
repo's layout alone. Bump `CACHE` in `app/sw.js` first if you touched a shell
file, or already-installed copies will keep serving the old one.

Open the site on the Pixel in Chrome and use **⋮ → Add to Home screen** (Chrome may
offer *Install app* instead — same thing). Because the manifest, the icons and a
service worker with a fetch handler are all present, Chrome mints a **WebAPK**: a
real signed Android package, with its own entry in the app drawer, its own task in
the recents switcher, its own listing under Settings → Apps, and no browser UI.
It is an installed app in every sense except that Chrome generated it rather than
a build toolchain.

Every path in the app is relative — `start_url`, `scope`, the service worker
registration and the manifest's icon paths — so serving from a repo subdirectory
needs no configuration. `app/.nojekyll` stops Pages running the files through
Jekyll on the way out.

### Why the manifest asks for fullscreen

An installed WebAPK takes its status bar colour from the manifest's `theme_color`
and bakes it in at install time. It does **not** repaint when the page changes
`meta[name="theme-color"]` at runtime ([crbug.com/40634649][bug]), so `theme.js`
cannot reach it from inside the app. Since `theme_color` is a single static value
and this app has two grounds — cream and near-black — any choice leaves one theme
with a mismatched band across the top of the screen.

`"display": "fullscreen"` removes the status bar instead of trying to colour it,
which is correct in both themes and suits a game besides. `display_override`
falls back to `standalone` on anything that will not do fullscreen. The cost is
no clock or battery while playing; swiping down from the top edge brings the
status bar back temporarily. To trade that back, set `"display": "standalone"`
and drop `display_override` — and then pick whichever single `theme_color` you
would rather look at.

Browser tabs are unaffected by any of this: the page carries two media-scoped
`theme-color` tags for the system-follows case, and `theme.js` writes the
effective colour into both when the toggle overrides them.

**Manifest changes need a reinstall.** Chrome re-reads the manifest on its own
schedule, roughly daily, and applies the update on a later launch. To see a
manifest change immediately, long-press the icon, uninstall, and add it to the
home screen again.

[bug]: https://issues.chromium.org/issues/40634649

### If Chrome does not offer to install

Open `chrome://inspect` on the desktop with the phone connected, or just check in
DevTools on the desktop first: **Application → Manifest** lists any unmet install
criterion. The usual causes are a non-HTTPS origin, a service worker that failed
to register, or a stale cached `manifest.webmanifest` — bump `CACHE` in
`app/sw.js` and reload twice.

## The leaderboard

Two players, one shared table. It is deliberately the smallest thing that works:
plain REST from the page, no SDK, no build step, no sign-in.

It hides itself completely until configured, so the game is unaffected if you
never set it up — and the single-file bundle in `dist/` excludes it outright,
since that host blocks requests to third-party origins.

### Setting it up

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run:

```sql
create table public.scores (
  player_id text primary key,
  name      text    not null,
  best      integer not null default 0,
  games     integer not null default 0,
  best_tile integer not null default 0
);

alter table public.scores enable row level security;

-- The page talks to the table as the anonymous role. Upserting needs insert
-- and update separately: PostgREST resolves a duplicate key by updating.
create policy "read scores"   on public.scores for select to anon using (true);
create policy "insert scores" on public.scores for insert to anon with check (true);
create policy "update scores" on public.scores for update to anon using (true) with check (true);

-- Projects created with "automatically expose new tables" off need this too;
-- on other projects it is a harmless no-op.
grant select, insert, update on public.scores to anon;
```

3. From **Project Settings**, copy the project URL and the **publishable** key
   (`sb_publishable_…`), or on older projects the legacy **anon / public** key.
   Never use the secret or service role key, which must never leave the server.
4. Paste both into `app/js/leaderboard-config.js`.
5. Bump `CACHE` in `app/sw.js`, then deploy:
   `git push && git subtree push --prefix app origin gh-pages`.
6. Open the site on both phones. Each device asks for a name once and keeps it.

### What it records

Each device mints a random id on first run and owns one row: name, best score,
games finished, and highest tile reached. Scores post when a game ends and when
a personal best is beaten, coalesced so a finished game is one write. If the
network is down the row is kept in `localStorage` and flushed on the next
successful contact, so the installed app still records scores in airplane mode.

### What it does not do

**It cannot prove who posted a score.** There is no sign-in: identity is a name
typed on each device, and the anon key ships inside a page served from a public
repo, so treat it as readable by anyone who looks. Anyone holding it can read
the table and write any row in it. For two people and a 2048 score that is a
reasonable trade, and it is why the table holds nothing but first names and
numbers. It is *not* a trade you should extend to anything else — do not add a
column you would mind a stranger reading or rewriting.

If you ever want it to be real, the upgrade is Supabase Auth: both of you sign
in with a magic link, and the policies become `auth.uid() = player_id` so each
row can only be written by its owner. That is a bigger change than this is worth
today.

## Rebuilding

```bash
python tools/make_icons.py          # regenerate app/icons/
python tools/build_single_file.py   # regenerate dist/2048-pixel.html
```

`dist/2048-pixel.html` inlines the markup, the CSS and eleven of the twelve
scripts into a single page for hosts that serve only one file. `theme.js` is
deliberately left out: those hosts set the page theme themselves, and the
stylesheet already answers to `data-theme`, so the game follows the host instead
of carrying a toggle that would argue with it. Fonts stay external at the same
relative path `app/` uses, so one `style/fonts/` directory serves both builds.

Bump `CACHE` in `app/sw.js` whenever a shell file changes, or installed copies
will keep serving the old one.

## Licence

MIT, upstream's — see `app/LICENSE.txt`. Original game by Gabriele Cirulli.
