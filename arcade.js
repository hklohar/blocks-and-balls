/* Arcade tab switcher for Blocks & Balls and Doodle Wheel.
 * Only the active game receives input; switching pauses the other one.
 * Copyright (c) 2026 Harish Lohar. All rights reserved. */
(function (root) {
  'use strict';
  var GAMES = {
    blocks: { panel: 'app', tab: 'tabBlocks', ui: 'blocksUI', title: 'Blocks & Balls · Arcade' },
    doodle: { panel: 'doodleApp', tab: 'tabDoodle', ui: 'doodleUI', title: 'Doodle Wheel · Arcade' }
  };
  var KEY = 'arcade-tab';
  var arcade = root.arcade = { current: null, select: select };

  function select(id, opts) {
    if (!GAMES[id]) id = 'blocks';
    if (arcade.current === id) return;
    var old = arcade.current && GAMES[arcade.current];
    if (old && root[old.ui]) root[old.ui].pause();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    Object.keys(GAMES).forEach(function (k) {
      var g = GAMES[k], on = k === id;
      document.getElementById(g.panel).hidden = !on;
      var t = document.getElementById(g.tab);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.classList.toggle('active', on);
      t.tabIndex = on ? 0 : -1;
    });
    arcade.current = id;
    document.title = GAMES[id].title;
    document.body.dataset.game = id; // lets the Doodle Wheel theme style the page only on its tab
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var th = id === 'doodle' && root.DoodleWheel && root.DoodleWheel.THEMES && root.doodleUI && root.DoodleWheel.THEMES[root.doodleUI.theme()];
      meta.setAttribute('content', th ? th.meta : '#0a0e1c');
    }
    try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    if (!(opts && opts.initial) && root.history && history.replaceState) history.replaceState(null, '', '#' + id);
    var ui = root[GAMES[id].ui];
    if (ui) requestAnimationFrame(function () { ui.resize(); });
  }

  var initial = (location.hash || '').replace('#', '');
  if (!GAMES[initial]) { try { initial = localStorage.getItem(KEY); } catch (e) { initial = null; } }
  select(GAMES[initial] ? initial : 'blocks', { initial: true });

  document.querySelectorAll('.arcade-tab').forEach(function (t) {
    t.addEventListener('click', function () { select(t.dataset.game); t.blur(); });
  });
  root.addEventListener('hashchange', function () {
    var h = location.hash.replace('#', '');
    if (GAMES[h]) select(h);
  });
})(window);
