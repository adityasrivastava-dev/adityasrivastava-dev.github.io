// ── AUDIO — spatial audio, ambient layers, engine sound, building tones ──────
// All Web Audio API logic lives here. No input, no rendering.

export default class Audio {
  constructor(events) {
    this.events  = events;
    this.ctx     = null;
    this.started = false;

    this._engOsc  = null;
    this._engGain = null;
    this._musicGain = null;

    this._ambientLayers  = {};
    this._buildingTones  = {};
    this._spatialEnabled = !(/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768);

    // Building audio profiles — frequencies and oscillator types
    this._profiles = {
      'surya-dwara':       { freq: 528, type: 'sine',     gain: 0.06 },
      'vishwakarma-shala': { freq: 220, type: 'sawtooth', gain: 0.05 },
      'brahma-kund':       { freq: 110, type: 'sine',     gain: 0.07 },
      'vayu-rath':         { freq: 396, type: 'triangle', gain: 0.055 },
      'lakshmi-prasad':    { freq: 639, type: 'sine',     gain: 0.06 },
      'akasha-mandapa':    { freq: 285, type: 'sine',     gain: 0.05 },
      'setu-nagara':       { freq: 174, type: 'triangle', gain: 0.055 },
      'pura-stambha':      { freq: 147, type: 'sine',     gain: 0.05 },
      'maya-sabha':        { freq: 432, type: 'triangle', gain: 0.055 },
      'jyotish-vedha':     { freq: 741, type: 'sine',     gain: 0.05 },
      'saraswati-vihar':   { freq: 852, type: 'triangle', gain: 0.06 },
      'gurukul-ashram':    { freq: 963, type: 'sine',     gain: 0.055 },
    };
  }

  // ── INIT (call on first user gesture) ────────────────────────────────────
  init() {
    if (this.started) return;
    this.started = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      window._audioCtx = this.ctx; // expose for external resume
      this._buildEngine();
      this._buildAmbient();
      this._buildMusic();
      if (this._spatialEnabled) this._buildBuildingTones();
    } catch (e) {
      console.warn('Audio init failed:', e);
    }
  }

  // ── ENGINE SOUND ─────────────────────────────────────────────────────────
  _buildEngine() {
    const ctx = this.ctx;
    this._engOsc  = ctx.createOscillator();
    this._engOsc.type = 'sawtooth';
    this._engOsc.frequency.value = 55;
    this._engGain = ctx.createGain();
    this._engGain.gain.value = 0;

    const dist  = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1;
      curve[i] = ((Math.PI + 35) * x) / (Math.PI + 35 * Math.abs(x));
    }
    dist.curve = curve;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 300;

    this._engOsc.connect(dist);
    dist.connect(lpf);
    lpf.connect(this._engGain);
    this._engGain.connect(ctx.destination);
    this._engOsc.start();
  }

  updateEngine(speed) {
    if (!this.ctx || !this._engOsc) return;
    const abs = Math.abs(speed);
    this._engOsc.frequency.setTargetAtTime(50 + abs * 320, this.ctx.currentTime, 0.07);
    this._engGain.gain.setTargetAtTime(
      abs > 0.008 ? Math.min(0.1, 0.02 + abs * 0.14) : 0.014,
      this.ctx.currentTime, 0.1
    );
    // Wind layer scales with speed
    const wind = this._ambientLayers.wind;
    if (wind) {
      const ratio = abs / 0.95;
      const target = ratio > 0.38 ? Math.min(0.14, (ratio - 0.38) * 0.28) : 0;
      wind.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.18);
    }
  }

  // ── AMBIENT LAYERS ───────────────────────────────────────────────────────
  _buildAmbient() {
    const ctx = this.ctx;
    try {
      // Wind — filtered noise
      const bufSize = ctx.sampleRate * 3;
      const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) nd[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const windFilt = ctx.createBiquadFilter();
      windFilt.type = 'bandpass'; windFilt.frequency.value = 350; windFilt.Q.value = 0.4;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.018;
      noise.connect(windFilt); windFilt.connect(windGain); windGain.connect(ctx.destination);
      noise.start();
      this._ambientLayers.wind = { node: noise, gain: windGain };
    } catch (e) {}

    // Temple bell — random interval
    const schedBell = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const freq = [528, 396, 639, 741][Math.floor(Math.random() * 4)];
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + 3.8);
      setTimeout(schedBell, 4000 + Math.random() * 8000);
    };
    setTimeout(schedBell, 3000);

    // Spiritual drone — three layered sines
    try {
      [55, 110, 165].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f + (Math.random() - 0.5) * 0.8;
        const g = ctx.createGain(); g.gain.value = 0.022 - i * 0.005;
        o.connect(g); g.connect(ctx.destination); o.start();
        this._ambientLayers[`drone_${i}`] = { osc: o, gain: g };
      });
    } catch (e) {}
  }

  // ── BACKGROUND MUSIC ─────────────────────────────────────────────────────
  _buildMusic() {
    const ctx = this.ctx;
    this._musicGain = ctx.createGain();
    this._musicGain.gain.setValueAtTime(0, ctx.currentTime);
    this._musicGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 5);
    this._musicGain.connect(ctx.destination);

    // Reverb
    const reverbBuf = ctx.createBuffer(2, ctx.sampleRate * 2.5, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = reverbBuf.getChannelData(c);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    }
    const reverb = ctx.createConvolver(); reverb.buffer = reverbBuf;
    const reverbGain = ctx.createGain(); reverbGain.gain.value = 0.35;
    reverb.connect(reverbGain); reverbGain.connect(this._musicGain);

    // Warm ambient pad — detuned drone layers
    [55, 82.41, 110, 138.59, 165, 220].forEach((f, i) => {
      try {
        const o = ctx.createOscillator();
        o.type = i % 3 === 0 ? 'sine' : i % 3 === 1 ? 'triangle' : 'sine';
        o.frequency.value = f + (Math.random() - 0.5) * 1.5;
        const g = ctx.createGain(); g.gain.value = 0.028 + (i < 2 ? 0.015 : 0);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280 + i * 80;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.04 + Math.random() * 0.05;
        const lg = ctx.createGain(); lg.gain.value = 0.008;
        lfo.connect(lg); lg.connect(g.gain); lfo.start();
        o.connect(lp); lp.connect(g); g.connect(this._musicGain); g.connect(reverb); o.start();
      } catch (e) {}
    });

    // Pentatonic melodic notes
    const notes = [220, 261.63, 293.66, 349.23, 392, 440, 523.25, 587.33];
    const playNote = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const freq = notes[Math.floor(Math.random() * notes.length)];
      const n = this.ctx.createOscillator(); n.type = 'triangle'; n.frequency.value = freq;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.06, t + 0.04);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      n.connect(lp); lp.connect(ng); ng.connect(this._musicGain); ng.connect(reverb);
      n.start(t); n.stop(t + 1.5);
      setTimeout(playNote, 1800 + Math.random() * 3200);
    };
    setTimeout(playNote, 5000);
  }

  // ── BUILDING SPATIAL AUDIO ───────────────────────────────────────────────
  _buildBuildingTones() {
    (window.CITY_DATA?.buildings || []).forEach(b => {
      const prof = this._profiles[b.id];
      if (!prof) return;
      try {
        const ctx = this.ctx;
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        const filt = ctx.createBiquadFilter();
        osc.type = prof.type; osc.frequency.value = prof.freq;
        filt.type = 'bandpass'; filt.frequency.value = prof.freq * 3; filt.Q.value = 6;
        gain.gain.value = 0;
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1; panner.maxDistance = 60; panner.rolloffFactor = 1.4;
        panner.positionX.value = b.pos[0];
        panner.positionY.value = 4;
        panner.positionZ.value = b.pos[1];
        osc.connect(filt); filt.connect(gain); gain.connect(panner); panner.connect(ctx.destination);
        osc.start();
        this._buildingTones[b.id] = { osc, gain, panner, bx: b.pos[0], bz: b.pos[1], baseGain: prof.gain };
      } catch (e) {}
    });
  }

  updateSpatialListener(carX, carZ, sinA, cosA) {
    if (!this.ctx || !this._spatialEnabled) return;
    if (this.ctx.listener.positionX) {
      this.ctx.listener.positionX.value = carX;
      this.ctx.listener.positionY.value = 2;
      this.ctx.listener.positionZ.value = carZ;
      this.ctx.listener.forwardX.value = -sinA;
      this.ctx.listener.forwardY.value = 0;
      this.ctx.listener.forwardZ.value = -cosA;
    }
    Object.values(this._buildingTones).forEach(s => {
      const dist = Math.hypot(carX - s.bx, carZ - s.bz);
      const target = dist < 45 ? s.baseGain * Math.pow(Math.max(0, 1 - dist / 45), 1.6) : 0;
      s.gain.gain.value += (target - s.gain.gain.value) * 0.04;
    });
  }

  // ── ONE-SHOT SOUNDS ───────────────────────────────────────────────────────
  playBrake() {
    if (!this.ctx) return;
    try {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - (i / d.length) * 2.5);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = 0.12;
      const h = this.ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 2000;
      src.connect(h); h.connect(g); g.connect(this.ctx.destination); src.start();
    } catch (e) {}
  }

  playCrash() {
    if (!this.ctx) return;
    try {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / (d.length * 0.5)) * 0.8;
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = 0.35;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
      src.connect(lp); lp.connect(g); g.connect(this.ctx.destination); src.start();
    } catch (e) {}
  }

  playBuildingEnter(buildingId) {
    if (!this.ctx) return;
    const prof = this._profiles[buildingId] || { freq: 396 };
    try {
      const t = this.ctx.currentTime;
      // Sub thud
      const sub = this.ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 60;
      const sg = this.ctx.createGain();
      sg.gain.setValueAtTime(0.15, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      sub.connect(sg); sg.connect(this.ctx.destination); sub.start(t); sub.stop(t + 0.65);
      // Shimmer
      const hi = this.ctx.createOscillator(); hi.type = 'sine'; hi.frequency.value = prof.freq;
      const hg = this.ctx.createGain();
      hg.gain.setValueAtTime(0, t + 0.05); hg.gain.linearRampToValueAtTime(0.08, t + 0.12);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      hi.connect(hg); hg.connect(this.ctx.destination); hi.start(t + 0.05); hi.stop(t + 2.5);
    } catch (e) {}
  }

  playCinematicSwell(duration) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      [[110,0.0],[220,0.15],[330,0.3],[440,0.5]].forEach(([freq, delay]) => {
        const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t + delay);
        g.gain.linearRampToValueAtTime(0.055, t + delay + 1.2);
        g.gain.linearRampToValueAtTime(0.0, t + duration);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t + delay); o.stop(t + duration + 0.1);
      });
    } catch (e) {}
  }

  setMusicVolume(v) {
    if (!this.ctx || !this._musicGain) return;
    this._musicGain.gain.setTargetAtTime(v * 0.18, this.ctx.currentTime, 0.3);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
