// 纯逻辑 2D PBD 物理引擎（抖音小游戏 V3 高留存版）：
// - 零 DOM、零外部依赖、固定步长 1/120s、零 GC 热循环优化（90人同屏稳 60fps）
// - 6 种真实差异体型：瘦猴 / 胖叔(托肩) / 挂壁娃(直挂车门免涵洞) / 竹竿(跨堆拉索+65%超低缩头) / 大妈(双菜篮兜底安全网) / VIP老板(1人顶3分但滑溜)
// - 10 关逐类解锁 + 迎面强阵风区 + 中途红灯急停 + 3项车队升级 + 8个无尽肉鸽词条 + 开局防滑/气囊神装 + 发车快照重跑

import { LEVELS, PASSENGER_META, buildDailyLevel, buildEndlessLevel } from './levels.js';

export { LEVELS, PASSENGER_META, buildDailyLevel, buildEndlessLevel };
export const DT = 1 / 120;

export const TRAIN = {
  halfW: 265,
  roofY: -158,
  floorY: -26,
  noseW: 48,
  noseY: -78,
  tailW: 40,
  tailY: -96,
};

export const BODY_TYPES = [
  {
    id: 'thin',
    name: PASSENGER_META.thin.name,
    feature: PASSENGER_META.thin.feature,
    r0: 10.5, r1: 9.5, bone: 18,
    mass: 0.62,
    roofFric: 0.40,
    gripStrength: 0.80,
    gripRange: 44,
    maxGrips: 2,
    crouchShrink: 0.50,
    anchorBothEnds: false,
    sideCling: false,
    basketCatch: false,
    shoulderBoost: 1.0,
    scoreWeight: 1,
    shirt: '#38BDF8', pants: '#0F172A', skin: '#F9D1B1', hat: null,
  },
  {
    id: 'fat',
    name: PASSENGER_META.fat.name,
    feature: PASSENGER_META.fat.feature,
    r0: 21, r1: 20, bone: 20,
    mass: 3.5,
    roofFric: 0.94,
    gripStrength: 2.65,
    gripRange: 52,
    maxGrips: 2,
    crouchShrink: 0.46,
    anchorBothEnds: false,
    sideCling: false,
    basketCatch: false,
    shoulderBoost: 1.48,
    scoreWeight: 1,
    shirt: '#EF4444', pants: '#1E293B', skin: '#F7C9A6', hat: '#FACC15',
  },
  {
    id: 'acrobat',
    name: PASSENGER_META.acrobat.name,
    feature: PASSENGER_META.acrobat.feature,
    r0: 10, r1: 9.5, bone: 21,
    mass: 0.58,
    roofFric: 0.50,
    gripStrength: 1.45,
    gripRange: 58,
    maxGrips: 3,
    crouchShrink: 0.50,
    anchorBothEnds: true,
    sideCling: true,
    basketCatch: false,
    shoulderBoost: 1.0,
    scoreWeight: 1,
    shirt: '#22C55E', pants: '#14532D', skin: '#F9D2B3', hat: '#EF4444',
  },
  {
    id: 'tall',
    name: PASSENGER_META.tall.name,
    feature: PASSENGER_META.tall.feature,
    r0: 11.5, r1: 10.5, bone: 50,
    mass: 1.22,
    roofFric: 0.64,
    gripStrength: 1.52,
    gripRange: 84,
    maxGrips: 3,
    crouchShrink: 0.65, // 竹竿缩头压得更低，配合跨堆拉索更耐过涵洞
    anchorBothEnds: false,
    sideCling: false,
    basketCatch: false,
    shoulderBoost: 1.18,
    scoreWeight: 1,
    shirt: '#A855F7', pants: '#2E1065', skin: '#F4C4A0', hat: '#F8FAFC',
  },
  {
    id: 'auntie',
    name: PASSENGER_META.auntie.name,
    feature: PASSENGER_META.auntie.feature,
    r0: 16, r1: 14.5, bone: 26,
    mass: 2.30,
    roofFric: 0.80,
    gripStrength: 1.76,
    gripRange: 50,
    maxGrips: 2,
    crouchShrink: 0.48,
    anchorBothEnds: false,
    sideCling: false,
    basketCatch: true, // 方案 A：双侧巨型菜篮兜底安全网
    shoulderBoost: 1.16,
    scoreWeight: 1,
    shirt: '#F59E0B', pants: '#78350F', skin: '#F5C6A2', hat: '#FB7185',
  },
  {
    id: 'vip',
    name: PASSENGER_META.vip.name,
    feature: PASSENGER_META.vip.feature,
    r0: 13.5, r1: 12.5, bone: 24,
    mass: 1.12,
    roofFric: 0.34,
    gripStrength: 0.86,
    gripRange: 44,
    maxGrips: 2,
    crouchShrink: 0.50,
    anchorBothEnds: false,
    sideCling: false,
    basketCatch: false,
    shoulderBoost: 1.0,
    scoreWeight: 3, // 1 人顶 3 分！
    shirt: '#FACC15', pants: '#1E293B', skin: '#FDE0C6', hat: '#0F172A',
  },
];

export const TYPE_MAP = Object.fromEntries(BODY_TYPES.map((t) => [t.id, t]));
export const DOOR_BAR_XS = [-124, 124];

function buildTrainAnchors() {
  const anchors = [];
  for (let x = -248; x <= 248; x += 38) {
    anchors.push({ id: `roof_${x}`, x, y: TRAIN.roofY - 3, kind: 'roof' });
  }
  for (const dx of DOOR_BAR_XS) {
    anchors.push({ id: `door_${dx}_hi`, x: dx, y: -112, kind: 'door' });
    anchors.push({ id: `door_${dx}_lo`, x: dx, y: -64, kind: 'door' });
  }
  anchors.push({ id: 'nose_top', x: TRAIN.halfW + 4, y: TRAIN.roofY + 26, kind: 'side' });
  anchors.push({ id: 'nose_mid', x: TRAIN.halfW + 6, y: -102, kind: 'side' });
  anchors.push({ id: 'nose_bar', x: TRAIN.halfW + 30, y: TRAIN.noseY - 2, kind: 'nose' });
  anchors.push({ id: 'nose_bumper', x: TRAIN.halfW + TRAIN.noseW - 4, y: -48, kind: 'nose' });
  anchors.push({ id: 'tail_top', x: -TRAIN.halfW - 4, y: TRAIN.roofY + 22, kind: 'side' });
  anchors.push({ id: 'tail_mid', x: -TRAIN.halfW - 6, y: -112, kind: 'side' });
  anchors.push({ id: 'tail_bar', x: -TRAIN.halfW - 24, y: TRAIN.tailY - 2, kind: 'tail' });
  anchors.push({ id: 'tail_low', x: -TRAIN.halfW - 26, y: -56, kind: 'tail' });
  // 隐藏彩蛋车底盘挂钩（两轮组中间，专为「我应该在车底」名梗打造的真实车底扒车位！）
  anchors.push({ id: 'under_L', x: -48, y: TRAIN.floorY + 2, kind: 'under' });
  anchors.push({ id: 'under_R', x: 48, y: TRAIN.floorY + 2, kind: 'under' });
  return anchors;
}

export const TRAIN_ANCHORS = buildTrainAnchors();
const ANCHOR_MAP = Object.fromEntries(TRAIN_ANCHORS.map((a) => [a.id, a]));
const EMPTY_EVENTS = Object.freeze([]);

function removeGrip(grips, index) {
  for (let i = index + 1; i < grips.length; i++) grips[i - 1] = grips[i];
  grips.length--;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextPersonId = 1;

function resolvePartPair(A, aPart, B, bPart, isLast) {
  const aPt = aPart === 0 ? A.p0 : A.p1;
  const bPt = bPart === 0 ? B.p0 : B.p1;
  const aR = aPart === 0 ? A.spec.r0 : A.spec.r1;
  const bR = bPart === 0 ? B.spec.r0 : B.spec.r1;
  const wA = 1 / A.spec.mass, wB = 1 / B.spec.mass, wSum = wA + wB;
  const dx = bPt.x - aPt.x;
  const dy = bPt.y - aPt.y;
  const minD = aR + bR - 1.5;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD || d2 < 1e-6) return;
  const d = Math.sqrt(d2);
  const push = (minD - d) / d;
  const px = dx * push;
  const py = dy * push;
  const fa = wA / wSum;
  const fb = wB / wSum;
  aPt.x -= px * fa;
  aPt.y -= py * fa;
  bPt.x += px * fb;
  bPt.y += py * fb;
  if (isLast) {
    const rvx = (bPt.x - bPt.ox) - (aPt.x - aPt.ox);
    aPt.ox -= rvx * 0.25 * fa;
    bPt.ox += rvx * 0.25 * fb;
    if (dy < -minD * 0.45 && A.spec.mass > B.spec.mass * 1.6) {
      if (B.strainMax < 0.95) B.strainMax = 0.95;
    } else if (dy > minD * 0.45 && B.spec.mass > A.spec.mass * 1.6) {
      if (A.strainMax < 0.95) A.strainMax = 0.95;
    }
  }
}

function projectTrainSurface(point, spec, part, out) {
  const x = point.x, y = point.y, r = part === 0 ? spec.r0 : spec.r1;
  const L = -TRAIN.halfW;
  const R = TRAIN.halfW;
  const T = TRAIN.roofY;
  const B = TRAIN.floorY;
  let outX = x;
  let outY = y;
  let nx = 0;
  let ny = 0;

  if (x > L - r && x < R + r && y > T - r && y < B + r) {
    const penTop = y - (T - r);
    const penLeft = x - (L - r);
    const penRight = (R + r) - x;
    if (penTop <= penLeft && penTop <= penRight) {
      outY = T - r;
      ny = -1;
    } else if (penLeft <= penRight) {
      outX = L - r;
      nx = -1;
    } else {
      outX = R + r;
      nx = 1;
    }
  }

  const nL = TRAIN.halfW - 2;
  const nR = TRAIN.halfW + TRAIN.noseW;
  if (outX > nL - r && outX < nR + r && outY > TRAIN.noseY - r && outY < B + r) {
    const penTop = outY - (TRAIN.noseY - r);
    const penRight = (nR + r) - outX;
    if (penTop <= penRight) { outY = TRAIN.noseY - r; ny = -1; }
    else { outX = nR + r; nx = 1; }
  }

  const tL = -TRAIN.halfW - TRAIN.tailW;
  const tR = -TRAIN.halfW + 2;
  if (outX > tL - r && outX < tR + r && outY > TRAIN.tailY - r && outY < B + r) {
    const penTop = outY - (TRAIN.tailY - r);
    const penLeft = outX - (tL - r);
    if (penTop <= penLeft) { outY = TRAIN.tailY - r; ny = -1; }
    else { outX = tL - r; nx = -1; }
  }

  out.x = outX; out.y = outY; out.normalX = nx; out.normalY = ny;
  return out;
}

export class World {
  constructor(levelOrId = 's1', seed = 20261123, options = {}) {
    this.level = typeof levelOrId === 'string'
      ? (LEVELS.find((l) => l.id === levelOrId) || LEVELS[0])
      : (levelOrId || LEVELS[0]);
    this.seed = seed;
    this.randomWave = Boolean(options.randomWave);
    this.upgrades = {
      fricBonus: options.upgrades?.fricBonus || 0,
      bumpReduce: options.upgrades?.bumpReduce || 0,
      staminaBoost: options.upgrades?.staminaBoost || 0,
      gripLv: options.upgrades?.gripLv || 0,
      springLv: options.upgrades?.springLv || 0,
      staminaLv: options.upgrades?.staminaLv || 0,
    };
    this.perks = new Set(options.perks || []);
    this.perkLevels = {};
    for (const pid of this.perks) this.perkLevels[pid] = 1;
    this.tempPerks = new Set(); // 单站临时词条（如无限体力饮、风平浪静）
    this.gear = {
      superGrip: Boolean(options.gear?.superGrip),
      airbagCharges: options.gear?.airbag ? 1 : 0,
    };

    // 复用容器以消除每帧 GC
    this._byId = new Map();
    this._active = new Array(128);
    this._aunties = new Array(32);
    this._activeCount = 0;
    this._auntieCount = 0;
    this._stepStats = { totalMass: 0.1, comX: 0.1, norm: 0.1, maxHeight: 0.1 };
    this._surfaceOut = { x: 0.1, y: 0.1, normalX: 0, normalY: 0 };
    this._projectionInput = { x: 0.1, y: 0.1 };
    this._projectionSpec = { r0: 0.1 };
    this._tunnelInfo = {};
    this._windInfo = {};
    this._stopInfo = {};
    this.reset();
  }

  reset() {
    this._indexDirty = true;
    this.rng = mulberry32(this.seed);
    this.phase = 'loading';
    this.time = 0;
    this.loadLeft = this.level.loadTime;
    this.settleTime = 0;

    this.trainX = 0;
    this.speed = 0;
    this.accelX = 0;
    this.tilt = 0;
    this.tiltV = 0;
    this.bumpY = 0;
    this.bumpAccY = 0;
    this.railTick = 0;
    this.beatPhase = 0;
    this.bpm = 104;
    this.braking = false;
    this.brakeAlerted = false;

    // 阵风、坡道、飞坡跳台与中途急停运行时状态
    this.activeWind = null;
    this.windAlert = null;
    this.activeSlope = null;
    this.slopePitch = 0;
    this._triggeredRamps = new Set();
    this.midStopStates = (this.level.midStops || []).map((m) => ({
      ...m,
      state: 'idle', // 'idle' | 'braking' | 'holding' | 'done'
      holdLeft: m.holdSec || 0.7,
    }));
    this.midStopAlert = null;

    this.pool = { thin: 0, fat: 0, acrobat: 0, tall: 0, auntie: 0, vip: 0, ...this.level.pool };
    this.poolDepletedNotified = false;
    this.queue = this.buildShuffledDeck();
    this.stationLine = this.buildStationLine();
    this.undoStack = [];
    this.reinforcedUsed = false;
    this.sidebarBonusUsed = false;
    this.departSnapshot = null;

    // 默认统一按站台排队顺序登车（mix）；开启 randomWave 时每波随机 1~3 人结伴齐扑（测试未开启时保持单发确定性，也支持显式覆盖 burstSize）
    this.squadFilter = 'mix';
    this._burstLocked = false;
    this._burstSize = 1;
    if (this.randomWave) this.rollNextWaveSize();
    this.crouching = false;
    this.boosting = false;
    this.boostTime = 0;
    this.runTime = 0;
    this.crouchBlend = 0;
    this.stamina = 1.0;
    this._staminaWasExhausted = false;
    this._basketFullCooldown = 0;
    this.leanInput = 0;

    this.people = [];
    this.spawnedTotal = 0;
    this.lastLaunchTime = 0;
    this.fallenTotal = 0;
    this.basketCatchCount = 0;
    this.tallRescueCount = 0;
    this.departCount = 0;
    this.peakHeight = 0;
    this.sawWindZone = false;
    this.wasInWind = false;
    this.underCarRideSec = 0;
    this.noseRideSec = 0;
    this.tailRideSec = 0;
    this.vipRideSec = 0;
    this.spiderRideSec = 0;
    this._bonkBurstCount = 0;
    this._bonkBurstTimer = 0;
    this.tunnelBonkTotal = 0;
    this._fallBurstCount = 0;
    this._fallBurstTimer = 0;
    this._runAchEmitted = new Set();
    this.peakOnBoard = 0;
    this.peakScore = 0;
    this.finalCount = 0;
    this.finalScore = 0;
    this.events = [];
    this.tunnelAlert = null;
  }

  get burstSize() {
    return this._burstSize || 1;
  }

  set burstSize(v) {
    this._burstSize = Math.max(1, Number(v) || 1);
    this._burstLocked = true;
  }

  /** 每波登车自动随机 1~3 人一起上车（第 1 关 1~2 人平稳上手，后续关卡根据排头小簇随机 1~3 人结伴齐扑！） */
  rollNextWaveSize() {
    if (!this.randomWave || this._burstLocked) {
      if (this.stationLine && this.stationLine.length) {
        this.syncStationLineTargets();
      }
      return this._burstSize;
    }
    if (this.level && this.level.strictQueue) {
      this._burstSize = 1;
    } else {
      const avail = this.poolTotal();
      if (avail <= 0) {
        this._burstSize = 1;
      } else {
        const isL1 = this.level && this.level.id === 's1';
        const maxWave = Math.min(isL1 ? 2 : 3, avail);
        const h0 = this.queue[0];
        let sameRun = 1;
        while (sameRun < maxWave && this.queue[sameRun] === h0) sameRun++;
        const r = this.rng();
        let n = 1;
        if (sameRun >= 2 && r < 0.72) {
          n = sameRun;
        } else if (r < 0.34) {
          n = 1;
        } else if (r < 0.74) {
          n = Math.min(2, maxWave);
        } else {
          n = maxWave;
        }
        this._burstSize = Math.max(1, Math.min(maxWave, n));
      }
    }
    if (this.stationLine && this.stationLine.length) {
      this.syncStationLineTargets();
    }
    return this._burstSize;
  }

  hasPerk(id) {
    return this.perks.has(id) || this.tempPerks.has(id);
  }

  getPerkLevel(id) {
    if (this.tempPerks.has(id)) return 1;
    if (!this.perks.has(id)) return 0;
    return Math.max(1, this.perkLevels[id] || 1);
  }

  /** 无尽专列：保留车上存活乘客进入下一站，并生效三选一词条（重复选永久词条可升星叠加至 Lv.3！） */
  continueEndlessWave(nextLevel, perkId) {
    this.events.length = 0;
    this.finalCount = 0;
    this.finalScore = 0;
    this.level = nextLevel;
    this.tempPerks.clear();
    if (perkId) {
      if (perkId === 'energyDrink' || perkId === 'calmWind') {
        this.tempPerks.add(perkId);
      } else if (perkId !== 'doorRush' && perkId !== 'vipDrop') {
        this.perks.add(perkId);
        this.perkLevels[perkId] = Math.min(3, (this.perkLevels[perkId] || 0) + 1);
      }
    }

    this.phase = 'loading';
    this.loadLeft = nextLevel.loadTime;
    this.settleTime = 0;
    this.trainX = 0;
    this.speed = 0;
    this.accelX = 0;
    this.bumpY = 0;
    this.bumpAccY = 0;
    this.braking = false;
    this.brakeAlerted = false;
    this.activeWind = null;
    this.windAlert = null;
    this.activeSlope = null;
    this.slopePitch = 0;
    this._triggeredRamps = new Set();
    this.tunnelAlert = null;
    this.midStopAlert = null;
    this.midStopStates = (nextLevel.midStops || []).map((m) => ({
      ...m, state: 'idle', holdLeft: m.holdSec || 0.7,
    }));
    this.crouching = false;
    this.boosting = false;
    this.boostTime = 0;
    this.runTime = 0;
    this.crouchBlend = 0;
    this.stamina = 1.0;
    this.leanInput = 0;
    this.reinforcedUsed = false;
    this.departSnapshot = null;
    this.undoStack.length = 0;
    this.lastLaunchTime = this.time || 0;

    // 保留所有存活乘客并抹平瞬时残余速度
    this.people = this.people.filter((p) => !p.fallen);
    this._indexDirty = true;
    const survivorIds = new Set(this.people.map((p) => p.id));
    for (const p of this.people) {
      p.grips = p.grips.filter((g) => g.kind === 'anchor' || survivorIds.has(g.targetId));
      p.flying = false;
      p.screamed = false;
      p.p0.ox = p.p0.x; p.p0.oy = p.p0.y;
      p.p1.ox = p.p1.x; p.p1.oy = p.p1.y;
    }

    // 补充新一站候车池并重建真实排队队列
    for (const [k, v] of Object.entries(nextLevel.pool)) {
      this.pool[k] = (this.pool[k] || 0) + v;
    }
    this.queue = this.buildShuffledDeck();
    this.stationLine = this.buildStationLine();
    this.rollNextWaveSize();
    this.poolDepletedNotified = false;
    if (perkId === 'doorRush') this.airdropPassengers('acrobat', 5);
    if (perkId === 'vipDrop') this.airdropPassengers('vip', 2);
    this.events.push({ type: 'endlessWave', wave: nextLevel.wave, perkId });
  }

  /** 站台长单排一字排开候车队伍：整体靠左排布（排头锚定在 x=-40），不挡车头且与左下登车卡自然呼应！ */
  buildStationLine() {
    const line = [];
    for (let i = 0; i < this.queue.length; i++) {
      line.push({
        qid: nextPersonId++,
        typeId: this.queue[i],
        row: 0,
        x: -40,
        targetX: -40,
        jitterX: i === 0 ? 0 : (this.rng() - 0.5) * 5,
        sameCluster: false,
        walkPhase: (i * 0.7) % 6.28,
        moving: false,
      });
    }
    this.stationLine = line;
    this.syncStationLineTargets();
    for (let i = 0; i < line.length; i++) line[i].x = line[i].targetX;
    return line;
  }

  syncStationLineTargets() {
    const headX = -40;
    let curX = headX;
    const waveN = this.level && this.level.strictQueue
      ? 1
      : Math.max(1, Math.min(3, this._burstSize || 1));
    for (let i = 0; i < this.stationLine.length; i++) {
      const w = this.stationLine[i];
      const samePrev = i > 0 && this.stationLine[i - 1].typeId === w.typeId;
      const sameNext = i + 1 < this.stationLine.length && this.stationLine[i + 1].typeId === w.typeId;
      w.sameCluster = samePrev || sameNext;
      if (i > 0) {
        if (i < waveN) {
          // 即将上车的下一波 1~3 人体型放大到 0.80x；若含宽体胖叔/大妈则加宽间距至 45px 防止互挤！
          const prevType = this.stationLine[i - 1].typeId;
          const isWide = w.typeId === 'fat' || w.typeId === 'auntie' || prevType === 'fat' || prevType === 'auntie';
          curX -= isWide ? 45 : 38;
        } else if (i === waveN) {
          // 下一波候车组与后方普通排队人群之间留出 54px 醒目视觉分界间距！
          curX -= 54;
        } else {
          // 后方普通排队队伍：同类型同伴紧凑站位(25px)，不同簇之间拉开自然间隔(40px)
          curX -= samePrev ? 25 : 40;
        }
      }
      w.row = 0;
      const jit = i < waveN ? 0 : (w.jitterX || 0);
      w.targetX = curX + jit;
    }
  }

  popFromStationLine(typeId) {
    if (!this.stationLine.length) return null;
    let idx = (this.level.strictQueue || this.squadFilter === 'mix')
      ? 0
      : this.stationLine.findIndex((w) => w.typeId === typeId);
    if (idx < 0) idx = 0;
    const [item] = this.stationLine.splice(idx, 1);
    this.syncStationLineTargets();
    return item;
  }

  pushToStationLine(typeId, atFront = false) {
    const headX = -40;
    const tailX = this.stationLine.length > 0 ? this.stationLine[this.stationLine.length - 1].targetX : headX;
    const spawnX = atFront ? headX + 18 : Math.min(-660, tailX - 56);
    const waiter = {
      qid: nextPersonId++,
      typeId,
      row: 0,
      x: spawnX,
      targetX: spawnX,
      jitterX: atFront ? 0 : (this.rng() - 0.5) * 5,
      sameCluster: false,
      walkPhase: Math.random() * 6.28,
      moving: true,
    };
    if (atFront) this.stationLine.unshift(waiter);
    else this.stationLine.push(waiter);
    this.syncStationLineTargets();
  }

  stepStationLine(dt) {
    const speedK = Math.min(1, dt * 8.5);
    for (let i = 0; i < this.stationLine.length; i++) {
      const w = this.stationLine[i];
      const diff = w.targetX - w.x;
      if (Math.abs(diff) > 0.6) {
        w.x += diff * speedK;
        w.moving = true;
        w.walkPhase += dt * 15;
      } else {
        w.x = w.targetX;
        w.moving = false;
      }
    }
  }

  /** 站间奖励直接从画面上方落到车上，不占用下一站的普通候车名额。 */
  airdropPassengers(typeId, count) {
    const filter = this.squadFilter;
    const prevBurst = this._burstSize;
    const prevLocked = this._burstLocked;
    const undoCount = this.undoStack.length;
    const ids = [];
    this.pool[typeId] += count;
    for (let i = 0; i < count; i++) this.queue.unshift(typeId);
    this.squadFilter = typeId;
    this._burstSize = 1;
    this._burstLocked = true;
    for (let i = 0; i < count; i++) {
      const x = typeId === 'acrobat' ? DOOR_BAR_XS[i % 2] : (i === 0 ? -80 : 80);
      const y = typeId === 'acrobat' ? -112 + Math.floor(i / 2) * 18 : TRAIN.roofY - 26;
      if (!this.launchAt(x, y)) continue;
      const p = this.people[this.people.length - 1];
      p.flyFromY = -470;
      p.flyDur = 0.36;
      p.p0.y = p.p0.oy = p.flyFromY;
      p.p1.y = p.p1.oy = p.flyFromY - p.spec.bone;
      ids.push(p.id);
    }
    this.undoStack.length = Math.min(undoCount, this.undoStack.length);
    if (ids.length) this.undoStack.push({ ids });
    this.squadFilter = filter;
    this._burstSize = prevBurst;
    this._burstLocked = prevLocked;
    this.syncStationLineTargets();
  }

  /** 高随机性 + 偏「一簇一簇」结伴进站的候车队列生成器（支持同 seed 每日专列确定性） */
  buildShuffledDeck() {
    const rem = {};
    let total = 0;
    for (const [id, cnt] of Object.entries(this.pool)) {
      if (cnt > 0) {
        rem[id] = cnt;
        total += cnt;
      }
    }
    const deck = [];
    let lastId = null;
    // 若本关有新登场角色（newType），首簇优先安排该角色排头登场，配合登场提示所见即所得！
    const firstNew = this.level && this.level.newType;
    if (firstNew && rem[firstNew] > 0) {
      const firstRun = Math.min(rem[firstNew], firstNew === 'vip' ? 1 : 2);
      for (let k = 0; k < firstRun; k++) deck.push(firstNew);
      rem[firstNew] -= firstRun;
      total -= firstRun;
      lastId = firstNew;
    }
    while (total > 0) {
      const avail = Object.keys(rem).filter((k) => rem[k] > 0);
      if (!avail.length) break;
      const poolPick = avail.length > 1 ? avail.filter((k) => k !== lastId) : avail;

      // 柔和平方根加权：既有数量倾向，又让各体型在队列前中后都有随机登场的惊喜感
      let weightSum = 0;
      const weights = poolPick.map((k) => {
        const w = Math.sqrt(rem[k]) + 0.55;
        weightSum += w;
        return w;
      });
      let r = this.rng() * weightSum;
      let chosen = poolPick[poolPick.length - 1];
      for (let i = 0; i < poolPick.length; i++) {
        r -= weights[i];
        if (r <= 0) { chosen = poolPick[i]; break; }
      }

      // 偏一簇一簇：普通乘客 2~4 人结伴小簇为主（偶尔 1 人独行），VIP 偏 1~2 人
      const roll = this.rng();
      let cluster = 1;
      if (chosen === 'vip') {
        cluster = roll < 0.68 ? 1 : 2;
      } else {
        if (roll < 0.18) cluster = 1;
        else if (roll < 0.56) cluster = 2;
        else if (roll < 0.87) cluster = 3;
        else cluster = 4;
      }
      const take = Math.min(cluster, rem[chosen]);
      for (let k = 0; k < take; k++) deck.push(chosen);
      rem[chosen] -= take;
      total -= take;
      lastId = chosen;
    }
    return deck;
  }

  poolTotal() {
    let n = 0;
    for (const v of Object.values(this.pool)) n += v;
    return n;
  }

  availableForFilter(filter = this.squadFilter) {
    if (filter === 'mix') return this.poolTotal();
    return this.pool[filter] || 0;
  }

  /** 激励视频 A：站台清光时按需空降外援（+5胖叔 +5挂壁娃） */
  grantReinforcement() {
    if (this.phase !== 'loading' || this.reinforcedUsed) return false;
    this.reinforcedUsed = true;
    this.pool.fat = (this.pool.fat || 0) + 5;
    this.pool.acrobat = (this.pool.acrobat || 0) + 5;
    for (let i = 0; i < 5; i++) {
      this.queue.unshift('fat');
      this.queue.unshift('acrobat');
      this.pushToStationLine('fat', false);
      this.pushToStationLine('acrobat', false);
    }
    if (this.squadFilter !== 'mix') this.squadFilter = 'mix';
    this.poolDepletedNotified = false;
    this.events.push({ type: 'reinforce' });
    return true;
  }

  /** 抖音侧边栏复访礼：+3 挂壁娃 + 3 胖叔 */
  grantSidebarBonus() {
    if (this.sidebarBonusUsed) return false;
    this.sidebarBonusUsed = true;
    this.pool.acrobat = (this.pool.acrobat || 0) + 3;
    this.pool.fat = (this.pool.fat || 0) + 3;
    for (let i = 0; i < 3; i++) {
      this.queue.unshift('acrobat');
      this.queue.unshift('fat');
      this.pushToStationLine('acrobat', true);
      this.pushToStationLine('fat', true);
    }
    this.poolDepletedNotified = false;
    this.events.push({ type: 'sidebarBonus' });
    return true;
  }

  /** 开局激励视频神装：车顶强力防滑胶带 + 撞洞安全气囊（保命1次） */
  activateOpeningGear() {
    this.gear.superGrip = true;
    this.gear.airbagCharges = 1;
    this.events.push({ type: 'gearReady' });
  }

  captureDepartSnapshot() {
    this.departSnapshot = {
      tilt: this.tilt,
      airbagCharges: this.gear.airbagCharges,
      people: this.people.filter((p) => !p.fallen).map((p) => ({
        id: p.id,
        typeId: p.typeId,
        onSideWall: p.onSideWall,
        onUnderCarriage: Boolean(p.onUnderCarriage),
        p0: { x: p.p0.x, y: p.p0.y },
        p1: { x: p.p1.x, y: p.p1.y },
        grips: p.grips.map((g) => (g.kind === 'anchor'
          ? { kind: 'anchor', anchorId: g.anchor.id, myPart: g.myPart, restLen: g.restLen }
          : { kind: g.kind, targetId: g.targetId, targetPart: g.targetPart, myPart: g.myPart, restLen: g.restLen, side: g.side || 0 })),
      })),
    };
  }

  /** 激励视频 B：带防滑气囊护盾，保留发车前排布快照直接重跑一趟 */
  retryFromDepartSnapshot({ withShield = false } = {}) {
    if (!this.departSnapshot || !this.departSnapshot.people.length) return false;
    const snap = this.departSnapshot;
    this.events.length = 0;
    this.finalCount = 0;
    this.finalScore = 0;
    this.phase = 'running';
    this.trainX = 0;
    this.speed = 0;
    this.accelX = 0;
    this.tilt = snap.tilt;
    this.tiltV = 0;
    this.bumpY = 0;
    this.bumpAccY = 0;
    this.braking = false;
    this.brakeAlerted = false;
    this.activeWind = null;
    this.windAlert = null;
    this.activeSlope = null;
    this.slopePitch = 0;
    this._triggeredRamps = new Set();
    this.midStopAlert = null;
    this.midStopStates = (this.level.midStops || []).map((m) => ({
      ...m, state: 'idle', holdLeft: m.holdSec || 0.7,
    }));
    this.settleTime = 0;
    this.crouching = false;
    this.boosting = false;
    this.boostTime = 0;
    this.runTime = 0;
    this.crouchBlend = 0;
    this.stamina = 1.0;
    this.leanInput = 0;
    this.fallenTotal = 0;
    this.basketCatchCount = 0;
    this.tallRescueCount = 0;
    this.departCount = this.onBoardCount();
    this.sawWindZone = false;
    this.wasInWind = false;
    this.underCarRideSec = 0;
    this.noseRideSec = 0;
    this.tailRideSec = 0;
    this.vipRideSec = 0;
    this.spiderRideSec = 0;
    this._bonkBurstCount = 0;
    this._bonkBurstTimer = 0;
    this.tunnelBonkTotal = 0;
    this._fallBurstCount = 0;
    this._fallBurstTimer = 0;
    this._runAchEmitted = new Set();
    this.tunnelAlert = null;
    if (withShield) {
      this.gear.superGrip = true;
      this.gear.airbagCharges = 1;
    } else {
      this.gear.airbagCharges = snap.airbagCharges || 0;
    }

    this.people = snap.people.map((sp) => ({
      id: sp.id,
      typeId: sp.typeId,
      spec: TYPE_MAP[sp.typeId],
      flying: false,
      flyT: 0, flyDur: 0.13, flyFromX: 0, flyFromY: 0, flyToX: 0, flyToY: 0,
      p0: { x: sp.p0.x, y: sp.p0.y, ox: sp.p0.x, oy: sp.p0.y },
      p1: { x: sp.p1.x, y: sp.p1.y, ox: sp.p1.x, oy: sp.p1.y },
      grips: sp.grips
        .map((g) => (g.kind === 'anchor'
          ? (ANCHOR_MAP[g.anchorId] ? { kind: 'anchor', anchor: ANCHOR_MAP[g.anchorId], myPart: g.myPart, restLen: g.restLen, strain: 0, breakT: 0 } : null)
          : { kind: g.kind, targetId: g.targetId, targetPart: g.targetPart, myPart: g.myPart, restLen: g.restLen, side: g.side || 0, strain: 0, breakT: 0 }))
        .filter(Boolean),
      onSideWall: sp.onSideWall,
      onUnderCarriage: Boolean(sp.onUnderCarriage),
      airTime: 0,
      airSpin: 0,
      lastAng: null,
      basketCount: 0,
      fallen: false,
      screamed: false,
      perfect: true,
      strainMax: 0,
      mood: 'happy',
      tiltHint: 0,
    }));
    this._indexDirty = true;

    this.peakOnBoard = this.onBoardCount();
    this.peakScore = this.onBoardScore();
    this.events.push({ type: 'depart', count: this.peakOnBoard, score: this.peakScore, retry: true });
    return true;
  }

  takeNextType() {
    if (this.level.strictQueue || this.squadFilter === 'mix') {
      const id = this.queue.shift();
      if (!id) return null;
      this.pool[id] = Math.max(0, (this.pool[id] || 0) - 1);
      return id;
    }
    const want = this.squadFilter;
    if ((this.pool[want] || 0) <= 0) return null;
    this.pool[want]--;
    const idx = this.queue.indexOf(want);
    if (idx >= 0) this.queue.splice(idx, 1);
    if (this.pool[want] === 0 && this.poolTotal() > 0) {
      // 指定角色用光后自动回到按排队顺序，顺滑绝不空点
      this.squadFilter = 'mix';
    }
    return want;
  }

  undoLastBatch() {
    if (this.phase !== 'loading' || !this.undoStack.length) return 0;
    const batch = this.undoStack.pop();
    const idSet = new Set(batch.ids);
    let restored = 0;
    const keep = [];
    for (const p of this.people) {
      if (idSet.has(p.id)) {
        this.pool[p.typeId] = (this.pool[p.typeId] || 0) + 1;
        this.queue.unshift(p.typeId);
        this.pushToStationLine(p.typeId, true);
        restored++;
      } else {
        keep.push(p);
      }
    }
    this.people = keep;
    this._indexDirty = true;
    if (restored > 0) {
      if (!this._burstLocked) {
        this._burstSize = Math.max(1, Math.min(3, batch.waveSize || restored));
      }
      this.syncStationLineTargets();
      this.poolDepletedNotified = false;
      this.events.push({ type: 'undo', count: restored });
    }
    return restored;
  }

  previewFormation(targetX, targetY) {
    const avail = this.level.strictQueue ? this.poolTotal() : this.availableForFilter();
    if (avail <= 0) return [];
    const count = (this.level.strictQueue || (!this._burstLocked && this.squadFilter !== 'mix'))
      ? 1
      : Math.min(this.burstSize, avail);
    const list = [];
    const getT = (i) => ((this.level.strictQueue || this.squadFilter === 'mix')
      ? (this.queue[i] || 'thin')
      : this.squadFilter);

    if (count === 1) {
      list.push({ typeId: getT(0), x: targetX, y: targetY });
    } else if (count <= 3) {
      let hasWide = false;
      for (let i = 0; i < count; i++) {
        const tid = getT(i);
        if (tid === 'fat' || tid === 'auntie') { hasWide = true; break; }
      }
      const offs = hasWide
        ? (count === 2 ? [-23, 23] : [-44, 0, 44])
        : (count === 2 ? [-18, 18] : [-34, 0, 34]);
      for (let i = 0; i < count; i++) {
        list.push({ typeId: getT(i), x: targetX + offs[i], y: targetY + (i === 1 ? -4 : 0) });
      }
    } else {
      const offs = [[-36, 4], [0, 4], [36, 4], [-18, -28], [18, -28]];
      for (let i = 0; i < count; i++) {
        list.push({ typeId: getT(i), x: targetX + offs[i][0], y: targetY + offs[i][1] });
      }
    }
    return list;
  }

  launchAt(targetX, targetY, angleHint = 0) {
    if (this.phase !== 'loading') return 0;
    if (this.poolTotal() <= 0) {
      if (!this.poolDepletedNotified) {
        this.poolDepletedNotified = true;
        this.events.push({ type: 'poolEmpty' });
      }
      return 0;
    }

    const cx = Math.max(-TRAIN.halfW - 55, Math.min(TRAIN.halfW + 65, targetX));
    const cy = Math.max(-440, Math.min(-22, targetY));
    const formation = this.previewFormation(cx, cy);
    if (!formation.length) return 0;

    let launched = 0;
    let launchedScore = 0;
    const batchIds = [];
    const isBeatPerfect = this.beatPhase < 0.20 || this.beatPhase > 0.80;

    for (const slot of formation) {
      const typeId = this.takeNextType();
      if (!typeId) break;
      const spec = TYPE_MAP[typeId];
      // 从真实排队队伍中请出排最前的对应人员，直接从他的排队站位一跃起跳上车！
      const queued = this.popFromStationLine(typeId);
      const startX = queued ? Math.max(-560, Math.min(340, queued.x)) : (slot.x + (this.rng() - 0.5) * 28);
      const startY = 24;
      const pid = nextPersonId++;
      this.people.push({
        id: pid,
        typeId,
        spec,
        flying: true,
        flyT: 0,
        flyDur: 0.16,
        flyFromX: startX,
        flyFromY: startY,
        flyToX: Math.max(-TRAIN.halfW - 44, Math.min(TRAIN.halfW + 52, slot.x)),
        flyToY: Math.max(-430, Math.min(-22, slot.y)),
        p0: { x: startX, y: startY, ox: startX, oy: startY },
        p1: { x: startX, y: startY - spec.bone, ox: startX, oy: startY - spec.bone },
        grips: [],
        onSideWall: false,
        onUnderCarriage: false,
        airTime: 0,
        airSpin: 0,
        lastAng: null,
        basketCount: 0,
        fallen: false,
        screamed: false,
        perfect: false,
        strainMax: 0,
        mood: 'happy',
        tiltHint: angleHint,
      });
      batchIds.push(pid);
      this.spawnedTotal++;
      this._indexDirty = true;
      launched++;
      launchedScore += spec.scoreWeight;
    }

    if (launched > 0) {
      this.lastLaunchTime = this.time || 0;
      this.undoStack.push({ ids: batchIds, waveSize: launched });
      if (this.undoStack.length > 24) this.undoStack.shift();
      this.rollNextWaveSize();
      this.events.push({ type: 'launch', count: launched, score: launchedScore, x: cx, y: cy, perfect: false });
      if (this.poolTotal() === 0 && !this.poolDepletedNotified) {
        this.poolDepletedNotified = true;
        this.events.push({ type: 'poolEmpty' });
      }
    }
    return launched;
  }

  /** 文明排队专列（严禁插队）专用：按排头顺序将当前第 1 位乘客精准放到列车左侧(-1)或右侧(+1) */
  launchOnSide(side = -1) {
    if (this.phase !== 'loading' || this.poolTotal() <= 0) return 0;
    const nextId = this.level.strictQueue ? this.queue[0] : this.squadFilter;
    const dir = side < 0 ? -1 : 1;

    // 挂壁娃优先自动找对应侧的扶手车门（每侧车门最多轻松挂 4 位，超出再叠车顶）
    if (nextId === 'acrobat') {
      const doorX = dir < 0 ? DOOR_BAR_XS[0] : DOOR_BAR_XS[1];
      let onDoor = 0;
      for (let i = 0; i < this.people.length; i++) {
        const p = this.people[i];
        if (!p.fallen && p.onSideWall && Math.abs(p.p0.x - doorX) < 62) onDoor++;
      }
      if (onDoor < 4) {
        return this.launchAt(doorX + (this.rng() - 0.5) * 18, -112 + onDoor * 10);
      }
    }

    // 在所选半侧的 3 个自然错位列里挑当前最矮的一列，保证左右平衡感直观且不易堆穿天
    const slots = dir < 0 ? [-172, -112, -52] : [52, 112, 172];
    let bestX = slots[1];
    let bestY = -9999; // 数值越大代表越靠下（越低）
    for (let s = 0; s < slots.length; s++) {
      const sx = slots[s];
      let highestY = TRAIN.roofY - 12;
      for (let i = 0; i < this.people.length; i++) {
        const p = this.people[i];
        if (p.fallen || p.onSideWall) continue;
        const px = p.flying ? p.flyToX : p.p0.x;
        const py = p.flying ? p.flyToY : Math.min(p.p0.y, p.p1.y);
        if (Math.abs(px - sx) < 42 && py - 24 < highestY) {
          highestY = py - 24;
        }
      }
      if (highestY > bestY) {
        bestY = highestY;
        bestX = sx;
      }
    }
    const jitter = (this.rng() - 0.5) * 20;
    return this.launchAt(bestX + jitter, Math.max(-390, bestY));
  }

  emitAchievement(id, x = 0, y = TRAIN.roofY - 60) {
    if (!id || this._runAchEmitted.has(id)) return;
    this._runAchEmitted.add(id);
    this.events.push({ type: 'achievement', id, x, y });
  }

  depart() {
    if (this.phase !== 'loading') return false;
    if (this.onBoardCount() === 0) {
      this.events.push({ type: 'needPeople' });
      return false;
    }
    for (const p of this.people) {
      if (p.flying) this.finishFly(p);
    }
    this.departCount = this.onBoardCount();
    const st = this.massStats(this._stepStats);
    this.peakHeight = Math.max(this.peakHeight, st.maxHeight);
    if (this.peakHeight >= 180) {
      this.emitAchievement('fly_higher');
    }
    if (this.poolTotal() === 0 && this.departCount >= 15) {
      this.emitAchievement('full_house');
    }
    this.captureDepartSnapshot();
    this.phase = 'running';
    this.undoStack.length = 0;
    this.lastLaunchTime = this.time || 0;
    this.events.push({ type: 'depart', count: this.departCount, score: this.onBoardScore() });
    return true;
  }

  finishFly(p) {
    p.flying = false;
    let nearDoor = false;
    if (p.spec.sideCling && p.flyToY > TRAIN.roofY + 8 && p.flyToY < TRAIN.floorY - 6) {
      for (let i = 0; i < DOOR_BAR_XS.length; i++) {
        if (Math.abs(p.flyToX - DOOR_BAR_XS[i]) <= 58) { nearDoor = true; break; }
      }
    }
    // 隐藏「我应该在车底」彩蛋位：点在车底两轮组之间可直接扒在车底盘！
    const underCar = !nearDoor && p.flyToY >= -52 && Math.abs(p.flyToX) <= 108;
    p.onSideWall = nearDoor;
    p.onUnderCarriage = underCar;

    if (underCar) {
      const ux = Math.max(-78, Math.min(78, p.flyToX));
      const uy = TRAIN.floorY + 6;
      const halfB = Math.min(18, p.spec.bone * 0.45);
      p.p0.x = ux - halfB; p.p0.y = uy;
      p.p1.x = ux + halfB; p.p1.y = uy;
      p.p0.ox = p.p0.x; p.p0.oy = p.p0.y;
      p.p1.ox = p.p1.x; p.p1.oy = p.p1.y;
      this.attachInitialGrips(p);
      this.events.push({
        type: 'grab', x: ux, y: uy, grips: p.grips.length,
        typeId: p.typeId, onSideWall: false, onUnderCarriage: true, scoreWeight: p.spec.scoreWeight,
      });
      return;
    }

    const safe = nearDoor
      ? { x: p.flyToX, y: p.flyToY }
      : this.pushOutOfTrain(p.flyToX, p.flyToY, p.spec.r0);

    p.p0.x = safe.x;
    p.p0.y = safe.y;
    p.p1.x = safe.x + (p.tiltHint || 0) * 6;
    p.p1.y = safe.y - p.spec.bone;
    // 去掉隐形节拍随机差速，保持每次落手物理手感 100% 稳定可预期
    p.p0.ox = p.p0.x;
    p.p0.oy = p.p0.y - 0.22;
    p.p1.ox = p.p1.x;
    p.p1.oy = p.p1.y - 0.22;

    this.attachInitialGrips(p);
    this.events.push({
      type: 'grab',
      x: safe.x,
      y: safe.y,
      grips: p.grips.length,
      typeId: p.typeId,
      onSideWall: nearDoor,
      scoreWeight: p.spec.scoreWeight,
    });
  }

  attachInitialGrips(p) {
    const spec = p.spec;
    const cands = [];

    for (let i = 0; i < TRAIN_ANCHORS.length; i++) {
      const a = TRAIN_ANCHORS[i];
      if (a.kind === 'door' && !spec.sideCling) continue;
      if (a.kind === 'under' && !p.onUnderCarriage) continue;
      if (p.onUnderCarriage && a.kind !== 'under') continue;
      if (p.onSideWall && a.kind !== 'door') continue;
      const d0 = Math.hypot(a.x - p.p0.x, a.y - p.p0.y);
      const d1 = Math.hypot(a.x - p.p1.x, a.y - p.p1.y);
      const bestD = Math.min(d0, d1);
      const reach = p.onUnderCarriage ? 115 : ((a.kind === 'door' && spec.sideCling) ? 88 : spec.gripRange * 1.15);
      if (bestD <= reach) {
        cands.push({
          priority: a.kind === 'door' || a.kind === 'under' ? bestD * 0.4 : bestD * 0.72,
          grip: {
            kind: 'anchor',
            anchor: a,
            myPart: d0 <= d1 ? 0 : 1,
            restLen: Math.max(8, bestD * 0.88),
            strain: 0,
            breakT: 0,
          },
        });
      }
    }

    if (!p.onSideWall && !p.onUnderCarriage) {
      for (let i = 0; i < this.people.length; i++) {
        const o = this.people[i];
        if (o.id === p.id || o.flying || o.fallen || o.onSideWall) continue;
        const d00 = Math.hypot(o.p0.x - p.p0.x, o.p0.y - p.p0.y);
        const d01 = Math.hypot(o.p1.x - p.p0.x, o.p1.y - p.p0.y);
        const d11 = Math.hypot(o.p1.x - p.p1.x, o.p1.y - p.p1.y);
        const minD = Math.min(d00, d01, d11);
        const reach = spec.gripRange + o.spec.r0;
        if (minD <= reach) {
          let myPart = 0;
          let targetPart = 1;
          if (minD === d00) { myPart = 0; targetPart = 0; }
          else if (minD === d11) { myPart = 1; targetPart = 1; }
          const fatBonus = o.typeId === 'fat' ? 0.62 : 1.0;
          const tallSideBonus = (p.typeId === 'tall' && Math.abs(o.p0.x - p.p0.x) > 22) ? 0.72 : 1.0;
          cands.push({
            priority: minD * fatBonus * tallSideBonus,
            grip: {
              kind: 'person',
              targetId: o.id,
              targetPart,
              myPart,
              restLen: Math.max(12, minD * 0.90),
              strain: 0,
              breakT: 0,
            },
          });
        }
      }
    }

    cands.sort((a, b) => a.priority - b.priority);
    const usedAnchors = new Set();
    const usedPeople = new Set();
    for (let i = 0; i < cands.length; i++) {
      if (p.grips.length >= spec.maxGrips) break;
      const g = cands[i].grip;
      if (g.kind === 'anchor') {
        if (usedAnchors.has(g.anchor.id)) continue;
        usedAnchors.add(g.anchor.id);
      } else {
        if (usedPeople.has(g.targetId)) continue;
        usedPeople.add(g.targetId);
      }
      p.grips.push(g);
    }

    if (spec.anchorBothEnds && p.grips.length === 1 && cands.length > 1) {
      const g2 = { ...cands[0].grip, myPart: 1 - p.grips[0].myPart };
      p.grips.push(g2);
    }
  }

  pushOutOfTrain(x, y, r, out = {}) {
    this._projectionInput.x = x; this._projectionInput.y = y;
    this._projectionSpec.r0 = r;
    return projectTrainSurface(this._projectionInput, this._projectionSpec, 0, out);
  }

  onBoardCount() {
    let n = 0;
    for (let i = 0; i < this.people.length; i++) {
      if (!this.people[i].fallen) n++;
    }
    return n;
  }

  /** 计分（VIP 老板 1 人顶 3 分，其余 1 人 1 分） */
  onBoardScore() {
    let s = 0;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      if (!p.fallen) s += p.spec.scoreWeight;
    }
    return s;
  }

  rankOf(score) {
    const t = this.level.targets;
    if (score >= t[3]) return { name: 'SS', idx: 4 };
    if (score >= t[2]) return { name: 'S', idx: 3 };
    if (score >= t[1]) return { name: 'A', idx: 2 };
    if (score >= t[0]) return { name: 'B', idx: 1 };
    return { name: 'C', idx: 0 };
  }

  /** 距离下一段位还差几分（用于结算痛点提示） */
  nextRankGap(score) {
    const labels = ['B', 'A', 'S', 'SS'];
    const t = this.level.targets;
    for (let i = 0; i < 4; i++) {
      if (score < t[i]) return { label: labels[i], need: t[i] - score, target: t[i] };
    }
    return null;
  }

  /** 手动加速冲刺车票小激励：达 B 级过关且有效加速 >= 0.7s，最高额外奖励 ~22% 车票 */
  getBoostBonusTickets(baseTickets) {
    const score = this.finalScore || this.onBoardScore();
    if (this.rankOf(score).idx < 1 || this.boostTime < 0.7) return 0;
    const ratio = Math.min(1, this.boostTime / 3.5);
    return Math.max(1, Math.round(Math.max(10, baseTickets) * 0.22 * ratio));
  }

  massStats(out = {}) {
    let totalMass = 0;
    let momentX = 0;
    let maxHeight = 0;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      if (p.fallen || p.flying) continue;
      const m = p.spec.mass;
      const cx = (p.p0.x + p.p1.x) * 0.5;
      totalMass += m;
      momentX += cx * m;
      const h = TRAIN.roofY - Math.min(p.p0.y, p.p1.y);
      if (h > maxHeight) maxHeight = h;
    }
    const comX = totalMass > 0 ? momentX / totalMass : 0;
    const norm = Math.max(-1, Math.min(1, comX / TRAIN.halfW));
    out.totalMass = totalMass; out.comX = comX; out.norm = norm; out.maxHeight = maxHeight;
    return out;
  }

  step(dt = DT) {
    this.time += dt;
    this.bpm = this.phase === 'running'
      ? 106 + 44 * Math.min(1, this.speed / Math.max(1, this.level.maxSpeed))
      : 104;
    const prevBeat = this.beatPhase;
    this.beatPhase = (this.beatPhase + dt * (this.bpm / 60)) % 1;
    if (this.beatPhase < prevBeat) {
      this.railTick++;
      this.events.push({ type: 'beat', tick: this.railTick, running: this.phase === 'running' });
    }

    if (this.phase === 'loading') {
      // 去掉无谓的装车倒计时焦虑，让玩家自由策略布阵，满意后随时点发车；同时驱动站台排队队伍往前补位！
      this.speed = 0; this.accelX = 0; this.bumpAccY = 0; this.braking = false;
      this.activeWind = null; this.windAlert = null; this.midStopAlert = null;
      this.stepStationLine(dt);
    } else if (this.phase === 'running') {
      this.stepTrainMotion(dt);
    } else if (this.phase === 'arrived') {
      this.speed *= Math.exp(-8 * dt);
      this.accelX = 0; this.bumpAccY = 0; this.braking = false;
      this.activeWind = null; this.windAlert = null; this.midStopAlert = null;
      this.settleTime += dt;
    }

    const freeEnergy = this.hasPerk('energyDrink');
    const staminaScale = 1 + this.upgrades.staminaBoost;
    const activeCrouch = this.phase === 'running' && this.crouching && (freeEnergy || this.stamina > 0.04);
    if (this._basketFullCooldown > 0) this._basketFullCooldown = Math.max(0, this._basketFullCooldown - dt);
    if (activeCrouch) {
      if (!freeEnergy) this.stamina = Math.max(0, this.stamina - (dt * 0.34) / staminaScale);
      this.crouchBlend = Math.min(1, this.crouchBlend + dt * 7.5);
    } else {
      if (this.phase === 'running' && this.crouching && !freeEnergy && this.stamina <= 0.04 && !this._staminaWasExhausted) {
        this._staminaWasExhausted = true;
        this.events.push({ type: 'skillFail', key: 'stamina_empty', x: 0, y: TRAIN.roofY - 60 });
      }
      this.stamina = Math.min(1, this.stamina + dt * 0.25 * staminaScale);
      if (this.stamina > 0.28) this._staminaWasExhausted = false;
      this.crouchBlend = Math.max(0, this.crouchBlend - dt * 6.5);
    }

    const stats = this.massStats(this._stepStats);
    const massBias = stats.norm * Math.min(1.15, stats.totalMass / 18);
    const accelPitch = (this.accelX / 1100) * 0.19;
    const targetTilt = Math.max(-0.46, Math.min(0.46, massBias * 0.34 - accelPitch - (this.slopePitch || 0)));
    this.tiltV += ((targetTilt - this.tilt) * 24 - this.tiltV * 5.8) * dt;
    this.tilt += this.tiltV * dt;

    this.stepPhysics(dt, activeCrouch);
    const alive = this.onBoardCount();
    const score = this.onBoardScore();
    if (alive > this.peakOnBoard) this.peakOnBoard = alive;
    if (score > this.peakScore) this.peakScore = score;
  }

  stepTrainMotion(dt) {
    const lv = this.level;
    const rem = lv.distance - this.trainX;

    // 1) 中途信号灯急停检测（预警距离随实时车速动态提前，高速冲刺也有充足反应时间）
    let midStopBraking = false;
    let midStopHolding = false;
    let msAlert = null;
    const stopWarnDist = Math.max(820, this.speed * 1.85);
    for (let i = 0; i < this.midStopStates.length; i++) {
      const ms = this.midStopStates[i];
      if (ms.state === 'done') continue;
      const distToStop = ms.x - this.trainX;
      if (distToStop < stopWarnDist && distToStop > -120) {
        this._stopInfo.label = ms.label;
        this._stopInfo.dist = distToStop;
        this._stopInfo.state = ms.state;
        msAlert = this._stopInfo;
      }
      if (ms.state === 'idle' && distToStop <= ms.len) {
        ms.state = 'braking';
        this.events.push({ type: 'midStop', label: ms.label });
      }
      if (ms.state === 'braking') {
        midStopBraking = true;
        if (this.speed <= 32 || distToStop <= 20) {
          ms.state = 'holding';
          this.speed = 0;
          this.accelX = 0;
        }
      } else if (ms.state === 'holding') {
        midStopHolding = true;
        ms.holdLeft -= dt * 1.35;
        if (ms.holdLeft <= 0) {
          ms.state = 'done';
          this.events.push({ type: 'midStopGo' });
        }
      }
    }
    this.midStopAlert = msAlert;

    let targetAccel = 0;
    if (midStopHolding) {
      this.braking = false;
      this.speed = 0;
      this.accelX = 0;
      targetAccel = 0;
    } else if (midStopBraking) {
      this.braking = true;
      targetAccel = -480;
    } else if (rem <= Math.min(lv.brakeDist, 360)) {
      this.braking = true;
      if (!this.brakeAlerted) {
        this.brakeAlerted = true;
        this.events.push({ type: 'braking' });
      }
      const effBrakeDist = Math.max(180, Math.min(lv.brakeDist, 340));
      // 干脆利落进站制动：一旦减速到最小速度阈值（<= 115px/s，对应 ~28km/h）或接近终点线，立即刹停到站，绝不在低速 1km/h 磨蹭！
      const ratio = Math.max(0, Math.min(1, rem / effBrakeDist));
      const desiredV = Math.max(115, Math.sqrt(ratio) * lv.maxSpeed * 0.90);
      targetAccel = Math.max(-560, (desiredV - this.speed) * 7.5);
      if (rem <= 26 || this.speed <= 118) {
        this.trainX = lv.distance;
        this.speed = 0; this.accelX = 0; this.braking = false;
        this.phase = 'arrived';
        this.settleTime = 0;
        this.finalCount = this.onBoardCount();
        this.finalScore = this.onBoardScore();
        this.events.push({ type: 'arrived', count: this.finalCount, score: this.finalScore });
        this.checkArrivalAchievements();
        return;
      }
    } else {
      // 支持手动加速：按住油门极速飙升至 1.42x，并带来真实推背加速度与惯性挑战！
      this.braking = false;
      const targetV = this.boosting ? lv.maxSpeed * 1.42 : lv.maxSpeed;
      if (this.speed < targetV) {
        const boostMult = this.boosting ? 1.65 : (this.speed < 120 ? 1.42 : 0.92);
        targetAccel = lv.accel * boostMult;
      } else {
        targetAccel = (targetV - this.speed) * 2.4;
      }
    }

    if (!midStopHolding) {
      this.accelX += (targetAccel - this.accelX) * Math.min(1, dt * 8);
      this.speed = Math.max(0, this.speed + this.accelX * dt);
      this.trainX += this.speed * dt;
    }
    this.runTime += dt;
    if (this.boosting && !this.braking && !midStopHolding) {
      this.boostTime += dt;
      // 局内狂踩加速满 4.5 秒且车上尚有乘客，当场炸出《秋名山车神》！
      if (this.boostTime >= 4.5 && this.onBoardCount() > 0) {
        this.emitAchievement('akina_god', 40, TRAIN.roofY - 50);
      }
    }

    // 超速冲刺时铁轨颠簸随之放大（最高 1.35x），并叠加场景机制【上下斜坡段】与【铁轨飞坡跳台】！
    const speedK = Math.min(1.35, this.speed / Math.max(1, lv.maxSpeed));
    const bumpMult = Math.max(0.65, 1 - this.upgrades.bumpReduce);
    const wave = Math.sin(this.trainX * 0.045) * 0.65 + Math.sin(this.trainX * 0.11) * 0.35;

    // 1.5) 场景机制 A：高架上下斜坡段（上坡车头昂起后滑，下坡车头俯冲前倾加速）
    let curSlope = null;
    let targetSlopePitch = 0;
    const slopes = lv.slopes || EMPTY_EVENTS;
    for (let i = 0; i < slopes.length; i++) {
      const sl = slopes[i];
      if (this.trainX >= sl.x && this.trainX <= sl.x + sl.len) {
        curSlope = sl;
        const u = (this.trainX - sl.x) / Math.max(1, sl.len);
        const env = Math.sin(Math.min(1, Math.max(0, u)) * Math.PI);
        targetSlopePitch = (sl.grade || 0) * (0.45 + 0.55 * env);
        break;
      }
    }
    this.activeSlope = curSlope;
    this.slopePitch += (targetSlopePitch - this.slopePitch) * Math.min(1, dt * 7);

    // 1.6) 场景机制 B：铁轨飞坡跳台（压过跳台瞬间车身腾空弹跃，带来刺激的失重抛射感！）
    let rampBumpY = 0;
    let rampAccY = 0;
    const ramps = lv.ramps || EMPTY_EVENTS;
    for (let i = 0; i < ramps.length; i++) {
      const rp = ramps[i];
      const dx = this.trainX - rp.x;
      if (dx >= -35 && dx <= 150) {
        if (!this._triggeredRamps.has(i)) {
          this._triggeredRamps.add(i);
          this.events.push({ type: 'rampJump', label: rp.label || '飞坡跳台' });
        }
        const u = (dx + 35) / 185;
        const hump = Math.sin(u * Math.PI);
        const amp = (rp.amp || 24) * bumpMult;
        rampBumpY = -amp * hump;
        rampAccY = -Math.cos(u * Math.PI * 2) * amp * 13.5 * speedK;
      }
    }

    this.bumpY = wave * 4.2 * speedK * bumpMult + rampBumpY;
    this.bumpAccY = Math.cos(this.trainX * 0.045) * lv.bumpAmp * speedK * bumpMult + rampAccY;

    // 2) 涵洞预警（覆盖完整车长 2*TRAIN.halfW，距离随车速动态拉远）
    let alert = null;
    const tunWarnDist = Math.max(820, this.speed * 1.85);
    for (let i = 0; i < lv.tunnels.length; i++) {
      const tun = lv.tunnels[i];
      const dist = tun.x - this.trainX - TRAIN.halfW;
      if (dist > -tun.len - TRAIN.halfW * 2 - 40 && dist < tunWarnDist) {
        Object.assign(this._tunnelInfo, tun);
        this._tunnelInfo.dist = dist;
        alert = this._tunnelInfo;
        break;
      }
    }
    this.tunnelAlert = alert;

    // 3) 迎面强阵风区检测（同样随车速动态提前预警）
    let curWind = null;
    let wAlert = null;
    const winds = lv.winds || EMPTY_EVENTS;
    const windWarnDist = Math.max(720, this.speed * 1.7);
    if (!this.hasPerk('calmWind')) {
      for (let i = 0; i < winds.length; i++) {
        const w = winds[i];
        const dist = w.x - this.trainX;
        if (this.trainX >= w.x - 60 && this.trainX <= w.x + w.len) {
          curWind = w;
          Object.assign(this._windInfo, w);
          this._windInfo.dist = 0; this._windInfo.active = true;
          wAlert = this._windInfo;
          break;
        }
        if (dist > 0 && dist < windWarnDist) {
          Object.assign(this._windInfo, w);
          this._windInfo.dist = dist; this._windInfo.active = false;
          wAlert = this._windInfo;
        }
      }
    }
    this.activeWind = curWind;
    if (curWind) {
      this.sawWindZone = true;
      this.wasInWind = true;
    } else if (this.wasInWind) {
      // 刚顶着狂风冲出强阵风区的那一秒，立刻当场炸出《风往北吹》！
      this.wasInWind = false;
      if (this.onBoardCount() >= 10) {
        this.emitAchievement('wind_north', 0, TRAIN.roofY - 80);
      }
    }
    this.windAlert = wAlert;
  }

  /** 到站汇总成就检测（24 项热梗称号全量覆盖！） */
  checkArrivalAchievements() {
    const rank = this.rankOf(this.finalScore);
    let vipAlive = 0;
    let fatAlive = 0;
    let doorClimbers = 0;
    let hasUnder = false;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      if (p.fallen || p.flying) continue;
      if (p.typeId === 'vip') vipAlive++;
      if (p.typeId === 'fat') fatAlive++;
      if (p.typeId === 'acrobat' && p.onSideWall) doorClimbers++;
      if (p.onUnderCarriage || (p.grips.length > 0 && Math.max(p.p0.y, p.p1.y) > -58)) hasUnder = true;
    }
    if (hasUnder) this.emitAchievement('under_car');
    if (this.sawWindZone && this.finalCount >= 10) this.emitAchievement('wind_north');
    if (this.boostTime >= 4.5 && rank.idx >= 1) this.emitAchievement('akina_god');
    if (this.departCount >= 10 && this.fallenTotal === 0 && this.finalCount >= 10) this.emitAchievement('steady_dog');
    if (vipAlive >= 3) this.emitAchievement('rich_boss');
    if (fatAlive >= 6) this.emitAchievement('fat_wall');
    if (doorClimbers >= 5) this.emitAchievement('spider_job');
    if (this.level.isStrictQueue && rank.idx >= 2) this.emitAchievement('queue_god');
    if (this.departCount >= 5 && this.finalCount <= 1) this.emitAchievement('lone_wolf');
    if (rank.idx >= 4) this.emitAchievement('ss_legend');
    if ((this.level.tunnels || []).length >= 2 && this.tunnelBonkTotal === 0 && rank.idx >= 1) {
      this.emitAchievement('crouch_master');
    }
    const gap = this.nextRankGap(this.finalScore);
    if (gap && gap.need === 1) this.emitAchievement('one_point_shy');
  }

  syncPeopleIndex() {
    if (this._indexDirty) {
      this._byId.clear();
      for (let i = 0; i < this.people.length; i++) this._byId.set(this.people[i].id, this.people[i]);
      this._indexDirty = false;
    }
    return this._byId;
  }

  stepPhysics(dt, activeCrouch) {
    const active = this._active;
    const aunties = this._aunties;
    const byId = this.syncPeopleIndex();
    let activeCount = 0;
    let auntieCount = 0;

    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      if (p.flying) {
        p.flyT += dt;
        const u = Math.min(1, p.flyT / p.flyDur);
        const ease = 1 - (1 - u) * (1 - u);
        const arc = Math.sin(u * Math.PI) * 50;
        const nx = p.flyFromX + (p.flyToX - p.flyFromX) * ease;
        const ny = p.flyFromY + (p.flyToY - p.flyFromY) * ease - arc;
        p.p0.x = nx; p.p0.y = ny;
        p.p1.x = nx; p.p1.y = ny - p.spec.bone;
        if (u >= 1) this.finishFly(p);
      }
      if (!p.flying) {
        active[activeCount++] = p;
        if (!p.fallen && p.spec.basketCatch) {
          p.basketCount = 0;
          aunties[auntieCount++] = p;
        }
      }
    }

    // 统计大妈菜篮当前兜住人数
    for (let i = activeCount; i < this._activeCount; i++) active[i] = null;
    for (let i = auntieCount; i < this._auntieCount; i++) aunties[i] = null;
    this._activeCount = activeCount;
    this._auntieCount = auntieCount;
    for (let i = 0; i < activeCount; i++) {
      const p = active[i];
      if (p.fallen) continue;
      for (let gi = 0; gi < p.grips.length; gi++) {
        const g = p.grips[gi];
        if (g.kind === 'basket') {
          const au = byId.get(g.targetId);
          if (au && !au.fallen) au.basketCount++;
        }
      }
    }

    const gBase = 760;
    const gx = Math.sin(this.tilt) * gBase - this.accelX * 1.28;
    const gy = Math.cos(this.tilt) * gBase + this.bumpAccY * 2.2;
    const dt2 = dt * dt;
    const cb = this.crouchBlend;
    const windForce = this.activeWind ? this.activeWind.force : 0;

    for (let i = 0; i < activeCount; i++) {
      const p = active[i];
      const damp = p.fallen ? 0.996 : (cb > 0.1 ? 0.968 : 0.985);

      // 阵风力强化对比：高处孤立轻乘客受风明显；缩头削风 75%，抓在胖叔/竹竿上额外削风 45%
      let windX = 0;
      if (windForce > 0 && !p.fallen && !p.onSideWall) {
        const heightAboveRoof = Math.max(0, TRAIN.roofY - p.p1.y);
        if (heightAboveRoof > 24) {
          const exp = Math.min(1.45, heightAboveRoof / 92);
          const massResist = 1 / Math.max(0.68, Math.sqrt(p.spec.mass));
          const crouchShield = 1 - 0.75 * cb;
          let buddyShield = 1.0;
          for (let gi = 0; gi < p.grips.length; gi++) {
            const g = p.grips[gi];
            if (g.kind !== 'anchor') {
              const t = byId.get(g.targetId);
              if (t && (t.typeId === 'fat' || t.typeId === 'tall')) { buddyShield = 0.55; break; }
            }
          }
          windX = -windForce * exp * massResist * crouchShield * buddyShield;
        }
      }

      // p0
      let vx = (p.p0.x - p.p0.ox) * damp;
      let vy = (p.p0.y - p.p0.oy) * damp;
      p.p0.ox = p.p0.x; p.p0.oy = p.p0.y;
      p.p0.x += vx + (gx + windX * 0.45) * dt2;
      p.p0.y += vy + gy * dt2;

      // p1
      vx = (p.p1.x - p.p1.ox) * damp;
      vy = (p.p1.y - p.p1.oy) * damp;
      p.p1.ox = p.p1.x; p.p1.oy = p.p1.y;
      const upright = (!p.fallen && p.grips.length > 0) ? -520 * (1 - cb) : 0;
      p.p1.x += vx + (gx + windX) * dt2;
      p.p1.y += vy + (gy + upright) * dt2;

      p.strainMax = 0;
    }

    const ITERS = 6;
    const glueLv = this.getPerkLevel('glue502');
    const basketLv = this.getPerkLevel('megaBasket');
    const glueMult = glueLv === 0 ? 1.0 : (1.30 + (glueLv - 1) * 0.22);
    const globalGripMult = glueMult * (this.gear.superGrip ? 1.32 : 1.0);
    const gripBoost = (1.0 + 0.78 * cb) * globalGripMult;
    const basketScale = basketLv === 0 ? 1.0 : (1.40 + (basketLv - 1) * 0.25);
    const ironFat = this.hasPerk('ironFat');
    const steelTall = this.hasPerk('steelTall');
    const fricBonus = this.upgrades.fricBonus;

    for (let iter = 0; iter < ITERS; iter++) {
      const isLast = iter === ITERS - 1;
      this.solveBones(cb);
      this.solveGrips(gripBoost, ironFat, steelTall, isLast);
      this.solvePairs(isLast);
      this.solveSurfaces(fricBonus, ironFat);
    }
    this.catchBaskets(basketScale);
    this.catchTallBraces();
    this.finishPhysics(dt, activeCrouch);
  }

  solveBones(cb) {
    const active = this._active, n = this._activeCount;
    // 1) 骨骼长度约束（竹竿缩头可压低 65%！）
    for (let i = 0; i < n; i++) {
      const p = active[i];
      const duck = !p.fallen ? cb : 0;
      const targetBone = p.spec.bone * (1 - p.spec.crouchShrink * duck);
      const dx = p.p1.x - p.p0.x;
      const dy = p.p1.y - p.p0.y;
      const scale = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        const nx = dx / scale, ny = dy / scale;
        const d = Math.sqrt(nx * nx + ny * ny) * scale || 0.001;
      const err = (d - targetBone) / d;
      const w0 = 0.45 * (1 - duck * 0.72);
      const w1 = 1 - w0;
      p.p0.x += dx * err * w0; p.p0.y += dy * err * w0;
      p.p1.x -= dx * err * w1; p.p1.y -= dy * err * w1;
      if (!p.fallen && p.grips.length > 0 && duck < 0.2 && p.p1.y > p.p0.y - targetBone * 0.65) {
        p.p1.y -= 0.45 * (1 - duck * 5);
      }
    }
  }

  solveGrips(gripBoost, ironFat, steelTall, isLast) {
    const active = this._active, n = this._activeCount, byId = this._byId;
    // 2) 抓握 / 拉索 / 大妈菜篮锁扣约束
    for (let i = 0; i < n; i++) {
      const p = active[i];
      if (p.fallen) continue;
      const tallBrace = (p.typeId === 'tall' && p.grips.length >= 2)
        ? (steelTall ? 2.84 : 1.42)
        : 1.0;

      for (let gi = p.grips.length - 1; gi >= 0; gi--) {
        const g = p.grips[gi];
        const pt = g.myPart === 0 ? p.p0 : p.p1;
        let tx; let ty; let targetPt = null; let targetPerson = null;
        let targetBoost = 1.0;

        if (g.kind === 'anchor') {
          tx = g.anchor.x; ty = g.anchor.y;
        } else {
          targetPerson = byId.get(g.targetId);
          if (!targetPerson || targetPerson.fallen) { removeGrip(p.grips, gi); continue; }
          targetPt = g.targetPart === 0 ? targetPerson.p0 : targetPerson.p1;
          if (g.kind === 'basket') {
            tx = targetPt.x + (g.side || 1) * 23;
            ty = targetPt.y - 6;
            targetBoost = 2.6; // 大妈菜篮锁扣超稳！
          } else {
            tx = targetPt.x; ty = targetPt.y;
            targetBoost = (targetPerson.spec.shoulderBoost || 1.0)
              * (ironFat && targetPerson.typeId === 'fat' ? 1.35 : 1.0);
          }
        }

        const dx = tx - pt.x;
        const dy = ty - pt.y;
        const scale = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        const nx = dx / scale, ny = dy / scale;
        const d = Math.sqrt(nx * nx + ny * ny) * scale || 0.001;
        if (d > g.restLen) {
          const stretch = d - g.restLen;
          const stiff = g.kind === 'anchor' ? 0.68 : g.kind === 'basket' ? 0.64 : 0.46;
          const corr = (stretch / d) * stiff;
          if (g.kind === 'anchor') {
            pt.x += dx * corr; pt.y += dy * corr;
          } else {
            const wA = 1 / p.spec.mass;
            const wB = 1 / targetPerson.spec.mass;
            const sum = wA + wB;
            pt.x += dx * corr * (wA / sum); pt.y += dy * corr * (wA / sum);
            targetPt.x -= dx * corr * (wB / sum); targetPt.y -= dy * corr * (wB / sum);
          }
          if (isLast) {
            const linkRisk = g.kind === 'anchor' ? 0.72 : g.kind === 'basket' ? 0.55 : 1.28;
            const effGrip = p.spec.gripStrength * gripBoost * targetBoost * tallBrace;
            const load = (stretch * (0.55 + p.spec.mass * 0.28) * linkRisk) / (8.4 * effGrip);
            g.strain = g.strain * 0.70 + load * 0.30;
            if (g.strain > p.strainMax) p.strainMax = g.strain;
          }
        } else if (isLast) {
          g.strain *= 0.85;
        }
      }
    }
  }

  solvePairs(isLast) {
    const active = this._active, n = this._activeCount;
    // 3) 零 GC 圆形刚体碰撞
    for (let i = 0; i < n; i++) {
      const A = active[i];
      if (A.fallen) continue;
      const wA = 1 / A.spec.mass;
      const ax = A.p0.x;
      const ay = A.p0.y;
      const aR0 = A.spec.r0;
      const aR1 = A.spec.r1;
      for (let j = i + 1; j < n; j++) {
        const B = active[j];
        if (B.fallen || A.onSideWall !== B.onSideWall) continue;
        if (Math.abs(ax - B.p0.x) > 64 || Math.abs(ay - B.p0.y) > 96) continue;
          resolvePartPair(A, 0, B, 0, isLast);
          resolvePartPair(A, 0, B, 1, isLast);
          resolvePartPair(A, 1, B, 0, isLast);
          resolvePartPair(A, 1, B, 1, isLast);
      }
    }
  }

  solveSurfaces(fricBonus, ironFat) {
    const active = this._active, n = this._activeCount;
    // 4) 列车表面、低矮涵洞（含安全气囊护盾）与地面约束
    for (let i = 0; i < n; i++) {
      const p = active[i];
      const effFric = ironFat && p.typeId === 'fat' ? 1 : Math.min(0.99, p.spec.roofFric + fricBonus);
      for (let part = 0; part < 2; part++) {
        const pt = part === 0 ? p.p0 : p.p1;
        const r = part === 0 ? p.spec.r0 : p.spec.r1;
        if (!p.fallen && !p.onSideWall && !p.onUnderCarriage) {
          const out = projectTrainSurface(pt, p.spec, part, this._surfaceOut);
          if (out.normalX || out.normalY) {
            pt.x = out.x; pt.y = out.y;
            if (out.normalY < 0) {
              const vx = pt.x - pt.ox;
              pt.ox = pt.x - vx * (1 - effFric);
            }
          }
        } else if (!p.fallen && p.onUnderCarriage) {
          // 贴着车底底盘：不穿进车厢内部，也不穿进铁轨下！
          if (pt.y < TRAIN.floorY + 2) pt.y = TRAIN.floorY + 2;
        }
        if (this.phase === 'running' && !p.fallen && !p.onSideWall && !p.onUnderCarriage) {
          const tunnels = this.level.tunnels;
          for (let ti = 0; ti < tunnels.length; ti++) {
            const tun = tunnels[ti];
            const localLeft = tun.x - this.trainX;
            const localRight = localLeft + tun.len;
            if (pt.x + r > localLeft && pt.x - r < localRight && pt.y - r < tun.clearY) {
              if (this.gear.airbagCharges > 0) {
                // 开局神装安全气囊保命 1 次：安全压低并保住抓手！
                this.gear.airbagCharges--;
                pt.y = tun.clearY + r + 4;
                pt.oy = pt.y;
                this.events.push({ type: 'airbag', x: pt.x, y: pt.y });
              } else {
                pt.y = tun.clearY + r + 2;
                pt.ox = pt.x + 8.5;
                p.grips.length = 0;
                p.strainMax = 2.0;
                if (!p.screamed) {
                  p.screamed = true;
                  this.events.push({ type: 'bonk', x: pt.x, y: pt.y, typeId: p.typeId });
                  this._bonkBurstTimer = 0.55;
                  this._bonkBurstCount++;
                  this.tunnelBonkTotal++;
                  if (this._bonkBurstCount >= 3) this.emitAchievement('yi_jian_mei');
                  if (p.typeId === 'tall') {
                    this.events.push({ type: 'skillFail', key: 'tall_bonk', typeId: 'tall', x: pt.x, y: pt.y });
                  } else if (p.typeId === 'acrobat') {
                    this.events.push({ type: 'skillFail', key: 'acrobat_bonk', typeId: 'acrobat', x: pt.x, y: pt.y });
                  } else if (p.typeId === 'vip') {
                    this.events.push({ type: 'skillFail', key: 'vip_fail', typeId: 'vip', x: pt.x, y: pt.y });
                  }
                }
              }
            }
          }
        }
        if (pt.y + r > 0) {
          pt.y = -r;
          const vx = pt.x - pt.ox;
          pt.ox = pt.x - vx * 0.72;
        }
      }
    }
  }

  catchBaskets(basketScale) {
    const active = this._active, n = this._activeCount, aunties = this._aunties, auntieCount = this._auntieCount;
    // 5) 大妈方案 A：双菜篮兜底安全网检测（接住滑落/下坠的瘦猴、挂壁娃、VIP！）
    if (auntieCount > 0) {
      const catchRad = 32 * basketScale;
      const catchRad2 = catchRad * catchRad;
      for (let i = 0; i < n; i++) {
        const p = active[i];
        if (p.fallen || p.onSideWall || (p.typeId !== 'thin' && p.typeId !== 'acrobat' && p.typeId !== 'vip')) continue;
        // 已经稳稳待在菜篮里的跳过
        let inBasket = false;
        for (let gi = 0; gi < p.grips.length; gi++) {
          if (p.grips[gi].kind === 'basket') { inBasket = true; break; }
        }
        if (inBasket) continue;

        const vy = p.p0.y - p.p0.oy;
        const vx = Math.abs(p.p0.x - p.p0.ox);
        // 放宽兜底条件：松手、下坠、急刹猛滑或抓手过载拉扯，经过大妈菜篮口立刻兜住锁死！
        const needsRescue = p.grips.length === 0 || vy > 0.55 || vx > 1.4 || p.strainMax > 0.70;
        if (!needsRescue) continue;

        for (let ai = 0; ai < auntieCount; ai++) {
          const au = aunties[ai];
          if (au.id === p.id) continue;
          const side = p.p0.x < au.p0.x ? -1 : 1;
          const bx = au.p0.x + side * 23;
          const by = au.p0.y - 6;
          const dx = p.p0.x - bx;
          const dy = p.p0.y - by;
          if (dx * dx + dy * dy <= catchRad2) {
            if (au.basketCount >= 2) {
              if (this._basketFullCooldown <= 0) {
                this._basketFullCooldown = 2.2;
                this.events.push({ type: 'skillFail', key: 'auntie_full', typeId: 'auntie', x: bx, y: by });
              }
              continue;
            }
            au.basketCount++;
            p.grips.push({
              kind: 'basket',
              targetId: au.id,
              targetPart: 0,
              myPart: 0,
              side,
              restLen: 14,
              strain: 0,
              breakT: 0,
            });
            p.p0.ox = p.p0.x; p.p0.oy = p.p0.y;
            p.p1.ox = p.p1.x; p.p1.oy = p.p1.y;
            p.screamed = false;
            this.basketCatchCount++;
            this.events.push({ type: 'basketCatch', x: bx, y: by, who: p.typeId });
            if (p.airTime >= 0.30) this.emitAchievement('air_jordan');
            p.airTime = 0;
            if (this.basketCatchCount >= 2) this.emitAchievement('basket_hero');
            break;
          }
        }
      }
    }

  }

  /** 竹竿动态主动捞人：86px 范围内若有乘客没抓稳或拉扯过载，竹竿自动伸出长臂紫绳拉牢！ */
  catchTallBraces() {
    const active = this._active;
    const n = this._activeCount;
    const reach2 = 86 * 86;
    for (let i = 0; i < n; i++) {
      const tall = active[i];
      if (tall.fallen || tall.onSideWall || tall.typeId !== 'tall') continue;
      if (tall.grips.length >= tall.spec.maxGrips) continue;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const o = active[j];
        if (o.fallen || o.onSideWall) continue;
        if (o.grips.length > 0 && o.strainMax < 0.72) continue;
        let already = false;
        for (let gi = 0; gi < tall.grips.length; gi++) {
          if (tall.grips[gi].targetId === o.id) { already = true; break; }
        }
        if (already) continue;

        const dx = o.p1.x - tall.p1.x;
        const dy = o.p1.y - tall.p1.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= reach2 && d2 > 16) {
          const d = Math.sqrt(d2);
          tall.grips.push({
            kind: 'person',
            targetId: o.id,
            targetPart: 1,
            myPart: 1,
            restLen: Math.max(14, d * 0.90),
            strain: 0,
            breakT: 0,
          });
          if (o.grips.length === 0) {
            o.grips.push({
              kind: 'person',
              targetId: tall.id,
              targetPart: 1,
              myPart: 1,
              restLen: Math.max(14, d * 0.90),
              strain: 0,
              breakT: 0,
            });
          }
          if (o.airTime >= 0.30) this.emitAchievement('air_jordan');
          o.airTime = 0;
          this.tallRescueCount++;
          if (this.tallRescueCount >= 3) this.emitAchievement('astro_arm');
          break;
        }
      }
    }
  }

  finishPhysics(dt, activeCrouch) {
    const active = this._active, n = this._activeCount;
    if (this._bonkBurstTimer > 0) {
      this._bonkBurstTimer = Math.max(0, this._bonkBurstTimer - dt);
      if (this._bonkBurstTimer === 0) this._bonkBurstCount = 0;
    }
    if (this._fallBurstTimer > 0) {
      this._fallBurstTimer = Math.max(0, this._fallBurstTimer - dt);
      if (this._fallBurstTimer === 0) this._fallBurstCount = 0;
    }
    let anyUnderRunning = false;
    let underPt = null;
    let anyNoseRunning = false;
    let nosePt = null;
    let anyTailRunning = false;
    let tailPt = null;
    let vipCountNow = 0;
    let doorSpiderNow = 0;
    // 6) 抓手断裂、物理滞空/旋转/奇葩站位成就追踪与掉落判定
    for (let i = 0; i < n; i++) {
      const p = active[i];
      if (p.fallen) {
        if (this.phase === 'running') {
          const shift = this.speed * dt * 0.75;
          p.p0.x -= shift; p.p1.x -= shift;
          p.p0.ox -= shift; p.p1.ox -= shift;
        }
        // 已脱车仍在半空翻滚飞行的乘客同样计入滞空、冲天与魔力转圈圈！
        if (this.phase === 'running' && Math.min(p.p0.y, p.p1.y) < -36) {
          p.airTime = (p.airTime || 0) + dt;
          if (p.airTime >= 1.6) this.emitAchievement('air_time', p.p0.x, p.p0.y);
          if (Math.min(p.p0.y, p.p1.y) <= -390) this.emitAchievement('sky_rocket', p.p0.x, p.p0.y);
          const ang = Math.atan2(p.p1.y - p.p0.y, p.p1.x - p.p0.x);
          if (p.lastAng != null) {
            let da = ang - p.lastAng;
            if (da > Math.PI) da -= Math.PI * 2;
            if (da < -Math.PI) da += Math.PI * 2;
            p.airSpin = (p.airSpin || 0) + da;
            if (Math.abs(p.airSpin) >= Math.PI * 4) this.emitAchievement('spin_round', p.p0.x, p.p0.y);
          }
          p.lastAng = ang;
        }
        continue;
      }

      for (let gi = p.grips.length - 1; gi >= 0; gi--) {
        const g = p.grips[gi];
        if (g.strain > 1.0) {
          g.breakT += dt * (g.strain - 0.85);
          if (g.breakT > 0.30) {
            removeGrip(p.grips, gi);
            this.events.push({ type: 'snap', x: p.p0.x, y: p.p0.y });
            if (p.typeId === 'tall') {
              this.events.push({ type: 'skillFail', key: 'tall_snap', typeId: 'tall', x: p.p0.x, y: p.p0.y });
            }
          }
        } else {
          g.breakT = Math.max(0, g.breakT - dt * 1.4);
        }
      }

      const cx = (p.p0.x + p.p1.x) * 0.5;
      const cy = (p.p0.y + p.p1.y) * 0.5;
      const underHolding = p.onUnderCarriage && p.grips.length > 0;
      const fell = (!underHolding && cy > -22) || (underHolding && cy > -4) || cx < -TRAIN.halfW - 140 || cx > TRAIN.halfW + 150;
      if (fell) {
        p.fallen = true;
        p.grips.length = 0;
        this.fallenTotal++;
        this._fallBurstTimer = 1.0;
        this._fallBurstCount++;
        if (this._fallBurstCount >= 5) this.emitAchievement('flower_rain', cx, cy);
        this.events.push({ type: 'fall', x: cx, y: cy, typeId: p.typeId, scoreWeight: p.spec.scoreWeight });
        const failKey = p.typeId === 'thin'
          ? (this.activeWind ? 'thin_wind' : 'thin_fall')
          : p.typeId === 'fat'
            ? 'fat_fall'
            : p.typeId === 'acrobat'
              ? (p.onSideWall ? 'acrobat_door' : 'acrobat_bonk')
              : p.typeId === 'auntie'
                ? 'auntie_fall'
                : p.typeId === 'vip'
                  ? 'vip_fail'
                  : 'tall_snap';
        this.events.push({ type: 'skillFail', key: failKey, typeId: p.typeId, x: cx, y: cy });
      } else {
        if (this.phase === 'running') {
          if (p.typeId === 'vip') vipCountNow++;
          if (p.typeId === 'acrobat' && p.onSideWall) doorSpiderNow++;
          if (underHolding || (p.grips.length > 0 && Math.max(p.p0.y, p.p1.y) > -58)) {
            anyUnderRunning = true;
            underPt = p.p0;
          }
          if (p.grips.length > 0 && cx >= TRAIN.halfW + 12) { anyNoseRunning = true; nosePt = p.p0; }
          if (p.grips.length > 0 && cx <= -TRAIN.halfW - 12) { anyTailRunning = true; tailPt = p.p0; }
          // 行车期未抓住且离车顶腾空时累计滞空、高度与翻转圈数！
          if (p.grips.length === 0 && cy < TRAIN.roofY - 24) {
            p.airTime = (p.airTime || 0) + dt;
            if (p.airTime >= 1.6) this.emitAchievement('air_time', cx, cy);
            if (Math.min(p.p0.y, p.p1.y) <= -390) this.emitAchievement('sky_rocket', cx, cy);
            const ang = Math.atan2(p.p1.y - p.p0.y, p.p1.x - p.p0.x);
            if (p.lastAng != null) {
              let da = ang - p.lastAng;
              if (da > Math.PI) da -= Math.PI * 2;
              if (da < -Math.PI) da += Math.PI * 2;
              p.airSpin = (p.airSpin || 0) + da;
              if (Math.abs(p.airSpin) >= Math.PI * 4) this.emitAchievement('spin_round', cx, cy);
            }
            p.lastAng = ang;
          } else if (p.grips.length > 0) {
            p.airTime = 0;
            p.airSpin = 0;
            p.lastAng = null;
          }
        }
        const victory = this.phase === 'arrived' && this.rankOf(this.finalScore).idx >= 1;
        if (victory) {
          p.mood = 'cheer';
        } else {
          const panic = p.strainMax > 0.72 || p.grips.length === 0 || this.braking || Boolean(this.activeWind) || (this.boosting && this.accelX > 220);
          p.mood = panic ? 'panic' : (activeCrouch ? 'crouch' : 'happy');
        }
      }
    }

    if (anyUnderRunning) {
      this.underCarRideSec += dt;
      if (this.underCarRideSec >= 1.6) this.emitAchievement('under_car', underPt ? underPt.x : 0, TRAIN.floorY);
    }
    if (anyNoseRunning) {
      this.noseRideSec += dt;
      if (this.noseRideSec >= 1.6) this.emitAchievement('titanic', nosePt ? nosePt.x : TRAIN.halfW + 30, TRAIN.noseY);
    }
    if (anyTailRunning) {
      this.tailRideSec += dt;
      if (this.tailRideSec >= 1.6) this.emitAchievement('tail_hanger', tailPt ? tailPt.x : -TRAIN.halfW - 24, TRAIN.tailY);
    }
    if (vipCountNow >= 3) {
      this.vipRideSec += dt;
      if (this.vipRideSec >= 1.8) this.emitAchievement('rich_boss', 0, TRAIN.roofY - 60);
    }
    if (doorSpiderNow >= 5) {
      this.spiderRideSec += dt;
      if (this.spiderRideSec >= 1.4) this.emitAchievement('spider_job', 0, -90);
    }

    // 清理甩出视野外的落车乘客
    if (this.people.length > 105) {
      let kept = 0;
      for (let i = 0; i < this.people.length; i++) {
        const p = this.people[i];
        if (!p.fallen || p.p0.x > -900) this.people[kept++] = p;
      }
      if (kept !== this.people.length) this._indexDirty = true;
      this.people.length = kept;
    }
  }

  drainEvents(consume) {
    const count = this.events.length;
    if (consume) {
      for (let i = 0; i < count; i++) consume(this.events[i]);
      const left = this.events.length - count;
      for (let i = 0; i < left; i++) this.events[i] = this.events[count + i];
      this.events.length = left;
      return count;
    }
    if (count === 0) return EMPTY_EVENTS;
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }
}
