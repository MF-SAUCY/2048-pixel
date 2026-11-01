/* 🐢48's egg mode (nest.html): plain 🐢48 with a nest, eggs and six slots on
 * the turtle's back, so a long game need not end because the board fills
 * with big tiles. Rules agreed 2026-10-31, after tools/sim_nest.js:
 *
 *   - The nest is the tail cell (bottom middle). A 2048 sitting on it can be
 *     laid: tap it. It leaves the board, and the player chooses what the egg
 *     becomes: an undo, or a new slot on the turtle's back (up to six).
 *   - Tap an empty slot, then a tile of 2048 or more, to carry the tile. A
 *     carried tile is not frozen: when a move leaves a matching tile on the
 *     board, it jumps up and merges into the carried one, scoring as a merge,
 *     and carried tiles that become equal merge too, freeing a slot. This
 *     happens before the new tile appears.
 *   - A tile on the nest never jumps up (2026-11-01: a carried 2048 was
 *     swallowing every new 2048 before it could be laid). Tapping it instead
 *     offers to send it up when it matches a carried tile, beside laying it
 *     when it is a 2048.
 *   - Undo takes back the last move (the replay draws a fresh tile). Laying,
 *     carrying and sending up cannot be undone, and clear the move they follow.
 *   - With no move left, the game waits while an undo, a lay, a send or a
 *     carry could still help; only then is it over. There is no 2048 win.
 *
 * Its own saved game and best score (nest-state, nest-best) and its own
 * leaderboard columns (nest_best, nest_top). Built on turtle.js.
 */

(function (root) {
  "use strict";

  var T = root.Turtle;
  if (!T) return;

  var NEST = { x: 2, y: 4 };  // the tail cell
  var SLOT_CAP = 6;
  // Shown small at the foot of the page, so a phone can be checked against
  // the latest deploy while the mode is being tested. Bump it with every
  // change to the mode: 1 first release, 2 the nest never jumps up, 3 this
  // line, 4 turning the turtle and the turtles' new movements.
  var VERSION = 4;
  var EGG = 2048;             // what can be laid
  var CARRY_MIN = 2048;       // what can be carried

  /* ---- the game ---- */

  function NestManager(size, InputManager, Actuator, StorageManager) {
    T.TurtleManager.call(this, size, InputManager, Actuator, StorageManager);
  }

  NestManager.prototype = Object.create(T.TurtleManager.prototype);
  NestManager.prototype.constructor = NestManager;

  NestManager.prototype.setup = function () {
    var s = this.storageManager.getGameState();
    var saved = s && s.hex && s.nest;
    this.slots = saved ? s.slots.slice() : [];  // 0 an empty slot, else a carried tile
    this.undos = saved ? s.undos : 0;
    this.laid = saved ? s.laid : 0;
    this.history = saved ? s.history || null : null;
    this.stuck = false;
    this.jumped = [];
    T.TurtleManager.prototype.setup.call(this);
  };

  // No 2048 win here: the game only ends when it is over.
  NestManager.prototype.isGameTerminated = function () {
    return this.over;
  };

  // The state an undo goes back to.
  NestManager.prototype.snapshot = function () {
    return {
      grid: this.grid.serialize(),
      score: this.score,
      moves: this.moves,
      won: this.won,
      slots: this.slots.slice(),
      laid: this.laid
    };
  };

  NestManager.prototype.serialize = function () {
    var s = T.TurtleManager.prototype.serialize.call(this);
    s.nest = 1;
    s.slots = this.slots.slice();
    s.undos = this.undos;
    s.laid = this.laid;
    s.history = this.history;
    return s;
  };

  NestManager.prototype.move = function (direction) {
    if (this.over) return;
    var previous = this.history;
    this.history = this.snapshot();
    this.jumped = [];
    T.TurtleManager.prototype.move.call(this, direction);
    if (!this.lastMoved) this.history = previous;
  };

  NestManager.prototype.afterSlide = function () {
    this.settle();
  };

  // Board tiles that match a carried tile jump up and merge into it, except
  // the one on the nest, which waits to be laid or sent up; carried tiles
  // that become equal merge, the left one keeping the tile. Repeats until
  // nothing more matches.
  NestManager.prototype.settle = function () {
    var changed = true;
    while (changed) {
      changed = false;
      for (var s = 0; s < this.slots.length; s++) {
        var value = this.slots[s];
        if (!value) continue;
        var match = null;
        this.grid.eachCell(function (x, y, tile) {
          var onNest = x === NEST.x && y === NEST.y;
          if (!match && tile && tile.value === value && !onNest) match = tile;
        });
        if (match) {
          this.grid.removeTile(match);
          this.slots[s] = value * 2;
          this.score += value * 2;
          this.jumped.push(s);
          changed = true;
        }
      }
      for (var i = 0; i < this.slots.length; i++) {
        for (var j = i + 1; j < this.slots.length; j++) {
          if (this.slots[i] && this.slots[i] === this.slots[j]) {
            this.slots[i] *= 2;
            this.slots[j] = 0;
            this.score += this.slots[i];
            this.jumped.push(i);
            changed = true;
          }
        }
      }
    }
  };

  NestManager.prototype.layable = function () {
    var tile = this.grid.cellContent(NEST);
    return !!(tile && tile.value === EGG);
  };

  // The slot holding a carried match for the tile on the nest, or -1.
  NestManager.prototype.sendSlot = function () {
    var tile = this.grid.cellContent(NEST);
    return tile ? this.slots.indexOf(tile.value) : -1;
  };

  NestManager.prototype.freeSlot = function () {
    return this.slots.indexOf(0);
  };

  NestManager.prototype.carryable = function () {
    var out = [];
    this.grid.eachCell(function (x, y, tile) {
      if (tile && tile.value >= CARRY_MIN) out.push(tile);
    });
    return out;
  };

  NestManager.prototype.canUndo = function () {
    return this.undos > 0 && !!this.history;
  };

  NestManager.prototype.canRescue = function () {
    return this.canUndo() || this.layable() || this.sendSlot() !== -1 ||
           (this.freeSlot() !== -1 && this.carryable().length > 0);
  };

  NestManager.prototype.checkOver = function () {
    this.stuck = false;
    if (this.movesAvailable()) return;
    if (this.canRescue()) {
      this.stuck = true;
    } else {
      this.over = true;
    }
  };

  // After a lay, carry or undo: tiles stay where they are (no slide or merge
  // replays), and the end-of-move check runs again.
  NestManager.prototype.afterAction = function () {
    this.prepareTiles();
    this.checkOver();
    this.actuate();
  };

  // choice: "undo" or "slot". A slot past the sixth is an undo instead.
  NestManager.prototype.lay = function (choice) {
    if (this.over || !this.layable()) return false;
    this.grid.removeTile(this.grid.cellContent(NEST));
    this.laid += 1;
    if (choice === "slot" && this.slots.length < SLOT_CAP) {
      this.slots.push(0);
    } else {
      this.undos += 1;
    }
    this.history = null;
    this.jumped = [];
    this.afterAction();
    return true;
  };

  // The tile on the nest joins its carried match, which doubles.
  NestManager.prototype.sendUp = function () {
    var s = this.sendSlot();
    if (this.over || s === -1) return false;
    this.grid.removeTile(this.grid.cellContent(NEST));
    this.slots[s] *= 2;
    this.score += this.slots[s];
    this.history = null;
    this.jumped = [s];
    this.settle();
    this.afterAction();
    return true;
  };

  NestManager.prototype.carry = function (cell) {
    var tile = this.grid.cellContent(cell);
    var s = this.freeSlot();
    if (this.over || !tile || tile.value < CARRY_MIN || s === -1) return false;
    this.grid.removeTile(tile);
    this.slots[s] = tile.value;
    this.history = null;
    this.jumped = [s];
    this.settle();
    this.afterAction();
    return true;
  };

  NestManager.prototype.undo = function () {
    if (this.over || !this.canUndo()) return false;
    var h = this.history;
    this.grid = new T.HexGrid(T.SIZE, h.grid.cells);
    this.score = h.score;
    this.moves = h.moves;
    this.won = h.won;
    this.slots = h.slots.slice();
    this.laid = h.laid;
    this.undos -= 1;
    this.history = null;
    this.jumped = [];
    this.afterAction();
    return true;
  };

  NestManager.prototype.actuate = function () {
    T.TurtleManager.prototype.actuate.call(this);
    if (this.onNest) this.onNest();
  };

  NestManager.prototype.topCarried = function () {
    return Math.max.apply(null, [0].concat(this.slots));
  };

  function NestStorage() {
    T.TurtleStorage.call(this);
    this.bestScoreKey = "nest-best";
    this.gameStateKey = "nest-state";
    this.turnKey = "nest-turn";
  }

  NestStorage.prototype = Object.create(T.TurtleStorage.prototype);
  NestStorage.prototype.constructor = NestStorage;

  /* ---- the page ----
   *
   * Under the board, above the pad: the undo button with its count, the six
   * slots (earned ones solid, the rest dashed), and a line of help. On the
   * board, the nest is marked on the tail cell and glows while it holds a
   * 2048; tapping that 2048 opens a card asking what the egg becomes.
   */

  var UNDO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
  var EGG_GLYPH = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 2.5c-3.7 0-6.8 5.6-6.8 10.4a6.8 6.8 0 0 0 13.6 0C18.8 8.1 15.7 2.5 12 2.5z"/></svg>';

  function buildNest(board) {
    var bar = document.createElement("div");
    bar.className = "nest-bar";
    var slots = "";
    for (var i = 0; i < SLOT_CAP; i++) {
      slots += '<button type="button" class="nest-slot" data-slot="' + i + '"></button>';
    }
    bar.innerHTML =
      '<button type="button" class="theme-toggle nest-undo">' + UNDO_ICON +
      '<span class="nest-count">0</span></button>' +
      '<div class="nest-slots">' + slots + "</div>";

    var hint = document.createElement("p");
    hint.className = "nest-hint";
    hint.setAttribute("aria-live", "polite");

    board.parentNode.insertBefore(hint, board.nextSibling);
    board.parentNode.insertBefore(bar, board.nextSibling);

    // Last on the page, under the pad (buildPad has already run).
    var version = document.createElement("p");
    version.className = "nest-version";
    version.textContent = "Egg mode v" + VERSION;
    board.parentNode.appendChild(version);

    var mark = document.createElement("div");
    mark.className = "nest-mark";
    mark.innerHTML = EGG_GLYPH;
    // In the layer that turns with the turtle, under the tiles.
    var tiles = board.querySelector(".tile-container");
    tiles.parentNode.insertBefore(mark, tiles);

    var choice = document.createElement("div");
    choice.className = "nest-choice";
    choice.hidden = true;
    choice.innerHTML =
      '<p class="nest-ask"></p>' +
      '<button type="button" data-choice="undo">Keep as an undo</button>' +
      '<button type="button" data-choice="slot"></button>' +
      '<button type="button" data-choice="send"></button>' +
      '<button type="button" class="nest-cancel" data-choice="cancel">Not now</button>';
    board.appendChild(choice);

    return { bar: bar, hint: hint, mark: mark, choice: choice, board: board };
  }

  function sizeClass(value) {
    var digits = String(value).length;
    return digits >= 6 ? " is-6" : digits === 5 ? " is-5" : digits === 4 ? " is-4" : "";
  }

  function wire(game, ui) {
    var picking = false;
    var note = "";
    var noteTimer = null;
    var undoButton = ui.bar.querySelector(".nest-undo");
    var count = ui.bar.querySelector(".nest-count");
    var slotButtons = ui.bar.querySelectorAll(".nest-slot");
    var ask = ui.choice.querySelector(".nest-ask");
    var undoChoice = ui.choice.querySelector('[data-choice="undo"]');
    var slotChoice = ui.choice.querySelector('[data-choice="slot"]');
    var sendChoice = ui.choice.querySelector('[data-choice="send"]');

    function say(text) {
      note = text;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { note = ""; render(); }, 2600);
      render();
    }

    function setPicking(on) {
      picking = on && game.freeSlot() !== -1 && game.carryable().length > 0;
      ui.board.classList.toggle("is-picking", picking);
    }

    function render() {
      count.textContent = game.undos;
      undoButton.disabled = !game.canUndo();
      var label = game.undos === 1 ? "1 undo" : game.undos + " undos";
      undoButton.setAttribute("aria-label", "Undo (" + label + ")");
      undoButton.setAttribute("title", "Undo (" + label + ")");

      var jumped = game.jumped || [];
      for (var i = 0; i < slotButtons.length; i++) {
        var b = slotButtons[i];
        var earned = i < game.slots.length;
        var value = earned ? game.slots[i] : 0;
        var cls = "nest-slot";
        if (!earned) {
          cls += " is-locked";
          b.innerHTML = EGG_GLYPH;
          b.setAttribute("aria-label", "Locked slot: lay a 2048 on the tail to earn it");
        } else if (!value) {
          cls += " is-empty" + (picking ? " is-picking" : "");
          b.innerHTML = "+";
          b.setAttribute("aria-label", "Empty slot: tap, then a tile of 2048 or more, to carry it");
        } else {
          cls += " is-full tile-" + value + (value > 2048 ? " tile-super" : "") + sizeClass(value) +
                 (jumped.indexOf(i) !== -1 ? " is-jumped" : "");
          b.innerHTML = '<span class="tile-inner">' + value + "</span>";
          b.setAttribute("aria-label", "Carried " + value);
        }
        b.className = cls;
      }
      game.jumped = [];

      var lay = !game.over && game.layable();
      var send = !game.over && game.sendSlot() !== -1;
      ui.mark.classList.toggle("is-ready", lay || send);
      ui.board.classList.toggle("is-stuck", game.stuck);

      var text = note;
      if (!text) {
        if (picking) text = "Tap a tile of 2048 or more to carry it.";
        else if (game.stuck) text = "No moves left: " + rescues(game) + ".";
        else if (lay && send) text = "Tap the 2048 on the tail to lay it or send it up.";
        else if (lay) text = "Tap the 2048 on the tail to lay an egg.";
        else if (send) text = "Tap the " + nestValue(game) + " on the tail to send it up.";
      }
      ui.hint.textContent = text;
    }

    // A 2048 can be laid, and sent up too if one is carried; a bigger tile
    // with a carried match can only be sent up.
    function openChoice() {
      var lay = game.layable();
      var value = nestValue(game);
      ask.textContent = lay ? "Lay this 2048 as an egg?" : "Send this " + value + " up?";
      undoChoice.hidden = !lay;
      slotChoice.hidden = !lay || game.slots.length >= SLOT_CAP;
      slotChoice.textContent = "New slot (" + (game.slots.length + 1) + " of " + SLOT_CAP + ")";
      sendChoice.hidden = game.sendSlot() === -1;
      sendChoice.textContent = "Send up to the carried " + value;
      ui.choice.hidden = false;
      ui.choice.querySelector("button:not([hidden])").focus();
    }

    function closeChoice() {
      ui.choice.hidden = true;
    }

    ui.choice.addEventListener("click", function (e) {
      var button = e.target.closest("button");
      if (!button) return;
      var c = button.getAttribute("data-choice");
      closeChoice();
      if (c === "undo" || c === "slot") game.lay(c);
      if (c === "send") game.sendUp();
    });

    undoButton.addEventListener("click", function () {
      closeChoice();
      setPicking(false);
      game.undo();
    });

    for (var i = 0; i < slotButtons.length; i++) {
      slotButtons[i].addEventListener("click", function () {
        var s = parseInt(this.getAttribute("data-slot"), 10);
        closeChoice();
        if (s >= game.slots.length) {
          say("Lay a 2048 on the tail to earn this slot.");
        } else if (game.slots[s]) {
          say("Make another " + game.slots[s] + " and it jumps up to join this one " +
              "(on the tail, tap it to send it up).");
        } else if (picking) {
          setPicking(false);
          render();
        } else if (!game.carryable().length) {
          say("Only tiles of 2048 or more can be carried.");
        } else {
          setPicking(true);
          render();
        }
      });
    }

    // A tap on the board (not a swipe): carry while picking, or lay or send
    // up the tile on the nest.
    var down = null;
    ui.board.addEventListener("pointerdown", function (e) {
      down = e.isPrimary && !e.target.closest(".nest-choice") ? { x: e.clientX, y: e.clientY } : null;
    });
    ui.board.addEventListener("pointerup", function (e) {
      if (!down || !e.isPrimary) return;
      var dx = e.clientX - down.x;
      var dy = e.clientY - down.y;
      down = null;
      if (dx * dx + dy * dy > 100) return;
      var cell = cellAt(ui.board, e.clientX, e.clientY, game.turn);
      if (!cell) return;
      if (picking) {
        setPicking(false);
        if (!game.carry(cell)) render();
        return;
      }
      var onNest = cell.x === NEST.x && cell.y === NEST.y;
      if (onNest && !game.over && (game.layable() || game.sendSlot() !== -1)) openChoice();
    });

    // Any move settles the page: the card closes and picking stops.
    game.inputManager.on("move", function () {
      closeChoice();
      if (picking) setPicking(false);
    });
    game.inputManager.on("restart", function () {
      closeChoice();
      setPicking(false);
      note = "";
    });

    game.onNest = render;
    render();
  }

  // What can still help when no move is left, as "undo or lay the 2048".
  function rescues(game) {
    var ways = [];
    if (game.canUndo()) ways.push("undo");
    if (game.layable()) ways.push("lay the 2048");
    if (game.sendSlot() !== -1) ways.push("send the " + nestValue(game) + " up");
    if (game.freeSlot() !== -1 && game.carryable().length) ways.push("carry a tile");
    return ways.length > 1 ? ways.slice(0, -1).join(", ") + " or " + ways[ways.length - 1] : ways[0];
  }

  function nestValue(game) {
    var tile = game.grid.cellContent(NEST);
    return tile ? tile.value : 0;
  }

  // The board cell under a point on the page, or null.
  // The board may be turned, so the point is turned back first.
  function cellAt(board, px, py, turn) {
    var rect = board.getBoundingClientRect();
    var v = T.VIEW;
    var p = T.turned({
      x: v.x + (px - rect.left) / rect.width * v.w,
      y: v.y + (py - rect.top) / rect.height * v.h
    }, -(turn || 0));
    var x = p.x;
    var y = p.y;
    var best = null;
    var bestD = 30 * 30;
    for (var cx = 0; cx < T.SIZE; cx++) {
      for (var cy = 0; cy < T.SIZE; cy++) {
        if (!T.inHex(cx, cy)) continue;
        var c = T.cellCentre(cx, cy);
        var d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  }

  root.Nest = {
    NestManager: NestManager,
    NestStorage: NestStorage,
    NEST: NEST,
    SLOT_CAP: SLOT_CAP
  };

  if (typeof document !== "undefined" && document.querySelector(".nest")) {
    window.requestAnimationFrame(function () {
      var game = new NestManager(T.SIZE, T.HexInputManager, T.TurtleActuator, NestStorage);
      root.Turtle.game = game;
      // The leaderboard's top tile counts the carried ones.
      root.extraTopTile = function () { return game.topCarried(); };
      // The pad goes in first, so the bar lands between it and the board.
      T.buildPad(game);
      wire(game, buildNest(document.querySelector(".game-container")));
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
