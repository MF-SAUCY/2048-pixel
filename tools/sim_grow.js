// A simulation of turtle48x, the 🐢48 sub-mode that replaced egg mode, to check
// its numbers before any of it is built. The rules live here, not in app/.
//
//   node tools/sim_grow.js [games] [key=value ...]
//
// Rules simulated (agreed 2026-11-01):
//   - 🐢48's board and moves: 19 cells, six directions, 90% 2s / 10% 4s.
//   - A Double is earned the first time each tile of 2048 or more appears
//     (2048, 4096, 8192, …). Using one doubles up to 3 tiles of 2 to 64; it
//     scores nothing, merges nothing on the spot and is not a move.
//   - At growAt points the turtle grows once, the old cells keeping their
//     place in the middle: shape=6 a ring of 18 cells on all six sides (37
//     cells); shape=4 a row on the four sides by the head and tail (29 cells);
//     shape=3 a row on three sides in a row, both shoulders and the right (27).
//     The first move after it adds no tile. (Built: shape=6, as 🐢48x.)
//
// The bot: expectimax at `depth` with the classic heuristic plus a pull toward
// the tail cell (bottom middle of the current board). It doubles only when no
// move is left, picking the up-to-3 tiles whose best move leaves the best board.
// depth=1 (one move ahead) stands in for a casual player.
//
// Keys (defaults): shape=6 growAt=600000 every=0 doubles=1 pick=3 maxRank=6 pull=3 depth=1 limit=200000
//   every=1 earns a Double for every tile of 2048+ made, not just new ones.
//   doubles=0 turns Doubles off; growAt=0 never grows.

const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const DEFAULTS = { shape: 6, growAt: 600000, every: 0, doubles: 1, pick: 3, maxRank: 6, pull: 3, depth: 1, limit: 200000 };
const P = isMainThread ? parseArgs() : workerData.P;

function parseArgs() {
  const p = Object.assign({}, DEFAULTS);
  for (const a of process.argv.slice(3)) {
    const [k, v] = a.split("=");
    if (!(k in p)) throw new Error("unknown key " + k);
    p[k] = +v;
  }
  return p;
}

/* ---- boards of radius 2 and 3: 0 empty, r a tile of 2^r ---- */
// |q| <= Q, |r| <= R, |q + r| <= Z: equal radii are a regular hexagon; a
// larger R and Z lengthen it along the head-to-tail column (q = 0).
// b, if given, is [qmin, qmax, rmin, rmax, smin, smax] with s = -q - r.
function makeBoard(Q, R, Z, b) {
  b = b || [-Q, Q, -R, R, -Z, Z];
  const cells = [];
  for (let q = b[0]; q <= b[1]; q++) for (let r = b[2]; r <= b[3]; r++) {
    if (-q - r >= b[4] && -q - r <= b[5]) cells.push([q, r]);
  }
  const index = new Map(cells.map((c, i) => [c[0] + "," + c[1], i]));
  const tail = index.get("0," + Math.max(...cells.filter((c) => c[0] === 0).map((c) => c[1])));
  const hexDist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
  const reach = 2 * Math.max(...b.map(Math.abs)); // as 2R on a regular board
  const near = cells.map((c) => reach - hexDist(c, cells[tail]));
  const lines = [[0, -1], [1, -1], [1, 0]].map(([dq, dr]) => {
    const out = [];
    for (const [q, r] of cells) {
      if (index.has((q - dq) + "," + (r - dr))) continue;
      const line = [];
      for (let a = q, b = r; index.has(a + "," + b); a += dq, b += dr) line.push(index.get(a + "," + b));
      out.push(line);
    }
    return out;
  });
  return { R, n: cells.length, cells, index, near, lines, allLines: lines.flat() };
}
const SMALL = makeBoard(2, 2, 2), BIG = P.shape === 4 ? makeBoard(2, 3, 3)
  : P.shape === 3 ? makeBoard(0, 0, 0, [-2, 3, -3, 2, -2, 3]) : makeBoard(3, 3, 3);
// Where each small cell lands on the grown board.
const GROW_MAP = SMALL.cells.map(([q, r]) => BIG.index.get(q + "," + r));

let G = SMALL;

function slideLine(v) {
  const o = v.slice(), merged = new Array(v.length).fill(false);
  let gain = 0, moved = false, big = 0;
  for (let i = v.length - 1; i >= 0; i--) {
    const t = o[i];
    if (!t) continue;
    let j = i;
    while (j + 1 < o.length && o[j + 1] === 0) j++;
    const n = j + 1;
    if (n < o.length && o[n] === t && !merged[n]) {
      o[n] = t + 1; merged[n] = true; o[i] = 0; gain += 2 ** (t + 1); moved = true;
      if (t + 1 >= 11) big++;
    } else if (j !== i) {
      o[i] = 0; o[j] = t; moved = true;
    }
  }
  return { o, gain, moved, big };
}

function move(b, dir) {
  const n = b.slice();
  let gain = 0, moved = false, big = 0;
  for (const l of G.lines[dir % 3]) {
    const line = dir < 3 ? l : l.slice().reverse();
    const r = slideLine(line.map((i) => b[i]));
    if (!r.moved) continue;
    moved = true; gain += r.gain; big += r.big;
    line.forEach((c, k) => { n[c] = r.o[k]; });
  }
  return moved ? { b: n, gain, big } : null;
}

/* ---- the search ---- */
function segScore(v) {
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
function score(b) {
  let s = 0;
  for (const l of G.allLines) s += segScore(l.map((i) => b[i]));
  for (let i = 0; i < G.n; i++) if (b[i]) s += P.pull * Math.pow(b[i], 4) * G.near[i];
  return s;
}

let cache;
function chance(b, depth) {
  const k = b.join(",") + "|" + depth;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  const empties = [];
  for (let i = 0; i < G.n; i++) if (!b[i]) empties.push(i);
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
  let best = -1e12;
  for (let d = 0; d < 6; d++) {
    const m = move(b, d);
    if (m) best = Math.max(best, chance(m.b, depth));
  }
  return best;
}
function bestMove(b) {
  let best = -Infinity, bestDir = -1;
  for (let d = 0; d < 6; d++) {
    const m = move(b, d);
    if (!m) continue;
    const v = chance(m.b, P.depth);
    if (v > best) { best = v; bestDir = d; }
  }
  return { dir: bestDir, v: best };
}
function choose(b) { cache = new Map(); return bestMove(b).dir; }

/* ---- a game ---- */
function spawn(b) {
  const e = [];
  for (let i = 0; i < G.n; i++) if (!b[i]) e.push(i);
  if (e.length) b[e[Math.floor(Math.random() * e.length)]] = Math.random() < 0.9 ? 1 : 2;
}
const canMove = (b) => { for (let d = 0; d < 6; d++) if (move(b, d)) return true; return false; };

// The best set of up to P.pick eligible tiles to double on a stuck board, or null.
function pickDouble(b) {
  const el = [];
  for (let i = 0; i < G.n; i++) if (b[i] >= 1 && b[i] <= P.maxRank) el.push(i);
  let best = null, bestV = -Infinity;
  const tryset = (set) => {
    const t = b.slice();
    for (const i of set) t[i]++;
    cache = new Map();
    const m = bestMove(t);
    if (m.dir >= 0 && m.v > bestV) { bestV = m.v; best = set.slice(); }
  };
  const rec = (start, set) => {
    if (set.length) tryset(set);
    if (set.length === P.pick) return;
    for (let k = start; k < el.length; k++) { set.push(el[k]); rec(k + 1, set); set.pop(); }
  };
  rec(0, []);
  return best;
}

function playOne() {
  G = SMALL;
  let b = new Array(G.n).fill(0);
  spawn(b); spawn(b);
  let score = 0, moves = 0, doubles = 0, earned = 0, used = 0, top = 0, grewAt = 0, tilesDoubled = 0;
  let free = false;
  const earnAt = [], useAt = [];
  for (;;) {
    if (P.limit && moves >= P.limit) break;
    if (P.growAt && !grewAt && score >= P.growAt) {
      const nb = new Array(BIG.n).fill(0);
      b.forEach((x, i) => { nb[GROW_MAP[i]] = x; });
      G = BIG; b = nb; grewAt = moves; free = true;
    }
    if (!canMove(b)) {
      const set = P.doubles && doubles > 0 ? pickDouble(b) : null;
      if (!set) break;
      for (const i of set) b[i]++;
      doubles--; used++; tilesDoubled += set.length; useAt.push(moves);
      continue;
    }
    const d = choose(b);
    const m = move(b, d);
    b = m.b; score += m.gain; moves++;
    let fresh = 0;
    for (const x of b) {
      if (x > top) {
        if (x >= 11) fresh = 1;
        top = x;
      }
    }
    // every=1: each 2048+ made earns one; otherwise only a new top tile does.
    const gain = P.every ? m.big : fresh;
    for (let k = 0; k < gain; k++) { doubles++; earned++; earnAt.push(moves); }
    if (free) free = false; else spawn(b);
  }
  const short = (a) => a.slice(0, 10).join(" ") + (a.length > 10 ? " … " + a[a.length - 1] : "");
  return {
    score, moves, over: !P.limit || moves < P.limit, grewAt, earned, used, left: doubles, tilesDoubled,
    top: 2 ** top, earnAt: short(earnAt), useAt: short(useAt)
  };
}

if (isMainThread) {
  const games = +(process.argv[2] || 8);
  const threads = Math.min(games, require("os").cpus().length - 1 || 1);
  let next = 0, done = 0;
  const results = [];
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const finish = () => {
    if (++done < games) return start();
    console.log("\n" + games + " games, " + JSON.stringify(P));
    console.log("ended before the limit:", results.filter((r) => r.over).length,
      " grew:", results.filter((r) => r.grewAt).length);
    for (const k of ["score", "moves", "grewAt", "earned", "used", "top"]) {
      const v = results.map((r) => r[k]);
      console.log(k.padEnd(9), "median", med(v), " min", Math.min(...v), " max", Math.max(...v));
    }
  };
  const start = () => {
    if (next >= games) return;
    const id = next++;
    const w = new Worker(__filename, { workerData: { P } });
    w.on("message", (m) => { results.push(m); console.log(JSON.stringify({ game: id + 1, ...m })); finish(); });
    w.on("error", (e) => { console.log(JSON.stringify({ game: id + 1, error: String(e) })); finish(); });
  };
  for (let i = 0; i < threads; i++) start();
} else {
  parentPort.postMessage(playOne());
}
