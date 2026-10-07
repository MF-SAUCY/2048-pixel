/* Up-move guard, classic only.
 *
 * In a game built against the bottom edge, one slip upward can wreck the
 * board. So up asks first: the first up leaves the board alone and says "Swipe
 * up again to move up"; a second up within three seconds moves. Any other move
 * cancels the question and plays as usual, as does letting it lapse or
 * starting a new game. It only asks when up would actually move a tile, and
 * the up keys (arrow, W, K) go through the same path, so they ask too.
 *
 * Wraps GameManager.prototype.move and restart before application.js builds
 * the game, which binds both once, at construction. Dispatch borrows other
 * GameManager methods but not these, and does not load this file.
 */

(function () {
  "use strict";

  if (typeof GameManager === "undefined") return;

  var UP = 0;
  var ARM_MS = 3000;
  var armed = false;
  var timer = null;
  var toast = null;

  // Up moves something when a tile has an empty cell or its own value above it.
  function upWouldMove(grid) {
    for (var x = 0; x < grid.size; x++) {
      for (var y = 1; y < grid.size; y++) {
        var tile = grid.cells[x][y];
        if (!tile) continue;
        var above = grid.cells[x][y - 1];
        if (!above || above.value === tile.value) return true;
      }
    }
    return false;
  }

  // Styled as the back guard's note, in the same place.
  function showToast() {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "back-toast";
      toast.setAttribute("role", "status");
      toast.textContent = "Swipe up again to move up";
      document.body.appendChild(toast);
    }
    // Force a frame between insertion and the visible class so it fades in.
    void toast.offsetWidth;
    toast.classList.add("is-shown");
  }

  function arm() {
    armed = true;
    showToast();
    clearTimeout(timer);
    timer = setTimeout(disarm, ARM_MS);
  }

  function disarm() {
    armed = false;
    clearTimeout(timer);
    if (toast) toast.classList.remove("is-shown");
  }

  var move = GameManager.prototype.move;
  GameManager.prototype.move = function (direction) {
    if (direction === UP && !armed && !this.isGameTerminated() &&
        upWouldMove(this.grid)) {
      arm();
      return;
    }
    disarm();
    move.call(this, direction);
  };

  var restart = GameManager.prototype.restart;
  GameManager.prototype.restart = function () {
    disarm();
    restart.call(this);
  };
})();
