# Blocks & Balls Arcade

Two small browser games on one page, in plain HTML, CSS and JavaScript with no build step or dependencies. Use the tabs at the top to switch games; only the active game takes input, and switching pauses the other one.

**Play:** https://hklohar.github.io/blocks-and-balls/ (Doodle Wheel: https://hklohar.github.io/blocks-and-balls/#doodle)

## Blocks & Balls (`game.js`)
A Tetris-like game where some pieces are glossy balls that roll off ledges and settle like marbles.
- Modes: Classic, Balls, Mixed (~50% balls), Alternating (waves of 2)
- Switch (C) turns the falling piece between block and ball form: 5 charges, +1 every 2 lines and +1 per level-up
- Level up every 6 lines; gravity speeds up from 800 ms/row at level 1 to about 100 ms by level 10 (50 ms floor). From level 5, some balls are a rolling variant (white swirl) that rolls further
- Keyboard: ←/→ move, ↑/Space rotate, ↓ soft drop, Shift/Enter hard drop, P pause
- Touch: on-screen buttons plus tap/drag/flick gestures

## Doodle Wheel (`doodle.js`)
A doodle-style snakes-and-ladders board game where a 1-10 spin wheel replaces the dice and ropes are the ladders.
- 10x10 board numbered 1-100, snaking up from the bottom-left. Tap Spin (or the board), or press Space/Enter; the wheel lands on a random 1-10 and your token hops square by square. You need the exact number to land on 100; overshoot and you bounce back.
- 8 slide-down hazards take you from head to tail; 8 braided ropes let you climb from the bottom to the top (bonus points).
- Every game has a new hazard animal, never the same one twice in a row (remembered across visits): Snake, Crocodile, Octopus, Dragon, Glow Eel, Caterpillar, Giraffe or Elephant. Each is drawn as a long cute body, neck, tentacle or trunk over the same squares and has its own slide effect (croc chomp, tentacle wiggle and ink, dragon flames, eel zaps, inching caterpillar, giraffe sway, trunk water spray). A 'This round' badge, the move log and the winner screen all name it.
- Cute animals (🐰🐱🐶🐥🐼🐹🦊🐨) sit on some squares: befriend them for points, and some give a perk (+2 squares or a free re-spin).
- Squares 70-99 hold 8 original collectible creatures (Zappip, Budlet, Pebbit, Embrix, Shellow, Wispo, Frostail, Glimmoth). Land on or pass through one to catch it for your Collection tray.
- 1-4 players, each Human or CPU (default: you vs 1 CPU), pass-and-play turns with a turn indicator, and a short move log.
- Every seat gets a fun random name (like 'Bouncy Otter'), so no typing is needed. Edit a name or re-roll it (🔄) on the setup screen, or tap a scoreboard chip to rename mid-game. Edited names are remembered per seat; the others get fresh names each new game.
- The first to land exactly on 100 wins, with confetti and a stats table (spins, snakes, ropes, animals, creatures). High score, best collection and lifetime stats are saved in the browser.
- New Game, Restart, Pause (P/Esc) and Speed (1x/2x/4x, or F).
- Three board themes via the swatches next to the title: Mint Meadow (default), Sunset Pop and Ocean Breeze. Each has its own palette, page background and board pattern. Your pick is remembered, and switching redraws the board without touching the game.

Open `index.html` directly or serve the folder. `arcade.js` handles the tabs.

---

Copyright (c) 2026 Harish Lohar <hklohar@gmail.com>. All rights reserved.
