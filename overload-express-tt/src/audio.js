// 抖音小游戏零依赖程序化音效 + 轻快循环 BGM + 触觉震动引擎（兼容 tt.createWebAudioContext）。

// 轻快大调五声早高峰旋律音阶（Hz）
const BGM_BASS = [130.81, 146.83, 164.81, 196.00]; // C3, D3, E3, G3
const BGM_LOAD_MEL = [523.25, 0, 587.33, 659.25, 783.99, 0, 659.25, 587.33, 523.25, 659.25, 783.99, 0, 880.00, 783.99, 659.25, 0];
const BGM_RUN_MEL = [523.25, 659.25, 783.99, 659.25, 880.00, 783.99, 659.25, 587.33, 523.25, 587.33, 659.25, 783.99, 1046.5, 880.00, 783.99, 659.25];

export class AudioEngine {
  constructor(platform) {
    this.platform = platform;
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.paused = false;
    this.noiseBuf = null;
    this.lastPlayed = new Map();
  }

  init() {
    // 抖音 iOS 静音键兼容（让玩家在侧边静音开关拨下时仍可正常听见游戏声音，遵守游戏内静音钮）
    if (this.platform.isTT && typeof tt !== 'undefined' && typeof tt.setInnerAudioOption === 'function' && !this._iosOptDone) {
      this._iosOptDone = true;
      try { tt.setInnerAudioOption({ obeyMuteSwitch: false }); } catch { /* ignore */ }
    }
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) {
        try { this.ctx.resume(); } catch { /* ignore */ }
      }
      return;
    }
    const ctx = this.platform.createAudioContext();
    if (!ctx) return;
    this.ctx = ctx;

    try {
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.75;

      // 低版本安卓抖音客户端可能缺少 DynamicsCompressorNode，单独降级避免全游戏静音
      let connected = false;
      if (typeof this.ctx.createDynamicsCompressor === 'function') {
        try {
          const comp = this.ctx.createDynamicsCompressor();
          comp.threshold.value = -16;
          comp.knee.value = 18;
          comp.ratio.value = 6;
          comp.attack.value = 0.003;
          comp.release.value = 0.16;
          this.master.connect(comp);
          comp.connect(this.ctx.destination);
          connected = true;
        } catch { /* fallback to direct destination */ }
      }
      if (!connected) {
        this.master.connect(this.ctx.destination);
      }

      const len = Math.floor(this.ctx.sampleRate * 0.45);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch {
      this.ctx = null;
    }
  }

  setPaused(p) {
    this.paused = p;
    if (!this.ctx) return;
    try {
      if (p) this.ctx.suspend?.();
      else this.ctx.resume?.();
    } catch { /* ignore */ }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      try { this.master.gain.setTargetAtTime(this.muted ? 0 : 0.75, this.ctx.currentTime, 0.02); } catch { /* ignore */ }
    }
    return this.muted;
  }

  allow(key, minGapMs = 45) {
    if (!this.ctx || this.muted || this.paused) return false;
    const now = this.platform.now();
    const prev = this.lastPlayed.get(key) || 0;
    if (now - prev < minGapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  railBeat(tick, running) {
    if (!this.ctx || this.muted || this.paused) return;
    try {
      const t = this.ctx.currentTime;
      const strong = tick % 4 === 0;
      const sub = tick % 2 === 0;
      // 1) 铁轨节奏底鼓
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const baseF = running ? (strong ? 115 : 88) : (strong ? 95 : 72);
      osc.frequency.setValueAtTime(baseF * 1.4, t);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.55, t + 0.08);
      const vol = running ? (strong ? 0.19 : sub ? 0.11 : 0.06) : (strong ? 0.07 : 0.035);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.1);

      // 2) 轻快早高峰循环 BGM（低音量木琴旋律 + 跳跃贝斯，绝不喧宾夺主！）
      if (sub) {
        const bassF = BGM_BASS[Math.floor(tick / 4) % BGM_BASS.length] * (strong ? 1 : 1.5);
        const bo = this.ctx.createOscillator();
        const bg = this.ctx.createGain();
        bo.type = 'sine';
        bo.frequency.setValueAtTime(bassF, t);
        bg.gain.setValueAtTime(running ? 0.055 : 0.032, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        bo.connect(bg).connect(this.master);
        bo.start(t); bo.stop(t + 0.15);
      }
      const melArr = running ? BGM_RUN_MEL : BGM_LOAD_MEL;
      const note = melArr[tick % melArr.length];
      if (note > 0) {
        const mo = this.ctx.createOscillator();
        const mg = this.ctx.createGain();
        mo.type = running ? 'triangle' : 'sine';
        mo.frequency.setValueAtTime(note, t);
        mg.gain.setValueAtTime(running ? 0.042 : 0.026, t);
        mg.gain.exponentialRampToValueAtTime(0.001, t + (running ? 0.13 : 0.17));
        mo.connect(mg).connect(this.master);
        mo.start(t); mo.stop(t + 0.18);
      }
    } catch { /* ignore */ }
  }

  launch(count = 1, perfect = false) {
    if (!this.allow('launch', 45)) return;
    try {
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
    } catch { /* ignore */ }
  }

  grab(hasGrip = true, heavy = false) {
    if (heavy) this.platform.vibrate('light');
    if (!this.allow('grab', 42)) return;
    try {
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
    } catch { /* ignore */ }
  }

  undo() {
    if (!this.allow('undo', 50)) return;
    try {
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
    } catch { /* ignore */ }
  }

  whistle() {
    this.platform.vibrate('heavy');
    if (!this.allow('whistle', 250)) return;
    try {
      const t = this.ctx.currentTime;
      for (const f of [311.13, 392.0, 466.16]) {
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
    } catch { /* ignore */ }
  }

  brakeScreech() {
    this.platform.vibrate('heavy');
    if (!this.allow('brake', 600)) return;
    try {
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
    } catch { /* ignore */ }
  }

  snap() {
    if (!this.allow('snap', 55)) return;
    try {
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
    } catch { /* ignore */ }
  }

  bonk() {
    this.platform.vibrate('medium');
    if (!this.allow('bonk', 55)) return;
    try {
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
    } catch { /* ignore */ }
  }

  fall() {
    if (!this.allow('fall', 65)) return;
    try {
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
    } catch { /* ignore */ }
  }

  /** 短促过滤噪声，用于高光快门等瞬态音效 */
  playNoiseBurst(st, dur, { freq = 1800, q = 2.0, vol = 0.09 }) {
    if (!this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, st);
    g.gain.linearRampToValueAtTime(vol, st + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, st + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(st);
    src.stop(st + dur + 0.02);
  }

  /** 行车期零干扰高光快门音（清脆咔嚓 + 轻灵闪星，绝不打断节奏！） */
  shutterSnap() {
    this.platform.vibrate('light');
    if (!this.allow('shutter', 220)) return;
    try {
      const t = this.ctx.currentTime;
      this.playNoiseBurst(t, 0.032, { freq: 3800, q: 1.9, vol: 0.16 });
      this.playNoiseBurst(t + 0.048, 0.038, { freq: 2500, q: 2.1, vol: 0.12 });
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1174.66, t + 0.03);
      osc.frequency.exponentialRampToValueAtTime(1760, t + 0.14);
      g.gain.setValueAtTime(0.09, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g).connect(this.master);
      osc.start(t + 0.03);
      osc.stop(t + 0.20);
    } catch { /* ignore */ }
  }

  /** 到站 MVP 大称号解锁专属音效：相机快门「咔嚓！」+ 闪亮街机金色号角大琶音 + 重震动 */
  achievementUnlock() {
    this.platform.vibrate('heavy');
    if (!this.ctx || this.muted || this.paused) return;
    try {
      const t = this.ctx.currentTime;
      // 1) 清脆相机快门「咔-嚓」两声机械点击
      this.playNoiseBurst(t, 0.035, { freq: 3600, q: 1.8, vol: 0.18 });
      this.playNoiseBurst(t + 0.055, 0.045, { freq: 2400, q: 2.2, vol: 0.14 });
      // 2) 华丽街机金色五音上行号角 + 高音闪星和弦
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const st = t + 0.04 + i * 0.065;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i >= 3 ? 'triangle' : 'sawtooth';
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 2600;
        osc.frequency.setValueAtTime(f, st);
        g.gain.setValueAtTime(0.001, st);
        g.gain.linearRampToValueAtTime(i === 4 ? 0.18 : 0.13, st + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, st + (i === 4 ? 0.52 : 0.24));
        osc.connect(flt).connect(g).connect(this.master);
        osc.start(st);
        osc.stop(st + (i === 4 ? 0.55 : 0.26));
      });
    } catch { /* ignore */ }
  }

  fanfare() {
    this.platform.vibrate('medium');
    if (!this.ctx || this.muted || this.paused) return;
    try {
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
    } catch { /* ignore */ }
  }
}
