// 模式定义：几何 + 发球口 + 节奏 + 计分线，全部集中在这里。
// sim.js 只负责执行，界面只负责展示，调平衡只改这个文件。

// ---- 分数段（段位）----
//
// 阈值不是拍脑袋定的：每个模式跑 20 局「完美瞄准机器人」（1/120 真实步长），取分位数。
//
// 关键前提：机器人 ≠ 人类。机器人每帧算最优相位、零反应延迟，人类达不到。
// 所以分位映射必须整体左移一档，否则 SS 只有机器人能拿，人类永远够不到 ——
// 拿不到的顶级等于不存在，反而让玩家放弃追求：
//   C  ≈ 机器人 p10 以下   新手 / 失误局
//   B  ≈ p10              普通人类
//   A  ≈ p25              熟练人类
//   S  ≈ p50              人类高手
//   SS ≈ p75~p85          极少数
//
// 另一条约束：档间距不窄于总分的一成，否则一局里会连跨两档，跨档演出就不稀缺了。
//
// 颜色走「等级色阶」惯例（灰→绿→蓝→橙→白热），刻意避开球色里的紫，
// 也不和右侧 CHAIN LOAD 的红/黄警告撞（位置与语义都分离）。
export const TIERS = [
  // C 段刻意偏亮：深色底上太暗的灰读不出来，段位信号就失效了。
  { name: 'C', color: '#AEBED2', rgb: '174,190,210' },
  { name: 'B', color: '#7ED957', rgb: '126,217,87' },
  { name: 'A', color: '#5AC8FA', rgb: '90,200,250' },
  { name: 'S', color: '#FFB03A', rgb: '255,176,58' },
  { name: 'SS', color: '#FFF6D0', rgb: '255,246,208' },
];

/** 当前分数落在第几档（0=C … 4=SS） */
export function scoreBand(score, mode) {
  const t = mode.tiers;
  for (let i = t.length - 1; i > 0; i--) if (score >= t[i]) return i;
  return 0;
}

/**
 * 档内进度 + 下一档信息。
 * lo/hi 是当前档的分数区间；hi=null 表示已在最高档。
 * 返回的 p 用于画进度条；gap 用于「还差多少分」的文案。
 */
export function tierProgress(score, mode) {
  const i = scoreBand(score, mode);
  const t = mode.tiers;
  const lo = t[i];
  const hi = i + 1 < t.length ? t[i + 1] : null;
  return {
    i,
    tier: TIERS[i],
    lo,
    hi,
    p: hi === null ? 1 : Math.max(0, Math.min(1, (score - lo) / (hi - lo))),
    gap: hi === null ? 0 : Math.max(0, hi - score),
    next: hi === null ? null : TIERS[i + 1],
  };
}

export const MODES = [
  {
    id: 'standard',
    name: '标准双轮',
    en: 'STANDARD',
    blurb: '双炮并列 · 轮流发射',
    geo: { r: 4, c: 6, n: 28 },
    layout: 2,
    // 这一轮的段位线不再取"机器人的分位"，而是取**技能阶梯的中位数**：
    //   新手 p50≈9905   普通 12967   熟练 17485   高手 16738   完美 18939
    // 五档的爆仓率分别是 50% / 33% / 13% / 4% / 0%，末盘占用 28 / 19 / 15 / 14 / 6。
    // 也就是说：分越高的人，盘面越松、越不会崩——这条单调关系才是段位线该压的东西。
    // 取 B=普通、A=熟练、S=高手、SS=完美+一点运气，相邻档间距 ≥15%。
    tiers: [0, 12000, 15500, 18000, 21000],
    cfg: {
      stages: [[0, 1], [20, 2]],
      // beat = 两颗球之间的间隔（轮流制）。
      //   beatStart —— 起手。单颗球要玩家完整做一次决策（看色 → 转盘 → 等飞行）。
      //   beatEnd   —— 时间地板终点。打得再差，55 秒后也到这个速度。
      //   beatRush  —— 分数曲线终点 = 满速。1.02s 一颗，比上一版的固定 1.45s 快 42%。
      // tempoRef 不写死，构造时取 tiers[3]（S 线）——见 sim.js 的 Game 构造函数。
      beatStart: 2.20, beatEnd: 1.55, beatRush: 1.02, rampSec: 55, levelTime: 90,
      tempoRef: 11000,
      startBeads: 8,
      // 三色起手，38 秒后上第四色。**注释和代码曾经对不上**：这里原文写
      // "前 38 秒三色"，而 colorSteps 是 [[0,4]]——四色从第一秒就开了。
      // 这一轮把它改成真的三色起手：开局盘面只有 3 色，玩家的第一课是
      // "转对位置"，而不是"在四个色相里找一对"。
      // 难度仍由节奏 + 锈球承担，不靠堆颜色（多一个色相在色弱眼里等于没变）。
      colorSteps: [[0, 3], [38, 4]],
      vMax: 13, drift: 1.35, accel: 55,
      specialStart: 15, wildRate: 0.030, bombRate: 0,
      rustStart: 24, rustEvery: 8,
    },
  },
  {
    id: 'mini',
    name: '小轮练习',
    en: 'MINI',
    blurb: '单射口 · 20 格短局',
    geo: { r: 3, c: 4.5, n: 20 },
    layout: 1,
    // 技能阶梯 p50：新手 6367 / 普通 8721 / 熟练 9283 / 高手 9631 / 完美 10231。
    // 20 格短局的分数收敛得厉害（新手到完美只差 1.6 倍），所以档间距只能是 15% 左右，
    // 再宽就会把 SS 推出分布之外。爆仓率 21% / 13% / 4% / 8% / 0%。
    tiers: [0, 6800, 8200, 9400, 10800],
    cfg: {
      stages: [[0, 1]],
      // 20 格 + 60 秒的短局：满速给到 1.12 而不是 1.02。一周只有 20 个槽位，
      // 满速下每 1.12 秒落一颗，20 格只能容错 7 次——再快就变成纯运气局。
      beatStart: 2.50, beatEnd: 1.70, beatRush: 1.12, rampSec: 40, levelTime: 60,
      tempoRef: 4200,
      startBeads: 5,
      // 20 格的小盘只给三色：四色在这么短的链条上等于每两拍就卡死一次。
      colorSteps: [[0, 3], [14, 4]],
      vMax: 11, drift: 1.20, accel: 50,
      // 短局给得更保守：60 秒里塞 4 颗锈球就够，再多会盖过"练习"的定位。
      specialStart: 12, wildRate: 0.034, bombRate: 0,
      rustStart: 24, rustEvery: 11,
    },
  },
  {
    id: 'grand',
    name: '大轮长跑',
    en: 'GRAND',
    blurb: '40 格 · 双炮轮流',
    geo: { r: 5.5, c: 9, n: 40 },
    layout: 2,
    // 技能阶梯 p50：新手 12197 / 普通 14131 / 熟练 20366 / 高手 22837 / 完美 29686。
    // 120 秒长局是四个模式里**技能区分度最大**的一个（新手→完美 2.4 倍），
    // 因为盘面大、雪球滚得久。爆仓率 58% / 50% / 17% / 8% / 0%——
    // 新手局里超过一半根本活不到 120 秒，这也是它档间距能拉到 20% 以上的原因。
    tiers: [0, 14000, 19000, 23000, 28000],
    cfg: {
      stages: [[0, 1], [25, 2]],
      // 120 秒长局：地板爬得更慢（70s），但满速可以更狠——40 格给了容错空间。
      beatStart: 2.45, beatEnd: 1.60, beatRush: 1.05, rampSec: 70, levelTime: 120,
      tempoRef: 14000,
      startBeads: 12,
      colorSteps: [[0, 4]],
      vMax: 15.4, drift: 1.50, accel: 60,
      // 40 格大盘最耐得住脏，锈球可以密一点，正好用掉它的空间优势。
      specialStart: 18, wildRate: 0.030, bombRate: 0,
      rustStart: 26, rustEvery: 7,
    },
  },
  {
    id: 'triple',
    name: '三射口',
    en: 'TRIPLE',
    blurb: '三分环 · 三炮轮转',
    geo: { r: 4.6, c: 6.5, n: 30 },
    layout: 3,
    // 技能阶梯 p50：新手 11118 / 普通 13449 / 熟练 12456 / 高手 17550 / 完美 17689。
    // 三射口是唯一一个"熟练"打不过"普通"的模式（12456 < 13449）——
    // 三个落点在环上转一圈，玩家每颗都要换位，中等水平的换位反而更容易乱。
    // 25 局的样本还不足以断言这是真效应还是噪声，先记在这里，留下一轮复查。
    tiers: [0, 12000, 14000, 16000, 19000],
    cfg: {
      stages: [[0, 1], [12, 2], [30, 3]],
      // 三个口轮流，一轮 3 颗球，beat 仍然是"颗间隔"。
      // 起手本来就近（2.05），所以地板爬得快（50s）、满速也不肯再低（1.02）：
      // 三口的落点在环上转一圈，玩家每颗都要换位，这已经是最忙的模式。
      beatStart: 2.05, beatEnd: 1.55, beatRush: 1.02, rampSec: 50, levelTime: 75,
      tempoRef: 7000,
      startBeads: 12,
      colorSteps: [[0, 3], [24, 4]],
      vMax: 12, drift: 1.30, accel: 50,
      // 三个落点不再"轮休"：每颗球都真的从某一个口出，只是不齐射。
      // 3 口交替意味着连续三发的落点在环上转一圈，玩家要连续换三次位。
      specialStart: 14, wildRate: 0.032, bombRate: 0,
      rustStart: 24, rustEvery: 9,
    },
  },
];

export const MODE_IDS = MODES.map((m) => m.id);

export function getMode(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

export function modeIndex(id) {
  const i = MODES.findIndex((m) => m.id === id);
  return i < 0 ? 0 : i;
}
