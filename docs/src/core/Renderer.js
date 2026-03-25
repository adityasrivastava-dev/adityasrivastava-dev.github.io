// ── RENDERER — THREE.Scene, WebGLRenderer, render, resize. No camera logic. ─

export default class Renderer {
  constructor(canvas) {
    this.scene = new THREE.Scene();

    this.instance = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.instance.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.instance.setSize(window.innerWidth, window.innerHeight);
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.instance.toneMapping       = THREE.ReinhardToneMapping;
    this.instance.toneMappingExposure = 1.15;

    // Kick once to prevent white flash on load
    this.instance.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  }

  render(camera) {
    this.instance.render(this.scene, camera.instance);
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.instance.setSize(W, H);
  }

  setExposure(v) {
    this.instance.toneMappingExposure = v;
  }
}
