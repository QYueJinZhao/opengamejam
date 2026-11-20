// 模式定义：几何 + 发球口 + 节奏 + 计分线，全部集中在这里。
// sim.js 只负责执行，界面只负责展示，调平衡只改这个文件。

export const MODES = [
  {
    id: 'standard',
    name: '标准双轮',
    en: 'STANDARD',
    blurb: '双射口 · 相距半圈',
    geo: { r: 4, c: 6, n: 28 },
    layout: 2,
    target: 5200,
    ranks: [2500, 4500, 6500, 9000],
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
    target: 3200,
    ranks: [1500, 2600, 3800, 5200],
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
    target: 9000,
    ranks: [4000, 6500, 9000, 12000],
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
    target: 4500,
    ranks: [2200, 3600, 5000, 6800],
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
