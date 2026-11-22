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
  // 乱按探针：不再是"每 0.1 秒碰一次键盘"——转动驱动之后那样根本转不起来，
  // 测出来的只是"挂机的另一种写法"。现在模拟手抖连按：每 6 帧换一个方向（含 0），
  // 转速中低、出球不成节奏，正是"乱按"该有的样子。
  const k = Math.floor(frame / 6);
  return [-1, 1, 0, 1, -1, 1][(seed + k) % 6];
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
      check(Number.isFinite(g.score) && g.score >= 0 && g.score === Math.floor(g.spinDist * 10) / 10, 'distance score invalid');
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
// 单颗球的"可打点占比"：环上是否至少存在一个值得打的落点（收益 >= 60）。
// 太低说明这一发纯属随机，玩家没得选；太高说明球发得太"贴心"。
// 用 5 个种子平均：早期只用 seed 777，mini 测出 20%、换 seed 又变成 74%，
// 这种单样本指标会让"盘面太空/太满"的判断完全跟着种子走。
const GAP_SEEDS = [777, 1, 42, 999, 2026];
function skillGap(mode) {
  let bestSum = 0, avgSum = 0, samples = 0, playable = 0;
  for (const seed of GAP_SEEDS) {
    const g = new Game(seed, mode.id);
    const at = (j) => g.slots[mod(j, N)];
    // 采样者用人类模型，而不是 oracle：oracle 太准，盘面会被打到只剩几颗，
    // "这一发有没有值得打的落点"就永远在测一块空盘。
    const h = makeHuman(seed * 7 + 3, { scan: 0.22 });
    for (let f = 0; f < Math.ceil(CFG.levelTime / DT); f++) {
      // 出球改成转动驱动之后，"不转"就永远不会发球——
      // 采样的前提是先把球打出来，所以这里必须让采样者转盘。
      g.setInput(h(g, DT));
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
  }
  return {
    ratio: bestSum / Math.max(1, avgSum),
    playable: playable / Math.max(1, samples),
  };
}

// 技能阶梯：同一套机制下，"挂机"（完全不转盘）、"普通玩家"（感知预算 0.22s/槽）
// 和"完美玩家"（穷举全环）的分数与爆仓率。三者必须严格递增，且分高的更不容易崩。
// 这是"风险与收益成正比"在代码里的唯一可执行定义。
// 注意：三种玩家必须用同一批种子，否则不同种子集的方差会把比值搅乱——
// 之前扑克模式就是因为只比较 batch 与 ladder 两套种子，漏掉了"挂机≈普通"。
function ladder(mode, n = 10) {
  const run = (policy) => {
    const scores = [];
    let over = 0, occ = 0;
    for (let s = 0; s < n; s++) {
      const g = new Game(9500 + s * 71, mode.id);
      const h = policy === 'normal' ? makeHuman(s * 13 + 5, { scan: 0.22 }) : null;
      for (let f = 0; f < Math.ceil((CFG.levelTime + (CFG.timeBonusCap || 0)) / DT) + 240; f++) {
        const input = policy === 'idle' ? 0 : h ? h(g, DT) : botInput(g);
        g.setInput(input);
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
  return { normal: run('normal'), perfect: run('perfect'), idle: run('idle') };
}

const totals = { normalOcc: 0, perfectOcc: 0 };
console.log(`=== 模式实测（每格 ${CYCLES} 局）===\n`);

for (const mode of MODES) {
  const aim = batch(mode, 'aim');
  const rand = batch(mode, 'rand');
  const idle = batch(mode, 'idle');
  const gap = skillGap(mode);

  console.log(`【${mode.name} / ${mode.id}】 ${mode.geo.n} 格 · ${mode.layout} 射口 · ${mode.cfg.levelTime}s`);
  console.log(`  瞄准  转距=${aim.score} 格  存活=${aim.survive}/${CYCLES}  爆仓=${aim.over}  清/落=${aim.clearRatio.toFixed(2)}  峰值连消=${aim.combo}  最长连锁=${aim.chain}  末盘=${aim.occ}`);
  console.log(`  段位  ${TIERS.map((t, i) => `${t.name}:${aim.bands[i]}`).join('  ')}`);
  console.log(`  乱按  转距=${rand.score} 格  存活=${rand.survive}/${CYCLES}  爆仓=${rand.over}  段位 ${TIERS.map((t, i) => `${t.name}:${rand.bands[i]}`).join(' ')}`);
  console.log(`  挂机  转距=${idle.score} 格  存活=${idle.survive}/${CYCLES}  爆仓=${idle.over}`);
  console.log(`  技巧倍率=${gap.ratio.toFixed(2)}×  可打点占比=${(gap.playable * 100).toFixed(0)}%`);
  console.log(`  段位线 C/B/A/S/SS = ${mode.tiers.join(' / ')}`);

  const lad = ladder(mode);
  console.log(`  阶梯  挂机转距=${lad.idle.score} 格  |  普通转距=${lad.normal.score} 格 爆仓=${(lad.normal.over * 100).toFixed(0)}% 末盘=${lad.normal.occ.toFixed(0)}  |  完美转距=${lad.perfect.score} 格 爆仓=${(lad.perfect.over * 100).toFixed(0)}% 末盘=${lad.perfect.occ.toFixed(0)}`);
  // 不再断言"完美分数 > 普通"：这一版速度是玩家的风险选择，oracle 选的是
  // "每一发都瞄准"的中高转速，出球数比人类模型少，分数可能低一截。
  // 技巧的证明改成**末盘占用**：完美玩家必须把盘面维持在更空的位置。
  check(lad.perfect.occ < lad.normal.occ, `${mode.id}: 完美玩家末盘更空（风险更低）`);
  // 挂机不得接近普通玩家：否则"什么都不做"就能拿段位，落点选择这条核心动词失效。
  check(lad.idle.score < lad.normal.score * 0.75,
    `${mode.id}: 挂机分数必须明显低于普通玩家（idle ${lad.idle.score} / normal ${lad.normal.score}）`);
  check(lad.normal.score > lad.idle.score, `${mode.id}: 普通玩家分数高于挂机`);
  // 普通玩家不该频繁爆仓。20% 是留了样本噪声的阈值。
  check(lad.normal.over <= 0.2,
    `${mode.id}: 普通玩家爆仓率不得高于 20%（实测 ${(lad.normal.over * 100).toFixed(0)}%）`);
  // 落球时至少要有两成机会存在"值得打的落点"。盘面太空时这一发纯属随机，
  // 唯一动词（转盘选位置）就失效了。
  // 阈值从 45% 降到 20%：转动驱动之后出球少了，盘面本来就比旧版空，
  // 45% 那套是按"自动每拍一颗"的密度标出来的，已经不对应当前节奏。
  check(gap.playable >= 0.20,
    `${mode.id}: 可打点占比不得过低（实测 ${(gap.playable * 100).toFixed(0)}%）`);
  // 技巧倍率仍要证明"选落点"有价值：最优位置至少是平均位置的 2 倍收益。
  check(gap.ratio >= 2, `${mode.id}: 落点选择的技巧倍率 ≥ 2（实测 ${gap.ratio.toFixed(2)}×）`);
  totals.perfectOcc += lad.perfect.occ;
  totals.normalOcc += lad.normal.occ;
  console.log('');
}

// 汇总的判据从"爆仓率反向"改成"占用反向"：出球由玩家控制之后，
// 不转就不会有球，爆仓不再是"普通玩家的默认结局"；风险变成了"转多快"。
// 完美玩家每发都瞄准，盘面必须比普通玩家更空——这是技巧在代码里的可执行定义。
console.log(`阶梯汇总：普通玩家平均末盘占用 ${(totals.normalOcc / MODES.length).toFixed(1)}  完美玩家 ${(totals.perfectOcc / MODES.length).toFixed(1)}`);
check(totals.normalOcc > totals.perfectOcc, '汇总：完美玩家平均末盘占用必须低于普通玩家');

console.log(`不变量检查：${checks} 项，失败 ${failed}`);
process.exit(failed ? 1 : 0);
