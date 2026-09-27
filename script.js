// ============================================================
//  BOMBSKUY — game.js
//  No ES6 Modules. Target: Google Chrome.
// ============================================================

// ===== CONSTANTS =====
var COLS = 13;
var ROWS = 10;
var TILE = 60;
var BOMB_TIMER = 5000;
var FREEZE_DUR = 5000;
var PLAYER_SPEED = 150;
var DOG_SPEED = 550;
var BRICK_CHANCE = 0.45;

var CELL = { STONE: 0, GRASS: 1, BRICK: 2 };
var ITEM = { HEART: "heart", TNT: "tnt", ICE: "ice" };

var DIFFICULTY = {
  easy: { dogs: 1 },
  medium: { dogs: 2 },
  hard: { dogs: 3 },
};

// Fixed inner stone wall positions — must match background.png
var STONE_WALLS = [
  [2, 2],
  [2, 4],
  [2, 6],
  [2, 8],
  [4, 2],
  [4, 4],
  [4, 6],
  [4, 8],
  [6, 2],
  [6, 4],
  [6, 6],
  [6, 8],
];

// Cells kept clear of bricks (player start zone)
var SAFE = { "1,1": 1, "1,2": 1, "2,1": 1 };

// 4-directional vectors
var DIRS = [
  { dr: -1, dc: 0, dir: "up" },
  { dr: 1, dc: 0, dir: "down" },
  { dr: 0, dc: -1, dir: "left" },
  { dr: 0, dc: 1, dir: "right" },
];

// ===== GAME STATE =====
var S = {};
var totalPaused = 0;
var pauseAt = 0;

function resetState() {
  S = {
    username: "",
    difficulty: "",
    grid: [],
    items: {},
    player: {
      row: 1,
      col: 1,
      lives: 3,
      range: 1,
      frozen: false,
      frozenTimer: null,
      dir: "down",
    },
    dogs: [],
    bombs: [],
    wallsDestroyed: 0,
    tntCollected: 0,
    iceCollected: 0,
    startTime: 0,
    timerInterval: null,
    moveInterval: null,
    dogInterval: null,
    paused: false,
    gameOver: false,
    keys: {},
  };
  totalPaused = 0;
  pauseAt = 0;
}

// ===== DOM REFS =====
var D = {
  welcome: document.getElementById("welcome-screen"),
  userInput: document.getElementById("username-input"),
  levelSelect: document.getElementById("level-select"),
  playBtn: document.getElementById("play-btn"),
  instrBtn: document.getElementById("instruction-btn"),
  instrPopup: document.getElementById("instruction-popup"),
  closeInstr: document.getElementById("close-instruction"),
  countdown: document.getElementById("countdown-overlay"),
  countdownNum: document.getElementById("countdown-number"),
  gameScreen: document.getElementById("game-screen"),
  board: document.getElementById("gameboard"),
  boardArea: document.getElementById("gameboard-area"),
  playerName: document.getElementById("player-name"),
  timer: document.getElementById("timer"),
  hearts: document.getElementById("hearts-display"),
  wallsCount: document.getElementById("walls-count"),
  tntCount: document.getElementById("tnt-count"),
  iceCount: document.getElementById("ice-count"),
  pausePopup: document.getElementById("pause-popup"),
  continueBtn: document.getElementById("continue-btn"),
  gameoverScreen: document.getElementById("gameover-screen"),
  gameoverMsg: document.getElementById("gameover-msg"),
  goWalls: document.getElementById("go-walls"),
  goTnt: document.getElementById("go-tnt"),
  goIce: document.getElementById("go-ice"),
  saveScoreBtn: document.getElementById("save-score-btn"),
  lbBtn: document.getElementById("leaderboard-btn"),
  lbScreen: document.getElementById("leaderboard-screen"),
  lbBody: document.getElementById("leaderboard-body"),
  playAgainBtn: document.getElementById("play-again-btn"),
  resetBtn: document.getElementById("reset-btn"),
};

// ============================================================
//  WELCOME SCREEN
// ============================================================
D.userInput.addEventListener("input", function () {
  D.playBtn.disabled = this.value.trim() === "";
});

D.instrBtn.addEventListener("click", function () {
  D.instrPopup.classList.remove("hidden");
});

D.closeInstr.addEventListener("click", function () {
  D.instrPopup.classList.add("hidden");
});

D.playBtn.addEventListener("click", function () {
  var name = D.userInput.value.trim();
  var level = D.levelSelect.value;
  if (!name || !level) return;
  resetState();
  S.username = name;
  S.difficulty = level;
  startCountdown();
});

// ============================================================
//  COUNTDOWN
// ============================================================
function startCountdown() {
  D.welcome.classList.add("hidden");
  D.countdown.classList.remove("hidden");

  var n = 3;
  D.countdownNum.textContent = n;

  var iv = setInterval(function () {
    n--;
    if (n <= 0) {
      clearInterval(iv);
      D.countdown.classList.add("hidden");
      startGame();
    } else {
      D.countdownNum.textContent = n;
      // Replay pop-in animation
      D.countdownNum.style.animation = "none";
      void D.countdownNum.offsetWidth;
      D.countdownNum.style.animation = "";
    }
  }, 1000);
}

// ============================================================
//  GAME START
// ============================================================
var playerEl = null;

function startGame() {
  stopTimers();
  clearBoardEntities();
  buildGrid();
  renderGrid();
  createPlayer();
  spawnDogs();

  D.playerName.textContent = S.username;
  D.timer.textContent = "00:00";
  renderHearts();
  renderStats();
  D.gameScreen.classList.remove("hidden");

  S.startTime = Date.now();
  S.timerInterval = setInterval(tickTimer, 1000);
  S.moveInterval = setInterval(tickPlayer, PLAYER_SPEED);
  S.dogInterval = setInterval(tickDogs, DOG_SPEED);
}

function stopTimers() {
  clearInterval(S.timerInterval);
  clearInterval(S.moveInterval);
  clearInterval(S.dogInterval);
}

function clearBoardEntities() {
  var els = D.boardArea.querySelectorAll(".entity, .bomb, .item, .explosion");
  els.forEach(function (el) {
    el.remove();
  });
}

// ============================================================
//  GRID — BUILD
// ============================================================
function buildGrid() {
  var r, c;
  for (r = 0; r < ROWS; r++) {
    S.grid[r] = [];
    for (c = 0; c < COLS; c++) {
      S.grid[r][c] =
        r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1
          ? CELL.STONE
          : CELL.GRASS;
    }
  }

  STONE_WALLS.forEach(function (pos) {
    S.grid[pos[0]][pos[1]] = CELL.STONE;
  });

  // Random brick walls with hidden items
  for (r = 1; r < ROWS - 1; r++) {
    for (c = 1; c < COLS - 1; c++) {
      if (S.grid[r][c] !== CELL.GRASS) continue;
      if (SAFE[r + "," + c]) continue;
      if (Math.random() >= BRICK_CHANCE) continue;

      S.grid[r][c] = CELL.BRICK;

      var roll = Math.random();
      if (roll < 0.15) S.items[r + "," + c] = ITEM.HEART;
      else if (roll < 0.3) S.items[r + "," + c] = ITEM.TNT;
      else if (roll < 0.45) S.items[r + "," + c] = ITEM.ICE;
    }
  }
}

// ============================================================
//  GRID — RENDER
// ============================================================
function renderGrid() {
  D.board.innerHTML = "";

  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var cell = document.createElement("div");
      cell.className = "cell";
      cell.id = "c" + r + "_" + c;

      if (S.grid[r][c] === CELL.BRICK) {
        cell.classList.add("cell-brick");
        var wImg = document.createElement("img");
        wImg.src = "Images/wall.png";
        wImg.className = "wall-img";
        cell.appendChild(wImg);
      } else {
        cell.classList.add(
          S.grid[r][c] === CELL.STONE ? "cell-stone" : "cell-grass",
        );
      }

      D.board.appendChild(cell);
    }
  }
}

// ============================================================
//  PLAYER
// ============================================================
function createPlayer() {
  playerEl = document.createElement("div");
  playerEl.id = "player";
  playerEl.className = "entity";
  playerEl.innerHTML =
    '<img id="player-img" src="Images/char_down.png">' +
    '<div id="player-badge" style="position:absolute;bottom:2px;right:2px;z-index:9;line-height:0;"></div>';

  placeAt(playerEl, S.player.row, S.player.col);
  D.boardArea.appendChild(playerEl);
}

function updatePlayerSprite() {
  var img = document.getElementById("player-img");
  if (img) img.src = "Images/char_" + S.player.dir + ".png";
}

// ============================================================
//  INPUT
// ============================================================
var MOVE_KEYS = {
  arrowup: 1,
  w: 1,
  arrowdown: 1,
  s: 1,
  arrowleft: 1,
  a: 1,
  arrowright: 1,
  d: 1,
};
var KEY_DIR = {
  arrowup: { dr: -1, dc: 0, dir: "up" },
  w: { dr: -1, dc: 0, dir: "up" },
  arrowdown: { dr: 1, dc: 0, dir: "down" },
  s: { dr: 1, dc: 0, dir: "down" },
  arrowleft: { dr: 0, dc: -1, dir: "left" },
  a: { dr: 0, dc: -1, dir: "left" },
  arrowright: { dr: 0, dc: 1, dir: "right" },
  d: { dr: 0, dc: 1, dir: "right" },
};
var KEY_ORDER = [
  "arrowup",
  "w",
  "arrowdown",
  "s",
  "arrowleft",
  "a",
  "arrowright",
  "d",
];

document.addEventListener("keydown", function (e) {
  var key = e.key.toLowerCase();
  if (key === " ") {
    e.preventDefault();
    if (!S.paused && !S.gameOver) placeBomb();
    return;
  }
  if (key === "escape") {
    e.preventDefault();
    togglePause();
    return;
  }
  if (MOVE_KEYS[key]) {
    e.preventDefault();
    S.keys[key] = true;
  }
});

document.addEventListener("keyup", function (e) {
  delete S.keys[e.key.toLowerCase()];
});

// ============================================================
//  PLAYER TICK
// ============================================================
function tickPlayer() {
  if (S.paused || S.gameOver || S.player.frozen) return;

  for (var i = 0; i < KEY_ORDER.length; i++) {
    var key = KEY_ORDER[i];
    if (!S.keys[key]) continue;

    var m = KEY_DIR[key];
    var nr = S.player.row + m.dr;
    var nc = S.player.col + m.dc;

    S.player.dir = m.dir;
    updatePlayerSprite();

    if (canWalk(nr, nc)) {
      S.player.row = nr;
      S.player.col = nc;
      placeAt(playerEl, nr, nc);
      pickupItem(nr, nc);
      checkDogCollision();
    }
    break;
  }
}

function canWalk(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  return S.grid[r][c] === CELL.GRASS;
}

// ============================================================
//  DOGS
// ============================================================
function spawnDogs() {
  var count = DIFFICULTY[S.difficulty].dogs;
  for (var i = 0; i < count; i++) {
    var pos = randomGrassCell();
    var el = document.createElement("div");
    el.className = "entity dog";
    el.innerHTML = '<img src="Images/dog_down.png" id="dimg' + i + '">';
    placeAt(el, pos.row, pos.col);
    D.boardArea.appendChild(el);
    S.dogs.push({ row: pos.row, col: pos.col, el: el, alive: true, id: i });
  }
}

function randomGrassCell() {
  for (var t = 0; t < 300; t++) {
    var r = Math.floor(Math.random() * (ROWS - 2)) + 1;
    var c = Math.floor(Math.random() * (COLS - 2)) + 1;
    if (S.grid[r][c] !== CELL.GRASS) continue;
    var dist = Math.abs(r - S.player.row) + Math.abs(c - S.player.col);
    if (dist < 4) continue;
    return { row: r, col: c };
  }
  // Fallback: scan bottom-right
  for (var r = ROWS - 2; r >= 1; r--)
    for (var c = COLS - 2; c >= 1; c--)
      if (S.grid[r][c] === CELL.GRASS) return { row: r, col: c };
  return { row: 8, col: 11 };
}

function tickDogs() {
  if (S.paused || S.gameOver) return;

  S.dogs.forEach(function (dog) {
    if (!dog.alive) return;

    var next = bfsNext(dog.row, dog.col, S.player.row, S.player.col);
    if (!next) return;

    dog.row = next.row;
    dog.col = next.col;

    var img = document.getElementById("dimg" + dog.id);
    if (img) img.src = "Images/dog_" + next.dir + ".png";
    placeAt(dog.el, dog.row, dog.col);
  });

  checkDogCollision();
}

// BFS: returns first step from (sr,sc) toward (tr,tc), or null
function bfsNext(sr, sc, tr, tc) {
  if (sr === tr && sc === tc) return null;

  var visited = {};
  visited[sr + "," + sc] = true;
  var queue = [{ r: sr, c: sc, first: null }];

  while (queue.length) {
    var cur = queue.shift();
    for (var i = 0; i < DIRS.length; i++) {
      var d = DIRS[i];
      var nr = cur.r + d.dr;
      var nc = cur.c + d.dc;
      var key = nr + "," + nc;

      if (visited[key]) continue;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (S.grid[nr][nc] === CELL.STONE) continue;
      if (S.grid[nr][nc] === CELL.BRICK) continue;

      visited[key] = true;
      var first = cur.first || { row: nr, col: nc, dir: d.dir };

      if (nr === tr && nc === tc) return first;
      queue.push({ r: nr, c: nc, first: first });
    }
  }
  return null;
}

function checkDogCollision() {
  S.dogs.forEach(function (dog) {
    if (!dog.alive) return;
    if (dog.row === S.player.row && dog.col === S.player.col) hurtPlayer();
  });
}

// ============================================================
//  BOMBS
// ============================================================
function placeBomb() {
  var r = S.player.row;
  var c = S.player.col;

  // One bomb per cell
  for (var i = 0; i < S.bombs.length; i++)
    if (S.bombs[i].row === r && S.bombs[i].col === c) return;

  var el = document.createElement("div");
  el.className = "bomb";
  el.innerHTML = '<img src="Images/bomb.png">';
  placeAt(el, r, c);
  D.boardArea.appendChild(el);

  var bomb = { row: r, col: c, range: S.player.range, el: el, timer: null };
  S.bombs.push(bomb);

  bomb.timer = setTimeout(function () {
    triggerExplosion(bomb);
  }, BOMB_TIMER);
}

function triggerExplosion(bomb) {
  if (S.gameOver) return;
  if (bomb.el && bomb.el.parentNode) bomb.el.remove();
  S.bombs = S.bombs.filter(function (b) {
    return b !== bomb;
  });

  var hits = [[bomb.row, bomb.col]];

  DIRS.forEach(function (d) {
    for (var i = 1; i <= bomb.range; i++) {
      var r = bomb.row + d.dr * i;
      var c = bomb.col + d.dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) break;
      if (S.grid[r][c] === CELL.STONE) break;

      hits.push([r, c]);

      if (S.grid[r][c] === CELL.BRICK) {
        destroyBrick(r, c);
        break;
      }
    }
  });

  hits.forEach(function (p) {
    showExplosion(p[0], p[1]);
  });

  // Check player hit
  hits.forEach(function (p) {
    if (p[0] === S.player.row && p[1] === S.player.col) hurtPlayer();
  });

  // Check dog hits
  S.dogs.forEach(function (dog) {
    if (!dog.alive) return;
    hits.forEach(function (p) {
      if (dog.row === p[0] && dog.col === p[1]) {
        dog.alive = false;
        if (dog.el) dog.el.remove();
      }
    });
  });
  S.dogs = S.dogs.filter(function (d) {
    return d.alive;
  });
}

function destroyBrick(r, c) {
  S.grid[r][c] = CELL.GRASS;
  S.wallsDestroyed++;

  var cell = document.getElementById("c" + r + "_" + c);
  if (cell) {
    cell.classList.replace("cell-brick", "cell-grass");
    var wImg = cell.querySelector(".wall-img");
    if (wImg) wImg.remove();
  }

  // Reveal hidden item if any
  var key = r + "," + c;
  if (S.items[key]) {
    revealItem(r, c, S.items[key]);
    delete S.items[key];
  }

  renderStats();
}

function showExplosion(r, c) {
  var el = document.createElement("div");
  el.className = "explosion";
  placeAt(el, r, c);
  D.boardArea.appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 500);
}

// ============================================================
//  ITEMS
// ============================================================
function revealItem(r, c, type) {
  var src =
    type === ITEM.TNT
      ? "Images/tnt.png"
      : type === ITEM.ICE
        ? "Images/ice.png"
        : "Images/heart.png";

  var el = document.createElement("div");
  el.className = "item";
  el.dataset.r = r;
  el.dataset.c = c;
  el.dataset.type = type;
  el.innerHTML = '<img src="' + src + '">';
  placeAt(el, r, c);
  D.boardArea.appendChild(el);
}

function pickupItem(r, c) {
  var key = r + "," + c;
  if (!S.items[key]) return;

  var type = S.items[key];
  delete S.items[key];

  // Remove item element from board
  D.boardArea.querySelectorAll(".item").forEach(function (el) {
    if (+el.dataset.r === r && +el.dataset.c === c) el.remove();
  });

  applyItem(type);
  setBadge(type);
  renderStats();
}

function applyItem(type) {
  if (type === ITEM.TNT) {
    S.player.range *= 2;
    S.tntCollected++;
  } else if (type === ITEM.ICE) {
    S.iceCollected++;
    applyFreeze();
  } else if (type === ITEM.HEART) {
    // Broken heart — lose 1 life
    S.player.lives = Math.max(0, S.player.lives - 1);
    renderHearts();
    if (S.player.lives <= 0) endGame();
  }
}

function applyFreeze() {
  S.player.frozen = true;
  if (playerEl) playerEl.classList.add("frozen");
  if (S.player.frozenTimer) clearTimeout(S.player.frozenTimer);
  S.player.frozenTimer = setTimeout(function () {
    S.player.frozen = false;
    if (playerEl) playerEl.classList.remove("frozen");
  }, FREEZE_DUR);
}

// Small badge on player showing last collected item
function setBadge(type) {
  var badge = document.getElementById("player-badge");
  if (!badge) return;
  var src =
    type === ITEM.TNT
      ? "Images/tnt.png"
      : type === ITEM.ICE
        ? "Images/ice.png"
        : "Images/heart.png";
  badge.innerHTML = '<img src="' + src + '" style="width:18px;height:18px;">';
}

// ============================================================
//  PLAYER HURT
// ============================================================
function hurtPlayer() {
  if (S.gameOver) return;
  if (playerEl && playerEl.classList.contains("hurt")) return; // invincibility window

  S.player.lives--;
  renderHearts();

  if (playerEl) {
    playerEl.classList.add("hurt");
    setTimeout(function () {
      if (playerEl) playerEl.classList.remove("hurt");
    }, 500);
  }

  if (S.player.lives <= 0) endGame();
}

// ============================================================
//  PAUSE
// ============================================================
function togglePause() {
  if (S.gameOver) return;
  S.paused = !S.paused;

  if (S.paused) {
    pauseAt = Date.now();
    D.pausePopup.classList.remove("hidden");
    stopTimers();
  } else {
    totalPaused += Date.now() - pauseAt;
    D.pausePopup.classList.add("hidden");
    S.timerInterval = setInterval(tickTimer, 1000);
    S.moveInterval = setInterval(tickPlayer, PLAYER_SPEED);
    S.dogInterval = setInterval(tickDogs, DOG_SPEED);
  }
}

D.continueBtn.addEventListener("click", function () {
  if (S.paused) togglePause();
});

// ============================================================
//  TIMER
// ============================================================
function tickTimer() {
  var elapsed = Math.floor((Date.now() - S.startTime - totalPaused) / 1000);
  var mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  var ss = String(elapsed % 60).padStart(2, "0");
  D.timer.textContent = mm + ":" + ss;
}

// ============================================================
//  GAME OVER
// ============================================================
function endGame() {
  if (S.gameOver) return;
  S.gameOver = true;
  stopTimers();

  // Cancel pending bomb timers
  S.bombs.forEach(function (b) {
    clearTimeout(b.timer);
    if (b.el && b.el.parentNode) b.el.remove();
  });
  S.bombs = [];

  var time = D.timer.textContent;
  D.gameoverMsg.textContent =
    "Good job " + S.username + "! your time " + time + " with results:";
  D.goWalls.textContent = S.wallsDestroyed;
  D.goTnt.textContent = S.tntCollected;
  D.goIce.textContent = S.iceCollected;

  D.saveScoreBtn.className = "btn-orange";
  D.saveScoreBtn.disabled = false;
  D.saveScoreBtn.textContent = "Save Score";
  D.lbBtn.className = "btn-blue";

  setTimeout(function () {
    D.gameScreen.classList.add("hidden");
    D.gameoverScreen.classList.remove("hidden");
  }, 700);
}

D.saveScoreBtn.addEventListener("click", function () {
  if (this.disabled) return;
  var scores = JSON.parse(localStorage.getItem("bombskuy") || "[]");
  scores.push({
    username: S.username,
    time: D.timer.textContent,
    walls: S.wallsDestroyed,
    tnt: S.tntCollected,
    ice: S.iceCollected,
  });
  localStorage.setItem("bombskuy", JSON.stringify(scores));
  this.textContent = "Saved!";
  this.disabled = true;
});

D.lbBtn.addEventListener("click", showLeaderboard);

// ============================================================
//  LEADERBOARD
// ============================================================
function showLeaderboard() {
  D.gameoverScreen.classList.add("hidden");
  D.lbScreen.classList.remove("hidden");

  D.playAgainBtn.className = "btn-orange";
  D.resetBtn.className = "btn-blue";

  var scores = JSON.parse(localStorage.getItem("bombskuy") || "[]");
  scores.sort(function (a, b) {
    if (b.walls !== a.walls) return b.walls - a.walls;
    if (b.tnt !== a.tnt) return b.tnt - a.tnt;
    return b.ice - a.ice;
  });

  D.lbBody.innerHTML = "";
  scores.forEach(function (s) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      s.username +
      "</td>" +
      "<td>" +
      s.time +
      "</td>" +
      "<td>" +
      s.walls +
      "</td>" +
      "<td>" +
      s.tnt +
      "</td>" +
      "<td>" +
      s.ice +
      "</td>";
    D.lbBody.appendChild(tr);
  });
}

D.playAgainBtn.addEventListener("click", function () {
  D.lbScreen.classList.add("hidden");
  D.userInput.value = "";
  D.levelSelect.value = "";
  D.playBtn.disabled = true;
  D.welcome.classList.remove("hidden");
});

D.resetBtn.addEventListener("click", function () {
  localStorage.removeItem("bombskuy");
  showLeaderboard();
});

// ============================================================
//  HELPERS
// ============================================================
function placeAt(el, row, col) {
  el.style.top = row * TILE + "px";
  el.style.left = col * TILE + "px";
}

function renderHearts() {
  D.hearts.innerHTML = "";
  for (var i = 0; i < S.player.lives; i++) {
    var img = document.createElement("img");
    img.src = "Images/heart_indicator.png";
    D.hearts.appendChild(img);
  }
}

function renderStats() {
  D.wallsCount.textContent = S.wallsDestroyed;
  D.tntCount.textContent = S.tntCollected;
  D.iceCount.textContent = S.iceCollected;
}
