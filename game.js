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
const comboEl = document.getElementById('combo');
const comboSection = document.getElementById('combo-section');
const overlay = document.getElementById('overlay');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const powerupEl = document.getElementById('powerup-indicator');

// Overlay sections
const sectionStart    = document.getElementById('section-start');
const sectionPause    = document.getElementById('section-pause');
const sectionGameover = document.getElementById('section-gameover');
const playBtn         = document.getElementById('play-btn');
const resumeBtn       = document.getElementById('resume-btn');
const nameEntry       = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn    = document.getElementById('save-score-btn');
const recordsStart    = document.getElementById('records-start');
const recordsGameover = document.getElementById('records-gameover');
const resetRecordsStart    = document.getElementById('reset-records-start');
const resetRecordsGameover = document.getElementById('reset-records-gameover');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let linesUntilPowerup, freezeUntil, activePowerup, pendingPowerup;
let combo, bestComboSession, maxLinesSession;

// ---- localStorage helpers ----

const RECORDS_KEY = 'tetris-records';

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.scores)) return parsed;
    }
  } catch (_) { /* ignore corrupt data */ }
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// Returns true if testScore qualifies to enter the top-5 leaderboard.
// Uses >= so a score tying the 5th place is also accepted.
function qualifiesForTopFive(testScore) {
  const records = loadRecords();
  if (records.scores.length < 5) return true;
  return testScore >= records.scores[records.scores.length - 1].score;
}

// ---- Records table rendering ----

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// highlightIdx is passed explicitly so the caller controls which row to mark,
// avoiding false matches when two entries share the same name and score.
function buildRecordsHTML(records, highlightIdx) {
  const rows = records.scores.map((entry, i) => {
    const isNew = i === highlightIdx;
    return `<tr class="${isNew ? 'record-new' : ''}">
      <td>${i + 1}</td>
      <td>${escapeHtml(entry.name)}</td>
      <td>${entry.score.toLocaleString()}</td>
      <td>${entry.lines}</td>
      <td>${entry.level}</td>
    </tr>`;
  }).join('');

  const emptyRows = records.scores.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:var(--label-color)">Sin records</td></tr>'
    : '';

  return `
    <table class="records-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Nombre</th>
          <th>Score</th>
          <th>Lineas</th>
          <th>Nivel</th>
        </tr>
      </thead>
      <tbody>${rows}${emptyRows}</tbody>
    </table>
    <p class="records-meta">Mejor combo: ${records.bestCombo} | Lineas max: ${records.maxLines}</p>
  `;
}

function renderRecordsStart() {
  const records = loadRecords();
  recordsStart.innerHTML = buildRecordsHTML(records, -1);
}

// highlightIdx: the index in records.scores to highlight (-1 = none)
function renderRecordsGameover(records, highlightIdx) {
  if (!records) records = loadRecords();
  recordsGameover.innerHTML = buildRecordsHTML(records, highlightIdx !== undefined ? highlightIdx : -1);
}

// ---- Overlay section management ----

const OVERLAY_SECTIONS = { 'section-start': sectionStart, 'section-pause': sectionPause, 'section-gameover': sectionGameover };

function showSection(sectionId) {
  Object.values(OVERLAY_SECTIONS).forEach(s => s.classList.remove('active'));
  OVERLAY_SECTIONS[sectionId].classList.add('active');
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
  Object.values(OVERLAY_SECTIONS).forEach(s => s.classList.remove('active'));
}

// ---- Board & piece helpers ----

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
      // compact each column independently - cells fall straight down
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
    combo++;
    if (combo > bestComboSession) bestComboSession = combo;
    lines += cleared;
    maxLinesSession = lines;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    linesUntilPowerup -= cleared;
    if (linesUntilPowerup <= 0) {
      linesUntilPowerup = POWERUP_INTERVAL;
      pendingPowerup = true;
    }
    updateHUD();
  } else {
    combo = 0;
  }
  updateComboHUD();
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

function updateComboHUD() {
  if (combo >= 2) {
    comboSection.style.display = '';
    comboEl.textContent = 'x' + combo;
  } else {
    comboSection.style.display = 'none';
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  // power-up icon - skip for ghost (alpha < 1)
  if (colorIndex >= 9 && !(alpha < 1)) {
    context.globalAlpha = 1;
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
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw(); // render final: solo fichas bloqueadas, sin pieza activa ni fantasma

  // Load records once, update bestCombo/maxLines if needed, then reuse for qualification check
  const records = loadRecords();
  let recordsChanged = false;
  if (bestComboSession > records.bestCombo) {
    records.bestCombo = bestComboSession;
    recordsChanged = true;
  }
  if (maxLinesSession > records.maxLines) {
    records.maxLines = maxLinesSession;
    recordsChanged = true;
  }
  if (recordsChanged) saveRecords(records);

  overlayScore.textContent = `Puntuacion: ${score.toLocaleString()} | Lineas: ${lines} | Nivel: ${level}`;

  // Check qualification using the already-loaded records object (avoids a second localStorage read)
  const qualifies = records.scores.length < 5 || score >= records.scores[records.scores.length - 1].score;

  if (qualifies) {
    nameEntry.classList.remove('hidden');
    playerNameInput.value = '';
  } else {
    nameEntry.classList.add('hidden');
  }
  renderRecordsGameover(records, -1);
  showSection('section-gameover');
  if (qualifies) playerNameInput.focus();
}

function saveCurrentScore() {
  const name = playerNameInput.value.trim() || 'Anonimo';
  const records = loadRecords();
  records.scores.push({ name, score, lines, level });
  records.scores.sort((a, b) => b.score - a.score);
  records.scores = records.scores.slice(0, 5);
  saveRecords(records);
  nameEntry.classList.add('hidden');
  // Find the exact index of the newly inserted entry to highlight it correctly
  const highlightIdx = records.scores.findLastIndex(
    e => e.name === name && e.score === score && e.lines === lines && e.level === level
  );
  renderRecordsGameover(records, highlightIdx);
}

function togglePause() {
  // Guard against pre-init state: if board is not yet initialized, ignore pause
  if (!board) return;
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    hideOverlay();
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    showSection('section-pause');
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
  combo = 0;
  bestComboSession = 0;
  maxLinesSession = 0;
  updatePowerupIndicator();
  updateComboHUD();
  next = randomPiece();
  spawn();
  updateHUD();
  hideOverlay();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Event listeners ----

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  // Block all movement keys if game has not been initialized yet or is over/paused
  if (!board || paused || gameOver) return;
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
playBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);

saveScoreBtn.addEventListener('click', saveCurrentScore);

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveCurrentScore();
});

resetRecordsStart.addEventListener('click', () => {
  localStorage.removeItem(RECORDS_KEY);
  renderRecordsStart();
});

resetRecordsGameover.addEventListener('click', () => {
  localStorage.removeItem(RECORDS_KEY);
  renderRecordsGameover(null, -1);
});

function applyTheme(isLight) {
  document.body.classList.toggle('light-mode', isLight);
  themeToggleBtn.textContent = isLight ? '☾ DARK' : '☀ LIGHT';
}

themeToggleBtn.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
});

applyTheme(localStorage.getItem('tetris-theme') === 'light');

// Show start screen on page load instead of immediately starting the game
renderRecordsStart();
showSection('section-start');
