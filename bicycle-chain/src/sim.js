// 纯逻辑层：无 DOM、无渲染、无随机时间源，可在 Node 里直接跑。
// 固定步长驱动，同种子同输入 → 完全确定。
//
// 结构与上一版的关键差异：
// 1. 每个射口有一个 3 球预览队列（当前 + 下两颗），玩家能提前规划；
// 2. 射口数量 / 落点间距 / 轮径 / 槽数全部由 modes.js 决定；
// 3. 三射口模式「轮转两发」：每拍只有一个口休息，下拍换一个，压力仍是 2 球/拍；
// 4. 新增跨节拍连击 RUSH：连续每拍都有消除才涨，断一拍就归零，是主要得分杠杆。

import { N, D, L, mod, configure } from './geom.js';
import { getMode } from './modes.js';

// ---- 球种：形状是第一编码，色相是第二编码 ----
//
// 上一版是「圆形球 + 内部纹样 + 中心形符」，四种区分全靠同一块圆形画布里的
// 细节。问题是：远处、快速移动、色弱三种情况下，圆盘上的细节最先丢失，
// 剩下的只有色相 —— 而色相恰恰是色弱玩家最不可靠的通道。
//
// 这一版把**轮廓**做成第一编码：八面体 / 倒角方核 / 星芒 / 三角棱锥，
// 四个剪影互相之间没有一个相似。眼睛在余光里就能靠"尖的/方的/带刺的/三角的"
// 认出来，颜色退化成辅助信息。这也是色弱模式不需要额外形符的原因。
//
// 顺序即解锁顺序：colorCount() 取前 n 个，所以先给对比最强的两组（紫/金），
// 再上红，最后青。
export const PALETTE = [
  { key: 'p', name: '紫', shape: 'oct',  base: '#A855F7', light: '#E4CBFF', dark: '#3A0F73' },
  { key: 'g', name: '金', shape: 'cube', base: '#FFC23A', light: '#FFF0BA', dark: '#5E3800' },
  { key: 'r', name: '红', shape: 'star', base: '#FF3B4E', light: '#FFB6BE', dark: '#6C0913' },
  { key: 'c', name: '青', shape: 'pyr',  base: '#19D3F0', light: '#B6F5FF', dark: '#044A61' },
];

// 特殊球的 ci 故意用远离 0..3 的值：所有 `ci === 某色` 的判断天然不会误命中，
// 而 `b.ci < PALETTE.length` 这类范围判断也不用改。
export const WILD = 10;   // 彩虹万能球：落地时自解析成最合适的颜色
export const BOMB = 11;   // 爆破炸弹球：落地即炸，清掉落点两侧
export const RUST = 12;   // 锈球：不参与匹配的障碍，只能被相邻消除或炸弹清掉

export const SPECIAL = {
  [WILD]: { key: 'w', name: '万能', shape: 'wild', base: '#FFD86B', light: '#FFFFFF', dark: '#7A4E00' },
  [BOMB]: { key: 'x', name: '爆破', shape: 'bomb', base: '#FF8A2B', light: '#FFD9A0', dark: '#3A1600' },
  [RUST]: { key: 'u', name: '锈',   shape: 'rust', base: '#8C8781', light: '#C3BDB5', dark: '#211F1C' },
};

/** 任何 ci → 配色。渲染层与 HUD 共用，避免到处写 PALETTE[ci] 而漏掉特殊球。 */
export function ballSkin(ci) {
  return PALETTE[ci] || SPECIAL[ci] || SPECIAL[RUST];
}

/** 是否能参与颜色匹配（锈球不能） */
export function isColor(ci) {
  return ci >= 0 && ci < PALETTE.length;
}

export const BASE_CFG = {
  vMax: 13.0,
  accel: 55.0,
  dampK: 9.0,
  drift: 1.35,
  stopEps: 0.12,
  brakeMagnet: 4.0,
  // 飞行时长：0.203 → 0.34 → 0.80，三轮才调对。
  //
  // 前两轮都按"球飞得快"去理解，方向错了。真正决定观感的是**相对速度**：
  // 球飞向一个几乎固定的落点，链条同时迎面滑过来，两者相加才是玩家眼睛看到的
  // 接近速度。0.34s 时这个速度约 8 个球径/秒，只够看清一次眨眼。
  //
  // 0.80s 把它压到约 3 个球径/秒，球在空中能被"读完"：出膛、走到一半、贴上链尾。
  //
  // 一个反直觉的结论：**加长飞行几乎不增加难度**。机器人改成精确反解之后
  // （见 bot.js），0.66 与 0.80 的得分差异在 1% 以内——因为落点漂移是可解析
  // 预测的，完美玩家会提前补偿。它只消耗人类的预判窗口，这正是我们要的：
  // 让反应慢的玩家也能看清，而不是把游戏变简单或变难。
  //
  // 代价：链条在飞行期间滑过约 1.1 槽（drift 1.35 × 0.80），超过一整格。
  // 所以落点预告环不是装饰品，是这个时长能玩的前提（见 render 的 predSlots）。
  flightTime: 0.80,
  beatStart: 3.40,
  beatEnd: 2.05,
  rampSec: 90,
  levelTime: 90,
  startBeads: 8,
  colorSteps: [[0, 4], [45, 5]],
  stages: [[0, 1], [20, 2]],
  volley: 2,
  rotate: false,

  // ---- 特殊球 ----
  // 概率是「每次补球」的独立概率，不是场上占比。设计意图：
  //   万能球是"补洞"的工具，不能多，多了就没有卡色的紧张感；
  //   爆破球是"止损"的工具，也不能多，否则盘面永远炸得空。
  specialStart: 15,     // 前 15 秒纯基础色，先把三色三消教会
  wildRate: 0.065,
  bombRate: 0.055,

  // 锈球：从 rustStart 起，每 rustEvery 秒往链条尾端塞一颗。
  // 它不是"发球发歪了"，是**时间压力**——放着不管，跑道会被死重吃掉，
  // 而且它会打断同色连续段，让本来能三消的地方变成两消。
  rustStart: 24,
  rustEvery: 9,

  // ---- ×2 得分槽 ----
  // 槽位按**弧长**固定在世界坐标上（不跟珠子走），所以消除必须"打在那一段"。
  // 每 padEvery 秒整体换位一次，逼玩家重新规划，而不是记住一个点位就完事。
  padEvery: 20,
  padHalf: 2.0,        // 槽半长，单位是槽；×2 判定范围 = ±padHalf 格
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
// 爆破球的基础分。故意低于一次普通三消（300），因为它的价值在"止损"，
// 不在"赚分"——否则最优解会变成一直等炸弹。
const BOMB_BASE = 220;

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

/** 闭合环上两点的最短弧长距离 */
function circDist(a, b, L) {
  const d = Math.abs(a - b) % L;
  return Math.min(d, L - d);
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
    this.rustClock = 0;
    this.rustPlaced = 0;
    this.bombs = 0;
    this.wilds = 0;
    this.padClock = 0;
    this.pads = [];
    this.padHits = 0;
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
    this.rollPads();
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

  /**
   * 补一颗待发球：基础色 or 特殊球。
   * 特殊球的概率是**一次判定里依次吃掉**的，所以 wildRate/bombRate 是
   * 互斥区间而不是叠加，改一个不会把另一个挤掉。
   */
  pickShot() {
    if (this.time >= CFG.specialStart) {
      const r = this.rng();
      if (r < CFG.wildRate) return WILD;
      if (r < CFG.wildRate + CFG.bombRate) return BOMB;
    }
    return this.pickColor();
  }

  /**
   * 万能球落地时自解析成哪个颜色。
   *
   * 这里做了一个和"标准万能球"不同的选择：**落地即定型，不在链条上保留彩虹态**。
   * 理由是这个游戏的匹配判定是一条横扫的游程扫描（findMatch），一旦允许
   * "万能在链上仍可变色"，游程就有多解，判定会依赖扫描顺序，玩家无法预测。
   * 落地定型把歧义消灭在落地那一刻：玩家看到的是"我把它变成了需要的色"，
   * 观感和"万能"完全一致，判定却是唯一的。
   */
  chooseWildColor(k) {
    const n = this.colorCount();
    let bestCi = 0, bestLen = -1;
    for (let ci = 0; ci < n; ci++) {
      let len = 1;
      for (let i = 1; i < N; i++) {
        const b = this.slots[mod(k - i, N)];
        if (b && b.ci === ci) len++; else break;
      }
      for (let i = 1; i < N; i++) {
        const b = this.slots[mod(k + i, N)];
        if (b && b.ci === ci) len++; else break;
      }
      if (len > bestLen) { bestLen = len; bestCi = ci; }
    }
    // 两侧都是空位时长度全是 1，此时按"场上最多的颜色"补，避免万能球
    // 落在空跑道上变成一个随机色块。
    if (bestLen <= 1) {
      const count = new Array(n).fill(0);
      for (const b of this.slots) if (b && b.ci < n) count[b.ci]++;
      let top = 0;
      for (let ci = 1; ci < n; ci++) if (count[ci] > count[top]) top = ci;
      return top;
    }
    return bestCi;
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

    // 锈球注入：按时间，不按拍。它和"发球"是两条独立的压力线——
    // 拍子决定玩家有多忙，锈球决定盘面有多脏。
    if (CFG.rustEvery > 0 && this.time >= CFG.rustStart) {
      this.rustClock += dt;
      if (this.rustClock >= CFG.rustEvery) {
        this.rustClock -= CFG.rustEvery;
        this.injectRust();
      }
    }

    if (CFG.padEvery > 0) {
      this.padClock += dt;
      if (this.padClock >= CFG.padEvery) {
        this.padClock -= CFG.padEvery;
        this.rollPads();
        this.events.push({ type: 'padmove' });
      }
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
      this.queues[i].push(this.pickShot());
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
    for (const t of targets) {
      if (t.ci === BOMB) this.detonate(t.k, t.off);
      else this.dropAt(t.k, t.ci, t.off);
    }
  }

  /**
   * 爆破球：落地即炸，不再插进链条。
   *
   * 这是三选二里唯一"不需要匹配"的动作，所以它的代价不是颜色、而是**那一发**：
   * 你在两球一拍里用掉了一颗本该用来补洞的球。威力只给 5 格，
   * 是因为再大就等于给了一个"随时清盘"的按钮，盘面压力会被抹平。
   */
  detonate(k, off = 0) {
    if (this.dead) return;
    this.bombs++;

    let c = k;
    if (!this.slots[c]) {
      const p = this.nearestBead(c, +1);
      const q = this.nearestBead(c, -1);
      if (p < 0 && q < 0) {
        this.events.push({ type: 'bomb', slot: c, s: mod(c + this.phase, N) * D, hit: 0, gain: 0, off });
        return;
      }
      c = (p >= 0 && (q < 0 || p <= q)) ? mod(c + p, N) : mod(c - q, N);
    }

    let start = c;
    for (let i = 1; i <= 2; i++) {
      if (!this.slots[mod(c - i, N)]) break;
      start = mod(c - i, N);
    }
    let len = 0;
    while (len < 5 && this.slots[mod(start + len, N)]) len++;
    if (len === 0) return;

    const colors = [], positions = [];
    let rustHit = 0;
    for (let i = 0; i < len; i++) {
      const idx = mod(start + i, N);
      const b = this.slots[idx];
      if (b.ci === RUST) rustHit++;
      colors.push(b.ci);
      positions.push(mod(idx + this.phase, N) * D);
      this.slots[idx] = null;
    }

    const comboMult = COMBO_MULT[Math.min(this.combo, COMBO_MULT.length - 1)];
    const gain = Math.round((BOMB_BASE + BOMB_BASE * 0.6 * (len - 1) + rustHit * 260) * comboMult);
    this.score += gain;
    this.clears++;
    this.combo += len;
    this.comboT = this.time;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    this.events.push({
      type: 'bomb', slot: c, off, hit: len, col: colors, positions,
      gain, comboMult, s: mod(start + this.phase, N) * D, len,
      combo: this.combo,
    });

    this.compact(start, len);
    // 炸完可能露出新的三连：交给常规结算收尾
    this.resolve(-1, off);
  }

  dropAt(k, ci0, off) {
    if (this.dead) return;
    if (this.occupied() >= N) { this.kill('overflow'); return; }

    const wasEmpty = this.slots[k] === null;
    const target = wasEmpty ? this.snap(k) : k;
    if (wasEmpty && target !== k) this.snapped++;

    // 万能球在**吸附之后**才定型：否则落点会偏一格，定出来的颜色也就错了。
    const ci = ci0 === WILD ? this.chooseWildColor(target) : ci0;
    if (ci0 === WILD) this.wilds++;
    const bead = this.makeBead(ci);

    if (this.slots[target] === null) {
      this.slots[target] = bead;
      this.events.push({
        type: 'lone', slot: target, ci, off,
        s: mod(target + this.phase, N) * D,
        wild: ci0 === WILD,
      });
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
      wild: ci0 === WILD,
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

  /**
   * 往链条**尾端**塞一颗锈球。
   *
   * 选尾端而不是随机位置，是因为链条在这里始终是一段连续弧：尾端是唯一
   * "接上去不会把链条劈成两段"的位置。塞在中间虽然更阴险，但会破坏连续性，
   * 让插入推挤与 compact 的前提失效——那是拿正确性换难度，不值。
   */
  injectRust() {
    if (this.occupied() >= N - 1) return;   // 至少留一格给玩家发球
    let tail = -1;
    for (let i = 0; i < N; i++) {
      if (this.slots[i] && !this.slots[mod(i + 1, N)]) { tail = i; break; }
    }
    if (tail < 0) return;
    const at = mod(tail + 1, N);
    this.slots[at] = this.makeBead(RUST);
    this.rustPlaced++;
    this.events.push({ type: 'rust', slot: at, s: mod(at + this.phase, N) * D });
  }

  /**
   * 重掷两个 ×2 槽的位置。
   *
   * 约束和"发球口"保持距离：槽如果正好压在炮口落点上，玩家什么都不用做就能
   * 吃到双倍，这个机制就变成了白送分。要让它有意义，必须"绕过去打"。
   */
  rollPads() {
    this.pads = [];
    if (!(CFG.padEvery > 0)) return;
    const avoid = this.nozzleOff.map((o) => o * D);
    const pick = () => {
      for (let t = 0; t < 60; t++) {
        const s = this.rng() * L;
        if (avoid.every((a) => circDist(s, a, L) > CFG.padAvoid * D) &&
            this.pads.every((p) => circDist(s, p.s, L) > 7 * D)) return s;
      }
      return this.rng() * L;
    };
    this.pads.push({ s: pick() });
    this.pads.push({ s: pick() });
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

      // 消除段两侧的锈球被震碎，一起并进本次清除。
      // 必须并进**同一段**：如果单独删掉侧面的锈球，链条中间就会留下洞，
      // 而链条连续是这个游戏所有判定的前提（插入推挤、compact、吸附都假定它）。
      let start = run.start, len = run.len;
      let rustN = 0;
      if (len < N) {
        const lb = this.slots[mod(start - 1, N)];
        if (lb && lb.ci === RUST) { start = mod(start - 1, N); len++; rustN++; }
      }
      if (len < N) {
        const rb = this.slots[mod(run.start + run.len, N)];
        if (rb && rb.ci === RUST) { len++; rustN++; }
      }

      const s0 = mod(start + this.phase, N) * D;
      // ×2 槽的判定点是消除段的**中心弧长**，不是落点。
      // 玩家要瞄的是"让这一下消在槽里"，而不是"把球打进槽里"——差别很大。
      let padHit = false;
      for (const pad of this.pads) {
        if (circDist(mod(s0 + len * 0.5 * D, L), pad.s, L) <= CFG.padHalf * D) { padHit = true; break; }
      }
      if (padHit) this.padHits++;

      const chainMult = CHAIN_MULT[Math.min(chain - 1, CHAIN_MULT.length - 1)];
      const comboMult = COMBO_MULT[Math.min(this.combo, COMBO_MULT.length - 1)];
      const base = BASE_SCORE(run.len) + rustN * 200;
      const padMult = padHit ? 2 : 1;
      const gain = Math.round(base * chainMult * comboMult * padMult);
      this.score += gain;
      this.clears++;

      const colors = [];
      const positions = [];
      for (let i = 0; i < len; i++) {
        const idx = mod(start + i, N);
        const b = this.slots[idx];
        colors.push(b.ci);
        positions.push(mod(idx + this.phase, N) * D);
        this.slots[idx] = null;
      }

      this.events.push({
        type: 'clear', chain, gain, base, chainMult, comboMult, padMult, padHit, rustN,
        colors, positions, len, off, s0,
        combo: this.combo,
      });

      this.compact(start, len);
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
      // 锈球不参与任何颜色匹配，哪怕三颗锈球挨在一起也不能消——
      // 它是"死重"，唯一的出口是被相邻消除震碎或被炸弹炸掉。
      if (b.ci === RUST) continue;
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
