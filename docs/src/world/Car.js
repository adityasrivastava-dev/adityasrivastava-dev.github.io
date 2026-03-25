// ── CAR — position, velocity, mesh visuals. Physics delegated to Physics.js. ─
import Physics from './Physics.js';
import { Car as C } from '../utils/constants.js';

export default class Car {
  constructor(scene, events) {
    this.scene  = scene;
    this.events = events;

    // ── PHYSICS STATE ──────────────────────────────────────────────────────
    this.x     = 0;    // spawn at center (player start from city-data)
    this.z     = 40;
    this.vx    = 0;
    this.vz    = 0;
    this.angle = Math.PI;  // face north (-Z)
    this.speed = 0;
    this.steerAngle  = 0;
    this.sinA  = 0;
    this.cosA  = -1;
    this._fwdVel = 0;
    this._latVel = 0;

    // Visual derived (not physics)
    this.suspY        = 0;
    this._suspVY      = 0;
    this._bodyRoll    = 0;
    this._prevSpeed   = 0;

    this._weatherGrip = 1.0;
    this._physics     = new Physics();

    // Build mesh
    this.group       = null;
    this.bodyMesh    = null;
    this.wheelGroups = [];
    this._buildMesh();
    this._buildGroundRing();
  }

  // ── PHYSICS STEP (called by Application tick loop) ─────────────────────────
  _physicsStep(input, dt, subSteps, buildingBoxes) {
    const state = {
      vx: this.vx, vz: this.vz,
      angle: this.angle, steerAngle: this.steerAngle
    };
    const inp = {
      throttle:  input.throttleAxis,
      reverse:   input.reverseAxis,
      steerRaw:  input.steerAxis,
      handbrake: (input.brake && !input.forward),
    };

    // Run sub-steps for precision (set by tick system)
    const result = subSteps > 1
      ? this._physics.multiStep(state, inp, this._weatherGrip, dt, subSteps)
      : this._physics.step(state, inp, this._weatherGrip, dt);

    this.vx         = result.vx;
    this.vz         = result.vz;
    this.angle      = result.angle;
    this.steerAngle = result.steerAngle;
    this.speed      = result.speed;
    this._fwdVel    = result.fwdVel;
    this._latVel    = result.latVel;
    this.sinA       = Math.sin(this.angle);
    this.cosA       = Math.cos(this.angle);

    // Integrate position with axis-separated collision
    this._integrate(buildingBoxes);
    this._prevSpeed = this.speed;
  }

  _integrate(boxes) {
    const nx = this.x + this.vx;
    const nz = this.z + this.vz;

    if (!this._collides(nx, nz, boxes)) {
      this.x = nx; this.z = nz;
    } else if (!this._collides(nx, this.z, boxes)) {
      this.x = nx; this.vz *= -0.25;
    } else if (!this._collides(this.x, nz, boxes)) {
      this.z = nz; this.vx *= -0.25;
    } else {
      this.vx *= -0.2; this.vz *= -0.2;
    }

    // World boundary clamp (2.5x world scale)
    this.x = Math.max(-215, Math.min(215, this.x));
    this.z = Math.max(-195, Math.min(135, this.z));
  }

  _collides(nx, nz, boxes) {
    for (const b of boxes) {
      if (nx > b.minX - C.HW && nx < b.maxX + C.HW &&
          nz > b.minZ - C.HD && nz < b.maxZ + C.HD) return true;
    }
    return false;
  }

  // ── VISUAL UPDATE (called every render frame) ──────────────────────────────
  updateVisuals(dt, now) {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.angle;

    // Body roll — proportional to lateral G
    const rollTarget = -this._latVel * 6.0 * (1.0 + this.speed / C.MAX_SPEED);
    this._bodyRoll += (rollTarget - this._bodyRoll) * 0.12;
    this.group.rotation.z = this._bodyRoll;

    // Suspension spring-damper
    const bumpFreq  = 5.0 + this.speed * 40;
    const bumpAmp   = this.speed * 0.028 + Math.abs(this.steerAngle) * this.speed * 0.04;
    const bumpForce = Math.sin(now * bumpFreq) * bumpAmp;
    this._suspVY += (bumpForce - this.suspY * 28 - this._suspVY * 8) * 0.016;
    this.suspY   += this._suspVY;
    this.suspY    = Math.max(-0.04, Math.min(0.12, this.suspY));
    this.group.position.y = this.suspY;

    // Wheel spin
    const spinRate = this._fwdVel * 2.8;
    this.wheelGroups.forEach(sg => { sg.rotation.x += spinRate; });

    // Ground ring
    if (this._groundRing) {
      this._groundRing.position.set(this.x, 0.08, this.z);
      const pulse = 1 + Math.sin(now * 3.5) * 0.07;
      this._groundRing.scale.setScalar(pulse);
      this._groundRing.material.opacity = Math.min(0.55, Math.abs(this.speed)*3.5+0.12);
    }
  }

  setWeatherGrip(grip)   { this._weatherGrip = grip; }
  setNightMode(isNight)  {
    if (this._headLight) this._headLight.intensity = isNight ? 7 : 0;
    if (this._tailLight) this._tailLight.intensity = isNight ? 2.5 : 0;
  }

  // ── MESH ────────────────────────────────────────────────────────────────────
  _mc(key, color) {
    const mc = window._matcaps || {};
    return new THREE.MeshMatcapMaterial({ color, matcap: mc[key] || mc.warm });
  }

  _box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z);
    return m;
  }

  _buildMesh() {
    const g = new THREE.Group();

    const mBody   = this._mc('car',     0xdd2200);
    const mDark   = this._mc('carDark', 0x881200);
    const mBlack  = this._mc('dark',    0x181210);
    const mChrome = this._mc('chrome',  0xbbbbaa);
    const mTyre   = this._mc('tyre',    0x141210);
    const mRed    = this._mc('car',     0xcc2000);
    const mGlass  = new THREE.MeshMatcapMaterial({
      color: 0x4477aa, matcap: (window._matcaps||{}).glass,
      transparent: true, opacity: 0.68,
    });

    // Dimensions — Bruno Simon style: huge wheels, squished body
    const WR=0.58, WW=0.46, WTX=1.22, WFZ=1.55, WRZ=-1.55, AXH=WR;
    const BY=AXH+0.04, BH=0.46, BW=1.58, BD=2.95;
    const CY=BY+BH, CH=0.52, CW=1.38, CD=1.6, CZ=-0.2;
    const RY=CY+CH;

    g.add(this._box(BW+0.1, 0.18, BD, mBlack, 0, AXH+0.09, 0));  // undercarriage
    const body = this._box(BW, BH, BD, mBody, 0, BY+BH/2, 0);
    g.add(body); this.bodyMesh = body;

    // Wheel arch flares
    for (const z of [WFZ*0.64, WRZ*0.64])
      for (const s of [-1,1])
        g.add(this._box(0.22, 0.42, 1.12, mBlack, s*(BW/2+0.09), BY+0.22, z));

    // Cabin
    g.add(this._box(CW, CH, CD, mDark, 0, CY+CH/2, CZ));
    g.add(this._box(CW+0.05, 0.1, CD+0.02, mBlack, 0, RY+0.05, CZ)); // roof

    // Windshields
    const wsF = this._box(CW-0.08, CH*0.82, 0.08, mGlass, 0, CY+CH*0.48, CZ+CD/2+0.01);
    wsF.rotation.x = 0.24; g.add(wsF);
    const wsR = this._box(CW-0.08, CH*0.78, 0.08, mGlass, 0, CY+CH*0.46, CZ-CD/2-0.01);
    wsR.rotation.x = -0.22; g.add(wsR);
    for (const s of [-1,1]) {
      g.add(this._box(0.07, CH*0.74, CD*0.68, mGlass, s*(CW/2+0.02), CY+CH*0.5, CZ));
    }

    // Front grille + headlights
    g.add(this._box(BW-0.06, BH*0.72, 0.09, mBlack, 0, BY+BH*0.38, WFZ+BD/2-0.04));
    for (const x of [-0.54, 0.54]) {
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.155,12),
        new THREE.MeshBasicMaterial({ color: 0xffeeaa }));
      lens.position.set(x, BY+BH*0.52, WFZ+BD/2+0.06); g.add(lens);
    }

    // Bumpers
    g.add(this._box(BW+0.08, 0.2, 0.17, mBlack, 0, BY+0.1, WFZ+BD/2+0.04));
    g.add(this._box(BW+0.08, 0.19, 0.16, mBlack, 0, BY+0.1, WRZ-BD/2-0.04));

    // Tail lights
    const tl = new THREE.Mesh(new THREE.BoxGeometry(BW-0.12, 0.07, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff1800 }));
    tl.position.set(0, BY+BH*0.72, WRZ-BD/2-0.02); g.add(tl);

    // Car lights
    this._headLight = new THREE.PointLight(0xffe8aa, 0, 16);
    this._headLight.position.set(0, BY+BH*0.5, WFZ+BD/2+1.2); g.add(this._headLight);
    this._tailLight = new THREE.PointLight(0xff1800, 0, 8);
    this._tailLight.position.set(0, BY+BH*0.7, WRZ-BD/2-1.0); g.add(this._tailLight);

    // Wheels x4
    [[WTX,AXH,WFZ,false],[-WTX,AXH,WFZ,true],[WTX,AXH,WRZ,false],[-WTX,AXH,WRZ,true]]
      .forEach(([wx,wy,wz,isLeft]) => {
        const wg = new THREE.Group(); wg.position.set(wx,wy,wz); g.add(wg);
        const sg = new THREE.Group(); wg.add(sg); this.wheelGroups.push(sg);

        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(WR,WR,WW,14), mTyre);
        tyre.rotation.z = Math.PI/2; sg.add(tyre);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(WR*0.76,WR*0.76,WW+0.04,14), mRed);
        rim.rotation.z = Math.PI/2; sg.add(rim);

        const outerX = isLeft ? -(WW/2+0.015) : WW/2+0.015;
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(WR*0.38,WR*0.38,0.06,12), mRed);
        hub.rotation.z = Math.PI/2; hub.position.x = outerX; sg.add(hub);
        for (let s = 0; s < 5; s++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08,WR*1.18,WW*0.28), mChrome);
          spoke.rotation.x = (s/5)*Math.PI*2; spoke.position.x = outerX; sg.add(spoke);
        }
      });

    // Blob shadow
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.6,20),
      new THREE.MeshBasicMaterial({ color:0, transparent:true, opacity:0.22, depthWrite:false }));
    shadow.rotation.x = -Math.PI/2; shadow.scale.set(1,0.65,1); shadow.position.y = 0.03;
    g.add(shadow);

    g.position.set(this.x, 0, this.z);
    g.rotation.y = this.angle;
    this.scene.add(g);
    this.group = g;
  }

  _buildGroundRing() {
    this._groundRing = new THREE.Mesh(
      new THREE.RingGeometry(1.0,1.3,20),
      new THREE.MeshBasicMaterial({ color:0xffcc44, transparent:true, opacity:0.55, side:THREE.DoubleSide })
    );
    this._groundRing.rotation.x = -Math.PI/2;
    this._groundRing.position.y = 0.08;
    this.scene.add(this._groundRing);
  }
}
