import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function candidate(t, production) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'overload-v3-package-'));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, 'candidate');
  const result = spawnSync(process.execPath, ['build.mjs', '--outdir', out, ...(production ? ['--production'] : [])], {
    cwd: ROOT, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const names = await fs.readdir(out);
  assert.deepEqual(names.sort(), ['game.js', 'game.json', 'project.config.json']);
  async function dirSize(p) {
    const st = await fs.stat(p);
    if (!st.isDirectory()) return st.size;
    let total = 0;
    for (const child of await fs.readdir(p)) total += await dirSize(path.join(p, child));
    return total;
  }
  const bytes = await dirSize(out);
  assert.ok(bytes < 300000, `主包 ${bytes} bytes`);
  return fs.readFile(path.join(out, 'game.js'), 'utf8');
}

function runNative(bundle) {
  let frame;
  let touchStart;
  const analytics = [];
  const toasts = [];
  const noop = () => {};
  const ctx = new Proxy({}, { get: (o, k) => o[k] ?? (k === 'measureText' ? (text) => ({ width: text.length * 8 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : noop),
    set: (o, k, v) => { o[k] = v; return true; } });
  const sandbox = {
    console, setTimeout, clearTimeout,
    requestAnimationFrame: (fn) => { frame = fn; },
    tt: {
      createCanvas: () => ({ getContext: () => ctx }),
      getSystemInfoSync: () => ({ windowWidth: 1280, windowHeight: 720, pixelRatio: 1 }),
      onTouchStart: (fn) => { touchStart = fn; }, onTouchMove: noop, onTouchEnd: noop, onTouchCancel: noop,
      onShow: noop, onHide: noop, onWindowResize: noop,
      getStorageSync: () => '',
      showToast: ({ title }) => toasts.push(title),
      reportAnalytics: (name, data) => analytics.push({ name, ...data }),
    },
  };
  vm.runInNewContext(bundle, sandbox, { timeout: 3000 });
  const draw = () => frame();
  const tap = (x, y) => { touchStart({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }] }); draw(); };
  draw();
  return { analytics, toasts, tap };
}

test('开发主包小于 300000 字节且不依赖 DOM 即可原生启动', async (t) => {
  const bundle = await candidate(t, false);
  const app = runNative(bundle);
  assert.equal(app.analytics[0].name, 'enter_game');
});

test('生产候选在无广告位时不会沿用开发模拟发奖', async (t) => {
  const app = runNative(await candidate(t, true));
  app.tap(430, 620); // 首页下方「线路」按钮
  app.tap(960, 408); // 未解锁的第十站：视频提前试跑
  await new Promise((resolve) => setTimeout(resolve, 260));
  assert.ok(app.toasts.includes('暂无可用广告，请稍后再试'));
  assert.equal(app.analytics.some((e) => e.name === 'level_start'), false);
});

test('构建拒绝把源码目录当作输出目录', () => {
  const result = spawnSync(process.execPath, ['build.mjs', '--outdir', ROOT], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /输出目录/);
});

test('预览服务只暴露游戏文件，拒绝非法编码和目录穿越', async (t) => {
  const child = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const stopped = new Promise((resolve) => child.once('exit', resolve));
  t.after(async () => { child.kill(); await stopped; });
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('预览启动超时')), 5000);
    child.once('error', (err) => { clearTimeout(timeout); reject(err); });
    child.stdout.on('data', (data) => {
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
  assert.equal((await fetch(origin + '/')).status, 200);
  assert.equal((await fetch(origin + '/src/physics.js')).status, 200);
  assert.equal((await fetch(origin + '/project.config.json')).status, 403);
  assert.equal((await fetch(origin + '/%E0%A4%A')).status, 400);
  assert.equal((await fetch(origin + '/..%2f..%2f.git%2fconfig')).status, 403);
  assert.equal((await fetch(origin + '/game.js')).status, 200);
});
