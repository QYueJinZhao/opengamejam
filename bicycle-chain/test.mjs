// 无头平衡性探针：用三种「玩家」跑每个模式，输出存活率、得分、连击与技巧倍率。
// 用法：node test.mjs

import { Game, CFG } from './src/sim.js';
import { MODES, TIERS, scoreBand } from './src/modes.js';
import { botInput, evalSlot } from './src/bot.js';
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
  const maxFrames = Math.ceil(CFG.levelTime / DT) + 240;
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

// 技巧倍率：每次发球时刻，最优相位收益 / 平均相位收益
function skillGap(mode) {
  const g = new Game(777, mode.id);
  const at = (j) => g.slots[mod(j, N)];
  let bestSum = 0, avgSum = 0, samples = 0, bothGood = 0;
  for (let f = 0; f < Math.ceil(CFG.levelTime / DT); f++) {
    g.setInput(0);
    g.step(DT);
    for (const e of g.drainEvents()) {
      if (e.type !== 'fire') continue;
      let best = -1e9, sum = 0, both = 0;
      for (let q = 0; q < N; q++) {
        let sc = 0, good = 0;
        for (let k = 0; k < e.colors.length; k++) {
          const v = evalSlot(at, mod(-q + e.offs[k], N), e.colors[k]);
          sc += v;
          if (v >= 60) good++;
        }
        if (good >= 2) both++;
        sum += sc;
        if (sc > best) best = sc;
      }
      bestSum += best;
      avgSum += sum / N;
      bothGood += both / N;
      samples++;
    }
    if (g.dead) break;
  }
  return {
    ratio: bestSum / Math.max(1, avgSum),
    both: bothGood / Math.max(1, samples),
  };
}

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
  console.log(`  技巧倍率=${gap.ratio.toFixed(2)}×  双落点同消占比=${(gap.both * 100).toFixed(0)}%`);
  console.log(`  段位线 C/B/A/S/SS = ${mode.tiers.join(' / ')}`);
  console.log('');
}

console.log(`不变量检查：${checks} 项，失败 ${failed}`);
process.exit(failed ? 1 : 0);
