/* Merge effects — Pixel 11 build.
 *
 * Two things this device does well that a generic build cannot assume:
 *
 *   Wide gamut. The canvas is created with colorSpace "display-p3" and particles
 *   take their colour straight from the tile's CSS custom property, so a spark
 *   thrown off a 512 is the same out-of-sRGB gold as the tile it came from
 *   rather than a clipped approximation of it.
 *
 *   Headroom. Tensor G6 at 120Hz will not notice a few hundred sprites, so the
 *   burst scales with the value merged: a 4 gets a flicker, a 1024 gets a shower
 *   and a shockwave ring. The loop is delta-timed, so it runs at the same speed
 *   whether the panel is at 60Hz or 120Hz, and it parks itself the moment the
 *   last particle dies rather than holding the display at high refresh.
 *
 * Attaches by wrapping HTMLActuator.actuate, so upstream's actuator is used
 * verbatim.
 */

(function () {
  "use strict";

  var GRAVITY = 900;      // px/s^2, enough that sparks arc instead of floating
  var DRAG = 0.86;        // per-second velocity retention
  var MAX_PARTICLES = 600;

  function Effects(boardEl) {
    this.board = boardEl;
    this.particles = [];
    this.rings = [];
    this.running = false;
    this.lastTime = 0;
    this.size = 0;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "fx-layer";
    this.canvas.setAttribute("aria-hidden", "true");
    boardEl.appendChild(this.canvas);

    // display-p3 backing store where available; Chrome on this panel has it.
    try {
      this.ctx = this.canvas.getContext("2d", { colorSpace: "display-p3" });
    } catch (e) {
      this.ctx = null;
    }
    if (!this.ctx) this.ctx = this.canvas.getContext("2d");

    this.resize();

    var self = this;
    if (window.ResizeObserver) {
      new ResizeObserver(function () { self.resize(); }).observe(boardEl);
    } else {
      window.addEventListener("resize", function () { self.resize(); });
    }
  }

  Effects.prototype.resize = function () {
    var rect = this.board.getBoundingClientRect();
    if (!rect.width) return;

    // Cap the ratio: past 3x the extra pixels cost fill rate and buy nothing.
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.size = rect.width;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // Centre of grid cell (x, y), both 0-indexed, in board CSS px.
  Effects.prototype.cellCenter = function (x, y) {
    var b = this.size;
    return {
      x: (0.03 + x * 0.2425 + 0.10625) * b,
      y: (0.03 + y * 0.2425 + 0.10625) * b
    };
  };

  Effects.prototype.tileColor = function (value) {
    var name = value > 2048 ? "--tsuper" : "--t" + value;
    var css = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return css || "#edc22e";
  };

  Effects.prototype.burst = function (tile) {
    if (!this.size) this.resize();
    if (!this.size) return;

    var center = this.cellCenter(tile.x, tile.y);
    var exponent = Math.round(Math.log(tile.value) / Math.LN2); // 4 -> 2, 2048 -> 11
    var count = Math.min(6 + exponent * 4, 52);
    var color = this.tileColor(tile.value);
    var cell = this.size * 0.2125;
    var speed = cell * (1.4 + exponent * 0.16);

    for (var i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;

      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      var velocity = speed * (0.45 + Math.random() * 0.75);

      this.particles.push({
        x: center.x + Math.cos(angle) * cell * 0.16,
        y: center.y + Math.sin(angle) * cell * 0.16,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - cell * 0.5,
        radius: cell * (0.018 + Math.random() * 0.042),
        life: 0,
        ttl: 0.34 + Math.random() * 0.34,
        color: color
      });
    }

    // Big merges also throw a ring. Below 128 it would just be visual noise.
    if (tile.value >= 128) {
      this.rings.push({
        x: center.x,
        y: center.y,
        life: 0,
        ttl: 0.42,
        from: cell * 0.3,
        to: cell * (0.95 + exponent * 0.1),
        color: color
      });
    }

    this.start();
  };

  Effects.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;

    var self = this;
    window.requestAnimationFrame(function step(now) {
      // Delta-timed: identical motion at 60Hz and 120Hz.
      var dt = self.lastTime ? Math.min((now - self.lastTime) / 1000, 0.05) : 0.016;
      self.lastTime = now;

      self.update(dt);
      self.draw();

      if (self.particles.length || self.rings.length) {
        window.requestAnimationFrame(step);
      } else {
        // Nothing left to draw: clear once and release the frame callback so the
        // panel can drop back to its idle refresh rate.
        self.ctx.clearRect(0, 0, self.size, self.size);
        self.running = false;
      }
    });
  };

  Effects.prototype.update = function (dt) {
    var drag = Math.pow(DRAG, dt);
    var i;

    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life += dt;
      if (p.life >= p.ttl) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vx *= drag;
      p.vy = p.vy * drag + GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (i = this.rings.length - 1; i >= 0; i--) {
      var r = this.rings[i];
      r.life += dt;
      if (r.life >= r.ttl) this.rings.splice(i, 1);
    }
  };

  Effects.prototype.draw = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);

    var i;

    for (i = 0; i < this.rings.length; i++) {
      var r = this.rings[i];
      var t = r.life / r.ttl;
      var eased = 1 - Math.pow(1 - t, 3);

      ctx.globalAlpha = (1 - t) * 0.5;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, this.size * 0.008 * (1 - t));
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.from + (r.to - r.from) * eased, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var pt = p.life / p.ttl;

      ctx.globalAlpha = 1 - pt * pt;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (1 - pt * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  };

  /* ---- haptics ----
   * One pulse per move, not one per merge, so a four-way cascade is a single
   * crisp tick rather than a stutter. Kept in the 8-22ms range: long enough for
   * the Pixel's actuator to register as a tap, short enough never to buzz.
   */
  function vibrate(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {
      /* user has haptics off, or the browser refuses outside a gesture */
    }
  }

  function init() {
    var board = document.querySelector(".game-container");
    if (!board || typeof HTMLActuator === "undefined") return;

    var reduced = window.matchMedia &&
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var effects = reduced ? null : new Effects(board);

    var actuate = HTMLActuator.prototype.actuate;
    HTMLActuator.prototype.actuate = function (grid, metadata) {
      actuate.call(this, grid, metadata);

      var merges = [];
      grid.cells.forEach(function (column) {
        column.forEach(function (cell) {
          if (cell && cell.mergedFrom) merges.push(cell);
        });
      });

      if (merges.length) {
        var largest = merges.reduce(function (a, b) {
          return a.value > b.value ? a : b;
        });
        var exponent = Math.round(Math.log(largest.value) / Math.LN2);
        vibrate(Math.min(6 + exponent * 1.5, 22));

        if (effects) {
          // Fire as the sliding tiles meet, so the sparks come out of the
          // collision rather than trailing behind the pop.
          window.setTimeout(function () {
            merges.forEach(function (tile) { effects.burst(tile); });
          }, 90);
        }
      }

      if (metadata.terminated) {
        vibrate(metadata.over && !metadata.won ? 34 : [14, 46, 14, 46, 28]);
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
