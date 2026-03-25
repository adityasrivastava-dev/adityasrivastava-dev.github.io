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
  update() {
    const k = this._keys;
    const tj = this.touchAxis;

    this.forward = !!(k['ArrowUp']    || k['KeyW'] || tj.ay < -0.25);
    this.brake   = !!(k['ArrowDown']  || k['KeyS'] || k['Space'] || tj.ay > 0.25);
    this.left    = !!(k['ArrowLeft']  || k['KeyA'] || tj.ax < -0.25);
    this.right   = !!(k['ArrowRight'] || k['KeyD'] || tj.ax > 0.25);
    this.enter   = !!(k['KeyE']);
    this.map     = !!(k['KeyM']);
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
    if (Math.abs(this.touchAxis.ax) > 0.15) return -this.touchAxis.ax;
    if (this.left)  return  1;
    if (this.right) return -1;
    return 0;
  }
}
