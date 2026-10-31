// A simulation of the planned 🐢48 egg sub-mode, to check its egg economy before
// any of it is built. The rules live here, not in app/. Supersedes sim_carry.js,
// whose eggs grew in cost and only delayed the clog.
//
//   node tools/sim_nest.js [games] [key=value ...]
//
// Rules simulated (agreed 2026-10-31):
//   - 🐢48's board and moves: 19 cells, six directions, 90% 2s / 10% 4s.
//   - The nest is the tail cell (bottom middle, game cell 2,4). A 2048 on the
//     nest may be laid: it leaves the board and becomes an egg. Every egg costs
//     the same, one 2048.
//   - When an egg is laid the player chooses: keep it as an undo (the last
//     move is taken back and the replay draws a fresh tile), or turn it into a
//     slot on the turtle's back, up to slotCap slots.
//   - A tile of at least 2^carryMin (2048) can be moved into an empty slot at
//     any time. When a board tile equals a carried one it jumps up and merges
//     into it, scoring as a merge; carried tiles that become equal merge too,
//     freeing a slot.
//
// The bot: expectimax at `depth` with the classic heuristic plus a pull toward
// the nest. It lays while it holds fewer than keepUndo undos or fewer than
// slotCap slots, filling the undos first. It carries the eligible tile that
// leaves the best board when the board is down to carryAt empty cells, or when
// no move is left; failing that it undoes, failing that the game is over.
// depth=1 (one move ahead) stands in for a casual player.
//
// Keys (defaults): slotCap=6 keepUndo=2 carryMin=11 carryAt=4 pull=3 depth=1 limit=200000

const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

const DEFAULTS = { slotCap: 6, keepUndo: 2, carryMin: 11, carryAt: 4, pull: 3, depth: 1, limit: 200000 };
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

/* ---- the board: 19 ranks, 0 empty, r a tile of 2^r ---- */
const cells = [];
for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) cells.push([q, r]);
const index = new Map(cells.map((c, i) => [c[0] + "," + c[1], i]));
const NEST = index.get("0,2");
const hexDist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
const nearNest = cells.map((c) => 4 - hexDist(c, cells[NEST]));

const AXES = [[0, -1], [1, -1], [1, 0]];
const lines = AXES.map(([dq, dr]) => {
  const out = [];
  for (const [q, r] of cells) {
    if (index.has((q - dq) + "," + (r - dr))) continue;
    const line = [];
    for (let a = q, b = r; index.has(a + "," + b); a += dq, b += dr) line.push(index.get(a + "," + b));
    out.push(line);
  }
  return out;
});
const allLines = lines.flat();

// Slide a line toward its last cell; merged[k] is true where a merge landed.
function slideLine(v) {
  const o = v.slice(), merged = new Array(v.length).fill(false);
  let gain = 0, moved = false;
  for (let i = v.length - 1; i >= 0; i--) {
    const t = o[i];
    if (!t) continue;
    let j = i;
    while (j + 1 < o.length && o[j + 1] === 0) j++;
    const n = j + 1;
    if (n < o.length && o[n] === t && !merged[n]) {
      o[n] = t + 1; merged[n] = true; o[i] = 0; gain += 2 ** (t + 1); moved = true;
    } else if (j !== i) {
      o[i] = 0; o[j] = t; moved = true;
    }
  }
  return { o, merged, gain, moved };
}

// The board after a move, with its score and the rank merged on the nest (0 if none).
function move(b, dir) {
  const n = b.slice();
  let gain = 0, moved = false, nest = 0;
  for (const l of lines[dir % 3]) {
    const line = dir < 3 ? l : l.slice().reverse();
    const r = slideLine(line.map((i) => b[i]));
    if (!r.moved) continue;
    moved = true; gain += r.gain;
    line.forEach((c, k) => {
      n[c] = r.o[k];
      if (c === NEST && r.merged[k]) nest = r.o[k];
    });
  }
  return moved ? { b: n, gain, nest } : null;
}

// Board tiles equal to a carried tile jump up and merge; carried equals merge.
// Changes b and carried in place; returns the score.
function settle(b, carried) {
  let gain = 0, changed = true;
  while (changed) {
    changed = false;
    for (let s = 0; s < carried.length; s++) {
      const i = b.indexOf(carried[s]);
      if (carried[s] && i !== -1) {
        b[i] = 0; carried[s]++; gain += 2 ** carried[s]; changed = true;
      }
    }
    for (let s = 0; s < carried.length; s++) for (let t = s + 1; t < carried.length; t++) {
      if (carried[s] && carried[s] === carried[t]) {
        carried[s]++; carried[t] = 0; gain += 2 ** carried[s]; changed = true;
      }
    }
  }
  return gain;
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
  for (const l of allLines) s += segScore(l.map((i) => b[i]));
  for (let i = 0; i < 19; i++) if (b[i]) s += P.pull * Math.pow(b[i], 4) * nearNest[i];
  return s;
}

let cache, WANT = true;
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
  let best = -1e12;
  for (let d = 0; d < 6; d++) {
    const m = move(b, d);
    if (m) best = Math.max(best, chance(m.b, depth));
  }
  return best;
}
// While the bot wants an egg, a 2048 landing on the nest is worth a lot.
function choose(b) {
  cache = new Map();
  let best = -Infinity, bestDir = -1;
  for (let d = 0; d < 6; d++) {
    const m = move(b, d);
    if (!m) continue;
    const v = chance(m.b, P.depth) + (WANT && m.b[NEST] === 11 ? 1e6 : 0);
    if (v > best) { best = v; bestDir = d; }
  }
  return bestDir;
}

/* ---- a game ---- */
function spawn(b) {
  const e = [];
  for (let i = 0; i < 19; i++) if (!b[i]) e.push(i);
  if (e.length) b[e[Math.floor(Math.random() * e.length)]] = Math.random() < 0.9 ? 1 : 2;
}
const canMove = (b) => { for (let d = 0; d < 6; d++) if (move(b, d)) return true; return false; };
const empties = (b) => b.filter((x) => x === 0).length;

// The eligible tile whose carrying leaves the best board, or -1.
function pickCarry(b) {
  let best = -1, bestV = -Infinity;
  for (let i = 0; i < 19; i++) {
    if (b[i] < P.carryMin) continue;
    const t = b.slice(); t[i] = 0;
    const v = score(t);
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

function playOne() {
  let b = new Array(19).fill(0);
  let slots = []; // 0 an empty slot, r a carried tile of 2^r
  spawn(b); spawn(b);
  let score = 0, moves = 0, laid = 0, undos = 0, undosUsed = 0, carries = 0, top = 0;
  const layAt = [];
  let last = null; // the state before the last move, for an undo
  const wantEgg = () => undos < P.keepUndo || slots.length < P.slotCap;
  function carry() {
    const s = slots.indexOf(0), i = s < 0 ? -1 : pickCarry(b);
    if (i < 0) return false;
    slots[s] = b[i]; b[i] = 0; carries++;
    score += settle(b, slots);
    return true;
  }
  for (;;) {
    if (P.limit && moves >= P.limit) break;
    if (empties(b) <= P.carryAt) carry();
    if (!canMove(b)) {
      if (carry()) continue;
      if (last && last.undos > 0) {
        ({ b, score, moves, laid } = last);
        slots = last.slots; undos = last.undos - 1; layAt.length = last.layAtLen;
        undosUsed++; last = null;
        continue;
      }
      break;
    }
    WANT = wantEgg();
    const d = choose(b);
    last = { b: b.slice(), slots: slots.slice(), score, moves, laid, undos, layAtLen: layAt.length };
    const m = move(b, d);
    b = m.b; score += m.gain; moves++;
    score += settle(b, slots);
    spawn(b);
    if (b[NEST] === 11 && wantEgg()) {
      b[NEST] = 0; laid++; layAt.push(moves);
      if (undos < P.keepUndo || slots.length >= P.slotCap) undos++; else slots.push(0);
    }
    for (const x of b.concat(slots)) if (x > top) top = x;
  }
  return {
    score, moves, over: !P.limit || moves < P.limit, laid, slots: slots.length, carries, undosUsed,
    undosLeft: undos, top: 2 ** top, carried: slots.map((x) => (x ? 2 ** x : 0)),
    layAt: layAt.slice(0, 12).join(" ") + (layAt.length > 12 ? " … " + layAt[layAt.length - 1] : "")
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
    console.log("ended before the limit:", results.filter((r) => r.over).length);
    for (const k of ["score", "moves", "laid", "slots", "carries", "undosUsed", "top"]) {
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
