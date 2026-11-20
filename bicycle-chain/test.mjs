// Headless 逻辑冒烟 + 平衡性探针：不开浏览器，直接跑模拟层。
import { Game, CFG, mulberry32 } from './src/sim.js';
import { N, L, D, mod } from './src/geom.js';

const DT = 1 / 60;
let fails = 0;
const check = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); fails++; } };

console.log(`geometry: L=${L.toFixed(4)} slot=${D.toFixed(4)} N=${N}`);

// ---- 简易"会瞄准"的机器人：证明可达性，不代表人类水平 ----
function botInput(game) {
  const ci = game.nextCi;
  const at = (j) => game.slots[mod(j, N)];
  let best = -1, bestScore = -1e9;

  for (let i = 0; i < N; i++) {
    let sc = 0;
    const l1 = at(i - 1), r1 = at(i + 1);
    const l2 = at(i - 2), r2 = at(i + 2);

    if (l1 && l1.ci === ci) sc += 30;
    if (r1 && r1.ci === ci) sc += 30;
    if (l2 && l2.ci === ci) sc += 12;
    if (r2 && r2.ci === ci) sc += 12;
    if (l1 && r1 && l1.ci === ci && r1.ci === ci) sc += 80;
    if (at(i) === null) sc += 6;              // 空档可以自由落子
    else if (at(i).ci === ci) sc += 18;       // 插进同色堆

    if (sc > bestScore) { bestScore = sc; best = i; }
  }

  // 关键：要瞄的是"落地那一刻"的相位，不是当前相位
  const lead = Math.max(0, (game.beat - game.beatClock)) + CFG.flightTime + 0.05;
  const target = mod(-best - game.v * lead, N);
  let delta = target - game.phase;
  while (delta > N / 2) delta -= N;
  while (delta < -N / 2) delta += N;

  const desiredV = Math.max(-CFG.vMax, Math.min(CFG.vMax, delta * 2.6));
  if (Math.abs(delta) < 0.4) return 0;
  if (desiredV > game.v + 0.5) return 1;
  if (desiredV < game.v - 0.5) return -1;
  return 0;
}

function runBatch(label, n, bot) {
  let clears = 0, shots = 0, overflow = 0, timeout = 0, maxOcc = 0;
  let scoreSum = 0, maxChainSum = 0, finalOccSum = 0, best = 0;
  for (let g = 0; g < n; g++) {
    const game = new Game(1000 + g);
    const rnd = mulberry32(77 + g);
    let held = 0;

    for (let f = 0; f < Math.ceil(CFG.levelTime / DT) + 40; f++) {
      if (bot) held = botInput(game);
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
    scoreSum += game.score;
    maxChainSum += game.maxChain;
    finalOccSum += game.occupied();
    best = Math.max(best, game.score);
    if (!game.dead) check(false, `run ${g} never ended`);
    if (game.deadReason === 'overflow') overflow++;
    if (game.deadReason === 'time') timeout++;
  }
  console.log(
    `[${label}] runs=${n} shots=${shots} clears=${clears} ` +
    `clear/shot=${(clears / Math.max(1, shots)).toFixed(2)} ` +
    `overflow=${overflow} survived=${timeout} maxOcc=${maxOcc} ` +
    `avgScore=${Math.round(scoreSum / n)} best=${best} ` +
    `avgMaxChain=${(maxChainSum / n).toFixed(1)} avgFinalOcc=${(finalOccSum / n).toFixed(1)}`
  );
}

runBatch('idle', 10, () => 0);
runBatch('random', 20, null);
runBatch('aimbot', 20, botInput);

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
