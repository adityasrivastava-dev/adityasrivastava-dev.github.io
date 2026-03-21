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
  const ACCEL = 0.024; // faster acceleration for bigger world
  const BRAKE = 0.03;
  const DECEL = 0.008;
  const MAX_SPD = 0.38; // higher top speed
  const TURN = 0.044; // slightly more responsive steering
  const PROX = 30; // large world — show notification from further away
  const CAR_HW = 0.85;
  const CAR_HD = 1.3;
  let weatherGrip = 1.0; // 1.0 = dry, 0.3 = rain, 0.12 = snow

  // ── PALETTE — Hindu Temple City (Firefly reference) ────────────────────
  const P = {
    // Ground: deep warm terracotta-red like Indian temple stone plaza
    ground: 0xc86a44, // deep terracotta
    groundAlt: 0xb85c38,
    road: 0xaa5533, // dark brick-red road
    sidewalk: 0xd47a55, // warm sandstone plaza
    roadLine: 0xffe066, // golden dashes

    // Buildings palette (not used in temple renderer but kept for compat)
    b1: 0xf0d0a0,
    b2: 0xf5d8b0,
    b3: 0xffe8c8,
    b4: 0xe8c898,
    b5: 0xf0d8a8,
    b6: 0xe0c090,
    b7: 0xf8e0b8,
    b8: 0xecd0a0,

    roofDark: 0xcc8844,
    roofRed: 0xdd9933,
    roofGrey: 0xaa8855,

    // Trees: deep Indian greens with some tropical colors
    treeTrunk: 0x6a4422,
    treeLeaf1: 0x336633, // deep forest green
    treeLeaf2: 0x447744, // medium green
    treeLeaf3: 0x558844, // brighter green
    treeLeaf4: 0x66aa33, // lawn green
    treeLeaf5: 0x228833, // dark tropical green
    treeSpike: 0x224422, // dark pine

    // Grass patches — deep rich greens (like the manicured gardens in video)
    grass1: 0x3a7733,
    grass2: 0x4a8833,
    grass3: 0x336622,

    lampPole: 0xcc9944,
    lampHead: 0xffeeaa,

    carBody: 0xdd2200,
    carDark: 0x881200,
    carBlack: 0x181210,
    carGlass: 0x5588bb,
    carChrome: 0xbbbbaa,
    carTyre: 0x141210,
    carHub: 0xcc2000,

    water: 0x3399cc, // clear blue water channels like the video
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

    camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 600);
    camera.position.set(0, 18, 42);
    camera.lookAt(0, 2, 20);

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
        buildStambha();
        buildFormalGardens();
        progress(72, "TEMPLES RISING");
      },
      () => {
        buildCheckpoints();
        buildAtmosphere();
        buildWaveLines();
        buildPrayerFlags();
        buildSignPosts();
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
    matcaps.warm = createMatcap("#ffeecc", "#ddaa66", "#774422"); // warm sandstone
    matcaps.cool = createMatcap("#ddeeff", "#6699cc", "#224466"); // cool marble
    matcaps.stone = createMatcap("#ffffff", "#f5e0c0", "#cc9966"); // WHITE MARBLE — like Akshardham
    matcaps.gold = createMatcap("#ffe566", "#ddaa00", "#553300"); // burnished gold
    matcaps.green = createMatcap("#88dd44", "#336622", "#0a1a04"); // deep tropical green
    matcaps.purple = createMatcap("#ffddff", "#dd99ff", "#663388"); // pale violet
    matcaps.car = createMatcap(
      "#ff9977",
      "#dd2200",
      "#440000",
      "rgba(255,230,220,0.95)",
    );
    matcaps.carDark = createMatcap("#ee5533", "#991100", "#220000");
    matcaps.chrome = createMatcap("#ffffee", "#ccccaa", "#444433"); // polished metal
    matcaps.glass = createMatcap("#99ccff", "#3366aa", "#001133");
    matcaps.tyre = createMatcap("#333222", "#151210", "#050404");
    matcaps.tree = createMatcap("#77cc44", "#336622", "#0a1a04"); // deep green foliage
    matcaps.dark = createMatcap("#443322", "#221108", "#080402");
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
    // Firefly-style blue speech bubble tooltips that appear as you approach
    window.CITY_DATA.buildings.forEach((b) => {
      const W = 320,
        H = 110;
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");

      // ── SPEECH BUBBLE BACKGROUND (matches the Firefly video exactly) ────
      const BG = "rgba(22, 55, 88, 0.94)"; // deep blue like the video tooltips
      const BORDER = "#44aaff";

      // Rounded rectangle body
      ctx.fillStyle = BG;
      ctx.shadowColor = "#3399ff";
      ctx.shadowBlur = 12;
      if (ctx.roundRect) ctx.roundRect(3, 3, W - 6, H - 22, 10);
      else ctx.rect(3, 3, W - 6, H - 22);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 2;
      if (ctx.roundRect) ctx.roundRect(3, 3, W - 6, H - 22, 10);
      else ctx.rect(3, 3, W - 6, H - 22);
      ctx.stroke();

      // Speech bubble pointer triangle at bottom
      ctx.fillStyle = BG;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 10, H - 22);
      ctx.lineTo(W / 2 + 10, H - 22);
      ctx.lineTo(W / 2, H - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 10, H - 22);
      ctx.lineTo(W / 2, H - 2);
      ctx.lineTo(W / 2 + 10, H - 22);
      ctx.stroke();

      // Top left icon (temple type symbol)
      const icons = {
        gopuram: "🏛",
        shikhara: "⛩",
        mandapa: "🏗",
        stupa: "🔵",
      };
      const icon = icons[b.templeType] || "◈";
      ctx.font = "16px serif";
      ctx.fillText(icon, 10, 25);

      // Building name — white, prominent
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 19px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      ctx.fillText(b.name, 34, 26);

      // Subtitle in light blue
      ctx.fillStyle = "#88ccff";
      ctx.font = "11px 'Share Tech Mono', monospace";
      const sub = (b.subtitle || b.tag || "").substring(0, 32);
      ctx.fillText(sub, 10, 48);

      // Status + key metric
      const statusColor =
        b.status === "OPERATIONAL"
          ? "#44ff88"
          : b.status === "ACTIVE"
            ? "#ffcc44"
            : b.status === "COMPLETED"
              ? "#aa88ff"
              : "#aaaaaa";
      ctx.fillStyle = statusColor;
      ctx.font = "bold 10px 'Share Tech Mono', monospace";
      ctx.fillText("● " + (b.status || "ACTIVE"), 10, 68);

      // Key metric value on the right
      if (b.metrics && b.metrics[0]) {
        ctx.fillStyle = "#ffe088";
        ctx.font = "bold 17px 'Barlow Condensed', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(b.metrics[0].v + " " + b.metrics[0].l, W - 12, 68);
        ctx.textAlign = "left";
      }

      // Tech tags row
      if (b.tech && b.tech.length) {
        const tags = b.tech.slice(0, 3).join("  ·  ");
        ctx.fillStyle = "rgba(136,204,255,0.55)";
        ctx.font = "9px 'Share Tech Mono', monospace";
        ctx.fillText(tags, 10, 84);
      }

      const tex = new THREE.CanvasTexture(can);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(11, 3.85, 1);
      const bh = (b.height || 12) + 7.5;
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
      { pos: [-32, -24], color: 0x0088cc, intensity: 0.45, dist: 32 },
      { pos: [32, -24], color: 0x33aa22, intensity: 0.42, dist: 32 },
      { pos: [68, -8], color: 0x0066aa, intensity: 0.35, dist: 28 },
      { pos: [68, 28], color: 0x22aa44, intensity: 0.32, dist: 26 },
      { pos: [-68, -8], color: 0xaa8800, intensity: 0.38, dist: 28 },
      { pos: [-68, 28], color: 0xcc5500, intensity: 0.35, dist: 26 },
      { pos: [-32, 24], color: 0xcc5500, intensity: 0.32, dist: 24 },
      { pos: [32, 24], color: 0x8833cc, intensity: 0.32, dist: 24 },
      { pos: [32, 58], color: 0x3388cc, intensity: 0.3, dist: 24 },
      { pos: [-32, 58], color: 0xcc7722, intensity: 0.3, dist: 24 },
      { pos: [-22, -72], color: 0x7744cc, intensity: 0.35, dist: 26 },
      { pos: [22, -72], color: 0x22aa77, intensity: 0.35, dist: 26 },
    ];
    zones.forEach(({ pos, color, intensity, dist }) => {
      const light = new THREE.PointLight(
        color,
        isNight ? intensity : intensity * 0.2,
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
        fogD: 0.004,
        sun: 0xff9966,
        sunI: 1.4,
        fill: 0x3344bb,
        fillI: 1.2,
        amb: 0x110806,
        ambI: 0.3,
        exp: 1.15,
      },
      day: {
        bg: 0xf0c898, // Firefly golden-warm sky
        fog: 0xf0c898,
        fogD: 0.0012, // very light — see temples far away
        sun: 0xffe088, // warm golden east light
        sunI: 3.8, // bright golden hour
        fill: 0x8866cc, // cool purple twilight from west
        fillI: 0.75,
        amb: 0xffcc77, // warm golden ambient
        ambI: 0.65,
        exp: 1.08,
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
    // Firefly reference: golden sunset light from the RIGHT (east)
    // Warm sky from east, cool purple-blue from west/above = depth

    // HemisphereLight: warm golden sky, cool twilight ground
    hemiLight = new THREE.HemisphereLight(0xffe8aa, 0x7755aa, 1.4);
    scene.add(hemiLight);

    // Key light: golden sunset FROM THE EAST (right side of scene)
    sunLight = new THREE.DirectionalLight(0xffdd88, 3.5);
    sunLight.position.set(80, 45, 10); // east side, low angle = golden hour
    scene.add(sunLight);

    // Fill: cool blue-purple from the west/overhead — creates depth
    fillLight = new THREE.DirectionalLight(0x8866dd, 0.8);
    fillLight.position.set(-60, 30, -20);
    scene.add(fillLight);

    // Warm ambient — nothing fully dark in temple city
    ambLight = new THREE.AmbientLight(0xffcc88, 0.65);
    scene.add(ambLight);
  }

  // ── GROUND ───────────────────────────────────────────────────────────────
  function buildGround() {
    buildLightingObjects();

    // ── BASE GROUND — warm sandy peach like Bruno Simon ──
    const grassMat = new THREE.MeshLambertMaterial({ color: P.ground });
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(400, 0.4, 400),
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
    const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), waterMat);
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
    // Deep terracotta paving matching the Firefly reference
    const roadMat = new THREE.MeshLambertMaterial({ color: 0xaa5533 }); // brick-red road
    const swMat = new THREE.MeshLambertMaterial({ color: 0xcc7755 }); // warm terracotta plaza
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xffe066 }); // golden dashes
    const waterChannelMat = new THREE.MeshLambertMaterial({ color: 0x2288bb }); // bright blue channels

    function road(x1, z1, x2, z2, w) {
      const dx = x2 - x1,
        dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const ang = Math.atan2(dx, dz);

      // Wide sandstone plaza border
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(w + 5.0, 0.22, len),
        swMat,
      );
      sw.rotation.y = ang;
      sw.position.set((x1 + x2) / 2, 0.11, (z1 + z2) / 2);
      scene.add(sw);

      // Road surface
      const rd = new THREE.Mesh(new THREE.BoxGeometry(w, 0.23, len), roadMat);
      rd.rotation.y = ang;
      rd.position.set((x1 + x2) / 2, 0.12, (z1 + z2) / 2);
      scene.add(rd);

      // Dashed center line
      const segs = Math.floor(len / 5.0);
      for (let s = 0; s < segs; s++) {
        const t = (s + 0.5) / segs;
        const dl = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.01, 1.8),
          lineMat,
        );
        dl.rotation.y = ang;
        dl.position.set(x1 + dx * t, 0.24, z1 + dz * t);
        scene.add(dl);
      }

      // Water channels alongside the road (like the blue channels in the video)
      // Only add to main horizontal/vertical arteries, not every road
    }

    // Helper: add blue water channel alongside a road
    function waterChannel(x1, z1, x2, z2, side) {
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.sqrt(dx * dx + dz * dz),
        ang = Math.atan2(dx, dz);
      const perpX = Math.cos(ang) * side,
        perpZ = -Math.sin(ang) * side;
      const offset = 8.5;
      const chan = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.35, len),
        waterChannelMat,
      );
      chan.rotation.y = ang;
      chan.position.set(
        (x1 + x2) / 2 + perpX * offset,
        -0.05,
        (z1 + z2) / 2 + perpZ * offset,
      );
      scene.add(chan);
      // Low stone wall beside channel
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xcc9966 });
      [-0.6, 0.6].forEach((wo) => {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.45, len),
          wallMat,
        );
        wall.rotation.y = ang;
        wall.position.set(
          (x1 + x2) / 2 + perpX * (offset + wo * 1.5),
          0.22,
          (z1 + z2) / 2 + perpZ * (offset + wo * 1.5),
        );
        scene.add(wall);
      });
    }

    const RW = 11;

    // ── MAIN BOULEVARD — horizontal spine z=0, full width ─────────────────
    road(-90, 0, 90, 0, RW);
    // ── UPPER BOULEVARD z=-14 — hero zone ──────────────────────────────────
    road(-90, -14, 90, -14, RW);
    // ── SOUTH BOULEVARD z=42 ───────────────────────────────────────────────
    road(-90, 42, 90, 42, RW);
    // ── EDUCATION AVE z=-62 ────────────────────────────────────────────────
    road(-45, -62, 45, -62, RW);

    // ── CENTRAL N-S SPINE x=0 ──────────────────────────────────────────────
    road(0, -80, 0, 70, RW);
    // ── WEST N-S ARTERY x=-45 ──────────────────────────────────────────────
    road(-45, -14, -45, 42, RW);
    // ── EAST N-S ARTERY x=45 ───────────────────────────────────────────────
    road(45, -14, 45, 42, RW);
    // ── FAR WEST x=-58 (to reach Brahma Kund + Lakshmi) ───────────────────
    road(-58, -14, -58, 42, RW);
    // ── FAR EAST x=58 (to reach Akasha + Setu) ────────────────────────────
    road(58, -14, 58, 42, RW);

    // ── CONNECTING CROSS-STREETS ──────────────────────────────────────────
    road(-90, 24, 90, 24, RW);
    road(-90, -38, 90, -38, RW);

    // ── WATER CHANNELS alongside central N-S spine (like Firefly video) ───
    waterChannel(0, -70, 0, 60, 1); // east side of central spine
    waterChannel(0, -70, 0, 60, -1); // west side of central spine

    // ── CENTRAL ROUNDABOUT — deep terracotta like the reference ───────────
    const rMat = new THREE.MeshLambertMaterial({ color: 0xbb6644 });
    const rGnd = new THREE.MeshLambertMaterial({ color: P.ground });
    const rGeo = new THREE.RingGeometry(10.5, 17, 24);
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.y = 0.13;
    scene.add(rMesh);
    const isl = new THREE.Mesh(
      new THREE.CylinderGeometry(10.5, 10.5, 0.32, 18),
      rGnd,
    );
    isl.position.y = 0.16;
    scene.add(isl);

    // ── EDUCATION ROUNDABOUT ─────────────────────────────────────────────
    const eGeo = new THREE.RingGeometry(7, 11, 18);
    const eMesh = new THREE.Mesh(eGeo, rMat);
    eMesh.rotation.x = -Math.PI / 2;
    eMesh.position.set(0, 0.13, -38);
    scene.add(eMesh);
    const eIsl = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 0.3, 16),
      rGnd,
    );
    eIsl.position.set(0, 0.15, -38);
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
  // ── TEMPLE BUILDING RENDERER ──────────────────────────────────────────────
  // Types: gopuram | mandapa | shikhara | stupa
  // Each creates authentic Hindu temple low-poly geometry

  function pc(c) {
    if (typeof c === "string" && c.startsWith("#"))
      return parseInt(c.slice(1), 16);
    return typeof c === "number" ? c : 0x334455;
  }

  function buildBuilding(b) {
    const g = new THREE.Group();
    g.position.set(b.pos[0], 0, b.pos[1]);

    const w = b.size[0],
      d = b.size[1],
      h = b.height;
    const gc = pc(b.glowColor);

    // Pick stone colors per zone
    // Temple stone colors — ALL significantly brighter, warm sandstone bias
    // Bruno Simon diorama: top faces warm/bright, shadows are tinted cool
    const stoneColors = {
      "#00c8ff": [0xddeeff, 0xaaccee, 0x5588aa], // light blue-white marble
      "#7dff4f": [0xeeffcc, 0xbbdd88, 0x667733], // warm mossy sandstone
      "#ffcc44": [0xfff0bb, 0xeebb55, 0xaa7700], // golden sandstone — VIVID
      "#ff6b00": [0xffddb8, 0xee9944, 0xaa4411], // warm terracotta — VIVID
      "#c084fc": [0xffeeff, 0xddaaff, 0x9944cc], // light lavender marble
      "#4dd4ff": [0xddf4ff, 0x99ddff, 0x4488bb], // pale blue slate
      "#ff9950": [0xffeedd, 0xeeaa66, 0xaa5522], // warm honey sandstone
      "#a78bfa": [0xf0e8ff, 0xcc99ff, 0x7744bb], // pale violet marble
      "#34d399": [0xddfff0, 0x88eebb, 0x227755], // jade white-green
    };
    const [sLight, sMid, sDark] = stoneColors[b.glowColor] || [
      0xffeedd, 0xddbb88, 0x886633,
    ];

    // Use warm matcap for all stone — it catches the hemisphere light better
    const mLight = new THREE.MeshMatcapMaterial({
      color: sLight,
      matcap: matcaps.stone,
    });
    const mMid = new THREE.MeshMatcapMaterial({
      color: sMid,
      matcap: matcaps.stone,
    });
    const mDark = new THREE.MeshMatcapMaterial({
      color: sDark,
      matcap: matcaps.warm,
    });
    const mGlow = new THREE.MeshBasicMaterial({ color: gc });
    const mGoldMat = new THREE.MeshMatcapMaterial({
      color: 0xffcc44,
      matcap: matcaps.gold || matcaps.warm,
    });

    const type = b.templeType || "shikhara";

    // ── FOUNDATION PLATFORM (all temples) ────────────────────────────────
    // Multi-step raised platform — the jagati/adhishthana
    const steps = b.isHero ? 4 : 3;
    for (let s = 0; s < steps; s++) {
      const sw = w + (steps - s) * 1.8;
      const sd = d + (steps - s) * 1.8;
      const sh = 0.38;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, sd),
        s % 2 === 0 ? mMid : mLight,
      );
      slab.position.y = s * sh + sh / 2;
      g.add(slab);
    }
    const baseH = steps * 0.38;

    if (type === "gopuram") {
      // ── GOPURAM: South Indian temple gateway tower ─────────────────────
      // Wide base, horizontal tiers tapering up to a barrel vault top

      // Main gate hall — wide mandapa at base
      const hallH = h * 0.28;
      const hall = new THREE.Mesh(new THREE.BoxGeometry(w, hallH, d), mMid);
      hall.position.y = baseH + hallH / 2;
      g.add(hall);

      // Gate opening (dark archway)
      const arch = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.35, hallH * 0.75, d + 0.5),
        mDark,
      );
      arch.position.y = baseH + hallH * 0.38;
      g.add(arch);

      // Horizontal tiers stacking up — each slightly narrower
      const tiers = b.isHero ? 8 : 6;
      let tierY = baseH + hallH;
      let tw = w,
        td = d;
      const tierH = (h - hallH) / tiers;
      for (let t = 0; t < tiers; t++) {
        tw *= 0.88;
        td *= 0.88;
        const tier = new THREE.Mesh(
          new THREE.BoxGeometry(tw, tierH, td),
          t % 2 === 0 ? mMid : mLight,
        );
        tier.position.y = tierY + tierH / 2;
        g.add(tier);

        // Horizontal cornice line between tiers
        const cornice = new THREE.Mesh(
          new THREE.BoxGeometry(tw + 0.3, 0.18, td + 0.3),
          mDark,
        );
        cornice.position.y = tierY + tierH;
        g.add(cornice);

        // Small decorative niches on each tier
        if (t < tiers - 2) {
          [-1, 1].forEach((side) => {
            const niche = new THREE.Mesh(
              new THREE.BoxGeometry(tw * 0.18, tierH * 0.7, 0.25),
              new THREE.MeshMatcapMaterial({
                color: darken(sMid, 0.2),
                matcap: matcaps.stone || matcaps.warm,
              }),
            );
            niche.position.set(
              side * tw * 0.36,
              tierY + tierH * 0.5,
              td / 2 + 0.05,
            );
            g.add(niche);
          });
        }
        tierY += tierH;
      }

      // Barrel vault top (shikhara of the gopuram)
      const vault = new THREE.Mesh(
        new THREE.CylinderGeometry(tw * 0.3, tw * 0.48, tw * 0.7, 8),
        mMid,
      );
      vault.position.y = tierY + tw * 0.35;
      vault.rotation.z = Math.PI / 2;
      g.add(vault);

      // Kalasha (sacred pot) on top
      const kBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.42, 0.35, 8),
        mGoldMat,
      );
      kBase.position.y = tierY + tw * 0.7 + 0.18;
      g.add(kBase);
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        mGoldMat,
      );
      kPot.position.y = tierY + tw * 0.7 + 0.55;
      g.add(kPot);
      const kTop = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.52, 6),
        mGoldMat,
      );
      kTop.position.y = tierY + tw * 0.7 + 1.08;
      g.add(kTop);
    } else if (type === "shikhara") {
      // ── SHIKHARA: North Indian curvilinear spire ──────────────────────
      // Square base (garbhagriha), cylindrical/curvilinear spire rising up

      // Sanctum walls
      const sanctumH = h * 0.32;
      const sanctum = new THREE.Mesh(
        new THREE.BoxGeometry(w, sanctumH, d),
        mMid,
      );
      sanctum.position.y = baseH + sanctumH / 2;
      g.add(sanctum);

      // Four projecting portico ribs (rathas) — carved projections
      [
        [0, d / 2, 0],
        [0, -d / 2, 0],
        [w / 2, 0, Math.PI / 2],
        [-w / 2, 0, Math.PI / 2],
      ].forEach(([ox, oz, ry]) => {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.28, sanctumH * 0.88, 0.6),
          mLight,
        );
        rib.position.set(
          ox > 0 ? ox - 0.2 : ox + 0.2,
          baseH + sanctumH * 0.44,
          oz > 0 ? oz - 0.1 : oz + 0.1,
        );
        rib.rotation.y = ry;
        g.add(rib);
      });

      // Amalaka (ribbed disc at spire top)
      const amalY = baseH + sanctumH;
      let spW = w * 0.9;
      const spTiers = b.isHero ? 10 : 7;
      const spH = (h - sanctumH) / spTiers;
      for (let t = 0; t < spTiers; t++) {
        spW *= 0.85;
        const spTier = new THREE.Mesh(
          new THREE.CylinderGeometry(spW * 0.5, spW * 0.55, spH, 8),
          t % 2 === 0 ? mMid : mLight,
        );
        spTier.position.y = amalY + t * spH + spH / 2;
        g.add(spTier);

        // Curved profile lines
        if (t < spTiers - 2) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(spW * 0.52, 0.1, 4, 12),
            new THREE.MeshBasicMaterial({
              color: gc,
              transparent: true,
              opacity: 0.55,
            }),
          );
          band.position.y = amalY + t * spH + spH;
          band.rotation.x = Math.PI / 2;
          g.add(band);
        }
      }
      // Amalaka disc
      const aml = new THREE.Mesh(
        new THREE.CylinderGeometry(spW * 0.7, spW * 0.7, 0.35, 12),
        mGoldMat,
      );
      aml.position.y = amalY + spTiers * spH + 0.18;
      g.add(aml);
      // Kalasha
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 6),
        mGoldMat,
      );
      kPot.position.y = amalY + spTiers * spH + 0.6;
      g.add(kPot);
      const kFlag = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.55, 5),
        mGoldMat,
      );
      kFlag.position.y = amalY + spTiers * spH + 1.1;
      g.add(kFlag);
    } else if (type === "mandapa") {
      // ── MANDAPA: Pillared pavilion / columned hall ────────────────────
      // Low wide roof supported by many columns — like a great hall

      // Main hall roof — flat tiered
      const roofH = h * 0.45;
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, roofH, d + 0.5),
        mMid,
      );
      roof.position.y = baseH + roofH / 2;
      g.add(roof);

      // Upper tier
      const topH = h * 0.28;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, topH, d * 0.72),
        mLight,
      );
      top.position.y = baseH + roofH + topH / 2;
      g.add(top);

      // Crown spire
      const crownH = h * 0.2;
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.18, w * 0.26, crownH, 8),
        mMid,
      );
      crown.position.y = baseH + roofH + topH + crownH / 2;
      g.add(crown);
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        mGoldMat,
      );
      kPot.position.y = baseH + roofH + topH + crownH + 0.35;
      g.add(kPot);

      // Rows of columns on all sides — the mandapa's signature
      const cols = b.isHero ? 4 : 3;
      const colH = roofH * 0.88;
      const colMat = new THREE.MeshMatcapMaterial({
        color: sLight,
        matcap: matcaps.stone || matcaps.warm,
      });
      [-1, 1].forEach((side) => {
        for (let i = 0; i < cols; i++) {
          const cx = (i / (cols - 1) - 0.5) * (w - 1.0);
          // Front colonnade
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.32, colH, 7),
            colMat,
          );
          col.position.set(cx, baseH + colH / 2, side * (d / 2 + 0.1));
          g.add(col);
          // Capital
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.28, 0.65),
            mMid,
          );
          cap.position.set(cx, baseH + colH + 0.14, side * (d / 2 + 0.1));
          g.add(cap);
          // Base
          const base2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.62, 0.22, 0.62),
            mMid,
          );
          base2.position.set(cx, baseH + 0.11, side * (d / 2 + 0.1));
          g.add(base2);
        }
        // Side colonnade
        for (let i = 0; i < cols; i++) {
          const cz = (i / (cols - 1) - 0.5) * (d - 1.0);
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.32, colH, 7),
            colMat,
          );
          col.position.set(side * (w / 2 + 0.1), baseH + colH / 2, cz);
          g.add(col);
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.28, 0.65),
            mMid,
          );
          cap.position.set(side * (w / 2 + 0.1), baseH + colH + 0.14, cz);
          g.add(cap);
        }
      });
    } else if (type === "stupa") {
      // ── STUPA: Buddhist-influenced dome shrine ─────────────────────────
      // Circular dome (anda) on a square platform with a harmika on top

      // Square drum base
      const drumH = h * 0.35;
      const drum = new THREE.Mesh(new THREE.BoxGeometry(w, drumH, d), mMid);
      drum.position.y = baseH + drumH / 2;
      g.add(drum);
      // Decorative band
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4),
        mGoldMat,
      );
      band.position.y = baseH + drumH;
      g.add(band);

      // Hemisphere dome (anda)
      const domeR = Math.min(w, d) * 0.52;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(domeR, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mLight,
      );
      dome.position.y = baseH + drumH;
      g.add(dome);

      // Harmika (square fence on top)
      const hmY = baseH + drumH + domeR * 0.78;
      const hm = new THREE.Mesh(
        new THREE.BoxGeometry(domeR * 0.55, domeR * 0.35, domeR * 0.55),
        mMid,
      );
      hm.position.y = hmY;
      g.add(hm);

      // Chattravali — stacked discs (the spire)
      let disY = hmY + domeR * 0.18;
      let disR = domeR * 0.22;
      const discCount = b.isHero ? 6 : 4;
      for (let i = 0; i < discCount; i++) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(disR, disR * 1.1, 0.22, 10),
          mGoldMat,
        );
        disc.position.y = disY;
        g.add(disc);
        disY += 0.28;
        disR *= 0.82;
      }
      // Finial
      const fin = new THREE.Mesh(
        new THREE.SphereGeometry(disR * 1.2, 8, 6),
        mGoldMat,
      );
      fin.position.y = disY + 0.18;
      g.add(fin);
    }

    // ── TORANA GATEWAY — decorative archway in front ──────────────────────
    // Only hero buildings get an elaborate torana
    if (b.isHero || b.isEducation) {
      const torH = h * 0.5;
      const torW = w * 0.7;
      // Left post
      const lPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, torH, 0.42),
        mMid,
      );
      lPost.position.set(-torW / 2, torH / 2, d / 2 + 1.8);
      g.add(lPost);
      // Right post
      const rPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, torH, 0.42),
        mMid,
      );
      rPost.position.set(torW / 2, torH / 2, d / 2 + 1.8);
      g.add(rPost);
      // Lintel
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(torW + 0.42, 0.45, 0.42),
        mMid,
      );
      lintel.position.set(0, torH, d / 2 + 1.8);
      g.add(lintel);
      // Torana arch decoration
      const archDec = new THREE.Mesh(
        new THREE.BoxGeometry(torW * 0.55, 0.32, 0.42),
        mGoldMat,
      );
      archDec.position.set(0, torH + 0.46, d / 2 + 1.8);
      g.add(archDec);
    }

    // ── GLOWING ORBS on hero buildings ───────────────────────────────────
    if (b.isHero) {
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      orb.position.y = h + 2.5;
      orb.userData.isOrb = true;
      g.add(orb);
      [1.2, 2.0].forEach((r, i) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.06, 4, 16),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.5 - i * 0.12,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h + 2.5;
        ring.userData.heroRing = true;
        ring.userData.ri = i;
        g.add(ring);
      });
      g.add(ptLight(gc, isNight ? 4.5 : 1.8, 28, [0, h + 2, 0]));
      // Warm light at base for interior glow effect
      g.add(ptLight(0xffcc88, isNight ? 2.0 : 0.8, 12, [0, 1.5, 0]));
    } else {
      g.add(ptLight(gc, isNight ? 2.5 : 1.0, 20, [0, h * 0.7, 0]));
      g.add(ptLight(0xffcc88, isNight ? 1.5 : 0.55, 10, [0, 1.0, 0]));
    }

    // ── BLOB SHADOW ───────────────────────────────────────────────────────
    addBlobShadow(b, g);

    // Collision box — larger padding for temples
    buildingBoxes.push({
      minX: b.pos[0] - w / 2 - 2.5,
      maxX: b.pos[0] + w / 2 + 2.5,
      minZ: b.pos[1] - d / 2 - 2.5,
      maxZ: b.pos[1] + d / 2 + 2.5,
    });

    buildingMeshes.push({
      group: g,
      body: g,
      building: b,
      bodyMat: mMid, // for proximity highlight
    });
    scene.add(g);
  }

  function darken(hex, amt) {
    const r = (((hex >> 16) & 0xff) * (1 - amt)) | 0;
    const g2 = (((hex >> 8) & 0xff) * (1 - amt)) | 0;
    const b2 = ((hex & 0xff) * (1 - amt)) | 0;
    return (r << 16) | (g2 << 8) | b2;
  }

  // ── PRAYER FLAGS (Toran banners) — strung across the world at key spots ──
  function buildPrayerFlags() {
    const flagColors = [
      0xff3333, 0xff9900, 0xffdd00, 0x33cc44, 0x3388ff, 0xcc44cc,
    ];

    function stringFlags(x1, y, z1, x2, z2, count) {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const fx = x1 + (x2 - x1) * t;
        const sag = Math.sin(t * Math.PI) * 0.7;
        const fz = z1 + (z2 - z1) * t;
        const fy = y - sag;
        const col = flagColors[i % flagColors.length];
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.32, 0.06),
          new THREE.MeshBasicMaterial({ color: col }),
        );
        flag.position.set(fx, fy, fz);
        flag.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        scene.add(flag);
      }
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.sqrt(dx * dx + dz * dz);
      const str = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.02, 0.02),
        new THREE.MeshBasicMaterial({
          color: 0xddcc99,
          transparent: true,
          opacity: 0.55,
        }),
      );
      str.position.set((x1 + x2) / 2, y - 0.35, (z1 + z2) / 2);
      str.rotation.y = Math.atan2(dx, dz);
      scene.add(str);
    }

    // Across the hero zone entrance
    stringFlags(-22, 9, -4, 22, -4, 14);
    // Main boulevard
    stringFlags(-22, 9, 2, 22, 2, 14);
    // South district gateway
    stringFlags(-14, 8, 32, 14, 32, 8);
    stringFlags(-14, 8, 50, 14, 50, 8);
    // Education corridor
    stringFlags(-18, 8, -55, 18, -55, 10);
    // Diagonal across central island
    stringFlags(-8, 7, -16, 8, -16, 6);
  }

  // ── DIRECTIONAL SIGN POSTS — wooden signs near spawn pointing to districts ─
  function buildSignPosts() {
    const woodMat = new THREE.MeshMatcapMaterial({
      color: 0xcc8844,
      matcap: matcaps.warm,
    });
    const textMats = {
      "#00c8ff": new THREE.MeshBasicMaterial({ color: 0x00ccff }),
      "#7dff4f": new THREE.MeshBasicMaterial({ color: 0x77ff44 }),
      "#ffcc44": new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
      "#ff6b00": new THREE.MeshBasicMaterial({ color: 0xff7722 }),
      "#c084fc": new THREE.MeshBasicMaterial({ color: 0xcc88ff }),
      "#34d399": new THREE.MeshBasicMaterial({ color: 0x44eebb }),
    };

    const signs = [
      {
        pos: [-5, 32],
        angle: -0.4,
        text: "◈ SURYA DWARA",
        col: "#00c8ff",
        dist: "↑ NORTH",
      },
      {
        pos: [5, 32],
        angle: 0.4,
        text: "◈ BRAHMA KUND",
        col: "#ffcc44",
        dist: "↑ NORTH",
      },
      {
        pos: [-5, 14],
        angle: -0.2,
        text: "◈ LAKSHMI PRASAD",
        col: "#ff6b00",
        dist: "← WEST",
      },
      {
        pos: [5, 14],
        angle: 0.2,
        text: "◈ AKASHA MANDAPA",
        col: "#00c8ff",
        dist: "→ EAST",
      },
      {
        pos: [0, 14],
        angle: 0.0,
        text: "◈ SARASWATI VIHAR",
        col: "#c084fc",
        dist: "↓ SOUTH",
      },
    ];

    signs.forEach(({ pos, angle, text, col, dist }) => {
      const g = new THREE.Group();
      g.position.set(pos[0], 0, pos[1]);
      g.rotation.y = angle;

      // Post
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 3.2, 0.14),
        woodMat,
      );
      pole.position.y = 1.6;
      g.add(pole);

      // Sign board
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.75, 0.12),
        woodMat,
      );
      board.position.set(0, 3.2, 0);
      g.add(board);

      // Painted sign face canvas
      const W = 280,
        H = 56;
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "rgba(20,10,4,0.9)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col;
      ctx.font = "bold 16px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(text, 10, 24);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.fillText(dist, 10, 44);
      const tex = new THREE.CanvasTexture(can);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 0.65),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      face.position.set(0, 3.2, 0.07);
      g.add(face);

      scene.add(g);
    });
  }

  // ── VIJAY STAMBHA — Tall stone victory pillar (right side, Firefly video) ─
  function buildStambha() {
    const stoneMat = new THREE.MeshMatcapMaterial({
      color: 0xeeddcc,
      matcap: matcaps.stone,
    });
    const goldMat = new THREE.MeshMatcapMaterial({
      color: 0xffcc44,
      matcap: matcaps.gold,
    });

    // Place on east side of map like the video
    const SX = 72,
      SZ = 8;

    // Raised octagonal base
    const base1 = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 4.0, 0.8, 8),
      stoneMat,
    );
    base1.position.set(SX, 0.4, SZ);
    scene.add(base1);
    const base2 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 3.0, 0.7, 8),
      stoneMat,
    );
    base2.position.set(SX, 1.15, SZ);
    scene.add(base2);
    const base3 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 0.7, 8),
      stoneMat,
    );
    base3.position.set(SX, 1.9, SZ);
    scene.add(base3);

    // Main shaft — tall and tapering like a real stambha
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.95, 18, 12),
      stoneMat,
    );
    shaft.position.set(SX, 11.0, SZ);
    scene.add(shaft);

    // Decorative bands on shaft
    [4, 8, 12, 16].forEach((y) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.88, 0.28, 12),
        goldMat,
      );
      band.position.set(SX, y, SZ);
      scene.add(band);
    });

    // Bell capital (ghanta)
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 0.6, 1.2, 10),
      stoneMat,
    );
    bell.position.set(SX, 20.6, SZ);
    scene.add(bell);

    // Abacus disc
    const abacus = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.1, 0.55, 12),
      stoneMat,
    );
    abacus.position.set(SX, 21.5, SZ);
    scene.add(abacus);

    // Dharma chakra on top (golden wheel)
    const chakra = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.18, 6, 20),
      goldMat,
    );
    chakra.position.set(SX, 22.4, SZ);
    chakra.userData.isChakra = true;
    scene.add(chakra);

    // Spokes of the chakra
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 1.8),
        goldMat,
      );
      spoke.position.set(SX, 22.4, SZ);
      spoke.rotation.z = ang;
      spoke.userData.isChakra = true;
      scene.add(spoke);
    }

    // Golden glow at top
    scene.add(ptLight(0xffcc44, isNight ? 3.0 : 1.2, 20, [SX, 22, SZ]));
  }

  // ── FORMAL GARDEN CIRCLES — manicured circular gardens from Firefly video ─
  function buildFormalGardens() {
    const gardenMat = new THREE.MeshLambertMaterial({ color: 0x338833 }); // deep green lawn
    const pathMat = new THREE.MeshLambertMaterial({ color: 0xddaa77 }); // sandy path
    const flowerMat1 = new THREE.MeshBasicMaterial({ color: 0xff4488 }); // pink flowers
    const flowerMat2 = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); // yellow flowers
    const hedgeMat = new THREE.MeshMatcapMaterial({
      color: 0x225522,
      matcap: matcaps.tree,
    });
    const fountainMat = new THREE.MeshLambertMaterial({ color: 0x99ccff }); // water

    // Positions of formal garden circles — along the main boulevard
    const gardens = [
      { x: -20, z: -7, r: 6.5 }, // west of hero zone
      { x: 20, z: -7, r: 6.5 }, // east of hero zone
      { x: -20, z: 17, r: 5.5 }, // central district
      { x: 20, z: 17, r: 5.5 },
      { x: -45, z: 5, r: 4.5 }, // west artery
      { x: 45, z: 5, r: 4.5 }, // east artery
      { x: 0, z: -25, r: 5.0 }, // north of hero zone
      { x: 0, z: 35, r: 5.0 }, // south boulevard
    ];

    gardens.forEach(({ x, z, r }) => {
      // Outer lawn circle
      const lawn = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.15, 20),
        gardenMat,
      );
      lawn.position.set(x, 0.075, z);
      scene.add(lawn);

      // Sandy concentric path ring
      const pathRing = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.65, r * 0.12, 4, 24),
        pathMat,
      );
      pathRing.rotation.x = Math.PI / 2;
      pathRing.position.set(x, 0.18, z);
      scene.add(pathRing);

      // Inner green circle
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.18, 16),
        gardenMat,
      );
      inner.position.set(x, 0.09, z);
      scene.add(inner);

      // Flower ring — alternating pink/yellow dots around the path
      const numFlowers = Math.floor(r * 3);
      for (let i = 0; i < numFlowers; i++) {
        const ang = (i / numFlowers) * Math.PI * 2;
        const fr = r * 0.65;
        const mat = i % 2 === 0 ? flowerMat1 : flowerMat2;
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 5, 4),
          mat,
        );
        flower.position.set(
          x + Math.cos(ang) * fr,
          0.38,
          z + Math.sin(ang) * fr,
        );
        scene.add(flower);
      }

      // Radial hedge spokes
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const hlen = r * 0.55;
        const hedge = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.55, hlen),
          hedgeMat,
        );
        hedge.position.set(
          x + (Math.cos(ang) * hlen) / 2,
          0.28,
          z + (Math.sin(ang) * hlen) / 2,
        );
        hedge.rotation.y = -ang;
        scene.add(hedge);
      }

      // Central fountain or small monument
      if (r > 5) {
        // Small central fountain bowl
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12),
          new THREE.MeshMatcapMaterial({
            color: 0xeeddcc,
            matcap: matcaps.stone,
          }),
        );
        bowl.position.set(x, 0.2, z);
        scene.add(bowl);
        // Water surface
        const waterSurf = new THREE.Mesh(
          new THREE.CircleGeometry(0.75, 12),
          fountainMat,
        );
        waterSurf.rotation.x = -Math.PI / 2;
        waterSurf.position.set(x, 0.42, z);
        scene.add(waterSurf);
        // Fountain jet (thin cone upward)
        const jet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 1.2, 6),
          new THREE.MeshBasicMaterial({
            color: 0xbbddff,
            transparent: true,
            opacity: 0.7,
          }),
        );
        jet.position.set(x, 0.9, z);
        scene.add(jet);
        scene.add(ptLight(0x88ccff, isNight ? 1.5 : 0.4, 8, [x, 1.5, z]));
      } else {
        // Small ornamental stone
        const orn = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.42, 0),
          new THREE.MeshMatcapMaterial({
            color: 0xffcc44,
            matcap: matcaps.gold,
          }),
        );
        orn.position.set(x, 0.55, z);
        orn.userData.isTimelineGem = true;
        orn.userData.baseY = 0.55;
        orn.userData.phase = x * 0.3;
        scene.add(orn);
      }
    });
  }

  // ── CENTERPIECE — Bruno Simon style island with bench, trees, glow ring ──
  function buildCenterpiece() {
    // Raised circular platform
    const islandMat = new THREE.MeshLambertMaterial({ color: 0xcc7755 }); // terracotta island
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 8.2, 0.55, 18),
      islandMat,
    );
    island.position.y = 0.28;
    scene.add(island);
    const paveMat = new THREE.MeshLambertMaterial({ color: 0xdd9977 }); // sandstone paving
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
      // ── CENTRAL ISLAND cluster ─────────────────────────────────────────
      [7, 7],
      [-7, 7],
      [7, -7],
      [-7, -7],
      [11, 0],
      [-11, 0],
      [0, 11],
      [0, -11],
      [14, 5],
      [-14, 5],
      [14, -5],
      [-14, -5],

      // ── MAIN BOULEVARD z=0 ─────────────────────────────────────────────
      [20, 5],
      [-20, 5],
      [20, -5],
      [-20, -5],
      [35, 5],
      [-35, 5],
      [35, -5],
      [-35, -5],
      [50, 5],
      [-50, 5],
      [50, -5],
      [-50, -5],
      [65, 5],
      [-65, 5],
      [65, -5],
      [-65, -5],
      [78, 5],
      [-78, 5],
      [78, -5],
      [-78, -5],

      // ── HERO ZONE z=-14 ────────────────────────────────────────────────
      [22, -14],
      [-22, -14],
      [22, -8],
      [-22, -8],
      [45, -18],
      [-45, -18],
      [45, -8],
      [-45, -8],

      // ── UPPER BELT z=-38 ───────────────────────────────────────────────
      [20, -38],
      [-20, -38],
      [40, -38],
      [-40, -38],
      [55, -38],
      [-55, -38],
      [70, -38],
      [-70, -38],
      [10, -44],
      [-10, -44],

      // ── EDUCATION BOULEVARD z=-62 ──────────────────────────────────────
      [8, -62],
      [-8, -62],
      [35, -62],
      [-35, -62],
      [8, -55],
      [-8, -55],
      [8, -70],
      [-8, -70],
      [34, -68],
      [-34, -68],
      [34, -56],
      [-34, -56],

      // ── FAR SOUTH ──────────────────────────────────────────────────────
      [0, -80],
      [18, -80],
      [-18, -80],
      [35, -80],
      [-35, -80],

      // ── SOUTH BOULEVARD z=42 ───────────────────────────────────────────
      [20, 42],
      [-20, 42],
      [40, 42],
      [-40, 42],
      [55, 42],
      [-55, 42],
      [70, 42],
      [-70, 42],
      [0, 50],
      [18, 50],
      [-18, 50],

      // ── FAR NORTH (behind player spawn) ────────────────────────────────
      [20, 55],
      [-20, 55],
      [40, 55],
      [-40, 55],
      [0, 60],
      [10, 62],
      [-10, 62],

      // ── MID CROSS z=24 ─────────────────────────────────────────────────
      [20, 24],
      [-20, 24],
      [45, 24],
      [-45, 24],
      [55, 24],
      [-55, 24],
      [70, 30],
      [-70, 30],

      // ── EAST DISTRICT ──────────────────────────────────────────────────
      [78, 8],
      [78, -8],
      [78, 20],
      [78, 35],
      [78, 50],
      [86, 0],
      [86, 15],
      [86, 30],
      [86, -15],

      // ── WEST DISTRICT ──────────────────────────────────────────────────
      [-78, 8],
      [-78, -8],
      [-78, 20],
      [-78, 35],
      [-78, 50],
      [-86, 0],
      [-86, 15],
      [-86, 30],
      [-86, -15],

      // ── SCATTERED ORGANIC clusters ─────────────────────────────────────
      [28, -28],
      [-28, -28],
      [55, -20],
      [-55, -20],
      [55, -50],
      [-55, -50],
      [55, 10],
      [-55, 10],
      [45, 35],
      [-45, 35],
      [30, 50],
      [-30, 50],
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
      // ── World border thick grass ───────────────────────────────────────
      [-85, 0],
      [-85, 20],
      [-85, -20],
      [-85, 40],
      [-85, -40],
      [-85, 55],
      [-85, -55],
      [85, 0],
      [85, 20],
      [85, -20],
      [85, 40],
      [85, -40],
      [85, 55],
      [85, -55],
      [0, -83],
      [20, -83],
      [-20, -83],
      [40, -83],
      [-40, -83],
      [60, -83],
      [-60, -83],
      [0, 62],
      [20, 62],
      [-20, 62],
      [40, 62],
      [-40, 62],
      [60, 62],
      [-60, 62],
      // ── Between roads ─────────────────────────────────────────────────
      [22, -28],
      [-22, -28],
      [50, -28],
      [-50, -28],
      [70, -28],
      [-70, -28],
      [22, 12],
      [-22, 12],
      [22, -4],
      [-22, -4],
      [50, 12],
      [-50, 12],
      [50, -4],
      [-50, -4],
      // ── Education corridor ─────────────────────────────────────────────
      [5, -50],
      [-5, -50],
      [15, -50],
      [-15, -50],
      [5, -56],
      [-5, -56],
      [15, -56],
      [-15, -56],
      [32, -45],
      [-32, -45],
      [32, -55],
      [-32, -55],
      // ── South boulevard edges ──────────────────────────────────────────
      [22, 50],
      [-22, 50],
      [40, 50],
      [-40, 50],
      [60, 50],
      [-60, 50],
      // ── Mid-world organic ──────────────────────────────────────────────
      [40, -32],
      [-40, -32],
      [55, -6],
      [-55, -6],
      [55, 18],
      [-55, 18],
      [70, 12],
      [-70, 12],
      [40, 30],
      [-40, 30],
    ];

    patchPositions.forEach(([x, z]) => {
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const gx = x + (Math.random() - 0.5) * 5;
        const gz = z + (Math.random() - 0.5) * 5;
        const w = 0.12 + Math.random() * 0.14;
        const h = 0.35 + Math.random() * 0.55; // MAX 0.9 — not tall spikes
        const col = grassColors[Math.floor(Math.random() * grassColors.length)];
        const mat = new THREE.MeshLambertMaterial({ color: col });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.5), mat);
        blade.position.set(gx, h / 2, gz);
        blade.rotation.y = Math.random() * Math.PI;
        blade.rotation.z = (Math.random() - 0.5) * 0.28;
        scene.add(blade);
      }
    });
  }

  // ── 3D NAME LETTERS — "ADITYA SRIVASTAVA" on the ground like Bruno Simon ─
  function build3DName() {
    // Player spawns at z=40 — name placed just behind, visible immediately
    const nameZ = 54;

    function makeSprite(text, font, color, W, H) {
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, H / 2);
      const tex = new THREE.CanvasTexture(can);
      return new THREE.SpriteMaterial({ map: tex, transparent: true });
    }

    // ADITYA — big
    const sp1 = new THREE.Sprite(
      makeSprite(
        "ADITYA",
        "bold 58px 'Barlow Condensed',sans-serif",
        "#fff8f0",
        300,
        88,
      ),
    );
    sp1.scale.set(17, 5.2, 1);
    sp1.position.set(0, 3.5, nameZ);
    scene.add(sp1);

    // SRIVASTAVA — medium gold
    const sp2 = new THREE.Sprite(
      makeSprite(
        "SRIVASTAVA",
        "bold 46px 'Barlow Condensed',sans-serif",
        "#ffd088",
        360,
        72,
      ),
    );
    sp2.scale.set(16, 3.2, 1);
    sp2.position.set(0, 1.9, nameZ + 0.5);
    scene.add(sp2);

    // Role tag
    const sp3 = new THREE.Sprite(
      makeSprite(
        "// BACKEND ARCHITECT  ·  4 YEARS  ·  NOIDA, INDIA",
        "bold 20px 'Share Tech Mono',monospace",
        "#00ddff",
        440,
        42,
      ),
    );
    sp3.scale.set(16, 1.55, 1);
    sp3.position.set(0, 0.9, nameZ + 1.0);
    scene.add(sp3);

    // Physical slab beneath the text
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xf5ddc8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 6), slabMat);
    slab.position.set(0, 0.12, nameZ + 0.5);
    scene.add(slab);

    // Glowing rings on the slab
    [2.2, 3.5].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.065, 4, 20),
        new THREE.MeshBasicMaterial({
          color: 0xddaaff,
          transparent: true,
          opacity: 0.55 - i * 0.15,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.35, nameZ + 2.2);
      ring.userData.isRing = true;
      ring.userData.rotSpeed = 0.35 + i * 0.22;
      scene.add(ring);
    });
  }

  // ── CAREER TIMELINE RAIL ──────────────────────────────────────────────────
  // Runs along the education corridor between z=-62 and z=-38
  // Positioned at x=0 connecting the two education temples
  function buildCareerTimeline() {
    // Timeline runs at z=-57 — BETWEEN z=-62 education boulevard and z=-38 upper road
    // This is a dedicated visual corridor between the two education temples
    const TZ = -57;
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x00ddff,
      transparent: true,
      opacity: 0.75,
    });
    const railGold = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.75,
    });

    // Main rail — two parallel glowing lines, 80 units wide
    [-0.4, 0.4].forEach((offset, ri) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(80, 0.07, 0.14),
        ri === 0 ? railMat : railGold,
      );
      rail.position.set(0, 0.22, TZ + offset);
      scene.add(rail);
    });

    // Milestones spread across the full rail width
    const milestones = [
      { year: "2015", label: "B.Sc Begins", x: -35, color: "#34d399" },
      { year: "2019", label: "B.Sc Completed", x: -20, color: "#34d399" },
      { year: "2021", label: "M.Sc CS", x: -6, color: "#a78bfa" },
      { year: "JAN 2022", label: "Trainee Engineer", x: 8, color: "#ffcc44" },
      { year: "SEP 2022", label: "Junior SE", x: 22, color: "#ff9950" },
      { year: "2024", label: "Backend Architect", x: 35, color: "#ff6b00" },
    ];

    milestones.forEach(({ year, label, x, color }) => {
      const gc = parseInt(color.slice(1), 16);

      // Glowing post
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 2.4, 0.2),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      post.position.set(x, 1.2, TZ);
      scene.add(post);

      // Floating diamond gem
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      gem.position.set(x, 2.8, TZ);
      gem.userData.isTimelineGem = true;
      gem.userData.baseY = 2.8;
      gem.userData.phase = x * 0.38;
      scene.add(gem);

      // Point light glow
      const pl = new THREE.PointLight(gc, 1.0, 6);
      pl.position.set(x, 2.6, TZ);
      scene.add(pl);

      // Floating canvas label
      const cw = 180,
        ch = 78;
      const can = document.createElement("canvas");
      can.width = cw;
      can.height = ch;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = color;
      ctx.font = "bold 26px 'Barlow Condensed',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(year, cw / 2, 28);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "12px 'Share Tech Mono',monospace";
      ctx.fillText(label, cw / 2, 54);
      const tex = new THREE.CanvasTexture(can);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true }),
      );
      sp.scale.set(5.0, 2.15, 1);
      sp.position.set(x, 5.0, TZ);
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
    carX = Math.max(-95, Math.min(95, carX));
    carZ = Math.max(-88, Math.min(65, carZ));

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

    // Camera — pulled well back: buildings always in frame
    const camDist = 22,
      camH = 16;
    const tx = carX - sinA * camDist;
    const tz = carZ - cosA * camDist;
    camera.position.x += (tx - camera.position.x) * 0.08;
    camera.position.y += (camH - camera.position.y) * 0.05;
    camera.position.z += (tz - camera.position.z) * 0.08;
    camera.lookAt(carX + sinA * 4, 1.5, carZ + cosA * 4);

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
      // Vijay Stambha chakra spins
      if (c.userData.isChakra) c.rotation.z = t * 0.45;
    });
    worldLabels.forEach((sprite) => {
      const b = sprite.userData.building;
      const rx = b.roadPos ? b.roadPos[0] : b.pos[0];
      const rz = b.roadPos ? b.roadPos[1] : b.pos[1];
      const dist = Math.hypot(carX - rx, carZ - rz);
      const target = dist < 28 && dist > 4 ? Math.min(1, (28 - dist) / 14) : 0;
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
})(); // ── CITY ENGINE v5 ────────────────────────────────────────────────────────────
// Bruno Simon inspired: low-poly cohesive palette, proper car, tight physics,
// weather system (sun/rain/night/fog/snow), checkpoint markers, city layout

window.CityEngine = (function () {
  // ── STATE ────────────────────────────────────────────────────────────────
  let scene, camera, renderer, clock;
  let animId;

  // ── NEW STATE for 8 priorities ────────────────────────────────────────────
  let cameraFlyTarget = null; // P1: camera fly-in on entry
  let cameraFlyPhase = 0; // 0=normal, 1=flying-in, 2=panel-open
  let districtAudio = {}; // P6: per-district audio nodes
  let diyaFlames = []; // P5+P7: animated diya flame meshes
  let diyaLights = []; // P7: cached diya PointLights (position + ref)
  let birdGroup = null; // P5: bird flock group
  let fullMapOpen = false; // P8: full map overlay flag

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
  const ACCEL = 0.024; // faster acceleration for bigger world
  const BRAKE = 0.03;
  const DECEL = 0.008;
  const MAX_SPD = 0.38; // higher top speed
  const TURN = 0.044; // slightly more responsive steering
  const PROX = 30; // large world — show notification from further away
  const CAR_HW = 0.85;
  const CAR_HD = 1.3;
  let weatherGrip = 1.0; // 1.0 = dry, 0.3 = rain, 0.12 = snow

  // ── PALETTE — Hindu Temple City (Firefly reference) ────────────────────
  const P = {
    // Ground: deep warm terracotta-red like Indian temple stone plaza
    ground: 0xc86a44, // deep terracotta
    groundAlt: 0xb85c38,
    road: 0xaa5533, // dark brick-red road
    sidewalk: 0xd47a55, // warm sandstone plaza
    roadLine: 0xffe066, // golden dashes

    // Buildings palette (not used in temple renderer but kept for compat)
    b1: 0xf0d0a0,
    b2: 0xf5d8b0,
    b3: 0xffe8c8,
    b4: 0xe8c898,
    b5: 0xf0d8a8,
    b6: 0xe0c090,
    b7: 0xf8e0b8,
    b8: 0xecd0a0,

    roofDark: 0xcc8844,
    roofRed: 0xdd9933,
    roofGrey: 0xaa8855,

    // Trees: deep Indian greens with some tropical colors
    treeTrunk: 0x6a4422,
    treeLeaf1: 0x336633, // deep forest green
    treeLeaf2: 0x447744, // medium green
    treeLeaf3: 0x558844, // brighter green
    treeLeaf4: 0x66aa33, // lawn green
    treeLeaf5: 0x228833, // dark tropical green
    treeSpike: 0x224422, // dark pine

    // Grass patches — deep rich greens (like the manicured gardens in video)
    grass1: 0x3a7733,
    grass2: 0x4a8833,
    grass3: 0x336622,

    lampPole: 0xcc9944,
    lampHead: 0xffeeaa,

    carBody: 0xdd2200,
    carDark: 0x881200,
    carBlack: 0x181210,
    carGlass: 0x5588bb,
    carChrome: 0xbbbbaa,
    carTyre: 0x141210,
    carHub: 0xcc2000,

    water: 0x3399cc, // clear blue water channels like the video
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

    camera = new THREE.PerspectiveCamera(58, W / H, 0.1, 600);
    camera.position.set(0, 18, 42);
    camera.lookAt(0, 2, 20);

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
        buildStambha();
        buildFormalGardens();
        buildBirdFlock();
        progress(72, "TEMPLES RISING");
      },
      () => {
        buildCheckpoints();
        buildAtmosphere();
        buildWaveLines();
        buildPrayerFlags();
        buildSignPosts();
        buildGatewayArches();
        progress(84, "ATMOSPHERE");
      },
      () => {
        buildWorldLabels();
        buildInfoBoards();
        buildZoneAmbients();
        buildCareerTimeline();
        progress(95, "BOARDS DEPLOYED");
      },
      () => {
        setupControls();
        window.addEventListener("resize", onResize);
        setTimeout(() => checkProximity(), 300);
        setTimeout(() => initDistrictAudio(), 2000);
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
    matcaps.warm = createMatcap("#ffeecc", "#ddaa66", "#774422"); // warm sandstone
    matcaps.cool = createMatcap("#ddeeff", "#6699cc", "#224466"); // cool marble
    matcaps.stone = createMatcap("#ffffff", "#f5e0c0", "#cc9966"); // WHITE MARBLE — like Akshardham
    matcaps.gold = createMatcap("#ffe566", "#ddaa00", "#553300"); // burnished gold
    matcaps.green = createMatcap("#88dd44", "#336622", "#0a1a04"); // deep tropical green
    matcaps.purple = createMatcap("#ffddff", "#dd99ff", "#663388"); // pale violet
    matcaps.car = createMatcap(
      "#ff9977",
      "#dd2200",
      "#440000",
      "rgba(255,230,220,0.95)",
    );
    matcaps.carDark = createMatcap("#ee5533", "#991100", "#220000");
    matcaps.chrome = createMatcap("#ffffee", "#ccccaa", "#444433"); // polished metal
    matcaps.glass = createMatcap("#99ccff", "#3366aa", "#001133");
    matcaps.tyre = createMatcap("#333222", "#151210", "#050404");
    matcaps.tree = createMatcap("#77cc44", "#336622", "#0a1a04"); // deep green foliage
    matcaps.dark = createMatcap("#443322", "#221108", "#080402");
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
    // Firefly-style blue speech bubble tooltips that appear as you approach
    window.CITY_DATA.buildings.forEach((b) => {
      const W = 320,
        H = 110;
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");

      // ── SPEECH BUBBLE BACKGROUND (matches the Firefly video exactly) ────
      const BG = "rgba(22, 55, 88, 0.94)"; // deep blue like the video tooltips
      const BORDER = "#44aaff";

      // Rounded rectangle body
      ctx.fillStyle = BG;
      ctx.shadowColor = "#3399ff";
      ctx.shadowBlur = 12;
      if (ctx.roundRect) ctx.roundRect(3, 3, W - 6, H - 22, 10);
      else ctx.rect(3, 3, W - 6, H - 22);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Border
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 2;
      if (ctx.roundRect) ctx.roundRect(3, 3, W - 6, H - 22, 10);
      else ctx.rect(3, 3, W - 6, H - 22);
      ctx.stroke();

      // Speech bubble pointer triangle at bottom
      ctx.fillStyle = BG;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 10, H - 22);
      ctx.lineTo(W / 2 + 10, H - 22);
      ctx.lineTo(W / 2, H - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 10, H - 22);
      ctx.lineTo(W / 2, H - 2);
      ctx.lineTo(W / 2 + 10, H - 22);
      ctx.stroke();

      // Top left icon (temple type symbol)
      const icons = {
        gopuram: "🏛",
        shikhara: "⛩",
        mandapa: "🏗",
        stupa: "🔵",
      };
      const icon = icons[b.templeType] || "◈";
      ctx.font = "16px serif";
      ctx.fillText(icon, 10, 25);

      // Building name — white, prominent
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 19px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      ctx.fillText(b.name, 34, 26);

      // Subtitle in light blue
      ctx.fillStyle = "#88ccff";
      ctx.font = "11px 'Share Tech Mono', monospace";
      const sub = (b.subtitle || b.tag || "").substring(0, 32);
      ctx.fillText(sub, 10, 48);

      // Status + key metric
      const statusColor =
        b.status === "OPERATIONAL"
          ? "#44ff88"
          : b.status === "ACTIVE"
            ? "#ffcc44"
            : b.status === "COMPLETED"
              ? "#aa88ff"
              : "#aaaaaa";
      ctx.fillStyle = statusColor;
      ctx.font = "bold 10px 'Share Tech Mono', monospace";
      ctx.fillText("● " + (b.status || "ACTIVE"), 10, 68);

      // Key metric value on the right
      if (b.metrics && b.metrics[0]) {
        ctx.fillStyle = "#ffe088";
        ctx.font = "bold 17px 'Barlow Condensed', sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(b.metrics[0].v + " " + b.metrics[0].l, W - 12, 68);
        ctx.textAlign = "left";
      }

      // Tech tags row
      if (b.tech && b.tech.length) {
        const tags = b.tech.slice(0, 3).join("  ·  ");
        ctx.fillStyle = "rgba(136,204,255,0.55)";
        ctx.font = "9px 'Share Tech Mono', monospace";
        ctx.fillText(tags, 10, 84);
      }

      const tex = new THREE.CanvasTexture(can);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(11, 3.85, 1);
      const bh = (b.height || 12) + 7.5;
      sprite.position.set(b.pos[0], bh, b.pos[1]);
      sprite.userData.building = b;
      sprite.userData.baseY = bh;
      scene.add(sprite);
      worldLabels.push(sprite);
    });
  }

  // ── ZONE AMBIENT POINT LIGHTS ─────────────────────────────────────────────
  // Each district gets a soft colored point light that colors the ground
  // ── P2: IN-WORLD INFORMATION BOARDS ──────────────────────────────────────
  // 3D billboard boards inside each temple compound showing system info
  // Only visible when within 20 units — give context before entering
  let infoBoardSprites = [];

  function buildInfoBoards() {
    window.CITY_DATA.buildings.forEach((b) => {
      const gc = b.glowColor;
      const hexCol = gc;

      // ── Board canvas — rich information panel ─────────────────────────
      const BW = 480,
        BH = 280;
      const can = document.createElement("canvas");
      can.width = BW;
      can.height = BH;
      const ctx = can.getContext("2d");

      // Background with subtle gradient
      const grd = ctx.createLinearGradient(0, 0, 0, BH);
      grd.addColorStop(0, "rgba(8,4,2,0.97)");
      grd.addColorStop(1, "rgba(20,10,4,0.97)");
      ctx.fillStyle = grd;
      if (ctx.roundRect) ctx.roundRect(4, 4, BW - 8, BH - 8, 12);
      else ctx.rect(4, 4, BW - 8, BH - 8);
      ctx.fill();

      // Glowing border
      ctx.strokeStyle = hexCol;
      ctx.lineWidth = 3;
      ctx.shadowColor = hexCol;
      ctx.shadowBlur = 14;
      if (ctx.roundRect) ctx.roundRect(4, 4, BW - 8, BH - 8, 12);
      else ctx.rect(4, 4, BW - 8, BH - 8);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top accent bar
      ctx.fillStyle = hexCol + "44";
      ctx.fillRect(4, 4, BW - 8, 40);
      ctx.fillStyle = hexCol;
      ctx.fillRect(4, 4, BW - 8, 4);

      // Temple type + status on top bar
      const icon =
        { gopuram: "🏛", shikhara: "⛩", mandapa: "🏗", stupa: "🔵" }[
          b.templeType
        ] || "◈";
      ctx.font = "14px serif";
      ctx.fillText(icon, 16, 32);
      ctx.fillStyle = hexCol;
      ctx.font = "bold 14px 'Share Tech Mono', monospace";
      ctx.fillText(
        (b.templeType || "TEMPLE").toUpperCase() + "  ·  " + (b.year || ""),
        40,
        33,
      );

      // Status dot + label top-right
      const dotCol =
        b.status === "OPERATIONAL"
          ? "#44ff88"
          : b.status === "ACTIVE"
            ? "#ffcc44"
            : "#aa88ff";
      ctx.fillStyle = dotCol;
      ctx.beginPath();
      ctx.arc(BW - 22, 24, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dotCol;
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(b.status || "ACTIVE", BW - 35, 28);
      ctx.textAlign = "left";

      // Building name — large
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = hexCol;
      ctx.shadowBlur = 6;
      ctx.font = "bold 34px 'Barlow Condensed', 'Arial Narrow', sans-serif";
      ctx.fillText(b.name, 16, 86);
      ctx.shadowBlur = 0;

      // Subtitle
      ctx.fillStyle = hexCol + "cc";
      ctx.font = "13px 'Share Tech Mono', monospace";
      ctx.fillText(b.subtitle || "", 16, 108);

      // Divider line
      ctx.strokeStyle = hexCol + "44";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, 118);
      ctx.lineTo(BW - 16, 118);
      ctx.stroke();

      // Story excerpt (first 120 chars)
      const raw = (b.story || "").replace(/<[^>]+>/g, "").replace(/\n/g, " ");
      const excerpt = raw.length > 140 ? raw.slice(0, 138) + "…" : raw;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "13px 'Barlow', 'Arial', sans-serif";
      // Word wrap
      const words = excerpt.split(" ");
      let line = "",
        lineY = 140;
      words.forEach((w) => {
        const test = line + w + " ";
        if (ctx.measureText(test).width > BW - 32 && line) {
          ctx.fillText(line.trim(), 16, lineY);
          line = w + " ";
          lineY += 18;
        } else {
          line = test;
        }
        if (lineY > 188) return;
      });
      if (lineY <= 188) ctx.fillText(line.trim(), 16, lineY);

      // Metrics row
      const mY = 220;
      ctx.strokeStyle = hexCol + "33";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16, mY - 8);
      ctx.lineTo(BW - 16, mY - 8);
      ctx.stroke();
      (b.metrics || []).slice(0, 3).forEach((m, i) => {
        const mx = 16 + i * 152;
        ctx.fillStyle = hexCol;
        ctx.font = "bold 24px 'Barlow Condensed', 'Arial Narrow', sans-serif";
        ctx.fillText(m.v, mx, mY + 16);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "10px 'Share Tech Mono', monospace";
        ctx.fillText(m.l, mx, mY + 32);
      });

      // Bottom tech tags
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "10px 'Share Tech Mono', monospace";
      const tags = (b.tech || []).slice(0, 5).join("  ·  ");
      ctx.fillText(tags, 16, BH - 16);

      // "Press E to enter" hint
      ctx.fillStyle = hexCol + "88";
      ctx.font = "bold 11px 'Share Tech Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText("[ E ]  ENTER TEMPLE", BW - 16, BH - 16);
      ctx.textAlign = "left";

      const tex = new THREE.CanvasTexture(can);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(14, 8.2, 1);

      // Position board to the side of the building facing the road
      const side = b.facing === "left" || b.pos[0] < 0 ? 1 : -1;
      const bx = b.pos[0] + side * (b.size[0] / 2 + 5);
      const bz = b.pos[1];
      const boardH = (b.height || 12) * 0.55 + 3;
      sprite.position.set(bx, boardH, bz);
      sprite.userData.building = b;
      sprite.userData.baseY = boardH;
      sprite.userData.isInfoBoard = true;
      scene.add(sprite);
      infoBoardSprites.push(sprite);
    });
  }

  function buildZoneAmbients() {
    const zones = [
      { pos: [-32, -24], color: 0x0088cc, intensity: 0.45, dist: 32 },
      { pos: [32, -24], color: 0x33aa22, intensity: 0.42, dist: 32 },
      { pos: [68, -8], color: 0x0066aa, intensity: 0.35, dist: 28 },
      { pos: [68, 28], color: 0x22aa44, intensity: 0.32, dist: 26 },
      { pos: [-68, -8], color: 0xaa8800, intensity: 0.38, dist: 28 },
      { pos: [-68, 28], color: 0xcc5500, intensity: 0.35, dist: 26 },
      { pos: [-32, 24], color: 0xcc5500, intensity: 0.32, dist: 24 },
      { pos: [32, 24], color: 0x8833cc, intensity: 0.32, dist: 24 },
      { pos: [32, 58], color: 0x3388cc, intensity: 0.3, dist: 24 },
      { pos: [-32, 58], color: 0xcc7722, intensity: 0.3, dist: 24 },
      { pos: [-22, -72], color: 0x7744cc, intensity: 0.35, dist: 26 },
      { pos: [22, -72], color: 0x22aa77, intensity: 0.35, dist: 26 },
    ];
    zones.forEach(({ pos, color, intensity, dist }) => {
      const light = new THREE.PointLight(
        color,
        isNight ? intensity : intensity * 0.2,
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
        fogD: 0.004,
        sun: 0xff9966,
        sunI: 1.4,
        fill: 0x3344bb,
        fillI: 1.2,
        amb: 0x110806,
        ambI: 0.3,
        exp: 1.15,
      },
      day: {
        bg: 0xf0c898, // Firefly golden-warm sky
        fog: 0xf0c898,
        fogD: 0.0012, // very light — see temples far away
        sun: 0xffe088, // warm golden east light
        sunI: 3.8, // bright golden hour
        fill: 0x8866cc, // cool purple twilight from west
        fillI: 0.75,
        amb: 0xffcc77, // warm golden ambient
        ambI: 0.65,
        exp: 1.08,
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
    // Firefly reference: golden sunset light from the RIGHT (east)
    // Warm sky from east, cool purple-blue from west/above = depth

    // HemisphereLight: warm golden sky, cool twilight ground
    hemiLight = new THREE.HemisphereLight(0xffe8aa, 0x7755aa, 1.4);
    scene.add(hemiLight);

    // Key light: golden sunset FROM THE EAST (right side of scene)
    sunLight = new THREE.DirectionalLight(0xffdd88, 3.5);
    sunLight.position.set(80, 45, 10); // east side, low angle = golden hour
    scene.add(sunLight);

    // Fill: cool blue-purple from the west/overhead — creates depth
    fillLight = new THREE.DirectionalLight(0x8866dd, 0.8);
    fillLight.position.set(-60, 30, -20);
    scene.add(fillLight);

    // Warm ambient — nothing fully dark in temple city
    ambLight = new THREE.AmbientLight(0xffcc88, 0.65);
    scene.add(ambLight);
  }

  // ── GROUND ───────────────────────────────────────────────────────────────
  function buildGround() {
    buildLightingObjects();

    // ── BASE GROUND — warm sandy peach like Bruno Simon ──
    const grassMat = new THREE.MeshLambertMaterial({ color: P.ground });
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(400, 0.4, 400),
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
    const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), waterMat);
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
    // Deep terracotta paving matching the Firefly reference
    const roadMat = new THREE.MeshLambertMaterial({ color: 0xaa5533 }); // brick-red road
    const swMat = new THREE.MeshLambertMaterial({ color: 0xcc7755 }); // warm terracotta plaza
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xffe066 }); // golden dashes
    const waterChannelMat = new THREE.MeshLambertMaterial({ color: 0x2288bb }); // bright blue channels

    function road(x1, z1, x2, z2, w) {
      const dx = x2 - x1,
        dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const ang = Math.atan2(dx, dz);

      // Wide sandstone plaza border
      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(w + 5.0, 0.22, len),
        swMat,
      );
      sw.rotation.y = ang;
      sw.position.set((x1 + x2) / 2, 0.11, (z1 + z2) / 2);
      scene.add(sw);

      // Road surface
      const rd = new THREE.Mesh(new THREE.BoxGeometry(w, 0.23, len), roadMat);
      rd.rotation.y = ang;
      rd.position.set((x1 + x2) / 2, 0.12, (z1 + z2) / 2);
      scene.add(rd);

      // Dashed center line
      const segs = Math.floor(len / 5.0);
      for (let s = 0; s < segs; s++) {
        const t = (s + 0.5) / segs;
        const dl = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.01, 1.8),
          lineMat,
        );
        dl.rotation.y = ang;
        dl.position.set(x1 + dx * t, 0.24, z1 + dz * t);
        scene.add(dl);
      }

      // Water channels alongside the road (like the blue channels in the video)
      // Only add to main horizontal/vertical arteries, not every road
    }

    // Helper: add blue water channel alongside a road
    function waterChannel(x1, z1, x2, z2, side) {
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.sqrt(dx * dx + dz * dz),
        ang = Math.atan2(dx, dz);
      const perpX = Math.cos(ang) * side,
        perpZ = -Math.sin(ang) * side;
      const offset = 8.5;
      const chan = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.35, len),
        waterChannelMat,
      );
      chan.rotation.y = ang;
      chan.position.set(
        (x1 + x2) / 2 + perpX * offset,
        -0.05,
        (z1 + z2) / 2 + perpZ * offset,
      );
      scene.add(chan);
      // Low stone wall beside channel
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xcc9966 });
      [-0.6, 0.6].forEach((wo) => {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.45, len),
          wallMat,
        );
        wall.rotation.y = ang;
        wall.position.set(
          (x1 + x2) / 2 + perpX * (offset + wo * 1.5),
          0.22,
          (z1 + z2) / 2 + perpZ * (offset + wo * 1.5),
        );
        scene.add(wall);
      });
    }

    const RW = 11;

    // ── MAIN BOULEVARD — horizontal spine z=0, full width ─────────────────
    road(-90, 0, 90, 0, RW);
    // ── UPPER BOULEVARD z=-14 — hero zone ──────────────────────────────────
    road(-90, -14, 90, -14, RW);
    // ── SOUTH BOULEVARD z=42 ───────────────────────────────────────────────
    road(-90, 42, 90, 42, RW);
    // ── EDUCATION AVE z=-62 ────────────────────────────────────────────────
    road(-45, -62, 45, -62, RW);

    // ── CENTRAL N-S SPINE x=0 ──────────────────────────────────────────────
    road(0, -80, 0, 70, RW);
    // ── WEST N-S ARTERY x=-45 ──────────────────────────────────────────────
    road(-45, -14, -45, 42, RW);
    // ── EAST N-S ARTERY x=45 ───────────────────────────────────────────────
    road(45, -14, 45, 42, RW);
    // ── FAR WEST x=-58 (to reach Brahma Kund + Lakshmi) ───────────────────
    road(-58, -14, -58, 42, RW);
    // ── FAR EAST x=58 (to reach Akasha + Setu) ────────────────────────────
    road(58, -14, 58, 42, RW);

    // ── CONNECTING CROSS-STREETS ──────────────────────────────────────────
    road(-90, 24, 90, 24, RW);
    road(-90, -38, 90, -38, RW);

    // ── WATER CHANNELS alongside central N-S spine (like Firefly video) ───
    waterChannel(0, -70, 0, 60, 1); // east side of central spine
    waterChannel(0, -70, 0, 60, -1); // west side of central spine

    // ── CENTRAL ROUNDABOUT — deep terracotta like the reference ───────────
    const rMat = new THREE.MeshLambertMaterial({ color: 0xbb6644 });
    const rGnd = new THREE.MeshLambertMaterial({ color: P.ground });
    const rGeo = new THREE.RingGeometry(10.5, 17, 24);
    const rMesh = new THREE.Mesh(rGeo, rMat);
    rMesh.rotation.x = -Math.PI / 2;
    rMesh.position.y = 0.13;
    scene.add(rMesh);
    const isl = new THREE.Mesh(
      new THREE.CylinderGeometry(10.5, 10.5, 0.32, 18),
      rGnd,
    );
    isl.position.y = 0.16;
    scene.add(isl);

    // ── EDUCATION ROUNDABOUT ─────────────────────────────────────────────
    const eGeo = new THREE.RingGeometry(7, 11, 18);
    const eMesh = new THREE.Mesh(eGeo, rMat);
    eMesh.rotation.x = -Math.PI / 2;
    eMesh.position.set(0, 0.13, -38);
    scene.add(eMesh);
    const eIsl = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 0.3, 16),
      rGnd,
    );
    eIsl.position.set(0, 0.15, -38);
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
  // ── TEMPLE BUILDING RENDERER ──────────────────────────────────────────────
  // Types: gopuram | mandapa | shikhara | stupa
  // Each creates authentic Hindu temple low-poly geometry

  function pc(c) {
    if (typeof c === "string" && c.startsWith("#"))
      return parseInt(c.slice(1), 16);
    return typeof c === "number" ? c : 0x334455;
  }

  function buildBuilding(b) {
    const g = new THREE.Group();
    g.position.set(b.pos[0], 0, b.pos[1]);

    const w = b.size[0],
      d = b.size[1],
      h = b.height;
    const gc = pc(b.glowColor);

    // Pick stone colors per zone
    // Temple stone colors — ALL significantly brighter, warm sandstone bias
    // Bruno Simon diorama: top faces warm/bright, shadows are tinted cool
    const stoneColors = {
      "#00c8ff": [0xddeeff, 0xaaccee, 0x5588aa], // light blue-white marble
      "#7dff4f": [0xeeffcc, 0xbbdd88, 0x667733], // warm mossy sandstone
      "#ffcc44": [0xfff0bb, 0xeebb55, 0xaa7700], // golden sandstone — VIVID
      "#ff6b00": [0xffddb8, 0xee9944, 0xaa4411], // warm terracotta — VIVID
      "#c084fc": [0xffeeff, 0xddaaff, 0x9944cc], // light lavender marble
      "#4dd4ff": [0xddf4ff, 0x99ddff, 0x4488bb], // pale blue slate
      "#ff9950": [0xffeedd, 0xeeaa66, 0xaa5522], // warm honey sandstone
      "#a78bfa": [0xf0e8ff, 0xcc99ff, 0x7744bb], // pale violet marble
      "#34d399": [0xddfff0, 0x88eebb, 0x227755], // jade white-green
    };
    const [sLight, sMid, sDark] = stoneColors[b.glowColor] || [
      0xffeedd, 0xddbb88, 0x886633,
    ];

    // Use warm matcap for all stone — it catches the hemisphere light better
    const mLight = new THREE.MeshMatcapMaterial({
      color: sLight,
      matcap: matcaps.stone,
    });
    const mMid = new THREE.MeshMatcapMaterial({
      color: sMid,
      matcap: matcaps.stone,
    });
    const mDark = new THREE.MeshMatcapMaterial({
      color: sDark,
      matcap: matcaps.warm,
    });
    const mGlow = new THREE.MeshBasicMaterial({ color: gc });
    const mGoldMat = new THREE.MeshMatcapMaterial({
      color: 0xffcc44,
      matcap: matcaps.gold || matcaps.warm,
    });

    const type = b.templeType || "shikhara";

    // ── FOUNDATION PLATFORM (all temples) ────────────────────────────────
    // Multi-step raised platform — the jagati/adhishthana
    const steps = b.isHero ? 4 : 3;
    for (let s = 0; s < steps; s++) {
      const sw = w + (steps - s) * 1.8;
      const sd = d + (steps - s) * 1.8;
      const sh = 0.38;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(sw, sh, sd),
        s % 2 === 0 ? mMid : mLight,
      );
      slab.position.y = s * sh + sh / 2;
      g.add(slab);
    }
    const baseH = steps * 0.38;

    if (type === "gopuram") {
      // ── GOPURAM: South Indian temple gateway tower ─────────────────────
      // Wide base, horizontal tiers tapering up to a barrel vault top

      // Main gate hall — wide mandapa at base
      const hallH = h * 0.28;
      const hall = new THREE.Mesh(new THREE.BoxGeometry(w, hallH, d), mMid);
      hall.position.y = baseH + hallH / 2;
      g.add(hall);

      // Gate opening (dark archway)
      const arch = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.35, hallH * 0.75, d + 0.5),
        mDark,
      );
      arch.position.y = baseH + hallH * 0.38;
      g.add(arch);

      // Horizontal tiers stacking up — each slightly narrower
      const tiers = b.isHero ? 8 : 6;
      let tierY = baseH + hallH;
      let tw = w,
        td = d;
      const tierH = (h - hallH) / tiers;
      for (let t = 0; t < tiers; t++) {
        tw *= 0.88;
        td *= 0.88;
        const tier = new THREE.Mesh(
          new THREE.BoxGeometry(tw, tierH, td),
          t % 2 === 0 ? mMid : mLight,
        );
        tier.position.y = tierY + tierH / 2;
        g.add(tier);

        // Horizontal cornice line between tiers
        const cornice = new THREE.Mesh(
          new THREE.BoxGeometry(tw + 0.3, 0.18, td + 0.3),
          mDark,
        );
        cornice.position.y = tierY + tierH;
        g.add(cornice);

        // Small decorative niches on each tier
        if (t < tiers - 2) {
          [-1, 1].forEach((side) => {
            const niche = new THREE.Mesh(
              new THREE.BoxGeometry(tw * 0.18, tierH * 0.7, 0.25),
              new THREE.MeshMatcapMaterial({
                color: darken(sMid, 0.2),
                matcap: matcaps.stone || matcaps.warm,
              }),
            );
            niche.position.set(
              side * tw * 0.36,
              tierY + tierH * 0.5,
              td / 2 + 0.05,
            );
            g.add(niche);
          });
        }
        tierY += tierH;
      }

      // Barrel vault top (shikhara of the gopuram)
      const vault = new THREE.Mesh(
        new THREE.CylinderGeometry(tw * 0.3, tw * 0.48, tw * 0.7, 8),
        mMid,
      );
      vault.position.y = tierY + tw * 0.35;
      vault.rotation.z = Math.PI / 2;
      g.add(vault);

      // Kalasha (sacred pot) on top
      const kBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.42, 0.35, 8),
        mGoldMat,
      );
      kBase.position.y = tierY + tw * 0.7 + 0.18;
      g.add(kBase);
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        mGoldMat,
      );
      kPot.position.y = tierY + tw * 0.7 + 0.55;
      g.add(kPot);
      const kTop = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.52, 6),
        mGoldMat,
      );
      kTop.position.y = tierY + tw * 0.7 + 1.08;
      g.add(kTop);
    } else if (type === "shikhara") {
      // ── SHIKHARA: North Indian curvilinear spire ──────────────────────
      // Square base (garbhagriha), cylindrical/curvilinear spire rising up

      // Sanctum walls
      const sanctumH = h * 0.32;
      const sanctum = new THREE.Mesh(
        new THREE.BoxGeometry(w, sanctumH, d),
        mMid,
      );
      sanctum.position.y = baseH + sanctumH / 2;
      g.add(sanctum);

      // Four projecting portico ribs (rathas) — carved projections
      [
        [0, d / 2, 0],
        [0, -d / 2, 0],
        [w / 2, 0, Math.PI / 2],
        [-w / 2, 0, Math.PI / 2],
      ].forEach(([ox, oz, ry]) => {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.28, sanctumH * 0.88, 0.6),
          mLight,
        );
        rib.position.set(
          ox > 0 ? ox - 0.2 : ox + 0.2,
          baseH + sanctumH * 0.44,
          oz > 0 ? oz - 0.1 : oz + 0.1,
        );
        rib.rotation.y = ry;
        g.add(rib);
      });

      // Amalaka (ribbed disc at spire top)
      const amalY = baseH + sanctumH;
      let spW = w * 0.9;
      const spTiers = b.isHero ? 10 : 7;
      const spH = (h - sanctumH) / spTiers;
      for (let t = 0; t < spTiers; t++) {
        spW *= 0.85;
        const spTier = new THREE.Mesh(
          new THREE.CylinderGeometry(spW * 0.5, spW * 0.55, spH, 8),
          t % 2 === 0 ? mMid : mLight,
        );
        spTier.position.y = amalY + t * spH + spH / 2;
        g.add(spTier);

        // Curved profile lines
        if (t < spTiers - 2) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(spW * 0.52, 0.1, 4, 12),
            new THREE.MeshBasicMaterial({
              color: gc,
              transparent: true,
              opacity: 0.55,
            }),
          );
          band.position.y = amalY + t * spH + spH;
          band.rotation.x = Math.PI / 2;
          g.add(band);
        }
      }
      // Amalaka disc
      const aml = new THREE.Mesh(
        new THREE.CylinderGeometry(spW * 0.7, spW * 0.7, 0.35, 12),
        mGoldMat,
      );
      aml.position.y = amalY + spTiers * spH + 0.18;
      g.add(aml);
      // Kalasha
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 6),
        mGoldMat,
      );
      kPot.position.y = amalY + spTiers * spH + 0.6;
      g.add(kPot);
      const kFlag = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.55, 5),
        mGoldMat,
      );
      kFlag.position.y = amalY + spTiers * spH + 1.1;
      g.add(kFlag);
    } else if (type === "mandapa") {
      // ── MANDAPA: Pillared pavilion / columned hall ────────────────────
      // Low wide roof supported by many columns — like a great hall

      // Main hall roof — flat tiered
      const roofH = h * 0.45;
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, roofH, d + 0.5),
        mMid,
      );
      roof.position.y = baseH + roofH / 2;
      g.add(roof);

      // Upper tier
      const topH = h * 0.28;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.72, topH, d * 0.72),
        mLight,
      );
      top.position.y = baseH + roofH + topH / 2;
      g.add(top);

      // Crown spire
      const crownH = h * 0.2;
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.18, w * 0.26, crownH, 8),
        mMid,
      );
      crown.position.y = baseH + roofH + topH + crownH / 2;
      g.add(crown);
      const kPot = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        mGoldMat,
      );
      kPot.position.y = baseH + roofH + topH + crownH + 0.35;
      g.add(kPot);

      // Rows of columns on all sides — the mandapa's signature
      const cols = b.isHero ? 4 : 3;
      const colH = roofH * 0.88;
      const colMat = new THREE.MeshMatcapMaterial({
        color: sLight,
        matcap: matcaps.stone || matcaps.warm,
      });
      [-1, 1].forEach((side) => {
        for (let i = 0; i < cols; i++) {
          const cx = (i / (cols - 1) - 0.5) * (w - 1.0);
          // Front colonnade
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.32, colH, 7),
            colMat,
          );
          col.position.set(cx, baseH + colH / 2, side * (d / 2 + 0.1));
          g.add(col);
          // Capital
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.28, 0.65),
            mMid,
          );
          cap.position.set(cx, baseH + colH + 0.14, side * (d / 2 + 0.1));
          g.add(cap);
          // Base
          const base2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.62, 0.22, 0.62),
            mMid,
          );
          base2.position.set(cx, baseH + 0.11, side * (d / 2 + 0.1));
          g.add(base2);
        }
        // Side colonnade
        for (let i = 0; i < cols; i++) {
          const cz = (i / (cols - 1) - 0.5) * (d - 1.0);
          const col = new THREE.Mesh(
            new THREE.CylinderGeometry(0.26, 0.32, colH, 7),
            colMat,
          );
          col.position.set(side * (w / 2 + 0.1), baseH + colH / 2, cz);
          g.add(col);
          const cap = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.28, 0.65),
            mMid,
          );
          cap.position.set(side * (w / 2 + 0.1), baseH + colH + 0.14, cz);
          g.add(cap);
        }
      });
    } else if (type === "stupa") {
      // ── STUPA: Buddhist-influenced dome shrine ─────────────────────────
      // Circular dome (anda) on a square platform with a harmika on top

      // Square drum base
      const drumH = h * 0.35;
      const drum = new THREE.Mesh(new THREE.BoxGeometry(w, drumH, d), mMid);
      drum.position.y = baseH + drumH / 2;
      g.add(drum);
      // Decorative band
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4),
        mGoldMat,
      );
      band.position.y = baseH + drumH;
      g.add(band);

      // Hemisphere dome (anda)
      const domeR = Math.min(w, d) * 0.52;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(domeR, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        mLight,
      );
      dome.position.y = baseH + drumH;
      g.add(dome);

      // Harmika (square fence on top)
      const hmY = baseH + drumH + domeR * 0.78;
      const hm = new THREE.Mesh(
        new THREE.BoxGeometry(domeR * 0.55, domeR * 0.35, domeR * 0.55),
        mMid,
      );
      hm.position.y = hmY;
      g.add(hm);

      // Chattravali — stacked discs (the spire)
      let disY = hmY + domeR * 0.18;
      let disR = domeR * 0.22;
      const discCount = b.isHero ? 6 : 4;
      for (let i = 0; i < discCount; i++) {
        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(disR, disR * 1.1, 0.22, 10),
          mGoldMat,
        );
        disc.position.y = disY;
        g.add(disc);
        disY += 0.28;
        disR *= 0.82;
      }
      // Finial
      const fin = new THREE.Mesh(
        new THREE.SphereGeometry(disR * 1.2, 8, 6),
        mGoldMat,
      );
      fin.position.y = disY + 0.18;
      g.add(fin);
    }

    // ── TORANA GATEWAY — decorative archway in front ──────────────────────
    // Only hero buildings get an elaborate torana
    if (b.isHero || b.isEducation) {
      const torH = h * 0.5;
      const torW = w * 0.7;
      // Left post
      const lPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, torH, 0.42),
        mMid,
      );
      lPost.position.set(-torW / 2, torH / 2, d / 2 + 1.8);
      g.add(lPost);
      // Right post
      const rPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, torH, 0.42),
        mMid,
      );
      rPost.position.set(torW / 2, torH / 2, d / 2 + 1.8);
      g.add(rPost);
      // Lintel
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(torW + 0.42, 0.45, 0.42),
        mMid,
      );
      lintel.position.set(0, torH, d / 2 + 1.8);
      g.add(lintel);
      // Torana arch decoration
      const archDec = new THREE.Mesh(
        new THREE.BoxGeometry(torW * 0.55, 0.32, 0.42),
        mGoldMat,
      );
      archDec.position.set(0, torH + 0.46, d / 2 + 1.8);
      g.add(archDec);
    }

    // ── GLOWING ORBS on hero buildings ───────────────────────────────────
    if (b.isHero) {
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      orb.position.y = h + 2.5;
      orb.userData.isOrb = true;
      g.add(orb);
      [1.2, 2.0].forEach((r, i) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.06, 4, 16),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.5 - i * 0.12,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h + 2.5;
        ring.userData.heroRing = true;
        ring.userData.ri = i;
        g.add(ring);
      });
      g.add(ptLight(gc, isNight ? 4.5 : 1.8, 28, [0, h + 2, 0]));
      // Warm light at base for interior glow effect
      g.add(ptLight(0xffcc88, isNight ? 2.0 : 0.8, 12, [0, 1.5, 0]));
    } else {
      g.add(ptLight(gc, isNight ? 2.5 : 1.0, 20, [0, h * 0.7, 0]));
      g.add(ptLight(0xffcc88, isNight ? 1.5 : 0.55, 10, [0, 1.0, 0]));
    }

    // ── BLOB SHADOW ───────────────────────────────────────────────────────
    addBlobShadow(b, g);

    // Collision box — larger padding for temples
    buildingBoxes.push({
      minX: b.pos[0] - w / 2 - 2.5,
      maxX: b.pos[0] + w / 2 + 2.5,
      minZ: b.pos[1] - d / 2 - 2.5,
      maxZ: b.pos[1] + d / 2 + 2.5,
    });

    buildingMeshes.push({
      group: g,
      body: g,
      building: b,
      bodyMat: mMid, // for proximity highlight
    });
    scene.add(g);
  }

  function darken(hex, amt) {
    const r = (((hex >> 16) & 0xff) * (1 - amt)) | 0;
    const g2 = (((hex >> 8) & 0xff) * (1 - amt)) | 0;
    const b2 = ((hex & 0xff) * (1 - amt)) | 0;
    return (r << 16) | (g2 << 8) | b2;
  }

  // ── PRAYER FLAGS (Toran banners) — strung across the world at key spots ──
  function buildPrayerFlags() {
    const flagColors = [
      0xff3333, 0xff9900, 0xffdd00, 0x33cc44, 0x3388ff, 0xcc44cc,
    ];

    function stringFlags(x1, y, z1, x2, z2, count) {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const fx = x1 + (x2 - x1) * t;
        const sag = Math.sin(t * Math.PI) * 0.7;
        const fz = z1 + (z2 - z1) * t;
        const fy = y - sag;
        const col = flagColors[i % flagColors.length];
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.32, 0.06),
          new THREE.MeshBasicMaterial({ color: col }),
        );
        flag.position.set(fx, fy, fz);
        flag.rotation.y = Math.atan2(x2 - x1, z2 - z1);
        scene.add(flag);
      }
      const dx = x2 - x1,
        dz = z2 - z1,
        len = Math.sqrt(dx * dx + dz * dz);
      const str = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.02, 0.02),
        new THREE.MeshBasicMaterial({
          color: 0xddcc99,
          transparent: true,
          opacity: 0.55,
        }),
      );
      str.position.set((x1 + x2) / 2, y - 0.35, (z1 + z2) / 2);
      str.rotation.y = Math.atan2(dx, dz);
      scene.add(str);
    }

    // Across the hero zone entrance
    stringFlags(-22, 9, -4, 22, -4, 14);
    // Main boulevard
    stringFlags(-22, 9, 2, 22, 2, 14);
    // South district gateway
    stringFlags(-14, 8, 32, 14, 32, 8);
    stringFlags(-14, 8, 50, 14, 50, 8);
    // Education corridor
    stringFlags(-18, 8, -55, 18, -55, 10);
    // Diagonal across central island
    stringFlags(-8, 7, -16, 8, -16, 6);
  }

  // ── DIRECTIONAL SIGN POSTS — wooden signs near spawn pointing to districts ─
  function buildSignPosts() {
    const woodMat = new THREE.MeshMatcapMaterial({
      color: 0xcc8844,
      matcap: matcaps.warm,
    });
    const textMats = {
      "#00c8ff": new THREE.MeshBasicMaterial({ color: 0x00ccff }),
      "#7dff4f": new THREE.MeshBasicMaterial({ color: 0x77ff44 }),
      "#ffcc44": new THREE.MeshBasicMaterial({ color: 0xffcc44 }),
      "#ff6b00": new THREE.MeshBasicMaterial({ color: 0xff7722 }),
      "#c084fc": new THREE.MeshBasicMaterial({ color: 0xcc88ff }),
      "#34d399": new THREE.MeshBasicMaterial({ color: 0x44eebb }),
    };

    const signs = [
      {
        pos: [-5, 32],
        angle: -0.4,
        text: "◈ SURYA DWARA",
        col: "#00c8ff",
        dist: "↑ NORTH",
      },
      {
        pos: [5, 32],
        angle: 0.4,
        text: "◈ BRAHMA KUND",
        col: "#ffcc44",
        dist: "↑ NORTH",
      },
      {
        pos: [-5, 14],
        angle: -0.2,
        text: "◈ LAKSHMI PRASAD",
        col: "#ff6b00",
        dist: "← WEST",
      },
      {
        pos: [5, 14],
        angle: 0.2,
        text: "◈ AKASHA MANDAPA",
        col: "#00c8ff",
        dist: "→ EAST",
      },
      {
        pos: [0, 14],
        angle: 0.0,
        text: "◈ SARASWATI VIHAR",
        col: "#c084fc",
        dist: "↓ SOUTH",
      },
    ];

    signs.forEach(({ pos, angle, text, col, dist }) => {
      const g = new THREE.Group();
      g.position.set(pos[0], 0, pos[1]);
      g.rotation.y = angle;

      // Post
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 3.2, 0.14),
        woodMat,
      );
      pole.position.y = 1.6;
      g.add(pole);

      // Sign board
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.75, 0.12),
        woodMat,
      );
      board.position.set(0, 3.2, 0);
      g.add(board);

      // Painted sign face canvas
      const W = 280,
        H = 56;
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "rgba(20,10,4,0.9)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col;
      ctx.font = "bold 16px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(text, 10, 24);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "11px 'Share Tech Mono', monospace";
      ctx.fillText(dist, 10, 44);
      const tex = new THREE.CanvasTexture(can);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 0.65),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      face.position.set(0, 3.2, 0.07);
      g.add(face);

      scene.add(g);
    });
  }

  // ── VIJAY STAMBHA — Tall stone victory pillar (right side, Firefly video) ─
  function buildStambha() {
    const stoneMat = new THREE.MeshMatcapMaterial({
      color: 0xeeddcc,
      matcap: matcaps.stone,
    });
    const goldMat = new THREE.MeshMatcapMaterial({
      color: 0xffcc44,
      matcap: matcaps.gold,
    });

    // Place on east side of map like the video
    const SX = 72,
      SZ = 8;

    // Raised octagonal base
    const base1 = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 4.0, 0.8, 8),
      stoneMat,
    );
    base1.position.set(SX, 0.4, SZ);
    scene.add(base1);
    const base2 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 3.0, 0.7, 8),
      stoneMat,
    );
    base2.position.set(SX, 1.15, SZ);
    scene.add(base2);
    const base3 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 0.7, 8),
      stoneMat,
    );
    base3.position.set(SX, 1.9, SZ);
    scene.add(base3);

    // Main shaft — tall and tapering like a real stambha
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.95, 18, 12),
      stoneMat,
    );
    shaft.position.set(SX, 11.0, SZ);
    scene.add(shaft);

    // Decorative bands on shaft
    [4, 8, 12, 16].forEach((y) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.88, 0.28, 12),
        goldMat,
      );
      band.position.set(SX, y, SZ);
      scene.add(band);
    });

    // Bell capital (ghanta)
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 0.6, 1.2, 10),
      stoneMat,
    );
    bell.position.set(SX, 20.6, SZ);
    scene.add(bell);

    // Abacus disc
    const abacus = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.1, 0.55, 12),
      stoneMat,
    );
    abacus.position.set(SX, 21.5, SZ);
    scene.add(abacus);

    // Dharma chakra on top (golden wheel)
    const chakra = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.18, 6, 20),
      goldMat,
    );
    chakra.position.set(SX, 22.4, SZ);
    chakra.userData.isChakra = true;
    scene.add(chakra);

    // Spokes of the chakra
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 1.8),
        goldMat,
      );
      spoke.position.set(SX, 22.4, SZ);
      spoke.rotation.z = ang;
      spoke.userData.isChakra = true;
      scene.add(spoke);
    }

    // Golden glow at top
    scene.add(ptLight(0xffcc44, isNight ? 3.0 : 1.2, 20, [SX, 22, SZ]));
  }

  // ── FORMAL GARDEN CIRCLES — manicured circular gardens from Firefly video ─
  function buildFormalGardens() {
    const gardenMat = new THREE.MeshLambertMaterial({ color: 0x338833 }); // deep green lawn
    const pathMat = new THREE.MeshLambertMaterial({ color: 0xddaa77 }); // sandy path
    const flowerMat1 = new THREE.MeshBasicMaterial({ color: 0xff4488 }); // pink flowers
    const flowerMat2 = new THREE.MeshBasicMaterial({ color: 0xffcc00 }); // yellow flowers
    const hedgeMat = new THREE.MeshMatcapMaterial({
      color: 0x225522,
      matcap: matcaps.tree,
    });
    const fountainMat = new THREE.MeshLambertMaterial({ color: 0x99ccff }); // water

    // Positions of formal garden circles — along the main boulevard
    const gardens = [
      { x: -20, z: -7, r: 6.5 }, // west of hero zone
      { x: 20, z: -7, r: 6.5 }, // east of hero zone
      { x: -20, z: 17, r: 5.5 }, // central district
      { x: 20, z: 17, r: 5.5 },
      { x: -45, z: 5, r: 4.5 }, // west artery
      { x: 45, z: 5, r: 4.5 }, // east artery
      { x: 0, z: -25, r: 5.0 }, // north of hero zone
      { x: 0, z: 35, r: 5.0 }, // south boulevard
    ];

    gardens.forEach(({ x, z, r }) => {
      // Outer lawn circle
      const lawn = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.15, 20),
        gardenMat,
      );
      lawn.position.set(x, 0.075, z);
      scene.add(lawn);

      // Sandy concentric path ring
      const pathRing = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.65, r * 0.12, 4, 24),
        pathMat,
      );
      pathRing.rotation.x = Math.PI / 2;
      pathRing.position.set(x, 0.18, z);
      scene.add(pathRing);

      // Inner green circle
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.42, r * 0.42, 0.18, 16),
        gardenMat,
      );
      inner.position.set(x, 0.09, z);
      scene.add(inner);

      // Flower ring — alternating pink/yellow dots around the path
      const numFlowers = Math.floor(r * 3);
      for (let i = 0; i < numFlowers; i++) {
        const ang = (i / numFlowers) * Math.PI * 2;
        const fr = r * 0.65;
        const mat = i % 2 === 0 ? flowerMat1 : flowerMat2;
        const flower = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 5, 4),
          mat,
        );
        flower.position.set(
          x + Math.cos(ang) * fr,
          0.38,
          z + Math.sin(ang) * fr,
        );
        scene.add(flower);
      }

      // Radial hedge spokes
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const hlen = r * 0.55;
        const hedge = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.55, hlen),
          hedgeMat,
        );
        hedge.position.set(
          x + (Math.cos(ang) * hlen) / 2,
          0.28,
          z + (Math.sin(ang) * hlen) / 2,
        );
        hedge.rotation.y = -ang;
        scene.add(hedge);
      }

      // Central fountain or small monument
      if (r > 5) {
        // Small central fountain bowl
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12),
          new THREE.MeshMatcapMaterial({
            color: 0xeeddcc,
            matcap: matcaps.stone,
          }),
        );
        bowl.position.set(x, 0.2, z);
        scene.add(bowl);
        // Water surface
        const waterSurf = new THREE.Mesh(
          new THREE.CircleGeometry(0.75, 12),
          fountainMat,
        );
        waterSurf.rotation.x = -Math.PI / 2;
        waterSurf.position.set(x, 0.42, z);
        scene.add(waterSurf);
        // Fountain jet (thin cone upward)
        const jet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.12, 1.2, 6),
          new THREE.MeshBasicMaterial({
            color: 0xbbddff,
            transparent: true,
            opacity: 0.7,
          }),
        );
        jet.position.set(x, 0.9, z);
        scene.add(jet);
        scene.add(ptLight(0x88ccff, isNight ? 1.5 : 0.4, 8, [x, 1.5, z]));
      } else {
        // Small ornamental stone
        const orn = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.42, 0),
          new THREE.MeshMatcapMaterial({
            color: 0xffcc44,
            matcap: matcaps.gold,
          }),
        );
        orn.position.set(x, 0.55, z);
        orn.userData.isTimelineGem = true;
        orn.userData.baseY = 0.55;
        orn.userData.phase = x * 0.3;
        scene.add(orn);
      }
    });
  }

  // ── P3: DISTRICT GATEWAY ARCHES ───────────────────────────────────────────
  // Grand entrance arches across roads marking district transitions
  function buildGatewayArches() {
    const archMat = new THREE.MeshMatcapMaterial({
      color: 0xf0d8a0,
      matcap: matcaps.stone,
    });
    const goldMat = new THREE.MeshMatcapMaterial({
      color: 0xffcc44,
      matcap: matcaps.gold,
    });
    const textData = [
      { x: 0, z: -4, ry: 0, label: "◈  HERO DISTRICT", col: 0x00ddff },
      { x: 0, z: -36, ry: 0, label: "◈  MODERNIZATION ZONE", col: 0xffcc44 },
      { x: 0, z: -56, ry: 0, label: "◈  EDUCATION DISTRICT", col: 0xa78bfa },
      { x: 0, z: 36, ry: 0, label: "◈  SOUTH DISTRICT", col: 0xff9950 },
      {
        x: -44,
        z: 14,
        ry: Math.PI / 2,
        label: "◈  WEST QUARTER",
        col: 0xffcc44,
      },
      {
        x: 44,
        z: 14,
        ry: Math.PI / 2,
        label: "◈  EAST QUARTER",
        col: 0x00c8ff,
      },
    ];

    textData.forEach(({ x, z, ry, label, col }) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;

      const W2 = 9; // half-width of arch opening
      const H = 8; // arch height

      // Left pillar
      [-W2, W2].forEach((ox) => {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, H, 1.0),
          archMat,
        );
        pillar.position.set(ox, H / 2, 0);
        g.add(pillar);
        // Capital
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.6, 1.6),
          goldMat,
        );
        cap.position.set(ox, H + 0.3, 0);
        g.add(cap);
        // Decorative pot on capital
        const pot = new THREE.Mesh(
          new THREE.SphereGeometry(0.38, 7, 5),
          goldMat,
        );
        pot.position.set(ox, H + 0.88, 0);
        g.add(pot);
      });

      // Horizontal beam / lintel
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(W2 * 2 + 1.0, 0.9, 1.0),
        archMat,
      );
      lintel.position.set(0, H, 0);
      g.add(lintel);

      // Gold accent strip on lintel
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(W2 * 2 + 0.4, 0.2, 0.12),
        goldMat,
      );
      strip.position.set(0, H + 0.5, 0.5);
      g.add(strip);

      // Arch kalasha centre
      const kalasha = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 6),
        goldMat,
      );
      kalasha.position.set(0, H + 1.0, 0);
      g.add(kalasha);
      const finial = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.6, 5),
        goldMat,
      );
      finial.position.set(0, H + 1.82, 0);
      g.add(finial);

      // ── CANVAS NAME SIGN on the arch ──────────────────────────────────
      const CW = 380,
        CH = 56;
      const can = document.createElement("canvas");
      can.width = CW;
      can.height = CH;
      const ctx = can.getContext("2d");
      ctx.fillStyle = "rgba(8,4,1,0.88)";
      ctx.fillRect(0, 0, CW, CH);
      const hexCol = "#" + col.toString(16).padStart(6, "0");
      ctx.strokeStyle = hexCol + "bb";
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, CW - 4, CH - 4);
      ctx.fillStyle = hexCol;
      ctx.font = "bold 26px 'Barlow Condensed', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, CW / 2, CH / 2);
      const tex = new THREE.CanvasTexture(can);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(W2 * 2 - 0.5, 1.1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
      );
      sign.position.set(0, H - 0.3, 0.55);
      g.add(sign);

      scene.add(g);
    });
  }

  // ── P5: ANIMATED BIRDS (flock circling above gopurams) ───────────────────
  function buildBirdFlock() {
    birdGroup = new THREE.Group();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x222211 });

    for (let i = 0; i < 22; i++) {
      const bird = new THREE.Group();
      // Simple bird: two wing triangles + small body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.06, 0.28),
        birdMat,
      );
      bird.add(body);
      [-1, 1].forEach((side) => {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.04, 0.18),
          birdMat,
        );
        wing.position.set(side * 0.3, 0, 0);
        wing.rotation.z = side * 0.28;
        wing.userData.isWing = true;
        wing.userData.side = side;
        bird.add(wing);
      });

      // Orbit params
      bird.userData.orbitR = 18 + Math.random() * 14;
      bird.userData.orbitH = 22 + Math.random() * 12;
      bird.userData.orbitSpeed = 0.18 + Math.random() * 0.14;
      bird.userData.orbitPhase = (i / 22) * Math.PI * 2;
      bird.userData.flapPhase = Math.random() * Math.PI * 2;
      birdGroup.add(bird);
    }
    scene.add(birdGroup);
  }

  // ── P6: DISTRICT POSITIONAL AUDIO ────────────────────────────────────────
  // Each district plays a thematic ambient tone using Web Audio
  // Gets louder as you approach, fades as you move away
  function initDistrictAudio() {
    if (!audioCtx) return;
    const districts = [
      // [x, z, baseFreq, type, label]
      { id: "hero", x: 0, z: -24, freq: 528, type: "bell", vol: 0 },
      { id: "east", x: 68, z: 10, freq: 396, type: "singing", vol: 0 },
      { id: "west", x: -68, z: 10, freq: 285, type: "veena", vol: 0 },
      { id: "south", x: 0, z: 55, freq: 432, type: "flute", vol: 0 },
      { id: "edu", x: 0, z: -72, freq: 639, type: "chant", vol: 0 },
    ];

    districts.forEach((d) => {
      try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filt = audioCtx.createBiquadFilter();

        osc.type =
          d.type === "bell"
            ? "sine"
            : d.type === "singing"
              ? "sine"
              : d.type === "veena"
                ? "triangle"
                : d.type === "flute"
                  ? "sine"
                  : "sine";
        osc.frequency.value = d.freq;
        filt.type = "bandpass";
        filt.frequency.value = d.freq * 2;
        filt.Q.value = 8;
        gain.gain.value = 0;
        osc.connect(filt);
        filt.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        districtAudio[d.id] = { osc, gain, x: d.x, z: d.z, targetVol: 0 };
      } catch (e) {}
    });
  }

  function updateDistrictAudio() {
    Object.values(districtAudio).forEach((d) => {
      const dist = Math.hypot(carX - d.x, carZ - d.z);
      d.targetVol = Math.max(0, Math.min(0.06, ((55 - dist) / 55) * 0.06));
      if (d.gain) {
        const cur = d.gain.gain.value;
        d.gain.gain.value += (d.targetVol - cur) * 0.04;
      }
    });
  }

  // ── P7: NIGHT DIYA GLOW — animated on all checkpoint diyas ───────────────
  // (handled in animate loop via diyaFlames array and isDiyaLight userData)

  // ── CENTERPIECE — Bruno Simon style island with bench, trees, glow ring ──
  function buildCenterpiece() {
    // Raised circular platform
    const islandMat = new THREE.MeshLambertMaterial({ color: 0xcc7755 }); // terracotta island
    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(7.5, 8.2, 0.55, 18),
      islandMat,
    );
    island.position.y = 0.28;
    scene.add(island);
    const paveMat = new THREE.MeshLambertMaterial({ color: 0xdd9977 }); // sandstone paving
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
      // ── CENTRAL ISLAND cluster ─────────────────────────────────────────
      [7, 7],
      [-7, 7],
      [7, -7],
      [-7, -7],
      [11, 0],
      [-11, 0],
      [0, 11],
      [0, -11],
      [14, 5],
      [-14, 5],
      [14, -5],
      [-14, -5],

      // ── MAIN BOULEVARD z=0 ─────────────────────────────────────────────
      [20, 5],
      [-20, 5],
      [20, -5],
      [-20, -5],
      [35, 5],
      [-35, 5],
      [35, -5],
      [-35, -5],
      [50, 5],
      [-50, 5],
      [50, -5],
      [-50, -5],
      [65, 5],
      [-65, 5],
      [65, -5],
      [-65, -5],
      [78, 5],
      [-78, 5],
      [78, -5],
      [-78, -5],

      // ── HERO ZONE z=-14 ────────────────────────────────────────────────
      [22, -14],
      [-22, -14],
      [22, -8],
      [-22, -8],
      [45, -18],
      [-45, -18],
      [45, -8],
      [-45, -8],

      // ── UPPER BELT z=-38 ───────────────────────────────────────────────
      [20, -38],
      [-20, -38],
      [40, -38],
      [-40, -38],
      [55, -38],
      [-55, -38],
      [70, -38],
      [-70, -38],
      [10, -44],
      [-10, -44],

      // ── EDUCATION BOULEVARD z=-62 ──────────────────────────────────────
      [8, -62],
      [-8, -62],
      [35, -62],
      [-35, -62],
      [8, -55],
      [-8, -55],
      [8, -70],
      [-8, -70],
      [34, -68],
      [-34, -68],
      [34, -56],
      [-34, -56],

      // ── FAR SOUTH ──────────────────────────────────────────────────────
      [0, -80],
      [18, -80],
      [-18, -80],
      [35, -80],
      [-35, -80],

      // ── SOUTH BOULEVARD z=42 ───────────────────────────────────────────
      [20, 42],
      [-20, 42],
      [40, 42],
      [-40, 42],
      [55, 42],
      [-55, 42],
      [70, 42],
      [-70, 42],
      [0, 50],
      [18, 50],
      [-18, 50],

      // ── FAR NORTH (behind player spawn) ────────────────────────────────
      [20, 55],
      [-20, 55],
      [40, 55],
      [-40, 55],
      [0, 60],
      [10, 62],
      [-10, 62],

      // ── MID CROSS z=24 ─────────────────────────────────────────────────
      [20, 24],
      [-20, 24],
      [45, 24],
      [-45, 24],
      [55, 24],
      [-55, 24],
      [70, 30],
      [-70, 30],

      // ── EAST DISTRICT ──────────────────────────────────────────────────
      [78, 8],
      [78, -8],
      [78, 20],
      [78, 35],
      [78, 50],
      [86, 0],
      [86, 15],
      [86, 30],
      [86, -15],

      // ── WEST DISTRICT ──────────────────────────────────────────────────
      [-78, 8],
      [-78, -8],
      [-78, 20],
      [-78, 35],
      [-78, 50],
      [-86, 0],
      [-86, 15],
      [-86, 30],
      [-86, -15],

      // ── SCATTERED ORGANIC clusters ─────────────────────────────────────
      [28, -28],
      [-28, -28],
      [55, -20],
      [-55, -20],
      [55, -50],
      [-55, -50],
      [55, 10],
      [-55, 10],
      [45, 35],
      [-45, 35],
      [30, 50],
      [-30, 50],
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
      // ── World border thick grass ───────────────────────────────────────
      [-85, 0],
      [-85, 20],
      [-85, -20],
      [-85, 40],
      [-85, -40],
      [-85, 55],
      [-85, -55],
      [85, 0],
      [85, 20],
      [85, -20],
      [85, 40],
      [85, -40],
      [85, 55],
      [85, -55],
      [0, -83],
      [20, -83],
      [-20, -83],
      [40, -83],
      [-40, -83],
      [60, -83],
      [-60, -83],
      [0, 62],
      [20, 62],
      [-20, 62],
      [40, 62],
      [-40, 62],
      [60, 62],
      [-60, 62],
      // ── Between roads ─────────────────────────────────────────────────
      [22, -28],
      [-22, -28],
      [50, -28],
      [-50, -28],
      [70, -28],
      [-70, -28],
      [22, 12],
      [-22, 12],
      [22, -4],
      [-22, -4],
      [50, 12],
      [-50, 12],
      [50, -4],
      [-50, -4],
      // ── Education corridor ─────────────────────────────────────────────
      [5, -50],
      [-5, -50],
      [15, -50],
      [-15, -50],
      [5, -56],
      [-5, -56],
      [15, -56],
      [-15, -56],
      [32, -45],
      [-32, -45],
      [32, -55],
      [-32, -55],
      // ── South boulevard edges ──────────────────────────────────────────
      [22, 50],
      [-22, 50],
      [40, 50],
      [-40, 50],
      [60, 50],
      [-60, 50],
      // ── Mid-world organic ──────────────────────────────────────────────
      [40, -32],
      [-40, -32],
      [55, -6],
      [-55, -6],
      [55, 18],
      [-55, 18],
      [70, 12],
      [-70, 12],
      [40, 30],
      [-40, 30],
    ];

    patchPositions.forEach(([x, z]) => {
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const gx = x + (Math.random() - 0.5) * 5;
        const gz = z + (Math.random() - 0.5) * 5;
        const w = 0.12 + Math.random() * 0.14;
        const h = 0.35 + Math.random() * 0.55; // MAX 0.9 — not tall spikes
        const col = grassColors[Math.floor(Math.random() * grassColors.length)];
        const mat = new THREE.MeshLambertMaterial({ color: col });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.5), mat);
        blade.position.set(gx, h / 2, gz);
        blade.rotation.y = Math.random() * Math.PI;
        blade.rotation.z = (Math.random() - 0.5) * 0.28;
        scene.add(blade);
      }
    });
  }

  // ── 3D NAME LETTERS — "ADITYA SRIVASTAVA" on the ground like Bruno Simon ─
  function build3DName() {
    // Player spawns at z=40 — name placed just behind, visible immediately
    const nameZ = 54;

    function makeSprite(text, font, color, W, H) {
      const can = document.createElement("canvas");
      can.width = W;
      can.height = H;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, W / 2, H / 2);
      const tex = new THREE.CanvasTexture(can);
      return new THREE.SpriteMaterial({ map: tex, transparent: true });
    }

    // ADITYA — big
    const sp1 = new THREE.Sprite(
      makeSprite(
        "ADITYA",
        "bold 58px 'Barlow Condensed',sans-serif",
        "#fff8f0",
        300,
        88,
      ),
    );
    sp1.scale.set(17, 5.2, 1);
    sp1.position.set(0, 3.5, nameZ);
    scene.add(sp1);

    // SRIVASTAVA — medium gold
    const sp2 = new THREE.Sprite(
      makeSprite(
        "SRIVASTAVA",
        "bold 46px 'Barlow Condensed',sans-serif",
        "#ffd088",
        360,
        72,
      ),
    );
    sp2.scale.set(16, 3.2, 1);
    sp2.position.set(0, 1.9, nameZ + 0.5);
    scene.add(sp2);

    // Role tag
    const sp3 = new THREE.Sprite(
      makeSprite(
        "// BACKEND ARCHITECT  ·  4 YEARS  ·  NOIDA, INDIA",
        "bold 20px 'Share Tech Mono',monospace",
        "#00ddff",
        440,
        42,
      ),
    );
    sp3.scale.set(16, 1.55, 1);
    sp3.position.set(0, 0.9, nameZ + 1.0);
    scene.add(sp3);

    // Physical slab beneath the text
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xf5ddc8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 6), slabMat);
    slab.position.set(0, 0.12, nameZ + 0.5);
    scene.add(slab);

    // Glowing rings on the slab
    [2.2, 3.5].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.065, 4, 20),
        new THREE.MeshBasicMaterial({
          color: 0xddaaff,
          transparent: true,
          opacity: 0.55 - i * 0.15,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.35, nameZ + 2.2);
      ring.userData.isRing = true;
      ring.userData.rotSpeed = 0.35 + i * 0.22;
      scene.add(ring);
    });
  }

  // ── CAREER TIMELINE RAIL ──────────────────────────────────────────────────
  // Runs along the education corridor between z=-62 and z=-38
  // Positioned at x=0 connecting the two education temples
  function buildCareerTimeline() {
    // Timeline runs at z=-57 — BETWEEN z=-62 education boulevard and z=-38 upper road
    // This is a dedicated visual corridor between the two education temples
    const TZ = -57;
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x00ddff,
      transparent: true,
      opacity: 0.75,
    });
    const railGold = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.75,
    });

    // Main rail — two parallel glowing lines, 80 units wide
    [-0.4, 0.4].forEach((offset, ri) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(80, 0.07, 0.14),
        ri === 0 ? railMat : railGold,
      );
      rail.position.set(0, 0.22, TZ + offset);
      scene.add(rail);
    });

    // Milestones spread across the full rail width
    const milestones = [
      { year: "2015", label: "B.Sc Begins", x: -35, color: "#34d399" },
      { year: "2019", label: "B.Sc Completed", x: -20, color: "#34d399" },
      { year: "2021", label: "M.Sc CS", x: -6, color: "#a78bfa" },
      { year: "JAN 2022", label: "Trainee Engineer", x: 8, color: "#ffcc44" },
      { year: "SEP 2022", label: "Junior SE", x: 22, color: "#ff9950" },
      { year: "2024", label: "Backend Architect", x: 35, color: "#ff6b00" },
    ];

    milestones.forEach(({ year, label, x, color }) => {
      const gc = parseInt(color.slice(1), 16);

      // Glowing post
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 2.4, 0.2),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      post.position.set(x, 1.2, TZ);
      scene.add(post);

      // Floating diamond gem
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      gem.position.set(x, 2.8, TZ);
      gem.userData.isTimelineGem = true;
      gem.userData.baseY = 2.8;
      gem.userData.phase = x * 0.38;
      scene.add(gem);

      // Point light glow
      const pl = new THREE.PointLight(gc, 1.0, 6);
      pl.position.set(x, 2.6, TZ);
      scene.add(pl);

      // Floating canvas label
      const cw = 180,
        ch = 78;
      const can = document.createElement("canvas");
      can.width = cw;
      can.height = ch;
      const ctx = can.getContext("2d");
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = color;
      ctx.font = "bold 26px 'Barlow Condensed',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(year, cw / 2, 28);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "12px 'Share Tech Mono',monospace";
      ctx.fillText(label, cw / 2, 54);
      const tex = new THREE.CanvasTexture(can);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true }),
      );
      sp.scale.set(5.0, 2.15, 1);
      sp.position.set(x, 5.0, TZ);
      scene.add(sp);
    });
  }

  // ── CHECKPOINTS (Bruno Simon: diamond + beam + rings) ─────────────────────
  // ── P4: DIYA CHECKPOINT MARKERS ──────────────────────────────────────────
  // Replace cyberpunk diamonds with Hindu oil lamp diyas
  function buildCheckpoints() {
    window.CITY_DATA.buildings.forEach((b) => {
      if (!b.roadPos) return;
      const gc = pc(b.glowColor);
      const g = new THREE.Group();
      g.position.set(b.roadPos[0], 0, b.roadPos[1]);

      const stoneMat = new THREE.MeshMatcapMaterial({
        color: 0xddc99a,
        matcap: matcaps.stone,
      });
      const claymMat = new THREE.MeshMatcapMaterial({
        color: 0xcc7744,
        matcap: matcaps.warm,
      });
      const goldMat = new THREE.MeshMatcapMaterial({
        color: 0xffcc44,
        matcap: matcaps.gold,
      });

      // ── DIYA GROUP (3 diyas arranged in a triangle) ──────────────────
      const diyaPositions = [
        [0, 0],
        [-1.2, 1.2],
        [1.2, 1.2],
      ];
      diyaPositions.forEach(([dx, dz], di) => {
        const dg = new THREE.Group();
        dg.position.set(dx, 0, dz);

        // Clay diya bowl (torus segment = bowl shape)
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.18, 0.18, 10),
          claymMat,
        );
        bowl.position.y = 0.09;
        dg.add(bowl);

        // Oil surface (flat disc inside)
        const oil = new THREE.Mesh(
          new THREE.CircleGeometry(0.22, 10),
          new THREE.MeshBasicMaterial({ color: 0xffaa33 }),
        );
        oil.rotation.x = -Math.PI / 2;
        oil.position.y = 0.19;
        dg.add(oil);

        // Flame — two overlapping cones that flicker
        const flameCol = new THREE.Color(gc);
        const flameMat = new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.92,
        });
        const flameOuter = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.38, 5),
          flameMat.clone(),
        );
        flameOuter.position.y = 0.52;
        flameOuter.userData.isDiyaFlame = true;
        flameOuter.userData.phase = di * 0.9 + dx * 0.5;
        dg.add(flameOuter);

        const flameInner = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.22, 5),
          new THREE.MeshBasicMaterial({
            color: 0xffffaa,
            transparent: true,
            opacity: 0.95,
          }),
        );
        flameInner.position.y = 0.54;
        flameInner.userData.isDiyaFlame = true;
        flameInner.userData.phase = di * 0.9 + dx * 0.5 + 0.3;
        dg.add(flameInner);

        diyaFlames.push(flameOuter, flameInner);

        // Warm point light per diya
        const dLight = new THREE.PointLight(gc, 0, 8);
        dLight.position.y = 0.6;
        dLight.userData.isDiyaLight = true;
        dLight.userData.phase = di * 0.7;
        dg.add(dLight);
        // Cache world position at build time for fast distance check
        diyaLights.push({
          light: dLight,
          wx: b.roadPos[0] + dx,
          wz: b.roadPos[1] + dz,
          phase: di * 0.7,
        });

        // Small stone base
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.38, 0.42, 0.1, 8),
          stoneMat,
        );
        base.position.y = 0.05;
        dg.add(base);

        g.add(dg);
      });

      // ── RANGOLI GROUND PATTERN (decorative circle on ground) ─────────
      // Outer ring
      const rangoli = new THREE.Mesh(
        new THREE.TorusGeometry(2.8, 0.09, 4, 24),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.45,
        }),
      );
      rangoli.rotation.x = Math.PI / 2;
      rangoli.position.y = 0.04;
      rangoli.userData.cpRing = true;
      rangoli.userData.phase = 0;
      g.add(rangoli);

      // Inner petal ring (8 petals)
      for (let p = 0; p < 8; p++) {
        const ang = (p / 8) * Math.PI * 2;
        const petal = new THREE.Mesh(
          new THREE.CircleGeometry(0.32, 6),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
          }),
        );
        petal.rotation.x = -Math.PI / 2;
        petal.rotation.z = ang;
        petal.position.set(Math.cos(ang) * 1.8, 0.04, Math.sin(ang) * 1.8);
        g.add(petal);
      }

      // ── TALL INCENSE SMOKE BEAM (subtle, replaces the harsh beam) ────
      const beamH = b.height + 4;
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, beamH, 4),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.12,
        }),
      );
      beam.position.y = beamH / 2;
      g.add(beam);

      // Name sprite floating above
      const diamond = null; // no more diamond
      const pRing = rangoli;

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
    carX = Math.max(-95, Math.min(95, carX));
    carZ = Math.max(-88, Math.min(65, carZ));

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

    // Camera — only follow car when NOT in fly-in mode
    if (cameraFlyPhase === 0) {
      const camDist = 22,
        camH = 16;
      const tx = carX - sinA * camDist;
      const tz = carZ - cosA * camDist;
      camera.position.x += (tx - camera.position.x) * 0.08;
      camera.position.y += (camH - camera.position.y) * 0.05;
      camera.position.z += (tz - camera.position.z) * 0.08;
      camera.lookAt(carX + sinA * 4, 1.5, carZ + cosA * 4);
    }

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

    // ── P1: CAMERA FLY-IN ─────────────────────────────────────────────────
    // Camera slowly pushes forward toward the temple entrance before opening panel
    const b = proximityBuilding;
    const tx = b.pos[0],
      tz = b.pos[1];
    cameraFlyTarget = {
      bx: tx,
      bz: tz,
      startX: camera.position.x,
      startY: camera.position.y,
      startZ: camera.position.z,
      progress: 0,
      building: b,
    };
    cameraFlyPhase = 1; // start flying

    // Panel opens after fly-in completes (0.9s)
    setTimeout(() => {
      window.CityUI?.openBuilding(b);
      spawnConfetti(carX, carZ, pc(b.glowColor));
      cameraFlyPhase = 2;
    }, 900);
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
    updateDistrictAudio();

    // ── P1: CAMERA FLY-IN ────────────────────────────────────────────────────
    if (cameraFlyPhase === 1 && cameraFlyTarget) {
      cameraFlyTarget.progress = Math.min(1, cameraFlyTarget.progress + 0.022);
      const p = cameraFlyTarget.progress;
      const ease = p * p * (3 - 2 * p); // smoothstep
      const { startX, startY, startZ, bx, bz } = cameraFlyTarget;
      const targetX = bx - Math.sin(carAngle) * 8;
      const targetZ = bz - Math.cos(carAngle) * 8;
      const targetY = 10;
      camera.position.x = startX + (targetX - startX) * ease;
      camera.position.y = startY + (targetY - startY) * ease;
      camera.position.z = startZ + (targetZ - startZ) * ease;
      camera.lookAt(bx, 4, bz);
      if (p >= 1) cameraFlyPhase = 2;
    }

    // ── P5: BIRDS FLOCKING (circle over hero zone) ────────────────────────
    if (birdGroup) {
      birdGroup.children.forEach((bird) => {
        const r = bird.userData.orbitR;
        const h = bird.userData.orbitH;
        const sp = bird.userData.orbitSpeed;
        const ph = bird.userData.orbitPhase;
        const fp = bird.userData.flapPhase;
        bird.position.set(
          Math.cos(t * sp + ph) * r,
          h + Math.sin(t * 1.4 + fp) * 1.5,
          Math.sin(t * sp + ph) * r,
        );
        bird.rotation.y = -(t * sp + ph) - Math.PI / 2;
        // Wing flap
        bird.children.forEach((c) => {
          if (c.userData.isWing) {
            c.rotation.z =
              c.userData.side * (0.22 + Math.sin(t * 5.5 + fp) * 0.38);
          }
        });
      });
    }

    // ── P5+P7: DIYA FLAMES flicker + night glow ───────────────────────────
    diyaFlames.forEach((f) => {
      if (!f.material) return;
      const flicker =
        Math.sin(t * 8.5 + f.userData.phase) * 0.08 + Math.random() * 0.04;
      f.scale.set(1 + flicker, 1 + flicker * 0.5, 1 + flicker);
      f.rotation.y = Math.sin(t * 3.2 + f.userData.phase) * 0.18;
      f.material.opacity = 0.82 + flicker;
    });
    // ── P7: DIYA LIGHTS — fast cached array, no traverse ─────────────────────
    diyaLights.forEach((d) => {
      const dist = Math.hypot(carX - d.wx, carZ - d.wz);
      const flicker = 0.8 + Math.sin(t * 7.8 + d.phase) * 0.2;
      d.light.intensity = isNight
        ? Math.max(0, Math.min(1, (25 - dist) / 25)) * 2.4 * flicker
        : Math.max(0, Math.min(1, (14 - dist) / 14)) * 0.65 * flicker;
    });

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
      // Vijay Stambha chakra spins
      if (c.userData.isChakra) c.rotation.z = t * 0.45;
    });
    worldLabels.forEach((sprite) => {
      const b = sprite.userData.building;
      const rx = b.roadPos ? b.roadPos[0] : b.pos[0];
      const rz = b.roadPos ? b.roadPos[1] : b.pos[1];
      const dist = Math.hypot(carX - rx, carZ - rz);
      const target = dist < 28 && dist > 4 ? Math.min(1, (28 - dist) / 14) : 0;
      sprite.material.opacity += (target - sprite.material.opacity) * 0.08;
      sprite.position.y =
        sprite.userData.baseY + Math.sin(t * 1.3 + b.pos[0] * 0.4) * 0.18;
    });

    // ── P2: IN-WORLD INFO BOARDS fade ────────────────────────────────────────
    infoBoardSprites.forEach((sprite) => {
      const b = sprite.userData.building;
      const dist = Math.hypot(carX - b.pos[0], carZ - b.pos[1]);
      const target = dist < 22 && dist > 5 ? Math.min(1, (22 - dist) / 10) : 0;
      sprite.material.opacity += (target - sprite.material.opacity) * 0.07;
      sprite.position.y =
        sprite.userData.baseY + Math.sin(t * 0.9 + b.pos[0] * 0.3) * 0.12;
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
    initAudio,
    resetCamera() {
      cameraFlyPhase = 0;
      cameraFlyTarget = null;
    },
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
    get carX() {
      return carX;
    },
    get carZ() {
      return carZ;
    },
    get carAngle() {
      return carAngle;
    },
  };
})();
