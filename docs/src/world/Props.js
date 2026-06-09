// Props.js — Indian bazaar street props: market stalls, wells, carts, diyas, statues, ghats

export default class Props {
  constructor(scene) {
    this.scene = scene;
    this._diyaFlames = [];
    this._diyaLights = [];
  }

  build(isNight) {
    this._isNight = isNight || false;
    this._buildMarketStalls();
    this._buildWells();
    this._buildCarts();
    this._buildDiyas();
    this._buildStatues();
    this._buildGhats();
  }

  update(now, isNight) {
    this._isNight = isNight;
    // Animate diya flame flicker
    this._diyaFlames.forEach((f) => {
      const ph = now * 6.2 + f.userData.diyaPhase;
      f.scale.setScalar(0.8 + Math.sin(ph) * 0.22);
      f.position.y = f.userData.baseY + Math.sin(ph * 1.4) * 0.015;
    });
    this._diyaLights.forEach((l, i) => {
      const ph = now * 8.5 + i * 1.3;
      const base = isNight ? 1.8 : 0.5;
      l.intensity = base * (0.82 + Math.sin(ph) * 0.12 + Math.sin(ph * 2.3) * 0.06);
    });
  }

  // ─── Market Stalls ────────────────────────────────────────────────────────

  _buildMarketStalls() {
    const positions = [
      [95, -35, 0],
      [110, -28, 0.4],
      [120, -42, -0.3],
      [55, 56, Math.PI],
      [35, 50, Math.PI],
      [25, 62, 0],
      [-75, 56, 0],
      [-55, 50, Math.PI],
      [15, 0, Math.PI / 2],
      [-15, 0, -Math.PI / 2],
      [30, 0, Math.PI / 2],
      [-30, 0, -Math.PI / 2],
      [60, 0, Math.PI / 2],
      [-60, 0, -Math.PI / 2],
      [40, 88, Math.PI],
      [-40, 88, 0],
    ];
    positions.forEach(([x, z, angle], idx) => {
      this._stall(x, z, angle, idx);
    });
  }

  _stall(x, z, angle, idx) {
    const toonMat = (color) =>
      new THREE.MeshToonMaterial({
        color,
        gradientMap: window._toonGrad || null,
      });

    const awningColors = [0xee4433, 0xffaa22, 0x44aa22, 0x2244cc, 0xcc44aa];
    const awningColor = awningColors[idx % awningColors.length];

    const group = new THREE.Group();

    // 4 thin pole legs
    const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
    const legMat = toonMat(0x7a5533);
    const legPositions = [
      [-0.9, 0, -0.6],
      [0.9, 0, -0.6],
      [-0.9, 0, 0.6],
      [0.9, 0, 0.6],
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, ly + 1.2, lz);
      group.add(leg);
    });

    // Awning — slightly slanted BoxGeometry
    const awningGeo = new THREE.BoxGeometry(2.2, 0.08, 1.5);
    const awningMat = toonMat(awningColor);
    const awning = new THREE.Mesh(awningGeo, awningMat);
    awning.position.set(0, 2.42, 0);
    awning.rotation.x = 0.12; // slight slant
    group.add(awning);

    // Valance strip hanging from front of awning
    const valanceGeo = new THREE.BoxGeometry(2.2, 0.25, 0.04);
    const valance = new THREE.Mesh(valanceGeo, awningMat);
    valance.position.set(0, 2.24, 0.75);
    group.add(valance);

    // Display table
    const tableTopGeo = new THREE.BoxGeometry(1.8, 0.1, 1.1);
    const tableMat = toonMat(0xb8843a);
    const tableTop = new THREE.Mesh(tableTopGeo, tableMat);
    tableTop.position.set(0, 0.9, 0);
    group.add(tableTop);

    // Table legs
    const tLegGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.85, 5);
    [
      [-0.8, 0, -0.45],
      [0.8, 0, -0.45],
      [-0.8, 0, 0.45],
      [0.8, 0, 0.45],
    ].forEach(([lx, ly, lz]) => {
      const tLeg = new THREE.Mesh(tLegGeo, tableMat);
      tLeg.position.set(lx, 0.425, lz);
      group.add(tLeg);
    });

    // 3-4 colorful goods boxes on table
    const boxColors = [0xff6644, 0xffdd44, 0x44ccff, 0xcc44ff, 0x44ff88];
    const numBoxes = 3 + (idx % 2);
    for (let b = 0; b < numBoxes; b++) {
      const bw = 0.28 + Math.random() * 0.18;
      const bh = 0.18 + Math.random() * 0.22;
      const bd = 0.22 + Math.random() * 0.14;
      const boxGeo = new THREE.BoxGeometry(bw, bh, bd);
      const boxMat = toonMat(boxColors[(idx + b) % boxColors.length]);
      const box = new THREE.Mesh(boxGeo, boxMat);
      const bxOff = -0.7 + b * (1.4 / (numBoxes - 1 || 1));
      box.position.set(bxOff, 0.95 + bh / 2, -0.05 + (b % 2) * 0.18);
      group.add(box);
    }

    group.position.set(x, 0, z);
    group.rotation.y = angle;
    this.scene.add(group);
    return group;
  }

  // ─── Wells ────────────────────────────────────────────────────────────────

  _buildWells() {
    const positions = [
      [80, 0],
      [-80, 0],
      [15, -35],
      [-15, -35],
      [50, 56],
      [-50, 56],
      [10, 88],
      [-10, 88],
      [-40, -61],
      [10, -95],
    ];
    positions.forEach(([x, z]) => {
      this._well(x, z);
    });
  }

  _well(x, z) {
    const toonMat = (color) =>
      new THREE.MeshToonMaterial({
        color,
        gradientMap: window._toonGrad || null,
      });

    const group = new THREE.Group();

    // Stone drum body
    const drumGeo = new THREE.CylinderGeometry(1.1, 1.2, 1.0, 12);
    const stoneMat = toonMat(0x9a8870);
    const drum = new THREE.Mesh(drumGeo, stoneMat);
    drum.position.set(0, 0.5, 0);
    group.add(drum);

    // Lip ring (torus)
    const lipGeo = new THREE.TorusGeometry(1.15, 0.08, 8, 20);
    const lipMat = toonMat(0x7a6850);
    const lip = new THREE.Mesh(lipGeo, lipMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.set(0, 1.02, 0);
    group.add(lip);

    // 2 vertical support poles
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6);
    const poleMat = toonMat(0x6a4820);
    [-0.9, 0.9].forEach((px) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(px, 1.9, 0);
      group.add(pole);
    });

    // Horizontal crossbeam
    const beamGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.0, 6);
    const beam = new THREE.Mesh(beamGeo, poleMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(0, 2.8, 0);
    group.add(beam);

    // Rope cylinder hanging from crossbeam
    const ropeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5);
    const ropeMat = toonMat(0xc8a060);
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.position.set(0, 2.3, 0);
    group.add(rope);

    // Small bucket
    const bucketGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.28, 8);
    const bucketMat = toonMat(0x5a3a10);
    const bucket = new THREE.Mesh(bucketGeo, bucketMat);
    bucket.position.set(0, 1.72, 0);
    group.add(bucket);

    group.position.set(x, 0, z);
    this.scene.add(group);
    return group;
  }

  // ─── Carts ────────────────────────────────────────────────────────────────

  _buildCarts() {
    const positions = [
      [40, 0, 0.3],
      [-40, 0, -0.2],
      [75, 0, 0.1],
      [-75, 0, -0.4],
      [100, -35, Math.PI],
      [-100, -35, 0],
      [40, -155, 0.2],
      [-40, -155, -0.1],
    ];
    positions.forEach(([x, z, angle]) => {
      this._cart(x, z, angle);
    });
  }

  _cart(x, z, angle) {
    const toonMat = (color) =>
      new THREE.MeshToonMaterial({
        color,
        gradientMap: window._toonGrad || null,
      });

    const woodColor = 0x8a5a20;
    const woodMat = toonMat(woodColor);
    const darkWoodMat = toonMat(0x5a3a10);

    const group = new THREE.Group();

    // Main cart body
    const bodyGeo = new THREE.BoxGeometry(2.2, 0.5, 1.2);
    const body = new THREE.Mesh(bodyGeo, woodMat);
    body.position.set(0, 0.95, 0);
    group.add(body);

    // Side boards (left and right)
    const sideBoardGeo = new THREE.BoxGeometry(2.2, 0.55, 0.08);
    [-0.64, 0.64].forEach((bz) => {
      const sb = new THREE.Mesh(sideBoardGeo, woodMat);
      sb.position.set(0, 1.3, bz);
      group.add(sb);
    });

    // Front board
    const frontBoardGeo = new THREE.BoxGeometry(0.08, 0.55, 1.2);
    const fb = new THREE.Mesh(frontBoardGeo, woodMat);
    fb.position.set(-1.14, 1.3, 0);
    group.add(fb);

    // 4 disc wheels (CylinderGeometry rotated)
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14);
    const wheelMat = toonMat(0x3a2a0a);
    const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8);
    const hubMat = toonMat(0x888880);
    const wheelPositions = [
      [-0.7, -0.62],
      [0.7, -0.62],
      [-0.7, 0.62],
      [0.7, 0.62],
    ];
    wheelPositions.forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.48, wz);
      group.add(wheel);
      // Hub cap
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, 0.48, wz);
      group.add(hub);
    });

    // Axle beams
    const axleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);
    [-0.7, 0.7].forEach((ax) => {
      const axle = new THREE.Mesh(axleGeo, darkWoodMat);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(ax, 0.48, 0);
      group.add(axle);
    });

    // Yoke pole extending from front
    const yokeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6);
    const yoke = new THREE.Mesh(yokeGeo, darkWoodMat);
    yoke.rotation.z = Math.PI / 2;
    yoke.position.set(-2.0, 0.72, 0);
    group.add(yoke);

    // 3 cargo bags (squashed spheres)
    const bagColors = [0xcc9944, 0xbb7733, 0xddaa55];
    [
      [-0.5, 1.32, 0],
      [0.2, 1.32, -0.2],
      [0.5, 1.38, 0.25],
    ].forEach(([bx, by, bz], i) => {
      const bagGeo = new THREE.SphereGeometry(0.28, 8, 6);
      const bagMat = toonMat(bagColors[i % bagColors.length]);
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.scale.set(1.0, 0.7, 1.0);
      bag.position.set(bx, by, bz);
      group.add(bag);
    });

    group.position.set(x, 0, z);
    group.rotation.y = angle;
    this.scene.add(group);
    return group;
  }

  // ─── Diyas ────────────────────────────────────────────────────────────────

  _buildDiyas() {
    const positions = [
      [68, -32],
      [-84, -32],
      [44, 50],
      [-68, 50],
      [3, 82],
      [-3, 82],
      [0, -93],
      [85, -68],
      [-48, -68],
      [-42, -108],
      [0, 0],
      [0, -35],
      [0, 56],
      [112, -12],
      [-112, -12],
    ];
    positions.forEach(([x, z]) => {
      this._diyaCluster(x, z, 6);
    });
  }

  _diyaCluster(x, z, count = 6) {
    const toonMat = (color) =>
      new THREE.MeshToonMaterial({
        color,
        gradientMap: window._toonGrad || null,
      });

    const group = new THREE.Group();
    const ringRadius = 0.5;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const dx = Math.cos(angle) * ringRadius;
      const dz = Math.sin(angle) * ringRadius;

      // Clay lamp body
      const lampGeo = new THREE.CylinderGeometry(0.16, 0.12, 0.08, 8);
      const lampMat = toonMat(0xcc7733);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(dx, 0.04, dz);
      group.add(lamp);

      // Flame sphere
      const flameGeo = new THREE.SphereGeometry(0.07, 6, 5);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9922 });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      const baseY = 0.12;
      flame.position.set(dx, baseY, dz);
      flame.userData.diyaPhase = (i / count) * Math.PI * 2 + Math.random() * 1.5;
      flame.userData.baseY = baseY;
      group.add(flame);
      this._diyaFlames.push(flame);
    }

    // Central point light
    const lightIntensity = this._isNight ? 1.8 : 0.5;
    const light = new THREE.PointLight(0xff8833, lightIntensity, 8);
    light.position.set(0, 0.3, 0);
    group.add(light);
    this._diyaLights.push(light);

    group.position.set(x, 0.02, z);
    this.scene.add(group);
    return group;
  }

  // ─── Statues ──────────────────────────────────────────────────────────────

  _buildStatues() {
    const positions = [
      [72, -28, 0],
      [-88, -28, 0],
      [0, 82, 0],
      [0, -95, 0],
      [-45, -68, Math.PI / 4],
      [88, 6, -Math.PI / 4],
      [-64, 62, Math.PI / 6],
      [45, 62, -Math.PI / 6],
      [131, -28, Math.PI / 2],
      [-131, -28, -Math.PI / 2],
      [35, -108, 0],
      [-35, -108, 0],
    ];
    positions.forEach(([x, z, angle]) => {
      this._statue(x, z, angle);
    });
  }

  _statue(x, z, angle) {
    const toonMat = (color) =>
      new THREE.MeshToonMaterial({
        color,
        gradientMap: window._toonGrad || null,
      });

    const stoneMat = toonMat(0x8a7055);
    const accentMat = toonMat(0x6a5035);

    const group = new THREE.Group();

    // 3-step pedestal (shrinking BoxGeometry)
    const stepData = [
      { w: 1.4, h: 0.2, d: 1.4, y: 0.1 },
      { w: 1.1, h: 0.2, d: 1.1, y: 0.3 },
      { w: 0.85, h: 0.2, d: 0.85, y: 0.5 },
    ];
    stepData.forEach(({ w, h, d, y }) => {
      const stepGeo = new THREE.BoxGeometry(w, h, d);
      const step = new THREE.Mesh(stepGeo, stoneMat);
      step.position.set(0, y, 0);
      group.add(step);
    });

    // Base ring (torus)
    const baseRingGeo = new THREE.TorusGeometry(0.38, 0.06, 6, 16);
    const baseRing = new THREE.Mesh(baseRingGeo, accentMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.set(0, 0.62, 0);
    group.add(baseRing);

    // Body column
    const bodyGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.2, 7);
    const body = new THREE.Mesh(bodyGeo, stoneMat);
    body.position.set(0, 1.22, 0);
    group.add(body);

    // Head sphere
    const headGeo = new THREE.SphereGeometry(0.22, 8, 7);
    const head = new THREE.Mesh(headGeo, stoneMat);
    head.position.set(0, 1.96, 0);
    group.add(head);

    // 4 crown spire cones
    const spireGeo = new THREE.ConeGeometry(0.055, 0.28, 5);
    const spirePositions = [
      [0, 0],
      [0.12, 0.12],
      [-0.12, 0.12],
      [0.12, -0.12],
      [-0.12, -0.12],
    ];
    spirePositions.slice(0, 4).forEach(([sx, sz]) => {
      const spire = new THREE.Mesh(spireGeo, accentMat);
      spire.position.set(sx, 2.28, sz);
      group.add(spire);
    });
    // Central taller spire
    const topSpireGeo = new THREE.ConeGeometry(0.07, 0.38, 5);
    const topSpire = new THREE.Mesh(topSpireGeo, accentMat);
    topSpire.position.set(0, 2.38, 0);
    group.add(topSpire);

    group.position.set(x, 0, z);
    group.rotation.y = angle;
    this.scene.add(group);
    return group;
  }

  // ─── Ghats ────────────────────────────────────────────────────────────────

  _buildGhats() {
    const positions = [
      [0, -16, 0],
      [35, -16, 0],
      [-35, -16, 0],
      [80, -10, 0],
      [-80, -10, 0],
    ];
    positions.forEach(([x, z, angle]) => {
      this._ghat(x, z, angle, 5);
    });
  }

  _ghat(x, z, angle, steps = 5) {
    const toonMat = (color) =>
      new THREE.MeshToonMaterial({
        color,
        gradientMap: window._toonGrad || null,
      });

    const stoneMat = toonMat(0xb09070);
    const group = new THREE.Group();

    for (let s = 0; s < steps; s++) {
      const stepGeo = new THREE.BoxGeometry(4, 0.28, 0.6);
      const step = new THREE.Mesh(stepGeo, stoneMat);
      // Steps go downward toward the river (positive z = toward river)
      step.position.set(0, -s * 0.28, s * 0.6);
      group.add(step);
    }

    group.position.set(x, 0.14, z);
    group.rotation.y = angle;
    this.scene.add(group);
    return group;
  }
}
