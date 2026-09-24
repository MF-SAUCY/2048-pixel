/* Service worker — offline play.
 *
 * The whole game is a dozen small static files, so the shell is precached on
 * install and served cache-first. There is no network dependency at runtime:
 * once installed, the game works in a tunnel, on a plane, in airplane mode.
 *
 * CACHE is stamped by tools/stamp_sw.py from a fingerprint of everything under
 * app/, on every commit via the pre-commit hook; do not edit it by hand. Any
 * change to what ships renames it, and the old cache is dropped on activate.
 *
 * Two exceptions to cache-first, both about staleness:
 *
 *   Precaching bypasses the HTTP cache. GitHub Pages sends max-age=600, so a
 *   plain fetch during install can hand back a file from before the deploy
 *   and freeze it into the new version's cache.
 *
 *   The manifest is network-first. Chrome reads it through this worker when it
 *   installs or updates the app, and a cached copy once installed the app with
 *   the previous display mode. Offline, the cached copy still answers.
 */

var CACHE = "2048-pixel-b58bb5d0de";

var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./style/main.css",
  "./style/fonts/ClearSans-Light-webfont.woff",
  "./style/fonts/ClearSans-Regular-webfont.woff",
  "./style/fonts/ClearSans-Bold-webfont.woff",
  "./js/bind_polyfill.js",
  "./js/classlist_polyfill.js",
  "./js/animframe_polyfill.js",
  "./js/input_manager.js",
  "./js/html_actuator.js",
  "./js/grid.js",
  "./js/tile.js",
  "./js/local_storage_manager.js",
  "./js/game_manager.js",
  "./js/theme.js",
  "./js/palette.js",
  "./js/leaderboard-config.js",
  "./js/leaderboard.js",
  "./js/effects.js",
  "./js/back_guard.js",
  "./js/application.js",
  "./dispatch/",
  "./dispatch/index.html",
  "./dispatch/dispatch.css",
  "./dispatch/dispatch.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL.map(function (url) {
        return new Request(url, { cache: "reload" });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE ? null : caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  if (new URL(event.request.url).pathname.endsWith("/manifest.webmanifest")) {
    event.respondWith(
      fetch(event.request, { cache: "no-cache" }).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (hit) {
      if (hit) return hit;

      return fetch(event.request).then(function (response) {
        // Cache same-origin successes so a file added later is picked up too.
        if (response && response.ok && response.type === "basic") {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(event.request, copy);
          });
        }
        return response;
      }).catch(function () {
        // Offline and not in the cache: fall back to the shell for navigations.
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return Response.error();
      });
    })
  );
});
