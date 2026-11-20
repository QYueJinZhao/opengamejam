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
    // 机器人 40 局（轮流制 + 1.31s 飞行后重测）：
    //   p10≈6417 p25≈7503 p50≈9248 p75≈11158 p85≈12343，均值 9312，爆仓 4/40
    // 上一版 p25≈11028 / p50≈12093，这一版整体再降 25%：
    // 一半来自发球速率（齐射取消，90 秒里球从 58 颗降到 51 颗），
    // 一半来自"每次只能消一组"——两颗球同拍落地时能凑出 4~5 长的段，
    // 现在一颗一颗落，匹配长度基本锁在 3。
    // 段位线仍按 p25 / p50 / p75 / p85 取，SS 刻意抬到 p85 以上保持稀有。
    tiers: [0, 8200, 10200, 11600, 13400],
    cfg: {
      stages: [[0, 1], [20, 2]],
      // beat = 两颗球之间的间隔（轮流制）。上一版是"一拍两颗"，
      // 所以数值上约等于原来的一半：3.40/2 ≈ 1.70 → 这里取 2.20 起手，
      // 因为单颗球要玩家完整做一次决策（看色 → 转盘 → 等 1.31s 飞行）。
      beatStart: 2.20, beatEnd: 1.45, rampSec: 90, levelTime: 90,
      startBeads: 8,
      // 只有 4 个基础色：前 38 秒三色（好上手），之后上第四色。
      // 难度改由节拍 + 锈球承担，而不是"再多一个颜色"——多一个色相在
      // 色弱玩家眼里等于没有变化，只会增加随机性。
      colorSteps: [[0, 4]],
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
    // 机器人 40 局：p10≈3480 p25≈4158 p50≈5113 p75≈5961 p85≈6612，均值 5129。
    // 单口模式不受"轮流"影响，但飞行从 0.80s 拉到 1.20s，机器人的预判更准，
    // 均值涨了 18%。分位之间挤得很近（20 格短局，分数收敛），
    // 所以档间距压在 12~19% 而不是标准局的 15~21%。
    tiers: [0, 4600, 5700, 6300, 7000],
    cfg: {
      stages: [[0, 1]],
      // 单口模式本来就是一颗一颗出，beat 语义没变，只跟着飞行时长抬了下限：
      // 1.25s 飞行 → beat 不会低于 1.33，beatEnd 1.50 仍然有效。
      beatStart: 2.50, beatEnd: 1.55, rampSec: 60, levelTime: 60,
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
    // 机器人 40 局：p10≈9347 p25≈11554 p50≈12885 p75≈13831 p85≈14626，均值 12875。
    // 120 秒长局的分布比标准局窄得多：p50 → p75 只差 7.3%。硬撑"档间距一成"
    // 会把 S/SS 推出分布之外（等于这两档不存在），所以间距压到 8.5%，
    // SS 落在 p85 附近——代价是 grand 的 SS 比其他模式更容易摸到。
    tiers: [0, 11800, 12800, 13900, 15100],
    cfg: {
      stages: [[0, 1], [25, 2]],
      beatStart: 2.45, beatEnd: 1.50, rampSec: 120, levelTime: 120,
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
    // 机器人 40 局：p10≈4609 p25≈5543 p50≈7264 p75≈9294 p85≈9999，均值 7473。
    // 三口轮流之后，每颗球都单独占一个飞行窗口，机器人能逐颗精瞄，
    // 均值比齐射版高 15%——但爆仓也从 0/40 升到 3/40，
    // 因为齐射时"两颗一起落"偶尔能靠运气补上两组，轮流则必须每颗都对。
    tiers: [0, 6100, 8100, 9700, 10800],
    cfg: {
      stages: [[0, 1], [12, 2], [30, 3]],
      // 三个口轮流，所以一轮是 3 颗球。beat 是"颗间隔"，不是"轮间隔"——
      // 上一版每拍 2 球、2.6s 一拍，折算 1.3s/球，这里 1.35 基本持平。
      beatStart: 2.05, beatEnd: 1.50, rampSec: 75, levelTime: 75,
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
