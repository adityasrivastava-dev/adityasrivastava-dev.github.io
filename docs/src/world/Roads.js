// ── ROADS — 2.5x scaled road network with curves, water channels, plazas ─────
// Building positions from city-data stay exact. Roads CONNECT to them at scale.

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

  _buildSurface() {
    // Water plane (sea border)
    const s = this.scene;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400,1400),
      new THREE.MeshLambertMaterial({ color: 0x44aacc }));
    water.rotation.x = -Math.PI/2; water.position.y = -0.5; s.add(water);

    // Shore panels
    const shore = new THREE.MeshLambertMaterial({ color: 0x66bbdd, transparent:true, opacity:0.7 });
    [[-175,0,150,400],[175,0,150,400],[0,-175,400,150],[0,135,400,150]].forEach(([x,z,w,d]) => {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(w,d), shore);
      sm.rotation.x = -Math.PI/2; sm.position.set(x,-0.3,z); s.add(sm);
    });
  }

  _road(x1,z1,x2,z2, w=14) {
    const s = this.scene;
    const dx=x2-x1, dz=z2-z1;
    const len = Math.sqrt(dx*dx+dz*dz);
    const ang = Math.atan2(dx,dz);
    const mx=(x1+x2)/2, mz=(z1+z2)/2;

    // Wide sandstone border
    const sw = new THREE.Mesh(new THREE.BoxGeometry(w+7,0.22,len),
      new THREE.MeshLambertMaterial({ color: 0xcc7755 }));
    sw.rotation.y=ang; sw.position.set(mx,0.11,mz); s.add(sw);

    // Road surface
    const rd = new THREE.Mesh(new THREE.BoxGeometry(w,0.24,len),
      new THREE.MeshLambertMaterial({ color: 0xaa5533 }));
    rd.rotation.y=ang; rd.position.set(mx,0.12,mz); s.add(rd);

    // Center dashes
    const dashMat = new THREE.MeshLambertMaterial({ color: 0xffe066 });
    const segs = Math.floor(len/8);
    for (let seg=0; seg<segs; seg++) {
      const t = (seg+0.5)/segs;
      const dl = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.01,3.2), dashMat);
      dl.rotation.y=ang; dl.position.set(x1+dx*t,0.26,z1+dz*t); s.add(dl);
    }
  }

  _buildRoadNetwork() {
    const R = this._road.bind(this);
    const RW = 14;

    // ── SCALED BOULEVARDS (original x 2.5) ────────────────────────────────
    // Main E-W boulevard z=0
    R(-225, 0, 225, 0);
    // Hero zone avenue z=-35 (was -14)
    R(-225,-35, 225,-35);
    // South boulevard z=105 (was 42)
    R(-225,105, 225,105);
    // Education avenue z=-155 (was -62)
    R(-112,-155, 112,-155);

    // ── N-S ARTERIES ──────────────────────────────────────────────────────
    R(0,-200, 0,175);           // Central spine
    R(-112,-35,-112,105);       // West artery
    R( 112,-35, 112,105);       // East artery
    R(-145,-35,-145,105);       // Far west
    R( 145,-35, 145,105);       // Far east

    // ── DISTRICT CONNECTORS ───────────────────────────────────────────────
    R(-225,60, 225,60);         // Mid E-W connector
    R(-225,-95, 225,-95);       // Upper E-W connector

    // ── TEMPLE APPROACH ROADS (curved, leading directly to each temple) ──
    // Surya Dwara [45,-22] - approach from south road
    R(45,-35, 45,-22, 10);
    // Vishwakarma [28,35] - approach from south boulevard
    R(28,0, 28,35, 10);
    // Akasha Mandapa [55,-38] - approach from artery
    R(112,-38, 55,-38, 10);
    // Setu Nagara [55,8] - from east artery
    R(112,8, 55,8, 10);
    // Brahma Kund [-55,-22] - from west artery
    R(-112,-22, -55,-22, 10);
    // Lakshmi Prasad [-40,35] - from west
    R(-112,35, -40,35, 10);
    // Pura Stambha [0,55] - central access
    R(0,60, 0,55, 10);
    // Maya Sabha [-28,-38] - from upper connector
    R(-28,-95, -28,-38, 10);
    // Jyotish Vedha [0,-55] - from central spine
    R(0,-95, 0,-55, 10);
    // Vayu Rath [-55,8] - from west artery
    R(-112,8, -55,8, 10);
    // Saraswati Vihar [-22,-62] - from education avenue
    R(-22,-155, -22,-62, 10);
    // Gurukul Ashram [22,-62] - from education avenue
    R(22,-155, 22,-62, 10);
  }

  _buildRoundabouts() {
    const s = this.scene;
    const rMat = new THREE.MeshLambertMaterial({ color: 0xbb6644 });
    const gMat = new THREE.MeshLambertMaterial({ color: 0xc86a44 });

    // Central roundabout (scaled 2.5x radius)
    const r1 = new THREE.Mesh(new THREE.RingGeometry(26,42,24), rMat);
    r1.rotation.x = -Math.PI/2; r1.position.y = 0.13; s.add(r1);
    const i1 = new THREE.Mesh(new THREE.CylinderGeometry(26,26,0.32,18), gMat);
    i1.position.y = 0.16; s.add(i1);

    // Education roundabout
    const r2 = new THREE.Mesh(new THREE.RingGeometry(17,27,18), rMat);
    r2.rotation.x = -Math.PI/2; r2.position.set(0,0.13,-95); s.add(r2);
    const i2 = new THREE.Mesh(new THREE.CylinderGeometry(17,17,0.3,16), gMat);
    i2.position.set(0,0.15,-95); s.add(i2);

    // Hero zone roundabout
    const r3 = new THREE.Mesh(new THREE.RingGeometry(12,20,16), rMat);
    r3.rotation.x = -Math.PI/2; r3.position.set(0,0.13,-35); s.add(r3);
    const i3 = new THREE.Mesh(new THREE.CylinderGeometry(12,12,0.28,14), gMat);
    i3.position.set(0,0.15,-35); s.add(i3);
  }

  _buildWaterChannels() {
    const s = this.scene;
    const mat  = new THREE.MeshLambertMaterial({ color: 0x2288bb });
    const wall = new THREE.MeshLambertMaterial({ color: 0xcc9966 });

    // Channels alongside central spine (longer for 2.5x world)
    for (const side of [-1,1]) {
      const chan = new THREE.Mesh(new THREE.BoxGeometry(4,0.35,330), mat);
      chan.position.set(side*21, -0.05, -10); s.add(chan);
      for (const wo of [-0.6,0.6]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.5,330), wall);
        w.position.set(side*(21+wo*3), 0.25, -10); s.add(w);
      }
    }

    // Decorative kund pools near major temples
    const poolMat = new THREE.MeshLambertMaterial({ color: 0x3399cc });
    [
      [45,-22,6], [-55,-22,6], [55,8,5], [-55,8,5]  // near temples
    ].forEach(([x,z,r]) => {
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(r,r,0.3,12), poolMat);
      pool.position.set(x,0,z-r-8); s.add(pool);
    });
  }

  _buildPavementDetail() {
    const s = this.scene;
    const mat = new THREE.MeshLambertMaterial({ color: 0xddccbb });

    // Crosswalk stripes at major intersections (scaled positions)
    [[0,0],[0,55],[75,0],[-75,0],[0,-88]].forEach(([x,z]) => {
      for (let i=-3; i<=3; i++) {
        const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.01,6), mat);
        s1.position.set(x+i*1.8, 0.28, z+17); s.add(s1);
        const s2 = new THREE.Mesh(new THREE.BoxGeometry(6,0.01,0.7), mat);
        s2.position.set(x+17, 0.28, z+i*1.8); s.add(s2);
      }
    });
  }
}
