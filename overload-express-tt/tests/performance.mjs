// 观测物理场景的耗时、GC 与分配样本，不能作为整个小游戏零 GC 的证明。
import { performance, PerformanceObserver } from 'node:perf_hooks';
import inspector from 'node:inspector';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const modulePath = path.resolve(process.argv[2] || 'src/physics.js');
const { World, DT, TRAIN } = await import(pathToFileURL(modulePath));
const STEPS = 1200;
const consume = () => {};
function heavy() {
  const w = new World('s10', 999);
  w.squadFilter = 'mix'; w.burstSize = 5;
  for (let i = 0; i < 18; i++) w.launchAt(-220 + (i % 6) * 86, TRAIN.roofY - 18 - Math.floor(i / 6) * 44);
  for (let i = 0; i < 48; i++) w.step(DT);
  w.depart();
  for (let i = 0; i < 240; i++) { w.step(DT); w.drainEvents(consume); }
  return w;
}

const warmed = process.argv.includes('--warm');
if (warmed) {
  const primer = heavy();
  for (let i = 0; i < 4000; i++) { primer.step(DT); primer.drainEvents(consume); }
  // 给后台 JIT 安装机会；冷启动样本另存，不能用本样本代替首局成本。
  await new Promise((resolve) => setTimeout(resolve, 40));
}
const world = heavy();
const times = new Float64Array(STEPS);
const collections = [];
const observer = new PerformanceObserver((list) => collections.push(...list.getEntries()));
observer.observe({ entryTypes: ['gc'] });
global.gc?.();
await new Promise((resolve) => setImmediate(resolve));
const heapBefore = process.memoryUsage().heapUsed;
const aliveAtStart = world.onBoardCount();
const start = performance.now();
for (let i = 0; i < STEPS; i++) {
  const before = performance.now();
  world.step(DT); world.drainEvents(consume);
  times[i] = performance.now() - before;
}
const end = performance.now();
const heapAfter = process.memoryUsage().heapUsed;
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
observer.disconnect();
const gc = collections.filter((entry) => entry.startTime >= start && entry.startTime <= end);
times.sort();

const sampleWorld = heavy();
const session = new inspector.Session(); session.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => {
  session.post(method, params, (error, result) => error ? reject(error) : resolve(result));
});
await post('HeapProfiler.startSampling', { samplingInterval: 1024,
  includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
for (let i = 0; i < STEPS; i++) { sampleWorld.step(DT); sampleWorld.drainEvents(consume); }
const { profile } = await post('HeapProfiler.stopSampling');
session.disconnect();
const functions = new Map();
function visit(node) {
  if (node.callFrame?.url === pathToFileURL(modulePath).href && node.selfSize > 0) {
    const key = node.callFrame.functionName || '(anonymous)';
    functions.set(key, (functions.get(key) || 0) + node.selfSize);
  }
  for (const child of node.children || []) visit(child);
}
visit(profile.head);
console.log(JSON.stringify({ modulePath, seed: 999, warmed, steps: STEPS,
  simulatedSeconds: STEPS * DT, solverBodies: world.people.length,
  aliveAtStart, aliveAtEnd: world.onBoardCount(),
  averageMs: (end - start) / STEPS, p95Ms: times[Math.floor(STEPS * 0.95)], p99Ms: times[Math.floor(STEPS * 0.99)],
  measuredGcCount: gc.length, measuredGcMs: gc.reduce((sum, entry) => sum + entry.duration, 0),
  heapDeltaBytes: heapAfter - heapBefore,
  stateHash: createHash('sha256').update(JSON.stringify(world.people.map((p) => [p.typeId, p.fallen, p.p0.x, p.p0.y, p.p1.x, p.p1.y]))).digest('hex'),
  allocationSampleBytes: [...functions.values()].reduce((sum, bytes) => sum + bytes, 0),
  sampledFunctions: Object.fromEntries(functions), note: 'V8 allocation sampling and one Node scenario; not a whole-app zero-GC claim' }));
