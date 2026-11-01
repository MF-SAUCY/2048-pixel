// Rule tests for the Fib, Threes and Turtle modes, and 🐢48x.
//
//   node tools/test_variants.js
//
// Each game loads into a bare VM context with upstream's Grid, Tile and
// GameManager and no DOM: the pages only start their UI when they find their
// own container class.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const app = path.join(__dirname, "..", "app");
const context = vm.createContext({ Math, JSON, console });
context.window = context;
for (const file of ["js/grid.js", "js/tile.js", "js/local_storage_manager.js",
                    "js/game_manager.js", "fib/fib.js", "threes/threes.js",
                    "turtle/turtle.js", "turtle/turtle48x.js"]) {
  vm.runInContext(fs.readFileSync(path.join(app, file), "utf8"), context, { filename: file });
}
const Fib = vm.runInContext("Fib", context);
const Threes = vm.runInContext("Threes", context);
const Turtle = vm.runInContext("Turtle", context);
const X = vm.runInContext("TurtleX", context);
const Tile = vm.runInContext("Tile", context);

const plain = (x) => JSON.parse(JSON.stringify(x));
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok  " + name);
}

/* ---- stand-ins for the page ---- */

function Input() { this.on = function () {}; }
function Actuator() { this.actuate = function () {}; this.continueGame = function () {}; }
function makeStorage() {
  let saved = null, best = 0, skin = null;
  return function Storage() {
    this.getGameState = () => saved;
    this.setGameState = (s) => { saved = plain(s); };
    this.clearGameState = () => { saved = null; };
    this.getBestScore = () => best;
    this.setBestScore = (b) => { best = b; };
    this.getLastSkin = () => skin;
    this.setLastSkin = (s) => { skin = s; };
  };
}

function clear(g) {
  g.grid.eachCell((x, y, t) => { if (t) g.grid.removeTile(t); });
}
function put(g, x, y, v) { g.grid.insertTile(new Tile({ x, y }, v)); }
function at(g, x, y) { const t = g.grid.cells[x][y]; return t ? t.value : 0; }
function row(g, y, n) { const out = []; for (let x = 0; x < (n || 4); x++) out.push(at(g, x, y)); return out; }

const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

/* ---- Fib ---- */

function fib() {
  return new Fib.FibManager(4, Input, Actuator, makeStorage());
}

test("fib: neighbours in the sequence merge, nothing else does", () => {
  for (const [a, b] of [[1, 1], [1, 2], [2, 1], [2, 3], [3, 5], [89, 144], [987, 1597]]) {
    assert.ok(Fib.canMerge(a, b), a + "+" + b);
  }
  for (const [a, b] of [[2, 2], [3, 3], [1, 3], [5, 13], [144, 144], [4, 4]]) {
    assert.ok(!Fib.canMerge(a, b), a + "+" + b);
  }
});

test("fib: a row merges once per tile, as in 2048", () => {
  const g = fib();
  clear(g);
  put(g, 0, 0, 1); put(g, 1, 0, 1); put(g, 2, 0, 2);
  g.move(LEFT);
  assert.deepStrictEqual(row(g, 0).slice(0, 2), [2, 2]);
  assert.strictEqual(g.score, 2);

  clear(g);
  put(g, 0, 1, 1); put(g, 1, 1, 2); put(g, 2, 1, 3);
  g.move(LEFT);
  assert.deepStrictEqual(row(g, 1).slice(0, 2), [3, 3]);
});

test("fib: 987 + 1597 is the win", () => {
  const g = fib();
  clear(g);
  put(g, 0, 0, 987); put(g, 3, 0, 1597);
  g.move(LEFT);
  assert.strictEqual(at(g, 0, 0), 2584);
  assert.ok(g.won);
});

test("fib: new tiles are 1s and 2s", () => {
  const g = fib();
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    clear(g);
    g.addRandomTile();
    g.grid.eachCell((x, y, t) => { if (t) seen.add(t.value); });
  }
  assert.deepStrictEqual([...seen].sort(), [1, 2]);
});

test("fib: a full board with no Fibonacci neighbours is over", () => {
  const g = fib();
  clear(g);
  const vals = [2, 5, 2, 5, 13, 2, 13, 2, 2, 5, 2, 5, 13, 2, 13, 2];
  for (let i = 0; i < 16; i++) put(g, i % 4, Math.floor(i / 4), vals[i]);
  assert.ok(!g.movesAvailable());
  clear(g);
  for (let i = 0; i < 16; i++) put(g, i % 4, Math.floor(i / 4), vals[i]);
  g.grid.removeTile(g.grid.cells[1][0]);
  put(g, 1, 0, 3); // 2 + 3 now meet
  assert.ok(g.movesAvailable());
});

test("fib: colours follow the classic ramp by step", () => {
  assert.strictEqual(Fib.tileToken(1), "--t2");
  assert.strictEqual(Fib.tileToken(2), "--t4");
  assert.strictEqual(Fib.tileToken(5), "--t16");
  assert.strictEqual(Fib.tileToken(144), "--t2048");
  assert.strictEqual(Fib.tileToken(233), "--tsuper");
});

/* ---- Threes ---- */

// A fixed draw for each test: next tile and bonus rolls come from `rolls`.
function threes(rolls) {
  const Storage = makeStorage();
  let i = 0;
  const random = rolls ? () => rolls[i++ % rolls.length] : Math.random;
  const g = new Threes.ThreesManager({ storage: new Storage(), random });
  return g;
}

test("threes: 1 + 2 makes 3; from 3 up, equal tiles merge", () => {
  assert.ok(Threes.canMerge(1, 2) && Threes.canMerge(2, 1));
  assert.ok(!Threes.canMerge(1, 1) && !Threes.canMerge(2, 2));
  assert.ok(Threes.canMerge(3, 3) && Threes.canMerge(48, 48));
  assert.ok(!Threes.canMerge(3, 6) && !Threes.canMerge(1, 3) && !Threes.canMerge(2, 3));
});

test("threes: a tile moves one cell at most", () => {
  const g = threes([0.5]);
  clear(g);
  put(g, 3, 0, 3);
  g.next = 1;
  g.move(LEFT);
  assert.deepStrictEqual(row(g, 0), [0, 0, 3, 1], "3 steps once, the new 1 enters behind it");
});

test("threes: the line moves as a train behind a merge", () => {
  const g = threes([0.5]);
  clear(g);
  put(g, 0, 0, 6); put(g, 1, 0, 3); put(g, 2, 0, 3); put(g, 3, 0, 12);
  g.next = 2;
  g.move(LEFT);
  assert.deepStrictEqual(row(g, 0), [6, 6, 12, 2]);

  clear(g);
  put(g, 0, 1, 1); put(g, 1, 1, 2); put(g, 2, 1, 1); put(g, 3, 1, 2);
  g.next = 3;
  g.move(LEFT);
  assert.deepStrictEqual(row(g, 1), [3, 1, 2, 3]);
});

test("threes: two tiles that both moved do not merge", () => {
  const g = threes([0.5]);
  clear(g);
  put(g, 1, 0, 3); put(g, 2, 0, 3);
  g.next = 1;
  g.move(LEFT);
  assert.deepStrictEqual(row(g, 0), [3, 3, 0, 1]);
});

test("threes: the new tile only enters a line that moved", () => {
  for (let trial = 0; trial < 50; trial++) {
    const g = threes();
    clear(g);
    put(g, 0, 0, 3); put(g, 1, 0, 6); put(g, 2, 0, 12); put(g, 3, 0, 24); // blocked
    put(g, 3, 2, 1);                                                    // can move
    g.next = 2;
    g.move(LEFT);
    assert.strictEqual(at(g, 3, 2), 2, "new tile in the row that moved");
    assert.deepStrictEqual(row(g, 0), [3, 6, 12, 24]);
    assert.deepStrictEqual(row(g, 1), [0, 0, 0, 0]);
  }
});

test("threes: every direction pushes toward its own wall", () => {
  const g = threes([0.5]);
  clear(g); put(g, 1, 1, 3); g.next = 1; g.move(UP);
  assert.strictEqual(at(g, 1, 0), 3); assert.strictEqual(at(g, 1, 3), 1);
  clear(g); put(g, 1, 1, 3); g.next = 1; g.move(DOWN);
  assert.strictEqual(at(g, 1, 2), 3); assert.strictEqual(at(g, 1, 0), 1);
  clear(g); put(g, 1, 1, 3); g.next = 1; g.move(RIGHT);
  assert.strictEqual(at(g, 2, 1), 3); assert.strictEqual(at(g, 0, 1), 1);
});

test("threes: a swipe that moves nothing does nothing", () => {
  const g = threes([0.5]);
  clear(g);
  put(g, 0, 0, 3);
  g.next = 1;
  const before = plain(g.grid.serialize());
  const moves = g.moves;
  g.move(LEFT);
  g.move(UP);
  assert.deepStrictEqual(plain(g.grid.serialize()), before);
  assert.strictEqual(g.moves, moves);
});

test("threes: scoring is 3 to the power of the step", () => {
  assert.deepStrictEqual([1, 2, 3, 6, 12, 24, 48, 768].map(Threes.tileScore),
                         [0, 0, 3, 9, 27, 81, 243, 19683]);
});

test("threes: the deck deals four of each, and bonuses wait for a 48", () => {
  const g = threes();
  clear(g);
  put(g, 0, 0, 24);
  g.deck = [];
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < 12; i++) counts[g.draw()]++;
  assert.deepStrictEqual(counts, { 1: 4, 2: 4, 3: 4 });

  const lucky = threes([0.0]); // every roll is a bonus roll
  clear(lucky);
  put(lucky, 0, 0, 48);
  assert.strictEqual(lucky.draw(), 6, "an eighth of 48");
  clear(lucky);
  put(lucky, 0, 0, 384);
  const seen = new Set();
  const g2 = threes();
  clear(g2);
  put(g2, 0, 0, 384);
  g2.random = () => 0.01;
  for (let i = 0; i < 50; i++) {
    g2.random = (() => { let k = 0; const r = [0.0, i / 50]; return () => r[k++ % 2]; })();
    seen.add(g2.draw());
  }
  assert.deepStrictEqual([...seen].sort((a, b) => a - b), [6, 12, 24, 48]);
});

test("threes: opens with nine tiles and ends when nothing can move", () => {
  const g = threes();
  let n = 0;
  g.grid.eachCell((x, y, t) => { if (t) n++; });
  assert.strictEqual(n, 9);

  clear(g);
  const vals = [3, 6, 3, 6, 6, 3, 6, 3, 3, 6, 3, 6, 6, 3, 6, 3];
  for (let i = 0; i < 16; i++) put(g, i % 4, Math.floor(i / 4), vals[i]);
  assert.ok(!g.movesAvailable());
});

test("threes: a saved game comes back as it was", () => {
  const Storage = makeStorage();
  const a = new Threes.ThreesManager({ storage: new Storage() });
  a.move(LEFT); a.move(UP); a.move(RIGHT);
  const b = new Threes.ThreesManager({ storage: new Storage() });
  assert.deepStrictEqual(plain(b.grid.serialize()), plain(a.grid.serialize()));
  assert.strictEqual(b.next, a.next);
  assert.deepStrictEqual(plain(b.deck), plain(a.deck));
  assert.strictEqual(b.score, a.score);
});

/* ---- Turtle ---- */

function turtle() {
  return new Turtle.TurtleManager(5, Input, Actuator, makeStorage());
}

test("turtle: the board is 19 cells", () => {
  let n = 0;
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) if (Turtle.inHex(x, y)) n++;
  assert.strictEqual(n, 19);
  const g = turtle();
  assert.strictEqual(g.grid.availableCells().length, 17, "two start tiles");
});

test("turtle: swipes pick the nearest of six directions", () => {
  const cases = [[[0, -50], 0], [[50, -20], 1], [[50, 20], 2], [[0, 50], 3],
                 [[-50, 20], 4], [[-50, -20], 5], [[10, -60], 0], [[-8, 70], 3]];
  for (const [[dx, dy], want] of cases) {
    assert.strictEqual(Turtle.directionOf(dx, dy), want, dx + "," + dy);
  }
});

test("turtle: up and the diagonals slide and merge to the rim", () => {
  const g = turtle();
  clear(g);
  put(g, 2, 4, 2); put(g, 2, 2, 2);
  g.move(0);
  assert.strictEqual(at(g, 2, 0), 4, "up the middle column");
  assert.strictEqual(g.score, 4);

  clear(g);
  put(g, 0, 4, 8); put(g, 2, 2, 8);
  g.move(1);
  assert.strictEqual(at(g, 4, 0), 16, "up-right along the long diagonal");

  clear(g);
  put(g, 0, 2, 2); put(g, 2, 2, 2); put(g, 4, 2, 2);
  g.move(2);
  assert.strictEqual(at(g, 4, 2), 4, "down-right: the leading pair merges");
  assert.strictEqual(at(g, 3, 2), 2);
});

test("turtle: tiles never land outside the hexagon", () => {
  const g = turtle();
  for (let i = 0; i < 2000 && !g.over; i++) {
    g.move(i % 6);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      if (!Turtle.inHex(x, y)) assert.strictEqual(g.grid.cells[x][y], null);
    }
  }
});

test("turtle: a full board with no equal neighbours is over", () => {
  const g = turtle();
  clear(g);
  // Three values on the three-colouring of the hex grid: no two neighbours match.
  const colours = [2, 4, 8];
  g.grid.eachCell((x, y) => {
    const q = x - 2, r = y - 2;
    put(g, x, y, colours[((q - r) % 3 + 3) % 3]);
  });
  assert.ok(!g.movesAvailable());
});

test("turtle: a new game always brings a different turtle", () => {
  const g = turtle();
  const seen = new Set([g.skin]);
  for (let i = 0; i < 40; i++) {
    const before = g.skin;
    g.restart();
    assert.notStrictEqual(g.skin, before);
    seen.add(g.skin);
  }
  assert.strictEqual(seen.size, 4);
});

test("turtle: a locked direction does not move; the others still do", () => {
  const g = turtle();
  clear(g);
  put(g, 2, 4, 2);
  g.toggleLock(0);
  assert.ok(g.isLocked(0));
  g.move(0);
  assert.strictEqual(at(g, 2, 4), 2, "up is locked: the tile stays");
  assert.strictEqual(g.lastMoved, false, "so a held up stops at once");
  assert.strictEqual(g.moves, 0);
  g.move(5);
  // Checked where the tile went: a new tile can land where it was.
  assert.strictEqual(at(g, 0, 4), 2, "up-left is not locked: the tile moves");
  g.toggleLock(0);
  assert.ok(!g.isLocked(0), "a second pick unlocks it");
});

// A storage with the per-turtle turn, as TurtleStorage keeps it.
function turnStorage() {
  const Base = makeStorage();
  const turns = {};
  return function Storage() {
    Base.call(this);
    this.getTurn = (skin) => turns[skin] || 0;
    this.setTurn = (skin, t) => { turns[skin] = t; };
    this.turns = turns;
  };
}

test("turtle: turned, a move goes the way it points on screen", () => {
  const g = turtle();
  clear(g);
  put(g, 2, 2, 2);
  g.turnBy(); // a sixth clockwise: the turtle's up-left now points up
  assert.strictEqual(g.turn, 1);
  assert.strictEqual(g.fromScreen(0), 5);
  assert.strictEqual(g.toScreen(5), 0);
  g.move(0); // up on screen
  assert.strictEqual(at(g, 0, 2), 2, "the tile went to the turtle's up-left rim");
});

test("turtle: a lock stays on its side of the turtle when it turns", () => {
  const g = turtle();
  clear(g);
  put(g, 2, 2, 2);
  g.toggleLock(0); // the turtle's up
  g.turnBy();
  g.move(1); // up-right on screen is the turtle's up: locked
  assert.strictEqual(g.lastMoved, false);
  g.move(0); // up on screen is the turtle's up-left: free
  assert.strictEqual(g.lastMoved, true);
});

test("turtle: each turtle keeps its own turn", () => {
  const Storage = turnStorage();
  const g = new Turtle.TurtleManager(5, Input, Actuator, Storage);
  const first = g.skin;
  g.turnBy();
  g.turnBy();
  g.restart(); // a different turtle
  assert.notStrictEqual(g.skin, first);
  assert.strictEqual(g.turn, 0, "the new turtle has its own turn");
  g.turnBy();
  let guard = 0;
  while (g.skin !== first && guard++ < 50) g.restart();
  assert.strictEqual(g.turn, 2, "the first turtle came back turned as it was left");
});

test("turtle: movements fire on firsts and highs, one at a time", () => {
  const style = { setProperty() {} };
  const pick = (skin, before, top, still) =>
    Turtle.TurtleActuator.prototype.pickCue.call(
      { skin, lastDirection: 0, board: { style } }, before, top, still || 0);
  assert.strictEqual(pick("sage", 1024, 2048), "salute", "the 2048 salute comes first");
  assert.strictEqual(pick("sage", 64, 128), "nod");
  assert.strictEqual(pick("sage", 128, 128), null, "no new high, no nod");
  assert.strictEqual(pick("reef", 256, 512), "flick");
  assert.strictEqual(pick("reef", 2048, 4096), null);
  assert.strictEqual(pick("garden", 128, 256), "shuffle");
  assert.strictEqual(pick("pocket", 64, 128), "wag");
  assert.strictEqual(pick("pocket", 512, 1024), "squint");
  assert.strictEqual(pick("garden", 512, 512, 9000), "glance", "after 8 s still");
  assert.strictEqual(pick("garden", 512, 512, 3000), null);
});

test("turtle: locks are saved with the game and cleared by a new game", () => {
  const Storage = makeStorage();
  const g = new Turtle.TurtleManager(5, Input, Actuator, Storage);
  g.toggleLock(3);
  g.toggleLock(1);
  const again = new Turtle.TurtleManager(5, Input, Actuator, Storage);
  assert.deepStrictEqual(plain(again.locks), [1, 3], "reloaded with the game");
  again.restart();
  assert.deepStrictEqual(plain(again.locks), [], "a new game starts unlocked");
  again.toggleLock(2);
  again.clearLocks();
  assert.deepStrictEqual(plain(again.locks), []);
});

/* ---- 🐢48x ---- */

function x48(Storage) {
  const g = new X.XManager(5, Input, Actuator, Storage || makeStorage());
  clear(g);
  return g;
}
function count(g) {
  let n = 0;
  g.grid.eachCell((x, y, t) => { if (t) n++; });
  return n;
}
// A full board with no equal neighbours (the three-colouring above).
function fullBoard(g, colours) {
  g.grid.eachCell((x, y) => put(g, x, y, (colours || [2, 4, 8])[((x - y) % 3 + 3) % 3]));
}

test("x: a Double comes with each new top tile from 2048", () => {
  const g = x48();
  put(g, 2, 1, 512);
  put(g, 2, 2, 512);
  g.move(0); // up: a 1024
  assert.strictEqual(g.doubles, 0, "1024 earns nothing");
  clear(g);
  put(g, 2, 1, 1024);
  put(g, 2, 2, 1024);
  g.move(0);
  assert.strictEqual(g.doubles, 1, "the first 2048");
  clear(g);
  put(g, 2, 1, 1024);
  put(g, 2, 2, 1024);
  g.move(0);
  assert.strictEqual(g.doubles, 1, "a second 2048 earns nothing");
  clear(g);
  put(g, 2, 1, 2048);
  put(g, 2, 2, 2048);
  g.move(0);
  assert.strictEqual(g.doubles, 2, "the first 4096");
});

test("x: a Double doubles up to three tiles of 2 to 64, and is not a move", () => {
  const g = x48();
  g.doubles = 1;
  put(g, 0, 2, 2);
  put(g, 1, 2, 64);
  put(g, 2, 2, 128);
  put(g, 3, 2, 8);
  put(g, 4, 2, 4);
  assert.ok(!g.useDouble([{ x: 2, y: 2 }]), "128 is too big");
  assert.strictEqual(g.doubles, 1, "a refused pick uses nothing");
  assert.ok(g.useDouble([{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }]));
  assert.deepStrictEqual([at(g, 0, 2), at(g, 1, 2), at(g, 2, 2), at(g, 3, 2), at(g, 4, 2)],
                         [4, 128, 128, 8, 4], "three picks at most; the 128 is skipped");
  assert.strictEqual(g.doubles, 0);
  assert.strictEqual(g.score, 0, "scores nothing");
  assert.strictEqual(g.moves, 0, "not a move");
  assert.strictEqual(count(g), 5, "no new tile");
  assert.ok(!g.useDouble([{ x: 0, y: 2 }]), "none left");
});

test("x: with no move left the game waits while a Double could make a pair", () => {
  const g = x48();
  fullBoard(g);
  g.checkOver();
  assert.ok(g.over, "no Doubles: over");

  const h = x48();
  h.doubles = 1;
  fullBoard(h);
  h.checkOver();
  assert.ok(!h.over && h.stuck, "a 2 beside a 4 can be doubled");
  h.useDouble([{ x: 2, y: 2 }]); // (x - y) % 3 = 0: a 2
  assert.ok(!h.over && !h.stuck && h.movesAvailable());

  const k = x48();
  k.doubles = 1;
  fullBoard(k, [128, 256, 512]);
  k.checkOver();
  assert.ok(k.over, "nothing small enough to double: over");
});

test("x: at 600,000 the turtle grows, keeping every tile in place", () => {
  const g = x48();
  g.score = 599998;
  put(g, 2, 1, 2);
  put(g, 2, 2, 2);
  put(g, 0, 2, 1024);
  g.move(0); // up: 2 + 2 = 4, crossing 600,000
  assert.strictEqual(g.grid.size, 7);
  assert.strictEqual(g.size, 7);
  let cells = 0;
  g.grid.eachCell(() => cells++);
  assert.strictEqual(cells, 37);
  assert.strictEqual(at(g, 3, 1), 4, "the 4 at (2,0) is now (3,1)");
  assert.strictEqual(at(g, 1, 3), 1024, "the 1024 slid to (0,2), now (1,3)");
  assert.strictEqual(count(g), 3, "the move's own new tile came first");
  assert.ok(g.freeMove);
});

test("x: the first move on the grown board adds no tile", () => {
  const g = x48();
  g.score = 599998;
  put(g, 2, 1, 2);
  put(g, 2, 2, 2);
  g.move(0);
  const n = count(g);
  g.move(3); // down
  assert.ok(g.lastMoved);
  assert.strictEqual(count(g), n, "no tile after the free move");
  assert.ok(!g.freeMove);
  g.move(0);
  assert.strictEqual(count(g), n + 1, "the next move adds one");
});

test("x: no 2048 win, and the game reloads grown with its Doubles", () => {
  const Storage = makeStorage();
  const g = x48(Storage);
  g.score = 599998;
  put(g, 2, 0, 1024);
  put(g, 2, 1, 1024);
  g.move(3);
  assert.ok(g.won && !g.isGameTerminated(), "a 2048 does not stop the game");
  assert.strictEqual(g.grid.size, 7, "and it grew");
  const again = new X.XManager(5, Input, Actuator, Storage);
  assert.strictEqual(again.grid.size, 7);
  assert.strictEqual(again.size, 7);
  assert.strictEqual(again.doubles, 1);
  assert.strictEqual(again.topReached, 2048);
  assert.ok(again.freeMove);
  again.restart();
  assert.strictEqual(again.grid.size, 5);
  assert.strictEqual(again.doubles, 0);
  assert.ok(!again.freeMove);
});

console.log("\n" + passed + " tests passed");
