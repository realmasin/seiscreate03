const gameContainer = document.getElementById('game-container');
const rocky = document.getElementById('rocky');
const scoreElement = document.getElementById('score');

let score = 0;
let gameLoop;
let isGameOver = false;
let activeObjects = [];
let spawnTimer = 0;

// Difficulty scaling variables
let currentSpeedMultiplier = 1;
let framesBetweenSpawns = 60; // Starts slow

// Movement Configuration (3 Lanes)
const containerWidth = gameContainer.offsetWidth || 400;
const lanePositions = [
    (containerWidth / 2) - 120, // Left
    (containerWidth / 2) - 60,  // Center (Rocky width is 120, so center is offset by 60)
    (containerWidth / 2)         // Right
]; 
let currentLane = 1; 

// Pseudo-3D Perspective Configuration
const horizonY = 220; // Pushed further up to match the background castle
const endY = gameContainer.offsetHeight + 100; // Drops off screen
const horizonX = containerWidth / 2; // Center of horizon
const endXSpread = 160; // Spread width at the bottom

// Movement Logic
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

function updateRockyPosition() {
    rocky.style.left = lanePositions[currentLane] + 'px';
}

// Keyboard Listeners
document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') moveLeft();
    if (event.key === 'ArrowRight') moveRight();
});

// Mobile Touch Listeners
document.getElementById('btn-left').addEventListener('touchstart', (e) => {
    e.preventDefault();
    moveLeft();
});
document.getElementById('btn-right').addEventListener('touchstart', (e) => {
    e.preventDefault();
    moveRight();
});
// Mouse fallback for testing mobile buttons on PC
document.getElementById('btn-left').addEventListener('mousedown', moveLeft);
document.getElementById('btn-right').addEventListener('mousedown', moveRight);

// Spawn Objects
function spawnObject() {
    const lane = Math.floor(Math.random() * 3) - 1; 
    
    const types = ['pumpkin', 'ghost'];
    const isCandy = Math.random() > 0.7; // 30% chance for candy
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
        progress: 0.01, // Start slightly visible to fix the "sudden pop" issue
        isCandy: isCandy
    });
}

function update() {
    if (isGameOver) return;

    // Difficulty increases with score (faster movement, faster spawns)
    currentSpeedMultiplier = 1 + (score * 0.01);
    framesBetweenSpawns = Math.max(20, 60 - (score * 0.5)); // Never goes below 20 frames

    spawnTimer++;
    if (spawnTimer > framesBetweenSpawns) { 
        spawnObject();
        spawnTimer = 0;
    }

    for (let i = activeObjects.length - 1; i >= 0; i--) {
        let obj = activeObjects[i];
        
        // Dynamic speed based on progress and score multiplier
        obj.progress += (0.004 + (obj.progress * 0.015)) * currentSpeedMultiplier; 

        if (obj.progress >= 1.2) {
            obj.element.remove();
            activeObjects.splice(i, 1);
            continue;
        }

        // 3D Scale (starts very tiny at the horizon)
        const scale = obj.progress; 
        
        const currentY = horizonY + (obj.progress * (endY - horizonY));
        const currentSpread = endXSpread * obj.progress;
        const currentX = horizonX + (obj.lane * currentSpread);

        obj.element.style.left = (currentX - ((parseInt(obj.element.style.width) * scale) / 2)) + 'px';
        obj.element.style.top = (currentY - (parseInt(obj.element.style.height) * scale)) + 'px'; 
        
        // Combine scale and object-specific animations correctly
        if (obj.type === 'candy') {
            obj.element.style.transform = `scale(${scale}) rotate(${Math.sin(Date.now() / 100) * 10}deg)`;
        } else {
            obj.element.style.transform = `scale(${scale})`;
        }

        // Collision Detection
        if (obj.progress > 0.85 && obj.progress < 1.0) {
            const objectLaneIndex = obj.lane + 1; 
            
            if (objectLaneIndex === currentLane) {
                if (obj.isCandy) {
                    score += 10;
                    scoreElement.innerText = score;
                    obj.element.remove();
                    activeObjects.splice(i, 1);
                } else {
                    gameOver();
                }
            }
        }
    }

    gameLoop = requestAnimationFrame(update);
}

function gameOver() {
    isGameOver = true;
    rocky.classList.remove('running'); // Stop the running animation
    rocky.style.backgroundImage = "url('assets/rocky-hit.png')"; 
    cancelAnimationFrame(gameLoop);
    
    setTimeout(() => {
        alert('Game Over! Your Score: ' + score + '\nRefresh to play again.');
    }, 100);
}

// Initial position setup and game start
updateRockyPosition();
gameLoop = requestAnimationFrame(update);
