/*
 * Doodle Wheel: a Snakes-and-Ladders style board game where a 1-10 spin
 * wheel replaces the dice, ropes are the ladders, cute animals give perks
 * and original creatures wait to be collected near the finish.
 * Plain JavaScript, no dependencies. The core engine (createDoodle) is
 * DOM-free so it can be loaded in Node for tests: require('./doodle.js').
 * Copyright (c) 2026 Harish Lohar. All rights reserved.
 */
(function (root) {
  'use strict';

  // ===================================================================
  //  Board data
  // ===================================================================
  var SIZE = 10, LAST = 100;
  // snake head -> tail (slide down)
  var SNAKES = { 97: 78, 92: 73, 87: 24, 83: 61, 64: 42, 58: 37, 49: 11, 31: 9 };
  // rope bottom -> top (climb up)
  var ROPES = { 4: 25, 13: 46, 21: 39, 33: 52, 50: 69, 63: 81, 71: 91, 76: 96 };
  var ANIMALS = [
    { sq: 7, kind: 'bunny', emoji: '\u{1F430}', name: 'Bunny', perk: 'hop2' },
    { sq: 16, kind: 'kitty', emoji: '\u{1F431}', name: 'Kitty', perk: null },
    { sq: 28, kind: 'puppy', emoji: '\u{1F436}', name: 'Puppy', perk: 'respin' },
    { sq: 35, kind: 'chick', emoji: '\u{1F425}', name: 'Chick', perk: 'hop2' },
    { sq: 44, kind: 'panda', emoji: '\u{1F43C}', name: 'Panda', perk: null },
    { sq: 55, kind: 'hamster', emoji: '\u{1F439}', name: 'Hamster', perk: 'respin' },
    { sq: 60, kind: 'koala', emoji: '\u{1F428}', name: 'Koala', perk: null },
    { sq: 67, kind: 'fox', emoji: '\u{1F98A}', name: 'Fox', perk: 'hop2' }
  ];
  // Original creatures (not based on any existing franchise characters).
  var CREATURES = [
    { id: 'zappip', name: 'Zappip', kind: 'Spark', color: '#facc15', sq: 72 },
    { id: 'budlet', name: 'Budlet', kind: 'Leaf', color: '#4ade80', sq: 75 },
    { id: 'pebbit', name: 'Pebbit', kind: 'Stone', color: '#a8a29e', sq: 79 },
    { id: 'embrix', name: 'Embrix', kind: 'Ember', color: '#fb923c', sq: 84 },
    { id: 'shellow', name: 'Shellow', kind: 'Tide', color: '#2dd4bf', sq: 86 },
    { id: 'wispo', name: 'Wispo', kind: 'Mist', color: '#c4b5fd', sq: 89 },
    { id: 'frostail', name: 'Frostail', kind: 'Frost', color: '#7dd3fc', sq: 94 },
    { id: 'glimmoth', name: 'Glimmoth', kind: 'Glow', color: '#f9a8d4', sq: 98 }
  ];
  var TOKENS = [
    { color: '#f472b6', dark: '#9d174d', label: 'Pink' },
    { color: '#38bdf8', dark: '#075985', label: 'Blue' },
    { color: '#facc15', dark: '#854d0e', label: 'Yellow' },
    { color: '#4ade80', dark: '#166534', label: 'Green' }
  ];
  var ANIMAL_AT = {}, CREATURE_AT = {}, CREATURE_BY_ID = {};
  ANIMALS.forEach(function (a) { ANIMAL_AT[a.sq] = a; });
  CREATURES.forEach(function (c) { CREATURE_AT[c.sq] = c; CREATURE_BY_ID[c.id] = c; });

  var POINTS = { animal: 40, animalAgain: 10, creature: 150, ropeBase: 30, win: 300 };
  var T = { cpu: 850, spin: 2600, landed: 650, hop: 230, slide: 1300, climb: 1100, gap: 500 };
  var WHEEL_SEGMENTS = 10, SEG_DEG = 36;

  function mod(a, n) { return ((a % n) + n) % n; }
  // square n (1..100) -> {col, row}; row 0 is the bottom row, boustrophedon order
  function squareToCell(n) {
    var i = n - 1, row = Math.floor(i / SIZE), k = i % SIZE;
    return { col: row % 2 === 0 ? k : SIZE - 1 - k, row: row };
  }
  function cellToSquare(col, row) { return row * SIZE + (row % 2 === 0 ? col : SIZE - 1 - col) + 1; }
  // squares hopped through for a spin of `roll` from `from`; bounces back off 100
  function computePath(from, roll) {
    var path = [], pos = from, dir = 1;
    for (var i = 0; i < roll; i++) {
      if (pos + dir > LAST) dir = -1;
      pos += dir;
      path.push(pos);
    }
    return path;
  }
  // Wheel geometry: value k covers [(k-1)*36, k*36) degrees clockwise from the
  // top pointer at rotation 0; a clockwise rotation R puts -R under the pointer.
  function wheelSegmentAt(rotationDeg) { return Math.floor(mod(-rotationDeg, 360) / SEG_DEG) % WHEEL_SEGMENTS + 1; }
  function wheelTargetAngle(fromDeg, value, jitterDeg, spins) {
    var t = -((value - 1) * SEG_DEG + SEG_DEG / 2 + (jitterDeg || 0));
    var min = fromDeg + (spins || 0) * 360;
    return t + Math.ceil((min - t) / 360) * 360;
  }
  function easeOutQuart(p) { return 1 - Math.pow(1 - p, 4); }

  // ===================================================================
  //  Game engine
  // ===================================================================
  function createDoodle(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var storage = opts.storage || null;
    var g = {
      phase: 'idle', paused: false, speed: 1,
      players: [], turn: 0, timer: 0, turnCount: 0,
      wheel: { angle: 0, from: 0, to: 0, t: 0, result: null, landed: null, spinning: false },
      path: [], pathIdx: 0, hopT: 0, hopFrom: 1,
      anim: null, perkUsed: false, extraTurn: false,
      collected: {}, log: [], winner: null, onEvent: null,
      high: 0, bestCollection: 0, stats: null
    };
    function emit(type, data) { if (g.onEvent) { try { g.onEvent(type, data || {}); } catch (e) { if (typeof console !== 'undefined') console.error(e); } } }
    function load(k) { if (!storage) return null; try { return storage.get(k); } catch (e) { return null; } }
    function save(k, v) { if (storage) { try { storage.set(k, v); } catch (e) { /* ignore */ } } }
    function loadInt(k) { var v = parseInt(load(k), 10); return isFinite(v) ? v : 0; }
    function freshStats() { return { games: 0, wins: 0, cpuWins: 0, spins: 0, snakes: 0, ropes: 0, animals: 0, creatures: 0 }; }
    g.high = loadInt('doodlewheel-high');
    g.bestCollection = loadInt('doodlewheel-best-collection');
    try { g.stats = Object.assign(freshStats(), JSON.parse(load('doodlewheel-stats') || '{}')); } catch (e) { g.stats = freshStats(); }

    function rint(n) { return Math.min(n - 1, Math.floor(rng() * n)); }
    function addLog(text) { g.log.push(text); if (g.log.length > 30) g.log.shift(); emit('log', { text: text }); }

    g.current = function () { return g.players[g.turn]; };
    g.isHumanTurn = function () { var p = g.current(); return !!p && p.type === 'human' && g.phase === 'ready' && !g.paused; };
    g.isActive = function () { return g.phase !== 'idle' && g.phase !== 'over'; };

    g.start = function (seats) {
      seats = (seats && seats.length ? seats : [{ type: 'human', name: 'You' }, { type: 'cpu', name: 'CPU' }]).slice(0, 4);
      g.players = seats.map(function (s, i) {
        return { id: i, type: s.type === 'cpu' ? 'cpu' : 'human', name: s.name || (s.type === 'cpu' ? 'CPU ' + (i + 1) : 'Player ' + (i + 1)),
          token: TOKENS[i], pos: 1, score: 0, friends: {}, creatures: [],
          stats: { spins: 0, snakes: 0, ropes: 0, animals: 0, creatures: 0, bounces: 0 } };
      });
      g.turn = 0; g.turnCount = 0; g.collected = {}; g.log = []; g.winner = null;
      g.path = []; g.pathIdx = 0; g.hopT = 0; g.anim = null; g.perkUsed = false; g.extraTurn = false; g.paused = false;
      g.wheel.result = null; g.wheel.landed = null; g.wheel.spinning = false;
      beginTurn();
      emit('start');
    };

    function beginTurn() {
      g.phase = 'ready'; g.timer = T.cpu; g.perkUsed = false;
      g.turnCount++;
      emit('turn', { player: g.turn });
    }

    function doSpin() {
      var p = g.current();
      var n = 1 + rint(WHEEL_SEGMENTS);
      var jitter = (rng() - 0.5) * (SEG_DEG - 10);
      var w = g.wheel;
      w.result = n; w.landed = null; w.from = w.angle; w.to = wheelTargetAngle(w.angle, n, jitter, 3 + rint(2)); w.t = 0; w.spinning = true;
      p.stats.spins++;
      g.phase = 'spinning';
      emit('spin', { player: g.turn, result: n });
      return n;
    }
    // Human spin (button / Space / tap). CPU turns spin by themselves.
    g.spin = function () {
      if (!g.isHumanTurn()) return null;
      return doSpin();
    };
    g.setSpeed = function (s) { g.speed = s; };
    g.togglePause = function (force) {
      if (!g.isActive()) return;
      g.paused = typeof force === 'boolean' ? force : !g.paused;
      emit(g.paused ? 'pause' : 'unpause');
    };

    function startPath(path) {
      var p = g.current();
      g.path = path; g.pathIdx = 0; g.hopT = 0; g.hopFrom = p.pos;
      g.phase = 'moving';
      if (path.indexOf(LAST) >= 0 && path[path.length - 1] !== LAST) { p.stats.bounces++; addLog(p.name + ' bounced off 100!'); }
    }

    function collectAt(sq) {
      var c = CREATURE_AT[sq], p = g.current();
      if (!c || g.collected[c.id] != null) return;
      g.collected[c.id] = p.id;
      p.creatures.push(c.id); p.stats.creatures++;
      p.score += POINTS.creature;
      addLog(p.name + ' caught ' + c.name + '! +' + POINTS.creature);
      emit('catch', { player: p.id, kind: c.id, name: c.name, sq: sq, points: POINTS.creature });
    }

    function win(p) {
      p.score += POINTS.win;
      g.phase = 'over'; g.winner = p.id;
      addLog(p.name + ' reached 100 and wins!');
      var humans = g.players.filter(function (x) { return x.type === 'human'; });
      var best = humans.reduce(function (m, x) { return Math.max(m, x.score); }, 0);
      var bestColl = humans.reduce(function (m, x) { return Math.max(m, x.creatures.length); }, 0);
      var newRecord = humans.length > 0 && best > g.high;
      if (newRecord) { g.high = best; save('doodlewheel-high', String(g.high)); }
      var newBestCollection = humans.length > 0 && bestColl > g.bestCollection;
      if (newBestCollection) { g.bestCollection = bestColl; save('doodlewheel-best-collection', String(g.bestCollection)); }
      var st = g.stats;
      st.games++;
      if (p.type === 'human') st.wins++; else st.cpuWins++;
      humans.forEach(function (h) { st.spins += h.stats.spins; st.snakes += h.stats.snakes; st.ropes += h.stats.ropes; st.animals += h.stats.animals; st.creatures += h.stats.creatures; });
      save('doodlewheel-stats', JSON.stringify(st));
      emit('win', { player: p.id, newRecord: newRecord, newBestCollection: newBestCollection, high: g.high, bestCollection: g.bestCollection });
    }

    function endTurn() { g.phase = 'gap'; g.timer = T.gap; }

    // Called once the token stops (after hops, a slide or a climb).
    function resolve() {
      var p = g.current(), sq = p.pos;
      if (SNAKES[sq]) {
        p.stats.snakes++;
        addLog(p.name + ' hit a snake: ' + sq + ' \u2192 ' + SNAKES[sq]);
        g.anim = { type: 'slide', from: sq, to: SNAKES[sq], t: 0, dur: T.slide };
        g.phase = 'sliding';
        emit('snake', { player: p.id, from: sq, to: SNAKES[sq] });
        return;
      }
      if (ROPES[sq]) {
        var pts = POINTS.ropeBase + (ROPES[sq] - sq);
        p.stats.ropes++; p.score += pts;
        addLog(p.name + ' climbed a rope: ' + sq + ' \u2192 ' + ROPES[sq] + ' +' + pts);
        g.anim = { type: 'climb', from: sq, to: ROPES[sq], t: 0, dur: T.climb };
        g.phase = 'climbing';
        emit('rope', { player: p.id, from: sq, to: ROPES[sq], points: pts });
        return;
      }
      if (sq === LAST) { win(p); return; }
      var a = ANIMAL_AT[sq];
      if (a) {
        var first = !p.friends[a.kind];
        var ap = first ? POINTS.animal : POINTS.animalAgain;
        p.friends[a.kind] = true; p.score += ap;
        if (first) p.stats.animals++;
        var perk = first && !g.perkUsed ? a.perk : null;
        addLog(p.name + (first ? ' befriended ' : ' fed ') + a.name + ' +' + ap + (perk === 'hop2' ? ', hops +2' : perk === 'respin' ? ', free spin!' : ''));
        emit('animal', { player: p.id, kind: a.kind, sq: sq, points: ap, perk: perk, first: first });
        if (perk) {
          g.perkUsed = true;
          if (perk === 'hop2') { startPath(computePath(sq, 2)); return; }
          if (perk === 'respin') g.extraTurn = true;
        }
      }
      endTurn();
    }

    function nextTurn() {
      if (!g.extraTurn) g.turn = (g.turn + 1) % g.players.length;
      g.extraTurn = false;
      beginTurn();
    }

    g.update = function (dt) {
      if (g.paused || !g.isActive()) return;
      var guard = 0;
      dt *= g.speed;
      while (dt > 0 && g.isActive() && guard++ < 1000) {
        var used = dt;
        var p = g.current();
        switch (g.phase) {
          case 'ready':
            if (p.type !== 'cpu') return;
            if (g.timer > dt) { g.timer -= dt; return; }
            used = g.timer; doSpin();
            break;
          case 'spinning': {
            var w = g.wheel, need = T.spin - w.t;
            used = Math.min(dt, need); w.t += used;
            var pr = Math.min(1, w.t / T.spin);
            w.angle = w.from + (w.to - w.from) * easeOutQuart(pr);
            if (pr >= 1) {
              w.angle = w.to; w.spinning = false; w.landed = wheelSegmentAt(w.angle);
              g.phase = 'landed'; g.timer = T.landed;
              addLog(p.name + ' spun ' + w.result);
              emit('spun', { player: p.id, result: w.result, landed: w.landed });
            }
            break;
          }
          case 'landed':
            if (g.timer > dt) { g.timer -= dt; return; }
            used = g.timer; startPath(computePath(p.pos, g.wheel.result));
            break;
          case 'moving': {
            var need2 = T.hop - g.hopT;
            if (dt < need2) { g.hopT += dt; return; }
            used = need2; g.hopT = 0;
            g.hopFrom = p.pos;
            p.pos = g.path[g.pathIdx++];
            emit('hop', { player: p.id, sq: p.pos });
            collectAt(p.pos);
            if (g.pathIdx >= g.path.length) resolve();
            break;
          }
          case 'sliding': case 'climbing': {
            var a = g.anim, need3 = a.dur - a.t;
            if (dt < need3) { a.t += dt; return; }
            used = need3; a.t = a.dur;
            p.pos = a.to; g.anim = null;
            collectAt(p.pos);
            resolve();
            break;
          }
          case 'gap':
            if (g.timer > dt) { g.timer -= dt; return; }
            used = g.timer; nextTurn();
            break;
          default: return;
        }
        dt -= Math.max(0, used);
      }
    };
    return g;
  }

  var api = {
    createDoodle: createDoodle, squareToCell: squareToCell, cellToSquare: cellToSquare, computePath: computePath,
    wheelSegmentAt: wheelSegmentAt, wheelTargetAngle: wheelTargetAngle,
    SNAKES: SNAKES, ROPES: ROPES, ANIMALS: ANIMALS, CREATURES: CREATURES, TOKENS: TOKENS, POINTS: POINTS, TIMING: T,
    SIZE: SIZE, LAST: LAST, WHEEL_SEGMENTS: WHEEL_SEGMENTS
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

  // ---------- board drawing helpers ----------
  var SNAKE_COLORS = [['#22c55e', '#166534', '#bbf7d0'], ['#f97316', '#9a3412', '#fed7aa'], ['#a855f7', '#581c87', '#e9d5ff'], ['#ef4444', '#7f1d1d', '#fecaca'],
    ['#06b6d4', '#164e63', '#cffafe'], ['#eab308', '#713f12', '#fef08a'], ['#ec4899', '#831843', '#fbcfe8'], ['#84cc16', '#365314', '#ecfccb']];

  // Board themes (visual only; gameplay is identical on every theme).
  var THEMES = {
    mint: {
      name: 'Mint Meadow', meta: '#eaf7ef',
      bg: ['#f3fbf5', '#e6f6ec'], pattern: 'grass', patternColor: 'rgba(52,168,107,0.16)', dotColor: 'rgba(52,168,107,0.10)',
      tiles: ['#c9f0d9', '#fde8c6', '#d4ebfb', '#fbd5e2', '#e4dcfb', '#fff1b3'], tileAlpha: [1, 0.82],
      tileBorder: 'rgba(31,122,84,0.30)', tileShadow: 'rgba(31,94,66,0.10)',
      number: '#244637', numberHalo: 'rgba(255,255,255,0.85)', badge: '#0f766e', star: '#f59e0b',
      pad: 'rgba(255,255,255,0.75)', dim: 'rgba(20,48,38,0.55)', tokenRing: 'rgba(20,40,32,0.6)', floaterStroke: 'rgba(255,255,255,0.95)'
    },
    sunset: {
      name: 'Sunset Pop', meta: '#ffd9c7',
      bg: ['#ffd3bd', '#f1c6ea'], pattern: 'stripes', patternColor: 'rgba(255,255,255,0.28)', dotColor: 'rgba(255,255,255,0.0)',
      tiles: ['#ffb3a0', '#ffd2b4', '#ffc7dd', '#dcc4fb', '#ffe3a3', '#f9b8cf'], tileAlpha: [0.92, 0.74],
      tileBorder: 'rgba(255,255,255,0.75)', tileShadow: 'rgba(138,45,80,0.12)',
      number: '#5a1f3b', numberHalo: 'rgba(255,255,255,0.7)', badge: '#9d174d', star: '#f97316',
      pad: 'rgba(255,255,255,0.6)', dim: 'rgba(70,22,48,0.55)', tokenRing: 'rgba(70,20,45,0.6)', floaterStroke: 'rgba(255,255,255,0.95)'
    },
    ocean: {
      name: 'Ocean Breeze', meta: '#0a2a43',
      bg: ['#0b2a46', '#0d5a6e'], pattern: 'bubbles', patternColor: 'rgba(186,240,255,0.14)', dotColor: 'rgba(186,240,255,0.08)',
      tiles: ['#11698a', '#16858c', '#0e5779', '#24938a', '#1a73a3', '#2d7f9b'], tileAlpha: [0.62, 0.46],
      tileBorder: 'rgba(148,233,255,0.45)', tileShadow: 'rgba(0,0,0,0.18)',
      number: '#eafcff', numberHalo: 'rgba(5,30,48,0.7)', badge: '#fde68a', star: '#facc15',
      pad: 'rgba(255,255,255,0.16)', dim: 'rgba(3,18,32,0.62)', tokenRing: 'rgba(0,0,0,0.55)', floaterStroke: 'rgba(5,25,40,0.9)'
    }
  };
  var THEME_ORDER = ['mint', 'sunset', 'ocean'];
  api.THEMES = THEMES;

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function initUI() {
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $('dwBoard');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var boardWrap = $('dwBoardWrap'), boardInner = $('dwBoardInner');
    var overlay = $('dwOverlay'), overlayCard = $('dwOverlayCard');
    var spinBtn = $('dwSpin'), lastEl = $('dwLast'), turnEl = $('dwTurn'), playersEl = $('dwPlayers');
    var btnNew = $('dwNew'), btnRestart = $('dwRestart'), btnPause = $('dwPause'), btnSpeed = $('dwSpeed');
    var trayEl = $('dwTray'), trayCount = $('dwTrayCount'), logEl = $('dwLog');

    var storage = {
      get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    };
    var G = createDoodle({ storage: storage });
    root.doodle = G; // handy for debugging / automation

    var seats = null;
    try { seats = JSON.parse(storage.get('doodlewheel-players') || 'null'); } catch (e) { seats = null; }
    if (!Array.isArray(seats) || !seats.length) seats = [{ type: 'human' }, { type: 'cpu' }, { type: 'off' }, { type: 'off' }];
    while (seats.length < 4) seats.push({ type: 'off' });
    var themeId = storage.get('doodlewheel-theme');
    if (!THEMES[themeId]) themeId = 'mint';
    var TH = THEMES[themeId];
    var appEl = $('doodleApp'), metaTheme = document.querySelector('meta[name="theme-color"]'), themeBtns = document.querySelectorAll('.dw-sw');
    function applyTheme(id, save) {
      if (!THEMES[id]) id = 'mint';
      themeId = id; TH = THEMES[id];
      appEl.dataset.theme = id;
      document.body.dataset.dwtheme = id;
      themeBtns.forEach(function (b) { var on = b.dataset.theme === id; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      if (metaTheme && (!root.arcade || root.arcade.current === 'doodle')) metaTheme.setAttribute('content', TH.meta);
      if (save) storage.set('doodlewheel-theme', id);
      if (size && boardCache.width) drawSquares(bctx); // instant redraw, game state untouched
    }
    var SPEEDS = [1, 2, 4], speedIdx = 0;
    try { speedIdx = Math.max(0, SPEEDS.indexOf(+storage.get('doodlewheel-speed'))); } catch (e) { speedIdx = 0; }
    G.setSpeed(SPEEDS[speedIdx]);

    var size = 400, s = 40, dpr = 1;
    var particles = [], floaters = [], flyers = [], confetti = [];
    var shake = 0, popT = 0;
    var emojiCache = {};

    function isCurrent() { return !root.arcade || root.arcade.current === 'doodle'; }

    // ---------- geometry ----------
    function center(n) { var c = squareToCell(n); return { x: (c.col + 0.5) * s, y: (SIZE - 1 - c.row + 0.5) * s }; }
    function snakePoints(head, tail, phase, amp) {
      var a = center(head), b = center(tail), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len, waves = Math.max(1.5, Math.round(len / (s * 1.7)) + 0.5), pts = [];
      for (var i = 0; i <= 48; i++) {
        var t = i / 48, env = Math.sin(t * Math.PI);
        var o = Math.sin(t * Math.PI * waves + phase) * s * 0.3 * (amp || 1) * (0.35 + 0.65 * env) * (i === 0 || i === 48 ? 0 : 1);
        pts.push({ x: a.x + dx * t + nx * o, y: a.y + dy * t + ny * o });
      }
      return pts;
    }
    function ropePoints(bottom, top, sway) {
      var a = center(top), b = center(bottom), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len, pts = [];
      if (nx < 0) { nx = -nx; ny = -ny; }
      for (var i = 0; i <= 32; i++) {
        var t = i / 32, o = Math.sin(t * Math.PI) * s * (0.22 + sway * 0.05);
        pts.push({ x: a.x + dx * t + nx * o, y: a.y + dy * t + ny * o * 0.3 + Math.sin(t * Math.PI) * s * 0.18 });
      }
      return pts; // pts[0] = top (anchor), last = bottom
    }
    function along(pts, t) {
      t = Math.max(0, Math.min(1, t));
      var f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
    }

    // ---------- sizing ----------
    var boardCache = document.createElement('canvas'), bctx = boardCache.getContext('2d');
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      var aw = boardWrap.clientWidth, ah = boardWrap.clientHeight;
      if (!aw || !ah) return;
      s = Math.max(16, Math.floor(Math.min(aw, ah) / SIZE));
      size = s * SIZE;
      boardInner.style.width = size + 'px'; boardInner.style.height = size + 'px';
      canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      boardCache.width = canvas.width; boardCache.height = canvas.height;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSquares(bctx);
      emojiCache = {};
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(boardWrap);

    function drawPattern(c) {
      var i, j, k;
      c.save();
      if (TH.pattern === 'grass') { // soft polka dots + little grass tufts
        c.fillStyle = TH.dotColor;
        for (j = 0; j <= SIZE * 2; j++) for (i = 0; i <= SIZE * 2; i++) if ((i + j) % 2 === 0) { c.beginPath(); c.arc(i * s / 2, j * s / 2, s * 0.06, 0, TAU); c.fill(); }
        c.strokeStyle = TH.patternColor; c.lineWidth = Math.max(1, s * 0.035); c.lineCap = 'round';
        for (k = 0; k < 60; k++) {
          var gx = ((k * 37) % 100) / 100 * size, gy = ((k * 61 + 13) % 100) / 100 * size, h = s * 0.16;
          c.beginPath(); c.moveTo(gx - h * 0.5, gy); c.quadraticCurveTo(gx - h * 0.45, gy - h * 0.6, gx - h * 0.7, gy - h);
          c.moveTo(gx, gy); c.lineTo(gx, gy - h * 1.2);
          c.moveTo(gx + h * 0.5, gy); c.quadraticCurveTo(gx + h * 0.45, gy - h * 0.6, gx + h * 0.7, gy - h); c.stroke();
        }
      } else if (TH.pattern === 'stripes') { // soft diagonal stripes + a wavy line
        c.fillStyle = TH.patternColor;
        for (k = -SIZE * 2; k < SIZE * 2; k++) {
          var x0 = k * s * 0.5;
          c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + s * 0.18, 0); c.lineTo(x0 + s * 0.18 + size, size); c.lineTo(x0 + size, size); c.closePath(); c.fill();
        }
      } else { // bubbles + gentle waves
        c.strokeStyle = TH.patternColor; c.lineWidth = Math.max(1, s * 0.03);
        for (k = 0; k < 70; k++) {
          var bx = ((k * 53) % 100) / 100 * size, by = ((k * 29 + 7) % 100) / 100 * size, br = s * (0.06 + (k % 5) * 0.035);
          c.beginPath(); c.arc(bx, by, br, 0, TAU); c.stroke();
          c.fillStyle = TH.dotColor; c.beginPath(); c.arc(bx - br * 0.35, by - br * 0.35, br * 0.22, 0, TAU); c.fill();
        }
        for (j = 1; j < SIZE; j += 2) {
          c.beginPath();
          for (i = 0; i <= 40; i++) { var wx = i / 40 * size; c.lineTo(wx, j * s + Math.sin(i / 40 * TAU * 3) * s * 0.08); }
          c.stroke();
        }
      }
      c.restore();
    }
    function drawSquares(c) {
      var grd = c.createLinearGradient(0, 0, size, size);
      grd.addColorStop(0, TH.bg[0]); grd.addColorStop(1, TH.bg[1]);
      c.fillStyle = grd; c.fillRect(0, 0, size, size);
      drawPattern(c);
      var fs = Math.max(8, Math.round(s * 0.24));
      for (var n = 1; n <= LAST; n++) {
        var cl = squareToCell(n), x = cl.col * s, y = (SIZE - 1 - cl.row) * s;
        var col = TH.tiles[(cl.row * 2 + cl.col * 3) % TH.tiles.length];
        c.globalAlpha = 1; c.fillStyle = TH.tileShadow; rr(c, x + 2, y + 3, s - 4, s - 4, s * 0.18); c.fill();
        c.globalAlpha = TH.tileAlpha[(cl.row + cl.col) % 2];
        c.fillStyle = col; rr(c, x + 2, y + 2, s - 4, s - 4, s * 0.18); c.fill();
        c.globalAlpha = 1; c.strokeStyle = TH.tileBorder; c.lineWidth = 1.2; c.setLineDash([s * 0.09, s * 0.07]); c.stroke(); c.setLineDash([]);
        c.font = '800 ' + fs + 'px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.lineWidth = Math.max(2, fs * 0.22); c.lineJoin = 'round'; c.strokeStyle = TH.numberHalo;
        c.strokeText(String(n), x + s * 0.11, y + s * 0.09);
        c.fillStyle = TH.number; c.fillText(String(n), x + s * 0.11, y + s * 0.09);
      }
      // start + finish badges
      var a = center(1), b = center(LAST);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 ' + Math.max(7, Math.round(s * 0.2)) + 'px ui-sans-serif, system-ui, sans-serif';
      c.fillStyle = TH.badge; c.fillText('START', a.x, a.y + s * 0.28);
      c.save(); c.translate(b.x, b.y + s * 0.06);
      star(c, 0, 0, s * 0.3, s * 0.13, TH.star);
      c.restore();
      c.fillStyle = TH.badge; c.fillText('FINISH', b.x, b.y + s * 0.38);
    }
    function star(c, x, y, R, r, fill) {
      c.beginPath();
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
      c.closePath(); c.fillStyle = fill; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.stroke();
    }

    function drawRopeLine(bottom, top, now) {
      var pts = ropePoints(bottom, top, Math.sin(now * 0.0015 + bottom));
      var w = s * 0.17, i;
      function path() { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y); }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      path(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w + 4; ctx.stroke();
      path(); ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = w + 2; ctx.stroke();
      path(); ctx.strokeStyle = '#c99554'; ctx.lineWidth = w; ctx.stroke();
      // braid: alternating slanted strands
      var total = 0, seg = [];
      for (i = 1; i < pts.length; i++) { var L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(L); total += L; }
      var step = w * 0.75, n = Math.floor(total / step);
      ctx.lineWidth = Math.max(1, w * 0.22);
      for (i = 1; i < n; i++) {
        var t = i / n, p = along(pts, t), q = along(pts, Math.min(1, t + 0.01));
        var dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        var nx = -dy, ny = dx, k = w * 0.45;
        ctx.strokeStyle = i % 2 ? '#7c5127' : '#e8c48f';
        ctx.beginPath(); ctx.moveTo(p.x + nx * k - dx * k * 0.6, p.y + ny * k - dy * k * 0.6); ctx.lineTo(p.x - nx * k + dx * k * 0.6, p.y - ny * k + dy * k * 0.6); ctx.stroke();
      }
      // peg at the top, tassel at the bottom
      var top0 = pts[0], bot = pts[pts.length - 1];
      circle(ctx, top0.x, top0.y, s * 0.13, '#78350f'); circle(ctx, top0.x, top0.y, s * 0.08, '#fbbf24');
      ctx.strokeStyle = '#e8c48f'; ctx.lineWidth = Math.max(1, s * 0.035);
      for (var f = -2; f <= 2; f++) { ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.lineTo(bot.x + f * s * 0.05, bot.y + s * 0.2); ctx.stroke(); }
      circle(ctx, bot.x, bot.y, s * 0.07, '#7c5127');
    }

    function drawSnake(head, tail, idx, now, wiggle) {
      var colr = SNAKE_COLORS[idx % SNAKE_COLORS.length];
      var amp = wiggle ? 1 + Math.sin(now * 0.03) * 0.5 : 1;
      var pts = snakePoints(head, tail, now * (wiggle ? 0.012 : 0.0016) + idx, amp), i, n = pts.length;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var pass = 0; pass < 2; pass++) {
        for (i = n - 1; i > 0; i--) {
          var t = i / (n - 1), w = s * (0.34 - 0.24 * t);
          ctx.strokeStyle = pass ? colr[0] : colr[1];
          ctx.lineWidth = pass ? w : w + 3;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
        }
      }
      for (i = 4; i < n - 3; i += 4) circle(ctx, pts[i].x, pts[i].y, s * (0.07 - 0.04 * i / n), colr[2]);
      var h = pts[0], nb = pts[2], ang = Math.atan2(h.y - nb.y, h.x - nb.x);
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang);
      if (Math.floor(now / 500 + idx) % 3 === 0) {
        ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = Math.max(1.2, s * 0.04);
        ctx.beginPath(); ctx.moveTo(s * 0.2, 0); ctx.lineTo(s * 0.36, 0); ctx.lineTo(s * 0.42, -s * 0.05); ctx.moveTo(s * 0.36, 0); ctx.lineTo(s * 0.42, s * 0.05); ctx.stroke();
      }
      ellipse(ctx, 0, 0, s * 0.26, s * 0.22, 0, colr[1]);
      ellipse(ctx, 0, 0, s * 0.235, s * 0.195, 0, colr[0]);
      [-1, 1].forEach(function (k) {
        circle(ctx, s * 0.06, k * s * 0.1, s * 0.075, '#fff');
        circle(ctx, s * 0.085, k * s * 0.1, s * 0.04, '#1e1b2e');
        circle(ctx, -s * 0.06, k * s * 0.15, s * 0.035, 'rgba(244,114,182,0.7)');
      });
      ctx.restore();
    }

    function emojiSprite(emoji) {
      var key = emoji + '@' + s;
      if (emojiCache[key]) return emojiCache[key];
      var px = Math.ceil(s * 0.6 * dpr), cv = document.createElement('canvas'); cv.width = cv.height = px;
      var c2 = cv.getContext('2d'); c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.font = Math.round(px * 0.8) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c2.fillText(emoji, px / 2, px / 2 + px * 0.05);
      return (emojiCache[key] = cv);
    }
    function drawItems(now) {
      var cur = G.current();
      ANIMALS.forEach(function (a, i) {
        var p = center(a.sq), bob = Math.sin(now * 0.004 + i) * s * 0.03, sz = s * 0.56;
        circle(ctx, p.x + s * 0.08, p.y + s * 0.08, s * 0.3, TH.pad);
        ctx.drawImage(emojiSprite(a.emoji), p.x + s * 0.08 - sz / 2, p.y + s * 0.08 - sz / 2 + bob, sz, sz);
        if (a.perk) {
          var lbl = a.perk === 'hop2' ? '+2' : '\u21bb';
          ctx.font = '900 ' + Math.max(7, Math.round(s * 0.19)) + 'px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          circle(ctx, p.x + s * 0.3, p.y - s * 0.28, s * 0.13, a.perk === 'hop2' ? '#22c55e' : '#8b5cf6');
          ctx.fillStyle = '#fff'; ctx.fillText(lbl, p.x + s * 0.3, p.y - s * 0.27);
        }
        if (cur && cur.friends[a.kind]) { ctx.fillStyle = '#fb7185'; ctx.font = Math.round(s * 0.2) + 'px sans-serif'; ctx.fillText('\u2665', p.x - s * 0.28, p.y + s * 0.3); }
      });
      CREATURES.forEach(function (c, i) {
        if (G.collected[c.id] != null) return;
        var p = center(c.sq), y = p.y + s * 0.06 + Math.sin(now * 0.004 + i * 2) * s * 0.04;
        var gl = ctx.createRadialGradient(p.x, y, 0, p.x, y, s * 0.45);
        gl.addColorStop(0, c.color + '77'); gl.addColorStop(1, c.color + '00');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, y, s * 0.45, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(p.x, y); drawCreature(ctx, c.id, s * 0.6, now); ctx.restore();
      });
    }

    function tokenPos(p, idx) {
      var cur = G.current();
      if (cur === p) {
        if (G.phase === 'moving' && G.pathIdx < G.path.length) {
          var a = center(p.pos), b = center(G.path[G.pathIdx]), k = Math.min(1, G.hopT / T.hop);
          return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * s * 0.45, moving: true };
        }
        if ((G.phase === 'sliding' || G.phase === 'climbing') && G.anim) {
          var e = G.anim.t / G.anim.dur, pts;
          if (G.anim.type === 'slide') { var hd = G.anim.from, nw = performance.now(); pts = snakePoints(hd, G.anim.to, nw * 0.012 + snakeIndex(hd), 1 + Math.sin(nw * 0.03) * 0.5); }
          else pts = ropePoints(G.anim.from, G.anim.to, 0);
          var t = G.anim.type === 'slide' ? e * e * (3 - 2 * e) : 1 - (e * e * (3 - 2 * e));
          var q = along(pts, t);
          return { x: q.x, y: q.y, moving: true };
        }
      }
      // resting: spread tokens that share a square
      var same = G.players.filter(function (o) { return o.pos === p.pos; });
      var c = center(p.pos);
      if (same.length > 1) {
        var j = same.indexOf(p), off = s * 0.2;
        c = { x: c.x + (j % 2 ? off : -off), y: c.y + (j < 2 ? -off * 0.6 : off * 0.9) };
      }
      return c;
    }
    var SNAKE_KEYS = Object.keys(SNAKES).map(Number);
    function snakeIndex(head) { return SNAKE_KEYS.indexOf(head); }

    function drawToken(p, x, y, r, active, now) {
      ctx.save(); ctx.translate(x, y);
      ellipse(ctx, 0, r * 0.95, r * 0.8, r * 0.3, 0, 'rgba(0,0,0,0.35)');
      if (active) {
        ctx.strokeStyle = p.token.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + Math.sin(now * 0.008) * 0.4;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
      circle(ctx, 0, 0, r + 3.5, TH.tokenRing);
      circle(ctx, 0, 0, r + 2, '#fff');
      var gr = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, p.token.color); gr.addColorStop(1, p.token.dark);
      circle(ctx, 0, 0, r, gr);
      circle(ctx, -r * 0.32, -r * 0.05, r * 0.16, '#1e1b2e'); circle(ctx, r * 0.32, -r * 0.05, r * 0.16, '#1e1b2e');
      circle(ctx, -r * 0.36, -r * 0.1, r * 0.06, '#fff'); circle(ctx, r * 0.28, -r * 0.1, r * 0.06, '#fff');
      smile(ctx, 0, r * 0.12, r * 0.22);
      if (p.type === 'cpu') { ctx.fillStyle = '#1e1b2e'; ctx.fillRect(-r * 0.05, -r * 1.25, r * 0.1, r * 0.35); circle(ctx, 0, -r * 1.28, r * 0.13, '#fde047'); }
      ctx.restore();
    }

    // ---------- wheel ----------
    function wheelGeom() { return { cx: size / 2, cy: size * 0.5, R: size * 0.3 }; }
    api.wheelGeom = wheelGeom;
    function drawWheel(now, dt) {
      if (G.phase !== 'spinning' && G.phase !== 'landed') { popT = 0; return; }
      var w = G.wheel, gm = wheelGeom(), cx = gm.cx, cy = gm.cy, R = gm.R, i, p = G.current();
      ctx.fillStyle = TH.dim; ctx.fillRect(0, 0, size, size);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 ' + Math.round(R * 0.15) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = p.token.color;
      ctx.fillText(p.name + (p.name === 'You' ? ' spin!' : ' spins!'), cx, cy - R * 1.3);
      ctx.save(); ctx.translate(cx, cy);
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = R * 0.15;
      circle(ctx, 0, 0, R * 1.07, '#1e1b4b'); ctx.shadowBlur = 0;
      ctx.rotate(w.angle * Math.PI / 180);
      for (i = 0; i < 10; i++) {
        var a0 = -Math.PI / 2 + i * TAU / 10, a1 = a0 + TAU / 10;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
        ctx.fillStyle = SEG_COLORS[i]; ctx.fill();
        if (G.phase === 'landed' && w.result === i + 1 && Math.floor(now / 140) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(1, R * 0.015); ctx.stroke();
        ctx.save(); ctx.rotate(a0 + TAU / 20); ctx.translate(R * 0.68, 0); ctx.rotate(Math.PI / 2);
        ctx.font = '900 ' + Math.round(R * 0.2) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.lineWidth = R * 0.04; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeText(String(i + 1), 0, 0);
        ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), 0, 0);
        ctx.restore();
      }
      ctx.restore();
      for (i = 0; i < 20; i++) {
        var la = i * TAU / 20, on = (Math.floor(now / 140) + i) % 2 === 0;
        circle(ctx, cx + Math.cos(la) * R * 1.035, cy + Math.sin(la) * R * 1.035, R * 0.025, on ? '#fef9c3' : 'rgba(254,249,195,0.3)');
      }
      circle(ctx, cx, cy, R * 0.16, '#fef3c7'); circle(ctx, cx, cy, R * 0.1, '#f59e0b');
      poly(ctx, [[cx - R * 0.12, cy - R * 1.13], [cx + R * 0.12, cy - R * 1.13], [cx, cy - R * 0.86]], '#fff', '#1e1b4b', Math.max(1.5, R * 0.025));
      if (G.phase === 'landed') {
        popT += dt;
        var k = Math.min(1, popT / 300), sc = 0.4 + k * 0.8 + Math.sin(k * Math.PI) * 0.25;
        ctx.save(); ctx.translate(cx, cy + R * 1.3); ctx.scale(sc, sc);
        ctx.font = '900 ' + Math.round(R * 0.32) + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.lineWidth = R * 0.05; ctx.strokeStyle = '#1e1b4b'; ctx.strokeText(String(w.result), 0, 0);
        ctx.fillStyle = SEG_COLORS[w.result - 1]; ctx.fillText(String(w.result), 0, 0);
        ctx.restore();
      }
    }

    // ---------- effects ----------
    function burst(x, y, colors, n, kind) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, sp = (0.03 + Math.random() * 0.09) * s;
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.04 * s, life: 1, decay: 0.0013 + Math.random() * 0.001,
          color: colors[i % colors.length], size: (0.05 + Math.random() * 0.07) * s, kind: kind || 'dot' });
      }
    }
    function floater(text, x, y, color) { floaters.push({ text: text, x: x, y: y, life: 1, color: color || '#fde68a' }); }
    function startConfetti() {
      for (var i = 0; i < 160; i++) confetti.push({ x: Math.random() * size, y: -Math.random() * size * 0.6, vx: (Math.random() - 0.5) * 0.06 * s, vy: (0.03 + Math.random() * 0.05) * s,
        r: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3, w: s * (0.1 + Math.random() * 0.1), h: s * 0.06, color: SEG_COLORS[i % 10] });
    }
    function drawHeart(x, y, z) {
      ctx.beginPath(); ctx.moveTo(x, y + z * 0.35);
      ctx.bezierCurveTo(x - z, y - z * 0.3, x - z * 0.4, y - z, x, y - z * 0.4);
      ctx.bezierCurveTo(x + z * 0.4, y - z, x + z, y - z * 0.3, x, y + z * 0.35); ctx.fill();
    }
    function drawEffects(dt) {
      var i;
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.003 * s * dt / 16; p.life -= p.decay * dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        if (p.kind === 'heart') drawHeart(p.x, p.y, p.size * 1.4);
        else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 6); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
      }
      ctx.globalAlpha = 1;
      for (i = flyers.length - 1; i >= 0; i--) { // creature catch: spin up and shrink toward the tray
        var f = flyers[i]; f.t += dt / 1000;
        if (f.t >= 1) { flyers.splice(i, 1); continue; }
        var e = f.t * f.t, x = f.x + (size / 2 - f.x) * e, y = f.y + (size + s - f.y) * e - Math.sin(f.t * Math.PI) * s * 1.6;
        ctx.save(); ctx.translate(x, y); ctx.rotate(f.t * TAU); ctx.scale(1.6 - f.t, 1.6 - f.t); ctx.globalAlpha = 1 - e * 0.5;
        drawCreature(ctx, f.kind, s * 0.8, 0); ctx.restore();
      }
      ctx.globalAlpha = 1;
      for (i = confetti.length - 1; i >= 0; i--) {
        var c = confetti[i]; c.x += c.vx * dt / 16; c.y += c.vy * dt / 16; c.r += c.vr * dt / 16;
        if (c.y > size + s) { confetti.splice(i, 1); continue; }
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.color; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = floaters.length - 1; i >= 0; i--) {
        var fl = floaters[i]; fl.life -= dt / 1400; fl.y -= dt * 0.025;
        if (fl.life <= 0) { floaters.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, fl.life * 2);
        ctx.font = '800 ' + Math.round(s * 0.36) + 'px ui-sans-serif, system-ui, sans-serif';
        var fx = Math.max(s * 2.2, Math.min(size - s * 2.2, fl.x));
        ctx.lineWidth = 3.5; ctx.strokeStyle = TH.floaterStroke; ctx.strokeText(fl.text, fx, fl.y);
        ctx.fillStyle = fl.color; ctx.fillText(fl.text, fx, fl.y);
      }
      ctx.globalAlpha = 1;
    }

    function render(now, dt) {
      ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - 0.5) * s * 0.3 * shake, (Math.random() - 0.5) * s * 0.3 * shake); shake = Math.max(0, shake - dt / 500); }
      ctx.drawImage(boardCache, 0, 0, size, size);
      drawItems(now);
      Object.keys(ROPES).forEach(function (b) { drawRopeLine(+b, ROPES[b], now); });
      var sliding = G.phase === 'sliding' && G.anim ? G.anim.from : -1;
      SNAKE_KEYS.forEach(function (h, i) { drawSnake(h, SNAKES[h], i, now, h === sliding); });
      var cur = G.current();
      G.players.forEach(function (p, i) { if (p !== cur) { var q = tokenPos(p, i); drawToken(p, q.x, q.y, s * 0.24, false, now); } });
      if (cur) { var q = tokenPos(cur, G.turn); drawToken(cur, q.x, q.y, s * (q.moving ? 0.3 : 0.27), G.isActive(), now); }
      drawEffects(dt);
      drawWheel(now, dt);
      ctx.restore();
    }

    // ---------- tray, players, log ----------
    var slots = {};
    CREATURES.forEach(function (c) {
      var el = document.createElement('div'); el.className = 'dw-slot'; el.title = c.name + ' (' + c.kind + ') on square ' + c.sq;
      var cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      var own = document.createElement('i'); own.className = 'dw-owner';
      var nm = document.createElement('span'); nm.className = 'dw-slot-name'; nm.textContent = c.name;
      el.appendChild(cv); el.appendChild(own); el.appendChild(nm); trayEl.appendChild(el);
      var c2 = cv.getContext('2d'); c2.translate(32, 33); drawCreature(c2, c.id, 50, 0);
      slots[c.id] = { el: el, own: own };
    });
    function creatureImg(id) {
      var cv = document.createElement('canvas'); cv.width = 72; cv.height = 72;
      var c2 = cv.getContext('2d'); c2.translate(36, 37); drawCreature(c2, id, 56, 0);
      return cv.toDataURL();
    }
    function syncTray(popId) {
      var n = 0;
      CREATURES.forEach(function (c) {
        var who = G.collected[c.id], sl = slots[c.id], got = who != null;
        if (got) n++;
        sl.el.classList.toggle('got', got);
        sl.own.style.background = got ? G.players[who].token.color : 'transparent';
        sl.el.title = c.name + (got ? ' (caught by ' + G.players[who].name + ')' : ' on square ' + c.sq);
      });
      trayCount.textContent = n + '/' + CREATURES.length;
      if (popId && slots[popId]) { var el = slots[popId].el; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function syncPlayers() {
      playersEl.innerHTML = G.players.map(function (p, i) {
        return '<div class="dw-pl' + (i === G.turn && G.isActive() ? ' on' : '') + (G.winner === i ? ' won' : '') + '" style="--tc:' + p.token.color + '">' +
          '<i class="dw-dot"></i><b>' + esc(p.name) + '</b><span class="dw-sq">' + p.pos + '</span><span class="dw-pts">' + p.score + '</span></div>';
      }).join('');
    }
    function syncLog() {
      logEl.innerHTML = G.log.slice(-6).reverse().map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    }

    // ---------- overlays ----------
    function showOverlay(html) { overlayCard.innerHTML = html; overlay.classList.add('show'); }
    function hideOverlay() { overlay.classList.remove('show'); }
    function setupOverlay() {
      var rows = seats.map(function (st, i) {
        var opts = (i === 0 ? ['human', 'cpu'] : ['human', 'cpu', 'off']).map(function (t) {
          return '<button type="button" class="seg' + (st.type === t ? ' on' : '') + '" data-seat="' + i + '" data-type="' + t + '">' + { human: 'Human', cpu: 'CPU', off: 'Off' }[t] + '</button>';
        }).join('');
        return '<div class="dw-seat" style="--tc:' + TOKENS[i].color + '"><i class="dw-dot"></i><span>Player ' + (i + 1) + '</span><div class="segs">' + opts + '</div></div>';
      }).join('');
      var st = G.stats;
      showOverlay('<h2>Doodle Wheel</h2>' +
        '<p>Snakes and ladders, doodle style. Spin the <b>1\u201310 wheel</b> to move, climb <b>ropes</b>, dodge <b>snakes</b>, befriend animals and catch creatures on 70\u201399. Land on <b>exactly 100</b> to win.</p>' +
        '<div class="dw-seats">' + rows + '</div>' +
        '<p class="dw-small">Best ' + G.high + ' pts \u00b7 best collection ' + G.bestCollection + '/8 \u00b7 ' + st.wins + ' wins in ' + st.games + ' games</p>' +
        '<button type="button" class="primary" data-ov="start">Start game</button>');
    }
    function pauseOverlay() { showOverlay('<h2>Paused</h2><p>Press <kbd>P</kbd> or tap Resume.</p><button type="button" class="primary" data-ov="resume">Resume</button>'); }
    function winOverlay(d) {
      var w = G.players[d.player];
      var rowsH = G.players.map(function (p) {
        var chips = p.creatures.map(function (k) { return '<img alt="' + CREATURE_BY_ID[k].name + '" title="' + CREATURE_BY_ID[k].name + '" src="' + creatureImg(k) + '">'; }).join('');
        return '<tr' + (p === w ? ' class="win"' : '') + ' style="--tc:' + p.token.color + '"><td><i class="dw-dot"></i>' + esc(p.name) + '</td><td>' + p.score + '</td><td>' + p.stats.spins + '</td><td>' + p.stats.snakes + '</td><td>' + p.stats.ropes + '</td><td>' + p.stats.animals + '</td><td class="cr">' + (chips || p.creatures.length) + '</td></tr>';
      }).join('');
      showOverlay('<h2>\u{1F3C6} ' + esc(w.name) + (w.name === 'You' ? ' win!' : ' wins!') + '</h2>' +
        '<p>Landed exactly on 100 after ' + w.stats.spins + ' spins.</p>' +
        '<table class="dw-table"><thead><tr><th></th><th>Pts</th><th>Spins</th><th>\u{1F40D}</th><th>\u{1FA62}</th><th>\u{1F43E}</th><th>Creatures</th></tr></thead><tbody>' + rowsH + '</tbody></table>' +
        (d.newRecord ? '<p class="record">New high score: ' + d.high + '!</p>' : '<p>Best score: ' + d.high + '</p>') +
        '<p class="dw-small">Best collection: ' + d.bestCollection + '/8' + (d.newBestCollection ? ' <span class="record">new best!</span>' : '') + '</p>' +
        '<div class="dw-ov-btns"><button type="button" class="primary" data-ov="again">Play again</button><button type="button" data-ov="setup">New game</button></div>');
    }
    overlay.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.seat != null) {
        seats[+b.dataset.seat].type = b.dataset.type;
        storage.set('doodlewheel-players', JSON.stringify(seats));
        setupOverlay(); return;
      }
      var a = b.dataset.ov;
      if (a === 'start' || a === 'again') startGame();
      else if (a === 'setup') setupOverlay();
      else if (a === 'resume') setPaused(false);
    });

    // ---------- actions ----------
    function seatList() {
      var on = seats.filter(function (x) { return x.type !== 'off'; });
      var nh = on.filter(function (x) { return x.type === 'human'; }).length, nc = on.length - nh, hum = 0, cpu = 0;
      return on.map(function (x) {
        if (x.type === 'cpu') { cpu++; return { type: 'cpu', name: nc > 1 ? 'CPU ' + cpu : 'CPU' }; }
        hum++; return { type: 'human', name: nh > 1 ? 'Player ' + hum : 'You' };
      });
    }
    function startGame() {
      particles = []; floaters = []; flyers = []; confetti = [];
      G.start(seatList()); hideOverlay(); syncTray(); syncPlayers(); syncLog(); syncUI(true);
    }
    function setPaused(p) {
      if (!G.isActive()) return;
      G.togglePause(p);
      if (G.paused) pauseOverlay(); else hideOverlay();
      syncUI(true);
    }
    function trySpin() { if (G.spin() != null) syncUI(true); }
    function cycleSpeed() {
      speedIdx = (speedIdx + 1) % SPEEDS.length; G.setSpeed(SPEEDS[speedIdx]);
      storage.set('doodlewheel-speed', String(SPEEDS[speedIdx])); syncUI(true);
    }
    spinBtn.addEventListener('click', function () { trySpin(); spinBtn.blur(); });
    btnNew.addEventListener('click', function () { if (G.isActive() && !G.paused) G.togglePause(true); setupOverlay(); syncUI(true); btnNew.blur(); });
    btnRestart.addEventListener('click', function () { startGame(); btnRestart.blur(); });
    btnPause.addEventListener('click', function () { setPaused(!G.paused); btnPause.blur(); });
    btnSpeed.addEventListener('click', function () { cycleSpeed(); btnSpeed.blur(); });
    boardInner.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.overlay.show')) return;
      if (G.isHumanTurn()) { e.preventDefault(); trySpin(); }
    });
    window.addEventListener('keydown', function (e) {
      if (!isCurrent() || e.ctrlKey || e.metaKey || e.altKey) return;
      var k = e.key, t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
        e.preventDefault(); if (e.repeat) return;
        if (G.phase === 'idle' || G.phase === 'over') { if (overlay.classList.contains('show')) startGame(); }
        else if (G.paused) setPaused(false);
        else trySpin();
      } else if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); if (G.isActive()) setPaused(!G.paused); }
      else if (k === 'f' || k === 'F') cycleSpeed();
      else if (k === 'ArrowUp' || k === 'ArrowDown') e.preventDefault();
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && G.isActive() && !G.paused) setPaused(true); });

    // ---------- events -> effects ----------
    G.onEvent = function (type, d) {
      var c;
      if (type === 'hop') { c = center(d.sq); burst(c.x, c.y + s * 0.3, ['rgba(255,255,255,0.7)'], 3); }
      else if (type === 'snake') { c = center(d.from); shake = 0.8; floater('Snake! \u2193' + d.to, c.x, c.y - s * 0.4, '#fca5a5'); }
      else if (type === 'rope') { c = center(d.from); burst(c.x, c.y, ['#c99554', '#fde68a', '#fff'], 14); floater('Rope! \u2191' + d.to + ' +' + d.points, c.x, c.y - s * 0.4, '#fcd34d'); }
      else if (type === 'animal') {
        c = center(d.sq); burst(c.x, c.y, ['#f9a8d4', '#fda4af', '#fde68a', '#fff'], 14, 'heart');
        floater('+' + d.points + (d.perk === 'hop2' ? ' \u00b7 +2 squares' : d.perk === 'respin' ? ' \u00b7 free spin' : ''), c.x, c.y - s * 0.45, '#f9a8d4');
      } else if (type === 'catch') {
        var cr = CREATURE_BY_ID[d.kind]; c = center(d.sq);
        burst(c.x, c.y, [cr.color, '#fff', '#fde68a'], 26);
        floater('Caught ' + d.name + '! +' + d.points, c.x, c.y - s * 0.5, cr.color);
        flyers.push({ kind: d.kind, x: c.x, y: c.y, t: 0 });
        syncTray(d.kind);
      } else if (type === 'win') {
        startConfetti(); c = center(LAST); burst(c.x, c.y, SEG_COLORS, 50);
        setTimeout(function () { if (G.phase === 'over') winOverlay(d); }, 1400);
      } else if (type === 'spun') { lastEl.textContent = G.players[d.player].name + ' spun ' + d.result; }
      if (type === 'log') syncLog();
      if (type !== 'hop') syncPlayers(); else syncPlayersPos();
    };
    function syncPlayersPos() {
      var els = playersEl.querySelectorAll('.dw-sq');
      G.players.forEach(function (p, i) { if (els[i]) els[i].textContent = p.pos; });
    }

    // ---------- HUD ----------
    var last = {};
    function syncUI(force) {
      if (force) last = {};
      var p = G.current(), human = G.isHumanTurn(), txt;
      if (G.phase === 'idle') txt = 'Pick players and start';
      else if (G.phase === 'over') txt = '\u{1F3C6} ' + G.players[G.winner].name + (G.players[G.winner].name === 'You' ? ' win!' : ' wins!');
      else if (G.paused) txt = 'Paused';
      else if (G.phase === 'ready') txt = human ? (p.name === 'You' ? 'Your turn: tap Spin' : p.name + ': tap Spin') : p.name + ' is thinking\u2026';
      else if (G.phase === 'spinning' || G.phase === 'landed') txt = (p.name === 'You' ? 'You are' : p.name + ' is') + ' spinning\u2026';
      else txt = (p.name === 'You' ? 'You are' : p.name + ' is') + ' moving\u2026';
      var st = txt + '|' + human + '|' + G.paused + '|' + G.speed + '|' + G.phase;
      if (last.st === st) return;
      last.st = st;
      turnEl.textContent = txt;
      turnEl.style.setProperty('--tc', p ? p.token.color : '#818cf8');
      spinBtn.disabled = !human;
      spinBtn.classList.toggle('ready', human);
      btnPause.disabled = !G.isActive();
      btnPause.textContent = G.paused ? 'Resume' : 'Pause';
      btnRestart.disabled = G.phase === 'idle';
      btnSpeed.textContent = 'Speed ' + G.speed + '\u00d7';
      if (G.phase !== 'idle') playersEl.querySelectorAll('.dw-pl').forEach(function (el, i) { el.classList.toggle('on', i === G.turn && G.isActive()); });
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
      resize: resize,
      setTheme: function (id) { applyTheme(id, true); },
      theme: function () { return themeId; }
    };

    themeBtns.forEach(function (b) {
      b.addEventListener('click', function () { applyTheme(b.dataset.theme, true); b.blur(); });
    });
    root.addEventListener('hashchange', function () { applyTheme(themeId, false); });
    applyTheme(themeId, false);

    resize();
    syncTray();
    setupOverlay();
    syncUI(true);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})(typeof window !== 'undefined' ? window : globalThis);
