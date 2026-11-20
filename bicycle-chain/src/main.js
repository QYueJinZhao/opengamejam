import { Game, CFG, BASE_CFG, WILD, BOMB, RUST, ballSkin, rulesOf, COMBO_TIERS, TEMPO_MARKS, comboTierIndex } from './sim.js';
import { PIPS, isPip, pipIndex, isFlipDie } from './dice.js';
import { cardSkin } from './poker.js';
import { Renderer, arcToScreen } from './render.js';
import { Sfx } from './audio.js';
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
const BEST_KEY = 'bcj.best.v2';
function loadBests() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch { return {}; }
}
function saveBest(id, score) {
  try {
    const b = loadBests();
    if (!b[id] || score > b[id]) { b[id] = score; localStorage.setItem(BEST_KEY, JSON.stringify(b)); }
    return b;
  } catch { return loadBests(); }
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
};

const fx = { parts: [], floats: [], shocks: [], beams: [], ghosts: [], flash: 0, shake: 0, glow: null };

let game = new Game(seedParam || ((Date.now() & 0xffff) + 1), MODES[ui.sel].id);

// ?combo=N 把连消直接顶到 N 并停住。这个开关只有一个用途：单独看某一档的
// 演出长什么样。连消是时效性的，靠实战截图撞某一档要碰运气，
// 而档位的颜色/尺寸/辉光必须五档逐个比对才能调。
const comboParam = Number(params.get('combo') || 0);
let paused = false;
let silent = false;

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
  if (rulesOf() === 'poker') return hexRgb(cardSkin(ci).base);
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
    const sp = (44 + Math.random() * 196) * power;
    fx.parts.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 44 * power,
      r: (1.6 + Math.random() * 4.2) * power,
      life: 0.46 + Math.random() * 0.52,
      max: 0.98,
      color: `rgba(${rgb},ALPHA)`,
    });
  }
}

// 消失珠子的残影：先胀一下再淡出。
// 之前珠子是从 slots 里直接删掉的，视觉上"大球瞬间碎成小点"，中间没有过渡——
// 粒子再漂亮也补不上这一下断裂。残影的作用是把"消失"变成"被吃掉"。
function ghost(x, y, ci, dur = 0.44) {
  fx.ghosts.push({ x, y, ci, life: dur, max: dur });
}

function float(text, x, y, size, color) {
  // 1.05 → 1.30：分数浮字是玩家确认"这一下值多少"的唯一凭据，
  // 三消演出变长后如果数字先消失，会变成"看到爆炸但不知道赚了多少"。
  fx.floats.push({ text, x, y, size, color, life: 1.30, max: 1.30 });
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
      // 按口编号给音高：轮流发射时，两个口交替出球，音高跟着交替，
      // 玩家不看屏幕也能听出"这一发是左边那门还是右边那门"。
      if (!silent) sfx.fire(e.idx || 0);
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
      beam(e.s0, e.len, 0.62 + rank * 0.06, tint, 7 + Math.min(6, e.chain * 2) + rank * 3);
      shock(
        mid.x, mid.y, 10, 60 + e.chain * 26 + rank * 22, 0.68 + rank * 0.06, tint, 3 + rank * 0.8
      );

      for (let i = 0; i < e.positions.length; i++) {
        const sp = arcToScreen(e.positions[i]);
        ghost(sp.x, sp.y, e.colors[i], 0.52 + e.chain * 0.05);
        burst(sp.x, sp.y, e.colors[i], (e.chain >= 2 ? 12 : 8) + rank * 4, (e.chain >= 2 ? 1.35 : 1) + rank * 0.15);
      }

      float(`+${e.gain}`, mid.x, mid.y - 30, e.chain >= 2 ? 32 : 26, e.chain >= 2 ? '#FFD65A' : '#E8F0FA');
      // 骰子 / 扑克：这一下是"豹子 / 同花顺"还是"大顺子"，比分数更该被看见。
      // 因为它回答的是"我做了什么"，而不是"我赚了多少"——前者才能被学会。
      // 几种加成可能同时出现（牌型 + 筹码 + 狂热 + 连锁），所以纵向位置
      // 用一条游标往下排，而不是各自写死一个 y——写死会在满加成时叠成重影。
      let fy = mid.y - 60;
      if (e.kind) {
        float(e.label, mid.x, fy, e.jackpot ? 24 : 19, e.color || '#9BE9FF');
        fy -= 24;
      }
      if (e.dbl > 1) {
        float('×2 镀金', mid.x, fy, 17, '#FFD65A');
        fy -= 24;
      }
      if (e.chip > 1) {
        float('筹码 ×2', mid.x, fy, 17, '#FFD65A');
        fy -= 24;
      }
      if (e.frenzyMult > 1) {
        float('狂热 ×2', mid.x, fy, 17, '#FF9A5C');
        fy -= 24;
      }
      if (e.chain >= 2) {
        float(`连锁 ×${e.chainMult.toFixed(1)}`, mid.x, fy, 18, '#FFD65A');
        fy -= 24;
      }
      if (e.comboMult >= 1.9) {
        float(`连消 ×${e.comboMult.toFixed(2)}`, mid.x, fy, 17, '#9BE9FF');
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
      if (!silent) sfx.clear(e.chain, e.combo, e.jackpot ? 3 : rank, e.kind, e.matchLen);
    } else if (e.type === 'bomb') {
      // 爆破球：演出必须比三消更"钝"。三消是清脆的（光带 + 琶音），
      // 爆破是低频的（大冲击波 + 慢闪 + 闷响），两者靠质感区分而不是靠音量。
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 8, 150, 0.62, 'rgba(255,150,60,ALPHA)', 5);
      shock(p.x, p.y, 4, 74, 0.4, 'rgba(255,235,190,ALPHA)', 2.5);
      for (let i = 0; i < (e.hit || 0); i++) {
        if (!e.positions || e.positions[i] === undefined) continue;
        const q = arcToScreen(e.positions[i]);
        burst(q.x, q.y, e.col[i], 10, 1.4);
        ghost(q.x, q.y, e.col[i], 0.4);
      }
      fx.shake = Math.min(30, fx.shake + 12);
      fx.flash = Math.min(0.46, fx.flash + 0.12);
      if (e.hit > 0) float(`爆破 +${e.gain}`, p.x, p.y - 34, 26, '#FFB44A');
      if (!silent) sfx.boom();
    } else if (e.type === 'padplus') {
      // 骰子被翻面槽 +1：这一下必须"看得见地改了数"，否则玩家只会觉得点数乱跳
      const p = arcToScreen(mod(e.slot + game.phase, N) * D);
      shock(p.x, p.y, 4, 30, 0.34, 'rgba(120,235,255,ALPHA)', 2.4);
      float(`翻面 → ${e.pip}`, p.x, p.y - 34, 17, '#78EBFF');
      if (!silent) sfx.flipPad();
    } else if (e.type === 'padx2') {
      const p = arcToScreen(mod(e.slot + game.phase, N) * D);
      shock(p.x, p.y, 5, 34, 0.38, 'rgba(255,214,90,ALPHA)', 2.6);
      float('镀金 ×2', p.x, p.y - 34, 16, '#FFD65A');
      if (!silent) sfx.reward(false);
    } else if (e.type === 'flipdice') {
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 6, 60, 0.42, 'rgba(120,235,255,ALPHA)', 2.6);
      float(`翻面骰 → ${e.pip}`, p.x, p.y - 30, 16, '#78EBFF');
      if (!silent) sfx.flipPad();
    } else if (e.type === 'shiftsuit') {
      // 染花牌：左右邻真的变成了同一花色。浮字必须写出是哪个花色，
      // 否则玩家只看到两张牌闪了一下，不知道规则做了什么。
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 5, 52, 0.4, 'rgba(126,217,87,ALPHA)', 2.4);
      float(`染花 → ${e.sym}`, p.x, p.y - 30, 16, '#7ED957');
      if (!silent) sfx.flipPad();
    } else if (e.type === 'hold' || e.type === 'holdswap') {
      // 底牌槽的操作反馈贴在炮口外侧，因为那是玩家正在看的位置。
      const p = arcToScreen(mod(e.off + game.phase, N) * D);
      float(e.type === 'hold' ? '底牌暂存' : '底牌换出', p.x, p.y - 46, 16, '#FFD65A');
      shock(p.x, p.y, 4, 28, 0.28, 'rgba(255,214,90,ALPHA)', 2);
      if (!silent) sfx.select();
    } else if (e.type === 'frenzy') {
      // 同花顺点火：整屏只在这一刻亮一下，然后进入持续 7 秒的边缘呼吸光。
      fx.flash = Math.min(0.5, fx.flash + 0.16);
      fx.shake = Math.min(34, fx.shake + 10);
      float(`狂热 ×${(e.mult || 2).toFixed(1)}  ${e.add > 0 ? `+${e.add.toFixed(0)}s` : ''}`, 600, 340, 26, '#FFB45A');
      if (!silent) sfx.tierUp(3);
    } else if (e.type === 'blank') {
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 3, 22, 0.3, 'rgba(150,140,125,ALPHA)', 2);
      float(game.rules === 'poker' ? '暗牌' : '铅骰', p.x, p.y - 26, 13, 'rgba(198,188,174,0.9)');
      if (!silent) sfx.clank();
    } else if (e.type === 'sync') {
      // 双响同点：两台炮同时换上最该打的点数。位置贴在画面中心，
      // 因为这是"机器给的一次福利"，属于全局事件，不属于某一块盘面。
      float(`双响同点 · ${e.pip}`, 600, 620, 20, '#2FE6C8');
      for (const off of e.offs) {
        const p = arcToScreen(mod(off + game.phase, N) * D);
        shock(p.x, p.y, 4, 46, 0.45, 'rgba(47,230,200,ALPHA)', 2.4);
      }
      if (!silent) sfx.confirm();
    } else if (e.type === 'bonus') {
      // 续时：写在计时器右边，属于仪表盘读数，不抢画面中心
      float(`续时 +${e.add.toFixed(1)}s`, 300, 236, 17, '#78EBFF');
      if (!silent) sfx.tempoMark(1);
    } else if (e.type === 'rust') {
      const p = arcToScreen(e.s);
      shock(p.x, p.y, 3, 26, 0.34, 'rgba(150,140,125,ALPHA)', 2);
      float('锈球', p.x, p.y - 26, 13, 'rgba(198,188,174,0.9)');
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
        float(`　${t.name}！`, 600, 330, t.size + 8, t.color);
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
      const rewardName = game.rules === 'poker'
        ? (wild ? '小丑牌' : 'A 炸弹')
        : (wild ? '彩虹万能' : '爆破球');
      // p 是**轨道上**的落点，不是炮口。往上 37px 正好越过链条外沿
      // （链条半宽约 27px），又远没到炮口——炮口在 125px 外，那里是炮管，
      // 字压上去会读成"炮管上的标签"。所以浮字贴在环带外侧的空白处。
      const cx = p.x, cy = p.y - 37;
      shock(cx, cy, 8, wild ? 104 : 74, 0.62, `rgba(${rgb},ALPHA)`, 3.6);
      shock(cx, cy, 3, wild ? 48 : 36, 0.36, 'rgba(255,255,255,ALPHA)', 2.2);
      // 炮管是竖的，正上方 50px 就是挂板，垂直方向没有位置可放。
      // 所以文字往**画面中心**偏：左炮往右、右炮往左，落点都是两炮之间的空地。
      const dx = p.x < 600 ? 78 : -78;
      float(rewardName, cx + dx, cy + 4, wild ? 23 : 20, wild ? '#C77DFF' : '#FF9A4A');
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
      float(`${m.name}　×${e.mult.toFixed(2)}`, 140, 366, 19, m.color);
      shock(140, 356, 4, 30 + e.mark * 10, 0.42, `rgba(${hexRgb(m.color)},ALPHA)`, 2);
      if (!silent) sfx.tempoMark(e.mark);
    } else if (e.type === 'combobreak') {
      if (!silent) sfx.rushBreak();
      float('连消中断', 600, 612, 16, 'rgba(255,140,150,0.9)');
    } else if (e.type === 'sweep') {
      fx.flash = Math.min(0.55, fx.flash + 0.30);
      fx.shake = Math.min(34, fx.shake + 16);
      shock(600, 440, 30, 380, 0.7, 'rgba(255,214,90,ALPHA)', 6);
      float(`清空跑道 +${e.gain}`, 600, 360, 30, '#FFD65A');
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
let lastNozzles = 1;

function stepOnce() {
  game.setInput(paused ? 0 : (botOn ? botInput(game) : dir()));
  game.step(DT);
  handleEvents();
  checkTier();

  const n = game.nozzleCount();
  if (n !== lastNozzles) {
    lastNozzles = n;
    float(`${n} 号射口上线`, 600, 656, 22, '#2FE6C8');
    if (!silent) sfx.clear(3, 1);
  }

  if (Math.abs(game.v) > 1.5 && !silent) sfx.tick(Math.abs(game.v));
}

function dir() {
  const l = keys.has('ArrowLeft') || keys.has('KeyA');
  const r = keys.has('ArrowRight') || keys.has('KeyD');
  return (r ? 1 : 0) - (l ? 1 : 0);
}

function updateFx(dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-2.0 * dt);
    p.vy = p.vy * Math.exp(-2.0 * dt) + 320 * dt;
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

function frame(now) {
  const raw = Math.min(0.08, (now - last) / 1000);
  last = now;
  ui.t += raw;

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

  const load = game ? game.occupied() / Math.max(1, N) : 0;
  sfx.setIntensity(load);
  // 音乐跟着机器一起加速。没有这一下，HUD 上写着 ×1.45、耳朵听到的还是同一首歌，
  // "机器变快了"就只是仪表盘上的一个数字——而节奏感首先是**听**出来的。
  sfx.setTempo(game ? game.tempo : 0);
  sfx.update();

  renderer.draw(game, ui, fx);
  requestAnimationFrame(frame);
}

// ---------- 段位跨越 ----------
// 跨档是「事件」，不是「状态」：光把数字染色只改变持续显示，玩家不会记住。
// 真正记住的是跨过去那一瞬间的爆发 —— 所以这里给浮字 + 冲击波 + 闪光 + 上行音。
// 分数只增不减，比较可以只升不降；同帧跨两档时只补播最高那档，避免音效叠糊。
let lastTier = 0;

function tierUp(tier) {
  if (silent) return;   // ?ff= 快进 / 截图模式不演出
  const t = TIERS[tier];
  float(`RANK  ${t.name}`, 300, 68, tier >= 3 ? 30 : 23, t.color);
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
}

// ---------- 输入 ----------
const keys = new Set();

function resetFx() {
  fx.parts.length = 0;
  fx.floats.length = 0;
  fx.shocks.length = 0;
  fx.beams.length = 0;
  fx.ghosts.length = 0;
  fx.flash = 0;
  fx.shake = 0;
}

function startRun(idx) {
  ui.sel = idx;
  const mode = MODES[idx];
  game = new Game(seedParam || ((Date.now() & 0xffff) + 1), mode.id);
  resetFx();
  acc = 0;
  paused = false;
  lastNozzles = 1;
  ui.mode = 'play';
  ui.newBest = false;
  lastTier = 0;
  ui.best = ui.bests[mode.id] || 0;
  sfx.init();
  sfx.setTempo(0);
  sfx.start();
  sfx.startMusic();
}

/**
 * 标题页换模式时**重建盘面**。
 *
 * 一开始只是改 ui.sel，结果标题背景永远是上一个模式：选到骰子关，后面站的
 * 还是四色球。这不只是不好看——`ballSkin` 是按当前规则族解析的，
 * 盘面和图鉴会各自按不同的规则上色，玩家看到的是两个模式的混合体。
 * 重建的代价只有一次数组分配，换来的是"选什么就看到什么"。
 */
function previewMode(idx) {
  if (idx === ui.sel && ui.mode === 'title') return;
  ui.sel = (idx + MODES.length) % MODES.length;
  if (ui.mode !== 'title') return;
  game = new Game(seedParam || ((Date.now() & 0xffff) + 1), MODES[ui.sel].id);
  resetFx();
  lastNozzles = game.nozzleCount();
}

function toTitle() {
  ui.mode = 'title';
  paused = false;
  sfx.stopMusic();
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  sfx.init();

  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);

  if (e.code === 'KeyM') {
    sfx.init();
    ui.muted = sfx.toggleMute();
    return;
  }
  if (e.code === 'KeyV') {
    ui.cb = !ui.cb;
    sfx.select();
    return;
  }
  if (e.code === 'KeyE') {
    // 底牌暂存槽只在扑克模式有。holdNext 自己会检查 CFG.holdEnabled，
    // 音效统一在 handleEvents() 中由 hold / holdswap 事件播放，避免双响。
    if (ui.mode === 'play' && !paused) game.holdNext();
    return;
  }

  if (ui.mode === 'title') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      previewMode(ui.sel - 1);
      sfx.select();
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      previewMode(ui.sel + 1);
      sfx.select();
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const i = Number(e.code.slice(5)) - 1;
      if (i < MODES.length) { previewMode(i); sfx.select(); }
    } else if (e.code === 'Space' || e.code === 'Enter') {
      startRun(ui.sel);
    }
    return;
  }

  if (e.code === 'Escape') {
    if (ui.mode === 'play') paused = !paused;
    else if (ui.mode === 'result') toTitle();
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter') {
    if (ui.mode === 'result') startRun(ui.sel);
    else if (ui.mode === 'play' && !paused) game.brake();
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('pointerdown', (e) => {
  sfx.init();
  // 右键 = 底牌暂存（和 E 同一个动作）。左键继续负责开始 / 重开。
  if (e.button === 2) {
    if (ui.mode === 'play' && !paused) game.holdNext();
    return;
  }
  if (ui.mode === 'title') startRun(ui.sel);
  else if (ui.mode === 'result') startRun(ui.sel);
});

// 右键要用来操作底牌槽，所以扑克模式下必须吃掉浏览器菜单。
window.addEventListener('contextmenu', (e) => {
  if (ui.mode === 'play' && game.rules === 'poker') e.preventDefault();
});

window.addEventListener('blur', () => {
  keys.clear();
  if (ui.mode === 'play') paused = true;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && ui.mode === 'play') paused = true;
});

// 调试：?auto=1 直接开局，?ff=秒 快进，?mode=id 指定模式
if (params.get('auto') === '1') {
  game = new Game(seedParam || 7, MODES[ui.sel].id);
  ui.mode = 'play';
}
if (ffParam > 0) {
  if (ui.mode !== 'play') {
    game = new Game(seedParam || 7, MODES[ui.sel].id);
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
  lastNozzles = game.nozzleCount();
  // ?pause=1 冻结在快进结束的那一帧。截图校验构图时用：飞行只有 1.3 秒，
  // 靠 virtual-time 撞帧撞不到，而"球到底从哪儿起飞、飞到哪"必须看静态帧才说得清。
  if (params.get('pause') === '1') paused = true;

  // ?held=1 扣一张底牌并冻结：截图校验 HOLD 面板的"有牌"状态。
  // 注意不能叫 ?hold=，那个参数已经被"把球钉在飞行进度"占用了。
  if (params.get('held') === '1') {
    game.holdNext();
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

requestAnimationFrame(frame);
