// ── GAME STATE — data only. No functions allowed. ────────────────────────────
// Read by any system. Written only by the main update loop.

const GameState = {
  focusedTempleId: null,    // string | null — temple currently in FOCUS camera state
  proximityTempleId: null,  // string | null — nearest temple within PROXIMITY_RADIUS
  mode: 'IDLE',             // 'IDLE' | 'ROAM' | 'FOCUS' | 'MAP'
};

export default GameState;
