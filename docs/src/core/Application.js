// ── APPLICATION — engine core. Init, main loop, tick system, orchestration. ───
import Renderer from "./Renderer.js";
import Camera from "./Camera.js";
import World from "../world/World.js";
import EventEmitter from "../systems/EventEmitter.js";
import Resources from "../systems/Resources.js";
import GameState from "../systems/GameState.js";
import InputController from "../input/InputController.js";
import Audio from "../systems/Audio.js";
import { Tick } from "../utils/constants.js";

export default class Application {
  constructor(canvas) {
    this.canvas = canvas;
    this.events = new EventEmitter();
    this.clock = new THREE.Clock();
    this._animId = null;
    this._frame = 0;
    this.audio = new Audio(this.events);

    // ── DYNAMIC TICK SYSTEM ───────────────────────────────────────────────
    // Tracks actual achieved Hz and the target Hz we're smoothing toward
    this._tick = {
      targetHz: Tick.BASE_RATE, // where we want to be
      currentHz: Tick.BASE_RATE, // smoothed current rate
      accumulator: 0, // leftover time from last frame
      fixedDt: 1 / Tick.BASE_RATE,
      subSteps: 1, // physics sub-steps this frame
      _prevSpeed: 0,
    };

    // Init audio on first user gesture
    window.addEventListener("pointerdown", () => this.audio.init(), {
      once: true,
    });
    window.addEventListener("keydown", () => this.audio.init(), { once: true });

    window.addEventListener("resize", () => this._onResize());
  }

  start() {
    this.renderer = new Renderer(this.canvas);
    this.scene = this.renderer.scene;
    this.camera = new Camera(this.renderer);

    this.resources = new Resources(this.events);
    this.events.on("ready", () => this._onResourcesReady());
    this.resources.load([]);
  }

  _onResourcesReady() {
    this.input = new InputController();

    this.world = new World(this.scene, this.events);
    this.world.objects._initMatcaps();
    this.world.buildWorld();
    this.world.applyWeather("day");
    this._lastWeather = "day";

    this._wireEvents();
    this._exposePublicAPI();

    const playerMode = sessionStorage.getItem("vp") || "recruiter";
    window.CityUI?.init?.(playerMode);

    if (typeof window.onCityProgress === "function") {
      window.onCityProgress(100, "CITY LIVE — CLICK TO START");
    }

    this._tick_loop();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DYNAMIC TICK SYSTEM
  // Implements the 7-property spec:
  //   1. Basic tick rate (60 Hz base)
  //   2. Player density — we use speed as "player density" proxy
  //   3. Mid/early game phases
  //   4. Calculate required precision
  //   5. Smooth transitions
  //   6. Increase gradually
  //   7. Decrease gradually
  // ═══════════════════════════════════════════════════════════════════════════

  /** Determine the target simulation Hz for this frame based on game state */
  _calculateTargetHz() {
    const t = this._tick;
    const speed = this.world?.car.speed ?? 0;
    const speedRatio = speed / 0.95; // 0..1
    const isFocus = GameState.mode === "FOCUS";
    const isIdle = GameState.mode === "IDLE";

    // ── Phase 1 — IDLE (before game starts) ──────────────────────────────
    // No physics running, minimal tick needed
    if (isIdle) return Tick.MIN_RATE;

    // ── Phase 2 — FOCUS (camera on building) ─────────────────────────────
    // Car frozen, low tick rate fine
    if (isFocus) return 30;

    // ── Phase 3 — Calculate required precision ────────────────────────────
    // High speed + turning = more sub-steps needed for accurate collision
    const steerMag = Math.abs(this.world?.car.steerAngle ?? 0);
    const isTurning = steerMag > 0.01;
    const isHighSpeed = speedRatio > Tick.HIGH_SPEED_RATIO;
    const isLowSpeed = speedRatio < Tick.LOW_SPEED_RATIO;

    // Base precision requirement
    let target = Tick.BASE_RATE; // 60 Hz

    // Increase for fast + turning (most demanding case — collision accuracy)
    if (isHighSpeed && isTurning) {
      target = Math.min(Tick.MAX_RATE, Tick.BASE_RATE * 1.8); // up to 108 Hz
      t.subSteps = 2; // run physics twice per render frame
    }
    // Increase for high speed alone
    else if (isHighSpeed) {
      target = Math.min(Tick.MAX_RATE, Tick.BASE_RATE * 1.4); // ~84 Hz
      t.subSteps = 2;
    }
    // Decrease for near-stationary
    else if (isLowSpeed) {
      target = Math.max(Tick.MIN_RATE, Tick.BASE_RATE * 0.5); // 30 Hz
      t.subSteps = 1;
    }
    // Normal driving
    else {
      target = Tick.BASE_RATE; // 60 Hz
      t.subSteps = 1;
    }

    return target;
  }

  /** Smooth the tick rate toward target — gradual ramp up/down */
  _smoothTickRate(dt) {
    const t = this._tick;
    const target = t.targetHz;

    if (t.currentHz < target) {
      // ── Rule 6: increase gradually ────────────────────────────────────
      t.currentHz = Math.min(
        target,
        t.currentHz + Tick.RAMP_UP_RATE * target * dt,
      );
    } else if (t.currentHz > target) {
      // ── Rule 7: decrease gradually ────────────────────────────────────
      t.currentHz = Math.max(
        target,
        t.currentHz - Tick.RAMP_DOWN_RATE * target * dt,
      );
    }

    t.fixedDt = 1 / Math.max(1, t.currentHz);
  }

  // ── MAIN LOOP ─────────────────────────────────────────────────────────────
  _tick_loop() {
    this._animId = requestAnimationFrame(() => this._tick_loop());

    // ── TIMING ────────────────────────────────────────────────────────────
    const rawDt = Math.min(this.clock.getDelta(), Tick.MAX_DT);
    const now = this.clock.elapsedTime;
    this._frame = (this._frame + 1) % 120;
    const f = this._frame;

    const gameStarted = GameState.mode !== "IDLE";

    // ── STEP 1: PROCESS PLAYER INPUT ─────────────────────────────────────
    this.input.update();

    // ── DYNAMIC TICK RATE UPDATE ──────────────────────────────────────────
    if (gameStarted) {
      this._tick.targetHz = this._calculateTargetHz();
      this._smoothTickRate(rawDt);
    }

    // ── STEP 2: RUN PHYSICS SIMULATION ───────────────────────────────────
    const frozen = GameState.mode === "FOCUS";
    if (!frozen && gameStarted) {
      // Accumulator pattern: run fixed-dt physics steps, carry remainder
      this._tick.accumulator += rawDt;
      const fixedDt = this._tick.fixedDt;
      let physicsSteps = 0;

      while (this._tick.accumulator >= fixedDt && physicsSteps < 4) {
        this.world.car._physicsStep(
          this.input,
          fixedDt,
          this._tick.subSteps,
          this.world.objects.buildingBoxes,
        );
        this._tick.accumulator -= fixedDt;
        physicsSteps++;
      }

      // Interpolation alpha for rendering (smooth between physics steps)
      this._renderAlpha = this._tick.accumulator / fixedDt;
    } else if (gameStarted) {
      // Camera frozen — still update atmosphere
      this.world._updateAtmosphere(now, rawDt);
      this.world._updateLighting(now, rawDt);
    }

    // ── STEP 3: CHECK COLLISION AND INTERACTION ───────────────────────────
    // (Handled inside physicsStep — collision is part of integration)
    // Proximity check here (interaction detection, not collision)
    if (gameStarted) {
      this.world.objects.checkProximity(this.world.car.x, this.world.car.z);
    }

    // ── STEP 4: UPDATE GAME LOGIC ─────────────────────────────────────────
    GameState.proximityTempleId = this.world.objects._proximityId;

    if (gameStarted && !frozen) {
      this.world._updateAmbients(
        now,
        rawDt,
        this.world.car.x,
        this.world.car.z,
      );
    }

    // E key — enter nearest temple
    if (this.input.enter && gameStarted && GameState.mode === "ROAM") {
      if (!this._enterCooldown) {
        this._enterCooldown = true;
        this._enterNearestTemple();
        setTimeout(() => {
          this._enterCooldown = false;
        }, 800);
      }
    }

    // ── AUDIO UPDATE (every 3rd frame) ───────────────────────────────────
    if (gameStarted && f % 3 === 0) {
      this.audio.updateEngine(this.world.car.speed);
      this.audio.updateSpatialListener(
        this.world.car.x,
        this.world.car.z,
        this.world.car.sinA,
        this.world.car.cosA,
      );
    }

    // ── CAMERA UPDATE ─────────────────────────────────────────────────────
    this.camera.update(
      {
        x: this.world.car.x,
        z: this.world.car.z,
        sinA: this.world.car.sinA,
        cosA: this.world.car.cosA,
        vx: this.world.car.vx,
        vz: this.world.car.vz,
        speed: this.world.car.speed,
        suspY: this.world.car.suspY,
        steer: this.world.car.steerAngle,
      },
      rawDt,
      now,
    );

    // ── STEP 5: BROADCAST UPDATES TO PLAYER (UI) ──────────────────────────
    if (gameStarted && f % 4 === 0) {
      window.CityUI?.updateHUD?.(this.world.car.speed);
      window.CityUI?.updateMinimap?.(
        this.world.car.x,
        this.world.car.z,
        -this.world.car.angle,
      );
    }

    // ── RENDER ────────────────────────────────────────────────────────────
    this.renderer.render(this.camera);
  }

  // ── EVENT WIRING ──────────────────────────────────────────────────────────
  _wireEvents() {
    this.events.on("proximityChange", (building) => {
      GameState.proximityTempleId = building ? building.id : null;
      if (building) window.CityUI?.showNotification?.(building);
      else window.CityUI?.hideNotification?.();
    });
    this.events.on("weatherChange", ({ weather }) => {
      window.CityUI?.onWeatherChange?.(weather);
    });
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────
  _exposePublicAPI() {
    const self = this;

    window.CityEngine = {
      triggerIntro() {
        GameState.mode = "ROAM";
        self.camera.triggerIntro();
        self.audio.resume();
        self.audio.playCinematicSwell(5.0);

        // ── WOW MOMENT — the world wakes up as the camera descends ─────────
        // 1. Full white flash — "the city materialises"
        const bloom = document.getElementById("city-bloom");
        if (bloom) {
          bloom.style.transition = "background 0.08s ease";
          bloom.style.background = "rgba(255,248,220,0.92)";
          setTimeout(() => {
            bloom.style.transition = "background 1.8s ease";
            bloom.style.background = "rgba(0,0,0,0)";
          }, 120);
        }

        // 2. Origin light pulse — heart of city wakes after camera lands (5.8s)
        setTimeout(() => {
          self.world.pulseOriginAwake?.();
        }, 5800);

        // 3. Camera shake pulse at landing moment
        setTimeout(() => {
          self.camera.shakeAmt = 0.55;
        }, 5600);
      },
      initAudio() {
        self.audio.init();
      },
      resetCamera() {
        GameState.mode = "ROAM";
        GameState.focusedTempleId = null;
        self.camera.returnToFollow();
      },
      enterNearestBuilding() {
        self._enterNearestTemple();
      },
      cycleWeather() {
        const cycle = ["day", "night", "sunset", "fog", "rain", "snow"];
        const idx = cycle.indexOf(self._lastWeather || "day");
        self._lastWeather = cycle[(idx + 1) % cycle.length];
        self.world.applyWeather(self._lastWeather);
      },
      setMusicVolume(v) {
        self.audio.setMusicVolume(v);
      },
      skipGuide() {},
      closeWorldPanel() {},
      toggleYatraPath() {},
      checkCompletion() {},
      setAutoDriveTarget(x, z) {},
      _autoDrive(dx, dz) {},

      get narrativePhase() {
        return "FREE";
      },
      get isNight() {
        return self.world.isNight;
      },
      get currentWeather() {
        return self._lastWeather || "day";
      },
      get weatherGrip() {
        return self.world.car._weatherGrip;
      },
      get proximityBuilding() {
        return (
          window.CITY_DATA?.buildings.find(
            (b) => b.id === GameState.proximityTempleId,
          ) || null
        );
      },
      get carSpeed() {
        return self.world.car.speed;
      },
      get carX() {
        return self.world.car.x;
      },
      get carZ() {
        return self.world.car.z;
      },
      get carAngle() {
        return self.world.car.angle;
      },
      get camState() {
        return self.camera.state;
      },

      // Debug info for devtools
      get tickHz() {
        return Math.round(self._tick.currentHz);
      },
      get subSteps() {
        return self._tick.subSteps;
      },
    };
  }

  _enterNearestTemple() {
    const building = window.CITY_DATA?.buildings.find(
      (b) => b.id === GameState.proximityTempleId,
    );
    if (!building) return;
    GameState.mode = "FOCUS";
    GameState.focusedTempleId = building.id;

    // Bloom flash — building's colour floods the screen
    this._triggerBloom(building.glowColor);

    // Ground burst rings expand outward from temple base
    this.world.objects.spawnEntryBurst(building);

    // Camera shake — the "impact" of entering a sacred space
    this.camera.shakeAmt = 0.45;

    this.audio.playBuildingEnter(building.id);
    this.camera.focusOn(
      building,
      this.world.car.x,
      this.world.car.z,
      this.world.car.angle,
    );
    setTimeout(() => window.CityUI?.openBuilding?.(building), 1400);
  }

  _triggerBloom(glowColor) {
    const bloom = document.getElementById("city-bloom");
    if (!bloom) return;
    const hex = (glowColor || "#ffcc44").replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16),
      g = parseInt(hex.slice(2, 4), 16),
      b = parseInt(hex.slice(4, 6), 16);
    // Sharp flash in — slow fade out
    bloom.style.transition = "background 0.06s ease";
    bloom.style.background = `rgba(${r},${g},${b},0.55)`;
    setTimeout(() => {
      bloom.style.transition = "background 0.9s ease";
      bloom.style.background = "rgba(0,0,0,0)";
    }, 80);
    this.camera.shakeAmt = 0.3;
  }

  _onResize() {
    this.renderer.resize();
    this.camera.onResize(window.innerWidth, window.innerHeight);
  }

  destroy() {
    if (this._animId) cancelAnimationFrame(this._animId);
  }
}
