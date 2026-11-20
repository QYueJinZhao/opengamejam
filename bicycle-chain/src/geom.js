// 跑道几何：双轮（两段直道 + 两个半圆）闭合环。
// 坐标系：原点在两轮中心连线的中点，x 向右，y 向下（屏幕系）。
// 弧长 s 从顶部直道中点 (0,-R) 起算，顺时针为正。

export const C = 6;          // 两轮中心距的一半
export const R = 4;          // 轮半径
export const L = 4 * C + 2 * Math.PI * R;   // 49.1327
export const N = 28;         // 槽位数
export const D = L / N;      // 1.7547 槽距

const HALF_PI = Math.PI / 2;
const PI_R = Math.PI * R;

/** 弧长 s → 世界坐标 */
export function pointAt(s) {
  s = s % L;
  if (s < 0) s += L;

  // 1) 顶部右半直道
  if (s < C) return { x: s, y: -R };
  s -= C;

  // 2) 右半圆：-90° → +90°
  if (s < PI_R) {
    const th = -HALF_PI + s / R;
    return { x: C + R * Math.cos(th), y: R * Math.sin(th) };
  }
  s -= PI_R;

  // 3) 底部直道（自右向左）
  if (s < 2 * C) return { x: C - s, y: R };
  s -= 2 * C;

  // 4) 左半圆：+90° → +270°
  if (s < PI_R) {
    const th = HALF_PI + s / R;
    return { x: -C + R * Math.cos(th), y: R * Math.sin(th) };
  }
  s -= PI_R;

  // 5) 顶部左半直道
  return { x: -C + s, y: -R };
}

/** 弧长 s → 切向单位向量（顺时针） */
export function tangentAt(s) {
  const eps = 0.01;
  const a = pointAt(s - eps);
  const b = pointAt(s + eps);
  const dx = b.x - a.x, dy = b.y - a.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/** 世界坐标 → 弧长（仅用于调试/命中辅助） */
export function slotToWorldS(slot, phase) {
  let p = (slot + phase) % N;
  if (p < 0) p += N;
  return p * D;
}

export const mod = (a, n) => ((a % n) + n) % n;
