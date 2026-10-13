/* Fib — 2048 with Fibonacci tiles.
 *
 *   - Tiles slide exactly as in 2048.
 *   - Two tiles merge when they are neighbours in the Fibonacci sequence:
 *     1 + 1 = 2, 1 + 2 = 3, 2 + 3 = 5, 3 + 5 = 8, and so on. Equal tiles other
 *     than the 1s do not merge: 2 + 2 is not a Fibonacci step.
 *   - New tiles are 1s (90%) or 2s (10%), in a random empty cell.
 *   - A merge scores its new value, as in 2048. 2584 is the win, with Keep
 *     going after it.
 *
 * The movement code is upstream's GameManager: FibManager inherits it and
 * replaces only the merge rule, the new tile and the win.
 */

(function (root) {
  "use strict";

  var WIN = 2584;

  // 1, 2, 3, 5, 8 ... far past anything a 4x4 board can hold.
  var FIB = [1, 2];
  while (FIB.length < 40) FIB.push(FIB[FIB.length - 1] + FIB[FIB.length - 2]);

  // Neighbours in the sequence, either way round; 1 + 1 is the one equal pair.
  function canMerge(a, b) {
    var lo = Math.min(a, b);
    var hi = Math.max(a, b);
    if (lo === 1 && hi === 1) return true;
    var i = FIB.indexOf(lo);
    return i >= 0 && FIB[i + 1] === hi;
  }

  // Position on the classic ramp: 1 takes the 2's colour, 2 the 4's, and so
  // on up to 144 on the 2048 red. Past that the dark super tile, as in classic.
  function rankOf(value) {
    return FIB.indexOf(value) + 1; // 1 -> 1, 2 -> 2, 3 -> 3, 5 -> 4 ...
  }

  function tileToken(value) {
    var rank = rankOf(value);
    return rank >= 1 && rank <= 11 ? "--t" + Math.pow(2, rank) : "--tsuper";
  }

  function FibStorage() {
    LocalStorageManager.call(this);
    this.bestScoreKey = "fib-best";
    this.gameStateKey = "fib-state";
  }

  function FibManager(size, InputManager, Actuator, StorageManager) {
    root.GameManager.call(this, size, InputManager, Actuator, StorageManager);
  }

  if (root.GameManager) {
    FibManager.prototype = Object.create(root.GameManager.prototype);
    FibManager.prototype.constructor = FibManager;
    FibStorage.prototype = Object.create(root.LocalStorageManager.prototype);
    FibStorage.prototype.constructor = FibStorage;
  }

  FibManager.prototype.random = Math.random;

  FibManager.prototype.addRandomTile = function () {
    if (this.grid.cellsAvailable()) {
      var value = this.random() < 0.9 ? 1 : 2;
      this.grid.insertTile(new Tile(this.grid.randomAvailableCell(), value));
    }
  };

  // Upstream's move with the Fibonacci merge rule in place of equal values.
  FibManager.prototype.move = function (direction) {
    var self = this;
    if (this.isGameTerminated()) return;

    var cell, tile;
    var vector = this.getVector(direction);
    var traversals = this.buildTraversals(vector);
    var moved = false;

    this.prepareTiles();

    traversals.x.forEach(function (x) {
      traversals.y.forEach(function (y) {
        cell = { x: x, y: y };
        tile = self.grid.cellContent(cell);
        if (!tile) return;

        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);

        if (next && !next.mergedFrom && canMerge(next.value, tile.value)) {
          var merged = new Tile(positions.next, tile.value + next.value);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);
          tile.updatePosition(positions.next);

          self.score += merged.value;
          if (merged.value === WIN) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) moved = true;
      });
    });

    if (moved) {
      this.moves += 1;
      this.addRandomTile();
      if (!this.movesAvailable()) this.over = true;
      this.actuate();
    }
  };

  FibManager.prototype.tileMatchesAvailable = function () {
    for (var x = 0; x < this.size; x++) {
      for (var y = 0; y < this.size; y++) {
        var tile = this.grid.cellContent({ x: x, y: y });
        if (!tile) continue;
        for (var direction = 0; direction < 4; direction++) {
          var vector = this.getVector(direction);
          var other = this.grid.cellContent({ x: x + vector.x, y: y + vector.y });
          if (other && canMerge(other.value, tile.value)) return true;
        }
      }
    }
    return false;
  };

  root.Fib = {
    FibManager: FibManager,
    FibStorage: FibStorage,
    canMerge: canMerge,
    tileToken: tileToken,
    FIB: FIB,
    WIN: WIN
  };

  if (typeof document !== "undefined" && document.querySelector(".fib")) {
    root.fxTileToken = tileToken;
    window.requestAnimationFrame(function () {
      new FibManager(4, KeyboardInputManager, HTMLActuator, FibStorage);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
