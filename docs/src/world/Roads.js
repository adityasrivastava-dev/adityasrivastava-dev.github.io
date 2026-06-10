// ── ROADS — expanded city layout, 4× building spread, wide boulevards ───────
// Building positions are scaled 4× from original to fill the world properly.
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
    R(-600, 0, 600, 0);           // Main east-west spine
    R(-600, -139, 600, -139);     // Hero zone avenue (surya, brahma, vaishya, vidya)
    R(-550, 224, 550, 224);       // North boulevard (vishwakarma, lakshmi)
    R(-550, -245, 550, -245);     // South-mid boulevard (akasha, maya, darpana)
    R(-550, -395, 550, -395);     // Education avenue (saraswati, gurukul)
    R(-400, 459, 400, 459);       // Far north boulevard (sutra-dhara)
    R(-550, 53, 550, 53);         // Mid connector (setu-nagara, vayu-rath)

    // ── N-S ARTERIES ──────────────────────────────────────────────────────────
    R(0, -430, 0, 480);           // Central spine — passes pura-stambha, jyotish, sutra
    R(-448, -395, -448, 459);     // West artery
    R(448, -395, 448, 459);       // East artery
    R(-550, -395, -550, 459);     // Far west artery
    R(550, -395, 550, 459);       // Far east artery

    // ── APPROACH SPURS — road → building entrance ─────────────────────────────
    // Buildings are set back ~50 units from road into city blocks.
    // Each spur: artery-to-road-intersection + road-to-building-entrance.

    // surya-dwara [288,-192]: hero avenue → south into block
    R(288, -139, 288, -192, 12);

    // vishwakarma [181,172]: north blvd → south into block
    R(181, 224, 181, 172, 12);

    // akasha-mandapa [352,-298]: east artery → road then south
    R(448, -245, 352, -245, 14);
    R(352, -245, 352, -298, 12);

    // setu-nagara [352,110]: east artery → road then north
    R(448, 53, 352, 53, 14);
    R(352, 53, 352, 110, 12);

    // brahma-kund [-352,-192]: hero avenue → south into block
    R(-352, -139, -352, -192, 12);

    // lakshmi-prasad [-256,172]: north blvd → south into block
    R(-256, 224, -256, 172, 12);

    // pura-stambha [72,352]: central spine north, then east to building
    R(0, 288, 0, 352, 14);
    R(0, 352, 72, 352, 12);

    // maya-sabha [-181,-298]: south-mid blvd → south into block
    R(-181, -245, -181, -298, 12);

    // jyotish-vedha [72,-352]: central spine south, then east to building
    R(0, -288, 0, -352, 14);
    R(0, -352, 72, -352, 12);

    // vayu-rath [-352,110]: west artery → road then north
    R(-448, 53, -352, 53, 14);
    R(-352, 53, -352, 110, 12);

    // saraswati-vihar [139,-340]: education avenue → north into block
    R(139, -395, 139, -340, 12);

    // gurukul-ashram [-139,-340]: education avenue → north into block
    R(-139, -395, -139, -340, 12);

    // vaishya-griha [523,-192]: far east artery → road then south
    R(550, -139, 523, -139, 14);
    R(523, -139, 523, -192, 12);

    // agni-vedha [523,110]: far east artery → road then north
    R(550, 53, 523, 53, 14);
    R(523, 53, 523, 110, 12);

    // darpana-shala [181,-309]: south-mid blvd → south into block
    R(181, -245, 181, -309, 14);

    // vidya-ashram [-523,-192]: far west artery → road then south
    R(-550, -139, -523, -139, 14);
    R(-523, -139, -523, -192, 12);

    // sutra-dhara [0,416]: far north blvd → south to building
    R(0, 459, 0, 416, 12);
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

    addRoundabout(0, 0, 70, 98, 28);       // Central landmark roundabout
    addRoundabout(0, -139, 35, 55, 16);    // Hero zone junction
    addRoundabout(0, -395, 50, 75, 18);    // Education avenue junction
    addRoundabout(0, 224, 30, 45, 14);     // North boulevard junction
    addRoundabout(0, -245, 30, 45, 14);    // South-mid junction
  }

  // ── WATER CHANNELS ─────────────────────────────────────────────────────────
  _buildWaterChannels() {
    const s = this.scene;
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a5a7a });
    const wall = new THREE.MeshLambertMaterial({ color: 0x6a5040 });

    // Channels alongside central spine — extended for bigger world
    for (const side of [-1, 1]) {
      const chan = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.35, 1120),
        mat,
      );
      chan.position.set(side * 24, -0.05, -40);
      s.add(chan);
      for (const wo of [-0.6, 0.6]) {
        const w = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.55, 1120),
          wall,
        );
        w.position.set(side * (24 + wo * 3.5), 0.27, -40);
        s.add(w);
      }
    }

    // Decorative pools near prominent temples
    const poolMat = new THREE.MeshLambertMaterial({ color: 0x2277aa });
    [
      [288, -139, 7],
      [-352, -139, 6],
      [352, 53, 5],
      [-352, 53, 5],
      [0, 352, 6],
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
      [0, -139],
      [0, 224],
      [0, -245],
      [0, -395],
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
