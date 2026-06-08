// ── INPUT CONTROLLER — keyboard state only, no physics or movement ───────────

export default class InputController {
  constructor() {
    this._keys = {};

    // Output flags — read by Car.js each frame
    this.forward = false;
    this.brake   = false;
    this.left    = false;
    this.right   = false;
    this.enter   = false;   // 'E' — enter nearest temple
    this.map     = false;   // 'M' — toggle map

    // Touch joystick support (populated by mobile UI if present)
    this.touchAxis = { ax: 0, ay: 0 };

    // Smoothed steer — lerped each frame so keyboard doesn't snap to ±1 instantly
    this._steerSmooth = 0;

    this._bindListeners();
  }

  _bindListeners() {
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      // Prevent scroll on arrow keys / space
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', e => {
      this._keys[e.code] = false;
    });
  }

  /** Called once per frame — converts raw key state to named flags */
  update(dt = 0.016) {
    const k = this._keys;
    const tj = this.touchAxis;

    this.forward = !!(k['ArrowUp']    || k['KeyW'] || tj.ay < -0.25);
    this.brake   = !!(k['ArrowDown']  || k['KeyS'] || k['Space'] || tj.ay > 0.25);
    this.left    = !!(k['ArrowLeft']  || k['KeyA'] || tj.ax < -0.25);
    this.right   = !!(k['ArrowRight'] || k['KeyD'] || tj.ax > 0.25);
    this.enter   = !!(k['KeyE']);
    this.map     = !!(k['KeyM']);

    // Smooth keyboard steer so it doesn't snap to ±1 digitally.
    // Analog joystick bypasses smoothing — it's already continuous.
    if (Math.abs(tj.ax) > 0.15) {
      this._steerSmooth = -tj.ax;
    } else {
      const rawSteer = this.left ? 1 : this.right ? -1 : 0;
      // Attack: 0.12s to full steer (6 frames at 60fps); release: 0.08s
      const rate = rawSteer !== 0 ? dt / 0.12 : dt / 0.08;
      this._steerSmooth += (rawSteer - this._steerSmooth) * Math.min(1, rate * 60);
    }
  }

  /** Throttle value 0-1 for analog joystick support */
  get throttleAxis() {
    if (this.touchAxis.ay < -0.15) return Math.min(1, -this.touchAxis.ay / 0.6);
    return this.forward ? 1 : 0;
  }

  get reverseAxis() {
    if (this.touchAxis.ay > 0.15) return Math.min(1, this.touchAxis.ay / 0.6);
    return this.brake ? 1 : 0;
  }

  get steerAxis() {
    return this._steerSmooth;
  }
}
