// 《超载快车》抖音小游戏 V3 高留存首发版 — 全量无头回归测试 + 90 人同屏性能压测
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { World, DT, BODY_TYPES, TRAIN, DOOR_BAR_XS } from './src/physics.js';
import {
  LEVELS, PASSENGER_META, ENDLESS_PERKS, UPGRADES, TRAIN_SKINS, SKILL_FAIL_LINES, ACHIEVEMENTS,
  buildDailyLevel, buildEndlessLevel, buildStrictQueueLevel, pickFunnyTitle, evaluateHighlightScore,
} from './src/levels.js';
import { ProgressStore } from './src/progress.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function stepSeconds(world, sec) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) world.step(DT);
}

function assertNoNaN(world) {
  assert.ok(Number.isFinite(world.trainX) && Number.isFinite(world.speed) && Number.isFinite(world.tilt), 'train finite');
  for (const p of world.people) {
    assert.ok(
      Number.isFinite(p.p0.x) && Number.isFinite(p.p0.y) && Number.isFinite(p.p1.x) && Number.isFinite(p.p1.y),
      `person ${p.id} finite`
    );
  }
}

function makeMockPlatform() {
  const mem = new Map();
  return {
    getStorage: (k, fb) => (mem.has(k) ? mem.get(k) : fb),
    setStorage: (k, v) => mem.set(k, v),
  };
}

console.log('=== 《超载快车 · 抖音小游戏 V3》全量物理/养成/肉鸽/性能回归测试 ===');

test('6 种体型特征短签与物理区分度完整（只说特征不剧透）', () => {
  assert.equal(BODY_TYPES.length, 6);
  const byId = Object.fromEntries(BODY_TYPES.map((t) => [t.id, t]));
  assert.equal(PASSENGER_META.thin.feature, '轻飘飘');
  assert.equal(PASSENGER_META.fat.feature, '吨位惊人');
  assert.equal(PASSENGER_META.acrobat.feature, '爱扒车门');
  assert.equal(PASSENGER_META.tall.feature, '胳膊巨长');
  assert.equal(PASSENGER_META.auntie.feature, '拎俩大菜篮');
  assert.equal(PASSENGER_META.vip.feature, '一身金贵');
  assert.equal(byId.auntie.basketCatch, true, '大妈具备方案A双菜篮兜底安全网');
  assert.equal(byId.tall.crouchShrink, 0.65, '竹竿缩头压低 65%');
  assert.equal(byId.vip.scoreWeight, 3, 'VIP 老板 1 人顶 3 分');
  assert.deepEqual(DOOR_BAR_XS, [-124, 124]);
});

test('10 关逐类解锁与顺滑机制时机配置准确（L1无桥无缩头、L2出桥+撤回、L3出×3、L5首阵风、L6首红灯+VIP）', () => {
  assert.equal(LEVELS.length, 10);
  assert.deepEqual(LEVELS[0].unlockedTypes, ['thin']);
  assert.equal(LEVELS[0].tunnels.length, 0, '第 1 关无高度限制（0 座桥洞）');
  assert.equal(LEVELS[0].showCrouch, false, '第 1 关暂隐藏缩头键');
  assert.equal(LEVELS[0].showUndo, false);
  assert.deepEqual(LEVELS[0].bursts, [1]);

  assert.deepEqual(LEVELS[1].unlockedTypes, ['thin', 'fat']);
  assert.equal(LEVELS[1].showCrouch, true, '第 2 关首次遇桥解锁缩头');
  assert.equal(LEVELS[1].showUndo, true, '第 2 关解锁撤回');
  assert.equal(LEVELS[1].tunnels.length, 1);

  assert.deepEqual(LEVELS[2].unlockedTypes, ['thin', 'fat', 'acrobat']);
  assert.deepEqual(LEVELS[2].bursts, [1, 3], '第 3 关提前解锁 ×3 齐扑');

  assert.deepEqual(LEVELS[3].unlockedTypes, ['thin', 'fat', 'acrobat', 'tall']);
  assert.deepEqual(LEVELS[4].unlockedTypes, ['thin', 'fat', 'acrobat', 'tall', 'auntie']);
  assert.ok(LEVELS[4].winds.length >= 1, '第 5 关提前引入首段强阵风配合大妈菜篮');

  assert.equal(LEVELS[5].newType, 'vip', '第 6 关引入 VIP 老板消灭空窗期');
  assert.ok(LEVELS[5].midStops.length >= 1, '第 6 关引入首次中途红灯急停');

  assert.equal(Object.values(LEVELS[9].pool).reduce((a, b) => a + b, 0), 90);
  assert.ok(LEVELS.every((lv) => Array.isArray(lv.intel) && lv.intel.length >= 2), '每关均有路况情报');
  assert.ok(Object.values(PASSENGER_META).every((m) => Array.isArray(m.voiceLines) && m.voiceLines.length >= 3), '6 类角色均配专属台词');
});

test('大妈方案 A：双侧巨型菜篮真实兜住滑落/下坠的轻量乘客', () => {
  const w = new World('s5', 55);
  w.squadFilter = 'auntie';
  w.burstSize = 1;
  w.launchAt(0, TRAIN.roofY - 12);
  stepSeconds(w, 0.45);
  const auntie = w.people.find((p) => p.typeId === 'auntie');
  assert.ok(auntie && !auntie.fallen, '大妈稳站车顶');

  // 投放一名瘦猴在大妈右侧菜篮上方并清掉其初始抓手模拟滑坠
  w.squadFilter = 'thin';
  w.launchAt(auntie.p0.x + 23, auntie.p0.y - 26);
  stepSeconds(w, 0.20);
  const thin = w.people.find((p) => p.typeId === 'thin');
  thin.grips.length = 0;
  thin.p0.x = auntie.p0.x + 23;
  thin.p0.y = auntie.p0.y - 16;
  thin.p0.oy = thin.p0.y - 2.0; // 向下滑坠速度

  let caughtEv = false;
  for (let i = 0; i < 60; i++) {
    w.step(DT);
    for (const ev of w.drainEvents()) {
      if (ev.type === 'basketCatch') caughtEv = true;
    }
  }
  assert.equal(caughtEv, true, '应触发大妈菜篮兜底事件');
  assert.ok(w.basketCatchCount >= 1, 'basketCatchCount >= 1');
  assert.ok(thin.grips.some((g) => g.kind === 'basket'), '瘦猴应被锁入菜篮抓扣');
  assertNoNaN(w);
});

test('VIP 老板 1 人顶 3 分计分与发车快照重跑', () => {
  const w = new World('s6', 71);
  w.squadFilter = 'fat';
  w.burstSize = 3;
  w.launchAt(0, TRAIN.roofY - 12);
  stepSeconds(w, 0.35);
  w.squadFilter = 'vip';
  w.burstSize = 1;
  w.launchAt(-20, TRAIN.roofY - 56);
  w.launchAt(20, TRAIN.roofY - 56);
  stepSeconds(w, 0.35);

  assert.equal(w.onBoardCount(), 5);
  assert.equal(w.onBoardScore(), 3 + 2 * 3, '3胖叔 + 2VIP = 9 分');

  w.depart();
  let t = 0;
  let midStopHit = false;
  while (w.phase === 'running' && t < 35) {
    w.crouching = Boolean(w.tunnelAlert && w.tunnelAlert.dist < 140 && w.tunnelAlert.dist > -w.tunnelAlert.len - TRAIN.halfW * 2);
    w.step(DT);
    for (const ev of w.drainEvents()) {
      if (ev.type === 'midStop') midStopHit = true;
    }
    t += DT;
  }
  assert.equal(midStopHit, true, '第 6 关应触发中途红灯急停事件');
  assert.equal(w.phase, 'arrived');

  // 快照原班人马重跑（带防滑气囊护盾！）
  assert.equal(w.retryFromDepartSnapshot({ withShield: true }), true);
  assert.equal(w.gear.superGrip, true);
  assert.equal(w.gear.airbagCharges, 1);
  assert.equal(w.onBoardCount(), 5);
  assert.equal(w.onBoardScore(), 9);
  assertNoNaN(w);
});

test('竹竿动态主动捞人：86px 内没抓稳的乘客自动被长臂紫绳拉牢', () => {
  const w = new World('s4', 44);
  w.squadFilter = 'tall';
  w.burstSize = 1;
  w.launchAt(0, TRAIN.roofY - 12);
  stepSeconds(w, 0.35);
  w.squadFilter = 'thin';
  w.launchAt(48, TRAIN.roofY - 16);
  stepSeconds(w, 0.2);
  const tall = w.people.find((p) => p.typeId === 'tall');
  const thin = w.people.find((p) => p.typeId === 'thin');
  // 模拟瘦猴脱手
  thin.grips.length = 0;
  tall.grips.length = Math.min(tall.grips.length, 1);
  stepSeconds(w, 0.1);
  assert.ok(tall.grips.some((g) => g.targetId === thin.id), '竹竿应主动伸出长臂拽住脱手瘦猴');
  assertNoNaN(w);
});

test('第 5/7 关迎面强阵风区 & 开局神装安全气囊保命 1 次', () => {
  const w = new World('s7', 61, { gear: { superGrip: true, airbag: true } });
  w.squadFilter = 'fat';
  w.burstSize = 3;
  w.launchAt(0, TRAIN.roofY - 12);
  stepSeconds(w, 0.35);
  w.squadFilter = 'tall';
  w.burstSize = 3;
  w.launchAt(0, TRAIN.roofY - 82);
  stepSeconds(w, 0.35);
  w.depart();

  let sawWind = false;
  let airbagUsed = false;
  let t = 0;
  while (w.phase === 'running' && t < 35) {
    if (w.activeWind) sawWind = true;
    w.step(DT);
    for (const ev of w.drainEvents()) {
      if (ev.type === 'airbag') airbagUsed = true;
    }
    t += DT;
  }
  assert.equal(w.phase, 'arrived');
  assert.equal(sawWind, true, '第 7 关应进入迎面阵风区');
  assert.equal(airbagUsed, true, '高堆竹竿不缩头撞洞时应触发安全气囊保命');
  assertNoNaN(w);
});

test('存档成长系统：B 级解锁下站、过第 5 关解锁无尽、3 项车队升级、5 套涂装与侧边栏单日限领', () => {
  const store = new ProgressStore(makeMockPlatform());
  assert.equal(store.isLevelUnlocked(0), true);
  assert.equal(store.isLevelUnlocked(1), false);
  assert.equal(store.isEndlessUnlocked(), false);

  for (let i = 0; i < 5; i++) {
    store.recordRunResult(LEVELS[i], LEVELS[i].targets[1], 'A', 20);
  }
  assert.equal(store.isLevelUnlocked(5), true, '过前 5 关应解锁第 6 关');
  assert.equal(store.isEndlessUnlocked(), true, '过第 5 关应解锁无尽专列');
  assert.ok(store.data.tickets >= 100, '累计车票足以购买升级');
  assert.equal(store.buyUpgrade('gripPaint').ok, true);
  assert.equal(store.getUpgradeBonus().fricBonus, 0.04);
  assert.equal(store.isSkinUnlocked('green'), true, '累计运达 100 人应解锁复古绿皮快车');
  assert.equal(store.equipSkin('green'), true);
  assert.equal(store.getActiveSkin().id, 'green');
  assert.equal(store.canClaimSidebarToday(), true);
  store.markSidebarClaimedToday();
  assert.equal(store.canClaimSidebarToday(), false);
  assert.equal(UPGRADES.length, 3);
  assert.equal(TRAIN_SKINS.length, 6);

  // 今日 3 项小目标与桌面快捷方式奖励（防重复领取）
  assert.equal(store.hasUnclaimedMission(), false);
  store.recordDailyMissionProgress({ alive: 22, passed: true, boosted: true, isStrictQueue: true });
  assert.equal(store.hasUnclaimedMission(), true);
  const tBefore = store.data.tickets;
  const c1 = store.claimMission('deliver_20');
  assert.equal(c1.ok, true);
  assert.equal(store.claimMission('deliver_20').ok, false, '同一任务不可重复领取');
  assert.equal(store.claimMission('boost_win').ok, true);
  assert.equal(store.claimMission('strict_play').ok, true);
  assert.equal(store.data.tickets, tBefore + 25 + 30 + 35, '今日 3 项小目标共领 90 车票');
  assert.equal(store.hasUnclaimedMission(), false);
  assert.equal(store.claimShortcutReward(40), true);
  assert.equal(store.claimShortcutReward(40), false, '桌面快捷方式奖励不可重复领取');
});

test('轻量无尽专列肉鸽：存活乘客无缝跨站保留 + 8 词条生效 + 每日专列确定性同图', () => {
  assert.equal(ENDLESS_PERKS.length, 8);
  const d1 = buildDailyLevel('20261123');
  const d2 = buildDailyLevel('20261123');
  assert.equal(d1.name, d2.name);
  assert.equal(d1.dailySeed, d2.dailySeed);

  const w = new World(buildEndlessLevel(1), 888);
  w.squadFilter = 'fat';
  w.burstSize = 5;
  w.launchAt(-60, TRAIN.roofY - 12);
  w.launchAt(60, TRAIN.roofY - 12);
  stepSeconds(w, 0.45);
  w.depart();
  let t = 0;
  while (w.phase === 'running' && t < 35) {
    w.crouching = Boolean(w.tunnelAlert && w.tunnelAlert.dist < 140 && w.tunnelAlert.dist > -w.tunnelAlert.len - TRAIN.halfW * 2);
    w.step(DT);
    t += DT;
  }
  assert.equal(w.phase, 'arrived');
  const survivedW1 = w.finalCount;
  assert.ok(survivedW1 >= 6, `无尽第 1 站存活 ${survivedW1} 人`);

  // 选「门外加塞」词条进第 2 站：存活者应全部保留 + 候车池新增挂壁娃
  const acroBefore = w.pool.acrobat;
  w.continueEndlessWave(buildEndlessLevel(2), 'doorRush');
  assert.equal(w.phase, 'loading');
  assert.equal(w.onBoardCount(), survivedW1 + 5, '上一站存活者保留，并立即空降5名挂壁娃上车');
  assert.equal(w.pool.acrobat, acroBefore + buildEndlessLevel(2).pool.acrobat, '空降不消耗或占用普通候车池');

  w.depart();
  t = 0;
  while (w.phase === 'running' && t < 35) {
    w.crouching = Boolean(w.tunnelAlert && w.tunnelAlert.dist < 140 && w.tunnelAlert.dist > -w.tunnelAlert.len - TRAIN.halfW * 2);
    w.step(DT);
    t += DT;
  }
  assert.equal(w.phase, 'arrived');
  assert.ok(typeof pickFunnyTitle(w) === 'string' && pickFunnyTitle(w).length > 3);
  assertNoNaN(w);
});

test('10 关全部跑通且第 10 关 90 人场景单步耗时 < 1.2ms', () => {
  for (let idx = 0; idx < LEVELS.length; idx++) {
    const lv = LEVELS[idx];
    const w = new World(lv, 500 + idx);
    w.squadFilter = lv.unlockedTypes[0];
    w.burstSize = lv.bursts[lv.bursts.length - 1];
    w.launchAt(-80, TRAIN.roofY - 12);
    w.launchAt(80, TRAIN.roofY - 12);
    stepSeconds(w, 0.35);
    w.depart();
    let t = 0;
    while (w.phase === 'running' && t < 45) {
      w.crouching = Boolean(w.tunnelAlert && w.tunnelAlert.dist < 140 && w.tunnelAlert.dist > -w.tunnelAlert.len - TRAIN.halfW * 2);
      w.step(DT);
      t += DT;
    }
    assert.equal(w.phase, 'arrived', `${lv.id} 应正常到达终点`);
    assert.ok(t >= 9 && t <= 34, `${lv.id} 行车耗时 ${t.toFixed(1)}s 合理`);
    assertNoNaN(w);
  }

  // 第 10 关 90 人全员上车零 GC 性能压测
  const heavy = new World('s10', 999);
  heavy.squadFilter = 'mix';
  heavy.burstSize = 5;
  for (let i = 0; i < 18; i++) {
    const x = -220 + (i % 6) * 86;
    const y = TRAIN.roofY - 18 - Math.floor(i / 6) * 44;
    heavy.launchAt(x, y);
  }
  stepSeconds(heavy, 0.4);
  heavy.depart();

  const STEPS = 300;
  const t0 = performance.now();
  for (let i = 0; i < STEPS; i++) heavy.step(DT);
  const avgMs = (performance.now() - t0) / STEPS;
  assert.ok(avgMs < 1.2, `90 人场景单步耗时 ${avgMs.toFixed(3)}ms 应 < 1.2ms`);
  assertNoNaN(heavy);
  console.log(`    (90人同屏压测平均单步耗时: ${avgMs.toFixed(3)} ms)`);
});

test('真实排队队伍 stationLine：默认按排队登车、随机一簇一簇队列、屏外进场迈步与撤回还原', () => {
  const w = new World('s10', 1001);
  assert.equal(w.squadFilter, 'mix', '普通关卡默认应按排队顺序(mix)登车而非锁定某一种人');
  assert.equal(w.stationLine.length, 90, '第10关应有90名真实排队候车人物');
  assert.equal(w.stationLine.length, w.poolTotal());
  const offscreenCount = w.stationLine.filter((m) => m.x < -600).length;
  assert.ok(offscreenCount >= 20, `人太多时应有大量单排排队者在屏幕左侧外候场（实际 ${offscreenCount} 人）`);
  assert.ok(w.stationLine.every((m) => m.row === 0), '长单排一字排开模式所有人均在统一单排(row=0)，绝不跳行');
  assert.equal(w.stationLine[0].x, -40, '排头应向左侧站台靠拢至 x=-40');

  // 统计连续同类型簇长度，验证“随机且偏一簇一簇来”（非纯单人交替，也非整块死板分组）
  let runs = 1;
  for (let i = 1; i < w.queue.length; i++) {
    if (w.queue[i] !== w.queue[i - 1]) runs++;
  }
  const avgCluster = w.queue.length / runs;
  assert.ok(avgCluster >= 1.5 && avgCluster <= 3.6, `平均簇长应在 1.5~3.6 之间（实际 ${avgCluster.toFixed(2)}）`);

  // 不同 seed 队列随机性不同
  const wDiff = new World('s10', 2002);
  assert.notEqual(w.queue.slice(0, 12).join(','), wDiff.queue.slice(0, 12).join(','), '不同局排队顺序应具备强随机性');

  // 默认 mix 下直接投放，应严格按队头顺序上车
  const expectFirst3 = w.queue.slice(0, 3);
  w.burstSize = 3;
  assert.equal(w.launchAt(0, TRAIN.roofY - 12), 3);
  assert.deepEqual(w.people.slice(0, 3).map((p) => p.typeId), expectFirst3, '默认模式下应严格按队头顺序登车');
  w.undoLastBatch();
  assert.equal(w.stationLine.length, 90);

  const tailBefore = w.stationLine[w.stationLine.length - 1].x;
  w.squadFilter = 'fat';
  w.burstSize = 3;
  const launched = w.launchAt(0, TRAIN.roofY - 12);
  assert.equal(launched, 3);
  assert.equal(w.stationLine.length, 87, '丢上车顶3人后排队队伍即时移除3人');
  assert.equal(w.stationLine.length, w.poolTotal());

  // 步进 0.8s，后面排队员应大步向前补位（屏幕外的人陆续走进屏幕）
  stepSeconds(w, 0.8);
  const tailAfter = w.stationLine[w.stationLine.length - 1].x;
  assert.ok(tailAfter > tailBefore + 40, `后面排队员应向前迈进补位（${tailBefore} -> ${tailAfter}）`);

  // 撤回刚上车的一批，排队队伍应准确还原人数
  w.undoLastBatch();
  assert.equal(w.stationLine.length, 90, '撤回后排队人数准确恢复');
  assert.equal(w.stationLine.length, w.poolTotal());
  assertNoNaN(w);
});

test('手动加速与胜利欢呼：按住加速极速冲刺更快到站，过关到站全员欢呼', () => {
  const runOnce = (boost) => {
    const w = new World('s1', 123);
    w.squadFilter = 'thin';
    w.burstSize = 1;
    // 放足 10 名瘦猴确保超过 s1 的 B 级过关线（8分）
    for (let i = 0; i < 10; i++) {
      w.launchAt(-120 + i * 26, TRAIN.roofY - 12);
    }
    stepSeconds(w, 0.45);
    w.depart();
    let t = 0;
    let maxSpd = 0;
    while (w.phase === 'running' && t < 35) {
      w.crouching = Boolean(w.tunnelAlert && w.tunnelAlert.dist < 140 && w.tunnelAlert.dist > -w.tunnelAlert.len - TRAIN.halfW * 2);
      w.boosting = boost && !w.crouching;
      w.step(DT);
      if (w.speed > maxSpd) maxSpd = w.speed;
      t += DT;
    }
    // 站内停留 0.3s 触发欢呼态
    stepSeconds(w, 0.3);
    return { w, t, maxSpd };
  };

  const normal = runOnce(false);
  const fast = runOnce(true);
  assert.equal(normal.w.phase, 'arrived');
  assert.equal(fast.w.phase, 'arrived');
  assert.ok(fast.maxSpd > normal.w.level.maxSpeed * 1.18, `手动加速最高速 ${fast.maxSpd.toFixed(1)} 应远高于普通巡航 ${normal.w.level.maxSpeed}`);
  assert.ok(fast.t < normal.t - 1.2, `手动加速用时 ${fast.t.toFixed(2)}s 应明显快于普通巡航 ${normal.t.toFixed(2)}s`);
  assert.ok(fast.w.boostTime >= 2.0, `加速累计时长应被记录（${fast.w.boostTime.toFixed(2)}s）`);
  const bonus = fast.w.getBoostBonusTickets(25);
  assert.ok(bonus >= 3, `有效加速过关应获得额外冲刺车票激励（实际 +${bonus}）`);
  assert.equal(normal.w.getBoostBonusTickets(25), 0, '未加速不应领取冲刺车票');

  const survivors = normal.w.people.filter((p) => !p.fallen);
  assert.ok(survivors.length >= 8, `第1关过关应至少存活8人（实际 ${survivors.length}）`);
  assert.ok(survivors.every((p) => p.mood === 'cheer'), '过关到站后所有存活乘客应切换为 cheer 欢呼状态');
  assertNoNaN(fast.w);
});

test('左右分流专列（禁点车顶）与角色技能失败搞笑事件', () => {
  const lv = buildStrictQueueLevel('20261123');
  assert.equal(lv.strictQueue, true);
  const w = new World(lv, 777);
  const first3 = [w.queue[0], w.queue[1], w.queue[2]];
  w.burstSize = 3; // 即使外部试图调成 ×3，严禁插队模式仍强制单发
  w.squadFilter = 'vip'; // 即使试图插队选 VIP，仍必须放排头

  assert.equal(w.launchOnSide(-1), 1, '放左侧每次严格放 1 人');
  assert.equal(w.people[0].typeId, first3[0], '第 1 位必须严格是队头人物，绝不插队');
  assert.ok(w.people[0].flyToX < 0, '放左侧应落在列车左半侧');

  assert.equal(w.launchOnSide(1), 1, '放右侧每次严格放 1 人');
  assert.equal(w.people[1].typeId, first3[1], '第 2 位严格顺延');
  assert.ok(w.people[1].flyToX > 0, '放右侧应落在列车右半侧');

  assert.equal(w.launchOnSide(-1), 1);
  assert.equal(w.people[2].typeId, first3[2], '第 3 位严格顺延');
  assertNoNaN(w);

  // 技能失败搞笑事件验证：竹竿不缩头撞桥洞 -> 触发 tall_bonk；按住缩头耗尽体力 -> 触发 stamina_empty
  const wFail = new World('s4', 404);
  wFail.squadFilter = 'tall';
  wFail.burstSize = 1;
  wFail.launchAt(0, TRAIN.roofY - 40);
  wFail.launchAt(0, TRAIN.roofY - 96);
  stepSeconds(wFail, 0.45);
  wFail.depart();
  let sawTallBonk = false;
  let sawStaminaEmpty = false;
  let t = 0;
  while (wFail.phase === 'running' && t < 20) {
    // 一直死按缩头把体力榨干验证 stamina_empty，之后起身让高竹竿撞桥验证 tall_bonk
    wFail.crouching = t < 3.4;
    wFail.step(DT);
    for (const ev of wFail.drainEvents()) {
      if (ev.type === 'skillFail' && ev.key === 'tall_bonk') sawTallBonk = true;
      if (ev.type === 'skillFail' && ev.key === 'stamina_empty') sawStaminaEmpty = true;
    }
    t += DT;
  }
  assert.equal(sawStaminaEmpty, true, '体力耗尽应触发 stamina_empty 搞笑吐槽事件');
  assert.equal(sawTallBonk, true, '竹竿撞桥应触发 tall_bonk 搞笑吐槽事件');
  assert.ok(Object.values(SKILL_FAIL_LINES).every((arr) => arr.length >= 2), '每类技能失败均配至少 2 条搞笑文案');
});

test('24 张热梗成就称号卡牌系统：车底/车头/车尾/滞空冲天/全员到齐/加速/零摔落成就与高光分享', () => {
  assert.equal(ACHIEVEMENTS.length, 24, '应包含 24 张热梗/金曲成就称号卡');
  assert.ok(ACHIEVEMENTS.every((a) => typeof a.flavor === 'string' && a.flavor.length >= 6), '每张称号卡均应配置吐槽金句');
  const underDef = ACHIEVEMENTS.find((a) => a.id === 'under_car');
  assert.equal(underDef?.title, '我应该在车底');
  for (const newId of ['full_house', 'ss_legend', 'fat_wall', 'crouch_master']) {
    assert.ok(ACHIEVEMENTS.some((a) => a.id === newId), `应包含新增称号卡 ${newId}`);
  }

  // 1) 车底盘 + 车头 + 车尾 + 车顶全位置放人测试
  const w = new World('s1', 2026);
  w.squadFilter = 'thin';
  w.burstSize = 1;
  w.launchAt(0, -28);                     // 车底盘 -> 《我应该在车底》
  w.launchAt(TRAIN.halfW + 30, -82);      // 车头前端 -> 《泰坦尼克号》
  w.launchAt(-TRAIN.halfW - 24, -100);    // 车尾栏杆 -> 《车尾拖油瓶》
  stepSeconds(w, 0.35);
  assert.equal(w.people[0].onUnderCarriage, true, '乘客应成功扒在车底盘上');
  assert.ok(w.people[0].grips.length >= 1, '车底乘客应紧紧抓住车底锚点');

  // 车顶再放 8 人发车
  for (let i = 0; i < 8; i++) {
    w.launchAt(-120 + i * 32, TRAIN.roofY - 12);
  }
  stepSeconds(w, 0.4);
  w.depart();

  const unlockedIds = new Set();
  let t = 0;
  while (w.phase === 'running' && t < 35) {
    w.boosting = true;
    w.step(DT);
    for (const ev of w.drainEvents()) {
      if (ev.type === 'achievement') unlockedIds.add(ev.id);
    }
    t += DT;
  }
  assert.equal(w.phase, 'arrived');
  assert.ok(unlockedIds.has('under_car'), '扒车底运行应触发《我应该在车底》成就');
  assert.ok(unlockedIds.has('titanic'), '扒在车头兜风应触发《泰坦尼克号》成就');
  assert.ok(unlockedIds.has('tail_hanger'), '挂在车尾应触发《车尾拖油瓶》成就');
  assert.ok(unlockedIds.has('akina_god'), '全程手动加速 >= 4.5s 过关应触发《秋名山车神》成就');

  // 2) 物理滞空 & 冲天高空成就验证（给 1 名脱手乘客强向上初速度）
  const wAir = new World('s1', 2027);
  wAir.squadFilter = 'thin';
  wAir.burstSize = 1;
  wAir.launchAt(0, TRAIN.roofY - 14);
  stepSeconds(wAir, 0.3);
  wAir.depart();
  const flyer = wAir.people[0];
  flyer.grips.length = 0;
  flyer.p0.y = -240; flyer.p0.oy = -231; // 强劲向上弹射初速度
  flyer.p1.y = -258; flyer.p1.oy = -249;
  const airAchs = new Set();
  for (let i = 0; i < 240; i++) {
    wAir.step(DT);
    for (const ev of wAir.drainEvents()) {
      if (ev.type === 'achievement') airAchs.add(ev.id);
    }
  }
  assert.ok(airAchs.has('sky_rocket'), '崩飞冲入高空应触发《你咋不上天呢》');
  assert.ok(airAchs.has('air_time'), '空中滞空 >= 1.6s 应触发《地心引力抓不住我》');

  // 3) 存档解锁次数累计、防重复领票 & 老存档 boolean 兼容
  const mockPlat = makeMockPlatform();
  mockPlat.setStorage('overload_tt_save_v3', { achievements: { titanic: true }, tickets: 10 });
  const store = new ProgressStore(mockPlat);
  assert.equal(store.getAchievementCount('titanic'), 1, '老存档 boolean true 应自动兼容为 count=1');

  const r1 = store.recordAchievement('under_car');
  assert.equal(r1.isNew, true);
  assert.equal(r1.count, 1);
  assert.equal(r1.def?.title, '我应该在车底');
  assert.equal(store.data.tickets, 40, '首次解锁应发放成就车票');

  const r2 = store.recordAchievement('under_car');
  assert.equal(r2.isNew, false, '重复触发不再标记为新解锁');
  assert.equal(r2.count, 2, '重复触发应累计达成次数');
  assert.equal(store.data.tickets, 40, '重复触发不可重复领票');
  assert.equal(store.unlockAchievement('under_car'), null, '兼容接口对已解锁成就返回 null');
  assert.equal(store.getAchievementStats().unlocked, 2);
  assert.equal(store.getAchievementStats().total, 24);

  // 3.5) 待玩家亲手翻牌模式（deferFlip=true）：先进入待翻态，点击翻牌后才揭晓并发放车票
  const tBeforeDefer = store.data.tickets;
  const rDefer = store.recordAchievement('fly_higher', { deferFlip: true });
  assert.equal(rDefer.isNew, true);
  assert.equal(rDefer.pendingFlip, true, 'deferFlip=true 时新获得卡牌应处于待翻开状态');
  assert.equal(store.data.tickets, tBeforeDefer, '翻牌前暂不提前发车票');
  assert.equal(store.hasPendingFlips(), true);
  const flipRes = store.flipAchievementCard('fly_higher');
  assert.equal(flipRes.ok, true, '玩家点击待翻卡应成功翻开');
  assert.equal(store.data.tickets, tBeforeDefer + flipRes.reward, '翻开瞬间发放首通车票奖励');
  assert.equal(store.hasPendingFlips(), false);
  assert.equal(store.flipAchievementCard('fly_higher').ok, false, '已翻开卡牌不可重复翻牌领奖');

  // 4) 全局到站 MVP 评分验证（首解优先 > 稀有度优先 > 反审美疲劳低次数优先）
  const defR = ACHIEVEMENTS.find((a) => a.rarity === 1);
  const defSSR1 = ACHIEVEMENTS.find((a) => a.id === 'air_jordan');
  const defSSR2 = ACHIEVEMENTS.find((a) => a.id === 'sky_rocket');
  assert.ok(defR && defSSR1 && defSSR2 && defSSR1.rarity === 3 && defSSR2.rarity === 3);

  const sNewR = evaluateHighlightScore(defR, { isNew: true, count: 1, runTime: 2 });
  const sOldSSR = evaluateHighlightScore(defSSR1, { isNew: false, count: 1, runTime: 10 });
  assert.ok(sNewR > sOldSSR, '首次解锁称号应始终优先于老称号');

  const sRepeatSSR = evaluateHighlightScore(defSSR1, { isNew: false, count: 2, runTime: 5 });
  const sRepeatR = evaluateHighlightScore(defR, { isNew: false, count: 2, runTime: 10 });
  assert.ok(sRepeatSSR > sRepeatR, '同为已解锁时，高稀有度 SSR 应击败普通 R 称号');

  const sFatiguedSSR = evaluateHighlightScore(defSSR1, { isNew: false, count: 10, runTime: 2 });
  const sFreshSSR = evaluateHighlightScore(defSSR2, { isNew: false, count: 2, runTime: 9 });
  assert.ok(sFreshSSR > sFatiguedSSR, '反疲劳机制：高重复的早期 SSR 应让位给更稀罕的同级 SSR');

  // 5) 6 大套装齐套领奖 + 24/24 全图鉴大满贯奖励与限定第 6 套涂装验证
  const setsBefore = store.getAchievementSetStates();
  assert.equal(setsBefore.length, 6, '应分为 6 大主题套装');
  assert.ok(setsBefore.every((s) => s.total === 4), '每套应正好包含 4 张卡牌');
  assert.equal(store.isSkinUnlocked('grand_slam'), false, '未满 24/24 时限定第 6 套涂装必须锁定');
  store.setTrialSkin('grand_slam');
  assert.equal(store.trialSkinId, null, '全图鉴限定涂装不可被广告试驾绕过');

  // 集齐第一套（极限挂车组）
  for (const id of ['fly_higher', 'under_car', 'titanic', 'tail_hanger']) {
    store.recordAchievement(id);
  }
  const set1 = store.getAchievementSetStates().find((s) => s.id === 'extreme_hang');
  assert.equal(set1.ready, true, '第一套 4/4 应进入可领齐套奖励状态');
  assert.equal(store.hasUnclaimedAchievementReward(), true);
  const tBeforeSet = store.data.tickets;
  const claimSetRes = store.claimAchievementSet('extreme_hang');
  assert.equal(claimSetRes.ok, true);
  assert.equal(store.data.tickets, tBeforeSet + set1.reward, '齐套领奖应发放对应车票');
  assert.equal(store.claimAchievementSet('extreme_hang').ok, false, '齐套奖励不可重复领取');

  // 集齐全部 24 张卡牌 -> 解锁大满贯
  for (const a of ACHIEVEMENTS) store.recordAchievement(a.id);
  assert.equal(store.isFullAlbumComplete(), true);
  assert.equal(store.canClaimGrandSlam(), true);
  assert.equal(store.isSkinUnlocked('grand_slam'), true, '24/24 后限定第 6 套涂装自动解锁');
  const tBeforeGs = store.data.tickets;
  const gsRes = store.claimGrandSlam();
  assert.equal(gsRes.ok, true);
  assert.equal(store.data.tickets, tBeforeGs + 500, '大满贯应发放 +500 车票');
  assert.equal(store.data.equippedSkin, 'grand_slam', '领取大满贯后自动换装《星耀大满贯特快》');
  assert.equal(store.claimGrandSlam().ok, false, '大满贯奖励不可重复领取');
  assertNoNaN(w);
});

console.log(`\n全部 ${passed} 项抖音小游戏 V3 回归与压测全部通过！`);
