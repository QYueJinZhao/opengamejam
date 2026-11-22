// 纯逻辑 2D PBD（位置动力学）物理引擎：零 DOM、零外部依赖，确定性固定步长。
//
// 核心策略结构（五体型真实建筑力学协同 + 50/60/72 人限量大潮）：
//   - 胖叔（Heavy）：超高防滑底座 + 「宽肩护航」（抓在他身上的邻人抓力 ×1.45！）
//   - 瘦猴（Slim）：极轻最矮不怕洞，但单人车顶易滑，须靠胖叔或抱团挤紧；
//   - 竹竿（Tall）：超长 3 抓点「钢筋斜拉索」（同时拉住≥2个目标时自身抓力 ×1.35！），但极怕涵洞；
//   - 大包大妈（Bulky）：明显左右偏心重物，专治车身大倾角滑移；
//   - 挂壁娃（Climber）：唯一支持「侧门外挂（sideCling）」——直接挂在车厢外侧门竖杆上，
//                        不占车顶空间且 100% 免疫低矮涵洞，但承受急刹与倾覆冲击！

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
    id: 'fat',
    r0: 21, r1: 20, bone: 20,
    mass: 3.5,
    roofFric: 0.94,
    gripStrength: 2.65,
    gripRange: 52,
    maxGrips: 2,
    anchorBothEnds: false,
    sideCling: false,
    shoulderBoost: 1.48,          // 别人抓在胖叔肩上，抓力大幅增强！
    biasX: 0,
    shirt: '#EF4444', pants: '#1E293B', skin: '#F7C9A6', hat: '#FACC15',
  },
  {
    id: 'thin',
    r0: 10.5, r1: 9.5, bone: 18,
    mass: 0.62,
    roofFric: 0.40,
    gripStrength: 0.78,
    gripRange: 44,
    maxGrips: 2,
    anchorBothEnds: false,
    sideCling: false,
    shoulderBoost: 1.0,
    biasX: 0,
    shirt: '#38BDF8', pants: '#0F172A', skin: '#F9D1B1', hat: null,
  },
  {
    id: 'tall',
    r0: 11.5, r1: 10.5, bone: 50,
    mass: 1.22,
    roofFric: 0.64,
    gripStrength: 1.48,
    gripRange: 84,                 // 超长臂展，跨堆斜拉加固
    maxGrips: 3,
    anchorBothEnds: false,
    sideCling: false,
    shoulderBoost: 1.15,
    biasX: 0,
    shirt: '#A855F7', pants: '#2E1065', skin: '#F4C4A0', hat: '#F8FAFC',
  },
  {
    id: 'auntie',
    r0: 16, r1: 14.5, bone: 27,
    mass: 2.40,
    roofFric: 0.78,
    gripStrength: 1.72,
    gripRange: 48,
    maxGrips: 2,
    anchorBothEnds: false,
    sideCling: false,
    shoulderBoost: 1.15,
    biasX: 1,
    shirt: '#F59E0B', pants: '#78350F', skin: '#F5C6A2', hat: '#FB7185',
  },
  {
    id: 'acrobat',
    r0: 10, r1: 9.5, bone: 21,
    mass: 0.58,
    roofFric: 0.50,
    gripStrength: 1.42,
    gripRange: 58,
    maxGrips: 3,
    anchorBothEnds: true,
    sideCling: true,               // 专属能力：可直接挂在车厢侧门扶手上不占车顶！
    shoulderBoost: 1.0,
    biasX: 0,
    shirt: '#22C55E', pants: '#14532D', skin: '#F9D2B3', hat: '#EF4444',
  },
];

export const TYPE_MAP = Object.fromEntries(BODY_TYPES.map((t) => [t.id, t]));

// 黄金 3 关阶梯：扩大站台人潮至 50 / 60 / 72 人，场面极其震撼！
export const LEVELS = [
  {
    id: 'rush1',
    loadTime: 55,
    distance: 4300,
    maxSpeed: 400,
    accel: 195,
    brakeDist: 560,
    bumpAmp: 34,
    pool: { fat: 10, thin: 16, tall: 8, auntie: 8, acrobat: 8 }, // 共 50 人
    tunnels: [
      { x: 2250, len: 300, clearY: -266, labelKey: 'tun_high' },
    ],
    targets: [18, 28, 38, 45],
  },
  {
    id: 'tunnel2',
    loadTime: 60,
    distance: 6300,
    maxSpeed: 430,
    accel: 215,
    brakeDist: 600,
    bumpAmp: 46,
    pool: { fat: 12, thin: 20, tall: 10, auntie: 9, acrobat: 9 }, // 共 60 人
    tunnels: [
      { x: 2050, len: 320, clearY: -242, labelKey: 'tun_mid' },
      { x: 4250, len: 340, clearY: -220, labelKey: 'tun_low' },
    ],
    targets: [22, 34, 45, 53],
  },
  {
    id: 'chaos3',
    loadTime: 65,
    distance: 8150,
    maxSpeed: 460,
    accel: 245,
    brakeDist: 660,
    bumpAmp: 62,
    pool: { fat: 14, thin: 24, tall: 12, auntie: 11, acrobat: 11 }, // 共 72 人
    tunnels: [
      { x: 2100, len: 300, clearY: -238, labelKey: 'tun_t1' },
      { x: 4250, len: 320, clearY: -222, labelKey: 'tun_t2' },
      { x: 6400, len: 350, clearY: -212, labelKey: 'tun_t3' },
    ],
    targets: [26, 40, 54, 64],
  },
];

// 车门外侧竖杆扶手 X 坐标（专供挂壁娃贴门外挂！）
export const DOOR_BAR_XS = [-124, 124];

function buildTrainAnchors() {
  const anchors = [];
  // 车顶扶手栏杆
  for (let x = -248; x <= 248; x += 38) {
    anchors.push({ id: `roof_${x}`, x, y: TRAIN.roofY - 3, kind: 'roof' });
  }
  // 车厢侧门外侧双竖杆扶手（专供挂壁娃外挂，不占车顶、免疫低涵洞！）
  for (const dx of DOOR_BAR_XS) {
    anchors.push({ id: `door_${dx}_hi`, x: dx, y: -112, kind: 'door' });
    anchors.push({ id: `door_${dx}_lo`, x: dx, y: -64, kind: 'door' });
  }
  // 车头与车尾挂点
  anchors.push({ id: 'nose_top', x: TRAIN.halfW + 4, y: TRAIN.roofY + 26, kind: 'side' });
  anchors.push({ id: 'nose_mid', x: TRAIN.halfW + 6, y: -102, kind: 'side' });
  anchors.push({ id: 'nose_bar', x: TRAIN.halfW + 30, y: TRAIN.noseY - 2, kind: 'nose' });
  anchors.push({ id: 'nose_bumper', x: TRAIN.halfW + TRAIN.noseW - 4, y: -48, kind: 'nose' });
  anchors.push({ id: 'tail_top', x: -TRAIN.halfW - 4, y: TRAIN.roofY + 22, kind: 'side' });
  anchors.push({ id: 'tail_mid', x: -TRAIN.halfW - 6, y: -112, kind: 'side' });
  anchors.push({ id: 'tail_bar', x: -TRAIN.halfW - 24, y: TRAIN.tailY - 2, kind: 'tail' });
  anchors.push({ id: 'tail_low', x: -TRAIN.halfW - 26, y: -56, kind: 'tail' });
  return anchors;
}

export const TRAIN_ANCHORS = buildTrainAnchors();

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

export class World {
  constructor(levelId = 'rush1', seed = 20261121) {
    this.level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
    this.seed = seed;
    this.reset();
  }

  reset() {
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

    this.pool = { ...this.level.pool };
    this.poolDepletedNotified = false;
    this.queue = this.buildShuffledDeck();
    this.undoStack = []; // 记录每批投放的乘客 id，支持 Z 键一键撤回！

    this.squadFilter = 'mix';
    this.burstSize = 1;
    this.crouching = false;
    this.crouchBlend = 0;
    this.stamina = 1.0;
    this.leanInput = 0;

    this.people = [];
    this.spawnedTotal = 0;
    this.fallenTotal = 0;
    this.peakOnBoard = 0;
    this.finalCount = 0;
    this.events = [];
    this.tunnelAlert = null;
  }

  buildShuffledDeck() {
    const deck = [];
    for (const [id, cnt] of Object.entries(this.pool)) {
      for (let i = 0; i < cnt; i++) deck.push(id);
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
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

  takeNextType() {
    if (this.squadFilter === 'mix') {
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
      this.squadFilter = 'mix';
    }
    return want;
  }

  /** 装车期 Z 键撤回上一批投放的乘客，原封退回站台限量池 */
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
        restored++;
      } else {
        keep.push(p);
      }
    }
    this.people = keep;
    if (restored > 0) {
      this.poolDepletedNotified = false;
      this.events.push({ type: 'undo', count: restored });
    }
    return restored;
  }

  previewFormation(targetX, targetY) {
    const avail = this.availableForFilter();
    if (avail <= 0) return [];
    const count = Math.min(this.burstSize, avail);
    const list = [];
    const getT = (i) => (this.squadFilter !== 'mix'
      ? this.squadFilter
      : (this.queue[i] || 'thin'));

    if (count === 1) {
      list.push({ typeId: getT(0), x: targetX, y: targetY, bagSide: (this.spawnedTotal % 2) ? 1 : -1 });
    } else if (count <= 3) {
      const spacing = 32;
      const offs = count === 2 ? [-17, 17] : [-spacing, 0, spacing];
      for (let i = 0; i < count; i++) {
        list.push({
          typeId: getT(i),
          x: targetX + offs[i],
          y: targetY - (i === 1 && count === 3 ? 10 : 0),
          bagSide: i === 0 ? -1 : 1,
        });
      }
    } else {
      const offs = [
        [-40, 0], [0, 0], [40, 0],
        [-20, -42], [20, -42],
      ];
      for (let i = 0; i < count; i++) {
        list.push({
          typeId: getT(i),
          x: targetX + offs[i][0],
          y: targetY + offs[i][1],
          bagSide: offs[i][0] < 0 ? -1 : 1,
        });
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
    const cy = Math.max(-440, Math.min(-42, targetY));
    const formation = this.previewFormation(cx, cy);
    if (!formation.length) return 0;

    let launched = 0;
    const batchIds = [];
    const isBeatPerfect = this.beatPhase < 0.20 || this.beatPhase > 0.80;

    for (const slot of formation) {
      const typeId = this.takeNextType();
      if (!typeId) break;
      const spec = TYPE_MAP[typeId];
      const startX = slot.x + (this.rng() - 0.5) * 28;
      const startY = -12;
      const pid = nextPersonId++;
      const person = {
        id: pid,
        typeId,
        spec,
        bagSide: slot.bagSide,
        flying: true,
        flyT: 0,
        flyDur: 0.13,
        flyFromX: startX,
        flyFromY: startY,
        flyToX: Math.max(-TRAIN.halfW - 44, Math.min(TRAIN.halfW + 52, slot.x)),
        flyToY: Math.max(-430, Math.min(-48, slot.y)),
        p0: { x: startX, y: startY, ox: startX, oy: startY },
        p1: { x: startX, y: startY - spec.bone, ox: startX, oy: startY - spec.bone },
        grips: [],
        onSideWall: false,
        fallen: false,
        screamed: false,
        perfect: isBeatPerfect,
        strainMax: 0,
        mood: 'happy',
        tiltHint: angleHint,
      };
      this.people.push(person);
      batchIds.push(pid);
      this.spawnedTotal++;
      launched++;
    }

    if (launched > 0) {
      this.undoStack.push({ ids: batchIds });
      if (this.undoStack.length > 24) this.undoStack.shift();
      this.events.push({ type: 'launch', count: launched, x: cx, y: cy, perfect: isBeatPerfect });
      if (this.poolTotal() === 0 && !this.poolDepletedNotified) {
        this.poolDepletedNotified = true;
        this.events.push({ type: 'poolEmpty' });
      }
    }
    return launched;
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
    this.phase = 'running';
    this.undoStack.length = 0;
    this.events.push({ type: 'depart', count: this.onBoardCount() });
    return true;
  }

  finishFly(p) {
    p.flying = false;
    // 挂壁娃专属策略：如果落在车厢侧门竖杆附近，直接紧贴车门外侧外挂，不弹去车顶！
    let nearDoor = false;
    if (p.spec.sideCling && p.flyToY > TRAIN.roofY + 8 && p.flyToY < TRAIN.floorY - 6) {
      for (const dx of DOOR_BAR_XS) {
        if (Math.abs(p.flyToX - dx) <= 58) { nearDoor = true; break; }
      }
    }
    p.onSideWall = nearDoor;

    const safe = nearDoor
      ? { x: p.flyToX, y: p.flyToY }
      : this.pushOutOfTrain(p.flyToX, p.flyToY, p.spec.r0);

    p.p0.x = safe.x;
    p.p0.y = safe.y;
    p.p1.x = safe.x + (p.tiltHint || 0) * 6;
    p.p1.y = safe.y - p.spec.bone;
    const dropV = p.perfect ? 0.28 : 1.0;
    p.p0.ox = p.p0.x;
    p.p0.oy = p.p0.y - dropV;
    p.p1.ox = p.p1.x;
    p.p1.oy = p.p1.y - dropV;
    this.acquireGrips(p);
    // 若挂壁娃在车侧但没抓到门把手，退回普通推离车身
    if (p.onSideWall && p.grips.length === 0) {
      p.onSideWall = false;
      const out = this.pushOutOfTrain(p.p0.x, p.p0.y, p.spec.r0);
      p.p0.x = out.x; p.p0.y = out.y;
      p.p1.x = out.x; p.p1.y = out.y - p.spec.bone;
      this.acquireGrips(p);
    }
    this.events.push({ type: 'grab', x: safe.x, y: safe.y, grips: p.grips.length, typeId: p.typeId });
  }

  acquireGrips(p) {
    const candidates = [];
    const maxR = p.spec.gripRange;

    for (const a of TRAIN_ANCHORS) {
      // 只有挂壁娃能抓车厢侧门外扶手
      if (a.kind === 'door' && !p.spec.sideCling) continue;
      const d1 = Math.hypot(a.x - p.p1.x, a.y - p.p1.y);
      const d0 = Math.hypot(a.x - p.p0.x, a.y - p.p0.y);
      if (d1 <= maxR) {
        candidates.push({ kind: 'anchor', anchor: a, myPart: 1, dist: d1, score: d1 * 0.72 });
      }
      if (p.spec.anchorBothEnds && d0 <= maxR) {
        candidates.push({ kind: 'anchor', anchor: a, myPart: 0, dist: d0, score: d0 * 0.74 });
      } else if (d0 <= maxR * 0.78) {
        candidates.push({ kind: 'anchor', anchor: a, myPart: 0, dist: d0, score: d0 * 0.85 });
      }
    }

    for (const other of this.people) {
      if (other.id === p.id || other.flying || other.fallen) continue;
      // 侧门外挂只跟同样在门外的挂壁娃或门把手交互
      if (p.onSideWall !== other.onSideWall) continue;
      const d11 = Math.hypot(other.p1.x - p.p1.x, other.p1.y - p.p1.y);
      const d01 = Math.hypot(other.p1.x - p.p0.x, other.p1.y - p.p0.y);
      // 胖叔宽肩更有吸引力（优先抓胖叔！）
      const bonus = other.spec.shoulderBoost > 1.2 ? 0.82 : 1.0;
      if (d01 <= maxR * 0.95) {
        candidates.push({ kind: 'person', target: other, targetPart: 1, myPart: 0, dist: d01, score: d01 * bonus });
      }
      if (d11 <= maxR) {
        candidates.push({ kind: 'person', target: other, targetPart: 1, myPart: 1, dist: d11, score: d11 * 1.05 * bonus });
      }
    }

    candidates.sort((a, b) => a.score - b.score);
    const usedAnchors = new Set();
    const usedPersons = new Set();

    for (const c of candidates) {
      if (p.grips.length >= p.spec.maxGrips) break;
      if (c.kind === 'anchor') {
        if (usedAnchors.has(c.anchor.id)) continue;
        usedAnchors.add(c.anchor.id);
        p.grips.push({
          kind: 'anchor',
          anchor: c.anchor,
          myPart: c.myPart,
          restLen: Math.max(8, Math.min(c.dist + 2, maxR * 0.78)),
          strain: 0,
          breakT: 0,
        });
      } else {
        if (usedPersons.has(c.target.id)) continue;
        usedPersons.add(c.target.id);
        p.grips.push({
          kind: 'person',
          targetId: c.target.id,
          targetPart: c.targetPart,
          myPart: c.myPart,
          restLen: Math.max(p.spec.r0 + c.target.spec.r1 - 1, Math.min(c.dist + 2, maxR * 0.85)),
          strain: 0,
          breakT: 0,
        });
      }
    }
  }

  pushOutOfTrain(x, y, r) {
    const minX = -TRAIN.halfW - r;
    const maxX = TRAIN.halfW + r;
    const minY = TRAIN.roofY - r;
    const maxY = TRAIN.floorY + r;
    if (x > minX && x < maxX && y > minY && y < maxY) {
      const dTop = Math.abs(y - minY);
      const dLeft = Math.abs(x - minX);
      const dRight = Math.abs(maxX - x);
      const m = Math.min(dTop, dLeft, dRight);
      if (m === dTop) return { x, y: minY, normalY: -1, normalX: 0 };
      if (m === dLeft) return { x: minX, y, normalX: -1, normalY: 0 };
      return { x: maxX, y, normalX: 1, normalY: 0 };
    }

    if (x > TRAIN.halfW - r && x < TRAIN.halfW + TRAIN.noseW + r && y > TRAIN.noseY - r && y < TRAIN.floorY + r) {
      const dTop = Math.abs(y - (TRAIN.noseY - r));
      const dRight = Math.abs((TRAIN.halfW + TRAIN.noseW + r) - x);
      if (dTop <= dRight) return { x, y: TRAIN.noseY - r, normalY: -1, normalX: 0 };
      return { x: TRAIN.halfW + TRAIN.noseW + r, y, normalX: 1, normalY: 0 };
    }

    if (x > -TRAIN.halfW - TRAIN.tailW - r && x < -TRAIN.halfW + r && y > TRAIN.tailY - r && y < TRAIN.floorY + r) {
      const dTop = Math.abs(y - (TRAIN.tailY - r));
      const dLeft = Math.abs(x - (-TRAIN.halfW - TRAIN.tailW - r));
      if (dTop <= dLeft) return { x, y: TRAIN.tailY - r, normalY: -1, normalX: 0 };
      return { x: -TRAIN.halfW - TRAIN.tailW - r, y, normalX: -1, normalY: 0 };
    }

    return { x, y, normalX: 0, normalY: 0 };
  }

  onBoardCount() {
    let n = 0;
    for (const p of this.people) if (!p.fallen) n++;
    return n;
  }

  /** 本关最矮涵洞高度（无涵洞返回 null） */
  lowestTunnelY() {
    if (!this.level.tunnels.length) return null;
    let lowest = -9999;
    for (const tun of this.level.tunnels) if (tun.clearY > lowest) lowest = tun.clearY;
    return lowest;
  }

  massStats() {
    let totalMass = 0;
    let momentX = 0;
    let maxHeight = 0;
    for (const p of this.people) {
      if (p.fallen || p.flying) continue;
      const cx = (p.p0.x + p.p1.x) * 0.5 + (p.spec.biasX ? p.bagSide * 28 : 0);
      totalMass += p.spec.mass;
      momentX += cx * p.spec.mass;
      const top = Math.min(p.p0.y - p.spec.r0, p.p1.y - p.spec.r1);
      maxHeight = Math.max(maxHeight, TRAIN.roofY - top);
    }
    const comX = totalMass > 0 ? momentX / totalMass : 0;
    const norm = Math.max(-1, Math.min(1, comX / TRAIN.halfW));
    return { totalMass, comX, norm, maxHeight };
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
      this.loadLeft = Math.max(0, this.loadLeft - dt);
      this.speed = 0;
      this.accelX = 0;
      this.bumpAccY = 0;
      this.braking = false;
      if (this.loadLeft <= 0) {
        if (this.onBoardCount() > 0) this.depart();
        else this.loadLeft = 10;
      }
    } else if (this.phase === 'running') {
      this.stepTrainMotion(dt);
    } else if (this.phase === 'arrived') {
      this.speed *= Math.exp(-8 * dt);
      this.accelX = 0;
      this.bumpAccY = 0;
      this.braking = false;
      this.settleTime += dt;
    }

    const activeCrouch = this.phase === 'running' && this.crouching && this.stamina > 0.04;
    if (activeCrouch) {
      this.stamina = Math.max(0, this.stamina - dt * 0.34);
      this.crouchBlend = Math.min(1, this.crouchBlend + dt * 7.5);
    } else {
      this.stamina = Math.min(1, this.stamina + dt * 0.24);
      this.crouchBlend = Math.max(0, this.crouchBlend - dt * 6.5);
    }

    // 强化重心倾覆力矩：真正让「大包大妈配平」与「A/D 全员压重心」产生肉眼可见的策略回报！
    const stats = this.massStats();
    const massBias = stats.norm * Math.min(1.15, stats.totalMass / 18);
    const leanTorque = this.phase === 'running' ? this.leanInput * 0.145 : 0;
    const accelPitch = (this.accelX / 1100) * 0.19;
    const targetTilt = Math.max(-0.42, Math.min(0.42, massBias * 0.34 - accelPitch + leanTorque));
    this.tiltV += ((targetTilt - this.tilt) * 24 - this.tiltV * 5.8) * dt;
    this.tilt += this.tiltV * dt;

    this.stepPhysics(dt, activeCrouch);

    const alive = this.onBoardCount();
    if (alive > this.peakOnBoard) this.peakOnBoard = alive;
  }

  stepTrainMotion(dt) {
    const lv = this.level;
    const rem = lv.distance - this.trainX;

    let targetAccel = 0;
    if (rem <= lv.brakeDist) {
      this.braking = true;
      if (!this.brakeAlerted) {
        this.brakeAlerted = true;
        this.events.push({ type: 'braking' });
      }
      const desiredV = Math.max(0, (rem / lv.brakeDist) * lv.maxSpeed);
      targetAccel = Math.max(-385, (desiredV - this.speed) * 4.2);
      if (rem <= 6 && this.speed < 28) {
        this.trainX = lv.distance;
        this.speed = 0;
        this.accelX = 0;
        this.braking = false;
        this.phase = 'arrived';
        this.settleTime = 0;
        this.finalCount = this.onBoardCount();
        this.events.push({ type: 'arrived', count: this.finalCount });
        return;
      }
    } else if (this.speed < lv.maxSpeed) {
      this.braking = false;
      targetAccel = lv.accel * (this.speed < 120 ? 1.42 : 0.92);
    } else {
      this.braking = false;
      targetAccel = (lv.maxSpeed - this.speed) * 2.0;
    }

    this.accelX += (targetAccel - this.accelX) * Math.min(1, dt * 8);
    this.speed = Math.max(0, this.speed + this.accelX * dt);
    this.trainX += this.speed * dt;

    const speedK = Math.min(1, this.speed / Math.max(1, lv.maxSpeed));
    const wave = Math.sin(this.trainX * 0.045) * 0.65 + Math.sin(this.trainX * 0.11) * 0.35;
    this.bumpY = wave * 4.2 * speedK;
    this.bumpAccY = Math.cos(this.trainX * 0.045) * lv.bumpAmp * speedK;

    let alert = null;
    for (const tun of lv.tunnels) {
      const dist = tun.x - this.trainX - TRAIN.halfW;
      if (dist > -tun.len - 200 && dist < 820) {
        alert = { ...tun, dist };
        break;
      }
    }
    this.tunnelAlert = alert;
  }

  stepPhysics(dt, activeCrouch) {
    const byId = new Map();
    for (const p of this.people) byId.set(p.id, p);

    for (const p of this.people) {
      if (!p.flying) continue;
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

    const active = this.people.filter((p) => !p.flying);
    const gBase = 760;
    const gx = Math.sin(this.tilt) * gBase - this.accelX * 1.28;
    const gy = Math.cos(this.tilt) * gBase + this.bumpAccY * 2.2;
    const dt2 = dt * dt;
    const cb = this.crouchBlend;

    for (const p of active) {
      const damp = p.fallen ? 0.996 : (cb > 0.1 ? 0.968 : 0.985);
      const bagForceX = p.spec.biasX && !p.fallen ? p.bagSide * 155 : 0;
      const leanForceX = this.phase === 'running' && !p.fallen ? this.leanInput * 220 : 0;

      for (const idx of [0, 1]) {
        const pt = idx === 0 ? p.p0 : p.p1;
        const vx = (pt.x - pt.ox) * damp;
        const vy = (pt.y - pt.oy) * damp;
        pt.ox = pt.x;
        pt.oy = pt.y;
        const fx = gx + (idx === 1 ? bagForceX + leanForceX : 0);
        const upright = (idx === 1 && !p.fallen && p.grips.length > 0)
          ? -520 * (1 - cb)
          : 0;
        pt.x += vx + fx * dt2;
        pt.y += vy + (gy + upright) * dt2;
      }
      p.strainMax = 0;
    }

    const ITERS = 6;
    const gripBoost = 1.0 + 0.78 * cb;

    for (let iter = 0; iter < ITERS; iter++) {
      // 2a) 骨骼长度约束
      for (const p of active) {
        const duck = !p.fallen ? cb : 0;
        const targetBone = p.spec.bone * (1 - 0.50 * duck);
        const dx = p.p1.x - p.p0.x;
        const dy = p.p1.y - p.p0.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const err = (d - targetBone) / d;
        const w0 = 0.45 * (1 - duck * 0.72);
        const w1 = 1 - w0;
        p.p0.x += dx * err * w0;
        p.p0.y += dy * err * w0;
        p.p1.x -= dx * err * w1;
        p.p1.y -= dy * err * w1;
        if (!p.fallen && p.grips.length > 0 && duck < 0.2 && p.p1.y > p.p0.y - targetBone * 0.65) {
          p.p1.y -= 0.45 * (1 - duck * 5);
        }
      }

      // 2b) 抓手关节约束（含胖叔宽肩加固 ×1.48 & 竹竿跨堆拉索加固 ×1.35！）
      for (const p of active) {
        if (p.fallen) continue;
        const tallBrace = (p.typeId === 'tall' && p.grips.length >= 2) ? 1.35 : 1.0;

        for (let gi = p.grips.length - 1; gi >= 0; gi--) {
          const g = p.grips[gi];
          const pt = g.myPart === 0 ? p.p0 : p.p1;
          let tx, ty, targetPt = null, targetPerson = null;
          let targetBoost = 1.0;

          if (g.kind === 'anchor') {
            tx = g.anchor.x; ty = g.anchor.y;
          } else {
            targetPerson = byId.get(g.targetId);
            if (!targetPerson || targetPerson.fallen) {
              p.grips.splice(gi, 1);
              continue;
            }
            targetPt = g.targetPart === 0 ? targetPerson.p0 : targetPerson.p1;
            tx = targetPt.x; ty = targetPt.y;
            targetBoost = targetPerson.spec.shoulderBoost || 1.0;
          }

          const dx = tx - pt.x;
          const dy = ty - pt.y;
          const d = Math.hypot(dx, dy) || 0.001;
          if (d > g.restLen) {
            const stretch = d - g.restLen;
            const stiff = g.kind === 'anchor' ? 0.68 : 0.46;
            const corr = (stretch / d) * stiff;
            if (g.kind === 'anchor') {
              pt.x += dx * corr;
              pt.y += dy * corr;
            } else {
              const wA = 1 / p.spec.mass;
              const wB = 1 / targetPerson.spec.mass;
              const sum = wA + wB;
              pt.x += dx * corr * (wA / sum);
              pt.y += dy * corr * (wA / sum);
              targetPt.x -= dx * corr * (wB / sum);
              targetPt.y -= dy * corr * (wB / sum);
            }
            if (iter === ITERS - 1) {
              const linkRisk = g.kind === 'anchor' ? 0.72 : 1.32;
              const effGrip = p.spec.gripStrength * gripBoost * targetBoost * tallBrace;
              const load = (stretch * (0.55 + p.spec.mass * 0.28) * linkRisk) / (8.4 * effGrip);
              g.strain = g.strain * 0.70 + load * 0.30;
              if (g.strain > p.strainMax) p.strainMax = g.strain;
            }
          } else if (iter === ITERS - 1) {
            g.strain *= 0.85;
          }
        }
      }

      // 2c) 两两碰撞推开（加 AABB 粗筛，72 人满屏依然 120Hz 零掉帧！）
      const n = active.length;
      for (let i = 0; i < n; i++) {
        const A = active[i];
        if (A.fallen) continue;
        const wA = 1 / A.spec.mass;
        const ax = A.p0.x, ay = A.p0.y;
        for (let j = i + 1; j < n; j++) {
          const B = active[j];
          if (B.fallen) continue;
          // 侧门外挂只跟侧门外挂互相碰撞，不跟车顶人干扰
          if (A.onSideWall !== B.onSideWall) continue;
          if (Math.abs(ax - B.p0.x) > 64 || Math.abs(ay - B.p0.y) > 96) continue;

          const wB = 1 / B.spec.mass;
          const wSum = wA + wB;
          const partsA = [[A.p0, A.spec.r0], [A.p1, A.spec.r1]];
          const partsB = [[B.p0, B.spec.r0], [B.p1, B.spec.r1]];
          for (let pa = 0; pa < 2; pa++) {
            const [aPt, aR] = partsA[pa];
            for (let pb = 0; pb < 2; pb++) {
              const [bPt, bR] = partsB[pb];
              const dx = bPt.x - aPt.x;
              const dy = bPt.y - aPt.y;
              const minD = aR + bR - 1.5;
              const d2 = dx * dx + dy * dy;
              if (d2 >= minD * minD || d2 < 1e-6) continue;
              const d = Math.sqrt(d2);
              const push = (minD - d) / d;
              const px = dx * push;
              const py = dy * push;
              aPt.x -= px * (wA / wSum);
              aPt.y -= py * (wA / wSum);
              bPt.x += px * (wB / wSum);
              bPt.y += py * (wB / wSum);

              if (iter === ITERS - 1) {
                const rvx = (bPt.x - bPt.ox) - (aPt.x - aPt.ox);
                const fric = 0.25;
                aPt.ox -= rvx * fric * (wA / wSum);
                bPt.ox += rvx * fric * (wB / wSum);

                if (dy < -minD * 0.45 && A.spec.mass > B.spec.mass * 1.6) {
                  B.strainMax = Math.max(B.strainMax, 0.95);
                } else if (dy > minD * 0.45 && B.spec.mass > A.spec.mass * 1.6) {
                  A.strainMax = Math.max(A.strainMax, 0.95);
                }
              }
            }
          }
        }
      }

      // 2d) 车身碰撞 + 涵洞削顶（车门外挂挂壁娃免车身弹出且免疫涵洞！）
      for (const p of active) {
        for (const [pt, r] of [[p.p0, p.spec.r0], [p.p1, p.spec.r1]]) {
          if (!p.fallen && !p.onSideWall) {
            const out = this.pushOutOfTrain(pt.x, pt.y, r);
            if (out.normalX || out.normalY) {
              pt.x = out.x;
              pt.y = out.y;
              if (out.normalY < 0) {
                const keep = 1 - p.spec.roofFric;
                const vx = pt.x - pt.ox;
                pt.ox = pt.x - vx * keep;
              }
            }
          }

          if (this.phase === 'running' && !p.fallen && !p.onSideWall) {
            for (const tun of this.level.tunnels) {
              const localLeft = tun.x - this.trainX;
              const localRight = localLeft + tun.len;
              if (pt.x + r > localLeft && pt.x - r < localRight && pt.y - r < tun.clearY) {
                pt.y = tun.clearY + r + 2;
                pt.ox = pt.x + 8.5;
                p.grips.length = 0;
                p.strainMax = 2.0;
                if (!p.screamed) {
                  p.screamed = true;
                  this.events.push({ type: 'bonk', x: pt.x, y: pt.y, typeId: p.typeId });
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

    // 3) 抓手崩断 & 脱落
    for (const p of active) {
      if (p.fallen) {
        if (this.phase === 'running') {
          p.p0.x -= this.speed * dt * 0.75;
          p.p1.x -= this.speed * dt * 0.75;
          p.p0.ox -= this.speed * dt * 0.75;
          p.p1.ox -= this.speed * dt * 0.75;
        }
        continue;
      }

      for (let gi = p.grips.length - 1; gi >= 0; gi--) {
        const g = p.grips[gi];
        if (g.strain > 1.0) {
          g.breakT += dt;
          if (g.breakT >= 0.26) {
            p.grips.splice(gi, 1);
            this.events.push({ type: 'snap', x: p.p1.x, y: p.p1.y });
          }
        } else {
          g.breakT = Math.max(0, g.breakT - dt * 1.5);
        }
      }

      // 侧门外挂若抓手全断，立刻失去贴壁状态掉落
      if (p.onSideWall && p.grips.length === 0) {
        p.onSideWall = false;
      }

      const cx = (p.p0.x + p.p1.x) * 0.5;
      const cy = Math.max(p.p0.y, p.p1.y);
      const outSide = cx < -TRAIN.halfW - 95 || cx > TRAIN.halfW + 105;
      const hitGround = cy >= -16;
      if (outSide || hitGround) {
        p.fallen = true;
        p.onSideWall = false;
        p.grips.length = 0;
        p.mood = 'fallen';
        this.fallenTotal++;
        this.events.push({ type: 'fall', x: cx, y: cy, typeId: p.typeId });
      } else {
        if (activeCrouch) p.mood = 'crouch';
        else if (p.strainMax > 0.78 || p.grips.length === 0) p.mood = 'panic';
        else if (p.strainMax > 0.42) p.mood = 'strain';
        else p.mood = 'happy';
      }
    }

    this.people = this.people.filter((p) => !p.fallen || p.p0.x > -900);
  }

  rankOf(count = this.finalCount) {
    const names = ['C', 'B', 'A', 'S', 'SS'];
    const t = this.level.targets;
    let idx = 0;
    for (let i = 0; i < t.length; i++) if (count >= t[i]) idx = i + 1;
    return { name: names[idx], index: idx, next: idx < t.length ? t[idx] : null };
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
