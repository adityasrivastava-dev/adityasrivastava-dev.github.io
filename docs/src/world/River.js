// River.js — Branching river system with animated water surface
// Main river: sinuous E-W path through city center
// Tributary: branches northward from main river, creating island districts

export default class River {
  constructor(scene) {
    this.scene = scene;
    this._shimmers = [];
  }

  build() {
    this._buildMainRiver();
    this._buildTributary();
    this._buildBoat();
  }

  // Item 47: River boat — simple flat-bottomed wooden rowboat drifting eastward
  _buildBoat() {
    const tg = window._toonGrad;
    const hullMat  = new THREE.MeshToonMaterial({ color: 0x8a5a2a, gradientMap: tg });
    const sailMat  = new THREE.MeshToonMaterial({ color: 0xf0d890, gradientMap: tg });
    const mast     = new THREE.MeshToonMaterial({ color: 0x6a3a10, gradientMap: tg });

    this._boat = new THREE.Group();
    // Hull — flat box with slight bow taper
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 2.8), hullMat);
    hull.position.y = -0.25;
    this._boat.add(hull);
    // Bow point
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.8, 4), hullMat);
    bow.rotation.z = -Math.PI / 2;
    bow.position.set(4.2, -0.1, 0);
    this._boat.add(bow);
    // Mast
    const mastMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4, 5), mast);
    mastMesh.position.set(-0.5, 2.1, 0);
    this._boat.add(mastMesh);
    // Sail
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.0), sailMat);
    sail.position.set(0.2, 2.1, 0);
    sail.rotation.y = Math.PI / 2;
    this._boat.add(sail);

    this._boat.position.set(-140, -0.1, -10);
    this._boat.rotation.y = 0.15; // slight angle to current
    this.scene.add(this._boat);
  }

  // Build a flat ribbon mesh along 2D control points [x,z] at a given Y level
  _ribbon(pts2d, y, width, mat) {
    const curve = new THREE.CatmullRomCurve3(
      pts2d.map(([x, z]) => new THREE.Vector3(x, y, z))
    );
    const N = 80;
    const sampled = curve.getPoints(N);
    const verts = new Float32Array((N + 1) * 6);
    const idx = [];

    for (let i = 0; i <= N; i++) {
      const p = sampled[i];
      const a = sampled[Math.max(0, i - 1)];
      const b = sampled[Math.min(N, i + 1)];
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const L = Math.sqrt(tx * tx + tz * tz) || 1;
      // Perpendicular in XZ plane (river width direction)
      const nx = -tz / L;
      const nz =  tx / L;
      const hw = width * 0.5;
      verts[i * 6]     = p.x - nx * hw;
      verts[i * 6 + 1] = y;
      verts[i * 6 + 2] = p.z - nz * hw;
      verts[i * 6 + 3] = p.x + nx * hw;
      verts[i * 6 + 4] = y;
      verts[i * 6 + 5] = p.z + nz * hw;
    }

    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, b, c, b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    return mesh;
  }

  _buildMainRiver() {
    // Sinuous E-W river crossing through city — passes between z=+5 and z=-25
    // Crosses all N-S arteries (x=0, ±112, ±145) creating bridge opportunities
    const path = [
      [-225, -8], [-165, -3], [-110, -9], [-55, -5],
      [0, -12], [55, -7], [108, -4], [158, -13], [225, -18],
    ];

    // Mud bank (widest layer, below everything) — widened from 32 to 48
    this._ribbon(path, -0.32, 48, new THREE.MeshLambertMaterial({ color: 0x7a5535 }));
    // Dark water body — widened from 22 to 42
    this._ribbon(path, -0.22, 42, new THREE.MeshLambertMaterial({ color: 0x1a5068 }));
    // Animated shimmer surface
    const shim = this._ribbon(path, -0.14, 36,
      new THREE.MeshBasicMaterial({
        color: 0x2988b8, transparent: true, opacity: 0.72, depthWrite: false,
      }));
    this._shimmers.push({ mesh: shim, phase: 0 });

    // ── GHATS — 3 stepped sandstone terraces on south bank ───────────────────
    // Each ghat descends toward water: step 0 = highest (furthest from water),
    // step 2 = lowest (at water's edge). South bank of main river is at z≈-22.
    const ghatMat = new THREE.MeshLambertMaterial({ color: 0xd4b870 }); // warm sandstone
    const ghatXPositions = [-160, -85, -15, 55, 125, 180];
    ghatXPositions.forEach(gx => {
      for (let step = 0; step < 3; step++) {
        const ghat = new THREE.Mesh(
          new THREE.BoxGeometry(18, 0.42, 3.8),
          ghatMat,
        );
        // South bank: each step descends toward water
        ghat.position.set(gx, -0.32 + step * 0.38, -18 - step * 4.2);
        this.scene.add(ghat);
      }
      // Ghat end walls (small vertical slabs at each side)
      for (const ox of [-9, 9]) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.6, 12),
          ghatMat,
        );
        wall.position.set(gx + ox, -0.1, -24);
        this.scene.add(wall);
      }
    });
  }

  _buildTributary() {
    // Tributary branching from main river at x≈-35, flowing N toward city north
    // Crosses E-W boulevards at z=0 and z=56
    const path = [
      [-35, -10], [-30, 12], [-24, 38], [-18, 60],
      [-12, 84], [-5, 106], [0, 120],
    ];

    this._ribbon(path, -0.32, 22, new THREE.MeshLambertMaterial({ color: 0x7a5535 }));
    this._ribbon(path, -0.22, 16, new THREE.MeshLambertMaterial({ color: 0x1a5068 }));
    const shim = this._ribbon(path, -0.14, 13,
      new THREE.MeshBasicMaterial({
        color: 0x2988b8, transparent: true, opacity: 0.72, depthWrite: false,
      }));
    this._shimmers.push({ mesh: shim, phase: 1.8 });
  }

  update(now) {
    // Item 17: more dramatic animated shimmer — multi-frequency pulse
    this._shimmers.forEach(({ mesh, phase }) => {
      const primary   = Math.sin(now * 0.68 + phase) * 0.22;
      const secondary = Math.sin(now * 1.45 + phase * 1.7) * 0.10;
      const flicker   = Math.sin(now * 3.1  + phase * 2.3) * 0.05;
      mesh.material.opacity = Math.max(0.30, Math.min(0.95, 0.62 + primary + secondary + flicker));
    });

    // Item 47: Boat drifts eastward, gentle bob
    if (this._boat) {
      this._boat.position.x = -140 + (now * 2.5) % 380; // wrap after 380 units
      this._boat.position.y = -0.1 + Math.sin(now * 0.55) * 0.12;
      this._boat.rotation.z = Math.sin(now * 0.38) * 0.04;
    }
  }
}
