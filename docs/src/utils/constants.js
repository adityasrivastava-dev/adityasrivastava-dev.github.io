// ── CONSTANTS — single source of truth for all tuning values ─────────────────

export const Car = {
  MAX_SPEED: 0.45, // was 0.95 — slower = more navigable, easier on mobile
  ACCELERATION: 0.014, // was 0.018 — gentler ramp, less overshoot on mobile
  BRAKE_FORCE: 0.028,
  LONG_FRICTION: 0.012, // slightly more rolling resistance at lower speed
  LAT_FRICTION: 0.78,
  STEER_RATE: 0.32,
  STEER_RELEASE: 0.22,
  MAX_STEER_ANGLE: 0.065, // slightly wider turn radius feels better at low speed
  REV_MAX_RATIO: 0.4,
  HW: 0.85,
  HD: 1.3,
};

export const CameraC = {
  FOV_MIN: 48,
  FOV_MAX: 82, // was 90 — tighter max FOV at lower speed cap
  CAMERA_DISTANCE_MIN: 8,
  CAMERA_DISTANCE_MAX: 32, // was 38 — proportional to new MAX_SPEED
  CAMERA_HEIGHT_MIN: 4,
  CAMERA_HEIGHT_MAX: 14,
  LOOK_AHEAD_MIN: 3,
  LOOK_AHEAD_MAX: 20,
  SPRING_K: 14.0,
  SPRING_D: 9.5,
  Y_SPRING_K: 6.5,
  Y_SPRING_D: 5.5,
  TILT_FACTOR: -0.45,
  FOCUS_DIST: 22,
  TRANS_DUR: 1.4,
};

export const World = {
  PROXIMITY_RADIUS: 32,
  ROAD_WIDTH: 14,
  WORLD_SCALE: 2.5,
  WORLD_X_MIN: -220,
  WORLD_X_MAX: 220,
  WORLD_Z_MIN: -200,
  WORLD_Z_MAX: 140,
  TEMPLE_ENTRY_ZONE: 28,
};

export const Tick = {
  BASE_RATE: 60,
  MIN_RATE: 20,
  MAX_RATE: 120,
  MAX_DT: 0.05,
  HIGH_SPEED_RATIO: 0.65,
  LOW_SPEED_RATIO: 0.15,
  RAMP_UP_RATE: 0.15,
  RAMP_DOWN_RATE: 0.08,
  FOCUS_FREEZE_DT: 0.016,
};
