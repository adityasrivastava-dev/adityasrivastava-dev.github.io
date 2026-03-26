// ── OBJECTS — temples (exact positions from city-data), trees, lamps, details ─
// Building positions are NEVER changed — they come directly from CITY_DATA.
// Trees, lamps, decorations are scaled 2.5x for bigger world feel.

export default class Objects {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;

    this.buildingMeshes = [];
    this.buildingBoxes = [];
    this.trees = [];
    this._proximityId = null;
  }

  // ── INIT (must be called before buildAll) ──────────────────────────────────
  _initToonGrad() {
    if (window._toonGrad) return;
    const gc = document.createElement("canvas");
    // 8 stops instead of 4 — doubles sculpted quality on curved/tiered surfaces.
    // Finer gradation near midtones is where stone "turns" from light to shadow.
    // The visual jump from 4→8 bands is the single highest-ROI change here.
    gc.width = 8;
    gc.height = 1;
    const gx = gc.getContext("2d");
    [
      "#060300", // deepest shadow — crevices, underhangs
      "#2e1208", // dark shadow — recessed stone faces
      "#573018", // shadow-mid — shaded side of tier
      "#88503a", // mid-dark  — turning point from shadow
      "#b07a55", // mid       — ambient face
      "#cca070", // mid-light — slight diffuse
      "#ddc899", // light     — facing sun
      "#fff5e8", // highlight — top stone edge catch
    ].forEach((c, i) => {
      gx.fillStyle = c;
      gx.fillRect(i, 0, 1, 1);
    });
    const t = new THREE.CanvasTexture(gc);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    window._toonGrad = t;
  }

  _initMatcaps() {
    if (window._matcaps) return;
    const mk = (h, m, sh, sp) => {
      const S = 128,
        c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
      ctx.clip();
      const g1 = ctx.createLinearGradient(0, S, 0, 0);
      g1.addColorStop(0, sh);
      g1.addColorStop(0.4, m);
      g1.addColorStop(1, h);
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, S, S);
      const g2 = ctx.createRadialGradient(
        S * 0.3,
        S * 0.25,
        0,
        S * 0.45,
        S * 0.45,
        S * 0.5,
      );
      g2.addColorStop(0, sp || "rgba(255,255,255,0.88)");
      g2.addColorStop(0.22, "rgba(255,255,255,0.22)");
      g2.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, S, S);
      ctx.restore();
      return new THREE.CanvasTexture(c);
    };
    window._matcaps = {
      warm: mk("#ffeecc", "#ddaa66", "#774422"),
      cool: mk("#ddeeff", "#6699cc", "#224466"),
      stone: mk("#ffffff", "#f5e0c0", "#cc9966"),
      gold: mk("#ffe566", "#ddaa00", "#553300"),
      // gold_rich: brilliant specular hotspot makes kalash pots / finials read as
      // actual metal. The near-white sp param concentrates light into a tight point.
      gold_rich: mk("#fffce0", "#ffcc33", "#5a3800", "rgba(255,255,220,0.99)"),
      tree: mk("#77cc44", "#336622", "#0a1a04"),
      car: mk("#ff9977", "#dd2200", "#440000", "rgba(255,230,220,0.95)"),
      carDark: mk("#ee5533", "#991100", "#220000"),
      chrome: mk("#ffffee", "#ccccaa", "#444433"),
      glass: mk("#99ccff", "#3366aa", "#001133"),
      tyre: mk("#333222", "#151210", "#050404"),
      dark: mk("#443322", "#221108", "#080402"),
      purple: mk("#ffddff", "#dd99ff", "#663388"),
    };
  }

  buildAll(isNight) {
    this._initToonGrad();
    this._initMatcaps();
    this._isNight = isNight || false;
    this._buildAllTemples();
    this._buildTrees();
    this._buildLamps();
    this._buildGrass();
    this._buildRoadDecorations();
    this._buildBillboardLabels(); // floating 3D name labels above buildings
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────
  _pc(c) {
    return typeof c === "string" && c.startsWith("#")
      ? parseInt(c.slice(1), 16)
      : typeof c === "number"
        ? c
        : 0x334455;
  }

  _ptLight(col, intensity, dist, pos) {
    const l = new THREE.PointLight(col, intensity, dist);
    if (pos) l.position.set(...pos);
    return l;
  }

  // ── TEMPLES — exact positions from CITY_DATA ───────────────────────────────
  _buildAllTemples() {
    (window.CITY_DATA?.buildings || []).forEach((b) => this._buildTemple(b));
  }

  _buildTemple(b) {
    const g = new THREE.Group();
    // EXACT position from city-data — NOT scaled
    g.position.set(b.pos[0], 0, b.pos[1]);

    const w = b.size[0],
      d = b.size[1],
      h = b.height;
    const gc = this._pc(b.glowColor);
    const tg = window._toonGrad;
    const mc = window._matcaps || {};

    const stoneColors = {
      "#00c8ff": [0xddeeff, 0xaaccee, 0x5588aa],
      "#7dff4f": [0xeeffcc, 0xbbdd88, 0x667733],
      "#ffcc44": [0xfff0bb, 0xeebb55, 0xaa7700],
      "#ff6b00": [0xffddb8, 0xee9944, 0xaa4411],
      "#c084fc": [0xffeeff, 0xddaaff, 0x9944cc],
      "#4dd4ff": [0xddf4ff, 0x99ddff, 0x4488bb],
      "#ff9950": [0xffeedd, 0xeeaa66, 0xaa5522],
      "#a78bfa": [0xf0e8ff, 0xcc99ff, 0x7744bb],
      "#34d399": [0xddfff0, 0x88eebb, 0x227755],
    };
    const [sL, sM, sD] = stoneColors[b.glowColor] || [
      0xffeedd, 0xddbb88, 0x886633,
    ];

    const mL = new THREE.MeshToonMaterial({ color: sL, gradientMap: tg });
    const mM = new THREE.MeshToonMaterial({ color: sM, gradientMap: tg });
    const mD = new THREE.MeshToonMaterial({ color: sD, gradientMap: tg });

    // ── IMPROVEMENT 2: Emissive trim on dark cornice material ────────────────
    // Dark cornices absorb a whisper of the building's glow color — like
    // gilded inlay or painted carvings catching interior temple light.
    // MeshToonMaterial supports emissive; we dim it to ~6% of the glow color.
    mD.emissive = new THREE.Color(gc).multiplyScalar(0.06);

    // ── IMPROVEMENT 2: Gold → matcap with specular hotspot ───────────────────
    // Kalash pots and finials now read as actual brass/gold, not flat yellow.
    // The gold_rich matcap has a near-white concentrated specular highlight.
    const mG = new THREE.MeshMatcapMaterial({
      color: 0xffdd55,
      matcap: mc.gold_rich || mc.gold || mc.warm,
    });

    // Foundation steps — IMPROVEMENT 3: lowest step uses dark material (fake AO)
    // The bottom-most step sits in shadow from all steps above it.
    // Using mD instead of mM/mL grounds the building visually.
    const steps = b.isHero ? 4 : 3;
    for (let s = 0; s < steps; s++) {
      const sw = w + (steps - s) * 1.8,
        sd = d + (steps - s) * 1.8,
        sh = 0.38;
      // s=0 is the lowest step — darkest (in shadow from those above)
      // s=1 receives partial shadow — mid tone
      // s=2+ are lit — light tone
      const stepMat = s === 0 ? mD : s === 1 ? mM : mL;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), stepMat);
      slab.position.y = s * sh + sh / 2;
      slab.userData.isFoundation = true;
      g.add(slab);
    }
    const baseH = steps * 0.38;
    const type = b.templeType || "shikhara";

    if (type === "gopuram")
      this._gopuram(g, w, d, h, baseH, mL, mM, mD, mG, gc, b);
    else if (type === "shikhara")
      this._shikhara(g, w, d, h, baseH, mL, mM, mD, mG, gc, b);
    else if (type === "mandapa")
      this._mandapa(g, w, d, h, baseH, mL, mM, mD, mG, gc, b, mc, sL);
    else if (type === "stupa")
      this._stupa(g, w, d, h, baseH, mL, mM, mD, mG, gc, b);

    // ── IMPROVEMENT 5: Micro-imperfection — hand-built, not extruded ─────────
    // Must run AFTER the building type method populates the group.
    this._imperfectify(g, baseH);

    // Torana gateway for hero/education
    if (b.isHero || b.isEducation) {
      const torH = h * 0.5,
        torW = w * 0.7;
      for (const x of [-torW / 2, torW / 2]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, torH, 0.45), mM);
        p.position.set(x, torH / 2, d / 2 + 2);
        g.add(p);
      }
      const lt = new THREE.Mesh(
        new THREE.BoxGeometry(torW + 0.45, 0.5, 0.45),
        mM,
      );
      lt.position.set(0, torH, d / 2 + 2);
      g.add(lt);
      const archDec = new THREE.Mesh(
        new THREE.BoxGeometry(torW * 0.6, 0.35, 0.45),
        mG,
      );
      archDec.position.set(0, torH + 0.5, d / 2 + 2);
      g.add(archDec);
    }

    // Glowing hero orb
    if (b.isHero) {
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.7, 0),
        new THREE.MeshBasicMaterial({ color: gc }),
      );
      orb.position.y = h + 3;
      orb.userData.isOrb = true;
      g.add(orb);
      for (const [r, i] of [
        [1.5, 0],
        [2.5, 1],
      ]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.08, 4, 16),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.5 - i * 0.12,
          }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h + 3;
        ring.userData.heroRing = true;
        ring.userData.ri = i;
        g.add(ring);
      }
      g.add(this._ptLight(gc, this._isNight ? 4.5 : 1.8, 35, [0, h + 2.5, 0]));
      g.add(this._ptLight(0xffcc88, this._isNight ? 2.0 : 0.8, 14, [0, 2, 0]));
    } else {
      g.add(this._ptLight(gc, this._isNight ? 2.5 : 1.0, 22, [0, h * 0.7, 0]));
    }

    // ── IMPROVEMENT 3: Soft gradient contact shadow ───────────────────────────
    // Canvas radial gradient: dense black center → transparent edge.
    // Two layers: wide soft outer + tight dark inner (fake contact AO).
    // This is how every good game engine fakes AO for static objects.
    if (!window._softShadowTex) {
      const sc = document.createElement("canvas");
      sc.width = sc.height = 64;
      const sx = sc.getContext("2d");
      const sg = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
      sg.addColorStop(0, "rgba(0,0,0,0.88)");
      sg.addColorStop(0.28, "rgba(0,0,0,0.65)");
      sg.addColorStop(0.55, "rgba(0,0,0,0.32)");
      sg.addColorStop(0.8, "rgba(0,0,0,0.10)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      sx.fillStyle = sg;
      sx.fillRect(0, 0, 64, 64);
      window._softShadowTex = new THREE.CanvasTexture(sc);
    }
    // Wide soft outer shadow — the "ambient shadow" bleeding across the ground
    const shadOuter = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: window._softShadowTex,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    );
    shadOuter.rotation.x = -Math.PI / 2;
    shadOuter.scale.set(w * 2.6, d * 2.4, 1);
    shadOuter.position.y = 0.022;
    g.add(shadOuter);

    // Tight inner shadow — the "contact AO" directly under the base
    const shadInner = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: window._softShadowTex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    shadInner.rotation.x = -Math.PI / 2;
    shadInner.scale.set(w * 1.05, d * 0.98, 1);
    shadInner.position.y = 0.035;
    g.add(shadInner);

    // ── IMPROVEMENT 4: BackSide rim / edge highlight ──────────────────────────
    // An inverted-normals mesh slightly larger than the building body.
    // BackSide = inner faces render outward, visible only at the silhouette.
    // Creates a colored edge that reads as "this object has physical thickness."
    // Used in every cel-shaded game (Wind Waker, Jet Set Radio, Bruno Simon).
    const rimH = h + baseH;
    const rimMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.028, rimH, d * 1.028),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(gc).multiplyScalar(1.6),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
      }),
    );
    rimMesh.position.y = rimH / 2;
    rimMesh.userData.isRim = true;
    g.add(rimMesh);
    g._rimMesh = rimMesh; // store ref for animation

    // Proximity glow ring
    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(w, d) * 0.65, 0.1, 4, 24),
      new THREE.MeshBasicMaterial({ color: gc, transparent: true, opacity: 0 }),
    );
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.1;
    glowRing.userData.isProxRing = true;
    g.add(glowRing);

    // Collision box
    this.buildingBoxes.push({
      minX: b.pos[0] - w / 2 - 2.5,
      maxX: b.pos[0] + w / 2 + 2.5,
      minZ: b.pos[1] - d / 2 - 2.5,
      maxZ: b.pos[1] + d / 2 + 2.5,
    });

    g.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    this.scene.add(g);

    // ── IMPROVEMENT 6: per-building breath phase (seeded from world position) ─
    // Deterministic: same result every reload. Range 0..2π.
    // Without this, all 12 temples breathe perfectly in sync — uncanny.
    g._breathPhase = Math.sin(b.pos[0] * 0.41 + b.pos[1] * 0.73) * Math.PI * 2;
    g._rimMesh = rimMesh;

    this.buildingMeshes.push({
      group: g,
      building: b,
      bodyMat: mM,
      darkMat: mD,
    });
  }

  _gopuram(g, w, d, h, baseH, mL, mM, mD, mG, gc, b) {
    const hallH = h * 0.28;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(w, hallH, d), mM);
    hall.position.y = baseH + hallH / 2;
    g.add(hall);
    const arch = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.35, hallH * 0.75, d + 0.5),
      mD,
    );
    arch.position.y = baseH + hallH * 0.38;
    g.add(arch);
    const tiers = b.isHero ? 8 : 6;
    let tierY = baseH + hallH,
      tw = w,
      td = d;
    const tierH = (h - hallH) / tiers;
    for (let t = 0; t < tiers; t++) {
      tw *= 0.88;
      td *= 0.88;
      const tier = new THREE.Mesh(
        new THREE.BoxGeometry(tw, tierH, td),
        t % 2 === 0 ? mM : mL,
      );
      tier.position.y = tierY + tierH / 2;
      g.add(tier);
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(tw + 0.3, 0.18, td + 0.3),
        mD,
      );
      c.position.y = tierY + tierH;
      g.add(c);
      tierY += tierH;
    }
    const vault = new THREE.Mesh(
      new THREE.CylinderGeometry(tw * 0.3, tw * 0.48, tw * 0.7, 8),
      mM,
    );
    vault.position.y = tierY + tw * 0.35;
    vault.rotation.z = Math.PI / 2;
    g.add(vault);
    const kPot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), mG);
    kPot.position.y = tierY + tw * 0.7 + 0.6;
    g.add(kPot);
    const kTop = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 6), mG);
    kTop.position.y = tierY + tw * 0.7 + 1.2;
    g.add(kTop);
  }

  _shikhara(g, w, d, h, baseH, mL, mM, mD, mG, gc, b) {
    const sH = h * 0.32;
    const sanc = new THREE.Mesh(new THREE.BoxGeometry(w, sH, d), mM);
    sanc.position.y = baseH + sH / 2;
    g.add(sanc);
    const aY = baseH + sH;
    let spW = w * 0.9;
    const spTiers = b.isHero ? 10 : 7;
    const spH = (h - sH) / spTiers;
    for (let t = 0; t < spTiers; t++) {
      spW *= 0.85;
      const sp = new THREE.Mesh(
        new THREE.CylinderGeometry(spW * 0.5, spW * 0.55, spH, 8),
        t % 2 === 0 ? mM : mL,
      );
      sp.position.y = aY + t * spH + spH / 2;
      g.add(sp);
      if (t < spTiers - 2) {
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(spW * 0.52, 0.1, 4, 12),
          new THREE.MeshBasicMaterial({
            color: gc,
            transparent: true,
            opacity: 0.55,
          }),
        );
        band.position.y = aY + t * spH + spH;
        band.rotation.x = Math.PI / 2;
        g.add(band);
      }
    }
    const aml = new THREE.Mesh(
      new THREE.CylinderGeometry(spW * 0.7, spW * 0.7, 0.35, 12),
      mG,
    );
    aml.position.y = aY + spTiers * spH + 0.18;
    g.add(aml);
    const kPot = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), mG);
    kPot.position.y = aY + spTiers * spH + 0.65;
    g.add(kPot);
  }

  _mandapa(g, w, d, h, baseH, mL, mM, mD, mG, gc, b, mc, sL) {
    const roofH = h * 0.45;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.5, roofH, d + 0.5),
      mM,
    );
    roof.position.set(0, baseH + roofH / 2, 0);
    g.add(roof);
    const topH = h * 0.28;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.72, topH, d * 0.72),
      mL,
    );
    top.position.y = baseH + roofH + topH / 2;
    g.add(top);
    const crH = h * 0.2;
    const cr = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.18, w * 0.26, crH, 8),
      mM,
    );
    cr.position.y = baseH + roofH + topH + crH / 2;
    g.add(cr);
    const kPot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), mG);
    kPot.position.y = baseH + roofH + topH + crH + 0.4;
    g.add(kPot);
    const cols = b.isHero ? 4 : 3,
      colH = roofH * 0.88;
    const colMat = new THREE.MeshMatcapMaterial({
      color: sL,
      matcap: mc.stone || mc.warm,
    });
    for (const side of [-1, 1])
      for (let i = 0; i < cols; i++) {
        const cx = (i / (cols - 1) - 0.5) * (w - 1);
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.34, colH, 7),
          colMat,
        );
        col.position.set(cx, baseH + colH / 2, side * (d / 2 + 0.1));
        g.add(col);
      }
  }

  _stupa(g, w, d, h, baseH, mL, mM, mD, mG, gc, b) {
    const drumH = h * 0.35;
    const drum = new THREE.Mesh(new THREE.BoxGeometry(w, drumH, d), mM);
    drum.position.set(0, baseH + drumH / 2, 0);
    g.add(drum);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4),
      mG,
    );
    band.position.y = baseH + drumH;
    g.add(band);
    const dR = Math.min(w, d) * 0.52;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(dR, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      mL,
    );
    dome.position.y = baseH + drumH;
    g.add(dome);
    const hmY = baseH + drumH + dR * 0.78;
    const hm = new THREE.Mesh(
      new THREE.BoxGeometry(dR * 0.55, dR * 0.35, dR * 0.55),
      mM,
    );
    hm.position.y = hmY;
    g.add(hm);
    let dY = hmY + dR * 0.18,
      dR2 = dR * 0.22;
    for (let i = 0; i < (b.isHero ? 6 : 4); i++) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(dR2, dR2 * 1.1, 0.22, 10),
        mG,
      );
      disc.position.y = dY;
      g.add(disc);
      dY += 0.28;
      dR2 *= 0.82;
    }
    const fin = new THREE.Mesh(new THREE.SphereGeometry(dR2 * 1.2, 8, 6), mG);
    fin.position.y = dY + 0.18;
    g.add(fin);
  }

  // ── IMPROVEMENT 5: MICRO-IMPERFECTION ──────────────────────────────────────
  // Post-pass over the group after building type is fully constructed.
  // Adds deterministic micro-jitter to every tier mesh above the foundation.
  //
  // WHY: Mathematically perfect geometry reads as "computer generated."
  // Real stone temples have settling, uneven courses, slight rotational drift
  // from centuries of thermal expansion. These imperceptible individual
  // offsets COLLECTIVELY create the "hand-built" vs "extruded" distinction.
  //
  // Uses a deterministic sine RNG seeded from mesh position so the result
  // is identical every reload — it's not random noise, it's baked character.
  _imperfectify(group, baseH) {
    const rng = (s) => Math.sin(s * 127.1 + 43.7) * 0.5 + 0.5; // → 0..1
    let idx = 0;
    group.children.forEach((c) => {
      if (!c.isMesh) return;
      // Skip foundation slabs, rings, rim, orb, lights
      if (c.userData.isFoundation) return;
      if (c.userData.isRim || c.userData.isProxRing) return;
      if (c.userData.heroRing || c.userData.isOrb) return;
      if (c.position.y < baseH + 0.1) return; // anything at ground level
      if (c.isLight) return;

      // Seed from geometry + iteration so same building always jitters same way
      const seed = c.position.y * 6.1 + c.position.x * 3.7 + idx * 2.3;

      // Micro rotation Y — stone was placed by a person, not a CNC machine
      c.rotation.y += (rng(seed) - 0.5) * 0.013;

      // Micro X/Z drift — each course settled slightly differently
      c.position.x += (rng(seed * 2.1) - 0.5) * 0.038;
      c.position.z += (rng(seed * 3.7) - 0.5) * 0.038;

      // Micro scale variation — no two stones are exactly the same size
      const sv = 1 + (rng(seed * 5.3) - 0.5) * 0.022;
      c.scale.x *= sv;
      c.scale.z *= sv;

      // Store a unique phase for any per-mesh animation later
      c.userData.jitterPhase = rng(seed * 8.9) * Math.PI * 2;

      idx++;
    });
  }

  // ── TREES — scaled 2.5x positions ─────────────────────────────────────────
  _buildTrees() {
    const tg = window._toonGrad;
    const S = 2.5; // world scale

    // Tree palette: majority GREENS for natural variety, selective warm accents.
    // Previous palette had 7/13 warm colors causing yellow wash against orange world.
    // Rule: 60% greens, 25% autumn accent, 15% special (pink blossom handled separately).
    const leafColors = [
      // Deep rich greens — the dominant color
      0x2d6622, // deep forest green
      0x3a7a2a, // mid forest green
      0x4a8833, // natural green
      0x336644, // blue-green
      0x558844, // light forest green
      0x447733, // olive green
      0x226633, // dark emerald
      // Autumn accents — just enough for interest, not dominance
      0xcc8822, // amber gold (autumn)
      0xdd6611, // burnt orange (autumn)
      0xaa3311, // dark autumn red
      // Bright chartreuse — the pop color Bruno uses sparingly
      0x88cc22, // bright chartreuse
      0x6aaa22, // yellow-green
      // Pink blossom — rare accent (handled by isBlossom separately)
      0xdd88aa, // sakura pink
    ];

    // Dense tree placement around each temple + along roads (scaled positions)
    const positions = [
      // Around central island
      ...[
        7, 7, -7, 7, 7, -7, -7, -7, 11, 0, -11, 0, 0, 11, 0, -11, 14, 5, -14, 5,
        14, -5, -14, -5,
      ]
        .reduce(
          (a, v, i) =>
            i % 2 === 0
              ? a.concat([[v, null]])
              : a.map((p, j) => (j === a.length - 1 ? [p[0], v] : p)),
          [],
        )
        .filter(([x, z]) => x !== null && z !== null)
        .map(([x, z]) => [x * S, z * S]),

      // Main boulevards (scaled)
      ...[
        [50, 12],
        [-50, 12],
        [50, -12],
        [-50, -12],
        [87, 12],
        [-87, 12],
        [87, -12],
        [-87, -12],
        [125, 12],
        [-125, 12],
        [125, -12],
        [-125, -12],
        [165, 12],
        [-165, 12],
        [165, -12],
        [-165, -12],
        [50, -47],
        [-50, -47],
        [50, -23],
        [-50, -23],
        [50, 155],
        [-50, 155],
        [100, 155],
        [-100, 155],
        [20, -155],
        [-20, -155],
        [87, -155],
        [-87, -155],
      ],

      // Hero zone
      ...[
        [55, -35],
        [-55, -35],
        [110, -45],
        [-110, -45],
        [110, -22],
        [-110, -22],
      ],

      // Temple surrounds — flat [x,z,x,z,...] pairs converted to [[x,z],...]
      ...(() => {
        const flat = [
          45,
          -35,
          60,
          -22,
          30,
          -22, // surya-dwara
          28,
          50,
          15,
          40,
          40,
          40, // vishwakarma
          65,
          -48,
          50,
          -50,
          70,
          -28, // akasha-mandapa
          65,
          18,
          45,
          18,
          70,
          0, // setu-nagara
          -65,
          -32,
          -45,
          -32,
          -70,
          -12, // brahma-kund
          -50,
          45,
          -30,
          45,
          -55,
          25, // lakshmi-prasad
          0,
          65,
          15,
          60,
          -15,
          60, // pura-stambha
          -38,
          -48,
          -18,
          -48,
          -38,
          -28, // maya-sabha
          0,
          -65,
          15,
          -65,
          -15,
          -65, // jyotish-vedha
          -65,
          18,
          -45,
          18,
          -70,
          0, // vayu-rath
          -32,
          -72,
          -12,
          -72,
          -22,
          -82, // saraswati-vihar
          32,
          -72,
          12,
          -72,
          22,
          -82, // gurukul-ashram
        ];
        const pairs = [];
        for (let i = 0; i < flat.length; i += 2)
          pairs.push([flat[i], flat[i + 1]]);
        return pairs;
      })(),
    ];

    positions.forEach(([x, z]) => {
      if (!x || !z) return;
      // Taller trees — Bruno's foliage towers above buildings
      const h = 2.8 + Math.random() * 2.2;
      const r = 2.0 + Math.random() * 1.4;
      // 30% blossom (pink), 70% foliage — more leafy than blossom
      const isBlossom = Math.random() > 0.7;
      const lColor = leafColors[Math.floor(Math.random() * leafColors.length)];
      const lMat = new THREE.MeshToonMaterial({
        color: lColor,
        gradientMap: tg,
      });

      const tg2 = new THREE.Group();
      tg2.position.set(x, 0, z);

      // Thicker trunk — brunos trees have visible trunks
      const trunkH = h * 1.4;
      const trunkW = 0.35 + Math.random() * 0.15;
      const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(trunkW, trunkH, trunkW),
        new THREE.MeshToonMaterial({ color: 0x7a4d2a, gradientMap: tg }),
      );
      trunk.position.y = trunkH * 0.5;
      tg2.add(trunk);

      let leafMesh;
      if (isBlossom) {
        leafMesh = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.9, 7, 6),
          lMat,
        );
        leafMesh.position.y = h * 1.4 + r * 0.7;
        leafMesh.scale.y = 0.85; // flatten slightly
      } else {
        // Use ConeGeometry for most — but vary the shape more
        const useRound = Math.random() > 0.55;
        if (useRound) {
          // Rounded tree like Bruno's broad-canopy trees
          leafMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), lMat);
          leafMesh.position.y = h * 1.4 + r * 0.5;
          leafMesh.scale.y = 0.75;
        } else {
          // Tall cone tree
          leafMesh = new THREE.Mesh(
            new THREE.ConeGeometry(r * 0.85, r * 2.6, 7),
            lMat,
          );
          leafMesh.position.y = h * 1.4 + r * 0.95;
        }
      }
      leafMesh.userData.baseY = leafMesh.position.y;
      tg2.add(leafMesh);

      // Random slight Y rotation — no two trees face same way
      tg2.rotation.y = Math.random() * Math.PI * 2;

      this.scene.add(tg2);
      this.trees.push({
        group: tg2,
        leaf: leafMesh,
        shakeT: 0,
        baseX: x,
        baseZ: z,
        r: r + 0.5,
        windPhase: Math.random() * Math.PI * 2,
        windAmpX: 0.022 + Math.random() * 0.018,
        windAmpZ: 0.016 + Math.random() * 0.012,
        windFreq: 0.35 + Math.random() * 0.25,
      });
    });
  }

  // ── LAMPS — along roads (scaled 2.5x) ─────────────────────────────────────
  _buildLamps() {
    const mc = window._matcaps || {};
    const poleMat = new THREE.MeshMatcapMaterial({
      color: 0x554477,
      matcap: mc.purple || mc.cool,
    });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffeeaa });

    const positions = [
      // Central island
      [27, 0],
      [-27, 0],
      [0, 27],
      [0, -27],
      [20, 20],
      [-20, 20],
      [20, -20],
      [-20, -20],
      // Along main E-W boulevard z=0
      [90, 5],
      [-90, 5],
      [90, -5],
      [-90, -5],
      [150, 5],
      [-150, 5],
      [150, -5],
      [-150, -5],
      // Hero zone
      [10, -55],
      [-10, -55],
      [10, -38],
      [-10, -38],
      // South boulevard
      [60, 108],
      [-60, 108],
      [120, 108],
      [-120, 108],
      // Education
      [20, -158],
      [-20, -158],
    ];

    positions.forEach(([x, z]) => {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6, 0.2), poleMat);
      pole.position.set(x, 3, z);
      this.scene.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1), poleMat);
      arm.position.set(x, 6.2, z + 0.5);
      this.scene.add(arm);
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.65, 6),
        poleMat,
      );
      housing.position.set(x, 6.3, z + 1.0);
      this.scene.add(housing);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.35, 0.38),
        headMat,
      );
      glow.position.set(x, 6.3, z + 1.0);
      this.scene.add(glow);
      const lampLt = this._ptLight(0xffeeaa, this._isNight ? 2.8 : 0, 16, [
        x,
        6.3,
        z + 1.0,
      ]);
      lampLt.userData.isLampLight = true;
      this.scene.add(lampLt);
    });
  }

  // ── GRASS PATCHES ──────────────────────────────────────────────────────────
  _buildGrass() {
    const colors = [0x3a7733, 0x4a8833, 0x336622, 0xccdd44, 0x99cc33];
    // Grass along world edges (scaled)
    const positions = [
      [-212, 0],
      [-212, 50],
      [-212, -50],
      [-212, 100],
      [-212, -100],
      [212, 0],
      [212, 50],
      [212, -50],
      [212, 100],
      [212, -100],
      [0, -200],
      [50, -200],
      [-50, -200],
      [100, -200],
      [-100, -200],
      [0, 155],
      [50, 155],
      [-50, 155],
      [100, 155],
      [-100, 155],
      // Between roads
      [55, -70],
      [-55, -70],
      [130, -70],
      [-130, -70],
      [55, 20],
      [-55, 20],
      [55, -10],
      [-55, -10],
      [125, 20],
      [-125, 20],
      [125, -10],
      [-125, -10],
    ];

    positions.forEach(([x, z]) => {
      const count = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < count; i++) {
        const gx = x + (Math.random() - 0.5) * 8,
          gz = z + (Math.random() - 0.5) * 8;
        const w = 0.15 + Math.random() * 0.18,
          h = 0.5 + Math.random() * 0.7;
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, w * 0.5),
          new THREE.MeshLambertMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
          }),
        );
        blade.position.set(gx, h / 2, gz);
        blade.rotation.y = Math.random() * Math.PI;
        this.scene.add(blade);
      }
    });
  }

  // ── ROAD DECORATIONS — stones, markers near roads (1-3 units from road) ────
  _buildRoadDecorations() {
    const stoneMat = new THREE.MeshToonMaterial({
      color: 0xbbaa99,
      gradientMap: window._toonGrad,
    });
    // Small stones along the sides of main roads
    const stoneSpots = [
      [25, 0],
      [25, -35],
      [-25, 0],
      [-25, -35],
      [25, 60],
      [-25, 60],
      [50, -95],
      [-50, -95],
      [0, -130],
      [50, -130],
      [-50, -130],
    ];
    stoneSpots.forEach(([x, z]) => {
      for (let i = 0; i < 3; i++) {
        const stone = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.2, 0),
          stoneMat,
        );
        stone.position.set(
          x + (Math.random() - 0.5) * 4,
          0.3,
          z + (Math.random() - 0.5) * 4,
        );
        stone.rotation.y = Math.random() * Math.PI;
        this.scene.add(stone);
      }
    });
  }

  // ── BILLBOARD LABELS — floating 3D name tags above buildings ──────────────
  // Bruno Simon's signature: zone names float in 3D world space beside the car.
  // Each building gets a Sprite with a canvas texture showing its name.
  // Implementation: canvas → CanvasTexture → SpriteMaterial → Sprite.
  //
  // WHY sprites not HTML: HTML overlays sit on top of everything, can't have
  // world-space positioning, and break depth perception. Sprites live in the
  // scene, occlude correctly, and can fade/scale with distance.
  //
  // Each label:
  //   - Floats at (building_apex + 2 units) Y
  //   - Faces camera always (billboard behavior is automatic with Sprite)
  //   - Fades in when car enters hover zone (70u), fades out beyond
  //   - Scales slightly up when in proximity zone (like Bruno's PROJECTS label)
  //   - Hero buildings have a ◆ diamond prefix (same as Bruno's marker)
  _buildBillboardLabels() {
    this._billboards = [];

    (window.CITY_DATA?.buildings || []).forEach((b) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");

      // Parse glow color for the label accent
      const hex = (b.glowColor || "#ffcc44").replace("#", "");
      const lr = parseInt(hex.slice(0, 2), 16);
      const lg = parseInt(hex.slice(2, 4), 16);
      const lbv = parseInt(hex.slice(4, 6), 16);

      this._drawLabelCanvas(ctx, canvas.width, canvas.height, b, lr, lg, lbv);

      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false, // always on top of buildings when visible
        sizeAttenuation: true, // shrinks with distance
      });

      const sprite = new THREE.Sprite(mat);
      // Position: above the building's apex. Height = building height + 3 units
      sprite.position.set(b.pos[0], b.height + 4, b.pos[1]);
      // Scale: 512×128 canvas at world units. ~12 units wide = readable at 70u
      sprite.scale.set(14, 3.5, 1);
      sprite.userData.buildingId = b.id;
      sprite.userData.isLabel = true;

      this.scene.add(sprite);
      this._billboards.push({ sprite, building: b });
    });
  }

  _drawLabelCanvas(ctx, W, H, b, r, g, bv) {
    ctx.clearRect(0, 0, W, H);

    // Background pill — dark glass
    const pad = 12;
    const rr = H / 2 - pad; // corner radius
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, pad, W - pad * 2, H - pad * 2, rr);
    ctx.fillStyle = `rgba(6,3,1,0.82)`;
    ctx.fill();
    // Colored border stroke
    ctx.strokeStyle = `rgba(${r},${g},${bv},0.7)`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Diamond marker prefix (hero) or dot (normal)
    const prefix = b.isHero ? "◆ " : "· ";
    const label = prefix + b.name.toUpperCase();

    ctx.font = `bold 44px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Glow layer
    ctx.shadowColor = `rgba(${r},${g},${bv},0.9)`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, W / 2, H / 2, W - 48);

    // Crisp top layer
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgb(${Math.min(255, r + 180)},${Math.min(255, g + 180)},${Math.min(255, bv + 180)})`;
    ctx.fillText(label, W / 2, H / 2, W - 48);
  }

  // Called every frame from updateBuildingEntities — keep in sync with hover zones
  _updateBillboards(carX, carZ, now) {
    if (!this._billboards) return;
    const HOVER_DIST = 70;
    const PROX_DIST = 32;

    this._billboards.forEach(({ sprite, building }) => {
      const dist = Math.hypot(carX - building.pos[0], carZ - building.pos[1]);
      const mat = sprite.material;

      // Target opacity: invisible far away, full at hover zone, extra visible at prox
      let targetOp;
      if (dist > HOVER_DIST) {
        targetOp = 0;
      } else if (dist > PROX_DIST) {
        // Fade in across hover zone: 0 at 70u → 0.92 at 32u
        targetOp = ((HOVER_DIST - dist) / (HOVER_DIST - PROX_DIST)) * 0.92;
      } else {
        targetOp = 0.92;
      }

      // Smooth fade — fast in (responsive), slow out (lingers pleasantly)
      const faderate = targetOp > mat.opacity ? 0.12 : 0.04;
      mat.opacity += (targetOp - mat.opacity) * faderate;

      // Scale pulse at proximity: label grows slightly when you're right next to it
      // Same as how Bruno's "PROJECTS" label pops slightly as you get close
      const scaleBoost =
        dist < PROX_DIST ? 1.0 + (1 - dist / PROX_DIST) * 0.22 : 1.0;
      sprite.scale.set(14 * scaleBoost, 3.5 * scaleBoost, 1);

      // Gentle float — label bobs up/down slowly, making it feel alive
      // Phase-seeded per building so they don't all bob in sync
      const floatPhase = building.pos[0] * 0.13 + building.pos[1] * 0.27;
      sprite.position.y =
        building.height + 4 + Math.sin(now * 0.6 + floatPhase) * 0.35;
    });
  }

  // ── CONFETTI BURST — fired on building entry (Bruno Simon completion moment) ─
  // Spawns N flat rectangles with random initial velocities, gravity, and
  // random rotation. Each has a distinct hue from the building's glow color.
  //
  // WHY confetti: It is the most unambiguous "reward" signal in games.
  // Entering a new temple should feel like an achievement, not a page load.
  // The colored rectangles reference Bruno's completion explosion (frame 6.8)
  // and ground the digital action in a physical, joyful moment.
  spawnConfetti(building) {
    const COUNT = 80;
    const gc = parseInt((building.glowColor || "#ffcc44").replace("#", ""), 16);

    // Confetti palette: building color + complementary tones
    const hex = (building.glowColor || "#ffcc44").replace("#", "");
    const br = parseInt(hex.slice(0, 2), 16);
    const bg = parseInt(hex.slice(2, 4), 16);
    const bb = parseInt(hex.slice(4, 6), 16);

    const palette = [
      gc,
      0xffffff,
      new THREE.Color(br / 255, bg / 255, bb / 255)
        .offsetHSL(0.15, 0, 0)
        .getHex(),
      new THREE.Color(br / 255, bg / 255, bb / 255)
        .offsetHSL(-0.15, 0, 0.1)
        .getHex(),
      0xffe066,
      0xff88cc,
      0x88ffcc,
    ];

    if (!this._confettiList) this._confettiList = [];

    const cx = building.pos[0];
    const cz = building.pos[1];
    const launchY = building.height * 0.5 + 2;

    for (let i = 0; i < COUNT; i++) {
      const w = 0.28 + Math.random() * 0.44;
      const h = 0.18 + Math.random() * 0.28;
      const piece = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: palette[Math.floor(Math.random() * palette.length)],
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );

      // Spawn at building center, slight random offset
      piece.position.set(
        cx + (Math.random() - 0.5) * 3,
        launchY + Math.random() * 4,
        cz + (Math.random() - 0.5) * 3,
      );

      // Random velocity: burst outward in a hemisphere
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      const upward = 5 + Math.random() * 9;
      piece.userData.vx = Math.cos(angle) * speed;
      piece.userData.vy = upward;
      piece.userData.vz = Math.sin(angle) * speed;
      piece.userData.rx = (Math.random() - 0.5) * 4; // tumble X
      piece.userData.ry = (Math.random() - 0.5) * 4; // tumble Y
      piece.userData.rz = (Math.random() - 0.5) * 4; // tumble Z
      piece.userData.life = 1.0;
      piece.userData.drag = 0.92 + Math.random() * 0.05;

      this.scene.add(piece);
      this._confettiList.push(piece);
    }
  }

  updateConfetti(dt) {
    if (!this._confettiList || this._confettiList.length === 0) return;
    const GRAVITY = -9.8;

    this._confettiList = this._confettiList.filter((p) => {
      p.userData.vy += GRAVITY * dt;
      p.userData.vx *= p.userData.drag;
      p.userData.vz *= p.userData.drag;

      p.position.x += p.userData.vx * dt;
      p.position.y += p.userData.vy * dt;
      p.position.z += p.userData.vz * dt;

      p.rotation.x += p.userData.rx * dt;
      p.rotation.y += p.userData.ry * dt;
      p.rotation.z += p.userData.rz * dt;

      p.userData.life -= dt * 0.38;
      p.material.opacity = Math.max(0, p.userData.life);

      // Remove when fallen below ground or fully faded
      if (p.userData.life <= 0 || p.position.y < -2) {
        this.scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        return false;
      }
      return true;
    });
  }

  // ── PROXIMITY DETECTION ────────────────────────────────────────────────────
  checkProximity(carX, carZ) {
    const PROX = 32;
    let closest = null,
      closestDist = PROX;
    (window.CITY_DATA?.buildings || []).forEach((b) => {
      // Use roadPos if available (closer to road = easier to approach)
      const rx = b.roadPos ? b.roadPos[0] : b.pos[0];
      const rz = b.roadPos ? b.roadPos[1] : b.pos[1];
      const d = Math.hypot(carX - rx, carZ - rz);
      if (d < closestDist) {
        closestDist = d;
        closest = b;
      }
    });
    const newId = closest ? closest.id : null;
    if (newId !== this._proximityId) {
      this._proximityId = newId;
      this.events.emit("proximityChange", closest);
    }
    return closest;
  }

  // ── AMBIENT UPDATES ────────────────────────────────────────────────────────
  updateWindSway(now) {
    // Bruno's trees lean dramatically in the wind — it reads from across the city.
    // Amplitude 0.022 is imperceptible. We need 0.08–0.12 to be felt.
    // We animate BOTH the whole group (gentle lean) and the leaf (faster flutter)
    // to create the layered motion of real wind through foliage.
    this.trees.forEach((tr) => {
      if (tr.shakeT > 0) {
        // Car-proximity shake — rapid high-frequency
        const shake = Math.sin(now * 22) * tr.shakeT * 0.35;
        tr.leaf.rotation.x = shake;
        tr.leaf.rotation.z = shake * 0.7;
        tr.shakeT = Math.max(0, tr.shakeT - 0.022);
      } else {
        const ph = now * tr.windFreq + tr.windPhase;

        // Leaf flutter — fast, small (rustling sound visualized)
        tr.leaf.rotation.x = Math.sin(ph * 1.8) * tr.windAmpX * 3.5;
        tr.leaf.rotation.z = Math.sin(ph * 1.4 + 1) * tr.windAmpZ * 3.5;

        // Whole tree lean — slow, large (trunk bending in breeze)
        // Phase offset by 0.5 so lean leads the flutter slightly
        tr.group.rotation.x = Math.sin(ph * 0.55 + 0.5) * 0.06;
        tr.group.rotation.z = Math.sin(ph * 0.42 + 1.8) * 0.05;
      }
    });
  }

  updateBuildingEntities(carX, carZ, now, dt) {
    // Update floating billboard labels (Bruno Simon style zone names)
    this._updateBillboards(carX, carZ, now);

    // dt may not be passed by older call sites — default to 60fps
    const fdt = dt && dt > 0 && dt < 0.1 ? dt : 0.016;

    this.buildingMeshes.forEach(({ group, building, darkMat }) => {
      const dist = Math.hypot(carX - building.pos[0], carZ - building.pos[1]);
      const isHero = building.isHero;

      // ── ZONE THRESHOLDS ─────────────────────────────────────────────────────
      // Three distinct zones, each with its own response.
      // HOVER  (70u): building "notices" car — subtle scale/glow before proximity
      // CLOSE  (45u): existing isClose flag — breathe amplitude increases
      // PROX   (32u): full proximity response — snap, glow spike, energy column
      const HOVER_DIST = 70;
      const CLOSE_DIST = 45;
      const PROX_DIST = 32;
      const isHover = dist < HOVER_DIST;
      const isClose = dist < CLOSE_DIST;
      const isProx = dist < PROX_DIST;

      // ── SPRING STATE INIT (lazy, runs only once per building) ───────────────
      if (group._snapScale === undefined) {
        group._snapScale = 0; // additional scale ontop of breath
        group._snapVel = 0; // spring velocity
        group._inHover = false;
        group._inProx = false;
        group._breathPhase =
          Math.sin(building.pos[0] * 0.41 + building.pos[1] * 0.73) *
          Math.PI *
          2;
        group._presY = 1.0;
      }

      // ── FIX 1 & 2: SNAP EVENTS — instant velocity spike on zone-crossing ────
      // This is the "snap response" — the building reacts IMMEDIATELY when you
      // enter its zone, before any smooth animation has time to run.
      // A velocity injection into the spring means: 0 → overshoot → settle.
      // Response time is <16ms (next frame). This is what Bruno Simon's world
      // does — objects REACT to you, they don't just respond to distance.
      const justEnteredHover = isHover && !group._inHover;
      const justEnteredProx = isProx && !group._inProx;
      const justExitedHover = !isHover && group._inHover;

      if (justEnteredHover) {
        // Building "notices" you — slight excited jump
        group._snapVel += isHero ? 0.13 : 0.09;
      }
      if (justEnteredProx) {
        // You're really close — strong snap up with bigger overshoot
        group._snapVel += isHero ? 0.2 : 0.15;
      }
      if (justExitedHover) {
        // You left — small dejected retraction
        group._snapVel -= 0.05;
      }

      group._inHover = isHover;
      group._inProx = isProx;

      // ── FIX 3: SPRING PHYSICS for scale ─────────────────────────────────────
      // True Hooke's law spring: F = -k*displacement - d*velocity
      // k=42 = stiff (fast response), d=7 = moderate damping (one overshoot)
      // Target varies by zone: further = less boost.
      const snapTarget = isProx
        ? isHero
          ? 0.088
          : 0.065
        : isHover
          ? isHero
            ? 0.042
            : 0.03
          : 0.0;

      const k = 42,
        d = 7;
      group._snapVel +=
        ((snapTarget - group._snapScale) * k - group._snapVel * d) * fdt;
      group._snapScale += group._snapVel * fdt;
      // Safety clamp — prevents explosion if dt spikes
      group._snapScale = Math.max(-0.08, Math.min(0.3, group._snapScale));

      // ── FIX 6 (buildings): Phase-offset breathing ───────────────────────────
      const breathRate = isHero ? 0.55 : 0.45;
      const breathAmp = isClose
        ? 0.008 + (1 - dist / CLOSE_DIST) * (isHero ? 0.018 : 0.01)
        : 0.003;
      const presTarget = 1.0 + Math.max(0, 1 - dist / 65) * 0.07;
      group._presY += (presTarget - group._presY) * 0.035;
      const pulse =
        1 +
        Math.sin(now * breathRate * Math.PI * 2 + group._breathPhase) *
          breathAmp;

      // ── COMBINED SCALE: breath × spring ─────────────────────────────────────
      // snap scale multiplies on top of the breathing pulse.
      // This means a building at its breath-peak gets a bigger absolute snap —
      // it feels like the building is excited AND alive, not just mechanically scaled.
      const totalXZ = pulse * (1 + group._snapScale);
      const totalY = totalXZ * group._presY;
      group.scale.set(totalXZ, totalY, totalXZ);

      // ── FIX 4: RIM GLOW BOOST with hover zone ───────────────────────────────
      // Hover zone gives a dim rim hint before proximity — the building
      // "lights up" as you approach, not just when you're already next to it.
      if (group._rimMesh) {
        const rimBase = 0.038;
        const rimBreath =
          Math.sin(now * 0.6 + group._breathPhase * 0.5) * 0.018;
        const rimHoverBoost =
          isHover && !isProx
            ? (1 - dist / HOVER_DIST) * (isHero ? 0.07 : 0.05)
            : 0;
        const rimProxBoost = isProx
          ? (1 - dist / PROX_DIST) * (isHero ? 0.16 : 0.12)
          : 0;
        // Snap spike: when just entering proximity, rim flares bright then settles
        const rimSnap = Math.max(0, group._snapScale) * (isHero ? 0.5 : 0.4);
        group._rimMesh.material.opacity =
          rimBase + rimBreath + rimHoverBoost + rimProxBoost + rimSnap;
      }

      // ── EMISSIVE CORNICE — breathes + hover boost ────────────────────────────
      if (darkMat && darkMat.emissive) {
        const emBreath = 0.5 + Math.sin(now * 0.45 + group._breathPhase) * 0.5;
        const emHoverBoost = isHover
          ? (1 - dist / HOVER_DIST) * (isHero ? 0.6 : 0.4)
          : 0;
        darkMat.emissiveIntensity =
          0.55 + emBreath * (isClose ? 0.9 : 0.3) + emHoverBoost;
      }

      // ── VERTICAL ENERGY COLUMN ────────────────────────────────────────────────
      if (!group._energyCol) {
        const colGeo = new THREE.CylinderGeometry(
          0.08,
          0.6,
          building.height * 1.4,
          6,
          1,
          true,
        );
        const col = new THREE.Mesh(
          colGeo,
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(building.glowColor),
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        col.position.y = building.height * 0.7;
        group.add(col);
        group._energyCol = col;
      }
      const colTarget =
        dist < 22 ? ((22 - dist) / 22) * (isHero ? 0.35 : 0.22) : 0;
      group._energyCol.material.opacity +=
        (colTarget - group._energyCol.material.opacity) * 0.06;
      group._energyCol.scale.x =
        1 + Math.sin(now * 2.8 + building.pos[0]) * 0.3;
      group._energyCol.scale.z =
        1 + Math.sin(now * 2.8 + building.pos[0]) * 0.3;

      group.children.forEach((c) => {
        // ── PROXIMITY RING ─────────────────────────────────────────────────────
        if (c.userData.isProxRing) {
          const targetOp = isClose
            ? Math.max(0, (CLOSE_DIST - dist) / CLOSE_DIST) * 0.5
            : 0;
          c.material.opacity += (targetOp - c.material.opacity) * 0.08;
          if (isClose) {
            // Ring scale snaps with the spring — they pulse together
            const rs = 1 + Math.sin(now * 1.8) * 0.06 + group._snapScale * 0.3;
            c.scale.set(rs, 1, rs);
          }
        }

        // ── HERO RINGS ─────────────────────────────────────────────────────────
        if (c.userData.heroRing) {
          const ri = c.userData.ri;
          c.rotation.z = now * (0.45 + ri * 0.22);
          c.rotation.x = Math.sin(now * 0.3 + ri) * 0.3 + Math.PI / 2;
          if (isHover) {
            // Rings speed up even in hover zone — they "feel" your approach
            const hoverSpin = (1 - dist / HOVER_DIST) * 0.8;
            c.rotation.z += hoverSpin * ri * 0.15;
          }
          if (isClose) {
            const dx = carX - building.pos[0];
            const dz = carZ - building.pos[1];
            const tiltAmt = Math.max(0, (CLOSE_DIST - dist) / CLOSE_DIST) * 0.4;
            c.rotation.x += Math.atan2(dz, dist) * tiltAmt * 0.2;
          }
        }

        // ── ORB ────────────────────────────────────────────────────────────────
        if (c.userData.isOrb) {
          // Orb spins faster and grows when in hover zone, not just proximity
          const hoverEffect = isHover
            ? Math.max(0, (HOVER_DIST - dist) / HOVER_DIST)
            : 0;
          const orbSpeed = 0.9 + hoverEffect * 2.2;
          const orbScale = 1.0 + hoverEffect * 0.6 + Math.sin(now * 1.2) * 0.08;
          c.rotation.y = now * orbSpeed;
          c.rotation.x = Math.sin(now * 0.4) * 0.3;
          c.scale.setScalar(orbScale);
        }

        // ── POINT LIGHTS ───────────────────────────────────────────────────────
        if (c.isLight && c.type === "PointLight" && !c.userData.isLampLight) {
          const baseI = isHero
            ? this._isNight
              ? 4.5
              : 1.8
            : this._isNight
              ? 2.5
              : 1.0;
          // Light also responds to hover zone — dims up from far away
          const hoverBoost = isHover
            ? (1 - dist / HOVER_DIST) * (isHero ? 1.2 : 0.8)
            : 0;
          const proxBoost = isClose
            ? (1 - dist / CLOSE_DIST) * (isHero ? 3.5 : 2.0)
            : 0;
          const breathI = Math.sin(now * 0.9 + building.pos[0]) * 0.15;
          // Snap spike: light flares on zone entry then settles with spring
          const lightSnap =
            Math.max(0, group._snapScale) * (isHero ? 3.0 : 2.0);
          c.intensity = baseI + hoverBoost + proxBoost + breathI + lightSnap;
        }
      });
    });
  }

  // ── TEMPLE ENTRY BURST — called by Application when user enters ────────────
  // Spawns a ring expansion VFX at the building's ground position
  spawnEntryBurst(building) {
    const gc = parseInt((building.glowColor || "#ffcc44").replace("#", ""), 16);
    const s = this.scene;

    // 3 expanding rings at different speeds
    [0.8, 1.4, 2.2].forEach((speed, i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 1.0, 20),
        new THREE.MeshBasicMaterial({
          color: gc,
          transparent: true,
          opacity: 0.8 - i * 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(building.pos[0], 0.15, building.pos[1]);
      ring.userData.isBurst = true;
      ring.userData.speed = speed;
      ring.userData.life = 1.0;
      s.add(ring);
      this._entryBursts = this._entryBursts || [];
      this._entryBursts.push(ring);
    });
  }

  // Call this from updateBuildingEntities (or World._updateAmbients)
  updateEntryBursts() {
    if (!this._entryBursts) return;
    this._entryBursts = this._entryBursts.filter((ring) => {
      ring.userData.life -= 0.018;
      const s = (1 - ring.userData.life) * 28 * ring.userData.speed;
      ring.scale.set(s, 1, s);
      ring.material.opacity = ring.userData.life * 0.6;
      if (ring.userData.life <= 0) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
        return false;
      }
      return true;
    });
  }
}
