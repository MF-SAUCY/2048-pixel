/* Back-gesture guard.
 *
 * Android's back gesture is a swipe in from either screen edge — the same
 * motion as a left or right move started near the edge. A page cannot turn the
 * gesture off, but it can decide what "back" lands on: with one extra history
 * entry on top, the first back pops that entry instead of leaving the app.
 *
 * So one back does nothing to the game and says "Swipe back again to leave";
 * a second back, with no move in between, leaves as usual. Any move re-arms it.
 *
 * Chrome skips history entries a page added without a user gesture when the
 * back gesture walks history (so pages cannot trap people), which is why the
 * guard is only ever pushed from inside an input event — never on load and
 * never from the popstate handler itself.
 *
 * Excluded from the single-file bundle: inside the artifact host's iframe the
 * entry would sit in the host page's history instead. The game state lives in
 * localStorage either way, so even a real exit loses nothing.
 */

(function () {
  "use strict";

  if (!window.history || !history.pushState) return;

  var TOAST_MS = 2600;
  var toast = null;
  var toastTimer = null;

  function armed() {
    return !!(history.state && history.state.backGuard);
  }

  function arm() {
    if (armed()) return;
    try {
      history.pushState({ backGuard: true }, "");
    } catch (e) {
      /* history unavailable; the gesture simply behaves as it would anyway */
    }
    hideToast();
  }

  function showToast() {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "back-toast";
      toast.setAttribute("role", "status");
      toast.textContent = "Swipe back again to leave";
      document.body.appendChild(toast);
    }
    // Force a frame between insertion and the visible class so it fades in.
    void toast.offsetWidth;
    toast.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toast) toast.classList.remove("is-shown");
  }

  // The events that count as a user gesture for history purposes.
  ["pointerup", "touchend", "mousedown", "keydown"].forEach(function (type) {
    document.addEventListener(type, arm, true);
  });

  window.addEventListener("popstate", function () {
    if (!armed()) showToast();
  });
})();
