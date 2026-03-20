// ── CITY ENGINE ────────────────────────────────────────────────────────────────
// Three.js 3D city: roads, buildings, car physics, camera, day/night

window.CityEngine = (function () {

  let scene, camera, renderer;
  let carGroup, carBody, headlightL, headlightR;
  let carVel = 0, carAngle = 0;
  let carX = 0, carZ = 8;
  let keys = {};
  let clock, animId;
  let isNight = true;
  let sunLight, ambLight, hemiLight;
  let buildingMeshes = []; // { mesh, building }
  let proximityBuilding = null;
  let windowMeshes = [];
  let smokeParticles = [];

  const CAR_ACCEL = 0.012;
  const CAR_BRAKE = 0.018;
  const CAR_FRICTION = 0.008;
  const CAR_TURN = 0.038;
  const CAR_MAX_SPEED = 0.38;
  const PROXIMITY_DIST = 10;

  // ── INIT ──────────────────────────────────────────────────────────────────
  function init(canvas) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060810);
    scene.fog = new THREE.FogExp2(0x060810, 0.012);

    camera = new THREE.PerspectiveCamera(52, canvas.clientWidth / canvas.clientHeight, 0.1, 400);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isNight ? 0.8 : 1.3;

    clock = new THREE.Clock();

    buildLighting();
    buildGround();
    buildRoads();
    buildAllBuildings();
    buildCar();
    buildTrees();
    buildStreetLamps();
    buildCenterpiece();
    buildAtmosphericParticles();

    setupControls();
    animate();

    window.addEventListener('resize', onResize);
  }

  // ── LIGHTING ──────────────────────────────────────────────────────────────
  function buildLighting() {
    // Hemisphere (sky/ground)
    hemiLight = new THREE.HemisphereLight(0x0a1428, 0x050810, isNight ? 0.3 : 0.8);
    scene.add(hemiLight);

    // Ambient
    ambLight = new THREE.AmbientLight(0x060812, isNight ? 0.4 : 1.0);
    scene.add(ambLight);

    // Directional sun
    sunLight = new THREE.DirectionalLight(isNight ? 0x0a1428 : 0xffeedd, isNight ? 0.1 : 1.5);
    sunLight.position.set(-30, 50, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 200;
    scene.add(sunLight);

    // Cool blue fill
    const fill = new THREE.DirectionalLight(0x0033aa, 0.3);
    fill.position.set(20, 20, -30);
    scene.add(fill);
  }

  // ── GROUND ────────────────────────────────────────────────────────────────
  function buildGround() {
    // Grass base
    const grassGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x0d2010 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);

    // Subtle grid pattern on grass
    const gridHelper = new THREE.GridHelper(200, 50, 0x0a1808, 0x0a1808);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
  }

  // ── ROADS ─────────────────────────────────────────────────────────────────
  function buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x151820 });
    const lineMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    function addRoad(x1, z1, x2, z2, width) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.sqrt(dx*dx + dz*dz);
      const angle = Math.atan2(dx, dz);
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(width, len),
        roadMat
      );
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -angle;
      road.position.set((x1+x2)/2, 0.02, (z1+z2)/2);
      road.receiveShadow = true;
      scene.add(road);

      // Center line
      const cline = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, len * 0.95),
        lineMat
      );
      cline.rotation.x = -Math.PI / 2;
      cline.rotation.z = -angle;
      cline.position.set((x1+x2)/2, 0.03, (z1+z2)/2);
      scene.add(cline);

      // Edge lines
      [-1, 1].forEach(side => {
        const eline = new THREE.Mesh(
          new THREE.PlaneGeometry(0.15, len),
          dashMat
        );
        eline.rotation.x = -Math.PI / 2;
        eline.rotation.z = -angle;
        const offset = width * 0.5 * side;
        eline.position.set(
          (x1+x2)/2 + Math.cos(angle) * offset,
          0.03,
          (z1+z2)/2 - Math.sin(angle) * offset
        );
        scene.add(eline);
      });
    }

    // Main roads
    addRoad(0, -55, 0, 55, 6);        // N-S main
    addRoad(-55, 0, 55, 0, 6);        // E-W main
    addRoad(0, -18, 0, -48, 5);       // Education district
    addRoad(10, 0, 40, 0, 5);         // Cloud district
    addRoad(-10, 0, -40, 0, 5);       // Foundation district
    addRoad(-5, -5, -5, -20, 4);      // Hero inner left
    addRoad(5, -5, 5, -20, 4);        // Hero inner right
    addRoad(28, -2, 28, 12, 4);       // Cloud vertical
    addRoad(-28, -2, -28, 12, 4);     // Foundation vertical

    // Roundabout road ring
    const ringGeo = new THREE.RingGeometry(8, 13, 48);
    const ring = new THREE.Mesh(ringGeo, roadMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    // Roundabout center (grass island)
    const island = new THREE.Mesh(
      new THREE.CircleGeometry(8, 48),
      new THREE.MeshLambertMaterial({ color: 0x0d2010 })
    );
    island.rotation.x = -Math.PI / 2;
    island.position.y = 0.03;
    scene.add(island);

    // Education roundabout
    const eRing = new THREE.Mesh(new THREE.RingGeometry(4, 7, 32), roadMat);
    eRing.rotation.x = -Math.PI / 2;
    eRing.position.set(0, 0.02, -32);
    scene.add(eRing);
    const eIsland = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshLambertMaterial({ color: 0x0d2010 }));
    eIsland.rotation.x = -Math.PI / 2;
    eIsland.position.set(0, 0.03, -32);
    scene.add(eIsland);
  }

  // ── BUILDINGS ─────────────────────────────────────────────────────────────
  function buildAllBuildings() {
    window.CITY_DATA.buildings.forEach(b => {
      buildBuilding(b);
    });
  }

  function buildBuilding(b) {
    const group = new THREE.Group();
    group.position.set(b.pos[0], 0, b.pos[1]);
    group.userData = { buildingId: b.id };

    const w = b.size[0], d = b.size[1], h = b.height;

    // Foundation slab
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6),
      new THREE.MeshLambertMaterial({ color: 0x0a0c10 })
    );
    slab.position.y = 0.15;
    slab.receiveShadow = true;
    group.add(slab);

    // Main body
    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const bodyMat = new THREE.MeshLambertMaterial({ color: b.color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = h / 2 + 0.3;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Roof
    let roofGeo;
    if (b.isHero) {
      // Pyramid roof for heroes
      roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.55, h * 0.3, 4);
    } else if (b.isEducation) {
      // Pointed tower
      roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.5, h * 0.4, 8);
    } else {
      // Flat roof with parapet
      roofGeo = new THREE.BoxGeometry(w, 0.4, d);
    }
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: b.roofColor }));
    roof.position.y = h + 0.3 + (b.isHero || b.isEducation ? h * 0.15 : 0.2);
    if (b.isHero || b.isEducation) roof.rotation.y = Math.PI / 4;
    group.add(roof);

    // Windows
    addWindowGrid(group, b, w, h, d);

    // Glow light (emulates building illumination)
    const glow = new THREE.PointLight(parseInt(b.glowColor.replace('#',''), 16), isNight ? 2.5 : 0.3, 12);
    glow.position.y = h * 0.6;
    group.add(glow);

    // Hero glow orb at top
    if (b.isHero) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: parseInt(b.glowColor.replace('#',''), 16) })
      );
      orb.position.y = h + 0.3 + h * 0.35;
      group.add(orb);

      const orbGlow = new THREE.PointLight(parseInt(b.glowColor.replace('#',''), 16), isNight ? 4.0 : 0.5, 18);
      orbGlow.position.y = h + 0.3 + h * 0.35;
      group.add(orbGlow);
    }

    // Hit box for raycasting
    const hitBox = new THREE.Mesh(
      new THREE.BoxGeometry(w + 4, h + 6, d + 4),
      new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })
    );
    hitBox.position.y = (h + 6) / 2;
    hitBox.userData = { buildingId: b.id };
    group.add(hitBox);

    buildingMeshes.push({ group, body, glow, building: b });
    scene.add(group);
  }

  function addWindowGrid(group, b, w, h, d) {
    const wcol = parseInt(b.windowColor.replace ? b.windowColor.replace('#','') : b.windowColor.toString(16).padStart(6,'0'), 16);
    const wMat = new THREE.MeshBasicMaterial({ color: wcol });

    const floors = Math.max(2, Math.floor(h / 2.2));
    const cols = Math.max(2, Math.floor(w / 1.4));

    for (let fl = 0; fl < floors; fl++) {
      for (let col = 0; col < cols; col++) {
        // Front windows
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(0.55, 0.75),
          wMat.clone()
        );
        win.position.set(
          -w/2 + (col + 0.7) * (w / cols),
          1.2 + fl * 2.2,
          d/2 + 0.01
        );
        win.material.opacity = Math.random() > 0.25 ? (isNight ? 0.9 : 0.3) : 0.05;
        win.material.transparent = true;
        group.add(win);
        windowMeshes.push({ mesh: win, flicker: Math.random() * 10, baseOp: win.material.opacity });

        // Side windows
        const winS = win.clone();
        winS.material = win.material.clone();
        winS.position.set(
          w/2 + 0.01,
          1.2 + fl * 2.2,
          -d/2 + (col + 0.7) * (d / cols)
        );
        winS.rotation.y = Math.PI / 2;
        group.add(winS);
        windowMeshes.push({ mesh: winS, flicker: Math.random() * 10, baseOp: win.material.opacity });
      }
    }
  }

  // ── CENTERPIECE ───────────────────────────────────────────────────────────
  function buildCenterpiece() {
    // Center island monument
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 4, 0.8, 8),
      new THREE.MeshLambertMaterial({ color: 0x1a1008 })
    );
    base.position.y = 0.4;
    scene.add(base);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.5, 3, 8),
      new THREE.MeshLambertMaterial({ color: 0x0a0c14 })
    );
    pedestal.position.y = 1.5;
    scene.add(pedestal);

    // "A.S" glowing sign (using point lights)
    const signLight = new THREE.PointLight(0x00c8ff, isNight ? 3.0 : 0.5, 15);
    signLight.position.y = 3;
    scene.add(signLight);

    // Decorative ring around pedestal
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(2.5, 0.15, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x00c8ff, transparent: true, opacity: 0.4 })
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.8;
    scene.add(ringMesh);
  }

  // ── CAR ───────────────────────────────────────────────────────────────────
  function buildCar() {
    carGroup = new THREE.Group();

    // Car body
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xcc2200 });
    carBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 2.4), bodyMat);
    carBody.position.y = 0.55;
    carBody.castShadow = true;
    carGroup.add(carBody);

    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.45, 1.3),
      new THREE.MeshLambertMaterial({ color: 0x991800 })
    );
    cabin.position.set(0, 1.0, -0.1);
    carGroup.add(cabin);

    // Windshield
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.4, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 })
    );
    windshield.position.set(0, 1.0, 0.57);
    carGroup.add(windshield);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const wheelPositions = [
      [-0.8, 0.3, 0.85], [0.8, 0.3, 0.85],
      [-0.8, 0.3, -0.85], [0.8, 0.3, -0.85]
    ];
    wheelPositions.forEach(p => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(...p);
      carGroup.add(wheel);
    });

    // Headlights
    headlightL = new THREE.PointLight(0xffffdd, isNight ? 3.0 : 0, 18);
    headlightL.position.set(-0.45, 0.6, 1.3);
    carGroup.add(headlightL);
    headlightR = new THREE.PointLight(0xffffdd, isNight ? 3.0 : 0, 18);
    headlightR.position.set(0.45, 0.6, 1.3);
    carGroup.add(headlightR);

    // Tailights
    const taillightL = new THREE.PointLight(0xff2200, isNight ? 1.5 : 0, 6);
    taillightL.position.set(-0.45, 0.6, -1.3);
    carGroup.add(taillightL);
    const taillightR = new THREE.PointLight(0xff2200, isNight ? 1.5 : 0, 6);
    taillightR.position.set(0.45, 0.6, -1.3);
    carGroup.add(taillightR);

    carGroup.position.set(carX, 0, carZ);
    scene.add(carGroup);
  }

  // ── TREES ─────────────────────────────────────────────────────────────────
  function buildTrees() {
    const treePositions = [
      [3, 3], [-3, 3], [3, -3], [-3, -3],
      [14, 8], [-14, 8], [14, -8], [-14, -8],
      [0, -25], [-5, -28], [5, -28],
      [22, -8], [34, -8], [22, 8],
      [-22, -8], [-34, -8], [-22, 8],
      [8, 16], [-8, 16], [0, 20],
    ];
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3d1e00 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x0d3d0a });
    const leafMatAlt = new THREE.MeshLambertMaterial({ color: 0x143d10 });

    treePositions.forEach(([x, z]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), trunkMat);
      trunk.position.set(x, 0.6, z);
      trunk.castShadow = true;
      scene.add(trunk);

      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(0.8 + Math.random() * 0.4, 8, 6),
        Math.random() > 0.5 ? leafMat : leafMatAlt
      );
      leaves.position.set(x, 1.8 + Math.random() * 0.4, z);
      leaves.castShadow = true;
      scene.add(leaves);
    });
  }

  // ── STREET LAMPS ──────────────────────────────────────────────────────────
  function buildStreetLamps() {
    const lampPositions = [
      [4, 0], [-4, 0], [0, 4], [0, -4],
      [14, 4], [-14, 4], [14, -4], [-14, -4],
      [4, -20], [-4, -20],
      [24, 4], [-24, 4],
    ];
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x333344 });
    lampPositions.forEach(([x, z]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), poleMat);
      pole.position.set(x, 2, z);
      pole.castShadow = true;
      scene.add(pole);

      const lampLight = new THREE.PointLight(0xffffaa, isNight ? 1.5 : 0, 10);
      lampLight.position.set(x, 4.2, z);
      scene.add(lampLight);

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffaa })
      );
      bulb.position.set(x, 4.1, z);
      scene.add(bulb);
    });
  }

  // ── ATMOSPHERIC PARTICLES ─────────────────────────────────────────────────
  function buildAtmosphericParticles() {
    const count = 600;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i*3] = (Math.random() - 0.5) * 100;
      pos[i*3+1] = Math.random() * 20;
      pos[i*3+2] = (Math.random() - 0.5) * 100;
      const t = Math.random();
      if (t < 0.5) { col[i*3]=0; col[i*3+1]=0.6; col[i*3+2]=1; }
      else { col[i*3]=1; col[i*3+1]=0.8; col[i*3+2]=0; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.5 }));
    scene.add(pts);
  }

  // ── CONTROLS ──────────────────────────────────────────────────────────────
  function setupControls() {
    window.addEventListener('keydown', e => { keys[e.code] = true; });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
  }

  // ── DAY/NIGHT ─────────────────────────────────────────────────────────────
  function toggleDayNight() {
    isNight = !isNight;
    sunLight.intensity = isNight ? 0.1 : 1.5;
    sunLight.color.set(isNight ? 0x0a1428 : 0xffeedd);
    ambLight.intensity = isNight ? 0.4 : 1.0;
    hemiLight.intensity = isNight ? 0.3 : 0.8;
    renderer.toneMappingExposure = isNight ? 0.8 : 1.3;
    scene.fog = new THREE.FogExp2(isNight ? 0x060810 : 0x8ab4d4, isNight ? 0.012 : 0.008);
    scene.background = new THREE.Color(isNight ? 0x060810 : 0x8ab4d4);

    if (headlightL) headlightL.intensity = isNight ? 3.0 : 0;
    if (headlightR) headlightR.intensity = isNight ? 3.0 : 0;

    buildingMeshes.forEach(({ group }) => {
      group.traverse(child => {
        if (child.isLight && child !== headlightL && child !== headlightR) {
          child.intensity = child.intensity > 0
            ? (isNight ? Math.abs(child.userData.nightInt || child.intensity) : child.userData.nightInt ? 0.2 : 0)
            : 0;
        }
      });
    });

    windowMeshes.forEach(w => {
      if (w.mesh.material) {
        w.mesh.material.opacity = isNight ? w.baseOp : w.baseOp * 0.15;
      }
    });
  }

  // ── CAR PHYSICS ───────────────────────────────────────────────────────────
  function updateCar(dt) {
    const fwd = keys['ArrowUp'] || keys['KeyW'];
    const bwd = keys['ArrowDown'] || keys['KeyS'];
    const lft = keys['ArrowLeft'] || keys['KeyA'];
    const rgt = keys['ArrowRight'] || keys['KeyD'];

    if (fwd) carVel = Math.min(carVel + CAR_ACCEL, CAR_MAX_SPEED);
    else if (bwd) carVel = Math.max(carVel - CAR_BRAKE, -CAR_MAX_SPEED * 0.5);
    else {
      if (carVel > 0) carVel = Math.max(0, carVel - CAR_FRICTION);
      else carVel = Math.min(0, carVel + CAR_FRICTION);
    }

    if (Math.abs(carVel) > 0.005) {
      const turnDir = carVel > 0 ? 1 : -1;
      if (lft) carAngle += CAR_TURN * Math.abs(carVel) / CAR_MAX_SPEED * turnDir;
      if (rgt) carAngle -= CAR_TURN * Math.abs(carVel) / CAR_MAX_SPEED * turnDir;
    }

    carX += Math.sin(carAngle) * carVel;
    carZ += Math.cos(carAngle) * carVel;

    // World bounds
    carX = Math.max(-55, Math.min(55, carX));
    carZ = Math.max(-55, Math.min(55, carZ));

    carGroup.position.set(carX, 0, carZ);
    carGroup.rotation.y = carAngle;

    // Camera follows
    const camDist = 22;
    const camHeight = 18;
    const camX = carX - Math.sin(carAngle) * 4;
    const camZ = carZ - Math.cos(carAngle) * 4;
    camera.position.x += (camX - Math.sin(carAngle) * camDist - camera.position.x) * 0.06;
    camera.position.y += (camHeight - camera.position.y) * 0.04;
    camera.position.z += (camZ - Math.cos(carAngle) * camDist - camera.position.z) * 0.06;
    camera.lookAt(carX, 1.5, carZ);

    // Speed HUD
    if (window.CityUI) window.CityUI.updateHUD(carVel, null);

    // Minimap
    if (window.CityUI) window.CityUI.updateMinimap(carX, carZ, -carAngle);

    // Proximity check
    checkProximity();
  }

  // ── PROXIMITY ─────────────────────────────────────────────────────────────
  function checkProximity() {
    let closest = null, closestDist = PROXIMITY_DIST;
    window.CITY_DATA.buildings.forEach(b => {
      const dx = carX - b.pos[0], dz = carZ - b.pos[1];
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist < closestDist) {
        closestDist = dist;
        closest = b;
      }
    });

    if (closest !== proximityBuilding) {
      proximityBuilding = closest;
      if (closest) {
        window.CityUI?.showNotification(closest);
        highlightBuilding(closest.id, true);
      } else {
        window.CityUI?.hideNotification();
        buildingMeshes.forEach(bm => highlightBuilding(bm.building.id, false));
      }
    }
  }

  function highlightBuilding(id, on) {
    buildingMeshes.forEach(bm => {
      if (bm.building.id === id) {
        bm.body.material.emissive = on
          ? new THREE.Color(parseInt(bm.building.glowColor.replace('#',''), 16)).multiplyScalar(0.15)
          : new THREE.Color(0x000000);
      }
    });
  }

  // Click / Enter to open building
  function enterNearestBuilding() {
    if (proximityBuilding && window.CityUI) {
      window.CityUI.openBuilding(proximityBuilding);
    }
  }

  // ── WINDOW FLICKER ────────────────────────────────────────────────────────
  function updateWindows(t) {
    if (!isNight) return;
    windowMeshes.forEach(w => {
      if (Math.random() < 0.002) {
        w.mesh.material.opacity = w.baseOp * (0.3 + Math.random() * 0.7);
      }
    });
  }

  // ── ANIMATE ───────────────────────────────────────────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    updateCar(dt);
    updateWindows(t);

    renderer.render(scene, camera);
  }

  // ── RESIZE ────────────────────────────────────────────────────────────────
  function onResize() {
    const canvas = renderer.domElement;
    const W = canvas.parentElement.clientWidth;
    const H = canvas.parentElement.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }

  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
  }

  return {
    init,
    destroy,
    enterNearestBuilding,
    toggleDayNight,
    get isNight() { return isNight; },
    get proximityBuilding() { return proximityBuilding; }
  };

})();
