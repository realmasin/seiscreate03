/**
 * SEISCREATE #03: ROCKYHALLOWEN - AAA Indie Pseudo-3D Vertical Arcade Runner
 * Features:
 * - OutRun Vanishing Point Projection (Horizon at 45% height)
 * - Cinematic Start transition with smooth speed-line acceleration from 0 to full speed
 * - Rolling mechanical score counter
 * - 2x Combo System (3 consecutive candies without taking damage)
 * - Near-Miss Bonus (+50 pts for last-moment dodges)
 * - Dynamic Weather Shift (0-500 Normal, 500-1000 Lightning Flashes, 1000+ Blood Moon)
 * - Pure CSS pixel-art HUD & strict haptics
 */

(() => {
  'use strict';

  // Exact Asset Paths
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

  const STORAGE_KEY_HIGH_SCORE = 'seiscreate03_rockyhallowen_highscore';

  // Engine Constants
  const CONFIG = {
    HORIZON_Y_RATIO: 0.45,       // Vanishing point Y at 45% of screen height
    VANISHING_X_RATIO: 0.50,     // Vanishing point X at center (50%)
    PLAYER_Y_RATIO: 0.88,        // Player depth plane Y
    LANE_SPREAD_RATIO: 0.30,     // Horizontal distance between lanes at player depth
    PERSPECTIVE_EXPONENT: 2.15,  // Non-linear depth curve for OutRun road perspective
    MIN_SPAWN_SCALE: 0.03,       // Initial scale at the vanishing point
    FADE_IN_COMPLETE_Z: 0.18,    // Depth at which spawned entities reach full opacity
    MAX_LIVES: 3,
    BASE_CANDY_POINTS: 10,
    COMBO_CANDY_POINTS: 20,
    COMBO_THRESHOLD: 3,          // 3 consecutive candies triggers 2X COMBO
    NEAR_MISS_POINTS: 50,
    NEAR_MISS_WINDOW_MS: 320,    // Time window before impact that counts as a tight near-miss dodge
    WEATHER_STORM_SCORE: 500,    // 500-1000 triggers random lightning flashes
    WEATHER_BLOOD_SCORE: 1000,   // 1000+ triggers Blood Moon filter & speed surge
    INVINCIBILITY_MS: 1500,      // 1.5s invincibility on hit
    HIT_SPRITE_MS: 450,
    RUN_FLIP_INTERVAL_MS: 125,   // 2-frame scaleX(-1) running animation cadence
    CINEMATIC_ACCEL_MS: 1150,    // Smooth acceleration duration on Cinematic Start
    JUMP_DURATION_MS: 580,
    JUMP_HEIGHT_RATIO: 0.15,
    JUMP_SCALE_BOOST: 0.28,
    COLLISION_Z_MIN: 0.89,
    COLLISION_Z_MAX: 0.99,
    DESPAWN_Z: 1.24,
    BASE_SPEED_Z: 0.56,
    BASE_SPAWN_INTERVAL_MS: 950,
    MIN_SPAWN_INTERVAL_MS: 280,
    SWIPE_THRESHOLD_PX: 26,
  };

  // DOM References
  const viewportEl = document.getElementById('game-viewport');
  const bgRoadEl = document.getElementById('bg-road');
  const bloodMoonTintEl = document.getElementById('blood-moon-tint');
  const speedLinesLayerEl = document.getElementById('speed-lines-layer');
  const entitiesLayerEl = document.getElementById('entities-layer');
  const playerContainerEl = document.getElementById('player-container');
  const playerSpriteEl = document.getElementById('player-sprite');
  const playerShadowEl = document.getElementById('player-shadow');
  const lightningFlashEl = document.getElementById('lightning-flash');
  const damageFlashEl = document.getElementById('damage-flash');

  // HUD & Menus
  const hudEl = document.getElementById('hud');
  const scoreValueEl = document.getElementById('score-value');
  const comboBannerEl = document.getElementById('combo-banner');
  const heartEls = Array.from(document.querySelectorAll('#lives-panel .pixel-heart'));
  const pauseBtnEl = document.getElementById('pause-btn');

  const mainMenuOverlayEl = document.getElementById('main-menu-overlay');
  const menuButtonsGroupEl = document.getElementById('menu-buttons-group');
  const instructionsPanelEl = document.getElementById('instructions-panel');
  const insertCoinBtnEl = document.getElementById('insert-coin-btn');
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

  // Audio Pool (Strictly the 3 required MP3 files)
  const audioPool = {
    click: new Audio(ASSETS.sfxClick),
    collect: new Audio(ASSETS.sfxCollect),
    hit: new Audio(ASSETS.sfxHit),
  };

  Object.values(audioPool).forEach((audio) => {
    audio.preload = 'auto';
  });

  function playSfx(type) {
    const sound = audioPool[type];
    if (!sound) return;
    try {
      sound.currentTime = 0;
      const p = sound.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // Ignore browser autoplay errors prior to interaction
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

  // Mutable Game State
  const state = {
    mode: 'MENU',                // 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'
    targetScore: 0,              // Actual gameplay score
    displayScore: 0,             // Rolling mechanical display score
    highScore: 0,
    lives: CONFIG.MAX_LIVES,
    consecutiveCandies: 0,       // Tracks 2x combo streak
    elapsedMs: 0,
    lastFrameTime: 0,
    cinematicProgress: 0,        // 0 (idle) -> 1 (full speed after cinematic start)
    spawnTimerMs: 0,
    speedLineTimerMs: 0,
    runFlipTimerMs: 0,
    runFlipped: false,
    lightningTimerMs: 1800,
    lastSpawnLane: null,
    lastLaneChangeTimeMs: -9999,
    previousLane: 0,
    player: {
      lane: 0,                   // -1 = Left, 0 = Center, 1 = Right
      visualLane: 0,
      screenX: 0,
      screenY: 0,
      isJumping: false,
      jumpStartTimeMs: -9999,
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

  function loadHighScore() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_HIGH_SCORE);
      state.highScore = saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
    } catch {
      state.highScore = 0;
    }
  }

  function saveHighScore(score) {
    if (score > state.highScore) {
      state.highScore = score;
      try {
        window.localStorage.setItem(STORAGE_KEY_HIGH_SCORE, String(state.highScore));
      } catch {
        // Ignore storage errors
      }
    }
  }

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
   * Computes current speed and spawn intervals based on score, weather phase, and cinematic ramp.
   */
  function getDifficultyParams() {
    if (state.mode === 'MENU') {
      return {
        speedZ: 0,
        particleSpeedZ: 0,
        spawnIntervalMs: CONFIG.BASE_SPAWN_INTERVAL_MS,
      };
    }

    const scoreFactor = state.targetScore / 100;
    const bloodMoonBoost = state.targetScore >= CONFIG.WEATHER_BLOOD_SCORE ? 0.48 : 0;
    const rawMultiplier = 1 + (scoreFactor * 0.22) + bloodMoonBoost;

    // Multiply by cinematicProgress (0 -> 1) so speed lines smoothly accelerate from 0 on start
    const accelEase = state.cinematicProgress * state.cinematicProgress * (3 - 2 * state.cinematicProgress);
    const speedZ = CONFIG.BASE_SPEED_Z * rawMultiplier * Math.max(0.05, accelEase);
    const particleSpeedZ = CONFIG.BASE_SPEED_Z * rawMultiplier * 1.55 * accelEase;

    const spawnIntervalMs = Math.max(
      CONFIG.MIN_SPAWN_INTERVAL_MS,
      CONFIG.BASE_SPAWN_INTERVAL_MS / (1 + scoreFactor * 0.28 + bloodMoonBoost * 0.5)
    );

    return { speedZ, particleSpeedZ, spawnIntervalMs };
  }

  /**
   * Updates Dynamic Weather Shift:
   * - 0-499: Normal purple background
   * - 500-999: Random white lightning screen flashes
   * - 1000+: Blood Moon deep blood-red filter + drastic speed surge
   */
  function updateWeatherSystem(dtMs) {
    const score = state.targetScore;
    const isBloodMoon = score >= CONFIG.WEATHER_BLOOD_SCORE;
    const isStormPhase = score >= CONFIG.WEATHER_STORM_SCORE && score < CONFIG.WEATHER_BLOOD_SCORE;

    bgRoadEl.classList.toggle('blood-moon', isBloodMoon);
    bloodMoonTintEl.classList.toggle('active', isBloodMoon);

    if (isStormPhase && state.mode === 'PLAYING') {
      state.lightningTimerMs -= dtMs;
      if (state.lightningTimerMs <= 0) {
        // Trigger white lightning screen flash
        lightningFlashEl.classList.remove('strike-active');
        void lightningFlashEl.offsetWidth;
        lightningFlashEl.classList.add('strike-active');
        // Schedule next random lightning bolt between 1.8s and 4.4s
        state.lightningTimerMs = 1800 + Math.random() * 2600;
      }
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

  function setPlayerSprite(assetPath) {
    if (state.player.currentSprite !== assetPath) {
      state.player.currentSprite = assetPath;
      playerSpriteEl.src = assetPath;
    }
  }

  /**
   * Updates lives hearts and 2x combo banner.
   */
  function syncHudStatus() {
    heartEls.forEach((heartEl, idx) => {
      heartEl.classList.toggle('lost', idx >= state.lives);
    });
    const isComboActive = state.consecutiveCandies >= CONFIG.COMBO_THRESHOLD;
    comboBannerEl.classList.toggle('hidden', !isComboActive);
  }

  /**
   * Rolling mechanical score counter: increments displayScore smoothly toward targetScore.
   */
  function updateRollingScore(dtMs) {
    if (state.displayScore < state.targetScore) {
      const diff = state.targetScore - state.displayScore;
      const step = Math.max(1, Math.ceil((diff * dtMs) / 95));
      state.displayScore = Math.min(state.targetScore, state.displayScore + step);
      scoreValueEl.textContent = String(state.displayScore).padStart(5, '0');
    } else if (state.displayScore > state.targetScore) {
      state.displayScore = state.targetScore;
      scoreValueEl.textContent = String(state.displayScore).padStart(5, '0');
    }
  }

  /**
   * Spawns floating text (+10, +20, or NEAR MISS! +50) at Rocky's current position.
   */
  function spawnFloatingTextAtRocky(text, variantClass = '') {
    const el = document.createElement('div');
    el.className = `floating-text ${variantClass}`.trim();
    el.textContent = text;
    const spawnX = state.player.screenX || metrics.vanishingX;
    const spawnY = (state.player.screenY || metrics.playerY) - 68;
    el.style.setProperty('--ft-x', `${spawnX}px`);
    el.style.setProperty('--ft-y', `${spawnY}px`);
    entitiesLayerEl.appendChild(el);

    window.setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 620);
  }

  /**
   * Moves Rocky left or right and records the timestamp for Near-Miss detection.
   */
  function changeLane(direction) {
    if (state.mode !== 'PLAYING') return;
    const nextLane = Math.max(-1, Math.min(1, state.player.lane + direction));
    if (nextLane !== state.player.lane) {
      state.previousLane = state.player.lane;
      state.player.lane = nextLane;
      state.lastLaneChangeTimeMs = state.elapsedMs;
    }
  }

  /**
   * Initiates Rocky's jump and records jump start time for Near-Miss detection.
   */
  function triggerJump() {
    if (state.mode !== 'PLAYING' || state.player.isJumping) return;
    state.player.isJumping = true;
    state.player.jumpStartTimeMs = state.elapsedMs;
    state.player.jumpElapsedMs = 0;
    state.player.jumpProgress = 0;
    state.player.jumpArc = 0;
    playerSpriteEl.classList.remove('flip-x');
    if (state.player.hitSpriteRemainingMs <= 0) {
      setPlayerSprite(ASSETS.rockyJump);
    }
  }

  /**
   * Spawns a dynamic ground speed line at the vanishing point.
   */
  function spawnSpeedLine(initialZ = 0.01) {
    const el = document.createElement('div');
    el.className = 'speed-line';

    const trajectories = [-1.45, -1.12, -0.48, 0.48, 1.12, 1.45];
    const laneTrajectory = trajectories[Math.floor(Math.random() * trajectories.length)] +
      (Math.random() * 0.12 - 0.06);

    const proj = projectPseudo3D(initialZ, laneTrajectory);
    const dx = proj.screenX - metrics.vanishingX;
    const dy = proj.screenY - metrics.horizonY;
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
    const lineScaleY = Math.max(0.08, proj.scale * 1.65);

    el.style.opacity = String(Math.min(0.9, initialZ * 2.4).toFixed(2));
    el.style.transform =
      `translate3d(${proj.screenX}px, ${proj.screenY}px, 0) rotate(${angleDeg.toFixed(1)}deg) scale(1, ${lineScaleY.toFixed(2)})`;

    speedLinesLayerEl.appendChild(el);
    state.speedLines.push({
      el,
      z: initialZ,
      laneTrajectory,
    });
  }

  /**
   * Spawns an enemy or candy at the vanishing point with fade-in and scale-up animation.
   */
  function spawnEntity() {
    const lanes = [-1, 0, 1];
    let lane = lanes[Math.floor(Math.random() * lanes.length)];

    if (lane === state.lastSpawnLane && Math.random() < 0.65) {
      const others = lanes.filter((l) => l !== lane);
      lane = others[Math.floor(Math.random() * others.length)];
    }
    state.lastSpawnLane = lane;

    // 35% Candy, 29% Pumpkin (ground), 18% Ghost (flying), 18% Bat (flying)
    const roll = Math.random();
    let type = 'pumpkin';
    let isFlying = false;
    let isCollectible = false;
    let asset = ASSETS.enemyPumpkin;

    if (roll < 0.35) {
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
    el.style.opacity = '0';
    el.style.transform =
      `translate3d(${initialProj.screenX}px, ${initialProj.screenY}px, 0) translate(-50%, -100%) scale(${CONFIG.MIN_SPAWN_SCALE})`;

    entitiesLayerEl.appendChild(el);

    state.entities.push({
      el,
      type,
      lane,
      z: 0,
      isFlying,
      isCollectible,
      resolved: false,
      nearMissChecked: false,
      removing: false,
      bobSeed: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Collects candy: increments combo counter, awards +10 (or +20 in 2x combo),
   * spawns floating text at Rocky's position, plays sfx-collect.mp3, NO vibration.
   */
  function collectCandy(entity, screenX, screenY, scale) {
    entity.resolved = true;
    entity.removing = true;

    state.consecutiveCandies += 1;
    const isCombo = state.consecutiveCandies >= CONFIG.COMBO_THRESHOLD;
    const pointsAwarded = isCombo ? CONFIG.COMBO_CANDY_POINTS : CONFIG.BASE_CANDY_POINTS;

    state.targetScore += pointsAwarded;
    syncHudStatus();
    playSfx('collect');

    entity.el.style.setProperty('--collect-x', `${screenX}px`);
    entity.el.style.setProperty('--collect-y', `${screenY}px`);
    entity.el.style.setProperty('--collect-scale', String(scale));
    entity.el.classList.add('candy-collected');

    spawnFloatingTextAtRocky(`+${pointsAwarded}`, isCombo ? 'combo-pts' : '');

    window.setTimeout(() => {
      if (entity.el.parentNode) entity.el.parentNode.removeChild(entity.el);
    }, 300);
  }

  /**
   * Awards +50 Near-Miss bonus when Rocky dodges an enemy by a tight margin.
   */
  function triggerNearMissBonus() {
    state.targetScore += CONFIG.NEAR_MISS_POINTS;
    spawnFloatingTextAtRocky('NEAR MISS! +50', 'near-miss-pts');
  }

  /**
   * Handles taking damage from an enemy: resets combo, -1 life, plays sfx-hit.mp3,
   * triggers navigator.vibrate(200), screen shake + red flash, and 1.5s invincibility.
   */
  function handlePlayerHit(entity) {
    entity.resolved = true;
    entity.nearMissChecked = true;

    if (state.player.invincibleRemainingMs > 0) return;

    // Reset 2x Combo streak on damage
    state.consecutiveCandies = 0;
    state.lives = Math.max(0, state.lives - 1);
    syncHudStatus();
    playSfx('hit');

    // Strong haptic feedback strictly on enemy hit
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(200);
      } catch {
        // Ignore on unsupported browsers
      }
    }

    damageFlashEl.classList.remove('flash-active');
    viewportEl.classList.remove('camera-shake');
    void damageFlashEl.offsetWidth;
    damageFlashEl.classList.add('flash-active');
    viewportEl.classList.add('camera-shake');

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
   * Updates Rocky's position, jump arc, and 2-frame scaleX(-1) running animation.
   */
  function updatePlayer(dtMs) {
    const p = state.player;

    const lerpFactor = 1 - Math.pow(0.00015, dtMs / 1000);
    p.visualLane += (p.lane - p.visualLane) * lerpFactor;

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

    if (p.hitSpriteRemainingMs > 0) {
      p.hitSpriteRemainingMs = Math.max(0, p.hitSpriteRemainingMs - dtMs);
    }

    if (p.invincibleRemainingMs > 0) {
      p.invincibleRemainingMs = Math.max(0, p.invincibleRemainingMs - dtMs);
      if (p.invincibleRemainingMs <= 0) {
        playerContainerEl.classList.remove('invincible');
      }
    }

    // In MENU mode Rocky idles; once PLAYING starts, Rocky immediately runs with 2-frame flip
    if (p.hitSpriteRemainingMs > 0) {
      setPlayerSprite(ASSETS.rockyHit);
      playerSpriteEl.classList.remove('flip-x');
    } else if (p.isJumping) {
      setPlayerSprite(ASSETS.rockyJump);
      playerSpriteEl.classList.remove('flip-x');
    } else {
      setPlayerSprite(ASSETS.rockyRun);
      if (state.mode === 'PLAYING') {
        state.runFlipTimerMs += dtMs;
        if (state.runFlipTimerMs >= CONFIG.RUN_FLIP_INTERVAL_MS) {
          state.runFlipTimerMs %= CONFIG.RUN_FLIP_INTERVAL_MS;
          state.runFlipped = !state.runFlipped;
          playerSpriteEl.classList.toggle('flip-x', state.runFlipped);
        }
      } else {
        playerSpriteEl.classList.remove('flip-x');
      }
    }

    const playerX = metrics.vanishingX + (p.visualLane * metrics.laneSpread);
    const jumpOffsetY = p.jumpArc * (metrics.height * CONFIG.JUMP_HEIGHT_RATIO);
    const playerY = metrics.playerY - jumpOffsetY;
    const playerScale = 1 + (p.jumpArc * CONFIG.JUMP_SCALE_BOOST);

    p.screenX = playerX;
    p.screenY = playerY;

    playerContainerEl.style.transform =
      `translate3d(${playerX}px, ${playerY}px, 0) translate(-50%, -100%) scale(${playerScale.toFixed(3)})`;

    const shadowScale = 1 - (p.jumpArc * 0.45);
    playerShadowEl.style.transform = `translateX(-50%) scale(${shadowScale.toFixed(2)})`;
  }

  /**
   * Updates dynamic ground speed lines.
   */
  function updateSpeedLines(dtSec, particleSpeedZ) {
    if (particleSpeedZ <= 0) return;

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
   * Updates enemies and candies, smooth spawn fade-in, collisions, and Near-Miss detection.
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

      let elevationOffset = 0;
      if (entity.isFlying) {
        const hoverHeight = metrics.height * 0.085 * proj.scale;
        const bobWave = Math.sin(state.elapsedMs * 0.012 + entity.bobSeed) * (10 * proj.scale);
        elevationOffset = hoverHeight + bobWave;
      }

      const renderY = proj.screenY - elevationOffset;

      // Smooth fade-in from the vanishing point so enemies never snap into existence
      const fadeInOpacity = Math.min(1, entity.z / CONFIG.FADE_IN_COMPLETE_Z);
      entity.el.style.opacity = String(fadeInOpacity.toFixed(2));
      entity.el.style.zIndex = String(Math.floor(entity.z * 16));
      entity.el.style.transform =
        `translate3d(${proj.screenX}px, ${renderY}px, 0) translate(-50%, -100%) scale(${proj.scale.toFixed(4)})`;

      // Collision Window Check
      if (
        !entity.resolved &&
        entity.z >= CONFIG.COLLISION_Z_MIN &&
        entity.z <= CONFIG.COLLISION_Z_MAX &&
        entity.lane === state.player.lane
      ) {
        if (entity.isCollectible) {
          collectCandy(entity, proj.screenX, renderY, proj.scale);
        } else if (entity.isFlying) {
          handlePlayerHit(entity);
        } else {
          // Ground pumpkin: dodged if jumping
          const dodgedByJump = state.player.isJumping && state.player.jumpArc > 0.22;
          if (!dodgedByJump) {
            handlePlayerHit(entity);
          } else {
            entity.resolved = true;
            entity.nearMissChecked = true;
            // If player jumped at the very last moment before the pumpkin, award Near-Miss
            if (state.elapsedMs - state.player.jumpStartTimeMs <= CONFIG.NEAR_MISS_WINDOW_MS) {
              triggerNearMissBonus();
            }
          }
        }
      }

      // Near-Miss Detection when an enemy just passes the collision plane without hitting Rocky
      if (
        !entity.isCollectible &&
        !entity.resolved &&
        !entity.nearMissChecked &&
        entity.z > CONFIG.COLLISION_Z_MAX
      ) {
        entity.nearMissChecked = true;
        const dodgedLastSecondFromLane =
          state.previousLane === entity.lane &&
          state.player.lane !== entity.lane &&
          state.elapsedMs - state.lastLaneChangeTimeMs <= CONFIG.NEAR_MISS_WINDOW_MS;

        const tightVisualProximity = Math.abs(state.player.visualLane - entity.lane) < 0.62 &&
          state.player.lane !== entity.lane;

        if (dodgedLastSecondFromLane || tightVisualProximity) {
          triggerNearMissBonus();
        }
      }
    }
  }

  /**
   * Main requestAnimationFrame Game Loop.
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

    if (state.mode === 'PLAYING') {
      // Smoothly ramp cinematic acceleration from 0 to 1
      if (state.cinematicProgress < 1) {
        state.cinematicProgress = Math.min(1, state.cinematicProgress + dtMs / CONFIG.CINEMATIC_ACCEL_MS);
      }

      const { speedZ, particleSpeedZ, spawnIntervalMs } = getDifficultyParams();

      state.speedLineTimerMs += dtMs;
      const speedLineInterval = Math.max(38, 92 / Math.max(0.25, particleSpeedZ / CONFIG.BASE_SPEED_Z));
      while (state.speedLineTimerMs >= speedLineInterval) {
        state.speedLineTimerMs -= speedLineInterval;
        spawnSpeedLine(0.01);
      }

      state.spawnTimerMs += dtMs;
      if (state.spawnTimerMs >= spawnIntervalMs) {
        state.spawnTimerMs %= spawnIntervalMs;
        spawnEntity();
      }

      updateSpeedLines(dtSec, particleSpeedZ);
      updateEntities(dtSec, speedZ);
      updateRollingScore(dtMs);
      updateWeatherSystem(dtMs);
    }

    updatePlayer(dtMs);
    window.requestAnimationFrame(tick);
  }

  /**
   * Resets world entities and player state.
   */
  function resetWorldState() {
    updateViewportMetrics();
    entitiesLayerEl.innerHTML = '';
    speedLinesLayerEl.innerHTML = '';

    state.entities = [];
    state.speedLines = [];
    state.targetScore = 0;
    state.displayScore = 0;
    state.lives = CONFIG.MAX_LIVES;
    state.consecutiveCandies = 0;
    state.elapsedMs = 0;
    state.lastFrameTime = 0;
    state.cinematicProgress = 0;
    state.spawnTimerMs = 0;
    state.speedLineTimerMs = 0;
    state.runFlipTimerMs = 0;
    state.runFlipped = false;
    state.lightningTimerMs = 1800;
    state.lastSpawnLane = null;
    state.lastLaneChangeTimeMs = -9999;
    state.previousLane = 0;

    state.player.lane = 0;
    state.player.visualLane = 0;
    state.player.isJumping = false;
    state.player.jumpStartTimeMs = -9999;
    state.player.jumpElapsedMs = 0;
    state.player.jumpProgress = 0;
    state.player.jumpArc = 0;
    state.player.invincibleRemainingMs = 0;
    state.player.hitSpriteRemainingMs = 0;

    playerContainerEl.classList.remove('invincible');
    playerSpriteEl.classList.remove('flip-x');
    damageFlashEl.classList.remove('flash-active');
    lightningFlashEl.classList.remove('strike-active');
    bgRoadEl.classList.remove('blood-moon');
    bloodMoonTintEl.classList.remove('active');
    viewportEl.classList.remove('camera-shake', 'is-paused');

    scoreValueEl.textContent = '00000';
    setPlayerSprite(ASSETS.rockyRun);
    syncHudStatus();
    updatePlayer(0);

    // Seed stationary perspective speed lines ready to accelerate on Cinematic Start
    for (let i = 0; i < 8; i++) {
      spawnSpeedLine((i + 1) * 0.11);
    }
  }

  /**
   * Enters Main Menu idle state (Rocky idles on the road).
   */
  function enterMainMenu() {
    resetWorldState();
    state.mode = 'MENU';
    hudEl.classList.add('hud-hidden');
    pauseOverlayEl.classList.add('hidden');
    gameOverOverlayEl.classList.add('hidden');
    instructionsPanelEl.classList.add('hidden');
    menuButtonsGroupEl.classList.remove('hidden');
    mainMenuOverlayEl.classList.remove('hidden', 'fade-out');

    window.requestAnimationFrame(tick);
  }

  /**
   * Triggers Cinematic Start: Main Menu smoothly fades out while Rocky immediately starts
   * running and the ground speed lines accelerate from 0 to full speed.
   */
  function triggerCinematicStart() {
    if (state.mode === 'PLAYING') return;
    resetWorldState();
    state.mode = 'PLAYING';
    state.cinematicProgress = 0;

    pauseOverlayEl.classList.add('hidden');
    gameOverOverlayEl.classList.add('hidden');
    hudEl.classList.remove('hud-hidden');

    // Smoothly fade out the Main Menu without cutting to black
    mainMenuOverlayEl.classList.add('fade-out');
    window.setTimeout(() => {
      if (state.mode === 'PLAYING') {
        mainMenuOverlayEl.classList.add('hidden');
      }
    }, 650);

    window.requestAnimationFrame(tick);
  }

  function pauseGame() {
    if (state.mode !== 'PLAYING') return;
    state.mode = 'PAUSED';
    viewportEl.classList.add('is-paused');
    pauseOverlayEl.classList.remove('hidden');
  }

  function resumeGame() {
    if (state.mode !== 'PAUSED') return;
    state.mode = 'PLAYING';
    state.lastFrameTime = 0;
    viewportEl.classList.remove('is-paused');
    pauseOverlayEl.classList.add('hidden');
    window.requestAnimationFrame(tick);
  }

  function triggerGameOver() {
    state.mode = 'GAMEOVER';
    playerContainerEl.classList.remove('invincible');
    saveHighScore(state.targetScore);

    scoreValueEl.textContent = String(state.targetScore).padStart(5, '0');
    finalScoreValueEl.textContent = String(state.targetScore);
    highScoreValueEl.textContent = String(state.highScore);
    gameOverOverlayEl.classList.remove('hidden');
  }

  function bindEvents() {
    // Main Menu Buttons
    insertCoinBtnEl.addEventListener('click', () => {
      playSfx('click');
      triggerCinematicStart();
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
      triggerCinematicStart();
    });

    pauseHomeBtnEl.addEventListener('click', () => {
      playSfx('click');
      enterMainMenu();
    });

    // Game Over Buttons
    gameoverRestartBtnEl.addEventListener('click', () => {
      playSfx('click');
      triggerCinematicStart();
    });

    gameoverHomeBtnEl.addEventListener('click', () => {
      playSfx('click');
      enterMainMenu();
    });

    // PC Keyboard Controls
    window.addEventListener('keydown', (e) => {
      if (state.mode === 'MENU' && (e.key === 'Enter' || e.key === ' ')) {
        if (instructionsPanelEl.classList.contains('hidden')) {
          e.preventDefault();
          playSfx('click');
          triggerCinematicStart();
          return;
        }
      }

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

    // Mobile Swipe Controls
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

  // Boot Game
  loadHighScore();
  preloadImages();
  bindEvents();
  enterMainMenu();
})();
