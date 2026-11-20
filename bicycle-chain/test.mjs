// 无头平衡性探针：用三种「玩家」跑每个模式，输出存活率、得分、连击与技巧倍率。
// 用法：node test.mjs

import { Game, CFG } from './src/sim.js';
import { MODES, TIERS, scoreBand } from './src/modes.js';
import { botInput, evalSlot, makeHuman } from './src/bot.js';
import { N, mod } from './src/geom.js';

// 必须与 main.js 的 DT 一致。之前这里是 1/60，导致同一个种子在两种步长下
// 走出完全不同的轨迹（实测标准模式 seed19：1/60 得 6600，1/120 得 14469）——
// 这类"精确相位对准"的游戏对时序是混沌敏感的，测试步长和运行步长不同，
// 平衡数据就只是另一个游戏的数据。
const DT = 1 / 120;
const CYCLES = 12;

let checks = 0, failed = 0;
function check(cond, msg) {
  checks++;
  if (!cond) { failed++; console.log('  ✗ ' + msg); }
}

function randomInput(frame, seed) {
  if (frame % 12 !== 0) return 0;
  return [-1, 0, 1][(seed * 7 + frame / 12) % 3];
}

function runOne(modeId, seed, policy) {
  const g = new Game(seed, modeId);
  // +timeBonusCap：骰子模式的连消会续时，一局可以比 levelTime 长 20 多秒。
  // 不加上这一项，那些"活到最后"的局会因为循环提前结束而被算成"没死也没活"。
  const maxFrames = Math.ceil((CFG.levelTime + (CFG.timeBonusCap || 0)) / DT) + 240;
  for (let frame = 0; frame < maxFrames; frame++) {
    let held = 0;
    if (policy === 'aim') held = botInput(g);
    else if (policy === 'rand') held = randomInput(frame, seed);
    g.setInput(held);
    g.step(DT);
    g.drainEvents();
    if (g.dead) break;
    if (frame % 97 === 0) {
      for (const q of g.queues) check(q.length === 3, 'queue length drift');
      check(g.nextVolley().length >= 1, 'empty volley');
      check(g.occupied() <= N, 'occupied over N');
      check(Number.isFinite(g.phase) && g.phase >= 0 && g.phase < N, 'phase out of range');
      check(Number.isFinite(g.score) && g.score >= 0, 'score invalid');
    }
  }
  return g;
}

function batch(mode, policy) {
  let score = 0, over = 0, survive = 0, clears = 0, drops = 0;
  let maxCombo = 0, maxChain = 0, endOcc = 0;
  const bands = [0, 0, 0, 0, 0];
  for (let s = 0; s < CYCLES; s++) {
    const g = runOne(mode.id, 4000 + s * 31, policy);
    score += g.score;
    bands[scoreBand(g.score, mode)]++;
    if (g.deadReason === 'overflow') over++;
    if (g.deadReason === 'time') survive++;
    clears += g.clears;
    drops += g.drops;
    maxCombo += g.maxCombo;
    maxChain += g.maxChain;
    endOcc += g.occupied();
  }
  return {
    score: Math.round(score / CYCLES),
    over, survive, bands,
    clearRatio: clears / Math.max(1, drops),
    combo: (maxCombo / CYCLES).toFixed(1),
    chain: (maxChain / CYCLES).toFixed(1),
    occ: (endOcc / CYCLES).toFixed(1),
  };
}

// 技巧倍率：每次发球时刻，最优相位收益 / 平均相位收益。
// 轮流制下每发只有一颗球，所以另一个指标改成"可打点占比"——
// 这颗球在环上是否至少存在一个值得打的落点（收益 >= 60）。
// 太低说明这一发纯属随机，玩家没得选；太高说明球发得太"贴心"。
function skillGap(mode) {
  const g = new Game(777, mode.id);
  const at = (j) => g.slots[mod(j, N)];
  let bestSum = 0, avgSum = 0, samples = 0, playable = 0;
  for (let f = 0; f < Math.ceil(CFG.levelTime / DT); f++) {
    g.setInput(0);
    g.step(DT);
    for (const e of g.drainEvents()) {
      if (e.type !== 'fire') continue;
      let best = -1e9, sum = 0;
      for (let q = 0; q < N; q++) {
        let sc = 0;
        for (let k = 0; k < e.colors.length; k++) {
          sc += evalSlot(at, mod(-q + e.offs[k], N), e.colors[k], g.rules);
        }
        sum += sc;
        if (sc > best) best = sc;
      }
      bestSum += best;
      avgSum += sum / N;
      if (best >= 60) playable++;
      samples++;
    }
    if (g.dead) break;
  }
  return {
    ratio: bestSum / Math.max(1, avgSum),
    playable: playable / Math.max(1, samples),
  };
}

// 技能阶梯：同一套机制下，"普通玩家"（感知预算 0.22s/槽）和"完美玩家"（穷举全环）
// 的分数与爆仓率。这两个数必须反向：分高的那个必须更不容易崩。
// 这是"风险与收益成正比"在代码里的唯一可执行定义。
function ladder(mode, n = 10) {
  const run = (human) => {
    const scores = [];
    let over = 0, occ = 0;
    for (let s = 0; s < n; s++) {
      const g = new Game(9500 + s * 71, mode.id);
      const h = human ? makeHuman(s * 13 + 5, { scan: 0.22 }) : null;
      for (let f = 0; f < Math.ceil((CFG.levelTime + (CFG.timeBonusCap || 0)) / DT) + 240; f++) {
        g.setInput(h ? h(g, DT) : botInput(g));
        g.step(DT);
        g.drainEvents();
        if (g.dead) break;
      }
      scores.push(g.score);
      occ += g.occupied();
      if (g.deadReason === 'overflow') over++;
    }
    return {
      score: Math.round(scores.reduce((a, b) => a + b, 0) / n),
      over: over / n,
      occ: occ / n,
    };
  };
  return { normal: run(true), perfect: run(false) };
}

const totals = { normalOver: 0, perfectOver: 0 };
console.log(`=== 模式实测（每格 ${CYCLES} 局）===\n`);

for (const mode of MODES) {
  const aim = batch(mode, 'aim');
  const rand = batch(mode, 'rand');
  const idle = batch(mode, 'idle');
  const gap = skillGap(mode);

  console.log(`【${mode.name} / ${mode.id}】 ${mode.geo.n} 格 · ${mode.layout} 射口 · ${mode.cfg.levelTime}s`);
  console.log(`  瞄准  score=${aim.score}  存活=${aim.survive}/${CYCLES}  爆仓=${aim.over}  清/落=${aim.clearRatio.toFixed(2)}  峰值连消=${aim.combo}  最长连锁=${aim.chain}  末盘=${aim.occ}`);
  console.log(`  段位  ${TIERS.map((t, i) => `${t.name}:${aim.bands[i]}`).join('  ')}`);
  console.log(`  乱按  score=${rand.score}  存活=${rand.survive}/${CYCLES}  爆仓=${rand.over}  段位 ${TIERS.map((t, i) => `${t.name}:${rand.bands[i]}`).join(' ')}`);
  console.log(`  挂机  score=${idle.score}  存活=${idle.survive}/${CYCLES}  爆仓=${idle.over}`);
  console.log(`  技巧倍率=${gap.ratio.toFixed(2)}×  可打点占比=${(gap.playable * 100).toFixed(0)}%`);
  console.log(`  段位线 C/B/A/S/SS = ${mode.tiers.join(' / ')}`);

  const lad = ladder(mode);
  console.log(`  阶梯  普通 score=${lad.normal.score} 爆仓=${(lad.normal.over * 100).toFixed(0)}% 末盘=${lad.normal.occ.toFixed(0)}  |  完美 score=${lad.perfect.score} 爆仓=${(lad.perfect.over * 100).toFixed(0)}% 末盘=${lad.perfect.occ.toFixed(0)}`);
  check(lad.perfect.score > lad.normal.score, `${mode.id}: 完美玩家分数高于普通玩家`);
  // 逐模式只查占用：20 格短局里普通玩家也未必爆仓，单模式的爆仓率是 10 局里 0 和 1 的区别，
  // 太容易假阴性。末盘占用是连续的，才是可靠的风险代理。
  check(lad.perfect.occ < lad.normal.occ, `${mode.id}: 完美玩家末盘更空（风险更低）`);
  totals.normalOver += lad.normal.over;
  totals.perfectOver += lad.perfect.over;
  console.log('');
}

// 汇总的爆仓率必须反向：这是"风险与收益成正比"的整体判据。
// 逐模式看样本太少，四个模式合起来 40 局/档才稳。
console.log(`阶梯汇总：普通玩家爆仓 ${(totals.normalOver * 100 / MODES.length).toFixed(0)}%  完美玩家 ${(totals.perfectOver * 100 / MODES.length).toFixed(0)}%`);
check(totals.normalOver > totals.perfectOver, '汇总：普通玩家的爆仓率必须高于完美玩家');

console.log(`不变量检查：${checks} 项，失败 ${failed}`);
process.exit(failed ? 1 : 0);
