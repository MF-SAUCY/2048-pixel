/* 🐢48 (was Turtle) — 2048 on a hexagonal board, drawn as a turtle's
 * shell.
 *
 *   - 19 cells in a hexagon, three to a side, flat side up. Tiles slide and
 *     merge exactly as in 2048, in six directions: straight up and down, and
 *     the four diagonals.
 *   - A swipe picks the nearest of the six. A sideways swipe goes up or down
 *     its diagonal by its angle; there is no plain left or right. Keys: W and
 *     S (or the up and down arrows) for up and down, Q E A D for the
 *     diagonals.
 *   - A six-wedge pad under the board does the same, one wedge per board
 *     side, and lights the wedge each swipe or key picked. Holding a wedge,
 *     or holding a swipe once it has gone far enough to move, repeats the
 *     move until a move changes nothing, as classic's Auto-fill does for down.
 *   - A lock beside the pad locks chosen directions against every input
 *     until it clears them; locks are saved with the game.
 *   - New tiles are 2s (90%) or 4s (10%) in a random empty cell. 2048 wins,
 *     with Keep going after it.
 *   - Each new game draws one of four turtles at random, never the one just
 *     played: Sage, Reef Glider, Garden Keeper or Pocket Pal.
 *
 * Cells are kept in a 5x5 array, indexed by axial coordinates plus 2
 * (x = q + 2, y = r + 2), with the six corners outside the hexagon always
 * empty and out of bounds. That shape lets upstream's Tile, HTMLActuator and
 * the merge-effect and leaderboard hooks work unchanged. Movement is
 * upstream's, walked in six directions instead of four.
 */

(function (root) {
  "use strict";

  var SIZE = 5;     // the 5x5 array; 19 of its cells are on the board
  var RADIUS = 2;   // 🐢48x's grown turtle is radius 3: a 7x7 array, 37 cells

  // Axial steps for the six directions, clockwise from up. On screen, with the
  // flat side up, q runs right and r runs down.
  var VECTORS = [
    { x: 0, y: -1 },  // 0 up
    { x: 1, y: -1 },  // 1 up-right
    { x: 1, y: 0 },   // 2 down-right
    { x: 0, y: 1 },   // 3 down
    { x: -1, y: 1 },  // 4 down-left
    { x: -1, y: 0 }   // 5 up-left
  ];

  // Screen angle of each direction, degrees clockwise from right (y down).
  var ANGLES = [-90, -30, 30, 90, 150, -150];

  // Drawing geometry, in the art's own units: viewBox 0 8 300 312, cells
  // centred on (150, 170), 30 from a cell's centre to its corner. A board of
  // another radius keeps the same 240 width inside the same shell, so its
  // cells are smaller.
  var VIEW = { x: 0, y: 8, w: 300, h: 312 };

  function cellSize(radius) {
    return 240 / (3 * (radius || RADIUS) + 2);
  }

  function inHex(x, y, radius) {
    radius = radius || RADIUS;
    var q = x - radius;
    var r = y - radius;
    return x >= 0 && x <= 2 * radius && y >= 0 && y <= 2 * radius && Math.abs(q + r) <= radius;
  }

  function cellCentre(x, y, radius) {
    radius = radius || RADIUS;
    var S = cellSize(radius);
    var q = x - radius;
    var r = y - radius;
    return { x: 150 + 1.5 * S * q, y: 170 + Math.sqrt(3) * S * (r + q / 2) };
  }

  // The nearest of the six directions to a swipe of (dx, dy).
  function directionOf(dx, dy) {
    var angle = Math.atan2(dy, dx) * 180 / Math.PI;
    var best = 0;
    var bestGap = 360;
    for (var d = 0; d < 6; d++) {
      var gap = Math.abs(((angle - ANGLES[d]) % 360 + 540) % 360 - 180);
      if (gap < bestGap) {
        bestGap = gap;
        best = d;
      }
    }
    return best;
  }

  /* ---- the grid ---- */

  // size 5 (radius 2, 19 cells) unless given: 🐢48x's grown board is 7.
  function HexGrid(size, previousState) {
    root.Grid.call(this, size || SIZE, previousState);
    this.radius = (this.size - 1) / 2;
  }

  if (root.Grid) {
    HexGrid.prototype = Object.create(root.Grid.prototype);
    HexGrid.prototype.constructor = HexGrid;
  }

  HexGrid.prototype.withinBounds = function (position) {
    return inHex(position.x, position.y, this.radius);
  };

  // Only the board cells; availableCells and so randomAvailableCell follow.
  HexGrid.prototype.eachCell = function (callback) {
    for (var x = 0; x < this.size; x++) {
      for (var y = 0; y < this.size; y++) {
        if (inHex(x, y, this.radius)) callback(x, y, this.cells[x][y]);
      }
    }
  };

  /* ---- the game ---- */

  var SKINS = ["sage", "reef", "garden", "pocket"];

  function TurtleManager(size, InputManager, Actuator, StorageManager) {
    var self = this;
    this.lastMoved = false;
    root.GameManager.call(this, SIZE, InputManager, Actuator, StorageManager);
    // A held direction repeats only while its moves still change the board.
    this.inputManager.moved = function () { return self.lastMoved; };
  }

  if (root.GameManager) {
    TurtleManager.prototype = Object.create(root.GameManager.prototype);
    TurtleManager.prototype.constructor = TurtleManager;
  }

  TurtleManager.prototype.random = Math.random;

  // A different turtle from the last one, so a new game always looks new.
  TurtleManager.prototype.pickSkin = function (previous) {
    var choices = SKINS.filter(function (s) { return s !== previous; });
    return choices[Math.floor(this.random() * choices.length)];
  };

  TurtleManager.prototype.setup = function () {
    var previousState = this.storageManager.getGameState();
    var lastSkin = this.skin || (this.storageManager.getLastSkin
      ? this.storageManager.getLastSkin() : null);

    if (previousState && previousState.hex) {
      this.grid = new HexGrid(previousState.grid.size || SIZE, previousState.grid.cells);
      this.score = previousState.score;
      this.over = previousState.over;
      this.won = previousState.won;
      this.keepPlaying = previousState.keepPlaying;
      this.moves = previousState.moves || 0;
      this.skin = previousState.skin || this.pickSkin(lastSkin);
      this.locks = previousState.locks || [];
    } else {
      this.grid = new HexGrid(SIZE);
      this.score = 0;
      this.over = false;
      this.won = false;
      this.keepPlaying = false;
      this.moves = 0;
      this.skin = this.pickSkin(lastSkin);
      this.locks = [];
      this.addStartTiles();
    }
    if (this.storageManager.setLastSkin) this.storageManager.setLastSkin(this.skin);
    // How far the turtle is turned, in sixths of a turn clockwise: a
    // preference kept for each turtle, not part of the game.
    this.turn = this.storageManager.getTurn ? this.storageManager.getTurn(this.skin) : 0;
    this.actuate();
  };

  TurtleManager.prototype.serialize = function () {
    return {
      hex: 1,
      grid: this.grid.serialize(),
      score: this.score,
      over: this.over,
      won: this.won,
      keepPlaying: this.keepPlaying,
      moves: this.moves,
      skin: this.skin,
      locks: this.locks
    };
  };

  /* Locked directions: the pad's lock picks them, and until they are cleared
   * no wedge, swipe or key can move that way. They are saved with the game,
   * so a new game starts unlocked. onLocks lets the pad redraw. */
  TurtleManager.prototype.isLocked = function (direction) {
    return this.locks.indexOf(direction) !== -1;
  };

  TurtleManager.prototype.toggleLock = function (direction) {
    if (this.isLocked(direction)) {
      this.locks = this.locks.filter(function (d) { return d !== direction; });
    } else {
      this.locks = this.locks.concat([direction]).sort();
    }
    this.saveLocks();
  };

  TurtleManager.prototype.clearLocks = function () {
    this.locks = [];
    this.saveLocks();
  };

  // Saved without a full actuate, which would redraw the tiles and replay the
  // last move's merges.
  TurtleManager.prototype.saveLocks = function () {
    if (!this.over) this.storageManager.setGameState(this.serialize());
    if (this.onLocks) this.onLocks(this.locks);
  };

  TurtleManager.prototype.actuate = function () {
    root.GameManager.prototype.actuate.call(this);
    if (this.actuator.setSkin) this.actuator.setSkin(this.skin, this.over, this.grid.radius);
    if (this.actuator.setTurn) this.actuator.setTurn(this.turn);
    if (this.onLocks) this.onLocks(this.locks);
  };

  /* Turning (2026-11-01): Turn the turtle, in the menu, turns it a sixth
   * clockwise, remembered for each of the four turtles. Moves come in as
   * screen directions (a swipe, key or wedge goes where it points on screen)
   * and become the turtle's own here; locks stay on the turtle's sides, so
   * the pad shows them turned too. */
  TurtleManager.prototype.turnBy = function () {
    this.turn = (this.turn + 1) % 6;
    if (this.storageManager.setTurn) this.storageManager.setTurn(this.skin, this.turn);
    if (this.actuator.setTurn) this.actuator.setTurn(this.turn, true);
    if (this.onLocks) this.onLocks(this.locks);
  };

  // The turtle's direction for a screen direction, and back.
  TurtleManager.prototype.fromScreen = function (direction) {
    return (direction - (this.turn || 0) + 6) % 6;
  };

  TurtleManager.prototype.toScreen = function (direction) {
    return (direction + (this.turn || 0)) % 6;
  };

  TurtleManager.prototype.getVector = function (direction) {
    return VECTORS[direction];
  };

  // Every board cell, farthest along the direction first, so each tile moves
  // after the ones in front of it.
  TurtleManager.prototype.traversalOrder = function (direction) {
    var a = ANGLES[direction] * Math.PI / 180;
    var ux = Math.cos(a);
    var uy = Math.sin(a);
    var cells = [];
    var radius = this.grid.radius;
    this.grid.eachCell(function (x, y) {
      var c = cellCentre(x, y, radius);
      cells.push({ x: x, y: y, along: c.x * ux + c.y * uy });
    });
    cells.sort(function (p, q) { return q.along - p.along; });
    return cells;
  };

  // Upstream's move, walked over the hexagon. direction is a screen direction.
  TurtleManager.prototype.move = function (direction) {
    var self = this;
    this.lastMoved = false;
    direction = this.fromScreen(direction);
    if (this.isGameTerminated() || this.isLocked(direction)) return;
    // For the turtle's glance (TurtleActuator).
    this.actuator.lastDirection = direction;
    var vector = this.getVector(direction);
    if (!vector) return;
    var moved = false;

    this.prepareTiles();

    this.traversalOrder(direction).forEach(function (cell) {
      cell = { x: cell.x, y: cell.y };
      var tile = self.grid.cellContent(cell);
      if (!tile) return;

      var positions = self.findFarthestPosition(cell, vector);
      var next = self.grid.cellContent(positions.next);

      if (next && next.value === tile.value && !next.mergedFrom) {
        var merged = new Tile(positions.next, tile.value * 2);
        merged.mergedFrom = [tile, next];
        self.grid.insertTile(merged);
        self.grid.removeTile(tile);
        tile.updatePosition(positions.next);
        self.score += merged.value;
        if (merged.value === 2048) self.won = true;
      } else {
        self.moveTile(tile, positions.farthest);
      }

      if (!self.positionsEqual(cell, tile)) moved = true;
    });

    this.lastMoved = moved;
    if (moved) {
      this.moves += 1;
      this.afterSlide();
      this.addRandomTile();
      this.checkOver();
      this.actuate();
    }
  };

  // Hooks for 🐢48x (turtle48x.js): after the tiles slide, before the new
  // tile; and the end-of-move check for game over.
  TurtleManager.prototype.afterSlide = function () {};

  TurtleManager.prototype.checkOver = function () {
    if (!this.movesAvailable()) this.over = true;
  };

  TurtleManager.prototype.tileMatchesAvailable = function () {
    var self = this;
    var found = false;
    this.grid.eachCell(function (x, y, tile) {
      if (!tile || found) return;
      for (var d = 0; d < 6; d++) {
        var v = VECTORS[d];
        var other = self.grid.cellContent({ x: x + v.x, y: y + v.y });
        if (other && other.value === tile.value) {
          found = true;
          return;
        }
      }
    });
    return found;
  };

  function TurtleStorage() {
    root.LocalStorageManager.call(this);
    this.bestScoreKey = "turtle-best";
    this.gameStateKey = "turtle-state";
    this.turnKey = "turtle-turn";
  }

  if (root.LocalStorageManager) {
    TurtleStorage.prototype = Object.create(root.LocalStorageManager.prototype);
    TurtleStorage.prototype.constructor = TurtleStorage;
  }

  TurtleStorage.prototype.getLastSkin = function () {
    return this.storage.getItem("turtle-skin") || null;
  };

  TurtleStorage.prototype.setLastSkin = function (skin) {
    this.storage.setItem("turtle-skin", skin);
  };

  // Each turtle's turn, as turtle-turn-sage and so on.
  TurtleStorage.prototype.getTurn = function (skin) {
    return (parseInt(this.storage.getItem(this.turnKey + "-" + skin), 10) || 0) % 6;
  };

  TurtleStorage.prototype.setTurn = function (skin, turn) {
    this.storage.setItem(this.turnKey + "-" + skin, String(turn));
  };

  /* ---- input: six directions ---- */

  function HexInputManager() {
    root.KeyboardInputManager.call(this);
  }

  if (root.KeyboardInputManager) {
    HexInputManager.prototype = Object.create(root.KeyboardInputManager.prototype);
    HexInputManager.prototype.constructor = HexInputManager;
  }

  // The pad and the buttons beside it handle their own presses, so a gesture
  // that starts on them is not a swipe.
  HexInputManager.prototype.isControl = function (target) {
    return root.KeyboardInputManager.prototype.isControl.call(this, target) ||
           !!(target && target.closest && target.closest(".turtle-controls"));
  };

  // Set by TurtleManager: whether the last move changed the board.
  HexInputManager.prototype.moved = function () { return false; };

  // New Game is a ↻ icon on the turtle pages (2026-11-01, to give the title
  // room): it asks for its second tap with the outline alone, keeping the
  // icon, where classic's button says "Tap again".
  HexInputManager.prototype.confirmRestart = function (event) {
    event.preventDefault();
    if (this.restartArmed || !this.hasProgress()) {
      this.disarmRestart();
      this.emit("restart");
      return;
    }
    var button = document.querySelector(".restart-button");
    this.restartArmed = true;
    if (button) {
      button.classList.add("is-armed");
      button.setAttribute("aria-label", "Tap again for a new game");
    }
    this.restartTimer = setTimeout(this.disarmRestart.bind(this), this.restartArmMs);
  };

  HexInputManager.prototype.disarmRestart = function () {
    if (!this.restartArmed) return;
    this.restartArmed = false;
    clearTimeout(this.restartTimer);
    var button = document.querySelector(".restart-button");
    if (button) {
      button.classList.remove("is-armed");
      button.setAttribute("aria-label", "New Game");
    }
  };

  // Move now and, while held, again after classic's pause and at its pace,
  // until a move changes nothing. "aim" tells the pad which wedge to light.
  HexInputManager.prototype.hold = function (direction) {
    var self = this;
    this.stopRepeat();
    this.disarmRestart();
    this.emit("aim", direction);
    this.emit("move", direction);
    this.repeatTimer = setTimeout(function tick() {
      if (!self.moved()) return;
      self.emit("move", direction);
      self.repeatTimer = setTimeout(tick, self.repeatEveryMs);
    }, this.repeatDelayMs);
  };

  HexInputManager.prototype.release = function () {
    this.stopRepeat();
    this.emit("aim", null);
  };

  // One move with no hold: a key, or a swipe lifted before it went far
  // enough to commit.
  HexInputManager.prototype.tap = function (direction) {
    this.release();
    this.disarmRestart();
    this.emit("aim", direction);
    this.emit("move", direction);
    this.emit("aim", null);
  };

  // A swipe commits once it is this far out, a little past the tap
  // threshold, so its angle has some length to be read from.
  HexInputManager.prototype.commitDistance = 30;

  // The classic listener with the swipe read as an angle, and every
  // direction held the way classic holds down. Buttons and the two-tap New
  // Game are inherited.
  HexInputManager.prototype.listen = function () {
    var self = this;
    var keys = {
      38: 0, 87: 0,   // up arrow, W
      69: 1,          // E
      68: 2,          // D
      40: 3, 83: 3,   // down arrow, S
      65: 4,          // A
      81: 5           // Q
    };

    document.addEventListener("keydown", function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      var mapped = keys[event.which];
      if (mapped !== undefined) {
        event.preventDefault();
        self.tap(mapped);
      }
      if (event.which === 82) self.confirmRestart.call(self, event);
    });

    this.bindButtonPress(".retry-button", this.restart);
    this.bindButtonPress(".restart-button", this.confirmRestart);
    this.bindButtonPress(".keep-playing-button", this.keepPlaying);

    var startX = null;
    var startY = null;
    var tracking = false;
    var holding = false; // a swipe that has committed and may be repeating

    // A press on the pad has already started its own hold; leave it be.
    function begin(x, y, target) {
      tracking = !self.isControl(target);
      if (!tracking) return;
      self.release();
      startX = x;
      startY = y;
    }

    // Far enough out, the swipe moves without waiting for the lift, and
    // holding on repeats it.
    function drag(x, y) {
      if (!tracking) return;
      var dx = x - startX;
      var dy = y - startY;
      if (Math.sqrt(dx * dx + dy * dy) > self.commitDistance) {
        tracking = false; // this gesture is spoken for; the lift adds nothing
        holding = true;
        self.hold(directionOf(dx, dy));
      }
    }

    function finish(x, y) {
      if (holding) {
        holding = false;
        self.release();
      }
      if (!tracking) return;
      tracking = false;
      var dx = x - startX;
      var dy = y - startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > self.swipeThreshold) {
        self.tap(directionOf(dx, dy));
      }
    }

    function cancel() {
      tracking = false;
      if (holding) {
        holding = false;
        self.release();
      }
    }

    if (window.PointerEvent) {
      document.addEventListener("pointerdown", function (e) {
        if (e.isPrimary) begin(e.clientX, e.clientY, e.target);
      });
      document.addEventListener("pointermove", function (e) {
        if (e.isPrimary) drag(e.clientX, e.clientY);
      });
      document.addEventListener("pointerup", function (e) {
        if (e.isPrimary) finish(e.clientX, e.clientY);
      });
      document.addEventListener("pointercancel", cancel);
    } else {
      document.addEventListener("touchstart", function (e) {
        if (e.touches.length > 1) {
          cancel();
          return;
        }
        begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }, { passive: true });
      document.addEventListener("touchend", function (e) {
        if (e.touches.length > 0) return;
        finish(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      });
      document.addEventListener("touchcancel", cancel);
    }

    document.addEventListener("touchmove", function (e) {
      if (tracking) e.preventDefault();
      if (!window.PointerEvent && e.touches.length === 1) {
        drag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
  };

  /* ---- the pad ----
   *
   * A flat-topped hexagon cut into six wedges from its centre, one per side,
   * so each wedge points at the board side its move slides toward. Wedge i
   * runs from corner i to corner i + 1 (corner 0 on the right, clockwise), so
   * its middle is at 60i + 30 degrees: direction (i + 2) % 6. Pressing a
   * wedge moves and holding repeats (hold above). Its pointer handling is its
   * own; the swipe listener skips gestures that start on it (isControl).
   *
   * The lock button beside it locks directions. Tap it and it lights: wedges
   * pressed now are picked as locked (press again to unpick), not played. Tap
   * it again to play on; locked wedges dim and show a lock, and their
   * direction will not move by wedge, swipe or key. With locks set, a tap asks
   * "again?" (outlined, as New Game does) and a second within three seconds
   * clears them all.
   *
   * When the turtle is turned (Turn the turtle, in the menu) the wedges keep
   * their screen directions; a lock stays on its side of the turtle, so it
   * shows on the wedge that side now faces.
   */

  var PAD_R = 50;
  var PAD_NAMES = ["Up", "Up right", "Down right", "Down", "Down left", "Up left"];

  // Shackle and body, centred on the origin, about 14 units across.
  var LOCK_GLYPH = '<path d="M-4.5 -1V-4a4.5 4.5 0 0 1 9 0v3" fill="none" ' +
    'stroke-width="2.2" stroke-linecap="round"/>' +
    '<rect x="-6.5" y="-1" width="13" height="9.5" rx="2" stroke="none"/>';
  var LOCK_OPEN_GLYPH = '<path d="M-4.5 -1V-4a4.5 4.5 0 0 1 8.6 -1.8" fill="none" ' +
    'stroke-width="2.2" stroke-linecap="round"/>' +
    '<rect x="-6.5" y="-1" width="13" height="9.5" rx="2" stroke="none"/>';

  function lockSvg(open) {
    return '<svg viewBox="-10 -10 20 20" fill="currentColor" stroke="currentColor" ' +
           'aria-hidden="true">' + (open ? LOCK_OPEN_GLYPH : LOCK_GLYPH) + "</svg>";
  }

  function padSvg() {
    var corners = [];
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 3 * i;
      corners.push([PAD_R * Math.cos(a), PAD_R * Math.sin(a)]);
    }
    var h = PAD_R * Math.sqrt(3) / 2;
    var out = '<svg viewBox="' + (-PAD_R - 2) + " " + (-h - 2).toFixed(2) + " " +
              (2 * PAD_R + 4) + " " + (2 * h + 4).toFixed(2) + '" focusable="false">';
    for (var w = 0; w < 6; w++) {
      var dir = (w + 2) % 6;
      var p = corners[w];
      var q = corners[(w + 1) % 6];
      var mid = ANGLES[dir];
      var m = mid * Math.PI / 180;
      var ax = (PAD_R * 0.56 * Math.cos(m)).toFixed(2);
      var ay = (PAD_R * 0.56 * Math.sin(m)).toFixed(2);
      out += '<g class="pad-wedge" data-dir="' + dir + '" role="button" aria-label="' +
             PAD_NAMES[dir] + '">' +
             '<polygon points="0,0 ' + p[0].toFixed(2) + "," + p[1].toFixed(2) + " " +
             q[0].toFixed(2) + "," + q[1].toFixed(2) + '"/>' +
             '<path class="pad-arrow" d="M-5 -6.5 L5 0 L-5 6.5" transform="translate(' +
             ax + " " + ay + ") rotate(" + mid + ')"/>' +
             '<g class="pad-lock" transform="translate(' + ax + " " + ay + ') scale(0.8)">' +
             LOCK_GLYPH + "</g></g>";
    }
    return out + '<circle class="pad-hub" r="9"/></svg>';
  }

  function buzz() {
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (e) {
      /* haptics off */
    }
  }

  function buildPad(game) {
    var input = game.inputManager;
    var board = document.querySelector(".game-container");
    if (!board) return;

    var row = document.createElement("div");
    row.className = "turtle-controls";

    var lock = document.createElement("button");
    lock.type = "button";
    lock.className = "theme-toggle lock-button";

    var pad = document.createElement("div");
    pad.className = "turtle-pad";
    pad.setAttribute("role", "group");
    pad.setAttribute("aria-label", "Move");
    pad.innerHTML = padSvg();

    row.appendChild(lock);
    row.appendChild(pad);
    board.parentNode.insertBefore(row, board.nextSibling);

    var wedges = pad.querySelectorAll(".pad-wedge");
    var aimed = null;
    var lit = 0;
    var unlight = null;

    function light(dir) {
      if (dir === aimed) return;
      aimed = dir;
      for (var i = 0; i < wedges.length; i++) {
        wedges[i].classList.toggle("is-aimed",
          parseInt(wedges[i].getAttribute("data-dir"), 10) === dir);
      }
    }

    // A wedge stays lit while its direction is held, and for a moment after a
    // tap so a quick swipe still shows which way it was read.
    input.on("aim", function (dir) {
      clearTimeout(unlight);
      if (dir === null) {
        var wait = Math.max(0, 160 - (Date.now() - lit));
        unlight = setTimeout(function () { light(null); }, wait);
        return;
      }
      lit = Date.now();
      light(dir);
    });

    /* The lock: "play", "locking" (picking), or "armed" (asking to clear). */
    var mode = "play";
    var armTimer = null;

    var LABELS = {
      play: "Lock directions",
      locked: "Clear locked directions",
      locking: "Done locking",
      armed: "Tap again to clear locks"
    };

    function render() {
      var locks = game.locks || [];
      var state = mode === "play" && locks.length ? "locked" : mode;
      lock.innerHTML = lockSvg(state === "play");
      lock.classList.toggle("is-locking", mode === "locking");
      lock.classList.toggle("is-armed", mode === "armed");
      lock.setAttribute("aria-label", LABELS[state]);
      lock.setAttribute("title", LABELS[state]);
      lock.setAttribute("aria-pressed", String(mode === "locking"));
      pad.classList.toggle("is-locking", mode === "locking");
      for (var i = 0; i < wedges.length; i++) {
        var dir = parseInt(wedges[i].getAttribute("data-dir"), 10);
        var locked = locks.indexOf(game.fromScreen(dir)) !== -1;
        wedges[i].classList.toggle("is-locked", locked);
        wedges[i].setAttribute("aria-label", PAD_NAMES[dir] + (locked ? " (locked)" : ""));
      }
    }

    function setMode(next) {
      clearTimeout(armTimer);
      mode = next;
      if (mode === "armed") {
        armTimer = setTimeout(function () { setMode("play"); }, input.restartArmMs);
      }
      render();
    }

    lock.addEventListener("click", function () {
      if (mode === "locking") {
        setMode("play");
      } else if (mode === "armed") {
        game.clearLocks();
        setMode("play");
      } else if (game.locks.length) {
        setMode("armed");
      } else {
        setMode("locking");
      }
      buzz();
    });

    // Playing on, or a new game, settles the lock back to play.
    input.on("move", function () {
      if (mode === "armed") setMode("play");
    });
    input.on("restart", function () {
      if (mode !== "play") setMode("play");
    });
    game.onLocks = render;
    render();

    var pointer = null;

    pad.addEventListener("pointerdown", function (e) {
      var wedge = e.target.closest && e.target.closest(".pad-wedge");
      if (!wedge || pointer !== null) return;
      e.preventDefault();
      var dir = parseInt(wedge.getAttribute("data-dir"), 10);
      if (mode === "locking") {
        game.toggleLock(game.fromScreen(dir));
        buzz();
        return;
      }
      if (mode === "armed") setMode("play");
      pointer = e.pointerId;
      try { pad.setPointerCapture(pointer); } catch (err) { /* already gone */ }
      input.hold(dir);
    });

    function up(e) {
      if (e.pointerId !== pointer) return;
      pointer = null;
      input.release();
    }

    pad.addEventListener("pointerup", up);
    pad.addEventListener("pointercancel", up);
    pad.addEventListener("lostpointercapture", up);
    // A long press is a hold, not a request for the context menu.
    pad.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  /* ---- the turtles ----
   *
   * Each is SVG in the same frame, drawn behind the tiles: anatomy first,
   * then the shell, then the 19 empty scutes. Colours come from classes, set
   * in turtle.css, so both themes follow the page. Sage is Claude's; Reef
   * Glider, Garden Keeper and Pocket Pal are Astra's.
   */

  function scutes(radius) {
    radius = radius || RADIUS;
    var out = "";
    var corner = 28 * cellSize(radius) / 30;
    for (var x = 0; x <= 2 * radius; x++) {
      for (var y = 0; y <= 2 * radius; y++) {
        if (!inHex(x, y, radius)) continue;
        var c = cellCentre(x, y, radius);
        var pts = [];
        for (var i = 0; i < 6; i++) {
          var a = Math.PI / 3 * i;
          pts.push((c.x + Math.cos(a) * corner).toFixed(2) + "," + (c.y + Math.sin(a) * corner).toFixed(2));
        }
        out += '<polygon class="scute" points="' + pts.join(" ") + '"/>';
      }
    }
    return out;
  }

  var SHELL = "M132 34 H168 L276 96 V244 L168 306 H132 L24 244 V96 Z";

  // The parts that move have their own classes (2026-11-01): head, look
  // (the eyes' glance), limb-fl and limb-fr (the front limbs; Pocket Pal's
  // are on its right, where its head is), limb-bl and limb-br, rear-l and
  // rear-r, tail and squint. Parts drawn with a transform are wrapped in a
  // group, so an animation moves the group and keeps the shape's own turn.
  var ART = {
    sage:
      '<g class="skin">' +
        '<g class="limb-fl"><ellipse cx="52" cy="74" rx="34" ry="15" transform="rotate(40 52 74)"/></g>' +
        '<g class="limb-fr"><ellipse cx="248" cy="74" rx="34" ry="15" transform="rotate(-40 248 74)"/></g>' +
        '<g class="limb-bl"><ellipse cx="52" cy="266" rx="34" ry="15" transform="rotate(-40 52 266)"/></g>' +
        '<g class="limb-br"><ellipse cx="248" cy="266" rx="34" ry="15" transform="rotate(40 248 266)"/></g>' +
        '<polygon points="141,304 159,304 150,318"/>' +
      "</g>" +
      '<g class="head">' +
        '<ellipse class="skin" cx="150" cy="32" rx="22" ry="21"/>' +
        '<g class="look"><g class="eyes"><circle cx="141" cy="23" r="3"/><circle cx="159" cy="23" r="3"/></g></g>' +
      "</g>" +
      '<path class="shell shell-soft" d="' + SHELL + '"/>',

    reef:
      '<g class="skin">' +
        '<path class="flipper-l limb-fl" d="M94 67 Q55 48 8 127 Q31 136 76 102 Z"/>' +
        '<path class="flipper-r limb-fr" d="M206 67 Q245 48 292 127 Q269 136 224 102 Z"/>' +
        '<path class="rear-l" d="M64 251 Q30 262 32 283 Q58 285 87 269 Z"/>' +
        '<path class="rear-r" d="M236 251 Q270 262 268 283 Q242 285 213 269 Z"/>' +
        '<path class="tail" d="M142 300 Q147 310 150 314 Q153 310 158 300 Z"/>' +
      "</g>" +
      '<g class="head">' +
        '<path class="skin" d="M139 45 L136 29 Q135 15 150 15 Q165 15 164 29 L161 45 Z"/>' +
        '<g class="look"><g class="eyes"><circle cx="141" cy="25" r="2"/><circle cx="159" cy="25" r="2"/></g></g>' +
      "</g>" +
      '<path class="shell" d="' + SHELL + '"/>' +
      '<g class="seam">' +
        '<path d="M130 36 L133 41 M170 36 L167 41 M91 59 L96 65 M209 59 L204 65 M51 82 L56 88"/>' +
        '<path d="M249 82 L244 88 M273 143 H268 M273 196 H268 M27 143 H32 M27 196 H32"/>' +
        '<path d="M51 258 L56 252 M249 258 L244 252 M91 281 L96 275 M209 281 L204 275"/>' +
        '<path d="M130 304 L133 299 M170 304 L167 299"/>' +
      "</g>",

    garden:
      '<g class="head">' +
        '<path class="foot" d="M135 47 L133 32 Q133 20 144 20 H156 Q167 20 167 32 L165 47 Z"/>' +
        '<g class="look"><g class="eyes"><circle cx="140" cy="29" r="2"/><circle cx="160" cy="29" r="2"/></g></g>' +
      "</g>" +
      '<g class="foot">' +
        '<path class="limb-fl" d="M64 73 L39 65 L18 84 L23 101 L56 102 Z"/>' +
        '<path class="limb-fr" d="M236 73 L261 65 L282 84 L277 101 L244 102 Z"/>' +
        '<path d="M56 239 L22 248 L18 267 L38 277 L74 267 Z"/>' +
        '<path d="M244 239 L278 248 L282 267 L262 277 L226 267 Z"/>' +
        '<path d="M142 302 L150 314 L158 302 Z"/>' +
      "</g>" +
      // Each front foot's claws carry its class too, so they move with it.
      '<g class="claw">' +
        '<path class="limb-fl" d="M24 82 L31 87 M29 76 L36 81"/>' +
        '<path class="limb-fr" d="M276 82 L269 87 M271 76 L264 81"/>' +
        '<path d="M24 265 L32 260 M30 272 L38 267 M276 265 L268 260 M270 272 L262 267"/>' +
      "</g>" +
      '<path class="lip" d="M130 33 H170 L280 95 V245 L170 307 H130 L20 245 V95 Z"/>' +
      '<path class="shell" d="M134 38 H166 L272 100 V240 L166 302 H134 L28 240 V100 Z"/>' +
      '<g class="lip-seam">' +
        '<path d="M91 56 L95 62 M209 56 L205 62 M21 146 H28 M279 146 H272"/>' +
        '<path d="M21 198 H28 M279 198 H272 M91 284 L95 278 M209 284 L205 278"/>' +
        '<path d="M150 33 V38 M150 302 V307"/>' +
      "</g>",

    pocket:
      '<g class="skin">' +
        '<path class="limb-bl" d="M79 69 Q64 46 49 58 Q38 73 61 90 Z"/>' +
        '<path class="limb-fl" d="M221 69 Q236 46 251 58 Q262 73 239 90 Z"/>' +
        '<path class="limb-br" d="M79 271 Q64 294 49 282 Q38 267 61 250 Z"/>' +
        '<path class="limb-fr" d="M221 271 Q236 294 251 282 Q262 267 239 250 Z"/>' +
        '<path class="tail" d="M30 160 Q17 162 6 170 Q17 178 30 180 Z"/>' +
        '<path d="M273 149 Q296 145 296 163 V177 Q296 195 273 191 Z"/>' +
      "</g>" +
      '<path class="shell shell-rim" d="' + SHELL + '"/>' +
      '<g class="look"><g class="squint">' +
        '<g class="eyes blink"><circle cx="285" cy="158" r="2.3"/><circle cx="285" cy="182" r="2.3"/></g>' +
      "</g></g>" +
      '<path class="smile" d="M289 166 Q294 170 289 174"/>'
  };

  function artFor(skin, radius) {
    return '<svg class="turtle-art" viewBox="' + VIEW.x + " " + VIEW.y + " " + VIEW.w + " " + VIEW.h +
           '" aria-hidden="true" focusable="false">' + (ART[skin] || ART.sage) + scutes(radius) + "</svg>";
  }

  /* ---- rendering ---- */

  function TurtleActuator() {
    root.HTMLActuator.call(this);
    this.board = document.querySelector(".game-container");
    this.gridEl = document.querySelector(".grid-container");
    this.skin = null;
    this.radius = null;
    this.strokeTimer = null;
    // The art and the tiles turn together in one layer; the message, cards
    // and sparks stay upright outside it. (🐢48x's picked tiles join.)
    this.rotor = document.createElement("div");
    this.rotor.className = "turtle-rotor";
    this.board.insertBefore(this.rotor, this.gridEl);
    this.rotor.appendChild(this.gridEl);
    this.rotor.appendChild(this.tileContainer);
    this.turnDeg = null;
    this.turnTimer = null;
    this.mood = null;
    this.lastCue = 0;
    this.cueTimers = {};
    this.idleTimer = null;
    this.lastDirection = 0;
  }

  if (root.HTMLActuator) {
    TurtleActuator.prototype = Object.create(root.HTMLActuator.prototype);
    TurtleActuator.prototype.constructor = TurtleActuator;
  }

  // radius 3 is 🐢48x's grown turtle: is-grown sizes and places its tiles
  // (turtle48x.css).
  TurtleActuator.prototype.setSkin = function (skin, over, radius) {
    radius = radius || RADIUS;
    if (skin !== this.skin || radius !== this.radius) {
      this.skin = skin;
      this.radius = radius;
      this.gridEl.innerHTML = artFor(skin, radius);
      this.board.setAttribute("data-skin", skin);
      this.board.classList.toggle("is-grown", radius === 3);
    }
    // Garden Keeper pulls its head in when the game is over.
    this.board.classList.toggle("is-over", !!over);
  };

  // The board turned by turn sixths. The angle only ever grows, so going
  // from five sixths back to none turns on clockwise instead of spinning
  // back; the tiles' numbers turn the other way and stay upright. Only a
  // turn button press animates (is-turning), not the page loading turned.
  TurtleActuator.prototype.setTurn = function (turn, animate) {
    var self = this;
    if (this.turnDeg === null) {
      this.turnDeg = turn * 60;
    } else {
      var now = ((this.turnDeg / 60) % 6 + 6) % 6;
      this.turnDeg += ((turn - now + 6) % 6) * 60;
    }
    if (animate) {
      this.board.classList.add("is-turning");
      clearTimeout(this.turnTimer);
      this.turnTimer = setTimeout(function () {
        self.board.classList.remove("is-turning");
      }, 400);
    }
    this.board.style.setProperty("--turn-deg", this.turnDeg + "deg");
  };

  /* ---- the turtles' movements (2026-11-01; Astra's ideas, all of them) ----
   *
   * Each plays once, on a cue class on the board (turtle.css draws it):
   *
   *   every turtle  salute  front limbs lift      the first 2048 of a game
   *                 glance  eyes look the move's way   the first move after 8 s still
   *   Sage          nod     head dips              a new top tile, from 128 up
   *                 settle  back feet shift        15 s with no move
   *   Reef Glider   flick   tail flick             the first 512 and 1024
   *                 paddle  back flippers stroke   18 s with no move
   *                 (and its old front stroke on a merge of 256 or more)
   *   Garden Keeper shuffle front foot shifts      a new top tile, from 256 up
   *                 peek    head pushes out        12 s with no move
   *   Pocket Pal    wag     tail wags              the first 128, 256 and 512
   *                 squint  happy squint           the first 1024
   *
   * One movement at most
   * per move, none within 8 s of the last, nothing once the game is over, and
   * none when the phone asks for reduced motion (the CSS is behind it).
   */

  var CUE_MS = {
    salute: 900, glance: 1000, nod: 700, settle: 600, flick: 600, paddle: 900,
    shuffle: 600, peek: 1000, wag: 800, squint: 900
  };
  var IDLE = { sage: ["settle", 15000], reef: ["paddle", 18000], garden: ["peek", 12000] };
  var CUE_GAP = 8000;
  var GLANCE_AFTER = 8000;

  function crossed(before, now, value) {
    return before < value && now >= value;
  }

  TurtleActuator.prototype.cue = function (name) {
    var self = this;
    var cls = "cue-" + name;
    this.board.classList.remove(cls);
    void this.board.offsetWidth; // restart the animation
    this.board.classList.add(cls);
    clearTimeout(this.cueTimers[name]);
    this.cueTimers[name] = setTimeout(function () {
      self.board.classList.remove(cls);
    }, CUE_MS[name]);
    this.lastCue = Date.now();
  };

  // The movement a move earns, if any: the 2048 salute first, then the
  // turtle's own milestone, then the glance.
  TurtleActuator.prototype.pickCue = function (before, top, still) {
    if (crossed(before, top, 2048)) return "salute";
    var higher = top > before;
    switch (this.skin) {
      case "sage":
        if (higher && top >= 128) return "nod";
        break;
      case "reef":
        if (crossed(before, top, 512) || crossed(before, top, 1024)) return "flick";
        break;
      case "garden":
        if (higher && top >= 256) return "shuffle";
        break;
      case "pocket":
        if (crossed(before, top, 1024)) return "squint";
        if (crossed(before, top, 128) || crossed(before, top, 256) ||
            crossed(before, top, 512)) return "wag";
        break;
    }
    if (still >= GLANCE_AFTER) {
      var a = ANGLES[this.lastDirection] * Math.PI / 180;
      this.board.style.setProperty("--gx", (1.8 * Math.cos(a)).toFixed(2) + "px");
      this.board.style.setProperty("--gy", (1.8 * Math.sin(a)).toFixed(2) + "px");
      return "glance";
    }
    return null;
  };

  // After each move, the turtle's idle movement waits its time; any move
  // starts the wait again, so it plays once per pause.
  TurtleActuator.prototype.waitIdle = function () {
    var self = this;
    clearTimeout(this.idleTimer);
    var idle = IDLE[this.skin];
    if (!idle) return;
    this.idleTimer = setTimeout(function () {
      if (self.mood && !self.mood.over && Date.now() - self.lastCue >= CUE_GAP) self.cue(idle[0]);
    }, idle[1]);
  };

  TurtleActuator.prototype.moods = function (grid, meta) {
    var top = 0;
    grid.eachCell(function (x, y, tile) {
      if (tile && tile.value > top) top = tile.value;
    });
    var now = Date.now();

    // A page load or a new game sets the baseline without a movement.
    if (!this.mood || meta.moves === 0) {
      this.mood = { moves: meta.moves, top: top, at: now, over: meta.over };
      this.waitIdle();
      return;
    }
    // Going back a move keeps the highs already reached, so replaying a
    // milestone does not replay its movement.
    if (meta.moves < this.mood.moves) {
      this.mood.moves = meta.moves;
      return;
    }
    var moved = meta.moves > this.mood.moves;
    var before = this.mood.top;
    this.mood.moves = meta.moves;
    this.mood.top = Math.max(before, top);
    this.mood.over = meta.over;
    if (meta.over) {
      clearTimeout(this.idleTimer);
      return;
    }
    if (!moved) return; // 🐢48x's Double: no movement of its own
    var still = now - this.mood.at;
    this.mood.at = now;
    var name = this.pickCue(before, top, still);
    if (name && now - this.lastCue >= CUE_GAP) this.cue(name);
    this.waitIdle();
  };

  // Reef Glider strokes its front flippers once on a merge of 256 or more.
  TurtleActuator.prototype.actuate = function (grid, meta) {
    var self = this;
    root.HTMLActuator.prototype.actuate.call(this, grid, meta);
    this.moods(grid, meta);
    if (this.skin !== "reef") return;
    var big = false;
    grid.eachCell(function (x, y, tile) {
      if (tile && tile.mergedFrom && tile.value >= 256) big = true;
    });
    if (!big) return;
    this.board.classList.remove("is-stroking");
    void this.board.offsetWidth; // restart the animation
    this.board.classList.add("is-stroking");
    clearTimeout(this.strokeTimer);
    this.strokeTimer = setTimeout(function () {
      self.board.classList.remove("is-stroking");
    }, 800);
  };

  /* --chrome (turtle.css, turtle48x.css) is the page's height around the board,
   * measured on one screen at one text size. A phone with larger text runs
   * taller, and the board, which must keep its shape, would be pushed off the
   * foot of the page. So once the page is built, and again on a resize, the
   * real overflow is measured and --chrome raised until the board is small
   * enough: the board and pad scale together, the pad 0.4355 board widths
   * tall and the board 1.04 (turtle.css; 🐢48x's grown board is taller, so
   * its height is measured), so a board narrower by d frees about
   * 1.4755 d. A few passes, since the pad stops growing at 210px. */
  var PAD_TALL = 0.4355;
  var BOARD_AND_PAD = 1.4755;

  function overflow(container) {
    var top = Infinity;
    var bottom = -Infinity;
    Array.prototype.forEach.call(container.children, function (el) {
      if (!el.getClientRects().length) return; // hidden
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      top = Math.min(top, r.top - (parseFloat(cs.marginTop) || 0));
      bottom = Math.max(bottom, r.bottom + (parseFloat(cs.marginBottom) || 0));
    });
    if (top === Infinity) return 0;
    var cs = getComputedStyle(container);
    return bottom - top + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) -
           container.clientHeight;
  }

  function fitPage() {
    var html = document.documentElement;
    var container = document.querySelector(".container.turtle");
    var board = document.querySelector(".game-container");
    if (!container || !board) return;
    html.style.removeProperty("--chrome");
    for (var pass = 0; pass < 4; pass++) {
      var excess = overflow(container);
      if (excess <= 0.5) return;
      var width = container.clientWidth; // the container is --board wide
      var ratio = board.getBoundingClientRect().height / width + PAD_TALL;
      var target = width - excess / ratio - 1;
      // turtle.css sizes the board as (height - --chrome) / 1.4755.
      html.style.setProperty("--chrome",
        Math.ceil(container.clientHeight - target * BOARD_AND_PAD) + "px");
    }
  }

  // An art point turned with the board, about the shell's centre.
  function turned(c, turn) {
    var a = (turn || 0) * Math.PI / 3;
    var dx = c.x - 150;
    var dy = c.y - 170;
    return {
      x: 150 + dx * Math.cos(a) - dy * Math.sin(a),
      y: 170 + dx * Math.sin(a) + dy * Math.cos(a)
    };
  }

  /* Art units to board pixels and back, through the rotor's turn and zoom
   * (--zoom, 🐢48x's grown turtle). The rotor's box is its layout box, before
   * its transform; the turn and zoom are about the shell's centre. */
  function rotorFrame() {
    var board = document.querySelector(".game-container");
    var rotor = board && board.querySelector(".turtle-rotor");
    if (!rotor) return null;
    var unit = rotor.offsetWidth / VIEW.w;
    return {
      board: board,
      unit: unit,
      zoom: parseFloat(getComputedStyle(board).getPropertyValue("--zoom")) || 1,
      x: rotor.offsetLeft + (150 - VIEW.x) * unit,
      y: rotor.offsetTop + (170 - VIEW.y) * unit
    };
  }

  function artToBoard(c, turn) {
    var f = rotorFrame();
    var t = turned(c, turn);
    return { x: f.x + (t.x - 150) * f.unit * f.zoom, y: f.y + (t.y - 170) * f.unit * f.zoom };
  }

  // A point on the page to art units, turned back upright.
  function pageToArt(px, py, turn) {
    var f = rotorFrame();
    var rect = f.board.getBoundingClientRect();
    var k = f.unit * f.zoom;
    return turned({
      x: 150 + (px - rect.left - f.x) / k,
      y: 170 + (py - rect.top - f.y) / k
    }, -(turn || 0));
  }

  // Spark centres for effects.js, in board pixels, where the cell is shown.
  function fxCellCenter(x, y) {
    var game = root.Turtle && root.Turtle.game;
    return artToBoard(cellCentre(x, y, game && game.grid && game.grid.radius), game && game.turn);
  }

  root.Turtle = {
    TurtleManager: TurtleManager,
    HexGrid: HexGrid,
    HexInputManager: HexInputManager,
    TurtleActuator: TurtleActuator,
    TurtleStorage: TurtleStorage,
    buildPad: buildPad,
    directionOf: directionOf,
    inHex: inHex,
    cellCentre: cellCentre,
    cellSize: cellSize,
    turned: turned,
    pageToArt: pageToArt,
    fitPage: fitPage,
    SIZE: SIZE,
    VECTORS: VECTORS,
    SKINS: SKINS,
    VIEW: VIEW
  };

  // An ×, for the menu's switch between plain 🐢48 and 🐢48x.
  var X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="3" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M6 6l12 12M18 6 6 18"/></svg>';

  // A right-angle turn with a rounded corner (2026-11-01), so it doesn't read
  // as New Game's ↻.
  var TURN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5 20v-7a6 6 0 0 1 6-6h8"/><path d="M15.5 3.5 19 7l-3.5 3.5"/></svg>';

  if (typeof document !== "undefined" && document.querySelector(".turtle")) {
    root.fxCellCenter = fxCellCenter;
    var x48 = !!document.querySelector(".turtle48x");
    if (root.GameMenu) {
      // A setting: it turns in place, the menu staying open, and shows how
      // far this turtle is turned.
      root.GameMenu.add({
        label: function () { return "Turn the turtle"; },
        icon: function () { return TURN_ICON; },
        value: function () {
          var game = root.Turtle.game;
          return (game ? game.turn * 60 : 0) + "°";
        },
        stay: true,
        run: function () {
          if (root.Turtle.game) root.Turtle.game.turnBy();
        }
      });
      root.GameMenu.add({
        label: function () { return x48 ? "Plain 🐢48" : "🐢48x"; },
        icon: function () { return X_ICON; },
        run: function () { window.location.href = x48 ? "./" : "turtle48x.html"; }
      });
    }
    // 🐢48x starts its own game (turtle48x.js), and fits the page itself.
    if (!x48) {
      window.requestAnimationFrame(function () {
        root.Turtle.game = new TurtleManager(SIZE, HexInputManager, TurtleActuator, TurtleStorage);
        buildPad(root.Turtle.game);
        fitPage();
      });
    }
    window.addEventListener("resize", fitPage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPage);
  }
})(typeof window !== "undefined" ? window : globalThis);
