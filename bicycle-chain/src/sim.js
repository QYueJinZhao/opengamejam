// 纯逻辑层：无 DOM、无渲染、无随机时间源，可在 Node 里直接跑。
// 固定步长驱动，同种子同输入 → 完全确定。
//
// 结构与上一版的关键差异：
// 1. 每个射口有一个 3 球预览队列（当前 + 下两颗），玩家能提前规划；
// 2. 射口数量 / 落点间距 / 轮径 / 槽数全部由 modes.js 决定；
// 3. 三射口模式「轮转两发」：每拍只有一个口休息，下拍换一个，压力仍是 2 球/拍；
// 4. 新增跨节拍连击 RUSH：连续每拍都有消除才涨，断一拍就归零，是主要得分杠杆。

import { C, N, D, L, mod, configure } from './geom.js';
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
  //
  // 参数从"飞行时长"改成"飞行速度"：炮口到轨道的距离是几何（nozzleGap），
  // 时长由 dist/speed 推出来。现在两者等价（间距恒定），但语义正过来了——
  // 以后改炮管长度、或者改成斜射，速度不用重调，时长自己跟着变。
  nozzleGap: 3.7,      // 炮口到轨道中心线的世界距离（render 的法向偏移用同一个值）
  flightSpeed: 4.6,    // 世界单位 / 秒。3.7 / 4.6 ≈ 0.80s，和上一版观感一致
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
  // 现在是**双轨**：
  //   万能球：随机补给（wildRate）+ 5 连奖励。它是"补洞工具"，必须稳定有货源；
  //   爆破球：完全由 4 连产出（bombRate 归零）。它是"你挣来的"，不是抽到的。
  //
  // 为什么把随机炸弹清零：两套供给会叠加。实测一局 54 次补球里，随机炸弹给
  // 2.3 颗、4 连奖励给 2.9 颗，合计 5.2 颗 × 5 格 = 26 格，超过盘面总量的一半，
  // 盘面会被炸到再也凑不出四连——奖励机制把自己的触发条件吃掉了。
  specialStart: 15,     // 前 15 秒纯基础色，先把三色三消教会
  wildRate: 0.030,
  bombRate: 0,

  // ---- 消除驱动的奖励球 ----
  // 判定只看本次结算的**首段**（chain === 1）。连锁段本身已经有 ×倍率，
  // 再叠特殊球会让一次结算给两颗，而且"一串连锁里哪一段给"说不清。
  rewardBombAt: 4,      // 首段消满 4 颗 → 下一发换成爆破球
  rewardWildAt: 5,      // 首段消满 5 颗 → 下一发换成彩虹万能球

  // 锈球：从 rustStart 起，每 rustEvery 秒往链条尾端塞一颗。
  // 它不是"发球发歪了"，是**时间压力**——放着不管，跑道会被死重吃掉，
  // 而且它会打断同色连续段，让本来能三消的地方变成两消。
  rustStart: 24,
  rustEvery: 9,

  // ---- 珠子补位速度 ----
  // 珠子被推挤时记一个 dx（"我视觉上还在旧位置"），渲染时画在 slot+dx。
  // 原来用指数衰减（dx *= exp(-26dt)）：位移大的珠子初速极高，位移小的慢慢晃，
  // 但**所有珠子都在同一时间停下**——这就是"指定时间"。
  // 改成恒速之后，dx 每秒固定减 dxSpeed 格：挪 1 格就 1/dxSpeed 秒，挪 6 格就久 6 倍。
  // 观感差别很大：原来一整列珠子是"啪"一下同时归位，现在是后一颗追前一颗。
  //
  // 取 11：1 格 ≈ 0.09s（几乎无感），5 格 ≈ 0.45s（看得见滑过去）。
  // 取 7 试过，5 格要 0.71s——滑是滑了，但珠子会长时间叠在邻居身上，
  // 读起来像"珠子堆住了"而不是"珠子在追"。
  dxSpeed: 11.0,       // 格 / 秒
};

export const CFG = { ...BASE_CFG };

const CHAIN_MULT = [1, 1.6, 2.6, 4.2, 6.5, 9.0];
// 连消倍率：按累计消除数递增，2.6 秒内没有新消除就断。
// 之所以不按「每拍都必须消」来算，是因为实测每拍平均只有 0.56 次消除，
// 那个条件等于永远拿不到加成（机器人峰值连击只有 3.6）。
const COMBO_MULT = [1, 1, 1.1, 1.2, 1.35, 1.5, 1.65, 1.8, 2.0, 2.2, 2.4, 2.6, 2.9, 3.2, 3.5, 3.8, 4.1, 4.4, 4.7, 5.0, 5.3];
const COMBO_WINDOW = 3.0;

/**
 * 连消档位。
 *
 * 上一版只有一档：combo 到 3/6/10/15 各弹一次同样的浮字、放同一个音效。
 * 问题不是"不好看"，是**玩家读不出自己在爬坡**——10 连和 3 连的反馈长得一样，
 * 唯一的差别是乘率数字，而数字在盘面中心，三个球一消就没人看。
 *
 * 现在五档各有自己的颜色、尺寸、屏幕边缘辉光强度和音高。
 * 之所以是"跨档触发"而不是"每次消除都播"：档位是里程碑，里程碑必须稀有；
 * 每消一次都炸一下，三次之后玩家就学会了无视它。
 */
export const COMBO_TIERS = [
  { at: 3,  name: '起势', color: '#7FD8FF', size: 18, glow: 0.10, shake: 1.5 },
  { at: 6,  name: '凌厉', color: '#4CF0C0', size: 21, glow: 0.18, shake: 2.5 },
  { at: 12, name: '爆发', color: '#FFD65A', size: 25, glow: 0.30, shake: 4.0 },
  { at: 17, name: '极限', color: '#FF9A4D', size: 29, glow: 0.44, shake: 6.0 },
  { at: 22, name: 'RUSH', color: '#FF5C8A', size: 34, glow: 0.60, shake: 8.5 },
];

/** 当前 combo 落在第几档（0 = 未入档，1~5 = 档位序号）。 */
export function comboTierIndex(n) {
  let t = 0;
  for (let i = 0; i < COMBO_TIERS.length; i++) if (n >= COMBO_TIERS[i].at) t = i + 1;
  return t;
}

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

let beadSeq = 1;

/**
 * 炮口槽位。
 *
 * 双炮刻意摆在**同一条直道**上，而不是上一版的 [0, N/2]（顶部 + 底部）。
 * 上一版两座炮口对射：玩家既要理解"上面那个朝下打"，又要理解"下面那个朝上打"，
 * 视线被劈成上下两半。同向后两座炮并排朝一个方向，这是直线射击游戏的默认直觉，
 * 也让"转轮盘把目标送到炮口下"这一个动作就够了，不用在两个半场之间切换。
 *
 * k = floor(C/D) 是"这条直道最多能放几格"。取足它有两个作用：
 * 一是两座炮都还在直道上（直道的法向是垂直的，炮身才是正着的）；
 * 二是落点尽量拉开，缓解同向带来的"两个口打得太近"。
 *
 * 代价是真实的：落点间距从 N/2 格缩到 2k 格，段位线必须重测。
 */
function buildNozzleOff(layout) {
  if (layout === 2) {
    const k = Math.max(2, Math.floor(C / D));
    return [N - k, k];
  }
  return Array.from({ length: layout }, (_, i) => Math.round((i * N) / layout));
}

export class Game {
  constructor(seed = 20261120, modeId = 'standard') {
    this.mode = getMode(modeId);
    this.modeId = this.mode.id;
    // 先改几何，再建盘面：N / D 是 live binding，后面所有代码读到的都是新值
    configure(this.mode.geo);
    this.nozzleOff = buildNozzleOff(this.mode.layout);
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
    this.comboTier = 0;      // 已经播报过的最高档位，防止同一档重复演出
    this.maxCombo = 0;
    this.volleyIndex = 0;    // 三射口：下一个休息的口
    this.rustClock = 0;
    this.rustPlaced = 0;
    this.bombs = 0;
    this.wilds = 0;
    this.rewards = 0;        // 4/5 连挣来的奖励球累计
    this.rewardIdx = 0;
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

    // 补位：恒速收拢，不是指数衰减。
    // 每颗珠子以 dxSpeed 格/秒往回滑，位移大就滑得久——所以一整列被推挤的珠子
    // 会依次归位，后面那颗追着前面那颗，而不是"啪"一声全体同时落位。
    const step = CFG.dxSpeed * dt;
    for (const b of this.slots) {
      if (!b || b.dx === 0) continue;
      b.dx = b.dx > 0 ? Math.max(0, b.dx - step) : Math.min(0, b.dx + step);
    }
    if (this.chain > 0 && this.time - this.chainT > 1.1) this.chain = 0;
    if (this.combo > 0 && this.time - this.comboT > COMBO_WINDOW) {
      if (this.combo >= 3) this.events.push({ type: 'combobreak', combo: this.combo });
      this.combo = 0;
      this.comboTier = 0;
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

    if (this.balls.length) {
      for (const b of this.balls) b.t += dt;
      if (this.balls[0].t >= this.balls[0].dur) this.land();
    }

    if (this.time >= CFG.levelTime) this.kill('time');
  }

  fire() {
    const n = this.nozzleCount();
    const idxs = this.nextVolley();
    if (CFG.rotate && n >= 3) this.volleyIndex = (this.volleyIndex + 1) % n;

    // 时长由**速度**推出来，不是写死的秒数。飞行距离现在是恒定的（炮口正下方），
    // 但这条式子不假设它恒定：以后炮管拉长、或者改成斜射，只要 dist 变了，
    // 时长自己跟着变，速度不用重调。
    const dur = CFG.nozzleGap / CFG.flightSpeed;

    this.balls = idxs.map((i) => {
      const ci = this.queues[i][0];
      this.queues[i].shift();
      this.queues[i].push(this.pickShot());
      return { ci, off: this.nozzleOff[i], idx: i, t: 0, dur };
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
    this.bumpCombo(len);

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
   * 累加连消，并在**跨档**时播报。
   *
   * 之所以不写成 `combo === 3 || combo === 6 || ...`：combo 一次可能加 4 或 5，
   * 从 4 直接跳到 8 就会把第 6 颗那档整段跳过——玩家打得越猛，反而越听不到
   * 里程碑。这里改成"当前落在第几档 > 已播报过的档位"，跨档必报，一次跨两档
   * 也只报最高那档（两段音效叠在一起会糊）。
   */
  bumpCombo(n, off = 0) {
    this.combo += n;
    this.comboT = this.time;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    const tier = comboTierIndex(this.combo);
    if (tier > this.comboTier) {
      this.comboTier = tier;
      const t = COMBO_TIERS[tier - 1];
      this.events.push({ type: 'combo', combo: this.combo, tier, tierName: t.name, off });
      // 一次可能跨两档（combo 从 4 直接吃到 11），返回目标档位即可
      return tier;
    }
    return 0;
  }

  // ---- 消除 + 连锁 + 连消 ----
  resolve(startSlot = -1, off = 0) {
    let chain = 0;
    let reward = 0;
    let crossedTier = 0;
    for (let guard = 0; guard < 24; guard++) {
      const run = this.findMatch();
      if (!run) break;

      chain++;

      // 奖励路线有两条，一次结算只发一颗，长度路线优先：
      //
      //   长度路线（设计稿原案）：4 颗 → 爆破球，5 颗 → 万能球
      //   档位路线（实测补的）：跨入「凌厉」→ 爆破球，跨入「爆发」→ 万能球
      //
      // 为什么必须补第二条：4 色盘面上，链条上永远不会有 3 颗相邻同色（会立即消），
      // 所以落一颗球要形成 4 连，得恰好落在 "XX_X" 这种缝里。实测 10 局只出现
      // 1 次 4 连——这条规则等于不存在。而"连消不断"是玩家能主动追的东西，
      // 实测每局能跨 4 次「凌厉」。
      //
      // 长度路线保留，是因为它一旦出现就该重奖：玩家真的把 4 颗拼到一起时，
      // 系统必须认账。
      if (chain === 1 && run.len >= CFG.rewardBombAt) {
        reward = run.len >= CFG.rewardWildAt ? WILD : BOMB;
      }
      // 连消按「消掉的颗数」累加：一次四消直接 +4，比按次数累加更容易起势，
      // 也更符合玩家对"连消"的直觉（消得越多，加得越快）。
      const crossed = this.bumpCombo(run.len, off);
      if (crossed > crossedTier) crossedTier = crossed;

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

      const chainMult = CHAIN_MULT[Math.min(chain - 1, CHAIN_MULT.length - 1)];
      const comboMult = COMBO_MULT[Math.min(this.combo, COMBO_MULT.length - 1)];
      const base = BASE_SCORE(run.len) + rustN * 200;
      const gain = Math.round(base * chainMult * comboMult);
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
        type: 'clear', chain, gain, base, chainMult, comboMult, rustN,
        // len 是"本次清掉多少颗"（含两侧被震碎的锈球），matchLen 是真正匹配到
        // 同色的长度。奖励球只认 matchLen：锈球是顺带震碎的，不是凑出来的。
        colors, positions, len, matchLen: run.len, off, s0,
        combo: this.combo,
      });

      this.compact(start, len);
    }

    if (chain > 0) {
      this.chain = chain;
      this.chainT = this.time;
      this.maxChain = Math.max(this.maxChain, chain);

      if (!reward) {
        if (crossedTier >= 3) reward = WILD;
        else if (crossedTier >= 2) reward = BOMB;
      }
      if (reward) this.grantReward(reward, off);

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

  /**
   * 把奖励球塞进队列的**待发位**，并挤掉末尾那颗预览球。
   *
   * 为什么插最前面而不是附加：奖励必须"下一发就能用"，否则玩家感受不到因果
   * ——4 连和两拍后的某颗球之间建立不了联系。
   *
   * 为什么必须挤掉一颗：队列定长 3 是有意义的（待发 + 两个预览，等于"我接下来
   * 能规划两步"）。变长会悄悄改掉节奏。挤掉末尾那颗是**代价**，也是这个奖励
   * 唯一的分量：你用一个已知信息换了一个强力球。
   */
  grantReward(ci, off = 0) {
    const i = this.nozzleOff.indexOf(off);
    const idx = i >= 0 ? i : (this.rewardIdx % this.queues.length);
    this.rewardIdx = (idx + 1) % this.queues.length;

    const q = this.queues[idx];
    const dropped = q.length >= 3 ? q.pop() : null;
    q.unshift(ci);
    this.rewards++;

    this.events.push({
      type: 'reward', ci, idx, off: this.nozzleOff[idx],
      dropped, len: q.length,
      s: mod(this.nozzleOff[idx], N) * D,
    });
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
    return this.balls.length ? Math.min(1, this.balls[0].t / this.balls[0].dur) : 0;
  }

  /** 这一发还要飞多久（秒）。渲染的落点预告和机器人都要用它算链条会滑多远。 */
  flightLeft() {
    const b = this.balls[0];
    return b ? Math.max(0, b.dur - b.t) : 0;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
