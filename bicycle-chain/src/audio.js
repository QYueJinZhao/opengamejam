// 程序化音频：零外部资源，全部 Web Audio 合成。
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5 D5 E5 G5 A5 C6

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.muted = false;
    this.lastTick = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.24;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;

    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  get on() { return this.ctx && !this.muted && this.ctx.state === 'running'; }

  tone({ freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.3, at = 0 }) {
    if (!this.on) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.1, gain = 0.15, lp = 1800, hp = 200, at = 0 }) {
    if (!this.on) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = (lp + hp) / 2;
    f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // 转轮棘轮：按速度降采样，避免 14 次/秒的电钻声
  tick(speed) {
    if (!this.on) return;
    const now = this.ctx.currentTime;
    const gap = speed > 9 ? 0.11 : speed > 4 ? 0.07 : 0.035;
    if (now - this.lastTick < gap) return;
    this.lastTick = now;
    this.tone({ freq: 1500 + speed * 30, dur: 0.014, type: 'square', gain: 0.022 });
  }

  fire() { this.tone({ freq: 620, to: 980, dur: 0.07, type: 'triangle', gain: 0.06 }); }

  click() { this.tone({ freq: 480, to: 300, dur: 0.055, type: 'triangle', gain: 0.10 }); }

  thud() {
    this.tone({ freq: 150, to: 82, dur: 0.16, type: 'sine', gain: 0.13 });
    this.noise({ dur: 0.08, gain: 0.05, lp: 700, hp: 200 });
  }

  clear(chain) {
    const i = Math.min(chain - 1, PENTA.length - 1);
    const f = PENTA[Math.max(0, i)];
    this.tone({ freq: f, to: f * 1.5, dur: 0.16, type: 'sine', gain: 0.16 });
    this.tone({ freq: f * 2, dur: 0.10, type: 'triangle', gain: 0.05, at: 0.01 });
    if (chain >= 3) this.tone({ freq: f * 2.5, dur: 0.22, type: 'sine', gain: 0.07, at: 0.05 });
    this.noise({ dur: 0.12, gain: 0.06, lp: 4200, hp: 1200 });
  }

  beat() { this.tone({ freq: 86, to: 62, dur: 0.09, type: 'sine', gain: 0.10 }); }

  dead() {
    this.tone({ freq: 240, to: 48, dur: 0.85, type: 'sawtooth', gain: 0.16 });
    this.noise({ dur: 0.5, gain: 0.10, lp: 900, hp: 120 });
  }

  start() {
    [0, 0.07, 0.14].forEach((at, i) => {
      this.tone({ freq: PENTA[i + 2], dur: 0.18, type: 'sine', gain: 0.10, at });
    });
  }
}
