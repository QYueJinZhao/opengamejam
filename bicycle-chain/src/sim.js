// 纯逻辑层：无 DOM、无渲染、无随机时间源，可在 Node 里直接跑。
// 固定步长驱动，同种子同输入 → 完全确定。
//
// M1 关键变更：单喷头 → 双喷头。
// 两个落点在 slot 坐标下相距半圈（N/2），共用同一个 phase：
//   phase 为 0 时，主落点压在 slot 0，副落点压在 slot 14。
// 也就是说「转动轮盘」这一个动作，会同时把两段珠链送到各自落点上——
// 玩家永远无法两边都照顾到，机会成本是结构性的，不靠惩罚规则堆出来。

import { L, N, D, mod } from './geom.js';

export const PALETTE = [
  { key: 'r', base: '#FF4D5A', light: '#FFA7AE', dark: '#8E1B26', glyph: 'circle',   name: '红' },
  { key: 'b', base: '#3FA9FF', light: '#A6D8FF', dark: '#124E80', glyph: 'triangle', name: '蓝' },
  { key: 'g', base: '#FFC53D', light: '#FFE9A8', dark: '#8A5C00', glyph: 'square',   name: '金' },
  { key: 'p', base: '#B26BFF', light: '#DFC0FF', dark: '#5A2A93', glyph: 'diamond',  name: '紫' },
  { key: 'c', base: '#2FE6C8', light: '#A8FFF2', dark: '#0B6B5C', glyph: 'cross',    name: '青' },
];

/** 两个喷头的落点偏移（slot 单位），相距半圈 */
export const NOZZLE_OFF = [0, N / 2];

export const CFG = {
  vMax: 13.0,          // 最大带速（格/秒）
  accel: 55.0,         // 线加速度（格/秒²）
  dampK: 9.0,          // 松手阻尼系数（1/秒）—— 帧率无关
  drift: 1.35,         // 基础带速：皮带永远在走，防"原地堆珠"
  stopEps: 0.12,       // 停机阈值
  brakeMagnet: 4.0,    // 低于此速度按急停可磁吸对齐
  flightTime: 0.203,   // 飞行时长（秒）
  beatStart: 3.40,     // 双喷头信息量翻倍，起手节拍必须放松
  beatEnd: 2.05,
  rampSec: 90,
  levelTime: 90,
  nozzle2At: 20,       // 20 秒前只有顶部一个喷头，先教会"接球"再教"取舍"
  startBeads: 8,       // 两段各 4 颗，各自跨过自己的落点
  // 颜色解锁阶梯：[时间, 颜色数]。3 色太容易消、盘面抽干，直接从 4 色起手
  colorSteps: [[0, 4], [45, 5]],
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
    this.balls = [];         // 飞行中的球组：{ ci, off, t }
    this.nozzleCi = [0, 0];  // 两个喷头的待发色

    this.score = 0;
    this.chain = 0;
    this.chainT = -99;
    this.maxChain = 0;
    this.combo = 0;          // 连续有效接球
    this.shots = 0;          // 发球次数（按拍计）
    this.drops = 0;          // 落球总颗数
    this.clears = 0;
    this.lone = 0;           // 落空次数（整盘全空，极小概率）
    this.snapped = 0;        // 落点为空、球吸附到最近珠子的次数
    this.dead = false;
    this.deadReason = null;
    this.events = [];
    this.fx = [];

    // 开局阵型：两段珠链，各自以自己的落点为中心展开；段内不出现现成三连
    const half = Math.max(2, Math.floor(CFG.startBeads / 2));
    const back = Math.floor(half / 2);
    const layout = [];
    for (let i = 0; i < half; i++) layout.push(i - back);
    for (let i = 0; i < half; i++) layout.push(N / 2 + i - back);
    const maxCi = this.colorCount();
    let p1 = -1, p2 = -1;
    for (const idx of layout) {
      let c = 0;
      for (let tries = 0; tries < 24; tries++) {
        c = Math.floor(this.rng() * maxCi);
        if (!(c === p1 && c === p2)) break;
      }
      this.slots[mod(idx, N)] = this.makeBead(c);
      p2 = p1;
      p1 = c;
    }
    this.nozzleCi = [this.pickColor(), this.pickColor()];
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
    let n = 3;
    for (const [t, c] of CFG.colorSteps) if (this.time >= t) n = c;
    return Math.min(n, PALETTE.length);
  }

  /** 当前激活的喷头数：前 20 秒只有一个落点 */
  nozzleCount() {
    return this.time >= CFG.nozzle2At ? 2 : 1;
  }

  // ---- 发色权重：按场上存量加权，冷门色不连出超过 2 发 ----
  pickColor() {
    const maxCi = this.colorCount();
    const count = new Array(PALETTE.length).fill(0);
    for (const b of this.slots) if (b) count[b.ci]++;

    const present = [];
    for (let i = 0; i < maxCi; i++) if (count[i] > 0) present.push(i);

    if (present.length === 0) return Math.floor(this.rng() * maxCi);

    // 有颜色在盘面上缺席时（新解锁 / 刚被消光），先把它引回来，
    // 否则新颜色永远等不到 22% 均匀抽样那一档，5 色关卡会一直是 4 色。
    if (present.length < maxCi && this.rng() < 0.38) {
      const missing = [];
      for (let i = 0; i < maxCi; i++) if (count[i] === 0) missing.push(i);
      if (missing.length) return missing[Math.floor(this.rng() * missing.length)];
    }

    // 78% 按存量加权；22% 均匀（保持随机性）
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
    if (this.balls.length) {
      for (const b of this.balls) b.t += dt;
      if (this.balls[0].t >= CFG.flightTime) this.land();
    }

    if (this.time >= CFG.levelTime) this.kill('time');
  }

  fire() {
    const n = this.nozzleCount();
    this.balls = NOZZLE_OFF.slice(0, n).map((off, i) => ({ ci: this.nozzleCi[i], off, t: 0 }));
    // 每次发球都刷新两个喷头的待发色，保证副喷头激活时颜色已经就绪
    this.nozzleCi = [this.pickColor(), this.pickColor()];
    this.shots++;
    this.drops += this.balls.length;
    this.events.push({ type: 'fire', colors: this.balls.map((b) => b.ci), n });
  }

  /** 落点对应的槽位。off 为喷头偏移（0 或 N/2） */
  impactSlot(off = 0) {
    return mod(Math.round(-this.phase) + off, N);
  }

  land() {
    const balls = this.balls;
    this.balls = [];
    // 先把两个落点槽算死，再依次落球：
    // 第一颗的推挤会挪动珠子，但落点槽本身只由 phase 决定，不跟着动。
    const targets = balls.map((b) => ({
      k: mod(Math.round(-this.phase) + b.off, N),
      ci: b.ci,
      off: b.off,
    }));
    for (const t of targets) this.dropAt(t.k, t.ci, t.off);
  }

  dropAt(k, ci, off) {
    if (this.dead) return;
    if (this.occupied() >= N) { this.kill('overflow'); return; }

    const bead = this.makeBead(ci);
    const wasEmpty = this.slots[k] === null;
    // 落点为空时，球不会钉在空皮带上，而是吸附到最近的珠子、插进链里。
    // 这是祖玛的正统行为：球永远属于某条链，"接空"的代价是插到了你不想要的地方。
    const target = wasEmpty ? this.snap(k) : k;
    if (wasEmpty && target !== k) this.snapped++;

    if (this.slots[target] === null) {
      // 整盘全空（极小概率）：直接落在落点
      this.slots[target] = bead;
      this.events.push({ type: 'lone', slot: target, ci, off, s: mod(target + this.phase, N) * D });
      this.resolve(target, off);
      return;
    }

    // 插进珠链：向较近的空档方向整体推开
    const p = this.nearestNull(target, +1);
    const q = this.nearestNull(target, -1);
    if (p < 0 && q < 0) { this.kill('overflow'); return; }

    if (p >= 0 && (q < 0 || p <= q)) {
      for (let i = p; i >= 1; i--) {
        const dst = mod(target + i, N), src = mod(target + i - 1, N);
        this.slots[dst] = this.slots[src];
        if (this.slots[dst]) this.slots[dst].dx -= 1;
      }
    } else {
      for (let i = -q; i <= -1; i++) {
        const dst = mod(target + i, N), src = mod(target + i + 1, N);
        this.slots[dst] = this.slots[src];
        if (this.slots[dst]) this.slots[dst].dx += 1;
      }
    }
    this.slots[target] = bead;
    this.events.push({
      type: 'insert', slot: target, ci, off,
      s: mod(target + this.phase, N) * D,
      snapped: wasEmpty && target !== k,
      dropSlot: k,
    });

    this.resolve(target, off);
  }

  /** 落点为空时，找最近的非空槽作为插入点 */
  snap(k) {
    const p = this.nearestBead(k, +1);
    const q = this.nearestBead(k, -1);
    if (p < 0 && q < 0) return k;
    if (p >= 0 && (q < 0 || p <= q)) return mod(k + p, N);
    return mod(k - q, N);
  }

  nearestBead(k, dir) {
    for (let i = 1; i <= N; i++) {
      if (this.slots[mod(k + dir * i, N)] !== null) return i;
    }
    return -1;
  }

  nearestNull(k, dir) {
    for (let i = 1; i <= N; i++) {
      if (this.slots[mod(k + dir * i, N)] === null) return i;
    }
    return -1;
  }

  // ---- 消除 + 连锁（同帧算完，表现层自己排队播）----
  resolve(startSlot = -1, off = 0) {
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

      this.events.push({ type: 'clear', chain, gain, colors, positions, len: run.len, off });

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
    return this.balls.length ? Math.min(1, this.balls[0].t / CFG.flightTime) : 0;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
