// 抖音小游戏合规 SDK 封装（V3）：
//   1. 自动录屏（含切后台 pause/resume + 异步 onStop 视频就绪通知）与一键短视频分享
//   2. 激励视频广告（播前暂停静音、防连点、DEV_MOCK_AD 生产开关隔离）
//   3. 规范双态「抖音侧边栏复访」检测与 navigateToScene 跳转（严禁非侧边栏直接发奖）
//   4. 抖音原生排行榜上报（setImRankData）与榜单拉起（getImRankList）
//   5. 核心漏斗埋点（reportAnalytics）

import { TT_CONFIG } from './config.js';

export class DouyinSDK {
  constructor(platform, hooks = {}) {
    this.platform = platform;
    this.isTT = platform.isTT;
    this.onAdToggle = hooks.onAdToggle || (() => {});
    this.onVideoReady = hooks.onVideoReady || (() => {});

    this.recorder = null;
    this.recording = false;
    this.recordPaused = false;
    this.videoPath = '';
    this.recordStartMs = 0;
    this.recordState = 'idle';
    this.recordWanted = false;
    this.discardRecord = false;
    this.recordActiveMs = 0;
    this.recordTickMs = null;
    this.recordRestartPending = false;
    this.recordResumePending = false;
    this.appHidden = false;

    this.rewardedAd = null;
    this.adPendingCb = null;
    this.adBusy = false;
    this.adRequest = null;

    this.sidebarSupported = false;
    this.launchedFromSidebar = false;
    this.shortcutSupported = false;
    this.shortcutAdded = false;
    this.highlightCount = 0;
    this.lastHighlightMs = 0;
    this.highlightImagePath = '';
    this.highlightTitle = '';
  }

  init() {
    this.platform.onShow?.((res) => {
      this.appHidden = false;
      if (this.isTT) {
        this.checkSidebarLaunch(res);
        this.checkShortcut();
      }
      this.resumeRecord();
    });
    this.platform.onHide?.(() => {
      this.appHidden = true;
      this.pauseRecord();
    });
    if (!this.isTT) {
      // 本地调试默认展示侧边栏与桌面快捷方式入口，便于测试双态交互
      this.sidebarSupported = true;
      this.shortcutSupported = true;
      return;
    }

    // 0) 抖音提审必配：右上角胶囊被动转发监听 & 分享菜单开启
    try {
      if (typeof tt.showShareMenu === 'function') {
        tt.showShareMenu({ withShareTicket: false });
      }
      if (typeof tt.onShareAppMessage === 'function') {
        tt.onShareAppMessage(() => ({
          title: this.highlightTitle
            ? `我在《超载快车》拿下热梗称号【${this.highlightTitle}】！来试试你能叠多少人！`
            : (TT_CONFIG.sharePassiveTitle || '早高峰挤爆啦！来《超载快车》试试你能叠多少人！'),
          imageUrl: this.highlightImagePath || undefined,
          extra: { videoTopics: this.highlightTitle ? [...TT_CONFIG.shareTopics, this.highlightTitle] : TT_CONFIG.shareTopics },
        }));
      }
    } catch { /* ignore */ }

    // 1) 初始化录屏管理器（含 pause/resume）
    if (typeof tt.getGameRecorderManager === 'function') {
      try {
        this.recorder = tt.getGameRecorderManager();
        this.recorder.onStart(() => {
          if (this.recordState !== 'starting') return;
          this.recordState = 'recording';
          this.recording = true;
          this.recordPaused = false;
          this.videoPath = '';
          this.recordTickMs = this.now();
          if (this.recordRestartPending || !this.recordWanted) {
            this.recordRestartPending = false;
            this.requestRecordStop();
          }
          else if (this.appHidden || this.adBusy) this.pauseRecord();
        });
        this.recorder.onPause(() => {
          if (this.recordState !== 'recording') return;
          this.accumulateRecordTime();
          this.recordPaused = true;
        });
        this.recorder.onResume(() => {
          if (this.recordState !== 'recording') return;
          this.recordResumePending = false;
          this.recordPaused = false;
          this.recordTickMs = this.now();
          if (this.appHidden || this.adBusy) this.pauseRecord();
        });
        this.recorder.onStop((res) => {
          if (this.recordState === 'idle') return;
          this.accumulateRecordTime();
          const restart = this.recordWanted && this.recordState === 'stopping';
          this.recording = false;
          this.recordPaused = false;
          this.recordState = 'idle';
          this.recordTickMs = null;
          this.recordResumePending = false;
          this.recordWanted = false;
          if (!this.discardRecord && !restart && res?.videoPath && this.recordActiveMs >= 3000) {
            // 若对局中标记过高光翻车/兜底/欢呼片段且端上支持 clipVideo，则优先导出高能精华片段，失败自动回退原视频
            if (this.highlightCount > 0 && typeof this.recorder.clipVideo === 'function') {
              try {
                this.recorder.clipVideo({
                  path: res.videoPath,
                  success: (clipRes) => {
                    this.videoPath = clipRes?.videoPath || res.videoPath;
                    this.onVideoReady(this.videoPath);
                  },
                  fail: () => {
                    this.videoPath = res.videoPath;
                    this.onVideoReady(this.videoPath);
                  },
                });
              } catch {
                this.videoPath = res.videoPath;
                this.onVideoReady(this.videoPath);
              }
            } else {
              this.videoPath = res.videoPath;
              this.onVideoReady(this.videoPath);
            }
          }
          if (restart) this.startRecord();
        });
        this.recorder.onError(() => {
          this.recording = false;
          this.recordPaused = false;
          this.recordState = 'idle';
          this.recordWanted = false;
          this.recordTickMs = null;
          this.videoPath = '';
          this.recordRestartPending = false;
          this.recordResumePending = false;
        });
      } catch { /* ignore */ }
    }

    // 2) 初始化激励视频广告
    if (TT_CONFIG.rewardedAdUnitId && typeof tt.createRewardedVideoAd === 'function') {
      try {
        this.rewardedAd = tt.createRewardedVideoAd({ adUnitId: TT_CONFIG.rewardedAdUnitId });
        this.rewardedAd.onClose((res) => {
          this.finishAd(this.adRequest, Boolean(res?.isEnded));
        });
        this.rewardedAd.onError(() => {
          this.finishAd(this.adRequest, false, '广告加载失败，请稍后重试');
        });
      } catch { /* ignore */ }
    }

    // 3) 侧边栏复访场景检测
    if (typeof tt.checkScene === 'function') {
      try {
        tt.checkScene({
          scene: 'sidebar',
          success: (res) => { this.sidebarSupported = !!(res && res.isExist); },
        });
      } catch { /* ignore */ }
    }
    if (typeof tt.getLaunchOptionsSync === 'function') {
      try { this.checkSidebarLaunch(tt.getLaunchOptionsSync()); } catch { /* ignore */ }
    }

    // 4) 抖音桌面快捷方式支持检测（官方流量加权次留入口）
    this.checkShortcut();
  }

  checkShortcut() {
    if (!this.isTT || typeof tt.checkShortcut !== 'function') return;
    try {
      tt.checkShortcut({
        success: (res) => {
          this.shortcutSupported = true;
          this.shortcutAdded = Boolean(res?.status?.exist);
        },
        fail: () => { this.shortcutSupported = false; },
      });
    } catch { /* ignore */ }
  }

  addShortcut(onDone) {
    this.track('shortcut_click', {});
    if (!this.isTT) {
      this.shortcutAdded = true;
      if (onDone) onDone(true, '已模拟添加到手机桌面！奖励已到账！');
      return;
    }
    if (typeof tt.addShortcut === 'function') {
      tt.addShortcut({
        success: () => {
          this.shortcutAdded = true;
          this.track('shortcut_success', {});
          if (onDone) onDone(true, '已添加到手机桌面！');
        },
        fail: () => onDone && onDone(false, '未添加桌面快捷方式'),
      });
    } else if (onDone) {
      onDone(false, '当前设备暂不支持桌面快捷方式');
    }
  }

  checkSidebarLaunch(opt) {
    this.launchedFromSidebar = opt?.launch_from === 'homepage' && opt?.location === 'sidebar_card';
  }

  now() { return this.platform.now ? this.platform.now() : Date.now(); }

  accumulateRecordTime() {
    if (this.recordState === 'recording' && !this.recordPaused && this.recordTickMs !== null) {
      this.recordActiveMs += Math.max(0, this.now() - this.recordTickMs);
    }
    this.recordTickMs = null;
  }

  /** 漏斗埋点 */
  track(event, data = {}) {
    this.platform.reportAnalytics(event, data);
  }

  startRecord() {
    this.videoPath = '';
    if (!this.isTT || !this.recorder) return;
    const cancelledStarting = this.recordState === 'starting' && !this.recordWanted;
    this.recordWanted = true;
    if (cancelledStarting) {
      this.recordRestartPending = true;
      this.discardRecord = true;
      return;
    }
    if (this.recordState === 'stopping') { this.discardRecord = true; return; }
    if (this.recordState !== 'idle') return;
    this.recordState = 'starting';
    this.discardRecord = false;
    this.recordActiveMs = 0;
    this.recordTickMs = null;
    this.highlightCount = 0;
    this.lastHighlightMs = 0;
    try { this.recorder.start({ duration: 60 }); }
    catch { this.recordState = 'idle'; this.recordWanted = false; }
  }

  /** 在撞洞飞人、菜篮兜底、全员欢呼瞬间打高光点，分享时自动剪出高能短视频！ */
  markHighlight(beforeSec = 2.5, afterSec = 2.0) {
    if (!this.isTT || !this.recorder || this.recordState !== 'recording' || this.recordPaused) return;
    const now = this.now();
    if (now - this.lastHighlightMs < 2400) return;
    this.lastHighlightMs = now;
    if (typeof this.recorder.recordClip === 'function') {
      try {
        this.recorder.recordClip({
          timeRange: [beforeSec, afterSec],
          success: () => { this.highlightCount++; },
        });
      } catch { /* ignore */ }
    }
  }

  pauseRecord() {
    if (this.recorder && this.recordState === 'recording' && (!this.recordPaused || this.recordResumePending)) {
      this.accumulateRecordTime();
      this.recordPaused = true;
      this.recordResumePending = false;
      try { this.recorder.pause(); } catch { this.discardRecord = true; }
    }
  }

  resumeRecord() {
    if (this.recorder && this.recordState === 'recording' && this.recordPaused && !this.recordResumePending && !this.appHidden && !this.adBusy) {
      this.recordResumePending = true;
      try { this.recorder.resume(); } catch { this.recordResumePending = false; }
    }
  }

  stopRecord({ discard = false } = {}) {
    this.recordWanted = false;
    this.recordRestartPending = false;
    this.discardRecord = this.discardRecord || discard;
    if (discard) this.videoPath = '';
    this.requestRecordStop();
  }

  requestRecordStop() {
    if (!this.recorder || this.recordState !== 'recording') return;
    this.accumulateRecordTime();
    this.recordState = 'stopping';
    try { this.recorder.stop(); }
    catch { this.recordState = 'idle'; this.recording = false; this.videoPath = ''; }
  }

  hasVideo() {
    return Boolean(this.videoPath);
  }

  setHighlightSnapshot(snap) {
    if (!snap) return;
    if (snap.tempFilePath) this.highlightImagePath = snap.tempFilePath;
    if (snap.title) this.highlightTitle = snap.title;
  }

  clearHighlightSnapshot() {
    this.highlightImagePath = '';
    this.highlightTitle = '';
  }

  hasHighlightImage() {
    return Boolean(this.highlightImagePath);
  }

  shareVideo(deliveredCount, funnyTitle, onDone, opts = {}) {
    const shareTitleTag = opts.titleTag || this.highlightTitle || funnyTitle || '超载快车车长';
    const title = TT_CONFIG.shareTitle
      .replace('{count}', String(deliveredCount))
      .replace('{title}', shareTitleTag);
    const imgPath = opts.imagePath || this.highlightImagePath || '';
    const topics = [...new Set([...(TT_CONFIG.shareTopics || []), shareTitleTag])];
    this.track('video_share_click', {
      count: deliveredCount,
      has_video: this.hasVideo() ? 1 : 0,
      has_highlight_img: imgPath ? 1 : 0,
      title: shareTitleTag,
    });

    if (!this.isTT) {
      if (onDone) {
        const hint = opts.hasPreviewSnap
          ? `已打包高光抓拍图 + 称号【${shareTitleTag}】（真机将直发该图）`
          : `已附带称号【${shareTitleTag}】准备分享（请在抖音真机/开发者工具体验）`;
        onDone(false, hint);
      }
      return;
    }
    if (typeof tt.shareAppMessage !== 'function') {
      if (onDone) onDone(false, '当前环境不支持分享');
      return;
    }
    // 优先使用「高光时刻截图 + 称号」分享图片卡片；若录到完整视频且未抓拍高光图则走视频分享
    let payload;
    if (imgPath && (!this.videoPath || opts.preferImage)) {
      payload = {
        title,
        imageUrl: imgPath,
        extra: { videoTopics: topics },
        success: () => {
          this.track('video_share_success', { count: deliveredCount, mode: 'highlight_image', title: shareTitleTag });
          if (onDone) onDone(true, `已带着【${shareTitleTag}】高光截图分享成功！`);
        },
        fail: () => onDone && onDone(false, '已取消分享'),
      };
    } else if (this.videoPath) {
      payload = {
        channel: 'video',
        title,
        imageUrl: imgPath || undefined,
        extra: { videoPath: this.videoPath, videoTopics: topics, withVideoId: true },
        success: (res) => {
          this.track('video_share_success', { count: deliveredCount, mode: 'video', title: shareTitleTag, has_video_id: res?.videoId ? 1 : 0 });
          if (onDone) onDone(true, `已带着【${shareTitleTag}】视频分享完成！`);
        },
        fail: () => onDone && onDone(false, '已取消分享'),
      };
    } else {
      payload = {
        title,
        success: () => {
          this.track('video_share_success', { count: deliveredCount, mode: 'card', title: shareTitleTag });
          if (onDone) onDone(true, `已带着【${shareTitleTag}】分享成功！`);
        },
        fail: () => onDone && onDone(false, '已取消分享'),
      };
    }
    try { tt.shareAppMessage(payload); } catch { if (onDone) onDone(false, '分享失败'); }
  }

  /** 激励视频广告（播前强制暂停与静音，关闭后恢复；正式包由 DEV_MOCK_AD=false 严格隔离） */
  showRewardedAd(sceneTag, onComplete) {
    if (this.adBusy) return;
    this.track('ad_trigger', { scene: sceneTag });

    if (!this.isTT || !this.rewardedAd) {
      if (!TT_CONFIG.DEV_MOCK_AD) {
        this.platform.showToast('暂无可用广告，请稍后再试');
        if (onComplete) onComplete(false);
        return;
      }
      const req = this.beginAd(sceneTag, onComplete, true);
      setTimeout(() => this.finishAd(req, true), 220);
      return;
    }
    const req = this.beginAd(sceneTag, onComplete, false);
    Promise.resolve().then(() => this.rewardedAd.show()).catch(async () => {
      if (this.adRequest !== req) return;
      try {
        await this.rewardedAd.load();
        if (this.adRequest === req) await this.rewardedAd.show();
      } catch { this.finishAd(req, false, '广告加载失败，请稍后再试'); }
    });
  }

  beginAd(scene, callback, mock) {
    const req = { scene, callback, mock };
    this.adRequest = req;
    this.adBusy = true;
    this.pauseRecord();
    this.onAdToggle(true);
    return req;
  }

  finishAd(req, ok, message = '') {
    if (!req || this.adRequest !== req) return;
    this.adRequest = null;
    this.adBusy = false;
    this.resumeRecord();
    this.onAdToggle(false);
    if (message) this.platform.showToast(message);
    if (ok) this.track('ad_complete', { scene: req.scene, mock: req.mock ? 1 : 0 });
    req.callback?.(ok);
  }

  /** 规范双态侧边栏：非侧边栏进入时仅跳转侧边栏，不直接发奖 */
  navigateToSidebar(onResult) {
    this.track('sidebar_navigate', {});
    if (!this.isTT) {
      // 本地预览模拟用户“点击去侧边栏并从侧边栏返回”的状态切换，方便测试双态弹窗
      this.launchedFromSidebar = true;
      if (onResult) onResult(true, '已模拟从抖音侧边栏返回，现在可以领奖啦！');
      return;
    }
    if (typeof tt.navigateToScene === 'function') {
      tt.navigateToScene({
        scene: 'sidebar',
        success: () => onResult && onResult(true, '已前往抖音侧边栏，从侧边栏重新进入即可领奖！'),
        fail: () => onResult && onResult(false, '请手动返回抖音首页侧边栏重新进入'),
      });
    } else if (onResult) {
      onResult(false, '请从抖音首页侧边栏重新进入领取');
    }
  }

  reportRank(totalDelivered, extraTag = 'total') {
    if (!this.isTT || typeof tt.setImRankData !== 'function') return;
    try {
      tt.setImRankData({
        dataType: 0,
        value: String(Math.max(0, Math.round(totalDelivered))),
        priority: 0,
        zoneId: TT_CONFIG.rankZoneId,
        extra: `${TT_CONFIG.rankKeyPrefix}${extraTag}`,
      });
    } catch { /* ignore */ }
  }

  openRankList(onDone) {
    this.track('rank_open', {});
    if (!this.isTT) {
      if (onDone) onDone(false, '真机/开发者工具内可查看抖音好友与全服总榜');
      return;
    }
    if (typeof tt.getImRankList === 'function') {
      try {
        tt.getImRankList({
          relationType: 'all',
          dataType: 0,
          rankType: 'all',
          suffix: '人',
          rankTitle: '超载快车全服运载榜',
          zoneId: TT_CONFIG.rankZoneId,
          success: () => onDone && onDone(true, ''),
          fail: () => onDone && onDone(false, '排行榜暂不可用'),
        });
      } catch {
        if (onDone) onDone(false, '排行榜暂不可用');
      }
    } else if (onDone) {
      onDone(false, '当前客户端版本不支持原生排行榜');
    }
  }
}
