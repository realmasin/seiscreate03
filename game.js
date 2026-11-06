const gameContainer = document.getElementById('game-container');
const rocky = document.getElementById('rocky');
const scoreElement = document.getElementById('score');
const hitFlash = document.getElementById('hit-flash');

let score = 0;
let gameLoop;
let isGameOver = false;
let activeObjects = [];
let spawnTimer = 0;

let currentSpeedMultiplier = 1;
let framesBetweenSpawns = 70; 

// Dynamic sizing and lane calculations for full road usage
const containerWidth = gameContainer.offsetWidth;
const containerHeight = gameContainer.offsetHeight;
const rockyWidth = 120;

// Lanes: Left edge, Center, Right edge
const lanePositions = [
    20,                                     // Left
    (containerWidth / 2) - (rockyWidth / 2),// Center
    containerWidth - rockyWidth - 20        // Right
]; 
let currentLane = 1; 

// Horizon exactly at the vanishing point in the background image
const horizonY = containerHeight * 0.35; 
const endY = containerHeight + 100; 
const horizonX = containerWidth / 2; 
const endXSpread = containerWidth * 0.45; // Wider spread at the bottom

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

document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') moveLeft();
    if (event.key === 'ArrowRight') moveRight();
});

const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');

btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); moveLeft(); }, {passive: false});
btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); moveRight(); }, {passive: false});
btnLeft.addEventListener('mousedown', moveLeft);
btnRight.addEventListener('mousedown', moveRight);

function spawnObject() {
    const lane = Math.floor(Math.random() * 3) - 1; 
    
    const types = ['pumpkin', 'ghost'];
    const isCandy = Math.random() > 0.7; 
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
        progress: 0, // Start exactly at horizon
        isCandy: isCandy,
        collected: false
    });
}

// AABB True Collision Detection
function checkCollision(rect1, rect2) {
    // Add tolerance to make hitboxes fair (don't die if just touching a pixel)
    const toleranceX = 30;
    const toleranceY = 20;

    return (
        rect1.left + toleranceX < rect2.right - toleranceX &&
        rect1.right - toleranceX > rect2.left + toleranceX &&
        rect1.top + toleranceY < rect2.bottom - toleranceY &&
        rect1.bottom > rect2.top + toleranceY
    );
}

function update() {
    if (isGameOver) return;

    currentSpeedMultiplier = 1 + (score * 0.015);
    framesBetweenSpawns = Math.max(25, 70 - (score * 0.8));

    spawnTimer++;
    if (spawnTimer > framesBetweenSpawns) { 
        spawnObject();
        spawnTimer = 0;
    }

    const rockyRect = rocky.getBoundingClientRect();

    for (let i = activeObjects.length - 1; i >= 0; i--) {
        let obj = activeObjects[i];
        
        if (obj.collected) continue; // Skip logic if already collected

        obj.progress += (0.003 + (obj.progress * 0.015)) * currentSpeedMultiplier; 

        if (obj.progress >= 1.2) {
            obj.element.remove();
            activeObjects.splice(i, 1);
            continue;
        }

        const scale = obj.progress; 
        const currentY = horizonY + (obj.progress * (endY - horizonY));
        const currentSpread = endXSpread * obj.progress;
        const currentX = horizonX + (obj.lane * currentSpread);

        obj.element.style.left = (currentX - ((parseInt(obj.element.style.width) * scale) / 2)) + 'px';
        obj.element.style.top = (currentY - (parseInt(obj.element.style.height) * scale)) + 'px'; 
        
        if (obj.type !== 'ghost') {
            obj.element.style.transform = `scale(${scale})`;
        } else {
            // Preserve float animation for ghost
            obj.element.style.transform = `scale(${scale}) translateY(-10px)`;
        }

        // Real Collision Detection
        if (obj.progress > 0.6) { // Only check when they get somewhat close
            const objRect = obj.element.getBoundingClientRect();
            
            if (checkCollision(rockyRect, objRect)) {
                if (obj.isCandy) {
                    // Visual feedback for candy
                    score += 10;
                    scoreElement.innerText = score;
                    obj.collected = true;
                    obj.element.classList.add('collected');
                    
                    setTimeout(() => {
                        obj.element.remove();
                        const index = activeObjects.indexOf(obj);
                        if (index > -1) activeObjects.splice(index, 1);
                    }, 200);

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
    rocky.classList.remove('running'); 
    rocky.style.backgroundImage = "url('assets/rocky-hit.png')"; 
    
    // Screen flash effect
    hitFlash.classList.add('flash-active');
    
    cancelAnimationFrame(gameLoop);
    
    setTimeout(() => {
        alert('Game Over! Your Score: ' + score + '\nRefresh to play again.');
    }, 300);
}

// Initialization
updateRockyPosition();
gameLoop = requestAnimationFrame(update);
