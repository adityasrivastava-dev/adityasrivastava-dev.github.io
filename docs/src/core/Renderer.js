// ── RENDERER — WebGLRenderer + EffectComposer post-processing pipeline ──────
//
// Desktop pipeline: RenderPass → UnrealBloomPass → combined PostFX (chroma + vignette)
// Mobile pipeline:  direct renderer.render() — no extra passes, preserves fill rate
//
import { EffectComposer }   from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass }       from 'three/examples/jsm/postprocessing/ShaderPass.js';

const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

// ── COMBINED POST-FX SHADER — one blit for chromatic aberration + vignette ──
// Chromatic aberration: splits RGB channels outward from center (speed feedback)
// Vignette: barrel-falloff darkens edges (Bruno's depth cue, zero DOM cost)
const PostFXShader = {
  uniforms: {
    tDiffuse: { value: null },
    uChroma:  { value: 0.0 },  // 0 = off → 0.008 = full speed
    uVig:     { value: 0.68 }, // vignette strength — constant subtle darkness
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uChroma;
    uniform float uVig;
    varying vec2 vUv;
    void main() {
      // Chromatic aberration: R shifted one way, B the other
      vec2 d = vUv - 0.5;
      vec4 cr = texture2D(tDiffuse, vUv - d * uChroma);
      vec4 cg = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv + d * uChroma);
      vec3 col = vec3(cr.r, cg.g, cb.b);
      // Barrel vignette: smooth circular falloff
      float v = 1.0 - dot(d * 1.38, d * 1.38);
      col *= pow(clamp(v, 0.0, 1.0), uVig);
      gl_FragColor = vec4(col, cg.a);
    }
  `,
};

export default class Renderer {
  constructor(canvas) {
    this.scene = new THREE.Scene();

    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: !IS_MOBILE,
      powerPreference: 'high-performance',
    });

    const maxPR = IS_MOBILE ? 1 : 2;
    this.instance.setPixelRatio(Math.min(devicePixelRatio, maxPR));
    this.instance.setSize(window.innerWidth, window.innerHeight);

    this.instance.shadowMap.enabled = !IS_MOBILE;
    if (!IS_MOBILE) this.instance.shadowMap.type = THREE.PCFSoftShadowMap;

    // ACESFilmicToneMapping: industry standard for cinematic rendering.
    // Reinhard crushes highlights and muddies midtones.
    // ACES rolls highlights off naturally — why film looks like film.
    // outputEncoding stays LinearEncoding (default) — sRGBEncoding causes
    // double gamma with EffectComposer's final ShaderPass blit.
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 0.58;

    // Warm the renderer (prevents white flash on first real frame)
    this.instance.render(new THREE.Scene(), new THREE.PerspectiveCamera());

    // Post-processing: desktop only — mobile lacks the fill-rate budget
    if (!IS_MOBILE) {
      this._buildComposer();
    }
  }

  _buildComposer() {
    const W = window.innerWidth, H = window.innerHeight;

    this._composer = new EffectComposer(this.instance);

    // Pass 1 — render scene to internal render target
    // Camera is set in render() each frame so it always matches the live camera
    this._renderPass = new RenderPass(this.scene, new THREE.PerspectiveCamera());
    this._composer.addPass(this._renderPass);

    // Pass 2 — selective bloom
    // threshold 0.92: only true emissives bloom (orbs, point lights, gold trim).
    // Sandstone roads peak at ~0.85 luminance under ACES — safely below threshold.
    // strength 0.10, radius 0.55: subtle halo, never washes the scene.
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(W, H),
      0.10,  // strength — was 0.38, caused full-scene whitewash
      0.55,  // radius
      0.92,  // luminance threshold
    );
    this._composer.addPass(this._bloomPass);

    // Pass 3 — chromatic aberration + vignette (one blit, two effects)
    this._fxPass = new ShaderPass(PostFXShader);
    this._fxPass.renderToScreen = true;
    this._composer.addPass(this._fxPass);
  }

  render(camera) {
    if (this._composer) {
      // Sync the render pass camera every frame
      this._renderPass.camera = camera.instance;
      this._composer.render();
    } else {
      this.instance.render(this.scene, camera.instance);
    }
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.instance.setSize(W, H);
    if (this._composer) {
      this._composer.setSize(W, H);
      if (this._bloomPass) this._bloomPass.resolution.set(W, H);
    }
  }

  setExposure(v) {
    this.instance.toneMappingExposure = v;
  }

  // Called by Camera.js each frame — drives chromatic aberration with speed
  setChromaticIntensity(v) {
    if (this._fxPass) this._fxPass.uniforms.uChroma.value = v;
  }
}
