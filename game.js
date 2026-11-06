/**
 * ROCKY'S OUTRUN (#SEISCREATE #03: ROCKYHALLOWEN)
 * Production-Ready Pseudo-3D Vertical Arcade Runner Engine
 * All comments written strictly in English.
 */

(() => {
  'use strict';

  // Exact Asset Paths
  const ASSETS = {
    bgRoad: 'assets/bg-road.png',
    envTree: 'assets/env-tree.png',
    envGrave: 'assets/env-grave.png',
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
    HORIZON_Y_RATIO: 0.45,          // Vanishing point fixed at Y: 45% of screen height
    VANISHING_X_RATIO: 0.50,        // Vanishing point fixed at X: 50% of screen width
    PLAYER_Y_RATIO: 0.88,           // Player depth plane Y
    LANE_SPREAD_RATIO: 0.30,        // Horizontal distance between center lanes at player plane
    PERSPECTIVE_EXPONENT: 2.15,     // Non-linear OutRun depth curve
    MIN_SPAWN_SCALE: 0.03,          // Near-zero initial scale at the vanishing point
    FADE_IN_COMPLETE_Z: 0.16,       // Depth at which spawned objects reach full opacity
    MAX_LIVES: 3,
    AUTO_SCORE_INTERVAL_MS: 200,    // Automatic distance survival score tick interval
    BASE_CANDY_POINTS: 10,
    COMBO_CANDY_POINTS: 20,
    COMBO_THRESHOLD: 3,             // 3 consecutive candies triggers shaking 2X COMBO banner
    NEAR_MISS_POINTS: 50,
    NEAR_MISS_WINDOW_MS: 330,       // Tight dodge window before impact for +50 Near-Miss
    BAT_WARNING_DURATION_MS: 1000,  // 1.0s blinking red '!' at vanishing point before Bat spawns
    BAT_SPEED_MULTIPLIER: 1.32,     // Bats fly faster than standard enemies
    SLOW_MO_DEATH_MS: 1000,         // 1.0s slow-motion effect when losing final life
    SLOW_MO_TIME_SCALE: 0.22,       // Time dilation factor during slow-motion death
    WEATHER_STORM_SCORE: 500,       // Score 500-1000 triggers lightning flashes
    WEATHER_BLOOD_SCORE: 1000,      // Score 1000+ triggers Blood Moon filter & speed boost
    INVINCIBILITY_MS: 1500,         // 1.5s invincibility flicker after taking non-lethal damage
    HIT_SPRITE_MS: 460,
    RUN_FLIP_INTERVAL_MS: 130,      // 2-frame scaleX(-1) running animation cadence
    CINEMATIC_ACCEL_MS: 1200,       // Smooth acceleration duration on Cinematic Start
    JUMP_DURATION_MS: 600,
    JUMP_HEIGHT_RATIO: 0.15,
    JUMP_SCALE_BOOST: 0.28,
    COLLISION_Z_MIN: 0.89,
    COLLISION_Z_MAX: 0.99,
    DESPAWN_Z: 1.25,
    BASE_SPEED_Z: 0.42,             // Accessible starting speed
    MAX_SPEED_MULTIPLIER: 2.15,     // Maximum speed cap for long-run playability
    BASE_SPAWN_INTERVAL_MS: 1250,   // Accessible starting hazard spawn interval
    MIN_SPAWN_INTERVAL_MS: 440,     // Minimum hazard spawn interval floor
    SWIPE_THRESHOLD_PX: 26,
  };

  // DOM References
  const viewportEl = document.getElementById('game-viewport');
  const bgRoadEl = document.getElementById('bg-road');
  const envLayerEl = document.getElementById('env-layer');
  const speedLinesLayerEl = document.getElementById('speed-lines-layer');
  const entitiesLayerEl = document.getElementById('entities-layer');
  const warningsLayerEl = document.getElementById('warnings-layer');
  const landingDustLayerEl = document.getElementById('landing-dust-layer');
  const playerContainerEl = document.getElementById('player-container');
  const playerSpriteEl = document.getElementById('player-sprite');
  const playerShadowEl = document.getElementById('player-shadow');
  const bloodMoonTintEl = document.getElementById('blood-moon-tint');
  const lightningFlashEl = document.getElementById('lightning-flash');
  const damageFlashEl = document.getElementById('damage-flash');

  // HUD & Menu Elements
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
  const candiesCollectedValueEl = document.getElementById('candies-collected-value');
  const maxComboValueEl = document.getElementById('max-combo-value');
  const gameoverRestartBtnEl = document.getElementById('gameover-restart-btn');
  const gameoverHomeBtnEl = document.getElementById('gameover-home-btn');

  // Audio Pool
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
      // Ignore browser autoplay restrictions before first interaction
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
    mode: 'MENU',                // 'MENU' | 'PLAYING' | 'PAUSED' | 'DYING' | 'GAMEOVER'
    targetScore: 0,              // Authoritative score
    displayScore: 0,             // Rolling mechanical HUD score
    highScore: 0,
    lives: CONFIG.MAX_LIVES,
    candiesCollected: 0,
    consecutiveCandies: 0,
    maxCombo: 0,
    elapsedMs: 0,
    lastFrameTime: 0,
    cinematicProgress: 0,
    autoScoreTimerMs: 0,
    spawnTimerMs: 0,
    envSpawnTimerMs: 0,
    speedLineTimerMs: 0,
    runFlipTimerMs: 0,
    runFlipped: false,
    lightningTimerMs: 2400,
    slowMoRemainingMs: 0,
    lastSpawnLane: null,
    lastEnvSide: 1,
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
    envProps: [],
    pendingBatWarnings: [],
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
      ASSETS.envTree,
      ASSETS.envGrave,
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
   * Progressive Difficulty Curve:
   * Starts slow and progressively scales speed and spawn rates based on score.
   */
  function getDifficultyParams() {
    const attractWorldSpeedZ = CONFIG.BASE_SPEED_Z * 0.45;

    if (state.mode === 'MENU') {
      return {
        speedZ: 0,
        envSpeedZ: attractWorldSpeedZ,
        particleSpeedZ: attractWorldSpeedZ * 1.25,
        spawnIntervalMs: CONFIG.BASE_SPAWN_INTERVAL_MS,
      };
    }

    const gentleScoreFactor = state.targetScore / 250;
    const bloodMoonBoost = state.targetScore >= CONFIG.WEATHER_BLOOD_SCORE ? 0.28 : 0;
    const speedMultiplier = Math.min(
      CONFIG.MAX_SPEED_MULTIPLIER,
      1 + (gentleScoreFactor * 0.10) + bloodMoonBoost
    );

    const accelEase = state.cinematicProgress * state.cinematicProgress * (3 - 2 * state.cinematicProgress);
    const speedZ = CONFIG.BASE_SPEED_Z * speedMultiplier * Math.max(0.15, accelEase);
    const envSpeedZ = attractWorldSpeedZ + (speedZ - attractWorldSpeedZ) * accelEase;

    const fullParticleSpeedZ = CONFIG.BASE_SPEED_Z * speedMultiplier * 1.5;
    const particleSpeedZ = (attractWorldSpeedZ * 1.25) + (fullParticleSpeedZ - attractWorldSpeedZ * 1.25) * accelEase;

    const spawnIntervalMs = Math.max(
      CONFIG.MIN_SPAWN_INTERVAL_MS,
      CONFIG.BASE_SPAWN_INTERVAL_MS / (1 + gentleScoreFactor * 0.12 + bloodMoonBoost * 0.25)
    );

    return { speedZ, envSpeedZ, particleSpeedZ, spawnIntervalMs };
  }

  /**
   * Handles ambient lightning flashes and Dynamic Weather Shift (Storm at 500+, Blood Moon at 1000+).
   */
  function updateWeatherAndMenuLightning(dtMs) {
    if (state.mode === 'MENU') {
      state.lightningTimerMs -= dtMs;
      if (state.lightningTimerMs <= 0) {
        lightningFlashEl.classList.remove('subtle-strike', 'strike-active');
        void lightningFlashEl.offsetWidth;
        lightningFlashEl.classList.add('subtle-strike');
        state.lightningTimerMs = 2600 + Math.random() * 3400;
      }
      return;
    }

    const score = state.targetScore;
    const isBloodMoon = score >= CONFIG.WEATHER_BLOOD_SCORE;
    const isStormPhase = score >= CONFIG.WEATHER_STORM_SCORE && score < CONFIG.WEATHER_BLOOD_SCORE;

    bgRoadEl.classList.toggle('blood-moon', isBloodMoon);
    bloodMoonTintEl.classList.toggle('active', isBloodMoon);

    if (isStormPhase && state.mode === 'PLAYING') {
      state.lightningTimerMs -= dtMs;
      if (state.lightningTimerMs <= 0) {
        lightningFlashEl.classList.remove('subtle-strike', 'strike-active');
        void lightningFlashEl.offsetWidth;
        lightningFlashEl.classList.add('strike-active');
        state.lightningTimerMs = 2000 + Math.random() * 2800;
      }
    }
  }

  /**
   * Projects normalized depth z (0 at vanishing point X: 50%, Y: 45% -> 1 at player plane)
   * and lateral offset into 2D screen coordinates and scale.
   */
  function projectPseudo3D(z, lateralOffset) {
    const clampedZ = Math.max(0, z);
    const perspectiveProgress = Math.pow(clampedZ, CONFIG.PERSPECTIVE_EXPONENT);

    const screenX = metrics.vanishingX + (lateralOffset * metrics.laneSpread * perspectiveProgress);
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

  function syncHudStatus() {
    heartEls.forEach((heartEl, idx) => {
      heartEl.classList.toggle('lost', idx >= state.lives);
    });
    const isComboActive = state.consecutiveCandies >= CONFIG.COMBO_THRESHOLD;
    comboBannerEl.classList.toggle('hidden', !isComboActive);
  }

  /**
   * Mechanical rolling score tracker: increments displayScore rapidly toward targetScore.
   */
  function updateRollingScore(dtMs) {
    if (state.displayScore < state.targetScore) {
      const diff = state.targetScore - state.displayScore;
      const step = Math.max(1, Math.ceil((diff * dtMs) / 85));
      state.displayScore = Math.min(state.targetScore, state.displayScore + step);
      scoreValueEl.textContent = String(state.displayScore).padStart(5, '0');
    } else if (state.displayScore > state.targetScore) {
      state.displayScore = state.targetScore;
      scoreValueEl.textContent = String(state.displayScore).padStart(5, '0');
    }
  }

  /**
   * Spawns fading "+10" or "+20" floating text at Rocky's position when candy is collected.
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
    }, 650);
  }

  function changeLane(direction) {
    if (state.mode !== 'PLAYING') return;
    const nextLane = Math.max(-1, Math.min(1, state.player.lane + direction));
    if (nextLane !== state.player.lane) {
      state.previousLane = state.player.lane;
      state.player.lane = nextLane;
      state.lastLaneChangeTimeMs = state.elapsedMs;
    }
  }

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
   * Dynamic Side Environment Spawning (Z:2):
   * Spawns assets/env-tree.png and assets/env-grave.png at the vanishing point (X: 50%, Y: 45%).
   * As they travel downward, they move aggressively to the extreme LEFT or RIGHT screen edges
   * and scale up drastically in proportion (purely decorative, no player collision).
   */
  function spawnEnvironmentProp(initialZ = 0) {
    const side = state.lastEnvSide * -1;
    state.lastEnvSide = side;

    const isTree = Math.random() < 0.62;
    const asset = isTree ? ASSETS.envTree : ASSETS.envGrave;
    // Aggressive lateral trajectory pushing props to the extreme left/right forest edges
    const lateralTrajectory = side * (1.72 + Math.random() * 0.58);
    // Drastic proportional scale multiplier as props rush toward the camera edges
    const scaleMultiplier = isTree ? (1.85 + Math.random() * 0.45) : (1.15 + Math.random() * 0.25);

    const el = document.createElement('div');
    el.className = 'env-prop';

    const img = document.createElement('img');
    img.src = asset;
    img.alt = isTree ? 'Spooky Tree' : 'Tombstone';
    img.draggable = false;
    el.appendChild(img);

    const proj = projectPseudo3D(initialZ, lateralTrajectory);
    const renderScale = proj.scale * scaleMultiplier;
    const fadeOpacity = Math.min(1, initialZ / CONFIG.FADE_IN_COMPLETE_Z);

    el.style.opacity = String(fadeOpacity.toFixed(2));
    el.style.zIndex = String(Math.floor(initialZ * 100));
    el.style.transform =
      `translate3d(${proj.screenX}px, ${proj.screenY}px, 0) translate(-50%, -100%) scale(${renderScale.toFixed(4)})`;

    envLayerEl.appendChild(el);
    state.envProps.push({
      el,
      z: initialZ,
      lateralTrajectory,
      scaleMultiplier,
    });
  }

  /**
   * Updates all decorative side environment props (trees and graves).
   */
  function updateEnvironmentProps(dtSec, envSpeedZ) {
    if (envSpeedZ <= 0) return;

    for (let i = state.envProps.length - 1; i >= 0; i--) {
      const prop = state.envProps[i];
      prop.z += envSpeedZ * dtSec;

      if (prop.z >= CONFIG.DESPAWN_Z) {
        if (prop.el.parentNode) prop.el.parentNode.removeChild(prop.el);
        state.envProps.splice(i, 1);
        continue;
      }

      const proj = projectPseudo3D(prop.z, prop.lateralTrajectory);
      const renderScale = proj.scale * prop.scaleMultiplier;
      const fadeOpacity = Math.min(1, prop.z / CONFIG.FADE_IN_COMPLETE_Z);

      prop.el.style.opacity = String(fadeOpacity.toFixed(2));
      prop.el.style.zIndex = String(Math.floor(prop.z * 100));
      prop.el.style.transform =
        `translate3d(${proj.screenX}px, ${proj.screenY}px, 0) translate(-50%, -100%) scale(${renderScale.toFixed(4)})`;
    }
  }

  /**
   * Spawns a ground speed line (Z:3) at the vanishing point.
   */
  function spawnSpeedLine(initialZ = 0.01) {
    const el = document.createElement('div');
    el.className = 'speed-line';

    const trajectories = [-1.35, -1.05, -0.48, 0.48, 1.05, 1.35];
    const laneTrajectory = trajectories[Math.floor(Math.random() * trajectories.length)] +
      (Math.random() * 0.10 - 0.05);

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
   * Spawns a blinking red '!' warning (Z:8) at the vanishing point in the target lane 1s before a Bat spawns.
   */
  function scheduleBatWithWarning(lane) {
    const warnEl = document.createElement('div');
    warnEl.className = 'bat-warning-indicator';
    warnEl.textContent = '!';

    const warnX = metrics.vanishingX + (lane * metrics.laneSpread * 0.28);
    const warnY = metrics.horizonY - 6;
    warnEl.style.left = `${warnX}px`;
    warnEl.style.top = `${warnY}px`;

    warningsLayerEl.appendChild(warnEl);

    state.pendingBatWarnings.push({
      el: warnEl,
      lane,
      remainingMs: CONFIG.BAT_WARNING_DURATION_MS,
    });
  }

  /**
   * Creates an interactive entity (Pumpkin, Ghost, Bat, or Candy) at the vanishing point (Z:5).
   */
  function createEntityAtHorizon(type, lane) {
    const isFlying = type === 'ghost' || type === 'bat';
    const isCollectible = type === 'candy';
    const speedFactor = type === 'bat' ? CONFIG.BAT_SPEED_MULTIPLIER : 1.0;

    let asset = ASSETS.enemyPumpkin;
    if (type === 'candy') asset = ASSETS.candy;
    else if (type === 'ghost') asset = ASSETS.enemyGhost;
    else if (type === 'bat') asset = ASSETS.enemyBat;

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
      speedFactor,
      isFlying,
      isCollectible,
      resolved: false,
      nearMissChecked: false,
      removing: false,
      bobSeed: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Selects the next center-lane interactive entity or schedules a 1s Bat warning.
   */
  function spawnNextWaveItem() {
    const lanes = [-1, 0, 1];
    let lane = lanes[Math.floor(Math.random() * lanes.length)];

    if (lane === state.lastSpawnLane && Math.random() < 0.65) {
      const others = lanes.filter((l) => l !== lane);
      lane = others[Math.floor(Math.random() * others.length)];
    }
    state.lastSpawnLane = lane;

    // 36% Candy, 30% Pumpkin (ground), 18% Ghost (flying), 16% Bat (fast flying with 1s warning)
    const roll = Math.random();
    if (roll < 0.36) {
      createEntityAtHorizon('candy', lane);
    } else if (roll < 0.66) {
      createEntityAtHorizon('pumpkin', lane);
    } else if (roll < 0.84) {
      createEntityAtHorizon('ghost', lane);
    } else {
      scheduleBatWithWarning(lane);
    }
  }

  /**
   * Updates active 1-second Bat horizon warnings and spawns the Bat when timer hits 0.
   */
  function updateBatWarnings(dtMs) {
    for (let i = state.pendingBatWarnings.length - 1; i >= 0; i--) {
      const warn = state.pendingBatWarnings[i];
      warn.remainingMs -= dtMs;

      const warnX = metrics.vanishingX + (warn.lane * metrics.laneSpread * 0.28);
      const warnY = metrics.horizonY - 6;
      warn.el.style.left = `${warnX}px`;
      warn.el.style.top = `${warnY}px`;

      if (warn.remainingMs <= 0) {
        if (warn.el.parentNode) warn.el.parentNode.removeChild(warn.el);
        state.pendingBatWarnings.splice(i, 1);
        createEntityAtHorizon('bat', warn.lane);
      }
    }
  }

  /**
   * Collects candy: updates combo, spawns fading "+10" or "+20" floating text, plays collect sfx, NO vibration.
   */
  function collectCandy(entity, screenX, screenY, scale) {
    entity.resolved = true;
    entity.removing = true;

    state.candiesCollected += 1;
    state.consecutiveCandies += 1;
    if (state.consecutiveCandies > state.maxCombo) {
      state.maxCombo = state.consecutiveCandies;
    }

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
   * Awards +50 Near-Miss bonus and spawns floating "NEAR MISS!" text.
   */
  function triggerNearMissBonus() {
    state.targetScore += CONFIG.NEAR_MISS_POINTS;
    spawnFloatingTextAtRocky('NEAR MISS!', 'near-miss-pts');
  }

  /**
   * Handles taking damage from an enemy:
   * - Resets combo streak
   * - Plays sfx-hit.mp3
   * - Strong camera shake + navigator.vibrate(200) ONLY when hit
   * - Triggers 1s slow-motion death if final life is lost
   */
  function handlePlayerHit(entity) {
    entity.resolved = true;
    entity.nearMissChecked = true;

    if (state.player.invincibleRemainingMs > 0 || state.mode !== 'PLAYING') return;

    state.consecutiveCandies = 0;
    state.lives = Math.max(0, state.lives - 1);
    syncHudStatus();
    playSfx('hit');

    // Haptics strictly on enemy hit
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(200);
      } catch {
        // Ignore on unsupported devices
      }
    }

    // Strong camera shake animation
    viewportEl.classList.remove('camera-shake');
    void viewportEl.offsetWidth;
    viewportEl.classList.add('camera-shake');

    playerSpriteEl.classList.remove('flip-x');
    setPlayerSprite(ASSETS.rockyHit);

    if (state.lives <= 0) {
      state.mode = 'DYING';
      state.slowMoRemainingMs = CONFIG.SLOW_MO_DEATH_MS;
      state.player.hitSpriteRemainingMs = CONFIG.SLOW_MO_DEATH_MS + 200;
      return;
    }

    damageFlashEl.classList.remove('flash-active');
    void damageFlashEl.offsetWidth;
    damageFlashEl.classList.add('flash-active');

    state.player.hitSpriteRemainingMs = CONFIG.HIT_SPRITE_MS;
    state.player.invincibleRemainingMs = CONFIG.INVINCIBILITY_MS;
    playerContainerEl.classList.add('invincible');
  }

  /**
   * Spawns a tiny gray CSS oval at Rocky's feet (Z:15) when finishing a jump (scales up and fades out in 0.2s).
   */
  function spawnLandingDust(x, y) {
    const dustEl = document.createElement('div');
    dustEl.className = 'landing-dust';
    dustEl.style.setProperty('--dust-x', `${x}px`);
    dustEl.style.setProperty('--dust-y', `${y}px`);
    landingDustLayerEl.appendChild(dustEl);

    window.setTimeout(() => {
      if (dustEl.parentNode) dustEl.parentNode.removeChild(dustEl);
    }, 200);
  }

  /**
   * Updates Rocky's position, jump arc, landing dust, and 2-frame scaleX(-1) running animation.
   */
  function updatePlayer(dtMs) {
    const p = state.player;

    const lerpFactor = 1 - Math.pow(0.00015, dtMs / 1000);
    p.visualLane += (p.lane - p.visualLane) * lerpFactor;

    const playerX = metrics.vanishingX + (p.visualLane * metrics.laneSpread);

    if (p.isJumping) {
      p.jumpElapsedMs += dtMs;
      p.jumpProgress = Math.min(1, p.jumpElapsedMs / CONFIG.JUMP_DURATION_MS);
      p.jumpArc = Math.sin(p.jumpProgress * Math.PI);

      if (p.jumpProgress >= 1) {
        p.isJumping = false;
        p.jumpElapsedMs = 0;
        p.jumpProgress = 0;
        p.jumpArc = 0;
        spawnLandingDust(playerX, metrics.playerY);
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

    // Running animation (transform: scaleX(-1) trick) active in both MENU Attract Mode and PLAYING mode
    if (p.hitSpriteRemainingMs > 0 || state.mode === 'DYING') {
      setPlayerSprite(ASSETS.rockyHit);
      playerSpriteEl.classList.remove('flip-x');
    } else if (p.isJumping) {
      setPlayerSprite(ASSETS.rockyJump);
      playerSpriteEl.classList.remove('flip-x');
    } else {
      setPlayerSprite(ASSETS.rockyRun);
      if (state.mode === 'PLAYING' || state.mode === 'MENU') {
        const flipCadence = state.mode === 'MENU' ? CONFIG.RUN_FLIP_INTERVAL_MS * 1.35 : CONFIG.RUN_FLIP_INTERVAL_MS;
        state.runFlipTimerMs += dtMs;
        if (state.runFlipTimerMs >= flipCadence) {
          state.runFlipTimerMs %= flipCadence;
          state.runFlipped = !state.runFlipped;
          playerSpriteEl.classList.toggle('flip-x', state.runFlipped);
        }
      } else {
        playerSpriteEl.classList.remove('flip-x');
      }
    }

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
   * Updates ground speed lines (Z:3).
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
   * Updates center-lane interactive entities (Z:5), lane-matching hitboxes, and Near-Miss bonuses.
   */
  function updateEntities(dtSec, speedZ) {
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const entity = state.entities[i];

      if (entity.removing) {
        state.entities.splice(i, 1);
        continue;
      }

      entity.z += speedZ * entity.speedFactor * dtSec;

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

      const fadeInOpacity = Math.min(1, entity.z / CONFIG.FADE_IN_COMPLETE_Z);
      entity.el.style.opacity = String(fadeInOpacity.toFixed(2));
      entity.el.style.zIndex = String(Math.floor(entity.z * 100));
      entity.el.style.transform =
        `translate3d(${proj.screenX}px, ${renderY}px, 0) translate(-50%, -100%) scale(${proj.scale.toFixed(4)})`;

      if (state.mode !== 'PLAYING') continue;

      // Precise Lane + Depth Hitbox Evaluation
      if (
        !entity.resolved &&
        entity.z >= CONFIG.COLLISION_Z_MIN &&
        entity.z <= CONFIG.COLLISION_Z_MAX &&
        entity.lane === state.player.lane
      ) {
        if (entity.isCollectible) {
          collectCandy(entity, proj.screenX, renderY, proj.scale);
        } else if (entity.isFlying) {
          // Flying enemies (ghosts and bats) still hit even if Rocky is jumping
          handlePlayerHit(entity);
        } else {
          // Ground pumpkins are dodged when Rocky is airborne
          const dodgedByJump = state.player.isJumping && state.player.jumpArc > 0.22;
          if (!dodgedByJump) {
            handlePlayerHit(entity);
          } else {
            entity.resolved = true;
            entity.nearMissChecked = true;
            if (state.elapsedMs - state.player.jumpStartTimeMs <= CONFIG.NEAR_MISS_WINDOW_MS) {
              triggerNearMissBonus();
            }
          }
        }
      }

      // Near-Miss Check as hazard passes player depth
      if (
        !entity.isCollectible &&
        !entity.resolved &&
        !entity.nearMissChecked &&
        entity.z > CONFIG.COLLISION_Z_MAX
      ) {
        entity.nearMissChecked = true;
        const dodgedLastMoment =
          state.previousLane === entity.lane &&
          state.player.lane !== entity.lane &&
          state.elapsedMs - state.lastLaneChangeTimeMs <= CONFIG.NEAR_MISS_WINDOW_MS;

        const tightVisualMargin =
          Math.abs(state.player.visualLane - entity.lane) < 0.62 &&
          state.player.lane !== entity.lane;

        if (dodgedLastMoment || tightVisualMargin) {
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

    const rawDtMs = Math.min(50, Math.max(0, timestamp - state.lastFrameTime));
    state.lastFrameTime = timestamp;

    const timeScale = state.mode === 'DYING' ? CONFIG.SLOW_MO_TIME_SCALE : 1.0;
    const dtMs = rawDtMs * timeScale;
    const dtSec = dtMs / 1000;
    state.elapsedMs += dtMs;

    updateWeatherAndMenuLightning(rawDtMs);

    const { speedZ, envSpeedZ, particleSpeedZ, spawnIntervalMs } = getDifficultyParams();

    // Update and spawn decorative side environment props (Z:2)
    state.envSpawnTimerMs += dtMs;
    const envSpawnInterval = Math.max(160, 320 / Math.max(0.35, envSpeedZ / CONFIG.BASE_SPEED_Z));
    while (state.envSpawnTimerMs >= envSpawnInterval) {
      state.envSpawnTimerMs -= envSpawnInterval;
      spawnEnvironmentProp(0.01);
    }
    updateEnvironmentProps(dtSec, envSpeedZ);

    // Update and spawn ground speed lines (Z:3)
    state.speedLineTimerMs += dtMs;
    const speedLineInterval = Math.max(40, 95 / Math.max(0.25, particleSpeedZ / CONFIG.BASE_SPEED_Z));
    while (state.speedLineTimerMs >= speedLineInterval) {
      state.speedLineTimerMs -= speedLineInterval;
      spawnSpeedLine(0.01);
    }
    updateSpeedLines(dtSec, particleSpeedZ);

    if (state.mode === 'PLAYING' || state.mode === 'DYING') {
      if (state.mode === 'PLAYING' && state.cinematicProgress < 1) {
        state.cinematicProgress = Math.min(1, state.cinematicProgress + rawDtMs / CONFIG.CINEMATIC_ACCEL_MS);
      }

      // Auto-Scoring based on distance survived
      if (state.mode === 'PLAYING') {
        state.autoScoreTimerMs += rawDtMs;
        if (state.autoScoreTimerMs >= CONFIG.AUTO_SCORE_INTERVAL_MS) {
          const ticks = Math.floor(state.autoScoreTimerMs / CONFIG.AUTO_SCORE_INTERVAL_MS);
          state.autoScoreTimerMs %= CONFIG.AUTO_SCORE_INTERVAL_MS;
          state.targetScore += ticks;
        }

        state.spawnTimerMs += dtMs;
        if (state.spawnTimerMs >= spawnIntervalMs) {
          state.spawnTimerMs %= spawnIntervalMs;
          spawnNextWaveItem();
        }
        updateBatWarnings(dtMs);
      }

      updateEntities(dtSec, speedZ);
      updateRollingScore(rawDtMs);

      // 1-second slow-motion death completion -> Red Flash -> Game Over Stats Board
      if (state.mode === 'DYING') {
        state.slowMoRemainingMs -= rawDtMs;
        if (state.slowMoRemainingMs <= 0) {
          completeGameOverSequence();
          return;
        }
      }
    }

    updatePlayer(dtMs);
    window.requestAnimationFrame(tick);
  }

  /**
   * Resets world entities, warnings, and player state cleanly.
   */
  function resetWorldState(preserveBackgroundMotion = false) {
    updateViewportMetrics();
    entitiesLayerEl.innerHTML = '';
    warningsLayerEl.innerHTML = '';
    landingDustLayerEl.innerHTML = '';

    if (!preserveBackgroundMotion) {
      speedLinesLayerEl.innerHTML = '';
      envLayerEl.innerHTML = '';
      state.speedLines = [];
      state.envProps = [];
    }

    state.entities = [];
    state.pendingBatWarnings = [];
    state.targetScore = 0;
    state.displayScore = 0;
    state.lives = CONFIG.MAX_LIVES;
    state.candiesCollected = 0;
    state.consecutiveCandies = 0;
    state.maxCombo = 0;
    state.elapsedMs = 0;
    state.lastFrameTime = 0;
    state.cinematicProgress = 0;
    state.autoScoreTimerMs = 0;
    state.spawnTimerMs = 0;
    state.envSpawnTimerMs = 0;
    state.speedLineTimerMs = 0;
    state.runFlipTimerMs = 0;
    state.runFlipped = false;
    state.lightningTimerMs = 2200;
    state.slowMoRemainingMs = 0;
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
    lightningFlashEl.classList.remove('strike-active', 'subtle-strike');
    bgRoadEl.classList.remove('blood-moon');
    bloodMoonTintEl.classList.remove('active');
    viewportEl.classList.remove('camera-shake', 'is-paused');

    scoreValueEl.textContent = '00000';
    setPlayerSprite(ASSETS.rockyRun);
    syncHudStatus();
    updatePlayer(0);

    // Seed initial road speed lines if none exist yet
    if (state.speedLines.length === 0) {
      for (let i = 0; i < 8; i++) {
        spawnSpeedLine((i + 1) * 0.11);
      }
    }

    // Seed initial spooky forest side environment props if none exist yet
    if (state.envProps.length === 0) {
      for (let i = 0; i < 6; i++) {
        spawnEnvironmentProp((i + 1) * 0.16);
      }
    }
  }

  function enterMainMenu() {
    resetWorldState(true);
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
   * Cinematic Start: Main Menu fades out smoothly while Rocky continues running
   * and the spooky forest & road speed lines accelerate smoothly.
   */
  function triggerCinematicStart() {
    if (state.mode === 'PLAYING') return;
    resetWorldState(true);
    state.mode = 'PLAYING';
    state.cinematicProgress = 0;

    pauseOverlayEl.classList.add('hidden');
    gameOverOverlayEl.classList.add('hidden');
    hudEl.classList.remove('hud-hidden');

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

  /**
   * Completes the 1s slow-motion death sequence with a red damage flash and detailed Game Over stats board.
   */
  function completeGameOverSequence() {
    state.mode = 'GAMEOVER';
    playerContainerEl.classList.remove('invincible');
    warningsLayerEl.innerHTML = '';
    state.pendingBatWarnings = [];

    damageFlashEl.classList.remove('flash-active');
    void damageFlashEl.offsetWidth;
    damageFlashEl.classList.add('flash-active');

    saveHighScore(state.targetScore);

    scoreValueEl.textContent = String(state.targetScore).padStart(5, '0');
    finalScoreValueEl.textContent = String(state.targetScore);
    highScoreValueEl.textContent = String(state.highScore);
    candiesCollectedValueEl.textContent = String(state.candiesCollected);
    maxComboValueEl.textContent = String(state.maxCombo);

    gameOverOverlayEl.classList.remove('hidden');
  }

  function bindEvents() {
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

    pauseBtnEl.addEventListener('click', () => {
      playSfx('click');
      pauseGame();
    });

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

    gameoverRestartBtnEl.addEventListener('click', () => {
      playSfx('click');
      triggerCinematicStart();
    });

    gameoverHomeBtnEl.addEventListener('click', () => {
      playSfx('click');
      enterMainMenu();
    });

    // PC Keyboard Controls (WASD / Arrows / Space / Escape)
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

    // Mobile Swipe Controls (Left/Right to switch lanes, Up to jump)
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
