// 独立处理短视频冲击节奏与搞笑吐槽统一调度；避免撞洞特写与技能失败横幅同帧互盖！
import { SKILL_FAIL_LINES } from './levels.js';

const BONK_KEY = {
  tall: 'tall_bonk',
  acrobat: 'acrobat_bonk',
  vip: 'vip_fail',
};

export class ImpactDirector {
  constructor(stage) {
    this.stage = stage;
    this.cursor = {};
    this.reset();
  }

  reset() {
    this.hitstop = 0;
    this.cooldown = 0;
    this.bannerLock = 0;
    this.beginFrame();
    this.stage.resetImpact();
  }

  get frozen() { return this.hitstop > 1e-9; }

  advance(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bannerLock = Math.max(0, this.bannerLock - dt);
    const frozenTime = Math.min(this.hitstop, dt);
    this.hitstop = Math.max(0, this.hitstop - frozenTime);
    return dt - frozenTime;
  }

  beginFrame() { this.falls = 0; this.fallX = 0; this.fallY = 0; }

  pickBonkText(typeId) {
    const k = BONK_KEY[typeId];
    if (k && SKILL_FAIL_LINES[k]?.length) {
      const arr = SKILL_FAIL_LINES[k];
      const idx = this.cursor[k] || 0;
      this.cursor[k] = idx + 1;
      return arr[idx % arr.length];
    }
    if (typeId === 'fat') return '胖叔：哎哟，俺安全帽顶着桥啦！';
    if (typeId === 'auntie') return '大妈：哎哟喂，差点磕着阿姨脑袋！';
    return '哐！全员发型重塑！';
  }

  observe(event) {
    if (event.type === 'bonk') {
      return this.trigger(event.x, event.y, this.pickBonkText(event.typeId));
    }
    if (event.type === 'fall') {
      this.falls++;
      this.fallX += event.x;
      this.fallY += event.y;
    }
    return false;
  }

  endFrame() {
    if (this.falls >= 3) {
      return this.trigger(this.fallX / this.falls, this.fallY / this.falls, '全员天女散花！');
    }
    return false;
  }

  trigger(x, y, text) {
    if (this.cooldown > 0) return false;
    this.hitstop = 0.12;
    this.cooldown = 0.90;
    this.bannerLock = 1.15;
    this.stage.triggerImpactZoom(x, y, text, '#FB7185');
    return true;
  }

  /** 热梗成就解锁瞬间的高光定格特写（0.18s 欢庆微顿 + 轻柔镜头拉近，让玩家一眼看清为什么得奖！） */
  triggerAchievementSpotlight(x, y) {
    this.hitstop = Math.max(this.hitstop, 0.18);
    this.bannerLock = Math.max(this.bannerLock, 1.8);
    this.stage.triggerImpactZoom(x, y, '', '#FACC15');
    this.stage.camZoomTarget = 1.12;
    this.stage.camHold = 0.55;
  }
}
