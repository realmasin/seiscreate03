const gameContainer = document.getElementById('game-container');
const rocky = document.getElementById('rocky');
const scoreElement = document.getElementById('score');
const hitFlash = document.getElementById('hit-flash');
const background = document.getElementById('background');

let score = 0;
let gameLoop;
let isGameOver = false;
let activeObjects = [];
let spawnTimer = 0;

// Core Mechanics States
let isJumping = false;
let currentSpeed = 0.005; // Base starting speed
let spawnRate = 70; // Frames between spawns

const containerWidth = gameContainer.offsetWidth;
const containerHeight = gameContainer.offsetHeight;
const rockyWidth = 120;

// Accurate Lane Positioning
const lanePositions = [
    20,                                     
    (containerWidth / 2) - (rockyWidth / 2),
    containerWidth - rockyWidth - 20        
]; 
let currentLane = 1; 

const horizonY = containerHeight * 0.42; 
const endY = containerHeight + 100; 
const horizonX = containerWidth / 2; 
const endXSpread = containerWidth * 0.50; 

function moveLeft() {
    if (!isGameOver && currentLane > 0) {
        currentLane--;
        updateRockyPosition();
    }
}

function moveRight() {
    if (!isGameOver && currentLane < 2) {
        currentLane++;
        updateRockyPosition();
    }
}

// Jump Logic
function jump() {
    if (isGameOver || isJumping) return;
    
    isJumping = true;
    rocky.classList.remove('running');
    rocky.classList.add('jumping');
    rocky.style.backgroundImage = "url('assets/rocky-jump.png')";
    
    // Jump duration
    setTimeout(() => {
        if (isGameOver) return;
        rocky.classList.remove('jumping');
        rocky.classList.add('running');
        rocky.style.backgroundImage = "url('assets/rocky-run.png')";
        isJumping = false;
    }, 500); // Rocky stays in the air for 500ms
}

function updateRockyPosition() {
    rocky.style.left = lanePositions[currentLane] + 'px';
}

// Controls
document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') moveLeft();
    if (event.key === 'ArrowRight') moveRight();
    if (event.key === 'ArrowUp' || event.key === ' ') jump();
});

const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnJump = document.getElementById('btn-jump');

btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); moveLeft(); }, {passive: false});
btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); moveRight(); }, {passive: false});
btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }, {passive: false});

// Mouse fallback for testing
btnLeft.addEventListener('mousedown', moveLeft);
btnRight.addEventListener('mousedown', moveRight);
btnJump.addEventListener('mousedown', jump);

function spawnObject() {
    const lane = Math.floor(Math.random() * 3) - 1; 
    
    const types = ['pumpkin', 'ghost', 'bat'];
    const isCandy = Math.random() > 0.6; // 40% chance for candy
    const type = isCandy ? 'candy' : types[Math.floor(Math.random() * types.length)];

    const obj = document.createElement('div');
    obj.classList.add('game-object', type);
    
    const baseWidth = isCandy ? 60 : 90;
    const baseHeight = isCandy ? 60 : 90;
    
    obj.style.width = baseWidth + 'px';
    obj.style.height = baseHeight + 'px';
    
    gameContainer.appendChild(obj);

    activeObjects.push({
        element: obj,
        lane: lane,
        type: type,
        progress: 0.01, 
        isCandy: isCandy,
        processed: false // Prevent double collision
    });
}

function update() {
    if (isGameOver) return;

    // Aggressive Speed Scaling based on Score
    currentSpeed = 0.005 + (score * 0.0003); 
    spawnRate = Math.max(15, 70 - (score * 0.5)); 
    
    // Speed up background animation based on score
    background.style.animationDuration = Math.max(1, 5 - (score * 0.05)) + 's';

    spawnTimer++;
    if (spawnTimer > spawnRate) { 
        spawnObject();
        spawnTimer = 0;
    }

    // Logic Loop
    for (let i = activeObjects.length - 1; i >= 0; i--) {
        let obj = activeObjects[i];
        
        // Move object towards screen
        obj.progress += currentSpeed + (obj.progress * 0.015); 

        // Remove off-screen objects
        if (obj.progress >= 1.2) {
            obj.element.remove();
            activeObjects.splice(i, 1);
            continue;
        }

        // Apply Position and Scale
        const scale = obj.progress; 
        const currentY = horizonY + (obj.progress * (endY - horizonY));
        const currentSpread = endXSpread * obj.progress;
        const currentX = horizonX + (obj.lane * currentSpread);

        obj.element.style.left = (currentX - ((parseInt(obj.element.style.width) * scale) / 2)) + 'px';
        obj.element.style.top = (currentY - (parseInt(obj.element.style.height) * scale)) + 'px'; 
        
        // Ghost and Bats fly a bit higher
        if (obj.type === 'bat' || obj.type === 'ghost') {
            obj.element.style.transform = `scale(${scale}) translateY(-${scale * 40}px)`;
        } else {
            obj.element.style.transform = `scale(${scale})`;
        }

        // Bulletproof Logic-based Collision (Frame Independent)
        if (obj.progress >= 0.85 && obj.progress <= 1.05 && !obj.processed) {
            const objectLane = obj.lane + 1; // Convert -1,0,1 to 0,1,2
            
            if (objectLane === currentLane) {
                if (obj.isCandy) {
                    // Collect Candy
                    score += 10;
                    scoreElement.innerText = score;
                    obj.processed = true;
                    obj.element.classList.add('collected');
                } else {
                    // Hit Enemy
                    const isAirEnemy = (obj.type === 'bat' || obj.type === 'ghost');
                    
                    if (isJumping && !isAirEnemy) {
                        // Successfully jumped over a ground enemy (pumpkin)
                        continue; 
                    } else {
                        // Failed to dodge
                        gameOver();
                        obj.processed = true;
                    }
                }
            }
        }
    }

    gameLoop = requestAnimationFrame(update);
}

function gameOver() {
    isGameOver = true;
    rocky.classList.remove('running', 'jumping'); 
    rocky.style.backgroundImage = "url('assets/rocky-hit.png')"; 
    
    // Powerful hit effect
    hitFlash.classList.add('flash-active');
    background.style.animation = 'none'; // Stop background movement
    
    cancelAnimationFrame(gameLoop);
    
    setTimeout(() => {
        alert('Game Over! Your Score: ' + score + '\nRefresh to try again.');
    }, 400);
}

// Start Game
updateRockyPosition();
gameLoop = requestAnimationFrame(update);
