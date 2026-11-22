// 程序化音频：零外部资源，全部 Web Audio 合成。
//
// 两条总线：music（背景）与 sfx（音效），都由 master 控制。
// BGM 是一个 4 小节循环（32 个八分音符），按 ctx.currentTime 提前 0.2s 调度，
// 所以不会随帧率漂移。强度 intensity 由盘面占用率驱动：越挤，arp 越亮、hat 越密。

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5 D5 E5 G5 A5 C6

// ---- 程序化 BGM：小星星（公有领域民谣）----
//
// 为什么换成它：这一版出球改成"贴着拍点出"，BGM 就必须是一条**能数拍子**
// 的旋律。之前的 4 小节鼓组没有可唱的拍头，玩家听不出"下一拍在哪"，
// 贴拍就变成了纯数值行为。小星星每拍一个字，听两小节就能跟着点。
//
// 48 拍（12 小节）＝ 完整一段：每拍一个音，'-' 表示延音（不重新起音）。
// 速度由 bpm 决定（96 → 142），同一段旋律唱得更急，不升 key。
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392.00, A4: 440.00, B4: 493.88, C5: 523.25,
};
const TWINKLE = [
  'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', '-',
  'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4', '-',
  'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', '-',
  'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', '-',
  'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', '-',
  'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4', '-',
];
// 每小节一个根音（12 小节）。只求"有低音托着"，不做和声进行。
const TWINKLE_BASS = [
  130.81, 174.61, 130.81, 174.61, 130.81, 174.61,
  196.00, 130.81, 196.00, 130.81, 174.61, 130.81,
];

// 外部 CC0 样本。合成层继续负责音高 / 声像 / 连消音型；
// 样本只补合成做不出来的材质（玻璃、金属、骰子、纸牌、UI、短乐句）。
const ASSET_BASE = './assets/audio/';
const SAMPLE_FILES = {
  glassLight: 'impactGlass_light_000.ogg',
  glassMedium: 'impactGlass_medium_000.ogg',
  glassHeavy: 'impactGlass_heavy_000.ogg',
  metalLight: 'impactMetal_light_000.ogg',
  blast: 'lowFrequency_explosion_000.ogg',
  forceField: 'forceField_000.ogg',
  diceThrow: 'dice-throw-1.ogg',
  cardPlace: 'card-place-1.ogg',
  cardSlide: 'card-slide-1.ogg',
  chipLay: 'chip-lay-1.ogg',
  uiClick: 'click_001.ogg',
  uiSelect: 'select_001.ogg',
  uiConfirm: 'confirmation_001.ogg',
  uiSwitch: 'switch_001.ogg',
  jingleWin: 'jingles_NES00.ogg',
  jingleEnd: 'jingles_PIZZI01.ogg',
  bgmTitle: 'song18.mp3',
  bgmAlt: 'song21.mp3',
};

// 两首 CC0 轻音乐：同一作者（cynicmusic）、同一调式，被第三方拼成过无缝 loop，
// 所以按同一 BPM 锁拍。定时 90~120s 的局里两首交替，避免 49s 单曲循环听腻。
// 程序化 BGM 仍保留为可选项（B 键），但默认用文件 BGM。
export const BGM_PLAYLIST = [
  { key: 'bgmTitle', bpm: 98.5, title: 'Crystal Cave' },
  { key: 'bgmAlt',   bpm: 98.5, title: 'Mysterious Ambience' },
];
export const BGM_TRACK = BGM_PLAYLIST[0];

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
    this.bufs = new Map();
    this.assetsPromise = null;
    this.bgmSrc = null;
    this.bgmGain = null;
    this.bgmFilter = null;
    this.bgmIndex = -1;      // 当前播到播放列表第几首
    this.bgmToken = 0;       // 每次 stop 递增，让过期的 onended 不会切歌
    this.paused = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume();
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

    // 0.6s：最长的噪声尾巴是 tierUp 的 0.45s。旧值 0.4s 会把尾巴
    // 硬切掉 50ms，听感像"噪声提前关门"。
    const len = Math.floor(this.ctx.sampleRate * 0.6);
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

  /**
   * 预加载外部样本。失败不抛：缺样本时合成层照常工作，
   * 游戏不会因为一个 404 变成静音。
   */
  loadAssets() {
    if (this.assetsPromise) return this.assetsPromise;
    if (!this.ctx) this.init();
    if (!this.ctx) return Promise.resolve(null);
    this.assetsPromise = Promise.all(Object.entries(SAMPLE_FILES).map(async ([key, file]) => {
      try {
        const res = await fetch(ASSET_BASE + file);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.bufs.set(key, buf);
      } catch {
        this.bufs.set(key, null);
      }
    }));
    return this.assetsPromise;
  }

  /** 播一个已加载的样本。返回 false 表示还没加载好，调用方可退回合成音。 */
  sample(key, { gain = 0.12, pan = 0, rate = 1, at = 0 } = {}) {
    if (!this.on) return false;
    const buf = this.bufs.get(key);
    if (!buf) return false;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.25, Math.min(4, rate));
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    const cleanBus = this._out(g, 'sfx', pan);
    src.onended = () => {
      cleanBus();
      try { src.disconnect(); g.disconnect(); } catch { /* 已断开 */ }
    };
    src.start(t0);
    src.stop(t0 + buf.duration / src.playbackRate.value + 0.03);
    return true;
  }

  /** 暂停/恢复整条音频链路。BGM 和音效都停在原地，恢复后接着播。 */
  setPaused(p) {
    this.paused = !!p;
    if (!this.ctx) return;
    if (this.paused) {
      if (this.ctx.state === 'running') this.ctx.suspend();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** 节奏跨档：一个短促的上行二音，档位越高越高 */
  tempoMark(mark = 1) {
    const f = [523.25, 659.25, 880.0][Math.min(2, Math.max(0, mark - 1))];
    this.tone({ freq: f, dur: 0.07, type: 'square', gain: 0.030 });
    this.tone({ freq: f * 1.5, dur: 0.13, type: 'sine', gain: 0.045, at: 0.06 });
  }

  /** 把节点接到总线；pan 非 0 时串一个 StereoPannerNode。
   *  返回清理函数：短音结束后必须把节点从总线上摘掉，否则 GainNode
   *  会一直挂在 sfxBus 上（源停了但图还在），一局下来攒上千个节点。 */
  _out(node, bus = 'sfx', pan = 0) {
    const dest = bus === 'music' ? this.musicBus : this.sfxBus;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      p.connect(dest);
      return () => { try { node.disconnect(); p.disconnect(); } catch { /* 已断开 */ } };
    }
    node.connect(dest);
    return () => { try { node.disconnect(); } catch { /* 已断开 */ } };
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
    let f = null;
    if (cutoff) {
      f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      f.Q.value = 0.7;
      g.connect(f);
      out = f;
    }
    const cleanBus = this._out(out, bus, pan);
    osc.onended = () => {
      cleanBus();
      try { osc.disconnect(); g.disconnect(); if (f) f.disconnect(); } catch { /* 已断开 */ }
    };
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
    const cleanBus = this._out(g, bus, pan);
    src.onended = () => {
      cleanBus();
      try { src.disconnect(); f.disconnect(); g.disconnect(); } catch { /* 已断开 */ }
    };
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

  /**
   * 外部 CC0 轻音乐播放列表。两首曲子等长感、同调式，交替播放避免单曲循环听腻。
   * 走 master 而不是 musicBus：musicBus 的 0.16 是给合成鼓组留的余量，
   * 一首成品曲子接上去会小到听不见。
   *
   * 音量 0.14（原来 0.26 偏吵）：轻音乐是钟声 + 琶音，高频本来就亮，
   * 再叠上消除音效容易盖过玩家自己制造的声音。压低之后音效仍然清楚。
   * 加一个 6.5kHz 低通把最刺耳的齿音磨掉，但保留钟声的泛音——
   * 截止再低就会把"水晶"质感一起滤没，变闷。
   */
  playBgm(gain = 0.14) {
    // 允许在 suspended 时排程：BGM 会在 resume 后从当前位置开始，
    // 这样"加载完成时刚好暂停"不会把 BGM 永久丢掉。
    if (!this.ctx || this.muted) return false;
    // 每次开一首都前进一格：-1→0（首次），0→1→0…（曲末自动接歌）。
    this.bgmIndex = (this.bgmIndex + 1) % BGM_PLAYLIST.length;
    const track = BGM_PLAYLIST[this.bgmIndex];
    const buf = this.bufs.get(track.key);
    if (!buf) return false;
    // 旧曲必须立刻停：fadeout 走 setTimeout，或在触发 BGM 切换/重开时
    // 新旧两首同时 loop，听感是"鼓点叠了一层"（mock 实测双播后 loops=2）。
    // 新曲自己有 0.35s 淡入，不需要旧曲再淡出。
    // stopBgm 会递增 token 使旧曲的 onended 失效，不会重复接歌。
    this.stopBgm(0);
    const token = this.bgmToken;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    // 单曲播完接下一首：不用 loop（loop 会把 49s 的尾巴硬接到开头），
    // 而是留 0.6s 淡出 + 0.35s 淡入，听感是一段完整的两曲轮换。
    src.loop = false;
    const g = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    lp.Q.value = 0.5;
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.35);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(now);
    src.onended = () => {
      // stopBgm 主动停时会清引用并递增 token，过期的 onended 不应再切歌。
      if (token !== this.bgmToken || src !== this.bgmSrc) return;
      this.playBgm(gain);
    };
    this.bgmSrc = src;
    this.bgmGain = g;
    this.bgmFilter = lp;
    return true;
  }

  /** 当前文件 BGM 的 BPM（音乐出球锁拍用；两首同 BPM）。 */
  get bgmBpm() {
    const track = BGM_PLAYLIST[this.bgmIndex < 0 ? 0 : this.bgmIndex];
    return track ? track.bpm : 0;
  }

  /** 当前文件 BGM 的曲名（HUD 显示用）。 */
  get bgmTitle() {
    const track = BGM_PLAYLIST[this.bgmIndex < 0 ? 0 : this.bgmIndex];
    return track ? track.title : '';
  }

  stopBgm(fade = 0.3) {
    const src = this.bgmSrc;
    const g = this.bgmGain;
    const lp = this.bgmFilter;
    this.bgmSrc = null;
    this.bgmGain = null;
    this.bgmFilter = null;
    this.bgmToken++;   // 让正在播的那首的 onended 失效，不会自动接下一首
    if (!src || !g || !this.ctx) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.01, fade));
    const finish = () => {
      try { src.stop(); } catch { /* 已停止 */ }
      try { src.disconnect(); lp?.disconnect(); g.disconnect(); } catch { /* 已断开 */ }
    };
    // fade=0 是"立刻换歌"：同步停掉，避免两首 BGM 同场循环。
    if (fade <= 0.01) finish();
    else setTimeout(finish, fade * 1000 + 80);
  }

  get bgmPlaying() {
    return !!this.bgmSrc;
  }

  /** 每帧调用：把未来 0.2 秒内的音符排出去 */
  update() {
    if (!this.on || !this.musicWanted) return;
    const now = this.ctx.currentTime;
    if (this.nextStepTime < now) this.nextStepTime = now + 0.03;
    let guard = 0;
    const len = TWINKLE.length * 2;   // 每拍两个八分音符
    while (this.nextStepTime < now + 0.2 && guard++ < 10) {
      this.scheduleStep(this.step, this.nextStepTime - now);
      this.step = (this.step + 1) % len;
      this.nextStepTime += this.stepDur;
    }
  }

  /**
   * 小星星。旋律在拍头，反拍只有很轻的踩镲——它必须让"拍点"听得出来，
   * 但又不能盖过消除音效（出球贴拍之后，玩家会主动去听这一下）。
   */
  scheduleStep(step, at) {
    const beat = step >> 1;          // 第几拍（0..47）
    const sub = step & 1;            // 0 = 拍头，1 = 反拍
    const bar = step >> 3;           // 第几小节（0..11）
    const k = this.intensity;
    const beatSec = 60 / this.bpm;

    if (sub === 0) {
      const name = TWINKLE[beat];
      if (name && name !== '-') {
        const f = NOTE[name];
        // 主旋律：triangle 的泛音少、不刺，接近玩具钢琴。
        this.tone({
          freq: f, dur: beatSec * 0.82, type: 'triangle',
          gain: 0.30, at, bus: 'music',
        });
        // 高八度的一点点泛音：只在"音乐盒"的亮度上加一层，不构成第二个声部。
        this.tone({
          freq: f * 2, dur: beatSec * 0.45, type: 'sine',
          gain: 0.045, at, bus: 'music',
        });
      }
      // 轻底鼓：每拍一下，音量刻意小于旋律（原来 0.55 会把旋律压掉）。
      this.tone({ freq: 118, to: 46, dur: 0.11, type: 'sine', gain: 0.20, at, bus: 'music' });
      // 低音：每小节第一拍
      if (step % 8 === 0) {
        this.tone({
          freq: TWINKLE_BASS[bar % TWINKLE_BASS.length],
          dur: beatSec * 1.85, type: 'sine', gain: 0.24, at, bus: 'music',
        });
      }
    } else {
      // 反拍踩镲：强度越高越亮
      this.noise({ dur: 0.024, gain: 0.014 + 0.032 * k, freq: 8200, q: 1.1, at, bus: 'music' });
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

  // ---------- 外部样本层 ----------
  // 只加材质，不替代音高层：角度→音高、颜色→音色仍由合成负责。
  glass(rank = 0, pan = 0) {
    const key = rank >= 2 ? 'glassHeavy' : rank >= 1 ? 'glassMedium' : 'glassLight';
    return this.sample(key, { gain: rank >= 2 ? 0.20 : rank >= 1 ? 0.15 : 0.09, pan });
  }

  metal(pan = 0) { return this.sample('metalLight', { gain: 0.09, pan }); }
  blast(pan = 0) { return this.sample('blast', { gain: 0.18, pan }); }
  dice(pan = 0) { return this.sample('diceThrow', { gain: 0.12, pan }); }
  card(pan = 0) { return this.sample('cardPlace', { gain: 0.10, pan }); }
  cardSlide(pan = 0) { return this.sample('cardSlide', { gain: 0.06, pan }); }
  chip(pan = 0) { return this.sample('chipLay', { gain: 0.10, pan }); }
  uiClick() { return this.sample('uiClick', { gain: 0.10 }); }
  uiConfirm() { return this.sample('uiConfirm', { gain: 0.10 }); }
  uiSwitch() { return this.sample('uiSwitch', { gain: 0.10 }); }
  jingle(win = false) {
    return this.sample(win ? 'jingleWin' : 'jingleEnd', { gain: 0.22 });
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
    this.glass(2, pan);
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
    this.sample('forceField', { gain: 0.05 });
    this.tone({ freq: 880, to: 1320, dur: 0.10, type: 'sine', gain: 0.022 });
    this.noise({ dur: 0.045, gain: 0.016, freq: 5200, q: 1.2 });
  }

  click() { this.uiClick(); this.tone({ freq: 470, to: 300, dur: 0.05, type: 'triangle', gain: 0.08 }); }

  /** 翻面槽 / 翻面骰：一声"拨片弹过去"的上滑 + 骰子落桌 */
  flipPad() {
    this.cardSlide();
    this.tone({ freq: 620, to: 1180, dur: 0.075, type: 'square', gain: 0.045 });
    this.noise({ dur: 0.045, gain: 0.05, freq: 3600, q: 1.1, at: 0.03 });
    this.tone({ freq: 240, to: 180, dur: 0.06, type: 'triangle', gain: 0.05, at: 0.05 });
  }

  /** 爆破球：低频下坠 + 一层宽噪，要"闷"不要"脆"——脆会读成消除音 */
  boom() {
    this.blast();
    this.tone({ freq: 96, to: 34, dur: 0.36, type: 'sine', gain: 0.30 });
    this.tone({ freq: 210, to: 80, dur: 0.16, type: 'square', gain: 0.05 });
    this.noise({ dur: 0.28, gain: 0.15, freq: 820, q: 0.55 });
  }

  /** 锈球注入：金属摩擦感，短促、干、不带尾音，和任何"得分"音区分开 */
  clank() {
    this.metal();
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
    // 材质层：三消是玻璃、骰子是落桌、扑克是纸牌。
    // 它先于合成音出现，负责"这一下是什么东西碎了/放下了"。
    if (kind === 'same' || kind === 'run') this.dice(pan);
    else if (kind) this.card(pan);
    else this.glass(rank, pan);
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

  select() {
    this.uiClick();
    this.tone({ freq: 720, dur: 0.045, type: 'triangle', gain: 0.05 });
  }

  confirm() {
    this.uiConfirm();
    this.tone({ freq: 520, dur: 0.08, type: 'triangle', gain: 0.08 });
    this.tone({ freq: 780, dur: 0.12, type: 'sine', gain: 0.06, at: 0.06 });
  }
}
