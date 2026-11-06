/**
 * Rocky's Halloween OutRun - 90s Pseudo-3D Vertical Arcade Runner
 * Vanilla JS engine with 3-lane vanishing point projection, state machine,
 * 2-frame scaleX(-1) running trick, audio pooling, haptics, and score >= 500 danger shift.
 */

(() => {
  'use strict';

  // Exact image and audio asset paths
  const ASSETS = {
    bgRoad: 'assets/bg-road.png',
    rockyRun: 'assets/rocky-run.png',
    rockyJump: 'assets/rocky-jump.png',
    rockyHit: 'assets/rocky-hit.png',
    enemyPumpkin: 'assets/enemy-pumpkin.png',
    enemyGhost: 'assets/enemy-ghost.png',
    enemyBat: 'assets/enemy-bat.png',
    candy: 'assets/candy.png',
    sfxClick: 'assets/sfx-click.mp3',
    sfxCollect: 'assets/sfx-collect.mp3',
    sfxHit: 'assets/sfx-hit.mp3',
  };

  const STORAGE_KEY_HIGH_SCORE = 'rocky_halloween_outrun_highscore';

  // Core Pseudo-3D & Gameplay Constants
  const CONFIG = {
    HORIZON_Y_RATIO: 0.45,       // Vanishing point Y at exactly 45% of screen height
    VANISHING_X_RATIO: 0.50,     // Vanishing point X at horizontal center (50%)
    PLAYER_Y_RATIO: 0.88,        // Player depth plane Y near bottom of screen
    LANE_SPREAD_RATIO: 0.30,     // Horizontal spread between lanes at player plane
    PERSPECTIVE_EXPONENT: 2.15,  // Non-linear depth curve for OutRun road acceleration
    MIN_SPAWN_SCALE: 0.03,       // Near-zero initial scale at vanishing point
    MAX_LIVES: 3,
    CANDY_POINTS: 10,
    DANGER_ZONE_SCORE: 500,      // Score threshold for environment visual shift
    INVINCIBILITY_MS: 1500,      // 1.5 seconds of invincibility after taking damage
    HIT_SPRITE_MS: 450,          // Duration to show rocky-hit.png on hit
    RUN_FLIP_INTERVAL_MS: 130,   // Interval to toggle scaleX(-1) for 2-frame run illusion
    JUMP_DURATION_MS: 580,       // Total jump duration in ms
    JUMP_HEIGHT_RATIO: 0.15,     // Peak jump elevation relative to viewport height
    JUMP_SCALE_BOOST: 0.28,      // Additional sprite scale multiplier at jump peak
    COLLISION_Z_MIN: 0.89,       // Depth window start for accurate lane hitbox
    COLLISION_Z_MAX: 0.99,       // Depth window end for accurate lane hitbox
    DESPAWN_Z: 1.24,             // Depth past screen bottom where objects are removed
    BASE_SPEED_Z: 0.56,          // Base depth units per second
    BASE_SPAWN_INTERVAL_MS: 960, // Base enemy/candy spawn interval
    MIN_SPAWN_INTERVAL_MS: 310,  // Minimum spawn interval cap at high scores
    SWIPE_THRESHOLD_PX: 26,      // Touch swipe threshold in pixels
  };

  // DOM Elements
  const viewportEl = document.getElementById('game-viewport');
  const bgRoadEl = document.getElementById('bg-road');
  const dangerZoneTintEl = document.getElementById('danger-zone-tint');
  const speedLinesLayerEl = document.getElementById('speed-lines-layer');
  const entitiesLayerEl = document.getElementById('entities-layer');
  const playerContainerEl = document.getElementById('player-container');
  const playerSpriteEl = document.getElementById('player-sprite');
  const playerShadowEl = document.getElementById('player-shadow');
  const damageFlashEl = document.getElementById('damage-flash');

  // HUD & Overlay Elements
  const hudEl = document.getElementById('hud');
  const scoreValueEl = document.getElementById('score-value');
  const heartEls = Array.from(document.querySelectorAll('#lives-panel .heart'));
  const pauseBtnEl = document.getElementById('pause-btn');

  const mainMenuOverlayEl = document.getElementById('main-menu-overlay');
  const menuButtonsGroupEl = document.getElementById('menu-buttons-group');
  const instructionsPanelEl = document.getElementById('instructions-panel');
  const playBtnEl = document.getElementById('play-btn');
  const howToPlayBtnEl = document.getElementById('how-to-play-btn');
  const closeInstructionsBtnEl = document.getElementById('close-instructions-btn');

  const pauseOverlayEl = document.getElementById('pause-overlay');
  const resumeBtnEl = document.getElementById('resume-btn');
  const pauseRestartBtnEl = document.getElementById('pause-restart-btn');
  const pauseHomeBtnEl = document.getElementById('pause-home-btn');

  const gameOverOverlayEl = document.getElementById('game-over-overlay');
  const finalScoreValueEl = document.getElementById('final-score-value');
  const highScoreValueEl = document.getElementById('high-score-value');
  const gameoverRestartBtnEl = document.getElementById('gameover-restart-btn');
  const gameoverHomeBtnEl = document.getElementById('gameover-home-btn');

  // Audio Instances (Strictly using the 3 required audio files)
  const audioPool = {
    click: new Audio(ASSETS.sfxClick),
    collect: new Audio(ASSETS.sfxCollect),
    hit: new Audio(ASSETS.sfxHit),
  };

  Object.values(audioPool).forEach((audio) => {
    audio.preload = 'auto';
  });

  /**
   * Plays one of the 3 game sound effects cleanly from the beginning.
   */
  function playSfx(type) {
    const sound = audioPool[type];
    if (!sound) return;
    try {
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    } catch {
      // Ignore autoplay restrictions before user interaction
    }
  }

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

  // Game State Machine ('MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER')
  const state = {
    mode: 'MENU',
    score: 0,
    highScore: 0,
    lives: CONFIG.MAX_LIVES,
    elapsedMs: 0,
    lastFrameTime: 0,
    spawnTimerMs: 0,
    speedLineTimerMs: 0,
    runFlipTimerMs: 0,
    runFlipped: false,
    lastSpawnLane: null,
    dangerZoneActive: false,
    player: {
      lane: 0,               // -1 = Left, 0 = Center, 1 = Right
      visualLane: 0,         // Smoothly interpolated lane position
      isJumping: false,
      jumpElapsedMs: 0,
      jumpProgress: 0,
      jumpArc: 0,
      invincibleRemainingMs: 0,
      hitSpriteRemainingMs: 0,
      currentSprite: ASSETS.rockyRun,
    },
    entities: [],
    speedLines: [],
  };

  /**
   * Loads saved High Score from localStorage.
   */
  function loadHighScore() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_HIGH_SCORE);
      state.highScore = saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
    } catch {
      state.highScore = 0;
    }
  }

  /**
   * Saves new High Score to localStorage if current score exceeds it.
   */
  function saveHighScore(newScore) {
    if (newScore > state.highScore) {
      state.highScore = newScore;
      try {
        window.localStorage.setItem(STORAGE_KEY_HIGH_SCORE, String(state.highScore));
      } catch {
        // Ignore storage errors in private browsing
      }
    }
  }

  /**
   * Preloads all sprite images to prevent flicker on state transitions.
   */
  function preloadImages() {
    [
      ASSETS.bgRoad,
      ASSETS.rockyRun,
      ASSETS.rockyJump,
      ASSETS.rockyHit,
      ASSETS.enemyPumpkin,
      ASSETS.enemyGhost,
      ASSETS.enemyBat,
      ASSETS.candy,
    ].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  /**
   * Updates cached viewport coordinates for vanishing point (50% X, 45% Y) and lanes.
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
   * Scales base speed, particle speed, and enemy spawn rates mathematically from score.
   */
  function getDifficultyParams() {
    if (state.mode === 'MENU') {
      return {
        speedZ: CONFIG.BASE_SPEED_Z,
        particleSpeedZ: CONFIG.BASE_SPEED_Z * 1.45,
        spawnIntervalMs: CONFIG.BASE_SPAWN_INTERVAL_MS,
      };
    }

    const scoreFactor = state.score / 100;
    const speedMultiplier = 1 + (scoreFactor * 0.24) + Math.pow(scoreFactor, 1.15) * 0.04;
    const speedZ = CONFIG.BASE_SPEED_Z * speedMultiplier;
    const particleSpeedZ = speedZ * (1.45 + scoreFactor * 0.08);
    const spawnIntervalMs = Math.max(
      CONFIG.MIN_SPAWN_INTERVAL_MS,
      CONFIG.BASE_SPAWN_INTERVAL_MS / (1 + scoreFactor * 0.30)
    );

    return { speedZ, particleSpeedZ, spawnIntervalMs };
  }

  /**
   * Checks if score has reached 500 to trigger the Danger Zone visual environment shift.
   */
  function updateEnvironmentShift() {
    const shouldActivate = state.score >= CONFIG.DANGER_ZONE_SCORE;
    if (shouldActivate !== state.dangerZoneActive) {
      state.dangerZoneActive = shouldActivate;
      bgRoadEl.classList.toggle('danger-zone', shouldActivate);
      dangerZoneTintEl.classList.toggle('active', shouldActivate);
    }
  }

  /**
   * Projects normalized depth (z: 0 at horizon -> 1 at player depth) and lane (-1, 0, 1)
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
   * Updates Rocky's image source only when changed.
   */
  function setPlayerSprite(assetPath) {
    if (state.player.currentSprite !== assetPath) {
      state.player.currentSprite = assetPath;
      playerSpriteEl.src = assetPath;
    }
  }

  /**
   * Synchronizes top HUD score and 3 hearts display.
   */
  function syncHud() {
    scoreValueEl.textContent = String(state.score).padStart(5, '0');
    heartEls.forEach((heartEl, idx) => {
      heartEl.classList.toggle('lost', idx >= state.lives);
    });
  }

  /**
   * Switches Rocky's lane Left (-1) or Right (+1).
   */
  function changeLane(direction) {
    if (state.mode !== 'PLAYING') return;
    state.player.lane = Math.max(-1, Math.min(1, state.player.lane + direction));
  }

  /**
   * Initiates a jump when grounded.
   */
  function triggerJump() {
    if (state.mode !== 'PLAYING' || state.player.isJumping) return;
    state.player.isJumping = true;
    state.player.jumpElapsedMs = 0;
    state.player.jumpProgress = 0;
    state.player.jumpArc = 0;
    playerSpriteEl.classList.remove('flip-x');
    if (state.player.hitSpriteRemainingMs <= 0) {
      setPlayerSprite(ASSETS.rockyJump);
    }
  }

  /**
   * Spawns a ground speed line exactly at the vanishing point (50% X, 45% Y).
   */
  function spawnSpeedLine() {
    const el = document.createElement('div');
    el.className = 'speed-line';

    // Radial trajectories along the road lanes and shoulders
    const trajectories = [-1.45, -1.12, -0.48, 0.48, 1.12, 1.45];
    const laneTrajectory = trajectories[Math.floor(Math.random() * trajectories.length)] +
      (Math.random() * 0.12 - 0.06);

    const initialProj = projectPseudo3D(0.01, laneTrajectory);
    el.style.transform = `translate3d(${initialProj.screenX}px, ${initialProj.screenY}px, 0) scale(${CONFIG.MIN_SPAWN_SCALE})`;

    speedLinesLayerEl.appendChild(el);
    state.speedLines.push({
      el,
      z: 0.01,
      laneTrajectory,
    });
  }

  /**
   * Spawns an enemy or candy collectible at the exact vanishing point with near-zero scale.
   */
  function spawnEntity() {
    const lanes = [-1, 0, 1];
    let lane = lanes[Math.floor(Math.random() * lanes.length)];

    if (lane === state.lastSpawnLane && Math.random() < 0.65) {
      const available = lanes.filter((l) => l !== lane);
      lane = available[Math.floor(Math.random() * available.length)];
    }
    state.lastSpawnLane = lane;

    // 34% Candy, 30% Pumpkin (ground), 18% Ghost (flying), 18% Bat (flying)
    const roll = Math.random();
    let type = 'pumpkin';
    let isFlying = false;
    let isCollectible = false;
    let asset = ASSETS.enemyPumpkin;

    if (roll < 0.34) {
      type = 'candy';
      isCollectible = true;
      asset = ASSETS.candy;
    } else if (roll < 0.64) {
      type = 'pumpkin';
      isFlying = false;
      asset = ASSETS.enemyPumpkin;
    } else if (roll < 0.82) {
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
      removing: false,
      bobSeed: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Spawns a "+10" floating score indicator when candy is collected.
   */
  function spawnScorePopup(x, y) {
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = '+10';
    popup.style.setProperty('--popup-x', `${x}px`);
    popup.style.setProperty('--popup-y', `${y}px`);
    entitiesLayerEl.appendChild(popup);

    window.setTimeout(() => {
      if (popup.parentNode) popup.parentNode.removeChild(popup);
    }, 500);
  }

  /**
   * Collects candy: +10 points, plays sfx-collect.mp3, CSS pop/fade animation, NO vibration.
   */
  function collectCandy(entity, screenX, screenY, scale) {
    entity.resolved = true;
    entity.removing = true;

    state.score += CONFIG.CANDY_POINTS;
    syncHud();
    updateEnvironmentShift();
    playSfx('collect');

    entity.el.style.setProperty('--collect-x', `${screenX}px`);
    entity.el.style.setProperty('--collect-y', `${screenY}px`);
    entity.el.style.setProperty('--collect-scale', String(scale));
    entity.el.classList.add('candy-collected');

    spawnScorePopup(screenX, screenY - 34 * scale);

    window.setTimeout(() => {
      if (entity.el.parentNode) entity.el.parentNode.removeChild(entity.el);
    }, 320);
  }

  /**
   * Handles enemy hit: -1 life, sfx-hit.mp3, red flash + camera shake,
   * navigator.vibrate(200), rocky-hit.png, and 1.5s invincibility flicker.
   */
  function handlePlayerHit(entity) {
    entity.resolved = true;

    if (state.player.invincibleRemainingMs > 0) return;

    state.lives = Math.max(0, state.lives - 1);
    syncHud();
    playSfx('hit');

    // Strong haptic feedback strictly on enemy hit
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(200);
      } catch {
        // Ignore on unsupported devices
      }
    }

    // Trigger red screen flash + camera shake
    damageFlashEl.classList.remove('flash-active');
    viewportEl.classList.remove('camera-shake');
    void damageFlashEl.offsetWidth;
    damageFlashEl.classList.add('flash-active');
    viewportEl.classList.add('camera-shake');

    // Switch to rocky-hit.png and start 1.5s invincibility
    state.player.hitSpriteRemainingMs = CONFIG.HIT_SPRITE_MS;
    state.player.invincibleRemainingMs = CONFIG.INVINCIBILITY_MS;
    playerSpriteEl.classList.remove('flip-x');
    setPlayerSprite(ASSETS.rockyHit);
    playerContainerEl.classList.add('invincible');

    if (state.lives <= 0) {
      triggerGameOver();
    }
  }

  /**
   * Updates Rocky's position, jump arc, invincibility, and 2-frame scaleX(-1) running animation.
   */
  function updatePlayer(dtMs) {
    const p = state.player;

    // Smooth lane X interpolation
    const lerpFactor = 1 - Math.pow(0.00015, dtMs / 1000);
    p.visualLane += (p.lane - p.visualLane) * lerpFactor;

    // Jump arc calculation
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

    // Hit sprite countdown
    if (p.hitSpriteRemainingMs > 0) {
      p.hitSpriteRemainingMs = Math.max(0, p.hitSpriteRemainingMs - dtMs);
    }

    // Invincibility countdown
    if (p.invincibleRemainingMs > 0) {
      p.invincibleRemainingMs = Math.max(0, p.invincibleRemainingMs - dtMs);
      if (p.invincibleRemainingMs <= 0) {
        playerContainerEl.classList.remove('invincible');
      }
    }

    // Sprite state + 2-frame horizontal flip running animation trick
    if (p.hitSpriteRemainingMs > 0) {
      setPlayerSprite(ASSETS.rockyHit);
      playerSpriteEl.classList.remove('flip-x');
    } else if (p.isJumping) {
      setPlayerSprite(ASSETS.rockyJump);
      playerSpriteEl.classList.remove('flip-x');
    } else {
      setPlayerSprite(ASSETS.rockyRun);
      state.runFlipTimerMs += dtMs;
      if (state.runFlipTimerMs >= CONFIG.RUN_FLIP_INTERVAL_MS) {
        state.runFlipTimerMs %= CONFIG.RUN_FLIP_INTERVAL_MS;
        state.runFlipped = !state.runFlipped;
        playerSpriteEl.classList.toggle('flip-x', state.runFlipped);
      }
    }

    const playerX = metrics.vanishingX + (p.visualLane * metrics.laneSpread);
    const jumpOffsetY = p.jumpArc * (metrics.height * CONFIG.JUMP_HEIGHT_RATIO);
    const playerY = metrics.playerY - jumpOffsetY;
    const playerScale = 1 + (p.jumpArc * CONFIG.JUMP_SCALE_BOOST);

    playerContainerEl.style.transform =
      `translate3d(${playerX}px, ${playerY}px, 0) translate(-50%, -100%) scale(${playerScale.toFixed(3)})`;

    const shadowScale = 1 - (p.jumpArc * 0.45);
    playerShadowEl.style.transform = `translateX(-50%) scale(${shadowScale.toFixed(2)})`;
  }

  /**
   * Updates dynamic ground speed lines originating from the vanishing point.
   */
  function updateSpeedLines(dtSec, particleSpeedZ) {
    for (let i = state.speedLines.length - 1; i >= 0; i--) {
      const line = state.speedLines[i];
      line.z += particleSpeedZ * dtSec;

      if (line.z >= CONFIG.DESPAWN_Z) {
        if (line.el.parentNode) line.el.parentNode.removeChild(line.el);
        state.speedLines.splice(i, 1);
        continue;
      }

      const proj = projectPseudo3D(line.z, line.laneTrajectory);
      const dx = proj.screenX - metrics.vanishingX;
      const dy = proj.screenY - metrics.horizonY;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
      const lineScaleY = Math.max(0.08, proj.scale * 1.65);
      const opacity = Math.min(0.9, line.z * 2.4);

      line.el.style.opacity = String(opacity.toFixed(2));
      line.el.style.transform =
        `translate3d(${proj.screenX}px, ${proj.screenY}px, 0) rotate(${angleDeg.toFixed(1)}deg) scale(1, ${lineScaleY.toFixed(2)})`;
    }
  }

  /**
   * Updates all active enemies and candies and performs lane + depth collision detection.
   */
  function updateEntities(dtSec, speedZ) {
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const entity = state.entities[i];

      if (entity.removing) {
        state.entities.splice(i, 1);
        continue;
      }

      entity.z += speedZ * dtSec;

      if (entity.z >= CONFIG.DESPAWN_Z) {
        if (entity.el.parentNode) entity.el.parentNode.removeChild(entity.el);
        state.entities.splice(i, 1);
        continue;
      }

      const proj = projectPseudo3D(entity.z, entity.lane);

      // Flying enemies hover above the road and bob vertically
      let elevationOffset = 0;
      if (entity.isFlying) {
        const hoverHeight = metrics.height * 0.085 * proj.scale;
        const bobWave = Math.sin(state.elapsedMs * 0.012 + entity.bobSeed) * (10 * proj.scale);
        elevationOffset = hoverHeight + bobWave;
      }

      const renderY = proj.screenY - elevationOffset;

      entity.el.style.zIndex = String(Math.floor(entity.z * 16));
      entity.el.style.transform =
        `translate3d(${proj.screenX}px, ${renderY}px, 0) translate(-50%, -100%) scale(${proj.scale.toFixed(4)})`;

      // Precise collision check based on lane matching and depth window
      if (
        !entity.resolved &&
        entity.z >= CONFIG.COLLISION_Z_MIN &&
        entity.z <= CONFIG.COLLISION_Z_MAX &&
        entity.lane === state.player.lane
      ) {
        if (entity.isCollectible) {
          collectCandy(entity, proj.screenX, renderY, proj.scale);
        } else if (entity.isFlying) {
          // Flying enemies (ghosts/bats) hit Rocky even if jumping
          handlePlayerHit(entity);
        } else {
          // Ground enemies (pumpkins) are ignored when Rocky is jumping
          const dodgedByJump = state.player.isJumping && state.player.jumpArc > 0.22;
          if (!dodgedByJump) {
            handlePlayerHit(entity);
          } else {
            entity.resolved = true;
          }
        }
      }
    }
  }

  /**
   * Main requestAnimationFrame loop (runs in both 'MENU' idle and 'PLAYING' states).
   */
  function tick(timestamp) {
    if (state.mode === 'PAUSED' || state.mode === 'GAMEOVER') {
      return;
    }

    if (!state.lastFrameTime) {
      state.lastFrameTime = timestamp;
    }

    const dtMs = Math.min(50, Math.max(0, timestamp - state.lastFrameTime));
    const dtSec = dtMs / 1000;
    state.lastFrameTime = timestamp;
    state.elapsedMs += dtMs;

    const { speedZ, particleSpeedZ, spawnIntervalMs } = getDifficultyParams();

    // Continuously spawn speed lines in both MENU idle mode and PLAYING mode
    state.speedLineTimerMs += dtMs;
    const speedLineInterval = Math.max(40, 90 / (particleSpeedZ / CONFIG.BASE_SPEED_Z));
    while (state.speedLineTimerMs >= speedLineInterval) {
      state.speedLineTimerMs -= speedLineInterval;
      spawnSpeedLine();
    }

    updateSpeedLines(dtSec, particleSpeedZ);
    updatePlayer(dtMs);

    // Only spawn and update obstacles/candies while actively PLAYING
    if (state.mode === 'PLAYING') {
      state.spawnTimerMs += dtMs;
      if (state.spawnTimerMs >= spawnIntervalMs) {
        state.spawnTimerMs %= spawnIntervalMs;
        spawnEntity();
      }
      updateEntities(dtSec, speedZ);
    }

    window.requestAnimationFrame(tick);
  }

  /**
   * Clears active entities and resets player state.
   */
  function resetWorldState() {
    updateViewportMetrics();
    entitiesLayerEl.innerHTML = '';
    state.entities = [];
    state.score = 0;
    state.lives = CONFIG.MAX_LIVES;
    state.elapsedMs = 0;
    state.lastFrameTime = 0;
    state.spawnTimerMs = 0;
    state.runFlipTimerMs = 0;
    state.runFlipped = false;
    state.lastSpawnLane = null;

    state.player.lane = 0;
    state.player.visualLane = 0;
    state.player.isJumping = false;
    state.player.jumpElapsedMs = 0;
    state.player.jumpProgress = 0;
    state.player.jumpArc = 0;
    state.player.invincibleRemainingMs = 0;
    state.player.hitSpriteRemainingMs = 0;

    playerContainerEl.classList.remove('invincible');
    playerSpriteEl.classList.remove('flip-x');
    damageFlashEl.classList.remove('flash-active');
    viewportEl.classList.remove('camera-shake', 'is-paused');

    setPlayerSprite(ASSETS.rockyRun);
    updateEnvironmentShift();
    syncHud();
    updatePlayer(0);

    // Ensure speed lines are pre-populated on the road
    if (state.speedLines.length === 0) {
      for (let i = 0; i < 8; i++) {
        spawnSpeedLine();
        state.speedLines[state.speedLines.length - 1].z = (i + 1) * 0.12;
      }
    }
  }

  /**
   * Enters Main Menu idle state (road idles and Rocky simulates running).
   */
  function enterMainMenu() {
    resetWorldState();
    state.mode = 'MENU';
    hudEl.classList.add('hidden');
    pauseOverlayEl.classList.add('hidden');
    gameOverOverlayEl.classList.add('hidden');
    instructionsPanelEl.classList.add('hidden');
    menuButtonsGroupEl.classList.remove('hidden');
    mainMenuOverlayEl.classList.remove('hidden');

    window.requestAnimationFrame(tick);
  }

  /**
   * Starts or restarts an active game run.
   */
  function startNewRun() {
    resetWorldState();
    state.mode = 'PLAYING';
    mainMenuOverlayEl.classList.add('hidden');
    pauseOverlayEl.classList.add('hidden');
    gameOverOverlayEl.classList.add('hidden');
    hudEl.classList.remove('hidden');

    window.requestAnimationFrame(tick);
  }

  /**
   * Freezes the game loop and displays the Pause Menu overlay.
   */
  function pauseGame() {
    if (state.mode !== 'PLAYING') return;
    state.mode = 'PAUSED';
    viewportEl.classList.add('is-paused');
    pauseOverlayEl.classList.remove('hidden');
  }

  /**
   * Resumes the game loop from Pause.
   */
  function resumeGame() {
    if (state.mode !== 'PAUSED') return;
    state.mode = 'PLAYING';
    state.lastFrameTime = 0;
    viewportEl.classList.remove('is-paused');
    pauseOverlayEl.classList.add('hidden');
    window.requestAnimationFrame(tick);
  }

  /**
   * Triggers Game Over, saves High Score to localStorage, and opens overlay.
   */
  function triggerGameOver() {
    state.mode = 'GAMEOVER';
    playerContainerEl.classList.remove('invincible');
    saveHighScore(state.score);

    finalScoreValueEl.textContent = String(state.score);
    highScoreValueEl.textContent = String(state.highScore);
    gameOverOverlayEl.classList.remove('hidden');
  }

  /**
   * Wires all UI buttons (every click triggers sfx-click.mp3), keyboard, and swipe controls.
   */
  function bindEvents() {
    // Main Menu Buttons
    playBtnEl.addEventListener('click', () => {
      playSfx('click');
      startNewRun();
    });

    howToPlayBtnEl.addEventListener('click', () => {
      playSfx('click');
      menuButtonsGroupEl.classList.add('hidden');
      instructionsPanelEl.classList.remove('hidden');
    });

    closeInstructionsBtnEl.addEventListener('click', () => {
      playSfx('click');
      instructionsPanelEl.classList.add('hidden');
      menuButtonsGroupEl.classList.remove('hidden');
    });

    // HUD Pause Button
    pauseBtnEl.addEventListener('click', () => {
      playSfx('click');
      pauseGame();
    });

    // Pause Overlay Buttons
    resumeBtnEl.addEventListener('click', () => {
      playSfx('click');
      resumeGame();
    });

    pauseRestartBtnEl.addEventListener('click', () => {
      playSfx('click');
      startNewRun();
    });

    pauseHomeBtnEl.addEventListener('click', () => {
      playSfx('click');
      enterMainMenu();
    });

    // Game Over Overlay Buttons
    gameoverRestartBtnEl.addEventListener('click', () => {
      playSfx('click');
      startNewRun();
    });

    gameoverHomeBtnEl.addEventListener('click', () => {
      playSfx('click');
      enterMainMenu();
    });

    // PC Keyboard Controls (Arrows / WASD + Space + Escape to Pause)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.mode === 'PLAYING') {
          playSfx('click');
          pauseGame();
        } else if (state.mode === 'PAUSED') {
          playSfx('click');
          resumeGame();
        }
        return;
      }

      if (state.mode !== 'PLAYING') return;

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

    // Mobile Touch Swipe Controls
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
        if (state.mode === 'PLAYING') {
          e.preventDefault();
        }
        if (swipeHandled || state.mode !== 'PLAYING' || e.touches.length !== 1) return;

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
        if (swipeHandled || state.mode !== 'PLAYING' || e.changedTouches.length === 0) return;

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

    window.addEventListener('resize', () => {
      updateViewportMetrics();
    });
  }

  // Initialize Game
  loadHighScore();
  preloadImages();
  bindEvents();
  enterMainMenu();
})();
