// 纯逻辑层：无 DOM、无渲染、无随机时间源，可在 Node 里直接跑。
// 固定步长驱动，同种子同输入 → 完全确定。
//
// 结构与上一版的关键差异：
// 1. 每个射口有一个 3 球预览队列（当前 + 下两颗），玩家能提前规划；
// 2. 射口数量 / 落点间距 / 轮径 / 槽数全部由 modes.js 决定；
// 3. 三射口模式「轮转两发」：每拍只有一个口休息，下拍换一个，压力仍是 2 球/拍；
// 4. 新增跨节拍连击 RUSH：连续每拍都有消除才涨，断一拍就归零，是主要得分杠杆。

import { N, D, mod, configure } from './geom.js';
import { getMode } from './modes.js';

// ---- 球种：色相 + 明度 + 内部纹样 + 中心形符，四重编码 ----
// 目的：色弱玩家靠「纹样 + 形符 + 明暗」也能区分，不依赖色相。
export const PALETTE = [
  { key: 'r', name: '红', base: '#FF3B4E', light: '#FFA6B0', dark: '#7C0F1A', glyph: 'dot',     pat: 'ring',   ink: '#FFF4F5' },
  { key: 'b', name: '蓝', base: '#2E86FF', light: '#A9CFFF', dark: '#0A3A78', glyph: 'tri',     pat: 'stripe', ink: '#F4F8FF' },
  { key: 'g', name: '金', base: '#FFC93C', light: '#FFF0B8', dark: '#7F5200', glyph: 'square',  pat: 'plate',  ink: '#2B1D00' },
  { key: 'p', name: '紫', base: '#A855F7', light: '#DCB6FF', dark: '#42157F', glyph: 'diamond', pat: 'dots',   ink: '#FFF0FF' },
  { key: 'c', name: '青', base: '#12E0B8', light: '#9BFFF1', dark: '#045348', glyph: 'cross',   pat: 'double', ink: '#00241E' },
];

export const BASE_CFG = {
  vMax: 13.0,
  accel: 55.0,
  dampK: 9.0,
  drift: 1.35,
  stopEps: 0.12,
  brakeMagnet: 4.0,
  // 飞行时长：0.203 太快，肉眼只看到一闪就到链上，读不出轨迹。
  // 慢到 0.32 之后球有可见的抛物线，也留出临门一脚的修正窗口。
  // 代价是链条在飞行期间会滑过半格（drift 1.35 × 0.32 ≈ 0.43 槽），
  // 所以渲染层必须同步画出「落点预览」，否则玩家会觉得"明明对准了却差一格"。
  flightTime: 0.34,
  beatStart: 3.40,
  beatEnd: 2.05,
  rampSec: 90,
  levelTime: 90,
  startBeads: 8,
  colorSteps: [[0, 4], [45, 5]],
  stages: [[0, 1], [20, 2]],
  volley: 2,
  rotate: false,
};

export const CFG = { ...BASE_CFG };

const CHAIN_MULT = [1, 1.6, 2.6, 4.2, 6.5, 9.0];
// 连消倍率：按累计消除数递增，2.6 秒内没有新消除就断。
// 之所以不按「每拍都必须消」来算，是因为实测每拍平均只有 0.56 次消除，
// 那个条件等于永远拿不到加成（机器人峰值连击只有 3.6）。
const COMBO_MULT = [1, 1, 1.1, 1.2, 1.35, 1.5, 1.65, 1.8, 2.0, 2.2, 2.4, 2.6, 2.9, 3.2, 3.5, 3.8, 4.1, 4.4, 4.7, 5.0, 5.3];
const COMBO_WINDOW = 3.0;
const BASE_SCORE = (n) => (n === 3 ? 300 : n === 4 ? 500 : 800 + 400 * Math.max(0, n - 5));
const SWEEP_BONUS = 1500;

/** 连消倍率（渲染层与逻辑层共用同一张表，避免 HUD 显示和实际结算不一致） */
export function comboMult(n) {
  return COMBO_MULT[Math.min(Math.max(n, 0), COMBO_MULT.length - 1)];
}

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
  constructor(seed = 20261120, modeId = 'standard') {
    this.mode = getMode(modeId);
    this.modeId = this.mode.id;
    // 先改几何，再建盘面：N / D 是 live binding，后面所有代码读到的都是新值
    configure(this.mode.geo);
    this.nozzleOff = Array.from(
      { length: this.mode.layout },
      (_, i) => Math.round((i * N) / this.mode.layout)
    );
    Object.assign(CFG, BASE_CFG, this.mode.cfg);
    this.seed = seed;
    this.reset();
  }

  reset() {
    this.rng = mulberry32(this.seed);
    this.slots = new Array(N).fill(null);
    this.phase = 0;
    this.v = 0;
    this.input = 0;
    this.time = 0;
    this.beatClock = 0;
    this.beat = CFG.beatStart;
    this.balls = [];

    // 每个射口独立的三球队列：queues[i][0] 是待发球，[1][2] 是预览
    this.queues = Array.from({ length: this.mode.layout }, () => [
      this.pickColor(), this.pickColor(), this.pickColor(),
    ]);

    this.score = 0;
    this.chain = 0;
    this.chainT = -99;
    this.maxChain = 0;
    this.combo = 0;          // 连消：累计消除数，窗口内没有新消除才断
    this.comboT = -99;
    this.maxCombo = 0;
    this.volleyIndex = 0;    // 三射口：下一个休息的口
    this.shots = 0;
    this.drops = 0;
    this.clears = 0;
    this.lone = 0;
    this.snapped = 0;
    this.sweeps = 0;
    this.dead = false;
    this.deadReason = null;
    this.events = [];

    this.placeOpening();
  }

  // 开局阵型：每个落点周围铺一段，段内不允许出现现成三连
  placeOpening() {
    const offs = this.nozzleOff.slice(0, this.mode.layout);
    const per = Math.max(2, Math.floor(CFG.startBeads / offs.length));
    const back = Math.floor(per / 2);
    const maxCi = this.colorCount();
    for (const off of offs) {
      for (let i = 0; i < per; i++) {
        const idx = mod(off + i - back, N);
        let ci = 0;
        for (let tries = 0; tries < 30; tries++) {
          ci = Math.floor(this.rng() * maxCi);
          if (!this.wouldTriple(idx, ci)) break;
        }
        this.slots[idx] = this.makeBead(ci);
      }
    }
  }

  wouldTriple(idx, ci) {
    const at = (j) => {
      if (j === idx) return ci;
      const b = this.slots[mod(j, N)];
      return b ? b.ci : -1;
    };
    for (let s = -2; s <= 0; s++) {
      let ok = true;
      for (let k = 0; k < 3; k++) {
        if (at(idx + s + k) !== ci) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
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

  /** 当前激活的射口数 */
  nozzleCount() {
    let n = 1;
    for (const [t, c] of CFG.stages) if (this.time >= t) n = c;
    return Math.min(n, this.mode.layout);
  }

  /** 下一拍实际开火的射口（三射口模式会轮休一个） */
  nextVolley() {
    const n = this.nozzleCount();
    if (!CFG.rotate || n < 3) {
      return Array.from({ length: n }, (_, i) => i);
    }
    const v = Math.min(CFG.volley ?? 2, n);
    const out = [];
    for (let k = 0; k < v; k++) out.push((this.volleyIndex + k) % n);
    return out;
  }

  // ---- 发色权重：按场上存量加权，冷门色强制召回 ----
  pickColor() {
    const maxCi = this.colorCount();
    const count = new Array(PALETTE.length).fill(0);
    for (const b of this.slots) if (b) count[b.ci]++;

    const present = [];
    for (let i = 0; i < maxCi; i++) if (count[i] > 0) present.push(i);
    if (present.length === 0) return Math.floor(this.rng() * maxCi);

    // 有颜色缺席时（新解锁 / 刚被消光）先把它引回来，
    // 否则新颜色永远等不到均匀抽样那一档。
    if (present.length < maxCi && this.rng() < 0.38) {
      const missing = [];
      for (let i = 0; i < maxCi; i++) if (count[i] === 0) missing.push(i);
      if (missing.length) return missing[Math.floor(this.rng() * missing.length)];
    }

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

    const dir = this.input;
    if (dir !== 0) {
      this.v += dir * CFG.accel * dt;
    } else {
      this.v = CFG.drift + (this.v - CFG.drift) * Math.exp(-CFG.dampK * dt);
    }
    this.v = Math.max(-CFG.vMax, Math.min(CFG.vMax, this.v));
    this.phase = mod(this.phase + this.v * dt, N);

    const decay = Math.exp(-dt * 26);
    for (const b of this.slots) if (b) b.dx *= decay;
    if (this.chain > 0 && this.time - this.chainT > 1.1) this.chain = 0;
    if (this.combo > 0 && this.time - this.comboT > COMBO_WINDOW) {
      if (this.combo >= 3) this.events.push({ type: 'combobreak', combo: this.combo });
      this.combo = 0;
    }

    this.beatClock += dt;
    if (this.beatClock >= this.beat) {
      this.beatClock -= this.beat;
      this.fire();
    }

    if (this.balls.length) {
      for (const b of this.balls) b.t += dt;
      if (this.balls[0].t >= CFG.flightTime) this.land();
    }

    if (this.time >= CFG.levelTime) this.kill('time');
  }

  fire() {
    const n = this.nozzleCount();
    const idxs = this.nextVolley();
    if (CFG.rotate && n >= 3) this.volleyIndex = (this.volleyIndex + 1) % n;

    this.balls = idxs.map((i) => {
      const ci = this.queues[i][0];
      this.queues[i].shift();
      this.queues[i].push(this.pickColor());
      return { ci, off: this.nozzleOff[i], idx: i, t: 0 };
    });

    this.shots++;
    this.drops += this.balls.length;
    this.events.push({
      type: 'fire',
      colors: this.balls.map((b) => b.ci),
      offs: this.balls.map((b) => b.off),
      n: this.balls.length,
    });
  }

  impactSlot(off = 0) {
    return mod(Math.round(-this.phase) + off, N);
  }

  land() {
    const balls = this.balls;
    this.balls = [];
    // 先把落点槽算死，再依次落球：推挤会挪动珠子，但落点只由 phase 决定
    const targets = balls.map((b) => ({
      k: mod(Math.round(-this.phase) + b.off, N),
      ci: b.ci,
      off: b.off,
      idx: b.idx,
    }));
    for (const t of targets) this.dropAt(t.k, t.ci, t.off);
  }

  dropAt(k, ci, off) {
    if (this.dead) return;
    if (this.occupied() >= N) { this.kill('overflow'); return; }

    const bead = this.makeBead(ci);
    const wasEmpty = this.slots[k] === null;
    const target = wasEmpty ? this.snap(k) : k;
    if (wasEmpty && target !== k) this.snapped++;

    if (this.slots[target] === null) {
      this.slots[target] = bead;
      this.events.push({ type: 'lone', slot: target, ci, off, s: mod(target + this.phase, N) * D });
      this.resolve(target, off);
      return;
    }

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

  // ---- 消除 + 连锁 + 连消 ----
  resolve(startSlot = -1, off = 0) {
    let chain = 0;
    for (let guard = 0; guard < 24; guard++) {
      const run = this.findMatch();
      if (!run) break;

      chain++;
      // 连消按「消掉的颗数」累加：一次四消直接 +4，比按次数累加更容易起势，
      // 也更符合玩家对"连消"的直觉（消得越多，加得越快）。
      this.combo += run.len;
      this.comboT = this.time;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      if (this.combo === 3 || this.combo === 6 || this.combo === 10 || this.combo === 15) {
        this.events.push({ type: 'combo', combo: this.combo });
      }

      const chainMult = CHAIN_MULT[Math.min(chain - 1, CHAIN_MULT.length - 1)];
      const comboMult = COMBO_MULT[Math.min(this.combo, COMBO_MULT.length - 1)];
      const base = BASE_SCORE(run.len);
      const gain = Math.round(base * chainMult * comboMult);
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

      this.events.push({
        type: 'clear', chain, gain, base, chainMult, comboMult,
        colors, positions, len: run.len, off,
        s0: mod(run.start + this.phase, N) * D,
        combo: this.combo,
      });

      this.compact(run.start, run.len);
    }

    if (chain > 0) {
      this.chain = chain;
      this.chainT = this.time;
      this.maxChain = Math.max(this.maxChain, chain);

      // 清空跑道：给一次大额奖励，鼓励"敢把盘面打空"
      if (this.occupied() === 0) {
        this.score += SWEEP_BONUS;
        this.sweeps++;
        this.events.push({ type: 'sweep', gain: SWEEP_BONUS, combo: this.combo });
      }
    } else {
      this.chain = 0;
    }
  }

  findMatch() {
    for (let i = 0; i < N; i++) {
      const b = this.slots[i];
      if (!b) continue;
      const prev = this.slots[mod(i - 1, N)];
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

  setInput(dir) { this.input = dir; }

  brake() {
    if (Math.abs(this.v) <= CFG.brakeMagnet) {
      this.phase = Math.round(this.phase) % N;
    }
    this.v = 0;
  }

  beadWorldS(slot) {
    return mod(slot + this.phase, N) * D;
  }

  flightProgress() {
    return this.balls.length ? Math.min(1, this.balls[0].t / CFG.flightTime) : 0;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
