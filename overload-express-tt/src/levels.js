// 数据驱动配置中心（V5 机制精简强化版）：
// 1. 6 种乘客特征签（只说外貌/性格特征，绝不剧透能力）
// 2. 10 关逐类解锁主线（去倒计时焦虑、去混编、去压重心双键、精简 ×1/×3、新增「本关路况情报」指导布阵）
// 3. 每日极限专列（YYYYMMDD 确定性生成）
// 4. 无尽专列 8 个 100% 物理安全强化词条（站间三选一）
// 5. 5 套纯 Canvas 涂装 & 3 项车队升级 & 搞笑结算称号

export const PASSENGER_META = {
  thin: {
    id: 'thin',
    name: '瘦猴',
    feature: '轻飘飘',
    swatch: '#38BDF8',
    introWhisper: '',
    voiceLines: ['嗖！我最轻！', '借过借过快迟到啦！', '一吹就飘咯！', '豆浆可别挤洒了！'],
  },
  fat: {
    id: 'fat',
    name: '胖叔',
    feature: '吨位惊人',
    swatch: '#EF4444',
    introWhisper: '新乘客【胖叔】：“嘿嘿，俺上车啦，大伙儿别急！”',
    voiceLines: ['嘿嘿，叔皮实着呢！', '大家伙儿别急啊！', '二百斤可不是白长的！', '站稳咯各位！'],
  },
  acrobat: {
    id: 'acrobat',
    name: '挂壁娃',
    feature: '爱扒车门',
    swatch: '#22C55E',
    introWhisper: '新乘客【挂壁娃】：“上面这么挤，我找个凉快地儿！”',
    voiceLines: ['嘿呀！身手痒痒了！', '挤一块儿多闷得慌！', '早高峰就是练功房！', '看我利索劲儿！'],
  },
  tall: {
    id: 'tall',
    name: '竹竿',
    feature: '胳膊巨长',
    swatch: '#A855F7',
    introWhisper: '新乘客【竹竿】：“让让让让，我这胳膊腿有点施展不开！”',
    voiceLines: ['高处风景还挺好！', '哎，个子高也有烦恼。', '今天风挺凉快啊！', '眼镜可得戴稳了！'],
  },
  auntie: {
    id: 'auntie',
    name: '大妈',
    feature: '拎俩大菜篮',
    swatch: '#F59E0B',
    introWhisper: '新乘客【大妈】：“刚逛完早市，小伙子别碰着我俩菜篮！”',
    voiceLines: ['哎哟！菜篮别压扁！', '刚抢的新鲜大葱！', '小伙子慢点儿挤！', '回家还得炖排骨呢！'],
  },
  vip: {
    id: 'vip',
    name: 'VIP老板',
    feature: '一身金贵',
    swatch: '#FACC15',
    introWhisper: '【VIP 老板】驾到：“师傅开稳点，赶着签大单呢！”',
    voiceLines: ['时间就是金钱！', '西装可别给我弄皱了！', '师傅开快点，加钱！', '大单子等我签字呢！'],
  },
};

export const LEVEL1_DIALOG = {
  speaker: '站长喇叭',
  line1: '“里面真塞不下啦！各位乘客请自觉上房揭瓦！”',
  line2: '“点车顶叠人再点【发车】；敢踩油门还能多赚冲刺车票！”',
  btn: '开干！',
};

/** 角色技能/特征翻车时的搞笑吐槽台词（按触发原因精准匹配，第一人称口吻不剧透） */
export const SKILL_FAIL_LINES = {
  thin_wind: [
    '瘦猴：风太大，我先飘走一步！',
    '瘦猴：哎呀太轻了，被吹跑啦！',
    '瘦猴：风吹得我都快飞起来啦！',
  ],
  thin_fall: [
    '瘦猴：脚底一滑，没站稳呀！',
    '瘦猴：先走一步，帮我打个卡！',
  ],
  fat_fall: [
    '胖叔：哎哟喂，俺这身板没刹住脚！',
    '胖叔：大伙儿抓紧，别学叔滑下去咯！',
    '胖叔：嘿嘿，铁皮太滑，叔下趟再走！',
  ],
  acrobat_door: [
    '挂壁娃：哎呀手滑！这扶手擦得也太亮了！',
    '挂壁娃：糟了，指尖没扣牢！',
    '挂壁娃：失手了失手了！',
  ],
  acrobat_bonk: [
    '挂壁娃：哎哟！上面风大还磕脑门！',
    '挂壁娃：这桥也太矮了，差点削我头发！',
  ],
  tall_bonk: [
    '竹竿：哎哟！个子高真吃亏啊！',
    '竹竿：我的眼镜差点磕桥上了！',
    '竹竿：这桥也太不照顾高个子了！',
  ],
  tall_snap: [
    '竹竿：哎呀，手抻太长没拽住！',
    '竹竿：抓不住啦，手酸得慌！',
  ],
  auntie_full: [
    '大妈：哎哟篮子满啦，真挤不下咯！',
    '大妈：大葱都要压扁啦，别往里钻啦！',
  ],
  auntie_fall: [
    '大妈：哎哟喂！我的两篮大葱！',
    '大妈：慢点开呀，阿姨菜都撒啦！',
  ],
  vip_fail: [
    'VIP老板：哎！我这身定制西装！',
    'VIP老板：师傅怎么开的，扣奖金！',
    'VIP老板：我的大单子要黄啦！',
  ],
  stamina_empty: [
    '乘客：腰酸死了，实在蹲不住啦！',
    '乘客：腿都麻了，先直起腰喘口气！',
  ],
};

export const LEVELS = [
  {
    id: 's1',
    index: 1,
    name: '早高峰首发',
    intel: ['一路畅通 · 无桥洞', '轻松缓刹'],
    distance: 3500,
    maxSpeed: 345,
    accel: 165,
    brakeDist: 560,
    bumpAmp: 20,
    pool: { thin: 25 },
    unlockedTypes: ['thin'],
    newType: null,
    showCrouch: false,
    showUndo: false,
    bursts: [1],
    showReinforce: false,
    tunnels: [],
    winds: [],
    midStops: [],
    targets: [8, 13, 18, 22],
  },
  {
    id: 's2',
    index: 2,
    name: '铁桥初体验',
    intel: ['1座高架低桥', '终点猛刹'],
    distance: 4300,
    maxSpeed: 390,
    accel: 195,
    brakeDist: 520,
    bumpAmp: 30,
    pool: { thin: 20, fat: 12 },
    unlockedTypes: ['thin', 'fat'],
    newType: 'fat',
    showCrouch: true,
    showUndo: true,
    bursts: [1],
    showReinforce: false,
    tunnels: [
      { x: 2200, len: 280, clearY: -248, label: '高架桥' },
    ],
    winds: [],
    midStops: [],
    targets: [12, 18, 24, 29],
  },
  {
    id: 's3',
    index: 3,
    name: '低矮老涵洞',
    intel: ['超低涵洞', '坡道加速台', '终点急刹'],
    distance: 4800,
    maxSpeed: 405,
    accel: 205,
    brakeDist: 540,
    bumpAmp: 34,
    pool: { thin: 18, fat: 10, acrobat: 12 },
    unlockedTypes: ['thin', 'fat', 'acrobat'],
    newType: 'acrobat',
    showCrouch: true,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: false,
    tunnels: [
      { x: 2450, len: 320, clearY: -220, label: '超低涵洞' },
    ],
    winds: [],
    midStops: [],
    slopes: [
      { x: 1150, len: 680, grade: -0.14, label: '下坡冲刺段' },
    ],
    ramps: [],
    targets: [16, 24, 31, 37],
  },
  {
    id: 's4',
    index: 4,
    name: '颠簸双桥线',
    intel: ['双连低桥', '铁轨飞坡跳台', '剧烈颠簸'],
    distance: 5600,
    maxSpeed: 420,
    accel: 215,
    brakeDist: 560,
    bumpAmp: 46,
    pool: { thin: 18, fat: 10, acrobat: 10, tall: 10 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall'],
    newType: 'tall',
    showCrouch: true,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: [
      { x: 2000, len: 290, clearY: -244, label: '石拱桥' },
      { x: 3900, len: 310, clearY: -224, label: '低涵洞' },
    ],
    winds: [],
    midStops: [],
    slopes: [],
    ramps: [
      { x: 3050, amp: 24, label: '飞坡跳台' },
    ],
    targets: [19, 28, 37, 44],
  },
  {
    id: 's5',
    index: 5,
    name: '大风早市线',
    intel: ['首次强阵风', '早市上坡道'],
    distance: 6200,
    maxSpeed: 430,
    accel: 225,
    brakeDist: 570,
    bumpAmp: 46,
    pool: { thin: 18, fat: 10, acrobat: 9, tall: 9, auntie: 9 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie'],
    newType: 'auntie',
    showCrouch: true,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: [
      { x: 2150, len: 300, clearY: -236, label: '菜市天桥' },
    ],
    winds: [
      { x: 3350, len: 1350, force: 195, label: '早市强阵风' },
    ],
    midStops: [],
    slopes: [
      { x: 1100, len: 760, grade: 0.16, label: '早市陡上坡' },
    ],
    ramps: [],
    targets: [22, 33, 43, 50],
  },
  {
    id: 's6',
    index: 6,
    name: '红灯商务线',
    intel: ['双低洞', '首次红灯急停', '飞坡跳台'],
    distance: 6800,
    maxSpeed: 438,
    accel: 230,
    brakeDist: 590,
    bumpAmp: 50,
    pool: { thin: 18, fat: 11, acrobat: 9, tall: 10, auntie: 10, vip: 4 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: 'vip',
    showCrouch: true,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: [
      { x: 2100, len: 300, clearY: -236, label: '商务高架' },
      { x: 5000, len: 320, clearY: -222, label: '地铁暗洞' },
    ],
    winds: [],
    midStops: [
      { x: 3550, len: 420, holdSec: 0.7, label: '临时红灯急刹' },
    ],
    slopes: [],
    ramps: [
      { x: 1320, amp: 24, label: '高架飞坡' },
    ],
    targets: [28, 42, 55, 65],
  },
  {
    id: 's7',
    index: 7,
    name: '横风跨海桥',
    intel: ['双低桥', '跨海强阵风', '海湾斜坡'],
    distance: 7200,
    maxSpeed: 445,
    accel: 235,
    brakeDist: 600,
    bumpAmp: 52,
    pool: { thin: 22, fat: 12, acrobat: 10, tall: 10, auntie: 10, vip: 4 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: null,
    showCrouch: true,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: [
      { x: 2250, len: 300, clearY: -234, label: '风口拱桥' },
      { x: 5250, len: 320, clearY: -220, label: '海堤低洞' },
    ],
    winds: [
      { x: 3150, len: 1400, force: 225, label: '跨海强阵风' },
    ],
    midStops: [],
    slopes: [
      { x: 1180, len: 820, grade: 0.17, label: '跨海引桥上坡' },
      { x: 4320, len: 760, grade: -0.16, label: '跨海俯冲下坡' },
    ],
    ramps: [],
    targets: [30, 44, 58, 68],
  },
  {
    id: 's8',
    index: 8,
    name: '狂风穿洞谷',
    intel: ['三连低洞', '峡谷狂风', '双飞坡跳台'],
    distance: 7700,
    maxSpeed: 455,
    accel: 242,
    brakeDist: 620,
    bumpAmp: 56,
    pool: { thin: 24, fat: 14, acrobat: 11, tall: 11, auntie: 10, vip: 4 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: null,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: [
      { x: 2050, len: 310, clearY: -232, label: '山谷桥' },
      { x: 4350, len: 320, clearY: -216, label: '极低隧道' },
      { x: 6150, len: 300, clearY: -226, label: '出谷涵洞' },
    ],
    winds: [
      { x: 2700, len: 1250, force: 235, label: '峡谷狂风' },
    ],
    midStops: [],
    slopes: [
      { x: 1100, len: 740, grade: -0.17, label: '入谷陡下坡' },
    ],
    ramps: [
      { x: 3820, amp: 26, label: '峡谷飞坡' },
      { x: 5420, amp: 25, label: '出谷跳台' },
    ],
    targets: [33, 48, 62, 74],
  },
  {
    id: 's9',
    index: 9,
    name: '极限三连洞',
    intel: ['三连剃头洞', '中途急停', '陡坡+跳台'],
    distance: 8300,
    maxSpeed: 465,
    accel: 250,
    brakeDist: 650,
    bumpAmp: 60,
    pool: { thin: 26, fat: 15, acrobat: 12, tall: 12, auntie: 11, vip: 4 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: null,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: [
      { x: 2000, len: 310, clearY: -230, label: '一号低洞' },
      { x: 4700, len: 330, clearY: -216, label: '二号极限洞' },
      { x: 6650, len: 340, clearY: -212, label: '三号剃头洞' },
    ],
    winds: [],
    midStops: [
      { x: 3350, len: 430, holdSec: 0.75, label: '信号灯急刹' },
    ],
    slopes: [
      { x: 1080, len: 760, grade: 0.18, label: '高架大陡坡' },
    ],
    ramps: [
      { x: 5820, amp: 27, label: '极速跳台' },
    ],
    targets: [36, 52, 68, 80],
  },
  {
    id: 's10',
    index: 10,
    name: '春运地狱特快',
    intel: ['三连极限洞', '特快逆风', '飞坡+急停'],
    distance: 9000,
    maxSpeed: 475,
    accel: 260,
    brakeDist: 680,
    bumpAmp: 64,
    pool: { thin: 30, fat: 16, acrobat: 13, tall: 13, auntie: 12, vip: 6 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: null,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: [
      { x: 2100, len: 310, clearY: -228, label: '春运立交' },
      { x: 5150, len: 330, clearY: -214, label: '压顶老洞' },
      { x: 7250, len: 350, clearY: -210, label: '终极剃头桥' },
    ],
    winds: [
      { x: 5750, len: 1150, force: 245, label: '特快逆风' },
    ],
    midStops: [
      { x: 3550, len: 440, holdSec: 0.75, label: '前方拥堵急刹' },
    ],
    slopes: [
      { x: 1150, len: 800, grade: 0.18, label: '春运高架陡坡' },
    ],
    ramps: [
      { x: 2850, amp: 27, label: '立交跳台' },
      { x: 6680, amp: 28, label: '终极飞坡' },
    ],
    targets: [42, 60, 78, 92],
  },
];

export const UPGRADES = [
  {
    id: 'gripPaint',
    name: '车顶防滑漆',
    desc: '提升车顶静态抓地力',
    maxLv: 5,
    costs: [40, 90, 160, 260, 400],
    perLvText: '+4% 防滑',
  },
  {
    id: 'springs',
    name: '减震弹簧',
    desc: '减轻铁轨剧烈颠簸',
    maxLv: 5,
    costs: [40, 90, 160, 260, 400],
    perLvText: '-5% 颠簸',
  },
  {
    id: 'staminaCup',
    name: '全员能量壶',
    desc: '延长缩头紧抓体力',
    maxLv: 5,
    costs: [40, 90, 160, 260, 400],
    perLvText: '+5% 体力',
  },
];

export const TRAIN_SKINS = [
  {
    id: 'classic',
    name: '经典红黄特快',
    unlockTotal: 0,
    bodyTop: '#DC2626', bodyBot: '#991B1B',
    stripe: '#FACC15', roof: '#475569',
    door: '#7F1D1D', nose: '#B91C1C', accent: '#FEF08A',
  },
  {
    id: 'green',
    name: '复古绿皮快车',
    unlockTotal: 60,
    ticketCost: 120,
    bodyTop: '#15803D', bodyBot: '#14532D',
    stripe: '#FDE047', roof: '#334155',
    door: '#166534', nose: '#166534', accent: '#FEF08A',
  },
  {
    id: 'panda',
    name: '熊猫竹影专列',
    unlockTotal: 180,
    ticketCost: 220,
    bodyTop: '#F8FAFC', bodyBot: '#CBD5E1',
    stripe: '#1E293B', roof: '#0F172A',
    door: '#16A34A', nose: '#0F172A', accent: '#4ADE80',
  },
  {
    id: 'gold',
    name: '黄金土豪特快',
    unlockTotal: 380,
    ticketCost: 360,
    bodyTop: '#F59E0B', bodyBot: '#B45309',
    stripe: '#FEF9C3', roof: '#78350F',
    door: '#92400E', nose: '#D97706', accent: '#FFFFFF',
  },
  {
    id: 'cyber',
    name: '赛博霓虹夜车',
    unlockTotal: 700,
    ticketCost: 500,
    bodyTop: '#312E81', bodyBot: '#1E1B4B',
    stripe: '#22D3EE', roof: '#0F172A',
    door: '#581C87', nose: '#4C1D95', accent: '#F472B6',
  },
  {
    id: 'grand_slam',
    name: '星耀大满贯特快',
    unlockTotal: 0,
    unlockByFullAlbum: true,
    isGrandSlam: true,
    bodyTop: '#7C3AED', bodyBot: '#312E81',
    stripe: '#FDE047', roof: '#1E1B4B',
    door: '#5B21B6', nose: '#F59E0B', accent: '#F472B6',
  },
];

export const ENDLESS_PERKS = [
  { id: 'glue502', name: '502 强力胶', desc: '全员抓力永久 +30%（可叠升星）', evolveTag: '全员金胶手掌', color: '#38BDF8', stackable: true },
  { id: 'megaBasket', name: '巨无霸菜篮', desc: '大妈菜篮范围 +40%（可叠升星）', evolveTag: '大妈金边巨篮', color: '#F59E0B', stackable: true },
  { id: 'ironFat', name: '铁鞋胖叔', desc: '胖叔磁力铁靴焊死车顶（可叠升星）', evolveTag: '胖叔磁力铁靴+金盔', color: '#EF4444', stackable: true },
  { id: 'energyDrink', name: '冰镇功能饮', desc: '下一站缩头无限体力 + 冰蓝护体', evolveTag: '全员冰蓝能量环', color: '#22C55E', stackable: false },
  { id: 'doorRush', name: '门外加塞', desc: '立即空降 5 名精英挂壁娃上车', evolveTag: '空降5名挂壁娃', color: '#4ADE80', stackable: false },
  { id: 'calmWind', name: '风平浪静', desc: '下一站车头展开防风护罩免风', evolveTag: '车头防风能量罩', color: '#60A5FA', stackable: false },
  { id: 'steelTall', name: '竹竿钢筋', desc: '竹竿进化液压钢筋臂·拉索翻倍', evolveTag: '竹竿机械钢筋臂', color: '#A855F7', stackable: true },
  { id: 'vipDrop', name: '豪车贵宾', desc: '立即空降 2 名 ×3 计分 VIP 老板', evolveTag: '空降2名VIP金主', color: '#FACC15', stackable: false },
];

/** 每日 3 项轻量小目标（第 1 天即可全部完成，强力拉动次日留存与玩法探索！） */
export const DAILY_MISSIONS = [
  { id: 'deliver_20', title: '今日累计安全运达 20 人', target: 20, reward: 25 },
  { id: 'boost_win', title: '手动加速冲刺并过关 1 次', target: 1, reward: 30 },
  { id: 'strict_play', title: '体验 1 局「左右分流专列」', target: 1, reward: 35 },
];

/** 6 大主题称号套装（每排 1 套 × 4 张卡，3 页共 6 套；集齐单套领车票大奖，全图鉴 24/24 解锁大满贯终极大礼！） */
export const ACHIEVEMENT_SETS = [
  { id: 'extreme_hang', name: '极限挂车组', desc: '哪里都能挂，就不坐车里', color: '#9333EA', reward: 100 },
  { id: 'all_stars', name: '早高峰全明星', desc: '四大狠人专属名场面', color: '#D97706', reward: 90 },
  { id: 'newton_lost', name: '牛顿失联组', desc: '物理引擎放飞奇观', color: '#DB2777', reward: 100 },
  { id: 'tunnel_wind', name: '桥洞风云组', desc: '过洞与强风生死一瞬', color: '#0284C7', reward: 90 },
  { id: 'pro_driver', name: '老司机车神组', desc: '硬核操控与早高峰体面', color: '#16A34A', reward: 90 },
  { id: 'drama_king', name: '戏剧之王组', desc: '大喜大悲终极名场面', color: '#DC2626', reward: 120 },
];

export const GRAND_SLAM_REWARD_TICKETS = 500;

/** 24 项中文热梗/金曲成就称号卡牌（按 6 大套装顺序排列，rarity: 3=SSR奇观 2=SR技巧 1=R常规） */
export const ACHIEVEMENTS = [
  // === 套装 1：极限挂车组 ===
  { id: 'fly_higher', setId: 'extreme_hang', rarity: 1, title: '飞得更高', clue: '把车顶叠得像座摩天大楼再出发', hint: '车顶人塔叠到 ≥4 层超高并成功发车', flavor: '叠到第四层，空气都开始稀薄了', reward: 25 },
  { id: 'under_car', setId: 'extreme_hang', rarity: 3, title: '我应该在车底', clue: '听说车身最底下，还藏着一片清净天地', hint: '有人扒在车底盘或车底附近跟着跑起来', flavor: '车底风有点大，但我买的是站票', reward: 30 },
  { id: 'titanic', setId: 'extreme_hang', rarity: 3, title: '泰坦尼克号', clue: '列车最前头迎风的位置，谁站在那儿？', hint: '有乘客扒在火车最前端车头兜风', flavor: '站车头张开双臂，迎面全是铁轨风', reward: 35 },
  { id: 'tail_hanger', setId: 'extreme_hang', rarity: 3, title: '车尾拖油瓶', clue: '最后面栏杆外头，风景好像也不错', hint: '有乘客挂在车尾栏杆外一路狂飙', flavor: '挂车尾虽然颠，但风景绝佳', reward: 35 },
  // === 套装 2：早高峰全明星 ===
  { id: 'fat_wall', setId: 'all_stars', rarity: 2, title: '泰山压顶', clue: '带着一整队敦实老师傅稳稳跑到终点', hint: '单局护送 ≥6 位胖叔安全坐稳到站', flavor: '六位胖叔坐车顶，弹簧含泪叫大哥', reward: 30 },
  { id: 'spider_job', setId: 'all_stars', rarity: 2, title: '蜘蛛侠再就业', clue: '让身手最利索的小伙子们，找各自拿手的地方待稳', hint: '单局 ≥5 位挂壁娃扒车门安全到站', flavor: '车顶没座？车门扶手才是 VIP', reward: 30 },
  { id: 'astro_arm', setId: 'all_stars', rarity: 2, title: '铁臂阿童木', clue: '听说那位长手高个儿，关键时刻特别靠得住', hint: '竹竿单局主动长臂捞住 ≥3 名队友', flavor: '竹竿长臂一捞，空中精准回血', reward: 30 },
  { id: 'basket_hero', setId: 'all_stars', rarity: 2, title: '买菜顺便救世界', clue: '早市阿姨手里的家伙什儿，关键时兴许派上大用场', hint: '单局大妈双菜篮累计兜住 ≥2 人', flavor: '大妈菜篮一伸，谁也别想掉队', reward: 30 },
  // === 套装 3：牛顿失联组 ===
  { id: 'air_time', setId: 'newton_lost', rarity: 3, title: '地心引力抓不住我', clue: '被狠狠甩出去之后，在半空多飘一会儿试试', hint: '有乘客被物理甩飞后在空中滞空 ≥1.6 秒', flavor: '在天上飘太久，差点收到航管通知', reward: 30 },
  { id: 'sky_rocket', setId: 'newton_lost', rarity: 3, title: '你咋不上天呢', clue: '来一场直冲云霄的高空弹射奇观', hint: '有乘客被物理崩飞直冲高空云层', flavor: '别人挤火车，你直接原地发射', reward: 30 },
  { id: 'spin_round', setId: 'newton_lost', rarity: 3, title: '爱的魔力转圈圈', clue: '飞出去的时候，在天上多翻几个跟头', hint: '有乘客被甩飞后在空中狂转 ≥2 整圈', flavor: '空中转体七百二，裁判给十分', reward: 30 },
  { id: 'flower_rain', setId: 'newton_lost', rarity: 2, title: '天女散花', clue: '来个大颠簸或狠急刹，让大伙儿一齐起飞', hint: '1 秒内同时甩飞 ≥5 名乘客满屏起飞', flavor: '一秒起飞五个人，漫天都是打工魂', reward: 25 },
  // === 套装 4：桥洞风云组 ===
  { id: 'yi_jian_mei', setId: 'tunnel_wind', rarity: 3, title: '一剪梅', clue: '遇上矮桥洞却死活不肯低下高贵的头颅', hint: '过桥洞时一刀同时削飞 ≥3 名乘客', flavor: '桥洞一刀切，发型整齐划一', reward: 25 },
  { id: 'crouch_master', setId: 'tunnel_wind', rarity: 1, title: '缩头宗师', clue: '一路逢桥必矮身，头发丝儿都没乱着过关', hint: '过 ≥2 座桥洞且全程 0 撞头削飞并过关', flavor: '桥洞离头皮两毫米，发型都没乱', reward: 25 },
  { id: 'air_jordan', setId: 'tunnel_wind', rarity: 3, title: '空中飞人', clue: '快要掉下车时，谁在半空中奇迹般拉了一把？', hint: '乘客半空脱手后被菜篮或竹竿凌空捞回', flavor: '半空脱手又捞回，极限空中接力', reward: 40 },
  { id: 'wind_north', setId: 'tunnel_wind', rarity: 1, title: '风往北吹', clue: '顶着迎面大狂风，把一大车人稳稳带进站', hint: '穿过强阵风区护送 ≥10 人安全到站', flavor: '狂风吹不散早高峰打工人的执念', reward: 30 },
  // === 套装 5：老司机车神组 ===
  { id: 'akina_god', setId: 'pro_driver', rarity: 1, title: '秋名山车神', clue: '油门踩足、一路狂飙到底还拿下了这站', hint: '单局手动加速累计 ≥4.5 秒并过关', flavor: '只要车速够快，重力就追不上我', reward: 30 },
  { id: 'steady_dog', setId: 'pro_driver', rarity: 1, title: '稳如老狗', clue: '一车人熙熙攘攘，开到终点竟一个没掉', hint: '带 ≥10 人发车且全程 0 摔落到站', flavor: '一杯热茶放车顶，一滴都没洒', reward: 35 },
  { id: 'queue_god', setId: 'pro_driver', rarity: 2, title: '素质天花板', clue: '去【左右分流专列】拿个像样的高评价回来', hint: '在「左右分流专列」中拿到 A 级及以上', flavor: '盲分左右也能拿 A，配重宗师就是你', reward: 40 },
  { id: 'full_house', setId: 'pro_driver', rarity: 2, title: '全员到齐', clue: '把站台上等车的熟人全请上车再拉笛', hint: '将站台全部候车乘客塞上车并成功发车', flavor: '站台空了车顶满了，检票员看傻了', reward: 35 },
  // === 套装 6：戏剧之王组 ===
  { id: 'rich_boss', setId: 'drama_king', rarity: 2, title: '老板大气！', clue: '同时护送好几位西装大老板体面到站', hint: '单局护送 ≥3 位 VIP 老板安全到站', flavor: '三位金主同框，今天车票管够', reward: 40 },
  { id: 'ss_legend', setId: 'drama_king', rarity: 3, title: '春运活传奇', clue: '在任意一条线路拿下最顶格的超神评价', hint: '任意线路拿到最高 SS 级评定到站', flavor: '牛顿连夜买站票，来车顶记笔记', reward: 45 },
  { id: 'lone_wolf', setId: 'drama_king', rarity: 3, title: '光杆司令', clue: '热热闹闹拉一大群人上路，进站时却冷冷清清', hint: '≥5 人轰轰烈烈发车，到站只剩 0~1 人', flavor: '发车热热闹闹，到站独享包厢', reward: 25 },
  { id: 'one_point_shy', setId: 'drama_king', rarity: 3, title: '就差亿点点', clue: '到站一算分，离更高一档只差那么毫厘之间', hint: '到站得分距离上一档段位刚好只差 1 分', flavor: '离下一档就差 1 分，心态小崩', reward: 35 },
];

/** 到站全局评估高光称号含金量：首次新解锁 > 稀有度(SSR/SR/R) > 历史越稀罕越优先(反疲劳) > 后半程惊险加权 */
export function evaluateHighlightScore(def, { isNew = false, count = 1, runTime = 0 } = {}) {
  const rarity = (def && def.rarity) || 1;
  const fatiguePenalty = Math.min(900, Math.max(0, count - 1) * 85);
  const lateBonus = Math.min(50, Math.max(0, runTime) * 2);
  return (isNew ? 10000 : 0) + rarity * 1000 - fatiguePenalty + lateBonus;
}

export function todayDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1337;
}

export function buildDailyLevel(dateKey = todayDateKey()) {
  const seed = hashSeed(`daily_${dateKey}`);
  const themes = [
    {
      name: '全员胖叔重装日',
      intel: ['双低洞', '重车急刹'],
      pool: { fat: 26, thin: 18, acrobat: 10, auntie: 8, tall: 6, vip: 4 },
      tunnels: [
        { x: 2150, len: 310, clearY: -236, label: '限重石桥' },
        { x: 4650, len: 320, clearY: -218, label: '低矮老洞' },
      ],
      winds: [],
      midStops: [{ x: 3400, len: 420, holdSec: 0.7, label: '重车急刹' }],
    },
    {
      name: '竹竿森林大乱斗',
      intel: ['三连低洞', '林间阵风'],
      pool: { tall: 24, thin: 20, fat: 10, acrobat: 10, auntie: 8, vip: 4 },
      tunnels: [
        { x: 2050, len: 300, clearY: -232, label: '剃头天桥' },
        { x: 4250, len: 330, clearY: -216, label: '超低涵洞' },
        { x: 6150, len: 310, clearY: -222, label: '收尾拱桥' },
      ],
      winds: [{ x: 2750, len: 1100, force: 215, label: '林间阵风' }],
      midStops: [],
    },
    {
      name: '菜篮大妈早市潮',
      intel: ['极限低洞', '早高峰狂风'],
      pool: { auntie: 22, thin: 28, fat: 8, acrobat: 10, tall: 6, vip: 4 },
      tunnels: [
        { x: 2200, len: 310, clearY: -228, label: '早市高架' },
        { x: 4800, len: 330, clearY: -214, label: '极限低洞' },
      ],
      winds: [{ x: 3100, len: 1200, force: 225, label: '早高峰狂风' }],
      midStops: [],
    },
  ];
  const pick = themes[seed % themes.length];
  return {
    id: `daily_${dateKey}`,
    index: 0,
    isDaily: true,
    dailySeed: seed,
    name: pick.name,
    intel: pick.intel,
    distance: 7400,
    maxSpeed: 445,
    accel: 235,
    brakeDist: 600,
    bumpAmp: 52,
    pool: { ...pick.pool },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: null,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels: pick.tunnels,
    winds: pick.winds,
    midStops: pick.midStops,
    slopes: [{ x: 1180, len: 740, grade: 0.16, label: '每日大陡坡' }],
    ramps: [{ x: 5450, amp: 25, label: '极限飞坡跳台' }],
    targets: [32, 46, 62, 74],
  };
}

export function buildEndlessLevel(wave = 1) {
  const w = Math.max(1, wave);
  const dist = Math.min(8400, 4600 + (w - 1) * 480);
  const tunnels = [];
  const tCount = w === 1 ? 1 : w <= 3 ? 2 : 3;
  for (let i = 0; i < tCount; i++) {
    const frac = (i + 1) / (tCount + 1);
    const clearY = Math.max(-210, -242 + Math.min(28, (w - 1) * 5) + (i % 2) * 8);
    tunnels.push({
      x: Math.round(dist * frac),
      len: 290 + Math.min(60, w * 8),
      clearY,
      label: clearY <= -228 ? '高架桥' : clearY <= -218 ? '低矮涵洞' : '剃头极限洞',
    });
  }
  const winds = w >= 2
    ? [{ x: Math.round(dist * 0.42), len: 1100, force: Math.min(255, 175 + w * 14), label: '逆风区' }]
    : [];
  const midStops = w >= 3
    ? [{ x: Math.round(dist * 0.62), len: 420, holdSec: 0.7, label: '临时急刹' }]
    : [];
  const slopes = w >= 2
    ? [{ x: Math.round(dist * 0.20), len: 700, grade: w % 2 === 0 ? 0.16 : -0.16, label: w % 2 === 0 ? '高架陡上坡' : '极速俯冲坡' }]
    : [];
  const ramps = w >= 2
    ? [{ x: Math.round(dist * 0.80), amp: Math.min(28, 22 + w), label: '铁轨飞坡跳台' }]
    : [];
  const basePool = w === 1
    ? { thin: 14, fat: 8, acrobat: 8, tall: 6, auntie: 6, vip: 2 }
    : { thin: 10, fat: 5, acrobat: 5, tall: 4, auntie: 4, vip: w % 2 === 0 ? 2 : 1 };

  const intel = [`${tCount}座低桥`];
  if (winds.length) intel.push('强逆风');
  if (slopes.length || ramps.length) intel.push('陡坡+跳台');
  if (midStops.length) intel.push('红灯急停');

  return {
    id: `endless_${w}`,
    index: w,
    isEndless: true,
    wave: w,
    name: `无尽第 ${w} 站`,
    intel,
    distance: dist,
    maxSpeed: Math.min(485, 395 + (w - 1) * 14),
    accel: Math.min(265, 205 + (w - 1) * 9),
    brakeDist: 560,
    bumpAmp: Math.min(66, 36 + (w - 1) * 5),
    pool: basePool,
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: null,
    showUndo: true,
    bursts: [1, 3],
    showReinforce: true,
    tunnels,
    winds,
    midStops,
    slopes,
    ramps,
    targets: [12 + w * 4, 22 + w * 5, 34 + w * 6, 46 + w * 7],
  };
}

export function buildStrictQueueLevel(dateKey = todayDateKey()) {
  const seed = hashSeed(`strict_${dateKey}`);
  return {
    id: 'strict_queue',
    index: 0,
    isStrictQueue: true,
    strictQueue: true,
    dailySeed: seed,
    name: '左右分流专列',
    intel: ['禁点车顶 · 盲分左右', '左/右双键配重', '双低桥+阵风'],
    distance: 6200,
    maxSpeed: 420,
    accel: 215,
    brakeDist: 560,
    bumpAmp: 44,
    pool: { thin: 14, fat: 10, acrobat: 8, tall: 7, auntie: 7, vip: 4 },
    unlockedTypes: ['thin', 'fat', 'acrobat', 'tall', 'auntie', 'vip'],
    newType: null,
    showCrouch: true,
    showUndo: true,
    bursts: [1],
    showReinforce: false,
    tunnels: [
      { x: 2100, len: 300, clearY: -236, label: '配重天桥' },
      { x: 4550, len: 320, clearY: -222, label: '平衡涵洞' },
    ],
    winds: [
      { x: 3000, len: 1050, force: 190, label: '站间侧风' },
    ],
    midStops: [],
    targets: [18, 28, 38, 48],
  };
}

export function pickFunnyTitle(world) {
  const score = world.finalScore ?? world.finalCount;
  const fallen = world.fallenTotal || 0;
  const alivePeople = world.people.filter((p) => !p.fallen);
  const doorOnly = alivePeople.length > 0 && alivePeople.every((p) => p.onSideWall);
  const basketSaves = world.basketCatchCount || 0;
  const vipSaved = alivePeople.filter((p) => p.typeId === 'vip').length;

  if (alivePeople.length === 0) return '空车进站·全员放飞大师';
  if (doorOnly) return '车顶剃光头·门外全苟活';
  if (vipSaved >= 3 && fallen <= 5) return '金主贴身护卫队长';
  if (basketSaves >= 4) return '大妈菜篮收割机';
  if (fallen === 0 && score >= 28) return '牛顿棺材板焊死大师';
  if (fallen >= 22) return '早高峰天女散花发射器';
  if (score >= (world.level.targets?.[3] || 50)) return '春运超载物理奇观';
  if (score >= (world.level.targets?.[2] || 36)) return '秋名山铁轨漂移站长';
  if (fallen <= 3 && score >= 14) return '稳如老狗持证车长';
  return '早高峰硬核塞车手';
}
