// 纯 Canvas2D 主舞台渲染（抖音小游戏 V4 卡通厚涂明快画风版，零 DOM 依赖）：
// - 4 套明快插画时段色板（清晨晴空 / 午后蓝天 / 晚高峰橘霞 / 深夜春运霓虹），彻底告别沉闷黑灰后台感
// - 0 黑边宽屏延伸：蓬松白云、圆润双层丘陵、城市剪影、悬垂接触网电线、暖色站台砖石直铺底边
// - 5 套纯 Canvas 火车涂装 + 金属高光/铆钉/窗户反光 + 车头超载冒汗与急刹瞪眼表情
// - 导出 drawPortrait() 供底部立体角色卡绘制真实迷你头像
// - 短视频爆点导演：撞洞 1.18x 动态镜头特写 + 夸张厚描边大字吐槽横幅

import { TRAIN, TRAIN_ANCHORS, TYPE_MAP, DOOR_BAR_XS } from './physics.js';
import { TRAIN_SKINS } from './levels.js';

export const VW = 1280;
export const VH = 720;
export const ORIGIN_X = 600;
export const GROUND_Y = 532;

const PI2 = Math.PI * 2;
export const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Segoe UI",system-ui,sans-serif';
export const MONO = '"DIN Alternate","Arial Rounded MT Bold","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';

/** 兼容旧版 Canvas（部分抖音低版本设备无 roundRect） */
export function rrect(ctx, x, y, w, h, r = 8) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const WINDOW_FACES = Array.from({ length: 24 }, (_, i) => ({
  dx: ((i % 4) - 1.5) * 14 + ((i * 7) % 5 - 2),
  dy: Math.floor(i / 4) * 5 - 4,
  r: 8 + (i % 3) * 1.5,
  tone: ['#FAD7B8', '#F2C099', '#E6AB81', '#FDE0C6'][i % 4],
  shirt: ['#EF4444', '#38BDF8', '#F59E0B', '#22C55E', '#A855F7'][i % 5],
}));

// 4 套明快手绘感时段色板，按关卡推进自然切换，兼顾清爽观感与抖音短视频辨识度
const SKY_THEMES = {
  morning: {
    sky: ['#38BDF8', '#7DD3FC', '#C7EEFF', '#FEF3C7'],
    sunColor: '#FEF08A', sunHalo: 'rgba(254, 240, 138, 0.32)', sunY: 165,
    cloudColor: 'rgba(255, 255, 255, 0.88)',
    cityColor: '#8FBCD4',
    hillFar: '#67B8A8', hillNear: '#47A384',
    poleColor: 'rgba(51, 65, 85, 0.42)',
    wireColor: 'rgba(51, 65, 85, 0.28)',
    platformTop: '#F1E7D5', platformBody: '#D8C7AE',
    ballast: '#6E635B', isNight: false,
  },
  noon: {
    sky: ['#0284C7', '#38BDF8', '#BAE6FD', '#E0F2FE'],
    sunColor: '#FFFFFF', sunHalo: 'rgba(255, 255, 255, 0.30)', sunY: 135,
    cloudColor: 'rgba(255, 255, 255, 0.92)',
    cityColor: '#7CB2D1',
    hillFar: '#4CAF93', hillNear: '#2E9370',
    poleColor: 'rgba(30, 41, 59, 0.40)',
    wireColor: 'rgba(30, 41, 59, 0.25)',
    platformTop: '#EFE6D8', platformBody: '#D2C3AC',
    ballast: '#665D56', isNight: false,
  },
  sunset: {
    sky: ['#4338CA', '#C026D3', '#F97316', '#FDE047'],
    sunColor: '#FEF08A', sunHalo: 'rgba(253, 224, 71, 0.34)', sunY: 268,
    cloudColor: 'rgba(255, 228, 200, 0.72)',
    cityColor: '#7E3B7D',
    hillFar: '#5B2E6B', hillNear: '#3E2252',
    poleColor: 'rgba(30, 27, 75, 0.48)',
    wireColor: 'rgba(30, 27, 75, 0.32)',
    platformTop: '#DFC7B2', platformBody: '#BFA089',
    ballast: '#594846', isNight: false,
  },
  night: {
    sky: ['#0F172A', '#1E1B4B', '#3730A3', '#6D28D9'],
    sunColor: '#FEF9C3', sunHalo: 'rgba(254, 249, 195, 0.24)', sunY: 155,
    cloudColor: 'rgba(165, 180, 252, 0.22)',
    cityColor: '#1E293B',
    hillFar: '#1E2647', hillNear: '#171E3A',
    poleColor: 'rgba(15, 23, 42, 0.62)',
    wireColor: 'rgba(148, 163, 184, 0.28)',
    platformTop: '#3B4664', platformBody: '#273047',
    ballast: '#36323A', isNight: true,
  },
};

function getSkyTheme(level) {
  if (level.isDaily) return SKY_THEMES.sunset;
  if (level.isEndless) {
    const cycle = ['morning', 'noon', 'sunset', 'night'];
    return SKY_THEMES[cycle[((level.wave || 1) - 1) % 4]];
  }
  const idx = level.index || 1;
  if (idx <= 3) return SKY_THEMES.morning;
  if (idx <= 6) return SKY_THEMES.noon;
  if (idx <= 8) return SKY_THEMES.sunset;
  return SKY_THEMES.night;
}

/** 共享卡通头部与专属特征绘制（确保舞台小人与底部头像卡 100% 统一且极富喜剧辨识度！） */
function drawCharacterHead(ctx, spec, hr, mood, time = 0, id = 0, isPortrait = false) {
  // 挂壁娃：脑后随风狂舞的超长双条红丝带（手机小屏也一眼识别！）
  if (spec.id === 'acrobat') {
    const fl1 = isPortrait ? 0 : Math.sin(time * 18 + id) * 5.2;
    const fl2 = isPortrait ? 2 : Math.cos(time * 16 + id) * 4.5;
    ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 3.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-hr * 0.75, -hr * 0.35);
    ctx.quadraticCurveTo(-hr * 1.65, -hr * 0.65 + fl1 * 0.5, -hr * 2.55, -hr * 0.25 + fl1);
    ctx.moveTo(-hr * 0.72, -hr * 0.12);
    ctx.quadraticCurveTo(-hr * 1.55, -hr * 0.05 + fl2 * 0.5, -hr * 2.35, hr * 0.28 + fl2);
    ctx.stroke();
  }

  // 大妈：后脑勺蓬松波浪泡面卷烫发 + 高丸子 + 碎花头巾
  if (spec.id === 'auntie') {
    ctx.fillStyle = '#4A2C23'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.1;
    // 蓬松大波浪烫发团（一圈圆润发卷）
    const curls = [[0, -hr * 1.02, 0.56], [-0.72, -0.64, 0.46], [0.72, -0.64, 0.46], [-0.96, -0.05, 0.40], [0.96, -0.05, 0.40], [-0.78, 0.45, 0.34], [0.78, 0.45, 0.34]];
    for (const [cx, cy, cr] of curls) {
      ctx.beginPath(); ctx.arc(cx * hr, cy * hr, cr * hr, 0, PI2); ctx.fill(); ctx.stroke();
    }
    // 醒目碎花头巾蝴蝶结
    ctx.fillStyle = '#FB7185';
    ctx.beginPath(); ctx.ellipse(-hr * 0.28, -hr * 1.15, hr * 0.34, hr * 0.22, -0.3, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(hr * 0.28, -hr * 1.15, hr * 0.34, hr * 0.22, 0.3, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FEF08A'; ctx.beginPath(); ctx.arc(0, -hr * 1.15, hr * 0.16, 0, PI2); ctx.fill();
  }

  // 头部差异化脸型（胖叔宽圆双下巴、瘦猴瓜子脸+招风大耳、竹竿修长脸、其余圆萌脸）
  ctx.fillStyle = mood === 'panic' ? '#FECACA' : spec.skin;
  ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.4;

  // 小耳朵（瘦猴超大招风耳一眼认出！）
  const earR = spec.id === 'thin' ? hr * 0.36 : hr * 0.23;
  ctx.beginPath(); ctx.arc(-hr * 0.98, hr * 0.04, earR, 0, PI2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(hr * 0.98, hr * 0.04, earR, 0, PI2); ctx.fill(); ctx.stroke();

  if (spec.id === 'fat') {
    // 胖叔宽大双下巴圆润脸盘
    ctx.beginPath();
    ctx.ellipse(0, hr * 0.06, hr * 1.12, hr * 1.02, 0, 0, PI2);
    ctx.fill(); ctx.stroke();
    // 双下巴笑纹
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.35)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, hr * 0.68, hr * 0.42, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  } else if (spec.id === 'tall') {
    // 竹竿修长瘦脸
    ctx.beginPath();
    ctx.ellipse(0, 0, hr * 0.88, hr * 1.10, 0, 0, PI2);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, hr, 0, PI2);
    ctx.fill(); ctx.stroke();
  }

  // 角色专属发型与帽子
  if (spec.id === 'thin') {
    // 瘦猴：反戴亮蓝鸭舌帽（帽檐俏皮朝后翘！）+ 额前两撮呆毛
    ctx.fillStyle = '#0284C7'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.arc(0, -hr * 0.18, hr * 1.02, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#38BDF8';
    rrect(ctx, -hr * 1.48, -hr * 0.34, hr * 0.88, hr * 0.30, 4); ctx.fill(); ctx.stroke();
    // 额前碎刘海
    ctx.fillStyle = '#1E293B';
    ctx.beginPath(); ctx.moveTo(-hr * 0.4, -hr * 0.2); ctx.lineTo(-hr * 0.1, -hr * 0.48); ctx.lineTo(hr * 0.25, -hr * 0.15); ctx.closePath(); ctx.fill();
  } else if (spec.id === 'fat') {
    // 胖叔：经典亮黄工地安全帽 + 顶部反光灯章 + 厚帽檐
    ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0, -hr * 0.22, hr * 1.18, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, -hr * 0.85, hr * 0.26, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#EAB308';
    rrect(ctx, -hr * 1.36, -hr * 0.32, hr * 2.72, hr * 0.28, 3); ctx.fill(); ctx.stroke();
  } else if (spec.id === 'acrobat') {
    // 挂壁娃：帅气刺猬尖发 + 额头紧绑红色头带 + 剑眉
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(-hr, -hr * 0.3);
    ctx.lineTo(-hr * 0.72, -hr * 1.25); ctx.lineTo(-hr * 0.22, -hr * 0.86);
    ctx.lineTo(0, -hr * 1.38); ctx.lineTo(hr * 0.32, -hr * 0.86);
    ctx.lineTo(hr * 0.78, -hr * 1.22); ctx.lineTo(hr, -hr * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#EF4444'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8;
    rrect(ctx, -hr * 1.04, -hr * 0.54, hr * 2.08, hr * 0.34, 3); ctx.fill(); ctx.stroke();
  } else if (spec.id === 'tall') {
    // 竹竿：白色休闲渔夫帽（带紫边）
    ctx.fillStyle = '#F8FAFC'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.arc(0, -hr * 0.25, hr * 1.02, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#A855F7';
    ctx.fillRect(-hr * 0.94, -hr * 0.44, hr * 1.88, hr * 0.20);
    ctx.fillStyle = '#F8FAFC';
    rrect(ctx, -hr * 1.28, -hr * 0.30, hr * 2.56, hr * 0.26, 4); ctx.fill(); ctx.stroke();
  } else if (spec.id === 'auntie') {
    // 大妈：前额烫卷小刘海
    ctx.fillStyle = '#4A2C23';
    ctx.beginPath();
    ctx.arc(-hr * 0.35, -hr * 0.65, hr * 0.36, 0, PI2);
    ctx.arc(hr * 0.22, -hr * 0.70, hr * 0.34, 0, PI2);
    ctx.fill();
  } else if (spec.id === 'vip') {
    // VIP老板：超高黑丝绸高顶礼帽 + 亮金丝带 + 金冠小徽章
    ctx.fillStyle = '#1E293B'; ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 2;
    rrect(ctx, -hr * 0.80, -hr * 1.82, hr * 1.60, hr * 1.42, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-hr * 0.78, -hr * 0.72, hr * 1.56, hr * 0.28);
    ctx.fillStyle = '#FEF9C3';
    ctx.beginPath(); ctx.arc(0, -hr * 1.15, hr * 0.22, 0, PI2); ctx.fill();
    ctx.fillStyle = '#1E293B';
    rrect(ctx, -hr * 1.34, -hr * 0.46, hr * 2.68, hr * 0.28, 4); ctx.fill(); ctx.stroke();
  }

  // 粉红萌系小腮红
  ctx.fillStyle = 'rgba(244, 63, 94, 0.30)';
  ctx.beginPath();
  ctx.arc(-hr * 0.54, hr * 0.22, hr * 0.22, 0, PI2);
  ctx.arc(hr * 0.54, hr * 0.22, hr * 0.22, 0, PI2);
  ctx.fill();

  // 五官表情（新增 cheer 胜利大笑欢呼表情！）
  if (spec.id === 'vip' && mood !== 'panic') {
    ctx.fillStyle = '#0F172A';
    rrect(ctx, -hr * 0.74, -hr * 0.22, hr * 0.64, hr * 0.42, 3); ctx.fill();
    rrect(ctx, hr * 0.10, -hr * 0.22, hr * 0.64, hr * 0.42, 3); ctx.fill();
    ctx.fillRect(-hr * 0.12, -hr * 0.08, hr * 0.24, 2.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.68)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hr * 0.56, -hr * 0.14); ctx.lineTo(-hr * 0.36, hr * 0.08);
    ctx.moveTo(hr * 0.26, -hr * 0.14); ctx.lineTo(hr * 0.46, hr * 0.08);
    ctx.stroke();
    if (mood === 'cheer') {
      ctx.fillStyle = '#EF4444'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, hr * 0.28, hr * 0.32, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, hr * 0.24, hr * 0.26, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  } else if (mood === 'cheer') {
    // 胜利欢呼：弯弯笑眯眼 + 张嘴大笑！
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-hr * 0.34, -hr * 0.02, hr * 0.20, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath();
    ctx.arc(hr * 0.34, -hr * 0.02, hr * 0.20, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = '#EF4444'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, hr * 0.22, hr * 0.34, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (mood === 'panic') {
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(-hr * 0.34, -hr * 0.06, hr * 0.28, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(hr * 0.34, -hr * 0.06, hr * 0.28, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1E293B';
    ctx.beginPath(); ctx.arc(-hr * 0.34, -hr * 0.06, hr * 0.12, 0, PI2); ctx.arc(hr * 0.34, -hr * 0.06, hr * 0.12, 0, PI2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, hr * 0.44, hr * 0.26, hr * 0.34, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath(); ctx.ellipse(hr * 0.82, -hr * 0.16, hr * 0.14, hr * 0.24, 0, 0, PI2); ctx.fill();
  } else if (mood === 'crouch') {
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.1; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-hr * 0.52, -hr * 0.18); ctx.lineTo(-hr * 0.20, -hr * 0.02); ctx.lineTo(-hr * 0.52, hr * 0.14);
    ctx.moveTo(hr * 0.52, -hr * 0.18); ctx.lineTo(hr * 0.20, -hr * 0.02); ctx.lineTo(hr * 0.52, hr * 0.14);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6;
    rrect(ctx, -hr * 0.30, hr * 0.28, hr * 0.60, hr * 0.26, 3); ctx.fill(); ctx.stroke();
  } else if (spec.id === 'auntie') {
    // 大妈慈祥弯弯笑眯眼
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.0; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-hr * 0.34, -hr * 0.02, hr * 0.18, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath();
    ctx.arc(hr * 0.34, -hr * 0.02, hr * 0.18, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, hr * 0.20, hr * 0.28, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
  } else {
    ctx.fillStyle = '#1E293B';
    ctx.beginPath(); ctx.arc(-hr * 0.33, -hr * 0.04, hr * 0.18, 0, PI2); ctx.arc(hr * 0.33, -hr * 0.04, hr * 0.18, 0, PI2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-hr * 0.38, -hr * 0.10, hr * 0.07, 0, PI2); ctx.arc(hr * 0.28, -hr * 0.10, hr * 0.07, 0, PI2); ctx.fill();
    if (spec.id === 'acrobat') {
      // 挂壁娃酷酷斜飞剑眉
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(-hr * 0.56, -hr * 0.28); ctx.lineTo(-hr * 0.16, -hr * 0.18);
      ctx.moveTo(hr * 0.56, -hr * 0.28); ctx.lineTo(hr * 0.16, -hr * 0.18);
      ctx.stroke();
    }
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, hr * 0.20, hr * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }

  // 竹竿：超醒目黑框大圆眼镜（手机小屏也一眼认出书呆子长臂竹竿！）
  if (spec.id === 'tall') {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.1;
    ctx.beginPath(); ctx.arc(-hr * 0.36, -hr * 0.04, hr * 0.34, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(hr * 0.36, -hr * 0.04, hr * 0.34, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-hr * 0.02, -hr * 0.04); ctx.lineTo(hr * 0.02, -hr * 0.04); ctx.stroke();
  }

  // 胖叔：招牌超浓密外翘大八字胡
  if (spec.id === 'fat') {
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.ellipse(-hr * 0.34, hr * 0.22, hr * 0.42, hr * 0.18, -0.25, 0, PI2);
    ctx.ellipse(hr * 0.34, hr * 0.22, hr * 0.42, hr * 0.18, 0.25, 0, PI2);
    ctx.fill();
  }
}

/** 绘制一只装满大葱和红番茄的可爱编织大菜篮 */
function drawVeggieBasket(ctx, bx, by, scale = 1.0) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(scale, scale);
  // 探出篮口的两根脆绿大葱 + 一个红彤彤番茄！
  ctx.strokeStyle = '#15803D'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -4); ctx.lineTo(-10, -14);
  ctx.moveTo(-2, -4); ctx.lineTo(-4, -15);
  ctx.stroke();
  ctx.fillStyle = '#EF4444'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(5, -7, 4.5, 0, PI2); ctx.fill(); ctx.stroke();

  // 菜篮提手
  ctx.strokeStyle = '#92400E'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(0, -5, 9, Math.PI, 0); ctx.stroke();

  // 编织梯形大篮体
  ctx.fillStyle = '#FB923C'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-13, -6); ctx.lineTo(13, -6);
  ctx.lineTo(10, 10); ctx.lineTo(-10, 10);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // 暖黄藤编纹理
  ctx.strokeStyle = '#FEF08A'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, 1); ctx.lineTo(10, 1);
  ctx.moveTo(-5, -5); ctx.lineTo(-4, 9);
  ctx.moveTo(5, -5); ctx.lineTo(4, 9);
  ctx.stroke();
  ctx.restore();
}

/** 导出给 ui_canvas.js 使用：在角色卡片上画活灵活现的迷你卡通角色半身像！ */
export function drawPortrait(ctx, typeId, cx, cy, scale = 1.0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const spec = TYPE_MAP[typeId];
  if (!spec) { ctx.restore(); return; }

  // 大妈背后探出的两个带大葱小菜篮
  if (spec.basketCatch) {
    drawVeggieBasket(ctx, -14, 9, 0.56);
    drawVeggieBasket(ctx, 14, 9, 0.56);
  }

  // 身体肩部 + 专属衣领/背带细节（与升级后的舞台形象 100% 同步！）
  const bodyW = spec.id === 'fat' ? 15 : spec.id === 'auntie' ? 12 : spec.id === 'tall' ? 8.8 : 10.5;
  ctx.fillStyle = spec.id === 'fat' ? '#F8FAFC' : spec.shirt;
  ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 14, bodyW, Math.PI, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  if (spec.id === 'fat') {
    // 胖叔蓝牛仔背带裤双肩带 + 铜扣
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(-9.5, 4, 4.2, 10);
    ctx.fillRect(5.3, 4, 4.2, 10);
    ctx.fillRect(-10, 9.5, 20, 4.5);
    ctx.fillStyle = '#FACC15';
    ctx.beginPath(); ctx.arc(-7.4, 10, 1.5, 0, PI2); ctx.arc(7.4, 10, 1.5, 0, PI2); ctx.fill();
  } else if (spec.id === 'vip') {
    // VIP 白衬衫 + 红领带
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(4, 4); ctx.lineTo(0, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#EF4444';
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-2.2, 11); ctx.lineTo(0, 14); ctx.lineTo(2.2, 11); ctx.closePath(); ctx.fill();
  } else if (spec.id === 'tall') {
    // 竹竿条纹毛衣
    ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, 9); ctx.lineTo(6, 9); ctx.stroke();
  } else if (spec.id === 'thin') {
    // 瘦猴亮黄领巾 + 斜挎包带
    ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(5, 14); ctx.stroke();
    ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.4;
    rrect(ctx, -6, 4.5, 12, 4, 2); ctx.fill(); ctx.stroke();
  } else if (spec.id === 'acrobat') {
    // 挂壁娃武术服斜襟滚边
    ctx.strokeStyle = '#FEF08A'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(3, 13); ctx.stroke();
  } else if (spec.id === 'auntie') {
    // 大妈碎花围裙肩带
    ctx.fillStyle = '#FFF1F2';
    ctx.fillRect(-7, 7, 14, 7);
    ctx.fillStyle = '#FB7185';
    ctx.beginPath(); ctx.arc(-3, 10.5, 1.4, 0, PI2); ctx.arc(3, 11, 1.4, 0, PI2); ctx.fill();
  }

  // 头部（与舞台 100% 同步！）
  const hr = spec.id === 'fat' ? 10.8 : spec.id === 'auntie' ? 9.4 : 9;
  const hy = spec.id === 'tall' ? -4 : -1.5;
  ctx.save();
  ctx.translate(0, hy);
  drawCharacterHead(ctx, spec, hr, 'happy', 0, 0, true);
  ctx.restore();

  ctx.restore();
}

// 站台排队候车人群随机漫画吐槽语料（早高峰众生相）
const CROWD_CHATTER_COMMON = [
  '快迟到了快迟到了！',
  '前面往里挪挪呀！',
  '这趟还能挤得下！',
  '打卡还剩两分钟！',
  '别挤扁我早餐豆浆！',
  '先下后上啊喂！',
  '车顶风景也挺好！',
  '早高峰全靠轻功！',
];
const CROWD_CHATTER_FRONT = [
  '轮到我了快拉我！',
  '排头位置就是香！',
  '车门一开我就冲！',
];
const CROWD_CHATTER_CLUSTER = [
  '哥几个一起冲！',
  '咱俩别挤散了！',
  '跟紧跟紧别掉队！',
];
const CROWD_CHATTER_BY_TYPE = {
  thin: ['早饭才吃半根油条！', '老板在群里催工了！', '挤地铁比健身还累'],
  fat: ['早饭吃得饱饱的！', '大伙儿稳住别慌！', '谁踩我安全帽了？'],
  acrobat: ['这趟车看着就带劲！', '早高峰练的就是身手！', '今天绝不能迟到！'],
  tall: ['上面空气真清新！', '腿长迈步就是快！', '谁看见我眼镜布了？'],
  auntie: ['刚抢的特价大白菜！', '小伙子让让阿姨！', '早市鸡蛋今天特价！'],
  vip: ['两百万单子等我签！', '头等舱到底在哪节？', '时间就是金钱！'],
};

function pickCrowdChatterLine(waiter, idx) {
  const r = Math.random();
  if (idx <= 2 && r < 0.38) {
    return CROWD_CHATTER_FRONT[Math.floor(Math.random() * CROWD_CHATTER_FRONT.length)];
  }
  if (waiter.sameCluster && r < 0.56) {
    return CROWD_CHATTER_CLUSTER[Math.floor(Math.random() * CROWD_CHATTER_CLUSTER.length)];
  }
  const typed = CROWD_CHATTER_BY_TYPE[waiter.typeId];
  if (typed && r < 0.82) {
    return typed[Math.floor(Math.random() * typed.length)];
  }
  return CROWD_CHATTER_COMMON[Math.floor(Math.random() * CROWD_CHATTER_COMMON.length)];
}

export class StageRenderer {
  constructor() {
    this.smoke = [];
    this.sparks = [];
    this.confetti = [];
    this.pops = [];
    this.crowdChatters = [];
    this.chatterCd = 0.85;
    this.shake = 0;

    this.camZoom = 1.0;
    this.camZoomTarget = 1.0;
    this.camFocusX = ORIGIN_X;
    this.camFocusY = GROUND_Y - 190;
    this.camHold = 0;
    this.camTimer = 0;
    this.camDur = 0.7;
    this.banner = null;
    this.driverSpeech = null;
  }

  resetImpact() {
    this.camZoom = 1.0;
    this.camZoomTarget = 1.0;
    this.camFocusX = ORIGIN_X;
    this.camFocusY = GROUND_Y - 190;
    this.camHold = 0;
    this.camTimer = 0;
    this.banner = null;
    this.driverSpeech = null;
    this.crowdChatters.length = 0;
    this.chatterCd = 0.85;
    this.shake = 0;
  }

  addPop(x, y, text, color = '#FEF08A', size = 21) {
    this.pops.push({ x, y, text, color, size, life: 1.05, max: 1.05 });
  }

  addShake(v) {
    this.shake = Math.min(20, this.shake + v);
  }

  triggerImpactZoom(localX, localY, bannerText = '', bannerColor = '#FEF08A') {
    this.camZoomTarget = 1.18;
    this.camHold = 0.22;
    this.camDur = 0.7;
    this.camTimer = 0.7;
    this.camFocusX = Math.max(ORIGIN_X - 180, Math.min(ORIGIN_X + 180, ORIGIN_X + localX * 0.55));
    this.camFocusY = Math.max(GROUND_Y - 260, Math.min(GROUND_Y - 130, GROUND_Y + localY * 0.65));
    if (bannerText) this.showBanter(bannerText, bannerColor, 1.35);
  }

  showBanter(text, color = '#FEF08A', dur = 1.35) {
    this.banner = { text, color, life: dur, max: dur };
  }

  showDriverSpeech(text, dur = 2.1) {
    this.driverSpeech = { text, life: dur, max: dur };
  }

  burstBonk(localX, localY) {
    const x = ORIGIN_X + localX;
    const y = GROUND_Y + localY;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI2 + Math.random() * 0.4;
      const sp = 95 + Math.random() * 145;
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp - 90, vy: Math.sin(a) * sp - 50,
        size: 5 + Math.random() * 4.5,
        color: i % 2 ? '#FEF08A' : '#FFFFFF',
        kind: 'star', life: 0.58, max: 0.58,
      });
    }
  }

  burstGold(localX, localY) {
    const x = ORIGIN_X + localX;
    const y = GROUND_Y + localY;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI2;
      const sp = 60 + Math.random() * 70;
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 35,
        size: 4 + Math.random() * 3,
        color: i % 2 ? '#FACC15' : '#4ADE80',
        kind: 'star', life: 0.48, max: 0.48,
      });
    }
  }

  /** 热梗成就高光时刻：在触发位置瞬间炸开超大金色星芒 + 彩带礼花！ */
  burstAchievementGold(localX = 0, localY = -120) {
    const x = ORIGIN_X + localX;
    const y = GROUND_Y + localY;
    const cols = ['#FACC15', '#FEF08A', '#F97316', '#FFFFFF', '#38BDF8'];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * PI2 + Math.random() * 0.2;
      const sp = 120 + Math.random() * 210;
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70,
        size: 7 + Math.random() * 6,
        color: cols[i % cols.length],
        kind: 'star', life: 0.85, max: 0.85,
      });
    }
    for (let i = 0; i < 24; i++) {
      const a = -Math.PI * (0.1 + Math.random() * 0.8);
      const sp = 140 + Math.random() * 260;
      this.confetti.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        w: 7 + Math.random() * 6, h: 4 + Math.random() * 4,
        rot: Math.random() * PI2, vr: (Math.random() - 0.5) * 14,
        color: cols[i % cols.length],
        life: 1.6 + Math.random() * 0.6, max: 2.2,
      });
    }
  }

  burstConfetti() {
    const cols = ['#FACC15', '#38BDF8', '#FB7185', '#4ADE80', '#C084FC'];
    for (let i = 0; i < 55; i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7);
      const sp = 180 + Math.random() * 340;
      this.confetti.push({
        x: ORIGIN_X + (Math.random() - 0.5) * 460,
        y: GROUND_Y - 190 - Math.random() * 60,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        rot: Math.random() * PI2, vr: (Math.random() - 0.5) * 10,
        w: 7 + Math.random() * 6, h: 4 + Math.random() * 4,
        color: cols[i % cols.length], life: 2.2 + Math.random() * 0.8, max: 3.0,
      });
    }
  }

  updateFx(dt, world) {
    this.shake *= Math.exp(-9 * dt);
    if (this.shake < 0.1) this.shake = 0;

    if (this.camTimer > 0) {
      this.camTimer = Math.max(0, this.camTimer - dt);
      const elapsed = this.camDur - this.camTimer;
      if (this.camTimer <= 1e-6) {
        this.camTimer = 0;
        this.camZoom = 1.0;
        this.camZoomTarget = 1.0;
      } else if (elapsed <= 0.14) {
        const k = elapsed / 0.14;
        this.camZoom = 1.0 + 0.18 * (1 - (1 - k) * (1 - k));
      } else if (elapsed <= 0.26) {
        this.camZoom = 1.18;
      } else {
        const k = (this.camDur - elapsed) / (this.camDur - 0.26);
        this.camZoom = 1.0 + 0.18 * (k * k * (3 - 2 * k));
      }
    } else {
      this.camZoom = 1.0;
    }

    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    if (this.driverSpeech) {
      this.driverSpeech.life -= dt;
      if (this.driverSpeech.life <= 0) this.driverSpeech = null;
    }

    const smokeRate = world.phase === 'running' ? 0.36 : 0.09;
    if (Math.random() < smokeRate) {
      this.smoke.push({
        x: ORIGIN_X + TRAIN.halfW - 34,
        y: GROUND_Y + TRAIN.roofY - 36,
        vx: -28 - world.speed * 0.45 - Math.random() * 25,
        vy: -52 - Math.random() * 42,
        r: 9 + Math.random() * 8,
        life: 1.05, max: 1.05,
      });
    }

    // 手动加速涡轮火星与浓蒸汽反馈！
    if (world.phase === 'running' && world.boosting && !world.braking) {
      if (Math.random() < 0.72) {
        this.sparks.push({
          x: ORIGIN_X + TRAIN.halfW - 34,
          y: GROUND_Y + TRAIN.roofY - 36,
          vx: -180 - Math.random() * 140,
          vy: -90 - Math.random() * 80,
          size: 3.5 + Math.random() * 3,
          color: Math.random() < 0.5 ? '#FACC15' : '#F97316',
          kind: 'dot', life: 0.36, max: 0.36,
        });
      }
    }

    if (world.phase === 'running' && world.accelX < -90 && world.speed > 40) {
      for (const wx of [-210, -135, 135, 210]) {
        if (Math.random() < 0.45) {
          this.sparks.push({
            x: ORIGIN_X + wx, y: GROUND_Y - 3,
            vx: -140 - Math.random() * 180, vy: -40 - Math.random() * 110,
            size: 2.5 + Math.random() * 2.5,
            color: Math.random() < 0.5 ? '#FDE047' : '#FB923C',
            kind: 'dot', life: 0.32, max: 0.32,
          });
        }
      }
    }

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i]; s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += 18 * dt;
      if (s.life <= 0) this.smoke.splice(i, 1);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 320 * dt;
      if (p.life <= 0) this.sparks.splice(i, 1);
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i]; c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 260 * dt;
      c.vx *= Math.exp(-1.2 * dt); c.rot += c.vr * dt;
      if (c.life <= 0) this.confetti.splice(i, 1);
    }

    // 站台排队乘客随机弹出早高峰漫画说话气泡（鲜活车站众生相！）
    const line = world.stationLine || [];
    for (let i = this.crowdChatters.length - 1; i >= 0; i--) {
      const ch = this.crowdChatters[i];
      ch.life -= dt;
      const stillWaiting = world.phase === 'loading' && line.some((w) => w.qid === ch.qid);
      if (ch.life <= 0 || !stillWaiting) this.crowdChatters.splice(i, 1);
    }
    if (world.phase === 'loading' && line.length > 0) {
      this.chatterCd -= dt;
      if (this.chatterCd <= 0 && this.crowdChatters.length < 2) {
        this.chatterCd = 1.45 + Math.random() * 1.55;
        const shiftX = ORIGIN_X - world.trainX;
        const speakingIds = new Set(this.crowdChatters.map((c) => c.qid));
        const speakingXs = this.crowdChatters
          .map((c) => line.find((w) => w.qid === c.qid))
          .filter(Boolean)
          .map((w) => shiftX + w.x);
        const cands = [];
        for (let i = 0; i < line.length; i++) {
          const w = line[i];
          if (speakingIds.has(w.qid)) continue;
          const sx = shiftX + w.x;
          // 避开左侧「还有 N 人排队进站」胶囊区与右侧边界，防止气泡与胶囊重叠或贴边裁切
          if (sx < 250 || sx > VW - 120) continue;
          if (speakingXs.some((ox) => Math.abs(ox - sx) < 185)) continue;
          cands.push({ w, idx: i });
        }
        if (cands.length > 0) {
          const pick = cands[Math.floor(Math.random() * cands.length)];
          const text = pickCrowdChatterLine(pick.w, pick.idx);
          this.crowdChatters.push({ qid: pick.w.qid, text, life: 2.35, max: 2.35 });
        }
      }
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.life -= dt; p.y -= 38 * dt;
      if (p.life <= 0) this.pops.splice(i, 1);
    }
  }

  virtualToTrain(vx, vy, world) {
    const dx = vx - ORIGIN_X;
    const dy = vy - (GROUND_Y + world.bumpY);
    const c = Math.cos(-world.tilt);
    const s = Math.sin(-world.tilt);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  draw(ctx, world, previewPt, opts = {}) {
    const showPlayHud = Boolean(opts.showPlayHud);
    const skin = opts.skin || TRAIN_SKINS[0];
    const leftV = opts.leftV ?? 0;
    const rightV = opts.rightV ?? VW;
    const doorHintTimer = opts.doorHintTimer || 0;
    const theme = getSkyTheme(world.level);

    ctx.save();
    if (this.camZoom > 1.001) {
      ctx.translate(this.camFocusX, this.camFocusY);
      ctx.scale(this.camZoom, this.camZoom);
      ctx.translate(-this.camFocusX, -this.camFocusY);
    }
    if (this.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawSkyAndParallax(ctx, world, theme, leftV, rightV);
    this.drawTracksAndStation(ctx, world, theme, leftV, rightV);
    this.drawMidStopSignals(ctx, world, leftV, rightV);
    this.drawSmoke(ctx, theme);

    ctx.save();
    ctx.translate(ORIGIN_X, GROUND_Y + world.bumpY);
    ctx.rotate(world.tilt);
    this.drawTrainBody(ctx, world, skin, doorHintTimer);
    this.drawAnchors(ctx, world);
    this.drawPeople(ctx, world);
    if (showPlayHud && world.phase === 'loading' && previewPt) {
      this.drawPlacementPreview(ctx, world, previewPt);
    }
    const isEarlyLevel = !world.level.isEndless && !world.level.isDaily && !world.level.strictQueue && (world.level.index || 1) <= 3;
    const idleSec = Math.max(0, (world.time || 0) - (world.lastLaunchTime || 0));
    const onBoardScore = world.onBoardScore();
    const targetB = (world.level.targets && world.level.targets[0]) || 6;
    const hasWaiting = world.poolTotal() > 0;
    // 前 3 关智能空等引导（左右分流专列禁点车顶，不弹出车顶引导）：
    // - 0 人上车时立刻显示；
    // - 放了人但还没达 B 级过关线，只要玩家停手发呆 >= 3.2 秒，立刻在车顶弹出「上车标记 + 动态点击小手」，不打扰顺手连点、卡壳立刻救场！
    const showRoofGuide = showPlayHud && world.phase === 'loading' && !world.level.strictQueue && hasWaiting && (
      (world.onBoardCount() === 0 && (isEarlyLevel || idleSec >= 1.2)) ||
      (isEarlyLevel && onBoardScore < targetB && idleSec >= 3.2)
    );
    if (showRoofGuide) {
      const cnt = world.onBoardCount();
      const t = world.time || 0;
      const bounce = Math.sin(t * 7.5) * 6;
      const ripple = (t * 1.35) % 1;
      const tapCycle = (t * 1.6) % 1; // 模拟手指“按下-抬起”节拍
      const tapPress = tapCycle < 0.28 ? Math.sin((tapCycle / 0.28) * Math.PI) : 0;
      ctx.save();

      // 1) 车顶发光虚线「上车落点区」+ 3 处波纹靶心 + 上车箭头标记
      ctx.fillStyle = 'rgba(250, 204, 21, 0.14)';
      rrect(ctx, -206, TRAIN.roofY - 46, 412, 42, 12);
      ctx.fill();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([8, 5]);
      rrect(ctx, -206, TRAIN.roofY - 46, 412, 42, 12);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const rx of [-115, 0, 115]) {
        ctx.save();
        ctx.globalAlpha = (1 - ripple) * 0.88;
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.ellipse(rx, TRAIN.roofY - 6, 10 + ripple * 28, 4 + ripple * 10, 0, 0, PI2);
        ctx.stroke();
        ctx.restore();

        // 醒目金色下指箭头
        const ay = TRAIN.roofY - 24 + bounce;
        ctx.fillStyle = '#FACC15';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(rx, ay + 12);
        ctx.lineTo(rx - 10, ay - 2);
        ctx.lineTo(rx - 4, ay - 2);
        ctx.lineTo(rx - 4, ay - 12);
        ctx.lineTo(rx + 4, ay - 12);
        ctx.lineTo(rx + 4, ay - 2);
        ctx.lineTo(rx + 10, ay - 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 2) 动态卡通点击小手（在车顶中央反复做点击下压动作，不看字 0.5 秒秒懂！）
      const handX = 26;
      const handY = TRAIN.roofY - 10 + tapPress * 9;
      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(-0.35 + tapPress * 0.14);
      ctx.scale(1 - tapPress * 0.08, 1 - tapPress * 0.08);
      // 卡通白手套食指点击图标
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.4;
      // 手掌
      rrect(ctx, -11, 2, 24, 20, 8); ctx.fill(); ctx.stroke();
      // 伸出的食指
      rrect(ctx, -9, -18, 9, 24, 4.5); ctx.fill(); ctx.stroke();
      // 握起的其余三指
      rrect(ctx, 0, -4, 7, 11, 3); ctx.fill(); ctx.stroke();
      rrect(ctx, 6, -1, 7, 10, 3); ctx.fill(); ctx.stroke();
      // 腕口蓝袖边
      ctx.fillStyle = '#38BDF8';
      rrect(ctx, -10, 19, 22, 6, 3); ctx.fill(); ctx.stroke();
      ctx.restore();

      // 3) 高对比明黄底黑边引导横幅
      const needMore = Math.max(1, targetB - onBoardScore);
      const guideTxt = cnt === 0
        ? (isEarlyLevel ? '点击或按住车顶这里，把排队乘客塞上车！' : '点击或拖拽车顶放人')
        : `再点车顶塞人！（还差 ${needMore} 分达 B 级过关，满后点右下发车）`;
      ctx.font = `900 ${isEarlyLevel ? 14.5 : 13.5}px ${FONT}`;
      const gw = Math.max(250, ctx.measureText(guideTxt).width + 36);
      const gh = isEarlyLevel ? 34 : 28;
      const gx = -gw / 2;
      const gy = TRAIN.roofY - 82 + bounce * 0.4;
      ctx.fillStyle = '#FACC15';
      rrect(ctx, gx, gy, gw, gh, 12);
      ctx.fill();
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = '#1E293B';
      ctx.textAlign = 'center';
      ctx.fillText(guideTxt, 0, gy + gh / 2 + 5);
      ctx.restore();
    }
    ctx.restore();

    this.drawTunnelsForeground(ctx, world, leftV, rightV);
    if (world.activeWind) this.drawWindStreaks(ctx, world, leftV, rightV);
    if (world.phase === 'running' && world.boosting && !world.braking) {
      this.drawBoostSpeedLines(ctx, world, leftV, rightV);
    }
    this.drawSparksAndConfetti(ctx);
    if (showPlayHud) {
      this.drawStationCrowd(ctx, world, theme, leftV, rightV);
      this.drawPops(ctx);
    }
    ctx.restore();

    if (showPlayHud && this.driverSpeech) {
      this.drawDriverSpeech(ctx, world, leftV, rightV);
    }

    if (this.banner) {
      this.drawBanterBanner(ctx);
    }
  }

  drawSkyAndParallax(ctx, world, theme, leftV, rightV) {
    const x0 = leftV - 160;
    const w = (rightV - leftV) + 320;
    const sky = ctx.createLinearGradient(0, -60, 0, GROUND_Y);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(0.45, theme.sky[1]);
    sky.addColorStop(0.82, theme.sky[2]);
    sky.addColorStop(1, theme.sky[3]);
    ctx.fillStyle = sky;
    ctx.fillRect(x0, -140, w, GROUND_Y + 140);

    // 夜晚星光点点（移除白天突兀的大圆太阳贴片，让天空更通透干净）
    if (theme.isNight) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      for (let i = 0; i < 28; i++) {
        const sx = leftV + ((i * 193) % Math.max(800, rightV - leftV));
        const sy = 36 + (i * 53) % 210;
        const tw = 1.2 + Math.sin(world.time * 3 + i) * 0.7;
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.6, tw), 0, PI2); ctx.fill();
      }
    }

    // 蓬松多层插画白云（慢速视差）
    const cloudSpan = 520;
    const cloudOff = -((world.trainX * 0.06 + world.time * 6) % cloudSpan);
    const startCloud = Math.floor((x0 - cloudOff) / cloudSpan) * cloudSpan + cloudOff;
    ctx.fillStyle = theme.cloudColor;
    for (let x = startCloud; x < rightV + 560; x += cloudSpan) {
      this.drawCloud(ctx, x + 90, 128, 1.0);
      this.drawCloud(ctx, x + 335, 182, 0.78);
    }

    // 远景地标剪影：按关卡主题动态变化（摩天轮游乐园 / 跨海斜拉大桥 / 山谷大风车群 / 标准都市天际线），让每一站沿途风景绝不一成不变！
    const lvIdx = world.level.isEndless ? (((world.level.wave || 1) - 1) % 10) + 1 : (world.level.index || 1);
    const citySpan = 480;
    const cityOff = -(world.trainX * 0.10) % citySpan;
    const startCity = Math.floor((x0 - cityOff) / citySpan) * citySpan + cityOff;
    ctx.fillStyle = theme.cityColor;
    const bldgs = [[20, 96, 48], [76, 134, 42], [126, 82, 54], [210, 148, 46], [266, 104, 58], [344, 124, 44], [398, 92, 50]];
    for (let x = startCity; x < rightV + 520; x += citySpan) {
      if (lvIdx === 7) {
        // 第 7 关【横风跨海桥】：远景宏伟双塔斜拉跨海大桥剪影
        const tx = x + 150;
        const ty = GROUND_Y - 178;
        ctx.fillStyle = theme.cityColor;
        ctx.fillRect(tx - 8, ty, 16, 154);
        ctx.fillRect(tx + 180 - 8, ty, 16, 154);
        ctx.fillRect(x, GROUND_Y - 56, citySpan, 10);
        ctx.strokeStyle = theme.cityColor;
        ctx.lineWidth = 2;
        for (let k = 1; k <= 4; k++) {
          ctx.beginPath();
          ctx.moveTo(tx, ty + 14); ctx.lineTo(tx - k * 28, GROUND_Y - 52);
          ctx.moveTo(tx, ty + 14); ctx.lineTo(tx + k * 22, GROUND_Y - 52);
          ctx.moveTo(tx + 180, ty + 14); ctx.lineTo(tx + 180 - k * 22, GROUND_Y - 52);
          ctx.moveTo(tx + 180, ty + 14); ctx.lineTo(tx + 180 + k * 28, GROUND_Y - 52);
          ctx.stroke();
        }
      } else {
        for (const [bx, bh, bw] of bldgs) {
          rrect(ctx, x + bx, GROUND_Y - bh - 30, bw, bh + 30, 5);
          ctx.fill();
          if (theme.isNight) {
            ctx.fillStyle = 'rgba(254, 240, 138, 0.45)';
            for (let wy = GROUND_Y - bh - 16; wy < GROUND_Y - 56; wy += 16) {
              ctx.fillRect(x + bx + 8, wy, 7, 8);
              ctx.fillRect(x + bx + bw - 16, wy, 7, 8);
            }
            ctx.fillStyle = theme.cityColor;
          }
        }
        // 第 3/6/9 关：远景缓慢旋转的城市巨型摩天轮地标
        if (lvIdx === 3 || lvIdx === 6 || lvIdx === 9) {
          const wx = x + 185;
          const wy = GROUND_Y - 148;
          ctx.save();
          ctx.strokeStyle = theme.isNight ? 'rgba(250, 204, 21, 0.45)' : theme.cityColor;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(wx, wy, 44, 0, PI2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wx - 24, GROUND_Y - 30); ctx.lineTo(wx, wy); ctx.lineTo(wx + 24, GROUND_Y - 30); ctx.stroke();
          ctx.lineWidth = 1.6;
          for (let k = 0; k < 8; k++) {
            const a = world.time * 0.35 + (k / 8) * PI2;
            ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * 44, wy + Math.sin(a) * 44); ctx.stroke();
          }
          ctx.restore();
          ctx.fillStyle = theme.cityColor;
        }
      }
    }

    // 圆润柔和的双层渐变丘陵（告别尖锐暗三角！）
    const hillSpan = 560;
    const farOff = -(world.trainX * 0.16) % hillSpan;
    const startFar = Math.floor((x0 - farOff) / hillSpan) * hillSpan + farOff;
    ctx.fillStyle = theme.hillFar;
    ctx.beginPath();
    ctx.moveTo(startFar, GROUND_Y);
    for (let x = startFar; x < rightV + 640; x += hillSpan) {
      ctx.quadraticCurveTo(x + hillSpan * 0.25, GROUND_Y - 122, x + hillSpan * 0.5, GROUND_Y - 56);
      ctx.quadraticCurveTo(x + hillSpan * 0.78, GROUND_Y - 102, x + hillSpan, GROUND_Y - 30);
    }
    ctx.lineTo(rightV + 640, GROUND_Y);
    ctx.closePath(); ctx.fill();

    const nearSpan = 420;
    const nearOff = -(world.trainX * 0.28) % nearSpan;
    const startNear = Math.floor((x0 - nearOff) / nearSpan) * nearSpan + nearOff;
    ctx.fillStyle = theme.hillNear;
    ctx.beginPath();
    ctx.moveTo(startNear, GROUND_Y);
    for (let x = startNear; x < rightV + 500; x += nearSpan) {
      ctx.quadraticCurveTo(x + nearSpan * 0.3, GROUND_Y - 68, x + nearSpan * 0.55, GROUND_Y - 26);
      ctx.quadraticCurveTo(x + nearSpan * 0.82, GROUND_Y - 52, x + nearSpan, GROUND_Y - 14);
    }
    ctx.lineTo(rightV + 500, GROUND_Y);
    ctx.closePath(); ctx.fill();

    // 第 5/7/8/10 关及有风关卡：近景丘陵上矗立迎风旋转的白色风力大风车群！
    if ((world.level.winds && world.level.winds.length > 0) || lvIdx === 4 || lvIdx === 8) {
      for (let x = startNear; x < rightV + 420; x += nearSpan) {
        const tx = x + 135;
        const ty = GROUND_Y - 118;
        ctx.save();
        ctx.strokeStyle = theme.isNight ? 'rgba(226, 232, 240, 0.55)' : 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(tx, GROUND_Y - 32); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.lineWidth = 2.6;
        const rot = world.time * (world.activeWind ? 4.2 : 1.6) + x * 0.01;
        for (let b = 0; b < 3; b++) {
          const ang = rot + (b * PI2) / 3;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + Math.cos(ang) * 34, ty + Math.sin(ang) * 34);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 铁路接触网电线杆 + 优雅弧形悬垂电线
    const poleSpan = 300;
    const poleOff = -(world.trainX * 0.82) % poleSpan;
    const startPole = Math.floor((x0 - poleOff) / poleSpan) * poleSpan + poleOff;
    ctx.strokeStyle = theme.wireColor;
    ctx.lineWidth = 1.6;
    for (let x = startPole; x < rightV + 340; x += poleSpan) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y - 216);
      ctx.quadraticCurveTo(x + poleSpan * 0.5, GROUND_Y - 196, x + poleSpan, GROUND_Y - 216);
      ctx.stroke();
    }
    ctx.fillStyle = theme.poleColor;
    for (let x = startPole; x < rightV + 340; x += poleSpan) {
      ctx.fillRect(x - 2, GROUND_Y - 224, 5, 224);
      ctx.fillRect(x - 12, GROUND_Y - 218, 26, 4);
    }
  }

  drawCloud(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, PI2);
    ctx.arc(28, -8, 32, 0, PI2);
    ctx.arc(60, 0, 24, 0, PI2);
    ctx.arc(30, 8, 26, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  drawTracksAndStation(ctx, world, theme, leftV, rightV) {
    const x0 = leftV - 160;
    const w = (rightV - leftV) + 320;

    // 暖色插画站台地面直铺底边（不再用黑条压死底部！）
    ctx.fillStyle = theme.ballast;
    ctx.fillRect(x0, GROUND_Y - 2, w, 26);

    const tieOff = -(world.trainX % 44);
    const startTie = Math.floor((x0 - tieOff) / 44) * 44 + tieOff;
    ctx.fillStyle = 'rgba(100, 82, 68, 0.42)';
    for (let x = startTie; x < rightV + 160; x += 44) {
      rrect(ctx, x, GROUND_Y + 4, 20, 5, 1.5);
      ctx.fill();
    }
    // 亮银金属双轨 + 高光
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(x0, GROUND_Y - 3, w, 6);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(x0, GROUND_Y - 3, w, 2);

    const stX = ORIGIN_X - world.trainX;
    const finX = ORIGIN_X + world.level.distance - world.trainX;

    // 1) 站间野外路基与沿途草坪地面（发车离开站台后转为真实铁路沿线野外护坡，不再全程铺车站盲道地砖！）
    const isSunset = theme === SKY_THEMES.sunset;
    const embCurb = theme.isNight ? '#2A334A' : (isSunset ? '#B59B86' : '#C9BEA9');
    const embField = theme.isNight ? '#1E263B' : (isSunset ? '#7D697A' : '#8AB084');
    const embLine = theme.isNight ? 'rgba(148, 163, 184, 0.14)' : 'rgba(71, 85, 105, 0.16)';
    const tuftCol = theme.isNight ? 'rgba(148, 163, 184, 0.16)' : (isSunset ? 'rgba(254, 240, 138, 0.22)' : 'rgba(255, 255, 255, 0.24)');

    ctx.fillStyle = embCurb;
    ctx.fillRect(x0, GROUND_Y + 22, w, 24);
    ctx.fillStyle = embField;
    ctx.fillRect(x0, GROUND_Y + 46, w, VH - GROUND_Y + 120);

    // 路肩石缝与野外滚动草丛/里程纹理，强化行车速度感
    ctx.fillStyle = embLine;
    const embOff = -(world.trainX % 96);
    const startEmb = Math.floor((x0 - embOff) / 96) * 96 + embOff;
    for (let sx = startEmb; sx < rightV + 160; sx += 96) {
      ctx.fillRect(sx, GROUND_Y + 25, 3, 18);
    }
    ctx.fillStyle = tuftCol;
    const tuftOff = -(world.trainX % 180);
    const startTuft = Math.floor((x0 - tuftOff) / 180) * 180 + tuftOff;
    for (let gx = startTuft; gx < rightV + 160; gx += 180) {
      rrect(ctx, gx + 18, GROUND_Y + 72, 26, 6, 3); ctx.fill();
      rrect(ctx, gx + 96, GROUND_Y + 122, 34, 6, 3); ctx.fill();
    }

    // 2) 仅在起点站台与终点站台区间绘制高站台石面、黄线盲道凸点与地砖透视线
    const dotOff = -(world.trainX % 14);
    const startDot = Math.floor((x0 - dotOff) / 14) * 14 + dotOff;
    const tileOff = -(world.trainX % 120);
    const startTile = Math.floor((x0 - tileOff) / 120) * 120 + tileOff;
    const drawPlatformSpan = (pLeft, pRight, clipLeftEdge, clipRightEdge) => {
      const cLeft = Math.max(x0, pLeft);
      const cRight = Math.min(x0 + w, pRight);
      if (cRight <= cLeft) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cLeft, GROUND_Y + 22, cRight - cLeft, VH - GROUND_Y + 120);
      ctx.clip();

      ctx.fillStyle = theme.platformTop;
      ctx.fillRect(cLeft, GROUND_Y + 22, cRight - cLeft, 24);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(cLeft, GROUND_Y + 24, cRight - cLeft, 6);
      ctx.fillStyle = 'rgba(180, 83, 9, 0.35)';
      for (let dx = startDot; dx < cRight + 14; dx += 14) {
        if (dx + 6 >= cLeft) ctx.fillRect(dx, GROUND_Y + 26, 6, 2);
      }
      ctx.fillStyle = theme.platformBody;
      ctx.fillRect(cLeft, GROUND_Y + 44, cRight - cLeft, VH - GROUND_Y + 120);

      ctx.strokeStyle = theme.isNight ? 'rgba(255,255,255,0.06)' : 'rgba(120, 96, 70, 0.14)';
      ctx.lineWidth = 2;
      for (let x = startTile; x < cRight + 120; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 44);
        ctx.lineTo(x - 36, VH + 40);
        ctx.stroke();
      }
      for (const hy of [GROUND_Y + 106, GROUND_Y + 166]) {
        ctx.beginPath();
        ctx.moveTo(cLeft, hy);
        ctx.lineTo(cRight, hy);
        ctx.stroke();
      }
      ctx.fillStyle = theme.isNight ? 'rgba(15, 23, 42, 0.35)' : 'rgba(120, 96, 70, 0.13)';
      ctx.fillRect(cLeft, VH - 16, cRight - cLeft, 16);

      // 站台起止端收口斜面路缘，清晰过渡到野外路基
      ctx.fillStyle = 'rgba(30, 41, 59, 0.32)';
      if (clipLeftEdge) ctx.fillRect(pLeft, GROUND_Y + 22, 6, VH - GROUND_Y + 120);
      if (clipRightEdge) ctx.fillRect(pRight - 6, GROUND_Y + 22, 6, VH - GROUND_Y + 120);
      ctx.restore();
    };

    const depRight = stX + 760;
    if (depRight > leftV - 40) {
      drawPlatformSpan(Math.min(x0, stX - 960), depRight, false, true);
    }
    const arrLeft = finX - 540;
    if (arrLeft < rightV + 40) {
      drawPlatformSpan(arrLeft, Math.max(rightV + 160, finX + 960), true, false);
    }

    // 精致插画感热闹火车站（站房进站口 + 立体雨棚钢架 + 挂钟 + 电子发车屏 + 广播喇叭 + 候车长椅 + 站台地贴！）
    if (stX > leftV - 920 && stX < rightV + 680) {
      ctx.save();
      ctx.translate(stX, GROUND_Y);

      // A) 站台左侧背景：温暖砖白站房与「进站口 · 检票」门廊（呼应左侧涌入的候车人群！）
      const hallWall = theme.isNight ? '#24304B' : '#F3ECE0';
      const hallTrim = theme.isNight ? '#3B4A6B' : '#D9CCBA';
      ctx.fillStyle = hallWall;
      rrect(ctx, -560, -174, 214, 172, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)'; ctx.lineWidth = 2; ctx.stroke();
      // 站房小斜檐顶
      ctx.fillStyle = theme.isNight ? '#475569' : '#B45309';
      rrect(ctx, -570, -184, 234, 16, 6); ctx.fill();
      // 站房拱门进站通道
      ctx.fillStyle = theme.isNight ? '#0F172A' : '#334155';
      rrect(ctx, -492, -108, 78, 106, 12); ctx.fill();
      ctx.fillStyle = theme.isNight ? 'rgba(254, 240, 138, 0.22)' : 'rgba(186, 230, 253, 0.45)';
      rrect(ctx, -486, -102, 66, 98, 9); ctx.fill();
      // 蓝底「进站口 · 检票」站牌
      ctx.fillStyle = '#0284C7';
      rrect(ctx, -504, -142, 102, 24, 6); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 11.5px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('进站口 · 检票', -453, -126);
      // 左侧玻璃窗 + 站房检票小闸机立柱
      ctx.fillStyle = theme.isNight ? 'rgba(254, 240, 138, 0.35)' : '#BAE6FD';
      rrect(ctx, -546, -112, 38, 52, 6); ctx.fill();
      ctx.strokeStyle = hallTrim; ctx.lineWidth = 2; ctx.stroke();
      for (const gx of [-474, -432]) {
        ctx.fillStyle = '#94A3B8'; ctx.fillRect(gx - 4, -34, 8, 32);
        ctx.fillStyle = '#22C55E'; ctx.beginPath(); ctx.arc(gx, -28, 2.8, 0, PI2); ctx.fill();
      }

      // B) 站台右侧背景：候车木长椅 + 竖式站台线路灯箱牌（左右平衡，低饱和不抢列车！）
      ctx.fillStyle = '#475569';
      ctx.fillRect(374, -20, 5, 18); ctx.fillRect(436, -20, 5, 18);
      ctx.fillStyle = '#D97706';
      rrect(ctx, 368, -28, 78, 10, 4); ctx.fill();
      rrect(ctx, 370, -44, 74, 12, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)'; ctx.lineWidth = 1.6;
      rrect(ctx, 368, -28, 78, 10, 4); ctx.stroke();
      // 绿色站台小垃圾桶
      ctx.fillStyle = '#15803D'; rrect(ctx, 456, -34, 18, 32, 4); ctx.fill();
      ctx.fillStyle = '#22C55E'; rrect(ctx, 454, -38, 22, 6, 3); ctx.fill();
      // 竖式线路指示灯箱牌
      ctx.fillStyle = '#334155'; ctx.fillRect(498, -120, 6, 118);
      ctx.fillStyle = theme.isNight ? '#1E293B' : '#FFFDF7';
      rrect(ctx, 476, -158, 52, 64, 8); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#EF4444'; rrect(ctx, 480, -154, 44, 16, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = `900 10px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('9号半线', 502, -142);
      ctx.strokeStyle = '#0284C7'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(490, -126); ctx.lineTo(514, -126); ctx.stroke();
      for (const dx of [490, 502, 514]) {
        ctx.fillStyle = dx === 502 ? '#FACC15' : '#FFFFFF';
        ctx.beginPath(); ctx.arc(dx, -126, 3.5, 0, PI2); ctx.fill();
        ctx.strokeStyle = '#0284C7'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.fillStyle = theme.isNight ? '#CBD5E1' : '#475569';
      ctx.font = `800 9.5px ${FONT}`;
      ctx.fillText('站台方向', 498, -104);
      ctx.beginPath();
      ctx.moveTo(519, -110.5); ctx.lineTo(525, -107); ctx.lineTo(519, -103.5);
      ctx.closePath();
      ctx.fill();

      // C) 立体雨棚立柱 + 斜撑三角钢架
      ctx.fillStyle = '#334155';
      ctx.fillRect(-348, -322, 14, 322);
      ctx.fillRect(334, -322, 14, 322);
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-346, -322, 4, 322);
      ctx.fillRect(336, -322, 4, 322);
      // 经典火车站斜撑钢梁
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-334, -276); ctx.lineTo(-292, -320);
      ctx.moveTo(334, -276); ctx.lineTo(292, -320);
      ctx.stroke();

      // 悬挂暖光站台吊灯（雨棚下方，傍晚/夜间点亮暖黄光晕）
      for (const lampX of [-184, 184]) {
        ctx.fillStyle = '#334155'; ctx.fillRect(lampX - 1.5, -322, 3, 14);
        ctx.fillStyle = '#1E293B';
        ctx.beginPath(); ctx.moveTo(lampX - 13, -304); ctx.lineTo(lampX + 13, -304);
        ctx.lineTo(lampX + 7, -310); ctx.lineTo(lampX - 7, -310); ctx.closePath(); ctx.fill();
        ctx.fillStyle = theme.isNight ? '#FEF08A' : '#FEF9C3';
        ctx.beginPath(); ctx.arc(lampX, -303, 5, 0, Math.PI); ctx.fill();
        if (theme.isNight) {
          const lg = ctx.createRadialGradient(lampX, -296, 4, lampX, -272, 68);
          lg.addColorStop(0, 'rgba(254, 240, 138, 0.30)');
          lg.addColorStop(1, 'rgba(254, 240, 138, 0)');
          ctx.fillStyle = lg;
          ctx.beginPath(); ctx.moveTo(lampX - 12, -302); ctx.lineTo(lampX + 12, -302);
          ctx.lineTo(lampX + 52, -230); ctx.lineTo(lampX - 52, -230); ctx.closePath(); ctx.fill();
        }
      }

      // 雨棚左侧挂钟（真实走针的复古车站圆钟！）
      ctx.fillStyle = '#334155'; ctx.fillRect(-260, -322, 4, 14);
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(-258, -292, 17, 0, PI2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const minAng = -Math.PI / 2 + (world.time * 0.25);
      const hrAng = -Math.PI / 2 + 0.65; // 早高峰 8:15 感！
      ctx.beginPath();
      ctx.moveTo(-258, -292); ctx.lineTo(-258 + Math.cos(hrAng) * 8, -292 + Math.sin(hrAng) * 8);
      ctx.moveTo(-258, -292); ctx.lineTo(-258 + Math.cos(minAng) * 12, -292 + Math.sin(minAng) * 12);
      ctx.stroke();
      ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(-258, -292, 2.2, 0, PI2); ctx.fill();

      // 雨棚右侧悬挂式「电子 LED 发车信息屏」
      ctx.fillStyle = '#334155'; ctx.fillRect(218, -322, 3, 12); ctx.fillRect(284, -322, 3, 12);
      ctx.fillStyle = '#0F172A'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 2.2;
      rrect(ctx, 198, -310, 114, 34, 6); ctx.fill(); ctx.stroke();
      const ledOn = Math.sin(world.time * 5) > -0.2;
      const ledCol = world.phase === 'loading' ? (ledOn ? '#4ADE80' : '#166534') : '#FACC15';
      ctx.fillStyle = ledCol;
      ctx.beginPath(); ctx.arc(209, -298, 3.2, 0, PI2); ctx.fill();
      ctx.fillStyle = '#FACC15'; ctx.font = `900 10px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillText(world.phase === 'loading' ? '检票登车中' : '列车已发车', 217, -295);
      ctx.fillStyle = '#38BDF8'; ctx.font = `800 9.5px ${FONT}`;
      const remCnt = world.poolTotal();
      ctx.fillText(world.phase === 'loading' ? `候车余 ${remCnt} 人` : '祝您旅途愉快', 206, -282);

      // 雨棚角落迷你广播大喇叭 + 柔和声波圈
      ctx.fillStyle = '#64748B'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-332, -292); ctx.lineTo(-318, -299); ctx.lineTo(-318, -283); ctx.closePath();
      ctx.fill(); ctx.stroke();
      if (world.phase === 'loading') {
        const waveCyc = (world.time * 0.9) % 2.4;
        if (waveCyc < 0.9) {
          ctx.save();
          ctx.globalAlpha = (1 - waveCyc / 0.9) * 0.55;
          ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.arc(-316, -291, 6 + waveCyc * 18, -0.55, 0.55); ctx.stroke();
          ctx.restore();
        }
      }

      // 彩色遮雨棚顶（奶油白+红条）
      ctx.fillStyle = '#1E293B';
      rrect(ctx, -378, -342, 756, 22, 8); ctx.fill();
      ctx.fillStyle = '#F8FAFC';
      rrect(ctx, -374, -339, 748, 12, 5); ctx.fill();
      ctx.fillStyle = '#EF4444';
      for (let ax = -360; ax < 350; ax += 60) {
        ctx.fillRect(ax, -339, 28, 12);
      }

      // 立体站台铁牌
      ctx.fillStyle = '#B45309';
      rrect(ctx, -148, -328, 296, 36, 10); ctx.fill();
      ctx.fillStyle = '#FACC15';
      rrect(ctx, -148, -332, 296, 34, 10); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.fillStyle = '#1E293B';
      ctx.font = `900 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`站台 9号半 · ${world.level.name}`, 0, -309);

      // 站台地面车厢导引地贴（下移至月台中景开阔区 y=+98，彻底避开单排候车乘客脚底，丰富中央月台视觉层次！）
      const decalBg = theme.isNight ? 'rgba(255,255,255,0.07)' : 'rgba(120, 96, 70, 0.12)';
      const decalFg = theme.isNight ? 'rgba(255,255,255,0.28)' : 'rgba(100, 80, 58, 0.42)';
      const decalAccent = theme.isNight ? 'rgba(250, 204, 21, 0.32)' : 'rgba(180, 83, 9, 0.30)';
      for (const [dx, label] of [[-52, '2号车厢候车区'], [195, '1号车厢候车区']]) {
        ctx.fillStyle = decalBg;
        rrect(ctx, dx - 68, 86, 136, 26, 8); ctx.fill();
        ctx.strokeStyle = decalAccent; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = decalFg;
        ctx.beginPath();
        ctx.moveTo(dx - 55, 95); ctx.lineTo(dx - 59.5, 102.5); ctx.lineTo(dx - 50.5, 102.5);
        ctx.closePath();
        ctx.fill();
        ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(label, dx + 5, 103);
      }
      ctx.fillStyle = theme.isNight ? 'rgba(255,255,255,0.16)' : 'rgba(120, 96, 70, 0.26)';
      ctx.font = `900 11px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText('9号半站台 · 小心脚下站台缝隙', 72, 146);

      for (const lx of [-210, 0, 210]) {
        const pulse = Math.sin(world.time * (world.phase === 'loading' ? 3.5 : 14) + lx) > 0;
        ctx.fillStyle = world.phase === 'loading' ? (pulse ? '#22C55E' : '#15803D') : (pulse ? '#FACC15' : '#EA580C');
        rrect(ctx, lx - 10, 25, 20, 4, 2); ctx.fill();
      }

      // 深夜春运关卡：雨棚悬挂暖红喜庆霓虹灯笼，气氛拉满！
      if (theme.isNight) {
        for (const lx of [-295, -215, 215, 295]) {
          const glow = 0.35 + 0.15 * Math.sin(world.time * 5 + lx);
          ctx.fillStyle = `rgba(251, 146, 60, ${glow.toFixed(2)})`;
          ctx.beginPath(); ctx.arc(lx, -302, 22, 0, PI2); ctx.fill();
          ctx.fillStyle = '#EF4444'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(lx, -302, 10, 12, 0, 0, PI2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#FACC15'; ctx.fillRect(lx - 5, -315, 10, 3); ctx.fillRect(lx - 5, -291, 10, 3);
        }
      }
      ctx.restore();
    }

    // 场景机制视觉 A：高架上下斜坡段路牌与地面坡向警示箭头（让玩家提前看到前方上坡/下坡！）
    for (const sl of (world.level.slopes || [])) {
      const sx = ORIGIN_X + sl.x - world.trainX;
      const ex = sx + sl.len;
      if (ex < leftV - 140 || sx > rightV + 200) continue;
      const isUp = (sl.grade || 0) > 0;
      ctx.save();
      // 铁轨旁发光斜坡导向带
      ctx.fillStyle = isUp ? 'rgba(249, 115, 22, 0.25)' : 'rgba(56, 189, 248, 0.25)';
      ctx.fillRect(sx, GROUND_Y - 10, sl.len, 10);
      ctx.fillStyle = isUp ? '#FB923C' : '#38BDF8';
      for (let ax = sx + 28; ax < ex - 24; ax += 90) {
        ctx.beginPath();
        if (isUp) {
          ctx.moveTo(ax - 28, GROUND_Y - 22.5); ctx.lineTo(ax - 32.5, GROUND_Y - 14.5); ctx.lineTo(ax - 23.5, GROUND_Y - 14.5);
        } else {
          ctx.moveTo(ax - 28, GROUND_Y - 14.5); ctx.lineTo(ax - 32.5, GROUND_Y - 22.5); ctx.lineTo(ax - 23.5, GROUND_Y - 22.5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.font = `900 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(isUp ? '陡上坡' : '俯冲坡', ax + 4, GROUND_Y - 14);
      }
      // 坡头警示立牌
      if (sx > leftV - 80 && sx < rightV + 80) {
        ctx.translate(sx, GROUND_Y);
        ctx.fillStyle = '#334155'; ctx.fillRect(-3, -108, 6, 108);
        ctx.fillStyle = isUp ? '#F97316' : '#0284C7';
        rrect(ctx, -44, -134, 88, 28, 8); ctx.fill();
        ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.fillStyle = '#FFFFFF'; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(sl.label || (isUp ? '陡上坡段' : '俯冲下坡'), 0, -116);
      }
      ctx.restore();
    }

    // 场景机制视觉 B：铁轨飞坡跳台（黄黑弹簧跳板 + 醒目「飞坡跳台」立牌！）
    for (const rp of (world.level.ramps || [])) {
      const rx = ORIGIN_X + rp.x - world.trainX;
      if (rx < leftV - 140 || rx > rightV + 200) continue;
      ctx.save();
      ctx.translate(rx, GROUND_Y);
      // 铁轨上的黄色楔形跳板
      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(42, -20);
      ctx.lineTo(52, 0);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // 跳板下方的红黄弹簧支座
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(22, -7); ctx.lineTo(14, -11); ctx.lineTo(26, -15);
      ctx.stroke();
      // 飞坡立牌
      ctx.fillStyle = '#334155'; ctx.fillRect(-3, -105, 6, 86);
      ctx.fillStyle = '#FACC15';
      rrect(ctx, -42, -132, 84, 26, 8); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.fillStyle = '#1E293B'; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(`${rp.label || '飞坡跳台'}`, 0, -115);
      ctx.restore();
    }

    // 终点拱门 + 胜利庆祝高空烟花
    if (finX > leftV - 200 && finX < rightV + 320) {
      ctx.save();
      ctx.translate(finX, GROUND_Y);
      ctx.fillStyle = '#059669';
      ctx.fillRect(-8, -310, 16, 310);
      ctx.fillStyle = '#10B981';
      rrect(ctx, -86, -334, 172, 44, 12); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 19px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('终点站', 0, -305);

      // 过关到站时终点站上空绽放绚丽烟花！
      if (world.phase === 'arrived' && world.rankOf(world.finalScore).idx >= 1) {
        const bursts = [[-130, -390, '#FACC15', 0], [110, -420, '#F472B6', 0.45], [-20, -445, '#38BDF8', 0.9]];
        for (const [fx, fy, fcol, off] of bursts) {
          const cyc = (world.settleTime + off) % 1.3;
          const r = 10 + cyc * 46;
          const a = Math.max(0, 1 - cyc / 1.25);
          ctx.save();
          ctx.globalAlpha = a;
          ctx.strokeStyle = fcol; ctx.lineWidth = 3; ctx.lineCap = 'round';
          for (let k = 0; k < 10; k++) {
            const ang = (k / 10) * PI2 + cyc * 0.3;
            ctx.beginPath();
            ctx.moveTo(fx + Math.cos(ang) * r * 0.55, fy + Math.sin(ang) * r * 0.55);
            ctx.lineTo(fx + Math.cos(ang) * r, fy + Math.sin(ang) * r);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  drawMidStopSignals(ctx, world, leftV, rightV) {
    for (const ms of world.midStopStates) {
      const sx = ORIGIN_X + ms.x - world.trainX;
      if (sx < leftV - 140 || sx > rightV + 220) continue;
      ctx.save();
      ctx.translate(sx, GROUND_Y);
      const isGreen = ms.state === 'done';

      // 铁道道口红白条纹起落栏杆（红灯时放下拦路，放行后自动抬起！）
      ctx.save();
      ctx.translate(0, -56);
      ctx.rotate(isGreen ? -1.25 : 0);
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.2;
      rrect(ctx, -124, -6, 130, 12, 5); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#EF4444';
      for (let gx = -124; gx < 10; gx += 26) ctx.fillRect(gx, -6, 13, 12);
      ctx.restore();
      rrect(ctx, -124, -6, 130, 12, 5); ctx.stroke();
      ctx.restore();

      // 信号灯立柱 + 灯箱
      ctx.fillStyle = '#334155'; ctx.fillRect(-5, -245, 10, 245);
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -56, 9, 0, PI2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1E293B';
      rrect(ctx, -18, -280, 36, 68, 9); ctx.fill();
      ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 2.5; ctx.stroke();

      const flashOn = Math.sin(world.time * 16) > 0;
      if (!isGreen && flashOn) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.beginPath(); ctx.arc(0, -260, 24, 0, PI2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, -260, 10, 0, PI2);
      ctx.fillStyle = isGreen ? '#334155' : (flashOn ? '#FF3B4E' : '#DC2626');
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, -230, 10, 0, PI2);
      ctx.fillStyle = isGreen ? '#22C55E' : '#334155';
      ctx.fill();

      if (!isGreen) {
        ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#1E293B';
        ctx.strokeText('红灯急停', 0, -292);
        ctx.fillStyle = '#FEF08A'; ctx.fillText('红灯急停', 0, -292);
      }
      ctx.restore();
    }
  }

  drawWindStreaks(ctx, world, leftV, rightV) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.56)';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    const span = rightV - leftV + 220;
    for (let i = 0; i < 16; i++) {
      const seed = (i * 197.3 + world.time * 920) % span;
      const x = rightV + 80 - seed;
      const y = 95 + (i * 27) % 320;
      const len = 72 + (i % 4) * 28;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y + 6); ctx.stroke();
    }
    // 强阵风区飞舞落叶与翻滚塑料袋（短视频一眼看出狂风来袭！）
    const leafCols = ['#22C55E', '#F97316', '#FACC15', '#84CC16'];
    for (let i = 0; i < 10; i++) {
      const seed = (i * 163.7 + world.time * 740) % span;
      const lx = rightV + 70 - seed;
      const ly = 120 + (i * 41) % 310 + Math.sin(world.time * 8 + i) * 18;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(world.time * 7 + i * 1.4);
      if (i % 4 === 0) {
        // 半透明翻滚早市红白塑料袋
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0, 0, PI2); ctx.fill(); ctx.stroke();
      } else {
        // 旋转绿/橘树叶
        ctx.fillStyle = leafCols[i % leafCols.length];
        ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 4.2, 0, 0, PI2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** 手动加速时的动感高速速度线 */
  drawBoostSpeedLines(ctx, world, leftV, rightV) {
    ctx.save();
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.42)';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    const span = rightV - leftV + 220;
    for (let i = 0; i < 12; i++) {
      const seed = (i * 231.7 + world.time * 1350) % span;
      const x = rightV + 100 - seed;
      const y = 110 + (i * 39) % 370;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 110, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawTrainBody(ctx, world, skin, doorHintTimer) {
    const { halfW, roofY, floorY, noseW, noseY, tailW, tailY } = TRAIN;
    const h = floorY - roofY;

    // 接地投影
    ctx.fillStyle = 'rgba(15, 23, 42, 0.30)';
    ctx.beginPath();
    ctx.ellipse(0, -2, halfW + 48, 11, 0, 0, PI2);
    ctx.fill();

    const gripLv = (world.upgrades && world.upgrades.gripLv) || 0;
    const springLv = (world.upgrades && world.upgrades.springLv) || 0;
    const staminaLv = (world.upgrades && world.upgrades.staminaLv) || 0;
    const totalUpLv = gripLv + springLv + staminaLv;

    // 立体车轮 + 旋转辐条 + 车库【减震弹簧】升级外观变化（Lv.1+ 车轮上方装备可视金橙螺旋避震器，等级越高避震器越粗壮！）
    const wheelAngle = world.trainX / 22;
    for (const wx of [-210, -135, 135, 210]) {
      if (springLv > 0) {
        ctx.save();
        ctx.translate(wx, -34);
        const coilCol = springLv >= 4 ? '#FACC15' : '#FB923C';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 5.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-7, -10); ctx.lineTo(7, -6); ctx.lineTo(-7, -2); ctx.lineTo(7, 2); ctx.lineTo(-7, 6);
        ctx.stroke();
        ctx.strokeStyle = coilCol;
        ctx.lineWidth = 2.6 + Math.min(1.5, springLv * 0.25);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(wx, -18);
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, PI2);
      ctx.fillStyle = '#334155'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = springLv >= 3 ? '#FACC15' : '#CBD5E1'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 19.5, 0, PI2);
      ctx.lineWidth = 2.4; ctx.strokeStyle = '#1E293B'; ctx.stroke();
      ctx.rotate(wheelAngle);
      ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
      ctx.moveTo(0, -12); ctx.lineTo(0, 12);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, PI2);
      ctx.fillStyle = skin.stripe; ctx.fill();
      ctx.restore();
    }

    // 车尾爬梯与尾栏（与涂装色调呼应，横档严格在 tailY 框内，绝不悬空冒黑点！）
    ctx.fillStyle = skin.bodyBot || '#475569';
    rrect(ctx, -halfW - tailW, tailY, tailW + 6, floorY - tailY, 6); ctx.fill();
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.8; ctx.stroke();
    ctx.strokeStyle = skin.stripe || '#E2E8F0';
    ctx.lineWidth = 2.4;
    for (let ly = tailY + 14; ly < floorY - 10; ly += 18) {
      ctx.beginPath(); ctx.moveTo(-halfW - tailW + 5, ly); ctx.lineTo(-halfW - 2, ly); ctx.stroke();
    }

    // 车头防撞台阶（涂装色 + 急刹瞪眼 / 超载冒汗！）
    ctx.fillStyle = skin.nose;
    rrect(ctx, halfW - 4, noseY, noseW + 4, floorY - noseY, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rrect(ctx, halfW, noseY + 4, noseW - 6, 12, 5); ctx.fill();
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 3.2;
    rrect(ctx, halfW - 4, noseY, noseW + 4, floorY - noseY, 12); ctx.stroke();

    const headX = halfW + noseW - 8;
    const headY = noseY + 22;
    if (world.braking) {
      ctx.beginPath(); ctx.arc(headX, headY, 11, 0, PI2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(headX + 2.5, headY, 4.4, 0, PI2);
      ctx.fillStyle = '#1E293B'; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(headX, headY, 8.5, 0, PI2);
      ctx.fillStyle = '#FEF08A'; ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = skin.stripe;
    rrect(ctx, halfW + noseW - 8, floorY - 14, 15, 14, 3); ctx.fill();
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2; ctx.stroke();

    // 肉鸽词条【风平浪静】进化外观：车头前方展开半透明弧形天蓝防风能量护罩！
    if (world.hasPerk && world.hasPerk('calmWind')) {
      const shieldPulse = 0.55 + 0.25 * Math.sin((world.time || 0) * 6);
      ctx.save();
      ctx.globalAlpha = shieldPulse;
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(halfW + 10, -82, 86, -0.58 * Math.PI, 0.42 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = '#E0F2FE';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(halfW + 10, -82, 91, -0.52 * Math.PI, 0.36 * Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    // 烟囱 + 车库【全员能量壶】升级外观变化（车顶烟囱旁加装蓝金外置高压能量氮气罐！）
    if (staminaLv > 0) {
      const tankX = halfW - 84;
      const tankY = roofY - 22;
      ctx.fillStyle = staminaLv >= 4 ? '#38BDF8' : '#0284C7';
      rrect(ctx, tankX, tankY, 30, 20, 7); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(tankX + 6, tankY + 2, 5, 16);
      ctx.fillRect(tankX + 19, tankY + 2, 5, 16);
      if (staminaLv >= 3) {
        // 双联能量罐发光压力表
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath(); ctx.arc(tankX + 15, tankY - 4, 4.5, 0, PI2); ctx.fill();
        ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.fillStyle = '#334155';
    rrect(ctx, halfW - 46, roofY - 28, 22, 30, 4); ctx.fill();
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.fillStyle = skin.stripe;
    rrect(ctx, halfW - 50, roofY - 33, 30, 9, 4); ctx.fill();
    ctx.stroke();

    // 车厢主体（顶高光 + 底暗面 + 粗漫画墨线）
    ctx.fillStyle = skin.bodyTop;
    rrect(ctx, -halfW, roofY, halfW * 2, h, 14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rrect(ctx, -halfW + 6, roofY + 4, halfW * 2 - 12, 10, 5); ctx.fill();
    ctx.fillStyle = skin.bodyBot;
    rrect(ctx, -halfW + 2, floorY - 34, halfW * 2 - 4, 32, 8); ctx.fill();
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 3.6;
    rrect(ctx, -halfW, roofY, halfW * 2, h, 14); ctx.stroke();

    // 腰线色带 & 车顶防滑顶条
    if (skin.isGrandSlam) {
      const rg = ctx.createLinearGradient(-halfW + 4, 0, halfW - 4, 0);
      const shift = (world.time * 0.45) % 1;
      rg.addColorStop(0, '#FDE047');
      rg.addColorStop((shift + 0.25) % 1, '#F472B6');
      rg.addColorStop((shift + 0.6) % 1, '#38BDF8');
      rg.addColorStop(1, '#FDE047');
      ctx.fillStyle = rg;
      ctx.fillRect(-halfW + 4, roofY + 15, halfW * 2 - 8, 9);
      // 车尾流动星尘光粒（行驶中更炫目）
      if (world.speed > 20 || world.phase === 'loading') {
        const starCnt = world.speed > 20 ? 7 : 3;
        for (let si = 0; si < starCnt; si++) {
          const prog = ((world.time * 1.6 + si / starCnt) % 1);
          const sx = -halfW - 14 - prog * (world.speed > 20 ? 115 : 40);
          const sy = roofY + 26 + Math.sin(world.time * 5 + si * 2.1) * 28;
          ctx.save();
          ctx.globalAlpha = (1 - prog) * 0.85;
          ctx.fillStyle = si % 2 === 0 ? '#FEF08A' : '#F472B6';
          ctx.beginPath();
          ctx.arc(sx, sy, 3.2 * (1 - prog * 0.5), 0, PI2);
          ctx.fill();
          ctx.restore();
        }
      }
    } else {
      ctx.fillStyle = skin.stripe;
      ctx.fillRect(-halfW + 4, roofY + 15, halfW * 2 - 8, 8);
    }
    ctx.fillStyle = world.gear.superGrip ? '#38BDF8' : (gripLv >= 3 ? '#FACC15' : skin.accent);
    rrect(ctx, -halfW + 10, roofY - 4, halfW * 2 - 20, 7, 3); ctx.fill();
    ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2; ctx.stroke();

    // 车库【车顶防滑漆】升级外观变化（Lv.1+ 车顶铺设黄黑斜纹防滑橡胶齿垫，Lv.3+ 前后加装防滑护栏矮桩！）
    if (gripLv > 0 || world.gear.superGrip) {
      ctx.save();
      rrect(ctx, -halfW + 12, roofY - 4, halfW * 2 - 24, 7, 3);
      ctx.clip();
      ctx.fillStyle = world.gear.superGrip ? 'rgba(255,255,255,0.55)' : '#1E293B';
      const step = gripLv >= 3 ? 18 : 26;
      for (let gx = -halfW + 14; gx < halfW - 14; gx += step) {
        ctx.beginPath();
        ctx.moveTo(gx, roofY - 4);
        ctx.lineTo(gx + 7, roofY - 4);
        ctx.lineTo(gx + 2, roofY + 3);
        ctx.lineTo(gx - 5, roofY + 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      if (gripLv >= 2 || world.gear.superGrip) {
        // 车顶前后防滑护栏矮桩与连杆
        ctx.strokeStyle = world.gear.superGrip ? '#38BDF8' : '#FACC15';
        ctx.lineWidth = 2.4;
        for (const side of [-1, 1]) {
          const rx = side * (halfW - 22);
          ctx.beginPath();
          ctx.moveTo(rx, roofY - 3);
          ctx.lineTo(rx, roofY - 14);
          ctx.lineTo(rx - side * 34, roofY - 14);
          ctx.lineTo(rx - side * 34, roofY - 3);
          ctx.stroke();
        }
      }
    }

    // 超重冒汗动画
    if (world.onBoardCount() >= 22) {
      const dropY = (world.time * 42) % 24;
      ctx.fillStyle = '#7DD3FC';
      ctx.strokeStyle = '#0369A1'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(halfW - 14, roofY + 24 + dropY, 3.6, 5.6, 0, 0, PI2);
      ctx.fill(); ctx.stroke();
    }

    // 6 扇爆满车窗（带斜向玻璃高光）
    const winW = 68; const winH = 48; const winY = roofY + 34;
    for (let i = 0; i < 6; i++) {
      const wx = -halfW + 24 + i * 82;
      ctx.save();
      rrect(ctx, wx, winY, winW, winH, 9);
      ctx.fillStyle = '#334155'; ctx.fill();
      ctx.clip();
      for (let k = 0; k < 4; k++) {
        const f = WINDOW_FACES[(i * 4 + k) % WINDOW_FACES.length];
        const fx = wx + winW * 0.5 + f.dx;
        const fy = winY + winH * 0.52 + f.dy;
        ctx.fillStyle = f.shirt;
        ctx.beginPath(); ctx.arc(fx, fy + 16, f.r * 1.15, Math.PI, 0); ctx.fill();
        ctx.fillStyle = f.tone;
        ctx.beginPath(); ctx.arc(fx, fy, f.r, 0, PI2); ctx.fill();
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(fx - 3.5, fy - 2, 1.8, 1.8);
        ctx.fillRect(fx + 1.7, fy - 2, 1.8, 1.8);
        ctx.strokeStyle = '#7C2D12';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(fx, fy + 1.2, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      // 玻璃斜向高光带
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(wx + 12, winY); ctx.lineTo(wx + 26, winY);
      ctx.lineTo(wx + 10, winY + winH); ctx.lineTo(wx - 4, winY + winH);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.strokeStyle = skin.stripe; ctx.lineWidth = 2.6;
      rrect(ctx, wx, winY, winW, winH, 9); ctx.stroke();
    }

    // 2 处车门竖杆扶手（当选中或当前排头为挂壁娃、或第 3 关初登场提示时，持续脉冲绿光高亮！）
    const isAcrobatNext = world.phase === 'loading' && (
      world.squadFilter === 'acrobat' ||
      (world.squadFilter === 'mix' && (
        (world.queue && world.queue[0] === 'acrobat') ||
        ((!world.queue || world.queue.length === 0) && world.pool && world.pool.acrobat > 0)
      ))
    );
    for (const dx of DOOR_BAR_XS) {
      ctx.save();
      if (doorHintTimer > 0 || isAcrobatNext) {
        const glowA = 0.28 + 0.36 * Math.sin((world.time || 0) * 10);
        ctx.strokeStyle = `rgba(74, 222, 128, ${glowA.toFixed(2)})`;
        ctx.lineWidth = 18; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(dx, -118); ctx.lineTo(dx, -56); ctx.stroke();
      }
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 8.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(dx, -118); ctx.lineTo(dx, -56); ctx.stroke();
      ctx.strokeStyle = skin.stripe; ctx.lineWidth = 4.2; ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = skin.accent;
    ctx.font = `900 12px ${FONT}`;
    ctx.textAlign = 'center';
    const modTag = totalUpLv > 0 ? ` · 改装+${totalUpLv}` : '';
    ctx.fillText(`超载快车 · ${skin.name}${modTag}`, 0, floorY - 11);
  }

  drawAnchors(ctx, world) {
    // 仅绘制车顶防滑条上的小扶手扣，不绘制车底/侧面/车头/车门内部物理隐藏判定锚点，消除车体上的突兀黑圈点！
    const pulse = 0.5 + 0.5 * Math.sin(world.beatPhase * PI2);
    for (const a of TRAIN_ANCHORS) {
      if (a.kind !== 'roof') continue;
      ctx.beginPath();
      ctx.arc(a.x, a.y, world.phase === 'loading' ? 3.2 + pulse * 0.6 : 2.5, 0, PI2);
      ctx.fillStyle = '#FEF08A';
      ctx.fill();
      ctx.strokeStyle = '#B45309'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  drawPeople(ctx, world) {
    const byId = new Map();
    for (const p of world.people) byId.set(p.id, p);

    for (const p of world.people) {
      if (p.flying || p.fallen) continue;
      for (const g of p.grips) {
        const pt = g.myPart === 0 ? p.p0 : p.p1;
        let tx; let ty; let target = null;
        if (g.kind === 'anchor') { tx = g.anchor.x; ty = g.anchor.y; }
        else {
          target = byId.get(g.targetId);
          if (!target) continue;
          const tpt = g.targetPart === 0 ? target.p0 : target.p1;
          tx = g.kind === 'basket' ? tpt.x + (g.side || 1) * 23 : tpt.x;
          ty = g.kind === 'basket' ? tpt.y - 6 : tpt.y;
        }
        const s = Math.min(1.2, g.strain);
        const mx = (pt.x + tx) * 0.5 + (s > 0.7 ? (Math.random() - 0.5) * 4 : 0);
        const my = (pt.y + ty) * 0.5 + 4 + (s > 0.7 ? (Math.random() - 0.5) * 4 : 0);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.quadraticCurveTo(mx, my, tx, ty);
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = s > 0.82 ? 7.5 : 6.0;
        ctx.stroke();

        let ropeCol = '#FFFFFF';
        if (s > 0.82) ropeCol = '#FF3B4E';
        else if (g.kind === 'basket') ropeCol = '#FB923C';
        else if (target && target.typeId === 'fat') ropeCol = '#FACC15';
        else if (p.typeId === 'tall' && g.kind === 'person') ropeCol = '#C084FC';
        else if (s > 0.45) ropeCol = '#FDE047';

        ctx.strokeStyle = ropeCol;
        ctx.lineWidth = (target && target.typeId === 'fat') || g.kind === 'basket' ? 4.0 : (s > 0.82 ? 4.2 : 3.2);
        ctx.stroke();
        // 肉鸽【竹竿钢筋】进化：紫色跨堆拉索内置高亮银白钢筋芯线！
        if (p.typeId === 'tall' && g.kind === 'person' && world.hasPerk && world.hasPerk('steelTall')) {
          ctx.strokeStyle = '#F8FAFC';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    for (const p of world.people) {
      this.drawSinglePerson(ctx, p, 1.0, world.time, world.speed, world);
    }
  }

  drawSinglePerson(ctx, p, alpha = 1.0, time = 0, speed = 0, world = null) {
    const { spec, p0, p1 } = p;
    const hasIronFat = Boolean(world && world.hasPerk && world.hasPerk('ironFat') && spec.id === 'fat');
    const hasSteelTall = Boolean(world && world.hasPerk && world.hasPerk('steelTall') && spec.id === 'tall');
    const hasMegaBasket = Boolean(world && world.hasPerk && world.hasPerk('megaBasket') && spec.id === 'auntie');
    const hasGlue502 = Boolean(world && world.hasPerk && world.hasPerk('glue502'));
    const hasEnergyDrink = Boolean(world && world.hasPerk && world.hasPerk('energyDrink'));
    const perkLv = (world && world.getPerkLevel)
      ? (hasIronFat ? world.getPerkLevel('ironFat') : hasSteelTall ? world.getPerkLevel('steelTall') : hasMegaBasket ? world.getPerkLevel('megaBasket') : 0)
      : 0;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const bodyLen = Math.max(8, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx) + Math.PI / 2;
    const mood = p.fallen ? 'panic' : p.mood;
    const cheering = mood === 'cheer';
    // 胜利欢呼原地快乐蹦跳！
    const cheerJump = cheering ? -Math.abs(Math.sin(time * 11 + (p.id || 0) * 1.3)) * 13 : 0;
    const mx = (p0.x + p1.x) * 0.5;
    const my = (p0.y + p1.y) * 0.5 + cheerJump;
    const y0 = p0.y + cheerJump;
    const y1 = p1.y + cheerJump;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 肉鸽【冰镇功能饮】进化：全员环绕冰蓝能量护体光环
    if (hasEnergyDrink && !p.fallen) {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mx, my - 2, spec.r0 * 1.45, 0, PI2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 1) 清晰比例双腿 + 特色鞋袜（肉鸽【铁鞋胖叔】进化为银灰铆钉磁力钢铁重靴！）
    const isWaiter = Boolean(p.waiting);
    const kickFreq = p.fallen ? 24 : cheering ? 11 : isWaiter ? (speed > 40 ? 14 : 3) : (speed > 80 ? 15 : 5);
    const kickAmp = p.fallen ? 10 : cheering ? 4 : isWaiter ? (speed > 40 ? 6 : 0.6) : (p.grips && p.grips.length === 0 ? 7 : speed > 120 ? 5 : 1.5);
    const legLen = spec.id === 'tall' ? 20 : spec.id === 'fat' ? 11 : Math.max(10, spec.r0 * 0.78);
    const phase = time * kickFreq + (p.id || 0) * 1.7;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const hipX = p0.x + side * (spec.id === 'fat' ? 12 : spec.id === 'thin' ? 4.5 : spec.r0 * 0.44);
      const hipY = y0 + spec.r0 * 0.32;
      const swing = Math.sin(phase + (side > 0 ? Math.PI : 0)) * kickAmp;
      const footX = hipX + side * (cheering ? 5 : 2.5) + swing - (isWaiter ? 0 : Math.min(6, speed * 0.012));
      const footY = hipY + legLen;
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = spec.id === 'fat' ? 8.2 : spec.id === 'tall' ? 4.4 : 5.2;
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(footX, footY); ctx.stroke();
      ctx.strokeStyle = spec.pants; ctx.lineWidth = spec.id === 'fat' ? 4.8 : spec.id === 'tall' ? 2.2 : 2.6;
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(footX, footY); ctx.stroke();
      if (hasIronFat) {
        // 铁鞋胖叔：脚底蓝色磁力吸盘光圈 + 银白重装甲铁靴
        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.beginPath(); ctx.ellipse(footX + 2.5, footY + 3.5, 10.5, 3.5, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = '#E2E8F0';
        ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.ellipse(footX + 2.5, footY + 1, 8.8, 4.8, 0, 0, PI2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FACC15';
        ctx.beginPath(); ctx.arc(footX + 2.5, footY + 0.5, 1.8, 0, PI2); ctx.fill();
      } else {
        // 卡通鞋
        ctx.fillStyle = spec.id === 'thin' ? '#EF4444' : spec.id === 'acrobat' ? '#F8FAFC' : spec.id === 'fat' ? '#78350F' : '#1E293B';
        ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(footX + 2.5, footY + 1, spec.id === 'fat' ? 7.2 : 5.2, 3.8, 0, 0, PI2); ctx.fill(); ctx.stroke();
      }
    }

    // 2) 分节摆动手臂（肉鸽【竹竿钢筋】进化为银紫液压机械钢筋臂；【502强力胶】双手泛金胶光环！）
    const waving = cheering || p.fallen || (!isWaiter && p.grips && p.grips.length === 0) || mood === 'panic';
    const armLen = spec.id === 'tall' ? 36 : spec.id === 'fat' ? 15 : 14;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const shX = p1.x + side * (spec.id === 'fat' ? 17 : spec.id === 'thin' ? 6.5 : spec.r1 * 0.78);
      const shY = y1 + 4;
      let handX; let handY; let elbowX; let elbowY;
      if (cheering) {
        const wave = Math.sin(time * 16 + (p.id || 0) + side) * 6;
        handX = shX + side * (armLen * 0.72) + wave;
        handY = shY - armLen * 1.05;
        elbowX = (shX + handX) * 0.5 + side * 4;
        elbowY = (shY + handY) * 0.5 + 3;
      } else {
        const waveA = waving
          ? -Math.PI * 0.42 * side + Math.sin(time * 20 + (p.id || 0) + side) * 0.45
          : side * 0.65;
        handX = shX + Math.sin(waveA) * armLen;
        handY = shY + (waving ? -Math.abs(Math.cos(waveA)) * armLen * 0.65 : Math.cos(waveA) * armLen * 0.72);
        elbowX = (shX + handX) * 0.5 + side * (spec.id === 'tall' ? 8 : 2);
        elbowY = (shY + handY) * 0.5 + (spec.id === 'tall' ? 6 : 1);
      }
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = spec.id === 'fat' ? 7.6 : (hasSteelTall ? 7.0 : (spec.id === 'tall' ? 4.8 : 5.8));
      ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(elbowX, elbowY); ctx.lineTo(handX, handY); ctx.stroke();
      ctx.strokeStyle = hasSteelTall ? '#E2E8F0' : (spec.id === 'fat' ? '#FFFFFF' : spec.shirt);
      ctx.lineWidth = spec.id === 'fat' ? 4.2 : (hasSteelTall ? 3.8 : (spec.id === 'tall' ? 2.4 : 3.0));
      ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(elbowX, elbowY); ctx.lineTo(handX, handY); ctx.stroke();
      if (hasSteelTall) {
        // 机械钢筋肘关节金环
        ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(elbowX, elbowY, 3.2, 0, PI2); ctx.fill(); ctx.stroke();
      }
      if (hasGlue502) {
        // 502 强力胶：手掌金色粘合光圈
        ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
        ctx.beginPath(); ctx.arc(handX, handY, 6.2, 0, PI2); ctx.fill();
      }
      // 小手（挂壁娃超大白攀岩绷带手，手机端一眼识别！）
      ctx.fillStyle = hasGlue502 ? '#FDE047' : (spec.id === 'acrobat' ? '#F8FAFC' : spec.skin);
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(handX, handY, spec.id === 'acrobat' ? 4.8 : 3.6, 0, PI2); ctx.fill(); ctx.stroke();
    }

    // 瘦猴专属：脖子后方迎风狂飘的亮黄小围巾（极轻感拉满！）
    if (spec.id === 'thin') {
      const fl = Math.sin(time * 15 + (p.id || 0)) * (speed > 40 ? 6 : 2.5);
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 6.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x - 4, y1 + 1);
      ctx.quadraticCurveTo(p1.x - 14, y1 + 3 + fl * 0.5, p1.x - 24, y1 + 6 + fl);
      ctx.stroke();
      ctx.strokeStyle = '#FACC15'; ctx.lineWidth = 3.4;
      ctx.stroke();
    }

    // 3) 极具职业剪影辨识度的 Q 版躯干与服装
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    const halfH = bodyLen * 0.5 + spec.r0 * 0.56;

    if (spec.id === 'fat') {
      // 胖叔：超巨型梨形大肚腩（宽度 1.36x 一眼坦克！）+ 白色老头汗衫 + 蓝工装背带裤 + 两颗明黄大纽扣！
      ctx.beginPath();
      ctx.ellipse(0, 4, spec.r0 * 1.36, halfH * 1.02, 0, 0, PI2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#1D4ED8'; // 蓝色背带工装裤
      ctx.fillRect(-spec.r0 * 1.6, -2, spec.r0 * 3.2, halfH * 1.4);
      ctx.fillRect(-15, -halfH, 8, halfH * 1.25);
      ctx.fillRect(7, -halfH, 8, halfH * 1.25);
      // 两颗亮黄工装大纽扣 + 胸前小兜
      ctx.fillStyle = '#FACC15';
      ctx.beginPath(); ctx.arc(-11, 1, 3.6, 0, PI2); ctx.arc(11, 1, 3.6, 0, PI2); ctx.fill();
      ctx.fillStyle = '#1E40AF'; rrect(ctx, -8, 4, 16, 10, 2); ctx.fill();
      const wob = Math.sin(time * 12 + (p.id || 0)) * (speed > 50 ? 2 : 0.5);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.ellipse(-7, 6 + wob, 7, 5, -0.2, 0, PI2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.9; ctx.stroke();
    } else if (spec.id === 'tall') {
      // 竹竿：筷子般超细长身形 + 紫白条纹针织衫
      const tw = 7.0;
      rrect(ctx, -tw, -halfH * 0.90, tw * 2, halfH * 1.85, 6);
      ctx.fillStyle = spec.shirt; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = spec.pants;
      ctx.fillRect(-tw - 2, halfH * 0.28, tw * 2 + 4, halfH);
      ctx.fillStyle = 'rgba(248, 250, 252, 0.90)';
      for (let sy = -halfH * 0.70; sy < halfH * 0.24; sy += 9.0) {
        ctx.fillRect(-tw - 2, sy, tw * 2 + 4, 3.8);
      }
      ctx.restore();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.6; ctx.stroke();
    } else {
      const topW = spec.id === 'acrobat' ? spec.r1 * 1.12 : spec.id === 'thin' ? spec.r1 * 0.72 : spec.r1 * 0.96;
      const botW = spec.id === 'auntie' ? spec.r0 * 1.22 : spec.id === 'acrobat' ? spec.r0 * 0.76 : spec.id === 'thin' ? spec.r0 * 0.74 : spec.r0 * 0.94;
      ctx.beginPath();
      ctx.moveTo(-topW, -halfH * 0.68);
      ctx.quadraticCurveTo(0, -halfH, topW, -halfH * 0.68);
      ctx.quadraticCurveTo(botW * 1.12, 0, botW * 0.95, halfH * 0.72);
      ctx.quadraticCurveTo(0, halfH * 1.05, -botW * 0.95, halfH * 0.72);
      ctx.quadraticCurveTo(-botW * 1.12, 0, -topW, -halfH * 0.68);
      ctx.closePath();
      ctx.fillStyle = spec.shirt; ctx.fill();

      ctx.save(); ctx.clip();
      ctx.fillStyle = spec.pants;
      ctx.fillRect(-botW * 1.3, halfH * 0.16, botW * 2.6, halfH);

      if (spec.id === 'thin') {
        // 瘦猴：斜挎帆布快递小包带 + 小包兜
        ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(-topW, -halfH * 0.6); ctx.lineTo(botW, halfH * 0.25); ctx.stroke();
        ctx.fillStyle = '#F59E0B'; rrect(ctx, 1, 2, 8, 8, 2); ctx.fill();
      } else if (spec.id === 'acrobat') {
        // 挂壁娃：功夫斜襟白领 + 醒目红布腰带
        ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-topW * 0.7, -halfH * 0.6); ctx.lineTo(topW * 0.4, halfH * 0.1); ctx.stroke();
        ctx.fillStyle = '#EF4444'; ctx.fillRect(-botW * 1.2, halfH * 0.08, botW * 2.4, 5);
      } else if (spec.id === 'auntie') {
        // 大妈：暖白格子围裙 + 碎花小口袋
        ctx.fillStyle = '#FEF3C7';
        rrect(ctx, -botW * 0.62, -halfH * 0.18, botW * 1.24, halfH * 0.98, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-4, 14); ctx.moveTo(4, -2); ctx.lineTo(4, 14); ctx.stroke();
        ctx.fillStyle = '#FB7185';
        ctx.beginPath(); ctx.arc(-4, 3, 2.2, 0, PI2); ctx.arc(5, 8, 2.2, 0, PI2); ctx.fill();
      } else if (spec.id === 'vip') {
        // VIP：黑金礼服白衬衫 + 大红领带 + 金色怀表链
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.moveTo(-6, -halfH * 0.85); ctx.lineTo(6, -halfH * 0.85); ctx.lineTo(0, halfH * 0.05); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#EF4444';
        ctx.beginPath(); ctx.moveTo(0, -halfH * 0.72); ctx.lineTo(-3.2, -halfH * 0.05); ctx.lineTo(0, halfH * 0.16); ctx.lineTo(3.2, -halfH * 0.05); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#FEF08A'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(4, 4, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.7; ctx.stroke();
    }
    ctx.restore();

    // 4) 大妈双侧超醒目巨型菜篮（肉鸽【巨无霸菜篮】进化时真实放大至 1.6x 并张开金色安全网光环！）
    if (spec.basketCatch) {
      const bScale = hasMegaBasket ? (1.56 + Math.max(0, perkLv - 1) * 0.14) : 1.18;
      const bSpan = hasMegaBasket ? 30 : 25;
      if (hasMegaBasket && !isWaiter) {
        const netPulse = 0.22 + 0.14 * Math.sin(time * 6 + (p.id || 0));
        ctx.fillStyle = `rgba(250, 204, 21, ${netPulse.toFixed(2)})`;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
        ctx.lineWidth = 1.6;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(p0.x + s * bSpan, y0 - 6, 18 * (bScale / 1.5), 13 * (bScale / 1.5), 0, 0, PI2);
          ctx.fill();
          ctx.stroke();
        }
      }
      drawVeggieBasket(ctx, p0.x - bSpan, y0 - 5, bScale);
      drawVeggieBasket(ctx, p0.x + bSpan, y0 - 5, bScale);
    }

    // 5) VIP 闪亮镀金大公文包
    if (spec.id === 'vip') {
      const cx = p0.x + 18;
      const cy = y0 + 1;
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.4;
      rrect(ctx, cx - 10.5, cy - 7, 21, 15, 3.5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.0;
      ctx.beginPath(); ctx.arc(cx, cy - 7, 4, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(cx - 2.5, cy - 1, 5, 3.5);
    }

    // 6) 头部（带明确短脖颈衔接）
    ctx.save();
    ctx.translate(p1.x, y1 - spec.r1 * 0.45);
    ctx.rotate(ang * 0.45);
    const hr = Math.max(10.2, spec.r1 * 0.90);
    drawCharacterHead(ctx, spec, hr, mood, time, p.id || 0, false);

    // 肉鸽专属角色进化星级徽章（铁鞋胖叔 / 竹竿钢筋 / 巨无霸菜篮激活时头顶亮起矢量金星徽章！）
    if (perkLv > 0 && alpha > 0.7 && !isWaiter) {
      const nStars = Math.min(3, perkLv);
      ctx.fillStyle = hasIronFat ? '#EF4444' : hasSteelTall ? '#9333EA' : '#EA580C';
      rrect(ctx, -14, -hr - 25, 28, 13, 6);
      ctx.fill();
      ctx.strokeStyle = '#FEF08A'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#FEF08A';
      const spacing = 7.5;
      const sx0 = -((nStars - 1) * spacing) / 2;
      for (let si = 0; si < nStars; si++) {
        const sx = sx0 + si * spacing;
        const sy = -hr - 18.5;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const ang = -Math.PI / 2 + (k * Math.PI) / 5;
          const sr = k % 2 === 0 ? 3.3 : 1.45;
          const px = sx + Math.cos(ang) * sr;
          const py = sy + Math.sin(ang) * sr;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // 胜利欢呼时头顶冒出跃动小金星！
    if (cheering && alpha > 0.7) {
      const starY = -hr - 14 - Math.abs(Math.sin(time * 9 + (p.id || 0))) * 7;
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, starY - 6); ctx.lineTo(2, starY - 2); ctx.lineTo(6, starY);
      ctx.lineTo(2, starY + 2); ctx.lineTo(0, starY + 6); ctx.lineTo(-2, starY + 2);
      ctx.lineTo(-6, starY); ctx.lineTo(-2, starY - 2); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    if (spec.id === 'vip' && alpha > 0.7) {
      ctx.fillStyle = '#FACC15';
      rrect(ctx, -15, -hr - 27, 30, 15, 7); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = '#111827'; ctx.font = `900 10px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText('×3', 0, -hr - 16);
    }

    ctx.restore();
    ctx.restore();
  }

  drawPlacementPreview(ctx, world, pt) {
    const cx = Math.max(-TRAIN.halfW - 55, Math.min(TRAIN.halfW + 65, pt.x));
    const cy = Math.max(-440, Math.min(-42, pt.y));
    const form = world.previewFormation(cx, cy);
    if (!form.length) return;

    ctx.save();
    for (const slot of form) {
      const spec = TYPE_MAP[slot.typeId];
      this.drawSinglePerson(ctx, {
        id: 0, spec,
        p0: { x: slot.x, y: slot.y }, p1: { x: slot.x, y: slot.y - spec.bone },
        grips: [], mood: 'happy',
      }, 0.46, world.time, 0);
    }
    ctx.restore();
  }

  drawTunnelsForeground(ctx, world, leftV, rightV) {
    if (!world.level.tunnels.length) return;
    for (const tun of world.level.tunnels) {
      const left = ORIGIN_X + tun.x - world.trainX;
      const right = left + tun.len;
      if (right < leftV - 100 || left > rightV + 140) continue;

      const beamBottom = GROUND_Y + tun.clearY;
      ctx.save();
      // 暖灰混凝土桥身 + 描边
      ctx.fillStyle = '#475569';
      ctx.fillRect(left, -80, tun.len, Math.max(0, beamBottom + 80));
      ctx.fillStyle = '#334155';
      ctx.fillRect(left, beamBottom - 36, tun.len, 18);
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 3;
      ctx.strokeRect(left, -80, tun.len, Math.max(0, beamBottom + 80));

      // 黄黑警戒条
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(left, beamBottom - 18, tun.len, 18);
      ctx.save();
      ctx.beginPath(); ctx.rect(left, beamBottom - 18, tun.len, 18); ctx.clip();
      ctx.fillStyle = '#1E293B';
      for (let sx = left - 20; sx < right + 20; sx += 26) {
        ctx.beginPath();
        ctx.moveTo(sx, beamBottom); ctx.lineTo(sx + 12, beamBottom);
        ctx.lineTo(sx + 22, beamBottom - 18); ctx.lineTo(sx + 10, beamBottom - 18);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2.5;
      ctx.strokeRect(left, beamBottom - 18, tun.len, 18);

      // 桥墩纵影
      ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.fillRect(left, beamBottom, 16, GROUND_Y - beamBottom);
      ctx.fillRect(right - 16, beamBottom, 16, GROUND_Y - beamBottom);

      // 醒目限高牌
      ctx.fillStyle = '#1E293B';
      rrect(ctx, left + tun.len * 0.5 - 54, beamBottom - 46, 108, 24, 6); ctx.fill();
      ctx.fillStyle = '#FEF08A';
      ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(tun.label, left + tun.len * 0.5, beamBottom - 29);
      ctx.restore();
    }
  }

  /** 站台长单排一字排开候车队伍：从左侧进站口一直排到排头，一簇一簇清晰无遮挡、零跳行！ */
  drawStationCrowd(ctx, world, theme, leftV = 0, rightV = VW) {
    const line = world.stationLine || [];
    const shiftX = ORIGIN_X - world.trainX;
    if (world.phase !== 'loading' && shiftX < leftV - 500) return;

    ctx.save();
    // 1) 站台排头「排队处」立牌（随队伍整体左移至排头 #0 右侧 x=shiftX+12，让右侧站台与车头视野更通透！）
    const postX = shiftX + 12;
    if (postX > leftV - 40 && postX < rightV + 40) {
      ctx.fillStyle = '#334155'; ctx.fillRect(postX - 3, GROUND_Y + 4, 6, 46);
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2;
      rrect(ctx, postX - 28, GROUND_Y - 6, 56, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1E293B'; ctx.font = `900 12px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('排队处', postX, GROUND_Y + 9);
    }

    // 2) 长单排一字排开绘制：等待上车的「下一波 1~3 人」明显放大(0.80x)并带金色登车光毯，与后方普通排队人群(0.52x)形成强烈主次对比！
    let offscreenLeft = 0;
    const baseY = GROUND_Y + 38;
    const baseScale = 0.52;
    const frontScale = 0.80;
    const batchCnt = world.phase === 'loading'
      ? (world.level.strictQueue ? 1 : Math.min(world.burstSize || 1, line.length))
      : 0;

    // 下一波候车组脚下的整体暖金登车垫 + 头顶胶囊提示，一眼看清本波几人一起上！
    if (batchCnt > 0 && line.length > 0) {
      let minSx = Infinity;
      let maxSx = -Infinity;
      for (let k = 0; k < batchCnt; k++) {
        const kx = shiftX + line[k].x;
        if (kx < minSx) minSx = kx;
        if (kx > maxSx) maxSx = kx;
      }
      if (maxSx > leftV - 40 && minSx < rightV + 40) {
        const padX = minSx - 22;
        const padW = (maxSx - minSx) + 44;
        const pulse = 0.75 + 0.25 * Math.sin(world.time * 7);
        ctx.save();
        ctx.fillStyle = `rgba(250, 204, 21, ${(0.26 * pulse).toFixed(2)})`;
        ctx.strokeStyle = `rgba(217, 119, 6, ${(0.85 * pulse).toFixed(2)})`;
        ctx.lineWidth = 2;
        rrect(ctx, padX, baseY - 2, padW, 18, 9);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    for (let i = line.length - 1; i >= 0; i--) {
      const w = line[i];
      const sx = shiftX + w.x;
      if (sx < leftV - 55) {
        offscreenLeft++;
        continue;
      }
      if (sx > rightV + 55) continue;
      const spec = TYPE_MAP[w.typeId];
      if (!spec) continue;
      const isNextWave = i < batchCnt;
      const personScale = isNextWave ? frontScale : baseScale;
      const stepBob = w.moving
        ? Math.abs(Math.sin(w.walkPhase)) * (isNextWave ? 5.8 : 4.2)
        : Math.abs(Math.sin(world.time * (isNextWave ? 5.2 : 3.0) + i * 0.7)) * (isNextWave ? 2.6 : 1.1);

      // 即将登车的一波乘客脚下高亮金圈 vs 后方普通排队阴影
      if (isNextWave) {
        ctx.fillStyle = i === 0 ? 'rgba(250, 204, 21, 0.58)' : 'rgba(250, 204, 21, 0.40)';
        ctx.beginPath(); ctx.ellipse(sx, baseY + 10, 17, 5.2, 0, 0, PI2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
        ctx.beginPath(); ctx.ellipse(sx, baseY + 9, 9.5, 2.8, 0, 0, PI2); ctx.fill();
      }

      ctx.save();
      ctx.translate(sx, baseY - stepBob);
      ctx.scale(personScale, personScale);
      this.drawSinglePerson(ctx, {
        id: w.qid,
        spec,
        waiting: true,
        p0: { x: 0, y: 0 },
        p1: { x: 0, y: -spec.bone },
        grips: [],
        mood: world.phase === 'running' ? 'panic' : 'happy',
      }, isNextWave ? 1.0 : 0.90, world.time, w.moving ? 140 : 0);
      ctx.restore();
    }

    // 下一波候车组头顶居中金色跳动指引牌（标明「下一波 ×N 齐上」或「下一位登车」）
    if (world.phase === 'loading' && batchCnt > 0 && line.length > 0) {
      let minSx = Infinity;
      let maxSx = -Infinity;
      let maxHeadH = 38;
      for (let k = 0; k < batchCnt; k++) {
        const kx = shiftX + line[k].x;
        if (kx < minSx) minSx = kx;
        if (kx > maxSx) maxSx = kx;
        const sp = TYPE_MAP[line[k].typeId];
        if (sp) {
          const h = (sp.bone + sp.r1 * 2.3) * frontScale;
          if (h > maxHeadH) maxHeadH = h;
        }
      }
      const midSx = (minSx + maxSx) * 0.5;
      const bounce = Math.sin(world.time * 8) * 3.5;
      const ay = baseY - maxHeadH - 14 - bounce;
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(midSx, ay + 8); ctx.lineTo(midSx - 7, ay); ctx.lineTo(midSx + 7, ay); ctx.closePath();
      ctx.fill(); ctx.stroke();

      const tagTxt = batchCnt > 1 ? `本波 ${batchCnt} 人齐上` : '本波 1 人上车';
      ctx.font = `900 10.5px ${FONT}`;
      const tw = ctx.measureText(tagTxt).width + 14;
      rrect(ctx, midSx - tw / 2, ay - 19, tw, 17, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1E293B'; ctx.textAlign = 'center';
      ctx.fillText(tagTxt, midSx, ay - 6.5);
    }

    // 2.5) 站台排队乘客头顶随机冒出的鲜活漫画说话气泡！
    if (world.phase === 'loading' && this.crowdChatters.length > 0) {
      for (const ch of this.crowdChatters) {
        const wIdx = line.findIndex((it) => it.qid === ch.qid);
        if (wIdx < 0) continue;
        // 避让前排头顶「本波 N 人齐上」指引牌，仅在后方排队人群头顶冒聊天泡泡
        if (wIdx < batchCnt) continue;
        const w = line[wIdx];
        const spec = TYPE_MAP[w.typeId];
        if (!spec) continue;
        const sx = shiftX + w.x;
        // 避让左侧进站人数胶囊（x < 235），杜绝气泡与左胶囊重叠
        if (sx < Math.max(235, leftV + 60) || sx > rightV - 50) continue;
        const elapsed = ch.max - ch.life;
        const popIn = Math.min(1, elapsed / 0.16);
        const fadeOut = Math.min(1, ch.life / 0.32);
        const sc = (0.72 + 0.28 * popIn);

        ctx.save();
        ctx.globalAlpha = fadeOut;
        ctx.font = `900 12.5px ${FONT}`;
        const tw = ctx.measureText(ch.text).width;
        const bw = Math.max(82, tw + 20);
        const bh = 26;
        const headTopY = baseY - (spec.bone + spec.r1 * 2.3) * baseScale - 10;
        const cx = Math.max(leftV + bw / 2 + 12, Math.min(rightV - bw / 2 - 12, sx));
        const by = headTopY - bh - 6 - (1 - popIn) * 6;

        ctx.translate(cx, by + bh);
        ctx.scale(sc, sc);
        // 气泡小尖角指向说话人
        const tipX = Math.max(-bw / 2 + 12, Math.min(bw / 2 - 12, sx - cx));
        ctx.fillStyle = '#FFFDF7';
        ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 2;
        rrect(ctx, -bw / 2, -bh, bw, bh, 11); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tipX - 5, -1); ctx.lineTo(tipX, 6); ctx.lineTo(tipX + 5, -1);
        ctx.closePath();
        ctx.fillStyle = '#FFFDF7'; ctx.fill();
        ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(tipX - 5, 0); ctx.lineTo(tipX, 6); ctx.lineTo(tipX + 5, 0); ctx.stroke();

        ctx.fillStyle = '#1E293B'; ctx.textAlign = 'center';
        ctx.fillText(ch.text, 0, -bh + 17);
        ctx.restore();
      }
    }

    // 3) 左侧屏外进站人数轻提示胶囊（上移至站房拱门高度 GROUND_Y - 56，彻底避开排队乘客头顶！）
    if (world.phase === 'loading' && offscreenLeft > 0) {
      const tip = `进站口 +${offscreenLeft} 人`;
      ctx.font = `900 13px ${FONT}`;
      const tw = ctx.measureText(tip).width + 36;
      const bx = Math.max(12, leftV + 12);
      const by = GROUND_Y - 56;
      ctx.fillStyle = 'rgba(255, 253, 247, 0.95)';
      rrect(ctx, bx, by, tw, 28, 14); ctx.fill();
      ctx.strokeStyle = '#1E293B'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.moveTo(bx + 10, by + 14); ctx.lineTo(bx + 17, by + 9.5); ctx.lineTo(bx + 17, by + 18.5);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillText(tip, bx + 22, by + 19);
    } else if (world.phase === 'loading' && line.length === 0) {
      ctx.fillStyle = 'rgba(255, 253, 247, 0.92)';
      rrect(ctx, ORIGIN_X - 110, GROUND_Y + 24, 220, 28, 14); ctx.fill();
      ctx.fillStyle = '#15803D'; ctx.font = `900 14px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('排队清空！点右下发车！', ORIGIN_X, GROUND_Y + 43);
    }
    ctx.restore();
  }

  drawSmoke(ctx, theme) {
    for (const s of this.smoke) {
      const a = Math.max(0, s.life / s.max);
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, PI2);
      ctx.fillStyle = theme.isNight
        ? `rgba(241, 245, 249, ${(a * 0.38).toFixed(3)})`
        : `rgba(255, 255, 255, ${(a * 0.65).toFixed(3)})`;
      ctx.fill();
    }
  }

  drawSparksAndConfetti(ctx) {
    for (const p of this.sparks) {
      const a = Math.max(0, p.life / p.max);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        ctx.translate(p.x, p.y); ctx.rotate(p.life * 8);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? p.size * 0.42 : p.size;
          const ang = (i / 8) * PI2;
          i ? ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, PI2); ctx.fill();
      }
      ctx.restore();
    }
    for (const c of this.confetti) {
      const a = Math.min(1, c.life / 0.6);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = c.color; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  }

  drawPops(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const p of this.pops) {
      const a = Math.min(1, (p.life / p.max) * 1.4);
      ctx.globalAlpha = a;
      ctx.font = `900 ${p.size}px ${FONT}`;
      ctx.lineWidth = 4.5; ctx.strokeStyle = '#1E293B';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  drawBanterBanner(ctx) {
    const b = this.banner;
    const u = 1 - b.life / b.max;
    const popScale = u < 0.14 ? 0.72 + (u / 0.14) * 0.36 : 1.0;
    const alpha = b.life < 0.28 ? b.life / 0.28 : 1.0;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(VW / 2, 200);
    ctx.scale(popScale, popScale);
    ctx.font = `900 36px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#1E293B';
    ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }

  drawDriverSpeech(ctx, world, leftV = 0, rightV = VW) {
    const ds = this.driverSpeech;
    if (!ds) return;
    const u = 1 - ds.life / Math.max(0.01, ds.max);
    const pop = u < 0.14 ? (0.78 + (u / 0.14) * 0.22) : 1.0;
    const alpha = ds.life < 0.28 ? Math.max(0, ds.life / 0.28) : 1.0;
    const cabX = ORIGIN_X + TRAIN.halfW - 14;
    const cabY = GROUND_Y + (world.bumpY || 0) + TRAIN.roofY - 46;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 13.5px ${FONT}`;
    const tagW = 38;
    const txtW = ctx.measureText(ds.text).width;
    const bw = Math.max(150, tagW + txtW + 28);
    const bh = 34;
    const minX = leftV + 16;
    const maxX = rightV - 16 - bw;
    const bx = Math.max(minX, Math.min(maxX, cabX - bw * 0.45));
    const by = Math.max(90, cabY - bh - 12);
    const cx = bx + bw / 2;
    const cy = by + bh;

    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -cy);

    const tailX = Math.max(bx + 18, Math.min(bx + bw - 18, cabX));
    ctx.fillStyle = '#FFFDF7';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.4;
    rrect(ctx, bx, by, bw, bh, 12);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tailX - 6, by + bh - 1);
    ctx.lineTo(tailX, by + bh + 9);
    ctx.lineTo(tailX + 6, by + bh - 1);
    ctx.closePath();
    ctx.fillStyle = '#FFFDF7';
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tailX - 6, by + bh);
    ctx.lineTo(tailX, by + bh + 9);
    ctx.lineTo(tailX + 6, by + bh);
    ctx.stroke();

    ctx.fillStyle = '#0284C7';
    rrect(ctx, bx + 7, by + 6, tagW, 22, 7);
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.font = `900 11.5px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('司机', bx + 7 + tagW / 2, by + 21);

    ctx.fillStyle = '#1E293B';
    ctx.font = `900 13.5px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(ds.text, bx + 13 + tagW, by + 22);
    ctx.restore();
  }
}
