import {
  Game, CFG, WILD, BOMB, RUST, isColor, comboTierIndex, musicBpmAt,
  aimFreqStep, aimPanStep, AIM_FREQS,
} from './src/sim.js';
import { N, D, mod } from './src/geom.js';
import { botInput } from './src/bot.js';
import { patternValue, pipOf, isFlipDie } from './src/dice.js';
import {
  CARD_BASE, SHIFT_BASE, JOKER, ACE_BOMB, FACE_DOWN,
  cardCi, handOfWindow, findHand, suitOf, rankOf, shiftVariant,
} from './src/poker.js';

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

// 10) 单喷头：所有模式只有一个 0 号口，一次只出一颗
{
  const g = new Game(31, 'standard');
  g.time = 60;
  const idxs = [];
  for (let i = 0; i < 6; i++) { g.fire(); idxs.push(g.balls[0].idx); }
  ok(idxs.every((i) => i === 0), `始终从 0 号口出球（得到 ${idxs.join('')}）`);
  ok(g.balls.length === 1, `一次只出一颗球（${g.balls.length}）`);
  ok(g.queues.length === 1, `只有一个待发队列（${g.queues.length}）`);

  const h = new Game(33, 'grand');
  h.time = 80;
  ok(h.queues.length === 1 && h.nozzleCount() === 1,
    '大轮长跑同样只有一个队列、一个口');

  // 喷头演出状态：出膛置 1，0.30 秒内衰减到 0。
  const p = new Game(34, 'standard');
  p.fire();
  ok(p.firePulse === 1, `出膛瞬间 firePulse = 1（${p.firePulse}）`);
  for (let i = 0; i < 40; i++) p.step(1 / 120);
  ok(p.firePulse === 0, `0.33 秒后 firePulse 归零（${p.firePulse}）`);
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

// ===============================================================
// 骰子规则族（第七轮）
//
// 下面这一组守的是设计稿里可以逐条核对的硬约定：
//   豹子 = 点数和×40、6-6-6 = 720×1.5、3 连顺 = 300、4 连顺 = 900、
//   六连顺 = 6890、6 点被 +1 槽翻回 1 点、镀金整段翻倍、
//   连续 3 发漏接塞一颗铅骰、双响同点只换待发位、chain 2 续时 1.5 秒。
//
// 它们不是"补覆盖率"——本轮两条断言各自抓出一个真 bug：
//   1. findPattern 算完 patternValue 却没把 value 写回牌型对象，
//      resolve 读到的 run.value 恒为 undefined，整张骰子计分表静默失效，
//      实际一直在用基础模式的 BASE_SCORE(len)。分数照涨，规则从没生效。
//   2. flipNeighbors 在合拢**前**（带洞）的盘面上穷举点数，
//      翻面骰的左右邻此刻还隔着被清掉的几格，六次扫描全是 0 分，
//      bestPip 恒为 1——"翻成最值钱的点数"永远翻成 1 点。
// 两个都不报错、不崩、画面上完全正常，只有把数字写成断言才看得见。
// ===============================================================
{
  /** 建一盘骰子局面：pips 依次摆在 8 号槽之后，空环其余部分全空。 */
  const mkDice = (pips, seed = 90) => {
    const g = new Game(seed, 'dice');
    g.slots.fill(null);
    pips.forEach((p, i) => { g.slots[mod(8 + i, N)] = g.makeBead(p - 1); });
    return g;
  };

  // 15) 开局阵型 + 设计稿那句"一枪两段"
  //
  // 设计稿的原话是"开局预设 1-2-4-4-3，让玩家 10 秒内体验先消豹子再合拢出顺子"。
  // 这句话里有一条很硬的约束：两段之间必须由 compact 自动完成，不能靠第二枪。
  // 所以这条断言不只是读数组，它真的把第一枪打出去，看连锁是不是自己发生。
  {
    const g = new Game(91, 'dice');
    const off0 = g.nozzleOff[0];
    const pips = [];
    for (let i = 0; i < 7; i++) {
      const b = g.slots[mod(off0 - 2 + i, N)];
      pips.push(b ? pipOf(b.ci) : 0);
    }
    ok(pips.slice(0, 5).join('') === '12443', `开局阵型是设计稿的 1-2-4-4-3（得到 ${pips.join('')}）`);
    ok(g.queues[0][0] === 3, '第一发锁定 4 点（先看到一枪两段，而不是先学转盘）');
    ok(g.findMatch() === null, '开局盘面没有任何现成牌型');

    g.drainEvents();
    g.dropAt(off0, 3, off0);                       // 4 点落在 0 号射口正下方
    const cl = g.drainEvents().filter((e) => e.type === 'clear');
    ok(g.chain === 2, `「先消豹子、合拢出顺子」在一枪里自动发生（chain ${g.chain}）`);
    ok(cl[0] && cl[0].kind === 'same' && cl[0].base === 480, `第一段是豹子 4-4-4（base ${cl[0] && cl[0].base}）`);
    ok(cl[1] && cl[1].kind === 'run' && cl[1].len === 4, `第二段是合拢送的 4 连顺（len ${cl[1] && cl[1].len}）`);
  }

  // 16) 计分表：设计稿的每一个数字
  {
    const pat = (p) => mkDice(p, 92).findMatch();
    const p444 = pat([4, 4, 4]);
    ok(p444.kind === 'same' && p444.len === 3 && p444.value === 480, `豹子 4-4-4 = 12×40 = 480（${p444.value}）`);
    const p666 = pat([6, 6, 6]);
    ok(patternValue({ ...p666, jackpot: false }) === 720, '6-6-6 的基础分是设计稿写的 720');
    ok(p666.jackpot && p666.value === 1080, `6-6-6 额外 JACKPOT ×1.5（${p666.value}）`);
    ok(pat([1, 2, 3]).value === 300, '3 连顺 = 6×50 = 300');
    ok(pat([1, 2, 3, 4]).value === 900, '4 连顺 = 10×90 = 900');
    ok(pat([1, 2, 3, 4, 5, 6]).value === 6890, '六连顺 = 21×90 + 5000 = 6890');
    ok(pat([3, 2, 1]).value === 300, '递减顺子（3-2-1）同样成立');
  }

  // 17) 冲突时选"最值钱"，不是"最长"
  //
  // 4 连豹子的 1 点共 160 分，3 连顺 4-5-6 是 750 分。
  // 按长度挑会选豹子，按价值挑才选顺子——玩家心里算的是收益。
  {
    const p = mkDice([1, 1, 1, 1, 4, 5, 6], 93).findMatch();
    ok(p.kind === 'run' && p.len === 3 && p.value === 750,
      `4 连豹子(160) 让位给 3 连顺(750)（得到 ${p.kind} len${p.len} ${p.value}）`);
  }

  // 18) 铅骰不参与匹配 / 翻面骰按点数参与
  {
    const gr = mkDice([2, 4, 6], 94);
    for (let i = 0; i < 3; i++) gr.slots[mod(20 + i, N)] = gr.makeBead(RUST);
    ok(gr.findMatch() === null, '三颗铅骰挨在一起也不成牌型');

    const gf = new Game(95, 'dice');
    gf.slots.fill(null);
    for (let i = 0; i < 3; i++) gf.slots[mod(8 + i, N)] = gf.makeBead(20 + i);
    const pf = gf.findMatch();
    ok(pf && pf.kind === 'run' && pf.len === 3, '翻面骰按点数参与牌型（20/21/22 就是 1-2-3）');
  }

  // 19) +1 翻面槽：6 点循环回 1 点，翻面骰保持翻面身份
  {
    const g = new Game(96, 'dice');
    g.slots.fill(null);
    g.time = 30;                       // +1 槽 20s 开放
    const plus = g.pads.find((p) => p.kind === 'plus');
    g.slots[plus.slot] = g.makeBead(1);              // 2 点占位，球会插在这一格
    g.slots[mod(plus.slot + 1, N)] = g.makeBead(3);  // 4 点右邻，保证不成型
    g.drainEvents();
    g.dropAt(plus.slot, 5, g.nozzleOff[0]);          // 6 点
    const ev = g.drainEvents().find((e) => e.type === 'padplus');
    ok(ev && ev.pip === 1, `+1 槽把 6 点翻回 1 点（pip ${ev && ev.pip}）`);
    ok(g.slots[plus.slot] && g.slots[plus.slot].ci === 0, '落点那颗骰子确实变成了 1 点');

    const gf = new Game(97, 'dice');
    gf.slots.fill(null);
    gf.time = 30;
    const plus2 = gf.pads.find((p) => p.kind === 'plus');
    gf.slots[plus2.slot] = gf.makeBead(1);
    gf.drainEvents();
    gf.dropAt(plus2.slot, 25, gf.nozzleOff[0]);      // 6 点翻面骰
    const bf = gf.slots[plus2.slot];
    ok(isFlipDie(bf.ci) && pipOf(bf.ci) === 1, `翻面骰被 +1 之后仍然是翻面骰（ci ${bf.ci}）`);

    const g0 = new Game(98, 'dice');
    g0.slots.fill(null);
    const plus0 = g0.pads.find((p) => p.kind === 'plus');
    g0.slots[plus0.slot] = g0.makeBead(1);
    g0.drainEvents();
    g0.dropAt(plus0.slot, 5, g0.nozzleOff[0]);
    ok(!g0.drainEvents().some((e) => e.type === 'padplus') && g0.slots[plus0.slot].ci === 5,
      '+1 槽在开放时刻之前不生效');
  }

  // 20) ×2 镀金槽：状态记在骰子上，消除时整段翻倍
  {
    const g = new Game(99, 'dice');
    g.slots.fill(null);
    const x2 = g.pads.find((p) => p.kind === 'x2');
    g.slots[x2.slot] = g.makeBead(1);
    g.drainEvents();
    g.dropAt(x2.slot, 3, g.nozzleOff[0]);            // 4 点
    ok(g.slots[x2.slot].x2 === true, '×2 槽给落点那颗骰子镀金（状态写在骰子上）');
    ok(g.drainEvents().some((e) => e.type === 'padx2'), '×2 槽发了镀金事件');

    // 同一段牌型，一颗镀金 vs 不镀金：基础分不变，整段乘 2
    const run = (gold) => {
      const h = new Game(100, 'dice');
      h.slots.fill(null);
      for (let i = 0; i < 3; i++) h.slots[mod(8 + i, N)] = h.makeBead(3);
      if (gold) h.slots[mod(9, N)].x2 = true;
      h.drainEvents();
      h.resolve(-1, 0);
      return h.drainEvents().find((e) => e.type === 'clear');
    };
    const plain = run(false), gold = run(true);
    ok(plain.base === 480 && gold.base === 480, '镀金不改基础分，只乘倍率');
    ok(gold.gain === plain.gain * 2 && gold.dbl === 2, `一颗镀金骰让整段翻倍（${plain.gain} → ${gold.gain}）`);
    ok(gold.golds === 1, `事件里记了镀金颗数（${gold.golds}）`);
  }

  // 21) 翻面骰：左右邻翻成"合拢后最值钱"的那一点
  //
  // 局面：6 1 [3][3][3] 6 6（方括号是三颗翻面骰）。
  // 清掉中间三颗之后，右边两颗 6 会合拢贴到 1 的右边，
  // 所以最优翻法是翻成 6 —— 立刻凑成 6-6-6。
  // 这条断言正是上面那个 bug 的哨兵：修之前它恒翻成 1 点，chain 只有 1。
  {
    const g = new Game(101, 'dice');
    g.slots.fill(null);
    g.slots[mod(8, N)] = g.makeBead(5);              // 6 点
    g.slots[mod(9, N)] = g.makeBead(0);              // 1 点（左邻）
    for (let i = 0; i < 3; i++) g.slots[mod(10 + i, N)] = g.makeBead(22);   // 3 点翻面骰 ×3
    g.slots[mod(13, N)] = g.makeBead(5);             // 6 点（右邻）
    g.slots[mod(14, N)] = g.makeBead(5);
    const L = g.slots[9], R = g.slots[13];
    g.drainEvents();
    g.resolve(-1, 0);
    const ev = g.drainEvents().find((e) => e.type === 'flipdice');
    ok(ev && ev.pip === 6, `翻成合拢后最值钱的那一点（pip ${ev && ev.pip}）`);
    ok(L.ci === 5 && R.ci === 5, '左右邻真的变成了同一点数（6 点）');
    ok(g.chain >= 2, `翻出来的对子接上了下一段连锁（chain ${g.chain}）`);
  }

  // 22) 铅骰惩罚：只认"真的落空了"的那一发
  //
  // 旋转、拨片、连锁追问都会触发空结算；把它们算成漏发，
  // 玩家会因为"转了个轮盘"被塞铅骰——因果完全对不上。
  {
    const g = new Game(102, 'dice');
    g.slots.fill(null);
    [2, 4, 6].forEach((p, i) => { g.slots[mod(8 + i, N)] = g.makeBead(p - 1); });
    for (let i = 0; i < CFG.blankAt; i++) g.resolve(-1, 0, true);
    ok(g.blanks === 1, `连续 ${CFG.blankAt} 发落空塞一颗铅骰（${g.blanks}）`);
    const tail = g.slots[mod(11, N)];
    ok(tail && tail.ci === RUST, '铅骰接在链条尾巴上');

    const h = new Game(103, 'dice');
    h.slots.fill(null);
    [2, 4, 6].forEach((p, i) => { h.slots[mod(8 + i, N)] = h.makeBead(p - 1); });
    for (let i = 0; i < CFG.blankAt * 3; i++) h.resolve(-1, 0);
    ok(h.blanks === 0 && h.missStreak === 0, '旋转 / 拨片引起的空结算不计漏发');
  }

  // 23) 单喷头：骰子模式也只有一个待发队列
  {
    const g = new Game(104, 'dice');
    ok(g.queues.length === 1, `只有一个待发队列（${g.queues.length}）`);
    ok(g.queues[0].length === 3, `队列仍是三颗预览（${g.queues[0].length}）`);
    ok(g.nozzleCount() === 1, '骰子模式只有一个顶部喷头');
  }

  // 24) 连消续时：chain 2 才给，且有封顶
  {
    const g = new Game(105, 'dice');
    g.slots.fill(null);
    for (let i = 0; i < 6; i++) g.slots[mod(8 + i, N)] = g.makeBead(i < 3 ? 3 : 4);
    g.drainEvents();
    g.resolve(-1, 0);
    const ev = g.drainEvents().find((e) => e.type === 'bonus');
    ok(g.chain === 2 && ev && ev.add === CFG.chainTime[2],
      `chain 2 续时 +${CFG.chainTime[2]}s（${ev && ev.add}）`);
    ok(Math.abs(g.timeLimit() - (CFG.levelTime + g.timeBonus)) < 1e-9,
      `时限 = 关卡时长 + 续时（${g.timeLimit()}）`);

    const h = new Game(106, 'dice');
    h.slots.fill(null);
    for (let i = 0; i < 6; i++) h.slots[mod(8 + i, N)] = h.makeBead(i < 3 ? 3 : 4);
    h.timeBonus = CFG.timeBonusCap - 0.2;
    h.resolve(-1, 0);
    ok(h.timeBonus === CFG.timeBonusCap, `续时有封顶，不会让倒计时变成谎话（${h.timeBonus}）`);
  }
}

// ===============================================================
// 扑克规则族（第八轮）
//
// 守的是设计稿里能逐条核对的硬约定：
//   同花 300 / 四条 1500 / 顺子 700（5 连 2500）/ 同花顺 2000；
//   同花顺点火 7 秒狂热 + 5 秒续时；筹码槽整段 ×2 且三条 / 同花顺送小丑；
//   底牌槽扣下 / 换出；爆破王牌按 A 参与牌型并炸左右各一张；
//   染花牌把左右邻改成同花并接上连锁；暗牌不参与牌型。
//
// 和骰子那一组一样，断言尽量走**真实结算**，而不是直接读数组：
// 计分表、狂热、筹码、染花、底牌都是行为，不是数据结构。
// ===============================================================
{
  const C = (rank, suit) => cardCi(rank, suit);
  const mkPoker = (cards, seed = 200) => {
    const g = new Game(seed, 'poker');
    g.slots.fill(null);
    cards.forEach((ci, i) => {
      if (ci !== null) g.slots[mod(8 + i, N)] = g.makeBead(ci);
    });
    return g;
  };
  const clearOf = (g) => g.drainEvents().find((e) => e.type === 'clear');

  // 25) 开局 + 第一枪
  {
    const g = new Game(200, 'poker');
    const off0 = g.nozzleOff[0];
    ok(g.findMatch() === null, '扑克开局盘面没有现成牌型');
    ok(g.queues[0][0] === C(2, 0), '第一发锁定 ♥Q');
    g.drainEvents();
    g.dropAt(off0, C(2, 0), off0);
    const cl = clearOf(g);
    ok(cl && cl.kind === 'flush' && cl.base === 300,
      `第一枪打出同花 300（${cl && cl.kind} ${cl && cl.base}）`);
  }

  // 26) 计分表：设计稿给的每一个数字
  {
    const h = (cards) => handOfWindow(cards);
    ok(h([C(0, 0), C(2, 0), C(3, 0)]).value === 300, '同花 3 张 = 300');
    ok(h([C(0, 0), C(2, 0), C(3, 0), C(4, 0)]).value === 500, '同花 4 张 = 500');
    ok(h([C(2, 0), C(2, 1), C(2, 2)]).value === 600, '三条 = 600');
    ok(h([C(2, 0), C(2, 1), C(2, 2), C(2, 3)]).value === 1500, '四条 = 1500');
    ok(h([C(0, 0), C(1, 1), C(2, 2)]).value === 700, '顺子 3 张 = 700');
    ok(h([C(0, 0), C(1, 1), C(2, 2), C(3, 3), C(4, 0)]).value === 2500, '5 连大顺 = 2500');
    ok(h([C(0, 0), C(1, 0), C(2, 0)]).kind === 'straightflush'
      && h([C(0, 0), C(1, 0), C(2, 0)]).value === 2000, '同花顺 = 2000');
    ok(h([C(2, 0), C(1, 1), C(0, 2)]).value === 700, '递减顺子 Q-J-10 同样成立');
  }

  // 27) 顺子必须按链上顺序，不是"点数集合连续"
  {
    const h = handOfWindow([C(0, 0), C(4, 1), C(3, 2), C(2, 3), C(1, 0)]);
    ok(h === null, '10-A-K-Q-J 不是顺子（顺序不对）');
  }

  // 28) 小丑：任意花色 + 任意点数
  {
    ok(handOfWindow([C(2, 0), JOKER, C(2, 1)]).kind === 'three', '小丑补三条');
    ok(handOfWindow([C(0, 0), JOKER, C(2, 0)]).kind === 'straightflush', '小丑补同花顺');
    ok(handOfWindow([C(0, 0), C(1, 0), JOKER, C(3, 0)]).kind === 'straightflush',
      '小丑补同花顺的中间空位');
  }

  // 29) 爆破王牌：按 A 参与牌型，再把左右各一张炸掉（每张 +150）
  {
    ok(handOfWindow([ACE_BOMB, C(4, 1), C(4, 2)]).kind === 'three',
      '爆破王牌按 A 参与三条');
    const g = mkPoker([C(0, 0), ACE_BOMB, C(4, 1), C(4, 2), C(2, 3)], 201);
    g.drainEvents();
    g.resolve(-1, 0);
    const cl = clearOf(g);
    ok(cl && cl.kind === 'three' && cl.bombN === 2,
      `爆破王牌炸掉左右各一张（bombN ${cl && cl.bombN}）`);
    ok(cl.len === 5, `整段清掉 5 张（${cl && cl.len}）`);
    ok(cl.base === 600 + 2 * 150, `基础分 = 600 + 2×150（${cl && cl.base}）`);
  }

  // 30) 染花牌：左右邻改成同花，并接上下一段连锁
  {
    const g = new Game(202, 'poker');
    g.slots.fill(null);
    const b = 8;
    g.slots[mod(b, N)] = g.makeBead(C(0, 0));          // 外侧 ♥10
    g.slots[mod(b + 1, N)] = g.makeBead(C(1, 0));      // 左邻 ♥J
    g.slots[mod(b + 2, N)] = g.makeBead(C(0, 1));      // ♠? 三张 10 的牌型
    g.slots[mod(b + 3, N)] = g.makeBead(C(0, 2));
    g.slots[mod(b + 4, N)] = g.makeBead(shiftVariant(C(0, 3)));  // 染花 ♣10
    g.slots[mod(b + 5, N)] = g.makeBead(C(2, 1));      // 右邻 ♦Q
    g.slots[mod(b + 6, N)] = g.makeBead(C(3, 0));      // 外侧 ♥K
    const L = g.slots[mod(b + 1, N)];
    const R = g.slots[mod(b + 5, N)];
    g.drainEvents();
    g.resolve(-1, 0);
    const ev = g.drainEvents().find((e) => e.type === 'shiftsuit');
    ok(ev && ev.suit === 0, `染花牌把邻居染成 ♥（suit ${ev && ev.suit}）`);
    ok(suitOf(L.ci) === 0 && suitOf(R.ci) === 0, '左右邻真的变成了同一花色');
    ok(g.chain >= 2, `染出来的同花接上了连锁（chain ${g.chain}）`);
  }

  // 31) 底牌槽：扣下下一发；再按一次换回
  {
    const g = new Game(203, 'poker');
    const q = g.queues[0];
    const before = q[0];
    g.drainEvents();
    ok(g.holdNext(), '底牌槽可用');
    const ev = g.drainEvents().find((e) => e.type === 'hold');
    ok(g.hold === before && ev && ev.card === before, '第一次按扣下下一发');
    const next = q[0];
    g.holdNext();
    ok(q[0] === before && g.hold === next, '第二次按把底牌换回待发位');
    ok(g.holdUses === 2, `底牌使用次数 +2（${g.holdUses}）`);
  }

  // 32) 筹码槽：整段 ×2；三条 / 同花顺额外送小丑牌
  {
    const build = (time) => {
      const g = new Game(204, 'poker');
      g.slots.fill(null);
      g.time = time;
      g.tempoMult = 1;
      const pad = g.pads.find((p) => p.kind === 'chip');
      for (let i = 0; i < 3; i++) {
        g.slots[mod(pad.slot + i, N)] = g.makeBead(C(2, i));
      }
      g.drainEvents();
      g.resolve(-1, 0);
      return { g, e: clearOf(g) };
    };
    const plain = build(0);
    const chip = build(60);          // 第一个筹码槽 55s 开放
    ok(plain.e.chip === 1 && chip.e.chip === 2, '筹码槽把整段标记为 ×2');
    ok(chip.e.gain === plain.e.gain * 2, `筹码槽让得分翻倍（${plain.e.gain} → ${chip.e.gain}）`);
    ok(chip.g.chipClears === 1 && chip.g.chipJokers === 1, '槽内三条额外送一张小丑牌');
    ok(chip.g.queues[0][0] === WILD, '小丑牌被塞进下一发的待发位');
  }

  // 33) 同花顺 → 7 秒狂热 + 5 秒续时；触发的那一下本身不吃 ×2
  {
    const g = mkPoker([C(0, 0), C(1, 0), C(2, 0)], 205);
    g.drainEvents();
    g.resolve(-1, 0);
    const evs = g.drainEvents();
    const cl = evs.find((e) => e.type === 'clear');
    const fr = evs.find((e) => e.type === 'frenzy');
    ok(cl && cl.kind === 'straightflush' && cl.frenzyMult === 1,
      '同花顺触发的那一下不吃狂热倍率');
    ok(fr && fr.add === 5, `狂热额外续时 5s（${fr && fr.add}）`);
    ok(g.frenzyT === 7 && g.frenzies === 1, `狂热剩余 7s（${g.frenzyT}）`);
    ok(Math.abs(g.timeBonus - 5) < 1e-9, `时限延长 5s（${g.timeBonus}）`);

    // 狂热期内的下一次消除必须 ×2
    g.slots.fill(null);
    [C(0, 0), C(2, 0), C(3, 0)].forEach((ci, i) => {
      g.slots[mod(10 + i, N)] = g.makeBead(ci);
    });
    g.drainEvents();
    g.resolve(-1, 0);
    const cl2 = clearOf(g);
    ok(cl2 && cl2.frenzyMult === 2, `狂热期内消除 ×2（${cl2 && cl2.frenzyMult}）`);
  }

  // 34) 暗牌：不参与牌型；连续 3 发落空塞一张
  {
    ok(handOfWindow([FACE_DOWN, FACE_DOWN, FACE_DOWN]) === null, '三张暗牌不成牌型');
    ok(!isColor(FACE_DOWN), '暗牌不参与匹配');
    const g = mkPoker([C(0, 0), C(2, 1), C(4, 2)], 206);
    for (let i = 0; i < CFG.blankAt; i++) g.resolve(-1, 0, true);
    ok(g.blanks === 1, `连续 ${CFG.blankAt} 发落空塞一张暗牌（${g.blanks}）`);
    ok(g.slots[mod(11, N)] && g.slots[mod(11, N)].ci === RUST, '暗牌接在链条尾巴上');
  }
}

// 35) 单环 + 单喷头：所有模式都回到同一条椭圆环，只有 0 号顶部喷头
{
  for (const id of ['standard', 'mini', 'grand', 'dice', 'poker']) {
    const g = new Game(9200, id);
    ok(g.mode.layout === 1, `${id}：layout = 1`);
    ok(g.nozzleOff.length === 1 && g.nozzleOff[0] === 0, `${id}：只有 0 号顶部喷头`);
    ok(g.queues.length === 1, `${id}：只有一个待发队列`);
    ok(g.nozzleCount() === 1, `${id}：nozzleCount = 1`);
    ok(!g.mode.geo.rule, `${id}：不再使用拓扑变体`);
  }
}

// 36) 两种出球模式：定时 / 音乐节拍
{
  ok(Math.abs(musicBpmAt(0) - 88) < 1e-9 && Math.abs(musicBpmAt(1) - 148) < 1e-9,
    '音乐 BPM 曲线从 88 走到 148');

  const t = new Game(9300, 'standard', 'timer');
  t.step(1 / 120);
  ok(t.fireMode === 'timer' && t.musicBpm === 0, '定时模式不产生音乐 BPM');

  const m = new Game(9301, 'standard', 'music');
  m.step(1 / 120);
  ok(m.fireMode === 'music' && m.musicBpm >= 88 && m.musicBpm <= 89,
    `音乐模式起手 BPM ≈ 88（${m.musicBpm.toFixed(1)}）`);
  ok(Math.abs(m.beat - 2 * 60 / m.musicBpm) < 1e-9,
    `音乐模式颗间隔 = 半小节（${m.beat.toFixed(2)}s）`);

  // 用机器人跑 30 秒，量出球间隔确实随 BPM 变快变慢。
  const r = new Game(9302, 'standard', 'music');
  const fires = [];
  for (let f = 0; f < 120 * 30; f++) {
    r.setInput(botInput(r));
    r.step(1 / 120);
    for (const e of r.drainEvents()) if (e.type === 'fire') fires.push(r.time);
    if (r.dead) break;
  }
  const gaps = fires.slice(1).map((x, i) => x - fires[i]);
  ok(gaps.length >= 5, `音乐模式 30 秒内出球 ${gaps.length + 1} 次`);
  ok(gaps.length > 1 && Math.max(...gaps) - Math.min(...gaps) > 0.08,
    `出球间隔有快慢（${Math.min(...gaps).toFixed(2)} ~ ${Math.max(...gaps).toFixed(2)}s）`);
  ok(m.musicBeatPhase >= 0 && m.musicBeatPhase < 1, '拍相位在 [0,1)');
  ok(t.musicBeatPhase === 0, '定时模式拍相位为 0');
}

// 37) 四层音画映射：角度档位 → 五声音阶音高 + 声像
{
  ok(AIM_FREQS.length === 7, '角度档位是 7 个');
  ok(aimFreqStep(0) === 261.63 && aimFreqStep(3) === 392.00 && aimFreqStep(6) === 659.25,
    '两端 C4 / 中心 G4 / 右端 E5');
  ok(Math.abs(aimPanStep(0) + 0.65) < 1e-9 && Math.abs(aimPanStep(3)) < 1e-9
    && Math.abs(aimPanStep(6) - 0.65) < 1e-9, '声像 -0.65 / 0 / +0.65');

  const g = new Game(9400, 'standard');
  g.setInput(1);
  g.v = CFG.vMax;
  g.step(1 / 120);
  ok(g.aimStep === 6, `右满舵 → 第 6 档（${g.aimStep}）`);
  g.fire();
  const fe = g.drainEvents().find((e) => e.type === 'fire');
  ok(fe && fe.root === 659.25 && Math.abs(fe.pan - 0.65) < 1e-9,
    '开火事件带右端音高和右声像');

  g.slots.fill(null);
  [0, 0, 0].forEach((ci, i) => { g.slots[4 + i] = g.makeBead(ci); });
  g.drainEvents();
  g.resolve(-1, 0, false);
  const ce = g.drainEvents().find((e) => e.type === 'clear');
  ok(ce && ce.root === 659.25 && Math.abs(ce.pan - 0.65) < 1e-9,
    '消除事件沿用上一发的根音与声像');
}

console.log(bad ? `\n失败 ${bad} 项` : '\n全部通过');
process.exit(bad ? 1 : 0);
