// 零依赖 Web Audio 程序化喜剧与铁轨节奏音效引擎（含动态压缩器与 45ms 防破音节流）。

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
    this.lastPlayed = new Map();
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    // 主总线动态压缩器：防止 10+ 人同帧撞涵洞/甩飞时音频爆音削波
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.16;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.75;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  /** 防同帧高频重叠破音的轻量节流阀 */
  allow(key, minGapMs = 45) {
    if (!this.ctx || this.muted) return false;
    const now = performance.now();
    const prev = this.lastPlayed.get(key) || 0;
    if (now - prev < minGapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.75, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  railBeat(tick, running) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const strong = tick % 4 === 0;
    const sub = tick % 2 === 0;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    const baseF = running ? (strong ? 115 : 88) : (strong ? 95 : 72);
    osc.frequency.setValueAtTime(baseF * 1.4, t);
    osc.frequency.exponentialRampToValueAtTime(baseF * 0.55, t + 0.08);
    const vol = running ? (strong ? 0.22 : sub ? 0.13 : 0.07) : (strong ? 0.08 : 0.04);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);

    if (running && this.noiseBuf && sub) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = strong ? 1500 : 2200;
      flt.Q.value = 2.0;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(strong ? 0.08 : 0.045, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(flt).connect(ng).connect(this.master);
      src.start(t);
      src.stop(t + 0.12);
    }
  }

  launch(count = 1, perfect = false) {
    if (!this.allow('launch', 45)) return;
    const t = this.ctx.currentTime;
    const n = Math.min(3, count);
    for (let i = 0; i < n; i++) {
      const st = t + i * 0.03;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = perfect ? 'triangle' : 'sine';
      const f0 = (perfect ? 320 : 240) + i * 75;
      osc.frequency.setValueAtTime(f0, st);
      osc.frequency.exponentialRampToValueAtTime(f0 * 1.85, st + 0.09);
      g.gain.setValueAtTime(0.13, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.11);
      osc.connect(g).connect(this.master);
      osc.start(st);
      osc.stop(st + 0.12);
    }
  }

  grab(hasGrip = true, heavy = false) {
    if (!this.allow('grab', 42)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    const f = heavy ? 130 : hasGrip ? 290 : 180;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.07);
    g.gain.setValueAtTime(heavy ? 0.22 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  undo() {
    if (!this.allow('undo', 50)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(210, t + 0.09);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  whistle() {
    if (!this.allow('whistle', 250)) return;
    const t = this.ctx.currentTime;
    const freqs = [311.13, 392.0, 466.16];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 1400;
      osc.frequency.setValueAtTime(f * 0.96, t);
      osc.frequency.linearRampToValueAtTime(f, t + 0.09);
      osc.frequency.setValueAtTime(f, t + 0.52);
      osc.frequency.linearRampToValueAtTime(f * 0.91, t + 0.78);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.10, t + 0.08);
      g.gain.setValueAtTime(0.09, t + 0.50);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.80);
      osc.connect(flt).connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.82);
    }
  }

  /** 急刹金属摩擦尖啸短提示 */
  brakeScreech() {
    if (!this.allow('brake', 600)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 1900;
    flt.Q.value = 5;
    osc.frequency.setValueAtTime(920, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.36);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(flt).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.40);
  }

  snap() {
    if (!this.allow('snap', 55)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  bonk() {
    if (!this.allow('bonk', 55)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.16);
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  fall() {
    if (!this.allow('fall', 65)) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    const start = 560 + Math.random() * 240;
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.32);
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  fanfare() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const st = t + i * 0.09;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.15, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.32);
      osc.connect(g).connect(this.master);
      osc.start(st);
      osc.stop(st + 0.35);
    });
  }
}
