// Rule tests for the Fib, Threes and Turtle modes, and Turtle's egg mode.
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
                    "turtle/turtle.js", "turtle/nest.js"]) {
  vm.runInContext(fs.readFileSync(path.join(app, file), "utf8"), context, { filename: file });
}
const Fib = vm.runInContext("Fib", context);
const Threes = vm.runInContext("Threes", context);
const Turtle = vm.runInContext("Turtle", context);
const Nest = vm.runInContext("Nest", context);
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

/* ---- Turtle's egg mode ---- */

function nest(Storage) {
  const g = new Nest.NestManager(5, Input, Actuator, Storage || makeStorage());
  clear(g);
  return g;
}
// A full board with no equal neighbours (the three-colouring above), less any
// cells given as "x,y".
function fullBoard(g, except) {
  const colours = [2, 4, 8];
  g.grid.eachCell((x, y) => {
    if ((except || []).includes(x + "," + y)) return;
    put(g, x, y, colours[((x - 2 - (y - 2)) % 3 + 3) % 3]);
  });
}

test("eggs: a 2048 on the tail lays as an undo or a slot", () => {
  const g = nest();
  put(g, 2, 4, 2048);
  assert.ok(g.layable());
  assert.ok(g.lay("undo"));
  assert.strictEqual(at(g, 2, 4), 0, "the 2048 leaves the board");
  assert.strictEqual(g.undos, 1);
  assert.strictEqual(g.laid, 1);
  put(g, 2, 4, 2048);
  g.lay("slot");
  assert.deepStrictEqual(plain(g.slots), [0], "a new empty slot");
  assert.strictEqual(g.undos, 1);
});

test("eggs: only a 2048 on the tail can be laid", () => {
  const g = nest();
  put(g, 2, 3, 2048);
  put(g, 2, 4, 4096);
  assert.ok(!g.layable());
  assert.ok(!g.lay("undo"));
  assert.strictEqual(g.undos, 0);
});

test("eggs: past six slots, an egg is an undo", () => {
  const g = nest();
  g.slots = [0, 0, 0, 0, 0, 0];
  put(g, 2, 4, 2048);
  g.lay("slot");
  assert.strictEqual(g.slots.length, Nest.SLOT_CAP);
  assert.strictEqual(g.undos, 1);
});

test("eggs: a tile of 2048 or more can be carried into an empty slot", () => {
  const g = nest();
  g.slots = [0];
  put(g, 1, 2, 1024);
  assert.ok(!g.carry({ x: 1, y: 2 }), "a 1024 is too small");
  put(g, 3, 1, 4096);
  assert.ok(g.carry({ x: 3, y: 1 }));
  assert.deepStrictEqual(plain(g.slots), [4096]);
  assert.strictEqual(at(g, 3, 1), 0);
  put(g, 3, 1, 8192);
  assert.ok(!g.carry({ x: 3, y: 1 }), "no free slot");
});

test("eggs: a match made on the board jumps up and doubles the carried tile", () => {
  const g = nest();
  g.slots = [2048];
  put(g, 2, 0, 1024);
  put(g, 2, 1, 1024);
  g.move(3); // down: the 1024s make a 2048 on the tail
  assert.deepStrictEqual(plain(g.slots), [4096]);
  let big = 0;
  g.grid.eachCell((x, y, t) => { if (t && t.value >= 1024) big++; });
  assert.strictEqual(big, 0, "the new 2048 left the board");
  assert.strictEqual(g.score, 2048 + 4096, "both merges score");
});

test("eggs: carried tiles that become equal merge and free a slot", () => {
  const g = nest();
  g.slots = [4096, 2048];
  put(g, 2, 0, 1024);
  put(g, 2, 1, 1024);
  g.move(3);
  assert.deepStrictEqual(plain(g.slots), [8192, 0]);
  assert.strictEqual(g.score, 2048 + 4096 + 8192);
});

test("eggs: undo takes back the last move and costs an undo", () => {
  const g = nest();
  g.undos = 2;
  put(g, 2, 0, 2);
  put(g, 2, 1, 2);
  g.move(3);
  assert.strictEqual(g.score, 4);
  assert.ok(g.undo());
  assert.strictEqual(g.score, 0);
  assert.strictEqual(at(g, 2, 0), 2);
  assert.strictEqual(at(g, 2, 1), 2);
  let n = 0;
  g.grid.eachCell((x, y, t) => { if (t) n++; });
  assert.strictEqual(n, 2, "the new tile went too");
  assert.strictEqual(g.undos, 1);
  assert.ok(!g.undo(), "one move back only");
});

test("eggs: laying or carrying cannot be undone", () => {
  const g = nest();
  g.undos = 1;
  put(g, 2, 2, 2048);
  g.move(3);
  assert.strictEqual(at(g, 2, 4), 2048);
  g.lay("slot");
  assert.ok(!g.canUndo());
  assert.ok(!g.undo());
  assert.strictEqual(g.undos, 1);
});

test("eggs: with no move left the game waits while something can help", () => {
  const g = nest();
  fullBoard(g);
  assert.ok(!g.movesAvailable());
  g.checkOver();
  assert.ok(g.over, "nothing helps: over");

  const h = nest();
  fullBoard(h, ["2,4"]);
  put(h, 2, 4, 2048);
  h.checkOver();
  assert.ok(!h.over && h.stuck, "the 2048 on the tail can be laid");

  const k = nest();
  k.slots = [0];
  fullBoard(k, ["0,2"]);
  put(k, 0, 2, 4096);
  k.checkOver();
  assert.ok(!k.over && k.stuck, "the 4096 can be carried");
});

test("eggs: no 2048 win, and the game reloads with its slots and undos", () => {
  const Storage = makeStorage();
  const g = nest(Storage);
  g.slots = [8192, 0];
  g.undos = 3;
  put(g, 2, 0, 1024);
  put(g, 2, 1, 1024);
  g.move(3);
  assert.ok(g.won && !g.isGameTerminated(), "a 2048 does not stop the game");
  const again = new Nest.NestManager(5, Input, Actuator, Storage);
  assert.deepStrictEqual(plain(again.slots), [8192, 0]);
  assert.strictEqual(again.undos, 3);
  assert.ok(again.canUndo(), "the last move can still be taken back");
  again.restart();
  assert.deepStrictEqual(plain(again.slots), []);
  assert.strictEqual(again.undos, 0);
});

console.log("\n" + passed + " tests passed");
