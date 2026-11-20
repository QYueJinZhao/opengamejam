// 跑道几何：双轮（两段直道 + 两个半圆）闭合环。
// 坐标系：原点在两轮中心连线的中点，x 向右，y 向下（屏幕系）。
// 弧长 s 从顶部直道中点 (0,-R) 起算，顺时针为正。
//
// 这里是**可配置**的：不同模式用不同轮径 / 槽数。
// 用 ES 模块的 live binding（export let）把常量暴露出去，
// 别的模块 import 进来后，只要本模块调 configure()，它们读到的就是新值。
// 约束：同一时刻只允许存在一个 Game 实例（本项目满足）。

export let C = 6;          // 两轮中心距的一半
export let R = 4;          // 轮半径
export let L = 4 * C + 2 * Math.PI * R;
export let N = 28;         // 槽位数
export let D = L / N;      // 槽距

/**
 * 重设几何。r=轮半径，c=半中心距，n=槽位数。
 * 槽距 D = L/N 由前两者推出，所以改 n 会改变每格的物理长度。
 */
export function configure({ r = 4, c = 6, n = 28 } = {}) {
  R = r;
  C = c;
  N = n;
  L = 4 * C + 2 * Math.PI * R;
  D = L / N;
  return { R, C, L, N, D };
}

export function geometry() {
  return { R, C, L, N, D };
}

const HALF_PI = Math.PI / 2;

/** 弧长 s → 世界坐标 */
export function pointAt(s) {
  s = s % L;
  if (s < 0) s += L;
  const PI_R = Math.PI * R;

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

/**
 * 弧长 s → 指向环外的单位法向。
 * 用「法向与位矢点乘」判方向：跑道是闭合凸形，质心在环内，
 * 所以与位矢同向的那一支一定是朝外的。任意位置都成立。
 */
export function normalAt(s) {
  const eps = 0.02;
  const a = pointAt(s - eps);
  const b = pointAt(s + eps);
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  const m = Math.hypot(nx, ny) || 1;
  nx /= m; ny /= m;
  const p = pointAt(s);
  if (nx * p.x + ny * p.y < 0) { nx = -nx; ny = -ny; }
  return { x: nx, y: ny };
}

/** 世界坐标 → 弧长（仅用于调试/命中辅助） */
export function slotToWorldS(slot, phase) {
  let p = (slot + phase) % N;
  if (p < 0) p += N;
  return p * D;
}

export const mod = (a, n) => ((a % n) + n) % n;
