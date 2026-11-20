import { Game, CFG } from './sim.js';
import { Renderer, arcToScreen } from './render.js';
import { Sfx } from './audio.js';

const DT = 1 / 120;

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const sfx = new Sfx();

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));

const fx = { parts: [], floats: [] };
const ui = { mode: 'title', t: 0, target: 10000, rank: '', deadAt: 0 };
// 调试用：?auto=1 直接开局，?seed=N 固定种子，?ff=秒 快进
if (params.get('auto') === '1') ui.mode = 'play';

let game = new Game(seedParam || ((Date.now() & 0xffff) + 1));
let paused = false;

// ---------- 特效 ----------
function burst(s, ci) {
  const p = arcToScreen(s);
  const colors = ['255,77,90', '63,169,255', '255,197,61', '178,107,255'];
  const rgb = colors[ci] || '255,255,255';
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 260;
    fx.parts.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      r: 2 + Math.random() * 4.5,
      life: 0.32 + Math.random() * 0.35,
      max: 0.67,
      color: `rgba(${rgb},ALPHA)`,
    });
  }
}

function float(text, x, y, size, color) {
  fx.floats.push({ text, x, y, size, color, life: 0.95, max: 0.95 });
}

// ---------- 事件 ----------
function handleEvents() {
  for (const e of game.drainEvents()) {
    if (e.type === 'fire') {
      sfx.fire();
    } else if (e.type === 'insert') {
      sfx.click();
    } else if (e.type === 'lone') {
      sfx.thud();
    } else if (e.type === 'clear') {
      sfx.clear(e.chain);
      for (let i = 0; i < e.positions.length; i++) burst(e.positions[i], e.colors[i]);
      const mid = e.positions.reduce((a, b) => a + b, 0) / e.positions.length;
      const p = arcToScreen(mid);
      float(`+${e.gain}`, p.x, p.y - 26, e.chain >= 3 ? 34 : 26,
        e.chain >= 3 ? '#FFD65A' : '#E8F0FA');
      if (e.chain >= 2) {
        float(`CHAIN ×${e.chain}`, p.x, p.y - 62, 20, '#FFD65A');
      }
    } else if (e.type === 'dead') {
      sfx.dead();
      ui.deadAt = ui.t + 0.8;
    }
  }
}

// ---------- 主循环 ----------
function stepOnce() {
  game.setInput(dir());
  game.step(DT);
  handleEvents();
  if (Math.abs(game.v) > 1.5) sfx.tick(Math.abs(game.v));
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
    p.vx *= Math.exp(-2.6 * dt);
    p.vy = p.vy * Math.exp(-2.6 * dt) + 420 * dt;
    if (p.life <= 0) fx.parts.splice(i, 1);
  }
  for (let i = fx.floats.length - 1; i >= 0; i--) {
    fx.floats[i].life -= dt;
    if (fx.floats[i].life <= 0) fx.floats.splice(i, 1);
  }
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

    if (game.dead && ui.t >= ui.deadAt) {
      ui.rank = rank(game.score);
      ui.mode = 'result';
    }
  } else {
    acc = 0;
  }

  updateFx(raw);
  renderer.draw(game, ui, fx);
  requestAnimationFrame(frame);
}

function rank(s) {
  if (s >= 18000) return 'RANK  SS';
  if (s >= 13000) return 'RANK  S';
  if (s >= 8000) return 'RANK  A';
  if (s >= 5000) return 'RANK  B';
  return 'RANK  C';
}

// ---------- 输入 ----------
const keys = new Set();

function restart() {
  game = new Game(seedParam || ((Date.now() & 0xffff) + 1));
  fx.parts.length = 0;
  fx.floats.length = 0;
  acc = 0;
  paused = false;
  ui.mode = 'play';
  ui.rank = '';
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  sfx.init();

  if (e.repeat) {
    keys.add(e.code);
    return;
  }
  keys.add(e.code);

  if (e.code === 'Escape') {
    if (ui.mode === 'play') paused = !paused;
    return;
  }
  if (e.code === 'Space' || e.code === 'Enter') {
    if (ui.mode === 'title') {
      ui.mode = 'play';
      sfx.start();
    } else if (ui.mode === 'result') {
      restart();
      sfx.start();
    } else if (ui.mode === 'play' && !paused) {
      game.brake();
    }
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

// 鼠标/触摸也能起手（同时解锁音频）
window.addEventListener('pointerdown', () => {
  sfx.init();
  if (ui.mode === 'title') { ui.mode = 'play'; sfx.start(); }
  else if (ui.mode === 'result') { restart(); sfx.start(); }
});

window.addEventListener('blur', () => {
  keys.clear();
  if (ui.mode === 'play') paused = true;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.mode === 'play') paused = true;
});

// 调试用快进：截图中局状态
const ff = Number(params.get('ff') || 0);
if (ff > 0) {
  const n = Math.min(Math.floor(ff / DT), 120 * 60);
  for (let i = 0; i < n; i++) {
    game.setInput(0);
    game.step(DT);
    handleEvents();
  }
  fx.parts.length = 0;
  fx.floats.length = 0;
  sfx.muted = true;
}

requestAnimationFrame(frame);
