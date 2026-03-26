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
  FOV_MIN: 42, // tighter at rest = more "toy world" read
  FOV_MAX: 72, // less extreme at speed (was 82)
  CAMERA_DISTANCE_MIN: 14, // further back at rest = more world visible
  CAMERA_DISTANCE_MAX: 38, // further at speed (proportional)
  CAMERA_HEIGHT_MIN: 10, // higher at rest — isometric diorama feel (was 4)
  CAMERA_HEIGHT_MAX: 20, // higher at speed (was 14)
  LOOK_AHEAD_MIN: 4,
  LOOK_AHEAD_MAX: 18,
  SPRING_K: 12.0, // slightly softer spring at higher height
  SPRING_D: 9.0,
  Y_SPRING_K: 5.5, // softer Y so high camera doesn't bounce
  Y_SPRING_D: 5.0,
  TILT_FACTOR: -0.35, // less tilt at high camera (less noticeable)
  FOCUS_DIST: 18,
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
