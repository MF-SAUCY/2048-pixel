/* Day / night toggle.
 *
 * Three states, not two. With nothing stored the page follows the system, which
 * on a Pixel means it follows Android's scheduled dark theme and goes dark at
 * sunset on its own. Tapping the toggle stores an explicit choice that overrides
 * the system in both directions; the stylesheet handles that via
 * :root[data-theme] taking precedence over the prefers-color-scheme block.
 *
 * The button is built here rather than in the markup so that hosts which own the
 * page theme — the artifact host stamps data-theme itself — get the themed game
 * without a control that would fight them for it.
 */

(function () {
  "use strict";

  var KEY = "2048-theme";
  var DARK_GROUND = "#14110e";
  var LIGHT_GROUND = "#faf8ef";

  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (e) {
      return null; // private window, or site data blocked
    }
  }

  function store(value) {
    try {
      if (value) {
        localStorage.setItem(KEY, value);
      } else {
        localStorage.removeItem(KEY);
      }
    } catch (e) {
      /* the toggle still works for this session, it just will not persist */
    }
  }

  function systemPrefersDark() {
    return !!(window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function effective() {
    return stored() || (systemPrefersDark() ? "dark" : "light");
  }

  function apply(theme) {
    var root = document.documentElement;

    if (theme) {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }

    // Colours the browser UI to match the board. There are two of these tags,
    // scoped to prefers-color-scheme; writing the effective colour into both
    // makes whichever one currently matches the right one, so an explicit
    // choice beats the media queries without any tags being added or removed.
    //
    // This has no effect inside an installed WebAPK: that status bar colour is
    // baked from the manifest at install time and does not repaint at runtime
    // (crbug.com/40634649), so the installed app keeps the manifest's
    // near-black status bar in both themes.
    var color = effective() === "dark" ? DARK_GROUND : LIGHT_GROUND;
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute("content", color);
    }
  }

  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4.2"/>' +
    '<path d="M12 2.4v2.2M12 19.4v2.2M4.2 12H2M22 12h-2.2' +
    'M6.5 6.5 4.9 4.9M19.1 19.1l-1.6-1.6M17.5 6.5l1.6-1.6M4.9 19.1l1.6-1.6"/>' +
    '</svg>';

  var MOON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M20.3 14.4A8.5 8.5 0 0 1 9.6 3.7a8.5 8.5 0 1 0 10.7 10.7z"/>' +
    '</svg>';

  function init() {
    apply(stored());

    var row = document.querySelector(".above-game");
    var restart = document.querySelector(".restart-button");
    if (!row || !restart) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.id = "theme-toggle";

    function render() {
      var dark = effective() === "dark";
      // Show the destination, not the current state: the sun is what you get.
      button.innerHTML = dark ? SUN : MOON;
      button.setAttribute("aria-label",
        dark ? "Switch to day colours" : "Switch to night colours");
      button.setAttribute("title", button.getAttribute("aria-label"));
    }

    button.addEventListener("click", function () {
      var next = effective() === "dark" ? "light" : "dark";
      store(next);
      apply(next);
      render();

      try {
        if (navigator.vibrate) navigator.vibrate(8);
      } catch (e) {
        /* haptics off */
      }
    });

    render();
    row.insertBefore(button, restart);

    // Follow the system while no explicit choice is stored, so Android's
    // sunset schedule still moves the page after the first launch.
    if (window.matchMedia) {
      var query = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () {
        if (!stored()) {
          apply(null);
          render();
        }
      };
      if (query.addEventListener) {
        query.addEventListener("change", onChange);
      } else if (query.addListener) {
        query.addListener(onChange);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
