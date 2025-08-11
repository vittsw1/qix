let player;
let trails = [];
let isDrawing = false;
let drawStart;
let gameArea;
let enemies = [];
let percentRevealed = 0;
let gameOver = false;
let retroSound;

function setup() {
  const holder = document.getElementById('game-holder');
  const canvas = createCanvas(holder.offsetWidth, holder.offsetHeight);
  canvas.parent(holder);
  gameArea = createGraphics(width, height);
  gameArea.background(50);
  player = new Player();
  enemies.push(new Enemy(width / 2, height / 2));
  retroSound = getAudioContext();
}

function draw() {
  if (gameOver) return;

  background(0);
  image(gameArea, 0, 0);

  for (let trail of trails) {
    trail.show();
  }

  player.update();
  player.show();

  for (let enemy of enemies) {
    enemy.update();
    enemy.show();
    for (let trail of trails) {
      if (enemy.hits(trail)) {
        trails = [];
        break;
      }
    }
  }

  updateHUD();
}

// --- Polyfill audio (evita errori se p5.sound non è caricato)
if (typeof window.getAudioContext !== 'function') {
  window.getAudioContext = function () {
    return null;
  };
}

// --- Costanti e utilità
const BORDER = 10;          // spessore bordo “sicuro”
const REVEAL_COLOR = 50;    // grigio dell’area rivelata
const TRAIL_COLOR = [100, 200, 255];
const PLAYER_COLOR = [240, 240, 240];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function isRevealed(x, y) {
  x = clamp(Math.floor(x), 0, width - 1);
  y = clamp(Math.floor(y), 0, height - 1);
  const c = gameArea.get(x, y); // [r,g,b,a]
  return c[0] >= REVEAL_COLOR - 5; // abbastanza grigio -> rivelato
}

function updateHUD() {
  const el = document.getElementById('percent');
  if (!el) return;
  el.textContent = `${percentRevealed.toFixed(1)}%`;
}

function computePercent() {
  gameArea.loadPixels();
  let revealed = 0;
  const step = 2; // accelerazione: campiona un pixel ogni 2
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = 4 * (y * width + x);
      const r = gameArea.pixels[idx];
      if (r >= REVEAL_COLOR - 5) revealed++;
    }
  }
  const total = Math.ceil((width * height) / (step * step));
  percentRevealed = (revealed / total) * 100;
}

// --- Reinizializza l’area di gioco con il bordo
function resetGame() {
  trails = [];
  isDrawing = false;
  percentRevealed = 0;
  gameOver = false;

  gameArea.background(0);
  gameArea.noStroke();
  // cornice piena
  gameArea.fill(REVEAL_COLOR);
  gameArea.rect(0, 0, width, height);
  // ritaglia interno
  gameArea.fill(0);
  gameArea.rect(BORDER, BORDER, width - 2 * BORDER, height - 2 * BORDER);

  player = new Player();
  enemies = [new Enemy(width / 2, height / 2)];
  computePercent();
  updateHUD();
}

// --- Ridefinisco setup per inizializzazione corretta
function setup() {
  const holder = document.getElementById('game-holder');
  const canvas = createCanvas(holder.offsetWidth, holder.offsetHeight);
  canvas.parent(holder);
  gameArea = createGraphics(width, height);
  resetGame();
  retroSound = getAudioContext();

  // opzionale: ridimensiona se cambia il contenitore
  window.addEventListener('resize', () => {
    const w = holder.offsetWidth;
    const h = holder.offsetHeight;
    resizeCanvas(w, h);
    gameArea = createGraphics(width, height);
    resetGame();
  });
}

// --- Input
function keyPressed() {
  if (key === 'r' || key === 'R') {
    resetGame();
  }
}

// --- Classi
class Player {
  constructor() {
    this.x = width / 2;
    this.y = BORDER / 2 + 1; // parte sul bordo superiore interno
    this.speed = 3;
    this.lastWasRevealed = true;
  }

  update() {
    let dx = 0, dy = 0;
    if (keyIsDown(LEFT_ARROW)) dx -= 1;
    if (keyIsDown(RIGHT_ARROW)) dx += 1;
    if (keyIsDown(UP_ARROW)) dy -= 1;
    if (keyIsDown(DOWN_ARROW)) dy += 1;

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.sqrt(2);
      dx *= inv; dy *= inv;
    }

    const nx = clamp(this.x + dx * this.speed, 0, width - 1);
    const ny = clamp(this.y + dy * this.speed, 0, height - 1);

    const nowRevealed = isRevealed(nx, ny);

    // Inizio tracciamento quando esco da zona rivelata
    if (!nowRevealed && !isDrawing && this.lastWasRevealed) {
      isDrawing = true;
      drawStart = createVector(this.x, this.y);
      const t = new Trail();
      t.addPoint(this.x, this.y);
      trails.push(t);
    }

    // Aggiungo punti mentre traccio
    if (isDrawing && trails.length > 0) {
      trails[trails.length - 1].addPoint(nx, ny);
    }

    // Chiusura percorso quando rientro nella zona rivelata
    if (nowRevealed && isDrawing) {
      this.capture();
    }

    this.x = nx; this.y = ny;
    this.lastWasRevealed = nowRevealed;
  }

  capture() {
    isDrawing = false;
    if (trails.length === 0) return;
    const trail = trails.pop();
    const pts = trail.points;
    if (pts.length < 3) return;

    // Riempie il poligono tracciato
    gameArea.noStroke();
    gameArea.fill(REVEAL_COLOR);
    gameArea.beginShape();
    for (const p of pts) gameArea.vertex(p.x, p.y);
    gameArea.endShape(CLOSE);

    computePercent();
    updateHUD();
  }

  show() {
    noStroke();
    fill(PLAYER_COLOR[0], PLAYER_COLOR[1], PLAYER_COLOR[2]);
    const s = 6;
    rectMode(CENTER);
    rect(this.x, this.y, s, s, 2);
  }
}

class Trail {
  constructor() {
    this.points = [];
    this.minDist = 1.5;
  }
  addPoint(x, y) {
    const v = createVector(x, y);
    const n = this.points.length;
    if (n === 0 || p5.Vector.dist(this.points[n - 1], v) > this.minDist) {
      this.points.push(v);
    }
  }
  show() {
    noFill();
    stroke(TRAIL_COLOR[0], TRAIL_COLOR[1], TRAIL_COLOR[2]);
    strokeWeight(2);
    beginShape();
    for (const p of this.points) vertex(p.x, p.y);
    endShape();
  }
}

class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 6;
    const angle = random(TWO_PI);
    this.vx = 2.2 * Math.cos(angle);
    this.vy = 2.2 * Math.sin(angle);
  }

  update() {
    let nx = this.x + this.vx;
    let ny = this.y + this.vy;

    // Rimbalza ai bordi finestra
    if (nx < 0 || nx >= width) { this.vx *= -1; nx = this.x + this.vx; }
    if (ny < 0 || ny >= height) { this.vy *= -1; ny = this.y + this.vy; }

    // Rimbalzo semplice sulle aree rivelate
    if (isRevealed(nx, ny)) {
      // prova invertire asse con riflessione semplice
      if (!isRevealed(this.x + this.vx, this.y)) this.vx *= -1;
      if (!isRevealed(this.x, this.y + this.vy)) this.vy *= -1;
      nx = this.x + this.vx;
      ny = this.y + this.vy;
    }

    this.x = nx;
    this.y = ny;
  }

  show() {
    noStroke();
    fill(255, 70, 70);
    circle(this.x, this.y, this.r * 2);
  }

  hits(trail) {
    const pts = trail.points;
    for (let i = 1; i < pts.length; i++) {
      if (this._distToSeg(pts[i - 1], pts[i]) < this.r) return true;
    }
    return false;
  }

  _distToSeg(a, b) {
    const px = this.x, py = this.y;
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = px - a.x, wy = py - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return dist(px, py, a.x, a.y);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return dist(px, py, b.x, b.y);
    const t = c1 / c2;
    const projx = a.x + t * vx;
    const projy = a.y + t * vy;
    return dist(px, py, projx, projy);
  }
}

