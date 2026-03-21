// ── CITY ENGINE v5 ────────────────────────────────────────────────────────────
// Bruno Simon inspired: low-poly cohesive palette, proper car, tight physics,
// weather system (sun/rain/night/fog/snow), checkpoint markers, city layout

window.CityEngine = (function () {
  // ── STATE ────────────────────────────────────────────────────────────────
  let scene, camera, renderer, clock;
  let animId;

  // Car
  let carGroup, carBodyMesh;
  let wheelGroups = []; // 4 wheel groups — we spin the group
  let carX = 0,
    carZ = 6;
  let carAngle = 0;
  let carSpeed = 0;
  let keys = {};
  let crashCooldown = 0;
  let prevSpeed = 0;

  // Lights
  let sunLight, fillLight, ambLight, hemiLight;
  let carHL, carHR, carTL, carTR;
  let waveLines = [];
  let isNight = true;

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

  // Audio
  let audioCtx = null,
    audioStarted = false;
  let engOsc,
    engGain,
    musicGain,
    musicStarted = false;

  // Physics — scalar, no drift
  const ACCEL = 0.018;
  const BRAKE = 0.028;
  const DECEL = 0.007;
  const MAX_SPD = 0.28;
  const TURN = 0.042;
  const PROX = 22; // generous — show notification well before reaching building
  const CAR_HW = 0.85;
  const CAR_HD = 1.3;

  // ── PALETTE — Bruno Simon EXACT warm peach + cool blue shadow ────────────
  const P = {
    // Ground: warm sandy peach like Bruno Simon
    ground: 0xd4956a, // warm sandy peach
    groundAlt: 0xc8845a, // slightly darker variation
    road: 0xb87a52, // road slightly darker than ground, not blue
    sidewalk: 0xcf9070, // pavement = warm sandstone
    roadLine: 0xf5e642, // yellow dashes

    // Buildings: warm terracotta family — ALL warm, Bruno Simon style
    b1: 0xc9603a,
    b2: 0xd4844a,
    b3: 0xe8a84a, // red/orange/ochre
    b4: 0xa05030,
    b5: 0xcc7040,
    b6: 0xb86030, // dark reds
    b7: 0xe09050,
    b8: 0xba6840, // warm amber

    roofDark: 0x7a3a22, // dark brown roof
    roofRed: 0x993320, // dark red roof
    roofGrey: 0x8a5a3a, // warm brown roof

    treeTrunk: 0x7a4a22,
    treeLeaf1: 0x8a7040, // muted olive — Bruno's trees are NOT bright green
    treeLeaf2: 0x6a5830, // darker muted
    treeLeaf3: 0x9a8050, // warm tan
    treeSpike: 0x5a4828, // dark spike bushes

    lampPole: 0x8a6a4a,
    lampHead: 0xffeeaa,

    carBody: 0xcc2200, // BRIGHT RED — Bruno Simon exact
    carDark: 0x881400,
    carBlack: 0x1a1510,
    carGlass: 0x7799bb,
    carChrome: 0x999988,
    carTyre: 0x151210,
    carHub: 0xcc2200, // red hub

    water: 0x3355aa,
  };

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init(canvas) {
    const W = window.innerWidth,
      H = window.innerHeight;

    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 500);
    camera.position.set(0, 9, 20);
    camera.lookAt(0, 0, 6);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.15;

    applyWeather("night");
    buildGround();
    buildRoads();
    buildAllBuildings();
    buildTrees();
    buildLamps();
    buildCenterpiece();
    buildCar();
    buildCheckpoints();
    buildAtmosphere();
    buildWaveLines();

    setupControls();
    window.addEventListener("resize", onResize);

    // Trigger first proximity check after a short delay
    setTimeout(() => checkProximity(), 300);

    animate();
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
        bg: 0x1a1030,
        fog: 0x1a1030,
        fogD: 0.008,
        sun: 0xff9966,
        sunI: 1.4,
        fill: 0x3344bb,
        fillI: 1.2,
        amb: 0x110806,
        ambI: 0.3,
        exp: 1.15,
      },
      day: {
        bg: 0xffe0c0,
        fog: 0xffe0c0,
        fogD: 0.004,
        sun: 0xffcc88,
        sunI: 2.4,
        fill: 0x4466cc,
        fillI: 0.7,
        amb: 0x221408,
        ambI: 0.3,
        exp: 1.0,
      },
      sunset: {
        bg: 0xff7040,
        fog: 0xff7040,
        fogD: 0.006,
        sun: 0xff5522,
        sunI: 2.6,
        fill: 0x6633cc,
        fillI: 1.0,
        amb: 0x330800,
        ambI: 0.2,
        exp: 1.05,
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
    if (renderer) renderer.toneMappingExposure = cfg.exp;

    isNight = w === "night";
    updateCarLights();
    updateWindowLights();
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
    // Bruno Simon uses TWO directional lights, not hemisphere
    // Key: warm peach from top-front-right
    sunLight = new THREE.DirectionalLight(0xff9966, 1.4);
    sunLight.position.set(40, 60, 20); // top-right-front
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.bias = -0.001;
    scene.add(sunLight);

    // Fill: cool blue from bottom-left-back — creates purple shadows
    fillLight = new THREE.DirectionalLight(0x3344bb, 1.2);
    fillLight.position.set(-40, -20, -30);
    scene.add(fillLight);

    // Ambient: very low — scene needs depth
    ambLight = new THREE.AmbientLight(0x110806, 0.3);
    scene.add(ambLight);
  }

  // ── GROUND ───────────────────────────────────────────────────────────────
  function buildGround() {
    buildLightingObjects();

    // ── BASE GROUND — warm sandy peach like Bruno Simon ──
    const grassMat = new THREE.MeshLambertMaterial({ color: P.ground });
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(240, 0.4, 240),
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

    // ── WATER ─ flat deep-blue plane with slightly elevated shore ──
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x2244aa });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    scene.add(water);

    // Shore — slightly lighter water near edges
    const shoreMat = new THREE.MeshLambertMaterial({
      color: 0x3355bb,
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
    // Roads should be SUBTLY darker than ground, not harshly different color
    const roadMat = new THREE.MeshLambertMaterial({ color: 0xb87850 }); // darker sandy
    const swMat = new THREE.MeshLambertMaterial({ color: 0xcc9870 }); // warm pavement
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xf5e050 }); // yellow

    function road(x1, z1, x2, z2, w) {
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.sqrt(dx * dx + dz * dz),
        ang = Math.atan2(dx, dz);

      // Sidewalk strip
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(w + 3.0, 0.22, len),
        swMat,
      );
      sw.rotation.y = ang;
      sw.position.set((x1 + x2) / 2, 0.11, (z1 + z2) / 2);
      sw.receiveShadow = true;
      scene.add(sw);

      // Road surface
      const rd = new THREE.Mesh(new THREE.BoxGeometry(w, 0.23, len), roadMat);
      rd.rotation.y = ang;
      rd.position.set((x1 + x2) / 2, 0.12, (z1 + z2) / 2);
      rd.receiveShadow = true;
      scene.add(rd);

      // Dashed center line
      const segs = Math.floor(len / 4.0);
      for (let s = 0; s < segs; s++) {
        const t = (s + 0.5) / segs;
        const dl = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.01, 1.5),
          lineMat,
        );
        dl.rotation.y = ang;
        dl.position.set(x1 + dx * t, 0.24, z1 + dz * t);
        scene.add(dl);
      }
    }

    const RW = 10;
    road(-12, -50, -12, 36, RW);
    road(12, -50, 12, 36, RW);
    road(-56, 0, 56, 0, RW);
    road(-56, 22, 56, 22, RW);
    road(-56, -33, 56, -33, RW);
    road(30, 0, 30, 22, RW);
    road(-30, 0, -30, 22, RW);

    const rRoadMat = new THREE.MeshLambertMaterial({ color: 0xb87850 });
    const rIslandMat = new THREE.MeshLambertMaterial({ color: P.ground });

    // Main roundabout
    const rGeo = new THREE.RingGeometry(9.5, 15, 24);
    const rMesh = new THREE.Mesh(rGeo, rRoadMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.y = 0.13;
    scene.add(rMesh);
    const isl = new THREE.Mesh(
      new THREE.CylinderGeometry(9.5, 9.5, 0.32, 16),
      rIslandMat,
    );
    isl.position.y = 0.16;
    scene.add(isl);

    // Education roundabout
    const eGeo = new THREE.RingGeometry(5.5, 8.5, 18);
    const eMesh = new THREE.Mesh(eGeo, rRoadMat);
    eMesh.rotation.x = -Math.PI / 2;
    eMesh.position.set(0, 0.13, -33);
    scene.add(eMesh);
    const eIsl = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.5, 0.3, 14),
      rIslandMat,
    );
    eIsl.position.set(0, 0.15, -33);
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
  function buildBuilding(b) {
    const g = new THREE.Group();
    g.position.set(b.pos[0], 0, b.pos[1]);

    const w = b.size[0],
      d = b.size[1],
      h = b.height;
    const bColor = pickBuildingColor(b);
    const gc = pc(b.glowColor);

    // Foundation pad (warm sandstone)
    g.add(box(w + 3.5, 0.3, d + 3.5, P.sidewalk, [0, 0.15, 0]));

    // Main body — MeshLambertMaterial for consistent low-poly look
    const bodyMat = new THREE.MeshLambertMaterial({
      color: bColor,
      emissive: gc,
      emissiveIntensity: isNight ? 0.06 : 0.0,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2 + 0.32;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Setback top floor (architectural detail)
    if (h > 6) {
      const sbH = h * 0.35;
      const sbMat = new THREE.MeshLambertMaterial({
        color: darken(bColor, 0.15),
      });
      const sb = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, sbH, d * 0.7),
        sbMat,
      );
      sb.position.y = h + sbH / 2 + 0.32;
      sb.castShadow = true;
      g.add(sb);
    }

    // Roof — flat slab in contrasting color
    const rColor = b.isHero
      ? P.roofDark
      : Math.random() > 0.5
        ? P.roofDark
        : P.roofRed;
    g.add(box(w + 0.3, 0.55, d + 0.3, rColor, [0, h + 0.32 + 0.27, 0]));

    // Rooftop details
    if (b.isHero) {
      // Antenna tower
      g.add(
        box(0.22, h * 0.35, 0.22, 0x334455, [
          0,
          h + 0.32 + 0.55 + h * 0.175,
          0,
        ]),
      );
      // Glow orb
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0), // low-poly octahedron!
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      orb.position.y = h + 0.32 + 0.55 + h * 0.38;
      orb.userData.isOrb = true;
      g.add(orb);
      // Rings
      [1.1, 1.7].forEach((r, i) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.06, 4, 16), // low-poly torus
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.5 - i * 0.1,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = orb.position.y;
        ring.userData.heroRing = true;
        ring.userData.ri = i;
        g.add(ring);
      });
      g.add(ptLight(gc, isNight ? 5 : 0.6, 22, [0, orb.position.y, 0]));
    } else if (b.isEducation) {
      // Pointed spire
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.5, h * 0.5, 4),
        new THREE.MeshLambertMaterial({ color: P.roofDark }),
      );
      spire.position.y = h + 0.32 + 0.55 + h * 0.25;
      spire.rotation.y = Math.PI / 4;
      spire.castShadow = true;
      g.add(spire);
    } else if (h > 5) {
      if (Math.random() > 0.5) {
        g.add(
          box(0.7, 0.9, 0.7, 0x885533, [
            w * 0.3,
            h + 0.32 + 0.55 + 0.45,
            d * 0.3,
          ]),
        );
      } else {
        const wt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.55, 1.1, 7),
          new THREE.MeshLambertMaterial({ color: 0x7a5030 }),
        );
        wt.position.set(w * 0.3, h + 0.32 + 0.55 + 0.55, d * 0.3);
        g.add(wt);
      }
    }

    // Windows — low-poly: just lighter squares on face
    addWindows(g, b, w, h, d, bColor);

    // Building ambient light
    g.add(ptLight(gc, isNight ? 2.8 : 0.3, 18, [0, h * 0.6, 0]));

    // Collision box
    buildingBoxes.push({
      minX: b.pos[0] - w / 2 - 1.0,
      maxX: b.pos[0] + w / 2 + 1.0,
      minZ: b.pos[1] - d / 2 - 1.0,
      maxZ: b.pos[1] + d / 2 + 1.0,
    });

    buildingMeshes.push({ group: g, body, building: b, bodyMat });
    scene.add(g);
  }

  // Pick from warm building palette based on building index
  const bPalette = [P.b1, P.b2, P.b3, P.b4, P.b5, P.b6, P.b7, P.b8];
  let bIdx = 0;
  function pickBuildingColor(b) {
    if (b.isEducation) return P.b5;
    return bPalette[bIdx++ % bPalette.length];
  }

  function darken(hex, amt) {
    const r = (((hex >> 16) & 0xff) * (1 - amt)) | 0;
    const g2 = (((hex >> 8) & 0xff) * (1 - amt)) | 0;
    const b2 = ((hex & 0xff) * (1 - amt)) | 0;
    return (r << 16) | (g2 << 8) | b2;
  }

  function addWindows(g, b, w, h, d, bColor) {
    const wc = pc(b.windowColor);
    const litMat = new THREE.MeshBasicMaterial({
      color: wc,
      transparent: true,
      opacity: isNight ? 0.9 : 0.2,
    });
    const unlitMat = new THREE.MeshLambertMaterial({
      color: darken(bColor, 0.3),
    });

    const floors = Math.max(2, Math.floor(h / 2.2));
    const cols = Math.max(2, Math.floor(w / 1.8));

    for (let fl = 0; fl < floors; fl++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.6) continue;
        const mat = Math.random() > 0.3 ? litMat.clone() : unlitMat.clone();
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7), mat);
        const wx = -w / 2 + (c + 0.6) * (w / cols);
        win.position.set(wx, 1.0 + fl * 2.2, d / 2 + 0.02);
        g.add(win);
        if (mat === litMat || mat.color) {
          windowMaterials.push({
            mat,
            litOpacity: isNight ? 0.9 : 0.2,
            isLit: Math.random() > 0.3,
          });
        }
      }
    }
  }

  // ── CENTERPIECE ───────────────────────────────────────────────────────────
  function buildCenterpiece() {
    // Low-poly plinth
    scene.add(box(8, 0.6, 8, P.sidewalk, [0, 0.3, 0], 8)); // octagonal base
    // Cylinder pillar
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.5, 3.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x2a2a3a }),
    );
    ped.position.y = 2.1;
    ped.castShadow = true;
    scene.add(ped);

    // "AS" sign as low-poly geometry
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.65, 0.25),
      new THREE.MeshBasicMaterial({ color: 0x00ddff }),
    );
    sign.position.set(0, 4.0, 0.5);
    scene.add(sign);

    // Rotating low-poly rings
    [2.5, 3.4].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.1, 4, 12), // 4-segment = diamond shape
        new THREE.MeshBasicMaterial({
          color: 0x00ddff,
          transparent: true,
          opacity: 0.35 - i * 0.08,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.0;
      ring.userData.isRing = true;
      ring.userData.rotSpeed = 0.4 + i * 0.2;
      scene.add(ring);
    });
    scene.add(ptLight(0x00ddff, isNight ? 4 : 0.5, 20, [0, 4.5, 0]));
  }

  // ── TREES (low-poly — flat-shaded spheres on sticks) ─────────────────────
  // Tree registry for shake on collision
  let trees = []; // { group, leaf, shakeT: 0 }

  function buildTrees() {
    const positions = [
      // Roundabout ring
      [6.5, 6.5],
      [-6.5, 6.5],
      [6.5, -6.5],
      [-6.5, -6.5],
      [9, 0],
      [-9, 0],
      [0, 9],
      [0, -9],
      // Road sides
      [18, 11],
      [-18, 11],
      [18, -11],
      [-18, -11],
      [18, 22],
      [-18, 22],
      [18, -22],
      [-18, -22],
      [22, -8],
      [38, -8],
      [22, 8],
      [38, 8],
      [-22, -8],
      [-38, -8],
      [-22, 8],
      [-38, 8],
      // Education district
      [5, -28],
      [-5, -28],
      [20, -28],
      [-20, -28],
      [0, -44],
      [-14, -44],
      [14, -44],
      [-8, -38],
      [8, -38],
      // South
      [10, 30],
      [-10, 30],
      [0, 32],
      [15, 30],
      [-15, 30],
      // Extras
      [30, -10],
      [-30, -10],
      [30, 10],
      [-30, 10],
      [42, 5],
      [-42, 5],
      [42, -5],
      [-42, -5],
    ];
    const leafColors = [
      P.treeLeaf1,
      P.treeLeaf2,
      P.treeLeaf3,
      0x7a6030, // very muted tan
      0x5a4820, // dark khaki
    ];
    const trunkMat = new THREE.MeshLambertMaterial({ color: P.treeTrunk });
    const spikyMat = new THREE.MeshLambertMaterial({ color: P.treeSpike }); // dark spike bushes

    positions.forEach(([x, z]) => {
      const h = 0.9 + Math.random() * 0.9;
      const r = 0.75 + Math.random() * 0.55;

      // Group: trunk + leaf together for shake
      const tg = new THREE.Group();
      tg.position.set(x, 0, z);

      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, h * 1.3, 0.22),
        trunkMat,
      );
      trunk.position.y = h * 0.65;
      trunk.castShadow = true;
      tg.add(trunk);

      const leaf = new THREE.Mesh(
        Math.random() > 0.4
          ? new THREE.SphereGeometry(r, 5, 4) // fluffy round tree
          : new THREE.ConeGeometry(r * 0.7, r * 1.8, 5), // spiky pine — Bruno Simon style!
        new THREE.MeshLambertMaterial({
          color: leafColors[Math.floor(Math.random() * leafColors.length)],
        }),
      );
      leaf.position.y = h * 1.3 + r * 0.75;
      leaf.castShadow = true;
      tg.add(leaf);

      scene.add(tg);
      trees.push({
        group: tg,
        leaf,
        shakeT: 0,
        baseX: x,
        baseZ: z,
        r: r + 0.4,
      });
    });
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
    const poleMat = new THREE.MeshLambertMaterial({ color: P.lampPole });
    const headMat = new THREE.MeshBasicMaterial({ color: P.lampHead });

    positions.forEach(([x, z]) => {
      // Pole
      scene.add(box(0.18, 4.8, 0.18, P.lampPole, [x, 2.4, z]));
      // Arm
      scene.add(box(0.12, 0.12, 0.75, P.lampPole, [x, 5.0, z + 0.38]));
      // Head (glowing cube — low poly)
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.45, 0.45),
        headMat,
      );
      head.position.set(x, 5.0, z + 0.75);
      scene.add(head);
      // Light
      scene.add(ptLight(0xffeeaa, isNight ? 2.5 : 0, 15, [x, 5.0, z + 0.75]));
    });
  }

  // ── CHECKPOINTS (Bruno Simon: diamond + beam + rings) ─────────────────────
  function buildCheckpoints() {
    window.CITY_DATA.buildings.forEach((b) => {
      if (!b.roadPos) return;
      const gc = pc(b.glowColor);
      const g = new THREE.Group();
      g.position.set(b.roadPos[0], 0, b.roadPos[1]);

      // Ground rings — low-poly
      [1.0, 1.65, 2.3].forEach((r, i) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.08, 4, 16),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.55 - i * 0.14,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.1;
        ring.userData.cpRing = true;
        ring.userData.phase = i * Math.PI * 0.66;
        g.add(ring);
      });

      // Ground dot
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 8),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
        }),
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.y = 0.1;
      g.add(dot);

      // Vertical beam
      const beamH = b.height + 5;
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, beamH, 0.12),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.22,
        }),
      );
      beam.position.y = beamH / 2;
      g.add(beam);

      // Diamond (OctahedronGeometry looks exactly like Bruno Simon's diamond markers)
      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.52, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      diamond.position.y = beamH + 0.6;
      diamond.userData.isDiamond = true;
      diamond.userData.floatPhase = Math.random() * Math.PI * 2;
      g.add(diamond);

      // Outer ring around diamond
      const pRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.06, 4, 12),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.6,
        }),
      );
      pRing.rotation.x = Math.PI / 2;
      pRing.position.y = beamH + 0.6;
      pRing.userData.cpPulse = true;
      g.add(pRing);

      // Point light
      g.add(ptLight(gc, 2.0, 12, [0, beamH + 0.6, 0]));

      g.userData = { buildingId: b.id, beamH };
      scene.add(g);
      checkpointGroups.push({ group: g, building: b, diamond, pRing });
    });
  }

  // ── ATMOSPHERE (floating particles) ──────────────────────────────────────
  function buildAtmosphere() {
    const cnt = 600,
      pos = new Float32Array(cnt * 3),
      col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      const t = Math.random();
      if (t < 0.45) {
        col[i * 3] = 0.2;
        col[i * 3 + 1] = 0.6;
        col[i * 3 + 2] = 1;
      } else if (t < 0.7) {
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.85;
        col[i * 3 + 2] = 0.3;
      } else {
        col[i * 3] = 0.6;
        col[i * 3 + 1] = 1;
        col[i * 3 + 2] = 0.5;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: 0.06,
          vertexColors: true,
          transparent: true,
          opacity: 0.5,
        }),
      ),
    );
  }

  // ── CAR (Clean low-poly SUV — one unified body, correct wheels) ──────────
  function buildCar() {
    carGroup = new THREE.Group();
    wheelGroups = [];

    // MeshLambertMaterial for low-poly look exactly like Bruno Simon
    function mL(color) {
      return new THREE.MeshLambertMaterial({ color });
    }
    const mBody = mL(0xcc2200); // BRIGHT RED — exactly like Bruno Simon screenshot
    const mDark = mL(0x881400); // darker red for cabin/hood
    const mBlack = mL(0x1a1510); // near-black for trim
    const mArch = mL(0x991a00); // wheel arch — slightly different red
    const mGlass = new THREE.MeshLambertMaterial({
      color: 0x7799bb,
      transparent: true,
      opacity: 0.5,
    });
    const mChrome = mL(0x999988);
    const mTyre = mL(0x151210);
    const mHub = mL(0xbbbbcc);

    // ── KEY DIMENSIONS ────────────────────────────────────────────────
    // Bruno Simon: big wheels, compact body — almost square profile
    const WR = 0.5; // BIGGER wheel radius (Bruno Simon has large wheels)
    const AXH = WR;
    const WW = 0.42; // WIDER wheels
    const WOFX = 1.12; // wider wheel track
    const WOFZ = 0.95;

    const BY = AXH + 0.06;
    const BH = 0.52;
    const CY = BY + BH;
    const CH = 0.54;
    const RY = CY + CH;
    const FZ = 1.52;
    const RZ = -1.52;

    // ── UNDERCARRIAGE ─────────────────────────────────────────────────
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 0.22, 3.1),
      mBlack,
    );
    under.position.y = AXH + 0.11;
    carGroup.add(under);

    // ── MAIN BODY ─────────────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, BH, 3.1), mBody);
    body.position.y = BY + BH / 2;
    body.castShadow = true;
    carGroup.add(body);
    carBodyMesh = body;

    // Side sills
    [-0.87, 0.87].forEach((x) => {
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.18, 2.6),
        mBlack,
      );
      sill.position.set(x, BY + 0.09, 0);
      carGroup.add(sill);
    });

    // ── WHEEL ARCH FLARES — Bruno Simon's key feature ──────────────────
    // Wide flares that stick out SIGNIFICANTLY beyond body width
    // Front arches
    [FZ * 0.6, RZ * 0.6].forEach((z, zi) => {
      [-1, 1].forEach((side) => {
        // Main arch box — extends well beyond body
        const arch = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.4, 1.05),
          mArch,
        );
        arch.position.set(side * (0.86 + 0.09), BY + 0.24, z);
        arch.castShadow = true;
        carGroup.add(arch);
        // Arch lip (bottom edge — darker)
        const lip = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.06, 1.02),
          mBlack,
        );
        lip.position.set(side * (0.86 + 0.1), BY + 0.04, z);
        carGroup.add(lip);
      });
    });

    // ── CABIN ─────────────────────────────────────────────────────────
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.44, CH, 1.76), mDark);
    cabin.position.set(0, CY + CH / 2, -0.18);
    cabin.castShadow = true;
    carGroup.add(cabin);

    // ── ROOF ──────────────────────────────────────────────────────────
    const roofSlab = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.09, 1.76),
      mBlack,
    );
    roofSlab.position.set(0, RY + 0.045, -0.18);
    carGroup.add(roofSlab);

    // Roof rack
    [-0.54, 0.54].forEach((x) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.045, 1.5),
        mChrome,
      );
      rail.position.set(x, RY + 0.09, -0.18);
      carGroup.add(rail);
    });
    [-0.48, 0.08, 0.62].forEach((z) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.06, 0.04, 0.045),
        mChrome,
      );
      bar.position.set(0, RY + 0.1, z - 0.18);
      carGroup.add(bar);
    });

    // LED light bar on roof front
    const ledBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.065, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffffcc }),
    );
    ledBar.position.set(0, RY + 0.105, 0.74);
    carGroup.add(ledBar);
    const ledPt = new THREE.PointLight(0xffffcc, isNight ? 1.6 : 0, 9);
    ledPt.position.set(0, RY + 0.18, 0.85);
    carGroup.add(ledPt);

    // ── HOOD ──────────────────────────────────────────────────────────
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.08, 0.84), mBody);
    hood.position.set(0, BY + BH + 0.04, FZ * 0.73);
    carGroup.add(hood);
    // Power dome
    const dome = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.055, 0.7), mDark);
    dome.position.set(0, BY + BH + 0.075, FZ * 0.73);
    carGroup.add(dome);

    // ── WINDSHIELDS ───────────────────────────────────────────────────
    // Front — angled
    const wsF = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.46, 0.055),
      mGlass.clone(),
    );
    wsF.position.set(0, CY + 0.24, FZ * 0.58);
    wsF.rotation.x = 0.22;
    carGroup.add(wsF);
    // Rear
    const wsR = new THREE.Mesh(
      new THREE.BoxGeometry(1.38, 0.44, 0.055),
      mGlass.clone(),
    );
    wsR.position.set(0, CY + 0.23, -1.0);
    wsR.rotation.x = -0.22;
    carGroup.add(wsR);
    // Side windows ×2 per side
    [-0.73, 0.73].forEach((x) => {
      const sw1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.36, 0.58),
        mGlass.clone(),
      );
      sw1.position.set(x, CY + 0.24, 0.32);
      carGroup.add(sw1);
      const sw2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.34, 0.48),
        mGlass.clone(),
      );
      sw2.position.set(x, CY + 0.22, -0.38);
      carGroup.add(sw2);
    });
    // B-pillar
    [-0.72, 0.72].forEach((x) => {
      const bp = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.5, 0.09),
        mBlack,
      );
      bp.position.set(x, CY + 0.25, -0.06);
      carGroup.add(bp);
    });

    // ── FRONT FACE ────────────────────────────────────────────────────
    // Grille surround
    const gSurr = new THREE.Mesh(
      new THREE.BoxGeometry(1.62, 0.38, 0.08),
      mBlack,
    );
    gSurr.position.set(0, BY + 0.21, FZ);
    carGroup.add(gSurr);
    // Grille bars
    for (let i = 0; i < 4; i++) {
      const gb = new THREE.Mesh(
        new THREE.BoxGeometry(1.38, 0.03, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x1a1610 }),
      );
      gb.position.set(0, BY + 0.07 + i * 0.09, FZ + 0.01);
      carGroup.add(gb);
    }
    // Round headlights — G-Wagon style
    [-0.6, 0.6].forEach((x) => {
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.09, 10),
        mBlack,
      );
      housing.rotation.x = Math.PI / 2;
      housing.position.set(x, BY + 0.32, FZ + 0.01);
      carGroup.add(housing);
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.14, 10),
        new THREE.MeshBasicMaterial({ color: 0xffee88 }),
      );
      lens.position.set(x, BY + 0.32, FZ + 0.06);
      carGroup.add(lens);
      const drl = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.15, 10),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
        }),
      );
      drl.position.set(x, BY + 0.32, FZ + 0.07);
      carGroup.add(drl);
    });
    carHL = ptLight(0xffffaa, isNight ? 7 : 0, 36, [-0.6, BY + 0.32, FZ + 0.2]);
    carHR = ptLight(0xffffaa, isNight ? 7 : 0, 36, [0.6, BY + 0.32, FZ + 0.2]);
    carGroup.add(carHL);
    carGroup.add(carHR);

    // Front bumper
    const bmpF = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.17, 0.15), mBlack);
    bmpF.position.set(0, BY + 0.09, FZ + 0.04);
    carGroup.add(bmpF);
    // Skid plate
    const skid = new THREE.Mesh(
      new THREE.BoxGeometry(1.18, 0.08, 0.17),
      mChrome,
    );
    skid.position.set(0, BY + 0.04, FZ + 0.04);
    carGroup.add(skid);
    // Tow hooks
    [-0.46, 0.46].forEach((x) => {
      const hk = new THREE.Mesh(
        new THREE.TorusGeometry(0.06, 0.018, 4, 8),
        new THREE.MeshLambertMaterial({ color: 0xddaa00 }),
      );
      hk.rotation.y = Math.PI / 2;
      hk.position.set(x, BY + 0.03, FZ + 0.09);
      carGroup.add(hk);
    });

    // ── REAR ──────────────────────────────────────────────────────────
    // Full-width tail LED strip
    const tlStrip = new THREE.Mesh(
      new THREE.BoxGeometry(1.36, 0.06, 0.032),
      new THREE.MeshBasicMaterial({ color: 0xff2200 }),
    );
    tlStrip.position.set(0, BY + BH - 0.06, RZ);
    carGroup.add(tlStrip);
    // Corner tail clusters
    [-0.66, 0.66].forEach((x) => {
      const tc = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xff3300 }),
      );
      tc.position.set(x, BY + 0.26, RZ);
      carGroup.add(tc);
    });
    carTL = ptLight(0xff1100, isNight ? 2.5 : 0, 8, [
      -0.66,
      BY + 0.26,
      RZ - 0.08,
    ]);
    carTR = ptLight(0xff1100, isNight ? 2.5 : 0, 8, [
      0.66,
      BY + 0.26,
      RZ - 0.08,
    ]);
    carGroup.add(carTL);
    carGroup.add(carTR);
    // Rear bumper
    const bmpR = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, 0.15, 0.13),
      mBlack,
    );
    bmpR.position.set(0, BY + 0.08, RZ - 0.02);
    carGroup.add(bmpR);
    // Exhaust pipes
    [-0.48, 0.48].forEach((x) => {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.05, 0.16, 6),
        mChrome,
      );
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(x, BY + 0.04, RZ - 0.04);
      carGroup.add(pipe);
    });

    // Side mirrors
    [-0.84, 0.84].forEach((x) => {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.05, 0.18),
        mBlack,
      );
      arm.position.set(x + (x < 0 ? -0.05 : 0.05), CY + 0.16, FZ * 0.42);
      carGroup.add(arm);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.16, 0.22),
        mBlack,
      );
      head.position.set(x + (x < 0 ? -0.09 : 0.09), CY + 0.16, FZ * 0.42);
      carGroup.add(head);
    });

    // Underglow
    const ug = new THREE.PointLight(0x002299, isNight ? 0.8 : 0, 6);
    ug.position.set(0, 0.08, 0);
    carGroup.add(ug);

    // ── WHEELS ────────────────────────────────────────────────────────
    // Each wheel: position group (wg, never rotated) + spin group (sg, rotation.x += spin)
    // Tyre cylinder has rotation.z=PI/2 so its axis is X → sg.rotation.x rolls it ✓
    const WPOS = [
      [-WOFX, WOFZ],
      [WOFX, WOFZ],
      [-WOFX, -WOFZ],
      [WOFX, -WOFZ],
    ];
    WPOS.forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      wg.position.set(wx, AXH, wz);
      carGroup.add(wg);

      const sg = new THREE.Group();
      wg.add(sg);
      wheelGroups.push(sg);

      // Tyre
      const tyre = new THREE.Mesh(
        new THREE.CylinderGeometry(WR, WR, WW, 14),
        mTyre,
      );
      tyre.rotation.z = Math.PI / 2;
      tyre.castShadow = true;
      sg.add(tyre);

      // Tyre inner rim ring - RED like Bruno Simon!
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.78, WR * 0.78, WW + 0.02, 14),
        new THREE.MeshLambertMaterial({ color: 0x881100 }),
      ); // red rim!
      rim.rotation.z = Math.PI / 2;
      sg.add(rim);

      // Hub face (outer side)
      const outerX = wx < 0 ? -(WW / 2 + 0.012) : WW / 2 + 0.012;
      const hub = new THREE.Mesh(
        new THREE.CircleGeometry(WR * 0.62, 12),
        new THREE.MeshLambertMaterial({ color: 0xcc2200 }),
      ); // red hub like Bruno Simon
      hub.position.x = outerX;
      hub.rotation.y = wx < 0 ? -Math.PI / 2 : Math.PI / 2;
      sg.add(hub);

      // Center cap
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8),
        mChrome,
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.x = outerX + (wx < 0 ? -0.025 : 0.025);
      sg.add(cap);

      // 5 spokes
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * Math.PI * 2;
        const spk = new THREE.Mesh(
          new THREE.BoxGeometry(WW * 0.3, WR * 1.15, 0.055),
          new THREE.MeshLambertMaterial({ color: 0xddddee }),
        );
        spk.rotation.x = ang; // fans them around X in Y-Z plane ✓
        spk.position.x = outerX - (wx < 0 ? -0.005 : 0.005);
        sg.add(spk);
      }
    });

    // ── CAR SELF-ILLUMINATION (warm point from above, like studio light) ──
    const carTopLight = new THREE.PointLight(0xffcc88, isNight ? 2.5 : 1.2, 6);
    carTopLight.position.set(0, 3.5, 0);
    carGroup.add(carTopLight);

    // ── FLAT SHADOW DISC under car (Bruno Simon style) ─────────────────
    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.03;
    carGroup.add(shadowDisc);

    carGroup.position.set(carX, 0, carZ);
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
    const fwd = keys["ArrowUp"] || keys["KeyW"];
    const bwd = keys["ArrowDown"] || keys["KeyS"];
    const lft = keys["ArrowLeft"] || keys["KeyA"];
    const rgt = keys["ArrowRight"] || keys["KeyD"];
    const brk = keys["Space"];

    // Acceleration — scalar along forward axis
    if (fwd) carSpeed = Math.min(carSpeed + ACCEL, MAX_SPD);
    else if (bwd) carSpeed = Math.max(carSpeed - BRAKE * 0.65, -MAX_SPD * 0.45);
    else {
      carSpeed += carSpeed > 0 ? -DECEL : carSpeed < 0 ? DECEL : 0;
      if (Math.abs(carSpeed) < 0.002) carSpeed = 0;
    }
    if (brk) {
      carSpeed *= 0.88;
      if (Math.abs(carSpeed) < 0.002) carSpeed = 0;
    }

    // Steering — only while moving, scaled by speed
    if (Math.abs(carSpeed) > 0.005) {
      const dir = carSpeed > 0 ? 1 : -1;
      const sf = Math.min(Math.abs(carSpeed) / (MAX_SPD * 0.5), 1.0);
      if (lft) carAngle += TURN * sf * dir;
      if (rgt) carAngle -= TURN * sf * dir;
    }

    // Move along car's own forward axis — NO DRIFT
    const sinA = Math.sin(carAngle),
      cosA = Math.cos(carAngle);
    const nx = carX + sinA * carSpeed,
      nz = carZ + cosA * carSpeed;

    if (!collides(nx, nz)) {
      carX = nx;
      carZ = nz;
      // Gently shake trees when driving very close (brushing past)
      if (Math.abs(carSpeed) > 0.1) shakeNearbyTrees(carX, carZ, 2.5);
    } else {
      if (crashCooldown <= 0 && Math.abs(carSpeed) > 0.04) {
        playCrash();
        shakeCam();
        shakeNearbyTrees(carX, carZ, 6); // shake all trees within 6 units on impact
        crashCooldown = 45;
      }
      carSpeed *= -0.3;
    }
    if (crashCooldown > 0) crashCooldown--;
    carX = Math.max(-70, Math.min(70, carX));
    carZ = Math.max(-55, Math.min(40, carZ));

    carGroup.position.set(carX, 0, carZ);
    carGroup.rotation.y = carAngle;

    // Wheel spin: spinGroup.rotation.x → rolls wheel forward/backward ✓
    // (spinGroup has no pre-rotation, so X = world X = correct roll axis)
    const spin = Math.abs(carSpeed) * 2.2 * (carSpeed >= 0 ? 1 : -1);
    wheelGroups.forEach((sg) => {
      sg.rotation.x += spin;
    });

    // Body roll — smooth lean into corners
    const steer = (lft ? 1 : 0) - (rgt ? 1 : 0);
    carGroup.rotation.z +=
      (steer * carSpeed * 0.07 - carGroup.rotation.z) * 0.12;

    // Bounce
    carGroup.position.y = Math.abs(
      Math.sin(Date.now() * 0.016) * carSpeed * 0.015,
    );

    // Camera — Bruno Simon style: ~45° angle, NOT top-down
    // Distance 14, height 10 → angle ≈ arctan(10/14) ≈ 35°
    const tx = carX - sinA * 14,
      tz = carZ - cosA * 14;
    camera.position.x += (tx - camera.position.x) * 0.1;
    camera.position.y += (9 - camera.position.y) * 0.06;
    camera.position.z += (tz - camera.position.z) * 0.1;
    camera.lookAt(carX + sinA * 2, 0.8, carZ + cosA * 2);

    if (prevSpeed > 0.09 && carSpeed < 0.03) playBrake();
    prevSpeed = carSpeed;
    updateEngineSound(carSpeed);
    window.CityUI?.updateHUD(carSpeed);
    window.CityUI?.updateMinimap(carX, carZ, -carAngle);
    checkProximity();
  }

  function shakeCam() {
    let n = 0;
    const iv = setInterval(() => {
      camera.position.x += (Math.random() - 0.5) * 0.4;
      camera.position.y += (Math.random() - 0.5) * 0.2;
      if (++n > 10) clearInterval(iv);
    }, 26);
  }

  // ── PROXIMITY ─────────────────────────────────────────────────────────────
  function checkProximity() {
    let closest = null,
      closestDist = PROX;
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
    buildingMeshes.forEach((bm) => {
      if (bm.building.id !== id) return;
      bm.bodyMat.emissive = new THREE.Color(on ? pc(bm.building.glowColor) : 0);
      bm.bodyMat.emissiveIntensity = on ? 0.22 : 0;
    });
  }

  function enterNearestBuilding() {
    if (proximityBuilding) window.CityUI?.openBuilding(proximityBuilding);
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
      wm.mat.opacity = isNight && wm.isLit ? 0.88 : isNight ? 0.05 : 0.15;
    });
  }

  // ── ANIMATE ───────────────────────────────────────────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    updateCar();
    updateWeatherParticles();
    updateTrees(t);

    // ── WAVE LINE ANIMATION ─────────────────────────────────────────────
    waveLines.forEach((wl) => {
      const pulse = Math.sin(t * 1.4 + wl.userData.wavePhase) * 0.5 + 0.5;
      wl.material.opacity = 0.1 + pulse * 0.35;
      // Subtle scale on width
      const scl = 1 + pulse * 0.08;
      wl.scale.set(scl, 1, scl);
    });

    // ── CENTERPIECE RINGS ───────────────────────────────────────────────
    scene.children.forEach((c) => {
      if (c.userData.isRing) c.rotation.z = t * c.userData.rotSpeed;
    });

    // ── BUILDING HERO RINGS + ORBS ──────────────────────────────────────
    buildingMeshes.forEach(({ group }) => {
      group.children.forEach((c) => {
        if (c.userData.heroRing)
          c.rotation.z = t * (0.45 + c.userData.ri * 0.22);
        if (c.userData.isOrb) {
          c.rotation.y = t * 0.9;
          // Bloom simulation: pulse emissiveIntensity on orb's parent building
          const pulse = Math.sin(t * 2.2) * 0.5 + 0.5;
          if (c.material) c.material.opacity = 0.8 + pulse * 0.2;
        }
      });
    });

    // ── CHECKPOINT ANIMATIONS ───────────────────────────────────────────
    checkpointGroups.forEach(({ group, building, diamond, pRing }) => {
      const rx = building.roadPos ? building.roadPos[0] : building.pos[0];
      const rz = building.roadPos ? building.roadPos[1] : building.pos[1];
      const dist = Math.hypot(carX - rx, carZ - rz);
      const alpha = Math.max(0, Math.min(1, (dist - 3) / 18));

      group.traverse((c) => {
        if (
          c.isMesh &&
          c.material &&
          c.material.transparent &&
          c.material.opacity > 0
        ) {
          if (!c.userData._mbo) c.userData._mbo = c.material.opacity;
          c.material.opacity = c.userData._mbo * alpha;
        }
      });

      if (diamond) {
        const bh = group.userData.beamH || 10;
        diamond.position.y =
          bh + 0.6 + Math.sin(t * 2.1 + diamond.userData.floatPhase) * 0.48;
        diamond.rotation.y = t * 1.5;
        if (pRing) pRing.position.y = diamond.position.y;
      }
      if (pRing) {
        const s = 1 + Math.sin(t * 2.8 + building.pos[0]) * 0.22;
        pRing.scale.set(s, s, 1);
      }
      group.children.forEach((c) => {
        if (c.userData.cpRing) {
          const rs = 1 + Math.sin(t * 2.4 + c.userData.phase) * 0.14;
          c.scale.set(rs, 1, rs);
        }
      });
    });

    // ── BLOOM SIMULATION ─────────────────────────────────────────────────
    // Three.js r128 has no built-in bloom pass without loaders.
    // We simulate it by pulsing emissiveIntensity on all glowing building lights
    // and making glow orbs slightly scale-pulse.
    if (isNight) {
      const bloomPulse = Math.sin(t * 0.8) * 0.04;
      buildingMeshes.forEach(({ bodyMat }) => {
        if (bodyMat.emissiveIntensity > 0) {
          bodyMat.emissiveIntensity = Math.max(
            0.05,
            bodyMat.emissiveIntensity + bloomPulse,
          );
        }
      });
    }

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
  };
})();
