// 扑克规则族：牌面编码、牌型识别、计分、机器人评估。
//
// 为什么单独一个文件：这套规则要同时出现在 sim 结算、bot 决策、
// render 画牌面、rules 断言四个地方。和骰子模式同一个理由——
// 一旦分散，最先坏的不是算法，而是"两处对同花顺的定义差一个等号"，
// 那种 bug 在画面上表现为"明明看着是同花顺却不消"。
//
// ---- ci 编码 ----
//   30..49   普通牌 = 30 + rank*4 + suit
//            rank 0..4 = 10 / J / Q / K / A
//            suit 0..3 = ♥ / ♦ / ♠ / ♣
//   60..79   染花牌，牌面同上，被消除时把左右邻改成同一花色
//   10       小丑牌（万能：任意花色 + 任意点数）
//   11       爆破王牌（按 A 参与牌型，消除时额外炸左右各一张）
//   12       背面暗牌（无花色无点数，不参与牌型）
//
// 为什么普通牌从 30 起、而不是 0 起：0..3 是基础模式的四色，10/11/12
// 是三种特殊球。把 20 张牌放到一个全新的段里，`ci === BOMB` 这类判断
// 天然不会误命中；代价只有一处 `ci - CARD_BASE` 取模。
//
// 染花牌用 60 + 牌面编码，而不是给珠子加一个 shift 标志：队列和事件
// 都只传一个整数，加字段要在四处同步；任何一处漏了，染花牌就会在
// 某个路径上悄悄变回普通牌，而且只在"特殊牌正好被消掉"时出现。

import { mod } from './geom.js';

export const CARD_BASE = 30;
export const SHIFT_BASE = 60;
export const JOKER = 10;
export const ACE_BOMB = 11;
export const FACE_DOWN = 12;

/** 四花色。颜色不是装饰：远看认花色，近看认点数。 */
export const SUITS = [
  { key: 'h', sym: '♥', name: '红心', base: '#FF3B4E', light: '#FFC6CC', dark: '#5E0A12' },
  { key: 'd', sym: '♦', name: '方块', base: '#FFC93C', light: '#FFF0BC', dark: '#5E3F00' },
  { key: 's', sym: '♠', name: '黑桃', base: '#19D3F0', light: '#B6F5FF', dark: '#044A61' },
  { key: 'c', sym: '♣', name: '梅花', base: '#A855F7', light: '#E4CBFF', dark: '#3A0F73' },
];

export const RANKS = ['10', 'J', 'Q', 'K', 'A'];

export function cardCi(rank, suit) {
  return CARD_BASE + rank * 4 + suit;
}

export function isNormalCard(ci) {
  return ci >= CARD_BASE && ci < CARD_BASE + 20;
}

export function isShiftCard(ci) {
  return ci >= SHIFT_BASE && ci < SHIFT_BASE + 20;
}

export function isFaceCard(ci) {
  return isNormalCard(ci) || isShiftCard(ci);
}

/** 能不能参与牌型（暗牌不能；小丑和爆破王牌能）。 */
export function isPokerCard(ci) {
  return isFaceCard(ci) || ci === JOKER || ci === ACE_BOMB;
}

/** ci → 点数下标 0..4；小丑 / 暗牌返回 -1。 */
export function rankOf(ci) {
  if (isNormalCard(ci)) return Math.floor((ci - CARD_BASE) / 4);
  if (isShiftCard(ci)) return Math.floor((ci - SHIFT_BASE) / 4);
  if (ci === ACE_BOMB) return 4;       // 爆破王牌按 A 参与
  return -1;
}

/** ci → 花色下标 0..3；小丑 / 爆破王牌 / 暗牌返回 -1。
 *  爆破王牌的 -1 表示"任意花色"——它是一张会炸的 A。 */
export function suitOf(ci) {
  if (isNormalCard(ci)) return (ci - CARD_BASE) % 4;
  if (isShiftCard(ci)) return (ci - SHIFT_BASE) % 4;
  return -1;
}

/** 改花色并保留"是不是染花牌"的身份。 */
export function withSuit(ci, suit) {
  if (isNormalCard(ci)) return CARD_BASE + rankOf(ci) * 4 + suit;
  if (isShiftCard(ci)) return SHIFT_BASE + rankOf(ci) * 4 + suit;
  return ci;
}

/** 普通牌 → 染花牌（同样的点数和花色，多一圈染花印记）。 */
export function shiftVariant(ci) {
  if (!isNormalCard(ci)) return ci;
  return SHIFT_BASE + (ci - CARD_BASE);
}

export function cardSkin(ci) {
  if (ci === JOKER) {
    return {
      key: 'joker', base: '#FFD86B', light: '#FFFFFF', dark: '#7A4E00',
      rank: -1, suit: -1, sym: '★', kind: 'joker',
    };
  }
  if (ci === ACE_BOMB) {
    return {
      key: 'acebomb', base: '#FF6B3D', light: '#FFD9A0', dark: '#3A1600',
      rank: 4, suit: -1, sym: '✸', kind: 'bomb',
    };
  }
  if (ci === FACE_DOWN) {
    return {
      key: 'down', base: '#6E6A64', light: '#C3BDB5', dark: '#211F1C',
      rank: -1, suit: -1, sym: '?', kind: 'down',
    };
  }
  const s = SUITS[suitOf(ci)] || SUITS[0];
  return {
    key: s.key, base: s.base, light: s.light, dark: s.dark,
    rank: rankOf(ci), suit: suitOf(ci), sym: s.sym,
    kind: isShiftCard(ci) ? 'shift' : 'card',
  };
}

// ---- 牌型计分 ----
//
// 设计稿给了四个数字：同花 300（4 张 500）、三条 600（四条 1500）、
// 顺子 700（5 连 2500）、同花顺 2000。没有给的格位按"每多一张加一档"
// 补出来，并且全部写进 rules.mjs 的断言里，不让它们变成装饰。
const FLUSH_VALUE = [0, 0, 0, 300, 500, 900];
const THREE_VALUE = [0, 0, 0, 600, 1500, 2200];
const STRAIGHT_VALUE = [0, 0, 0, 700, 1300, 2500];
// 同花顺按张数递增：3 张保持设计稿 2000，4 张 3200，5 张皇家同花顺 5000。
// 此前写死标量 2000 会被 5 连普通顺子（2500）反超覆盖，导致 5 张皇家同花顺
// 被误判成普通顺子，或被 findHand 截断成只消 4 张。
const STRAIGHT_FLUSH_VALUE = [0, 0, 0, 2000, 3200, 5000];

/**
 * 一个连续窗口（3..5 张）是不是牌型。
 *
 * 小丑牌（10）不进入 ranks / suits：它既可以是任意点数，也可以是任意花色。
 * 爆破王牌（11）进入 ranks 时按 A 计，但不进 suits——它的花色是"任意"，
 * 所以它既能补三条，也能补同花，正好对应设计稿里"会炸的 A"。
 */
export function handOfWindow(cards) {
  const len = cards.length;
  if (len < 3 || len > 5) return null;

  const ranks = [];
  const suits = [];
  const seq = [];          // 保留**链上顺序**；小丑记 -1
  let wilds = 0;
  for (const ci of cards) {
    if (ci === JOKER) { wilds++; seq.push(-1); continue; }
    const r = rankOf(ci);
    if (r < 0) return null;             // 暗牌：整段不成立
    ranks.push(r);
    seq.push(r);
    const s = suitOf(ci);
    if (s >= 0) suits.push(s);
  }

  const flushOk = suits.every((s) => s === suits[0]);
  const threeOk = ranks.every((r) => r === ranks[0]);

  // 顺子必须**按链上的顺序**相邻，不是"只要点数集合连续"。
  // 这一点和骰子模式完全一致：1-2-3 和 3-2-1 都算，1-2-2-3 不算；
  // 扑克还多一个反例：10-A-K-Q-J 的点数集合是连续的，但链上顺序不是顺子，
  // 早期版本把它误判成 5 连顺——开局随机补牌会直接凑出牌型。
  // 小丑可以填任意空位，所以这里穷举两个方向，看非小丑位是否落在同一条等差线上。
  let straightOk = false;
  if (seq.every((r) => r < 0)) {
    straightOk = true;                  // 全是小丑：可以排成任意连续段
  } else {
    const fits = (dir) => {
      let start = null;
      for (let i = 0; i < len; i++) {
        if (seq[i] < 0) continue;
        if (start === null) start = dir > 0 ? seq[i] - i : seq[i] + i;
        if (seq[i] !== start + dir * i) return false;
      }
      if (start === null) return true;
      const first = dir > 0 ? start : start;
      const last = first + dir * (len - 1);
      return first >= 0 && first <= 4 && last >= 0 && last <= 4;
    };
    straightOk = fits(1) || fits(-1);
  }

  let best = null;
  const take = (kind, value) => {
    if (!value) return;
    if (!best || value > best.value || (value === best.value && len > best.len)) {
      best = { kind, len, value, wilds, ranks: ranks.slice(), suits: suits.slice() };
    }
  };

  if (flushOk && straightOk) take('straightflush', STRAIGHT_FLUSH_VALUE[len]);
  if (threeOk) take('three', THREE_VALUE[len]);
  if (straightOk) take('straight', STRAIGHT_VALUE[len]);
  if (flushOk) take('flush', FLUSH_VALUE[len]);
  return best;
}

/**
 * 在环上找**最值钱**的那一段牌型。
 *
 * 同花顺的排序值额外 +1500：它的 2000 分只是基础分，真正的价值是
 * 7 秒狂热（后续消除 ×2）和 5 秒续时。如果不把这部分算进"谁更值钱"，
 * 一段 5 连顺（2500）会压过同花顺，玩家就永远看不到那个最该看到的演出。
 * 计分用的 value 仍然是设计稿的 2000，1500 只参与挑选。
 */
export function findHand(slots, N) {
  let best = null;
  let bestRank = -1;

  for (let i = 0; i < N; i++) {
    for (let len = 3; len <= 5; len++) {
      const cards = [];
      for (let k = 0; k < len; k++) {
        const b = slots[mod(i + k, N)];
        if (!b) break;
        cards.push(b.ci);
      }
      if (cards.length < len) continue;
      const h = handOfWindow(cards);
      if (!h) continue;
      const rankValue = h.value + (h.kind === 'straightflush' ? 1500 : 0);
      if (rankValue > bestRank || (rankValue === bestRank && best && len > best.len)) {
        bestRank = rankValue;
        best = { start: i, ...h };
      }
    }
  }
  return best;
}

export function patternValue(p) {
  return p ? p.value : 0;
}

/** 牌型的中文名与展示色。渲染层与浮字共用。 */
export function patternLabel(p) {
  if (!p) return { name: '', color: '#E8F0FA' };
  if (p.kind === 'straightflush') {
    if (p.len >= 5) return { name: '皇家同花顺', color: '#FFF6D0' };
    if (p.len === 4) return { name: '四连同花顺', color: '#FF5C8A' };
    return { name: '同花顺', color: '#FF5C8A' };
  }
  if (p.kind === 'three') {
    if (p.len >= 5) return { name: '五条', color: '#FFF6D0' };
    if (p.len === 4) return { name: '四条', color: '#FFD65A' };
    return { name: '三条', color: '#FFB44A' };
  }
  if (p.kind === 'straight') {
    if (p.len >= 5) return { name: '大顺 · 五连', color: '#9BE9FF' };
    if (p.len === 4) return { name: '四连顺', color: '#7FD8FF' };
    return { name: '顺子', color: '#7FD8FF' };
  }
  if (p.len >= 4) return { name: `同花 ×${p.len}`, color: '#7ED957' };
  return { name: '同花', color: '#7ED957' };
}

/**
 * 一颗待发牌落在 k 值多少。
 *
 * 和骰子的 evalPlacement 同一个用途：发牌权重和机器人排序共用。
 * 这里不复制整个盘面，只虚拟出 k 左右各 4 格的窗口——
 * 最长牌型是 5 张，9 格足够覆盖所有"包含 k"的连续窗口。
 */
export function evalPlacement(at, N, k, ci, occupied) {
  const cardAt = (j) => {
    if (j === k) return ci;
    const idx = occupied && j > k ? j - 1 : j;
    const b = at(idx);
    return b ? b.ci : null;
  };

  let best = 0;
  for (let start = -4; start <= 0; start++) {
    for (let len = 3; len <= 5; len++) {
      if (start + len <= 0) continue;   // 窗口必须包含 k
      const cards = [];
      let ok = true;
      for (let j = 0; j < len; j++) {
        const c = cardAt(k + start + j);
        if (c === null) { ok = false; break; }
        cards.push(c);
      }
      if (!ok) continue;
      const h = handOfWindow(cards);
      if (!h) continue;
      const v = h.value + (h.kind === 'straightflush' ? 1500 : 0);
      if (v > best) best = v;
    }
  }
  if (best > 0) return best;

  // 没有现成牌型时，给"潜力"一点分：同点 / 同花 / 相邻点数。
  // 这不是平衡数值，只是让发牌机和机器人在无解时不至于完全随机。
  let pot = 6;
  for (let d = -2; d <= 2; d++) {
    if (d === 0) continue;
    const c = cardAt(k + d);
    if (c === null) continue;
    const dr = Math.abs(rankOf(c) - rankOf(ci));
    if (rankOf(c) >= 0 && rankOf(ci) >= 0) {
      if (dr === 0) pot += 18;
      else if (dr === 1) pot += 9;
    }
    if (suitOf(c) >= 0 && suitOf(ci) >= 0 && suitOf(c) === suitOf(ci)) pot += 10;
    if (c === JOKER || ci === JOKER) pot += 7;
  }
  return pot;
}

/** 某个落点、哪张牌最值钱（染花牌生成用）。 */
export function bestCardAt(at, N, k, occupied) {
  let best = cardCi(0, 0);
  let bestSc = -1;
  for (let rank = 0; rank < 5; rank++) {
    for (let suit = 0; suit < 4; suit++) {
      const ci = cardCi(rank, suit);
      const sc = evalPlacement(at, N, k, ci, occupied);
      if (sc > bestSc) { bestSc = sc; best = ci; }
    }
  }
  return best;
}
