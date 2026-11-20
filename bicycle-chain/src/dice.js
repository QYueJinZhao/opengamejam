// 骰子模式的全部规则：点色表、牌型识别、计分、机器人评估。
//
// 为什么单独一个文件：这套规则要在四个地方同时成立——
//   sim 结算、bot 决策、render 画骰面、rules 断言。
// 一旦分散，最先出问题的不是算法，而是"两处对顺子的定义差一个等号"，
// 那种 bug 在画面上表现为"明明看着是顺子却不消"，查起来极慢。
//
// ---- ci 编码 ----
//   0..5    普通骰 1..6 点
//   20..25  翻面骰（Masked Die）：点数同上，但被消除时会把左右邻骰翻成同点
//   10      万能金骰（落地定型成最优点数）
//   11      爆破红骰（落地即炸，不插入）
//   12      空白铅骰（无点、不参与匹配，只能被相邻消除或爆破清掉）
//
// 用 20+pip 编码翻面骰，而不是给珠子加一个 flip 标志：
// 出球队列里只传一个整数（queues / balls / events 都是这个约定），
// 加字段就得在四处同步复制，任何一处漏了，翻面骰就会在某个环节变回普通骰。
// 20 段和 0..5 段用 `ci % 20 + 1` 就能统一成点数，代价只有一处取模。

/** 六面骰的点色表。点数是第一编码，色相是第二编码（也是加速读盘的线索）。 */
export const PIPS = [
  { pip: 1, key: 'd1', name: '1', base: '#FF3B4E', light: '#FFC6CC', dark: '#5E0A12' },
  { pip: 2, key: 'd2', name: '2', base: '#FF8A2B', light: '#FFD6A8', dark: '#5A2600' },
  { pip: 3, key: 'd3', name: '3', base: '#FFC93C', light: '#FFF0BC', dark: '#5E3F00' },
  { pip: 4, key: 'd4', name: '4', base: '#19D3F0', light: '#B6F5FF', dark: '#044A61' },
  { pip: 5, key: 'd5', name: '5', base: '#4C7DFF', light: '#C2D4FF', dark: '#0A1F63' },
  { pip: 6, key: 'd6', name: '6', base: '#A855F7', light: '#E4CBFF', dark: '#3A0F73' },
];

export const FLIP_CI = 20;   // 20..25
export const FLIP_DIE = 13;  // 逻辑标记（不进队列），只给 event 用

/**
 * 骰子模式的三种特殊骰外观。
 *
 * 它们的 shape 和普通骰一样是"方块"，靠**面部纹样**区分：
 * 金骰是七彩渐变面 + 六点虚位，红骰是黑面 + 熔芯，铅骰是无点哑光。
 * 这和基础模式的"形状即编码"是两套语言，但结论一样：
 * 三种特殊骰在缩小到 15px 时，剪影仍然互不相似（发光 / 有芯 / 全哑）。
 */
export const DICE_SPECIAL = {
  10: { key: 'w', name: '金骰', shape: 'wilddie', base: '#FFD86B', light: '#FFF6D0', dark: '#7A4E00' },
  11: { key: 'x', name: '红骰', shape: 'bombdie', base: '#FF6B3D', light: '#FFD9A0', dark: '#3A1600' },
  12: { key: 'u', name: '铅骰', shape: 'blankdie', base: '#8C8781', light: '#C3BDB5', dark: '#211F1C' },
};

/** 这颗 ci 是不是"有点数的骰子"（普通 0..5 或翻面 20..25） */
export function isPip(ci) {
  return (ci >= 0 && ci < 6) || (ci >= FLIP_CI && ci < FLIP_CI + 6);
}

/** ci → 点数 1..6。只对 isPip 的 ci 有意义。 */
export function pipOf(ci) {
  return (ci % 20) + 1;
}

/** ci → 点色表下标 0..5 */
export function pipIndex(ci) {
  return pipOf(ci) - 1;
}

export function isFlipDie(ci) {
  return ci >= FLIP_CI && ci < FLIP_CI + 6;
}

export function flipCi(pip) {
  return FLIP_CI + pip - 1;
}

/** 骰面配色。翻面骰沿用同点色，但渲染会加一圈反向箭头。 */
export function pipSkin(ci) {
  return PIPS[pipIndex(ci)];
}

/**
 * 牌型计分。
 *
 * 数值全部来自设计稿，但有两处**必须留住**的取舍：
 *
 * 1. 豹子 40/点，顺子 50/点（3 连）与 90/点（4 连以上）。
 *    顺子单价更高，是因为它更难**故意**做出来：豹子只要把同点凑一起，
 *    顺子还要求方向一致（1-2-3 和 3-2-1 都算，1-2-2-3 不算）。
 *
 * 2. 六连顺额外 +5000，而不是把单价再翻倍。
 *    它的出现概率极低（六个连续点数正好排在一起），
 *    按倍率算只有 3400 上下，和一次豹子拉不开数量级；
 *    固定值才能让"我遇到过一次"变成可以复述的事。
 */
export function patternValue(p) {
  if (!p) return 0;
  if (p.kind === 'same') {
    let v = p.sum * 40;
    if (p.jackpot) v = Math.round(v * 1.5);
    return v;
  }
  let v = p.sum * (p.len === 3 ? 50 : 90);
  if (p.len >= 6) v += 5000;
  return v;
}

/** 牌型的中文名与展示色。渲染层与浮字共用，避免两处各写一份。 */
export function patternLabel(p) {
  if (!p) return { name: '', color: '#E8F0FA' };
  if (p.kind === 'same') {
    // 6 点的豹子一律吃 JACKPOT ×1.5，但名字要跟着长度走：
    // 四颗 6 点还叫"六六六"会让玩家以为自己数错了盘面。
    if (p.jackpot && p.len > 3) return { name: `JACKPOT ×${p.len}`, color: '#FFD65A' };
    if (p.jackpot) return { name: 'JACKPOT 六六六', color: '#FFD65A' };
    if (p.len >= 4) return { name: `豹子 ×${p.len}`, color: '#FFD65A' };
    return { name: '豹子', color: '#FFB44A' };
  }
  if (p.len >= 6) return { name: '六连顺', color: '#FF5C8A' };
  if (p.len >= 4) return { name: `大顺子 ×${p.len}`, color: '#9BE9FF' };
  return { name: '顺子', color: '#7FD8FF' };
}

/**
 * 在环上找**最值钱**的那一段牌型。
 *
 * 为什么是"最值钱"而不是"最长的"：两者在绝大多数情况下一致，
 * 但冲突时（比如 4 连豹子的 1440 分 vs 3 连顺子的 300 分）
 * 玩家看到的是盘面，心里算的是收益。让他得到更多分的那一种，
 * 才是"系统更聪明"的那一种。
 *
 * 不做起点去重：N=30、三种牌型，一帧最多 90 次短扫描，成本可以忽略；
 * 去重反而要多写一套"上一格是否延续"的判断，那是 bug 的温床。
 */
export function findPattern(slots, N) {
  let best = null;
  let bestV = 0;

  const take = (start, len, kind, sum, jackpot = false) => {
    const p = { start, len, kind, sum, jackpot };
    const v = patternValue(p);
    // value 必须**写回**牌型对象：sim 的 resolve 读的是 run.value，
    // 少了这一行，骰子的计分表整张失效——它会静默退回基础模式的
    // BASE_SCORE(len)（3 颗 300 / 4 颗 700），画面上分数照涨，
    // 只是"豹子 40/点、顺子 50/90、六连顺 +5000"从来没有生效过。
    // 这类 bug 不会报错、不会崩、只会让设计稿的数字变成装饰。
    p.value = v;
    // 同分时留更长的那段：分数一样，但"消掉 4 颗"比"消掉 3 颗"让盘面更松。
    if (v > bestV || (v === bestV && best && len > best.len)) {
      bestV = v;
      best = p;
    }
  };

  for (let i = 0; i < N; i++) {
    const a = slots[i];
    if (!a || !isPip(a.ci)) continue;
    const v0 = pipOf(a.ci);

    // 同点（豹子）
    let len = 1;
    while (len < N) {
      const b = slots[(i + len) % N];
      if (!b || !isPip(b.ci) || pipOf(b.ci) !== v0) break;
      len++;
    }
    if (len >= 3) take(i, len, 'same', v0 * len, v0 === 6);

    // 递增顺子
    len = 1;
    while (len < N) {
      const b = slots[(i + len) % N];
      if (!b || !isPip(b.ci) || pipOf(b.ci) !== v0 + len) break;
      len++;
    }
    if (len >= 3) take(i, len, 'run', len * v0 + (len * (len - 1)) / 2);

    // 递减顺子
    len = 1;
    while (len < N) {
      const b = slots[(i + len) % N];
      if (!b || !isPip(b.ci) || pipOf(b.ci) !== v0 - len) break;
      len++;
    }
    if (len >= 3) take(i, len, 'run', len * v0 - (len * (len - 1)) / 2);
  }
  return best;
}

/**
 * 机器人/万能骰用的落点评分：这颗骰子落在 k 值多少。
 *
 * `occupied = true` 表示 k 上有珠子（插入会把右边整体推开一格），
 * 此时右邻是**当前 k 上的那颗**；落空时右邻是 k+1。
 * 这个差别在单发时只有一格，但它恰好是"顺子的最后一个空"和
 * "把顺子顶断"之间的差别——机器人实测会差 8% 的分。
 *
 * 分数只是给排序用的相对值，不需要和 patternValue 对齐。
 */
export function evalPlacement(at, N, k, ci, occupied) {
  if (!isPip(ci)) return 0;
  const v = pipOf(ci);
  const rBase = occupied ? k : k + 1;

  const at1 = (j) => at(j);
  const pipAt = (j) => {
    const b = at1(j);
    return b && isPip(b.ci) ? pipOf(b.ci) : 0;
  };

  let best = 6;
  const walk = (leftWant, rightWant) => {
    let l = 0;
    for (let i = 1; i < N; i++) {
      if (pipAt(k - i) !== leftWant(i)) break;
      l++;
    }
    let r = 0;
    for (let i = 0; i < N - 1; i++) {
      if (pipAt(rBase + i) !== rightWant(i)) break;
      r++;
    }
    const len = 1 + l + r;
    const sc = len >= 3 ? 210 + len * 34 : len === 2 ? 36 : 6;
    if (sc > best) best = sc;
  };

  // 同点
  walk(() => v, () => v);
  // 递增：左侧要 v-1, v-2…；右侧要 v+1, v+2…
  walk((i) => v - i, (i) => v + 1 + i);
  // 递减
  walk((i) => v + i, (i) => v - 1 - i);

  // 空位本身值一点：落空才可能吸附，占用才可能插进缝里，两者都不该被惩罚。
  return best;
}

/** 某个落点、某个点数会形成的最长牌型长度（万能骰定型用，直接求最优牌型）。 */
export function bestPipAt(at, N, k, occupied) {
  let bestPip = 1, bestSc = -1;
  for (let pip = 1; pip <= 6; pip++) {
    const sc = evalPlacement(at, N, k, pip - 1, occupied);
    if (sc > bestSc) { bestSc = sc; bestPip = pip; }
  }
  return bestPip;
}

/**
 * 双喷头"双响同点"选点：给两个落点同时选一个点数，使两边收益之和最大。
 * 用 ±2 格的窗口近似"这一拍可能落在哪儿"——精确解要对 30 个相位各算一次，
 * 而这个奖励是每 14 秒一次的福利，不需要精确到格。
 */
export function bestSharedPip(at, N, offs, occupiedOf) {
  let bestPip = 1, bestSc = -1;
  for (let pip = 1; pip <= 6; pip++) {
    let sum = 0;
    for (const off of offs) {
      let m = 0;
      for (let d = -2; d <= 2; d++) {
        const k = ((off + d) % N + N) % N;
        m = Math.max(m, evalPlacement(at, N, k, pip - 1, occupiedOf(k)));
      }
      sum += m;
    }
    if (sum > bestSc) { bestSc = sum; bestPip = pip; }
  }
  return bestPip;
}
