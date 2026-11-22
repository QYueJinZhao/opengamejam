const messages = {
  title: ['Bicycle Chain', '双轮彩球蛇'],
  settings: ['Game settings', '游戏设置'],
  language: ['中文', 'English'],
  languageTitle: ['Switch to Chinese', '切换到英文'],
  languageCode: ['zh-CN', 'en'],
  musicTitle: ['Switch music (B)', '切换配乐（B）'],
  music: ['Twinkle', '小星星'],
  ambient: ['Ambient', '轻音乐'],
  sound: ['Sound', '声音'],
  muted: ['Muted', '已静音'],
  soundTitle: ['Toggle sound (M)', '切换声音（M）'],
  contrast: ['Contrast', '高对比'],
  contrastTitle: ['Toggle high contrast (V)', '切换高对比（V）'],
  board: ['Marble machine. Turn the track to catch pieces from the launcher.', '弹珠机。转动轨道接住喷头发出的棋子。'],
  paused: ['Paused', '已暂停'],
  resume: ['Resume', '继续游戏'],
  controls: ['Controls', '操作'],
  left: ['Left', '左转'],
  leftTitle: ['Hold A or ← to accelerate left', '按住 A 或 ← 向左加速'],
  right: ['Right', '右转'],
  rightTitle: ['Hold D or → to accelerate right', '按住 D 或 → 向右加速'],
  dashboard: ['Modes and game stats', '模式与对局信息'],
  selectMode: ['Select mode', '选择模式'],
  best: ['Best distance', '最远转距'],
  bestClear: ['Best clear score', '最高消除积分'],
  distanceRecord: ['New distance record', '最远转距新纪录'],
  clearRecord: ['New clear score record', '消除积分新纪录'],
  start: ['Start game', '开始游戏'],
  runPanel: ['Game stats', '对局仪表'],
  distance: ['Distance', '移动距离'],
  clearScore: ['Clear score', '消除积分'],
  slots: ['slots', '格'],
  time: ['Time left', '剩余时间'],
  seconds: ['{value} s', '{value} 秒'],
  stageTag: ['{slots} slots / {seconds} s', '{slots} 格 / {seconds} 秒'],
  rankProgress: ['Distance rank progress', '距离段位进度'],
  clearRankProgress: ['Clear rank progress', '消除段位进度'],
  upNext: ['Up next', '待发队列'],
  next: ['Next', '下一发'],
  second: ['Second', '再下一发'],
  third: ['Third', '第三发'],
  charge: ['Next launch', '下次出弹'],
  turnSpeed: ['Track speed', '轨道转速'],
  speedUnit: ['slots/s', '格/秒'],
  accelerating: ['Accelerating', '加速'],
  reversing: ['Changing direction', '换向'],
  cruising: ['Cruising', '巡航'],
  speed: ['Speed Run', '加速模式'],
  speedDetail: ['Higher top speed', '更高转速上限'],
  speedRule: ['Match three pieces on a faster track.', '在更快的轨道上接成三个同形弹珠。'],
  speedTip: ['Hold left or right to reach a higher top speed. Release to cruise.', '按住左或右可达到更高转速，松手恢复巡航。'],
  occupancy: ['Track load', '轨道占用'],
  warning: ['Track nearly full. Clear pieces to make room.', '轨道快满了，优先消除腾出空位。'],
  combo: ['Combo', '连消'],
  pause: ['Pause', '暂停'],
  result: ['Results', '本局结算'],
  retry: ['Play again', '再来一局'],
  changeMode: ['Change mode', '换个模式'],
  noscript: ['Enable JavaScript to play. / 请启用 JavaScript。', '请启用 JavaScript。'],
  standard: ['Standard', '标准轮'],
  standardDetail: ['Match shapes', '形状三消'],
  standardRule: ['Line up three matching pieces to clear them.', '接成三个相邻的同形弹珠，即可消除。'],
  standardTip: ['Hold ← / → or A / D to build speed. Release to cruise.', '按住 ← / → 或 A / D 持续加速，松手恢复巡航。'],
  dice: ['Dice Wheel', '骰子轮盘'],
  diceDetail: ['Sets and straights', '豹子与顺子'],
  diceRule: ['Line up three or more dice with matching or consecutive values.', '把至少三颗骰子接成相同或连续的点数。'],
  diceTip: ['The +1 tile increases a die’s value. The ×2 tile doubles its clear bonus.', '+1 槽可以改变骰子点数，镀金槽可以让消除收益加倍。'],
  howToScore: ['Launches every {interval}. Distance counts while you steer. Matches earn points.', '每 {interval} 自动出弹。主动转向累计距离，消除获得积分。'],
  rankNext: ['{gap} slots to rank {rank}', '再转 {gap} 格到 {rank} 段'],
  clearRankNext: ['{gap} pts to rank {rank}', '再得 {gap} 分到 {rank} 段'],
  rankMax: ['Top rank reached', '最高段位已达成'],
  stopped: ['Track stopped', '轨道已停止'],
  inFlight: ['{count} in flight', '飞行中 {count} 颗'],
  aim: ['Turn the track to line up your catch.', '转动轨道，把目标珠移到接球口。'],
  launch: ['Next piece launches automatically.', '下一颗将自动发射。'],
  overflow: ['Track full', '轨道已满'],
  timeUp: ['Time’s up', '时间到'],
  averageSpeed: ['Active distance / time', '主动转距 / 用时'],
  speedValue: ['{value} slots/s', '{value} 格/秒'],
  clears: ['Clears', '消除次数'],
  maxChain: ['Longest chain', '最长连锁'],
  maxCombo: ['Best combo', '最高连消'],
  longestRun: ['Longest straight', '最长顺子'],
  jackpots: ['Jackpots', '六六六'],
  timeBonus: ['Bonus time', '额外时间'],
  drops: ['Pieces dropped', '落球数'],
  sweeps: ['Tracks cleared', '清空轨道'],
  die: ['Die: {pip}', '骰子 {pip} 点'],
  flipDie: ['Flip die: {pip}', '翻面骰 {pip} 点'],
  wildDie: ['Wild die', '金骰'],
  bombDie: ['Bomb die', '红骰'],
  blankDie: ['Blank die', '铅骰'],
  oct: ['Purple diamond', '紫色菱形'],
  cube: ['Yellow square', '金色方块'],
  star: ['Orange star', '橙色星形'],
  pyr: ['Cyan triangle', '青色三角'],
  wild: ['Wild piece', '万能球'],
  bomb: ['Bomb piece', '爆破球'],
  rust: ['Rust piece', '锈球'],
  pointsValue: ['{value} pts', '{value} 分'],
  pointsGain: ['+{value}', '+{value}'],
  chainCount: ['{count}× chain', '{count} 连锁'],
  set: ['Set', '豹子'],
  longSet: ['Set ×{count}', '豹子 ×{count}'],
  jackpot: ['Jackpot', '六六六'],
  longJackpot: ['Jackpot ×{count}', '六点连消 ×{count}'],
  straight: ['Straight', '顺子'],
  longStraight: ['Straight ×{count}', '大顺子 ×{count}'],
  sixStraight: ['Six-die straight', '六连顺'],
  gold: ['Gold ×2', '镀金 ×2'],
  chainEffect: ['Chain ×{value}', '连锁 ×{value}'],
  comboEffect: ['Combo ×{value}', '连消 ×{value}'],
  blast: ['Blast {count}', '爆破 {count}'],
  flip: ['Flip → {pip}', '翻面 → {pip}'],
  flipDieEffect: ['Flip die → {pip}', '翻面骰 → {pip}'],
  bonus: ['+{value} s', '续时 +{value} 秒'],
  combo1: ['Warm-up', '起势'],
  combo2: ['Sharp', '凌厉'],
  combo3: ['Burst', '爆发'],
  combo4: ['Limit', '极限'],
  combo5: ['Rush', '狂飙'],
  tempo1: ['Speed up', '提速'],
  tempo2: ['Overload', '过载'],
  tempo3: ['Redline', '红线'],
  comboEnded: ['Combo ended', '连消中断'],
  trackCleared: ['Track cleared', '清空跑道'],
  newRank: ['Rank {rank}', '达到 {rank} 段'],
};

const languageKey = 'bcj.language';
let language = 'en';
try {
  if (localStorage.getItem(languageKey) === 'zh-CN') language = 'zh-CN';
} catch { /* Use the default when storage is unavailable. */ }

let formatter = distanceFormatter();

function distanceFormatter() {
  return new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function getLanguage() {
  return language;
}

export function toggleLanguage() {
  language = language === 'en' ? 'zh-CN' : 'en';
  formatter = distanceFormatter();
  try { localStorage.setItem(languageKey, language); } catch { /* The current page still switches. */ }
}

export function t(key, values) {
  const message = messages[key][language === 'en' ? 0 : 1];
  if (!values) return message;
  return message.replace(/\{(\w+)\}/g, (_, name) => values[name]);
}

export function formatDistance(value) {
  return formatter.format(value);
}
