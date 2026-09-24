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
 *
 *   Two boards, one row per player. On the classic page it shows best scores and
 *   2048 / 4096 counts; on the Dispatch page it shows today's run (the first
 *   attempt of the day, which dispatch.js records), with all-time bests and
 *   full runs under it. Each page writes only its own columns, and the upsert
 *   leaves the other page's columns as they were.
 */

(function () {
  "use strict";

  var ID_KEY = "2048-player-id";
  var NAME_KEY = "2048-player-name";
  var MODE = document.querySelector(".dispatch") ? "dispatch" : "classic";
  var PENDING_KEYS = {
    classic: "2048-pending-score",
    dispatch: "2048-pending-dispatch"
  };
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
  var run = { day: null, score: 0, shipped: 0, done: false, best: 0, runs: 0 };
  var footEl = null;
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
                          "wins_2048,wins_4096,dispatch_day,dispatch_score," +
                          "dispatch_shipped,dispatch_done,dispatch_best," +
                          "dispatch_runs&order=best.desc&limit=20"), {
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
    if (MODE === "dispatch") {
      return {
        player_id: playerId,
        name: playerName || "Player",
        dispatch_day: run.day,
        dispatch_score: run.score,
        dispatch_shipped: run.shipped,
        dispatch_done: run.done,
        dispatch_best: run.best,
        dispatch_runs: run.runs
      };
    }
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

  // One queued row per page, so an offline classic result and an offline
  // Dispatch result do not overwrite each other.
  function queue(row) {
    write(PENDING_KEYS[MODE], JSON.stringify(row));
  }

  function flushKey(key) {
    var raw = read(key);
    if (!raw) return Promise.resolve();
    var row;
    try {
      row = JSON.parse(raw);
    } catch (e) {
      write(key, null);
      return Promise.resolve();
    }
    return pushScore(row).then(function () {
      write(key, null);
    }, function () {
      /* still offline; keep it for next time */
    });
  }

  function flush() {
    return flushKey(PENDING_KEYS.classic).then(function () {
      return flushKey(PENDING_KEYS.dispatch);
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
    if (MODE === "dispatch") {
      run.best = Math.max(run.best, row.dispatch_best || 0);
      run.runs = Math.max(run.runs, row.dispatch_runs || 0);
      write("dispatch-first-best", String(run.best));
      write("dispatch-full-runs", String(run.runs));
      return;
    }
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

  // Until a player first reaches 2048 the row shows their highest tile. From
  // then on that tile is implied, and the row shows how many games reached
  // 2048 and 4096 instead, as chips in those tiles' colours. A zero count is
  // left out rather than drawn.
  function milestones(r) {
    var badges = [[2048, r.wins_2048], [4096, r.wins_4096]]
      .filter(function (m) { return m[1] > 0; })
      .map(function (m) {
        return '<span class="lb-badge" data-tile="' + m[0] + '">' +
               m[0] + " ×" + m[1] + "</span>";
      });
    if (!badges.length) {
      return '<span class="lb-tile">' + (r.best_tile || "—") + "</span>";
    }
    return '<span class="lb-badges">' + badges.join("") + "</span>";
  }

  /* ---- Dispatch board ---- */

  function today() {
    return window.Dispatch ? window.Dispatch.todaySeed() : null;
  }

  function loadRun() {
    var record = null;
    try {
      record = JSON.parse(read("dispatch-first") || "null");
    } catch (e) {
      record = null;
    }
    if (record) {
      run.day = record.seed;
      run.score = record.score || 0;
      run.shipped = record.shipped || 0;
      run.done = !!record.done;
    }
    run.best = Math.max(run.best, parseInt(read("dispatch-first-best") || "0", 10) || 0);
    run.runs = Math.max(run.runs, parseInt(read("dispatch-full-runs") || "0", 10) || 0);
  }

  function playedToday(r) {
    return !!r.dispatch_day && r.dispatch_day === today();
  }

  function runChip(r) {
    var total = window.Dispatch ? window.Dispatch.ORDER_COUNT : 8;
    if (!playedToday(r)) return '<span class="lb-none">not played yet</span>';
    var full = r.dispatch_done && r.dispatch_shipped === total;
    // An attempt still in progress shows where it stands, with a trailing
    // ellipsis so it does not read as final.
    return '<span class="lb-run' + (full ? " is-full" : "") + '">' +
           r.dispatch_shipped + "/" + total + (full ? " \u2713" : "") +
           (r.dispatch_done ? "" : " \u2026") + "</span>";
  }

  function renderDispatch(rows) {
    rows.sort(function (a, b) {
      var sa = playedToday(a) ? (a.dispatch_score || 0) : -1;
      var sb = playedToday(b) ? (b.dispatch_score || 0) : -1;
      return sb - sa;
    });

    listEl.innerHTML = rows.map(function (r, i) {
      var isMine = r.player_id === playerId;
      return '<li class="lb-row' + (isMine ? " is-me" : "") + '">' +
             '<span class="lb-rank">' + (i + 1) + "</span>" +
             '<span class="lb-name">' + esc(r.name || "Player") + "</span>" +
             runChip(r) +
             '<span class="lb-score">' +
               (playedToday(r) ? (r.dispatch_score || 0).toLocaleString() : "\u2014") +
             "</span></li>";
    }).join("");

    if (footEl) {
      var byBest = rows.slice().sort(function (a, b) {
        return (b.dispatch_best || 0) - (a.dispatch_best || 0);
      });
      footEl.textContent = "Best ever: " + byBest.map(function (r) {
        return (r.name || "Player") + " " + (r.dispatch_best || 0).toLocaleString();
      }).join(" \u00b7 ") + " \u00b7 Full runs: " + byBest.map(function (r) {
        return r.dispatch_runs || 0;
      }).join(" \u2013 ");
    }
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
    }

    if (MODE === "dispatch") {
      renderDispatch(rows);
      return;
    }
    rows.sort(function (a, b) { return (b.best || 0) - (a.best || 0); });

    listEl.innerHTML = rows.map(function (r, i) {
      var isMine = r.player_id === playerId;
      return '<li class="lb-row' + (isMine ? " is-me" : "") + '">' +
             '<span class="lb-rank">' + (i + 1) + "</span>" +
             '<span class="lb-name">' + esc(r.name || "Player") + "</span>" +
             milestones(r) +
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
    if (MODE === "dispatch") {
      var parts = (today() || "").split("-");
      var label = parts.length === 3
        ? new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString(undefined, {
            weekday: "short", month: "short", day: "numeric"
          })
        : "";
      panel.innerHTML =
        '<h2 class="lb-title"><span>Today\u2019s run</span><span>' + esc(label) +
        '</span></h2><ol class="lb-list"></ol><p class="lb-foot"></p>';
      footEl = panel.querySelector(".lb-foot");
    } else {
      panel.innerHTML =
        '<h2 class="lb-title">Leaderboard</h2><ol class="lb-list"></ol>';
    }
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
    if (MODE === "dispatch") {
      // Only Dispatch's own result: the classic hook would read Dispatch
      // boards as classic games and credit their scores and tiles there.
      loadRun();
      document.addEventListener("dispatch:result", function () {
        loadRun();
        syncSoon();
      });
    } else {
      hook();
    }
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
