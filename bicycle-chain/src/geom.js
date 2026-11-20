// 跑道几何：支持四种拓扑。
//
//   椭圆（oval）      双等径轮 + 两条直道。第一至第六个模式都用它。
//   8 字交叉          Gerono 双纽线：一条闭合链在中心交叉两次。
//   大小轮           一大一小两个皮带轮，外侧公切线 + 两段圆弧。
//   三轮三角          三个等径轮，外侧公切线组成一个圆角三角形。
//
// 坐标系：原点在机器中心，x 向右，y 向下（屏幕系）。
// 弧长 s 从每条拓扑的起点顺时针起算。
//
// 为什么后三种用**折线采样器**而不是解析式：
//   8 字和三角链的弧长积分没有初等闭式，硬写公式会在"槽位等距"上出错；
//   采样器只需要一条参数曲线，之后所有 pointAt / tangent / normal 都按
//   累计弧长查表。代价是一次性 2400 点采样，收益是三种拓扑共用一套查询。
//
// live binding 仍然成立：configure() 改的是 export let，其它模块 import
// 进来后读到的就是新值。约束：同一时刻只允许一个 Game 实例。

export let C = 6;          // 椭圆：半中心距；大小轮：两轮中心距的一半
export let R = 4;          // 椭圆半径 / 大轮半径 / 三角轮半径
export let L = 4 * C + 2 * Math.PI * R;
export let N = 28;
export let D = L / N;

export let RULE = 'oval';  // 'oval' | 'figure8' | 'uneven' | 'tri'
export let BOUND = { x: C + R, y: R };
export let PULLEYS = [];   // [{ x, y, r }] —— 渲染层画齿轮、中心轴用
export let NOZZLE_SLOTS = null;  // 拓扑自带的射口槽位；null = 用椭圆那套
export let NOZZLE_ANCHOR = null; // 8 字交叉口的专用炮口锚点
export let CROSS_SLOTS = [];     // 8 字两个交叉口的弧长槽位（渲染层用来区分上下层）

let SAMPLER = null;

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 一组有序点 → 弧长采样器。
 * 点按顺序首尾相连，不要求最后一点重复第一点。
 */
function makeSampler(points) {
  // 去掉连续重复点：线段与圆弧拼接处会各给一次端点，
  // 留着会产生零长度段，采样时切向会抖成 0。
  const pts = [];
  for (const p of points) {
    if (!pts.length || dist(pts[pts.length - 1], p) > 1e-9) pts.push(p);
  }
  if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-9) pts.pop();

  const cum = [0];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    total += dist(pts[i], pts[(i + 1) % pts.length]);
    cum.push(total);
  }
  return { pts, cum, total };
}

function sampleAt(S, s) {
  s = ((s % S.total) + S.total) % S.total;

  let lo = 0, hi = S.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (S.cum[mid] <= s) lo = mid; else hi = mid - 1;
  }
  const i = lo;
  const seg = S.cum[i + 1] - S.cum[i];
  const u = seg > 1e-9 ? (s - S.cum[i]) / seg : 0;
  const a = S.pts[i];
  const b = S.pts[(i + 1) % S.pts.length];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, i, u };
}

function sampleTangent(S, s) {
  // 用相邻两点求切向；不解析求导，避免每条拓扑各写一套导数。
  const eps = S.total * 0.0008;
  const a = sampleAt(S, s - eps);
  const b = sampleAt(S, s + eps);
  const dx = b.x - a.x, dy = b.y - a.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/** 顺时针闭合路径的外法向 = 切向顺时针转 90°。 */
function outwardNormal(tan) {
  return { x: tan.y, y: -tan.x };
}

function computeBounds(S) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of S.pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x: (x1 - x0) / 2, y: (y1 - y0) / 2, x0, x1, y0, y1 };
}

function pushLine(out, a, b, n = 18) {
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
}

function pushArc(out, cx, cy, r, a0, a1, n = 36) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
}

/**
 * 大小轮皮带：两个圆的外公切线 + 两段外圆弧。
 *
 * 切线点角度 α = acos((R1-R2)/d)。等径时 α=90°，退化成上下两条水平切线；
 * 大轮半径更大时 α<90°，上切线向右下倾斜——这正是"一大一小"的视觉来源。
 * 线速度恒定、角速度 ∝ 1/r，所以小轮在画面里转得更快。
 */
function buildUneven(r1, r2, c) {
  const d = 2 * c;
  const h = Math.max(-1, Math.min(1, (r1 - r2) / d));
  const alpha = Math.acos(h);

  // 把整个形状在 x 方向居中：大轮向左伸得更远，所以整体要**右移** dx。
  // 第一版写成 -dx，整条皮带在画面里偏左 2.5 个世界单位（约 68px），
  // 左炮口几乎贴到左侧 HUD。
  const dx = (r1 - r2) / 2;
  const cxL = -c + dx;
  const cxR = c + dx;

  const large = (a) => ({ x: cxL + Math.cos(a) * r1, y: Math.sin(a) * r1 });
  const small = (a) => ({ x: cxR + Math.cos(a) * r2, y: Math.sin(a) * r2 });

  // 屏幕坐标 y 向下：-alpha 才是"画面里的上切线"，+alpha 是下切线。
  const topL = large(-alpha), topS = small(-alpha);
  const botL = large(alpha), botS = small(alpha);
  const tanLen = dist(topL, topS);
  const smallArc = r2 * 2 * alpha;
  const largeArc = r1 * (TAU - 2 * alpha);

  const pts = [];
  pushLine(pts, botL, botS, 20);
  pushArc(pts, cxR, 0, r2, alpha, -alpha, 40);
  pushLine(pts, topS, topL, 20);
  pushArc(pts, cxL, 0, r1, -alpha, alpha - TAU, 64);

  // 上面这条路径是逆时针的；反转让外法向重新指向环外。
  // 不反转的话，炮口会被算到皮带**里面**，大轮左炮会压在自己的齿轮上。
  pts.reverse();

  const S = makeSampler(pts);
  const slotOf = (s) => Math.round((s / S.total) * N) % N;
  const nearestSlot = (pt) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < S.pts.length; i++) {
      const d = dist(S.pts[i], pt);
      if (d < bd) { bd = d; best = i; }
    }
    return slotOf(S.cum[best]);
  };
  const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

  RULE = 'uneven';
  SAMPLER = S;
  BOUND = computeBounds(S);
  PULLEYS = [
    { x: cxL, y: 0, r: r1 },
    { x: cxR, y: 0, r: r2 },
  ];
  // 一个炮口在大轮上方的切线（偏大盘端），一个在小轮下方的切线（偏小盘端）。
  // 试过两轮外侧弧中点：炮口会退到画面最左/最右，压住左右 HUD；
  // 也试过两条切线正中：两个炮口挤在机器中央，读不出"这一发来自哪个轮"。
  NOZZLE_SLOTS = [
    nearestSlot(lerp(topL, topS, 0.18)),   // 大盘上方
    nearestSlot(lerp(botL, botS, 0.82)),   // 小盘下方
  ];
  NOZZLE_ANCHOR = null;
  return largeArc; // 仅用于调试时确认公式被调用
}

/**
 * 三轮三角：三个等径轮的外侧公切线组成一个圆角三角形。
 *
 * 三角形顶点按 上 → 右下 → 左下 排列，路径顺时针。
 * 每条边是一条与边平行、向外偏移 r 的直线；每个顶点是一段 120° 外圆弧。
 */
function buildTri(r, c) {
  const h = c * Math.sqrt(3) / 2;
  // 顶点整体下移 c/4，使**包围盒**以原点为中心（三角形重心仍在 (0,c/4)）。
  const P = [
    { x: 0, y: -3 * c / 4 },
    { x: h, y: 3 * c / 4 },
    { x: -h, y: 3 * c / 4 },
  ];

  const edges = [];
  for (let i = 0; i < 3; i++) {
    const a = P[i], b = P[(i + 1) % 3];
    const dx = b.x - a.x, dy = b.y - a.y;
    const m = Math.hypot(dx, dy) || 1;
    const ux = dx / m, uy = dy / m;
    // 顺时针路径的外法向（向右转 90°）
    const nx = uy, ny = -ux;
    edges.push({
      a, b, ux, uy, nx, ny,
      start: { x: a.x + nx * r, y: a.y + ny * r },
      end: { x: b.x + nx * r, y: b.y + ny * r },
      len: m,
    });
  }

  const pts = [];
  for (let i = 0; i < 3; i++) {
    const e = edges[i];
    pushLine(pts, e.start, e.end, 20);

    // 到达顶点 b 之后，沿外圆弧转到下一条边的起点。
    const e2 = edges[(i + 1) % 3];
    const a0 = Math.atan2(e.ny, e.nx);
    const a1 = Math.atan2(e2.ny, e2.nx);
    let delta = ((a1 - a0) % TAU + TAU) % TAU;
    if (delta > Math.PI) delta -= TAU;
    pushArc(pts, e.b.x, e.b.y, r, a0, a0 + delta, 36);
  }

  const S = makeSampler(pts);
  const slotOf = (s) => Math.round((s / S.total) * N) % N;
  const arcLen = r * (TAU / 3);
  const sideLen = edges[0].len;

  RULE = 'tri';
  SAMPLER = S;
  BOUND = computeBounds(S);
  PULLEYS = P.map((p) => ({ x: p.x, y: p.y, r }));
  // 射口全部放在**上半圈**：顶弧中点 + 左上边中点 + 右上边中点。
  // 底边的中点也试过，但三角链比椭圆高，底部炮口会压到下面的连消控制台；
  // 而"三轮"的视觉记忆点在三个齿轮，不在"三个边都必须有炮"。
  const topArcMid = sideLen * 3 + arcLen * 2 + arcLen * 0.5;
  const rightEdgeMid = sideLen * 0.5;
  const leftEdgeMid = sideLen * 2 + arcLen * 2 + sideLen * 0.5;
  NOZZLE_SLOTS = [
    slotOf(topArcMid),
    slotOf(rightEdgeMid),
    slotOf(leftEdgeMid),
  ];
  NOZZLE_ANCHOR = null;
}

/**
 * 8 字交叉：Gerono 双纽线
 *
 *   x = a cos t
 *   y = (b/2) sin 2t
 *
 * 在 (0,0) 处交叉两次（t=π/2 与 3π/2）。炮口固定在交叉口正上方，
 * 两个交叉槽位里只有 nozzleOff 指定的那一个会被命中——另一条是干扰线。
 */
function buildFigure8(r, c) {
  const a = c + r;       // 横向半宽
  const b = 2 * r;       // 纵向全高 → ±r

  const pts = [];
  const steps = 2400;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    pts.push({
      x: a * Math.cos(t),
      y: (b / 2) * Math.sin(2 * t),
    });
  }

  // 找离原点最近的采样点（t=π/2 或 3π/2），并把**它**旋成弧长 0。
  // 这样槽位 0 就精确落在交叉口，炮口锚点 (0,0) 与落点槽完全重合；
  // 不旋转的话，最近的整数槽会和交叉点差 0.5~1 格，球落在交叉口、
  // 珠子却插在斜边上——玩家会看到"球落空了"。
  let crossI = 0, crossD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x, pts[i].y);
    if (d < crossD - 1e-9) { crossD = d; crossI = i; }
  }
  const rotated = pts.slice(crossI).concat(pts.slice(0, crossI));
  const S = makeSampler(rotated);
  const bounds = computeBounds(S);

  // 两个交叉口的槽位：渲染层需要知道"另一条支线什么时候也在交叉口"，
  // 才能把它压暗成下层，避免两颗珠子在同一像素上打架。
  const crossSlots = [];
  for (let i = 0; i < S.pts.length; i++) {
    if (Math.hypot(S.pts[i].x, S.pts[i].y) >= 0.25) continue;
    const slot = Math.round((S.cum[i] / S.total) * N) % N;
    if (!crossSlots.some((c) => Math.min(Math.abs(c - slot), N - Math.abs(c - slot)) < 2)) {
      crossSlots.push(slot);
    }
  }
  crossSlots.sort((a, b) => a - b);

  RULE = 'figure8';
  SAMPLER = S;
  BOUND = { x: bounds.x, y: bounds.y, x0: bounds.x0, x1: bounds.x1, y0: bounds.y0, y1: bounds.y1 };
  PULLEYS = [];
  NOZZLE_SLOTS = [0];
  CROSS_SLOTS = crossSlots.length >= 2 ? crossSlots : [0, Math.round(N / 2)];
  // 炮口在交叉口正上方，垂直向下。法向朝上（-y），炮身局部 +Y 指向跑道。
  NOZZLE_ANCHOR = { x: 0, y: 0, nx: 0, ny: -1 };
}

/**
 * 重设几何。rule 决定用哪条拓扑；其余参数按拓扑解释：
 *   oval     r = 半径，c = 半中心距
 *   uneven   r = 大轮半径，r2 = 小轮半径，c = 两轮中心距的一半
 *   tri      r = 三轮半径，c = 外接圆半径
 *   figure8  r = 纵向半高，c = 横向半宽 - r（即 a = c + r）
 */
export function configure({
  r = 4, c = 6, n = 28, rule = 'oval', r2 = null,
} = {}) {
  R = r;
  C = c;
  N = n;
  CROSS_SLOTS = [];

  if (rule === 'uneven') {
    buildUneven(r, r2 ?? r * 0.5, c);
  } else if (rule === 'tri') {
    buildTri(r, c);
  } else if (rule === 'figure8') {
    buildFigure8(r, c);
  } else {
    RULE = 'oval';
    SAMPLER = null;
    L = 4 * C + 2 * Math.PI * R;
    D = L / N;
    BOUND = { x: C + R, y: R };
    PULLEYS = [
      { x: -C, y: 0, r: R },
      { x: C, y: 0, r: R },
    ];
    NOZZLE_SLOTS = null;
    NOZZLE_ANCHOR = null;
    return { R, C, L, N, D, rule: RULE };
  }

  L = SAMPLER.total;
  D = L / N;
  return { R, C, L, N, D, rule: RULE };
}

export function geometry() {
  return { R, C, L, N, D, rule: RULE, bound: BOUND, pulleys: PULLEYS };
}

/** 弧长 s → 世界坐标 */
export function pointAt(s) {
  if (SAMPLER) return sampleAt(SAMPLER, s);

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
  if (SAMPLER) return sampleTangent(SAMPLER, s);

  const eps = 0.01;
  const a = pointAt(s - eps);
  const b = pointAt(s + eps);
  const dx = b.x - a.x, dy = b.y - a.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/**
 * 弧长 s → 指向环外的单位法向。
 * 采样器拓扑直接用"切向右转 90°"；椭圆仍用位矢判方向。
 */
export function normalAt(s) {
  if (SAMPLER) return outwardNormal(sampleTangent(SAMPLER, s));

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
