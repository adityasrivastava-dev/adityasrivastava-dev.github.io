// ── CONSTANTS — single source of truth for all tuning values ─────────────────

export const Car = {
  MAX_SPEED:       0.95,
  ACCELERATION:    0.018,     // instant punch on throttle
  BRAKE_FORCE:     0.028,     // hard, immediate stop
  LONG_FRICTION:   0.009,     // rolling resistance
  LAT_FRICTION:    0.78,      // tire grip (prevents sliding)
  STEER_RATE:      0.32,      // how fast steer angle builds
  STEER_RELEASE:   0.22,      // how fast steer returns to center
  MAX_STEER_ANGLE: 0.058,     // max wheel deflection (radians)
  REV_MAX_RATIO:   0.4,       // reverse speed = 40% of forward max
  HW:              0.85,      // collision half-width
  HD:              1.3,       // collision half-depth
};

export const CameraC = {
  FOV_MIN:              48,   // FOV at rest
  FOV_MAX:              90,   // FOV at max speed
  CAMERA_DISTANCE_MIN:  8,    // follow distance at rest
  CAMERA_DISTANCE_MAX:  38,   // follow distance at max speed
  CAMERA_HEIGHT_MIN:    4,    // height at rest (low, intimate)
  CAMERA_HEIGHT_MAX:    15,   // height at max speed (high, cinematic)
  LOOK_AHEAD_MIN:       3,    // look-ahead at rest
  LOOK_AHEAD_MAX:       25,   // look-ahead at max speed
  SPRING_K:             14.0, // camera spring stiffness
  SPRING_D:             9.5,  // camera spring damping
  Y_SPRING_K:           6.5,
  Y_SPRING_D:           5.5,
  TILT_FACTOR:         -0.45, // turn tilt amount
  FOCUS_DIST:           22,   // distance when focusing on building
  TRANS_DUR:            1.4,  // focus transition duration (seconds)
};

export const World = {
  PROXIMITY_RADIUS:  32,      // units — when notification appears
  ROAD_WIDTH:        14,      // wider roads for bigger world feel
  WORLD_SCALE:       2.5,     // multiplier applied to road/tree layout
  WORLD_X_MIN:      -220,     // world boundary
  WORLD_X_MAX:       220,
  WORLD_Z_MIN:      -200,
  WORLD_Z_MAX:       140,
  TEMPLE_ENTRY_ZONE: 28,
};

// ── TICK SYSTEM CONSTANTS ─────────────────────────────────────────────────────
export const Tick = {
  BASE_RATE:         60,      // target Hz — physics simulation rate
  MIN_RATE:          20,      // never drop below this
  MAX_RATE:          120,     // never exceed this
  MAX_DT:            0.05,    // clamp dt to prevent spiral of death
  // Dynamic precision thresholds
  HIGH_SPEED_RATIO:  0.65,    // above this speed ratio -> increase precision
  LOW_SPEED_RATIO:   0.15,    // below this -> safe to reduce
  RAMP_UP_RATE:      0.15,    // how fast tick rate increases (per second)
  RAMP_DOWN_RATE:    0.08,    // how fast tick rate decreases (per second)
  FOCUS_FREEZE_DT:   0.016,   // fixed dt used when camera is in FOCUS state
};
