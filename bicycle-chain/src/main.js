import { Game, CFG, BASE_CFG, WILD, BOMB, RUST, ballSkin, rulesOf, COMBO_TIERS, TEMPO_MARKS, comboTierIndex } from './sim.js';
import { PIPS, isPip, pipIndex, isFlipDie } from './dice.js';
import { Renderer, arcToScreen } from './render.js';
import { ArcadeInterface } from './interface.js';
import { Sfx, BGM_TRACK } from './audio.js';
import { MODES, modeIndex, TIERS, scoreBand } from './modes.js';
import { botInput } from './bot.js';
import { D, N, mod } from './geom.js';

const DT = 1 / 120;

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const sfx = new Sfx();

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const ffParam = Number(params.get('ff') || 0);
// ?bot=1 交给机器人操作。它不只是调试开关：无头截图要靠它才截得到真实中高分段，
// 否则空转快进会在十几秒内塞满跑道，永远只截到 C 段。
const botOn = params.get('bot') === '1';
// ?fs=速度 覆盖飞行速度（世界单位/秒，3~14）。速度越大球越快落地。
// 这个参数存在的理由：4.6 是推算出来的，不是测出来的——"这个速度看起来像不像
// 飞过去"只有上手才知道。改 BASE_CFG 而不是 CFG，是因为每次 new Game 都会用
// Object.assign(CFG, BASE_CFG, mode.cfg) 重置。
const fsParam = Number(params.get('fs') || 0);
if (fsParam > 0) BASE_CFG.flightSpeed = Math.max(2, Math.min(20, fsParam));

// ---------- 本地记录 ----------
const BEST_KEY = 'bcj.distance-best.v1';
function loadBests() {
  try {
    const saved = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    return Object.fromEntries(MODES.map(({ id }) => [id, saved?.[id]])
      .filter(([, score]) => Number.isFinite(score) && score >= 0));
  } catch { return {}; }
}
function saveBest(id, score) {
  try {
    const b = loadBests();
    if (!b[id] || score > b[id]) { b[id] = score; localStorage.setItem(BEST_KEY, JSON.stringify(b)); }
    return b;
  } catch { return loadBests(); }
}

// BGM 默认使用程序化小星星（proc），也可切换到固定 BPM 的 CC0 轻音乐（file）。
const BGM_KEY = 'bcj.bgm.v2';
function loadBgmMode() {
  const q = params.get('bgm');
  if (q === 'music' || q === 'proc') return 'proc';
  if (q === 'file') return 'file';
  try { return localStorage.getItem(BGM_KEY) === 'file' ? 'file' : 'proc'; } catch { return 'proc'; }
}
function saveBgmMode(m) {
  try { localStorage.setItem(BGM_KEY, m); } catch { /* 隐私模式下忽略 */ }
}

const ui = {
  mode: 'title',
  t: 0,
  sel: modeIndex(params.get('mode') || 'standard'),
  bests: loadBests(),
  best: 0,
  newBest: false,
  cb: params.get('cb') === '1',
  muted: false,
  deadAt: 0,
  bgm: loadBgmMode(),
};

const fx = { parts: [], floats: [], shocks: [], beams: [], ghosts: [], flash: 0, shake: 0, glow: null };

let game = new Game(seedParam || ((Date.now() & 0xffff) + 1), MODES[ui.sel].id);

// ?combo=N 把连消直接顶到 N 并停住。这个开关只有一个用途：单独看某一档的
// 演出长什么样。连消是时效性的，靠实战截图撞某一档要碰运气，
// 而档位的颜色/尺寸/辉光必须五档逐个比对才能调。
const comboParam = Number(params.get('combo') || 0);
let paused = false;
let silent = false;
let chargeCue = false;   // 这一拍是否已经播过"充能近满"提示

// ---------- 特效 ----------
// 消除的粒子。速度与寿命是一起调的，不能只加寿命：
// 初速不变而寿命变长，碎片会飘出跑道、飞到 HUD 上，看着像漏液而不是爆炸。
// 所以"慢"的做法是「初速降下来 + 寿命拉长 + 阻尼减小」，让它慢慢铺开、慢慢落，
// 而不是原速飞更久。重力同步降低，否则滞空时间一长就变成往下掉。
const PART_RGB = {
  0: '168,85,247',   // 紫
  1: '255,194,58',   // 金
  2: '255,59,78',    // 红
  3: '25,211,240',   // 青
  10: '255,226,130', // 万能
  11: '255,150,50',  // 爆破
  12: '150,140,125', // 锈
};

/** 骰子模式：ci → 粒子颜色。翻面骰（20..25）按点数取色。 */
function partRgb(ci) {
  // 扑克的粒子跟着花色走：红心炸出红色、黑桃炸出青色——
  // 这样"我刚消的是哪一种牌"在碎片层也读得出来。
  if (isPip(ci)) {
    const hex = PIPS[pipIndex(ci)].base;
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  return PART_RGB[ci] || '255,255,255';
}

// 档位颜色是十六进制字符串，而粒子/冲击波要的是 "r,g,b" 片段。
// 这个转换看着琐碎，但它让"档位只定义一次颜色"成立——否则每加一档，
// 都要在浮字、冲击波、粒子三处各写一遍 rgb。
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function burst(x, y, ci, count = 9, power = 1, rgbOverride = null) {
  const rgb = rgbOverride || partRgb(ci);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    // 初速压低、寿命拉长，两条必须一起动：
    // 只拉寿命会让碎片原速飞出跑道，只压初速会让它们挤在原地。
    // 现在碎片是"慢慢铺开、慢慢落"，三消的余韵能留满一次消除的演出时长。
    const sp = (30 + Math.random() * 134) * power;
    const life = 0.72 + Math.random() * 0.70;
    fx.parts.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 32 * power,
      r: (1.8 + Math.random() * 4.4) * power,
      life,
      // max 取自己的寿命：现有渲染按 life/max 同时缩半径和淡出，
      // 用固定 max 会让短寿命的碎片一出生就只有一半大小、半透明，
      // 消除看起来"没力气"。从全尺寸、全不透明开始，才读得出是一次爆开。
      max: life,
      color: `rgba(${rgb},ALPHA)`,
    });
  }
}

// 消失珠子的残影：先胀一下再淡出。
// 之前珠子是从 slots 里直接删掉的，视觉上"大球瞬间碎成小点"，中间没有过渡——
// 粒子再漂亮也补不上这一下断裂。残影的作用是把"消失"变成"被吃掉"。
function ghost(x, y, ci, dur = 0.62) {
  fx.ghosts.push({ x, y, ci, life: dur, max: dur });
}

function float(key, x, y, size, color, values) {
  // 1.05 → 1.30：分数浮字是玩家确认"这一下值多少"的唯一凭据，
  // 三消演出变长后如果数字先消失，会变成"看到爆炸但不知道赚了多少"。
  // 1.30 → 1.52：消除演出又拉长了一截（光带 0.92s、残影 0.8s），
  // 数字必须活到整段读完，否则玩家还是只会看到"砰"。
  fx.floats.push({ key, values, x, y, size, color, life: 1.52, max: 1.52 });
}

function shock(x, y, r0, r1, dur, color, w = 3) {
  fx.shocks.push({ x, y, r0, r1, life: dur, max: dur, color, w });
}

function beam(s0, span, dur, color, w = 8) {
  fx.beams.push({ s0, span, life: dur, max: dur, color, w });
}

// ---------- 事件 ----------
function handleEvents() {
  for (const e of game.drainEvents()) {
    if (e.type === 'fire') {
      if (!silent) sfx.fire(e.idx || 0, e.colors && e.colors[0], e.root, e.pan);
      chargeCue = false;
    } else if (e.type === 'insert') {
      if (!silent) (e.snapped ? sfx.snap() : sfx.click());
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 4, e.snapped ? 34 : 22, 0.22, 'rgba(180,220,255,ALPHA)', 2);
    } else if (e.type === 'lone') {
      if (!silent) sfx.thud();
    } else if (e.type === 'clear') {
      const mid = arcToScreen(e.s0 + e.len * 0.5 * D);
      // 消除长度决定这一下的颜色：3 连冷白、4 连琥珀、5 连紫。
      // 这是"我这一下值钱"的第一个信号——它比浮字早到，而且贴着轨道，
      // 玩家盯着炮口时余光也能看见。
      const ml = e.matchLen ?? e.len;
      const rank = ml >= CFG.rewardWildAt ? 2 : ml >= CFG.rewardBombAt ? 1 : 0;
      const gold = e.chain >= 2 || e.combo >= 6;
      const tint =
        rank === 2 ? 'rgba(199,125,255,ALPHA)' :
        rank === 1 ? 'rgba(255,194,74,ALPHA)' :
        gold ? 'rgba(255,214,90,ALPHA)' : 'rgba(200,235,255,ALPHA)';
      // 三消演出总长从 ~0.4s 拉到 ~0.7s：光带、冲击波、残影、粒子四条线
      // 同时存在才读得出"消除"这件事，只有一条会变成一闪。
      // 再拉到 ~1.0s：0.7s 的四条线仍然挤在一口气里，看起来是"亮一下"；
      // 现在的节奏是「先亮光带 → 残影缩掉 → 链条慢慢合拢」三段，
      // 每一段都有独立可读的内容。
      beam(e.s0, e.len, 0.92 + rank * 0.08, tint, 7 + Math.min(6, e.chain * 2) + rank * 3);
      shock(
        mid.x, mid.y, 10, 60 + e.chain * 26 + rank * 22, 0.98 + rank * 0.08, tint, 3 + rank * 0.8
      );

      for (let i = 0; i < e.positions.length; i++) {
        const sp = arcToScreen(e.positions[i]);
        ghost(sp.x, sp.y, e.colors[i], 0.80 + e.chain * 0.06);
        burst(sp.x, sp.y, e.colors[i], (e.chain >= 2 ? 12 : 8) + rank * 4, (e.chain >= 2 ? 1.35 : 1) + rank * 0.15);
      }

      float('cleared', mid.x, mid.y - 30, e.chain >= 2 ? 31 : 24, e.chain >= 2 ? '#FFD65A' : '#E8F0FA', { count: e.len });
      // 骰子 / 扑克：这一下是"豹子 / 同花顺"还是"大顺子"，比分数更该被看见。
      // 因为它回答的是"我做了什么"，而不是"我赚了多少"——前者才能被学会。
      // 几种加成可能同时出现（牌型 + 筹码 + 狂热 + 连锁），所以纵向位置
      // 用一条游标往下排，而不是各自写死一个 y——写死会在满加成时叠成重影。
      let fy = mid.y - 60;
      if (e.kind) {
        float(e.label, mid.x, fy, e.jackpot ? 24 : 19, e.color || '#9BE9FF', { count: e.matchLen });
        fy -= 24;
      }
      if (e.dbl > 1) {
        float('gold', mid.x, fy, 17, '#FFD65A');
        fy -= 24;
      }
      if (e.chain >= 2) {
        float('chainEffect', mid.x, fy, 18, '#FFD65A', { value: e.chainMult.toFixed(1) });
        fy -= 24;
      }
      if (e.comboMult >= 1.9) {
        float('comboEffect', mid.x, fy, 17, '#9BE9FF', { value: e.comboMult.toFixed(2) });
      }
      if (e.jackpot) {
        // 六六六只可能发生一次，值得用整屏的动静。
        fx.flash = Math.min(0.5, fx.flash + 0.26);
        fx.shake = Math.min(34, fx.shake + 12);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          burst(mid.x + Math.cos(a) * 90, mid.y + Math.sin(a) * 60, -1, 3, 1.3, '255,214,90');
        }
      }

      fx.shake = Math.min(30, fx.shake + 2.2 + e.chain * 2.4 + Math.min(6, e.combo * 0.3) + rank * 3);
      fx.flash = Math.min(0.5, fx.flash + 0.03 + e.chain * 0.02 + rank * 0.05);
      if (!silent) sfx.clear(e.chain, e.combo, e.jackpot ? 3 : rank, e.kind, e.matchLen, e.root, e.pan);
    } else if (e.type === 'bomb') {
      // 爆破球：演出必须比三消更"钝"。三消是清脆的（光带 + 琶音），
      // 爆破是低频的（大冲击波 + 慢闪 + 闷响），两者靠质感区分而不是靠音量。
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 8, 150, 0.86, 'rgba(255,150,60,ALPHA)', 5);
      shock(p.x, p.y, 4, 74, 0.58, 'rgba(255,235,190,ALPHA)', 2.5);
      for (let i = 0; i < (e.hit || 0); i++) {
        if (!e.positions || e.positions[i] === undefined) continue;
        const q = arcToScreen(e.positions[i]);
        burst(q.x, q.y, e.col[i], 10, 1.4);
        ghost(q.x, q.y, e.col[i], 0.62);
      }
      fx.shake = Math.min(30, fx.shake + 12);
      fx.flash = Math.min(0.46, fx.flash + 0.12);
      if (e.hit > 0) float('blast', p.x, p.y - 34, 26, '#FFB44A', { count: e.hit });
      if (!silent) sfx.boom();
    } else if (e.type === 'padplus') {
      // 骰子被翻面槽 +1：这一下必须"看得见地改了数"，否则玩家只会觉得点数乱跳
      const p = arcToScreen(mod(e.slot + game.phase, N) * D);
      shock(p.x, p.y, 4, 30, 0.34, 'rgba(120,235,255,ALPHA)', 2.4);
      float('flip', p.x, p.y - 34, 17, '#78EBFF', { pip: e.pip });
      if (!silent) sfx.flipPad();
    } else if (e.type === 'padx2') {
      const p = arcToScreen(mod(e.slot + game.phase, N) * D);
      shock(p.x, p.y, 5, 34, 0.38, 'rgba(255,214,90,ALPHA)', 2.6);
      float('gold', p.x, p.y - 34, 16, '#FFD65A');
      if (!silent) sfx.reward(false);
      if (!silent) sfx.chip();
    } else if (e.type === 'flipdice') {
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 6, 60, 0.42, 'rgba(120,235,255,ALPHA)', 2.6);
      float('flipDieEffect', p.x, p.y - 30, 16, '#78EBFF', { pip: e.pip });
      if (!silent) sfx.flipPad();
    } else if (e.type === 'blank') {
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 3, 22, 0.3, 'rgba(150,140,125,ALPHA)', 2);
      float('blankDie', p.x, p.y - 26, 13, 'rgba(198,188,174,0.9)');
      if (!silent) sfx.clank();
    } else if (e.type === 'bonus') {
      // 续时：写在计时器右边，属于仪表盘读数，不抢画面中心
      float('bonus', 300, 236, 17, '#78EBFF', { value: e.add.toFixed(1) });
      if (!silent) sfx.tempoMark(1);
    } else if (e.type === 'rust') {
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 3, 26, 0.34, 'rgba(150,140,125,ALPHA)', 2);
      float('rust', p.x, p.y - 26, 13, 'rgba(198,188,174,0.9)');
      if (!silent) sfx.clank();
    } else if (e.type === 'combo') {
      // 五档各有自己的演出。上一版是"同一句话换个数字"，玩家读不出自己在爬坡。
      // 档位越高，落点越多、越亮、屏幕边缘越红——这是唯一能让"我快撑不住了
      // 但我不想断"这种情绪成立的信号。
      const t = COMBO_TIERS[(e.tier || 1) - 1];
      const rgb = hexRgb(t.color);
      // 不在这里放"凌厉 · 连消 6"这种浮字：底部控制台已经在显示同一句话，
      // 两处同时出现只会变成重影（实测低档位连跳时，三行字会在轨道上叠住）。
      // 档位的信息交给控制台（持续可见），档位的**冲击**交给冲击波和辉光。
      // 只有最高两档值得在画面中心喊一句——那是里程碑，不是常规读数。
      if (e.tier >= 4) {
        float('combo' + e.tier, 600, 330, t.size + 8, t.color);
      }

      if (e.tier >= 2) {
        shock(600, 440, 40, 210 + e.tier * 30, 0.85, `rgba(${rgb},ALPHA)`, 2 + e.tier * 0.5);
      }
      if (e.tier >= 3) {
        // 内圈白热：只有一到三圈，作用是给外圈一个"起点"，不然光环像飘着
        shock(600, 440, 12, 130 + e.tier * 26, 0.55, 'rgba(255,255,255,ALPHA)', 2.4);
        fx.flash = Math.min(0.5, fx.flash + 0.06 * (e.tier - 2));
      }
      if (e.tier >= 4) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + e.combo * 0.3;
          burst(600 + Math.cos(a) * 150, 440 + Math.sin(a) * 110, -1, 3, 1.2, rgb);
        }
      }
      if (e.tier >= 5) {
        fx.glow = { color: `rgba(${rgb},ALPHA)`, life: 1.4, max: 1.4, a: 0.55 };
      }
      fx.shake = Math.min(38, fx.shake + t.shake);
      if (!silent) sfx.comboTier(e.tier);
    } else if (e.type === 'reward') {
      // 奖励球：从"我消了 4 颗"到"我下一发有炸弹了"必须有一条可见的路径，
      // 否则玩家只会觉得炸弹是天上掉的。这里在炮口位置放双环 + 名字。
      const p = arcToScreen(e.s);
      const wild = e.ci === WILD;
      const c = ballSkin(e.ci);
      const rgb = wild ? '199,125,255' : '255,150,60';
      // p 是**轨道上**的落点，不是炮口。往上 37px 正好越过链条外沿
      // （链条半宽约 27px），又远没到炮口——炮口在 125px 外，那里是炮管，
      // 字压上去会读成"炮管上的标签"。所以浮字贴在环带外侧的空白处。
      const cx = p.x, cy = p.y - 37;
      shock(cx, cy, 8, wild ? 104 : 74, 0.62, `rgba(${rgb},ALPHA)`, 3.6);
      shock(cx, cy, 3, wild ? 48 : 36, 0.36, 'rgba(255,255,255,ALPHA)', 2.2);
      // 炮管是竖的，正上方 50px 就是挂板，垂直方向没有位置可放。
      // 所以文字往**画面中心**偏：左炮往右、右炮往左，落点都是两炮之间的空地。
      const dx = p.x < 600 ? 78 : -78;
      float(wild ? 'wild' : 'bomb', cx + dx, cy + 4, wild ? 23 : 20, wild ? '#C77DFF' : '#FF9A4A');
      if (!silent) sfx.reward(wild);
    } else if (e.type === 'tempo') {
      // 节奏里程碑。位置放在左侧读表盘下面，不放画面中心：
      // 它不是"这一下赚了多少"，而是"机器状态变了"，属于仪表盘的语义。
      // 中心横幅留给段位和最高两档连消——中间那块地方一旦被常规读数占用，
      // 真正的大事件就喊不响了。
      const m = TEMPO_MARKS[(e.mark || 1) - 1];
      // 写在 366 而不是 320：浮字在 1.3 秒的生命里会往上飘 46px，
      // 从 320 起步会在生命后段正好穿过 TEMPO 进度条（268~277）和倍率数字（258）。
      // 从 366 起步，全程停在进度条下方的空白里。
      float('tempo' + e.mark, 140, 366, 19, m.color);
      shock(140, 356, 4, 30 + e.mark * 10, 0.42, `rgba(${hexRgb(m.color)},ALPHA)`, 2);
      if (!silent) sfx.tempoMark(e.mark);
    } else if (e.type === 'combobreak') {
      if (!silent) sfx.rushBreak();
      float('comboEnded', 600, 612, 16, 'rgba(255,140,150,0.9)');
    } else if (e.type === 'sweep') {
      fx.flash = Math.min(0.55, fx.flash + 0.30);
      fx.shake = Math.min(34, fx.shake + 16);
      shock(600, 440, 30, 380, 0.7, 'rgba(255,214,90,ALPHA)', 6);
      float('trackCleared', 600, 360, 30, '#FFD65A');
      if (!silent) sfx.sweep();
    } else if (e.type === 'dead') {
      if (!silent) sfx.dead();
      ui.deadAt = ui.t + 0.9;
      fx.shake = 30;
      fx.flash = 0.4;
    }
  }
}

// ---------- 主循环 ----------

function stepOnce() {
  game.setInput(botOn ? botInput(game) : dir());
  game.step(DT);
  handleEvents();
  checkTier();

  // 充能近满：只播一次，出膛事件里复位。放在 stepOnce 里而不是渲染里，
  // 是为了让音频和固定步长同一个时钟——掉帧时不会连响。
  if (!game.dead) {
    // 充能近满：转动驱动之后，充能 = 距离下一发还差多少转距（不是时间）。
    const ch = game.spinLoad();
    if (ch >= 0.78 && !chargeCue) {
      chargeCue = true;
      if (!silent) sfx.chargeReady();
    }
  }

  if (Math.abs(game.v) > 1.5 && !silent) sfx.tick(Math.abs(game.v));
}

function dir() {
  const l = drivingKey('KeyA');
  const r = drivingKey('KeyD');
  return (r ? 1 : 0) - (l ? 1 : 0);
}

function updateFx(dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // 阻尼和重力一起降：寿命拉长之后还按原来的 320 下落，
    // 碎片会从"炸开"变成"往下掉"，滞空时间越长越像漏液。
    p.vx *= Math.exp(-1.6 * dt);
    p.vy = p.vy * Math.exp(-1.6 * dt) + 246 * dt;
    if (p.life <= 0) fx.parts.splice(i, 1);
  }
  for (let i = fx.ghosts.length - 1; i >= 0; i--) {
    fx.ghosts[i].life -= dt;
    if (fx.ghosts[i].life <= 0) fx.ghosts.splice(i, 1);
  }
  for (let i = fx.floats.length - 1; i >= 0; i--) {
    fx.floats[i].life -= dt;
    if (fx.floats[i].life <= 0) fx.floats.splice(i, 1);
  }
  for (let i = fx.shocks.length - 1; i >= 0; i--) {
    fx.shocks[i].life -= dt;
    if (fx.shocks[i].life <= 0) fx.shocks.splice(i, 1);
  }
  for (let i = fx.beams.length - 1; i >= 0; i--) {
    fx.beams[i].life -= dt;
    if (fx.beams[i].life <= 0) fx.beams.splice(i, 1);
  }
  fx.shake *= Math.exp(-dt * 6.5);
  if (fx.shake < 0.2) fx.shake = 0;
  fx.flash *= Math.exp(-dt * 7.5);
  if (fx.flash < 0.002) fx.flash = 0;
  // 屏幕边缘辉光是"场上有事在持续发生"，它必须衰减得比闪白慢：
  // 闪白是一下，辉光是余温。快衰减会变成又一次闪烁，跟 flash 重复。
  if (fx.glow) {
    fx.glow.life -= dt * 0.9;
    if (fx.glow.life <= 0) fx.glow = null;
  }
}

let acc = 0;
let last = performance.now();
let audioPaused = false;

function syncAudioPause() {
  const want = ui.mode === 'play' && paused;
  if (want === audioPaused) return;
  audioPaused = want;
  sfx.setPaused(want);
}

function frame(now) {
  // 一帧里任何未捕获异常都会让 rAF 链彻底断掉：画面永久停在最后一场，
  // 按键还能响应但游戏不再前进。这里兜住异常、丢弃半个累加器，继续排下一帧。
  // 只打印前 3 次，避免持续抛错时刷爆控制台。
  try {
    frameBody(now);
  } catch (err) {
    if (frameErrors++ < 3) console.error('[bicycle-chain] 帧异常，已跳过本帧：', err);
    acc = 0;
  }
  requestAnimationFrame(frame);
}

let frameErrors = 0;

function frameBody(now) {
  const raw = Math.min(0.08, (now - last) / 1000);
  last = now;
  ui.t += raw;
  syncAudioPause();

  if (ui.mode === 'play' && !paused) {
    acc += raw;
    let n = 0;
    while (acc >= DT && n < 10) {
      stepOnce();
      acc -= DT;
      n++;
    }
    if (n >= 10) acc = 0;

    if (game.dead && ui.t >= ui.deadAt) finishRun();
  } else {
    acc = 0;
  }

  updateFx(raw);

  // HUD 上显示当前 CC0 曲名。放在 frame 里同步，曲末自动接歌时标题会跟着换。
  ui.bgmTitle = ui.bgm === 'file' && sfx.bgmPlaying ? sfx.bgmTitle : '';

  const load = game ? game.occupied() / Math.max(1, N) : 0;
  sfx.setIntensity(load);
  // 配乐 BPM 随节奏倍率推进，独立于按转距触发的出球。
  if (game) sfx.setBpm(game.musicBpm || 96);
  sfx.update();

  arcade.update(game, ui, paused, paused && !debugFreeze, renderer);
  renderer.draw(game, ui, fx);
}

// ---------- 段位跨越 ----------
// 跨档是「事件」，不是「状态」：光把数字染色只改变持续显示，玩家不会记住。
// 真正记住的是跨过去那一瞬间的爆发 —— 所以这里给浮字 + 冲击波 + 闪光 + 上行音。
// 分数只增不减，比较可以只升不降；同帧跨两档时只补播最高那档，避免音效叠糊。
let lastTier = 0;

function tierUp(tier) {
  if (silent) return;   // ?ff= 快进 / 截图模式不演出
  const t = TIERS[tier];
  float('newRank', 265, 98, tier >= 3 ? 30 : 23, '#303ab0', { rank: t.name });
  shock(300, 74, 8, 120 + tier * 36, 0.5 + tier * 0.05, `rgba(${t.rgb},ALPHA)`, 2.5 + tier);
  fx.flash = Math.min(0.34, fx.flash + 0.07 + tier * 0.04);
  fx.shake = Math.min(18, fx.shake + 1.5 + tier * 1.5);
  sfx.tierUp(tier);
}

function checkTier() {
  const tier = scoreBand(game.score, game.mode);
  if (tier > lastTier) {
    lastTier = tier;
    tierUp(tier);
  }
}

function finishRun() {
  const mode = game.mode;
  const prev = ui.bests[mode.id] || 0;
  ui.bests = saveBest(mode.id, game.score);
  ui.best = Math.max(prev, game.score);
  ui.newBest = game.score > prev;
  ui.mode = 'result';
  sfx.stopMusic();
  sfx.stopBgm(0.35);
  if (!silent) sfx.jingle(ui.newBest);
}

// ---------- 输入 ----------
const keys = new Set();
const pointerKeys = new Map();
const controlArrows = { KeyA: 'ArrowLeft', KeyD: 'ArrowRight' };
let debugFreeze = false;

function held(code) {
  if (keys.has(code)) return true;
  for (const input of pointerKeys.values()) if (input === code) return true;
  return false;
}

function drivingKey(code) {
  return held(code) || held(controlArrows[code]);
}

function selectMode(index) {
  if (ui.mode !== 'title') return;
  ensureAssets();
  previewMode(index);
  sfx.select();
}

function togglePause() {
  if (ui.mode !== 'play') return;
  debugFreeze = false;
  paused = !paused;
  keys.clear();
  pointerKeys.clear();
  syncAudioPause();
}

function toggleMute() {
  ensureAssets();
  sfx.init();
  ui.muted = sfx.toggleMute();
  if (!ui.muted && ui.bgm === 'file' && (ui.mode === 'title' || ui.mode === 'play')) playBgmFile();
}

function toggleContrast() {
  ensureAssets();
  ui.cb = !ui.cb;
  sfx.select();
}

const arcade = new ArcadeInterface({
  select: selectMode, start: () => startRun(ui.sel), pause: togglePause,
  title: toTitle, music: toggleBgm, audio: toggleMute, contrast: toggleContrast, held: drivingKey,
  press(pointerId, code) {
    if (ui.mode !== 'play' || paused) return;
    ensureAssets();
    pointerKeys.set(pointerId, code);
  },
  release(pointerId) { pointerKeys.delete(pointerId); },
});

function resetFx() {
  fx.parts.length = 0;
  fx.floats.length = 0;
  fx.shocks.length = 0;
  fx.beams.length = 0;
  fx.ghosts.length = 0;
  fx.flash = 0;
  fx.shake = 0;
}

// ---------- 音频资源 / BGM 来源 ----------
let assetsReady = null;

function ensureAssets() {
  sfx.init();
  if (!assetsReady) assetsReady = sfx.loadAssets();
  return assetsReady;
}

/**
 * 轻音乐的 BPM 是固定的；选它的时候把节拍网格锁到 98.5，
 * 否则出球会贴着一条听不见的 96~142 网格，耳朵和手对不上。
 * 小星星是程序化的，BPM 由 sim 直接给，不需要锁。
 */
function applyBgmLock(g) {
  g.bgmLockBpm = ui.bgm === 'file' ? BGM_TRACK.bpm : 0;
}

function playBgmFile() {
  return ensureAssets().then(() => {
    if (ui.bgm !== 'file') return;
    if (ui.mode !== 'title' && ui.mode !== 'play') return;
    // 已经在播就不要打断（否则每次切模式/重开都跳过一首曲子）。
    if (sfx.bgmPlaying) return;
    sfx.playBgm(0.14);
  });
}

function startBgmLoop() {
  if (ui.bgm === 'file') {
    sfx.stopMusic();
    playBgmFile();
  } else {
    sfx.stopBgm();
    // 标题页也放小星星：它是这一版的听觉名片，玩家在选模式时就该听到拍点。
    if (ui.mode === 'play' || ui.mode === 'title') sfx.startMusic();
  }
}

function toggleBgm() {
  ensureAssets();
  ui.bgm = ui.bgm === 'file' ? 'proc' : 'file';
  saveBgmMode(ui.bgm);
  sfx.uiSwitch();
  if (ui.mode === 'play') {
    applyBgmLock(game);
    startBgmLoop();
  } else if (ui.mode === 'title') {
    if (ui.bgm === 'file') {
      sfx.stopMusic();
      playBgmFile();
    } else {
      sfx.stopBgm();
      sfx.startMusic();
    }
  }
}

function startRun(idx) {
  ui.sel = idx;
  const mode = MODES[idx];
  game = new Game(seedParam || ((Date.now() & 0xffff) + 1), mode.id);
  renderer.prepare(game);
  applyBgmLock(game);
  resetFx();
  acc = 0;
  paused = false;
  debugFreeze = false;
  pointerKeys.clear();
  ui.mode = 'play';
  ui.newBest = false;
  lastTier = 0;
  chargeCue = false;
  ui.best = ui.bests[mode.id] || 0;
  syncAudioPause();
  ensureAssets();
  if (ui.bgm === 'file') {
    sfx.stopMusic();
    playBgmFile();
  } else {
    sfx.stopBgm();
    sfx.setTempo(0);
    sfx.startMusic();
  }
  sfx.start();
}

/**
 * 标题页换模式时**重建盘面**。
 *
 * 一开始只是改 ui.sel，结果标题背景永远是上一个模式：选到骰子关，后面站的
 * 还是四色球。这不只是不好看——`ballSkin` 是按当前规则族解析的，
 * 盘面和图鉴会各自按不同的规则上色，玩家看到的是两个模式的混合体。
 * 重建的代价只有一次数组分配，换来的是"选什么就看到什么"。
 */
function rebuildPreview() {
  game = new Game(seedParam || ((Date.now() & 0xffff) + 1), MODES[ui.sel].id);
  renderer.prepare(game);
  applyBgmLock(game);
  resetFx();
}

function previewMode(idx) {
  if (idx === ui.sel && ui.mode === 'title') return;
  ui.sel = (idx + MODES.length) % MODES.length;
  if (ui.mode !== 'title') return;
  rebuildPreview();
}

function toTitle() {
  ui.mode = 'title';
  paused = false;
  pointerKeys.clear();
  rebuildPreview();
  syncAudioPause();
  sfx.stopMusic();
  if (ui.bgm === 'file') playBgmFile();
  else {
    sfx.stopBgm();
    sfx.startMusic();
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    return;
  }
  if (e.code === 'Enter' && e.target instanceof HTMLButtonElement) {
    const input = e.target.dataset.input;
    if (!input) return;
    e.preventDefault();
    if (ui.mode === 'play' && !paused && !e.repeat) {
      pointerKeys.set(e.code, input);
    }
    return;
  }
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
  ensureAssets();

  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);

  if (e.code === 'KeyM') {
    toggleMute();
    return;
  }
  if (e.code === 'KeyB') {
    toggleBgm();
    return;
  }
  if (e.code === 'KeyV') {
    toggleContrast();
    return;
  }
  if (ui.mode === 'title') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      selectMode(ui.sel - 1);
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      selectMode(ui.sel + 1);
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const i = Number(e.code.slice(5)) - 1;
      if (i < MODES.length) selectMode(i);
    } else if (e.code === 'Enter') {
      startRun(ui.sel);
    }
    return;
  }

  if (e.code === 'Escape') {
    if (ui.mode === 'play') togglePause();
    else if (ui.mode === 'result') toTitle();
    syncAudioPause();
    return;
  }

  if (e.code === 'Enter' && ui.mode === 'result') startRun(ui.sel);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  pointerKeys.delete(e.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  pointerKeys.clear();
  if (ui.mode === 'play') paused = true;
  syncAudioPause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // blur 不保证在切标签时触发（测试与部分浏览器只发 visibilitychange），
    // 不清 keys 就会出现"切回来一直在往左转"的卡键。
    keys.clear();
    pointerKeys.clear();
    if (ui.mode === 'play') paused = true;
  }
  syncAudioPause();
});

// 调试：?auto=1 直接开局，?ff=秒 快进，?mode=id 指定模式
if (params.get('auto') === '1') {
  game = new Game(seedParam || 7, MODES[ui.sel].id);
  ui.mode = 'play';
}
renderer.prepare(game);
if (ffParam > 0) {
  if (ui.mode !== 'play') {
    game = new Game(seedParam || 7, MODES[ui.sel].id);
    renderer.prepare(game);
    ui.mode = 'play';
  }
  silent = true;
  sfx.muted = true;
  const n = Math.min(Math.floor(ffParam / DT), 120 * 130);
  for (let i = 0; i < n; i++) {
    game.setInput(botOn ? botInput(game) : 0);
    game.step(DT);
    handleEvents();
    checkTier();
    updateFx(DT);   // 快进时一并推进特效寿命，截出来的就是"刚好消除后"的画面
  }
  // 必须放在快进**之后**：?auto=1 会重建 Game，写在前面会被覆盖掉。
  if (comboParam > 0) {
    game.combo = comboParam;
    game.comboT = game.time;
    game.comboTier = comboTierIndex(comboParam);
    game.maxCombo = comboParam;
    paused = true;
  }
  // ?pause=1 冻结在快进结束的那一帧。截图校验构图时用：飞行只有 1.3 秒，
  // 靠 virtual-time 撞帧撞不到，而"球到底从哪儿起飞、飞到哪"必须看静态帧才说得清。
  if (params.get('pause') === '1') paused = true;

  // ?pulse=0.45 把炮口闪光冻结在衰减中的某一帧。
  // 闪光只有 0.3 秒，靠快进撞帧撞不到；这个开关让"星芒/冲击环/烟"
  // 三层的构图可以被静态截图检查。
  const pulseParam = Number(params.get('pulse') ?? -1);
  if (pulseParam >= 0) {
    game.firePulse = Math.max(0, Math.min(1, pulseParam));
    paused = true;
  }

  // ?charge=0.95 把充能冻结在指定比例，截图检查虹膜/蓄力核心。
  const chargeParam = Number(params.get('charge') ?? -1);
  if (chargeParam >= 0) {
    // 充能现在是"转距进度"，冻结它就等于冻结 spinAccum。
    game.spinAccum = CFG.spinFireDist * Math.max(0, Math.min(1, chargeParam));
    paused = true;
  }

  // ?aim=24 把炮身冻结在指定瞄准角，截图检查左右倾斜与枪口位移。
  const aimParam = Number(params.get('aim') ?? 999);
  if (aimParam !== 999) {
    const a = Math.max(-24, Math.min(24, aimParam));
    game.aimAngle = a;
    game.aimStep = Math.max(0, Math.min(6, Math.round((a + 24) / 8)));
    paused = true;
  }

  // ?hold=0.5 强制出一颗球并把它钉在飞行进度的 50%。飞行只有 1.3 秒，
  // 靠快进秒数去撞"球在空中"这一帧，撞十次有七次落空；构图校验要的是确定帧。
  const holdParam = Number(params.get('hold') ?? -1);
  if (holdParam >= 0) {
    game.fire();
    const b = game.balls[0];
    if (b) b.t = b.dur * Math.max(0, Math.min(1, holdParam));
    paused = true;
  }
  // 走正常结算：否则快进到死不会写 best，调试截图和真实游玩的战绩会不一致
  if (game.dead) finishRun();
}
debugFreeze = paused;

requestAnimationFrame(frame);
