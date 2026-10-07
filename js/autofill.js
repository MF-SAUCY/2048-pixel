/* Auto-fill, classic only: hold a down swipe to keep dropping tiles.
 *
 * With the switch on, a down swipe moves as soon as it passes the swipe
 * distance, and holding on repeats it about five times a second (the
 * gesture itself lives in input_manager.js, as downRepeat). It is a shortcut
 * for swiping down over and over, not a way to summon tiles: the hold stops
 * the moment a down move changes nothing, because a real swipe there would
 * not bring a tile in either. Other gestures are untouched.
 *
 * The switch sits under Tiles, in the same style, and is remembered per
 * device. Off by default.
 *
 * Wraps GameManager.prototype.move and actuate to learn whether the last move
 * did anything: upstream only actuates after a move that changed the board.
 * Loaded before application.js, which binds move once, at construction.
 */

(function () {
  "use strict";

  if (typeof GameManager === "undefined" ||
      typeof KeyboardInputManager === "undefined") return;

  var KEY = "2048-autofill";
  var on = false;
  var actuated = false;
  var lastMoved = false;

  try {
    on = localStorage.getItem(KEY) === "on";
  } catch (e) {
    on = false; // site data blocked: off, and the switch lasts the session
  }

  function store(value) {
    try {
      if (value) {
        localStorage.setItem(KEY, "on");
      } else {
        localStorage.removeItem(KEY);
      }
    } catch (e) {
      /* session-only */
    }
  }

  var actuate = GameManager.prototype.actuate;
  GameManager.prototype.actuate = function () {
    actuated = true;
    actuate.call(this);
  };

  var move = GameManager.prototype.move;
  GameManager.prototype.move = function (direction) {
    actuated = false;
    move.call(this, direction);
    lastMoved = actuated;
  };

  KeyboardInputManager.prototype.downRepeat = {
    enabled: function () { return on; },
    moved: function () { return lastMoved; }
  };

  function init() {
    var anchor = document.querySelector(".palette-switch") ||
                 document.querySelector(".game-switch");
    var container = document.querySelector(".container");
    if (!anchor && !container) return;

    // The Tiles switch's classes, so it inherits that look and its landscape
    // rule (hidden when the screen is short).
    var wrap = document.createElement("div");
    wrap.className = "palette-switch autofill-switch";

    var label = document.createElement("span");
    label.className = "palette-label";
    label.id = "autofill-label";
    label.textContent = "Auto-fill";

    var group = document.createElement("div");
    group.className = "seg";
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", "autofill-label");

    var buttons = {};
    [["off", "Off"], ["on", "On"]].forEach(function (pair) {
      var button = document.createElement("button");
      button.type = "button";
      button.id = "autofill-" + pair[0];
      button.textContent = pair[1];
      button.addEventListener("click", function () {
        var next = pair[0] === "on";
        if (next === on) return;
        on = next;
        store(on);
        render();
        try {
          if (navigator.vibrate) navigator.vibrate(8);
        } catch (e) {
          /* haptics off */
        }
      });
      buttons[pair[0]] = button;
      group.appendChild(button);
    });

    function render() {
      buttons.on.setAttribute("aria-pressed", String(on));
      buttons.off.setAttribute("aria-pressed", String(!on));
    }

    render();
    wrap.appendChild(label);
    wrap.appendChild(group);
    if (anchor) {
      anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    } else {
      container.appendChild(wrap);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
