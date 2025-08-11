/* Gals Panic – template p5.js (tile-based capture)
   Meccaniche base:
   - Muovi sul bordo (sicuro). Entra nell'area scura per tracciare.
   - Se chiudi un percorso, catturi la zona che non contiene il nemico (flood-fill).
   - Se il nemico tocca il tuo tracciato, lo perdi.
   Contenuti: usa solo ritratti di persone ADULTE, non espliciti e con licenza idonea.
*/

// Config
const TILE = 12;
const W = 720, H = 480; // multipli di TILE
const SPEED_TICKS = 1;  // 1 = più veloce (passi griglia per frame)
const TARGET_REVEAL = 0.75; // 75% per "vittoria"

// Aggiungi qui i tuoi file immagine (in assets/images/)
const BG_SOURCES = ['assets/images/woman1.jpg', 'assets/images/woman2.jpg'];
  // Esempi: 'assets/images/woman1.jpg', 'assets/images/woman2.jpg'

let cols, rows;
let claimed;   // boolean [r][c] – bordo/sicuro
let revealed;  // boolean [r][c] – area catturata
let path = []; // array di {r,c}
let tracing = false;

let player = { r: 0, c: 0, dr: 0, dc: 1, lastSafeR: 0, lastSafeC: 0, tick: 0 };
let enemy = { x: 0, y: 0, vx: 2.1, vy: 1.7, radius: 6 };

let bgImg = null;

function preload() {
  // Carica una a caso tra BG_SOURCES; se vuoto, niente (useremo un gradiente)
  if (BG_SOURCES.length > 0) {
    const pick = BG_SOURCES[floor(random(BG_SOURCES.length))];
    bgImg = loadImage(pick, () => {}, () => { bgImg = null; });
  }
}

function setup() {
  const cnv = createCanvas(W, H);
  cnv.parent('game-holder');

  cols = floor(W / TILE);
  rows = floor(H / TILE);

  claimed = Array.from({ length: rows }, () => Array(cols).fill(false));
  revealed = Array.from({ length: rows }, () => Array(cols).fill(false));

  // Crea un bordo sicuro di 1 tile
  for (let c = 0; c < cols; c++) {
    claimed[0][c] = true;
    claimed[rows - 1][c] = true;
  }
  for (let r = 0; r < rows; r++) {
    claimed[r][0] = true;
    claimed[r][cols - 1] = true;
  }

  // Posiziona player sul bordo
  player.r = 0; player.c = 0; player.dr = 0; player.dc = 1;
  player.lastSafeR = player.r; player.lastSafeC = player.c;

  // Nemico dentro l'area non rivelata
  enemy.x = width * 0.5;
  enemy.y = height * 0.5;
}

function drawBackground() {
  if (bgImg) {
    // Disegna l'immagine adattata mantenendo copertura
    const imgRatio = bgImg.width / bgImg.height;
    const canvasRatio = width / height;
    let dw, dh;
    if (imgRatio > canvasRatio) { // immagine più larga: adatta in altezza
      dh = height; dw = dh * imgRatio;
    } else {
      dw = width; dh = dw / imgRatio;
    }
    image(bgImg, (width - dw) / 2, (height - dh) / 2, dw, dh);
  } else {
    // Gradiente di fallback
    noFill();
    for (let y = 0; y < height; y++) {
      const t = y / height;
      const col = lerpColor(color('#0b1020'), color('#233a72'), t);
      stroke(col);
      line(0, y, width, y);
    }
  }
}

function drawOverlay() {
  // Disegna overlay scuro sui tile NON rivelati
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

  // Inizio/continuazione tracciamento
  if (!tracing && nextIsUnclaimed) {
    tracing = true;
    path = [];
  }

  // Muovi
  player.r = nr; player.c = nc;

  if (tracing) {
    // Aggiungi tile al path se nuovo
    const key = `${nr},${nc}`;
    if (path.length === 0 || path[path.length - 1].r !== nr || path[path.length - 1].c !== nc) {
      path.push({ r: nr, c: nc, key });
    }
    // Se rientri nel sicuro, chiudi e cattura
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
  // Congela il percorso come claimed (parete)
  for (const p of path) {
    claimed[p.r][p.c] = true;
  }

  // Flood-fill dall'enemy per marcare l'area connessa all'enemy (NON da catturare)
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

  // Tutti i tile unclaimed non visitati sono chiusi -> rivelali
  let newlyRevealed = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!claimed[r][c] && !revealed[r][c]) {
        if (!visited[r][c]) {
          revealed[r][c] = true;
          newlyRevealed++;
        }
      }
    }
  }

  // Se vuoi rendere il perimetro della nuova area "sicuro", il path basta.
  // (Semplificazione: non calcoliamo l'intero bordo della regione rivelata)
}

function moveEnemy() {
  // Prossima posizione
  let nx = enemy.x + enemy.vx;
  let ny = enemy.y + enemy.vy;

  // Bordi canvas
  if (nx < enemy.radius || nx > width - enemy.radius) {
    enemy.vx *= -1;
    nx = constrain(nx, enemy.radius, width - enemy.radius);
  }
  if (ny < enemy.radius || ny > height - enemy.radius) {
    enemy.vy *= -1;
    ny = constrain(ny, enemy.radius, height - enemy.radius);
  }

  // Collisione con pareti claimed o area rivelata (tratta come muro)
  const tc = floor(nx / TILE), tr = floor(ny / TILE);
  if (!inBounds(tr, tc) || claimed[tr][tc] || revealed[tr][tc]) {
    // Rimbalzo semplice: inverti direzione dominante
    const tcx = floor((enemy.x + enemy.vx) / TILE);
    const tcy = floor((enemy.y + enemy.vy) / TILE);
    // Prova a capire l’asse d’impatto
    let hitX = (!inBounds(tr, tcx)) || (inBounds(tr, tcx) && (claimed[tr][tcx] || revealed[tr][tcx]));
    let hitY = (!inBounds(tcy, tc)) || (inBounds(tcy, tc) && (claimed[tcy][tc] || revealed[tcy][tc]));
    if (hitX) enemy.vx *= -1;
    if (hitY) enemy.vy *= -1;
    nx = enemy.x + enemy.vx;
    ny = enemy.y + enemy.vy;
  }

  enemy.x = nx; enemy.y = ny;

  // Se tocca il path mentre stai tracciando -> fallimento del tratto
  if (tracing) {
    const er = floor(enemy.y / TILE), ec = floor(enemy.x / TILE);
    for (const p of path) {
      if (p.r === er && p.c === ec) {
        // Reset del tracciato
        tracing = false;
        path = [];
        // Riporta il player all'ultimo punto sicuro
        player.r = player.lastSafeR;
        player.c = player.lastSafeC;
        break;
      }
    }
  }
}

function revealedRatio() {
  let total = 0, rev = 0;
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      total++;
      if (revealed[r][c]) rev++;
    }
  }
  return total > 0 ? rev / total : 0;
}

function drawGridDecor() {
  // Linee bordo sicuro
  stroke('#22d3ee');
  strokeWeight(2);
  noFill();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (claimed[r][c]) {
        point(c * TILE + TILE / 2, r * TILE + TILE / 2);
      }
    }
  }
  // Path in corso
  if (tracing && path.length) {
    stroke('#fbbf24');
    strokeWeight(3);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      line(a.c * TILE + TILE / 2, a.r * TILE + TILE / 2, b.c * TILE + TILE / 2, b.r * TILE + TILE / 2);
    }
  }

  // Player
  noStroke();
  fill('#a7f3d0');
  circle(player.c * TILE + TILE / 2, player.r * TILE + TILE / 2, TILE * 0.7);

  // Enemy
  fill('#ef4444');
  circle(enemy.x, enemy.y, enemy.radius * 2);
}

function draw() {
  background(0);
  drawBackground();
  drawOverlay();

  movePlayerTick();
  moveEnemy();
  drawGridDecor();

  // HUD percentuale
  const p = document.getElementById('percent');
  if (p) p.textContent = `${(revealedRatio() * 100).toFixed(1)}%`;

  // Vittoria
  if (revealedRatio() >= TARGET_REVEAL) {
    push();
    noStroke();
    fill(0, 0, 0, 160);
    rect(0, 0, width, height);
    textAlign(CENTER, CENTER);
    textSize(36);
    fill('#22d3ee');
    text('Complimenti! Area rivelata sufficiente 🎉', width / 2, height / 2);
    pop();
    noLoop();
  }
}
