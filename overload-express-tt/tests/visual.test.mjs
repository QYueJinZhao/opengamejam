import test from 'node:test';
import assert from 'node:assert/strict';
import { StageRenderer } from '../src/render.js';
import { World, DT } from '../src/physics.js';

test('撞洞镜头达到1.18倍并在0.7秒平滑回到原画面', () => {
  const stage = new StageRenderer();
  const world = new World('s1', 1);
  stage.triggerImpactZoom(0, -250, '撞洞！');
  let peak = 1;
  for (let i = 0; i < 84; i++) { stage.updateFx(DT, world); peak = Math.max(peak, stage.camZoom); }
  assert.ok(peak >= 1.179 && peak <= 1.18);
  assert.equal(stage.camZoom, 1);
});

test('选中挂壁娃时车门持续高亮，换乘客后消失', () => {
  const strokes = [];
  const noop = () => {};
  const ctx = new Proxy({}, {
    get: (o, k) => o[k] ?? (k === 'stroke' ? () => strokes.push(o.strokeStyle)
      : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop),
    set: (o, k, value) => { o[k] = value; return true; },
  });
  const stage = new StageRenderer();
  const world = new World('s3', 1);
  stage.drawTrainBody(ctx, world, { nose: '#000', stripe: '#000', bodyTop: '#000', bodyBot: '#000' }, 0);
  assert.ok(strokes.some((s) => s?.startsWith('rgba(74, 222, 128,')));
  strokes.length = 0; world.squadFilter = 'fat';
  stage.drawTrainBody(ctx, world, {}, 0);
  assert.equal(strokes.some((s) => s?.startsWith('rgba(74, 222, 128,')), false);
});

test('同一绘制帧三人落车触发一次120ms微顿并可复位', async () => {
  const { ImpactDirector } = await import('../src/director.js');
  const stage = new StageRenderer();
  const director = new ImpactDirector(stage);
  director.beginFrame();
  for (let i = 0; i < 3; i++) director.observe({ type: 'fall', x: i * 20, y: -200, typeId: 'thin' });
  director.endFrame();
  assert.ok(stage.banner?.text.includes('天女散花'));
  assert.equal(director.advance(0.1), 0);
  assert.ok(Math.abs(director.advance(0.04) - 0.02) < 1e-10);
  director.reset();
  assert.equal(stage.banner, null);
  assert.equal(director.advance(0.02), 0.02);
});

test('单人落车不滥用微顿，撞洞冷却期不重复冻结', async () => {
  const { ImpactDirector } = await import('../src/director.js');
  const stage = new StageRenderer();
  const director = new ImpactDirector(stage);
  director.beginFrame(); director.observe({ type: 'fall', x: 0, y: -200, typeId: 'thin' }); director.endFrame();
  assert.equal(director.advance(0.02), 0.02);
  director.observe({ type: 'bonk', x: 0, y: -200, typeId: 'tall' });
  director.advance(0.1);
  director.observe({ type: 'bonk', x: 10, y: -220, typeId: 'vip' });
  assert.ok(Math.abs(director.advance(0.04) - 0.02) < 1e-10);
  assert.ok(stage.banner.text.includes('竹竿'));
});
