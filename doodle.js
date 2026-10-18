/*
 * Doodle Wheel: a snake game with cute animals, ropes, a bonus spin wheel
 * and original collectible creatures. Plain JavaScript, no dependencies.
 * The core engine (createDoodle) is DOM-free so it can be loaded in Node
 * for tests: require('./doodle.js').
 * Copyright (c) 2026 Harish Lohar. All rights reserved.
 */
(function (root) {
  'use strict';

  // ===================================================================
  //  Core engine (no DOM)
  // ===================================================================
  var COLS = 16, ROWS = 20;
  var START_LEN = 4;
  var ROPES_PER_LEVEL = 3;       // speed goes up a level every 3 ropes
  var LATE_ROPES = 6;            // creatures start appearing after 6 ropes...
  var LATE_LEVEL = 4;            // ...or from level 4
  var ROPE_TTL = 7000;           // ms a rope stays before vanishing
  var ROPE_FIRST = 3000;
  var ROPE_GAP_MIN = 3000, ROPE_GAP_MAX = 6500;
  var CREATURE_TTL = 9000;
  var CREATURE_GAP_MIN = 5000, CREATURE_GAP_MAX = 8000;
  var WHEEL_SEGMENTS = 10;
  var SEG_DEG = 360 / WHEEL_SEGMENTS;
  var SPIN_TIME = 3400;          // ms
  var AUTO_SPIN = 2000;          // idle ms before the wheel spins itself
  var LANDED_HOLD = 1300;        // ms the result is shown
  var COUNTDOWN = 1800;          // ms "3-2-1" before play resumes
  var ANIMAL_POINTS = 10;        // x level
  var ROPE_POINTS = 50;          // x level, then x wheel result
  var CREATURE_POINTS = 200;     // x level (x2 for a new species)

  var ANIMALS = [
    { id: 'bunny', emoji: '\u{1F430}', name: 'Bunny' },
    { id: 'kitty', emoji: '\u{1F431}', name: 'Kitty' },
    { id: 'puppy', emoji: '\u{1F436}', name: 'Puppy' },
    { id: 'chick', emoji: '\u{1F425}', name: 'Chick' },
    { id: 'panda', emoji: '\u{1F43C}', name: 'Panda' },
    { id: 'hamster', emoji: '\u{1F439}', name: 'Hamster' },
    { id: 'fox', emoji: '\u{1F98A}', name: 'Fox' },
    { id: 'koala', emoji: '\u{1F428}', name: 'Koala' }
  ];

  // Original creatures (not based on any existing franchise characters).
  var CREATURES = [
    { id: 'zappip', name: 'Zappip', kind: 'Spark', color: '#facc15' },
    { id: 'embrix', name: 'Embrix', kind: 'Ember', color: '#fb923c' },
    { id: 'shellow', name: 'Shellow', kind: 'Tide', color: '#2dd4bf' },
    { id: 'budlet', name: 'Budlet', kind: 'Leaf', color: '#4ade80' },
    { id: 'wispo', name: 'Wispo', kind: 'Mist', color: '#c4b5fd' },
    { id: 'pebbit', name: 'Pebbit', kind: 'Stone', color: '#a8a29e' },
    { id: 'frostail', name: 'Frostail', kind: 'Frost', color: '#7dd3fc' },
    { id: 'glimmoth', name: 'Glimmoth', kind: 'Glow', color: '#f9a8d4' }
  ];
  var CREATURE_BY_ID = {};
  CREATURES.forEach(function (c) { CREATURE_BY_ID[c.id] = c; });

  function mod(a, n) { return ((a % n) + n) % n; }

  // Wheel geometry. Segment k (value k) covers [ (k-1)*36, k*36 ) degrees
  // measured clockwise from the top pointer when the wheel rotation is 0.
  // A clockwise rotation of R degrees puts wheel-angle -R under the pointer.
  function wheelSegmentAt(rotationDeg) {
    var a = mod(-rotationDeg, 360);
    return Math.floor(a / SEG_DEG) % WHEEL_SEGMENTS + 1;
  }
  function wheelTargetAngle(fromDeg, value, jitterDeg, spins) {
    var center = (value - 1) * SEG_DEG + SEG_DEG / 2 + (jitterDeg || 0);
    var t = -center;
    var min = fromDeg + (spins || 0) * 360;
    t += Math.ceil((min - t) / 360) * 360;
    return t;
  }
  function easeOutQuart(p) { return 1 - Math.pow(1 - p, 4); }

  function createDoodle(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var storage = opts.storage || null;
    var g = {
      cols: opts.cols || COLS, rows: opts.rows || ROWS,
      phase: 'idle', paused: false,
      snake: [], prev: [], dir: { x: 1, y: 0 }, queue: [], grow: 0,
      animals: [], rope: null, creatures: [],
      score: 0, ropes: 0, level: 1, eaten: 0,
      high: 0, bestCollection: 0,
      collection: [], caught: {},
      tickAcc: 0, ropeTimer: ROPE_FIRST, creatureTimer: 0,
      wheel: null, wheelAngle: 0, countdown: 0,
      time: 0, cause: null, onEvent: null
    };

    function emit(type, data) { if (g.onEvent) { try { g.onEvent(type, data || {}); } catch (e) { if (typeof console !== 'undefined') console.error(e); } } }
    function load(key) { if (!storage) return 0; var v = parseInt(storage.get(key), 10); return isFinite(v) ? v : 0; }
    function save(key, v) { if (storage) storage.set(key, String(v)); }
    g.high = load('doodlewheel-high');
    g.bestCollection = load('doodlewheel-best-collection');

    function rint(n) { return Math.min(n - 1, Math.floor(rng() * n)); }
    function inBounds(x, y) { return x >= 0 && y >= 0 && x < g.cols && y < g.rows; }
    function occupied(x, y) {
      var i;
      for (i = 0; i < g.snake.length; i++) if (g.snake[i].x === x && g.snake[i].y === y) return true;
      for (i = 0; i < g.animals.length; i++) if (g.animals[i].x === x && g.animals[i].y === y) return true;
      for (i = 0; i < g.creatures.length; i++) if (g.creatures[i].x === x && g.creatures[i].y === y) return true;
      if (g.rope && g.rope.x === x && g.rope.y === y) return true;
      return false;
    }
    function nearHead(x, y, d) {
      var h = g.snake[0];
      return h && Math.abs(h.x - x) + Math.abs(h.y - y) < d;
    }
    function freeCell(minHeadDist) {
      var tries, x, y;
      for (tries = 0; tries < 300; tries++) {
        x = rint(g.cols); y = rint(g.rows);
        if (!occupied(x, y) && !nearHead(x, y, minHeadDist || 0)) return { x: x, y: y };
      }
      for (y = 0; y < g.rows; y++) for (x = 0; x < g.cols; x++) if (!occupied(x, y)) return { x: x, y: y };
      return null;
    }

    g.isLate = function () { return g.ropes >= LATE_ROPES || g.level >= LATE_LEVEL; };
    g.interval = function () { return Math.max(60, 165 - (g.level - 1) * 14); };
    g.distinctCaught = function () { return Object.keys(g.caught).length; };

    function animalTarget() { return g.isLate() ? 3 : 2; }
    function spawnAnimal() {
      var c = freeCell(2);
      if (!c) return null;
      var a = { x: c.x, y: c.y, kind: ANIMALS[rint(ANIMALS.length)].id, born: g.time };
      g.animals.push(a);
      return a;
    }
    function fillAnimals() { while (g.animals.length < animalTarget()) if (!spawnAnimal()) break; }

    function pickCreatureKind() {
      var missing = CREATURES.filter(function (c) { return !g.caught[c.id]; });
      if (missing.length && rng() < 0.7) return missing[rint(missing.length)].id;
      return CREATURES[rint(CREATURES.length)].id;
    }
    // Creatures appear along/next to the current rope.
    function spawnCreatureNearRope() {
      var r = g.rope;
      if (!r) return null;
      var spots = [], dx, dy;
      for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        var x = r.x + dx, y = r.y + dy;
        if (inBounds(x, y) && !occupied(x, y) && !nearHead(x, y, 2)) spots.push({ x: x, y: y, d: Math.abs(dx) + Math.abs(dy) });
      }
      if (!spots.length) return null;
      var close = spots.filter(function (s) { return s.d <= 2; });
      var pool = close.length ? close : spots;
      var s = pool[rint(pool.length)];
      var c = { x: s.x, y: s.y, kind: pickCreatureKind(), ttl: CREATURE_TTL, max: CREATURE_TTL, born: g.time };
      g.creatures.push(c);
      emit('creatureSpawn', c);
      return c;
    }
    g.spawnRope = function (at) {
      var c = at || freeCell(4);
      if (!c) return null;
      g.rope = { x: c.x, y: c.y, ttl: ROPE_TTL, max: ROPE_TTL, born: g.time };
      g.ropeTimer = ROPE_GAP_MIN + rng() * (ROPE_GAP_MAX - ROPE_GAP_MIN);
      emit('ropeSpawn', g.rope);
      if (g.isLate()) {
        var n = g.ropes >= LATE_ROPES + 6 ? 2 : 1;
        for (var i = 0; i < n; i++) spawnCreatureNearRope();
        g.creatureTimer = CREATURE_GAP_MIN + rng() * (CREATURE_GAP_MAX - CREATURE_GAP_MIN);
      }
      return g.rope;
    };
    g.spawnCreatureNearRope = spawnCreatureNearRope;

    g.start = function () {
      var cx = Math.floor(g.cols / 2) - 2, cy = Math.floor(g.rows / 2);
      g.snake = [];
      for (var i = 0; i < START_LEN; i++) g.snake.push({ x: cx - i, y: cy });
      g.prev = g.snake.map(function (s) { return { x: s.x, y: s.y }; });
      g.dir = { x: 1, y: 0 }; g.queue = []; g.grow = 0;
      g.animals = []; g.rope = null; g.creatures = [];
      g.score = 0; g.ropes = 0; g.level = 1; g.eaten = 0;
      g.collection = []; g.caught = {};
      g.tickAcc = 0; g.ropeTimer = ROPE_FIRST; g.creatureTimer = 0;
      g.wheel = null; g.countdown = 0; g.cause = null; g.paused = false;
      g.phase = 'playing';
      fillAnimals();
      emit('start');
    };

    g.setDir = function (dx, dy) {
      if (g.phase !== 'playing' && g.phase !== 'countdown') return false;
      if (g.paused) return false;
      var last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
      if (last.x === dx && last.y === dy) return false;
      if (last.x === -dx && last.y === -dy) return false;
      if (g.queue.length >= 3) return false;
      g.queue.push({ x: dx, y: dy });
      return true;
    };

    function die(cause) {
      g.phase = 'over'; g.cause = cause; g.wheel = null;
      var newRecord = g.score > g.high;
      if (newRecord) { g.high = g.score; save('doodlewheel-high', g.high); }
      var newBestCollection = g.collection.length > g.bestCollection;
      if (newBestCollection) { g.bestCollection = g.collection.length; save('doodlewheel-best-collection', g.bestCollection); }
      emit('over', { cause: cause, score: g.score, high: g.high, newRecord: newRecord,
        collection: g.collection.slice(), bestCollection: g.bestCollection, newBestCollection: newBestCollection });
    }

    function collectRope() {
      var r = g.rope;
      g.rope = null;
      g.ropes++;
      var base = ROPE_POINTS * g.level;
      var wasLate = g.isLate();
      var newLevel = 1 + Math.floor(g.ropes / ROPES_PER_LEVEL);
      if (newLevel > g.level) { g.level = newLevel; emit('level', { level: g.level }); }
      if (!wasLate && g.isLate()) emit('late');
      g.ropeTimer = ROPE_GAP_MIN + rng() * (ROPE_GAP_MAX - ROPE_GAP_MIN);
      g.phase = 'wheel';
      g.wheel = { state: 'ready', angle: g.wheelAngle, idle: 0, base: base, result: null, from: 0, to: 0, t: 0, hold: 0, points: 0, landed: null };
      emit('rope', { x: r.x, y: r.y, ropes: g.ropes, base: base });
    }

    function catchCreature(idx) {
      var c = g.creatures.splice(idx, 1)[0];
      var isNew = !g.caught[c.kind];
      g.caught[c.kind] = (g.caught[c.kind] || 0) + 1;
      g.collection.push(c.kind);
      var pts = CREATURE_POINTS * g.level * (isNew ? 2 : 1);
      g.score += pts;
      emit('catch', { x: c.x, y: c.y, kind: c.kind, name: CREATURE_BY_ID[c.kind].name, points: pts, isNew: isNew, count: g.collection.length });
    }

    g.step = function () {
      if (g.queue.length) g.dir = g.queue.shift();
      var h = g.snake[0];
      var nx = h.x + g.dir.x, ny = h.y + g.dir.y;
      g.prev = g.snake.map(function (s) { return { x: s.x, y: s.y }; });
      if (!inBounds(nx, ny)) { die('wall'); return; }
      var body = g.grow > 0 ? g.snake : g.snake.slice(0, -1);
      for (var i = 0; i < body.length; i++) if (body[i].x === nx && body[i].y === ny) { die('self'); return; }
      g.snake.unshift({ x: nx, y: ny });
      if (g.grow > 0) g.grow--; else g.snake.pop();

      for (i = 0; i < g.animals.length; i++) {
        var a = g.animals[i];
        if (a.x === nx && a.y === ny) {
          g.animals.splice(i, 1);
          g.grow += 1; g.eaten++;
          var pts = ANIMAL_POINTS * g.level;
          g.score += pts;
          emit('eat', { x: nx, y: ny, kind: a.kind, points: pts });
          break;
        }
      }
      for (i = 0; i < g.creatures.length; i++) if (g.creatures[i].x === nx && g.creatures[i].y === ny) { catchCreature(i); break; }
      if (g.rope && g.rope.x === nx && g.rope.y === ny) collectRope();
      fillAnimals();
    };

    g.spin = function () {
      var w = g.wheel;
      if (g.phase !== 'wheel' || !w || w.state !== 'ready' || g.paused) return null;
      var n = 1 + rint(WHEEL_SEGMENTS);
      var jitter = (rng() - 0.5) * (SEG_DEG - 10);   // stay well inside the segment
      var spins = 4 + rint(2);
      w.result = n; w.from = w.angle; w.to = wheelTargetAngle(w.angle, n, jitter, spins);
      w.t = 0; w.state = 'spinning';
      emit('spin', { result: n });
      return n;
    };

    function updateTimers(dt) {
      if (g.rope) {
        g.rope.ttl -= dt;
        if (g.rope.ttl <= 0) { emit('ropeGone', g.rope); g.rope = null; g.ropeTimer = ROPE_GAP_MIN * 0.6 + rng() * 2000; }
      } else {
        g.ropeTimer -= dt;
        if (g.ropeTimer <= 0) g.spawnRope();
      }
      for (var i = g.creatures.length - 1; i >= 0; i--) {
        g.creatures[i].ttl -= dt;
        if (g.creatures[i].ttl <= 0) emit('creatureGone', g.creatures.splice(i, 1)[0]);
      }
      if (g.isLate() && g.rope) {
        g.creatureTimer -= dt;
        if (g.creatureTimer <= 0) {
          if (g.creatures.length < 3) spawnCreatureNearRope();
          g.creatureTimer = CREATURE_GAP_MIN + rng() * (CREATURE_GAP_MAX - CREATURE_GAP_MIN);
        }
      }
    }

    g.update = function (dt) {
      if (g.paused || g.phase === 'idle' || g.phase === 'over') return;
      g.time += dt;
      if (g.phase === 'playing') {
        g.tickAcc += dt;
        var iv = g.interval();
        while (g.tickAcc >= iv && g.phase === 'playing') { g.tickAcc -= iv; g.step(); }
        if (g.phase === 'playing') updateTimers(dt);
        else if (g.phase !== 'over') g.tickAcc = 0;
      } else if (g.phase === 'wheel') {
        var w = g.wheel;
        if (w.state === 'ready') {
          w.idle += dt;
          if (w.idle >= AUTO_SPIN) g.spin();
        } else if (w.state === 'spinning') {
          w.t += dt;
          var p = Math.min(1, w.t / SPIN_TIME);
          w.angle = w.from + (w.to - w.from) * easeOutQuart(p);
          if (p >= 1) {
            w.angle = w.to;
            w.landed = wheelSegmentAt(w.angle);
            w.points = w.base * w.result;
            g.score += w.points;
            w.state = 'landed'; w.hold = 0;
            emit('wheel', { result: w.result, landed: w.landed, points: w.points });
          }
        } else if (w.state === 'landed') {
          w.hold += dt;
          if (w.hold >= LANDED_HOLD) {
            g.wheelAngle = mod(w.angle, 360);
            g.phase = 'countdown'; g.countdown = COUNTDOWN;
            emit('countdown');
          }
        }
      } else if (g.phase === 'countdown') {
        g.countdown -= dt;
        if (g.countdown <= 0) { g.countdown = 0; g.wheel = null; g.phase = 'playing'; g.tickAcc = 0; emit('resume'); }
      }
    };

    g.isActive = function () { return g.phase === 'playing' || g.phase === 'wheel' || g.phase === 'countdown'; };
    g.togglePause = function (force) {
      if (!g.isActive()) return;
      g.paused = typeof force === 'boolean' ? force : !g.paused;
      emit(g.paused ? 'pause' : 'unpause');
    };
    return g;
  }

  var api = {
    createDoodle: createDoodle, wheelSegmentAt: wheelSegmentAt, wheelTargetAngle: wheelTargetAngle,
    COLS: COLS, ROWS: ROWS, ANIMALS: ANIMALS, CREATURES: CREATURES, WHEEL_SEGMENTS: WHEEL_SEGMENTS,
    SPIN_TIME: SPIN_TIME, AUTO_SPIN: AUTO_SPIN, LANDED_HOLD: LANDED_HOLD, COUNTDOWN: COUNTDOWN,
    ROPES_PER_LEVEL: ROPES_PER_LEVEL, LATE_ROPES: LATE_ROPES, ROPE_TTL: ROPE_TTL, CREATURE_TTL: CREATURE_TTL
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DoodleWheel = api;

  // ===================================================================
  //  Rendering + UI (browser only)
  // ===================================================================
  if (typeof document === 'undefined') return;

  var TAU = Math.PI * 2;
  var SEG_COLORS = ['#f43f5e', '#f97316', '#facc15', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];
  api.SEG_COLORS = SEG_COLORS;

  function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function ellipse(ctx, x, y, rx, ry, rot, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function eye(ctx, x, y, r) {
    circle(ctx, x, y, r, '#1e1b2e');
    circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.38, '#fff');
    circle(ctx, x + r * 0.3, y + r * 0.3, r * 0.15, 'rgba(255,255,255,0.8)');
  }
  function smile(ctx, x, y, w, col) {
    ctx.beginPath(); ctx.arc(x, y, w, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = col || '#1e1b2e'; ctx.lineWidth = Math.max(1, w * 0.4); ctx.lineCap = 'round'; ctx.stroke();
  }
  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function bolt(ctx, x, y, s, rot, fill) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    poly(ctx, [[-0.15 * s, -0.5 * s], [0.25 * s, -0.5 * s], [0.05 * s, -0.08 * s], [0.3 * s, -0.08 * s], [-0.2 * s, 0.55 * s], [-0.02 * s, 0.08 * s], [-0.3 * s, 0.08 * s]], fill, 'rgba(0,0,0,0.25)', s * 0.05);
    ctx.restore();
  }
  function flame(ctx, x, y, s, t) {
    var f = 1 + Math.sin(t * 0.02) * 0.12;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, f);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.bezierCurveTo(s * 0.7, -s * 0.3, s * 0.55, s * 0.5, 0, s * 0.5); ctx.bezierCurveTo(-s * 0.55, s * 0.5, -s * 0.7, -s * 0.3, 0, -s);
    ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.bezierCurveTo(s * 0.4, -s * 0.05, s * 0.3, s * 0.45, 0, s * 0.45); ctx.bezierCurveTo(-s * 0.3, s * 0.45, -s * 0.4, -s * 0.05, 0, -s * 0.45);
    ctx.fillStyle = '#fde047'; ctx.fill();
    ctx.restore();
  }

  // Draws one creature centred at (0,0), roughly s pixels across.
  function drawCreature(ctx, id, s, t) {
    t = t || 0;
    var r = s / 2;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (id) {
      case 'zappip': { // round spark mouse with lightning antennae and a zigzag tail
        poly(ctx, [[r * 0.55, r * 0.35], [r * 0.95, r * 0.05], [r * 0.8, r * 0.3], [r * 1.05, r * 0.2], [r * 0.7, r * 0.6]], '#eab308');
        bolt(ctx, -r * 0.42, -r * 0.82, r * 0.7, -0.35 + Math.sin(t * 0.01) * 0.08, '#fde047');
        bolt(ctx, r * 0.42, -r * 0.82, r * 0.7, 0.35 - Math.sin(t * 0.01) * 0.08, '#fde047');
        ellipse(ctx, 0, r * 0.12, r * 0.78, r * 0.7, 0, '#facc15');
        ellipse(ctx, 0, r * 0.35, r * 0.45, r * 0.32, 0, '#fef08a');
        eye(ctx, -r * 0.3, 0, r * 0.15); eye(ctx, r * 0.3, 0, r * 0.15);
        circle(ctx, -r * 0.55, r * 0.25, r * 0.12, '#38bdf8'); circle(ctx, r * 0.55, r * 0.25, r * 0.12, '#38bdf8');
        smile(ctx, 0, r * 0.18, r * 0.12);
        break;
      }
      case 'embrix': { // ember gecko with a flame crest
        ctx.beginPath(); ctx.moveTo(r * 0.4, r * 0.5); ctx.quadraticCurveTo(r * 1.05, r * 0.6, r * 0.9, r * 0.05);
        ctx.strokeStyle = '#ea580c'; ctx.lineWidth = r * 0.22; ctx.stroke();
        circle(ctx, r * 0.9, r * 0.0, r * 0.12, '#fde047');
        ellipse(ctx, 0, r * 0.4, r * 0.55, r * 0.42, 0, '#fb923c');
        ellipse(ctx, 0, r * 0.48, r * 0.32, r * 0.28, 0, '#fed7aa');
        ellipse(ctx, -r * 0.42, r * 0.78, r * 0.16, r * 0.1, 0, '#ea580c'); ellipse(ctx, r * 0.42, r * 0.78, r * 0.16, r * 0.1, 0, '#ea580c');
        flame(ctx, 0, -r * 0.72, r * 0.36, t);
        ellipse(ctx, 0, -r * 0.18, r * 0.58, r * 0.46, 0, '#fb923c');
        circle(ctx, -r * 0.35, -r * 0.42, r * 0.07, '#fde047'); circle(ctx, r * 0.3, -r * 0.5, r * 0.06, '#fde047');
        eye(ctx, -r * 0.24, -r * 0.18, r * 0.14); eye(ctx, r * 0.24, -r * 0.18, r * 0.14);
        smile(ctx, 0, -r * 0.05, r * 0.12);
        break;
      }
      case 'shellow': { // tide turtle with a spiral shell
        ellipse(ctx, -r * 0.55, r * 0.6, r * 0.18, r * 0.12, 0, '#5eead4'); ellipse(ctx, r * 0.55, r * 0.6, r * 0.18, r * 0.12, 0, '#5eead4');
        ellipse(ctx, 0, r * 0.25, r * 0.85, r * 0.55, 0, '#0e7490');
        ctx.beginPath();
        for (var a = 0; a < TAU * 2.2; a += 0.2) { var rr = r * 0.05 + a * r * 0.05; ctx.lineTo(r * 0.1 + Math.cos(a) * rr * 1.3, r * 0.25 + Math.sin(a) * rr * 0.8); }
        ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = r * 0.08; ctx.stroke();
        circle(ctx, -r * 0.62, -r * 0.25, r * 0.42, '#5eead4');
        eye(ctx, -r * 0.75, -r * 0.32, r * 0.11); eye(ctx, -r * 0.45, -r * 0.32, r * 0.11);
        smile(ctx, -r * 0.6, -r * 0.18, r * 0.1);
        ctx.save(); ctx.translate(-r * 0.62, -r * 0.82 + Math.sin(t * 0.008) * r * 0.05);
        ctx.beginPath(); ctx.moveTo(0, -r * 0.18); ctx.quadraticCurveTo(r * 0.14, 0, 0, r * 0.08); ctx.quadraticCurveTo(-r * 0.14, 0, 0, -r * 0.18);
        ctx.fillStyle = '#93c5fd'; ctx.fill(); ctx.restore();
        break;
      }
      case 'budlet': { // leaf sprout bulb
        var sway = Math.sin(t * 0.006) * 0.2;
        ctx.save(); ctx.translate(0, -r * 0.45); ctx.rotate(sway);
        ellipse(ctx, -r * 0.28, -r * 0.3, r * 0.32, r * 0.14, -0.6, '#16a34a');
        ellipse(ctx, r * 0.28, -r * 0.3, r * 0.32, r * 0.14, 0.6, '#22c55e');
        ctx.fillStyle = '#15803d'; ctx.fillRect(-r * 0.04, -r * 0.3, r * 0.08, r * 0.3);
        ctx.restore();
        ellipse(ctx, 0, r * 0.15, r * 0.78, r * 0.65, 0, '#4ade80');
        circle(ctx, -r * 0.5, -r * 0.05, r * 0.08, '#22c55e'); circle(ctx, r * 0.45, r * 0.45, r * 0.1, '#22c55e'); circle(ctx, r * 0.55, -r * 0.1, r * 0.06, '#22c55e');
        eye(ctx, -r * 0.27, r * 0.08, r * 0.14); eye(ctx, r * 0.27, r * 0.08, r * 0.14);
        circle(ctx, -r * 0.48, r * 0.3, r * 0.1, 'rgba(244,114,182,0.6)'); circle(ctx, r * 0.48, r * 0.3, r * 0.1, 'rgba(244,114,182,0.6)');
        smile(ctx, 0, r * 0.25, r * 0.12);
        break;
      }
      case 'wispo': { // mist puff ghost
        var fy = Math.sin(t * 0.005) * r * 0.08;
        ctx.translate(0, fy);
        ctx.shadowColor = 'rgba(196,181,253,0.8)'; ctx.shadowBlur = r * 0.6;
        ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.6); ctx.lineTo(-r * 0.7, -r * 0.05);
        ctx.arc(0, -r * 0.05, r * 0.7, Math.PI, 0);
        ctx.lineTo(r * 0.7, r * 0.6);
        for (var k = 0; k < 4; k++) { var x0 = r * 0.7 - k * r * 0.35; ctx.quadraticCurveTo(x0 - r * 0.175, r * (k % 2 ? 0.85 : 0.35), x0 - r * 0.35, r * 0.6); }
        ctx.closePath(); ctx.fillStyle = 'rgba(221,214,254,0.95)'; ctx.fill();
        ctx.shadowBlur = 0;
        ellipse(ctx, 0, -r * 0.82, r * 0.12, r * 0.2, 0, '#a78bfa');
        eye(ctx, -r * 0.26, -r * 0.08, r * 0.15); eye(ctx, r * 0.26, -r * 0.08, r * 0.15);
        ellipse(ctx, 0, r * 0.18, r * 0.1, r * 0.12, 0, '#6d28d9');
        break;
      }
      case 'pebbit': { // rock pup
        poly(ctx, [[-r * 0.62, -r * 0.35], [-r * 0.85, -r * 0.85], [-r * 0.3, -r * 0.6]], '#78716c');
        poly(ctx, [[r * 0.62, -r * 0.35], [r * 0.85, -r * 0.85], [r * 0.3, -r * 0.6]], '#78716c');
        poly(ctx, [[-r * 0.75, -r * 0.2], [-r * 0.45, -r * 0.65], [r * 0.4, -r * 0.68], [r * 0.8, -r * 0.15], [r * 0.7, r * 0.6], [r * 0.1, r * 0.8], [-r * 0.65, r * 0.6]], '#a8a29e', '#78716c', r * 0.08);
        circle(ctx, -r * 0.4, r * 0.45, r * 0.09, '#d6d3d1'); circle(ctx, r * 0.5, -r * 0.35, r * 0.07, '#d6d3d1'); circle(ctx, r * 0.45, r * 0.4, r * 0.06, '#78716c');
        ellipse(ctx, 0, r * 0.25, r * 0.3, r * 0.22, 0, '#e7e5e4');
        eye(ctx, -r * 0.28, -r * 0.1, r * 0.13); eye(ctx, r * 0.28, -r * 0.1, r * 0.13);
        ellipse(ctx, 0, r * 0.15, r * 0.1, r * 0.07, 0, '#292524');
        smile(ctx, 0, r * 0.25, r * 0.1);
        break;
      }
      case 'frostail': { // frost cub with a fluffy tail
        ellipse(ctx, r * 0.55, r * 0.25, r * 0.38, r * 0.6, 0.6 + Math.sin(t * 0.006) * 0.12, '#e0f2fe');
        poly(ctx, [[-r * 0.6, -r * 0.2], [-r * 0.55, -r * 0.95], [-r * 0.1, -r * 0.45]], '#7dd3fc');
        poly(ctx, [[r * 0.4, -r * 0.2], [r * 0.35, -r * 0.95], [-r * 0.05, -r * 0.45]], '#7dd3fc');
        poly(ctx, [[-r * 0.5, -r * 0.35], [-r * 0.48, -r * 0.75], [-r * 0.22, -r * 0.45]], '#f0f9ff');
        poly(ctx, [[r * 0.3, -r * 0.35], [r * 0.28, -r * 0.75], [r * 0.05, -r * 0.45]], '#f0f9ff');
        ellipse(ctx, -r * 0.1, r * 0.1, r * 0.65, r * 0.58, 0, '#7dd3fc');
        ellipse(ctx, -r * 0.1, r * 0.35, r * 0.35, r * 0.25, 0, '#f0f9ff');
        eye(ctx, -r * 0.35, 0, r * 0.13); eye(ctx, r * 0.15, 0, r * 0.13);
        circle(ctx, -r * 0.1, r * 0.2, r * 0.07, '#0c4a6e');
        ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.06;
        for (var q = 0; q < 3; q++) { var aa = q * Math.PI / 3 + t * 0.002; ctx.beginPath(); ctx.moveTo(r * 0.75 + Math.cos(aa) * r * 0.15, -r * 0.45 + Math.sin(aa) * r * 0.15); ctx.lineTo(r * 0.75 - Math.cos(aa) * r * 0.15, -r * 0.45 - Math.sin(aa) * r * 0.15); ctx.stroke(); }
        break;
      }
      case 'glimmoth': { // glow moth
        var flap = 0.85 + Math.sin(t * 0.012) * 0.15;
        ctx.save(); ctx.scale(flap, 1);
        ellipse(ctx, -r * 0.5, -r * 0.2, r * 0.5, r * 0.4, -0.4, '#f0abfc'); ellipse(ctx, r * 0.5, -r * 0.2, r * 0.5, r * 0.4, 0.4, '#f0abfc');
        ellipse(ctx, -r * 0.45, r * 0.4, r * 0.32, r * 0.25, 0.4, '#e879f9'); ellipse(ctx, r * 0.45, r * 0.4, r * 0.32, r * 0.25, -0.4, '#e879f9');
        circle(ctx, -r * 0.55, -r * 0.25, r * 0.14, '#fde047'); circle(ctx, r * 0.55, -r * 0.25, r * 0.14, '#fde047');
        ctx.restore();
        ctx.strokeStyle = '#be185d'; ctx.lineWidth = r * 0.06;
        ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.45); ctx.quadraticCurveTo(-r * 0.2, -r * 0.8, -r * 0.35, -r * 0.85); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.45); ctx.quadraticCurveTo(r * 0.2, -r * 0.8, r * 0.35, -r * 0.85); ctx.stroke();
        ellipse(ctx, 0, r * 0.05, r * 0.28, r * 0.5, 0, '#f9a8d4');
        eye(ctx, -r * 0.12, -r * 0.15, r * 0.1); eye(ctx, r * 0.12, -r * 0.15, r * 0.1);
        smile(ctx, 0, -r * 0.02, r * 0.08);
        break;
      }
    }
    ctx.restore();
  }
  api.drawCreature = drawCreature;

  // A coiled rope seen from above, centred at (0,0) with radius r.
  function drawRope(ctx, r) {
    var turns = 2.6, pts = [];
    for (var a = 0; a <= TAU * turns; a += 0.18) {
      var rr = r * 0.18 + (r * 0.62) * (a / (TAU * turns));
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    var last = pts[pts.length - 1];
    pts.push([last[0] + r * 0.25, last[1] + r * 0.18]);
    function path() { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(); ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = r * 0.3; ctx.stroke();
    path(); ctx.strokeStyle = '#c08a4a'; ctx.lineWidth = r * 0.22; ctx.stroke();
    path(); ctx.setLineDash([r * 0.07, r * 0.11]); ctx.strokeStyle = '#7c5127'; ctx.lineWidth = r * 0.2; ctx.stroke(); ctx.setLineDash([]);
    path(); ctx.strokeStyle = 'rgba(255,236,200,0.35)'; ctx.lineWidth = r * 0.05; ctx.stroke();
    // frayed end
    var e = pts[pts.length - 1];
    ctx.strokeStyle = '#d6a76a'; ctx.lineWidth = r * 0.04;
    for (var f = -1; f <= 1; f++) { ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(e[0] + r * 0.16, e[1] + r * (0.06 + f * 0.08)); ctx.stroke(); }
  }
  api.drawRope = drawRope;

  function initUI() {
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $('dwBoard');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var boardWrap = $('dwBoardWrap'), boardInner = $('dwBoardInner');
    var overlay = $('dwOverlay'), overlayCard = $('dwOverlayCard'), spinBtn = $('dwSpin');
    var btnStart = $('dwStart'), btnPause = $('dwPause'), btnRestart = $('dwRestart');
    var elScore = $('dwScore'), elRopes = $('dwRopes'), elLevel = $('dwLevel'), elHigh = $('dwHigh');
    var trayEl = $('dwTray'), trayCount = $('dwTrayCount');

    var storage = {
      get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    };
    var game = createDoodle({ storage: storage });
    root.doodle = game; // handy for debugging / automation
    var G = game;

    var cell = 24, bw = 384, bh = 480, dpr = 1;
    var particles = [], floaters = [], flyers = [];
    var shake = 0, flash = 0, deathT = 0, popT = 0, lateBanner = 0, levelBanner = 0;
    var animalCache = {};

    function isCurrent() { return !root.arcade || root.arcade.current === 'doodle'; }

    // ---------- sizing ----------
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      var aw = boardWrap.clientWidth, ah = boardWrap.clientHeight;
      if (!aw || !ah) return;
      cell = Math.max(8, Math.floor(Math.min(aw / G.cols, ah / G.rows)));
      bw = cell * G.cols; bh = cell * G.rows;
      boardInner.style.width = bw + 'px'; boardInner.style.height = bh + 'px';
      canvas.style.width = bw + 'px'; canvas.style.height = bh + 'px';
      canvas.width = Math.round(bw * dpr); canvas.height = Math.round(bh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      animalCache = {};
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(boardWrap);

    // ---------- tray ----------
    var slots = {};
    CREATURES.forEach(function (c) {
      var s = document.createElement('div');
      s.className = 'dw-slot'; s.title = c.name + ' (' + c.kind + ')';
      var cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      var n = document.createElement('span'); n.className = 'dw-count';
      var lab = document.createElement('span'); lab.className = 'dw-slot-name'; lab.textContent = c.name;
      s.appendChild(cv); s.appendChild(n); s.appendChild(lab);
      trayEl.appendChild(s);
      var cx = cv.getContext('2d'); cx.translate(32, 33); drawCreature(cx, c.id, 50, 0);
      slots[c.id] = { el: s, count: n };
    });
    function creatureImg(id) {
      var cv = document.createElement('canvas'); cv.width = 72; cv.height = 72;
      var cx = cv.getContext('2d'); cx.translate(36, 37); drawCreature(cx, id, 56, 0);
      return cv.toDataURL();
    }
    function syncTray(popId) {
      CREATURES.forEach(function (c) {
        var n = G.caught[c.id] || 0, sl = slots[c.id];
        sl.el.classList.toggle('got', n > 0);
        sl.count.textContent = n > 1 ? '\u00d7' + n : '';
      });
      trayCount.textContent = G.distinctCaught() + '/' + CREATURES.length + (G.collection.length ? ' \u00b7 ' + G.collection.length + ' caught' : '');
      if (popId && slots[popId]) { var el = slots[popId].el; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    }

    // ---------- overlay ----------
    function showOverlay(html) { overlayCard.innerHTML = html; overlay.classList.add('show'); }
    function hideOverlay() { overlay.classList.remove('show'); }
    function startOverlay() {
      showOverlay(
        '<h2>Doodle Wheel</h2>' +
        '<p>Guide the snake to eat <b>cute animals</b> and grab <b>ropes</b>. Every rope spins the bonus wheel for a \u00d71\u2013\u00d710 multiplier.</p>' +
        '<p>Keep going and rare <b>creatures</b> start showing up by the ropes. Catch them all!</p>' +
        '<p class="keys"><kbd>\u2190</kbd><kbd>\u2191</kbd><kbd>\u2193</kbd><kbd>\u2192</kbd> / <kbd>WASD</kbd> steer \u00b7 <kbd>Space</kbd> spin \u00b7 <kbd>P</kbd> pause</p>' +
        '<p class="touch-only">Swipe on the board or use the arrow pad.</p>' +
        '<button type="button" class="primary" data-ov="start">Start game</button>');
    }
    function pauseOverlay() {
      showOverlay('<h2>Paused</h2><p>Press <kbd>P</kbd> or tap Resume.</p><button type="button" class="primary" data-ov="resume">Resume</button>');
    }
    function gameOverOverlay(d) {
      var counts = {};
      d.collection.forEach(function (k) { counts[k] = (counts[k] || 0) + 1; });
      var chips = CREATURES.filter(function (c) { return counts[c.id]; }).map(function (c) {
        return '<span class="dw-chip"><img alt="" src="' + creatureImg(c.id) + '">' + c.name + (counts[c.id] > 1 ? ' \u00d7' + counts[c.id] : '') + '</span>';
      }).join('');
      showOverlay('<h2>Game over</h2>' +
        '<p>' + (d.cause === 'wall' ? 'Bonk! You hit the wall.' : 'Oops! The snake bit its own tail.') + '</p>' +
        '<div class="big">' + d.score.toLocaleString() + '</div>' +
        (d.newRecord ? '<p class="record">New high score!</p>' : '<p>Best: ' + d.high.toLocaleString() + '</p>') +
        '<p>' + G.eaten + ' animals \u00b7 ' + G.ropes + ' ropes \u00b7 level ' + G.level + '</p>' +
        '<div class="dw-final"><b>Collection: ' + d.collection.length + '</b>' + (d.newBestCollection ? ' <span class="record">new best!</span>' : ' (best ' + d.bestCollection + ')') +
        (chips ? '<div class="dw-chips">' + chips + '</div>' : '<div class="dw-none">No creatures yet. They appear after ' + LATE_ROPES + ' ropes.</div>') + '</div>' +
        '<button type="button" class="primary" data-ov="start">Play again</button>');
    }
    overlay.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ov]');
      if (!b) return;
      if (b.dataset.ov === 'start') startGame();
      else if (b.dataset.ov === 'resume') setPaused(false);
    });

    // ---------- actions ----------
    function startGame() {
      particles = []; floaters = []; flyers = []; deathT = 0;
      G.start(); hideOverlay(); syncTray(); syncUI(true);
    }
    function setPaused(p) {
      if (!G.isActive()) return;
      G.togglePause(p);
      if (G.paused) pauseOverlay(); else hideOverlay();
      syncUI(true);
    }
    function trySpin() { if (G.spin() != null) syncUI(true); }
    var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    function steer(name) { var d = DIRS[name]; if (d) G.setDir(d[0], d[1]); }

    btnStart.addEventListener('click', function () { if (G.paused) setPaused(false); else if (!G.isActive()) startGame(); btnStart.blur(); });
    btnPause.addEventListener('click', function () { setPaused(!G.paused); btnPause.blur(); });
    btnRestart.addEventListener('click', function () { startGame(); btnRestart.blur(); });
    spinBtn.addEventListener('click', function (e) { e.stopPropagation(); trySpin(); spinBtn.blur(); });

    // ---------- keyboard ----------
    var KEYDIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' };
    window.addEventListener('keydown', function (e) {
      if (!isCurrent()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (KEYDIR[k] || k === ' ' || k === 'Spacebar') e.preventDefault();
      if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); if (G.isActive()) setPaused(!G.paused); return; }
      if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
        e.preventDefault();
        if (e.repeat) return;
        if (!G.isActive()) startGame();
        else if (G.paused) setPaused(false);
        else if (G.phase === 'wheel') trySpin();
        return;
      }
      if (KEYDIR[k] && !G.paused) steer(KEYDIR[k]);
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && G.isActive() && !G.paused) setPaused(true); });

    // ---------- d-pad ----------
    document.querySelectorAll('#dwDpad button').forEach(function (b) {
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault(); b.classList.add('pressed');
        if (G.phase === 'wheel') trySpin(); else steer(b.dataset.dir);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove('pressed'); }); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });

    // ---------- swipes / taps on the board ----------
    var sw = null;
    boardInner.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.overlay.show') || e.target === spinBtn) return;
      if (G.phase === 'wheel') { e.preventDefault(); trySpin(); return; }
      if (!G.isActive() || G.paused) return;
      e.preventDefault();
      sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { boardInner.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    });
    boardInner.addEventListener('pointermove', function (e) {
      if (!sw || e.pointerId !== sw.id) return;
      var dx = e.clientX - sw.x, dy = e.clientY - sw.y, th = Math.max(18, cell * 0.8);
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 'right' : 'left'); else steer(dy > 0 ? 'down' : 'up');
      sw.x = e.clientX; sw.y = e.clientY;
    });
    function endSwipe() { sw = null; }
    boardInner.addEventListener('pointerup', endSwipe);
    boardInner.addEventListener('pointercancel', endSwipe);

    // ---------- effects ----------
    function cc(x) { return (x + 0.5) * cell; }
    function burst(x, y, colors, n, kind) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, sp = (0.04 + Math.random() * 0.14) * cell;
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.05 * cell, life: 1, decay: 0.0012 + Math.random() * 0.0012,
          color: colors[i % colors.length], size: (0.08 + Math.random() * 0.12) * cell, kind: kind || 'dot' });
      }
    }
    function floater(text, x, y, color, size) { floaters.push({ text: text, x: x, y: y, life: 1, color: color || '#fde68a', size: size || 0.55 }); }
    function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

    G.onEvent = function (type, d) {
      if (type === 'eat') {
        burst(cc(d.x), cc(d.y), ['#f9a8d4', '#fda4af', '#fde68a', '#fff'], 12, 'heart');
        floater('+' + d.points, cc(d.x), cc(d.y) - cell * 0.4);
        bump(elScore);
      } else if (type === 'rope') {
        burst(cc(d.x), cc(d.y), ['#c08a4a', '#fde68a', '#fff'], 18);
        floater('Rope!', cc(d.x), cc(d.y) - cell * 0.4, '#fcd34d', 0.7);
        bump(elRopes);
      } else if (type === 'wheel') {
        popT = 0;
        bump(elScore);
        burst(bw / 2, wheelGeom().cy, SEG_COLORS, 40, 'star');
      } else if (type === 'catch') {
        var c = CREATURE_BY_ID[d.kind];
        burst(cc(d.x), cc(d.y), [c.color, '#fff', '#fde68a'], 26, 'star');
        floater((d.isNew ? 'New! ' : 'Caught ') + d.name + ' +' + d.points, cc(d.x), cc(d.y) - cell * 0.6, c.color, 0.5);
        flyers.push({ kind: d.kind, x: cc(d.x), y: cc(d.y), t: 0 });
        flash = 0.25;
        syncTray(d.kind);
        bump(elScore);
      } else if (type === 'level') {
        levelBanner = 1; bump(elLevel);
      } else if (type === 'late') {
        lateBanner = 1;
      } else if (type === 'creatureSpawn') {
        burst(cc(d.x), cc(d.y), ['#fff', '#fde68a'], 10, 'star');
      } else if (type === 'over') {
        shake = 1; deathT = 1;
        var h = G.snake[0];
        if (h) burst(cc(h.x), cc(h.y), ['#f43f5e', '#fde68a', '#fff'], 30);
        setTimeout(function () { if (G.phase === 'over') gameOverOverlay(d); syncUI(true); }, 700);
      }
    };

    // ---------- drawing ----------
    function drawBackground() {
      var grd = ctx.createLinearGradient(0, 0, 0, bh);
      grd.addColorStop(0, '#0f1b33'); grd.addColorStop(1, '#13233d');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      for (var y = 0; y < G.rows; y++) for (var x = (y % 2); x < G.cols; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (y = 1; y < G.rows; y++) for (x = 1; x < G.cols; x++) { ctx.beginPath(); ctx.arc(x * cell, y * cell, Math.max(0.8, cell * 0.04), 0, TAU); ctx.fill(); }
    }
    function animalSprite(kind) {
      var key = kind + '@' + cell;
      if (animalCache[key]) return animalCache[key];
      var a = ANIMALS.filter(function (x) { return x.id === kind; })[0];
      var size = Math.ceil(cell * 1.3 * dpr);
      var cv = document.createElement('canvas'); cv.width = cv.height = size;
      var c2 = cv.getContext('2d');
      c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.font = Math.round(size * 0.72) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c2.fillText(a.emoji, size / 2, size / 2 + size * 0.04);
      animalCache[key] = cv;
      return cv;
    }
    function drawAnimals(now) {
      G.animals.forEach(function (a, i) {
        var age = Math.min(1, (G.time - a.born) / 300);
        var sc = (0.4 + 0.6 * age) * (1 + Math.sin(now * 0.005 + i * 1.7) * 0.06);
        var x = cc(a.x), y = cc(a.y);
        ctx.fillStyle = 'rgba(249,168,212,0.13)';
        ctx.beginPath(); ctx.arc(x, y, cell * 0.55, 0, TAU); ctx.fill();
        var sp = animalSprite(a.kind), s = cell * 1.3 * sc;
        ctx.drawImage(sp, x - s / 2, y - s / 2 - Math.sin(now * 0.006 + i) * cell * 0.04, s, s);
      });
    }
    function drawRopeItem(now) {
      var r = G.rope;
      if (!r) return;
      if (r.ttl < 2000 && Math.floor(now / 120) % 2 === 0) return; // blink before vanishing
      var x = cc(r.x), y = cc(r.y);
      var age = Math.min(1, (G.time - r.born) / 350);
      var sc = age < 1 ? 0.5 + 0.7 * age - 0.2 * age * age : 1;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(252,211,77,0.16)'; ctx.beginPath(); ctx.arc(0, 0, cell * 0.72, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(252,211,77,0.85)'; ctx.lineWidth = Math.max(1.5, cell * 0.07); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, cell * 0.66, -Math.PI / 2, -Math.PI / 2 + TAU * (r.ttl / r.max)); ctx.stroke();
      ctx.rotate(now * 0.0015); ctx.scale(sc, sc);
      drawRope(ctx, cell * 0.55);
      ctx.restore();
    }
    function label(text, x, y, color) {
      ctx.font = '700 ' + Math.max(9, Math.round(cell * 0.38)) + 'px ui-sans-serif, system-ui, sans-serif';
      var w = ctx.measureText(text).width + cell * 0.36, h = Math.max(12, cell * 0.5);
      x = Math.max(w / 2 + 1, Math.min(bw - w / 2 - 1, x));
      y = Math.max(h / 2 + 1, y);
      ctx.fillStyle = 'rgba(10,14,28,0.78)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
    }
    function drawCreatures(now) {
      G.creatures.forEach(function (c, i) {
        if (c.ttl < 2000 && Math.floor(now / 140) % 2 === 0) return;
        var info = CREATURE_BY_ID[c.kind];
        var x = cc(c.x), y = cc(c.y) + Math.sin(now * 0.004 + i) * cell * 0.06;
        var age = Math.min(1, (G.time - c.born) / 400);
        ctx.save(); ctx.translate(x, y);
        var gl = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 0.85);
        gl.addColorStop(0, info.color + '66'); gl.addColorStop(1, info.color + '00');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, cell * 0.85, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([cell * 0.12, cell * 0.12]);
        ctx.rotate(now * 0.001); ctx.beginPath(); ctx.arc(0, 0, cell * 0.7, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.rotate(-now * 0.001);
        ctx.scale(age, age);
        drawCreature(ctx, c.kind, cell * 1.15, now);
        ctx.restore();
        label(info.name, x, y - cell * 0.95, info.color);
      });
    }
    function snakePoints(f) {
      var pts = [];
      for (var i = 0; i < G.snake.length; i++) {
        var c = G.snake[i], p = G.prev[i] || G.prev[G.prev.length - 1] || c;
        if (Math.abs(p.x - c.x) + Math.abs(p.y - c.y) > 1) p = c;
        pts.push({ x: cc(p.x + (c.x - p.x) * f), y: cc(p.y + (c.y - p.y) * f) });
      }
      return pts;
    }
    function drawSnake(now) {
      if (!G.snake.length) return;
      var f = G.phase === 'playing' && !G.paused ? Math.min(1, G.tickAcc / G.interval()) : 1;
      var pts = snakePoints(f), n = pts.length, i;
      var dead = G.phase === 'over';
      var w = cell * 0.78;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // outline
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = dead ? '#7f1d1d' : '#0f5132'; ctx.lineWidth = w + cell * 0.12; ctx.stroke();
      for (i = n - 1; i > 0; i--) {
        var hue = dead ? 0 : (150 - (i / Math.max(1, n)) * 70);
        ctx.strokeStyle = 'hsl(' + hue + ',70%,' + (dead ? 45 : 52) + '%)';
        ctx.lineWidth = w * (1 - (i / n) * 0.25);
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
      }
      // belly spots
      for (i = 2; i < n; i += 2) circle(ctx, pts[i].x, pts[i].y, cell * 0.12, 'rgba(255,255,255,0.25)');
      // head
      var h = pts[0], d = G.dir, ang = Math.atan2(d.y, d.x);
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang);
      if (!dead && Math.floor(now / 600) % 4 === 0) { // tongue flick
        ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = Math.max(1.5, cell * 0.07);
        ctx.beginPath(); ctx.moveTo(cell * 0.4, 0); ctx.lineTo(cell * 0.65, 0); ctx.lineTo(cell * 0.75, -cell * 0.08); ctx.moveTo(cell * 0.65, 0); ctx.lineTo(cell * 0.75, cell * 0.08); ctx.stroke();
      }
      ellipse(ctx, 0, 0, cell * 0.52, cell * 0.46, 0, dead ? '#ef4444' : 'hsl(150,70%,48%)');
      ellipse(ctx, -cell * 0.05, 0, cell * 0.4, cell * 0.3, 0, dead ? '#f87171' : 'hsl(150,75%,58%)');
      if (dead) {
        ctx.strokeStyle = '#1e1b2e'; ctx.lineWidth = Math.max(1.5, cell * 0.07);
        [-1, 1].forEach(function (s) { var ex = cell * 0.12, ey = s * cell * 0.2, k = cell * 0.08; ctx.beginPath(); ctx.moveTo(ex - k, ey - k); ctx.lineTo(ex + k, ey + k); ctx.moveTo(ex + k, ey - k); ctx.lineTo(ex - k, ey + k); ctx.stroke(); });
      } else {
        var blink = Math.floor(now / 160) % 25 === 0;
        [-1, 1].forEach(function (s) {
          circle(ctx, cell * 0.12, s * cell * 0.2, cell * 0.14, '#fff');
          if (blink) { ctx.fillStyle = '#1e1b2e'; ctx.fillRect(cell * 0.02, s * cell * 0.2 - 1, cell * 0.2, 2); }
          else { circle(ctx, cell * 0.17, s * cell * 0.2, cell * 0.08, '#1e1b2e'); circle(ctx, cell * 0.14, s * cell * 0.2 - cell * 0.03, cell * 0.03, '#fff'); }
        });
        circle(ctx, -cell * 0.08, -cell * 0.36, cell * 0.07, 'rgba(244,114,182,0.6)');
        circle(ctx, -cell * 0.08, cell * 0.36, cell * 0.07, 'rgba(244,114,182,0.6)');
      }
      ctx.restore();
    }
    function wheelGeom() {
      var R = Math.min(bw * 0.4, bh * 0.28);
      return { cx: bw / 2, cy: bh * 0.46, R: R };
    }
    api.wheelGeom = wheelGeom;
    function drawWheel(now, dt) {
      var w = G.wheel;
      if (!w) return;
      var gm = wheelGeom(), cx = gm.cx, cy = gm.cy, R = gm.R, i;
      var fade = G.phase === 'countdown' ? Math.max(0, (G.countdown - 1000) / 800) : 1;
      if (fade <= 0) return;
      ctx.save(); ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(6,8,20,0.66)'; ctx.fillRect(0, 0, bw, bh);
      // title
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 ' + Math.round(R * 0.2) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#fde68a';
      ctx.fillText('Rope bonus!', cx, cy - R - R * 0.4);
      ctx.font = '600 ' + Math.round(R * 0.11) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#c7cbe0';
      ctx.fillText(w.base + ' pts \u00d7 your spin' + (w.state === 'ready' ? ' \u00b7 tap Spin or Space' : ''), cx, cy - R - R * 0.2);
      // wheel
      ctx.save(); ctx.translate(cx, cy);
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = R * 0.15;
      circle(ctx, 0, 0, R * 1.07, '#1e1b4b'); ctx.shadowBlur = 0;
      ctx.rotate(w.angle * Math.PI / 180);
      for (i = 0; i < 10; i++) {
        var a0 = -Math.PI / 2 + i * TAU / 10, a1 = a0 + TAU / 10;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
        ctx.fillStyle = SEG_COLORS[i]; ctx.fill();
        if (w.state === 'landed' && w.result === i + 1 && Math.floor(now / 150) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(1, R * 0.015); ctx.stroke();
        ctx.save(); ctx.rotate(a0 + TAU / 20); ctx.translate(R * 0.68, 0); ctx.rotate(Math.PI / 2);
        ctx.font = '900 ' + Math.round(R * 0.2) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.lineWidth = R * 0.04; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeText(String(i + 1), 0, 0);
        ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), 0, 0);
        ctx.restore();
      }
      ctx.restore();
      // rim lights
      for (i = 0; i < 20; i++) {
        var la = i * TAU / 20;
        var on = (Math.floor(now / 140) + i) % 2 === 0;
        circle(ctx, cx + Math.cos(la) * R * 1.035, cy + Math.sin(la) * R * 1.035, R * 0.025, on ? '#fef9c3' : 'rgba(254,249,195,0.3)');
      }
      // hub
      circle(ctx, cx, cy, R * 0.16, '#fef3c7'); circle(ctx, cx, cy, R * 0.1, '#f59e0b');
      // pointer at the top
      poly(ctx, [[cx - R * 0.12, cy - R * 1.13], [cx + R * 0.12, cy - R * 1.13], [cx, cy - R * 0.86]], '#fff', '#1e1b4b', Math.max(1.5, R * 0.025));
      // status text / result pop
      if (w.state === 'ready') {
        // auto-spin timer bar (the Spin button sits below it)
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(cx - R * 0.6, cy + R * 1.17, R * 1.2, Math.max(3, R * 0.03));
        ctx.fillStyle = '#fde68a'; ctx.fillRect(cx - R * 0.6, cy + R * 1.17, R * 1.2 * Math.min(1, w.idle / AUTO_SPIN), Math.max(3, R * 0.03));
      } else if (w.state === 'landed' || G.phase === 'countdown') {
        popT += dt;
        var p = Math.min(1, popT / 350), s = 1 + Math.sin(popT * 0.012) * 0.04;
        if (p < 1) s = 0.3 + p * 0.95 + Math.sin(p * Math.PI) * 0.3;
        ctx.save(); ctx.translate(cx, cy + R * 1.32); ctx.scale(s, s);
        ctx.font = '900 ' + Math.round(R * 0.4) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.lineWidth = R * 0.06; ctx.strokeStyle = '#1e1b4b'; ctx.strokeText('\u00d7' + w.result, 0, 0);
        ctx.fillStyle = SEG_COLORS[w.result - 1]; ctx.fillText('\u00d7' + w.result, 0, 0);
        ctx.restore();
        ctx.font = '800 ' + Math.round(R * 0.15) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = '#fde68a'; ctx.fillText('+' + w.points.toLocaleString() + ' pts', cx, cy + R * 1.66);
      }
      ctx.restore();
    }
    function drawCountdown() {
      if (G.phase !== 'countdown') return;
      var n = Math.ceil(G.countdown / 600);
      var frac = (G.countdown % 600) / 600;
      var s = 0.8 + frac * 0.6;
      ctx.save(); ctx.translate(bw / 2, bh / 2); ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, frac * 2 + 0.2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 ' + Math.round(cell * 3.2) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.lineWidth = cell * 0.2; ctx.strokeStyle = 'rgba(10,14,28,0.8)'; ctx.strokeText(String(n), 0, 0);
      ctx.fillStyle = '#fff'; ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }
    function drawHeart(x, y, s) {
      ctx.beginPath(); ctx.moveTo(x, y + s * 0.35);
      ctx.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.4, y - s, x, y - s * 0.4);
      ctx.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.3, x, y + s * 0.35); ctx.fill();
    }
    function drawEffects(dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.004 * cell * dt / 16; p.life -= p.decay * dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
        if (p.kind === 'heart') drawHeart(p.x, p.y, p.size * 1.3);
        else if (p.kind === 'star') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 6); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      for (i = flyers.length - 1; i >= 0; i--) { // creature "caught" animation: spin up and shrink into the tray
        var f = flyers[i];
        f.t += dt / 900;
        if (f.t >= 1) { flyers.splice(i, 1); continue; }
        var e = f.t * f.t;
        var x = f.x + (bw / 2 - f.x) * e, y = f.y + (-cell - f.y) * e - Math.sin(f.t * Math.PI) * cell * 2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(f.t * TAU); ctx.scale(1.4 - f.t, 1.4 - f.t);
        ctx.globalAlpha = 1 - e * 0.6;
        drawCreature(ctx, f.kind, cell * 1.3, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = floaters.length - 1; i >= 0; i--) {
        var fl = floaters[i];
        fl.life -= dt / 1100; fl.y -= dt * 0.03;
        if (fl.life <= 0) { floaters.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, fl.life * 2);
        ctx.font = '800 ' + Math.round(cell * fl.size) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,28,0.8)';
        var fx = Math.max(cell * 2, Math.min(bw - cell * 2, fl.x));
        ctx.strokeText(fl.text, fx, fl.y); ctx.fillStyle = fl.color; ctx.fillText(fl.text, fx, fl.y);
      }
      ctx.globalAlpha = 1;
      function banner(text, v, color) {
        ctx.globalAlpha = Math.min(1, v * 2);
        ctx.font = '900 ' + Math.round(cell * 0.9) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,14,28,0.85)';
        var y = bh * 0.3 - (1 - v) * cell;
        ctx.strokeText(text, bw / 2, y); ctx.fillStyle = color; ctx.fillText(text, bw / 2, y);
        ctx.globalAlpha = 1;
      }
      if (G.phase === 'playing') {
        if (lateBanner > 0) { lateBanner -= dt / 2600; banner('Creatures are near!', Math.max(0, lateBanner), '#f9a8d4'); }
        else if (levelBanner > 0) { levelBanner -= dt / 1600; banner('Level ' + G.level + '!', Math.max(0, levelBanner), '#7dd3fc'); }
      }
      if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash + ')'; ctx.fillRect(0, 0, bw, bh); flash = Math.max(0, flash - dt / 600); }
      if (deathT > 0) { ctx.fillStyle = 'rgba(244,63,94,' + (deathT * 0.3) + ')'; ctx.fillRect(0, 0, bw, bh); deathT = Math.max(0, deathT - dt / 700); }
    }

    function render(now, dt) {
      ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - 0.5) * cell * 0.5 * shake, (Math.random() - 0.5) * cell * 0.5 * shake); shake = Math.max(0, shake - dt / 400); }
      drawBackground();
      if (G.phase !== 'idle') {
        drawRopeItem(now); drawAnimals(now); drawCreatures(now); drawSnake(now);
      }
      drawEffects(dt);
      if (G.phase === 'wheel' || G.phase === 'countdown') { drawWheel(now, dt); drawCountdown(); }
      ctx.restore();
    }

    // ---------- HUD ----------
    var last = {};
    function setText(el, key, v) { if (last[key] !== v) { el.textContent = v; last[key] = v; } }
    function syncUI(force) {
      if (force) last = {};
      setText(elScore, 'score', G.score.toLocaleString());
      setText(elRopes, 'ropes', String(G.ropes));
      setText(elLevel, 'level', String(G.level));
      setText(elHigh, 'high', Math.max(G.high, G.score).toLocaleString());
      var showSpin = G.phase === 'wheel' && G.wheel && G.wheel.state === 'ready' && !G.paused;
      var st = G.phase + '|' + G.paused + '|' + showSpin;
      if (last.st !== st) {
        last.st = st;
        spinBtn.hidden = !showSpin;
        btnStart.textContent = G.paused ? 'Resume' : 'Start';
        btnStart.disabled = G.isActive() && !G.paused;
        btnPause.disabled = !G.isActive();
        btnPause.textContent = G.paused ? 'Resume' : 'Pause';
        btnRestart.disabled = G.phase === 'idle';
      }
    }

    var prev = performance.now();
    function frame(now) {
      var dt = Math.min(100, Math.max(0, now - prev));
      prev = now;
      if (isCurrent() && !boardWrap.closest('[hidden]')) {
        if (!G.paused) G.update(dt);
        render(now, G.paused ? 0 : dt);
        syncUI(false);
      }
      requestAnimationFrame(frame);
    }

    root.doodleUI = {
      pause: function () { if (G.isActive() && !G.paused) setPaused(true); },
      resize: resize
    };

    resize();
    syncTray();
    startOverlay();
    syncUI(true);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})(typeof window !== 'undefined' ? window : globalThis);
