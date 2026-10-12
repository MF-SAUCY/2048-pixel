// A computer player for classic, to see how far normal play can go.
//
//   node tools/bot_classic.js [games] [depth]    defaults: 4 games, depth 4
//
// Each game starts from an empty board and runs on the app's own GameManager,
// Grid and Tile, so the moves and the random tile spawns (90% 2s, 10% 4s, in a
// random empty cell) are the real game's. It presses "Keep going" at 2048 and
// plays until the board locks. Moves are chosen by an expectimax search on a
// nibble bitboard with the usual 2048 heuristic (empty cells, merges,
// monotone rows and columns). After every move the real board is checked
// against the planner's prediction plus exactly one new 2 or 4; "mismatches"
// should always be 0. The up guard lives in the page, not GameManager, so it
// is not in play here. Games run in parallel worker threads; one JSON line per
// game, then a summary.
//
// First run, 2026-10-12, 18 games at depth 4: 17 reached 8192 (around move
// 3,700-4,200) and 7 reached 16384; scores 80k-387k; 0 mismatches in about
// 155,000 moves. A depth-4 game takes three to five minutes.

const fs = require("fs"), path = require("path"), vm = require("vm");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const appDir = path.join(__dirname, "..", "app");
const MAX_DEPTH = isMainThread ? +(process.argv[3] || 4) : workerData.maxDepth;

/* ---- tables ---- */
const rowLeft = new Uint16Array(65536), rowRight = new Uint16Array(65536);
const heur = new Float64Array(65536);
(function build() {
  const LOST = 200000, MONO_POW = 4, MONO_W = 47, SUM_POW = 3.5, SUM_W = 11, MERGE_W = 700, EMPTY_W = 270;
  for (let row = 0; row < 65536; row++) {
    const l = [row & 15, (row >> 4) & 15, (row >> 8) & 15, (row >> 12) & 15];
    // heuristic
    let sum = 0, empty = 0, merges = 0, prev = 0, counter = 0;
    for (const r of l) {
      sum += Math.pow(r, SUM_POW);
      if (r === 0) { empty++; continue; }
      if (prev === r) counter++; else if (counter > 0) { merges += 1 + counter; counter = 0; }
      prev = r;
    }
    if (counter > 0) merges += 1 + counter;
    let monoL = 0, monoR = 0;
    for (let i = 1; i < 4; i++) {
      if (l[i - 1] > l[i]) monoL += Math.pow(l[i - 1], MONO_POW) - Math.pow(l[i], MONO_POW);
      else monoR += Math.pow(l[i], MONO_POW) - Math.pow(l[i - 1], MONO_POW);
    }
    heur[row] = LOST + EMPTY_W * empty + MERGE_W * merges - MONO_W * Math.min(monoL, monoR) - SUM_W * sum;
    // slide left
    const t = l.filter((v) => v);
    const out = [];
    for (let i = 0; i < t.length; i++) {
      if (i + 1 < t.length && t[i] === t[i + 1] && t[i] < 15) { out.push(t[i] + 1); i++; }
      else out.push(t[i]);
    }
    while (out.length < 4) out.push(0);
    rowLeft[row] = out[0] | (out[1] << 4) | (out[2] << 8) | (out[3] << 12);
  }
  const rev = (x) => ((x & 15) << 12) | (((x >> 4) & 15) << 8) | (((x >> 8) & 15) << 4) | ((x >> 12) & 15);
  for (let row = 0; row < 65536; row++) rowRight[row] = rev(rowLeft[rev(row)]);
})();

// Board: array of 4 row ints; row r nibble c = rank at (row r, col c).
function transpose(b) {
  const o = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c] |= ((b[r] >> (4 * c)) & 15) << (4 * r);
  return o;
}
// dir: 0 up, 1 right, 2 down, 3 left (the game's numbering)
function move(b, dir) {
  if (dir === 3) return b.map((r) => rowLeft[r]);
  if (dir === 1) return b.map((r) => rowRight[r]);
  const t = transpose(b);
  return transpose(t.map((r) => (dir === 0 ? rowLeft[r] : rowRight[r])));
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
function score(b) {
  const t = transpose(b);
  return heur[b[0]] + heur[b[1]] + heur[b[2]] + heur[b[3]] + heur[t[0]] + heur[t[1]] + heur[t[2]] + heur[t[3]];
}
const key = (b) => b[0] + "," + b[1] + "," + b[2] + "," + b[3];

let cache;
function chance(b, depth, prob) {
  if (depth <= 0 || prob < 1e-4) return score(b);
  const k = key(b) + "|" + depth;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  let total = 0, empties = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if ((b[r] >> (4 * c)) & 15) continue;
    empties++;
    const b2 = b.slice(); b2[r] |= 1 << (4 * c);
    const b4 = b.slice(); b4[r] |= 2 << (4 * c);
    total += 0.9 * maxNode(b2, depth, prob * 0.9) + 0.1 * maxNode(b4, depth, prob * 0.1);
  }
  const v = empties ? total / empties : score(b);
  cache.set(k, v);
  return v;
}
function maxNode(b, depth, prob) {
  let best = 0;
  for (let d = 0; d < 4; d++) {
    const n = move(b, d);
    if (same(n, b)) continue;
    const v = chance(n, depth - 1, prob);
    if (v > best) best = v;
  }
  return best;
}
function distinct(b) {
  let mask = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) mask |= 1 << ((b[r] >> (4 * c)) & 15);
  let n = 0; for (let i = 2; i < 16; i++) if (mask & (1 << i)) n++;
  return n;
}
function choose(b) {
  cache = new Map();
  const depth = Math.min(MAX_DEPTH, Math.max(2, distinct(b) - 2));
  let best = -1, bestDir = -1;
  for (let d = 0; d < 4; d++) {
    const n = move(b, d);
    if (same(n, b)) continue;
    const v = chance(n, depth, 1);
    if (v > best) { best = v; bestDir = d; }
  }
  return bestDir;
}

/* ---- the real game ---- */
function loadGame() {
  const ctx = vm.createContext({ Math, JSON, console });
  for (const f of ["js/grid.js", "js/tile.js", "js/game_manager.js"]) {
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
    return function () { return new GameManager(4, Input, Actuator, Storage); };
  })()`, ctx);
}

function boardOf(g) {
  const b = [0, 0, 0, 0];
  g.grid.eachCell((x, y, t) => { if (t) b[y] |= Math.log2(t.value) << (4 * x); });
  return b;
}

function playOne(newGame) {
  const g = newGame();
  const reached = {};
  let moves = 0, mismatches = 0;
  const t0 = Date.now();
  for (;;) {
    if (g.won && !g.keepPlaying) g.keepPlaying = true; // "Keep going"
    if (g.over) break;
    const b = boardOf(g);
    const d = choose(b);
    if (d < 0) break;
    const predicted = move(b, d);
    g.move(d);
    moves++;
    // The real game must equal the prediction plus exactly one new 2 or 4.
    const after = boardOf(g);
    let added = 0, bad = false;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const p = (predicted[r] >> (4 * c)) & 15, a = (after[r] >> (4 * c)) & 15;
      if (p === a) continue;
      if (p === 0 && (a === 1 || a === 2)) added++; else bad = true;
    }
    if (bad || added !== 1) mismatches++;
    let top = 0; g.grid.eachCell((x, y, t) => { if (t && t.value > top) top = t.value; });
    if (!reached[top]) reached[top] = moves;
  }
  let top = 0; g.grid.eachCell((x, y, t) => { if (t && t.value > top) top = t.value; });
  return { top, score: g.score, moves, mismatches, reached, seconds: Math.round((Date.now() - t0) / 1000) };
}

if (isMainThread) {
  const games = +(process.argv[2] || 4);
  const threads = Math.min(games, require("os").cpus().length - 1 || 1);
  let next = 0, done = 0;
  const results = [];
  const finish = () => {
    if (++done < games) return start();
    const tops = {};
    results.forEach((r) => { tops[r.top] = (tops[r.top] || 0) + 1; });
    const mismatches = results.reduce((a, r) => a + r.mismatches, 0);
    console.log(`
${results.length} games at depth ${MAX_DEPTH}. Biggest tile: ` +
      Object.keys(tops).map((t) => `${t} x${tops[t]}`).join(", ") +
      `. Reached 8192: ${results.filter((r) => r.reached[8192]).length}. Mismatches: ${mismatches}.`);
  };
  const start = () => {
    if (next >= games) return;
    const id = next++;
    const w = new Worker(__filename, { workerData: { maxDepth: MAX_DEPTH, id } });
    w.on("message", (m) => { results.push(m); console.log(JSON.stringify({ game: id + 1, ...m })); finish(); });
    w.on("error", (e) => { console.log(JSON.stringify({ game: id + 1, error: String(e) })); finish(); });
  };
  for (let i = 0; i < threads; i++) start();
} else {
  parentPort.postMessage(playOne(loadGame()));
}
