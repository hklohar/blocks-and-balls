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

  // The slide-down hazard animal changes every game. Board positions (SNAKES)
  // never change; only the character drawn from head to tail does.
  var HAZARDS = [
    { id: 'snake', name: 'Snake', plural: 'Snakes', emoji: '\u{1F40D}', sfx: 'Hiss!' },
    { id: 'croc', name: 'Crocodile', plural: 'Crocodiles', emoji: '\u{1F40A}', sfx: 'Chomp!' },
    { id: 'octopus', name: 'Octopus', plural: 'Octopuses', emoji: '\u{1F419}', sfx: 'Squish!' },
    { id: 'dragon', name: 'Dragon', plural: 'Dragons', emoji: '\u{1F409}', sfx: 'Whoosh!' },
    { id: 'eel', name: 'Glow Eel', plural: 'Glow Eels', emoji: '\u26A1', sfx: 'Zap!' },
    { id: 'caterpillar', name: 'Caterpillar', plural: 'Caterpillars', emoji: '\u{1F41B}', sfx: 'Wiggle!' },
    { id: 'giraffe', name: 'Giraffe', plural: 'Giraffes', emoji: '\u{1F992}', sfx: 'Wheee!' },
    { id: 'elephant', name: 'Elephant', plural: 'Elephants', emoji: '\u{1F418}', sfx: 'Splash!' }
  ];
  var HAZARD_BY_ID = {};
  HAZARDS.forEach(function (h) { HAZARD_BY_ID[h.id] = h; });
  // pick a hazard that differs from `lastId` (never the same twice in a row)
  function pickHazard(lastId, rnd) {
    var pool = HAZARDS.filter(function (h) { return h.id !== lastId; });
    return pool[Math.min(pool.length - 1, Math.floor((rnd || Math.random)() * pool.length))].id;
  }

  // Fun kid-friendly player names: adjective + animal, unique within a game.
  var NAME_ADJ = ['Bouncy', 'Zippy', 'Sunny', 'Giggly', 'Fluffy', 'Sparkly', 'Wiggly', 'Jolly', 'Snappy', 'Breezy', 'Cosmic', 'Dizzy', 'Fuzzy', 'Happy', 'Peppy',
    'Speedy', 'Twinkly', 'Bubbly', 'Cheery', 'Lucky', 'Silly', 'Sleepy', 'Mighty', 'Tiny', 'Brave', 'Clever', 'Swift', 'Merry', 'Rosy', 'Comfy'];
  var NAME_ANIMAL = ['Otter', 'Panda', 'Koala', 'Penguin', 'Bunny', 'Kitten', 'Puppy', 'Fox', 'Hedgehog', 'Owl', 'Duckling', 'Lamb', 'Seal', 'Llama', 'Sloth',
    'Turtle', 'Hamster', 'Piglet', 'Squirrel', 'Badger', 'Dolphin', 'Parrot', 'Beaver', 'Raccoon', 'Moose', 'Lemur', 'Gecko', 'Pony', 'Robin', 'Frog'];
  var NAME_MAX = 18;
  function randomName(taken, rnd) {
    rnd = rnd || Math.random;
    var lower = (taken || []).map(function (t) { return String(t).toLowerCase(); }), nm, tries = 0, words = {};
    lower.forEach(function (t) { t.split(' ').forEach(function (w) { words[w] = 1; }); });
    do { // prefer an adjective and an animal nobody else has this game
      var ad = NAME_ADJ[Math.floor(rnd() * NAME_ADJ.length) % NAME_ADJ.length], an = NAME_ANIMAL[Math.floor(rnd() * NAME_ANIMAL.length) % NAME_ANIMAL.length];
      nm = ad + ' ' + an;
      var clash = lower.indexOf(nm.toLowerCase()) >= 0 || (tries < 100 && (words[ad.toLowerCase()] || words[an.toLowerCase()]));
    } while (clash && ++tries < 300);
    return nm;
  }
  function cleanName(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }

  // animal: first capture by this player (perk too); animalSteal: win it back from an opponent;
  // animalAgain: land on your own animal. creature: catch an unowned creature; creatureSteal: take one from an opponent.
  var POINTS = { animal: 40, animalAgain: 10, animalSteal: 25, creature: 150, creatureSteal: 60, ropeBase: 30, win: 300 };
  var T = { cpu: 850, spin: 2600, landed: 650, hop: 230, slide: 1300, climb: 1100, gap: 500, reshuffle: 1600 };

  // Board styles: the boosts are ropes, wooden ladders or dungeon stairs (wording follows the style).
  var BOARDS = {
    ropes: { id: 'ropes', name: 'Ropes', boost: 'rope', boosts: 'ropes', Boosts: 'Ropes', emoji: '\u{1FAA2}', climb: 'climbed the rope' },
    ladders: { id: 'ladders', name: 'Ladders', boost: 'ladder', boosts: 'ladders', Boosts: 'Ladders', emoji: '\u{1FA9C}', climb: 'climbed the ladder' },
    dungeon: { id: 'dungeon', name: 'Dungeon', boost: 'staircase', boosts: 'stairs', Boosts: 'Stairs', emoji: '\u{1F3F0}', climb: 'climbed the stairs' }
  };
  var BOARD_ORDER = ['ropes', 'ladders', 'dungeon'];
  var RESHUFFLE_AT = 5; // boosts climbed while every opponent still has 0

  // Squares a hazard may never use: boosts (both ends), items, start and finish.
  function blockedSquares() {
    var b = {}; b[1] = b[LAST] = 1;
    Object.keys(ROPES).forEach(function (k) { b[k] = 1; b[ROPES[k]] = 1; });
    ANIMALS.forEach(function (a) { b[a.sq] = 1; }); CREATURES.forEach(function (c) { b[c.sq] = 1; });
    return b;
  }
  function rowOf(n) { return Math.floor((n - 1) / SIZE); }
  // Is a hazard map valid? heads above tails (higher row), all endpoints distinct,
  // never on a boost end / item / 1 / 100, so no loops are possible.
  function validHazards(map, count) {
    var bl = blockedSquares(), used = {}, heads = Object.keys(map).map(Number);
    if (count != null && heads.length !== count) return false;
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i], t = map[h];
      if (!(t >= 2 && h <= LAST - 1) || rowOf(h) <= rowOf(t)) return false;
      if (bl[h] || bl[t] || used[h] || used[t]) return false;
      used[h] = used[t] = 1;
    }
    return true;
  }
  // Random new hazard layout with the same count; differs from `old`.
  function randomHazards(count, rnd, old) {
    rnd = rnd || Math.random;
    var bl = blockedSquares();
    for (var attempt = 0; attempt < 500; attempt++) {
      var map = {}, used = {}, ok = true;
      for (var k = 0; k < count && ok; k++) {
        var placed = false;
        for (var tries = 0; tries < 200 && !placed; tries++) {
          var h = 12 + Math.floor(rnd() * (LAST - 12)); // 12..99
          var len = 8 + Math.floor(rnd() * 38);         // slides 8..45 squares
          var t = h - len;
          if (t < 2 || h > LAST - 1 || bl[h] || bl[t] || used[h] || used[t] || rowOf(h) <= rowOf(t)) continue;
          map[h] = t; used[h] = used[t] = 1; placed = true;
        }
        if (!placed) ok = false;
      }
      if (!ok || !validHazards(map, count)) continue;
      if (old && JSON.stringify(Object.keys(map).sort()) === JSON.stringify(Object.keys(old).sort())) continue;
      return map;
    }
    return Object.assign({}, old || SNAKES);
  }
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
    var hazardRng = opts.hazardRng || Math.random; // separate stream: never shifts the spin sequence
    var allowReshuffle = opts.reshuffle !== false;
    var storage = opts.storage || null;
    var g = {
      phase: 'idle', paused: false, speed: 1,
      players: [], turn: 0, timer: 0, turnCount: 0,
      wheel: { angle: 0, from: 0, to: 0, t: 0, result: null, landed: null, spinning: false },
      path: [], pathIdx: 0, hopT: 0, hopFrom: 1,
      anim: null, perkUsed: false, extraTurn: false,
      collected: {}, animalOwner: {}, snakes: Object.assign({}, SNAKES), board: 'ropes', offer: null,
      log: [], winner: null, onEvent: null,
      high: 0, bestCollection: 0, stats: null, hazard: 'snake'
    };
    function emit(type, data) { if (g.onEvent) { try { g.onEvent(type, data || {}); } catch (e) { if (typeof console !== 'undefined') console.error(e); } } }
    function load(k) { if (!storage) return null; try { return storage.get(k); } catch (e) { return null; } }
    function save(k, v) { if (storage) { try { storage.set(k, v); } catch (e) { /* ignore */ } } }
    function loadInt(k) { var v = parseInt(load(k), 10); return isFinite(v) ? v : 0; }
    function freshStats() { return { games: 0, wins: 0, cpuWins: 0, spins: 0, snakes: 0, ropes: 0, animals: 0, creatures: 0, byHazard: {} }; }
    g.high = loadInt('doodlewheel-high');
    g.bestCollection = loadInt('doodlewheel-best-collection');
    try { g.stats = Object.assign(freshStats(), JSON.parse(load('doodlewheel-stats') || '{}')); } catch (e) { g.stats = freshStats(); }
    if (!g.stats.byHazard || typeof g.stats.byHazard !== 'object') g.stats.byHazard = {};
    if (HAZARD_BY_ID[load('doodlewheel-hazard')]) g.hazard = load('doodlewheel-hazard');
    g.hazardInfo = function () { return HAZARD_BY_ID[g.hazard]; };
    if (BOARDS[load('doodlewheel-board')]) g.board = load('doodlewheel-board');
    g.boardInfo = function () { return BOARDS[g.board]; };
    g.setBoard = function (id) { if (BOARDS[id]) { g.board = id; save('doodlewheel-board', id); emit('board', { board: id }); } return g.board; };
    // what a player owns right now
    g.ownedAnimals = function (pid) { return ANIMALS.filter(function (a) { return g.animalOwner[a.kind] === pid; }).length; };
    g.ownedCreatures = function (pid) { return CREATURES.filter(function (c) { return g.collected[c.id] === pid; }).map(function (c) { return c.id; }); };
    g.setRng = function (fn) { rng = typeof fn === 'function' ? fn : Math.random; };
    g.rename = function (id, name) {
      var p = g.players[id], nm = cleanName(name);
      if (!p || !nm) return false;
      p.name = nm; emit('rename', { player: id, name: nm });
      return true;
    };

    function rint(n) { return Math.min(n - 1, Math.floor(rng() * n)); }
    function addLog(text) { g.log.push(text); if (g.log.length > 30) g.log.shift(); emit('log', { text: text }); }

    g.current = function () { return g.players[g.turn]; };
    g.isHumanTurn = function () { var p = g.current(); return !!p && p.type === 'human' && g.phase === 'ready' && !g.paused; };
    g.isActive = function () { return g.phase !== 'idle' && g.phase !== 'over'; };

    g.start = function (seats, o) {
      o = o || {};
      seats = (seats && seats.length ? seats : [{ type: 'human', name: 'You' }, { type: 'cpu', name: 'CPU' }]).slice(0, 4);
      // a new hazard animal every game, never the same as the previous game
      var prevHazard = HAZARD_BY_ID[load('doodlewheel-hazard')] ? load('doodlewheel-hazard') : g.hazard;
      g.hazard = HAZARD_BY_ID[o.hazard] ? o.hazard : pickHazard(prevHazard, hazardRng);
      save('doodlewheel-hazard', g.hazard);
      g.players = seats.map(function (s, i) {
        return { id: i, seat: s.seat != null ? s.seat : i, type: s.type === 'cpu' ? 'cpu' : 'human', name: cleanName(s.name) || (s.type === 'cpu' ? 'CPU ' + (i + 1) : 'Player ' + (i + 1)),
          token: TOKENS[i], pos: 1, score: 0, friends: {}, creatures: [], reshuffleOffered: false,
          stats: { spins: 0, snakes: 0, ropes: 0, animals: 0, creatures: 0, bounces: 0, steals: 0, reshuffles: 0 } };
      });
      g.turn = 0; g.turnCount = 0; g.collected = {}; g.animalOwner = {}; g.snakes = Object.assign({}, SNAKES); g.offer = null; g.log = []; g.winner = null;
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
      if (!c) return;
      var prev = g.collected[c.id];
      if (prev === p.id) return;
      var pts = prev == null ? POINTS.creature : POINTS.creatureSteal;
      if (prev != null) { var q = g.players[prev]; q.creatures = q.creatures.filter(function (k) { return k !== c.id; }); p.stats.steals++; }
      g.collected[c.id] = p.id;
      p.creatures.push(c.id); p.stats.creatures++;
      p.score += pts;
      addLog(prev == null ? p.name + ' caught ' + c.name + '! +' + pts : p.name + ' took ' + c.name + ' from ' + g.players[prev].name + '! +' + pts);
      emit('catch', { player: p.id, kind: c.id, name: c.name, sq: sq, points: pts, from: prev == null ? null : prev });
    }

    function win(p) {
      p.score += POINTS.win;
      g.phase = 'over'; g.winner = p.id;
      addLog(p.name + ' reached 100 and wins!');
      var humans = g.players.filter(function (x) { return x.type === 'human'; });
      var best = humans.reduce(function (m, x) { return Math.max(m, x.score); }, 0);
      var bestColl = humans.reduce(function (m, x) { return Math.max(m, g.ownedCreatures(x.id).length); }, 0);
      var newRecord = humans.length > 0 && best > g.high;
      if (newRecord) { g.high = best; save('doodlewheel-high', String(g.high)); }
      var newBestCollection = humans.length > 0 && bestColl > g.bestCollection;
      if (newBestCollection) { g.bestCollection = bestColl; save('doodlewheel-best-collection', String(g.bestCollection)); }
      var st = g.stats;
      st.games++;
      if (p.type === 'human') st.wins++; else st.cpuWins++;
      g.players.forEach(function (x) { x.owned = { animals: g.ownedAnimals(x.id), creatures: g.ownedCreatures(x.id).length }; });
      st.byHazard[g.hazard] = (st.byHazard[g.hazard] || 0) + humans.reduce(function (m, h) { return m + h.stats.snakes; }, 0);
      humans.forEach(function (h) { st.spins += h.stats.spins; st.snakes += h.stats.snakes; st.ropes += h.stats.ropes; st.animals += h.stats.animals; st.creatures += h.stats.creatures; });
      save('doodlewheel-stats', JSON.stringify(st));
      emit('win', { player: p.id, newRecord: newRecord, newBestCollection: newBestCollection, high: g.high, bestCollection: g.bestCollection });
    }

    // 5-0 reshuffle offer: checked whenever a move finishes
    function reshuffleEligible(p) {
      if (!allowReshuffle || g.players.length < 2 || p.reshuffleOffered || p.stats.ropes < RESHUFFLE_AT) return false;
      return g.players.every(function (o) { return o === p || o.stats.ropes === 0; });
    }
    function endTurn() {
      var p = g.current();
      if (p && reshuffleEligible(p)) {
        p.reshuffleOffered = true;
        g.offer = { player: p.id }; g.phase = 'offer'; g.timer = T.cpu * 1.6;
        addLog(p.name + ' has ' + p.stats.ropes + ' ' + BOARDS[g.board].boosts + ' to 0: reshuffle the ' + HAZARD_BY_ID[g.hazard].plural + '?');
        emit('offer', { player: p.id });
        return;
      }
      g.phase = 'gap'; g.timer = T.gap;
    }
    function doReshuffle() {
      var p = g.current(), old = g.snakes;
      g.snakes = randomHazards(Object.keys(old).length, hazardRng, old);
      g.offer = null; p.stats.reshuffles++;
      g.anim = { type: 'reshuffle', old: old, t: 0, dur: T.reshuffle };
      g.phase = 'reshuffling';
      addLog(p.name + ' reshuffled the ' + HAZARD_BY_ID[g.hazard].plural + '!');
      emit('reshuffle', { player: p.id, old: old, snakes: g.snakes });
    }
    g.acceptReshuffle = function () {
      if (g.phase !== 'offer' || g.paused) return false;
      doReshuffle(); return true;
    };
    g.declineReshuffle = function () {
      if (g.phase !== 'offer' || g.paused) return false;
      var p = g.current();
      g.offer = null; addLog(p.name + ' kept the ' + HAZARD_BY_ID[g.hazard].plural + ' where they are');
      emit('decline', { player: p.id });
      g.phase = 'gap'; g.timer = T.gap; return true;
    };

    // Called once the token stops (after hops, a slide or a climb).
    function resolve() {
      var p = g.current(), sq = p.pos;
      var SN = g.snakes;
      if (SN[sq]) {
        p.stats.snakes++;
        var hz = HAZARD_BY_ID[g.hazard];
        addLog(p.name + ' slid down the ' + hz.name + '! ' + sq + ' \u2192 ' + SN[sq]);
        g.anim = { type: 'slide', from: sq, to: SN[sq], t: 0, dur: T.slide };
        g.phase = 'sliding';
        emit('snake', { player: p.id, from: sq, to: SN[sq], hazard: g.hazard });
        return;
      }
      if (ROPES[sq]) {
        var pts = POINTS.ropeBase + (ROPES[sq] - sq);
        p.stats.ropes++; p.score += pts;
        addLog(p.name + ' ' + BOARDS[g.board].climb + ': ' + sq + ' \u2192 ' + ROPES[sq] + ' +' + pts);
        g.anim = { type: 'climb', from: sq, to: ROPES[sq], t: 0, dur: T.climb };
        g.phase = 'climbing';
        emit('rope', { player: p.id, from: sq, to: ROPES[sq], points: pts });
        return;
      }
      if (sq === LAST) { win(p); return; }
      var a = ANIMAL_AT[sq];
      if (a) {
        // owned by whoever landed here last; first-time bonus + perk only once per player per animal
        var first = !p.friends[a.kind], owner = g.animalOwner[a.kind];
        var mine = owner === p.id, stolen = owner != null && !mine;
        var ap = mine ? POINTS.animalAgain : first ? POINTS.animal : POINTS.animalSteal;
        p.friends[a.kind] = true; p.score += ap;
        if (!mine) { g.animalOwner[a.kind] = p.id; p.stats.animals++; if (stolen) p.stats.steals++; }
        var perk = first && !g.perkUsed ? a.perk : null;
        var perkTxt = perk === 'hop2' ? ', hops +2' : perk === 'respin' ? ', free spin!' : '';
        addLog(mine ? p.name + ' fed ' + a.name + ' +' + ap + perkTxt
          : stolen ? p.name + ' won ' + a.name + ' over from ' + g.players[owner].name + '! +' + ap + perkTxt
          : p.name + ' befriended ' + a.name + ' +' + ap + perkTxt);
        emit('animal', { player: p.id, kind: a.kind, sq: sq, points: ap, perk: perk, first: first, from: stolen ? owner : null, mine: mine });
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
          case 'offer':
            if (p.type !== 'cpu') return; // humans choose with the banner buttons
            if (g.timer > dt) { g.timer -= dt; return; }
            used = g.timer; doReshuffle(); // a CPU always takes it
            break;
          case 'reshuffling': {
            var ra = g.anim, needR = ra.dur - ra.t;
            if (dt < needR) { ra.t += dt; return; }
            used = needR; g.anim = null; g.phase = 'gap'; g.timer = T.gap;
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
    pickHazard: pickHazard, randomHazards: randomHazards, validHazards: validHazards, blockedSquares: blockedSquares,
    BOARDS: BOARDS, BOARD_ORDER: BOARD_ORDER, RESHUFFLE_AT: RESHUFFLE_AT, randomName: randomName, cleanName: cleanName,
    HAZARDS: HAZARDS, NAME_ADJ: NAME_ADJ, NAME_ANIMAL: NAME_ANIMAL, NAME_MAX: NAME_MAX,
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
      pad: 'rgba(255,255,255,0.75)', dim: 'rgba(20,48,38,0.55)', tokenRing: 'rgba(20,40,32,0.6)', floaterStroke: 'rgba(255,255,255,0.95)',
      dungeon: { bg: ['#3a4a40', '#26332c'], stones: ['#b9c6bb', '#a7b7ab', '#c3ccc0', '#9fb1a4', '#b1c2a9'], mortar: 'rgba(38,52,44,0.55)', moss: 'rgba(74,140,84,0.55)', number: '#17231c', halo: 'rgba(255,255,255,0.8)', badge: '#14532d' }
    },
    sunset: {
      name: 'Sunset Pop', meta: '#ffd9c7',
      bg: ['#ffd3bd', '#f1c6ea'], pattern: 'stripes', patternColor: 'rgba(255,255,255,0.28)', dotColor: 'rgba(255,255,255,0.0)',
      tiles: ['#ffb3a0', '#ffd2b4', '#ffc7dd', '#dcc4fb', '#ffe3a3', '#f9b8cf'], tileAlpha: [0.92, 0.74],
      tileBorder: 'rgba(255,255,255,0.75)', tileShadow: 'rgba(138,45,80,0.12)',
      number: '#5a1f3b', numberHalo: 'rgba(255,255,255,0.7)', badge: '#9d174d', star: '#f97316',
      pad: 'rgba(255,255,255,0.6)', dim: 'rgba(70,22,48,0.55)', tokenRing: 'rgba(70,20,45,0.6)', floaterStroke: 'rgba(255,255,255,0.95)',
      dungeon: { bg: ['#4f2f3a', '#2e1c26'], stones: ['#dcb9a6', '#cfa898', '#e3c3ae', '#c89d8d', '#d6ae9a'], mortar: 'rgba(70,32,40,0.55)', moss: 'rgba(160,82,96,0.4)', number: '#3a1424', halo: 'rgba(255,255,255,0.75)', badge: '#7f1d3f' }
    },
    ocean: {
      name: 'Ocean Breeze', meta: '#0a2a43',
      bg: ['#0b2a46', '#0d5a6e'], pattern: 'bubbles', patternColor: 'rgba(186,240,255,0.14)', dotColor: 'rgba(186,240,255,0.08)',
      tiles: ['#11698a', '#16858c', '#0e5779', '#24938a', '#1a73a3', '#2d7f9b'], tileAlpha: [0.62, 0.46],
      tileBorder: 'rgba(148,233,255,0.45)', tileShadow: 'rgba(0,0,0,0.18)',
      number: '#eafcff', numberHalo: 'rgba(5,30,48,0.7)', badge: '#fde68a', star: '#facc15',
      pad: 'rgba(255,255,255,0.16)', dim: 'rgba(3,18,32,0.62)', tokenRing: 'rgba(0,0,0,0.55)', floaterStroke: 'rgba(5,25,40,0.9)',
      dungeon: { bg: ['#0f1c26', '#0a131b'], stones: ['#3f5868', '#4a6474', '#38505f', '#53697a', '#44606b'], mortar: 'rgba(4,12,18,0.7)', moss: 'rgba(60,170,160,0.35)', number: '#f1f7fb', halo: 'rgba(4,14,22,0.85)', badge: '#fde68a' }
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
    var trayEl = $('dwTray'), trayCount = $('dwTrayCount'), logEl = $('dwLog'), hazardEl = $('dwHazard');

    var storage = {
      get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    };
    var G = createDoodle({ storage: storage });
    var hazardSeen = !!storage.get('doodlewheel-hazard');
    root.doodle = G; // handy for debugging / automation

    var seats = null;
    try { seats = JSON.parse(storage.get('doodlewheel-players') || 'null'); } catch (e) { seats = null; }
    if (!Array.isArray(seats) || !seats.length) seats = [{ type: 'human' }, { type: 'cpu' }, { type: 'off' }, { type: 'off' }];
    while (seats.length < 4) seats.push({ type: 'off' });
    seats = seats.slice(0, 4).map(function (st, i) {
      var t = st && (st.type === 'cpu' || st.type === 'off') && !(i === 0 && st.type === 'off') ? st.type : 'human';
      var nm = cleanName(st && st.name);
      return { type: t, name: nm, custom: !!nm }; // custom = edited by the player, remembered
    });
    function saveSeats() {
      storage.set('doodlewheel-players', JSON.stringify(seats.map(function (st) { return st.custom ? { type: st.type, name: st.name } : { type: st.type }; })));
    }
    // fresh random names for every seat the player hasn't renamed, unique within the game
    function rollNames() {
      var taken = seats.filter(function (st) { return st.custom; }).map(function (st) { return st.name; });
      seats.forEach(function (st) { if (!st.custom) { st.name = randomName(taken); taken.push(st.name); } });
    }
    function rerollSeat(i) {
      var taken = seats.filter(function (st, j) { return j !== i; }).map(function (st) { return st.name; });
      taken.push(seats[i].name); // always a different name
      seats[i].custom = false; seats[i].name = randomName(taken);
      saveSeats();
      return seats[i].name;
    }
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
    function drawDungeonTile(c, x, y, n, D) {
      var base = D.stones[(n * 7 + (n >> 2)) % D.stones.length], r = s * 0.08;
      c.fillStyle = 'rgba(0,0,0,0.35)'; rr(c, x + 1.5, y + 2.5, s - 3, s - 3, r); c.fill();
      c.fillStyle = base; rr(c, x + 1.5, y + 1.5, s - 3, s - 3, r); c.fill();
      c.save(); rr(c, x + 1.5, y + 1.5, s - 3, s - 3, r); c.clip();
      // brick courses: 3 rows, offset joints
      c.strokeStyle = D.mortar; c.lineWidth = Math.max(1, s * 0.03);
      for (var row = 1; row < 3; row++) { c.beginPath(); c.moveTo(x, y + row * s / 3); c.lineTo(x + s, y + row * s / 3); c.stroke(); }
      for (row = 0; row < 3; row++) {
        var off = (row + n) % 2 ? s * 0.5 : s * 0.25;
        for (var bx = off; bx < s; bx += s * 0.5) { c.beginPath(); c.moveTo(x + bx, y + row * s / 3); c.lineTo(x + bx, y + (row + 1) * s / 3); c.stroke(); }
      }
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y + 1.5, s, s * 0.05); // top light
      if ((n * 13) % 7 === 0) { c.fillStyle = D.moss; c.beginPath(); c.ellipse(x + s * 0.75, y + s * 0.9, s * 0.22, s * 0.1, 0, 0, TAU); c.fill(); }
      if ((n * 11) % 9 === 0) { c.strokeStyle = D.mortar; c.lineWidth = 1; c.beginPath(); c.moveTo(x + s * 0.6, y + s * 0.4); c.lineTo(x + s * 0.68, y + s * 0.55); c.lineTo(x + s * 0.63, y + s * 0.7); c.stroke(); }
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; rr(c, x + 1.5, y + 1.5, s - 3, s - 3, r); c.stroke();
    }
    function drawSquares(c) {
      var D = G.board === 'dungeon' ? TH.dungeon : null;
      var grd = c.createLinearGradient(0, 0, size, size);
      grd.addColorStop(0, D ? D.bg[0] : TH.bg[0]); grd.addColorStop(1, D ? D.bg[1] : TH.bg[1]);
      c.fillStyle = grd; c.fillRect(0, 0, size, size);
      if (!D) drawPattern(c);
      var fs = Math.max(8, Math.round(s * 0.24));
      for (var n = 1; n <= LAST; n++) {
        var cl = squareToCell(n), x = cl.col * s, y = (SIZE - 1 - cl.row) * s;
        if (D) drawDungeonTile(c, x, y, n, D);
        else {
          var col = TH.tiles[(cl.row * 2 + cl.col * 3) % TH.tiles.length];
          c.globalAlpha = 1; c.fillStyle = TH.tileShadow; rr(c, x + 2, y + 3, s - 4, s - 4, s * 0.18); c.fill();
          c.globalAlpha = TH.tileAlpha[(cl.row + cl.col) % 2];
          c.fillStyle = col; rr(c, x + 2, y + 2, s - 4, s - 4, s * 0.18); c.fill();
          c.globalAlpha = 1; c.strokeStyle = TH.tileBorder; c.lineWidth = 1.2; c.setLineDash([s * 0.09, s * 0.07]); c.stroke(); c.setLineDash([]);
        }
        c.font = '800 ' + fs + 'px ui-sans-serif, system-ui, sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'top';
        c.lineWidth = Math.max(2, fs * 0.22); c.lineJoin = 'round'; c.strokeStyle = D ? D.halo : TH.numberHalo;
        c.strokeText(String(n), x + s * 0.11, y + s * 0.09);
        c.fillStyle = D ? D.number : TH.number; c.fillText(String(n), x + s * 0.11, y + s * 0.09);
      }
      // start + finish badges
      var a = center(1), b = center(LAST);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 ' + Math.max(7, Math.round(s * 0.2)) + 'px ui-sans-serif, system-ui, sans-serif';
      var badge = D ? D.badge : TH.badge;
      c.lineWidth = 3; c.strokeStyle = D ? D.halo : 'rgba(0,0,0,0)'; c.strokeText('START', a.x, a.y + s * 0.28);
      c.fillStyle = badge; c.fillText('START', a.x, a.y + s * 0.28);
      c.save(); c.translate(b.x, b.y + s * 0.06);
      star(c, 0, 0, s * 0.3, s * 0.13, TH.star);
      c.restore();
      c.strokeText('FINISH', b.x, b.y + s * 0.38);
      c.fillStyle = badge; c.fillText('FINISH', b.x, b.y + s * 0.38);
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

    // ---------- hazard animals (one per game, drawn head -> tail) ----------
    var HZ_STYLE = {
      snake: { amp: 1, trail: null },
      croc: { amp: 0.65, trail: ['#7dd3fc', '#e0f2fe', '#38bdf8'], shake: 1.1, pal: [['#4ade80', '#14532d', '#d9f99d'], ['#22c55e', '#166534', '#fef08a'], ['#65a30d', '#1a2e05', '#ecfccb']] },
      octopus: { amp: 1.05, trail: ['#4c1d95', '#6d28d9', '#1e1b4b'], shake: 0.6, pal: [['#c084fc', '#6b21a8', '#f5d0fe'], ['#fb7185', '#9f1239', '#ffe4e6'], ['#fb923c', '#9a3412', '#ffedd5']] },
      dragon: { amp: 1.1, trail: ['#f97316', '#facc15', '#ef4444'], shake: 0.8, pal: [['#f87171', '#991b1b', '#fde68a'], ['#2dd4bf', '#115e59', '#fef08a'], ['#a78bfa', '#4c1d95', '#fde68a']] },
      eel: { amp: 1.25, trail: ['#fef08a', '#a5f3fc', '#ffffff'], shake: 0.7, pal: [['#22d3ee', '#0e7490', '#ecfeff'], ['#a3e635', '#3f6212', '#f7fee7'], ['#f472b6', '#9d174d', '#fdf2f8']] },
      caterpillar: { amp: 0.8, trail: ['#4ade80', '#86efac', '#16a34a'], shake: 0.5, pal: [['#84cc16', '#365314', '#facc15'], ['#60a5fa', '#1e3a8a', '#f9a8d4'], ['#fb923c', '#7c2d12', '#fde047']] },
      giraffe: { amp: 0.35, trail: ['#fde047', '#fbbf24', '#ffffff'], shake: 0.5, pal: [['#fcd34d', '#92400e', '#b45309']] },
      elephant: { amp: 0.55, trail: ['#60a5fa', '#bfdbfe', '#3b82f6'], shake: 0.7, pal: [['#a5b4c8', '#334155', '#f9a8d4'], ['#c4b5fd', '#4c1d95', '#fbcfe8'], ['#93c5fd', '#1e3a8a', '#fbcfe8']] }
    };
    function hazardPoints(head, tail, phase, amp) {
      return snakePoints(head, tail, phase, amp * ((HZ_STYLE[G.hazard] || HZ_STYLE.snake).amp));
    }
    function segAngle(pts, i) { var a = pts[Math.min(pts.length - 1, i + 1)], b = pts[Math.max(0, i - 1)]; return Math.atan2(b.y - a.y, b.x - a.x); }
    // tapered body: two passes (outline, then fill), widths w0 at head -> w1 at tail
    function taper(pts, w0, w1, outline, fill, ow) {
      var n = pts.length, i, pass;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (pass = 0; pass < 2; pass++) {
        for (i = n - 1; i > 0; i--) {
          var t = i / (n - 1), w = w0 + (w1 - w0) * t;
          ctx.strokeStyle = pass ? fill : outline; ctx.lineWidth = pass ? w : w + (ow || 3);
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
        }
      }
    }
    function cheeks(x, y, dx, r) { circle(ctx, x - dx, y, r, 'rgba(244,114,182,0.65)'); circle(ctx, x + dx, y, r, 'rgba(244,114,182,0.65)'); }
    function cuteEye(x, y, r) { circle(ctx, x, y, r, '#fff'); circle(ctx, x, y + r * 0.1, r * 0.62, '#1e1b2e'); circle(ctx, x - r * 0.22, y - r * 0.2, r * 0.25, '#fff'); }

    function drawHazard(kind, head, tail, idx, now, active) {
      if (kind === 'snake' || !HZ_STYLE[kind]) { drawSnake(head, tail, idx, now, active); return; }
      var st = HZ_STYLE[kind], pal = st.pal[idx % st.pal.length];
      var amp = active ? 1 + Math.sin(now * 0.03) * 0.5 : 1;
      var pts = hazardPoints(head, tail, now * (active ? 0.012 : 0.0016) + idx, amp), n = pts.length, i, h = pts[0], ang = segAngle(pts, 1);
      var tl = pts[n - 1];
      ctx.save();
      switch (kind) {
        case 'croc': {
          taper(pts, s * 0.36, s * 0.08, pal[1], pal[0]);
          taper(pts.slice(0, n - 4), s * 0.13, s * 0.03, pal[0], pal[2], 0);
          for (i = 4; i < n - 3; i += 3) { // back ridges
            var a = segAngle(pts, i), w = s * (0.36 - 0.28 * i / n) * 0.5, nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
            poly(ctx, [[pts[i].x + nx * w * 0.8 - Math.cos(a) * s * 0.05, pts[i].y + ny * w * 0.8 - Math.sin(a) * s * 0.05], [pts[i].x + nx * (w + s * 0.09), pts[i].y + ny * (w + s * 0.09)],
              [pts[i].x + nx * w * 0.8 + Math.cos(a) * s * 0.05, pts[i].y + ny * w * 0.8 + Math.sin(a) * s * 0.05]], pal[1]);
          }
          var open = active ? Math.abs(Math.sin(now * 0.02)) * 0.55 : 0.08 + Math.sin(now * 0.003 + idx) * 0.05;
          ctx.translate(h.x, h.y); ctx.rotate(ang);
          [-1, 1].forEach(function (k) { // lower/upper jaw with teeth
            ctx.save(); ctx.rotate(k * open / 2);
            ctx.beginPath(); ctx.moveTo(-s * 0.05, 0); ctx.lineTo(s * 0.44, k * s * 0.02); ctx.quadraticCurveTo(s * 0.5, k * s * 0.1, s * 0.4, k * s * 0.13); ctx.lineTo(-s * 0.05, k * s * 0.16); ctx.closePath();
            ctx.fillStyle = pal[0]; ctx.fill(); ctx.strokeStyle = pal[1]; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#fff';
            for (var q = 0; q < 4; q++) { var tx = s * (0.08 + q * 0.09); ctx.beginPath(); ctx.moveTo(tx, k * s * 0.015); ctx.lineTo(tx + s * 0.03, -k * s * 0.05); ctx.lineTo(tx + s * 0.06, k * s * 0.015); ctx.fill(); }
            ctx.restore();
          });
          circle(ctx, -s * 0.06, 0, s * 0.2, pal[0]);
          [-1, 1].forEach(function (k) { circle(ctx, -s * 0.06, k * s * 0.13, s * 0.1, pal[1]); cuteEye(-s * 0.06, k * s * 0.13, s * 0.08); });
          circle(ctx, s * 0.42, -s * 0.04, s * 0.02, pal[1]); circle(ctx, s * 0.42, s * 0.04, s * 0.02, pal[1]);
          break;
        }
        case 'octopus': {
          taper(pts, s * 0.3, s * 0.07, pal[1], pal[0]);
          for (i = 3; i < n - 2; i += 3) { // suckers on one side
            var a2 = segAngle(pts, i), w2 = s * (0.3 - 0.23 * i / n) * 0.3, nx2 = Math.cos(a2 + Math.PI / 2), ny2 = Math.sin(a2 + Math.PI / 2);
            circle(ctx, pts[i].x + nx2 * w2, pts[i].y + ny2 * w2, Math.max(1.2, w2 * 0.75), pal[1]);
            circle(ctx, pts[i].x + nx2 * w2, pts[i].y + ny2 * w2, Math.max(0.8, w2 * 0.5), pal[2]);
          }
          ctx.beginPath(); ctx.arc(tl.x + s * 0.06, tl.y, s * 0.06, Math.PI, Math.PI * 2.6); ctx.strokeStyle = pal[0]; ctx.lineWidth = s * 0.06; ctx.stroke();
          var sq = active ? 1 + Math.sin(now * 0.025) * 0.12 : 1 + Math.sin(now * 0.004 + idx) * 0.04;
          ctx.translate(h.x, h.y - s * 0.06); ctx.scale(1 / sq, sq);
          for (var m = -2; m <= 2; m++) { if (!m) continue; ctx.beginPath(); ctx.moveTo(m * s * 0.08, s * 0.12); ctx.quadraticCurveTo(m * s * 0.16, s * 0.28, m * s * 0.2 + Math.sin(now * 0.006 + m) * s * 0.04, s * 0.3); ctx.strokeStyle = pal[0]; ctx.lineWidth = s * 0.07; ctx.stroke(); }
          ellipse(ctx, 0, 0, s * 0.32, s * 0.3, 0, pal[1]); ellipse(ctx, 0, -s * 0.01, s * 0.29, s * 0.27, 0, pal[0]);
          ellipse(ctx, -s * 0.1, -s * 0.14, s * 0.08, s * 0.05, -0.5, 'rgba(255,255,255,0.45)');
          cuteEye(-s * 0.11, s * 0.02, s * 0.075); cuteEye(s * 0.11, s * 0.02, s * 0.075);
          cheeks(0, s * 0.12, s * 0.18, s * 0.04); smile(ctx, 0, s * 0.1, s * 0.05);
          break;
        }
        case 'dragon': {
          var wb = pts[6], wa = segAngle(pts, 6), flap = Math.sin(now * (active ? 0.04 : 0.006) + idx) * 0.45;
          [-1, 1].forEach(function (k) { // little wings
            ctx.save(); ctx.translate(wb.x, wb.y); ctx.rotate(wa + k * (Math.PI / 2 + flap));
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.42, -s * 0.12);
            ctx.quadraticCurveTo(s * 0.36, s * 0.02, s * 0.4, s * 0.1); ctx.quadraticCurveTo(s * 0.25, s * 0.06, s * 0.22, s * 0.16); ctx.quadraticCurveTo(s * 0.12, s * 0.06, 0, s * 0.08); ctx.closePath();
            ctx.fillStyle = pal[2]; ctx.fill(); ctx.strokeStyle = pal[1]; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
          });
          taper(pts, s * 0.3, s * 0.08, pal[1], pal[0]);
          for (i = 4; i < n - 3; i += 3) {
            var a3 = segAngle(pts, i), w3 = s * (0.3 - 0.22 * i / n) * 0.5, nx3 = Math.cos(a3 - Math.PI / 2), ny3 = Math.sin(a3 - Math.PI / 2);
            poly(ctx, [[pts[i].x + nx3 * w3 - Math.cos(a3) * s * 0.06, pts[i].y + ny3 * w3 - Math.sin(a3) * s * 0.06], [pts[i].x + nx3 * (w3 + s * 0.1), pts[i].y + ny3 * (w3 + s * 0.1)],
              [pts[i].x + nx3 * w3 + Math.cos(a3) * s * 0.06, pts[i].y + ny3 * w3 + Math.sin(a3) * s * 0.06]], pal[2], pal[1], 1);
          }
          var ta = segAngle(pts, n - 2);
          ctx.save(); ctx.translate(tl.x, tl.y); ctx.rotate(ta + Math.PI); poly(ctx, [[0, 0], [s * 0.16, -s * 0.1], [s * 0.24, 0], [s * 0.16, s * 0.1]], pal[2], pal[1], 1.5); ctx.restore();
          ctx.translate(h.x, h.y); ctx.rotate(ang);
          if (active && Math.floor(now / 160) % 2 === 0) flame(ctx, s * 0.5, 0, s * 0.12, now);
          [-1, 1].forEach(function (k) { poly(ctx, [[-s * 0.12, k * s * 0.1], [-s * 0.34, k * s * 0.22], [-s * 0.05, k * s * 0.18]], '#fde68a', pal[1], 1.2); });
          ellipse(ctx, s * 0.02, 0, s * 0.27, s * 0.22, 0, pal[1]); ellipse(ctx, s * 0.02, 0, s * 0.245, s * 0.195, 0, pal[0]);
          ellipse(ctx, s * 0.22, 0, s * 0.13, s * 0.12, 0, pal[0]);
          circle(ctx, s * 0.3, -s * 0.05, s * 0.022, pal[1]); circle(ctx, s * 0.3, s * 0.05, s * 0.022, pal[1]);
          cuteEye(-s * 0.02, -s * 0.1, s * 0.065); cuteEye(-s * 0.02, s * 0.1, s * 0.065);
          break;
        }
        case 'eel': {
          var glow = active ? 0.75 + Math.sin(now * 0.03) * 0.25 : 0.5 + Math.sin(now * 0.003 + idx) * 0.15;
          ctx.save(); ctx.shadowColor = pal[0]; ctx.shadowBlur = s * 0.6 * glow; ctx.globalAlpha = 0.35 + glow * 0.25;
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.strokeStyle = pal[2]; ctx.lineWidth = s * 0.42; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
          // frilly fin ribbon along the back
          var outer = [], inner = [];
          for (i = 2; i < n - 1; i++) {
            var a4 = segAngle(pts, i), w4 = s * (0.27 - 0.21 * i / n) * 0.5, fw = s * (0.07 + 0.04 * Math.abs(Math.sin(i * 0.9 + now * (active ? 0.02 : 0.004))));
            var ux = Math.cos(a4 - Math.PI / 2), uy = Math.sin(a4 - Math.PI / 2);
            inner.push([pts[i].x + ux * w4 * 0.6, pts[i].y + uy * w4 * 0.6]); outer.push([pts[i].x + ux * (w4 + fw), pts[i].y + uy * (w4 + fw)]);
          }
          poly(ctx, outer.concat(inner.reverse()), pal[2], pal[1], 1.2);
          taper(pts, s * 0.27, s * 0.06, pal[1], pal[0]);
          ctx.beginPath(); // lightning zig-zag stripe
          for (i = 2; i < n - 2; i += 2) { var a5e = segAngle(pts, i), z = (i / 2) % 2 ? 1 : -1, wz = s * (0.27 - 0.21 * i / n) * 0.22; ctx.lineTo(pts[i].x + Math.cos(a5e + Math.PI / 2) * wz * z, pts[i].y + Math.sin(a5e + Math.PI / 2) * wz * z); }
          ctx.strokeStyle = '#fde047'; ctx.lineWidth = Math.max(1.2, s * 0.045); ctx.lineJoin = 'miter'; ctx.stroke(); ctx.lineJoin = 'round';
          if (active || Math.floor(now / 700 + idx) % 5 === 0) for (i = 0; i < (active ? 3 : 1); i++) { var bp = pts[(Math.floor(now / 90) * 7 + i * 13 + idx * 5) % n]; bolt(ctx, bp.x, bp.y - s * 0.2, s * 0.22, (i - 1) * 0.5, '#fde047'); }
          ctx.translate(h.x, h.y); ctx.rotate(ang);
          [-1, 1].forEach(function (k) { ellipse(ctx, -s * 0.12, k * s * 0.17, s * 0.1, s * 0.05, k * 0.6, pal[2]); });
          ellipse(ctx, 0, 0, s * 0.27, s * 0.19, 0, pal[1]); ellipse(ctx, 0, 0, s * 0.245, s * 0.165, 0, pal[0]);
          ellipse(ctx, s * 0.14, 0, s * 0.11, s * 0.12, 0, pal[0]);
          cuteEye(s * 0.02, -s * 0.08, s * 0.075); cuteEye(s * 0.02, s * 0.08, s * 0.075);
          ellipse(ctx, s * 0.22, 0, s * 0.035, s * 0.05, 0, pal[1]);
          break;
        }
        case 'caterpillar': {
          for (i = n - 1; i > 0; i -= 3) {
            var r5 = s * (0.15 + 0.06 * (1 - i / n)) * (active ? 1 + Math.sin(now * 0.03 + i * 0.5) * 0.15 : 1);
            var a5 = segAngle(pts, i), up = active ? Math.abs(Math.sin(now * 0.02 + i * 0.3)) * s * 0.06 : 0;
            var cx5 = pts[i].x + Math.cos(a5 - Math.PI / 2) * up, cy5 = pts[i].y + Math.sin(a5 - Math.PI / 2) * up;
            [-1, 1].forEach(function (k) { circle(ctx, cx5 + Math.cos(a5 + k * Math.PI / 2) * r5 * 0.95, cy5 + Math.sin(a5 + k * Math.PI / 2) * r5 * 0.95, Math.max(1, r5 * 0.22), pal[1]); });
            circle(ctx, cx5, cy5, r5 + 1.5, pal[1]); circle(ctx, cx5, cy5, r5, (i / 3) % 2 ? pal[0] : shade(pal[0]));
            circle(ctx, cx5, cy5 - r5 * 0.3, Math.max(1, r5 * 0.22), pal[2]);
          }
          ctx.translate(h.x, h.y);
          var bob = Math.sin(now * (active ? 0.03 : 0.005) + idx) * s * 0.03;
          [-1, 1].forEach(function (k) {
            ctx.beginPath(); ctx.moveTo(k * s * 0.08, -s * 0.16); ctx.quadraticCurveTo(k * s * 0.12, -s * 0.34, k * s * 0.2, -s * 0.36 + bob);
            ctx.strokeStyle = pal[1]; ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.stroke(); circle(ctx, k * s * 0.2, -s * 0.36 + bob, s * 0.045, pal[2]);
          });
          circle(ctx, 0, 0, s * 0.26, pal[1]); circle(ctx, 0, 0, s * 0.235, pal[0]);
          cuteEye(-s * 0.09, -s * 0.03, s * 0.07); cuteEye(s * 0.09, -s * 0.03, s * 0.07);
          cheeks(0, s * 0.08, s * 0.15, s * 0.04); smile(ctx, 0, s * 0.06, s * 0.06);
          break;
        }
        case 'giraffe': {
          var sway = active ? Math.sin(now * 0.02) * 0.25 : Math.sin(now * 0.002 + idx) * 0.06;
          ellipse(ctx, tl.x, tl.y, s * 0.24, s * 0.17, 0, pal[1]); ellipse(ctx, tl.x, tl.y, s * 0.22, s * 0.15, 0, pal[0]);
          taper(pts, s * 0.2, s * 0.24, pal[1], pal[0]);
          for (i = 2; i < n - 2; i += 2) { // mane
            var a6 = segAngle(pts, i), w6 = s * 0.11;
            ctx.strokeStyle = pal[2]; ctx.lineWidth = Math.max(1.5, s * 0.05);
            ctx.beginPath(); ctx.moveTo(pts[i].x + Math.cos(a6 - Math.PI / 2) * w6, pts[i].y + Math.sin(a6 - Math.PI / 2) * w6);
            ctx.lineTo(pts[i].x + Math.cos(a6 - Math.PI / 2) * (w6 + s * 0.06), pts[i].y + Math.sin(a6 - Math.PI / 2) * (w6 + s * 0.06)); ctx.stroke();
          }
          for (i = 4; i < n - 1; i += 5) { var a7 = segAngle(pts, i), o7 = (i % 2 ? 1 : -1) * s * 0.04; ellipse(ctx, pts[i].x + Math.cos(a7 + Math.PI / 2) * o7, pts[i].y + Math.sin(a7 + Math.PI / 2) * o7, s * 0.07, s * 0.05, a7, pal[2]); }
          ellipse(ctx, tl.x - s * 0.08, tl.y, s * 0.05, s * 0.04, 0, pal[2]); ellipse(ctx, tl.x + s * 0.1, tl.y - s * 0.03, s * 0.045, s * 0.035, 0, pal[2]);
          ctx.translate(h.x, h.y - s * 0.04); ctx.rotate(sway);
          [-1, 1].forEach(function (k) {
            ctx.strokeStyle = pal[1]; ctx.lineWidth = Math.max(1.5, s * 0.05); ctx.beginPath(); ctx.moveTo(k * s * 0.07, -s * 0.16); ctx.lineTo(k * s * 0.09, -s * 0.32); ctx.stroke();
            circle(ctx, k * s * 0.09, -s * 0.33, s * 0.05, pal[2]);
            ellipse(ctx, k * s * 0.22, -s * 0.12, s * 0.09, s * 0.045, k * 0.5, pal[1]); ellipse(ctx, k * s * 0.22, -s * 0.12, s * 0.07, s * 0.03, k * 0.5, '#fde68a');
          });
          ellipse(ctx, 0, 0, s * 0.2, s * 0.23, 0, pal[1]); ellipse(ctx, 0, 0, s * 0.18, s * 0.21, 0, pal[0]);
          ellipse(ctx, 0, s * 0.12, s * 0.14, s * 0.1, 0, '#fef3c7');
          circle(ctx, -s * 0.05, s * 0.12, s * 0.018, pal[1]); circle(ctx, s * 0.05, s * 0.12, s * 0.018, pal[1]);
          cuteEye(-s * 0.08, -s * 0.05, s * 0.06); cuteEye(s * 0.08, -s * 0.05, s * 0.06);
          ellipse(ctx, -s * 0.06, -s * 0.15, s * 0.04, s * 0.03, 0, pal[2]);
          break;
        }
        case 'elephant': {
          taper(pts, s * 0.3, s * 0.11, pal[1], pal[0]);
          ctx.strokeStyle = pal[1]; ctx.lineWidth = Math.max(1, s * 0.025);
          for (i = 4; i < n - 2; i += 3) { // trunk wrinkles
            var a8 = segAngle(pts, i), w8 = s * (0.3 - 0.19 * i / n) * 0.42, px8 = Math.cos(a8 + Math.PI / 2), py8 = Math.sin(a8 + Math.PI / 2);
            ctx.beginPath(); ctx.moveTo(pts[i].x + px8 * w8, pts[i].y + py8 * w8); ctx.lineTo(pts[i].x - px8 * w8, pts[i].y - py8 * w8); ctx.stroke();
          }
          var ta8 = segAngle(pts, n - 2);
          ctx.save(); ctx.translate(tl.x, tl.y); ctx.rotate(ta8 + Math.PI);
          ellipse(ctx, s * 0.02, 0, s * 0.07, s * 0.09, 0, pal[1]); ellipse(ctx, s * 0.02, 0, s * 0.055, s * 0.075, 0, pal[0]);
          ellipse(ctx, s * 0.05, 0, s * 0.02, s * 0.035, 0, pal[1]); ctx.restore();
          ctx.translate(h.x, h.y - s * 0.05);
          var ear = Math.sin(now * (active ? 0.03 : 0.004) + idx) * 0.15;
          [-1, 1].forEach(function (k) {
            ctx.save(); ctx.translate(k * s * 0.22, -s * 0.02); ctx.rotate(k * ear);
            ellipse(ctx, 0, 0, s * 0.17, s * 0.2, 0, pal[1]); ellipse(ctx, 0, 0, s * 0.15, s * 0.18, 0, pal[0]); ellipse(ctx, k * s * 0.02, 0, s * 0.09, s * 0.12, 0, pal[2]); ctx.restore();
          });
          circle(ctx, 0, 0, s * 0.24, pal[1]); circle(ctx, 0, 0, s * 0.22, pal[0]);
          ellipse(ctx, -s * 0.07, -s * 0.12, s * 0.06, s * 0.035, -0.4, 'rgba(255,255,255,0.4)');
          cuteEye(-s * 0.09, -s * 0.02, s * 0.065); cuteEye(s * 0.09, -s * 0.02, s * 0.065);
          cheeks(0, s * 0.08, s * 0.15, s * 0.04);
          poly(ctx, [[-s * 0.1, s * 0.14], [-s * 0.14, s * 0.24], [-s * 0.06, s * 0.17]], '#fffbeb', pal[1], 1); poly(ctx, [[s * 0.1, s * 0.14], [s * 0.14, s * 0.24], [s * 0.06, s * 0.17]], '#fffbeb', pal[1], 1);
          break;
        }
      }
      ctx.restore();
    }
    function shade(hex) { // slightly darker variant of a #rrggbb colour
      var v = parseInt(hex.slice(1), 16), r = (v >> 16) & 255, g2 = (v >> 8) & 255, b = v & 255;
      return 'rgb(' + Math.round(r * 0.85) + ',' + Math.round(g2 * 0.85) + ',' + Math.round(b * 0.85) + ')';
    }
    // where the elephant's trunk ends etc: used for trail particles while sliding
    function slideTrail(dt, q) {
      var st = HZ_STYLE[G.hazard];
      if (!st || !st.trail || !q) return;
      if (Math.random() < Math.min(1, dt / 40)) {
        var kind = G.hazard === 'caterpillar' ? 'leaf' : (G.hazard === 'octopus' || G.hazard === 'elephant' || G.hazard === 'croc') ? 'drop' : 'dot';
        burst(q.x, q.y, st.trail, 3, kind);
      }
      if (G.hazard === 'elephant' && G.anim) { // water spray from the trunk tip
        var tp = center(G.anim.to);
        if (Math.random() < dt / 30) particles.push({ x: tp.x, y: tp.y, vx: (Math.random() - 0.5) * 0.08 * s, vy: -(0.08 + Math.random() * 0.06) * s, life: 1, decay: 0.002, color: st.trail[Math.floor(Math.random() * 3)], size: s * 0.07, kind: 'drop' });
      }
    }

    // ---------- board styles: ropes / ladders / dungeon stairs ----------
    function linePoints(bottom, top) { // straight boost, pts[0] = top
      var a = center(top), b = center(bottom), pts = [];
      for (var i = 0; i <= 24; i++) { var t = i / 24; pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
      return pts;
    }
    function boostPoints(bottom, top) { return G.board === 'ropes' ? ropePoints(bottom, top, 0) : linePoints(bottom, top); }
    function drawLadder(bottom, top) {
      var a = center(bottom), b = center(top), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      var hw = s * 0.17, i;
      ctx.save(); ctx.lineCap = 'round';
      var n = Math.max(2, Math.floor(len / (s * 0.27)));
      for (i = 1; i < n; i++) { // rungs
        var t = i / n, cx = a.x + dx * t, cy = a.y + dy * t;
        ctx.strokeStyle = '#3b2108'; ctx.lineWidth = Math.max(2.5, s * 0.075) + 2.5;
        ctx.beginPath(); ctx.moveTo(cx + nx * hw, cy + ny * hw); ctx.lineTo(cx - nx * hw, cy - ny * hw); ctx.stroke();
        ctx.strokeStyle = '#e0a458'; ctx.lineWidth = Math.max(2.5, s * 0.075);
        ctx.beginPath(); ctx.moveTo(cx + nx * hw, cy + ny * hw); ctx.lineTo(cx - nx * hw, cy - ny * hw); ctx.stroke();
      }
      [-1, 1].forEach(function (k) { // rails, a little past both ends
        var x0 = a.x + nx * hw * k - ux * s * 0.14, y0 = a.y + ny * hw * k - uy * s * 0.14, x1 = b.x + nx * hw * k + ux * s * 0.12, y1 = b.y + ny * hw * k + uy * s * 0.12;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = s * 0.11 + 4; ctx.beginPath(); ctx.moveTo(x0, y0 + 2); ctx.lineTo(x1, y1 + 2); ctx.stroke();
        ctx.strokeStyle = '#3b2108'; ctx.lineWidth = s * 0.11 + 2.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = '#b8742a'; ctx.lineWidth = s * 0.11; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,230,180,0.55)'; ctx.lineWidth = Math.max(1, s * 0.025); ctx.beginPath(); ctx.moveTo(x0 - nx * s * 0.02, y0 - ny * s * 0.02); ctx.lineTo(x1 - nx * s * 0.02, y1 - ny * s * 0.02); ctx.stroke();
      });
      ctx.restore();
    }
    function drawStairs(bottom, top) {
      var a = center(bottom), b = center(top), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      var n = Math.max(3, Math.floor(len / (s * 0.24))), i, step = len / n;
      ctx.save(); ctx.lineJoin = 'round';
      for (i = 0; i < n; i++) {
        var t0 = i / n, w = s * (0.24 - 0.07 * t0), x = a.x + dx * t0, y = a.y + dy * t0, d = step * 1.02;
        var p1 = [x + nx * w, y + ny * w], p2 = [x - nx * w, y - ny * w], p3 = [p2[0] + ux * d, p2[1] + uy * d], p4 = [p1[0] + ux * d, p1[1] + uy * d];
        poly(ctx, [[p1[0], p1[1] + 3], [p2[0], p2[1] + 3], [p3[0], p3[1] + 3], [p4[0], p4[1] + 3]], 'rgba(0,0,0,0.3)');
        poly(ctx, [p1, p2, p3, p4], i % 2 ? '#8b8f98' : '#a3a7ae', '#2b2f36', 1.5);
        var rz = d * 0.32; // shadowed riser at the back of each tread
        poly(ctx, [[p4[0] - ux * rz, p4[1] - uy * rz], [p3[0] - ux * rz, p3[1] - uy * rz], p3, p4], 'rgba(30,34,42,0.45)');
        // lit front edge of each step
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = Math.max(1.5, s * 0.04);
        ctx.beginPath(); ctx.moveTo(p1[0] + ux * s * 0.03, p1[1] + uy * s * 0.03); ctx.lineTo(p2[0] + ux * s * 0.03, p2[1] + uy * s * 0.03); ctx.stroke();
        circle(ctx, x + ux * d * 0.5 + nx * w * 0.4, y + uy * d * 0.5 + ny * w * 0.4, Math.max(0.8, s * 0.018), 'rgba(40,44,52,0.5)');
      }
      ctx.restore();
    }
    function drawBoost(bottom, top, now) {
      if (G.board === 'ladders') drawLadder(bottom, top);
      else if (G.board === 'dungeon') drawStairs(bottom, top);
      else drawRopeLine(bottom, top, now);
    }
    // torches on the dungeon walls (edge tiles without items)
    var TORCH_SQ = [70, 41, 90, 20, 11, 80];
    function drawTorches(now) {
      TORCH_SQ.forEach(function (n, i) {
        var c = center(n), left = squareToCell(n).col === 0, x = c.x + (left ? -s * 0.3 : s * 0.3), y = c.y + s * 0.16;
        var fl = 0.75 + Math.sin(now * 0.013 + i * 1.7) * 0.12 + Math.sin(now * 0.031 + i) * 0.08;
        var gl = ctx.createRadialGradient(x, y - s * 0.2, 0, x, y - s * 0.2, s * 0.85 * fl);
        gl.addColorStop(0, 'rgba(255,190,90,' + (0.55 * fl).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(255,150,50,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y - s * 0.2, s * 0.85 * fl, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3f2a14'; ctx.fillRect(x - s * 0.035, y - s * 0.12, s * 0.07, s * 0.26);
        ctx.fillStyle = '#6b7280'; ctx.fillRect(x - s * 0.07, y - s * 0.15, s * 0.14, s * 0.05);
        ctx.save(); ctx.translate(x, y - s * 0.27); ctx.scale(fl, 0.9 + (fl - 0.75)); flame(ctx, 0, 0, s * 0.17, now + i * 300); ctx.restore();
      });
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
    // ring in the owner's token colour around an owned animal / creature
    function ownerRing(x, y, r, color) {
      ctx.save();
      ctx.lineWidth = Math.max(2.5, s * 0.075); ctx.strokeStyle = TH.tokenRing; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, TAU); ctx.stroke();
      ctx.lineWidth = Math.max(2, s * 0.055); ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // ownership swap: old colour shrinks away, new colour ring bursts out
    var swaps = [], reshufflePop = false;
    function drawSwaps(dt) {
      for (var i = swaps.length - 1; i >= 0; i--) {
        var w = swaps[i]; w.t += dt / 900;
        if (w.t >= 1) { swaps.splice(i, 1); continue; }
        var c = center(w.sq), e = w.t;
        ctx.save(); ctx.lineWidth = Math.max(2, s * 0.08);
        if (w.from) { ctx.globalAlpha = 1 - e; ctx.strokeStyle = w.from; ctx.beginPath(); ctx.arc(c.x, c.y, s * 0.4 * (1 - e * 0.8), 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1 - e * 0.6; ctx.strokeStyle = w.to; ctx.beginPath(); ctx.arc(c.x, c.y, s * (0.2 + e * 0.5), -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, e * 1.6)); ctx.stroke();
        if (w.from) { // little swap arrows
          ctx.globalAlpha = 1 - e; ctx.fillStyle = w.to; ctx.font = '900 ' + Math.round(s * 0.3) + 'px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('\u21c4', c.x, c.y - s * (0.5 + e * 0.3));
        }
        ctx.restore();
      }
    }
    function drawItems(now) {
      var cur = G.current();
      ANIMALS.forEach(function (a, i) {
        var p = center(a.sq), bob = Math.sin(now * 0.004 + i) * s * 0.03, sz = s * 0.56, own = G.animalOwner[a.kind];
        circle(ctx, p.x + s * 0.08, p.y + s * 0.08, s * 0.3, TH.pad);
        if (own != null && G.players[own]) ownerRing(p.x + s * 0.08, p.y + s * 0.08, s * 0.31, G.players[own].token.color);
        ctx.drawImage(emojiSprite(a.emoji), p.x + s * 0.08 - sz / 2, p.y + s * 0.08 - sz / 2 + bob, sz, sz);
        if (a.perk) {
          var lbl = a.perk === 'hop2' ? '+2' : '\u21bb';
          ctx.font = '900 ' + Math.max(7, Math.round(s * 0.19)) + 'px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          circle(ctx, p.x + s * 0.3, p.y - s * 0.28, s * 0.13, a.perk === 'hop2' ? '#22c55e' : '#8b5cf6');
          ctx.fillStyle = '#fff'; ctx.fillText(lbl, p.x + s * 0.3, p.y - s * 0.27);
        }
      });
      CREATURES.forEach(function (c, i) {
        var p = center(c.sq), y = p.y + s * 0.06 + Math.sin(now * 0.004 + i * 2) * s * 0.04, own = G.collected[c.id];
        if (own != null && G.players[own]) ownerRing(p.x, p.y + s * 0.06, s * 0.36, G.players[own].token.color);
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
          if (G.anim.type === 'slide') { var hd = G.anim.from, nw = performance.now(); pts = hazardPoints(hd, G.anim.to, nw * 0.012 + snakeIndex(hd), 1 + Math.sin(nw * 0.03) * 0.5); }
          else pts = boostPoints(G.anim.from, G.anim.to);
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
    function snakeIndex(head) { return Object.keys(G.snakes).map(Number).indexOf(head); }

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
      ctx.fillText(p.name + ' spins!', cx, cy - R * 1.3);
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
        else if (p.kind === 'drop') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, TAU); ctx.fill(); }
        else if (p.kind === 'leaf') ellipse(ctx, p.x, p.y, p.size, p.size * 0.5, p.life * 5, p.color);
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
      if (G.board === 'dungeon') drawTorches(now);
      Object.keys(ROPES).forEach(function (b) { drawBoost(+b, ROPES[b], now); });
      var sliding = G.phase === 'sliding' && G.anim ? G.anim.from : -1;
      if (G.phase === 'reshuffling' && G.anim) { // old hazards fade out, new ones pop in
        var k = G.anim.t / G.anim.dur, map = k < 0.5 ? G.anim.old : G.snakes, al = k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2;
        if (k >= 0.5 && !reshufflePop) { reshufflePop = true; Object.keys(G.snakes).forEach(function (h) { var c = center(+h); burst(c.x, c.y, ['#fde68a', '#f0abfc', '#fff', '#67e8f9'], 10); }); }
        ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, al));
        Object.keys(map).map(Number).forEach(function (h, i) { drawHazard(G.hazard, h, map[h], i, now, true); });
        ctx.restore();
      } else Object.keys(G.snakes).map(Number).forEach(function (h, i) { drawHazard(G.hazard, h, G.snakes[h], i, now, h === sliding); });
      drawSwaps(dt);
      var cur = G.current();
      if (cur && sliding > 0 && dt > 0) slideTrail(dt, tokenPos(cur, G.turn));
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
        if (got) sl.el.style.setProperty('--oc', G.players[who].token.color); else sl.el.style.removeProperty('--oc');
        sl.el.title = c.name + (got ? ' (caught by ' + G.players[who].name + ')' : ' on square ' + c.sq);
      });
      trayCount.textContent = n + '/' + CREATURES.length;
      if (popId && slots[popId]) { var el = slots[popId].el; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var renaming = -1;
    function syncPlayers() {
      if (renaming >= 0) { // don't wipe the name being typed; just refresh the numbers
        playersEl.querySelectorAll('.dw-pl').forEach(function (el, i) {
          var p = G.players[i]; if (!p) return;
          el.querySelector('.dw-sq').textContent = p.pos; el.querySelector('.dw-pts').textContent = p.score;
          el.classList.toggle('on', i === G.turn && G.isActive());
        });
        return;
      }
      playersEl.innerHTML = G.players.map(function (p, i) {
        return '<div class="dw-pl' + (i === G.turn && G.isActive() ? ' on' : '') + (G.winner === i ? ' won' : '') + '" style="--tc:' + p.token.color + '" data-pl="' + i + '" role="button" tabindex="0" title="Tap to rename">' +
          '<i class="dw-dot"></i><b>' + esc(p.name) + '</b><span class="dw-sq">' + p.pos + '</span><span class="dw-pts">' + p.score + '</span></div>';
      }).join('');
    }
    function startRename(i) {
      var p = G.players[i], el = playersEl.querySelector('.dw-pl[data-pl="' + i + '"]');
      if (!p || !el || renaming >= 0) return;
      renaming = i;
      var b = el.querySelector('b'), inp = document.createElement('input');
      inp.className = 'dw-pl-name'; inp.type = 'text'; inp.value = p.name; inp.maxLength = NAME_MAX;
      inp.setAttribute('aria-label', 'Rename ' + p.name); inp.autocomplete = 'off'; inp.spellcheck = false;
      b.replaceWith(inp); inp.focus(); inp.select();
      var done = false;
      function finish(ok) {
        if (done) return; done = true;
        var nm = cleanName(inp.value);
        renaming = -1;
        if (ok && nm && nm !== p.name) {
          G.rename(i, nm);
          var st = seats[p.seat]; if (st) { st.name = nm; st.custom = true; saveSeats(); }
        }
        syncPlayers(); syncUI(true);
      }
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      inp.addEventListener('blur', function () { finish(true); });
    }
    playersEl.addEventListener('click', function (e) {
      if (e.target.closest('input')) return;
      var el = e.target.closest('.dw-pl'); if (el) startRename(+el.dataset.pl);
    });
    playersEl.addEventListener('keydown', function (e) {
      var el = e.target.closest && e.target.closest('.dw-pl');
      if (el && e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); startRename(+el.dataset.pl); }
    });
    function syncLog() {
      logEl.innerHTML = G.log.slice(-6).reverse().map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    }

    // ---------- overlays ----------
    function showOverlay(html) { overlayCard.innerHTML = html; overlay.classList.add('show'); }
    function hideOverlay() { overlay.classList.remove('show'); }
    var overlayMode = 'setup';
    function setupOverlay(fresh) {
      if (fresh) rollNames();
      overlayMode = 'setup';
      var rows = seats.map(function (st, i) {
        var opts = (i === 0 ? ['human', 'cpu'] : ['human', 'cpu', 'off']).map(function (t) {
          return '<button type="button" class="seg' + (st.type === t ? ' on' : '') + '" data-seat="' + i + '" data-type="' + t + '">' + { human: 'Human', cpu: 'CPU', off: 'Off' }[t] + '</button>';
        }).join('');
        return '<div class="dw-seat' + (st.type === 'off' ? ' off' : '') + '" style="--tc:' + TOKENS[i].color + '"><i class="dw-dot"></i>' +
          '<input class="dw-name" type="text" data-name="' + i + '" value="' + esc(st.name) + '" maxlength="' + NAME_MAX + '" autocomplete="off" spellcheck="false" aria-label="Player ' + (i + 1) + ' name">' +
          '<button type="button" class="dw-reroll" data-reroll="' + i + '" title="New random name" aria-label="New random name for player ' + (i + 1) + '">\u{1F504}</button>' +
          '<div class="segs">' + opts + '</div></div>';
      }).join('');
      var st = G.stats;
      showOverlay('<h2>Doodle Wheel</h2>' +
        '<p>Spin the <b>1\u201310 wheel</b>, climb <b>' + BOARDS[G.board].boosts + '</b>, dodge a <b>new slide-down animal</b> each game and win animals and creatures from each other. Land on <b>exactly 100</b> to win.</p>' +
        '<div class="dw-seats">' + rows + '</div>' +
        '<div class="dw-boardpick" role="radiogroup" aria-label="Board style"><span>Board</span><div class="segs">' + BOARD_ORDER.map(function (id) {
          var bd = BOARDS[id];
          return '<button type="button" class="seg' + (G.board === id ? ' on' : '') + '" data-board="' + id + '" role="radio" aria-checked="' + (G.board === id) + '">' + bd.emoji + ' ' + bd.name + '</button>';
        }).join('') + '</div></div>' +
        '<p class="dw-small">Best ' + G.high + ' pts \u00b7 best collection ' + G.bestCollection + '/8 \u00b7 ' + st.wins + ' wins in ' + st.games + ' games</p>' +
        '<button type="button" class="primary" data-ov="start">Start game</button>');
    }
    function pauseOverlay() { overlayMode = 'pause'; showOverlay('<h2>Paused</h2><p>Press <kbd>P</kbd> or tap Resume.</p><button type="button" class="primary" data-ov="resume">Resume</button>'); }
    function winOverlay(d) {
      var w = G.players[d.player], hz = G.hazardInfo(), bd = G.boardInfo();
      overlayMode = 'win';
      var rowsH = G.players.map(function (p) {
        var chips = G.ownedCreatures(p.id).map(function (k) { return '<img alt="' + CREATURE_BY_ID[k].name + '" title="' + CREATURE_BY_ID[k].name + '" src="' + creatureImg(k) + '">'; }).join('');
        return '<tr' + (p === w ? ' class="win"' : '') + ' style="--tc:' + p.token.color + '"><td><i class="dw-dot"></i>' + esc(p.name) + '</td><td>' + p.score + '</td><td>' + p.stats.spins + '</td><td>' + p.stats.snakes + '</td><td>' + p.stats.ropes + '</td><td>' + G.ownedAnimals(p.id) + '</td><td class="cr">' + (chips || '0') + '</td></tr>';
      }).join('');
      var hits = G.players.reduce(function (m, p) { return m + p.stats.snakes; }, 0);
      showOverlay('<h2>\u{1F3C6} ' + esc(w.name) + ' wins!</h2>' +
        '<p>Landed exactly on 100 after ' + w.stats.spins + ' spins.</p>' +
        '<p class="dw-small dw-win-hz">This round: ' + hz.emoji + ' ' + hz.name + ' \u00b7 ' + hz.plural + ' hit: ' + hits + '</p>' +
        '<table class="dw-table"><thead><tr><th></th><th>Pts</th><th>Spins</th><th title="' + hz.plural + ' hit">' + hz.emoji + '</th><th title="' + bd.Boosts + ' climbed">' + bd.emoji + '</th><th title="Animals owned now">\u{1F43E}</th><th title="Creatures owned now">Creatures</th></tr></thead><tbody>' + rowsH + '</tbody></table>' +
        (d.newRecord ? '<p class="record">New high score: ' + d.high + '!</p>' : '<p>Best score: ' + d.high + '</p>') +
        '<p class="dw-small">Best collection: ' + d.bestCollection + '/8' + (d.newBestCollection ? ' <span class="record">new best!</span>' : '') + '</p>' +
        '<div class="dw-ov-btns"><button type="button" class="primary" data-ov="again">Play again</button><button type="button" data-ov="setup">New game</button></div>');
    }
    // name inputs on the setup screen: typing renames the seat and is remembered
    overlay.addEventListener('input', function (e) {
      var t = e.target;
      if (!t.dataset || t.dataset.name == null) return;
      var st = seats[+t.dataset.name], nm = cleanName(t.value);
      if (nm) { st.name = nm; st.custom = true; } else st.custom = false;
      saveSeats();
    });
    overlay.addEventListener('change', function (e) {
      var t = e.target;
      if (!t.dataset || t.dataset.name == null) return;
      if (!cleanName(t.value)) t.value = rerollSeat(+t.dataset.name); // never leave a blank name
    });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.dataset && e.target.dataset.name != null) { e.preventDefault(); e.target.blur(); }
    });
    overlay.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.seat != null) {
        seats[+b.dataset.seat].type = b.dataset.type;
        saveSeats();
        setupOverlay(false); return;
      }
      if (b.dataset.board) { G.setBoard(b.dataset.board); setupOverlay(false); return; }
      if (b.dataset.reroll != null) {
        var i = +b.dataset.reroll, inp = overlayCard.querySelector('input[data-name="' + i + '"]');
        var nm = rerollSeat(i);
        if (inp) inp.value = nm;
        b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
        return;
      }
      var a = b.dataset.ov;
      if (a === 'start') startGame(true);
      else if (a === 'again') startGame(false);
      else if (a === 'setup') setupOverlay(true);
      else if (a === 'resume') setPaused(false);
    });

    // ---------- actions ----------
    function seatList() {
      var list = [];
      seats.forEach(function (x, i) { if (x.type !== 'off') list.push({ type: x.type, name: x.name || randomName([]), seat: i }); });
      return list;
    }
    // fromSetup: use the names shown on the setup screen; otherwise (Restart /
    // Play again) every seat that wasn't renamed gets a fresh random name
    function startGame(fromSetup, opts) {
      if (!fromSetup) rollNames();
      renaming = -1;
      particles = []; floaters = []; flyers = []; confetti = [];
      G.start(seatList(), opts); hideOverlay(); syncTray(); syncPlayers(); syncLog(); syncUI(true);
    }
    // 5-0 reshuffle banner (one-time, declinable; a CPU takes it by itself)
    var offerEl = document.createElement('div');
    offerEl.className = 'dw-offer'; offerEl.id = 'dwOffer'; offerEl.setAttribute('role', 'dialog'); offerEl.setAttribute('aria-live', 'assertive');
    boardInner.appendChild(offerEl);
    function showOffer() {
      var p = G.current(), hz = G.hazardInfo(), bd = G.boardInfo();
      if (!p) return;
      offerEl.style.setProperty('--tc', p.token.color);
      offerEl.innerHTML = '<div class="dw-offer-txt"><b>' + esc(p.name) + '</b> climbed ' + p.stats.ropes + ' ' + bd.boosts + ' to 0! ' +
        (p.type === 'cpu' ? 'Reshuffling the ' + hz.plural + '\u2026' : 'Reshuffle the ' + hz.plural + '?') + '</div>' +
        (p.type === 'cpu' ? '' : '<div class="dw-offer-btns"><button type="button" class="primary" data-offer="yes">\u{1F500} Reshuffle hazards</button><button type="button" data-offer="no">No thanks</button></div>');
      offerEl.classList.add('show');
    }
    function hideOffer() { offerEl.classList.remove('show'); }
    offerEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.offer === 'yes') G.acceptReshuffle(); else G.declineReshuffle();
      syncUI(true);
    });
    offerEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    function syncHazard(pop) {
      var hz = G.hazardInfo();
      if (!hazardEl) return;
      if (G.phase === 'idle' && !hazardSeen) hazardEl.innerHTML = '<span class="dw-hz-emoji">\u2728</span> <b>A new slide-down animal every game</b>';
      else hazardEl.innerHTML = '<span class="dw-hz-lbl">' + (G.phase === 'idle' ? 'Last round' : 'This round') + ':</span> <span class="dw-hz-emoji">' + hz.emoji + '</span> <b>' + esc(hz.name) + '</b>';
      hazardEl.dataset.hazard = hz.id;
      hazardEl.title = hz.plural + ' slide you down this game';
      if (pop) { hazardEl.classList.remove('pop'); void hazardEl.offsetWidth; hazardEl.classList.add('pop'); }
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
    btnNew.addEventListener('click', function () { if (G.isActive() && !G.paused) G.togglePause(true); setupOverlay(true); syncUI(true); btnNew.blur(); });
    btnRestart.addEventListener('click', function () { startGame(false); btnRestart.blur(); });
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
        if (G.phase === 'idle' || G.phase === 'over') { if (overlay.classList.contains('show')) startGame(overlayMode === 'setup'); }
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
      else if (type === 'snake') {
        var hz = HAZARD_BY_ID[d.hazard] || HAZARDS[0], hs = HZ_STYLE[hz.id] || {};
        c = center(d.from); shake = hs.shake || 0.8;
        if (hs.trail) burst(c.x, c.y, hs.trail, 16, hz.id === 'caterpillar' ? 'leaf' : 'drop');
        floater(hz.emoji + ' ' + hz.sfx + ' \u2193' + d.to, c.x, c.y - s * 0.4, '#fca5a5');
      }
      else if (type === 'rope') {
        var bdi = G.boardInfo(); c = center(d.from);
        burst(c.x, c.y, G.board === 'dungeon' ? ['#d1d5db', '#9ca3af', '#fde68a'] : ['#c99554', '#fde68a', '#fff'], 14);
        floater(bdi.Boosts === 'Stairs' ? 'Stairs! \u2191' + d.to + ' +' + d.points : bdi.boost.charAt(0).toUpperCase() + bdi.boost.slice(1) + '! \u2191' + d.to + ' +' + d.points, c.x, c.y - s * 0.4, '#fcd34d');
      }
      else if (type === 'offer') showOffer();
      else if (type === 'reshuffle') {
        hideOffer(); reshufflePop = false; shake = 0.6;
        Object.keys(d.old).forEach(function (h) { var cc = center(+h); burst(cc.x, cc.y, ['#e9d5ff', '#fff', '#a5b4fc'], 8); });
        floater('\u{1F500} Reshuffle!', size / 2, size * 0.45, '#c4b5fd');
      } else if (type === 'decline') hideOffer();
      else if (type === 'animal') {
        c = center(d.sq);
        if (!d.mine && G.players[d.player]) swaps.push({ sq: d.sq, t: 0, to: G.players[d.player].token.color, from: d.from != null && G.players[d.from] ? G.players[d.from].token.color : null }); burst(c.x, c.y, ['#f9a8d4', '#fda4af', '#fde68a', '#fff'], 14, 'heart');
        floater('+' + d.points + (d.perk === 'hop2' ? ' \u00b7 +2 squares' : d.perk === 'respin' ? ' \u00b7 free spin' : ''), c.x, c.y - s * 0.45, '#f9a8d4');
      } else if (type === 'catch') {
        var cr = CREATURE_BY_ID[d.kind]; c = center(d.sq);
        burst(c.x, c.y, [cr.color, '#fff', '#fde68a'], 26);
        if (G.players[d.player]) swaps.push({ sq: d.sq, t: 0, to: G.players[d.player].token.color, from: d.from != null && G.players[d.from] ? G.players[d.from].token.color : null });
        floater((d.from != null ? 'Took ' : 'Caught ') + d.name + '! +' + d.points, c.x, c.y - s * 0.5, cr.color);
        flyers.push({ kind: d.kind, x: c.x, y: c.y, t: 0 });
        syncTray(d.kind);
      } else if (type === 'win') {
        startConfetti(); c = center(LAST); burst(c.x, c.y, SEG_COLORS, 50);
        setTimeout(function () { if (G.phase === 'over') winOverlay(d); }, 1400);
      } else if (type === 'spun') { lastEl.textContent = G.players[d.player].name + ' spun ' + d.result; }
      if (type === 'log') syncLog();
      if (type === 'start') { // fresh board: clear leftover effects from the last game
        hazardSeen = true; syncHazard(true); hideOffer(); swaps = [];
        particles = []; floaters = []; flyers = []; confetti = [];
        syncTray(); syncLog(); lastEl.textContent = 'Tap or Space';
      }
      if (type === 'board') { if (size && boardCache.width) drawSquares(bctx); }
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
      else if (G.phase === 'over') txt = '\u{1F3C6} ' + G.players[G.winner].name + ' wins!';
      else if (G.paused) txt = 'Paused';
      else if (G.phase === 'ready') txt = human ? p.name + '\u2019s turn' : p.name + ' is thinking\u2026';
      else if (G.phase === 'offer') txt = '\u{1F500} Reshuffle?';
      else if (G.phase === 'reshuffling') txt = '\u{1F500} Reshuffling\u2026';
      else if (G.phase === 'spinning' || G.phase === 'landed') txt = p.name + ' is spinning\u2026';
      else txt = p.name + ' is moving\u2026';
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
      theme: function () { return themeId; },
      hazard: function () { return G.hazard; },
      newGame: function (opts) { startGame(false, opts); }, // automation: start with fresh names (opts.hazard forces one)
      seats: function () { return seats.map(function (st) { return { type: st.type, name: st.name, custom: st.custom }; }); }
    };

    themeBtns.forEach(function (b) {
      b.addEventListener('click', function () { applyTheme(b.dataset.theme, true); b.blur(); });
    });
    root.addEventListener('hashchange', function () { applyTheme(themeId, false); });
    applyTheme(themeId, false);

    resize();
    syncTray();
    syncHazard(false);
    setupOverlay(true);
    syncUI(true);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})(typeof window !== 'undefined' ? window : globalThis);
