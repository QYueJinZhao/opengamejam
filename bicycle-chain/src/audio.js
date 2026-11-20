// 程序化音频：零外部资源，全部 Web Audio 合成。
//
// 两条总线：music（背景）与 sfx（音效），都由 master 控制。
// BGM 是一个 4 小节循环（32 个八分音符），按 ctx.currentTime 提前 0.2s 调度，
// 所以不会随帧率漂移。强度 intensity 由盘面占用率驱动：越挤，arp 越亮、hat 越密。

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5 D5 E5 G5 A5 C6
const BASS_ROOT = [110.0, 87.31, 130.81, 98.0];                // A2 F2 C3 G2
const BASS_FIFTH = [164.81, 130.81, 196.0, 146.83];            // E3 C3 G3 D3

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuf = null;
    this.muted = false;
    this.lastTick = 0;
    this.intensity = 0;
    this.bpm = 96;
    this.step = 0;
    this.nextStepTime = 0;
    this.musicWanted = false;
    this.stepDur = 60 / this.bpm / 2;
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
    this.master.gain.value = 0.9;

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;

    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.16;
    this.musicBus.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.5;
    this.sfxBus.connect(this.master);

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.nextStepTime = this.ctx.currentTime + 0.1;
  }

  get on() { return !!(this.ctx && !this.muted && this.ctx.state === 'running'); }

  setMuted(m) {
    this.muted = m;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setIntensity(x) {
    this.intensity = Math.max(0, Math.min(1, x));
  }

  tone({ freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.3, at = 0, bus = 'sfx' }) {
    if (!this.on) return;
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus === 'music' ? this.musicBus : this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({ dur = 0.1, gain = 0.15, freq = 1800, q = 0.9, type = 'bandpass', at = 0, bus = 'sfx' }) {
    if (!this.on) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, gain), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g);
    g.connect(bus === 'music' ? this.musicBus : this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  // ---------- BGM ----------
  startMusic() {
    this.musicWanted = true;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.08;
  }

  stopMusic() {
    this.musicWanted = false;
  }

  /** 每帧调用：把未来 0.2 秒内的音符排出去 */
  update() {
    if (!this.on || !this.musicWanted) return;
    const now = this.ctx.currentTime;
    if (this.nextStepTime < now) this.nextStepTime = now + 0.03;
    let guard = 0;
    while (this.nextStepTime < now + 0.2 && guard++ < 10) {
      this.scheduleStep(this.step, this.nextStepTime - now);
      this.step = (this.step + 1) % 32;
      this.nextStepTime += this.stepDur;
    }
  }

  scheduleStep(step, at) {
    const bar = step >> 3;
    const s = step % 8;
    const root = BASS_ROOT[bar];
    const fifth = BASS_FIFTH[bar];
    const k = this.intensity;

    // 底鼓：四踩
    if (s % 2 === 0) {
      this.tone({ freq: 128, to: 46, dur: 0.17, type: 'sine', gain: 0.55, at, bus: 'music' });
    }
    // 反拍军鼓/噪声
    if (s === 2 || s === 6) {
      this.noise({ dur: 0.09, gain: 0.10 + 0.10 * k, freq: 1900, q: 0.7, at, bus: 'music' });
    }
    // 踩镲：八分，强度越高越密
    if (s % 2 === 1 || k > 0.55) {
      this.noise({ dur: 0.028, gain: 0.045 + 0.05 * k, freq: 8200, q: 1.1, at, bus: 'music' });
    }
    // 贝斯：每小节 0 / 3 / 6
    if (s === 0 || s === 3) {
      this.tone({ freq: root, dur: 0.24, type: 'triangle', gain: 0.34, at, bus: 'music' });
    }
    if (s === 6) {
      this.tone({ freq: fifth, dur: 0.18, type: 'triangle', gain: 0.24, at, bus: 'music' });
    }
    // 琶音：每拍一个，强度决定亮度
    if (s % 2 === 0) {
      const note = PENTA[(bar * 2 + (s >> 1)) % PENTA.length] * (k > 0.7 ? 2 : 1);
      this.tone({ freq: note, dur: 0.1, type: 'sine', gain: 0.05 + 0.06 * k, at, bus: 'music' });
    }
    if (k > 0.85 && s % 2 === 1) {
      const note = PENTA[(bar + 3) % PENTA.length] * 2;
      this.tone({ freq: note, dur: 0.07, type: 'sine', gain: 0.035, at, bus: 'music' });
    }
  }

  // ---------- 音效 ----------
  tick(speed) {
    if (!this.on) return;
    const now = this.ctx.currentTime;
    const gap = speed > 9 ? 0.11 : speed > 4 ? 0.07 : 0.035;
    if (now - this.lastTick < gap) return;
    this.lastTick = now;
    this.tone({ freq: 1600 + speed * 26, dur: 0.013, type: 'square', gain: 0.018 });
  }

  fire(idx = 0) {
    this.tone({ freq: 560 + idx * 70, to: 900 + idx * 80, dur: 0.07, type: 'triangle', gain: 0.055 });
    this.noise({ dur: 0.04, gain: 0.02, freq: 3200, q: 0.8 });
  }

  click() { this.tone({ freq: 470, to: 300, dur: 0.05, type: 'triangle', gain: 0.08 }); }

  snap() { this.tone({ freq: 320, to: 520, dur: 0.06, type: 'square', gain: 0.035 }); }

  thud() {
    this.tone({ freq: 150, to: 80, dur: 0.16, type: 'sine', gain: 0.12 });
    this.noise({ dur: 0.08, gain: 0.05, freq: 620, q: 0.7 });
  }

  beat() { this.tone({ freq: 90, to: 64, dur: 0.08, type: 'sine', gain: 0.08 }); }

  /** 消除：chain 决定音高，rush 决定叠加的亮度 */
  clear(chain = 1, rush = 1) {
    const i = Math.min(Math.max(chain, 1) - 1, PENTA.length - 1);
    const f = PENTA[i];
    // 尾音跟着视觉一起拉长（0.16→0.24）。三消演出到了 0.7s，
    // 如果声音还在 0.25s 收干净，看起来就像"画面在回放、声音已经走了"。
    this.tone({ freq: f, to: f * 1.5, dur: 0.24, type: 'sine', gain: 0.15 });
    this.tone({ freq: f * 2, dur: 0.14, type: 'triangle', gain: 0.045, at: 0.012 });
    this.noise({ dur: 0.17, gain: 0.05, freq: 4200, q: 0.7 });
    if (chain >= 2) {
      this.tone({ freq: f * 2.5, dur: 0.28, type: 'sine', gain: 0.055, at: 0.06 });
    }
    if (rush >= 4) {
      const up = PENTA[Math.min(rush % 6, 5)] * 2;
      this.tone({ freq: up, dur: 0.16, type: 'sine', gain: 0.04, at: 0.07 });
    }
  }

  sweep() {
    [0, 0.06, 0.12, 0.18].forEach((at, i) => {
      this.tone({ freq: PENTA[i + 1], dur: 0.24, type: 'sine', gain: 0.1, at });
    });
    this.noise({ dur: 0.3, gain: 0.06, freq: 5200, q: 0.6 });
  }

  /**
   * 跨段位。上行大三和弦琶音，等级越高音越多、尾巴越长 ——
   * 玩家不需要看 UI 也能听出"我上了一个台阶"。
   */
  tierUp(level = 1) {
    const seq =
      level >= 4 ? [523.25, 659.25, 783.99, 1046.5, 1318.51] :
      level >= 3 ? [523.25, 659.25, 880.0, 1046.5] :
      level >= 2 ? [523.25, 659.25, 783.99] :
                   [440.0, 587.33];
    const g = level >= 4 ? 0.115 : 0.08;
    seq.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.24, type: 'sine', gain: g, at: i * 0.055 });
      this.tone({ freq: f * 2, dur: 0.12, type: 'triangle', gain: g * 0.28, at: i * 0.055 });
    });
    if (level >= 4) {
      this.noise({ dur: 0.45, gain: 0.045, freq: 6400, q: 0.6, at: 0.14 });
    }
  }

  rushUp(n) {
    const f = PENTA[Math.min(n, 5)] || PENTA[5];
    this.tone({ freq: f * 1.5, dur: 0.09, type: 'sine', gain: 0.05 });
  }

  rushBreak() {
    this.tone({ freq: 300, to: 120, dur: 0.28, type: 'sawtooth', gain: 0.06 });
  }

  overflow() {
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 880, to: 640, dur: 0.14, type: 'square', gain: 0.06, at: i * 0.16 });
    }
  }

  dead() {
    this.tone({ freq: 260, to: 46, dur: 0.9, type: 'sawtooth', gain: 0.14 });
    this.noise({ dur: 0.55, gain: 0.09, freq: 820, q: 0.5 });
    this.stopMusic();
  }

  start() {
    [0, 0.07, 0.14].forEach((at, i) => {
      this.tone({ freq: PENTA[i + 2], dur: 0.18, type: 'sine', gain: 0.09, at });
    });
  }

  select() { this.tone({ freq: 720, dur: 0.045, type: 'triangle', gain: 0.05 }); }

  confirm() {
    this.tone({ freq: 520, dur: 0.08, type: 'triangle', gain: 0.08 });
    this.tone({ freq: 780, dur: 0.12, type: 'sine', gain: 0.06, at: 0.06 });
  }
}
