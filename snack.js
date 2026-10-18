/*
 * Snack and Letters: a snake game. Eat cute animals that carry letters to spell
 * words, collect ropes (each one spins a x1-x10 bonus wheel), and late in the
 * game catch original collectible creatures.
 * Plain JavaScript, no dependencies. The engine (createSnackGame) is DOM-free
 * so it can be loaded in Node for tests: require('./snack.js').
 * All creatures are original designs made for this game.
 */
(function (root) {
  'use strict';

  // ===================================================================
  //  Core engine (no DOM)
  // ===================================================================
  var COLS = 15, ROWS = 20;
  var TAU = Math.PI * 2;
  var WHEEL_N = 10;
  var WHEEL_SEG = TAU / WHEEL_N;
  var SPIN_TIME = 3200;      // ms the wheel spins
  var AUTO_SPIN = 2000;      // ms idle before the wheel spins by itself
  var RESULT_TIME = 1100;    // ms the result pop is shown
  var COUNT_STEP = 500;      // ms per countdown number
  var COUNT_FROM = 3;
  var ROPE_EVERY = 4;        // snacks between ropes
  var ROPE_LIFE = 15000;
  var CREATURE_LIFE = 16000;
  var LATE_ROPES = 3;        // creatures appear once this many ropes are collected...
  var LATE_LEVEL = 5;        // ...or once this level is reached
  var SNACKS_PER_LEVEL = 5;

  var ANIMALS = [
    { id: 'mouse', name: 'Mouse', color: '#c9cde3' },
    { id: 'chick', name: 'Chick', color: '#ffd54a' },
    { id: 'bunny', name: 'Bunny', color: '#f7c6da' },
    { id: 'frog', name: 'Frog', color: '#7ed957' },
    { id: 'piglet', name: 'Piglet', color: '#ff9fb2' },
    { id: 'kitten', name: 'Kitten', color: '#ffb46b' }
  ];

  // Original creature designs (not based on any existing franchise characters).
  var CREATURES = [
    { id: 'zappip', name: 'Zappip', color: '#ffd23f', desc: 'Round spark mouse with a lightning tuft' },
    { id: 'embrix', name: 'Embrix', color: '#ff5a5f', desc: 'Ember gecko with a candle-flame crest' },
    { id: 'shellow', name: 'Shellow', color: '#3cc6c0', desc: 'Puddle turtle with a bubbly shell' },
    { id: 'budlet', name: 'Budlet', color: '#6fd46a', desc: 'Leaf sprout with a two-leaf hat' },
    { id: 'wispo', name: 'Wispo', color: '#b9a4ff', desc: 'Ghostly puff that floats on a wavy tail' },
    { id: 'pebbit', name: 'Pebbit', color: '#a3a7b8', desc: 'Pebble pup with floppy stone ears' },
    { id: 'frostail', name: 'Frostail', color: '#9be7ff', desc: 'Frosty fox kit with a snowflake mark' },
    { id: 'glimmoth', name: 'Glimmoth', color: '#ff8fd0', desc: 'Glowing moth with star-spot wings' }
  ];

  var WORDS = ['SNACK', 'ROPE', 'HAPPY', 'CANDY', 'LETTER', 'SUNNY', 'BERRY', 'PIXEL', 'CHEER', 'MAGIC',
    'PLUM', 'KITE', 'LUCKY', 'HONEY', 'ZIGZAG', 'CLOUD', 'MANGO', 'TWIRL', 'PUZZLE', 'SPARK'];

  function mod(a, n) { return ((a % n) + n) % n; }

  // ---- wheel math (exported for tests) ----
  // The pointer sits at the top. With the wheel rotated by theta (clockwise),
  // the wheel-local angle under the pointer is -theta. Segment k (number k+1)
  // covers local angles [k*SEG, (k+1)*SEG).
  function pickWheelResult(rng) { return 1 + Math.min(WHEEL_N - 1, Math.floor(rng() * WHEEL_N)); }
  function wheelSegmentAt(theta) {
    var k = Math.floor(mod(-theta, TAU) / WHEEL_SEG);
    return Math.max(0, Math.min(WHEEL_N - 1, k)) + 1;
  }
  function wheelTargetAngle(result, start, rng) {
    var off = (rng() - 0.5) * 0.7;                // stay well inside the segment
    var phi = (result - 1 + 0.5 + off) * WHEEL_SEG;
    var base = -phi;
    var minTarget = start + 5 * TAU;              // at least 5 full turns
    var m = Math.ceil((minTarget - base) / TAU);
    return base + m * TAU;
  }
  function easeOutQuart(p) { return 1 - Math.pow(1 - p, 4); }

  function createSnackGame(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var storage = opts.storage || null;

    var g = {
      COLS: COLS, ROWS: ROWS,
      phase: 'idle',            // idle | playing | wheel | over
      paused: false,
      snake: [], prevSnake: [], dir: { x: 1, y: 0 }, dirQueue: [],
      tickT: 0, time: 0,
      animals: [], rope: null, creature: null,
      word: 'SNACK', wordIdx: 0, wordsDone: 0,
      score: 0, level: 1, eaten: 0, ropes: 0, eatenSinceRope: 0,
      collection: {}, caughtTotal: 0,
      high: 0, bestCollection: 0, newRecord: false, newCollectionRecord: false,
      wheel: null, wheelAngle: 0, wheelHistory: [],
      onEvent: null,
      constants: {
        SPIN_TIME: SPIN_TIME, AUTO_SPIN: AUTO_SPIN, RESULT_TIME: RESULT_TIME, COUNT_STEP: COUNT_STEP,
        COUNT_FROM: COUNT_FROM, ROPE_EVERY: ROPE_EVERY, LATE_ROPES: LATE_ROPES, LATE_LEVEL: LATE_LEVEL,
        ROPE_LIFE: ROPE_LIFE, CREATURE_LIFE: CREATURE_LIFE
      }
    };

    function emit(type, data) {
      if (g.onEvent) { try { g.onEvent(type, data || {}); } catch (e) { if (typeof console !== 'undefined') console.error(e); } }
    }
    function sget(k) { if (!storage) return null; return storage.get(k); }
    function sset(k, v) { if (storage) storage.set(k, String(v)); }
    function loadBests() {
      var h = parseInt(sget('high'), 10), c = parseInt(sget('bestCollection'), 10);
      g.high = isNaN(h) ? 0 : h;
      g.bestCollection = isNaN(c) ? 0 : c;
    }

    g.interval = function () { return Math.max(70, 165 - (g.level - 1) * 9); };
    g.lateGame = function () { return g.ropes >= LATE_ROPES || g.level >= LATE_LEVEL; };

    function inBounds(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
    function snakeAt(x, y) { for (var i = 0; i < g.snake.length; i++) if (g.snake[i].x === x && g.snake[i].y === y) return true; return false; }
    function animalAt(x, y) { for (var i = 0; i < g.animals.length; i++) if (g.animals[i].x === x && g.animals[i].y === y) return i; return -1; }
    function ropeAt(x, y) { if (!g.rope) return false; return g.rope.cells.some(function (c) { return c.x === x && c.y === y; }); }
    function creatureAt(x, y) { return !!g.creature && g.creature.x === x && g.creature.y === y; }
    function occupied(x, y) { return snakeAt(x, y) || animalAt(x, y) >= 0 || ropeAt(x, y) || creatureAt(x, y); }
    g.occupied = occupied;
    function nearHead(x, y, d) { var h = g.snake[0]; return h && Math.abs(h.x - x) + Math.abs(h.y - y) < d; }

    function freeCell(minDist) {
      for (var t = 0; t < 400; t++) {
        var x = Math.floor(rng() * COLS), y = Math.floor(rng() * ROWS);
        if (!occupied(x, y) && !nearHead(x, y, minDist)) return { x: x, y: y };
      }
      for (var yy = 0; yy < ROWS; yy++) for (var xx = 0; xx < COLS; xx++) if (!occupied(xx, yy)) return { x: xx, y: yy };
      return null;
    }

    function newWord() {
      var w;
      do { w = WORDS[Math.floor(rng() * WORDS.length)]; } while (w === g.word && WORDS.length > 1);
      g.word = w; g.wordIdx = 0;
    }
    function neededLetter() { return g.word[g.wordIdx]; }

    function spawnAnimals() {
      while (g.animals.length < 2) {
        var need = neededLetter();
        var hasNeed = g.animals.some(function (a) { return a.letter === need; });
        var letter;
        if (!hasNeed) letter = need;
        else if (rng() < 0.5) letter = g.word[Math.floor(rng() * g.word.length)];
        else letter = String.fromCharCode(65 + Math.floor(rng() * 26));
        var c = freeCell(3);
        if (!c) return;
        g.animals.push({ x: c.x, y: c.y, kind: ANIMALS[Math.floor(rng() * ANIMALS.length)].id, letter: letter, born: g.time });
      }
    }

    function spawnRope() {
      for (var t = 0; t < 300; t++) {
        var horiz = rng() < 0.5;
        var x = Math.floor(rng() * (COLS - (horiz ? 2 : 0))), y = Math.floor(rng() * (ROWS - (horiz ? 0 : 2)));
        var cells = [0, 1, 2].map(function (i) { return { x: x + (horiz ? i : 0), y: y + (horiz ? 0 : i) }; });
        if (cells.every(function (c) { return inBounds(c.x, c.y) && !occupied(c.x, c.y) && !nearHead(c.x, c.y, 4); })) {
          g.rope = { cells: cells, horiz: horiz, born: g.time, life: ROPE_LIFE };
          emit('ropeSpawn', { rope: g.rope });
          if (g.lateGame() && !g.creature) spawnCreature();
          return true;
        }
      }
      return false;
    }
    g.spawnRope = spawnRope;

    function pickCreatureKind() {
      var uncaught = CREATURES.filter(function (c) { return !g.collection[c.id]; });
      if (uncaught.length && rng() < 0.7) return uncaught[Math.floor(rng() * uncaught.length)].id;
      return CREATURES[Math.floor(rng() * CREATURES.length)].id;
    }

    function spawnCreature() {
      if (!g.rope) return false;
      var cand = [];
      g.rope.cells.forEach(function (c) {
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var x = c.x + dx, y = c.y + dy;
          if ((dx || dy) && inBounds(x, y) && !occupied(x, y) && !nearHead(x, y, 2) &&
            !cand.some(function (q) { return q.x === x && q.y === y; })) cand.push({ x: x, y: y });
        }
      });
      if (!cand.length) return false;
      var p = cand[Math.floor(rng() * cand.length)];
      g.creature = { x: p.x, y: p.y, kind: pickCreatureKind(), born: g.time, life: CREATURE_LIFE };
      emit('creatureSpawn', { creature: g.creature });
      return true;
    }
    g.spawnCreature = spawnCreature;

    g.start = function () {
      loadBests();
      var cy = Math.floor(ROWS / 2);
      g.snake = [{ x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy }, { x: 2, y: cy }];
      g.prevSnake = g.snake.map(function (s) { return { x: s.x, y: s.y }; });
      g.dir = { x: 1, y: 0 }; g.dirQueue = [];
      g.tickT = 0; g.time = 0;
      g.animals = []; g.rope = null; g.creature = null;
      g.score = 0; g.level = 1; g.eaten = 0; g.ropes = 0; g.eatenSinceRope = 0;
      g.collection = {}; g.caughtTotal = 0; g.wordsDone = 0;
      g.newRecord = false; g.newCollectionRecord = false;
      g.wheel = null; g.wheelHistory = [];
      g.paused = false;
      g.word = ''; newWord();
      spawnAnimals();
      g.phase = 'playing';
      emit('start', {});
    };

    g.setDir = function (dx, dy) {
      if (g.phase !== 'playing' || g.paused) return false;
      var last = g.dirQueue.length ? g.dirQueue[g.dirQueue.length - 1] : g.dir;
      if ((dx === last.x && dy === last.y) || (dx === -last.x && dy === -last.y)) return false;
      if (g.dirQueue.length >= 3) return false;
      g.dirQueue.push({ x: dx, y: dy });
      return true;
    };

    g.togglePause = function (force) {
      if (g.phase !== 'playing') return false;  // no pausing during the wheel / menus
      g.paused = typeof force === 'boolean' ? force : !g.paused;
      emit('pause', { paused: g.paused });
      return g.paused;
    };

    function gameOver(reason) {
      g.phase = 'over';
      if (g.score > g.high) { g.high = g.score; g.newRecord = true; sset('high', g.high); }
      if (g.caughtTotal > g.bestCollection) { g.bestCollection = g.caughtTotal; g.newCollectionRecord = true; sset('bestCollection', g.bestCollection); }
      emit('gameover', { reason: reason, score: g.score, collection: Object.assign({}, g.collection), caught: g.caughtTotal });
    }

    function step() {
      if (g.dirQueue.length) g.dir = g.dirQueue.shift();
      var h = g.snake[0];
      var nx = h.x + g.dir.x, ny = h.y + g.dir.y;
      g.prevSnake = g.snake.map(function (s) { return { x: s.x, y: s.y }; });
      if (!inBounds(nx, ny)) { gameOver('wall'); return; }
      var ai = animalAt(nx, ny);
      var grow = ai >= 0;
      var bodyLen = grow ? g.snake.length : g.snake.length - 1; // the tail moves away unless growing
      for (var i = 0; i < bodyLen; i++) if (g.snake[i].x === nx && g.snake[i].y === ny) { gameOver('self'); return; }
      g.snake.unshift({ x: nx, y: ny });
      if (!grow) g.snake.pop();
      if (grow) eatAnimal(ai);
      if (creatureAt(nx, ny)) catchCreature();
      if (ropeAt(nx, ny)) collectRope();
    }
    g.step = step;

    function eatAnimal(i) {
      var a = g.animals.splice(i, 1)[0];
      var pts = 10 * g.level, matched = false, wordDone = null;
      if (a.letter === neededLetter()) {
        matched = true; pts += 5 * g.level; g.wordIdx++;
        if (g.wordIdx >= g.word.length) {
          var bonus = 50 * g.word.length * g.level;
          pts += bonus; g.wordsDone++; wordDone = { word: g.word, bonus: bonus };
          newWord();
        }
      }
      g.score += pts;
      g.eaten++; g.eatenSinceRope++;
      var lvl = 1 + Math.floor(g.eaten / SNACKS_PER_LEVEL);
      var leveled = lvl > g.level; g.level = lvl;
      emit('eat', { animal: a, points: pts, matched: matched, wordDone: wordDone });
      if (wordDone) emit('word', wordDone);
      if (leveled) emit('levelup', { level: g.level });
      spawnAnimals();
      if (g.eatenSinceRope >= ROPE_EVERY && !g.rope) spawnRope();
    }

    function catchCreature() {
      var c = g.creature; g.creature = null;
      g.collection[c.kind] = (g.collection[c.kind] || 0) + 1;
      g.caughtTotal++;
      var pts = 250 * g.level;
      g.score += pts;
      emit('catch', { creature: c, points: pts, count: g.collection[c.kind], first: g.collection[c.kind] === 1 });
    }
    g.catchCreature = catchCreature;

    function collectRope() {
      var r = g.rope; g.rope = null;
      g.ropes++; g.eatenSinceRope = 0;
      var base = 50 * g.level;
      g.phase = 'wheel';
      g.wheel = { state: 'ready', angle: g.wheelAngle, idleT: 0, t: 0, base: base, result: 0, landed: 0, points: 0, count: COUNT_FROM };
      emit('rope', { rope: r, base: base });
    }
    g.collectRope = collectRope;

    g.spin = function () {
      var w = g.wheel;
      if (g.phase !== 'wheel' || !w || w.state !== 'ready') return false;
      w.result = pickWheelResult(rng);
      w.from = w.angle;
      w.to = wheelTargetAngle(w.result, w.angle, rng);
      w.t = 0; w.state = 'spinning';
      emit('spin', { auto: w.idleT >= AUTO_SPIN });
      return true;
    };

    function updateWheel(dt) {
      var w = g.wheel;
      if (w.state === 'ready') {
        w.idleT += dt;
        if (w.idleT >= AUTO_SPIN) g.spin();
      } else if (w.state === 'spinning') {
        w.t += dt;
        var p = Math.min(1, w.t / SPIN_TIME);
        w.angle = w.from + (w.to - w.from) * easeOutQuart(p);
        if (p >= 1) {
          w.angle = w.to;
          w.landed = wheelSegmentAt(w.angle);
          w.points = w.base * w.result;
          g.score += w.points;
          g.wheelHistory.push({ result: w.result, landed: w.landed, angle: w.angle });
          w.state = 'result'; w.t = 0;
          emit('wheelResult', { result: w.result, landed: w.landed, base: w.base, points: w.points });
        }
      } else if (w.state === 'result') {
        w.t += dt;
        if (w.t >= RESULT_TIME) { w.state = 'countdown'; w.t = 0; w.count = COUNT_FROM; emit('countdown', { count: COUNT_FROM }); }
      } else if (w.state === 'countdown') {
        w.t += dt;
        var c = COUNT_FROM - Math.floor(w.t / COUNT_STEP);
        if (c !== w.count && c > 0) { w.count = c; emit('countdown', { count: c }); }
        if (w.t >= COUNT_FROM * COUNT_STEP) {
          g.wheelAngle = mod(w.angle, TAU);
          g.wheel = null;
          g.phase = 'playing';
          g.tickT = 0;
          emit('resume', {});
        }
      }
    }

    g.update = function (dt) {
      if (g.paused || g.phase === 'idle' || g.phase === 'over') return;
      if (g.phase === 'wheel') { updateWheel(dt); return; }
      g.time += dt;
      if (g.rope && g.time - g.rope.born > g.rope.life) { g.rope = null; emit('ropeGone', {}); }
      if (g.creature && g.time - g.creature.born > g.creature.life) { g.creature = null; emit('creatureGone', {}); }
      if (!g.rope && g.eatenSinceRope >= ROPE_EVERY) spawnRope();
      g.tickT += dt;
      var iv = g.interval();
      while (g.tickT >= iv && g.phase === 'playing') { g.tickT -= iv; step(); }
    };

    g.uniqueCaught = function () { return CREATURES.filter(function (c) { return g.collection[c.id]; }).length; };

    loadBests();
    return g;
  }

  var api = {
    createSnackGame: createSnackGame, COLS: COLS, ROWS: ROWS, ANIMALS: ANIMALS, CREATURES: CREATURES, WORDS: WORDS,
    WHEEL_N: WHEEL_N, WHEEL_SEG: WHEEL_SEG, pickWheelResult: pickWheelResult, wheelSegmentAt: wheelSegmentAt,
    wheelTargetAngle: wheelTargetAngle
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SnackLetters = api;

  // ===================================================================
  //  Drawing helpers (canvas only; shared by the board, tray and wheel)
  // ===================================================================
  if (typeof document === 'undefined') return;

  function shade(hex, amt) {
    var h = hex.replace('#', ''), n = parseInt(h, 16), rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    var t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    return 'rgb(' + rgb.map(function (v) { return Math.round((t - v) * p + v); }).join(',') + ')';
  }
  function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function ellipse(ctx, x, y, rx, ry, rot, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }
  function eyes(ctx, x, y, r, gap, color) {
    color = color || '#20243a';
    circle(ctx, x - gap, y, r, color); circle(ctx, x + gap, y, r, color);
    circle(ctx, x - gap + r * 0.35, y - r * 0.35, r * 0.38, '#fff'); circle(ctx, x + gap + r * 0.35, y - r * 0.35, r * 0.38, '#fff');
  }
  function blush(ctx, x, y, r, gap, color) {
    ctx.globalAlpha *= 0.7; ellipse(ctx, x - gap, y, r, r * 0.6, 0, color || '#ff7aa8'); ellipse(ctx, x + gap, y, r, r * 0.6, 0, color || '#ff7aa8'); ctx.globalAlpha /= 0.7;
  }
  function smile(ctx, x, y, w, color) {
    ctx.beginPath(); ctx.arc(x, y - w * 0.3, w, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.strokeStyle = color || '#20243a'; ctx.lineWidth = Math.max(1, w * 0.45); ctx.lineCap = 'round'; ctx.stroke();
  }
  function bodyGrad(ctx, x, y, r, color) {
    var gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    gr.addColorStop(0, shade(color, 0.45)); gr.addColorStop(0.6, color); gr.addColorStop(1, shade(color, -0.25));
    return gr;
  }

  // r = radius of the drawing (about half a cell)
  function drawAnimal(ctx, kind, x, y, r, t) {
    var a = ANIMALS.filter(function (q) { return q.id === kind; })[0] || ANIMALS[0];
    var c = a.color, bob = Math.sin((t || 0) / 260 + x) * r * 0.05;
    y += bob;
    ctx.save();
    switch (kind) {
      case 'mouse':
        circle(ctx, x - r * 0.62, y - r * 0.55, r * 0.42, shade(c, -0.1)); circle(ctx, x + r * 0.62, y - r * 0.55, r * 0.42, shade(c, -0.1));
        circle(ctx, x - r * 0.62, y - r * 0.55, r * 0.24, '#ffb3c7'); circle(ctx, x + r * 0.62, y - r * 0.55, r * 0.24, '#ffb3c7');
        circle(ctx, x, y, r * 0.78, bodyGrad(ctx, x, y, r * 0.78, c));
        circle(ctx, x, y + r * 0.2, r * 0.1, '#ff7aa8');
        break;
      case 'chick':
        circle(ctx, x, y, r * 0.8, bodyGrad(ctx, x, y, r * 0.8, c));
        ctx.beginPath(); ctx.moveTo(x - r * 0.1, y - r * 0.78); ctx.quadraticCurveTo(x, y - r * 1.15, x + r * 0.15, y - r * 0.78); ctx.strokeStyle = shade(c, -0.2); ctx.lineWidth = r * 0.12; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - r * 0.14, y + r * 0.12); ctx.lineTo(x + r * 0.14, y + r * 0.12); ctx.lineTo(x, y + r * 0.32); ctx.closePath(); ctx.fillStyle = '#ff9a3c'; ctx.fill();
        break;
      case 'bunny':
        ellipse(ctx, x - r * 0.3, y - r * 0.85, r * 0.18, r * 0.5, -0.15, c); ellipse(ctx, x + r * 0.3, y - r * 0.85, r * 0.18, r * 0.5, 0.15, c);
        ellipse(ctx, x - r * 0.3, y - r * 0.85, r * 0.08, r * 0.35, -0.15, '#ff9cc0'); ellipse(ctx, x + r * 0.3, y - r * 0.85, r * 0.08, r * 0.35, 0.15, '#ff9cc0');
        circle(ctx, x, y + r * 0.05, r * 0.72, bodyGrad(ctx, x, y, r * 0.72, c));
        circle(ctx, x, y + r * 0.22, r * 0.08, '#ff7aa8');
        break;
      case 'frog':
        circle(ctx, x - r * 0.38, y - r * 0.5, r * 0.3, c); circle(ctx, x + r * 0.38, y - r * 0.5, r * 0.3, c);
        ellipse(ctx, x, y + r * 0.08, r * 0.85, r * 0.65, 0, bodyGrad(ctx, x, y, r * 0.85, c));
        eyes(ctx, x, y - r * 0.52, r * 0.15, r * 0.38);
        smile(ctx, x, y + r * 0.2, r * 0.3);
        ctx.restore();
        return;
      case 'piglet':
        ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.3); ctx.lineTo(x - r * 0.55, y - r * 0.85); ctx.lineTo(x - r * 0.2, y - r * 0.6); ctx.fillStyle = shade(c, -0.1); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.3); ctx.lineTo(x + r * 0.55, y - r * 0.85); ctx.lineTo(x + r * 0.2, y - r * 0.6); ctx.fill();
        circle(ctx, x, y, r * 0.8, bodyGrad(ctx, x, y, r * 0.8, c));
        ellipse(ctx, x, y + r * 0.22, r * 0.26, r * 0.18, 0, shade(c, -0.15));
        circle(ctx, x - r * 0.09, y + r * 0.22, r * 0.05, '#7a3348'); circle(ctx, x + r * 0.09, y + r * 0.22, r * 0.05, '#7a3348');
        eyes(ctx, x, y - r * 0.15, r * 0.11, r * 0.3);
        ctx.restore();
        return;
      case 'kitten':
      default:
        ctx.beginPath(); ctx.moveTo(x - r * 0.75, y - r * 0.15); ctx.lineTo(x - r * 0.6, y - r * 0.95); ctx.lineTo(x - r * 0.15, y - r * 0.65); ctx.fillStyle = c; ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + r * 0.75, y - r * 0.15); ctx.lineTo(x + r * 0.6, y - r * 0.95); ctx.lineTo(x + r * 0.15, y - r * 0.65); ctx.fill();
        circle(ctx, x, y, r * 0.78, bodyGrad(ctx, x, y, r * 0.78, c));
        ctx.strokeStyle = 'rgba(32,36,58,0.6)'; ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath(); ctx.moveTo(x - r * 0.25, y + r * 0.15); ctx.lineTo(x - r * 0.7, y + r * 0.05); ctx.moveTo(x + r * 0.25, y + r * 0.15); ctx.lineTo(x + r * 0.7, y + r * 0.05); ctx.stroke();
        break;
    }
    eyes(ctx, x, y - r * 0.12, r * 0.12, r * 0.3);
    blush(ctx, x, y + r * 0.12, r * 0.14, r * 0.48);
    ctx.restore();
  }

  function drawCreature(ctx, kind, x, y, r, t, silhouette) {
    var cr = CREATURES.filter(function (q) { return q.id === kind; })[0] || CREATURES[0];
    var c = silhouette ? '#2a3050' : cr.color;
    var dark = silhouette ? '#2a3050' : '#20243a';
    t = t || 0;
    ctx.save();
    function body(bx, by, br) { circle(ctx, bx, by, br, silhouette ? c : bodyGrad(ctx, bx, by, br, c)); }
    function face(fy, er) {
      if (silhouette) return;
      eyes(ctx, x, fy, er || r * 0.12, r * 0.28, dark);
      blush(ctx, x, fy + r * 0.2, r * 0.12, r * 0.42);
      smile(ctx, x, fy + r * 0.24, r * 0.12, dark);
    }
    switch (kind) {
      case 'zappip': { // round spark mouse: round ears, lightning tuft, blue spark cheeks, plug tail
        ctx.strokeStyle = silhouette ? c : shade(c, -0.3); ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + r * 0.6, y + r * 0.4); ctx.quadraticCurveTo(x + r * 1.05, y + r * 0.5, x + r * 0.95, y + r * 0.05); ctx.stroke();
        circle(ctx, x - r * 0.55, y - r * 0.6, r * 0.32, silhouette ? c : shade(c, -0.1));
        circle(ctx, x + r * 0.55, y - r * 0.6, r * 0.32, silhouette ? c : shade(c, -0.1));
        if (!silhouette) { circle(ctx, x - r * 0.55, y - r * 0.6, r * 0.17, '#fff3b0'); circle(ctx, x + r * 0.55, y - r * 0.6, r * 0.17, '#fff3b0'); }
        body(x, y, r * 0.72);
        ctx.beginPath(); ctx.moveTo(x - r * 0.05, y - r * 0.95); ctx.lineTo(x + r * 0.15, y - r * 0.68); ctx.lineTo(x - r * 0.02, y - r * 0.66); ctx.lineTo(x + r * 0.1, y - r * 0.45); ctx.lineTo(x - r * 0.18, y - r * 0.72); ctx.lineTo(x - r * 0.02, y - r * 0.74); ctx.closePath();
        ctx.fillStyle = silhouette ? c : '#ff9f1c'; ctx.fill();
        if (!silhouette) {
          eyes(ctx, x, y - r * 0.12, r * 0.12, r * 0.28);
          circle(ctx, x - r * 0.45, y + r * 0.15, r * 0.12, '#5ac8ff'); circle(ctx, x + r * 0.45, y + r * 0.15, r * 0.12, '#5ac8ff');
          smile(ctx, x, y + r * 0.12, r * 0.12);
        }
        break;
      }
      case 'embrix': { // ember gecko: candle-flame crest on its head, curly tail, spotted belly
        var fl = 1 + Math.sin(t / 90) * 0.12;
        ctx.strokeStyle = silhouette ? c : shade(c, -0.2); ctx.lineWidth = r * 0.18; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + r * 0.45, y + r * 0.5); ctx.quadraticCurveTo(x + r * 0.95, y + r * 0.55, x + r * 0.85, y + r * 0.15);
        ctx.quadraticCurveTo(x + r * 0.75, y - r * 0.05, x + r * 0.62, y + r * 0.12); ctx.stroke();
        ellipse(ctx, x - r * 0.05, y + r * 0.12, r * 0.66, r * 0.64, 0, silhouette ? c : bodyGrad(ctx, x, y, r * 0.7, c));
        if (!silhouette) {
          circle(ctx, x - r * 0.3, y + r * 0.42, r * 0.08, '#ffd86b'); circle(ctx, x + r * 0.05, y + r * 0.5, r * 0.07, '#ffd86b'); circle(ctx, x + r * 0.3, y + r * 0.35, r * 0.06, '#ffd86b');
          // flame crest
          ellipse(ctx, x - r * 0.05, y - r * 0.68 * fl, r * 0.2, r * 0.3 * fl, 0, '#ffb21f');
          ellipse(ctx, x - r * 0.05, y - r * 0.6, r * 0.1, r * 0.16 * fl, 0, '#fff3b0');
        } else ellipse(ctx, x - r * 0.05, y - r * 0.68, r * 0.2, r * 0.3, 0, c);
        circle(ctx, x - r * 0.55, y + r * 0.62, r * 0.15, silhouette ? c : shade(c, -0.2)); circle(ctx, x + r * 0.35, y + r * 0.66, r * 0.15, silhouette ? c : shade(c, -0.2));
        if (!silhouette) { eyes(ctx, x - r * 0.05, y - r * 0.08, r * 0.12, r * 0.27); smile(ctx, x - r * 0.05, y + r * 0.17, r * 0.12); }
        break;
      }
      case 'shellow': { // turtle with bubble shell
        circle(ctx, x - r * 0.6, y + r * 0.55, r * 0.17, silhouette ? c : '#8fe3d9'); circle(ctx, x + r * 0.6, y + r * 0.55, r * 0.17, silhouette ? c : '#8fe3d9');
        ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.85, Math.PI, 0); ctx.closePath(); ctx.fillStyle = silhouette ? c : bodyGrad(ctx, x, y, r * 0.85, '#2a8f9c'); ctx.fill();
        if (!silhouette) {
          circle(ctx, x - r * 0.35, y - r * 0.05, r * 0.16, 'rgba(255,255,255,0.35)');
          circle(ctx, x + r * 0.2, y - r * 0.3, r * 0.12, 'rgba(255,255,255,0.3)');
          circle(ctx, x + r * 0.45, y + r * 0.05, r * 0.09, 'rgba(255,255,255,0.3)');
        }
        circle(ctx, x - r * 0.5, y - r * 0.2, r * 0.42, silhouette ? c : bodyGrad(ctx, x - r * 0.5, y - r * 0.2, r * 0.42, c));
        if (!silhouette) {
          circle(ctx, x - r * 0.62, y - r * 0.28, r * 0.08, '#20243a'); circle(ctx, x - r * 0.36, y - r * 0.28, r * 0.08, '#20243a');
          circle(ctx, x - r * 0.6, y - r * 0.31, r * 0.03, '#fff'); circle(ctx, x - r * 0.34, y - r * 0.31, r * 0.03, '#fff');
          smile(ctx, x - r * 0.49, y - r * 0.07, r * 0.09);
        }
        break;
      }
      case 'budlet': { // sprout with two-leaf hat
        var sway = Math.sin(t / 300) * 0.15;
        ctx.strokeStyle = silhouette ? c : '#3f9e3a'; ctx.lineWidth = r * 0.1;
        ctx.beginPath(); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x, y - r * 0.85); ctx.stroke();
        ellipse(ctx, x - r * 0.25, y - r * 0.95, r * 0.28, r * 0.13, -0.5 + sway, silhouette ? c : '#9be36a');
        ellipse(ctx, x + r * 0.25, y - r * 0.95, r * 0.28, r * 0.13, 0.5 + sway, silhouette ? c : '#7cd65a');
        body(x, y + r * 0.05, r * 0.72);
        if (!silhouette) { ellipse(ctx, x, y + r * 0.45, r * 0.4, r * 0.18, 0, 'rgba(255,255,255,0.18)'); }
        face(y - r * 0.05);
        break;
      }
      case 'wispo': { // ghost puff with wavy tail
        var fy = Math.sin(t / 350) * r * 0.08;
        y += fy;
        ctx.beginPath();
        ctx.arc(x, y - r * 0.1, r * 0.7, Math.PI, 0);
        ctx.lineTo(x + r * 0.7, y + r * 0.45);
        for (var i = 0; i < 4; i++) {
          var x1 = x + r * 0.7 - (i + 0.5) * r * 0.35, x2 = x + r * 0.7 - (i + 1) * r * 0.35;
          ctx.quadraticCurveTo(x1, y + r * (i % 2 ? 0.45 : 0.75), x2, y + r * 0.5);
        }
        ctx.closePath();
        ctx.fillStyle = silhouette ? c : bodyGrad(ctx, x, y, r * 0.8, c);
        if (!silhouette) { ctx.shadowColor = c; ctx.shadowBlur = r * 0.5; }
        ctx.fill();
        ctx.shadowBlur = 0;
        if (!silhouette) {
          ellipse(ctx, x - r * 0.25, y - r * 0.15, r * 0.1, r * 0.15, 0, '#3a2a6b'); ellipse(ctx, x + r * 0.25, y - r * 0.15, r * 0.1, r * 0.15, 0, '#3a2a6b');
          circle(ctx, x - r * 0.22, y - r * 0.2, r * 0.04, '#fff'); circle(ctx, x + r * 0.28, y - r * 0.2, r * 0.04, '#fff');
          ellipse(ctx, x, y + r * 0.1, r * 0.08, r * 0.06, 0, '#3a2a6b');
          blush(ctx, x, y + r * 0.02, r * 0.1, r * 0.42, '#ff9cf0');
        }
        break;
      }
      case 'pebbit': { // pebble pup with floppy stone ears
        ellipse(ctx, x - r * 0.62, y - r * 0.15, r * 0.2, r * 0.38, 0.35, silhouette ? c : shade(c, -0.25));
        ellipse(ctx, x + r * 0.62, y - r * 0.15, r * 0.2, r * 0.38, -0.35, silhouette ? c : shade(c, -0.25));
        ctx.beginPath();
        ctx.moveTo(x - r * 0.6, y - r * 0.45); ctx.lineTo(x - r * 0.2, y - r * 0.75); ctx.lineTo(x + r * 0.35, y - r * 0.7);
        ctx.lineTo(x + r * 0.68, y - r * 0.3); ctx.lineTo(x + r * 0.7, y + r * 0.35); ctx.lineTo(x + r * 0.3, y + r * 0.72);
        ctx.lineTo(x - r * 0.35, y + r * 0.7); ctx.lineTo(x - r * 0.7, y + r * 0.3); ctx.closePath();
        ctx.fillStyle = silhouette ? c : bodyGrad(ctx, x, y, r * 0.75, c); ctx.fill();
        if (!silhouette) {
          ctx.strokeStyle = 'rgba(40,44,60,0.35)'; ctx.lineWidth = r * 0.05;
          ctx.beginPath(); ctx.moveTo(x + r * 0.3, y - r * 0.55); ctx.lineTo(x + r * 0.45, y - r * 0.35); ctx.stroke();
          circle(ctx, x - r * 0.4, y + r * 0.45, r * 0.06, 'rgba(40,44,60,0.3)');
          ellipse(ctx, x, y + r * 0.15, r * 0.12, r * 0.08, 0, '#3a3d4d');
        }
        face(y - r * 0.12);
        break;
      }
      case 'frostail': { // frosty fox kit
        ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.1); ctx.lineTo(x - r * 0.55, y - r * 0.95); ctx.lineTo(x - r * 0.1, y - r * 0.6); ctx.fillStyle = silhouette ? c : shade(c, -0.1); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.1); ctx.lineTo(x + r * 0.55, y - r * 0.95); ctx.lineTo(x + r * 0.1, y - r * 0.6); ctx.fill();
        ellipse(ctx, x + r * 0.7, y + r * 0.45, r * 0.32, r * 0.2, -0.6, silhouette ? c : '#e6faff');
        body(x, y, r * 0.72);
        if (!silhouette) {
          ellipse(ctx, x, y + r * 0.32, r * 0.42, r * 0.28, 0, '#f2fcff');
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.06;
          for (var k = 0; k < 3; k++) {
            var an = k * Math.PI / 3;
            ctx.beginPath(); ctx.moveTo(x - Math.cos(an) * r * 0.14, y - r * 0.5 - Math.sin(an) * r * 0.14);
            ctx.lineTo(x + Math.cos(an) * r * 0.14, y - r * 0.5 + Math.sin(an) * r * 0.14); ctx.stroke();
          }
        }
        face(y - r * 0.1);
        break;
      }
      case 'glimmoth': // moth with star-spot wings
      default: {
        var flap = 1 - Math.abs(Math.sin(t / 160)) * 0.25;
        var wing = silhouette ? c : shade(c, 0.15);
        ellipse(ctx, x - r * 0.52 * flap, y - r * 0.2, r * 0.48 * flap, r * 0.55, -0.4, wing);
        ellipse(ctx, x + r * 0.52 * flap, y - r * 0.2, r * 0.48 * flap, r * 0.55, 0.4, wing);
        ellipse(ctx, x - r * 0.45 * flap, y + r * 0.35, r * 0.3 * flap, r * 0.3, 0.3, silhouette ? c : shade(c, -0.05));
        ellipse(ctx, x + r * 0.45 * flap, y + r * 0.35, r * 0.3 * flap, r * 0.3, -0.3, silhouette ? c : shade(c, -0.05));
        if (!silhouette) {
          circle(ctx, x - r * 0.55 * flap, y - r * 0.25, r * 0.12, '#fff6a8'); circle(ctx, x + r * 0.55 * flap, y - r * 0.25, r * 0.12, '#fff6a8');
        }
        ellipse(ctx, x, y + r * 0.1, r * 0.3, r * 0.55, 0, silhouette ? c : bodyGrad(ctx, x, y, r * 0.5, '#f6d7ff'));
        ctx.strokeStyle = silhouette ? c : '#c76bb0'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - r * 0.1, y - r * 0.4); ctx.quadraticCurveTo(x - r * 0.25, y - r * 0.85, x - r * 0.4, y - r * 0.8);
        ctx.moveTo(x + r * 0.1, y - r * 0.4); ctx.quadraticCurveTo(x + r * 0.25, y - r * 0.85, x + r * 0.4, y - r * 0.8); ctx.stroke();
        if (!silhouette) { eyes(ctx, x, y - r * 0.05, r * 0.08, r * 0.13); blush(ctx, x, y + r * 0.12, r * 0.07, r * 0.2); }
        break;
      }
    }
    ctx.restore();
  }

  function drawWheel(ctx, S, angle, opts) {
    opts = opts || {};
    var cx = S / 2, cy = S / 2, R = S / 2 - S * 0.045;
    ctx.clearRect(0, 0, S, S);
    // rim
    circle(ctx, cx, cy, R + S * 0.04, '#1b1f3d');
    var lights = 20, tt = opts.time || 0;
    for (var l = 0; l < lights; l++) {
      var la = l / lights * TAU;
      var on = ((l + Math.floor(tt / 150)) % 2) === 0;
      circle(ctx, cx + Math.cos(la) * (R + S * 0.022), cy + Math.sin(la) * (R + S * 0.022), S * 0.011, on ? '#fff3b0' : '#6b5d3a');
    }
    for (var i = 0; i < WHEEL_N; i++) {
      var a0 = -Math.PI / 2 + angle + i * WHEEL_SEG, a1 = a0 + WHEEL_SEG;
      var hue = (i * 36 + 350) % 360;
      var gr = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
      gr.addColorStop(0, 'hsl(' + hue + ',90%,72%)');
      gr.addColorStop(1, 'hsl(' + hue + ',85%,52%)');
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
      ctx.fillStyle = gr; ctx.fill();
      if (opts.highlight === i + 1) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.25 * Math.sin(tt / 90)) + ')'; ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, S * 0.006); ctx.stroke();
      // number, reading outward
      var mid = a0 + WHEEL_SEG / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * R * 0.7, cy + Math.sin(mid) * R * 0.7);
      ctx.rotate(mid + Math.PI / 2);
      ctx.font = '900 ' + Math.round(R * 0.2) + 'px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, R * 0.035); ctx.strokeStyle = 'rgba(20,20,50,0.55)';
      ctx.strokeText(String(i + 1), 0, 0);
      ctx.fillStyle = '#ffffff'; ctx.fillText(String(i + 1), 0, 0);
      ctx.restore();
    }
    // hub
    var hg = ctx.createRadialGradient(cx - R * 0.05, cy - R * 0.05, R * 0.02, cx, cy, R * 0.2);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#c9b8ff');
    circle(ctx, cx, cy, R * 0.18, hg);
    ctx.fillStyle = '#4b3b8f'; ctx.font = '900 ' + Math.round(R * 0.17) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×', cx, cy + R * 0.01);
  }

  api.drawCreature = drawCreature;
  api.drawAnimal = drawAnimal;
  api.drawWheel = drawWheel;

  // ===================================================================
  //  Browser UI
  // ===================================================================
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function initUI() {
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $('board'), ctx = canvas.getContext('2d');
    var boardWrap = $('boardWrap'), boardInner = $('boardInner');
    var overlay = $('overlay'), overlayCard = $('overlayCard');
    var elScore = $('score'), elLevel = $('level'), elRopes = $('ropes'), elHigh = $('high');
    var wordEl = $('word'), trayEl = $('tray'), collCount = $('collCount');
    var btnStart = $('btnStart'), btnPause = $('btnPause'), btnRestart = $('btnRestart');
    var wheelModal = $('wheelModal'), wheelCanvas = $('wheel'), wctx = wheelCanvas.getContext('2d');
    var wheelSub = $('wheelSub'), wheelPop = $('wheelPop'), btnSpin = $('btnSpin'), wheelHint = $('wheelHint');

    var storage = {
      get: function (k) { try { return localStorage.getItem('snackLetters.' + k); } catch (e) { return null; } },
      set: function (k, v) { try { localStorage.setItem('snackLetters.' + k, v); } catch (e) { /* ignore */ } }
    };
    var game = createSnackGame({ storage: storage });
    root.snackGame = game;

    var cell = 24, bw = 360, bh = 480, dpr = 1, wheelS = 260;
    var particles = [], floaters = [], rings = [];
    var now = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      var aw = boardWrap.clientWidth, ah = boardWrap.clientHeight;
      cell = Math.max(8, Math.floor(Math.min(aw / COLS, ah / ROWS)));
      bw = cell * COLS; bh = cell * ROWS;
      boardInner.style.width = bw + 'px'; boardInner.style.height = bh + 'px';
      canvas.style.width = bw + 'px'; canvas.style.height = bh + 'px';
      canvas.width = Math.round(bw * dpr); canvas.height = Math.round(bh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      wheelS = Math.round(wheelCanvas.clientWidth || 260);
      wheelCanvas.width = Math.round(wheelS * dpr); wheelCanvas.height = Math.round(wheelS * dpr);
      wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawTray(true);
    }
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(boardWrap);

    function enableTouch() { document.body.classList.add('touch'); requestAnimationFrame(resize); }
    if (('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) enableTouch();

    // ---------- collection tray ----------
    var slots = {};
    CREATURES.forEach(function (c) {
      var s = document.createElement('div');
      s.className = 'slot'; s.dataset.id = c.id; s.title = c.name + ': ' + c.desc;
      s.style.setProperty('--c', c.color);
      s.innerHTML = '<canvas></canvas><span class="name">' + c.name + '</span><span class="cnt"></span>';
      trayEl.appendChild(s);
      slots[c.id] = { el: s, canvas: s.querySelector('canvas'), cnt: s.querySelector('.cnt'), last: null };
    });
    function drawTray(force) {
      CREATURES.forEach(function (c) {
        var sl = slots[c.id], n = game.collection[c.id] || 0;
        var w = sl.canvas.clientWidth || 28;
        var sig = n + '|' + w + '|' + dpr;
        if (!force && sl.last === sig) return;
        sl.last = sig;
        sl.canvas.width = Math.round(w * dpr); sl.canvas.height = Math.round(w * dpr);
        var cc = sl.canvas.getContext('2d');
        cc.setTransform(dpr, 0, 0, dpr, 0, 0);
        cc.clearRect(0, 0, w, w);
        drawCreature(cc, c.id, w / 2, w / 2 + w * 0.04, w * 0.42, 0, !n);
        sl.cnt.textContent = n ? '×' + n : '';
        sl.el.classList.toggle('caught', !!n);
      });
      collCount.textContent = game.uniqueCaught() + '/' + CREATURES.length;
    }
    function creatureImg(id, size) {
      var cv = document.createElement('canvas'); cv.width = size * 2; cv.height = size * 2;
      var cc = cv.getContext('2d'); cc.scale(2, 2);
      drawCreature(cc, id, size / 2, size / 2, size * 0.42, 0, false);
      return cv.toDataURL();
    }

    // ---------- overlays ----------
    function showOverlay(html) { overlayCard.innerHTML = html; overlay.classList.add('show'); }
    function hideOverlay() { overlay.classList.remove('show'); }
    function startOverlay() {
      showOverlay('<h2>Snack and Letters</h2>' +
        '<p>Guide the snake to munch cute animals. Eat the <b>letters</b> in order to spell the word, grab <b>ropes</b> to spin the bonus wheel, and late in the game catch rare creatures for your collection.</p>' +
        '<p class="keys"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> / WASD steer · <kbd>Space</kbd> spin · <kbd>P</kbd> pause</p>' +
        '<button type="button" class="primary" data-ov="start">Start game</button>');
    }
    function gameOverOverlay(d) {
      var ids = CREATURES.filter(function (c) { return game.collection[c.id]; });
      var coll = ids.length
        ? '<div class="go-coll">' + ids.map(function (c) {
          return '<figure><img alt="" src="' + creatureImg(c.id, 40) + '"><figcaption>' + c.name + ' ×' + game.collection[c.id] + '</figcaption></figure>';
        }).join('') + '</div>'
        : '<p class="muted">No creatures caught this time. They show up after ' + LATE_ROPES + ' ropes or at level ' + LATE_LEVEL + '.</p>';
      showOverlay('<h2>Game over</h2>' +
        '<div class="big">' + game.score.toLocaleString() + '</div>' +
        (game.newRecord ? '<p class="record">New high score!</p>' : '<p>Best: ' + game.high.toLocaleString() + '</p>') +
        '<p>Level ' + game.level + ' · ' + game.wordsDone + ' words · ' + game.ropes + ' ropes</p>' +
        '<h3>Collection: ' + game.caughtTotal + ' caught (' + game.uniqueCaught() + '/' + CREATURES.length + ' kinds)</h3>' + coll +
        '<p class="' + (game.newCollectionRecord ? 'record' : 'muted') + '">' +
        (game.newCollectionRecord ? 'New best collection: ' + game.bestCollection + '!' : 'Best collection: ' + game.bestCollection) + '</p>' +
        '<button type="button" class="primary" data-ov="start">Play again</button>');
    }
    function pauseOverlay() { showOverlay('<h2>Paused</h2><p>Press <kbd>P</kbd> or tap Resume.</p><button type="button" class="primary" data-ov="resume">Resume</button>'); }
    overlay.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ov]'); if (!b) return;
      if (b.dataset.ov === 'start') startGame(); else setPaused(false);
    });

    function active() { return game.phase === 'playing' || game.phase === 'wheel'; }
    function startGame() {
      particles = []; floaters = []; rings = [];
      hideWheel();
      game.start(); hideOverlay(); drawTray(true); syncUI(true);
    }
    function setPaused(p) {
      if (game.phase !== 'playing') return;
      game.togglePause(p);
      if (game.paused) pauseOverlay(); else hideOverlay();
      syncUI(true);
    }

    btnStart.addEventListener('click', function () { if (game.paused) setPaused(false); else if (!active()) startGame(); btnStart.blur(); });
    btnPause.addEventListener('click', function () { setPaused(!game.paused); btnPause.blur(); });
    btnRestart.addEventListener('click', function () { startGame(); btnRestart.blur(); });
    btnSpin.addEventListener('click', function () { game.spin(); btnSpin.blur(); });
    wheelCanvas.addEventListener('click', function () { game.spin(); });

    // ---------- keyboard ----------
    var DIRS = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1], A: [-1, 0], D: [1, 0], W: [0, -1], S: [0, 1]
    };
    window.addEventListener('keydown', function (e) {
      var k = e.key;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^Arrow/.test(k) || k === ' ' || k === 'Spacebar') e.preventDefault();
      if (game.phase === 'wheel') {
        if ((k === ' ' || k === 'Spacebar' || k === 'Enter') && !e.repeat) { e.preventDefault(); game.spin(); }
        return;
      }
      if (k === 'p' || k === 'P' || k === 'Escape') { e.preventDefault(); setPaused(!game.paused); return; }
      if ((k === 'Enter' || k === ' ') && !active()) { e.preventDefault(); startGame(); return; }
      if (DIRS[k]) { e.preventDefault(); game.setDir(DIRS[k][0], DIRS[k][1]); }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && game.phase === 'playing' && !game.paused) setPaused(true); });

    // ---------- touch: d-pad and swipe ----------
    document.querySelectorAll('#touchControls button').forEach(function (b) {
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        b.classList.add('pressed');
        var a = b.dataset.action;
        if (a === 'pause') { setPaused(!game.paused); return; }
        if (game.phase === 'wheel') { game.spin(); return; }
        var d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[a];
        if (d) game.setDir(d[0], d[1]);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove('pressed'); }); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    var sw = null;
    boardInner.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || game.phase !== 'playing') return;
      if (e.target.closest('.overlay.show')) return;
      e.preventDefault();
      sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { boardInner.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    });
    boardInner.addEventListener('pointermove', function (e) {
      if (!sw || e.pointerId !== sw.id) return;
      var dx = e.clientX - sw.x, dy = e.clientY - sw.y, th = Math.max(18, cell * 0.8);
      if (Math.abs(dx) < th && Math.abs(dy) < th) return;
      if (Math.abs(dx) > Math.abs(dy)) game.setDir(dx > 0 ? 1 : -1, 0); else game.setDir(0, dy > 0 ? 1 : -1);
      sw.x = e.clientX; sw.y = e.clientY;   // allow chained swipes in one drag
    });
    boardInner.addEventListener('pointerup', function () { sw = null; });
    boardInner.addEventListener('pointercancel', function () { sw = null; });

    // ---------- wheel modal ----------
    function showWheel(base) {
      wheelSub.innerHTML = 'Rope worth <b>' + base.toLocaleString() + '</b> pts. Spin for a ×1–×10 multiplier!';
      wheelPop.className = 'wheel-pop'; wheelPop.textContent = '';
      btnSpin.disabled = false; btnSpin.textContent = 'Spin';
      wheelModal.classList.add('show');
      requestAnimationFrame(resize);
    }
    function hideWheel() { wheelModal.classList.remove('show'); }

    // ---------- events ----------
    function cellCenter(x, y) { return { x: (x + 0.5) * cell, y: (y + 0.5) * cell }; }
    function burst(x, y, color, n, speed) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, s = (0.4 + Math.random()) * (speed || 1);
        particles.push({ x: x, y: y, vx: Math.cos(a) * s * cell * 0.08, vy: Math.sin(a) * s * cell * 0.08, life: 0, max: 500 + Math.random() * 500, color: color, size: cell * (0.06 + Math.random() * 0.08) });
      }
    }
    function floater(text, x, y, color, sub) { floaters.push({ text: text, sub: sub, x: x, y: y, life: 0, max: 1100, color: color || '#fff' }); }
    function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

    function flyToTray(cr) {
      var slot = slots[cr.kind]; if (!slot) return;
      var br = canvas.getBoundingClientRect(), sr = slot.canvas.getBoundingClientRect();
      var size = Math.max(28, cell * 1.4);
      var img = document.createElement('img');
      img.className = 'flyer'; img.alt = '';
      img.src = creatureImg(cr.kind, 64);
      img.style.width = img.style.height = size + 'px';
      img.style.left = (br.left + (cr.x + 0.5) * cell - size / 2) + 'px';
      img.style.top = (br.top + (cr.y + 0.5) * cell - size / 2) + 'px';
      document.body.appendChild(img);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          img.style.transform = 'translate(' + (sr.left + sr.width / 2 - (br.left + (cr.x + 0.5) * cell)) + 'px,' +
            (sr.top + sr.height / 2 - (br.top + (cr.y + 0.5) * cell)) + 'px) scale(' + (sr.width / size) + ') rotate(360deg)';
          img.style.opacity = '0.85';
        });
      });
      setTimeout(function () { img.remove(); drawTray(true); bump(slot.el); slot.el.classList.add('pop'); setTimeout(function () { slot.el.classList.remove('pop'); }, 600); }, 780);
    }

    game.onEvent = function (type, d) {
      var p;
      if (type === 'eat') {
        p = cellCenter(d.animal.x, d.animal.y);
        burst(p.x, p.y, d.matched ? '#ffd23f' : '#ffffff', d.matched ? 12 : 6);
        floater('+' + d.points, p.x, p.y, d.matched ? '#ffd23f' : '#ffffff', d.matched ? d.animal.letter : null);
        renderWord(true);
        bump(elScore);
      } else if (type === 'word') {
        floater('+' + d.bonus.toLocaleString(), bw / 2, bh * 0.4, '#7dffb0', d.word + '!');
        wordEl.classList.add('done'); setTimeout(function () { wordEl.classList.remove('done'); }, 700);
      } else if (type === 'levelup') {
        floater('Level ' + d.level, bw / 2, bh * 0.3, '#fde68a', game.lateGame() ? 'Creatures are out!' : 'Faster!');
        bump(elLevel);
      } else if (type === 'rope') {
        d.rope.cells.forEach(function (c) { var q = cellCenter(c.x, c.y); burst(q.x, q.y, '#e2b26b', 8); });
        bump(elRopes);
        showWheel(d.base);
      } else if (type === 'spin') {
        btnSpin.disabled = true; btnSpin.textContent = d.auto ? 'Auto-spinning…' : 'Spinning…';
      } else if (type === 'wheelResult') {
        wheelPop.innerHTML = '<span class="mult">×' + d.result + '</span><span class="pts">+' + d.points.toLocaleString() + '</span>';
        wheelPop.className = 'wheel-pop show';
        btnSpin.textContent = '×' + d.result + '!';
        bump(elScore);
      } else if (type === 'countdown') {
        wheelPop.innerHTML = '<span class="count">' + d.count + '</span>';
        wheelPop.className = 'wheel-pop show tick';
        void wheelPop.offsetWidth; wheelPop.className = 'wheel-pop show tick go';
        btnSpin.textContent = 'Get ready…';
      } else if (type === 'resume') {
        hideWheel();
      } else if (type === 'creatureSpawn') {
        p = cellCenter(d.creature.x, d.creature.y);
        rings.push({ x: p.x, y: p.y, life: 0, max: 700, color: '#ffffff' });
      } else if (type === 'catch') {
        p = cellCenter(d.creature.x, d.creature.y);
        var cr = CREATURES.filter(function (q) { return q.id === d.creature.kind; })[0];
        burst(p.x, p.y, cr.color, 22, 1.4);
        rings.push({ x: p.x, y: p.y, life: 0, max: 600, color: cr.color });
        floater('+' + d.points.toLocaleString(), p.x, p.y, cr.color, (d.first ? 'New! ' : 'Caught ') + cr.name);
        flyToTray(d.creature);
      } else if (type === 'gameover') {
        var h = game.snake[0];
        if (h) { p = cellCenter(h.x, h.y); burst(p.x, p.y, '#ff6b8b', 20, 1.2); }
        setTimeout(function () { gameOverOverlay(d); syncUI(true); }, 500);
      }
    };

    // ---------- word panel ----------
    var lastWord = '';
    function renderWord(force) {
      var sig = game.word + game.wordIdx;
      if (!force && sig === lastWord) return;
      lastWord = sig;
      wordEl.innerHTML = game.word.split('').map(function (ch, i) {
        return '<span class="' + (i < game.wordIdx ? 'got' : i === game.wordIdx ? 'next' : '') + '">' + ch + '</span>';
      }).join('');
    }

    // ---------- board rendering ----------
    function drawBackground() {
      ctx.fillStyle = '#0d1428';
      ctx.fillRect(0, 0, bw, bh);
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        if ((x + y) % 2) { ctx.fillStyle = 'rgba(120,160,255,0.035)'; ctx.fillRect(x * cell, y * cell, cell, cell); }
      }
    }

    function drawRope(r) {
      var age = game.time - r.born, left = r.life - age;
      var alpha = left < 3000 ? 0.45 + 0.55 * Math.abs(Math.sin(now / 120)) : 1;
      var a = r.cells[0], b = r.cells[r.cells.length - 1];
      var x0 = (a.x + 0.15) * cell, y0 = (a.y + 0.5) * cell, x1 = (b.x + 0.85) * cell, y1 = (b.y + 0.5) * cell;
      if (!r.horiz) { x0 = (a.x + 0.5) * cell; y0 = (a.y + 0.15) * cell; x1 = (b.x + 0.5) * cell; y1 = (b.y + 0.85) * cell; }
      ctx.save();
      ctx.globalAlpha = alpha;
      // glow
      ctx.shadowColor = 'rgba(255,214,140,0.8)'; ctx.shadowBlur = cell * 0.5 * (0.6 + 0.4 * Math.sin(now / 250));
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#a8743a'; ctx.lineWidth = cell * 0.32;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#e8b878'; ctx.lineWidth = cell * 0.2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      // braid twists
      ctx.strokeStyle = '#8a5a28'; ctx.lineWidth = Math.max(1, cell * 0.06);
      var len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / (cell * 0.28));
      for (var i = 1; i < n; i++) {
        var t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t, o = cell * 0.12;
        ctx.beginPath();
        if (r.horiz) { ctx.moveTo(px - o * 0.6, py - o); ctx.lineTo(px + o * 0.6, py + o); }
        else { ctx.moveTo(px - o, py - o * 0.6); ctx.lineTo(px + o, py + o * 0.6); }
        ctx.stroke();
      }
      // knots on the ends
      circle(ctx, x0, y0, cell * 0.2, '#c48a4a'); circle(ctx, x1, y1, cell * 0.2, '#c48a4a');
      ctx.restore();
    }

    function drawSnake() {
      var s = game.snake, ps = game.prevSnake;
      if (!s.length) return;
      var prog = game.phase === 'playing' && !game.paused ? Math.min(1, game.tickT / game.interval()) : 1;
      if (game.phase !== 'playing') prog = 1;
      var pts = s.map(function (seg, i) {
        var p = ps[i] || ps[ps.length - 1] || seg;
        return { x: (p.x + (seg.x - p.x) * prog + 0.5) * cell, y: (p.y + (seg.y - p.y) * prog + 0.5) * cell };
      });
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // body, drawn tail to head with a gradient of widths/colors
      for (var i = pts.length - 1; i > 0; i--) {
        var t = i / Math.max(1, pts.length - 1);
        ctx.strokeStyle = 'hsl(' + (150 - t * 40) + ',70%,' + (52 - t * 10) + '%)';
        ctx.lineWidth = cell * (0.78 - t * 0.22);
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
      }
      // belly spots
      for (i = 1; i < pts.length; i += 2) circle(ctx, pts[i].x, pts[i].y, cell * 0.12, 'rgba(255,255,255,0.18)');
      // head
      var h = pts[0], d = game.dir;
      var hg = ctx.createRadialGradient(h.x - cell * 0.15, h.y - cell * 0.15, cell * 0.05, h.x, h.y, cell * 0.55);
      hg.addColorStop(0, '#9ff2b8'); hg.addColorStop(1, '#2fbf71');
      circle(ctx, h.x, h.y, cell * 0.47, hg);
      // tongue flick
      if (Math.sin(now / 160) > 0.4) {
        ctx.strokeStyle = '#ff4d7a'; ctx.lineWidth = Math.max(1, cell * 0.07);
        var tx = h.x + d.x * cell * 0.5, ty = h.y + d.y * cell * 0.5;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + d.x * cell * 0.22, ty + d.y * cell * 0.22); ctx.stroke();
      }
      var ex = -d.y, ey = d.x;
      [-1, 1].forEach(function (sgn) {
        var x = h.x + d.x * cell * 0.12 + ex * sgn * cell * 0.2, y = h.y + d.y * cell * 0.12 + ey * sgn * cell * 0.2;
        circle(ctx, x, y, cell * 0.12, '#ffffff'); circle(ctx, x + d.x * cell * 0.03, y + d.y * cell * 0.03, cell * 0.065, '#1b1f3a');
      });
      ctx.restore();
    }

    function drawItems() {
      var need = game.word[game.wordIdx];
      if (game.rope) drawRope(game.rope);
      game.animals.forEach(function (a) {
        var p = cellCenter(a.x, a.y), r = cell * 0.5;
        var age = now - (a._shown || (a._shown = now)), sc = Math.min(1, age / 220);
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.translate(-p.x, -p.y);
        if (a.letter === need) { circle(ctx, p.x, p.y, r * (0.98 + 0.06 * Math.sin(now / 200)), 'rgba(255,210,63,0.22)'); }
        drawAnimal(ctx, a.kind, p.x, p.y - r * 0.06, r * 1.0, now);
        // letter tag
        var tx = p.x + r * 0.55, ty = p.y + r * 0.55, tr = r * 0.44;
        circle(ctx, tx, ty, tr, a.letter === need ? '#ffd23f' : '#ffffff');
        ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = '#20243a'; ctx.beginPath(); ctx.arc(tx, ty, tr, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#20243a'; ctx.font = '900 ' + Math.round(tr * 1.35) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(a.letter, tx, ty + tr * 0.06);
        ctx.restore();
      });
      if (game.creature) {
        var c = game.creature, p = cellCenter(c.x, c.y);
        var cr = CREATURES.filter(function (q) { return q.id === c.kind; })[0];
        var left = c.life - (game.time - c.born);
        ctx.save();
        if (left < 3000) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(now / 110));
        var pulse = 0.5 + 0.5 * Math.sin(now / 220);
        var gl = ctx.createRadialGradient(p.x, p.y, cell * 0.1, p.x, p.y, cell * 0.8);
        gl.addColorStop(0, 'rgba(255,255,255,' + (0.25 + pulse * 0.2) + ')'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        circle(ctx, p.x, p.y, cell * 0.8, gl);
        ctx.strokeStyle = cr.color; ctx.lineWidth = Math.max(1, cell * 0.06); ctx.setLineDash([cell * 0.12, cell * 0.1]);
        ctx.lineDashOffset = -now / 40;
        ctx.beginPath(); ctx.arc(p.x, p.y, cell * 0.66, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        drawCreature(ctx, c.kind, p.x, p.y + Math.sin(now / 300) * cell * 0.05, cell * 0.56, now, false);
        // sparkles
        for (var i = 0; i < 3; i++) {
          var an = now / 600 + i * TAU / 3;
          circle(ctx, p.x + Math.cos(an) * cell * 0.72, p.y + Math.sin(an) * cell * 0.72, cell * 0.06, '#fff6c0');
        }
        ctx.restore();
      }
    }

    function drawEffects(dt) {
      for (var i = rings.length - 1; i >= 0; i--) {
        var r = rings[i]; r.life += dt; if (r.life >= r.max) { rings.splice(i, 1); continue; }
        var t = r.life / r.max;
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(1, cell * 0.12 * (1 - t));
        ctx.beginPath(); ctx.arc(r.x, r.y, cell * (0.4 + t * 1.6), 0, TAU); ctx.stroke();
      }
      for (i = particles.length - 1; i >= 0; i--) {
        var q = particles[i]; q.life += dt; if (q.life >= q.max) { particles.splice(i, 1); continue; }
        var k = dt / 16.67; q.x += q.vx * k; q.y += q.vy * k; q.vy += cell * 0.004 * k;
        ctx.globalAlpha = 1 - q.life / q.max; circle(ctx, q.x, q.y, q.size, q.color);
      }
      ctx.globalAlpha = 1;
      for (i = floaters.length - 1; i >= 0; i--) {
        var f = floaters[i]; f.life += dt; if (f.life >= f.max) { floaters.splice(i, 1); continue; }
        var tt = f.life / f.max, y = f.y - tt * cell * 1.8;
        ctx.globalAlpha = tt < 0.12 ? tt / 0.12 : 1 - Math.max(0, (tt - 0.6) / 0.4);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var fx = Math.max(cell * 2, Math.min(bw - cell * 2, f.x));
        ctx.font = '900 ' + Math.round(cell * 0.75) + 'px system-ui, sans-serif';
        ctx.lineWidth = Math.max(2, cell * 0.12); ctx.strokeStyle = 'rgba(10,12,30,0.85)';
        ctx.strokeText(f.text, fx, y); ctx.fillStyle = f.color; ctx.fillText(f.text, fx, y);
        if (f.sub) {
          ctx.font = '800 ' + Math.round(cell * 0.5) + 'px system-ui, sans-serif';
          ctx.strokeText(f.sub, fx, y + cell * 0.65); ctx.fillStyle = '#ffffff'; ctx.fillText(f.sub, fx, y + cell * 0.65);
        }
      }
      ctx.globalAlpha = 1;
    }

    function render(dt) {
      drawBackground();
      drawItems();
      drawSnake();
      drawEffects(dt);
      if (game.phase === 'wheel' && game.wheel) {
        var w = game.wheel;
        drawWheel(wctx, wheelS, w.angle, { time: now, highlight: w.state === 'result' || w.state === 'countdown' ? w.landed : 0 });
        if (w.state === 'ready') {
          var left = Math.max(0, Math.ceil((AUTO_SPIN - w.idleT) / 1000));
          wheelHint.textContent = 'Tap Spin or press Space / Enter · auto-spin in ' + left + 's';
        } else if (w.state === 'spinning') wheelHint.textContent = 'Round and round…';
        else wheelHint.textContent = 'Rope bonus ×' + w.result + '. Play resumes after the countdown.';
      }
    }

    // ---------- DOM sync ----------
    var last = {};
    function setText(el, key, v) { if (last[key] !== v) { el.textContent = v; last[key] = v; } }
    function syncUI(force) {
      if (force) { last = {}; renderWord(true); }
      setText(elScore, 'score', game.score.toLocaleString());
      setText(elLevel, 'level', String(game.level));
      setText(elRopes, 'ropes', String(game.ropes));
      setText(elHigh, 'high', Math.max(game.high, game.score).toLocaleString());
      renderWord(false);
      drawTray(false);
      var st = game.phase === 'playing' ? (game.paused ? 'paused' : 'run') : game.phase;
      if (last.st !== st) {
        last.st = st;
        btnStart.textContent = st === 'paused' ? 'Resume' : 'Start';
        btnStart.disabled = st === 'run' || st === 'wheel';
        btnPause.disabled = game.phase !== 'playing';
        btnPause.textContent = st === 'paused' ? 'Resume' : 'Pause';
        btnRestart.disabled = game.phase === 'idle';
        document.body.classList.toggle('late', game.lateGame());
      }
      if (last.late !== game.lateGame()) { last.late = game.lateGame(); document.body.classList.toggle('late', last.late); }
    }

    var prev = performance.now();
    function frame(t) {
      var dt = Math.min(100, Math.max(0, t - prev)); prev = t; now = t;
      if (!game.paused) game.update(dt);
      render(game.paused ? 0 : dt);
      syncUI(false);
      requestAnimationFrame(frame);
    }

    resize();
    renderWord(true);
    startOverlay();
    syncUI(true);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
  else initUI();
})(typeof window !== 'undefined' ? window : globalThis);
