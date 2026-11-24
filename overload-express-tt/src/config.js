// 抖音小游戏商业化、分享与合规配置（提审上线前替换为真实后台 ID）

export const TT_CONFIG = {
  // 抖音开放平台「流量主」申请到的激励视频广告位 ID
  rewardedAdUnitId: '',
  // 生产提审开关：抖音真机/开发者工具默认 false（严禁线上模拟发奖），仅本地浏览器预览可模拟调试
  DEV_MOCK_AD: typeof __OVERLOAD_DEV_MOCK_AD__ === 'boolean'
    ? __OVERLOAD_DEV_MOCK_AD__
    : (typeof tt === 'undefined' || typeof tt.createCanvas !== 'function'),
  // 录屏分享挂载话题与文案模板
  shareTitle: '我在《超载快车》运达 {count} 人，荣获【{title}】！谁能比我更能塞？',
  sharePassiveTitle: '早高峰挤爆啦！来《超载快车》试试你车顶能叠多少人！',
  shareTopics: ['超载快车', '抖音小游戏', '物理小游戏'],
  // 排行榜榜单标识（统一上报全服单局最高分/累计运载，避免高低关混榜）
  rankZoneId: 'default',
  rankKeyPrefix: 'overload_v3_',
  // 备案号/软著登记号占位（提审上线前按实际审核信息填写，留空则不显示）
  icpFiling: '',
  // 合规适龄提示（8+）与完整说明文案（支持点击图标弹窗查看）
  ageRating: '8+',
  ageRatingTitle: '适龄提示（CADPA 8+）',
  ageRatingLines: [
    '1. 本游戏是一款休闲卡通物理模拟类小游戏，适用于年满 8 周岁及以上的用户，建议未成年人在家长监护下使用。',
    '2. 本游戏采用轻快幽默的卡通画风，画面无任何写实暴力、恐怖或不良导向内容，核心玩法为平衡叠放与时机躲避。',
    '3. 本游戏为纯单机休闲体验，不含任何付费充值及内购系统，不收集任何个人敏感隐私信息，仅存档于本机。',
    '4. 请合理安排游戏时间，注意保护视力，避免沉迷。',
  ],
  // 健康游戏忠告：抖音小游戏备案要求登录页必须呈现，且必须显式含有标题
  healthNoticeTitle: '《健康游戏忠告》',
  healthNotice: '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。',
};
