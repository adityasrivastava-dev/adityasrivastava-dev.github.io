// ── CollisionManager — centralized world collision registry + spatial grid ────
// All static world objects register here during scene construction.
// Car queries this before each movement step.
// Broad phase: O(1) spatial hash grid (cell=40 units).
// Narrow phase: AABB-vs-Circle and AABB-vs-AABB.

const CELL = 40;

class CollisionManager {
  constructor() {
    this._colliders = [];
    this._grid = {};
    this._debugMeshes = [];
    this._debugScene = null;
    this.debugEnabled = false;
    this._idCounter = 0;
  }

  // ── REGISTRATION ─────────────────────────────────────────────────────────
  // circle: { type:'circle', x, z, r, id? }
  // box:    { type:'box',    x, z, hw, hd, id? }  hw=half-width X, hd=half-depth Z
  register(opts) {
    const c = { id: opts.id ?? `col_${this._idCounter++}`, ...opts };
    this._colliders.push(c);
    this._gridInsert(c);
    if (this.debugEnabled && this._debugScene) this._debugDraw(c);
    return c;
  }

  // Convenience: register all buildings from window.CITY_DATA
  registerBuildings() {
    const buildings = window.CITY_DATA?.buildings;
    if (!buildings) return;
    for (const b of buildings) {
      const hw = ((b.size?.[0] ?? 8) / 2) + 0.8;
      const hd = ((b.size?.[1] ?? 8) / 2) + 0.8;
      this.register({ id: b.id, type: 'box', x: b.pos[0], z: b.pos[1], hw, hd });
    }
  }

  // ── SPATIAL GRID ─────────────────────────────────────────────────────────
  _key(cx, cz) { return `${cx},${cz}`; }

  _gridInsert(c) {
    const r = c.type === 'circle' ? c.r : Math.sqrt(c.hw * c.hw + c.hd * c.hd);
    const x0 = Math.floor((c.x - r) / CELL);
    const x1 = Math.floor((c.x + r) / CELL);
    const z0 = Math.floor((c.z - r) / CELL);
    const z1 = Math.floor((c.z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        (this._grid[k] ??= []).push(c);
      }
    }
  }

  // Broad phase — all colliders whose cells overlap (x±radius, z±radius)
  getNearby(x, z, radius) {
    const x0 = Math.floor((x - radius) / CELL);
    const x1 = Math.floor((x + radius) / CELL);
    const z0 = Math.floor((z - radius) / CELL);
    const z1 = Math.floor((z + radius) / CELL);
    const seen = new Set();
    const out = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const cell = this._grid[this._key(cx, cz)];
        if (!cell) continue;
        for (const c of cell) {
          if (!seen.has(c)) { seen.add(c); out.push(c); }
        }
      }
    }
    return out;
  }

  // ── NARROW PHASE ─────────────────────────────────────────────────────────
  // Car is an AABB centred at (cx, cz) with half-extents (hw, hd).
  _overlaps(cx, cz, hw, hd, c) {
    if (c.type === 'circle') {
      // AABB vs Circle: closest point on AABB to circle centre, then distance test
      const nearX = Math.max(cx - hw, Math.min(cx + hw, c.x));
      const nearZ = Math.max(cz - hd, Math.min(cz + hd, c.z));
      const dx = nearX - c.x, dz = nearZ - c.z;
      return dx * dx + dz * dz < c.r * c.r;
    }
    if (c.type === 'box') {
      return cx - hw < c.x + c.hw && cx + hw > c.x - c.hw &&
             cz - hd < c.z + c.hd && cz + hd > c.z - c.hd;
    }
    return false;
  }

  // Main query: does car AABB at (cx, cz) overlap any collider?
  // Returns first hit collider or null.
  testPoint(cx, cz, hw, hd) {
    const radius = Math.max(hw, hd) + 5;
    const nearby = this.getNearby(cx, cz, radius);
    for (const c of nearby) {
      if (this._overlaps(cx, cz, hw, hd, c)) return c;
    }
    return null;
  }

  get count() { return this._colliders.length; }

  // ── DEBUG VISUALISATION ───────────────────────────────────────────────────
  enableDebug(scene) {
    this._debugScene = scene;
    this.debugEnabled = true;
    for (const c of this._colliders) this._debugDraw(c);
  }

  disableDebug() {
    this.debugEnabled = false;
    for (const m of this._debugMeshes) this._debugScene?.remove(m);
    this._debugMeshes = [];
    this._debugScene = null;
  }

  _debugDraw(c) {
    if (!this._debugScene) return;
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, depthTest: false });
    const pts = [];
    if (c.type === 'circle') {
      const segs = 20;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(c.x + Math.cos(a) * c.r, 0.6, c.z + Math.sin(a) * c.r));
      }
    } else {
      const { x, z, hw, hd } = c;
      pts.push(
        new THREE.Vector3(x - hw, 0.6, z - hd),
        new THREE.Vector3(x + hw, 0.6, z - hd),
        new THREE.Vector3(x + hw, 0.6, z + hd),
        new THREE.Vector3(x - hw, 0.6, z + hd),
        new THREE.Vector3(x - hw, 0.6, z - hd),
      );
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    this._debugScene.add(line);
    this._debugMeshes.push(line);
  }
}

export const CM = new CollisionManager();
export default CM;
