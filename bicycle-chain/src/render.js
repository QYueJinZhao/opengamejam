import { t } from './i18n.js';
// Canvas2D 渲染层。虚拟画布 1200×740，按窗口等比缩放。
//
// 几何全部动态：轮径 / 槽数 / 射口位置由当前 Game 决定。
// 球用**形状**做第一编码：4 基础色（八面体 / 倒角方核 / 星芒 / 三角棱锥）
// + 3 特殊球（彩虹星晶 / 机械雷 / 锈铁块），7 个剪影互不相似。
// 色相退成第二编码，所以高对比模式（V 键）只需要加强图底分离，不需要额外形符。

import { C, R, N, D, pointAt, tangentAt, normalAt, mod } from './geom.js';
import { CFG, PALETTE, ballSkin, rulesOf } from './sim.js';
import { pipOf, isFlipDie } from './dice.js';

const VW = 1200, VH = 740;

const CX = 600, CY = 458;
const PI2 = Math.PI * 2;
const ARCADE_ART = new URL('../assets/arcade-atlas.png', import.meta.url).href;
const SPRITES = {
  0: [58, 201, 327, 334],
  1: [474, 212, 303, 309],
  2: [852, 191, 351, 337],
  3: [51, 767, 339, 301],
  wheel: [450, 740, 343, 352],
  nozzle: [879, 709, 301, 405],
};

const FONT = '"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Consolas,"Cascadia Mono",monospace';
const ARCADE_BEADS = [
  { base: '#eb51ce', light: '#ffb8f4', dark: '#81237d' },
  { base: '#ffce32', light: '#fff0a2', dark: '#9f5a06' },
  { base: '#ff7450', light: '#ffbdac', dark: '#ac3427' },
  { base: '#35d9e4', light: '#b5faff', dark: '#147c9c' },
].map((color, ci) => ({ ...PALETTE[ci], ...color }));

function beadSkin(ci, contrast = false) {
  return !contrast && rulesOf() === 'color' && ARCADE_BEADS[ci] ? ARCADE_BEADS[ci] : ballSkin(ci);
}

// ---- 动态几何缓存 ----
let S = 30;
let BEAD_R = 15;
let CHANNEL_W = 33;
let IMPACTS = [];
let NOZZLES = [];
let geoKey = '';

function syncGeo(game) {
  const key = `${game.modeId}:${N}:${C}:${R}`;
  if (key === geoKey) return;
  geoKey = key;

  const nozzleGap = CFG.nozzleGap;
  // Keep the top-mounted feeder and the bottom rail within the same view for every mode.
  S = Math.min(48, 383 / (R + nozzleGap), 1040 / (2 * (C + R)));
  BEAD_R = (D * S) / 2 * 0.94;
  CHANNEL_W = D * S * 1.06;

  IMPACTS = [];
  NOZZLES = [];
  for (const off of game.nozzleOff) {
    const s = mod(off, N) * D;
    const p = pointAt(s);
    const nrm = normalAt(s);
    IMPACTS.push(p);
    // 两个点要分开：
    //   muzzle —— 炮口，也就是球真正的起飞点（轨道外 nozzleGap 世界单位）
    //   pivot  —— 炮身局部坐标系的原点。cannon() 里炮口画在局部 +23px，
    //             所以 pivot 必须比 muzzle 再往外 23px，炮口的椭圆才正好
    //             落在球起飞的位置上。上一版两者混用，球是从炮管中段冒出来的。
    const displayGap = nozzleGap * 0.67;
    const mx = p.x + nrm.x * displayGap;
    const my = p.y + nrm.y * displayGap;
    NOZZLES.push({
      x: mx + nrm.x * (23 / S),
      y: my + nrm.y * (23 / S),
      nx: nrm.x, ny: nrm.y,
    });
  }
}

/** 弧长 → 屏幕坐标（供特效层复用） */
export function arcToScreen(s) {
  const p = pointAt(s);
  return { x: CX + p.x * S, y: CY + p.y * S };
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.t = 0;
    this.bgCanvas = null;
    this.bgKey = '';
    this.shakeX = 0;
    this.shakeY = 0;
    this.artReady = false;
    this.art = new Image();
    this.art.addEventListener('load', () => {
      this.artReady = true;
      this.previewGame = null;
    }, { once: true });
    this.art.src = ARCADE_ART;
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = this.cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.cv.width === w && this.cv.height === h) return;
    this.cv.width = w;
    this.cv.height = h;
    this.scale = Math.min(w / VW, h / VH);
    this.offX = (w - VW * this.scale) / 2;
    this.offY = (h - VH * this.scale) / 2;
    this.bgKey = '';
    this.previewGame = null;
  }

  prepare(game) {
    syncGeo(game);
  }

  drawIcon(canvas, ci, contrast) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    if (ci == null) return;
    const boardContext = this.ctx;
    this.ctx = ctx;
    try {
      this.ballBody(width / 2, height / 2, Math.min(width, height) * 0.33, ci, contrast);
    } finally {
      this.ctx = boardContext;
    }
  }

  drawSprite(key, x, y, size) {
    const [sx, sy, sw, sh] = SPRITES[key];
    const scale = size / Math.max(sw, sh);
    const w = sw * scale, h = sh * scale;
    this.ctx.drawImage(this.art, sx, sy, sw, sh, x - w / 2, y - h / 2, w, h);
  }

  toScreen(p) {
    return { x: CX + p.x * S, y: CY + p.y * S };
  }

  /**
   * 炮口的世界/屏幕位置。炮身会按 aimAngle 左右倾斜，
   * 所以枪口不再是一个固定点——飞行轨迹和枪口闪光都必须从这里出发，
   * 否则球会从"炮身旁边"凭空出现。
   */
  muzzleScreen(game, idx, angle = game.aimAngle || 0) {
    const nz = NOZZLES[idx];
    if (!nz) return null;
    const p = this.toScreen(nz);   // pivot
    const ang = Math.atan2(nz.nx, -nz.ny) - angle * Math.PI / 180;
    return { x: p.x - Math.sin(ang) * 23, y: p.y + Math.cos(ang) * 23 };
  }

  begin(fx) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#edeaff';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    if (!this.motion.matches && fx && fx.shake > 0.05) {
      const a = fx.shake;
      this.shakeX = (Math.random() - 0.5) * a;
      this.shakeY = (Math.random() - 0.5) * a;
      ctx.translate(this.shakeX, this.shakeY);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  ensureStaticLayer() {
    const key = `${geoKey}|${this.cv.width}x${this.cv.height}`;
    if (this.bgKey === key) return;
    const cv = this.bgCanvas || document.createElement('canvas');
    cv.width = this.cv.width;
    cv.height = this.cv.height;
    const c = cv.getContext('2d', { alpha: false });
    const real = this.ctx;
    this.ctx = c;
    try {
      c.fillStyle = '#edeaff';
      c.fillRect(0, 0, cv.width, cv.height);
      c.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
      const table = c.createRadialGradient(474, 228, 72, 600, 387, 670);
      table.addColorStop(0, '#faf8ff');
      table.addColorStop(0.66, '#efecff');
      table.addColorStop(1, '#edeaff');
      c.fillStyle = table;
      c.fillRect(0, 0, VW, VH);
      this.plate();
    } finally {
      this.ctx = real;
    }
    this.bgCanvas = cv;
    this.bgKey = key;
  }

  /** 把缓存的静态层贴上。震屏在主画布上已经算过，这里用同样的位移补上。 */
  drawStaticLayer() {
    if (!this.bgCanvas) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.shakeX || this.shakeY) {
      ctx.translate(this.shakeX * this.scale, this.shakeY * this.scale);
    }
    ctx.drawImage(this.bgCanvas, 0, 0);
    ctx.restore();
  }

  draw(game, ui, fx) {
    syncGeo(game);
    const preview = ui.mode === 'title';
    if (preview && this.previewGame === game && this.previewContrast === ui.cb) return;
    this.previewGame = preview ? game : null;
    this.previewContrast = ui.cb;
    this.t = ui.t;
    this.begin(fx);
    this.ensureStaticLayer();
    this.drawStaticLayer();
    this.background(game);
    this.core();
    this.flywheels(game);
    this.groove();
    if (preview) {
      this.previewBeads(game, ui);
    } else {
      this.speedStreaks(game);
      this.slotTicks(game);
      this.pads(game);
      this.beads(game, ui);
      this.ghosts(fx);
    }
    this.reticle(game, preview);
    if (preview) this.drawProjectile(game, { idx: 0, ci: game.queues[0][0], t: 0.57, dur: 1 }, ui.cb);
    else this.projectile(game, ui.cb);
    this.nozzle(game, ui);

    if (!preview) {
      this.beams(fx);
      this.shocks(fx);
      this.particles(fx);
      this.comboGlow(fx);
      this.floats(fx);
      if (!this.motion.matches && fx.flash > 0.001) {
        this.ctx.fillStyle = `rgba(255,234,198,${Math.min(0.25, fx.flash)})`;
        this.ctx.fillRect(0, 0, VW, VH);
      }
    }
  }

  // ---------- 背景 ----------
  background(game) {
    if (!game) return;
    const ctx = this.ctx;
    const occ = game.occupied();
    if (occ >= N * 0.78) {
      const k = Math.min(1, (occ - N * 0.78) / (N * 0.22));
      const pulse = 0.5 + 0.5 * Math.sin(this.t * (4 + k * 8));
      const rg = ctx.createRadialGradient(CX, CY, 260, CX, CY, 660);
      rg.addColorStop(0, 'rgba(255,60,80,0)');
      rg.addColorStop(1, `rgba(255,50,70,${0.03 + 0.12 * k * pulse})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, VW, VH);
    }
  }
  // ---------- 跑道 ----------
  stadiumPath(ctx, pad = 0) {
    const w = 2 * (C + R) * S + pad;
    const h = 2 * R * S + pad;
    ctx.beginPath();
    ctx.roundRect(CX - w / 2, CY - h / 2, w, h, h / 2);
  }

  plate() {
    const ctx = this.ctx;
    const pad = CHANNEL_W + 114;
    const halfH = R * S + pad / 2;
    const y0 = CY - halfH, y1 = CY + halfH;

    ctx.save();
    ctx.shadowColor = '#40308b66';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 20;
    ctx.translate(0, 19);
    this.stadiumPath(ctx, pad);
    ctx.fillStyle = '#6255bd';
    ctx.fill();
    ctx.restore();

    // Two rubber feet extend a little beyond the rounded cabinet.
    for (const x of [CX - (C + R * 0.2) * S, CX + (C + R * 0.2) * S]) {
      const rubber = ctx.createLinearGradient(0, y1 - 8, 0, y1 + 33);
      rubber.addColorStop(0, '#484067');
      rubber.addColorStop(1, '#29233c');
      ctx.beginPath();
      ctx.roundRect(x - 25, y1 - 10, 50, 43, 9);
      ctx.fillStyle = rubber;
      ctx.fill();
    }

    ctx.save();
    ctx.translate(0, 13);
    this.stadiumPath(ctx, pad);
    const edge = ctx.createLinearGradient(0, y0, 0, y1 + 13);
    edge.addColorStop(0, '#a7a5ec');
    edge.addColorStop(0.67, '#8a7ddb');
    edge.addColorStop(1, '#5d54b7');
    ctx.fillStyle = edge;
    ctx.fill();
    ctx.restore();

    const shell = ctx.createLinearGradient(0, y0, 0, y1);
    shell.addColorStop(0, '#eeebff');
    shell.addColorStop(0.10, '#ccc9f8');
    shell.addColorStop(0.51, '#b8b5f0');
    shell.addColorStop(0.86, '#9d94e8');
    shell.addColorStop(1, '#a49bed');
    this.stadiumPath(ctx, pad);
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const sheen = ctx.createRadialGradient(CX - C * S, y0 + 20, 2, CX - C * S, y0 + 20, halfH * 2.5);
    sheen.addColorStop(0, '#ffffff77');
    sheen.addColorStop(1, '#ffffff00');
    ctx.fillStyle = sheen;
    ctx.fillRect(CX - (C + R) * S - pad / 2, y0, 2 * (C + R) * S + pad, 2 * halfH);
    ctx.restore();

    // Inset TPE bumpers cap the two curved ends.
    ctx.lineCap = 'round';
    const radius = halfH - 16;
    const bumper = ctx.createLinearGradient(0, CY - radius * 0.25, 0, CY + radius * 0.25);
    bumper.addColorStop(0, '#ffbc78');
    bumper.addColorStop(0.38, '#ff9657');
    bumper.addColorStop(1, '#eb6b32');
    for (const sign of [-1, 1]) {
      const x = CX + sign * C * S;
      const angle = sign < 0 ? Math.PI : 0;
      ctx.beginPath();
      ctx.arc(x, CY, radius, angle - 0.25, angle + 0.25);
      ctx.strokeStyle = '#7251a682';
      ctx.lineWidth = 25;
      ctx.stroke();
      ctx.strokeStyle = bumper;
      ctx.lineWidth = 22;
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Molded front grip in the accent color.
    ctx.beginPath();
    ctx.roundRect(CX - 55, y1 - 24, 110, 28, [15, 15, 9, 9]);
    const grip = ctx.createLinearGradient(0, y1 - 24, 0, y1 + 4);
    grip.addColorStop(0, '#ffab68');
    grip.addColorStop(1, '#ef7937');
    ctx.fillStyle = grip;
    ctx.fill();
  }

  core() {
    const ctx = this.ctx;
    const halfH = R * S - (CHANNEL_W + 9) / 2;
    const panel = ctx.createLinearGradient(0, CY - halfH, 0, CY + halfH);
    panel.addColorStop(0, '#eeecff');
    panel.addColorStop(0.15, '#cecbfa');
    panel.addColorStop(0.7, '#bab4ed');
    panel.addColorStop(1, '#a79ee3');
    this.stadiumPath(ctx, -CHANNEL_W - 9);
    ctx.fillStyle = panel;
    ctx.fill();
  }

  flywheels(game) {
    const r = Math.max(20, R * S * 0.45);
    for (const x of [CX - C * S, CX + C * S]) {
      this.gear(x, CY, r, game.phase * PI2 / N);
    }
  }

  gear(x, y, r, angle) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 3, r + 5, 0, PI2);
    ctx.fillStyle = '#4d3f9b77';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, 0, PI2);
    ctx.fillStyle = '#8e85d3';
    ctx.fill();
    ctx.rotate(angle);
    if (this.artReady) {
      this.drawSprite('wheel', 0, 0, 2 * r);
    } else {
      const face = ctx.createLinearGradient(0, -r, 0, r);
      face.addColorStop(0, '#7479ff');
      face.addColorStop(1, '#2f25aa');
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, PI2);
      ctx.fillStyle = face;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.54, -Math.PI, -0.52);
      ctx.strokeStyle = '#c7c7ff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  groove() {
    const ctx = this.ctx;
    const y0 = CY - R * S - CHANNEL_W / 2;
    const y1 = CY + R * S + CHANNEL_W / 2;
    const bevel = ctx.createLinearGradient(0, y0, 0, y1);
    bevel.addColorStop(0, '#8777ce');
    bevel.addColorStop(0.43, '#a69be7');
    bevel.addColorStop(1, '#e0d9ff');
    this.stadiumPath(ctx);
    ctx.strokeStyle = bevel;
    ctx.lineWidth = CHANNEL_W + 17;
    ctx.stroke();
    const wall = ctx.createLinearGradient(0, y0, 0, y1);
    wall.addColorStop(0, '#171337');
    wall.addColorStop(0.32, '#272252');
    wall.addColorStop(0.66, '#201d46');
    wall.addColorStop(1, '#141232');
    ctx.strokeStyle = wall;
    ctx.lineWidth = CHANNEL_W + 3;
    ctx.stroke();
  }

  // ---------- 主动槽（+1 翻面 / ×2 镀金）----------
  /**
   * 轨道上的两块功能格。
   *
   * 关于"看不看得懂"——上一版 ×2 槽死在这里（REVIEW §18.4）。它当时的判定是
   * "消除段的中心弧长落在槽内"，回报只是数字翻倍，玩家根本建立不起模型。
   * 这一版的规则是"**骰子落在这一格**"，回报立刻画在那颗骰子身上：
   * 点数 +1，或者一道金环。所以这里的绘制任务很明确：
   *   1. 让人一眼看出"这是一格特殊槽"，不是装饰；  2. 让人看出它现在开没开；
   *   3. 当它正好是这一发的落点时，喊出来。
   */
  pads(game) {
    if (!game.pads || !game.pads.length) return;
    const ctx = this.ctx;
    const pred = this.predSlots(game);

    for (const pad of game.pads) {
      const live = game.time >= pad.at;
      const s = mod(pad.slot + game.phase, N) * D;
      const p = this.toScreen(pointAt(s));
      const tan = tangentAt(s);
      const ang = Math.atan2(tan.y, tan.x);
      const w = Math.max(13, D * S * 0.92);
      const h = CHANNEL_W * 0.84;
      const hot = pred.includes(pad.slot);
      // 骰子的镀金槽和扑克的筹码槽共用同一种金色：它们都是"这一段消除 ×2"。
      const gold = pad.kind === 'x2';
      const col = gold ? '255,214,90' : '120,235,255';

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);

      // 槽底：比轨道更暗的一格，先让"这里有一块东西"成立
      if (live) {
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 5);
        ctx.fillStyle = `rgba(${col},0.12)`;
        ctx.fill();
      }

      // 边框：启用是实线发光，未启用是虚线
      const pulse = 0.55 + 0.45 * Math.sin(this.t * (hot ? 9 : 3.2) + pad.id);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 5);
      if (live) {
        ctx.strokeStyle = `rgba(${col},${(0.45 + 0.45 * pulse).toFixed(3)})`;
        ctx.lineWidth = hot ? 2.2 : 1.4;
        ctx.shadowColor = `rgba(${col},0.9)`;
        ctx.shadowBlur = hot ? 14 : 7;
      } else {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(140,170,210,0.22)';
        ctx.lineWidth = 1.2;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);

      // 字标：+1 / ×2。旋转到切向后要再转回来，否则在直道和弯道上
      // 同一个字符会一会儿横一会儿竖——这两块槽必须永远正着读。
      ctx.rotate(-ang);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(h * 0.46)}px ${MONO}`;
      ctx.fillStyle = live
        ? `rgba(${col},${(0.52 + 0.30 * pulse).toFixed(3)})`
        : 'rgba(140,170,210,0.15)';
      ctx.fillText(gold ? '×2' : '+1', 0, 1);
      ctx.textBaseline = 'alphabetic';

      // 落点预告正好压在它上面：加一圈扩散环，这是"这一发会吃到槽"的唯一提示
      if (hot && live) {
        ctx.beginPath();
        ctx.arc(0, 0, w * (0.55 + 0.25 * pulse), 0, PI2);
        ctx.strokeStyle = `rgba(${col},${(0.35 + 0.4 * pulse).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  slotTicks(game) {
    const ctx = this.ctx;
    ctx.save();
    for (let i = 0; i < N; i++) {
      if (game.slots[i]) continue;
      const s = mod(i + game.phase, N) * D;
      const p = this.toScreen(pointAt(s));
      ctx.beginPath();
      ctx.arc(p.x, p.y, i % 5 === 0 ? 2.0 : 1.3, 0, PI2);
      ctx.fillStyle = '#b4bfff89';
      ctx.fill();
    }
    ctx.restore();
  }

  speedStreaks(game) {
    if (this.motion.matches) return;
    const intensity = Math.max(0, (game.speedRatio() - 0.3) / 0.7);
    if (intensity <= 0) return;

    const ctx = this.ctx;
    const direction = Math.sign(game.v);
    const offset = (CHANNEL_W / 2 + 12) / S;
    ctx.save();
    ctx.globalAlpha = intensity * 0.85;
    ctx.strokeStyle = '#ffab7a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const head = (game.phase + i * N / 8) * D;
      for (let segment = 0; segment <= 4; segment++) {
        const s = mod(head - direction * segment * (0.10 + intensity * 0.25) * D, N * D);
        const p = pointAt(s);
        const n = normalAt(s);
        const pt = this.toScreen({ x: p.x + n.x * offset, y: p.y + n.y * offset });
        if (segment === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 珠子 ----------
  // 预测命中槽：按"现在松手"，球落地时炮口下会是哪个槽位。
  predSlots(game) {
    const ball = game.balls[0];
    if (!ball) return [];
    const time = game.flightLeft();
    const coast = game.coastDistance(time);
    return [mod(Math.round(-(game.phase + coast)) + ball.off, N)];
  }

  previewBeads(game, ui) {
    const palette = game.rules === 'dice' ? [3, 2, 5, 0] : [2, 1, 0, 3];
    const groups = [
      [0.06, [0, 0, 1, 2, 2]],
      [0.34, [1, 3, 3]],
      [0.55, [2, 1, 1]],
      [0.76, [3, 0, 2, 2]],
    ];
    for (const [start, beads] of groups) {
      beads.forEach((ci, offset) => this.drawBead(mod(Math.round(start * N) + offset, N) * D, { ci: palette[ci] }, ui.cb));
    }
  }

  beads(game, ui) {
    const predicted = this.predSlots(game);
    for (let i = 0; i < N; i++) {
      const bead = game.slots[i];
      if (!bead) continue;
      const s = mod(i + bead.dx + game.phase, N) * D;
      this.drawBead(s, bead, ui.cb);
    }
    for (const slot of predicted) this.aimGuide(game, slot);
  }

  // A pair of brackets marks the slot that reaches the receiver if the player lets go.
  aimGuide(game, slot) {
    const ctx = this.ctx;
    const s = mod(slot + game.phase, N) * D;
    const p = this.toScreen(pointAt(s));
    const n = normalAt(s);
    const angle = Math.atan2(n.y, n.x) + Math.PI / 2;
    const w = BEAD_R + 4;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffe9a0';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * (w - 5), -w);
      ctx.lineTo(side * w, -w);
      ctx.lineTo(side * w, w);
      ctx.lineTo(side * (w - 5), w);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBead(s, b, cb) {
    const p = this.toScreen(pointAt(s));
    const r = BEAD_R;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + r * 0.43, r * 0.83, r * 0.64, 0, 0, PI2);
    ctx.fillStyle = '#14261c9c';
    ctx.fill();
    this.ballBody(p.x, p.y, r, b.ci, cb, { roll: b.roll, x2: b.x2 });
  }

  /**
   * 一颗球。**形状是第一编码，色相是第二编码。**
   *
   * 上一版是"圆盘 + 内部纹样 + 中心形符"，四种区分全压在同一块圆形画布里的
   * 细节上。问题是远处、快速移动、色弱这三种情况下，细节最先丢失，剩下的
   * 只有色相 —— 而色相恰恰是色弱玩家最不可靠的通道。
   *
   * 这一版让 7 种球有 7 个互不相似的剪影：菱形的、方的、带刺的、三角的、
   * 星形的、带铆钉的、块状的。余光就能分出类别，颜色只负责"是哪一个"。
   * 所以色弱模式不再需要额外形符，只加强图底分离（cb=true）。
   */
  ballBody(x, y, r, ci, cb = false, extra = null) {
    // 骰子模式整套换画法：这里不是"给球换个贴图"，是换了一套编码。
    // 基础模式靠剪影（八面体/方核/星芒/棱锥），骰子模式只有一种剪影——
    // 方块——因为骰子本来就是方的。它的第一编码变成了**面上的点数**：
    // 数点比认色更抗色弱、也更抗高速模糊。
    if (rulesOf() === 'dice') return this.dieBody(x, y, r, ci, cb, extra);
    if (!cb && this.artReady && ci >= 0 && ci < 4) {
      this.drawSprite(ci, x, y, r * 1.96);
      return;
    }

    const ctx = this.ctx;
    const s = beadSkin(ci, cb);

    if (cb) {
      const hg = ctx.createRadialGradient(x, y, r * 0.82, x, y, r * 1.5);
      hg.addColorStop(0, 'rgba(0,0,0,0.66)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5, 0, PI2);
      ctx.fill();
    }

    switch (s.shape) {
      case 'oct':  this.skinTile(x, y, r * 0.80, s, Math.PI / 4); break;
      case 'cube': this.skinTile(x, y, r, s); break;
      case 'star': this.skinStar(x, y, r, s); break;
      case 'pyr':  this.skinPyr(x, y, r, s); break;
      case 'wild': this.skinWild(x, y, r, s); break;
      case 'bomb': this.skinBomb(x, y, r, s); break;
      default:     this.skinRust(x, y, r, s); break;
    }
  }

  // ---------- 骰子 ----------
  /**
   * 一颗骰子。
   *
   * 这一版最贵的决定是**没有做真 3D**：没有法线、没有透视、没有六个面。
   * 理由很实际——骰子在盘上只有 23px，六个面同时投影到这么小的方块上，
   * 玩家能读出的只有"这是块东西"。所以这里做的是"2.5D"：
   * 正面永远是同一个面，靠三点撑立体感——顶部提亮、底部压暗、右下投影。
   *
   * 翻滚（roll）用的是"压扁再弹回"：`|cos(πk)|` 在动画中点归零，
   * 看起来像骰子侧着翻过去。它不是物理仿真，但抓住了**翻滚的剪影**，
   * 而这正是玩家在余光里能认出的东西。
   */
  dieBody(x, y, r, ci, cb = false, extra = null) {
    const ctx = this.ctx;
    const s = ballSkin(ci);
    // 0.84 而不是 0.90：相邻两格的间距是 D*S ≈ 1.06×珠径，骰身再宽一点，
    // 两颗同色骰就会连成一块砖。骰子必须"一颗一颗"可数，这是它的第一职责。
    const a = r * 0.84;
    const rad = r * 0.30;

    const rollT = extra && extra.roll ? extra.roll : 0;
    const p = rollT > 0 ? 1 - Math.min(1, rollT / (CFG.rollDur || 0.26)) : 1;
    const squash = rollT > 0 ? Math.max(0.06, Math.abs(Math.cos(Math.PI * p))) : 1;
    const tilt = rollT > 0 ? Math.sin(Math.PI * p) * 0.16 : 0;

    // 落影（不随挤压变形：影子是地面上的，骰子翻起来影子还在）
    const sg = ctx.createRadialGradient(x, y + r * 0.30, r * 0.2, x, y + r * 0.30, r * 1.05);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.30, r * 0.92, r * 0.62, 0, 0, PI2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    if (tilt) ctx.rotate(tilt);
    if (squash < 1) ctx.scale(squash, 1);

    const isBlank = s.shape === 'blankdie';
    const isWild = s.shape === 'wilddie';
    const isBomb = s.shape === 'bombdie';

    // 骰身：上亮下暗的竖向渐变。角度固定为 90°，因为盘面上所有骰子
    // 都必须看起来被同一盏灯照着——各自打光会让整条链读成散落的贴纸。
    ctx.beginPath();
    ctx.roundRect(-a, -a, a * 2, a * 2, rad);
    // 渐变只在上缘留一条很窄的亮带（0~0.18），剩下全是本色到暗部。
    // 第一版把 light 铺满上半面，结果整条链读成"糖果色瓷砖"——
    // 亮面占得太多的东西不像骰子，像糖。骰子要的是**饱和度**，不是亮度。
    const bg = ctx.createLinearGradient(0, -a, 0, a);
    if (isBomb) {
      bg.addColorStop(0, '#5A3423');
      bg.addColorStop(0.30, '#2A1710');
      bg.addColorStop(1, '#100806');
    } else if (isBlank) {
      bg.addColorStop(0, '#6A7078');
      bg.addColorStop(0.30, '#454A51');
      bg.addColorStop(1, '#1C1F24');
    } else if (isWild) {
      bg.addColorStop(0, '#FFF3C4');
      bg.addColorStop(0.30, '#FFC23A');
      bg.addColorStop(1, '#8A5A00');
    } else {
      bg.addColorStop(0, s.light);
      bg.addColorStop(0.18, s.base);
      bg.addColorStop(0.62, s.base);
      bg.addColorStop(1, s.dark);
    }
    ctx.fillStyle = bg;
    ctx.fill();

    // 内部一圈暗边：让正面读成"凹进去的面"，而不是一块实心方片
    ctx.beginPath();
    ctx.roundRect(-a * 0.80, -a * 0.80, a * 1.60, a * 1.60, rad * 0.62);
    ctx.fillStyle = isBlank ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.14)';
    ctx.fill();

    // 顶部高光 + 底部反光：两点就够，多了会变成塑料
    ctx.beginPath();
    ctx.roundRect(-a * 0.86, -a * 0.88, a * 1.72, a * 0.26, rad * 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fill();

    if (isWild) {
      // 金骰：一枚白色四芒星 + 六点虚位。星星说"这不是一个点数"，
      // 虚位说"六个面都算"。两个符号同时给，是因为只给一个都会被误读成普通骰。
      this.starPath(ctx, 0, 0, a * 0.62, a * 0.20, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.globalAlpha = 0.30;
      this.drawPips(ctx, a, 6, '#5E3800');
      ctx.globalAlpha = 1;
    } else if (isBomb) {
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, a * 0.52);
      cg.addColorStop(0, '#FFF6C8');
      cg.addColorStop(0.38, '#FFB43A');
      cg.addColorStop(0.78, '#FF5A00');
      cg.addColorStop(1, 'rgba(120,30,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, a * 0.52, 0, PI2);
      ctx.fill();
    } else if (isBlank) {
      // 铅骰：没有点数，只有四颗铆钉。**空**本身就是它的信息。
      for (const [ux, uy] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) {
        ctx.beginPath();
        ctx.arc(ux * a, uy * a, a * 0.075, 0, PI2);
        ctx.fillStyle = 'rgba(210,215,225,0.22)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(-a * 0.34, -a * 0.34);
      ctx.lineTo(a * 0.34, a * 0.34);
      ctx.moveTo(a * 0.34, -a * 0.34);
      ctx.lineTo(-a * 0.34, a * 0.34);
      ctx.strokeStyle = 'rgba(10,12,16,0.55)';
      ctx.lineWidth = Math.max(1.2, a * 0.085);
      ctx.stroke();
    } else {
      this.drawPips(ctx, a, pipOf(ci), '#FFFFFF');
    }

    // 外框
    ctx.beginPath();
    ctx.roundRect(-a, -a, a * 2, a * 2, rad);
    ctx.strokeStyle = cb ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.34)';
    ctx.lineWidth = cb ? Math.max(1.6, r * 0.11) : Math.max(1, r * 0.075);
    ctx.stroke();

    ctx.restore();

    // ---- 外部标记（不参与挤压，永远正着）----
    // 翻面骰：一圈带缺口的青色环。缺口朝上，像一枚"要翻过去"的箭头。
    if (isFlipDie(ci)) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.02, -Math.PI * 0.34, Math.PI * 0.34);
      ctx.arc(x, y, r * 1.02, Math.PI * 0.66, Math.PI * 1.34);
      ctx.strokeStyle = 'rgba(120,240,255,0.92)';
      ctx.lineWidth = Math.max(1.2, r * 0.10);
      ctx.stroke();
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.13, y + sy * r * 1.02 - sy * r * 0.14);
        ctx.lineTo(x, y + sy * r * 1.02);
        ctx.lineTo(x + r * 0.13, y + sy * r * 1.02 - sy * r * 0.14);
        ctx.strokeStyle = 'rgba(120,240,255,0.92)';
        ctx.stroke();
      }
    }

    // ×2 镀金：外圈一道金环 + 右下角一个小角标。
    // 环是给余光看的（快速扫盘时能认出"这颗值双倍"），角标是给确认用的。
    if (extra && extra.x2) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.10, 0, PI2);
      ctx.strokeStyle = 'rgba(255,214,90,0.95)';
      ctx.lineWidth = Math.max(1.2, r * 0.09);
      ctx.shadowColor = 'rgba(255,200,60,0.9)';
      ctx.shadowBlur = r * 0.55;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 折角：右上角一小块金色三角。它落在**点数区之外**（点位最远只到 0.56a），
      // 所以永远不会遮住一个点——而板上每多遮一个点，玩家就少数一个数。
      const c0 = a * 0.62;
      ctx.beginPath();
      ctx.moveTo(x + a * 0.84, y - a * 0.84 + c0 * 0.2);
      ctx.lineTo(x + a * 0.84, y - a * 0.84 + c0);
      ctx.lineTo(x + a * 0.84 - c0, y - a * 0.84 + c0 * 0.2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,214,90,0.95)';
      ctx.fill();
    }
  }

  /**
   * 骰面点数。偏移表用的是**标准骰面**布局（1 居中、2 对角、3 斜三、4 四角、
   * 5 四角加心、6 两列三行），不是随便摆的。熟悉骰子的人能靠"点的排布"
   * 在 0.1 秒内读出面值，这比数点快一倍。
   */
  drawPips(ctx, a, pip, color) {
    const LAYOUT = [
      [[0, 0]],
      [[-0.48, -0.48], [0.48, 0.48]],
      [[-0.48, -0.48], [0, 0], [0.48, 0.48]],
      [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]],
      [[-0.48, -0.48], [0.48, -0.48], [0, 0], [-0.48, 0.48], [0.48, 0.48]],
      [[-0.46, -0.56], [0.46, -0.56], [-0.46, 0], [0.46, 0], [-0.46, 0.56], [0.46, 0.56]],
    ];
    const pts = LAYOUT[Math.max(1, Math.min(6, pip)) - 1];
    const pr = Math.max(0.95, a * 0.155);
    for (const [ux, uy] of pts) {
      const px = ux * a, py = uy * a;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, PI2);
      ctx.fillStyle = color;
      ctx.fill();
      // 描边而不是偏移阴影。第一版在点的右下方补了一个半透明暗点做"凹坑"，
      // 结果在 20px 的骰子上，那颗暗点自己读成了**第二个点**——
      // 1 点像 2 点，2 点像 4 点。数点游戏的图形里，任何多余的圆都是 bug。
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, PI2);
      ctx.strokeStyle = 'rgba(0,0,0,0.34)';
      ctx.lineWidth = Math.max(0.6, pr * 0.42);
      ctx.stroke();
    }
  }

  skinTile(x, y, r, s, angle = 0) {
    const ctx = this.ctx;
    const a = r * 0.86;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const face = ctx.createLinearGradient(-a, -a, a * 0.6, a);
    face.addColorStop(0, s.light);
    face.addColorStop(0.43, s.base);
    face.addColorStop(1, s.dark);
    ctx.beginPath();
    ctx.roundRect(-a, -a, a * 2, a * 2, r * 0.33);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.065);
    ctx.strokeStyle = s.light;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-a + r * 0.38, -a + r * 0.21);
    ctx.lineTo(a - r * 0.48, -a + r * 0.21);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.strokeStyle = '#ffffff83';
    ctx.stroke();
    ctx.restore();
  }

  skinStar(x, y, r, s) {
    const ctx = this.ctx;
    ctx.save();
    this.starPath(ctx, x, y, r * 0.96, r * 0.49, 5);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.4, r * 0.15);
    ctx.strokeStyle = s.dark;
    ctx.stroke();
    const face = ctx.createLinearGradient(x - r * 0.45, y - r, x + r * 0.46, y + r);
    face.addColorStop(0, s.light);
    face.addColorStop(0.48, s.base);
    face.addColorStop(1, s.dark);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.strokeStyle = '#ffffff55';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - r * 0.2, y - r * 0.24, r * 0.2, r * 0.064, -0.53, 0, PI2);
    ctx.fillStyle = '#ffffff8a';
    ctx.fill();
    ctx.restore();
  }

  skinPyr(x, y, r, s) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-0.17 * r, -0.86 * r);
    ctx.quadraticCurveTo(0, -1.11 * r, 0.17 * r, -0.86 * r);
    ctx.lineTo(0.89 * r, 0.43 * r);
    ctx.quadraticCurveTo(1.03 * r, 0.72 * r, 0.71 * r, 0.72 * r);
    ctx.lineTo(-0.71 * r, 0.72 * r);
    ctx.quadraticCurveTo(-1.03 * r, 0.72 * r, -0.89 * r, 0.43 * r);
    ctx.closePath();
    const face = ctx.createLinearGradient(-r * 0.55, -r * 0.68, r * 0.64, r * 0.72);
    face.addColorStop(0, s.light);
    face.addColorStop(0.53, s.base);
    face.addColorStop(1, s.dark);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.065);
    ctx.strokeStyle = s.light;
    ctx.stroke();
    ctx.restore();
  }

  skinWild(x, y, r, s) {
    const ctx = this.ctx;

    // 细金光环先画，压在星后面
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.30, r * 0.60, -0.48, 0, PI2);
    ctx.strokeStyle = 'rgba(255,222,130,0.95)';
    ctx.lineWidth = Math.max(1, r * 0.055);
    ctx.shadowColor = 'rgba(255,200,80,0.9)';
    ctx.shadowBlur = r * 0.5;
    ctx.stroke();
    ctx.restore();

    this.starPath(ctx, x, y, r * 1.04, r * 0.40, 5);
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(-Math.PI / 2, x, y);
      const stops = ['#FF5E6C', '#FFC93C', '#5BE37A', '#3FD8F0', '#6E8CFF', '#C86BFF', '#FF5E6C'];
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
      ctx.fillStyle = g;
    } else {
      const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      g.addColorStop(0, '#FF5E6C');
      g.addColorStop(0.5, '#FFD24A');
      g.addColorStop(1, '#6EE7FF');
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.62)';
    ctx.lineWidth = Math.max(0.8, r * 0.055);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.30, 0, PI2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
  }

  // 爆破雷：暗钛球体 + 一圈铆钉 + 熔橙核心。全 7 种里唯一"有机械零件"的，
  // 剪影是靠铆钉的锯齿和核心的强发光的双重特征立住的。
  skinBomb(x, y, r, s) {
    const ctx = this.ctx;
    const R0 = r * 0.94;

    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.36, r * 0.1, x, y, R0);
    g.addColorStop(0, '#5A6474');
    g.addColorStop(0.5, '#2B333F');
    g.addColorStop(1, '#0B0F15');
    ctx.beginPath();
    ctx.arc(x, y, R0, 0, PI2);
    ctx.fillStyle = g;
    ctx.fill();

    // 铆钉
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI2 + 0.19;
      const px = x + Math.cos(a) * R0 * 0.80;
      const py = y + Math.sin(a) * R0 * 0.80;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.085, 0, PI2);
      ctx.fillStyle = 'rgba(160,178,200,0.55)';
      ctx.fill();
    }

    // 熔橙核心
    ctx.save();
    ctx.shadowColor = 'rgba(255,120,20,0.95)';
    ctx.shadowBlur = r * 0.85;
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.46);
    cg.addColorStop(0, '#FFF6C8');
    cg.addColorStop(0.32, '#FFB43A');
    cg.addColorStop(0.68, '#FF6A00');
    cg.addColorStop(1, '#7A2200');
    ctx.beginPath();
    ctx.arc(x, y, r * 0.46, 0, PI2);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, r * 0.46, 0, PI2);
    ctx.strokeStyle = 'rgba(255,150,60,0.75)';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();

    // 顶部高光：金属球必须有一道硬高光，否则读成塑料
    ctx.beginPath();
    ctx.arc(x, y, R0, Math.PI * 1.08, Math.PI * 1.62);
    ctx.strokeStyle = 'rgba(190,215,255,0.42)';
    ctx.lineWidth = Math.max(1, r * 0.10);
    ctx.stroke();
  }

  // 锈球：不规则多边形 + 麻点 + 锈斑，**刻意不加任何发光**。
  // 盘面上所有会发光的东西都是"可消资源"，锈球不发光，玩家第一眼就知道
  // 它不参与匹配。这条视觉规则比在球上写"X"更有效。
  skinRust(x, y, r, s) {
    const ctx = this.ctx;
    const rr = [1.00, 0.83, 0.97, 0.80, 1.00, 0.86, 1.02, 0.82, 0.95];
    const n = rr.length;

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI2 - 0.35;
      const rad = r * 0.98 * rr[i];
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();

    const g = ctx.createLinearGradient(x - r * 0.5, y - r, x + r * 0.6, y + r);
    g.addColorStop(0, '#B9B4AC');
    g.addColorStop(0.45, '#8C8781');
    g.addColorStop(1, '#454340');
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // 锈斑：不规则的暖褐色块，位置写死，保证每颗锈球长得一样
    const patches = [[-0.34, -0.28, 0.34, 0.22], [0.30, 0.10, 0.28, 0.20], [0.02, 0.42, 0.30, 0.16]];
    for (const [dx, dy, rw, rh] of patches) {
      ctx.beginPath();
      ctx.ellipse(x + dx * r, y + dy * r, rw * r, rh * r, dx, 0, PI2);
      ctx.fillStyle = 'rgba(126,74,44,0.26)';
      ctx.fill();
    }
    // 麻点
    const pits = [[-0.5, 0.2, 0.10], [0.15, -0.5, 0.08], [0.42, 0.38, 0.07], [-0.14, 0.02, 0.06]];
    for (const [dx, dy, pr] of pits) {
      ctx.beginPath();
      ctx.arc(x + dx * r, y + dy * r, pr * r, 0, PI2);
      ctx.fillStyle = 'rgba(24,20,16,0.34)';
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(30,26,22,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();
  }

  /** 正 n 角星的路径：外半径 R、内半径 r */
  starPath(ctx, x, y, R, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * PI2 - Math.PI / 2;
      const rad = i % 2 ? r : R;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  /** 填一个多边形面：底色 + 白/黑叠层。宝石的明暗全靠这两个 alpha。 */
  facet(ctx, pts, base, w = 0, b = 0) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();
    if (w) { ctx.fillStyle = `rgba(255,255,255,${w})`; ctx.fill(); }
    if (b) { ctx.fillStyle = `rgba(0,0,0,${b})`; ctx.fill(); }
  }

  // ---------- 落点 ----------
  reticle(game, preview) {
    const ctx = this.ctx;
    const ball = game.balls[0];
    const idx = ball?.idx ?? game.nextVolley()[0];
    const impact = IMPACTS[idx];
    if (!impact) return;
    const p = this.toScreen(impact);
    const muzzle = this.muzzleScreen(game, idx, ball?.launchAngle);
    const active = preview || Boolean(ball);
    if (muzzle) {
      const gap = BEAD_R + 9;
      const t = 1 - gap / (p.y - muzzle.y);
      ctx.save();
      ctx.setLineDash([1.5, 12]);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = active ? '#3d32ba' : '#6f65b999';
      ctx.beginPath();
      ctx.moveTo(muzzle.x, muzzle.y);
      ctx.lineTo(muzzle.x + (p.x - muzzle.x) * t, p.y - gap);
      ctx.stroke();
      ctx.restore();
    }

    // The receiver is fixed. Its chevron sits outside the channel, clear of the beads.
    const y = p.y - BEAD_R - 12;
    ctx.beginPath();
    ctx.moveTo(p.x - 17, y - 13);
    ctx.lineTo(p.x, y);
    ctx.lineTo(p.x + 17, y - 13);
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#a24d3d';
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.strokeStyle = active ? '#ff9956' : '#e78a59';
    ctx.stroke();
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
  }

  // 飞行球沿出膛时锁定的直线运动，后续转向只改变接球槽。
  projectile(game, contrast) {
    for (const ball of game.balls) this.drawProjectile(game, ball, contrast);
  }

  drawProjectile(game, ball, contrast) {
    const ctx = this.ctx;
    const k = Math.min(1, ball.t / ball.dur);

    const from = this.muzzleScreen(game, ball.idx, ball.launchAngle);
    const impact = IMPACTS[ball.idx];
    if (!from || !impact) return;
    const to = this.toScreen(impact);

    const pos = (u) => ({
      x: from.x + (to.x - from.x) * u,
      y: from.y + (to.y - from.y) * u,
    });

    const p = pos(k);
    this.ballBody(p.x, p.y, BEAD_R * 1.04, ball.ci, contrast);
  }

  nozzle(game, ui) {
    const ctx = this.ctx;
    const idx = game.nextVolley()[0];
    const nz = NOZZLES[idx];
    if (!nz) return;
    const p = this.toScreen(nz);
    const ci = game.queues[idx][0];
    const charge = game.spinLoad();
    const kick = this.motion.matches ? 0 : 5 * game.firePulse;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(nz.nx, -nz.ny) - (game.aimAngle || 0) * Math.PI / 180);
    ctx.translate(0, -kick);

    ctx.save();
    ctx.shadowColor = '#44308b5c';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;
    if (this.artReady) {
      this.drawSprite('nozzle', 0, -53, 152);
    } else {
      ctx.beginPath();
      ctx.roundRect(-53, -129, 106, 150, 30);
      ctx.fillStyle = '#5750da';
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-46, -10, 92, 32, 10);
      ctx.fillStyle = '#ff934f';
      ctx.fill();
    }
    ctx.restore();

    this.ballBody(0, -52, 13, ci, ui.cb);
    if (charge > 0) {
      ctx.beginPath();
      ctx.roundRect(-18, 13, 36 * charge, 3, 1.5);
      ctx.fillStyle = '#fff2c6';
      ctx.fill();
    }
    if (game.firePulse > 0 && !this.motion.matches) {
      ctx.beginPath();
      ctx.ellipse(0, 24, 13 + 7 * game.firePulse, 5, 0, 0, PI2);
      ctx.fillStyle = `rgba(255,228,147,${0.65 * game.firePulse})`;
      ctx.fill();
    }
    ctx.restore();
  }

  ghosts(fx) {
    if (!fx || !fx.ghosts) return;
    const ctx = this.ctx;
    for (const g of fx.ghosts) {
      const a = Math.max(0, g.life / g.max);   // 1 → 0
      const k = 1 - a;                          // 0 → 1
      // 前 55% 时间保持实心（球"还在"），后 45% 淡出。
      // 全程线性淡出会让球从第一帧就开始变透明，看着像"本来就画虚了"。
      // 这个阈值跟着残影总时长一起放宽：0.8s 的残影如果仍按 0.35 淡出，
      // 前 0.5s 都看不清"被吃掉的球原来长什么样"。
      const alpha = Math.min(1, a / 0.45);
      // 缩小得比上一版慢（0.68 → 0.52）：珠子要在原地多留一会儿，
      // 后面补位的珠子追上来之前，"这一段被清空了"必须看得见。
      const r = BEAD_R * 0.94 * (1 - 0.52 * k);
      ctx.save();
      ctx.globalAlpha = alpha;
      this.ballBody(g.x, g.y, r, g.ci, false);
      // 全程叠白：白度随缩小同步上升。
      // 只在尾段白化不够——前半段缩小的球仍是完整的球（有高光和纹样），
      // 静态看就是"跑道上多出几颗小球"。持续白化才能读成"过载 → 湮灭"。
      if (k > 0.02) {
        const w = Math.pow(k, 0.7);
        ctx.beginPath();
        ctx.arc(g.x, g.y, r * 0.72, 0, PI2);
        ctx.fillStyle = `rgba(255,255,255,${(0.95 * w).toFixed(2)})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  beams(fx) {
    if (!fx || !fx.beams) return;
    const ctx = this.ctx;
    for (const b of fx.beams) {
      const a = Math.max(0, b.life / b.max);
      const steps = 14;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const s = b.s0 + b.span * D * (i / steps);
        const p = this.toScreen(pointAt(s));
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = b.color.replace('ALPHA', (a * 0.85).toFixed(2));
      ctx.lineWidth = (b.w || 6) * (0.4 + a * 0.9);
      ctx.lineCap = 'round';
      ctx.shadowColor = b.color.replace('ALPHA', (a * 0.6).toFixed(2));
      ctx.shadowBlur = 18;
      ctx.stroke();

      // 白色热核：没有它，光带只是一条灰线
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1.4, (b.w || 6) * 0.30);
      ctx.strokeStyle = `rgba(255,255,255,${(a * 0.8).toFixed(2)})`;
      ctx.stroke();
      ctx.restore();
    }
  }

  shocks(fx) {
    if (!fx || !fx.shocks) return;
    const ctx = this.ctx;
    for (const s of fx.shocks) {
      const k = 1 - Math.max(0, s.life / s.max);
      // 半径走缓出而不是线性：线性扩张在整段时间里速度不变，看起来"匀速飘走"；
      // 缓出是「先铺开、后停住」，同一时长下体感明显更慢、更有分量。
      const e = 1 - (1 - k) * (1 - k);
      const r = s.r0 + (s.r1 - s.r0) * e;
      const a = Math.max(0, s.life / s.max);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, PI2);
      ctx.strokeStyle = s.color.replace('ALPHA', (a * 0.8).toFixed(2));
      ctx.lineWidth = s.w * (0.3 + a * 1.1);
      ctx.stroke();
    }
  }

  particles(fx) {
    if (!fx || !fx.parts) return;
    const ctx = this.ctx;
    for (const pt of fx.parts) {
      const a = Math.max(0, pt.life / pt.max);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * a, 0, PI2);
      ctx.fillStyle = pt.color.replace('ALPHA', (a * 0.9).toFixed(2));
      ctx.fill();
    }
  }

  /**
   * 连消高段的屏幕边缘辉光。
   *
   * 为什么用"边缘"而不是"全屏亮"：全屏亮（flash）会压暗盘面上的颜色，
   * 高连消的瞬间恰恰是最需要看清珠子的时候。边缘辉光把亮度放在玩家不看的地方，
   * 却能被余光完整接收到——它是"氛围在告诉你出事了"，不是"画面被盖住了"。
   */
  comboGlow(fx) {
    if (!fx || !fx.glow) return;
    const ctx = this.ctx;
    const g = fx.glow;
    const a = Math.max(0, g.life / g.max);
    // 缓入：刚触发时几乎看不见，0.15s 内涨到峰值再退。
    // 线性淡出会变成"啪一下亮起来然后慢慢暗"，那是闪光的形状，不是余温。
    const k = Math.min(1, (1 - a) * 4) * a;
    const rg = ctx.createRadialGradient(CX, CY, Math.min(VW, VH) * 0.30, CX, CY, Math.max(VW, VH) * 0.74);
    rg.addColorStop(0, g.color.replace('ALPHA', '0'));
    rg.addColorStop(0.55, g.color.replace('ALPHA', (k * 0.10 * g.a).toFixed(3)));
    rg.addColorStop(1, g.color.replace('ALPHA', (k * 0.62 * g.a).toFixed(3)));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, VW, VH);
  }

  floats(fx) {
    if (!fx || !fx.floats) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    // 描边阴影不是装饰：浮字经常落在跑道正上方，底下是亮色珠子和光带，
    // 不加暗底会出现"看得见轮廓但读不出数字"的情况。
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 7;

    // 同一条竖线上会同时挂好几条浮字（"×2 换位" 撞 "连消"，再撞 "清空跑道"），
    // 上一版就是三行糊成一团的。这里按 x 分列，同列从下往上排，
    // 任意两条之间至少留一个行高——浮字可以飘，但不能叠。
    const placed = [];
    const list = fx.floats.slice().sort((a, b) => b.y - a.y);
    for (const f of list) {
      const a = Math.max(0, f.life / f.max);
      let y = f.y - (1 - a) * 46;
      for (let guard = 0; guard < 6; guard++) {
        const hit = placed.find((q) => Math.abs(q.x - f.x) < 150 && Math.abs(q.y - y) < f.size + q.size + 2);
        if (!hit) break;
        y = hit.y - (f.size + hit.size) / 2 - 4;
      }
      placed.push({ x: f.x, y, size: f.size });

      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px ${MONO}`;
      ctx.fillStyle = f.color;
      ctx.fillText(t(f.key, f.values), f.x, y);
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }

  // ---------- HUD ----------

}
