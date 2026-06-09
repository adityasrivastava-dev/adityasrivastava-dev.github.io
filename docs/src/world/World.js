// ── WORLD — orchestrates all scene objects. One update, clear responsibilities.
import Car from "./Car.js";
import Objects from "./Objects.js";
import Roads from "./Roads.js";
import River from "./River.js";
import Bridges from "./Bridges.js";
import Props from "./Props.js";

// World is 2.5x the original — same building positions, much more breathing room
const SCALE = 2.5;

export default class World {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;
    this.isNight = false;

    this.car = new Car(scene, events);
    this.objects = new Objects(scene, events);
    this.roads = new Roads(scene);
    this.river = new River(scene);
    this.bridges = new Bridges(scene);
    this.props = new Props(scene);
  }

  buildWorld() {
    this._buildLighting();
    this._buildSky();
    this._buildGround();
    this.roads.build();
    this.river.build();
    this.objects.buildAll(this.isNight);
    this.bridges.build(); // after objects so _toonGrad is ready
    this.props.build(this.isNight);
    this._buildCenterpiece();
    this._buildPrayerFlags();
    this._buildGatewayArches();
    this._buildWorldName();
    this._buildAtmosphere();
    this._buildHeartbeat();
  }

  // ── MAIN UPDATE — called by Application every render frame ─────────────────
  // Car physics is called by the tick loop SEPARATELY (physicsStep)
  // This just updates visuals + world ambients
  update(input, dt, now, gameStarted) {
    // Update car visuals (separate from physics)
    this.car.updateVisuals(dt, now);

    if (gameStarted) {
      this.objects.updateWindSway(now, this.car.x, this.car.z);
      this.objects.updateBuildingEntities(this.car.x, this.car.z, now, dt);
    }

    this.river.update(now);
    this.props.update(now, this.isNight);
    this._updateAtmosphere(now, dt);
    this._updateLighting(now, dt);
  }

  // Called by Application tick loop
  _updateAmbients(now, dt, carX, carZ) {
    this.car.updateVisuals(dt, now);
    this.objects.updateWindSway(now, carX, carZ);
    this.objects.updateBuildingEntities(carX, carZ, now, dt);
    this.objects.updateEntryBursts();
    this.objects.updateConfetti(dt);
    // River shimmer + props (diya flames) — these animate every frame
    this.river.update(now);
    this.props.update(now, this.isNight);
    this.objects.updateNightGlow(this.isNight, now);
    this._updateAtmosphere(now, dt);
    this._updateLighting(now, dt);
    this._updateHeartbeat(now);
    this._autoCycleUpdate(now, dt);
    // Dust trail
    if (this.car.speed > 0.04) {
      this.spawnDust(carX, carZ, this.car.speed);
    }
    // Handbrake drift burst — extra dust cloud when sliding sideways
    if (this.car._isHandbraking && Math.abs(this.car._latVel) > 0.06) {
      for (let i = 0; i < 3; i++) {
        this.spawnDust(
          carX + (Math.random() - 0.5) * 3.5,
          carZ + (Math.random() - 0.5) * 3.5,
          0.65,
        );
      }
    }
  }

  // ── DAY/NIGHT AUTO-CYCLE ────────────────────────────────────────────────────
  // Cycles through day → sunset → night → dawn automatically.
  // Pauses for 90s if the user manually changes weather via the weather button.
  _autoCycleUpdate(now, dt) {
    if (!this._cyclePhase) {
      this._cyclePhase = 'day';
      this._cycleAccum = 0;
      this._cycleStarted = true;
    }

    // Consume manual override flag: stamp now+90 as the pause deadline
    if (this._cycleManualOverride) {
      this._cycleManualOverride = false;
      this._cyclePausedUntil = now + 90;
      this._cycleAccum = 0;
    }
    if (now < (this._cyclePausedUntil || 0)) return;

    this._cycleAccum += (dt || 0.016);

    const durations = { day: 280, sunset: 55, night: 180, dawn: 45 };
    const next = { day: 'sunset', sunset: 'night', night: 'dawn', dawn: 'day' };

    if (this._cycleAccum >= durations[this._cyclePhase]) {
      this._cycleAccum = 0;
      this._cyclePhase = next[this._cyclePhase];
      this.applyWeather(this._cyclePhase, true);
    }
  }

  // ── LIGHTING ─────────────────────────────────────────────────────────────
  _buildLighting() {
    const s = this.scene;

    // Hemisphere: warm sky vs cool violet ground shadow.
    this.hemiLight = new THREE.HemisphereLight(0xffeedd, 0x6644aa, 0.55);
    s.add(this.hemiLight);

    // Sun: white-gold directional at 2.4 — was 3.8, scene was blown out.
    this.sunLight = new THREE.DirectionalLight(0xfff0cc, 2.4);
    this.sunLight.position.set(80, 75, 45);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -220;
    this.sunLight.shadow.camera.right = 220;
    this.sunLight.shadow.camera.top = 220;
    this.sunLight.shadow.camera.bottom = -220;
    this.sunLight.shadow.camera.far = 600;
    this.sunLight.shadow.bias = -0.0004;
    s.add(this.sunLight);

    // Cool blue-purple fill — essential contrast against warm sun
    this.fillLight = new THREE.DirectionalLight(0x8899ff, 0.65);
    this.fillLight.position.set(-90, 55, -40);
    s.add(this.fillLight);

    // Rim: warm gold, gentle
    this.rimLight = new THREE.DirectionalLight(0xffcc88, 0.40);
    this.rimLight.position.set(-20, 18, 140);
    s.add(this.rimLight);

    // Ground bounce: subtle
    this.bounceLight = new THREE.DirectionalLight(0xcc8855, 0.12);
    this.bounceLight.position.set(0, -1, 0);
    s.add(this.bounceLight);

    // Ambient: very low — shadows need depth
    this.ambLight = new THREE.AmbientLight(0xfff5ee, 0.18);
    s.add(this.ambLight);

    this.deitySpot = new THREE.SpotLight(
      0xfff0cc,
      2.8,
      280,
      Math.PI * 0.14,
      0.6,
      1.0,
    );
    this.deitySpot.position.set(80, 90, -20);
    this.deitySpotTarget = new THREE.Object3D();
    this.deitySpotTarget.position.set(0, 0, 0);
    s.add(this.deitySpotTarget);
    this.deitySpot.target = this.deitySpotTarget;
    s.add(this.deitySpot);

    this.originGlow = new THREE.PointLight(0xffcc88, 0, 55);
    this.originGlow.position.set(0, 2, 0);
    s.add(this.originGlow);
  }

  applyWeather(w, fromAutoCycle = false) {
    // When user manually changes weather, pause auto-cycle for 90s
    // Use a flag that _autoCycleUpdate picks up to stamp the real `now`
    if (!fromAutoCycle && this._cycleStarted) {
      this._cycleManualOverride = true;
      if (['day', 'sunset', 'night'].includes(w)) this._cyclePhase = w;
    }
    const cfgs = {
      day: {
        bg: 0xd4956a,
        fog: 0xc8845a,
        fogD: 0.0025,
        sun: 0xfff0cc,
        sunI: 2.4,
        fill: 0x8899ff,
        fillI: 0.65,
        amb: 0xfff5ee,
        ambI: 0.18,
        exp: 1.05,
        skyH: 0xd4956a,
        skyZ: 0x3355a0,
      },
      night: {
        bg: 0x0a0820,
        fog: 0x0a0820,
        fogD: 0.004,
        sun: 0x6688cc,
        sunI: 0.6,
        fill: 0x220844,
        fillI: 0.40,
        amb: 0x110822,
        ambI: 0.12,
        exp: 1.25,
        skyH: 0x0a0820,
        skyZ: 0x030614,
      },
      sunset: {
        bg: 0xff6030,
        fog: 0xff6030,
        fogD: 0.006,
        sun: 0xff4411,
        sunI: 1.9,
        fill: 0x5522bb,
        fillI: 0.75,
        amb: 0x440800,
        ambI: 0.16,
        exp: 1.08,
        skyH: 0xff6030,
        skyZ: 0x441088,
      },
      rain: {
        bg: 0x334050,
        fog: 0x334050,
        fogD: 0.012,
        sun: 0xdd9977,
        sunI: 0.6,
        fill: 0x2244aa,
        fillI: 0.75,
        amb: 0x100806,
        ambI: 0.22,
        exp: 1.1,
        skyH: 0x334050,
        skyZ: 0x1a2030,
      },
      fog: {
        bg: 0xccb09a,
        fog: 0xccb09a,
        fogD: 0.022,
        sun: 0xffddbb,
        sunI: 0.70,
        fill: 0x446688,
        fillI: 0.40,
        amb: 0x221408,
        ambI: 0.40,
        exp: 0.9,
        skyH: 0xccb09a,
        skyZ: 0x8899aa,
      },
      snow: {
        bg: 0xeedfcc,
        fog: 0xeedfcc,
        fogD: 0.007,
        sun: 0xfff0e0,
        sunI: 1.3,
        fill: 0x7799cc,
        fillI: 0.40,
        amb: 0x1a1008,
        ambI: 0.25,
        exp: 0.95,
        skyH: 0xeedfcc,
        skyZ: 0x7799cc,
      },
    };

    const cfg = cfgs[w] || cfgs.day;

    // ── STORE TARGET — _updateAtmosphere lerps toward this every frame ─────────
    // Bruno Simon's DayCycles.js interpolates between presets over time.
    // Instead of instant color snaps we store the target and let the tick
    // loop smoothly lerp fog, sky, and lights toward it over ~2.5 seconds.
    // This makes weather transitions feel like the sky is actually changing,
    // not just a palette swap.
    this._weatherTarget = cfg;

    // First call (no existing fog) — set immediately, no transition
    if (!this.scene.fog) {
      this.scene.background = new THREE.Color(cfg.bg);
      this.scene.fog = new THREE.FogExp2(cfg.fog, cfg.fogD);
      if (this.sunLight) {
        this.sunLight.color.set(cfg.sun);
        this.sunLight.intensity = cfg.sunI;
      }
      if (this.fillLight) {
        this.fillLight.color.set(cfg.fill);
        this.fillLight.intensity = cfg.fillI;
      }
      if (this.ambLight) {
        this.ambLight.color.set(cfg.amb);
        this.ambLight.intensity = cfg.ambI;
      }
    }

    // Instant non-visual state changes — grip, night mode, car lights
    this.isNight = w === "night";
    this.car.setNightMode(this.isNight);
    if (this.objects) this.objects._isNight = this.isNight;
    // Diya ceremony — sacred wave of light sweeps outward from center at nightfall
    if (w === 'night' && this.props) this.props.triggerDiyaCeremony();
    this.events.emit("weatherChange", { weather: w, isNight: this.isNight });
    const grip = {
      day: 1,
      night: 1,
      sunset: 1,
      fog: 0.72,
      rain: 0.3,
      snow: 0.12,
    };
    this.car.setWeatherGrip(grip[w] ?? 1.0);
  }

  _updateLighting(now, dt) {
    if (!this.sunLight) return;

    // ── SMOOTH WEATHER TRANSITION — lerp toward _weatherTarget every frame ────
    // From Bruno's DayCycles.js: presets are blended over time, never instant.
    // Rate t = dt * 0.55 → ~2.5s full transition at 60fps.
    // Creates the feeling that the sky is actually changing, not palette-swapped.
    if (this._weatherTarget) {
      const tgt = this._weatherTarget;
      const t = Math.min(1, (dt || 0.016) * 0.55);

      // Fog color + density
      if (this.scene.fog) {
        this.scene.fog.color.lerp(new THREE.Color(tgt.fog), t);
        this.scene.fog.density += (tgt.fogD - this.scene.fog.density) * t;
      }

      // Sky background
      if (this.scene.background?.isColor) {
        this.scene.background.lerp(new THREE.Color(tgt.bg), t);
      }

      // Sun — color + intensity
      this.sunLight.color.lerp(new THREE.Color(tgt.sun), t);
      this.sunLight.intensity += (tgt.sunI - this.sunLight.intensity) * t;

      // Fill light
      if (this.fillLight) {
        this.fillLight.color.lerp(new THREE.Color(tgt.fill), t);
        this.fillLight.intensity += (tgt.fillI - this.fillLight.intensity) * t;
      }

      // Ambient
      if (this.ambLight) {
        this.ambLight.color.lerp(new THREE.Color(tgt.amb), t);
        this.ambLight.intensity += (tgt.ambI - this.ambLight.intensity) * t;
      }

      // Rim (derived from sun)
      if (this.rimLight) {
        this.rimLight.intensity +=
          (tgt.sunI * 0.14 - this.rimLight.intensity) * t;
      }

      // Bounce
      if (this.bounceLight) {
        const tgtB = this.isNight ? 0 : 0.45;
        this.bounceLight.intensity += (tgtB - this.bounceLight.intensity) * t;
      }

      // Sky sphere gradient
      if (this._skyMesh && this._weatherTarget.skyH) {
        const un = this._skyMesh.material.uniforms;
        un.uHorizon.value.lerp(new THREE.Color(this._weatherTarget.skyH), t);
        un.uZenith.value.lerp(new THREE.Color(this._weatherTarget.skyZ), t);
      }
    }

    // Sun color breathes — subtly alive, not static
    const b = Math.sin(now * 0.08 * Math.PI * 2);
    this.sunLight.color.lerp(
      new THREE.Color(1 + b * 0.04, 0.87 + b * 0.03, 0.53 - b * 0.03),
      0.05,
    );

    // ── DEITY SPOTLIGHT — hunts between buildings, pauses, moves on ──────────
    // Orbit base + occasional "lock" onto a temple for 1.8s. Much more alive
    // than pure orbit — feels like there's an intelligence above the city.
    if (this.deitySpot) {
      if (!this._deityHunt) {
        this._deityHunt = { lockUntil: 0, tx: 80, tz: -20 };
      }
      const dh = this._deityHunt;
      if (now > dh.lockUntil) {
        // Pick a new random building to lock onto (or return to orbit)
        const buildings = window.CITY_DATA?.buildings || [];
        if (buildings.length && Math.random() < 0.3) {
          const b2 = buildings[Math.floor(Math.random() * buildings.length)];
          dh.tx = b2.pos[0];
          dh.tz = b2.pos[1];
          dh.lockUntil = now + 1.6 + Math.random() * 1.2;
        } else {
          // Resume slow orbit
          const t = now * ((Math.PI * 2) / 80);
          dh.tx = Math.sin(t) * 100;
          dh.tz = Math.cos(t) * 100;
        }
      }
      // Smooth position toward target
      this.deitySpot.position.x += (dh.tx - this.deitySpot.position.x) * 0.018;
      this.deitySpot.position.z += (dh.tz - this.deitySpot.position.z) * 0.018;
      this.deitySpot.position.y = 90;

      // Pulse intensity — breathing divine light
      this.deitySpot.intensity +=
        ((this.isNight ? 3.5 : 2.2) * (1 + Math.sin(now * 0.4) * 0.12) -
          this.deitySpot.intensity) *
        0.03;
    }

    // Island center ring — rotates and pulses opacity (alive centerpiece)
    if (this._islandRing) {
      this._islandRing.rotation.z = now * 0.18;
      this._islandRing.material.opacity = 0.55 + Math.sin(now * 1.4) * 0.22;
    }
    if (this._islandRingOuter) {
      this._islandRingOuter.rotation.z = -now * 0.09;
      this._islandRingOuter.material.opacity =
        0.25 + Math.sin(now * 0.8 + 1) * 0.12;
    }

    // Origin glow fades in after intro then breathes — the "heart of the city"
    if (this.originGlow && this._originGlowTarget !== undefined) {
      this.originGlow.intensity +=
        (this._originGlowTarget - this.originGlow.intensity) * 0.025;
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

  // ── SKY SPHERE — inverted sphere with GLSL gradient (horizon → zenith) ────
  _buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHorizon: { value: new THREE.Color(0xd4956a) },
        uZenith:  { value: new THREE.Color(0x3355a0) },
      },
      vertexShader: `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        varying float vY;
        void main() {
          float t = clamp(vY, 0.0, 1.0);
          gl_FragColor = vec4(mix(uHorizon, uZenith, pow(t, 0.55)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(750, 24, 14), mat);
    sky.renderOrder = -1;
    this._skyMesh = sky;
    this.scene.add(sky);
    this._buildStarField();
  }

  // ── STAR FIELD + MOON — appear on night transition ────────────────────────
  _buildStarField() {
    const s = this.scene;

    // 1200 stars — distributed across upper hemisphere inside sky sphere
    const SC = 1200;
    const sPos = new Float32Array(SC * 3);
    for (let i = 0; i < SC; i++) {
      const theta = Math.random() * Math.PI * 2;
      // Bias toward upper sky — phi from 0 (zenith) to ~140° (below horizon)
      const phi = Math.acos(1 - Math.random() * 1.18);
      const r = 680 + Math.random() * 14;
      sPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      sPos[i * 3 + 1] = r * Math.cos(phi) - 20;
      sPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    this._starField = new THREE.Points(starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.2,          // pixels (sizeAttenuation:false)
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: false,
      }),
    );
    s.add(this._starField);

    // Milky Way band — 600 dim blue-white points in a tilted arc
    const MW = 600;
    const mPos = new Float32Array(MW * 3);
    for (let i = 0; i < MW; i++) {
      const t = (i / MW) * Math.PI * 2;
      const bandCtr = Math.PI * 0.38 + Math.sin(t * 2.5) * 0.1;
      const spread  = (Math.random() - 0.5) * 0.28;
      const phi   = bandCtr + spread;
      const theta = t + (Math.random() - 0.5) * 0.5;
      const r = 686 + Math.random() * 8;
      mPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      mPos[i * 3 + 1] = r * Math.cos(phi);
      mPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const mwGeo = new THREE.BufferGeometry();
    mwGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    this._milkyWay = new THREE.Points(mwGeo,
      new THREE.PointsMaterial({
        color: 0xaabbff,
        size: 1.4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: false,
      }),
    );
    s.add(this._milkyWay);

    // Moon — large cream sphere, positioned NW at medium height
    this._moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(13, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xfff8e8,
        transparent: true,
        opacity: 0,
        fog: false,
      }),
    );
    this._moonMesh.position.set(-260, 115, -190);
    s.add(this._moonMesh);

    // Moon halo — soft additive ring around moon
    const haloGeo = new THREE.RingGeometry(15, 26, 32);
    this._moonHalo = new THREE.Mesh(haloGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff0cc,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this._moonHalo.position.copy(this._moonMesh.position);
    this._moonHalo.lookAt(0, 40, 0);
    s.add(this._moonHalo);
  }

  // ── GROUND (large flat plane + sandy pavement) ─────────────────────────────
  _buildGround() {
    const s = this.scene;

    // Large ground — warm terracotta earth
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(1200, 0.4, 1200),
      new THREE.MeshLambertMaterial({ color: 0x7a4828 }),
    );
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    s.add(ground);

    // Water — muted teal (vivid 0x22bbdd was too bright under ACES)
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshLambertMaterial({ color: 0x1e6888 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    s.add(water);

    // Water shimmer (MeshBasicMaterial is emissive — kept dim so it doesn't bloom)
    const waterTop = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshBasicMaterial({
        color: 0x2288aa,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    waterTop.rotation.x = -Math.PI / 2;
    waterTop.position.y = -0.45;
    s.add(waterTop);

    // Ground tile grid — plaza paving, expanded for larger city
    const tileMat = new THREE.MeshLambertMaterial({ color: 0x5e3818 });
    const tileSpacing = 10;
    for (let tx = -28; tx < 28; tx++) {
      for (let tz = -26; tz < 26; tz++) {
        if ((tx + tz) % 2 !== 0) continue;
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(tileSpacing - 0.15, 0.02, tileSpacing - 0.15),
          tileMat,
        );
        tile.position.set(tx * tileSpacing + 5, 0.01, tz * tileSpacing + 5);
        s.add(tile);
      }
    }

    // Paved court zones near major intersections — lighter to contrast with roads
    const paveMat = new THREE.MeshLambertMaterial({ color: 0x8a5030 });
    [
      [-55, 0, 60, 60],
      [55, 0, 60, 60],
      [-55, -50, 60, 50],
      [55, -50, 60, 50],
      [110, 25, 50, 60],
      [-110, 25, 50, 60],
      [-110, -35, 50, 40],
      [110, -35, 50, 40],
    ].forEach(([x, z, w, d]) => {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), paveMat);
      blk.position.set(x, 0.14, z);
      blk.receiveShadow = true;
      s.add(blk);
    });

    // Beach/sand border strips — the transition between orange ground and cyan water
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xaa9966 });
    for (const [x, z, w, d] of [
      [0, -220, 600, 18],
      [0, 220, 600, 18],
      [-220, 0, 18, 440],
      [220, 0, 18, 440],
    ]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), sandMat);
      strip.position.set(x, -0.35, z);
      s.add(strip);
    }
  }

  // ── DHARMA CHAKRA — sacred 8-spoked wheel at the city's heart ────────────────
  // The Ashoka Chakra made physical: each spoke colored for its Vastu direction.
  // Rotates slowly so the city always has one moving, living centerpiece.
  _buildCenterpiece() {
    const s = this.scene;
    const tg = window._toonGrad;

    // Spoke colors by Vastu direction (N at angle 0, clockwise)
    const spokeColors = [
      0xeeddcc, // N  — Kubera, prosperity, cream
      0x44bb66, // NE — Ishanya, knowledge, emerald
      0xffcc33, // E  — Surya, beginnings, gold
      0xcc4422, // SE — Agni, craft/fire, red
      0xaa7744, // S  — Yama, completion, earth
      0x886644, // SW — Nirrti, legacy, dark brown
      0x4488cc, // W  — Varuna, water, blue
      0x44aaaa, // NW — Vayu, speed, teal
    ];

    // White stone plaza — raised above ground, 22-unit radius
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(22, 24, 0.65, 20),
      new THREE.MeshToonMaterial({ color: 0xddccbb, gradientMap: tg }),
    );
    plaza.position.y = 0.32;
    s.add(plaza);

    // Inner sacred circle
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 16.5, 0.35, 20),
      new THREE.MeshToonMaterial({ color: 0xeedfcc, gradientMap: tg }),
    );
    inner.position.y = 0.82;
    s.add(inner);

    // Chakra group — this rotates slowly each frame
    this._chakraGroup = new THREE.Group();
    s.add(this._chakraGroup);

    // Multi-tiered hub at center (octagonal lotus plinth)
    for (const [r, h, y, col] of [
      [6.0, 0.65, 1.1, 0xddccbb],
      [4.5, 0.55, 1.75, 0xeedfcc],
      [3.0, 0.45, 2.3, 0xf5ead8],
      [1.8, 0.9, 2.95, 0xfff5e8],
    ]) {
      const tier = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.82, r, h, 8),
        new THREE.MeshToonMaterial({ color: col, gradientMap: tg }),
      );
      tier.position.y = y;
      this._chakraGroup.add(tier);
    }

    // 8 spokes
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const col = spokeColors[i];
      const spokeLen = 11;
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.25, spokeLen),
        new THREE.MeshToonMaterial({ color: col, gradientMap: tg }),
      );
      spoke.rotation.y = angle;
      spoke.position.set(
        Math.sin(angle) * (spokeLen / 2 + 2.2),
        1.25,
        Math.cos(angle) * (spokeLen / 2 + 2.2),
      );
      this._chakraGroup.add(spoke);

      // Spoke tip gem — glowing orb in the spoke's Vastu color
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6, 0),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      gem.position.set(Math.sin(angle) * 13.8, 1.7, Math.cos(angle) * 13.8);
      this._chakraGroup.add(gem);
    }

    // Outer rim torus
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(14.8, 0.42, 6, 64),
      new THREE.MeshToonMaterial({ color: 0xddccaa, gradientMap: tg }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.25;
    this._chakraGroup.add(rim);

    // Central dharma beacon
    this._chakraBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffeeaa,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this._chakraBeacon.position.y = 4.1;
    this._chakraGroup.add(this._chakraBeacon);

    // Beacon light
    this._chakraBeaconLight = new THREE.PointLight(0xffddaa, this.isNight ? 3.2 : 1.2, 38);
    this._chakraBeaconLight.position.y = 4.4;
    this._chakraGroup.add(this._chakraBeaconLight);

    // 8 lamp posts around plaza perimeter (static — outside chakra group)
    const poleMat = new THREE.MeshToonMaterial({ color: 0xaa9977, gradientMap: tg });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pr = 20;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.8, 0.28), poleMat);
      pole.position.set(Math.sin(ang) * pr, 2.9, Math.cos(ang) * pr);
      s.add(pole);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffee99 }),
      );
      head.position.set(Math.sin(ang) * pr, 6.0, Math.cos(ang) * pr);
      s.add(head);
      const pl = new THREE.PointLight(0xffee99, this.isNight ? 2.0 : 0.35, 16);
      pl.position.set(Math.sin(ang) * pr, 6.2, Math.cos(ang) * pr);
      s.add(pl);
    }

    // Note: _islandRing and _islandRingOuter are not set — the animation blocks
    // in _updateLighting guard with if(this._islandRing) so they skip cleanly.
  }

  // ── ATMOSPHERE — petals, fireflies, car dust trail ─────────────────────────
  _buildAtmosphere() {
    // ── BLOSSOM PETALS (existing, unchanged) ─────────────────────────────────
    const cnt = 500;
    const pos = new Float32Array(cnt * 3),
      col = new Float32Array(cnt * 3),
      vel = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 220;
      pos[i * 3 + 1] = Math.random() * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 220;
      vel[i * 3] = (Math.random() - 0.5) * 0.012;
      vel[i * 3 + 1] = -0.006 - Math.random() * 0.008;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.012;
      const t = Math.random();
      if (t < 0.4) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.55;
        col[i * 3 + 2] = 0.68;
      } else if (t < 0.65) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.78;
        col[i * 3 + 2] = 0.35;
      } else {
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.55;
      }
    }
    const petalGeo = new THREE.BufferGeometry();
    petalGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    petalGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this._petals = new THREE.Points(
      petalGeo,
      new THREE.PointsMaterial({
        size: 0.28,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
      }),
    );
    this._petals.userData.vel = vel;
    this.scene.add(this._petals);

    // ── FIREFLIES — tiny bright motes clustered near temples at night ─────────
    // They drift slowly with sine noise, creating the "living world" feel.
    // Gold-cyan colour range, flicker via opacity in update.
    const FC = 120;
    const fPos = new Float32Array(FC * 3),
      fCol = new Float32Array(FC * 3);
    const fPhase = new Float32Array(FC); // per-firefly flicker phase offset
    const fireTempleAreas = [
      [72, -35],   // surya-dwara
      [45, 56],    // vishwakarma
      [-88, -35],  // brahma-kund
      [-64, 56],   // lakshmi-prasad
      [0, 88],     // pura-stambha
      [-45, -61],  // maya-sabha
      [0, -88],    // jyotish-vedha
      [-88, 13],   // vayu-rath
      [88, -61],   // akasha-mandapa
      [88, 13],    // setu-nagara
      [-35, -99],  // saraswati-vihar
      [35, -99],   // gurukul-ashram
      [131, -35],  // vaishya-griha
      [131, 13],   // agni-vedha
      [45, -77],   // darpana-shala
      [-131, -35], // vidya-ashram
      [0, 115],    // sutra-dhara
    ];
    for (let i = 0; i < FC; i++) {
      const area = fireTempleAreas[i % fireTempleAreas.length];
      fPos[i * 3] = area[0] + (Math.random() - 0.5) * 12;
      fPos[i * 3 + 1] = 1.5 + Math.random() * 6;
      fPos[i * 3 + 2] = area[1] + (Math.random() - 0.5) * 12;
      fPhase[i] = Math.random() * Math.PI * 2;
      const warm = Math.random() > 0.5;
      fCol[i * 3] = warm ? 1 : 0.5;
      fCol[i * 3 + 1] = warm ? 0.9 : 0.9;
      fCol[i * 3 + 2] = warm ? 0.3 : 1.0;
    }
    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
    fireGeo.setAttribute("color", new THREE.BufferAttribute(fCol, 3));
    this._fireflies = new THREE.Points(
      fireGeo,
      new THREE.PointsMaterial({
        size: 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 0,
      }),
    );
    this._fireflies.userData.phase = fPhase;
    this.scene.add(this._fireflies);

    // ── WILLOW LEAF FALL — pale green leaves drifting near river banks ─────────
    // Clusters at 7 points along main river and tributary where willows grow.
    // Different from cherry petals: smaller, greener, tight clustering.
    const LC = 140;
    const lPos = new Float32Array(LC * 3);
    const lVel = new Float32Array(LC * 3);
    const lCol = new Float32Array(LC * 3);
    const leafClusters = [
      [-130, -6], [-65, -4], [0, -10], [65, -5], [130, -12],
      [-22, 50], [-15, 80],
    ];
    const leafCols = [[0.53, 0.73, 0.23], [0.60, 0.80, 0.27], [0.87, 0.80, 0.33]];
    for (let i = 0; i < LC; i++) {
      const cl = leafClusters[i % leafClusters.length];
      lPos[i * 3]     = cl[0] + (Math.random() - 0.5) * 18;
      lPos[i * 3 + 1] = 1 + Math.random() * 9;
      lPos[i * 3 + 2] = cl[1] + (Math.random() - 0.5) * 12;
      lVel[i * 3]     = (Math.random() - 0.5) * 0.010;
      lVel[i * 3 + 1] = -0.004 - Math.random() * 0.006;
      lVel[i * 3 + 2] = (Math.random() - 0.5) * 0.010;
      const lc = leafCols[Math.floor(Math.random() * 3)];
      lCol[i * 3] = lc[0]; lCol[i * 3 + 1] = lc[1]; lCol[i * 3 + 2] = lc[2];
    }
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    leafGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
    this._leafParticles = new THREE.Points(leafGeo,
      new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0.65 }));
    this._leafParticles.userData.vel = lVel;
    this._leafParticles.userData.clusters = leafClusters;
    this.scene.add(this._leafParticles);

    // ── CAR DUST TRAIL — small sand/dirt particles spawned behind wheels ──────
    // Pre-allocated pool of 200 particles. Active ones have life > 0.
    const DUST_N = 200;
    const dPos = new Float32Array(DUST_N * 3);
    const dLife = new Float32Array(DUST_N); // 0 = dead
    const dVel = new Float32Array(DUST_N * 3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    this._dustTrail = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xddaa77,
        size: 0.35,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      }),
    );
    this._dustTrail.userData = { life: dLife, vel: dVel, head: 0, DUST_N };
    this.scene.add(this._dustTrail);
  }

  _updateAtmosphere(now) {
    // ── PRAYER FLAGS — wave in the wind ──────────────────────────────────────
    this._updatePrayerFlags(now);

    // ── PETALS ────────────────────────────────────────────────────────────────
    if (this._petals) {
      const pos = this._petals.geometry.attributes.position.array;
      const vel = this._petals.userData.vel;
      for (let i = 0, n = pos.length / 3; i < n; i++) {
        pos[i * 3] += vel[i * 3] + Math.sin(now * 0.7 + i * 0.4) * 0.003;
        pos[i * 3 + 1] += vel[i * 3 + 1];
        pos[i * 3 + 2] += vel[i * 3 + 2];
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3] = (Math.random() - 0.5) * 220;
          pos[i * 3 + 1] = 20 + Math.random() * 5;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 220;
        }
      }
      this._petals.geometry.attributes.position.needsUpdate = true;
    }

    // ── WILLOW LEAVES — drift down, respawn from top ─────────────────────────
    if (this._leafParticles) {
      const pos = this._leafParticles.geometry.attributes.position.array;
      const vel = this._leafParticles.userData.vel;
      const clusters = this._leafParticles.userData.clusters;
      for (let i = 0, n = pos.length / 3; i < n; i++) {
        pos[i * 3]     += vel[i * 3]     + Math.sin(now * 0.5 + i * 0.9) * 0.004;
        pos[i * 3 + 1] += vel[i * 3 + 1];
        pos[i * 3 + 2] += vel[i * 3 + 2] + Math.cos(now * 0.4 + i * 0.7) * 0.003;
        if (pos[i * 3 + 1] < 0) {
          const cl = clusters[i % clusters.length];
          pos[i * 3]     = cl[0] + (Math.random() - 0.5) * 18;
          pos[i * 3 + 1] = 8 + Math.random() * 4;
          pos[i * 3 + 2] = cl[1] + (Math.random() - 0.5) * 12;
        }
      }
      this._leafParticles.geometry.attributes.position.needsUpdate = true;
    }

    // ── FIREFLIES — drift + flicker ───────────────────────────────────────────
    // Previously opacity 0 in daylight — invisible all day.
    // Now they're subtle golden motes during the day (0.18 opacity) and bright
    // fireflies at night (0.82). The world needs constant visible particles
    // to feel alive even in full daylight — like dust motes in sunbeams.
    if (this._fireflies) {
      const pos = this._fireflies.geometry.attributes.position.array;
      const phase = this._fireflies.userData.phase;
      const n = pos.length / 3;
      // Daytime: subtle gold motes. Night: bright fireflies. Always visible.
      const targetOp = this.isNight ? 0.82 : 0.22;
      this._fireflies.material.opacity +=
        (targetOp - this._fireflies.material.opacity) * 0.02;

      for (let i = 0; i < n; i++) {
        // Amplified drift — visible from camera height
        pos[i * 3] += Math.sin(now * 0.28 + phase[i]) * 0.025;
        pos[i * 3 + 1] += Math.sin(now * 0.41 + phase[i] * 1.3) * 0.012;
        pos[i * 3 + 2] += Math.cos(now * 0.23 + phase[i] * 0.7) * 0.025;
        if (pos[i * 3 + 1] > 9) pos[i * 3 + 1] = 1.5;
        if (pos[i * 3 + 1] < 0.5) pos[i * 3 + 1] = 0.5;
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
        pos[i * 3] += vel[i * 3];
        pos[i * 3 + 1] += 0.008 + vel[i * 3 + 1]; // drift up
        pos[i * 3 + 2] += vel[i * 3 + 2];
        maxOp = Math.max(maxOp, life[i]);
      }
      this._dustTrail.geometry.attributes.position.needsUpdate = true;
      this._dustTrail.material.opacity = Math.min(0.45, maxOp * 0.45);
    }

    // ── STARS + MOON — fade in at night ──────────────────────────────────────
    if (this._starField) {
      const tStar = this.isNight ? 0.88 : 0;
      const tMW   = this.isNight ? 0.32 : 0;
      const tMoon = this.isNight ? 1.0  : 0;
      this._starField.material.opacity += (tStar - this._starField.material.opacity) * 0.014;
      if (this._milkyWay)
        this._milkyWay.material.opacity += (tMW - this._milkyWay.material.opacity) * 0.014;
      if (this._moonMesh) {
        this._moonMesh.material.opacity += (tMoon - this._moonMesh.material.opacity) * 0.014;
        if (this._moonHalo) {
          this._moonHalo.material.opacity =
            this._moonMesh.material.opacity * (0.14 + Math.sin(now * 0.28) * 0.04);
        }
      }
    }

    // ── DHARMA CHAKRA — slow rotation + beacon breathing ─────────────────────
    if (this._chakraGroup) {
      this._chakraGroup.rotation.y = now * 0.038;
      if (this._chakraBeacon) {
        const breathe = 0.78 + Math.sin(now * 1.15) * 0.14;
        this._chakraBeacon.material.opacity = breathe;
        if (this._chakraBeaconLight) {
          const tI = (this.isNight ? 3.8 : 1.2) * breathe;
          this._chakraBeaconLight.intensity += (tI - this._chakraBeaconLight.intensity) * 0.04;
        }
      }
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
      pos[i * 3] = x + (Math.random() - 0.5) * 2.5;
      pos[i * 3 + 1] = 0.3 + Math.random() * 0.3;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 2.5;
      life[i] = 0.7 + Math.random() * 0.3;
      vel[i * 3] = (Math.random() - 0.5) * 0.025;
      vel[i * 3 + 1] = Math.random() * 0.008;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.025;
    }
  }

  // ── WORLD HEARTBEAT ──────────────────────────────────────────────────────────
  // Every 4 seconds a pulse ring expands from the city's origin (0, 0, 0).
  // This single ring IS the city's heartbeat — it makes the world feel alive
  // in a way no amount of static props can achieve.
  //
  // The ring lives in a pool of 3 so we can have multiple rings in flight
  // at different expansion stages (like rings in water after a stone drop).
  //
  // The deity spotlight "hunting" system is handled in _updateLighting above.
  _buildHeartbeat() {
    this._heartbeatRings = [];
    this._heartbeatNext = 0;
    this._heartbeatPhase = 0; // sub-phase for staggered rings

    // Pre-allocate 3 ring meshes — reuse by resetting them
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.8, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffcc66,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.18;
      ring.userData.life = 0; // 0 = inactive
      ring.userData.maxLife = 1;
      ring.userData.speed = 1;
      this.scene.add(ring);
      this._heartbeatRings.push(ring);
    }
  }

  _updateHeartbeat(now) {
    if (!this._heartbeatRings) return;

    // Spawn a new pulse every 4 seconds. Three rings stagger with 0.22s gaps
    // to create a "thump" feel rather than a single thin ring.
    if (now >= this._heartbeatNext) {
      this._heartbeatNext = now + 4.0;
      this._heartbeatPhase = 0;
    }
    // Stagger: emit ring 0 at t=0, ring 1 at +0.22s, ring 2 at +0.44s
    if (this._heartbeatPhase < 3) {
      const nextEmit = this._heartbeatNext - 4.0 + this._heartbeatPhase * 0.22;
      if (now >= nextEmit) {
        const ring = this._heartbeatRings[this._heartbeatPhase];
        ring.userData.life = 1.0;
        ring.userData.speed = 0.8 + this._heartbeatPhase * 0.15;
        ring.scale.set(1, 1, 1);
        ring.material.opacity = this.isNight ? 0.35 : 0.18;
        this._heartbeatPhase++;
      }
    }

    // Animate active rings: expand outward, fade to zero
    for (const ring of this._heartbeatRings) {
      if (ring.userData.life <= 0) continue;
      ring.userData.life -= 0.004 * ring.userData.speed;
      // Max radius ~220 units (full world width) over 4s
      const t = 1 - ring.userData.life;
      const radius = t * 220;
      ring.scale.set(radius, 1, radius);
      // Opacity: strong at birth, fades to 0 as it reaches world edge
      ring.material.opacity = ring.userData.life * (this.isNight ? 0.22 : 0.1);
      if (ring.userData.life <= 0) ring.material.opacity = 0;
    }
  }

  // ── PRAYER FLAGS ────────────────────────────────────────────────────────────
  _buildPrayerFlags() {
    const colors = [0xff3333, 0xff9900, 0xffdd00, 0x33cc44, 0x3388ff, 0xcc44cc];
    this._prayerFlags = []; // store refs for animation

    const string = (x1, y, z1, x2, z2, n) => {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const f = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.55, 0.08),
          new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }),
        );
        f.position.set(
          x1 + (x2 - x1) * t,
          y - Math.sin(t * Math.PI) * 1.2,
          z1 + (z2 - z1) * t,
        );
        // Store base position + unique phase for each flag
        f.userData.baseY = f.position.y;
        f.userData.baseRotX = 0;
        f.userData.phase = t * Math.PI * 4 + Math.random() * Math.PI;
        f.userData.speed = 1.2 + Math.random() * 0.8;
        this.scene.add(f);
        this._prayerFlags.push(f);
      }
    };
    string(-55, 14, -10, 55, -10, 18);
    string(-55, 14, 5, 55, 5, 18);
    string(-35, 14, 80, 35, 80, 12);
    string(-45, 14, -138, 45, -138, 14);
  }

  _updatePrayerFlags(now) {
    if (!this._prayerFlags) return;
    this._prayerFlags.forEach((f) => {
      const ph = now * f.userData.speed + f.userData.phase;
      // Flap around X axis — billowing in wind
      f.rotation.x = Math.sin(ph * 2.2) * 0.22 + Math.sin(ph) * 0.12;
      // Slight Y bob — string sags more when flag is full
      f.position.y = f.userData.baseY + Math.sin(ph * 1.5) * 0.06;
    });
  }

  // ── GATEWAY ARCHES ──────────────────────────────────────────────────────────
  _buildGatewayArches() {
    const archMat = new THREE.MeshToonMaterial({
      color: 0xf0d8a0,
      gradientMap: window._toonGrad,
    });
    const goldMat = new THREE.MeshToonMaterial({
      color: 0xffcc44,
      gradientMap: window._toonGrad,
    });

    // Positions scaled 2.5x from original
    [
      { x: 0, z: -10, ry: 0, label: "◈  HERO DISTRICT", col: 0x00ddff },
      { x: 0, z: -90, ry: 0, label: "◈  MODERNIZATION ZONE", col: 0xffcc44 },
      { x: 0, z: -140, ry: 0, label: "◈  EDUCATION DISTRICT", col: 0xa78bfa },
      { x: 0, z: 90, ry: 0, label: "◈  SOUTH DISTRICT", col: 0xff9950 },
      {
        x: -110,
        z: 35,
        ry: Math.PI / 2,
        label: "◈  WEST QUARTER",
        col: 0xffcc44,
      },
      {
        x: 110,
        z: 35,
        ry: Math.PI / 2,
        label: "◈  EAST QUARTER",
        col: 0x00c8ff,
      },
    ].forEach(({ x, z, ry, label, col }) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const W2 = 14,
        H = 12;
      for (const ox of [-W2, W2]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, H, 1.4), archMat);
        p.position.set(ox, H / 2, 0);
        g.add(p);
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 0.8, 2.2),
          goldMat,
        );
        cap.position.set(ox, H + 0.4, 0);
        g.add(cap);
        const pot = new THREE.Mesh(
          new THREE.SphereGeometry(0.7, 8, 6),
          goldMat,
        );
        pot.position.set(ox, H + 1.2, 0);
        g.add(pot);
      }
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(W2 * 2 + 1.4, 1.2, 1.4),
        archMat,
      );
      lintel.position.set(0, H, 0);
      g.add(lintel);
      const kal = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), goldMat);
      kal.position.set(0, H + 1.5, 0);
      g.add(kal);

      // Label sign
      const CW = 420,
        CH = 56;
      const can = document.createElement("canvas");
      can.width = CW;
      can.height = CH;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "rgba(8,4,1,0.88)";
      ctx.fillRect(0, 0, CW, CH);
      ctx.strokeStyle = "#" + col.toString(16).padStart(6, "0") + "bb";
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, CW - 4, CH - 4);
      ctx.fillStyle = "#" + col.toString(16).padStart(6, "0");
      ctx.font = "bold 26px 'Barlow Condensed',sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, CW / 2, CH / 2);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(W2 * 2 - 1, 1.5),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(can),
          transparent: true,
        }),
      );
      sign.position.set(0, H - 0.5, 0.8);
      g.add(sign);
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
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, H / 2);
      return new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(can),
        transparent: true,
      });
    };
    const s1 = new THREE.Sprite(
      mk(
        "ADITYA",
        "bold 72px Barlow Condensed,sans-serif",
        "#fff8f0",
        400,
        100,
      ),
    );
    s1.scale.set(28, 8, 1);
    s1.position.set(0, 5, nameZ);
    this.scene.add(s1);
    const s2 = new THREE.Sprite(
      mk(
        "SRIVASTAVA",
        "bold 56px Barlow Condensed,sans-serif",
        "#ffd088",
        450,
        80,
      ),
    );
    s2.scale.set(26, 5, 1);
    s2.position.set(0, 3, nameZ + 1);
    this.scene.add(s2);
    const s3 = new THREE.Sprite(
      mk(
        "// BACKEND ARCHITECT  ·  4 YEARS  ·  TRILASOFT",
        "bold 22px Share Tech Mono,monospace",
        "#00ddff",
        560,
        48,
      ),
    );
    s3.scale.set(26, 2.2, 1);
    s3.position.set(0, 1.2, nameZ + 2);
    this.scene.add(s3);

    // Slab under name
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.3, 8),
      new THREE.MeshLambertMaterial({ color: 0xf5ddc8 }),
    );
    slab.position.set(0, 0.15, nameZ + 1);
    this.scene.add(slab);
  }
}
