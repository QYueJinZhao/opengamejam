import { World, DT, LEVELS, BODY_TYPES } from './physics.js';
import { Renderer, ORIGIN_X, GROUND_Y } from './render.js';
import { AudioEngine } from './audio.js';
import { t, toggleLang, getLang } from './i18n.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

const BEST_KEY = 'overload-express.best.v1';
function loadBests() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; }
}
function saveBest(id, count) {
  try {
    const b = loadBests();
    if (!b[id] || count > b[id]) { b[id] = count; localStorage.setItem(BEST_KEY, JSON.stringify(b)); }
    return b[id];
  } catch { return count; }
}

let levelIdx = 0;
let world = new World(LEVELS[levelIdx].id, (Date.now() & 0xffff) + 1);
let inTitle = true;
let resultShown = false;

const pointer = {
  inside: false,
  down: false,
  tx: 0,
  ty: -200,
  sprayTimer: 0,
  lastSprayX: 0,
  lastSprayY: 0,
};

const keys = new Set();

const levelTabsEl = document.getElementById('level-tabs');
const rosterEl = document.getElementById('roster-group');
const burstEl = document.getElementById('burst-group');
const btnDepart = document.getElementById('btn-depart');
const btnCrouch = document.getElementById('btn-crouch');
const btnMute = document.getElementById('btn-mute');
const btnUndo = document.getElementById('btn-undo');
const btnReset = document.getElementById('btn-reset');
const btnLang = document.getElementById('btn-lang');
const titleModal = document.getElementById('title-modal');
const resultModal = document.getElementById('result-modal');

const levelButtons = LEVELS.map((lv, idx) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.addEventListener('click', () => switchLevel(idx));
  levelTabsEl.append(b);
  return b;
});

const SWATCHES = {
  mix: 'linear-gradient(90deg,#ef4444,#facc15,#38bdf8,#a855f7,#22c55e)',
  fat: '#EF4444',
  thin: '#38BDF8',
  tall: '#A855F7',
  auntie: '#F59E0B',
  acrobat: '#22C55E',
};

const ROSTER_IDS = ['mix', ...BODY_TYPES.map((b) => b.id)];
const rosterButtons = ROSTER_IDS.map((id) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.filter = id;
  b.style.setProperty('--swatch', SWATCHES[id] || '#facc15');
  b.innerHTML = `<span class="row-top"><span class="nm"></span><span class="cnt"></span></span><small></small>`;
  b.addEventListener('click', () => {
    audio.init();
    if (world.availableForFilter(id) > 0) setSquadFilter(id);
  });
  rosterEl.append(b);
  return b;
});

const burstButtons = [...burstEl.querySelectorAll('button')];
burstButtons.forEach((b) => {
  b.addEventListener('click', () => {
    audio.init();
    setBurstSize(Number(b.dataset.burst));
  });
});

function syncUi() {
  document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en';
  document.title = t('pageTitle');
  document.getElementById('brand-title').textContent = t('brandTitle');
  btnLang.textContent = t('langBtn');
  document.getElementById('undo-txt').textContent = t('undo');
  btnUndo.disabled = inTitle || world.phase !== 'loading' || world.undoStack.length === 0;
  btnMute.textContent = audio.muted ? t('soundOff') : t('soundOn');
  btnReset.textContent = t('reset');

  // 开屏浮层文本
  document.getElementById('start-badge').textContent = t('startBadge');
  document.getElementById('start-title').textContent = t('startTitle');
  document.getElementById('start-sub').textContent = t('startSub');
  document.getElementById('start-tip1').textContent = t('startTip1');
  document.getElementById('start-tip2').textContent = t('startTip2');
  document.getElementById('btn-start').textContent = t('startBtn');

  // 关卡标签
  levelButtons.forEach((b, i) => {
    b.textContent = `${i + 1}. ${t(`${LEVELS[i].id}_name`)}`;
    b.classList.toggle('active', i === levelIdx);
  });

  // 底部操作舱文本：左人池 | 中齐扑+撤回 | 右发车
  document.getElementById('roster-lbl').textContent = t('rosterLabel');
  document.getElementById('actions-lbl').textContent = t('actionsLabel');
  burstButtons[0].textContent = t('burst1');
  burstButtons[1].textContent = t('burst3');
  burstButtons[2].textContent = t('burst5');
  burstButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.burst) === world.burstSize));

  rosterButtons.forEach((b, idx) => {
    const id = b.dataset.filter;
    const rem = world.availableForFilter(id);
    const nm = id === 'mix' ? `${idx + 1}. ${t('mixName')}` : `${idx + 1}. ${t(`${id}_name`)}`;
    const tag = id === 'mix' ? t('mixTag') : t(`${id}_tag`);
    b.querySelector('.nm').textContent = nm;
    b.querySelector('.cnt').textContent = `×${rem}`;
    b.querySelector('small').textContent = tag;
    b.disabled = world.phase !== 'loading' || rem <= 0;
    b.classList.toggle('active', id === world.squadFilter && rem > 0);
  });

  // 发车 / 缩头按钮
  document.getElementById('depart-txt').textContent = t('departBtn');
  document.getElementById('depart-sub').textContent = t('departSub');
  document.getElementById('crouch-txt').textContent = t('crouchBtn');
  document.getElementById('crouch-sub').textContent = t('crouchSub');

  const isLoading = world.phase === 'loading';
  const isRunning = world.phase === 'running';
  btnDepart.hidden = !isLoading;
  btnCrouch.hidden = !isRunning;
  btnCrouch.classList.toggle('held', world.crouching);
  titleModal.hidden = !inTitle;

  if (resultShown) renderResultText();
}

function setSquadFilter(id) {
  world.squadFilter = id;
  syncUi();
}

function setBurstSize(n) {
  world.burstSize = n;
  syncUi();
}

function cycleBurst() {
  const seq = [1, 3, 5];
  const next = seq[(seq.indexOf(world.burstSize) + 1) % seq.length];
  setBurstSize(next);
  renderer.addPop(ORIGIN_X, GROUND_Y - 260, t('popBurst', { n: next }), '#FDE047', 22);
}

function switchLevel(idx) {
  levelIdx = (idx + LEVELS.length) % LEVELS.length;
  inTitle = false;
  restart();
}

function restart() {
  const burst = world.burstSize;
  world = new World(LEVELS[levelIdx].id, ((Date.now() ^ (Math.random() * 65535)) & 0xffff) + 1);
  world.burstSize = burst;
  resultShown = false;
  resultModal.hidden = true;
  pointer.down = false;
  syncUi();
}

document.getElementById('btn-start').addEventListener('click', () => {
  audio.init();
  inTitle = false;
  audio.whistle();
  syncUi();
});

btnDepart.addEventListener('click', () => {
  audio.init();
  if (inTitle) { inTitle = false; syncUi(); return; }
  world.depart();
  syncUi();
});

btnReset.addEventListener('click', () => {
  audio.init();
  inTitle = false;
  restart();
});

btnUndo.addEventListener('click', () => {
  audio.init();
  if (!inTitle && world.undoLastBatch() > 0) syncUi();
});

btnMute.addEventListener('click', () => {
  audio.init();
  audio.toggleMute();
  syncUi();
});

btnLang.addEventListener('click', () => {
  toggleLang();
  syncUi();
});

btnCrouch.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.init();
  world.crouching = true;
  syncUi();
});
const stopCrouchBtn = () => { world.crouching = false; syncUi(); };
btnCrouch.addEventListener('pointerup', stopCrouchBtn);
btnCrouch.addEventListener('pointercancel', stopCrouchBtn);
btnCrouch.addEventListener('pointerleave', stopCrouchBtn);

document.getElementById('res-retry').addEventListener('click', restart);
document.getElementById('res-next').addEventListener('click', () => switchLevel(levelIdx + 1));

// ---------- 画布群控交互 ----------
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!inTitle && world.phase === 'loading') {
    audio.init();
    cycleBurst();
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2 || inTitle) return;
  audio.init();
  const pos = renderer.clientToTrain(e.clientX, e.clientY, world);
  pointer.inside = true;
  pointer.tx = pos.x;
  pointer.ty = pos.y;

  if (world.phase === 'loading') {
    pointer.down = true;
    pointer.sprayTimer = 0;
    pointer.lastSprayX = pos.x;
    pointer.lastSprayY = pos.y;
    if (world.launchAt(pos.x, pos.y) > 0) syncUi();
  } else if (world.phase === 'running') {
    world.crouching = true;
    syncUi();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const pos = renderer.clientToTrain(e.clientX, e.clientY, world);
  pointer.inside = true;
  pointer.tx = pos.x;
  pointer.ty = pos.y;
});

const releasePointer = () => {
  pointer.down = false;
  if (world.phase === 'running' && !keys.has('Space') && !keys.has('ArrowDown') && !keys.has('KeyS')) {
    world.crouching = false;
    syncUi();
  }
};
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
  }
  audio.init();
  keys.add(e.code);

  if (e.repeat) return;
  if (inTitle && (e.code === 'Enter' || e.code === 'Space')) {
    inTitle = false;
    audio.whistle();
    syncUi();
    return;
  }
  if (e.code === 'KeyR') { inTitle = false; restart(); return; }
  if ((e.code === 'KeyZ' || e.code === 'Backspace') && !inTitle && world.phase === 'loading') {
    if (world.undoLastBatch() > 0) syncUi();
    return;
  }
  if (e.code === 'Enter' && world.phase === 'loading') {
    world.depart();
    syncUi();
    return;
  }
  if (e.code === 'KeyQ' || e.code === 'KeyE') {
    if (world.phase === 'loading') cycleBurst();
    return;
  }
  if (/^Digit[1-6]$/.test(e.code)) {
    const id = ROSTER_IDS[Number(e.code.slice(5)) - 1];
    if (id && world.availableForFilter(id) > 0) setSquadFilter(id);
  }
});

window.addEventListener('keyup', (e) => { keys.delete(e.code); });

// ---------- 事件处理 ----------
function handleEvents() {
  for (const ev of world.drainEvents()) {
    if (ev.type === 'beat') {
      audio.railBeat(ev.tick, ev.running);
    } else if (ev.type === 'launch') {
      audio.launch(ev.count, ev.perfect);
      // 极简清爽小浮标并抬高到人堆上方空域，绝不挡住车顶小人笑脸
      const popY = Math.min(GROUND_Y - 265, GROUND_Y + ev.y - 82);
      renderer.addPop(ORIGIN_X + ev.x, popY, `+${ev.count}`, ev.count > 1 ? '#FDE047' : '#34D399', ev.count > 1 ? 21 : 17);
      syncUi();
    } else if (ev.type === 'undo') {
      audio.undo();
      renderer.addPop(ORIGIN_X, GROUND_Y - 275, t('popUndo', { n: ev.count }), '#94A3B8', 19);
      syncUi();
    } else if (ev.type === 'braking') {
      audio.brakeScreech();
      renderer.addShake(5.5);
    } else if (ev.type === 'grab') {
      audio.grab(ev.grips > 0, ev.typeId === 'fat');
      if (ev.typeId === 'fat') renderer.addShake(4.2);
    } else if (ev.type === 'poolEmpty') {
      renderer.addPop(ORIGIN_X, GROUND_Y - 290, t('popPoolDone'), '#34D399', 24);
      syncUi();
    } else if (ev.type === 'depart') {
      audio.whistle();
      renderer.addShake(8);
      renderer.addPop(ORIGIN_X, GROUND_Y - 260, t('popDepart', { n: ev.count }), '#FDE047', 30);
      syncUi();
    } else if (ev.type === 'needPeople') {
      renderer.addPop(ORIGIN_X, GROUND_Y - 240, t('popEmpty'), '#FB7185', 22);
    } else if (ev.type === 'snap') {
      audio.snap();
    } else if (ev.type === 'bonk') {
      audio.bonk();
      renderer.addShake(11);
      renderer.burstBonk(ev.x, ev.y);
      renderer.addPop(ORIGIN_X + ev.x, GROUND_Y + ev.y - 26, t('popBonk', { name: t(`${ev.typeId}_name`) }), '#FB7185', 20);
    } else if (ev.type === 'fall') {
      audio.fall();
    } else if (ev.type === 'arrived') {
      audio.fanfare();
      if (ev.count > 0) renderer.burstConfetti();
      syncUi();
    }
  }
}

let lastBest = 0;
function renderResultText() {
  const count = world.finalCount;
  const rank = world.rankOf(count);
  document.getElementById('res-rank').textContent = rank.name;
  document.getElementById('res-title').textContent = count > 0
    ? t('resWin', { name: t(`${world.level.id}_name`) })
    : t('resZero');
  document.getElementById('res-count').textContent = String(count);
  document.getElementById('res-unit').textContent = t('resUnit');
  document.getElementById('res-peak-lbl').textContent = t('resPeak');
  document.getElementById('res-fallen-lbl').textContent = t('resFallen');
  document.getElementById('res-best-lbl').textContent = t('resBest');
  document.getElementById('res-peak').textContent = t('unitPerson', { n: world.peakOnBoard });
  document.getElementById('res-fallen').textContent = t('unitPerson', { n: world.fallenTotal });
  document.getElementById('res-best').textContent = t('unitPerson', { n: lastBest });
  document.getElementById('res-retry').textContent = t('resRetry');
  document.getElementById('res-next').textContent = t('resNext');
}

function showResult() {
  resultShown = true;
  world.finalCount = world.onBoardCount();
  lastBest = saveBest(world.level.id, world.finalCount);
  renderResultText();
  resultModal.hidden = false;
}

// ---------- 主循环 ----------
let acc = 0;
let last = performance.now();

function frame(now) {
  const raw = Math.min(0.06, (now - last) / 1000);
  last = now;

  if (!inTitle) {
    if (world.phase === 'running') {
      const keyCrouch = keys.has('Space') || keys.has('ArrowDown') || keys.has('KeyS');
      if (keyCrouch) world.crouching = true;
      else if (!pointer.down && !btnCrouch.matches(':active')) world.crouching = false;

      const l = keys.has('ArrowLeft') || keys.has('KeyA');
      const r = keys.has('ArrowRight') || keys.has('KeyD');
      world.leanInput = (r ? 1 : 0) - (l ? 1 : 0);
      btnCrouch.classList.toggle('held', world.crouching);
    } else {
      world.crouching = false;
      world.leanInput = 0;
    }

    if (world.phase === 'loading' && pointer.down) {
      pointer.sprayTimer += raw;
      const dist = Math.hypot(pointer.tx - pointer.lastSprayX, pointer.ty - pointer.lastSprayY);
      const interval = world.burstSize === 1 ? 0.16 : world.burstSize === 3 ? 0.30 : 0.40;
      if (pointer.sprayTimer >= interval && (dist > 18 || pointer.sprayTimer >= interval * 1.45)) {
        pointer.sprayTimer = 0;
        pointer.lastSprayX = pointer.tx;
        pointer.lastSprayY = pointer.ty;
        if (world.launchAt(pointer.tx, pointer.ty) > 0) syncUi();
      }
    }

    acc += raw;
    let steps = 0;
    while (acc >= DT && steps < 10) {
      world.step(DT);
      handleEvents();
      acc -= DT;
      steps++;
    }
    if (steps >= 10) acc = 0;

    if (world.phase === 'arrived' && !resultShown && world.settleTime >= 1.35) {
      showResult();
    }
  }

  renderer.updateFx(raw, world);
  renderer.draw(world, pointer, !inTitle);
  requestAnimationFrame(frame);
}

syncUi();
requestAnimationFrame(frame);
