// 无头物理稳定性、50-72人大潮、限量人池、撤回与策略分工回归测试：node test.mjs
import { World, DT, LEVELS, BODY_TYPES, TRAIN, DOOR_BAR_XS } from './src/physics.js';

let bad = 0;
const ok = (cond, msg) => {
  if (!cond) { bad++; console.log('  ✗ ' + msg); }
  else console.log('  ✓ ' + msg);
};

const stepSec = (w, sec) => {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) w.step(DT);
};

// 1) 5 种体型物理分工与建筑协同参数
{
  const fat = BODY_TYPES.find((t) => t.id === 'fat');
  const thin = BODY_TYPES.find((t) => t.id === 'thin');
  const tall = BODY_TYPES.find((t) => t.id === 'tall');
  const acro = BODY_TYPES.find((t) => t.id === 'acrobat');
  ok(fat.mass > thin.mass * 4, `胖叔显著重于瘦猴（${fat.mass} vs ${thin.mass}）`);
  ok(fat.roofFric > thin.roofFric * 2, `胖叔车顶防滑摩擦远强于瘦猴（${fat.roofFric} vs ${thin.roofFric}）`);
  ok(fat.shoulderBoost > 1.3, `胖叔提供宽肩邻人抓力加成（×${fat.shoulderBoost}）`);
  ok(tall.bone > thin.bone * 2.2 && tall.gripRange >= 80, `竹竿高且超长臂展（bone=${tall.bone}, range=${tall.gripRange}）`);
  ok(acro.sideCling && !fat.sideCling && !thin.sideCling, '挂壁娃独占车厢侧门外挂能力');
}

// 2) 站台限量大潮（50 / 60 / 72）+ Z 键撤回退回人池
{
  const totals = LEVELS.map((lv) => Object.values(lv.pool).reduce((a, b) => a + b, 0));
  ok(totals.join('/') === '50/60/72', `三关站台人池扩大为 50/60/72（实测 ${totals.join('/')}）`);

  const w = new World('rush1', 101);
  const thinQuota = w.pool.thin;
  w.squadFilter = 'thin';
  w.burstSize = 5;
  const n1 = w.launchAt(0, TRAIN.roofY - 30);
  ok(n1 === 5 && w.pool.thin === thinQuota - 5, `投放 5 名瘦猴后余量准确扣除（剩 ${w.pool.thin}）`);
  const undone = w.undoLastBatch();
  ok(undone === 5 && w.pool.thin === thinQuota && w.people.length === 0, `Z 键一键撤回 5 人并原封退回人池`);

  // 验证单体型不能突破配额无限刷
  let launched = 0;
  for (let i = 0; i < 8; i++) {
    if (w.squadFilter !== 'thin') break;
    launched += w.launchAt(-160 + i * 45, TRAIN.roofY - 30);
  }
  ok(launched === thinQuota && w.pool.thin === 0 && w.squadFilter === 'mix', `瘦猴耗尽配额(${thinQuota})后锁定并自动切回混编`);
}

// 3) 挂壁娃贴车门外扶手，完全免疫低矮涵洞削顶！
{
  const w = new World('tunnel2', 309);
  w.squadFilter = 'acrobat';
  w.burstSize = 1;
  w.launchAt(DOOR_BAR_XS[0], -92);
  w.launchAt(DOOR_BAR_XS[1], -92);
  stepSec(w, 0.35);
  const sideClingers = w.people.filter((p) => p.onSideWall && !p.fallen).length;
  ok(sideClingers === 2, `挂壁娃成功贴挂在两扇车厢侧门扶手上（${sideClingers}/2）`);
  w.depart();
  let bonks = 0;
  for (let f = 0; f < 120 * 35 && w.phase === 'running'; f++) {
    w.step(DT);
    for (const e of w.drainEvents()) if (e.type === 'bonk') bonks++;
  }
  ok(bonks === 0 && w.finalCount === 2, `侧门外挂壁娃 100% 免疫两座低矮涵洞并安全到站（撞洞 ${bonks}，到站 ${w.finalCount}/2）`);
}

// 4) 第 1 关 50 人大潮压测 + 终点急刹预警触发 + 到站结算
{
  const w = new World('rush1', 202);
  w.burstSize = 5;
  w.squadFilter = 'mix';
  for (let i = 0; i < 12; i++) {
    const x = -200 + (i % 5) * 100;
    const y = i < 5 ? TRAIN.roofY - 28 : TRAIN.roofY - 82;
    w.launchAt(x, y);
    stepSec(w, 0.22);
  }
  ok(w.poolTotal() === 0, '可将站台全部 50 人一口气装上车');
  stepSec(w, 0.7);
  const beforeDepart = w.onBoardCount();
  ok(beforeDepart >= 28, `50 人大潮站台稳住人数可观（发车前 ${beforeDepart} 人）`);

  w.depart();
  let brakeEvent = false;
  const tStart = w.time;
  for (let f = 0; f < 120 * 35 && w.phase === 'running'; f++) {
    w.step(DT);
    for (const e of w.drainEvents()) if (e.type === 'braking') brakeEvent = true;
  }
  const runDur = w.time - tStart;
  ok(brakeEvent, '列车进入终点刹车段正确触发急刹预警事件');
  ok(w.phase === 'arrived' && runDur >= 11 && runDur <= 17, `第 1 关顺利到站（用时 ${runDur.toFixed(1)}s，运达 ${w.finalCount}/${beforeDepart} 人）`);
  const finite = w.people.every((p) => Number.isFinite(p.p0.x) && Number.isFinite(p.p0.y));
  ok(finite, '50 人同框加速与猛刹全程零物理爆炸 / NaN');
}

// 5) 第 2 关涵洞削顶与缩头保人
{
  const runTunnel = (crouch) => {
    const w = new World('tunnel2', 303);
    w.burstSize = 1;
    w.squadFilter = 'tall';
    for (let i = 0; i < 4; i++) {
      w.launchAt(-60 + i * 40, TRAIN.roofY - 35);
      stepSec(w, 0.22);
    }
    for (let i = 0; i < 3; i++) {
      w.launchAt(-40 + i * 40, TRAIN.roofY - 125);
      stepSec(w, 0.22);
    }
    stepSec(w, 0.5);
    w.depart();
    let bonks = 0;
    const t0 = w.time;
    for (let f = 0; f < 120 * 35 && w.phase === 'running'; f++) {
      w.crouching = crouch && Boolean(w.tunnelAlert && w.tunnelAlert.dist < 180);
      w.step(DT);
      for (const e of w.drainEvents()) if (e.type === 'bonk') bonks++;
    }
    return { survived: w.onBoardCount(), bonks, dur: w.time - t0 };
  };

  const stand = runTunnel(false);
  const duck = runTunnel(true);
  ok(stand.dur >= 15 && stand.dur <= 21, `第 2 关行车时长落在 15~21s（实测 ${stand.dur.toFixed(1)}s）`);
  ok(stand.bonks > 0 && duck.survived > stand.survived, `缩头躲涵洞优势显著（缩头剩 ${duck.survived} vs 站直剩 ${stand.survived}，站直撞顶 ${stand.bonks} 次）`);
}

// 6) 第 3 关 72 人极限池全塞压测无性能/NaN 异常
{
  const w = new World('chaos3', 505);
  w.burstSize = 5;
  for (let i = 0; i < 16; i++) {
    w.launchAt(-210 + (i % 6) * 84, i < 6 ? TRAIN.roofY - 26 : TRAIN.roofY - 84);
    stepSec(w, 0.16);
  }
  ok(w.poolTotal() === 0, '第 3 关全部 72 人可完整投入舞台');
  w.depart();
  const t0 = w.time;
  for (let f = 0; f < 120 * 40 && w.phase === 'running'; f++) w.step(DT);
  const dur = w.time - t0;
  const finite = w.people.every((p) => Number.isFinite(p.p0.x) && Number.isFinite(p.p0.y));
  ok(w.phase === 'arrived' && finite && dur >= 18 && dur <= 26, `第 3 关 72 人大潮全程无异常到站（用时 ${dur.toFixed(1)}s，运达 ${w.finalCount} 人）`);
}

console.log(bad ? `\n失败 ${bad} 项` : '\n全部测试通过 ✓');
process.exit(bad ? 1 : 0);
