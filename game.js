const gameContainer = document.getElementById('game-container');
const rocky = document.getElementById('rocky');
const scoreElement = document.getElementById('score');
const hitFlash = document.getElementById('hit-flash');

let score = 0;
let gameLoop;
let isGameOver = false;
let activeObjects = [];
let particles = [];
let spawnTimer = 0;

let currentSpeedMultiplier = 1.2; 
let framesBetweenSpawns = 60; 

const containerWidth = gameContainer.offsetWidth;
const containerHeight = gameContainer.offsetHeight;
const rockyWidth = 120;

const lanePositions = [
    20,                                     
    (containerWidth / 2) - (rockyWidth / 2),
    containerWidth - rockyWidth - 20        
]; 
let currentLane = 1; 

// Horizon exactly matches the fog line in the new background
const horizonY = containerHeight * 0.42; 
const endY = containerHeight + 150; 
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

// Particle Illusion System
function spawnParticle() {
    if (Math.random() > 0.4) return; // Control density
    
    const p = document.createElement('div');
    p.classList.add('speed-particle');
    gameContainer.appendChild(p);
    
    // Spread randomly across the horizon
    const randomSpread = (Math.random() - 0.5) * 2;
    
    particles.push({
        element: p,
        progress: 0.01,
        spread: randomSpread
    });
}

function spawnObject() {
    const lane = Math.floor(Math.random() * 3) - 1; 
    
    // Bats included in the enemy array
    const types = ['pumpkin', 'ghost', 'bat'];
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
        progress: 0.01, 
        isCandy: isCandy,
        collected: false
    });
}

function checkCollision(rect1, rect2) {
    const toleranceX = 35;
    const toleranceY = 25;

    return (
        rect1.left + toleranceX < rect2.right - toleranceX &&
        rect1.right - toleranceX > rect2.left + toleranceX &&
        rect1.top + toleranceY < rect2.bottom - toleranceY &&
        rect1.bottom > rect2.top + toleranceY
    );
}

function update() {
    if (isGameOver) return;

    currentSpeedMultiplier = 1.2 + (score * 0.015);
    framesBetweenSpawns = Math.max(20, 60 - (score * 0.8));

    spawnTimer++;
    if (spawnTimer > framesBetweenSpawns) { 
        spawnObject();
        spawnTimer = 0;
    }
    
    spawnParticle();

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.progress += (0.005 + (p.progress * 0.02)) * currentSpeedMultiplier;
        
        if (p.progress >= 1.2) {
            p.element.remove();
            particles.splice(i, 1);
            continue;
        }
        
        const currentY = horizonY + (p.progress * (endY - horizonY));
        const currentSpread = endXSpread * p.progress * 1.5; // Particles spread wider
        const currentX = horizonX + (p.spread * currentSpread);
        
        p.element.style.left = currentX + 'px';
        p.element.style.top = currentY + 'px';
        p.element.style.transform = `scale(${p.progress * 2})`;
    }

    const rockyRect = rocky.getBoundingClientRect();

    // Update Game Objects
    for (let i = activeObjects.length - 1; i >= 0; i--) {
        let obj = activeObjects[i];
        
        if (obj.collected) continue; 

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
        
        if (obj.type !== 'ghost' && obj.type !== 'bat') {
            obj.element.style.transform = `scale(${scale})`;
        } else {
            // Keep CSS animations intact for flying enemies
            obj.element.style.transform = `scale(${scale}) translateY(-${scale * 20}px)`;
        }

        if (obj.progress > 0.6) { 
            const objRect = obj.element.getBoundingClientRect();
            
            if (checkCollision(rockyRect, objRect)) {
                if (obj.isCandy) {
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
    
    hitFlash.classList.add('flash-active');
    gameContainer.classList.add('shake-active'); // Screen shake applied
    
    cancelAnimationFrame(gameLoop);
    
    setTimeout(() => {
        alert('Game Over! Your Score: ' + score + '\nRefresh to play again.');
    }, 400);
}

updateRockyPosition();
gameLoop = requestAnimationFrame(update);
