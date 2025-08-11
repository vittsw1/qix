const TILE = 12;
const W = 720, H = 480;
const SPEED_TICKS = 1;
const TARGET_REVEAL = 0.75;

const BG_SOURCES = ['assets/images/woman1.jpg', 'assets/images/woman2.jpg'];

let cols, rows;
let claimed, revealed;
let path = [];
let tracing = false;

let player = { r: 0, c: 0, dr: 0, dc: 1, lastSafeR: 0, lastSafeC: 0, tick: 0 };
let enemy = { x: 0, y: 0, vx: 2.1, vy: 1.7, radius: 6 };

let bgImgs = [];
let bgImg = null;
let level = 0;

function preload() {
  bgImgs = BG_SOURCES.map(src => loadImage(src));
}

function setup() {
  const cnv = createCanvas(W, H);
  cnv.parent('game-holder');

  cols = floor(W / TILE);
  rows = floor(H / TILE);

  resetGameState();
  bgImg = bgImgs[level];
}

function resetGameState() {
  claimed = Array.from({ length: rows }, () => Array(cols).fill(false));
  revealed = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (let c = 0; c < cols; c++) {
    claimed[0][c] = true;
    claimed[rows - 1][c] = true;
  }
  for (let r = 0; r < rows; r++) {
    claimed[r][0] = true;
    claimed[r][cols - 1] = true;
  }

  player.r = 0; player.c = 0; player.dr = 0; player.dc = 1;
  player.lastSafeR = player.r; player.lastSafeC = player.c;

  enemy.x = width * 0.5;
  enemy.y = height * 0.5;
}

function nextLevel() {
  level++;
  if (level < bgImgs.length) {
    bgImg = bgImgs[level];
    resetGameState();
    loop();
  } else {
    noLoop();
  }
}

function drawBackground() {
  if (!bgImg) return;

  const imgRatio = bgImg.width / bgImg.height;
  const canvasRatio = width / height;
  let dw, dh;
  if (imgRatio > canvasRatio) {
    dh = height; dw = dh * imgRatio;
  } else {
    dw = width; dh = dw / imgRatio;
  }

  let imgCanvas = createGraphics(width, height);
  imgCanvas.image(bgImg, (width - dw) / 2, (height - dh) / 2, dw, dh);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (revealed[r][c]) {
        const x = c * TILE;
        const y = r * TILE;
        image(imgCanvas, x, y, TILE, TILE, x, y, TILE, TILE);
      }
    }
  }
}

function drawOverlay() {
  noStroke();
  fill(0, 0, 0, 170);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!revealed[r][c]) {
        rect(c * TILE, r * TILE, TILE, TILE);
      }
    }
  }
}

function keyPressed() {
  if (keyCode === LEFT_ARROW)  { player.dr = 0; player.dc = -1; }
  if (keyCode === RIGHT_ARROW) { player.dr = 0; player.dc = 1; }
  if (keyCode === UP_ARROW)    { player.dr = -1; player.dc = 0; }
  if (keyCode === DOWN_ARROW)  { player.dr = 1; player.dc = 0; }
}

function inBounds(r, c) {
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

function tileIsSafe(r, c) {
  return inBounds(r, c) && claimed[r][c];
}

function tileIsUnclaimed(r, c) {
  return inBounds(r, c) && !claimed[r][c] && !revealed[r][c];
}

function movePlayerTick() {
  player.tick++;
  if (player.tick % SPEED_TICKS !== 0) return;

  const nr = player.r + player.dr;
  const nc = player.c + player.dc;
  if (!inBounds(nr, nc)) return;

  const nextIsSafe = tileIsSafe(nr, nc);
  const nextIsUnclaimed = tileIsUnclaimed(nr, nc);

  if (!tracing && nextIsUnclaimed) {
    tracing = true;
    path = [];
  }

  player.r = nr; player.c = nc;

  if (tracing) {
    const key = `${nr},${nc}`;
    if (path.length === 0 || path[path.length - 1].r !== nr || path[path.length - 1].c !== nc) {
      path.push({ r: nr, c: nc, key });
    }
    if (nextIsSafe) {
      closeAndCapture();
      tracing = false;
      path = [];
      player.lastSafeR = player.r; player.lastSafeC = player.c;
    }
  } else {
    if (nextIsSafe) {
      player.lastSafeR = player.r; player.lastSafeC = player.c;
    }
  }
}

function closeAndCapture() {
  if (path.length < 2) return;
  for (const p of path) {
    claimed[p.r][p.c] = true;
  }

  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const q = [];

  const er = constrain(floor(enemy.y / TILE), 0, rows - 1);
  const ec = constrain(floor(enemy.x / TILE), 0, cols - 1);

  if (tileIsUnclaimed(er, ec)) {
    visited[er][ec] = true;
    q.push({ r: er, c: ec });
  }

  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (q.length) {
    const { r, c } = q.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      if (visited[nr][nc]) continue;
      if (!tileIsUnclaimed(nr, nc)) continue;
      visited[nr][nc] = true;
      q.push({ r: nr, c: nc });
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!claimed[r][c] && !revealed[r][c]) {
        if (!visited[r][c]) {
          revealed[r][c] = true;
        }
      }
    }
  }
}

function moveEnemy() {
  let nx = enemy.x + enemy.vx;
  let ny = enemy.y + enemy.vy;

  if (nx < enemy.radius || nx > width - enemy.radius) {
    enemy.vx *= -1;
    nx = constrain(nx, enemy.radius, width - enemy.radius);
  }
  if (ny < enemy.radius || ny > height - enemy.radius) {
    enemy.vy *= -1;
    ny = constrain(ny, enemy.radius, height - enemy.radius);
  }

  const tc = floor(nx / TILE), tr = floor(ny / TILE);
  if (!inBounds(tr, tc) || claimed[tr][tc] || revealed[tr][tc]) {
    const tcx = floor((enemy.x + enemy.vx) / TILE);
    const tcy = floor((enemy.y + enemy.vy) / TILE);
    let hitX = (!inBounds(tr, tcx)) || (inBounds(tr, tcx) && (claimed[tr][tcx] || revealed[tr][tcx]));
    let hitY = (!inBounds(tcy, tc)) || (inBounds(tcy, tc) && (claimed[tcy][tc] || revealed[tcy][tc]));
    if (hitX) enemy.vx *= -1;
    if (hitY) enemy.vy *= -1;
    nx = enemy.x + enemy.vx;
    ny = enemy.y + enemy.vy;
  }

  enemy.x = nx; enemy.y = ny;

  if (tracing) {
    const er = floor(enemy.y / TILE), ec = floor(enemy.x / TILE);
    for (const p of path) {
      if (p.r === er && p.c === ec) {
        tracing = false;
        path = [];
        player.r = player.lastSafeR;
