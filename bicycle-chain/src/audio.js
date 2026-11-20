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

  /**
   * 节奏 0..1 → BPM 96..142。
   *
   * 为什么改音乐而不是只加音效：节奏是"整台机器"的状态，不是某一次事件。
   * 事件音（消除、连消）可以提示"刚刚发生了什么"，但玩家对"整体变快了"的感知
   * 几乎完全来自音乐的拍速——这是听觉系统对周期性的敏感度决定的，
   * 再多的音效也替代不了。
   *
   * 为什么不加音高：升 key 会让同一段旋律听起来"变了首歌"，
   * 而改 BPM 只是"同一首歌唱得更急"。游戏里的加速要的是后者。
   */
  setTempo(x) {
    const t = Math.max(0, Math.min(1, x || 0));
    this.setBpm(96 + 46 * t);
  }

  /** 直接指定 BPM：音乐出球模式用 88~148，不走 96~142 的归一化映射。 */
  setBpm(bpm) {
    this.bpm = Math.max(72, Math.min(168, bpm || 96));
    this.stepDur = 60 / this.bpm / 2;
  }

  /** 节奏跨档：一个短促的上行二音，档位越高越高 */
  tempoMark(mark = 1) {
    const f = [523.25, 659.25, 880.0][Math.min(2, Math.max(0, mark - 1))];
    this.tone({ freq: f, dur: 0.07, type: 'square', gain: 0.030 });
    this.tone({ freq: f * 1.5, dur: 0.13, type: 'sine', gain: 0.045, at: 0.06 });
  }

  /** 把节点接到总线；pan 非 0 时串一个 StereoPannerNode。 */
  _out(node, bus = 'sfx', pan = 0) {
    const dest = bus === 'music' ? this.musicBus : this.sfxBus;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      p.connect(dest);
    } else {
      node.connect(dest);
    }
  }

  tone({
    freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.3,
    at = 0, bus = 'sfx', pan = 0, cutoff = 0,
  }) {
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
    let out = g;
    if (cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      f.Q.value = 0.7;
      g.connect(f);
      out = f;
    }
    this._out(out, bus, pan);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({
    dur = 0.1, gain = 0.15, freq = 1800, q = 0.9, type = 'bandpass',
    at = 0, bus = 'sfx', pan = 0,
  }) {
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
    this._out(g, bus, pan);
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

  /**
   * 出膛：机械层 + 颜色音色层。
   *
   *   机械层（居中）—— 低频炮膛 / 金属撞击 / 回弹弹簧，负责"这是一台机器"。
   *   音色层（按 ci）—— 紫=钟、金=铜管、红=低通贝斯、青=拨弦。
   *   音高层（root）—— 由炮身角度档位给出，五声音阶吸附，不连续变频。
   *   声像层（pan）—— 角度 -24°~+24° → pan -0.65~+0.65。
   *
   * 高音区（≥C5）统一乘 0.708（约 -3 dB），连玩十几分钟不刺耳。
   */
  fire(idx = 0, ci = 0, root = 392.0, pan = 0) {
    this.tone({ freq: 150, to: 46, dur: 0.18, type: 'sine', gain: 0.16 });
    this.tone({ freq: 1500, to: 460, dur: 0.035, type: 'square', gain: 0.045, pan: pan * 0.35 });
    this.noise({ dur: 0.055, gain: 0.07, freq: 2500, q: 0.75, pan: pan * 0.25 });
    this.tone({ freq: 250, to: 165, dur: 0.10, type: 'triangle', gain: 0.035, at: 0.075 });

    const gs = root >= 520 ? 0.708 : 1;
    if (ci === 0) {
      // 紫：清透钟音
      this.tone({ freq: root, dur: 0.22, type: 'sine', gain: 0.085 * gs, pan });
      this.tone({ freq: root * 2, dur: 0.16, type: 'sine', gain: 0.030 * gs, pan, at: 0.012 });
      this.tone({ freq: root * 3, dur: 0.10, type: 'sine', gain: 0.015 * gs, pan, at: 0.020 });
    } else if (ci === 1) {
      // 金：温润方波铜管
      this.tone({ freq: root, dur: 0.16, type: 'square', gain: 0.040 * gs, pan });
      this.tone({ freq: root * 1.004, dur: 0.16, type: 'triangle', gain: 0.035 * gs, pan });
      this.tone({ freq: root * 2, dur: 0.10, type: 'triangle', gain: 0.018 * gs, pan, at: 0.01 });
    } else if (ci === 2) {
      // 红：厚重低通合成贝斯（降八度，低通去掉刺耳泛音）
      this.tone({ freq: root * 0.5, dur: 0.26, type: 'sawtooth', gain: 0.055 * gs, pan, cutoff: 520 });
      this.tone({ freq: root * 0.5025, dur: 0.24, type: 'sawtooth', gain: 0.035 * gs, pan, cutoff: 420 });
      this.tone({ freq: root * 0.5, dur: 0.22, type: 'sine', gain: 0.030 * gs, pan });
    } else if (ci === 3) {
      // 青：清脆高频拨弦
      this.tone({ freq: root * 2, dur: 0.07, type: 'triangle', gain: 0.060 * gs, pan });
      this.tone({ freq: root * 4, dur: 0.05, type: 'sine', gain: 0.022 * gs, pan, at: 0.004 });
      this.noise({ dur: 0.03, gain: 0.028, freq: 5200, q: 1.2, pan });
    } else {
      // 骰子 / 扑克 / 特殊球：中性亮拨弦
      this.tone({ freq: root, dur: 0.14, type: 'triangle', gain: 0.050 * gs, pan });
      this.tone({ freq: root * 1.5, dur: 0.09, type: 'sine', gain: 0.020 * gs, pan, at: 0.01 });
    }
  }

  /**
   * 连消琶音：以落点角度的音高为根音，沿大调五声音阶向上。
   * spacing 跟 BGM 的八分音符成比例，所以琶音天然落在音乐网格上。
   */
  arpeggio(root = 440, pan = 0, steps = 3) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const spacing = Math.max(0.03, Math.min(0.085, this.stepDur * 0.28));
    const n = Math.max(1, Math.min(5, steps | 0));
    for (let i = 0; i < n; i++) {
      const f = root * Math.pow(2, scale[i] / 12);
      const gs = f >= 520 ? 0.708 : 1;
      this.tone({ freq: f, dur: 0.10, type: 'triangle', gain: 0.045 * gs, pan, at: i * spacing });
      this.tone({ freq: f * 2, dur: 0.055, type: 'sine', gain: 0.016 * gs, pan, at: i * spacing + 0.006 });
    }
    if (n >= 4) {
      this.tone({ freq: root * 4, dur: 0.18, type: 'sine', gain: 0.020, pan, at: n * spacing });
    }
  }

  /** 狂热：以当前角度为根音的大三和弦琶音 + 高频闪光。 */
  frenzy(root = 440, pan = 0) {
    const chord = [0, 4, 7, 12, 16];
    chord.forEach((semi, i) => {
      const f = root * Math.pow(2, semi / 12);
      const gs = f >= 520 ? 0.708 : 1;
      this.tone({ freq: f, dur: 0.42, type: 'sine', gain: 0.050 * gs, pan, at: i * 0.045 });
      this.tone({ freq: f * 2, dur: 0.22, type: 'triangle', gain: 0.020 * gs, pan, at: i * 0.045 + 0.01 });
    });
    this.noise({ dur: 0.42, gain: 0.035, freq: 7200, q: 0.6, at: 0.05, pan: pan * 0.5 });
  }

  /** 充能近满：一声很轻的"上弦"，提示再过半拍就要出膛。 */
  chargeReady() {
    this.tone({ freq: 880, to: 1320, dur: 0.10, type: 'sine', gain: 0.022 });
    this.noise({ dur: 0.045, gain: 0.016, freq: 5200, q: 1.2 });
  }

  click() { this.tone({ freq: 470, to: 300, dur: 0.05, type: 'triangle', gain: 0.08 }); }

  /** 翻面槽 / 翻面骰：一声"拨片弹过去"的上滑 + 骰子落桌 */
  flipPad() {
    this.tone({ freq: 620, to: 1180, dur: 0.075, type: 'square', gain: 0.045 });
    this.noise({ dur: 0.045, gain: 0.05, freq: 3600, q: 1.1, at: 0.03 });
    this.tone({ freq: 240, to: 180, dur: 0.06, type: 'triangle', gain: 0.05, at: 0.05 });
  }

  /** 爆破球：低频下坠 + 一层宽噪，要"闷"不要"脆"——脆会读成消除音 */
  boom() {
    this.tone({ freq: 96, to: 34, dur: 0.36, type: 'sine', gain: 0.30 });
    this.tone({ freq: 210, to: 80, dur: 0.16, type: 'square', gain: 0.05 });
    this.noise({ dur: 0.28, gain: 0.15, freq: 820, q: 0.55 });
  }

  /** 锈球注入：金属摩擦感，短促、干、不带尾音，和任何"得分"音区分开 */
  clank() {
    this.tone({ freq: 330, to: 170, dur: 0.11, type: 'square', gain: 0.045 });
    this.noise({ dur: 0.09, gain: 0.04, freq: 2800, q: 1.5 });
  }

  snap() { this.tone({ freq: 320, to: 520, dur: 0.06, type: 'square', gain: 0.035 }); }

  thud() {
    this.tone({ freq: 150, to: 80, dur: 0.16, type: 'sine', gain: 0.12 });
    this.noise({ dur: 0.08, gain: 0.05, freq: 620, q: 0.7 });
  }

  beat() { this.tone({ freq: 90, to: 64, dur: 0.08, type: 'sine', gain: 0.08 }); }

  /**
   * 消除：chain 决定音高，rush 决定叠加的亮度。
   *
   * 骰子模式多传 kind / len，走两条完全不同的音型——这不是音色差异，是**信息**：
   *   豹子（same）——一声闷响 + 骰子落桌的硬碰撞。三颗同点没有方向，所以是"一个点"。
   *   顺子（run） —— 按点数逐个上行，几点就几个音。玩家闭着眼也能听出自己消了几连顺。
   * 这是整个项目里唯一一处"用音高直接映射游戏量"的地方，值得为它单开分支。
   */
  clear(chain = 1, rush = 1, rank = 0, kind = null, len = 3, root = 440, pan = 0) {
    // 连消琶音：先铺在下面，再叠各规则族自己的消除音。
    // 根音来自上一发的角度档位，所以"左边打出的连锁"会从低音区起。
    if (chain >= 2) this.arpeggio(root, pan, Math.min(5, chain));
    // ---- 扑克：四种牌型四条音型 ----
    // 同花顺是一串上行 + 长尾；同花是三音和弦；三条是"三下同音"；
    // 顺子是逐级上行。玩家闭着眼也能听出这一下是哪种牌型。
    if (kind === 'straightflush') {
      [0, 0.07, 0.14, 0.22, 0.32].forEach((at, i) => {
        this.tone({ freq: PENTA[(i + 1) % PENTA.length] * (i >= 3 ? 2 : 1.5), dur: 0.30, type: 'sine', gain: 0.085, at });
      });
      this.noise({ dur: 0.42, gain: 0.06, freq: 7200, q: 0.6, at: 0.06 });
      this.tone({ freq: 88, to: 60, dur: 0.4, type: 'sine', gain: 0.12 });
      return;
    }
    if (kind === 'flush') {
      const root = PENTA[Math.min(5, Math.max(0, len - 1))];
      [1, 1.25, 1.5].forEach((mul, i) => {
        this.tone({ freq: root * mul, dur: 0.24, type: 'triangle', gain: 0.075 - i * 0.01, at: i * 0.035 });
      });
      this.noise({ dur: 0.10, gain: 0.04, freq: 5200, q: 0.8 });
      return;
    }
    if (kind === 'three') {
      // 三条 = 同一个音敲三下，长度越多越沉。它没有方向，所以不用音阶。
      const f = PENTA[Math.min(4, Math.max(0, len - 1))];
      for (let i = 0; i < 3; i++) this.tone({ freq: f, dur: 0.09, type: 'square', gain: 0.055, at: i * 0.045 });
      this.tone({ freq: 150, to: 88, dur: 0.2, type: 'sine', gain: 0.16 });
      return;
    }
    if (kind === 'straight') {
      const n = Math.max(3, Math.min(5, len | 0));
      const base = PENTA[Math.min(3, Math.max(0, chain - 1))] * 0.8;
      for (let i = 0; i < n; i++) {
        this.tone({ freq: base * Math.pow(2, i / 8), dur: 0.14, type: 'triangle', gain: 0.07, at: i * 0.05 });
      }
      this.noise({ dur: 0.05, gain: 0.05, freq: 3000, q: 0.9 });
      return;
    }

    if (kind === 'same') {
      this.tone({ freq: 150, to: 82, dur: 0.20, type: 'sine', gain: 0.20 });
      this.noise({ dur: 0.075, gain: 0.10, freq: 2200, q: 0.9 });
      this.tone({ freq: 440, to: 660, dur: 0.10, type: 'triangle', gain: 0.045, at: 0.03 });
      if (rank >= 3) {
        // 六六六：一声钟 + 一层上行泛音，和任何常规消除都不同类
        [0, 0.09, 0.18, 0.30].forEach((at, i) => {
          this.tone({ freq: PENTA[i + 2] * 2, dur: 0.42, type: 'sine', gain: 0.085, at });
        });
        this.noise({ dur: 0.42, gain: 0.05, freq: 7200, q: 0.6, at: 0.05 });
      }
      return;
    }
    if (kind === 'run') {
      const n = Math.max(3, Math.min(6, len | 0));
      const ci0 = Math.min(Math.max(chain, 1) - 1, PENTA.length - 1);
      const base = PENTA[ci0] * 0.75;
      for (let i = 0; i < n; i++) {
        // 顺子本来就是"一级一级走"，所以音程用半音而不是五声音阶——
        // 五声音阶会把 6 个音压成 5 个台阶，听起来像"差一点点"。
        this.tone({
          freq: base * Math.pow(2, i / 6),
          dur: 0.14, type: 'triangle', gain: 0.075 - i * 0.005, at: i * 0.045,
        });
      }
      this.noise({ dur: 0.05, gain: 0.055, freq: 2600, q: 0.9 });
      if (n >= 5) {
        this.tone({ freq: base * 3, dur: 0.30, type: 'sine', gain: 0.05, at: n * 0.045 });
      }
      return;
    }
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
    // 长消除（4 连给炸弹、5 连给万能）必须和普通三消听得出区别，
    // 否则"我这一下值钱"只能靠看，而玩家在这一刻通常在看炮口。
    if (rank === 1) {
      this.tone({ freq: f * 3, dur: 0.09, type: 'square', gain: 0.030, at: 0.05 });
    } else if (rank >= 2) {
      this.tone({ freq: f * 4, dur: 0.22, type: 'sine', gain: 0.055, at: 0.05 });
      this.tone({ freq: f * 3, dur: 0.18, type: 'triangle', gain: 0.040, at: 0.09 });
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

  /**
   * 连消跨档。音高、层数、尾巴都随档位走。
   *
   * 上一版所有档位都是同一个 0.09s 的单音——那等于告诉玩家"这几件事一样重要"。
   * 现在第 1 档只有一个音，第 5 档是上行音串 + 亮泛音 + 噪声尾巴，
   * 不用看屏幕也能听出自己在第几档。
   */
  comboTier(tier = 1) {
    const t = Math.min(Math.max(tier, 1), 5);
    const roots = [659.25, 783.99, 880.0, 1046.5, 1174.66];
    const notes = t;                       // 档位 = 音符个数
    const g = 0.045 + t * 0.008;
    for (let i = 0; i < notes; i++) {
      const f = roots[t - 1] * Math.pow(2, (i * (t >= 4 ? 2 : 3)) / 12);
      this.tone({ freq: f, dur: 0.10 + t * 0.03, type: 'sine', gain: g, at: i * 0.048 });
    }
    if (t >= 3) {
      this.tone({ freq: roots[t - 1] * 2, dur: 0.20, type: 'triangle', gain: g * 0.45, at: 0.02 });
    }
    if (t >= 4) {
      this.noise({ dur: 0.26, gain: 0.030, freq: 6800, q: 0.6, at: 0.06 });
    }
    if (t >= 5) {
      this.tone({ freq: 88, to: 62, dur: 0.34, type: 'sine', gain: 0.10 });
    }
  }

  /**
   * 拿到奖励球。爆破和万能必须听得出区别：
   * 爆破是"金属装上膛"（短促、下行、带噪声），万能是"水晶亮起来"（上行、纯音）。
   */
  reward(wild = false) {
    if (wild) {
      [0, 0.055, 0.11, 0.17].forEach((at, i) => {
        this.tone({ freq: PENTA[i + 2] * 2, dur: 0.20, type: 'sine', gain: 0.062, at });
      });
      this.noise({ dur: 0.22, gain: 0.028, freq: 7600, q: 0.7, at: 0.03 });
    } else {
      this.tone({ freq: 200, to: 330, dur: 0.13, type: 'square', gain: 0.048 });
      this.tone({ freq: 150, to: 120, dur: 0.10, type: 'sine', gain: 0.06, at: 0.02 });
      this.noise({ dur: 0.09, gain: 0.032, freq: 2400, q: 1.2 });
    }
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
