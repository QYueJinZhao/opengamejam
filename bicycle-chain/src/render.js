// Canvas2D 渲染层。虚拟画布 1200×800，按窗口等比缩放。
//
// 几何全部动态：轮径 / 槽数 / 射口位置由当前 Game 决定。
// 球用**形状**做第一编码：4 基础色（八面体 / 倒角方核 / 星芒 / 三角棱锥）
// + 3 特殊球（彩虹星晶 / 机械雷 / 锈铁块），7 个剪影互不相似。
// 色相退成第二编码，所以高对比模式（V 键）只需要加强图底分离，不需要额外形符。

import { C, R, L, N, D, pointAt, tangentAt, normalAt, mod } from './geom.js';
import { PALETTE, CFG, comboMult, ballSkin, RUST, WILD, BOMB } from './sim.js';
import { MODES, TIERS, scoreBand, tierProgress } from './modes.js';

const VW = 1200, VH = 800;
const CX = 600, CY = 400;
const PI2 = Math.PI * 2;

const FONT = '"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Consolas,"Cascadia Mono",monospace';
const ink = (a) => `rgba(228,236,250,${a})`;

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

  S = Math.min(34, 250 / (R + 4.2));
  BEAD_R = (D * S) / 2 * 0.94;
  CHANNEL_W = D * S * 1.06;

  IMPACTS = [];
  NOZZLES = [];
  for (const off of game.nozzleOff) {
    const s = mod(off, N) * D;
    const p = pointAt(s);
    const nrm = normalAt(s);
    const tan = tangentAt(s);
    IMPACTS.push(p);
    NOZZLES.push({
      x: p.x + nrm.x * 3.7,
      y: p.y + nrm.y * 3.7,
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
    const g = ctx.createRadialGradient(CX, CY, 80, CX, CY, 640);
    g.addColorStop(0, '#0C121C');
    g.addColorStop(0.55, '#080C14');
    g.addColorStop(1, '#04060A');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = 'rgba(90,150,220,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(CX, CY, 200 + i * 70, 0, PI2);
      ctx.stroke();
    }
    ctx.restore();

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

  // ---------- 跑道 ----------
  stadiumPath(ctx, pad = 0) {
    const w = 2 * (C + R) * S + pad;
    const h = 2 * R * S + pad;
    ctx.beginPath();
    ctx.roundRect(CX - w / 2, CY - h / 2, w, h, h / 2);
  }

  // ---------- 底盘 ----------
  // 绘制顺序是定死的：托盘 → 飞轮 → 凹槽导轨 → 双倍槽 → 珠子。
  // 飞轮必须压在托盘上、又在导轨之下，否则齿会盖住跑道边。
  chassis(game) {
    this.plate();
    this.flywheels(game);
    this.groove();
    this.pads(game);
  }

  /** 拉丝金属托盘。它比导轨宽一圈，是"整台机器"的底座，不是跑道本身。 */
  plate() {
    const ctx = this.ctx;
    const padOut = CHANNEL_W + 44;          // 相对导轨外沿再宽出的量
    const halfH = R * S + (CHANNEL_W + padOut) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(30,130,220,0.30)';
    ctx.shadowBlur = 56;
    ctx.fillStyle = '#070B12';
    this.stadiumPath(ctx, padOut);
    ctx.fill();
    ctx.restore();

    const g = ctx.createLinearGradient(0, CY - halfH, 0, CY + halfH);
    g.addColorStop(0, '#1D2836');
    g.addColorStop(0.18, '#131C27');
    g.addColorStop(0.56, '#0C121A');
    g.addColorStop(0.86, '#151E2A');
    g.addColorStop(1, '#090E15');
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
      ctx.fillStyle = `rgba(150,195,245,${(0.004 + k * 0.009).toFixed(4)})`;
      ctx.fillRect(CX - 470, yy, 940, 1);
    }
    // 倒角：外沿一道亮、内沿一道暗，两笔就能把"板"读成"有厚度的板"
    ctx.strokeStyle = 'rgba(160,210,255,0.12)';
    ctx.lineWidth = 2;
    this.stadiumPath(ctx, padOut - 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.60)';
    ctx.lineWidth = 2;
    this.stadiumPath(ctx, padOut - 18);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 两端飞轮。位置就是两个半圆的圆心，所以它读起来是"链条绕过的那两个轮"，
   * 不是贴上去的装饰。转速直接取 phase：链条走多少，轮就转多少，
   * 玩家按方向键时能立刻看到轮在跟手转——这是整台机器"活着"的凭据。
   */
  flywheels(game) {
    const rr = R * S * 0.66;
    const rot = game ? (game.phase / N) * PI2 : 0;
    for (const sx of [-1, 1]) {
      const p = this.toScreen({ x: sx * C, y: 0 });
      this.gear(p.x, p.y, rr, rot);
    }
  }

  gear(cx, cy, r, rot) {
    const ctx = this.ctx;
    const teeth = 16;
    const r0 = r * 0.86, r1 = r;

    ctx.save();
    ctx.translate(cx, cy);

    // 齿盘：每颗齿是一个梯形，底边落在 r0 上
    ctx.save();
    ctx.rotate(rot);
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
    const mg = ctx.createLinearGradient(-r, -r, r, r);
    mg.addColorStop(0, '#3B4A5F');
    mg.addColorStop(0.42, '#222D3C');
    mg.addColorStop(1, '#0D1420');
    ctx.fillStyle = mg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,200,255,0.20)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 辐条 + 轮毂
    ctx.strokeStyle = 'rgba(10,15,22,0.85)';
    ctx.lineWidth = r * 0.15;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.20, Math.sin(a) * r * 0.20);
      ctx.lineTo(Math.cos(a) * r0 * 0.84, Math.sin(a) * r0 * 0.84);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.30, 0, PI2);
    const hg = ctx.createRadialGradient(-r * 0.08, -r * 0.09, 1, 0, 0, r * 0.30);
    hg.addColorStop(0, '#4A5A70');
    hg.addColorStop(1, '#141C28');
    ctx.fillStyle = hg;
    ctx.fill();

    // 蓝光灯环：拆解图里最醒目的一笔，也是唯一的高饱和元素
    ctx.beginPath();
    ctx.arc(0, 0, r0 * 0.90, 0, PI2);
    ctx.strokeStyle = 'rgba(90,200,255,0.42)';
    ctx.lineWidth = Math.max(1.4, r * 0.045);
    ctx.shadowColor = 'rgba(70,190,255,0.9)';
    ctx.shadowBlur = 14;
    ctx.stroke();
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
    ctx.strokeStyle = '#05090F';
    ctx.lineWidth = CHANNEL_W;
    edge(0);
    ctx.stroke();

    const wall = ctx.createLinearGradient(0, CY - R * S - CHANNEL_W, 0, CY + R * S + CHANNEL_W);
    wall.addColorStop(0, '#2A3B52');
    wall.addColorStop(0.5, '#16222F');
    wall.addColorStop(1, '#22334A');
    ctx.strokeStyle = wall;
    ctx.lineWidth = CHANNEL_W;
    edge(0);
    ctx.stroke();

    // 中间压暗，形成"两条平行轨"的错觉
    ctx.strokeStyle = 'rgba(4,8,14,0.82)';
    ctx.lineWidth = CHANNEL_W * 0.50;
    edge(0);
    ctx.stroke();

    for (const k of [1, -1]) {
      ctx.strokeStyle = 'rgba(150,200,255,0.20)';
      ctx.lineWidth = 2;
      edge(k * CHANNEL_W * 0.42);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.4;
      edge(k * (CHANNEL_W * 0.42 + 2.6));
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

  /**
   * ×2 得分槽：铺在轨道上的一小段发光带。
   *
   * 它不是装饰，是有坐标的判定区：消除段的**中心**落在这段弧里才双倍。
   * 所以画法必须让"范围"可读——带子有多长，判定就有多长，不能画成一个点。
   */
  pads(game) {
    if (!game || !game.pads || !game.pads.length) return;
    const ctx = this.ctx;
    const halfW = CHANNEL_W * 0.46;
    const half = CFG.padHalf * D;

    for (let i = 0; i < game.pads.length; i++) {
      const pad = game.pads[i];
      const steps = 10;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.4 + i * 2.1);

      const outer = [], inner = [];
      for (let k = 0; k <= steps; k++) {
        const s = pad.s - half + 2 * half * (k / steps);
        const p = this.toScreen(pointAt(s));
        const n = normalAt(s);
        outer.push([p.x + n.x * halfW, p.y + n.y * halfW]);
        inner.push([p.x - n.x * halfW, p.y - n.y * halfW]);
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(outer[0][0], outer[0][1]);
      for (const q of outer) ctx.lineTo(q[0], q[1]);
      for (let k = inner.length - 1; k >= 0; k--) ctx.lineTo(inner[k][0], inner[k][1]);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,196,60,${(0.08 + 0.07 * pulse).toFixed(3)})`;
      ctx.fill();
      ctx.shadowColor = 'rgba(255,200,70,0.8)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = `rgba(255,214,90,${(0.42 + 0.30 * pulse).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // 中心虚线：有它这条带子才读成"一段有起点终点的判定区"，
      // 而不是"轨道被刷成了金色"。填色已经压得很薄，识别全靠这根线。
      ctx.shadowBlur = 0;
      ctx.beginPath();
      for (let k = 0; k <= steps; k++) {
        const s = pad.s - half + 2 * half * (k / steps);
        const q = this.toScreen(pointAt(s));
        const n = normalAt(s);
        // 画在外沿而不是中心线：中心线会被珠子完全盖住，等于没画
        const qx = q.x + n.x * halfW, qy = q.y + n.y * halfW;
        if (k === 0) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      }
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = `rgba(255,226,140,${(0.34 + 0.26 * pulse).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // ×2 标签压在外侧，避开珠子
      const cp = this.toScreen(pointAt(pad.s));
      const cn = normalAt(pad.s);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 13px ${MONO}`;
      ctx.fillStyle = `rgba(255,214,90,${(0.58 + 0.34 * pulse).toFixed(3)})`;
      ctx.shadowColor = 'rgba(255,190,60,0.9)';
      ctx.shadowBlur = 10;
      ctx.fillText('×2', cp.x + cn.x * (CHANNEL_W * 0.88), cp.y + cn.y * (CHANNEL_W * 0.88));
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
    // 松手预测要跨过整整一拍（2-3 秒、4 格以上），那已经不是玩家在做的决定了。
    const imminent = game.beat - game.beatClock < 0.55;
    if (!game.balls.length && !imminent) return [];
    const coast = this.coastSlots(game);
    // 只预告真的会开火的那几个口：三射口模式下有一个口在轮休，
    // 给休息的口也画环，等于告诉玩家"它会打这里"，是错的。
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
    for (const pass of [0, 1]) {
      for (const [i, b] of slots) {
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
    const T = game.balls.length
      ? Math.max(0, CFG.flightTime - game.balls[0].t)
      : (game.beat - game.beatClock) + CFG.flightTime;
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

    if (near > 0.02 && glow) {
      const ctx = this.ctx;
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

    this.ballBody(p.x, p.y, r, b.ci, cb);
    if (near > 0.02) {
      const ctx = this.ctx;
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
  ballBody(x, y, r, ci, cb = false) {
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

    // 外环受光：上方压白、下方压黑
    const g = ctx.createLinearGradient(x, y - a, x, y + a);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = g;
    ctx.fill();

    // 下沉内面
    const ia = a * 0.60;
    ctx.beginPath();
    ctx.roundRect(x - ia, y - ia, ia * 2, ia * 2, rad * 0.55);
    const ig = ctx.createLinearGradient(x, y - ia, x, y + ia);
    ig.addColorStop(0, 'rgba(0,0,0,0.30)');
    ig.addColorStop(1, 'rgba(255,255,255,0.16)');
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 倒角高光：只画左上两条边，多了就不像金属
    ctx.beginPath();
    ctx.moveTo(x - a + rad * 0.5, y - a + 1.6);
    ctx.lineTo(x + a - rad, y - a + 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = Math.max(1, r * 0.07);
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
    const active = game.nextVolley();
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
  // 轨迹：出膛快 → 临近链条减速，再叠一个向外的抛物线弧度。
  // 缓动曲线用缓出（ease-out）而不是缓入缓出：smoothstep 在中段速度是平均值的 1.5 倍，
  // 正是那一下"窜"让 0.2 秒的飞行看起来像瞬移。
  projectile(game) {
    for (let i = 0; i < game.balls.length; i++) this.drawProjectile(game, game.balls[i]);
  }

  drawProjectile(game, ball) {
    const ctx = this.ctx;
    const c = ballSkin(ball.ci);
    const k = Math.min(1, ball.t / CFG.flightTime);

    const from = NOZZLES[ball.idx] || NOZZLES[0];
    const to = IMPACTS[ball.idx] || IMPACTS[0];
    if (!from || !to) return;

    // 同一套路径函数：球体和尾迹必须走同一条曲线，否则尾迹会脱轨
    const pos = (u) => {
      // 半线性 + 半 smoothstep：接近匀速，两端各有一点起落，中段不会像
      // 纯 smoothstep 那样窜（峰值 1.5 倍速）——那正是"一闪就到"的来源。
      const sm = u * u * (3 - 2 * u);
      const e = 0.5 * u + 0.5 * sm;
      // 弧线沿切线方向（垂直于出膛方向）。早先沿外法向鼓，正好顶在前进方向的反面，
      // 球看起来像"卡在炮口没动"。
      const arc = Math.sin(Math.PI * Math.min(1, u)) * 0.46;   // 世界单位
      return this.toScreen({
        x: from.x + (to.x - from.x) * e + from.tx * arc,
        y: from.y + (to.y - from.y) * e + from.ty * arc,
      });
    };

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

    this.ballBody(p.x, p.y, BEAD_R * 0.92, ball.ci, false);
  }

  /**
   * 磁轨炮筒。调用前已经平移到炮口中心、旋转到"局部 +Y 指向跑道"。
   *
   * 结构分三层：两根外置导轨（发光）、中间的主体（暗金属）、炮尾的蓄力条。
   * 导轨比主体长，是为了让"这一炮是打向跑道的"这件事在剪影上就成立——
   * 上一版是一根喇叭口，看起来像喷嘴而不是发射器。
   */
  cannon(charge, head) {
    const ctx = this.ctx;
    const half = 16;

    for (const sx of [-1, 1]) {
      const x0 = sx * 17.5;
      const g = ctx.createLinearGradient(0, -47, 0, 38);
      g.addColorStop(0, '#31415A');
      g.addColorStop(1, '#0B1119');
      ctx.beginPath();
      ctx.roundRect(x0 - 4.5, -47, 9, 90, 4.5);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(130,200,255,0.16)';
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
    ctx.beginPath();
    ctx.roundRect(-half, -40, half * 2, 62, 11);
    const bg = ctx.createLinearGradient(-half, -40, half, 22);
    bg.addColorStop(0, '#3E4F67');
    bg.addColorStop(0.45, '#1B2532');
    bg.addColorStop(1, '#0A0F16');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,200,255,0.22)';
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
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = head.base;
    ctx.shadowBlur = 12;
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
    const charge = Math.min(1, game.beatClock / game.beat);
    const dim = active ? 1 : 0.42;

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
    this.cannon(charge, head);
    ctx.restore();

    // 待发球：坐在炮身凹槽里。它必须是唯一"实体"的球，
    // 因为玩家要靠它决定这一发往哪打。
    this.ballBody(p.x - nz.nx * 7, p.y - nz.ny * 7, 13, game.queues[idx][0], ui.cb);
    ctx.restore();

    // 预览队列：沿切线排开，越小越远
    const q = game.queues[idx];
    for (let k = 1; k < q.length; k++) {
      const d = 38 + (k - 1) * 30;
      const px = p.x + nz.tx * d + nz.nx * 8;
      const py = p.y + nz.ty * d + nz.ny * 8;
      ctx.save();
      ctx.globalAlpha = (k === 1 ? 0.85 : 0.5) * dim;
      ctx.beginPath();
      ctx.moveTo(p.x + nz.tx * 26 + nz.nx * 8, p.y + nz.ty * 26 + nz.ny * 8);
      ctx.lineTo(px, py);
      ctx.strokeStyle = 'rgba(150,200,255,0.20)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      this.ballBody(px, py, k === 1 ? 11 : 8.8, q[k], ui.cb);
      ctx.restore();
    }

    // 轮休标记
    if (!active) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = `600 9px ${MONO}`;
      ctx.fillStyle = 'rgba(255,200,120,0.75)';
      ctx.fillText('REST', p.x, p.y + 40);
      ctx.restore();
    }
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

  floats(fx) {
    if (!fx || !fx.floats) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    // 描边阴影不是装饰：浮字经常落在跑道正上方，底下是亮色珠子和光带，
    // 不加暗底会出现"看得见轮廓但读不出数字"的情况。
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 7;
    for (const f of fx.floats) {
      const a = Math.max(0, f.life / f.max);
      const y = f.y - (1 - a) * 46;
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

    // 时间
    const leftT = Math.max(0, CFG.levelTime - game.time);
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('TIME', 44, 160);
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = leftT < 15 ? '#FF6B7A' : ink(0.86);
    ctx.fillText(leftT.toFixed(1) + 's', 42, 188);

    const barW = 180;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(44, 200, barW, 4);
    ctx.fillStyle = leftT < 15 ? '#FF6B7A' : '#5AC8FA';
    ctx.fillRect(44, 200, barW * (leftT / CFG.levelTime), 4);

    // 节拍
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = ink(0.34);
    ctx.fillText('BEAT', 44, 230);
    ctx.font = `700 20px ${MONO}`;
    ctx.fillStyle = ink(0.62);
    ctx.fillText(game.beat.toFixed(2) + 's', 42, 254);

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
    ctx.fillText('A / D 转轮　·　SPACE 急停　·　V 高对比　·　M 静音　·　ESC 暂停', CX, 776);
  }

  comboMeter(game) {
    const ctx = this.ctx;
    const pips = 12;
    const w = 18, gap = 6;
    const total = pips * w + (pips - 1) * gap;
    const x0 = CX - total / 2;
    const y = 708;
    const filled = Math.min(game.combo, pips);
    const mult = comboMult(game.combo);

    ctx.textAlign = 'center';
    if (game.combo >= 2) {
      const k = Math.min(1, game.combo / 12);
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = `rgba(255,214,90,${0.55 + 0.45 * k})`;
      ctx.fillText(`连消 ${game.combo}　×${mult.toFixed(2)}${game.combo >= 10 ? '　RUSH!' : ''}`, CX, y - 16);
    } else {
      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = 'rgba(160,200,250,0.22)';
      ctx.fillText('3 秒内持续消除 → 连消加成', CX, y - 16);
    }

    for (let i = 0; i < pips; i++) {
      const x = x0 + i * (w + gap);
      const on = i < filled;
      ctx.beginPath();
      ctx.roundRect(x, y, w, 6, 3);
      ctx.fillStyle = on
        ? (i >= 9 ? '#FF6B7A' : i >= 6 ? '#FFD65A' : '#5AC8FA')
        : 'rgba(255,255,255,0.08)';
      ctx.fill();
    }

    // 剩余窗口：断了就归零，玩家能看见"还剩多久"
    if (game.combo > 0) {
      const left = Math.max(0, 1 - (game.time - game.comboT) / 3.0);
      ctx.beginPath();
      ctx.roundRect(x0, y + 11, total * left, 2.5, 1.2);
      ctx.fillStyle = `rgba(150,230,255,${0.15 + 0.5 * left})`;
      ctx.fill();
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

    const n = MODES.length;
    const cw = 214, gap = 16;
    const total = n * cw + (n - 1) * gap;
    const x0 = CX - total / 2;
    const y0 = 268;
    const ch = 238;

    for (let i = 0; i < n; i++) {
      const m = MODES[i];
      const x = x0 + i * (cw + gap);
      const sel = i === ui.sel;

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
        `节拍 ${m.cfg.beatStart.toFixed(1)}→${m.cfg.beatEnd.toFixed(1)}s`,
      ];
      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = sel ? ink(0.44) : ink(0.26);
      stats.forEach((s, k) => ctx.fillText(s, x + 18, y0 + 126 + k * 19));

      // 用色点说明这一关会出几种球
      const nColors = Math.max(...m.cfg.colorSteps.map((st) => st[1]));
      for (let ci = 0; ci < nColors; ci++) {
        ctx.beginPath();
        ctx.arc(x + 24 + ci * 20, y0 + 196, 6, 0, PI2);
        ctx.fillStyle = ballSkin(ci).base;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
    const LEG = [
      [0, '紫 · 八面体'],
      [1, '金 · 方核'],
      [2, '红 · 星芒'],
      [3, '青 · 棱锥'],
      [WILD, '万能 · 百搭'],
      [BOMB, '爆破 · 清两侧'],
      [RUST, '锈球 · 障碍'],
    ];
    const lgap = 108;
    const lx0 = CX - ((LEG.length - 1) * lgap) / 2;
    for (let i = 0; i < LEG.length; i++) {
      const lx = lx0 + i * lgap;
      this.ballBody(lx, 660, 16, LEG[i][0], false);
      ctx.font = `500 11px ${FONT}`;
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
    ctx.fillText('← → 选模式　·　1 - 4 直选　·　V 高对比　·　M 静音', CX, 594);
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
    ctx.fillText(
      `落球 ${game.drops} 颗　·　吸附 ${game.snapped} 次　·　清空跑道 ${game.sweeps} 次`,
      CX, 430
    );

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
