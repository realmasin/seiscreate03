const rocky = document.getElementById('rocky');
const gameContainer = document.getElementById('game-container');

// Rocky's initial configuration updated for the new size
let rockyPosition = 140; 
const containerWidth = 400;
const rockyWidth = 120; // Increased from 80


// Movement control (Left and Right arrows)
document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' && rockyPosition > 0) {
        rockyPosition -= 40; // Move left
    } else if (event.key === 'ArrowRight' && rockyPosition < (containerWidth - rockyWidth)) {
        rockyPosition += 40; // Move right
    }
    
    // Update Rocky's position on screen
    rocky.style.left = rockyPosition + 'px';
});

