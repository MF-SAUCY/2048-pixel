/* The menu button, beside New Game on every page.
 *
 * It replaced the Game switch under the board (2026-10-20), giving the board
 * that row back. The menu lists the five games, the current one marked, then
 * whatever the page's other scripts add with GameMenu.add: the theme switch
 * (theme.js) everywhere, How to play (how_to_play.js) on Fib, Threes and
 * 🐢48, and on classic the Tiles and Auto-fill settings (palette.js,
 * autofill.js), which flip in place and show their value.
 *
 * While it is open, a tap or swipe outside closes it and goes no further, so
 * dismissing the menu never moves tiles. Escape closes it too.
 *
 * Not in the claude.ai bundle: that copy is classic alone.
 */

(function () {
  "use strict";

  var GAMES = [
    { mode: "classic", label: "Classic", path: "" },
    { mode: "dispatch", label: "Dispatch", path: "dispatch/" },
    { mode: "fib", label: "Fib", path: "fib/" },
    { mode: "threes", label: "Threes", path: "threes/" },
    { mode: "turtle", label: "🐢48", path: "turtle/" }
  ];

  var BARS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>';

  var items = [];
  var button = null;
  var panel = null;

  function currentMode() {
    for (var i = 1; i < GAMES.length; i++) {
      if (document.querySelector(".container." + GAMES[i].mode)) return GAMES[i].mode;
    }
    return "classic";
  }

  function render() {
    var mode = currentMode();
    var base = mode === "classic" ? "./" : "../";
    var html = "";
    GAMES.forEach(function (game) {
      var here = game.mode === mode;
      html += '<a class="menu-item" href="' + (here ? "./" : base + game.path) + '"' +
              (here ? ' aria-current="page"' : "") + ">" + game.label + "</a>";
    });
    if (items.length) html += '<hr class="menu-rule">';
    panel.innerHTML = html;

    items.forEach(function (item, i) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "menu-item";
      row.setAttribute("data-item", i);
      row.innerHTML = '<span class="menu-icon">' + item.icon() + "</span>" + item.label() +
        (item.value ? '<span class="menu-value">' + item.value() + "</span>" : "");
      row.addEventListener("click", function () {
        // A setting flips in place, so the new value shows; anything else
        // closes the menu first.
        if (item.stay) {
          item.run();
          render();
          var again = panel.querySelector('[data-item="' + i + '"]');
          if (again) again.focus();
          return;
        }
        close(false);
        item.run();
      });
      panel.appendChild(row);
    });
  }

  // Outside the menu, a gesture closes it and stops at the window, before the
  // input manager on the document sees it. The click that ends that gesture
  // is swallowed too, so a tap on New Game only closes the menu.
  var swallowClick = false;

  function outside(event) {
    if (panel.contains(event.target) || button.contains(event.target)) return;
    event.stopPropagation();
    if (event.type === "pointerdown" || event.type === "touchstart") {
      swallowClick = true;
      close(false);
    }
  }

  function onClick(event) {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close(true);
  }

  var GUARDED = ["pointerdown", "pointerup", "touchstart", "touchend"];

  function open() {
    render();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    GUARDED.forEach(function (type) {
      window.addEventListener(type, outside, true);
    });
    window.addEventListener("keydown", onKey, true);
  }

  function close(refocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    GUARDED.forEach(function (type) {
      window.removeEventListener(type, outside, true);
    });
    window.removeEventListener("keydown", onKey, true);
    // The swallowed click follows its pointerup; give it a moment to arrive.
    setTimeout(function () { swallowClick = false; }, 400);
    if (refocus) button.focus();
  }

  function init() {
    var row = document.querySelector(".above-game");
    if (!row) return;

    button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle menu-button";
    button.innerHTML = BARS;
    button.setAttribute("aria-label", "Menu");
    button.setAttribute("title", "Menu");
    button.setAttribute("aria-haspopup", "true");
    button.setAttribute("aria-expanded", "false");

    panel = document.createElement("div");
    panel.className = "menu-panel";
    panel.hidden = true;

    button.addEventListener("click", function () {
      if (panel.hidden) {
        open();
      } else {
        close(false);
      }
    });

    row.appendChild(button);
    row.appendChild(panel);
    window.addEventListener("click", onClick, true);
  }

  window.GameMenu = {
    // item: { label: fn -> text, icon: fn -> svg or text, run: fn, first,
    //         value: fn -> text shown at the right, stay: flip in place }
    add: function (item) {
      if (item.first) {
        items.unshift(item);
      } else {
        items.push(item);
      }
    },
    focus: function () {
      if (button) button.focus();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
