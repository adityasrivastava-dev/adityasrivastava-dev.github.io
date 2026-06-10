// ── ROADS — expanded city layout, 1.6× building spread, wide boulevards ───────
// Building positions are scaled ~1.6× from original to fill the world properly.
// Road palette: dark asphalt + warm sandstone borders, like aged stone city streets.

export default class Roads {
  constructor(scene) {
    this.scene = scene;
  }

  build() {
    this._buildSurface();
    this._buildRoadNetwork();
    this._buildRoundabouts();
    this._buildWaterChannels();
    this._buildPavementDetail();
  }

  // ── SURFACE — Roads only adds road geometry; World._buildGround() handles terrain
  _buildSurface() {
    // Intentionally empty — World._buildGround() provides the base ground + water.
    // Roads._buildRoadNetwork() lays the road surfaces on top of that.
  }

  // ── ROAD PRIMITIVE ─────────────────────────────────────────────────────────
  // Dark warm asphalt with sandstone kerb and amber centre-line dashes
  _road(x1, z1, x2, z2, w = 20) {
    const s = this.scene;
    const dx = x2 - x1,
      dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const ang = Math.atan2(dx, dz);
    const mx = (x1 + x2) / 2,
      mz = (z1 + z2) / 2;

    // Sandstone kerb
    const kerb = new THREE.Mesh(
      new THREE.BoxGeometry(w + 6, 0.22, len),
      new THREE.MeshLambertMaterial({ color: 0x9a8060 }),
    );
    kerb.rotation.y = ang;
    kerb.position.set(mx, 0.11, mz);
    s.add(kerb);

    // Dark stone road — clearly distinct from dusty ground
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.24, len),
      new THREE.MeshLambertMaterial({ color: 0x2e1e10 }),
    );
    road.rotation.y = ang;
    road.position.set(mx, 0.12, mz);
    s.add(road);

    // Amber centre-line dashes
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xffcc33 });
    const segs = Math.floor(len / 10);
    for (let seg = 0; seg < segs; seg++) {
      const t = (seg + 0.5) / segs;
      const dl = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.01, 4),
        dashMat,
      );
      dl.rotation.y = ang;
      dl.position.set(x1 + dx * t, 0.27, z1 + dz * t);
      s.add(dl);
    }
  }

  // ── ROAD NETWORK ───────────────────────────────────────────────────────────
  _buildRoadNetwork() {
    const R = this._road.bind(this);

    // ── E-W BOULEVARDS ────────────────────────────────────────────────────────
    R(-260, 0, 260, 0);           // Main east-west spine
    R(-260, -52, 260, -52);       // Hero zone avenue (surya, brahma, vaishya, vidya)
    R(-220, 84, 220, 84);         // North boulevard (vishwakarma, lakshmi)
    R(-220, -92, 220, -92);       // South-mid boulevard (akasha, maya, darpana)
    R(-260, -148, 260, -148);     // Education avenue (saraswati, gurukul)
    R(-220, 172, 220, 172);       // Far north boulevard (sutra-dhara)
    R(-220, 20, 220, 20);         // Mid connector (setu-nagara, vayu-rath)

    // ── N-S ARTERIES ──────────────────────────────────────────────────────────
    R(0, -210, 0, 180);           // Central spine — passes pura-stambha, jyotish, sutra
    R(-168, -148, -168, 172);     // West artery
    R(168, -148, 168, 172);       // East artery
    R(-220, -148, -220, 172);     // Far west artery
    R(220, -148, 220, 172);       // Far east artery

    // ── APPROACH ROADS — one per temple ───────────────────────────────────────
    // surya-dwara [108,-52]: spur from main spine down to hero zone
    R(108, 0, 108, -52, 14);

    // vishwakarma [68,84]: from main E-W north
    R(68, 0, 68, 84, 14);

    // akasha-mandapa [132,-92]: W from east artery
    R(168, -92, 132, -92, 14);

    // setu-nagara [132,20]: W from east artery
    R(168, 20, 132, 20, 14);

    // brahma-kund [-132,-52]: spurs from main spine
    R(-108, 0, -108, -52, 14);
    R(-132, 0, -132, -52, 14);

    // lakshmi-prasad [-96,84]: E from west artery
    R(-168, 84, -96, 84, 14);

    // pura-stambha [0,132]: ON central spine — no spur needed

    // maya-sabha [-68,-92]: S from hero zone
    R(-68, -52, -68, -92, 14);

    // jyotish-vedha [0,-132]: ON central spine — no spur needed

    // vayu-rath [-132,20]: E from west artery
    R(-168, 20, -132, 20, 14);

    // saraswati-vihar [52,-148]: ON education avenue — no spur needed
    // gurukul-ashram [-52,-148]: ON education avenue — no spur needed

    // vaishya-griha [196,-52]: W spur from far east artery
    R(220, -52, 196, -52, 14);

    // agni-vedha [196,20]: W spur from far east artery
    R(220, 20, 196, 20, 14);

    // darpana-shala [68,-116]: S from south-mid boulevard
    R(68, -92, 68, -116, 14);

    // vidya-ashram [-196,-52]: E spur from far west artery
    R(-220, -52, -196, -52, 14);

    // sutra-dhara [0,172]: ON far north boulevard — no spur needed
  }

  // ── ROUNDABOUTS ───────────────────────────────────────────────────────────
  _buildRoundabouts() {
    const s = this.scene;
    const rMat = new THREE.MeshLambertMaterial({ color: 0x5a4a38 });
    const gMat = new THREE.MeshLambertMaterial({ color: 0x3d4c2e });

    const addRoundabout = (x, z, rInner, rOuter, segs = 20) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(rInner, rOuter, segs),
        rMat,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.13, z);
      s.add(ring);
      const fill = new THREE.Mesh(
        new THREE.CylinderGeometry(rInner, rInner, 0.3, segs),
        gMat,
      );
      fill.position.set(x, 0.15, z);
      s.add(fill);
    };

    addRoundabout(0, 0, 30, 46, 24);      // Central — landmark roundabout
    addRoundabout(0, -52, 14, 22, 16);    // Hero zone junction
    addRoundabout(0, -148, 20, 30, 18);   // Education avenue junction
    addRoundabout(0, 84, 12, 18, 14);     // North boulevard junction
    addRoundabout(0, -92, 12, 18, 14);    // South-mid junction
  }

  // ── WATER CHANNELS ─────────────────────────────────────────────────────────
  _buildWaterChannels() {
    const s = this.scene;
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a5a7a });
    const wall = new THREE.MeshLambertMaterial({ color: 0x6a5040 });

    // Channels alongside central spine — extended for bigger world
    for (const side of [-1, 1]) {
      const chan = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.35, 420),
        mat,
      );
      chan.position.set(side * 24, -0.05, -15);
      s.add(chan);
      for (const wo of [-0.6, 0.6]) {
        const w = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.55, 420),
          wall,
        );
        w.position.set(side * (24 + wo * 3.5), 0.27, -15);
        s.add(w);
      }
    }

    // Decorative pools near prominent temples (positions ×1.5)
    const poolMat = new THREE.MeshLambertMaterial({ color: 0x2277aa });
    [
      [108, -52, 7],
      [-132, -52, 6],
      [132, 20, 5],
      [-132, 20, 5],
      [0, 132, 6],
    ].forEach(([x, z, r]) => {
      const pool = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.32, 12),
        poolMat,
      );
      pool.position.set(x, 0, z - r - 10);
      s.add(pool);
    });
  }

  // ── PAVEMENT DETAILS ───────────────────────────────────────────────────────
  _buildPavementDetail() {
    const s = this.scene;
    const crossMat = new THREE.MeshLambertMaterial({ color: 0x9a8870 });

    // Crosswalk stripes at key junctions (×1.5 positions)
    [
      [0, 0],
      [0, -52],
      [0, 84],
      [0, -92],
      [0, -148],
    ].forEach(([x, z]) => {
      for (let i = -3; i <= 3; i++) {
        const s1 = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.01, 7),
          crossMat,
        );
        s1.position.set(x + i * 2.2, 0.28, z + 22);
        s.add(s1);
        const s2 = new THREE.Mesh(
          new THREE.BoxGeometry(7, 0.01, 0.7),
          crossMat,
        );
        s2.position.set(x + 22, 0.28, z + i * 2.2);
        s.add(s2);
      }
    });
  }
}
