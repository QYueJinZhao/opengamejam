import { Game, CFG, WILD, BOMB, RUST, isColor, comboTierIndex } from './src/sim.js';
import { N, D, mod } from './src/geom.js';
import { botInput } from './src/bot.js';

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('  ✗ ' + m); } else console.log('  ✓ ' + m); };

// 1) 万能球：两侧同色时必然定型成那个颜色
{
  const g = new Game(11, 'standard');
  g.slots.fill(null);
  const A = 6;
  g.slots[mod(A - 1, N)] = g.makeBead(1);
  g.slots[mod(A + 1, N)] = g.makeBead(1);
  g.slots[mod(A - 2, N)] = g.makeBead(1);
  const ci = g.chooseWildColor(A);
  ok(ci === 1, `万能球在 3 连金旁边定型为金（得到 ${ci}）`);
}

// 2) 万能球：两侧异色时至少成一个合法颜色
{
  const g = new Game(12, 'standard');
  g.slots.fill(null);
  g.slots[5] = g.makeBead(0);
  g.slots[7] = g.makeBead(2);
  const ci = g.chooseWildColor(6);
  ok(isColor(ci), `万能球在异色夹缝里仍返回基础色（得到 ${ci}）`);
}

// 3) 爆破球：落点为中心清 5 格
{
  const g = new Game(13, 'standard');
  g.slots.fill(null);
  for (let i = 0; i < 8; i++) g.slots[mod(8 + i, N)] = g.makeBead(i % 3);
  const before = g.occupied();
  g.detonate(10, 0);
  ok(g.occupied() === before - 5, `爆破清掉 5 格（${before} → ${g.occupied()}）`);
}

// 4) 锈球：紧贴消除段时被一起震碎
{
  const g = new Game(14, 'standard');
  g.slots.fill(null);
  const s = 5;
  g.slots[mod(s, N)] = g.makeBead(RUST);
  for (let i = 0; i < 3; i++) g.slots[mod(s + 1 + i, N)] = g.makeBead(2);
  g.resolve(-1, 0);
  ok(g.slots[mod(s, N)] === null, '消除段左侧的锈球被震碎');
  ok(g.occupied() === 0, `整段连同锈球一起清空（剩 ${g.occupied()}）`);
}

// 5) 消除驱动的奖励球：4 连给爆破、5 连给万能，都插在待发位
{
  const setup = (n) => {
    const g = new Game(21, 'standard');
    g.slots.fill(null);
    for (let i = 0; i < n; i++) g.slots[mod(10 + i, N)] = g.makeBead(1);
    return g;
  };

  const g4 = setup(4);
  const q4 = g4.queues[0];
  const tail = q4[2];
  const lenBefore = q4.length;
  g4.drainEvents();
  g4.resolve(-1, g4.nozzleOff[0]);
  const rev = g4.drainEvents().find((e) => e.type === 'reward');
  ok(q4[0] === BOMB, `4 连后待发球变成爆破球（得到 ${q4[0]}）`);
  ok(q4.length === lenBefore, `队列长度不变（${q4.length}）`);
  // 直接比对事件里的 dropped，而不是看队列末位：基础色只有 4 种，
  // 末尾那颗被挤掉之后补上同色的概率是 25%，按"末位变了"判会偶发假阴性。
  ok(rev && rev.dropped === tail, '末尾预览球被挤掉（事件里记录了 dropped）');

  const g5 = setup(5);
  g5.resolve(-1, g5.nozzleOff[0]);
  ok(g5.queues[0][0] === WILD, `5 连后待发球变成万能球（得到 ${g5.queues[0][0]}）`);

  const g3 = setup(3);
  const ci3 = g3.queues[0][0];
  g3.resolve(-1, g3.nozzleOff[0]);
  ok(g3.queues[0][0] === ci3 && g3.rewards === 0, '3 连不给奖励球');
}

// 6) 一次结算只给一颗：连锁里的第二段四连不重复发
{
  const g = new Game(22, 'standard');
  g.slots.fill(null);
  for (let i = 0; i < 4; i++) g.slots[mod(10 + i, N)] = g.makeBead(2);
  for (let i = 0; i < 4; i++) g.slots[mod(24 + i, N)] = g.makeBead(3);
  const r0 = g.rewards;
  g.resolve(-1, g.nozzleOff[0]);
  ok(g.rewards - r0 === 1, `两段四连只发一颗奖励球（发了 ${g.rewards - r0} 颗）`);
}

// 7) 爆破清 5 格不算四连：奖励只认匹配消除
{
  const g = new Game(23, 'standard');
  g.slots.fill(null);
  for (let i = 0; i < 8; i++) g.slots[mod(8 + i, N)] = g.makeBead(i % 4);
  const r0 = g.rewards;
  g.detonate(10, g.nozzleOff[0]);
  ok(g.rewards === r0, '爆破球炸 5 格不触发奖励球');
}

// 8) 随机炸弹已归零，随机万能仍在
{
  const g = new Game(24, 'standard');
  g.time = 60;
  let bomb = 0, wild = 0;
  for (let i = 0; i < 4000; i++) {
    const ci = g.pickShot();
    if (ci === BOMB) bomb++;
    if (ci === WILD) wild++;
  }
  ok(bomb === 0, `随机补球不再产生爆破球（${bomb} 次）`);
  ok(wild > 100, `随机补球仍有万能球（${wild}/4000）`);
}

// 9) 连消档位也是奖励来源：跨入「凌厉」给爆破，跨入「爆发」给万能
{
  const trial = (combo0, extra) => {
    const g = new Game(25, 'standard');
    g.slots.fill(null);
    g.combo = combo0;
    g.comboT = g.time;
    g.comboTier = comboTierIndex(combo0);
    for (let i = 0; i < extra; i++) g.slots[mod(10 + i, N)] = g.makeBead(1);
    g.resolve(-1, g.nozzleOff[0]);
    return g;
  };
  const a = trial(5, 3);    // 5 → 8，跨过凌厉(6)
  ok(a.queues[0][0] === BOMB, `跨入凌厉档给爆破球（得到 ${a.queues[0][0]}，combo ${a.combo}）`);
  const b = trial(11, 3);   // 11 → 14，跨过爆发(12)
  ok(b.queues[0][0] === WILD, `跨入爆发档给万能球（得到 ${b.queues[0][0]}，combo ${b.combo}）`);
  const c = trial(7, 3);    // 7 → 10，仍在凌厉档(6~11)内，不重复给
  ok(c.rewards === 0, '档位内继续消除不重复发奖励');
}

// 5) 锈球：不能自己凑三消
{
  const g = new Game(15, 'standard');
  g.slots.fill(null);
  for (let i = 0; i < 4; i++) g.slots[mod(10 + i, N)] = g.makeBead(RUST);
  g.resolve(-1, 0);
  ok(g.occupied() === 4, `4 颗相邻锈球不会被消掉（剩 ${g.occupied()}）`);
}

// 6) 珠子补位：两档速度
//
// 这一条守的是观感，不是数值。上一版是单一恒速 11 格/秒，问题出在
// **落空吸附**：球垂直落到 k、链条在 target，相差 6 格时珠子 0.55 秒就走完，
// 读起来不是"珠子走过去"，而是"珠子凭空出现在链条边上"。
// 现在分两档：
//   1 格（插入时整列让位）—— dxSpeed，必须快，慢了会读成"珠子堆住了"；
//   2 格以上（落空补位）—— dxSlideSpeed，慢到眼睛能跟住。
{
  const g = new Game(16, 'standard');
  g.slots.fill(null);
  g.slots[5] = g.makeBead(0);

  // 推挤：正好 1 格，一个"格时长"走完
  g.slots[5].dx = 1;
  g.slots[5].dv = CFG.dxSpeed;
  g.step(1 / CFG.dxSpeed);
  ok(g.slots[5].dx === 0, `插入让位按 dxSpeed 一步归位（→ ${g.slots[5].dx.toFixed(3)}）`);

  // 补位：同样一段时间里只走一小截
  g.slots[5].dx = 4;
  g.slots[5].dv = CFG.dxSlideSpeed;
  g.step(1 / CFG.dxSpeed);
  ok(g.slots[5].dx > 3.5, `落空补位明显慢于插入让位（4 → ${g.slots[5].dx.toFixed(3)}）`);

  // 不足一格：一次走完，不越界成反向
  g.slots[5].dx = 0.03;                    // 小于一帧的位移（4.6/120 = 0.038 格）
  g.step(1 / 120);
  ok(g.slots[5].dx === 0 && g.slots[5].dv === 0, '不足一格时一次归位，并清掉速度');

  // 越远越久，但全程不超过 dxSlideMaxSec
  const settle = (dx) => {
    const h = new Game(16, 'standard');
    h.slots.fill(null);
    h.slots[5] = h.makeBead(0);
    h.slots[5].dx = dx;
    h.slots[5].dv = Math.max(CFG.dxSlideSpeed, dx / CFG.dxSlideMaxSec);
    let t = 0;
    while (h.slots[5].dx !== 0 && t < 5) { h.step(1 / 120); t += 1 / 120; }
    return t;
  };
  const t2 = settle(2), t6 = settle(6), t12 = settle(12);
  ok(t6 > t2 * 1.8, `补位距离越远耗时越久（2 格 ${t2.toFixed(2)}s vs 6 格 ${t6.toFixed(2)}s）`);
  ok(t12 <= CFG.dxSlideMaxSec + 0.1, `再远也不超过 dxSlideMaxSec（12 格 ${t12.toFixed(2)}s ≤ ${CFG.dxSlideMaxSec}s）`);
}

// 6b) 落球那一帧，珠子的**视觉位置**就在球落下的地方
//
// 落空吸附时珠子从落点滑向链条；如果起点没设对，它会直接出现在链条上——
// 玩家看到"球落在空处，珠子凭空在几格外冒出来"，距离越远越像被甩过去。
// 这条断言守的就是那一步：插入瞬间 slot+dx 必须等于 dropSlot。
{
  const g = new Game(53, 'standard');
  let n = 0, worst = 0, far = 0;
  for (let f = 0; f < 120 * 60; f++) {
    g.setInput(botInput(g));
    g.step(1 / 120);
    for (const e of g.drainEvents()) {
      if (e.type !== 'insert' && e.type !== 'lone') continue;
      // e.s 是视觉位置（slot + dx + phase），落点也按同一套相位换算
      const want = mod(e.dropSlot + g.phase, N) * D;
      const d = Math.abs(e.s - want);
      worst = Math.max(worst, Math.min(d, N * D - d));
      const dd = Math.abs(mod(e.slot - e.dropSlot + N / 2, N) - N / 2);
      if (dd > 3) far++;
      n++;
    }
    if (g.dead) break;
  }
  ok(worst < 1e-9, `落球帧的视觉位置就在落点（${n} 次落球，最大偏差 ${worst.toExponential(1)}）`);
  ok(far > 0, `确实有远距离吸附的样本（${far} 次，否则这条断言没验到东西）`);
}

// 7) 全流程不变式：跑一局，检查不变量
{
  const g = new Game(17, 'standard');
  let rust = 0, wild = 0, bomb = 0;
  for (let f = 0; f < Math.ceil(CFG.levelTime * 120); f++) {
    g.setInput(0);
    g.step(1 / 120);
    for (const e of g.drainEvents()) {
      if (e.type === 'rust') rust++;
      if (e.type === 'bomb') bomb++;
    }
    for (const q of g.queues) for (const ci of q) if (!isColor(ci) && ci !== WILD && ci !== BOMB) { bad++; console.log('  ✗ 队列里出现非法球种 ' + ci); }
    if (g.dead) break;
  }
  ok(g.occupied() <= N, `占用不超上限（${g.occupied()}/${N}）`);
  console.log(`  · 挂机一局：注入锈球 ${rust} 颗，爆破 ${bomb} 次，得分 ${g.score}`);
}

// 10) 轮流发射：一次只出一颗，口按顺序轮转
//
// 这一条守的是本轮最核心的机制改动。上一版每拍齐射：两个口同帧出球、
// 同帧落地，玩家只有一个相位可调，屏幕上却有两颗球要读。改成轮流之后，
// 每一发都是独立事件——但必须真的"轮"，否则双炮会有一门永远闲置。
{
  const g = new Game(31, 'standard');
  g.time = 30;                      // 标准模式 20s 后第二个口才上线，之前只有一个口
  const idxs = [];
  for (let i = 0; i < 6; i++) { g.fire(); idxs.push(g.balls[0].idx); }
  ok(idxs.join('') === '010101', `双口交替开火（得到 ${idxs.join('')}）`);
  ok(g.balls.length === 1, `一次只出一颗球（${g.balls.length}）`);

  const h = new Game(33, 'triple');
  h.time = 40;                      // 三射口模式 30s 后第三个口才上线
  const t = [];
  for (let i = 0; i < 6; i++) { h.fire(); t.push(h.balls[0].idx); }
  ok(t.join('') === '012012', `三口按 0→1→2 轮转（得到 ${t.join('')}）`);
}

// 11) 飞行期间不发射下一颗：空中最多一颗球
//
// fire() 是整组替换 balls 的，如果 beat 短于飞行时长，上一颗会凭空消失
// （连落地都没发生过）。step 里的 beat 下限（flight + fireGap）就是为这条守的。
{
  const g = new Game(32, 'standard');
  let maxBalls = 0, fires = 0;
  for (let f = 0; f < 120 * 60; f++) {
    g.step(1 / 120);
    maxBalls = Math.max(maxBalls, g.balls.length);
    for (const e of g.drainEvents()) if (e.type === 'fire') fires++;
    if (g.dead) break;
  }
  ok(maxBalls <= 1, `空中同时最多一颗球（${maxBalls}）`);
  ok(fires >= 12, `60 秒内出球 ${fires} 次（间隔约 ${(60 / Math.max(1, fires)).toFixed(2)}s）`);
}

// 12) 节奏：分数驱动的加速必须是**单调**的
//
// 这条守的是"随分数增加节奏变快"这一条需求本身。反例是两种：
//   a) 分数涨了但 beat 没动（曲线没接上，或者被 tempoRef 截死了）；
//   b) beat 会反弹（时间地板和分数曲线取 min 之后又加了平滑，抖动）。
// 只要 beat 在整局里出现任何一次上升，玩家就会在"机器突然变慢"的那一刻
// 感到莫名其妙——而那种抖动在数值上往往只有 0.02 秒，肉眼看不出来，
// 只能靠这条断言抓。
{
  const g = new Game(41, 'standard');
  let prevBeat = Infinity, rose = 0, minBeat = Infinity;
  const checkpoints = [];
  // 用瞄准机器人跑完整局：挂机 40 秒就爆仓了，曲线根本走不到满速。
  for (let f = 0; f < 120 * 90; f++) {
    g.setInput(botInput(g));
    g.step(1 / 120);
    g.drainEvents();
    if (g.beat > prevBeat + 1e-9) rose++;
    prevBeat = g.beat;
    minBeat = Math.min(minBeat, g.beat);
    if (f % 1200 === 0) checkpoints.push([Math.round(g.time), g.score, +g.tempo.toFixed(3), +g.beat.toFixed(3)]);
    if (g.dead) break;
  }
  ok(rose === 0, `beat 在整局里从不上升（异常 ${rose} 次）`);
  ok(minBeat >= CFG.beatRush - 1e-9, `beat 不会低于 beatRush（最低 ${minBeat.toFixed(3)} ≥ ${CFG.beatRush}）`);
  ok(g.tempo >= 0.999, `一局之内节奏能走到满速（tempo ${g.tempo.toFixed(2)}，需要 ${CFG.tempoRef} 分）`);
  console.log('  · 节奏曲线（秒 / 分 / tempo / beat）：' + checkpoints.map((c) => c.join(':')).join('  '));
}

// 12b) 零分时 beat 完全由时间地板决定
//
// 这条和上一条是一对：上一条守"分数曲线单调"，这一条守"时间地板真的存在"。
// 少了它，一个从不消球的玩家会永远停在 2.20 秒一颗——局内毫无推进。
{
  const g = new Game(44, 'standard');
  g.time = CFG.rampSec;
  g.score = 0;
  g.step(1 / 120);
  ok(Math.abs(g.beat - CFG.beatEnd) < 1e-6,
    `零分时 beat 由时间地板决定（${g.beat.toFixed(3)} = beatEnd ${CFG.beatEnd}）`);
}

// 13) 同一时刻，分数越高 beat 越短（曲线真的由分数驱动，而不是只由时间驱动）
{
  const mk = (score) => {
    const g = new Game(42, 'standard');
    g.time = 20;            // 固定时间，排除时间地板的干扰
    g.score = score;
    g.step(1 / 120);
    return g;
  };
  const lo = mk(0), hi = mk(CFG.tempoRef * 0.5), top = mk(CFG.tempoRef);
  ok(hi.beat < lo.beat - 1e-6, `同一时刻，得分高者 beat 更短（${lo.beat.toFixed(2)} → ${hi.beat.toFixed(2)}）`);
  ok(top.beat <= CFG.beatRush + 1e-9, `满 tempoRef 时 beat 触底（${top.beat.toFixed(3)}）`);
  ok(top.tempoMult > lo.tempoMult + 0.2, `节奏倍率随 tempo 上升（×${lo.tempoMult.toFixed(2)} → ×${top.tempoMult.toFixed(2)}）`);
  ok(Math.abs(top.tempoMult - (1 + CFG.tempoGain)) < 1e-9, `满速倍率 = 1 + tempoGain（${top.tempoMult.toFixed(2)}）`);
}

// 14) 飞行永远装得进一拍里：空中有且只有一颗球
//
// 上一版靠 step 末尾的 max(beat, flight + fireGap) 夹逼，那是"事后补丁"；
// 现在改成 flightDur = min(基准, beat × ratio)，这条不变量由几何保证。
// 断言守的是那 14% 的空档：它一旦变成负数，球就会在落地前被下一颗覆盖掉。
{
  const g = new Game(43, 'standard');
  let worst = Infinity, both = 0;
  for (let f = 0; f < 120 * 90; f++) {
    g.setInput(0);
    g.step(1 / 120);
    g.drainEvents();
    worst = Math.min(worst, g.beat - g.flightDur);
    both = Math.max(both, g.balls.length);
    if (g.dead) break;
  }
  ok(worst >= CFG.fireGap - 1e-9, `每拍都留出 ≥ fireGap 的空档（最小 ${worst.toFixed(3)}s）`);
  ok(both <= 1, `空中同时最多一颗球（${both}）`);
}

console.log(bad ? `\n失败 ${bad} 项` : '\n全部通过');
process.exit(bad ? 1 : 0);
