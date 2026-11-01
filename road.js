/*
 * Road Rumble: a top-down, vertically scrolling arcade racer. Pick a vehicle,
 * dodge or kick obstacles out of the way, and go as far as you can while the
 * speed keeps climbing. Original game, inspired by classic combat racers.
 * Plain JavaScript, no dependencies. The engine (createRoad) is DOM-free so it
 * can be loaded in Node for tests: require('./road.js').
 * Copyright (c) 2026 Harish Lohar. All rights reserved.
 */
(function (root) {
  'use strict';

  // ===================================================================
  //  Data
  // ===================================================================
  // World units: the track is 1 unit wide (x 0..1); y is the distance ahead of
  // the player in the same units. 4 lanes.
  var LANES = 4, LANE_W = 1 / LANES;
  function laneX(i) { return (i + 0.5) * LANE_W; }
  function laneOf(x) { return Math.max(0, Math.min(LANES - 1, Math.floor(x / LANE_W))); }

  // Vehicles. start/top in mph; tau = seconds to reach ~63% of top speed;
  // scroll = track widths per second at top speed (the "feel"); steer = max
  // sideways speed (track widths / s); grip = how fast steering responds (low = slidey);
  // kick = strongest obstacle mass it can kick away; hw/hl = half width / length.
  var VEHICLES = [
    { id: 'moto', name: 'Motorcycle', emoji: '\u{1F3CD}\uFE0F', track: 'road', start: 35, top: 160, tau: 65, scroll: 2.9, steer: 1.3, grip: 11, kick: 3, hw: 0.04, hl: 0.085, blurb: 'Balanced and quick. Kicks cones, barrels and rival bikers.' },
    { id: 'car', name: 'Car', emoji: '\u{1F697}', track: 'road', start: 30, top: 150, tau: 75, scroll: 2.7, steer: 0.95, grip: 6, kick: 4, hw: 0.07, hl: 0.12, blurb: 'Wide and heavy. Slower steering, but it rams even cars aside.' },
    { id: 'bicycle', name: 'Bicycle', emoji: '\u{1F6B2}', track: 'road', start: 14, top: 90, tau: 50, scroll: 2.3, steer: 1.55, grip: 15, kick: 2, hw: 0.03, hl: 0.07, blurb: 'Slow start, super nimble. Light kick: cones and barrels only.' },
    { id: 'boat', name: 'Boat', emoji: '\u{1F6A4}', track: 'water', start: 28, top: 120, tau: 70, scroll: 2.5, steer: 1.05, grip: 2.4, kick: 3, hw: 0.065, hl: 0.12, blurb: 'Drifty steering on open water. Watch for rocks and whirlpools.' },
    { id: 'jetski', name: 'Jet Ski', emoji: '\u{1F30A}', track: 'water', start: 32, top: 135, tau: 60, scroll: 2.7, steer: 1.35, grip: 3.2, kick: 2, hw: 0.045, hl: 0.085, blurb: 'Zippy and slidey. Bump buoys and logs out of the way.' },
    { id: 'rocket', name: 'Rocket', emoji: '\u{1F680}', track: 'sky', start: 60, top: 280, tau: 65, scroll: 3.0, steer: 1.2, grip: 7, kick: 3, hw: 0.04, hl: 0.1, blurb: 'Blasts up from the clouds into space. Huge top speed.' },
    { id: 'jet', name: 'Fighter Jet', emoji: '\u2708\uFE0F', track: 'sky', start: 90, top: 340, tau: 70, scroll: 3.2, steer: 1.45, grip: 5.5, kick: 4, hw: 0.07, hl: 0.1, blurb: 'Fastest of all. Wing-bumps drones and asteroids aside.' }
  ];
  var VEHICLE_BY_ID = {};
  VEHICLES.forEach(function (v) { VEHICLE_BY_ID[v.id] = v; });
  // 1..5 bars for the picker card
  function vehicleStats(v) {
    function bar(x, lo, hi) { return Math.max(1, Math.min(5, Math.round(1 + 4 * (x - lo) / (hi - lo)))); }
    return { top: bar(v.top, 90, 340), accel: bar(1 / v.tau + v.start / 600, 1 / 75 + 14 / 600, 1 / 45 + 90 / 600), steer: bar(v.steer * Math.sqrt(v.grip), 0.95 * Math.sqrt(2.4), 1.55 * Math.sqrt(15)), kick: bar(v.kick, 2, 4) };
  }

  // Obstacles per track. mass: kickable when mass <= vehicle kick (Infinity = dodge only).
  // fwd: moves forward at this fraction of your speed; swerve: sideways wobble.
  var OBSTACLES = {
    road: [
      { type: 'cone', name: 'Cone', mass: 1, hw: 0.028, hl: 0.03, minD: 0, weight: 3, points: 50 },
      { type: 'barrel', name: 'Barrel', mass: 2, hw: 0.042, hl: 0.042, minD: 0, weight: 3, points: 75 },
      { type: 'oil', name: 'Oil slick', mass: Infinity, hw: 0.06, hl: 0.05, minD: 0.08, weight: 1.2, points: 0 },
      { type: 'biker', name: 'Rival biker', mass: 2, hw: 0.035, hl: 0.075, minD: 0.12, weight: 2.2, points: 150, fwd: 0.45, swerve: 0.05 },
      { type: 'pothole', name: 'Pothole', mass: Infinity, hw: 0.045, hl: 0.04, minD: 0.2, weight: 1, points: 0 },
      { type: 'carx', name: 'Car', mass: 4, hw: 0.07, hl: 0.12, minD: 0.25, weight: 1.8, points: 250, fwd: 0.3, swerve: 0.015 }
    ],
    water: [
      { type: 'buoy', name: 'Buoy', mass: 1, hw: 0.03, hl: 0.03, minD: 0, weight: 3, points: 50 },
      { type: 'log', name: 'Log', mass: 2, hw: 0.085, hl: 0.03, minD: 0, weight: 2.4, points: 100 },
      { type: 'rock', name: 'Rock', mass: Infinity, hw: 0.055, hl: 0.05, minD: 0.08, weight: 1.4, points: 0 },
      { type: 'rival', name: 'Rival jet ski', mass: 2, hw: 0.04, hl: 0.075, minD: 0.12, weight: 2, points: 150, fwd: 0.45, swerve: 0.06 },
      { type: 'whirl', name: 'Whirlpool', mass: Infinity, hw: 0.065, hl: 0.065, minD: 0.25, weight: 1, points: 0 },
      { type: 'barge', name: 'Barge', mass: 4, hw: 0.075, hl: 0.15, minD: 0.3, weight: 1.2, points: 300, fwd: 0.25, swerve: 0.01 }
    ],
    sky: [
      { type: 'balloon', name: 'Balloon', mass: 1, hw: 0.035, hl: 0.04, minD: 0, weight: 3, points: 50 },
      { type: 'birds', name: 'Bird flock', mass: 1, hw: 0.05, hl: 0.03, minD: 0, weight: 2.4, points: 60, swerve: 0.07 },
      { type: 'storm', name: 'Storm cloud', mass: Infinity, hw: 0.075, hl: 0.055, minD: 0.08, weight: 1.2, points: 0 },
      { type: 'drone', name: 'Rival drone', mass: 2, hw: 0.04, hl: 0.045, minD: 0.12, weight: 2, points: 150, fwd: 0.4, swerve: 0.07 },
      { type: 'asteroid', name: 'Asteroid', mass: 3, hw: 0.055, hl: 0.055, minD: 0.25, weight: 2, points: 200 },
      { type: 'mine', name: 'Space mine', mass: Infinity, hw: 0.04, hl: 0.04, minD: 0.35, weight: 1.2, points: 0 }
    ]
  };

  // everything is drawn and collided at this size (sprites match hitboxes)
  var SIZE = 1.3, OB_BY_TYPE = {}, FLAT = { oil: 1, pothole: 1, whirl: 1, storm: 1 };
  VEHICLES.forEach(function (v) { v.hw *= SIZE; v.hl *= SIZE; });
  Object.keys(OBSTACLES).forEach(function (k) { OBSTACLES[k].forEach(function (o) { o.hw *= SIZE; o.hl *= SIZE; OB_BY_TYPE[o.type] = o; }); });

  var K = {
    spawnY: 2.1,          // obstacles appear this far ahead (off screen)
    despawnY: -0.6,
    kickWindow: 0.18,     // s: a kick connects with anything in reach during this window
    kickCooldown: 0.45,   // s
    kickReach: 0.13,      // extra side reach beyond the vehicle edge
    nearMiss: 0.045,      // gap that counts as a near miss
    comboTime: 3.5,       // s before the combo resets
    crashTime: 1.3,       // s of crash animation before game over
    hitShrink: 0.82,      // forgiving hitboxes
    flatShrink: 0.65,     // flat hazards (oil, potholes, whirlpools, storm clouds) only count near their middle
    nearMissPoints: 30,
    metersPerPoint: 4
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ===================================================================
  //  Engine
  // ===================================================================
  function createRoad(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var storage = opts.storage || null;
    function load(k) { if (!storage) return null; try { return storage.get(k); } catch (e) { return null; } }
    function save(k, v) { if (storage) { try { storage.set(k, v); } catch (e) { /* ignore */ } } }

    var g = {
      phase: 'idle', paused: false, onEvent: null,
      vehicle: VEHICLE_BY_ID[load('roadrumble-vehicle')] ? load('roadrumble-vehicle') : 'moto',
      t: 0, mph: 0, distance: 0, meters: 0, score: 0, bonus: 0, combo: 0, comboT: 0, mult: 1,
      x: 0.5, vx: 0, steer: 0, target: null,
      kickSide: 0, kickT: 0, kickCd: 0, kicks: 0, nearMisses: 0,
      obstacles: [], nextSpawn: 0.8, crash: null, crashT: 0,
      high: parseInt(load('roadrumble-high'), 10) || 0, best: {}, newHigh: false, lastKickAt: -1
    };
    try { g.best = JSON.parse(load('roadrumble-best') || '{}') || {}; } catch (e) { g.best = {}; }
    function emit(type, d) { if (g.onEvent) { try { g.onEvent(type, d || {}); } catch (e) { if (typeof console !== 'undefined') console.error(e); } } }
    g.V = function () { return VEHICLE_BY_ID[g.vehicle]; };
    g.difficulty = function () { var v = g.V(); return clamp((g.mph - v.start) / (v.top - v.start), 0, 1) + Math.min(0.3, g.t / 900); };
    g.scrollSpeed = function () { var v = g.V(); return g.mph / v.top * v.scroll; };

    g.setVehicle = function (id) {
      if (!VEHICLE_BY_ID[id] || (g.phase === 'playing' || g.phase === 'crashing')) return g.vehicle;
      g.vehicle = id; save('roadrumble-vehicle', id); emit('vehicle', { id: id });
      return id;
    };
    g.start = function (id) {
      if (id && VEHICLE_BY_ID[id]) { g.vehicle = id; save('roadrumble-vehicle', id); }
      var v = g.V();
      g.phase = 'playing'; g.paused = false;
      g.t = 0; g.mph = v.start; g.distance = 0; g.meters = 0; g.score = 0; g.bonus = 0; g.combo = 0; g.comboT = 0; g.mult = 1;
      g.x = 0.5; g.vx = 0; g.steer = 0; g.target = null;
      g.kickSide = 0; g.kickT = 0; g.kickCd = 0; g.kicks = 0; g.nearMisses = 0; g.lastKickAt = -1;
      g.obstacles = []; g.nextSpawn = 0.9; g.crash = null; g.crashT = 0; g.newHigh = false;
      emit('start', { vehicle: g.vehicle });
    };
    g.togglePause = function (force) {
      if (g.phase !== 'playing') return;
      g.paused = typeof force === 'boolean' ? force : !g.paused;
      emit(g.paused ? 'pause' : 'unpause');
    };
    // steering: axis -1..1 (keys / buttons), or an absolute target x (drag)
    g.setSteer = function (a) { g.steer = clamp(a || 0, -1, 1); };
    g.setTarget = function (x) { g.target = x == null ? null : clamp(x, 0, 1); };
    g.kick = function (side) {
      if (g.phase !== 'playing' || g.paused || g.kickCd > 0) return false;
      side = side < 0 ? -1 : 1;
      g.kickSide = side; g.kickT = K.kickWindow; g.kickCd = K.kickCooldown;
      g.lastKickAt = g.t;
      emit('kickstart', { side: side });
      tryKick();
      return true;
    };

    function addCombo() {
      g.combo++; g.comboT = K.comboTime;
      g.mult = Math.min(5, 1 + Math.floor(g.combo / 2));
    }
    function inReach(o, side) {
      var v = g.V(), dx = o.x - g.x;
      if (side * dx < -0.005) return false;
      var gap = Math.abs(dx) - o.hw - v.hw;
      return gap <= K.kickReach && Math.abs(o.y) <= o.hl + v.hl + 0.06;
    }
    function tryKick() {
      var v = g.V(), side = g.kickSide;
      g.obstacles.forEach(function (o) {
        if (o.kicked || o.clanked || !inReach(o, side)) return;
        if (o.mass <= v.kick) {
          var pow = 1 + (v.kick - o.mass) * 0.35;
          o.kicked = { vx: side * (2.2 + rng() * 0.8) * pow, vy: 0.9 + rng() * 0.6, spin: side * (7 + rng() * 6), t: 0, rot: 0 };
          addCombo();
          var pts = o.points * g.mult;
          g.bonus += pts; g.kicks++;
          emit('kick', { type: o.type, name: o.name, x: o.x, y: o.y, side: side, points: pts, mult: g.mult });
        } else {
          o.clanked = true; // too heavy: you bounce off it instead
          g.vx = -side * 0.9;
          emit('clank', { type: o.type, name: o.name, x: o.x, y: o.y, side: side });
        }
      });
    }

    var lastSpawnLanes = [];
    function spawn() {
      var v = g.V(), d = g.difficulty();
      var pool = OBSTACLES[v.track].filter(function (o) { return o.minD <= d; });
      // lanes already taken by obstacles in the last stretch: keep at least 2 lanes open in any 0.75 window
      // compare by arrival time at the player (slow movers arrive later than their position suggests)
      var busy = {};
      g.obstacles.forEach(function (o) { if (!o.kicked && arrival(o) > K.spawnY - 0.8) busy[o.lane] = 1; });
      var free = [0, 1, 2, 3].filter(function (l) { return !busy[l]; });
      var maxNew = 2 - Object.keys(busy).length;
      var want = d > 0.3 && rng() < 0.25 + 0.35 * Math.min(1, d) ? 2 : 1;
      var lanesPick = [];
      if (maxNew <= 0) { // only stack into a lane that is already blocked
        var bl = Object.keys(busy).map(Number);
        lanesPick = [bl[Math.floor(rng() * bl.length)]];
      } else {
        while (lanesPick.length < Math.min(want, maxNew) && free.length) lanesPick.push(free.splice(Math.floor(rng() * free.length), 1)[0]);
      }
      var movers = g.obstacles.filter(function (o) { return o.fwd && !o.kicked; }).length;
      lanesPick.forEach(function (lane) {
        if (movers >= 2) pool = pool.filter(function (o) { return !o.fwd; }); // at most 2 rivals/cars at once
        var tw = pool.reduce(function (m, o) { return m + o.weight; }, 0), r = rng() * tw, def = pool[0];
        for (var i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { def = pool[i]; break; } }
        var o = { type: def.type, name: def.name, mass: def.mass, hw: def.hw, hl: def.hl, points: def.points, fwd: def.fwd || 0, swerve: def.swerve || 0,
          x: clamp(laneX(lane) + (rng() - 0.5) * 0.06, def.hw, 1 - def.hw), lane: lane, y: K.spawnY + rng() * 0.2, phase: rng() * 6.28, minGap: 9, passed: false, kicked: null, clanked: false, id: ++spawnId };
        o.homeX = o.x;
        if (o.fwd) movers++;
        g.obstacles.push(o);
        emit('spawn', { type: o.type, lane: lane });
      });
      lastSpawnLanes = lanesPick;
      var gap = (1.0 - 0.55 * Math.min(1, d)) * (0.8 + rng() * 0.45);
      g.nextSpawn = Math.max(0.42, gap);
    }
    var spawnId = 0;
    function arrival(o) { return o.y / (1 - (o.fwd || 0)); }
    g.arrival = arrival;

    function crash(o) {
      g.phase = 'crashing'; g.crashT = 0;
      g.crash = { type: o.type, name: o.name, x: g.x, spin: (o.x < g.x ? 1 : -1) * (8 + rng() * 4) };
      emit('crash', { type: o.type, name: o.name, x: o.x, y: o.y });
    }
    function finish() {
      g.phase = 'over';
      g.score = Math.floor(g.meters / K.metersPerPoint) + g.bonus;
      if (g.score > g.high) { g.high = g.score; g.newHigh = true; save('roadrumble-high', String(g.high)); }
      var b = g.best[g.vehicle] || 0;
      if (g.score > b) { g.best[g.vehicle] = g.score; save('roadrumble-best', JSON.stringify(g.best)); }
      emit('over', { score: g.score, high: g.high, newHigh: g.newHigh, best: g.best[g.vehicle] || 0, meters: g.meters, kicks: g.kicks, nearMisses: g.nearMisses });
    }

    g.update = function (dt) {
      if (g.paused) return;
      dt = Math.min(dt, 0.05);
      var i, o;
      if (g.phase === 'crashing') {
        g.crashT += dt;
        g.mph = Math.max(0, g.mph - g.mph * 3 * dt);
        g.obstacles.forEach(function (q) { if (q.kicked) { q.kicked.t += dt; q.x += q.kicked.vx * dt; q.kicked.rot += q.kicked.spin * dt; } });
        if (g.crashT >= K.crashTime) finish();
        return;
      }
      if (g.phase !== 'playing') return;
      var v = g.V();
      g.t += dt;
      // speed ramps continuously, with a slow creep past "top" so it keeps getting harder
      g.mph = v.start + (v.top - v.start) * (1 - Math.exp(-g.t / v.tau)) + Math.min(v.top * 0.15, g.t * 0.05);
      var sc = g.scrollSpeed();
      g.distance += sc * dt;
      g.meters += g.mph * 0.44704 * dt;
      // steering with per-vehicle response (low grip = drifty)
      var axis = g.steer;
      if (g.target != null) axis = clamp((g.target - g.x) * 9, -1, 1);
      var want = axis * v.steer;
      g.vx += (want - g.vx) * Math.min(1, v.grip * dt);
      g.x += g.vx * dt;
      if (g.x < v.hw) { g.x = v.hw; g.vx = Math.max(0, g.vx) * 0.3; }
      if (g.x > 1 - v.hw) { g.x = 1 - v.hw; g.vx = Math.min(0, g.vx) * 0.3; }
      // kick timers
      if (g.kickCd > 0) g.kickCd = Math.max(0, g.kickCd - dt);
      if (g.kickT > 0) { g.kickT = Math.max(0, g.kickT - dt); tryKick(); }
      if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) { g.combo = 0; g.mult = 1; emit('combo-end'); } }
      // spawn
      g.nextSpawn -= sc * dt;
      if (g.nextSpawn <= 0) spawn();
      // move obstacles, collisions, near misses
      for (i = g.obstacles.length - 1; i >= 0; i--) {
        o = g.obstacles[i];
        if (o.kicked) {
          var k = o.kicked; k.t += dt;
          o.x += k.vx * dt; o.y += (k.vy - sc) * dt * 0.6; k.rot += k.spin * dt;
          if (k.t > 1.4 || o.x < -0.6 || o.x > 1.6) g.obstacles.splice(i, 1);
          continue;
        }
        o.y -= sc * (1 - o.fwd) * dt;
        if (o.swerve) { o.phase += dt * (o.type === 'birds' ? 3.2 : 1.8); o.x = clamp(o.homeX + Math.sin(o.phase) * o.swerve, o.hw, 1 - o.hw); }
        if (o.y < K.despawnY) { g.obstacles.splice(i, 1); continue; }
        var dy = Math.abs(o.y), gap = Math.abs(o.x - g.x) - (o.hw + v.hw);
        if (dy < o.hl + v.hl) {
          var hs = FLAT[o.type] ? K.flatShrink : K.hitShrink;
          if (Math.abs(o.x - g.x) < o.hw * hs + v.hw * K.hitShrink && dy < (o.hl + v.hl) * hs) { crash(o); return; }
          o.minGap = Math.min(o.minGap, gap);
        } else if (!o.passed && o.y < 0) {
          o.passed = true;
          if (o.minGap >= -0.02 && o.minGap < K.nearMiss) {
            addCombo(); g.nearMisses++;
            var pts = K.nearMissPoints * g.mult; g.bonus += pts;
            emit('nearmiss', { type: o.type, x: o.x, points: pts, mult: g.mult });
          }
        }
      }
      g.score = Math.floor(g.meters / K.metersPerPoint) + g.bonus;
    };
    return g;
  }

  var api = {
    createRoad: createRoad, VEHICLES: VEHICLES, VEHICLE_BY_ID: VEHICLE_BY_ID, OBSTACLES: OBSTACLES, OB_BY_TYPE: OB_BY_TYPE, K: K,
    LANES: LANES, laneX: laneX, laneOf: laneOf, vehicleStats: vehicleStats
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RoadRumble = api;

  // ===================================================================
  //  Rendering + UI (browser only)
  // ===================================================================
  if (typeof document === 'undefined') return;
  var TAU = Math.PI * 2;
  function circle(c, x, y, r, f) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = f; c.fill(); }
  function ell(c, x, y, rx, ry, f, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); c.fillStyle = f; c.fill(); }
  function rrect(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function box(c, x, y, w, h, r, f, s, lw) { rrect(c, x, y, w, h, r); if (f) { c.fillStyle = f; c.fill(); } if (s) { c.strokeStyle = s; c.lineWidth = lw || 1; c.stroke(); } }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function flameShape(c, x, y, w, len, t) {
    var f = len * (0.8 + Math.sin(t * 0.05) * 0.12 + Math.sin(t * 0.13) * 0.08);
    c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y + f * 1.2, x + w, y); c.closePath(); c.fillStyle = '#fb923c'; c.fill();
    c.beginPath(); c.moveTo(x - w * 0.55, y); c.quadraticCurveTo(x, y + f * 0.7, x + w * 0.55, y); c.closePath(); c.fillStyle = '#fde047'; c.fill();
  }

  // ---------- vehicle sprites (top-down, nose up). u = pixels per track unit ----------
  function drawRider(c, x, y, r, jacket, helmet) {
    ell(c, x, y + r * 0.35, r * 1.15, r * 0.9, jacket);
    circle(c, x, y - r * 0.2, r * 0.78, helmet);
    ell(c, x, y - r * 0.55, r * 0.55, r * 0.22, 'rgba(20,30,50,0.85)');
    circle(c, x - r * 0.25, y - r * 0.4, r * 0.18, 'rgba(255,255,255,0.6)');
  }
  function drawVehicle(c, id, u, t, o) {
    o = o || {};
    var v = VEHICLE_BY_ID[id] || VEHICLES[0], w = v.hw * u, l = v.hl * u, col = o.color;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    switch (id) {
      case 'moto': {
        ell(c, 0, l * 0.15, w * 1.15, l * 1.05, 'rgba(0,0,0,0.25)');
        box(c, -w * 0.3, -l, w * 0.6, l * 0.55, w * 0.3, '#1f2937'); box(c, -w * 0.3, l * 0.45, w * 0.6, l * 0.6, w * 0.3, '#1f2937');
        ell(c, 0, 0, w * 0.75, l * 0.72, col || '#ef4444');
        ell(c, 0, -l * 0.35, w * 0.45, l * 0.22, 'rgba(255,255,255,0.35)');
        c.strokeStyle = '#d1d5db'; c.lineWidth = Math.max(1.5, w * 0.18); c.beginPath(); c.moveTo(-w * 1.05, -l * 0.5); c.lineTo(w * 1.05, -l * 0.5); c.stroke();
        circle(c, 0, -l * 0.98, w * 0.22, '#fde68a');
        drawRider(c, 0, l * 0.1, w * 0.62, o.jacket || '#111827', o.helmet || '#f8fafc');
        break;
      }
      case 'biker': { // rival biker obstacle (same as moto, other colours)
        c.restore(); drawVehicle(c, 'moto', u * (OB_BY_TYPE.biker.hw / VEHICLE_BY_ID.moto.hw), t, { color: o.color || '#8b5cf6', jacket: '#4c1d95', helmet: '#facc15' }); return;
      }
      case 'car': case 'carx': {
        var cw = (id === 'carx' ? OB_BY_TYPE.carx.hw : v.hw) * u, cl = (id === 'carx' ? OB_BY_TYPE.carx.hl : v.hl) * u;
        ell(c, 0, cl * 0.1, cw * 1.15, cl * 1.05, 'rgba(0,0,0,0.28)');
        [-1, 1].forEach(function (k) { box(c, k * cw - cw * 0.18, -cl * 0.75, cw * 0.36, cl * 0.38, 3, '#111'); box(c, k * cw - cw * 0.18, cl * 0.38, cw * 0.36, cl * 0.38, 3, '#111'); });
        box(c, -cw, -cl, cw * 2, cl * 2, cw * 0.45, col || '#2563eb', 'rgba(0,0,0,0.45)', 1.5);
        box(c, -cw * 0.72, -cl * 0.5, cw * 1.44, cl * 0.36, cw * 0.2, '#bfdbfe');
        box(c, -cw * 0.75, -cl * 0.1, cw * 1.5, cl * 0.62, cw * 0.25, 'rgba(255,255,255,0.18)');
        box(c, -cw * 0.66, cl * 0.55, cw * 1.32, cl * 0.24, cw * 0.15, '#93c5fd');
        circle(c, -cw * 0.62, -cl * 0.93, cw * 0.17, '#fef08a'); circle(c, cw * 0.62, -cl * 0.93, cw * 0.17, '#fef08a');
        box(c, -cw * 0.8, cl * 0.9, cw * 0.4, cl * 0.08, 2, '#ef4444'); box(c, cw * 0.4, cl * 0.9, cw * 0.4, cl * 0.08, 2, '#ef4444');
        if (id === 'car') { c.fillStyle = '#fff'; c.fillRect(-cw * 0.12, -cl, cw * 0.24, cl * 2); }
        break;
      }
      case 'bicycle': {
        ell(c, 0, l * 0.1, w * 1.3, l * 1.05, 'rgba(0,0,0,0.22)');
        c.strokeStyle = '#111827'; c.lineWidth = Math.max(2, w * 0.5);
        c.beginPath(); c.moveTo(0, -l); c.lineTo(0, -l * 0.45); c.moveTo(0, l * 0.45); c.lineTo(0, l); c.stroke();
        c.strokeStyle = '#14b8a6'; c.lineWidth = Math.max(1.5, w * 0.35); c.beginPath(); c.moveTo(0, -l * 0.6); c.lineTo(0, l * 0.6); c.stroke();
        c.strokeStyle = '#9ca3af'; c.lineWidth = Math.max(1.2, w * 0.25); c.beginPath(); c.moveTo(-w * 1.5, -l * 0.62); c.lineTo(w * 1.5, -l * 0.62); c.stroke();
        drawRider(c, 0, l * 0.05, w * 0.95, '#22c55e', '#f97316');
        break;
      }
      case 'boat': {
        if (o.wake) wake(c, w, l, t, 1.3);
        c.beginPath(); c.moveTo(0, -l * 1.08); c.bezierCurveTo(w * 1.1, -l * 0.5, w * 1.05, l * 0.6, w * 0.8, l); c.lineTo(-w * 0.8, l); c.bezierCurveTo(-w * 1.05, l * 0.6, -w * 1.1, -l * 0.5, 0, -l * 1.08); c.closePath();
        c.fillStyle = '#f8fafc'; c.fill(); c.strokeStyle = '#334155'; c.lineWidth = 1.5; c.stroke();
        c.strokeStyle = col || '#dc2626'; c.lineWidth = Math.max(2, w * 0.18); c.beginPath(); c.moveTo(-w * 0.85, l * 0.2); c.lineTo(w * 0.85, l * 0.2); c.stroke();
        box(c, -w * 0.55, -l * 0.35, w * 1.1, l * 0.45, w * 0.25, '#0ea5e9'); box(c, -w * 0.45, -l * 0.3, w * 0.9, l * 0.15, w * 0.1, '#e0f2fe');
        drawRider(c, 0, l * 0.5, w * 0.35, '#1d4ed8', '#fbbf24');
        break;
      }
      case 'jetski': case 'rival': {
        if (o.wake) wake(c, w, l, t, 1);
        var jc = id === 'rival' ? (col || '#db2777') : (col || '#facc15');
        var jw = (id === 'rival' ? OB_BY_TYPE.rival.hw : v.hw) * u, jl = (id === 'rival' ? OB_BY_TYPE.rival.hl : v.hl) * u;
        c.beginPath(); c.moveTo(0, -jl * 1.05); c.quadraticCurveTo(jw * 1.2, -jl * 0.1, jw * 0.8, jl); c.lineTo(-jw * 0.8, jl); c.quadraticCurveTo(-jw * 1.2, -jl * 0.1, 0, -jl * 1.05); c.closePath();
        c.fillStyle = jc; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#111827'; c.fillRect(-jw * 0.35, -jl * 0.1, jw * 0.7, jl * 0.7);
        drawRider(c, 0, jl * 0.2, jw * 0.6, id === 'rival' ? '#831843' : '#0f766e', id === 'rival' ? '#fde047' : '#f8fafc');
        break;
      }
      case 'rocket': {
        flameShape(c, 0, l * 0.92, w * 0.7, l * 1.1, t);
        [-1, 1].forEach(function (k) { c.beginPath(); c.moveTo(k * w * 0.7, l * 0.2); c.lineTo(k * w * 1.6, l * 0.95); c.lineTo(k * w * 0.7, l * 0.8); c.closePath(); c.fillStyle = '#ef4444'; c.fill(); });
        box(c, -w * 0.75, -l * 0.6, w * 1.5, l * 1.55, w * 0.5, '#f1f5f9', '#475569', 1.5);
        c.beginPath(); c.moveTo(-w * 0.75, -l * 0.55); c.quadraticCurveTo(0, -l * 1.35, w * 0.75, -l * 0.55); c.closePath(); c.fillStyle = '#ef4444'; c.fill();
        circle(c, 0, -l * 0.2, w * 0.42, '#334155'); circle(c, 0, -l * 0.2, w * 0.3, '#7dd3fc');
        c.fillStyle = '#ef4444'; c.fillRect(-w * 0.1, l * 0.25, w * 0.2, l * 0.6);
        break;
      }
      case 'jet': {
        flameShape(c, -w * 0.22, l * 0.95, w * 0.17, l * 0.8, t); flameShape(c, w * 0.22, l * 0.95, w * 0.17, l * 0.8, t + 40);
        c.beginPath(); c.moveTo(0, -l * 1.1); c.lineTo(w * 0.25, -l * 0.45); c.lineTo(w * 1.3, l * 0.45); c.lineTo(w * 1.3, l * 0.65); c.lineTo(w * 0.35, l * 0.55); c.lineTo(w * 0.55, l * 0.95); c.lineTo(-w * 0.55, l * 0.95); c.lineTo(-w * 0.35, l * 0.55); c.lineTo(-w * 1.3, l * 0.65); c.lineTo(-w * 1.3, l * 0.45); c.lineTo(-w * 0.25, -l * 0.45); c.closePath();
        c.fillStyle = col || '#94a3b8'; c.fill(); c.strokeStyle = '#334155'; c.lineWidth = 1.5; c.stroke();
        ell(c, 0, -l * 0.45, w * 0.17, l * 0.28, '#38bdf8'); ell(c, -w * 0.04, -l * 0.55, w * 0.06, l * 0.1, 'rgba(255,255,255,0.7)');
        circle(c, -w * 1.25, l * 0.5, w * 0.08, '#ef4444'); circle(c, w * 1.25, l * 0.5, w * 0.08, '#22c55e');
        break;
      }
    }
    c.restore();
  }
  function wake(c, w, l, t, k) {
    c.save(); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = Math.max(1.5, w * 0.15);
    for (var i = 0; i < 3; i++) {
      var e = ((t * 0.004 + i / 3) % 1), sp = w * (1 + e * 2.2 * k), y = l * (0.9 + e * 2.2);
      c.globalAlpha = 0.8 * (1 - e);
      c.beginPath(); c.moveTo(-sp, y); c.quadraticCurveTo(0, y - l * 0.6, sp, y); c.stroke();
    }
    c.restore();
  }

  // ---------- obstacle sprites ----------
  function drawObstacle(c, o, u, t) {
    var w = o.hw * u, l = o.hl * u;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    switch (o.type) {
      case 'cone':
        circle(c, 2, 3, w * 1.1, 'rgba(0,0,0,0.25)');
        box(c, -w * 1.05, -w * 1.05, w * 2.1, w * 2.1, w * 0.3, '#ea580c');
        circle(c, 0, 0, w * 0.85, '#fb923c'); c.strokeStyle = '#fff'; c.lineWidth = Math.max(1.5, w * 0.22); c.beginPath(); c.arc(0, 0, w * 0.55, 0, TAU); c.stroke();
        circle(c, 0, 0, w * 0.22, '#fdba74'); break;
      case 'barrel':
        circle(c, 2, 3, w, 'rgba(0,0,0,0.3)'); circle(c, 0, 0, w, '#1d4ed8'); circle(c, 0, 0, w * 0.82, '#2563eb');
        c.strokeStyle = '#93c5fd'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, w * 0.55, 0, TAU); c.stroke();
        circle(c, w * 0.3, -w * 0.3, w * 0.14, '#1e3a8a'); circle(c, -w * 0.3, -w * 0.3, w * 0.2, 'rgba(255,255,255,0.35)'); break;
      case 'oil':
        c.beginPath(); for (var a = 0; a <= 12; a++) { var ang = a / 12 * TAU, rr = 1 + Math.sin(a * 2.3 + o.phase) * 0.18; c.lineTo(Math.cos(ang) * w * rr, Math.sin(ang) * l * rr); } c.closePath();
        c.fillStyle = '#0b0b12'; c.fill();
        ell(c, -w * 0.25, -l * 0.25, w * 0.35, l * 0.18, 'rgba(147,51,234,0.45)', -0.4); ell(c, w * 0.2, l * 0.15, w * 0.25, l * 0.12, 'rgba(34,211,238,0.35)', 0.4); break;
      case 'pothole':
        ell(c, 0, 0, w * 1.1, l * 1.1, '#52525b'); ell(c, 0, 1, w * 0.9, l * 0.85, '#18181b');
        c.strokeStyle = '#3f3f46'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(w * 0.9, 0); c.lineTo(w * 1.5, -l * 0.4); c.moveTo(-w * 0.8, l * 0.3); c.lineTo(-w * 1.4, l * 0.8); c.stroke(); break;
      case 'biker': drawVehicle(c, 'biker', u, t, { color: ['#8b5cf6', '#16a34a', '#f59e0b'][o.id % 3] }); break;
      case 'carx': drawVehicle(c, 'carx', u, t, { color: ['#f59e0b', '#10b981', '#e11d48', '#64748b'][o.id % 4] }); break;
      case 'buoy':
        circle(c, 0, 0, w * 1.5, 'rgba(255,255,255,0.25)'); circle(c, 0, 0, w, '#dc2626');
        c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, w * 0.35); c.beginPath(); c.moveTo(-w * 0.95, 0); c.lineTo(w * 0.95, 0); c.stroke();
        circle(c, 0, 0, w * 0.25, '#fde047'); break;
      case 'log':
        box(c, -w, -l, w * 2, l * 2, l, '#78350f', '#451a03', 1.5);
        c.strokeStyle = '#a16207'; c.lineWidth = 1; c.beginPath(); c.moveTo(-w * 0.7, -l * 0.3); c.lineTo(w * 0.5, -l * 0.3); c.moveTo(-w * 0.4, l * 0.35); c.lineTo(w * 0.7, l * 0.35); c.stroke();
        ell(c, w - l * 0.4, 0, l * 0.45, l * 0.85, '#d6a35c'); c.strokeStyle = '#92400e'; c.beginPath(); c.arc(w - l * 0.4, 0, l * 0.4, 0, TAU); c.stroke(); break;
      case 'rock':
        circle(c, 0, 0, w * 1.3, 'rgba(255,255,255,0.3)');
        c.beginPath(); [[-1, -0.3], [-0.6, -0.95], [0.3, -1], [1, -0.4], [0.85, 0.6], [0.1, 1], [-0.8, 0.7]].forEach(function (p) { c.lineTo(p[0] * w, p[1] * l); }); c.closePath();
        c.fillStyle = '#57534e'; c.fill(); c.strokeStyle = '#292524'; c.lineWidth = 1.5; c.stroke();
        ell(c, -w * 0.25, -l * 0.35, w * 0.35, l * 0.2, 'rgba(255,255,255,0.25)'); break;
      case 'rival': drawVehicle(c, 'rival', u, t, { wake: true }); break;
      case 'whirl':
        c.rotate(t * 0.004); c.strokeStyle = 'rgba(224,242,254,0.85)'; c.lineWidth = Math.max(1.5, w * 0.12);
        ell(c, 0, 0, w, l, '#0c4a6e');
        for (var k = 0; k < 3; k++) { c.beginPath(); for (var q = 0; q < 26; q++) { var aa = q * 0.3 + k * TAU / 3, r2 = w * (1 - q / 28); c.lineTo(Math.cos(aa) * r2, Math.sin(aa) * r2 * (l / w)); } c.stroke(); } break;
      case 'barge':
        box(c, -w, -l, w * 2, l * 2, w * 0.4, '#475569', '#1e293b', 2);
        ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'].forEach(function (cc, i) { box(c, -w * 0.75, -l * 0.8 + i * l * 0.42, w * 1.5, l * 0.36, 2, cc); });
        break;
      case 'balloon': {
        var bc = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899'][o.id % 5];
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, l * 0.9); c.quadraticCurveTo(w * 0.4, l * 1.4, 0, l * 1.9); c.stroke();
        ell(c, 0, 0, w, l, bc); ell(c, -w * 0.35, -l * 0.35, w * 0.25, l * 0.3, 'rgba(255,255,255,0.45)'); break;
      }
      case 'birds':
        c.strokeStyle = '#1f2937'; c.lineWidth = Math.max(1.6, w * 0.12);
        [[0, 0], [-w * 0.7, l * 0.6], [w * 0.7, l * 0.6]].forEach(function (p, i) { var f = Math.sin(t * 0.02 + i) * 0.5; c.beginPath(); c.moveTo(p[0] - w * 0.4, p[1] - l * f); c.quadraticCurveTo(p[0] - w * 0.15, p[1] - l * 0.4, p[0], p[1]); c.quadraticCurveTo(p[0] + w * 0.15, p[1] - l * 0.4, p[0] + w * 0.4, p[1] - l * f); c.stroke(); }); break;
      case 'storm':
        [[-0.5, 0.1, 0.55], [0.1, -0.2, 0.65], [0.55, 0.15, 0.5], [0, 0.35, 0.55]].forEach(function (p) { circle(c, p[0] * w, p[1] * l, p[2] * l * 1.4, '#475569'); });
        c.beginPath(); c.moveTo(0, -l * 0.1); c.lineTo(-w * 0.2, l * 0.5); c.lineTo(0, l * 0.45); c.lineTo(-w * 0.15, l * 1.1); c.lineTo(w * 0.25, l * 0.3); c.lineTo(0, l * 0.35); c.lineTo(w * 0.12, -l * 0.1); c.closePath();
        c.fillStyle = Math.floor(t / 180) % 3 ? '#fde047' : '#fff'; c.fill(); break;
      case 'drone':
        c.strokeStyle = '#111827'; c.lineWidth = Math.max(2, w * 0.15); c.beginPath(); c.moveTo(-w, -l); c.lineTo(w, l); c.moveTo(w, -l); c.lineTo(-w, l); c.stroke();
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { circle(c, p[0] * w, p[1] * l, w * 0.45, 'rgba(148,163,184,0.45)'); c.save(); c.translate(p[0] * w, p[1] * l); c.rotate(t * 0.06); c.fillStyle = '#e5e7eb'; c.fillRect(-w * 0.45, -1, w * 0.9, 2); c.restore(); });
        box(c, -w * 0.4, -l * 0.4, w * 0.8, l * 0.8, 3, '#ef4444'); circle(c, 0, -l * 0.15, w * 0.12, '#fde047'); break;
      case 'asteroid':
        c.rotate(o.phase + t * 0.001);
        c.beginPath(); for (var b = 0; b < 11; b++) { var an = b / 11 * TAU, r3 = w * (0.85 + hash(o.id * 13 + b) * 0.3); c.lineTo(Math.cos(an) * r3, Math.sin(an) * r3); } c.closePath();
        c.fillStyle = '#78716c'; c.fill(); c.strokeStyle = '#44403c'; c.lineWidth = 1.5; c.stroke();
        circle(c, -w * 0.3, -w * 0.2, w * 0.22, '#57534e'); circle(c, w * 0.35, w * 0.25, w * 0.16, '#57534e'); circle(c, w * 0.1, -w * 0.5, w * 0.1, '#57534e'); break;
      case 'mine':
        c.rotate(t * 0.002);
        c.strokeStyle = '#111827'; c.lineWidth = Math.max(2, w * 0.18);
        for (var sp = 0; sp < 8; sp++) { var sa = sp / 8 * TAU; c.beginPath(); c.moveTo(Math.cos(sa) * w * 0.6, Math.sin(sa) * w * 0.6); c.lineTo(Math.cos(sa) * w * 1.15, Math.sin(sa) * w * 1.15); c.stroke(); }
        circle(c, 0, 0, w * 0.75, '#1f2937'); circle(c, 0, 0, w * 0.3, Math.floor(t / 250) % 2 ? '#ef4444' : '#7f1d1d'); break;
    }
    c.restore();
  }
  api.drawVehicle = drawVehicle; api.drawObstacle = drawObstacle;

  // ---------- tracks ----------
  var TRACKS = {
    road: { side: ['#3f8f3a', '#367d32'], surface: '#3b3f47', line: 'rgba(255,255,255,0.85)', edge: ['#ef4444', '#f8fafc'], meta: '#24452a' },
    water: { side: ['#e9d29c', '#dcc185'], surface: '#0e7490', line: 'rgba(224,242,254,0.55)', edge: ['#fde68a', '#f8fafc'], meta: '#0c4a6e' },
    sky: { side: ['#7dd3fc', '#38bdf8'], surface: '#60a5fa', line: 'rgba(255,255,255,0.5)', edge: null, meta: '#1e3a8a' }
  };

  function initUI() {
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $('rrCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var wrap = $('rrWrap'), inner = $('rrInner'), overlay = $('rrOverlay'), card = $('rrCard');
    var elScore = $('rrScore'), elSpeed = $('rrSpeed'), elDist = $('rrDist'), elHigh = $('rrHigh'), elCombo = $('rrCombo');
    var storage = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
    var G = createRoad({ storage: storage });
    root.road = G;
    var W = 360, H = 600, dpr = 1, shake = 0, flash = 0, particles = [], floaters = [], mode = 'pick';

    function isCurrent() { return !root.arcade || root.arcade.current === 'road'; }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      var aw = wrap.clientWidth, ah = wrap.clientHeight;
      if (!aw || !ah) return;
      W = Math.floor(Math.min(aw, ah * 0.66)); H = Math.floor(ah);
      inner.style.width = W + 'px'; inner.style.height = H + 'px';
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);

    // geometry: track unit -> pixels
    function geom() {
      var py = H * 0.82, u = Math.min(W * 0.74, py / 1.7);
      return { u: u, ox: (W - u) / 2, py: py };
    }
    api.geom = function () { return geom(); };

    // ---------- background ----------
    function drawTrack(now) {
      var V = G.V(), tr = TRACKS[V.track], gm = geom(), u = gm.u, ox = gm.ox, off = (G.distance * u), i, k;
      var d = Math.min(1, G.difficulty());
      if (V.track === 'sky') { // climb from blue sky into space as speed rises
        var top = mix([125, 211, 252], [7, 10, 40], d), bot = mix([186, 230, 253], [30, 27, 75], d);
        var gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, top); gr.addColorStop(1, bot);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        if (d > 0.35) for (i = 0; i < 60; i++) { var sx = hash(i) * W, sy = (hash(i + 99) * H + off * 0.15) % H; ctx.globalAlpha = (d - 0.35) * 1.5 * (0.4 + hash(i + 7) * 0.6); circle(ctx, sx, sy, 0.6 + hash(i + 3) * 1.2, '#fff'); }
        ctx.globalAlpha = 1;
        // parallax clouds (fade out in space)
        for (k = 0; k < 2; k++) {
          var spd = k ? 0.9 : 0.45, sp = u * (k ? 0.55 : 0.8);
          for (i = -1; i < H / sp + 2; i++) {
            var idx = Math.floor((off * spd) / sp) - i, cy = (off * spd) % sp + i * sp;
            var cx = hash(idx * 3 + k) * W, cr = u * (k ? 0.05 + hash(idx + 7) * 0.06 : 0.07 + hash(idx) * 0.1);
            if (k && cx > ox + u * 0.1 && cx < ox + u * 0.9) cx = cx < ox + u / 2 ? ox - u * 0.02 : ox + u * 1.02; // keep the near clouds off the lanes
            ctx.globalAlpha = (k ? 0.7 : 0.35) * (1 - d * 0.85);
            [[0, 0, 1], [0.8, 0.15, 0.75], [-0.8, 0.2, 0.7]].forEach(function (p) { circle(ctx, cx + p[0] * cr, cy + p[1] * cr, p[2] * cr, '#fff'); });
          }
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([u * 0.05, u * 0.09]); ctx.lineDashOffset = -off;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 - d * 0.15) + ')'; ctx.lineWidth = 2;
        for (i = 1; i < LANES; i++) { ctx.beginPath(); ctx.moveTo(ox + i * u / LANES, 0); ctx.lineTo(ox + i * u / LANES, H); ctx.stroke(); }
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(ox, -2, u, H + 4);
        return;
      }
      // sides
      ctx.fillStyle = tr.side[0]; ctx.fillRect(0, 0, W, H);
      var bandH = u * 0.22;
      ctx.fillStyle = tr.side[1];
      for (i = -1; i < H / bandH + 2; i++) { var by = (off % (bandH * 2)) + i * bandH * 2 - bandH * 2; ctx.fillRect(0, by, ox, bandH); ctx.fillRect(ox + u, by, W - ox - u, bandH); }
      // surface
      ctx.fillStyle = tr.surface; ctx.fillRect(ox, 0, u, H);
      if (V.track === 'water') {
        var wg = ctx.createLinearGradient(ox, 0, ox + u, 0); wg.addColorStop(0, 'rgba(255,255,255,0.12)'); wg.addColorStop(0.5, 'rgba(0,0,0,0)'); wg.addColorStop(1, 'rgba(255,255,255,0.12)');
        ctx.fillStyle = wg; ctx.fillRect(ox, 0, u, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
        var wsp = u * 0.16;
        for (i = -1; i < H / wsp + 2; i++) { var wy = (off % wsp) + i * wsp; for (k = 0; k < 5; k++) { var wx = ox + u * hash(Math.floor(off / wsp) - i + k * 31); ctx.beginPath(); ctx.arc(wx, wy, u * 0.025, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); } }
        // foam shores
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (i = -1; i < H / (u * 0.06) + 2; i++) { var fy = (off % (u * 0.06)) + i * u * 0.06, fw = u * (0.015 + 0.01 * Math.sin(i + off * 0.01)); ctx.fillRect(ox - 2, fy, fw, u * 0.04); ctx.fillRect(ox + u + 2 - fw, fy, fw, u * 0.04); }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        for (i = 0; i < 40; i++) { var nx = ox + hash(i) * u, ny = (hash(i + 50) * H + off) % H; ctx.fillRect(nx, ny, 2, 2); }
        // curbs
        var cH = u * 0.08;
        for (i = -1; i < H / cH + 2; i++) { var cy2 = (off % (cH * 2)) + i * cH - cH * 2; ctx.fillStyle = tr.edge[(i + 100) % 2]; ctx.fillRect(ox - u * 0.035, cy2, u * 0.035, cH); ctx.fillRect(ox + u, cy2, u * 0.035, cH); }
      }
      // lane dashes
      ctx.strokeStyle = tr.line; ctx.lineWidth = Math.max(2, u * 0.012);
      ctx.setLineDash([u * 0.14, u * 0.14]); ctx.lineDashOffset = -off;
      for (i = 1; i < LANES; i++) { ctx.beginPath(); ctx.moveTo(ox + i * u / LANES, -u * 0.3); ctx.lineTo(ox + i * u / LANES, H + u * 0.3); ctx.stroke(); }
      ctx.setLineDash([]);
      // roadside scenery
      var sp2 = u * 0.36;
      for (i = -1; i < H / sp2 + 2; i++) {
        var id = Math.floor(off / sp2) - i, yy = (off % sp2) + i * sp2;
        for (var side = 0; side < 2; side++) {
          var hsh = hash(id * 2 + side), roomW = ox - u * 0.05, x0 = side ? ox + u + u * 0.05 + roomW * (0.2 + hash(id + side * 9) * 0.6) : roomW * (0.2 + hash(id + side * 9) * 0.6);
          if (roomW < u * 0.06) continue;
          if (V.track === 'water') { if (hsh < 0.45) palm(x0, yy, u * 0.07, now); else if (hsh < 0.6) circle(ctx, x0, yy, u * 0.03, '#c2a36a'); }
          else if (hsh < 0.5) tree(x0, yy, u * (0.05 + hash(id + 3) * 0.03));
          else if (hsh < 0.65) { circle(ctx, x0, yy, u * 0.03, '#2f6b2b'); circle(ctx, x0 + u * 0.03, yy + u * 0.01, u * 0.025, '#2f6b2b'); }
          else if (hsh < 0.75) { box(ctx, x0 - u * 0.05, yy - u * 0.05, u * 0.1, u * 0.1, 3, ['#fca5a5', '#fde68a', '#bfdbfe'][id % 3], 'rgba(0,0,0,0.3)', 1); ctx.fillStyle = '#7f1d1d'; ctx.fillRect(x0 - u * 0.05, yy - u * 0.05, u * 0.1, u * 0.025); }
        }
      }
      // speed streaks on the shoulders
      if (d > 0.25) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 + d * 0.18) + ')'; ctx.lineWidth = 1.5;
        for (i = 0; i < 10; i++) { var lx = hash(i * 7) < 0.5 ? hash(i) * (ox - 4) : ox + u + 4 + hash(i) * (ox - 8), ly = (hash(i + 3) * H + off * 2.2) % (H + 80) - 40; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + 20 + d * 50); ctx.stroke(); }
      }
    }
    function tree(x, y, r) { circle(ctx, x + r * 0.25, y + r * 0.3, r, 'rgba(0,0,0,0.25)'); circle(ctx, x, y, r, '#166534'); circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.55, '#22c55e'); }
    function palm(x, y, r, now) {
      circle(ctx, x + r * 0.3, y + r * 0.3, r * 0.6, 'rgba(0,0,0,0.18)');
      for (var i = 0; i < 6; i++) { var a = i / 6 * TAU + Math.sin(now * 0.001 + x) * 0.05; ell(ctx, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.6, r * 0.18, '#15803d', a); }
      circle(ctx, x, y, r * 0.18, '#78350f');
    }
    function mix(a, b, t) { return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }).join(',') + ')'; }

    // ---------- effects ----------
    function burst(x, y, colors, n, sp, kind) {
      for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = (0.5 + Math.random()) * (sp || 3); particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: colors[i % colors.length], r: 1.5 + Math.random() * 2.5, kind: kind }); }
    }
    function floater(text, x, y, color, big) { floaters.push({ text: text, x: x, y: y, life: 1, color: color || '#fde047', big: big }); }
    function drawEffects(dt) {
      var i;
      for (i = particles.length - 1; i >= 0; i--) {
        var p = particles[i]; p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt * 1.6;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; circle(ctx, p.x, p.y, p.r, p.c);
      }
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = floaters.length - 1; i >= 0; i--) {
        var f = floaters[i]; f.life -= dt * 1.1; f.y -= dt * 40;
        if (f.life <= 0) { floaters.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, f.life * 2);
        ctx.font = '900 ' + (f.big ? 22 : 15) + 'px ui-sans-serif, system-ui, sans-serif';
        var fx = Math.max(50, Math.min(W - 50, f.x));
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(f.text, fx, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, fx, f.y);
      }
      ctx.globalAlpha = 1;
    }

    // ---------- frame ----------
    function render(now, dt) {
      var gm = geom(), u = gm.u, V = G.V();
      ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake * 12, (Math.random() - 0.5) * shake * 12); shake = Math.max(0, shake - dt * 2.5); }
      drawTrack(now);
      var obs = G.obstacles.slice().sort(function (a, b) { return b.y - a.y; });
      obs.forEach(function (o) {
        var sx = gm.ox + o.x * u, sy = gm.py - o.y * u;
        if (sy < -u * 0.4 || sy > H + u * 0.4) return;
        ctx.save(); ctx.translate(sx, sy);
        if (o.kicked) { var k = o.kicked; ctx.rotate(k.rot); var sc = 1 + Math.sin(Math.min(1, k.t / 0.9) * Math.PI) * 0.6; ctx.scale(sc, sc); ctx.globalAlpha = Math.max(0, 1 - k.t / 1.4); }
        drawObstacle(ctx, o, u, now);
        ctx.restore();
      });
      // player
      var px = gm.ox + G.x * u, py = gm.py;
      ctx.save(); ctx.translate(px, py);
      if (G.phase === 'crashing' || (G.phase === 'over' && G.crash)) {
        var ct = Math.min(1, G.crashT / 1.0);
        ctx.rotate(G.crash.spin * ct * 0.6); ctx.scale(1 + ct * 0.25, 1 + ct * 0.25);
      } else ctx.rotate(G.vx * 0.22);
      if (G.kickT > 0 || (G.lastKickAt >= 0 && G.t - G.lastKickAt < 0.28 && G.phase === 'playing')) drawKick(V, u, Math.min(1, (G.t - G.lastKickAt) / 0.28));
      drawVehicle(ctx, V.id, u, now, { wake: V.track === 'water' });
      ctx.restore();
      if (G.phase === 'playing' && !G.paused && V.track !== 'sky' && Math.random() < 0.3) particles.push({ x: px + (Math.random() - 0.5) * V.hw * u, y: py + V.hl * u, vx: (Math.random() - 0.5) * 0.6, vy: 1.5 + G.difficulty() * 2, life: 0.6, c: V.track === 'water' ? 'rgba(255,255,255,0.8)' : 'rgba(200,200,210,0.5)', r: 2 });
      drawEffects(dt);
      if (flash > 0) { ctx.fillStyle = 'rgba(255,60,60,' + (flash * 0.45) + ')'; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 1.5); }
      // combo meter
      if (G.mult > 1 && G.phase === 'playing') {
        ctx.font = '900 16px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText('COMBO x' + G.mult, 10, 10); ctx.fillStyle = '#fde047'; ctx.fillText('COMBO x' + G.mult, 10, 10);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(10, 30, 90, 5); ctx.fillStyle = '#fde047'; ctx.fillRect(10, 30, 90 * Math.max(0, G.comboT / K.comboTime), 5);
      }
      // kick cooldown pips near the vehicle
      if (G.phase === 'playing' && G.kickCd > 0) { ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(px - 15, py + V.hl * u + 8, 30 * (1 - G.kickCd / K.kickCooldown), 3); }
      ctx.restore();
    }
    function drawKick(V, u, e) {
      var side = G.kickSide, ext = Math.sin(Math.min(1, e) * Math.PI), w = V.hw * u;
      ctx.save();
      // whoosh arc
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * ext) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(side * (w + u * 0.06), 0, u * (0.06 + 0.06 * ext), side > 0 ? -1.1 : Math.PI - 1.1 + 2.2 - 2.2, side > 0 ? 1.1 : Math.PI + 1.1); ctx.stroke();
      if (V.track === 'road' && V.id !== 'car' || V.id === 'jetski') { // a leg + boot
        ctx.strokeStyle = '#1f2937'; ctx.lineWidth = Math.max(3, w * 0.45);
        ctx.beginPath(); ctx.moveTo(side * w * 0.4, 0); ctx.lineTo(side * (w + u * 0.1 * ext), -u * 0.01); ctx.stroke();
        circle(ctx, side * (w + u * 0.1 * ext), -u * 0.01, Math.max(3, w * 0.35), '#78350f');
      } else { // ram / wing bump shockwave
        ctx.strokeStyle = 'rgba(253,224,71,' + ext + ')'; ctx.lineWidth = 2.5;
        for (var i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(side * w, 0, u * (0.04 + i * 0.04) * (0.5 + ext), -0.9, 0.9); if (side < 0) { ctx.beginPath(); ctx.arc(side * w, 0, u * (0.04 + i * 0.04) * (0.5 + ext), Math.PI - 0.9, Math.PI + 0.9); } ctx.stroke(); }
      }
      ctx.restore();
    }

    // ---------- HUD ----------
    var lastHud = '';
    function syncHud() {
      var s = G.score + '|' + Math.round(G.mph) + '|' + Math.floor(G.meters) + '|' + G.high + '|' + G.mult + G.phase;
      if (s === lastHud) return; lastHud = s;
      elScore.textContent = G.score.toLocaleString();
      elSpeed.textContent = Math.round(G.mph);
      elDist.textContent = G.meters >= 1000 ? (G.meters / 1000).toFixed(2) + ' km' : Math.floor(G.meters) + ' m';
      elHigh.textContent = G.high.toLocaleString();
      if (elCombo) elCombo.textContent = G.mult > 1 && G.phase === 'playing' ? 'x' + G.mult : '';
    }

    // ---------- overlays ----------
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var TRACK_LABEL = { road: 'Road', water: 'Water', sky: 'Sky' };
    function bars(n) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>'; return '<span class="rr-bars">' + s + '</span>'; }
    function showPicker() {
      mode = 'pick';
      var sel = G.vehicle;
      card.className = 'overlay-card rr-card rr-pick';
      card.innerHTML = '<h2>Road Rumble</h2><p class="rr-sub">Choose your ride</p><div class="rr-grid" role="radiogroup" aria-label="Vehicle">' +
        VEHICLES.map(function (v) {
          var st = vehicleStats(v), best = G.best[v.id] || 0;
          return '<button type="button" class="rr-veh' + (v.id === sel ? ' on' : '') + '" data-v="' + v.id + '" role="radio" aria-checked="' + (v.id === sel) + '" data-track="' + v.track + '">' +
            '<canvas width="96" height="96" data-sprite="' + v.id + '"></canvas>' +
            '<span class="rr-vname">' + esc(v.name) + '</span><em class="rr-vtrack">' + TRACK_LABEL[v.track] + '</em>' +
            '<span class="rr-stats"><span>Top</span>' + bars(st.top) + '<span>Accel</span>' + bars(st.accel) + '<span>Steer</span>' + bars(st.steer) + '<span>Kick</span>' + bars(st.kick) + '</span>' +
            (best ? '<span class="rr-vbest">Best ' + best.toLocaleString() + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        '<p class="rr-blurb" id="rrBlurb">' + esc(VEHICLE_BY_ID[sel].blurb) + '</p>' +
        '<button type="button" class="primary rr-go" data-act="start">Ride the ' + esc(VEHICLE_BY_ID[sel].name) + ' \u25B6</button>';
      card.querySelectorAll('canvas[data-sprite]').forEach(function (cv) {
        var c2 = cv.getContext('2d'), id = cv.dataset.sprite, vv = VEHICLE_BY_ID[id];
        c2.clearRect(0, 0, 96, 96); c2.save(); c2.translate(48, 50); c2.rotate(-0.35);
        drawVehicle(c2, id, 34 / vv.hl, 0, {}); c2.restore();
      });
      overlay.classList.add('show');
    }
    function showPause() { mode = 'pause'; card.className = 'overlay-card rr-card'; card.innerHTML = '<h2>Paused</h2><p>Press <kbd>P</kbd> or <kbd>Space</kbd> to resume.</p><div class="rr-btns"><button type="button" class="primary" data-act="resume">Resume</button><button type="button" data-act="pick">Change ride</button></div>'; overlay.classList.add('show'); }
    function showOver(d) {
      mode = 'over';
      var V = G.V();
      card.className = 'overlay-card rr-card';
      card.innerHTML = '<h2>Crashed!</h2><p class="rr-sub">Your ' + esc(V.name.toLowerCase()) + ' hit ' + (G.crash ? 'a ' + esc(G.crash.name.toLowerCase()) : 'something') + '.</p>' +
        '<div class="rr-final">' + d.score.toLocaleString() + '</div>' + (d.newHigh ? '<p class="record">New high score!</p>' : '<p>High score ' + d.high.toLocaleString() + '</p>') +
        '<table class="rr-tbl"><tr><td>Distance</td><td>' + (d.meters >= 1000 ? (d.meters / 1000).toFixed(2) + ' km' : Math.floor(d.meters) + ' m') + '</td></tr><tr><td>Top speed</td><td>' + Math.round(topMph) + ' mph</td></tr><tr><td>Kicks</td><td>' + d.kicks + '</td></tr><tr><td>Near misses</td><td>' + d.nearMisses + '</td></tr><tr><td>' + esc(V.name) + ' best</td><td>' + d.best.toLocaleString() + '</td></tr></table>' +
        '<div class="rr-btns"><button type="button" class="primary" data-act="start">Ride again</button><button type="button" data-act="pick">Change ride</button></div>';
      overlay.classList.add('show');
    }
    function hideOverlay() { overlay.classList.remove('show'); }
    overlay.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) {
        if (G.vehicle === b.dataset.v && mode === 'pick') { startGame(); return; } // tap the selected card again to go
        G.setVehicle(b.dataset.v); showPicker(); return;
      }
      var a = b.dataset.act;
      if (a === 'start') startGame();
      else if (a === 'resume') setPaused(false);
      else if (a === 'pick') { if (G.phase === 'playing') G.phase = 'idle'; showPicker(); }
    });
    var topMph = 0;
    function startGame() { particles = []; floaters = []; topMph = 0; G.start(); hideOverlay(); syncMeta(); }
    function setPaused(p) { if (G.phase !== 'playing') return; G.togglePause(p); if (G.paused) showPause(); else hideOverlay(); }
    function syncMeta() {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m && isCurrent()) m.setAttribute('content', TRACKS[G.V().track].meta);
      document.body.dataset.rrtrack = G.V().track;
    }

    // ---------- events -> effects ----------
    G.onEvent = function (type, d) {
      var gm = geom(), u = gm.u;
      if (type === 'kick') {
        var x = gm.ox + d.x * u, y = gm.py - d.y * u;
        shake = Math.min(1, shake + 0.45);
        burst(x, y, ['#fde047', '#fff', '#fb923c'], 14, 4);
        floater((d.mult > 1 ? 'KICK x' + d.mult + ' ' : 'KICK! ') + '+' + d.points, x, y - 18, '#fde047', true);
      } else if (type === 'clank') {
        var cx = gm.ox + d.x * u, cy = gm.py - d.y * u;
        shake = Math.min(1, shake + 0.25); burst(cx, cy, ['#e5e7eb', '#94a3b8'], 8, 3);
        floater('Too heavy!', cx, cy - 14, '#e5e7eb');
      } else if (type === 'nearmiss') {
        floater('Close! +' + d.points, gm.ox + d.x * u, gm.py - 40, '#67e8f9');
      } else if (type === 'crash') {
        var px = gm.ox + G.x * u;
        shake = 1.2; flash = 1;
        burst(px, gm.py, ['#fde047', '#f97316', '#ef4444', '#fff'], 40, 6);
      } else if (type === 'over') { setTimeout(function () { if (G.phase === 'over') showOver(d); }, 150); }
      else if (type === 'vehicle' || type === 'start') syncMeta();
    };

    // ---------- input ----------
    var keys = {}, btnSteer = 0;
    function applySteer() { var a = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + btnSteer; G.setSteer(Math.max(-1, Math.min(1, a))); }
    window.addEventListener('keydown', function (e) {
      if (!isCurrent() || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; applySteer(); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; applySteer(); e.preventDefault(); }
      else if (k === 'z' || k === 'Z' || k === 'q' || k === 'Q') { e.preventDefault(); if (!e.repeat) G.kick(-1); }
      else if (k === 'x' || k === 'X' || k === 'e' || k === 'E') { e.preventDefault(); if (!e.repeat) G.kick(1); }
      else if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
        e.preventDefault(); if (e.repeat) return;
        if (G.phase === 'playing') { if (k === 'Enter' && !G.paused) return; setPaused(!G.paused); }
        else if (mode === 'pick' || mode === 'over') startGame();
      } else if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); if (G.phase === 'playing') setPaused(!G.paused); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        if (mode === 'pick' && G.phase !== 'playing') { var i = VEHICLES.findIndex(function (v) { return v.id === G.vehicle; }); G.setVehicle(VEHICLES[(i + (k === 'ArrowDown' ? 1 : VEHICLES.length - 1)) % VEHICLES.length].id); showPicker(); }
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = false; applySteer(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = false; applySteer(); }
    });
    window.addEventListener('blur', function () { keys = {}; btnSteer = 0; applySteer(); });
    function hold(el, down, up) {
      if (!el) return;
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } el.classList.add('down'); down(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { el.addEventListener(ev, function () { if (!el.classList.contains('down')) return; el.classList.remove('down'); if (up) up(); }); });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    hold($('rrLeft'), function () { btnSteer = -1; applySteer(); }, function () { if (btnSteer < 0) btnSteer = 0; applySteer(); });
    hold($('rrRight'), function () { btnSteer = 1; applySteer(); }, function () { if (btnSteer > 0) btnSteer = 0; applySteer(); });
    hold($('rrKickL'), function () { if (G.phase === 'playing') G.kick(-1); else if (mode !== 'pause') startGame(); });
    hold($('rrKickR'), function () { if (G.phase === 'playing') G.kick(1); else if (mode !== 'pause') startGame(); });
    // drag on the track to steer
    var dragId = null;
    inner.addEventListener('pointerdown', function (e) {
      if (overlay.classList.contains('show') || G.phase !== 'playing') return;
      e.preventDefault(); dragId = e.pointerId; try { inner.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      dragTo(e);
    });
    inner.addEventListener('pointermove', function (e) { if (e.pointerId === dragId) dragTo(e); });
    ['pointerup', 'pointercancel'].forEach(function (ev) { inner.addEventListener(ev, function (e) { if (e.pointerId === dragId) { dragId = null; G.setTarget(null); } }); });
    function dragTo(e) { var r = canvas.getBoundingClientRect(), gm = geom(); G.setTarget((e.clientX - r.left - gm.ox) / gm.u); }
    document.addEventListener('visibilitychange', function () { if (document.hidden && G.phase === 'playing' && !G.paused) setPaused(true); });

    var prev = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, Math.max(0, (now - prev) / 1000)); prev = now;
      if (isCurrent() && !wrap.closest('[hidden]')) {
        G.update(dt);
        if (G.phase === 'playing') topMph = Math.max(topMph, G.mph);
        render(now, G.paused ? 0 : dt);
        syncHud();
      }
      requestAnimationFrame(frame);
    }
    root.roadUI = {
      pause: function () { if (G.phase === 'playing' && !G.paused) setPaused(true); keys = {}; btnSteer = 0; applySteer(); },
      resize: resize,
      start: startGame,
      showPicker: showPicker,
      mode: function () { return mode; }
    };
    resize(); syncMeta(); showPicker(); syncHud();
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})(typeof window !== 'undefined' ? window : globalThis);
