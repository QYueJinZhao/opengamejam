import { og } from '@opengamehq/sdk';
import { FixedStep, Input } from './core.js';
import { AudioEngine } from './audio.js';
import { Renderer } from './render.js';
import { Game, BOONS } from './game.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---- Boot ----
// Static import (not fetch) so the manifest ships inside the bundle and there
// is no runtime request that can fail offline in the review sandbox.
import manifest from '../opengame.json';
try { await og.init({ manifest }); } catch (e) { console.warn('SDK init skipped', e); }

const canvas = $('game');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();
const game = new Game(audio);
const input = new Input();
const fixed = new FixedStep(1 / 60, 5);

// Host pause/mute integration.
og.onPause?.((v) => { if (v) { game.pause(); show('pause-screen'); } });
og.audio?.onHostMute?.((m) => audio.setMuted(m));

// ---- Screens ----
const SCREENS = ['title-screen', 'how-screen', 'levelup-screen', 'pause-screen', 'results-screen'];
function show(id) {
  SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  if (id) $('hud').classList.toggle('hidden', id !== null && id !== 'none' && id !== 'hud');
}
function hideAll() {
  SCREENS.forEach(s => $(s).classList.add('hidden'));
  $('hud').classList.remove('hidden');
}

function updateMetaLine() {
  const m = game.meta;
  const parts = [];
  if (m.best > 0) parts.push(`Best ${fmtTime(m.best)}`);
  if (m.unlocks.vigor) parts.push('Vigor unlocked');
  if (m.unlocks.edge) parts.push('Keen Edge unlocked');
  $('meta-line').textContent = parts.join('  •  ');
}
updateMetaLine();

// ---- UI actions ----
function startRun() {
  audio.unlock();
  $('audio-hint').classList.add('hidden');
  game.reset((Date.now() ^ 0x9e3779b9) >>> 0);
  hideAll();
  fixed.reset();
  toast(game.rule.name);
}
$('btn-play').onclick = startRun;
$('btn-again').onclick = startRun;
$('btn-how').onclick = () => show('how-screen');
$('btn-how-back').onclick = () => show('title-screen');
$('btn-menu').onclick = () => { game.quitToMenu(); show('title-screen'); updateMetaLine(); };
$('btn-resume').onclick = () => { game.resume(); hideAll(); };
$('btn-quit').onclick = () => { game.quitToMenu(); show('title-screen'); updateMetaLine(); };

// Level-up cards.
function buildBoonCards() {
  const wrap = $('boon-cards');
  wrap.innerHTML = '';
  $('levelup-num').textContent = game.level;
  for (const b of game.offeredBoons || []) {
    const lv = game.boonLevels[b.id] || 0;
    const card = document.createElement('div');
    card.className = 'boon-card';
    card.innerHTML = `<div class="boon-icon">${b.icon}</div>
      <div class="boon-name">${b.name}</div>
      <div class="boon-desc">${b.desc}</div>
      <div class="boon-lvl">${lv > 0 ? `RANK ${lv + 1} / ${b.max}` : 'NEW POWER'}</div>`;
    card.onclick = () => { game.chooseBoon(b.id); hideAll(); };
    wrap.appendChild(card);
  }
}

// Toast + rule banner.
function toast(text) {
  const layer = $('toast-layer');
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1450);
}
let ruleTimer = null;
function showRule(name) {
  const el = $('rule-banner');
  el.textContent = `WORLD RULE — ${name}`;
  el.classList.remove('hidden');
  clearTimeout(ruleTimer);
  ruleTimer = setTimeout(() => el.classList.add('hidden'), 4200);
}

// Results.
function showResults(e) {
  $('result-title').textContent = e.won ? 'THE CROWN FALLS' : 'YOU FELL';
  $('res-time').textContent = fmtTime(e.survived);
  $('res-kills').textContent = e.kills;
  $('res-level').textContent = e.level;
  $('res-best').textContent = fmtTime(e.best);
  const u = $('res-unlock');
  if (e.unlocked) { u.textContent = `✦ UNLOCKED — ${e.unlocked}`; u.classList.remove('hidden'); }
  else u.classList.add('hidden');
  show('results-screen');
}

// ---- HUD update ----
function updateHud() {
  const p = game.player;
  $('hp-fill').style.width = `${clamp01(p.hp / p.maxHp) * 100}%`;
  $('hp-text').textContent = Math.max(0, Math.ceil(p.hp));
  $('xp-fill').style.width = `${clamp01(game.xp / game.xpNeed) * 100}%`;
  $('lvl-text').textContent = `Lv ${game.level}`;
  $('timer').textContent = fmtTime(game.time);
  $('kill-count').textContent = `${game.kills} slain`;
  const ready = game.overloadCd <= 0;
  $('overload-wrap').classList.toggle('ready', ready);
  $('overload-fill').style.width = `${(1 - clamp01(game.overloadCd / game.stats.overloadCd)) * 100}%`;
  $('overload-label').textContent = game.overloadActive > 0 ? 'INVERTED!' : (ready ? 'READY' : 'CHARGING');
  if (game.boss.active) {
    $('rule-banner').classList.remove('hidden');
    $('rule-banner').textContent = `EMBER CROWN — ${Math.max(0, Math.ceil(game.boss.hp))} / ${game.boss.maxHp}`;
  }
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ---- Event handling from simulation ----
function handleEvents() {
  for (const e of game.drainEvents()) {
    switch (e.type) {
      case 'rule': showRule(e.name); break;
      case 'shock': renderer.triggerShock(e.x, e.z); break;
      case 'toast': toast(e.text); break;
      case 'levelup': buildBoonCards(); show('levelup-screen'); break;
      case 'gameover': showResults(e); break;
      case 'hurt': break;
    }
  }
}

// ---- Escape to pause ----
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (game.state === 'playing') { game.pause(); show('pause-screen'); }
    else if (game.state === 'paused') { game.resume(); hideAll(); }
  }
});

// First click enables audio if not already.
window.addEventListener('pointerdown', () => {
  if (!audio.enabled) { audio.unlock(); $('audio-hint').classList.add('hidden'); }
}, { once: false });

// ---- Main loop ----
let readySent = false;
let lastHud = 0;
renderer.renderer.setAnimationLoop((now) => {
  const dtReal = Math.min(0.05, (now - (fixed.last || now)) / 1000 || 0);
  if (game.state === 'playing') {
    fixed.advance(now, (dt) => {
      game.step(dt, input);
    });
    handleEvents();
    updateHud();
  } else {
    fixed.last = now;
    handleEvents();
  }
  renderer.render(game, 0, dtReal);
  input.endFrame();
  if (!readySent) { readySent = true; try { og.ready?.(); } catch {} }
});

// Expose a tiny debug handle for verification/capture tooling.
window.__emberfall = { game, renderer, audio, startRun };
