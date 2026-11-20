// Canvas2D 渲染层。虚拟画布 1200×800，按窗口等比缩放。
import { C, R, L, N, D, pointAt, mod } from './geom.js';
import { PALETTE, CFG, NOZZLE_OFF } from './sim.js';

const VW = 1200, VH = 800;
const CX = 600, CY = 400;
const S = 30;                 // 世界单位 → 像素
const BEAD_R = (D * S) / 2 * 0.94;
const CHANNEL_W = D * S * 1.06;   // 槽宽必须略大于珠径，否则珠子会溢出跑道

// 两个喷头：主在顶部朝下、副在底部朝上；落点相距半圈
const NOZZLE_POS = [{ x: 0, y: -10.6 }, { x: 0, y: 9.8 }];
const IMPACT = [pointAt(0), pointAt(L / 2)];

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
    const grad = ctx.createLinearGradient(0, CY - R * S - 34, 0, CY + R * S + 34);
    grad.addColorStop(0, '#1B2A3F');
    grad.addColorStop(0.5, '#101B2A');
    grad.addColorStop(1, '#182740');
    ctx.strokeStyle = grad;
    ctx.lineWidth = CHANNEL_W;
    this.stadiumPath(ctx);
    ctx.stroke();

    // 内外缘高光
    ctx.strokeStyle = 'rgba(130,190,255,0.30)';
    ctx.lineWidth = 2;
    this.stadiumPath(ctx, CHANNEL_W);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(130,190,255,0.20)';
    ctx.lineWidth = 2;
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
    for (let i = 0; i < N; i++) {
      if (game.slots[i]) continue;   // 有珠的槽不画点，避免被珠子压住显脏
      const s = mod(i + game.phase, N) * D;
      const p = this.toScreen(pointAt(s));
      ctx.beginPath();
      ctx.arc(p.x, p.y, i % 7 === 0 ? 2.0 : 1.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(140,190,255,${i % 7 === 0 ? 0.20 : 0.10})`;
      ctx.fill();
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

  // 0..1：这颗珠还有多久到「最近的落点」（越接近 1 越"马上要被接住"）
  arrivalAlpha(game, s) {
    const v = game.v;
    const av = Math.abs(v);
    if (av < 0.08) return 0;
    const p = s / D;                       // 珠子的槽位坐标（连续）
    const reach = av * CFG.flightTime;     // 飞行期间会走过的槽数
    const n = game.nozzleCount();
    let best = 0;
    for (let i = 0; i < n; i++) {
      const tgt = mod(-game.phase + NOZZLE_OFF[i], N);
      const dist = v > 0 ? mod(tgt - p, N) : mod(p - tgt, N);
      if (dist > reach) continue;
      best = Math.max(best, 1 - dist / Math.max(reach, 0.001) * 0.75);
    }
    return best;
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
    } else if (kind === 'cross') {
      const w = r * 0.34, h = r * 0.95;
      ctx.rect(x - w, y - h, w * 2, h * 2);
      ctx.rect(x - h, y - w, h * 2, w * 2);
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
    const n = game.nozzleCount();
    for (let i = 0; i < n; i++) this.reticleAt(game, i);
  }

  reticleAt(game, idx) {
    const ctx = this.ctx;
    const p = this.toScreen(IMPACT[idx]);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5 + idx * 1.9);

    // 落点为空：球会吸附到最近的珠子。画一条虚线把"炮口指向"和"实际插入点"连起来，
    // 否则玩家会以为球钉在了空皮带上。
    const dropSlot = game.impactSlot(NOZZLE_OFF[idx]);
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

      // 实际插入点小环
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, BEAD_R + 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,196,110,${0.22 + 0.14 * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

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
    ctx.rotate(this.t * 0.9 * (idx ? -1 : 1));
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
    for (let i = 0; i < game.balls.length; i++) this.drawProjectile(game, game.balls[i], i);
  }

  drawProjectile(game, ball, idx) {
    const ctx = this.ctx;
    const c = PALETTE[ball.ci];
    const k = Math.min(1, ball.t / CFG.flightTime);
    const ease = k * k * (3 - 2 * k);

    const from = NOZZLE_POS[idx] || NOZZLE_POS[0];
    const to = IMPACT[idx] || IMPACT[0];
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
    const n = game.nozzleCount();
    for (let i = 0; i < n; i++) this.drawNozzle(game, i, false);
    // 未激活的副炮口：画一个暗着的占位，提示"这里马上会开"
    if (n < 2) this.drawNozzle(game, 1, true);
  }

  drawNozzle(game, idx, dormant) {
    const ctx = this.ctx;
    const down = idx === 0;
    const p = this.toScreen(NOZZLE_POS[idx]);
    const c = PALETTE[game.nozzleCi[idx]];
    const charge = Math.min(1, game.beatClock / game.beat);
    const dir = down ? 1 : -1;

    // 瞄准虚线
    ctx.save();
    ctx.setLineDash([4, 10]);
    ctx.strokeStyle = dormant ? 'rgba(150,200,255,0.05)' : 'rgba(150,200,255,0.13)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 26 * dir);
    ctx.lineTo(p.x, this.toScreen(IMPACT[idx]).y);
    ctx.stroke();
    ctx.restore();

    // 炮体（梯形，朝落点方向收窄）
    const h = 16 * dir;
    ctx.beginPath();
    ctx.moveTo(p.x - 26, p.y - h);
    ctx.lineTo(p.x + 26, p.y - h);
    ctx.lineTo(p.x + 15, p.y + h);
    ctx.lineTo(p.x - 15, p.y + h);
    ctx.closePath();
    ctx.fillStyle = dormant ? '#141D2B' : '#131A26';
    ctx.fill();
    ctx.strokeStyle = dormant ? 'rgba(140,190,255,0.20)' : 'rgba(140,190,255,0.28)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 充能弧
    if (!dormant) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.strokeStyle = c.base;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // 待发球
    const py = p.y - 2 * dir;
    ctx.beginPath();
    ctx.arc(p.x, py, 11, 0, Math.PI * 2);
    if (dormant) {
      ctx.fillStyle = 'rgba(60,80,110,0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,190,255,0.14)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // 锁定小锁
      ctx.font = `600 10px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(140,190,255,0.28)';
      ctx.fillText(`${Math.ceil(CFG.nozzle2At - game.time)}s`, p.x, p.y + 4);
      ctx.textAlign = 'left';
    } else {
      const g = ctx.createRadialGradient(p.x - 4, py - 2, 2, p.x, py, 12);
      g.addColorStop(0, c.light);
      g.addColorStop(1, c.base);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
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

    // 副喷头解锁倒计时
    if (game.nozzleCount() < 2) {
      const t = Math.max(0, CFG.nozzle2At - game.time);
      ctx.textAlign = 'right';
      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = 'rgba(140,190,255,0.42)';
      ctx.fillText(`NOZZLE 2  ${t.toFixed(0)}s`, 1156, 214);
    } else {
      ctx.textAlign = 'right';
      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = 'rgba(120,230,200,0.42)';
      ctx.fillText('NOZZLE ×2', 1156, 214);
    }

    // 满载警告：跑道塞满时，下一颗落球就是死，必须让玩家看见
    if (occ >= N) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `800 30px ${FONT}`;
      ctx.fillStyle = `rgba(255,80,100,${0.55 + 0.35 * Math.sin(this.t * 12)})`;
      ctx.fillText('跑 道 已 满', CX, CY + 10);
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = `rgba(255,120,140,${0.4 + 0.3 * Math.sin(this.t * 12 + 1)})`;
      ctx.fillText('接住一颗同色珠就能腾出空间', CX, CY + 40);
      ctx.restore();
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
    this.veil(0.87);
    ctx.textAlign = 'center';

    ctx.font = `800 64px ${FONT}`;
    ctx.fillStyle = ink(0.96);
    ctx.fillText('双轮彩球蛇', CX, 194);

    ctx.font = `600 15px ${MONO}`;
    ctx.fillStyle = 'rgba(120,200,255,0.55)';
    ctx.fillText('B I C Y C L E - C H A I N   R E V E R S E   Z U M A', CX, 234);

    ctx.font = `400 16px ${FONT}`;
    ctx.fillStyle = ink(0.55);
    ctx.fillText('两个炮口按节拍自动抛球，你只能转轮盘。', CX, 370);
    ctx.fillText('它们相距半圈——你永远只能照顾好一边。', CX, 400);

    const pulse = 0.55 + 0.45 * Math.sin(this.t * 3);
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx.fillText('按 空格 开始', CX, 618);
  }

  result(game, ui) {
    const ctx = this.ctx;
    this.veil(0.70);

    // 深色卡片：结算文字必须和背后的珠子隔开，否则读不清
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(CX - 310, 196, 620, 412, 20);
    ctx.fillStyle = 'rgba(6,10,18,0.93)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,255,0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';

    const dead = game.deadReason === 'overflow';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = dead ? '#FF6B7A' : ink(0.9);
    ctx.fillText(dead ? '跑道塞满' : '时间到', CX, 252);

    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = ink(0.32);
    ctx.fillText('FINAL SCORE', CX, 306);
    ctx.font = `800 72px ${MONO}`;
    ctx.fillStyle = ink(0.97);
    ctx.fillText(String(game.score), CX, 376);

    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = ink(0.5);
    ctx.fillText(
      `最长连锁 ${game.maxChain} 段　·　消除 ${game.clears} 次　·　落球 ${game.drops} 颗　·　吸附 ${game.snapped} 次`,
      CX, 434
    );

    ctx.font = `700 22px ${MONO}`;
    ctx.fillStyle = 'rgba(255,214,90,0.9)';
    ctx.fillText(ui.rank, CX, 490);

    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.4})`;
    ctx.fillText('按 空格 重开', CX, 556);
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
