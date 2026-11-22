// 共用机器人：无头测试（test.mjs）、节奏诊断（_pacing.mjs）与浏览器快进共用同一套操作逻辑，
// 这样"截图里的分数"和"平衡测试里的分数"才是同一件事。
//
// 三种"玩家"：
//   oracle  —— botInput()，每帧穷举全环 + 零延迟。分数上限，也是段位线的标尺。
//   human   —— makeHuman()，感知预算有限。用来测"多快会崩"，
//              这是风险曲线唯一诚实的量具：oracle 永远不会死，所以它对风险免疫。
//   rand    —— 随机按，下限探针。

import { CFG, PALETTE, WILD, BOMB } from './sim.js';
import { isPip, pipOf, evalPlacement } from './dice.js';
import { N, mod } from './geom.js';

/** 一个槽位对某色的收益：贴边 30、隔一 12、夹心 80、同色叠 15 */
function evalColor(at, k, ci) {
  const l1 = at(k - 1), r1 = at(k + 1), l2 = at(k - 2), r2 = at(k + 2);
  let sc = 0;
  if (l1 && l1.ci === ci) sc += 30;
  if (r1 && r1.ci === ci) sc += 30;
  if (l2 && l2.ci === ci) sc += 12;
  if (r2 && r2.ci === ci) sc += 12;
  if (l1 && r1 && l1.ci === ci && r1.ci === ci) sc += 80;
  const c = at(k);
  if (c === null) sc += 4;
  else if (c.ci === ci) sc += 15;
  return sc;
}

/**
 * 一个槽位对某颗待发球的收益。
 * 特殊球没有颜色，必须有自己的评估函数——否则机器人会把万能球当"无色的球"
 * 随便丢，把炸弹丢到空跑道上，然后测试跑出来的分数就不是"玩家能打的分数"。
 *
 * `rules` 决定用哪套语言：基础模式算"同色相邻"，骰子模式算"牌型能接多长"。
 * 两套评分不需要互相可比——它们各自只在自己的模式里排序。
 */
export function evalSlot(at, k, ci, rules = 'color') {
  if (rules === 'dice') {
    if (isPip(ci)) return evalPlacement(at, N, k, ci, at(k) !== null);
    if (ci === WILD) {
      let best = -1e9;
      for (let pip = 0; pip < 6; pip++) {
        best = Math.max(best, evalPlacement(at, N, k, pip, at(k) !== null));
      }
      // 打九折：金骰落地才定型，比手里就攥着的真点数弱一点
      return best * 0.9;
    }
    if (ci === BOMB) {
      let n = 0;
      for (let i = -2; i <= 2; i++) if (at(k + i)) n++;
      return n * 26;
    }
    return -80;   // 铅骰：谁都不想要，但要让它"有地方可去"，不能是 -inf
  }

  if (ci === BOMB) {
    let n = 0;
    for (let i = -2; i <= 2; i++) if (at(k + i)) n++;
    return n * 26;
  }
  if (ci === WILD) {
    let best = -1e9;
    for (let c = 0; c < PALETTE.length; c++) best = Math.max(best, evalColor(at, k, c));
    // 打九折：万能球落地才定型，比手里就攥着的真彩球弱一点
    return best * 0.9;
  }
  return evalColor(at, k, ci);
}

/** 空中那颗球（没有就返回 null）。瞄准目标必须用它，不能用 nextVolley()。 */
function flyingBall(game) {
  return game.balls[0] || null;
}

/**
 * 朝目标相位转。控制律只有这一份，oracle 和人类模型共用——
 * 否则两边的手感会悄悄分叉，量出来的差异就分不清是"瞄准水平"还是"控制器不同"。
 *
 * 用滑行预测校正当前速度，使松开转向后接近目标相位。
 */
function steer(game, targetPhase) {
  const flying = flyingBall(game);
  // 截止时刻：有球在飞时，真正的截止是「它落地」，不是「下一次发射」。
  // 用 game.flightDur 而不是 CFG.nozzleGap / CFG.flightSpeed：飞行时长现在
  // 随节奏变化，用固定值会让机器人在满速时系统性地算偏（它以为还有 1.31s，
  // 实际只有 0.88s）。
  //
  // 下限 0.06 而不是 0.30：落地前最后 60ms 仍然值得转向（还能挪 0.8 格），
  // 而 0.30 的下限会让它在最后一段按"还有 0.3 秒"去解，反而转过头。
  const T = flying
    ? Math.max(0.06, game.flightLeft())
    : Math.max(0.30, game.nextFireIn() + game.flightDur);

  let gap = targetPhase - game.phase;
  while (gap > N / 2) gap -= N;
  while (gap < -N / 2) gap += N;

  const error = gap - game.coastDistance(T);
  const tolerance = 0.45 * -Math.expm1(-CFG.dampK * T) / CFG.dampK;
  if (error > tolerance) return 1;
  if (error < -tolerance) return -1;
  return 0;
}

/**
 * 一个落点值多少（含主动槽）。oracle 与人类模型共用这一份，
 * 否则两边会悄悄对"镀金槽到底值不值得打"给出不同答案。
 *
 * 槽位加分是**故意做得很直白**的：镀金 +55、翻面 +40。
 * 这两个数不参与平衡，只影响机器人优先选哪个落点；
 * 把它们写成 0 的话，机器人会永远绕开槽位，测出来的段位线就会
 * 系统性低估"会用槽的玩家"能打到多少分。
 */
/** 最近一次决策的目标相位（诊断用：快进截图/无头测试可以读它看"它想去哪"）。 */
export let lastAim = 0;
let aimQ = 0;
let aimShot = -1;
// 出球前"往哪边转"的滞回方向：见 botInput 里没球在飞的分支。
let chargeDir = 1;

function scoreSlot(game, at, k, ci) {
  let sc = evalSlot(at, k, ci, game.rules);
  const pad = game.padAt ? game.padAt(k) : null;
  if (!pad) return sc;
  if (isPip(ci)) sc += pad.kind === 'x2' ? 55 : 40;
  return sc;
}

/**
 * 返回本帧应该按住的转向：1 / 0 / -1
 *
 * 瞄的是**这一颗**，不是"下一发"。volleyIndex 在 fire() 里先取后进，球一出膛
 * nextVolley() 就已经指向下一颗；飞行期间照着 nextVolley 去转，等于
 * "看着 A 球、为 B 球调整落点"。上一版是靠"飞行期间完全不转向"绕开这个坑的，
 * 代价是满速下几乎没有瞄准窗口——那正是这一轮要修的仪器缺陷。
 */
export function botInput(game) {
  const at = (j) => game.slots[mod(j, N)];
  const flying = flyingBall(game);

  // ---- 目标锁定 ----
  //
  // 一开始是每帧重算目标，结果机器人整场只有 38% 落在自己想去的地方。
  // 原因不是控制律，是**目标在飞行途中漂移**：可达窗口 reach 随剩余时间收缩，
  // 越接近落地，远处的目标越容易被判成"够不到"，于是它临阵改打附近的次优落点，
  // 最终落在两个目标之间。人类不会这样——人一旦把球瞄向某个缝，就不会在最后
  // 0.1 秒改主意，因为改也来不及。
  //
  // 所以这里显式建模"承诺"：一颗球只决策一次（开火那一帧），之后只跟踪。
  // 这让机器人更像一个高水平玩家，而不是一个每帧都反悔的优化器。
  if (!flying) {
    aimShot = -1;
  } else if (game.shots !== aimShot) {
    aimShot = game.shots;
  } else {
    lastAim = aimQ;
    return steer(game, aimQ);
  }

  const colors = flying ? [flying.ci] : game.nextVolley().map((i) => game.queues[i][0]);
  const offs = flying ? [flying.off] : game.nextVolley().map((i) => game.nozzleOff[i]);

  const T = flying
    ? Math.max(0.10, game.flightLeft())
    // 没球在飞时，截止时间是"再转多久出球 + 飞行"。转距驱动之后，
    // 出球时刻由玩家的转速决定，用 beat 倒计时会系统性算错提前量。
    : Math.max(0.30, game.nextFireIn() + game.flightDur);
  const reach = Math.min(N / 2, CFG.vMax * T * 0.94 + 0.6);

  let bestPhase = 0, bestSc = -1e9;
  for (let q = 0; q < N; q++) {
    let gap = q - game.phase;
    while (gap > N / 2) gap -= N;
    while (gap < -N / 2) gap += N;
    let sc = 0;
    for (let k = 0; k < offs.length; k++) {
      sc += scoreSlot(game, at, mod(-q + offs[k], N), colors[k]);
    }
    // 够不到的目标不是"差一点"，是"这一发废了"：压到最低但保留一点点分数，
    // 让它在全盘都够不到时仍有一个确定的最近目标可回退。
    if (Math.abs(gap) > reach) sc -= 10000;
    if (sc > bestSc) { bestSc = sc; bestPhase = q; }
  }
  aimQ = bestPhase;
  lastAim = bestPhase;

  // ---- 没有球在飞：先负责"把球转出来" ----
  //
  // 转动驱动之后，出球不再是时间到了就发生的：不转，就永远没有下一颗。
  // 之前这里直接返回 steer()，而 steer 在"目标就在眼前"时会返回 0——
  // 机器人于是停在原地，整局只出了 1 颗球（诊断脚本实测）。
  //
  if (!flying) {
    let gap = bestPhase - game.phase;
    while (gap > N / 2) gap -= N;
    while (gap < -N / 2) gap += N;
    if (gap > 0.8) chargeDir = 1;
    else if (gap < -0.8) chargeDir = -1;
    return chargeDir;
  }
  return steer(game, bestPhase);
}

/**
 * 人类模型：**感知预算是有限的**。
 *
 * 前面试过两版人类模型，都不成立：
 *   1. 决策延迟（每 0.22 秒重算一次）——没用。落点在整个飞行期间都可以改，
 *      迟一拍重算只是"晚一点开始转"，照样能转到最优槽。
 *   2. 瞄准偏移（±1~2 格，贯穿飞行）——也没用。偏移在飞行期间会被控制律自己修正回来。
 *
 * 根因是：**这个游戏的瞄准是连续的、可达的**。vMax 13 格/秒 × 一拍 1~2 秒
 * 远大于半个环，所以"想去哪就能去哪"永远成立。限制玩家的不是手，是**看**。
 *
 * 所以真正该建模的是视觉搜索预算：一颗球只分到**一拍**的注意力，
 * 扫一个候选槽大约 scan 秒，于是一拍里能评估的候选数 = beat / scan。
 * 起手 2.2 秒能扫完整个环，满速 1.02 秒只够扫 11 个槽——
 * 玩家开始"就近将就"，把球落在次优位置，然后盘面慢慢堵住。
 *
 * 这条约束会**随节奏自动收紧**，不需要额外接一根线，这正是它可信的原因：
 * 节奏越快 → 能看的候选越少 → 落点越差 → 越容易崩。
 */
export function makeHuman(seed, { lag = 0.28, scan = 0.09 } = {}) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let t = 0, next = 0, held = 0;
  return (game, dt = 1 / 120) => {
    t += dt;
    if (t >= next) {
      next = t + lag;
      // 这一拍能看几个候选：从当前相位向外扫，先看近的（人的自然顺序）
      const budget = Math.max(3, Math.min(N, Math.round(game.beat / scan)));
      const at = (j) => game.slots[mod(j, N)];
      const flying = flyingBall(game);
      const idx = game.nextVolley()[0];
      const ci = flying ? flying.ci : game.queues[idx][0];
      const off = flying ? flying.off : game.nozzleOff[idx];

      // 扫描顺序：以"现在不用转"的位置为中心，向两侧交替展开。
      // k0 必须取整：phase 是浮点（连续转盘），拿它直接去查 slots 会越界成 undefined。
      const k0 = Math.round(mod(game.phase, N)) % N;
      let best = -1e9, bestQ = game.phase;
      for (let i = 0; i < budget; i++) {
        const d = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
        const q = mod(k0 + d, N);
        const sc = scoreSlot(game, at, mod(-q + off, N), ci);
        if (sc > best) { best = sc; bestQ = q; }
      }
      // 手抖：1/8 的机会差一格。连续转向里人几乎无法精确停在某一格，
      // 但也不会偏两格——偏两格等于"完全打空"，那是新手。
      if (rnd() < 0.125) bestQ = mod(bestQ + (rnd() < 0.5 ? -1 : 1), N);
      held = steer(game, bestQ);
    }
    return held;
  };
}
