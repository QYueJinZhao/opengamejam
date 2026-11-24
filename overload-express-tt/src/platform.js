// 抖音小游戏（tt.*）与本地浏览器预览的统一平台适配层。
// 在字节跳动开发者工具与抖音真机中 100% 走原生 tt API；无 tt 环境时自动降级到 Canvas 浏览器预览。

const isTT = typeof tt !== 'undefined' && typeof tt.createCanvas === 'function';

export class Platform {
  constructor() {
    this.isTT = isTT;
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.winW = 1280;
    this.winH = 720;
    this.safe = { left: 0, right: 1280, top: 0, bottom: 720 };
    this.menuRect = null;

    this._touchStartCbs = [];
    this._touchMoveCbs = [];
    this._touchEndCbs = [];
    this._showCbs = [];
    this._hideCbs = [];
  }

  init() {
    if (this.isTT) {
      this.canvas = tt.createCanvas();
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.refreshMetrics();
      this.bindTTInput();
      if (typeof tt.onShow === 'function') tt.onShow((res) => this._showCbs.forEach((f) => f(res)));
      if (typeof tt.onHide === 'function') tt.onHide(() => this._hideCbs.forEach((f) => f()));
      if (typeof tt.onWindowResize === 'function') {
        tt.onWindowResize(() => this.refreshMetrics());
      }
    } else {
      this.canvas = document.getElementById('game') || document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.refreshMetrics();
      this.bindWebInput();
      window.addEventListener('resize', () => this.refreshMetrics());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this._hideCbs.forEach((f) => f());
        else this._showCbs.forEach((f) => f({}));
      });
    }
    return this;
  }

  refreshMetrics() {
    if (this.isTT) {
      const info = tt.getSystemInfoSync();
      // 低端机兼顾清晰度与 60fps，DPR 上限限制为 2
      this.dpr = Math.min(info.pixelRatio || 2, 2);
      this.winW = info.windowWidth || 844;
      this.winH = info.windowHeight || 390;
      this.canvas.width = Math.max(1, Math.round(this.winW * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.winH * this.dpr));
      const ultraWide = this.winW / Math.max(1, this.winH) >= 1.9;
      const minSide = ultraWide ? Math.max(28, Math.round(this.winW * 0.048)) : 0;
      const minBot = ultraWide ? Math.max(20, Math.round(this.winH * 0.056)) : 0;
      const sa = info.safeArea || { left: 0, right: this.winW, top: 0, bottom: this.winH };
      this.safe = {
        left: Math.max(minSide, sa.left || 0),
        right: Math.min(this.winW - minSide, sa.right || this.winW),
        top: Math.max(0, sa.top || 0),
        bottom: Math.min(this.winH - minBot, sa.bottom || this.winH),
      };
      if (typeof tt.getMenuButtonBoundingClientRect === 'function') {
        try {
          const r = tt.getMenuButtonBoundingClientRect();
          if (r && r.width > 0 && r.left > 0) this.menuRect = r;
        } catch { /* ignore */ }
      }
    } else {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.winW = Math.max(320, Math.round(rect.width || window.innerWidth));
      this.winH = Math.max(240, Math.round(rect.height || window.innerHeight));
      this.canvas.width = Math.round(this.winW * this.dpr);
      this.canvas.height = Math.round(this.winH * this.dpr);
      // 模拟全面屏手机横屏安全区（避开圆角/灵动岛及底部 Home 横条）
      const ultraWide = this.winW / Math.max(1, this.winH) >= 1.9;
      const minSide = ultraWide ? Math.max(28, Math.round(this.winW * 0.048)) : 0;
      const minBot = ultraWide ? Math.max(20, Math.round(this.winH * 0.056)) : 0;
      this.safe = { left: minSide, right: this.winW - minSide, top: 0, bottom: this.winH - minBot };
      // 本地预览模拟抖音右上角胶囊占位（宽 88 高 32），方便校验任何分辨率下的避让效果
      this.menuRect = { left: this.winW - 102, right: this.winW - 14, top: 10, bottom: 42, width: 88, height: 32 };
    }
  }

  bindTTInput() {
    const norm = (e) => ({
      touches: (e.touches || []).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY })),
      changed: (e.changedTouches || []).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY })),
    });
    tt.onTouchStart((e) => { const n = norm(e); this._touchStartCbs.forEach((f) => f(n)); });
    tt.onTouchMove((e) => { const n = norm(e); this._touchMoveCbs.forEach((f) => f(n)); });
    tt.onTouchEnd((e) => { const n = norm(e); this._touchEndCbs.forEach((f) => f(n)); });
    tt.onTouchCancel((e) => { const n = norm(e); this._touchEndCbs.forEach((f) => f(n)); });
  }

  bindWebInput() {
    const getPt = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { id: e.pointerId || 1, x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const active = new Map();
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      this.canvas.setPointerCapture?.(e.pointerId);
      const pt = getPt(e);
      active.set(pt.id, pt);
      this._touchStartCbs.forEach((f) => f({ touches: [...active.values()], changed: [pt] }));
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const pt = getPt(e);
      if (active.has(pt.id)) active.set(pt.id, pt);
      this._touchMoveCbs.forEach((f) => f({ touches: [...active.values()], changed: [pt] }));
    });
    const end = (e) => {
      const pt = getPt(e);
      if (!active.has(pt.id)) return;
      active.delete(pt.id);
      this._touchEndCbs.forEach((f) => f({ touches: [...active.values()], changed: [pt] }));
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  onTouchStart(cb) { this._touchStartCbs.push(cb); }
  onTouchMove(cb) { this._touchMoveCbs.push(cb); }
  onTouchEnd(cb) { this._touchEndCbs.push(cb); }
  onShow(cb) { this._showCbs.push(cb); }
  onHide(cb) { this._hideCbs.push(cb); }

  createAudioContext() {
    try {
      if (this.isTT && typeof tt.createWebAudioContext === 'function') {
        return tt.createWebAudioContext();
      }
      const AC = typeof AudioContext !== 'undefined' ? AudioContext
        : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
      return AC ? new AC() : null;
    } catch {
      return null;
    }
  }

  getStorage(key, fallback = null) {
    try {
      if (this.isTT) {
        const v = tt.getStorageSync(key);
        return v === '' || v === undefined ? fallback : v;
      }
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  setStorage(key, val) {
    try {
      if (this.isTT) tt.setStorageSync(key, val);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch { /* ignore */ }
  }

  vibrate(type = 'light') {
    try {
      if (this.isTT && typeof tt.vibrateShort === 'function') {
        tt.vibrateShort({ type });
      }
    } catch { /* ignore */ }
  }

  showToast(title) {
    try {
      if (this.isTT && typeof tt.showToast === 'function') {
        tt.showToast({ title, icon: 'none', duration: 1800 });
      }
    } catch { /* ignore */ }
  }

  /** 抖音自带免费事件统计埋点（0 额外 SDK 体积） */
  reportAnalytics(eventName, data = {}) {
    try {
      if (this.isTT && typeof tt.reportAnalytics === 'function') {
        tt.reportAnalytics(eventName, data);
      }
    } catch { /* ignore */ }
  }

  /** 抖音小游戏 & Web 通用高光时刻截屏（用于解锁热梗称号瞬间抓拍，分享时直出高光图！） */
  captureHighlightSnapshot(title = '') {
    if (!this.canvas) return null;
    try {
      let tempFilePath = '';
      if (this.isTT && typeof this.canvas.toTempFilePathSync === 'function') {
        tempFilePath = this.canvas.toTempFilePathSync({
          x: 0,
          y: 0,
          width: this.canvas.width,
          height: this.canvas.height,
          destWidth: 960,
          destHeight: 540,
          fileType: 'jpg',
          quality: 0.86,
        }) || '';
      }
      // 同步生成轻量缩略图画布（供结算页拍立得高光预览展示，零阻塞、低内存）
      let previewCanvas = null;
      if (this.isTT && typeof tt.createCanvas === 'function') {
        previewCanvas = tt.createCanvas();
      } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        previewCanvas = document.createElement('canvas');
      }
      if (previewCanvas) {
        previewCanvas.width = 320;
        previewCanvas.height = 180;
        const pctx = previewCanvas.getContext('2d');
        if (pctx) {
          pctx.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, 0, 320, 180);
        }
      }
      return { tempFilePath, previewCanvas, title };
    } catch {
      return null;
    }
  }

  now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  raf(fn) {
    return requestAnimationFrame(fn);
  }
}
