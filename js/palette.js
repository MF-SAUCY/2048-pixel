/* Tile palette switch — the custom gradient, or upstream's original.
 *
 * Stamps data-palette="original" on the root element; the stylesheet does the
 * rest. Lives in the footer rather than beside New Game: it is a preference you
 * set once, not a control you reach for mid-game, and the action row has no
 * space left at 412px.
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

  function init() {
    var current = stored();
    apply(current);

    var footer = document.querySelector(".game-credit");
    if (!footer || !footer.parentNode) return;

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
        try {
          if (navigator.vibrate) navigator.vibrate(8);
        } catch (e) {
          /* haptics off */
        }
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
    // Under the Classic / Dispatch switch when the page has one, so the two
    // preferences sit together.
    var anchor = document.querySelector(".game-switch") || footer;
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
