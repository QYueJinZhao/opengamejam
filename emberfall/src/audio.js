// audio.js — procedural Web Audio. No bundled/external audio files: everything
// is synthesised at runtime, so the first frame works offline in the review
// sandbox and there are no licence questions for the jam.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = false;
    this.muted = false;
    this.intensity = 0; // 0..1, drives music layers
    this._musicTimer = null;
    this._step = 0;
  }

  // Must be called from a real user gesture (browser autoplay policy).
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.75;
    this.sfxGain.connect(this.master);
    this.enabled = true;
    this._startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

  _noiseBuffer(dur = 0.4) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, dur, type = 'sine', gain = 0.3, slideTo = null, dest = null) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(dest || this.sfxGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _noise(dur, gain, filterFreq, dest = null) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = filterFreq; flt.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(dest || this.sfxGain);
    src.start(t); src.stop(t + dur);
  }

  // ---- One-shot SFX ----
  shoot() { this._tone(680, 0.07, 'square', 0.055, 380); }
  hit() { this._noise(0.09, 0.16, 1400); this._tone(180, 0.09, 'sawtooth', 0.06, 90); }
  kill() { this._noise(0.16, 0.12, 700); this._tone(120, 0.18, 'triangle', 0.08, 45); }
  pickup() { this._tone(880, 0.08, 'sine', 0.07, 1320); }
  hurt() { this._tone(140, 0.28, 'sawtooth', 0.16, 55); this._noise(0.2, 0.1, 300); }
  levelUp() {
    if (!this.enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.24, 'triangle', 0.12), i * 90));
  }
  overload() {
    if (!this.enabled) return;
    this._tone(90, 0.7, 'sawtooth', 0.2, 700);
    this._noise(0.5, 0.18, 2200);
  }
  boss() {
    if (!this.enabled) return;
    [110, 130, 146].forEach((f, i) => setTimeout(() => this._tone(f, 1.4, 'sawtooth', 0.1, f * 0.8, this.musicGain), i * 200));
  }
  death() {
    if (!this.enabled) return;
    this._tone(320, 1.2, 'sawtooth', 0.18, 40);
    this._noise(0.9, 0.12, 250);
  }

  // ---- Adaptive music: a slow arpeggio whose density/tempo scale with intensity ----
  _startMusic() {
    if (this._musicTimer) return;
    const scale = [0, 3, 5, 7, 10, 12]; // minor pentatonic-ish
    const root = 110; // A2
    const beat = () => {
      if (!this.enabled) return;
      const s = this._step++;
      const note = scale[s % scale.length] + (s % 12 < 6 ? 0 : 12);
      const f = root * Math.pow(2, note / 12);
      // Pad note every 8 steps
      if (s % 8 === 0) this._tone(f / 2, 1.6, 'sine', 0.09 + this.intensity * 0.05, null, this.musicGain);
      // Arp note; more steps -> busier as intensity rises
      const every = this.intensity > 0.6 ? 1 : this.intensity > 0.3 ? 2 : 4;
      if (s % every === 0) this._tone(f, 0.32, 'triangle', 0.06 + this.intensity * 0.05, null, this.musicGain);
      // Kick on downbeat, faster with intensity
      if (s % (this.intensity > 0.5 ? 2 : 4) === 0) this._tone(60, 0.14, 'sine', 0.12, 35, this.musicGain);
      // Offbeat hat at high intensity
      if (this.intensity > 0.45 && s % 2 === 1) this._noise(0.04, 0.035, 6000, this.musicGain);
      const interval = 300 - this.intensity * 130;
      this._musicTimer = setTimeout(beat, interval);
    };
    beat();
  }

  stopMusic() { if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; } }
}
