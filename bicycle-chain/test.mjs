// Headless 逻辑冒烟 + 平衡性探针：不开浏览器，直接跑模拟层。
import { Game, CFG, mulberry32, NOZZLE_OFF } from './src/sim.js';
import { N, L, D, mod } from './src/geom.js';

const DT = 1 / 60;
let fails = 0;
const check = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fails++; } };

console.log(`geometry: L=${L.toFixed(4)} slot=${D.toFixed(4)} N=${N} nozzleGap=${N / 2}`);

// ---- 单槽收益：把 ci 放进槽 k 会怎样 ----
function evalSlot(at, k, ci) {
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

// ---- "会瞄准"的机器人：在 28 个整相位里搜令所有落点总收益最大的那个 ----
function botInput(game) {
  const at = (j) => game.slots[mod(j, N)];
  const live = game.balls.length || game.nozzleCount();
  const c0 = (game.balls[0] || { ci: game.nozzleCi[0] }).ci;
  const c1 = live >= 2 ? (game.balls[1] || { ci: game.nozzleCi[1] }).ci : -1;

  let bestPhase = 0, bestSc = -1e9;
  for (let q = 0; q < N; q++) {
    const sc0 = evalSlot(at, mod(-q, N), c0);
    const sc1 = c1 < 0 ? 0 : evalSlot(at, mod(-q + NOZZLE_OFF[1], N), c1);
    const sc = sc0 + sc1;
    if (sc > bestSc) { bestSc = sc; bestPhase = q; }
  }

  // 需要在 lead 秒内把相位送到 bestPhase
  const lead = Math.max(0, game.beat - game.beatClock) + CFG.flightTime;
  let need = bestPhase - game.phase;
  while (need > N / 2) need -= N;
  while (need < -N / 2) need += N;
  const needV = Math.max(-CFG.vMax, Math.min(CFG.vMax, need / Math.max(lead, 0.08)));

  if (needV > game.v + 0.6) return 1;
  if (needV < game.v - 0.6) return -1;
  return 0;
}

function runBatch(label, n, bot) {
  let clears = 0, shots = 0, drops = 0, lone = 0, overflow = 0, timeout = 0, maxOcc = 0;
  let scoreSum = 0, maxChainSum = 0, finalOccSum = 0, best = 0, clearSum = 0;
  for (let g = 0; g < n; g++) {
    const game = new Game(1000 + g);
    const rnd = mulberry32(77 + g);
    let held = 0;

    for (let f = 0; f < Math.ceil(CFG.levelTime / DT) + 40; f++) {
      if (bot) held = bot(game);
      else if (f % 14 === 0) held = [-1, 0, 1][Math.floor(rnd() * 3)];

      game.setInput(held);
      game.step(DT);

      const occ = game.occupied();
      if (occ > maxOcc) maxOcc = occ;
      check(occ <= N, `occupied=${occ} > ${N}`);
      check(Number.isFinite(game.phase) && game.phase >= 0 && game.phase < N, `phase=${game.phase}`);
      check(Number.isFinite(game.score) && game.score >= 0, `score=${game.score}`);
      if (game.dead) break;
    }

    clears += game.clears;
    shots += game.shots;
    drops += game.drops;
    lone += game.snapped;
    clearSum += game.clears;
    scoreSum += game.score;
    maxChainSum += game.maxChain;
    finalOccSum += game.occupied();
    best = Math.max(best, game.score);
    if (!game.dead) check(false, `run ${g} never ended`);
    if (game.deadReason === 'overflow') overflow++;
    if (game.deadReason === 'time') timeout++;
  }
  console.log(
    `[${label.padEnd(6)}] shots=${shots} drops=${drops} ` +
    `clear/drop=${(clears / Math.max(1, drops)).toFixed(2)} ` +
    `snap=${(lone / Math.max(1, drops) * 100).toFixed(0)}% ` +
    `over=${overflow} surv=${timeout}/${n} maxOcc=${maxOcc} ` +
    `score=${Math.round(scoreSum / n)} best=${best} ` +
    `chain=${(maxChainSum / n).toFixed(1)} endOcc=${(finalOccSum / n).toFixed(1)}`
  );
}

runBatch('idle', 10, () => 0);
runBatch('random', 20, null);
runBatch('aimbot', 20, botInput);

// ---- 技巧空间探针：每拍最优相位能拿多少，随机相位能拿多少 ----
{
  let samples = 0, bestSum = 0, avgSum = 0, bothGood = 0;
  for (let s = 0; s < 12; s++) {
    const game = new Game(3000 + s);
    for (let f = 0; f < Math.ceil(CFG.levelTime / DT); f++) {
      game.setInput(0);
      game.step(DT);
      for (const e of game.drainEvents()) {
        if (e.type !== 'fire') continue;
        const at = (j) => game.slots[mod(j, N)];
        const c0 = e.colors[0], c1 = e.colors.length > 1 ? e.colors[1] : -1;
        let bestSc = -1e9, sum = 0, good = 0;
        for (let q = 0; q < N; q++) {
          const sa = evalSlot(at, mod(-q, N), c0);
          const sb = c1 < 0 ? 0 : evalSlot(at, mod(-q + NOZZLE_OFF[1], N), c1);
          if (sa >= 60 && sb >= 60) good++;
          const sc = sa + sb;
          sum += sc;
          if (sc > bestSc) bestSc = sc;
        }
        samples++; bestSum += bestSc; avgSum += sum / N;
        if (good > 0) bothGood++;
      }
      if (game.dead) break;
    }
  }
  console.log(
    `skill: 最优相位收益=${(bestSum / samples).toFixed(1)} 随机相位收益=${(avgSum / samples).toFixed(1)} ` +
    `倍率=${(bestSum / Math.max(1, avgSum)).toFixed(2)}× 双响占比=${(bothGood / samples * 100).toFixed(0)}%`
  );
}

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
