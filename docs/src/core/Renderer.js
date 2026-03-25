// ── RENDERER — THREE.Scene, WebGLRenderer, render, resize. No camera logic. ─

const IS_MOBILE =
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  window.innerWidth < 768;

export default class Renderer {
  constructor(canvas) {
    this.scene = new THREE.Scene();

    this.instance = new THREE.WebGLRenderer({
      canvas,
      // antialias off on mobile — single biggest visual vs performance tradeoff.
      // Mobile GPUs fill pixels at 2x pixelRatio anyway; MSAA doubles that cost.
      antialias: !IS_MOBILE,
      // powerPreference: high-performance tells the OS to use the dGPU on laptops
      // and prevents mobile browsers from switching to battery-saver mode mid-game.
      powerPreference: "high-performance",
    });

    // Mobile: cap at 1× pixel ratio. Desktop: cap at 2×.
    // At 3× (iPhone 15 Pro), rendering 9× the pixels of 1×.
    // Dropping to 1× on mobile gives 9× fewer pixels to shade — biggest win.
    const maxPR = IS_MOBILE ? 1 : 2;
    this.instance.setPixelRatio(Math.min(devicePixelRatio, maxPR));
    this.instance.setSize(window.innerWidth, window.innerHeight);

    // Shadow maps: off on mobile — PCFSoft shadow maps require a separate render
    // pass per shadow-casting light. On mobile this can halve the framerate.
    // The scene uses blob shadows (CircleGeometry planes) as fallback — looks fine.
    this.instance.shadowMap.enabled = !IS_MOBILE;
    if (!IS_MOBILE) {
      this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.instance.toneMapping = THREE.ReinhardToneMapping;
    this.instance.toneMappingExposure = 1.15;

    // Kick once to prevent white flash on load
    this.instance.render(new THREE.Scene(), new THREE.PerspectiveCamera());
  }

  render(camera) {
    this.instance.render(this.scene, camera.instance);
  }

  resize() {
    const W = window.innerWidth,
      H = window.innerHeight;
    this.instance.setSize(W, H);
  }

  setExposure(v) {
    this.instance.toneMappingExposure = v;
  }
}
