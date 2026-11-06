const gameContainer = document.getElementById('game-container');
const rocky = document.getElementById('rocky');
const scoreElement = document.getElementById('score');
const livesElement = document.getElementById('lives');
const hitFlash = document.getElementById('hit-flash');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const restartBtn = document.getElementById('restart-btn');

let score = 0;
let lives = 3;
let gameLoop;
let isGameOver = false;
let isInvulnerable = false;
let isJumping = false;
let activeObjects = [];
let speedLines = [];
let spawnTimer = 0;

let currentSpeed = 0.006; 
let spawnRate = 60; 

const containerWidth = gameContainer.offsetWidth;
const containerHeight = gameContainer.offsetHeight;
const rockyWidth = 120;

const lanePositions = [
    20,                                     
    (containerWidth / 2) - (rockyWidth / 2),
    containerWidth - rockyWidth - 20        
]; 
let currentLane = 1; // 0: Left, 1: Center, 2: Right

// Perfectly matched to the vanishing point (blue circle)
const horizonY = containerHeight * 0.45; 
const endY = containerHeight + 150; 
const horizonX = containerWidth / 2; 
const endXSpread = containerWidth * 0.6; 

// --- Swipe Controls ---
let touchStartX = 0;
let touchStartY = 0;

gameContainer.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive: true});

gameContainer.addEventListener('touchend', e => {
    if (isGameOver) return;
    let touchEndX = e.changedTouches[0].screenX;
    let touchEndY = e.changedTouches[0].screenY;
    
    let dx = touchEndX - touchStartX;
    let dy = touchEndY - touchStartY;
    
    // Determine Swipe Direction
    if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 30) {
            if (dx > 0 && currentLane < 2) currentLane++; // Swipe Right
            else if (dx < 0 && currentLane > 0) currentLane--; // Swipe Left
            updateRockyPosition();
        }
    } else {
        if (dy < -30) jump(); // Swipe Up
    }
}, {passive: true});

// Keyboard Fallback
document.addEventListener('keydown', (e) => {
    if (isGameOver) return;
    if (e.key === 'ArrowLeft' && currentLane > 0) currentLane--;
    if (e.key === 'ArrowRight' && currentLane < 2) currentLane++;
    if (e.key === 'ArrowUp' || e.key === ' ') jump();
    updateRockyPosition();
});

function jump() {
    if (isJumping) return;
    isJumping = true;
    rocky.classList.remove('running');
    rocky.classList.add('jumping');
    rocky.style.backgroundImage = "url('assets/rocky-jump.png')";
    
    setTimeout(() => {
        if (isGameOver) return;
        rocky.classList.remove('jumping');
        rocky.classList.add('running');
        rocky.style.backgroundImage = "url('assets/rocky-run.png')";
        isJumping = false;
    }, 500);
}

function updateRockyPosition() {
    rocky.style.left = lanePositions[currentLane] + 'px';
}

function updateLivesDisplay() {
    let hearts = '';
    for (let i = 0; i < 3; i++) hearts += (i < lives) ? '❤️' : '🖤';
    livesElement.innerText = hearts;
}

// --- Dynamic Speed Illusion ---
function spawnSpeedLine() {
    const line = document.createElement('div');
    line.classList.add('speed-line');
    gameContainer.appendChild(line);
    speedLines.push({ element: line, progress: 0 });
}

function spawnObject() {
    const lane = Math.floor(Math.random() * 3); 
    const types = ['pumpkin', 'ghost', 'bat'];
    const isCandy = Math.random() > 0.65; 
    const type = isCandy ? 'candy' : types[Math.floor(Math.random() * types.length)];

    const obj = document.createElement('div');
    obj.classList.add('game-object', type);
    
    obj.style.width = (isCandy ? 60 : 90) + 'px';
    obj.style.height = (isCandy ? 60 : 90) + 'px';
    gameContainer.appendChild(obj);

    activeObjects.push({
        element: obj,
        lane: lane,
        type: type,
        progress: 0, // Force spawn exactly at the vanishing point
        isCandy: isCandy,
        processed: false
    });
}

function takeDamage() {
    if (isInvulnerable) return;
    
    lives--;
    updateLivesDisplay();
    hitFlash.classList.add('flash-active');
    setTimeout(() => hitFlash.classList.remove('flash-active'), 150);
    
    if (lives <= 0) {
        triggerGameOver();
    } else {
        isInvulnerable = true;
        rocky.classList.add('invulnerable');
        setTimeout(() => {
            isInvulnerable = false;
            rocky.classList.remove('invulnerable');
        }, 1500); // 1.5 seconds of invincibility
    }
}

function update() {
    if (isGameOver) return;

    currentSpeed = 0.006 + (score * 0.0003); 
    spawnRate = Math.max(15, 60 - (score * 0.4)); 

    spawnTimer++;
    if (spawnTimer > spawnRate) { 
        spawnObject();
        spawnTimer = 0;
    }

    if (Math.random() > 0.7) spawnSpeedLine();

    // Render Speed Lines
    for (let i = speedLines.length - 1; i >= 0; i--) {
        let line = speedLines[i];
        line.progress += currentSpeed * 1.5;
        if (line.progress >= 1) {
            line.element.remove();
            speedLines.splice(i, 1);
            continue;
        }
        const currentY = horizonY + (line.progress * (endY - horizonY));
        line.element.style.top = currentY + 'px';
        line.element.style.left = '10%';
        line.element.style.width = '80%';
        line.element.style.transform = `scaleY(${line.progress * 3})`;
        line.element.style.opacity = line.progress > 0.5 ? 1 - line.progress : line.progress;
    }

    // Render Objects & Collision
    for (let i = activeObjects.length - 1; i >= 0; i--) {
        let obj = activeObjects[i];
        obj.progress += currentSpeed + (obj.progress * 0.015); 

        if (obj.progress >= 1.2) {
            obj.element.remove();
            activeObjects.splice(i, 1);
            continue;
        }

        const scale = obj.progress; 
        const currentY = horizonY + (obj.progress * (endY - horizonY));
        const currentSpread = endXSpread * obj.progress;
        const currentX = horizonX + ((obj.lane - 1) * currentSpread);

        obj.element.style.left = (currentX - ((parseInt(obj.element.style.width) * scale) / 2)) + 'px';
        obj.element.style.top = (currentY - (parseInt(obj.element.style.height) * scale)) + 'px'; 
        
        if (obj.type === 'bat' || obj.type === 'ghost') {
            obj.element.style.transform = `scale(${scale}) translateY(-${scale * 50}px)`;
        } else {
            obj.element.style.transform = `scale(${scale})`;
        }

        // Precise Lane & Depth Collision
        if (obj.progress >= 0.85 && obj.progress <= 1.05 && !obj.processed) {
            if (obj.lane === currentLane) {
                if (obj.isCandy) {
                    score += 10;
                    scoreElement.innerText = score;
                    obj.processed = true;
                    obj.element.classList.add('collected');
                } else {
                    const isAirEnemy = (obj.type === 'bat' || obj.type === 'ghost');
                    if (isJumping && !isAirEnemy) {
                        // Dodged pumpkin
                        continue;
                    } else {
                        // Hit
                        takeDamage();
                        obj.processed = true;
                    }
                }
            }
        }
    }

    gameLoop = requestAnimationFrame(update);
}

function triggerGameOver() {
    isGameOver = true;
    rocky.classList.remove('running', 'jumping', 'invulnerable'); 
    rocky.style.backgroundImage = "url('assets/rocky-hit.png')"; 
    cancelAnimationFrame(gameLoop);
    
    setTimeout(() => {
        finalScoreElement.innerText = score;
        gameOverScreen.classList.remove('hidden');
    }, 500);
}

// Restart Logic
restartBtn.addEventListener('click', () => {
    // Reset Variables
    score = 0;
    lives = 3;
    isGameOver = false;
    isInvulnerable = false;
    currentLane = 1;
    scoreElement.innerText = '0';
    updateLivesDisplay();
    updateRockyPosition();
    rocky.style.backgroundImage = "url('assets/rocky-run.png')";
    rocky.classList.add('running');
    
    // Clear Board
    activeObjects.forEach(obj => obj.element.remove());
    activeObjects = [];
    speedLines.forEach(line => line.element.remove());
    speedLines = [];
    
    gameOverScreen.classList.add('hidden');
    gameLoop = requestAnimationFrame(update);
});

// Initialization
updateRockyPosition();
updateLivesDisplay();
gameLoop = requestAnimationFrame(update);
