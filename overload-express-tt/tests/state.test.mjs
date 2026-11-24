import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasUI } from '../src/ui_canvas.js';
import { ProgressStore } from '../src/progress.js';
import { World, TRAIN, DT } from '../src/physics.js';
import { buildEndlessLevel, buildDailyLevel } from '../src/levels.js';

function ctx() {
  const noop = () => {};
  return new Proxy({}, { get: (obj, key) => obj[key] ?? (key === 'measureText'
    ? (text) => ({ width: String(text).length * 8 })
    : key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => ({ addColorStop: noop }) : noop), set: (obj, key, val) => { obj[key] = val; return true; } });
}
function store(raw = null) {
  return new ProgressStore({ getStorage: () => raw, setStorage: () => {} });
}

test('合规弹窗打开时底层开始与顶栏按钮不再可点', () => {
  const ui = new CanvasUI();
  ui.draw(ctx(), { world: new World('s1', 1), uiMode: 'title', modal: 'age8', muted: false,
    sdk: { sidebarSupported: true }, progress: store(), leftV: 0, rightV: 1280,
    safeLeftV: 0, safeRightV: 1280, capsuleLeftV: 1260, heldBtns: new Set(), isTT: true });
  assert.ok(ui.hitboxes.length > 0);
  assert.equal(ui.hitboxes.some((b) => b.id === 'start' || b.id === 'go_title'), false);
});

test('新手引导只响应明确的开干按钮，正文不关闭引导', () => {
  const ui = new CanvasUI(); ui.drawL1DialogModal(ctx());
  assert.equal(ui.hitTest(400, 300), null);
  assert.equal(ui.hitTest(640, 440)?.id, 'close_l1_dialog');
});

test('损坏的存档不会生成负车票、越级升级或锁定涂装', () => {
  const p = store({ unlockedIdx: -5, tickets: -10, totalDelivered: 'oops',
    upgrades: { gripPaint: 99, springs: -1, staminaCup: 'bad' }, equippedSkin: 'cyber' });
  assert.equal(p.data.unlockedIdx, 0);
  assert.equal(p.data.tickets, 0);
  assert.equal(p.data.totalDelivered, 0);
  assert.deepEqual(p.data.upgrades, { gripPaint: 5, springs: 0, staminaCup: 0 });
  assert.equal(p.getActiveSkin().id, 'classic');
});

test('无尽跨站清理上一站结算和已落车对象的抓扣', () => {
  const w = new World(buildEndlessLevel(1), 123);
  w.squadFilter = 'fat'; w.launchAt(0, TRAIN.roofY - 14);
  for (let i = 0; i < 60; i++) w.step(DT);
  w.people[0].grips.push({ kind: 'person', targetId: 999999, myPart: 0, targetPart: 0, restLen: 10 });
  w.finalCount = 7; w.finalScore = 11; w.phase = 'arrived';
  w.events.push({ type: 'arrived', count: 7, score: 11 });
  w.continueEndlessWave(buildEndlessLevel(2), 'energyDrink');
  assert.equal(w.finalCount, 0);
  assert.equal(w.finalScore, 0);
  assert.equal(w.people[0].grips.some((g) => g.targetId === 999999), false);
  assert.equal(w.drainEvents().some((e) => e.type === 'arrived'), false);
});

test('快照重跑清理旧结算分数和旧事件', () => {
  const w = new World('s1', 123);
  w.launchAt(0, TRAIN.roofY - 12);
  for (let i = 0; i < 60; i++) w.step(DT);
  w.depart(); w.finalCount = 1; w.finalScore = 1;
  w.events.push({ type: 'arrived', count: 1, score: 1 });
  assert.equal(w.retryFromDepartSnapshot(), true);
  assert.equal(w.finalCount, 0);
  assert.equal(w.finalScore, 0);
  assert.equal(w.drainEvents().some((e) => e.type === 'arrived'), false);
});

test('后期六种乘客卡与增援、护盾和齐扑控件不重叠', () => {
  for (const level of ['s5', 's7', 's10', buildDailyLevel('20261123')]) {
    const ui = new CanvasUI();
    ui.draw(ctx(), { world: new World(level, 1), uiMode: 'play', modal: null, muted: false,
      sdk: {}, progress: store(), leftV: 0, rightV: 1280, safeLeftV: 0, safeRightV: 1280,
      capsuleLeftV: 1260, heldBtns: new Set(), isTT: true });
    const cards = ui.hitboxes.filter((b) => b.id === 'filter');
    const controls = ui.hitboxes.filter((b) => ['burst', 'undo', 'ad_gear', 'ad_reinforce', 'depart'].includes(b.id));
    for (const a of cards) for (const b of controls) {
      const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(overlaps, false, `${a.filter} 与 ${b.id} 重叠`);
    }
  }
});

test('窄高像素比横屏中适龄正文放大后确认热区跟随显示位置', () => {
  const ui = new CanvasUI();
  ui.draw(ctx(), { world: new World('s1', 1), uiMode: 'title', modal: 'age8', muted: false,
    sdk: { sidebarSupported: true }, progress: store(), leftV: -140, rightV: 1420,
    safeLeftV: -96, safeRightV: 1376, capsuleLeftV: 1230, heldBtns: new Set(), isTT: false, viewScale: 390 / 720 });
  assert.equal(ui.hitTest(640, 600)?.id, 'close_modal');
  assert.equal(ui.hitTest(640, 450), null);
});

test('全面屏手机横屏首页抬升底部健康忠告避让 Home 横条且右上角工具不跑偏', () => {
  const ui = new CanvasUI();
  const winW = 852; const winH = 393;
  const viewScale = Math.min(winW / 1280, winH / 720);
  const viewOffX = (winW - 1280 * viewScale) / 2;
  const minSide = Math.max(28, Math.round(winW * 0.048));
  const minBot = Math.max(20, Math.round(winH * 0.056));
  const leftV = -viewOffX / viewScale;
  const rightV = (winW - viewOffX) / viewScale;
  const safeLeftV = (minSide - viewOffX) / viewScale;
  const safeRightV = (winW - minSide - viewOffX) / viewScale;
  const safeBottomV = (winH - minBot) / viewScale;
  ui.draw(ctx(), { world: new World('s1', 1), uiMode: 'title', modal: null, muted: false,
    sdk: { sidebarSupported: true }, progress: store(), leftV, rightV,
    safeLeftV, safeRightV, safeBottomV, capsuleLeftV: safeRightV - 12,
    heldBtns: new Set(), isTT: true, viewScale });
  const ageBox = ui.hitboxes.find((b) => b.id === 'open_age8');
  const garageBox = ui.hitboxes.find((b) => b.id === 'open_garage');
  const muteBox = ui.hitboxes.find((b) => b.id === 'mute');
  assert.ok(ageBox && ageBox.y + ageBox.h <= 720 - 40, `8+ 按钮底部 ${ageBox?.y + ageBox?.h} 应高于 Home 横条区`);
  assert.ok(garageBox && garageBox.x > 900 && muteBox && muteBox.x > 1000, '右上角车票与静音应保持在右侧，绝不跳回标题中央');
});
