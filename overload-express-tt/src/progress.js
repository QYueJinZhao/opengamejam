// 持久化存档与局外成长系统（纯本地存储，兼容 tt.getStorageSync 与 localStorage）：
// 管理：10 关解锁进度、各站最高分与段位、车票金币、3 项车队升级、5 套涂装、每日专列纪录、无尽最高站数、首次引导状态。

import { LEVELS, UPGRADES, TRAIN_SKINS, DAILY_MISSIONS, ACHIEVEMENTS, ACHIEVEMENT_SETS, GRAND_SLAM_REWARD_TICKETS, todayDateKey } from './levels.js';

const SAVE_KEY = 'overload_tt_save_v3';

function defaultData() {
  return {
    unlockedIdx: 0,           // 已解锁到的主线最大下标（0 = 第 1 关）
    bests: {},                // levelId -> 最高计分（VIP×3 计入）
    ranks: {},                // levelId -> 最高段位 ('C'|'B'|'A'|'S'|'SS')
    tickets: 0,               // 车票金币
    totalDelivered: 0,        // 累计安全运达总人次（用于解锁涂装）
    upgrades: {
      gripPaint: 0,
      springs: 0,
      staminaCup: 0,
    },
    equippedSkin: 'classic',
    boughtSkins: {},          // 车票直接买断解锁的涂装 skinId -> true
    endlessBestWave: 0,
    endlessBestScore: 0,
    dailyDoneDate: '',
    sidebarClaimDate: '',
    shortcutClaimed: false,
    missionDate: '',
    missionProgress: {},
    missionClaimed: {},
    achievements: {},         // achievementId -> count
    pendingFlips: {},         // achievementId -> true（已获得但待玩家在卡馆亲手翻开领票）
    claimedSets: {},          // setId -> true
    grandSlamClaimed: false,  // 24/24 全图鉴大满贯是否已领取
    seenL1Dialog: false,
    seenTypes: ['thin'],      // 已见过特征弱提示的角色
  };
}

const RANK_ORDER = { C: 0, B: 1, A: 2, S: 3, SS: 4 };
const safeInt = (value, max = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export class ProgressStore {
  constructor(platform) {
    this.platform = platform;
    this.data = defaultData();
    this.trialSkinId = null;  // 广告单局试驾涂装（不持久）
    this.load();
  }

  load() {
    const raw = this.platform.getStorage(SAVE_KEY, null);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const def = defaultData();
      this.data = {
        ...def,
        unlockedIdx: safeInt(raw.unlockedIdx, LEVELS.length),
        tickets: safeInt(raw.tickets),
        totalDelivered: safeInt(raw.totalDelivered),
        bests: Object.fromEntries(Object.entries(record(raw.bests)).map(([key, value]) => [key, safeInt(value)])),
        ranks: Object.fromEntries(Object.entries(record(raw.ranks)).filter(([, value]) => Object.prototype.hasOwnProperty.call(RANK_ORDER, value))),
        upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, safeInt(record(raw.upgrades)[u.id], u.maxLv)])),
        equippedSkin: typeof raw.equippedSkin === 'string' ? raw.equippedSkin : 'classic',
        boughtSkins: Object.fromEntries(
          Object.entries(record(raw.boughtSkins))
            .filter(([k, v]) => v === true && TRAIN_SKINS.some((s) => s.id === k))
        ),
        endlessBestWave: safeInt(raw.endlessBestWave),
        endlessBestScore: safeInt(raw.endlessBestScore),
        dailyDoneDate: /^\d{8}$/.test(raw.dailyDoneDate) ? raw.dailyDoneDate : '',
        sidebarClaimDate: /^\d{8}$/.test(raw.sidebarClaimDate) ? raw.sidebarClaimDate : '',
        shortcutClaimed: raw.shortcutClaimed === true,
        missionDate: /^\d{8}$/.test(raw.missionDate) ? raw.missionDate : '',
        missionProgress: Object.fromEntries(Object.entries(record(raw.missionProgress)).map(([k, v]) => [k, safeInt(v)])),
        missionClaimed: Object.fromEntries(Object.entries(record(raw.missionClaimed)).filter(([, v]) => v === true)),
        achievements: Object.fromEntries(
          Object.entries(record(raw.achievements))
            .filter(([k, v]) => (v === true || (Number.isFinite(v) && v >= 1)) && ACHIEVEMENTS.some((a) => a.id === k))
            .map(([k, v]) => [k, v === true ? 1 : safeInt(v)])
        ),
        pendingFlips: Object.fromEntries(
          Object.entries(record(raw.pendingFlips))
            .filter(([k, v]) => v === true && ACHIEVEMENTS.some((a) => a.id === k))
        ),
        claimedSets: Object.fromEntries(
          Object.entries(record(raw.claimedSets))
            .filter(([k, v]) => v === true && ACHIEVEMENT_SETS.some((s) => s.id === k))
        ),
        grandSlamClaimed: raw.grandSlamClaimed === true,
        seenL1Dialog: raw.seenL1Dialog === true,
        seenTypes: Array.isArray(raw.seenTypes)
          ? [...new Set(['thin', ...raw.seenTypes.filter((id) => ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'].includes(id))])]
          : ['thin'],
      };
      if (!this.isSkinUnlocked(this.data.equippedSkin)) this.data.equippedSkin = 'classic';
    }
  }

  save() {
    this.platform.setStorage(SAVE_KEY, this.data);
  }

  isLevelUnlocked(idx) {
    return Number.isInteger(idx) && idx >= 0 && idx < LEVELS.length && idx <= this.data.unlockedIdx;
  }

  isEndlessUnlocked() {
    // 通过第 5 关（下标 4 拿到 B 级，unlockedIdx >= 5）解锁无尽专列
    return this.data.unlockedIdx >= 5;
  }

  getActiveSkin() {
    const id = this.trialSkinId || this.data.equippedSkin || 'classic';
    return TRAIN_SKINS.find((s) => s.id === id) || TRAIN_SKINS[0];
  }

  isSkinUnlocked(skinId) {
    const s = TRAIN_SKINS.find((it) => it.id === skinId);
    if (!s) return false;
    if (s.unlockByFullAlbum) return this.isFullAlbumComplete() || this.data.grandSlamClaimed;
    if (this.data.boughtSkins && this.data.boughtSkins[skinId]) return true;
    return this.data.totalDelivered >= s.unlockTotal;
  }

  buySkinWithTickets(skinId) {
    const s = TRAIN_SKINS.find((it) => it.id === skinId);
    if (!s || s.unlockByFullAlbum) return { ok: false, reason: '该涂装为全图鉴限定' };
    if (this.isSkinUnlocked(skinId)) return { ok: false, reason: '已拥有该涂装' };
    const cost = s.ticketCost || 150;
    if (this.data.tickets < cost) return { ok: false, reason: `车票不足（需 ${cost} 票）` };
    this.data.tickets -= cost;
    this.data.boughtSkins[skinId] = true;
    this.data.equippedSkin = skinId;
    this.trialSkinId = null;
    this.save();
    return { ok: true, cost, skin: s };
  }

  spendTickets(cost) {
    const c = Math.max(0, Math.floor(cost));
    if (this.data.tickets < c) return false;
    this.data.tickets -= c;
    this.save();
    return true;
  }

  equipSkin(skinId) {
    if (!this.isSkinUnlocked(skinId)) return false;
    this.data.equippedSkin = skinId;
    this.trialSkinId = null;
    this.save();
    return true;
  }

  setTrialSkin(skinId) {
    const s = TRAIN_SKINS.find((skin) => skin.id === skinId);
    if (s && !s.unlockByFullAlbum) this.trialSkinId = skinId;
  }

  clearTrialSkin() {
    this.trialSkinId = null;
  }

  getUpgradeBonus() {
    const u = this.data.upgrades;
    return {
      fricBonus: (u.gripPaint || 0) * 0.04,       // 满级 +20% 车顶防滑
      bumpReduce: (u.springs || 0) * 0.05,        // 满级 -25% 颠簸幅度
      staminaBoost: (u.staminaCup || 0) * 0.05,   // 满级 +25% 体力续航
      gripLv: u.gripPaint || 0,
      springLv: u.springs || 0,
      staminaLv: u.staminaCup || 0,
    };
  }

  buyUpgrade(id) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return { ok: false, reason: '未知升级' };
    const lv = this.data.upgrades[id] || 0;
    if (lv >= def.maxLv) return { ok: false, reason: '已满级' };
    const cost = def.costs[lv];
    if (this.data.tickets < cost) return { ok: false, reason: `车票不足（需 ${cost}）` };
    this.data.tickets -= cost;
    this.data.upgrades[id] = lv + 1;
    this.save();
    return { ok: true, lv: lv + 1, cost };
  }

  markL1DialogSeen() {
    if (!this.data.seenL1Dialog) {
      this.data.seenL1Dialog = true;
      this.save();
    }
  }

  isTypeNew(typeId) {
    return Boolean(typeId) && !this.data.seenTypes.includes(typeId);
  }

  markTypeSeen(typeId) {
    if (typeId && !this.data.seenTypes.includes(typeId)) {
      this.data.seenTypes.push(typeId);
      this.save();
    }
  }

  canClaimSidebarToday() {
    return this.data.sidebarClaimDate !== todayDateKey();
  }

  markSidebarClaimedToday() {
    this.data.sidebarClaimDate = todayDateKey();
    this.save();
  }

  /** 结算记录：更新最高纪录、解锁下一关/无尽、发放车票金币与涂装进度（支持快照重跑仅补差额，防无限刷票） */
  recordRunResult(level, score, rankName, aliveCount, { prevEarnedTickets = 0, prevAlive = 0, boostBonusTickets = 0 } = {}) {
    const d = this.data;
    const prevBest = d.bests[level.id] || 0;
    const isNewBest = score > prevBest;
    if (isNewBest) d.bests[level.id] = score;

    const prevRank = d.ranks[level.id] || '';
    if (!prevRank || (RANK_ORDER[rankName] ?? 0) > (RANK_ORDER[prevRank] ?? -1)) {
      d.ranks[level.id] = rankName;
    }

    // 累计运人 & 车票金币（快照重跑仅补发高出前一次的差额，杜绝无限刷票与涂装进度）
    const safeAlive = Math.max(0, aliveCount);
    const addAlive = Math.max(0, safeAlive - prevAlive);
    d.totalDelivered += addAlive;
    const rankBonus = rankName === 'SS' ? 36 : rankName === 'S' ? 24 : rankName === 'A' ? 14 : rankName === 'B' ? 8 : 0;
    const baseGross = Math.max(8, Math.round(safeAlive * 1.4) + rankBonus);
    const safeBoostBonus = Math.max(0, Math.floor(boostBonusTickets));
    const grossTickets = baseGross + safeBoostBonus;
    const earnedTickets = Math.max(0, grossTickets - prevEarnedTickets);
    d.tickets += earnedTickets;

    let unlockedNext = false;
    let unlockedEndless = false;
    if (!level.isDaily && !level.isEndless) {
      const idx = LEVELS.findIndex((l) => l.id === level.id);
      if (idx >= 0 && (RANK_ORDER[rankName] ?? 0) >= RANK_ORDER.B) {
        const nextIdx = Math.min(LEVELS.length - 1, idx + 1);
        if (idx + 1 > d.unlockedIdx) {
          const prevEndless = this.isEndlessUnlocked();
          d.unlockedIdx = Math.min(LEVELS.length, idx + 1);
          unlockedNext = nextIdx > idx;
          unlockedEndless = !prevEndless && this.isEndlessUnlocked();
        }
      }
    } else if (level.isDaily) {
      d.dailyDoneDate = todayDateKey();
    } else if (level.isEndless) {
      if ((level.wave || 1) > d.endlessBestWave) d.endlessBestWave = level.wave || 1;
      if (score > d.endlessBestScore) d.endlessBestScore = score;
    }

    this.save();
    return {
      best: d.bests[level.id] || score,
      isNewBest,
      earnedTickets,
      boostBonusTickets: safeBoostBonus,
      grossTickets: Math.max(prevEarnedTickets, grossTickets),
      maxAlive: Math.max(prevAlive, safeAlive),
      unlockedNext,
      unlockedEndless,
    };
  }

  grantExtraTickets(amount) {
    if (amount <= 0) return;
    this.data.tickets += amount;
    this.save();
  }

  /** 确保每日小目标随自然日自动重置 */
  ensureTodayMissions() {
    const today = todayDateKey();
    if (this.data.missionDate !== today) {
      this.data.missionDate = today;
      this.data.missionProgress = {};
      this.data.missionClaimed = {};
    }
  }

  /** 更新今日小目标进度（在每局到站结算时自动累加） */
  recordDailyMissionProgress({ alive = 0, passed = false, boosted = false, isStrictQueue = false } = {}) {
    this.ensureTodayMissions();
    const mp = this.data.missionProgress;
    if (alive > 0) mp.deliver_20 = (mp.deliver_20 || 0) + alive;
    if (passed && boosted) mp.boost_win = (mp.boost_win || 0) + 1;
    if (isStrictQueue) mp.strict_play = (mp.strict_play || 0) + 1;
    this.save();
  }

  getDailyMissionStates() {
    this.ensureTodayMissions();
    return DAILY_MISSIONS.map((m) => {
      const cur = Math.min(m.target, this.data.missionProgress[m.id] || 0);
      const claimed = Boolean(this.data.missionClaimed[m.id]);
      const ready = cur >= m.target && !claimed;
      return { ...m, cur, claimed, ready };
    });
  }

  hasUnclaimedMission() {
    return this.getDailyMissionStates().some((m) => m.ready);
  }

  claimMission(id) {
    this.ensureTodayMissions();
    const def = DAILY_MISSIONS.find((m) => m.id === id);
    if (!def) return { ok: false, reward: 0 };
    const cur = this.data.missionProgress[id] || 0;
    if (cur < def.target || this.data.missionClaimed[id]) return { ok: false, reward: 0 };
    this.data.missionClaimed[id] = true;
    this.data.tickets += def.reward;
    this.save();
    return { ok: true, reward: def.reward };
  }

  claimShortcutReward(amount = 40) {
    if (this.data.shortcutClaimed) return false;
    this.data.shortcutClaimed = true;
    this.data.tickets += amount;
    this.save();
    return true;
  }

  /** 记录称号触发次数：deferFlip=true 时新卡进入「待玩家亲手翻牌」状态，翻开瞬间再发车票，仪式感拉满！ */
  recordAchievement(id, { deferFlip = false } = {}) {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return null;
    const prev = safeInt(this.data.achievements[id]);
    const count = prev + 1;
    const isNew = prev === 0;
    this.data.achievements[id] = count;
    if (isNew) {
      if (deferFlip) {
        this.data.pendingFlips[id] = true;
      } else {
        this.data.tickets += def.reward;
      }
    }
    this.save();
    return { def, isNew, count, pendingFlip: Boolean(this.data.pendingFlips[id]) };
  }

  /** 玩家在称号卡牌馆亲手点击翻开新获得的卡牌：揭晓卡面并发放首通车票奖励！ */
  flipAchievementCard(id) {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def || !this.data.pendingFlips[id]) return { ok: false, reward: 0, def: null };
    delete this.data.pendingFlips[id];
    this.data.tickets += def.reward;
    this.save();
    return { ok: true, reward: def.reward, def };
  }

  /** 兼容旧调用：首次解锁返回 def，已解锁返回 null */
  unlockAchievement(id) {
    if (this.hasAchievement(id)) return null;
    const rec = this.recordAchievement(id);
    return rec && rec.isNew ? rec.def : null;
  }

  hasAchievement(id) {
    return safeInt(this.data.achievements[id]) > 0;
  }

  getAchievementCount(id) {
    return safeInt(this.data.achievements[id]);
  }

  getAchievementStats() {
    const total = ACHIEVEMENTS.length;
    let unlocked = 0;
    let earnedCount = 0;
    let pendingFlipCount = 0;
    const list = ACHIEVEMENTS.map((a) => {
      const count = safeInt(this.data.achievements[a.id]);
      const earned = count > 0;
      const pendingFlip = earned && Boolean(this.data.pendingFlips[a.id]);
      const done = earned && !pendingFlip;
      if (earned) earnedCount++;
      if (pendingFlip) pendingFlipCount++;
      if (done) unlocked++;
      return { ...a, earned, pendingFlip, unlocked: done, count };
    });
    return { unlocked, earnedCount, pendingFlipCount, total, list };
  }

  hasPendingFlips() {
    return this.getAchievementStats().pendingFlipCount > 0;
  }

  getFirstPendingFlipPage(perPage = 8) {
    const stat = this.getAchievementStats();
    const idx = stat.list.findIndex((a) => a.pendingFlip);
    return idx >= 0 ? Math.floor(idx / perPage) : 0;
  }

  isFullAlbumComplete() {
    return this.getAchievementStats().unlocked >= ACHIEVEMENTS.length;
  }

  getAchievementSetStates() {
    const stat = this.getAchievementStats();
    return ACHIEVEMENT_SETS.map((set) => {
      const cards = stat.list.filter((c) => c.setId === set.id);
      const unlocked = cards.filter((c) => c.unlocked).length;
      const pendingCount = cards.filter((c) => c.pendingFlip).length;
      const total = cards.length;
      const complete = total > 0 && unlocked >= total;
      const claimed = Boolean(this.data.claimedSets[set.id]);
      const ready = complete && !claimed;
      return { ...set, cards, unlocked, pendingCount, total, complete, claimed, ready };
    });
  }

  claimAchievementSet(setId) {
    const set = this.getAchievementSetStates().find((s) => s.id === setId);
    if (!set || !set.ready) return { ok: false, reward: 0 };
    this.data.claimedSets[setId] = true;
    this.data.tickets += set.reward;
    this.save();
    return { ok: true, reward: set.reward, set };
  }

  canClaimGrandSlam() {
    return this.isFullAlbumComplete() && !this.data.grandSlamClaimed;
  }

  claimGrandSlam() {
    if (!this.canClaimGrandSlam()) return { ok: false, reward: 0 };
    this.data.grandSlamClaimed = true;
    this.data.tickets += GRAND_SLAM_REWARD_TICKETS;
    this.data.equippedSkin = 'grand_slam';
    this.trialSkinId = null;
    this.save();
    return { ok: true, reward: GRAND_SLAM_REWARD_TICKETS };
  }

  hasUnclaimedAchievementReward() {
    return this.hasPendingFlips() || this.canClaimGrandSlam() || this.getAchievementSetStates().some((s) => s.ready);
  }
}
