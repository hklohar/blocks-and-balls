# Blocks & Balls Arcade

Two small browser games on one page, in plain HTML, CSS and JavaScript with no build step or dependencies. Use the tabs at the top to switch games; only the active game takes input, and switching pauses the other one.

**Play:** https://hklohar.github.io/blocks-and-balls/ (Doodle Wheel: https://hklohar.github.io/blocks-and-balls/#doodle)

## Blocks & Balls (`game.js`)
A Tetris-like game where some pieces are glossy balls that roll off ledges and settle like marbles.
- Modes: Classic, Balls, Mixed (~30% balls), Alternating (waves of 4)
- Switch (C) turns the falling piece between block and ball form (limited charges)
- Keyboard: ←/→ move, ↑/Space rotate, ↓ soft drop, Shift/Enter hard drop, P pause
- Touch: on-screen buttons plus tap/drag/flick gestures

## Doodle Wheel (`doodle.js`)
A snake game with cute animals, ropes, a bonus spin wheel and collectible creatures.
- Eat cute animals to grow and score. Ropes appear now and then and vanish after a few seconds; every 3 ropes the snake speeds up a level.
- Each rope pauses the game and brings up a spin wheel numbered 1 to 10. Tap Spin or press Space/Enter (it spins by itself after 2 s). The number it lands on multiplies that rope's points, then play resumes after a short countdown.
- After 6 ropes (or from level 4), original collectible creatures appear next to the ropes: Zappip, Embrix, Shellow, Budlet, Wispo, Pebbit, Frostail and Glimmoth. Catch them for bonus points and to fill your Collection tray. Your high score and best collection are saved in the browser.
- Keyboard: arrows or WASD steer, Space/Enter spin, P/Esc pause. Touch: swipe on the board or use the arrow pad.
- Game over when the snake hits a wall or itself.

Open `index.html` directly or serve the folder. `arcade.js` handles the tabs.

---

Copyright (c) 2026 Harish Lohar <hklohar@gmail.com>. All rights reserved.
