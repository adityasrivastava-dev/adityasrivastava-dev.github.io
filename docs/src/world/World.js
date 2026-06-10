// ── WORLD — orchestrates all scene objects. One update, clear responsibilities.
import Car from "./Car.js";
import Objects from "./Objects.js";
import Roads from "./Roads.js";
import River from "./River.js";
import Bridges from "./Bridges.js";
import Props from "./Props.js";
import CM from '../systems/CollisionManager.js';

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
    // Register stambha — 32-unit pillar occupies the city axis
    CM.register({ type: 'circle', x: 0, z: 0, r: 4.0, id: 'stambha' });
    this._buildPrayerFlags();
    this._buildGatewayArches();
    this._buildWorldName();
    this._buildHiddenAreas();
    this._buildCareerPath();
    this._buildStackTraceObelisk();
    this._buildNPCs();
    this._buildWanderingMonk();
    this._buildAtmosphere();
    this._buildHeartbeat();
    this._buildClouds();
    this._buildGodRays();
    this._buildDistrictZones();
    this._buildBirds();
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
    this.updateHiddenAreas(this.isNight, now);
    this.updateNPCs(dt);
    this.updateWanderingMonk(dt);
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
      this._cyclePhase = "day";
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

    this._cycleAccum += dt || 0.016;

    const durations = { day: 280, sunset: 55, night: 180, dawn: 45 };
    const next = { day: "sunset", sunset: "night", night: "dawn", dawn: "day" };

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
    this.rimLight = new THREE.DirectionalLight(0xffcc88, 0.4);
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
      if (["day", "sunset", "night"].includes(w)) this._cyclePhase = w;
    }

    // Item 22: golden flash on day→sunset transition
    if (w === "sunset") {
      const el = document.createElement("div");
      el.className = "sunset-flash";
      document.body.appendChild(el);
      el.addEventListener("animationend", () => el.remove());
    }
    const cfgs = {
      day: {
        bg: 0xc8b898,
        fog: 0xbca888,
        fogD: 0.00035,
        sun: 0xfff0cc,
        sunI: 2.4,
        fill: 0x8899ff,
        fillI: 0.65,
        amb: 0xfff5ee,
        ambI: 0.18,
        exp: 1.05,
        skyLow: 0xf0a060,
        skyMid: 0x8877cc,
        skyZen: 0x2244aa,
      },
      night: {
        bg: 0x0a0820,
        fog: 0x0a0820,
        fogD: 0.001,
        sun: 0x6688cc,
        sunI: 0.6,
        fill: 0x220844,
        fillI: 0.4,
        amb: 0x110822,
        ambI: 0.12,
        exp: 1.25,
        skyLow: 0x0a0820,
        skyMid: 0x050418,
        skyZen: 0x020210,
      },
      sunset: {
        bg: 0xff6030,
        fog: 0xff6030,
        fogD: 0.0015,
        sun: 0xff4411,
        sunI: 1.9,
        fill: 0x5522bb,
        fillI: 0.75,
        amb: 0x440800,
        ambI: 0.16,
        exp: 1.08,
        skyLow: 0xff7030,
        skyMid: 0xcc3366,
        skyZen: 0x441088,
      },
      rain: {
        bg: 0x334050,
        fog: 0x334050,
        fogD: 0.003,
        sun: 0xdd9977,
        sunI: 0.6,
        fill: 0x2244aa,
        fillI: 0.75,
        amb: 0x100806,
        ambI: 0.22,
        exp: 1.1,
        skyLow: 0x334050,
        skyMid: 0x283040,
        skyZen: 0x1a2030,
        _isRain: true,
      },
      fog: {
        bg: 0xccb09a,
        fog: 0xccb09a,
        fogD: 0.006,
        sun: 0xffddbb,
        sunI: 0.7,
        fill: 0x446688,
        fillI: 0.4,
        amb: 0x221408,
        ambI: 0.4,
        exp: 0.9,
        skyLow: 0xccb09a,
        skyMid: 0x9988aa,
        skyZen: 0x7788aa,
      },
      snow: {
        bg: 0xeedfcc,
        fog: 0xeedfcc,
        fogD: 0.0018,
        sun: 0xfff0e0,
        sunI: 1.3,
        fill: 0x7799cc,
        fillI: 0.4,
        amb: 0x1a1008,
        ambI: 0.25,
        exp: 0.95,
        skyLow: 0xeedfcc,
        skyMid: 0x99bbcc,
        skyZen: 0x7799cc,
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
    if (w === "night" && this.props) this.props.triggerDiyaCeremony();
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

      // Sky sphere 3-stop gradient
      if (this._skyMesh && this._weatherTarget.skyLow) {
        const un = this._skyMesh.material.uniforms;
        un.uLow.value.lerp(new THREE.Color(this._weatherTarget.skyLow), t);
        un.uMid.value.lerp(new THREE.Color(this._weatherTarget.skyMid), t);
        un.uZenith.value.lerp(new THREE.Color(this._weatherTarget.skyZen), t);
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
        uLow: { value: new THREE.Color(0xf0a060) }, // warm amber horizon
        uMid: { value: new THREE.Color(0x8877cc) }, // rose-violet mid-sky
        uZenith: { value: new THREE.Color(0x2244aa) }, // deep celestial blue
      },
      vertexShader: `
        varying float vY;
        void main() {
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uLow;
        uniform vec3 uMid;
        uniform vec3 uZenith;
        varying float vY;
        void main() {
          float t = clamp(vY, 0.0, 1.0);
          vec3 col = mix(uLow, uMid, smoothstep(0.0, 0.45, t));
          col = mix(col, uZenith, smoothstep(0.35, 1.0, t));
          gl_FragColor = vec4(col, 1.0);
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
      sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      sPos[i * 3 + 1] = r * Math.cos(phi) - 20;
      sPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    this._starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.2, // pixels (sizeAttenuation:false)
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
      const spread = (Math.random() - 0.5) * 0.28;
      const phi = bandCtr + spread;
      const theta = t + (Math.random() - 0.5) * 0.5;
      const r = 686 + Math.random() * 8;
      mPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      mPos[i * 3 + 1] = r * Math.cos(phi);
      mPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const mwGeo = new THREE.BufferGeometry();
    mwGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
    this._milkyWay = new THREE.Points(
      mwGeo,
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
      new THREE.SphereGeometry(20, 16, 12),
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
    const haloGeo = new THREE.RingGeometry(22, 40, 32);
    this._moonHalo = new THREE.Mesh(
      haloGeo,
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

  // ── CLOUDS — billboard sprite clouds drifting slowly westward ────────────────
  _buildClouds() {
    // Single shared canvas texture — soft radial-gradient puffs
    const CW = 256,
      CH = 128;
    const can = document.createElement("canvas");
    can.width = CW;
    can.height = CH;
    const ctx = can.getContext("2d");
    [
      [CW * 0.5, CH * 0.48, CH * 0.44],
      [CW * 0.28, CH * 0.58, CH * 0.3],
      [CW * 0.74, CH * 0.58, CH * 0.32],
      [CW * 0.16, CH * 0.66, CH * 0.2],
      [CW * 0.84, CH * 0.66, CH * 0.2],
    ].forEach(([cx, cy, r]) => {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(255,252,250,0.92)");
      g.addColorStop(0.5, "rgba(255,252,250,0.50)");
      g.addColorStop(1, "rgba(255,252,250,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CW, CH);
    });
    const cloudTex = new THREE.CanvasTexture(can);

    const defs = [
      { x: -80, y: 88, z: -60, s: 55, v: -0.9 },
      { x: 55, y: 95, z: -85, s: 68, v: -0.7 },
      { x: 125, y: 74, z: 42, s: 46, v: -1.1 },
      { x: -128, y: 82, z: 28, s: 58, v: -0.8 },
      { x: 30, y: 112, z: 105, s: 72, v: -0.6 },
      { x: -62, y: 78, z: 118, s: 50, v: -1.0 },
      { x: 92, y: 120, z: -118, s: 82, v: -0.75 },
      { x: -155, y: 90, z: -42, s: 60, v: -0.85 },
      { x: 0, y: 100, z: -145, s: 56, v: -0.65 },
      { x: 162, y: 85, z: 78, s: 52, v: -1.05 },
      { x: -38, y: 132, z: -28, s: 76, v: -0.7 },
      { x: 78, y: 72, z: 62, s: 44, v: -0.95 },
    ];

    this._clouds = [];
    this._cloudOpacity = 0.62;

    defs.forEach(({ x, y, z, s, v }) => {
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(s * 2.2, s, 1);
      sprite.position.set(x, y, z);
      sprite.userData.driftX = v; // units per second westward
      sprite.userData.baseY = y;
      sprite.userData.phase = x * 0.13 + z * 0.07; // deterministic bob phase
      this.scene.add(sprite);
      this._clouds.push(sprite);
    });
  }

  // ── GOD RAYS — shafts of golden light from sun toward city districts ──────────
  // Geometry approach: 8 thin transparent planes oriented from sun to ground targets.
  // Much lighter than a post-process pass; additive blending = zero overdraw cost.
  _buildGodRays() {
    const s = this.scene;
    // Item 29: sun at golden-hour horizon angle — lower and larger
    const sunPos = new THREE.Vector3(280, 85, 120);

    // Visible sun sphere — warm golden disc near horizon
    this._sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(14, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffee88,
        transparent: true,
        opacity: 0.92,
        fog: false,
        depthWrite: false,
      }),
    );
    this._sunDisc.position.copy(sunPos);
    s.add(this._sunDisc);

    // Sun halo ring — large warm corona
    this._sunHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff9944,
      transparent: true,
      opacity: 0.18,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(16, 42, 32),
      this._sunHaloMat,
    );
    halo.position.copy(sunPos);
    halo.lookAt(0, 50, 0);
    s.add(halo);

    // Ray material — shared across all 8 rays so opacity update is one line
    this._godRayMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.01,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // 8 ground targets — one per major district / landmark
    const targets = [
      new THREE.Vector3(0, 0, 0), // city center
      new THREE.Vector3(72, 0, -35), // Surya Dwara
      new THREE.Vector3(-88, 0, -35), // Brahma Kund
      new THREE.Vector3(45, 0, 56), // Vishwakarma
      new THREE.Vector3(-64, 0, 56), // Lakshmi
      new THREE.Vector3(88, 0, 13), // East quarter
      new THREE.Vector3(-88, 0, 13), // West quarter
      new THREE.Vector3(0, 0, -99), // Education
    ];

    targets.forEach((gt) => {
      const dir = gt.clone().sub(sunPos).normalize();
      const dist = gt.distanceTo(sunPos);
      const geo = new THREE.PlaneGeometry(2.8, dist);
      const ray = new THREE.Mesh(geo, this._godRayMat);
      ray.position.lerpVectors(sunPos, gt, 0.5);
      // Align plane height (Y) with sun→ground direction
      const q = new THREE.Quaternion();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      ray.quaternion.copy(q);
      s.add(ray);
    });
  }

  // ── DISTRICT ZONES — coloured ground glow beneath each city district ─────────
  // Additive circles at y=0.06 show district identity. Stronger at night.
  _buildDistrictZones() {
    this._districtZoneMats = [];
    const zones = [
      { x: 0,    z: 0,    color: 0xffcc33, r: 130 }, // city centre
      { x: 288,  z: -139, color: 0x00ccff, r: 140 }, // east hero
      { x: -352, z: -139, color: 0x9966ff, r: 120 }, // west heritage
      { x: 352,  z: 53,   color: 0xffcc33, r: 130 }, // craft east
      { x: -352, z: 53,   color: 0x44cc88, r: 120 }, // gardens west
      { x: 0,    z: -352, color: 0xa78bfa, r: 145 }, // education
      { x: 0,    z: 352,  color: 0xff9950, r: 110 }, // north
      { x: 523,  z: -43,  color: 0xff6644, r: 100 }, // far east
    ];

    zones.forEach(({ x, z, color, r }) => {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.07, z);
      this.scene.add(disc);
      this._districtZoneMats.push(mat);
    });
  }

  // ── BIRDS — 30 triangle points circling Surya Dwara summit ──────────────────
  // Item 11: organic bird flock at y=62-68, radius 22-38, slow spiral
  _buildBirds() {
    const BIRD_N = 30;
    const bPos = new Float32Array(BIRD_N * 3);
    // Surya Dwara sits at x=72, z=-35 (from Objects.js city-data positioning)
    const CX = 72,
      CZ = -35;

    const angles = new Float32Array(BIRD_N);
    const speeds = new Float32Array(BIRD_N);
    const radii = new Float32Array(BIRD_N);
    const ys = new Float32Array(BIRD_N);
    const bobSpeeds = new Float32Array(BIRD_N);
    const bobPhases = new Float32Array(BIRD_N);

    for (let i = 0; i < BIRD_N; i++) {
      angles[i] = (i / BIRD_N) * Math.PI * 2 + Math.random() * 0.4;
      speeds[i] = 0.18 + Math.random() * 0.12; // rad/s
      radii[i] = 22 + Math.random() * 16; // 22-38 from tower axis
      ys[i] = 62 + Math.random() * 6; // 62-68 above ground
      bobSpeeds[i] = 0.8 + Math.random() * 0.6;
      bobPhases[i] = Math.random() * Math.PI * 2;
      bPos[i * 3] = CX + Math.cos(angles[i]) * radii[i];
      bPos[i * 3 + 1] = ys[i];
      bPos[i * 3 + 2] = CZ + Math.sin(angles[i]) * radii[i];
    }

    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
    this._birds = new THREE.Points(
      bGeo,
      new THREE.PointsMaterial({
        color: 0x2a2018,
        size: 0.45,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this._birds.userData = {
      count: BIRD_N,
      cx: CX,
      cz: CZ,
      angles,
      speeds,
      radii,
      ys,
      bobSpeeds,
      bobPhases,
    };
    this.scene.add(this._birds);
  }

  // ── GROUND (large flat plane + sandy pavement) ─────────────────────────────
  _buildGround() {
    const s = this.scene;

    // Large ground — dry dusty earth, Varanasi-style
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(1200, 0.4, 1200),
      new THREE.MeshLambertMaterial({ color: 0xb09070 }),
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

    // Plaza stone slabs — large warm sandstone paving around key areas
    const plazaMat = new THREE.MeshLambertMaterial({ color: 0x987050 });
    [
      [0, 0, 52, 52],
      [0, 80, 38, 38],
      [0, -80, 38, 38],
      [80, 0, 38, 38],
      [-80, 0, 38, 38],
      [75, -35, 28, 28],
      [-88, -35, 28, 28],
      [60, 60, 28, 28],
      [-60, 60, 28, 28],
      [0, 160, 30, 30],
      [0, -160, 30, 30],
      [160, 0, 30, 30],
      [-160, 0, 30, 30],
    ].forEach(([px, pz, pw, ph]) => {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(pw, 0.02, ph),
        plazaMat,
      );
      slab.position.set(px, 0.01, pz);
      s.add(slab);
    });

    // Paved court zones near major intersections — subtle stone variation
    const paveMat = new THREE.MeshLambertMaterial({ color: 0x987558 });
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

    // Item 21: Processional spine — elevated stone path along x=0 from z=62 to z=-165
    // White-cream sandstone slab, 8 units wide, slightly raised above ground
    const spineMat = new THREE.MeshLambertMaterial({ color: 0xe8d8a8 });
    const spine = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 228), spineMat);
    spine.position.set(0, 0.06, -51); // center of z=62 to z=-165 is z=-51
    s.add(spine);
    // Decorative edge strips (darker stone bands)
    const spineEdgeMat = new THREE.MeshLambertMaterial({ color: 0xb8984a });
    for (const ox of [-4.2, 4.2]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.14, 228),
        spineEdgeMat,
      );
      edge.position.set(ox, 0.07, -51);
      s.add(edge);
    }

    // Item 27: Temple tank near Brahma Kund at (-88,-35) — shallow rectangular pool
    // Steps descend to dark still water. Reflects sky at night.
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x1a4a5c });
    const tankStep = new THREE.MeshLambertMaterial({ color: 0xc8a860 });
    const tankW = 22,
      tankD = 18;
    const tankX = -88,
      tankZ = -62; // south of brahma-kund
    // Outer steps
    for (let step = 0; step < 3; step++) {
      const sw2 = tankW + (3 - step) * 2,
        sd2 = tankD + (3 - step) * 2;
      const sl = new THREE.Mesh(
        new THREE.BoxGeometry(sw2, 0.35, sd2),
        tankStep,
      );
      sl.position.set(tankX, -step * 0.35, tankZ);
      s.add(sl);
    }
    // Water surface
    const tank = new THREE.Mesh(
      new THREE.BoxGeometry(tankW, 0.1, tankD),
      tankMat,
    );
    tank.position.set(tankX, -1.05, tankZ);
    s.add(tank);
    // Shimmer on water surface
    this._tankShimmer = new THREE.Mesh(
      new THREE.PlaneGeometry(tankW, tankD),
      new THREE.MeshBasicMaterial({
        color: 0x2288aa,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    this._tankShimmer.rotation.x = -Math.PI / 2;
    this._tankShimmer.position.set(tankX, -0.98, tankZ);
    s.add(this._tankShimmer);

    // Item 18: District ground color variation — E=pale gold, W=ochre, S=laterite red
    [
      { col: 0xd4b880, x: 140, z: -10, w: 110, d: 160 }, // East quarter — pale gold
      { col: 0xaa7830, x: -140, z: -10, w: 110, d: 160 }, // West quarter — deep ochre
      { col: 0xa04820, x: 0, z: 80, w: 200, d: 80 }, // South entry — laterite red
    ].forEach(({ col, x, z, w, d }) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.03, d),
        new THREE.MeshLambertMaterial({ color: col }),
      );
      m.position.set(x, -0.005, z);
      s.add(m);
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

    // ── EDUCATION PLATEAU — Item 15 ──────────────────────────────────────────
    // Knowledge district sits 5 units higher — a sacred hill/hermitage hill
    // Covers the 3 education buildings: saraswati(35,-99), gurukul(-35,-99), vidya(-131,-35)
    const platMat = new THREE.MeshLambertMaterial({ color: 0xb8a070 }); // warm pale sandstone
    const platRampMat = new THREE.MeshLambertMaterial({ color: 0xa09060 });
    // Main plateau block — rectangular mound centered on the education cluster
    const plat = new THREE.Mesh(new THREE.BoxGeometry(200, 5.0, 90), platMat);
    plat.position.set(-30, 2.5 - 0.2, -115); // -0.2 so top at y=5
    s.add(plat);
    // Soft south-facing ramp to avoid cliff edge at z=-70
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(200, 0.6, 12),
      platRampMat,
    );
    ramp.position.set(-30, 2.5, -69);
    ramp.rotation.x = -0.18; // gentle slope
    s.add(ramp);

    // ── DISTANT MOUNTAINS — Item 37 ───────────────────────────────────────────
    // Low-poly silhouettes at far horizon (r=420-600) — dark blue-purple haze
    const mtnMat = new THREE.MeshLambertMaterial({
      color: 0x2a2050,
      fog: true,
    });
    const peaks = [
      // [cx, cz, width, height, segments]
      [-480, -300, 160, 90, 6],
      [-300, -480, 140, 110, 5],
      [-60, -520, 180, 130, 7],
      [200, -490, 150, 100, 6],
      [450, -320, 160, 80, 5],
      [520, 20, 140, 95, 6],
      [490, 280, 130, 75, 5],
      [200, 500, 170, 120, 7],
      [-80, 520, 150, 90, 6],
      [-300, 470, 160, 105, 6],
      [-500, 250, 140, 85, 5],
      [-510, -60, 150, 100, 6],
    ];
    for (const [cx, cz, mw, mh, seg] of peaks) {
      // Cone → stretch and flatten into mountain shape
      const geo = new THREE.ConeGeometry(mw * 0.5, mh, seg);
      const posArr = geo.attributes.position.array;
      // Add vertex-level noise for irregular silhouette
      for (let vi = 0; vi < posArr.length; vi += 3) {
        if (posArr[vi + 1] > 0) {
          // only top vertices
          posArr[vi] += (Math.random() - 0.5) * mw * 0.18;
          posArr[vi + 1] += (Math.random() - 0.5) * mh * 0.12;
          posArr[vi + 2] += (Math.random() - 0.5) * mw * 0.18;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      const mtn = new THREE.Mesh(geo, mtnMat);
      mtn.position.set(cx, -1, cz);
      s.add(mtn);
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

    // Item 36: Counter-rotating beacon ring on plaza floor
    // A second Group at y=0.05 with 8 glowing disc segments — rotates opposite direction
    this._chakraInnerRing = new THREE.Group();
    s.add(this._chakraInnerRing);
    for (let i = 0; i < 8; i++) {
      const segAngle = (i / 8) * Math.PI * 2;
      const segR = 8.0;
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.08, 3.5),
        new THREE.MeshBasicMaterial({
          color: [0xffdd44, 0x44ddff, 0xff4422, 0x44ff88][i % 4],
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      seg.position.set(
        Math.sin(segAngle) * segR,
        0.05,
        Math.cos(segAngle) * segR,
      );
      seg.rotation.y = segAngle;
      this._chakraInnerRing.add(seg);
    }

    // ── SACRED FIRE — at the center of the Dharma Chakra plaza ──────────────
    // 4-layer flame visible from the road, always lit
    this._sacredFire = [];
    const fireDefs = [
      { col: 0xcc2200, r: 0.28, h: 0.5 },
      { col: 0xff6600, r: 0.2, h: 0.65 },
      { col: 0xffaa00, r: 0.14, h: 0.8 },
      { col: 0xffee88, r: 0.08, h: 0.95 },
    ];
    fireDefs.forEach(({ col, r, h: fh }, i) => {
      const fm = new THREE.Mesh(
        new THREE.ConeGeometry(r, fh, 6),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.9,
        }),
      );
      fm.position.y = 1.0 + i * 0.06;
      fm.userData.fireI = i;
      fm.userData.firePhase = i * 1.57;
      this._chakraGroup.add(fm);
      this._sacredFire.push(fm);
    });
    // Fire glow light
    this._sacredFireLight = new THREE.PointLight(
      0xff6622,
      this.isNight ? 5.0 : 2.2,
      32,
    );
    this._sacredFireLight.position.y = 1.6;
    this._chakraGroup.add(this._sacredFireLight);

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
    this._chakraBeaconLight = new THREE.PointLight(
      0xffddaa,
      this.isNight ? 3.2 : 1.2,
      38,
    );
    this._chakraBeaconLight.position.y = 4.4;
    this._chakraGroup.add(this._chakraBeaconLight);

    // 8 lamp posts around plaza perimeter (static — outside chakra group)
    const poleMat = new THREE.MeshToonMaterial({
      color: 0xaa9977,
      gradientMap: tg,
    });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const pr = 20;
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 5.8, 0.28),
        poleMat,
      );
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

    // ── ASHOKA STAMBHA — 32-unit sacred pillar at the city's axis ─────────────
    // The Dharma Chakra had no vertical presence. This pillar IS the landmark:
    // visible from every district, the spinning disc at the top is the beacon.
    this._stambhaGroup = new THREE.Group();
    s.add(this._stambhaGroup);

    const shaftMat = new THREE.MeshToonMaterial({
      color: 0xeedd99,
      gradientMap: tg,
    });
    // Tapered shaft: 1.5 radius at base to 0.7 at capital over 30 units
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.5, 30, 8),
      shaftMat,
    );
    shaft.position.y = 15.65; // 0.65 = plaza surface
    this._stambhaGroup.add(shaft);

    // Decorative rings at 1/3 and 2/3 heights
    const ringMat = new THREE.MeshToonMaterial({
      color: 0xffcc44,
      gradientMap: tg,
    });
    for (const ry of [10.65, 20.65]) {
      const dRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.14, 5, 16),
        ringMat,
      );
      dRing.rotation.x = Math.PI / 2;
      dRing.position.y = ry;
      this._stambhaGroup.add(dRing);
    }

    // Abacus capital
    const abacus = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 0.8, 0.9, 8),
      shaftMat,
    );
    abacus.position.y = 31.3;
    this._stambhaGroup.add(abacus);

    // Four lion gems at capital corners (simplified Ashoka lions)
    const lionMat = new THREE.MeshMatcapMaterial({
      color: 0xffdd44,
      matcap: window._matcaps?.gold_rich || window._matcaps?.gold,
    });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const lion = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        lionMat,
      );
      lion.position.set(Math.cos(ang) * 1.2, 32.2, Math.sin(ang) * 1.2);
      this._stambhaGroup.add(lion);
    }

    // Spinning Dharma Chakra disc at pillar apex
    this._stambhaChakra = new THREE.Mesh(
      new THREE.TorusGeometry(2.0, 0.28, 6, 24),
      new THREE.MeshToonMaterial({ color: 0xffcc44, gradientMap: tg }),
    );
    this._stambhaChakra.rotation.x = Math.PI / 2;
    this._stambhaChakra.position.y = 33.2;
    this._stambhaGroup.add(this._stambhaChakra);

    // 8 chakra spokes at apex
    for (let i = 0; i < 8; i++) {
      const sa = (i / 8) * Math.PI * 2;
      const sp = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 1.85),
        new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
      );
      sp.rotation.y = sa;
      sp.position.set(0, 33.2, 0);
      this._stambhaGroup.add(sp);
    }

    // Beacon at summit — large, bright, visible from city edge
    this._stambhaBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffeeaa,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this._stambhaBeacon.position.y = 34.6;
    this._stambhaGroup.add(this._stambhaBeacon);

    // Beacon light — golden, reaches far at night
    this._stambhaLight = new THREE.PointLight(
      0xffdd88,
      this.isNight ? 5.0 : 2.0,
      60,
    );
    this._stambhaLight.position.y = 34.8;
    this._stambhaGroup.add(this._stambhaLight);

    // Note: _islandRing and _islandRingOuter are not set — the animation blocks
    // in _updateLighting guard with if(this._islandRing) so they skip cleanly.
  }

  // ── ATMOSPHERE — petals, fireflies, car dust trail ─────────────────────────
  _buildAtmosphere() {
    // ── BLOSSOM PETALS — reduced count for cleaner sky ───────────────────────
    const cnt = 100;
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

    // ── FIREFLIES — sparse motes near water and temples at night ─────────────
    const FC = 40;
    const fPos = new Float32Array(FC * 3),
      fCol = new Float32Array(FC * 3);
    const fPhase = new Float32Array(FC); // per-firefly flicker phase offset
    const fireTempleAreas = [
      [72, -35], // surya-dwara
      [45, 56], // vishwakarma
      [-88, -35], // brahma-kund
      [-64, 56], // lakshmi-prasad
      [0, 88], // pura-stambha
      [-45, -61], // maya-sabha
      [0, -88], // jyotish-vedha
      [-88, 13], // vayu-rath
      [88, -61], // akasha-mandapa
      [88, 13], // setu-nagara
      [35, -99], // saraswati-vihar (NE — Ishanya/knowledge, correct Vastu)
      [-35, -99], // gurukul-ashram
      [131, -35], // vaishya-griha
      [131, 13], // agni-vedha
      [45, -77], // darpana-shala
      [-131, -35], // vidya-ashram
      [0, 115], // sutra-dhara
    ];
    const RIVER_FF = Math.floor(FC * 0.5); // 50% near river corridor
    for (let i = 0; i < FC; i++) {
      if (i < RIVER_FF) {
        // River corridor: z=-3 to -20, full x span of city
        fPos[i * 3] = -200 + Math.random() * 400;
        fPos[i * 3 + 1] = 0.5 + Math.random() * 3.5; // low, near water
        fPos[i * 3 + 2] = -3 - Math.random() * 17;
      } else {
        const area = fireTempleAreas[(i - RIVER_FF) % fireTempleAreas.length];
        fPos[i * 3] = area[0] + (Math.random() - 0.5) * 12;
        fPos[i * 3 + 1] = 1.5 + Math.random() * 6;
        fPos[i * 3 + 2] = area[1] + (Math.random() - 0.5) * 12;
      }
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
    const LC = 60;
    const lPos = new Float32Array(LC * 3);
    const lVel = new Float32Array(LC * 3);
    const lCol = new Float32Array(LC * 3);
    const leafClusters = [
      [-130, -6],
      [-65, -4],
      [0, -10],
      [65, -5],
      [130, -12],
      [-22, 50],
      [-15, 80],
    ];
    const leafCols = [
      [0.53, 0.73, 0.23],
      [0.6, 0.8, 0.27],
      [0.87, 0.8, 0.33],
    ];
    for (let i = 0; i < LC; i++) {
      const cl = leafClusters[i % leafClusters.length];
      lPos[i * 3] = cl[0] + (Math.random() - 0.5) * 18;
      lPos[i * 3 + 1] = 1 + Math.random() * 9;
      lPos[i * 3 + 2] = cl[1] + (Math.random() - 0.5) * 12;
      lVel[i * 3] = (Math.random() - 0.5) * 0.01;
      lVel[i * 3 + 1] = -0.004 - Math.random() * 0.006;
      lVel[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
      const lc = leafCols[Math.floor(Math.random() * 3)];
      lCol[i * 3] = lc[0];
      lCol[i * 3 + 1] = lc[1];
      lCol[i * 3 + 2] = lc[2];
    }
    const leafGeo = new THREE.BufferGeometry();
    leafGeo.setAttribute("position", new THREE.BufferAttribute(lPos, 3));
    leafGeo.setAttribute("color", new THREE.BufferAttribute(lCol, 3));
    this._leafParticles = new THREE.Points(
      leafGeo,
      new THREE.PointsMaterial({
        size: 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 0.65,
      }),
    );
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

    // ── RIVER DIYAS — 70 golden points drifting downstream at night ──────────
    // Day equivalent: lotus patches (pink/white, same positions, cross-fade)
    const DIYA_N = 70;
    const diyaPos = new Float32Array(DIYA_N * 3);
    const lotusPos = new Float32Array(DIYA_N * 3);
    const lotusCols = new Float32Array(DIYA_N * 3);
    // River path z range: approximately -3 to -20 (main river E-W)
    for (let i = 0; i < DIYA_N; i++) {
      const rx = (Math.random() - 0.5) * 430; // spread across full river width
      const rz = -4 + Math.random() * -14; // within river z band
      diyaPos[i * 3] = rx;
      diyaPos[i * 3 + 1] = -0.05;
      diyaPos[i * 3 + 2] = rz;
      lotusPos[i * 3] = rx;
      lotusPos[i * 3 + 1] = -0.1;
      lotusPos[i * 3 + 2] = rz;
      const isPink = Math.random() > 0.4;
      lotusCols[i * 3] = 1.0;
      lotusCols[i * 3 + 1] = isPink ? 0.5 : 0.95;
      lotusCols[i * 3 + 2] = isPink ? 0.65 : 0.97;
    }

    const diyaGeo = new THREE.BufferGeometry();
    diyaGeo.setAttribute("position", new THREE.BufferAttribute(diyaPos, 3));
    this._riverDiyas = new THREE.Points(
      diyaGeo,
      new THREE.PointsMaterial({
        color: 0xff9922,
        size: 1.4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this._riverDiyas);

    const lotusGeo = new THREE.BufferGeometry();
    lotusGeo.setAttribute("position", new THREE.BufferAttribute(lotusPos, 3));
    lotusGeo.setAttribute("color", new THREE.BufferAttribute(lotusCols, 3));
    this._lotusPatches = new THREE.Points(
      lotusGeo,
      new THREE.PointsMaterial({
        size: 2.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this._lotusPatches);

    // ── INCENSE SMOKE — only hero temples, minimal particles ─────────────────
    const temples = (window.CITY_DATA?.buildings || []).filter(b => b.isHero || b.height >= 30);
    const SMOKE_PER = 2;
    const SMOKE_N = temples.length * SMOKE_PER;
    const sPos = new Float32Array(SMOKE_N * 3);
    for (let i = 0; i < SMOKE_N; i++) {
      const b = temples[Math.floor(i / SMOKE_PER)];
      const tp = b ? b.pos : [0, 0];
      sPos[i * 3] = tp[0] + (Math.random() - 0.5) * 2.5;
      sPos[i * 3 + 1] = 0.8 + Math.random() * 14; // stagger heights on init
      sPos[i * 3 + 2] = tp[1] + (Math.random() - 0.5) * 2.5;
    }
    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    this._incenseSmoke = new THREE.Points(
      smokeGeo,
      new THREE.PointsMaterial({
        color: 0xddddd0,
        size: 0.52,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this._incenseSmoke.userData.temples = temples;
    this._incenseSmoke.userData.smokePerTemple = SMOKE_PER;
    this.scene.add(this._incenseSmoke);

    // Item 28: Dust motes — golden specks drifting in sunbeam zones near temples
    // 5 main temple approach corridors: near Surya Dwara, Brahma Kund, city center
    const MOTE_N = 180;
    const motePos = new Float32Array(MOTE_N * 3);
    const moteZones = [
      [72, -35],
      [0, 0],
      [-88, -35],
      [45, 56],
      [0, -88],
    ];
    for (let i = 0; i < MOTE_N; i++) {
      const z = moteZones[i % moteZones.length];
      motePos[i * 3] = z[0] + (Math.random() - 0.5) * 22;
      motePos[i * 3 + 1] = 0.5 + Math.random() * 12;
      motePos[i * 3 + 2] = z[1] + (Math.random() - 0.5) * 22;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
    this._dustMotes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        color: 0xffeecc,
        size: 0.18,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this._dustMotes);

    // Item 30: Rain particles — vertical streaks, only visible in rain weather
    const RAIN_N = 600;
    const rainPos = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 280;
      rainPos[i * 3 + 1] = Math.random() * 50;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 280;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    this._rainParticles = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: 0x88bbdd,
        size: 0.35,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this._rainParticles);

    // Item 42: Processional diyas — golden points lining the x=0 spine road
    // From city entry (z=62) to deep north (z=-155), spaced 4 units, ±2.5 offset
    const PROC_N = 56; // ~220 units / 4 spacing = 55 pairs × 2 sides
    const procPos = new Float32Array(PROC_N * 2 * 3); // 2 sides
    for (let i = 0; i < PROC_N; i++) {
      const pz = 60 - i * 4;
      for (const [si, ox] of [
        [-1, -2.5],
        [1, 2.5],
      ]) {
        const idx = (i * 2 + (si < 0 ? 0 : 1)) * 3;
        procPos[idx] = ox;
        procPos[idx + 1] = 0.08;
        procPos[idx + 2] = pz;
      }
    }
    const procGeo = new THREE.BufferGeometry();
    procGeo.setAttribute("position", new THREE.BufferAttribute(procPos, 3));
    this._procDiyas = new THREE.Points(
      procGeo,
      new THREE.PointsMaterial({
        color: 0xffaa22,
        size: 1.0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this._procDiyas);
  }

  _updateAtmosphere(now, dt) {
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
        pos[i * 3] += vel[i * 3] + Math.sin(now * 0.5 + i * 0.9) * 0.004;
        pos[i * 3 + 1] += vel[i * 3 + 1];
        pos[i * 3 + 2] +=
          vel[i * 3 + 2] + Math.cos(now * 0.4 + i * 0.7) * 0.003;
        if (pos[i * 3 + 1] < 0) {
          const cl = clusters[i % clusters.length];
          pos[i * 3] = cl[0] + (Math.random() - 0.5) * 18;
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
      const tStar = this.isNight ? 0.92 : 0;
      const tMW = this.isNight ? 0.55 : 0; // boosted Milky Way
      const tMoon = this.isNight ? 1.0 : 0;
      this._starField.material.opacity +=
        (tStar - this._starField.material.opacity) * 0.014;
      if (this._milkyWay)
        this._milkyWay.material.opacity +=
          (tMW - this._milkyWay.material.opacity) * 0.014;
      if (this._moonMesh) {
        this._moonMesh.material.opacity +=
          (tMoon - this._moonMesh.material.opacity) * 0.014;
        if (this._moonHalo) {
          // Boosted halo — visibly dramatic at night
          this._moonHalo.material.opacity =
            this._moonMesh.material.opacity *
            (0.38 + Math.sin(now * 0.28) * 0.08);
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
          this._chakraBeaconLight.intensity +=
            (tI - this._chakraBeaconLight.intensity) * 0.04;
        }
      }
    }

    // Item 27: Temple tank shimmer
    if (this._tankShimmer) {
      this._tankShimmer.material.opacity =
        0.28 + Math.sin(now * 0.55) * 0.12 + (this.isNight ? 0.18 : 0);
    }

    // ── CHAKRA INNER RING — counter-rotates vs main chakra ───────────────────
    if (this._chakraInnerRing) {
      this._chakraInnerRing.rotation.y = -(now * 0.12);
    }

    // ── ASHOKA STAMBHA — top chakra spins, beacon breathes ───────────────────
    if (this._stambhaChakra) {
      this._stambhaChakra.rotation.z = now * 0.18;
    }
    if (this._stambhaBeacon) {
      const sb = 0.82 + Math.sin(now * 0.88 + 1.2) * 0.16;
      this._stambhaBeacon.material.opacity = sb;
      if (this._stambhaLight) {
        const tI = (this.isNight ? 5.5 : 2.0) * sb;
        this._stambhaLight.intensity +=
          (tI - this._stambhaLight.intensity) * 0.04;
      }
    }

    // ── RIVER DIYAS — drift eastward downstream, visible at night ─────────────
    if (this._riverDiyas) {
      const _dt = dt || 0.016;
      const pos = this._riverDiyas.geometry.attributes.position.array;
      for (let i = 0, n = pos.length / 3; i < n; i++) {
        pos[i * 3] += 1.5 * _dt; // drift eastward with current
        if (pos[i * 3] > 215) pos[i * 3] = -215; // wrap
        pos[i * 3 + 2] += Math.sin(now * 0.28 + i * 0.83) * 0.006; // shimmer
      }
      this._riverDiyas.geometry.attributes.position.needsUpdate = true;
      const tDiya = this.isNight ? 0.88 : 0;
      this._riverDiyas.material.opacity +=
        (tDiya - this._riverDiyas.material.opacity) * 0.016;
    }

    // ── LOTUS PATCHES — visible in day, hidden at night ───────────────────────
    if (this._lotusPatches) {
      const tLotus = this.isNight ? 0 : 0.72;
      this._lotusPatches.material.opacity +=
        (tLotus - this._lotusPatches.material.opacity) * 0.018;
    }

    // ── INCENSE SMOKE — rises slowly, drifts, respawns at temple base ─────────
    if (this._incenseSmoke) {
      const _dt = dt || 0.016;
      const pos = this._incenseSmoke.geometry.attributes.position.array;
      const temples = this._incenseSmoke.userData.temples || [];
      const spt = this._incenseSmoke.userData.smokePerTemple || 6;
      for (let i = 0, n = pos.length / 3; i < n; i++) {
        pos[i * 3 + 1] += 1.0 * _dt;
        pos[i * 3] += Math.sin(now * 0.35 + i * 0.91) * 0.007;
        pos[i * 3 + 2] += Math.cos(now * 0.28 + i * 1.13) * 0.007;
        if (pos[i * 3 + 1] > 20) {
          const b = temples[Math.floor(i / spt)];
          const tp = b ? b.pos : [0, 0];
          pos[i * 3] = tp[0] + (Math.random() - 0.5) * 2.5;
          pos[i * 3 + 1] = 0.8;
          pos[i * 3 + 2] = tp[1] + (Math.random() - 0.5) * 2.5;
        }
      }
      this._incenseSmoke.geometry.attributes.position.needsUpdate = true;
      // Smoke slightly more visible at night when fire torches lit
      const tSmoke = this.isNight ? 0.28 : 0.18;
      this._incenseSmoke.material.opacity +=
        (tSmoke - this._incenseSmoke.material.opacity) * 0.02;
    }

    // ── CLOUDS — drift westward, gentle Y bob, fade at night ─────────────────
    if (this._clouds) {
      const _dt = dt || 0.016;
      const tOp = this.isNight ? 0.06 : 0.62;
      this._cloudOpacity =
        (this._cloudOpacity || 0.62) +
        (tOp - (this._cloudOpacity || 0.62)) * 0.008;
      for (const cloud of this._clouds) {
        cloud.position.x += cloud.userData.driftX * _dt;
        cloud.position.y =
          cloud.userData.baseY +
          Math.sin(now * 0.08 + cloud.userData.phase) * 1.5;
        if (cloud.position.x < -290) cloud.position.x = 290; // wrap east→west
        cloud.material.opacity = this._cloudOpacity;
      }
    }

    // ── GOD RAYS + SUN — brighter at sunset, invisible at night ──────────────
    if (this._godRayMat) {
      const isSunset = this._cyclePhase === "sunset";
      const tRay = this.isNight ? 0 : isSunset ? 0.032 : 0.01;
      const tDisc = this.isNight ? 0 : isSunset ? 0.96 : 0.88;
      const tHalo = this.isNight ? 0 : isSunset ? 0.3 : 0.12;
      this._godRayMat.opacity += (tRay - this._godRayMat.opacity) * 0.008;
      if (this._sunDisc)
        this._sunDisc.material.opacity +=
          (tDisc - this._sunDisc.material.opacity) * 0.01;
      if (this._sunHaloMat)
        this._sunHaloMat.opacity += (tHalo - this._sunHaloMat.opacity) * 0.01;
    }

    // ── DISTRICT ZONES — subtle day glow, stronger night identity ────────────
    if (this._districtZoneMats) {
      const tZone = this.isNight ? 0.055 : 0.012;
      for (const mat of this._districtZoneMats) {
        mat.opacity += (tZone - mat.opacity) * 0.012;
      }
    }

    // ── SACRED FIRE — flicker each cone layer independently ──────────────────
    if (this._sacredFire && this._sacredFire.length) {
      for (const fm of this._sacredFire) {
        const ph = fm.userData.firePhase;
        const i = fm.userData.fireI;
        // Each layer flickers at different frequency — outer slower, inner faster
        const flicker =
          0.72 +
          Math.sin(now * (3.8 + i * 1.2) + ph) * 0.24 +
          Math.sin(now * (7.1 + i * 0.9) + ph * 1.7) * 0.08;
        fm.material.opacity = Math.max(0.45, Math.min(0.98, flicker));
        // Scale Y slightly for flame dance
        fm.scale.y = 0.88 + Math.sin(now * 4.2 + ph) * 0.16;
        fm.scale.x = 0.92 + Math.cos(now * 3.5 + ph) * 0.1;
      }
      if (this._sacredFireLight) {
        const fi =
          (this.isNight ? 6.0 : 2.8) * (0.88 + Math.sin(now * 5.1) * 0.18);
        this._sacredFireLight.intensity +=
          (fi - this._sacredFireLight.intensity) * 0.12;
      }
    }

    // ── BIRDS — flock circles above Surya Dwara summit ───────────────────────
    if (this._birds) this._updateBirds(now);

    // Item 42: Processional diyas — glow at night, breathe gently
    if (this._procDiyas) {
      const tProc = this.isNight ? 0.7 : 0.18;
      this._procDiyas.material.opacity +=
        (tProc - this._procDiyas.material.opacity) * 0.02;
    }

    // Item 28: Dust motes — drift lazily, visible in day sunbeam zones
    if (this._dustMotes) {
      const tMote = this.isNight ? 0 : 0.28;
      this._dustMotes.material.opacity +=
        (tMote - this._dustMotes.material.opacity) * 0.015;
      if (this._dustMotes.material.opacity > 0.02) {
        const _dt3 = dt || 0.016;
        const mp = this._dustMotes.geometry.attributes.position.array;
        for (let i = 0, n = mp.length / 3; i < n; i++) {
          mp[i * 3] += Math.sin(now * 0.22 + i * 0.71) * 0.004;
          mp[i * 3 + 1] += 0.04 * _dt3; // very slow rise
          mp[i * 3 + 2] += Math.cos(now * 0.18 + i * 0.53) * 0.004;
          if (mp[i * 3 + 1] > 13) {
            const z = [
              [72, -35],
              [0, 0],
              [-88, -35],
              [45, 56],
              [0, -88],
            ][i % 5];
            mp[i * 3] = z[0] + (Math.random() - 0.5) * 22;
            mp[i * 3 + 1] = 0.5;
            mp[i * 3 + 2] = z[1] + (Math.random() - 0.5) * 22;
          }
        }
        this._dustMotes.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Item 41: Lightning flash — random flash at night during rain
    if (this._cyclePhase === "rain" && this.isNight) {
      this._lightningTimer = (this._lightningTimer || 0) + (dt || 0.016);
      if (this._lightningTimer > (this._lightningNext || 8)) {
        this._lightningTimer = 0;
        this._lightningNext = 5 + Math.random() * 12;
        // Trigger white flash overlay
        const lf = document.createElement("div");
        lf.style.cssText =
          "position:fixed;inset:0;z-index:9996;pointer-events:none;background:rgba(200,220,255,0.85);";
        document.body.appendChild(lf);
        setTimeout(() => {
          lf.style.background = "rgba(200,220,255,0.45)";
        }, 60);
        setTimeout(() => {
          lf.style.background = "rgba(200,220,255,0.0)";
          lf.style.transition = "background 0.3s";
        }, 120);
        setTimeout(() => lf.remove(), 450);
        // Sky ambient flash
        if (this.ambLight) {
          const origI = this.ambLight.intensity;
          this.ambLight.intensity = origI * 5.0;
          setTimeout(() => {
            if (this.ambLight) this.ambLight.intensity = origI;
          }, 150);
        }
      }
    } else {
      this._lightningTimer = 0;
    }

    // Item 30: Rain particles — fall fast, wrap at bottom, only in rain mode
    if (this._rainParticles) {
      const isRain =
        this._cyclePhase === "rain" || this._weatherTarget?._isRain;
      const tRain = isRain ? 0.55 : 0;
      this._rainParticles.material.opacity +=
        (tRain - this._rainParticles.material.opacity) * 0.04;
      if (isRain && this._rainParticles.material.opacity > 0.05) {
        const _dt2 = dt || 0.016;
        const rPos = this._rainParticles.geometry.attributes.position.array;
        for (let i = 0, n = rPos.length / 3; i < n; i++) {
          rPos[i * 3 + 1] -= 28 * _dt2; // fast fall
          rPos[i * 3] -= 1.5 * _dt2; // wind drift
          if (rPos[i * 3 + 1] < -1) {
            rPos[i * 3] = (Math.random() - 0.5) * 280;
            rPos[i * 3 + 1] = 48 + Math.random() * 6;
            rPos[i * 3 + 2] = (Math.random() - 0.5) * 280;
          }
        }
        this._rainParticles.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  _updateBirds(now) {
    const pos = this._birds.geometry.attributes.position.array;
    const bdata = this._birds.userData;
    for (let i = 0, n = bdata.count; i < n; i++) {
      const ang = bdata.angles[i] + now * bdata.speeds[i];
      pos[i * 3] = bdata.cx + Math.cos(ang) * bdata.radii[i];
      pos[i * 3 + 1] =
        bdata.ys[i] +
        Math.sin(now * bdata.bobSpeeds[i] + bdata.bobPhases[i]) * 1.2;
      pos[i * 3 + 2] = bdata.cz + Math.sin(ang) * bdata.radii[i];
    }
    this._birds.geometry.attributes.position.needsUpdate = true;
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

    // Hero buildings only — Surya Dwara and Brahma Kund get flag strings
    const heroes = (window.CITY_DATA?.buildings || []).filter(b => b.isHero);
    heroes.forEach((b) => {
      const bh = Math.min(b.height, 22) + 1;
      const bx = b.pos[0];
      const bz = b.pos[1];
      const fr = Math.max(b.size[0], b.size[1]) * 0.55;
      string(bx - fr, bh, bz, bx + fr, bz, 5);
    });
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

    // Positions scaled ×8/3 from original
    [
      { x: 0, z: -69, ry: 0, label: "◈  HERO DISTRICT", col: 0x00ddff },
      { x: 0, z: -293, ry: 0, label: "◈  MODERNIZATION ZONE", col: 0xffcc44 },
      { x: 0, z: -347, ry: 0, label: "◈  EDUCATION DISTRICT", col: 0xa78bfa },
      { x: 0, z: 293, ry: 0, label: "◈  SOUTH DISTRICT", col: 0xff9950 },
      {
        x: -440,
        z: 139,
        ry: Math.PI / 2,
        label: "◈  WEST QUARTER",
        col: 0xffcc44,
      },
      {
        x: 440,
        z: 139,
        ry: Math.PI / 2,
        label: "◈  EAST QUARTER",
        col: 0x00c8ff,
      },
    ].forEach(({ x, z, ry, label, col }) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const W2 = 10,
        H = 22;
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
      sign.position.set(0, H - 3, 0.8);
      g.add(sign);
      this.scene.add(g);
    });

    // Register arch pillar pairs as circle colliders
    [
      { x: 0,    z: -69  }, { x: 0,    z: 293 }, { x: 0,    z: -293 },
      { x: 0,    z: -347 }, { x: 0,    z: 110  },
    ].forEach(({ x, z }) => {
      CM.register({ type: 'circle', x: x - 10, z, r: 1.4, id: `arch_L_${z}` });
      CM.register({ type: 'circle', x: x + 10, z, r: 1.4, id: `arch_R_${z}` });
    });

    // Item 23: City entry gate — grand ceremonial torana at z=245 (player faces north)
    // Larger than district arches: H=26, W=14, with 3-tiered gopuram roof
    {
      const entryG = new THREE.Group();
      entryG.position.set(0, 0, 245);
      const W2 = 14,
        H = 26;
      for (const ox of [-W2, W2]) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, H, 2.0),
          archMat,
        );
        pillar.position.set(ox, H / 2, 0);
        entryG.add(pillar);
        // Tiered capital
        for (let ti = 0; ti < 3; ti++) {
          const capW = 3.2 - ti * 0.6;
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(capW, 1.0, capW),
            goldMat,
          );
          cap.position.set(ox, H + ti * 1.1, 0);
          entryG.add(cap);
        }
        const pot = new THREE.Mesh(
          new THREE.SphereGeometry(0.9, 8, 6),
          goldMat,
        );
        pot.position.set(ox, H + 3.5, 0);
        entryG.add(pot);
      }
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(W2 * 2 + 2, 1.6, 2.0),
        archMat,
      );
      lintel.position.set(0, H, 0);
      entryG.add(lintel);
      const archTop = new THREE.Mesh(
        new THREE.BoxGeometry(W2 * 2 + 2, 1.2, 2.0),
        goldMat,
      );
      archTop.position.set(0, H + 1.5, 0);
      entryG.add(archTop);
      // Sanskrit label: "नगरम् प्रवेश"
      const CW2 = 512,
        CH2 = 110;
      const can2 = document.createElement("canvas");
      can2.width = CW2;
      can2.height = CH2;
      const ctx2 = can2.getContext("2d");
      ctx2.fillStyle = "rgba(10,5,2,0.92)";
      ctx2.fillRect(0, 0, CW2, CH2);
      ctx2.strokeStyle = "#ffcc44cc";
      ctx2.lineWidth = 2;
      ctx2.strokeRect(2, 2, CW2 - 4, CH2 - 4);
      ctx2.fillStyle = "#f0d870";
      ctx2.font = "bold 32px serif";
      ctx2.textAlign = "center";
      ctx2.textBaseline = "middle";
      ctx2.fillText("◈  नगरम् प्रवेश  ◈", CW2 / 2, 38);
      ctx2.fillStyle = "rgba(240,210,160,0.72)";
      ctx2.font = "italic 16px serif";
      ctx2.fillText("Build things that survive after you leave.", CW2 / 2, 80);
      const sign2 = new THREE.Mesh(
        new THREE.PlaneGeometry(W2 * 2 - 1, 3.0),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(can2),
          transparent: true,
        }),
      );
      sign2.position.set(0, H - 0.2, 1.1);
      entryG.add(sign2);
      this.scene.add(entryG);
    }

  }

  // ── WORLD NAME ──────────────────────────────────────────────────────────────
  _buildWorldName() {
    // Place near player spawn (z=40 in city-data, so z=120 in 2.5x world? No -
    // car spawns at z=40 from city-data, we keep building positions exact.
    // Name goes at z=90 (well behind spawn area)
    const nameZ = 347;
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

  // ── HIDDEN AREAS — discoverable by exploration ──────────────────────────────
  // Incident Chamber · Personal Corner · War Stories Wall · Tech Debt Ruin
  // Orientation Stone. Oracle triggers when player approaches.
  _buildHiddenAreas() {
    const s = this.scene;
    const mkSprite = (text, font, col, W, H) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d");
      x.clearRect(0, 0, W, H);
      x.fillStyle = col;
      x.font = font;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(text, W / 2, H / 2);
      return new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
      });
    };
    const darkStone = new THREE.MeshLambertMaterial({ color: 0x2a1f18 });
    const sandstone = new THREE.MeshLambertMaterial({ color: 0xc8a870 });
    const goldMat = new THREE.MeshLambertMaterial({
      color: 0xffcc44,
      emissive: 0xffaa00,
      emissiveIntensity: 0.4,
    });

    // ── 1. ORIENTATION STONE — just inside the entry gate, right of spine ─────
    // Gives Type A recruiter the 5 essential facts in under 10 seconds.
    {
      const g = new THREE.Group();
      g.position.set(80, 0, 224);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.35, 1.2),
        sandstone,
      );
      base.position.y = 0.17;
      g.add(base);
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 3.8, 0.22),
        darkStone,
      );
      stone.position.y = 2.1;
      g.add(stone);
      // Canvas inscription
      const CW = 256,
        CH = 512;
      const can = document.createElement("canvas");
      can.width = CW;
      can.height = CH;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "rgba(20,10,5,0.95)";
      ctx.fillRect(0, 0, CW, CH);
      ctx.strokeStyle = "#ffcc4466";
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, CW - 8, CH - 8);
      const lines = [
        ["ADITYA SRIVASTAVA", "600 13px", "#ffcc44", 128, 52],
        ["BACKEND ARCHITECT", "600 10px", "#ffcc8877", 128, 82],
        ["TRILASOFT · 4 YEARS", "400 9px", "#aaa", 128, 106],
        ["─────────────────", "400 8px", "#44444488", 128, 128],
        ["API GATEWAY · SSO", "400 9px", "#00c8ff99", 128, 156],
        ["MICROSERVICES · CLOUD", "400 9px", "#00c8ff99", 128, 178],
        ["MYSQL MIGRATION", "400 9px", "#00c8ff99", 128, 200],
        ["─────────────────", "400 8px", "#44444488", 128, 222],
        ["DRIVE TO ANY", "400 8px", "#ffffff44", 128, 248],
        ["TEMPLE TO EXPLORE", "400 8px", "#ffffff44", 128, 266],
      ];
      lines.forEach(([t, f, c, x, y]) => {
        ctx.fillStyle = c;
        ctx.font = f + " Share Tech Mono,monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t, x, y);
      });
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 3.5),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(can),
          transparent: true,
        }),
      );
      signMesh.position.set(0, 2.1, 0.13);
      g.add(signMesh);
      s.add(g);
    }

    // ── 2. INCIDENT CHAMBER — sunken dark chamber, accessible via ramp ────────
    // Requires the player to drive south-west off the main spine near the Chakra.
    // Oracle trigger fires when player is within 25 units of center.
    {
      const CX = -75,
        CZ = -101;
      const g = new THREE.Group();
      g.position.set(CX, -5.5, CZ);
      // Sunken floor
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(22, 0.3, 20),
        darkStone,
      );
      floor.position.y = 0.15;
      g.add(floor);
      // Walls (3 sides — open to the north for entry)
      const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a1008 });
      [
        [-10.6, 4, 0, 0.8, 8.5, 20],
        [10.6, 4, 0, 0.8, 8.5, 20],
        [0, 4, 10.6, 22, 8.5, 0.8],
      ].forEach(([x, y, z, w, h, d]) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        wall.position.set(x, y, z);
        g.add(wall);
      });
      // Entry ramp
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.3, 12),
        new THREE.MeshLambertMaterial({ color: 0x2a2015 }),
      );
      ramp.rotation.x = Math.PI * 0.04;
      ramp.position.set(0, -1.8, -14);
      s.add(ramp);
      // Title sprite above chamber
      const titleSp = new THREE.Sprite(
        mkSprite(
          "◈  INCIDENT CHAMBER  ◈",
          "bold 28px serif",
          "#cc5533dd",
          512,
          72,
        ),
      );
      titleSp.scale.set(14, 2.2, 1);
      titleSp.position.set(0, 8, 0);
      g.add(titleSp);
      // Incident inscription slabs
      const incidents =
        window.CITY_ORACLE && window.CITY_ORACLE.incidents
          ? window.CITY_ORACLE.incidents
          : [];
      const slabPositions = [
        [-7, 0, -7],
        [7, 0, -7],
        [-7, 0, 5],
        [7, 0, 5],
      ];
      incidents.forEach((inc, i) => {
        const sp = slabPositions[i];
        if (!sp) return;
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 5.5, 0.3),
          darkStone,
        );
        slab.position.set(sp[0], 3.2, sp[2]);
        g.add(slab);
        // Text on slab face
        const SW = 384,
          SH = 512;
        const sc = document.createElement("canvas");
        sc.width = SW;
        sc.height = SH;
        const sx = sc.getContext("2d");
        sx.fillStyle = "rgba(15,8,3,0.95)";
        sx.fillRect(0, 0, SW, SH);
        sx.strokeStyle = "#cc553355";
        sx.lineWidth = 2;
        sx.strokeRect(4, 4, SW - 8, SH - 8);
        sx.textAlign = "center";
        sx.textBaseline = "top";
        sx.fillStyle = "#cc5533";
        sx.font = "bold 20px serif";
        sx.fillText(inc.title, SW / 2, 24);
        sx.fillStyle = "#ffcc4488";
        sx.font = "italic 13px serif";
        this._wrapText(sx, inc.system, SW / 2, 58, SW - 24, 18);
        sx.fillStyle = "#cc222222";
        sx.fillRect(12, 84, SW - 24, 1);
        sx.fillStyle = "#ddccbb";
        sx.font = "12px serif";
        this._wrapText(sx, "What broke: " + inc.broke, 16, 96, SW - 32, 16);
        sx.fillStyle = "#ffcc4488";
        sx.font = "italic 12px serif";
        this._wrapText(sx, '"' + inc.learned + '"', 16, 280, SW - 32, 16);
        slab.children?.length; // no-op
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(3.0, 5.1),
          new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(sc),
            transparent: true,
          }),
        );
        face.position.set(sp[0], 3.2, sp[2] + 0.17);
        g.add(face);
      });
      // Amber point light inside chamber
      const amber = new THREE.PointLight(0xff6622, 1.6, 32);
      amber.position.set(0, 5, 0);
      g.add(amber);
      s.add(g);
      this._incidentChamberCenter = { x: CX, z: CZ };
    }

    // ── 3. PERSONAL CORNER — far exploration reward ────────────────────────────
    // "Where It Started" — first Java notebook, coffee mug, sketches.
    {
      const g = new THREE.Group();
      g.position.set(181, 0, -395);
      // Stone bench
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 0.4, 1.2),
        sandstone,
      );
      bench.position.set(0, 0.8, 0);
      g.add(bench);
      const leg1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.8, 1.2),
        darkStone,
      );
      leg1.position.set(-1.8, 0.4, 0);
      g.add(leg1);
      const leg2 = leg1.clone();
      leg2.position.set(1.8, 0.4, 0);
      g.add(leg2);
      // Standing stone inscription
      const ist = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 4.2, 2.8),
        darkStone,
      );
      ist.position.set(-3.5, 2.1, 0);
      g.add(ist);
      const IW = 512,
        IH = 384;
      const ic = document.createElement("canvas");
      ic.width = IW;
      ic.height = IH;
      const ix = ic.getContext("2d");
      ix.fillStyle = "rgba(15,8,3,0.95)";
      ix.fillRect(0, 0, IW, IH);
      ix.strokeStyle = "#ffcc4444";
      ix.lineWidth = 2;
      ix.strokeRect(4, 4, IW - 8, IH - 8);
      ix.fillStyle = "#ffcc44";
      ix.font = "bold 28px serif";
      ix.textAlign = "center";
      ix.textBaseline = "middle";
      ix.fillText("Where It Started", IW / 2, 52);
      ix.fillStyle = "#ccbbaa88";
      ix.font = "italic 14px serif";
      ix.fillText("First Java notebook", IW / 2, 110);
      ix.fillText("Coffee mug", IW / 2, 136);
      ix.fillText("Architecture sketches", IW / 2, 162);
      ix.fillText("Early SQL notes", IW / 2, 188);
      ix.fillStyle = "#ccbbaa44";
      ix.font = "400 10px serif";
      ix.fillRect(40, 210, IW - 80, 1);
      ix.fillStyle = "#ddccbb";
      ix.font = "italic 13px serif";
      const pcText =
        "The most important project was not a system.\nIt was becoming capable of building them.";
      pcText
        .split("\n")
        .forEach((line, i) => ix.fillText(line, IW / 2, 234 + i * 20));
      const iface = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 3.8),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(ic),
          transparent: true,
        }),
      );
      iface.rotation.y = Math.PI / 2;
      iface.position.set(-3.37, 2.1, 0);
      g.add(iface);
      // Warm lamp above
      const warm = new THREE.PointLight(0xffaa44, 1.2, 22);
      warm.position.set(0, 8, 0);
      g.add(warm);
      s.add(g);
    }

    // ── 4. WAR STORIES WALL — near Education District ─────────────────────────
    // Five canonical lessons inscribed on sandstone slabs.
    {
      const g = new THREE.Group();
      g.position.set(24, 0, -420);
      const baseWall = new THREE.Mesh(
        new THREE.BoxGeometry(48, 4, 1),
        sandstone,
      );
      baseWall.position.set(0, 2, 0);
      g.add(baseWall);
      const lessons =
        window.CITY_ORACLE && window.CITY_ORACLE.warLessons
          ? window.CITY_ORACLE.warLessons
          : [
              "Every shortcut becomes technical debt.",
              "Integrations fail more than applications.",
              "A migration is a business project.",
              "Most incidents begin as assumptions.",
              "Simplicity survives longer than cleverness.",
            ];
      lessons.forEach((lesson, i) => {
        const ox = (i - 2) * 9.2;
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(7.8, 0.4, 1.4),
          new THREE.MeshLambertMaterial({ color: 0xd4a86a }),
        );
        cap.position.set(ox, 4.2, 0);
        g.add(cap);
        const LC = 256,
          LH = 256;
        const lc = document.createElement("canvas");
        lc.width = LC;
        lc.height = LH;
        const lx2 = lc.getContext("2d");
        lx2.fillStyle = "rgba(160,120,60,0.95)";
        lx2.fillRect(0, 0, LC, LH);
        lx2.fillStyle = "#1a0e05";
        lx2.font = "bold 26px serif";
        lx2.textAlign = "center";
        lx2.textBaseline = "top";
        lx2.fillText(String(i + 1).padStart(2, "0"), LC / 2, 14);
        lx2.fillStyle = "#110904";
        lx2.font = "italic 13px serif";
        lx2.textBaseline = "middle";
        this._wrapText(lx2, lesson, 128, 120, LC - 20, 18);
        const lf = new THREE.Mesh(
          new THREE.PlaneGeometry(7.4, 3.6),
          new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(lc),
            transparent: true,
          }),
        );
        lf.position.set(ox, 2.0, 0.52);
        g.add(lf);
      });
      // Header sprite
      const hsp = new THREE.Sprite(
        mkSprite(
          "◈  WAR STORIES WALL  ◈  LESSONS EARNED IN PRODUCTION",
          "bold 22px serif",
          "#c8a87099",
          768,
          56,
        ),
      );
      hsp.scale.set(22, 1.8, 1);
      hsp.position.set(0, 6, 0);
      g.add(hsp);
      s.add(g);
    }

    // ── 5. TECHNICAL DEBT RUIN — south of entry gate, off the main path ───────
    // Deliberately crumbling. // TODO comments as inscriptions.
    {
      const g = new THREE.Group();
      g.position.set(59, 0, 448);
      const ruinMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
      // Crumbling walls
      [
        [0, 3, 0, 8, 6.5, 0.8],
        [-4.6, 2, 0, 0.8, 4, 0.8],
        [4.8, 1.5, 0, 0.8, 3, 0.8],
        [0, 2, -4.5, 8, 4, 0.8],
      ].forEach(([x, y, z, w, h, d]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ruinMat);
        m.position.set(x, y, z);
        g.add(m);
      });
      // Scaffold (unfinished)
      const scafMat = new THREE.MeshLambertMaterial({ color: 0x5a4020 });
      [
        [-3, 7, -1.5, 0.2, 2, 0.2],
        [3, 7, -1.5, 0.2, 2, 0.2],
        [-3, 8, -1.5, 6.2, 0.2, 0.2],
      ].forEach(([x, y, z, w, h, d]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), scafMat);
        m.position.set(x, y, z);
        g.add(m);
      });
      // Inscription slab with TODO comments
      const TW = 512,
        TH = 320;
      const tc = document.createElement("canvas");
      tc.width = TW;
      tc.height = TH;
      const tx = tc.getContext("2d");
      tx.fillStyle = "rgba(28,18,8,0.96)";
      tx.fillRect(0, 0, TW, TH);
      tx.strokeStyle = "#66440022";
      tx.lineWidth = 2;
      tx.strokeRect(4, 4, TW - 8, TH - 8);
      const todos = [
        "// TODO: refactor",
        "// legacy, do not touch",
        "// this works, do not ask why",
        "// FIXME: has been here since 2022",
        "// I am so sorry",
      ];
      tx.fillStyle = "#cc7744";
      tx.font = "bold 18px monospace";
      tx.textAlign = "left";
      tx.textBaseline = "top";
      todos.forEach((t, i) => {
        tx.fillStyle = i === 4 ? "#996633" : "#cc7744";
        tx.fillText(t, 24, 28 + i * 46);
      });
      const tf = new THREE.Mesh(
        new THREE.PlaneGeometry(5.5, 3.5),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(tc),
          transparent: true,
        }),
      );
      tf.position.set(0, 2.4, 0.42);
      g.add(tf);
      // Label sprite
      const rsp = new THREE.Sprite(
        mkSprite(
          "TECHNICAL DEBT RUIN",
          "bold 22px serif",
          "#cc7744aa",
          512,
          56,
        ),
      );
      rsp.scale.set(12, 1.6, 1);
      rsp.position.set(0, 10, 0);
      g.add(rsp);
      s.add(g);
    }

    // ── 6. HTTP 418 TEAPOT SHRINE ──────────────────────────────────────────────
    // Near the river willow area. No label. Engineers will find it and share it.
    {
      const g = new THREE.Group();
      g.position.set(-168, 0, 32);
      const pot = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 10, 8),
        new THREE.MeshLambertMaterial({
          color: 0xaa4422,
          emissive: 0x220800,
          emissiveIntensity: 0.2,
        }),
      );
      pot.scale.set(1, 0.85, 1);
      pot.position.y = 1.4;
      g.add(pot);
      // Spout
      const spout = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.18, 1.2, 6),
        new THREE.MeshLambertMaterial({ color: 0xaa4422 }),
      );
      spout.rotation.z = Math.PI * 0.35;
      spout.position.set(1.3, 1.8, 0);
      g.add(spout);
      // Handle
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.5, 0.1, 6, 10, Math.PI * 1.1),
        new THREE.MeshLambertMaterial({ color: 0x882211 }),
      );
      handle.rotation.y = Math.PI / 2;
      handle.position.set(-1.2, 1.8, 0);
      g.add(handle);
      // Lid
      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 4),
        new THREE.MeshLambertMaterial({ color: 0xcc5533 }),
      );
      lid.scale.y = 0.45;
      lid.position.y = 2.75;
      g.add(lid);
      // Small plinth
      const plt = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 2.0, 0.35, 8),
        sandstone,
      );
      plt.position.y = 0.17;
      g.add(plt);
      s.add(g);
    }

    // ── 7. READING STONES — three quotes near Education District ──────────────
    {
      const quotes =
        window.CITY_ORACLE && window.CITY_ORACLE.quotes
          ? window.CITY_ORACLE.quotes
          : [];
      quotes.forEach((q, i) => {
        const g = new THREE.Group();
        g.position.set(-112 + i * 56, 0, -425);
        const stone = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 3.5, 2.4),
          darkStone,
        );
        stone.position.y = 2.0;
        g.add(stone);
        const QW = 480,
          QH = 300;
        const qc = document.createElement("canvas");
        qc.width = QW;
        qc.height = QH;
        const qx = qc.getContext("2d");
        qx.fillStyle = "rgba(18,10,4,0.95)";
        qx.fillRect(0, 0, QW, QH);
        qx.strokeStyle = "#ffcc4433";
        qx.lineWidth = 1;
        qx.strokeRect(4, 4, QW - 8, QH - 8);
        qx.fillStyle = "#eeddcc";
        qx.font = "italic 16px serif";
        qx.textAlign = "center";
        this._wrapText(qx, "”" + q.text + "”", QW / 2, 80, QW - 40, 22);
        qx.fillStyle = "#ffcc4488";
        qx.font = "600 12px monospace";
        qx.textBaseline = "middle";
        qx.fillText("— " + q.author, QW / 2, 220);
        const qf = new THREE.Mesh(
          new THREE.PlaneGeometry(2.2, 2.8),
          new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(qc),
            transparent: true,
          }),
        );
        qf.rotation.y = Math.PI / 2;
        qf.position.set(-0.17, 2.0, 0);
        g.add(qf);
        s.add(g);
      });
    }

    // ── 8. FIRST COMMIT STONE — beside Pura Stambha ───────────────────────────
    // “Every architect begins with a small commit.”
    {
      const g = new THREE.Group();
      g.position.set(48, 0, 328);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.3, 1.0),
        sandstone,
      );
      base.position.y = 0.15;
      g.add(base);
      const st = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 4.0, 2.2),
        darkStone,
      );
      st.position.y = 2.2;
      g.add(st);
      const FW = 448,
        FH = 384;
      const fc = document.createElement("canvas");
      fc.width = FW;
      fc.height = FH;
      const fx = fc.getContext("2d");
      fx.fillStyle = "rgba(14,7,2,0.96)";
      fx.fillRect(0, 0, FW, FH);
      fx.strokeStyle = "#ffcc4444";
      fx.lineWidth = 1.5;
      fx.strokeRect(4, 4, FW - 8, FH - 8);
      fx.fillStyle = "#ffcc44";
      fx.font = "bold 16px monospace";
      fx.textAlign = "center";
      fx.textBaseline = "top";
      fx.fillText("FIRST COMMIT", FW / 2, 22);
      fx.fillStyle = "#88aa6688";
      fx.font = "400 12px monospace";
      fx.fillText("January 2022", FW / 2, 52);
      fx.fillStyle = "#ccbbaa44";
      fx.fillRect(24, 76, FW - 48, 1);
      fx.fillStyle = "#aabb99";
      fx.font = "italic 13px serif";
      this._wrapText(
        fx,
        "”Added relocation dashboard service order summary”",
        FW / 2,
        100,
        FW - 40,
        20,
      );
      fx.fillStyle = "#ccbbaa44";
      fx.fillRect(24, 168, FW - 48, 1);
      fx.fillStyle = "#ffcc4477";
      fx.font = "italic 12px serif";
      this._wrapText(
        fx,
        "Every architect begins with a small commit.",
        FW / 2,
        194,
        FW - 40,
        18,
      );
      const ff = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 3.6),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(fc),
          transparent: true,
        }),
      );
      ff.rotation.y = Math.PI / 2;
      ff.position.set(-0.13, 2.2, 0);
      g.add(ff);
      s.add(g);
    }

    // ── 9. CAMPFIRE SCENE — near Dharma Chakra at night ──────────────────────
    // 2–3 monk NPCs around a fire. Discoverable rest point.
    {
      const g = new THREE.Group();
      g.position.set(40, 0, -56);
      // Fire ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 1.0, 8),
        new THREE.MeshBasicMaterial({
          color: 0x331100,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      g.add(ring);
      // Fire sprite (glowing billboard)
      const FC = 64,
        FH2 = 80;
      const fcan = document.createElement("canvas");
      fcan.width = FC;
      fcan.height = FH2;
      const fctx = fcan.getContext("2d");
      const fg = fctx.createRadialGradient(
        FC / 2,
        FH2 * 0.65,
        1,
        FC / 2,
        FH2 * 0.65,
        28,
      );
      fg.addColorStop(0, "#ffffffcc");
      fg.addColorStop(0.15, "#ffdd44bb");
      fg.addColorStop(0.45, "#ff6600aa");
      fg.addColorStop(1, "#00000000");
      fctx.fillStyle = fg;
      fctx.fillRect(0, 0, FC, FH2);
      const fireMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(fcan),
        transparent: true,
      });
      const fireSprite = new THREE.Sprite(fireMat);
      fireSprite.scale.set(1.4, 1.8, 1);
      fireSprite.position.set(0, 0.9, 0);
      g.add(fireSprite);
      this._campfire = { mat: fireMat, phase: 0 };
      // Fire light
      const fireLight = new THREE.PointLight(0xff6622, 0, 18);
      fireLight.position.set(0, 1.2, 0);
      g.add(fireLight);
      this._campfireLight = fireLight;
      // Monk silhouettes (3 seated figures)
      const monkMat = new THREE.MeshLambertMaterial({ color: 0x1a0e08 });
      [
        [1.6, 0, 1.2],
        [-1.5, 0, 1.0],
        [0.2, 0, -1.5],
      ].forEach(([mx, my, mz], mi) => {
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.35, 0.95, 6),
          monkMat,
        );
        body.position.set(mx, 0.5, mz);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 5, 4),
          monkMat,
        );
        head.position.set(mx, 1.18, mz);
        g.add(body);
        g.add(head);
      });
      s.add(g);
    }

    // ── 10. 404 SIGN — road to nowhere, near Pura Stambha SW ─────────────────
    {
      const g = new THREE.Group();
      g.position.set(-59, 0, 459);
      // Simple sign post
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 3.5, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a2a1a }),
      );
      post.position.y = 1.75;
      g.add(post);
      const SW = 384,
        SH = 192;
      const sc2 = document.createElement("canvas");
      sc2.width = SW;
      sc2.height = SH;
      const sx2 = sc2.getContext("2d");
      sx2.fillStyle = "rgba(18,8,2,0.94)";
      sx2.fillRect(0, 0, SW, SH);
      sx2.strokeStyle = "#cc7744";
      sx2.lineWidth = 3;
      sx2.strokeRect(5, 5, SW - 10, SH - 10);
      sx2.fillStyle = "#cc5522";
      sx2.font = "bold 64px monospace";
      sx2.textAlign = "center";
      sx2.textBaseline = "middle";
      sx2.fillText("404", SW / 2, SH * 0.42);
      sx2.fillStyle = "#88664466";
      sx2.font = "italic 14px serif";
      sx2.fillText("The road leads nowhere.", SW / 2, SH * 0.72);
      sx2.fillStyle = "#66442233";
      sx2.font = "11px serif";
      sx2.fillText("Some roads are honest about it.", SW / 2, SH * 0.88);
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 1.75),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(sc2),
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      board.position.y = 3.6;
      g.add(board);
      s.add(g);
    }

    // ── 11. ARCHITECT'S GARDEN — far north exploration reward ────────────────
    // Contains: Contact Stone + Unseen System foundation
    {
      const gx2 = new THREE.Group();
      gx2.position.set(-32, 0, -420);
      // Garden floor (stone tiles)
      const gfloor = new THREE.Mesh(
        new THREE.BoxGeometry(22, 0.18, 18),
        new THREE.MeshLambertMaterial({ color: 0xddc9a0 }),
      );
      gfloor.position.y = 0.09;
      gx2.add(gfloor);
      // Low perimeter wall
      [
        [-11.4, 0.45, 0, 0.5, 0.9, 18],
        [11.4, 0.45, 0, 0.5, 0.9, 18],
        [0, 0.45, -9.4, 22, 0.9, 0.5],
        [0, 0.45, 9.4, 10, 0.9, 0.5],
      ].forEach(([x, y, z, w, h, d]) => {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sandstone);
        wm.position.set(x, y, z);
        gx2.add(wm);
      });
      // Garden header sprite
      const ghSp = new THREE.Sprite(
        mkSprite(
          "◈  ARCHITECT'S GARDEN  ◈",
          "bold 28px serif",
          "#ffcc44cc",
          512,
          64,
        ),
      );
      ghSp.scale.set(14, 1.8, 1);
      ghSp.position.set(0, 5.5, 0);
      gx2.add(ghSp);
      // Blueprint diagrams on ground
      const BW = 512,
        BH = 512;
      const bc = document.createElement("canvas");
      bc.width = BW;
      bc.height = BH;
      const bx = bc.getContext("2d");
      bx.fillStyle = "rgba(5,18,35,0.92)";
      bx.fillRect(0, 0, BW, BH);
      bx.strokeStyle = "#4488cc55";
      bx.lineWidth = 1.5;
      [
        [100, 100, 80, 60],
        [260, 100, 100, 70],
        [180, 240, 120, 80],
        [100, 360, 80, 60],
        [320, 340, 90, 65],
      ].forEach(([rx, ry, rw, rh]) => {
        bx.strokeRect(rx, ry, rw, rh);
        bx.fillStyle = "#4488cc22";
        bx.fillRect(rx, ry, rw, rh);
        bx.fillStyle = "#4488cc88";
        bx.font = "9px monospace";
        bx.textAlign = "center";
        bx.fillText("SVC", rx + rw / 2, ry + rh / 2 + 4);
      });
      bx.strokeStyle = "#4488cc33";
      [
        [140, 160, 260, 135],
        [260, 140, 295, 285],
        [180, 320, 180, 280],
        [295, 375, 140, 395],
      ].forEach(([x1, y1, x2, y2]) => {
        bx.beginPath();
        bx.moveTo(x1, y1);
        bx.lineTo(x2, y2);
        bx.stroke();
      });
      const bpl = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 16),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(bc),
          transparent: true,
          depthWrite: false,
        }),
      );
      bpl.rotation.x = -Math.PI / 2;
      bpl.position.set(0, 0.12, 0);
      gx2.add(bpl);
      // Contact Stone
      {
        const cs = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 4.5, 2.8),
          darkStone,
        );
        cs.position.set(6, 2.5, -3);
        gx2.add(cs);
        const CW2 = 512,
          CH2 = 512;
        const cc = document.createElement("canvas");
        cc.width = CW2;
        cc.height = CH2;
        const cx2 = cc.getContext("2d");
        cx2.fillStyle = "rgba(12,6,2,0.96)";
        cx2.fillRect(0, 0, CW2, CH2);
        cx2.strokeStyle = "#ffcc4466";
        cx2.lineWidth = 2;
        cx2.strokeRect(4, 4, CW2 - 8, CH2 - 8);
        cx2.fillStyle = "#ffcc44";
        cx2.font = "bold 22px serif";
        cx2.textAlign = "center";
        cx2.textBaseline = "top";
        cx2.fillText("CONTACT STONE", CW2 / 2, 24);
        cx2.fillStyle = "#ccbbaa44";
        cx2.fillRect(40, 60, CW2 - 80, 1);
        cx2.fillStyle = "#aabbdd";
        cx2.font = "400 16px monospace";
        cx2.fillText("developer@redskymobility.com", CW2 / 2, 90);
        cx2.fillStyle = "#ffcc4466";
        cx2.font = "italic 13px serif";
        this._wrapText(
          cx2,
          "You found the Architect's Garden. Few do.",
          CW2 / 2,
          160,
          CW2 - 60,
          20,
        );
        this._wrapText(
          cx2,
          "The city is not the portfolio.",
          CW2 / 2,
          230,
          CW2 - 60,
          20,
        );
        this._wrapText(
          cx2,
          "The city is the evidence.",
          CW2 / 2,
          264,
          CW2 - 60,
          20,
        );
        const cf = new THREE.Mesh(
          new THREE.PlaneGeometry(2.6, 4.2),
          new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(cc),
            transparent: true,
          }),
        );
        cf.rotation.y = Math.PI / 2;
        cf.position.set(5.87, 2.5, -3);
        gx2.add(cf);
        const cLight = new THREE.PointLight(0xffcc44, 1.0, 14);
        cLight.position.set(4, 5, -3);
        gx2.add(cLight);
      }
      s.add(gx2);
    }

    // ── 12. UNSEEN SYSTEM — foundation only, near Architect's Garden ─────────
    // “Still under construction.” Future ambition visible.
    {
      const g = new THREE.Group();
      g.position.set(56, 0, -420);
      const fndMat = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
      // Foundation slab
      const fslab = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 9), fndMat);
      fslab.position.y = 0.3;
      g.add(fslab);
      // Partial wall stubs
      [
        [0, 1.8, -4.4, 9, 3.6, 0.55],
        [-4.4, 1.2, 0, 0.55, 2.4, 9],
        [4.4, 0.9, 0, 0.55, 1.8, 9],
      ].forEach(([x, y, z, w, h, d]) => {
        const w2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fndMat);
        w2.position.set(x, y, z);
        g.add(w2);
      });
      // Scaffolding
      const scafM = new THREE.MeshLambertMaterial({ color: 0x6a5030 });
      [
        [-3.5, 5, -3.5, 0.2, 2.5, 0.2],
        [3.5, 5, -3.5, 0.2, 2.5, 0.2],
        [-3.5, 6, -3.5, 7.2, 0.2, 0.2],
      ].forEach(([x, y, z, w, h, d]) => {
        const sc = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), scafM);
        sc.position.set(x, y, z);
        g.add(sc);
      });
      // Sign
      const usp = new THREE.Sprite(
        mkSprite(
          "STILL UNDER CONSTRUCTION",
          "bold 20px serif",
          "#ffcc4488",
          512,
          52,
        ),
      );
      usp.scale.set(12, 1.4, 1);
      usp.position.set(0, 9, 0);
      g.add(usp);
      s.add(g);
    }

    // ── 13. FAILURES DISTRICT LABEL — SW corner near Tech Debt Ruin ──────────
    // Tonally honest zone. Label only — no separate structures needed here.
    {
      const g = new THREE.Group();
      g.position.set(-80, 0, 467);
      const stone = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 2.5, 3.5),
        new THREE.MeshLambertMaterial({ color: 0x1e1408 }),
      );
      stone.position.y = 1.5;
      g.add(stone);
      const FDW = 560,
        FDH = 224;
      const fdc = document.createElement("canvas");
      fdc.width = FDW;
      fdc.height = FDH;
      const fdx = fdc.getContext("2d");
      fdx.fillStyle = "rgba(12,7,3,0.96)";
      fdx.fillRect(0, 0, FDW, FDH);
      fdx.strokeStyle = "#663322";
      fdx.lineWidth = 2;
      fdx.strokeRect(4, 4, FDW - 8, FDH - 8);
      fdx.fillStyle = "#aa6644";
      fdx.font = "bold 22px serif";
      fdx.textAlign = "center";
      fdx.textBaseline = "top";
      fdx.fillText("LESSONS DISTRICT", FDW / 2, 22);
      fdx.fillStyle = "#88554433";
      fdx.fillRect(40, 56, FDW - 80, 1);
      fdx.fillStyle = "#ccbbaa";
      fdx.font = "italic 14px serif";
      fdx.textBaseline = "middle";
      fdx.fillText(
        "Every engineer has a district they would build",
        FDW / 2,
        92,
      );
      fdx.fillText("differently today. This is that district.", FDW / 2, 116);
      fdx.fillStyle = "#aa664466";
      fdx.font = "11px monospace";
      fdx.fillText(
        "Tech Debt Ruin  ·  Incident Chamber  ·  404 Road",
        FDW / 2,
        164,
      );
      const fdf = new THREE.Mesh(
        new THREE.PlaneGeometry(3.3, 2.1),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(fdc),
          transparent: true,
        }),
      );
      fdf.rotation.y = Math.PI / 2;
      fdf.position.set(-0.14, 1.5, 0);
      g.add(fdf);
      s.add(g);
    }

    // ── 14. DEDICATION STONE — far, solitary ─────────────────────────────────
    // For every user who never knew the system was running.
    {
      const g = new THREE.Group();
      g.position.set(75, 0, -195);
      const dslab = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 3.0, 2.0),
        darkStone,
      );
      dslab.position.y = 1.7;
      g.add(dslab);
      const DW = 400,
        DH = 256;
      const dc = document.createElement("canvas");
      dc.width = DW;
      dc.height = DH;
      const dx = dc.getContext("2d");
      dx.fillStyle = "rgba(12,7,2,0.95)";
      dx.fillRect(0, 0, DW, DH);
      dx.strokeStyle = "#ffcc4422";
      dx.lineWidth = 1;
      dx.strokeRect(4, 4, DW - 8, DH - 8);
      dx.fillStyle = "#ddccaa";
      dx.font = "italic 15px serif";
      dx.textAlign = "center";
      dx.textBaseline = "middle";
      this._wrapText(
        dx,
        "”For every user who never knew the system was running.”",
        DW / 2,
        90,
        DW - 40,
        22,
      );
      dx.fillStyle = "#ffcc4433";
      dx.font = "600 11px monospace";
      dx.fillText("— A.S.", DW / 2, 190);
      const df = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 2.4),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(dc),
          transparent: true,
        }),
      );
      df.rotation.y = Math.PI / 2;
      df.position.set(-0.13, 1.7, 0);
      g.add(df);
      s.add(g);
    }
  }

  // ── CAREER TIMELINE PATH — subtle golden thread through buildings 2022→2025 ─
  _buildCareerPath() {
    const blds = (window.CITY_DATA?.buildings || [])
      .filter((b) => b.year)
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
    if (blds.length < 2) return;
    const pts = blds.map((b) => new THREE.Vector3(b.pos[0], 0.14, b.pos[1]));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.14,
    });
    this.scene.add(
      new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat),
    );
    // Year node sprites at first building of each year
    let lastYear = "";
    blds.forEach((b) => {
      if (b.year === lastYear) return;
      lastYear = b.year;
      const can = document.createElement("canvas");
      can.width = 96;
      can.height = 32;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "#ffcc4466";
      ctx.font = "600 16px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.year, 48, 16);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(can),
          transparent: true,
          depthWrite: false,
        }),
      );
      sp.scale.set(4.2, 1.4, 1);
      sp.position.set(b.pos[0], 0.9, b.pos[1] - 7);
      this.scene.add(sp);
    });
  }

  // ── STACK TRACE OBELISK — near Vishwakarma Shala [45,56] ─────────────────
  _buildStackTraceObelisk() {
    const s = this.scene;
    const g = new THREE.Group();
    g.position.set(240, 0, 184);
    const sandstone = new THREE.MeshLambertMaterial({ color: 0xc8a870 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a0e08 });
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.45, 2.4),
      sandstone,
    );
    base.position.y = 0.22;
    g.add(base);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.05, 9.0, 1.05), dark);
    pillar.position.y = 4.95;
    g.add(pillar);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0, 0.72, 1.5, 4),
      new THREE.MeshLambertMaterial({
        color: 0xffcc44,
        emissive: 0xcc8800,
        emissiveIntensity: 0.35,
      }),
    );
    cap.position.y = 9.85;
    g.add(cap);
    const TW = 256,
      TH = 512;
    const tc = document.createElement("canvas");
    tc.width = TW;
    tc.height = TH;
    const tx = tc.getContext("2d");
    tx.fillStyle = "rgba(10,5,1,0.95)";
    tx.fillRect(0, 0, TW, TH);
    tx.strokeStyle = "#cc442222";
    tx.lineWidth = 1;
    tx.strokeRect(2, 2, TW - 4, TH - 4);
    const rows = [
      ["STACK TRACE", "#cc4422", "bold 13px", 22],
      ["Exception in", "#aabb99", "10px", 42],
      ['thread "main"', "#aabb99", "10px", 56],
      ["NullPointerException", "#ff6644", "9px", 74],
      ["", "", "", 0],
      ["  at ServiceOrder", "#88aa88", "9px", 96],
      ["  .resolve(:142)", "#88aa88", "9px", 110],
      ["  at Relocation", "#88aa88", "9px", 124],
      ["  Controller(:88)", "#88aa88", "9px", 138],
      ["  at Dispatcher", "#88aa88", "9px", 152],
      ["  Servlet(:1049)", "#88aa88", "9px", 166],
      ["", "", "", 0],
      ["Caused by:", "#cc4422", "bold 9px", 192],
      ["MQConnectionException", "#ff8844", "9px", 208],
      ["Channel closed", "#ff8844", "9px", 222],
      ["", "", "", 0],
      ["─────────────", "#44333322", "9px", 252],
      ["Incident: IBM-MQ", "#ffcc4477", "italic 9px", 272],
      ["Bridge (2023)", "#ffcc4477", "italic 9px", 286],
      ["Resolved: 4 hours", "#88cc8877", "9px", 302],
    ];
    rows.forEach(([text, color, font, y]) => {
      if (!text) return;
      tx.fillStyle = color;
      tx.font = font + " monospace";
      tx.textAlign = "center";
      tx.textBaseline = "top";
      tx.fillText(text, TW / 2, y);
    });
    [0, Math.PI].forEach((ang) => {
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 8.6),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(tc),
          transparent: true,
        }),
      );
      face.rotation.y = ang;
      face.position.set(Math.sin(ang) * 0.55, 4.95, Math.cos(ang) * 0.55);
      g.add(face);
    });
    s.add(g);
  }

  // ── NPC WANDERERS — 8 robed figures on looping waypoint paths ─────────────
  _buildNPCs() {
    const s = this.scene;
    const mkMonk = (col, hc) => {
      const g2 = new THREE.Group();
      const bM = new THREE.MeshLambertMaterial({ color: col });
      const hM = new THREE.MeshLambertMaterial({ color: hc });
      const robe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.45, 1.1, 6),
        bM,
      );
      robe.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), hM);
      head.position.y = 1.38;
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.38, 6), bM);
      hood.position.y = 1.62;
      hood.rotation.z = Math.PI;
      g2.add(robe);
      g2.add(head);
      g2.add(hood);
      return g2;
    };
    const defs = [
      {
        pts: [
          [14, -9],
          [9, -14],
          [-9, -14],
          [-14, -9],
          [-14, 9],
          [-9, 14],
          [9, 14],
          [14, 9],
        ],
        spd: 0.022,
        col: 0x3a2218,
        hc: 0xc8a878,
      },
      {
        pts: [
          [22, -7],
          [15, -22],
          [-7, -22],
          [-22, -7],
          [-22, 7],
          [-7, 22],
          [15, 22],
          [22, 7],
        ],
        spd: 0.016,
        col: 0x2a1a10,
        hc: 0xbb9968,
      },
      {
        pts: [
          [30, -88],
          [45, -90],
          [45, -106],
          [30, -106],
        ],
        spd: 0.018,
        col: 0x442a1a,
        hc: 0xc8a878,
      },
      {
        pts: [
          [-25, -90],
          [-42, -88],
          [-42, -104],
          [-25, -104],
        ],
        spd: 0.015,
        col: 0x3a2218,
        hc: 0xbb9968,
      },
      {
        pts: [
          [-82, -28],
          [-96, -30],
          [-96, -42],
          [-82, -42],
        ],
        spd: 0.016,
        col: 0x2a1a10,
        hc: 0xc8a878,
      },
      {
        pts: [
          [-10, 78],
          [10, 78],
          [10, 94],
          [-10, 94],
        ],
        spd: 0.02,
        col: 0x3a2218,
        hc: 0xbb9968,
      },
      {
        pts: [
          [-20, -4],
          [-32, 2],
          [-40, 8],
          [-32, 14],
          [-20, 10],
        ],
        spd: 0.011,
        col: 0x1a2a38,
        hc: 0xaa8868,
      },
      {
        pts: [
          [-14, 50],
          [14, 50],
          [14, 62],
          [-14, 62],
        ],
        spd: 0.024,
        col: 0x442a1a,
        hc: 0xc8a878,
      },
    ];
    this._npcs = defs.map((def) => {
      const mesh = mkMonk(def.col, def.hc);
      mesh.position.set(def.pts[0][0], 0, def.pts[0][1]);
      s.add(mesh);
      return {
        mesh,
        pts: def.pts,
        wi: 0,
        t: Math.random() * 0.8,
        spd: def.spd,
      };
    });
  }

  updateNPCs(dt) {
    if (!this._npcs) return;
    for (const n of this._npcs) {
      n.t += n.spd * dt * 60;
      if (n.t >= 1) {
        n.t -= 1;
        n.wi = (n.wi + 1) % n.pts.length;
      }
      const c = n.pts[n.wi],
        nx = n.pts[(n.wi + 1) % n.pts.length];
      const dx = nx[0] - c[0],
        dz = nx[1] - c[1];
      n.mesh.position.x = c[0] + dx * n.t;
      n.mesh.position.z = c[1] + dz * n.t;
      if (Math.abs(dx) + Math.abs(dz) > 0.01)
        n.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  // ── WANDERING MONK — white-robed, follows all buildings chronologically 8min ─
  _buildWanderingMonk() {
    const s = this.scene;
    const blds = (window.CITY_DATA?.buildings || [])
      .filter((b) => b.year)
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
    if (!blds.length) return;
    const g = new THREE.Group();
    const wM = new THREE.MeshLambertMaterial({ color: 0xf5e8cc });
    const hM = new THREE.MeshLambertMaterial({ color: 0xe8c898 });
    const robe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.46, 1.2, 7),
      wM,
    );
    robe.position.y = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 6, 5), hM);
    head.position.y = 1.42;
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 7), wM);
    hood.position.y = 1.65;
    hood.rotation.z = Math.PI;
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.046, 2.1, 5),
      new THREE.MeshLambertMaterial({ color: 0x6a4020 }),
    );
    staff.position.set(0.5, 1.05, 0);
    staff.rotation.z = -0.1;
    g.add(robe);
    g.add(head);
    g.add(hood);
    g.add(staff);
    g.position.set(blds[0].pos[0] + 5, 0, blds[0].pos[1] + 5);
    s.add(g);
    this._wanderingMonk = {
      mesh: g,
      blds,
      wi: 0,
      t: 0,
      segTime: 480 / blds.length,
    };
  }

  updateWanderingMonk(dt) {
    const wm = this._wanderingMonk;
    if (!wm) return;
    wm.t += dt / wm.segTime;
    if (wm.t >= 1) {
      wm.t -= 1;
      wm.wi = (wm.wi + 1) % wm.blds.length;
    }
    const c = wm.blds[wm.wi],
      nx = wm.blds[(wm.wi + 1) % wm.blds.length];
    const dx = nx.pos[0] - c.pos[0],
      dz = nx.pos[1] - c.pos[1];
    wm.mesh.position.x = c.pos[0] + dx * wm.t + 5;
    wm.mesh.position.z = c.pos[1] + dz * wm.t + 5;
    if (Math.abs(dx) + Math.abs(dz) > 0.1)
      wm.mesh.rotation.y = Math.atan2(dx, dz);
  }

  // ── GOLDEN CONNECTION WEB — fires on all-17 completion ─────────────────────
  // Draws golden Three.js lines between architecturally connected buildings.
  showConnectionWeb() {
    if (this._connWebShown) return;
    this._connWebShown = true;
    const buildings = window.CITY_DATA?.buildings || [];
    const posMap = {};
    buildings.forEach((b) => {
      posMap[b.id] = { x: b.pos[0], z: b.pos[1] };
    });

    const edges = [
      ["pura-stambha", "vayu-rath"],
      ["pura-stambha", "jyotish-vedha"],
      ["pura-stambha", "setu-nagara"],
      ["pura-stambha", "brahma-kund"],
      ["pura-stambha", "maya-sabha"],
      ["jyotish-vedha", "maya-sabha"],
      ["brahma-kund", "setu-nagara"],
      ["brahma-kund", "maya-sabha"],
      ["maya-sabha", "surya-dwara"],
      ["maya-sabha", "vishwakarma-shala"],
      ["surya-dwara", "lakshmi-prasad"],
      ["surya-dwara", "akasha-mandapa"],
      ["lakshmi-prasad", "vishwakarma-shala"],
      ["vishwakarma-shala", "akasha-mandapa"],
      ["vishwakarma-shala", "maya-sabha"],
    ];

    const lineMats = [];
    edges.forEach(([a, b]) => {
      const pa = posMap[a],
        pb = posMap[b];
      if (!pa || !pb) return;
      const pts = [
        new THREE.Vector3(pa.x, 9, pa.z),
        new THREE.Vector3(pb.x, 9, pb.z),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0,
      });
      this.scene.add(new THREE.Line(geo, mat));
      lineMats.push(mat);
    });

    // Fade in over 3s, hold 24s, fade out over 3s
    let elapsed = 0;
    const tick = () => {
      elapsed += 0.05;
      const op =
        elapsed < 3
          ? elapsed / 3
          : elapsed > 27
            ? Math.max(0, 1 - (elapsed - 27) / 3)
            : 1;
      lineMats.forEach((m) => {
        m.opacity = op * 0.82;
      });
      if (elapsed < 30) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── CAMPFIRE FLICKER — called from World update ──────────────────────────────
  updateHiddenAreas(isNight, now) {
    if (this._campfireLight) {
      const tgt = isNight ? 2.2 + Math.sin(now * 7.3 + 1.2) * 0.6 : 0;
      this._campfireLight.intensity +=
        (tgt - this._campfireLight.intensity) * 0.06;
    }
    if (this._campfire) {
      const s = isNight ? 0.88 + Math.sin(now * 5.8) * 0.08 : 0;
      this._campfire.mat.opacity += (s - this._campfire.mat.opacity) * 0.05;
    }
  }

  // ── TEXT WRAP HELPER ────────────────────────────────────────────────────────
  _wrapText(ctx, text, cx, cy, maxW, lineH) {
    const words = text.split(" ");
    let line = "";
    let y = cy;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + " ";
      if (ctx.measureText(test).width > maxW && i > 0) {
        ctx.fillText(line.trim(), cx, y);
        line = words[i] + " ";
        y += lineH;
      } else {
        line = test;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), cx, y);
  }
}
