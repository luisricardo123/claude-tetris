'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#ec407a', // Tuerca - magenta
  '#ff1744', // Bomb
  '#ffea00', // Ray
  '#e040fb', // Tint
  '#00e676', // Gravity
  '#40c4ff', // Freeze
];

// ---- Skin palettes ----
const SKIN_PALETTES = {
  retro: COLORS,
  pixel: COLORS,
  neon: [
    null,
    '#00ffff', // I - bright cyan
    '#ffff00', // O - bright yellow
    '#dd00ff', // T - bright purple
    '#00ff66', // S - bright green
    '#ff2244', // Z - bright red
    '#4488ff', // J - bright blue
    '#ff8800', // L - bright orange
    '#ff00aa', // Tuerca - hot pink
    '#ff1744', // Bomb
    '#ffea00', // Ray
    '#e040fb', // Tint
    '#00e676', // Gravity
    '#40c4ff', // Freeze
  ],
  pastel: [
    null,
    '#a8e6ef', // I - soft cyan
    '#ffe5a0', // O - soft yellow
    '#d4aee8', // T - soft purple
    '#b5ddb8', // S - soft green
    '#f0a8a8', // Z - soft red
    '#b8d0f5', // J - soft blue
    '#ffd0a0', // L - soft orange
    '#f5a8cc', // Tuerca - soft pink
    '#f5b8c4', // Bomb
    '#f5e8a8', // Ray
    '#e8b8f5', // Tint
    '#a8f5d0', // Gravity
    '#a8d8f5', // Freeze
  ],
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (anillo 3x3)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const POWERUP_TYPES    = ['bomb', 'ray', 'tint', 'gravity', 'freeze'];
const POWERUP_COLOR    = { bomb: 9, ray: 10, tint: 11, gravity: 12, freeze: 13 };
const POWERUP_NAME     = { bomb: 'BOMBA', ray: 'RAYO', tint: 'TINTE', gravity: 'GRAVEDAD', freeze: 'CONGELAR' };
const POWERUP_ICON     = { bomb: 'B', ray: '!', tint: 'T', gravity: 'v', freeze: '*' };
const POWERUP_INTERVAL = 10; // lines between power-up spawns

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const powerupEl = document.getElementById('powerup-indicator');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesUntilPowerup, freezeUntil, activePowerup, pendingPowerup;
const VALID_SKINS = ['retro', 'neon', 'pastel', 'pixel'];
const _storedSkin = localStorage.getItem('tetris-skin');
let activeSkin = VALID_SKINS.includes(_storedSkin) ? _storedSkin : 'retro';

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerup() {
  const effect = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  return { powerup: effect, shape: [[POWERUP_COLOR[effect]]], x: Math.floor(COLS / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function applyPowerup(effect, px, py) {
  switch (effect) {
    case 'bomb':
      for (let r = py - 1; r <= py + 1; r++)
        for (let c = px - 1; c <= px + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS)
            board[r][c] = 0;
      break;
    case 'ray':
      // clears the entire row and column of the landing cell
      for (let c = 0; c < COLS; c++) board[py][c] = 0;
      for (let r = 0; r < ROWS; r++) board[r][px] = 0;
      break;
    case 'tint': {
      const counts = new Array(9).fill(0);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c] >= 1 && board[r][c] <= 8) counts[board[r][c]]++;
      let top = 1;
      for (let i = 2; i <= 8; i++) if (counts[i] > counts[top]) top = i;
      if (counts[top] > 0)
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === top) board[r][c] = 0;
      break;
    }
    case 'gravity':
      // compact each column independently — cells fall straight down
      for (let c = 0; c < COLS; c++) {
        const col = [];
        for (let r = 0; r < ROWS; r++) if (board[r][c]) col.push(board[r][c]);
        for (let r = 0; r < ROWS; r++)
          board[r][c] = r < ROWS - col.length ? 0 : col[r - (ROWS - col.length)];
      }
      break;
    case 'freeze':
      freezeUntil = performance.now() + 5000;
      break;
  }
  activePowerup = effect;
  updatePowerupIndicator();
  if (effect !== 'freeze') {
    setTimeout(() => {
      if (activePowerup === effect) { activePowerup = null; updatePowerupIndicator(); }
    }, 1500);
  }
  // freeze expiry is handled in loop() to avoid setTimeout conflicts on double-freeze
}

function updatePowerupIndicator() {
  if (!powerupEl) return;
  if (!activePowerup) {
    powerupEl.textContent = '';
    powerupEl.removeAttribute('data-effect');
  } else {
    powerupEl.textContent = POWERUP_NAME[activePowerup];
    powerupEl.setAttribute('data-effect', activePowerup);
  }
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesUntilPowerup -= cleared;
    if (linesUntilPowerup <= 0) {
      linesUntilPowerup = POWERUP_INTERVAL;
      pendingPowerup = true;
    }
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.powerup) {
    const px = current.x;
    const py = Math.max(0, Math.min(current.y, ROWS - 1));
    applyPowerup(current.powerup, px, py);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = pendingPowerup ? randomPowerup() : randomPiece();
  pendingPowerup = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skin-specific block drawing helpers ----

function _darkenColor(hex, amount) {
  // amount: 0-255, darkens each channel
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}

function _drawBlockRetro(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

function _drawBlockNeon(context, x, y, color, size) {
  const bx = x * size + 1;
  const by = y * size + 1;
  const bw = size - 2;
  const bh = size - 2;

  // glow via shadow
  context.shadowColor = color;
  context.shadowBlur = 14;

  context.fillStyle = color;
  context.fillRect(bx, by, bw, bh);

  // inner bright core
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(bx + 2, by + 2, bw - 4, Math.min(bh - 4, 5));

  // outline with glow
  context.shadowColor = color;
  context.shadowBlur = 8;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.strokeRect(bx, by, bw, bh);

  // reset shadow
  context.shadowBlur = 0;
}

function _drawRoundRect(context, rx, ry, rw, rh, radius) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(rx, ry, rw, rh, radius);
    context.fill();
  } else {
    // fallback: arc corners
    const r = Math.min(radius, rw / 2, rh / 2);
    context.beginPath();
    context.moveTo(rx + r, ry);
    context.lineTo(rx + rw - r, ry);
    context.arcTo(rx + rw, ry, rx + rw, ry + r, r);
    context.lineTo(rx + rw, ry + rh - r);
    context.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
    context.lineTo(rx + r, ry + rh);
    context.arcTo(rx, ry + rh, rx, ry + rh - r, r);
    context.lineTo(rx, ry + r);
    context.arcTo(rx, ry, rx + r, ry, r);
    context.closePath();
    context.fill();
  }
}

function _drawBlockPastel(context, x, y, color, size) {
  const bx = x * size + 2;
  const by = y * size + 2;
  const bw = size - 4;
  const bh = size - 4;
  const radius = Math.floor(size * 0.2);

  context.fillStyle = color;
  _drawRoundRect(context, bx, by, bw, bh, radius);

  // soft highlight on top
  context.fillStyle = 'rgba(255,255,255,0.30)';
  _drawRoundRect(context, bx + 2, by + 2, bw - 4, Math.floor(bh * 0.35), radius);
}

function _drawBlockPixel(context, x, y, color, size) {
  const bx = x * size + 1;
  const by = y * size + 1;
  const bw = size - 2;
  const bh = size - 2;

  // base fill
  context.fillStyle = color;
  context.fillRect(bx, by, bw, bh);

  // 2px inner border in darker shade
  const dark = _darkenColor(color, 50);
  context.strokeStyle = dark;
  context.lineWidth = 2;
  context.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

  // top-left light bevel
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(bx, by, bw, 3);
  context.fillRect(bx, by, 3, bh);

  // small highlight dots (pixel art feel)
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.fillRect(bx + 3, by + 3, 2, 2);
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const palette = SKIN_PALETTES[activeSkin] || COLORS;
  const color = palette[colorIndex] || COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;

  switch (activeSkin) {
    case 'neon':
      _drawBlockNeon(context, x, y, color, size);
      break;
    case 'pastel':
      _drawBlockPastel(context, x, y, color, size);
      break;
    case 'pixel':
      _drawBlockPixel(context, x, y, color, size);
      break;
    default: // retro
      _drawBlockRetro(context, x, y, color, size);
      break;
  }

  // power-up icon — skip for ghost (alpha < 1)
  if (colorIndex >= 9 && !(alpha < 1)) {
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(0,0,0,0.75)';
    context.font = `bold ${Math.floor(size * 0.5)}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const effect = POWERUP_TYPES[colorIndex - 9];
    context.fillText(POWERUP_ICON[effect] || '?', x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  if (activeSkin === 'neon') {
    ctx.strokeStyle = '#111';
  } else {
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
  }
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  // For Neon skin set canvas bg to black; otherwise clear with transparency
  if (activeSkin === 'neon') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!gameOver) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  if (activeSkin === 'neon') {
    nextCtx.fillStyle = '#000';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  } else {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function applySkin(name) {
  activeSkin = name;
  // For Neon skin, canvas bg is always black (handled in draw/drawNext)
  // Update the select to match
  if (skinSelect) skinSelect.value = name;
  draw();
  if (next) drawNext();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw(); // render final: sólo fichas bloqueadas, sin pieza activa ni fantasma
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;

  // handle freeze expiry
  if (freezeUntil && ts >= freezeUntil) {
    freezeUntil = 0;
    if (activePowerup === 'freeze') { activePowerup = null; updatePowerupIndicator(); }
  }

  const frozen = freezeUntil > 0;
  if (!frozen) {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  linesUntilPowerup = POWERUP_INTERVAL;
  freezeUntil = 0;
  activePowerup = null;
  pendingPowerup = false;
  updatePowerupIndicator();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(isLight) {
  document.body.classList.toggle('light-mode', isLight);
  themeToggleBtn.textContent = isLight ? '☾ DARK' : '☀ LIGHT';
}

themeToggleBtn.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

skinSelect.addEventListener('change', () => {
  activeSkin = skinSelect.value;
  localStorage.setItem('tetris-skin', activeSkin);
  applySkin(activeSkin);
});

applyTheme(localStorage.getItem('tetris-theme') === 'light');

// Set skin selector to persisted value
skinSelect.value = activeSkin;

init();
