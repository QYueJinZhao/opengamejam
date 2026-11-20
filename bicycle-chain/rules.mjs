import { Game, CFG, WILD, BOMB, RUST, isColor } from './src/sim.js';
import { N, mod } from './src/geom.js';
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

// 5) 锈球：不能自己凑三消
{
  const g = new Game(15, 'standard');
  g.slots.fill(null);
  for (let i = 0; i < 4; i++) g.slots[mod(10 + i, N)] = g.makeBead(RUST);
  g.resolve(-1, 0);
  ok(g.occupied() === 4, `4 颗相邻锈球不会被消掉（剩 ${g.occupied()}）`);
}

// 6) 珠子补位：恒定速度推进，不是"固定时间、按比例衰减"
//
// 这一条守的是观感，不是数值。上一版用 dx *= exp(-26dt)，位移大的珠子初速极高、
// 位移小的慢慢晃，但它们在**同一时刻**停下——一整列珠子同时归位。
// 改成恒速后，dx 每秒固定减 dxSpeed 格：挪得远就滑得久。
{
  const g = new Game(16, 'standard');
  g.slots.fill(null);
  g.slots[5] = g.makeBead(0);

  g.slots[5].dx = 3.5;
  g.step(1 / CFG.dxSpeed);                 // 一个"格时长"应该正好走掉 1 格
  ok(Math.abs(g.slots[5].dx - 2.5) < 1e-9, `补位按固定速度推进（3.5 → ${g.slots[5].dx.toFixed(3)}）`);

  g.slots[5].dx = 0.4;
  g.step(1 / CFG.dxSpeed);                 // 剩余不足一格：一次走完，不能越过 0
  ok(g.slots[5].dx === 0, '不足一格时一次归位，不会越界成反向偏移');

  // 位移越大耗时越久——这正是"指数衰减"做不到的
  const timeToSettle = (dx) => {
    const h = new Game(16, 'standard');
    h.slots.fill(null);
    h.slots[5] = h.makeBead(0);
    h.slots[5].dx = dx;
    let t = 0;
    while (h.slots[5].dx !== 0 && t < 5) { h.step(1 / 120); t += 1 / 120; }
    return t;
  };
  const t1 = timeToSettle(1), t4 = timeToSettle(4);
  ok(t4 > t1 * 3.2, `挪 4 格比挪 1 格明显更久（${t1.toFixed(2)}s vs ${t4.toFixed(2)}s）`);
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

console.log(bad ? `\n失败 ${bad} 项` : '\n全部通过');
process.exit(bad ? 1 : 0);
