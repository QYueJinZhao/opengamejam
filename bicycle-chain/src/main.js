import { Game, BASE_CFG } from './sim.js';
import { Renderer, arcToScreen } from './render.js';
import { Sfx } from './audio.js';
import { MODES, modeIndex, TIERS, scoreBand } from './modes.js';
import { botInput } from './bot.js';
import { D, N } from './geom.js';

const DT = 1 / 120;

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const sfx = new Sfx();

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const ffParam = Number(params.get('ff') || 0);
// ?bot=1 交给机器人操作。它不只是调试开关：无头截图要靠它才截得到真实中高分段，
// 否则空转快进会在十几秒内塞满跑道，永远只截到 C 段。
const botOn = params.get('bot') === '1';
// ?ft=秒 覆盖飞行时长（0.2~1.4）。
// 这个参数存在的理由：0.80s 是推算出来的，不是测出来的——合成速度进了人眼
// 舒适区，但"多少秒最舒服"只有上手才知道。改 BASE_CFG 而不是 CFG，是因为
// 每次 new Game 都会用 Object.assign(CFG, BASE_CFG, mode.cfg) 重置。
const ftParam = Number(params.get('ft') || 0);
if (ftParam > 0) BASE_CFG.flightTime = Math.max(0.2, Math.min(1.4, ftParam));

// ---------- 本地记录 ----------
const BEST_KEY = 'bcj.best.v2';
function loadBests() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch { return {}; }
}
function saveBest(id, score) {
  try {
    const b = loadBests();
    if (!b[id] || score > b[id]) { b[id] = score; localStorage.setItem(BEST_KEY, JSON.stringify(b)); }
    return b;
  } catch { return loadBests(); }
}

const ui = {
  mode: 'title',
  t: 0,
  sel: modeIndex(params.get('mode') || 'standard'),
  bests: loadBests(),
  best: 0,
  newBest: false,
  cb: params.get('cb') === '1',
  muted: false,
  deadAt: 0,
};

const fx = { parts: [], floats: [], shocks: [], beams: [], ghosts: [], flash: 0, shake: 0 };

let game = new Game(seedParam || ((Date.now() & 0xffff) + 1), MODES[ui.sel].id);
let paused = false;
let silent = false;

// ---------- 特效 ----------
// 消除的粒子。速度与寿命是一起调的，不能只加寿命：
// 初速不变而寿命变长，碎片会飘出跑道、飞到 HUD 上，看着像漏液而不是爆炸。
// 所以"慢"的做法是「初速降下来 + 寿命拉长 + 阻尼减小」，让它慢慢铺开、慢慢落，
// 而不是原速飞更久。重力同步降低，否则滞空时间一长就变成往下掉。
function burst(x, y, ci, count = 9, power = 1) {
  const rgb = ['255,77,90', '63,169,255', '255,197,61', '178,107,255', '18,224,184'][ci] || '255,255,255';
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (44 + Math.random() * 196) * power;
    fx.parts.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 44 * power,
      r: (1.6 + Math.random() * 4.2) * power,
      life: 0.46 + Math.random() * 0.52,
      max: 0.98,
      color: `rgba(${rgb},ALPHA)`,
    });
  }
}

// 消失珠子的残影：先胀一下再淡出。
// 之前珠子是从 slots 里直接删掉的，视觉上"大球瞬间碎成小点"，中间没有过渡——
// 粒子再漂亮也补不上这一下断裂。残影的作用是把"消失"变成"被吃掉"。
function ghost(x, y, ci, dur = 0.44) {
  fx.ghosts.push({ x, y, ci, life: dur, max: dur });
}

function float(text, x, y, size, color) {
  // 1.05 → 1.30：分数浮字是玩家确认"这一下值多少"的唯一凭据，
  // 三消演出变长后如果数字先消失，会变成"看到爆炸但不知道赚了多少"。
  fx.floats.push({ text, x, y, size, color, life: 1.30, max: 1.30 });
}

function shock(x, y, r0, r1, dur, color, w = 3) {
  fx.shocks.push({ x, y, r0, r1, life: dur, max: dur, color, w });
}

function beam(s0, span, dur, color, w = 8) {
  fx.beams.push({ s0, span, life: dur, max: dur, color, w });
}

// ---------- 事件 ----------
function handleEvents() {
  for (const e of game.drainEvents()) {
    if (e.type === 'fire') {
      if (!silent) sfx.fire(e.n > 1 ? 1 : 0);
    } else if (e.type === 'insert') {
      if (!silent) (e.snapped ? sfx.snap() : sfx.click());
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 4, e.snapped ? 34 : 22, 0.22, 'rgba(180,220,255,ALPHA)', 2);
    } else if (e.type === 'lone') {
      if (!silent) sfx.thud();
    } else if (e.type === 'clear') {
      const mid = arcToScreen(e.s0 + e.len * 0.5 * D);
      const gold = e.chain >= 2 || e.combo >= 6;
      // 三消演出总长从 ~0.4s 拉到 ~0.7s：光带、冲击波、残影、粒子四条线
      // 同时存在才读得出"消除"这件事，只有一条会变成一闪。
      beam(
        e.s0, e.len, 0.62,
        gold ? 'rgba(255,214,90,ALPHA)' : 'rgba(200,235,255,ALPHA)',
        7 + Math.min(6, e.chain * 2)
      );
      shock(
        mid.x, mid.y, 10, 60 + e.chain * 26, 0.68,
        gold ? 'rgba(255,214,90,ALPHA)' : 'rgba(180,225,255,ALPHA)', 3
      );

      for (let i = 0; i < e.positions.length; i++) {
        const sp = arcToScreen(e.positions[i]);
        ghost(sp.x, sp.y, e.colors[i], 0.52 + e.chain * 0.05);
        burst(sp.x, sp.y, e.colors[i], e.chain >= 2 ? 12 : 8, e.chain >= 2 ? 1.35 : 1);
      }

      float(`+${e.gain}`, mid.x, mid.y - 30, e.chain >= 2 ? 32 : 26, e.chain >= 2 ? '#FFD65A' : '#E8F0FA');
      if (e.chain >= 2) {
        float(`连锁 ×${e.chainMult.toFixed(1)}`, mid.x, mid.y - 64, 18, '#FFD65A');
      }
      if (e.comboMult >= 1.9) {
        float(`连消 ×${e.comboMult.toFixed(2)}`, mid.x, mid.y - 88, 17, '#9BE9FF');
      }

      fx.shake = Math.min(26, fx.shake + 2.2 + e.chain * 2.4 + Math.min(6, e.combo * 0.3));
      fx.flash = Math.min(0.42, fx.flash + 0.03 + e.chain * 0.02);
      if (!silent) sfx.clear(e.chain, e.combo);
    } else if (e.type === 'combo') {
      if (!silent && (e.combo === 3 || e.combo === 6 || e.combo === 10)) {
        sfx.rushUp(e.combo);
        float(`连消 ${e.combo}`, 600, 650, 20, '#9BE9FF');
      }
    } else if (e.type === 'combobreak') {
      if (!silent) sfx.rushBreak();
      float('连消中断', 600, 650, 16, 'rgba(255,140,150,0.9)');
    } else if (e.type === 'sweep') {
      fx.flash = Math.min(0.55, fx.flash + 0.30);
      fx.shake = Math.min(34, fx.shake + 16);
      shock(600, 400, 30, 380, 0.7, 'rgba(255,214,90,ALPHA)', 6);
      float(`清空跑道 +${e.gain}`, 600, 360, 30, '#FFD65A');
      if (!silent) sfx.sweep();
    } else if (e.type === 'dead') {
      if (!silent) sfx.dead();
      ui.deadAt = ui.t + 0.9;
      fx.shake = 30;
      fx.flash = 0.4;
    }
  }
}

// ---------- 主循环 ----------
let lastNozzles = 1;

function stepOnce() {
  game.setInput(paused ? 0 : (botOn ? botInput(game) : dir()));
  game.step(DT);
  handleEvents();
  checkTier();

  const n = game.nozzleCount();
  if (n !== lastNozzles) {
    lastNozzles = n;
    float(`${n} 号射口上线`, 600, 660, 22, '#2FE6C8');
    if (!silent) sfx.clear(3, 1);
  }

  if (Math.abs(game.v) > 1.5 && !silent) sfx.tick(Math.abs(game.v));
}

function dir() {
  const l = keys.has('ArrowLeft') || keys.has('KeyA');
  const r = keys.has('ArrowRight') || keys.has('KeyD');
  return (r ? 1 : 0) - (l ? 1 : 0);
}

function updateFx(dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-2.0 * dt);
    p.vy = p.vy * Math.exp(-2.0 * dt) + 320 * dt;
    if (p.life <= 0) fx.parts.splice(i, 1);
  }
  for (let i = fx.ghosts.length - 1; i >= 0; i--) {
    fx.ghosts[i].life -= dt;
    if (fx.ghosts[i].life <= 0) fx.ghosts.splice(i, 1);
  }
  for (let i = fx.floats.length - 1; i >= 0; i--) {
    fx.floats[i].life -= dt;
    if (fx.floats[i].life <= 0) fx.floats.splice(i, 1);
  }
  for (let i = fx.shocks.length - 1; i >= 0; i--) {
    fx.shocks[i].life -= dt;
    if (fx.shocks[i].life <= 0) fx.shocks.splice(i, 1);
  }
  for (let i = fx.beams.length - 1; i >= 0; i--) {
    fx.beams[i].life -= dt;
    if (fx.beams[i].life <= 0) fx.beams.splice(i, 1);
  }
  fx.shake *= Math.exp(-dt * 6.5);
  if (fx.shake < 0.2) fx.shake = 0;
  fx.flash *= Math.exp(-dt * 7.5);
  if (fx.flash < 0.002) fx.flash = 0;
}

let acc = 0;
let last = performance.now();

function frame(now) {
  const raw = Math.min(0.08, (now - last) / 1000);
  last = now;
  ui.t += raw;

  if (ui.mode === 'play' && !paused) {
    acc += raw;
    let n = 0;
    while (acc >= DT && n < 10) {
      stepOnce();
      acc -= DT;
      n++;
    }
    if (n >= 10) acc = 0;

    if (game.dead && ui.t >= ui.deadAt) finishRun();
  } else {
    acc = 0;
  }

  updateFx(raw);

  const load = game ? game.occupied() / Math.max(1, N) : 0;
  sfx.setIntensity(load);
  sfx.update();

  renderer.draw(game, ui, fx);
  requestAnimationFrame(frame);
}

// ---------- 段位跨越 ----------
// 跨档是「事件」，不是「状态」：光把数字染色只改变持续显示，玩家不会记住。
// 真正记住的是跨过去那一瞬间的爆发 —— 所以这里给浮字 + 冲击波 + 闪光 + 上行音。
// 分数只增不减，比较可以只升不降；同帧跨两档时只补播最高那档，避免音效叠糊。
let lastTier = 0;

function tierUp(tier) {
  if (silent) return;   // ?ff= 快进 / 截图模式不演出
  const t = TIERS[tier];
  float(`RANK  ${t.name}`, 300, 68, tier >= 3 ? 30 : 23, t.color);
  shock(300, 74, 8, 120 + tier * 36, 0.5 + tier * 0.05, `rgba(${t.rgb},ALPHA)`, 2.5 + tier);
  fx.flash = Math.min(0.34, fx.flash + 0.07 + tier * 0.04);
  fx.shake = Math.min(18, fx.shake + 1.5 + tier * 1.5);
  sfx.tierUp(tier);
}

function checkTier() {
  const tier = scoreBand(game.score, game.mode);
  if (tier > lastTier) {
    lastTier = tier;
    tierUp(tier);
  }
}

function finishRun() {
  const mode = game.mode;
  const prev = ui.bests[mode.id] || 0;
  ui.bests = saveBest(mode.id, game.score);
  ui.best = Math.max(prev, game.score);
  ui.newBest = game.score > prev;
  ui.mode = 'result';
  sfx.stopMusic();
}

// ---------- 输入 ----------
const keys = new Set();

function resetFx() {
  fx.parts.length = 0;
  fx.floats.length = 0;
  fx.shocks.length = 0;
  fx.beams.length = 0;
  fx.ghosts.length = 0;
  fx.flash = 0;
  fx.shake = 0;
}

function startRun(idx) {
  ui.sel = idx;
  const mode = MODES[idx];
  game = new Game(seedParam || ((Date.now() & 0xffff) + 1), mode.id);
  resetFx();
  acc = 0;
  paused = false;
  lastNozzles = 1;
  ui.mode = 'play';
  ui.newBest = false;
  lastTier = 0;
  ui.best = ui.bests[mode.id] || 0;
  sfx.init();
  sfx.start();
  sfx.startMusic();
}

function toTitle() {
  ui.mode = 'title';
  paused = false;
  sfx.stopMusic();
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  sfx.init();

  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);

  if (e.code === 'KeyM') {
    sfx.init();
    ui.muted = sfx.toggleMute();
    return;
  }
  if (e.code === 'KeyV') {
    ui.cb = !ui.cb;
    sfx.select();
    return;
  }

  if (ui.mode === 'title') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      ui.sel = (ui.sel + MODES.length - 1) % MODES.length;
      sfx.select();
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      ui.sel = (ui.sel + 1) % MODES.length;
      sfx.select();
    } else if (/^Digit[1-4]$/.test(e.code)) {
      const i = Number(e.code.slice(5)) - 1;
      if (i < MODES.length) { ui.sel = i; sfx.select(); }
    } else if (e.code === 'Space' || e.code === 'Enter') {
      startRun(ui.sel);
    }
    return;
  }

  if (e.code === 'Escape') {
    if (ui.mode === 'play') paused = !paused;
    else if (ui.mode === 'result') toTitle();
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter') {
    if (ui.mode === 'result') startRun(ui.sel);
    else if (ui.mode === 'play' && !paused) game.brake();
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('pointerdown', () => {
  sfx.init();
  if (ui.mode === 'title') startRun(ui.sel);
  else if (ui.mode === 'result') startRun(ui.sel);
});

window.addEventListener('blur', () => {
  keys.clear();
  if (ui.mode === 'play') paused = true;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.mode === 'play') paused = true;
});

// 调试：?auto=1 直接开局，?ff=秒 快进，?mode=id 指定模式
if (params.get('auto') === '1') {
  game = new Game(seedParam || 7, MODES[ui.sel].id);
  ui.mode = 'play';
}
if (ffParam > 0) {
  if (ui.mode !== 'play') {
    game = new Game(seedParam || 7, MODES[ui.sel].id);
    ui.mode = 'play';
  }
  silent = true;
  sfx.muted = true;
  const n = Math.min(Math.floor(ffParam / DT), 120 * 130);
  for (let i = 0; i < n; i++) {
    game.setInput(botOn ? botInput(game) : 0);
    game.step(DT);
    handleEvents();
    checkTier();
    updateFx(DT);   // 快进时一并推进特效寿命，截出来的就是"刚好消除后"的画面
  }
  lastNozzles = game.nozzleCount();
  // 走正常结算：否则快进到死不会写 best，调试截图和真实游玩的战绩会不一致
  if (game.dead) finishRun();
}

requestAnimationFrame(frame);
