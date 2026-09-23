/* Service worker — offline play.
 *
 * The whole game is a dozen small static files, so the shell is precached on
 * install and served cache-first. There is no network dependency at runtime:
 * once installed, the game works in a tunnel, on a plane, in airplane mode.
 *
 * Bump CACHE when any shell file changes — the old cache is dropped on activate.
 */

var CACHE = "2048-pixel-v15";

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
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
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
