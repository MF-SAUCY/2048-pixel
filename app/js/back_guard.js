/* Back-gesture guard.
 *
 * Android's back gesture is a swipe in from either screen edge — the same
 * motion as a left or right move started near the edge. A page cannot turn the
 * gesture off, but it can catch it: one back does nothing to the game and says
 * "Swipe back again to leave"; a second back, with no move in between, leaves
 * as usual. Any move or tap re-arms it.
 *
 * Two ways to catch it, best first:
 *
 *   CloseWatcher (Chrome 120+). The back gesture closes the watcher instead of
 *   navigating, so history is never touched. A page may hold one watcher
 *   without a user gesture, so the guard is armed from the moment the page
 *   loads; after that, each new watcher needs a gesture, which is why re-arming
 *   happens inside input events.
 *
 *   A history entry, where CloseWatcher is missing. One extra entry on top, so
 *   the first back pops it rather than leaving. Chrome skips entries a page
 *   added without a user gesture (so pages cannot trap people), so this can only
 *   arm from inside an input event — a back before the first move still exits.
 *
 * Excluded from the single-file bundle: inside the artifact host's iframe the
 * guard would act on the host page instead. The game state lives in
 * localStorage either way, so even a real exit loses nothing.
 */

(function () {
  "use strict";

  var TOAST_MS = 2600;
  var toast = null;
  var toastTimer = null;

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

  /* ---- CloseWatcher ---- */

  var watcher = null;
  var closedAt = 0;

  // Nothing may re-arm the guard in the instant after it caught a back, so an
  // input event that rides along with the gesture cannot turn one back into a
  // trap; the second back must always get out.
  var REARM_GAP_MS = 500;

  function armWatcher() {
    if (watcher) return;
    if (Date.now() - closedAt < REARM_GAP_MS) return;
    try {
      watcher = new CloseWatcher();
    } catch (e) {
      watcher = null;
      return;
    }
    watcher.addEventListener("close", function () {
      watcher = null;
      closedAt = Date.now();
      showToast();
    });
    hideToast();
  }

  /* ---- history fallback ---- */

  function historyArmed() {
    return !!(history.state && history.state.backGuard);
  }

  function armHistory() {
    if (historyArmed()) return;
    try {
      history.pushState({ backGuard: true }, "");
    } catch (e) {
      return;
    }
    hideToast();
  }

  var arm;
  if (typeof window.CloseWatcher === "function") {
    arm = armWatcher;
    arm(); // the one watcher a page may hold before any gesture
  } else if (window.history && history.pushState) {
    arm = armHistory;
    window.addEventListener("popstate", function () {
      if (!historyArmed()) showToast();
    });
  } else {
    return;
  }

  // The events that count as a user gesture. Escape is left out: on a keyboard
  // it is itself the close request, so letting it re-arm would mean every
  // Escape is caught and none ever gets through.
  ["pointerup", "touchend", "mousedown", "keydown"].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (event.key === "Escape") return;
      arm();
    }, true);
  });
})();
