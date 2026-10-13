/* Threes — the game 2048 was built from, on this board.
 *
 *   - A swipe moves every tile one cell at most, not all the way. A line moves
 *     as a train: once the tile nearest the wall moves or merges, every tile
 *     behind it follows one cell.
 *   - 1 + 2 = 3. From 3 up, equal tiles merge into their sum (3 + 3 = 6,
 *     6 + 6 = 12 ...). 1 + 1 and 2 + 2 do not merge.
 *   - After each swipe one new tile slides in on the edge the swipe moved away
 *     from, in one of the lines that moved. The box beside the score shows the
 *     colour of the tile coming next: blue for a 1, red for a 2, white for a 3,
 *     and a "+" for a bonus tile.
 *   - New tiles come from a shuffled deck of twelve: four each of 1, 2 and 3,
 *     reshuffled when it runs out. Once the board holds a 48, a draw now and
 *     then (1 in 21) is instead a bonus tile, from 6 up to an eighth of the
 *     biggest tile.
 *   - The game starts with nine tiles off the deck and ends when no swipe
 *     moves anything.
 *   - The score is the board's: each tile of 3 or more is worth 3 to the power
 *     of its step (3 is 3, 6 is 9, 12 is 27, 24 is 81 ...), 1s and 2s nothing.
 *
 * Grid, Tile and HTMLActuator are upstream's; only the rules are new.
 */

(function (root) {
  "use strict";

  var SIZE = 4;
  var START_TILES = 9;
  var BONUS_FROM = 48;
  var BONUS_ODDS = 1 / 21;

  function canMerge(a, b) {
    if (a + b === 3) return true; // 1 + 2, either way round
    return a === b && a >= 3;
  }

  // 3 -> 3, 6 -> 9, 12 -> 27 ...; 1s and 2s score nothing.
  function tileScore(value) {
    if (value < 3) return 0;
    return Math.pow(3, Math.round(Math.log(value / 3) / Math.LN2) + 1);
  }

  function boardScore(grid) {
    var total = 0;
    grid.eachCell(function (x, y, tile) {
      if (tile) total += tileScore(tile.value);
    });
    return total;
  }

  function highest(grid) {
    var top = 0;
    grid.eachCell(function (x, y, tile) {
      if (tile && tile.value > top) top = tile.value;
    });
    return top;
  }

  function shuffled(random) {
    var deck = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var t = deck[i];
      deck[i] = deck[j];
      deck[j] = t;
    }
    return deck;
  }

  // Cell `index` along line `line` for a swipe in `direction`, counted from
  // the wall the tiles move toward. 0: up, 1: right, 2: down, 3: left.
  function cellAt(direction, line, index) {
    switch (direction) {
      case 0: return { x: line, y: index };
      case 1: return { x: SIZE - 1 - index, y: line };
      case 2: return { x: line, y: SIZE - 1 - index };
      default: return { x: index, y: line };
    }
  }

  function ThreesManager(options) {
    this.size = SIZE;
    this.storage = options.storage || null;
    this.actuator = options.actuator || null;
    this.random = options.random || Math.random;

    if (options.input) {
      options.input.on("move", this.move.bind(this));
      options.input.on("restart", this.restart.bind(this));
    }

    this.setup();
  }

  ThreesManager.prototype.setup = function () {
    var saved = this.storage && this.storage.getGameState();
    if (saved && saved.threes) {
      this.grid = new Grid(saved.grid.size, saved.grid.cells);
      this.deck = saved.deck;
      this.next = saved.next;
      this.moves = saved.moves || 0;
      this.over = saved.over;
    } else {
      this.grid = new Grid(SIZE);
      this.deck = [];
      this.moves = 0;
      this.over = false;
      for (var i = 0; i < START_TILES; i++) {
        this.grid.insertTile(new Tile(this.grid.randomAvailableCell(), this.drawCard()));
      }
      this.next = this.draw();
    }
    this.score = boardScore(this.grid);
    this.actuate();
  };

  ThreesManager.prototype.restart = function () {
    if (this.storage) this.storage.clearGameState();
    if (this.actuator) this.actuator.continueGame();
    this.setup();
  };

  ThreesManager.prototype.isGameTerminated = function () {
    return this.over;
  };

  ThreesManager.prototype.drawCard = function () {
    if (!this.deck.length) this.deck = shuffled(this.random);
    return this.deck.pop();
  };

  // The next tile: a bonus now and then once the board has grown, otherwise
  // the deck's next card.
  ThreesManager.prototype.draw = function () {
    var top = highest(this.grid);
    if (top >= BONUS_FROM && this.random() < BONUS_ODDS) {
      var choices = [];
      for (var v = 6; v <= top / 8; v *= 2) choices.push(v);
      return choices[Math.floor(this.random() * choices.length)];
    }
    return this.drawCard();
  };

  ThreesManager.prototype.prepareTiles = function () {
    this.grid.eachCell(function (x, y, tile) {
      if (tile) {
        tile.mergedFrom = null;
        tile.savePosition();
      }
    });
  };

  // Moves line `line` one step toward the wall in place; true if anything moved.
  ThreesManager.prototype.shiftLine = function (direction, line, apply) {
    var moved = false;
    var grid = this.grid;
    // Without `apply`, a dry run: a line moves if any tile has a free or
    // mergeable cell in front of it.
    for (var i = 1; i < SIZE; i++) {
      var from = cellAt(direction, line, i);
      var to = cellAt(direction, line, i - 1);
      var tile = grid.cellContent(from);
      var ahead = grid.cellContent(to);
      if (!tile) continue;
      if (!apply) {
        if (!ahead || canMerge(ahead.value, tile.value)) return true;
        continue;
      }
      if (!ahead) {
        grid.cells[from.x][from.y] = null;
        grid.cells[to.x][to.y] = tile;
        tile.updatePosition(to);
        moved = true;
      } else if (!ahead.mergedFrom && canMerge(ahead.value, tile.value)) {
        var merged = new Tile(to, ahead.value + tile.value);
        merged.mergedFrom = [tile, ahead];
        grid.insertTile(merged);
        grid.removeTile(tile);
        tile.updatePosition(to);
        moved = true;
      }
    }
    return moved;
  };

  ThreesManager.prototype.canMove = function (direction) {
    for (var line = 0; line < SIZE; line++) {
      if (this.shiftLine(direction, line, false)) return true;
    }
    return false;
  };

  ThreesManager.prototype.movesAvailable = function () {
    for (var d = 0; d < 4; d++) if (this.canMove(d)) return true;
    return false;
  };

  ThreesManager.prototype.move = function (direction) {
    if (this.isGameTerminated()) return;

    this.prepareTiles();
    var movedLines = [];
    for (var line = 0; line < SIZE; line++) {
      if (this.shiftLine(direction, line, true)) movedLines.push(line);
    }
    if (!movedLines.length) return;

    // The new tile comes in at the far end of one of the lines that moved;
    // that cell is always free, since a moved line has shifted off it.
    var pick = movedLines[Math.floor(this.random() * movedLines.length)];
    var cell = cellAt(direction, pick, SIZE - 1);
    var tile = new Tile(cell, this.next);
    tile.entering = direction;
    this.grid.insertTile(tile);
    this.next = this.draw();

    this.moves += 1;
    this.score = boardScore(this.grid);
    if (!this.movesAvailable()) this.over = true;
    this.actuate();
  };

  ThreesManager.prototype.serialize = function () {
    return {
      threes: 1,
      grid: this.grid.serialize(),
      deck: this.deck,
      next: this.next,
      moves: this.moves,
      score: this.score,
      over: this.over
    };
  };

  ThreesManager.prototype.actuate = function () {
    if (!this.storage) return;
    if (this.storage.getBestScore() < this.score) this.storage.setBestScore(this.score);
    if (this.over) {
      this.storage.clearGameState();
    } else {
      this.storage.setGameState(this.serialize());
    }
    if (!this.actuator) return;
    this.actuator.actuate(this.grid, {
      score: this.score,
      over: this.over,
      won: false,
      bestScore: this.storage.getBestScore(),
      terminated: this.over,
      next: this.next
    });
  };

  /* ---- rendering ---- */

  function ThreesActuator() {
    HTMLActuator.call(this);
    this.nextEl = document.querySelector(".next-container");
  }

  if (root.HTMLActuator) {
    ThreesActuator.prototype = Object.create(root.HTMLActuator.prototype);
    ThreesActuator.prototype.constructor = ThreesActuator;
  }

  ThreesActuator.prototype.actuate = function (grid, meta) {
    var self = this;
    // Through HTMLActuator.prototype.actuate at call time, so the merge
    // particles, haptics and leaderboard hooks come along.
    HTMLActuator.prototype.actuate.call(this, grid, meta);
    window.requestAnimationFrame(function () {
      self.renderNext(meta.next);
    });
  };

  // 1 blue, 2 red, 3 white, and a bonus as a white card with a "+": the
  // colour says what is coming without giving away a bonus's size.
  ThreesActuator.prototype.renderNext = function (value) {
    if (!this.nextEl) return;
    var kind = value === 1 || value === 2 || value === 3 ? String(value) : "bonus";
    this.nextEl.innerHTML = '<span class="next-card" data-kind="' + kind + '">' +
                            (kind === "bonus" ? "+" : "") + "</span>";
  };

  ThreesActuator.prototype.message = function () {
    this.messageContainer.classList.add("game-over");
    this.messageContainer.getElementsByTagName("p")[0].textContent = "Out of moves";
  };

  // The new tile slides in from beyond the edge rather than popping up.
  ThreesActuator.prototype.addTile = function (tile) {
    HTMLActuator.prototype.addTile.call(this, tile);
    if (tile.entering === undefined || tile.previousPosition || tile.mergedFrom) return;
    var wrapper = this.tileContainer.lastChild;
    if (wrapper) wrapper.setAttribute("data-enter", ["up", "right", "down", "left"][tile.entering]);
  };

  function tileToken(value) {
    if (value === 1) return "--t8";
    if (value === 2) return "--t2048";
    return "--ink-light";
  }

  function start() {
    if (root.Threes.game) return root.Threes.game;

    // New Game asks twice from the first move on: the opening nine tiles
    // already score, so classic's "any points" test would always ask.
    if (root.KeyboardInputManager) {
      root.KeyboardInputManager.prototype.hasProgress = function () {
        var game = root.Threes.game;
        return !!game && game.moves > 0 && !game.over;
      };
    }

    var storage = new LocalStorageManager();
    storage.bestScoreKey = "threes-best";
    storage.gameStateKey = "threes-state";
    root.Threes.game = new ThreesManager({
      actuator: new ThreesActuator(),
      storage: storage,
      input: new KeyboardInputManager()
    });
    return root.Threes.game;
  }

  root.Threes = {
    ThreesManager: ThreesManager,
    canMerge: canMerge,
    tileScore: tileScore,
    cellAt: cellAt,
    start: start,
    tileToken: tileToken,
    game: null
  };

  if (typeof document !== "undefined" && document.querySelector(".threes")) {
    root.fxTileToken = tileToken;
    window.requestAnimationFrame(start);
  }
})(typeof window !== "undefined" ? window : globalThis);
