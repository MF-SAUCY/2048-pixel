/* 🐢48x (turtle48x.html): plain 🐢48 with Doubles and a turtle that grows.
 * It replaced the egg mode on 2026-11-01: moving tiles off the board made the
 * game too easy. Rules agreed then, after tools/sim_grow.js:
 *
 *   - A Double is earned the first time each tile of 2048 or more appears
 *     (2048, 4096, 8192, …). Using one doubles up to 3 tiles of 2 to 64. It
 *     scores nothing, merges nothing on the spot and is not a move: no tile
 *     appears. It is the way out of a mistake; there is no undo.
 *   - At 600,000 points the turtle grows, once: a ring of 18 scutes around the
 *     board (37 cells), the tiles keeping their places in the middle. The first
 *     move after it adds no tile, so the bigger board can be arranged before a
 *     new tile can land beside a big one.
 *   - With no move left the game waits while a Double could make a pair; only
 *     then is it over. There is no 2048 win.
 *
 * Its own saved game and best score (turtlex-state, turtlex-best) and its own
 * leaderboard columns (turtlex_best, turtlex_top). Built on turtle.js.
 */

(function (root) {
  "use strict";

  var T = root.Turtle;
  if (!T) return;

  // Shown small at the foot of the page, so a phone can be checked against
  // the latest deploy while the mode is being tested. Bump it with every
  // change to the mode. 1–6 were the egg mode; 7 is 🐢48x's first release;
  // 8 drops the moves box and makes New Game a ↻ icon, for the title's room;
  // 9 gives Turn the turtle a right-angle icon.
  var VERSION = 9;
  var GROW_AT = 600000;
  var GROWN = 7;          // the grown board's array size (radius 3)
  var EARN_FROM = 2048;   // the first tile that earns a Double
  var PICK_MAX = 3;       // tiles one Double doubles
  var DOUBLE_MAX = 64;    // the biggest tile a Double takes

  /* ---- the game ---- */

  function XManager(size, InputManager, Actuator, StorageManager) {
    T.TurtleManager.call(this, size, InputManager, Actuator, StorageManager);
  }

  XManager.prototype = Object.create(T.TurtleManager.prototype);
  XManager.prototype.constructor = XManager;

  XManager.prototype.setup = function () {
    var s = this.storageManager.getGameState();
    var saved = s && s.hex && s.x48;
    this.doubles = saved ? s.doubles : 0;
    this.topReached = saved ? s.topReached : 0;  // the highest tile yet, for earning
    this.freeMove = saved ? !!s.freeMove : false; // the next move adds no tile
    this.stuck = false;
    this.grew = false;      // set for the actuate that shows the turtle growing
    this.earned = false;    // set for the actuate after a Double is earned
    T.TurtleManager.prototype.setup.call(this);
    this.size = this.grid.size; // a saved grown game comes back grown
  };

  // No 2048 win here: the game only ends when it is over.
  XManager.prototype.isGameTerminated = function () {
    return this.over;
  };

  XManager.prototype.serialize = function () {
    var s = T.TurtleManager.prototype.serialize.call(this);
    s.x48 = 1;
    s.doubles = this.doubles;
    s.topReached = this.topReached;
    s.freeMove = this.freeMove;
    return s;
  };

  XManager.prototype.isGrown = function () {
    return this.grid.size === GROWN;
  };

  XManager.prototype.move = function (direction) {
    this.grew = false;
    this.earned = false;
    T.TurtleManager.prototype.move.call(this, direction);
  };

  // A new top tile of 2048 or more earns a Double. Runs after the slide,
  // before the new tile, which is never bigger than 4.
  XManager.prototype.afterSlide = function () {
    var top = 0;
    this.grid.eachCell(function (x, y, tile) {
      if (tile && tile.value > top) top = tile.value;
    });
    if (top > this.topReached) {
      if (top >= EARN_FROM) {
        this.doubles += 1;
        this.earned = true;
      }
      this.topReached = top;
    }
  };

  XManager.prototype.addRandomTile = function () {
    if (this.freeMove) {
      this.freeMove = false;
      return;
    }
    T.TurtleManager.prototype.addRandomTile.call(this);
  };

  // The end-of-move check grows the turtle first, so a full board at 600,000
  // gets its new ring before anyone asks whether a move is left.
  XManager.prototype.checkOver = function () {
    if (!this.isGrown() && this.score >= GROW_AT) this.grow();
    this.stuck = false;
    if (this.movesAvailable()) return;
    if (this.doubles > 0 && this.doubleCouldHelp()) {
      this.stuck = true;
    } else {
      this.over = true;
    }
  };

  // Every tile moves one row and column in, to the same place on the bigger
  // board; where it came from moves too, so this move's slide still plays.
  XManager.prototype.grow = function () {
    var old = this.grid;
    var grid = new T.HexGrid(GROWN);
    var shift = function (p) { return p && { x: p.x + 1, y: p.y + 1 }; };
    old.eachCell(function (x, y, tile) {
      if (!tile) return;
      tile.x += 1;
      tile.y += 1;
      tile.previousPosition = shift(tile.previousPosition);
      if (tile.mergedFrom) {
        tile.mergedFrom.forEach(function (from) {
          from.x += 1;
          from.y += 1;
          from.previousPosition = shift(from.previousPosition);
        });
      }
      grid.insertTile(tile);
    });
    this.grid = grid;
    this.size = GROWN;
    this.freeMove = true;
    this.grew = true;
  };

  // On a stuck board only a doubled tile beside a tile twice its value can
  // make a pair: two doubled tiles were unequal before and stay unequal.
  XManager.prototype.doubleCouldHelp = function () {
    var self = this;
    var found = false;
    this.grid.eachCell(function (x, y, tile) {
      if (found || !tile || !self.canDouble(tile)) return;
      for (var d = 0; d < 6; d++) {
        var v = T.VECTORS[d];
        var other = self.grid.cellContent({ x: x + v.x, y: y + v.y });
        if (other && other.value === tile.value * 2) found = true;
      }
    });
    return found;
  };

  XManager.prototype.canDouble = function (tile) {
    return tile.value <= DOUBLE_MAX;
  };

  // cells: up to three board cells holding tiles of 2 to 64. Uses a Double
  // even if some cells were refused; returns false and uses nothing if none
  // qualify. The tiles stay where they are, and the game checks again.
  XManager.prototype.useDouble = function (cells) {
    var self = this;
    if (this.over || this.doubles < 1) return false;
    var tiles = [];
    (cells || []).slice(0, PICK_MAX).forEach(function (cell) {
      var tile = self.grid.cellContent(cell);
      if (tile && self.canDouble(tile) && tiles.indexOf(tile) === -1) tiles.push(tile);
    });
    if (!tiles.length) return false;
    this.prepareTiles();
    tiles.forEach(function (tile) { tile.value *= 2; });
    this.doubles -= 1;
    this.grew = false;
    this.earned = false;
    this.doubled = tiles.map(function (t) { return { x: t.x, y: t.y }; });
    this.checkOver();
    this.actuate();
    this.doubled = null;
    return true;
  };

  XManager.prototype.actuate = function () {
    T.TurtleManager.prototype.actuate.call(this);
    if (this.onX) this.onX();
  };

  function XStorage() {
    T.TurtleStorage.call(this);
    this.bestScoreKey = "turtlex-best";
    this.gameStateKey = "turtlex-state";
    this.turnKey = "turtlex-turn";
  }

  XStorage.prototype = Object.create(T.TurtleStorage.prototype);
  XStorage.prototype.constructor = XStorage;

  /* ---- the page ----
   *
   * One button, ×2, left of the pad's lock and in its look, with a badge of
   * Doubles held. Tap it to pick: it lights as the lock does while choosing
   * wedges and shows ✓ with the count picked, tiles too big to double fade,
   * and a picked tile shows its new value in an outline. Tap a tile again to
   * unpick it; ✓ doubles them (with none picked it just stops picking); a
   * move stops picking without using anything.
   */

  function buildX(game, board) {
    var lock = document.querySelector(".turtle-controls .lock-button");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle lock-button turtlex-double";
    button.innerHTML = '<span class="turtlex-label">×2</span><span class="turtlex-count">0</span>';
    lock.parentNode.insertBefore(button, lock);

    // Last on the page, under the pad.
    var version = document.createElement("p");
    version.className = "turtlex-version";
    version.textContent = "🐢48x v" + VERSION;
    board.parentNode.appendChild(version);

    // Picked tiles are drawn over the board, in the layer that turns.
    var marks = document.createElement("div");
    marks.className = "turtlex-marks";
    board.querySelector(".tile-container").parentNode.appendChild(marks);

    return { button: button, board: board, marks: marks,
             label: button.querySelector(".turtlex-label"),
             count: button.querySelector(".turtlex-count") };
  }

  function wire(game, ui) {
    var picking = false;
    var picked = [];  // cells

    function pickedIndex(cell) {
      for (var i = 0; i < picked.length; i++) {
        if (picked[i].x === cell.x && picked[i].y === cell.y) return i;
      }
      return -1;
    }

    function stopPicking() {
      picking = false;
      picked = [];
      render();
    }

    function render() {
      var held = game.doubles;
      ui.count.textContent = picking ? picked.length + "/" + PICK_MAX : held;
      ui.count.hidden = !picking && held < 1;
      ui.label.textContent = picking ? "✓" : "×2";
      ui.button.disabled = !picking && (held < 1 || game.over);
      ui.button.classList.toggle("is-locking", picking);
      // No moves left but a Double could help: the button asks, as New Game does.
      ui.button.classList.toggle("is-armed", !picking && game.stuck);
      var label = picking ? "Double the picked tiles" :
        held === 1 ? "Double: 1 left" : "Double: " + held + " left";
      ui.button.setAttribute("aria-label", label);
      ui.button.setAttribute("title", label);
      ui.board.classList.toggle("is-doubling", picking);
      ui.board.classList.toggle("is-stuck", game.stuck);
      drawMarks();
    }

    // Each picked tile: its new value, outlined, over the tile.
    function drawMarks() {
      var html = "";
      var radius = game.grid.radius;
      var w = 56 * T.cellSize(radius) / 30;
      var h = w * Math.sqrt(3) / 2;
      picked.forEach(function (cell) {
        var tile = game.grid.cellContent(cell);
        if (!tile) return;
        var c = T.cellCentre(cell.x, cell.y, radius);
        var v = tile.value * 2;
        html += '<div class="tile turtlex-pick tile-' + v + '" style="left:' +
          ((c.x - w / 2 - T.VIEW.x) / T.VIEW.w * 100).toFixed(3) + "%;top:" +
          ((c.y - h / 2 - T.VIEW.y) / T.VIEW.h * 100).toFixed(3) + '%">' +
          '<div class="tile-inner">' + v + "</div>" +
          '<svg viewBox="0 0 100 86.6" preserveAspectRatio="none" aria-hidden="true">' +
          '<polygon points="25,0 75,0 100,43.3 75,86.6 25,86.6 0,43.3"/></svg></div>';
      });
      ui.marks.innerHTML = html;
    }

    ui.button.addEventListener("click", function () {
      if (picking) {
        var cells = picked.slice();
        picking = false;
        picked = [];
        if (!cells.length || !game.useDouble(cells)) render();
        return;
      }
      if (game.doubles < 1 || game.over) return;
      picking = true;
      picked = [];
      render();
    });

    // A tap on the board (not a swipe) picks or unpicks a tile while picking.
    var down = null;
    ui.board.addEventListener("pointerdown", function (e) {
      down = e.isPrimary && picking ? { x: e.clientX, y: e.clientY } : null;
    });
    ui.board.addEventListener("pointerup", function (e) {
      if (!down || !e.isPrimary || !picking) return;
      var dx = e.clientX - down.x;
      var dy = e.clientY - down.y;
      down = null;
      if (dx * dx + dy * dy > 100) return;
      var cell = cellAt(ui.board, e.clientX, e.clientY, game);
      if (!cell) return;
      var tile = game.grid.cellContent(cell);
      if (!tile || !game.canDouble(tile)) return;
      var i = pickedIndex(cell);
      if (i !== -1) picked.splice(i, 1);
      else if (picked.length < PICK_MAX) picked.push(cell);
      render();
    });

    // Any move stops picking, using nothing.
    game.inputManager.on("move", function () {
      if (picking) stopPicking();
    });
    game.inputManager.on("restart", function () {
      if (picking) stopPicking();
    });

    game.onX = function () {
      if (game.grew) T.fitPage();
      render();
    };
    render();
  }

  // The board cell under a point on the page, or null.
  function cellAt(board, px, py, game) {
    var p = T.pageToArt(px, py, game.turn);
    var radius = game.grid.radius;
    var reach = T.cellSize(radius);
    var best = null;
    var bestD = reach * reach;
    for (var cx = 0; cx <= 2 * radius; cx++) {
      for (var cy = 0; cy <= 2 * radius; cy++) {
        if (!T.inHex(cx, cy, radius)) continue;
        var c = T.cellCentre(cx, cy, radius);
        var d = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  }

  root.TurtleX = {
    XManager: XManager,
    XStorage: XStorage,
    GROW_AT: GROW_AT,
    PICK_MAX: PICK_MAX
  };

  if (typeof document !== "undefined" && document.querySelector(".turtle48x")) {
    window.requestAnimationFrame(function () {
      var game = new XManager(T.SIZE, T.HexInputManager, T.TurtleActuator, XStorage);
      root.Turtle.game = game;
      T.buildPad(game);
      wire(game, buildX(game, document.querySelector(".game-container")));
      T.fitPage();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
