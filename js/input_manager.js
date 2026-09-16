/* Input manager — phone variant.
 *
 * Keeps upstream's constructor name and its on("move"|"restart"|"keepPlaying")
 * interface, so game_manager.js and application.js are used unmodified.
 *
 * Three changes from upstream:
 *   1. Swipes are read on the whole document, not just the board. On a phone
 *      the board is a small target and a swipe that starts on the heading or
 *      the margin should still move tiles.
 *   2. Buttons bind "click" only. Upstream binds click AND touchend, so one tap
 *      fires the handler twice — on a win screen that restarted the game and
 *      immediately dismissed the message.
 *   3. Pointer events handle mouse-drag and stylus too, with touch events kept
 *      as the fallback path.
 */

function KeyboardInputManager() {
  this.events = {};

  // Distance a gesture must cover before it counts as a swipe rather than a tap.
  // Upstream uses 10px, which misreads a slightly smudged tap as a move.
  this.swipeThreshold = 20;

  this.listen();
}

KeyboardInputManager.prototype.on = function (event, callback) {
  if (!this.events[event]) {
    this.events[event] = [];
  }
  this.events[event].push(callback);
};

KeyboardInputManager.prototype.emit = function (event, data) {
  var callbacks = this.events[event];
  if (callbacks) {
    callbacks.forEach(function (callback) {
      callback(data);
    });
  }
};

// A gesture starting on a control is that control's tap, not a board swipe.
// Text fields count: the leaderboard's name entry lives on the same page.
KeyboardInputManager.prototype.isControl = function (target) {
  return !!(target && target.closest &&
            target.closest("a, button, input, textarea, select"));
};

KeyboardInputManager.prototype.listen = function () {
  var self = this;

  var map = {
    38: 0, // Up
    39: 1, // Right
    40: 2, // Down
    37: 3, // Left
    75: 0, // Vim up
    76: 1, // Vim right
    74: 2, // Vim down
    72: 3, // Vim left
    87: 0, // W
    68: 1, // D
    83: 2, // S
    65: 3  // A
  };

  document.addEventListener("keydown", function (event) {
    var modifiers = event.altKey || event.ctrlKey || event.metaKey ||
                    event.shiftKey;
    var mapped    = map[event.which];

    if (!modifiers) {
      if (mapped !== undefined) {
        event.preventDefault();
        self.emit("move", mapped);
      }

      // R restarts, with the same two-press confirmation as the button
      if (event.which === 82) {
        self.confirmRestart.call(self, event);
      }
    }
  });

  this.bindButtonPress(".retry-button", this.restart);
  this.bindButtonPress(".restart-button", this.confirmRestart);
  this.bindButtonPress(".keep-playing-button", this.keepPlaying);

  var startX = null;
  var startY = null;
  var tracking = false;

  function begin(x, y, target) {
    if (self.isControl(target)) {
      tracking = false;
      return;
    }
    startX = x;
    startY = y;
    tracking = true;
  }

  function finish(x, y) {
    if (!tracking) return;
    tracking = false;

    var dx = x - startX;
    var dy = y - startY;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > self.swipeThreshold) {
      self.disarmRestart(); // playing on means the first tap was a slip
      // (right : left) : (down : up)
      self.emit("move", absDx > absDy ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    }
  }

  if (window.PointerEvent) {
    document.addEventListener("pointerdown", function (event) {
      if (!event.isPrimary) return;
      begin(event.clientX, event.clientY, event.target);
    });

    document.addEventListener("pointerup", function (event) {
      if (!event.isPrimary) return;
      finish(event.clientX, event.clientY);
    });

    document.addEventListener("pointercancel", function () {
      tracking = false;
    });
  } else {
    document.addEventListener("touchstart", function (event) {
      if (event.touches.length > 1) {
        tracking = false; // multi-touch is a pinch, not a swipe
        return;
      }
      begin(event.touches[0].clientX, event.touches[0].clientY, event.target);
    }, { passive: true });

    document.addEventListener("touchend", function (event) {
      if (event.touches.length > 0) return;
      finish(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
    });

    document.addEventListener("touchcancel", function () {
      tracking = false;
    });
  }

  // touch-action:none in the stylesheet stops the browser scrolling or zooming
  // on these gestures; this stops the rubber-band on engines that ignore it.
  document.addEventListener("touchmove", function (event) {
    if (tracking) event.preventDefault();
  }, { passive: false });
};

KeyboardInputManager.prototype.restart = function (event) {
  event.preventDefault();
  this.emit("restart");
};

/* New Game asks twice. The first press turns the button into "Tap again" for
 * a few seconds; only a second press inside that window restarts. There is no
 * dialog to dismiss, and letting it lapse or swiping cancels it.
 *
 * It skips the question when there is nothing to lose: after game over (the
 * board is already finished) or before the first point is scored. The overlay's
 * "Try again" button never asks, for the same reason. */
KeyboardInputManager.prototype.restartArmMs = 3000;

KeyboardInputManager.prototype.hasProgress = function () {
  var over = document.querySelector(".game-message.game-over");
  if (over) return false;
  var score = document.querySelector(".score-container");
  return !!score && (parseInt(score.textContent, 10) || 0) > 0;
};

KeyboardInputManager.prototype.confirmRestart = function (event) {
  event.preventDefault();

  if (this.restartArmed || !this.hasProgress()) {
    this.disarmRestart();
    this.emit("restart");
    return;
  }

  var button = document.querySelector(".restart-button");
  this.restartArmed = true;
  if (button) {
    button.style.minWidth = button.offsetWidth + "px"; // no layout jump
    this.restartLabel = button.textContent;
    button.textContent = "Tap again";
    button.classList.add("is-armed");
  }
  this.restartTimer = setTimeout(this.disarmRestart.bind(this), this.restartArmMs);
};

KeyboardInputManager.prototype.disarmRestart = function () {
  if (!this.restartArmed) return;
  this.restartArmed = false;
  clearTimeout(this.restartTimer);
  var button = document.querySelector(".restart-button");
  if (button) {
    button.textContent = this.restartLabel;
    button.classList.remove("is-armed");
    button.style.minWidth = "";
  }
};

KeyboardInputManager.prototype.keepPlaying = function (event) {
  event.preventDefault();
  this.emit("keepPlaying");
};

KeyboardInputManager.prototype.bindButtonPress = function (selector, fn) {
  var button = document.querySelector(selector);
  if (!button) return;
  button.addEventListener("click", fn.bind(this));
};
