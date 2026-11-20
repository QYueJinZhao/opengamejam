// 纯逻辑层：无 DOM、无渲染、无随机时间源，可在 Node 里直接跑。
// 固定步长驱动，同种子同输入 → 完全确定。

import { L, N, D, mod } from './geom.js';

export const PALETTE = [
  { key: 'r', base: '#FF4D5A', light: '#FFA7AE', dark: '#8E1B26', glyph: 'circle',  name: '红' },
  { key: 'b', base: '#3FA9FF', light: '#A6D8FF', dark: '#124E80', glyph: 'triangle', name: '蓝' },
  { key: 'g', base: '#FFC53D', light: '#FFE9A8', dark: '#8A5C00', glyph: 'square',   name: '金' },
  { key: 'p', base: '#B26BFF', light: '#DFC0FF', dark: '#5A2A93', glyph: 'diamond',  name: '紫' },
];

export const CFG = {
  vMax: 13.0,          // 最大带速（格/秒）
  accel: 55.0,         // 线加速度（格/秒²）
  dampK: 9.0,          // 松手阻尼系数（1/秒）—— 帧率无关
  drift: 1.35,         // 基础带速：皮带永远在走，防"原地堆珠"
  stopEps: 0.12,       // 停机阈值
  brakeMagnet: 4.0,    // 低于此速度按急停可磁吸对齐
  flightTime: 0.203,   // 飞行时长（秒）
  beatStart: 2.40,
  beatEnd: 1.30,
  rampSec: 90,
  levelTime: 90,
  startBeads: 10,
  colorUnlockAt: 25,   // 前 25 秒 3 色（教学），之后 4 色
};

const CHAIN_MULT = [1, 2, 4, 8, 12];
const BASE_SCORE = (n) => (n === 3 ? 300 : n === 4 ? 500 : 800 + 400 * Math.max(0, n - 5));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let beadSeq = 1;

export class Game {
  constructor(seed = 20261120) {
    this.seed = seed;
    this.reset();
  }

  reset() {
    this.rng = mulberry32(this.seed);
    this.slots = new Array(N).fill(null);
    this.phase = 0;          // 单位：槽（连续）
    this.v = 0;              // 格/秒
    this.input = 0;
    this.time = 0;
    this.beatClock = 0;
    this.beat = CFG.beatStart;
    this.ball = null;        // { ci, t }
    this.nextCi = 0;

    this.score = 0;
    this.chain = 0;
    this.chainT = -99;
    this.maxChain = 0;
    this.combo = 0;          // 连续有效接球
    this.shots = 0;
    this.clears = 0;
    this.dead = false;
    this.deadReason = null;
    this.events = [];
    this.fx = [];

    // 开局阵型：程序化生成，保证不出现现成三连（否则第一发就白送）
    const maxCi = this.colorCount();
    let p1 = -1, p2 = -1;
    for (let i = 0; i < CFG.startBeads; i++) {
      let c = 0;
      for (let tries = 0; tries < 24; tries++) {
        c = Math.floor(this.rng() * maxCi);
        if (!(c === p1 && c === p2)) break;
      }
      this.slots[i] = this.makeBead(c);
      p2 = p1;
      p1 = c;
    }
    this.nextCi = 2;
  }

  makeBead(ci) {
    return { id: beadSeq++, ci, dx: 0, pop: 0 };
  }

  occupied() {
    let n = 0;
    for (let i = 0; i < N; i++) if (this.slots[i]) n++;
    return n;
  }

  colorCount() {
    return this.time >= CFG.colorUnlockAt ? 4 : 3;
  }

  // ---- 发色权重：按场上存量加权，冷门色不连出超过 2 发 ----
  pickColor() {
    const maxCi = this.colorCount();
    const count = new Array(4).fill(0);
    for (const b of this.slots) if (b) count[b.ci]++;

    const present = [];
    for (let i = 0; i < maxCi; i++) if (count[i] > 0) present.push(i);

    if (present.length === 0) return Math.floor(this.rng() * maxCi);

    // 78% 按存量加权；22% 均匀（用于引入新色）
    if (this.rng() < 0.78) {
      let total = 0;
      for (const i of present) total += count[i];
      let r = this.rng() * total;
      for (const i of present) {
        r -= count[i];
        if (r <= 0) return i;
      }
      return present[present.length - 1];
    }
    return Math.floor(this.rng() * maxCi);
  }

  // ---- 每固定步 ----
  step(dt) {
    if (this.dead) return;

    this.time += dt;
    const t = Math.min(1, this.time / CFG.rampSec);
    this.beat = CFG.beatStart + (CFG.beatEnd - CFG.beatStart) * t;

    // 转轮：皮带自带基础带速，玩家只在它之上加减速
    const dir = this.input;
    if (dir !== 0) {
      this.v += dir * CFG.accel * dt;
    } else {
      this.v = CFG.drift + (this.v - CFG.drift) * Math.exp(-CFG.dampK * dt);
    }
    this.v = Math.max(-CFG.vMax, Math.min(CFG.vMax, this.v));
    this.phase = mod(this.phase + this.v * dt, N);

    // 视觉位移回弹
    const decay = Math.exp(-dt * 26);
    for (const b of this.slots) if (b) b.dx *= decay;
    if (this.chain > 0 && this.time - this.chainT > 1.1) this.chain = 0;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].life -= dt;
      if (this.fx[i].life <= 0) this.fx.splice(i, 1);
    }

    // 节拍发球
    this.beatClock += dt;
    if (this.beatClock >= this.beat) {
      this.beatClock -= this.beat;
      this.fire();
    }

    // 飞行
    if (this.ball) {
      this.ball.t += dt;
      if (this.ball.t >= CFG.flightTime) this.land();
    }

    if (this.time >= CFG.levelTime) this.kill('time');
  }

  fire() {
    this.ball = { ci: this.nextCi, t: 0 };
    this.nextCi = this.pickColor();
    this.shots++;
    this.events.push({ type: 'fire', ci: this.ball.ci });
  }

  impactSlot() {
    return mod(Math.round(-this.phase), N);
  }

  land() {
    const ball = this.ball;
    this.ball = null;
    const k = this.impactSlot();

    if (this.occupied() >= N) { this.kill('overflow'); return; }

    const bead = this.makeBead(ball.ci);
    const cell = this.slots[k];

    if (cell === null) {
      // 落进空档：球直接停在空皮带上，成为一颗孤立珠。
      // 它不污染已有色段，但白占一格；若恰好卡进两侧同色的单格缺口，仍可成立三消。
      this.slots[k] = bead;
      this.events.push({ type: 'lone', slot: k, ci: ball.ci, s: mod(k + this.phase, N) * D });
      this.resolve();
      return;
    }

    // 插进珠链：向较近的空档方向整体推开
    const p = this.nearestNull(k, +1);
    const q = this.nearestNull(k, -1);
    if (p < 0 && q < 0) { this.kill('overflow'); return; }

    if (p >= 0 && (q < 0 || p <= q)) {
      for (let i = p; i >= 1; i--) {
        const dst = mod(k + i, N), src = mod(k + i - 1, N);
        this.slots[dst] = this.slots[src];
        if (this.slots[dst]) this.slots[dst].dx -= 1;
      }
    } else {
      for (let i = -q; i <= -1; i++) {
        const dst = mod(k + i, N), src = mod(k + i + 1, N);
        this.slots[dst] = this.slots[src];
        if (this.slots[dst]) this.slots[dst].dx += 1;
      }
    }
    this.slots[k] = bead;
    this.events.push({ type: 'insert', slot: k, ci: ball.ci, s: mod(k + this.phase, N) * D });

    this.resolve(k);
  }

  nearestNull(k, dir) {
    for (let i = 1; i <= N; i++) {
      if (this.slots[mod(k + dir * i, N)] === null) return i;
    }
    return -1;
  }

  // ---- 消除 + 连锁（同帧算完，表现层自己排队播）----
  resolve() {
    let chain = 0;
    for (let guard = 0; guard < 24; guard++) {
      const run = this.findMatch();
      if (!run) break;

      chain++;
      const mult = CHAIN_MULT[Math.min(chain - 1, CHAIN_MULT.length - 1)];
      const gain = BASE_SCORE(run.len) * mult;
      this.score += gain;
      this.clears++;

      const colors = [];
      const positions = [];
      for (let i = 0; i < run.len; i++) {
        const idx = mod(run.start + i, N);
        const b = this.slots[idx];
        colors.push(b.ci);
        positions.push(mod(idx + this.phase, N) * D);
        this.slots[idx] = null;
      }

      this.events.push({ type: 'clear', chain, gain, colors, positions, len: run.len });

      // 断口合拢：把洞后面那一段整体拉回 len 格
      this.compact(run.start, run.len);
    }

    if (chain > 0) {
      this.chain = chain;
      this.chainT = this.time;
      this.maxChain = Math.max(this.maxChain, chain);
      this.combo++;
    } else {
      this.chain = 0;
      this.combo = 0;
    }
  }

  findMatch() {
    for (let i = 0; i < N; i++) {
      const b = this.slots[i];
      if (!b) continue;
      const prev = this.slots[mod(i - 1, N)];
      // 只在色段起点起扫
      if (prev && prev.ci === b.ci) continue;

      let len = 1;
      while (len < N) {
        const nb = this.slots[mod(i + len, N)];
        if (!nb || nb.ci !== b.ci) break;
        len++;
      }
      if (len >= 3) return { start: i, len };
    }
    return null;
  }

  compact(start, len) {
    const end = mod(start + len, N);
    // 洞后面紧邻的连续段
    let run = 0;
    while (run < N - len && this.slots[mod(end + run, N)] !== null) run++;
    if (run === 0) return;

    for (let i = 0; i < run; i++) {
      const dst = mod(start + i, N);
      const src = mod(end + i, N);
      this.slots[dst] = this.slots[src];
      this.slots[src] = null;
      if (this.slots[dst]) this.slots[dst].dx += len;
    }
  }

  kill(reason) {
    if (this.dead) return;
    this.dead = true;
    this.deadReason = reason;
    this.events.push({ type: 'dead', reason });
  }

  // ---- 输入 ----
  setInput(dir) { this.input = dir; }

  brake() {
    if (Math.abs(this.v) <= CFG.brakeMagnet) {
      this.phase = Math.round(this.phase) % N;   // 磁吸对齐槽心
    }
    this.v = 0;
  }

  // ---- 渲染辅助 ----
  beadWorldS(slot) {
    return mod(slot + this.phase, N) * D;
  }

  // 飞行剩余时间归一（0=刚发射，1=即将命中）
  flightProgress() {
    return this.ball ? Math.min(1, this.ball.t / CFG.flightTime) : 0;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
