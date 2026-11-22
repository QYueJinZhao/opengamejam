// 极简粗线喜剧美术 Canvas2D 渲染层（Bold & Clean，类似 Pikuniku / Heave Ho）：
// 不画琐碎细节，靠纯净色块剪影 + 统一深色粗描边 + 随惯性乱蹬的小短腿与漫画手臂，
// 确保 30~45 人密密麻麻叠在一起依然一眼清爽爆笑！

import { TRAIN, TRAIN_ANCHORS, TYPE_MAP, DOOR_BAR_XS } from './physics.js';
import { t } from './i18n.js';

export const VW = 1200;
export const VH = 680;
export const ORIGIN_X = 560;
export const GROUND_Y = 562;

const PI2 = Math.PI * 2;
const FONT = '"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
const MONO = 'ui-monospace,"SF Mono",Consolas,monospace';

const WINDOW_FACES = Array.from({ length: 24 }, (_, i) => ({
  dx: ((i % 4) - 1.5) * 14 + ((i * 7) % 5 - 2),
  dy: Math.floor(i / 4) * 5 - 4,
  r: 8 + (i % 3) * 1.5,
  tone: ['#F7C9A6', '#ECB58E', '#DF9E74', '#FAD5B8'][i % 4],
  shirt: ['#EF4444', '#38BDF8', '#F59E0B', '#22C55E', '#A855F7'][i % 5],
}));

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.smoke = [];
    this.sparks = [];
    this.confetti = [];
    this.pops = [];
    this.shake = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.cv.width === w && this.cv.height === h) return;
    this.cv.width = w;
    this.cv.height = h;
    this.scale = Math.min(w / VW, h / VH);
    this.offX = (w - VW * this.scale) / 2;
    this.offY = (h - VH * this.scale) / 2;
  }

  clientToTrain(clientX, clientY, world) {
    const rect = this.cv.getBoundingClientRect();
    const dpr = this.cv.width / Math.max(1, rect.width);
    const vx = ((clientX - rect.left) * dpr - this.offX) / this.scale;
    const vy = ((clientY - rect.top) * dpr - this.offY) / this.scale;
    const dx = vx - ORIGIN_X;
    const dy = vy - (GROUND_Y + world.bumpY);
    const c = Math.cos(-world.tilt);
    const s = Math.sin(-world.tilt);
    return { x: dx * c - dy * s, y: dx * s + dy * c, vx, vy };
  }

  addPop(x, y, text, color = '#FDE047', size = 20) {
    this.pops.push({ x, y, text, color, size, life: 1.0, max: 1.0 });
  }

  addShake(v) {
    this.shake = Math.min(18, this.shake + v);
  }

  /** 撞涵洞漫画小星星爆发 */
  burstBonk(localX, localY) {
    const x = ORIGIN_X + localX;
    const y = GROUND_Y + localY;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI2 + Math.random() * 0.4;
      const sp = 90 + Math.random() * 140;
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp - 90, vy: Math.sin(a) * sp - 50,
        size: 5 + Math.random() * 4,
        color: i % 2 ? '#FEF08A' : '#FFFFFF',
        kind: 'star',
        life: 0.55, max: 0.55,
      });
    }
  }

  /** 到站庆祝彩色纸屑 */
  burstConfetti() {
    const cols = ['#FACC15', '#38BDF8', '#FB7185', '#4ADE80', '#C084FC'];
    for (let i = 0; i < 55; i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7);
      const sp = 180 + Math.random() * 340;
      this.confetti.push({
        x: ORIGIN_X + (Math.random() - 0.5) * 460,
        y: GROUND_Y - 190 - Math.random() * 60,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        rot: Math.random() * PI2,
        vr: (Math.random() - 0.5) * 10,
        w: 7 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        color: cols[i % cols.length],
        life: 2.2 + Math.random() * 0.8,
        max: 3.0,
      });
    }
  }

  updateFx(dt, world) {
    this.shake *= Math.exp(-9 * dt);
    if (this.shake < 0.1) this.shake = 0;

    // 蒸汽烟团
    const smokeRate = world.phase === 'running' ? 0.36 : 0.08;
    if (Math.random() < smokeRate) {
      this.smoke.push({
        x: ORIGIN_X + TRAIN.halfW - 34,
        y: GROUND_Y + TRAIN.roofY - 36,
        vx: -28 - world.speed * 0.45 - Math.random() * 25,
        vy: -52 - Math.random() * 42,
        r: 9 + Math.random() * 8,
        life: 1.05, max: 1.05,
      });
    }

    // 急刹时车轮下飙出橙金火星！
    if (world.phase === 'running' && world.accelX < -90 && world.speed > 40) {
      for (const wx of [-210, -135, 135, 210]) {
        if (Math.random() < 0.45) {
          this.sparks.push({
            x: ORIGIN_X + wx,
            y: GROUND_Y - 3,
            vx: -140 - Math.random() * 180,
            vy: -40 - Math.random() * 110,
            size: 2.5 + Math.random() * 2.5,
            color: Math.random() < 0.5 ? '#FDE047' : '#FB923C',
            kind: 'dot',
            life: 0.32, max: 0.32,
          });
        }
      }
    }

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += 18 * dt;
      if (s.life <= 0) this.smoke.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 320 * dt;
      if (p.life <= 0) this.sparks.splice(i, 1);
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 260 * dt;
      c.vx *= Math.exp(-1.2 * dt); c.rot += c.vr * dt;
      if (c.life <= 0) this.confetti.splice(i, 1);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt; p.y -= 38 * dt;
      if (p.life <= 0) this.pops.splice(i, 1);
    }
  }

  draw(world, pointer, showHud = true) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0D1321';
    ctx.fillRect(0, 0, this.cv.width, this.cv.height);

    ctx.setTransform(this.scale, 0, 0, this.scale, this.offX, this.offY);
    if (this.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawSkyAndParallax(world);
    this.drawTracksAndStation(world);
    this.drawSmoke();
    if (showHud) this.drawTunnelGuideLines(world);

    ctx.save();
    ctx.translate(ORIGIN_X, GROUND_Y + world.bumpY);
    ctx.rotate(world.tilt);
    this.drawTrainBody(world);
    this.drawAnchors(world);
    this.drawPeople(world);
    if (showHud && world.phase === 'loading' && pointer.inside) {
      this.drawPlacementPreview(world, pointer);
    }
    ctx.restore();

    this.drawTunnelsForeground(world);
    this.drawSparksAndConfetti();
    if (showHud) {
      this.drawStationCrowd(world);
      this.drawInCanvasHud(world);
      this.drawPops();
    }
  }

  drawSkyAndParallax(world) {
    const ctx = this.ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#10172B');
    sky.addColorStop(0.62, '#222B4A');
    sky.addColorStop(0.88, '#9A4E43');
    sky.addColorStop(1, '#E0925B');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, GROUND_Y);

    // 简洁大太阳圆盘
    ctx.beginPath();
    ctx.arc(935, 330, 68, 0, PI2);
    ctx.fillStyle = 'rgba(255, 224, 150, 0.22)';
    ctx.fill();

    // 极简远山剪影（低对比不抢角色风头）
    const farOff = -(world.trainX * 0.14) % 420;
    ctx.fillStyle = '#18203B';
    for (let x = farOff - 420; x < VW + 420; x += 420) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y);
      ctx.lineTo(x + 70, GROUND_Y - 110);
      ctx.lineTo(x + 170, GROUND_Y - 82);
      ctx.lineTo(x + 265, GROUND_Y - 148);
      ctx.lineTo(x + 360, GROUND_Y - 88);
      ctx.lineTo(x + 420, GROUND_Y);
      ctx.closePath();
      ctx.fill();
    }

    // 利落的速度感标杆（去掉杂乱电线）
    const poleOff = -(world.trainX * 0.85) % 280;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    for (let x = poleOff - 280; x < VW + 280; x += 280) {
      ctx.fillRect(x, GROUND_Y - 220, 4, 220);
      ctx.fillRect(x - 10, GROUND_Y - 210, 24, 3);
    }
  }

  drawTracksAndStation(world) {
    const ctx = this.ctx;
    ctx.fillStyle = '#141926';
    ctx.fillRect(0, GROUND_Y, VW, VH - GROUND_Y);
    ctx.fillStyle = '#293044';
    ctx.fillRect(0, GROUND_Y, VW, 12);

    const tieOff = -(world.trainX % 44);
    ctx.fillStyle = '#47362E';
    for (let x = tieOff - 44; x < VW + 44; x += 44) {
      ctx.fillRect(x, GROUND_Y + 6, 22, 10);
    }
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, GROUND_Y - 2, VW, 5);

    const stX = ORIGIN_X - world.trainX;
    if (stX > -700) {
      ctx.save();
      ctx.translate(stX, GROUND_Y);
      ctx.fillStyle = 'rgba(20, 27, 46, 0.78)';
      ctx.fillRect(-350, -340, 12, 340);
      ctx.fillRect(340, -340, 12, 340);
      ctx.fillStyle = '#334155';
      ctx.fillRect(-375, -354, 750, 16);
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.roundRect(-145, -348, 290, 34, 8);
      ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.font = `900 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(t('platformSign', { name: t(`${world.level.id}_name`) }), 0, -325);
      ctx.restore();
    }

    const finX = ORIGIN_X + world.level.distance - world.trainX;
    if (finX > -200 && finX < VW + 320) {
      ctx.save();
      ctx.translate(finX, GROUND_Y);
      ctx.fillStyle = '#10B981';
      ctx.fillRect(-8, -320, 16, 320);
      ctx.fillStyle = '#064E3B';
      ctx.beginPath();
      ctx.roundRect(-94, -340, 188, 42, 10);
      ctx.fill();
      ctx.strokeStyle = '#34D399';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ECFDF5';
      ctx.font = `900 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(t('finishSign'), 0, -313);
      ctx.restore();
    }
  }

  drawTunnelGuideLines(world) {
    if (!world.level.tunnels.length) return;
    const ctx = this.ctx;
    let lowest = -9999;
    for (const tun of world.level.tunnels) {
      if (tun.clearY > lowest) lowest = tun.clearY;
    }
    const y = GROUND_Y + lowest;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, y);
    ctx.lineTo(VW - 90, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(251, 113, 133, 0.92)';
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(t('tunnelGuide'), VW - 96, y - 7);
    ctx.restore();
  }

  drawTrainBody(world) {
    const ctx = this.ctx;
    const { halfW, roofY, floorY, noseW, noseY, tailW, tailY } = TRAIN;
    const h = floorY - roofY;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, -2, halfW + 46, 10, 0, 0, PI2);
    ctx.fill();

    // 车轮
    const wheelAngle = world.trainX / 22;
    for (const wx of [-210, -135, 135, 210]) {
      ctx.save();
      ctx.translate(wx, -18);
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, PI2);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#94A3B8';
      ctx.stroke();
      ctx.rotate(wheelAngle);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-13, 0); ctx.lineTo(13, 0);
      ctx.moveTo(0, -13); ctx.lineTo(0, 13);
      ctx.stroke();
      ctx.restore();
    }

    // 车尾爬梯
    ctx.fillStyle = '#334155';
    ctx.fillRect(-halfW - tailW, tailY, tailW + 4, floorY - tailY);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.strokeRect(-halfW - tailW, tailY, tailW + 4, floorY - tailY);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 3;
    for (let ly = roofY + 22; ly < floorY - 8; ly += 22) {
      ctx.beginPath();
      ctx.moveTo(-halfW - 18, ly);
      ctx.lineTo(-halfW, ly);
      ctx.stroke();
    }

    // 车头防撞台阶
    ctx.fillStyle = '#B91C1C';
    ctx.beginPath();
    ctx.roundRect(halfW - 4, noseY, noseW + 4, floorY - noseY, [0, 14, 6, 0]);
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(halfW + noseW - 6, noseY + 22, 8, 0, PI2);
    ctx.fillStyle = '#FEF08A';
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(halfW + noseW - 8, floorY - 14, 14, 14);

    // 烟囱
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(halfW - 46, roofY - 28, 22, 28);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(halfW - 50, roofY - 32, 30, 8);

    // 车厢主体（简洁粗描边扁平红金风格）
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.roundRect(-halfW, roofY, halfW * 2, h, [14, 14, 4, 4]);
    ctx.fill();
    ctx.fillStyle = '#991B1B';
    ctx.fillRect(-halfW + 2, floorY - 34, halfW * 2 - 4, 32);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-halfW, roofY, halfW * 2, h, [14, 14, 4, 4]);
    ctx.stroke();

    // 车顶亮金边
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-halfW + 4, roofY + 13, halfW * 2 - 8, 8);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-halfW + 10, roofY - 3, halfW * 2 - 20, 6);

    // 6 扇爆满车窗 + 2 处金色车门竖杆外挂扶手（专供挂壁娃贴门外挂！）
    const winW = 68, winH = 48, winY = roofY + 34;
    for (let i = 0; i < 6; i++) {
      const wx = -halfW + 24 + i * 82;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(wx, winY, winW, winH, 8);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.clip();

      for (let k = 0; k < 4; k++) {
        const f = WINDOW_FACES[(i * 4 + k) % WINDOW_FACES.length];
        const fx = wx + winW * 0.5 + f.dx;
        const fy = winY + winH * 0.52 + f.dy;
        ctx.fillStyle = f.shirt;
        ctx.beginPath();
        ctx.arc(fx, fy + 16, f.r * 1.15, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = f.tone;
        ctx.beginPath();
        ctx.arc(fx, fy, f.r, 0, PI2);
        ctx.fill();
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(fx - 3.5, fy - 2, 2, 2);
        ctx.fillRect(fx + 1.5, fy - 2, 2, 2);
        ctx.beginPath();
        ctx.arc(fx, fy + 3, 2, 0, PI2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(wx + 6, winY, 10, winH);
      ctx.restore();

      ctx.strokeStyle = '#FCD34D';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(wx, winY, winW, winH, 8);
      ctx.stroke();
    }

    // 2 处醒目金色车门外扶手竖杆（告诉玩家：挂壁娃可以直接挂这里不撞洞！）
    for (const dx of DOOR_BAR_XS) {
      ctx.save();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(dx, -118); ctx.lineTo(dx, -56);
      ctx.stroke();
      ctx.strokeStyle = world.squadFilter === 'acrobat' ? '#4ADE80' : '#FACC15';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(254, 240, 138, 0.90)';
    ctx.font = `900 12px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(t('trainSlogan'), 0, floorY - 11);
  }

  drawAnchors(world) {
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(world.beatPhase * PI2);
    for (const a of TRAIN_ANCHORS) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, world.phase === 'loading' ? 4.2 + pulse * 1.1 : 3.2, 0, PI2);
      ctx.fillStyle = world.phase === 'loading' ? '#FDE047' : 'rgba(253, 224, 71, 0.55)';
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  drawPeople(world) {
    const ctx = this.ctx;
    const byId = new Map();
    for (const p of world.people) byId.set(p.id, p);

    // 1) 漫画粗线抓手双臂（受力越大越红越抖！）
    for (const p of world.people) {
      if (p.flying || p.fallen) continue;
      for (const g of p.grips) {
        const pt = g.myPart === 0 ? p.p0 : p.p1;
        let tx, ty;
        if (g.kind === 'anchor') {
          tx = g.anchor.x; ty = g.anchor.y;
        } else {
          const target = byId.get(g.targetId);
          if (!target) continue;
          const tpt = g.targetPart === 0 ? target.p0 : target.p1;
          tx = tpt.x; ty = tpt.y;
        }
        const s = Math.min(1.2, g.strain);
        const mx = (pt.x + tx) * 0.5 + (s > 0.7 ? (Math.random() - 0.5) * 4 : 0);
        const my = (pt.y + ty) * 0.5 + 4 + (s > 0.7 ? (Math.random() - 0.5) * 4 : 0);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // 外圈黑粗描边
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.quadraticCurveTo(mx, my, tx, ty);
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = s > 0.82 ? 7.5 : 6.2;
        ctx.stroke();
        // 内芯色（平时暖白/衣色，紧绷变黄，快断变亮红！）
        ctx.strokeStyle = s > 0.82 ? '#FF3B4E' : s > 0.45 ? '#FACC15' : '#F8FAFC';
        ctx.lineWidth = s > 0.82 ? 4.2 : 3.2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 2) 绘制每个粗线色块角色 + 超限高头部小警报标
    const lowY = world.lowestTunnelY();
    for (const p of world.people) {
      this.drawSinglePerson(p, 1.0, world.time, world.speed);
      if (lowY !== null && !p.fallen && !p.flying && !p.onSideWall && (p.p1.y - p.spec.r1) < lowY + 4) {
        ctx.save();
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 2.5;
        ctx.font = `900 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.strokeText('⚠', p.p1.x, p.p1.y - p.spec.r1 - 12);
        ctx.fillText('⚠', p.p1.x, p.p1.y - p.spec.r1 - 12);
        ctx.restore();
      }
    }
  }

  /** 极简粗线色块角色：纯色躯干 + 粗描边 + 随速度乱蹬的 2 条小短腿 + 鲜明大表情 */
  drawSinglePerson(p, alpha = 1.0, time = 0, speed = 0) {
    const ctx = this.ctx;
    const { spec, p0, p1 } = p;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const ang = Math.atan2(dy, dx) + Math.PI / 2;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 2 条极简粗线小短腿（悬空/加速/摔飞时疯狂乱蹬，喜感拉满！）
    const kickFreq = p.fallen ? 24 : (speed > 80 ? 15 : 5);
    const kickAmp = p.fallen ? 10 : (p.grips && p.grips.length === 0 ? 7 : speed > 120 ? 5 : 1.5);
    const legLen = Math.max(9, spec.r0 * 0.72);
    const phase = time * kickFreq + (p.id || 0) * 1.7;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4.5;
    for (const side of [-1, 1]) {
      const hipX = p0.x + side * spec.r0 * 0.42;
      const hipY = p0.y + spec.r0 * 0.45;
      const swing = Math.sin(phase + (side > 0 ? Math.PI : 0)) * kickAmp;
      const footX = hipX + side * 3 + swing - Math.min(6, speed * 0.012);
      const footY = hipY + legLen;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
    }

    // 大妈偏心花编织袋（撞色粗描边）
    if (spec.biasX) {
      const mx = (p0.x + p1.x) * 0.5 + p.bagSide * (spec.r0 + 9);
      const my = (p0.y + p1.y) * 0.5 + 3;
      ctx.fillStyle = '#FB923C';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(mx - 12, my - 11, 24, 22, 7);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(mx - 9, my); ctx.lineTo(mx + 9, my);
      ctx.moveTo(mx, my - 8); ctx.lineTo(mx, my + 8);
      ctx.stroke();
    }

    // 粗黑描边整体胶囊底（让重叠的人群轮廓像漫画一样根根分明！）
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = spec.r0 * 1.88 + 6;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // 下半身色块
    ctx.strokeStyle = spec.pants;
    ctx.lineWidth = spec.r0 * 1.76;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
    ctx.stroke();

    // 上半身纯色块
    ctx.strokeStyle = spec.shirt;
    ctx.lineWidth = spec.r0 * 1.84;
    ctx.beginPath();
    ctx.moveTo((p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();

    // 胖叔标志性大圆肚高光点 / 挂壁娃飘扬红发带
    if (spec.id === 'fat') {
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.beginPath();
      ctx.arc((p0.x + p1.x) * 0.5 - 4, (p0.y + p1.y) * 0.5 + 3, 7, 0, PI2);
      ctx.fill();
    }

    // 头部与极简大表情
    ctx.save();
    ctx.translate(p1.x, p1.y - spec.r1 * 0.34);
    ctx.rotate(ang * 0.45);
    const hr = Math.max(9.5, spec.r1 * 0.84);

    // 挂壁娃随风飘动的红色发带尾
    if (spec.id === 'acrobat') {
      const flutter = Math.sin(time * 18 + (p.id || 0)) * 4;
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-hr * 0.8, -3);
      ctx.lineTo(-hr * 1.9, -4 + flutter);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, hr, 0, PI2);
    ctx.fillStyle = p.mood === 'panic' || p.mood === 'strain' ? '#FCA5A5' : spec.skin;
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6;
    ctx.stroke();

    if (spec.hat) {
      ctx.fillStyle = spec.hat;
      ctx.beginPath();
      ctx.arc(0, -2, hr * 1.04, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillRect(-hr * 1.15, -3.5, hr * 2.3, 3.2);
    }

    ctx.fillStyle = '#0F172A';
    if (p.mood === 'panic' || p.mood === 'fallen') {
      ctx.beginPath();
      ctx.arc(-hr * 0.32, -1, 2.3, 0, PI2);
      ctx.arc(hr * 0.32, -1, 2.3, 0, PI2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, hr * 0.38, 3.6, 4.6, 0, 0, PI2);
      ctx.fill();
    } else if (p.mood === 'crouch') {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#0F172A';
      ctx.beginPath();
      ctx.moveTo(-hr * 0.45, -1); ctx.lineTo(-hr * 0.14, 0.8);
      ctx.moveTo(hr * 0.45, -1); ctx.lineTo(hr * 0.14, 0.8);
      ctx.stroke();
    } else if (p.mood === 'strain') {
      ctx.fillRect(-hr * 0.40, -2, 3.2, 2.2);
      ctx.fillRect(hr * 0.14, -2, 3.2, 2.2);
      ctx.fillStyle = '#FFF';
      ctx.fillRect(-4, 2.5, 8, 3.2);
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(hr * 0.88, -hr * 0.4, 3.0, 0, PI2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(-hr * 0.32, -1.5, 1.9, 0, PI2);
      ctx.arc(hr * 0.32, -1.5, 1.9, 0, PI2);
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 1.5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  drawPlacementPreview(world, pointer) {
    const ctx = this.ctx;
    const cx = Math.max(-TRAIN.halfW - 55, Math.min(TRAIN.halfW + 65, pointer.tx));
    const cy = Math.max(-440, Math.min(-42, pointer.ty));
    const form = world.previewFormation(cx, cy);
    if (!form.length) return;

    const beatR = 26 + (1 - world.beatPhase) * 16;
    const perfect = world.beatPhase < 0.20 || world.beatPhase > 0.80;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, beatR, 0, PI2);
    ctx.strokeStyle = perfect ? 'rgba(253, 224, 71, 0.92)' : 'rgba(148, 163, 184, 0.42)';
    ctx.lineWidth = perfect ? 3 : 1.8;
    ctx.stroke();

    for (const slot of form) {
      const spec = TYPE_MAP[slot.typeId];
      this.drawSinglePerson({
        id: 0,
        spec,
        bagSide: slot.bagSide,
        p0: { x: slot.x, y: slot.y },
        p1: { x: slot.x, y: slot.y - spec.bone },
        grips: [],
        mood: 'happy',
      }, 0.50, world.time, 0);
    }

    if (form.length > 1) {
      ctx.fillStyle = '#FDE047';
      ctx.font = `900 16px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(`×${form.length}`, cx, cy - 86);
    }
    ctx.restore();
  }

  drawTunnelsForeground(world) {
    if (!world.level.tunnels.length) return;
    const ctx = this.ctx;
    for (const tun of world.level.tunnels) {
      const left = ORIGIN_X + tun.x - world.trainX;
      const right = left + tun.len;
      if (right < -80 || left > VW + 120) continue;

      const beamBottom = GROUND_Y + tun.clearY;
      ctx.save();
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(left, 0, tun.len, beamBottom);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(left, beamBottom - 18, tun.len, 18);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, beamBottom - 18, tun.len, 18);
      ctx.clip();
      ctx.fillStyle = '#0F172A';
      for (let sx = left - 20; sx < right + 20; sx += 26) {
        ctx.beginPath();
        ctx.moveTo(sx, beamBottom);
        ctx.lineTo(sx + 12, beamBottom);
        ctx.lineTo(sx + 22, beamBottom - 18);
        ctx.lineTo(sx + 10, beamBottom - 18);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(left, beamBottom, 16, GROUND_Y - beamBottom);
      ctx.fillRect(right - 16, beamBottom, 16, GROUND_Y - beamBottom);

      ctx.fillStyle = '#FEF08A';
      ctx.font = `900 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`⚠ ${t(tun.labelKey)}`, left + tun.len * 0.5, beamBottom - 26);
      ctx.restore();
    }
  }

  /** 去掉厚重黑框，让下一波候车小人直接站在站台地面上随节拍蹦跶！ */
  drawStationCrowd(world) {
    if (world.phase !== 'loading') return;
    const ctx = this.ctx;
    const rem = world.poolTotal();
    ctx.save();

    // 极简悬浮小字标（贴铁轨下方，绝不遮挡铁轨与火车）
    ctx.fillStyle = rem > 0 ? 'rgba(226, 232, 240, 0.85)' : '#34D399';
    ctx.font = `800 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(
      rem > 0 ? t('crowdLabel', { n: rem }) : t('popPoolDone'),
      28, GROUND_Y + 38
    );

    const avail = world.availableForFilter();
    const previewN = Math.min(6, avail);
    for (let i = 0; i < previewN; i++) {
      const typeId = world.squadFilter !== 'mix' ? world.squadFilter : world.queue[i];
      const spec = TYPE_MAP[typeId];
      if (!spec) continue;
      const x = 50 + i * 50;
      const bob = Math.abs(Math.sin(world.beatPhase * Math.PI + i * 0.6)) * 5;
      const y = GROUND_Y + 88 - bob;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.46, 0.46);
      this.drawSinglePerson({
        id: i + 1,
        spec,
        bagSide: i % 2 ? 1 : -1,
        p0: { x: 0, y: 0 },
        p1: { x: 0, y: -spec.bone },
        grips: [],
        mood: 'happy',
      }, i < world.burstSize ? 1.0 : 0.50, world.time, 0);
      ctx.restore();
      if (i < world.burstSize) {
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.arc(x, GROUND_Y + 98, 3, 0, PI2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawInCanvasHud(world) {
    const ctx = this.ctx;
    const alive = world.onBoardCount();
    const stats = world.massStats();

    // 左上：核心大数字卡（人数 + 摔落，极简通透）
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(20, 14, 198, 72, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.48)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = '#FCD34D';
    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(t('onBoardLabel'), 34, 34);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 38px ${MONO}`;
    ctx.fillText(String(alive), 34, 74);
    ctx.fillStyle = '#94A3B8';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(t('unitFallen', { n: world.fallenTotal }), 98, 71);
    ctx.restore();

    // 顶部正中：状态栏（装车 = 倒计时+重心尺；行车 = 路线进度条）
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(VW / 2 - 215, 14, 430, 72, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    if (world.phase === 'loading') {
      ctx.fillStyle = world.loadLeft <= 10 ? '#FB7185' : '#FDE047';
      ctx.font = `900 16px ${FONT}`;
      ctx.fillText(t('loadingHud', { s: Math.ceil(world.loadLeft) }), VW / 2, 38);

      const barW = 240, bx = VW / 2 - barW / 2, by = 56;
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(bx, by, barW, 10, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(52, 211, 153, 0.45)';
      ctx.fillRect(VW / 2 - 28, by, 56, 10);
      const norm = stats.norm;
      const px = VW / 2 + norm * (barW * 0.46);
      ctx.fillStyle = Math.abs(norm) > 0.50 ? '#FB7185' : '#FDE047';
      ctx.beginPath();
      ctx.arc(px, by + 5, 8, 0, PI2);
      ctx.fill();
      ctx.fillStyle = '#94A3B8';
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(t('tailHeavy'), bx - 8, by + 9);
      ctx.textAlign = 'left';
      ctx.fillText(t('noseHeavy'), bx + barW + 8, by + 9);
      if (Math.abs(norm) > 0.52 && stats.totalMass > 6) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FB7185';
        ctx.font = `800 12px ${FONT}`;
        ctx.fillText(t('tiltWarn'), VW / 2, 104);
      }
    } else if (world.phase === 'running') {
      const prog = Math.max(0, Math.min(1, world.trainX / world.level.distance));
      ctx.fillStyle = '#38BDF8';
      ctx.font = `900 14px ${FONT}`;
      ctx.fillText(t('runningHud', { p: Math.round(prog * 100) }), VW / 2, 37);

      const lx0 = VW / 2 - 165, lx1 = VW / 2 + 165, ly = 60, lw = lx1 - lx0;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lx0, ly); ctx.lineTo(lx1, ly);
      ctx.stroke();

      ctx.strokeStyle = '#38BDF8';
      ctx.beginPath();
      ctx.moveTo(lx0, ly); ctx.lineTo(lx0 + lw * prog, ly);
      ctx.stroke();

      for (const tun of world.level.tunnels) {
        const tx = lx0 + lw * Math.min(1, tun.x / world.level.distance);
        const passed = world.trainX > tun.x + tun.len;
        ctx.fillStyle = passed ? '#64748B' : '#FB7185';
        ctx.beginPath();
        ctx.roundRect(tx - 5, ly - 9, 10, 18, 3);
        ctx.fill();
      }
      ctx.fillStyle = '#34D399';
      ctx.beginPath();
      ctx.arc(lx1, ly, 6, 0, PI2);
      ctx.fill();

      const curX = lx0 + lw * prog;
      ctx.fillStyle = '#FDE047';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(curX - 9, ly - 6, 18, 12, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      const rank = world.rankOf(world.finalCount);
      ctx.fillStyle = '#34D399';
      ctx.font = `900 19px ${FONT}`;
      ctx.fillText(t('arrivedHud', { n: world.finalCount, r: rank.name }), VW / 2, 56);
    }
    ctx.restore();

    // 右上：装车期显示「本线实时目标段位（B/A/S/SS）」；行车期切换为「缩头体力 + 危机预警」
    if (world.phase === 'loading') {
      const labels = ['B', 'A', 'S', 'SS'];
      const targets = world.level.targets;
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.beginPath();
      ctx.roundRect(VW - 256, 14, 236, 72, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#94A3B8';
      ctx.font = `800 11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(t('goalLabel'), VW - 242, 34);

      for (let i = 0; i < 4; i++) {
        const hit = alive >= targets[i];
        const bx = VW - 242 + i * 54;
        const by = 44;
        ctx.fillStyle = hit ? '#FACC15' : '#1E293B';
        ctx.beginPath();
        ctx.roundRect(bx, by, 48, 30, 8);
        ctx.fill();
        ctx.strokeStyle = hit ? '#FEF08A' : '#334155';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = hit ? '#111827' : '#CBD5E1';
        ctx.font = `900 11px ${MONO}`;
        ctx.fillText(labels[i], bx + 24, by + 13);
        ctx.font = `700 11px ${MONO}`;
        ctx.fillText(String(targets[i]), bx + 24, by + 26);
      }
      ctx.restore();
    } else if (world.phase === 'running') {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.80)';
      ctx.beginPath();
      ctx.roundRect(VW - 236, 14, 216, 72, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#E2E8F0';
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(t('staminaLabel'), VW - 220, 38);
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(VW - 220, 50, 184, 15, 7);
      ctx.fill();
      ctx.fillStyle = world.stamina < 0.25 ? '#FB7185' : '#38BDF8';
      ctx.beginPath();
      ctx.roundRect(VW - 220, 50, 184 * world.stamina, 15, 7);
      ctx.fill();
      ctx.restore();

      if (world.braking) {
        const blink = Math.sin(world.time * 20) > 0;
        ctx.save();
        ctx.fillStyle = blink ? 'rgba(234, 88, 12, 0.95)' : 'rgba(185, 28, 28, 0.90)';
        ctx.beginPath();
        ctx.roundRect(VW - 274, 96, 254, 44, 12);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.font = `900 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(t('brakeWarn'), VW - 147, 124);
        ctx.restore();
      } else if (world.tunnelAlert && world.tunnelAlert.dist > -60) {
        const blink = Math.sin(world.time * 16) > 0;
        ctx.save();
        ctx.fillStyle = blink ? 'rgba(225, 29, 72, 0.94)' : 'rgba(159, 18, 57, 0.88)';
        ctx.beginPath();
        ctx.roundRect(VW - 274, 96, 254, 44, 12);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.font = `900 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(t('tunnelWarn'), VW - 147, 124);
        ctx.restore();
      } else if (Math.abs(stats.norm) > 0.55 && stats.totalMass > 6) {
        ctx.save();
        ctx.fillStyle = 'rgba(190, 18, 60, 0.82)';
        ctx.beginPath();
        ctx.roundRect(VW - 274, 96, 254, 36, 10);
        ctx.fill();
        ctx.fillStyle = '#FEF08A';
        ctx.font = `800 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(t('tiltWarn'), VW - 147, 119);
        ctx.restore();
      }
    }
  }

  drawSmoke() {
    const ctx = this.ctx;
    for (const s of this.smoke) {
      const a = Math.max(0, s.life / s.max);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, PI2);
      ctx.fillStyle = `rgba(241, 245, 249, ${(a * 0.40).toFixed(3)})`;
      ctx.fill();
    }
  }

  drawSparksAndConfetti() {
    const ctx = this.ctx;
    for (const p of this.sparks) {
      const a = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 8);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? p.size * 0.42 : p.size;
          const ang = (i / 8) * PI2;
          i ? ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * a, 0, PI2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const c of this.confetti) {
      const a = Math.min(1, c.life / 0.5);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  }

  drawPops() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    for (const p of this.pops) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.font = `900 ${p.size}px ${FONT}`;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }
}
