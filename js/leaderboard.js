/* Two-player leaderboard.
 *
 * Talks to a Supabase table over plain REST — no SDK, no build step, one fetch
 * to read and one to write. See README.md for the table and its row policies.
 *
 * Design notes:
 *
 *   Degrades to nothing. With no config, no network, or a failing request, the
 *   panel hides and the game is untouched. The artifact build excludes this
 *   file entirely: that host blocks requests to third-party origins, so the
 *   leaderboard could only ever fail there.
 *
 *   Writes survive being offline. The installed app runs in airplane mode, so a
 *   score that cannot be sent is kept in localStorage and flushed on the next
 *   successful contact rather than lost.
 *
 *   Identity is a name you type, kept per device. There is no sign-in, so the
 *   board cannot prove who posted a score — with two players who know each
 *   other that is the right trade, and it is why nothing here is presented as
 *   authoritative.
 */

(function () {
  "use strict";

  var ID_KEY = "2048-player-id";
  var NAME_KEY = "2048-player-name";
  var PENDING_KEY = "2048-pending-score";
  var WINS_2048_KEY = "2048-wins-2048";
  var WINS_4096_KEY = "2048-wins-4096";
  var GAME_TOP_KEY = "2048-game-top";
  var REFRESH_MS = 60000;

  var config = window.LEADERBOARD_CONFIG || {};
  var configured = !!(config.url && config.anonKey);

  var playerId = null;
  var playerName = null;
  var panel = null;
  var listEl = null;
  var mine = { best: 0, games: 0, bestTile: 0, wins2048: 0, wins4096: 0 };
  var writeTimer = null;
  var refreshTimer = null;

  /* ---- storage helpers, all tolerant of blocked site data ---- */

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      /* session-only */
    }
  }

  function uuid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {
      /* fall through */
    }
    return "p-" + Date.now().toString(36) + "-" +
           Math.random().toString(36).slice(2, 10);
  }

  /* ---- REST ---- */

  function endpoint(path) {
    return config.url.replace(/\/+$/, "") + "/rest/v1/" + path;
  }

  function headers(extra) {
    var h = { apikey: config.anonKey };
    // A legacy anon key is a JWT and doubles as the bearer token. The newer
    // sb_publishable_ keys are not JWTs and belong in apikey alone.
    if (/^eyJ/.test(config.anonKey)) {
      h.Authorization = "Bearer " + config.anonKey;
    }
    for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  function fetchBoard() {
    return fetch(endpoint("scores?select=player_id,name,best,games,best_tile," +
                          "wins_2048,wins_4096" +
                          "&order=best.desc&limit=20"), {
      headers: headers({ Accept: "application/json" }),
      cache: "no-store"
    }).then(function (r) {
      if (!r.ok) throw new Error("read " + r.status);
      return r.json();
    });
  }

  function pushScore(row) {
    // resolution=merge-duplicates makes this an upsert on the primary key.
    return fetch(endpoint("scores"), {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify(row)
    }).then(function (r) {
      if (!r.ok) throw new Error("write " + r.status);
    });
  }

  /* ---- syncing ---- */

  function currentRow() {
    return {
      player_id: playerId,
      name: playerName || "Player",
      best: mine.best,
      games: mine.games,
      best_tile: mine.bestTile,
      wins_2048: mine.wins2048,
      wins_4096: mine.wins4096
    };
  }

  function queue(row) {
    write(PENDING_KEY, JSON.stringify(row));
  }

  function flush() {
    var raw = read(PENDING_KEY);
    if (!raw) return Promise.resolve();
    var row;
    try {
      row = JSON.parse(raw);
    } catch (e) {
      write(PENDING_KEY, null);
      return Promise.resolve();
    }
    return pushScore(row).then(function () {
      write(PENDING_KEY, null);
    }, function () {
      /* still offline; keep it for next time */
    });
  }

  function sync() {
    // No row until a name is saved; saving the name triggers the first sync.
    if (!configured || !playerId || !playerName) return;
    queue(currentRow());
    flush().then(refresh, refresh);
  }

  // Coalesce a burst — finishing a game can move several fields at once.
  function syncSoon() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(function () {
      writeTimer = null;
      sync();
    }, 1200);
  }

  function refresh() {
    if (!configured) return;
    fetchBoard().then(function (rows) {
      render(rows);
    }, function () {
      render(null);
    });
  }

  /* ---- rendering ---- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Every field only ever goes up, so where the table is ahead of this device
  // (a count set by hand in the dashboard, say) take the table's number rather
  // than overwriting it with a smaller one on the next write.
  function adopt(row) {
    mine.best = Math.max(mine.best, row.best || 0);
    mine.games = Math.max(mine.games, row.games || 0);
    mine.bestTile = Math.max(mine.bestTile, row.best_tile || 0);
    mine.wins2048 = Math.max(mine.wins2048, row.wins_2048 || 0);
    mine.wins4096 = Math.max(mine.wins4096, row.wins_4096 || 0);
    saveCounts();
  }

  function saveCounts() {
    write("2048-games", String(mine.games));
    write("2048-best-tile", String(mine.bestTile));
    write(WINS_2048_KEY, String(mine.wins2048));
    write(WINS_4096_KEY, String(mine.wins4096));
  }

  // A count of games that reached this tile, drawn as a chip in the tile's own
  // colour once there is at least one.
  function countCell(n, tile) {
    n = n || 0;
    return '<span class="lb-count' + (n ? " is-set" : "") +
           '" data-tile="' + tile + '">' + n + "</span>";
  }

  function render(rows) {
    if (!listEl) return;

    if (!playerName) {
      renderNamePrompt();
      return;
    }

    if (!rows) {
      // Offline or the table is unreachable: show what this device knows.
      rows = [currentRow()];
      listEl.setAttribute("data-offline", "true");
    } else {
      listEl.removeAttribute("data-offline");
      // Our own latest numbers may not have landed yet.
      var seen = false;
      rows = rows.map(function (r) {
        if (r.player_id === playerId) {
          seen = true;
          adopt(r);
          return currentRow();
        }
        return r;
      });
      if (!seen) rows.push(currentRow());
      rows.sort(function (a, b) { return (b.best || 0) - (a.best || 0); });
    }

    var head = '<li class="lb-head" aria-hidden="true"><span></span><span></span>' +
               "<span>2048</span><span>4096</span><span>Top</span>" +
               "<span>Best</span></li>";

    listEl.innerHTML = head + rows.map(function (r, i) {
      var isMine = r.player_id === playerId;
      return '<li class="lb-row' + (isMine ? " is-me" : "") + '">' +
             '<span class="lb-rank">' + (i + 1) + "</span>" +
             '<span class="lb-name">' + esc(r.name || "Player") +
               (isMine ? ' <span class="lb-you">you</span>' : "") + "</span>" +
             countCell(r.wins_2048, 2048) +
             countCell(r.wins_4096, 4096) +
             '<span class="lb-tile">' + (r.best_tile || "—") + "</span>" +
             '<span class="lb-score">' + (r.best || 0).toLocaleString() +
             "</span></li>";
    }).join("");
  }

  function renderNamePrompt() {
    listEl.innerHTML =
      '<li class="lb-setup">' +
        '<label for="lb-name-input">Name for the board</label>' +
        '<span class="lb-setup-row">' +
          '<input id="lb-name-input" type="text" maxlength="14" ' +
                 'autocomplete="off" placeholder="Joseph">' +
          '<button type="button" id="lb-name-save">Save</button>' +
        "</span>" +
      "</li>";

    var input = document.getElementById("lb-name-input");
    var save = document.getElementById("lb-name-save");

    function commit() {
      var value = (input.value || "").trim().slice(0, 14);
      if (!value) return;
      playerName = value;
      write(NAME_KEY, value);
      render(null);
      sync();
    }

    save.addEventListener("click", commit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
      e.stopPropagation(); // arrow keys belong to the input, not the board
    });
  }

  function build() {
    var board = document.querySelector(".game-container");
    if (!board || !board.parentNode) return false;

    panel = document.createElement("section");
    panel.className = "leaderboard";
    panel.innerHTML =
      '<h2 class="lb-title">Leaderboard</h2><ol class="lb-list"></ol>';
    board.parentNode.insertBefore(panel, board.nextSibling);
    listEl = panel.querySelector(".lb-list");
    return true;
  }

  /* ---- hook the game ---- */

  function highestTile(grid) {
    var top = 0;
    grid.cells.forEach(function (column) {
      column.forEach(function (cell) {
        if (cell && cell.value > top) top = cell.value;
      });
    });
    return top;
  }

  function hook() {
    if (typeof HTMLActuator === "undefined") return;

    var actuate = HTMLActuator.prototype.actuate;
    var lastScore = 0;
    var raw = read(GAME_TOP_KEY);
    var gameTop = raw === null ? null : (parseInt(raw, 10) || 0);

    HTMLActuator.prototype.actuate = function (grid, metadata) {
      actuate.call(this, grid, metadata);

      var changed = false;
      var top = highestTile(grid);

      if (top > mine.bestTile) {
        mine.bestTile = top;
        changed = true;
      }
      if (metadata.score > mine.best) {
        mine.best = metadata.score;
        changed = true;
      }
      // A finished game is the only thing that increments the count.
      if (metadata.terminated && metadata.over && metadata.score !== lastScore) {
        mine.games += 1;
        changed = true;
      }
      lastScore = metadata.score;

      // Tiles never shrink within a game, so a lower top tile than last time
      // means a new game began. The first time this runs there is no record,
      // and a game already in progress is taken as-is rather than counted, so
      // a 2048 already on the board is not credited as a fresh one.
      var prev = gameTop;
      if (prev === null) {
        prev = top;
      } else if (top < prev) {
        prev = 0;
      }
      if (top >= 2048 && prev < 2048) {
        mine.wins2048 += 1;
        changed = true;
      }
      if (top >= 4096 && prev < 4096) {
        mine.wins4096 += 1;
        changed = true;
      }
      if (top !== gameTop) {
        gameTop = top;
        write(GAME_TOP_KEY, String(gameTop));
      }

      if (changed) {
        saveCounts();
        syncSoon();
      }
    };
  }

  function init() {
    if (!configured) return; // nothing to show, and nothing to fail

    playerId = read(ID_KEY);
    if (!playerId) {
      playerId = uuid();
      write(ID_KEY, playerId);
    }
    playerName = read(NAME_KEY);
    mine.best = parseInt(read("bestScore") || "0", 10) || 0;
    mine.games = parseInt(read("2048-games") || "0", 10) || 0;
    mine.bestTile = parseInt(read("2048-best-tile") || "0", 10) || 0;
    mine.wins2048 = parseInt(read(WINS_2048_KEY) || "0", 10) || 0;
    mine.wins4096 = parseInt(read(WINS_4096_KEY) || "0", 10) || 0;

    if (!build()) return;
    hook();
    render(null);
    refresh();

    refreshTimer = setInterval(function () {
      if (!document.hidden) refresh();
    }, REFRESH_MS);

    window.addEventListener("online", function () {
      flush().then(refresh, refresh);
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
