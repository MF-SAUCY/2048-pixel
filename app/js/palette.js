/* Tile palette switch — the custom gradient, or upstream's original.
 *
 * Stamps data-palette="original" on the root element; the stylesheet does the
 * rest. A row in the menu (game_menu.js) that flips in place; in the
 * single-file bundle, which has no menu, a switch at the foot of the page.
 *
 * Unlike theme.js this ships everywhere, including the single-file bundle. A
 * host may own the page's light/dark theme, but nothing outside the game has an
 * opinion about which tile ramp it uses.
 */

(function () {
  "use strict";

  var KEY = "2048-palette";

  function stored() {
    try {
      return localStorage.getItem(KEY) === "original" ? "original" : "custom";
    } catch (e) {
      return "custom"; // private window, or site data blocked
    }
  }

  function store(value) {
    try {
      if (value === "original") {
        localStorage.setItem(KEY, value);
      } else {
        localStorage.removeItem(KEY);
      }
    } catch (e) {
      /* the switch still works for this session, it just will not persist */
    }
  }

  function apply(value) {
    if (value === "original") {
      document.documentElement.setAttribute("data-palette", "original");
    } else {
      document.documentElement.removeAttribute("data-palette");
    }
  }

  var GRID = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<rect x="3" y="3" width="8" height="8" rx="1.5"/>' +
    '<rect x="13" y="3" width="8" height="8" rx="1.5"/>' +
    '<rect x="3" y="13" width="8" height="8" rx="1.5"/>' +
    '<rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>';

  function buzz() {
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (e) {
      /* haptics off */
    }
  }

  function init() {
    var current = stored();
    apply(current);

    if (window.GameMenu) {
      window.GameMenu.add({
        stay: true,
        label: function () { return "Tiles"; },
        value: function () { return current === "custom" ? "Custom" : "Original"; },
        icon: function () { return GRID; },
        run: function () {
          current = current === "custom" ? "original" : "custom";
          store(current);
          apply(current);
          buzz();
        }
      });
      return;
    }

    // No menu (the bundle): at the foot of the page, under the board.
    var container = document.querySelector(".container");
    if (!container) return;

    var wrap = document.createElement("div");
    wrap.className = "palette-switch";

    var label = document.createElement("span");
    label.className = "palette-label";
    label.id = "palette-label";
    label.textContent = "Tiles";

    var group = document.createElement("div");
    group.className = "seg";
    group.setAttribute("role", "group");
    group.setAttribute("aria-labelledby", "palette-label");

    var buttons = {};

    ["custom", "original"].forEach(function (name) {
      var button = document.createElement("button");
      button.type = "button";
      button.id = "palette-" + name;
      button.textContent = name === "custom" ? "Custom" : "Original";
      button.addEventListener("click", function () {
        if (current === name) return;
        current = name;
        store(name);
        apply(name);
        render();
        buzz();
      });
      buttons[name] = button;
      group.appendChild(button);
    });

    function render() {
      Object.keys(buttons).forEach(function (name) {
        buttons[name].setAttribute("aria-pressed", String(current === name));
      });
    }

    render();
    wrap.appendChild(label);
    wrap.appendChild(group);
    container.appendChild(wrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
