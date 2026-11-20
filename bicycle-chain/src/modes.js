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
    blurb: '双射口 · 相距半圈',
    geo: { r: 4, c: 6, n: 28 },
    layout: 2,
    // 机器人 20 局（1/120 真实步长）：p10≈3900 p25≈6500 p50≈7800 p75≈9600 p90≈10800
    tiers: [0, 4000, 6500, 8200, 10200],
    cfg: {
      stages: [[0, 1], [20, 2]],
      beatStart: 3.40, beatEnd: 2.05, rampSec: 90, levelTime: 90,
      startBeads: 8, colorSteps: [[0, 4], [45, 5]],
      vMax: 13, drift: 1.35, accel: 55,
      volley: 2, rotate: false,
    },
  },
  {
    id: 'mini',
    name: '小轮练习',
    en: 'MINI',
    blurb: '单射口 · 20 格短局',
    geo: { r: 3, c: 4.5, n: 20 },
    layout: 1,
    // 机器人 20 局（1/120 真实步长）：p10≈3400 p25≈3800 p50≈4300 p75≈5000 p90≈6200
    tiers: [0, 3400, 3850, 4400, 5200],
    cfg: {
      stages: [[0, 1]],
      beatStart: 2.50, beatEnd: 1.50, rampSec: 60, levelTime: 60,
      startBeads: 5, colorSteps: [[0, 3], [12, 4]],
      vMax: 11, drift: 1.20, accel: 50,
      volley: 1, rotate: false,
    },
  },
  {
    id: 'grand',
    name: '大轮长跑',
    en: 'GRAND',
    blurb: '40 格 · 双射口长局',
    geo: { r: 5.5, c: 9, n: 40 },
    layout: 2,
    // 机器人 20 局（1/120 真实步长）：p10≈7900 p25≈9000 p50≈9300 p75≈11000 p90≈13100
    tiers: [0, 7900, 9200, 10500, 12000],
    cfg: {
      stages: [[0, 1], [25, 2]],
      beatStart: 3.80, beatEnd: 2.20, rampSec: 120, levelTime: 120,
      startBeads: 12, colorSteps: [[0, 4], [60, 5]],
      vMax: 15.4, drift: 1.50, accel: 60,
      volley: 2, rotate: false,
    },
  },
  {
    id: 'triple',
    name: '三射口',
    en: 'TRIPLE',
    blurb: '三分环 · 轮转两发',
    geo: { r: 4.6, c: 6.5, n: 30 },
    layout: 3,
    // 机器人 20 局（1/120 真实步长）：p10≈4600 p25≈4900 p50≈5400 p75≈7300 p90≈8500
    tiers: [0, 4600, 5600, 6600, 8000],
    cfg: {
      stages: [[0, 1], [12, 2], [30, 3]],
      beatStart: 3.90, beatEnd: 2.60, rampSec: 75, levelTime: 75,
      startBeads: 12, colorSteps: [[0, 4]],
      vMax: 12, drift: 1.30, accel: 50,
      // 三个落点若每拍全开，每拍落 3 球而 30 格给不出 3 组三消——
      // 结构上必死。所以三射口本身「轮转两发」：每拍有且只有一个口休息，
      // 下一个节拍换一个口休息。三个落点仍然全部参与，压力却回到 2 球/拍。
      volley: 2, rotate: true,
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
