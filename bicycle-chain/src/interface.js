import { isFlipDie, isPip, pipOf } from './dice.js';
import { MODES, tierProgress } from './modes.js';
import { CFG, ballSkin, comboTierIndex } from './sim.js';
import { formatDistance, getLanguage, t, toggleLanguage } from './i18n.js';

const visuals = {
  standard: { glyph: '◎', color: '#dbe1ff' },
  dice: { glyph: '⚄', color: '#c9f3ff' },
  speed: { glyph: '»', color: '#ffe9b8' },
};
const specialDice = { wilddie: 'wildDie', bombdie: 'bombDie', blankdie: 'blankDie' };

function iconName(ci, rules) {
  if (rules === 'dice') {
    if (isPip(ci)) return t(isFlipDie(ci) ? 'flipDie' : 'die', { pip: pipOf(ci) });
    return t(specialDice[ballSkin(ci).shape]);
  }
  return t(ballSkin(ci).shape);
}

function withSlots(value) {
  return formatDistance(value) + ' ' + t('slots');
}

function updateText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function updateProgress(element, value) {
  if (element.value !== value) element.value = value;
}

function updatePressed(button, value) {
  const pressed = String(value);
  if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
}

export class ArcadeInterface {
  constructor(actions) {
    this.actions = actions;
    this.elements = new Map([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
    this.workbench = document.querySelector('.workbench');
    this.controlButtons = [...document.querySelectorAll('[data-input]')];
    this.icons = [...document.querySelectorAll('.queue canvas')];
    this.iconKeys = new Map();

    this.modeButtons = MODES.map((mode, index) => {
      const view = visuals[mode.id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mode-button';
      button.innerHTML = '<span class="mode-glyph" aria-hidden="true"></span>' +
        '<span><span class="mode-name"></span><span class="mode-detail"></span></span>' +
        '<span class="mode-duration"></span>';
      button.firstElementChild.textContent = view.glyph;
      button.style.setProperty('--mode-color', view.color);
      button.addEventListener('click', () => actions.select(index));
      this.elements.get('mode-list').append(button);
      return button;
    });

    for (const [id, activate] of Object.entries({
      start: actions.start, retry: actions.start, pause: actions.pause, resume: actions.pause,
      'change-mode': actions.title, music: actions.music, audio: actions.audio,
      contrast: actions.contrast, language: toggleLanguage,
    })) this.elements.get(id).addEventListener('click', activate);

    for (const button of this.controlButtons) {
      const code = button.dataset.input;
      const release = event => actions.release(event.pointerId);
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        actions.press(event.pointerId, code);
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }
  }

  localize() {
    const language = getLanguage();
    if (this.language === language) return;
    this.language = language;
    document.documentElement.lang = language;
    document.title = t('title');
    this.elements.get('language').lang = t('languageCode');
    for (const el of document.querySelectorAll('[data-text]')) updateText(el, t(el.dataset.text));
    for (const el of document.querySelectorAll('[data-label]')) el.setAttribute('aria-label', t(el.dataset.label));
    for (const el of document.querySelectorAll('[data-tooltip]')) el.title = t(el.dataset.tooltip);
    MODES.forEach(({ id, cfg }, index) => {
      const button = this.modeButtons[index];
      updateText(button.querySelector('.mode-name'), t(id));
      updateText(button.querySelector('.mode-detail'), t(id + 'Detail'));
      updateText(button.querySelector('.mode-duration'), t('seconds', { value: cfg.levelTime }));
    });
  }

  update(game, ui, paused, pauseVisible, renderer) {
    this.localize();
    const el = id => this.elements.get(id);
    const label = (id, value) => updateText(el(id), value);
    const mode = game.mode;
    const isPlaying = ui.mode === 'play';
    const isTitle = ui.mode === 'title';
    const stateKey = [ui.mode, mode.id, paused, pauseVisible, this.language].join('/');
    if (stateKey !== this.stateKey) {
      const wasPaused = !el('pause-panel').hidden;
      const initial = !this.stateKey;
      const stateChanged = this.workbench.dataset.state !== ui.mode;
      this.stateKey = stateKey;
      this.workbench.dataset.state = ui.mode;
      el('menu-panel').hidden = !isTitle;
      el('run-panel').hidden = !isPlaying;
      el('result-panel').hidden = ui.mode !== 'result';
      el('pause-panel').hidden = !pauseVisible;
      el('pause').disabled = pauseVisible;
      for (const button of this.controlButtons) button.disabled = !isPlaying || paused;
      label('stage-title', t(mode.id));
      label('stage-rule', t(mode.id + 'Rule'));
      label('stage-tag', t('stageTag', { slots: mode.geo.n, seconds: mode.cfg.levelTime }));
      label('mode-tip', t(mode.id + 'Tip', { slots: CFG.spinFireDist }));
      if (stateChanged && !isTitle && window.scrollY > 0) window.scrollTo(0, 0);
      if (pauseVisible && !wasPaused) el('resume').focus({ preventScroll: true });
      else if (!pauseVisible && (wasPaused || (stateChanged && !initial))) {
        el(ui.mode === 'result' ? 'result-title' : 'stage-title').focus({ preventScroll: true });
      }
    }

    updatePressed(el('audio'), ui.muted);
    updatePressed(el('contrast'), ui.cb);
    label('music', t(ui.bgm === 'file' ? 'ambient' : 'music'));
    el('music').title = ui.bgmTitle ? ui.bgmTitle + ' / ' + t('musicTitle') : t('musicTitle');
    label('audio', t(ui.muted ? 'muted' : 'sound'));
    for (const button of this.controlButtons) {
      const held = String(isPlaying && !paused && this.actions.held(button.dataset.input));
      if (button.dataset.held !== held) button.dataset.held = held;
    }

    if (isTitle) {
      this.modeButtons.forEach((button, index) => updatePressed(button, index === ui.sel));
      label('menu-best', ui.bests[mode.id] != null ? withSlots(ui.bests[mode.id]) : '—');
      el('board-note').dataset.ready = 'false';
      label('board-note', t('howToScore', { slots: CFG.spinFireDist }));
      return;
    }

    const tier = tierProgress(game.score, mode);
    const nextTier = tier.next
      ? t('rankNext', { gap: formatDistance(tier.gap), rank: tier.next.name })
      : t('rankMax');
    if (ui.mode === 'result') {
      el('board-note').dataset.ready = 'false';
      label('board-note', t('stopped'));
      if (this.resultGame !== game || this.resultLanguage !== this.language) {
        this.resultGame = game;
        this.resultLanguage = this.language;
        this.result(game, ui, tier.tier, nextTier);
      }
      return;
    }

    const time = Math.ceil(game.timeLeft());
    const distance = Math.floor(game.spinLoad() * CFG.spinFireDist * 10) / 10;
    const queued = game.occupied();
    const alert = queued >= Math.ceil(mode.geo.n * 0.78);
    const inFlight = game.balls.length;
    const comboTier = comboTierIndex(game.combo);
    const speed = Math.abs(game.v);
    let drive = 'cruising';
    if (paused) drive = 'paused';
    else if (game.input) drive = game.input * game.v < 0 ? 'reversing' : 'accelerating';
    label('turn-speed', formatDistance(speed));
    label('drive-state', t(drive));
    el('drive-gauge').dataset.drive = drive;
    updateProgress(el('speed-gauge'), speed / CFG.vMax);
    label('score', formatDistance(game.score));
    label('time', t('seconds', { value: time }));
    label('rank', tier.tier.name);
    el('time').dataset.urgent = String(time <= 15);
    label('rank-next', nextTier);
    updateProgress(el('rank-bar'), tier.p);
    label('air', inFlight ? t('inFlight', { count: inFlight }) : '');
    label('charge', formatDistance(distance) + ' / ' + CFG.spinFireDist + ' ' + t('slots'));
    updateProgress(el('charge-bar'), distance / CFG.spinFireDist);
    label('load', queued + ' / ' + mode.geo.n);
    updateProgress(el('load-bar'), queued / mode.geo.n);
    el('load-warning').hidden = !alert;
    el('load-warning').parentElement.dataset.alert = String(alert);
    label('combo', game.combo ? String(game.combo) + (comboTier ? ' / ' + t('combo' + comboTier) : '') : '—');

    el('board-note').dataset.ready = String(inFlight > 0);
    label('board-note', inFlight ? t('aim') : t('launch', { slots: CFG.spinFireDist }));
    game.queues[0].forEach((ci, index) => {
      const canvas = this.icons[index];
      const key = [game.rules, ci, ui.cb, renderer.artReady, this.language].join('/');
      if (this.iconKeys.get(canvas) === key) return;
      this.iconKeys.set(canvas, key);
      renderer.drawIcon(canvas, ci, ui.cb);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', iconName(ci, game.rules));
    });
  }

  result(game, ui, tier, nextTier) {
    const label = (id, value) => updateText(this.elements.get(id), value);
    label('result-reason', t(game.deadReason === 'overflow' ? 'overflow' : 'timeUp'));
    label('final-score', formatDistance(game.score));
    label('final-rank', tier.name);
    label('result-next', nextTier);
    const stats = [
      [ui.newBest ? 'record' : 'best', withSlots(ui.best)],
      ['averageSpeed', t('speedValue', { value: formatDistance(game.spinDist / Math.max(1, game.time)) })],
      ['clears', game.clears], ['maxChain', game.maxChain], ['maxCombo', game.maxCombo],
    ];
    if (game.rules === 'dice') {
      stats.push(['longestRun', game.longestRun], ['jackpots', game.jackpots],
        ['timeBonus', t('seconds', { value: Math.round(game.timeBonus) })]);
    } else {
      stats.push(['drops', game.drops], ['sweeps', game.sweeps]);
    }

    this.elements.get('result-stats').replaceChildren(...stats.map(([name, value]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const desc = document.createElement('dd');
      term.textContent = t(name);
      desc.textContent = value;
      row.append(term, desc);
      return row;
    }));
  }
}
