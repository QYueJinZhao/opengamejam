// Canvas2D 渲染层。虚拟画布 1200×800，按窗口等比缩放。
import { C, R, L, N, D, pointAt, mod } from './geom.js';
import { PALETTE, CFG } from './sim.js';

const VW = 1200, VH = 800;
const CX = 600, CY = 400;
const S = 30;                 // 世界单位 → 像素
const BEAD_R = (D * S) / 2 * 0.94;
const CHANNEL_W = D * S * 0.88;
const NOZZLE_Y = -10.5;
const IMPACT = pointAt(0);

const FONT = '"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Consolas,"Cascadia Mono",monospace';

const ink = (a) => `rgba(228,236,250,${a})`;

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

  begin() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070C';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
  }

  draw(game, ui, fx) {
    this.t = ui.t;
    this.begin();
    this.background(game);
    this.beltBase(game);
    this.slotTicks(game);
    this.beads(game);
    this.reticle(game);
    this.projectile(game);
    this.nozzle(game);
    this.particles(fx);
    this.floats(fx);
    if (ui.mode === 'play' || ui.mode === 'paused') this.hud(game, ui);
    if (ui.mode === 'title') this.title(ui);
    if (ui.mode === 'result') this.result(game, ui);
    if (ui.mode === 'paused') this.paused();
  }

  // ---------- 背景 ----------
  background(game) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(CX, CY, 80, CX, CY, 620);
    g.addColorStop(0, '#0C121C');
    g.addColorStop(0.55, '#080C14');
    g.addColorStop(1, '#04060A');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    // 中心极淡的机械盘
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(90,150,220,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(CX, CY, 190 + i * 62, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 危险红晕
    if (game) {
      const occ = game.occupied();
      if (occ >= 22) {
        const k = Math.min(1, (occ - 22) / 6);
        const pulse = 0.5 + 0.5 * Math.sin(this.t * (4 + k * 8));
        const rg = ctx.createRadialGradient(CX, CY, 260, CX, CY, 640);
        rg.addColorStop(0, 'rgba(255,60,80,0)');
        rg.addColorStop(1, `rgba(255,50,70,${0.03 + 0.10 * k * pulse})`);
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, VW, VH);
      }
    }
  }

  // ---------- 跑道 ----------
  stadiumPath(ctx, pad = 0) {
    const w = 2 * (C + R) * S + pad;
    const h = 2 * R * S + pad;
    ctx.beginPath();
    ctx.roundRect(CX - w / 2, CY - h / 2, w, h, h / 2);
  }

  beltBase(game) {
    const ctx = this.ctx;

    // 外发光
    ctx.save();
    ctx.shadowColor = 'rgba(56,132,255,0.26)';
    ctx.shadowBlur = 42;
    ctx.strokeStyle = 'rgba(10,16,26,1)';
    ctx.lineWidth = CHANNEL_W + 14;
    this.stadiumPath(ctx);
    ctx.stroke();
    ctx.restore();

    // 槽体（比背景亮一档，才读得出是跑道）
    const grad = ctx.createLinearGradient(0, CY - R * S - 20, 0, CY + R * S + 20);
    grad.addColorStop(0, '#131E2E');
    grad.addColorStop(0.5, '#0C1420');
    grad.addColorStop(1, '#111B29');
    ctx.strokeStyle = grad;
    ctx.lineWidth = CHANNEL_W;
    this.stadiumPath(ctx);
    ctx.stroke();

    // 内外缘高光
    ctx.strokeStyle = 'rgba(120,180,255,0.22)';
    ctx.lineWidth = 1.6;
    this.stadiumPath(ctx, CHANNEL_W);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,180,255,0.13)';
    this.stadiumPath(ctx, -CHANNEL_W);
    ctx.stroke();

    // 中缝
    ctx.strokeStyle = 'rgba(150,205,255,0.055)';
    ctx.lineWidth = 1;
    this.stadiumPath(ctx);
    ctx.stroke();

    // 轮毂
    for (const sx of [-1, 1]) {
      const p = this.toScreen({ x: sx * C, y: 0 });
      const hg = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 62);
      hg.addColorStop(0, 'rgba(70,130,210,0.12)');
      hg.addColorStop(1, 'rgba(70,130,210,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 62, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(150,200,255,0.30)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 38, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(130,180,240,0.09)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 中央铭牌
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(140,190,255,0.10)';
    ctx.fillText('B I C Y C L E   C H A I N', CX, CY - 8);
    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = 'rgba(140,190,255,0.06)';
    ctx.fillText('R E V E R S E   Z U M A', CX, CY + 12);
    ctx.restore();
  }

  slotTicks(game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const s = mod(i + game.phase, N) * D;
      const p = this.toScreen(pointAt(s));
      const a = s * 0.0 + (i % 7 === 0 ? 0.16 : 0.07);
      ctx.strokeStyle = `rgba(140,190,255,${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BEAD_R + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- 珠子 ----------
  beads(game) {
    const ctx = this.ctx;
    const slots = [];
    for (let i = 0; i < N; i++) {
      const b = game.slots[i];
      if (b) slots.push([i, b]);
    }
    // 先画非高亮，再画高亮，保证层级
    for (const pass of [0, 1]) {
      for (const [i, b] of slots) {
        const s = mod((i + b.dx) + game.phase, N) * D;
        const near = this.arrivalAlpha(game, s);
        if ((near > 0.02) !== (pass === 1)) continue;
        this.drawBead(s, b, near);
      }
    }
  }

  // 0..1：这颗珠还有多久到落点（越接近 1 越"马上要被接住"）
  arrivalAlpha(game, s) {
    const v = game.v;
    const av = Math.abs(v);
    if (av < 0.08) return 0;
    const p = s / D;                       // 槽位坐标
    const dist = v > 0 ? mod(N - p, N) : mod(p, N);
    const reach = av * CFG.flightTime;     // 飞行期间会走过的槽数
    if (dist > reach) return 0;
    return 1 - dist / Math.max(reach, 0.001) * 0.75;
  }

  drawBead(s, b, near) {
    const ctx = this.ctx;
    const c = PALETTE[b.ci];
    const p = this.toScreen(pointAt(s));
    const r = BEAD_R;

    // 到场高亮光晕
    if (near > 0.02) {
      ctx.save();
      ctx.globalAlpha = near * 0.9;
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2.1);
      g.addColorStop(0, c.base + '99');
      g.addColorStop(1, c.base + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 本体
    const g2 = ctx.createRadialGradient(p.x - r * 0.34, p.y - r * 0.38, r * 0.15, p.x, p.y, r * 1.05);
    g2.addColorStop(0, c.light);
    g2.addColorStop(0.45, c.base);
    g2.addColorStop(1, c.dark);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g2;
    ctx.fill();

    // 边缘
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.stroke();

    // 到场描边
    if (near > 0.02) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + near * 0.6})`;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    // 形符（色盲冗余）
    this.glyph(p.x, p.y, r * 0.42, c.glyph, 'rgba(255,255,255,0.82)');

    // 高光点
    ctx.beginPath();
    ctx.arc(p.x - r * 0.33, p.y - r * 0.36, r * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }

  glyph(x, y, r, kind, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.28);
    ctx.beginPath();
    if (kind === 'circle') {
      ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'triangle') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.92, y + r * 0.7);
      ctx.lineTo(x - r * 0.92, y + r * 0.7);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'square') {
      ctx.rect(x - r * 0.78, y - r * 0.78, r * 1.56, r * 1.56);
      ctx.fill();
    } else {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.78, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.78, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 落点 ----------
  reticle(game) {
    const ctx = this.ctx;
    const p = this.toScreen(IMPACT);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);

    // 容差刻度 ±0.25 格
    const halfW = 0.25 * D * S;
    ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.10 * pulse})`;
    ctx.lineWidth = 2;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(p.x + sgn * halfW, p.y - 12);
      ctx.lineTo(p.x + sgn * halfW, p.y + 12);
      ctx.stroke();
    }

    // 旋转虚线环
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(this.t * 0.9);
    ctx.setLineDash([5, 9]);
    ctx.strokeStyle = `rgba(150,210,255,${0.30 + 0.18 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, BEAD_R + 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // 中心十字
    ctx.strokeStyle = 'rgba(180,225,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7);
    ctx.stroke();
  }

  // ---------- 飞行球 ----------
  projectile(game) {
    if (!game.ball) return;
    const ctx = this.ctx;
    const c = PALETTE[game.ball.ci];
    const k = Math.min(1, game.ball.t / CFG.flightTime);
    const ease = k * k * (3 - 2 * k);

    const from = { x: 0, y: NOZZLE_Y + 0.9 };
    const to = IMPACT;
    const x = (from.x + (to.x - from.x) * ease);
    const y = (from.y + (to.y - from.y) * ease);
    const p = this.toScreen({ x, y });

    // 尾迹
    for (let i = 5; i >= 1; i--) {
      const kk = Math.max(0, ease - i * 0.035);
      const tp = this.toScreen({
        x: from.x + (to.x - from.x) * kk,
        y: from.y + (to.y - from.y) * kk,
      });
      const rr = BEAD_R * (1 - i * 0.1);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = c.base + Math.round(50 - i * 8).toString(16).padStart(2, '0');
      ctx.fill();
    }

    // 光晕
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, BEAD_R * 1.55);
    g.addColorStop(0, c.light);
    g.addColorStop(0.45, c.base + '7A');
    g.addColorStop(1, c.base + '00');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, BEAD_R * 1.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, BEAD_R * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = c.light;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    this.glyph(p.x, p.y, BEAD_R * 0.38, c.glyph, 'rgba(20,24,32,0.65)');
  }

  // ---------- 炮口 ----------
  nozzle(game) {
    const ctx = this.ctx;
    const p = this.toScreen({ x: 0, y: NOZZLE_Y });
    const c = PALETTE[game.nextCi];
    const charge = Math.min(1, game.beatClock / game.beat);

    // 瞄准虚线
    ctx.save();
    ctx.setLineDash([4, 10]);
    ctx.strokeStyle = 'rgba(150,200,255,0.13)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 26);
    ctx.lineTo(p.x, this.toScreen(IMPACT).y);
    ctx.stroke();
    ctx.restore();

    // 炮体
    ctx.beginPath();
    ctx.moveTo(p.x - 26, p.y - 16);
    ctx.lineTo(p.x + 26, p.y - 16);
    ctx.lineTo(p.x + 15, p.y + 16);
    ctx.lineTo(p.x - 15, p.y + 16);
    ctx.closePath();
    ctx.fillStyle = '#131A26';
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,190,255,0.22)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 充能弧
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.strokeStyle = c.base;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // 待发球
    ctx.beginPath();
    ctx.arc(p.x, p.y + 2, 11, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(p.x - 4, p.y - 2, 2, p.x, p.y + 2, 12);
    g.addColorStop(0, c.light);
    g.addColorStop(1, c.base);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // ---------- 特效 ----------
  particles(fx) {
    const ctx = this.ctx;
    for (const pt of fx.parts) {
      const a = Math.max(0, pt.life / pt.max);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * a, 0, Math.PI * 2);
      ctx.fillStyle = pt.color.replace('ALPHA', (a * 0.9).toFixed(2));
      ctx.fill();
    }
  }

  floats(fx) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const f of fx.floats) {
      const a = Math.max(0, f.life / f.max);
      const y = f.y - (1 - a) * 46;
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px ${MONO}`;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- HUD ----------
  hud(game, ui) {
    const ctx = this.ctx;

    // 分数
    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('SCORE', 44, 56);
    ctx.font = `700 46px ${MONO}`;
    ctx.fillStyle = ink(0.94);
    ctx.fillText(String(game.score).padStart(5, '0'), 42, 100);

    // 时间
    const left = Math.max(0, CFG.levelTime - game.time);
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('TIME', 44, 140);
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = left < 15 ? '#FF6B7A' : ink(0.86);
    ctx.fillText(left.toFixed(1) + 's', 42, 170);

    const barW = 180;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(44, 182, barW, 4);
    ctx.fillStyle = left < 15 ? '#FF6B7A' : '#5AC8FA';
    ctx.fillRect(44, 182, barW * (left / CFG.levelTime), 4);

    // 节拍
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('BEAT', 44, 218);
    ctx.font = `700 20px ${MONO}`;
    ctx.fillStyle = ink(0.62);
    ctx.fillText(game.beat.toFixed(2) + 's', 42, 244);

    // 链长（容量）
    const occ = game.occupied();
    const gx = 1060, gy = 56;
    ctx.textAlign = 'right';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('CHAIN LOAD', 1156, 56);
    ctx.font = `700 30px ${MONO}`;
    ctx.fillStyle = occ >= 24 ? '#FF6B7A' : occ >= 18 ? '#FFC53D' : ink(0.86);
    ctx.fillText(`${occ}`, 1124, 92);
    ctx.font = `600 14px ${MONO}`;
    ctx.fillStyle = ink(0.32);
    ctx.fillText(`/ ${N}`, 1156, 92);

    // 28 格点阵
    for (let i = 0; i < N; i++) {
      const col = i % 7, row = Math.floor(i / 7);
      const x = 1156 - (6 - col) * 17 - 6;
      const y = 112 + row * 17;
      const filled = !!game.slots[i];
      ctx.beginPath();
      ctx.arc(x, y, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = filled
        ? (occ >= 24 ? '#FF6B7A' : occ >= 18 ? '#FFC53D' : '#5AC8FA')
        : 'rgba(255,255,255,0.10)';
      ctx.fill();
    }

    // 连锁 / 提示
    ctx.textAlign = 'center';
    if (game.chain >= 2) {
      const k = Math.min(1, (game.chain - 1) / 4);
      ctx.font = `800 ${34 + k * 22}px ${MONO}`;
      ctx.fillStyle = `rgba(255,214,90,${0.75 + 0.25 * Math.sin(this.t * 12)})`;
      ctx.fillText(`×${[1, 2, 4, 8, 12][Math.min(game.chain - 1, 4)]}  CHAIN ${game.chain}`, CX, 690);
    }

    // 底部操作提示
    ctx.font = `500 13px ${FONT}`;
    ctx.fillStyle = ink(0.22);
    ctx.fillText('A / D 或 ← / → 转轮　·　SPACE 急停　·　ESC 暂停', CX, 770);

    // 目标进度
    if (ui.target) {
      ctx.textAlign = 'left';
      ctx.font = `600 11px ${FONT}`;
      ctx.fillStyle = ink(0.3);
      ctx.fillText('TARGET ' + ui.target, 44, 286);
    }
  }

  // ---------- 覆盖层 ----------
  veil(a = 0.72) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(4,6,10,${a})`;
    ctx.fillRect(0, 0, VW, VH);
  }

  title() {
    const ctx = this.ctx;
    this.veil(0.82);
    ctx.textAlign = 'center';

    ctx.font = `800 64px ${FONT}`;
    ctx.fillStyle = ink(0.96);
    ctx.fillText('双轮彩球蛇', CX, 296);

    ctx.font = `600 15px ${MONO}`;
    ctx.fillStyle = 'rgba(120,200,255,0.55)';
    ctx.fillText('B I C Y C L E - C H A I N   R E V E R S E   Z U M A', CX, 332);

    ctx.font = `400 16px ${FONT}`;
    ctx.fillStyle = ink(0.55);
    ctx.fillText('炮口按节拍自动抛球，你只能转轮盘。', CX, 400);
    ctx.fillText('把要接的那颗珠转到落点上。', CX, 430);

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.fillText('按 空格 开始', CX, 520);
  }

  result(game, ui) {
    const ctx = this.ctx;
    this.veil(0.86);
    ctx.textAlign = 'center';

    const dead = game.deadReason === 'overflow';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = dead ? '#FF6B7A' : ink(0.9);
    ctx.fillText(dead ? '跑道塞满' : '时间到', CX, 250);

    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = ink(0.32);
    ctx.fillText('FINAL SCORE', CX, 310);
    ctx.font = `800 72px ${MONO}`;
    ctx.fillStyle = ink(0.97);
    ctx.fillText(String(game.score), CX, 380);

    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = ink(0.5);
    ctx.fillText(`最长连锁 ×${[1, 2, 4, 8, 12][Math.min(Math.max(game.maxChain, 1) - 1, 4)]}　·　消除 ${game.clears} 次　·　发球 ${game.shots} 次`, CX, 440);

    ctx.font = `700 22px ${MONO}`;
    ctx.fillStyle = 'rgba(255,214,90,0.9)';
    ctx.fillText(ui.rank, CX, 500);

    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`;
    ctx.fillText('按 空格 重开', CX, 570);
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
