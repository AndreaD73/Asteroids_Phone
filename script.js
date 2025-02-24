window.onload = function() {
  // Costante per la versione (opzionale)
  const VERSION = "Versione: 1.0";
  
  // Imposta il canvas a dimensioni schermo intero
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Stato del gioco: "start", "playing", "gameover", "levelTransition"
  let gameState = "start";
  let numPlayers = 0;
  let players = [];
  let asteroids = [];
  let bullets = [];
  let explosions = [];
  let aliens = [];
  let score = 0;
  let lives = 3;
  let currentLevel = 1;
  let lastTime = 0;
  let nextBonusScore = 1000;
  let alienSpawnTimer = 0;
  const baseAlienSpawnInterval = 15000;
  let levelTransitionTimer = 0;
  const levelTransitionDuration = 2000;
  
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Audio
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(frequency, duration, type = "sine", volume = 0.2) {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  }
  
  function laserSound() {
    playSound(1000, 0.05, "sawtooth", 0.3);
  }
  function explosionSound() {
    playSound(60, 0.3, "sawtooth", 0.4);
  }
  function thrustSound() {
    playSound(200, 0.05, "triangle", 0.2);
  }
  function alienLaserSound() {
    playSound(700, 0.1, "sawtooth", 0.4);
  }
  function bonusSound() {
    playSound(600, 0.2, "sine", 0.3);
  }
  
  class Explosion {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.duration = 500;
      this.elapsed = 0;
      this.maxRadius = 30;
    }
    update(deltaTime) {
      this.elapsed += deltaTime;
    }
    draw() {
      const progress = this.elapsed / this.duration;
      const radius = this.maxRadius * progress;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, radius, 0, 2 * Math.PI);
      const alpha = 1 - progress;
      ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`;
      ctx.fill();
      ctx.restore();
    }
    isDone() {
      return this.elapsed >= this.duration;
    }
  }
  
  class Ship {
    constructor(x, y, color, controls) {
      this.x = x;
      this.y = y;
      this.radius = 15;
      this.angle = -Math.PI / 2;
      this.velX = 0;
      this.velY = 0;
      this.color = color;
      this.controls = controls;
      this.coolDown = 0;
      this.lives = lives;
      this.score = 0;
    }
    update(deltaTime) {
      if (keyState[this.controls.left]) {
        this.angle -= 0.002 * deltaTime;
      }
      if (keyState[this.controls.right]) {
        this.angle += 0.002 * deltaTime;
      }
      if (keyState[this.controls.thrust]) {
        const force = 0.0002 * deltaTime;
        this.velX += Math.cos(this.angle) * force;
        this.velY += Math.sin(this.angle) * force;
        thrustSound();
      }
      this.x += this.velX * deltaTime;
      this.y += this.velY * deltaTime;
      if (this.x < 0) this.x += canvas.width;
      if (this.x > canvas.width) this.x -= canvas.width;
      if (this.y < 0) this.y += canvas.height;
      if (this.y > canvas.height) this.y -= canvas.height;
      if (keyState[this.controls.shoot] && this.coolDown <= 0) {
        this.shoot();
        this.coolDown = 300;
      }
      if (this.coolDown > 0) {
        this.coolDown -= deltaTime;
      }
    }
    shoot() {
      const bulletX = this.x + Math.cos(this.angle) * this.radius;
      const bulletY = this.y + Math.sin(this.angle) * this.radius;
      const bulletSpeed = 0.5;
      bullets.push(new Bullet(bulletX, bulletY, this.angle, bulletSpeed, this.color, "player"));
      laserSound();
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-10, 10);
      ctx.lineTo(-10, -10);
      ctx.closePath();
      ctx.stroke();
      if (keyState[this.controls.thrust]) {
        ctx.beginPath();
        ctx.moveTo(-10, 5);
        ctx.lineTo(-18, 0);
        ctx.lineTo(-10, -5);
        ctx.fillStyle = "orange";
        ctx.fill();
      }
      ctx.restore();
    }
  }
  
  class Bullet {
    constructor(x, y, angle, speed, color, owner) {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.speed = speed;
      this.radius = 2;
      this.color = color;
      this.lifeTime = 2000;
      this.owner = owner;
    }
    update(deltaTime) {
      this.x += Math.cos(this.angle) * this.speed * deltaTime;
      this.y += Math.sin(this.angle) * this.speed * deltaTime;
      this.lifeTime -= deltaTime;
      if (this.x < 0) this.x += canvas.width;
      if (this.x > canvas.width) this.x -= canvas.width;
      if (this.y < 0) this.y += canvas.height;
      if (this.y > canvas.height) this.y -= canvas.height;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }
  
  class Asteroid {
    constructor(x, y, radius, level = 1) {
      this.x = x;
      this.y = y;
      this.radius = radius;
      this.level = level;
      const baseSpeed = 0.01;
      const speedIncrement = 0.005;
      const speed = baseSpeed + Math.random() * 0.005 + (currentLevel - 1) * speedIncrement;
      const angle = Math.random() * Math.PI * 2;
      this.velX = Math.cos(angle) * speed;
      this.velY = Math.sin(angle) * speed;
      this.offsets = [];
      this.vertexCount = 8 + Math.floor(Math.random() * 4);
      for (let i = 0; i < this.vertexCount; i++) {
        this.offsets.push((Math.random() * 0.4) + 0.8);
      }
    }
    update(deltaTime) {
      this.x += this.velX * deltaTime;
      this.y += this.velY * deltaTime;
      if (this.x < -this.radius) this.x += canvas.width + this.radius;
      if (this.x > canvas.width + this.radius) this.x -= canvas.width + this.radius;
      if (this.y < -this.radius) this.y += canvas.height + this.radius;
      if (this.y > canvas.height + this.radius) this.y -= canvas.height + this.radius;
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.vertexCount; i++) {
        const angle = (i / this.vertexCount) * Math.PI * 2;
        const r = this.radius * this.offsets[i];
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
  
  class AlienShip {
    constructor() {
      this.width = 40;
      this.height = 20;
      this.y = Math.random() * canvas.height * 0.3;
      this.direction = Math.random() < 0.5 ? 1 : -1;
      this.x = this.direction === 1 ? -this.width : canvas.width + this.width;
      this.speed = 0.1 + (currentLevel - 1) * 0.01;
      this.coolDown = Math.max(2000 - (currentLevel - 1) * 100, 1000);
    }
    update(deltaTime) {
      this.x += this.speed * this.direction * deltaTime;
      this.coolDown -= deltaTime;
      if (this.coolDown <= 0) {
        let targetX = canvas.width / 2;
        let targetY = canvas.height / 2;
        let idealAngle = Math.atan2(targetY - this.y, targetX - this.x);
        let errorMargin = Math.max(Math.PI/6 - (currentLevel - 1) * (Math.PI/60), Math.PI/30);
        let randomError = (Math.random() * 2 - 1) * errorMargin;
        let angle = idealAngle + randomError;
        bullets.push(new Bullet(this.x, this.y, angle, 0.4 + (currentLevel - 1) * 0.02, "lime", "alien"));
        alienLaserSound();
        this.coolDown = Math.max(2000 - (currentLevel - 1) * 100, 1000);
      }
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = "lime";
      ctx.beginPath();
      ctx.ellipse(0, 0, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -this.height / 4, this.width / 4, Math.PI, 2 * Math.PI);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.restore();
    }
    isOffScreen() {
      return (this.direction === 1 && this.x - this.width > canvas.width) ||
             (this.direction === -1 && this.x + this.width < 0);
    }
  }
  
  const keyState = {};
  window.addEventListener("keydown", e => { keyState[e.key] = true; });
  window.addEventListener("keyup", e => { keyState[e.key] = false; });
  
  function startGameWithPlayers(n) {
    numPlayers = n;
    console.log("Avvio gioco con " + n + " giocatore/i");
    document.getElementById("overlay").style.display = "none";
    if (isTouchDevice || window.innerWidth < 768) {
      document.getElementById("mobileControls").style.display = "block";
    }
    gameState = "playing";
    players = [];
    bullets = [];
    asteroids = [];
    explosions = [];
    aliens = [];
    score = 0;
    currentLevel = 1;
    nextBonusScore = 1000;
    if (numPlayers >= 1) {
      players.push(new Ship(canvas.width * 0.3, canvas.height / 2, "cyan", {
        left: "ArrowLeft",
        right: "ArrowRight",
        thrust: "ArrowUp",
        shoot: " "
      }));
    }
    if (numPlayers === 2) {
      players.push(new Ship(canvas.width * 0.7, canvas.height / 2, "yellow", {
        left: "a",
        right: "d",
        thrust: "w",
        shoot: "s"
      }));
    }
    startLevel();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }
  
  document.getElementById("onePlayer").addEventListener("click", () => startGameWithPlayers(1));
  document.getElementById("twoPlayers").addEventListener("click", () => startGameWithPlayers(2));
  
  function setupMobileControls() {
    const mobileLeft = document.getElementById("mobileLeft");
    const mobileRight = document.getElementById("mobileRight");
    const mobileThrust = document.getElementById("mobileThrust");
    const mobileShoot = document.getElementById("mobileShoot");
    
    mobileLeft.addEventListener("touchstart", e => { e.preventDefault(); keyState["ArrowLeft"] = true; });
    mobileLeft.addEventListener("touchend", e => { e.preventDefault(); keyState["ArrowLeft"] = false; });
    mobileLeft.addEventListener("mousedown", e => { e.preventDefault(); keyState["ArrowLeft"] = true; });
    mobileLeft.addEventListener("mouseup", e => { e.preventDefault(); keyState["ArrowLeft"] = false; });
    
    mobileRight.addEventListener("touchstart", e => { e.preventDefault(); keyState["ArrowRight"] = true; });
    mobileRight.addEventListener("touchend", e => { e.preventDefault(); keyState["ArrowRight"] = false; });
    mobileRight.addEventListener("mousedown", e => { e.preventDefault(); keyState["ArrowRight"] = true; });
    mobileRight.addEventListener("mouseup", e => { e.preventDefault(); keyState["ArrowRight"] = false; });
    
    mobileThrust.addEventListener("touchstart", e => { e.preventDefault(); keyState["ArrowUp"] = true; });
    mobileThrust.addEventListener("touchend", e => { e.preventDefault(); keyState["ArrowUp"] = false; });
    mobileThrust.addEventListener("mousedown", e => { e.preventDefault(); keyState["ArrowUp"] = true; });
    mobileThrust.addEventListener("mouseup", e => { e.preventDefault(); keyState["ArrowUp"] = false; });
    
    mobileShoot.addEventListener("touchstart", e => { e.preventDefault(); keyState[" "] = true; });
    mobileShoot.addEventListener("touchend", e => { e.preventDefault(); keyState[" "] = false; });
    mobileShoot.addEventListener("mousedown", e => { e.preventDefault(); keyState[" "] = true; });
    mobileShoot.addEventListener("mouseup", e => { e.preventDefault(); keyState[" "] = false; });
  }
  if (isTouchDevice || window.innerWidth < 768) setupMobileControls();
  
  function startLevel() {
    const numAsteroids = 4 + currentLevel;
    for (let i = 0; i < numAsteroids; i++) {
      let x = Math.random() * canvas.width;
      let y = Math.random() * canvas.height;
      let radius = 40;
      asteroids.push(new Asteroid(x, y, radius, 1));
    }
    gameState = "levelTransition";
    levelTransitionTimer = levelTransitionDuration;
  }
  
  function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    update(deltaTime);
    render();
    if (gameState !== "gameover") {
      requestAnimationFrame(gameLoop);
    }
  }
  
  function update(deltaTime) {
    if (gameState === "levelTransition") {
      levelTransitionTimer -= deltaTime;
      if (levelTransitionTimer <= 0) {
        gameState = "playing";
      }
    }
    players.forEach(ship => ship.update(deltaTime));
    bullets.forEach((bullet, index) => {
      bullet.update(deltaTime);
      if (bullet.lifeTime <= 0) {
        bullets.splice(index, 1);
      }
    });
    asteroids.forEach(asteroid => asteroid.update(deltaTime));
    explosions.forEach((explosion, index) => {
      explosion.update(deltaTime);
      if (explosion.isDone()) explosions.splice(index, 1);
    });
    aliens.forEach((alien, index) => {
      alien.update(deltaTime);
      if (alien.isOffScreen()) aliens.splice(index, 1);
    });
    
    bullets.forEach((bullet, bIndex) => {
      if (bullet.owner === "player") {
        asteroids.forEach((asteroid, aIndex) => {
          if (distance(bullet.x, bullet.y, asteroid.x, asteroid.y) < asteroid.radius) {
            bullets.splice(bIndex, 1);
            destroyAsteroid(asteroid, aIndex);
            score += (5 - asteroid.level) * 20;
            explosionSound();
            while (score >= nextBonusScore) {
              players.forEach(ship => ship.lives++);
              bonusSound();
              nextBonusScore += 1000;
            }
          }
        });
      }
    });
  
    bullets.forEach((bullet, bIndex) => {
      if (bullet.owner === "player") {
        aliens.forEach((alien, aIndex) => {
          if (distance(bullet.x, bullet.y, alien.x, alien.y) < alien.width/2) {
            bullets.splice(bIndex, 1);
            explosions.push(new Explosion(alien.x, alien.y));
            explosionSound();
            score += 500;
            aliens.splice(aIndex, 1);
          }
        });
      }
    });
  
    bullets.forEach((bullet, bIndex) => {
      if (bullet.owner === "alien") {
        players.forEach(ship => {
          if (distance(bullet.x, bullet.y, ship.x, ship.y) < ship.radius) {
            bullets.splice(bIndex, 1);
            explosions.push(new Explosion(ship.x, ship.y));
            explosionSound();
            ship.lives--;
            if (ship.lives <= 0) {
              endGame();
            } else {
              ship.x = canvas.width / 2;
              ship.y = canvas.height / 2;
              ship.velX = 0;
              ship.velY = 0;
            }
          }
        });
      }
    });
  
    players.forEach(ship => {
      asteroids.forEach((asteroid) => {
        if (distance(ship.x, ship.y, asteroid.x, asteroid.y) < asteroid.radius + ship.radius) {
          explosions.push(new Explosion(ship.x, ship.y));
          explosionSound();
          ship.lives--;
          if (ship.lives <= 0) {
            endGame();
          } else {
            ship.x = canvas.width / 2;
            ship.y = canvas.height / 2;
            ship.velX = 0;
            ship.velY = 0;
          }
        }
      });
    });
  
    alienSpawnTimer += deltaTime;
    let alienSpawnInterval = Math.max(baseAlienSpawnInterval - (currentLevel - 1) * 500, 5000);
    if (alienSpawnTimer > alienSpawnInterval) {
      alienSpawnTimer = 0;
      aliens.push(new AlienShip());
    }
  
    if (gameState === "playing" && asteroids.length === 0) {
      currentLevel++;
      startLevel();
    }
  }
  
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    players.forEach(ship => ship.draw());
    bullets.forEach(bullet => bullet.draw());
    asteroids.forEach(asteroid => asteroid.draw());
    aliens.forEach(alien => alien.draw());
    explosions.forEach(explosion => explosion.draw());
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText("Punteggio: " + score, 20, 30);
    players.forEach((ship, index) => {
      ctx.fillText("Giocatore " + (index + 1) + " vite: " + ship.lives, 20, 60 + index * 30);
    });
    if (gameState === "levelTransition") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "48px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Livello " + currentLevel, canvas.width / 2, canvas.height / 2);
      ctx.textAlign = "left";
    }
    // Versione in alto a destra
    ctx.fillStyle = "white";
    ctx.font = "16px Arial";
    ctx.textAlign = "right";
    ctx.fillText(VERSION, canvas.width - 10, 20);
    ctx.textAlign = "left";
  }
  
  function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }
  
  function destroyAsteroid(asteroid, index) {
    const fragments = 2;
    if (asteroid.level < 4) {
      for (let i = 0; i < fragments; i++) {
        let newRadius = asteroid.radius * 0.6;
        let newLevel = asteroid.level + 1;
        let newAsteroid = new Asteroid(asteroid.x, asteroid.y, newRadius, newLevel);
        let randomAngle = Math.random() * Math.PI * 2;
        let impulse = 0.05;
        newAsteroid.velX += Math.cos(randomAngle) * impulse;
        newAsteroid.velY += Math.sin(randomAngle) * impulse;
        asteroids.push(newAsteroid);
      }
    }
    asteroids.splice(index, 1);
  }
  
  function endGame() {
    gameState = "gameover";
    document.getElementById("overlay").style.display = "block";
    document.getElementById("startScreen").style.display = "block";
    document.getElementById("gameOverScreen").style.display = "block";
    document.getElementById("finalScore").innerText = "Punteggio finale: " + score;
    
    let leaderboard = JSON.parse(localStorage.getItem("leaderboard")) || [];
    if (leaderboard.length < 3 || score > Math.min(...leaderboard.map(entry => entry.score))) {
      let name = prompt("Complimenti! Hai fatto parte dei primi 3. Inserisci il tuo nome:");
      if (!name) name = "Anonimo";
      leaderboard.push({name: name, score: score});
    } else {
      leaderboard.push({name: "Anonimo", score: score});
    }
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 3);
    localStorage.setItem("leaderboard", JSON.stringify(leaderboard));
    
    let leaderboardText = "Classifica:\n";
    leaderboard.forEach((entry, index) => {
      leaderboardText += (index + 1) + ". " + entry.name + " - " + entry.score + "\n";
    });
    document.getElementById("finalScore").innerText += "\n" + leaderboardText;
    
    if (isTouchDevice || window.innerWidth < 768) {
      document.getElementById("mobileControls").style.display = "none";
    }
  }
  
  document.getElementById("restartButton").addEventListener("click", function() {
    document.getElementById("overlay").style.display = "block";
    document.getElementById("startScreen").style.display = "block";
    document.getElementById("gameOverScreen").style.display = "none";
    gameState = "start";
    if (isTouchDevice || window.innerWidth < 768) {
      document.getElementById("mobileControls").style.display = "block";
    }
  });
};
