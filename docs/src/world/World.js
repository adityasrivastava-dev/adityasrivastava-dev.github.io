// ── WORLD — orchestrates all scene objects. One update, clear responsibilities.
import Car     from './Car.js';
import Objects from './Objects.js';
import Roads   from './Roads.js';

// World is 2.5x the original — same building positions, much more breathing room
const SCALE = 2.5;

export default class World {
  constructor(scene, events) {
    this.scene  = scene;
    this.events = events;
    this.isNight = false;

    this.car     = new Car(scene, events);
    this.objects = new Objects(scene, events);
    this.roads   = new Roads(scene);
  }

  buildWorld() {
    this._buildLighting();
    this._buildGround();
    this.roads.build();
    this.objects.buildAll(this.isNight);
    this._buildCenterpiece();
    this._buildPrayerFlags();
    this._buildGatewayArches();
    this._buildWorldName();
    this._buildAtmosphere();
  }

  // ── MAIN UPDATE — called by Application every render frame ─────────────────
  // Car physics is called by the tick loop SEPARATELY (physicsStep)
  // This just updates visuals + world ambients
  update(input, dt, now, gameStarted) {
    // Update car visuals (separate from physics)
    this.car.updateVisuals(dt, now);

    if (gameStarted) {
      this.objects.updateWindSway(now);
      this.objects.updateBuildingEntities(this.car.x, this.car.z, now, dt);
    }

    this._updateAtmosphere(now, dt);
    this._updateLighting(now, dt);
  }

  // Called by Application tick loop
  _updateAmbients(now, dt, carX, carZ) {
    this.car.updateVisuals(dt, now);
    // Car spawns dust in its own updateVisuals via world reference
    this.objects.updateWindSway(now);
    this.objects.updateBuildingEntities(carX, carZ, now, dt);
    this.objects.updateEntryBursts();
    this._updateAtmosphere(now, dt);
    this._updateLighting(now, dt);
    // Dust trail — car tells world where it is each frame
    if (this.car.speed > 0.04) {
      this.spawnDust(carX, carZ, this.car.speed);
    }
  }

  // ── LIGHTING ─────────────────────────────────────────────────────────────
  _buildLighting() {
    const s = this.scene;

    // Sky/ground gradient — warm zenith, violet ground
    this.hemiLight = new THREE.HemisphereLight(0xffe8aa, 0x7755aa, 1.2);
    s.add(this.hemiLight);

    // Key sun — high-angle, warm gold, strong shadows
    this.sunLight = new THREE.DirectionalLight(0xffe088, 3.8);
    this.sunLight.position.set(55, 95, 25);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left   = -180;
    this.sunLight.shadow.camera.right  =  180;
    this.sunLight.shadow.camera.top    =  180;
    this.sunLight.shadow.camera.bottom = -180;
    this.sunLight.shadow.camera.far    = 600;
    this.sunLight.shadow.bias = -0.0003;
    s.add(this.sunLight);

    // Cool fill from opposite side — creates warm/cool contrast on all faces
    this.fillLight = new THREE.DirectionalLight(0x8866cc, 0.75);
    this.fillLight.position.set(-70, 40, -30);
    s.add(this.fillLight);

    // Rim/back light — low, warm amber, from behind the city
    // Creates edge separation between objects and sky (key for 3D depth reading)
    this.rimLight = new THREE.DirectionalLight(0xff9944, 0.55);
    this.rimLight.position.set(0, 12, 120);
    s.add(this.rimLight);

    // Ground bounce — very subtle warm scatter from red earth
    this.bounceLight = new THREE.DirectionalLight(0xcc6633, 0.18);
    this.bounceLight.position.set(0, -1, 0);
    s.add(this.bounceLight);

    // Ambient — low so shadows have real depth
    this.ambLight = new THREE.AmbientLight(0xffcc77, 0.65);
    s.add(this.ambLight);

    // Deity spotlight — rotates slowly around the city center
    // Creates the "holy light sweeping the temples" effect. Dramatic.
    this.deitySpot = new THREE.SpotLight(0xffeedd, 2.2, 220, Math.PI * 0.12, 0.5, 1.2);
    this.deitySpot.position.set(80, 90, -20);
    this.deitySpotTarget = new THREE.Object3D();
    this.deitySpotTarget.position.set(0, 0, 0);
    s.add(this.deitySpotTarget);
    this.deitySpot.target = this.deitySpotTarget;
    s.add(this.deitySpot);

    // Central ground glow — warm pooling light at origin for the intro wow moment
    this.originGlow = new THREE.PointLight(0xffcc88, 0, 55);
    this.originGlow.position.set(0, 2, 0);
    s.add(this.originGlow);
  }

  applyWeather(w) {
    const cfgs = {
      day:    { bg:0xeabb88, fog:0xf0c898, fogD:0.0035, sun:0xffe088, sunI:3.8, fill:0x8866cc, fillI:0.75, amb:0xffcc77, ambI:0.65, exp:1.08 },
      night:  { bg:0x0a0820, fog:0x0a0820, fogD:0.004,  sun:0x6688cc, sunI:0.8, fill:0x220844, fillI:0.5,  amb:0x110822, ambI:0.15, exp:1.25 },
      sunset: { bg:0xff6030, fog:0xff6030, fogD:0.006,  sun:0xff4411, sunI:2.8, fill:0x5522bb, fillI:1.1,  amb:0x440800, ambI:0.25, exp:1.08 },
      rain:   { bg:0x334050, fog:0x334050, fogD:0.012,  sun:0xdd9977, sunI:0.8, fill:0x2244aa, fillI:1.1,  amb:0x100806, ambI:0.3,  exp:1.1  },
      fog:    { bg:0xccb09a, fog:0xccb09a, fogD:0.022,  sun:0xffddbb, sunI:0.9, fill:0x446688, fillI:0.5,  amb:0x221408, ambI:0.6,  exp:0.9  },
      snow:   { bg:0xeedfcc, fog:0xeedfcc, fogD:0.007,  sun:0xfff0e0, sunI:1.8, fill:0x7799cc, fillI:0.5,  amb:0x1a1008, ambI:0.4,  exp:0.95 },
    };
    const cfg = cfgs[w] || cfgs.day;
    this.scene.background = new THREE.Color(cfg.bg);
    this.scene.fog = new THREE.FogExp2(cfg.fog, cfg.fogD);
    if (this.sunLight)    { this.sunLight.color.set(cfg.sun);   this.sunLight.intensity  = cfg.sunI;   }
    if (this.fillLight)   { this.fillLight.color.set(cfg.fill); this.fillLight.intensity = cfg.fillI;  }
    if (this.ambLight)    { this.ambLight.color.set(cfg.amb);   this.ambLight.intensity  = cfg.ambI;   }
    if (this.rimLight)    { this.rimLight.intensity   = cfg.sunI * 0.14; }
    if (this.bounceLight) { this.bounceLight.intensity = w === 'night' ? 0 : 0.18; }
    if (this.deitySpot)   { this.deitySpot.intensity   = w === 'night' ? 3.5 : 2.2; }
    this.isNight = (w === 'night');
    this.events.emit('weatherChange', { weather: w, isNight: this.isNight });
    const grip = { day:1,night:1,sunset:1,fog:0.72,rain:0.3,snow:0.12 };
    this.car.setWeatherGrip(grip[w] ?? 1.0);
  }

  _updateLighting(now) {
    if (!this.sunLight) return;
    // Sun color breathes — subtly alive, not static
    const b = Math.sin(now * 0.08 * Math.PI * 2);
    this.sunLight.color.lerp(new THREE.Color(1+b*0.04, 0.87+b*0.03, 0.53-b*0.03), 0.05);

    // Deity spotlight slowly orbits the city — holy light sweeping temples
    // Radius 100, height 90, full revolution every 80 seconds
    if (this.deitySpot) {
      const t = now * (Math.PI * 2 / 80);
      this.deitySpot.position.x = Math.sin(t) * 100;
      this.deitySpot.position.z = Math.cos(t) * 100;
      // Pulse intensity — breathing divine light
      this.deitySpot.intensity += (
        (this.isNight ? 3.5 : 2.2) * (1 + Math.sin(now * 0.4) * 0.12)
        - this.deitySpot.intensity
      ) * 0.03;
    }

    // Island center ring — rotates and pulses opacity (alive centerpiece)
    if (this._islandRing) {
      this._islandRing.rotation.z = now * 0.18;
      this._islandRing.material.opacity = 0.55 + Math.sin(now * 1.4) * 0.22;
    }
    if (this._islandRingOuter) {
      this._islandRingOuter.rotation.z = -now * 0.09;
      this._islandRingOuter.material.opacity = 0.25 + Math.sin(now * 0.8 + 1) * 0.12;
    }

    // Origin glow fades in after intro then breathes — the "heart of the city"
    if (this.originGlow && this._originGlowTarget !== undefined) {
      this.originGlow.intensity += (this._originGlowTarget - this.originGlow.intensity) * 0.025;
    }
  }

  // Called by Application once intro finishes — wakes up the origin light
  pulseOriginAwake() {
    this._originGlowTarget = this.isNight ? 1.8 : 0.85;
    // Surge then settle
    if (this.originGlow) {
      this.originGlow.intensity = this.isNight ? 4.5 : 2.2;
    }
  }

  // ── GROUND (large flat plane + sandy pavement) ─────────────────────────────
  _buildGround() {
    const s = this.scene;
    // Large ground — 2.5x scale = 1000 units across
    const ground = new THREE.Mesh(new THREE.BoxGeometry(1000, 0.4, 1000),
      new THREE.MeshLambertMaterial({ color: 0xc86a44 }));
    ground.position.y = -0.2; ground.receiveShadow = true; s.add(ground);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshLambertMaterial({ color: 0x44aacc }));
    water.rotation.x = -Math.PI/2; water.position.y = -0.5; s.add(water);

    // Pavement blocks around central island (scaled up)
    const paveMat = new THREE.MeshLambertMaterial({ color: 0xd47a55 });
    [[-35,0,40,50],[35,0,40,50],[-35,-45,40,40],[35,-45,40,40],
     [70,20,35,55],[-70,20,35,55],[-70,-25,35,30],[70,-25,35,30],
    ].forEach(([x,z,w,d]) => {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(w,0.28,d), paveMat);
      blk.position.set(x, 0.14, z); blk.receiveShadow = true; s.add(blk);
    });
  }

  // ── CENTERPIECE ────────────────────────────────────────────────────────────
  _buildCenterpiece() {
    const s = this.scene;
    const tg = window._toonGrad;

    // Raised island — bigger at 2.5x scale
    const island = new THREE.Mesh(new THREE.CylinderGeometry(18, 20, 0.55, 18),
      new THREE.MeshLambertMaterial({ color: 0xcc7755 }));
    island.position.y = 0.28; s.add(island);

    // Inner paved circle
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(14, 14.5, 0.2, 16),
      new THREE.MeshLambertMaterial({ color: 0xdd9977 }));
    inner.position.y = 0.5; s.add(inner);

    // Glowing ground ring — tracked for animation in _updateLighting
    const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.18, 4, 64),
      new THREE.MeshBasicMaterial({ color: 0xddaaff, transparent: true, opacity: 0.75 }));
    ring.rotation.x = Math.PI/2; ring.position.y = 0.72;
    this._islandRing = ring;
    s.add(ring);

    // Outer slow ring — counter-rotates, creates depth
    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(17.5, 0.08, 4, 64),
      new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.25 }));
    ringOuter.rotation.x = Math.PI/2; ringOuter.position.y = 0.5;
    this._islandRingOuter = ringOuter;
    s.add(ringOuter);

    // Bench
    const wood = new THREE.MeshToonMaterial({ color: 0xcc8844, gradientMap: tg });
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.1, 0.85), wood);
      slat.position.set(0.5, 1.12, i*1.0); s.add(slat);
    }

    // Lamp posts (4 around island)
    const poleMat = new THREE.MeshToonMaterial({ color: 0x776688, gradientMap: tg });
    for (const [x,z] of [[-8,0],[8,0],[0,-8],[0,8]]) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6, 0.2), poleMat);
      pole.position.set(x, 3, z); s.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xffeeaa }));
      head.position.set(x, 6.2, z); s.add(head);
      const pl = new THREE.PointLight(0xffeeaa, this.isNight ? 2.5 : 0.4, 18);
      pl.position.set(x, 6.5, z); s.add(pl);
    }

    // Cherry blossom trees around island
    const pinks = [0xff88aa, 0xff99bb, 0xffaabb, 0xee7799];
    for (const [x,z] of [[11,8],[-11,8],[11,-8],[-11,-8],[0,14],[0,-14],[14,0],[-14,0]]) {
      const h = 2.5 + Math.random();
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.35),
        new THREE.MeshToonMaterial({ color: 0x8a5228, gradientMap: tg }));
      trunk.position.set(x, h/2, z); s.add(trunk);
      const r = 1.8 + Math.random();
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5),
        new THREE.MeshToonMaterial({ color: pinks[Math.floor(Math.random()*4)], gradientMap: tg }));
      leaf.position.set(x, h+r*0.7, z); s.add(leaf);
    }
  }

  // ── ATMOSPHERE — petals, fireflies, car dust trail ─────────────────────────
  _buildAtmosphere() {
    // ── BLOSSOM PETALS (existing, unchanged) ─────────────────────────────────
    const cnt = 500;
    const pos = new Float32Array(cnt*3), col = new Float32Array(cnt*3), vel = new Float32Array(cnt*3);
    for (let i = 0; i < cnt; i++) {
      pos[i*3]   = (Math.random()-0.5)*220;
      pos[i*3+1] = Math.random()*22;
      pos[i*3+2] = (Math.random()-0.5)*220;
      vel[i*3]   = (Math.random()-0.5)*0.012;
      vel[i*3+1] = -0.006 - Math.random()*0.008;
      vel[i*3+2] = (Math.random()-0.5)*0.012;
      const t = Math.random();
      if (t<0.4)      { col[i*3]=1; col[i*3+1]=0.55; col[i*3+2]=0.68; }
      else if (t<0.65){ col[i*3]=1; col[i*3+1]=0.78; col[i*3+2]=0.35; }
      else            { col[i*3]=1; col[i*3+1]=0.95; col[i*3+2]=0.55; }
    }
    const petalGeo = new THREE.BufferGeometry();
    petalGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    petalGeo.setAttribute('color',    new THREE.BufferAttribute(col,3));
    this._petals = new THREE.Points(petalGeo,
      new THREE.PointsMaterial({ size:0.28, vertexColors:true, transparent:true, opacity:0.75 }));
    this._petals.userData.vel = vel;
    this.scene.add(this._petals);

    // ── FIREFLIES — tiny bright motes clustered near temples at night ─────────
    // They drift slowly with sine noise, creating the "living world" feel.
    // Gold-cyan colour range, flicker via opacity in update.
    const FC = 120;
    const fPos = new Float32Array(FC*3), fCol = new Float32Array(FC*3);
    const fPhase = new Float32Array(FC); // per-firefly flicker phase offset
    const fireTempleAreas = [
      [45,-22],[28,35],[-55,-22],[-40,35],[0,55],[-28,-38],[0,-55],[-55,8],[55,-38],[55,8],[-22,-62],[22,-62]
    ];
    for (let i = 0; i < FC; i++) {
      const area = fireTempleAreas[i % fireTempleAreas.length];
      fPos[i*3]   = area[0] + (Math.random()-0.5)*12;
      fPos[i*3+1] = 1.5 + Math.random()*6;
      fPos[i*3+2] = area[1] + (Math.random()-0.5)*12;
      fPhase[i]   = Math.random()*Math.PI*2;
      const warm = Math.random() > 0.5;
      fCol[i*3]   = warm ? 1   : 0.5;
      fCol[i*3+1] = warm ? 0.9 : 0.9;
      fCol[i*3+2] = warm ? 0.3 : 1.0;
    }
    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute('position', new THREE.BufferAttribute(fPos,3));
    fireGeo.setAttribute('color',    new THREE.BufferAttribute(fCol,3));
    this._fireflies = new THREE.Points(fireGeo,
      new THREE.PointsMaterial({ size:0.18, vertexColors:true, transparent:true, opacity:0 }));
    this._fireflies.userData.phase = fPhase;
    this.scene.add(this._fireflies);

    // ── CAR DUST TRAIL — small sand/dirt particles spawned behind wheels ──────
    // Pre-allocated pool of 200 particles. Active ones have life > 0.
    const DUST_N = 200;
    const dPos  = new Float32Array(DUST_N*3);
    const dLife = new Float32Array(DUST_N); // 0 = dead
    const dVel  = new Float32Array(DUST_N*3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos,3));
    this._dustTrail = new THREE.Points(dustGeo,
      new THREE.PointsMaterial({ color:0xddaa77, size:0.35, transparent:true, opacity:0.0, depthWrite:false }));
    this._dustTrail.userData = { life:dLife, vel:dVel, head:0, DUST_N };
    this.scene.add(this._dustTrail);
  }

  _updateAtmosphere(now) {
    // ── PETALS ────────────────────────────────────────────────────────────────
    if (this._petals) {
      const pos = this._petals.geometry.attributes.position.array;
      const vel = this._petals.userData.vel;
      for (let i = 0, n = pos.length/3; i < n; i++) {
        pos[i*3]   += vel[i*3] + Math.sin(now*0.7+i*0.4)*0.003;
        pos[i*3+1] += vel[i*3+1];
        pos[i*3+2] += vel[i*3+2];
        if (pos[i*3+1] < 0) {
          pos[i*3]   = (Math.random()-0.5)*220;
          pos[i*3+1] = 20+Math.random()*5;
          pos[i*3+2] = (Math.random()-0.5)*220;
        }
      }
      this._petals.geometry.attributes.position.needsUpdate = true;
    }

    // ── FIREFLIES — drift + flicker. Visible at night, fade at day ───────────
    if (this._fireflies) {
      const pos   = this._fireflies.geometry.attributes.position.array;
      const phase = this._fireflies.userData.phase;
      const n     = pos.length/3;
      // Opacity: 0 in day, up to 0.85 at night (targets set by applyWeather)
      const targetOp = this.isNight ? 0.82 : 0.12;
      this._fireflies.material.opacity += (targetOp - this._fireflies.material.opacity) * 0.02;

      for (let i = 0; i < n; i++) {
        // Slow 3D drift with per-particle sine noise
        pos[i*3]   += Math.sin(now*0.22 + phase[i])     * 0.015;
        pos[i*3+1] += Math.sin(now*0.31 + phase[i]*1.3) * 0.008;
        pos[i*3+2] += Math.cos(now*0.19 + phase[i]*0.7) * 0.015;
        // Gentle vertical float — rise and stay in range 1.5–8
        if (pos[i*3+1] > 8)  pos[i*3+1] = 1.5;
        if (pos[i*3+1] < 0.5) pos[i*3+1] = 0.5;
      }
      this._fireflies.geometry.attributes.position.needsUpdate = true;
    }

    // ── DUST TRAIL — tick active particles ───────────────────────────────────
    if (this._dustTrail) {
      const { life, vel, DUST_N } = this._dustTrail.userData;
      const pos = this._dustTrail.geometry.attributes.position.array;
      let maxOp = 0;
      for (let i = 0; i < DUST_N; i++) {
        if (life[i] <= 0) continue;
        life[i] -= 0.025;
        pos[i*3]   += vel[i*3];
        pos[i*3+1] += 0.008 + vel[i*3+1]; // drift up
        pos[i*3+2] += vel[i*3+2];
        maxOp = Math.max(maxOp, life[i]);
      }
      this._dustTrail.geometry.attributes.position.needsUpdate = true;
      this._dustTrail.material.opacity = Math.min(0.45, maxOp * 0.45);
    }
  }

  // Called by Car.updateVisuals() to spawn dust when moving
  spawnDust(x, z, speed) {
    if (!this._dustTrail || speed < 0.05) return;
    const { life, vel, DUST_N } = this._dustTrail.userData;
    const pos = this._dustTrail.geometry.attributes.position.array;
    // Spawn 1-2 particles per call behind the car
    const count = speed > 0.3 ? 2 : 1;
    for (let s = 0; s < count; s++) {
      const i = this._dustTrail.userData.head;
      this._dustTrail.userData.head = (i + 1) % DUST_N;
      pos[i*3]   = x + (Math.random()-0.5)*2.5;
      pos[i*3+1] = 0.3 + Math.random()*0.3;
      pos[i*3+2] = z + (Math.random()-0.5)*2.5;
      life[i]    = 0.7 + Math.random()*0.3;
      vel[i*3]   = (Math.random()-0.5)*0.025;
      vel[i*3+1] = Math.random()*0.008;
      vel[i*3+2] = (Math.random()-0.5)*0.025;
    }
  }

  // ── PRAYER FLAGS ────────────────────────────────────────────────────────────
  _buildPrayerFlags() {
    const colors = [0xff3333,0xff9900,0xffdd00,0x33cc44,0x3388ff,0xcc44cc];
    const string = (x1,y,z1,x2,z2,n) => {
      for (let i = 0; i < n; i++) {
        const t  = (i+0.5)/n;
        const f  = new THREE.Mesh(new THREE.BoxGeometry(0.4,0.55,0.08),
          new THREE.MeshBasicMaterial({ color: colors[i%colors.length] }));
        f.position.set(x1+(x2-x1)*t, y-Math.sin(t*Math.PI)*1.2, z1+(z2-z1)*t);
        this.scene.add(f);
      }
    };
    // Scale flag positions 2.5x
    string(-55,14,-10, 55,-10, 18);
    string(-55,14,  5, 55,  5, 18);
    string(-35,14, 80, 35, 80, 12);
    string(-45,14,-138,45,-138, 14);
  }

  // ── GATEWAY ARCHES ──────────────────────────────────────────────────────────
  _buildGatewayArches() {
    const archMat = new THREE.MeshToonMaterial({ color: 0xf0d8a0, gradientMap: window._toonGrad });
    const goldMat = new THREE.MeshToonMaterial({ color: 0xffcc44, gradientMap: window._toonGrad });

    // Positions scaled 2.5x from original
    [
      { x:0,    z:-10,  ry:0,         label:'◈  HERO DISTRICT',     col:0x00ddff },
      { x:0,    z:-90,  ry:0,         label:'◈  MODERNIZATION ZONE', col:0xffcc44 },
      { x:0,    z:-140, ry:0,         label:'◈  EDUCATION DISTRICT', col:0xa78bfa },
      { x:0,    z:90,   ry:0,         label:'◈  SOUTH DISTRICT',     col:0xff9950 },
      { x:-110, z:35,   ry:Math.PI/2, label:'◈  WEST QUARTER',       col:0xffcc44 },
      { x:110,  z:35,   ry:Math.PI/2, label:'◈  EAST QUARTER',       col:0x00c8ff },
    ].forEach(({ x, z, ry, label, col }) => {
      const g = new THREE.Group(); g.position.set(x,0,z); g.rotation.y = ry;
      const W2 = 14, H = 12;
      for (const ox of [-W2, W2]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.4,H,1.4), archMat);
        p.position.set(ox, H/2, 0); g.add(p);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.8,2.2), goldMat);
        cap.position.set(ox, H+0.4, 0); g.add(cap);
        const pot = new THREE.Mesh(new THREE.SphereGeometry(0.7,8,6), goldMat);
        pot.position.set(ox, H+1.2, 0); g.add(pot);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(W2*2+1.4, 1.2, 1.4), archMat);
      lintel.position.set(0, H, 0); g.add(lintel);
      const kal = new THREE.Mesh(new THREE.SphereGeometry(0.8,8,6), goldMat);
      kal.position.set(0, H+1.5, 0); g.add(kal);

      // Label sign
      const CW = 420, CH = 56;
      const can = document.createElement('canvas');
      can.width = CW; can.height = CH;
      const ctx = can.getContext('2d');
      ctx.fillStyle = 'rgba(8,4,1,0.88)'; ctx.fillRect(0,0,CW,CH);
      ctx.strokeStyle = '#'+col.toString(16).padStart(6,'0')+'bb';
      ctx.lineWidth = 2; ctx.strokeRect(2,2,CW-4,CH-4);
      ctx.fillStyle = '#'+col.toString(16).padStart(6,'0');
      ctx.font = "bold 26px 'Barlow Condensed',sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, CW/2, CH/2);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(W2*2-1, 1.5),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(can), transparent:true }));
      sign.position.set(0, H-0.5, 0.8); g.add(sign);
      this.scene.add(g);
    });
  }

  // ── WORLD NAME ──────────────────────────────────────────────────────────────
  _buildWorldName() {
    // Place near player spawn (z=40 in city-data, so z=120 in 2.5x world? No - 
    // car spawns at z=40 from city-data, we keep building positions exact.
    // Name goes at z=90 (well behind spawn area)
    const nameZ = 95;
    const mk = (text, font, color, W, H) => {
      const can = document.createElement('canvas');
      can.width = W; can.height = H;
      const ctx = can.getContext('2d');
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle = color; ctx.font = font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, W/2, H/2);
      return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(can), transparent: true });
    };
    const s1 = new THREE.Sprite(mk('ADITYA','bold 72px Barlow Condensed,sans-serif','#fff8f0',400,100));
    s1.scale.set(28,8,1); s1.position.set(0,5,nameZ); this.scene.add(s1);
    const s2 = new THREE.Sprite(mk('SRIVASTAVA','bold 56px Barlow Condensed,sans-serif','#ffd088',450,80));
    s2.scale.set(26,5,1); s2.position.set(0,3,nameZ+1); this.scene.add(s2);
    const s3 = new THREE.Sprite(mk('// BACKEND ARCHITECT  ·  4 YEARS  ·  TRILASOFT','bold 22px Share Tech Mono,monospace','#00ddff',560,48));
    s3.scale.set(26,2.2,1); s3.position.set(0,1.2,nameZ+2); this.scene.add(s3);

    // Slab under name
    const slab = new THREE.Mesh(new THREE.BoxGeometry(28,0.3,8),
      new THREE.MeshLambertMaterial({ color: 0xf5ddc8 }));
    slab.position.set(0,0.15,nameZ+1); this.scene.add(slab);
  }
}