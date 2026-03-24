// ── CITY ENGINE v6 — CINEMATIC GAME EXPERIENCE ────────────────────────────────
// Full CameraDirector state machine, BuildingEntity system, VFX identity layer,
// Energy streams, divine beams, panel emergence, interaction feedback

window.CityEngine = (function () {
  // ── STATE ────────────────────────────────────────────────────────────────
  let scene, camera, renderer, clock;
  let animId;

  // ── PERFORMANCE FLAG ──────────────────────────────────────────────────────
  const IS_MOBILE =
    /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

  // ── PLAYER PRESENCE ───────────────────────────────────────────────────────
  let playerGroundRing = null; // ground indicator under car
  let playerShadowDisc = null; // soft shadow under car
  let motionTrail = []; // speed trail particles
  let speedLinesGroup = null; // screen-edge speed lines
  let prevCarAngle = 0;
  let steerFeedback = 0; // updated each frame from lateral velocity

  // ── NARRATIVE DIRECTOR ────────────────────────────────────────────────────
  const NARRATIVE = {
    phase: "DORMANT", // DORMANT | GUIDED | FREE
    step: 0,
    timer: 0,
    yatraPath: null, // CatmullRomCurve3 pilgrimage path mesh
    yatraVisible: false,
    guideArrow: null, // floating arrow pointing to first temple
    guideLabel: null, // "DRIVE TO SURYA DWARA" sprite
    firstVisitDone: false,
  };

  // ── SPATIAL AUDIO (per-building positional sound) ─────────────────────────
  let spatialAudio = {}; // buildingId → { osc, gain, filter, panner }
  let ambientLayers = {}; // wind | bells | drone
  let cinematicAudio = {}; // intro | transition | focus
  let lastHoverBuildingId = null;
  let activeSoundCount = 0;
  const MAX_SOUNDS = IS_MOBILE ? 4 : 8;

  // ── CINEMATIC MOMENTS ─────────────────────────────────────────────────────
  let bloomOverlay = null; // CSS element for bloom flash
  let cinematicActive = false;

  // ── CAMERA DIRECTOR — state machine ──────────────────────────────────────
  const CAM = {
    state: "STATIC", // STATIC until user clicks — camera holds at loading position
    introT: 0,
    introDone: false,
    transT: 0,
    transDur: 1.4,
    fromPos: new THREE.Vector3(),
    fromLook: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toLook: new THREE.Vector3(),
    focusBuilding: null,
    breathT: 0,
    shakeAmt: 0,
    locked: false,
    _flashed: false,
  };

  // ── BUILDING ENTITY SYSTEM ────────────────────────────────────────────────
  let buildingEntities = [];
  let selectedEntity = null;

  // ── VFX POOLS ─────────────────────────────────────────────────────────────
  let energyStreams = []; // animated data-flow lines between buildings
  let divineBeams = []; // night spotlights from gopuram tops
  let burstPool = []; // reusable energy burst spheres
  let buildingVfx = {}; // per-building-id VFX mesh groups
  let pranaParticles = null; // central-island aura particles

  // ── P1 (legacy) — kept for compatibility ─────────────────────────────────
  let cameraFlyTarget = null;
  let cameraFlyPhase = 0;

  // ── OTHER STATE ───────────────────────────────────────────────────────────
  let districtAudio = {};
  let diyaFlames = [];
  let diyaLights = [];
  let birdGroup = null;
  let fullMapOpen = false;
  let starField = null;
  let archGlows = [];
  let infoBoardSprites = [];

  // Car
  let carGroup, carBodyMesh;
  let wheelGroups = [];
  let carX = 13,
    carZ = -14; // Spawn east of center — island 86° off-axis, 0 prox triggers
  let gameStarted = false; // blocks all HUD/proximity/narrative before user clicks
  let carAngle = Math.PI; // Face NORTH (-Z): all hero temples ahead
  let carSpeed = 0; // kept for compatibility (= |velocity|)
  // ── TRUE VELOCITY VECTOR ─────────────────────────────────────────────────
  let carVx = 0,
    carVz = 0; // world-space velocity m/frame
  // ── STEERING ─────────────────────────────────────────────────────────────
  let steerAngle = 0; // wheel deflection (radians)
  let carSinA = 0,
    carCosA = -1; // cached trig, updated each frame
  // ── VISUAL DERIVED (not physics) ─────────────────────────────────────────
  let carBodyRoll = 0; // visual body lean
  let suspensionY = 0; // visual ride height
  let suspensionVY = 0; // spring velocity for suspension
  // ── CAMERA SPRING STATE ───────────────────────────────────────────────────
  let camVx = 0,
    camVy = 0,
    camVz = 0; // spring velocity for camera follow
  let carKeys = {}; // local alias for readability
  let keys = {},
    crashCooldown = 0,
    prevSpeed = 0;

  // Lights
  let sunLight, fillLight, ambLight, hemiLight;
  let carHL, carHR, carTL, carTR;
  let waveLines = [];

  // ── LIVING WORLD STATE ────────────────────────────────────────────────────
  let roadEnergyParticles = null; // energy flow along roads
  let divineParticles = null; // floating dust/divine motes
  let groundShimmers = []; // shimmer discs near temples
  let windTime = 0; // global wind phase
  let lightBreathT = 0; // slow world breathing light cycle
  let templeEmissives = []; // { mat, building } — glow-edge materials
  let waveFlowOffset = 0; // road energy wave position
  let isNight = false; // ← DAY is default, like Bruno Simon

  // Weather
  let currentWeather = "night"; // 'day' | 'night' | 'rain' | 'fog' | 'sunset' | 'snow'
  let weatherParticles = null;
  let weatherParticlePositions = null;
  const weatherCycle = ["night", "day", "sunset", "fog", "rain", "snow"];

  // Buildings / checkpoints
  let buildingBoxes = [];
  let buildingMeshes = [];
  let checkpointGroups = [];
  let proximityBuilding = null;
  let windowMaterials = [];
  let confettiPieces = [];

  // Audio
  let audioCtx = null,
    audioStarted = false;
  let engOsc,
    engGain,
    musicGain,
    musicStarted = false;

  // ── TRUE PHYSICS CONSTANTS ────────────────────────────────────────────────
  // Car is treated as a rigid body with velocity vector (vx, vz)
  // All forces applied per-frame as impulses
  const ENGINE_FORCE = 0.014; // punchy — strong acceleration feel
  const BRAKE_FORCE = 0.028; // hard, immediate braking
  const LONG_FRICTION = 0.009; // light rolling resistance
  const LAT_FRICTION = 0.78; // good grip
  const STEER_RATE = 0.28; // immediate input response
  const STEER_RELEASE = 0.2; // fast return
  const MAX_STEER_ANGLE = 0.055; // wider steering
  const MAX_SPD = 0.95; // higher cap for speed feel
  const REV_MAX_RATIO = 0.4; // reverse max = 40% of forward
  // Camera spring-damper constants
  const CAM_SPRING_K = 14.0; // snappy follow
  const CAM_SPRING_D = 9.5; // well damped
  const CAM_Y_SPRING_K = 6.5; // Y spring
  const CAM_Y_SPRING_D = 5.5;
  const PROX = 32; // slightly wider for earlier visual response // large world — show notification from further away
  const CAR_HW = 0.85;
  const CAR_HD = 1.3;
  let weatherGrip = 1.0; // 1.0 = dry, 0.3 = rain, 0.12 = snow

  // ── PALETTE — Hindu Temple City (Firefly reference) ────────────────────
  const P = {
    // Ground: deep warm terracotta-red like Indian temple stone plaza
    ground: 0xc86a44, // deep terracotta
    groundAlt: 0xb85c38,
    road: 0xaa5533, // dark brick-red road
    sidewalk: 0xd47a55, // warm sandstone plaza
    roadLine: 0xffe066, // golden dashes

    // Buildings palette (not used in temple renderer but kept for compat)
    b1: 0xf0d0a0,
    b2: 0xf5d8b0,
    b3: 0xffe8c8,
    b4: 0xe8c898,
    b5: 0xf0d8a8,
    b6: 0xe0c090,
    b7: 0xf8e0b8,
    b8: 0xecd0a0,

    roofDark: 0xcc8844,
    roofRed: 0xdd9933,
    roofGrey: 0xaa8855,

    // Trees: deep Indian greens with some tropical colors
    treeTrunk: 0x6a4422,
    treeLeaf1: 0x336633, // deep forest green
    treeLeaf2: 0x447744, // medium green
    treeLeaf3: 0x558844, // brighter green
    treeLeaf4: 0x66aa33, // lawn green
    treeLeaf5: 0x228833, // dark tropical green
    treeSpike: 0x224422, // dark pine

    // Grass patches — deep rich greens (like the manicured gardens in video)
    grass1: 0x3a7733,
    grass2: 0x4a8833,
    grass3: 0x336622,

    lampPole: 0xcc9944,
    lampHead: 0xffeeaa,

    carBody: 0xdd2200,
    carDark: 0x881200,
    carBlack: 0x181210,
    carGlass: 0x5588bb,
    carChrome: 0xbbbbaa,
    carTyre: 0x141210,
    carHub: 0xcc2000,

    water: 0x3399cc, // clear blue water channels like the video
  };

  // ── MATCAP SYSTEM ─────────────────────────────────────────────────────────
  // Pre-baked sphere textures — no real-time lighting calc on matcap objects
  let matcaps = {}; // warm | cool | stone | car | gold | dark | tree

  // ── ZONE + LABEL SYSTEM ───────────────────────────────────────────────────
  let blobShadows = []; // { mesh, building } — fake ground shadows
  let worldLabels = []; // THREE.Sprite billboard array
  let zoneAmbients = []; // per-zone colored point lights

  // ─────────────────────────────────────────────────────────────────────────
  // BUILDING ENTITY — state machine per building
  // States: DORMANT → AMBIENT → HOVER → ACTIVE → SELECTED
  // ─────────────────────────────────────────────────────────────────────────
  class BuildingEntity {
    constructor(building, meshGroup, bodyMat) {
      this.b = building;
      this.group = meshGroup;
      this.mat = bodyMat;
      this.state = "DORMANT";
      this.vfxI = 0; // VFX intensity 0→1
      this.rippleT = 0;
      this.forceDim = false;
      this.gc = parseInt((building.glowColor || "#00ddff").slice(1), 16);
      this.ripple = this._mkRipple();
      this.selRing = this._mkSelRing();
    }

    _mkRipple() {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.7, 20),
        new THREE.MeshBasicMaterial({
          color: this.gc,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.18;
      this.group.add(m);
      return m;
    }

    _mkSelRing() {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry((this.b.size?.[0] || 8) * 0.65, 0.18, 4, 28),
        new THREE.MeshBasicMaterial({
          color: 0xffcc44,
          transparent: true,
          opacity: 0,
        }),
      );
      r.position.y = (this.b.height || 10) * 0.28;
      r.userData.isSelRing = true;
      this.group.add(r);
      return r;
    }

    update(t, dt, dist) {
      // ── State transition ────────────────────────────────────────────────
      if (dist > 65) this.state = "DORMANT";
      else if (dist > 32) this.state = "AMBIENT";
      else if (dist > 16) this.state = "HOVER";
      else if (this !== selectedEntity) this.state = "ACTIVE";

      // ── Target VFX intensity ────────────────────────────────────────────
      const tgt = this.forceDim
        ? 0.12
        : { DORMANT: 0, AMBIENT: 0.3, HOVER: 0.68, ACTIVE: 1.0, SELECTED: 1.0 }[
            this.state
          ] || 0;
      this.vfxI += (tgt - this.vfxI) * 0.09;

      // ── Scale pulse ──────────────────────────────────────────────────────
      const amps = {
        DORMANT: 0,
        AMBIENT: 0.003,
        HOVER: 0.01,
        ACTIVE: 0.016,
        SELECTED: 0.012,
      };
      const freqs = {
        DORMANT: 0.3,
        AMBIENT: 0.3,
        HOVER: 0.65,
        ACTIVE: 1.1,
        SELECTED: 0.85,
      };
      const pulse =
        1 +
        Math.sin(t * (freqs[this.state] || 0.3) * Math.PI * 2) *
          (amps[this.state] || 0);

      // ── PROXIMITY PRESENCE — buildings grow and assert as you approach ───
      // XZ scale stays flat (1.0) to avoid footprint overlap.
      // Y scale rises: building "rises to meet you" as you get close.
      // Feels like a destination, not a static decoration.
      const presenceTargetY = this.forceDim ? 0.96 : 1.0 + this.vfxI * 0.065; // up to +6.5% taller at full intensity
      if (!this._presenceY) this._presenceY = 1.0;
      this._presenceY += (presenceTargetY - this._presenceY) * 0.04;

      this.group.scale.set(pulse, pulse * this._presenceY, pulse);

      // ── AMBIENT FLOAT — hero/active buildings subtly float vertically ────
      // Gives the world a living, non-static feel without heavy animation
      if (this.vfxI > 0.05) {
        const floatAmp = this.vfxI * 0.08; // max 8 units at full intensity
        const floatFreq = 0.28 + this.b.pos[0] * 0.007; // each building different phase
        const floatY =
          Math.sin(t * floatFreq * Math.PI * 2 + this.b.pos[1] * 0.1) *
          floatAmp;
        // Only float active/hover buildings — dormant ones stay planted
        if (this.state !== "DORMANT") {
          this.group.position.y = floatY;
        } else {
          this.group.position.y += (0 - this.group.position.y) * 0.05;
        }
      }

      // ── Ripple ring (ACTIVE / SELECTED) ─────────────────────────────────
      if (this.state === "ACTIVE" || this.state === "SELECTED") {
        this.rippleT = (this.rippleT + dt * 0.38) % 3.0;
        const rt = (this.rippleT % 3.0) / 3.0;
        this.ripple.scale.setScalar(1 + rt * 5.5);
        this.ripple.material.opacity = (1 - rt) * 0.55 * this.vfxI;
      } else {
        this.ripple.material.opacity = 0;
      }

      // ── Selection ring ───────────────────────────────────────────────────
      if (this.state === "SELECTED") {
        this.selRing.material.opacity = 0.65 + Math.sin(t * 2.2) * 0.18;
        this.selRing.rotation.z = t * 1.3;
      } else {
        this.selRing.material.opacity +=
          (0 - this.selRing.material.opacity) * 0.1;
      }
    }

    select() {
      this.state = "SELECTED";
      // All other buildings dim
      buildingEntities.forEach((e) => {
        if (e !== this) e.forceDim = true;
      });
      // Energy burst from building
      spawnEnergyBurst(
        this.b.pos[0],
        this.b.height * 0.6,
        this.b.pos[1],
        this.gc,
      );
    }

    deselect() {
      this.state = "HOVER";
      buildingEntities.forEach((e) => {
        e.forceDim = false;
      });
    }
  }

  // ── CAMERA DIRECTOR ───────────────────────────────────────────────────────
  function updateCameraDirector(t, dt) {
    // carSinA/carCosA are updated by updateCar each frame
    const sinA = carSinA,
      cosA = carCosA;

    // ── STATIC — pre-click loading state. Camera holds at nice overview angle ──
    if (CAM.state === "STATIC") {
      if (camera.fov !== 58) {
        camera.fov = 58;
        camera.updateProjectionMatrix();
      }
      const panAngle = t * 0.05;
      camera.position.set(Math.sin(panAngle) * 65, 40, Math.cos(panAngle) * 65); // closer = more epic
      camera.lookAt(0, 3, 0); // wider orbit for mythology layout
      return;
    }

    if (CAM.state === "INTRO") {
      CAM.introT = Math.min(1, CAM.introT + dt / 5.8); // slightly faster descent
      const e =
        CAM.introT < 0.5
          ? 4 * CAM.introT * CAM.introT * CAM.introT
          : 1 - Math.pow(-2 * CAM.introT + 2, 3) / 2;

      const startPos = new THREE.Vector3(8, 320, 80); // sync with triggerIntro position
      const endPos = new THREE.Vector3(
        carX - carSinA * 14,
        12,
        carZ - carCosA * 14,
      );
      const startLook = new THREE.Vector3(0, 0, 0);
      const endLook = new THREE.Vector3(
        carX + carSinA * 6,
        1.5,
        carZ + carCosA * 6,
      );

      camera.position.lerpVectors(startPos, endPos, e);
      const lk = new THREE.Vector3().lerpVectors(startLook, endLook, e);
      camera.lookAt(lk);

      // City-reveal flash at 38% descent
      if (CAM.introT > 0.38 && CAM.introT < 0.42 && !CAM._flashed) {
        CAM._flashed = true;
        triggerCityRevealCinematic();
        zoneAmbients.forEach((l) => {
          const ni = l.userData.nightI || 0.35;
          l.intensity = ni * 4;
        });
        setTimeout(
          () =>
            zoneAmbients.forEach((l) => {
              l.intensity = isNight
                ? (l.userData.nightI || 0.35) * 3.2
                : (l.userData.nightI || 0.35) * 0.2;
            }),
          500,
        );
      }

      if (CAM.introT >= 1) {
        CAM.state = "FOLLOW";
        CAM.introDone = true;
        // Seed camera spring at exactly where INTRO left it — prevents initial jump
        camVx = 0;
        camVy = 0;
        camVz = 0;
        // Start guided narrative 1.5s after landing
        setTimeout(() => startNarrativeGuide(), 1500);
      }
      return; // skip other camera logic during intro
    }

    if (CAM.state === "FOCUS_TRANSITION") {
      if (camera.fov > 59) {
        camera.fov += (58 - camera.fov) * 0.08;
        camera.updateProjectionMatrix();
      }
      CAM.transT += dt / CAM.transDur;
      const t2 = Math.min(1, CAM.transT);
      const e = t2 < 0.5 ? 2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 2) / 2;
      camera.position.lerpVectors(CAM.fromPos, CAM.toPos, e);
      const lk = new THREE.Vector3().lerpVectors(CAM.fromLook, CAM.toLook, e);
      camera.lookAt(lk);
      if (t2 >= 1) {
        CAM.state = "FOCUS";
        setTimeout(() => {
          const b = CAM.focusBuilding;
          if (b) {
            // P1: Rise world panel first, then DOM panel 800ms later
            buildWorldPanel(b);
            setTimeout(() => {
              window.CityUI?.openBuilding(b);
              spawnConfetti(
                carX,
                carZ,
                parseInt((b.glowColor || "#ffcc44").slice(1), 16),
              );
              setTimeout(() => checkCompletion(), 300);
            }, 800);
          }
        }, 600);
      }
      return;
    }

    if (CAM.state === "FOCUS" || CAM.locked) {
      const focusBaseY = CAM.toPos.y || 10;
      camera.position.y = focusBaseY + Math.sin(t * 0.4 * Math.PI * 2) * 0.06;
      return;
    }

    if (CAM.state === "RETURN_TRANSITION") {
      CAM.transT += dt / 1.0;
      const e = Math.min(1, CAM.transT);
      const ease = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      const followPos = new THREE.Vector3(
        carX - carSinA * 22,
        14 + (Math.hypot(carVx, carVz) / MAX_SPD) * 7,
        carZ - carCosA * 22,
      );
      camera.position.lerpVectors(CAM.fromPos, followPos, ease);
      const lk = new THREE.Vector3().lerpVectors(
        CAM.fromLook,
        new THREE.Vector3(carX + carSinA * 4, 1.5, carZ + carCosA * 4),
        ease,
      );
      camera.lookAt(lk);
      if (e >= 1) CAM.state = "FOLLOW";
      return;
    }

    // ── FOLLOW — spring-damper camera physics ────────────────────────────────
    // Uses Hooke's Law: F = -k*displacement - c*velocity
    // This gives natural oscillation, overshoot, and weight to the camera
    const velMag = Math.hypot(carVx, carVz);
    const speedRatio = velMag / MAX_SPD;

    // ── TARGET POSITION (where camera WANTS to be) ────────────────────────
    // Pull-back scales with speed: more speed = camera farther back = wider world
    // Dynamic height: camera rises at speed for racing perspective
    const camDist = 8 + speedRatio * 30; // 8 REST (close) → 38 at max
    const camH = 4 + speedRatio * 11; // 4 low/ground → 15 at max

    // Offset behind car using current facing — not steering angle
    const tgtX = carX - carSinA * camDist;
    const tgtZ = carZ - carCosA * camDist;
    const tgtY = camH + suspensionY * 0.4; // camera feels road bumps (40% coupling)

    // ── SPRING PHYSICS XZ ─────────────────────────────────────────────────
    // Spring stiffness: how urgently camera chases the car
    // Damping: how quickly oscillation dies — underdamped = floaty, overdamped = rigid
    // We want slight underdamping on acceleration for "weight" feel
    const accelMag = Math.abs(velMag - Math.abs(prevSpeed));
    const kXZ = CAM_SPRING_K * (1.0 + speedRatio * 0.9) + accelMag * 50;
    const dXZ = CAM_SPRING_D;

    const forceX = (tgtX - camera.position.x) * kXZ - camVx * dXZ;
    const forceZ = (tgtZ - camera.position.z) * kXZ - camVz * dXZ;
    camVx += forceX * dt;
    camVz += forceZ * dt;
    camVx = Math.max(-4, Math.min(4, camVx)); // clamp — prevent runaway spring
    camVz = Math.max(-4, Math.min(4, camVz));
    camera.position.x += camVx * dt;
    camera.position.z += camVz * dt;

    // ── SPRING PHYSICS Y ─────────────────────────────────────────────────
    // Y is bouncier — road bumps propagate to camera with a lag and bounce
    const forceY =
      (tgtY - camera.position.y) * CAM_Y_SPRING_K - camVy * CAM_Y_SPRING_D;
    camVy += forceY * dt;
    camVy = Math.max(-2.5, Math.min(2.5, camVy)); // clamp spring velocity — no wild oscillation
    camera.position.y += camVy * dt;
    // Hard clamp — camera stays within sensible range
    if (camera.position.y < 3.5) {
      camera.position.y = 3.5;
      camVy = Math.abs(camVy) * 0.1;
    }
    if (camera.position.y > 35) {
      camera.position.y = 35;
      camVy = 0;
    } // upper limit

    // ── IDLE BREATH (only at low speed) ──────────────────────────────────
    const breathAmt = Math.max(0, 1 - speedRatio * 2.5) * 0.22;
    camera.position.y += Math.sin(t * 0.72) * breathAmt;

    // ── FOV SPRING ────────────────────────────────────────────────────────
    // FOV widens smoothly — wider at speed feels faster without needing speed numbers
    const targetFOV = 48 + speedRatio * 42; // 48° still → 90° at max
    camera.fov += (targetFOV - camera.fov) * Math.min(1, dt * 7);
    camera.updateProjectionMatrix();

    // ── LOOK-AHEAD ────────────────────────────────────────────────────────
    // At speed: look far ahead — world opens up, motion feels more dynamic
    // At rest: look just ahead of car
    const lookAhead = 3 + speedRatio * 22; // 3 rest → 25 at max
    // Smooth look target with spring (avoids snapping on sharp turns)
    const lkX = carX + carSinA * lookAhead;
    const lkZ = carZ + carCosA * lookAhead;
    camera.lookAt(lkX, 1.2 + speedRatio * 0.6, lkZ);

    // ── TILT INTO TURNS ───────────────────────────────────────────────────
    // Derive lateral G from lateral velocity — camera tilts like a driver's head
    const latVelForTilt = carVx * carCosA - carVz * carSinA;
    const tiltAmt = latVelForTilt * -0.45 * (0.8 + speedRatio * 1.2);
    camera.rotateZ(tiltAmt * dt * 3.5); // apply fractionally each frame

    // ── SPEED SHAKE (road vibration) ──────────────────────────────────────
    if (speedRatio > 0.3 && carSpeed > 0.02) {
      const mag = (speedRatio - 0.3) * 0.1;
      camera.position.x += (Math.random() - 0.5) * mag;
      camera.position.y += (Math.random() - 0.5) * mag * 0.35;
    }

    // ── MICRO-NOISE — subtle camera imperfection at medium speed ──────────
    // Camera feels physically mounted, not mathematically locked
    if (speedRatio > 0.08) {
      const microMag = speedRatio * 0.018;
      const microT = t * 23.7; // fast noise frequency
      camera.position.x +=
        (Math.sin(microT * 1.3) * 0.5 + Math.sin(microT * 2.9) * 0.5) *
        microMag;
      camera.position.y +=
        (Math.sin(microT * 1.7) * 0.5 + Math.sin(microT * 3.1) * 0.5) *
        microMag *
        0.4;
      camera.position.z +=
        (Math.sin(microT * 2.1) * 0.5 + Math.sin(microT * 1.4) * 0.5) *
        microMag;
    }

    // ── ACCELERATION KICK — FOV pulse on hard throttle burst ──────────────
    const speedDelta = velMag - (CAM._prevVelMag || 0);
    CAM._prevVelMag = velMag;
    if (speedDelta > 0.012) {
      // Sudden acceleration: brief FOV surge (feels like G-force push)
      camera.fov += speedDelta * 28;
      camera.updateProjectionMatrix();
    }

    // ── BRAKE PULL — camera pulls forward slightly during hard braking ─────
    if (speedDelta < -0.016 && velMag > 0.05) {
      // Hard braking: camera lurches forward (inertia)
      const brakeShift = Math.abs(speedDelta) * 3.5;
      camera.position.x += carSinA * brakeShift;
      camera.position.z += carCosA * brakeShift;
    }

    // ── CRASH SHAKE DECAY ─────────────────────────────────────────────────
    if (CAM.shakeAmt > 0) {
      camera.position.x += (Math.random() - 0.5) * CAM.shakeAmt;
      camera.position.y += (Math.random() - 0.5) * CAM.shakeAmt * 0.4;
      CAM.shakeAmt = Math.max(0, CAM.shakeAmt - dt * 4.5);
    }
  }

  function focusCameraOnBuilding(b) {
    CAM.focusBuilding = b;
    CAM.fromPos.copy(camera.position);
    CAM.fromLook.set(
      carX + Math.sin(carAngle) * 4,
      1.5,
      carZ + Math.cos(carAngle) * 4,
    );

    // Camera angle: approach from where the player is, not from the building center
    const ang = Math.atan2(b.pos[0] - carX, b.pos[1] - carZ);

    // BUG FIX: was 13 units — too close, camera ended up inside info board sprites
    // Now 22 units back, higher angle, looks at upper 70% of building
    // This keeps the full gopuram silhouette in frame and avoids sprite plane
    CAM.toPos.set(
      b.pos[0] - Math.sin(ang) * 22,
      12 + (b.height || 12) * 0.22,
      b.pos[1] - Math.cos(ang) * 22,
    );
    // Look at 70% height — shows full architecture, no sprite overlap
    CAM.toLook.set(b.pos[0], (b.height || 12) * 0.7, b.pos[1]);

    CAM.transT = 0;
    CAM.transDur = 1.4;
    CAM.state = "FOCUS_TRANSITION";
    CAM.locked = false;
  }

  function returnCamera() {
    CAM.fromPos.copy(camera.position);
    CAM.fromLook.copy(CAM.toLook);
    CAM.transT = 0;
    CAM.state = "RETURN_TRANSITION";
    CAM.locked = false;
    closeWorldPanel(); // P1: collapse world panel on camera return
  }

  // ── ENERGY BURST — selection acknowledgement flash ────────────────────────
  function spawnEnergyBurst(wx, wy, wz, color) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      wireframe: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat);
    mesh.position.set(wx, wy, wz);
    mesh.userData.burstT = 0;
    mesh.userData.burstDur = 0.85;
    scene.add(mesh);
    burstPool.push(mesh);
  }

  // ── VFX: ENERGY STREAMS between connected buildings ───────────────────────
  function buildEnergyStreams() {
    if (IS_MOBILE) return; // skip on mobile
    const byId = {};
    window.CITY_DATA.buildings.forEach((b) => {
      byId[b.id] = b;
    });

    window.CITY_DATA.buildings.forEach((b) => {
      if (!b.connects) return;
      b.connects.forEach((conn) => {
        // match "to" name to a building id
        const target = window.CITY_DATA.buildings.find(
          (t) =>
            conn.to &&
            conn.to
              .toLowerCase()
              .includes(t.name.toLowerCase().split(" ")[0].toLowerCase()),
        );
        if (!target || target.id === b.id) return;

        const src = new THREE.Vector3(b.pos[0], 2.5, b.pos[1]);
        const dst = new THREE.Vector3(target.pos[0], 2.5, target.pos[1]);
        const mid = src.clone().lerp(dst, 0.5);
        mid.y = 7 + Math.random() * 5;

        const curve = new THREE.QuadraticBezierCurve3(src, mid, dst);
        const pts = curve.getPoints(50);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
          color: parseInt((b.glowColor || "#00ddff").slice(1), 16),
          transparent: true,
          opacity: 0,
        });
        const line = new THREE.Line(geo, mat);
        line.userData.isEnergyStream = true;
        line.userData.srcId = b.id;
        line.userData.dstId = target.id;
        line.userData.animOff = Math.random() * 50;
        // Cache positions at build time — avoids O(12) find() every frame
        line.userData.srcPos = [b.pos[0], b.pos[1]];
        line.userData.dstPos = [target.pos[0], target.pos[1]];
        scene.add(line);
        energyStreams.push(line);
      });
    });
  }

  // ── VFX: PER-BUILDING IDENTITY ────────────────────────────────────────────
  function addBuildingVfxIdentity(b, group) {
    const gc = parseInt((b.glowColor || "#00ddff").slice(1), 16);
    const h = b.height || 12;
    const vfx = new THREE.Group();
    group.add(vfx);
    buildingVfx[b.id] = vfx;

    if (b.id === "surya-dwara") {
      // ── SOLAR RAY CROWN ─────────────────────────────────────────────────
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const ray = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.06, 3.2 + Math.random()),
          new THREE.MeshBasicMaterial({
            color: 0xffee44,
            transparent: true,
            opacity: 0,
          }),
        );
        ray.position.set(Math.cos(ang) * 1.5, h + 2.8, Math.sin(ang) * 1.5);
        ray.rotation.y = ang;
        ray.rotation.z = Math.PI / 2;
        ray.userData.isSolarRay = true;
        ray.userData.phase = i * 0.42;
        vfx.add(ray);
      }
      // Add rotating crown group marker
      vfx.userData.isSolarCrown = true;
    }

    if (b.id === "vishwakarma-shala") {
      // ── FORGE SPARKS ────────────────────────────────────────────────────
      const N = IS_MOBILE ? 20 : 45;
      const pos = new Float32Array(N * 3),
        vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = Math.random() - 0.5;
        pos[i * 3 + 1] = h + 1 + Math.random() * 2;
        pos[i * 3 + 2] = Math.random() - 0.5;
        vel[i * 3] = (Math.random() - 0.5) * 0.04;
        vel[i * 3 + 1] = 0.04 + Math.random() * 0.06;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xffaa22,
          size: 0.14,
          transparent: true,
          opacity: 0,
        }),
      );
      pts.userData.isSparks = true;
      pts.userData.vel = vel;
      pts.userData.baseH = h + 1;
      vfx.add(pts);
    }

    if (b.id === "brahma-kund") {
      // ── FLOATING KNOWLEDGE ORBS ─────────────────────────────────────────
      for (let i = 0; i < 5; i++) {
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 7, 5),
          new THREE.MeshBasicMaterial({
            color: 0xffdd88,
            transparent: true,
            opacity: 0,
          }),
        );
        orb.userData.orbI = i;
        orb.userData.orbR = 2.2 + i * 0.4;
        orb.userData.orbH = h * 0.55 + i * 0.6;
        vfx.add(orb);
      }
    }

    if (b.id === "vayu-rath") {
      // ── WIND TRAIL RINGS ─────────────────────────────────────────────────
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.8 + i * 0.5, 0.06, 4, 24),
          new THREE.MeshBasicMaterial({
            color: 0x44ddff,
            transparent: true,
            opacity: 0,
          }),
        );
        ring.position.y = h * 0.35 + i * 1.2;
        ring.userData.windRing = true;
        ring.userData.phase = i * 1.1;
        vfx.add(ring);
      }
    }

    if (b.id === "akasha-mandapa") {
      // ── CLOUD WISPS ──────────────────────────────────────────────────────
      for (let i = 0; i < (IS_MOBILE ? 2 : 4); i++) {
        const wisp = new THREE.Mesh(
          new THREE.SphereGeometry(1.8 + Math.random(), 6, 4),
          new THREE.MeshBasicMaterial({
            color: 0xddeeff,
            transparent: true,
            opacity: 0,
          }),
        );
        wisp.scale.set(2.2, 0.28, 0.9);
        wisp.position.set(
          (Math.random() - 0.5) * 4,
          h * 0.6 + i * 1.8 + 12,
          (Math.random() - 0.5) * 4,
        );
        wisp.userData.wisp = true;
        wisp.userData.phase = i * 1.6;
        wisp.userData.baseX = wisp.position.x;
        vfx.add(wisp);
      }
    }

    if (b.id === "lakshmi-prasad") {
      // ── GOLD COIN FALL ───────────────────────────────────────────────────
      const N = IS_MOBILE ? 8 : 18;
      for (let i = 0; i < N; i++) {
        const coin = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.18, 0),
          new THREE.MeshBasicMaterial({
            color: 0xffcc00,
            transparent: true,
            opacity: 0,
          }),
        );
        coin.position.set(
          (Math.random() - 0.5) * 3,
          h + 1 + Math.random() * 4,
          (Math.random() - 0.5) * 3,
        );
        coin.userData.coinDrop = true;
        coin.userData.speed = 0.02 + Math.random() * 0.03;
        coin.userData.baseH = h + 1 + Math.random() * 4;
        vfx.add(coin);
      }
    }

    if (b.id === "saraswati-vihar" || b.id === "gurukul-ashram") {
      // ── KNOWLEDGE GLYPH ORBITS ───────────────────────────────────────────
      for (let i = 0; i < (IS_MOBILE ? 3 : 6); i++) {
        const glyph = new THREE.Mesh(
          new THREE.TetrahedronGeometry(0.22, 0),
          new THREE.MeshBasicMaterial({
            color: b.id === "saraswati-vihar" ? 0xaa88ff : 0x44eeaa,
            transparent: true,
            opacity: 0,
          }),
        );
        glyph.userData.glyphOrbit = true;
        glyph.userData.i = i;
        glyph.userData.r = 2.5 + i * 0.3;
        vfx.add(glyph);
      }
    }

    // ── DIVINE BEAM (night-only spotlight from gopuram top) ─────────────────
    if (b.templeType === "gopuram" && !IS_MOBILE) {
      const spot = new THREE.SpotLight(gc, 0, 200, Math.PI / 24, 0.85, 1.2);
      spot.position.set(b.pos[0], h + 4, b.pos[1]);
      spot.target.position.set(b.pos[0], h + 120, b.pos[1]);
      spot.castShadow = false;
      spot.userData.isDivineBeam = true;
      scene.add(spot);
      scene.add(spot.target);
      divineBeams.push(spot);
    }
  }

  // ── VFX: CENTRAL ISLAND PRANA AURA ───────────────────────────────────────
  function buildPranaAura() {
    const N = IS_MOBILE ? 80 : 200;
    const pos = new Float32Array(N * 3),
      vel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 6 + Math.random() * 4,
        a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 8;
      pos[i * 3 + 2] = Math.sin(a) * r;
      vel[i * 3] = (Math.random() - 0.5) * 0.006;
      vel[i * 3 + 1] = 0.008 + Math.random() * 0.01;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.006;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pranaParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xddaaff,
        size: 0.18,
        transparent: true,
        opacity: 0.65,
        sizeAttenuation: true,
      }),
    );
    pranaParticles.userData.isPrana = true;
    pranaParticles.userData.vel = vel;
    scene.add(pranaParticles);

    // Three pulsing rings around the island
    [4.5, 6.2, 8.0].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.055, 4, 32),
        new THREE.MeshBasicMaterial({
          color: [0xffcc44, 0xddaaff, 0x00ddff][i],
          transparent: true,
          opacity: 0.45 - i * 0.08,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.35;
      ring.userData.isPranaRing = true;
      ring.userData.phase = i * 1.2;
      ring.userData.baseR = r;
      scene.add(ring);
    });
  }

  // ── VFX: INIT ─────────────────────────────────────────────────────────────
  function initBuildingEntities() {
    buildingMeshes.forEach(({ group, building, bodyMat }) => {
      const ent = new BuildingEntity(building, group, bodyMat);
      buildingEntities.push(ent);
      // Add unique VFX identity per building
      addBuildingVfxIdentity(building, group);
    });
    buildEnergyStreams();
  }

  // ── PHILOSOPHY STONE — personal identity marker near central island ─────────
  function buildPhilosophyStone() {
    const W = 560,
      H = 200;
    const can = document.createElement("canvas");
    can.width = W;
    can.height = H;
    const ctx = can.getContext("2d");

    // Stone texture background
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "rgba(28,14,6,0.97)");
    grd.addColorStop(1, "rgba(12,6,2,0.99)");
    ctx.fillStyle = grd;
    if (ctx.roundRect) ctx.roundRect(4, 4, W - 8, H - 8, 8);
    else ctx.rect(4, 4, W - 8, H - 8);
    ctx.fill();

    // Gold border with glow
    ctx.strokeStyle = "#cc9944";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ffcc44";
    ctx.shadowBlur = 12;
    if (ctx.roundRect) ctx.roundRect(4, 4, W - 8, H - 8, 8);
    else ctx.rect(4, 4, W - 8, H - 8);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Top ornament line
    ctx.fillStyle = "#cc9944";
    ctx.fillRect(W / 2 - 50, 12, 100, 2);

    // Quote — the most important line
    ctx.fillStyle = "#fff8ee";
    ctx.font = "italic bold 18px Georgia, serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(255,200,80,0.4)";
    ctx.shadowBlur = 6;
    ctx.fillText('"I build systems that work at 3am —', W / 2, 58);
    ctx.fillText('not systems that work in demos."', W / 2, 82);
    ctx.shadowBlur = 0;

    // Attribution
    ctx.fillStyle = "#cc9944";
    ctx.font = "bold 13px 'Share Tech Mono', monospace";
    ctx.letterSpacing = "3px";
    ctx.fillText("— ADITYA SRIVASTAVA  ·  BACKEND ARCHITECT", W / 2, 115);

    // Role tags
    ctx.fillStyle = "rgba(255,204,68,0.4)";
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.fillText("TRILASOFT SOLUTIONS · 4 YEARS · NOIDA, INDIA", W / 2, 138);

    // Bottom ornament
    ctx.fillStyle = "#cc994488";
    ctx.fillRect(W / 2 - 80, H - 18, 160, 1);

    // Small initials medallion — gold circle with "AS"
    ctx.beginPath();
    ctx.arc(W / 2, H - 32, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#cc9944";
    ctx.fill();
    ctx.fillStyle = "#1a0a02";
    ctx.font = "bold 11px 'Barlow Condensed', sans-serif";
    ctx.fillText("AS", W / 2, H - 28);

    const tex = new THREE.CanvasTexture(can);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(14, 5.0, 1);
    sprite.position.set(3, 2.8, 20); // just east of central island, near spawn
    scene.add(sprite);

    // Physical stone base beneath the quote
    const baseMat = new THREE.MeshToonMaterial({
      color: 0xcc9944,
      gradientMap: window._toonGrad,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.32, 4.5), baseMat);
    base.position.set(3, 0.16, 20);
    scene.add(base);

    // Two torch posts flanking the stone
    const poleMat = new THREE.MeshToonMaterial({
      color: 0x997744,
      gradientMap: window._toonGrad,
    });
    [-5.5, 5.5].forEach((ox) => {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 2.8, 0.18),
        poleMat,
      );
      pole.position.set(3 + ox, 1.4, 20);
      scene.add(pole);
      // Flame on torch
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.45, 5),
        new THREE.MeshBasicMaterial({
          color: 0xff8822,
          transparent: true,
          opacity: 0.88,
        }),
      );
      flame.position.set(3 + ox, 3.0, 20);
      flame.userData.isDiyaFlame = true;
      flame.userData.phase = ox * 0.5;
      scene.add(flame);
      diyaFlames.push(flame);
      // Light
      const li = new THREE.PointLight(0xff9933, 0.8, 8);
      li.position.set(3 + ox, 3.2, 20);
      const wx = 3 + ox;
      li.userData.isDiyaLight = true;
      li.userData.phase = ox * 0.5;
      diyaLights.push({ light: li, wx, wz: 20, phase: ox * 0.5 });
      scene.add(li);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PLAYER PRESENCE — ground indicator + motion feedback
  // ═══════════════════════════════════════════════════════════════════════════
  function buildPlayerPresence() {
    // Ground ring — pulsing circle under car showing "you are here"
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    playerGroundRing = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.3, 20),
      ringMat,
    );
    playerGroundRing.rotation.x = -Math.PI / 2;
    playerGroundRing.position.y = 0.08;
    scene.add(playerGroundRing);

    // Speed trail particle pool — small gold dots left behind when moving fast
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(60 * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trailMesh = new THREE.Points(
      trailGeo,
      new THREE.PointsMaterial({
        color: 0xffaa44,
        size: 0.22,
        transparent: true,
        opacity: 0.0,
        sizeAttenuation: true,
      }),
    );
    trailMesh.userData.isSpeedTrail = true;
    trailMesh.userData.positions = trailPos;
    trailMesh.userData.ages = new Float32Array(60).fill(0);
    trailMesh.userData.head = 0;
    scene.add(trailMesh);
    motionTrail = [trailMesh];
  }

  function updatePlayerPresence(now, dt) {
    if (!playerGroundRing) return;

    // Ground ring follows car, pulses scale
    playerGroundRing.position.set(carX, 0.08, carZ);
    const pulse = 1 + Math.sin(now * 3.5) * 0.07;
    playerGroundRing.scale.setScalar(pulse);
    // Ring fades when stopped, visible when moving
    const targetOp = Math.min(0.55, Math.abs(carSpeed) * 3.5 + 0.15);
    playerGroundRing.material.opacity +=
      (targetOp - playerGroundRing.material.opacity) * 0.1;

    // Speed trail: add new point every few frames when moving
    motionTrail.forEach((trail) => {
      const pos = trail.userData.positions;
      const ages = trail.userData.ages;
      const N = ages.length;
      if (Math.abs(carSpeed) > 0.08) {
        const h = trail.userData.head;
        pos[h * 3] = carX + (Math.random() - 0.5) * 0.5;
        pos[h * 3 + 1] = 0.18;
        pos[h * 3 + 2] = carZ + (Math.random() - 0.5) * 0.5;
        ages[h] = 1.0;
        trail.userData.head = (h + 1) % N;
      }
      // Age all trail points
      let anyAlive = false;
      for (let i = 0; i < N; i++) {
        if (ages[i] > 0) {
          ages[i] = Math.max(0, ages[i] - dt * 1.8);
          anyAlive = true;
        }
      }
      trail.geometry.attributes.position.needsUpdate = true;
      trail.material.opacity = anyAlive ? Math.abs(carSpeed) * 0.8 : 0;
    });

    // Camera tilt on steering for embodied feel
    const sinA = Math.sin(carAngle),
      cosA = Math.cos(carAngle);
    const angleDiff = carAngle - prevCarAngle;
    prevCarAngle = carAngle;
    // Steer feedback from actual lateral velocity — physically correct
    const latVelForFeedback = carVx * carCosA - carVz * carSinA;
    steerFeedback += (latVelForFeedback * 1.6 - steerFeedback) * 0.14;
    steerFeedback *= 0.94;
    if (CAM.state === "FOLLOW") camera.rotateZ(steerFeedback * -0.025);
  }

  // ── VIGNETTE OVERLAY — DOM element for input feedback (brake/turn) ────────
  let vignetteEl = null;
  let vignetteIntensity = 0; // 0→1, drives opacity and color
  let vignetteTurnAmt = 0; // -1→1, drives left/right color shift

  function ensureVignette() {
    if (vignetteEl) return;
    vignetteEl =
      document.getElementById("city-input-vignette") ||
      (() => {
        const d = document.createElement("div");
        d.id = "city-input-vignette";
        d.style.cssText = [
          "position:fixed",
          "inset:0",
          "z-index:9990",
          "pointer-events:none",
          "opacity:0",
          "transition:opacity 0.06s linear",
          "background:radial-gradient(ellipse at center,transparent 55%,rgba(10,5,30,0.85) 100%)",
        ].join(";");
        document.body.appendChild(d);
        return d;
      })();
  }

  function updateVignette(dt) {
    if (!vignetteEl) return;
    const spd = Math.hypot(carVx, carVz);
    const speedRatio = spd / MAX_SPD;

    // Hard brake: intense dark vignette
    const speedDelta = spd - (updateVignette._prevSpd || 0);
    updateVignette._prevSpd = spd;
    if (speedDelta < -0.018 && spd > 0.04) {
      vignetteIntensity = Math.min(
        1,
        vignetteIntensity + Math.abs(speedDelta) * 5.5,
      );
    }
    // Speed vignette: subtle persistent darkening at high speed
    const speedVig = speedRatio > 0.55 ? (speedRatio - 0.55) * 0.38 : 0;
    const targetI = Math.max(speedVig, vignetteIntensity);
    vignetteIntensity += (targetI - vignetteIntensity) * 0.04;
    vignetteIntensity = Math.max(0, vignetteIntensity - dt * 1.8); // decay

    // Lateral turn: directional tint on hard corners
    const latVel = carVx * carCosA - carVz * carSinA;
    vignetteTurnAmt += (latVel * 2.2 - vignetteTurnAmt) * 0.12;
    vignetteTurnAmt = Math.max(-1, Math.min(1, vignetteTurnAmt));

    if (vignetteIntensity < 0.01 && Math.abs(vignetteTurnAmt) < 0.04) {
      vignetteEl.style.opacity = "0";
      return;
    }

    // Build gradient direction from turn amount
    const cx = 50 + vignetteTurnAmt * 12; // shift centre left/right
    vignetteEl.style.background = `radial-gradient(ellipse at ${cx}% 50%, transparent 48%, rgba(8,4,24,${0.72 + vignetteIntensity * 0.28}) 100%)`;
    vignetteEl.style.opacity = String(
      Math.min(1, vignetteIntensity * 1.6 + Math.abs(vignetteTurnAmt) * 0.22),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. NARRATIVE DIRECTOR — guided first-time experience
  // ═══════════════════════════════════════════════════════════════════════════
  function startNarrativeGuide() {
    if (NARRATIVE.phase !== "DORMANT") return;
    NARRATIVE.phase = "GUIDED";
    NARRATIVE.step = 0;
    NARRATIVE.timer = 0;

    // Build the golden Yatra path connecting all 12 temples in career order
    buildYatraPath();

    // Show guide arrow pointing to Surya Dwara
    buildGuideArrow();

    // Show first guide label
    showGuideLabel("◈  DRIVE EAST  →  SURYA DWARA  ◈");

    // Build DOM compass needle — points toward first objective at all times
    buildCompassNeedle();
  }

  function buildCompassNeedle() {
    if (document.getElementById("city-compass")) return;
    const el = document.createElement("div");
    el.id = "city-compass";
    el.style.cssText = [
      "position:fixed",
      "bottom:90px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:9995",
      "pointer-events:none",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "gap:4px",
      "opacity:0",
      "transition:opacity 0.6s ease",
    ].join(";");
    el.innerHTML = `
      <div id="city-compass-arrow" style="
        width:0; height:0;
        border-left:10px solid transparent;
        border-right:10px solid transparent;
        border-bottom:26px solid #ffcc44;
        filter:drop-shadow(0 0 6px #ffcc44);
        transform-origin:50% 100%;
        transition:transform 0.12s ease;
      "></div>
      <span style="
        color:#ffcc44; font-size:10px; font-family:monospace;
        letter-spacing:2px; text-shadow:0 0 8px #ffcc44;
        opacity:0.85;
      ">SURYA DWARA</span>
    `;
    document.body.appendChild(el);
    // Fade in after 1s
    setTimeout(() => {
      el.style.opacity = "1";
    }, 1000);
  }

  function buildYatraPath() {
    const order = [
      "gurukul-ashram",
      "saraswati-vihar",
      "pura-stambha",
      "vayu-rath",
      "jyotish-vedha",
      "brahma-kund",
      "akasha-mandapa",
      "setu-nagara",
      "lakshmi-prasad",
      "maya-sabha",
      "vishwakarma-shala",
      "surya-dwara",
    ];
    const pts = [];
    order.forEach((id) => {
      const b = window.CITY_DATA.buildings.find((b) => b.id === id);
      if (b) pts.push(new THREE.Vector3(b.pos[0], 0.25, b.pos[1]));
    });
    if (pts.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const tubeGeo = new THREE.TubeGeometry(curve, 120, 0.12, 4, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.0,
    });
    NARRATIVE.yatraPath = new THREE.Mesh(tubeGeo, tubeMat);
    NARRATIVE.yatraPath.userData.isYatra = true;
    NARRATIVE.yatraCurve = curve; // P3: store curve for flow particles
    scene.add(NARRATIVE.yatraPath);
    buildYatraFlowParticles(curve); // P3: build animated particles
  }

  function buildGuideArrow() {
    const surya = window.CITY_DATA.buildings.find(
      (b) => b.id === "surya-dwara",
    );
    if (!surya) return;

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.4, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0,
      }),
    );
    arrow.position.set(surya.pos[0], surya.height + 5, surya.pos[1]);
    arrow.rotation.z = Math.PI; // point downward
    arrow.userData.isGuideArrow = true;
    NARRATIVE.guideArrow = arrow;
    scene.add(arrow);
  }

  function showGuideLabel(text) {
    if (NARRATIVE.guideLabel) {
      scene.remove(NARRATIVE.guideLabel);
    }
    const W = 480,
      H = 68;
    const can = document.createElement("canvas");
    can.width = W;
    can.height = H;
    const ctx = can.getContext("2d");
    ctx.fillStyle = "rgba(10,5,1,0.88)";
    if (ctx.roundRect) ctx.roundRect(4, 4, W - 8, H - 8, 8);
    else ctx.rect(4, 4, W - 8, H - 8);
    ctx.fill();
    ctx.strokeStyle = "#ffcc44aa";
    ctx.lineWidth = 2;
    if (ctx.roundRect) ctx.roundRect(4, 4, W - 8, H - 8, 8);
    else ctx.rect(4, 4, W - 8, H - 8);
    ctx.stroke();
    ctx.fillStyle = "#ffcc44";
    ctx.font = "bold 18px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, H / 2);
    const tex = new THREE.CanvasTexture(can);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      }),
    );
    sp.scale.set(12, 1.7, 1);
    sp.position.set(carX, 6.5, carZ + 5);
    sp.userData.isGuideLabel = true;
    NARRATIVE.guideLabel = sp;
    scene.add(sp);
    // Fade in
    let t2 = 0;
    const iv = setInterval(() => {
      t2 += 0.04;
      sp.material.opacity = Math.min(0.95, t2);
      if (t2 >= 0.95) clearInterval(iv);
    }, 30);
  }

  function hideGuideLabel(cb) {
    if (!NARRATIVE.guideLabel) {
      if (cb) cb();
      return;
    }
    const sp = NARRATIVE.guideLabel;
    let t2 = sp.material.opacity;
    const iv = setInterval(() => {
      t2 -= 0.05;
      sp.material.opacity = Math.max(0, t2);
      if (t2 <= 0) {
        clearInterval(iv);
        scene.remove(sp);
        NARRATIVE.guideLabel = null;
        if (cb) cb();
      }
    }, 30);
  }

  function updateNarrative(now, dt) {
    if (CAM.state === "STATIC" || CAM.state === "INTRO") return;
    if (NARRATIVE.phase !== "GUIDED") return;
    NARRATIVE.timer += dt;

    // ── COMPASS NEEDLE — always point toward Surya Dwara ────────────────────
    const compassEl = document.getElementById("city-compass");
    const compassArrow = document.getElementById("city-compass-arrow");
    if (compassEl && compassArrow && !NARRATIVE.firstVisitDone) {
      const surya = window.CITY_DATA.buildings.find(
        (b) => b.id === "surya-dwara",
      );
      if (surya) {
        const dx = surya.pos[0] - carX;
        const dz = surya.pos[1] - carZ;
        const dist = Math.hypot(dx, dz);
        // World angle toward target, then subtract car heading to get relative angle
        const worldAng = Math.atan2(dx, dz);
        const relAng = worldAng - carAngle;
        const deg = relAng * (180 / Math.PI);
        compassArrow.style.transform = `rotate(${deg}deg)`;
        // Fade out when very close
        if (dist < 18) {
          compassEl.style.opacity = String(Math.max(0, (dist - 8) / 10));
        }
      }
    } else if (compassEl && NARRATIVE.firstVisitDone) {
      // Remove compass once the first temple is reached
      compassEl.style.opacity = "0";
      setTimeout(() => {
        compassEl.remove();
      }, 700);
    }

    // Guide arrow floats above Surya Dwara and fades in
    if (NARRATIVE.guideArrow) {
      const surya = window.CITY_DATA.buildings.find(
        (b) => b.id === "surya-dwara",
      );
      const bh = surya?.height || 18;
      NARRATIVE.guideArrow.position.y = bh + 4 + Math.sin(now * 2.5) * 0.4;
      NARRATIVE.guideArrow.rotation.y = now * 1.2;
      // Bounce gently to draw attention
      NARRATIVE.guideArrow.position.x = surya?.pos[0] || 45;
      NARRATIVE.guideArrow.position.z = surya?.pos[1] || -22;
      // Fade in: bring opacity from 0 → 0.92 over first 2s of GUIDED phase
      if (NARRATIVE.guideArrow.material.opacity < 0.9) {
        NARRATIVE.guideArrow.material.opacity = Math.min(
          0.92,
          NARRATIVE.guideArrow.material.opacity + 0.018,
        );
      }
      // Scale pulse so it catches the eye
      const arrowPulse = 1 + Math.sin(now * 3.2) * 0.15;
      NARRATIVE.guideArrow.scale.setScalar(arrowPulse);
    }

    // Yatra path fades in slowly
    if (NARRATIVE.yatraPath) {
      const targetOp = NARRATIVE.yatraVisible ? 0.55 : 0;
      NARRATIVE.yatraPath.material.opacity +=
        (targetOp - NARRATIVE.yatraPath.material.opacity) * 0.04;
      // Animate path shimmer via drawRange
      const total = NARRATIVE.yatraPath.geometry.attributes.position.count;
      // No drawRange on TubeGeometry easily — just let it be fully visible with opacity
    }

    // Guide label follows car height, stays ahead of player
    if (NARRATIVE.guideLabel) {
      NARRATIVE.guideLabel.position.set(carX, 6.5, carZ + 4);
    }

    // Check if player reached Surya Dwara for the first time
    const surya = window.CITY_DATA.buildings.find(
      (b) => b.id === "surya-dwara",
    );
    if (surya && !NARRATIVE.firstVisitDone) {
      const dist = Math.hypot(carX - surya.pos[0], carZ - surya.pos[1]);
      if (dist < 25) {
        NARRATIVE.firstVisitDone = true;
        // Remove guide — player found the first temple
        hideGuideLabel(() => showGuideLabel("◈  PRESS  E  TO ENTER  ◈"));
        setTimeout(() => {
          hideGuideLabel();
          if (NARRATIVE.guideArrow) {
            scene.remove(NARRATIVE.guideArrow);
            NARRATIVE.guideArrow = null;
          }
          // Show Yatra path briefly then transition to FREE
          NARRATIVE.yatraVisible = true;
          showGuideLabel("◈  YATRA PATH REVEALED — EXPLORE FREELY  ◈");
          setTimeout(() => {
            hideGuideLabel();
            NARRATIVE.yatraVisible = false;
            NARRATIVE.phase = "FREE";
          }, 5000);
        }, 4000);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. SPATIAL AUDIO — per-building positional sound + ambient layers
  // ═══════════════════════════════════════════════════════════════════════════

  // Audio identity per building — frequencies and oscillator types
  const BUILDING_AUDIO_PROFILES = {
    "surya-dwara": { freq: 528, type: "sine", char: "bell", gain: 0.06 },
    "vishwakarma-shala": {
      freq: 220,
      type: "sawtooth",
      char: "forge",
      gain: 0.05,
    },
    "brahma-kund": { freq: 110, type: "sine", char: "drone", gain: 0.07 },
    "vayu-rath": { freq: 396, type: "triangle", char: "wind", gain: 0.055 },
    "lakshmi-prasad": { freq: 639, type: "sine", char: "chime", gain: 0.06 },
    "akasha-mandapa": { freq: 285, type: "sine", char: "space", gain: 0.05 },
    "setu-nagara": { freq: 174, type: "triangle", char: "deep", gain: 0.055 },
    "pura-stambha": { freq: 147, type: "sine", char: "ancient", gain: 0.05 },
    "maya-sabha": { freq: 432, type: "triangle", char: "mystic", gain: 0.055 },
    "jyotish-vedha": { freq: 741, type: "sine", char: "crystal", gain: 0.05 },
    "saraswati-vihar": {
      freq: 852,
      type: "triangle",
      char: "veena",
      gain: 0.06,
    },
    "gurukul-ashram": { freq: 963, type: "sine", char: "chant", gain: 0.055 },
  };

  function initSpatialAudio() {
    if (!audioCtx || IS_MOBILE) return;
    buildAmbientLayers();
    buildBuildingAudio();
  }

  function buildAmbientLayers() {
    // ── WIND LAYER — filtered white noise ────────────────────────────────
    try {
      const bufSize = audioCtx.sampleRate * 3;
      const noiseBuf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const windFilt = audioCtx.createBiquadFilter();
      windFilt.type = "bandpass";
      windFilt.frequency.value = 350;
      windFilt.Q.value = 0.4;
      const windGain = audioCtx.createGain();
      windGain.gain.value = 0.018;
      noise.connect(windFilt);
      windFilt.connect(windGain);
      windGain.connect(audioCtx.destination);
      noise.start();
      ambientLayers.wind = { node: noise, gain: windGain };
      // Slow LFO on wind
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoG = audioCtx.createGain();
      lfoG.gain.value = 0.008;
      lfo.connect(lfoG);
      lfoG.connect(windGain.gain);
      lfo.start();
    } catch (e) {}

    // ── TEMPLE BELL — random interval chimes ─────────────────────────────
    function schedBell() {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const freq = [528, 396, 639, 741][Math.floor(Math.random() * 4)];
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 3.8);
      setTimeout(schedBell, 4000 + Math.random() * 8000);
    }
    setTimeout(schedBell, 3000);

    // ── SPIRITUAL DRONE — deep layered om-like tone ───────────────────────
    try {
      const droneFreqs = [55, 110, 165];
      droneFreqs.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        o.type = "sine";
        o.frequency.value = f + (Math.random() - 0.5) * 0.8;
        const g = audioCtx.createGain();
        g.gain.value = 0.022 - i * 0.005;
        const lfo2 = audioCtx.createOscillator();
        lfo2.frequency.value = 0.05 + i * 0.02;
        const lg = audioCtx.createGain();
        lg.gain.value = 0.005;
        lfo2.connect(lg);
        lg.connect(g.gain);
        lfo2.start();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        ambientLayers[`drone_${i}`] = { osc: o, gain: g };
      });
    } catch (e) {}
  }

  function buildBuildingAudio() {
    window.CITY_DATA.buildings.forEach((b) => {
      const prof = BUILDING_AUDIO_PROFILES[b.id];
      if (!prof) return;
      try {
        const osc = audioCtx.createOscillator();
        const harm = audioCtx.createOscillator(); // harmonic
        const gain = audioCtx.createGain();
        const filt = audioCtx.createBiquadFilter();

        osc.type = prof.type;
        osc.frequency.value = prof.freq;
        harm.type = "sine";
        harm.frequency.value = prof.freq * 2.01;
        filt.type = "bandpass";
        filt.frequency.value = prof.freq * 3;
        filt.Q.value = 6;
        gain.gain.value = 0; // starts silent

        // LFO for organic movement
        const lfo = audioCtx.createOscillator();
        lfo.frequency.value = 0.12 + Math.random() * 0.08;
        const lg = audioCtx.createGain();
        lg.gain.value = 0.003;
        lfo.connect(lg);
        lg.connect(gain.gain);
        lfo.start();

        const harmGain = audioCtx.createGain();
        harmGain.gain.value = 0.3;

        // P2: PannerNode — true 3D stereo positioning
        const panner = audioCtx.createPanner();
        panner.panningModel = "HRTF";
        panner.distanceModel = "inverse";
        panner.refDistance = 1;
        panner.maxDistance = 60;
        panner.rolloffFactor = 1.4;
        panner.positionX.value = b.pos[0];
        panner.positionY.value = 4;
        panner.positionZ.value = b.pos[1];

        harm.connect(harmGain);
        harmGain.connect(filt);
        osc.connect(filt);
        filt.connect(gain);
        gain.connect(panner);
        panner.connect(audioCtx.destination);
        osc.start();
        harm.start();

        spatialAudio[b.id] = {
          osc,
          harm,
          gain,
          filt,
          panner,
          bx: b.pos[0],
          bz: b.pos[1],
          baseGain: prof.gain,
          profile: prof,
        };
      } catch (e) {}
    });
  }

  function updateSpatialAudio() {
    if (!audioCtx || IS_MOBILE) return;

    // AudioContext listener — throttle to 20fps (audio doesn't need 60fps)
    if (audioCtx.listener.positionX && animate._frame % 3 === 0) {
      audioCtx.listener.positionX.value = carX;
      audioCtx.listener.positionY.value = 2;
      audioCtx.listener.positionZ.value = carZ;
      audioCtx.listener.forwardX.value = -carSinA;
      audioCtx.listener.forwardY.value = 0;
      audioCtx.listener.forwardZ.value = -carCosA;
    }

    Object.entries(spatialAudio).forEach(([id, s]) => {
      const dist = Math.hypot(carX - s.bx, carZ - s.bz);
      const maxDist = 45;
      const targetG =
        dist < maxDist
          ? s.baseGain * Math.pow(Math.max(0, 1 - dist / maxDist), 1.6)
          : 0;
      const cur = s.gain.gain.value;
      s.gain.gain.value += (targetG - cur) * 0.04;
    });
  }

  function playBuildingHover(buildingId) {
    if (!audioCtx || buildingId === lastHoverBuildingId) return;
    lastHoverBuildingId = buildingId;
    try {
      const t = audioCtx.currentTime;
      const prof = BUILDING_AUDIO_PROFILES[buildingId] || { freq: 528 };
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.value = prof.freq * 1.5;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.55);
    } catch (e) {}
  }

  function playBuildingSelect(buildingId) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const prof = BUILDING_AUDIO_PROFILES[buildingId] || { freq: 396 };

      // Low-frequency impact
      const sub = audioCtx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = 60;
      const subG = audioCtx.createGain();
      subG.gain.setValueAtTime(0.15, t);
      subG.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      sub.connect(subG);
      subG.connect(audioCtx.destination);
      sub.start(t);
      sub.stop(t + 0.65);

      // High shimmer — building's sacred frequency
      const hi = audioCtx.createOscillator();
      hi.type = "sine";
      hi.frequency.value = prof.freq;
      const hiG = audioCtx.createGain();
      hiG.gain.setValueAtTime(0, t + 0.05);
      hiG.gain.linearRampToValueAtTime(0.08, t + 0.12);
      hiG.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      hi.connect(hiG);
      hiG.connect(audioCtx.destination);
      hi.start(t + 0.05);
      hi.stop(t + 2.5);

      // Third overtone shimmer
      const ov = audioCtx.createOscillator();
      ov.type = "triangle";
      ov.frequency.value = prof.freq * 3;
      const ovG = audioCtx.createGain();
      ovG.gain.setValueAtTime(0, t + 0.08);
      ovG.gain.linearRampToValueAtTime(0.04, t + 0.16);
      ovG.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      ov.connect(ovG);
      ovG.connect(audioCtx.destination);
      ov.start(t + 0.08);
      ov.stop(t + 1.6);
    } catch (e) {}
  }

  function playTransitionWhoosh() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const buf = audioCtx.createBuffer(
        1,
        audioCtx.sampleRate * 0.6,
        audioCtx.sampleRate,
      );
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 0.8);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filt = audioCtx.createBiquadFilter();
      filt.type = "bandpass";
      filt.frequency.setValueAtTime(800, t);
      filt.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      filt.Q.value = 2;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      src.connect(filt);
      filt.connect(g);
      g.connect(audioCtx.destination);
      src.start(t);
    } catch (e) {}
  }

  function playCinematicSwell(duration) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      // Rising chord swell — 3 layered tones
      [
        [110, 0.0],
        [220, 0.15],
        [330, 0.3],
        [440, 0.5],
      ].forEach(([freq, delay]) => {
        const o = audioCtx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.055, t + delay + 1.2);
        g.gain.linearRampToValueAtTime(0.0, t + duration);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t + delay);
        o.stop(t + duration + 0.1);
      });
    } catch (e) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CINEMATIC MOMENTS — bloom flash, energy surge, focus delay
  // ═══════════════════════════════════════════════════════════════════════════
  function triggerCityRevealCinematic() {
    // Bloom flash via DOM overlay
    const bloom =
      document.getElementById("city-bloom") ||
      (() => {
        const d = document.createElement("div");
        d.id = "city-bloom";
        d.style.cssText =
          "position:fixed;inset:0;z-index:9999;pointer-events:none;background:rgba(255,220,120,0);transition:background 0.3s ease";
        document.body.appendChild(d);
        return d;
      })();
    bloom.style.background = "rgba(255,220,120,0.65)";
    setTimeout(() => {
      bloom.style.background = "rgba(255,220,120,0)";
    }, 350);

    // Camera shake
    CAM.shakeAmt = 0.6;

    // Audio swell
    playCinematicSwell(5.0);
  }

  function triggerBuildingSelectCinematic(building) {
    // Micro-delay before UI: energy surge first, then panel
    const gc = parseInt((building.glowColor || "#ffcc44").slice(1), 16);
    spawnEnergyBurst(
      building.pos[0],
      building.height * 0.5,
      building.pos[1],
      gc,
    );

    // Brief bloom tinted with building color
    const bloom =
      document.getElementById("city-bloom") || document.createElement("div");
    if (!bloom.id) {
      bloom.id = "city-bloom";
      bloom.style.cssText =
        "position:fixed;inset:0;z-index:9999;pointer-events:none;transition:background 0.2s ease";
      document.body.appendChild(bloom);
    }
    const r = (gc >> 16) & 0xff,
      g2 = (gc >> 8) & 0xff,
      b2 = gc & 0xff;
    bloom.style.background = `rgba(${r},${g2},${b2},0.35)`;
    setTimeout(() => {
      bloom.style.background = "rgba(0,0,0,0)";
    }, 280);
    CAM.shakeAmt = 0.3;
    playBuildingSelect(building.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVING WORLD — environmental life, atmosphere, and micro-animations
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. WIND SWAY — trees already have shake, add continuous ambient sway
  function addWindSway() {
    // Assign each tree a unique wind phase so they don't all sway identically
    trees.forEach((tr, i) => {
      tr.windPhase = (i * 2.39996) % (Math.PI * 2); // golden-angle spread
      tr.windAmpX = 0.018 + Math.random() * 0.012;
      tr.windAmpZ = 0.012 + Math.random() * 0.008;
      tr.windFreq = 0.38 + Math.random() * 0.18;
    });
  }

  function updateWindSway(now) {
    const windDir = Math.sin(now * 0.04) * 0.3;
    trees.forEach((tr) => {
      if (!tr.leaf || tr.shakeT > 0) return;
      // Distance culling — skip trees > 55 units from car (not visible anyway)
      if (!tr.pos) {
        tr.pos = [
          tr.group ? tr.group.position.x : 0,
          tr.group ? tr.group.position.z : 0,
        ];
      }
      if (Math.hypot(carX - tr.pos[0], carZ - tr.pos[1]) > 55) return;
      const phase = now * tr.windFreq + tr.windPhase;
      tr.leaf.rotation.x = Math.sin(phase) * tr.windAmpX + windDir * 0.01;
      tr.leaf.rotation.z = Math.sin(phase * 0.73 + 1) * tr.windAmpZ;
      // Slight vertical bob
      tr.leaf.position.y =
        tr.leaf.userData.baseY !== undefined
          ? tr.leaf.userData.baseY + Math.sin(phase * 0.5) * 0.04
          : tr.leaf.position.y;
    });
  }

  // 2. PRAYER FLAGS WAVE — animate existing flags with cloth simulation
  let flagMeshes = []; // populated during buildPrayerFlags

  function updateFlagWave(now) {
    flagMeshes.forEach((f) => {
      if (!f.userData.isFlagCloth) return;
      const phase = now * f.userData.waveFreq + f.userData.wavePhase;
      f.rotation.z = Math.sin(phase) * f.userData.waveAmpZ;
      f.rotation.x = Math.sin(phase * 0.6 + 1) * f.userData.waveAmpX;
      // Scale ripple — cloth stretches slightly
      f.scale.x = 1 + Math.sin(phase * 1.3) * 0.04;
    });
  }

  // 3. ROAD ENERGY FLOW — moving light particles along the main roads
  function buildRoadEnergyFlow() {
    if (IS_MOBILE) return;
    const N = 120;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);

    // Seed particles along key road paths
    const roadPaths = [
      // N-S spine
      ...Array.from({ length: 40 }, (_, i) => [0, 0.28, -70 + i * 3.3]),
      // E-W main boulevard
      ...Array.from({ length: 40 }, (_, i) => [-65 + i * 3.3, 0.28, 0]),
      // Hero zone approach
      ...Array.from({ length: 40 }, (_, i) => [-65 + i * 3.3, 0.28, -14]),
    ];

    for (let i = 0; i < N; i++) {
      const seed = roadPaths[i % roadPaths.length];
      pos[i * 3] = seed[0] + (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = seed[1];
      pos[i * 3 + 2] = seed[2];
      // Gold-to-cyan gradient
      const t = Math.random();
      col[i * 3] = 0.8 + t * 0.2;
      col[i * 3 + 1] = 0.7 + t * 0.15;
      col[i * 3 + 2] = t * 0.6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    roadEnergyParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.28,
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        sizeAttenuation: true,
      }),
    );
    roadEnergyParticles.userData.isRoadEnergy = true;
    roadEnergyParticles.userData.speeds = new Float32Array(N).map(
      () => 0.06 + Math.random() * 0.08,
    );
    roadEnergyParticles.userData.roadPaths = roadPaths;
    roadEnergyParticles.userData.pathIdx = new Float32Array(N).map(
      (_, i) => i % roadPaths.length,
    );
    roadEnergyParticles.userData.t = new Float32Array(N).map(() =>
      Math.random(),
    );
    scene.add(roadEnergyParticles);
  }

  function updateRoadEnergyFlow(dt) {
    if (!roadEnergyParticles) return;
    const pos = roadEnergyParticles.geometry.attributes.position.array;
    const ud = roadEnergyParticles.userData;
    const paths = ud.roadPaths;
    const N = ud.speeds.length;

    for (let i = 0; i < N; i++) {
      ud.t[i] += ud.speeds[i] * dt;
      if (ud.t[i] > 1) {
        ud.t[i] = 0;
        // Pick new road path segment
        ud.pathIdx[i] = Math.floor(Math.random() * paths.length);
      }
      const src = paths[ud.pathIdx[i]];
      const dst = paths[(ud.pathIdx[i] + 1) % paths.length];
      const t = ud.t[i];
      pos[i * 3] = src[0] + (dst[0] - src[0]) * t + Math.sin(t * 4 + i) * 0.3;
      pos[i * 3 + 1] = 0.28 + Math.sin(t * 6 + i * 0.5) * 0.08;
      pos[i * 3 + 2] = src[2] + (dst[2] - src[2]) * t;
    }
    roadEnergyParticles.geometry.attributes.position.needsUpdate = true;
    // Pulse opacity with world breath
    roadEnergyParticles.material.opacity =
      0.38 + Math.sin(windTime * 1.2) * 0.12;
  }

  // 4. DIVINE DUST PARTICLES — floating motes throughout the world
  function buildDivineParticles() {
    const N = IS_MOBILE ? 40 : 80; // reduced 300→80 for performance
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 160;
      pos[i * 3 + 1] = Math.random() * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
      vel[i * 3] = (Math.random() - 0.5) * 0.003;
      vel[i * 3 + 1] = 0.002 + Math.random() * 0.004;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.003;
      // Warm gold / soft white / pale cyan
      const t = Math.random();
      if (t < 0.4) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.92;
        col[i * 3 + 2] = 0.6;
      } // gold
      else if (t < 0.7) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 1;
        col[i * 3 + 2] = 1;
      } // white
      else {
        col[i * 3] = 0.55;
        col[i * 3 + 1] = 0.88;
        col[i * 3 + 2] = 1;
      } // cyan
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    divineParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.45,
        sizeAttenuation: true,
      }),
    );
    divineParticles.userData.isDivine = true;
    divineParticles.userData.vel = vel;
    scene.add(divineParticles);
  }

  function updateDivineParticles(now, dt) {
    if (!divineParticles) return;
    const pos = divineParticles.geometry.attributes.position.array;
    const vel = divineParticles.userData.vel;
    const N = pos.length / 3;
    for (let i = 0; i < N; i++) {
      // Drift upward + gentle horizontal wander
      pos[i * 3] += vel[i * 3] + Math.sin(now * 0.3 + i * 0.4) * 0.002;
      pos[i * 3 + 1] += vel[i * 3 + 1];
      pos[i * 3 + 2] += vel[i * 3 + 2] + Math.cos(now * 0.25 + i * 0.3) * 0.002;
      // Reset at top, respawn anywhere
      if (
        pos[i * 3 + 1] > 16 ||
        Math.abs(pos[i * 3]) > 85 ||
        Math.abs(pos[i * 3 + 2]) > 85
      ) {
        pos[i * 3] = (Math.random() - 0.5) * 160;
        pos[i * 3 + 1] = 0;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
      }
    }
    divineParticles.geometry.attributes.position.needsUpdate = true;
    // Gentle opacity breathing
    divineParticles.material.opacity = 0.3 + Math.sin(now * 0.5) * 0.12;
  }

  // 5. GROUND SHIMMER — subtle glowing disc near each temple
  function buildGroundShimmers() {
    window.CITY_DATA.buildings.forEach((b) => {
      const gc = parseInt((b.glowColor || "#ffcc44").slice(1), 16);
      const r = Math.max(b.size?.[0] || 8, b.size?.[1] || 8) * 0.9;
      const mat = new THREE.MeshBasicMaterial({
        color: gc,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(b.pos[0], 0.06, b.pos[1]);
      disc.userData.isGroundShimmer = true;
      disc.userData.buildingId = b.id;
      disc.userData.baseRadius = r;
      scene.add(disc);
      groundShimmers.push({ mesh: disc, building: b });
    });
  }

  function updateGroundShimmers(now) {
    groundShimmers.forEach(({ mesh, building }) => {
      const ent = buildingEntities.find((e) => e.b.id === building.id);
      const vi = ent ? ent.vfxI : 0;
      // Shimmer pulses with entity VFX intensity + slow sine
      const pulse =
        vi * (0.08 + Math.sin(now * 1.4 + building.pos[0] * 0.2) * 0.04);
      mesh.material.opacity += (pulse - mesh.material.opacity) * 0.06;
      // Slight scale breathe
      const s = 1 + Math.sin(now * 0.9 + building.pos[1] * 0.15) * 0.04 * vi;
      mesh.scale.setScalar(s);
    });
  }

  // 6. CINEMATIC LIGHTING — time-based world breathing
  function updateWorldBreathing(now, dt) {
    lightBreathT += dt * 0.08; // very slow — full cycle ≈ 78 seconds

    if (!sunLight || !ambLight || !hemiLight) return;

    // Sun color breathes between golden and slightly cooler
    const breathSin = Math.sin(lightBreathT * Math.PI * 2);
    const sunR = 1.0 + breathSin * 0.04;
    const sunG = 0.87 + breathSin * 0.03;
    const sunB = 0.53 - breathSin * 0.03;
    sunLight.color.setRGB(
      Math.min(1, sunLight.color.r * 0.95 + sunR * 0.05),
      Math.min(1, sunLight.color.g * 0.95 + sunG * 0.05),
      Math.min(1, sunLight.color.b * 0.95 + sunB * 0.05),
    );

    // Ambient intensity breathes ±8%
    const baseAmbI = isNight ? 0.15 : 0.65;
    ambLight.intensity = baseAmbI * (1 + breathSin * 0.08);

    // Hemisphere sky color shifts slightly — world "alive" feel
    if (!isNight) {
      const skyR = 1.0 + breathSin * 0.03;
      const skyG = 0.91 + breathSin * 0.02;
      const skyB = 0.67 - breathSin * 0.05;
      hemiLight.color.setRGB(skyR * 0.98, skyG * 0.98, skyB * 0.98);
    }

    // Fog density breathes very subtly — depth varies
    if (scene.fog) {
      const baseFogD = isNight ? 0.004 : 0.0012;
      scene.fog.density = baseFogD * (1 + breathSin * 0.15);
    }
  }

  // 7. EMISSIVE TEMPLE ACCENTS — warm glow on building edges at night
  function addTempleEmissiveAccents() {
    buildingMeshes.forEach(({ group, building }) => {
      const gc = parseInt((building.glowColor || "#ffcc44").slice(1), 16);
      // Place a very thin glowing ring at each tier of the temple platform
      const ringMat = new THREE.MeshBasicMaterial({
        color: gc,
        transparent: true,
        opacity: isNight ? 0.35 : 0.08,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry((building.size?.[0] || 8) * 0.55, 0.06, 4, 24),
        ringMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(building.pos[0], 1.4, building.pos[1]);
      ring.userData.isEmissiveAccent = true;
      ring.userData.buildingId = building.id;
      scene.add(ring);
      templeEmissives.push({ ring, building, mat: ringMat });
    });
  }

  function updateEmissiveAccents(now) {
    templeEmissives.forEach(({ ring, building, mat }) => {
      const ent = buildingEntities.find((e) => e.b.id === building.id);
      const vi = ent ? ent.vfxI : 0;
      const baseOp = isNight ? 0.35 : 0.06;
      const pulse =
        baseOp + vi * 0.28 + Math.sin(now * 1.8 + building.pos[0] * 0.3) * 0.05;
      mat.opacity += (pulse - mat.opacity) * 0.06;
      // Slow rotation — energy ring orbits the building base
      ring.rotation.z = now * 0.12;
    });
  }

  // 8. ROAD SHIMMER LINES — subtle moving light on road surface
  function buildRoadShimmerLines() {
    if (IS_MOBILE) return;
    // 6 long thin planes along main roads that pulse opacity
    const shimMat = new THREE.MeshBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const roads = [
      { x: 0, z: 0, len: 180, rot: 0 }, // N-S spine
      { x: 0, z: -14, len: 180, rot: 0 }, // hero avenue
      { x: 0, z: 0, len: 180, rot: Math.PI / 2 }, // E-W boulevard
      { x: 0, z: 24, len: 180, rot: Math.PI / 2 }, // mid cross
    ];
    roads.forEach((r, i) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, r.len),
        shimMat.clone(),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = r.rot;
      mesh.position.set(r.x, 0.14, r.z);
      mesh.userData.isRoadShimmer = true;
      mesh.userData.phase = i * 1.57;
      mesh.userData.baseZ = r.z;
      mesh.userData.baseX = r.x;
      scene.add(mesh);
      waveLines.push(mesh); // reuse existing waveLines array for animate
    });
  }

  // ── AUTO-DRIVE STATE ─────────────────────────────────────────────────────
  let autoDriveTarget = null; // { x, z } world target
  let autoDriveActive = false;

  // ── IN-WORLD PANEL STATE ──────────────────────────────────────────────────
  let worldPanel = null; // THREE.Mesh PlaneGeometry panel in world
  let worldPanelGroup = null; // Group: panel + glow ring
  let worldPanelT = 0; // 0→1 rise animation
  let worldPanelOpen = false;
  let worldPanelBuilding = null;

  // ── YATRA FLOW STATE ──────────────────────────────────────────────────────
  let yatraFlowParticles = null; // points flowing along yatra path
  let yatraFlowPositions = null;
  let yatraFlowT = []; // per-particle progress

  // ── COMPLETION STATE ──────────────────────────────────────────────────────
  let completionFired = false;
  let completionRings = []; // expanding gold rings at central island

  // ─────────────────────────────────────────────────────────────────────────
  // P1: IN-WORLD PANEL — PlaneGeometry that rises from the temple base
  // ─────────────────────────────────────────────────────────────────────────
  function buildWorldPanel(b) {
    if (worldPanelGroup) {
      scene.remove(worldPanelGroup);
      worldPanelGroup = null;
      worldPanel = null;
    }

    worldPanelBuilding = b;
    worldPanelGroup = new THREE.Group();

    const gc = parseInt((b.glowColor || "#ffcc44").slice(1), 16);
    const gcVec = new THREE.Color(gc);

    // Build canvas texture with building info
    const W = 512,
      H = 384;
    const can = document.createElement("canvas");
    can.width = W;
    can.height = H;
    const ctx = can.getContext("2d");

    // Background — dark stone slab
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(10,5,2,0.97)");
    bg.addColorStop(1, "rgba(4,2,0,0.99)");
    ctx.fillStyle = bg;
    if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 6);
    else ctx.rect(0, 0, W, H);
    ctx.fill();

    // Glow border
    ctx.strokeStyle = b.glowColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = b.glowColor;
    ctx.shadowBlur = 14;
    if (ctx.roundRect) ctx.roundRect(2, 2, W - 4, H - 4, 5);
    else ctx.rect(2, 2, W - 4, H - 4);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Header line
    const lineGrd = ctx.createLinearGradient(0, 0, W, 0);
    lineGrd.addColorStop(0, b.glowColor);
    lineGrd.addColorStop(1, "transparent");
    ctx.fillStyle = lineGrd;
    ctx.fillRect(0, 0, W, 3);

    // Badge
    ctx.fillStyle = b.glowColor + "22";
    ctx.fillRect(14, 14, 180, 22);
    ctx.fillStyle = b.glowColor;
    ctx.font = "bold 10px 'Share Tech Mono', monospace";
    ctx.fillText(
      (b.tag || b.templeType?.toUpperCase() || "SYSTEM").slice(0, 28),
      20,
      29,
    );

    // Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Barlow Condensed', sans-serif";
    ctx.fillText(b.name || "Temple", 14, 66);

    // Subtitle
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.fillText((b.subtitle || "").slice(0, 50), 14, 86);

    // Divider
    ctx.fillStyle = b.glowColor + "44";
    ctx.fillRect(14, 96, W - 28, 1);

    // Metrics
    if (b.metrics?.length) {
      b.metrics.slice(0, 3).forEach((m, i) => {
        const mx = 14 + i * 160;
        ctx.fillStyle = b.glowColor;
        ctx.font = "bold 20px 'Barlow Condensed', sans-serif";
        ctx.fillText(m.v, mx, 126);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "8px 'Share Tech Mono', monospace";
        ctx.fillText(m.l.slice(0, 16).toUpperCase(), mx, 140);
      });
    }

    // Story excerpt
    const story = (b.story || "").replace(/<[^>]+>/g, "").slice(0, 200);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "12px 'Segoe UI', sans-serif";
    const words = story.split(" ");
    let line = "",
      y = 172;
    words.forEach((word) => {
      const test = line + word + " ";
      if (ctx.measureText(test).width > W - 28 && line) {
        ctx.fillText(line.trim(), 14, y);
        line = word + " ";
        y += 17;
        if (y > 270) {
          line = "";
        }
      } else line = test;
    });
    if (line && y <= 270) ctx.fillText(line.trim(), 14, y);

    // Tech tags
    if (b.tech?.length) {
      ctx.fillStyle = b.glowColor + "44";
      ctx.fillRect(14, 282, W - 28, 1);
      let tx = 14;
      const ty = 308;
      b.tech.slice(0, 6).forEach((t) => {
        const tw = ctx.measureText(t).width + 14;
        ctx.fillStyle = b.glowColor + "18";
        ctx.fillRect(tx, ty - 12, tw, 18);
        ctx.fillStyle = b.glowColor + "cc";
        ctx.font = "9px 'Share Tech Mono', monospace";
        ctx.fillText(t, tx + 7, ty);
        tx += tw + 6;
      });
    }

    // Press E hint at bottom
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("PRESS  E  TO VIEW FULL STORY", W / 2, H - 14);

    const tex = new THREE.CanvasTexture(can);
    const panelGeo = new THREE.PlaneGeometry(10, 7.5);
    const panelMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    worldPanel = new THREE.Mesh(panelGeo, panelMat);

    // Position: face toward car from the building's side, at mid-height
    const ang = Math.atan2(carX - b.pos[0], carZ - b.pos[1]);
    const dist = Math.max(b.size[0], b.size[1]) * 0.5 + 7;
    worldPanel.position.set(
      b.pos[0] + Math.sin(ang) * dist,
      (b.height || 12) * 0.5,
      b.pos[1] + Math.cos(ang) * dist,
    );
    worldPanel.rotation.y = ang;
    worldPanel.position.y = 0; // start at ground, rises up
    worldPanel.userData.targetY = (b.height || 12) * 0.5;

    // Glow ring at base of panel
    const ringMat = new THREE.MeshBasicMaterial({
      color: gc,
      transparent: true,
      opacity: 0,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5.5, 0.08, 4, 28),
      ringMat,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(worldPanel.position);
    ring.position.y = 0.1;
    ring.userData.isPanelRing = true;

    // Vertical energy beam connecting building to panel
    const beamGeo = new THREE.BoxGeometry(0.06, (b.height || 12) * 0.5, 0.06);
    const beamMat = new THREE.MeshBasicMaterial({
      color: gc,
      transparent: true,
      opacity: 0,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(
      worldPanel.position.x,
      (b.height || 12) * 0.25,
      worldPanel.position.z,
    );
    beam.userData.isPanelBeam = true;

    worldPanelGroup.add(worldPanel);
    worldPanelGroup.add(ring);
    worldPanelGroup.add(beam);
    scene.add(worldPanelGroup);

    worldPanelT = 0;
    worldPanelOpen = true;
  }

  function updateWorldPanel(now, dt) {
    if (!worldPanel || !worldPanelOpen) return;
    const b = worldPanelBuilding;
    if (!b) return;

    worldPanelT = Math.min(1, worldPanelT + dt * 0.9); // 1.1s rise
    const ease =
      worldPanelT < 0.5
        ? 2 * worldPanelT * worldPanelT
        : 1 - Math.pow(-2 * worldPanelT + 2, 2) / 2;

    const targetY = b ? (b.height || 12) * 0.5 : 6;
    worldPanel.position.y = ease * targetY;

    // Panel opacity
    const targetOp =
      worldPanelT > 0.2 ? Math.min(0.96, (worldPanelT - 0.2) / 0.4) : 0;
    worldPanel.material.opacity +=
      (targetOp - worldPanel.material.opacity) * 0.1;

    // Panel always faces the car
    const dx = carX - worldPanel.position.x;
    const dz = carZ - worldPanel.position.z;
    worldPanel.rotation.y = Math.atan2(dx, dz);

    // Animate ring and beam
    worldPanelGroup.children.forEach((c) => {
      if (c.userData.isPanelRing) {
        c.material.opacity = ease * 0.5 + Math.sin(now * 3) * 0.1 * ease;
        const s = 1 + Math.sin(now * 1.5) * 0.04;
        c.scale.setScalar(s);
      }
      if (c.userData.isPanelBeam) {
        c.material.opacity = ease * 0.6;
        // Shimmer
        c.material.color.setHSL(0.1 + Math.sin(now * 4) * 0.05, 1, 0.6);
      }
    });
  }

  function closeWorldPanel() {
    if (!worldPanel) return;
    worldPanelOpen = false;
    // Fade out
    let t = 1.0;
    const iv = setInterval(() => {
      t -= 0.06;
      if (worldPanel) {
        worldPanel.material.opacity = Math.max(0, t);
        worldPanel.position.y = Math.max(0, worldPanel.position.y - 0.3);
        worldPanelGroup.children.forEach((c) => {
          if (c.material && c !== worldPanel)
            c.material.opacity = Math.max(0, t * 0.5);
        });
      }
      if (t <= 0) {
        clearInterval(iv);
        if (worldPanelGroup) {
          scene.remove(worldPanelGroup);
          worldPanelGroup = null;
          worldPanel = null;
        }
      }
    }, 20);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // P3: YATRA PATH SHIMMER — animated particles flowing along the tube
  // ─────────────────────────────────────────────────────────────────────────
  function buildYatraFlowParticles(curve) {
    if (!curve || IS_MOBILE) return;
    const N = 60;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    yatraFlowT = Array.from({ length: N }, () => Math.random());

    for (let i = 0; i < N; i++) {
      const pt = curve.getPoint(yatraFlowT[i]);
      pos[i * 3] = pt.x;
      pos[i * 3 + 1] = pt.y + 0.3;
      pos[i * 3 + 2] = pt.z;
      // Gold to white shimmer
      const t = Math.random();
      col[i * 3] = 1;
      col[i * 3 + 1] = 0.85 + t * 0.15;
      col[i * 3 + 2] = t * 0.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    yatraFlowParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.22,
        vertexColors: true,
        transparent: true,
        opacity: 0.0,
        sizeAttenuation: true,
      }),
    );
    yatraFlowPositions = pos;
    scene.add(yatraFlowParticles);
  }

  function updateYatraFlow(dt, yatraCurve) {
    if (!yatraFlowParticles || !yatraCurve) return;
    const visible = NARRATIVE.yatraVisible;
    const targetOp = visible ? 0.85 : 0;
    yatraFlowParticles.material.opacity +=
      (targetOp - yatraFlowParticles.material.opacity) * 0.05;

    if (!visible || yatraFlowParticles.material.opacity < 0.01) return;

    const N = yatraFlowT.length;
    const speed = 0.025; // flow speed along curve
    for (let i = 0; i < N; i++) {
      yatraFlowT[i] = (yatraFlowT[i] + speed * dt + (i / N) * 0.001) % 1.0;
      const pt = yatraCurve.getPoint(yatraFlowT[i]);
      yatraFlowPositions[i * 3] = pt.x;
      yatraFlowPositions[i * 3 + 1] =
        pt.y + 0.35 + Math.sin(yatraFlowT[i] * Math.PI * 8) * 0.15;
      yatraFlowPositions[i * 3 + 2] = pt.z;
    }
    yatraFlowParticles.geometry.attributes.position.needsUpdate = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // P4: TEMPLE COMPLETION CELEBRATION
  // ─────────────────────────────────────────────────────────────────────────
  function triggerCompletion() {
    if (completionFired) return;
    completionFired = true;

    // 1. Large confetti burst from central island
    spawnConfetti(0, 0, 0xffcc44);
    spawnConfetti(0, 0, 0x00ddff);
    setTimeout(() => spawnConfetti(2, 2, 0xff88aa), 300);
    setTimeout(() => spawnConfetti(-2, 2, 0x7dff4f), 600);

    // 2. Three expanding gold rings from center
    [3, 5, 7].forEach((startR, i) => {
      setTimeout(() => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffcc44,
          transparent: true,
          opacity: 0.8,
        });
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(startR, 0.15, 4, 32),
          mat,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.2;
        ring.userData.isCompletionRing = true;
        ring.userData.t = 0;
        ring.userData.speed = 0.012;
        scene.add(ring);
        completionRings.push(ring);
      }, i * 400);
    });

    // 3. World-space "CITY MASTERED" text sprite
    const W = 640,
      H = 128;
    const can = document.createElement("canvas");
    can.width = W;
    can.height = H;
    const ctx = can.getContext("2d");
    ctx.fillStyle = "rgba(8,4,1,0.92)";
    if (ctx.roundRect) ctx.roundRect(0, 0, W, H, 10);
    else ctx.rect(0, 0, W, H);
    ctx.fill();
    ctx.strokeStyle = "#ffcc44aa";
    ctx.lineWidth = 2;
    if (ctx.roundRect) ctx.roundRect(2, 2, W - 4, H - 4, 8);
    else ctx.rect(2, 2, W - 4, H - 4);
    ctx.stroke();
    ctx.fillStyle = "#ffcc44";
    ctx.font = "bold 44px 'Barlow Condensed', sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "#ffcc44";
    ctx.shadowBlur = 20;
    ctx.fillText("◈  CITY MASTERED  ◈", W / 2, 52);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.letterSpacing = "4px";
    ctx.fillText(
      "ALL 12 TEMPLES VISITED · ADITYA SRIVASTAVA · BACKEND ARCHITECT",
      W / 2,
      82,
    );
    ctx.fillStyle = "rgba(255,200,80,0.25)";
    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.fillText("4 YEARS · TRILASOFT SOLUTIONS · NOIDA", W / 2, 108);

    const tex = new THREE.CanvasTexture(can);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      }),
    );
    sp.scale.set(20, 4, 1);
    sp.position.set(0, 18, 0);
    sp.userData.isMasterText = true;
    scene.add(sp);

    // Fade in, hold, fade out
    let op = 0,
      phase = "in",
      held = 0;
    const iv = setInterval(() => {
      if (phase === "in") {
        op = Math.min(1, op + 0.04);
        sp.material.opacity = op;
        if (op >= 1) {
          phase = "hold";
        }
      } else if (phase === "hold") {
        held += 16;
        if (held > 5000) phase = "out";
      } else {
        op = Math.max(0, op - 0.02);
        sp.material.opacity = op;
        if (op <= 0) {
          clearInterval(iv);
          scene.remove(sp);
        }
      }
    }, 16);

    // 4. Audio celebration swell
    playCinematicSwell(6.0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hook: call after every building visit to check completion
  // ─────────────────────────────────────────────────────────────────────────
  function checkCompletion() {
    const total = window.CITY_DATA?.buildings?.length || 12;
    const visited =
      document.querySelectorAll(".jb-dot.visited").length ||
      (window.CITY_DATA?.buildings || []).filter((b) =>
        document.getElementById("dot-" + b.id)?.classList.contains("visited"),
      ).length;
    if (visited >= total && !completionFired) triggerCompletion();
  }

  // ── INIT ──────────────────────────────────────────────────────────────────
  function progress(pct, msg) {
    if (typeof window.onCityProgress === "function")
      window.onCityProgress(pct, msg);
  }

  function init(canvas) {
    const W = window.innerWidth,
      H = window.innerHeight;

    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 600);
    camera.position.set(0, 55, 70);
    camera.lookAt(0, 2, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    // ── NO GPU SHADOW MAPS — replaced by fake blob shadows (Bruno Simon style)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.15; // safe — preserves all temple colors
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    // Kick renderer once to avoid white flash
    renderer.render(new THREE.Scene(), camera);

    initMatcaps();
    progress(5, "MATCAP SYSTEM READY");

    // ── DEFERRED BUILD — car visible almost immediately, world fills in ─────
    const buildSteps = [
      () => {
        applyWeather("day");
        buildGround();
        buildCar();
        buildPlayerPresence();
        progress(15, "LOADING WORLD…");
      },
      () => {
        buildRoads();
        buildCenterpiece();
        build3DName();
        buildPhilosophyStone();
        progress(28, "TEMPLE CITY RISING…");
      },
      () => {
        buildAllBuildings();
        initBuildingEntities();
        progress(48, "12 TEMPLES AWAKENED");
      },
      () => {
        buildTrees();
        buildGrassPatches();
        buildLamps();
        addWindSway();
        progress(60, "DISTRICT FLORA");
      },
      () => {
        buildStambha();
        buildFormalGardens();
        buildBirdFlock();
        buildDivineParticles();
        buildRoadEnergyFlow();
        progress(70, "SACRED DETAILS");
      },
      () => {
        buildCheckpoints();
        buildAtmosphere();
        buildWaveLines();
        buildRoadShimmerLines();
        buildPrayerFlags();
        buildSignPosts();
        buildGatewayArches();
        buildShortcutSign();
        buildPranaAura();
        progress(82, "SACRED ENERGY FLOWS");
      },
      () => {
        buildWorldLabels();
        buildInfoBoards();
        buildZoneAmbients();
        buildCareerTimeline();
        buildNightSky();
        addNightGroundDetails();
        buildGroundShimmers();
        addTempleEmissiveAccents();
        progress(95, "ORACLES AWAKENING");
      },
      () => {
        setupControls();
        window.addEventListener("resize", onResize);
        setTimeout(() => checkProximity(), 300);
        setTimeout(() => {
          initDistrictAudio();
          initSpatialAudio();
        }, 2000);
        animate();
        progress(100, "CITY LIVE — CLICK TO START");
      },
    ];

    let step = 0;
    function runNext() {
      if (step < buildSteps.length) {
        buildSteps[step++]();
        setTimeout(runNext, 18);
      }
    }
    runNext();
  }

  // ── MATCAP TEXTURES ───────────────────────────────────────────────────────
  // Each matcap is a canvas-painted sphere texture: highlight, midtone, shadow
  function createMatcap(highlight, midtone, shadow, specular) {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    // Base gradient — shadow → midtone → highlight
    const g1 = ctx.createLinearGradient(0, S, 0, 0);
    g1.addColorStop(0, shadow);
    g1.addColorStop(0.4, midtone);
    g1.addColorStop(1, highlight);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, S, S);
    // Specular glint (top-left)
    const g2 = ctx.createRadialGradient(
      S * 0.3,
      S * 0.25,
      0,
      S * 0.45,
      S * 0.45,
      S * 0.5,
    );
    g2.addColorStop(0, specular || "rgba(255,255,255,0.88)");
    g2.addColorStop(0.22, "rgba(255,255,255,0.22)");
    g2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, S, S);
    // Cool rim light (bottom-right — Bruno Simon style)
    const g3 = ctx.createRadialGradient(
      S * 0.78,
      S * 0.8,
      0,
      S * 0.7,
      S * 0.72,
      S * 0.32,
    );
    g3.addColorStop(0, "rgba(80,130,255,0.38)");
    g3.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    return new THREE.CanvasTexture(c);
  }

  function initMatcaps() {
    // ── 3-STEP TOON GRADIENT MAP (critical for MeshToonMaterial in r128) ─────
    // Without gradientMap, MeshToonMaterial = MeshLambertMaterial (smooth shading)
    // With it, you get hard cel-shaded steps like the Firefly reference
    const gc = document.createElement("canvas");
    gc.width = 4;
    gc.height = 1;
    const gx = gc.getContext("2d");
    ["#110800", "#664422", "#ddaa66", "#fff8ee"].forEach((c, i) => {
      gx.fillStyle = c;
      gx.fillRect(i, 0, 1, 1);
    });
    const toonGrad = new THREE.CanvasTexture(gc);
    toonGrad.magFilter = THREE.NearestFilter;
    toonGrad.minFilter = THREE.NearestFilter;
    window._toonGrad = toonGrad; // shared across all MeshToonMaterial calls

    matcaps.warm = createMatcap("#ffeecc", "#ddaa66", "#774422"); // warm sandstone
    matcaps.cool = createMatcap("#ddeeff", "#6699cc", "#224466"); // cool marble
    matcaps.stone = createMatcap("#ffffff", "#f5e0c0", "#cc9966"); // WHITE MARBLE — like Akshardham
    matcaps.gold = createMatcap("#ffe566", "#ddaa00", "#553300"); // burnished gold
    matcaps.green = createMatcap("#88dd44", "#336622", "#0a1a04"); // deep tropical green
    matcaps.purple = createMatcap("#ffddff", "#dd99ff", "#663388"); // pale violet
    matcaps.car = createMatcap(
      "#ff9977",
      "#dd2200",
      "#440000",
      "rgba(255,230,220,0.95)",
    );
    matcaps.carDark = createMatcap("#ee5533", "#991100", "#220000");
    matcaps.chrome = createMatcap("#ffffee", "#ccccaa", "#444433"); // polished metal
    matcaps.glass = createMatcap("#99ccff", "#3366aa", "#001133");
    matcaps.tyre = createMatcap("#333222", "#151210", "#050404");
    matcaps.tree = createMatcap("#77cc44", "#336622", "#0a1a04"); // deep green foliage
    matcaps.dark = createMatcap("#443322", "#221108", "#080402");
  }

  // ── BLOB SHADOW ───────────────────────────────────────────────────────────
  // Per-building fake shadow plane — no GPU shadow maps needed
  function addBlobShadow(b, group) {
    const w = b.size[0] * 0.8;
    const d = b.size[1] * 0.72;
    const gc = pc(b.glowColor);
    // Shadow tinted subtly with building's glow color (subliminal district feeling)
    const rr = ((gc >> 16) & 0xff) / 255;
    const gg = ((gc >> 8) & 0xff) / 255;
    const bb2 = (gc & 0xff) / 255;

    const shadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(
        rr * 0.07 + 0.01,
        gg * 0.05 + 0.005,
        bb2 * 0.09 + 0.008,
      ),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 18), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(w, d, 1);
    shadow.position.y = 0.025;
    group.add(shadow);
    blobShadows.push({ mesh: shadow, building: b, baseMat: shadowMat });
  }

  // ── WORLD-SPACE BILLBOARD LABELS ──────────────────────────────────────────
  // Float above buildings when you're in range — billboard always faces camera
  function buildWorldLabels() {
    // Firefly-style blue speech bubble tooltips that appear as you approach
    window.CITY_DATA.buildings.forEach((b) => {
      const W = 320,
        H = 110;
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");

      // ── SPEECH BUBBLE BACKGROUND (matches the Firefly video exactly) ────
      const BG = "rgba(22, 55, 88, 0.94)"; // deep blue like the video tooltips
      const BORDER = "#44aaff";

      // Rounded rectangle body
      ctx.fillStyle = BG;
      ctx.shadowColor = "#3399ff";
      ctx.shadowBlur = 12;
      if (ctx.roundRect) ctx.roundRect(3, 3, W - 6, H - 22, 10);
      else ctx.rect(3, 3, W - 6, H - 22);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 2;
      if (ctx.roundRect) ctx.roundRect(3, 3, W - 6, H - 22, 10);
      else ctx.rect(3, 3, W - 6, H - 22);
      ctx.stroke();

      // Speech bubble pointer triangle at bottom
      ctx.fillStyle = BG;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 10, H - 22);
      ctx.lineTo(W / 2 + 10, H - 22);
      ctx.lineTo(W / 2, H - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 10, H - 22);
      ctx.lineTo(W / 2, H - 2);
      ctx.lineTo(W / 2 + 10, H - 22);
      ctx.stroke();

      // Top left icon (temple type symbol)
      const icons = {
        gopuram: "🏛",
        shikhara: "⛩",
        mandapa: "🏗",
        stupa: "🔵",
      };
      const icon = icons[b.templeType] || "◈";
      ctx.font = "16px serif";
      ctx.fillText(icon, 10, 25);

      // Building name — white, prominent
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 19px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      ctx.fillText(b.name, 34, 26);

      // Subtitle in light blue
      ctx.fillStyle = "#88ccff";
      ctx.font = "11px 'Share Tech Mono', monospace";
      const sub = (b.subtitle || b.tag || "").substring(0, 32);
      ctx.fillText(sub, 10, 48);

      // Status + key metric
      const statusColor =
        b.status === "OPERATIONAL"
          ? "#44ff88"
          : b.status === "ACTIVE"
            ? "#ffcc44"
            : b.status === "COMPLETED"
              ? "#aa88ff"
              : "#aaaaaa";
      ctx.fillStyle = statusColor;
      ctx.font = "bold 10px 'Share Tech Mono', monospace";
      ctx.fillText("● " + (b.status || "ACTIVE"), 10, 68);

      // Key metric value on the right
      if (b.metrics && b.metrics[0]) {
        ctx.fillStyle = "#ffe088";
        ctx.font = "bold 17px 'Barlow Condensed', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(b.metrics[0].v + " " + b.metrics[0].l, W - 12, 68);
        ctx.textAlign = "left";
      }

      // Tech tags row
      if (b.tech && b.tech.length) {
        const tags = b.tech.slice(0, 3).join("  ·  ");
        ctx.fillStyle = "rgba(136,204,255,0.55)";
        ctx.font = "9px 'Share Tech Mono', monospace";
        ctx.fillText(tags, 10, 84);
      }

      const tex = new THREE.CanvasTexture(can);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(11, 3.85, 1);
      const bh = (b.height || 12) + 7.5;
      sprite.position.set(b.pos[0], bh, b.pos[1]);
      sprite.userData.building = b;
      sprite.userData.baseY = bh;
      scene.add(sprite);
      worldLabels.push(sprite);
    });
  }

  // ── ZONE AMBIENT POINT LIGHTS ─────────────────────────────────────────────
  // Each district gets a soft colored point light that colors the ground
  // ── P2: IN-WORLD INFORMATION BOARDS ──────────────────────────────────────
  // 3D billboard boards inside each temple compound showing system info
  // Only visible when within 20 units — give context before entering

  function buildInfoBoards() {
    window.CITY_DATA.buildings.forEach((b) => {
      const gc = b.glowColor;
      const hexCol = gc;

      // ── Board canvas — rich information panel ─────────────────────────
      const BW = 480,
        BH = 280;
      const can = document.createElement("canvas");
      can.width = BW;
      can.height = BH;
      const ctx = can.getContext("2d");

      // Background with subtle gradient
      const grd = ctx.createLinearGradient(0, 0, 0, BH);
      grd.addColorStop(0, "rgba(8,4,2,0.97)");
      grd.addColorStop(1, "rgba(20,10,4,0.97)");
      ctx.fillStyle = grd;
      if (ctx.roundRect) ctx.roundRect(4, 4, BW - 8, BH - 8, 12);
      else ctx.rect(4, 4, BW - 8, BH - 8);
      ctx.fill();

      // Glowing border
      ctx.strokeStyle = hexCol;
      ctx.lineWidth = 3;
      ctx.shadowColor = hexCol;
      ctx.shadowBlur = 14;
      if (ctx.roundRect) ctx.roundRect(4, 4, BW - 8, BH - 8, 12);
      else ctx.rect(4, 4, BW - 8, BH - 8);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top accent bar
      ctx.fillStyle = hexCol + "44";
      ctx.fillRect(4, 4, BW - 8, 40);
      ctx.fillStyle = hexCol;
      ctx.fillRect(4, 4, BW - 8, 4);

      // Temple type + status on top bar
      const icon =
        { gopuram: "🏛", shikhara: "⛩", mandapa: "🏗", stupa: "🔵" }[
          b.templeType
        ] || "◈";
      ctx.font = "14px serif";
      ctx.fillText(icon, 16, 32);
      ctx.fillStyle = hexCol;
      ctx.font = "bold 14px 'Share Tech Mono', monospace";
      ctx.fillText(
        (b.templeType || "TEMPLE").toUpperCase() + "  ·  " + (b.year || ""),
        40,
        33,
      );

      // Status dot + label top-right
      const dotCol =
        b.status === "OPERATIONAL"
          ? "#44ff88"
          : b.status === "ACTIVE"
            ? "#ffcc44"
            : "#aa88ff";
      ctx.fillStyle = dotCol;
      ctx.beginPath();
      ctx.arc(BW - 22, 24, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dotCol;
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(b.status || "ACTIVE", BW - 35, 28);
      ctx.textAlign = "left";

      // Building name — large
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = hexCol;
      ctx.shadowBlur = 6;
      ctx.font = "bold 34px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      ctx.fillText(b.name, 16, 86);
      ctx.shadowBlur = 0;

      // Subtitle
      ctx.fillStyle = hexCol + "cc";
      ctx.font = "13px 'Share Tech Mono', monospace";
      ctx.fillText(b.subtitle || "", 16, 108);

      // Divider line
      ctx.strokeStyle = hexCol + "44";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, 118);
      ctx.lineTo(BW - 16, 118);
      ctx.stroke();

      // Story excerpt (first 120 chars)
      const raw = (b.story || "").replace(/<[^>]+>/g, "").replace(/\n/g, " ");
      const excerpt = raw.length > 140 ? raw.slice(0, 138) + "…" : raw;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "13px 'Barlow', 'Arial', sans-serif";
      // Word wrap
      const words = excerpt.split(" ");
      let line = "",
        lineY = 140;
      words.forEach((w) => {
        const test = line + w + " ";
        if (ctx.measureText(test).width > BW - 32 && line) {
          ctx.fillText(line.trim(), 16, lineY);
          line = w + " ";
          lineY += 18;
        } else {
          line = test;
        }
        if (lineY > 188) return;
      });
      if (lineY <= 188) ctx.fillText(line.trim(), 16, lineY);

      // Metrics row
      const mY = 220;
      ctx.strokeStyle = hexCol + "33";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, mY - 8);
      ctx.lineTo(BW - 16, mY - 8);
      ctx.stroke();
      (b.metrics || []).slice(0, 3).forEach((m, i) => {
        const mx = 16 + i * 152;
        ctx.fillStyle = hexCol;
        ctx.font = "bold 24px 'Barlow Condensed', 'Arial Narrow', sans-serif";
        ctx.fillText(m.v, mx, mY + 16);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "10px 'Share Tech Mono', monospace";
        ctx.fillText(m.l, mx, mY + 32);
      });

      // Bottom tech tags
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "10px 'Share Tech Mono', monospace";
      const tags = (b.tech || []).slice(0, 5).join("  ·  ");
      ctx.fillText(tags, 16, BH - 16);

      // "Press E to enter" hint
      ctx.fillStyle = hexCol + "88";
      ctx.font = "bold 11px 'Share Tech Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText("[ E ]  ENTER TEMPLE", BW - 16, BH - 16);
      ctx.textAlign = "left";

      const tex = new THREE.CanvasTexture(can);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(14, 8.2, 1);

      // Position board to the side of the building facing the road
      const side = b.facing === "left" || b.pos[0] < 0 ? 1 : -1;
      const bx = b.pos[0] + side * (b.size[0] / 2 + 5);
      const bz = b.pos[1];
      const boardH = (b.height || 12) * 0.55 + 3;
      sprite.position.set(bx, boardH, bz);
      sprite.userData.building = b;
      sprite.userData.baseY = boardH;
      sprite.userData.isInfoBoard = true;
      scene.add(sprite);
      infoBoardSprites.push(sprite);
    });
  }

  function buildZoneAmbients() {
    const zones = [
      { pos: [-32, -24], color: 0x0088cc, intensity: 0.45, dist: 32 },
      { pos: [32, -24], color: 0x33aa22, intensity: 0.42, dist: 32 },
      { pos: [68, -8], color: 0x0066aa, intensity: 0.35, dist: 28 },
      { pos: [68, 28], color: 0x22aa44, intensity: 0.32, dist: 26 },
      { pos: [-68, -8], color: 0xaa8800, intensity: 0.38, dist: 28 },
      { pos: [-68, 28], color: 0xcc5500, intensity: 0.35, dist: 26 },
      { pos: [-32, 24], color: 0xcc5500, intensity: 0.32, dist: 24 },
      { pos: [32, 24], color: 0x8833cc, intensity: 0.32, dist: 24 },
      { pos: [32, 58], color: 0x3388cc, intensity: 0.3, dist: 24 },
      { pos: [-32, 58], color: 0xcc7722, intensity: 0.3, dist: 24 },
      { pos: [-22, -72], color: 0x7744cc, intensity: 0.35, dist: 26 },
      { pos: [22, -72], color: 0x22aa77, intensity: 0.35, dist: 26 },
    ];
    zones.forEach(({ pos, color, intensity, dist }) => {
      const light = new THREE.PointLight(
        color,
        isNight ? intensity : intensity * 0.2,
        dist,
      );
      light.position.set(pos[0], 1.5, pos[1]);
      light.userData.nightI = intensity;
      scene.add(light);
      zoneAmbients.push(light);
    });
  }

  // ── WEATHER SYSTEM ────────────────────────────────────────────────────────
  function applyWeather(w) {
    currentWeather = w;
    if (weatherParticles) {
      scene.remove(weatherParticles);
      weatherParticles = null;
    }

    // BRUNO SIMON LIGHTING RECIPE:
    // Key light: warm peach/salmon from top-right  → lights top faces warm
    // Fill light: cool blue from bottom-left       → shadows go cool/purple
    // Ambient: very LOW (0.3-0.5) so depth is real
    // This creates the beautiful warm-top / cool-shadow diorama look
    const weathers = {
      night: {
        bg: 0x0a0820, // deep indigo night sky — magical temple night
        fog: 0x0a0820,
        fogD: 0.003,
        sun: 0x6688cc, // cool moonlight from above
        sunI: 0.8,
        fill: 0x220844, // deep purple fill
        fillI: 0.5,
        amb: 0x110822, // very dim ambient — diyas + arch glows provide light
        ambI: 0.15,
        exp: 1.25,
      },
      day: {
        bg: 0xeabb88, // richer golden sky — more cinematic
        fog: 0xf0c898,
        fogD: 0.0018, // light atmospheric haze — adds depth without blocking
        sun: 0xffe088, // warm golden east light
        sunI: 3.8, // bright golden hour
        fill: 0x8866cc, // cool purple twilight from west
        fillI: 0.75,
        amb: 0xffcc77, // warm golden ambient
        ambI: 0.65,
        exp: 1.08,
      },
      sunset: {
        bg: 0xff6030,
        fog: 0xff6030,
        fogD: 0.005,
        sun: 0xff4411,
        sunI: 2.8,
        fill: 0x5522bb,
        fillI: 1.1,
        amb: 0x440800,
        ambI: 0.25,
        exp: 1.08,
      },
      fog: {
        bg: 0xccb09a,
        fog: 0xccb09a,
        fogD: 0.024,
        sun: 0xffddbb,
        sunI: 0.9,
        fill: 0x446688,
        fillI: 0.5,
        amb: 0x221408,
        ambI: 0.6,
        exp: 0.9,
      },
      rain: {
        bg: 0x334050,
        fog: 0x334050,
        fogD: 0.013,
        sun: 0xdd9977,
        sunI: 0.8,
        fill: 0x2244aa,
        fillI: 1.1,
        amb: 0x100806,
        ambI: 0.3,
        exp: 1.1,
      },
      snow: {
        bg: 0xeedfcc,
        fog: 0xeedfcc,
        fogD: 0.006,
        sun: 0xfff0e0,
        sunI: 1.8,
        fill: 0x7799cc,
        fillI: 0.5,
        amb: 0x1a1008,
        ambI: 0.4,
        exp: 0.95,
      },
    };
    const cfg = weathers[w] || weathers.night;

    scene.background = new THREE.Color(cfg.bg);
    scene.fog = new THREE.FogExp2(cfg.fog, cfg.fogD);

    if (sunLight) {
      sunLight.color.set(cfg.sun);
      sunLight.intensity = cfg.sunI;
    }
    if (fillLight) {
      fillLight.color.set(cfg.fill);
      fillLight.intensity = cfg.fillI;
    }
    if (ambLight) {
      ambLight.color.set(cfg.amb);
      ambLight.intensity = cfg.ambI;
    }
    // Hemisphere: sky warm, ground cool — tune per weather
    if (hemiLight) {
      const hemiConfigs = {
        day: { sky: 0xffcc88, gnd: 0x9966cc, i: 1.4 },
        night: { sky: 0x1a1844, gnd: 0x080412, i: 0.4 },
        sunset: { sky: 0xff6622, gnd: 0x5522bb, i: 1.2 },
        fog: { sky: 0xddbbaa, gnd: 0x776655, i: 0.9 },
        rain: { sky: 0x445566, gnd: 0x223344, i: 0.7 },
        snow: { sky: 0xeeddcc, gnd: 0x7799cc, i: 1.0 },
      };
      const hc = hemiConfigs[w] || hemiConfigs.day;
      hemiLight.color.set(hc.sky);
      hemiLight.groundColor.set(hc.gnd);
      hemiLight.intensity = hc.i;
    }
    if (renderer) renderer.toneMappingExposure = cfg.exp;

    isNight = w === "night";
    updateCarLights();
    updateWindowLights();

    // ── WEATHER GRIP — affects car physics (rain/snow = slide) ───────────
    const gripMap = {
      night: 1.0,
      day: 1.0,
      sunset: 1.0,
      fog: 0.72,
      rain: 0.3,
      snow: 0.12,
    };
    weatherGrip = gripMap[w] ?? 1.0;

    // ── ZONE AMBIENT INTENSITIES — dimmer in bright weather ──────────────
    zoneAmbients.forEach((l) => {
      l.intensity = isNight
        ? l.userData.nightI || 0.35
        : (l.userData.nightI || 0.35) * 0.25;
    });

    if (w === "rain") buildRainParticles();
    if (w === "snow") buildSnowParticles();

    // Tell UI
    if (window.CityUI) window.CityUI.onWeatherChange(w);
  }

  function cycleWeather() {
    const idx = weatherCycle.indexOf(currentWeather);
    applyWeather(weatherCycle[(idx + 1) % weatherCycle.length]);
  }

  function buildRainParticles() {
    const cnt = 2000;
    const pos = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    weatherParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xaabbcc,
        size: 0.1,
        transparent: true,
        opacity: 0.6,
      }),
    );
    weatherParticlePositions = pos;
    scene.add(weatherParticles);
  }

  function buildSnowParticles() {
    const cnt = 1200;
    const pos = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    weatherParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xeeeeff,
        size: 0.18,
        transparent: true,
        opacity: 0.85,
      }),
    );
    weatherParticlePositions = pos;
    scene.add(weatherParticles);
  }

  function updateWeatherParticles() {
    if (!weatherParticles || !weatherParticlePositions) return;
    const pos = weatherParticlePositions;
    const cnt = pos.length / 3;
    const isRain = currentWeather === "rain";
    for (let i = 0; i < cnt; i++) {
      pos[i * 3 + 1] -= isRain ? 0.38 : 0.08;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 28 + Math.random() * 4;
    }
    weatherParticles.geometry.attributes.position.needsUpdate = true;
  }

  // ── LIGHTING ─────────────────────────────────────────────────────────────
  function buildLightingObjects() {
    // Cinematic three-point lighting with dramatic contrast

    // Hemisphere: warm golden zenith, deep violet nadir — sky/ground gradient
    hemiLight = new THREE.HemisphereLight(0xffe8aa, 0x7755aa, 1.2);
    scene.add(hemiLight);

    // Key light: high noon-angle strong sun — crisp hard shadows
    sunLight = new THREE.DirectionalLight(0xffe8aa, 4.2);
    sunLight.position.set(55, 95, 25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 350;
    sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -130;
    sunLight.shadow.camera.right = sunLight.shadow.camera.top = 130;
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    // Rim light from opposite: cool violet-blue — god-ray bounce from west
    fillLight = new THREE.DirectionalLight(0x8866cc, 0.4);
    fillLight.position.set(-70, 40, -30);
    scene.add(fillLight);

    // Warm ambient keeps shadows from going fully black
    ambLight = new THREE.AmbientLight(0xffcc88, 0.55);
    scene.add(ambLight);
  }

  // ── GROUND ───────────────────────────────────────────────────────────────
  function buildGround() {
    buildLightingObjects();

    // ── BASE GROUND — warm sandy peach like Bruno Simon ──
    const grassMat = new THREE.MeshLambertMaterial({ color: P.ground });
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(400, 0.4, 400),
      grassMat,
    );
    grass.position.y = -0.2;
    grass.receiveShadow = true;
    scene.add(grass);

    // NO GRID — Bruno Simon has none. Just subtle tile joints via thin lines.
    // City pavement blocks (warm sandstone, slightly different from ground)
    const paveMat = new THREE.MeshLambertMaterial({ color: P.sidewalk });
    const blocks = [
      [-14, 0, 16, 20],
      [14, 0, 16, 20],
      [-14, -18, 16, 16],
      [14, -18, 16, 16],
      [28, 8, 14, 22],
      [-28, 8, 14, 22],
      [-28, -10, 14, 12],
      [28, -10, 14, 12],
      [-8, -36, 16, 14],
      [8, -36, 16, 14],
      [-8, 26, 14, 10],
      [8, 26, 14, 10],
    ];
    blocks.forEach(([x, z, w, d]) => {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), paveMat);
      blk.position.set(x, 0.14, z);
      blk.receiveShadow = true;
      scene.add(blk);
    });

    // ── WATER — bright teal like Bruno Simon ──
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x44aacc });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    scene.add(water);

    // Shore — slightly lighter
    const shoreMat = new THREE.MeshLambertMaterial({
      color: 0x66bbdd,
      transparent: true,
      opacity: 0.7,
    });
    [
      // Left shore
      { x: -70, z: 0, w: 60, d: 160 },
      // Right shore
      { x: 70, z: 0, w: 60, d: 160 },
      // Top shore
      { x: 0, z: -70, w: 160, d: 60 },
      // Bottom shore
      { x: 0, z: 70, w: 160, d: 60 },
    ].forEach((s) => {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), shoreMat);
      sm.rotation.x = -Math.PI / 2;
      sm.position.set(s.x, -0.3, s.z);
      scene.add(sm);
    });

    // Crosswalk stripes at major intersections
    const crossMat = new THREE.MeshLambertMaterial({ color: 0xddccbb });
    [
      [0, 0],
      [0, 22],
      [30, 0],
      [-30, 0],
      [0, -33],
    ].forEach(([x, z]) => {
      for (let i = -2; i <= 2; i++) {
        const s1 = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.01, 4),
          crossMat,
        );
        s1.position.set(x + i * 1.4, 0.28, z + 7);
        scene.add(s1);
        const s2 = new THREE.Mesh(
          new THREE.BoxGeometry(4, 0.01, 0.5),
          crossMat,
        );
        s2.position.set(x + 7, 0.28, z + i * 1.4);
        scene.add(s2);
      }
    });
  }

  // ── ROADS ────────────────────────────────────────────────────────────────
  function buildRoads() {
    // Deep terracotta paving matching the Firefly reference
    const roadMat = new THREE.MeshLambertMaterial({ color: 0xaa5533 }); // brick-red road
    const swMat = new THREE.MeshLambertMaterial({ color: 0xcc7755 }); // warm terracotta plaza
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xffe066 }); // golden dashes
    const waterChannelMat = new THREE.MeshLambertMaterial({ color: 0x2288bb }); // bright blue channels

    function road(x1, z1, x2, z2, w) {
      const dx = x2 - x1,
        dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const ang = Math.atan2(dx, dz);

      // Wide sandstone plaza border
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(w + 5.0, 0.22, len),
        swMat,
      );
      sw.rotation.y = ang;
      sw.position.set((x1 + x2) / 2, 0.11, (z1 + z2) / 2);
      scene.add(sw);

      // Road surface
      const rd = new THREE.Mesh(new THREE.BoxGeometry(w, 0.23, len), roadMat);
      rd.rotation.y = ang;
      rd.position.set((x1 + x2) / 2, 0.12, (z1 + z2) / 2);
      scene.add(rd);

      // Dashed center line
      const segs = Math.floor(len / 5.0);
      for (let s = 0; s < segs; s++) {
        const t = (s + 0.5) / segs;
        const dl = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.01, 1.8),
          lineMat,
        );
        dl.rotation.y = ang;
        dl.position.set(x1 + dx * t, 0.24, z1 + dz * t);
        scene.add(dl);
      }

      // Water channels alongside the road (like the blue channels in the video)
      // Only add to main horizontal/vertical arteries, not every road
    }

    // Helper: add blue water channel alongside a road
    function waterChannel(x1, z1, x2, z2, side) {
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.sqrt(dx * dx + dz * dz),
        ang = Math.atan2(dx, dz);
      const perpX = Math.cos(ang) * side,
        perpZ = -Math.sin(ang) * side;
      const offset = 8.5;
      const chan = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.35, len),
        waterChannelMat,
      );
      chan.rotation.y = ang;
      chan.position.set(
        (x1 + x2) / 2 + perpX * offset,
        -0.05,
        (z1 + z2) / 2 + perpZ * offset,
      );
      scene.add(chan);
      // Low stone wall beside channel
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xcc9966 });
      [-0.6, 0.6].forEach((wo) => {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.45, len),
          wallMat,
        );
        wall.rotation.y = ang;
        wall.position.set(
          (x1 + x2) / 2 + perpX * (offset + wo * 1.5),
          0.22,
          (z1 + z2) / 2 + perpZ * (offset + wo * 1.5),
        );
        scene.add(wall);
      });
    }

    const RW = 11;

    // ── MAIN BOULEVARD — horizontal spine z=0, full width ─────────────────
    road(-90, 0, 90, 0, RW);
    // ── UPPER BOULEVARD z=-14 — hero zone ──────────────────────────────────
    road(-90, -14, 90, -14, RW);
    // ── SOUTH BOULEVARD z=42 ───────────────────────────────────────────────
    road(-90, 42, 90, 42, RW);
    // ── EDUCATION AVE z=-62 ────────────────────────────────────────────────
    road(-45, -62, 45, -62, RW);

    // ── CENTRAL N-S SPINE x=0 ──────────────────────────────────────────────
    road(0, -80, 0, 70, RW);
    // ── WEST N-S ARTERY x=-45 ──────────────────────────────────────────────
    road(-45, -14, -45, 42, RW);
    // ── EAST N-S ARTERY x=45 ───────────────────────────────────────────────
    road(45, -14, 45, 42, RW);
    // ── FAR WEST x=-58 (to reach Brahma Kund + Lakshmi) ───────────────────
    road(-58, -14, -58, 42, RW);
    // ── FAR EAST x=58 (to reach Akasha + Setu) ────────────────────────────
    road(58, -14, 58, 42, RW);

    // ── CONNECTING CROSS-STREETS ──────────────────────────────────────────
    road(-90, 24, 90, 24, RW);
    road(-90, -38, 90, -38, RW);

    // ── WATER CHANNELS alongside central N-S spine (like Firefly video) ───
    waterChannel(0, -70, 0, 60, 1); // east side of central spine
    waterChannel(0, -70, 0, 60, -1); // west side of central spine

    // ── CENTRAL ROUNDABOUT — deep terracotta like the reference ───────────
    const rMat = new THREE.MeshLambertMaterial({ color: 0xbb6644 });
    const rGnd = new THREE.MeshLambertMaterial({ color: P.ground });
    const rGeo = new THREE.RingGeometry(10.5, 17, 24);
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.y = 0.13;
    scene.add(rMesh);
    const isl = new THREE.Mesh(
      new THREE.CylinderGeometry(10.5, 10.5, 0.32, 18),
      rGnd,
    );
    isl.position.y = 0.16;
    scene.add(isl);

    // ── EDUCATION ROUNDABOUT ─────────────────────────────────────────────
    const eGeo = new THREE.RingGeometry(7, 11, 18);
    const eMesh = new THREE.Mesh(eGeo, rMat);
    eMesh.rotation.x = -Math.PI / 2;
    eMesh.position.set(0, 0.13, -38);
    scene.add(eMesh);
    const eIsl = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 0.3, 16),
      rGnd,
    );
    eIsl.position.set(0, 0.15, -38);
    scene.add(eIsl);
  }

  // ── BUILDINGS ─────────────────────────────────────────────────────────────
  function buildAllBuildings() {
    window.CITY_DATA.buildings.forEach((b) => buildBuilding(b));
  }

  function pc(c) {
    if (typeof c === "string" && c.startsWith("#"))
      return parseInt(c.slice(1), 16);
    return typeof c === "number" ? c : 0x334455;
  }

  // Low-poly building: chunky, colorful, cast shadows
  // ── TEMPLE BUILDING RENDERER ──────────────────────────────────────────────
  // Types: gopuram | mandapa | shikhara | stupa
  // Each creates authentic Hindu temple low-poly geometry

  function buildBuilding(b) {
    const g = new THREE.Group();
    g.position.set(b.pos[0], 0, b.pos[1]);

    const w = b.size[0],
      d = b.size[1],
      h = b.height;
    const gc = pc(b.glowColor);

    // Pick stone colors per zone
    // Temple stone colors — ALL significantly brighter, warm sandstone bias
    // Bruno Simon diorama: top faces warm/bright, shadows are tinted cool
    const stoneColors = {
      "#00c8ff": [0xddeeff, 0xaaccee, 0x5588aa], // light blue-white marble
      "#7dff4f": [0xeeffcc, 0xbbdd88, 0x667733], // warm mossy sandstone
      "#ffcc44": [0xfff0bb, 0xeebb55, 0xaa7700], // golden sandstone — VIVID
      "#ff6b00": [0xffddb8, 0xee9944, 0xaa4411], // warm terracotta — VIVID
      "#c084fc": [0xffeeff, 0xddaaff, 0x9944cc], // light lavender marble
      "#4dd4ff": [0xddf4ff, 0x99ddff, 0x4488bb], // pale blue slate
      "#ff9950": [0xffeedd, 0xeeaa66, 0xaa5522], // warm honey sandstone
      "#a78bfa": [0xf0e8ff, 0xcc99ff, 0x7744bb], // pale violet marble
      "#34d399": [0xddfff0, 0x88eebb, 0x227755], // jade white-green
    };
    const [sLight, sMid, sDark] = stoneColors[b.glowColor] || [
      0xffeedd, 0xddbb88, 0x886633,
    ];

    // ── TOON MATERIALS — cel-shaded, responds to directional lights ───────
    // Gives crisp illustrated depth like the Firefly reference video
    const mLight = new THREE.MeshToonMaterial({
      color: sLight,
      gradientMap: window._toonGrad,
    });
    const mMid = new THREE.MeshToonMaterial({
      color: sMid,
      gradientMap: window._toonGrad,
    });
    const mDark = new THREE.MeshToonMaterial({
      color: sDark,
      gradientMap: window._toonGrad,
    });
    const mGlow = new THREE.MeshBasicMaterial({ color: gc });
    const mGoldMat = new THREE.MeshToonMaterial({
      color: 0xffcc44,
      gradientMap: window._toonGrad,
    });

    const type = b.templeType || "shikhara";

    // ── FOUNDATION PLATFORM (all temples) ────────────────────────────────
    // Multi-step raised platform — the jagati/adhishthana
    const steps = b.isHero ? 4 : 3;
    for (let s = 0; s < steps; s++) {
      const sw = w + (steps - s) * 1.8;
      const sd = d + (steps - s) * 1.8;
      const sh = 0.38;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, sd),
        s % 2 === 0 ? mMid : mLight,
      );
      slab.position.y = s * sh + sh / 2;
      g.add(slab);
    }
    const baseH = steps * 0.38;

    if (type === "gopuram") {
      // ── GOPURAM: South Indian temple gateway tower ─────────────────────
      // Wide base, horizontal tiers tapering up to a barrel vault top

      // Main gate hall — wide mandapa at base
      const hallH = h * 0.28;
      const hall = new THREE.Mesh(new THREE.BoxGeometry(w, hallH, d), mMid);
      hall.position.y = baseH + hallH / 2;
      g.add(hall);

      // Gate opening (dark archway)
      const arch = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.35, hallH * 0.75, d + 0.5),
        mDark,
      );
      arch.position.y = baseH + hallH * 0.38;
      g.add(arch);

      // Horizontal tiers stacking up — each slightly narrower
      const tiers = b.isHero ? 8 : 6;
      let tierY = baseH + hallH;
      let tw = w,
        td = d;
      const tierH = (h - hallH) / tiers;
      for (let t = 0; t < tiers; t++) {
        tw *= 0.88;
        td *= 0.88;
        const tier = new THREE.Mesh(
          new THREE.BoxGeometry(tw, tierH, td),
          t % 2 === 0 ? mMid : mLight,
        );
        tier.position.y = tierY + tierH / 2;
        g.add(tier);

        // Horizontal cornice line between tiers
        const cornice = new THREE.Mesh(
          new THREE.BoxGeometry(tw + 0.3, 0.18, td + 0.3),
          mDark,
        );
        cornice.position.y = tierY + tierH;
        g.add(cornice);

        // Small decorative niches on each tier
        if (t < tiers - 2) {
          [-1, 1].forEach((side) => {
            const niche = new THREE.Mesh(
              new THREE.BoxGeometry(tw * 0.18, tierH * 0.7, 0.25),
              new THREE.MeshMatcapMaterial({
                color: darken(sMid, 0.2),
                matcap: matcaps.stone || matcaps.warm,
              }),
            );
            niche.position.set(
              side * tw * 0.36,
              tierY + tierH * 0.5,
              td / 2 + 0.05,
            );
            g.add(niche);
          });
        }
        tierY += tierH;
      }

      // Barrel vault top (shikhara of the gopuram)
      const vault = new THREE.Mesh(
        new THREE.CylinderGeometry(tw * 0.3, tw * 0.48, tw * 0.7, 8),
        mMid,
      );
      vault.position.y = tierY + tw * 0.35;
      vault.rotation.z = Math.PI / 2;
      g.add(vault);

      // Kalasha (sacred pot) on top
      const kBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.42, 0.35, 8),
        mGoldMat,
      );
      kBase.position.y = tierY + tw * 0.7 + 0.18;
      g.add(kBase);
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        mGoldMat,
      );
      kPot.position.y = tierY + tw * 0.7 + 0.55;
      g.add(kPot);
      const kTop = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.52, 6),
        mGoldMat,
      );
      kTop.position.y = tierY + tw * 0.7 + 1.08;
      g.add(kTop);
    } else if (type === "shikhara") {
      // ── SHIKHARA: North Indian curvilinear spire ──────────────────────
      // Square base (garbhagriha), cylindrical/curvilinear spire rising up

      // Sanctum walls
      const sanctumH = h * 0.32;
      const sanctum = new THREE.Mesh(
        new THREE.BoxGeometry(w, sanctumH, d),
        mMid,
      );
      sanctum.position.y = baseH + sanctumH / 2;
      g.add(sanctum);

      // Four projecting portico ribs (rathas) — carved projections
      [
        [0, d / 2, 0],
        [0, -d / 2, 0],
        [w / 2, 0, Math.PI / 2],
        [-w / 2, 0, Math.PI / 2],
      ].forEach(([ox, oz, ry]) => {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.28, sanctumH * 0.88, 0.6),
          mLight,
        );
        rib.position.set(
          ox > 0 ? ox - 0.2 : ox + 0.2,
          baseH + sanctumH * 0.44,
          oz > 0 ? oz - 0.1 : oz + 0.1,
        );
        rib.rotation.y = ry;
        g.add(rib);
      });

      // Amalaka (ribbed disc at spire top)
      const amalY = baseH + sanctumH;
      let spW = w * 0.9;
      const spTiers = b.isHero ? 10 : 7;
      const spH = (h - sanctumH) / spTiers;
      for (let t = 0; t < spTiers; t++) {
        spW *= 0.85;
        const spTier = new THREE.Mesh(
          new THREE.CylinderGeometry(spW * 0.5, spW * 0.55, spH, 8),
          t % 2 === 0 ? mMid : mLight,
        );
        spTier.position.y = amalY + t * spH + spH / 2;
        g.add(spTier);

        // Curved profile lines
        if (t < spTiers - 2) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(spW * 0.52, 0.1, 4, 12),
            new THREE.MeshBasicMaterial({
              color: gc,
              transparent: true,
              opacity: 0.55,
            }),
          );
          band.position.y = amalY + t * spH + spH;
          band.rotation.x = Math.PI / 2;
          g.add(band);
        }
      }
      // Amalaka disc
      const aml = new THREE.Mesh(
        new THREE.CylinderGeometry(spW * 0.7, spW * 0.7, 0.35, 12),
        mGoldMat,
      );
      aml.position.y = amalY + spTiers * spH + 0.18;
      g.add(aml);
      // Kalasha
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 6),
        mGoldMat,
      );
      kPot.position.y = amalY + spTiers * spH + 0.6;
      g.add(kPot);
      const kFlag = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.55, 5),
        mGoldMat,
      );
      kFlag.position.y = amalY + spTiers * spH + 1.1;
      g.add(kFlag);
    } else if (type === "mandapa") {
      // ── MANDAPA: Pillared pavilion / columned hall ────────────────────
      // Low wide roof supported by many columns — like a great hall

      // Main hall roof — flat tiered
      const roofH = h * 0.45;
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, roofH, d + 0.5),
        mMid,
      );
      roof.position.y = baseH + roofH / 2;
      g.add(roof);

      // Upper tier
      const topH = h * 0.28;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, topH, d * 0.72),
        mLight,
      );
      top.position.y = baseH + roofH + topH / 2;
      g.add(top);

      // Crown spire
      const crownH = h * 0.2;
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.18, w * 0.26, crownH, 8),
        mMid,
      );
      crown.position.y = baseH + roofH + topH + crownH / 2;
      g.add(crown);
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        mGoldMat,
      );
      kPot.position.y = baseH + roofH + topH + crownH + 0.35;
      g.add(kPot);

      // Rows of columns on all sides — the mandapa's signature
      const cols = b.isHero ? 4 : 3;
      const colH = roofH * 0.88;
      const colMat = new THREE.MeshMatcapMaterial({
        color: sLight,
        matcap: matcaps.stone || matcaps.warm,
      });
      [-1, 1].forEach((side) => {
        for (let i = 0; i < cols; i++) {
          const cx = (i / (cols - 1) - 0.5) * (w - 1.0);
          // Front colonnade
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.32, colH, 7),
            colMat,
          );
          col.position.set(cx, baseH + colH / 2, side * (d / 2 + 0.1));
          g.add(col);
          // Capital
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.28, 0.65),
            mMid,
          );
          cap.position.set(cx, baseH + colH + 0.14, side * (d / 2 + 0.1));
          g.add(cap);
          // Base
          const base2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.62, 0.22, 0.62),
            mMid,
          );
          base2.position.set(cx, baseH + 0.11, side * (d / 2 + 0.1));
          g.add(base2);
        }
        // Side colonnade
        for (let i = 0; i < cols; i++) {
          const cz = (i / (cols - 1) - 0.5) * (d - 1.0);
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.32, colH, 7),
            colMat,
          );
          col.position.set(side * (w / 2 + 0.1), baseH + colH / 2, cz);
          g.add(col);
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.28, 0.65),
            mMid,
          );
          cap.position.set(side * (w / 2 + 0.1), baseH + colH + 0.14, cz);
          g.add(cap);
        }
      });
    } else if (type === "stupa") {
      // ── STUPA: Buddhist-influenced dome shrine ─────────────────────────
      // Circular dome (anda) on a square platform with a harmika on top

      // Square drum base
      const drumH = h * 0.35;
      const drum = new THREE.Mesh(new THREE.BoxGeometry(w, drumH, d), mMid);
      drum.position.y = baseH + drumH / 2;
      g.add(drum);
      // Decorative band
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4),
        mGoldMat,
      );
      band.position.y = baseH + drumH;
      g.add(band);

      // Hemisphere dome (anda)
      const domeR = Math.min(w, d) * 0.52;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(domeR, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mLight,
      );
      dome.position.y = baseH + drumH;
      g.add(dome);

      // Harmika (square fence on top)
      const hmY = baseH + drumH + domeR * 0.78;
      const hm = new THREE.Mesh(
        new THREE.BoxGeometry(domeR * 0.55, domeR * 0.35, domeR * 0.55),
        mMid,
      );
      hm.position.y = hmY;
      g.add(hm);

      // Chattravali — stacked discs (the spire)
      let disY = hmY + domeR * 0.18;
      let disR = domeR * 0.22;
      const discCount = b.isHero ? 6 : 4;
      for (let i = 0; i < discCount; i++) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(disR, disR * 1.1, 0.22, 10),
          mGoldMat,
        );
        disc.position.y = disY;
        g.add(disc);
        disY += 0.28;
        disR *= 0.82;
      }
      // Finial
      const fin = new THREE.Mesh(
        new THREE.SphereGeometry(disR * 1.2, 8, 6),
        mGoldMat,
      );
      fin.position.y = disY + 0.18;
      g.add(fin);
    }

    // ── TORANA GATEWAY — decorative archway in front ──────────────────────
    // Only hero buildings get an elaborate torana
    if (b.isHero || b.isEducation) {
      const torH = h * 0.5;
      const torW = w * 0.7;
      // Left post
      const lPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, torH, 0.42),
        mMid,
      );
      lPost.position.set(-torW / 2, torH / 2, d / 2 + 1.8);
      g.add(lPost);
      // Right post
      const rPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, torH, 0.42),
        mMid,
      );
      rPost.position.set(torW / 2, torH / 2, d / 2 + 1.8);
      g.add(rPost);
      // Lintel
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(torW + 0.42, 0.45, 0.42),
        mMid,
      );
      lintel.position.set(0, torH, d / 2 + 1.8);
      g.add(lintel);
      // Torana arch decoration
      const archDec = new THREE.Mesh(
        new THREE.BoxGeometry(torW * 0.55, 0.32, 0.42),
        mGoldMat,
      );
      archDec.position.set(0, torH + 0.46, d / 2 + 1.8);
      g.add(archDec);
    }

    // ── GLOWING ORBS on hero buildings ───────────────────────────────────
    if (b.isHero) {
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      orb.position.y = h + 2.5;
      orb.userData.isOrb = true;
      g.add(orb);
      [1.2, 2.0].forEach((r, i) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.06, 4, 16),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.5 - i * 0.12,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h + 2.5;
        ring.userData.heroRing = true;
        ring.userData.ri = i;
        g.add(ring);
      });
      g.add(ptLight(gc, isNight ? 4.5 : 1.8, 28, [0, h + 2, 0]));
      // Warm light at base for interior glow effect
      g.add(ptLight(0xffcc88, isNight ? 2.0 : 0.8, 12, [0, 1.5, 0]));
    } else {
      g.add(ptLight(gc, isNight ? 2.5 : 1.0, 20, [0, h * 0.7, 0]));
      g.add(ptLight(0xffcc88, isNight ? 1.5 : 0.55, 10, [0, 1.0, 0]));
    }

    // ── BLOB SHADOW ───────────────────────────────────────────────────────
    addBlobShadow(b, g);

    // Collision box — larger padding for temples
    buildingBoxes.push({
      minX: b.pos[0] - w / 2 - 2.5,
      maxX: b.pos[0] + w / 2 + 2.5,
      minZ: b.pos[1] - d / 2 - 2.5,
      maxZ: b.pos[1] + d / 2 + 2.5,
    });

    buildingMeshes.push({
      group: g,
      body: g,
      building: b,
      bodyMat: mMid, // for proximity highlight
    });
    g.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    scene.add(g);
  }

  function darken(hex, amt) {
    const r = (((hex >> 16) & 0xff) * (1 - amt)) | 0;
    const g2 = (((hex >> 8) & 0xff) * (1 - amt)) | 0;
    const b2 = ((hex & 0xff) * (1 - amt)) | 0;
    return (r << 16) | (g2 << 8) | b2;
  }

  // ── PRAYER FLAGS (Toran banners) — strung across the world at key spots ──
  function buildPrayerFlags() {
    const flagColors = [
      0xff3333, 0xff9900, 0xffdd00, 0x33cc44, 0x3388ff, 0xcc44cc,
    ];

    function stringFlags(x1, y, z1, x2, z2, count) {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const fx = x1 + (x2 - x1) * t;
        const sag = Math.sin(t * Math.PI) * 0.7;
        const fz = z1 + (z2 - z1) * t;
        const fy = y - sag;
        const col = flagColors[i % flagColors.length];
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.32, 0.06),
          new THREE.MeshBasicMaterial({ color: col }),
        );
        flag.position.set(fx, fy, fz);
        flag.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        // ── REGISTER for wave animation ─────────────────────────────────
        flag.userData.isFlagCloth = true;
        flag.userData.waveFreq = 1.8 + Math.random() * 0.8;
        flag.userData.wavePhase = i * 0.62 + t * Math.PI * 2;
        flag.userData.waveAmpZ = 0.12 + Math.random() * 0.08;
        flag.userData.waveAmpX = 0.05 + Math.random() * 0.04;
        flagMeshes.push(flag);
        scene.add(flag);
      }
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.sqrt(dx * dx + dz * dz);
      const str = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.02, 0.02),
        new THREE.MeshBasicMaterial({
          color: 0xddcc99,
          transparent: true,
          opacity: 0.55,
        }),
      );
      str.position.set((x1 + x2) / 2, y - 0.35, (z1 + z2) / 2);
      str.rotation.y = Math.atan2(dx, dz);
      scene.add(str);
    }

    // Across the hero zone entrance
    stringFlags(-22, 9, -4, 22, -4, 14);
    // Main boulevard
    stringFlags(-22, 9, 2, 22, 2, 14);
    // South district gateway
    stringFlags(-14, 8, 32, 14, 32, 8);
    stringFlags(-14, 8, 50, 14, 50, 8);
    // Education corridor
    stringFlags(-18, 8, -55, 18, -55, 10);
    // Diagonal across central island
    stringFlags(-8, 7, -16, 8, -16, 6);
  }

  // ── DIRECTIONAL SIGN POSTS — wooden signs near spawn pointing to districts ─
  function buildSignPosts() {
    const woodMat = new THREE.MeshToonMaterial({
      color: 0xcc8844,
      gradientMap: window._toonGrad,
    });
    const textMats = {
      "#00c8ff": new THREE.MeshBasicMaterial({ color: 0x00ccff }),
      "#7dff4f": new THREE.MeshBasicMaterial({ color: 0x77ff44 }),
      "#ffcc44": new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
      "#ff6b00": new THREE.MeshBasicMaterial({ color: 0xff7722 }),
      "#c084fc": new THREE.MeshBasicMaterial({ color: 0xcc88ff }),
      "#34d399": new THREE.MeshBasicMaterial({ color: 0x44eebb }),
    };

    const signs = [
      {
        pos: [-5, 32],
        angle: -0.4,
        text: "◈ SURYA DWARA",
        col: "#00c8ff",
        dist: "↑ NORTH",
      },
      {
        pos: [5, 32],
        angle: 0.4,
        text: "◈ BRAHMA KUND",
        col: "#ffcc44",
        dist: "↑ NORTH",
      },
      {
        pos: [-5, 14],
        angle: -0.2,
        text: "◈ LAKSHMI PRASAD",
        col: "#ff6b00",
        dist: "← WEST",
      },
      {
        pos: [5, 14],
        angle: 0.2,
        text: "◈ AKASHA MANDAPA",
        col: "#00c8ff",
        dist: "→ EAST",
      },
      {
        pos: [0, 14],
        angle: 0.0,
        text: "◈ SARASWATI VIHAR",
        col: "#c084fc",
        dist: "↓ SOUTH",
      },
    ];

    signs.forEach(({ pos, angle, text, col, dist }) => {
      const g = new THREE.Group();
      g.position.set(pos[0], 0, pos[1]);
      g.rotation.y = angle;

      // Post
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 3.2, 0.14),
        woodMat,
      );
      pole.position.y = 1.6;
      g.add(pole);

      // Sign board
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.75, 0.12),
        woodMat,
      );
      board.position.set(0, 3.2, 0);
      g.add(board);

      // Painted sign face canvas
      const W = 280,
        H = 56;
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "rgba(20,10,4,0.9)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col;
      ctx.font = "bold 16px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(text, 10, 24);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.fillText(dist, 10, 44);
      const tex = new THREE.CanvasTexture(can);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 0.65),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      face.position.set(0, 3.2, 0.07);
      g.add(face);

      scene.add(g);
    });
  }

  // ── VIJAY STAMBHA — Tall stone victory pillar (right side, Firefly video) ─
  function buildStambha() {
    const stoneMat = new THREE.MeshToonMaterial({
      color: 0xeeddcc,
      gradientMap: window._toonGrad,
    });
    const goldMat = new THREE.MeshMatcapMaterial({
      color: 0xffcc44,
      matcap: matcaps.gold,
    });

    // Place on east side of map like the video
    const SX = 72,
      SZ = 8;

    // Raised octagonal base
    const base1 = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 4.0, 0.8, 8),
      stoneMat,
    );
    base1.position.set(SX, 0.4, SZ);
    scene.add(base1);
    const base2 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 3.0, 0.7, 8),
      stoneMat,
    );
    base2.position.set(SX, 1.15, SZ);
    scene.add(base2);
    const base3 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 0.7, 8),
      stoneMat,
    );
    base3.position.set(SX, 1.9, SZ);
    scene.add(base3);

    // Main shaft — tall and tapering like a real stambha
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.95, 18, 12),
      stoneMat,
    );
    shaft.position.set(SX, 11.0, SZ);
    scene.add(shaft);

    // Decorative bands on shaft
    [4, 8, 12, 16].forEach((y) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.88, 0.28, 12),
        goldMat,
      );
      band.position.set(SX, y, SZ);
      scene.add(band);
    });

    // Bell capital (ghanta)
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 0.6, 1.2, 10),
      stoneMat,
    );
    bell.position.set(SX, 20.6, SZ);
    scene.add(bell);

    // Abacus disc
    const abacus = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.1, 0.55, 12),
      stoneMat,
    );
    abacus.position.set(SX, 21.5, SZ);
    scene.add(abacus);

    // Dharma chakra on top (golden wheel)
    const chakra = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.18, 6, 20),
      goldMat,
    );
    chakra.position.set(SX, 22.4, SZ);
    chakra.userData.isChakra = true;
    scene.add(chakra);

    // Spokes of the chakra
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 1.8),
        goldMat,
      );
      spoke.position.set(SX, 22.4, SZ);
      spoke.rotation.z = ang;
      spoke.userData.isChakra = true;
      scene.add(spoke);
    }

    // Golden glow at top
    scene.add(ptLight(0xffcc44, isNight ? 3.0 : 1.2, 20, [SX, 22, SZ]));
  }

  // ── FORMAL GARDEN CIRCLES — manicured circular gardens from Firefly video ─
  function buildFormalGardens() {
    const gardenMat = new THREE.MeshLambertMaterial({ color: 0x338833 }); // deep green lawn
    const pathMat = new THREE.MeshLambertMaterial({ color: 0xddaa77 }); // sandy path
    const flowerMat1 = new THREE.MeshBasicMaterial({ color: 0xff4488 }); // pink flowers
    const flowerMat2 = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); // yellow flowers
    const hedgeMat = new THREE.MeshMatcapMaterial({
      color: 0x225522,
      matcap: matcaps.tree,
    });
    const fountainMat = new THREE.MeshLambertMaterial({ color: 0x99ccff }); // water

    // Positions of formal garden circles — along the main boulevard
    const gardens = [
      { x: -20, z: -7, r: 6.5 }, // west of hero zone
      { x: 20, z: -7, r: 6.5 }, // east of hero zone
      { x: -20, z: 17, r: 5.5 }, // central district
      { x: 20, z: 17, r: 5.5 },
      { x: -45, z: 5, r: 4.5 }, // west artery
      { x: 45, z: 5, r: 4.5 }, // east artery
      { x: 0, z: -25, r: 5.0 }, // north of hero zone
      { x: 0, z: 35, r: 5.0 }, // south boulevard
    ];

    gardens.forEach(({ x, z, r }) => {
      // Outer lawn circle
      const lawn = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.15, 20),
        gardenMat,
      );
      lawn.position.set(x, 0.075, z);
      scene.add(lawn);

      // Sandy concentric path ring
      const pathRing = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.65, r * 0.12, 4, 24),
        pathMat,
      );
      pathRing.rotation.x = Math.PI / 2;
      pathRing.position.set(x, 0.18, z);
      scene.add(pathRing);

      // Inner green circle
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.18, 16),
        gardenMat,
      );
      inner.position.set(x, 0.09, z);
      scene.add(inner);

      // Flower ring — alternating pink/yellow dots around the path
      const numFlowers = Math.floor(r * 3);
      for (let i = 0; i < numFlowers; i++) {
        const ang = (i / numFlowers) * Math.PI * 2;
        const fr = r * 0.65;
        const mat = i % 2 === 0 ? flowerMat1 : flowerMat2;
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 5, 4),
          mat,
        );
        flower.position.set(
          x + Math.cos(ang) * fr,
          0.38,
          z + Math.sin(ang) * fr,
        );
        scene.add(flower);
      }

      // Radial hedge spokes
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const hlen = r * 0.55;
        const hedge = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.55, hlen),
          hedgeMat,
        );
        hedge.position.set(
          x + (Math.cos(ang) * hlen) / 2,
          0.28,
          z + (Math.sin(ang) * hlen) / 2,
        );
        hedge.rotation.y = -ang;
        scene.add(hedge);
      }

      // Central fountain or small monument
      if (r > 5) {
        // Small central fountain bowl
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12),
          new THREE.MeshToonMaterial({
            color: 0xeeddcc,
            gradientMap: window._toonGrad,
          }),
        );
        bowl.position.set(x, 0.2, z);
        scene.add(bowl);
        // Water surface
        const waterSurf = new THREE.Mesh(
          new THREE.CircleGeometry(0.75, 12),
          fountainMat,
        );
        waterSurf.rotation.x = -Math.PI / 2;
        waterSurf.position.set(x, 0.42, z);
        scene.add(waterSurf);
        // Fountain jet (thin cone upward)
        const jet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 1.2, 6),
          new THREE.MeshBasicMaterial({
            color: 0xbbddff,
            transparent: true,
            opacity: 0.7,
          }),
        );
        jet.position.set(x, 0.9, z);
        scene.add(jet);
        scene.add(ptLight(0x88ccff, isNight ? 1.5 : 0.4, 8, [x, 1.5, z]));
      } else {
        // Small ornamental stone
        const orn = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.42, 0),
          new THREE.MeshMatcapMaterial({
            color: 0xffcc44,
            matcap: matcaps.gold,
          }),
        );
        orn.position.set(x, 0.55, z);
        orn.userData.isTimelineGem = true;
        orn.userData.baseY = 0.55;
        orn.userData.phase = x * 0.3;
        scene.add(orn);
      }
    });
  }

  // ── P3: DISTRICT GATEWAY ARCHES ───────────────────────────────────────────
  // Grand entrance arches across roads marking district transitions
  function buildGatewayArches() {
    const archMat = new THREE.MeshToonMaterial({
      color: 0xf0d8a0,
      gradientMap: window._toonGrad,
    });
    const goldMat = new THREE.MeshToonMaterial({
      color: 0xffcc44,
      gradientMap: window._toonGrad,
    });
    const textData = [
      { x: 0, z: -4, ry: 0, label: "◈  HERO DISTRICT", col: 0x00ddff },
      { x: 0, z: -36, ry: 0, label: "◈  MODERNIZATION ZONE", col: 0xffcc44 },
      { x: 0, z: -56, ry: 0, label: "◈  EDUCATION DISTRICT", col: 0xa78bfa },
      { x: 0, z: 36, ry: 0, label: "◈  SOUTH DISTRICT", col: 0xff9950 },
      {
        x: -44,
        z: 14,
        ry: Math.PI / 2,
        label: "◈  WEST QUARTER",
        col: 0xffcc44,
      },
      {
        x: 44,
        z: 14,
        ry: Math.PI / 2,
        label: "◈  EAST QUARTER",
        col: 0x00c8ff,
      },
    ];

    textData.forEach(({ x, z, ry, label, col }) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;

      const W2 = 9; // half-width of arch opening
      const H = 8; // arch height

      // Left pillar
      [-W2, W2].forEach((ox) => {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, H, 1.0),
          archMat,
        );
        pillar.position.set(ox, H / 2, 0);
        g.add(pillar);
        // Capital
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.6, 1.6),
          goldMat,
        );
        cap.position.set(ox, H + 0.3, 0);
        g.add(cap);
        // Decorative pot on capital
        const pot = new THREE.Mesh(
          new THREE.SphereGeometry(0.38, 7, 5),
          goldMat,
        );
        pot.position.set(ox, H + 0.88, 0);
        g.add(pot);
      });

      // Horizontal beam / lintel
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(W2 * 2 + 1.0, 0.9, 1.0),
        archMat,
      );
      lintel.position.set(0, H, 0);
      g.add(lintel);

      // Gold accent strip on lintel
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(W2 * 2 + 0.4, 0.2, 0.12),
        goldMat,
      );
      strip.position.set(0, H + 0.5, 0.5);
      g.add(strip);

      // Arch kalasha centre
      const kalasha = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 6),
        goldMat,
      );
      kalasha.position.set(0, H + 1.0, 0);
      g.add(kalasha);
      const finial = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.6, 5),
        goldMat,
      );
      finial.position.set(0, H + 1.82, 0);
      g.add(finial);

      // ── CANVAS NAME SIGN on the arch ──────────────────────────────────
      const CW = 380,
        CH = 56;
      const can = document.createElement("canvas");
      can.width = CW;
      can.height = CH;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "rgba(8,4,1,0.88)";
      ctx.fillRect(0, 0, CW, CH);
      const hexCol = "#" + col.toString(16).padStart(6, "0");
      ctx.strokeStyle = hexCol + "bb";
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, CW - 4, CH - 4);
      ctx.fillStyle = hexCol;
      ctx.font = "bold 26px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, CW / 2, CH / 2);
      const tex = new THREE.CanvasTexture(can);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(W2 * 2 - 0.5, 1.1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      sign.position.set(0, H - 0.3, 0.55);
      g.add(sign);

      scene.add(g);
    });
  }

  // ── P5: ANIMATED BIRDS (flock circling above gopurams) ───────────────────
  function buildBirdFlock() {
    birdGroup = new THREE.Group();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x222211 });

    for (let i = 0; i < 22; i++) {
      const bird = new THREE.Group();
      // Simple bird: two wing triangles + small body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.06, 0.28),
        birdMat,
      );
      bird.add(body);
      [-1, 1].forEach((side) => {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.04, 0.18),
          birdMat,
        );
        wing.position.set(side * 0.3, 0, 0);
        wing.rotation.z = side * 0.28;
        wing.userData.isWing = true;
        wing.userData.side = side;
        bird.add(wing);
      });

      // Orbit params
      bird.userData.orbitR = 18 + Math.random() * 14;
      bird.userData.orbitH = 22 + Math.random() * 12;
      bird.userData.orbitSpeed = 0.18 + Math.random() * 0.14;
      bird.userData.orbitPhase = (i / 22) * Math.PI * 2;
      bird.userData.flapPhase = Math.random() * Math.PI * 2;
      birdGroup.add(bird);
    }
    scene.add(birdGroup);
  }

  // ── P6: DISTRICT POSITIONAL AUDIO ────────────────────────────────────────
  // Each district plays a thematic ambient tone using Web Audio
  // Gets louder as you approach, fades as you move away
  function initDistrictAudio() {
    if (!audioCtx) return;
    const districts = [
      // [x, z, baseFreq, type, label]
      { id: "hero", x: 0, z: -24, freq: 528, type: "bell", vol: 0 },
      { id: "east", x: 68, z: 10, freq: 396, type: "singing", vol: 0 },
      { id: "west", x: -68, z: 10, freq: 285, type: "veena", vol: 0 },
      { id: "south", x: 0, z: 55, freq: 432, type: "flute", vol: 0 },
      { id: "edu", x: 0, z: -72, freq: 639, type: "chant", vol: 0 },
    ];

    districts.forEach((d) => {
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filt = audioCtx.createBiquadFilter();

        osc.type =
          d.type === "bell"
            ? "sine"
            : d.type === "singing"
              ? "sine"
              : d.type === "veena"
                ? "triangle"
                : d.type === "flute"
                  ? "sine"
                  : "sine";
        osc.frequency.value = d.freq;
        filt.type = "bandpass";
        filt.frequency.value = d.freq * 2;
        filt.Q.value = 8;
        gain.gain.value = 0;
        osc.connect(filt);
        filt.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        districtAudio[d.id] = { osc, gain, x: d.x, z: d.z, targetVol: 0 };
      } catch (e) {}
    });
  }

  function updateDistrictAudio() {
    if (!gameStarted) return;
    Object.values(districtAudio).forEach((d) => {
      const dist = Math.hypot(carX - d.x, carZ - d.z);
      d.targetVol = Math.max(0, Math.min(0.06, ((55 - dist) / 55) * 0.06));
      if (d.gain) {
        const cur = d.gain.gain.value;
        d.gain.gain.value += (d.targetVol - cur) * 0.04;
      }
    });
  }

  // ── P9: KEYBOARD SHORTCUT SIGN (fades out after first move) ─────────────
  function buildShortcutSign() {
    const W = 340,
      H = 180;
    const can = document.createElement("canvas");
    can.width = W;
    can.height = H;
    const ctx = can.getContext("2d");

    ctx.fillStyle = "rgba(8,4,2,0.92)";
    if (ctx.roundRect) ctx.roundRect(4, 4, W - 8, H - 8, 10);
    else ctx.rect(4, 4, W - 8, H - 8);
    ctx.fill();

    ctx.strokeStyle = "#ffcc44aa";
    ctx.lineWidth = 2;
    if (ctx.roundRect) ctx.roundRect(4, 4, W - 8, H - 8, 10);
    else ctx.rect(4, 4, W - 8, H - 8);
    ctx.stroke();

    ctx.fillStyle = "#ffcc44";
    ctx.font = "bold 13px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("◈  CONTROLS", W / 2, 28);

    const lines = [
      ["W / S", "Drive forward / reverse"],
      ["A / D", "Steer left / right"],
      ["E", "Enter nearest temple"],
      ["M", "Open city map"],
      ["J", "Career journey"],
      ["T", "Change weather"],
    ];
    lines.forEach(([key, desc], i) => {
      const y = 52 + i * 22;
      ctx.fillStyle = "#ffcc44";
      ctx.font = "bold 12px 'Share Tech Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(key, 20, y);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.fillText(desc, 80, y);
    });

    ctx.fillStyle = "rgba(255,200,100,0.3)";
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("drive to make this disappear", W / 2, H - 14);

    const tex = new THREE.CanvasTexture(can);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      }),
    );
    sprite.scale.set(10, 5.3, 1);
    sprite.position.set(-8, 5, 48); // left of spawn, visible immediately
    sprite.userData.isHelpSign = true;
    scene.add(sprite);
  }

  // ── NIGHT SKY STARS + ARCHWAY GLOW ───────────────────────────────────────
  function buildNightSky() {
    // 2000 stars as a large sphere of points above the scene
    const cnt = 2000;
    const pos = new Float32Array(cnt * 3);
    const col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      // Distribute on upper hemisphere
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI * 0.48; // stay above horizon
      const R = 180 + Math.random() * 40;
      pos[i * 3] = R * Math.sin(theta) * Math.cos(phi);
      pos[i * 3 + 1] = R * Math.cos(theta);
      pos[i * 3 + 2] = R * Math.sin(theta) * Math.sin(phi);
      // Star colors: mostly white, some warm/cool tints
      const t = Math.random();
      if (t < 0.6) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 1;
        col[i * 3 + 2] = 1;
      } // white
      else if (t < 0.8) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.9;
        col[i * 3 + 2] = 0.7;
      } // warm
      else {
        col[i * 3] = 0.7;
        col[i * 3 + 1] = 0.85;
        col[i * 3 + 2] = 1;
      } // cool blue
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    starField = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.35,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        sizeAttenuation: true,
      }),
    );
    starField.userData.isStars = true;
    scene.add(starField);

    // Archway interior glow — warm golden light inside each gateway arch
    // Positions match the gateway arch positions from buildGatewayArches
    const archPositions = [
      [0, -4],
      [0, -36],
      [0, -56],
      [0, 36],
      [-44, 14],
      [44, 14],
    ];
    archPositions.forEach(([x, z]) => {
      const glow = new THREE.PointLight(0xffcc66, 0, 18);
      glow.position.set(x, 5, z);
      glow.userData.isArchGlow = true;
      scene.add(glow);
      archGlows.push(glow);
    });
  }

  // ── CENTERED TEMPLE GROUND RING (extra detail for night) ─────────────────
  function addNightGroundDetails() {
    // Glowing floor lines at base of each building (like temple ghee lamps)
    window.CITY_DATA.buildings.forEach((b) => {
      const gc = parseInt((b.glowColor || "#ffcc44").slice(1), 16);
      const glow = new THREE.Mesh(
        new THREE.TorusGeometry(
          Math.max(b.size[0], b.size[1]) * 0.65,
          0.08,
          4,
          24,
        ),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0,
        }),
      );
      glow.rotation.x = Math.PI / 2;
      glow.position.set(b.pos[0], 0.08, b.pos[1]);
      glow.userData.isNightRing = true;
      glow.userData.gc = gc;
      scene.add(glow);
    });
  }

  // ── CENTERPIECE — Bruno Simon style island with bench, trees, glow ring ──
  function buildCenterpiece() {
    // Raised circular platform
    const islandMat = new THREE.MeshLambertMaterial({ color: 0xcc7755 }); // terracotta island
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 8.2, 0.55, 18),
      islandMat,
    );
    island.position.y = 0.28;
    scene.add(island);
    const paveMat = new THREE.MeshLambertMaterial({ color: 0xdd9977 }); // sandstone paving
    const pave = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.8, 0.2, 12),
      paveMat,
    );
    pave.position.y = 0.6;
    scene.add(pave);

    // Glowing ground ring (Bruno Simon neon floor circle)
    const groundRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.8, 0.12, 4, 48),
      new THREE.MeshBasicMaterial({
        color: 0xddaaff,
        transparent: true,
        opacity: 0.85,
      }),
    );
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = 0.72;
    scene.add(groundRing);
    scene.add(ptLight(0xddaaff, 2.0, 14, [0, 1.0, 0]));

    // Wooden bench
    const woodMat = new THREE.MeshToonMaterial({
      color: 0xcc8844,
      gradientMap: window._toonGrad,
    });
    const legMat = new THREE.MeshMatcapMaterial({
      color: 0x7755aa,
      matcap: matcaps.purple,
    });
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.1, 0.35),
        woodMat,
      );
      slat.position.set(0.2, 1.12, i * 0.4);
      scene.add(slat);
    }
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.1, 0.3),
        woodMat,
      );
      slat.position.set(0.2, 1.62, i * 0.36 - 0.42);
      slat.rotation.x = 0.28;
      scene.add(slat);
    }
    [
      [-0.85, -0.6],
      [0.85, -0.6],
      [-0.85, 0.6],
      [0.85, 0.6],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.88, 0.1), legMat);
      leg.position.set(x + 0.2, 0.68, z);
      scene.add(leg);
    });

    // Lamp posts
    const poleMat = new THREE.MeshMatcapMaterial({
      color: 0x776688,
      matcap: matcaps.purple,
    });
    [-3.5, 3.5].forEach((x) => {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 3.5, 0.14),
        poleMat,
      );
      pole.position.set(x, 1.75, -1.5);
      scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.28, 0.55),
        new THREE.MeshBasicMaterial({ color: 0xffeeaa }),
      );
      head.position.set(x, 3.6, -1.5);
      scene.add(head);
      scene.add(ptLight(0xffeeaa, isNight ? 2.5 : 0.4, 9, [x, 3.7, -1.5]));
    });

    // Cherry blossom trees around island — Bruno Simon signature
    [
      [4.5, 3.2],
      [-4.5, 3.2],
      [0, 5.5],
      [5.0, -2.5],
      [-5.0, -2.5],
    ].forEach(([x, z]) => {
      const trunkH = 1.6 + Math.random() * 0.8;
      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, trunkH, 0.22),
        new THREE.MeshMatcapMaterial({ color: 0x8a5228, matcap: matcaps.warm }),
      );
      trunk.position.set(x, trunkH / 2, z);
      scene.add(trunk);
      const pinks = [0xff88aa, 0xff99bb, 0xffaabb, 0xee7799];
      const r = 1.1 + Math.random() * 0.5;
      [0, 0.65 * r, -0.45 * r].forEach((ox, j) => {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(r * (0.82 + j * 0.1), 7, 5),
          new THREE.MeshMatcapMaterial({
            color: pinks[Math.floor(Math.random() * pinks.length)],
            matcap: matcaps.tree,
          }),
        );
        leaf.position.set(
          x + ox * 0.4,
          trunkH + r * 0.8 + j * 0.2,
          z + ox * 0.3,
        );
        scene.add(leaf);
      });
    });

    // Decorative stones
    const stoneMat = new THREE.MeshToonMaterial({
      color: 0xbbaa99,
      gradientMap: window._toonGrad,
    });
    [
      [2.5, 1.5],
      [-2.0, 2.8],
      [1.2, -2.4],
      [-3.0, -1.2],
    ].forEach(([x, z]) => {
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.12, 0),
        stoneMat,
      );
      stone.position.set(x, 0.65, z);
      stone.rotation.y = Math.random() * Math.PI;
      scene.add(stone);
    });

    // Downward-pointing arrow above island
    const arr = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.88, 4),
      new THREE.MeshBasicMaterial({
        color: 0xddaaff,
        transparent: true,
        opacity: 0.9,
      }),
    );
    arr.position.set(0, 5.5, 0);
    arr.rotation.z = Math.PI;
    arr.userData.isFloatArrow = true;
    arr.userData.baseY = 5.5;
    scene.add(arr);
  }

  // ── TREES (low-poly — flat-shaded spheres on sticks) ─────────────────────
  // Tree registry for shake on collision
  let trees = []; // { group, leaf, shakeT: 0 }

  function buildTrees() {
    const positions = [
      // ── CENTRAL ISLAND cluster ─────────────────────────────────────────
      [7, 7],
      [-7, 7],
      [7, -7],
      [-7, -7],
      [11, 0],
      [-11, 0],
      [0, 11],
      [0, -11],
      [14, 5],
      [-14, 5],
      [14, -5],
      [-14, -5],

      // ── MAIN BOULEVARD z=0 ─────────────────────────────────────────────
      [20, 5],
      [-20, 5],
      [20, -5],
      [-20, -5],
      [35, 5],
      [-35, 5],
      [35, -5],
      [-35, -5],
      [50, 5],
      [-50, 5],
      [50, -5],
      [-50, -5],
      [65, 5],
      [-65, 5],
      [65, -5],
      [-65, -5],
      [78, 5],
      [-78, 5],
      [78, -5],
      [-78, -5],

      // ── HERO ZONE z=-14 ────────────────────────────────────────────────
      [22, -14],
      [-22, -14],
      [22, -8],
      [-22, -8],
      [45, -18],
      [-45, -18],
      [45, -8],
      [-45, -8],

      // ── UPPER BELT z=-38 ───────────────────────────────────────────────
      [20, -38],
      [-20, -38],
      [40, -38],
      [-40, -38],
      [55, -38],
      [-55, -38],
      [70, -38],
      [-70, -38],
      [10, -44],
      [-10, -44],

      // ── EDUCATION BOULEVARD z=-62 ──────────────────────────────────────
      [8, -62],
      [-8, -62],
      [35, -62],
      [-35, -62],
      [8, -55],
      [-8, -55],
      [8, -70],
      [-8, -70],
      [34, -68],
      [-34, -68],
      [34, -56],
      [-34, -56],

      // ── FAR SOUTH ──────────────────────────────────────────────────────
      [0, -80],
      [18, -80],
      [-18, -80],
      [35, -80],
      [-35, -80],

      // ── SOUTH BOULEVARD z=42 ───────────────────────────────────────────
      [20, 42],
      [-20, 42],
      [40, 42],
      [-40, 42],
      [55, 42],
      [-55, 42],
      [70, 42],
      [-70, 42],
      [0, 50],
      [18, 50],
      [-18, 50],

      // ── FAR NORTH (behind player spawn) ────────────────────────────────
      [20, 55],
      [-20, 55],
      [40, 55],
      [-40, 55],
      [0, 60],
      [10, 62],
      [-10, 62],

      // ── MID CROSS z=24 ─────────────────────────────────────────────────
      [20, 24],
      [-20, 24],
      [45, 24],
      [-45, 24],
      [55, 24],
      [-55, 24],
      [70, 30],
      [-70, 30],

      // ── EAST DISTRICT ──────────────────────────────────────────────────
      [78, 8],
      [78, -8],
      [78, 20],
      [78, 35],
      [78, 50],
      [86, 0],
      [86, 15],
      [86, 30],
      [86, -15],

      // ── WEST DISTRICT ──────────────────────────────────────────────────
      [-78, 8],
      [-78, -8],
      [-78, 20],
      [-78, 35],
      [-78, 50],
      [-86, 0],
      [-86, 15],
      [-86, 30],
      [-86, -15],

      // ── SCATTERED ORGANIC clusters ─────────────────────────────────────
      [28, -28],
      [-28, -28],
      [55, -20],
      [-55, -20],
      [55, -50],
      [-55, -50],
      [55, 10],
      [-55, 10],
      [45, 35],
      [-45, 35],
      [30, 50],
      [-30, 50],
    ];
    const leafColors = [
      P.treeLeaf1, // pink cherry blossom
      P.treeLeaf2, // autumn red-orange
      P.treeLeaf3, // bright green
      P.treeLeaf4, // golden yellow
      P.treeLeaf5, // deep amber
    ];

    // ── InstancedMesh for trunks (1 draw call for all trunks) ──────────────
    const trunkGeo = new THREE.BoxGeometry(0.22, 1.0, 0.22);
    const trunkMat = new THREE.MeshToonMaterial({
      color: P.treeTrunk,
      gradientMap: window._toonGrad,
    });
    const trunkInst = new THREE.InstancedMesh(
      trunkGeo,
      trunkMat,
      positions.length,
    );
    scene.add(trunkInst);

    const dummy = new THREE.Object3D();

    positions.forEach(([x, z], idx) => {
      const h = 1.0 + Math.random() * 1.1;
      const r = 0.9 + Math.random() * 0.65;
      const isCherryBlossom = Math.random() > 0.55;

      // Set trunk instance
      dummy.position.set(x, h * 0.65, z);
      dummy.scale.set(1, h * 1.3, 1);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);

      // Leaf — still individual (different colors/shapes need separate material)
      const lColor = leafColors[Math.floor(Math.random() * leafColors.length)];
      const lMat = new THREE.MeshToonMaterial({
        color: lColor,
        gradientMap: window._toonGrad,
      });

      const tg = new THREE.Group();
      tg.position.set(x, 0, z);

      let leafMesh;
      if (isCherryBlossom) {
        leafMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), lMat);
        leafMesh.position.y = h * 1.3 + r * 0.7;
        tg.add(leafMesh);
        const leaf2 = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.7, 5, 4),
          new THREE.MeshToonMaterial({
            color: lColor,
            gradientMap: window._toonGrad,
          }),
        );
        leaf2.position.set(r * 0.55, h * 1.3 + r * 0.9, r * 0.3);
        tg.add(leaf2);
      } else {
        leafMesh = new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.75, r * 2.0, 6),
          lMat,
        );
        leafMesh.position.y = h * 1.3 + r * 0.8;
        tg.add(leafMesh);
      }

      scene.add(tg);
      // Store leaf baseY for wind sway to bob around correct rest position
      leafMesh.userData.baseY = leafMesh.position.y;
      trees.push({
        group: tg,
        leaf: leafMesh,
        shakeT: 0,
        baseX: x,
        baseZ: z,
        r: r + 0.4,
      });
    });

    trunkInst.instanceMatrix.needsUpdate = true;
  }

  function shakeNearbyTrees(cx, cz, radius) {
    trees.forEach((t) => {
      const d = Math.hypot(cx - t.baseX, cz - t.baseZ);
      if (d < radius + t.r) {
        t.shakeT = 1.0; // start shake
      }
    });
  }

  function updateTrees(t) {
    trees.forEach((tr) => {
      if (tr.shakeT > 0) {
        // Oscillate leaf on X and Z
        const shake = Math.sin(t * 22) * tr.shakeT * 0.22;
        tr.leaf.rotation.x = shake;
        tr.leaf.rotation.z = shake * 0.7;
        tr.shakeT = Math.max(0, tr.shakeT - 0.025);
        if (tr.shakeT <= 0) {
          tr.leaf.rotation.x = 0;
          tr.leaf.rotation.z = 0;
        }
      }
    });
  }

  // ── LAMPS (low-poly) ─────────────────────────────────────────────────────
  function buildLamps() {
    const positions = [
      [11, 0],
      [-11, 0],
      [0, 11],
      [0, -11],
      [8, 8],
      [-8, 8],
      [8, -8],
      [-8, -8],
      [14, 5],
      [-14, 5],
      [14, -5],
      [-14, -5],
      [4, -22],
      [-4, -22],
      [4, -38],
      [-4, -38],
      [25, -33],
      [-25, -33],
      [5, -33],
      [-5, -33],
      [36, 4],
      [-36, 4],
      [36, -4],
      [-36, -4],
    ];
    // Bruno Simon: deep purple/blue poles, warm lamp heads
    const poleMat = new THREE.MeshMatcapMaterial({
      color: 0x554477,
      matcap: matcaps.purple || matcaps.cool,
    });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.88,
    });

    positions.forEach(([x, z]) => {
      // Main pole
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 4.8, 0.16),
        poleMat,
      );
      pole.position.set(x, 2.4, z);
      scene.add(pole);

      // Horizontal arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.8), poleMat);
      arm.position.set(x, 5.0, z + 0.4);
      scene.add(arm);

      // Lantern housing (hexagonal = Bruno Simon style)
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.52, 6),
        poleMat,
      );
      housing.position.set(x, 5.12, z + 0.78);
      scene.add(housing);

      // Glowing inner cube
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.28, 0.3),
        headMat,
      );
      glow.position.set(x, 5.12, z + 0.78);
      scene.add(glow);

      // Glass panels (transparent sides)
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.42, 6),
        glassMat,
      );
      glass.position.set(x, 5.12, z + 0.78);
      scene.add(glass);

      // Cap
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.28, 0.12, 6),
        poleMat,
      );
      cap.position.set(x, 5.42, z + 0.78);
      scene.add(cap);

      // Point light — warm and localised like Bruno Simon
      const lampLt = ptLight(0xffeeaa, isNight ? 2.8 : 0, 14, [
        x,
        5.12,
        z + 0.78,
      ]);
      lampLt.userData.isLampLight = true;
      lampLt.userData.flickPhase = Math.random() * Math.PI * 2;
      lampLt.userData.baseNightI = 2.8;
      scene.add(lampLt);
    });
  }

  // ── GRASS PATCHES — thick clumps around world edges (Bruno Simon style) ──
  function buildGrassPatches() {
    const grassColors = [P.grass1, P.grass2, P.grass3, 0xccdd44, 0x99cc33];
    const patchPositions = [
      // ── World border thick grass ───────────────────────────────────────
      [-85, 0],
      [-85, 20],
      [-85, -20],
      [-85, 40],
      [-85, -40],
      [-85, 55],
      [-85, -55],
      [85, 0],
      [85, 20],
      [85, -20],
      [85, 40],
      [85, -40],
      [85, 55],
      [85, -55],
      [0, -83],
      [20, -83],
      [-20, -83],
      [40, -83],
      [-40, -83],
      [60, -83],
      [-60, -83],
      [0, 62],
      [20, 62],
      [-20, 62],
      [40, 62],
      [-40, 62],
      [60, 62],
      [-60, 62],
      // ── Between roads ─────────────────────────────────────────────────
      [22, -28],
      [-22, -28],
      [50, -28],
      [-50, -28],
      [70, -28],
      [-70, -28],
      [22, 12],
      [-22, 12],
      [22, -4],
      [-22, -4],
      [50, 12],
      [-50, 12],
      [50, -4],
      [-50, -4],
      // ── Education corridor ─────────────────────────────────────────────
      [5, -50],
      [-5, -50],
      [15, -50],
      [-15, -50],
      [5, -56],
      [-5, -56],
      [15, -56],
      [-15, -56],
      [32, -45],
      [-32, -45],
      [32, -55],
      [-32, -55],
      // ── South boulevard edges ──────────────────────────────────────────
      [22, 50],
      [-22, 50],
      [40, 50],
      [-40, 50],
      [60, 50],
      [-60, 50],
      // ── Mid-world organic ──────────────────────────────────────────────
      [40, -32],
      [-40, -32],
      [55, -6],
      [-55, -6],
      [55, 18],
      [-55, 18],
      [70, 12],
      [-70, 12],
      [40, 30],
      [-40, 30],
    ];

    patchPositions.forEach(([x, z]) => {
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const gx = x + (Math.random() - 0.5) * 5;
        const gz = z + (Math.random() - 0.5) * 5;
        const w = 0.12 + Math.random() * 0.14;
        const h = 0.35 + Math.random() * 0.55; // MAX 0.9 — not tall spikes
        const col = grassColors[Math.floor(Math.random() * grassColors.length)];
        const mat = new THREE.MeshLambertMaterial({ color: col });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.5), mat);
        blade.position.set(gx, h / 2, gz);
        blade.rotation.y = Math.random() * Math.PI;
        blade.rotation.z = (Math.random() - 0.5) * 0.28;
        scene.add(blade);
      }
    });
  }

  // ── 3D NAME LETTERS — "ADITYA SRIVASTAVA" on the ground like Bruno Simon ─
  function build3DName() {
    // Player spawns at z=40 — name placed just behind, visible immediately
    const nameZ = 48; // adjusted for new spawn position

    function makeSprite(text, font, color, W, H) {
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, H / 2);
      const tex = new THREE.CanvasTexture(can);
      return new THREE.SpriteMaterial({ map: tex, transparent: true });
    }

    // ADITYA — big
    const sp1 = new THREE.Sprite(
      makeSprite(
        "ADITYA",
        "bold 58px 'Barlow Condensed',sans-serif",
        "#fff8f0",
        300,
        88,
      ),
    );
    sp1.scale.set(17, 5.2, 1);
    sp1.position.set(0, 3.5, nameZ);
    scene.add(sp1);

    // SRIVASTAVA — medium gold
    const sp2 = new THREE.Sprite(
      makeSprite(
        "SRIVASTAVA",
        "bold 46px 'Barlow Condensed',sans-serif",
        "#ffd088",
        360,
        72,
      ),
    );
    sp2.scale.set(16, 3.2, 1);
    sp2.position.set(0, 1.9, nameZ + 0.5);
    scene.add(sp2);

    // Role tag
    const sp3 = new THREE.Sprite(
      makeSprite(
        "// BACKEND ARCHITECT  ·  4 YEARS  ·  NOIDA, INDIA",
        "bold 20px 'Share Tech Mono',monospace",
        "#00ddff",
        440,
        42,
      ),
    );
    sp3.scale.set(16, 1.55, 1);
    sp3.position.set(0, 0.9, nameZ + 1.0);
    scene.add(sp3);

    // Physical slab beneath the text
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xf5ddc8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 6), slabMat);
    slab.position.set(0, 0.12, nameZ + 0.5);
    scene.add(slab);

    // Glowing rings on the slab
    [2.2, 3.5].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.065, 4, 20),
        new THREE.MeshBasicMaterial({
          color: 0xddaaff,
          transparent: true,
          opacity: 0.55 - i * 0.15,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.35, nameZ + 2.2);
      ring.userData.isRing = true;
      ring.userData.rotSpeed = 0.35 + i * 0.22;
      scene.add(ring);
    });
  }

  // ── CAREER TIMELINE RAIL ──────────────────────────────────────────────────
  // Runs along the education corridor between z=-62 and z=-38
  // Positioned at x=0 connecting the two education temples
  function buildCareerTimeline() {
    // Timeline runs at z=-57 — BETWEEN z=-62 education boulevard and z=-38 upper road
    // This is a dedicated visual corridor between the two education temples
    const TZ = -57;
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x00ddff,
      transparent: true,
      opacity: 0.75,
    });
    const railGold = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.75,
    });

    // Main rail — two parallel glowing lines, 80 units wide
    [-0.4, 0.4].forEach((offset, ri) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(80, 0.07, 0.14),
        ri === 0 ? railMat : railGold,
      );
      rail.position.set(0, 0.22, TZ + offset);
      scene.add(rail);
    });

    // Milestones spread across the full rail width
    const milestones = [
      { year: "2015", label: "B.Sc Begins", x: -35, color: "#34d399" },
      { year: "2019", label: "B.Sc Completed", x: -20, color: "#34d399" },
      { year: "2021", label: "M.Sc CS", x: -6, color: "#a78bfa" },
      { year: "JAN 2022", label: "Trainee Engineer", x: 8, color: "#ffcc44" },
      { year: "SEP 2022", label: "Junior SE", x: 22, color: "#ff9950" },
      { year: "2024", label: "Backend Architect", x: 35, color: "#ff6b00" },
    ];

    milestones.forEach(({ year, label, x, color }) => {
      const gc = parseInt(color.slice(1), 16);

      // Glowing post
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 2.4, 0.2),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      post.position.set(x, 1.2, TZ);
      scene.add(post);

      // Floating diamond gem
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      gem.position.set(x, 2.8, TZ);
      gem.userData.isTimelineGem = true;
      gem.userData.baseY = 2.8;
      gem.userData.phase = x * 0.38;
      scene.add(gem);

      // Point light glow
      const pl = new THREE.PointLight(gc, 1.0, 6);
      pl.position.set(x, 2.6, TZ);
      scene.add(pl);

      // Floating canvas label
      const cw = 180,
        ch = 78;
      const can = document.createElement("canvas");
      can.width = cw;
      can.height = ch;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = color;
      ctx.font = "bold 26px 'Barlow Condensed',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(year, cw / 2, 28);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "12px 'Share Tech Mono',monospace";
      ctx.fillText(label, cw / 2, 54);
      const tex = new THREE.CanvasTexture(can);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true }),
      );
      sp.scale.set(5.0, 2.15, 1);
      sp.position.set(x, 5.0, TZ);
      scene.add(sp);
    });
  }

  // ── CHECKPOINTS (Bruno Simon: diamond + beam + rings) ─────────────────────
  // ── P4: DIYA CHECKPOINT MARKERS ──────────────────────────────────────────
  // Replace cyberpunk diamonds with Hindu oil lamp diyas
  function buildCheckpoints() {
    window.CITY_DATA.buildings.forEach((b) => {
      if (!b.roadPos) return;
      const gc = pc(b.glowColor);
      const g = new THREE.Group();
      g.position.set(b.roadPos[0], 0, b.roadPos[1]);

      const stoneMat = new THREE.MeshToonMaterial({
        color: 0xddc99a,
        gradientMap: window._toonGrad,
      });
      const claymMat = new THREE.MeshToonMaterial({
        color: 0xcc7744,
        gradientMap: window._toonGrad,
      });
      const goldMat = new THREE.MeshToonMaterial({
        color: 0xffcc44,
        gradientMap: window._toonGrad,
      });

      // ── DIYA GROUP (3 diyas arranged in a triangle) ──────────────────
      const diyaPositions = [
        [0, 0],
        [-1.2, 1.2],
        [1.2, 1.2],
      ];
      diyaPositions.forEach(([dx, dz], di) => {
        const dg = new THREE.Group();
        dg.position.set(dx, 0, dz);

        // Clay diya bowl (torus segment = bowl shape)
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.18, 0.18, 10),
          claymMat,
        );
        bowl.position.y = 0.09;
        dg.add(bowl);

        // Oil surface (flat disc inside)
        const oil = new THREE.Mesh(
          new THREE.CircleGeometry(0.22, 10),
          new THREE.MeshBasicMaterial({ color: 0xffaa33 }),
        );
        oil.rotation.x = -Math.PI / 2;
        oil.position.y = 0.19;
        dg.add(oil);

        // Flame — two overlapping cones that flicker
        const flameCol = new THREE.Color(gc);
        const flameMat = new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.92,
        });
        const flameOuter = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.38, 5),
          flameMat.clone(),
        );
        flameOuter.position.y = 0.52;
        flameOuter.userData.isDiyaFlame = true;
        flameOuter.userData.phase = di * 0.9 + dx * 0.5;
        dg.add(flameOuter);

        const flameInner = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.22, 5),
          new THREE.MeshBasicMaterial({
            color: 0xffffaa,
            transparent: true,
            opacity: 0.95,
          }),
        );
        flameInner.position.y = 0.54;
        flameInner.userData.isDiyaFlame = true;
        flameInner.userData.phase = di * 0.9 + dx * 0.5 + 0.3;
        dg.add(flameInner);

        diyaFlames.push(flameOuter, flameInner);

        // Warm point light per diya
        const dLight = new THREE.PointLight(gc, 0, 8);
        dLight.position.y = 0.6;
        dLight.userData.isDiyaLight = true;
        dLight.userData.phase = di * 0.7;
        dg.add(dLight);
        // Cache world position at build time for fast distance check
        diyaLights.push({
          light: dLight,
          wx: b.roadPos[0] + dx,
          wz: b.roadPos[1] + dz,
          phase: di * 0.7,
        });

        // Small stone base
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.42, 0.1, 8),
          stoneMat,
        );
        base.position.y = 0.05;
        dg.add(base);

        g.add(dg);
      });

      // ── RANGOLI GROUND PATTERN (decorative circle on ground) ─────────
      // Outer ring
      const rangoli = new THREE.Mesh(
        new THREE.TorusGeometry(2.8, 0.09, 4, 24),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.45,
        }),
      );
      rangoli.rotation.x = Math.PI / 2;
      rangoli.position.y = 0.04;
      rangoli.userData.cpRing = true;
      rangoli.userData.phase = 0;
      g.add(rangoli);

      // Inner petal ring (8 petals)
      for (let p = 0; p < 8; p++) {
        const ang = (p / 8) * Math.PI * 2;
        const petal = new THREE.Mesh(
          new THREE.CircleGeometry(0.32, 6),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
          }),
        );
        petal.rotation.x = -Math.PI / 2;
        petal.rotation.z = ang;
        petal.position.set(Math.cos(ang) * 1.8, 0.04, Math.sin(ang) * 1.8);
        g.add(petal);
      }

      // ── TALL INCENSE SMOKE BEAM (subtle, replaces the harsh beam) ────
      const beamH = b.height + 4;
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, beamH, 4),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.12,
        }),
      );
      beam.position.y = beamH / 2;
      g.add(beam);

      // Name sprite floating above
      const diamond = null; // no more diamond
      const pRing = rangoli;

      g.userData = { buildingId: b.id, beamH };
      scene.add(g);
      checkpointGroups.push({ group: g, building: b, diamond, pRing });
    });
  }

  // ── ATMOSPHERE (floating particles) ──────────────────────────────────────
  function buildAtmosphere() {
    // ── FLOATING BLOSSOM PETALS — Bruno Simon's magical atmosphere ────────
    // Pink/orange/yellow petals drifting through the air
    const cnt = 380;
    const pos = new Float32Array(cnt * 3);
    const col = new Float32Array(cnt * 3);
    const vel = new Float32Array(cnt * 3); // drift velocity per petal

    for (let i = 0; i < cnt; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      // Drift: slow horizontal + slight downward
      vel[i * 3] = (Math.random() - 0.5) * 0.012;
      vel[i * 3 + 1] = -0.006 - Math.random() * 0.008;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.012;
      // Colors: pink, soft orange, pale yellow, white
      const t = Math.random();
      if (t < 0.4) {
        // pink blossom
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.55;
        col[i * 3 + 2] = 0.68;
      } else if (t < 0.65) {
        // warm orange
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.78;
        col[i * 3 + 2] = 0.35;
      } else if (t < 0.82) {
        // soft yellow
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.55;
      } else {
        // pale white
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.92;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const petals = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.22,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
      }),
    );
    petals.userData.isPetals = true;
    petals.userData.vel = vel;
    scene.add(petals);
  }

  // ── CAR (Clean low-poly SUV — one unified body, correct wheels) ──────────
  function buildCar() {
    carGroup = new THREE.Group();
    wheelGroups = [];

    // ── MATCAP HELPERS ────────────────────────────────────────────────────
    function mM(key, color) {
      return new THREE.MeshMatcapMaterial({
        color,
        matcap: matcaps[key] || matcaps.warm,
      });
    }

    // ── MATERIALS ──────────────────────────────────────────────────────────
    const mBody = mM("car", 0xdd2200); // candy red — Bruno Simon exact
    const mDark = mM("carDark", 0x881200); // dark red cabin/hood
    const mBlack = mM("dark", 0x181210); // near-black chassis
    const mArch = mM("carDark", 0x771100); // wheel arch flares
    const mGlass = new THREE.MeshMatcapMaterial({
      color: 0x4477aa,
      matcap: matcaps.glass,
      transparent: true,
      opacity: 0.68,
    });
    const mChrome = mM("chrome", 0xbbbbaa);
    const mTyre = mM("tyre", 0x141210);
    const mRed = mM("car", 0xcc2000); // red trim/hubs

    // ── PROPORTIONS ───────────────────────────────────────────────────────
    // Bruno Simon key secret: wheels are HUGE relative to body
    // Body squished vertically, wheels tall and wide = toy-truck silhouette
    const WR = 0.58; // wheel radius  — BIG
    const WW = 0.46; // wheel width   — WIDE
    const WTX = 1.22; // wheel track X — very wide stance
    const WFZ = 1.55; // front axle Z
    const WRZ = -1.55; // rear  axle Z
    const AXH = WR; // axle height = wheel radius

    // Body sits close above axle
    const BY = AXH + 0.04; // body base Y
    const BH = 0.46; // body height — keep low (squished)
    const BW = 1.58; // body width
    const BD = 2.95; // body depth (length)

    const CY = BY + BH; // cabin base Y
    const CH = 0.52; // cabin height
    const CW = 1.38; // cabin width (narrower than body)
    const CD = 1.6; // cabin depth
    const CZ = -0.2; // cabin offset rearward

    const RY = CY + CH; // roof Y

    // ── UNDERCARRIAGE ────────────────────────────────────────────────────
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 0.1, 0.18, BD),
      mBlack,
    );
    under.position.y = AXH + 0.09;
    carGroup.add(under);

    // Diff humps (axle covers)
    [WFZ, WRZ].forEach((z) => {
      const hump = new THREE.Mesh(
        new THREE.BoxGeometry(BW - 0.1, 0.22, 0.55),
        mBlack,
      );
      hump.position.set(0, AXH + 0.22, z);
      carGroup.add(hump);
    });

    // ── MAIN BODY ─────────────────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), mBody);
    body.position.y = BY + BH / 2;
    carGroup.add(body);
    carBodyMesh = body;

    // Side rock-sliders (black protective rails)
    [-BW / 2 - 0.02, BW / 2 + 0.02].forEach((x) => {
      const slider = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.14, BD - 0.3),
        mBlack,
      );
      slider.position.set(x, BY + 0.07, 0);
      carGroup.add(slider);
    });

    // Body crease lines (raised detail strips on sides)
    [-BW / 2 + 0.04, BW / 2 - 0.04].forEach((x) => {
      const crease = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, BH * 0.45, BD * 0.7),
        mDark,
      );
      crease.position.set(x, BY + BH * 0.55, 0);
      carGroup.add(crease);
    });

    // ── WHEEL ARCH FLARES — Bruno Simon's signature feature ───────────────
    // Super-wide flares that extend FAR beyond the body width
    const archW = 0.22; // how far flare extends outward
    const archH = 0.42;
    const archD = 1.12;
    [WFZ * 0.64, WRZ * 0.64].forEach((z) => {
      [-1, 1].forEach((side) => {
        const ox = side * (BW / 2 + archW / 2 - 0.02);
        // Main arch slab
        const arch = new THREE.Mesh(
          new THREE.BoxGeometry(archW, archH, archD),
          mArch,
        );
        arch.position.set(ox, BY + 0.22, z);
        carGroup.add(arch);
        // Arch lip — flat black bottom edge
        const lip = new THREE.Mesh(
          new THREE.BoxGeometry(archW + 0.06, 0.07, archD + 0.04),
          mBlack,
        );
        lip.position.set(ox, BY + 0.02, z);
        carGroup.add(lip);
        // Arch top bevel
        const bevel = new THREE.Mesh(
          new THREE.BoxGeometry(archW - 0.04, 0.09, archD - 0.06),
          mDark,
        );
        bevel.position.set(ox, BY + archH * 0.82, z);
        carGroup.add(bevel);
      });
    });

    // ── CABIN ─────────────────────────────────────────────────────────────
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CD), mDark);
    cabin.position.set(0, CY + CH / 2, CZ);
    carGroup.add(cabin);

    // Cabin corner pillars (A/B pillars) — Bruno Simon detail
    [
      [-CW / 2 + 0.06, CD * 0.46],
      [CW / 2 - 0.06, CD * 0.46],
      [-CW / 2 + 0.06, -CD * 0.46],
      [CW / 2 - 0.06, -CD * 0.46],
    ].forEach(([x, z]) => {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, CH, 0.1),
        mBlack,
      );
      pillar.position.set(x, CY + CH / 2, CZ + z);
      carGroup.add(pillar);
    });

    // ── ROOF ──────────────────────────────────────────────────────────────
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(CW + 0.05, 0.1, CD + 0.02),
      mBlack,
    );
    roof.position.set(0, RY + 0.05, CZ);
    carGroup.add(roof);

    // Roof rack rails
    [-CW / 2 + 0.1, CW / 2 - 0.1].forEach((x) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, CD * 0.78),
        mChrome,
      );
      rail.position.set(x, RY + 0.1, CZ);
      carGroup.add(rail);
    });
    // Roof rack cross-bars
    [-0.38, 0.18, 0.62].forEach((zOff) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(CW * 0.82, 0.04, 0.05),
        mChrome,
      );
      bar.position.set(0, RY + 0.115, CZ + zOff - 0.1);
      carGroup.add(bar);
    });

    // LED light bar on roof-front (glowing)
    const ledBar = new THREE.Mesh(
      new THREE.BoxGeometry(CW * 0.92, 0.07, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xfffbe8 }),
    );
    ledBar.position.set(0, RY + 0.12, CZ + CD / 2 - 0.04);
    carGroup.add(ledBar);
    const ledPt = new THREE.PointLight(0xfffbe8, isNight ? 1.8 : 0, 10);
    ledPt.position.set(0, RY + 0.22, CZ + CD / 2 + 0.5);
    carGroup.add(ledPt);

    // ── HOOD ──────────────────────────────────────────────────────────────
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.12, 0.09, 0.92),
      mBody,
    );
    hood.position.set(0, BY + BH + 0.045, WFZ * 0.72);
    carGroup.add(hood);
    // Power bulge
    const bulge = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.06, 0.72),
      mDark,
    );
    bulge.position.set(0, BY + BH + 0.085, WFZ * 0.72);
    carGroup.add(bulge);

    // ── WINDSHIELDS ───────────────────────────────────────────────────────
    // Front windshield — slightly angled
    const wsF = new THREE.Mesh(
      new THREE.BoxGeometry(CW - 0.08, CH * 0.82, 0.08),
      mGlass,
    );
    wsF.position.set(0, CY + CH * 0.48, CZ + CD / 2 + 0.01);
    wsF.rotation.x = 0.24;
    carGroup.add(wsF);
    // Rear windshield
    const wsR = new THREE.Mesh(
      new THREE.BoxGeometry(CW - 0.08, CH * 0.78, 0.08),
      mGlass,
    );
    wsR.position.set(0, CY + CH * 0.46, CZ - CD / 2 - 0.01);
    wsR.rotation.x = -0.22;
    carGroup.add(wsR);
    // Side windows
    [-1, 1].forEach((side) => {
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, CH * 0.74, CD * 0.68),
        mGlass,
      );
      sw.position.set(side * (CW / 2 + 0.02), CY + CH * 0.5, CZ);
      carGroup.add(sw);
    });

    // ── FRONT FACE ────────────────────────────────────────────────────────
    // Grille surround (full front face)
    const gFront = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.06, BH * 0.72, 0.09),
      mBlack,
    );
    gFront.position.set(0, BY + BH * 0.38, WFZ + BD / 2 - 0.04);
    carGroup.add(gFront);

    // Horizontal grille slats
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(BW - 0.28, 0.04, 0.06),
        mDark,
      );
      slat.position.set(0, BY + 0.08 + i * 0.08, WFZ + BD / 2 + 0.01);
      carGroup.add(slat);
    }

    // Round headlights — G-Wagon / Bruno Simon style
    [-0.54, 0.54].forEach((x) => {
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12),
        mBlack,
      );
      housing.rotation.x = Math.PI / 2;
      housing.position.set(x, BY + BH * 0.52, WFZ + BD / 2 + 0.01);
      carGroup.add(housing);
      // Lens
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.155, 12),
        new THREE.MeshBasicMaterial({ color: 0xffeeaa }),
      );
      lens.position.set(x, BY + BH * 0.52, WFZ + BD / 2 + 0.06);
      carGroup.add(lens);
      // DRL ring
      const drl = new THREE.Mesh(
        new THREE.TorusGeometry(0.175, 0.022, 6, 14),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      drl.position.set(x, BY + BH * 0.52, WFZ + BD / 2 + 0.055);
      carGroup.add(drl);
    });

    // Headlight point lights
    carHL = new THREE.PointLight(0xffe8aa, isNight ? 8 : 0, 16);
    carHL.position.set(0, BY + BH * 0.5, WFZ + BD / 2 + 1.2);
    carGroup.add(carHL);
    carHR = carHL; // single forward light, share ref

    // Front bumper
    const bmpF = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 0.08, 0.2, 0.17),
      mBlack,
    );
    bmpF.position.set(0, BY + 0.1, WFZ + BD / 2 + 0.04);
    carGroup.add(bmpF);
    // Bull-bar
    const bull = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.28, 0.2, 0.1),
      mChrome,
    );
    bull.position.set(0, BY + 0.3, WFZ + BD / 2 + 0.07);
    carGroup.add(bull);
    // Bull-bar uprights
    [-0.44, 0.44].forEach((x) => {
      const up = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, BH * 0.55, 0.09),
        mChrome,
      );
      up.position.set(x, BY + BH * 0.28, WFZ + BD / 2 + 0.07);
      carGroup.add(up);
    });
    // Tow hooks
    [-0.38, 0.38].forEach((x) => {
      const hk = new THREE.Mesh(
        new THREE.TorusGeometry(0.065, 0.02, 5, 9),
        mM("gold", 0xddaa00),
      );
      hk.rotation.y = Math.PI / 2;
      hk.position.set(x, BY + 0.06, WFZ + BD / 2 + 0.1);
      carGroup.add(hk);
    });

    // ── REAR FACE ────────────────────────────────────────────────────────
    // Full-width tail light strip
    const tStrip = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.12, 0.07, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff1800 }),
    );
    tStrip.position.set(0, BY + BH * 0.72, WRZ - BD / 2 - 0.02);
    carGroup.add(tStrip);
    // Reverse lights
    [-0.42, 0.42].forEach((x) => {
      const rev = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.12, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffeedd }),
      );
      rev.position.set(x, BY + BH * 0.32, WRZ - BD / 2 - 0.02);
      carGroup.add(rev);
    });
    // Rear bumper
    const bmpR = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 0.08, 0.19, 0.16),
      mBlack,
    );
    bmpR.position.set(0, BY + 0.1, WRZ - BD / 2 - 0.04);
    carGroup.add(bmpR);
    // Tail-pipe
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.22, 7),
      mChrome,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-BW / 2 + 0.2, BY + 0.06, WRZ - BD / 2 - 0.08);
    carGroup.add(pipe);

    // Tail lights point-light
    carTL = new THREE.PointLight(0xff1800, isNight ? 2.8 : 0, 8);
    carTL.position.set(0, BY + BH * 0.7, WRZ - BD / 2 - 1.0);
    carGroup.add(carTL);
    carTR = carTL; // share ref

    // ── WHEELS × 4 ───────────────────────────────────────────────────────
    // Larger, fatter wheels — Bruno Simon's most iconic visual
    [
      [WTX, AXH, WFZ, false], // FR
      [-WTX, AXH, WFZ, true], // FL
      [WTX, AXH, WRZ, false], // RR
      [-WTX, AXH, WRZ, true], // RL
    ].forEach(([wx, wy, wz, isLeft]) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      carGroup.add(wg);

      // Spin group — rotation.x = forward roll
      const sg = new THREE.Group();
      wg.add(sg);
      wheelGroups.push(sg);

      // ── TYRE ──────────────────────────────────────────────────────────
      const tyre = new THREE.Mesh(
        new THREE.CylinderGeometry(WR, WR, WW, 14),
        mTyre,
      );
      tyre.rotation.z = Math.PI / 2;
      sg.add(tyre);

      // Tread ribs (chunky off-road detail)
      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2;
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(WW + 0.02, WR * 0.12, WR * 0.22),
          new THREE.MeshMatcapMaterial({
            color: 0x1e1a14,
            matcap: matcaps.tyre || matcaps.dark,
          }),
        );
        rib.rotation.x = ang;
        rib.position.y = 0;
        sg.add(rib);
      }

      // ── RED INNER RIM RING ────────────────────────────────────────────
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.76, WR * 0.76, WW + 0.04, 14),
        mRed,
      );
      rim.rotation.z = Math.PI / 2;
      sg.add(rim);

      // ── 5-SPOKE WHEEL FACE (outer side) ──────────────────────────────
      const outerX = isLeft ? -(WW / 2 + 0.015) : WW / 2 + 0.015;
      const faceDir = isLeft ? -1 : 1;

      // Hub disc — solid red
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.38, WR * 0.38, 0.06, 12),
        mRed,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = outerX + faceDir * 0.008;
      sg.add(hub);

      // 5 spokes fanning out from hub
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * Math.PI * 2;
        const spk = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, WR * 1.18, WW * 0.28),
          mChrome,
        );
        spk.rotation.x = ang;
        spk.position.x = outerX;
        sg.add(spk);
      }

      // Center cap
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8),
        mChrome,
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.x = outerX + faceDir * 0.035;
      sg.add(cap);

      // Cap logo dot
      const logo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.02, 6),
        new THREE.MeshBasicMaterial({ color: 0x00ddff }),
      );
      logo.rotation.z = Math.PI / 2;
      logo.position.x = outerX + faceDir * 0.065;
      sg.add(logo);
    });

    // ── CAR TOP-LIGHT (warm fill from above — studio look) ────────────────
    const carTopLight = new THREE.PointLight(0xffcc88, isNight ? 2.2 : 1.0, 5);
    carTopLight.position.set(0, 3.8, 0);
    carGroup.add(carTopLight);

    // ── BLOB SHADOW ───────────────────────────────────────────────────────
    const shadowDisc = new THREE.Mesh(
      new THREE.EllipseCurve()
        ? new THREE.CircleGeometry(2.6, 20)
        : new THREE.CircleGeometry(2.6, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.scale.set(1, 0.65, 1); // oval under car
    shadowDisc.position.y = 0.03;
    carGroup.add(shadowDisc);

    carGroup.position.set(carX, 0, carZ);
    carGroup.rotation.y = carAngle; // FIX: face correct direction from first frame
    scene.add(carGroup);
  }
  function buildWaveLines() {
    const waveMat = new THREE.MeshBasicMaterial({
      color: 0x8899ff,
      transparent: true,
      opacity: 0.35,
    });
    // Curved wave lines along the shore edges
    const wavePositions = [
      { x: -52, z: 0, w: 0.12, d: 80, ry: 0 },
      { x: 52, z: 0, w: 0.12, d: 80, ry: 0 },
      { x: 0, z: -50, w: 80, d: 0.12, ry: 0 },
      { x: 0, z: 40, w: 80, d: 0.12, ry: 0 },
    ];
    wavePositions.forEach((wp) => {
      for (let i = 0; i < 3; i++) {
        const wl = new THREE.Mesh(
          new THREE.BoxGeometry(
            wp.w > 0.5 ? wp.w : 2,
            0.04,
            wp.d > 0.5 ? wp.d : 2,
          ),
          waveMat.clone(),
        );
        const offset = 2 + i * 3;
        wl.position.set(
          wp.x + (wp.w < 0.5 ? offset * (wp.x > 0 ? -1 : 1) : 0),
          -0.1 + i * 0.02,
          wp.z + (wp.d < 0.5 ? offset * (wp.z > 0 ? -1 : 1) : 0),
        );
        wl.userData.waveIdx = i;
        wl.userData.wavePhase = i * 0.8;
        scene.add(wl);
        waveLines.push(wl);
      }
    });
  }
  function box(w, h, d, color, pos, segs) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }),
    );
    if (pos) m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function ptLight(col, intensity, dist, pos) {
    const l = new THREE.PointLight(col, intensity, dist);
    if (pos) l.position.set(...pos);
    return l;
  }

  // ── AUDIO ─────────────────────────────────────────────────────────────────
  function initAudio() {
    if (audioStarted) return;
    audioStarted = true;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();

      // Engine oscillator
      engOsc = audioCtx.createOscillator();
      engOsc.type = "sawtooth";
      engOsc.frequency.value = 55;
      engGain = audioCtx.createGain();
      engGain.gain.value = 0;
      const dist = audioCtx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = ((Math.PI + 35) * x) / (Math.PI + 35 * Math.abs(x));
      }
      dist.curve = curve;
      const lpf = audioCtx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = 300;
      engOsc.connect(dist);
      dist.connect(lpf);
      lpf.connect(engGain);
      engGain.connect(audioCtx.destination);
      engOsc.start();
      startMusic();
    } catch (e) {}
  }

  function startMusic() {
    if (musicStarted || !audioCtx) return;
    musicStarted = true;

    // Master gain with slow fade-in
    musicGain = audioCtx.createGain();
    musicGain.gain.setValueAtTime(0, audioCtx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 5);
    musicGain.connect(audioCtx.destination);

    // ── REVERB (convolution reverb simulation with noise buffer) ──────
    const reverbNode = audioCtx.createConvolver();
    const reverbBuf = audioCtx.createBuffer(
      2,
      audioCtx.sampleRate * 2.5,
      audioCtx.sampleRate,
    );
    for (let c = 0; c < 2; c++) {
      const d = reverbBuf.getChannelData(c);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    }
    reverbNode.buffer = reverbBuf;
    const reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.35;
    reverbNode.connect(reverbGain);
    reverbGain.connect(musicGain);

    // ── DEEP AMBIENT PAD (warm low-frequency drones) ──────────────────
    // Kounine's music for Bruno Simon is warm, dreamy, slightly lo-fi
    // We simulate with detuned sine/triangle layers + reverb
    const padFreqs = [55, 82.41, 110, 138.59, 165, 220];
    padFreqs.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      o.type = i % 3 === 0 ? "sine" : i % 3 === 1 ? "triangle" : "sine";
      o.frequency.value = f + (Math.random() - 0.5) * 1.5; // slight detune for warmth
      const g = audioCtx.createGain();
      g.gain.value = 0.028 + (i < 2 ? 0.015 : 0);
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 280 + i * 80;
      // Slow LFO tremolo
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = 0.04 + Math.random() * 0.05;
      const lfoG = audioCtx.createGain();
      lfoG.gain.value = 0.008;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      lfo.start();
      o.connect(lp);
      lp.connect(g);
      g.connect(musicGain);
      g.connect(reverbNode);
      o.start();
    });

    // ── KICK DRUM ─────────────────────────────────────────────────────
    function kick() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const k = audioCtx.createOscillator();
      k.frequency.setValueAtTime(90, now);
      k.frequency.exponentialRampToValueAtTime(25, now + 0.28);
      const kg = audioCtx.createGain();
      kg.gain.setValueAtTime(0.18, now);
      kg.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      k.connect(kg);
      kg.connect(musicGain);
      k.start(now);
      k.stop(now + 0.36);
      setTimeout(kick, 2000 + Math.random() * 400);
    }
    setTimeout(kick, 2800);

    // ── MELODIC NOTES (warm pentatonic) ─────────────────────────────────
    // Minor pentatonic in A for that melancholy-dreamy feel Bruno Simon has
    const pentatonic = [220, 261.63, 293.66, 349.23, 392, 440, 523.25, 587.33];
    function playNote() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      const n = audioCtx.createOscillator();
      n.type = "triangle";
      n.frequency.value = freq;
      // Slight pitch envelope for plucked feel
      n.frequency.setValueAtTime(freq * 1.008, now);
      n.frequency.exponentialRampToValueAtTime(freq, now + 0.08);
      const ng = audioCtx.createGain();
      ng.gain.setValueAtTime(0, now);
      ng.gain.linearRampToValueAtTime(0.06, now + 0.04);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      n.connect(lp);
      lp.connect(ng);
      ng.connect(musicGain);
      ng.connect(reverbNode);
      n.start(now);
      n.stop(now + 1.5);
      setTimeout(playNote, 1800 + Math.random() * 3200);
    }
    setTimeout(playNote, 5000);

    // ── HI-HAT ────────────────────────────────────────────────────────
    function hihat() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const buf = audioCtx.createBuffer(
        1,
        audioCtx.sampleRate * 0.06,
        audioCtx.sampleRate,
      );
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - (i / d.length) * 4);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const hpf = audioCtx.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 7000;
      const hg = audioCtx.createGain();
      hg.gain.value = 0.03;
      src.connect(hpf);
      hpf.connect(hg);
      hg.connect(musicGain);
      src.start(now);
      setTimeout(hihat, 500 + Math.random() * 250);
    }
    setTimeout(hihat, 3500);
  }

  function setMusicVolume(v) {
    if (musicGain && audioCtx)
      musicGain.gain.setTargetAtTime(v * 0.18, audioCtx.currentTime, 0.3);
  }

  function updateEngineSound(spd) {
    if (!audioCtx || !engOsc || !engGain) return;
    const abs = Math.abs(spd);
    const speedRatio = abs / MAX_SPD; // 0→1

    // ── ENGINE pitch + gain scale with speed ───────────────────────────────
    engOsc.frequency.setTargetAtTime(
      50 + abs * 320,
      audioCtx.currentTime,
      0.07,
    );
    engGain.gain.setTargetAtTime(
      abs > 0.008 ? Math.min(0.1, 0.02 + abs * 0.14) : 0.014,
      audioCtx.currentTime,
      0.1,
    );

    // ── WIND — rises strongly above 40% speed, peaks at max ───────────────
    // ambientLayers.wind = { node, gain } — gain is a GainNode
    if (ambientLayers.wind && ambientLayers.wind.gain) {
      const windTarget =
        speedRatio > 0.38 ? Math.min(0.14, (speedRatio - 0.38) * 0.28) : 0;
      ambientLayers.wind.gain.gain.setTargetAtTime(
        windTarget,
        audioCtx.currentTime,
        0.18, // slow attack / slow release feels natural
      );
    }
  }

  function playBrake() {
    if (!audioCtx) return;
    const b = audioCtx.createBuffer(
      1,
      audioCtx.sampleRate * 0.25,
      audioCtx.sampleRate,
    );
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - (i / d.length) * 2.5);
    const s = audioCtx.createBufferSource();
    s.buffer = b;
    const g = audioCtx.createGain();
    g.gain.value = 0.12;
    const h = audioCtx.createBiquadFilter();
    h.type = "highpass";
    h.frequency.value = 2000;
    s.connect(h);
    h.connect(g);
    g.connect(audioCtx.destination);
    s.start();
  }

  function playCrash() {
    if (!audioCtx) return;
    const b = audioCtx.createBuffer(
      1,
      audioCtx.sampleRate * 0.4,
      audioCtx.sampleRate,
    );
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const dc = Math.max(0, 1 - i / (d.length * 0.5));
      d[i] = (Math.random() * 2 - 1) * dc * 0.8;
    }
    const s = audioCtx.createBufferSource();
    s.buffer = b;
    const g = audioCtx.createGain();
    g.gain.value = 0.35;
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 800;
    s.connect(lp);
    lp.connect(g);
    g.connect(audioCtx.destination);
    s.start();
  }

  // ── CONTROLS ─────────────────────────────────────────────────────────────
  function setupControls() {
    window.addEventListener("keydown", (e) => {
      if (!audioStarted) initAudio();
      keys[e.code] = true;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.key,
        )
      )
        e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      if (
        (e.code === "ArrowDown" || e.code === "KeyS") &&
        Math.abs(carSpeed) > 0.06
      )
        playBrake();
      if (e.code === "Space" && Math.abs(carSpeed) > 0.02) playBrake();
      keys[e.code] = false;
    });
    window.addEventListener("pointerdown", () => {
      if (!audioStarted) initAudio();
    });
  }

  // ── COLLISION ─────────────────────────────────────────────────────────────
  function collides(nx, nz) {
    for (const b of buildingBoxes) {
      if (
        nx > b.minX - CAR_HW &&
        nx < b.maxX + CAR_HW &&
        nz > b.minZ - CAR_HD &&
        nz < b.maxZ + CAR_HD
      )
        return true;
    }
    return false;
  }

  // ── CAR PHYSICS (scalar — zero drift) ────────────────────────────────────
  function updateCar() {
    // ── FOCUS GUARD — freeze car while panel is open ──────────────────────
    if (CAM.state === "FOCUS" || CAM.state === "FOCUS_TRANSITION") {
      // Apply friction to bring velocity to zero naturally
      carVx *= 0.82;
      carVz *= 0.82;
      if (Math.abs(carVx) < 0.0001) carVx = 0;
      if (Math.abs(carVz) < 0.0001) carVz = 0;
      carSpeed = Math.hypot(carVx, carVz);
      carGroup.position.set(carX, 0, carZ);
      updateEngineSound(carSpeed);
      return;
    }

    // ── AUTO-DRIVE — steer toward map-click target ─────────────────────────
    if (autoDriveActive && autoDriveTarget) {
      const dx = autoDriveTarget.x - carX;
      const dz = autoDriveTarget.z - carZ;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.5) {
        autoDriveActive = false;
        autoDriveTarget = null;
      } else {
        const targetAng = Math.atan2(dx, dz);
        let diff = targetAng - carAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        steerAngle +=
          (Math.max(-1, Math.min(1, diff / 0.6)) * MAX_STEER_ANGLE -
            steerAngle) *
          0.18;
        if (Math.abs(steerAngle) < 0.0005) steerAngle = 0;
        carAngle += steerAngle;
        carSinA = Math.sin(carAngle);
        carCosA = Math.cos(carAngle);
        const fwdSpd = Math.min(
          MAX_SPD * 0.7,
          Math.hypot(carVx, carVz) + ENGINE_FORCE * 0.8,
        );
        carVx = carSinA * fwdSpd;
        carVz = carCosA * fwdSpd;
        const nx = carX + carVx,
          nz = carZ + carVz;
        if (!collides(nx, nz)) {
          carX = nx;
          carZ = nz;
        } else autoDriveActive = false;
        carX = Math.max(-95, Math.min(95, carX));
        carZ = Math.max(-88, Math.min(65, carZ));
        carSpeed = fwdSpd;
        _applyCarVisuals();
        prevSpeed = carSpeed;
        updateEngineSound(carSpeed);
        window.CityUI?.updateHUD(carSpeed);
        window.CityUI?.updateMinimap(carX, carZ, -carAngle);
        checkProximity();
        return;
      }
    }

    const tj = window._touchJoy || { ax: 0, ay: 0 };

    // ── INPUT SAMPLING ─────────────────────────────────────────────────────
    const fwd = keys["ArrowUp"] || keys["KeyW"] || tj.ay < -0.25;
    const bwd = keys["ArrowDown"] || keys["KeyS"] || tj.ay > 0.25;
    const lft = keys["ArrowLeft"] || keys["KeyA"] || tj.ax < -0.25;
    const rgt = keys["ArrowRight"] || keys["KeyD"] || tj.ax > 0.25;
    const brk = keys["Space"];
    if ((fwd || bwd || lft || rgt || brk) && autoDriveActive)
      autoDriveActive = false;

    const throttle = tj.ay < 0 ? Math.min(1, -tj.ay / 0.6) : fwd ? 1 : 0;
    const reverse = tj.ay > 0 ? Math.min(1, tj.ay / 0.6) : bwd ? 1 : 0;
    const steerRaw = Math.abs(tj.ax) > 0.15 ? -tj.ax : lft ? 1 : rgt ? -1 : 0;

    // ── WEATHER GRIP ────────────────────────────────────────────────────────
    const grip = weatherGrip; // 1.0=dry, 0.3=rain, 0.12=snow

    // ── STEP 1: UPDATE STEER ANGLE ──────────────────────────────────────────
    // Speed-sensitive steering: high speed = reduced authority (stability)
    const velMag = Math.hypot(carVx, carVz);
    const speedRatioForSteer = Math.min(1, velMag / MAX_SPD);
    const steerAuthority = MAX_STEER_ANGLE * (1.0 - speedRatioForSteer * 0.45);
    const steerTarget = steerRaw * steerAuthority;
    const steerLerp = steerRaw !== 0 ? STEER_RATE : STEER_RELEASE;
    steerAngle += (steerTarget - steerAngle) * steerLerp;
    if (Math.abs(steerAngle) < 0.00035) steerAngle = 0;

    // ── STEP 2: ROTATE CAR HEADING ──────────────────────────────────────────
    // Only yaw when moving — stationary cars don't spin
    if (velMag > 0.004) {
      const turnRate =
        steerAngle *
        Math.sign(
          // project velocity onto car forward axis — handles reverse correctly
          carVx * Math.sin(carAngle) + carVz * Math.cos(carAngle),
        );
      carAngle += turnRate;
    }
    carSinA = Math.sin(carAngle);
    carCosA = Math.cos(carAngle);

    // ── STEP 3: APPLY ENGINE / BRAKE FORCES ─────────────────────────────────
    // Project current velocity onto car axes
    const fwdVel = carVx * carSinA + carVz * carCosA; // longitudinal speed
    const latVel = carVx * carCosA - carVz * carSinA; // lateral speed (slip)

    let accelForce = 0;
    if (throttle > 0) {
      // Torque curve: peaks in mid-range, tapers at limit (like real IC engine)
      const t = Math.abs(fwdVel) / MAX_SPD;
      const torque = t < 0.15 ? 1.6 : t < 0.55 ? 1.2 : 0.7; // strong launch punch
      accelForce = ENGINE_FORCE * torque * (0.6 + grip * 0.4) * throttle;
      if (fwdVel >= MAX_SPD) accelForce = 0;
    } else if (reverse > 0) {
      if (fwdVel > -MAX_SPD * REV_MAX_RATIO) {
        accelForce = -ENGINE_FORCE * 0.55 * grip * reverse;
      }
    } else if (brk) {
      // Handbrake — reduces lateral grip dramatically (drift potential)
      accelForce = -Math.sign(fwdVel) * BRAKE_FORCE * 1.5;
    }

    // ── STEP 4: APPLY FRICTION FORCES ───────────────────────────────────────
    // Longitudinal friction (rolling resistance — always opposes motion)
    const longFric = LONG_FRICTION * (0.4 + grip * 0.6); // grip affects friction less
    let newFwdVel = fwdVel + accelForce;
    newFwdVel *= 1 - longFric;
    if (Math.abs(newFwdVel) < 0.0008) newFwdVel = 0;

    // Lateral friction (tire grip — corrects sideways sliding)
    // Reduces proportional to braking (handbrake = slide) and weather
    const latGrip = brk ? LAT_FRICTION * 0.18 : LAT_FRICTION;
    const newLatVel = latVel * (1 - latGrip * grip * 0.85);

    // ── STEP 5: RECONSTRUCT WORLD VELOCITY FROM CAR AXES ────────────────────
    carVx = carSinA * newFwdVel + carCosA * newLatVel;
    carVz = carCosA * newFwdVel - carSinA * newLatVel;

    // ── STEP 6: CLAMP TO MAX SPEED ───────────────────────────────────────────
    const newMag = Math.hypot(carVx, carVz);
    if (newMag > MAX_SPD) {
      const s = MAX_SPD / newMag;
      carVx *= s;
      carVz *= s;
      carSpeed = MAX_SPD;
    } else {
      carSpeed = newMag;
    }

    // ── STEP 7: INTEGRATE POSITION ───────────────────────────────────────────
    const nx = carX + carVx;
    const nz = carZ + carVz;

    // ── AXIS-SEPARATED COLLISION — slide along walls, bounce off face ────────
    // Try full move first, then each axis independently.
    // This lets the car slide along a wall face rather than stopping dead.
    let movedX = false,
      movedZ = false;
    if (!collides(nx, nz)) {
      carX = nx;
      carZ = nz;
      movedX = true;
      movedZ = true;
      if (carSpeed > 0.08) shakeNearbyTrees(carX, carZ, 2.5);
    } else {
      // Try sliding along X axis only
      if (!collides(nx, carZ)) {
        carX = nx;
        movedX = true;
        // Z is blocked — reflect Z velocity off the wall (wall normal = Z)
        carVz *= -0.28;
      }
      // Try sliding along Z axis only
      if (!collides(carX, nz)) {
        carZ = nz;
        movedZ = true;
        if (!movedX) {
          // X is blocked — reflect X velocity
          carVx *= -0.28;
        }
      }
      // Both axes blocked — full stop with small bounce
      if (!movedX && !movedZ) {
        carVx *= -0.22;
        carVz *= -0.22;
      }

      // Trigger crash feedback once per cooldown
      if (crashCooldown <= 0 && carSpeed > 0.04) {
        playCrash();
        shakeCam();
        shakeNearbyTrees(carX, carZ, 6);
        crashCooldown = 45;
      }
      carSpeed = Math.hypot(carVx, carVz);
    }
    if (crashCooldown > 0) crashCooldown--;
    carX = Math.max(-95, Math.min(95, carX));
    carZ = Math.max(-88, Math.min(65, carZ));

    // ── STEP 8: APPLY VISUALS (derived from physics state) ───────────────────
    _applyCarVisuals();

    // ── AUDIO + UI ────────────────────────────────────────────────────────────
    if (prevSpeed > 0.09 && carSpeed < 0.03) playBrake();
    prevSpeed = carSpeed;
    updateEngineSound(carSpeed);
    window.CityUI?.updateHUD(carSpeed);
    window.CityUI?.updateMinimap(carX, carZ, -carAngle);
    checkProximity();
  }

  // ── CAR VISUALS — all cosmetic, derived from physics state each frame ─────
  function _applyCarVisuals() {
    carGroup.position.set(carX, 0, carZ);
    carGroup.rotation.y = carAngle;

    // Body roll — proportional to lateral acceleration (centripetal feel)
    // Use lat velocity change as proxy for lateral G-force
    const latAcc = carVx * carCosA - carVz * carSinA; // current lateral speed
    const rollTarget =
      -latAcc * 6.0 * (1.0 + (Math.abs(carSpeed) / MAX_SPD) * 1.0);
    carBodyRoll += (rollTarget - carBodyRoll) * 0.12;
    carGroup.rotation.z = carBodyRoll;

    // Suspension — spring-damper responding to speed and terrain bumps
    // Speed-proportional frequency so fast driving feels rougher
    const _t = clock ? clock.elapsedTime : Date.now() * 0.001;
    const bumpFreq = 5.0 + carSpeed * 40; // high freq at speed = road vibration
    const bumpAmp = carSpeed * 0.028 + Math.abs(steerAngle) * carSpeed * 0.04;
    const bumpForce = Math.sin(_t * bumpFreq) * bumpAmp;
    // Spring: F = -k*x - c*v (Hooke's law)
    const springK = 28,
      springD = 8;
    suspensionVY +=
      (bumpForce - suspensionY * springK - suspensionVY * springD) * 0.016;
    suspensionY += suspensionVY;
    suspensionY = Math.max(-0.04, Math.min(0.12, suspensionY)); // tight stops
    suspensionVY = Math.max(-0.08, Math.min(0.08, suspensionVY)); // damp velocity
    carGroup.position.y = suspensionY;

    // Wheel spin — proportional to forward velocity, not total speed
    const fwdVelForSpin = carVx * carSinA + carVz * carCosA;
    const spin = fwdVelForSpin * 2.8;
    wheelGroups.forEach((sg) => {
      sg.rotation.x += spin;
    });

    // Cam shake from crash (handled in camera director)
  }

  function shakeCam() {
    CAM.shakeAmt = 0.95; // strong crash shake
  }

  // ── PROXIMITY ─────────────────────────────────────────────────────────────
  function checkProximity() {
    if (!gameStarted) return;
    let closest = null;
    let closestDist = PROX;
    window.CITY_DATA.buildings.forEach((b) => {
      const rx = b.roadPos ? b.roadPos[0] : b.pos[0];
      const rz = b.roadPos ? b.roadPos[1] : b.pos[1];
      const d = Math.hypot(carX - rx, carZ - rz);
      if (d < closestDist) {
        closestDist = d;
        closest = b;
      }
    });
    if (closest !== proximityBuilding) {
      proximityBuilding = closest;
      buildingMeshes.forEach((bm) => highlightBuilding(bm.building.id, false));
      if (closest) {
        window.CityUI?.showNotification(closest);
        highlightBuilding(closest.id, true);
      } else window.CityUI?.hideNotification();
    }
  }

  function highlightBuilding(id, on) {
    // With BuildingEntity system, highlight is handled by entity state
    // This function now just handles blob shadow + safe color tint
    buildingMeshes.forEach((bm) => {
      if (bm.building.id !== id) return;
      if (!bm.bodyMat || !bm.bodyMat.color) return; // guard for ToonMaterial
      const baseHex =
        bm.bodyMat.userData.baseColor || bm.bodyMat.color.getHex();
      if (!bm.bodyMat.userData.baseColor)
        bm.bodyMat.userData.baseColor = baseHex;
      if (on) {
        const gc = pc(bm.building.glowColor);
        const baseC = new THREE.Color(baseHex);
        const glowC = new THREE.Color(gc);
        bm.bodyMat.color.setRGB(
          Math.min(1, baseC.r + glowC.r * 0.18),
          Math.min(1, baseC.g + glowC.g * 0.18),
          Math.min(1, baseC.b + glowC.b * 0.18),
        );
        const bs = blobShadows.find((s) => s.building.id === id);
        if (bs) bs.mesh.material.opacity = 0.85;
      } else {
        bm.bodyMat.color.setHex(baseHex);
        const bs = blobShadows.find((s) => s.building.id === id);
        if (bs) bs.mesh.material.opacity = 0.6;
      }
    });
  }

  function enterNearestBuilding() {
    if (!proximityBuilding) return;
    const b = proximityBuilding;
    // Cinematic moment: bloom + energy burst + select audio
    triggerBuildingSelectCinematic(b);
    // Entity select — dims all others, spawns burst
    const ent = buildingEntities.find((e) => e.b.id === b.id);
    if (ent) {
      selectedEntity = ent;
      ent.select();
    }
    // CameraDirector cinematic focus with transition whoosh
    playTransitionWhoosh();
    focusCameraOnBuilding(b);
  }

  function spawnConfetti(cx, cz, color) {
    const colors = [color, 0xff88aa, 0xffcc44, 0x7dff4f, 0x00ddff, 0xff9950];
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
    });
    const pieces = [];
    for (let i = 0; i < 60; i++) {
      // more confetti
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.04),
        new THREE.MeshBasicMaterial({
          color: colors[Math.floor(Math.random() * colors.length)],
          transparent: true,
          opacity: 0.92,
        }),
      );
      c.position.set(
        cx + (Math.random() - 0.5) * 2,
        1.5,
        cz + (Math.random() - 0.5) * 2,
      );
      c.userData.vx = (Math.random() - 0.5) * 0.22;
      c.userData.vy = 0.12 + Math.random() * 0.18;
      c.userData.vz = (Math.random() - 0.5) * 0.22;
      c.userData.life = 1.0;
      scene.add(c);
      pieces.push(c);
    }
    confettiPieces.push(...pieces);
  }

  function updateCarLights() {
    if (carHL) {
      carHL.intensity = isNight ? 7 : 0;
      carHR.intensity = isNight ? 7 : 0;
    }
    if (carTL) {
      carTL.intensity = isNight ? 2.5 : 0;
      carTR.intensity = isNight ? 2.5 : 0;
    }
  }

  function updateWindowLights() {
    windowMaterials.forEach((wm) => {
      if (isNight) {
        wm.mat.opacity = wm.isLit ? 0.88 : 0.05;
      } else {
        // Day: windows slightly visible as dark recesses for architectural detail
        wm.mat.opacity = 0.18;
      }
    });
  }

  // ── ANIMATE ───────────────────────────────────────────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);

    // ── TIMING — getDelta MUST come first, getElapsedTime internally calls it ──
    // If you call getElapsedTime() first, getDelta() returns ~0 → dt=0 → camera frozen
    const dt = Math.min(clock.getDelta(), 0.05);
    const now = clock.elapsedTime;

    // ── FRAME COUNTER — throttle heavy systems ─────────────────────────────
    if (!animate._frame) animate._frame = 0;
    animate._frame = (animate._frame + 1) % 120;
    const frame = animate._frame;
    const everyOther = (frame & 1) === 0; // every 2nd frame (~30fps budget)
    const everyFour = (frame & 3) === 0; // every 4th frame (~15fps budget)
    const everyEight = (frame & 7) === 0; // every 8th frame (~7.5fps budget)

    // ── CORE — runs every frame (physics, camera, input) ─────────────────
    updateCar();
    updateCameraDirector(now, dt);
    if (gameStarted) updateVignette(dt);

    // ── MEDIUM — every 2nd frame (proximity, trail, player ring) ─────────
    if (everyOther) {
      updatePlayerPresence(now, dt);
      updateNarrative(now, dt);
    }

    // ── SLOW — every 4th frame (trees, flags, audio) ─────────────────────
    if (everyFour) {
      updateWindSway(now);
      updateFlagWave(now);
      updateDistrictAudio();
      if (!IS_MOBILE) updateSpatialAudio();
    }

    // ── SLOWEST — every 8th frame (weather particles, district audio) ────
    if (everyEight) {
      updateWeatherParticles();
      updateWorldPanel(now, dt);
    }

    // (worldPanel update throttled to everyEight above)

    // P3: Yatra flow — only when visible, throttled
    if (NARRATIVE.yatraCurve && NARRATIVE.yatraVisible && everyOther) {
      updateYatraFlow(dt, NARRATIVE.yatraCurve);
    }

    // P4: Completion ring expansion
    completionRings = completionRings.filter((ring) => {
      ring.userData.t += ring.userData.speed;
      const t = ring.userData.t;
      ring.scale.setScalar(1 + t * 5);
      ring.material.opacity = Math.max(0, 0.8 - t * 0.8);
      if (ring.material.opacity <= 0) {
        scene.remove(ring);
        return false;
      }
      return true;
    });

    // ── HOVER AUDIO — throttled (audio doesn't need 60fps) ─────────────────
    if (everyOther) {
      const hoverEnt = buildingEntities.find(
        (e) => e.state === "HOVER" || e.state === "ACTIVE",
      );
      if (hoverEnt && hoverEnt.b.id !== lastHoverBuildingId) {
        playBuildingHover(hoverEnt.b.id);
      } else if (!hoverEnt) {
        lastHoverBuildingId = null;
      }
    }

    // (Camera director now runs first in throttled loop above)

    // ── BUILDING ENTITIES — every 2nd frame (state machine doesn't need 60fps)
    if (gameStarted && everyOther) {
      buildingEntities.forEach((ent) => {
        const dist = Math.hypot(carX - ent.b.pos[0], carZ - ent.b.pos[1]);
        ent.update(now, dt, dist);
      });
    }

    // ── ALL VFX + LIVING WORLD — only after game starts ──────────────────────
    if (gameStarted) {
      // ── LIVING WORLD UPDATES ──────────────────────────────────────────────────
      windTime += dt;
      updateWindSway(now);
      updateFlagWave(now);
      updateRoadEnergyFlow(dt);
      updateDivineParticles(now, dt);
      updateGroundShimmers(now);
      burstPool = burstPool.filter((m) => {
        m.userData.burstT += dt / (m.userData.burstDur || 0.85);
        const p = Math.min(1, m.userData.burstT);
        m.scale.setScalar(0.3 + p * 9.0); // larger burst
        m.material.opacity = (1 - p) * 0.8;
        if (p >= 1) {
          scene.remove(m);
          return false;
        }
        return true;
      });

      // Energy streams — positions cached at build time, no per-frame find()
      if (everyOther) {
        energyStreams.forEach((stream) => {
          const srcPos = stream.userData.srcPos;
          const dstPos = stream.userData.dstPos;
          if (!srcPos || !dstPos) return;
          const nearDist = Math.min(
            Math.hypot(carX - srcPos[0], carZ - srcPos[1]),
            Math.hypot(carX - dstPos[0], carZ - dstPos[1]),
          );
          const targetOp =
            nearDist < 40 ? Math.min(0.45, (40 - nearDist) / 20) : 0;
          stream.material.opacity +=
            (targetOp - stream.material.opacity) * 0.06;
          if (stream.material.opacity > 0.03) {
            const total = stream.geometry.attributes.position.count;
            const offset = Math.floor(
              (now * 8 + stream.userData.animOff) % total,
            );
            stream.geometry.setDrawRange(offset, 12);
          }
        });
      }

      // ── PER-BUILDING VFX IDENTITY — only near buildings ─────────────────────────
      if (everyOther)
        Object.entries(buildingVfx).forEach(([id, vfx]) => {
          // Use cached entity reference on vfx object (set at init)
          const ent =
            vfx._cachedEnt ||
            (vfx._cachedEnt = buildingEntities.find((e) => e.b.id === id));
          const vi = ent ? ent.vfxI : 0;
          if (vi < 0.01) return; // skip entirely if dormant

          // Solar crown — rotate + ray pulse
          if (vfx.userData.isSolarCrown) {
            vfx.rotation.y = now * 0.16;
            vfx.children.forEach((c) => {
              if (c.userData.isSolarRay) {
                const p = 0.72 + Math.sin(now * 1.9 + c.userData.phase) * 0.22;
                c.scale.setScalar(p * vi);
                c.material.opacity =
                  0.55 * vi +
                  Math.sin(now * 2.8 + c.userData.phase) * 0.18 * vi;
              }
            });
          }

          // Forge sparks — shoot up and reset
          vfx.children.forEach((c) => {
            if (c.userData.isSparks) {
              const pos = c.geometry.attributes.position.array;
              const vel = c.userData.vel;
              const N = pos.length / 3;
              const baseH = c.userData.baseH || 10;
              for (let i = 0; i < N; i++) {
                pos[i * 3] += vel[i * 3];
                pos[i * 3 + 1] += vel[i * 3 + 1];
                pos[i * 3 + 2] += vel[i * 3 + 2];
                vel[i * 3 + 1] -= 0.003; // gravity
                if (pos[i * 3 + 1] > baseH + 6 || pos[i * 3 + 1] < baseH - 1) {
                  pos[i * 3] = Math.random() - 0.5;
                  pos[i * 3 + 1] = baseH;
                  pos[i * 3 + 2] = Math.random() - 0.5;
                  vel[i * 3] = (Math.random() - 0.5) * 0.04;
                  vel[i * 3 + 1] = 0.04 + Math.random() * 0.06;
                  vel[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
                }
              }
              c.geometry.attributes.position.needsUpdate = true;
              c.material.opacity = 0.75 * vi;
            }

            // Knowledge orbs — orbit at different speeds
            if (c.userData.orbI !== undefined) {
              const i = c.userData.orbI,
                r = c.userData.orbR,
                bh = c.userData.orbH;
              const a = now * (0.45 + i * 0.12) + i * 1.1;
              c.position.set(
                Math.cos(a) * r,
                bh + Math.sin(now * 0.8 + i) * 0.6,
                Math.sin(a) * r,
              );
              c.material.opacity = 0.55 * vi + Math.sin(now * 1.5 + i) * 0.15;
            }

            // Wind trail rings — wobble + orbit
            if (c.userData.windRing) {
              c.rotation.y = now * (0.55 + c.userData.phase * 0.12);
              c.rotation.x = Math.sin(now * 0.7 + c.userData.phase) * 0.35;
              c.material.opacity = (0.35 - c.userData.phase * 0.08) * vi;
            }

            // Cloud wisps — drift horizontally
            if (c.userData.wisp) {
              c.position.x =
                c.userData.baseX +
                Math.sin(now * 0.18 + c.userData.phase) * 4.5;
              c.material.opacity = 0.22 * vi;
            }

            // Gold coin drop
            if (c.userData.coinDrop) {
              c.position.y -= c.userData.speed;
              c.rotation.x += 0.06;
              c.rotation.z += 0.04;
              if (c.position.y < 0.5) {
                c.position.y = c.userData.baseH;
              }
              c.material.opacity = 0.75 * vi;
            }

            // Glyph orbits (education)
            if (c.userData.glyphOrbit) {
              const ang =
                now * (0.4 + c.userData.i * 0.15) + c.userData.i * 1.05;
              c.position.set(
                Math.cos(ang) * c.userData.r,
                8 + Math.sin(ang * 0.6) * 1.5,
                Math.sin(ang) * c.userData.r,
              );
              c.rotation.y = ang * 1.3;
              c.material.opacity = 0.6 * vi;
            }
          });
        });

      // ── DIVINE BEAMS (night-only gopuram spotlights) ───────────────────────────
      divineBeams.forEach((s) => {
        const target = isNight ? 3.0 : 0;
        s.intensity += (target - s.intensity) * 0.035;
      });

      // ── PRANA AURA — central island particle drift ────────────────────────────
      if (pranaParticles) {
        const pos = pranaParticles.geometry.attributes.position.array;
        const vel = pranaParticles.userData.vel;
        const N = pos.length / 3;
        for (let i = 0; i < N; i++) {
          pos[i * 3] += vel[i * 3] + Math.sin(now * 0.5 + i * 0.3) * 0.003;
          pos[i * 3 + 1] += vel[i * 3 + 1];
          pos[i * 3 + 2] +=
            vel[i * 3 + 2] + Math.cos(now * 0.4 + i * 0.3) * 0.003;
          if (pos[i * 3 + 1] > 9) {
            const r = 6 + Math.random() * 4,
              a = Math.random() * Math.PI * 2;
            pos[i * 3] = Math.cos(a) * r;
            pos[i * 3 + 1] = 0;
            pos[i * 3 + 2] = Math.sin(a) * r;
          }
        }
        pranaParticles.geometry.attributes.position.needsUpdate = true;
      }
      // Prana rings — throttled to everyFour
      if (everyFour)
        scene.children.forEach((c) => {
          if (c.userData.isPranaRing) {
            const pulse = 1 + Math.sin(now * 1.2 + c.userData.phase) * 0.04;
            c.scale.setScalar(pulse);
            c.rotation.z = now * (0.12 + c.userData.phase * 0.05);
            c.material.opacity =
              0.38 + Math.sin(now * 1.8 + c.userData.phase) * 0.1;
          }
        });

      // ── HELP SIGN — fades out once player drives away from spawn ─────────────
      scene.children.forEach((c) => {
        if (c.userData.isHelpSign && c.material) {
          const d = Math.hypot(carX, carZ - 40);
          if (d > 5)
            c.material.opacity = Math.max(0, c.material.opacity - 0.012);
        }
      });

      // ── BIRDS ─────────────────────────────────────────────────────────────────
      if (birdGroup && !IS_MOBILE) {
        birdGroup.children.forEach((bird) => {
          const r = bird.userData.orbitR,
            h = bird.userData.orbitH;
          const sp = bird.userData.orbitSpeed,
            ph = bird.userData.orbitPhase,
            fp = bird.userData.flapPhase;
          bird.position.set(
            Math.cos(now * sp + ph) * r,
            h + Math.sin(now * 1.4 + fp) * 1.5,
            Math.sin(now * sp + ph) * r,
          );
          bird.rotation.y = -(now * sp + ph) - Math.PI / 2;
          bird.children.forEach((c) => {
            if (c.userData.isWing)
              c.rotation.z =
                c.userData.side * (0.22 + Math.sin(now * 5.5 + fp) * 0.38);
          });
        });
      }

      // ── DIYA FLAMES + LIGHTS ──────────────────────────────────────────────────
      diyaFlames.forEach((f) => {
        if (!f.material) return;
        const fl =
          Math.sin(now * 8.5 + f.userData.phase) * 0.08 + Math.random() * 0.04;
        f.scale.set(1 + fl, 1 + fl * 0.5, 1 + fl);
        f.rotation.y = Math.sin(now * 3.2 + f.userData.phase) * 0.18;
        f.material.opacity = 0.82 + fl;
      });
      diyaLights.forEach((d) => {
        const dist = Math.hypot(carX - d.wx, carZ - d.wz);
        const fl = 0.8 + Math.sin(now * 7.8 + d.phase) * 0.2;
        d.light.intensity = isNight
          ? Math.max(0, Math.min(1, (25 - dist) / 25)) * 2.4 * fl
          : Math.max(0, Math.min(1, (14 - dist) / 14)) * 0.65 * fl;
      });

      // ── WAVE LINES + ROAD SHIMMER ─────────────────────────────────────────────
      waveLines.forEach((wl) => {
        if (wl.userData.isRoadShimmer) {
          // Speed-driven flow: shimmer plane position shifts along its axis at speed
          // This makes road lines visually rush past proportional to car velocity
          const flowSpeed = carSpeed * 2.8;
          const phaseOff = wl.userData.phase || 0;
          const sweep = (now * (0.22 + flowSpeed) + phaseOff) % (Math.PI * 2);
          // Opacity: brighter and more visible at speed
          const baseOp = 0.04 + carSpeed * 0.12;
          wl.material.opacity = Math.min(0.22, baseOp + Math.sin(sweep) * 0.04);
          // Shift the plane along its road axis to simulate motion
          const isNS = Math.abs(wl.rotation.z) < 0.1; // N-S roads use Z offset
          if (isNS) {
            wl.position.z =
              (((wl.userData.baseZ || 0) - now * flowSpeed * 3.5) % 180) - 90;
          } else {
            wl.position.x =
              (((wl.userData.baseX || 0) - now * flowSpeed * 3.5) % 180) - 90;
          }
        } else {
          const pulse =
            Math.sin(now * 1.4 + (wl.userData.wavePhase || 0)) * 0.5 + 0.5;
          wl.material.opacity = 0.1 + pulse * 0.35;
          const scl = 1 + pulse * 0.08;
          wl.scale.set(scl, 1, scl);
        }
      });

      // ── CENTERPIECE + HERO RINGS ──────────────────────────────────────────────
      scene.children.forEach((c) => {
        if (c.userData.isRing) c.rotation.z = now * c.userData.rotSpeed;
      });
      buildingMeshes.forEach(({ group }) => {
        group.children.forEach((c) => {
          if (c.userData.heroRing)
            c.rotation.z = now * (0.45 + c.userData.ri * 0.22);
          if (c.userData.isOrb) {
            c.rotation.y = now * 0.9;
            if (c.material)
              c.material.opacity = 0.8 + Math.sin(now * 2.2) * 0.5 * 0.2;
          }
        });
      });

      // ── CHECKPOINT DIYA ANIMATIONS ────────────────────────────────────────────
      checkpointGroups.forEach(({ group, building, diamond, pRing }) => {
        const rx = building.roadPos ? building.roadPos[0] : building.pos[0];
        const rz = building.roadPos ? building.roadPos[1] : building.pos[1];
        const dist = Math.hypot(carX - rx, carZ - rz);
        const farAlpha = Math.max(0, Math.min(1, (dist - 2) / 14));
        const nearPulse = dist < 10 ? Math.sin(now * 3.5) * 0.3 + 0.9 : 1.0;
        group.traverse((c) => {
          if (
            c.isMesh &&
            c.material &&
            c.material.transparent &&
            c.material.opacity >= 0
          ) {
            if (!c.userData._mbo) c.userData._mbo = c.material.opacity;
            c.material.opacity = c.userData._mbo * farAlpha * nearPulse;
          }
        });
        if (pRing) {
          const s = 1 + Math.sin(now * 2.2 + building.pos[0]) * 0.16;
          pRing.scale.set(s, 1, s);
        }
      });

      // ── BLOSSOM PETALS ────────────────────────────────────────────────────────
      scene.children.forEach((c) => {
        if (!c.userData.isPetals) return;
        const pos = c.geometry.attributes.position.array,
          vel = c.userData.vel,
          cnt = pos.length / 3;
        for (let i = 0; i < cnt; i++) {
          pos[i * 3] += vel[i * 3];
          pos[i * 3 + 1] += vel[i * 3 + 1];
          pos[i * 3 + 2] += vel[i * 3 + 2];
          pos[i * 3] += Math.sin(now * 0.7 + i * 0.4) * 0.003;
          if (pos[i * 3 + 1] < 0) {
            pos[i * 3] = (Math.random() - 0.5) * 90;
            pos[i * 3 + 1] = 16 + Math.random() * 4;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
          }
        }
        c.geometry.attributes.position.needsUpdate = true;
      });

      // ── TIMELINE GEMS + FLOAT ARROW + CHAKRA ─────────────────────────────────
      scene.children.forEach((c) => {
        if (c.userData.isTimelineGem) {
          c.position.y =
            c.userData.baseY + Math.sin(now * 1.8 + c.userData.phase) * 0.22;
          c.rotation.y = now * 1.2;
        }
        if (c.userData.isFloatArrow)
          c.position.y = c.userData.baseY + Math.sin(now * 2.2) * 0.28;
        if (c.userData.isChakra) c.rotation.z = now * 0.45;
      });

      // ── WORLD LABELS + INFO BOARDS — INSTANT hide during focus ───────────────
      // BUG FIX: slow fade (0.1/frame) left sprites at 0.6 opacity when camera arrived
      // at close range — canvas text filled the entire screen. Now instant-zero on focus.
      const inFocus = CAM.state === "FOCUS" || CAM.state === "FOCUS_TRANSITION";
      const spriteLerpFactor = inFocus ? 0.35 : 0.08; // fast hide, slow show

      worldLabels.forEach((sprite) => {
        const b = sprite.userData.building;
        const rx = b.roadPos ? b.roadPos[0] : b.pos[0];
        const rz = b.roadPos ? b.roadPos[1] : b.pos[1];
        const dist = Math.hypot(carX - rx, carZ - rz);
        const target = inFocus
          ? 0
          : dist < 28 && dist > 4
            ? Math.min(1, (28 - dist) / 14)
            : 0;
        sprite.material.opacity +=
          (target - sprite.material.opacity) * spriteLerpFactor;
        if (!inFocus)
          sprite.position.y =
            sprite.userData.baseY + Math.sin(now * 1.3 + b.pos[0] * 0.4) * 0.18;
      });
      infoBoardSprites.forEach((sprite) => {
        const b = sprite.userData.building;
        const dist = Math.hypot(carX - b.pos[0], carZ - b.pos[1]);
        const target = inFocus
          ? 0
          : dist < 22 && dist > 5
            ? Math.min(1, (22 - dist) / 10)
            : 0;
        sprite.material.opacity +=
          (target - sprite.material.opacity) * spriteLerpFactor;
        if (!inFocus)
          sprite.position.y =
            sprite.userData.baseY + Math.sin(now * 0.9 + b.pos[0] * 0.3) * 0.12;
      });

      // ── CONFETTI ──────────────────────────────────────────────────────────────
      if (confettiPieces.length > 0) {
        confettiPieces = confettiPieces.filter((c) => {
          c.userData.vy -= 0.008;
          c.position.x += c.userData.vx;
          c.position.y += c.userData.vy;
          c.position.z += c.userData.vz;
          c.rotation.x += 0.18;
          c.rotation.y += 0.12;
          c.userData.life -= 0.025;
          c.material.opacity = c.userData.life * 0.92;
          if (c.userData.life <= 0) {
            scene.remove(c);
            return false;
          }
          return true;
        });
      }

      // ── PROXIMITY GLOW PULSE ──────────────────────────────────────────────────
      if (isNight) {
        buildingMeshes.forEach(({ bodyMat, building }) => {
          const baseHex = bodyMat.userData.baseColor;
          if (!baseHex) return;
          const gc = pc(building.glowColor),
            glowC = new THREE.Color(gc),
            baseC = new THREE.Color(baseHex),
            curr = bodyMat.color;
          if (
            Math.abs(curr.r - baseC.r) > 0.015 ||
            Math.abs(curr.g - baseC.g) > 0.015
          ) {
            const p = Math.sin(now * 2.4) * 0.02;
            bodyMat.color.setRGB(
              Math.min(1, curr.r + p),
              Math.min(1, curr.g + p * (glowC.g + 0.1)),
              Math.min(1, curr.b + p * (glowC.b + 0.1)),
            );
          }
        });
      }

      // ── NIGHT SKY + ARCH GLOWS + ZONE AMBIENTS + GROUND RINGS ────────────────
      if (starField) {
        const targetOp = isNight ? 0.92 : 0;
        starField.material.opacity +=
          (targetOp - starField.material.opacity) * 0.04;
        starField.rotation.y = now * 0.0008;
      }
      archGlows.forEach((g) => {
        const ti = isNight ? 3.5 : 0;
        g.intensity += (ti - g.intensity) * 0.04;
      });
      zoneAmbients.forEach((l) => {
        const baseI = l.userData.nightI || 0.35;
        const ti = isNight ? baseI * 3.2 : baseI * 0.2;
        l.intensity += (ti - l.intensity) * 0.03;
      });
      scene.children.forEach((c) => {
        if (c.userData.isNightRing) {
          const to = isNight
            ? 0.55 + Math.sin(now * 2.1 + c.position.x * 0.3) * 0.12
            : 0;
          if (c.material)
            c.material.opacity += (to - c.material.opacity) * 0.04;
        }
      });

      // ── SELECTION RINGS on entities ───────────────────────────────────────────
      // (handled inside BuildingEntity.update — no extra code needed)
    } // end if (gameStarted)

    renderer.render(scene, camera);
  }

  function onResize() {
    const W = window.innerWidth,
      H = window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }
  function destroy() {
    if (animId) cancelAnimationFrame(animId);
  }

  return {
    init,
    destroy,
    enterNearestBuilding,
    cycleWeather,
    setMusicVolume,
    initAudio,

    triggerIntro() {
      gameStarted = true; // unlock proximity, audio, narrative
      ensureVignette(); // create DOM vignette overlay for input feedback
      // Reset camera spring state — prevents oscillation from STATIC orbit position
      camVx = 0;
      camVy = 0;
      camVz = 0;
      camera.position.set(8, 320, 80); // higher start = more god-like reveal
      camera.lookAt(0, 0, 0);
      CAM.state = "INTRO";
      CAM.introT = 0;
      CAM._flashed = false;
      // Resume AudioContext on first user gesture
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      // Kick spatial audio if not yet started
      if (!IS_MOBILE && Object.keys(spatialAudio).length === 0) {
        setTimeout(() => initSpatialAudio(), 900);
      }
      // Fade in philosophy stone and shortcut sign now that game has started
      setTimeout(() => {
        scene.children.forEach((c) => {
          if (c.isSprite && c.material && c.material.depthTest === false) {
            if (
              c.userData.isHelpSign ||
              (c.position &&
                Math.abs(c.position.x - 3) < 1 &&
                Math.abs(c.position.z - 20) < 2)
            ) {
              // Animate opacity in
              let op = 0;
              const iv = setInterval(() => {
                op += 0.04;
                c.material.opacity = Math.min(
                  c.userData.isHelpSign ? 0.96 : 0.94,
                  op,
                );
                if (op >= 0.96) clearInterval(iv);
              }, 30);
            }
          }
        });
      }, 2000); // delay so intro cinematic plays first
    },

    resetCamera() {
      if (selectedEntity) {
        selectedEntity.deselect();
        selectedEntity = null;
      }
      returnCamera();
      cameraFlyPhase = 0;
      cameraFlyTarget = null;
    },

    // Yatra path toggle — M key shows/hides the golden pilgrimage route
    toggleYatraPath() {
      if (!NARRATIVE.yatraPath && NARRATIVE.phase === "FREE") {
        buildYatraPath();
      }
      NARRATIVE.yatraVisible = !NARRATIVE.yatraVisible;
    },

    // Skip guided narrative, go straight to free roam
    skipGuide() {
      if (NARRATIVE.phase === "GUIDED") {
        hideGuideLabel();
        if (NARRATIVE.guideArrow) {
          scene.remove(NARRATIVE.guideArrow);
          NARRATIVE.guideArrow = null;
        }
        const compassEl = document.getElementById("city-compass");
        if (compassEl) {
          compassEl.style.opacity = "0";
          setTimeout(() => compassEl.remove(), 700);
        }
        NARRATIVE.phase = "FREE";
      }
    },

    get isNight() {
      return isNight;
    },
    get currentWeather() {
      return currentWeather;
    },
    get proximityBuilding() {
      return proximityBuilding;
    },
    get carSpeed() {
      return carSpeed;
    },
    get weatherGrip() {
      return weatherGrip;
    },
    get carX() {
      return carX;
    },
    get carZ() {
      return carZ;
    },
    get carAngle() {
      return carAngle;
    },
    get camState() {
      return CAM.state;
    },
    get narrativePhase() {
      return NARRATIVE.phase;
    },
    // Auto-drive: called when user clicks a building on the map
    setAutoDriveTarget(x, z) {
      autoDriveTarget = { x, z };
      autoDriveActive = true;
    },
    // P1: close world panel from HTML closeSP()
    closeWorldPanel() {
      closeWorldPanel();
    },
    // P4: check completion (called from HTML after openBuilding)
    checkCompletion() {
      checkCompletion();
    },
    // P3: toggle yatra with flow
    toggleYatraPath() {
      if (!NARRATIVE.yatraPath && NARRATIVE.phase === "FREE") buildYatraPath();
      NARRATIVE.yatraVisible = !NARRATIVE.yatraVisible;
    },
  };
})();
