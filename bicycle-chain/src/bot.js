// 共用机器人：无头测试（test.mjs）与浏览器调试快进（?bot=1）用同一套操作逻辑，
// 这样"截图里的分数"和"平衡测试里的分数"才是同一件事。
//
// 它的打法是「预测落点 + 提前量」：算清楚松手后球会漂到哪，再决定往哪转。
// 这不是完美 AI，但足够当作平衡探针与视觉调试样本。

import { CFG } from './sim.js';
import { N, mod } from './geom.js';

/** 一个槽位对某色的收益：贴边 30、隔一 12、夹心 80、同色叠 15 */
export function evalSlot(at, k, ci) {
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

/** 返回本帧应该按住的转向：1 / 0 / -1 */
export function botInput(game) {
  const at = (j) => game.slots[mod(j, N)];
  const idxs = game.nextVolley();
  const colors = idxs.map((i) => game.queues[i][0]);
  const offs = idxs.map((i) => game.nozzleOff[i]);

  let bestPhase = 0, bestSc = -1e9;
  for (let q = 0; q < N; q++) {
    let sc = 0;
    for (let k = 0; k < idxs.length; k++) {
      sc += evalSlot(at, mod(-q + offs[k], N), colors[k]);
    }
    if (sc > bestSc) { bestSc = sc; bestPhase = q; }
  }

  // 截止时刻：有球在飞时，真正的截止是「它落地」，不是「下一拍发射」。
  // T 设下限 0.30：否则临近落地时增益 1/T 会发散，机器人每帧满速乱撞。
  const T = Math.max(0.30, game.balls.length
    ? CFG.flightTime - game.balls[0].t
    : (game.beat - game.beatClock) + CFG.flightTime);

  // 阻尼解析积分：v(t) = drift + (v-drift)e^{-kt}
  const k = CFG.dampK, drift = CFG.drift;
  const coast = drift * T + (game.v - drift) * (1 - Math.exp(-k * T)) / k;
  let err = bestPhase - (game.phase + coast);
  while (err > N / 2) err -= N;
  while (err < -N / 2) err += N;

  // 发射后收手：飞行期间不再改向，边飞边改会把自己的落点带偏。
  if (game.balls.length) return 0;

  const nv = Math.max(-CFG.vMax, Math.min(CFG.vMax, drift + err / T));
  if (nv > game.v + 0.45) return 1;
  if (nv < game.v - 0.45) return -1;
  return 0;
}
