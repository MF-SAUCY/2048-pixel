/* How to play, for Fib, Threes and 🐢48.
 *
 * How to play, first in the menu (game_menu.js), opens a short rules card
 * over the board; "Got it", Escape or a tap outside the card closes it. While
 * it is open, swipes and keys go to the card, not the game: a capture listener on
 * the window stops them before the input manager, which listens on the
 * document, ever sees them.
 *
 * The page picks its card by its container class. Classic and Dispatch do not
 * load this file.
 */

(function () {
  "use strict";

  var CARDS = {
    fib: [
      "Swipe to slide every tile. Two tiles merge when they are " +
        "<b>next to each other in the Fibonacci sequence</b>: 1 + 1 = 2, " +
        "1 + 2 = 3, 2 + 3 = 5, 3 + 5 = 8…",
      "Apart from the 1s, matching tiles do not merge.",
      "New tiles are 1s and 2s. Reach <b>2584</b> to win."
    ],
    threes: [
      "Each swipe moves tiles <b>one step</b>.",
      "<b>1 + 2 = 3.</b> From 3 up, matching tiles merge: 3 + 3 = 6, " +
        "6 + 6 = 12…",
      "A new tile slides in on the edge you swiped away from. <b>Next</b> " +
        "shows its colour; <b>+</b> is a bonus tile.",
      "Tiles of 3 and up score, bigger ones far more. It ends when nothing " +
        "can move."
    ],
    turtle: [
      "Swipe <b>up, down or along a diagonal</b>: six directions, and no " +
        "plain left or right. A sideways swipe goes up or down its diagonal " +
        "by its angle.",
      "The pad moves too; <b>hold</b> a wedge or a swipe to repeat it. " +
        "<b>Lock</b>: tap it, tap the directions to block, tap it again. " +
        "Tap it twice to clear the locks.",
      "Matching tiles merge, as in 2048. Reach <b>2048</b> to win.",
      "Each new game brings a different turtle."
    ]
  };

  function init() {
    var mode = null;
    Object.keys(CARDS).forEach(function (name) {
      if (document.querySelector(".container." + name)) mode = name;
    });
    var board = document.querySelector(".game-container");
    if (!mode || !board || !window.GameMenu) return;

    var card = document.createElement("div");
    card.className = "howto";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "How to play");
    card.hidden = true;
    card.innerHTML =
      '<div class="howto-card"><h2>How to play</h2>' +
      CARDS[mode].map(function (line) { return "<p>" + line + "</p>"; }).join("") +
      '<button type="button" class="howto-close">Got it</button></div>';
    board.appendChild(card);

    var close = card.querySelector(".howto-close");

    // Everything but the card's own button stops at the window while it is
    // open, so nothing reaches the game underneath.
    function swallow(event) {
      if (event.type === "keydown") {
        // No key reaches the game. Enter and Space still press "Got it",
        // and Tab still moves focus.
        event.stopPropagation();
        var presses = event.target === close &&
                      (event.key === "Enter" || event.key === " ");
        if (!presses && event.key !== "Tab") event.preventDefault();
        if (event.key === "Escape") hide();
        return;
      }
      var inCard = card.querySelector(".howto-card").contains(event.target);
      if (event.type === "click") {
        // "Got it" needs its click; a click anywhere else closes the card.
        if (inCard) return;
        event.preventDefault();
        event.stopPropagation();
        hide();
        return;
      }
      event.stopPropagation();
    }

    var EVENTS = ["keydown", "pointerdown", "pointerup", "touchstart", "touchend", "click"];

    function show() {
      card.hidden = false;
      EVENTS.forEach(function (type) {
        window.addEventListener(type, swallow, true);
      });
      close.focus();
    }

    function hide() {
      card.hidden = true;
      EVENTS.forEach(function (type) {
        window.removeEventListener(type, swallow, true);
      });
      window.GameMenu.focus();
    }

    window.GameMenu.add({
      first: true,
      label: function () { return "How to play"; },
      icon: function () { return "?"; },
      run: show
    });
    close.addEventListener("click", hide);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
