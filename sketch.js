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
// Velocità: più alto = più lento (si muove ogni N frame)
const SAFE_SPEED_TICKS = 1;   // sul bordo: scorrevole
const TRACE_SPEED_TICKS = 3;  // mentre traccia: più lento (difficoltà ↑)
const TARGET_REVEAL = 0.75;   // 75% per "vittoria"

// File immagine (in assets/images/)
const BG_SOURCES = ['assets/images/woman1.jpg', 'assets/images/woman2.jpg'];

// Velocità nemico per livello (più veloce ai livelli successivi)
const ENEMY_SPEED_BY_LEVEL = [
  { vx: 3.0, vy: 2.5 }, // livello 1
  { vx: 3.6, vy: 3.0 }  // livello 2
];

let cols, rows;
let claimed;   // boolean [r][c] – bordo/sicuro
let revealed;  // boolean [r][c] – area catturata
let path = []; // array di {r,c}
let tracing = false;

let player = { r: 0, c: 0, dr: 0, dc: 1, lastSafeR: 0, lastSafeC: 0, tick: 0 };
let enemy = { x: 0, y: 0, vx: 2.1, vy: 1.7, radius: 6 };

let bgImgs = [];     // tutte le immagini caricate
let bgImg = null;    // immagine corrente
let scaledBg = null; // cache dell'immagine ridimensionata alla canvas

let level = 0;
let levelCleared = false;
let gameCompleted = false;

function preload() {
  // Carica tutte le immagini per i livelli
  bgImgs = BG_SOURCES.map(src => loadImage(src));
}

function setup() {
  const cnv = createCanvas(W, H);
  cnv.parent('game-holder');

  cols = floor(W / TILE);
  rows = floor(H / TILE);

  bgImg = bgImgs[level] || null;
  rebuildScaledBg();
  resetGameState();
}

function setEnemySpeedForLevel() {
  const spec = ENEMY_SPEED_BY_LEVEL[Math.min(level, ENEMY_SPEED_BY_LEVEL.length - 1)];
  enemy.vx = spec.vx;
  enemy.vy = spec.vy;
}

function resetGameState() {
  claimed = Array.from({ length: rows }, () => Array(cols).fill(false));
  revealed = Array.from({ length: rows }, () => Array(cols).fill(false));
  tracing = false;
  path = [];
  levelCleared = false;

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
  player.tick = 0;

  // Nemico dentro l'area non rivelata
  enemy.x = width * 0.5;
  enemy.y = height * 0.5;
  setEnemySpeedForLevel();
}

function nextLevel() {
  level++;
  if (level < bgImgs.length) {
    bgImg = bgImgs[level] || null;
    rebuildScaledBg();
    resetGameState();
    loop(); // riprende il draw
  } else {
    // Gioco completato
    gameCompleted = true;
    loop(); // lascio correre un frame per disegnare il messaggio finale
  }
}

function rebuildScaledBg() {
  // Prepara una versione già scalata dell'immagine per disegnare solo i riquadri rivelati
  if (!bgImg) { scaledBg = null; return; }

  const imgRatio = bgImg.width / bgImg.height;
  const canvasRatio = width / height;
  let dw, dh;
  if (imgRatio > canvasRatio) { // immagine più larga: adatta in altezza
    dh = height; dw = dh * imgRatio;
  } else {
    dw = width; dh = dw / imgRatio;
  }

  scaledBg = createGraphics(width, height);
  scaledBg.image(bgImg, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function showLevelBanner(msg) {
  push();
  noStroke();
  fill(0, 0, 0, 180);
  rect(0, 0, width, height);
  textAlign(CENTER, CENTER);
  textSize(36);
  fill('#22d3ee');
  text(msg, width / 2, height / 2);
  pop();
}

function drawBackground() {
  // Disegna l’immagine SOLO dove revealed[r][c] è true
  if (!scaledBg) return;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (revealed[r][c]) {
        const x = c * TILE;
        const y = r * TILE;
        // copia un tassello dalla grafica scalata nelle stesse coordinate
        image(scaledBg, x, y, TILE, TILE, x, y, TILE, TILE);
      }
    }
  }
}

function drawOverlay() {
  // Overlay scuro sui tile NON rivelati
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

  // usa velocità diverse a seconda che stia tracciando o no
  const stepEvery = tracing ? TRACE_SPEED_TICKS : SAFE_SPEED_TICKS;
  if (player.tick % stepEvery !== 0) return;

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
    if (path.length === 0 || path[path.length - 1].r !== nr || path[path.length - 1].c !== nc) {
      path.push({ r: nr, c: nc });
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

  let newlyRevealed = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!claimed[r][c] && !revealed[r][c] && !visited[r][c]) {
        revealed[r][c] = true;
        newlyRevealed++;
      }
    }
  }

  if (revealedRatio() >= TARGET_REVEAL && !levelCleared) {
    levelCleared = true;
    showLevelBanner('Livello completato 🎉');
    noLoop();
    setTimeout(nextLevel, 1800);
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

  enemy.x = nx;
  enemy.y = ny;

  if (tracing) {
    const er = floor(enemy.y / TILE), ec = floor(enemy.x / TILE);
    for (const p of path) {
      if (p.r === er && p.c === ec) {
        tracing = false;
        path = [];
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

// ——— Audio: musica ed effetti ———
let music, sfxLevel, sfxCapture, sfxHit;
let audioReady = false;
let levelBannerSoundPlayed = false;

function initAudio() {
  if (audioReady) return;

  // Crea le sorgenti audio (sostituisci i percorsi con i tuoi file)
  music = new Audio('assets/audio/music.mp3');
  music.loop = true;
  music.volume = 0.35;

  sfxLevel = new Audio('assets/audio/levelup.wav');
  sfxLevel.volume = 0.7;

  sfxCapture = new Audio('assets/audio/capture.wav');
  sfxCapture.volume = 0.6;

  sfxHit = new Audio('assets/audio/hit.wav');
  sfxHit.volume = 0.6;

  audioReady = true;
}

function startAudioOnce() {
  initAudio();
  // Avvia musica solo al primo input dell’utente (policy browser)
  if (music && music.paused) {
    music.currentTime = 0;
    music.play().catch(() => {});
  }
}

// Avvio audio al primo gesto o tasto
window.addEventListener('pointerdown', startAudioOnce, { once: true });
window.addEventListener('keydown', startAudioOnce, { once: true });

// ——— Disegno elementi di gioco ———
function drawGridDecor() {
  // Punti bordo sicuro
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

// ——— Loop principale ———
function draw() {
  background(0);
  drawBackground();  // mostra solo le celle rivelate
  drawOverlay();     // scurisce le non rivelate

  movePlayerTick();
  moveEnemy();
  drawGridDecor();

  // HUD percentuale
  const p = document.getElementById('percent');
  if (p) p.textContent = `${(revealedRatio() * 100).toFixed(1)}%`;

  // Suono level-up quando si attiva il banner (settato in closeAndCapture)
  if (levelCleared && !levelBannerSoundPlayed) {
    startAudioOnce();
    if (sfxLevel) { try { sfxLevel.currentTime = 0; sfxLevel.play(); } catch (_) {} }
    levelBannerSoundPlayed = true;
  }

  // Schermata finale quando tutti i livelli sono conclusi
  if (gameCompleted) {
    push();
    noStroke();
    fill(0, 0, 0, 160);
    rect(0, 0, width, height);
    textAlign(CENTER, CENTER);
    textSize(36);
    fill('#22d3ee');
    text('🎉 Complimenti! Hai completato tutti i livelli 🎉', width / 2, height / 2);
    pop();

    // Dissolvenza musica
    if (music && !music.paused) {
      music.volume = max(0, music.volume - 0.005);
      if (music.volume === 0) music.pause();
    }
    noLoop();
  }
}

