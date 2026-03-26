// ── CAR — position, velocity, mesh visuals. Physics delegated to Physics.js. ─
import Physics from "./Physics.js";
import { Car as C } from "../utils/constants.js";

export default class Car {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;

    // ── PHYSICS STATE ──────────────────────────────────────────────────────
    this.x = 0; // spawn at center (player start from city-data)
    this.z = 40;
    this.vx = 0;
    this.vz = 0;
    this.angle = Math.PI; // face north (-Z)
    this.speed = 0;
    this.steerAngle = 0;
    this.sinA = 0;
    this.cosA = -1;
    this._fwdVel = 0;
    this._latVel = 0;

    // Visual derived (not physics)
    this.suspY = 0;
    this._suspVY = 0;
    this._bodyRoll = 0;
    this._bodyPitch = 0; // initialized here — falsy-safe
    this._prevSpeed = 0;
    this._prevVisSpeed = 0; // for brake light detection
    this._isNight = false; // updated by setNightMode

    // ── GAME FEEL STATE ────────────────────────────────────────────────────
    this._impactSquash = 0; // 0..1 — drives body squash on collision
    this._impactVel = 0; // spring velocity for squash recovery
    this._sparks = []; // active spark meshes [{mesh,vx,vy,vz,life}]
    this._trailScaleZ = 1; // directional speed trail Z elongation

    this._weatherGrip = 1.0;
    this._physics = new Physics();

    // Build mesh
    this.group = null;
    this.bodyMesh = null;
    this.wheelGroups = [];
    this._buildMesh();
    this._buildGroundRing();
    this._buildWheelTrails(); // 4 per-wheel ground ribbons
  }

  // ── PHYSICS STEP (called by Application tick loop) ─────────────────────────
  _physicsStep(input, dt, subSteps, buildingBoxes) {
    const state = {
      vx: this.vx,
      vz: this.vz,
      angle: this.angle,
      steerAngle: this.steerAngle,
    };
    const inp = {
      throttle: input.throttleAxis,
      reverse: input.reverseAxis,
      steerRaw: input.steerAxis,
      handbrake: input.brake && !input.forward,
    };

    // Run sub-steps for precision (set by tick system)
    const result =
      subSteps > 1
        ? this._physics.multiStep(state, inp, this._weatherGrip, dt, subSteps)
        : this._physics.step(state, inp, this._weatherGrip, dt);

    this.vx = result.vx;
    this.vz = result.vz;
    this.angle = result.angle;
    this.steerAngle = result.steerAngle;
    this.speed = result.speed;
    this._fwdVel = result.fwdVel;
    this._latVel = result.latVel;
    this.sinA = Math.sin(this.angle);
    this.cosA = Math.cos(this.angle);

    // Integrate position with axis-separated collision
    this._integrate(buildingBoxes);
    this._prevSpeed = this.speed;
  }

  _integrate(boxes) {
    const nx = this.x + this.vx;
    const nz = this.z + this.vz;

    let collided = false;
    if (!this._collides(nx, nz, boxes)) {
      this.x = nx;
      this.z = nz;
    } else if (!this._collides(nx, this.z, boxes)) {
      this.x = nx;
      this.vz *= -0.25;
      collided = true;
    } else if (!this._collides(this.x, nz, boxes)) {
      this.z = nz;
      this.vx *= -0.25;
      collided = true;
    } else {
      this.vx *= -0.2;
      this.vz *= -0.2;
      collided = true;
    }

    // ── COLLISION FEEDBACK — squash + sparks + DOM flash ─────────────────
    if (collided && this.speed > 0.06) {
      const impactMag = Math.min(1.0, this.speed / 0.3);
      this._impactSquash = 0.85 + impactMag * 0.15; // 0.85..1.0 squash
      this._impactVel = -impactMag * 18; // spring launch
      this._spawnSparks(this.x, this.z, impactMag);

      // DOM flash — brief amber hit-flash overlay
      const hf = document.getElementById("hit-flash");
      if (hf) {
        hf.classList.remove("pop", "fade");
        void hf.offsetWidth; // reflow to restart animation
        hf.classList.add("pop");
        setTimeout(() => {
          hf.classList.remove("pop");
          hf.classList.add("fade");
        }, 60);
        setTimeout(() => {
          hf.classList.remove("fade");
        }, 400);
      }
    }

    // World boundary clamp (2.5x world scale)
    this.x = Math.max(-215, Math.min(215, this.x));
    this.z = Math.max(-195, Math.min(135, this.z));
  }

  _collides(nx, nz, boxes) {
    for (const b of boxes) {
      if (
        nx > b.minX - C.HW &&
        nx < b.maxX + C.HW &&
        nz > b.minZ - C.HD &&
        nz < b.maxZ + C.HD
      )
        return true;
    }
    return false;
  }

  // ── VISUAL UPDATE (called every render frame) ──────────────────────────────
  updateVisuals(dt, now) {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;

    // Body roll — proportional to lateral G, capped for readability
    const rollTarget = -this._latVel * 7.0 * (1.0 + this.speed / C.MAX_SPEED);
    this._bodyRoll += (rollTarget - this._bodyRoll) * 0.14;
    this.group.rotation.z = this._bodyRoll;

    // Body pitch — nose dips on brake, lifts on throttle (juicy!)
    const pitchTarget = (this._fwdVel > 0.01 ? -1 : 1) * this.speed * 0.6;
    this._bodyPitch += (pitchTarget - this._bodyPitch) * 0.09; // initialized in constructor
    this.group.rotation.x = this._bodyPitch * 0.04;

    // ── COLLISION SQUASH — body deforms on impact then springs back ─────────
    // Spring equation: squash overshoots 1.0, bounces twice, settles.
    if (this._impactSquash !== 0 || this._impactVel !== 0) {
      const rest = 1.0;
      const k = 32,
        d = 5.5;
      this._impactVel +=
        ((rest - this._impactSquash) * k - this._impactVel * d) * dt;
      this._impactSquash += this._impactVel * dt;
      if (
        Math.abs(this._impactSquash - rest) < 0.001 &&
        Math.abs(this._impactVel) < 0.01
      ) {
        this._impactSquash = rest;
        this._impactVel = 0;
      }
      // XZ squash + Y counter-stretch (volume conservation like a rubber ball)
      const sq = this._impactSquash;
      const stretch = 1.0 + (1.0 - sq) * 0.8;
      if (this.bodyMesh) {
        this.bodyMesh.scale.set(stretch, sq, sq);
      }
    } else if (this.bodyMesh) {
      this.bodyMesh.scale.set(1, 1, 1);
    }

    // Suspension — extra squish at high speed for road-contact feel
    const bumpFreq = 5.0 + this.speed * 45;
    const bumpAmp =
      this.speed * 0.032 + Math.abs(this.steerAngle) * this.speed * 0.05;
    const bumpForce =
      Math.sin(now * bumpFreq) * bumpAmp +
      Math.sin(now * bumpFreq * 1.7 + 1.2) * bumpAmp * 0.4; // 2nd harmonic
    this._suspVY += (bumpForce - this.suspY * 28 - this._suspVY * 8) * 0.016;
    this.suspY += this._suspVY;
    this.suspY = Math.max(-0.05, Math.min(0.14, this.suspY));
    this.group.position.y = this.suspY;

    // Wheel spin — front wheels steer visually
    const spinRate = this._fwdVel * 2.8;
    this.wheelGroups.forEach((sg, i) => {
      sg.rotation.x += spinRate;
      // Front wheels (index 0,1) rotate on Y axis with steer angle
      if (i < 2) sg.parent.rotation.y = this.steerAngle * 10;
    });

    // Brake lights — glow red when decelerating
    if (this._tailLight) {
      const isBraking =
        this._fwdVel > 0.01 && this.speed < this._prevVisSpeed - 0.004;
      const baseI = this._isNight ? 2.5 : 0;
      this._tailLight.intensity +=
        ((isBraking ? 5.5 : baseI) - this._tailLight.intensity) * 0.18;
    }
    this._prevVisSpeed = this.speed;

    // Ground ring — size pulses with speed, opacity with movement
    if (this._groundRing) {
      this._groundRing.position.set(this.x, 0.08, this.z);
      const pulse = 1 + Math.sin(now * 3.5) * 0.07 + this.speed * 0.4;
      this._groundRing.scale.setScalar(pulse);
      this._groundRing.material.opacity = Math.min(
        0.6,
        Math.abs(this.speed) * 4.0 + 0.1,
      );
    }

    // ── 4-WHEEL GROUND TRAILS — per-wheel tire mark ribbons ─────────────────
    // Each trail sits at its wheel's world position, faces the wheel's heading,
    // and elongates proportional to speed. Front wheels use their steered angle
    // so the marks correctly represent the actual path driven.
    //
    // The wheel positions in world space are computed from:
    //   group.position (the car body) + rotated wheel offsets
    //
    // Wheel layout: [0]=FR, [1]=FL, [2]=RR, [3]=RL
    // Each wheelGroups[i].parent has the per-wheel offset baked into its position.
    if (this._wheelTrails && this.wheelGroups.length === 4) {
      const speedRatio = Math.min(1, this.speed / C.MAX_SPEED);
      // Trails visible on acceleration/cornering above 20% speed
      const trailOp = Math.max(0, (speedRatio - 0.2) / 0.8) * 0.55;
      // Extra opacity on hard cornering — lateral slip creates visible marks
      const slipBoost = Math.min(1, Math.abs(this._latVel) * 4.0) * 0.3;
      const finalOp = Math.min(0.72, trailOp + slipBoost);

      // Trail length: short at low speed, longer when sliding/fast
      const trailLen = 1.2 + speedRatio * 6.0 + Math.abs(this._latVel) * 3.0;

      this._wheelTrails.forEach((trail, i) => {
        const wg = this.wheelGroups[i];
        if (!wg) return;

        // Get wheel world position from parent group
        const wParent = wg.parent;
        const wx =
          this.x +
          Math.sin(this.angle) * wParent.position.z +
          Math.cos(this.angle) * wParent.position.x;
        const wz =
          this.z +
          Math.cos(this.angle) * wParent.position.z -
          Math.sin(this.angle) * wParent.position.x;

        // Front wheels (0,1) have steered angle — rotate trail by steer
        const wheelAngle =
          i < 2 ? this.angle + this.steerAngle * 10 : this.angle;

        // Position trail at wheel, elongate backward
        trail.mesh.position.set(wx, 0.018, wz);
        trail.mesh.rotation.y = wheelAngle;
        trail.mesh.scale.set(1, trailLen, 1);
        trail.mesh.material.opacity = finalOp;

        // Color: warm amber → near-black depending on slip
        // Amber = wheelspin, dark = normal rolling marks
        const spinColor = Math.min(1, Math.abs(this._latVel) * 2.0);
        trail.mesh.material.color.setRGB(
          0.15 + spinColor * 0.55,
          0.08 + spinColor * 0.22,
          0.03,
        );
      });
    }

    // Headlight cone — widens on speed
    if (this._headLight) {
      this._headLight.distance = 16 + this.speed * 20;
    }

    // ── SPARK UPDATE — arc upward, fade, auto-remove ─────────────────────
    this._sparks = this._sparks.filter((s) => {
      s.mesh.userData.life -= dt * 2.8;
      s.vy -= 9.8 * dt; // gravity pulls sparks down
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.material.opacity = Math.max(0, s.mesh.userData.life);
      if (s.mesh.userData.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  setWeatherGrip(grip) {
    this._weatherGrip = grip;
  }
  setNightMode(isNight) {
    this._isNight = isNight; // used in updateVisuals for brake light base intensity
    if (this._headLight) this._headLight.intensity = isNight ? 7 : 0;
    if (this._tailLight) this._tailLight.intensity = isNight ? 2.5 : 0;
  }

  // ── MESH ────────────────────────────────────────────────────────────────────
  _mc(key, color) {
    const mc = window._matcaps || {};
    return new THREE.MeshMatcapMaterial({ color, matcap: mc[key] || mc.warm });
  }

  _box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  }

  _buildMesh() {
    const g = new THREE.Group();

    // ── MATERIALS — exact Bruno Simon palette from screenshots ────────────────
    //
    // Image analysis:
    //  Body:     bright red          #cc2200
    //  Cab top:  dark military green #2a3318  ← key difference, NOT black
    //  Chassis:  dark olive          #1a2010
    //  Rims:     RED matching body   #cc2200  ← rims are red, not dark
    //  Tyres:    near-black rubber   #0e0c0a
    //  Chrome:   warm silver         #887766
    //  Glass:    dark tinted blue    #223344
    //
    const mBody = this._mc("car", 0xcc2200); // bright red body
    const mTop = this._mc("carDark", 0x2a3318); // dark military olive GREEN cab
    const mChassis = this._mc("dark", 0x1a2010); // dark olive chassis/underbody
    const mBlack = this._mc("dark", 0x0e0c0a); // near-black details
    const mRim = this._mc("car", 0xcc2200); // RED rims — matches body
    const mTyre = this._mc("tyre", 0x0e0c0a); // near-black rubber
    const mChrome = this._mc("chrome", 0x887766); // warm silver trim
    const mGlass = new THREE.MeshMatcapMaterial({
      color: 0x223344,
      matcap: (window._matcaps || {}).glass,
      transparent: true,
      opacity: 0.6,
    });
    // Headlight glow material — amber yellow (from image 3)
    const mHeadlight = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    // White LED strip material for roof lights
    const mLED = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // ── DIMENSIONS — Hummer H1 toy proportions ────────────────────────────────
    // From images: almost as wide as long, extremely flat body,
    // massive wheels that are nearly as tall as the body
    const WR = 0.75; // wheel radius — massive
    const WW = 0.62; // wheel width — very chunky
    const WTX = 1.45; // wheel track — extreme width stance
    const WFZ = 1.72; // front axle Z
    const WRZ = -1.72; // rear axle Z
    const AXH = WR;

    // Body — extremely wide and flat (Hummer H1)
    const BY = AXH + 0.02;
    const BH = 0.4; // very flat body
    const BW = 2.05; // extremely wide
    const BD = 3.4; // long

    // Cab — short, boxy, pushed rearward
    const CY = BY + BH;
    const CH = 0.64; // tall cabin for headroom
    const CW = 1.7; // wide cabin
    const CD = 1.65; // short depth
    const CZ = -0.22; // slightly toward rear
    const RY = CY + CH;

    // ── CHASSIS / SKID PLATE ─────────────────────────────────────────────────
    g.add(this._box(BW + 0.12, 0.14, BD + 0.06, mChassis, 0, AXH + 0.06, 0));
    // Skid plate — visible flat plate under front
    g.add(
      this._box(
        BW * 0.88,
        0.06,
        BD * 0.28,
        mBlack,
        0,
        AXH + 0.02,
        WFZ - BD * 0.06,
      ),
    );

    // ── MAIN BODY ─────────────────────────────────────────────────────────────
    const body = this._box(BW, BH, BD, mBody, 0, BY + BH / 2, 0);
    g.add(body);
    this.bodyMesh = body;

    // Body lower step — recessed sill between wheel arches
    for (const sx of [-1, 1]) {
      // Deep side panel between wheel arches — darker inset creates depth
      g.add(
        this._box(
          0.08,
          BH * 0.62,
          BD * 0.36,
          mChassis,
          sx * (BW / 2 + 0.03),
          BY + BH * 0.32,
          0,
        ),
      );
      // Upper body crease line (body color — slight protrusion)
      g.add(
        this._box(
          0.05,
          0.07,
          BD * 0.78,
          mBody,
          sx * (BW / 2 + 0.02),
          BY + BH * 0.82,
          0,
        ),
      );
      // Door handle recess (dark strip mid-height)
      g.add(
        this._box(
          0.04,
          0.08,
          0.55,
          mBlack,
          sx * (BW / 2 + 0.03),
          BY + BH * 0.55,
          -0.1,
        ),
      );
    }

    // Hood — flat panel, slightly raised center spine (visible in Image 3)
    g.add(
      this._box(
        BW * 0.82,
        0.07,
        BD * 0.3,
        mBody,
        0,
        BY + BH + 0.035,
        WFZ - BD * 0.07,
      ),
    );
    // Hood center spine
    g.add(
      this._box(
        BW * 0.12,
        0.11,
        BD * 0.3,
        mTop,
        0,
        BY + BH + 0.055,
        WFZ - BD * 0.07,
      ),
    );

    // ── WHEEL ARCH FLARES — very square and blocky like Bruno's ─────────────
    // Bruno's arches are thick rectangular slabs, not rounded
    for (const wz of [WFZ * 0.62, WRZ * 0.62]) {
      for (const sx of [-1, 1]) {
        // Main arch slab — very wide overhanging the tyre
        g.add(
          this._box(
            0.32,
            WR * 1.08,
            1.58,
            mBody,
            sx * (BW / 2 + 0.14),
            BY + WR * 0.3,
            wz,
          ),
        );
        // Arch outer lip (dark trim)
        g.add(
          this._box(
            0.1,
            0.1,
            1.6,
            mBlack,
            sx * (BW / 2 + 0.28),
            BY + WR * 1.02,
            wz,
          ),
        );
        // Arch inner structure
        g.add(
          this._box(
            0.08,
            WR * 0.75,
            1.58,
            mChassis,
            sx * (BW / 2 + 0.06),
            BY + WR * 0.2,
            wz,
          ),
        );
      }
    }

    // ── CABIN ─────────────────────────────────────────────────────────────────
    // Dark military olive — clearly NOT black from all three images
    g.add(this._box(CW, CH, CD, mTop, 0, CY + CH / 2, CZ));

    // Cabin lower sill (body-color band where cab meets body)
    g.add(this._box(CW + 0.06, 0.09, CD + 0.04, mBody, 0, CY + 0.045, CZ));

    // Roof panel — flat, same olive green
    g.add(this._box(CW + 0.1, 0.1, CD + 0.1, mTop, 0, RY + 0.05, CZ));

    // ── ROOF RACK + LED LIGHT BARS ────────────────────────────────────────────
    // Image 3 clearly shows 4 horizontal LED bar strips across the roof
    // with warm white glow
    const rackY = RY + 0.14;
    // Side rails
    for (const sx of [-1, 1]) {
      g.add(
        this._box(0.055, 0.055, CD * 0.88, mChrome, sx * CW * 0.42, rackY, CZ),
      );
    }
    // 4 LED crossbars with glowing white strips
    for (const rz of [-0.52, -0.18, 0.18, 0.52]) {
      // Crossbar structure
      g.add(this._box(CW * 0.84, 0.06, 0.07, mChrome, 0, rackY, CZ + rz));
      // LED strip (white emissive)
      g.add(this._box(CW * 0.8, 0.04, 0.05, mLED, 0, rackY + 0.04, CZ + rz));
    }

    // ── WINDSHIELDS ───────────────────────────────────────────────────────────
    const wsF = this._box(
      CW - 0.14,
      CH * 0.76,
      0.07,
      mGlass,
      0,
      CY + CH * 0.46,
      CZ + CD / 2 + 0.01,
    );
    wsF.rotation.x = 0.3;
    g.add(wsF);

    const wsR = this._box(
      CW - 0.14,
      CH * 0.68,
      0.07,
      mGlass,
      0,
      CY + CH * 0.42,
      CZ - CD / 2 - 0.01,
    );
    wsR.rotation.x = -0.22;
    g.add(wsR);

    // Side windows (2 per side — front + rear quarter)
    for (const sx of [-1, 1]) {
      // Main side window
      g.add(
        this._box(
          0.065,
          CH * 0.68,
          CD * 0.55,
          mGlass,
          sx * (CW / 2 + 0.025),
          CY + CH * 0.5,
          CZ,
        ),
      );
      // Rear quarter window (smaller)
      g.add(
        this._box(
          0.065,
          CH * 0.54,
          CD * 0.26,
          mGlass,
          sx * (CW / 2 + 0.025),
          CY + CH * 0.46,
          CZ - CD * 0.34,
        ),
      );
    }

    // B-pillar (dark divider between windows)
    for (const sx of [-1, 1]) {
      g.add(
        this._box(
          0.065,
          CH * 0.68,
          0.1,
          mTop,
          sx * (CW / 2 + 0.025),
          CY + CH * 0.5,
          CZ - CD * 0.05,
        ),
      );
    }

    // ── FRONT FACE — the most distinctive part of Bruno's car ─────────────────
    // Large square headlight pods with amber glow, small LED accents

    // Main front panel (dark)
    g.add(
      this._box(
        BW * 0.78,
        BH * 0.68,
        0.1,
        mChassis,
        0,
        BY + BH * 0.36,
        WFZ + BD / 2,
      ),
    );

    // Upper grille opening (dark mesh appearance)
    g.add(
      this._box(
        BW * 0.6,
        BH * 0.28,
        0.09,
        mBlack,
        0,
        BY + BH * 0.62,
        WFZ + BD / 2 + 0.01,
      ),
    );

    // TWO LARGE RECTANGULAR HEADLIGHT PODS — from Image 3, these are BIG blocks
    for (const hx of [-0.58, 0.58]) {
      // Housing block (dark)
      g.add(
        this._box(
          0.42,
          0.24,
          0.09,
          mBlack,
          hx,
          BY + BH * 0.6,
          WFZ + BD / 2 + 0.01,
        ),
      );
      // Amber lens — glowing rectangular face
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.17, 0.05),
        mHeadlight,
      );
      lens.position.set(hx, BY + BH * 0.6, WFZ + BD / 2 + 0.07);
      g.add(lens);
    }

    // Small LED accent dots across bumper (visible in Image 1 — row of 4 dots)
    for (let di = 0; di < 4; di++) {
      const dx = -0.45 + di * 0.3;
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), mLED);
      dot.position.set(dx, BY + BH * 0.18, WFZ + BD / 2 + 0.07);
      g.add(dot);
    }

    // Front bumper — wide low slab
    g.add(
      this._box(
        BW + 0.06,
        0.26,
        0.22,
        mChassis,
        0,
        BY + 0.13,
        WFZ + BD / 2 + 0.06,
      ),
    );
    // Bumper lower guard bar
    g.add(
      this._box(
        BW * 0.7,
        0.07,
        0.08,
        mChrome,
        0,
        BY - 0.04,
        WFZ + BD / 2 + 0.12,
      ),
    );

    // ── REAR FACE ─────────────────────────────────────────────────────────────
    // Spare tyre mount on rear door (Image 1)
    const spareTyre = new THREE.Mesh(
      new THREE.CylinderGeometry(WR * 0.6, WR * 0.6, WW * 0.45, 12),
      mTyre,
    );
    spareTyre.rotation.z = Math.PI / 2;
    spareTyre.position.set(0, BY + BH * 0.55, WRZ - BD / 2 - 0.22);
    g.add(spareTyre);

    // Spare tyre rim
    const spareRim = new THREE.Mesh(
      new THREE.CylinderGeometry(WR * 0.44, WR * 0.44, WW * 0.28, 10),
      mRim,
    );
    spareRim.rotation.z = Math.PI / 2;
    spareRim.position.set(0, BY + BH * 0.55, WRZ - BD / 2 - 0.22);
    g.add(spareRim);

    // Tail lights — red horizontal strip
    for (const tx of [-0.55, 0.55]) {
      const tl = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.1, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xff1100 }),
      );
      tl.position.set(tx, BY + BH * 0.78, WRZ - BD / 2 - 0.02);
      g.add(tl);
    }

    // Rear bumper
    g.add(
      this._box(
        BW + 0.06,
        0.24,
        0.18,
        mChassis,
        0,
        BY + 0.12,
        WRZ - BD / 2 - 0.05,
      ),
    );

    // Rear tow hook
    g.add(
      this._box(0.24, 0.1, 0.18, mChrome, 0, BY - 0.02, WRZ - BD / 2 - 0.12),
    );

    // ── ENGINE UNDERGLOW — magenta/pink from beneath (Image 1 shows this) ─────
    this._engGlow = new THREE.PointLight(0xff44aa, 0.75, 5.0);
    this._engGlow.position.set(0, 0.15, 0);
    g.add(this._engGlow);

    // Car lights
    this._headLight = new THREE.PointLight(0xffcc44, 0, 18);
    this._headLight.position.set(0, BY + BH * 0.5, WFZ + BD / 2 + 1.5);
    g.add(this._headLight);
    this._tailLight = new THREE.PointLight(0xff1100, 0, 9);
    this._tailLight.position.set(0, BY + BH * 0.7, WRZ - BD / 2 - 1.2);
    g.add(this._tailLight);

    // ── WHEELS x4 — very large, chunky, RED rims clearly visible ─────────────
    // CRITICAL FIX: The rim must be a flat DISC at the OUTER FACE of the tyre.
    // Old mistake: rim was a cylinder centered at wheel X=0, completely hidden
    // inside the tyre width. Bruno's red rims are visible because they stick
    // out as flat faces on the outside of each wheel.
    [
      [WTX, AXH, WFZ, false],
      [-WTX, AXH, WFZ, true],
      [WTX, AXH, WRZ, false],
      [-WTX, AXH, WRZ, true],
    ].forEach(([wx, wy, wz, isLeft]) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      g.add(wg);
      const sg = new THREE.Group();
      wg.add(sg);
      this.wheelGroups.push(sg);

      // Outer face X position — this is where the rim face sits
      const outerX = isLeft ? -(WW / 2) : WW / 2;

      // ── TYRE — wide and chunky ───────────────────────────────────────────────
      const tyre = new THREE.Mesh(
        new THREE.CylinderGeometry(WR, WR, WW, 14),
        mTyre,
      );
      tyre.rotation.z = Math.PI / 2;
      sg.add(tyre);

      // Tyre outer edge band (tread ridge, slightly larger ring at midline)
      const tread = new THREE.Mesh(
        new THREE.CylinderGeometry(WR + 0.04, WR + 0.04, WW * 0.35, 14),
        mBlack,
      );
      tread.rotation.z = Math.PI / 2;
      sg.add(tread);

      // ── RIM OUTER DISC — RED, sits at outer face of tyre ─────────────────────
      // This is what makes the rim visible. A flat disc at outerX, full radius.
      const rimDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.88, WR * 0.88, 0.06, 12),
        mRim,
      );
      rimDisc.rotation.z = Math.PI / 2;
      rimDisc.position.x = outerX - (isLeft ? -0.01 : 0.01);
      sg.add(rimDisc);

      // ── RIM INNER DISH — recessed red showing depth ───────────────────────────
      const rimDish = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.68, WR * 0.68, WW * 0.55, 12),
        mRim,
      );
      rimDish.rotation.z = Math.PI / 2;
      sg.add(rimDish);

      // Rim inner fill (slightly darker to show depth)
      const rimInner = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.44, WR * 0.44, WW * 0.4, 10),
        mBody,
      );
      rimInner.rotation.z = Math.PI / 2;
      sg.add(rimInner);

      // ── SPOKES — 4 wide chunky (Hummer style) ─────────────────────────────────
      for (let s = 0; s < 4; s++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, WR * 1.05, WW * 0.22),
          mBody,
        );
        spoke.rotation.x = (s / 4) * Math.PI * 2;
        spoke.position.x = outerX - (isLeft ? -0.02 : 0.02);
        sg.add(spoke);
      }

      // ── HUB — chrome center cap ────────────────────────────────────────────────
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.2, WR * 0.2, 0.08, 8),
        mChrome,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = outerX + (isLeft ? -0.02 : 0.02);
      sg.add(hub);

      // ── 5 LUG NUTS — chrome, visible on outer face ────────────────────────────
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * Math.PI * 2;
        const lug = new THREE.Mesh(
          new THREE.CylinderGeometry(0.048, 0.048, 0.06, 6),
          mChrome,
        );
        lug.rotation.z = Math.PI / 2;
        lug.position.set(
          outerX + (isLeft ? -0.02 : 0.02),
          Math.sin(ang) * WR * 0.44,
          Math.cos(ang) * WR * 0.44,
        );
        sg.add(lug);
      }
    });

    // ── CONTACT SHADOW ────────────────────────────────────────────────────────
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.0, 24),
      new THREE.MeshBasicMaterial({
        color: 0,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.05, 0.55, 1);
    shadow.position.y = 0.02;
    g.add(shadow);

    g.position.set(this.x, 0, this.z);
    g.rotation.y = this.angle;
    this.scene.add(g);
    this.group = g;
  }

  _buildGroundRing() {
    this._groundRing = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.3, 20),
      new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    this._groundRing.rotation.x = -Math.PI / 2;
    this._groundRing.position.y = 0.08;
    this.scene.add(this._groundRing);
  }

  // ── WHEEL TRAILS — 4 per-wheel ground ribbons ─────────────────────────────
  // Bruno's Trails.js uses DataTexture + cylinder geometry for smooth ribbons.
  // We use a simpler approach: 4 flat PlaneGeometry strips, one per wheel,
  // each positioned at the wheel's world position and elongated along heading.
  //
  // Key: each trail tracks its wheel's WORLD position each frame.
  // On cornering the front wheels steer, so their trails curve naturally.
  // On hard acceleration all 4 trails appear simultaneously — like tire smoke.
  //
  // Result: tire marks that read correctly from the high camera angle.
  _buildWheelTrails() {
    this._wheelTrails = [];
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 1),
        new THREE.MeshBasicMaterial({
          color: 0x221100,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.018;
      this.scene.add(mesh);
      this._wheelTrails.push({
        mesh,
        px: 0,
        pz: 0, // previous world position of this wheel
        initialized: false,
      });
    }
  }

  // ── SPARKS — 8 bright flecks that arc outward from collision point ──────────
  // Each spark is a tiny box mesh with random velocity + gravity. Lives ~0.35s.
  _spawnSparks(x, z, impactMag) {
    const count = Math.floor(6 + impactMag * 6);
    for (let i = 0; i < count; i++) {
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.22),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.1 + Math.random() * 0.05, 1, 0.75),
          transparent: true,
          opacity: 1.0,
        }),
      );
      spark.position.set(
        x + (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.8,
        z + (Math.random() - 0.5) * 1.5,
      );
      const speed = (0.6 + Math.random() * 0.8) * impactMag;
      const angle = Math.random() * Math.PI * 2;
      spark.userData.life = 1.0;
      spark.userData.vy = 0;
      this.scene.add(spark);
      this._sparks.push({
        mesh: spark,
        vx: Math.cos(angle) * speed * 12,
        vy: (3.5 + Math.random() * 4) * impactMag,
        vz: Math.sin(angle) * speed * 12,
      });
    }
  }
}
