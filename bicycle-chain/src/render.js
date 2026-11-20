// Canvas2D 渲染层。虚拟画布 1200×800，按窗口等比缩放。
//
// 几何全部动态：轮径 / 槽数 / 射口位置由当前 Game 决定。
// 球用**形状**做第一编码：4 基础色（八面体 / 倒角方核 / 星芒 / 三角棱锥）
// + 3 特殊球（彩虹星晶 / 机械雷 / 锈铁块），7 个剪影互不相似。
// 色相退成第二编码，所以高对比模式（V 键）只需要加强图底分离，不需要额外形符。

import {
  C, R, L, N, D, pointAt, tangentAt, normalAt, mod,
  RULE as TRACK_RULE, BOUND, PULLEYS, NOZZLE_ANCHOR, CROSS_SLOTS,
} from './geom.js';
import { PALETTE, CFG, comboMult, comboTierIndex, COMBO_TIERS, TEMPO_MARKS, ballSkin, rulesOf, RUST, WILD, BOMB } from './sim.js';
import { PIPS, pipOf, isFlipDie } from './dice.js';
import {
  CARD_BASE, SHIFT_BASE, SUITS, RANKS, cardSkin, cardCi,
} from './poker.js';
import { MODES, TIERS, scoreBand, tierProgress } from './modes.js';

const VW = 1200, VH = 800;

/** '#RRGGBB' → 'r,g,b'。连消档位只在一处定义颜色，这里负责换格式。 */
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
// 画布中心。**不是 400**。
//
// 炮口在轮盘上方，而炮口这一版被拉远到 4.2 个世界单位——如果轮盘还在
// 垂直正中，炮身和顶部挂板会顶穿标题行（实测挂板顶到 y=21，标题在 y=36）。
// 把轮盘下移 40px 之后，上面让出的正是炮台需要的空间，下面仍然够放
// combo 条和操作提示。画面重心略微下沉，但上方被炮台填住，反而成了层次。
const CX = 600, CY = 440;
const PI2 = Math.PI * 2;

const FONT = '"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Consolas,"Cascadia Mono",monospace';
// 花色符号单独走一路字体：Inter / 苹方对 ♥♦♠♣ 的覆盖不稳定，
// 在某些系统上会掉成方框。Segoe UI Symbol 在 Windows 上一定有这四个字形。
const SYMBOL = '"Segoe UI Symbol","Apple Symbols","Noto Sans Symbols 2",system-ui,sans-serif';
const ink = (a) => `rgba(228,236,250,${a})`;

// ---- 动态几何缓存 ----
let S = 30;
let BEAD_R = 15;
let CHANNEL_W = 33;
let NOZ_STAND = 4.5;      // 炮口离跑道中心线的距离（世界单位），由 CFG.nozzleGap 同步
let IMPACTS = [];
let NOZZLES = [];
let TRACK_PTS = [];     // 非椭圆拓扑的屏幕空间采样点（含法向），每帧复用
let geoKey = '';

function syncGeo(game) {
  const key = `${game.modeId}:${N}:${C}:${R}:${TRACK_RULE}`;
  if (key === geoKey) return;
  geoKey = key;

  // 三个约束取最小，别只用一个魔法数：
  //   34    —— 再大珠子就顶到左右 HUD 的边距了
  //   261/(boundY+stand) —— 纵向预算：炮口 + 炮身 + 顶部挂板（合计约 109px）
  //   790/(2·boundX)     —— 横向预算：导轨外沿不能压到左右 HUD 栏
  // 新拓扑的包围盒由 geom 提供，不能再用椭圆的 C/R 推——
  // 三角链的纵向包围盒是 6.3 而不是 R=2.4，用 R 算会把机器画到标题行上。
  NOZ_STAND = CFG.nozzleGap;
  S = Math.min(34, 261 / (BOUND.y + NOZ_STAND), 790 / (2 * BOUND.x));
  BEAD_R = (D * S) / 2 * 0.94;
  CHANNEL_W = D * S * 1.06;

  // 非椭圆拓扑的轨道是任意闭合曲线，缓存一份屏幕坐标供描边用。
  // 每帧现算 500 点 × 6 条描边会白烧 CPU，而几何在一局里是死的。
  TRACK_PTS = [];
  if (TRACK_RULE !== 'oval') {
    const steps = 520;
    for (let i = 0; i < steps; i++) {
      const s = (i / steps) * L;
      const p = pointAt(s);
      const n = normalAt(s);
      TRACK_PTS.push({
        x: CX + p.x * S, y: CY + p.y * S,
        nx: n.x, ny: n.y,
      });
    }
  }

  IMPACTS = [];
  NOZZLES = [];
  for (const off of game.nozzleOff) {
    const s = mod(off, N) * D;
    // 8 字交叉口是一个"世界锚点"，不是某个槽位的 pointAt：
    // 交叉点被两条支线共用，用槽位坐标算会偏到斜边上。
    const p = NOZZLE_ANCHOR ? { x: NOZZLE_ANCHOR.x, y: NOZZLE_ANCHOR.y } : pointAt(s);
    const nrm = NOZZLE_ANCHOR
      ? { x: NOZZLE_ANCHOR.nx, y: NOZZLE_ANCHOR.ny }
      : normalAt(s);
    const tan = NOZZLE_ANCHOR
      ? { x: -nrm.y, y: nrm.x }
      : tangentAt(s);
    IMPACTS.push(p);
    // 两个点要分开：
    //   muzzle —— 炮口，也就是球真正的起飞点（轨道外 NOZ_STAND 世界单位）
    //   pivot  —— 炮身局部坐标系的原点。cannon() 里炮口画在局部 +23px，
    //             所以 pivot 必须比 muzzle 再往外 23px，炮口的椭圆才正好
    //             落在球起飞的位置上。上一版两者混用，球是从炮管中段冒出来的。
    const mx = p.x + nrm.x * NOZ_STAND;
    const my = p.y + nrm.y * NOZ_STAND;
    NOZZLES.push({
      mx, my,
      x: mx + nrm.x * (23 / S),
      y: my + nrm.y * (23 / S),
      nx: nrm.x, ny: nrm.y,
      tx: tan.x, ty: tan.y,
      s,
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
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.cv.width = Math.floor(w * dpr);
    this.cv.height = Math.floor(h * dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    const k = Math.min(w / VW, h / VH);
    this.scale = k * dpr;
    this.offX = (w - VW * k) / 2 * dpr;
    this.offY = (h - VH * k) / 2 * dpr;
    this.cssScale = k;
  }

  toScreen(p) {
    return { x: CX + p.x * S, y: CY + p.y * S };
  }

  begin(fx) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070C';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    if (fx && fx.shake > 0.05) {
      const a = fx.shake;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }
  }

  draw(game, ui, fx) {
    syncGeo(game);
    this.t = ui.t;
    this.begin(fx);
    this.background(game);
    this.chassis(game);
    this.slotTicks(game);
    this.pads(game);
    // 标题页把盘面压暗：珠子仍然在动（不是静态背景），但不能干扰读卡片
    const boardAlpha = ui.mode === 'title' ? 0.30 : 1;
    const ctx0 = this.ctx;
    ctx0.save();
    ctx0.globalAlpha = boardAlpha;
    this.beads(game, ui);
    // 缩小的旧球压在珠子之上：它是"正在消失的那一颗"，必须在最前面才说得通。
    this.ghosts(fx);
    this.reticle(game, ui);
    this.projectile(game);
    this.nozzle(game, ui);
    ctx0.restore();
    this.beams(fx);
    this.shocks(fx);
    this.particles(fx);
    this.vignette();
    if (game.frenzyT > 0) this.frenzyTint(game);
    this.comboGlow(fx);
    this.floats(fx);
    if (fx && fx.flash > 0.001) {
      this.ctx.fillStyle = `rgba(210,235,255,${Math.min(0.5, fx.flash)})`;
      this.ctx.fillRect(0, 0, VW, VH);
    }
    if (ui.mode === 'play' || ui.mode === 'paused') this.hud(game, ui);
    if (ui.mode === 'title') this.title(ui);
    if (ui.mode === 'result') this.result(game, ui);
    if (ui.mode === 'paused') this.paused();
  }

  // ---------- 背景 ----------
  background(game) {
    const ctx = this.ctx;

    // 底：竖向渐变。上深下略亮，是因为"机器悬在暗房里，地面接住一点光"——
    // 纯径向渐变会让画面中心亮、四周均匀变暗，看起来像一张贴图；
    // 竖向渐变 + 下方光池才有"房间"的方向感。
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#05070B');
    g.addColorStop(0.42, '#080D15');
    g.addColorStop(0.78, '#0A111B');
    g.addColorStop(1, '#06090F');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    // 机器背后的冷光晕。它只负责把机器从背景里"托"出来，不能自己成形状，
    // 所以用两个不同半径的低透明度椭圆叠，而不是一个边界清楚的圆。
    const halo = ctx.createRadialGradient(CX, CY - 20, 40, CX, CY - 20, 520);
    halo.addColorStop(0, 'rgba(38,96,170,0.20)');
    halo.addColorStop(0.55, 'rgba(24,60,120,0.07)');
    halo.addColorStop(1, 'rgba(10,24,50,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, VW, VH);

    // 地面光池：机器自己往地面投的一点青蓝色反光。
    // 没有它，整个盘子像贴在黑纸上的剪贴画；有了它，下沿才"落"在地上。
    if (game) {
      // 光池跟着拓扑的包围盒走：三角链的下沿比椭圆低，固定用 R 会让
      // 整台机器看起来悬在地面上。
      const bot = CY + BOUND.y * S + 18;
      const poolR = Math.max(BOUND.x, BOUND.y) * S * 0.98;
      ctx.save();
      ctx.translate(CX, bot);
      ctx.scale(1, 0.26);
      const pool = ctx.createRadialGradient(0, 0, 20, 0, 0, poolR);
      pool.addColorStop(0, 'rgba(46,150,230,0.15)');
      pool.addColorStop(0.48, 'rgba(28,90,150,0.055)');
      pool.addColorStop(1, 'rgba(10,30,60,0)');
      ctx.beginPath();
      ctx.arc(0, 0, poolR, 0, PI2);
      ctx.fillStyle = pool;
      ctx.fill();
      ctx.restore();
    }

    if (game) {
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
  }

  /** 四边压暗。只压边，不压中心，否则会和上方光晕打架。 */
  /**
   * 狂热期的一圈橙色呼吸光。
   * 它不是"再来一次闪白"——闪白是一下，狂热是持续状态；
   * 所以只压屏幕边缘，中心保持干净，牌面和读数都不受影响。
   */
  frenzyTint(game) {
    const ctx = this.ctx;
    const k = Math.min(1, game.frenzyT / Math.max(0.01, CFG.frenzyDur || 7));
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 5.5);
    const g = ctx.createRadialGradient(CX, CY, 260, CX, CY, 620);
    g.addColorStop(0, 'rgba(255,138,60,0)');
    g.addColorStop(0.72, `rgba(255,120,50,${(0.03 + 0.05 * k * pulse).toFixed(3)})`);
    g.addColorStop(1, `rgba(255,170,60,${(0.10 + 0.10 * k * pulse).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  vignette() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(CX, CY, 300, CX, CY, 760);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.62, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  // ---------- 跑道 ----------
  stadiumPath(ctx, pad = 0) {
    const w = 2 * (C + R) * S + pad;
    const h = 2 * R * S + pad;
    ctx.beginPath();
    ctx.roundRect(CX - w / 2, CY - h / 2, w, h, h / 2);
  }

  // ---------- 底盘 ----------
  // 绘制顺序是定死的：托盘 → 飞轮 → 凹槽导轨 → 机芯 → 挂板 → 珠子。
  // 飞轮必须压在托盘上、又在导轨之下，否则齿会盖住跑道边。
  chassis(game) {
    if (TRACK_RULE === 'oval') {
      this.plate();
      this.flywheels(game);
      this.groove();
      this.core(game);
      this.gantry(game);
      return;
    }
    // 非椭圆拓扑没有"整块托盘"可填：8 字和三角链的内部是空的。
    // 改用一条粗管沿轨道描边——它同样回答"这是台机器"，但不会把空洞填死。
    this.tubePlate();
    this.flywheels(game);
    this.tubeGroove();
    this.core(game);
    this.gantry(game);
    // 交叉口压一块桥面：两条管子在中心会糊成一块，
    // 桥面把"这是两条线交叉"重新读回来，同时给珠子一个落脚点。
    if (TRACK_RULE === 'figure8') this.crossingDeck();
  }

  /** 8 字交叉口的桥面。画在凹槽之上、珠子之下。 */
  crossingDeck() {
    const ctx = this.ctx;
    // 桥面只要盖住交叉点，不要把两条弧线一起吞掉。
    // 1.9 倍轮径会变成一块 230px 的黑胶囊，实测把交叉口读成了"黑洞"。
    const w = Math.max(58, R * S * 0.95);
    const h = Math.max(20, CHANNEL_W * 0.78);
    const rot = 0.20;

    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(rot);

    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.42);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#2A3849');
    g.addColorStop(0.42, '#131C27');
    g.addColorStop(1, '#070C13');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(96,224,255,0.26)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-w / 2 + 10, -h / 2 + 2);
    ctx.lineTo(w / 2 - 10, -h / 2 + 2);
    ctx.strokeStyle = 'rgba(190,230,255,0.24)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    this.bolt(-w / 2 + 11, 0, 2.4);
    this.bolt(w / 2 - 11, 0, 2.4);
    ctx.restore();
  }

  /**
   * 沿 TRACK_PTS 描一条闭合路径。
   * offset 是屏幕像素偏移（正 = 法向外侧），用来画双轨脊。
   */
  trackStroke(width, style, offset = 0) {
    const ctx = this.ctx;
    if (!TRACK_PTS.length) return;
    ctx.beginPath();
    for (let i = 0; i < TRACK_PTS.length; i++) {
      const p = TRACK_PTS[i];
      const x = p.x + p.nx * offset;
      const y = p.y + p.ny * offset;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  /** 非椭圆拓扑的底座：一条厚实的金属管 + 一排螺栓。 */
  tubePlate() {
    const ctx = this.ctx;
    const w = CHANNEL_W + 44;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 16;
    this.trackStroke(w, '#03060B');
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(34,150,240,0.34)';
    ctx.shadowBlur = 50;
    this.trackStroke(w, '#060A12');
    ctx.restore();

    this.trackStroke(w, 'rgba(19,28,39,0.98)');
    this.trackStroke(w - 12, 'rgba(8,13,20,0.96)');

    // 受光上沿：只给外侧偏移的一小段亮线，不和整圈描边抢
    ctx.save();
    ctx.globalAlpha = 0.20;
    this.trackStroke(1.6, '#BEE6FF', w * 0.48);
    ctx.restore();

    // 螺栓：沿轨道等距，落在外沿上
    for (let i = 0; i < 14; i++) {
      const s = (i / 14) * L;
      const p = pointAt(s);
      const n = normalAt(s);
      this.bolt(CX + (p.x + n.x * (w / 2 - 9) / S) * S,
        CY + (p.y + n.y * (w / 2 - 9) / S) * S, 3.1);
    }
  }

  /** 非椭圆拓扑的凹槽：深槽 + 双轨脊 + 青色底光。 */
  tubeGroove() {
    const ctx = this.ctx;
    this.trackStroke(CHANNEL_W, '#04070C');
    this.trackStroke(CHANNEL_W - 5, '#0E1824');
    this.trackStroke(CHANNEL_W * 0.52, 'rgba(3,6,11,0.86)');

    for (const k of [1, -1]) {
      this.trackStroke(3.2, 'rgba(0,0,0,0.65)', k * (CHANNEL_W * 0.42 + 2));
      this.trackStroke(1.6, 'rgba(160,205,255,0.26)', k * CHANNEL_W * 0.42);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(60,220,255,0.85)';
    ctx.shadowBlur = 20;
    const a = (0.26 + 0.12 * Math.sin(this.t * 1.6)).toFixed(3);
    this.trackStroke(2.2, `rgba(96,236,255,${a})`, -CHANNEL_W * 0.43);
    ctx.restore();
  }

  /**
   * 拉丝金属托盘。它比导轨宽一圈，是"整台机器"的底座，不是跑道本身。
   *
   * 上一版只有一个 0.12 的外圈描边，结果整台机器在暗底上读不出边界，
   * 像贴纸。这一版把"厚度"拆成四笔：投影（在地面上）→ 外沿高光（受光的上沿）
   * → 外沿暗边（背光的下沿）→ 一排螺栓。四笔都极薄，但它们一起回答了
   * "这块板有多厚、它是不是个实物"。
   */
  plate() {
    const ctx = this.ctx;
    const padOut = CHANNEL_W + 44;          // 相对导轨外沿再宽出的量
    const halfH = R * S + (CHANNEL_W + padOut) / 2;

    // 1) 落影：投到地面上
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#03060B';
    this.stadiumPath(ctx, padOut);
    ctx.fill();
    ctx.restore();

    // 2) 外发光：机器自己往四周散的一点冷光
    ctx.save();
    ctx.shadowColor = 'rgba(34,150,240,0.34)';
    ctx.shadowBlur = 50;
    ctx.fillStyle = '#060A12';
    this.stadiumPath(ctx, padOut);
    ctx.fill();
    ctx.restore();

    // 3) 板面：上表面比下沿亮一档，暗示它是被上方灯照着的
    const g = ctx.createLinearGradient(0, CY - halfH, 0, CY + halfH);
    g.addColorStop(0, '#1F2A37');
    g.addColorStop(0.14, '#131C27');
    g.addColorStop(0.52, '#0A1018');
    g.addColorStop(0.88, '#131C27');
    g.addColorStop(1, '#080D14');
    ctx.fillStyle = g;
    this.stadiumPath(ctx, padOut);
    ctx.fill();

    ctx.save();
    this.stadiumPath(ctx, padOut);
    ctx.clip();
    // 拉丝：横向毫米级细线。间距必须是质数行距，否则会和屏幕像素栅格
    // 产生摩尔纹，在暗部看成一圈一圈的脏渐变。
    for (let yy = CY - halfH - 40; yy < CY + halfH + 40; yy += 3) {
      const k = ((yy * 37) % 17) / 17;
      ctx.fillStyle = `rgba(150,195,245,${(0.005 + k * 0.012).toFixed(4)})`;
      ctx.fillRect(CX - 470, yy, 940, 1);
    }

    // 倒角：外沿一道亮、内沿一道暗
    ctx.strokeStyle = 'rgba(170,215,255,0.20)';
    ctx.lineWidth = 2;
    this.stadiumPath(ctx, padOut - 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.lineWidth = 2.4;
    this.stadiumPath(ctx, padOut - 15);
    ctx.stroke();

    // 受光上沿：只画上半圈。整圈描亮会变成"发光的圈"，只有上沿亮才是"被照亮的边"
    ctx.beginPath();
    const hw = 2 * (C + R) * S + padOut;
    const hh = 2 * R * S + padOut;
    ctx.roundRect(CX - hw / 2 + 1, CY - hh / 2 + 1, hw - 2, hh / 2, hh / 2);
    ctx.strokeStyle = 'rgba(190,230,255,0.15)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // 4) 螺栓：沿外沿等距。它们不是装饰——一排等距的点是"这块板是人装上去的"
    //    最省字的一句话，也顺手把边框的曲率标出来了。
    const dEdge = CHANNEL_W + 11;
    for (let i = 0; i < 14; i++) {
      const s = (i / 14) * L;
      const p = pointAt(s);
      const n = normalAt(s);
      this.bolt(CX + (p.x + n.x * dEdge) * S, CY + (p.y + n.y * dEdge) * S, 3.1);
    }
  }

  /** 一颗内六角螺栓：暗底 + 上沿高光 + 中间一个更暗的六边形。 */
  bolt(x, y, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, PI2);
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#4A5C74');
    g.addColorStop(1, '#0C121B');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI2 + 0.5;
      const px = x + Math.cos(a) * r * 0.52, py = y + Math.sin(a) * r * 0.52;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(4,8,14,0.72)';
    ctx.fill();
  }

  /**
   * 中心机芯：两只飞轮之间那块被空出来的地方。
   *
   * 上一版我在这里塞了一整块下沉面板，结果它读成一块显示器——因为"暗底 +
   * 内发光的横条"就是屏幕的语汇。机器的心不是屏幕，是**一根轴**：
   * 一根把两个飞轮连起来的传动轴 + 中间一个会随节拍胀缩的轴承。
   * 细、暗、有结构，才不会被误读成 UI。
   */
  core(game) {
    // 8 字的交叉枢纽已经在 flywheels 里画过了。
    if (TRACK_RULE === 'figure8') return;
    if (TRACK_RULE !== 'oval') {
      this.topologyCore(game);
      return;
    }

    const ctx = this.ctx;
    const beat = game ? Math.min(1, game.beatClock / game.beat) : 0;
    const gearR = R * S * 0.66;
    const xL = CX - (C * S - gearR * 0.92);
    const xR = CX + (C * S - gearR * 0.92);
    const h = Math.max(13, R * S * 0.15);

    ctx.save();
    // 传动轴
    ctx.beginPath();
    ctx.roundRect(xL, CY - h / 2, xR - xL, h, h / 2);
    const g = ctx.createLinearGradient(0, CY - h / 2, 0, CY + h / 2);
    g.addColorStop(0, '#33435A');
    g.addColorStop(0.4, '#151E2A');
    g.addColorStop(1, '#070C13');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 轴上沿一道冷光：说明它是磨过的金属，不是一根黑棍
    ctx.beginPath();
    ctx.moveTo(xL + h, CY - h / 2 + 1);
    ctx.lineTo(xR - h, CY - h / 2 + 1);
    ctx.strokeStyle = 'rgba(170,215,255,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 轴承
    const br = Math.max(15, R * S * 0.27);
    ctx.beginPath();
    ctx.arc(CX, CY, br, 0, PI2);
    const bg = ctx.createRadialGradient(CX - br * 0.3, CY - br * 0.35, 2, CX, CY, br);
    bg.addColorStop(0, '#3E5169');
    bg.addColorStop(1, '#0A1019');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 节拍环：一圈随拍子向外扩的冷光。全场只有它从中心往外走，
    // 玩家不用看炮口的蓄力条也能感到"下一发快到了"。
    ctx.beginPath();
    ctx.arc(CX, CY, br + 4 + beat * 9, 0, PI2);
    ctx.strokeStyle = `rgba(96,224,255,${(0.06 + 0.30 * (1 - beat)).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(80,200,255,0.6)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 轴承中心：一个小六角螺栓，和托盘边缘那排是同一套零件
    this.bolt(CX, CY, Math.max(4, br * 0.34));
    ctx.restore();
  }

  /** 大小轮 / 三角链的传动骨架：线速度相同，骨架只是把轮连起来。 */
  topologyCore(game) {
    const ctx = this.ctx;
    if (!PULLEYS.length) return;
    const beat = game ? Math.min(1, game.beatClock / game.beat) : 0;

    const pts = PULLEYS.map((p) => this.toScreen({ x: p.x, y: p.y }));
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const h = Math.max(9, R * S * 0.12);

    ctx.save();
    if (TRACK_RULE === 'uneven') {
      // 一根轴穿过两个皮带轮中心。大小轮的半径差本身就是画面里的"变速"。
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineCap = 'round';
      ctx.lineWidth = h;
      ctx.strokeStyle = '#0D151F';
      ctx.stroke();
      ctx.lineWidth = Math.max(1, h * 0.18);
      ctx.strokeStyle = 'rgba(170,215,255,0.20)';
      ctx.stroke();
    } else {
      // 三角链：三根细辐条从重心连到三个轮，形成"三角骨架"。
      for (const p of pts) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.lineCap = 'round';
        ctx.lineWidth = h * 0.7;
        ctx.strokeStyle = '#0D151F';
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(170,215,255,0.16)';
        ctx.stroke();
      }
    }

    const br = Math.max(13, R * S * 0.30);
    ctx.beginPath();
    ctx.arc(cx, cy, br, 0, PI2);
    const bg = ctx.createRadialGradient(cx - br * 0.3, cy - br * 0.35, 2, cx, cy, br);
    bg.addColorStop(0, '#3E5169');
    bg.addColorStop(1, '#0A1019');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, br + 4 + beat * 9, 0, PI2);
    ctx.strokeStyle = `rgba(96,224,255,${(0.06 + 0.30 * (1 - beat)).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(80,200,255,0.6)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    this.bolt(cx, cy, Math.max(4, br * 0.34));
    ctx.restore();
  }

  /**
   * 双炮挂架。两座炮并排朝同一个方向之后，它们必须看起来是**同一台机器上**
   * 的两个炮管，而不是两个各自为战的炮台。
   *
   * 这里试了三稿，前两稿都是"把两门炮连起来"，都失败了：
   *   细横梁   → 一副哑铃，两头各挂一个头；
   *   宽机匣   → 一块 400px 的空板，两头挂两个头，中间空得像窗台板；
   *   下垂软管 → 一根电线横跨一片空地，中间的指示灯读成"线上挂了颗珠子"。
   * 结论是**不要连**。两门炮各装各的挂板，同向这件事由"两门炮长得一模一样、
   * 姿态一模一样"来表达就够了——一件东西重复两次，本身就是一组。
   */
  gantry(game) {
    // 挂板的前提是"两门炮在同一条直道上"；新拓扑的炮口朝向不同，
    // 硬套一块横板会读成穿模。
    if (TRACK_RULE !== 'oval') return;
    if (!game || game.nozzleOff.length !== 2) return;
    const a = this.toScreen(NOZZLES[0]);
    const b = this.toScreen(NOZZLES[1]);
    if (Math.abs(a.y - b.y) > 8) return;   // 不在同一条直道上就不画

    const ctx = this.ctx;
    const pw = 64, ph = 50;
    const cy = a.y - 61;

    ctx.save();
    for (const p of [a, b]) {
      // 挂板：上宽下窄的梯形，底边收进去，读起来是"吊着的"而不是"立着的"
      const inset = 7;
      ctx.beginPath();
      ctx.moveTo(p.x - pw / 2, cy - ph / 2);
      ctx.lineTo(p.x + pw / 2, cy - ph / 2);
      ctx.lineTo(p.x + pw / 2 - inset, cy + ph / 2);
      ctx.lineTo(p.x - pw / 2 + inset, cy + ph / 2);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, cy - ph / 2, 0, cy + ph / 2);
      g.addColorStop(0, '#3A4A5F');
      g.addColorStop(0.36, '#1E2937');
      g.addColorStop(1, '#070C13');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 上沿受光 + 下沿冷光（炮管从这里出去）
      ctx.beginPath();
      ctx.moveTo(p.x - pw / 2 + 3, cy - ph / 2 + 1.2);
      ctx.lineTo(p.x + pw / 2 - 3, cy - ph / 2 + 1.2);
      ctx.strokeStyle = 'rgba(195,230,255,0.32)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - pw / 2 + inset + 3, cy + ph / 2 - 0.6);
      ctx.lineTo(p.x + pw / 2 - inset - 3, cy + ph / 2 - 0.6);
      ctx.strokeStyle = 'rgba(70,190,255,0.28)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // 四角螺栓
      this.bolt(p.x - pw / 2 + 9, cy - ph / 2 + 9, 2.6);
      this.bolt(p.x + pw / 2 - 9, cy - ph / 2 + 9, 2.6);
      this.bolt(p.x - pw / 2 + 12, cy + ph / 2 - 9, 2.6);
      this.bolt(p.x + pw / 2 - 12, cy + ph / 2 - 9, 2.6);
    }

    ctx.restore();
  }

  /**
   * 两端飞轮。位置就是两个半圆的圆心，所以它读起来是"链条绕过的那两个轮"，
   * 不是贴上去的装饰。转速直接取 phase：链条走多少，轮就转多少，
   * 玩家按方向键时能立刻看到轮在跟手转——这是整台机器"活着"的凭据。
   */
  flywheels(game) {
    // 8 字没有"轮"，只有一个交叉口；画一个 X 形传动枢纽。
    if (TRACK_RULE === 'figure8') {
      this.crossoverHub(game);
      return;
    }

    const rot = game ? (game.phase / N) * PI2 : 0;
    for (const p of PULLEYS) {
      // 链条线速度恒定，所以角速度 ∝ 1/r：小轮在画面里转得更快。
      // 这不是装饰——"变速轮"三个字就是靠这个比值读出来的。
      const spin = rot * (R / Math.max(0.1, p.r));
      const s = this.toScreen({ x: p.x, y: p.y });
      this.gear(s.x, s.y, p.r * S * 0.66, spin);
    }
  }

  /**
   * 8 字交叉口的传动枢纽。
   *
   * 它必须画在轨道**之下**：交叉口正是两条链相交的地方，枢纽压在上面
   * 会把珠子盖掉。露出来的只有四个象限里的 X 臂和中央轴承。
   */
  crossoverHub(game) {
    const ctx = this.ctx;
    const rot = game ? (game.phase / N) * PI2 : 0;
    const arm = Math.max(46, R * S * 1.15);
    const w = Math.max(9, R * S * 0.16);

    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(rot * 0.35);

    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.roundRect(-arm, -w / 2, arm * 2, w, w / 2);
      const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
      g.addColorStop(0, '#46586F');
      g.addColorStop(0.45, '#1A2533');
      g.addColorStop(1, '#070C13');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, Math.max(16, R * S * 0.30), 0, PI2);
    const bg = ctx.createRadialGradient(-6, -8, 2, 0, 0, Math.max(16, R * S * 0.30));
    bg.addColorStop(0, '#4A5E78');
    bg.addColorStop(1, '#080E16');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,200,255,0.28)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  gear(cx, cy, r, rot) {
    const ctx = this.ctx;
    const teeth = 16;
    const r0 = r * 0.86, r1 = r;

    ctx.save();
    ctx.translate(cx, cy);

    // 底盘暗坑：让齿轮"陷"进托盘，而不是浮在上面
    ctx.beginPath();
    ctx.arc(0, 0, r1 * 1.10, 0, PI2);
    ctx.fillStyle = 'rgba(3,6,11,0.75)';
    ctx.fill();

    ctx.save();
    ctx.rotate(rot);

    // 齿盘：每颗齿是一个梯形，底边落在 r0 上
    ctx.beginPath();
    let first = true;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * PI2, st = PI2 / teeth;
      const pts = [[a - st * 0.34, r0], [a - st * 0.19, r1], [a + st * 0.19, r1], [a + st * 0.34, r0]];
      for (const [ang, rad] of pts) {
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    const mg = ctx.createLinearGradient(-r * 0.7, -r, r * 0.7, r);
    mg.addColorStop(0, '#46586F');
    mg.addColorStop(0.44, '#24303F');
    mg.addColorStop(1, '#0A1018');
    ctx.fillStyle = mg;
    ctx.fill();

    // 齿顶受光：只描上半圈，整圈描亮会读成"发光的圈"
    ctx.beginPath();
    ctx.arc(0, 0, r1 * 0.97, Math.PI * 1.08, Math.PI * 1.92);
    ctx.strokeStyle = 'rgba(180,215,255,0.30)';
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r0 * 0.99, 0, PI2);
    ctx.strokeStyle = 'rgba(150,200,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 五条辐条槽：上一版画的是五根深色**线**，远看是五个黑条，齿轮读成甜甜圈。
    // 改成"挖空"——槽内比盘面更暗，槽的上沿给一道亮边，这样才像镂空而不是涂黑。
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI2;
      ctx.save();
      ctx.rotate(a);
      const x0 = r * 0.30, x1 = r0 * 0.86, w = r * 0.115;
      ctx.beginPath();
      ctx.roundRect(x0, -w, x1 - x0, w * 2, w);
      ctx.fillStyle = 'rgba(4,7,12,0.92)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x0, -w + 1);
      ctx.lineTo(x1 - w, -w + 1);
      ctx.strokeStyle = 'rgba(160,205,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // 轮毂
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.30, 0, PI2);
    const hg = ctx.createRadialGradient(-r * 0.08, -r * 0.09, 1, 0, 0, r * 0.30);
    hg.addColorStop(0, '#5A6C84');
    hg.addColorStop(1, '#101822');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 蓝光灯环：拆解图里最醒目的一笔，也是唯一的高饱和元素
    ctx.beginPath();
    ctx.arc(0, 0, r0 * 0.90, 0, PI2);
    ctx.strokeStyle = 'rgba(90,200,255,0.42)';
    ctx.lineWidth = Math.max(1.4, r * 0.045);
    ctx.shadowColor = 'rgba(70,190,255,0.9)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 相位标记：16 颗齿是旋转对称的，转一格和没转一模一样——齿轮的转动
    // 在上一版里根本看不见。加一颗偏心琥珀点，转多少一眼就能读出来。
    const ia = r0 * 0.72;
    ctx.beginPath();
    ctx.arc(0, -ia, Math.max(2, r * 0.05), 0, PI2);
    ctx.fillStyle = 'rgba(255,196,90,0.85)';
    ctx.shadowColor = 'rgba(255,180,60,0.9)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /**
   * 凹槽导轨：中间一条深色槽，两侧各一道轨脊，内侧透青色底光。
   * "槽"这个字决定了画法——珠子必须看起来是**嵌进去**的，
   * 所以槽底要比珠子暗得多，且比珠子宽。
   */
  groove() {
    const ctx = this.ctx;
    const edge = (d) => this.stadiumPath(ctx, 2 * d);

    // 槽底
    ctx.strokeStyle = '#04070C';
    ctx.lineWidth = CHANNEL_W;
    edge(0);
    ctx.stroke();

    // 槽壁。上下两半给不同的亮度——光从上来，所以上半圈的内壁该亮、
    // 下半圈该暗。这在闭合环上是个便宜的近似，但读起来就是"有深度"。
    const wall = ctx.createLinearGradient(0, CY - R * S - CHANNEL_W, 0, CY + R * S + CHANNEL_W);
    wall.addColorStop(0, '#3C516B');
    wall.addColorStop(0.22, '#22303F');
    wall.addColorStop(0.5, '#0E1824');
    wall.addColorStop(0.78, '#1D2A3A');
    wall.addColorStop(1, '#33455C');
    ctx.strokeStyle = wall;
    ctx.lineWidth = CHANNEL_W;
    edge(0);
    ctx.stroke();

    // 中间压暗：形成"两条平行轨"的错觉
    ctx.strokeStyle = 'rgba(3,6,11,0.86)';
    ctx.lineWidth = CHANNEL_W * 0.52;
    edge(0);
    ctx.stroke();

    for (const k of [1, -1]) {
      // 轨脊：先暗后亮，暗在下、亮在上，才有"脊"的厚度
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3.2;
      edge(k * (CHANNEL_W * 0.42 + 2));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160,205,255,0.26)';
      ctx.lineWidth = 1.6;
      edge(k * CHANNEL_W * 0.42);
      ctx.stroke();
    }

    // 青色底光
    ctx.save();
    ctx.shadowColor = 'rgba(60,220,255,0.85)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = `rgba(96,236,255,${(0.26 + 0.12 * Math.sin(this.t * 1.6)).toFixed(3)})`;
    ctx.lineWidth = 2.2;
    edge(-CHANNEL_W * 0.43);
    ctx.stroke();
    ctx.restore();
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
      // 筹码槽的回报发生在"牌型覆盖它"的时刻，不是"球落在它上面"；
      // 用落点预告去点亮它，会把玩家引向错的目标。
      const hot = pad.kind === 'chip' ? false : pred.includes(pad.slot);
      // 骰子的镀金槽和扑克的筹码槽共用同一种金色：它们都是"这一段消除 ×2"。
      const gold = pad.kind === 'x2' || pad.kind === 'chip';
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
      ctx.fillStyle = `rgba(140,190,255,${i % 5 === 0 ? 0.20 : 0.10})`;
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 珠子 ----------
  // 预测命中槽：按"现在松手"，球落地时炮口下会是哪个槽位。
  predSlots(game) {
    // 只在"即将发射 / 已经发射"时才预告：没有球在飞的时候，
    // 松手预测要跨过整整一拍（1.0-2.2 秒、2 格以上），那已经不是玩家在做的决定了。
    // 阈值按拍长取比例：固定 0.55s 在满速（拍长 1.02）时会变成"半个拍都在预告"，
    // 在起手（拍长 2.2）时又几乎不出现。
    const imminent = game.beat - game.beatClock < game.beat * 0.38;
    if (!game.balls.length && !imminent) return [];
    const coast = this.coastSlots(game);
    // 只预告真的会开火的那个口：轮流制下另一个口这一发不打，
    // 给它也画环，等于告诉玩家"它会打这里"，是错的。
    const offs = game.balls.length
      ? game.balls.map((b) => b.off)
      : game.nextVolley().map((i) => game.nozzleOff[i]);
    return offs.map((off) => mod(Math.round(-(game.phase + coast)) + off, N));
  }

  beads(game, ui) {
    const slots = [];
    for (let i = 0; i < N; i++) {
      const b = game.slots[i];
      if (b) slots.push([i, b]);
    }
    const pred = this.predSlots(game);

    // 8 字交叉：另一条支线也在交叉口时，把它压暗成"下层"。
    // 两颗珠子会精确重合，不压暗的话命中环套在哪一颗上根本读不出来。
    const dim = new Set();
    if (TRACK_RULE === 'figure8' && CROSS_SLOTS.length > 1) {
      const other = CROSS_SLOTS[1];
      const ctx = this.ctx;
      for (const [i, b] of slots) {
        const ws = mod(i + game.phase, N);
        const d = Math.min(Math.abs(ws - other), N - Math.abs(ws - other));
        if (d > 0.8) continue;
        dim.add(b.id);
        ctx.save();
        ctx.globalAlpha = 0.34;
        this.drawBead(mod((i + b.dx) + game.phase, N) * D, b, 0, ui.cb);
        ctx.restore();
      }
    }

    for (const pass of [0, 1]) {
      for (const [i, b] of slots) {
        if (dim.has(b.id)) continue;
        const s = mod((i + b.dx) + game.phase, N) * D;
        const near = this.arrivalAlpha(game, s);
        if ((near > 0.02) !== (pass === 1)) continue;
        this.drawBead(s, b, near, ui.cb);
      }
    }
    // 命中环最后画，永远压在珠子之上（不受两趟渲染顺序影响）
    for (const [i, b] of slots) {
      if (!pred.includes(i)) continue;
      this.hitRing(mod((i + b.dx) + game.phase, N) * D, b);
    }
  }

  // 现在松手 → 落地时链条会滑过多少格。必须和 sim 的漂移阻尼算法一致：
  // 松手后 v 不是归零，而是衰减到 drift，所以位移要解析积分，不能拿 |v|×t 糊。
  // 幽灵球与珠链高亮共用这一个值，否则两处提示会互相打架。
  coastSlots(game) {
    // flightDur 是"这一拍里的飞行时长"，随节奏收紧（见 sim 的 step）。
    // 不能再用 nozzleGap / flightSpeed：满速时飞行只有 0.88s，
    // 用固定 1.31s 算出来的落点会永远偏前 0.4 格——满速下那正好是"打空"和"命中"的差别。
    const T = game.balls.length
      ? game.flightLeft()
      : (game.beat - game.beatClock) + game.flightDur;
    const k = CFG.dampK, drift = CFG.drift;
    return drift * T + (game.v - drift) * (1 - Math.exp(-k * T)) / k;
  }

  // 落点预警：标出"球飞到时正好在炮口下的那颗"，而不是"现在挨着炮口的那颗"。
  // 之前峰值落在 dist=0（即将离开炮口的那颗），球越慢这个错越明显。
  arrivalAlpha(game, s) {
    const coast = this.coastSlots(game);
    const ac = Math.abs(coast);
    if (ac < 0.05) return 0;
    const p = s / D;
    let best = 0;
    for (let i = 0; i < game.nozzleOff.length; i++) {
      const tgt = mod(-game.phase + game.nozzleOff[i], N);
      const dist = coast > 0 ? mod(tgt - p, N) : mod(p - tgt, N);
      const d = Math.abs(dist - ac);
      if (d > 0.55) continue;
      best = Math.max(best, 1 - (d / 0.55) * 0.72);
    }
    return best;
  }

  // 会被命中的那颗珠：一圈亮环。飞行变慢后落点会跟着带速漂移，
  // 没有这个环，玩家只能靠"差一点"的挫败感去反推提前量。
  hitRing(s, b) {
    const ctx = this.ctx;
    const p = this.toScreen(pointAt(s));
    const c = ballSkin(b.ci);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6.5);

    ctx.save();
    // 白环 + 珠色外发光：纯珠色环在红珠上几乎看不见，白色才在任何底色上都成立
    ctx.shadowColor = c.base;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, BEAD_R + 6.5, 0, PI2);
    ctx.strokeStyle = `rgba(255,255,255,${0.58 + 0.34 * pulse})`;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();
  }

  drawBead(s, b, near, cb) {
    const p = this.toScreen(pointAt(s));
    const r = BEAD_R;
    // 锈球不发光。盘面上所有会发光的东西都是"可消资源"，不发光本身就是
    // 一条视觉规则——它比在石头表面写个"不可消"的符号更早被眼睛接收到。
    const glow = b.ci !== RUST;
    const ctx = this.ctx;

    // 落影。上一版的珠子没有影子，于是整条链读起来像"贴在跑道平面上的贴纸"。
    // 影子压在珠子正下方一小块，只有下沿露出来，眼睛接收到的信息是
    // "它比槽底高、但陷在槽里"。同一颗珠子旁边的同色珠子也靠它分开。
    const sg = ctx.createRadialGradient(p.x, p.y + r * 0.26, r * 0.15, p.x, p.y + r * 0.26, r * 1.05);
    sg.addColorStop(0, 'rgba(0,0,0,0.58)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.26, r * 0.94, r * 0.70, 0, 0, PI2);
    ctx.fill();

    if (near > 0.02 && glow) {
      const c = ballSkin(b.ci);
      ctx.save();
      ctx.globalAlpha = near * 0.9;
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2.1);
      g.addColorStop(0, c.base + '99');
      g.addColorStop(1, c.base + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.1, 0, PI2);
      ctx.fill();
      ctx.restore();
    }

    this.ballBody(p.x, p.y, r, b.ci, cb, { roll: b.roll, x2: b.x2 });
    if (near > 0.02) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3.5, 0, PI2);
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + near * 0.6})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
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
    // 扑克模式再换一套：方形牌面 + 花色/点数两个可读通道。
    // 牌必须是"长方形"的——它不是装饰偏好，而是"这是牌"的第一剪影。
    if (rulesOf() === 'poker') return this.cardBody(x, y, r, ci, cb, extra);

    const ctx = this.ctx;
    const s = ballSkin(ci);

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
      case 'oct':  this.skinOct(x, y, r, s); break;
      case 'cube': this.skinCube(x, y, r, s); break;
      case 'star': this.skinStar(x, y, r, s); break;
      case 'pyr':  this.skinPyr(x, y, r, s); break;
      case 'wild': this.skinWild(x, y, r, s); break;
      case 'bomb': this.skinBomb(x, y, r, s); break;
      default:     this.skinRust(x, y, r, s); break;
    }
  }

  // ---------- 扑克牌 ----------
  /**
   * 一张牌。
   *
   * 和骰子的 2.5D 相反：牌不做立体，也不做翻滚。它要的是**长方形剪影**
   * 和"左上角点数 / 右上角花色"的读法。牌在轨道上永远正着放（不随切向旋转），
   * 因为玩家在高速下先认的是字形；跟着轨道转 90° 的 K 和 A 需要重新学。
   *
   * 尺寸刻意比珠子窄：相邻两格只隔约 2.1 个珠径，牌宽 1.22r 才不会连成一片。
   */
  cardBody(x, y, r, ci, cb = false, extra = null) {
    const ctx = this.ctx;
    const s = cardSkin(ci);
    const w = r * 1.22;
    const h = r * 1.62;
    const rad = r * 0.16;
    const down = s.kind === 'down';
    const joker = s.kind === 'joker';

    // 高对比模式：先垫一圈暗底，把牌从任何背景上剥出来
    if (cb) {
      const hg = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.6);
      hg.addColorStop(0, 'rgba(0,0,0,0.66)');
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6, 0, PI2);
      ctx.fill();
    }

    // 落影：和珠子共用同一个光源方向（右下）
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.10, y + h * 0.30, w * 0.56, h * 0.34, 0, 0, PI2);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);

    // 牌面：深色纸面 + 花色描边。金色 / 青色 / 紫色都足够亮，
    // 在暗场上不会掉进背景；红心稍微压一点白，避免 10 字糊成一团。
    const bg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    bg.addColorStop(0, '#141C2A');
    bg.addColorStop(1, '#070B12');
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, rad);
    ctx.fillStyle = down ? '#11100E' : bg;
    ctx.fill();

    if (joker) {
      const rg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      rg.addColorStop(0, '#FF3B4E');
      rg.addColorStop(0.3, '#FFC93C');
      rg.addColorStop(0.55, '#19D3F0');
      rg.addColorStop(0.8, '#A855F7');
      rg.addColorStop(1, '#FF8A2B');
      ctx.strokeStyle = rg;
    } else {
      ctx.strokeStyle = down ? 'rgba(160,150,135,0.50)' : s.base;
    }
    ctx.lineWidth = Math.max(1, r * 0.10);
    if (!down) {
      ctx.shadowColor = s.base;
      ctx.shadowBlur = 7;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 背面暗牌：斜向纹路 + 中间一个问号。它必须"没有牌面"，
    // 所以连花色和点数都不画——玩家一眼就知道这张不能用。
    if (down) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 1.2, -h / 2 + 1.2, w - 2.4, h - 2.4, rad * 0.8);
      ctx.clip();
      ctx.strokeStyle = 'rgba(170,155,135,0.22)';
      ctx.lineWidth = 1;
      for (let d = -h; d < h; d += 5) {
        ctx.beginPath();
        ctx.moveTo(-w / 2 + d, -h / 2);
        ctx.lineTo(-w / 2 + d + h, h / 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(r * 0.72)}px ${MONO}`;
      ctx.fillStyle = 'rgba(198,188,174,0.55)';
      ctx.fillText('?', 0, 1);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // 小丑：彩虹边 + 星 + JOKER 字样。它是全场唯一的多色牌，
    // 因为"任意花色 / 任意点数"的语义只能靠"不属于任何一色"表达。
    if (joker) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(r * 0.86)}px ${FONT}`;
      ctx.fillStyle = '#FFF6D0';
      ctx.shadowColor = '#FFD86B';
      ctx.shadowBlur = 8;
      ctx.fillText('★', 0, -r * 0.10);
      ctx.shadowBlur = 0;
      ctx.font = `800 ${Math.round(r * 0.28)}px ${MONO}`;
      ctx.fillStyle = 'rgba(255,246,208,0.86)';
      ctx.fillText('JOKER', 0, r * 0.44);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // 爆破王牌：A + 一个小爆点。它按 A 参与牌型，所以点数必须画出来。
    if (s.kind === 'bomb') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(r * 0.92)}px ${FONT}`;
      ctx.fillStyle = '#FFD9A0';
      ctx.shadowColor = '#FF6B3D';
      ctx.shadowBlur = 8;
      ctx.fillText('A', -r * 0.06, -r * 0.08);
      ctx.shadowBlur = 0;
      // 爆点：三条短射线，不画成第二个圆（数点游戏里任何多余的圆都是 bug）
      ctx.strokeStyle = 'rgba(255,150,60,0.95)';
      ctx.lineWidth = Math.max(1, r * 0.10);
      const bx = r * 0.46, by = -r * 0.40;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI2;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(a) * r * 0.06, by + Math.sin(a) * r * 0.06);
        ctx.lineTo(bx + Math.cos(a) * r * 0.18, by + Math.sin(a) * r * 0.18);
        ctx.stroke();
      }
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      return;
    }

    // 普通牌 / 染花牌：中间点数，右下花色。
    // 字号按字符数分档：'10' 两个字比 J/Q/K/A 宽，用同一号会顶到边框。
    const glyph = RANKS[s.rank] || '?';
    const fs = glyph.length > 1 ? r * 0.74 : r * 0.94;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(fs)}px ${FONT}`;
    ctx.fillStyle = s.light;
    ctx.shadowColor = s.base;
    ctx.shadowBlur = 6;
    ctx.fillText(glyph, -r * 0.06, -r * 0.12);
    ctx.shadowBlur = 0;

    ctx.font = `700 ${Math.round(r * 0.62)}px ${SYMBOL}`;
    ctx.fillStyle = s.base;
    ctx.textAlign = 'right';
    ctx.fillText(s.sym, w * 0.32, h * 0.32);

    // 染花牌：右上角一圈循环箭头，表示"它会把邻居染成同花"。
    // 用文字符号而不是额外圆环——理由同上，牌面上任何多余的圆都会读成点数。
    if (s.kind === 'shift') {
      ctx.font = `800 ${Math.round(r * 0.34)}px ${MONO}`;
      ctx.fillStyle = 'rgba(126,217,87,0.95)';
      ctx.textAlign = 'left';
      ctx.fillText('↻', -w * 0.40, -h * 0.22);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.restore();
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

  // 八面体：竖棱把菱形劈成左右两半，再加横腰线切成四个三角面。
  // 明度按"光从左上来"排：左上最亮，右下最暗。这是宝石最省事也最准的画法。
  skinOct(x, y, r, s) {
    const ctx = this.ctx;
    const w = r * 0.78, h = r * 1.02;
    const T = [x, y - h], B = [x, y + h], L = [x - w, y], Rr = [x + w, y];
    const G = [x, y];

    ctx.save();
    ctx.shadowColor = s.base;
    ctx.shadowBlur = r * 0.7;
    this.facet(ctx, [T, L, G], s.base, 0.46, 0);
    this.facet(ctx, [T, G, Rr], s.base, 0.10, 0.06);
    this.facet(ctx, [L, B, G], s.base, 0.02, 0.30);
    this.facet(ctx, [G, B, Rr], s.base, 0, 0.46);
    ctx.restore();

    // 棱线：亮边只给左上，暗边只给右下，中间那条竖棱给一道高光断点
    ctx.beginPath();
    ctx.moveTo(T[0], T[1]); ctx.lineTo(L[0], L[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, r * 0.075);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(T[0], T[1]); ctx.lineTo(Rr[0], Rr[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(T[0], T[1] + r * 0.06); ctx.lineTo(G[0], G[1]);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = Math.max(0.8, r * 0.05);
    ctx.stroke();
  }

  // 倒角方核：外圈是倒角方环，内圈是下沉的琥珀面。
  // 关键在"外环亮、内面暗"——那一圈明暗差就是倒角，不需要真的画斜角。
  skinCube(x, y, r, s) {
    const ctx = this.ctx;
    const a = r * 0.86, rad = r * 0.30;

    ctx.save();
    ctx.shadowColor = s.base;
    ctx.shadowBlur = r * 0.55;
    ctx.beginPath();
    ctx.roundRect(x - a, y - a, a * 2, a * 2, rad);
    ctx.fillStyle = s.base;
    ctx.fill();
    ctx.restore();

    // 外环受光。上一版上方压了 0.55 的纯白，结果整个方核读成"上面米色、
    // 下面金色"的按钮——白得太实就不像受光的金属，像涂的漆。
    // 现在是琥珀色的光而不是白光：同色相提亮才读成"同一块料被照亮"。
    const g = ctx.createLinearGradient(x, y - a, x, y + a);
    g.addColorStop(0, 'rgba(255,246,214,0.32)');
    g.addColorStop(0.30, 'rgba(255,224,150,0.08)');
    g.addColorStop(1, 'rgba(26,12,0,0.48)');
    ctx.fillStyle = g;
    ctx.fill();

    // 下沉内面：琥珀玻璃，中心透出一点暖芯
    const ia = a * 0.60;
    ctx.beginPath();
    ctx.roundRect(x - ia, y - ia, ia * 2, ia * 2, rad * 0.55);
    const ig = ctx.createLinearGradient(x, y - ia, x, y + ia);
    ig.addColorStop(0, 'rgba(0,0,0,0.34)');
    ig.addColorStop(1, 'rgba(255,214,130,0.20)');
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.26)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const core = ctx.createRadialGradient(x, y, 0, x, y, ia * 1.25);
    core.addColorStop(0, 'rgba(255,236,168,0.34)');
    core.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = core;
    ctx.fill();

    // 倒角高光：只画左上两条边，多了就不像金属
    ctx.beginPath();
    ctx.moveTo(x - a + rad * 0.5, y - a + 1.6);
    ctx.lineTo(x + a - rad, y - a + 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.56)';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // 星芒火核：10 根棱刺，内芯是白热的球。
  // 这个剪影在 7 种里最"扎眼"，也最不容易和其它混——尖角数量本身就是信息。
  skinStar(x, y, r, s) {
    const ctx = this.ctx;
    this.starPath(ctx, x, y, r * 1.0, r * 0.50, 10);

    ctx.save();
    ctx.shadowColor = s.base;
    ctx.shadowBlur = r * 0.42;
    const g = ctx.createRadialGradient(x, y, r * 0.08, x, y, r * 1.02);
    g.addColorStop(0, s.light);
    g.addColorStop(0.42, s.base);
    g.addColorStop(1, s.dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = Math.max(0.8, r * 0.05);
    ctx.stroke();
    ctx.restore();

    // 内芯
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.38);
    cg.addColorStop(0, 'rgba(255,255,255,0.95)');
    cg.addColorStop(0.55, s.light);
    cg.addColorStop(1, 'rgba(255,60,80,0)');
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, PI2);
    ctx.fillStyle = cg;
    ctx.fill();
  }

  // 三角棱锥：三条棱汇聚到重心，左面最亮、右面最暗、正前方居中。
  // 三角形加上这个 Y 形棱线，才能读成"立体锥"而不是"三角片"。
  skinPyr(x, y, r, s) {
    const ctx = this.ctx;
    const A = [x, y - r * 1.02];
    const B = [x + r * 0.96, y + r * 0.64];
    const C = [x - r * 0.96, y + r * 0.64];
    const G = [x + r * 0.02, y + r * 0.06];

    ctx.save();
    ctx.shadowColor = s.base;
    ctx.shadowBlur = r * 0.65;
    this.facet(ctx, [A, C, G], s.base, 0.34, 0);
    this.facet(ctx, [A, G, B], s.base, 0.02, 0.30);
    this.facet(ctx, [C, B, G], s.base, 0.10, 0.12);
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
    ctx.lineTo(C[0], C[1]); ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.40)';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(A[0], A[1]); ctx.lineTo(G[0], G[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(0.8, r * 0.045);
    ctx.stroke();
  }

  // 彩虹万能球：五角星晶 + 细金光环。全场唯一的"彩色"物体，
  // 所以它一眼就能被认出来——这比任何符号都省事。
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
  reticle(game, ui) {
    const n = game.nozzleCount();
    // 准星跟的是**正在飞的那颗球**，不是"下一发从哪出"。
    // 这两个在轮流制下不是同一个口：开火瞬间 volleyIndex 就前进了一格，
    // 如果准星跟着它走，飞行途中准星会跳到另一门炮下面，玩家会以为
    // 球要落在那里——而球其实正飞向这一门。
    const active = game.balls.length
      ? game.balls.map((b) => b.idx)
      : game.nextVolley();
    for (let i = 0; i < n; i++) {
      if (!active.includes(i)) continue;
      this.reticleAt(game, i, ui);
    }
  }

  reticleAt(game, idx, ui) {
    const ctx = this.ctx;
    const p = this.toScreen(IMPACTS[idx]);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5 + idx * 1.9);

    // 落点预览：按当前速度推算「球飞到的瞬间，炮口下会是哪颗珠」。
    // 球慢了之后这段提前量接近半格，不画出来玩家只能靠试错去猜。
    // "现在松手 → 球会落在哪颗珠上"：这才是玩家真正要做的那个决定
    const predSlot = mod(Math.round(-(game.phase + this.coastSlots(game))) + game.nozzleOff[idx], N);
    const predBead = game.slots[predSlot] || null;
    // 落点预览不画在准星上：准星正中是炮口里待发的那颗球，任何预览都会被挡掉。
    // 改成在链条上圈住"会被命中的那颗珠"（见 beads()），一眼就能对上。

    const dropSlot = game.impactSlot(game.nozzleOff[idx]);
    if (game.slots[dropSlot] === null) {
      const snapSlot = game.snap(dropSlot);
      if (snapSlot !== dropSlot) {
        const sp = this.toScreen(pointAt(game.beadWorldS(snapSlot)));
        ctx.save();
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = `rgba(255,196,110,${0.20 + 0.16 * pulse})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(sp.x, sp.y);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, BEAD_R + 8, 0, PI2);
        ctx.strokeStyle = `rgba(255,196,110,${0.22 + 0.14 * pulse})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    const halfW = 0.25 * D * S;
    ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.10 * pulse})`;
    ctx.lineWidth = 2;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(p.x + sgn * halfW, p.y - 12);
      ctx.lineTo(p.x + sgn * halfW, p.y + 12);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(this.t * 0.9 * (idx % 2 ? -1 : 1));
    ctx.setLineDash([5, 9]);
    ctx.strokeStyle = `rgba(150,210,255,${0.30 + 0.18 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, BEAD_R + 13, 0, PI2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    if (!predBead) {
      ctx.strokeStyle = 'rgba(180,225,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
      ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7);
      ctx.stroke();
    }
  }

  // ---------- 飞行球 ----------
  // 轨迹：炮口 → 落点，**匀速直线**。
  //
  // 上一版是"半线性 + 半 smoothstep"，两端慢、中段 1.5 倍速。那条曲线的问题不是
  // 不好看，是它让"球多快"这件事没法用一个数说清——你调的是时长，看到的却是
  // 变速。现在进度就是时间比例，速度 = nozzleGap / flightSpeed，一个数管全程。
  //
  // 之前那点横向弧线也一起去掉了：它让合速度在两端慢、中段快（±39%），
  // 和"匀速"直接打架；而它原本的作用是绕开双炮中间的门架，门架已经不画了。
  projectile(game) {
    for (let i = 0; i < game.balls.length; i++) this.drawProjectile(game, game.balls[i]);
  }

  drawProjectile(game, ball) {
    const ctx = this.ctx;
    const c = ballSkin(ball.ci);
    const k = Math.min(1, ball.t / ball.dur);

    const from = NOZZLES[ball.idx] || NOZZLES[0];
    const to = IMPACTS[ball.idx] || IMPACTS[0];
    if (!from || !to) return;

    // 从炮口（muzzle）起飞，不是从炮身中心。距离正好等于 CFG.nozzleGap，
    // 所以屏幕上量到的速度和 dur 是同一个数。
    const start = { x: from.mx, y: from.my };

    // 同一套路径函数：球体和尾迹必须走同一条曲线，否则尾迹会脱轨
    const pos = (u) => this.toScreen({
      x: start.x + (to.x - start.x) * u,
      y: start.y + (to.y - start.y) * u,
    });

    for (let i = 5; i >= 1; i--) {
      const u = Math.max(0, k - i * 0.055);
      const tp = pos(u);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, BEAD_R * (1 - i * 0.1), 0, PI2);
      ctx.fillStyle = c.base + Math.round(56 - i * 9).toString(16).padStart(2, '0');
      ctx.fill();
    }

    const p = pos(k);
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, BEAD_R * 1.55);
    g.addColorStop(0, c.light);
    g.addColorStop(0.45, c.base + '7A');
    g.addColorStop(1, c.base + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, BEAD_R * 1.55, 0, PI2);
    ctx.fill();

    // 扑克在**飞行中**转一圈：这是"荷官飞牌"的那一下。
    // 落链之后立刻停正——牌面上的点数只有在正着放的时候才读得出来，
    // 所以旋转只属于飞行，不属于盘面。
    if (rulesOf() === 'poker') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(k * Math.PI * 2);
      this.cardBody(0, 0, BEAD_R * 0.92, ball.ci, false);
      ctx.restore();
    } else {
      this.ballBody(p.x, p.y, BEAD_R * 0.92, ball.ci, false);
    }
  }

  /**
   * 磁轨炮筒。调用前已经平移到炮口中心、旋转到"局部 +Y 指向跑道"。
   *
   * 结构分三层：两根外置导轨（发光）、中间的主体（暗金属）、炮尾的蓄力条。
   * 导轨比主体长，是为了让"这一炮是打向跑道的"这件事在剪影上就成立——
   * 上一版是一根喇叭口，看起来像喷嘴而不是发射器。
   */
  cannon(charge, head, dimmed = false) {
    const ctx = this.ctx;
    const half = 16;
    // 待命状态不能只靠 globalAlpha 压暗：炮身填充本身接近背景色（#0A0F16），
    // 压暗之后连轮廓都消失，只剩一个挂板浮在空中。所以待命时反过来——
    // 给外壳一圈淡蓝外发光，让剪影从暗底上"浮"出来，同时不发光、不充能。
    if (dimmed) {
      ctx.save();
      ctx.shadowColor = 'rgba(84,150,225,0.55)';
      ctx.shadowBlur = 13;
    }

    for (const sx of [-1, 1]) {
      const x0 = sx * 17.5;
      const g = ctx.createLinearGradient(0, -47, 0, 38);
      g.addColorStop(0, '#31415A');
      g.addColorStop(1, '#0B1119');
      ctx.beginPath();
      ctx.roundRect(x0 - 4.5, -47, 9, 90, 4.5);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = dimmed ? 'rgba(120,180,240,0.34)' : 'rgba(130,200,255,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 导轨能量条：蓄力越满越长越亮。这是"什么时候开火"的主提示，
      // 比原来的环形进度更好读——环形进度在炮身侧面常常被珠子挡住。
      const h = 38 * (0.22 + 0.78 * charge);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x0 - 1.4, 38 - h, 2.8, h, 1.4);
      ctx.fillStyle = `rgba(96,224,255,${(0.20 + 0.60 * charge).toFixed(3)})`;
      ctx.shadowColor = 'rgba(80,200,255,0.9)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    }

    // 主体
    //
    // 配色比上一版整体提亮一档（#3E4F67→#4C607C / #0A0F16→#0D131B）。
    // 原因是本轮开始"两门炮只有一门在发光"：炮身如果本身是接近背景的黑，
    // 待命的那门就彻底消失了。现在的规则是炮身自己可见、状态靠光表达。
    ctx.beginPath();
    ctx.roundRect(-half, -40, half * 2, 62, 11);
    const bg = ctx.createLinearGradient(-half, -40, half, 22);
    bg.addColorStop(0, '#4C607C');
    bg.addColorStop(0.45, '#222D3C');
    bg.addColorStop(1, '#0D131B');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = dimmed ? 'rgba(150,205,255,0.50)' : 'rgba(140,200,255,0.30)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 炮尾盖板
    ctx.beginPath();
    ctx.roundRect(-half + 3, -40, half * 2 - 6, 10, 5);
    ctx.fillStyle = 'rgba(96,116,148,0.30)';
    ctx.fill();

    // 蓄力条（炮尾横条）：和导轨同步，但给的是"还差多少"的精确比例
    const bw = (half - 5) * 2;
    ctx.beginPath();
    ctx.roundRect(-half + 5, -49.5, bw, 3.5, 1.75);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-half + 5, -49.5, bw * charge, 3.5, 1.75);
    ctx.fillStyle = `rgba(120,228,255,${(0.40 + 0.45 * charge).toFixed(3)})`;
    ctx.fill();

    // 机芯凹槽：待发球会盖在上面，所以这里只画"井"和一圈色环
    ctx.beginPath();
    ctx.arc(0, -7, 15.5, 0, PI2);
    ctx.fillStyle = '#080C12';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -7, 15.5, 0, PI2);
    ctx.strokeStyle = head.base;
    // 待命炮的色环压到 0.30 + 半量泛光：待发球本身会以 0.82 的 alpha 盖在上面，
    // 那圈「球色光环」如果和 active 的冷光一样亮，玩家会把它当成"要开火了"。
    ctx.globalAlpha = dimmed ? 0.30 : 0.55;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = head.base;
    ctx.shadowBlur = dimmed ? 6 : 12;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // 炮口
    ctx.beginPath();
    ctx.ellipse(0, 23, 11.5, 5, 0, 0, PI2);
    ctx.fillStyle = 'rgba(6,10,16,0.92)';
    ctx.fill();
    ctx.strokeStyle = `rgba(110,225,255,${(0.28 + 0.5 * charge).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    for (const sx of [-1, 1]) {
      for (const yy of [-33, 15]) {
        ctx.beginPath();
        ctx.arc(sx * (half - 4.5), yy, 2, 0, PI2);
        ctx.fillStyle = 'rgba(170,190,215,0.42)';
        ctx.fill();
      }
    }

    if (dimmed) ctx.restore();
  }

  // ---------- 炮口 ----------
  nozzle(game, ui) {
    const unlocked = game.nozzleCount();
    const active = game.nextVolley();
    for (let i = 0; i < game.nozzleOff.length; i++) {
      if (i >= unlocked) this.drawDormant(game, i);
      else this.drawNozzle(game, i, active.includes(i), ui);
    }
  }

  drawDormant(game, idx) {
    const ctx = this.ctx;
    const nz = NOZZLES[idx];
    if (!nz) return;
    const p = this.toScreen(nz);

    let unlockT = 0;
    for (const [t, c] of CFG.stages) if (c > idx) { unlockT = t; break; }
    const left = Math.max(0, unlockT - game.time);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24, 0, PI2);
    ctx.fillStyle = '#0B1119';
    ctx.fill();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = 'rgba(140,190,255,0.18)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = 'rgba(140,190,255,0.34)';
    ctx.fillText(`${left.toFixed(0)}s`, p.x, p.y + 4);
    ctx.restore();
  }

  drawNozzle(game, idx, active, ui) {
    const ctx = this.ctx;
    const nz = NOZZLES[idx];
    if (!nz) return;
    const p = this.toScreen(nz);
    const head = ballSkin(game.queues[idx][0]);
    // 只有轮到的那门炮在充能。上一版两个口共用同一个 charge 值，
    // 齐射时没问题；轮流制下会让玩家以为两门炮都要开火。
    const charge = active ? Math.min(1, game.beatClock / game.beat) : 0;
    // **不靠压暗表达待命**。
    //
    // 试过 0.30 / 0.45 / 0.70 / 0.78，全都失败：炮身填充是 #0A0F16 这个
    // 接近背景的深色，任何程度的 alpha 压缩都先吃掉轮廓，最后剩一个
    // 挂板浮在空中，或者一颗青色小三角悬在虚空里。
    //
    // 真正区分两门炮的是"光"：active 有炮口光晕 + 充能条 + 亮炮口环，
    // 待命只有虚线环。所以 alpha 几乎不动（0.92 只用来区分一点点重量），
    // 剪影永远是完整的——这也是暗场里唯一说得通的规则。
    const dim = active ? 1 : 0.92;

    ctx.save();
    ctx.globalAlpha = dim;

    // 指向落点的虚线（压在炮身以下）
    const tipW = { x: p.x - nz.nx * 36, y: p.y - nz.ny * 36 };
    ctx.save();
    ctx.setLineDash([4, 10]);
    ctx.strokeStyle = 'rgba(150,200,255,0.10)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tipW.x, tipW.y);
    ctx.lineTo(this.toScreen(IMPACTS[idx]).x, this.toScreen(IMPACTS[idx]).y);
    ctx.stroke();
    ctx.restore();

    // 炮身：进局部坐标再画，局部 +Y 指向跑道。
    // 这样同一个函数能被"上方单炮"和"下方复制 180°"两处复用，
    // 而不需要两套坐标——这正是拆解图里"复制旋转 180°"那句话的代码形态。
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(nz.nx, -nz.ny));
    this.cannon(charge, head, !active);
    ctx.restore();

    ctx.restore();

    // 轮到谁：炮口一团呼吸光。
    //
    // 不用"把没轮到的炮变暗"来表达轮转，因为两门炮的炮身本来就接近背景色，
    // 再压暗就没有炮了。改成给**要开火的那门**加光——暗场里唯一能读作
    // "正在工作"的就是光本身。光晕随充能变亮，出膛瞬间正好最亮。
    const muzzle = this.toScreen({ x: nz.mx, y: nz.my });
    if (active) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * (3.4 + 5.2 * charge));
      const R0 = 18 + 14 * charge + 2 * pulse;
      const gg = ctx.createRadialGradient(muzzle.x, muzzle.y, 2, muzzle.x, muzzle.y, R0);
      gg.addColorStop(0, `rgba(160,240,255,${(0.20 + 0.30 * charge).toFixed(3)})`);
      gg.addColorStop(0.55, `rgba(96,200,255,${(0.08 + 0.12 * charge).toFixed(3)})`);
      gg.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(muzzle.x, muzzle.y, R0, 0, PI2);
      ctx.fill();
    }
    // 待命不加任何额外标记。试过虚线环，但它和炮口自身的椭圆环叠在一起，
    // 读起来像"炮口有污渍"；而"没有光"本身就是待命最干净的信号。

    // 待发球：坐在炮身凹槽里。它的 alpha **不跟 dim 走**——另一门炮虽然没轮到，
    // 但"它下一颗是什么颜色"是玩家规划两步的依据，看不清等于白给。
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.82;
    this.ballBody(p.x - nz.nx * 7, p.y - nz.ny * 7, 13, game.queues[idx][0], ui.cb);
    ctx.restore();

    // 预览队列：沿切线排开，越小越远。
    // 方向按炮口所在的左右半边镜像：双炮并排时，两条队列朝各自的外侧展开，
    // 中间的门架才不会被队列穿过；否则左炮的队列会横着怼进右炮身上。
    const q = game.queues[idx];
    const side = nz.x < -0.001 ? -1 : 1;
    for (let k = 1; k < q.length; k++) {
      const d = 50 + (k - 1) * 30;
      const px = p.x + nz.tx * d * side + nz.nx * 8;
      const py = p.y + nz.ty * d * side + nz.ny * 8;
      ctx.save();
      // 预览队列的暗化比炮身轻：它是"接下来两颗"的读数，
      // 按 dim（0.45）压下去会彻底读不出来。
      ctx.globalAlpha = (k === 1 ? 0.85 : 0.5) * (active ? 1 : 0.72);
      ctx.beginPath();
      ctx.moveTo(p.x + nz.tx * 26 * side + nz.nx * 8, p.y + nz.ty * 26 * side + nz.ny * 8);
      ctx.lineTo(px, py);
      ctx.strokeStyle = 'rgba(150,200,255,0.20)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      this.ballBody(px, py, k === 1 ? 11 : 8.8, q[k], ui.cb);
      ctx.restore();
    }

    // 轮转提示：没轮到的炮口不写字，只靠变暗 + 不充能表达"再等一发"。
    // 上一版这里写 REST（三射口轮休），现在两个口是交替开火，
    // "休息"是错的语义——它们都会开火，只是还没轮到。
  }

  // ---------- 特效 ----------
  // 消失的珠子：原球原地缩小 + 淡出，约 0.5s。
  //
  // 这里换过两次做法，都失败：
  // 第一次画扩散光圈（1.4 倍），但消除后 compact 会把后面的珠子前移占住原位，
  // 光圈必然和球重叠，读起来是"珠子描了一圈色"；
  // 第二次把 alpha 压到 0.36 想做成雾，结果几乎看不见，等于没做。
  //
  // 根因是想用"新东西"去表示"消失"。最直接的做法是让**那颗球自己**缩掉：
  // 语义没有歧义，也不会被后来的珠子污染。
  ghosts(fx) {
    if (!fx || !fx.ghosts) return;
    const ctx = this.ctx;
    for (const g of fx.ghosts) {
      const a = Math.max(0, g.life / g.max);   // 1 → 0
      const k = 1 - a;                          // 0 → 1
      // 前 65% 时间保持实心（球"还在"），后 35% 快速淡出。
      // 全程线性淡出会让球从第一帧就开始变透明，看着像"本来就画虚了"。
      const alpha = Math.min(1, a / 0.35);
      const r = BEAD_R * 0.94 * (1 - 0.68 * k);
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
      ctx.fillText(f.text, f.x, y);
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  }

  // ---------- HUD ----------
  hud(game, ui) {
    const ctx = this.ctx;

    // 模式名
    ctx.textAlign = 'center';
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(140,190,255,0.30)';
    ctx.fillText(`${game.mode.en}　·　${game.mode.name}`, CX, 40);

    // ---- 分数 + 段位 ----
    // 分数不再用固定白色：颜色本身就是段位信号，玩家余光扫一眼就知道"我在几档"。
    // 但颜色只是状态，真正驱动「再打一局」的是下面那条"下一档还差多少"。
    const tp = tierProgress(game.score, game.mode);
    const tc = tp.tier.color;

    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('SCORE', 44, 54);

    // 段位徽标
    const bw = tp.tier.name.length > 1 ? 27 : 18;
    ctx.beginPath();
    ctx.roundRect(99, 42, bw, 15, 3);
    ctx.fillStyle = tc;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = tc;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `800 10px ${MONO}`;
    ctx.fillStyle = tc;
    ctx.textAlign = 'center';
    ctx.fillText(tp.tier.name, 99 + bw / 2, 53);

    // 分数本体：SS 段加呼吸，让它看起来"在烧"
    const breathe = tp.i >= 4 ? 0.74 + 0.26 * Math.sin(this.t * 4) : 1;
    ctx.textAlign = 'left';
    ctx.font = `700 46px ${MONO}`;
    ctx.save();
    ctx.shadowColor = tc;
    ctx.shadowBlur = 5 + tp.i * 5;
    ctx.globalAlpha = breathe;
    ctx.fillStyle = tc;
    ctx.fillText(String(game.score).padStart(5, '0'), 42, 98);
    ctx.restore();

    // 档内进度条：右端刻度 = 下一档的门槛，越接近越亮
    const sx = 44, sy = 110, sw = 196;
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(sx, sy, sw, 3);
    ctx.fillStyle = tc;
    ctx.fillRect(sx, sy, sw * tp.p, 3);
    if (tp.next) {
      ctx.fillStyle = tp.next.color;
      ctx.globalAlpha = 0.45 + 0.55 * tp.p;
      ctx.fillRect(sx + sw - 1.5, sy - 3, 2, 9);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'rgba(255,246,208,0.55)';
      ctx.fillRect(sx, sy - 1.5, sw, 1.5);
    }

    // 目标梯度效应：给出确切的"还差多少"
    ctx.font = `600 10px ${MONO}`;
    if (tp.next) {
      ctx.fillStyle = ink(0.26);
      ctx.fillText('NEXT', sx, 131);
      ctx.fillStyle = tp.next.color;
      ctx.globalAlpha = 0.55 + 0.45 * tp.p;
      ctx.fillText(`${tp.next.name}  −${tp.gap}`, sx + 33, 131);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = tc;
      ctx.globalAlpha = 0.75;
      ctx.fillText('MAX TIER', sx, 131);
      ctx.globalAlpha = 1;
    }

    // 时间。骰子模式的连消会给续时，所以上限不是常量 levelTime——
    // 这里必须问 game 要，否则续时之后进度条会算出超过 100% 的怪东西。
    const cap = game.timeLimit ? game.timeLimit() : CFG.levelTime;
    const leftT = game.timeLeft ? game.timeLeft() : Math.max(0, CFG.levelTime - game.time);
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('TIME', 44, 160);
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = leftT < 15 ? '#FF6B7A' : ink(0.86);
    ctx.fillText(leftT.toFixed(1) + 's', 42, 188);

    // 续时读数：只在真的续过时才出现。它是"你这局比标准时长多活了多久"，
    // 属于战果，不属于仪表——所以贴在秒数右边，用小字。
    if (game.timeBonus > 0.05) {
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = 'rgba(120,235,255,0.82)';
      ctx.fillText(`+${game.timeBonus.toFixed(1)}`, 116, 188);
    }

    const barW = 180;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(44, 200, barW, 4);
    ctx.fillStyle = leftT < 15 ? '#FF6B7A' : '#5AC8FA';
    ctx.fillRect(44, 200, barW * Math.min(1, leftT / cap), 4);

    // ---- 节奏 ----
    // 上一版这里只有一行「BEAT 1.45s」。问题是：它是**结果**，不是**理由**。
    // 玩家看到数字在变小，但不知道"变小"对他意味着什么，更不知道这跟他打得好不好有关。
    // 现在这一块同时回答三件事：机器现在多快（倍率）、快到什么程度（条）、
    // 以及这一发要等多久（秒）。倍率是这里唯一真正驱动决策的信息——
    // 它直接出现在每一次消除的得分里。
    const tempo = game.tempo || 0;
    const tcol = tempo >= 0.999 ? TEMPO_MARKS[2].color
      : tempo >= TEMPO_MARKS[1].at ? TEMPO_MARKS[1].color
      : tempo >= TEMPO_MARKS[0].at ? TEMPO_MARKS[0].color
      : 'rgba(140,190,255,0.55)';
    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('TEMPO', 44, 230);

    const hot = tempo >= TEMPO_MARKS[1].at;
    ctx.font = `700 22px ${MONO}`;
    ctx.save();
    if (hot) {
      ctx.shadowColor = tcol;
      ctx.shadowBlur = 8 + 6 * Math.sin(this.t * 5);
    }
    ctx.fillStyle = tcol;
    ctx.globalAlpha = tempo >= 0.999 ? 0.82 + 0.18 * Math.sin(this.t * 7) : 1;
    ctx.fillText(`×${(game.tempoMult || 1).toFixed(2)}`, 42, 258);
    ctx.restore();

    // 拍长放在右边：它是"这一发要等多久"，属于同一件事的另一面。
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = ink(0.30);
    ctx.fillText(game.beat.toFixed(2) + 's', 240, 256);

    // 条：起点是"起手"，右端是满速。两处刻度就是 TEMPO_MARKS 的前两档——
    // 玩家不必记住 0.34 这种数字，他看到光点越过刻度时听到过那一声。
    const tx = 44, ty = 268, tw = 196;
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(tx, ty, tw, 3);
    const tg = ctx.createLinearGradient(tx, 0, tx + tw, 0);
    tg.addColorStop(0, 'rgba(90,200,250,0.85)');
    tg.addColorStop(0.68, 'rgba(255,176,58,0.9)');
    tg.addColorStop(1, 'rgba(255,92,138,0.95)');
    ctx.fillStyle = tg;
    ctx.fillRect(tx, ty, tw * tempo, 3);
    for (const m of TEMPO_MARKS) {
      const mx = tx + tw * Math.min(1, m.at);
      ctx.fillStyle = tempo >= m.at ? m.color : 'rgba(255,255,255,0.16)';
      ctx.fillRect(mx - 1, ty - 3, 2, 9);
    }

    // 扑克模式的两块专属仪表：狂热剩余时间 + 底牌槽。
    // 它们都在左栏（节奏表下方），因为它们是"机器状态"，不是盘面内容。
    if (game.rules === 'poker') {
      this.frenzyMeter(game);
      this.holdPanel(game);
    }

    // 容量
    const occ = game.occupied();
    const danger = occ >= N * 0.86;
    const warn = occ >= N * 0.64;
    ctx.textAlign = 'right';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('CHAIN LOAD', 1156, 56);
    ctx.font = `700 30px ${MONO}`;
    ctx.fillStyle = danger ? '#FF6B7A' : warn ? '#FFC53D' : ink(0.86);
    ctx.fillText(`${occ}`, 1124, 92);
    ctx.font = `600 14px ${MONO}`;
    ctx.fillStyle = ink(0.32);
    ctx.fillText(`/ ${N}`, 1156, 92);

    const cols = N <= 20 ? 5 : N <= 30 ? 6 : 8;
    for (let i = 0; i < N; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = 1156 - (cols - 1 - col) * 17 - 6;
      const y = 112 + row * 17;
      const filled = !!game.slots[i];
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, PI2);
      ctx.fillStyle = filled
        ? (danger ? '#FF6B7A' : warn ? '#FFC53D' : '#5AC8FA')
        : 'rgba(255,255,255,0.10)';
      ctx.fill();
    }

    // 射口状态
    const unlocked = game.nozzleCount();
    ctx.textAlign = 'right';
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(120,230,200,0.42)';
    const nextT = (() => {
      for (const [t, c] of CFG.stages) if (c > unlocked) return Math.max(0, t - game.time);
      return -1;
    })();
    ctx.fillText(
      nextT >= 0 ? `NOZZLE ×${unlocked}　→ ${nextT.toFixed(0)}s` : `NOZZLE ×${unlocked}`,
      1156, 214
    );

    // 满载警告
    if (occ >= N) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `800 30px ${FONT}`;
      ctx.fillStyle = `rgba(255,80,100,${0.55 + 0.35 * Math.sin(this.t * 12)})`;
      ctx.fillText('跑 道 已 满', CX, CY + 10);
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = `rgba(255,120,140,${0.4 + 0.3 * Math.sin(this.t * 12 + 1)})`;
      ctx.fillText('下一颗球落下前必须消掉一组', CX, CY + 40);
      ctx.restore();
    }

    this.comboMeter(game);

    // 操作提示
    ctx.textAlign = 'center';
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = ink(0.20);
    ctx.fillText(
      game.rules === 'poker'
        ? 'A / D 转轮　·　E / 右键 底牌暂存　·　SPACE 急停　·　V 高对比　·　M 静音　·　ESC 暂停'
        : 'A / D 转轮　·　SPACE 急停　·　V 高对比　·　M 静音　·　ESC 暂停',
      CX, 776
    );
  }

  /** 狂热：同花顺点火的 7 秒 ×2。有剩余时间时显示倒计时，否则显示规则预告。 */
  frenzyMeter(game) {
    const ctx = this.ctx;
    const live = game.frenzyT > 0.05;
    const x = 44, y = 292;

    ctx.textAlign = 'left';
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = live ? 'rgba(255,138,90,0.85)' : 'rgba(150,190,240,0.24)';
    ctx.fillText('FRENZY', x, y);

    if (live) {
      const pulse = 0.72 + 0.28 * Math.sin(this.t * 8);
      ctx.font = `800 18px ${MONO}`;
      ctx.fillStyle = `rgba(255,176,90,${pulse.toFixed(3)})`;
      ctx.shadowColor = 'rgba(255,138,90,0.9)';
      ctx.shadowBlur = 10;
      ctx.fillText(`×${(CFG.frenzyMult || 2).toFixed(1)}`, x + 62, y + 2);
      ctx.shadowBlur = 0;

      ctx.textAlign = 'right';
      ctx.font = `700 12px ${MONO}`;
      ctx.fillStyle = 'rgba(255,214,90,0.82)';
      ctx.fillText(`${game.frenzyT.toFixed(1)}s`, x + 196, y + 1);

      // 剩余时间条：狂热是"这局还剩几秒"的一部分，必须能一眼量出来
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y + 8, 196, 2.5);
      ctx.fillStyle = 'rgba(255,138,90,0.85)';
      ctx.fillRect(x, y + 8, 196 * Math.min(1, game.frenzyT / Math.max(0.01, CFG.frenzyDur)), 2.5);
    } else {
      ctx.font = `500 10px ${FONT}`;
      ctx.fillStyle = 'rgba(150,190,240,0.20)';
      ctx.fillText('同花顺 → 7s 狂热 ×2 + 续时 5s', x, y + 16);
    }
  }

  /**
   * 底牌暂存槽。
   *
   * 位置在左栏而不是炮口旁：炮口旁边已经有待发 + 两张预览，再塞一张牌
   * 会和"接下来三发"的读数混在一起。底牌槽是**玩家主动扣下的**，
   * 它属于操作台，不属于发牌机。
   */
  holdPanel(game) {
    const ctx = this.ctx;
    // 330 而不是 316：上面那行"同花顺 → 7s 狂热"是 10px 字，
    // 基线在 308，字底大约到 311；面板压到 316 会贴住它。
    const x = 44, y = 330, w = 196, h = 82;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fillStyle = 'rgba(9,14,22,0.76)';
    ctx.fill();
    ctx.strokeStyle = game.hold === null
      ? 'rgba(120,180,255,0.14)'
      : 'rgba(255,214,90,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `600 9px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,240,0.34)';
    ctx.fillText('HOLD · E / 右键', x + 12, y + 17);

    // 卡位
    const cx = x + 40, cy = y + 50;
    ctx.beginPath();
    ctx.roundRect(cx - 15, cy - 20, 30, 40, 4);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(140,170,210,0.22)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.setLineDash([]);

    if (game.hold !== null) {
      this.cardBody(cx, cy, 16, game.hold, false);
    } else {
      ctx.textAlign = 'center';
      ctx.font = `600 9px ${MONO}`;
      ctx.fillStyle = 'rgba(140,170,210,0.22)';
      ctx.fillText('空', cx, cy + 3);
    }

    // 读数：牌名 + 操作提示
    ctx.textAlign = 'left';
    if (game.hold !== null) {
      const s = cardSkin(game.hold);
      const name = s.kind === 'joker' ? '小丑牌'
        : s.kind === 'bomb' ? 'A 炸弹'
        : s.kind === 'down' ? '暗牌'
        : `${RANKS[s.rank] || ''} ${SUITS[s.suit] ? SUITS[s.suit].sym : ''}`;
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = s.light;
      ctx.fillText(name, x + 64, y + 48);
      ctx.font = `500 10px ${FONT}`;
      ctx.fillStyle = 'rgba(150,190,240,0.30)';
      ctx.fillText('再按一次换出', x + 64, y + 64);
    } else {
      ctx.font = `500 10px ${FONT}`;
      ctx.fillStyle = 'rgba(150,190,240,0.26)';
      ctx.fillText('扣下下一发', x + 64, y + 48);
      ctx.fillText('好牌先存着', x + 64, y + 64);
    }
    ctx.restore();
  }

  comboMeter(game) {
    const ctx = this.ctx;
    // 11 格 × 每格 2 点 = 满格 22，正好是最后一档（RUSH）的线。
    // 上一版是 12 格 × 每格 1 点，满格 12——但连消能到 22，
    // 后半段整条一直是满的，"快满了"这件事就消失了。
    const pips = 11;
    const perPip = 2;
    const w = 20, gap = 6;
    const total = pips * w + (pips - 1) * gap;
    const x0 = CX - total / 2;
    const y = 700;
    const filled = Math.min(Math.ceil(game.combo / perPip), pips);
    // 控制台显示的是**实际生效**的倍率，所以封顶要在这里一起读；
    // 否则扑克模式会显示 ×4.2、实际结算按 ×2.0，读数就成了谎话。
    const rawMult = comboMult(game.combo);
    const mult = CFG.comboCap > 0 ? Math.min(rawMult, CFG.comboCap) : rawMult;
    // 整条按**当前档位**统一上色。上一版是按格子的位置配色（前三格蓝、
    // 中间金、末尾红），那读的是"进度到哪了"，不是"我在第几档"——
    // 而档位才是这一轮要传达的东西。
    const tier = comboTierIndex(game.combo);
    const tc = tier ? COMBO_TIERS[tier - 1].color : '#5AC8FA';
    const trgb = tier ? hexRgb(tc) : '90,200,250';
    const hot = tier >= 4;

    // 控制台底座。上一版是三根光秃秃的进度条浮在空地上，读起来像网页控件，
    // 和上面那台机器没有任何关系。垫一块面板、两端收个圆角，
    // 它就变成"这台机器下面的操作台"——这是把 UI 收进世界观最省事的一招。
    const pw = total + 148, ph = 42;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(CX - pw / 2, y - 21, pw, ph, ph / 2);
    const pg = ctx.createLinearGradient(0, y - 21, 0, y + 21);
    pg.addColorStop(0, '#1A2432');
    pg.addColorStop(0.46, '#0C131C');
    pg.addColorStop(1, '#070B11');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 上沿一道亮线，下沿一道冷光
    ctx.beginPath();
    ctx.moveTo(CX - pw / 2 + 18, y - 20);
    ctx.lineTo(CX + pw / 2 - 18, y - 20);
    ctx.strokeStyle = 'rgba(190,230,255,0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(CX - pw / 2 + 24, y + 21);
    ctx.lineTo(CX + pw / 2 - 24, y + 21);
    ctx.strokeStyle = 'rgba(70,190,255,0.10)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // 两侧读数
    ctx.textAlign = 'left';
    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = 'rgba(150,190,240,0.26)';
    ctx.fillText('COMBO', x0 - 66, y + 4);
    ctx.textAlign = 'right';
    ctx.font = `700 13px ${MONO}`;
    ctx.fillStyle = mult > 1.0001 ? `rgba(255,214,90,${0.6 + 0.4 * Math.min(1, game.combo / 12)})` : 'rgba(150,190,240,0.22)';
    ctx.fillText(mult > 1.0001 ? `×${mult.toFixed(2)}` : '×1.00', x0 + total + 66, y + 5);

    for (let i = 0; i < pips; i++) {
      const x = x0 + i * (w + gap);
      const on = i < filled;
      ctx.beginPath();
      ctx.roundRect(x, y, w, 6, 3);
      ctx.fillStyle = on ? tc : 'rgba(255,255,255,0.07)';
      if (on) {
        ctx.shadowColor = `rgba(${trgb},0.8)`;
        ctx.shadowBlur = 9 + tier * 2;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 剩余窗口：断了就归零，玩家能看见"还剩多久"
    if (game.combo > 0) {
      const left = Math.max(0, 1 - (game.time - game.comboT) / 3.0);
      ctx.beginPath();
      ctx.roundRect(x0, y + 11, total * left, 2.5, 1.2);
      ctx.fillStyle = `rgba(${trgb},${0.15 + 0.55 * left})`;
      ctx.fill();
    }

    // 状态文案：放在控制台正下方，不再和浮字抢同一行
    ctx.textAlign = 'center';
    if (game.combo >= 2) {
      const name = tier ? COMBO_TIERS[tier - 1].name : '';
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = hot
        ? `rgba(${trgb},${0.6 + 0.4 * Math.sin(this.t * 9)})`
        : `rgba(${trgb},${0.55 + 0.45 * Math.min(1, game.combo / 10)})`;
      ctx.fillText(`${name ? name + ' · ' : ''}连消 ${game.combo}`, CX, y + 40);
    } else {
      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = 'rgba(160,200,250,0.22)';
      ctx.fillText('3 秒内持续消除 → 连消加成', CX, y + 40);
    }
  }

  // ---------- 覆盖层 ----------
  veil(a = 0.72) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(4,6,10,${a})`;
    ctx.fillRect(0, 0, VW, VH);
  }

  title(ui) {
    const ctx = this.ctx;
    this.veil(0.94);
    ctx.textAlign = 'center';

    ctx.font = `800 60px ${FONT}`;
    ctx.fillStyle = ink(0.96);
    ctx.fillText('双轮彩球蛇', CX, 132);

    // 副标只用自有的英文名 + 通用品类词。原来这里还带着一个不属于本作的
    // 品类商标，且字距是用空格拆开写的 —— 所以关键词检索搜不到它。
    // 检查商标词时必须先去掉空白再匹配，见 DESIGN §23。
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = 'rgba(120,200,255,0.52)';
    ctx.fillText('B I C Y C L E   C H A I N', CX, 166);

    ctx.font = `400 15px ${FONT}`;
    ctx.fillStyle = ink(0.50);
    ctx.fillText('炮口按节拍自动抛球，你只能转轮盘，把要接的那颗送到落点下。', CX, 210);
    ctx.font = `400 13px ${FONT}`;
    ctx.fillStyle = ink(0.30);
    ctx.fillText('连续每一拍都消除 → 连击加成；盘面塞满 → 出局。', CX, 234);

    // 第 7~9 个模式是隐藏拓扑，放在标题页第 2 页。
    // 翻页复用现有的 ← → / 1-9，不新增任何按键。
    const start = ui.sel >= 6 ? 6 : 0;
    const list = MODES.slice(start, start + 6);
    const n = list.length;

    // 第五个模式进来之后，214 宽的卡片会把左右两边顶到画布边（1200−1134=66，
    // 一边只剩 33px）。收窄到 202 不是为了好看，是为了让最外侧的卡片
    // 仍然有 60px 的安全边——标题页在超宽屏上会按比例放大，边距不够会先出事。
    // 第六个模式再收一档：6×178 + 5×10 = 1118，左右各留 41px。
    const cw = n >= 6 ? 178 : n >= 5 ? 202 : 202;
    const gap = n >= 6 ? 10 : n >= 5 ? 14 : 16;
    const total = n * cw + (n - 1) * gap;
    const x0 = CX - total / 2;
    const y0 = 268;
    const ch = 238;
    const statFont = n >= 6 ? 10 : 11;

    // 页码：它让"还有第二页"这件事在玩家按 → 之前就成立。
    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = start ? 'rgba(255,176,90,0.55)' : 'rgba(140,190,255,0.30)';
    ctx.fillText(start ? 'H I D D E N   T O P O L O G Y   ·   2 / 2' : 'B A S E   T O P O L O G Y   ·   1 / 2', CX, 252);

    for (let i = 0; i < n; i++) {
      const m = list[i];
      const x = x0 + i * (cw + gap);
      const sel = start + i === ui.sel;

      ctx.save();
      if (sel) {
        ctx.shadowColor = 'rgba(90,200,255,0.45)';
        ctx.shadowBlur = 28;
      }
      ctx.beginPath();
      ctx.roundRect(x, y0, cw, ch, 16);
      ctx.fillStyle = sel ? 'rgba(18,30,48,0.97)' : 'rgba(9,14,22,0.82)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = sel ? 'rgba(110,205,255,0.85)' : 'rgba(120,180,255,0.14)';
      ctx.lineWidth = sel ? 2 : 1.2;
      ctx.stroke();
      ctx.restore();

      if (sel) {
        ctx.beginPath();
        ctx.roundRect(x + 24, y0 - 1, cw - 48, 3, 2);
        ctx.fillStyle = 'rgba(110,205,255,0.9)';
        ctx.fill();
      }

      ctx.textAlign = 'left';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillStyle = sel ? ink(0.98) : ink(0.72);
      ctx.fillText(m.name, x + 18, y0 + 40);

      // 历史最高段位徽章：放右上角，和底部那排球色点分开 ——
      // 放底部会被读成"这关有 6 种球"。
      // 段位比分数更能留住玩家："我在这关是 S" 是个身份，分数只是一串数字。
      const best = ui.bests ? ui.bests[m.id] : 0;
      if (best) {
        const bt = TIERS[scoreBand(best, m)];
        const tw = bt.name.length > 1 ? 26 : 17;
        const bx = x + cw - 18 - tw, by = y0 + 25;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw, 15, 3);
        ctx.fillStyle = bt.color;
        ctx.globalAlpha = sel ? 0.16 : 0.09;
        ctx.fill();
        ctx.globalAlpha = sel ? 0.6 : 0.32;
        ctx.strokeStyle = bt.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = sel ? 1 : 0.65;
        ctx.font = `800 10px ${MONO}`;
        ctx.fillStyle = bt.color;
        ctx.textAlign = 'center';
        ctx.fillText(bt.name, bx + tw / 2, by + 11);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }

      ctx.font = `600 9px ${MONO}`;
      ctx.fillStyle = sel ? 'rgba(120,200,255,0.65)' : 'rgba(120,200,255,0.32)';
      ctx.fillText(m.en, x + 18, y0 + 58);

      ctx.strokeStyle = sel ? 'rgba(110,205,255,0.22)' : 'rgba(120,180,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 18, y0 + 74);
      ctx.lineTo(x + cw - 18, y0 + 74);
      ctx.stroke();

      ctx.font = `400 12px ${FONT}`;
      ctx.fillStyle = sel ? ink(0.56) : ink(0.38);
      ctx.fillText(m.blurb, x + 18, y0 + 98);

      const stats = [
        `${m.geo.n} 格 · ${m.layout} 射口`,
        `${m.cfg.levelTime} 秒 · S 线 ${m.tiers[3]}`,
        // 节拍写的是**满速**，不是时间地板的终点：玩家在这一局里真正会遇到的
        // 最快节奏是 beatRush，把 1.55 写上去等于承诺一个永远不会兑现的慢。
        `节拍 ${m.cfg.beatStart.toFixed(1)}→${m.cfg.beatRush.toFixed(1)}s`,
      ];
      ctx.font = `600 ${statFont}px ${MONO}`;
      ctx.fillStyle = sel ? ink(0.44) : ink(0.26);
      stats.forEach((s, k) => ctx.fillText(s, x + 18, y0 + 126 + k * 19));

      // 用牌面说明这一关会出什么：基础模式是色点，扑克模式是四张花色牌。
      if (m.rules === 'poker') {
        const demo = [
          CARD_BASE + 0 * 4 + 0,   // ♥10
          CARD_BASE + 1 * 4 + 1,   // ♦J
          CARD_BASE + 2 * 4 + 2,   // ♠Q
          CARD_BASE + 3 * 4 + 3,   // ♣K
        ];
        for (let k = 0; k < demo.length; k++) {
          this.cardBody(x + 24 + k * 30, y0 + 194, 11, demo[k], false);
        }
      } else {
        const nColors = Math.max(...m.cfg.colorSteps.map((st) => st[1]));
        for (let ci = 0; ci < nColors; ci++) {
          ctx.beginPath();
          ctx.arc(x + 24 + ci * 20, y0 + 196, 6, 0, PI2);
          // 这里不能读 ballSkin：规则族是**当前选中模式**的全局状态，
          // 选到扑克时再去画标准模式的色点，ci 0..3 会被解释成四张红心，
          // 四颗点全变红。标题页每一张卡都必须按**它自己**的规则上色。
          ctx.fillStyle = m.rules === 'dice' ? PIPS[ci].base : PALETTE[ci].base;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // 最高分 + 历史最高段位。段位比分数更能留住玩家：
      // "我在这关是 S"是一个身份，"我打了 8200 分"只是一串数字。
      ctx.font = `600 10px ${MONO}`;
      if (best) {
        ctx.fillStyle = sel ? ink(0.42) : ink(0.26);
        ctx.fillText(`BEST ${best}`, x + 18, y0 + ch - 14);
      } else {
        ctx.fillStyle = 'rgba(255,214,90,0.30)';
        ctx.fillText('BEST —', x + 18, y0 + ch - 14);
      }
      ctx.textAlign = 'center';
    }

    // 球种图谱：7 种球一字排开。
    // 它同时是三件事：新手教学、形状编码的自证、以及"色弱也能玩"的说明——
    // 只要玩家一眼看出这 7 个不是同一个圆换颜色，就会相信形状可以当线索用。
    // 图鉴按当前选中的模式换一套：基础模式讲"形状"，骰子模式讲"点数"。
    // 不共用一份，是因为这两个模式的球根本不是同一种东西——
    // 给骰子模式画四个八面体，等于告诉玩家"这关还是认形状"。
    const isDice = MODES[ui.sel] && MODES[ui.sel].rules === 'dice';
    const isPoker = MODES[ui.sel] && MODES[ui.sel].rules === 'poker';
    const LEG = isPoker
      ? [
        [CARD_BASE + 0 * 4 + 0, '♥10'],
        [CARD_BASE + 1 * 4 + 1, '♦J'],
        [CARD_BASE + 2 * 4 + 2, '♠Q'],
        [CARD_BASE + 3 * 4 + 3, '♣K'],
        [CARD_BASE + 4 * 4 + 0, '♥A'],
        [WILD, '小丑 · 万能'],
        [BOMB, 'A 炸弹 · 炸邻'],
        [SHIFT_BASE + 2, '染花牌'],
        [RUST, '背面暗牌'],
      ]
      : isDice
      ? [
        [0, '1 点 · 红'],
        [1, '2 点 · 橙'],
        [2, '3 点 · 金'],
        [3, '4 点 · 青'],
        [4, '5 点 · 蓝'],
        [5, '6 点 · 紫'],
        [WILD, '金骰 · 任意点'],
        [BOMB, '红骰 · 炸五格'],
        [20 + 2, '翻面骰 · 翻三'],
        [RUST, '铅骰 · 无点'],
      ]
      : [
        [0, '紫 · 八面体'],
        [1, '金 · 方核'],
        [2, '红 · 星芒'],
        [3, '青 · 棱锥'],
        [WILD, '万能 · 百搭'],
        [BOMB, '爆破 · 清两侧'],
        [RUST, '锈球 · 障碍'],
      ];
    const lgap = isPoker ? 112 : isDice ? 104 : 108;
    const lx0 = CX - ((LEG.length - 1) * lgap) / 2;
    for (let i = 0; i < LEG.length; i++) {
      const lx = lx0 + i * lgap;
      this.ballBody(lx, 660, isPoker ? 17 : isDice ? 17 : 16, LEG[i][0], false);
      ctx.font = `500 ${isPoker || isDice ? 10 : 11}px ${FONT}`;
      ctx.fillStyle = ink(0.34);
      ctx.textAlign = 'center';
      ctx.fillText(LEG[i][1], lx, 692);
    }

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    ctx.textAlign = 'center';
    ctx.font = `700 16px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.fillText('空格 开始', CX, 566);
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = ink(0.32);
    ctx.fillText(
      ui.sel >= 6
        ? '← → 选模式　·　7 - 9 隐藏拓扑　·　1 - 6 基础模式　·　V 高对比　·　M 静音'
        : '← → 选模式　·　1 - 9 直选　·　7 - 9 隐藏拓扑　·　V 高对比　·　M 静音',
      CX, 594
    );
  }

  result(game, ui) {
    const ctx = this.ctx;
    this.veil(0.70);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(CX - 320, 170, 640, 462, 20);
    ctx.fillStyle = 'rgba(9,14,24,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,255,0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';

    const dead = game.deadReason === 'overflow';
    ctx.font = `800 28px ${FONT}`;
    ctx.fillStyle = dead ? '#FF6B7A' : ink(0.9);
    ctx.fillText(dead ? '跑道塞满' : '时间到', CX, 220);

    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = ink(0.30);
    ctx.fillText(`${game.mode.en}　·　${game.mode.name}`, CX, 246);

    // 结算页也走同一套段位色：分数越高，整块数字越"烫"。
    // 下面那句「距 X 还差 N 分」才是复玩驱动的核心 —— 差得越少，重开率越高。
    const tp = tierProgress(game.score, game.mode);
    const tc = tp.tier.color;

    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.32);
    ctx.fillText('FINAL SCORE', CX, 282);
    ctx.save();
    ctx.font = `800 66px ${MONO}`;
    ctx.shadowColor = tc;
    ctx.shadowBlur = tp.i >= 3 ? 22 : 10;
    ctx.fillStyle = tc;
    ctx.fillText(String(game.score), CX, 344);
    ctx.restore();

    if (ui.newBest) {
      ctx.font = `700 12px ${MONO}`;
      ctx.fillStyle = `rgba(255,214,90,${0.7 + 0.3 * Math.sin(this.t * 5)})`;
      ctx.fillText('NEW BEST', CX, 366);
    }

    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = ink(0.50);
    ctx.fillText(
      `最长连锁 ${game.maxChain} 段　·　最高连消 ${game.maxCombo}　·　消除 ${game.clears} 次`,
      CX, 404
    );
    // 满速占比：这一版唯一一个"你打得多快"的战绩读数。
    // 它比"最高连消"更贴近这一局的实际手感——连消是爆发，满速是整局的奔跑状态。
    const fastPct = Math.round(100 * (game.fastT || 0) / Math.max(1, game.time));
    if (game.rules === 'poker') {
      // 扑克的战绩回答"我做过哪些牌型"，而不是"我打得多快"。
      ctx.fillText(
        `最长顺子 ${game.longestStraight} 张　·　同花顺 ${game.straightFlushes} 次　·　四条 ${game.fours} 次　·　狂热 ${game.frenzies} 次`,
        CX, 430
      );
      ctx.fillText(
        `底牌 ${game.holdUses} 次　·　筹码槽 ${game.chipClears} 次　·　小丑 ${game.chipJokers} 张　·　续时 +${(game.timeBonus || 0).toFixed(0)}s`,
        CX, 452
      );
    } else if (game.rules === 'dice') {
      // 骰子模式的战绩要回答"我做了哪些牌型"，而不是"我打得多快"——
      // 这个模式的炫耀点是顺子和六六六，不是转速。
      ctx.fillText(
        `最长顺子 ${game.longestRun} 连　·　六六六 ${game.jackpots} 次　·　续时 +${(game.timeBonus || 0).toFixed(0)}s`,
        CX, 430
      );
    } else {
      ctx.fillText(
        `落球 ${game.drops} 颗　·　满速 ${fastPct}%　·　清空跑道 ${game.sweeps} 次`,
        CX, 430
      );
    }

    ctx.save();
    ctx.font = `800 26px ${MONO}`;
    ctx.shadowColor = tc;
    ctx.shadowBlur = 14;
    ctx.fillStyle = tc;
    ctx.fillText(`RANK  ${tp.tier.name}`, CX, 478);
    ctx.restore();

    ctx.font = `600 12px ${MONO}`;
    if (tp.next) {
      ctx.fillStyle = ink(0.44);
      ctx.fillText(`距 ${tp.next.name} 还差 ${tp.gap} 分`, CX, 508);
    } else {
      ctx.fillStyle = tc;
      ctx.globalAlpha = 0.8;
      ctx.fillText('最高段位达成', CX, 508);
      ctx.globalAlpha = 1;
    }

    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = ink(0.32);
    ctx.fillText(`BEST ${Math.max(ui.best, game.score)}`, CX, 536);

    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`;
    ctx.fillText('空格 再来一局', CX, 578);
    ctx.font = `500 12px ${FONT}`;
    ctx.fillStyle = ink(0.30);
    ctx.fillText('ESC 换模式', CX, 604);
  }

  paused() {
    const ctx = this.ctx;
    this.veil(0.7);
    ctx.textAlign = 'center';
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = ink(0.8);
    ctx.fillText('已暂停', CX, 390);
    ctx.font = `500 14px ${FONT}`;
    ctx.fillStyle = ink(0.4);
    ctx.fillText('ESC 继续', CX, 424);
  }
}
