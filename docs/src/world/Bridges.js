// Bridges.js — Stone arch bridges where roads cross the rivers
// Main river (E-W) × N-S arteries → 5 NS bridges
// Tributary (N-S) × E-W boulevards → 2 EW bridges
//
// Each bridge: stone deck + 3 half-torus arches + abutment blocks + balustrade pillars

export default class Bridges {
  constructor(scene) {
    this.scene = scene;
  }

  build() {
    // Must be called after Objects._initToonGrad() sets window._toonGrad
    const tg = window._toonGrad;
    if (!tg) return;

    // ── MAIN RIVER CROSSINGS (N-S roads over E-W river) ────────────────────────
    // Road runs N-S (Z axis), river runs E-W (X axis), arch spans Z
    // Positions estimated from CatmullRom path in River.js
    this._bridgeNS(0,    -12, 22); // central N-S spine
    this._bridgeNS(112,  -5,  22); // east artery
    this._bridgeNS(-112, -9,  22); // west artery
    this._bridgeNS(145,  -11, 22); // far east artery
    this._bridgeNS(-145, -5,  22); // far west artery

    // ── TRIBUTARY CROSSINGS (E-W roads over N-S tributary) ─────────────────────
    // Road runs E-W (X axis), tributary runs N-S (Z axis), arch spans X
    // Positions estimated from tributary CatmullRom path
    this._bridgeEW(-33, 0,  13); // main E-W boulevard (z=0)
    this._bridgeEW(-19, 56, 13); // mid boulevard (z=56)
  }

  // ── NORTH-SOUTH BRIDGE ───────────────────────────────────────────────────────
  // Road at x=roadX, crossing E-W river at z=riverZ
  // Bridge deck runs N-S (Z direction), arches visible from E or W
  _bridgeNS(roadX, riverZ, riverWidth) {
    const tg = window._toonGrad;
    const RW   = 20;              // road width (X span)
    const len  = riverWidth + 10; // deck length (Z span) = river + bank overhang
    const deckY = 0.38;
    const s = this.scene;

    const stoneMat = new THREE.MeshToonMaterial({ color: 0xc4a068, gradientMap: tg });
    const darkMat  = new THREE.MeshToonMaterial({ color: 0x8a5e38, gradientMap: tg });
    const archMat  = new THREE.MeshToonMaterial({ color: 0xb89060, gradientMap: tg });

    // ── DECK ─────────────────────────────────────────────────────────────────
    const deck = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.55, len), stoneMat);
    deck.position.set(roadX, deckY, riverZ);
    s.add(deck);

    // Road surface texture: two amber kerb strips on long edges
    for (const side of [-1, 1]) {
      const kerb = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.08, len),
        new THREE.MeshLambertMaterial({ color: 0xddaa55 }),
      );
      kerb.position.set(roadX + side * (RW / 2 - 0.25), deckY + 0.3, riverZ);
      s.add(kerb);
    }

    // ── STONE ARCHES — 3 half-tori spanning Z, visible from E/W ─────────────
    // radius R=14 → crown at y = deckY-0.2 (just below deck), center at y = deckY-0.2-R
    // rotation.y = PI/2 maps default XY-plane arc to ZY-plane (spans Z, opens toward X)
    const R    = 14;
    const archY = deckY - 0.18 - R;
    // 3 arches spread across road width in X
    [-7, 0, 7].forEach((ox) => {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(R, 0.65, 8, 16, Math.PI),
        archMat,
      );
      arch.rotation.y = Math.PI / 2;
      arch.position.set(roadX + ox, archY, riverZ);
      s.add(arch);
    });

    // ── ABUTMENTS — stone piers where arches meet the banks ──────────────────
    for (const side of [-1, 1]) {
      const az = riverZ + side * (len / 2 - 1.2);
      [-8, 0, 8].forEach((ox) => {
        const abut = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 2.0), darkMat);
        abut.position.set(roadX + ox, -0.1, az);
        s.add(abut);
      });
    }

    // ── BALUSTRADE — stone pillars + cap rail on E and W edges ───────────────
    const nPill = 8;
    for (const side of [-1, 1]) {
      const px = roadX + side * (RW / 2 - 0.45);
      for (let i = 0; i <= nPill; i++) {
        const t = i / nPill;
        const pz = riverZ - len / 2 + t * len;
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.42), stoneMat);
        pillar.position.set(px, deckY + 0.9, pz);
        s.add(pillar);
      }
      // Cap rail on top of pillars
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, len + 1.0), darkMat);
      rail.position.set(px, deckY + 1.68, riverZ);
      s.add(rail);
    }
  }

  // ── EAST-WEST BRIDGE ─────────────────────────────────────────────────────────
  // Road at z=roadZ, crossing N-S tributary at x=tribX
  // Bridge deck runs E-W (X direction), arches visible from N or S
  _bridgeEW(tribX, roadZ, tribWidth) {
    const tg = window._toonGrad;
    const RW  = 14;              // approach road width (Z span)
    const len = tribWidth + 8;   // deck length (X span)
    const deckY = 0.38;
    const s = this.scene;

    const stoneMat = new THREE.MeshToonMaterial({ color: 0xc4a068, gradientMap: tg });
    const darkMat  = new THREE.MeshToonMaterial({ color: 0x8a5e38, gradientMap: tg });
    const archMat  = new THREE.MeshToonMaterial({ color: 0xb89060, gradientMap: tg });

    // ── DECK ─────────────────────────────────────────────────────────────────
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, RW), stoneMat);
    deck.position.set(tribX, deckY, roadZ);
    s.add(deck);

    // ── ARCHES — 2 half-tori spanning X, visible from N/S ──────────────────
    // Default TorusGeometry is in XY plane — no rotation needed (opens toward Z)
    const R    = 8;
    const archY = deckY - 0.18 - R;
    [-4, 4].forEach((oz) => {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(R, 0.55, 8, 12, Math.PI),
        archMat,
      );
      // No rotation: default arc is in XY plane, spans X, opening faces Z (N/S) ✓
      arch.position.set(tribX, archY, roadZ + oz);
      s.add(arch);
    });

    // ── ABUTMENTS ────────────────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      const ax = tribX + side * (len / 2 - 1.0);
      [-4, 4].forEach((oz) => {
        const abut = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.8), darkMat);
        abut.position.set(ax, -0.1, roadZ + oz);
        s.add(abut);
      });
    }

    // ── BALUSTRADE — pillars + cap rail on N and S edges ─────────────────────
    const nPill = 6;
    for (const side of [-1, 1]) {
      const pz = roadZ + side * (RW / 2 - 0.4);
      for (let i = 0; i <= nPill; i++) {
        const t = i / nPill;
        const px = tribX - len / 2 + t * len;
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.42), stoneMat);
        pillar.position.set(px, deckY + 0.9, pz);
        s.add(pillar);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 1.0, 0.2, 0.54), darkMat);
      rail.position.set(tribX, deckY + 1.68, pz);
      s.add(rail);
    }
  }
}
