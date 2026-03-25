// ── CAMERA — cinematic spring-damper follow camera ────────────────────────────
import { CameraC as CC } from "../utils/constants.js";
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

    // Game feel
    this.shakeAmt = 0;
    this._currentFOV = 58;
    this._fovVel = 0;

    // Store previous speed ONCE per frame (not overwritten mid-frame)
    this._prevSpeed = 0;
  }

  onResize(w, h) {
    this.instance.aspect = w / h;
    this.instance.updateProjectionMatrix();
  }

  triggerIntro() {
    this.state = "INTRO";
    this._introT = 0;
    this._vx = this._vy = this._vz = 0;
    this.instance.position.set(8, 320, 80);
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
      cam.fov = 58;
      cam.updateProjectionMatrix();
      const pan = now * 0.04;
      // Orbit radius 120 to show full 2.5x world without clipping temples
      cam.position.set(Math.sin(pan) * 120, 60, Math.cos(pan) * 120);
      cam.lookAt(0, 5, 0);
      return;
    }

    // ── INTRO — 5.8-second cinematic descend ─────────────────────────────────
    if (this.state === "INTRO") {
      this._introT = Math.min(1, this._introT + dt / 5.8);
      const e = easeInOut(this._introT);
      cam.position.lerpVectors(
        new THREE.Vector3(8, 320, 80),
        new THREE.Vector3(car.x - car.sinA * 14, 12, car.z - car.cosA * 14),
        e,
      );
      cam.lookAt(
        new THREE.Vector3().lerpVectors(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(car.x + car.sinA * 6, 1.5, car.z + car.cosA * 6),
          e,
        ),
      );
      if (this._introT >= 1) {
        this.state = "FOLLOW";
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

    const speedRatio = clamp(speedNow / 0.95, 0, 1);

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
    cam.position.y = clamp(cam.position.y, 3.5, 40);

    // ── IDLE BREATH — subtle life when nearly stopped ─────────────────────────
    const breathAmt = Math.max(0, 1 - speedRatio * 2.5) * 0.22;
    cam.position.y += Math.sin(now * 0.72) * breathAmt;

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
    const lookAhead = lerp(CC.LOOK_AHEAD_MIN, CC.LOOK_AHEAD_MAX, speedRatio);
    cam.lookAt(
      car.x + car.sinA * lookAhead,
      1.2 + speedRatio * 0.6,
      car.z + car.cosA * lookAhead,
    );

    // ── TURN TILT — leans into corners like a driver's head ───────────────────
    const latVel = car.vx * car.cosA - car.vz * car.sinA;
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

    // ── SPEED VIGNETTE — DOM element darkens edges at high speed ─────────────
    // Gives tunnel-vision feel, pure CSS — zero GPU cost
    const vig = document.getElementById("speed-vignette");
    if (vig) {
      const vigAmt = Math.max(0, speedRatio - 0.35) * 0.7;
      vig.style.opacity = vigAmt.toFixed(3);
    }

    // ── SPEED SHAKE — road vibration at high speed ────────────────────────────
    if (speedRatio > 0.3 && speedNow > 0.02) {
      const mag = (speedRatio - 0.3) * 0.1;
      cam.position.x += (Math.random() - 0.5) * mag;
      cam.position.y += (Math.random() - 0.5) * mag * 0.35;
    }

    // ── MICRO-NOISE — feels physically mounted, not mathematically locked ──────
    if (speedRatio > 0.08) {
      const mm = speedRatio * 0.018;
      const mt = now * 23.7;
      cam.position.x +=
        (Math.sin(mt * 1.3) * 0.5 + Math.sin(mt * 2.9) * 0.5) * mm;
      cam.position.y +=
        (Math.sin(mt * 1.7) * 0.5 + Math.sin(mt * 3.1) * 0.5) * mm * 0.4;
    }

    // ── CRASH SHAKE DECAY ─────────────────────────────────────────────────────
    if (this.shakeAmt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.4;
      // Rotational shake — feels like impact, not just translation
      cam.rotateZ((Math.random() - 0.5) * this.shakeAmt * 0.008);
      cam.rotateX((Math.random() - 0.5) * this.shakeAmt * 0.004);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 4.5);
    }
  }
}
