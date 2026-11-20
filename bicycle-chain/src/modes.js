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
    blurb: '双炮并列 · 同向发射',
    geo: { r: 4, c: 6, n: 28 },
    layout: 2,
    // 机器人 40 局（去掉 ×2 槽后重测）：p10≈8932 p25≈11028 p50≈12093 p75≈13903 p85≈14899
    // 上一版是 [11300,12900,14600,18500]，这一次整体下移约 20%。
    // 下移的不是难度，是"白送的分数"——×2 槽每次命中直接翻倍，实测贡献了
    // 总分里很实在的一块，而玩家几乎无法主动规划（槽位是随机换的）。
    // 换成按分位重划之后，段位分布的形状和上一版一致：C≈p10 / B≈p25 /
    // A≈p50 / S≈p75 / SS≈p85，只是绝对数值跟着分数一起下来。
    tiers: [0, 10900, 12400, 15000, 19000],
    cfg: {
      stages: [[0, 1], [20, 2]],
      beatStart: 3.40, beatEnd: 2.05, rampSec: 90, levelTime: 90,
      startBeads: 8,
      // 只有 4 个基础色：前 38 秒三色（好上手），之后上第四色。
      // 难度改由节拍 + 锈球承担，而不是"再多一个颜色"——多一个色相在
      // 色弱玩家眼里等于没有变化，只会增加随机性。
      colorSteps: [[0, 4]],
      vMax: 13, drift: 1.35, accel: 55,
      volley: 2, rotate: false,
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
    // 机器人 40 局：p10≈3891 p25≈4287 p50≈4798 p75≈5970 p85≈6699
    tiers: [0, 4750, 5460, 5990, 6900],
    cfg: {
      stages: [[0, 1]],
      beatStart: 2.50, beatEnd: 1.50, rampSec: 60, levelTime: 60,
      startBeads: 5,
      // 20 格的小盘只给三色：四色在这么短的链条上等于每两拍就卡死一次。
      colorSteps: [[0, 3], [14, 4]],
      vMax: 11, drift: 1.20, accel: 50,
      volley: 1, rotate: false,
      // 短局给得更保守：60 秒里塞 4 颗锈球就够，再多会盖过"练习"的定位。
      specialStart: 12, wildRate: 0.034, bombRate: 0,
      rustStart: 24, rustEvery: 11,
    },
  },
  {
    id: 'grand',
    name: '大轮长跑',
    en: 'GRAND',
    blurb: '40 格 · 双炮长局',
    geo: { r: 5.5, c: 9, n: 40 },
    layout: 2,
    // 机器人 40 局：p10≈13156 p25≈14072 p50≈15278 p75≈18455 p85≈19841
    tiers: [0, 15800, 17700, 20400, 24100],
    cfg: {
      stages: [[0, 1], [25, 2]],
      beatStart: 3.80, beatEnd: 2.20, rampSec: 120, levelTime: 120,
      startBeads: 12,
      colorSteps: [[0, 4]],
      vMax: 15.4, drift: 1.50, accel: 60,
      volley: 2, rotate: false,
      // 40 格大盘最耐得住脏，锈球可以密一点，正好用掉它的空间优势。
      specialStart: 18, wildRate: 0.030, bombRate: 0,
      rustStart: 26, rustEvery: 7,
    },
  },
  {
    id: 'triple',
    name: '三射口',
    en: 'TRIPLE',
    blurb: '三分环 · 轮转两发',
    geo: { r: 4.6, c: 6.5, n: 30 },
    layout: 3,
    // 机器人 40 局：p10≈6046 p25≈6360 p50≈7238 p75≈8520 p85≈10081
    tiers: [0, 7050, 8400, 9750, 10800],
    cfg: {
      stages: [[0, 1], [12, 2], [30, 3]],
      beatStart: 3.90, beatEnd: 2.60, rampSec: 75, levelTime: 75,
      startBeads: 12,
      colorSteps: [[0, 3], [24, 4]],
      vMax: 12, drift: 1.30, accel: 50,
      // 三个落点若每拍全开，每拍落 3 球而 30 格给不出 3 组三消——
      // 结构上必死。所以三射口本身「轮转两发」：每拍有且只有一个口休息，
      // 下一个节拍换一个口休息。三个落点仍然全部参与，压力却回到 2 球/拍。
      volley: 2, rotate: true,
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
