/**
 * Rocky's Halloween OutRun - 90s Pseudo-3D Vertical Arcade Runner
 * Production-ready vanilla JS game engine using requestAnimationFrame.
 */

(() => {
  'use strict';

  // Exact asset file paths
  const ASSETS = {
    bgRoad: 'assets/bg-road.png',
    rockyRun: 'assets/rocky-run.png',
    rockyJump: 'assets/rocky-jump.png',
    rockyHit: 'assets/rocky-hit.png',
    enemyPumpkin: 'assets/enemy-pumpkin.png',
    enemyGhost: 'assets/enemy-ghost.png',
    enemyBat: 'assets/enemy-bat.png',
    candy: 'assets/candy.png',
  };

  // Core Pseudo-3D & Gameplay Constants
  const CONFIG = {
    HORIZON_Y_RATIO: 0.45,       // Vanishing point Y at 45% of screen height
    VANISHING_X_RATIO: 0.50,     // Vanishing point X at horizontal center
    PLAYER_Y_RATIO: 0.88,        // Player depth plane Y at 88% of screen height
    LANE_SPREAD_RATIO: 0.30,     // Horizontal distance between lanes at player depth
    PERSPECTIVE_EXPONENT: 2.15,  // Non-linear depth curve for OutRun perspective
    MIN_SPAWN_SCALE: 0.03,       // Initial scale at the vanishing point
    MAX_LIVES: 3,
    CANDY_POINTS: 10,
    INVINCIBILITY_MS: 1500,      // 1.5 seconds of invincibility on hit
    HIT_SPRITE_MS: 480,          // Duration to display rocky-hit.png
    JUMP_DURATION_MS: 580,       // Total air time when jumping
    JUMP_HEIGHT_RATIO: 0.15,     // Peak jump height relative to viewport height
    JUMP_SCALE_BOOST: 0.28,      // Additional scale multiplier at peak jump
    COLLISION_Z_MIN: 0.89,       // Depth window start for player collision
    COLLISION_Z_MAX: 0.99,       // Depth window end for player collision
    DESPAWN_Z: 1.24,             // Depth past bottom of screen where objects despawn
    BASE_SPEED_Z: 0.56,          // Base depth units traversed per second
    BASE_SPAWN_INTERVAL_MS: 980, // Initial time between entity spawns
    MIN_SPAWN_INTERVAL_MS: 330,  // Fastest possible spawn interval at high score
    SWIPE_THRESHOLD_PX: 26,      // Minimum swipe distance in pixels
  };

  // DOM Elements
  const viewportEl = document.getElementById('game-viewport');
  const speedLinesLayerEl = document.getElementById('speed-lines-layer');
  const entitiesLayerEl = document.getElementById('entities-layer');
  const playerContainerEl = document.getElementById('player-container');
  const playerSpriteEl = document.getElementById('player-sprite');
  const playerShadowEl = document.getElementById('player-shadow');
  const damageFlashEl = document.getElementById('damage-flash');
  const scoreValueEl = document.getElementById('score-value');
  const finalScoreValueEl = document.getElementById('final-score-value');
  const gameOverOverlayEl = document.getElementById('game-over-overlay');
  const restartBtnEl = document.getElementById('restart-btn');
  const controlsToastEl = document.getElementById('controls-toast');
  const heartEls = Array.from(document.querySelectorAll('#lives-panel .heart'));

  // Viewport Geometry Cache
  const metrics = {
    width: 0,
    height: 0,
    vanishingX: 0,
    horizonY: 0,
    playerY: 0,
    roadHeight: 0,
    laneSpread: 0,
  };

  // Mutable Game State
  const state = {
    isRunning: false,
    score: 0,
    lives: CONFIG.MAX_LIVES,
    elapsedMs: 0,
    lastFrameTime: 0,
    spawnTimerMs: 0,
    speedLineTimerMs: 0,
    lastSpawnLane: null,
    player: {
      lane: 0,               // -1 = Left, 0 = Center, 1 = Right
      visualLane: 0,         // Smoothly interpolated X lane for snappy movement
      isJumping: false,
      jumpElapsedMs: 0,
      jumpProgress: 0,       // 0..1 normalized jump progress
      jumpArc: 0,            // 0..1 sinusoidal elevation factor
      invincibleRemainingMs: 0,
      hitSpriteRemainingMs: 0,
      currentSprite: ASSETS.rockyRun,
    },
    entities: [],            // Active enemies and candies
    speedLines: [],          // Active radial speed lines
  };

  /**
   * Preloads all game images so sprite switches have zero flicker.
   */
  function preloadAssets() {
    Object.values(ASSETS).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  /**
   * Recalculates viewport coordinates for vanishing point and 3-lane projection.
   */
  function updateViewportMetrics() {
    const rect = viewportEl.getBoundingClientRect();
    metrics.width = rect.width || window.innerWidth;
    metrics.height = rect.height || window.innerHeight;
    metrics.vanishingX = metrics.width * CONFIG.VANISHING_X_RATIO;
    metrics.horizonY = metrics.height * CONFIG.HORIZON_Y_RATIO;
    metrics.playerY = metrics.height * CONFIG.PLAYER_Y_RATIO;
    metrics.roadHeight = metrics.playerY - metrics.horizonY;
    metrics.laneSpread = metrics.width * CONFIG.LANE_SPREAD_RATIO;
  }

  /**
   * Computes current speed multiplier and spawn interval mathematically from score.
   */
  function getDifficultyParams() {
    // Score drives a smooth mathematical escalation in speed and spawn rate
    const scoreFactor = state.score / 100;
    const timeFactor = state.elapsedMs / 45000;
    const speedMultiplier = 1 + (scoreFactor * 0.22) + Math.min(0.65, timeFactor * 0.25);

    const spawnIntervalMs = Math.max(
      CONFIG.MIN_SPAWN_INTERVAL_MS,
      CONFIG.BASE_SPAWN_INTERVAL_MS / (1 + scoreFactor * 0.26 + timeFactor * 0.2)
    );

    return {
      speedZ: CONFIG.BASE_SPEED_Z * speedMultiplier,
      spawnIntervalMs,
    };
  }

  /**
   * Projects a normalized depth (z: 0 at horizon -> 1 at player depth) and lane (-1, 0, 1)
   * into 2D screen coordinates and scale.
   */
  function projectPseudo3D(z, laneOffset) {
    const clampedZ = Math.max(0, z);
    const perspectiveProgress = Math.pow(clampedZ, CONFIG.PERSPECTIVE_EXPONENT);

    const screenX = metrics.vanishingX + (laneOffset * metrics.laneSpread * perspectiveProgress);
    const screenY = metrics.horizonY + (metrics.roadHeight * perspectiveProgress);
    const scale = CONFIG.MIN_SPAWN_SCALE + (1 - CONFIG.MIN_SPAWN_SCALE) * perspectiveProgress;

    return { screenX, screenY, scale, perspectiveProgress };
  }

  /**
   * Updates the player's sprite source only when state changes to avoid DOM thrashing.
   */
  function setPlayerSprite(assetPath) {
    if (state.player.currentSprite !== assetPath) {
      state.player.currentSprite = assetPath;
      playerSpriteEl.src = assetPath;
    }
  }

  /**
   * Updates the HUD score and hearts display.
   */
  function syncHud() {
    scoreValueEl.textContent = String(state.score).padStart(5, '0');
    heartEls.forEach((heartEl, idx) => {
      heartEl.classList.toggle('lost', idx >= state.lives);
    });
  }

  /**
   * Moves Rocky left or right across the 3 lanes (-1, 0, 1).
   */
  function changeLane(direction) {
    if (!state.isRunning) return;
    const nextLane = Math.max(-1, Math.min(1, state.player.lane + direction));
    state.player.lane = nextLane;
  }

  /**
   * Initiates Rocky's jump if currently grounded.
   */
  function triggerJump() {
    if (!state.isRunning || state.player.isJumping) return;
    state.player.isJumping = true;
    state.player.jumpElapsedMs = 0;
    state.player.jumpProgress = 0;
    state.player.jumpArc = 0;
    if (state.player.hitSpriteRemainingMs <= 0) {
      setPlayerSprite(ASSETS.rockyJump);
    }
  }

  /**
   * Spawns a dynamic speed line at the vanishing point to create the OutRun speed illusion.
   */
  function spawnSpeedLine() {
    const el = document.createElement('div');
    el.className = 'speed-line';

    // Pick a radial trajectory along road edges or lane dividers
    const trajectories = [-1.45, -1.15, -0.5, 0.5, 1.15, 1.45];
    const laneTrajectory = trajectories[Math.floor(Math.random() * trajectories.length)] +
      (Math.random() * 0.14 - 0.07);

    speedLinesLayerEl.appendChild(el);
    state.speedLines.push({
      el,
      z: 0.01,
      laneTrajectory,
    });
  }

  /**
   * Spawns an enemy (Pumpkin, Ghost, Bat) or Collectible (Candy) exactly at the vanishing point.
   */
  function spawnEntity() {
    const lanes = [-1, 0, 1];
    let lane = lanes[Math.floor(Math.random() * lanes.length)];

    // Reduce repetitive identical lane spawns
    if (lane === state.lastSpawnLane && Math.random() < 0.65) {
      const otherLanes = lanes.filter((l) => l !== lane);
      lane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
    }
    state.lastSpawnLane = lane;

    // Determine entity type: 32% Candy, 30% Pumpkin (ground), 19% Ghost (flying), 19% Bat (flying)
    const roll = Math.random();
    let type = 'pumpkin';
    let isFlying = false;
    let isCollectible = false;
    let asset = ASSETS.enemyPumpkin;

    if (roll < 0.32) {
      type = 'candy';
      isCollectible = true;
      asset = ASSETS.candy;
    } else if (roll < 0.62) {
      type = 'pumpkin';
      isFlying = false;
      asset = ASSETS.enemyPumpkin;
    } else if (roll < 0.81) {
      type = 'ghost';
      isFlying = true;
      asset = ASSETS.enemyGhost;
    } else {
      type = 'bat';
      isFlying = true;
      asset = ASSETS.enemyBat;
    }

    const el = document.createElement('div');
    el.className = 'entity';

    const img = document.createElement('img');
    img.src = asset;
    img.alt = type;
    img.draggable = false;
    el.appendChild(img);

    // Position immediately at the vanishing point with near-zero scale
    const initialProj = projectPseudo3D(0, lane);
    el.style.transform = `translate3d(${initialProj.screenX}px, ${initialProj.screenY}px, 0) translate(-50%, -100%) scale(${CONFIG.MIN_SPAWN_SCALE})`;

    entitiesLayerEl.appendChild(el);

    state.entities.push({
      el,
      type,
      lane,
      z: 0,
      isFlying,
      isCollectible,
      resolved: false,
      Removing: false,
      bobSeed: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Spawns a floating "+10" score popup at the collection coordinates.
   */
  function spawnScorePopup(x, y) {
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = '+10';
    popup.style.setProperty('--popup-x', `${x}px`);
    popup.style.setProperty('--popup-y', `${y}px`);
    entitiesLayerEl.appendChild(popup);

    window.setTimeout(() => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    }, 550);
  }

  /**
   * Handles collecting a candy item (+10 score + pop/fade CSS animation).
   */
  function collectCandy(entity, screenX, screenY, scale) {
    entity.resolved = true;
    entity.Removing = true;
    state.score += CONFIG.CANDY_POINTS;
    syncHud();

    entity.el.style.setProperty('--collect-x', `${screenX}px`);
    entity.el.style.setProperty('--collect-y', `${screenY}px`);
    entity.el.style.setProperty('--collect-scale', String(scale));
    entity.el.classList.add('candy-collected');

    spawnScorePopup(screenX, screenY - 36 * scale);

    window.setTimeout(() => {
      if (entity.el.parentNode) {
        entity.el.parentNode.removeChild(entity.el);
      }
    }, 340);
  }

  /**
   * Handles player collision with an enemy.
   */
  function handlePlayerHit(entity) {
    entity.resolved = true;

    // Ignore damage while invincible
    if (state.player.invincibleRemainingMs > 0) return;

    state.lives = Math.max(0, state.lives - 1);
    syncHud();

    // Trigger red screen damage flash
    damageFlashEl.classList.remove('flash-active');
    void damageFlashEl.offsetWidth; // Force reflow to restart animation
    damageFlashEl.classList.add('flash-active');

    // Switch Rocky to hit sprite and grant 1.5s invincibility
    state.player.hitSpriteRemainingMs = CONFIG.HIT_SPRITE_MS;
    state.player.invincibleRemainingMs = CONFIG.INVINCIBILITY_MS;
    setPlayerSprite(ASSETS.rockyHit);
    playerContainerEl.classList.add('invincible');

    if (state.lives <= 0) {
      triggerGameOver();
    }
  }

  /**
   * Stops the game loop and displays the Game Over overlay.
   */
  function triggerGameOver() {
    state.isRunning = false;
    playerContainerEl.classList.remove('invincible');
    finalScoreValueEl.textContent = String(state.score);
    gameOverOverlayEl.classList.remove('hidden');
  }

  /**
   * Updates player position, jump arc, and sprite states each frame.
   */
  function updatePlayer(dtMs) {
    const p = state.player;

    // Smooth horizontal lane interpolation
    const lerpFactor = 1 - Math.pow(0.00015, dtMs / 1000);
    p.visualLane += (p.lane - p.visualLane) * lerpFactor;

    // Update jump physics
    if (p.isJumping) {
      p.jumpElapsedMs += dtMs;
      p.jumpProgress = Math.min(1, p.jumpElapsedMs / CONFIG.JUMP_DURATION_MS);
      p.jumpArc = Math.sin(p.jumpProgress * Math.PI);

      if (p.jumpProgress >= 1) {
        p.isJumping = false;
        p.jumpElapsedMs = 0;
        p.jumpProgress = 0;
        p.jumpArc = 0;
      }
    }

    // Update damage hit sprite timer
    if (p.hitSpriteRemainingMs > 0) {
      p.hitSpriteRemainingMs = Math.max(0, p.hitSpriteRemainingMs - dtMs);
    }

    // Update 1.5s invincibility timer
    if (p.invincibleRemainingMs > 0) {
      p.invincibleRemainingMs = Math.max(0, p.invincibleRemainingMs - dtMs);
      if (p.invincibleRemainingMs <= 0) {
        playerContainerEl.classList.remove('invincible');
      }
    }

    // Select correct Rocky sprite
    if (p.hitSpriteRemainingMs > 0) {
      setPlayerSprite(ASSETS.rockyHit);
    } else if (p.isJumping) {
      setPlayerSprite(ASSETS.rockyJump);
    } else {
      setPlayerSprite(ASSETS.rockyRun);
    }

    // Compute player screen coordinates & jump scale
    const playerX = metrics.vanishingX + (p.visualLane * metrics.laneSpread);
    const jumpOffsetY = p.jumpArc * (metrics.height * CONFIG.JUMP_HEIGHT_RATIO);
    const playerY = metrics.playerY - jumpOffsetY;
    const playerScale = 1 + (p.jumpArc * CONFIG.JUMP_SCALE_BOOST);

    playerContainerEl.style.transform =
      `translate3d(${playerX}px, ${playerY}px, 0) translate(-50%, -100%) scale(${playerScale.toFixed(3)})`;

    // Shrink shadow while airborne
    const shadowScale = 1 - (p.jumpArc * 0.45);
    playerShadowEl.style.transform = `translateX(-50%) scale(${shadowScale.toFixed(2)})`;
    playerShadowEl.style.opacity = String((0.65 - p.jumpArc * 0.35).toFixed(2));
  }

  /**
   * Updates all dynamic speed lines.
   */
  function updateSpeedLines(dtSec, speedZ) {
    for (let i = state.speedLines.length - 1; i >= 0; i--) {
      const line = state.speedLines[i];
      line.z += speedZ * 1.45 * dtSec;

      if (line.z >= CONFIG.DESPAWN_Z) {
        if (line.el.parentNode) line.el.parentNode.removeChild(line.el);
        state.speedLines.splice(i, 1);
        continue;
      }

      const proj = projectPseudo3D(line.z, line.laneTrajectory);
      const dx = proj.screenX - metrics.vanishingX;
      const dy = proj.screenY - metrics.horizonY;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
      const lineScaleY = Math.max(0.1, proj.scale * 1.6);
      const opacity = Math.min(0.85, line.z * 2.2);

      line.el.style.opacity = String(opacity.toFixed(2));
      line.el.style.transform =
        `translate3d(${proj.screenX}px, ${proj.screenY}px, 0) rotate(${angleDeg.toFixed(1)}deg) scale(1, ${lineScaleY.toFixed(2)})`;
    }
  }

  /**
   * Updates all dynamic entities (enemies and candies) and checks collisions.
   */
  function updateEntities(dtSec, speedZ) {
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const entity = state.entities[i];

      if (entity.Removing) {
        state.entities.splice(i, 1);
        continue;
      }

      entity.z += speedZ * dtSec;

      // Despawn objects once they pass off the bottom of the screen
      if (entity.z >= CONFIG.DESPAWN_Z) {
        if (entity.el.parentNode) entity.el.parentNode.removeChild(entity.el);
        state.entities.splice(i, 1);
        continue;
      }

      const proj = projectPseudo3D(entity.z, entity.lane);

      // Flying enemies hover above the road surface and bob sinusoidally
      let elevationOffset = 0;
      if (entity.isFlying) {
        const hoverHeight = metrics.height * 0.085 * proj.scale;
        const bobWave = Math.sin(state.elapsedMs * 0.012 + entity.bobSeed) * (10 * proj.scale);
        elevationOffset = hoverHeight + bobWave;
      }

      const renderY = proj.screenY - elevationOffset;

      // Layer ordering: objects past the player plane render in front of Rocky
      entity.el.style.zIndex = String(Math.floor(entity.z * 16));
      entity.el.style.transform =
        `translate3d(${proj.screenX}px, ${renderY}px, 0) translate(-50%, -100%) scale(${proj.scale.toFixed(4)})`;

      // Accurate lane + depth collision detection
      if (
        !entity.resolved &&
        entity.z >= CONFIG.COLLISION_Z_MIN &&
        entity.z <= CONFIG.COLLISION_Z_MAX &&
        entity.lane === state.player.lane
      ) {
        if (entity.isCollectible) {
          // Candy can be collected on the ground or during the start/end of a jump
          collectCandy(entity, proj.screenX, renderY, proj.scale);
        } else if (entity.isFlying) {
          // Flying enemies (Ghosts, Bats) hit Rocky even when he is jumping
          handlePlayerHit(entity);
        } else {
          // Ground enemies (Pumpkins) are dodged when Rocky is jumping
          const isHighEnoughToDodge = state.player.isJumping && state.player.jumpArc > 0.25;
          if (!isHighEnoughToDodge) {
            handlePlayerHit(entity);
          } else {
            entity.resolved = true;
          }
        }
      }
    }
  }

  /**
   * Main requestAnimationFrame Game Loop.
   */
  function gameLoop(timestamp) {
    if (!state.isRunning) return;

    if (!state.lastFrameTime) {
      state.lastFrameTime = timestamp;
    }

    // Clamp delta time to prevent physics jumps when switching tabs
    const dtMs = Math.min(50, Math.max(0, timestamp - state.lastFrameTime));
    const dtSec = dtMs / 1000;
    state.lastFrameTime = timestamp;
    state.elapsedMs += dtMs;

    // Fade out controls toast after 4.5 seconds
    if (state.elapsedMs > 4500 && controlsToastEl && !controlsToastEl.classList.contains('fade-out')) {
      controlsToastEl.classList.add('fade-out');
    }

    const { speedZ, spawnIntervalMs } = getDifficultyParams();

    // Spawn dynamic speed lines from the vanishing point
    state.speedLineTimerMs += dtMs;
    const speedLineInterval = Math.max(45, 95 / (speedZ / CONFIG.BASE_SPEED_Z));
    while (state.speedLineTimerMs >= speedLineInterval) {
      state.speedLineTimerMs -= speedLineInterval;
      spawnSpeedLine();
    }

    // Spawn enemies and candies from the vanishing point
    state.spawnTimerMs += dtMs;
    if (state.spawnTimerMs >= spawnIntervalMs) {
      state.spawnTimerMs %= spawnIntervalMs;
      spawnEntity();
    }

    updateSpeedLines(dtSec, speedZ);
    updatePlayer(dtMs);
    updateEntities(dtSec, speedZ);

    window.requestAnimationFrame(gameLoop);
  }

  /**
   * Resets all game states cleanly and starts a fresh run.
   */
  function startGame() {
    updateViewportMetrics();

    // Clear existing DOM nodes
    speedLinesLayerEl.innerHTML = '';
    entitiesLayerEl.innerHTML = '';

    // Reset state
    state.isRunning = true;
    state.score = 0;
    state.lives = CONFIG.MAX_LIVES;
    state.elapsedMs = 0;
    state.lastFrameTime = 0;
    state.spawnTimerMs = 0;
    state.speedLineTimerMs = 0;
    state.lastSpawnLane = null;
    state.entities = [];
    state.speedLines = [];

    state.player.lane = 0;
    state.player.visualLane = 0;
    state.player.isJumping = false;
    state.player.jumpElapsedMs = 0;
    state.player.jumpProgress = 0;
    state.player.jumpArc = 0;
    state.player.invincibleRemainingMs = 0;
    state.player.hitSpriteRemainingMs = 0;

    playerContainerEl.classList.remove('invincible');
    damageFlashEl.classList.remove('flash-active');
    gameOverOverlayEl.classList.add('hidden');
    if (controlsToastEl) {
      controlsToastEl.classList.remove('fade-out');
    }

    setPlayerSprite(ASSETS.rockyRun);
    syncHud();
    updatePlayer(0);

    // Seed initial speed lines so the road feels alive on frame 1
    for (let i = 0; i < 8; i++) {
      spawnSpeedLine();
      state.speedLines[state.speedLines.length - 1].z = (i + 1) * 0.12;
    }

    window.requestAnimationFrame(gameLoop);
  }

  /**
   * Registers desktop keyboard and mobile touch/swipe listeners.
   */
  function bindControls() {
    // Desktop Arrow Keys (and WASD / Space fallback)
    window.addEventListener('keydown', (e) => {
      if (!state.isRunning) {
        if ((e.key === 'Enter' || e.key === ' ') && !gameOverOverlayEl.classList.contains('hidden')) {
          e.preventDefault();
          startGame();
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        changeLane(-1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        changeLane(1);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        e.preventDefault();
        triggerJump();
      }
    });

    // Mobile Touch Swipe Detection (Primary for Vercel deployment)
    let touchStartX = 0;
    let touchStartY = 0;
    let swipeHandled = false;

    viewportEl.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        swipeHandled = false;
      },
      { passive: true }
    );

    viewportEl.addEventListener(
      'touchmove',
      (e) => {
        // Prevent browser pull-to-refresh and scrolling
        e.preventDefault();
        if (swipeHandled || !state.isRunning || e.touches.length !== 1) return;

        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        if (Math.abs(dx) < CONFIG.SWIPE_THRESHOLD_PX && Math.abs(dy) < CONFIG.SWIPE_THRESHOLD_PX) {
          return;
        }

        if (Math.abs(dx) > Math.abs(dy)) {
          changeLane(dx > 0 ? 1 : -1);
          swipeHandled = true;
        } else if (dy < -CONFIG.SWIPE_THRESHOLD_PX) {
          triggerJump();
          swipeHandled = true;
        }
      },
      { passive: false }
    );

    viewportEl.addEventListener(
      'touchend',
      (e) => {
        if (swipeHandled || !state.isRunning || e.changedTouches.length === 0) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(dx) < CONFIG.SWIPE_THRESHOLD_PX && Math.abs(dy) < CONFIG.SWIPE_THRESHOLD_PX) {
          return;
        }

        if (Math.abs(dx) > Math.abs(dy)) {
          changeLane(dx > 0 ? 1 : -1);
        } else if (dy < -CONFIG.SWIPE_THRESHOLD_PX) {
          triggerJump();
        }
        swipeHandled = true;
      },
      { passive: true }
    );

    // Restart Button
    restartBtnEl.addEventListener('click', () => {
      startGame();
    });

    // Responsive Resize Handler
    window.addEventListener('resize', () => {
      updateViewportMetrics();
    });
  }

  // Boot Game
  preloadAssets();
  bindControls();
  startGame();
})();
