/* Dispatch — a 2048 spinoff. Prototype.
 *
 * Classic 2048 asks for the biggest tile. Dispatch asks for the right one:
 *
 *   - Tiles slide and merge exactly as in 2048.
 *   - There is always one order: a value and an edge, e.g. "32 -> top". The two
 *     middle cells of that edge are its loading bays. When a swipe ends with a
 *     tile of the ordered value sitting in a bay, it ships: it leaves the board
 *     and the next order becomes active. One shipment per swipe.
 *   - The next two orders are always shown, as are the next three incoming
 *     tiles.
 *   - A run is 8 orders within 100 turns. A turn is any swipe that moves a tile
 *     or ships one; each turn brings one new tile.
 *   - Score: 100 per shipment, plus the unused turns if all 8 ship. Merges score
 *     nothing, so a 64 made too early is not progress, it is a 64 in the way.
 *   - The run ends when all 8 ship, when the turns run out, or when no swipe can
 *     move a tile or ship one.
 *
 * Every run is seeded by the date, and nothing in it is random at play time:
 * the orders, and each turn's incoming tile and where it lands, are fixed by the
 * seed and the turn number. Where a tile lands is the first empty cell in that
 * turn's fixed cell order, so two players who make the same moves get the same
 * game, and on the same day both face exactly the same run.
 *
 * Only the two middle cells of an edge are bays, so a tile parked in a corner
 * does not quietly qualify for two edges at once: delivering means bringing it
 * out.
 *
 * The movement code is upstream's GameManager, borrowed method by method, so a
 * swipe behaves exactly as it does in the classic game.
 */

(function (root) {
  "use strict";

  var SIZE = 4;
  var ORDER_COUNT = 8;
  var TURN_LIMIT = 100;
  var SHIP_POINTS = 100;
  // Order sizes as powers of two, lightly shuffled per day: 8, 8, 16, 16, 16,
  // 32, 32, 64 before shuffling.
  var LADDER = [3, 3, 4, 4, 4, 5, 5, 6];
  var EDGES = ["top", "right", "bottom", "left"];

  /* ---- seeded randomness ---- */

  function hashString(text) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }

  // mulberry32, keyed by seed and a label, so each use draws its own stream.
  function stream(seed, label) {
    var state = hashString(seed + "|" + label);
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, random) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function makeOrders(seed) {
    var random = stream(seed, "orders");
    var powers = LADDER.slice();

    // Nudge the ladder rather than scramble it: a few neighbour swaps, so it
    // still climbs but no two days climb the same way.
    for (var pass = 0; pass < 3; pass++) {
      for (var i = 0; i < powers.length - 1; i++) {
        if (random() < 0.35) {
          var tmp = powers[i];
          powers[i] = powers[i + 1];
          powers[i + 1] = tmp;
        }
      }
    }

    var orders = [];
    var lastEdge = null;
    powers.forEach(function (power) {
      var choices = EDGES.filter(function (edge) { return edge !== lastEdge; });
      var edge = choices[Math.floor(random() * choices.length)];
      orders.push({ value: Math.pow(2, power), edge: edge });
      lastEdge = edge;
    });
    return orders;
  }

  // The tile that arrives on a given turn, and the order of cells it tries.
  function supplyFor(seed, turn) {
    var random = stream(seed, "supply:" + turn);
    var value = random() < 0.9 ? 2 : 4;
    var cells = [];
    for (var i = 0; i < SIZE * SIZE; i++) cells.push(i);
    return { value: value, cells: shuffled(cells, random) };
  }

  function todaySeed(date) {
    date = date || new Date();
    var m = String(date.getMonth() + 1);
    var d = String(date.getDate());
    return date.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" +
           (d.length < 2 ? "0" + d : d);
  }

  function bayCells(edge) {
    switch (edge) {
      case "top":    return [{ x: 1, y: 0 }, { x: 2, y: 0 }];
      case "bottom": return [{ x: 1, y: 3 }, { x: 2, y: 3 }];
      case "left":   return [{ x: 0, y: 1 }, { x: 0, y: 2 }];
      default:       return [{ x: 3, y: 1 }, { x: 3, y: 2 }];
    }
  }

  /* ---- the game ---- */

  function DispatchManager(options) {
    this.size = SIZE;
    this.actuator = options.actuator;
    this.storage = options.storage;
    this.seedFor = options.seedFor || todaySeed;

    if (options.input) {
      options.input.on("move", this.move.bind(this));
      options.input.on("restart", this.restart.bind(this));
    }

    this.setup();
  }

  // Swipe mechanics exactly as upstream's.
  ["getVector", "buildTraversals", "findFarthestPosition", "movesAvailable",
   "tileMatchesAvailable", "positionsEqual", "prepareTiles", "moveTile"]
    .forEach(function (name) {
      if (root.GameManager) {
        DispatchManager.prototype[name] = root.GameManager.prototype[name];
      }
    });

  DispatchManager.prototype.setup = function () {
    var seed = this.seedFor();
    var saved = this.storage && this.storage.getGameState();

    if (saved && saved.seed === seed) {
      this.seed = saved.seed;
      this.grid = new Grid(saved.grid.size, saved.grid.cells);
      this.turn = saved.turn;
      this.shipped = saved.shipped;
      this.score = saved.score;
      this.over = saved.over;
      this.won = saved.won;
      this.reason = saved.reason || null;
    } else {
      this.seed = seed;
      this.grid = new Grid(this.size);
      this.turn = 0;
      this.shipped = 0;
      this.score = 0;
      this.over = false;
      this.won = false;
      this.reason = null;
      this.addSupply("start:0");
      this.addSupply("start:1");
    }

    this.orders = makeOrders(this.seed);
    this.shipment = null;
    this.actuate();
  };

  DispatchManager.prototype.restart = function () {
    if (this.storage) this.storage.clearGameState();
    if (this.actuator) this.actuator.continueGame();
    this.setup();
  };

  DispatchManager.prototype.isGameTerminated = function () {
    return this.over || this.won;
  };

  DispatchManager.prototype.addSupply = function (turn) {
    var supply = supplyFor(this.seed, turn);
    for (var i = 0; i < supply.cells.length; i++) {
      var index = supply.cells[i];
      var cell = { x: index % SIZE, y: Math.floor(index / SIZE) };
      if (this.grid.cellAvailable(cell)) {
        this.grid.insertTile(new Tile(cell, supply.value));
        return;
      }
    }
  };

  DispatchManager.prototype.activeOrder = function () {
    return this.orders[this.shipped] || null;
  };

  DispatchManager.prototype.findShipment = function () {
    var order = this.activeOrder();
    if (!order) return null;
    var cells = bayCells(order.edge);
    for (var i = 0; i < cells.length; i++) {
      var tile = this.grid.cellContent(cells[i]);
      if (tile && tile.value === order.value) return tile;
    }
    return null;
  };

  DispatchManager.prototype.move = function (direction) {
    var self = this;
    if (this.isGameTerminated()) return;

    var vector = this.getVector(direction);
    var traversals = this.buildTraversals(vector);
    var moved = false;

    this.prepareTiles();
    this.shipment = null;

    traversals.x.forEach(function (x) {
      traversals.y.forEach(function (y) {
        var cell = { x: x, y: y };
        var tile = self.grid.cellContent(cell);
        if (!tile) return;

        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);

        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];
          self.grid.insertTile(merged);
          self.grid.removeTile(tile);
          tile.updatePosition(positions.next);
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) moved = true;
      });
    });

    var cargo = this.findShipment();
    if (!moved && !cargo) return;

    if (cargo) {
      this.grid.removeTile(cargo);
      this.shipment = { tile: cargo, edge: this.activeOrder().edge };
      this.shipped += 1;
      this.score += SHIP_POINTS;
    }

    this.turn += 1;

    if (this.shipped === ORDER_COUNT) {
      this.won = true;
      this.score += TURN_LIMIT - this.turn;
    } else {
      this.addSupply(this.turn);
      if (this.turn >= TURN_LIMIT) {
        this.over = true;
        this.reason = "turns";
      } else if (!this.movesAvailable() && !this.findShipment()) {
        this.over = true;
        this.reason = "jammed";
      }
    }

    this.actuate();
  };

  DispatchManager.prototype.serialize = function () {
    return {
      seed: this.seed,
      grid: this.grid.serialize(),
      turn: this.turn,
      shipped: this.shipped,
      score: this.score,
      over: this.over,
      won: this.won,
      reason: this.reason
    };
  };

  DispatchManager.prototype.upcomingSupply = function (count) {
    var out = [];
    for (var i = 1; i <= count && this.turn + i <= TURN_LIMIT; i++) {
      out.push(supplyFor(this.seed, this.turn + i).value);
    }
    return out;
  };

  DispatchManager.prototype.actuate = function () {
    var best = 0;
    if (this.storage) {
      if (this.storage.getBestScore() < this.score) {
        this.storage.setBestScore(this.score);
      }
      best = this.storage.getBestScore();
      // Unlike classic, a finished run is kept, so reopening the app on the
      // same day shows the result rather than quietly starting over.
      this.storage.setGameState(this.serialize());
    }

    if (!this.actuator) return;
    this.actuator.actuate(this.grid, {
      score: this.score,
      bestScore: best,
      over: this.over,
      won: this.won,
      terminated: this.isGameTerminated(),
      reason: this.reason,
      seed: this.seed,
      orders: this.orders,
      shipped: this.shipped,
      turnsLeft: TURN_LIMIT - this.turn,
      upcoming: this.upcomingSupply(3),
      shipment: this.shipment
    });
  };

  /* ---- rendering ---- */

  function DispatchActuator() {
    HTMLActuator.call(this);
    this.board = document.querySelector(".game-container");
    this.orderList = document.querySelector(".dispatch-orders");
    this.statusEl = document.querySelector(".dispatch-status");
    this.nextEl = document.querySelector(".dispatch-next");
    this.dayEl = document.querySelector(".dispatch-day");
    this.bayBar = document.createElement("div");
    this.bayBar.className = "bay-bar";
    this.board.appendChild(this.bayBar);
    this.reason = null;
  }

  if (root.HTMLActuator) {
    DispatchActuator.prototype = Object.create(root.HTMLActuator.prototype);
    DispatchActuator.prototype.constructor = DispatchActuator;
  }

  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" ' +
              'fill="none" stroke="currentColor" stroke-width="2.6" ' +
              'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function chip(value) {
    return '<span class="order-chip" data-v="' + value + '" style="--c: var(--t' + value + ')">' +
           value + "</span>";
  }

  DispatchActuator.prototype.actuate = function (grid, meta) {
    var self = this;
    this.reason = meta.reason;
    // Goes through HTMLActuator.prototype.actuate at call time, so the merge
    // particles and haptics that effects.js hangs on it come along.
    HTMLActuator.prototype.actuate.call(this, grid, meta);

    window.requestAnimationFrame(function () {
      if (meta.shipment) self.addShipment(meta.shipment);
      self.renderOrders(meta);
      self.renderBays(meta);
      self.renderStatus(meta);
    });
  };

  // The shipped tile is drawn one last time: it slides or merges into the bay
  // like any other tile, then leaves through the edge.
  // A shipped tile that was merged this turn is drawn with its two halves
  // beneath it, as every merge is; all three leave together, or the halves
  // would be left behind in the bay once the merged tile had gone.
  DispatchActuator.prototype.addShipment = function (shipment) {
    var before = this.tileContainer.children.length;
    this.addTile(shipment.tile);
    var added = Array.prototype.slice.call(this.tileContainer.children, before);
    added.forEach(function (wrapper) {
      wrapper.classList.add("tile-shipping");
      var inner = wrapper.querySelector(".tile-inner");
      if (inner) {
        inner.setAttribute("data-edge", shipment.edge);
        inner.classList.add("is-shipping");
      }
    });
    try {
      if (navigator.vibrate) navigator.vibrate([10, 40, 18]);
    } catch (e) {
      /* haptics refused */
    }
  };

  DispatchActuator.prototype.renderOrders = function (meta) {
    var html = "";
    for (var i = 0; i < 3; i++) {
      var order = meta.orders[meta.shipped + i];
      if (!order) break;
      html += '<li class="order' + (i === 0 ? " is-active" : "") + '">' +
              chip(order.value) +
              '<span class="order-edge" data-edge="' + order.edge + '">' + ARROW +
              '<span class="order-edge-label">' + order.edge + "</span></span></li>";
    }
    if (!html) html = '<li class="order is-done">All orders shipped</li>';
    this.orderList.innerHTML = html;
  };

  DispatchActuator.prototype.renderBays = function (meta) {
    var cells = this.board.querySelectorAll(".grid-cell");
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove("is-bay");
      cells[i].style.removeProperty("--c");
    }

    var order = meta.orders[meta.shipped];
    if (!order || meta.terminated) {
      this.bayBar.removeAttribute("data-edge");
      return;
    }

    var colour = "var(--t" + order.value + ")";
    bayCells(order.edge).forEach(function (cell) {
      var el = this.board.querySelector('.grid-cell[data-row="' + (cell.y + 1) +
                                         '"][data-col="' + (cell.x + 1) + '"]');
      if (el) {
        el.classList.add("is-bay");
        el.style.setProperty("--c", colour);
      }
    }, this);
    this.bayBar.setAttribute("data-edge", order.edge);
    this.bayBar.style.setProperty("--c", colour);
  };

  DispatchActuator.prototype.renderStatus = function (meta) {
    this.statusEl.innerHTML =
      "<span><b>" + meta.shipped + "</b>/" + meta.orders.length + " shipped</span>" +
      "<span><b>" + meta.turnsLeft + "</b> turns left</span>";

    this.nextEl.innerHTML = meta.upcoming.length
      ? '<span class="next-label">Next</span>' + meta.upcoming.map(function (v) {
          return '<span class="next-chip" data-v="' + v + '" style="--c: var(--t' + v + ')">' + v + "</span>";
        }).join("")
      : "";

    if (this.dayEl) {
      var parts = meta.seed.split("-");
      var date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      this.dayEl.textContent = "Run for " + date.toLocaleDateString(undefined, {
        weekday: "short", month: "short", day: "numeric"
      });
    }
  };

  DispatchActuator.prototype.message = function (won) {
    var type = won ? "game-won" : "game-over";
    var text = won ? "All shipped!"
             : this.reason === "turns" ? "Out of turns"
             : "Jammed";
    this.messageContainer.classList.add(type);
    this.messageContainer.getElementsByTagName("p")[0].textContent = text;
  };

  /* ---- exports and start-up ---- */

  function start() {
    var storage = new LocalStorageManager();
    storage.bestScoreKey = "dispatch-best";
    storage.gameStateKey = "dispatch-state";
    // Kept on Dispatch.game for poking at from the console.
    root.Dispatch.game = new DispatchManager({
      actuator: new DispatchActuator(),
      storage: storage,
      input: new KeyboardInputManager()
    });
    return root.Dispatch.game;
  }

  root.Dispatch = {
    DispatchManager: DispatchManager,
    DispatchActuator: DispatchActuator,
    start: start,
    makeOrders: makeOrders,
    supplyFor: supplyFor,
    bayCells: bayCells,
    todaySeed: todaySeed,
    ORDER_COUNT: ORDER_COUNT,
    TURN_LIMIT: TURN_LIMIT
  };

  // Wait for the first frame, as classic does, so the board renders cleanly.
  if (typeof document !== "undefined" && document.querySelector(".dispatch")) {
    window.requestAnimationFrame(start);
  }
})(typeof window !== "undefined" ? window : globalThis);
