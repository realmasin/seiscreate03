const gameContainer = document.getElementById('game-container');
const rocky = document.getElementById('rocky');
const scoreElement = document.getElementById('score');

// Game State Variables
let score = 0;
let gameLoop;
let isGameOver = false;
let activeObjects = [];
let spawnTimer = 0;

// Movement Configuration (3 Lanes)
const lanePositions = [20, 140, 260]; // Left, Center, Right X coordinates for Rocky
let currentLane = 1; // Start in the Center lane

// Pseudo-3D Perspective Configuration
const horizonY = 250; // Y coordinate where the road meets the sky
const endY = 750; // Bottom of the screen (off-screen)
const horizonX = 200; // Center X of the horizon
const endXSpread = 120; // How far the side lanes spread at the bottom

// Player Controls
document.addEventListener('keydown', (event) => {
    if (isGameOver) return;

    if (event.key === 'ArrowLeft' && currentLane > 0) {
        currentLane--;
    } else if (event.key === 'ArrowRight' && currentLane < 2) {
        currentLane++;
    }
    rocky.style.left = lanePositions[currentLane] + 'px';
});

function spawnObject() {
    // Randomly choose a lane: -1 (Left), 0 (Center), 1 (Right)
    const lane = Math.floor(Math.random() * 3) - 1; 
    
    // Randomly choose object type (70% chance enemy, 30% chance candy)
    const types = ['pumpkin', 'ghost'];
    const isCandy = Math.random() > 0.7;
    const type = isCandy ? 'candy' : types[Math.floor(Math.random() * types.length)];

    const obj = document.createElement('div');
    obj.classList.add('game-object', type);
    
    // Set base dimensions
    const baseWidth = isCandy ? 60 : 90;
    const baseHeight = isCandy ? 60 : 90;
    
    obj.style.width = baseWidth + 'px';
    obj.style.height = baseHeight + 'px';
    
    gameContainer.appendChild(obj);

    activeObjects.push({
        element: obj,
        lane: lane,
        type: type,
        progress: 0, // Moves from 0 (horizon) to 1 (passed the player)
        isCandy: isCandy
    });
}

function update() {
    if (isGameOver) return;

    // Control spawn rate
    spawnTimer++;
    if (spawnTimer > 50) { 
        spawnObject();
        spawnTimer = 0;
    }

    for (let i = activeObjects.length - 1; i >= 0; i--) {
        let obj = activeObjects[i];
        
        // Progress increases non-linearly to simulate perspective speed
        obj.progress += 0.005 + (obj.progress * 0.015); 

        // Remove object if it goes off screen
        if (obj.progress >= 1.2) {
            obj.element.remove();
            activeObjects.splice(i, 1);
            continue;
        }

        // Calculate 3D Scale (small at horizon, full size at bottom)
        const scale = 0.1 + (obj.progress * 0.9);
        
        // Calculate dynamic Y and X positions
        const currentY = horizonY + (obj.progress * (endY - horizonY));
        const currentSpread = endXSpread * obj.progress;
        const currentX = horizonX + (obj.lane * currentSpread);

        // Apply styles to the DOM element
        obj.element.style.left = (currentX - ((parseInt(obj.element.style.width) * scale) / 2)) + 'px';
        obj.element.style.top = (currentY - (parseInt(obj.element.style.height) * scale)) + 'px'; 
        obj.element.style.transform = `scale(${scale})`;

        // Collision Detection
        if (obj.progress > 0.80 && obj.progress < 0.95) {
            const objectLaneIndex = obj.lane + 1; // Map -1,0,1 to 0,1,2
            
            if (objectLaneIndex === currentLane) {
                if (obj.isCandy) {
                    // Collect candy
                    score += 10;
                    scoreElement.innerText = score;
                    obj.element.remove();
                    activeObjects.splice(i, 1);
                } else {
                    // Hit an enemy
                    gameOver();
                }
            }
        }
    }

    gameLoop = requestAnimationFrame(update);
}

function gameOver() {
    isGameOver = true;
    rocky.style.backgroundImage = "url('assets/rocky-hit.png')"; // Switch to hit sprite
    cancelAnimationFrame(gameLoop);
    
    // Small delay before alert to allow the sprite to update
    setTimeout(() => {
        alert('Game Over! Your Score: ' + score + '\nRefresh to play again.');
    }, 100);
}

// Initialize game loop
gameLoop = requestAnimationFrame(update);
