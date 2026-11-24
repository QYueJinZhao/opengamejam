import test from 'node:test';
import assert from 'node:assert/strict';
import { World, TRAIN, TRAIN_ANCHORS, DT } from '../src/physics.js';
import { LEVELS, buildEndlessLevel } from '../src/levels.js';
import { ProgressStore } from '../src/progress.js';

function personWorld(type, perks = []) {
  const w = new World(buildEndlessLevel(1), 123, { perks });
  w.squadFilter = type; w.launchAt(0, TRAIN.roofY - 20);
  for (let i = 0; i < 40; i++) w.step(DT);
  return w;
}

test('首关可投放25名瘦猴且第26次被限量池拒绝', () => {
  const w = new World('s1', 1);
  for (let i = 0; i < 25; i++) assert.equal(w.launchAt((i % 5) * 40 - 80, -200), 1);
  assert.equal(w.launchAt(0, -200), 0);
  assert.deepEqual(LEVELS.map((lv) => Object.values(lv.pool).reduce((a, b) => a + b, 0)),
    [25, 32, 40, 48, 55, 62, 68, 74, 80, 90]);
});

for (const [perk, type, bonus, score] of [['doorRush', 'acrobat', 5, 5], ['vipDrop', 'vip', 2, 6]]) {
  test(`${perk} 立即空降上车而非只增加候车池`, () => {
    const w = personWorld('fat');
    w.phase = 'arrived';
    const ids = w.people.map((p) => p.id);
    const beforePool = w.pool[type];
    const next = buildEndlessLevel(2);
    w.continueEndlessWave(next, perk);
    assert.equal(w.onBoardCount(), 1 + bonus);
    assert.equal(w.onBoardScore(), 1 + score);
    assert.equal(w.pool[type], beforePool + next.pool[type]);
    for (const id of ids) assert.ok(w.people.some((p) => p.id === id));
    assert.equal(w.people.filter((p) => p.typeId === type).length, bonus);
  });
}

function strain(perk, type = 'thin') {
  const w = personWorld(type, perk ? [perk] : []);
  const p = w.people[0];
  p.p0 = { x: 0, y: -350, ox: 0, oy: -350 };
  p.p1 = { x: 0, y: -350 - p.spec.bone, ox: 0, oy: -350 - p.spec.bone };
  p.grips = TRAIN_ANCHORS.filter((a) => a.kind === 'roof').slice(5, type === 'tall' ? 7 : 6)
    .map((anchor) => ({ kind: 'anchor', anchor, myPart: 0, restLen: 4, strain: 0, breakT: 0 }));
  w.stepPhysics(DT, false);
  return p.strainMax;
}

test('502强力胶对相同拉伸的承受力实际提高30%', () => {
  const base = strain(null);
  const boosted = strain('glue502');
  assert.ok(base > 0 && boosted > 0);
  assert.ok(Math.abs(base / boosted - 1.3) < 1e-8, `${base / boosted}`);
});

test('竹竿钢筋在双抓时的拉索承受力实际翻倍', () => {
  const base = strain(null, 'tall');
  const boosted = strain('steelTall', 'tall');
  assert.ok(base > 0 && boosted > 0);
  assert.ok(Math.abs(base / boosted - 2) < 1e-8, `${base / boosted}`);
});

test('临时无限体力和免风只作用下一站', () => {
  const w = personWorld('fat');
  w.phase = 'arrived'; w.continueEndlessWave(buildEndlessLevel(2), 'energyDrink');
  w.depart(); w.crouching = true;
  for (let i = 0; i < 120; i++) w.step(DT);
  assert.equal(w.stamina, 1);
  w.phase = 'arrived'; w.continueEndlessWave(buildEndlessLevel(3), 'calmWind');
  w.depart(); w.crouching = true;
  const wind = w.level.winds[0]; w.trainX = wind.x;
  for (let i = 0; i < 120; i++) w.step(DT);
  assert.ok(w.stamina < 0.8);
  assert.equal(w.activeWind, null);
  w.phase = 'arrived'; w.continueEndlessWave(buildEndlessLevel(4), null);
  w.depart(); w.trainX = w.level.winds[0].x; w.step(DT);
  assert.ok(w.activeWind);
});

test('车票依据实乘人数发放，VIP评分不重复放大基础车票', () => {
  const make = () => new ProgressStore({ getStorage: () => null, setStorage: () => {} });
  const ordinary = make().recordRunResult(LEVELS[6], 10, 'B', 10);
  const vip = make().recordRunResult(LEVELS[6], 30, 'B', 10);
  assert.equal(vip.earnedTickets, ordinary.earnedTickets);
});

test('物理投影和统计可写入调用方缓存且不改变公开返回语义', () => {
  const w = personWorld('fat');
  const stats = {}, surface = {};
  assert.equal(w.massStats(stats), stats);
  assert.equal(stats.totalMass, 3.5);
  assert.equal(w.pushOutOfTrain(0, -100, 10, surface), surface);
  assert.equal(surface.y, -168);
});

test('事件可逐项消费，消费中产生的新事件留给下一批', () => {
  const w = new World('s1', 1);
  w.events.push({ type: 'first' });
  const received = [];
  w.drainEvents((event) => { received.push(event.type); w.events.push({ type: 'second' }); });
  assert.deepEqual(received, ['first']);
  assert.deepEqual(w.drainEvents().map((event) => event.type), ['second']);
});

function basketAt(distance, type = 'thin') {
  const w = new World('s5', 55, { perks: ['megaBasket'] });
  w.squadFilter = 'auntie'; w.launchAt(0, TRAIN.roofY - 12);
  for (let i = 0; i < 60; i++) w.step(DT);
  const au = w.people[0];
  w.squadFilter = type; w.launchAt(100, -240);
  for (let i = 0; i < 30; i++) w.step(DT);
  const p = w.people[1]; p.grips.length = 0; p.flying = false;
  p.p0.x = p.p0.ox = au.p0.x + 23 + distance;
  p.p0.y = au.p0.y - 6; p.p0.oy = p.p0.y - 1;
  p.p1.x = p.p1.ox = p.p0.x;
  p.p1.y = p.p0.y - p.spec.bone; p.p1.oy = p.p1.y - 1;
  w.stepPhysics(DT, false);
  return p.grips.some((grip) => grip.kind === 'basket');
}

test('巨无霸菜篮按40%扩展捕捉区，并只接规划中的轻乘客', () => {
  assert.equal(basketAt(43), true); // 原始半径32外，扩大后半径44.8内
  assert.equal(basketAt(45.5), false);
  assert.equal(basketAt(20, 'tall'), false);
});

test('铁鞋胖叔在车顶接触时消除水平滑移', () => {
  const w = personWorld('fat', ['ironFat']);
  const p = w.people[0]; p.grips.length = 0;
  p.p0.y = p.p0.oy = TRAIN.roofY - p.spec.r0; p.p0.x = 0; p.p0.ox = -20;
  p.p1.y = p.p1.oy = p.p0.y - p.spec.bone; p.p1.x = 0; p.p1.ox = -20;
  w.stepPhysics(DT, false);
  assert.equal(p.p0.x - p.p0.ox, 0);
});

test('撤回后重新上车即使总数相同，抓扣索引也指向新乘客', () => {
  const w = personWorld('fat');
  w.squadFilter = 'thin'; w.launchAt(30, -200);
  w.syncPeopleIndex();
  const oldId = w.people[1].id;
  w.undoLastBatch();
  w.squadFilter = 'acrobat'; w.launchAt(124, -100);
  const index = w.syncPeopleIndex();
  assert.equal(index.has(oldId), false);
  assert.equal(index.get(w.people[1].id), w.people[1]);
});

test('同种子90人轨迹在独立世界中保持确定性', () => {
  function simulate() {
    const w = new World('s10', 999);
    w.squadFilter = 'mix'; w.burstSize = 5;
    for (let i = 0; i < 18; i++) w.launchAt(-220 + (i % 6) * 86, TRAIN.roofY - 18 - Math.floor(i / 6) * 44);
    for (let i = 0; i < 48; i++) w.step(DT);
    w.depart();
    for (let i = 0; i < 800; i++) w.step(DT);
    return w.people.map((p) => [p.typeId, p.fallen, p.p0.x, p.p0.y, p.p1.x, p.p1.y]);
  }
  assert.deepEqual(simulate(), simulate());
});

test('满级防滑漆实际降低轻乘客车顶滑移', () => {
  function slip(fricBonus) {
    const w = personWorld('thin'); w.upgrades.fricBonus = fricBonus;
    const p = w.people[0]; p.grips.length = 0;
    p.p0.y = p.p0.oy = TRAIN.roofY - p.spec.r0; p.p0.x = 0; p.p0.ox = -20;
    p.p1.y = p.p1.oy = p.p0.y - p.spec.bone; p.p1.x = 0; p.p1.ox = -20;
    w.stepPhysics(DT, false);
    return Math.abs(p.p0.x - p.p0.ox);
  }
  assert.ok(slip(0.2) < slip(0) * 0.9);
});

test('满级弹簧将实际颠簸加速度峰值降低25%', () => {
  function bump(bumpReduce) {
    const w = new World('s10', 1, { upgrades: { bumpReduce } });
    w.phase = 'running'; w.trainX = 1000; w.speed = 300;
    w.stepTrainMotion(DT);
    return Math.abs(w.bumpAccY);
  }
  assert.ok(Math.abs(bump(0.25) / bump(0) - 0.75) < 1e-10);
});

test('满级能量壶延长体力续航并提高恢复速度25%', () => {
  function stamina(staminaBoost) {
    const w = personWorld('fat'); w.upgrades.staminaBoost = staminaBoost;
    w.depart(); w.crouching = true;
    for (let i = 0; i < 120; i++) w.step(DT);
    const afterHold = w.stamina;
    w.stamina = 0.4; w.crouching = false;
    for (let i = 0; i < 120; i++) w.step(DT);
    return [afterHold, w.stamina];
  }
  const normal = stamina(0), upgraded = stamina(0.25);
  assert.ok(Math.abs(normal[0] - 0.66) < 1e-10);
  assert.ok(Math.abs(upgraded[0] - 0.728) < 1e-10);
  assert.ok(Math.abs((upgraded[1] - 0.4) / (normal[1] - 0.4) - 1.25) < 1e-10);
});
