// 中英双语系统：默认英文（适配 OpenGameJam 国际评委），右上角一键切换中文 / EN。

const DICT = {
  pageTitle: ['超载快车 · OVERLOAD EXPRESS', 'OVERLOAD EXPRESS'],
  brandTitle: ['超载快车', 'OVERLOAD EXPRESS'],
  startBadge: ['早高峰物理叠罗汉', 'PHYSICS STACKING ARCADE'],
  startTitle: ['超载快车', 'OVERLOAD EXPRESS'],
  startSub: [
    '车厢里已经彻底爆满了！把 50–72 位胖瘦高矮各异的乘客叠在车顶、挂在门外，点「发车」扛住低矮涵洞与终点猛刹！',
    'The cabin is packed solid! Stack & hang 50–72 commuters of all shapes outside the train, hit DEPART, and survive tunnels & hard braking!',
  ],
  startTip1: [
    '点击或长按拖动连刷上人 · 右键切 ×1/×3/×5 齐扑 · Z 键撤回上一批',
    'Click or hold-drag to swarm · Right-click ×1/×3/×5 burst · Z to undo',
  ],
  startTip2: [
    '胖叔托肩稳底 · 竹竿跨堆拉索 · 大妈偏心配平 · 挂壁娃直挂车门外免疫涵洞',
    'Heavy anchors & boosts · Tall links stacks · Bulky counterweights · Climbers cling doors',
  ],
  startBtn: ['🚂 开始装车', '🚂 START LOADING'],
  soundOn: ['🔊 音效', '🔊 SFX'],
  soundOff: ['🔇 静音', '🔇 Muted'],
  undo: ['↶ 撤回', '↶ Undo'],
  reset: ['↻ 重开', '↻ Reset'],
  langBtn: ['EN', '中文'],
  burstLabel: ['齐扑', 'Burst'],
  burst1: ['×1', '×1'],
  burst3: ['×3', '×3'],
  burst5: ['×5', '×5'],
  rosterLabel: ['站台人池（点/长按画布拖动连刷）', 'Station Pool (Click or Hold-Drag to Load)'],
  actionsLabel: ['投放与撤回', 'Squad & Undo'],
  mixName: ['混编', 'Mix'],
  mixTag: ['随机人潮', 'Mixed'],
  departBtn: ['🚂 发车！', '🚂 DEPART!'],
  departSub: ['Enter 提前发车', 'Enter to launch'],
  crouchBtn: ['⬇ 按住全员缩头', '⬇ HOLD TO DUCK'],
  crouchSub: ['SPACE 缩头 · A/D 压重心', 'SPACE Duck · A/D Lean'],
  onBoardLabel: ['车上挂人', 'ON BOARD'],
  unitFallen: ['摔落 {n}', '{n} fallen'],
  goalLabel: ['本线目标段位', 'ROUTE GOALS'],
  loadingHud: ['装车中 · {s}s 后发车', 'LOADING · {s}s LEFT'],
  runningHud: ['行驶 {p}% · SPACE 缩头 · A/D 压重心', 'RIDING {p}% · SPACE Duck · A/D Lean'],
  arrivedHud: ['到站！安全运达 {n} 人 · {r} 级', 'ARRIVED! {n} Delivered · Rank {r}'],
  tailHeavy: ['车尾重', 'Tail'],
  noseHeavy: ['车头重', 'Nose'],
  tiltWarn: ['⚠ 重心偏斜！用大妈配平或按 A/D', '⚠ HEAVY TILT! Balance or press A/D'],
  staminaLabel: ['全员缩头体力 [SPACE]', 'DUCK STAMINA [SPACE]'],
  tunnelWarn: ['⚠ 低涵洞！按住 SPACE 缩头', '⚠ LOW TUNNEL! HOLD SPACE'],
  brakeWarn: ['⚠ 终点急刹！按住 SPACE 抓紧', '⚠ HARD BRAKE! HOLD SPACE'],
  tunnelGuide: ['⚠ 最矮涵洞限高（标⚠者需缩头）', '⚠ Lowest tunnel (⚠ must duck)'],
  crowdLabel: ['候车队头 · 剩 {n} 人', 'Next up · {n} left'],
  platformSign: ['站台 9¾ · {name}', 'Platform 9¾ · {name}'],
  finishSign: ['终点站', 'FINISH'],
  trainSlogan: ['车内已爆满 · 侧门黄杆可直挂挂壁娃', 'CABIN FULL · CLIMBERS CLING TO YELLOW DOOR BARS'],
  popDepart: ['呜——！{n} 人发车！', 'CHOO-CHOO! {n} ON BOARD!'],
  popEmpty: ['车上还没人，先点车顶或侧门挂人！', 'Load commuters onto the train first!'],
  popPoolDone: ['站台清光！点发车！', 'Platform cleared! Hit DEPART!'],
  popBurst: ['齐扑 ×{n}', 'Burst ×{n}'],
  popUndo: ['撤回 {n} 人', 'Undid {n}'],
  popBonk: ['哐！{name}撞洞!', 'BONK! {name}!'],
  resWin: ['抵达 {name} 终点站！', 'Arrived at {name}!'],
  resZero: ['全员途中甩飞，空车进站…', 'Everyone flew off! Empty train...'],
  resUnit: ['人安全挂车到站', 'commuters delivered'],
  resPeak: ['最高同框', 'Peak Load'],
  resFallen: ['途中甩飞', 'Fallen'],
  resBest: ['本线纪录', 'Best'],
  resRetry: ['再挤一趟 (R)', 'Play Again (R)'],
  resNext: ['下一条线路 →', 'Next Route →'],
  unitPerson: ['{n} 人', '{n}'],
  // 5 种体型
  fat_name: ['胖叔', 'Heavy'],
  fat_tag: ['防滑托肩', 'Anchor+'],
  thin_name: ['瘦猴', 'Slim'],
  thin_tag: ['轻矮填缝', 'Gap Fit'],
  tall_name: ['竹竿', 'Tall'],
  tall_tag: ['跨堆拉索', 'LongArm'],
  auntie_name: ['大妈', 'Bulky'],
  auntie_tag: ['偏心配平', 'Balance'],
  acrobat_name: ['挂壁娃', 'Climber'],
  acrobat_tag: ['直挂侧门', 'DoorCling'],
  // 3 条线路
  rush1_name: ['早高峰起步', 'Morning Rush'],
  tunnel2_name: ['低矮老涵洞', 'Low Tunnels'],
  chaos3_name: ['极限三连洞', 'Triple Tunnel'],
  // 涵洞标牌
  tun_high: ['高架桥 · 限高108', 'Bridge · 108'],
  tun_mid: ['低桥 · 限高84', 'Low Bridge · 84'],
  tun_low: ['超低洞 · 限高62', 'Low Tunnel · 62'],
  tun_t1: ['铁桥 · 限高80', 'Iron Bridge · 80'],
  tun_t2: ['低涵洞 · 限高64', 'Tunnel · 64'],
  tun_t3: ['极限洞 · 限高54', 'Extreme · 54'],
};

const LANG_KEY = 'overload-express.lang.v2';
let lang = 'en'; // 默认英文显示
try {
  const urlLang = new URLSearchParams(location.search).get('lang');
  if (urlLang === 'zh' || urlLang === 'en') {
    lang = urlLang;
  } else {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'zh' || saved === 'en') lang = saved;
  }
} catch { /* ignore */ }

export function getLang() { return lang; }

export function toggleLang() {
  lang = lang === 'en' ? 'zh' : 'en';
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  return lang;
}

export function t(key, vars = null) {
  const pair = DICT[key];
  const raw = pair ? pair[lang === 'zh' ? 0 : 1] : key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
