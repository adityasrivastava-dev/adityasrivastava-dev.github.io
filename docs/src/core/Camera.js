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
        // Land at the new raised isometric height (18) not old low height (12)
        new THREE.Vector3(car.x - car.sinA * 18, 18, car.z - car.cosA * 18),
        e,
      );
      cam.lookAt(
        new THREE.Vector3().lerpVectors(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(car.x + car.sinA * 5, 1.5, car.z + car.cosA * 5),
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
    cam.position.y = clamp(cam.position.y, 8.0, 50);

    // ── FIX 6: MULTI-HARMONIC IDLE DRIFT ─────────────────────────────────────
    // Old: single sine wave at 0.72Hz — reads as a mechanical oscillator.
    // New: three offset frequencies summed — reads as a human holding a camera.
    // Weights: 55% / 30% / 15% so it stays subtle but never feels periodic.
    // X drift is independent from Y drift — camera wanders slightly in 2D space.
    const breathAmt = Math.max(0, 1 - speedRatio * 2.5) * 0.22;
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

    // ── FIX 6: STEER LEAN MICRO-FEEDBACK at low speed ────────────────────────
    // At high speed the corner offset + tilt already handle this.
    // At low speed (parking, slow turns) the camera feels completely disconnected.
    // This tiny lean at 0–30% speed makes every turn feel physically weighted.
    if (speedRatio > 0.015 && speedRatio < 0.32) {
      const leanStrength = (1 - speedRatio / 0.32) * 0.012;
      cam.rotateZ(car.steer * leanStrength * dt * 60);
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
      // At low speed: deep black edges (cinema depth)
      // At high speed: shift to amber-red (burning through air feel)
      // The CSS radial gradient reads these CSS custom properties in real-time
      const vigAmt = Math.max(0, speedRatio - 0.35) * 0.7;
      vig.style.opacity = vigAmt.toFixed(3);

      // Color tint: lerp from pure black (0,0,0) to deep amber (80,20,0)
      const r = Math.round(speedRatio * speedRatio * 80);
      const g = Math.round(speedRatio * speedRatio * 18);
      const bC = 0;
      // Only update CSS vars at high speed to avoid paint thrash at idle
      if (speedRatio > 0.4) {
        const root = document.documentElement;
        root.style.setProperty("--vignette-color", `${r},${g},${bC}`);
        // Also narrow the transparent center — tunnel vision
        const inner = Math.max(18, 35 - speedRatio * 18).toFixed(0);
        root.style.setProperty("--vignette-inner", inner + "%");
        // Deepen opacity at max speed
        const op = (0.52 + speedRatio * 0.18).toFixed(3);
        root.style.setProperty("--vignette-opacity", op);
      } else if (speedRatio < 0.15) {
        // Reset to black when nearly stopped
        document.documentElement.style.setProperty("--vignette-color", "0,0,0");
        document.documentElement.style.setProperty("--vignette-inner", "35%");
        document.documentElement.style.setProperty(
          "--vignette-opacity",
          "0.52",
        );
      }
    }

    // ── SPEED STREAKS — horizontal motion lines, JS-driven via inline style ───
    // Appear above 55% speed. Each streak has an independent phase so they
    // flash at different times — random, not synchronized. Pure CSS transform,
    // zero reflow cost. Makes the world feel like it's tearing past the car.
    if (!this._streakPhases) {
      // Init once: random per-streak phase offsets 0..1
      this._streakPhases = Array.from({ length: 10 }, () => Math.random());
      this._streakT = 0;
    }
    this._streakT += dt;
    const streakEl = document.getElementById("speed-streaks");
    if (streakEl) {
      const intensity = Math.max(0, (speedRatio - 0.55) / 0.45); // 0..1
      const streaks = streakEl.children;
      for (let i = 0; i < streaks.length; i++) {
        if (intensity <= 0) {
          streaks[i].style.opacity = "0";
          continue;
        }
        // Each streak cycles at a slightly different rate
        const rate = 0.9 + i * 0.22;
        const phase = (this._streakT * rate + this._streakPhases[i]) % 1;
        // Active 55% of cycle, then invisible for 45%
        if (phase > 0.55) {
          streaks[i].style.opacity = "0";
          continue;
        }
        const t = phase / 0.55; // 0→1 over the active window
        // Streak travels right→left: starts at 100%, ends at −20%
        const tx = 100 - t * 120;
        const op = intensity * (1 - t * 0.65) * (0.45 + (i % 4) * 0.12);
        streaks[i].style.transform = `translateX(${tx.toFixed(1)}%)`;
        streaks[i].style.opacity = op.toFixed(3);
      }
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
    }
  }
}
