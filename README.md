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
tools/      icon generator and the bundler
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

**Wide-gamut tiles.** The 2048 ramp is almost entirely warm orange and gold,
which is exactly where sRGB clips hardest and where this panel has headroom. The
warm half of the ramp is specified in `display-p3`, pushed past the sRGB edge
rather than converted to it. Neutrals are untouched — they carry the game's
identity and gain nothing. Non-P3 browsers get the original hex values via
`@supports`.

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
Only the structural colours and the two pale tiles change — the orange-to-gold
ramp is identical in both themes, because those colours were chosen to glow
against a muted board and they do that on a dark ground too. The ground is a warm
near-black rather than a neutral grey, which next to this board would read as
dirty, and which an OLED lights for almost nothing. The toggle is injected by
`theme.js` at runtime, so hosts that own the page theme get the themed game
without a control fighting them for it.

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
HTTPS before the Pixel will install anything. GitHub Pages is the shortest route.

Create an empty repo on GitHub — **public**, since Pages on a free account will
not serve a private one — then, from this directory:

```bash
git remote add origin https://github.com/<you>/2048-pixel.git
git push -u origin main
git subtree push --prefix app origin gh-pages
```

The third command publishes the contents of `app/` to the root of a `gh-pages`
branch, which is what keeps the site URL clean while leaving this repo's layout
alone. Re-run that same command after any change.

In the repo's **Settings → Pages**, set the source to the `gh-pages` branch,
folder `/ (root)`. The site appears at
`https://<you>.github.io/2048-pixel/` within a minute or two.

Open that on the Pixel in Chrome and use **⋮ → Add to Home screen** (Chrome may
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

### If Chrome does not offer to install

Open `chrome://inspect` on the desktop with the phone connected, or just check in
DevTools on the desktop first: **Application → Manifest** lists any unmet install
criterion. The usual causes are a non-HTTPS origin, a service worker that failed
to register, or a stale cached `manifest.webmanifest` — bump `CACHE` in
`app/sw.js` and reload twice.

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
