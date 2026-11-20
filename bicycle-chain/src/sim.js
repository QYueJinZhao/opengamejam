// 纯逻辑层：无 DOM、无渲染、无随机时间源，可在 Node 里直接跑。
// 固定步长驱动，同种子同输入 → 完全确定。
//
// 结构与上一版的关键差异：
// 1. 每个射口有一个 3 球预览队列（当前 + 下两颗），玩家能提前规划；
// 2. 射口数量 / 落点间距 / 轮径 / 槽数全部由 modes.js 决定；
// 3. 多射口**轮流开火**：一次只出一颗，口与口按 volleyIndex 轮转。
//    上一版是"每拍齐射"，两颗球同时出膛——玩家一次要做两个落点决策，
//    而两个落点相距 11 格，眼睛根本分不开。轮流之后，每一发都是独立事件。
// 4. 跨节拍连击：3 秒窗口内累计消除数，断了归零，是第一条得分杠杆；
// 5. 节奏（第五轮）：beat 由分数驱动，机器越快每一消越值钱（tempoMult 1→1.45），
//    这是第二条杠杆，也是唯一一条"玩家自己挣来、又必须自己扛"的压力。
// 6. 骰子模式（第六轮）：把"同色三连"换成"点数牌型"（豹子 / 顺子），
//    并引入两个落在**骰子自己身上**的主动机制（+1 翻面、×2 镀金）。
//    规则本体全部在 dice.js，这里只负责把它们接到既有的结算管线上。
// 7. 扑克模式（第八轮）：把"点数"再拆成"花色 + 点数"两个维度。
//    规则本体在 poker.js；本文件多出来的只有底牌暂存、筹码槽和狂热时间
//    这三条**属于整台机器**的机制（它们不是某张牌自己的属性）。

import { C, N, D, L, mod, configure } from './geom.js';
import { getMode } from './modes.js';
import {
  PIPS, DICE_SPECIAL, isPip, pipOf, pipIndex, isFlipDie, findPattern,
  patternValue, patternLabel, evalPlacement, bestPipAt,
} from './dice.js';
import {
  CARD_BASE, SHIFT_BASE, SUITS, cardSkin, isFaceCard, isShiftCard,
  isPokerCard, suitOf, withSuit, findHand, patternLabel as pokerLabel,
  evalPlacement as evalCardPlacement, bestCardAt,
} from './poker.js';

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

// 规则族。渲染和判定都要读它，所以放在模块级而不是每个实例上——
// 本项目同一时刻只有一个 Game 实例（geom 的 live binding 也依赖这条前提）。
let RULES = 'color';

export function setRules(r) {
  RULES = r === 'dice' ? 'dice' : r === 'poker' ? 'poker' : 'color';
}

export function rulesOf() {
  return RULES;
}

/** 任何 ci → 配色。渲染层与 HUD 共用，避免到处写 PALETTE[ci] 而漏掉特殊球。 */
export function ballSkin(ci) {
  if (RULES === 'dice') {
    if (isPip(ci)) return PIPS[pipIndex(ci)];
    return DICE_SPECIAL[ci] || SPECIAL[ci] || SPECIAL[RUST];
  }
  if (RULES === 'poker') return cardSkin(ci);
  return PALETTE[ci] || SPECIAL[ci] || SPECIAL[RUST];
}

/** 是否能参与匹配（锈球 / 铅骰 / 暗牌不能）。骰子模式下翻面骰（20..25）算点数骰。 */
export function isColor(ci) {
  if (RULES === 'dice') return isPip(ci);
  if (RULES === 'poker') return isPokerCard(ci);
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
  //
  // 第三轮：3.7 → 4.6，同时把速度从 4.6 压到 3.5。
  // 用户的原话是"炮口和轮盘距离要远一点，需要些时间玩家可以反应"——
  // 反应时间 = 距离 / 速度，所以两件事要一起做才有意义：只拉远距离、
  // 不加时间，玩家看到的只是"球飞得更急"；只减速、不拉远，炮口会贴在轮盘边上
  // 显得局促。现在 4.6 / 3.5 = 1.31s，比上一版的 0.80s 长 64%。
  //
  // 4.6 而不是更远，是画布预算决定的：炮口往上一格，整个轮盘就要缩一格
  // （见 render 的 syncGeo）。再远下去珠子会小到看不清星芒和八面体的区别，
  // 那就把第一轮做的形状编码废掉了。
  nozzleGap: 4.6,      // 炮口到轨道中心线的世界距离（render 的法向偏移用同一个值）
  flightSpeed: 3.5,    // 世界单位 / 秒 → 飞行 1.31s
  // ---- 节奏（第五轮：从"时间驱动"改成"分数驱动"）----
  //
  // 上一版 beat 只是时间的函数：90 秒内从 2.20 匀速压到 1.45。
  // 三个问题：
  //   1. 曲线是匀速的，玩家感受不到"越打越快"，只感到"越来越卡"；
  //   2. 与表现无关——打得好和打得烂走同一条曲线，节奏不携带任何信息；
  //   3. 1.45 距离"飞行 1.31 + 间隔 0.08"的地板只剩 0.06 秒，
  //      想再快也没有余量了（这是上一轮拉长飞行留下的债）。
  //
  // 现在 beat = min(时间地板, 分数曲线)：
  //   时间地板 —— 保障局内一定有推进，跟表现无关，是"下限"；
  //   分数曲线 —— 你打得越多，机器转得越快。这是**奖励**，不是惩罚：
  //               加速意味着单位时间更多发球 = 更多分。
  //
  // 三条曲线合起来才是完整的收益结构：
  //   分数↑ → beat↓ → 发球率↑ → 分数↑（正反馈，由 beatRush 截断）
  //   且每一消再乘 tempoMult（1 → 1.45），所以"快"是**双重**加成。
  // 为什么敢用正反馈：tempo 是个有界量（满速封顶），而且加速会把盘面压力
  // 一起抬起来——玩家能撑住多快，就只能赚到多快。撑不住就爆仓，收益归零。
  // 这就是"风险与收益成正比"：速度不是白送的，它是你自己挣来、也必须自己扛的。
  beatStart: 2.20,     // 起手颗间隔
  beatEnd: 1.55,       // 时间地板的终点（打到 90 秒也只有这么慢，保底推进）
  beatRush: 1.02,      // 分数曲线的终点 = 满速时的颗间隔
  rampSec: 55,         // 时间地板的爬升时长（短于 levelTime：地板要早点到位）
  tempoRef: 10000,     // 分数曲线走满所需的分数（各模式按段位线覆写）
  tempoGain: 0.45,     // 满速时每一消的额外倍率（1 + 0.45）
  // 飞行占颗间隔的比例。上一版飞行是固定 1.31s，于是 beat 有一个
  // "flight + fireGap" 的硬地板——想让节奏更快，只能先缩飞行。
  // 现在反过来：飞行 = min(基准时长, 颗间隔 × ratio)，机器越快球飞得越快。
  // 0.86 意味着任何速度下都留 14% 的"空档"给玩家看落点，
  // 也让"落地 → 下一发出膛"永远是两个可以分辨的事件。
  flightRatio: 0.86,
  fireGap: 0.08,
  levelTime: 90,
  startBeads: 8,
  colorSteps: [[0, 3], [38, 4]],
  stages: [[0, 1], [20, 2]],

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
  dxSpeed: 11.0,       // 格 / 秒 —— 只管"被推开的这一刻让位"，必须快

  // 落空补位是另一回事：球垂直落到 k，链条在 target，珠子要在视觉上
  // 走过去。这里**不能**用 dxSpeed：差值 6 格时 0.55 秒就走完，
  // 玩家看到的是珠子凭空出现在链条边上，只觉得"怎么突然就到了"。
  // 4.6 格/秒 ≈ 珠径的 4.6 倍/秒，眼睛跟得住；dxSlideMaxSec 兜住极端情况
  // （链条只剩两三颗时落点可能差 11 格），否则拖到 2.4 秒会和下一颗球打架。
  dxSlideSpeed: 4.6,   // 格 / 秒 —— 落空吸附的滑行速度
  dxSlideMaxSec: 1.5,  // 再远也不超过这个时长

  // ---- 骰子模式专用（其余模式保持 null / 0，等于关闭）----
  //
  // 集中写在这里而不是散进 sim 的分支里，是为了让"骰子到底特殊在哪"
  // 能在一个屏幕内看完。基础模式的任何一条逻辑都不读这些字段。
  chainMult: null,     // 连消倍率表；骰子用 [1,2,4,8,12]（设计稿的 ×2/×4/×8/×12）
  chainTime: null,     // 连消续时表：下标 = chain（2 → +1.5s … 5 → +6s）
  timeBonusCap: 0,     // 一局最多续多少秒
  blankAt: 0,          // 连续 N 发落空 → 往蛇尾塞一颗铅骰（0 = 关闭）
  pads: null,          // [{ rel, kind, at, name }] —— rel 相对 0 号射口的槽位偏移
  rollDur: 0.26,       // 骰子翻滚动画时长（落地 / 被翻面时播一次）

  // ---- 扑克模式专用（其余模式保持 0 / false，等于关闭）----
  //
  // 和骰子那段同一个原则：所有"这套规则特殊在哪"集中在一屏内看完。
  // 基础模式与骰子模式的任何一条逻辑都不读这些字段。
  shiftRate: 0,        // 染花牌概率（第三种特殊牌）
  holdEnabled: false,  // 底牌暂存槽（E / 右键）
  frenzyDur: 0,        // 同花顺触发的狂热秒数
  frenzyMult: 1,       // 狂热期间所有消除的倍率
  frenzyTime: 0,       // 同花顺额外续时（秒）
  chipBonusJoker: false, // 筹码槽内打出三条 / 同花顺 → 送一张小丑牌
  pokerSmart: 0.74,     // 发牌里"按局面挑"的比例（其余均匀抽）
  pokerWeight: 0.08,    // evalCardPlacement 收益 → 权重的压缩系数
  comboCap: 0,          // 连消倍率上限（0 = 不封顶）；扑克用它压住"牌型密度"
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

/**
 * 节奏档位：机器转速的里程碑。
 *
 * 为什么要播报：tempo 是这一版**唯一一个玩家自己挣来、又反噬自己**的量。
 * 如果它只是 HUD 上一个缓慢变大的数字，玩家永远不会把它和"我打得快"联系起来，
 * 也就不会去主动追它——那这条正反馈在体感上等于不存在。
 *
 * 三档就够：起速（能听出来）、过载（能看见颜色变了）、红线（满速）。
 * 再多会变成噪音——它不像连消那样每次消除都跳。
 */
export const TEMPO_MARKS = [
  { at: 0.34, name: '提速', color: '#5AC8FA' },
  { at: 0.68, name: '过载', color: '#FFB03A' },
  { at: 0.999, name: '红线', color: '#FF5C8A' },
];

// ---- 音乐出球模式的 BPM 曲线 ----
//
// 两段慢、两段快，之间用 8~10% 的进度做斜坡，避免 BPM 瞬间跳变。
// 88→148 的半小节是 1.36s→0.81s：慢段能看清盘面，快段明显"赶"。
const MUSIC_BPM_KEYS = [
  [0.00, 88], [0.20, 88],
  [0.30, 104], [0.50, 104],
  [0.60, 124], [0.78, 124],
  [0.88, 148], [1.00, 148],
];

// ---- 音画映射：角度 → 五声音阶 ----
//
// 7 个固定角度档位，中心 0° 是 G4，八度关系保证怎么随机都不跑调：
//   -24° C4 / -16° D4 / -8° E4 / 0° G4 / +8° A4 / +16° C5 / +24° E5
// 连续角度只用于炮身视觉；音高必须吸附到档位，否则会像警报器。
export const AIM_ANGLES = [-24, -16, -8, 0, 8, 16, 24];
export const AIM_FREQS = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 659.25];

export function aimFreqStep(step) {
  return AIM_FREQS[Math.max(0, Math.min(AIM_FREQS.length - 1, step | 0))];
}

/** 角度档位 → 左右声像：-0.65（左）… +0.65（右）。 */
export function aimPanStep(step) {
  return ((Math.max(0, Math.min(6, step | 0)) / 6) * 2 - 1) * 0.65;
}

/** 进度 0..1 → 当前音乐 BPM（线性插值）。 */
export function musicBpmAt(prog) {
  const p = Math.max(0, Math.min(1, prog));
  for (let i = 1; i < MUSIC_BPM_KEYS.length; i++) {
    const [p1, b1] = MUSIC_BPM_KEYS[i];
    if (p <= p1) {
      const [p0, b0] = MUSIC_BPM_KEYS[i - 1];
      const u = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
      return b0 + (b1 - b0) * u;
    }
  }
  return MUSIC_BPM_KEYS[MUSIC_BPM_KEYS.length - 1][1];
}

/** tempo(0..1) → 每消倍率。渲染层与逻辑层共用，避免 HUD 与实际结算不一致。 */
export function tempoMultOf(tempo, gain = 0.45) {
  return 1 + gain * Math.max(0, Math.min(1, tempo));
}

const BASE_SCORE = (n) => (n === 3 ? 300 : n === 4 ? 700 : 1500 + 700 * Math.max(0, n - 5));
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
 * 炮口槽位：单喷头固定在 0 号槽（椭圆顶部正中）。
 * 保留这个函数，是为了让"炮口在哪"仍然只有一处定义。
 */
function buildNozzleOff() {
  return [0];
}

export class Game {
  constructor(seed = 20261120, modeId = 'standard', fireMode = 'timer') {
    this.mode = getMode(modeId);
    this.modeId = this.mode.id;
    // 出球模式：'timer' 走原来的时间/分数曲线；'music' 走音乐半小节。
    this.fireMode = fireMode === 'music' ? 'music' : 'timer';
    // 先改几何，再建盘面：N / D 是 live binding，后面所有代码读到的都是新值
    configure(this.mode.geo);
    this.nozzleOff = buildNozzleOff();
    Object.assign(CFG, BASE_CFG, this.mode.cfg);
    // 规则族必须在 reset 之前定：placeOpening 里的"不许预先成型"用的就是它。
    this.rules = this.mode.rules || 'color';
    setRules(this.rules);
    // tempoRef 必须由模式**显式**给出，不能从段位线推。
    // 一开始偷懒让它等于 tiers[3]（S 线），结果段位线一重划，整条节奏曲线跟着变——
    // 那是两个不该耦合的东西：段位线回答"这局值多少名"，tempoRef 回答"机器什么时候满速"。
    // 现在每组模式都把 tempoRef 写成"好手在 2/3 局时能到的分数"，
    // 于是满速总落在 65~75% 的进度上，跟段位线怎么划无关。
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
    // 节奏状态。tempo 是"现在这台机器有多快"的归一化读数（0 = 起手，1 = 满速），
    // tempoMult 是它换算成的每消倍率。两者都在 step 里每帧重算，
    // 渲染和音效直接读，不各自揣一份公式。
    this.tempo = 0;
    this.tempoMult = 1;
    this.tempoMark = 0;
    this.maxTempo = 0;
    this.fastT = 0;          // 满速累计时长：结算页用它回答"这局机器跑起来了吗"

    // ---- 喷头演出状态（纯表现，不参与判定）----
    // firePulse 在出膛瞬间置 1，随后 0.30s 内线性衰减到 0；
    // 渲染层拿它做炮口闪光、后坐和烟雾，音效层拿它对齐开火音。
    this.firePulse = 0;
    this.fireSeq = 0;        // 第几发：让每次闪光的星芒角度略有不同
    this.musicBpm = 0;       // 音乐出球模式的当前 BPM（timer 模式为 0）
    this.musicTempo = 0;     // BPM 归一化后的 0..1，供 HUD / 音效使用
    this.musicBeatPhase = 0; // 当前四分音符内的相位，渲染层做拍点脉冲
    this.aimAngle = 0;       // 炮身视觉角度（度，连续平滑）
    this.aimStep = 3;        // 音高档位 0..6（0=-24°，3=0°，6=+24°）
    this.lastShotAngle = 0;  // 上一发锁定的角度
    this.lastShotStep = 3;   // 上一发的音高档位

    // ---- 骰子模式状态（基础模式恒为 0 / 空，不影响任何既有逻辑）----
    // 加时、漏发、镀金全部记在这里，结算页与 HUD 直接读。
    this.timeBonus = 0;      // 连消续来的秒数（受 CFG.timeBonusCap 封顶）
    this.missStreak = 0;     // 连续落空发数（铅骰规则）
    this.blanks = 0;         // 本局塞进去的铅骰数
    this.padHits = 0;        // 踩中 +1 / ×2 槽的次数
    this.jackpots = 0;       // 6-6-6 次数
    this.longestRun = 0;     // 本局最长的顺子（结算页用）

    // ---- 扑克模式状态（其余模式恒为 0 / null）----
    this.hold = null;          // 底牌暂存槽里那张牌（ci）
    this.holdUses = 0;         // 玩家使用底牌槽的次数（结算页用）
    this.frenzyT = 0;          // 狂热剩余秒数
    this.frenzies = 0;         // 同花顺触发的狂热次数
    this.straightFlushes = 0;  // 同花顺次数
    this.fours = 0;            // 四条 / 五条次数
    this.longestStraight = 0;  // 本局最长的顺子（含同花顺）
    this.chipClears = 0;       // 在筹码槽里引爆的次数
    this.chipJokers = 0;       // 筹码槽送出去的小丑牌数

    // 槽位是在构造时按 0 号射口算死的：射口不动，槽位就不动。
    // 渲染层按 (slot + phase) 画，于是它随轮鼓转——玩家能把某一格转到炮口下。
    this.pads = (CFG.pads || []).map((p, i) => ({
      id: i, kind: p.kind, at: p.at || 0, name: p.name || '',
      slot: mod(this.nozzleOff[0] + p.rel, N),
    }));

    this.flightDur = CFG.nozzleGap / CFG.flightSpeed;
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
    this.volleyIndex = 0;    // 下一个开火的射口（轮流制）
    this.rustClock = 0;
    this.rustPlaced = 0;
    this.bombs = 0;
    this.wilds = 0;
    this.rewards = 0;        // 4/5 连挣来的奖励球累计
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
    if (this.rules === 'dice') return this.placeOpeningDice();
    if (this.rules === 'poker') return this.placeOpeningPoker();

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

  /**
   * 骰子模式的开局：**手工摆一个两步的局**。
   *
   * 设计稿的原话是"开局预设 1-2-4-4-3 让玩家 10 秒内体验先消豹子再合拢出顺子"。
   * 这句话里藏着一条很硬的约束：两步之间必须由 **compact（合拢）** 自动完成，
   * 不能靠玩家再打一枪——否则那只是两次独立消除，不是"连消"。
   *
   * 所以第一落点（0 号射口下的那一格）周围摆成：
   *
   *     ... 1 2 [4] 4 3 4 1 ...
   *            ↑ 空投一颗 4 进来
   *
   * 插入 4 之后是 4-4-4（豹子），清掉三格合拢，左边那颗 2 正好接上 3-4 → 2-3-4。
   * 一枪两段连锁，第二段自动发生。这就是"顺子是合拢送的"那句话的代码形态。
   *
   * 剩下的槽位随机补，但每补一颗都要求全环仍然没有牌型——
   * 和基础模式一样，"开局不许有现成的消除"是这条曲线能从头教起的前提。
   */
  placeOpeningDice() {
    const off0 = this.nozzleOff[0];
    const maxCi = this.colorCount();
    const seed = [1, 2, 4, 4, 3, 4, 1];   // 从 off0-2 起算
    for (let i = 0; i < seed.length; i++) {
      const idx = mod(off0 - 2 + i, N);
      this.slots[idx] = this.makeBead(Math.min(seed[i], maxCi) - 1);
    }

    // 其余射口 / 空位：随机点数，拒绝任何会立刻成型的牌型
    const offs = this.nozzleOff.slice(1, this.mode.layout);
    for (const off of offs) {
      for (let i = 0; i < 5; i++) {
        const idx = mod(off - 2 + i, N);
        if (this.slots[idx]) continue;
        let placed = false;
        for (let tries = 0; tries < 40; tries++) {
          this.slots[idx] = this.makeBead(Math.floor(this.rng() * maxCi));
          if (!findPattern(this.slots, N)) { placed = true; break; }
        }
        if (!placed) this.slots[idx] = null;
      }
    }

    // 第一发锁定 4 点：玩家需要先看到"一枪两段"，而不是先学会转盘。
    // 之后两发正常随机——教程只教一次。
    if (this.queues[0]) this.queues[0][0] = 3;
  }

  /**
   * 扑克模式的开局：手工摆一个"第一枪就同花"的局。
   *
   * 摆法是（从 0 号射口左边两格起算）：
   *
   *     ... ♠Q  ♥10  [♥K]  ♣A  ♦J  ♠Q ...
   *                  ↑ 第一发 ♥Q 插在 ♥K 前面
   *
   * 注意目标格**必须是满的**：游戏的落点规则是"落到空格会吸附到最近的链条"，
   * 如果摆一个真空隙，♥Q 会被吸到旁边，根本进不了 ♥10 和 ♥K 中间。
   * 插进 ♥K 前面（并把它推开一格）之后是 ♥10 ♥Q ♥K，同花 300。
   *
   * 刻意避开 10-J-Q / J-Q-K，因为那会是同花顺（2000 + 狂热），
   * 开局第一枪就给太大的东西，后面的"三条 / 顺子"就教不动了。
   *
   * 其余槽位随机补牌，每补一张都要求全环没有现成牌型——
   * 和另外两个模式一样，"开局不许有现成的消除"是这条曲线能从头教起的前提。
   */
  placeOpeningPoker() {
    const off0 = this.nozzleOff[0];
    const seed = [
      [off0 - 2, 2, 2],   // ♠Q
      [off0 - 1, 0, 0],   // ♥10
      [off0,     3, 0],   // ♥K（被第一发 ♥Q 推开）
      [off0 + 1, 4, 3],   // ♣A
      [off0 + 2, 1, 1],   // ♦J
      [off0 + 3, 2, 2],   // ♠Q
    ];
    for (const [idx, rank, suit] of seed) {
      this.slots[mod(idx, N)] = this.makeBead(CARD_BASE + rank * 4 + suit);
    }

    const offs = this.nozzleOff.slice(1, this.mode.layout);
    for (const off of offs) {
      for (let i = -2; i <= 4; i++) {
        const idx = mod(off + i, N);
        if (this.slots[idx]) continue;
        let placed = false;
        for (let tries = 0; tries < 40; tries++) {
          this.slots[idx] = this.makeBead(CARD_BASE + Math.floor(this.rng() * 20));
          if (!findHand(this.slots, N)) { placed = true; break; }
        }
        // 40 次都凑不出"无牌型"就留空，而不是把最后一颗会成型的牌留在盘上。
        // 开局有一个现成牌型，等于第一枪之前系统自己先消了一次——教程就废了。
        if (!placed) this.slots[idx] = null;
      }
    }

    // 第一发锁定 ♥Q：玩家第一次开火就能看到"同花"成立。
    // 之后的牌正常发——教程只教一次。
    if (this.queues[0]) this.queues[0][0] = CARD_BASE + 2 * 4 + 0;
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
    // dv = 本次补位的收拢速度（格/秒）。必须**存在珠子上**而不是每帧现算：
    // 现算的话 ad 越接近 0 速度越慢，退化成指数衰减、尾巴拖不完。
    // 0 表示"没有在滑"，下次被推挤时按推挤档位重新赋值。
    //
    // roll：骰子翻滚动画的剩余时间。只影响渲染，不参与任何判定——
    // 把它做成"动画进度"而不是"逻辑状态"，是为了让快进 / 无头测试完全不受它影响。
    // x2：这颗骰子踩过镀金槽，消除时得分 ×2。状态记在珠子上（而不是槽位上），
    // 这正是上一版 ×2 槽失败的原因：旧版把状态放在一段几何区间里，玩家看不见。
    return { id: beadSeq++, ci, dx: 0, dv: 0, roll: 0, x2: false };
  }

  occupied() {
    let n = 0;
    for (let i = 0; i < N; i++) if (this.slots[i]) n++;
    return n;
  }

  colorCount() {
    // 扑克模式没有"颜色逐个解锁"：牌池固定 20 张（5 点 × 4 花），
    // 难度由牌型密度和节奏承担，不靠往牌池里加新花色。
    if (this.rules === 'poker') return 20;
    let n = 3;
    for (const [t, c] of CFG.colorSteps) if (this.time >= t) n = c;
    return Math.min(n, this.colorTotal());
  }

  /** 本模式的"几种可匹配面"：基础模式 4 色，骰子模式 6 点，扑克 20 张。 */
  colorTotal() {
    if (this.rules === 'poker') return 20;
    return this.rules === 'dice' ? PIPS.length : PALETTE.length;
  }

  /** ci → 匹配面下标；不参与匹配的返回 -1（锈球 / 铅骰 / 暗牌） */
  faceIndex(ci) {
    if (this.rules === 'poker') return isFaceCard(ci) ? (ci - CARD_BASE) % 20 : -1;
    if (this.rules === 'dice') return isPip(ci) ? pipIndex(ci) : -1;
    return ci >= 0 && ci < PALETTE.length ? ci : -1;
  }

  /** 当前激活的射口数 */
  nozzleCount() {
    let n = 1;
    for (const [t, c] of CFG.stages) if (this.time >= t) n = c;
    return Math.min(n, this.mode.layout);
  }

  /**
   * 下一发从哪个口出。
   *
   * 从"返回一组口"改成"返回一个口"，是这一版最大的机制改动。
   * 齐射时两颗球共享同一个落点时刻，玩家其实只有一个自由度（一个相位），
   * 但屏幕上同时有两颗球要读——信息量翻倍，决策量不变，纯粹是认知噪声。
   * 改成轮转之后，每一颗球都是一次完整的"看球色 → 转盘 → 等落地"。
   */
  nextVolley() {
    const n = this.nozzleCount();
    return [this.volleyIndex % n];
  }

  /**
   * 扑克模式的装填：按"这张牌现在有没有用"加权发牌。
   *
   * 20 张牌如果均匀发，顺子和同花的出现频率会低到玩家必须等运气；
   * 而扑克模式的核心乐趣是"规划牌型"，不是"等一张牌"。
   * 这里和骰子模式同一个比例（74% 加权 / 26% 均匀）：
   * 全按最优发，玩家会发现每张牌都有解，于是只做反应、不再预判。
   *
   * 权重用 evalCardPlacement 的收益压缩到 0.08 倍：直接拿 2000 分做权重，
   * 同花顺会被发成常态；压缩之后，300 分的同花和 700 分的顺子才是
   * "更常见但仍需争取"的那一档。
   */
  pickPokerCard() {
    const at = (j) => this.slots[mod(j, N)];
    const weights = [];
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const ci = CARD_BASE + i;
      let best = 0;
      for (let k = 0; k < N; k++) {
        const sc = evalCardPlacement(at, N, k, ci, at(k) !== null);
        if (sc > best) best = sc;
      }
      const w = Math.max(4, best * CFG.pokerWeight);
      weights.push(w);
      total += w;
    }

    if (this.rng() < CFG.pokerSmart) {
      let r = this.rng() * total;
      for (let i = 0; i < 20; i++) {
        r -= weights[i];
        if (r <= 0) return CARD_BASE + i;
      }
      return CARD_BASE + 19;
    }
    return CARD_BASE + Math.floor(this.rng() * 20);
  }

  // ---- 发色权重：按场上存量加权，冷门色强制召回 ----
  //
  // 骰子模式下"色"换成"点"，但意图完全一样：场上有几点，就多补几点。
  // 唯一的差别是翻面骰（20..25）必须按**点数**计入存量，否则
  // `count[20]` 会是一条 undefined 的加法，抽出来的权重全是 NaN——
  // 那种 bug 不会报错，只会让发球变成纯随机，而且只在骰子模式出现。
  pickColor() {
    if (this.rules === 'poker') return this.pickPokerCard();
    const maxCi = this.colorCount();

    // 骰子模式的装填：**按"这一点现在有没有用"发牌**。
    //
    // 这不是难度妥协，是这个题材本来就该有的东西——骰子是机器发的，
    // 机器当然会发你用得上的点数。硬要均匀发 1-6，实测有 29% 的球
    // 在整条环上都找不到任何能成牌型的落点（见 DESIGN §33 的探针数据），
    // 玩家体验到的是"连续三发都不知道该往哪打"，然后被塞三颗铅骰。
    // 那种挫败感和"我没想清楚"无关，纯粹是抽签。
    //
    // 保留 26% 的均匀抽样：全按最优发牌，玩家会发现"每颗球都有解"，
    // 于是不再预判，只做反应——那是另一种无聊。
    if (this.rules === 'dice') {
      const at = (j) => this.slots[mod(j, N)];
      let total = 0;
      const w = [];
      for (let v = 0; v < maxCi; v++) {
        let best = 0;
        for (let k = 0; k < N; k++) {
          const sc = evalPlacement(at, N, k, v, at(k) !== null);
          if (sc > best) best = sc;
        }
        // 收益 → 权重：3 连（约 312）权重最高，只能凑对子（36）低一档，
        // 完全无解（6）给一点点底权重，保证它仍可能出现。
        w.push(Math.max(4, best - 4));
        total += w[v];
      }
      if (this.rng() < 0.74) {
        let r = this.rng() * total;
        for (let v = 0; v < maxCi; v++) {
          r -= w[v];
          if (r <= 0) return v;
        }
        return maxCi - 1;
      }
      return Math.floor(this.rng() * maxCi);
    }

    const count = new Array(this.colorTotal()).fill(0);
    for (const b of this.slots) {
      if (!b) continue;
      const k = this.faceIndex(b.ci);
      if (k >= 0) count[k]++;
    }

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
   * 补一颗待发球：基础面 or 特殊球。
   * 特殊球的概率是**一次判定里依次吃掉**的，所以各项是互斥区间而不是叠加，
   * 改一个不会把另一个挤掉。
   *
   * 骰子模式多一档翻面骰（flipRate）：它不是一个"新球种"，而是一颗
   * **带着翻面印记的点数骰**，所以它同样要点数、同样参与牌型，
   * 只是被消掉的那一刻会替你把左右两颗翻成同点。
   */
  pickShot() {
    if (this.time >= CFG.specialStart) {
      const r = this.rng();
      if (r < CFG.wildRate) return WILD;
      if (r < CFG.wildRate + CFG.bombRate) return BOMB;

      if (this.rules === 'poker') {
        const sr = CFG.shiftRate || 0;
        if (sr > 0 && r < CFG.wildRate + CFG.bombRate + sr) {
          // 染花牌也是一张**有牌面的牌**：抽"这个落点最需要的那张"，
          // 再把它升级成染花版本。纯随机抽一张染花牌，5% 只会变成噪声。
          const ci = bestCardAt((j) => this.slots[mod(j, N)], N,
            this.impactSlot(this.nozzleOff[0]), false);
          return SHIFT_BASE + (ci - CARD_BASE);
        }
        return this.pickPokerCard();
      }

      const fr = CFG.flipRate || 0;
      if (fr > 0 && r < CFG.wildRate + CFG.bombRate + fr) {
        // 翻面骰的点数按局面挑：它不是随机抽一面，而是抽"你现在最缺的那一面"，
        // 否则这个 5% 只会变成一次随机噪声。
        const pip = bestPipAt((j) => this.slots[mod(j, N)], N,
          this.impactSlot(this.nozzleOff[0]), false);
        return 20 + pip - 1;
      }
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
    const occupied = this.slots[k] !== null;
    // 与 dropAt 保持同一套推挤方向判定：决定原 slots[k] 落在插入点的左侧还是右侧。
    let pushRight = true;
    if (occupied) {
      const p = this.nearestNull(k, +1);
      const q = this.nearestNull(k, -1);
      pushRight = p >= 0 && (q < 0 || p <= q);
    }

    // 扑克模式的小丑牌**不在落地时定型**：它要留在链上同时充当任意花色
    // 与任意点数，这正是它和骰子万能骰的区别。这里只是兜底。
    if (this.rules === 'poker') {
      return bestCardAt((j) => this.slots[mod(j, N)], N, k, occupied);
    }

    // 骰子模式的万能骰：按真实推挤方向构造虚拟邻接视图再求最优点数。
    // 当向左推挤时，原 slots[k] 会被推到 k-1，而不是 k+1。
    if (this.rules === 'dice') {
      const at = occupied && !pushRight
        ? (j) => {
          const d = mod(j - k + N / 2, N) - N / 2;
          if (d < 0) return this.slots[mod(j + 1, N)];
          return this.slots[mod(j, N)];
        }
        : (j) => this.slots[mod(j, N)];
      return bestPipAt(at, N, k, occupied && pushRight) - 1;
    }

    const n = this.colorCount();
    // 已占槽插入时，原 slots[k] 会紧贴插入点一侧：
    //   向右推（p <= q）→ 左邻从 k-1 起，右邻从 k 起
    //   向左推（q < p） → 左邻从 k 起，右邻从 k+1 起
    //   空槽落地        → 左邻从 k-1 起，右邻从 k+1 起
    const lStart = occupied && !pushRight ? 0 : 1;
    const rStart = occupied && pushRight ? 0 : 1;

    let bestCi = 0, bestLen = -1;
    for (let ci = 0; ci < n; ci++) {
      let len = 1;
      for (let i = lStart; i < N; i++) {
        const b = this.slots[mod(k - i, N)];
        if (b && b.ci === ci) len++; else break;
      }
      for (let i = rStart; i < N; i++) {
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

    // ---- 出球节奏：两种模式共用同一条"拍间隔 → 倍率"管线 ----
    //
    // timer：时间地板 vs 分数曲线取更快的那条（原来的曲线）。
    // music：半小节一颗，BPM 按 MUSIC_BPM_KEYS 在两慢两快之间走。
    //        88→148 BPM 对应 1.36s→0.81s 的颗间隔，玩家听到的鼓点
    //        和炮口蓄力是同一个拍子。
    if (this.fireMode === 'music') {
      const prog = Math.min(1, this.time / Math.max(1, CFG.levelTime));
      this.musicBpm = musicBpmAt(prog);
      this.beat = 2 * 60 / this.musicBpm;          // 半小节 = 2 拍
      this.musicTempo = Math.max(0, Math.min(1, (this.musicBpm - 88) / 60));
      this.tempo = this.musicTempo;
      // 相位用累加而不是 time / 拍长：BPM 变化时不会突然跳一下。
      this.musicBeatPhase = (this.musicBeatPhase + dt / (60 / this.musicBpm)) % 1;
    } else {
      const tRamp = Math.min(1, this.time / CFG.rampSec);
      const beatTime = CFG.beatStart + (CFG.beatEnd - CFG.beatStart) * tRamp;
      const prog = Math.min(1, this.score / Math.max(1, CFG.tempoRef));
      // 0.85 次幂：前段抬得快一点。线性的话，前 20% 的分数只换来 20% 的加速，
      // 而玩家在开局那一段最需要"我做的每件事都有反应"的即时回馈。
      const beatScore = CFG.beatStart + (CFG.beatRush - CFG.beatStart) * Math.pow(prog, 0.85);
      this.beat = Math.max(CFG.beatRush, Math.min(beatTime, beatScore));

      // tempo 是"当前速度"的归一化，不是分数进度。分开的理由：
      // 时间地板也在加速，如果 tempo 只看分数，一个从不消球的玩家
      // 会看到机器越转越快、倍率却一直是 1.00——那是在骗他。
      const span = Math.max(1e-6, CFG.beatStart - CFG.beatRush);
      this.tempo = Math.max(0, Math.min(1, (CFG.beatStart - this.beat) / span));
      this.musicBpm = 0;
      this.musicTempo = 0;
      this.musicBeatPhase = 0;
    }
    this.tempoMult = tempoMultOf(this.tempo, CFG.tempoGain);
    if (this.tempo > this.maxTempo) this.maxTempo = this.tempo;
    if (this.tempo >= 0.995) this.fastT += dt;
    if (this.firePulse > 0) this.firePulse = Math.max(0, this.firePulse - dt / 0.30);

    // 飞行时长跟着颗间隔收紧。地板在这里是"拍内空档"（1 - ratio），
    // 所以 beat 再也不需要 max(beat, flight + fireGap) 这种事后夹逼：
    // 只要 flightRatio < 1，飞行永远装得进一拍里，空中最多一颗球的不变量
    // 由几何保证，而不是靠一个容易忘掉的 clamp。
    this.flightDur = Math.min(
      CFG.nozzleGap / CFG.flightSpeed,
      this.beat * CFG.flightRatio,
    );

    for (let i = this.tempoMark; i < TEMPO_MARKS.length; i++) {
      if (this.tempo < TEMPO_MARKS[i].at) break;
      this.tempoMark = i + 1;
      this.events.push({
        type: 'tempo', mark: i + 1, name: TEMPO_MARKS[i].name,
        tempo: this.tempo, mult: this.tempoMult,
      });
    }

    const dir = this.input;
    if (dir !== 0) {
      this.v += dir * CFG.accel * dt;
    } else {
      this.v = CFG.drift + (this.v - CFG.drift) * Math.exp(-CFG.dampK * dt);
    }
    this.v = Math.max(-CFG.vMax, Math.min(CFG.vMax, this.v));
    this.phase = mod(this.phase + this.v * dt, N);

    // 炮身瞄准角：把"转盘速度"映射到 -24°~+24° 的 7 个固定档位。
    // 中心是静止漂移，所以松手时会回到 0°；音频只认 aimStep，
    // aimAngle 只负责炮身平滑倾斜——两者共用同一套档位。
    const aimRel = (this.v - CFG.drift) / Math.max(0.1, CFG.vMax - CFG.drift);
    const aimRaw = Math.max(-24, Math.min(24, aimRel * 24));
    this.aimStep = Math.max(0, Math.min(6, Math.round((aimRaw + 24) / 8)));
    const aimTarget = AIM_ANGLES[this.aimStep];
    this.aimAngle += (aimTarget - this.aimAngle) * Math.min(1, dt * 14);

    // 补位：恒速收拢，不是指数衰减。速度值记在珠子自己身上（dv），
    // 因为两种动作的速度差一个量级：
    //   1 格（插入时整列让位）—— dxSpeed，必须快，慢了整列珠子会叠在邻居身上；
    //   2 格以上（落空后吸附到链条）—— dxSlideSpeed，必须慢，
    //     那是"珠子从落点走向链条"，用 11 格/秒走完 6 格只要 0.55 秒，等于瞬移。
    for (const b of this.slots) {
      if (!b) continue;
      // 翻滚动画：纯表现，但必须在这里推进——渲染层没有 dt 的权威来源，
      // 让渲染自己按真实时间衰减，会和固定步长在两倍速/掉帧时错开。
      if (b.roll > 0) b.roll = Math.max(0, b.roll - dt);
      if (b.dx === 0) continue;
      const ad = Math.abs(b.dx);
      const sp = b.dv || CFG.dxSpeed;
      const s = sp * dt;
      if (ad <= s) { b.dx = 0; b.dv = 0; }
      else b.dx = b.dx > 0 ? b.dx - s : b.dx + s;
    }
    if (this.frenzyT > 0) this.frenzyT = Math.max(0, this.frenzyT - dt);
    if (this.chain > 0 && this.time - this.chainT > 1.1) this.chain = 0;
    if (this.combo > 0 && this.time - this.comboT > COMBO_WINDOW) {
      if (this.combo >= 3) this.events.push({ type: 'combobreak', combo: this.combo });
      this.combo = 0;
      this.comboTier = 0;
    }

    // 落地排在发射之前：同一帧里"上一颗贴上链条 → 下一颗出膛"是连续动作，
    // 反过来的话每次都会多等一帧，1.3s 的间隔里那一帧停顿是听得出来的。
    if (this.balls.length) {
      for (const b of this.balls) b.t += dt;
      if (this.balls[0].t >= this.balls[0].dur) this.land();
      if (this.dead) return;
    }

    this.beatClock += dt;
    if (this.beatClock >= this.beat && !this.balls.length) {
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

    if (this.time >= this.timeLimit()) this.kill('time');
  }

  /** 本局的总时长上限 = 关卡时长 + 连消续来的秒数（有封顶）。 */
  timeLimit() {
    return CFG.levelTime + this.timeBonus;
  }

  timeLeft() {
    return Math.max(0, this.timeLimit() - this.time);
  }

  /**
   * 底牌暂存槽（E / 右键）。
   *
   * 第一次按：把**下一发**那张牌扣进槽里，发牌机补一张新牌。
   * 第二次按：把槽里的牌换回待发位，原来那张牌扣进槽里。
   *
   * 为什么只管"下一发"：玩家的规划窗口是待发 + 两个预览。如果允许从预览位
   * 里挑，他等于同时管理三张牌，而 UI 只有一个槽——那会变成"哪张在槽里"
   * 的记忆负担。只动待发位，规则一句话说完：**扣下你现在这张，换上来另一张**。
   */
  holdNext() {
    if (!CFG.holdEnabled || this.dead) return false;
    const n = this.nozzleCount();
    const idx = this.volleyIndex % n;
    const q = this.queues[idx];
    if (!q || !q.length) return false;

    const cur = q[0];
    if (this.hold === null) {
      this.hold = cur;
      q[0] = this.pickShot();
      this.holdUses++;
      this.events.push({ type: 'hold', card: cur, idx, off: this.nozzleOff[idx] });
    } else {
      const prev = this.hold;
      this.hold = cur;
      q[0] = prev;
      this.holdUses++;
      this.events.push({
        type: 'holdswap', card: prev, out: cur, idx, off: this.nozzleOff[idx],
      });
    }
    return true;
  }

  /**
   * 出一颗球。口按 volleyIndex 轮转，一次只有一个口动作。
   *
   * "轮流"不只是视觉偏好。齐射时两个口同帧出球、同帧落地，玩家只有
   * 一个落点相位可调——两颗球其实是绑死的一个事件。轮流之后每颗球
   * 单独占一个飞行窗口，玩家的每一次转盘都对应一颗具体的球，
   * 因果链是干净的；代价是总发球速率要减半（见 modes 的 beat 参数）。
   */
  fire() {
    const n = this.nozzleCount();
    const idx = this.volleyIndex % n;
    this.volleyIndex = (idx + 1) % n;

    const ci = this.queues[idx][0];
    this.queues[idx].shift();
    this.queues[idx].push(this.pickShot());

    // 时长在 step 里已经按当前节奏算好（flightDur）。这里不再从
    // nozzleGap / flightSpeed 现推——满速时那两颗数会对不上，
    // 因为飞行时长现在由"拍内占比"决定，不是由恒定速度决定。
    const dur = this.flightDur;

    this.balls = [{ ci, off: this.nozzleOff[idx], idx, t: 0, dur }];

    this.firePulse = 1;
    this.fireSeq++;
    this.lastShotAngle = this.aimAngle;
    this.lastShotStep = this.aimStep;
    this.shots++;
    this.drops++;
    this.events.push({
      type: 'fire',
      colors: [ci],
      offs: [this.nozzleOff[idx]],
      idx,
      n: 1,
      angle: this.aimAngle,
      aimStep: this.aimStep,
      root: aimFreqStep(this.aimStep),
      pan: aimPanStep(this.aimStep),
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
      // 爆破王牌在骰子 / 基础模式里是"落地即炸"；在扑克模式里它是一张
      // 参与牌型的 A，只有被消除时才炸左右邻——同一条 ci，两种语义。
      if (t.ci === BOMB && this.rules !== 'poker') this.detonate(t.k, t.off);
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
    const gain = Math.round((BOMB_BASE + BOMB_BASE * 0.6 * (len - 1) + rustHit * 260) * comboMult * this.tempoMult);
    this.score += gain;
    this.clears++;
    this.bumpCombo(len);

    this.events.push({
      type: 'bomb', slot: c, off, hit: len, col: colors, positions,
      gain, comboMult, tempoMult: this.tempoMult, s: mod(start + this.phase, N) * D, len,
      combo: this.combo,
    });

    this.missStreak = 0;
    this.compact(start, len);
    // 爆破本身已经清掉了 len 颗珠子，不应再把无二次连锁的爆破记作漏发惩罚
    this.resolve(-1, off, false);
  }

  /** 这个槽位上有没有已启用的主动槽（+1 翻面 / ×2 镀金）。 */
  padAt(k) {
    for (const p of this.pads) {
      if (p.slot === k && this.time >= p.at) return p;
    }
    return null;
  }

  dropAt(k, ci0, off) {
    if (this.dead) return;
    if (this.occupied() >= N) { this.kill('overflow'); return; }

    const wasEmpty = this.slots[k] === null;
    const target = wasEmpty ? this.snap(k) : k;
    if (wasEmpty && target !== k) this.snapped++;

    // 万能球在**吸附之后**才定型：否则落点会偏一格，定出来的颜色也就错了。
    // 扑克模式例外：小丑牌落地后仍是小丑，它要在链上持续充当任意花色/点数。
    let ci = ci0 === WILD && this.rules !== 'poker' ? this.chooseWildColor(target) : ci0;
    if (ci0 === WILD) this.wilds++;

    // ---- 主动槽：判定在"骰子最终落在哪一格"，不在"球从哪儿落下" ----
    //
    // 这一版和上一版 ×2 槽最大的差别就在这一句。上一版的判定是
    // "消除段的中心弧长落在槽的半长区间内"——那是一条要读代码才能理解的规则，
    // 回报还只是数字翻倍，所以它死了（REVIEW §18.4）。现在判定是
    // "这颗骰子落在这一格"，回报**立刻写在这颗骰子脸上**：点数 +1 或者镀一层金。
    // 机制不再需要说明书，因为状态就在你盯着的那颗骰子上。
    // 只有骰子模式有"落在槽上就立刻改这颗骰子"的规则。
    // 扑克的筹码槽是**消除时**才结算的，不写在这条落地路径上。
    const pad = this.padAt(target);
    let doubl = false;
    if (this.rules === 'dice' && pad && isPip(ci)) {
      if (pad.kind === 'plus' && ci0 !== WILD) {
        const p = pipOf(ci);
        const np = p >= 6 ? 1 : p + 1;          // 6 点循环回 1 点
        ci = isFlipDie(ci) ? 20 + np - 1 : np - 1;
        this.padHits++;
        this.events.push({ type: 'padplus', slot: target, pip: np, off });
      } else if (pad.kind === 'x2') {
        doubl = true;
        this.padHits++;
        this.events.push({ type: 'padx2', slot: target, off });
      }
    }

    const bead = this.makeBead(ci);
    bead.roll = CFG.rollDur;
    bead.x2 = doubl;

    // 落空吸附：球是垂直落到 k 的，但珠子必须接在链条上（target）。
    // 两者相差几格，珠子就得在视觉上真的**走**这几格——不补这段位移，
    // 它会瞬间出现在离落点 6~11 格的地方。玩家看到的是"球落在空处，
    // 珠子凭空在别处出现"，而距离越远，那一刻越像被加速甩过去。
    // 机器人实测（标准局 357 次落球）：偏差 p90 = 6 格，最远 11 格，
    // 非零的 183 次里有 41 次超过 4 格——都是链条很短、落点在空弧上的时候。
    const drift = mod(target - k + N / 2, N) - N / 2;
    bead.dx = -drift;
    // 速度按距离取一次，记在珠子上（见 step 里的补位循环）。
    // /dxSlideMaxSec 是兜底：链条只剩两三颗时落点可能差 11 格，
    // 按 4.6 格/秒要拖 2.4 秒，会跟下一颗球同时在空中。
    bead.dv = drift === 0 ? 0
      : Math.max(CFG.dxSlideSpeed, Math.abs(drift) / CFG.dxSlideMaxSec);

    if (this.slots[target] === null) {
      this.slots[target] = bead;
      this.events.push({
        type: 'lone', slot: target, ci, off, dropSlot: k,
        s: mod(target + bead.dx + this.phase, N) * D,
        wild: ci0 === WILD,
      });
      this.resolve(target, off, true);
      return;
    }

    const p = this.nearestNull(target, +1);
    const q = this.nearestNull(target, -1);
    if (p < 0 && q < 0) { this.kill('overflow'); return; }

    if (p >= 0 && (q < 0 || p <= q)) {
      for (let i = p; i >= 1; i--) {
        const dst = mod(target + i, N), src = mod(target + i - 1, N);
        this.slots[dst] = this.slots[src];
        if (this.slots[dst]) {
          this.slots[dst].dx -= 1;
          // 静止的珠子被推开 = 推挤档，要快；正在慢滑的（dv 非 0）保持原速，
          // 否则它会在半路突然加速冲向链条。
          if (!this.slots[dst].dv) this.slots[dst].dv = CFG.dxSpeed;
        }
      }
    } else {
      for (let i = -q; i <= -1; i++) {
        const dst = mod(target + i, N), src = mod(target + i + 1, N);
        this.slots[dst] = this.slots[src];
        if (this.slots[dst]) {
          this.slots[dst].dx += 1;
          if (!this.slots[dst].dv) this.slots[dst].dv = CFG.dxSpeed;
        }
      }
    }
    this.slots[target] = bead;
    this.events.push({
      type: 'insert', slot: target, ci, off,
      // 特效锚点用**视觉位置**（slot + dx），不是逻辑槽位：
      // 落空吸附时珠子还在从落点滑过来的路上，火花画在 target 会脱节。
      s: mod(target + bead.dx + this.phase, N) * D,
      snapped: wasEmpty && target !== k,
      dropSlot: k,
      wild: ci0 === WILD,
    });

    this.resolve(target, off, true);
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
   * 铅骰：连续漏发 blankAt 发的惩罚。
   *
   * 复用 RUST 这个 ci，而不是新开一个 14：它和锈球的**语义完全一样**
   * （无点、不参与匹配、只能被相邻消除或爆破清掉），差别只在
   * "什么时候来"和"长得像什么"。为外观差异加一个球种，等于让
   * findMatch / resolve / compact 三处都要多判一次，而收益只是换张贴图。
   */
  injectBlank() {
    if (this.occupied() >= N - 1) return;
    let tail = -1;
    for (let i = 0; i < N; i++) {
      if (this.slots[i] && !this.slots[mod(i + 1, N)]) { tail = i; break; }
    }
    if (tail < 0) return;
    const at = mod(tail + 1, N);
    this.slots[at] = this.makeBead(RUST);
    this.slots[at].roll = CFG.rollDur;
    this.blanks++;
    this.events.push({
      type: 'blank', slot: at, s: mod(at + this.phase, N) * D,
      streak: this.missStreak,
    });
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
  // fromDrop 只影响"漏发计数"：只有真正落下去的一发才算玩家打空，
  // 旋转 / 拨片 / 连锁追问引起的空结算不能算。
  resolve(startSlot = -1, off = 0, fromDrop = false) {
    let chain = 0;
    let reward = 0;
    let crossedTier = 0;
    let chipJoker = false;
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
      if (CFG.rewardBombAt > 0 && chain === 1 && run.len >= CFG.rewardBombAt) {
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
      let bombN = 0;

      // 爆破王牌：它先按 A 参与牌型，牌型成立后再把左右紧邻各一张
      // （杂牌或暗牌）一起炸掉，每张 +150。这和基础模式"落地即炸"是
      // 两条完全不同的规则——前者是牌型的一部分，后者是跳过牌型。
      if (this.rules === 'poker') {
        let hasAceBomb = false;
        for (let i = 0; i < run.len; i++) {
          const b = this.slots[mod(run.start + i, N)];
          if (b && b.ci === BOMB) { hasAceBomb = true; break; }
        }
        if (hasAceBomb) {
          if (len < N && this.slots[mod(start - 1, N)]) {
            start = mod(start - 1, N);
            len++;
            bombN++;
          }
          if (len < N && this.slots[mod(run.start + run.len, N)]) {
            len++;
            bombN++;
          }
        }
      }

      let rustN = 0;
      if (len < N) {
        const lb = this.slots[mod(start - 1, N)];
        if (lb && lb.ci === RUST) { start = mod(start - 1, N); len++; rustN++; }
      }
      if (len < N) {
        // 右边界要用**当前的** start+len，不能用 run.start+run.len：
        // 爆破王牌可能刚刚把右边那张吞掉了，用原边界会把它再数一次。
        const rb = this.slots[mod(start + len, N)];
        if (rb && rb.ci === RUST) { len++; rustN++; }
      }

      const s0 = mod(start + this.phase, N) * D;

      // 连消倍率表按模式覆写：骰子用设计稿的 ×2/×4/×8/×12（指数更陡），
      // 基础模式保持原来的 1.6/2.6/4.2…（那套是按实测连消分布调出来的）。
      const CM = CFG.chainMult || CHAIN_MULT;
      const chainMult = CM[Math.min(chain - 1, CM.length - 1)];
      const comboRaw = COMBO_MULT[Math.min(this.combo, COMBO_MULT.length - 1)];
      // 扑克的牌型密度比骰子高，连消倍率如果不封顶，一次 300 分的同花
      // 会被 4 倍连消乘成 1200，盘面越松分越高、新手越追不上。
      // 封顶不是削弱玩家，是把"牌型选择"重新放回收益的主位。
      const comboMult = CFG.comboCap > 0 ? Math.min(comboRaw, CFG.comboCap) : comboRaw;
      // 筹码槽：牌型里只要有一张牌压在金色槽上，整段 ×2。
      // 判定是"这段牌型覆盖了槽位"，不是"这张牌落在槽上"——扑克的计价
      // 单位是整段牌型，拆不出"这一张值多少"；而"整段 ×2"玩家能预期。
      let chipPad = null;
      if (this.rules === 'poker') {
        for (const p of this.pads) {
          if (p.kind !== 'chip' || this.time < p.at) continue;
          for (let i = 0; i < len; i++) {
            if (mod(start + i, N) === p.slot) { chipPad = p; break; }
          }
          if (chipPad) break;
        }
      }
      const chipMult = chipPad ? 2 : 1;
      // 狂热：同花顺点火的 7 秒内所有消除 ×2。触发的那一下本身不吃，
      // 所以这里先读**旧**状态，结算完再点火。
      const frenzyMult = this.frenzyT > 0 ? (CFG.frenzyMult || 1) : 1;

      // 参考分：基础模式按"消掉几颗"查表；骰子 / 扑克由牌型本身决定，
      // value 已在 findPattern / findHand 里算好。
      const base = (run.value || BASE_SCORE(run.len)) + rustN * 200 + bombN * 150;

      // ×2 镀金：只要这一段里有一颗镀过金的骰子，整段翻倍。
      // 为什么按整段而不是按颗：顺子是整体计价的，拆不出"这一颗值多少"；
      // 而"整段翻倍"恰好是玩家能预期的规则——把金骰塞进一次大消除才有意义。
      let dbl = 1;
      for (let i = 0; i < run.len; i++) {
        const b = this.slots[mod(run.start + i, N)];
        if (b && b.x2) { dbl = 2; break; }
      }

      // 节奏倍率：机器转得越快，同样一次消除越值钱。
      // 这是"节奏越快分越高"的**显式**实现——上一版只有隐含的一层
      // （beat 短 → 单位时间发球多），玩家完全读不出来。
      const gain = Math.round(base * chainMult * comboMult * this.tempoMult * dbl * chipMult * frenzyMult);
      this.score += gain;
      this.clears++;
      if (run.kind === 'run' && run.len > this.longestRun) this.longestRun = run.len;
      if (run.jackpot) this.jackpots++;
      if (this.rules === 'poker') {
        if ((run.kind === 'straight' || run.kind === 'straightflush') && run.len > this.longestStraight) {
          this.longestStraight = run.len;
        }
        if (run.kind === 'straightflush') this.straightFlushes++;
        if (run.kind === 'three' && run.len >= 4) this.fours++;
        if (chipPad) {
          this.chipClears++;
          if (CFG.chipBonusJoker && (run.kind === 'three' || run.kind === 'straightflush')) {
            chipJoker = true;
          }
        }
      }

      const colors = [];
      const positions = [];
      let hasFlip = false;
      let hasShift = false;
      let golds = 0;
      for (let i = 0; i < len; i++) {
        const idx = mod(start + i, N);
        const b = this.slots[idx];
        colors.push(b.ci);
        positions.push(mod(idx + this.phase, N) * D);
        if (isFlipDie(b.ci)) hasFlip = true;
        if (isShiftCard(b.ci)) hasShift = true;
        if (b.x2) golds++;
        this.slots[idx] = null;
      }

      const info = this.rules === 'poker'
        ? pokerLabel(run)
        : (run.kind ? patternLabel(run) : { name: '', color: null });

      this.events.push({
        type: 'clear', chain, gain, base, chainMult, comboMult, rustN, bombN,
        chip: chipMult, frenzyMult, chipSlot: chipPad ? chipPad.slot : -1,
        tempoMult: this.tempoMult,
        // len 是"本次清掉多少颗"（含两侧被震碎的锈球和爆破王牌炸掉的邻牌），
        // matchLen 是真正凑成牌型的长度。奖励球只认 matchLen。
        colors, positions, len, matchLen: run.len, off, s0,
        combo: this.combo,
        // 牌型信息（基础模式无意义，渲染层按 rules 决定读不读）
        kind: run.kind || null, dir: run.dir || 0, pips: run.sum || 0,
        ranks: run.ranks || null,
        dbl, golds, jackpot: !!run.jackpot,
        label: info.name,
        color: info.color,
        // 音画映射：这一段连锁以"上一发锁定角度"的音高为根音。
        angle: this.lastShotAngle,
        root: aimFreqStep(this.lastShotStep),
        pan: aimPanStep(this.lastShotStep),
      });

      // 同花顺点火：7 秒狂热 + 续时。放在 clear 事件之后，
      // 这样触发的那一下不会被自己刚点着的 ×2 再翻一倍。
      if (run.kind === 'straightflush') {
        this.frenzyT = CFG.frenzyDur || 7;
        const before = this.timeBonus;
        if (CFG.frenzyTime > 0) {
          this.timeBonus = Math.min(CFG.timeBonusCap, this.timeBonus + CFG.frenzyTime);
        }
        this.frenzies++;
        this.events.push({
          type: 'frenzy', dur: this.frenzyT, mult: CFG.frenzyMult || 1,
          add: this.timeBonus - before, total: this.timeBonus,
          root: aimFreqStep(this.lastShotStep),
          pan: aimPanStep(this.lastShotStep),
        });
      }

      // 翻面骰在清除之后、合拢之前结算：它翻的是"还在盘上的左右两颗"，
      // 一旦先 compact，那两颗的邻居关系就变了，翻出来的点数也就对不上。
      if (hasFlip) this.flipNeighbors(start, len, off);
      // 染花牌同理：先改还在盘上的左右邻，再合拢。
      // 用**实际清除段** start/len，而不是 run.start/run.len：
      // 爆破王牌可能把左右各多炸了一张，邻居关系和合拢距离都变了。
      if (hasShift) this.shiftNeighbors(start, len, off);

      this.compact(start, len);
    }

    if (chain > 0) {
      this.chain = chain;
      this.chainT = this.time;
      this.maxChain = Math.max(this.maxChain, chain);

      // 一次结算至多发一颗奖励球，避免单次连挤掉两张预览牌：
      // 扑克筹码槽小丑优先；若常规奖励路线已关闭（如扑克 rewardBombAt=99），
      // 也不再通过连消档位追加炸弹。
      if (chipJoker) {
        this.chipJokers++;
        this.grantReward(WILD);
      } else {
        if (!reward && CFG.rewardBombAt < 99) {
          if (crossedTier >= 3) reward = WILD;
          else if (crossedTier >= 2) reward = BOMB;
        }
        if (reward) this.grantReward(reward);
      }

      // 清空跑道：给一次大额奖励，鼓励"敢把盘面打空"。
      // 和消除一样吃节奏倍率——在满速下把 28 格清空，本来就比开局清空难得多。
      if (this.occupied() === 0) {
        const bonus = Math.round(SWEEP_BONUS * this.tempoMult);
        this.score += bonus;
        this.sweeps++;
        this.events.push({ type: 'sweep', gain: bonus, combo: this.combo });
      }

      // 连消续时：只有骰子模式开（基础模式的时长是固定的，改它等于改所有段位线）。
      // 从 chain ≥ 2 才开始给——第一段人人都有，续时就失去"连锁才值钱"的语义。
      const tab = CFG.chainTime;
      if (tab && chain >= 2) {
        const add = tab[Math.min(chain, tab.length - 1)] || 0;
        const before = this.timeBonus;
        this.timeBonus = Math.min(CFG.timeBonusCap, this.timeBonus + add);
        if (this.timeBonus - before >= 0.05) {
          this.events.push({
            type: 'bonus', add: this.timeBonus - before, total: this.timeBonus, chain,
          });
        }
      }
    } else {
      this.chain = 0;
    }

    // 漏发惩罚：连发 blankAt 颗都没消除，就往蛇尾塞一颗无点铅骰。
    // 只在"这一发真的落下去了"时计数（fromDrop），否则旋转 / 拨片触发的
    // 空结算也会被算成一次漏发，玩家会因为"转了个轮盘"被惩罚。
    if (fromDrop && CFG.blankAt > 0) {
      if (chain > 0) this.missStreak = 0;
      else {
        this.missStreak++;
        if (this.missStreak >= CFG.blankAt) {
          this.missStreak = 0;
          this.injectBlank();
        }
      }
    }
  }

  /**
   * 翻面骰被消掉时，把清除段左右紧邻的两颗翻成同一点数。
   *
   * 为什么必须"两颗同时"：只翻一侧的话，它只是把一颗骰子换成另一个数，
   * 玩家看不出这和万能骰有什么区别。两颗同时翻成同点，才在盘面上
   * 直接造出一个"对子"——合拢之后只要外侧还有一颗同点，下一段连锁就是白送的。
   *
   * 选哪个点数：穷举 1..6，取翻完之后全环最值钱的牌型。六次 N 长扫描，
   * 一次结算最多触发一次，成本可以忽略；换来的是"这个特殊骰看起来很聪明"。
   */
  flipNeighbors(start, len, off) {
    const li = mod(start - 1, N);
    const ri = mod(start + len, N);
    const L = this.slots[li];
    const R = this.slots[ri];
    if (!L || !R || !isPip(L.ci) || !isPip(R.ci)) return;

    const lFlip = isFlipDie(L.ci);
    const rFlip = isFlipDie(R.ci);

    // 穷举必须在**合拢之后**的盘面上做，不能在当前这张带洞的盘面上做。
    //
    // 这是第七轮修的第二个静默 bug：翻面骰的左右邻在翻的这一刻还隔着
    // 被清掉的 len 格，而它们真正"相邻"是在 compact 之后。拿带洞的盘面
    // 去扫，findPattern 永远扫不出这一段，六个候选点数全是 0 分，
    // 于是 bestPip 恒等于 1——"替你翻成最值钱的那一点"实际永远翻成 1 点，
    // 而且不报错、不崩、只是这条规则从来没按设计跑过。
    //
    // 复制一份盘面、在上面复刻 compact 的位移，就能在不污染真盘面的前提下
    // 看到"翻完并合拢"的样子。
    const probe = this.slots.slice();
    {
      const end = mod(start + len, N);
      let run = 0;
      while (run < N - len && probe[mod(end + run, N)] !== null) run++;
      for (let i = 0; i < run; i++) {
        const dst = mod(start + i, N), src = mod(end + i, N);
        probe[dst] = probe[src];
        probe[src] = null;
      }
    }

    let bestPip = 6, bestV = 0;
    for (let pip = 1; pip <= 6; pip++) {
      L.ci = lFlip ? 20 + pip - 1 : pip - 1;
      R.ci = rFlip ? 20 + pip - 1 : pip - 1;
      const p = findPattern(probe, N);
      const v = p ? patternValue(p) : 0;
      if (v > bestV) { bestV = v; bestPip = pip; }
    }

    L.ci = lFlip ? 20 + bestPip - 1 : bestPip - 1;
    R.ci = rFlip ? 20 + bestPip - 1 : bestPip - 1;
    L.roll = CFG.rollDur;
    R.roll = CFG.rollDur;
    this.events.push({
      type: 'flipdice', pip: bestPip, off, value: bestV,
      slots: [li, ri],
      s: mod(li + this.phase, N) * D,
    });
  }

  /**
   * 染花牌被消掉时，把清除段左右紧邻的两张牌改成同一花色。
   *
   * 和翻面骰同一条时间线：必须在清除之后、compact 之前改，否则
   * "左右邻"已经不是玩家看到的那两张。选花色时同样在**合拢后**的
   * 副本上穷举 4 种花色，取整环最值钱的牌型——否则染花牌只会染出一个
   * 玩家看不懂的花色，规则等于不存在。
   */
  shiftNeighbors(start, len, off) {
    const li = mod(start - 1, N);
    const ri = mod(start + len, N);
    const L = this.slots[li];
    const R = this.slots[ri];
    if (!L || !R) return;

    const canL = isFaceCard(L.ci);
    const canR = isFaceCard(R.ci);
    if (!canL && !canR) return;

    const l0 = L.ci, r0 = R.ci;

    const probe = this.slots.slice();
    {
      const end = mod(start + len, N);
      let run = 0;
      while (run < N - len && probe[mod(end + run, N)] !== null) run++;
      for (let i = 0; i < run; i++) {
        const dst = mod(start + i, N), src = mod(end + i, N);
        probe[dst] = probe[src];
        probe[src] = null;
      }
    }

    let bestSuit = 0, bestV = -1;
    // 无立即可消牌型时，优先染成靠近外侧相邻牌的花色，而不是恒定染成 ♥
    const outerL = this.slots[mod(li - 1, N)];
    const outerR = this.slots[mod(ri + 1, N)];
    for (let suit = 0; suit < 4; suit++) {
      if (canL) L.ci = withSuit(l0, suit);
      if (canR) R.ci = withSuit(r0, suit);
      const p = findHand(probe, N);
      let v = p ? p.value + (p.kind === 'straightflush' ? 1500 : 0) : 0;
      if (v === 0) {
        if (outerL && suitOf(outerL.ci) === suit) v += 0.2;
        if (outerR && suitOf(outerR.ci) === suit) v += 0.2;
      }
      if (v > bestV) { bestV = v; bestSuit = suit; }
    }

    if (canL) L.ci = withSuit(l0, bestSuit);
    if (canR) R.ci = withSuit(r0, bestSuit);
    this.events.push({
      type: 'shiftsuit', suit: bestSuit, sym: SUITS[bestSuit].sym,
      slots: [li, ri], value: bestV, off,
      s: mod(li + this.phase, N) * D,
    });
  }

  /**
   * 把奖励球塞进队列的**待发位**，并挤掉末尾那颗预览球。
   *
   * 为什么插最前面而不是附加：奖励必须"下一发就能用"，否则玩家感受不到因果
   * ——4 连和两拍后的某颗球之间建立不了联系。
   *
   * 插哪个口：`volleyIndex` 指向的那个——它正好是**下一发**要开火的口。
   * 上一版按"消除发生的那个落点"去找口，齐射时两者等价（两个口同帧开火），
   * 轮流之后就不等价了：你在 A 口消除，下一发可能从 B 口出，奖励会跑到
   * 两发之后才兑现，因果链断掉。
   *
   * 为什么必须挤掉一颗：队列定长 3 是有意义的（待发 + 两个预览，等于"我接下来
   * 能规划两步"）。变长会悄悄改掉节奏。挤掉末尾那颗是**代价**，也是这个奖励
   * 唯一的分量：你用一个已知信息换了一个强力球。
   */
  grantReward(ci) {
    const idx = this.volleyIndex % this.nozzleCount();

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
    // 骰子模式换成"点数牌型"扫描（豹子 / 顺子）。注意它返回的字段比基础版多
    // （value / kind / dir / sum / jackpot），resolve 里用 run.value 优先取值，
    // 所以两种返回结构可以共存于同一条结算管线。
    if (this.rules === 'dice') return findPattern(this.slots, N);
    // 扑克模式：3..5 张连续窗口，取最值钱的牌型（同花 / 三条 / 顺子 / 同花顺）。
    if (this.rules === 'poker') return findHand(this.slots, N);

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
    // 边界兜底：整条环 N 格全为同一种基础色时，每个槽的 prev 都同色，
    // 上面循环会全部跳过；此时整环本身就是一个长度为 N 的可消段。
    const b0 = this.slots[0];
    if (b0 && b0.ci !== RUST && this.slots.every((b) => b && b.ci === b0.ci)) {
      return { start: 0, len: N };
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
