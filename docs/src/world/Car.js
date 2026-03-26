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

    // ── MATERIALS — Bruno Simon dark Jeep palette ─────────────────────────────
    // Bruno's car is almost black with deep red/orange accents.
    // The dark body makes it read immediately against the warm orange world.
    const mBody = this._mc("car", 0xcc1100); // deep red body
    const mTop = this._mc("carDark", 0x1a1208); // near-black cab top
    const mBlack = this._mc("dark", 0x0e0c0a); // deep black chassis
    const mDark2 = this._mc("dark", 0x221510); // dark-dark body panels
    const mChrome = this._mc("chrome", 0x998877); // warm chrome trim
    const mTyre = this._mc("tyre", 0x100e0c); // near-black tyre
    const mRim = this._mc("dark", 0x1a1410); // very dark rim
    const mGlass = new THREE.MeshMatcapMaterial({
      color: 0x334466,
      matcap: (window._matcaps || {}).glass,
      transparent: true,
      opacity: 0.55,
    });
    const mAccent = new THREE.MeshBasicMaterial({ color: 0xff2200 }); // red accents

    // ── DIMENSIONS — exaggerated toy proportions ──────────────────────────────
    // Bruno's signature: wheels are HUGE (almost as tall as the car body),
    // body is WIDE and FLAT, cabin is SHORT and pushed back.
    // This makes the car read as a designed toy object, not a model.
    const WR = 0.72; // wheel radius — very large (was 0.58)
    const WW = 0.58; // wheel width — chunky (was 0.46)
    const WTX = 1.38; // wheel track X — wider stance (was 1.22)
    const WFZ = 1.65; // front wheel Z (was 1.55)
    const WRZ = -1.65; // rear wheel Z (was -1.55)
    const AXH = WR; // axle height = wheel radius

    // Body dimensions — wider, flatter
    const BY = AXH + 0.02;
    const BH = 0.42; // body height (flatter = more toy-like)
    const BW = 1.9; // body width — WIDE (was 1.58)
    const BD = 3.2; // body length (was 2.95)

    // Cabin — short, pushed back, chunky
    const CY = BY + BH;
    const CH = 0.58; // cabin height
    const CW = 1.62; // cabin width
    const CD = 1.5; // cabin depth (short)
    const CZ = -0.3; // cabin offset backward
    const RY = CY + CH;

    // ── UNDERBODY ─────────────────────────────────────────────────────────────
    g.add(this._box(BW + 0.08, 0.12, BD, mBlack, 0, AXH + 0.06, 0));

    // ── MAIN BODY ─────────────────────────────────────────────────────────────
    const body = this._box(BW, BH, BD, mBody, 0, BY + BH / 2, 0);
    g.add(body);
    this.bodyMesh = body;

    // Body side detail strips — dark panel lines for visual depth
    for (const sx of [-1, 1]) {
      // Lower side stripe — darker tone
      g.add(
        this._box(
          0.06,
          BH * 0.55,
          BD * 0.92,
          mDark2,
          sx * (BW / 2 + 0.025),
          BY + BH * 0.28,
          0,
        ),
      );
      // Upper body flare
      g.add(
        this._box(
          0.08,
          BH * 0.3,
          BD * 0.7,
          mBlack,
          sx * (BW / 2 + 0.02),
          BY + BH * 0.75,
          0,
        ),
      );
    }

    // Flat hood — slightly raised above body front
    g.add(
      this._box(
        BW * 0.85,
        0.06,
        BD * 0.32,
        mDark2,
        0,
        BY + BH + 0.01,
        WFZ - BD * 0.08,
      ),
    );

    // Front overhang / snout
    g.add(
      this._box(
        BW * 0.88,
        BH * 0.45,
        0.22,
        mBlack,
        0,
        BY + BH * 0.22,
        WFZ + BD / 2 + 0.08,
      ),
    );

    // ── WHEEL ARCHES — very pronounced, Bruno style ───────────────────────────
    // These are the big black rounded arches that make wheels look huge
    for (const wz of [WFZ * 0.62, WRZ * 0.62]) {
      for (const sx of [-1, 1]) {
        // Main arch panel
        g.add(
          this._box(
            0.28,
            WR * 1.05,
            1.35,
            mBlack,
            sx * (BW / 2 + 0.12),
            BY + WR * 0.25,
            wz,
          ),
        );
        // Arch lip
        g.add(
          this._box(
            0.12,
            0.08,
            1.42,
            mDark2,
            sx * (BW / 2 + 0.22),
            BY + WR * 0.95,
            wz,
          ),
        );
      }
    }

    // ── CABIN ─────────────────────────────────────────────────────────────────
    // Near-black top — Bruno's car has a very dark cab that reads as a solid
    // black shape against the body color
    g.add(this._box(CW, CH, CD, mTop, 0, CY + CH / 2, CZ));

    // Roof — flat with slight overhang
    g.add(this._box(CW + 0.12, 0.09, CD + 0.14, mBlack, 0, RY + 0.045, CZ));

    // ── ROOF RACK — Bruno's car has visible roof rack bars ────────────────────
    const rackMat = mChrome;
    for (const rz of [-0.45, 0, 0.45]) {
      g.add(this._box(CW * 0.78, 0.055, 0.055, rackMat, 0, RY + 0.12, CZ + rz));
    }
    // Side rails
    for (const sx of [-1, 1]) {
      g.add(
        this._box(
          0.055,
          0.055,
          CD * 0.78,
          rackMat,
          sx * CW * 0.36,
          RY + 0.12,
          CZ,
        ),
      );
    }

    // ── WINDSHIELDS ───────────────────────────────────────────────────────────
    // Front — angled
    const wsF = this._box(
      CW - 0.1,
      CH * 0.8,
      0.07,
      mGlass,
      0,
      CY + CH * 0.47,
      CZ + CD / 2 + 0.01,
    );
    wsF.rotation.x = 0.28;
    g.add(wsF);

    // Rear — slight angle
    const wsR = this._box(
      CW - 0.1,
      CH * 0.72,
      0.07,
      mGlass,
      0,
      CY + CH * 0.44,
      CZ - CD / 2 - 0.01,
    );
    wsR.rotation.x = -0.2;
    g.add(wsR);

    // Side windows
    for (const sx of [-1, 1]) {
      g.add(
        this._box(
          0.06,
          CH * 0.7,
          CD * 0.72,
          mGlass,
          sx * (CW / 2 + 0.02),
          CY + CH * 0.5,
          CZ,
        ),
      );
    }

    // A-pillars (front window frame)
    for (const sx of [-1, 1]) {
      g.add(
        this._box(
          0.06,
          CH * 0.82,
          0.06,
          mTop,
          sx * (CW / 2 - 0.06),
          CY + CH * 0.5,
          CZ + CD / 2,
        ),
      );
    }

    // ── FRONT DETAILS ─────────────────────────────────────────────────────────
    // Grille — wide dark panel
    g.add(
      this._box(
        BW * 0.72,
        BH * 0.55,
        0.08,
        mBlack,
        0,
        BY + BH * 0.3,
        WFZ + BD / 2,
      ),
    );

    // Headlight housings — rectangular blocks
    for (const hx of [-0.62, 0.62]) {
      // Housing
      g.add(
        this._box(
          0.32,
          0.18,
          0.07,
          mBlack,
          hx,
          BY + BH * 0.68,
          WFZ + BD / 2 + 0.01,
        ),
      );
      // Light face
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.12, 0.03),
        new THREE.MeshBasicMaterial({ color: 0xffeebb }),
      );
      lens.position.set(hx, BY + BH * 0.68, WFZ + BD / 2 + 0.05);
      g.add(lens);
    }

    // Low front splitter
    g.add(
      this._box(
        BW + 0.06,
        0.09,
        0.18,
        mBlack,
        0,
        AXH + 0.05,
        WFZ + BD / 2 + 0.06,
      ),
    );

    // ── REAR DETAILS ──────────────────────────────────────────────────────────
    // Spare tyre mount (Bruno's Jeep has this) — circular on rear
    const spareTyre = new THREE.Mesh(
      new THREE.CylinderGeometry(WR * 0.62, WR * 0.62, WW * 0.55, 12),
      mTyre,
    );
    spareTyre.rotation.z = Math.PI / 2;
    spareTyre.position.set(0, BY + BH * 0.5, WRZ - BD / 2 - 0.26);
    g.add(spareTyre);
    // Spare tyre bracket
    g.add(
      this._box(
        0.08,
        BH * 0.7,
        0.08,
        mBlack,
        0,
        BY + BH * 0.5,
        WRZ - BD / 2 - 0.06,
      ),
    );

    // Tail lights — horizontal strip
    for (const tx of [-0.5, 0.5]) {
      const tl = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.09, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xff1800 }),
      );
      tl.position.set(tx, BY + BH * 0.75, WRZ - BD / 2 - 0.02);
      g.add(tl);
    }

    // Rear bumper
    g.add(
      this._box(
        BW + 0.06,
        0.22,
        0.17,
        mBlack,
        0,
        BY + 0.11,
        WRZ - BD / 2 - 0.04,
      ),
    );

    // ── ENGINE UNDERGLOW — magenta like Bruno's ───────────────────────────────
    // Bruno's car has that distinctive pink/magenta light underneath
    this._engGlow = new THREE.PointLight(0xff44aa, 0.6, 4.5);
    this._engGlow.position.set(0, 0.2, 0);
    g.add(this._engGlow);

    // Car lights
    this._headLight = new THREE.PointLight(0xffe8aa, 0, 16);
    this._headLight.position.set(0, BY + BH * 0.5, WFZ + BD / 2 + 1.2);
    g.add(this._headLight);
    this._tailLight = new THREE.PointLight(0xff1800, 0, 8);
    this._tailLight.position.set(0, BY + BH * 0.7, WRZ - BD / 2 - 1.0);
    g.add(this._tailLight);

    // ── WHEELS x4 — massive, chunky, minimal spokes ───────────────────────────
    // Bruno's wheels are the most prominent feature — nearly as wide as they
    // are tall, with thick chunky tread. Almost no spokes visible.
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

      // ── TYRE — very chunky ─────────────────────────────────────────────────
      const tyre = new THREE.Mesh(
        new THREE.CylinderGeometry(WR, WR, WW, 16),
        mTyre,
      );
      tyre.rotation.z = Math.PI / 2;
      sg.add(tyre);

      // Tyre tread ridge (outer ring slightly larger)
      const tread = new THREE.Mesh(
        new THREE.CylinderGeometry(WR + 0.025, WR + 0.025, WW * 0.55, 16),
        mBlack,
      );
      tread.rotation.z = Math.PI / 2;
      sg.add(tread);

      // ── RIM — dark and minimal ─────────────────────────────────────────────
      // Bruno's rims are very dark, almost black — barely visible
      const outerX = isLeft ? -(WW / 2 + 0.01) : WW / 2 + 0.01;

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.68, WR * 0.68, WW * 0.48, 12),
        mRim,
      );
      rim.rotation.z = Math.PI / 2;
      sg.add(rim);

      // Hub cap
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.28, WR * 0.28, 0.07, 10),
        mChrome,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = outerX;
      sg.add(hub);

      // 4 chunky spoke blocks — visible but simple
      for (let s = 0; s < 4; s++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, WR * 1.08, WW * 0.2),
          mRim,
        );
        spoke.rotation.x = (s / 4) * Math.PI * 2;
        spoke.position.x = outerX;
        sg.add(spoke);
      }

      // Lug nuts
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * Math.PI * 2;
        const lug = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.06, 6),
          mChrome,
        );
        lug.rotation.z = Math.PI / 2;
        lug.position.set(
          outerX,
          Math.sin(ang) * WR * 0.44,
          Math.cos(ang) * WR * 0.44,
        );
        sg.add(lug);
      }
    });

    // ── CONTACT SHADOW ────────────────────────────────────────────────────────
    // Larger, softer shadow — Bruno's cars have prominent blob shadows
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 24),
      new THREE.MeshBasicMaterial({
        color: 0,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.1, 0.6, 1);
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
