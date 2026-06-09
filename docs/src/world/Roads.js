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
      new THREE.MeshLambertMaterial({ color: 0x7a5535 }),
    );
    kerb.rotation.y = ang;
    kerb.position.set(mx, 0.11, mz);
    s.add(kerb);

    // Warm stone road surface
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.24, len),
      new THREE.MeshLambertMaterial({ color: 0x3d2510 }),
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
    R(-225, 0, 225, 0);           // Main east-west spine
    R(-225, -35, 225, -35);       // Hero zone avenue (surya, brahma, vaishya, vidya)
    R(-200, 56, 200, 56);         // Mid boulevard (vishwakarma, lakshmi district)
    R(-200, -61, 200, -61);       // South-mid boulevard (akasha, maya, darpana)
    R(-225, -95, 225, -95);       // Upper connector
    R(-180, -155, 180, -155);     // Education avenue
    R(-200, 105, 200, 105);       // South boulevard

    // ── N-S ARTERIES ──────────────────────────────────────────────────────────
    R(0, -200, 0, 175);           // Central spine — passes pura-stambha, jyotish, sutra
    R(-112, -95, -112, 105);      // West artery (extended to z=-95)
    R(112, -95, 112, 105);        // East artery (extended to z=-95)
    R(-145, -95, -145, 105);      // Far west artery (extended)
    R(145, -95, 145, 105);        // Far east artery (extended)

    // ── APPROACH ROADS — one per temple ───────────────────────────────────────
    // surya-dwara [72,-35]: ON hero zone E-W → accessible directly
    // Short N spur so car can approach from central area
    R(72, 0, 72, -35, 14);

    // vishwakarma [45,56]: from main E-W northward
    R(45, 0, 45, 56, 14);

    // akasha-mandapa [88,-61]: W from east artery at z=-61
    R(112, -61, 88, -61, 14);

    // setu-nagara [88,13]: W from east artery
    R(112, 13, 88, 13, 14);

    // brahma-kund [-88,-35]: ON hero zone E-W — accessible directly
    // Short N spur from main E-W
    R(-72, 0, -72, -35, 14);
    R(-88, 0, -88, -35, 14);

    // lakshmi-prasad [-64,56]: E from west artery along z=56
    R(-112, 56, -64, 56, 14);

    // pura-stambha [0,88]: ON central spine — no spur needed
    // maya-sabha [-45,-61]: S from hero zone
    R(-45, -35, -45, -61, 14);

    // jyotish-vedha [0,-88]: ON central spine — no spur needed
    // vayu-rath [-88,13]: E from west artery
    R(-112, 13, -88, 13, 14);

    // saraswati-vihar [-35,-99]: N from education avenue
    R(-35, -155, -35, -99, 14);

    // gurukul-ashram [35,-99]: N from education avenue
    R(35, -155, 35, -99, 14);

    // vaishya-griha [131,-35]: W spur from far east artery
    R(145, -35, 131, -35, 14);

    // agni-vedha [131,13]: W spur from far east artery
    R(145, 13, 131, 13, 14);

    // darpana-shala [45,-77]: S from akasha approach
    R(45, -61, 45, -77, 14);

    // vidya-ashram [-131,-35]: E spur from far west artery
    R(-145, -35, -131, -35, 14);

    // sutra-dhara [0,115]: N from south boulevard
    R(0, 105, 0, 115, 14);
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

    addRoundabout(0, 0, 30, 46, 24);    // Central — wider for bigger city
    addRoundabout(0, -35, 14, 22, 16);   // Hero zone
    addRoundabout(0, -95, 20, 30, 18);   // Education junction
    addRoundabout(0, 56, 12, 18, 14);    // Mid boulevard junction
    addRoundabout(0, -61, 12, 18, 14);   // South-mid junction
  }

  // ── WATER CHANNELS ─────────────────────────────────────────────────────────
  _buildWaterChannels() {
    const s = this.scene;
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a5a7a });
    const wall = new THREE.MeshLambertMaterial({ color: 0x6a5040 });

    // Channels alongside central spine (wider world)
    for (const side of [-1, 1]) {
      const chan = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.35, 350),
        mat,
      );
      chan.position.set(side * 24, -0.05, -10);
      s.add(chan);
      for (const wo of [-0.6, 0.6]) {
        const w = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.55, 350),
          wall,
        );
        w.position.set(side * (24 + wo * 3.5), 0.27, -10);
        s.add(w);
      }
    }

    // Decorative pools near prominent temples
    const poolMat = new THREE.MeshLambertMaterial({ color: 0x2277aa });
    [
      [72, -35, 7],
      [-88, -35, 6],
      [88, 13, 5],
      [-88, 13, 5],
      [0, 88, 6],
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

    // Crosswalk stripes at key junctions
    [
      [0, 0],
      [0, -35],
      [0, 56],
      [0, -61],
      [0, -95],
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
