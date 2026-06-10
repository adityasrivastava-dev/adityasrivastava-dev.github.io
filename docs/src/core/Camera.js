// ── CAMERA — cinematic spring-damper follow camera ────────────────────────────
import { CameraC as CC, Car as C } from "../utils/constants.js";
import { lerp, clamp, easeInOut } from "../utils/math.js";

export default class Camera {
  constructor(renderer) {
    const sz = new THREE.Vector2();
    renderer.instance.getSize(sz);
    this.instance = new THREE.PerspectiveCamera(58, sz.x / sz.y, 0.1, 700);
    this.instance.position.set(0, 55, 70);
    this.instance.lookAt(0, 2, 0);

    // Spring velocities — units per SECOND (not per frame)
    // Clamped high enough to keep up with car at max speed (57 units/sec)
    this._vx = 0;
    this._vy = 0;
    this._vz = 0;

    // State machine
    this.state = "STATIC";
    this._introT = 0;
    this._transT = 0;
    this._transDur = CC.TRANS_DUR;
    this._fromPos = new THREE.Vector3();
    this._fromLook = new THREE.Vector3();
    this._toPos = new THREE.Vector3();
    this._toLook = new THREE.Vector3();

    // Store renderer ref for post-processing feedback (chromatic aberration)
    this._renderer = renderer;

    // Game feel
    this.shakeAmt = 0;
    this._currentFOV = CC.FOV_MIN;
    this._fovVel = 0;

    // Store previous speed ONCE per frame (not overwritten mid-frame)
    this._prevSpeed = 0;

    // ── STOP EXHALE — camera breathes out when car goes from fast→still ──
    this._wasMoving = false; // were we moving last frame?
    this._exhaustT = 0; // 0..1 exhale progress
    this._exhausting = false; // exhale currently playing
  }

  onResize(w, h) {
    this.instance.aspect = w / h;
    this.instance.updateProjectionMatrix();
  }

  triggerIntro() {
    this.state = "INTRO";
    this._introT = 0;
    this._vx = this._vy = this._vz = 0;
    // Start wide above — pan down to show the full city before following car
    this.instance.position.set(160, 90, 80);
    this.instance.lookAt(0, 0, 0);
  }

  focusOn(building, carX, carZ, carAngle) {
    this._fromPos.copy(this.instance.position);
    this._fromLook.set(
      carX + Math.sin(carAngle) * 4,
      1.5,
      carZ + Math.cos(carAngle) * 4,
    );
    const ang = Math.atan2(building.pos[0] - carX, building.pos[1] - carZ);
    this._toPos.set(
      building.pos[0] - Math.sin(ang) * CC.FOCUS_DIST,
      12 + (building.height || 12) * 0.22,
      building.pos[1] - Math.cos(ang) * CC.FOCUS_DIST,
    );
    this._toLook.set(
      building.pos[0],
      (building.height || 12) * 0.7,
      building.pos[1],
    );
    this._transT = 0;
    this._transDur = CC.TRANS_DUR;
    this.state = "FOCUS_TRANSITION";
  }

  returnToFollow() {
    this._fromPos.copy(this.instance.position);
    this._fromLook.copy(this._toLook);
    this._transT = 0;
    this.state = "RETURN_TRANSITION";
  }

  // ── MAIN UPDATE — called every render frame ─────────────────────────────────
  // car = { x, z, sinA, cosA, vx, vz, speed, suspY, steer }
  update(car, dt, now) {
    const cam = this.instance;

    // ── STATIC — cinematic orbit before user clicks ────────────────────────
    if (this.state === "STATIC") {
      cam.fov = 52;
      cam.updateProjectionMatrix();
      const pan = now * 0.04;
      // Orbit Surya Dwara — hero building, now 58 units tall, look at mid-tower
      cam.position.set(72 + Math.sin(pan) * 110, 55, -35 + Math.cos(pan) * 110);
      cam.lookAt(72, 22, -35);
      return;
    }

    // ── INTRO — 5.8-second cinematic descend ─────────────────────────────────
    if (this.state === "INTRO") {
      this._introT = Math.min(1, this._introT + dt / 5.8);
      const e = easeInOut(this._introT);
      // Cinematic: start wide (50°) and land at the tight diorama FOV
      cam.fov = lerp(50, CC.FOV_MIN, e);
      cam.updateProjectionMatrix();
      cam.position.lerpVectors(
        new THREE.Vector3(160, 90, 80),
        new THREE.Vector3(car.x - car.sinA * 26, 16, car.z - car.cosA * 26),
        e,
      );
      cam.lookAt(
        new THREE.Vector3().lerpVectors(
          new THREE.Vector3(0, 0, 0), // look at city centre on entry
          new THREE.Vector3(car.x + car.sinA * 8, 1.5, car.z + car.cosA * 8),
          e,
        ),
      );
      if (this._introT >= 1) {
        this.state = "FOLLOW";
        this._currentFOV = CC.FOV_MIN; // seed FOV spring at the landed value
        // Seed spring velocity from car's current velocity so there's no jump
        this._vx = car.vx * 60; // convert per-frame to per-second
        this._vy = 0;
        this._vz = car.vz * 60;
      }
      return;
    }

    // ── FOCUS TRANSITION — smooth lerp to building ────────────────────────────
    if (this.state === "FOCUS_TRANSITION") {
      cam.fov += (58 - cam.fov) * 0.08;
      cam.updateProjectionMatrix();
      this._transT += dt / this._transDur;
      const e = easeInOut(Math.min(1, this._transT));
      cam.position.lerpVectors(this._fromPos, this._toPos, e);
      cam.lookAt(
        new THREE.Vector3().lerpVectors(this._fromLook, this._toLook, e),
      );
      if (this._transT >= 1) this.state = "FOCUS";
      return;
    }

    // ── FOCUS — gentle breathe while building panel is open ──────────────────
    if (this.state === "FOCUS") {
      cam.position.y = this._toPos.y + Math.sin(now * 0.4 * Math.PI * 2) * 0.06;
      return;
    }

    // ── RETURN TRANSITION — ease back to follow ───────────────────────────────
    if (this.state === "RETURN_TRANSITION") {
      this._transT += dt / 1.0;
      const e = easeInOut(Math.min(1, this._transT));
      const sr = clamp(car.speed / 0.95, 0, 1);
      const followPos = new THREE.Vector3(
        car.x -
          car.sinA * lerp(CC.CAMERA_DISTANCE_MIN, CC.CAMERA_DISTANCE_MAX, sr),
        lerp(CC.CAMERA_HEIGHT_MIN, CC.CAMERA_HEIGHT_MAX, sr),
        car.z -
          car.cosA * lerp(CC.CAMERA_DISTANCE_MIN, CC.CAMERA_DISTANCE_MAX, sr),
      );
      cam.position.lerpVectors(this._fromPos, followPos, e);
      cam.lookAt(
        new THREE.Vector3().lerpVectors(
          this._fromLook,
          new THREE.Vector3(car.x + car.sinA * 4, 1.5, car.z + car.cosA * 4),
          e,
        ),
      );
      if (this._transT >= 1) {
        this.state = "FOLLOW";
        // Seed from return position to avoid spring snap
        this._vx = this._vy = this._vz = 0;
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FOLLOW — spring-damper pursuit camera
    // All velocities in units/SECOND. Car moves at up to 57 units/sec.
    // Velocity clamped at ±200 units/sec so camera never loses the car.
    // ══════════════════════════════════════════════════════════════════════════

    // Store speed from START of this frame (before any writes)
    const prevSpeed = this._prevSpeed;
    const speedNow = car.speed;
    const speedDelta = speedNow - prevSpeed; // used for FOV kick + brake pull
    this._prevSpeed = speedNow;

    const speedRatio = clamp(speedNow / C.MAX_SPEED, 0, 1);

    // ── TARGET POSITION ────────────────────────────────────────────────────────
    const camDist = lerp(
      CC.CAMERA_DISTANCE_MIN,
      CC.CAMERA_DISTANCE_MAX,
      speedRatio,
    );
    const camH = lerp(CC.CAMERA_HEIGHT_MIN, CC.CAMERA_HEIGHT_MAX, speedRatio);

    const tgtX = car.x - car.sinA * camDist;
    const tgtZ = car.z - car.cosA * camDist;
    const tgtY = camH + (car.suspY || 0) * 0.4;

    // ── SPRING PHYSICS XZ ─────────────────────────────────────────────────────
    // Hooke's Law: F = -k*displacement - c*velocity
    // k scaled up with speed so camera snaps tighter at high speed
    const kXZ =
      CC.SPRING_K * (1.0 + speedRatio * 0.9) + Math.abs(speedDelta) * 50;
    const dXZ = CC.SPRING_D;

    this._vx += ((tgtX - cam.position.x) * kXZ - this._vx * dXZ) * dt;
    this._vz += ((tgtZ - cam.position.z) * kXZ - this._vz * dXZ) * dt;

    // FIX: clamp at 200 units/sec (car max = 57 units/sec, 3.5× gives spring room)
    this._vx = clamp(this._vx, -200, 200);
    this._vz = clamp(this._vz, -200, 200);

    cam.position.x += this._vx * dt;
    cam.position.z += this._vz * dt;

    // ── SPRING PHYSICS Y ──────────────────────────────────────────────────────
    this._vy +=
      ((tgtY - cam.position.y) * CC.Y_SPRING_K - this._vy * CC.Y_SPRING_D) * dt;

    // FIX: Y clamp at 120 units/sec (was 2.5 — far too tight for 2.5x world)
    this._vy = clamp(this._vy, -120, 120);
    cam.position.y += this._vy * dt;
    cam.position.y = clamp(cam.position.y, 10.0, 65);

    // ── FIX 6: MULTI-HARMONIC IDLE DRIFT ─────────────────────────────────────
    // Amplitude raised 0.22 → 0.38 so it's actually perceptible as camera breath.
    // The old value was invisible. This makes the world look alive even when parked.
    const breathAmt = Math.max(0, 1 - speedRatio * 2.5) * 0.38;
    if (breathAmt > 0.001) {
      const driftY =
        Math.sin(now * 0.72 + 0.0) * 0.55 * breathAmt +
        Math.sin(now * 0.41 + 1.2) * 0.3 * breathAmt +
        Math.sin(now * 1.13 + 2.7) * 0.15 * breathAmt;
      const driftX =
        Math.sin(now * 0.31 + 1.7) * 0.55 * breathAmt * 0.5 +
        Math.sin(now * 0.73 + 0.4) * 0.3 * breathAmt * 0.5 +
        Math.sin(now * 1.47 + 3.1) * 0.15 * breathAmt * 0.5;
      cam.position.y += driftY;
      cam.position.x += driftX;
    }

    // ── CAR BODY ROLL → CAMERA LEAN ───────────────────────────────────────────
    // Bruno's camera leans with the car on every turn — it's the single most
    // noticeable thing that makes his camera feel connected to the vehicle.
    // We read the car's steer and lateral velocity directly.
    // At low speed (parking) the lean is subtle. At driving speed it's strong.
    // This is separate from the roll-kick system — that's for collisions only.
    // This is for every single turn, every moment of movement.
    if (speedRatio > 0.05 && car.steer !== undefined) {
      // Compute how much lean based on speed + steer input
      const leanAmt = car.steer * speedRatio * 0.018;
      if (Math.abs(leanAmt) > 0.0001) {
        cam.rotateZ(-leanAmt); // lean INTO the turn (car tilts right → camera tilts right)
      }
    }

    // ── FOV SPRING — smooth widening at speed ─────────────────────────────────
    const targetFOV = lerp(CC.FOV_MIN, CC.FOV_MAX, speedRatio);
    this._fovVel += (targetFOV - this._currentFOV) * 12 * dt;
    this._fovVel *= 0.82;
    this._currentFOV = clamp(
      this._currentFOV + this._fovVel * dt,
      CC.FOV_MIN - 5,
      CC.FOV_MAX + 10,
    );
    cam.fov = this._currentFOV;

    // ── ACCELERATION FOV KICK — G-force push on hard throttle ─────────────────
    // FIX: now uses prevSpeed saved at START of frame, not overwritten mid-loop
    if (speedDelta > 0.012) {
      this._fovVel += speedDelta * 180;
    }

    // ── BRAKE PULL — camera lurches forward on hard braking ───────────────────
    // FIX: same — speedDelta is now correct
    if (speedDelta < -0.016 && speedNow > 0.05) {
      const shift = Math.abs(speedDelta) * 3.5;
      cam.position.x += car.sinA * shift;
      cam.position.z += car.cosA * shift;
    }

    cam.updateProjectionMatrix();

    // ── LOOK-AHEAD — world opens in front of car at speed ─────────────────────
    // Tighten on cornering so hard turns don't feel floaty
    const latVel = car.vx * car.cosA - car.vz * car.sinA;
    const lookAhead = lerp(CC.LOOK_AHEAD_MIN, CC.LOOK_AHEAD_MAX, speedRatio)
      * (1 - clamp(Math.abs(latVel) * 3.5, 0, 0.42));
    cam.lookAt(
      car.x + car.sinA * lookAhead,
      1.2 + speedRatio * 0.6,
      car.z + car.cosA * lookAhead,
    );

    // ── TURN TILT — leans into corners like a driver's head ───────────────────
    const tiltAmt = latVel * CC.TILT_FACTOR * (0.8 + speedRatio * 1.2);
    cam.rotateZ(tiltAmt * dt * 3.5);

    // ── CORNERING OFFSET — camera drifts outward on tight turns ──────────────
    // Feels like the camera has mass and resists direction changes
    if (!this._cornerOffset) this._cornerOffset = { x: 0, z: 0 };
    const cornerTarget = latVel * 0.8;
    this._cornerOffset.x +=
      (car.cosA * cornerTarget - this._cornerOffset.x) * 0.05 * dt * 60;
    this._cornerOffset.z +=
      (-car.sinA * cornerTarget - this._cornerOffset.z) * 0.05 * dt * 60;
    cam.position.x += this._cornerOffset.x;
    cam.position.z += this._cornerOffset.z;

    // ── CHROMATIC ABERRATION — speed feedback through post-processing ─────────
    // Replaces DOM vignette and speed streaks. In-world GPU effect, zero DOM cost.
    if (this._renderer) {
      this._renderer.setChromaticIntensity(Math.max(0, speedRatio - 0.25) * 0.008);
    }

    // ── STOP EXHALE — detect transition from moving → still ──────────────────
    // When the car drops below 0.07 after being above 0.12, the camera
    // does a gentle "sigh": Y rises slightly, FOV dips, then both return.
    // Mirrors the physiological feeling of catching your breath after speed.
    const isMovingNow = speedNow > 0.07;
    if (this._wasMoving === undefined) this._wasMoving = false;
    if (this._exhaustT === undefined) {
      this._exhaustT = 0;
      this._exhausting = false;
    }

    const justStopped = this._wasMoving && !isMovingNow && prevSpeed > 0.12;
    this._wasMoving = isMovingNow;

    if (justStopped) {
      this._exhausting = true;
      this._exhaustT = 0;
      // DOM exhale ring — expanding CSS circle at center of screen
      const er = document.getElementById("exhale-ring");
      if (er) {
        er.classList.remove("exhale");
        void er.offsetWidth;
        er.classList.add("exhale");
        setTimeout(() => er.classList.remove("exhale"), 950);
      }
    }
    if (this._exhausting) {
      this._exhaustT = Math.min(1, this._exhaustT + dt / 0.65);
      const arc = Math.sin(this._exhaustT * Math.PI); // peaks at t=0.5
      cam.position.y += arc * 0.3; // gentle Y rise
      this._currentFOV -= arc * 3.5; // slight FOV dip (breath-out)
      if (this._exhaustT >= 1) this._exhausting = false;
    }

    // ── FIX 6: SPEED SHAKE — layered harmonics + random burst ────────────────
    // Old: pure Math.random() at > 0.3 speed — uniform white noise, reads flat.
    // New: deterministic harmonics at low-mid speed (road texture), plus
    //      random burst only at high speed (hitting bumps).
    // The two layers feel like: [smooth road hum] + [occasional sharp jolt].
    if (speedRatio > 0.08 && speedNow > 0.02) {
      // Deterministic road hum — sinusoidal, feels like surface texture
      const humMag = Math.max(0, speedRatio - 0.08) * 0.028;
      const ht = now * 18.4;
      cam.position.x +=
        (Math.sin(ht * 1.0) * 0.6 + Math.sin(ht * 2.3) * 0.4) * humMag;
      cam.position.y +=
        (Math.sin(ht * 1.5) * 0.5 + Math.sin(ht * 3.1) * 0.5) * humMag * 0.4;
    }
    if (speedRatio > 0.42 && speedNow > 0.02) {
      // Random jolt burst — only at high speed, simulates hitting a bump
      const bumpMag = (speedRatio - 0.42) * 0.065;
      cam.position.x += (Math.random() - 0.5) * bumpMag;
      cam.position.y += (Math.random() - 0.5) * bumpMag * 0.35;
    }

    // ── CRASH SHAKE DECAY ─────────────────────────────────────────────────────
    if (this.shakeAmt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.4;
      // Rotational shake — feels like impact, not just translation
      cam.rotateZ((Math.random() - 0.5) * this.shakeAmt * 0.008);
      cam.rotateX((Math.random() - 0.5) * this.shakeAmt * 0.004);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 4.5);

      // ── ROLL KICK — from Bruno's View.js setRoll() ─────────────────────────
      // On collision, inject a random roll speed (left or right).
      // Spring physics: velocity decays with damping, value springs back to 0.
      // Stronger impact = bigger shake = bigger roll kick.
      if (!this._rollValue) {
        this._rollValue = 0;
      }
      if (!this._rollSpeed) {
        this._rollSpeed = 0;
      }
      if (this.shakeAmt > 0.25 && !this._rollKicked) {
        // Kick in a random direction proportional to impact strength
        this._rollSpeed +=
          this.shakeAmt * 0.35 * (Math.random() < 0.5 ? 1 : -1);
        this._rollKicked = true;
      }
    } else {
      this._rollKicked = false;
    }

    // ── ROLL SPRING DECAY ─────────────────────────────────────────────────────
    // Pull back toward 0 (pullStrength=80), damp velocity (damping=5).
    // Values from Bruno's View.js: roll.pullStrength=100, roll.damping=4.
    if (this._rollValue === undefined) {
      this._rollValue = 0;
      this._rollSpeed = 0;
    }
    this._rollSpeed += -this._rollValue * 80 * dt; // spring pull toward 0
    this._rollValue += this._rollSpeed * dt; // integrate
    this._rollSpeed *= 1 - 5 * dt; // damping
    // Apply roll to camera Z rotation — small but visible
    if (Math.abs(this._rollValue) > 0.0001) {
      cam.rotateZ(this._rollValue);
    }
  }
}
