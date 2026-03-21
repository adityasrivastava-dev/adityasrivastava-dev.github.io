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
  let isNight = false; // ← DAY is default, like Bruno Simon

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
  let confettiPieces = [];

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
  let weatherGrip = 1.0; // 1.0 = dry, 0.3 = rain, 0.12 = snow

  // ── PALETTE — Bruno Simon EXACT warm peach + cool blue shadow ────────────
  const P = {
    // Ground: BRIGHT warm orange-peach exactly like Bruno Simon
    ground: 0xe8966a, // vivid sandy orange
    groundAlt: 0xdd8855,
    road: 0xd4845a, // road only slightly darker
    sidewalk: 0xf0a878, // warm light pavement
    roadLine: 0xf5e642,

    // Buildings: warm terracotta family
    b1: 0xd96840,
    b2: 0xe8904a,
    b3: 0xf0a84a,
    b4: 0xb05535,
    b5: 0xdc7845,
    b6: 0xc46835,
    b7: 0xf0a055,
    b8: 0xcc7245,

    roofDark: 0x7a3a22,
    roofRed: 0x993320,
    roofGrey: 0x8a5a3a,

    // Trees: VIVID like Bruno Simon — pink, bright green, autumn orange
    treeTrunk: 0x8a5228,
    treeLeaf1: 0xff88aa, // PINK cherry blossom — Bruno's signature
    treeLeaf2: 0xee5533, // autumn orange-red
    treeLeaf3: 0xaacc44, // bright spring green
    treeLeaf4: 0xffcc44, // golden yellow
    treeLeaf5: 0xdd7722, // deep amber
    treeSpike: 0x558833, // dark pine green

    // Grass patches — thick bright
    grass1: 0xaacc44,
    grass2: 0xddee33,
    grass3: 0x88bb22,

    lampPole: 0x8a6a4a,
    lampHead: 0xffeeaa,

    carBody: 0xdd2200,
    carDark: 0x881200,
    carBlack: 0x181210,
    carGlass: 0x5588bb,
    carChrome: 0xbbbbaa,
    carTyre: 0x141210,
    carHub: 0xcc2000,

    water: 0x4499cc, // brighter teal water like Bruno
  };

  // ── MATCAP SYSTEM ─────────────────────────────────────────────────────────
  // Pre-baked sphere textures — no real-time lighting calc on matcap objects
  let matcaps = {}; // warm | cool | stone | car | gold | dark | tree

  // ── ZONE + LABEL SYSTEM ───────────────────────────────────────────────────
  let blobShadows = []; // { mesh, building } — fake ground shadows
  let worldLabels = []; // THREE.Sprite billboard array
  let zoneAmbients = []; // per-zone colored point lights

  // ── INIT ──────────────────────────────────────────────────────────────────
  function progress(pct, msg) {
    if (typeof window.onCityProgress === "function")
      window.onCityProgress(pct, msg);
  }

  function init(canvas) {
    const W = window.innerWidth,
      H = window.innerHeight;

    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 500);
    camera.position.set(0, 11, 22);
    camera.lookAt(0, 0, 5);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    // ── NO GPU SHADOW MAPS — replaced by fake blob shadows (Bruno Simon style)
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Kick renderer once to avoid white flash
    renderer.render(new THREE.Scene(), camera);

    initMatcaps();
    progress(5, "MATCAP SYSTEM READY");

    // ── DEFERRED BUILD — lets loading screen render between steps ─────────
    const buildSteps = [
      () => {
        applyWeather("day");
        buildGround();
        progress(12, "TERRAIN LOADED");
      },
      () => {
        buildRoads();
        progress(20, "ROAD NETWORK");
      },
      () => {
        buildAllBuildings();
        progress(44, "SYSTEMS ONLINE");
      },
      () => {
        buildTrees();
        buildGrassPatches();
        buildLamps();
        progress(58, "DISTRICT FLORA");
      },
      () => {
        buildCenterpiece();
        build3DName();
        buildCar();
        progress(72, "VEHICLES READY");
      },
      () => {
        buildCheckpoints();
        buildAtmosphere();
        buildWaveLines();
        progress(84, "ATMOSPHERE");
      },
      () => {
        buildWorldLabels();
        buildZoneAmbients();
        buildCareerTimeline();
        progress(95, "LABELS DEPLOYED");
      },
      () => {
        setupControls();
        window.addEventListener("resize", onResize);
        setTimeout(() => checkProximity(), 300);
        animate();
        progress(100, "CITY LIVE");
      },
    ];

    let step = 0;
    function runNext() {
      if (step < buildSteps.length) {
        buildSteps[step++]();
        setTimeout(runNext, 18);
      }
    }
    runNext();
  }

  // ── MATCAP TEXTURES ───────────────────────────────────────────────────────
  // Each matcap is a canvas-painted sphere texture: highlight, midtone, shadow
  function createMatcap(highlight, midtone, shadow, specular) {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    // Base gradient — shadow → midtone → highlight
    const g1 = ctx.createLinearGradient(0, S, 0, 0);
    g1.addColorStop(0, shadow);
    g1.addColorStop(0.4, midtone);
    g1.addColorStop(1, highlight);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, S, S);
    // Specular glint (top-left)
    const g2 = ctx.createRadialGradient(
      S * 0.3,
      S * 0.25,
      0,
      S * 0.45,
      S * 0.45,
      S * 0.5,
    );
    g2.addColorStop(0, specular || "rgba(255,255,255,0.88)");
    g2.addColorStop(0.22, "rgba(255,255,255,0.22)");
    g2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, S, S);
    // Cool rim light (bottom-right — Bruno Simon style)
    const g3 = ctx.createRadialGradient(
      S * 0.78,
      S * 0.8,
      0,
      S * 0.7,
      S * 0.72,
      S * 0.32,
    );
    g3.addColorStop(0, "rgba(80,130,255,0.38)");
    g3.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g3;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    return new THREE.CanvasTexture(c);
  }

  function initMatcaps() {
    matcaps.warm = createMatcap("#ffddaa", "#bb6633", "#440e00"); // terracotta
    matcaps.cool = createMatcap("#aaccff", "#2244aa", "#000b22"); // steel blue
    matcaps.stone = createMatcap("#bbaa99", "#66554a", "#1a1008"); // worn stone
    matcaps.gold = createMatcap("#ffe988", "#bb7700", "#331b00"); // amber gold
    matcaps.green = createMatcap("#aaff88", "#2a8844", "#083310"); // acid green
    matcaps.purple = createMatcap("#cc99ff", "#7733cc", "#1a0033"); // violet
    matcaps.car = createMatcap(
      "#ff8866",
      "#cc2200",
      "#330000", // candy red
      "rgba(255,230,220,0.95)",
    );
    matcaps.carDark = createMatcap("#dd4422", "#881400", "#220000"); // dark red
    matcaps.chrome = createMatcap("#eeeedd", "#888877", "#222214"); // chrome
    matcaps.glass = createMatcap("#88aadd", "#2244aa", "#000a22"); // glass
    matcaps.tyre = createMatcap("#333222", "#151210", "#050404"); // rubber
    matcaps.tree = createMatcap("#bbff88", "#44aa22", "#0a2200"); // vivid foliage
    matcaps.dark = createMatcap("#2a2820", "#111008", "#050302"); // near-black trim
  }

  // ── BLOB SHADOW ───────────────────────────────────────────────────────────
  // Per-building fake shadow plane — no GPU shadow maps needed
  function addBlobShadow(b, group) {
    const w = b.size[0] * 0.8;
    const d = b.size[1] * 0.72;
    const gc = pc(b.glowColor);
    // Shadow tinted subtly with building's glow color (subliminal district feeling)
    const rr = ((gc >> 16) & 0xff) / 255;
    const gg = ((gc >> 8) & 0xff) / 255;
    const bb2 = (gc & 0xff) / 255;

    const shadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(
        rr * 0.07 + 0.01,
        gg * 0.05 + 0.005,
        bb2 * 0.09 + 0.008,
      ),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 18), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(w, d, 1);
    shadow.position.y = 0.025;
    group.add(shadow);
    blobShadows.push({ mesh: shadow, building: b, baseMat: shadowMat });
  }

  // ── WORLD-SPACE BILLBOARD LABELS ──────────────────────────────────────────
  // Float above buildings when you're in range — billboard always faces camera
  function buildWorldLabels() {
    window.CITY_DATA.buildings.forEach((b) => {
      const W = 320,
        H = 108;
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");

      const gc = b.glowColor;
      // Panel background
      ctx.fillStyle = "rgba(4,6,12,0.92)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(3, 3, W - 6, H - 6, 8);
      else ctx.rect(3, 3, W - 6, H - 6);
      ctx.fill();
      // Accent border
      ctx.strokeStyle = gc + "bb";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Top accent line
      ctx.fillStyle = gc;
      ctx.fillRect(12, 3, 60, 2.5);

      // Status dot
      ctx.fillStyle = b.status === "OPERATIONAL" ? "#3dff88" : "#ffcc44";
      ctx.beginPath();
      ctx.arc(22, 32, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Building name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px 'Barlow Condensed', sans-serif";
      ctx.fillText(b.name.toUpperCase(), 36, 38);

      // Tag line
      ctx.fillStyle = gc + "cc";
      ctx.font = "11px 'Share Tech Mono', monospace";
      const tag = b.tag || b.subtitle || "";
      ctx.fillText(tag.length > 32 ? tag.slice(0, 32) + "…" : tag, 14, 62);

      // Key metric
      if (b.metrics && b.metrics[0]) {
        ctx.fillStyle = gc;
        ctx.font = "bold 14px 'Barlow Condensed', sans-serif";
        ctx.fillText(b.metrics[0].v, 14, 90);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "10px 'Share Tech Mono', monospace";
        ctx.fillText(
          b.metrics[0].l,
          14 + ctx.measureText(b.metrics[0].v).width + 6,
          90,
        );
      }

      const tex = new THREE.CanvasTexture(can);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      const aspect = W / H;
      sprite.scale.set(
        ((((9 * aspect) / H) * H) / W) * 6.5,
        (((6.5 / aspect) * W) / H) * aspect,
        1,
      );
      sprite.scale.set(9, 3.1, 1);
      const bh = (b.height || 8) + 5.5;
      sprite.position.set(b.pos[0], bh, b.pos[1]);
      sprite.userData.building = b;
      sprite.userData.baseY = bh;
      scene.add(sprite);
      worldLabels.push(sprite);
    });
  }

  // ── ZONE AMBIENT POINT LIGHTS ─────────────────────────────────────────────
  // Each district gets a soft colored point light that colors the ground
  function buildZoneAmbients() {
    const zones = [
      { pos: [-14, -8], color: 0x0088cc, intensity: 0.4, dist: 28 }, // hero/auth
      { pos: [14, -8], color: 0x33aa22, intensity: 0.35, dist: 26 }, // api forge
      { pos: [0, -36], color: 0x6633aa, intensity: 0.3, dist: 30 }, // education
      { pos: [32, -8], color: 0x0066aa, intensity: 0.3, dist: 24 }, // cloud
      { pos: [-32, -8], color: 0xaa7700, intensity: 0.3, dist: 24 }, // data
      { pos: [0, 28], color: 0xcc5500, intensity: 0.28, dist: 22 }, // ops
    ];
    zones.forEach(({ pos, color, intensity, dist }) => {
      const light = new THREE.PointLight(
        color,
        isNight ? intensity : intensity * 0.3,
        dist,
      );
      light.position.set(pos[0], 1.5, pos[1]);
      light.userData.nightI = intensity;
      scene.add(light);
      zoneAmbients.push(light);
    });
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
        bg: 0xf5c08a, // Bruno Simon warm orange-peach sky
        fog: 0xf5c08a,
        fogD: 0.003, // very light fog — world is readable far away
        sun: 0xffcc88, // warm golden sun
        sunI: 3.2, // BRIGHT — Bruno's world is punchy
        fill: 0x9966cc, // cool purple-blue fill from bottom — creates depth
        fillI: 0.9,
        amb: 0xff8833, // warm amber ambient — NO dark shadows
        ambI: 0.55, // higher ambient = brighter overall scene
        exp: 1.05,
      },
      sunset: {
        bg: 0xff6030,
        fog: 0xff6030,
        fogD: 0.005,
        sun: 0xff4411,
        sunI: 2.8,
        fill: 0x5522bb,
        fillI: 1.1,
        amb: 0x440800,
        ambI: 0.25,
        exp: 1.08,
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
    // Hemisphere: sky warm, ground cool — tune per weather
    if (hemiLight) {
      const hemiConfigs = {
        day: { sky: 0xffcc88, gnd: 0x9966cc, i: 1.4 },
        night: { sky: 0x3344bb, gnd: 0x110808, i: 0.6 },
        sunset: { sky: 0xff6622, gnd: 0x5522bb, i: 1.2 },
        fog: { sky: 0xddbbaa, gnd: 0x776655, i: 0.9 },
        rain: { sky: 0x445566, gnd: 0x223344, i: 0.7 },
        snow: { sky: 0xeeddcc, gnd: 0x7799cc, i: 1.0 },
      };
      const hc = hemiConfigs[w] || hemiConfigs.day;
      hemiLight.color.set(hc.sky);
      hemiLight.groundColor.set(hc.gnd);
      hemiLight.intensity = hc.i;
    }
    if (renderer) renderer.toneMappingExposure = cfg.exp;

    isNight = w === "night";
    updateCarLights();
    updateWindowLights();

    // ── WEATHER GRIP — affects car physics (rain/snow = slide) ───────────
    const gripMap = {
      night: 1.0,
      day: 1.0,
      sunset: 1.0,
      fog: 0.72,
      rain: 0.3,
      snow: 0.12,
    };
    weatherGrip = gripMap[w] ?? 1.0;

    // ── ZONE AMBIENT INTENSITIES — dimmer in bright weather ──────────────
    zoneAmbients.forEach((l) => {
      l.intensity = isNight
        ? l.userData.nightI || 0.35
        : (l.userData.nightI || 0.35) * 0.25;
    });

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
    // Bruno Simon lighting: warm top + cool bottom hemisphere = depth without darkness
    // Plus two directional lights for shadow directionality

    // HemisphereLight: warm orange sky, cool purple ground = perfect diorama depth
    hemiLight = new THREE.HemisphereLight(0xffcc88, 0x9966cc, 1.2);
    scene.add(hemiLight);

    // Key directional: warm golden from top-front-right
    sunLight = new THREE.DirectionalLight(0xffcc88, 2.2);
    sunLight.position.set(40, 80, 30);
    scene.add(sunLight);

    // Fill: cool blue-purple from bottom-left — creates colored shadows
    fillLight = new THREE.DirectionalLight(0x7755cc, 0.85);
    fillLight.position.set(-50, -30, -40);
    scene.add(fillLight);

    // Ambient: warm so nothing is fully black
    ambLight = new THREE.AmbientLight(0xffaa66, 0.5);
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

    // ── WATER — bright teal like Bruno Simon ──
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x44aacc });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.5;
    scene.add(water);

    // Shore — slightly lighter
    const shoreMat = new THREE.MeshLambertMaterial({
      color: 0x66bbdd,
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
    // Roads: warm sandy-orange tones that complement the vivid ground
    const roadMat = new THREE.MeshLambertMaterial({ color: 0xcc9060 }); // warm sandy road
    const swMat = new THREE.MeshLambertMaterial({ color: 0xdda878 }); // slightly lighter sidewalk
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xf8e855 }); // bright yellow center line

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

    // ── MATCAP MATERIAL — pick based on glow color ─────────────────────────
    // Warm amber buildings → warm matcap, cool blue → cool, edu → stone, etc.
    let chosenMatcap = matcaps.warm; // default fallback
    const gs = b.glowColor;
    if (gs === "#00c8ff" || gs === "#4dd4ff")
      chosenMatcap = matcaps.cool || matcaps.warm;
    else if (gs === "#7dff4f") chosenMatcap = matcaps.green || matcaps.warm;
    else if (gs === "#ffcc44" || gs === "#ff9950")
      chosenMatcap = matcaps.gold || matcaps.warm;
    else if (gs === "#ff6b00") chosenMatcap = matcaps.warm;
    else if (gs === "#a78bfa" || gs === "#c084fc")
      chosenMatcap = matcaps.purple || matcaps.warm;
    else if (gs === "#34d399") chosenMatcap = matcaps.green || matcaps.warm;
    // Ensure we NEVER pass undefined to MeshMatcapMaterial
    if (!chosenMatcap) chosenMatcap = matcaps.warm;

    const bodyMat = new THREE.MeshMatcapMaterial({
      color: bColor,
      matcap: chosenMatcap,
    });
    // MeshMatcapMaterial has no emissive — proximity highlight uses color tinting instead
    bodyMat.userData.baseColor = bColor; // store for highlight restore
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2 + 0.32;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Setback top floor (architectural detail)
    if (h > 6) {
      const sbH = h * 0.35;
      const sbMat = new THREE.MeshMatcapMaterial({
        color: darken(bColor, 0.15),
        matcap: chosenMatcap,
      });
      const sb = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.7, sbH, d * 0.7),
        sbMat,
      );
      sb.position.y = h + sbH / 2 + 0.32;
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

    // ── BLOB SHADOW — tinted with zone color (replaces GPU shadow maps)
    addBlobShadow(b, g);

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

  // ── CENTERPIECE — Bruno Simon style island with bench, trees, glow ring ──
  function buildCenterpiece() {
    // Raised circular platform
    const islandMat = new THREE.MeshLambertMaterial({ color: 0xf0a870 });
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 8.2, 0.55, 18),
      islandMat,
    );
    island.position.y = 0.28;
    scene.add(island);
    const paveMat = new THREE.MeshLambertMaterial({ color: 0xf5b885 });
    const pave = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.8, 0.2, 12),
      paveMat,
    );
    pave.position.y = 0.6;
    scene.add(pave);

    // Glowing ground ring (Bruno Simon neon floor circle)
    const groundRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.8, 0.12, 4, 48),
      new THREE.MeshBasicMaterial({
        color: 0xddaaff,
        transparent: true,
        opacity: 0.85,
      }),
    );
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = 0.72;
    scene.add(groundRing);
    scene.add(ptLight(0xddaaff, 2.0, 14, [0, 1.0, 0]));

    // Wooden bench
    const woodMat = new THREE.MeshMatcapMaterial({
      color: 0xcc8844,
      matcap: matcaps.warm,
    });
    const legMat = new THREE.MeshMatcapMaterial({
      color: 0x7755aa,
      matcap: matcaps.purple,
    });
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.1, 0.35),
        woodMat,
      );
      slat.position.set(0.2, 1.12, i * 0.4);
      scene.add(slat);
    }
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.1, 0.3),
        woodMat,
      );
      slat.position.set(0.2, 1.62, i * 0.36 - 0.42);
      slat.rotation.x = 0.28;
      scene.add(slat);
    }
    [
      [-0.85, -0.6],
      [0.85, -0.6],
      [-0.85, 0.6],
      [0.85, 0.6],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.88, 0.1), legMat);
      leg.position.set(x + 0.2, 0.68, z);
      scene.add(leg);
    });

    // Lamp posts
    const poleMat = new THREE.MeshMatcapMaterial({
      color: 0x776688,
      matcap: matcaps.purple,
    });
    [-3.5, 3.5].forEach((x) => {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 3.5, 0.14),
        poleMat,
      );
      pole.position.set(x, 1.75, -1.5);
      scene.add(pole);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.28, 0.55),
        new THREE.MeshBasicMaterial({ color: 0xffeeaa }),
      );
      head.position.set(x, 3.6, -1.5);
      scene.add(head);
      scene.add(ptLight(0xffeeaa, isNight ? 2.5 : 0.4, 9, [x, 3.7, -1.5]));
    });

    // Cherry blossom trees around island — Bruno Simon signature
    [
      [4.5, 3.2],
      [-4.5, 3.2],
      [0, 5.5],
      [5.0, -2.5],
      [-5.0, -2.5],
    ].forEach(([x, z]) => {
      const trunkH = 1.6 + Math.random() * 0.8;
      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, trunkH, 0.22),
        new THREE.MeshMatcapMaterial({ color: 0x8a5228, matcap: matcaps.warm }),
      );
      trunk.position.set(x, trunkH / 2, z);
      scene.add(trunk);
      const pinks = [0xff88aa, 0xff99bb, 0xffaabb, 0xee7799];
      const r = 1.1 + Math.random() * 0.5;
      [0, 0.65 * r, -0.45 * r].forEach((ox, j) => {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(r * (0.82 + j * 0.1), 7, 5),
          new THREE.MeshMatcapMaterial({
            color: pinks[Math.floor(Math.random() * pinks.length)],
            matcap: matcaps.tree,
          }),
        );
        leaf.position.set(
          x + ox * 0.4,
          trunkH + r * 0.8 + j * 0.2,
          z + ox * 0.3,
        );
        scene.add(leaf);
      });
    });

    // Decorative stones
    const stoneMat = new THREE.MeshMatcapMaterial({
      color: 0xbbaa99,
      matcap: matcaps.stone,
    });
    [
      [2.5, 1.5],
      [-2.0, 2.8],
      [1.2, -2.4],
      [-3.0, -1.2],
    ].forEach(([x, z]) => {
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.12, 0),
        stoneMat,
      );
      stone.position.set(x, 0.65, z);
      stone.rotation.y = Math.random() * Math.PI;
      scene.add(stone);
    });

    // Downward-pointing arrow above island
    const arr = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.88, 4),
      new THREE.MeshBasicMaterial({
        color: 0xddaaff,
        transparent: true,
        opacity: 0.9,
      }),
    );
    arr.position.set(0, 5.5, 0);
    arr.rotation.z = Math.PI;
    arr.userData.isFloatArrow = true;
    arr.userData.baseY = 5.5;
    scene.add(arr);
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
      P.treeLeaf1, // pink cherry blossom
      P.treeLeaf2, // autumn red-orange
      P.treeLeaf3, // bright green
      P.treeLeaf4, // golden yellow
      P.treeLeaf5, // deep amber
    ];
    const trunkMat = new THREE.MeshMatcapMaterial({
      color: P.treeTrunk,
      matcap: matcaps.warm || matcaps.tyre,
    });

    positions.forEach(([x, z]) => {
      const h = 1.0 + Math.random() * 1.1;
      const r = 0.9 + Math.random() * 0.65;
      const isCherryBlossom = Math.random() > 0.55;

      const tg = new THREE.Group();
      tg.position.set(x, 0, z);

      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, h * 1.3, 0.22),
        trunkMat,
      );
      trunk.position.y = h * 0.65;
      tg.add(trunk);

      // Pick leaf color biased toward pink/vivid
      const lColor = leafColors[Math.floor(Math.random() * leafColors.length)];
      const lMat = new THREE.MeshMatcapMaterial({
        color: lColor,
        matcap: matcaps.tree,
      });

      let leafMesh;
      if (isCherryBlossom) {
        // Big fluffy round crown — Bruno Simon signature
        leafMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), lMat);
        leafMesh.position.y = h * 1.3 + r * 0.7;
        tg.add(leafMesh);
        // Second smaller sphere to make it look like a cloud cluster
        const leaf2 = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.7, 5, 4),
          new THREE.MeshMatcapMaterial({ color: lColor, matcap: matcaps.tree }),
        );
        leaf2.position.set(r * 0.55, h * 1.3 + r * 0.9, r * 0.3);
        tg.add(leaf2);
      } else {
        // Spiky cone pine
        leafMesh = new THREE.Mesh(
          new THREE.ConeGeometry(r * 0.75, r * 2.0, 6),
          lMat,
        );
        leafMesh.position.y = h * 1.3 + r * 0.8;
        tg.add(leafMesh);
      }

      scene.add(tg);
      trees.push({
        group: tg,
        leaf: leafMesh,
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
    // Bruno Simon: deep purple/blue poles, warm lamp heads
    const poleMat = new THREE.MeshMatcapMaterial({
      color: 0x554477,
      matcap: matcaps.purple || matcaps.cool,
    });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0xffcc66,
      transparent: true,
      opacity: 0.88,
    });

    positions.forEach(([x, z]) => {
      // Main pole
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 4.8, 0.16),
        poleMat,
      );
      pole.position.set(x, 2.4, z);
      scene.add(pole);

      // Horizontal arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.8), poleMat);
      arm.position.set(x, 5.0, z + 0.4);
      scene.add(arm);

      // Lantern housing (hexagonal = Bruno Simon style)
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.52, 6),
        poleMat,
      );
      housing.position.set(x, 5.12, z + 0.78);
      scene.add(housing);

      // Glowing inner cube
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.28, 0.3),
        headMat,
      );
      glow.position.set(x, 5.12, z + 0.78);
      scene.add(glow);

      // Glass panels (transparent sides)
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.42, 6),
        glassMat,
      );
      glass.position.set(x, 5.12, z + 0.78);
      scene.add(glass);

      // Cap
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.28, 0.12, 6),
        poleMat,
      );
      cap.position.set(x, 5.42, z + 0.78);
      scene.add(cap);

      // Point light — warm and localised like Bruno Simon
      scene.add(ptLight(0xffeeaa, isNight ? 2.8 : 0, 14, [x, 5.12, z + 0.78]));
    });
  }

  // ── GRASS PATCHES — thick clumps around world edges (Bruno Simon style) ──
  function buildGrassPatches() {
    const grassColors = [P.grass1, P.grass2, P.grass3, 0xccdd44, 0x99cc33];
    const patchPositions = [
      // Border ring of thick grass
      ...[
        [-52, 0],
        [-52, -20],
        [-52, 20],
        [-52, -40],
        [52, 0],
        [52, -20],
        [52, 20],
        [52, -40],
        [0, -52],
        [20, -52],
        [-20, -52],
        [40, -52],
        [-40, -52],
        [0, 40],
        [20, 40],
        [-20, 40],
        [30, 40],
        [-30, 40],
        // Mid-world clumps between buildings
        [-24, 14],
        [24, 14],
        [-24, -22],
        [24, -22],
        [-8, 14],
        [8, 14],
        [0, 14],
        [38, 18],
        [-38, 18],
        [38, -22],
        [-38, -22],
        [10, -48],
        [-10, -48],
        [14, -44],
        [-14, -44],
      ],
    ];

    // Normalize patch positions (handles both [[x,z]] and flat [x,z,x,z])
    function normalizePositions(positions) {
      if (!positions || positions.length === 0) return [];

      // Case 1: already correct [[x,z]]
      if (Array.isArray(positions[0])) return positions;

      // Case 2: flat array → convert to pairs
      const result = [];
      for (let i = 0; i < positions.length; i += 2) {
        if (
          typeof positions[i] === "number" &&
          typeof positions[i + 1] === "number"
        ) {
          result.push([positions[i], positions[i + 1]]);
        }
      }
      return result;
    }

    const safePositions = normalizePositions(patchPositions[0]);

    safePositions.forEach(([x, z]) => {
      const count = 3 + Math.floor(Math.random() * 4);

      for (let i = 0; i < count; i++) {
        const gx = x + (Math.random() - 0.5) * 5;
        const gz = z + (Math.random() - 0.5) * 5;

        // your existing grass creation logic
      }
    });
  }

  // ── 3D NAME LETTERS — "ADITYA SRIVASTAVA" on the ground like Bruno Simon ─
  function build3DName() {
    // We use stacked box geometry to form block letters on the ground
    // Spawn area is around [0, 18] — name placed just south of start
    const letterH = 0.55; // height above ground
    const letterD = 0.45; // depth of letter slab
    const mat = new THREE.MeshMatcapMaterial({
      color: 0xffeedd,
      matcap: matcaps.stone || matcaps.warm,
    });
    const matBlue = new THREE.MeshBasicMaterial({ color: 0x00ddff });

    // Simplified: spell out "ADITYA" in 3D block letters near spawn
    // Each letter is a group of boxes; font is pixel-art 5×7 grid
    // We'll use a sprite-based approach for simplicity & accuracy
    const W = 260,
      H = 80;
    const can = document.createElement("canvas");
    can.width = W;
    can.height = H;
    const ctx = can.getContext("2d");

    // Transparent background
    ctx.clearRect(0, 0, W, H);

    // Drop shadow
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    // Name text
    ctx.fillStyle = "#fff8f0";
    ctx.font = "bold 52px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    ctx.letterSpacing = "4px";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ADITYA", W / 2, H / 2);

    const tex = new THREE.CanvasTexture(can);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(14, 4.3, 1);
    sprite.position.set(0, 2.8, 14);
    scene.add(sprite);

    // Second line — surname
    const can2 = document.createElement("canvas");
    can2.width = 340;
    can2.height = 72;
    const ctx2 = can2.getContext("2d");
    ctx2.clearRect(0, 0, 340, 72);
    ctx2.shadowColor = "rgba(0,0,0,0.3)";
    ctx2.shadowBlur = 6;
    ctx2.fillStyle = "#ffd8aa";
    ctx2.font = "bold 42px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillText("SRIVASTAVA", 170, 36);
    const tex2 = new THREE.CanvasTexture(can2);
    const sm2 = new THREE.SpriteMaterial({ map: tex2, transparent: true });
    const sp2 = new THREE.Sprite(sm2);
    sp2.scale.set(14.5, 3.1, 1);
    sp2.position.set(0, 1.6, 14.5);
    scene.add(sp2);

    // Role label
    const can3 = document.createElement("canvas");
    can3.width = 320;
    can3.height = 44;
    const ctx3 = can3.getContext("2d");
    ctx3.clearRect(0, 0, 320, 44);
    ctx3.fillStyle = "#00ddff";
    ctx3.font = "bold 22px 'Share Tech Mono', monospace";
    ctx3.textAlign = "center";
    ctx3.textBaseline = "middle";
    ctx3.fillText("// BACKEND ARCHITECT · 4 YEARS", 160, 22);
    const tex3 = new THREE.CanvasTexture(can3);
    const sm3 = new THREE.SpriteMaterial({ map: tex3, transparent: true });
    const sp3 = new THREE.Sprite(sm3);
    sp3.scale.set(12, 1.7, 1);
    sp3.position.set(0, 0.8, 15.2);
    scene.add(sp3);

    // Physical slab under the text — like Bruno's raised ground letters
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xf5ddc8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(13, 0.22, 5), slabMat);
    slab.position.set(0, 0.11, 14.5);
    scene.add(slab);

    // Glowing accent rings in front of the name
    [1.5, 2.4].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.055, 4, 18),
        new THREE.MeshBasicMaterial({
          color: 0x00ddff,
          transparent: true,
          opacity: 0.5 - i * 0.15,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.3, 17.5);
      ring.userData.isRing = true;
      ring.userData.rotSpeed = 0.4 + i * 0.3;
      scene.add(ring);
    });
  }

  // ── CAREER TIMELINE RAIL — like Bruno Simon's glowing floor tracks ─────────
  function buildCareerTimeline() {
    // Horizontal timeline along z=-48 (education district)
    // Glowing rail with year markers and floating labels
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x00ddff,
      transparent: true,
      opacity: 0.7,
    });
    const railGold = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.7,
    });

    // Main rail — two parallel glowing lines
    [-0.3, 0.3].forEach((offset, ri) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(60, 0.06, 0.12),
        ri === 0 ? railMat : railGold,
      );
      rail.position.set(0, 0.2, -50 + offset);
      scene.add(rail);
    });

    // Year milestones — boxes on the rail with floating labels
    const milestones = [
      { year: "2015", label: "B.Sc Begins", x: -26, color: "#34d399" },
      { year: "2019", label: "B.Sc Completed", x: -16, color: "#34d399" },
      { year: "2021", label: "M.Sc CS", x: -4, color: "#a78bfa" },
      { year: "2022", label: "Trainee → Junior", x: 8, color: "#ffcc44" },
      { year: "2024", label: "Backend Architect", x: 20, color: "#ff6b00" },
    ];

    milestones.forEach(({ year, label, x, color }) => {
      const gc = parseInt(color.slice(1), 16);

      // Glowing post
      const postMat = new THREE.MeshBasicMaterial({ color: gc });
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 2.2, 0.18),
        postMat,
      );
      post.position.set(x, 1.1, -50);
      scene.add(post);

      // Top gem (diamond)
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      gem.position.set(x, 2.6, -50);
      gem.userData.isTimelineGem = true;
      gem.userData.baseY = 2.6;
      gem.userData.phase = x * 0.4;
      scene.add(gem);
      scene.add(new THREE.PointLight(gc, 0.8, 5, x, 2.5, -50));

      // Year canvas label
      const cw = 160,
        ch = 72;
      const can = document.createElement("canvas");
      can.width = cw;
      can.height = ch;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = color;
      ctx.font = "bold 28px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(year, cw / 2, 32);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "13px 'Share Tech Mono', monospace";
      ctx.fillText(label, cw / 2, 56);
      const tex = new THREE.CanvasTexture(can);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true }),
      );
      sp.scale.set(4.5, 2.0, 1);
      sp.position.set(x, 4.2, -50);
      scene.add(sp);
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
    // ── FLOATING BLOSSOM PETALS — Bruno Simon's magical atmosphere ────────
    // Pink/orange/yellow petals drifting through the air
    const cnt = 380;
    const pos = new Float32Array(cnt * 3);
    const col = new Float32Array(cnt * 3);
    const vel = new Float32Array(cnt * 3); // drift velocity per petal

    for (let i = 0; i < cnt; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      // Drift: slow horizontal + slight downward
      vel[i * 3] = (Math.random() - 0.5) * 0.012;
      vel[i * 3 + 1] = -0.006 - Math.random() * 0.008;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.012;
      // Colors: pink, soft orange, pale yellow, white
      const t = Math.random();
      if (t < 0.4) {
        // pink blossom
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.55;
        col[i * 3 + 2] = 0.68;
      } else if (t < 0.65) {
        // warm orange
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.78;
        col[i * 3 + 2] = 0.35;
      } else if (t < 0.82) {
        // soft yellow
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.55;
      } else {
        // pale white
        col[i * 3] = 1;
        col[i * 3 + 1] = 0.95;
        col[i * 3 + 2] = 0.92;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const petals = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.22,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
      }),
    );
    petals.userData.isPetals = true;
    petals.userData.vel = vel;
    scene.add(petals);
  }

  // ── CAR (Clean low-poly SUV — one unified body, correct wheels) ──────────
  function buildCar() {
    carGroup = new THREE.Group();
    wheelGroups = [];

    // ── MATCAP HELPERS ────────────────────────────────────────────────────
    function mM(key, color) {
      return new THREE.MeshMatcapMaterial({
        color,
        matcap: matcaps[key] || matcaps.warm,
      });
    }

    // ── MATERIALS ──────────────────────────────────────────────────────────
    const mBody = mM("car", 0xdd2200); // candy red — Bruno Simon exact
    const mDark = mM("carDark", 0x881200); // dark red cabin/hood
    const mBlack = mM("dark", 0x181210); // near-black chassis
    const mArch = mM("carDark", 0x771100); // wheel arch flares
    const mGlass = new THREE.MeshMatcapMaterial({
      color: 0x4477aa,
      matcap: matcaps.glass,
      transparent: true,
      opacity: 0.68,
    });
    const mChrome = mM("chrome", 0xbbbbaa);
    const mTyre = mM("tyre", 0x141210);
    const mRed = mM("car", 0xcc2000); // red trim/hubs

    // ── PROPORTIONS ───────────────────────────────────────────────────────
    // Bruno Simon key secret: wheels are HUGE relative to body
    // Body squished vertically, wheels tall and wide = toy-truck silhouette
    const WR = 0.58; // wheel radius  — BIG
    const WW = 0.46; // wheel width   — WIDE
    const WTX = 1.22; // wheel track X — very wide stance
    const WFZ = 1.55; // front axle Z
    const WRZ = -1.55; // rear  axle Z
    const AXH = WR; // axle height = wheel radius

    // Body sits close above axle
    const BY = AXH + 0.04; // body base Y
    const BH = 0.46; // body height — keep low (squished)
    const BW = 1.58; // body width
    const BD = 2.95; // body depth (length)

    const CY = BY + BH; // cabin base Y
    const CH = 0.52; // cabin height
    const CW = 1.38; // cabin width (narrower than body)
    const CD = 1.6; // cabin depth
    const CZ = -0.2; // cabin offset rearward

    const RY = CY + CH; // roof Y

    // ── UNDERCARRIAGE ────────────────────────────────────────────────────
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 0.1, 0.18, BD),
      mBlack,
    );
    under.position.y = AXH + 0.09;
    carGroup.add(under);

    // Diff humps (axle covers)
    [WFZ, WRZ].forEach((z) => {
      const hump = new THREE.Mesh(
        new THREE.BoxGeometry(BW - 0.1, 0.22, 0.55),
        mBlack,
      );
      hump.position.set(0, AXH + 0.22, z);
      carGroup.add(hump);
    });

    // ── MAIN BODY ─────────────────────────────────────────────────────────
    const body = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), mBody);
    body.position.y = BY + BH / 2;
    carGroup.add(body);
    carBodyMesh = body;

    // Side rock-sliders (black protective rails)
    [-BW / 2 - 0.02, BW / 2 + 0.02].forEach((x) => {
      const slider = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.14, BD - 0.3),
        mBlack,
      );
      slider.position.set(x, BY + 0.07, 0);
      carGroup.add(slider);
    });

    // Body crease lines (raised detail strips on sides)
    [-BW / 2 + 0.04, BW / 2 - 0.04].forEach((x) => {
      const crease = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, BH * 0.45, BD * 0.7),
        mDark,
      );
      crease.position.set(x, BY + BH * 0.55, 0);
      carGroup.add(crease);
    });

    // ── WHEEL ARCH FLARES — Bruno Simon's signature feature ───────────────
    // Super-wide flares that extend FAR beyond the body width
    const archW = 0.22; // how far flare extends outward
    const archH = 0.42;
    const archD = 1.12;
    [WFZ * 0.64, WRZ * 0.64].forEach((z) => {
      [-1, 1].forEach((side) => {
        const ox = side * (BW / 2 + archW / 2 - 0.02);
        // Main arch slab
        const arch = new THREE.Mesh(
          new THREE.BoxGeometry(archW, archH, archD),
          mArch,
        );
        arch.position.set(ox, BY + 0.22, z);
        carGroup.add(arch);
        // Arch lip — flat black bottom edge
        const lip = new THREE.Mesh(
          new THREE.BoxGeometry(archW + 0.06, 0.07, archD + 0.04),
          mBlack,
        );
        lip.position.set(ox, BY + 0.02, z);
        carGroup.add(lip);
        // Arch top bevel
        const bevel = new THREE.Mesh(
          new THREE.BoxGeometry(archW - 0.04, 0.09, archD - 0.06),
          mDark,
        );
        bevel.position.set(ox, BY + archH * 0.82, z);
        carGroup.add(bevel);
      });
    });

    // ── CABIN ─────────────────────────────────────────────────────────────
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CD), mDark);
    cabin.position.set(0, CY + CH / 2, CZ);
    carGroup.add(cabin);

    // Cabin corner pillars (A/B pillars) — Bruno Simon detail
    [
      [-CW / 2 + 0.06, CD * 0.46],
      [CW / 2 - 0.06, CD * 0.46],
      [-CW / 2 + 0.06, -CD * 0.46],
      [CW / 2 - 0.06, -CD * 0.46],
    ].forEach(([x, z]) => {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, CH, 0.1),
        mBlack,
      );
      pillar.position.set(x, CY + CH / 2, CZ + z);
      carGroup.add(pillar);
    });

    // ── ROOF ──────────────────────────────────────────────────────────────
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(CW + 0.05, 0.1, CD + 0.02),
      mBlack,
    );
    roof.position.set(0, RY + 0.05, CZ);
    carGroup.add(roof);

    // Roof rack rails
    [-CW / 2 + 0.1, CW / 2 - 0.1].forEach((x) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, CD * 0.78),
        mChrome,
      );
      rail.position.set(x, RY + 0.1, CZ);
      carGroup.add(rail);
    });
    // Roof rack cross-bars
    [-0.38, 0.18, 0.62].forEach((zOff) => {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(CW * 0.82, 0.04, 0.05),
        mChrome,
      );
      bar.position.set(0, RY + 0.115, CZ + zOff - 0.1);
      carGroup.add(bar);
    });

    // LED light bar on roof-front (glowing)
    const ledBar = new THREE.Mesh(
      new THREE.BoxGeometry(CW * 0.92, 0.07, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xfffbe8 }),
    );
    ledBar.position.set(0, RY + 0.12, CZ + CD / 2 - 0.04);
    carGroup.add(ledBar);
    const ledPt = new THREE.PointLight(0xfffbe8, isNight ? 1.8 : 0, 10);
    ledPt.position.set(0, RY + 0.22, CZ + CD / 2 + 0.5);
    carGroup.add(ledPt);

    // ── HOOD ──────────────────────────────────────────────────────────────
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.12, 0.09, 0.92),
      mBody,
    );
    hood.position.set(0, BY + BH + 0.045, WFZ * 0.72);
    carGroup.add(hood);
    // Power bulge
    const bulge = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.06, 0.72),
      mDark,
    );
    bulge.position.set(0, BY + BH + 0.085, WFZ * 0.72);
    carGroup.add(bulge);

    // ── WINDSHIELDS ───────────────────────────────────────────────────────
    // Front windshield — slightly angled
    const wsF = new THREE.Mesh(
      new THREE.BoxGeometry(CW - 0.08, CH * 0.82, 0.08),
      mGlass,
    );
    wsF.position.set(0, CY + CH * 0.48, CZ + CD / 2 + 0.01);
    wsF.rotation.x = 0.24;
    carGroup.add(wsF);
    // Rear windshield
    const wsR = new THREE.Mesh(
      new THREE.BoxGeometry(CW - 0.08, CH * 0.78, 0.08),
      mGlass,
    );
    wsR.position.set(0, CY + CH * 0.46, CZ - CD / 2 - 0.01);
    wsR.rotation.x = -0.22;
    carGroup.add(wsR);
    // Side windows
    [-1, 1].forEach((side) => {
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, CH * 0.74, CD * 0.68),
        mGlass,
      );
      sw.position.set(side * (CW / 2 + 0.02), CY + CH * 0.5, CZ);
      carGroup.add(sw);
    });

    // ── FRONT FACE ────────────────────────────────────────────────────────
    // Grille surround (full front face)
    const gFront = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.06, BH * 0.72, 0.09),
      mBlack,
    );
    gFront.position.set(0, BY + BH * 0.38, WFZ + BD / 2 - 0.04);
    carGroup.add(gFront);

    // Horizontal grille slats
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(BW - 0.28, 0.04, 0.06),
        mDark,
      );
      slat.position.set(0, BY + 0.08 + i * 0.08, WFZ + BD / 2 + 0.01);
      carGroup.add(slat);
    }

    // Round headlights — G-Wagon / Bruno Simon style
    [-0.54, 0.54].forEach((x) => {
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12),
        mBlack,
      );
      housing.rotation.x = Math.PI / 2;
      housing.position.set(x, BY + BH * 0.52, WFZ + BD / 2 + 0.01);
      carGroup.add(housing);
      // Lens
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.155, 12),
        new THREE.MeshBasicMaterial({ color: 0xffeeaa }),
      );
      lens.position.set(x, BY + BH * 0.52, WFZ + BD / 2 + 0.06);
      carGroup.add(lens);
      // DRL ring
      const drl = new THREE.Mesh(
        new THREE.TorusGeometry(0.175, 0.022, 6, 14),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      drl.position.set(x, BY + BH * 0.52, WFZ + BD / 2 + 0.055);
      carGroup.add(drl);
    });

    // Headlight point lights
    carHL = new THREE.PointLight(0xffe8aa, isNight ? 8 : 0, 16);
    carHL.position.set(0, BY + BH * 0.5, WFZ + BD / 2 + 1.2);
    carGroup.add(carHL);
    carHR = carHL; // single forward light, share ref

    // Front bumper
    const bmpF = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 0.08, 0.2, 0.17),
      mBlack,
    );
    bmpF.position.set(0, BY + 0.1, WFZ + BD / 2 + 0.04);
    carGroup.add(bmpF);
    // Bull-bar
    const bull = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.28, 0.2, 0.1),
      mChrome,
    );
    bull.position.set(0, BY + 0.3, WFZ + BD / 2 + 0.07);
    carGroup.add(bull);
    // Bull-bar uprights
    [-0.44, 0.44].forEach((x) => {
      const up = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, BH * 0.55, 0.09),
        mChrome,
      );
      up.position.set(x, BY + BH * 0.28, WFZ + BD / 2 + 0.07);
      carGroup.add(up);
    });
    // Tow hooks
    [-0.38, 0.38].forEach((x) => {
      const hk = new THREE.Mesh(
        new THREE.TorusGeometry(0.065, 0.02, 5, 9),
        mM("gold", 0xddaa00),
      );
      hk.rotation.y = Math.PI / 2;
      hk.position.set(x, BY + 0.06, WFZ + BD / 2 + 0.1);
      carGroup.add(hk);
    });

    // ── REAR FACE ────────────────────────────────────────────────────────
    // Full-width tail light strip
    const tStrip = new THREE.Mesh(
      new THREE.BoxGeometry(BW - 0.12, 0.07, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xff1800 }),
    );
    tStrip.position.set(0, BY + BH * 0.72, WRZ - BD / 2 - 0.02);
    carGroup.add(tStrip);
    // Reverse lights
    [-0.42, 0.42].forEach((x) => {
      const rev = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.12, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xffeedd }),
      );
      rev.position.set(x, BY + BH * 0.32, WRZ - BD / 2 - 0.02);
      carGroup.add(rev);
    });
    // Rear bumper
    const bmpR = new THREE.Mesh(
      new THREE.BoxGeometry(BW + 0.08, 0.19, 0.16),
      mBlack,
    );
    bmpR.position.set(0, BY + 0.1, WRZ - BD / 2 - 0.04);
    carGroup.add(bmpR);
    // Tail-pipe
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.22, 7),
      mChrome,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-BW / 2 + 0.2, BY + 0.06, WRZ - BD / 2 - 0.08);
    carGroup.add(pipe);

    // Tail lights point-light
    carTL = new THREE.PointLight(0xff1800, isNight ? 2.8 : 0, 8);
    carTL.position.set(0, BY + BH * 0.7, WRZ - BD / 2 - 1.0);
    carGroup.add(carTL);
    carTR = carTL; // share ref

    // ── WHEELS × 4 ───────────────────────────────────────────────────────
    // Larger, fatter wheels — Bruno Simon's most iconic visual
    [
      [WTX, AXH, WFZ, false], // FR
      [-WTX, AXH, WFZ, true], // FL
      [WTX, AXH, WRZ, false], // RR
      [-WTX, AXH, WRZ, true], // RL
    ].forEach(([wx, wy, wz, isLeft]) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      carGroup.add(wg);

      // Spin group — rotation.x = forward roll
      const sg = new THREE.Group();
      wg.add(sg);
      wheelGroups.push(sg);

      // ── TYRE ──────────────────────────────────────────────────────────
      const tyre = new THREE.Mesh(
        new THREE.CylinderGeometry(WR, WR, WW, 14),
        mTyre,
      );
      tyre.rotation.z = Math.PI / 2;
      sg.add(tyre);

      // Tread ribs (chunky off-road detail)
      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2;
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(WW + 0.02, WR * 0.12, WR * 0.22),
          new THREE.MeshMatcapMaterial({
            color: 0x1e1a14,
            matcap: matcaps.tyre || matcaps.dark,
          }),
        );
        rib.rotation.x = ang;
        rib.position.y = 0;
        sg.add(rib);
      }

      // ── RED INNER RIM RING ────────────────────────────────────────────
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.76, WR * 0.76, WW + 0.04, 14),
        mRed,
      );
      rim.rotation.z = Math.PI / 2;
      sg.add(rim);

      // ── 5-SPOKE WHEEL FACE (outer side) ──────────────────────────────
      const outerX = isLeft ? -(WW / 2 + 0.015) : WW / 2 + 0.015;
      const faceDir = isLeft ? -1 : 1;

      // Hub disc — solid red
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(WR * 0.38, WR * 0.38, 0.06, 12),
        mRed,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = outerX + faceDir * 0.008;
      sg.add(hub);

      // 5 spokes fanning out from hub
      for (let s = 0; s < 5; s++) {
        const ang = (s / 5) * Math.PI * 2;
        const spk = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, WR * 1.18, WW * 0.28),
          mChrome,
        );
        spk.rotation.x = ang;
        spk.position.x = outerX;
        sg.add(spk);
      }

      // Center cap
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8),
        mChrome,
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.x = outerX + faceDir * 0.035;
      sg.add(cap);

      // Cap logo dot
      const logo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.02, 6),
        new THREE.MeshBasicMaterial({ color: 0x00ddff }),
      );
      logo.rotation.z = Math.PI / 2;
      logo.position.x = outerX + faceDir * 0.065;
      sg.add(logo);
    });

    // ── CAR TOP-LIGHT (warm fill from above — studio look) ────────────────
    const carTopLight = new THREE.PointLight(0xffcc88, isNight ? 2.2 : 1.0, 5);
    carTopLight.position.set(0, 3.8, 0);
    carGroup.add(carTopLight);

    // ── BLOB SHADOW ───────────────────────────────────────────────────────
    const shadowDisc = new THREE.Mesh(
      new THREE.EllipseCurve()
        ? new THREE.CircleGeometry(2.6, 20)
        : new THREE.CircleGeometry(2.6, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.scale.set(1, 0.65, 1); // oval under car
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
    // ── TOUCH JOYSTICK INPUT — merged with keyboard ───────────────────────
    const tj = window._touchJoy || { ax: 0, ay: 0 };
    const fwd = keys["ArrowUp"] || keys["KeyW"] || tj.ay < -0.25;
    const bwd = keys["ArrowDown"] || keys["KeyS"] || tj.ay > 0.25;
    const lft = keys["ArrowLeft"] || keys["KeyA"] || tj.ax < -0.25;
    const rgt = keys["ArrowRight"] || keys["KeyD"] || tj.ax > 0.25;
    const brk = keys["Space"];

    // Touch analog — partial throttle when stick partially pushed
    const fwdStr = tj.ay < 0 ? Math.min(1, -tj.ay / 0.6) : fwd ? 1 : 0;
    // FIX: left arrow = positive carAngle change = turn left. lft→+1, rgt→-1
    const steerStr = Math.abs(tj.ax) > 0.15 ? -tj.ax : lft ? 1 : rgt ? -1 : 0;

    // ── WEATHER GRIP PHYSICS ─────────────────────────────────────────────
    // Rain/snow = real slip — grip < 1 makes car slide past intended direction
    const gripAccel = ACCEL * weatherGrip;
    const gripDecel = DECEL * (0.6 + weatherGrip * 0.4);
    const gripTurn = TURN * (0.5 + weatherGrip * 0.5);
    const maxSpd = MAX_SPD * (0.7 + weatherGrip * 0.3);

    // Acceleration
    if (fwd || fwdStr > 0)
      carSpeed = Math.min(carSpeed + gripAccel * fwdStr, maxSpd);
    else if (bwd)
      carSpeed = Math.max(
        carSpeed - BRAKE * 0.65 * weatherGrip,
        -maxSpd * 0.45,
      );
    else {
      carSpeed += carSpeed > 0 ? -gripDecel : carSpeed < 0 ? gripDecel : 0;
      if (Math.abs(carSpeed) < 0.002) carSpeed = 0;
    }
    if (brk) {
      carSpeed *= 0.88;
      if (Math.abs(carSpeed) < 0.002) carSpeed = 0;
    }

    // Steering — scaled by grip (low grip = heavy understeer)
    if (Math.abs(carSpeed) > 0.005) {
      const dir = carSpeed > 0 ? 1 : -1;
      const sf = Math.min(Math.abs(carSpeed) / (MAX_SPD * 0.5), 1.0);
      carAngle += steerStr * gripTurn * sf * dir;
    }

    // ── SLIDE DRIFT on low grip ───────────────────────────────────────────
    // Car drifts outward on corners — steerStr positive = left = drift right
    const slip = 1 - weatherGrip;
    const sinA = Math.sin(carAngle),
      cosA = Math.cos(carAngle);
    // Lateral = perpendicular to forward direction
    const latX = cosA; // +cosA = rightward lateral
    const latZ = -sinA;
    const nx =
      carX +
      sinA * carSpeed +
      latX * -steerStr * slip * Math.abs(carSpeed) * 0.3;
    const nz =
      carZ +
      cosA * carSpeed +
      latZ * -steerStr * slip * Math.abs(carSpeed) * 0.3;

    if (!collides(nx, nz)) {
      carX = nx;
      carZ = nz;
      if (Math.abs(carSpeed) > 0.1) shakeNearbyTrees(carX, carZ, 2.5);
    } else {
      if (crashCooldown <= 0 && Math.abs(carSpeed) > 0.04) {
        playCrash();
        shakeCam();
        shakeNearbyTrees(carX, carZ, 6);
        crashCooldown = 45;
      }
      carSpeed *= -0.3;
    }
    if (crashCooldown > 0) crashCooldown--;
    carX = Math.max(-70, Math.min(70, carX));
    carZ = Math.max(-55, Math.min(40, carZ));

    carGroup.position.set(carX, 0, carZ);
    carGroup.rotation.y = carAngle;

    const spin = Math.abs(carSpeed) * 2.2 * (carSpeed >= 0 ? 1 : -1);
    wheelGroups.forEach((sg) => {
      sg.rotation.x += spin;
    });

    // Body roll — exaggerated on slippery surfaces
    const steerVal = steerStr;
    carGroup.rotation.z +=
      (steerVal * carSpeed * (0.07 + slip * 0.08) - carGroup.rotation.z) * 0.12;

    // Bounce
    carGroup.position.y = Math.abs(
      Math.sin(Date.now() * 0.016) * carSpeed * 0.015,
    );

    // Camera — Bruno Simon: tight behind car, 35-40° angle down
    const camDist = 15,
      camH = 10.5;
    const tx = carX - sinA * camDist;
    const tz = carZ - cosA * camDist;
    camera.position.x += (tx - camera.position.x) * 0.09;
    camera.position.y += (camH - camera.position.y) * 0.055;
    camera.position.z += (tz - camera.position.z) * 0.09;
    camera.lookAt(carX + sinA * 3, 0.6, carZ + cosA * 3);

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
      const baseHex =
        bm.bodyMat.userData.baseColor || bm.bodyMat.color.getHex();
      if (!bm.bodyMat.userData.baseColor)
        bm.bodyMat.userData.baseColor = baseHex;
      if (on) {
        const gc = pc(bm.building.glowColor);
        const baseC = new THREE.Color(baseHex);
        const glowC = new THREE.Color(gc);
        bm.bodyMat.color.setRGB(
          Math.min(1, baseC.r + glowC.r * 0.22),
          Math.min(1, baseC.g + glowC.g * 0.22),
          Math.min(1, baseC.b + glowC.b * 0.22),
        );
        const bs = blobShadows.find((s) => s.building.id === id);
        if (bs) bs.mesh.material.opacity = 0.85;
      } else {
        bm.bodyMat.color.setHex(baseHex);
        const bs = blobShadows.find((s) => s.building.id === id);
        if (bs) bs.mesh.material.opacity = 0.6;
      }
    });
  }

  function enterNearestBuilding() {
    if (!proximityBuilding) return;
    window.CityUI?.openBuilding(proximityBuilding);
    // ── CONFETTI BURST — Bruno Simon celebration effect ────────────────
    spawnConfetti(carX, carZ, pc(proximityBuilding.glowColor));
  }

  function spawnConfetti(cx, cz, color) {
    const colors = [color, 0xff88aa, 0xffcc44, 0x7dff4f, 0x00ddff, 0xff9950];
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
    });
    const pieces = [];
    for (let i = 0; i < 40; i++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, 0.04),
        new THREE.MeshBasicMaterial({
          color: colors[Math.floor(Math.random() * colors.length)],
          transparent: true,
          opacity: 0.92,
        }),
      );
      c.position.set(
        cx + (Math.random() - 0.5) * 2,
        1.5,
        cz + (Math.random() - 0.5) * 2,
      );
      c.userData.vx = (Math.random() - 0.5) * 0.22;
      c.userData.vy = 0.12 + Math.random() * 0.18;
      c.userData.vz = (Math.random() - 0.5) * 0.22;
      c.userData.life = 1.0;
      scene.add(c);
      pieces.push(c);
    }
    confettiPieces.push(...pieces);
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
      if (isNight) {
        wm.mat.opacity = wm.isLit ? 0.88 : 0.05;
      } else {
        // Day: windows slightly visible as dark recesses for architectural detail
        wm.mat.opacity = 0.18;
      }
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
      // Bruno Simon: marker fades in at distance, brightens on close approach
      const farAlpha = Math.max(0, Math.min(1, (dist - 2) / 14));
      const nearPulse = dist < 10 ? Math.sin(t * 3.5) * 0.3 + 0.9 : 1.0;

      group.traverse((c) => {
        if (
          c.isMesh &&
          c.material &&
          c.material.transparent &&
          c.material.opacity >= 0
        ) {
          if (!c.userData._mbo) c.userData._mbo = c.material.opacity;
          c.material.opacity = c.userData._mbo * farAlpha * nearPulse;
        }
      });

      if (diamond) {
        const bh = group.userData.beamH || 10;
        // Float & spin
        diamond.position.y =
          bh + 0.6 + Math.sin(t * 2.1 + diamond.userData.floatPhase) * 0.52;
        diamond.rotation.y = t * 1.8;
        if (pRing) pRing.position.y = diamond.position.y;
        // Squish scale pulse
        const sq = 1 + Math.sin(t * 2.8) * 0.12;
        diamond.scale.set(sq, 1 / sq, sq);
      }
      if (pRing) {
        const s = 1 + Math.sin(t * 2.4 + building.pos[0]) * 0.18;
        pRing.scale.set(s, s, 1);
      }
      group.children.forEach((c) => {
        if (c.userData.cpRing) {
          const rs = 1 + Math.sin(t * 2.2 + c.userData.phase) * 0.16;
          c.scale.set(rs, 1, rs);
        }
      });
    });

    // ── BLOSSOM PETAL DRIFT ──────────────────────────────────────────────────
    scene.children.forEach((c) => {
      if (!c.userData.isPetals) return;
      const pos = c.geometry.attributes.position.array;
      const vel = c.userData.vel;
      const cnt = pos.length / 3;
      for (let i = 0; i < cnt; i++) {
        pos[i * 3] += vel[i * 3];
        pos[i * 3 + 1] += vel[i * 3 + 1];
        pos[i * 3 + 2] += vel[i * 3 + 2];
        // Add gentle sine sway
        pos[i * 3] += Math.sin(t * 0.7 + i * 0.4) * 0.003;
        // Reset petals that fall below ground
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3] = (Math.random() - 0.5) * 90;
          pos[i * 3 + 1] = 16 + Math.random() * 4;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
        }
      }
      c.geometry.attributes.position.needsUpdate = true;
    });
    scene.children.forEach((c) => {
      if (c.userData.isTimelineGem) {
        c.position.y =
          c.userData.baseY + Math.sin(t * 1.8 + c.userData.phase) * 0.22;
        c.rotation.y = t * 1.2;
      }
      if (c.userData.isFloatArrow) {
        c.position.y = c.userData.baseY + Math.sin(t * 2.2) * 0.28;
      }
    });
    worldLabels.forEach((sprite) => {
      const b = sprite.userData.building;
      const rx = b.roadPos ? b.roadPos[0] : b.pos[0];
      const rz = b.roadPos ? b.roadPos[1] : b.pos[1];
      const dist = Math.hypot(carX - rx, carZ - rz);
      const target = dist < 16 && dist > 3 ? Math.min(1, (16 - dist) / 8) : 0;
      sprite.material.opacity += (target - sprite.material.opacity) * 0.08;
      // Gentle float
      sprite.position.y =
        sprite.userData.baseY + Math.sin(t * 1.3 + b.pos[0] * 0.4) * 0.18;
    });

    // ── CONFETTI UPDATE ──────────────────────────────────────────────────────
    if (confettiPieces.length > 0) {
      confettiPieces = confettiPieces.filter((c) => {
        c.userData.vy -= 0.008; // gravity
        c.position.x += c.userData.vx;
        c.position.y += c.userData.vy;
        c.position.z += c.userData.vz;
        c.rotation.x += 0.18;
        c.rotation.y += 0.12;
        c.userData.life -= 0.025;
        c.material.opacity = c.userData.life * 0.92;
        if (c.userData.life <= 0) {
          scene.remove(c);
          return false;
        }
        return true;
      });
    }

    // ── PROXIMITY GLOW PULSE on highlighted building ─────────────────────────
    if (isNight) {
      buildingMeshes.forEach(({ bodyMat, building }) => {
        const baseHex = bodyMat.userData.baseColor;
        if (!baseHex) return;
        const gc = pc(building.glowColor);
        const glowC = new THREE.Color(gc);
        const baseC = new THREE.Color(baseHex);
        const curr = bodyMat.color;
        // Only pulse if currently highlighted (colour differs from base)
        if (
          Math.abs(curr.r - baseC.r) > 0.015 ||
          Math.abs(curr.g - baseC.g) > 0.015
        ) {
          const p = Math.sin(t * 2.4) * 0.02;
          bodyMat.color.setRGB(
            Math.min(1, curr.r + p),
            Math.min(1, curr.g + p * (glowC.g + 0.1)),
            Math.min(1, curr.b + p * (glowC.b + 0.1)),
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
    get weatherGrip() {
      return weatherGrip;
    },
  };
})();
