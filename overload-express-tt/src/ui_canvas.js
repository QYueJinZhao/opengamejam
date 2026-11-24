// 100% 全 Canvas 原生横屏纯中文 UI 与触控命中区（V4 卡通街机明快层级重设计）：
// - 彻底告别沉闷深黑后台风：采用「暖奶油白厚卡 + 粗墨线描边 + 3D 实体厚度投影 + 高光糖果按钮」
// - 清晰 3 级信息层级：取消厚重整条黑顶栏与底部黑墙，解放 100% 天空与站台视觉空间
//   · Tier 1（左上）：大号悬浮人数/计分牌 + 内嵌 B/A/S/SS 迷你里程点（一眼读完核心目标）
//   · Tier 2（中上）：轻盈悬浮倒计时/重心仪 或 轨道进度/录屏指示
//   · Tier 3（右上）：紧凑圆形工具图标（选站/车库/音效/重开），严格避让抖音胶囊
// - 悬浮立体角色卡内置 drawPortrait() 真实迷你角色头像 + 特征短签（且自动显示侧边栏外援角色）
// - 全量激励视频按钮统一带 videoAd 图标明示；侧边栏弹窗内置纯 Canvas 三步复访示意图

import { ENDLESS_PERKS, LEVELS, PASSENGER_META, LEVEL1_DIALOG, UPGRADES, TRAIN_SKINS, GRAND_SLAM_REWARD_TICKETS, pickFunnyTitle } from './levels.js';
import { VW, VH, FONT, MONO, rrect, drawPortrait } from './render.js';
import { drawIcon } from './icons.js';
import { TT_CONFIG } from './config.js';

const INK = '#1E293B';
const CREAM = '#FFFDF7';
const CREAM_SUB = '#F3EDE0';

export class CanvasUI {
  constructor() {
    this.hitboxes = [];
    this.toastText = '';
    this.toastLife = 0;
    this.achQueue = [];
    this.achCurrent = null;
    this.achLife = 0;
    this.achPage = 0;
    this.achInspectId = null;
    this.achGrandSlamOpen = false;
    this.achFlipAnim = null;
    this.achFlipSparks = [];
    this.animTime = 0;
    this.miniCapture = null;
    this.shutterFlash = 0;
    this.viewScale = 1;
    this._warnActive = false;
  }

  showToast(text, dur = 2.1) {
    this.toastText = text;
    this.toastLife = dur;
  }

  /** 行车期零打断高光快拍小胶囊（不挡车顶、不冻帧，让玩家当下瞬间看懂触发了什么称号！） */
  showMiniCapture(def, isNew = false) {
    if (!def) return;
    this.miniCapture = { title: def.title, reward: def.reward, isNew, life: 1.85 };
  }

  showAchievement(def, isFirstUnlock = true, count = 1) {
    if (!def) return;
    const item = { ...def, isFirstUnlock, count: Math.max(1, count) };
    if (!this.achCurrent) {
      this.achCurrent = item;
      this.achLife = 3.2;
    } else {
      this.achQueue.push(item);
    }
  }

  triggerShutterFlash(dur = 0.24) {
    this.shutterFlash = dur;
  }

  /** 启动卡牌 3D 翻转揭晓动画（前半程卡背缩窄蓄力 -> 中点爆金光星芒 -> 后半程正面弹开 + 自动进大图鉴赏！） */
  triggerCardFlip(id, reward = 30, autoInspect = true) {
    this.achInspectId = null;
    this.achFlipAnim = { id, t: 0, dur: 0.58, reward, burstDone: false, autoInspect };
  }

  spawnFlipSparks(cx, cy, reward = 30) {
    const cols = ['#FDE047', '#F59E0B', '#F472B6', '#38BDF8', '#4ADE80', '#FFFFFF'];
    for (let i = 0; i < 28; i++) {
      const ang = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.22;
      const spd = 130 + Math.random() * 210;
      this.achFlipSparks.push({
        kind: 'spark',
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 45,
        r: 3.5 + Math.random() * 4.5,
        col: cols[i % cols.length],
        life: 0.62 + Math.random() * 0.25,
        max: 0.85,
      });
    }
    this.achFlipSparks.push({
      kind: 'ring',
      x: cx,
      y: cy,
      r: 16,
      col: '#FDE047',
      life: 0.42,
      max: 0.42,
    });
    if (reward > 0) {
      this.achFlipSparks.push({
        kind: 'pop',
        x: cx,
        y: cy - 34,
        text: `翻牌揭晓！ +${reward} 车票`,
        life: 1.05,
        max: 1.05,
      });
    }
  }

  update(dt) {
    this.animTime += dt;
    if (this.achFlipAnim) {
      this.achFlipAnim.t += dt;
      if (this.achFlipAnim.t >= this.achFlipAnim.dur) {
        const doneId = this.achFlipAnim.id;
        const shouldInspect = this.achFlipAnim.autoInspect;
        this.achFlipAnim = null;
        if (shouldInspect) this.achInspectId = doneId;
      }
    }
    for (let i = this.achFlipSparks.length - 1; i >= 0; i--) {
      const sp = this.achFlipSparks[i];
      sp.life -= dt;
      if (sp.kind === 'spark') {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += 280 * dt;
        sp.vx *= Math.exp(-2.2 * dt);
      } else if (sp.kind === 'ring') {
        sp.r += 280 * dt;
      } else if (sp.kind === 'pop') {
        sp.y -= 42 * dt;
      }
      if (sp.life <= 0) this.achFlipSparks.splice(i, 1);
    }
    if (this.toastLife > 0) this.toastLife = Math.max(0, this.toastLife - dt);
    if (this.shutterFlash > 0) this.shutterFlash = Math.max(0, this.shutterFlash - dt);
    if (this.miniCapture) {
      this.miniCapture.life = Math.max(0, this.miniCapture.life - dt);
      if (this.miniCapture.life === 0) this.miniCapture = null;
    }
    if (this.achLife > 0) {
      this.achLife = Math.max(0, this.achLife - dt);
      if (this.achLife === 0) this.achCurrent = null;
    }
    if (!this.achCurrent && this.achQueue.length > 0) {
      this.achCurrent = this.achQueue.shift();
      this.achLife = 3.2;
    }
  }

  hitTest(vx, vy) {
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const b = this.hitboxes[i];
      if (b.disabled) continue;
      if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) return b;
    }
    return null;
  }

  addBox(id, x, y, w, h, extra = {}) {
    this.hitboxes.push({ id, x, y, w, h, ...extra });
  }

  /** 判断装车投放点是否落在安全舞台内（避开顶部悬浮 HUD 与底部大号手机端操作区 + Home 横条安全区） */
  isInStagePlayArea(vx, vy, safeLeftV = 0, safeRightV = VW, safeBottomV = VH) {
    const dockLift = Math.max(0, Math.min(46, VH - safeBottomV));
    if (vy <= 80 || vy >= 588 - dockLift) return false;
    return vx >= safeLeftV - 60 && vx <= safeRightV + 60;
  }

  /** 绘制 3D 卡通厚涂按钮（实色底厚投影 + 亮顶高光 + 粗墨线） */
  drawBtn3D(ctx, x, y, w, h, {
    fill = '#EF4444', topFill = null, lip = '#991B1B',
    radius = 14, border = INK, borderW = 2.4, depth = 5, pressed = false, sheen = true,
  } = {}) {
    const dy = pressed ? Math.max(1, depth - 2) : 0;
    // 3D 底座厚度
    ctx.fillStyle = lip;
    rrect(ctx, x, y + depth, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = borderW;
    ctx.stroke();

    // 按钮表面
    if (topFill) {
      const g = ctx.createLinearGradient(x, y + dy, x, y + dy + h);
      g.addColorStop(0, topFill);
      g.addColorStop(1, fill);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = fill;
    }
    rrect(ctx, x, y + dy, w, h, radius);
    ctx.fill();

    // 顶部糖果柔光条
    if (sheen) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      rrect(ctx, x + 5, y + dy + 4, w - 10, Math.min(14, h * 0.32), Math.max(4, radius - 4));
      ctx.fill();
    }

    ctx.strokeStyle = border;
    ctx.lineWidth = borderW;
    rrect(ctx, x, y + dy, w, h, radius);
    ctx.stroke();
    return y + dy;
  }

  /** 绘制 3D 暖奶油白厚卡片（弹窗与角色卡基础质感） */
  drawCard3D(ctx, x, y, w, h, {
    fill = CREAM, lip = '#CBD5E1', radius = 16, border = INK, borderW = 2.6, depth = 5,
  } = {}) {
    ctx.fillStyle = lip;
    rrect(ctx, x, y + depth, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = borderW; ctx.stroke();

    ctx.fillStyle = fill;
    rrect(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = borderW; ctx.stroke();
  }

  /** 绘制精致圆形工具按钮 */
  drawRoundTool(ctx, id, cx, cy, r, iconName, { fill = CREAM, lip = '#CBD5E1', iconCol = INK, active = false } = {}) {
    ctx.fillStyle = active ? '#B45309' : lip;
    ctx.beginPath(); ctx.arc(cx, cy + 3.5, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();

    ctx.fillStyle = active ? '#FACC15' : fill;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();

    drawIcon(ctx, iconName, cx, cy, r * 0.92, active ? INK : iconCol);
    this.addBox(id, cx - r - 2, cy - r - 2, r * 2 + 4, r * 2 + 4);
  }

  draw(ctx, state) {
    this.hitboxes.length = 0;
    this.viewScale = state.viewScale || 1;
    this._warnActive = false;
    const {
      world, uiMode, modal, muted, sdk, progress,
      leftV, rightV, safeLeftV, safeRightV, safeBottomV = VH, capsuleLeftV,
      heldBtns, isTT, whisper, voiceBubble, resultMeta, perkChoices, endlessRerollLeft = 0, l1TunnelFlash,
    } = state;

    if (uiMode === 'title') {
      this.drawTitleOverlay(ctx, sdk, progress, muted, leftV, rightV, safeLeftV, safeRightV, safeBottomV, capsuleLeftV, isTT);
    } else {
      this.drawPlayHud(ctx, world, muted, sdk, progress, leftV, rightV, safeLeftV, safeRightV, capsuleLeftV, isTT);
      this.drawBottomDock(ctx, world, progress, heldBtns, safeLeftV, safeRightV, safeBottomV, whisper, voiceBubble, l1TunnelFlash);
      if (uiMode === 'result') {
        // 结算弹窗开启时屏蔽底层 HUD 与底栏热区，杜绝穿透误触
        this.hitboxes.length = 0;
        this.drawResultModal(ctx, world, sdk, progress, resultMeta, leftV, rightV);
      }
    }

    // 各类功能与合规二级弹窗（开启时清空底层按钮热区，严格模态隔离！）
    if (modal) {
      this.hitboxes.length = 0;
    }
    if (modal === 'l1_dialog') this.drawL1DialogModal(ctx, leftV, rightV);
    else if (modal === 'stations') this.drawStationsModal(ctx, progress, world, leftV, rightV);
    else if (modal === 'garage') this.drawGarageModal(ctx, progress, leftV, rightV);
    else if (modal === 'missions') this.drawMissionsModal(ctx, progress, leftV, rightV);
    else if (modal === 'achievements') this.drawAchievementsModal(ctx, progress, leftV, rightV);
    else if (modal === 'perks') this.drawPerksModal(ctx, world, perkChoices, leftV, rightV, endlessRerollLeft, progress);
    else if (modal === 'age8') this.drawAge8Modal(ctx, leftV, rightV);
    else if (modal === 'sidebar') this.drawSidebarModal(ctx, sdk, progress, leftV, rightV);

    // 强表现力街机级「金色放射光芒 + 盖章弹跳」成就称号横幅（结算页自动上浮至结算卡上方，绝不挡按钮！）
    if (this.achCurrent && this.achLife > 0) {
      const elapsed = 3.2 - this.achLife;
      // 弹性盖章入场：1.48x -> 0.94x -> 1.03x -> 1.0x
      let sc = 1.0;
      if (elapsed < 0.14) sc = 1.48 - (elapsed / 0.14) * 0.54;
      else if (elapsed < 0.24) sc = 0.94 + ((elapsed - 0.14) / 0.10) * 0.09;
      else if (elapsed < 0.34) sc = 1.03 - ((elapsed - 0.24) / 0.10) * 0.03;
      const fadeOut = Math.min(1, this.achLife / 0.38);

      const aw = 536; const ah = 104;
      const centerX = VW / 2;
      const centerY = (uiMode === 'title' ? 76 : (uiMode === 'result' ? 68 : 138));

      ctx.save();
      ctx.globalAlpha = fadeOut;
      ctx.translate(centerX, centerY);
      ctx.scale(sc, sc);

      // 1) 背后旋转金色放射光柱（满满仪式感！）
      ctx.save();
      ctx.translate(-aw / 2 + 54, 0);
      ctx.rotate(elapsed * 1.4);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
      for (let i = 0; i < 10; i++) {
        ctx.rotate((Math.PI * 2) / 10);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-10, -82); ctx.lineTo(10, -82); ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 2) 厚涂深蓝金边立体横幅底卡
      const bx = -aw / 2; const by = -ah / 2;
      this.drawCard3D(ctx, bx, by, aw, ah, {
        fill: '#0F172A', lip: '#B45309', radius: 22, border: '#FACC15', borderW: 3.4, depth: 6,
      });

      // 顶部暖金丝带条（首解引导至卡牌馆亲手翻牌领奖 / 老玩家熟练度进阶）
      const cnt = this.achCurrent.count || 1;
      const tierTag = cnt >= 8 ? '传说级' : cnt >= 3 ? '资深级' : '';
      const ribbonText = this.achCurrent.isFirstUnlock
        ? `新卡牌到手！结算去卡牌馆翻牌领 +${this.achCurrent.reward} 票`
        : `本局最佳高光！ · 累计第 ${cnt} 次${tierTag ? ` (${tierTag})` : ''}`;
      ctx.font = `900 12px ${FONT}`;
      const rw = Math.min(aw - 124, Math.max(296, ctx.measureText(ribbonText).width + 24));
      ctx.fillStyle = '#FACC15';
      rrect(ctx, bx + 100, by - 12, rw, 24, 12); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.fillText(ribbonText, bx + 100 + rw / 2, by + 4);

      // 左侧超大发光金奖章
      const mx = bx + 54; const my = 0;
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath(); ctx.arc(mx, my + 3, 36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
      const mg = ctx.createRadialGradient(mx - 10, my - 10, 4, mx, my, 36);
      mg.addColorStop(0, '#FEF9C3');
      mg.addColorStop(0.55, '#FACC15');
      mg.addColorStop(1, '#EA580C');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, 36, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
      drawIcon(ctx, 'trophy', mx, my, 34, INK);

      // 超大厚描边金色称号主标题（超长称号自动微缩字号，绝不碰右侧星芒）
      ctx.textAlign = 'left';
      const fullAchTitle = `【${this.achCurrent.title}】`;
      let achTitleSz = 28;
      ctx.font = `900 ${achTitleSz}px ${FONT}`;
      while (achTitleSz > 20 && ctx.measureText(fullAchTitle).width > 374) {
        achTitleSz -= 2;
        ctx.font = `900 ${achTitleSz}px ${FONT}`;
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5; ctx.strokeStyle = '#020617';
      ctx.strokeText(fullAchTitle, bx + 100, -2);
      ctx.fillStyle = '#FEF08A';
      ctx.fillText(fullAchTitle, bx + 100, -2);

      // 下方直白亮眼「触发原因」，彻底杜绝玩家疑惑“怎么得的？”
      ctx.fillStyle = '#E2E8F0';
      ctx.font = `800 14px ${FONT}`;
      ctx.fillText(`触发：${this.achCurrent.hint}`, bx + 106, 28);

      // 右侧闪烁金星点缀
      for (const [sx, sy, sr] of [[aw / 2 - 28, -22, 8], [aw / 2 - 46, 18, 6], [aw / 2 - 18, 26, 5]]) {
        const pulse = 0.75 + 0.35 * Math.sin(elapsed * 12 + sx);
        ctx.save();
        ctx.translate(sx, sy); ctx.scale(pulse, pulse);
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.moveTo(0, -sr); ctx.lineTo(sr * 0.35, -sr * 0.35); ctx.lineTo(sr, 0);
        ctx.lineTo(sr * 0.35, sr * 0.35); ctx.lineTo(0, sr); ctx.lineTo(-sr * 0.35, sr * 0.35);
        ctx.lineTo(-sr, 0); ctx.lineTo(-sr * 0.35, -sr * 0.35); ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    // 行车期零打断高光快拍轻胶囊（自动礼让上方危机预警横幅，绝不重叠遮挡！）
    let miniShown = false;
    if (this.miniCapture && this.miniCapture.life > 0 && !this.achCurrent && uiMode === 'play') {
      miniShown = true;
      const a = Math.min(1, this.miniCapture.life / 0.30);
      ctx.save();
      ctx.globalAlpha = a;
      const mc = this.miniCapture;
      const txt = mc.isNew
        ? `高光已拍 · 获新卡【${mc.title}】(去卡牌馆翻开领奖)`
        : `高光已拍 · 候选称号【${mc.title}】`;
      ctx.font = `900 13px ${FONT}`;
      const mw = Math.max(210, ctx.measureText(txt).width + 46);
      const mx = (VW - mw) / 2;
      const my = this._warnActive ? 126 : 80;
      this.drawCard3D(ctx, mx, my, mw, 32, { fill: '#0F172A', lip: '#B45309', radius: 16, border: '#FACC15', borderW: 2, depth: 3 });
      drawIcon(ctx, 'camera', mx + 20, my + 16, 14, '#FACC15');
      ctx.fillStyle = '#FEF08A'; ctx.textAlign = 'left';
      ctx.fillText(txt, mx + 34, my + 21);
      ctx.restore();
    }

    // 高光截屏瞬间的柔和相机快门闪光（极短，仪式感满满！）
    if (this.shutterFlash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${((this.shutterFlash / 0.28) * 0.42).toFixed(3)})`;
      ctx.fillRect(leftV - 60, 0, (rightV - leftV) + 120, VH);
      ctx.restore();
    }

    // 顶部轻提示条（Toast：自动避让预警条与高光微胶囊，绝不叠字）
    if (this.toastLife > 0 && this.toastText) {
      const a = Math.min(1, this.toastLife / 0.35);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 15px ${FONT}`;
      const tw = Math.max(220, ctx.measureText(this.toastText).width + 44);
      const tx = (VW - tw) / 2;
      let ty = uiMode === 'title' ? 16 : 80;
      if (uiMode !== 'title') {
        if (this._warnActive && miniShown) ty = 166;
        else if (this._warnActive) ty = 126;
        else if (miniShown) ty = 120;
      }
      this.drawCard3D(ctx, tx, ty, tw, 38, { fill: '#1E293B', lip: '#0F172A', radius: 19, border: '#FACC15', borderW: 2.2, depth: 3 });
      ctx.fillStyle = '#FEF08A';
      ctx.textAlign = 'center';
      ctx.fillText(this.toastText, VW / 2, ty + 24);
      ctx.restore();
    }
  }

  /** 游玩期 3 级轻悬浮 HUD（无厚重整条黑顶栏，顶部仅占 68px，天空通透！） */
  drawPlayHud(ctx, world, muted, sdk, progress, leftV, rightV, safeLeftV, safeRightV, capsuleLeftV, isTT) {
    const alive = world.onBoardCount();
    const score = world.onBoardScore();
    const stats = world.massStats();
    const lv = world.level;

    // ===== TIER 1（左上主视觉核心）：独立醒目「◀ 首页」按钮 + 大号悬浮人数牌 + B/A/S/SS 达标格 =====
    const homeX = safeLeftV + 14;
    const homeY = 14;
    const homeW = 84;
    const homeH = 56;
    this.drawBtn3D(ctx, homeX, homeY, homeW, homeH, {
      topFill: '#F87171', fill: '#EF4444', lip: '#991B1B', radius: 15, depth: 4,
    });
    drawIcon(ctx, 'arrowLeft', homeX + 20, homeY + 28, 15, '#FFFFFF');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 16px ${FONT}`;
    ctx.fillText('首页', homeX + 34, homeY + 34);
    this.addBox('go_title', homeX, homeY, homeW, homeH);

    const lx = homeX + homeW + 10;
    const ly = 12;
    const scoreStr = String(score);
    const subStr = score > alive ? `分(${alive}人)` : '人上车';
    const fallStr = `摔 ${world.fallenTotal}`;
    ctx.font = `900 32px ${MONO}`;
    const numW = ctx.measureText(scoreStr).width;
    ctx.font = `900 13px ${FONT}`;
    const subW = Math.max(ctx.measureText(subStr).width, ctx.measureText(fallStr).width);
    const gx0 = Math.max(lx + 112, lx + 24 + numW + subW + 12);
    const cardW = Math.max(256, (gx0 - lx) + 4 * 35 + 8);
    const cardH = 62;
    this.drawCard3D(ctx, lx, ly, cardW, cardH, { fill: CREAM, lip: '#CBD5E1', radius: 16, depth: 4 });

    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = `900 32px ${MONO}`;
    ctx.fillText(scoreStr, lx + 16, ly + 43);

    ctx.fillStyle = '#475569';
    ctx.font = `900 13px ${FONT}`;
    ctx.fillText(subStr, lx + 22 + numW, ly + 28);
    ctx.fillStyle = world.fallenTotal > 0 ? '#E11D48' : '#64748B';
    ctx.fillText(fallStr, lx + 22 + numW, ly + 48);

    // 右半边内嵌紧凑 B/A/S/SS 段位达标胶囊
    const labels = ['B', 'A', 'S', 'SS'];
    const targets = lv.targets;
    for (let i = 0; i < 4; i++) {
      const hit = score >= targets[i];
      const bx = gx0 + i * 35;
      const by = ly + 10;
      ctx.fillStyle = hit ? (i === 3 ? '#FDE047' : '#FACC15') : '#F1F5F9';
      rrect(ctx, bx, by, 32, 42, 8); ctx.fill();
      if (hit) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        rrect(ctx, bx + 2, by + 2, 28, 12, 5); ctx.fill();
      }
      ctx.strokeStyle = hit ? '#B45309' : '#CBD5E1'; ctx.lineWidth = hit ? 2 : 1.5; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = hit ? INK : '#94A3B8';
      ctx.font = `900 12px ${MONO}`; ctx.fillText(labels[i], bx + 16, by + 17);
      ctx.fillStyle = hit ? '#78350F' : '#64748B';
      ctx.font = `900 12px ${MONO}`; ctx.fillText(String(targets[i]), bx + 16, by + 35);
    }

    // 无尽模式已选词条彩色小徽章条（贴在左上主牌正下方，肉鸽构筑与叠层等级一目了然！）
    if (lv.isEndless && (world.perks.size > 0 || world.tempPerks.size > 0)) {
      let px = lx;
      const py = ly + cardH + 10;
      const allIds = [...world.perks, ...world.tempPerks];
      for (const pid of allIds) {
        const def = ENDLESS_PERKS.find((k) => k.id === pid);
        if (!def) continue;
        const pLv = world.getPerkLevel ? world.getPerkLevel(pid) : 1;
        const pLabel = pLv > 1 ? `${def.name} Lv.${pLv}` : def.name;
        ctx.font = `800 11px ${FONT}`;
        const pw = ctx.measureText(pLabel).width + 16;
        ctx.fillStyle = def.color;
        rrect(ctx, px, py, pw, 22, 11); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = INK; ctx.textAlign = 'center';
        ctx.fillText(pLabel, px + pw / 2, py + 15);
        px += pw + 6;
      }
    }

    // ===== TIER 2（正中上方 · 紧凑路况情报胶囊，无尽模式醒目提示 B 级晋级线） =====
    const tags = lv.intel && lv.intel.length ? lv.intel : [lv.name];
    ctx.font = `900 13px ${FONT}`;
    const tagWidths = tags.map((t) => Math.max(68, ctx.measureText(t).width + 18));
    const totalTagW = tagWidths.reduce((a, b) => a + b, 0) + (tags.length - 1) * 8;
    const midW = world.phase === 'loading'
      ? Math.max(lv.strictQueue ? 310 : (lv.isEndless ? 290 : 248), Math.min(410, totalTagW + 36))
      : 356;
    const midX = (VW - midW) / 2;
    const midY = 12;
    const midH = 60;
    this.drawCard3D(ctx, midX, midY, midW, midH, { fill: 'rgba(255, 253, 247, 0.95)', lip: '#CBD5E1', radius: 16, depth: 4 });

    ctx.textAlign = 'center';
    if (world.phase === 'loading') {
      // 装车期正中：仅展示精炼标题 + 彩色路况标签（无尽模式清晰提示晋级线！）
      ctx.fillStyle = lv.isEndless ? '#B45309' : '#475569';
      ctx.font = `800 12px ${FONT}`;
      ctx.fillText(
        lv.strictQueue ? '左右分流 · 禁点车顶仅靠双键配重' : (lv.isEndless ? `无尽第 ${lv.wave || 1} 站 · 需达 B 级(≥${lv.targets[0]}分)晋级` : '本关路况情报'),
        VW / 2, midY + 18
      );

      ctx.font = `900 13px ${FONT}`;
      let tx = VW / 2 - totalTagW / 2;
      const ty = midY + 26;
      tags.forEach((t, i) => {
        const w = tagWidths[i];
        const isWind = t.includes('风');
        const isStop = t.includes('红灯') || t.includes('急') || t.includes('刹');
        const isUnlock = t.includes('无尽') || t.includes('畅通');
        ctx.fillStyle = isUnlock ? '#DCFCE7' : isWind ? '#E0F2FE' : isStop ? '#FEF3C7' : '#FEE2E2';
        rrect(ctx, tx, ty, w, 24, 12); ctx.fill();
        ctx.strokeStyle = isUnlock ? '#22C55E' : isWind ? '#0EA5E9' : isStop ? '#F59E0B' : '#EF4444';
        ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = isUnlock ? '#15803D' : isWind ? '#0369A1' : isStop ? '#B45309' : '#B91C1C';
        ctx.fillText(t, tx + w / 2, ty + 16);
        tx += w + 8;
      });
    } else if (world.phase === 'running') {
      const prog = Math.max(0, Math.min(1, world.trainX / lv.distance));
      ctx.fillStyle = '#0284C7';
      ctx.font = `900 14px ${FONT}`;
      ctx.fillText(`行驶 ${Math.round(prog * 100)}%`, VW / 2 - (sdk.recording ? 30 : 0), midY + 20);
      if (sdk.recording) {
        ctx.fillStyle = '#EF4444';
        ctx.beginPath(); ctx.arc(VW / 2 + 26, midY + 15, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#DC2626'; ctx.font = `800 11px ${FONT}`; ctx.textAlign = 'left';
        ctx.fillText('录屏中', VW / 2 + 34, midY + 19);
        ctx.textAlign = 'center';
      }

      const lx0 = midX + 26; const lx1 = midX + midW - 26; const ly2 = midY + 37; const lw = lx1 - lx0;
      ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx0, ly2); ctx.lineTo(lx1, ly2); ctx.stroke();
      ctx.strokeStyle = '#0EA5E9';
      ctx.beginPath(); ctx.moveTo(lx0, ly2); ctx.lineTo(lx0 + lw * prog, ly2); ctx.stroke();

      for (const tun of lv.tunnels) {
        const tx = lx0 + lw * Math.min(1, tun.x / lv.distance);
        ctx.fillStyle = world.trainX > tun.x + tun.len ? '#94A3B8' : '#EF4444';
        rrect(ctx, tx - 3.5, ly2 - 7, 7, 14, 3); ctx.fill();
      }
      for (const ms of world.midStopStates) {
        const mx = lx0 + lw * Math.min(1, ms.x / lv.distance);
        ctx.fillStyle = ms.state === 'done' ? '#22C55E' : '#F59E0B';
        ctx.beginPath(); ctx.arc(mx, ly2, 5, 0, Math.PI * 2); ctx.fill();
      }
      for (const rp of (lv.ramps || [])) {
        const rx = lx0 + lw * Math.min(1, rp.x / lv.distance);
        ctx.fillStyle = world.trainX > rp.x + 120 ? '#94A3B8' : '#38BDF8';
        ctx.beginPath();
        ctx.moveTo(rx, ly2 - 7); ctx.lineTo(rx - 5, ly2 + 4); ctx.lineTo(rx + 5, ly2 + 4);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#22C55E';
      ctx.beginPath(); ctx.arc(lx1, ly2, 5.5, 0, Math.PI * 2); ctx.fill();

      const curX = lx0 + lw * prog;
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      rrect(ctx, curX - 8, ly2 - 5, 16, 10, 4); ctx.fill(); ctx.stroke();
    } else {
      const rank = world.rankOf(world.finalScore);
      ctx.fillStyle = '#15803D';
      ctx.font = `900 19px ${FONT}`;
      ctx.fillText(`安全到站！${world.finalScore} 分 · ${rank.name} 级`, VW / 2, midY + 34);
    }

    // 行车期危机横幅（挂在正中胶囊下方，视线无需跳到右上角！）
    if (world.phase === 'running') {
      const warnDist = Math.max(620, world.speed * 1.45);
      const warnText = world.braking
        ? (lv.showCrouch === false ? '即将进站缓刹 · 坐稳准备欢呼！' : '急刹预警！快按住缩头死抓！')
        : (world.tunnelAlert && world.tunnelAlert.dist > -100 && world.tunnelAlert.dist < warnDist)
          ? `前方${world.tunnelAlert.label}！按住缩头！`
          : world.activeWind
            ? '强阵风来袭！按住缩头抗风！'
            : (world.midStopAlert && world.midStopAlert.dist > 0)
              ? '前方红灯即将急停！'
              : '';
      if (warnText) {
        this._warnActive = true;
        const blink = Math.sin(world.time * 18) > 0;
        const ww = 290;
        this.drawBtn3D(ctx, (VW - ww) / 2, midY + midH + 10, ww, 36, {
          fill: blink ? '#E11D48' : '#DC2626', lip: '#881337', radius: 12, depth: 3, sheen: false,
        });
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(warnText, VW / 2, midY + midH + 33);
      }
    }

    // ===== TIER 3（右上弱化工具组 · 手机端放大触控热区）：选站 / 音效 / 重开，严格避让抖音胶囊 =====
    const rightLimit = Math.min(safeRightV - 10, capsuleLeftV - 10);
    let cursorR = rightLimit;
    const toolY = 36;

    cursorR -= 24;
    this.drawRoundTool(ctx, 'reset', cursorR, toolY, 22, 'reset');
    cursorR -= 54;
    this.drawRoundTool(ctx, 'mute', cursorR, toolY, 22, muted ? 'mute' : 'sound');
    cursorR -= 34;

    // 精简选站大胶囊
    const stW = 104;
    cursorR -= stW;
    const stLabel = lv.isStrictQueue ? '分流' : lv.isDaily ? '每日' : lv.isEndless ? `无尽${lv.wave}` : `第${lv.index}站`;
    this.drawBtn3D(ctx, cursorR, 14, stW, 44, { fill: CREAM, lip: '#CBD5E1', radius: 13, depth: 4, sheen: false });
    ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(stLabel, cursorR + stW / 2 - 8, 42);
    drawIcon(ctx, 'chevronDown', cursorR + stW - 15, 36, 12.5, INK);
    this.addBox('open_stations', cursorR, 14, stW, 44);

    // 仅在本地预览画半透明胶囊占位线，直观检验防遮挡
    if (!isTT && capsuleLeftV < rightV - 20) {
      this.drawCapsuleGuide(ctx, capsuleLeftV, rightV);
    }
  }

  drawCapsuleGuide(ctx, capsuleLeftV, rightV) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1.5;
    const cw = Math.max(70, Math.min(94, rightV - 12 - capsuleLeftV));
    rrect(ctx, capsuleLeftV, 16, cw, 32, 16);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('抖音胶囊区', capsuleLeftV + cw / 2, 36);
    ctx.restore();
  }

  /** 底部悬浮实体操作区（手机横屏拇指优先设计 + 底部 Home 横条安全区自动上浮避让！） */
  drawBottomDock(ctx, world, progress, heldBtns, safeLeftV, safeRightV, safeBottomV, whisper, voiceBubble, l1TunnelFlash) {
    const lv = world.level;
    const dockLift = Math.max(0, Math.min(46, VH - (safeBottomV || VH)));
    if (world.phase === 'loading' && lv.strictQueue) {
      // ===== 特殊模式：文明排队专列（严禁插队，排头大卡 + 后续 3 人预告 + 左/右拇指放置快键！） =====
      const cy = 598 - dockLift; const ch = 104;
      const avail = world.poolTotal();
      const nextId = world.queue[0] || null;
      const nextMeta = nextId ? PASSENGER_META[nextId] : null;

      // 1) 右下角：发车大钮 + 撤回
      const goW = 172; const goX = safeRightV - 14 - goW;
      this.drawBtn3D(ctx, goX, cy, goW, ch, {
        topFill: '#F87171', fill: '#DC2626', lip: '#991B1B', radius: 18, depth: 6,
      });
      drawIcon(ctx, 'train', goX + 42, cy + 44, 24, '#FFFFFF');
      ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 26px ${FONT}`; ctx.fillText('发车！', goX + 64, cy + 54);
      ctx.textAlign = 'center'; ctx.fillStyle = '#FEF2F2';
      ctx.font = `800 13px ${FONT}`; ctx.fillText('随时出发', goX + goW / 2, cy + 82);
      this.addBox('depart', goX, cy, goW, ch);

      const undoW = 92; const undoX = goX - 10 - undoW;
      const canUndo = world.undoStack.length > 0;
      ctx.save();
      if (!canUndo) ctx.globalAlpha = 0.42;
      this.drawBtn3D(ctx, undoX, cy, undoW, ch, { fill: CREAM, lip: '#B8ACA0', radius: 15, depth: 5, sheen: false });
      drawIcon(ctx, 'undo', undoX + undoW / 2, cy + 38, 20, INK);
      ctx.fillStyle = INK; ctx.font = `900 16px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('撤回', undoX + undoW / 2, cy + 74);
      ctx.restore();
      this.addBox('undo', undoX, cy, undoW, ch, { disabled: !canUndo });

      // 2) 左区紧凑组合：【◀ 放左侧】 + 【当前排头铭牌】 + 【放右侧 ▶】（砍掉重复的下一位预告格，释放站台视野）
      const leftX = safeLeftV + 14;
      const sideW = 148;
      const cardW = 206;
      const cardX = leftX + sideW + 10;
      const rightBtnX = cardX + cardW + 10;

      ctx.save();
      if (avail <= 0) ctx.globalAlpha = 0.42;
      this.drawBtn3D(ctx, leftX, cy, sideW, ch, {
        topFill: '#38BDF8', fill: '#0284C7', lip: '#075985', radius: 18, depth: 6,
      });
      drawIcon(ctx, 'arrowLeft', leftX + 24, cy + 44, 20, '#FFFFFF');
      ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 20px ${FONT}`; ctx.fillText('放左侧', leftX + sideW / 2 + 8, cy + 51);
      ctx.fillStyle = '#E0F2FE'; ctx.font = `800 12px ${FONT}`;
      ctx.fillText('往车尾侧叠放', leftX + sideW / 2, cy + 79);
      this.addBox('place_left', leftX, cy, sideW, ch, { disabled: avail <= 0 });

      this.drawBtn3D(ctx, rightBtnX, cy, sideW, ch, {
        topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 18, depth: 6,
      });
      drawIcon(ctx, 'arrowRight', rightBtnX + sideW - 24, cy + 44, 20, '#FFFFFF');
      ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 20px ${FONT}`; ctx.fillText('放右侧', rightBtnX + sideW / 2 - 8, cy + 51);
      ctx.fillStyle = '#DCFCE7'; ctx.font = `800 12px ${FONT}`;
      ctx.fillText('往车头侧叠放', rightBtnX + sideW / 2, cy + 79);
      this.addBox('place_right', rightBtnX, cy, sideW, ch, { disabled: avail <= 0 });
      ctx.restore();

      if (world.onBoardCount() === 0 && avail > 0 && (world.time || 0) >= 0.8 && !(voiceBubble && voiceBubble.life > 0)) {
        const bnc = Math.sin(world.time * 8) * 4;
        const callW = 248;
        const midBtnsX = (leftX + rightBtnX + sideW) / 2;
        const callX = midBtnsX - callW / 2;
        const callY = cy - 40 + bnc;
        ctx.fillStyle = '#FACC15';
        rrect(ctx, callX, callY, callW, 28, 12); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midBtnsX - 6, callY + 28);
        ctx.lineTo(midBtnsX, callY + 35);
        ctx.lineTo(midBtnsX + 6, callY + 28);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('点【放左侧】或【放右侧】均衡叠人！', midBtnsX, callY + 18.5);
      }

      // 中间紧凑「当前排头」铭牌
      this.drawCard3D(ctx, cardX, cy, cardW, ch, { fill: CREAM, lip: '#CBD5E1', radius: 18, border: nextMeta ? nextMeta.swatch : INK, borderW: 2.6, depth: 5 });
      if (nextMeta) {
        ctx.fillStyle = nextMeta.swatch;
        rrect(ctx, cardX + 12, cy + 12, 76, 80, 14); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        drawPortrait(ctx, nextMeta.id, cardX + 50, cy + 54, 1.22);

        ctx.fillStyle = '#EF4444';
        rrect(ctx, cardX + 8, cy - 9, 64, 22, 10); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.fillStyle = '#FEF08A'; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('当前排头', cardX + 40, cy + 6);

        ctx.textAlign = 'left';
        ctx.fillStyle = INK; ctx.font = `900 22px ${FONT}`;
        ctx.fillText(nextMeta.name, cardX + 98, cy + 46);
        ctx.fillStyle = '#475569'; ctx.font = `800 13px ${FONT}`;
        ctx.fillText(nextMeta.feature, cardX + 98, cy + 72);

        // 台词小气泡（跟随新排头上阵）
        if (voiceBubble && voiceBubble.life > 0) {
          const a = Math.min(1, voiceBubble.life / 0.28);
          ctx.save();
          ctx.globalAlpha = a;
          ctx.font = `900 14px ${FONT}`;
          const label = `「${voiceBubble.text}」`;
          const bw = Math.max(136, ctx.measureText(label).width + 28);
          const bx = cardX + cardW / 2 - bw / 2;
          const by = cy - 42;
          this.drawCard3D(ctx, bx, by, bw, 32, { fill: CREAM, lip: '#CBD5E1', radius: 12, border: nextMeta.swatch, borderW: 2.2, depth: 3 });
          ctx.fillStyle = INK; ctx.textAlign = 'center';
          ctx.fillText(label, bx + bw / 2, by + 21);
          ctx.restore();
        }
      } else {
        ctx.textAlign = 'center'; ctx.fillStyle = '#15803D';
        ctx.font = `900 20px ${FONT}`;
        ctx.fillText('站台全部登车完毕！点【发车！】', cardX + cardW / 2, cy + 58);
      }
      return;
    }

    if (world.phase === 'loading') {
      const cy = 604 - dockLift; const ch = 96;
      const showAirDropAd = Boolean(lv.showReinforce && !world.reinforcedUsed && world.poolTotal() === 0);
      const goW = 184;

      // 1) 左下角：车票式紧凑「本波登车（随机 1~3 人）」角色铭牌（释放中央站台月台视野！）
      const avail = world.poolTotal();
      const headId = world.queue[0] || null;
      const headMeta = headId ? PASSENGER_META[headId] : null;
      const batchN = Math.min(world.burstSize || 1, avail);
      const cardX = safeLeftV + 16;
      const cardW = headMeta ? (batchN > 1 ? 284 : 226) : 248;

      this.drawCard3D(ctx, cardX, cy, cardW, ch, {
        fill: CREAM,
        lip: '#CBD5E1',
        radius: 18,
        border: headMeta ? headMeta.swatch : INK,
        borderW: 2.6,
        depth: 5,
      });

      if (headMeta) {
        // 排头角色头像
        ctx.fillStyle = headMeta.swatch;
        rrect(ctx, cardX + 12, cy + 12, 72, 72, 14); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        drawPortrait(ctx, headMeta.id, cardX + 48, cy + 50, 1.18);

        const badgeTxt = batchN > 1 ? `本波 ${batchN} 人齐上` : '本波 1 人上车';
        ctx.font = `900 11.5px ${FONT}`;
        const badgeW = Math.max(72, ctx.measureText(badgeTxt).width + 16);
        ctx.fillStyle = batchN > 1 ? '#EA580C' : '#EF4444';
        rrect(ctx, cardX + 8, cy - 10, badgeW, 21, 10); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.fillStyle = '#FEF08A'; ctx.textAlign = 'center';
        ctx.fillText(badgeTxt, cardX + 8 + badgeW / 2, cy + 4);

        ctx.textAlign = 'left';
        ctx.fillStyle = INK; ctx.font = `900 21px ${FONT}`;
        ctx.fillText(headMeta.name, cardX + 94, cy + 36);
        ctx.fillStyle = '#475569'; ctx.font = `800 12.5px ${FONT}`;
        ctx.fillText(headMeta.feature, cardX + 94, cy + 57);
        // 第 3 行改为角色性格口癖台词（不剧透用法，留给玩家自己探索物理特性，且随当前排头个体切换不同台词！）
        const headQid = (world.stationLine && world.stationLine[0] && world.stationLine[0].qid) || 0;
        const quotes = (headMeta.voiceLines && headMeta.voiceLines.length) ? headMeta.voiceLines : ['快上车！'];
        const quoteLine = `“${quotes[headQid % quotes.length]}”`;
        ctx.fillStyle = '#B45309'; ctx.font = `800 11px ${FONT}`;
        ctx.fillText(quoteLine, cardX + 94, cy + 78);

        // 当本波随机到 2~3 人同行时，在右侧虚线副券区展示「同行 +1/+2」迷你头像，结构清晰如登车票！
        if (batchN > 1) {
          const divX = cardX + 196;
          ctx.save();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(divX, cy + 12); ctx.lineTo(divX, cy + ch - 12); ctx.stroke();
          ctx.restore();

          ctx.fillStyle = '#B45309'; ctx.font = `900 10.5px ${FONT}`; ctx.textAlign = 'center';
          ctx.fillText(`同行 +${batchN - 1}`, divX + 43, cy + 23);

          const extraCnt = Math.min(2, batchN - 1);
          for (let k = 1; k <= extraCnt; k++) {
            const nid = world.queue[k];
            if (!nid) break;
            const nm = PASSENGER_META[nid];
            const px = divX + (extraCnt === 1 ? 27 : 10 + (k - 1) * 35);
            const py = cy + 30;
            ctx.fillStyle = '#FEF9C3';
            rrect(ctx, px, py, 31, 52, 8); ctx.fill();
            ctx.strokeStyle = nm ? nm.swatch : '#D97706';
            ctx.lineWidth = 1.8; ctx.stroke();
            drawPortrait(ctx, nid, px + 15.5, py + 30, 0.62);
          }
        }

        // 新乘客首次登场弱提示气泡（居中悬于顶部情报卡与站台雨棚之间的通透天空带，绝不挡站台排队乘客！）
        if (whisper && whisper.life > 0) {
          const wMeta = PASSENGER_META[whisper.typeId] || headMeta;
          const a = Math.min(1, whisper.life / 0.35);
          ctx.save();
          ctx.globalAlpha = a;
          const hintFont = Math.max(15, Math.min(22, Math.ceil(11 / this.viewScale)));
          ctx.font = `900 ${hintFont}px ${FONT}`;
          const bh = Math.max(36, hintFont + 18);
          const bw = Math.max(240, ctx.measureText(whisper.text).width + 36);
          const bx = Math.round((VW - bw) / 2);
          const by = 128;
          this.drawCard3D(ctx, bx, by, bw, bh, { fill: '#1E293B', lip: '#0F172A', radius: 13, border: wMeta.swatch, borderW: 2.2, depth: 3 });
          ctx.fillStyle = '#FEF08A'; ctx.textAlign = 'center';
          ctx.fillText(whisper.text, bx + bw / 2, by + bh / 2 + hintFont * 0.36);
          ctx.restore();
        }
      } else {
        ctx.textAlign = 'center'; ctx.fillStyle = '#15803D';
        ctx.font = `900 16px ${FONT}`;
        ctx.fillText('全员已登车 · 点右侧发车！', cardX + cardW / 2, cy + 54);
      }

      // 1b) 车票即时消耗槽：与左侧排头卡严格等高(ch=96)、顶底齐平，视觉浑然一体！
      if (progress && progress.data) {
        const gearBought = Boolean(world.gear && world.gear.superGrip);
        const canAffordGear = progress.data.tickets >= 35;
        const gx = cardX + cardW + 10;
        const gw = 114;
        const gh = ch;
        const gy = cy;
        this.drawBtn3D(ctx, gx, gy, gw, gh, {
          fill: gearBought ? '#DCFCE7' : (canAffordGear ? '#FEF3C7' : CREAM),
          lip: gearBought ? '#16A34A' : (canAffordGear ? '#D97706' : '#B8ACA0'),
          radius: 18, depth: 5, sheen: !gearBought && canAffordGear,
        });
        drawIcon(ctx, gearBought ? 'check' : 'ticket', gx + gw / 2, gy + 26, 17, gearBought ? '#15803D' : '#D97706');
        ctx.textAlign = 'center';
        ctx.fillStyle = gearBought ? '#15803D' : (canAffordGear ? '#92400E' : '#475569');
        ctx.font = `900 13.5px ${FONT}`;
        ctx.fillText(gearBought ? '护盾已装备' : '35票 · 护盾', gx + gw / 2, gy + 56);
        ctx.fillStyle = gearBought ? '#166534' : '#64748B';
        ctx.font = `800 11px ${FONT}`;
        ctx.fillText(gearBought ? '防滑+气囊×1' : '本局防滑+气囊', gx + gw / 2, gy + 77);
        this.addBox('buy_ticket_gear', gx, gy, gw, gh, { disabled: gearBought });
      }

      // 2) 右下角操控区：告别繁琐手动 ×1/×3 小按钮，化繁为简为等高 96px 的【撤回】+【发车！】大按钮组！
      const goH = ch;
      const goX = safeRightV - 14 - goW;
      const goY = cy;
      const undoW = 104;
      const trayLeft = goX - (showAirDropAd ? 136 : 0) - (lv.showUndo ? undoW + 10 : 0) - 8;
      const trayW = (goX + goW + 8) - trayLeft;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.09)';
      rrect(ctx, trayLeft, goY - 6, trayW, goH + 14, 22); ctx.fill();
      ctx.strokeStyle = 'rgba(100, 82, 62, 0.22)'; ctx.lineWidth = 1.5; ctx.stroke();
      const isEarlyStage = !lv.isEndless && !lv.isDaily && (lv.index || 1) <= 3;
      const idleSec = Math.max(0, (world.time || 0) - (world.lastLaunchTime || 0));
      const readyToGo = world.onBoardScore() >= lv.targets[0];
      const readyPulse = (isEarlyStage && readyToGo) || (readyToGo && idleSec >= 3.2)
        ? 1 + 0.042 * Math.sin(world.time * 7.5) : 1;
      ctx.save();
      ctx.translate(goX + goW / 2, goY + goH / 2);
      ctx.scale(readyPulse, readyPulse);
      this.drawBtn3D(ctx, -goW / 2, -goH / 2, goW, goH, {
        topFill: '#F87171', fill: '#DC2626', lip: '#991B1B', radius: 19, depth: 6,
      });
      drawIcon(ctx, 'train', -46, -8, 25, '#FFFFFF');
      ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 26px ${FONT}`; ctx.fillText('发车！', -22, 3);
      ctx.textAlign = 'center'; ctx.fillStyle = '#FEF2F2';
      ctx.font = `800 13px ${FONT}`; ctx.fillText(readyToGo && isEarlyStage ? '已达标 · 点此发车!' : '随时出发', 0, 31);
      ctx.restore();
      this.addBox('depart', goX, goY, goW, goH);

      // 前 3 关达标过关线且玩家停手发呆 >= 3.2 秒时，在「发车！」按钮上方弹出跳动金标气泡指引发车！
      if (isEarlyStage && readyToGo && idleSec >= 3.2) {
        const bnc = Math.sin(world.time * 8) * 4;
        const tipW = 152;
        const tipX = goX + goW / 2 - tipW / 2;
        const tipY = goY - 40 + bnc;
        ctx.fillStyle = '#FACC15';
        rrect(ctx, tipX, tipY, tipW, 28, 12); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(goX + goW / 2 - 6, tipY + 28);
        ctx.lineTo(goX + goW / 2, tipY + 35);
        ctx.lineTo(goX + goW / 2 + 6, tipY + 28);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('人数够啦 · 点这发车！', goX + goW / 2, tipY + 19);
      }

      // 3) 中右区：与发车按钮等高齐平的「撤回」与「呼叫外援」
      let rx = goX - 10;

      if (showAirDropAd) {
        const adW = 128;
        rx -= adW;
        this.drawBtn3D(ctx, rx, goY, adW, goH, {
          fill: CREAM_SUB, lip: '#CBD5E1', radius: 18, depth: 5, sheen: false,
        });
        drawIcon(ctx, 'videoAd', rx + 22, goY + 36, 15, '#475569');
        ctx.textAlign = 'left'; ctx.fillStyle = '#334155';
        ctx.font = `800 14px ${FONT}`;
        ctx.fillText('呼叫外援', rx + 35, goY + 41);
        ctx.textAlign = 'center'; ctx.fillStyle = '#64748B';
        ctx.font = `700 12px ${FONT}`;
        ctx.fillText('+5胖叔 +5挂壁', rx + adW / 2, goY + 70);
        this.addBox('ad_reinforce', rx, goY, adW, goH);
        rx -= 8;
      }

      if (lv.showUndo) {
        rx -= undoW;
        const canUndo = world.undoStack.length > 0;
        ctx.save();
        if (!canUndo) ctx.globalAlpha = 0.42;
        this.drawBtn3D(ctx, rx, goY, undoW, goH, {
          fill: CREAM, lip: '#B8ACA0', radius: 18, depth: 5, sheen: false,
        });
        drawIcon(ctx, 'undo', rx + undoW / 2, goY + 34, 19, INK);
        ctx.fillStyle = INK; ctx.font = `900 16px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('撤回', rx + undoW / 2, goY + 69);
        ctx.restore();
        this.addBox('undo', rx, goY, undoW, goH, { disabled: !canUndo });
      }
    } else if (world.phase === 'running') {
      // 行车期双拇指大掌键（手机横屏黄金左右底角热区 + 左右仪表严格水平对齐！）
      const cy = 598 - dockLift; const ch = 104;
      const gaugeY = cy - 26;
      const duck = heldBtns.has('crouch');
      const boost = heldBtns.has('boost');

      // 左下：超大手动加速油门键 + 紧贴按钮顶部的居中实时车速仪（加速狂飙突破 125~175 km/h + 实时冲刺小费！）
      const bw = 264; const bx = safeLeftV + 16;
      const kmh = Math.round(world.speed * 0.25);
      const isTurbo = (boost && !world.braking) || kmh >= 100;
      const liveTip = world.boostTime >= 0.35 ? Math.max(1, Math.min(28, Math.round(world.boostTime * 2.2))) : 0;
      ctx.fillStyle = isTurbo ? '#EA580C' : '#1E293B';
      rrect(ctx, bx + 12, gaugeY, bw - 24, 22, 11); ctx.fill();
      ctx.strokeStyle = isTurbo ? '#FEF08A' : 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = isTurbo ? '#FEF08A' : '#F8FAFC';
      ctx.font = `900 12px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(
        isTurbo
          ? `极速冲刺 ${kmh} km/h${liveTip > 0 ? ` · +${liveTip}票` : ''}`
          : `当前时速 ${kmh} km/h${liveTip > 0 ? ` · 已赚+${liveTip}票` : ''}`,
        bx + bw / 2, gaugeY + 15
      );

      this.drawHoldPad(
        ctx, 'boost', bx, cy, bw, ch,
        'bolt', boost ? '猛踩油门中!' : '按住加速',
        boost
          ? `狂飙 ${kmh} km/h · 小费 +${liveTip} 票!`
          : (liveTip > 0 ? `已赚小费 +${liveTip} 票 · 继续冲!` : '提速破 120+ km/h · 赚小费'),
        boost, '#F59E0B', '#FDE047', '#B45309', '#EA580C', true
      );

      // 第 1 关发车后若 2.2 秒尚未踩过油门，上方弹出跳动黄色指引气泡（按下即消失）
      if (lv.id === 's1' && world.runTime >= 2.2 && world.boostTime < 0.15 && !world.braking && !boost) {
        const bnc = Math.sin(world.time * 8) * 4;
        const cw0 = 196;
        const cx0 = bx + bw / 2 - cw0 / 2;
        const cy0 = gaugeY - 36 + bnc;
        ctx.fillStyle = '#FACC15';
        rrect(ctx, cx0, cy0, cw0, 28, 11); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx + bw / 2 - 6, cy0 + 28);
        ctx.lineTo(bx + bw / 2, cy0 + 35);
        ctx.lineTo(bx + bw / 2 + 6, cy0 + 28);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('按住加速冲刺 · 多赚车票!', bx + bw / 2, cy0 + 18.5);
      }

      // 右下超大拇指缩头键 + 与左侧严格齐平的「缩头体力」清晰仪表条（第 1 关无桥洞暂隐藏，第 2 关起解锁！）
      if (lv.showCrouch !== false) {
        const cw = 322; const cx = safeRightV - 16 - cw;
        const flash = l1TunnelFlash > 0 && Math.sin(world.time * 18) > 0;
        const activeDuck = duck || flash;
        this.drawHoldPad(
          ctx, 'crouch', cx, cy, cw, ch,
          'crouch', '按住全员缩头死抓', '躲低桥 · 抗狂风 · 扛急刹',
          activeDuck, '#0EA5E9', '#FACC15', '#0369A1', '#B45309', true
        );

        const lowStam = !world.hasPerk('energyDrink') && world.stamina < 0.25;
        ctx.fillStyle = '#1E293B';
        rrect(ctx, cx + 12, gaugeY, cw - 24, 22, 11); ctx.fill();
        ctx.strokeStyle = lowStam ? '#FB7185' : 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1.6; ctx.stroke();

        ctx.fillStyle = lowStam ? '#FDA4AF' : '#E2E8F0';
        ctx.font = `900 11px ${FONT}`; ctx.textAlign = 'left';
        ctx.fillText('体力', cx + 22, gaugeY + 15);

        const trackX = cx + 54; const trackW = cw - 78;
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        rrect(ctx, trackX, gaugeY + 6, trackW, 10, 5); ctx.fill();
        const stamRatio = world.hasPerk('energyDrink') ? 1 : Math.max(0.03, world.stamina);
        ctx.fillStyle = world.hasPerk('energyDrink') ? '#4ADE80' : (lowStam ? '#FB7185' : '#38BDF8');
        rrect(ctx, trackX, gaugeY + 6, trackW * stamRatio, 10, 5); ctx.fill();

        // 第 2 关首次靠近桥洞时，在缩头键上方弹出醒目引导气泡（按住即消失）
        if (l1TunnelFlash > 0 && !duck) {
          const bnc = Math.sin(world.time * 9) * 4;
          const cw1 = 212;
          const cx1 = cx + cw / 2 - cw1 / 2;
          const cy1 = gaugeY - 36 + bnc;
          ctx.fillStyle = '#FACC15';
          rrect(ctx, cx1, cy1, cw1, 28, 11); ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx + cw / 2 - 6, cy1 + 28);
          ctx.lineTo(cx + cw / 2, cy1 + 35);
          ctx.lineTo(cx + cw / 2 + 6, cy1 + 28);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = INK; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
          ctx.fillText('前方低桥 · 按住缩头防撞飞!', cx + cw / 2, cy1 + 18.5);
        }
      }
    }
  }

  drawHoldPad(ctx, id, x, y, w, h, iconName, title, sub, active, baseCol, activeCol, baseLip, activeLip, whiteBase = false) {
    const topY = this.drawBtn3D(ctx, x, y, w, h, {
      fill: active ? activeCol : baseCol,
      lip: active ? activeLip : baseLip,
      radius: 20,
      depth: 6,
      pressed: active,
      sheen: true,
    });
    const fg = active ? INK : (whiteBase ? '#FFFFFF' : INK);
    const subFg = active ? '#334155' : (whiteBase ? '#E0F2FE' : '#64748B');
    drawIcon(ctx, iconName, x + 34, topY + 40, 24, fg);
    ctx.textAlign = 'center';
    ctx.fillStyle = fg; ctx.font = `900 22px ${FONT}`;
    ctx.fillText(title, x + w / 2 + 12, topY + 47);
    ctx.fillStyle = subFg; ctx.font = `800 14px ${FONT}`;
    ctx.fillText(sub, x + w / 2, topY + 78);
    this.addBox(id, x, y, w, h, { hold: true });
  }

  /** 游戏封面海报感极简开屏（手机端清晰忠告 + 进度感主钮 + 桌面快捷方式/侧边栏/每日目标！） */
  drawTitleOverlay(ctx, sdk, progress, muted, leftV, rightV, safeLeftV, safeRightV, safeBottomV, capsuleLeftV, isTT) {
    ctx.save();
    const dockLift = Math.max(0, Math.min(46, VH - (safeBottomV || VH)));
    // 柔和全宽屏暗角（铺满 leftV..rightV，21:9 零断层！）
    const vig = ctx.createLinearGradient(0, 0, 0, VH);
    vig.addColorStop(0, 'rgba(15, 23, 42, 0.14)');
    vig.addColorStop(0.65, 'rgba(15, 23, 42, 0.04)');
    vig.addColorStop(1, 'rgba(15, 23, 42, 0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(leftV - 60, 0, (rightV - leftV) + 120, VH);

    // 左上角轻留存胶囊组（侧边栏礼 / 添加桌面 / 今日目标，横向整齐排列不抢主按钮！）
    let lxCur = safeLeftV + 16;
    if (sdk.sidebarSupported && progress.canClaimSidebarToday()) {
      this.drawBtn3D(ctx, lxCur, 14, 128, 44, {
        topFill: '#4ADE80', fill: '#22C55E', lip: '#15803D', radius: 13, depth: 4,
      });
      drawIcon(ctx, 'gift', lxCur + 20, 36, 17, '#052E16');
      ctx.fillStyle = '#052E16'; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('侧边栏礼', lxCur + 35, 41);
      this.addBox('open_sidebar', lxCur, 14, 128, 44);
      lxCur += 138;
    }
    if (sdk.shortcutSupported && !sdk.shortcutAdded && !progress.data.shortcutClaimed) {
      this.drawBtn3D(ctx, lxCur, 14, 134, 44, {
        fill: '#FEF3C7', lip: '#D97706', radius: 13, depth: 4, sheen: false,
      });
      drawIcon(ctx, 'ticket', lxCur + 20, 36, 16, '#D97706');
      ctx.fillStyle = '#92400E'; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('放桌面+40', lxCur + 34, 41);
      this.addBox('add_shortcut', lxCur, 14, 134, 44);
      lxCur += 144;
    }
    // 今日目标（带红点提醒，强拉次留）
    const hasMissionReady = progress.hasUnclaimedMission();
    this.drawBtn3D(ctx, lxCur, 14, 122, 44, {
      fill: CREAM, lip: '#CBD5E1', radius: 13, depth: 4, sheen: false,
    });
    drawIcon(ctx, 'calendar', lxCur + 20, 36, 16, '#0284C7');
    ctx.fillStyle = INK; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText('今日目标', lxCur + 35, 41);
    if (hasMissionReady) {
      ctx.fillStyle = '#EF4444';
      ctx.beginPath(); ctx.arc(lxCur + 112, 22, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    this.addBox('open_missions', lxCur, 14, 122, 44);

    // 右上角：车票余额 + 放大声音圆钮（避开抖音胶囊）
    const rightLimit = Math.min(safeRightV - 10, capsuleLeftV - 10);
    let rCur = rightLimit;
    rCur -= 24;
    this.drawRoundTool(ctx, 'mute', rCur, 36, 22, muted ? 'mute' : 'sound');
    rCur -= 34;

    const tw = 104;
    rCur -= tw;
    this.drawCard3D(ctx, rCur, 14, tw, 44, { fill: CREAM, lip: '#CBD5E1', radius: 13, depth: 4 });
    drawIcon(ctx, 'ticket', rCur + 20, 36, 17, '#D97706');
    ctx.fillStyle = INK; ctx.font = `900 16px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(String(progress.data.tickets), rCur + 38, 42);
    this.addBox('open_garage', rCur, 14, tw, 44);

    if (!isTT && capsuleLeftV < rightV - 20) {
      this.drawCapsuleGuide(ctx, capsuleLeftV, rightV);
    }

    // 双层 3D 街机漫画大标题（微倾 -2° 充满动感，稳稳立在站台雨棚上方）
    ctx.save();
    ctx.translate(VW / 2, 108);
    ctx.rotate(-0.032);
    ctx.textAlign = 'center';
    ctx.font = `900 68px ${FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14; ctx.strokeStyle = INK;
    ctx.strokeText('超载快车', 0, 7);
    ctx.fillStyle = '#B91C1C';
    ctx.fillText('超载快车', 0, 7);
    const tg = ctx.createLinearGradient(0, -56, 0, 10);
    tg.addColorStop(0, '#FEF9C3');
    tg.addColorStop(0.55, '#FACC15');
    tg.addColorStop(1, '#F97316');
    ctx.lineWidth = 10; ctx.strokeStyle = INK;
    ctx.strokeText('超载快车', 0, 0);
    ctx.fillStyle = tg;
    ctx.fillText('超载快车', 0, 0);
    ctx.restore();

    // 明快黄色副标丝带
    this.drawCard3D(ctx, VW / 2 - 122, 134, 244, 30, { fill: '#FEF08A', lip: '#D97706', radius: 15, depth: 3 });
    ctx.fillStyle = INK; ctx.font = `900 13px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('早高峰纯物理叠罗汉 · 10站挑战', VW / 2, 154);

    // 底部自下而上锚定：先放居中《健康游戏忠告》 -> 再放 4 枚均衡次入口 -> 再放并列双主按钮【开始闯关】+【无尽肉鸽】！
    const noticeH = 44;
    const noticeY = VH - noticeH - 10 - dockLift;
    const vGap = dockLift > 20 ? 10 : 12;
    const ph = 44;
    const py = noticeY - ph - vGap;
    const mainW = 270; const mainGap = 14; const bh = 70;
    const mainTotalW = mainW * 2 + mainGap;
    const bx = Math.round((VW - mainTotalW) / 2);
    const by = py - bh - vGap;

    // 左主按钮：主线闯关「开始闯关」
    const curStIdx = Math.min(progress.data.unlockedIdx, LEVELS.length - 1);
    const curLv = LEVELS[curStIdx] || LEVELS[0];
    this.drawBtn3D(ctx, bx, by, mainW, bh, {
      topFill: '#F87171', fill: '#DC2626', lip: '#991B1B', radius: 20, depth: 6,
    });
    drawIcon(ctx, 'train', bx + 34, by + 28, 22, '#FFFFFF');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 26px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('开始闯关', bx + mainW / 2 + 10, by + 37);
    ctx.fillStyle = '#FEF2F2';
    ctx.font = `800 12px ${FONT}`;
    ctx.fillText(
      progress.data.unlockedIdx > 0 ? `继续 · 第 ${curLv.index} 站（${curLv.name}）` : `第 1 站 · ${curLv.name}`,
      bx + mainW / 2, by + 59
    );
    this.addBox('start', bx, by, mainW, bh);

    // 右主按钮：并列「无尽肉鸽」（开屏直接并列可玩，三选一强化词条爽感直达！）
    const ex = bx + mainW + mainGap;
    this.drawBtn3D(ctx, ex, by, mainW, bh, {
      topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 20, depth: 6,
    });
    drawIcon(ctx, 'infinity', ex + 36, by + 28, 22, '#FEF08A');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 26px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('无尽肉鸽', ex + mainW / 2 + 12, by + 37);
    ctx.fillStyle = '#DCFCE7';
    ctx.font = `800 12px ${FONT}`;
    ctx.fillText(
      progress.data.endlessBestWave > 0 ? `三选一词条 · 最高第 ${progress.data.endlessBestWave} 站` : '三选一词条 · 跨站保留乘客',
      ex + mainW / 2, by + 59
    );
    this.addBox('start_endless', ex, by, mainW, bh);

    // 若已达成 24/24 全图鉴大满贯，在主按钮上方展示永久鎏金「全图鉴大师」徽章！
    if (progress.isFullAlbumComplete()) {
      const mW = 166; const mH = 26;
      const mx = Math.round((VW - mW) / 2);
      const my = by - 36;
      ctx.fillStyle = '#FEF3C7';
      rrect(ctx, mx, my, mW, mH, 13); ctx.fill();
      ctx.strokeStyle = '#D97706'; ctx.lineWidth = 2; ctx.stroke();
      drawIcon(ctx, 'trophy', mx + 18, my + 13, 14, '#D97706');
      ctx.fillStyle = '#92400E'; ctx.font = `900 12.5px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText('24/24 全图鉴大师', mx + 30, my + 17.5);
    }

    // 下方 4 枚严格等宽均衡的次入口（线路 / 车库 / 成就 / 排行，有待翻新卡或齐套大奖时亮醒目红金角标！）
    const achStat = progress.getAchievementStats();
    const hasPendingFlip = progress.hasPendingFlips();
    const hasAchReward = progress.hasUnclaimedAchievementReward();
    const achBadgeText = hasPendingFlip ? `翻新卡×${achStat.pendingFlipCount}` : (hasAchReward ? '领大奖!' : `${achStat.unlocked}/${achStat.total}`);
    const pills = [
      { id: 'open_stations', icon: 'train', label: '线路', fill: CREAM, lip: '#B8ACA0', fg: INK },
      { id: 'open_garage', icon: 'wrench', label: '车库', fill: '#FEF3C7', lip: '#F59E0B', fg: '#92400E' },
      { id: 'open_achievements', icon: 'trophy', label: '成就', badge: achBadgeText, badgeHot: hasAchReward, fill: '#FEF9C3', lip: '#D97706', fg: '#B45309' },
      { id: 'open_rank', icon: 'calendar', label: '排行', fill: '#F3E8FF', lip: '#C084FC', fg: '#6B21A8' },
    ];
    const pw = 128; const pgap = 14;
    const totalW = pills.length * pw + (pills.length - 1) * pgap;
    let px = (VW - totalW) / 2;
    pills.forEach((p) => {
      this.drawBtn3D(ctx, px, py, pw, ph, { fill: p.fill, lip: p.lip, radius: 14, depth: 4, sheen: false });
      drawIcon(ctx, p.icon, px + 34, py + ph / 2, 17, p.fg);
      ctx.fillStyle = p.fg; ctx.font = `900 17px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText(p.label, px + 52, py + 28);
      if (p.badge) {
        ctx.font = `900 10.5px ${MONO}`;
        const bgW = Math.max(36, ctx.measureText(p.badge).width + 10);
        ctx.fillStyle = p.badgeHot ? '#DC2626' : '#EA580C';
        rrect(ctx, px + pw - bgW + 4, py - 8, bgW, 18, 9); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = '#FEF9C3'; ctx.textAlign = 'center';
        ctx.fillText(p.badge, px + pw - bgW / 2 + 4, py + 5);
      }
      this.addBox(p.id, px, py, pw, ph);
      px += pw + pgap;
    });

    // 底部水平居中对称的提审级清晰《健康游戏忠告》（[8+] + 暗底双行清晰 12.5px 大字）
    const line1Rest = '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。';
    const line2 = TT_CONFIG.icpFiling
      ? `适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。 · ${TT_CONFIG.icpFiling}`
      : '适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。';
    ctx.font = `900 12.5px ${FONT}`;
    const titleW = ctx.measureText(TT_CONFIG.healthNoticeTitle).width;
    ctx.font = `700 12.5px ${FONT}`;
    const textMaxW = Math.max(titleW + 4 + ctx.measureText(line1Rest).width, ctx.measureText(line2).width);
    const maxAvail = (safeRightV - safeLeftV) - 32;
    const noticeW = Math.min(maxAvail - 72, Math.max(520, Math.ceil(textMaxW + 28)));
    const groupW = 62 + 10 + noticeW;
    const ax = Math.max(safeLeftV + 16, Math.round((VW - groupW) / 2));

    this.drawBtn3D(ctx, ax, noticeY + 2, 62, 40, { fill: '#22C55E', lip: '#15803D', radius: 10, depth: 3, sheen: false });
    ctx.fillStyle = '#FFFFFF'; ctx.font = `900 18px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(TT_CONFIG.ageRating, ax + 31, noticeY + 28);
    this.addBox('open_age8', ax, noticeY + 2, 62, 40);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    rrect(ctx, ax + 72, noticeY, noticeW, noticeH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'; ctx.lineWidth = 1.2; ctx.stroke();
    const hx = ax + 86;
    ctx.textAlign = 'left';
    ctx.font = `900 12.5px ${FONT}`;
    ctx.fillStyle = '#FDE68A';
    ctx.fillText(TT_CONFIG.healthNoticeTitle, hx, noticeY + 18);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = `700 12.5px ${FONT}`;
    ctx.fillText(line1Rest, hx + titleW + 4, noticeY + 18);
    ctx.fillText(line2, hx, noticeY + 36);
    ctx.restore();
  }

  drawBackdrop(ctx, leftV, rightV) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
    ctx.fillRect(leftV - 80, -40, (rightV - leftV) + 160, VH + 80);
  }

  /** 第 1 关一次性站长简短对话框（版本 C，暖奶油漫画气泡卡片） */
  drawL1DialogModal(ctx, leftV, rightV) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const cw = 556; const ch = 232;
    const cx = (VW - cw) / 2; const cy = (VH - ch) / 2;
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 22, depth: 6 });

    // 顶部暖黄喇叭条
    ctx.fillStyle = '#FACC15';
    rrect(ctx, cx + 22, cy + 18, 126, 32, 16); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    drawIcon(ctx, 'speaker', cx + 42, cy + 34, 16, INK);
    ctx.fillStyle = INK; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(LEVEL1_DIALOG.speaker, cx + 58, cy + 39);

    ctx.fillStyle = INK; ctx.font = `900 19px ${FONT}`;
    ctx.fillText(LEVEL1_DIALOG.line1, cx + 26, cy + 90);

    ctx.fillStyle = '#475569'; ctx.font = `800 15px ${FONT}`;
    ctx.fillText(LEVEL1_DIALOG.line2, cx + 26, cy + 124);

    const bw = 204; const bh = 50;
    const bx = (VW - bw) / 2; const by = cy + 156;
    this.drawBtn3D(ctx, bx, by, bw, bh, {
      topFill: '#F87171', fill: '#DC2626', lip: '#991B1B', radius: 15, depth: 5,
    });
    ctx.fillStyle = '#FFFFFF'; ctx.font = `900 21px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(LEVEL1_DIALOG.btn, VW / 2, by + 32);
    this.addBox('close_l1_dialog', bx, by, bw, bh);
    ctx.restore();
  }

  /** 明快漫画风到站结算卡（主按钮纯粹推进游玩，分享与激励视频统一弱化收至底部小胶囊行！） */
  drawResultModal(ctx, world, sdk, progress, meta = {}, leftV = 0, rightV = VW) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const score = world.finalScore;
    const rank = world.rankOf(score);
    const gap = world.nextRankGap(score);
    const passed = rank.idx >= 1; // B 级及以上为过关（无尽模式同样必须达 B 级才可晋级下一站！）
    const earned = meta.earnedTickets || 0;
    const doubled = Boolean(meta.ticketsDoubled);
    const showRetryAd = Boolean(world.departSnapshot && (rank.idx < 4 && (!world.level.isEndless || !passed)));
    const showTicketRetry = Boolean(world.departSnapshot && !passed);
    const showDoubleAd = !doubled && earned > 0;
    const showGapHint = Boolean(gap && (gap.need <= 6 || (world.level.isEndless && !passed)));
    const funnyTitle = meta.funnyTitle || pickFunnyTitle(world);

    const newAchs = meta.newAchievements || [];
    const showAchPill = newAchs.length > 0;
    const hList = Array.isArray(meta.highlights) && meta.highlights.length > 0
      ? meta.highlights
      : (meta.highlightSnap ? [{ snap: meta.highlightSnap, def: { title: meta.highlightSnap.title || funnyTitle } }] : []);
    const hIdx = hList.length > 0 ? ((meta.highlightIdx || 0) % hList.length) : 0;
    const activeH = hList[hIdx] || null;
    const activeSnap = activeH && activeH.snap && activeH.snap.previewCanvas ? activeH.snap : null;

    const cw = 532;
    const pw = 244;
    const polaroidGap = 22;
    const showPolaroid = Boolean(activeSnap && (rightV - leftV) >= cw + polaroidGap + pw + 24);
    const ch = 382 + (showGapHint ? 22 : 0) + (showAchPill ? 32 : 0);
    // 有高光拍立得时将「结算主卡 + 拍立得」作为一个整体水平居中，左右对称且绝不被窄屏挤出！
    const comboW = showPolaroid ? (cw + polaroidGap + pw) : cw;
    const cx = Math.round((VW - comboW) / 2);
    const cardMidX = cx + cw / 2;
    const cy = Math.round((VH - ch) / 2) + 6;

    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 24, depth: 7 });

    // 顶部彩色横幅区（按段位精细配色大金章 + 搞笑称号）
    const rankStyles = [
      { bg: '#FEE2E2', top: '#CBD5E1', fill: '#94A3B8', lip: '#475569', fg: '#FFFFFF', title: '#991B1B' }, // C
      { bg: '#DCFCE7', top: '#4ADE80', fill: '#16A34A', lip: '#14532D', fg: '#FFFFFF', title: '#166534' }, // B
      { bg: '#E0F2FE', top: '#38BDF8', fill: '#0284C7', lip: '#075985', fg: '#FFFFFF', title: '#0369A1' }, // A
      { bg: '#FEF9C3', top: '#FDE047', fill: '#F59E0B', lip: '#B45309', fg: INK,       title: '#B45309' }, // S
      { bg: '#F3E8FF', top: '#E879F9', fill: '#9333EA', lip: '#581C87', fg: '#FEF08A', title: '#7E22CE' }, // SS
    ];
    const rs = rankStyles[Math.max(0, Math.min(4, rank.idx))];
    ctx.fillStyle = rs.bg;
    rrect(ctx, cx + 6, cy + 6, cw - 12, 84, 18); ctx.fill();

    this.drawBtn3D(ctx, cx + 22, cy + 18, 64, 58, {
      topFill: rs.top, fill: rs.fill, lip: rs.lip, radius: 16, depth: 4,
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = rs.fg; ctx.font = `900 ${rank.name.length > 1 ? 26 : 32}px ${MONO}`;
    ctx.fillText(rank.name, cx + 54, cy + (rank.name.length > 1 ? 56 : 58));

    // 右上角「返回首页」按钮（随时可从结算页返回开始界面）
    const homeBtnW = 92;
    const homeBtnH = 40;
    const homeBtnX = cx + cw - homeBtnW - 18;
    const homeBtnY = cy + 22;
    this.drawBtn3D(ctx, homeBtnX, homeBtnY, homeBtnW, homeBtnH, {
      fill: '#FFFFFF', lip: '#CBD5E1', radius: 12, depth: 3, sheen: false,
    });
    drawIcon(ctx, 'train', homeBtnX + 24, homeBtnY + 20, 15, '#DC2626');
    ctx.fillStyle = INK; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText('首页', homeBtnX + 40, homeBtnY + 25);
    this.addBox('go_title', homeBtnX, homeBtnY, homeBtnW, homeBtnH);

    const maxFunnyW = homeBtnX - (cx + 100) - 10;
    const funnyStr = `【${funnyTitle}】`;
    let funnySz = 19;
    ctx.textAlign = 'left';
    ctx.font = `900 ${funnySz}px ${FONT}`;
    while (funnySz > 13 && ctx.measureText(funnyStr).width > maxFunnyW) {
      funnySz -= 1;
      ctx.font = `900 ${funnySz}px ${FONT}`;
    }
    ctx.fillStyle = rs.title;
    ctx.fillText(funnyStr, cx + 100, cy + 44);
    ctx.fillStyle = '#475569'; ctx.font = `800 13px ${FONT}`;
    ctx.fillText(
      world.finalCount > 0
        ? (world.level.isEndless && !passed
            ? `未达 B 级晋级线（需 ${world.level.targets[0]} 分）· 无尽止步第 ${world.level.wave || 1} 站！`
            : `成功抵达「${world.level.name}」终点！`)
        : '全员途中甩飞，空车进站…',
      cx + 100, cy + 69
    );
    if (progress.isFullAlbumComplete()) {
      ctx.fillStyle = '#FEF3C7';
      rrect(ctx, cx + cw - 114, cy + 65, 96, 19, 7); ctx.fill();
      ctx.strokeStyle = '#D97706'; ctx.lineWidth = 1.2; ctx.stroke();
      drawIcon(ctx, 'star', cx + cw - 102, cy + 74.5, 9, '#D97706');
      ctx.fillStyle = '#92400E'; ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('全图鉴大师', cx + cw - 58, cy + 78);
      ctx.textAlign = 'left';
    }

    // 中部：大数字运达分（动态间距） + 纯净车票收获标签
    ctx.fillStyle = INK; ctx.font = `900 46px ${MONO}`;
    const scoreText = String(score);
    ctx.fillText(scoreText, cx + 28, cy + 140);
    const scoreW = ctx.measureText(scoreText).width;
    ctx.fillStyle = '#475569'; ctx.font = `800 15px ${FONT}`;
    ctx.fillText(score > world.finalCount ? `分（${world.finalCount} 人含 VIP×3）` : '人安全挂车到站', cx + 38 + scoreW, cy + 135);

    const boostTip = meta.boostBonusTickets || 0;
    const tBoxW = boostTip > 0 ? 156 : (doubled ? 132 : 108);
    const tBoxX = cx + cw - 26 - tBoxW;
    ctx.fillStyle = CREAM_SUB;
    rrect(ctx, tBoxX, cy + 104, tBoxW, boostTip > 0 ? 44 : 38, 11); ctx.fill();
    ctx.strokeStyle = boostTip > 0 ? '#F59E0B' : '#CBD5E1'; ctx.lineWidth = 1.5; ctx.stroke();
    drawIcon(ctx, 'ticket', tBoxX + 18, cy + (boostTip > 0 ? 120 : 123), 15, '#D97706');
    ctx.fillStyle = '#B45309'; ctx.font = `900 14px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText(`+${doubled ? earned * 2 : earned} 票`, tBoxX + 32, cy + (boostTip > 0 ? 125 : 128));
    if (boostTip > 0) {
      ctx.fillStyle = '#EA580C'; ctx.font = `800 10px ${FONT}`;
      ctx.fillText(`含加速冲刺奖 +${boostTip}`, tBoxX + 32, cy + 141);
    }

    // 三格轻统计
    ctx.fillStyle = CREAM_SUB;
    rrect(ctx, cx + 26, cy + 158, cw - 52, 54, 14); ctx.fill();
    const stats = [
      ['最高同框', `${world.peakOnBoard} 人`],
      ['途中甩飞', `${world.fallenTotal} 人`],
      ['本线纪录', `${meta.best || score} 分`],
    ];
    stats.forEach(([k, v], i) => {
      const sx = cx + 26 + ((cw - 52) / 3) * (i + 0.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748B'; ctx.font = `700 12px ${FONT}`; ctx.fillText(k, sx, cy + 177);
      ctx.fillStyle = INK; ctx.font = `900 16px ${FONT}`; ctx.fillText(v, sx, cy + 200);
    });

    const bx = cx + 26; const bw = cw - 52;
    let curY = cy + 224;

    if (showAchPill) {
      const shown = newAchs.slice(0, 2).map((a) => `【${a.title}】`).join(' ');
      const extra = newAchs.length > 2 ? ` 等${newAchs.length}张` : '';
      const achLine = `获得待翻新卡：${shown}${extra} · 点此亲手翻牌领奖`;
      ctx.fillStyle = '#FEF9C3';
      rrect(ctx, bx, curY - 2, bw, 28, 9); ctx.fill();
      ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.font = `900 12px ${FONT}`;
      const aw = ctx.measureText(achLine).width;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#B45309';
      ctx.fillText(achLine, cardMidX, curY + 16);
      drawIcon(ctx, 'star', cardMidX - aw / 2 - 12, curY + 12, 9.5, '#D97706');
      drawIcon(ctx, 'arrowRight', cardMidX + aw / 2 + 12, curY + 12, 9.5, '#B45309');
      this.addBox('open_achievements', bx, curY - 2, bw, 28);
      curY += 34;
    }

    if (showGapHint) {
      ctx.textAlign = 'center';
      ctx.fillStyle = world.level.isEndless && !passed ? '#DC2626' : '#B45309';
      ctx.font = `800 12px ${FONT}`;
      ctx.fillText(
        world.level.isEndless && !passed
          ? `无尽晋级需达 B 级（${world.level.targets[0]} 分），本站还差 ${gap.need} 分！`
          : (passed ? `距 ${gap.label} 级仅差 ${gap.need} 分` : `距 B 级过关仅差 ${gap.need} 分`),
        cardMidX, curY + 12
      );
      curY += 22;
    }

    // 绝对主视觉焦点：纯粹的游戏推进按钮（绝不让分享或广告喧宾夺主！）
    if (!passed && !world.level.isEndless) {
      // 未过关：单一超大亮红「再挤一趟」
      this.drawBtn3D(ctx, bx, curY, bw, 56, {
        topFill: '#F87171', fill: '#DC2626', lip: '#991B1B', radius: 16, depth: 5,
      });
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 22px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('再挤一趟', cardMidX, curY + 36);
      this.addBox('retry', bx, curY, bw, 56);
    } else if (world.level.isEndless) {
      const retryW = 136;
      const mainW = bw - retryW - 12;
      const canNextWave = passed;
      this.drawBtn3D(ctx, bx, curY, retryW, 56, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 15, depth: 4, sheen: false });
      ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('返回线路', bx + retryW / 2, curY + 34);
      this.addBox('open_stations', bx, curY, retryW, 56);

      const mx = bx + retryW + 12;
      this.drawBtn3D(ctx, mx, curY, mainW, 56, {
        topFill: canNextWave ? '#4ADE80' : '#F87171',
        fill: canNextWave ? '#16A34A' : '#DC2626',
        lip: canNextWave ? '#14532D' : '#991B1B',
        radius: 16, depth: 5,
      });
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 19px ${FONT}`;
      const waveLabel = canNextWave ? `选词条进第 ${(world.level.wave || 1) + 1} 站` : '挑战失败 · 重开无尽专列';
      ctx.fillText(waveLabel, mx + mainW / 2 - (canNextWave ? 8 : 0), curY + 35);
      if (canNextWave) drawIcon(ctx, 'arrowRight', mx + mainW / 2 + ctx.measureText(waveLabel).width / 2 + 6, curY + 28, 12, '#FFFFFF');
      this.addBox(canNextWave ? 'endless_next_wave' : 'start_endless', mx, curY, mainW, 56);
    } else {
      // 已过关：左小安静「重玩本关」+ 右超大翠绿「下一站」
      const retryW = 136;
      const mainW = bw - retryW - 12;
      this.drawBtn3D(ctx, bx, curY, retryW, 56, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 15, depth: 4, sheen: false });
      ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('重玩本关', bx + retryW / 2, curY + 34);
      this.addBox('retry', bx, curY, retryW, 56);

      const curIdx = LEVELS.findIndex((l) => l.id === world.level.id);
      const hasNext = curIdx >= 0 && curIdx < LEVELS.length - 1;
      const mx = bx + retryW + 12;
      this.drawBtn3D(ctx, mx, curY, mainW, 56, {
        topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 16, depth: 5,
      });
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 20px ${FONT}`;
      const nextLabel = !hasNext ? '选择线路 / 无尽' : `下一站（第${curIdx + 2}站）`;
      ctx.fillText(nextLabel, mx + mainW / 2 - 8, curY + 35);
      drawIcon(ctx, 'arrowRight', mx + mainW / 2 + ctx.measureText(nextLabel).width / 2 + 6, curY + 28, 12.5, '#FFFFFF');
      this.addBox(!hasNext ? 'open_stations' : 'next_level', mx, curY, mainW, 56);
    }

    // 底部极度弱化的小型辅助工具条（支持 60 车票直接买护盾复活重跑本站！）
    curY += 74;
    const hasSnap = Boolean(activeSnap);
    const utils = [
      { id: 'share_video', icon: 'camera', label: hasSnap ? '分享高光图' : (sdk.hasVideo() ? '分享视频' : '分享战绩') },
    ];
    if (showTicketRetry) {
      utils.push({ id: 'buy_ticket_retry_same', icon: 'ticket', label: '60票护盾复活', hot: progress.data.tickets >= 60 });
    }
    if (showRetryAd) {
      utils.push({ id: 'ad_retry_same', icon: 'videoAd', label: '护盾重跑' });
    }
    if (showDoubleAd) {
      utils.push({ id: 'ad_double_tickets', icon: 'videoAd', label: '双倍领票' });
    }

    const uGap = 10;
    const uW = (bw - uGap * (utils.length - 1)) / utils.length;
    const uH = 42;
    utils.forEach((u, idx) => {
      const ux = bx + idx * (uW + uGap);
      ctx.fillStyle = u.hot ? '#FEF3C7' : CREAM_SUB;
      rrect(ctx, ux, curY, uW, uH, 11); ctx.fill();
      ctx.strokeStyle = u.hot ? '#F59E0B' : '#CBD5E1'; ctx.lineWidth = 1.4; ctx.stroke();

      ctx.font = `800 ${utils.length >= 4 ? 12.5 : 14}px ${FONT}`;
      const tw = ctx.measureText(u.label).width;
      const iconW = 14;
      const startX = ux + (uW - (iconW + 5 + tw)) / 2;
      drawIcon(ctx, u.icon, startX + iconW / 2, curY + uH / 2, 13.5, u.hot ? '#D97706' : '#64748B');
      ctx.fillStyle = u.hot ? '#92400E' : '#475569'; ctx.textAlign = 'left';
      ctx.fillText(u.label, startX + iconW + 5, curY + uH / 2 + 5);
      this.addBox(u.id, ux, curY, uW, uH);
    });

    // 右侧微倾「高光拍立得」抓拍预览（与主卡整体居中对齐，翻页钮端正挂于底部下方！）
    if (showPolaroid) {
      const px = cx + cw + polaroidGap;
      const ph = 194;
      const blockH = hList.length > 1 ? ph + 46 : ph;
      const py = cy + Math.round((ch - blockH) / 2);

      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate(0.028);
      this.drawCard3D(ctx, -pw / 2, -ph / 2, pw, ph, {
        fill: '#FFFFFF', lip: '#94A3B8', radius: 14, border: INK, borderW: 2.2, depth: 5,
      });

      // 顶部手账和纸胶带装饰
      ctx.fillStyle = 'rgba(254, 240, 138, 0.84)';
      rrect(ctx, -34, -ph / 2 - 8, 68, 16, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(180, 83, 9, 0.35)'; ctx.lineWidth = 1; ctx.stroke();

      // 抓拍实景缩略图
      const ix = -pw / 2 + 10;
      const iy = -ph / 2 + 12;
      const iw = pw - 20;
      const ih = 124;
      ctx.save();
      rrect(ctx, ix, iy, iw, ih, 8); ctx.clip();
      ctx.drawImage(activeSnap.previewCanvas, ix, iy, iw, ih);
      ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      rrect(ctx, ix, iy, iw, ih, 8); ctx.stroke();

      // 右上角红标（首张标 MVP 最佳高光）
      ctx.fillStyle = hIdx === 0 ? '#EF4444' : '#0284C7';
      rrect(ctx, ix + iw - 74, iy + 6, 68, 20, 7); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 10.5px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(hIdx === 0 ? '本局MVP' : `高光 ${hIdx + 1}/${hList.length}`, ix + iw - 40, iy + 20);

      // 拍立得白底热梗称号与说明
      const capTitle = (activeH.def && activeH.def.title) || activeSnap.title || funnyTitle;
      const capText = `【${capTitle}】`;
      let capSz = 15;
      ctx.font = `900 ${capSz}px ${FONT}`;
      while (capSz > 11.5 && ctx.measureText(capText).width > pw - 22) {
        capSz -= 1;
        ctx.font = `900 ${capSz}px ${FONT}`;
      }
      ctx.fillStyle = '#B45309'; ctx.textAlign = 'center';
      ctx.fillText(capText, 0, iy + ih + 25);
      ctx.fillStyle = '#64748B'; ctx.font = `700 11px ${FONT}`;
      ctx.fillText('点「分享高光图」附带称号发好友', 0, iy + ih + 44);
      ctx.restore();

      // 翻页按钮端正悬在拍立得下方，不与倾斜卡片错位！
      if (hList.length > 1) {
        const swY = py + ph + 14;
        this.drawBtn3D(ctx, px + 8, swY, pw - 16, 34, {
          fill: '#FEF3C7', lip: '#D97706', radius: 11, depth: 3, sheen: false,
        });
        ctx.fillStyle = '#92400E'; ctx.font = `900 13px ${FONT}`; ctx.textAlign = 'center';
        const swLabel = `换一张高光 (${hIdx + 1}/${hList.length})`;
        ctx.fillText(swLabel, px + pw / 2 - 6, swY + 22);
        drawIcon(ctx, 'arrowRight', px + pw / 2 + ctx.measureText(swLabel).width / 2 + 5, swY + 17.5, 9.5, '#92400E');
        this.addBox('switch_highlight', px + 4, swY - 2, pw - 8, 40);
      }
    }

    ctx.restore();
  }

  /** 10 站选站抽屉弹窗（暖奶油插画卡片风格 + 广告图标明示） */
  drawStationsModal(ctx, progress, world, leftV, rightV) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const cw = 852; const ch = 480;
    const cx = (VW - cw) / 2; const cy = (VH - ch) / 2 + 8;
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 24, depth: 7 });
    ctx.fillStyle = '#F6EFE2';
    rrect(ctx, cx + 6, cy + 6, cw - 12, 54, 18); ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = INK; ctx.font = `900 22px ${FONT}`;
    ctx.fillText('选择线路（达 B 级自动解锁下一站）', cx + 28, cy + 42);

    this.drawBtn3D(ctx, cx + cw - 102, cy + 14, 78, 40, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 11, depth: 3, sheen: false });
    ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('关闭', cx + cw - 63, cy + 39);
    this.addBox('close_modal', cx + cw - 102, cy + 14, 78, 40);

    const colW = 150; const rowH = 128; const gx = 12; const gy = 14;
    const startX = cx + 28; const startY = cy + 68;
    LEVELS.forEach((lv, idx) => {
      const col = idx % 5; const row = Math.floor(idx / 5);
      const x = startX + col * (colW + gx);
      const y = startY + row * (rowH + gy);
      const unlocked = progress.isLevelUnlocked(idx);
      const current = world.level.id === lv.id;
      const best = progress.data.bests[lv.id] || 0;
      const rk = progress.data.ranks[lv.id] || '';

      ctx.save();
      this.drawCard3D(ctx, x, y, colW, rowH, {
        fill: current ? '#FEF9C3' : (unlocked ? '#FFFFFF' : '#E2E8F0'),
        lip: current ? '#D97706' : '#CBD5E1',
        radius: 14, border: current ? '#B45309' : INK, borderW: current ? 2.4 : 1.8, depth: 4,
      });

      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B'; ctx.font = `900 11px ${MONO}`;
      ctx.fillText(`第 ${lv.index} 站`, x + 12, y + 22);
      if (rk) {
        ctx.fillStyle = '#FACC15'; rrect(ctx, x + colW - 38, y + 8, 28, 20, 6); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = INK; ctx.font = `900 11px ${MONO}`; ctx.textAlign = 'center';
        ctx.fillText(rk, x + colW - 24, y + 22);
      } else if (!unlocked) {
        drawIcon(ctx, 'lock', x + colW - 22, y + 18, 14, '#64748B');
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`;
      ctx.fillText(lv.name, x + 12, y + 48);

      ctx.fillStyle = '#64748B'; ctx.font = `700 11px ${FONT}`;
      const newMeta = lv.newType ? PASSENGER_META[lv.newType] : null;
      ctx.fillText(newMeta ? `登场：${newMeta.name}` : `站台 ${Object.values(lv.pool).reduce((a, b) => a + b, 0)} 人`, x + 12, y + 70);

      if (unlocked) {
        ctx.fillStyle = '#0284C7'; ctx.font = `900 12px ${FONT}`;
        ctx.fillText(best > 0 ? `纪录 ${best} 分` : '点击开跑', x + 12, y + 108);
      } else {
        // 弱化低饱和试跑胶囊，不抢已解锁关卡视觉重心
        ctx.fillStyle = '#CBD5E1'; rrect(ctx, x + 12, y + 92, colW - 24, 24, 7); ctx.fill();
        drawIcon(ctx, 'videoAd', x + 28, y + 104, 12, '#475569');
        ctx.fillStyle = '#475569'; ctx.font = `800 11px ${FONT}`;
        ctx.fillText('提前试跑', x + 40, y + 108);
      }
      ctx.restore();

      this.addBox(unlocked ? 'select_level' : 'ad_trial_level', x, y, colW, rowH, { index: idx });
    });

    // 底部 3 大特色模式入口：每日专列 | 文明排队专列（严禁插队） | 无尽专列
    const footY = cy + 360;
    const modeGap = 12;
    const modeW = (cw - 56 - modeGap * 2) / 3;

    // 1) 每日极限专列
    const m1x = cx + 28;
    this.drawBtn3D(ctx, m1x, footY, modeW, 88, {
      topFill: '#38BDF8', fill: '#0284C7', lip: '#075985', radius: 16, depth: 5,
    });
    drawIcon(ctx, 'calendar', m1x + 26, footY + 42, 22, '#FEF08A');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF'; ctx.font = `900 17px ${FONT}`;
    ctx.fillText('每日极限专列', m1x + 48, footY + 36);
    ctx.fillStyle = '#E0F2FE'; ctx.font = `700 12px ${FONT}`;
    ctx.fillText('全服同图奇葩配比冲榜', m1x + 48, footY + 62);
    this.addBox('start_daily', m1x, footY, modeW, 88);

    // 2) 特色分流模式：左右分流专列（禁点车顶 · 左/右双键盲分流配重，直接开放！）
    const m2x = m1x + modeW + modeGap;
    this.drawBtn3D(ctx, m2x, footY, modeW, 88, {
      topFill: '#FBBF24', fill: '#D97706', lip: '#92400E', radius: 16, depth: 5,
    });
    drawIcon(ctx, 'train', m2x + 26, footY + 42, 22, '#FEF9C3');
    ctx.fillStyle = '#FFFFFF'; ctx.font = `900 17px ${FONT}`;
    ctx.fillText('左右分流专列', m2x + 48, footY + 36);
    ctx.fillStyle = '#FEF3C7'; ctx.font = `800 12px ${FONT}`;
    ctx.fillText('禁点车顶 · 左/右双键配重', m2x + 48, footY + 62);
    this.addBox('start_strict_queue', m2x, footY, modeW, 88);

    // 3) 无尽专列 · 轻肉鸽（与首页并列开放，随时可玩！）
    const endlessOpen = true;
    const m3x = m2x + modeW + modeGap;
    this.drawBtn3D(ctx, m3x, footY, modeW, 88, {
      topFill: endlessOpen ? '#4ADE80' : '#CBD5E1',
      fill: endlessOpen ? '#16A34A' : '#94A3B8',
      lip: endlessOpen ? '#14532D' : '#64748B',
      radius: 16, depth: 5,
    });
    drawIcon(ctx, endlessOpen ? 'infinity' : 'lock', m3x + 26, footY + 42, 22, endlessOpen ? '#FEF08A' : '#FFFFFF');
    ctx.fillStyle = '#FFFFFF'; ctx.font = `900 17px ${FONT}`;
    ctx.fillText(endlessOpen ? '无尽专列 · 肉鸽' : '无尽（5关解锁）', m3x + 48, footY + 36);
    ctx.fillStyle = endlessOpen ? '#DCFCE7' : '#F1F5F9'; ctx.font = `700 12px ${FONT}`;
    ctx.fillText(
      endlessOpen ? `纪录 ${progress.data.endlessBestWave} 站 · 三选一` : '过第5关 B 级解锁',
      m3x + 48, footY + 62
    );
    this.addBox('start_endless', m3x, footY, modeW, 88, { disabled: !endlessOpen });
    ctx.restore();
  }

  /** 车库弹窗（暖奶油插画风 + 试驾带 videoAd 图标） */
  drawGarageModal(ctx, progress, leftV, rightV) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const cw = 836; const ch = 480;
    const cx = (VW - cw) / 2; const cy = (VH - ch) / 2 + 8;
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 24, depth: 7 });
    ctx.fillStyle = '#F6EFE2';
    rrect(ctx, cx + 6, cy + 6, cw - 12, 54, 18); ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = INK; ctx.font = `900 22px ${FONT}`;
    ctx.fillText('列车车库 · 轻度改装与涂装', cx + 28, cy + 42);

    drawIcon(ctx, 'ticket', cx + 360, cy + 37, 17, '#D97706');
    ctx.fillStyle = '#B45309'; ctx.font = `900 16px ${MONO}`;
    ctx.fillText(`${progress.data.tickets} 车票`, cx + 376, cy + 43);
    ctx.fillStyle = '#64748B'; ctx.font = `800 13px ${FONT}`;
    ctx.fillText(`累计运达 ${progress.data.totalDelivered} 人`, cx + 492, cy + 43);

    this.drawBtn3D(ctx, cx + cw - 102, cy + 14, 78, 40, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 11, depth: 3, sheen: false });
    ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('关闭', cx + cw - 63, cy + 39);
    this.addBox('close_modal', cx + cw - 102, cy + 14, 78, 40);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569'; ctx.font = `900 14px ${FONT}`;
    ctx.fillText('车队改装（最高 Lv.5 · 升级后车厢将实时加装防滑护栏 / 黄金避震弹簧 / 氮气能量罐外观！）', cx + 28, cy + 78);

    const uw = 250; const uh = 136;
    UPGRADES.forEach((u, i) => {
      const ux = cx + 28 + i * (uw + 15);
      const uy = cy + 90;
      const lv = progress.data.upgrades[u.id] || 0;
      const isMax = lv >= u.maxLv;
      const cost = isMax ? 0 : u.costs[lv];
      const canBuy = !isMax && progress.data.tickets >= cost;

      this.drawCard3D(ctx, ux, uy, uw, uh, { fill: '#FFFFFF', lip: '#CBD5E1', radius: 15, borderW: 2, depth: 4 });
      ctx.fillStyle = INK; ctx.font = `900 16px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText(u.name, ux + 14, uy + 28);
      ctx.fillStyle = '#0284C7'; ctx.font = `900 12px ${FONT}`;
      ctx.fillText(`Lv.${lv}/${u.maxLv} (${u.perLvText})`, ux + 14, uy + 48);
      ctx.fillStyle = '#64748B'; ctx.font = `700 12px ${FONT}`;
      ctx.fillText(u.desc, ux + 14, uy + 68);

      for (let k = 0; k < u.maxLv; k++) {
        ctx.fillStyle = k < lv ? '#FACC15' : '#E2E8F0';
        rrect(ctx, ux + 14 + k * 44, uy + 78, 38, 8, 4); ctx.fill();
      }

      this.drawBtn3D(ctx, ux + 14, uy + 94, uw - 28, 32, {
        fill: isMax ? '#E2E8F0' : (canBuy ? '#FACC15' : '#CBD5E1'),
        lip: isMax ? '#94A3B8' : (canBuy ? '#B45309' : '#94A3B8'),
        radius: 10, depth: 3, sheen: canBuy,
      });
      ctx.fillStyle = isMax ? '#64748B' : INK;
      ctx.font = `900 13px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(isMax ? '已满级' : `${cost} 车票升级`, ux + uw / 2, uy + 115);
      this.addBox('buy_upgrade', ux + 14, uy + 94, uw - 28, 32, { upgradeId: u.id, disabled: isMax });
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569'; ctx.font = `900 14px ${FONT}`;
    ctx.fillText('车头涂装（支持车票直接买断永久拥有，或累计运人解锁 / 看视频试驾 1 局）', cx + 28, cy + 260);

    const sw = 122; const sh = 176; const sgap = 9;
    TRAIN_SKINS.forEach((s, i) => {
      const sx = cx + 28 + i * (sw + sgap);
      const sy = cy + 272;
      const unlocked = progress.isSkinUnlocked(s.id);
      const active = progress.getActiveSkin().id === s.id;
      const isGrand = Boolean(s.unlockByFullAlbum);

      this.drawCard3D(ctx, sx, sy, sw, sh, {
        fill: active ? '#FEF9C3' : (isGrand ? '#FAF5FF' : '#FFFFFF'),
        lip: active ? '#D97706' : (isGrand ? '#7E22CE' : '#CBD5E1'),
        radius: 15, border: active ? '#B45309' : (isGrand ? '#7E22CE' : INK), borderW: active || isGrand ? 2.4 : 1.8, depth: 4,
      });

      ctx.fillStyle = s.bodyTop; rrect(ctx, sx + 12, sy + 14, sw - 24, 38, 8); ctx.fill();
      ctx.fillStyle = s.bodyBot; ctx.fillRect(sx + 12, sy + 39, sw - 24, 13);
      ctx.fillStyle = s.stripe; ctx.fillRect(sx + 14, sy + 23, sw - 28, 6);
      if (isGrand) {
        const gGrad = ctx.createLinearGradient(sx + 12, sy + 14, sx + sw - 12, sy + 52);
        gGrad.addColorStop(0, 'rgba(250,204,21,0.35)');
        gGrad.addColorStop(0.5, 'rgba(244,114,182,0.35)');
        gGrad.addColorStop(1, 'rgba(56,189,248,0.35)');
        ctx.fillStyle = gGrad;
        rrect(ctx, sx + 12, sy + 14, sw - 24, 38, 8); ctx.fill();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2; rrect(ctx, sx + 12, sy + 14, sw - 24, 38, 8); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = isGrand ? '#6B21A8' : INK; ctx.font = `900 12px ${FONT}`;
      ctx.fillText(s.name, sx + sw / 2, sy + 70);

      ctx.fillStyle = unlocked ? '#16A34A' : (isGrand ? '#9333EA' : '#64748B');
      ctx.font = `800 10px ${FONT}`;
      ctx.fillText(
        unlocked ? (isGrand ? '全图鉴专属' : '已永久拥有') : (isGrand ? '24/24 图鉴限定' : `运 ${s.unlockTotal} 人或车票买断`),
        sx + sw / 2, sy + 88
      );

      if (!unlocked && !isGrand && s.ticketCost > 0) {
        const canBuySkin = progress.data.tickets >= s.ticketCost;
        this.drawBtn3D(ctx, sx + 10, sy + 98, sw - 20, 30, {
          fill: canBuySkin ? '#FACC15' : '#E2E8F0',
          lip: canBuySkin ? '#B45309' : '#94A3B8',
          radius: 9, depth: 3, sheen: canBuySkin,
        });
        ctx.fillStyle = canBuySkin ? INK : '#64748B';
        ctx.font = `900 11px ${FONT}`;
        ctx.fillText(`${s.ticketCost}票永久买断`, sx + sw / 2, sy + 117);
        this.addBox('buy_skin_tickets', sx + 10, sy + 98, sw - 20, 30, { skinId: s.id });

        this.drawBtn3D(ctx, sx + 10, sy + 135, sw - 20, 28, {
          fill: active ? '#22C55E' : CREAM_SUB,
          lip: active ? '#15803D' : '#B8ACA0',
          radius: 9, depth: 2, sheen: false,
        });
        if (!active) drawIcon(ctx, 'videoAd', sx + 22, sy + 149, 10, '#64748B');
        ctx.fillStyle = active ? '#FFFFFF' : '#475569';
        ctx.font = `800 10.5px ${FONT}`;
        ctx.fillText(active ? '本局试驾中' : '试驾 1 局', sx + sw / 2 + (!active ? 6 : 0), sy + 153);
        this.addBox('ad_trial_skin', sx + 10, sy + 135, sw - 20, 28, { skinId: s.id, disabled: active });
      } else {
        this.drawBtn3D(ctx, sx + 10, sy + 124, sw - 20, 34, {
          fill: active ? '#22C55E' : (isGrand && !unlocked ? '#F3E8FF' : CREAM_SUB),
          lip: active ? '#15803D' : (isGrand && !unlocked ? '#9333EA' : '#B8ACA0'),
          radius: 10, depth: 3, sheen: false,
        });
        ctx.fillStyle = active ? '#FFFFFF' : (isGrand && !unlocked ? '#6B21A8' : (unlocked ? INK : '#475569'));
        ctx.font = `800 11.5px ${FONT}`;
        ctx.fillText(
          active ? '使用中' : (unlocked ? '换上' : '去集卡牌'),
          sx + sw / 2,
          sy + 145
        );
        const boxId = unlocked ? 'equip_skin' : 'open_achievements';
        this.addBox(boxId, sx + 10, sy + 124, sw - 20, 34, { skinId: s.id, disabled: active });
      }
    });

    ctx.restore();
  }

  /** 无尽专列站间三选一安全强化词条弹窗（展示角色外观进化预告 + 支持大满贯特权或 30 车票刷新词条！） */
  drawPerksModal(ctx, world, choices = [], leftV = 0, rightV = VW, rerollLeft = 0, progress = null) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const hasFreeReroll = rerollLeft > 0;
    const tickets = progress && progress.data ? progress.data.tickets : 0;
    const cw = 770; const ch = 424;
    const cx = (VW - cw) / 2; const cy = (VH - ch) / 2;
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 24, depth: 7 });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#15803D'; ctx.font = `900 24px ${FONT}`;
    ctx.fillText(`准备驶入无尽第 ${(world.level.wave || 1) + 1} 站 · 选择 1 项强化`, VW / 2, cy + 44);
    ctx.fillStyle = '#475569'; ctx.font = `800 13px ${FONT}`;
    ctx.fillText(`当前存活 ${world.finalCount} 位乘客全部留在车上继续闯关！（对应角色将获得专属进化外观）`, VW / 2, cy + 70);

    const cardW = 222; const cardH = 242; const gap = 20;
    const startX = cx + (cw - (cardW * 3 + gap * 2)) / 2;
    choices.forEach((pk, i) => {
      const x = startX + i * (cardW + gap);
      const y = cy + 92;
      const curLv = world.getPerkLevel ? world.getPerkLevel(pk.id) : 0;
      const nextLv = curLv + 1;
      this.drawCard3D(ctx, x, y, cardW, cardH, { fill: '#FFFFFF', lip: '#CBD5E1', radius: 18, border: INK, depth: 5 });
      ctx.fillStyle = pk.color;
      rrect(ctx, x + 4, y + 4, cardW - 8, 12, 6); ctx.fill();

      if (curLv > 0) {
        ctx.fillStyle = '#FEF3C7';
        rrect(ctx, x + cardW - 76, y + 20, 66, 20, 10); ctx.fill();
        ctx.strokeStyle = '#D97706'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#B45309'; ctx.font = `900 10.5px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`升至 Lv.${nextLv}`, x + cardW - 43, y + 34);
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = INK; ctx.font = `900 20px ${FONT}`;
      ctx.fillText(pk.name, x + cardW / 2, y + 58);

      ctx.fillStyle = '#475569'; ctx.font = `800 13.5px ${FONT}`;
      ctx.fillText(pk.desc, x + cardW / 2, y + 96);

      if (pk.evolveTag) {
        ctx.fillStyle = '#FEF9C3';
        rrect(ctx, x + 14, y + 116, cardW - 28, 28, 9); ctx.fill();
        ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = '#B45309'; ctx.font = `900 11px ${FONT}`;
        ctx.fillText(`${pk.evolveTag}`, x + cardW / 2, y + 134);
      }

      this.drawBtn3D(ctx, x + 24, y + 168, cardW - 48, 44, { fill: pk.color, lip: '#334155', radius: 12, depth: 4 });
      ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`;
      ctx.fillText(curLv > 0 ? `叠加强化 (Lv.${nextLv})` : '就选这个！', x + cardW / 2, y + 195);
      this.addBox('pick_perk', x, y, cardW, cardH, { perkId: pk.id });
    });

    const rw = 340; const rh = 42;
    const rx = Math.round((VW - rw) / 2);
    const ry = cy + ch - 58;
    const canTicketReroll = tickets >= 30;
    this.drawBtn3D(ctx, rx, ry, rw, rh, {
      topFill: hasFreeReroll || canTicketReroll ? '#FDE047' : '#E2E8F0',
      fill: hasFreeReroll || canTicketReroll ? '#F59E0B' : '#CBD5E1',
      lip: hasFreeReroll || canTicketReroll ? '#B45309' : '#94A3B8',
      radius: 13, depth: 4,
    });
    ctx.fillStyle = hasFreeReroll || canTicketReroll ? INK : '#64748B';
    ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(
      hasFreeReroll
        ? `全图鉴大满贯特权 · 免费换一批词条 (剩余 ${rerollLeft} 次)`
        : `花 30 车票 · 换一批词条 (当前 ${tickets} 票)`,
      VW / 2, ry + 26
    );
    this.addBox(hasFreeReroll ? 'reroll_perks' : 'reroll_perks_tickets', rx, ry, rw, rh);
    ctx.restore();
  }

  /** 今日 3 项小目标轻量次留弹窗（零复杂系统，2 分钟可完成领车票！） */
  drawMissionsModal(ctx, progress, leftV, rightV) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const cw = 600; const ch = 368;
    const cx = (VW - cw) / 2; const cy = (VH - ch) / 2 + 6;
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 24, depth: 7 });
    ctx.fillStyle = '#F6EFE2';
    rrect(ctx, cx + 6, cy + 6, cw - 12, 72, 18); ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = INK; ctx.font = `900 22px ${FONT}`;
    ctx.fillText('今日早高峰小目标', cx + 28, cy + 40);
    ctx.fillStyle = '#64748B'; ctx.font = `800 13px ${FONT}`;
    ctx.fillText('每日零点刷新 · 完成领取车票改装列车', cx + 28, cy + 64);

    this.drawBtn3D(ctx, cx + cw - 102, cy + 16, 78, 40, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 11, depth: 3, sheen: false });
    ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('关闭', cx + cw - 63, cy + 41);
    this.addBox('close_modal', cx + cw - 102, cy + 16, 78, 40);

    const missions = progress.getDailyMissionStates();
    missions.forEach((m, idx) => {
      const y = cy + 88 + idx * 86;
      const rw = cw - 56;
      this.drawCard3D(ctx, cx + 28, y, rw, 74, {
        fill: m.ready ? '#FEF9C3' : '#FFFFFF',
        lip: m.ready ? '#D97706' : '#CBD5E1',
        radius: 15, border: m.ready ? '#B45309' : INK, borderW: 2, depth: 4,
      });

      ctx.textAlign = 'left';
      ctx.fillStyle = INK; ctx.font = `900 16px ${FONT}`;
      ctx.fillText(m.title, cx + 44, y + 31);

      // 进度条
      const barX = cx + 44; const barY = y + 44; const barW = 280;
      ctx.fillStyle = '#E2E8F0'; rrect(ctx, barX, barY, barW, 12, 6); ctx.fill();
      const ratio = Math.min(1, m.cur / Math.max(1, m.target));
      ctx.fillStyle = m.claimed ? '#94A3B8' : (m.ready ? '#22C55E' : '#0EA5E9');
      if (ratio > 0) { rrect(ctx, barX, barY, Math.max(12, barW * ratio), 12, 6); ctx.fill(); }
      ctx.fillStyle = '#475569'; ctx.font = `900 13px ${MONO}`;
      ctx.fillText(`${m.cur}/${m.target}`, barX + barW + 10, barY + 11);

      // 右侧领奖按钮
      const bx = cx + 28 + rw - 130; const by = y + 16;
      if (m.claimed) {
        this.drawBtn3D(ctx, bx, by, 114, 42, { fill: '#E2E8F0', lip: '#94A3B8', radius: 11, depth: 3, sheen: false });
        ctx.fillStyle = '#64748B'; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('已领取', bx + 57, by + 26);
      } else if (m.ready) {
        this.drawBtn3D(ctx, bx, by, 114, 42, { topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 11, depth: 4 });
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`领 +${m.reward} 票`, bx + 57, by + 26);
        this.addBox('claim_mission', bx, by, 114, 42, { missionId: m.id });
      } else {
        this.drawBtn3D(ctx, bx, by, 114, 42, { fill: CREAM_SUB, lip: '#CBD5E1', radius: 11, depth: 3, sheen: false });
        ctx.fillStyle = '#B45309'; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`+${m.reward} 票`, bx + 57, by + 26);
      }
    });
    ctx.restore();
  }

  /** 24 张成就称号卡牌的专属漫画微缩插画（仅解锁后翻牌可见！） */
  drawAchievementCardArt(ctx, id, x, y, w, h) {
    ctx.save();
    rrect(ctx, x, y, w, h, 10);
    ctx.clip();

    const cx = x + w / 2;
    const cy = y + h / 2;
    const s = Math.min(w / 160, h / 90);

    // 默认明快天空/铁轨底图
    const isNight = id === 'air_time' || id === 'sky_rocket' || id === 'ss_legend' || id === 'akina_god';
    const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
    if (isNight) {
      bgGrad.addColorStop(0, '#1E1B4B');
      bgGrad.addColorStop(1, '#312E81');
    } else if (id === 'yi_jian_mei' || id === 'flower_rain' || id === 'one_point_shy') {
      bgGrad.addColorStop(0, '#FEF2F2');
      bgGrad.addColorStop(1, '#FECACA');
    } else if (id === 'rich_boss' || id === 'steady_dog' || id === 'full_house') {
      bgGrad.addColorStop(0, '#FEF9C3');
      bgGrad.addColorStop(1, '#FDE68A');
    } else {
      bgGrad.addColorStop(0, '#DBEAFE');
      bgGrad.addColorStop(1, '#EFF6FF');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(x, y, w, h);

    // 柔和放射背景光斑
    ctx.fillStyle = isNight ? 'rgba(250,204,21,0.16)' : 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.42, 0, Math.PI * 2); ctx.fill();

    // 底部微缩铁轨/地面线
    const drawRail = (ry) => {
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, ry, w, Math.max(4, 5 * s));
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(x, ry, w, 1.5);
    };
    const drawMiniTrain = (tx, ty, tw, th, col = '#DC2626') => {
      ctx.fillStyle = col;
      rrect(ctx, tx, ty, tw, th, 6 * s); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 2 * s); ctx.stroke();
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(tx + 2, ty + th * 0.22, tw - 4, Math.max(3, 4 * s));
      // 车轮
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(tx + tw * 0.24, ty + th + 2 * s, 6 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx + tw * 0.76, ty + th + 2 * s, 6 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };

    switch (id) {
      case 'under_car': {
        drawRail(y + h - 10 * s);
        drawMiniTrain(cx - 56 * s, y + 8 * s, 112 * s, 36 * s);
        drawPortrait(ctx, 'thin', cx, y + h - 22 * s, 0.78 * s);
        ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(cx - 34 * s, y + h - 24 * s); ctx.lineTo(cx - 18 * s, y + h - 24 * s); ctx.stroke();
        break;
      }
      case 'fly_higher': {
        drawMiniTrain(cx - 46 * s, y + h - 22 * s, 92 * s, 20 * s);
        const types = ['fat', 'thin', 'acrobat', 'thin'];
        types.forEach((t, i) => drawPortrait(ctx, t, cx + (i % 2 === 0 ? -3 : 3) * s, y + h - (31 + i * 16) * s, 0.56 * s));
        break;
      }
      case 'yi_jian_mei': {
        // 桥洞横梁 + 三人起飞火花
        ctx.fillStyle = '#475569';
        ctx.fillRect(x, y, w, 24 * s);
        ctx.fillStyle = '#FACC15';
        for (let bx = x; bx < x + w; bx += 20 * s) ctx.fillRect(bx, y + 18 * s, 10 * s, 6 * s);
        drawPortrait(ctx, 'tall', cx - 36 * s, cy + 14 * s, 0.72 * s);
        drawPortrait(ctx, 'thin', cx, cy + 8 * s, 0.72 * s);
        drawPortrait(ctx, 'fat', cx + 36 * s, cy + 15 * s, 0.72 * s);
        ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 2.5 * s;
        ctx.beginPath(); ctx.moveTo(x + 14 * s, y + 30 * s); ctx.lineTo(x + w - 14 * s, y + 30 * s); ctx.stroke();
        break;
      }
      case 'wind_north': {
        ctx.strokeStyle = '#0EA5E9'; ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const wy = y + (16 + i * 18) * s;
          ctx.beginPath(); ctx.moveTo(x + 12 * s, wy); ctx.quadraticCurveTo(cx, wy - 7 * s, x + w - 14 * s, wy); ctx.stroke();
        }
        drawPortrait(ctx, 'thin', cx - 22 * s, cy + 12 * s, 0.85 * s);
        drawPortrait(ctx, 'fat', cx + 22 * s, cy + 14 * s, 0.85 * s);
        break;
      }
      case 'akina_god': {
        drawRail(y + h - 12 * s);
        // 火焰尾气
        ctx.fillStyle = '#F97316';
        ctx.beginPath(); ctx.moveTo(cx - 32 * s, cy + 8 * s); ctx.lineTo(x + 8 * s, cy - 6 * s); ctx.lineTo(x + 16 * s, cy + 18 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FACC15';
        ctx.beginPath(); ctx.moveTo(cx - 28 * s, cy + 8 * s); ctx.lineTo(x + 20 * s, cy + 2 * s); ctx.lineTo(x + 24 * s, cy + 14 * s); ctx.closePath(); ctx.fill();
        drawMiniTrain(cx - 26 * s, cy - 10 * s, 80 * s, 34 * s);
        break;
      }
      case 'steady_dog': {
        drawMiniTrain(cx - 54 * s, y + h - 28 * s, 108 * s, 24 * s, '#16A34A');
        drawPortrait(ctx, 'fat', cx - 26 * s, y + h - 42 * s, 0.72 * s);
        drawPortrait(ctx, 'thin', cx, y + h - 42 * s, 0.72 * s);
        drawPortrait(ctx, 'vip', cx + 26 * s, y + h - 42 * s, 0.72 * s);
        drawIcon(ctx, 'check', cx, y + 16 * s, 16 * s, '#16A34A');
        break;
      }
      case 'basket_hero': {
        drawPortrait(ctx, 'auntie', cx, cy + 10 * s, 1.0 * s);
        // 左右大菜篮 + 兜住的小人
        ctx.fillStyle = '#F59E0B'; ctx.strokeStyle = INK; ctx.lineWidth = 2 * s;
        rrect(ctx, cx - 60 * s, cy + 8 * s, 32 * s, 18 * s, 6 * s); ctx.fill(); ctx.stroke();
        rrect(ctx, cx + 28 * s, cy + 8 * s, 32 * s, 18 * s, 6 * s); ctx.fill(); ctx.stroke();
        drawPortrait(ctx, 'thin', cx - 44 * s, cy - 2 * s, 0.62 * s);
        drawPortrait(ctx, 'acrobat', cx + 44 * s, cy - 2 * s, 0.62 * s);
        break;
      }
      case 'rich_boss': {
        drawPortrait(ctx, 'vip', cx - 38 * s, cy + 10 * s, 0.85 * s);
        drawPortrait(ctx, 'vip', cx, cy + 2 * s, 1.02 * s);
        drawPortrait(ctx, 'vip', cx + 38 * s, cy + 10 * s, 0.85 * s);
        drawIcon(ctx, 'star', cx - 54 * s, y + 18 * s, 12 * s, '#F59E0B');
        drawIcon(ctx, 'star', cx + 54 * s, y + 18 * s, 12 * s, '#F59E0B');
        break;
      }
      case 'spider_job': {
        // 车门竖框 + 扒门挂壁娃
        drawMiniTrain(cx - 56 * s, cy - 22 * s, 112 * s, 52 * s);
        ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.moveTo(cx - 26 * s, cy - 12 * s); ctx.lineTo(cx - 26 * s, cy + 24 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 26 * s, cy - 12 * s); ctx.lineTo(cx + 26 * s, cy + 24 * s); ctx.stroke();
        drawPortrait(ctx, 'acrobat', cx - 26 * s, cy + 4 * s, 0.78 * s);
        drawPortrait(ctx, 'acrobat', cx + 26 * s, cy + 4 * s, 0.78 * s);
        break;
      }
      case 'queue_god': {
        drawRail(y + h - 10 * s);
        ['thin', 'fat', 'acrobat', 'auntie'].forEach((t, i) => {
          drawPortrait(ctx, t, cx - 42 * s + i * 28 * s, cy + 14 * s, 0.72 * s);
        });
        drawIcon(ctx, 'trophy', cx, y + 18 * s, 18 * s, '#F59E0B');
        break;
      }
      case 'lone_wolf': {
        drawRail(y + h - 12 * s);
        drawMiniTrain(cx - 52 * s, y + h - 40 * s, 104 * s, 26 * s, '#64748B');
        drawPortrait(ctx, 'thin', cx, y + h - 54 * s, 0.82 * s);
        break;
      }
      case 'astro_arm': {
        drawPortrait(ctx, 'tall', cx - 30 * s, cy + 8 * s, 0.92 * s);
        ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 12 * s, cy + 8 * s); ctx.quadraticCurveTo(cx + 12 * s, cy - 14 * s, cx + 32 * s, cy); ctx.stroke();
        drawPortrait(ctx, 'thin', cx + 38 * s, cy - 2 * s, 0.72 * s);
        break;
      }
      case 'air_time': {
        // 星空漂浮
        ctx.fillStyle = '#FEF08A';
        for (let i = 0; i < 6; i++) {
          ctx.beginPath(); ctx.arc(x + (18 + i * 26) * s, y + (14 + (i % 2) * 18) * s, 2.2 * s, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(cx - 40 * s, y + h - 12 * s); ctx.quadraticCurveTo(cx, y + 8 * s, cx + 40 * s, cy + 8 * s); ctx.stroke();
        ctx.setLineDash([]);
        drawPortrait(ctx, 'thin', cx, cy - 2 * s, 0.9 * s);
        break;
      }
      case 'sky_rocket': {
        ctx.fillStyle = '#F97316';
        ctx.beginPath(); ctx.moveTo(cx, cy + 6 * s); ctx.lineTo(cx - 12 * s, y + h); ctx.lineTo(cx + 12 * s, y + h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath(); ctx.moveTo(cx, cy + 12 * s); ctx.lineTo(cx - 6 * s, y + h); ctx.lineTo(cx + 6 * s, y + h); ctx.closePath(); ctx.fill();
        drawPortrait(ctx, 'thin', cx, cy - 8 * s, 0.9 * s);
        break;
      }
      case 'titanic': {
        drawRail(y + h - 10 * s);
        drawMiniTrain(x - 10 * s, y + h - 40 * s, 96 * s, 28 * s);
        drawPortrait(ctx, 'thin', x + 94 * s, y + h - 42 * s, 0.88 * s);
        ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(x + 114 * s, cy - 6 * s); ctx.lineTo(x + w - 10 * s, cy - 6 * s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 118 * s, cy + 6 * s); ctx.lineTo(x + w - 14 * s, cy + 6 * s); ctx.stroke();
        break;
      }
      case 'tail_hanger': {
        drawRail(y + h - 10 * s);
        drawMiniTrain(x + w - 86 * s, y + h - 40 * s, 96 * s, 28 * s);
        drawPortrait(ctx, 'acrobat', x + w - 98 * s, y + h - 30 * s, 0.88 * s);
        break;
      }
      case 'spin_round': {
        ctx.strokeStyle = '#EC4899'; ctx.lineWidth = 2.5 * s;
        ctx.beginPath(); ctx.arc(cx, cy, 26 * s, 0.3, Math.PI * 1.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 34 * s, Math.PI * 0.6, Math.PI * 2.1); ctx.stroke();
        drawPortrait(ctx, 'thin', cx, cy, 0.88 * s);
        break;
      }
      case 'flower_rain': {
        const pts = [[-44, -12, 'thin'], [-16, 14, 'fat'], [14, -14, 'acrobat'], [42, 12, 'tall'], [0, 2, 'auntie']];
        pts.forEach(([dx, dy, t]) => drawPortrait(ctx, t, cx + dx * s, cy + dy * s, 0.62 * s));
        break;
      }
      case 'air_jordan': {
        ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 2.5 * s; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(cx - 44 * s, cy + 16 * s); ctx.quadraticCurveTo(cx, y + 6 * s, cx + 38 * s, cy + 12 * s); ctx.stroke();
        ctx.setLineDash([]);
        drawPortrait(ctx, 'thin', cx, cy - 10 * s, 0.78 * s);
        drawPortrait(ctx, 'auntie', cx + 42 * s, cy + 14 * s, 0.78 * s);
        break;
      }
      case 'one_point_shy': {
        ctx.fillStyle = '#EF4444'; ctx.font = `900 ${Math.round(34 * s)}px ${MONO}`; ctx.textAlign = 'center';
        ctx.fillText('-1', cx - 22 * s, cy + 12 * s);
        drawPortrait(ctx, 'thin', cx + 26 * s, cy + 4 * s, 0.95 * s);
        break;
      }
      case 'full_house': {
        drawMiniTrain(cx - 56 * s, y + h - 26 * s, 112 * s, 22 * s);
        const crew = ['fat', 'auntie', 'tall', 'acrobat', 'vip'];
        crew.forEach((t, i) => drawPortrait(ctx, t, cx - 40 * s + i * 20 * s, y + h - 38 * s, 0.64 * s));
        ctx.fillStyle = '#16A34A'; ctx.font = `900 ${Math.round(13 * s)}px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('全员发车', cx, y + 18 * s);
        break;
      }
      case 'ss_legend': {
        ctx.fillStyle = '#FACC15'; ctx.font = `900 ${Math.round(36 * s)}px ${MONO}`; ctx.textAlign = 'center';
        ctx.fillText('SS', cx, cy + 12 * s);
        drawIcon(ctx, 'star', cx - 44 * s, cy - 10 * s, 14 * s, '#FDE047');
        drawIcon(ctx, 'star', cx + 44 * s, cy - 10 * s, 14 * s, '#FDE047');
        drawIcon(ctx, 'trophy', cx, y + 16 * s, 16 * s, '#F59E0B');
        break;
      }
      case 'fat_wall': {
        drawMiniTrain(cx - 56 * s, y + h - 22 * s, 112 * s, 20 * s);
        for (let i = 0; i < 4; i++) {
          drawPortrait(ctx, 'fat', cx - 36 * s + i * 24 * s, y + h - 34 * s, 0.68 * s);
        }
        drawPortrait(ctx, 'fat', cx - 14 * s, y + h - 52 * s, 0.64 * s);
        drawPortrait(ctx, 'fat', cx + 14 * s, y + h - 52 * s, 0.64 * s);
        break;
      }
      case 'crouch_master': {
        // 极低桥洞 + 丝滑低头通过
        ctx.fillStyle = '#334155';
        ctx.fillRect(x, y, w, 26 * s);
        ctx.fillStyle = '#FACC15';
        for (let bx = x; bx < x + w; bx += 18 * s) ctx.fillRect(bx, y + 20 * s, 9 * s, 6 * s);
        drawMiniTrain(cx - 50 * s, y + h - 22 * s, 100 * s, 18 * s, '#0284C7');
        drawPortrait(ctx, 'thin', cx - 24 * s, y + h - 32 * s, 0.64 * s);
        drawPortrait(ctx, 'tall', cx, y + h - 32 * s, 0.64 * s);
        drawPortrait(ctx, 'fat', cx + 24 * s, y + h - 32 * s, 0.64 * s);
        break;
      }
      default: {
        drawIcon(ctx, 'trophy', cx, cy, 24 * s, '#F59E0B');
        break;
      }
    }
    ctx.restore();
  }

  /** 绘制单张称号收藏卡（未获得=神秘盖背卡；已获得待翻=金光抖动待翻卡；已翻开=专属插画正面卡 + 3D 翻牌动画！） */
  drawTitleCard(ctx, a, index, x, y, w, h, { large = false, set = null } = {}) {
    const numStr = `#${String(index + 1).padStart(2, '0')}`;
    const rar = a.rarity || 1;
    const rarTxt = rar >= 3 ? 'SSR' : rar === 2 ? 'SR' : 'R';
    const setCol = (set && set.color) || '#FACC15';
    const rarTheme = rar >= 3
      ? { fill: '#FAF5FF', top: '#F3E8FF', border: '#7E22CE', lip: '#6B21A8', badge: '#9333EA', title: '#6B21A8' }
      : rar === 2
        ? { fill: '#FFFBEB', top: '#FEF3C7', border: '#B45309', lip: '#D97706', badge: '#EA580C', title: '#B45309' }
        : { fill: '#F0F9FF', top: '#E0F2FE', border: '#0369A1', lip: '#0284C7', badge: '#0284C7', title: '#0369A1' };

    const flip = !large && this.achFlipAnim && this.achFlipAnim.id === a.id ? this.achFlipAnim : null;
    const flipMid = 0.42;
    let flipProg = 0;
    let showBack = !a.unlocked;
    let isPendingBack = Boolean(a.pendingFlip);

    ctx.save();
    if (flip) {
      flipProg = Math.min(1, flip.t / Math.max(0.01, flip.dur));
      const cx = x + w / 2;
      const cy = y + h / 2;
      if (flipProg < flipMid) {
        showBack = true;
        isPendingBack = true;
        const k = flipProg / flipMid;
        const sx = Math.max(0.04, Math.cos(k * (Math.PI / 2)));
        const sy = 1 + 0.14 * Math.sin(k * (Math.PI / 2));
        ctx.translate(cx, cy);
        ctx.scale(sx, sy);
        ctx.translate(-cx, -cy);
      } else {
        showBack = false;
        if (!flip.burstDone) {
          flip.burstDone = true;
          this.spawnFlipSparks(cx, cy, flip.reward);
        }
        const k = (flipProg - flipMid) / (1 - flipMid);
        const sx = Math.max(0.04, Math.sin(k * (Math.PI / 2)));
        const bounce = k < 0.65 ? (1.14 - 0.17 * (k / 0.65)) : (0.97 + 0.03 * ((k - 0.65) / 0.35));
        ctx.translate(cx, cy);
        ctx.scale(sx, bounce);
        ctx.translate(-cx, -cy);
      }
    } else if (isPendingBack && !large) {
      // 待翻开的新卡：轻微呼吸放大 + 左右轻晃，强烈吸引玩家亲手点击翻牌！
      const cx = x + w / 2;
      const cy = y + h / 2;
      const wob = Math.sin(this.animTime * 6.8 + index * 1.3) * 0.024;
      const pulseSc = 1.0 + 0.022 * Math.sin(this.animTime * 5.2 + index);
      ctx.translate(cx, cy);
      ctx.rotate(wob);
      ctx.scale(pulseSc, pulseSc);
      ctx.translate(-cx, -cy);

      // 背后金色呼吸外发光
      const glowA = 0.25 + 0.20 * Math.sin(this.animTime * 6 + index);
      ctx.fillStyle = `rgba(250, 204, 21, ${glowA.toFixed(2)})`;
      rrect(ctx, x - 6, y - 6, w + 12, h + 12, 20);
      ctx.fill();
    }

    if (showBack) {
      // === 卡背状态（分「已获得待玩家亲手翻牌」与「尚未获得」两种视觉层级） ===
      this.drawCard3D(ctx, x, y, w, h, {
        fill: isPendingBack ? '#3B0764' : '#1E293B',
        lip: isPendingBack ? '#B45309' : '#0F172A',
        radius: large ? 20 : 15,
        border: isPendingBack ? '#FACC15' : setCol,
        borderW: isPendingBack ? 3.0 : 2.2,
        depth: large ? 6 : 4,
      });

      // 卡背斜向暗纹底图
      ctx.save();
      rrect(ctx, x + 7, y + 7, w - 14, h - 14, large ? 14 : 10);
      ctx.clip();
      const backGrad = ctx.createLinearGradient(x, y, x + w, y + h);
      if (isPendingBack) {
        backGrad.addColorStop(0, '#581C87');
        backGrad.addColorStop(0.5, '#B45309');
        backGrad.addColorStop(1, '#312E81');
      } else {
        backGrad.addColorStop(0, '#1E293B');
        backGrad.addColorStop(0.5, '#312E81');
        backGrad.addColorStop(1, '#1E293B');
      }
      ctx.fillStyle = backGrad;
      ctx.fillRect(x + 7, y + 7, w - 14, h - 14);

      ctx.strokeStyle = isPendingBack ? 'rgba(253, 224, 71, 0.18)' : 'rgba(250, 204, 21, 0.08)';
      ctx.lineWidth = 6;
      for (let d = -h; d < w + h; d += 18) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d + h, y + h);
        ctx.stroke();
      }
      ctx.restore();

      // 内圈装饰框
      ctx.strokeStyle = isPendingBack ? '#FDE047' : setCol;
      ctx.globalAlpha = isPendingBack ? 0.85 : 0.55;
      ctx.lineWidth = isPendingBack ? 2.0 : 1.6;
      rrect(ctx, x + 9, y + 9, w - 18, h - 18, large ? 13 : 9);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 顶部：卡牌编号 / 待翻标签 + 稀有度暗标
      if (isPendingBack) {
        ctx.fillStyle = '#EF4444';
        rrect(ctx, x + 12, y + 11, 78, 19, 6);
        ctx.fill();
        ctx.strokeStyle = '#FEF08A'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FEF08A';
        ctx.font = `900 10.5px ${FONT}`;
        ctx.fillText('待翻开!', x + 51, y + 24);
      } else {
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(253, 224, 71, 0.78)';
        ctx.font = `900 ${large ? 14 : 11}px ${MONO}`;
        ctx.fillText(numStr, x + 15, y + (large ? 30 : 24));
      }

      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      rrect(ctx, x + w - (large ? 56 : 46), y + (large ? 14 : 11), large ? 42 : 34, large ? 22 : 18, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = rar >= 3 ? '#E879F9' : rar === 2 ? '#FBBF24' : '#93C5FD';
      ctx.font = `900 ${large ? 12 : 10}px ${MONO}`;
      ctx.fillText(rarTxt, x + w - (large ? 35 : 29), y + (large ? 29 : 24));

      // 中央火漆徽章（待翻卡展示旋转金芒 + 「翻牌」，未获卡展示神秘「?」）
      const emblemY = y + h * 0.43;
      const emblemR = large ? 44 : 28;
      if (isPendingBack) {
        ctx.save();
        ctx.translate(x + w / 2, emblemY);
        ctx.rotate(this.animTime * 1.8);
        ctx.fillStyle = 'rgba(253, 224, 71, 0.26)';
        for (let i = 0; i < 8; i++) {
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(-6, -(emblemR + 16)); ctx.lineTo(6, -(emblemR + 16));
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      ctx.fillStyle = isPendingBack ? 'rgba(245, 158, 11, 0.42)' : 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath(); ctx.arc(x + w / 2, emblemY, emblemR + 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = isPendingBack ? '#FEF08A' : setCol; ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = isPendingBack ? '#F59E0B' : '#334155';
      ctx.beginPath(); ctx.arc(x + w / 2, emblemY, emblemR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = isPendingBack ? '#FFFFFF' : '#FACC15'; ctx.lineWidth = 2.2; ctx.stroke();

      ctx.fillStyle = isPendingBack ? '#1E293B' : '#FDE047';
      ctx.font = isPendingBack ? `900 ${large ? 20 : 15}px ${FONT}` : `900 ${large ? 40 : 26}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(isPendingBack ? '翻牌' : '?', x + w / 2, emblemY + (isPendingBack ? 5 : (large ? 14 : 9)));

      // 下部：提示文案 + 奖励胶囊
      ctx.fillStyle = isPendingBack ? '#FEF08A' : '#CBD5E1';
      ctx.font = `900 ${large ? 16 : 12.5}px ${FONT}`;
      ctx.fillText(isPendingBack ? '新卡牌已到手！' : '未翻开卡牌', x + w / 2, y + h - (large ? 64 : 46));

      ctx.fillStyle = isPendingBack ? '#FACC15' : 'rgba(250, 204, 21, 0.16)';
      rrect(ctx, x + 14, y + h - (large ? 48 : 34), w - 28, large ? 28 : 22, 8);
      ctx.fill();
      ctx.fillStyle = isPendingBack ? '#1E293B' : '#FDE047';
      ctx.font = `900 ${large ? 12 : 10.5}px ${FONT}`;
      ctx.fillText(
        isPendingBack ? `点此翻开 · 领 +${a.reward}票` : `翻牌奖 +${a.reward}票 · 点看线索`,
        x + w / 2, y + h - (large ? 29 : 19)
      );
      ctx.restore();
      return;
    }

    // === 已获得：翻开展示完整卡牌内容 ===
    this.drawCard3D(ctx, x, y, w, h, {
      fill: rarTheme.fill, lip: rarTheme.lip, radius: large ? 20 : 15, border: rarTheme.border, borderW: large ? 3 : 2.4, depth: large ? 7 : 4,
    });

    // 顶部彩色横条
    ctx.fillStyle = rarTheme.top;
    rrect(ctx, x + 4, y + 4, w - 8, large ? 42 : 28, large ? 15 : 11);
    ctx.fill();

    // 稀有度徽章 + 编号
    const badgeW = large ? 46 : 36;
    const badgeH = large ? 24 : 18;
    ctx.fillStyle = rarTheme.badge;
    rrect(ctx, x + 10, y + (large ? 12 : 8), badgeW, badgeH, 6);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 ${large ? 12 : 10}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(rarTxt, x + 10 + badgeW / 2, y + (large ? 28 : 21));

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748B';
    ctx.font = `900 ${large ? 13 : 10.5}px ${MONO}`;
    ctx.fillText(numStr, x + 14 + badgeW, y + (large ? 29 : 21));

    // 右上角累计达成次数角标
    const cntStr = a.count > 1 ? `×${a.count}` : '已收藏';
    const cntW = large ? 58 : 44;
    ctx.fillStyle = a.count >= 5 ? '#F59E0B' : '#16A34A';
    rrect(ctx, x + w - cntW - 10, y + (large ? 12 : 8), cntW, badgeH, 6);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 ${large ? 12 : 10}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(cntStr, x + w - 10 - cntW / 2, y + (large ? 28 : 21));

    // 中央专属漫画插画框
    const artX = x + (large ? 18 : 10);
    const artY = y + (large ? 52 : 35);
    const artW = w - (large ? 36 : 20);
    const artH = large ? 150 : 78;
    this.drawAchievementCardArt(ctx, a.id, artX, artY, artW, artH);
    ctx.strokeStyle = rarTheme.border;
    ctx.lineWidth = large ? 2.2 : 1.6;
    rrect(ctx, artX, artY, artW, artH, 10);
    ctx.stroke();

    // 称号正名（自适应字号防溢出）
    const titleY = artY + artH + (large ? 32 : 22);
    const titleStr = `《${a.title}》`;
    let tSz = large ? 22 : 14;
    ctx.font = `900 ${tSz}px ${FONT}`;
    while (tSz > (large ? 15 : 10.5) && ctx.measureText(titleStr).width > w - 18) {
      tSz -= 1;
      ctx.font = `900 ${tSz}px ${FONT}`;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = rarTheme.title;
    ctx.fillText(titleStr, x + w / 2, titleY);

    // 搞笑金句框
    const flavor = a.flavor || a.hint;
    const fBoxX = x + (large ? 18 : 10);
    const fBoxY = titleY + (large ? 12 : 8);
    const fBoxW = w - (large ? 36 : 20);
    const fBoxH = large ? 54 : (y + h - fBoxY - 9);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    rrect(ctx, fBoxX, fBoxY, fBoxW, fBoxH, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#475569';
    ctx.font = `700 ${large ? 13 : 10}px ${FONT}`;
    ctx.textAlign = 'center';
    const quote = `“${flavor}”`;
    const maxLineChars = large ? 18 : 13;
    if (quote.length <= maxLineChars) {
      ctx.fillText(quote, x + w / 2, fBoxY + fBoxH / 2 + 4);
    } else {
      let cut = Math.ceil(quote.length / 2);
      const commaIdx = quote.indexOf('，');
      if (commaIdx > 2 && commaIdx < quote.length - 3) cut = commaIdx + 1;
      else if (/[，。、！？]/.test(quote[cut])) cut += 1;
      ctx.fillText(quote.slice(0, cut), x + w / 2, fBoxY + (large ? 22 : 17));
      ctx.fillText(quote.slice(cut), x + w / 2, fBoxY + (large ? 41 : 32));
    }

    // 大图鉴赏额外信息区：所属套装 + 达成条件 + 统计
    if (large) {
      const infoY = fBoxY + fBoxH + 12;
      ctx.fillStyle = CREAM_SUB;
      rrect(ctx, fBoxX, infoY, fBoxW, 80, 10);
      ctx.fill();
      ctx.textAlign = 'left';
      if (set) {
        ctx.fillStyle = set.color; ctx.font = `900 12px ${FONT}`;
        ctx.fillText(`所属套装：${set.name}（${set.unlocked}/${set.total}）`, fBoxX + 12, infoY + 20);
      }
      ctx.fillStyle = '#64748B'; ctx.font = `800 11px ${FONT}`;
      ctx.fillText('达成条件', fBoxX + 12, infoY + 38);
      ctx.fillStyle = INK; ctx.font = `800 12px ${FONT}`;
      const hintTxt = a.hint.length > 20 ? `${a.hint.slice(0, 20)}…` : a.hint;
      ctx.fillText(hintTxt, fBoxX + 12, infoY + 55);
      ctx.fillStyle = '#B45309'; ctx.font = `900 11.5px ${MONO}`;
      ctx.fillText(`累计达成 ${a.count} 次  ·  首通奖励 +${a.reward} 车票`, fBoxX + 12, infoY + 72);
    }

    // SSR 卡专属柔和流动炫彩高光扫光（或刚翻开瞬间的金白揭晓闪光！）
    if (rar >= 3 || (flip && flipProg >= flipMid)) {
      ctx.save();
      rrect(ctx, x + 2, y + 2, w - 4, h - 4, large ? 18 : 13);
      ctx.clip();
      const sweep = flip
        ? (((flipProg - flipMid) / (1 - flipMid)) * 1.8 - 0.3)
        : (((this.animTime * 0.45 + index * 0.21) % 2.4) - 0.6);
      const sx = x + sweep * (w + h);
      const sheenGrad = ctx.createLinearGradient(sx - 34, y, sx + 34, y + h);
      sheenGrad.addColorStop(0, 'rgba(255,255,255,0)');
      sheenGrad.addColorStop(0.5, flip ? 'rgba(254, 240, 138, 0.68)' : 'rgba(255,255,255,0.28)');
      sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  /** 24 张热梗成就称号卡牌馆（3 页 × 2 套装 × 4 张竖卡 + 齐套领奖 + 24/24 大满贯终极大礼！） */
  drawAchievementsModal(ctx, progress, leftV, rightV) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const stat = progress.getAchievementStats();
    const sets = progress.getAchievementSetStates();
    const SETS_PER_PAGE = 2;
    const totalPages = Math.max(1, Math.ceil(sets.length / SETS_PER_PAGE));
    this.achPage = Math.max(0, Math.min(totalPages - 1, this.achPage));
    const pageSets = sets.slice(this.achPage * SETS_PER_PAGE, (this.achPage + 1) * SETS_PER_PAGE);
    const hasOverlay = Boolean(this.achInspectId || this.achGrandSlamOpen);

    const cw = 884; const ch = 586;
    const cx = (VW - cw) / 2; const cy = Math.round((VH - ch) / 2);
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 24, depth: 7 });
    ctx.fillStyle = '#F6EFE2';
    rrect(ctx, cx + 6, cy + 6, cw - 12, 54, 18); ctx.fill();

    drawIcon(ctx, 'trophy', cx + 36, cy + 34, 22, '#D97706');
    ctx.textAlign = 'left';
    ctx.fillStyle = INK; ctx.font = `900 20px ${FONT}`;
    ctx.fillText(`称号卡牌馆（${stat.unlocked}/${stat.total}）`, cx + 54, cy + 41);

    // 24/24 大满贯终极大礼宝箱按钮（常驻可预览，满 24/24 高亮可领！）
    const gsReady = progress.canClaimGrandSlam();
    const gsDone = progress.data.grandSlamClaimed;
    const gsBtnX = cx + 292;
    const gsBtnY = cy + 13;
    const gsBtnW = 210;
    const gsBtnH = 38;
    this.drawBtn3D(ctx, gsBtnX, gsBtnY, gsBtnW, gsBtnH, {
      topFill: gsReady ? '#FDE047' : (gsDone ? '#E9D5FF' : '#FEF3C7'),
      fill: gsReady ? '#F59E0B' : (gsDone ? '#9333EA' : '#FEF9C3'),
      lip: gsReady ? '#B45309' : (gsDone ? '#6B21A8' : '#D97706'),
      radius: 12, depth: 3, sheen: gsReady,
    });
    drawIcon(ctx, 'star', gsBtnX + 20, gsBtnY + 19, 14, gsDone ? '#FEF08A' : '#B45309');
    ctx.fillStyle = gsDone ? '#FFFFFF' : '#92400E';
    ctx.font = `900 12.5px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(
      gsReady ? '领 24/24 大满贯终极大礼!' : (gsDone ? '24/24 大满贯已达成' : `24/24 大满贯礼 (${stat.unlocked}/24)`),
      gsBtnX + 34, gsBtnY + 24
    );
    if (gsReady) {
      ctx.fillStyle = '#EF4444';
      ctx.beginPath(); ctx.arc(gsBtnX + gsBtnW - 6, gsBtnY + 4, 6, 0, Math.PI * 2); ctx.fill();
    }
    if (!hasOverlay) this.addBox('open_grand_slam', gsBtnX, gsBtnY, gsBtnW, gsBtnH);

    // 翻页控件
    if (totalPages > 1) {
      const nextX = cx + cw - 196;
      const prevX = nextX - 118;
      ctx.save();
      if (this.achPage <= 0) ctx.globalAlpha = 0.4;
      this.drawBtn3D(ctx, prevX, cy + 13, 72, 38, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 11, depth: 3, sheen: false });
      ctx.fillStyle = INK; ctx.font = `900 13.5px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('上页', prevX + 42, cy + 37);
    drawIcon(ctx, 'arrowLeft', prevX + 18, cy + 32, 9.5, INK);
      ctx.restore();
      if (!hasOverlay) this.addBox('ach_prev', prevX, cy + 13, 72, 38, { disabled: this.achPage <= 0 });

      ctx.fillStyle = '#475569'; ctx.font = `900 13px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(`${this.achPage + 1}/${totalPages}`, prevX + 95, cy + 37);

      ctx.save();
      if (this.achPage >= totalPages - 1) ctx.globalAlpha = 0.4;
      this.drawBtn3D(ctx, nextX, cy + 13, 72, 38, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 11, depth: 3, sheen: false });
      ctx.fillStyle = INK; ctx.font = `900 13.5px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('下页', nextX + 30, cy + 37);
    drawIcon(ctx, 'arrowRight', nextX + 54, cy + 32, 9.5, INK);
      ctx.restore();
      if (!hasOverlay) this.addBox('ach_next', nextX, cy + 13, 72, 38, { disabled: this.achPage >= totalPages - 1 });
    }

    this.drawBtn3D(ctx, cx + cw - 102, cy + 13, 78, 38, { fill: CREAM_SUB, lip: '#B8ACA0', radius: 11, depth: 3, sheen: false });
    ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('关闭', cx + cw - 63, cy + 37);
    if (!hasOverlay) this.addBox('close_modal', cx + cw - 102, cy + 13, 78, 38);

    // 2 排 = 2 个完整套装（每排顶部套装横条 + 4 张竖版卡）
    const cols = 4;
    const gx = 14;
    const cardW = Math.floor((cw - 56 - gx * (cols - 1)) / cols);
    const cardH = 204;
    const startX = cx + 28;
    const rowBlockH = 252;

    pageSets.forEach((set, rIdx) => {
      const rowY = cy + 68 + rIdx * rowBlockH;
      const barW = cw - 56;
      const barH = 30;

      // 套装主题横条
      ctx.fillStyle = set.claimed ? '#FEF3C7' : (set.ready ? '#DCFCE7' : '#F8FAFC');
      rrect(ctx, startX, rowY, barW, barH, 10); ctx.fill();
      ctx.strokeStyle = set.claimed ? '#F59E0B' : (set.ready ? '#22C55E' : '#CBD5E1');
      ctx.lineWidth = set.ready || set.claimed ? 1.8 : 1.2; ctx.stroke();

      // 套装色块名牌
      ctx.fillStyle = set.color;
      rrect(ctx, startX + 4, rowY + 4, 118, 22, 7); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(set.name, startX + 63, rowY + 19);

      // 套装简介 + 进度
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748B'; ctx.font = `700 12px ${FONT}`;
      ctx.fillText(set.desc, startX + 132, rowY + 19);

      ctx.fillStyle = INK; ctx.font = `900 12px ${MONO}`;
      ctx.fillText(`已翻 ${set.unlocked}/${set.total}`, startX + 320, rowY + 19);

      // 待翻开提示 或 3/4 听牌提示！
      if (set.pendingCount > 0) {
        const pulse = 0.85 + Math.sin(this.animTime * 7) * 0.15;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#EA580C';
        rrect(ctx, startX + 394, rowY + 5, 112, 20, 7); ctx.fill();
        ctx.fillStyle = '#FEF08A'; ctx.font = `900 11px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`有 ${set.pendingCount} 张待翻开!`, startX + 450, rowY + 19);
        ctx.restore();
      } else if (set.unlocked === set.total - 1) {
        const pulse = 0.85 + Math.sin(this.animTime * 6) * 0.15;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#EF4444';
        rrect(ctx, startX + 394, rowY + 5, 98, 20, 7); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 11px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('差 1 张齐套！', startX + 443, rowY + 19);
        ctx.restore();
      }

      // 右侧齐套奖励状态/领取按钮
      if (set.ready) {
        const cbx = startX + barW - 134;
        this.drawBtn3D(ctx, cbx, rowY + 2, 130, 26, {
          topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 8, depth: 2,
        });
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`领齐套 +${set.reward}票`, cbx + 65, rowY + 19);
        if (!hasOverlay) this.addBox('claim_ach_set', cbx, rowY + 2, 130, 26, { setId: set.id });
      } else if (set.claimed) {
        ctx.fillStyle = '#F59E0B';
        rrect(ctx, startX + barW - 110, rowY + 4, 104, 22, 7); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 11.5px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('已集齐领奖', startX + barW - 58, rowY + 19);
      } else {
        ctx.fillStyle = CREAM_SUB;
        rrect(ctx, startX + barW - 118, rowY + 4, 112, 22, 7); ctx.fill();
        ctx.fillStyle = '#B45309'; ctx.font = `900 11.5px ${MONO}`; ctx.textAlign = 'center';
        ctx.fillText(`齐套奖 +${set.reward}票`, startX + barW - 62, rowY + 19);
      }

      // 该套装的 4 张卡牌
      const cardY = rowY + 36;
      set.cards.forEach((a, col) => {
        const globalIdx = stat.list.findIndex((it) => it.id === a.id);
        const x = startX + col * (cardW + gx);
        this.drawTitleCard(ctx, a, globalIdx >= 0 ? globalIdx : col, x, cardY, cardW, cardH, { large: false, set });
        if (!hasOverlay && !this.achFlipAnim) {
          this.addBox('inspect_ach_card', x, cardY, cardW, cardH, {
            achId: a.id,
            unlocked: a.unlocked,
            pendingFlip: a.pendingFlip,
            index: globalIdx >= 0 ? globalIdx : col,
          });
        }
      });
    });

    // 翻牌瞬间的爆发星芒、冲击波光圈与车票飘字特效
    if (this.achFlipSparks.length > 0) {
      for (const sp of this.achFlipSparks) {
        const a = Math.max(0, Math.min(1, sp.life / Math.max(0.01, sp.max)));
        ctx.save();
        ctx.globalAlpha = a;
        if (sp.kind === 'spark') {
          ctx.fillStyle = sp.col;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (sp.kind === 'ring') {
          ctx.strokeStyle = sp.col;
          ctx.lineWidth = 4 * a;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (sp.kind === 'pop') {
          ctx.font = `900 18px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.strokeText(sp.text, sp.x, sp.y);
          ctx.fillStyle = '#FDE047';
          ctx.fillText(sp.text, sp.x, sp.y);
        }
        ctx.restore();
      }
    }

    // 浮层 1：单卡大图鉴赏
    if (this.achInspectId) {
      const targetIdx = stat.list.findIndex((it) => it.id === this.achInspectId);
      const target = targetIdx >= 0 ? stat.list[targetIdx] : null;
      const targetSet = target ? sets.find((s) => s.id === target.setId) : null;
      if (target && target.unlocked) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.58)';
        ctx.fillRect(leftV, 0, rightV - leftV, VH);
        this.addBox('close_ach_inspect', leftV, 0, rightV - leftV, VH);

        const bigW = 324;
        const bigH = 456;
        const bigX = Math.round((VW - bigW) / 2);
        const bigY = Math.round((VH - bigH) / 2) - 20;
        this.drawTitleCard(ctx, target, targetIdx, bigX, bigY, bigW, bigH, { large: true, set: targetSet });

        const btnW = 160; const btnH = 44;
        const btnX = Math.round((VW - btnW) / 2);
        const btnY = bigY + bigH + 14;
        this.drawBtn3D(ctx, btnX, btnY, btnW, btnH, {
          topFill: '#FDE047', fill: '#F59E0B', lip: '#B45309', radius: 13, depth: 4,
        });
        ctx.fillStyle = INK; ctx.font = `900 16px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('收起卡牌', VW / 2, btnY + 28);
        this.addBox('close_ach_inspect', btnX, btnY, btnW, btnH);
      } else {
        this.achInspectId = null;
      }
    }

    // 浮层 2：24/24 全图鉴大满贯终极大礼预览 / 领取弹窗
    if (this.achGrandSlamOpen) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.62)';
      ctx.fillRect(leftV, 0, rightV - leftV, VH);
      this.addBox('close_grand_slam', leftV, 0, rightV - leftV, VH);

      const gw = 560; const gh = 420;
      const gx0 = Math.round((VW - gw) / 2);
      const gy0 = Math.round((VH - gh) / 2);
      this.drawCard3D(ctx, gx0, gy0, gw, gh, {
        fill: CREAM, lip: '#B45309', radius: 24, border: '#7E22CE', borderW: 3, depth: 7,
      });

      // 顶部紫金尊享横幅
      ctx.fillStyle = '#F3E8FF';
      rrect(ctx, gx0 + 6, gy0 + 6, gw - 12, 74, 18); ctx.fill();
      drawIcon(ctx, 'trophy', gx0 + 42, gy0 + 42, 28, '#9333EA');
      ctx.textAlign = 'left';
      ctx.fillStyle = '#581C87'; ctx.font = `900 22px ${FONT}`;
      ctx.fillText('24/24 全图鉴大满贯终极大礼', gx0 + 66, gy0 + 40);
      ctx.fillStyle = '#7E22CE'; ctx.font = `800 13px ${FONT}`;
      ctx.fillText(`当前总收集进度：${stat.unlocked} / ${stat.total} 张卡牌`, gx0 + 66, gy0 + 64);

      // 进度条
      const pbx = gx0 + 28; const pby = gy0 + 92; const pbw = gw - 56;
      ctx.fillStyle = '#E2E8F0'; rrect(ctx, pbx, pby, pbw, 12, 6); ctx.fill();
      const ratio = Math.min(1, stat.unlocked / Math.max(1, stat.total));
      if (ratio > 0) {
        ctx.fillStyle = ratio >= 1 ? '#F59E0B' : '#9333EA';
        rrect(ctx, pbx, pby, Math.max(12, pbw * ratio), 12, 6); ctx.fill();
      }

      // 3 大专属奖励展示条
      const rewards = [
        { tag: '唯一限定涂装', title: '《星耀大满贯特快》流光专列', desc: '全图鉴唯一解锁（不可买/试驾）· 虹彩流光车身 + 星尘拖尾', col: '#9333EA' },
        { tag: '永久顶级排面', title: '「全图鉴大师」鎏金徽章', desc: '首页顶部与到站结算界面永久展示尊享身份', col: '#D97706' },
        { tag: '大满贯特权礼', title: `+${GRAND_SLAM_REWARD_TICKETS} 车票 + 无尽免费刷新词条`, desc: '无尽专列每站词条三选一可免费「换一批」1 次', col: '#16A34A' },
      ];
      rewards.forEach((rw, i) => {
        const ry = gy0 + 116 + i * 72;
        ctx.fillStyle = '#FFFFFF';
        rrect(ctx, pbx, ry, pbw, 62, 13); ctx.fill();
        ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 1.6; ctx.stroke();

        ctx.fillStyle = rw.col;
        rrect(ctx, pbx + 12, ry + 11, 96, 22, 7); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 11px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(rw.tag, pbx + 60, ry + 26);

        ctx.textAlign = 'left';
        ctx.fillStyle = INK; ctx.font = `900 15px ${FONT}`;
        ctx.fillText(rw.title, pbx + 118, ry + 27);
        ctx.fillStyle = '#64748B'; ctx.font = `700 11.5px ${FONT}`;
        ctx.fillText(rw.desc, pbx + 12, ry + 51);
      });

      // 底部按钮
      const cby = gy0 + gh - 68;
      if (gsReady) {
        this.drawBtn3D(ctx, pbx, cby, pbw, 48, {
          topFill: '#FDE047', fill: '#F59E0B', lip: '#B45309', radius: 14, depth: 5,
        });
        ctx.fillStyle = INK; ctx.font = `900 18px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('立即领取大满贯终极大礼 & 换装特快！', VW / 2, cby + 30);
        this.addBox('claim_grand_slam', pbx, cby, pbw, 48);
      } else if (gsDone) {
        this.drawBtn3D(ctx, pbx, cby, pbw, 48, {
          topFill: '#C084FC', fill: '#9333EA', lip: '#581C87', radius: 14, depth: 4,
        });
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 17px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('已荣获全图鉴大满贯典藏认证（点此返回）', VW / 2, cby + 30);
        this.addBox('close_grand_slam', pbx, cby, pbw, 48);
      } else {
        this.drawBtn3D(ctx, pbx, cby, pbw, 48, {
          fill: CREAM_SUB, lip: '#B8ACA0', radius: 14, depth: 4, sheen: false,
        });
        ctx.fillStyle = '#475569'; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`还差 ${Math.max(0, stat.total - stat.unlocked)} 张卡牌解锁大满贯 · 继续收集`, VW / 2, cby + 30);
        this.addBox('close_grand_slam', pbx, cby, pbw, 48);
      }
    }

    ctx.restore();
  }

  /** 合规弹窗 1：可点击的 CADPA 8+ 适龄提示说明弹窗（小屏横屏自动放大字号与版面，确保可读性与热区一致） */
  drawAge8Modal(ctx, leftV, rightV) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const isCompact = this.viewScale < 0.72;
    const cw = isCompact ? 860 : 610;
    const ch = isCompact ? 556 : 352;
    const cx = (VW - cw) / 2; const cy = (VH - ch) / 2;
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 22, depth: 6 });

    ctx.fillStyle = '#22C55E'; rrect(ctx, cx + 26, cy + 24, 52, 30, 7); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.font = `900 ${isCompact ? 17 : 15}px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(TT_CONFIG.ageRating, cx + 52, cy + 45);

    ctx.textAlign = 'left';
    ctx.fillStyle = INK; ctx.font = `900 ${isCompact ? 24 : 20}px ${FONT}`;
    ctx.fillText(TT_CONFIG.ageRatingTitle, cx + 90, cy + 46);

    const fontSz = isCompact ? 17 : 13;
    const lineStep = isCompact ? 31 : 22;
    const maxLineChars = isCompact ? 42 : 37;
    ctx.fillStyle = '#334155'; ctx.font = `700 ${fontSz}px ${FONT}`;
    let ty = cy + (isCompact ? 98 : 88);
    for (const line of TT_CONFIG.ageRatingLines) {
      let cur = '';
      for (const chChar of line) {
        if (cur.length >= maxLineChars && !/[，。、；！]/.test(chChar)) {
          ctx.fillText(cur, cx + 28, ty);
          ty += lineStep;
          cur = chChar;
        } else {
          cur += chChar;
        }
      }
      if (cur) { ctx.fillText(cur, cx + 28, ty); ty += lineStep; }
      ty += isCompact ? 10 : 6;
    }

    const btnW = isCompact ? 220 : 184;
    const btnH = isCompact ? 52 : 44;
    const bx = (VW - btnW) / 2; const by = cy + ch - (isCompact ? 68 : 64);
    this.drawBtn3D(ctx, bx, by, btnW, btnH, { topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 13, depth: 4 });
    ctx.fillStyle = '#FFFFFF'; ctx.font = `900 ${isCompact ? 18 : 16}px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('我知道了', VW / 2, by + (isCompact ? 33 : 28));
    this.addBox('close_modal', bx, by, btnW, btnH);
    ctx.restore();
  }

  /** 合规弹窗 2：抖音侧边栏双态复访弹窗（内置纯 Canvas 三步复访示意图，提升提审通过率！） */
  drawSidebarModal(ctx, sdk, progress, leftV, rightV) {
    ctx.save();
    this.drawBackdrop(ctx, leftV, rightV);

    const cw = 548; const ch = 368;
    const cx = (VW - cw) / 2; const cy = (VH - ch) / 2;
    this.drawCard3D(ctx, cx, cy, cw, ch, { fill: CREAM, lip: '#CBD5E1', radius: 22, depth: 6 });

    ctx.textAlign = 'center';
    drawIcon(ctx, 'gift', VW / 2, cy + 38, 28, '#16A34A');
    ctx.fillStyle = INK; ctx.font = `900 22px ${FONT}`;
    ctx.fillText('抖音首页侧边栏复访专属礼', VW / 2, cy + 78);

    // 三步可视化复访路径示意图
    const stepY = cy + 94;
    const steps = ['1. 返回抖音首页', '2. 点左上侧边栏', '3. 进入超载快车'];
    const sw = 148; const sgap = 18;
    const sx0 = cx + (cw - (sw * 3 + sgap * 2)) / 2;
    steps.forEach((st, i) => {
      const sx = sx0 + i * (sw + sgap);
      ctx.fillStyle = i === 2 ? '#DCFCE7' : CREAM_SUB;
      rrect(ctx, sx, stepY, sw, 56, 12); ctx.fill();
      ctx.strokeStyle = i === 2 ? '#22C55E' : '#CBD5E1'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = i === 2 ? '#15803D' : INK;
      ctx.font = `900 13px ${FONT}`;
      ctx.fillText(st, sx + sw / 2, stepY + 33);
      if (i < 2) {
        drawIcon(ctx, 'arrowRight', sx + sw + sgap / 2, stepY + 28, 12, '#64748B');
      }
    });

    const fromSidebar = sdk.launchedFromSidebar;
    const canClaim = progress.canClaimSidebarToday();
    ctx.fillStyle = '#FEF3C7';
    rrect(ctx, cx + 28, cy + 166, cw - 56, 68, 12); ctx.fill();
    ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#B45309'; ctx.font = `900 15px ${FONT}`;
    ctx.fillText('每日奖励：额外空降 +3 位挂壁娃 & +3 位胖叔', VW / 2, cy + 194);
    ctx.fillStyle = '#475569'; ctx.font = `700 12px ${FONT}`;
    ctx.fillText(
      fromSidebar
        ? '已检测到您从抖音首页侧边栏进入，点击下方立即领取！'
        : '点击「去侧边栏」按上方步骤重新进入即可领奖',
      VW / 2, cy + 219
    );

    const bx = cx + 28; const bw = cw - 56; const by = cy + 252;
    if (fromSidebar && canClaim) {
      this.drawBtn3D(ctx, bx, by, bw, 48, { topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 14, depth: 4 });
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 17px ${FONT}`;
      ctx.fillText('立即领取今日侧边栏礼', VW / 2, by + 30);
      this.addBox('claim_sidebar', bx, by, bw, 48);
    } else if (!canClaim) {
      this.drawBtn3D(ctx, bx, by, bw, 48, { fill: '#E2E8F0', lip: '#94A3B8', radius: 14, depth: 4, sheen: false });
      ctx.fillStyle = '#64748B'; ctx.font = `900 16px ${FONT}`;
      ctx.fillText('今日已领取，明天从侧边栏再来哦！', VW / 2, by + 30);
      this.addBox('close_modal', bx, by, bw, 48);
    } else {
      this.drawBtn3D(ctx, bx, by, bw, 48, { topFill: '#4ADE80', fill: '#16A34A', lip: '#14532D', radius: 14, depth: 4 });
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 17px ${FONT}`;
      ctx.fillText('去抖音侧边栏', VW / 2, by + 30);
      this.addBox('goto_sidebar', bx, by, bw, 48);
    }

    ctx.fillStyle = '#64748B'; ctx.font = `800 13px ${FONT}`;
    ctx.fillText('关闭', VW / 2, cy + 338);
    this.addBox('close_modal', VW / 2 - 50, cy + 318, 100, 32);
    ctx.restore();
  }
}
