// A computer player for 🐢48 (app/turtle), to see how far normal play can go.
//
//   node tools/bot_turtle.js [games] [depth] [cap]    defaults: 12 games, depth 2, no move cap
//
// Each game starts from an empty board and runs on the app's own TurtleManager,
// HexGrid and Tile, so the six-way moves and the random tile spawns (90% 2s,
// 10% 4s, in a random empty cell) are the real game's. It presses "Keep going"
// at 2048 and plays until the board locks (or until cap moves, for a quick
// check). Moves are chosen by an expectimax search over the 19 cells with the
// classic bot's heuristic (empty cells, merges, monotone lines) applied to the
// hexagon's 15 lines. After every move the real board is checked against the
// planner's prediction plus exactly one new 2 or 4; "mismatches" should always
// be 0. Games run in parallel worker threads; one JSON line per game, then a
// summary.
//
// First run, 2026-10-31, 12 games at depth 2 (with a scratch copy of the rules,
// before this file ran on the real TurtleManager): every game passed 16384.
// Biggest tile 16384 x1, 32768 x1, 65536 x4, 131072 x5, 262144 x1; median score
// 2.89M, best 5.25M; 15k-149k moves per game; 81 minutes for the run. The
// leaderboard's best that day was 628,420 with a 32768.

const fs = require("fs"), path = require("path"), vm = require("vm");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const appDir = path.join(__dirname, "..", "app");
const MAX_DEPTH = isMainThread ? +(process.argv[3] || 2) : workerData.maxDepth;
const CAP = isMainThread ? +(process.argv[4] || 0) : workerData.cap;

/* ---- the board: 19 ranks, cell i at axial (q, r), game cell (q + 2, r + 2) ---- */
const cells = [];
for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) cells.push([q, r]);
const index = new Map(cells.map((c, i) => [c[0] + "," + c[1], i]));

// The game's directions 0-2 (up, up-right, down-right); 3-5 are their opposites.
const AXES = [[0, -1], [1, -1], [1, 0]];
// For each axis, its lines of cells, each ordered along the axis.
const lines = AXES.map(([dq, dr]) => {
  const out = [];
  for (const [q, r] of cells) {
    if (index.has((q - dq) + "," + (r - dr))) continue; // not the start of a line
    const line = [];
    for (let a = q, b = r; index.has(a + "," + b); a += dq, b += dr) line.push(index.get(a + "," + b));
    out.push(line);
  }
  return out;
});
const allLines = lines.flat();

// Slide a line of ranks toward its last cell.
function slide(v) {
  const t = v.filter((x) => x).reverse();
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (i + 1 < t.length && t[i] === t[i + 1]) { out.push(t[i] + 1); i++; }
    else out.push(t[i]);
  }
  while (out.length < v.length) out.push(0);
  return out.reverse();
}

// The board after a move in direction dir, or null if nothing moves.
function move(b, dir) {
  const n = b.slice();
  let moved = false;
  for (const l of lines[dir % 3]) {
    const line = dir < 3 ? l : l.slice().reverse();
    const out = slide(line.map((i) => b[i]));
    line.forEach((c, k) => { if (out[k] !== b[c]) moved = true; n[c] = out[k]; });
  }
  return moved ? n : null;
}

/* ---- the search ---- */
function lineScore(v) {
  let empty = 0, merges = 0, prev = 0, counter = 0, sum = 0;
  for (const r of v) {
    sum += Math.pow(r, 3.5);
    if (r === 0) { empty++; continue; }
    if (prev === r) counter++; else if (counter > 0) { merges += 1 + counter; counter = 0; }
    prev = r;
  }
  if (counter > 0) merges += 1 + counter;
  let monoL = 0, monoR = 0;
  for (let i = 1; i < v.length; i++) {
    if (v[i - 1] > v[i]) monoL += Math.pow(v[i - 1], 4) - Math.pow(v[i], 4);
    else monoR += Math.pow(v[i], 4) - Math.pow(v[i - 1], 4);
  }
  return 270 * empty + 700 * merges - 47 * Math.min(monoL, monoR) - 11 * sum;
}
const score = (b) => allLines.reduce((s, l) => s + lineScore(l.map((i) => b[i])), 0);

let cache;
function chance(b, depth) {
  const k = b.join(",") + "|" + depth;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const empties = [];
  for (let i = 0; i < 19; i++) if (!b[i]) empties.push(i);
  let v;
  if (depth <= 0 || !empties.length) v = score(b);
  else {
    let total = 0;
    for (const e of empties) {
      b[e] = 1; total += 0.9 * maxNode(b, depth - 1);
      b[e] = 2; total += 0.1 * maxNode(b, depth - 1);
      b[e] = 0;
    }
    v = total / empties.length;
  }
  cache.set(k, v);
  return v;
}
function maxNode(b, depth) {
  let best = -1e9;
  for (let d = 0; d < 6; d++) {
    const n = move(b, d);
    if (n) best = Math.max(best, chance(n, depth));
  }
  return best;
}
function choose(b) {
  cache = new Map();
  let best = -Infinity, bestDir = -1;
  for (let d = 0; d < 6; d++) {
    const n = move(b, d);
    if (!n) continue;
    const v = chance(n, MAX_DEPTH);
    if (v > best) { best = v; bestDir = d; }
  }
  return bestDir;
}

/* ---- the real game ---- */
function loadGame() {
  const ctx = vm.createContext({ Math, JSON, console });
  ctx.window = ctx;
  for (const f of ["js/grid.js", "js/tile.js", "js/local_storage_manager.js",
                   "js/game_manager.js", "turtle/turtle.js"]) {
    vm.runInContext(fs.readFileSync(path.join(appDir, f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext(`(function () {
    function Storage() { this.s = null; this.b = 0; }
    Storage.prototype.getGameState = function () { return this.s; };
    Storage.prototype.setGameState = function (s) { this.s = s; };
    Storage.prototype.clearGameState = function () { this.s = null; };
    Storage.prototype.getBestScore = function () { return this.b; };
    Storage.prototype.setBestScore = function (b) { this.b = b; };
    function Input() {} Input.prototype.on = function () {};
    function Actuator() {}
    Actuator.prototype.actuate = function () {};
    Actuator.prototype.continueGame = function () {};
    return function () { return new Turtle.TurtleManager(5, Input, Actuator, Storage); };
  })()`, ctx);
}

function boardOf(g) {
  return cells.map(([q, r]) => {
    const t = g.grid.cells[q + 2][r + 2];
    return t ? Math.log2(t.value) : 0;
  });
}

function playOne(newGame) {
  const g = newGame();
  const reached = {};
  let moves = 0, mismatches = 0;
  const t0 = Date.now();
  for (;;) {
    if (g.won && !g.keepPlaying) g.keepPlaying = true; // "Keep going"
    if (g.over || (CAP && moves >= CAP)) break;
    const b = boardOf(g);
    const d = choose(b);
    if (d < 0) break;
    const predicted = move(b, d);
    g.move(d);
    moves++;
    // The real game must equal the prediction plus exactly one new 2 or 4.
    const after = boardOf(g);
    let added = 0, bad = false;
    for (let i = 0; i < 19; i++) {
      if (predicted[i] === after[i]) continue;
      if (predicted[i] === 0 && (after[i] === 1 || after[i] === 2)) added++; else bad = true;
    }
    if (bad || added !== 1) mismatches++;
    const top = 1 << Math.max(...after);
    if (!reached[top]) reached[top] = moves;
  }
  const top = 1 << Math.max(...boardOf(g));
  return { top, score: g.score, moves, mismatches, reached, seconds: Math.round((Date.now() - t0) / 1000) };
}

if (isMainThread) {
  const games = +(process.argv[2] || 12);
  const threads = Math.min(games, require("os").cpus().length - 1 || 1);
  let next = 0, done = 0;
  const results = [];
  const finish = () => {
    if (++done < games) return start();
    const tops = {};
    results.forEach((r) => { tops[r.top] = (tops[r.top] || 0) + 1; });
    const scores = results.map((r) => r.score).sort((a, b) => a - b);
    const mismatches = results.reduce((a, r) => a + r.mismatches, 0);
    console.log(`
${results.length} games at depth ${MAX_DEPTH}${CAP ? `, capped at ${CAP} moves` : ""}. Biggest tile: ` +
      Object.keys(tops).map((t) => `${t} x${tops[t]}`).join(", ") +
      `. Median score ${scores[Math.floor(scores.length / 2)]}, best ${scores[scores.length - 1]}.` +
      ` Mismatches: ${mismatches}.`);
  };
  const start = () => {
    if (next >= games) return;
    const id = next++;
    const w = new Worker(__filename, { workerData: { maxDepth: MAX_DEPTH, cap: CAP, id } });
    w.on("message", (m) => { results.push(m); console.log(JSON.stringify({ game: id + 1, ...m })); finish(); });
    w.on("error", (e) => { console.log(JSON.stringify({ game: id + 1, error: String(e) })); finish(); });
  };
  for (let i = 0; i < threads; i++) start();
} else {
  parentPort.postMessage(playOne(loadGame()));
}
