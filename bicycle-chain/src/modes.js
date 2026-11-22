// 模式定义：几何 + 发球口 + 节奏 + 计分线，全部集中在这里。
// sim.js 只负责执行，界面只负责展示，调平衡只改这个文件。

// 主动移动距离与消除积分各用一套段位门槛。
export const TIERS = [
  // C 段刻意偏亮：深色底上太暗的灰读不出来，段位信号就失效了。
  { name: 'C', color: '#AEBED2', rgb: '174,190,210' },
  { name: 'B', color: '#7ED957', rgb: '126,217,87' },
  { name: 'A', color: '#5AC8FA', rgb: '90,200,250' },
  { name: 'S', color: '#FFB03A', rgb: '255,176,58' },
  { name: 'SS', color: '#FFF6D0', rgb: '255,246,208' },
];

/** 返回指定成绩的段位（0=C … 4=SS）。 */
export function scoreBand(score, mode, metric = 'distance') {
  const t = metric === 'clear' ? mode.clearTiers : mode.tiers;
  for (let i = t.length - 1; i > 0; i--) if (score >= t[i]) return i;
  return 0;
}

/**
 * 档内进度 + 下一档信息。
 * lo/hi 是当前档的成绩区间；hi=null 表示已在最高档。
 */
export function tierProgress(score, mode, metric = 'distance') {
  const i = scoreBand(score, mode, metric);
  const t = metric === 'clear' ? mode.clearTiers : mode.tiers;
  const lo = t[i];
  const hi = i + 1 < t.length ? t[i + 1] : null;
  return {
    i,
    tier: TIERS[i],
    lo,
    hi,
    p: hi === null ? 1 : Math.max(0, Math.min(1, (score - lo) / (hi - lo))),
    gap: hi === null ? 0 : Math.max(0, hi - score),
    next: hi === null ? null : TIERS[i + 1],
  };
}

const standardMode = {
  id: 'standard',
  name: '标准轮',
  en: 'STANDARD',
  blurb: '单喷头 · 标准环道',
  geo: { r: 4, c: 6, n: 28 },
  layout: 1,
  tiers: [0, 200, 300, 425, 550],
  clearTiers: [0, 3500, 8500, 14000, 22000],
  cfg: {
    stages: [[0, 1]],
    fireInterval: 1.70,
    // 节奏曲线只影响倍率和配乐。
    beatStart: 2.20, beatEnd: 1.55, beatRush: 1.02, rampSec: 55, levelTime: 90,
    tempoRef: 11000,
    // 8→6：延迟三消后球滑行期间盘面暂时不消，链条更容易堆满。
    // 与 rustStart 24 合起来把普通玩家爆仓从 4/20 压到 1/20。
    startBeads: 6,
    // 三色起手，38 秒后上第四色。**注释和代码曾经对不上**：这里原文写
    // "前 38 秒三色"，而 colorSteps 是 [[0,4]]——四色从第一秒就开了。
    // 这一轮把它改成真的三色起手：开局盘面只有 3 色，玩家的第一课是
    // "转对位置"，而不是"在四个色相里找一对"。
    // 难度仍由节奏 + 锈球承担，不靠堆颜色（多一个色相在色弱眼里等于没变）。
    colorSteps: [[0, 3], [38, 4]],
    vMax: 13,
    specialStart: 15, wildRate: 0.030, bombRate: 0,
    // 延迟三消（球滑到链才判定）后重测：24s + 开局 6 颗时，
    // 20 局普通玩家爆仓 1/20；单独改任一项都还有 4/20。
    // 开局少两颗是为了给延迟结算留缓冲——球在滑行时盘面暂时不会消，
    // 链条更容易堆满。段位线未动。
    rustStart: 24, rustEvery: 8,
  },
};

export const MODES = [
  standardMode,
  {
    id: 'dice',
    name: '骰子轮盘',
    en: 'DICE',
    blurb: '点数即位置 · 豹子 / 顺子',
    // 32 格而不是 30：骰子模式最长的牌型是 6 连顺，它需要"连续六格"这个前提。
    // 30 格也能出，但一条 6 连顺占掉全环 20%，出现概率会低到玩家一辈子没见过；
    // 多给两格，是让设计稿里那个 +5000 的 JACKPOT 真的有可能发生。
    geo: { r: 4.6, c: 6.5, n: 32 },
    layout: 1,
    // 骰子规则族。
    rules: 'dice',
    tiers: [0, 250, 350, 500, 650],
    clearTiers: [0, 9000, 21000, 36000, 55000],
    cfg: {
      // 阶段推进 = 设计稿的"关卡"，压进一条 110 秒的曲线里：
      //   0s   单喷头 · 仅 1-4 点 · ×2 镀金槽      （热身：先学会把骰子送进槽）
      //   20s  开放 1-6 点 · 三种特殊骰 · 铅骰规则 · +1 翻面槽
      //   70s  第二个 ×2 槽    （过载：两条镀金路可选，但盘面也最脏）
      //
      // 为什么不真做成 5 关：这个项目的结构是"模式 + 时间阶段"，
      // 5 个独立关卡会让段位线、记录、标题卡全部乘 5 份，
      // 而玩家在一条曲线里同样能体验到"规则一层层加"。
      stages: [[0, 1]],
      fireInterval: 1.80,
      beatStart: 2.30, beatEnd: 1.60, beatRush: 1.06, rampSec: 58, levelTime: 110,
      // tempoRef 决定"机器什么时候满速"。实测 32000 在一局里根本到不了
      // （机器人 246 秒才摸到 1.0，局早就结束了），于是整局都跑在欠账的倍率上——
      // 这就是为什么修好计分之后平均分反而更低。26000 让满速落在 76 秒（69%），
      // 和其他模式"65~75% 进程满速"的约定对齐。
      tempoRef: 26000,
      startBeads: 12,
      // 前 20 秒只有 1-4 点：少两个点数，顺子反而更容易成型
      // （4 个点数时相邻点数的概率是 6 个点数时的 2.25 倍），
      // 所以这一段是"教学 + 爽"的段落，不是"简单版"。
      colorSteps: [[0, 4], [20, 6]],
      vMax: 13,
      // 三种特殊骰合计 15%：比基础模式高得多，但骰子模式的盘面也更容易被顺子清空，
      // 不给足货源，玩家的"牌型规划"会被随机点数拖死。
      specialStart: 20, wildRate: 0.06, bombRate: 0.05, flipRate: 0.04,
      // 骰子模式不用定时锈球，改由"连续漏接"喂铅骰。
      // 两者都是"往盘面塞死重"，但前者惩罚挂机、后者惩罚乱打——骰子模式要的是后者。
      // 延迟三消后重测：blankAt 3 时普通玩家爆仓 5/20，5 时 3/20（挂机比 0.29→0.49）。
      rustStart: 1e9, rustEvery: 0,
      blankAt: 5,
      // 设计稿的 ×2/×4/×8/×12（指数比基础模式陡），因为骰子的连锁更短更密。
      chainMult: [1, 2, 4, 8, 12, 12],
      // 连消续时：设计稿写的是"连消 ≥2 奖励 +2.5s~+8s"，按下标一一对上
      // （chain 2 → 2.5s，chain 5 → 8s）。上一版整张表比设计稿低了一档
      // （2.5s 挪到 chain 3），实测一局只续 3.0 秒——续时这条机制在骰子模式里
      // 本来就触发得少（平均最长连锁只有 2.0，牌型之间天然不相邻），
      // 再把单价压低一档，它等于不存在。
      //
      // 封顶 24s 不是为了平衡，是为了让"这局还剩多久"能算得出来——
      // 无限续时会让 HUD 上的倒计时变成一句谎话。
      chainTime: [0, 0, 2.5, 4, 6, 8],
      timeBonusCap: 24,
      // 主动槽：rel 是相对 0 号射口的槽位偏移，at 是开放时刻。
      // 位置刻意避开射口正下方（rel=0）——落在射口本来就该是为消除服务的，
      // 如果那儿正好是镀金槽，每颗球都会镀金，"选择"就消失了。
      pads: [
        { rel: 9, kind: 'x2', at: 0, name: '×2' },
        { rel: -8, kind: 'plus', at: 20, name: '+1' },
        { rel: 15, kind: 'x2', at: 70, name: '×2' },
      ],
    },
  },
  {
    ...standardMode,
    id: 'speed',
    name: '加速模式',
    en: 'SPEED RUN',
    blurb: '转盘与落球加速',
    tiers: [0, 240, 360, 500, 650],
    clearTiers: [0, 4000, 10000, 17000, 27000],
    cfg: { ...standardMode.cfg, vMax: 18, fireInterval: 1.45, flightSpeed: 5.8 },
  },
];

export const MODE_IDS = MODES.map((m) => m.id);

export function getMode(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

export function modeIndex(id) {
  const i = MODES.findIndex((m) => m.id === id);
  return i < 0 ? 0 : i;
}
