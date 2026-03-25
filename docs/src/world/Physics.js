// ── PHYSICS — pure simulation math. No input, no UI, no rendering. ───────────
// Takes a state snapshot + input snapshot, returns next state.
// tick-rate aware: caller passes dt, physics scales forces accordingly.
import { Car as C } from '../utils/constants.js';

export default class Physics {
  /**
   * Advance one physics sub-step.
   *
   * Implements a bicycle model:
   *   - Single front-axle steering pivot
   *   - Longitudinal force from engine / brake
   *   - Lateral grip constraint (prevents sliding at low speed)
   *   - Handbrake reduces lat grip -> controlled oversteer possible
   *
   * @param {Object} state  { vx, vz, angle, steerAngle }
   * @param {Object} input  { throttle, reverse, steerRaw, handbrake }
   * @param {number} grip   weather multiplier: 1.0=dry 0.3=rain 0.12=snow
   * @param {number} dt     delta-time in seconds (tick-rate aware)
   * @returns {Object}      new { vx, vz, angle, steerAngle, speed }
   */
  step(state, input, grip = 1.0, dt = 0.016) {
    let { vx, vz, angle, steerAngle } = state;
    const { throttle, reverse, steerRaw, handbrake } = input;

    // Scale factor — physics forces authored at 60fps, scale for actual dt
    const dtScale = dt * 60;

    // ── TRIG CACHE ─────────────────────────────────────────────────────────
    const sinA   = Math.sin(angle);
    const cosA   = Math.cos(angle);
    const velMag = Math.hypot(vx, vz);

    // Project velocity onto car axes
    const fwdVel = vx * sinA + vz * cosA;   // +forward, -reverse
    const latVel = vx * cosA - vz * sinA;   // lateral slip

    // ── STEERING — speed-sensitive authority ────────────────────────────────
    // High speed = reduced steer authority (stability)
    // Low speed  = full steer authority (maneuverability)
    const speedRatio  = Math.min(1, velMag / C.MAX_SPEED);
    const steerAuth   = C.MAX_STEER_ANGLE * (1.0 - speedRatio * 0.45);
    const steerTarget = steerRaw * steerAuth;
    const steerLerp   = steerRaw !== 0
      ? Math.min(1, C.STEER_RATE * dtScale)
      : Math.min(1, C.STEER_RELEASE * dtScale);

    steerAngle += (steerTarget - steerAngle) * steerLerp;
    if (Math.abs(steerAngle) < 0.00035) steerAngle = 0;

    // ── YAW — rotate heading proportional to steer and speed ───────────────
    // Only yaw when moving — stationary cars don't spin
    if (velMag > 0.004) {
      const fwdSign = Math.sign(fwdVel);
      // Turn radius shrinks at low speed (tighter), grows at high speed
      const turnRate = steerAngle * fwdSign * dtScale;
      angle += turnRate;
    }

    const newSinA = Math.sin(angle);
    const newCosA = Math.cos(angle);

    // ── ENGINE / BRAKE FORCES ───────────────────────────────────────────────
    let accel = 0;
    if (throttle > 0 && fwdVel < C.MAX_SPEED) {
      // Torque curve: strong launch punch, slight taper above mid-range
      // This creates the "instant acceleration feel" from the spec
      const spd01 = fwdVel / C.MAX_SPEED;
      const torque = spd01 < 0.12 ? 1.8      // launch burst
                   : spd01 < 0.55 ? 1.3      // mid-range pull
                   : 0.85;                    // high-speed taper
      accel = C.ACCELERATION * torque * (0.55 + grip * 0.45) * throttle * dtScale;
    } else if (reverse > 0 && fwdVel > -C.MAX_SPEED * C.REV_MAX_RATIO) {
      accel = -C.ACCELERATION * 0.55 * grip * reverse * dtScale;
    } else if (handbrake) {
      // Handbrake: strong decel, but keep lateral slip for drift feel
      accel = -Math.sign(fwdVel) * C.BRAKE_FORCE * 1.6 * dtScale;
    }

    // ── LONGITUDINAL FRICTION ───────────────────────────────────────────────
    // Rolling resistance always opposes forward motion
    const longFric = Math.min(1, C.LONG_FRICTION * (0.4 + grip * 0.6) * dtScale);
    let newFwd = (fwdVel + accel) * (1 - longFric);
    if (Math.abs(newFwd) < 0.0006) newFwd = 0;

    // ── LATERAL GRIP FRICTION ───────────────────────────────────────────────
    // Handbrake = 18% grip (controlled slide possible)
    // Normal    = 78% grip (sticky tires, snappy cornering)
    const latGripFactor = handbrake ? 0.18 : 1.0;
    const latFric = Math.min(1, C.LAT_FRICTION * latGripFactor * grip * 0.85 * dtScale);
    const newLat  = latVel * (1 - latFric);

    // ── RECONSTRUCT WORLD VELOCITY ──────────────────────────────────────────
    vx = newSinA * newFwd + newCosA * newLat;
    vz = newCosA * newFwd - newSinA * newLat;

    // ── SPEED CLAMP ─────────────────────────────────────────────────────────
    const mag = Math.hypot(vx, vz);
    if (mag > C.MAX_SPEED) {
      vx *= C.MAX_SPEED / mag;
      vz *= C.MAX_SPEED / mag;
    }

    return {
      vx, vz, angle, steerAngle,
      speed:  Math.hypot(vx, vz),
      fwdVel: newFwd,   // exposed for audio/visuals
      latVel: newLat,   // exposed for tilt/slide VFX
    };
  }

  /**
   * Run multiple sub-steps for high-precision simulation.
   * Called by Car when tick rate demands higher accuracy (fast + tight corners).
   */
  multiStep(state, input, grip, dt, subSteps) {
    const subDt = dt / subSteps;
    let s = state;
    for (let i = 0; i < subSteps; i++) {
      s = this.step(s, input, grip, subDt);
    }
    return s;
  }
}
