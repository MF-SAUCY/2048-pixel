// Rule tests and a difficulty simulation for app/dispatch/dispatch.js.
//
//   node tools/test_dispatch.js          run the tests
//   node tools/test_dispatch.js --sim    also play 60 daily runs with a
//                                        lookahead bot and report how it fares
//
// The game loads into a bare VM context with upstream's Grid, Tile and
// GameManager, and no DOM: dispatch.js only starts its UI when a page has a
// .dispatch element.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const app = path.join(__dirname, "..", "app");
const context = vm.createContext({ Math, JSON, console });
for (const file of ["js/grid.js", "js/tile.js", "js/game_manager.js", "dispatch/dispatch.js"]) {
  vm.runInContext(fs.readFileSync(path.join(app, file), "utf8"), context, { filename: file });
}
const D = vm.runInContext("Dispatch", context);
const Tile = vm.runInContext("Tile", context);

function memoryStorage(state) {
  let saved = state || null;
  let best = 0;
  return {
    getGameState: () => saved,
    setGameState: (s) => { saved = JSON.parse(JSON.stringify(s)); },
    clearGameState: () => { saved = null; },
    getBestScore: () => best,
    setBestScore: (b) => { best = b; },
  };
}

function game(seed, state) {
  return new D.DispatchManager({ storage: memoryStorage(state), seedFor: () => seed });
}

function clearBoard(g) {
  g.grid.eachCell((x, y, tile) => { if (tile) g.grid.removeTile(tile); });
}

function place(g, x, y, value) {
  g.grid.insertTile(new Tile({ x, y }, value));
}

// Values made inside the VM have that realm's prototypes, which deepStrictEqual
// treats as different; compare them as plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b, msg) => assert.deepStrictEqual(plain(a), plain(b), msg);
const differ = (a, b, msg) => assert.notDeepStrictEqual(plain(a), plain(b), msg);

const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok  " + name);
}

/* ---- rules ---- */

test("orders: 8 of them, the day's ladder, no edge twice in a row", () => {
  for (const seed of ["2026-09-23", "2026-09-24", "2026-12-31"]) {
    const orders = D.makeOrders(seed);
    assert.strictEqual(orders.length, 8);
    const values = orders.map((o) => o.value).sort((a, b) => a - b);
    same(values, [8, 8, 16, 16, 16, 32, 32, 64]);
    for (let i = 1; i < orders.length; i++) assert.notStrictEqual(orders[i].edge, orders[i - 1].edge);
  }
  differ(D.makeOrders("2026-09-23"), D.makeOrders("2026-09-24"));
});

test("same seed and same swipes give the same game", () => {
  const a = game("2026-09-23"), b = game("2026-09-23");
  const moves = [UP, LEFT, DOWN, RIGHT, UP, UP, LEFT, DOWN, RIGHT, RIGHT, UP, LEFT];
  moves.forEach((m) => { a.move(m); b.move(m); });
  same(a.serialize(), b.serialize());
  differ(game("2026-09-24").serialize().grid, game("2026-09-23").serialize().grid);
});

test("a tile of the ordered value in a bay ships on the swipe that brings it there", () => {
  const g = game("t");
  g.orders[0] = { value: 8, edge: "top" };
  clearBoard(g);
  place(g, 1, 2, 8);
  g.move(UP);
  assert.strictEqual(g.shipped, 1);
  assert.strictEqual(g.score, 100);
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(g.grid.cellContent({ x: 1, y: 0 }), null, "shipped tile left the board");
});

test("a corner is not a bay", () => {
  const g = game("t");
  g.orders[0] = { value: 8, edge: "top" };
  clearBoard(g);
  place(g, 0, 2, 8);
  g.move(UP);
  assert.strictEqual(g.shipped, 0);
  assert.strictEqual(g.grid.cellContent({ x: 0, y: 0 }).value, 8);
});

test("a tile merged into a bay ships as the merged value", () => {
  const g = game("t");
  g.orders[0] = { value: 8, edge: "top" };
  clearBoard(g);
  place(g, 2, 2, 4);
  place(g, 2, 3, 4);
  g.move(UP);
  assert.strictEqual(g.shipped, 1);
});

test("the wrong value in a bay does not ship", () => {
  const g = game("t");
  g.orders[0] = { value: 8, edge: "top" };
  clearBoard(g);
  place(g, 1, 3, 16);
  g.move(UP);
  assert.strictEqual(g.shipped, 0);
  assert.strictEqual(g.turn, 1, "still a turn, since the tile moved");
});

test("a swipe that moves nothing but ships still counts", () => {
  const g = game("t");
  g.orders[0] = { value: 8, edge: "top" };
  clearBoard(g);
  place(g, 1, 0, 8);
  g.move(UP);
  assert.strictEqual(g.shipped, 1);
  assert.strictEqual(g.turn, 1);
});

test("a swipe that neither moves nor ships is not a turn", () => {
  const g = game("t");
  g.orders[0] = { value: 8, edge: "top" };
  clearBoard(g);
  place(g, 0, 0, 2);
  g.move(UP);
  g.move(LEFT);
  assert.strictEqual(g.turn, 0);
});

test("one shipment per swipe, even with both bays holding the value", () => {
  const g = game("t");
  g.orders[0] = { value: 8, edge: "top" };
  g.orders[1] = { value: 8, edge: "top" };
  clearBoard(g);
  place(g, 1, 0, 8);
  place(g, 2, 0, 8);
  g.move(DOWN); // both slide down: nothing in the top bays now
  assert.strictEqual(g.shipped, 0);
  clearBoard(g);
  place(g, 1, 1, 8);
  place(g, 2, 1, 8);
  g.move(UP);
  assert.strictEqual(g.shipped, 1);
});

test("each turn's tile lands in the first free cell of that turn's fixed order", () => {
  const g = game("2026-09-23");
  clearBoard(g);
  place(g, 0, 3, 2);
  g.move(RIGHT); // turn 1
  const supply = D.supplyFor("2026-09-23", 1);
  const occupied = [{ x: 3, y: 3 }];
  const first = supply.cells
    .map((i) => ({ x: i % 4, y: Math.floor(i / 4) }))
    .find((c) => !occupied.some((o) => o.x === c.x && o.y === c.y));
  const landed = g.grid.cellContent(first);
  assert.ok(landed && landed.value === supply.value);
});

test("the run ends when the turns run out", () => {
  const g = game("t");
  g.turn = D.TURN_LIMIT - 1;
  clearBoard(g);
  place(g, 0, 0, 2);
  g.move(RIGHT);
  assert.strictEqual(g.over, true);
  assert.strictEqual(g.reason, "turns");
});

test("shipping all 8 wins and banks the unused turns", () => {
  const g = game("t");
  g.shipped = 7;
  g.score = 700;
  g.turn = 40;
  g.orders[7] = { value: 64, edge: "left" };
  clearBoard(g);
  place(g, 3, 1, 64);
  g.move(LEFT);
  assert.strictEqual(g.won, true);
  assert.strictEqual(g.score, 800 + (D.TURN_LIMIT - 41));
  g.move(RIGHT);
  assert.strictEqual(g.turn, 41, "no play after the run ends");
});

test("a saved run reloads only on its own day", () => {
  const g = game("2026-09-23");
  g.move(UP);
  const state = g.serialize();
  same(game("2026-09-23", state).serialize(), state);
  assert.strictEqual(game("2026-09-24", state).turn, 0);
});

console.log(`\n${passed} passed`);

/* ---- difficulty simulation ---- */

if (process.argv.includes("--sim")) {
  const DEPTH = 3;

  function clone(g) {
    return game(g.seed, g.serialize());
  }

  function evaluate(g) {
    if (g.won) return 1e7 + g.score;
    if (g.over) return -1e7 + g.shipped * 1e5;
    let score = g.shipped * 1e5;
    let empty = 0;
    const order = g.activeOrder();
    const nextOrder = g.orders[g.shipped + 1];
    let bestDist = 9;
    let haveNext = false;
    g.grid.eachCell((x, y, tile) => {
      if (!tile) { empty++; return; }
      if (order && tile.value === order.value) {
        for (const b of D.bayCells(order.edge)) {
          bestDist = Math.min(bestDist, Math.abs(b.x - x) + Math.abs(b.y - y));
        }
      }
      if (nextOrder && tile.value === nextOrder.value) haveNext = true;
    });
    score += empty * 400;
    score += order ? (9 - bestDist) * 900 : 0;
    score += haveNext ? 600 : 0;
    return score;
  }

  function search(g, depth) {
    if (depth === 0 || g.won || g.over) return evaluate(g);
    let best = -Infinity;
    for (let d = 0; d < 4; d++) {
      const c = clone(g);
      const before = c.turn;
      c.move(d);
      if (c.turn === before) continue;
      best = Math.max(best, search(c, depth - 1));
    }
    return best === -Infinity ? evaluate(g) : best;
  }

  function play(seed) {
    const g = game(seed);
    while (!g.won && !g.over) {
      let bestMove = -1, bestValue = -Infinity;
      for (let d = 0; d < 4; d++) {
        const c = clone(g);
        const before = c.turn;
        c.move(d);
        if (c.turn === before) continue;
        const v = search(c, DEPTH - 1);
        if (v > bestValue) { bestValue = v; bestMove = d; }
      }
      if (bestMove < 0) break;
      g.move(bestMove);
    }
    return g;
  }

  const results = [];
  const start = new Date(2026, 8, 23);
  for (let i = 0; i < 60; i++) {
    const day = new Date(start.getTime() + i * 86400000);
    const g = play(D.todaySeed(day));
    results.push({ seed: g.seed, won: g.won, shipped: g.shipped, turn: g.turn, reason: g.reason, score: g.score });
  }
  const wins = results.filter((r) => r.won);
  const avg = (xs) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(1);
  console.log(`\nbot, depth ${DEPTH}, 60 days:`);
  console.log(`  completed all 8: ${wins.length}/60`);
  console.log(`  average shipped: ${avg(results.map((r) => r.shipped))}`);
  console.log(`  turns used when completing: ${avg(wins.map((r) => r.turn))}`);
  const losses = results.filter((r) => !r.won);
  console.log(`  losses by turns: ${losses.filter((r) => r.reason === "turns").length}, jammed: ${losses.filter((r) => r.reason === "jammed").length}`);
  const hist = {};
  results.forEach((r) => { hist[r.shipped] = (hist[r.shipped] || 0) + 1; });
  console.log("  shipped distribution:", JSON.stringify(hist));
}
