// 抖音小游戏唯一入口文件（game.js · V1.0 锁横屏高留存首发版）：
// - 0 黑边宽屏适配 + 安全区贴边热区 + 严格避让抖音胶囊
// - 10 关逐类解锁 + 每日极限专列 + 左右分流专列 + 无尽专列 8 词条 + 3 项车队养成 + 6 套纯 Canvas 涂装 + 24 项成就卡馆
// - 第 1 关一次性幽默对话框 + 前 5 关特征弱提示（不剧透玩法）
// - 短视频观感补强：撞洞 1.18x 动态镜头特写 + 0.12s 喜剧微顿帧 + 夸张大字吐槽 + 搞笑结算称号
// - 抖音提审 100% 合规：矢量图标、可点击 8+ 弹窗、双态侧边栏弹窗、录屏 pause/resume、广告静音暂停、6 大漏斗埋点

import { Platform } from './src/platform.js';
import { World, DT, TYPE_MAP } from './src/physics.js';
import {
  LEVELS, PASSENGER_META, ENDLESS_PERKS, SKILL_FAIL_LINES, ACHIEVEMENTS, evaluateHighlightScore,
  buildDailyLevel, buildEndlessLevel, buildStrictQueueLevel, pickFunnyTitle,
} from './src/levels.js';
import { ProgressStore } from './src/progress.js';
import { StageRenderer, VW, VH, ORIGIN_X, GROUND_Y } from './src/render.js';
import { CanvasUI } from './src/ui_canvas.js';
import { AudioEngine } from './src/audio.js';
import { DouyinSDK } from './src/tt_sdk.js';
import { ImpactDirector } from './src/director.js';

const platform = new Platform().init();
const progress = new ProgressStore(platform);
const audio = new AudioEngine(platform);

let appPaused = false;
let adPaused = false;

const stage = new StageRenderer();
const director = new ImpactDirector(stage);
const ui = new CanvasUI();

const sdk = new DouyinSDK(platform, {
  onAdToggle: (playing) => {
    adPaused = playing;
    if (playing) clearInput();
    audio.setPaused(appPaused || adPaused);
    if (!playing) lastTime = platform.now();
  },
  onVideoReady: () => {
    // 异步录屏就绪时结算按钮会自动变为「炫耀视频（发抖音）」
  },
});
sdk.init();
sdk.track('enter_game', { unlocked: progress.data.unlockedIdx + 1 });

let levelIdx = Math.min(progress.data.unlockedIdx, LEVELS.length - 1);
let world = new World(LEVELS[levelIdx], (Date.now() & 0xffff) + 1, {
  upgrades: progress.getUpgradeBonus(),
  randomWave: true,
});
let uiMode = 'title'; // 'title' | 'play' | 'result'
let modal = null;     // null | 'l1_dialog' | 'stations' | 'garage' | 'perks' | 'age8' | 'sidebar'
let whisper = null;   // { typeId, text, life }
let voiceBubble = null; // { typeId, text, life }
const voiceLineCursor = {};
const skillFailCursor = {};
let skillFailCooldown = 0;
let doorHintTimer = 0;

function speakCharacter(typeId) {
  if (!typeId || typeId === 'mix') return;
  const meta = PASSENGER_META[typeId];
  const lines = meta && meta.voiceLines ? meta.voiceLines : [];
  const idx = voiceLineCursor[typeId] || 0;
  const line = lines.length ? lines[idx % lines.length] : '';
  voiceLineCursor[typeId] = idx + 1;
  if (line) {
    voiceBubble = { typeId, text: line, life: 1.45 };
  }
}
let l1TunnelFlash = 0;
let l1TunnelFlashed = false;
let resultMeta = {};
let perkChoices = [];
let endlessRerollLeft = 0;
let pendingSidebarBonus = false;
let runRewardClaimed = { tickets: 0, alive: 0 };
let runNewAchievements = [];
let runHighlights = []; // 本局抓拍的全部候选高光 [{ id, def, isNew, count, score, snap }]
let pendingCaptures = [];
let arrivalMvpShown = false;

// 视口映射到 1280 × 720 虚拟画布（0 黑边宽屏延伸 + 安全区坐标）
let viewScale = 1;
let viewOffX = 0;
let viewOffY = 0;
let leftV = 0;
let rightV = VW;
let safeLeftV = 0;
let safeRightV = VW;
let safeBottomV = VH;
let capsuleLeftV = VW - 16;

function syncViewport() {
  const s = platform.safe;
  // 按全屏高度/宽度适配，使核心 1280×720 完整居中，超宽屏左右无限延伸背景实现 0 黑边！
  viewScale = Math.min(platform.winW / VW, platform.winH / VH);
  viewOffX = (platform.winW - VW * viewScale) / 2;
  viewOffY = (platform.winH - VH * viewScale) / 2;

  leftV = (0 - viewOffX) / viewScale;
  rightV = (platform.winW - viewOffX) / viewScale;
  safeLeftV = Math.max(leftV, (s.left - viewOffX) / viewScale);
  safeRightV = Math.min(rightV, (s.right - viewOffX) / viewScale);
  safeBottomV = Math.min(VH, (s.bottom - viewOffY) / viewScale);

  if (platform.menuRect) {
    const r = platform.menuRect;
    const mrTopV = (r.top - viewOffY) / viewScale;
    const mrLeftV = (r.left - viewOffX) / viewScale;
    const validHoriz = r.left >= platform.winW * 0.60 && r.left < platform.winW;
    const overlapsTopBar = !Number.isFinite(mrTopV) || mrTopV < 78;
    capsuleLeftV = (validHoriz && overlapsTopBar)
      ? Math.min(safeRightV - 12, Math.max(VW * 0.68, mrLeftV))
      : safeRightV - 12;
  } else {
    capsuleLeftV = safeRightV - 12;
  }
}

function screenToVirtual(sx, sy) {
  return {
    vx: (sx - viewOffX) / viewScale,
    vy: (sy - viewOffY) / viewScale,
  };
}

function startLevelObj(levelObj, { showTitle = false, clearTrial = false } = {}) {
  if (clearTrial) progress.clearTrialSkin();
  const seed = levelObj.dailySeed || (((Date.now() ^ Math.floor(Math.random() * 65535)) & 0xffff) + 1);
  world = new World(levelObj, seed, {
    upgrades: progress.getUpgradeBonus(),
    randomWave: true,
  });
  runRewardClaimed = { tickets: 0, alive: 0 };
  runNewAchievements = [];
  runHighlights = [];
  pendingCaptures = [];
  arrivalMvpShown = false;
  ui.miniCapture = null;
  ui.achBanner = null;
  ui.achQueue.length = 0;
  sdk.clearHighlightSnapshot();
  if (pendingSidebarBonus) {
    world.grantSidebarBonus();
    pendingSidebarBonus = false;
  }
  sdk.stopRecord({ discard: true });
  uiMode = showTitle ? 'title' : 'play';
  modal = null;
  clearInput();
  resultMeta = {};
  l1TunnelFlash = 0;
  l1TunnelFlashed = false;
  director.reset();

  // 新手第 1 关已具备车顶动态小手与发光落点引导，直接进入站台开玩，不再弹出阻断式站长对话框！

  // 前 6 关新乘客特征弱提示（2.5 秒自动消失，绝不阻断操作）
  whisper = null;
  voiceBubble = null;
  doorHintTimer = 0;
  if (!showTitle && levelObj.newType && progress.isTypeNew(levelObj.newType)) {
    const meta = PASSENGER_META[levelObj.newType];
    if (meta && meta.introWhisper) {
      whisper = { typeId: levelObj.newType, text: meta.introWhisper, life: 2.5 };
      progress.markTypeSeen(levelObj.newType);
    }
  }

  if (!showTitle) {
    sdk.track('level_start', { level: levelObj.id, mode: levelObj.isEndless ? 'endless' : (levelObj.isDaily ? 'daily' : 'main') });
  }
}

function startMainLevel(idx, showTitle = false) {
  levelIdx = Math.max(0, Math.min(LEVELS.length - 1, idx));
  startLevelObj(LEVELS[levelIdx], { showTitle });
}

function rollPerkChoices() {
  const pool = ENDLESS_PERKS.slice();
  const out = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const k = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

// ---------- 多点触控与严格分区管理 ----------
const heldTouchButtons = new Map(); // touchId -> 'lean_left' | 'lean_right' | 'crouch'
let sprayTouchId = null;
let sprayPt = null;
let sprayTimer = 0;
let lastSprayX = 0;
let lastSprayY = 0;

function activeHeldBtnSet() {
  const set = new Set();
  for (const id of heldTouchButtons.values()) set.add(id);
  return set;
}

function clearInput() {
  heldTouchButtons.clear();
  sprayTouchId = null;
  sprayPt = null;
  sprayTimer = 0;
  world.crouching = false;
  world.boosting = false;
  world.leanInput = 0;
  acc = 0;
}

function handleTapButton(box) {
  clearInput();
  // 同一批多指事件中的后续触点不能命中已切换页面的旧热区。
  ui.hitboxes.length = 0;
  audio.init();
  switch (box.id) {
    case 'start': {
      const startIdx = Math.min(progress.data.unlockedIdx, LEVELS.length - 1);
      startMainLevel(startIdx, false);
      audio.whistle();
      break;
    }
    case 'go_title': {
      sdk.stopRecord({ discard: true });
      if (uiMode !== 'title') progress.clearTrialSkin();
      modal = null;
      resultMeta = {};
      // 返回首页时同步回到干净的站台封面态，防止行车中途退出把桥洞留在标题背后！
      const homeIdx = Math.min(progress.data.unlockedIdx, LEVELS.length - 1);
      startMainLevel(homeIdx, true);
      break;
    }
    case 'close_l1_dialog':
      progress.markL1DialogSeen();
      modal = null;
      break;
    case 'close_modal':
      ui.achInspectId = null;
      ui.achGrandSlamOpen = false;
      modal = null;
      break;
    case 'open_stations':
      modal = 'stations';
      break;
    case 'open_garage':
      modal = 'garage';
      break;
    case 'open_missions':
      modal = 'missions';
      break;
    case 'open_achievements':
      ui.achPage = progress.getFirstPendingFlipPage(8);
      ui.achInspectId = null;
      ui.achGrandSlamOpen = false;
      ui.achFlipAnim = null;
      ui.achFlipSparks.length = 0;
      modal = 'achievements';
      break;
    case 'ach_prev':
      ui.achInspectId = null;
      ui.achGrandSlamOpen = false;
      ui.achFlipAnim = null;
      ui.achPage = Math.max(0, ui.achPage - 1);
      break;
    case 'ach_next':
      ui.achInspectId = null;
      ui.achGrandSlamOpen = false;
      ui.achFlipAnim = null;
      ui.achPage += 1;
      break;
    case 'claim_ach_set': {
      const res = progress.claimAchievementSet(box.setId);
      if (res.ok) {
        audio.fanfare();
        stage.burstAchievementGold(0, -140);
        ui.showToast(`套装【${res.set.name}】集齐！领取 +${res.reward} 车票！`, 2.6);
      }
      break;
    }
    case 'open_grand_slam':
      ui.achInspectId = null;
      ui.achGrandSlamOpen = true;
      break;
    case 'close_grand_slam':
      ui.achGrandSlamOpen = false;
      break;
    case 'claim_grand_slam': {
      const res = progress.claimGrandSlam();
      if (res.ok) {
        audio.achievementUnlock();
        stage.burstAchievementGold(0, -140);
        ui.achGrandSlamOpen = false;
        ui.showToast(`24/24 全图鉴大满贯！获 +${res.reward} 票并已换装《星耀大满贯特快》！`, 3.4);
      }
      break;
    }
    case 'inspect_ach_card': {
      const stat = progress.getAchievementStats();
      const item = stat.list.find((it) => it.id === box.achId);
      if (item) {
        if (item.pendingFlip) {
          const res = progress.flipAchievementCard(item.id);
          if (res.ok) {
            audio.achievementUnlock();
            ui.triggerCardFlip(item.id, res.reward, true);
          }
        } else if (item.unlocked) {
          ui.achInspectId = item.id;
          audio.shutterSnap();
        } else {
          const num = `#${String((box.index || 0) + 1).padStart(2, '0')}`;
          ui.showToast(`未翻开卡牌 ${num} 线索：${item.clue || item.hint}`, 2.8);
        }
      }
      break;
    }
    case 'close_ach_inspect':
      ui.achInspectId = null;
      break;
    case 'switch_highlight': {
      const list = resultMeta.highlights || [];
      if (list.length > 1) {
        resultMeta.highlightIdx = ((resultMeta.highlightIdx || 0) + 1) % list.length;
        const cur = list[resultMeta.highlightIdx];
        if (cur && cur.snap) {
          sdk.setHighlightSnapshot(cur.snap);
          resultMeta.highlightSnap = cur.snap;
        }
        if (cur && cur.def) {
          resultMeta.funnyTitle = cur.def.title;
        }
        audio.shutterSnap();
      }
      break;
    }
    case 'claim_mission': {
      const res = progress.claimMission(box.missionId);
      if (res.ok) {
        audio.fanfare();
        ui.showToast(`今日目标达成！领取 +${res.reward} 车票！`);
      }
      break;
    }
    case 'add_shortcut':
      sdk.addShortcut((ok, msg) => {
        if (ok && progress.claimShortcutReward(40)) {
          audio.fanfare();
          ui.showToast('桌面快捷方式已添加！奖励 +40 车票！');
        } else if (msg) {
          ui.showToast(msg);
        }
      });
      break;
    case 'open_age8':
      modal = 'age8';
      break;
    case 'open_sidebar':
      sdk.track('sidebar_open', { from_sidebar: sdk.launchedFromSidebar ? 1 : 0 });
      modal = 'sidebar';
      break;
    case 'goto_sidebar':
      sdk.navigateToSidebar((_, msg) => {
        if (msg) ui.showToast(msg, 2.4);
      });
      break;
    case 'claim_sidebar':
      if (sdk.launchedFromSidebar && progress.canClaimSidebarToday()) {
        progress.markSidebarClaimedToday();
        sdk.track('sidebar_claim', {});
        if (uiMode === 'play' && world.phase === 'loading') {
          world.grantSidebarBonus();
        } else {
          pendingSidebarBonus = true;
        }
        modal = null;
        audio.fanfare();
        ui.showToast('侧边栏礼已到账：+3 挂壁娃 & +3 胖叔！');
      }
      break;
    case 'open_rank':
      sdk.openRankList((_, msg) => {
        if (msg) ui.showToast(msg);
      });
      break;
    case 'select_level':
      startMainLevel(box.index, false);
      break;
    case 'ad_trial_level':
      sdk.showRewardedAd('trial_level', (ok) => {
        if (ok) {
          startMainLevel(box.index, false);
          ui.showToast(`已开启第 ${box.index + 1} 站提前试跑！`);
        }
      });
      break;
    case 'ad_trial_next': {
      const curIdx = LEVELS.findIndex((l) => l.id === world.level.id);
      if (curIdx >= 0 && curIdx < LEVELS.length - 1) {
        sdk.showRewardedAd('trial_next', (ok) => {
          if (ok) {
            startMainLevel(curIdx + 1, false);
            ui.showToast(`提前试跑第 ${curIdx + 2} 站！`);
          }
        });
      }
      break;
    }
    case 'start_daily':
      startLevelObj(buildDailyLevel(), { showTitle: false });
      audio.whistle();
      break;
    case 'start_strict_queue':
      startLevelObj(buildStrictQueueLevel(), { showTitle: false });
      audio.whistle();
      if (world.queue[0]) speakCharacter(world.queue[0]);
      break;
    case 'place_left':
      if (world.launchOnSide(-1) > 0 && world.queue[0]) {
        speakCharacter(world.queue[0]);
      }
      break;
    case 'place_right':
      if (world.launchOnSide(1) > 0 && world.queue[0]) {
        speakCharacter(world.queue[0]);
      }
      break;
    case 'start_endless':
      startLevelObj(buildEndlessLevel(1), { showTitle: false });
      audio.whistle();
      break;
    case 'endless_next_wave':
      perkChoices = rollPerkChoices();
      endlessRerollLeft = progress.isFullAlbumComplete() ? 1 : 0;
      modal = 'perks';
      break;
    case 'reroll_perks': {
      if (endlessRerollLeft > 0) {
        const prevIds = new Set(perkChoices.map((p) => p.id));
        const fresh = ENDLESS_PERKS.filter((p) => !prevIds.has(p.id));
        if (fresh.length >= 3) {
          for (let i = fresh.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
          }
          perkChoices = fresh.slice(0, 3);
        } else {
          perkChoices = rollPerkChoices();
        }
        endlessRerollLeft--;
        audio.shutterSnap();
        ui.showToast('大满贯特权生效：已换一批新词条！');
      }
      break;
    }
    case 'reroll_perks_tickets': {
      if (progress.spendTickets(30)) {
        const prevIds = new Set(perkChoices.map((p) => p.id));
        const fresh = ENDLESS_PERKS.filter((p) => !prevIds.has(p.id));
        if (fresh.length >= 3) {
          for (let i = fresh.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
          }
          perkChoices = fresh.slice(0, 3);
        } else {
          perkChoices = rollPerkChoices();
        }
        audio.shutterSnap();
        ui.showToast('已花 30 车票换一批新强化词条！');
      } else {
        ui.showToast('车票不足（需 30 车票）');
      }
      break;
    }
    case 'buy_ticket_gear': {
      if (world.gear && world.gear.superGrip) {
        ui.showToast('本局防滑护盾与气囊已生效！');
      } else if (progress.spendTickets(35)) {
        world.gear.superGrip = true;
        world.gear.airbagCharges = Math.max(1, (world.gear.airbagCharges || 0) + 1);
        audio.fanfare();
        stage.addPop(ORIGIN_X, GROUND_Y - 210, '防滑胶+气囊护盾生效！', '#FACC15', 22);
        ui.showToast('已花 35 车票开启【全员防滑 + 安全气囊】！');
      } else {
        ui.showToast('车票不足（需 35 车票）');
      }
      break;
    }
    case 'buy_skin_tickets': {
      const res = progress.buySkinWithTickets(box.skinId);
      if (res.ok) {
        audio.fanfare();
        ui.showToast(`买断成功！已永久拥有并换上【${res.skin.name}】！`);
      } else {
        ui.showToast(res.reason || '车票不足');
      }
      break;
    }
    case 'buy_ticket_retry_same': {
      if (progress.spendTickets(60)) {
        if (world.retryFromDepartSnapshot({ withShield: true })) {
          uiMode = 'play';
          modal = null;
          resultMeta = {};
          runHighlights = [];
          pendingCaptures = [];
          arrivalMvpShown = false;
          ui.miniCapture = null;
          ui.achBanner = null;
          ui.achQueue.length = 0;
          sdk.clearHighlightSnapshot();
          audio.fanfare();
          ui.showToast('已花 60 车票开启防滑气囊护盾，原班人马复活重冲！');
        }
      } else {
        ui.showToast('车票不足（需 60 车票）');
      }
      break;
    }
    case 'pick_perk': {
      const nextWave = (world.level.wave || 1) + 1;
      world.continueEndlessWave(buildEndlessLevel(nextWave), box.perkId);
      runRewardClaimed = { tickets: 0, alive: 0 };
      runNewAchievements = [];
      runHighlights = [];
      pendingCaptures = [];
      arrivalMvpShown = false;
      ui.miniCapture = null;
      ui.achBanner = null;
      ui.achQueue.length = 0;
      sdk.clearHighlightSnapshot();
      modal = null;
      uiMode = 'play';
      audio.fanfare();
      ui.showToast(`进入无尽第 ${nextWave} 站！`);
      break;
    }
    case 'buy_upgrade': {
      const res = progress.buyUpgrade(box.upgradeId);
      if (res.ok) {
        world.upgrades = progress.getUpgradeBonus();
        audio.fanfare();
        ui.showToast(`升级成功！已升至 Lv.${res.lv}`);
      } else {
        ui.showToast(res.reason);
      }
      break;
    }
    case 'equip_skin':
      if (progress.equipSkin(box.skinId)) {
        audio.launch(1, true);
        ui.showToast('涂装已换上！');
      }
      break;
    case 'ad_trial_skin':
      sdk.showRewardedAd('trial_skin', (ok) => {
        if (ok) {
          progress.setTrialSkin(box.skinId);
          audio.fanfare();
          ui.showToast('涂装本局免费试驾已生效！');
        }
      });
      break;
    case 'mute':
      audio.toggleMute();
      break;
    case 'reset':
      startLevelObj(
        world.level.isEndless ? buildEndlessLevel(1) : (world.level.isStrictQueue ? buildStrictQueueLevel() : world.level),
        { showTitle: false }
      );
      break;
    case 'burst':
      world.burstSize = box.burst;
      stage.addPop(ORIGIN_X, GROUND_Y - 210, `齐扑 ×${box.burst}`, '#FDE047', 22);
      break;
    case 'undo':
      world.undoLastBatch();
      break;
    case 'depart':
      world.depart();
      break;
    case 'ad_reinforce':
      sdk.showRewardedAd('reinforce', (ok) => {
        if (ok && world.grantReinforcement()) {
          audio.fanfare();
          ui.showToast('外援空降：+5 胖叔 & +5 挂壁娃！');
        }
      });
      break;
    case 'ad_double_tickets':
      if (!resultMeta.ticketsDoubled && resultMeta.earnedTickets > 0) {
        sdk.showRewardedAd('double_tickets', (ok) => {
          if (ok) {
            resultMeta.ticketsDoubled = true;
            progress.grantExtraTickets(resultMeta.earnedTickets);
            audio.fanfare();
            ui.showToast(`双倍车票到账：额外 +${resultMeta.earnedTickets} 车票！`);
          }
        });
      }
      break;
    case 'share_video': {
      const hList = resultMeta.highlights || [];
      const curH = hList.length ? hList[(resultMeta.highlightIdx || 0) % hList.length] : null;
      const shareTag = (curH && curH.def && curH.def.title) || resultMeta.funnyTitle;
      const curSnap = (curH && curH.snap) || resultMeta.highlightSnap;
      if (curSnap) sdk.setHighlightSnapshot(curSnap);
      sdk.shareVideo(world.finalCount, shareTag, (_, msg) => {
        if (msg) ui.showToast(msg, 2.5);
      }, {
        titleTag: shareTag,
        imagePath: (curSnap && curSnap.tempFilePath) || '',
        hasPreviewSnap: Boolean(curSnap && curSnap.previewCanvas),
        preferImage: Boolean((curSnap && curSnap.tempFilePath) || sdk.hasHighlightImage()),
      });
      break;
    }
    case 'ad_retry_same':
      sdk.showRewardedAd('retry_same', (ok) => {
        if (ok && world.retryFromDepartSnapshot({ withShield: true })) {
          uiMode = 'play';
          modal = null;
          resultMeta = {};
          runHighlights = [];
          pendingCaptures = [];
          arrivalMvpShown = false;
          ui.miniCapture = null;
          ui.achBanner = null;
          ui.achQueue.length = 0;
          sdk.clearHighlightSnapshot();
          ui.showToast('防滑气囊护盾已生效！原班人马再冲一次！');
        }
      });
      break;
    case 'retry':
      startLevelObj(world.level, { showTitle: false });
      break;
    case 'next_level': {
      const curIdx = LEVELS.findIndex((l) => l.id === world.level.id);
      if (curIdx >= 0 && curIdx < LEVELS.length - 1) startMainLevel(curIdx + 1, false);
      break;
    }
    default:
      break;
  }
}

platform.onTouchStart(({ changed }) => {
  if (appPaused || adPaused) return;
  audio.init();
  for (const pt of changed) {
    const { vx, vy } = screenToVirtual(pt.x, pt.y);
    const hit = ui.hitTest(vx, vy);
    if (hit) {
      if (hit.hold) {
        heldTouchButtons.set(pt.id, hit.id);
      } else {
        handleTapButton(hit);
      }
      continue;
    }
    // 有模态弹窗时拦截穿透点击
    if (modal) continue;

    if (uiMode === 'play' && world.phase === 'loading' && ui.isInStagePlayArea(vx, vy, safeLeftV, safeRightV, safeBottomV)) {
      if (world.level.strictQueue) {
        ui.showToast('本模式禁点车顶 · 请用左下【放左侧 / 放右侧】配重！', 2.0);
      } else {
        const local = stage.virtualToTrain(vx, vy, world);
        sprayTouchId = pt.id;
        sprayPt = local;
        sprayTimer = 0;
        lastSprayX = local.x;
        lastSprayY = local.y;
        world.launchAt(local.x, local.y);
      }
    } else if (uiMode === 'play' && world.phase === 'running' && ui.isInStagePlayArea(vx, vy, safeLeftV, safeRightV, safeBottomV)) {
      // 行车期：第 2 关起解锁缩头后，按住右侧舞台空白处可顺手缩头；左侧留给加速键附近防误触
      if (world.level.showCrouch !== false && vx >= VW * 0.50) {
        heldTouchButtons.set(pt.id, 'crouch');
      }
    }
  }
});

platform.onTouchMove(({ changed }) => {
  if (modal || appPaused || adPaused) return;
  for (const pt of changed) {
    const { vx, vy } = screenToVirtual(pt.x, pt.y);
    // 左下左右压重心键支持手指无缝滑动切换
    const curHold = heldTouchButtons.get(pt.id);
    if (curHold === 'lean_left' || curHold === 'lean_right') {
      const hit = ui.hitTest(vx, vy);
      if (hit && (hit.id === 'lean_left' || hit.id === 'lean_right')) {
        heldTouchButtons.set(pt.id, hit.id);
      }
      continue;
    }
    if (pt.id === sprayTouchId && uiMode === 'play' && world.phase === 'loading') {
      if (ui.isInStagePlayArea(vx, vy, safeLeftV, safeRightV, safeBottomV)) {
        sprayPt = stage.virtualToTrain(vx, vy, world);
      }
    }
  }
});

platform.onTouchEnd(({ changed }) => {
  for (const pt of changed) {
    heldTouchButtons.delete(pt.id);
    if (pt.id === sprayTouchId) {
      sprayTouchId = null;
      sprayPt = null;
    }
  }
});

platform.onHide(() => {
  appPaused = true;
  clearInput();
  audio.setPaused(true);
});
platform.onShow(() => {
  appPaused = false;
  audio.setPaused(adPaused);
  platform.refreshMetrics();
  lastTime = platform.now();
});

// ---------- 事件与短视频爆点导演 ----------
function handleEvents() {
  world.drainEvents(handleEvent);
}

function handleEvent(ev) {
  director.observe(ev);
    if (ev.type === 'beat') {
      audio.railBeat(ev.tick, ev.running);
    } else if (ev.type === 'launch') {
      audio.launch(ev.count, ev.perfect);
      const popY = Math.max(GROUND_Y - 215, Math.min(GROUND_Y - 185, GROUND_Y + ev.y - 52));
      const label = ev.score > ev.count ? `+${ev.score}分` : `+${ev.count}`;
      stage.addPop(ORIGIN_X + ev.x, popY, label, ev.score > ev.count ? '#FACC15' : (ev.count > 1 ? '#FDE047' : '#34D399'), ev.count > 1 ? 21 : 17);
    } else if (ev.type === 'undo') {
      audio.undo();
      stage.addPop(ORIGIN_X, GROUND_Y - 210, `撤回 ${ev.count} 人`, '#94A3B8', 19);
    } else if (ev.type === 'grab') {
      audio.grab(ev.grips > 0, ev.typeId === 'fat');
      if (ev.typeId === 'fat') stage.addShake(4.2);
      if (ev.typeId === 'vip') stage.burstGold(ev.x, ev.y);
      if (ev.onUnderCarriage) {
        stage.addPop(ORIGIN_X + ev.x, GROUND_Y + ev.y - 24, '哇！钻进车底盘啦！', '#FACC15', 20);
      }
    } else if (ev.type === 'basketCatch') {
      audio.launch(1, true);
      stage.burstGold(ev.x, ev.y);
      stage.addPop(ORIGIN_X + ev.x, GROUND_Y + ev.y - 34, '大妈菜篮兜住啦！', '#FACC15', 21);
      sdk.markHighlight(2.2, 2.0);
      if (world.basketCatchCount === 1 || world.basketCatchCount % 3 === 0) {
        stage.showBanter('大妈菜篮神级兜底！', '#FDE047', 1.2);
      }
    } else if (ev.type === 'airbag') {
      audio.fanfare();
      stage.burstGold(ev.x, ev.y);
      stage.showBanter('安全气囊救了一命！', '#38BDF8', 1.25);
    } else if (ev.type === 'poolEmpty') {
      stage.showDriverSpeech('站台清光啦，随时准备发车！', 2.2);
    } else if (ev.type === 'depart') {
      audio.whistle();
      stage.addShake(8);
      stage.showDriverSpeech(`坐稳扶好，${ev.count} 位拉笛发车咯！`, 2.2);
      sdk.track('level_depart', { level: world.level.id, count: ev.count, score: ev.score });
      sdk.startRecord();
    } else if (ev.type === 'needPeople') {
      stage.showDriverSpeech(world.level.strictQueue ? '先按左/右双键放人再发车！' : '车顶还空着呢，先拉人再发车！', 2.0);
    } else if (ev.type === 'midStop') {
      audio.brakeScreech();
      stage.addShake(7);
      stage.showBanter('司机：前头红灯，全员抓紧要急刹喽！', '#FB7185', 1.3);
      stage.showDriverSpeech('前头红灯，全员抓稳！', 1.6);
    } else if (ev.type === 'rampJump') {
      audio.launch(2, true);
      stage.addShake(6.5);
      stage.showDriverSpeech('前头飞坡，各位抱紧啦！', 1.8);
    } else if (ev.type === 'braking') {
      audio.brakeScreech();
      stage.addShake(5.5);
    } else if (ev.type === 'snap') {
      audio.snap();
    } else if (ev.type === 'bonk') {
      audio.bonk();
      stage.addShake(12);
      stage.burstBonk(ev.x, ev.y);
      sdk.markHighlight(2.5, 2.0);
      const spec = TYPE_MAP[ev.typeId];
      stage.addPop(ORIGIN_X + ev.x, GROUND_Y + ev.y - 24, `哐！${spec ? spec.name : ''}撞洞!`, '#FB7185', 20);
    } else if (ev.type === 'fall') {
      audio.fall();
    } else if (ev.type === 'skillFail') {
      const lines = SKILL_FAIL_LINES[ev.key];
      const highPrio = ev.key === 'vip_fail' || ev.key === 'auntie_full' || ev.key === 'stamina_empty';
      if (lines && lines.length && (skillFailCooldown <= 0 || highPrio)) {
        const idx = skillFailCursor[ev.key] || 0;
        const line = lines[idx % lines.length];
        skillFailCursor[ev.key] = idx + 1;
        const meta = ev.typeId ? PASSENGER_META[ev.typeId] : null;
        const col = meta ? meta.swatch : '#FDE047';
        // 若同帧已被导演镜头特写接管横幅，不重复覆盖横幅避免闪跳，仅弹出角色头顶浮字！
        if (director.bannerLock <= 0) {
          stage.showBanter(line, col, 1.45);
        }
        if (Number.isFinite(ev.x) && Number.isFinite(ev.y)) {
          stage.addPop(ORIGIN_X + ev.x, Math.max(150, GROUND_Y + ev.y - 36), line, col, 18);
        }
        skillFailCooldown = highPrio ? 0.85 : 1.45;
      }
    } else if (ev.type === 'achievement') {
      const rec = progress.recordAchievement(ev.id, { deferFlip: true });
      if (!rec) return;
      const { def, isNew, count } = rec;
      if (isNew) {
        runNewAchievements.push(def);
        sdk.track('achievement_unlock', { id: def.id });
      }
      const ax = Number.isFinite(ev.x) ? ev.x : 0;
      const ay = Number.isFinite(ev.y) ? ev.y : -120;
      const evalScore = evaluateHighlightScore(def, { isNew, count, runTime: world.runTime || 0 });
      const entry = { id: def.id, def, isNew, count, score: evalScore, snap: null };
      runHighlights.push(entry);
      runHighlights.sort((a, b) => b.score - a.score);
      if (runHighlights.length > 4) runHighlights.length = 4;

      // 行车途中：零冻帧、零挡屏大横幅！在事发乘客头顶原地炸金星 + 飘出称号金字 + 清脆快门抓拍，因果秒懂且绝不干扰操作！
      if (world.phase === 'running') {
        audio.shutterSnap();
        stage.burstGold(ax, ay);
        stage.addPop(ORIGIN_X + ax, Math.max(115, GROUND_Y + ay - 38), `【${def.title}】`, '#FEF08A', 23);
        ui.showMiniCapture(def, isNew);
        pendingCaptures.push({ entry, delay: 0.04, flash: false });
        sdk.markHighlight(2.5, 2.0);
      } else {
        // 到站瞬间触发的终局称号：交由到站全局 MVP 大颁奖一并评选并抓拍！
        pendingCaptures.push({ entry, delay: 0.16, flash: true });
      }
    } else if (ev.type === 'arrived') {
      audio.fanfare();
      if (ev.count > 0) {
        stage.burstConfetti();
        stage.addPop(ORIGIN_X, GROUND_Y - 215, `到站啦！${ev.count} 人全员欢呼！`, '#FDE047', 25);
        stage.showDriverSpeech(`终点站到啦！${ev.count} 位请慢走！`, 2.2);
        sdk.markHighlight(2.5, 2.0);
      } else {
        stage.addPop(ORIGIN_X, GROUND_Y - 210, '全员飞光·空车进站…', '#94A3B8', 22);
        stage.showDriverSpeech('咋一个都没剩呢…空车进站！', 2.2);
      }
      sdk.stopRecord();
    }
}

// ---------- 主循环（固定步长 1/120s）----------
let acc = 0;
let lastTime = platform.now();

function loop() {
  const now = platform.now();
  const raw = Math.min(0.06, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  syncViewport();

  const paused = appPaused || adPaused;
  if (!paused) {
    if (whisper && whisper.life > 0) {
      whisper.life = Math.max(0, whisper.life - raw);
      if (whisper.life === 0) whisper = null;
    }
    if (voiceBubble && voiceBubble.life > 0) {
      voiceBubble.life = Math.max(0, voiceBubble.life - raw);
      if (voiceBubble.life === 0) voiceBubble = null;
    }
    if (skillFailCooldown > 0) skillFailCooldown = Math.max(0, skillFailCooldown - raw);
    if (doorHintTimer > 0) doorHintTimer = Math.max(0, doorHintTimer - raw);
    if (l1TunnelFlash > 0) l1TunnelFlash = Math.max(0, l1TunnelFlash - raw);

    // 暂停预算精确扣除，微顿期间特效和 UI 继续更新。
    const simDt = director.advance(raw);

    const held = activeHeldBtnSet();
    if (uiMode === 'play' && !modal) {
      if (world.phase === 'running') {
        const allowCrouch = world.level.showCrouch !== false;
        world.crouching = allowCrouch && held.has('crouch');
        world.boosting = held.has('boost');
        world.leanInput = 0;
        // 第 2 关首次临近高架桥：提前至 700px 脉冲亮起 2 秒提醒按住缩头（一旦按下立即关闭）
        if (world.level.id === 's2' && !l1TunnelFlashed && world.tunnelAlert && world.tunnelAlert.dist < 700 && world.tunnelAlert.dist > 60) {
          l1TunnelFlashed = true;
          l1TunnelFlash = 2.0;
        }
        if (l1TunnelFlash > 0 && world.crouching) {
          l1TunnelFlash = 0;
        }
      } else {
        world.crouching = false;
        world.boosting = false;
        world.leanInput = 0;
      }

      if (world.phase === 'loading' && sprayTouchId !== null && sprayPt) {
        sprayTimer += simDt;
        const dist = Math.hypot(sprayPt.x - lastSprayX, sprayPt.y - lastSprayY);
        const interval = world.burstSize === 1 ? 0.16 : world.burstSize === 3 ? 0.30 : 0.40;
        if (sprayTimer >= interval && (dist > 18 || sprayTimer >= interval * 1.45)) {
          sprayTimer = 0;
          lastSprayX = sprayPt.x;
          lastSprayY = sprayPt.y;
          world.launchAt(sprayPt.x, sprayPt.y);
        }
      }

      acc += simDt;
      director.beginFrame();
      let steps = 0;
      while (acc >= DT && steps < 10) {
        world.step(DT);
        handleEvents();
        acc -= DT;
        steps++;
        if (director.frozen) { acc = 0; break; }
      }
      director.endFrame();
      if (steps >= 10) acc = 0;

      // 到站停稳瞬间：对本局全部抓拍的高光称号进行全局公平评估，选出唯一最佳 MVP 放重磅大勋章演出！
      if (world.phase === 'arrived' && !arrivalMvpShown) {
        arrivalMvpShown = true;
        if (runHighlights.length > 0) {
          runHighlights.sort((a, b) => b.score - a.score);
          const mvp = runHighlights[0];
          audio.achievementUnlock();
          stage.burstAchievementGold(0, -140);
          stage.addShake(5);
          ui.showAchievement(mvp.def, mvp.isNew, mvp.count);
          if (mvp.snap) {
            sdk.setHighlightSnapshot(mvp.snap);
          } else {
            pendingCaptures.push({ entry: mvp, delay: 0.16, flash: true });
          }
        }
      }

      const hasMvpShowcase = runHighlights.length > 0;
      const arrivalWait = hasMvpShowcase ? 2.25 : (world.rankOf(world.onBoardScore()).idx >= 1 ? 1.75 : 1.15);
      if (world.phase === 'arrived' && world.settleTime >= arrivalWait) {
        world.finalCount = world.onBoardCount();
        world.finalScore = world.onBoardScore();
        const rank = world.rankOf(world.finalScore);
        // 用到站全局评出的唯一最佳 MVP 称号霸气冠名结算卡与分享文案！
        const topHighlight = runHighlights[0] || null;
        const funnyTitle = (topHighlight && topHighlight.def && topHighlight.def.title) || pickFunnyTitle(world);
        if (topHighlight && topHighlight.snap) sdk.setHighlightSnapshot(topHighlight.snap);
        const rankBonus = rank.name === 'SS' ? 36 : rank.name === 'S' ? 24 : rank.name === 'A' ? 14 : rank.name === 'B' ? 8 : 0;
        const estBaseTickets = Math.max(8, Math.round(world.finalCount * 1.4) + rankBonus);
        const boostBonusTickets = world.getBoostBonusTickets(estBaseTickets);
        const rec = progress.recordRunResult(world.level, world.finalScore, rank.name, world.finalCount, {
          prevEarnedTickets: runRewardClaimed.tickets,
          prevAlive: runRewardClaimed.alive,
          boostBonusTickets,
        });
        progress.recordDailyMissionProgress({
          alive: Math.max(0, world.finalCount - runRewardClaimed.alive),
          passed: rank.idx >= 1,
          boosted: world.boostTime >= 0.7,
          isStrictQueue: Boolean(world.level.isStrictQueue),
        });
        runRewardClaimed = { tickets: rec.grossTickets, alive: rec.maxAlive };
        sdk.reportRank(progress.data.totalDelivered, 'total');
        sdk.track('level_finish', {
          level: world.level.id,
          score: world.finalScore,
          alive: world.finalCount,
          rank: rank.name,
          fallen: world.fallenTotal,
        });
        resultMeta = {
          ...rec,
          funnyTitle,
          newAchievements: runNewAchievements.slice(),
          highlights: runHighlights.slice(),
          highlightIdx: 0,
          highlightSnap: (topHighlight && topHighlight.snap) || null,
          ticketsDoubled: false,
        };
        if (rec.unlockedNext) {
          ui.showToast('达标解锁下一站！', 2.2);
        }
        uiMode = 'result';
      }
    }

    stage.updateFx(raw, world);
    ui.update(raw);
  }

  // 全屏渲染（0 黑边宽屏延伸背景 + 1280×720 虚拟安全构图）
  const ctx = platform.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0F1629';
  ctx.fillRect(0, 0, platform.canvas.width, platform.canvas.height);

  ctx.setTransform(
    viewScale * platform.dpr, 0,
    0, viewScale * platform.dpr,
    viewOffX * platform.dpr, viewOffY * platform.dpr
  );

  stage.draw(ctx, world, sprayPt, {
    showPlayHud: uiMode !== 'title',
    skin: progress.getActiveSkin(),
    leftV,
    rightV,
    doorHintTimer,
  });

  ui.draw(ctx, {
    world,
    uiMode,
    modal,
    muted: audio.muted,
    sdk,
    progress,
    leftV,
    rightV,
    safeLeftV,
    safeRightV,
    safeBottomV,
    capsuleLeftV,
    viewScale,
    heldBtns: activeHeldBtnSet(),
    isTT: platform.isTT,
    whisper,
    voiceBubble,
    resultMeta,
    perkChoices,
    endlessRerollLeft,
    l1TunnelFlash,
  });

  // 帧末无阻塞抓拍候选高光图（行车期静默拍完绝不闪白打断；到站 MVP 补拍伴随仪式快门微闪！）
  if (pendingCaptures.length > 0) {
    for (let i = pendingCaptures.length - 1; i >= 0; i--) {
      const task = pendingCaptures[i];
      task.delay = Math.max(0, (task.delay || 0) - raw);
      if (task.delay <= 0) {
        pendingCaptures.splice(i, 1);
        if (!task.entry.snap) {
          const snap = platform.captureHighlightSnapshot(task.entry.def.title);
          if (snap) {
            task.entry.snap = snap;
            if (runHighlights[0] === task.entry) {
              sdk.setHighlightSnapshot(snap);
              if (uiMode === 'result') resultMeta.highlightSnap = snap;
            }
            if (task.flash) ui.triggerShutterFlash(0.22);
          }
        }
      }
    }
  }

  platform.raf(loop);
}

platform.raf(loop);
