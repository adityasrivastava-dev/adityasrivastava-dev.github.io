// ── CONSTANTS — single source of truth for all tuning values ─────────────────

export const Car = {
  MAX_SPEED: 0.62,
  ACCELERATION: 0.020,
  BRAKE_FORCE: 0.028,
  LONG_FRICTION: 0.016,
  LAT_FRICTION: 0.60,  // looser slides = Bruno-style fun
  STEER_RATE: 0.32,
  STEER_RELEASE: 0.20,
  MAX_STEER_ANGLE: 0.11, // wider arc — easier to drift around buildings
  REV_MAX_RATIO: 0.4,
  HW: 0.85,
  HD: 1.3,
};

export const CameraC = {
  FOV_MIN: 52,  // natural follow-cam FOV — shows road ahead
  FOV_MAX: 75,  // wide at speed = cinematic rush
  CAMERA_DISTANCE_MIN: 52,
  CAMERA_DISTANCE_MAX: 88,
  CAMERA_HEIGHT_MIN: 38,
  CAMERA_HEIGHT_MAX: 58,
  LOOK_AHEAD_MIN: 18,
  LOOK_AHEAD_MAX: 40,
  SPRING_K: 14.0, // ζ=0.67 underdamped → natural overshoot on hard turns
  SPRING_D: 5.0,
  Y_SPRING_K: 6.0,
  Y_SPRING_D: 4.0,
  TILT_FACTOR: -0.35,
  FOCUS_DIST: 55,
  TRANS_DUR: 1.4,
};

export const World = {
  PROXIMITY_RADIUS: 36,
  ROAD_WIDTH: 20,
  WORLD_SCALE: 2.5,
  WORLD_X_MIN: -570,
  WORLD_X_MAX: 570,
  WORLD_Z_MIN: -430,
  WORLD_Z_MAX: 490,
  TEMPLE_ENTRY_ZONE: 32,
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
