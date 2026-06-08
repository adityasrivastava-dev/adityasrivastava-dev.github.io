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

    // Mud bank (widest layer, below everything)
    this._ribbon(path, -0.32, 32, new THREE.MeshLambertMaterial({ color: 0x7a5535 }));
    // Dark water body
    this._ribbon(path, -0.22, 22, new THREE.MeshLambertMaterial({ color: 0x1a5068 }));
    // Animated shimmer surface (MeshBasicMaterial = emissive-like, won't bloom at these values)
    const shim = this._ribbon(path, -0.14, 19,
      new THREE.MeshBasicMaterial({
        color: 0x2988b8, transparent: true, opacity: 0.72, depthWrite: false,
      }));
    this._shimmers.push({ mesh: shim, phase: 0 });
  }

  _buildTributary() {
    // Tributary branching from main river at x≈-35, flowing N toward city north
    // Crosses E-W boulevards at z=0 and z=56
    const path = [
      [-35, -10], [-30, 12], [-24, 38], [-18, 60],
      [-12, 84], [-5, 106], [0, 120],
    ];

    this._ribbon(path, -0.32, 18, new THREE.MeshLambertMaterial({ color: 0x7a5535 }));
    this._ribbon(path, -0.22, 13, new THREE.MeshLambertMaterial({ color: 0x1a5068 }));
    const shim = this._ribbon(path, -0.14, 11,
      new THREE.MeshBasicMaterial({
        color: 0x2988b8, transparent: true, opacity: 0.72, depthWrite: false,
      }));
    this._shimmers.push({ mesh: shim, phase: 1.8 });
  }

  update(now) {
    // Breathe water surface shimmer — slow sinusoidal opacity shift
    this._shimmers.forEach(({ mesh, phase }) => {
      mesh.material.opacity = 0.62 + Math.sin(now * 0.62 + phase) * 0.16;
    });
  }
}
