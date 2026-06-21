# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step required. Open `index.html` directly in a browser, or serve it with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

On Windows: `start index.html`

## Architecture

Three files, no dependencies:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600 px) for the playfield, `<canvas id="next-canvas">` (120×120 px) for the piece preview, and `#overlay` for PAUSE / GAME OVER states.
- **`style.css`** — Dark/retro aesthetic; layout via flexbox.
- **`game.js`** — All game logic (~305 lines, `'use strict'`).

### game.js internals

**Data model**
- `board`: `ROWS × COLS` matrix; `0` = empty, `1–7` = piece color index.
- `current` / `next`: `{ type, shape, x, y }` objects. `shape` is a 2-D array of color indices.

**Key functions**
- `collide(shape, ox, oy)` — boundary + overlap check; used before every move/rotation.
- `rotateCW(shape)` — transpose + reverse rows; produces a new array (non-mutating).
- `tryRotate()` — applies `rotateCW` then tests wall kicks `[0, -1, 1, -2, 2]` columns.
- `clearLines()` — scans bottom-up, splices full rows and unshifts empty ones; updates score/level/speed.
- `ghostY()` — projects `current` downward until collision; used for ghost piece rendering.
- `loop(ts)` — `requestAnimationFrame` callback; accumulates `dropAccum` and locks the piece when `dropInterval` is exceeded.
- `draw()` — clears canvas, draws grid, locked board, ghost (α 0.2), then current piece.

**Game flow**: `init()` → `spawn()` → `loop()`. On lock: `merge()` → `clearLines()` → `spawn()`. Collision at spawn triggers `endGame()`.

**Speed formula**: `dropInterval = Math.max(100, 1000 − (level − 1) × 90)` ms. Level increments every 10 lines.

## Tunable constants (top of game.js)

| Constant | Default | Note |
|---|---|---|
| `COLS` / `ROWS` | 10 / 20 | Also update `width`/`height` on `<canvas id="board">` in index.html |
| `BLOCK` | 30 px | Canvas pixel size per cell |
| `COLORS` | 7 colours | Index 0 is `null` (empty); indices 1–7 map to piece types |
| `LINE_SCORES` | `[0,100,300,500,800]` | Multiplied by current level |
