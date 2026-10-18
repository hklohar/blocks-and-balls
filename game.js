/*
 * Blocks & Balls: a Tetris-like game with rolling balls.
 * Plain JavaScript, no dependencies. The core engine (createGame) is DOM-free
 * so it can also be loaded in Node for tests: require('./game.js').
 */
(function (root) {
  'use strict';

  // ===================================================================
  //  Core engine (no DOM)
  // ===================================================================
  var COLS = 10;
  var ROWS = 20;
  var QUEUE_SIZE = 3;
  var LOCK_DELAY = 450;      // ms a grounded piece may slide before locking
  var MAX_LOCK_RESETS = 15;
  var SOFT_DROP_INTERVAL = 35;
  var SETTLE_STEP = 45;      // ms per ball physics step (one cell)
  var CLEAR_TIME = 420;      // ms line-clear animation
  var BOUNCE_TIME = 520;     // ms landing bounce animation
  var MAX_ROLLS = 3;         // diagonal rolls a ball may make per settle (it loses momentum)
  var MAX_SWITCHES = 3;
  var LINES_PER_CHARGE = 5;
  var WAVE_SIZE = 4;         // Alternating mode: pieces per wave
  var BALL_RATIO_MIXED = 0.3;
  var BALL_BONUS = 25;       // per ball in a cleared row, x level
  var LINE_SCORES = [0, 100, 300, 500, 800];

  var SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    // native ball pieces
    b1: [[1]],
    b2: [[1, 1], [0, 0]],
    b3: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
    bt: [[1, 1], [1, 0]]
  };
  var TETROMINOES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var BALL_SHAPES = [['b1', 0.38], ['b2', 0.32], ['bt', 0.16], ['b3', 0.14]];

  // Blocks use a cool palette, balls use a warm palette.
  var BLOCK_COLORS = {
    I: '#22d3ee', J: '#3b82f6', L: '#a3e635', O: '#cbd5e1', S: '#10b981', T: '#a855f7', Z: '#6366f1',
    b1: '#2dd4bf', b2: '#60a5fa', b3: '#c084fc', bt: '#4ade80'
  };
  var BALL_COLORS = {
    b1: '#f43f5e', b2: '#fb923c', b3: '#facc15', bt: '#ec4899',
    I: '#fb7185', J: '#f97316', L: '#fbbf24', O: '#fda4af', S: '#f472b6', T: '#e11d48', Z: '#ff8a5c'
  };

  function colorFor(shape, form) {
    return form === 'ball' ? BALL_COLORS[shape] : BLOCK_COLORS[shape];
  }

  function cloneMatrix(m) { return m.map(function (r) { return r.slice(); }); }

  function rotateMatrix(m, dir) {
    var h = m.length, w = m[0].length, out = [], r, c;
    for (r = 0; r < w; r++) {
      out.push([]);
      for (c = 0; c < h; c++) {
        out[r][c] = dir > 0 ? m[h - 1 - c][r] : m[c][w - 1 - r];
      }
    }
    return out;
  }

  function matrixCells(m) {
    var cells = [];
    for (var r = 0; r < m.length; r++)
      for (var c = 0; c < m[r].length; c++)
        if (m[r][c]) cells.push([c, r]);
    return cells;
  }

  function createGame(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var storage = opts.storage || null;

    var g = {
      COLS: COLS, ROWS: ROWS,
      mode: opts.mode || 'mixed',
      board: emptyBoard(),
      cur: null,
      queue: [],
      score: 0, level: 1, lines: 0, high: 0,
      phase: 'idle',          // idle | falling | settling | clearing | over
      paused: false,
      softDrop: false,
      switches: MAX_SWITCHES, maxSwitches: MAX_SWITCHES, switchUsed: false,
      chain: 0,
      clearRows: [], clearT: 0,
      settleT: 0, gravT: 0, lockT: 0, lockResets: 0,
      pieceCount: 0, genCount: 0,
      ballsCleared: 0,
      onEvent: null,
      constants: {
        SETTLE_STEP: SETTLE_STEP, CLEAR_TIME: CLEAR_TIME, BOUNCE_TIME: BOUNCE_TIME,
        WAVE_SIZE: WAVE_SIZE, LINES_PER_CHARGE: LINES_PER_CHARGE
      }
    };
    var linesSinceCharge = 0;
    var bag = [];

    function emit(type, data) { if (g.onEvent) { try { g.onEvent(type, data || {}); } catch (e) { if (typeof console !== 'undefined') console.error(e); } } }

    function emptyBoard() {
      var b = [];
      for (var y = 0; y < ROWS; y++) { b.push(new Array(COLS).fill(null)); }
      return b;
    }

    function loadHigh() {
      g.high = 0;
      if (storage) { var v = parseInt(storage.get(g.mode), 10); if (!isNaN(v)) g.high = v; }
    }
    function saveHigh() {
      if (g.score > g.high) {
        g.high = g.score;
        g.newRecord = true;
        if (storage) storage.set(g.mode, String(g.high));
      }
    }

    function fromBag() {
      if (!bag.length) {
        bag = TETROMINOES.slice();
        for (var i = bag.length - 1; i > 0; i--) {
          var j = Math.floor(rng() * (i + 1)); var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
        }
      }
      return bag.pop();
    }
    function randomBallShape() {
      var r = rng(), acc = 0;
      for (var i = 0; i < BALL_SHAPES.length; i++) { acc += BALL_SHAPES[i][1]; if (r < acc) return BALL_SHAPES[i][0]; }
      return 'b1';
    }
    function nextDescriptor() {
      var form;
      switch (g.mode) {
        case 'classic': form = 'block'; break;
        case 'balls': form = 'ball'; break;
        case 'alternating': form = Math.floor(g.genCount / WAVE_SIZE) % 2 === 0 ? 'block' : 'ball'; break;
        default: form = rng() < BALL_RATIO_MIXED ? 'ball' : 'block';
      }
      g.genCount++;
      return { shape: form === 'block' ? fromBag() : randomBallShape(), form: form };
    }

    function collides(m, x, y) {
      for (var r = 0; r < m.length; r++) {
        for (var c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          var bx = x + c, by = y + r;
          if (bx < 0 || bx >= COLS || by >= ROWS) return true;
          if (by >= 0 && g.board[by][bx]) return true;
        }
      }
      return false;
    }
    g.collides = collides;

    function makePiece(shape, form) {
      var m = cloneMatrix(SHAPES[shape]);
      var top = 0;
      while (top < m.length && m[top].every(function (v) { return !v; })) top++;
      return { shape: shape, form: form, m: m, x: Math.floor((COLS - m[0].length) / 2), y: -top, color: colorFor(shape, form) };
    }

    function spawn() {
      var d = g.queue.shift();
      g.queue.push(nextDescriptor());
      var p = makePiece(d.shape, d.form);
      g.chain = 0;
      g.gravT = 0; g.lockT = 0; g.lockResets = 0;
      g.switchUsed = false;
      if (collides(p.m, p.x, p.y)) {
        g.cur = p;
        gameOver();
        return false;
      }
      g.cur = p;
      g.pieceCount++;
      g.phase = 'falling';
      emit('spawn', { piece: p });
      return true;
    }

    function gameOver() {
      g.phase = 'over';
      g.softDrop = false;
      saveHigh();
      emit('gameover', { score: g.score, high: g.high, newRecord: !!g.newRecord });
    }

    function grounded() { return g.cur && collides(g.cur.m, g.cur.x, g.cur.y + 1); }

    function afterMove() {
      if (grounded() && g.lockResets < MAX_LOCK_RESETS) { g.lockT = 0; g.lockResets++; }
    }

    g.canAct = function () { return g.phase === 'falling' && !g.paused && !!g.cur; };

    g.move = function (dx) {
      if (!g.canAct()) return false;
      if (collides(g.cur.m, g.cur.x + dx, g.cur.y)) return false;
      g.cur.x += dx;
      afterMove();
      emit('move', {});
      return true;
    };

    g.rotate = function (dir) {
      dir = dir || 1;
      if (!g.canAct()) return false;
      var p = g.cur;
      if (p.shape === 'O' || p.shape === 'b1') return true;
      var nm = rotateMatrix(p.m, dir);
      var kicks = p.shape === 'I'
        ? [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1], [0, -2]]
        : [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0]];
      for (var i = 0; i < kicks.length; i++) {
        var nx = p.x + kicks[i][0], ny = p.y + kicks[i][1];
        if (!collides(nm, nx, ny)) {
          p.m = nm; p.x = nx; p.y = ny;
          afterMove();
          emit('rotate', {});
          return true;
        }
      }
      return false;
    };

    function stepDown() {
      if (!g.cur || collides(g.cur.m, g.cur.x, g.cur.y + 1)) return false;
      g.cur.y++;
      return true;
    }

    g.softDropStep = function () {
      if (!g.canAct()) return false;
      if (stepDown()) { g.score += 1; g.gravT = 0; return true; }
      return false;
    };

    g.hardDrop = function () {
      if (!g.canAct()) return 0;
      var d = 0;
      while (stepDown()) d++;
      g.score += d * 2;
      emit('harddrop', { distance: d, piece: g.cur });
      lock();
      return d;
    };

    g.canSwitch = function () {
      return g.canAct() && g.mode !== 'classic' && g.switches > 0 && !g.switchUsed;
    };
    g.switchForm = function () {
      if (!g.canSwitch()) return false;
      var p = g.cur;
      p.form = p.form === 'ball' ? 'block' : 'ball';
      p.color = colorFor(p.shape, p.form);
      g.switches--;
      g.switchUsed = true;
      emit('switch', { form: p.form });
      return true;
    };

    g.ghostY = function () {
      if (!g.cur) return 0;
      var y = g.cur.y;
      while (!collides(g.cur.m, g.cur.x, y + 1)) y++;
      return y;
    };

    g.pieceCells = function (p) {
      p = p || g.cur;
      if (!p) return [];
      return matrixCells(p.m).map(function (c) { return [p.x + c[0], p.y + c[1]]; });
    };

    function lock() {
      var p = g.cur, above = false;
      var cells = g.pieceCells(p);
      for (var i = 0; i < cells.length; i++) {
        var x = cells[i][0], y = cells[i][1];
        if (y < 0) { above = true; continue; }
        g.board[y][x] = {
          type: p.form, color: p.color, shape: p.shape,
          moving: p.form === 'ball', fx: x, fy: y, bounce: -1, rolls: 0
        };
      }
      g.cur = null;
      g.softDrop = g.softDrop; // keep held state
      emit('lock', { form: p.form, cells: cells });
      if (above) { gameOver(); return; }
      if (p.form === 'ball') { g.phase = 'settling'; g.settleT = 0; }
      else afterSettle();
    }

    // One physics step for every ball on the board. Returns true if any moved.
    function stepBalls() {
      var b = g.board, x, y, c, moved = false, landed = 0;
      for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
        c = b[y][x];
        if (c && c.type === 'ball') { c.fx = x; c.fy = y; }
      }
      for (y = ROWS - 1; y >= 0; y--) {
        var ltr = rng() < 0.5;
        for (var i = 0; i < COLS; i++) {
          x = ltr ? i : COLS - 1 - i;
          c = b[y][x];
          if (!c || c.type !== 'ball') continue;
          var tx = -1, ty = -1;
          if (y + 1 < ROWS) {
            if (!b[y + 1][x]) { tx = x; ty = y + 1; }
            else {
              // Resting on something: roll to a diagonal-lower open cell if the side is clear.
              var opts2 = [];
              for (var dx = -1; dx <= 1; dx += 2) {
                var nx = x + dx;
                if (nx >= 0 && nx < COLS && !b[y][nx] && !b[y + 1][nx]) opts2.push(nx);
              }
              if (opts2.length && (c.rolls || 0) < MAX_ROLLS) {
                tx = opts2.length === 2 ? opts2[rng() < 0.5 ? 0 : 1] : opts2[0];
                ty = y + 1;
                c.rolls = (c.rolls || 0) + 1;
              }
            }
          }
          if (tx >= 0) {
            b[ty][tx] = c; b[y][x] = null;
            c.moving = true; c.bounce = -1;
            moved = true;
          } else if (c.moving) {
            c.moving = false; c.bounce = 0; landed++;
          }
        }
      }
      if (landed) emit('land', { count: landed });
      return moved;
    }
    g.stepBalls = stepBalls;

    // Run ball physics instantly to completion (used by tests / tooling).
    g.settleAll = function (maxSteps) {
      maxSteps = maxSteps || 1000;
      var n = 0;
      while (stepBalls() && n < maxSteps) n++;
      stepBalls();
      return n;
    };

    function fullRows() {
      var rows = [];
      for (var y = 0; y < ROWS; y++) {
        var full = true;
        for (var x = 0; x < COLS; x++) if (!g.board[y][x]) { full = false; break; }
        if (full) rows.push(y);
      }
      return rows;
    }
    g.fullRows = fullRows;

    function afterSettle() {
      var rows = fullRows();
      if (rows.length) startClear(rows);
      else spawn();
    }

    function startClear(rows) {
      g.chain++;
      var balls = 0, cells = [];
      rows.forEach(function (y) {
        for (var x = 0; x < COLS; x++) {
          var c = g.board[y][x];
          if (c.type === 'ball') balls++;
          cells.push({ x: x, y: y, color: c.color, type: c.type });
        }
      });
      var n = rows.length;
      var base = n <= 4 ? LINE_SCORES[n] : 800 + (n - 4) * 300;
      var pts = (base + balls * BALL_BONUS) * g.level * g.chain;
      g.score += pts;
      g.lines += n;
      g.ballsCleared += balls;
      linesSinceCharge += n;
      while (linesSinceCharge >= LINES_PER_CHARGE) {
        linesSinceCharge -= LINES_PER_CHARGE;
        if (g.switches < MAX_SWITCHES) g.switches++;
      }
      var newLevel = 1 + Math.floor(g.lines / 10);
      var leveled = newLevel > g.level;
      g.level = newLevel;
      g.clearRows = rows.slice();
      g.clearT = 0;
      g.phase = 'clearing';
      if (g.score > g.high) { /* live best display, persisted at game over */ }
      emit('clear', { rows: rows.slice(), cells: cells, points: pts, balls: balls, chain: g.chain, count: n });
      if (leveled) emit('levelup', { level: g.level });
    }

    function finishClear() {
      var set = {};
      g.clearRows.forEach(function (y) { set[y] = true; });
      var nb = [];
      for (var y = 0; y < ROWS; y++) if (!set[y]) nb.push(g.board[y]);
      while (nb.length < ROWS) nb.unshift(new Array(COLS).fill(null));
      g.board = nb;
      for (y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        var c = g.board[y][x];
        if (c) { c.fx = x; c.fy = y; c.rolls = 0; }
      }
      g.clearRows = [];
      // Balls get gravity again after a clear (they fall / roll into gaps).
      g.phase = 'settling';
      g.settleT = 0;
    }
    g.finishClear = finishClear;

    g.gravityInterval = function () {
      return Math.max(55, Math.round(800 * Math.pow(0.84, g.level - 1)));
    };

    function tickBounces(dt) {
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        var c = g.board[y][x];
        if (c && c.bounce >= 0) { c.bounce += dt; if (c.bounce > BOUNCE_TIME) c.bounce = -1; }
      }
    }

    g.update = function (dt) {
      if (g.phase === 'idle' || g.phase === 'over' || g.paused) return;
      tickBounces(dt);
      if (g.phase === 'falling') {
        var interval = g.softDrop ? Math.min(SOFT_DROP_INTERVAL, g.gravityInterval()) : g.gravityInterval();
        if (grounded()) {
          g.gravT = 0;
          g.lockT += dt;
          if (g.lockT >= LOCK_DELAY) lock();
        } else {
          g.gravT += dt;
          while (g.gravT >= interval) {
            g.gravT -= interval;
            if (stepDown()) { if (g.softDrop) g.score += 1; }
            else break;
            if (grounded()) { g.gravT = 0; break; }
          }
        }
      } else if (g.phase === 'settling') {
        g.settleT += dt;
        while (g.settleT >= SETTLE_STEP && g.phase === 'settling') {
          g.settleT -= SETTLE_STEP;
          if (!stepBalls()) { g.settleT = 0; afterSettle(); }
        }
      } else if (g.phase === 'clearing') {
        g.clearT += dt;
        if (g.clearT >= CLEAR_TIME) finishClear();
      }
    };

    g.start = function (mode) {
      if (mode) g.mode = mode;
      g.board = emptyBoard();
      g.score = 0; g.level = 1; g.lines = 0; g.ballsCleared = 0;
      g.switches = MAX_SWITCHES; g.switchUsed = false; linesSinceCharge = 0;
      g.paused = false; g.softDrop = false; g.chain = 0; g.newRecord = false;
      g.clearRows = []; g.pieceCount = 0; g.genCount = 0; bag = [];
      loadHigh();
      g.queue = [];
      for (var i = 0; i < QUEUE_SIZE; i++) g.queue.push(nextDescriptor());
      emit('start', { mode: g.mode });
      spawn();
    };

    g.setMode = function (mode) { g.mode = mode; loadHigh(); };

    g.togglePause = function (force) {
      if (g.phase === 'idle' || g.phase === 'over') return false;
      g.paused = typeof force === 'boolean' ? force : !g.paused;
      if (g.paused) g.softDrop = false;
      emit('pause', { paused: g.paused });
      return g.paused;
    };

    // Alternating mode helper: which wave is the current piece in?
    g.waveInfo = function () {
      if (g.mode !== 'alternating' || g.pieceCount < 1) return null;
      var idx = g.pieceCount - 1;
      return {
        form: Math.floor(idx / WAVE_SIZE) % 2 === 0 ? 'block' : 'ball',
        left: WAVE_SIZE - (idx % WAVE_SIZE)
      };
    };

    g.linesToCharge = function () { return LINES_PER_CHARGE - linesSinceCharge; };

    loadHigh();
    return g;
  }

  var api = {
    createGame: createGame, SHAPES: SHAPES, COLS: COLS, ROWS: ROWS,
    rotateMatrix: rotateMatrix, colorFor: colorFor, matrixCells: matrixCells
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BallTetris = api;

  // ===================================================================
  //  Browser UI
  // ===================================================================
  if (typeof document === 'undefined') return;

  var MODE_INFO = {
    classic: 'Only the 7 classic tetrominoes. Switching is off.',
    balls: 'Only balls: singles, pairs, trios and triangles. They roll off edges like marbles.',
    mixed: 'About 30% of pieces are balls, picked at random.',
    alternating: 'Waves of 4 blocks, then 4 balls, repeating.'
  };

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, amt) { // amt -1..1 (negative darkens, positive lightens)
    var rgb = hexToRgb(hex);
    var t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    return 'rgb(' + rgb.map(function (v) { return Math.round((t - v) * p + v); }).join(',') + ')';
  }
  function rgba(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawBlock(ctx, px, py, s, color, alpha) {
    var pad = Math.max(1, s * 0.06), w = s - pad * 2, r = Math.max(2, s * 0.16);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    var gr = ctx.createLinearGradient(px, py, px + s, py + s);
    gr.addColorStop(0, shade(color, 0.35));
    gr.addColorStop(0.5, color);
    gr.addColorStop(1, shade(color, -0.35));
    roundRect(ctx, px + pad, py + pad, w, w, r);
    ctx.fillStyle = gr;
    ctx.fill();
    // glossy top sheen
    var sh = ctx.createLinearGradient(px, py, px, py + s * 0.55);
    sh.addColorStop(0, 'rgba(255,255,255,0.35)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(ctx, px + pad * 2, py + pad * 2, w - pad * 2, w * 0.45, r * 0.7);
    ctx.fillStyle = sh;
    ctx.fill();
    roundRect(ctx, px + pad, py + pad, w, w, r);
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.strokeStyle = shade(color, -0.45);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall(ctx, cx, cy, rad, color, alpha, sx, sy) {
    sx = sx || 1; sy = sy || 1;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(cx, cy + rad * (1 - sy)); // keep bottom on the floor when squashed
    ctx.scale(sx, sy);
    var gr = ctx.createRadialGradient(-rad * 0.35, -rad * 0.4, rad * 0.05, 0, 0, rad);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.18, shade(color, 0.45));
    gr.addColorStop(0.6, color);
    gr.addColorStop(1, shade(color, -0.55));
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fillStyle = gr;
    ctx.fill();
    // rim light
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.92, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(1, rad * 0.08);
    ctx.stroke();
    // specular
    ctx.beginPath();
    ctx.ellipse(-rad * 0.32, -rad * 0.42, rad * 0.22, rad * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.restore();
  }

  function drawCell(ctx, type, px, py, s, color, alpha, sx, sy) {
    if (type === 'ball') drawBall(ctx, px + s / 2, py + s / 2, s * 0.44, color, alpha, sx, sy);
    else drawBlock(ctx, px, py, s, color, alpha);
  }

  function bounceParams(t) {
    // t: ms since landing, returns {dy (fraction of cell, negative = up), sx, sy}
    var p = Math.min(1, t / BOUNCE_TIME);
    var decay = Math.pow(1 - p, 2);
    var phase = p * Math.PI * 3;
    var hop = Math.abs(Math.sin(phase)) * decay * 0.32;
    var squash = Math.max(0, Math.cos(phase)) * decay * 0.18;
    return { dy: -hop, sx: 1 + squash, sy: 1 - squash };
  }

  function initUI() {
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $('board'), ctx = canvas.getContext('2d');
    var nextCanvas = $('next'), nctx = nextCanvas.getContext('2d');
    var boardWrap = $('boardWrap'), boardInner = $('boardInner');
    var overlay = $('overlay'), overlayCard = $('overlayCard');
    var modeSel = $('mode'), modeInfo = $('modeInfo');
    var btnStart = $('btnStart'), btnPause = $('btnPause'), btnRestart = $('btnRestart'), btnSwitch = $('btnSwitch');
    var elScore = $('score'), elLevel = $('level'), elLines = $('lines'), elHigh = $('high');
    var dotsEl = $('switchDots'), switchPanel = document.querySelector('.switch-panel'), switchHint = $('switchHint');

    var storage = {
      get: function (mode) { try { return localStorage.getItem('ballTetris.high.' + mode); } catch (e) { return null; } },
      set: function (mode, v) { try { localStorage.setItem('ballTetris.high.' + mode, v); } catch (e) { /* ignore */ } }
    };
    var savedMode = null;
    try { savedMode = localStorage.getItem('ballTetris.mode'); } catch (e) { /* ignore */ }
    if (savedMode && MODE_INFO[savedMode]) modeSel.value = savedMode;

    var game = createGame({ storage: storage, mode: modeSel.value });
    root.game = game; // handy for debugging / automation

    var cell = 30, bw = 300, bh = 600;
    var particles = [], floaters = [];
    var shake = 0, flash = 0, levelFlash = 0;
    var held = { dir: 0, dasT: 0, arrT: 0, left: false, right: false };
    var DAS = 160, ARR = 45;

    // ---------- sizing ----------
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 3);
      var aw = boardWrap.clientWidth, ah = boardWrap.clientHeight;
      cell = Math.max(8, Math.floor(Math.min(aw / COLS, ah / ROWS)));
      bw = cell * COLS; bh = cell * ROWS;
      boardInner.style.width = bw + 'px';
      boardInner.style.height = bh + 'px';
      canvas.style.width = bw + 'px'; canvas.style.height = bh + 'px';
      canvas.width = Math.round(bw * dpr); canvas.height = Math.round(bh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var nw = nextCanvas.clientWidth || 120, nh = nextCanvas.clientHeight || 120;
      nextCanvas.width = Math.round(nw * dpr); nextCanvas.height = Math.round(nh * dpr);
      nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nextCanvas._w = nw; nextCanvas._h = nh;
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(boardWrap);

    // ---------- touch detection ----------
    function enableTouch() { document.body.classList.add('touch'); requestAnimationFrame(resize); }
    if (('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) enableTouch();
    window.addEventListener('touchstart', function once() { enableTouch(); window.removeEventListener('touchstart', once); }, { passive: true });

    // ---------- overlay ----------
    function showOverlay(html) { overlayCard.innerHTML = html; overlay.classList.add('show'); }
    function hideOverlay() { overlay.classList.remove('show'); }
    function startOverlay() {
      showOverlay(
        '<h2>Blocks &amp; Balls</h2>' +
        '<p>Clear rows like in Tetris. <b>Balls</b> don\'t stay put: they roll off ledges and settle like marbles.</p>' +
        '<div class="legend"><span><i class="sw block"></i>Blocks</span><span><i class="sw ball"></i>Balls</span></div>' +
        '<p>Mode: <b>' + modeSel.options[modeSel.selectedIndex].text + '</b></p>' +
        '<p class="keys"><kbd>←</kbd><kbd>→</kbd> move · <kbd>↑</kbd>/<kbd>Space</kbd> rotate · <kbd>↓</kbd> soft · <kbd>Shift</kbd> hard drop · <kbd>C</kbd> switch · <kbd>P</kbd> pause</p>' +
        '<button type="button" class="primary" data-ov="start">Start game</button>'
      );
    }
    function pauseOverlay() {
      showOverlay('<h2>Paused</h2><p>Press <kbd>P</kbd> or tap Resume.</p>' +
        '<button type="button" class="primary" data-ov="resume">Resume</button>');
    }
    function gameOverOverlay(d) {
      showOverlay('<h2>Game over</h2><div class="big">' + d.score.toLocaleString() + '</div>' +
        (d.newRecord ? '<p class="record">New high score!</p>' : '<p>Best: ' + d.high.toLocaleString() + '</p>') +
        '<p>Level ' + game.level + ' · ' + game.lines + ' lines · ' + game.ballsCleared + ' balls cleared</p>' +
        '<button type="button" class="primary" data-ov="start">Play again</button>');
    }
    overlay.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ov]');
      if (!b) return;
      if (b.dataset.ov === 'start') startGame();
      else if (b.dataset.ov === 'resume') setPaused(false);
    });

    // ---------- actions ----------
    function active() { return game.phase !== 'idle' && game.phase !== 'over'; }
    function startGame() {
      particles = []; floaters = [];
      try { localStorage.setItem('ballTetris.mode', modeSel.value); } catch (e) { /* ignore */ }
      game.start(modeSel.value);
      hideOverlay();
      syncUI(true);
    }
    function setPaused(p) {
      if (!active()) return;
      game.togglePause(p);
      if (game.paused) pauseOverlay(); else hideOverlay();
      syncUI(true);
    }
    function act(name) {
      switch (name) {
        case 'left': return game.move(-1);
        case 'right': return game.move(1);
        case 'rotate': return game.rotate(1);
        case 'rotateCCW': return game.rotate(-1);
        case 'down': return game.softDropStep();
        case 'drop': return game.hardDrop();
        case 'switch': return game.switchForm();
      }
    }

    btnStart.addEventListener('click', function () {
      if (game.paused) setPaused(false);
      else if (!active()) startGame();
      btnStart.blur();
    });
    btnPause.addEventListener('click', function () { setPaused(!game.paused); btnPause.blur(); });
    btnRestart.addEventListener('click', function () { startGame(); btnRestart.blur(); });
    btnSwitch.addEventListener('click', function () { act('switch'); btnSwitch.blur(); });
    modeSel.addEventListener('change', function () {
      game.setMode(modeSel.value);
      try { localStorage.setItem('ballTetris.mode', modeSel.value); } catch (e) { /* ignore */ }
      if (!active()) startOverlay();
      syncUI(true);
      modeSel.blur();
    });

    // ---------- keyboard ----------
    var SCROLL_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ' ': 1, Spacebar: 1 };
    function isFormControl(el) { return el && (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'); }

    function arcadeOther() { return root.arcade && root.arcade.current && root.arcade.current !== 'blocks'; }
    window.addEventListener('keydown', function (e) {
      if (arcadeOther()) return; // another arcade game has focus
      var k = e.key;
      var playing = active() && !game.paused;
      if (SCROLL_KEYS[k] && !(isFormControl(e.target) && !playing)) e.preventDefault();
      if (isFormControl(e.target) && !playing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); if (active()) setPaused(!game.paused); return; }
      if (k === 'Enter' && !active()) { e.preventDefault(); startGame(); return; }
      if (!playing) return;

      switch (k) {
        case 'ArrowLeft':
          held.left = true; if (!e.repeat) { held.dir = -1; held.dasT = 0; held.arrT = 0; act('left'); }
          break;
        case 'ArrowRight':
          held.right = true; if (!e.repeat) { held.dir = 1; held.dasT = 0; held.arrT = 0; act('right'); }
          break;
        case 'ArrowDown':
          if (!e.repeat) { game.softDrop = true; act('down'); }
          break;
        case 'ArrowUp': case ' ': case 'Spacebar': case 'x': case 'X':
          if (!e.repeat) act('rotate');
          break;
        case 'z': case 'Z':
          if (!e.repeat) act('rotateCCW');
          break;
        case 'Shift': case 'Enter':
          e.preventDefault(); if (!e.repeat) act('drop');
          break;
        case 'c': case 'C':
          if (!e.repeat) act('switch');
          break;
        default: return;
      }
    });
    window.addEventListener('keyup', function (e) {
      switch (e.key) {
        case 'ArrowLeft': held.left = false; held.dir = held.right ? 1 : 0; held.dasT = 0; break;
        case 'ArrowRight': held.right = false; held.dir = held.left ? -1 : 0; held.dasT = 0; break;
        case 'ArrowDown': game.softDrop = false; break;
      }
    });
    function releaseAll() { held.left = held.right = false; held.dir = 0; game.softDrop = false; }
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { releaseAll(); if (active() && !game.paused) setPaused(true); }
    });

    function updateHeld(dt) {
      if (!held.dir || !game.canAct()) return;
      held.dasT += dt;
      if (held.dasT < DAS) return;
      held.arrT += dt;
      while (held.arrT >= ARR) { held.arrT -= ARR; if (!act(held.dir < 0 ? 'left' : 'right')) break; }
    }

    // ---------- on-screen touch buttons ----------
    document.querySelectorAll('#touchControls button').forEach(function (b) {
      var a = b.dataset.action;
      function down(e) {
        e.preventDefault();
        b.classList.add('pressed');
        if (b.setPointerCapture && e.pointerId != null) { try { b.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } }
        if (!active()) return;
        if (a === 'left' || a === 'right') {
          var d = a === 'left' ? -1 : 1;
          if (d < 0) held.left = true; else held.right = true;
          held.dir = d; held.dasT = 0; held.arrT = 0; act(a);
        } else if (a === 'down') { game.softDrop = true; act('down'); }
        else act(a);
      }
      function up() {
        b.classList.remove('pressed');
        if (a === 'left') { held.left = false; held.dir = held.right ? 1 : 0; }
        if (a === 'right') { held.right = false; held.dir = held.left ? -1 : 0; }
        if (a === 'down') game.softDrop = false;
      }
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    // ---------- swipe gestures on the board ----------
    var sw = null;
    boardInner.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || !game.canAct()) return;
      if (e.target.closest('.overlay.show')) return;
      e.preventDefault();
      sw = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: performance.now(), moved: false };
      try { boardInner.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    });
    boardInner.addEventListener('pointermove', function (e) {
      if (!sw || e.pointerId !== sw.id) return;
      var step = cell * 0.9;
      while (e.clientX - sw.ax > step) { act('right'); sw.ax += step; sw.moved = true; }
      while (sw.ax - e.clientX > step) { act('left'); sw.ax -= step; sw.moved = true; }
      // Only soft-drop when the drag is mostly vertical.
      if (Math.abs(e.clientY - sw.y0) > Math.abs(e.clientX - sw.x0)) {
        while (e.clientY - sw.ay > step) { act('down'); sw.ay += step; sw.moved = true; }
      } else sw.ay = e.clientY > sw.ay ? sw.ay : e.clientY;
    });
    function endSwipe(e) {
      if (!sw || e.pointerId !== sw.id) return;
      var dx = e.clientX - sw.x0, dy = e.clientY - sw.y0, dt = performance.now() - sw.t0;
      if (!sw.moved && Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 350) act('rotate');
      else if (dy > 50 && dt < 260 && dy > Math.abs(dx) * 1.5) act('drop');
      else if (-dy > 45 && -dy > Math.abs(dx) * 1.5 && dt < 450) act('switch');
      sw = null;
    }
    boardInner.addEventListener('pointerup', endSwipe);
    boardInner.addEventListener('pointercancel', function () { sw = null; });

    // ---------- game events -> effects ----------
    var LABELS = ['', 'Single', 'Double', 'Triple', 'TETRIS!'];
    game.onEvent = function (type, d) {
      if (type === 'clear') {
        d.cells.forEach(function (c) {
          var n = c.type === 'ball' ? 5 : 4;
          for (var i = 0; i < n; i++) {
            var ang = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 2.4);
            particles.push({
              x: (c.x + 0.5) * cell, y: (c.y + 0.5) * cell,
              vx: Math.cos(ang) * sp * cell * 0.06, vy: Math.sin(ang) * sp * cell * 0.06 - cell * 0.08,
              life: 0, max: 600 + Math.random() * 500, color: c.color,
              size: cell * (0.08 + Math.random() * 0.12), round: c.type === 'ball'
            });
          }
        });
        var midY = d.rows.reduce(function (a, b) { return a + b; }, 0) / d.rows.length;
        var label = (d.count <= 4 ? LABELS[d.count] : d.count + ' lines!') + (d.chain > 1 ? '  Chain ×' + d.chain : '');
        floaters.push({ text: '+' + d.points.toLocaleString(), sub: label + (d.balls ? '  ●×' + d.balls : ''), x: bw / 2, y: (midY + 0.5) * cell, life: 0, max: 1200 });
        flash = d.count >= 4 ? 1 : 0.5;
        shake = Math.max(shake, d.count >= 4 ? 8 : 3);
        bump(elScore); bump(elLines);
      } else if (type === 'harddrop') {
        shake = Math.max(shake, 4);
      } else if (type === 'levelup') {
        levelFlash = 1;
        floaters.push({ text: 'Level ' + d.level, sub: 'Faster!', x: bw / 2, y: bh * 0.35, life: 0, max: 1400, color: '#fde68a' });
        bump(elLevel);
      } else if (type === 'switch') {
        var cells = game.pieceCells();
        cells.forEach(function (c) {
          for (var i = 0; i < 4; i++) particles.push({
            x: (c[0] + 0.5) * cell, y: (c[1] + 0.5) * cell,
            vx: (Math.random() - 0.5) * cell * 0.15, vy: (Math.random() - 0.5) * cell * 0.15,
            life: 0, max: 400, color: game.cur.color, size: cell * 0.08, round: true
          });
        });
      } else if (type === 'gameover') {
        releaseAll();
        setTimeout(function () { gameOverOverlay(d); syncUI(true); }, 450);
      }
    };
    function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

    // ---------- rendering ----------
    function drawBackground() {
      var gr = ctx.createLinearGradient(0, 0, 0, bh);
      gr.addColorStop(0, '#0f1430');
      gr.addColorStop(1, '#0a0d20');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, bw, bh);
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 1; x < COLS; x++) { ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, bh); }
      for (var y = 1; y < ROWS; y++) { ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(bw, y * cell + 0.5); }
      ctx.stroke();
      // danger glow when the stack gets high
      var top = ROWS;
      for (var yy = 0; yy < ROWS && top === ROWS; yy++) for (var xx = 0; xx < COLS; xx++) if (game.board[yy][xx]) { top = yy; break; }
      if (top < 5 && active()) {
        var a = (5 - top) / 5 * 0.25 * (0.75 + 0.25 * Math.sin(performance.now() / 180));
        var dg = ctx.createLinearGradient(0, 0, 0, cell * 6);
        dg.addColorStop(0, 'rgba(244,63,94,' + a + ')');
        dg.addColorStop(1, 'rgba(244,63,94,0)');
        ctx.fillStyle = dg;
        ctx.fillRect(0, 0, bw, cell * 6);
      }
    }

    function drawBoardCells() {
      var b = game.board;
      var settling = game.phase === 'settling';
      var prog = settling ? Math.min(1, game.settleT / SETTLE_STEP) : 1;
      var clearing = game.phase === 'clearing';
      var ct = clearing ? Math.min(1, game.clearT / CLEAR_TIME) : 0;
      var clearSet = {};
      game.clearRows.forEach(function (y) { clearSet[y] = true; });
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          var c = b[y][x];
          if (!c) continue;
          var px = x * cell, py = y * cell;
          if (clearing && clearSet[y]) {
            // shrink & fade, staggered from the centre outwards
            var delay = Math.abs(x - (COLS - 1) / 2) / COLS * 0.5;
            var t = Math.max(0, Math.min(1, (ct - delay) / (1 - 0.5)));
            var sc = 1 - t;
            if (sc <= 0.02) continue;
            ctx.save();
            ctx.translate(px + cell / 2, py + cell / 2);
            ctx.scale(sc, sc);
            drawCell(ctx, c.type, -cell / 2, -cell / 2, cell, c.color, 1);
            ctx.restore();
            continue;
          }
          if (c.type === 'ball') {
            var sx = 1, sy = 1;
            if (settling && (c.fx !== x || c.fy !== y)) {
              var e = prog; // linear motion between cells reads as rolling
              px = (c.fx + (x - c.fx) * e) * cell;
              py = (c.fy + (y - c.fy) * e) * cell;
            }
            if (c.bounce >= 0) {
              var bp = bounceParams(c.bounce);
              py += bp.dy * cell; sx = bp.sx; sy = bp.sy;
            }
            drawCell(ctx, 'ball', px, py, cell, c.color, 1, sx, sy);
          } else {
            drawCell(ctx, 'block', px, py, cell, c.color, 1);
          }
        }
      }
      if (clearing) {
        // row flash
        var fa = Math.sin(Math.min(1, ct * 1.4) * Math.PI) * 0.75;
        game.clearRows.forEach(function (y) {
          var gr = ctx.createLinearGradient(0, 0, bw, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)');
          gr.addColorStop(0.5, 'rgba(255,255,255,' + fa + ')');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gr;
          ctx.fillRect(0, y * cell, bw, cell);
        });
      }
    }

    function drawCurrent() {
      var p = game.cur;
      if (!p || game.phase !== 'falling') return;
      var gy = game.ghostY();
      var cells = BallTetris.matrixCells(p.m);
      // ghost
      ctx.save();
      ctx.strokeStyle = rgba(p.color, 0.55);
      ctx.fillStyle = rgba(p.color, 0.08);
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.setLineDash([cell * 0.15, cell * 0.1]);
      cells.forEach(function (c) {
        var x = (p.x + c[0]) * cell, y = (gy + c[1]) * cell;
        if (gy + c[1] < 0) return;
        if (p.form === 'ball') { ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        else { roundRect(ctx, x + cell * 0.1, y + cell * 0.1, cell * 0.8, cell * 0.8, cell * 0.14); ctx.fill(); ctx.stroke(); }
      });
      ctx.restore();
      // piece
      cells.forEach(function (c) {
        var y = p.y + c[1];
        if (y < 0) return;
        drawCell(ctx, p.form, (p.x + c[0]) * cell, y * cell, cell, p.color, 1);
      });
    }

    function drawEffects(dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var q = particles[i];
        q.life += dt;
        if (q.life >= q.max) { particles.splice(i, 1); continue; }
        var k = dt / 16.67;
        q.x += q.vx * k; q.y += q.vy * k; q.vy += cell * 0.006 * k; q.vx *= Math.pow(0.985, k);
        var a = 1 - q.life / q.max;
        ctx.globalAlpha = a;
        ctx.fillStyle = q.color;
        if (q.round) { ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill(); }
        else { var s = q.size * (0.5 + a * 0.5); ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s); }
      }
      ctx.globalAlpha = 1;
      for (i = floaters.length - 1; i >= 0; i--) {
        var f = floaters[i];
        f.life += dt;
        if (f.life >= f.max) { floaters.splice(i, 1); continue; }
        var t = f.life / f.max;
        var y = f.y - t * cell * 2;
        ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.6) / 0.4);
        ctx.textAlign = 'center';
        ctx.font = '800 ' + Math.round(cell * 0.9) + 'px system-ui, sans-serif';
        ctx.lineWidth = Math.max(2, cell * 0.12);
        ctx.strokeStyle = 'rgba(10,12,30,0.8)';
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = f.color || '#ffffff';
        ctx.fillText(f.text, f.x, y);
        if (f.sub) {
          ctx.font = '700 ' + Math.round(cell * 0.5) + 'px system-ui, sans-serif';
          ctx.strokeText(f.sub, f.x, y + cell * 0.7);
          ctx.fillStyle = '#fde68a';
          ctx.fillText(f.sub, f.x, y + cell * 0.7);
        }
      }
      ctx.globalAlpha = 1;
      if (flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.12) + ')';
        ctx.fillRect(0, 0, bw, bh);
        flash = Math.max(0, flash - dt / 300);
      }
      if (levelFlash > 0) {
        ctx.strokeStyle = 'rgba(253,230,138,' + levelFlash + ')';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, bw - 4, bh - 4);
        levelFlash = Math.max(0, levelFlash - dt / 900);
      }
    }

    function render(dt) {
      ctx.save();
      if (shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.6);
        shake *= Math.pow(0.85, dt / 16.67);
      } else shake = 0;
      drawBackground();
      drawBoardCells();
      drawCurrent();
      drawEffects(dt);
      ctx.restore();
      drawNext();
    }

    function drawNext() {
      var w = nextCanvas._w || 120, h = nextCanvas._h || 120;
      nctx.clearRect(0, 0, w, h);
      var items = game.queue.length ? game.queue : [];
      if (!items.length) return;
      var showN = h > w * 1.1 ? Math.min(3, items.length) : 1;
      var slotH = h / (showN === 1 ? 1 : showN + 0.6);
      var y0 = 0;
      for (var i = 0; i < showN; i++) {
        var d = items[i];
        var m = BallTetris.SHAPES[d.shape];
        var cells = BallTetris.matrixCells(m);
        var minX = 9, maxX = 0, minY = 9, maxY = 0;
        cells.forEach(function (c) { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
        var cw = maxX - minX + 1, chh = maxY - minY + 1;
        var big = i === 0;
        var sh = big ? (showN === 1 ? h : slotH * 1.6) : slotH;
        var s = Math.min((w * (big ? 0.8 : 0.55)) / 4, (sh * 0.8) / Math.max(2, chh));
        s = Math.min(s, big ? 28 : 18);
        var ox = (w - cw * s) / 2, oy = y0 + (sh - chh * s) / 2;
        var color = colorFor(d.shape, d.form);
        cells.forEach(function (c) {
          drawCell(nctx, d.form, ox + (c[0] - minX) * s, oy + (c[1] - minY) * s, s, color, big ? 1 : 0.6);
        });
        y0 += sh;
      }
    }

    // ---------- DOM sync ----------
    var last = {};
    function setText(el, key, v) { if (last[key] !== v) { el.textContent = v; last[key] = v; } }
    function syncUI(force) {
      if (force) last = {};
      setText(elScore, 'score', game.score.toLocaleString());
      setText(elLevel, 'level', String(game.level));
      setText(elLines, 'lines', String(game.lines));
      setText(elHigh, 'high', Math.max(game.high, game.score).toLocaleString());
      var sigSw = game.switches + '|' + game.mode + '|' + game.canSwitch() + '|' + game.linesToCharge();
      if (last.sw !== sigSw) {
        last.sw = sigSw;
        var html = '';
        for (var i = 0; i < game.maxSwitches; i++) html += '<i class="dot' + (i < game.switches ? ' on' : '') + '"></i>';
        dotsEl.innerHTML = html;
        btnSwitch.disabled = !game.canSwitch();
        switchPanel.classList.toggle('disabled', game.mode === 'classic');
        switchHint.textContent = game.mode === 'classic'
          ? 'Switching is turned off in Classic mode.'
          : 'Turns the falling piece into balls (or back into a block), once per piece. ' +
            (game.switches < game.maxSwitches ? 'Next charge in ' + game.linesToCharge() + ' line' + (game.linesToCharge() === 1 ? '' : 's') + '.' : 'Charges full.');
      }
      var wave = game.waveInfo();
      var info = MODE_INFO[modeSel.value] + (wave ? ' Now: ' + (wave.form === 'ball' ? 'balls' : 'blocks') + ', ' + wave.left + ' left in this wave.' : '');
      setText(modeInfo, 'mode', info);
      var st = active() ? (game.paused ? 'paused' : 'run') : game.phase;
      if (last.st !== st) {
        last.st = st;
        btnStart.textContent = st === 'paused' ? 'Resume' : 'Start';
        btnStart.disabled = st === 'run';
        btnPause.disabled = !active();
        btnPause.textContent = st === 'paused' ? 'Resume' : 'Pause';
        btnRestart.disabled = game.phase === 'idle';
        modeSel.disabled = active();
      }
    }

    // ---------- main loop ----------
    var prev = performance.now();
    function frame(now) {
      var dt = Math.min(100, Math.max(0, now - prev));
      prev = now;
      if (!game.paused) {
        updateHeld(dt);
        game.update(dt);
      }
      render(game.paused ? 0 : dt);
      syncUI(false);
      requestAnimationFrame(frame);
    }

    // hooks for the arcade tab switcher
    root.blocksUI = {
      pause: function () { releaseAll(); if (active() && !game.paused) setPaused(true); },
      resize: resize
    };

    resize();
    startOverlay();
    syncUI(true);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})(typeof window !== 'undefined' ? window : globalThis);
