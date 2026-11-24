import test from 'node:test';
import assert from 'node:assert/strict';
import { DouyinSDK } from '../src/tt_sdk.js';
import { TT_CONFIG } from '../src/config.js';

function fixture(t, { launch = {}, ad = true, recorder = true } = {}) {
  const previousTT = globalThis.tt;
  const previousId = TT_CONFIG.rewardedAdUnitId;
  const previousMock = TT_CONFIG.DEV_MOCK_AD;
  const previousNow = Date.now;
  t.after(() => {
    globalThis.tt = previousTT;
    TT_CONFIG.rewardedAdUnitId = previousId;
    TT_CONFIG.DEV_MOCK_AD = previousMock;
    Date.now = previousNow;
  });
  let now = 0;
  Date.now = () => now;
  const events = {}, life = {}, calls = [], completions = [], toggles = [];
  const nativeRecorder = {};
  for (const name of ['Start', 'Stop', 'Pause', 'Resume', 'Error']) {
    nativeRecorder[`on${name}`] = (fn) => { events[`record${name}`] = fn; };
  }
  for (const name of ['start', 'stop', 'pause', 'resume']) {
    nativeRecorder[name] = () => { calls.push(name); };
  }
  const nativeAd = {
    onClose: (fn) => { events.adClose = fn; },
    onError: (fn) => { events.adError = fn; },
    show: () => { calls.push('ad.show'); return Promise.resolve(); },
    load: () => { calls.push('ad.load'); return Promise.resolve(); },
  };
  globalThis.tt = {
    getGameRecorderManager: recorder ? () => nativeRecorder : undefined,
    createRewardedVideoAd: ad ? () => nativeAd : undefined,
    getLaunchOptionsSync: () => launch,
    checkScene: ({ success }) => success({ isExist: true }),
    navigateToScene: ({ success }) => success(),
    shareAppMessage: (payload) => { calls.push(payload); payload.success(); },
  };
  TT_CONFIG.rewardedAdUnitId = 'test-ad-unit';
  TT_CONFIG.DEV_MOCK_AD = false;
  const platform = {
    isTT: true, now: () => now,
    onShow: (fn) => { life.show = fn; }, onHide: (fn) => { life.hide = fn; },
    reportAnalytics: () => {}, showToast: (msg) => calls.push(`toast:${msg}`),
  };
  const sdk = new DouyinSDK(platform, {
    onAdToggle: (on) => toggles.push(on), onVideoReady: (path) => completions.push(path),
  });
  sdk.init();
  return { sdk, events, life, calls, completions, toggles, nativeAd,
    advance: (ms) => { now += ms; },
    start: () => { sdk.startRecord(); events.recordStart(); },
  };
}

test('只有完整的最新侧边栏启动信息才允许领奖', (t) => {
  const f = fixture(t, { launch: { launch_from: 'homepage' } });
  assert.equal(f.sdk.launchedFromSidebar, false);
  f.life.show({ launch_from: 'homepage', location: 'sidebar_card' });
  assert.equal(f.sdk.launchedFromSidebar, true);
  f.life.show({ launch_from: 'homepage' });
  assert.equal(f.sdk.launchedFromSidebar, false);
});

test('侧边栏跳转成功不能直接获得领奖资格', (t) => {
  const f = fixture(t);
  f.sdk.navigateToSidebar();
  assert.equal(f.sdk.launchedFromSidebar, false);
});

test('广告开始暂停录屏，关闭后恢复且一次发奖', async (t) => {
  const f = fixture(t);
  f.start();
  let rewards = 0;
  f.sdk.showRewardedAd('gear', (ok) => { if (ok) rewards++; });
  await Promise.resolve();
  assert.ok(f.calls.includes('pause'));
  f.events.adClose({ isEnded: true });
  f.events.adClose({ isEnded: true });
  assert.equal(rewards, 1);
  assert.deepEqual(f.toggles, [true, false]);
  assert.ok(f.calls.includes('resume'));
});

test('广告期间切后台，关闭广告后不能提前恢复录屏', async (t) => {
  const f = fixture(t);
  f.start();
  f.sdk.showRewardedAd('gear', () => {});
  await Promise.resolve();
  f.life.hide();
  f.events.adClose({ isEnded: false });
  assert.equal(f.calls.filter((x) => x === 'resume').length, 0);
  f.life.show({});
  assert.equal(f.calls.filter((x) => x === 'resume').length, 1);
});

test('广告错误与 Promise 拒绝同时到达只完成一次', async (t) => {
  const f = fixture(t);
  let reject;
  f.nativeAd.show = () => new Promise((_, r) => { reject = r; });
  const results = [];
  f.sdk.showRewardedAd('retry', (ok) => results.push(ok));
  await Promise.resolve();
  f.events.adError({ errCode: 1 });
  reject(new Error('synthetic unavailable ad'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(results, [false]);
  assert.deepEqual(f.toggles, [true, false]);
  assert.equal(f.calls.includes('ad.load'), false);
});

test('广告 API 同步抛错可恢复游戏且不发奖', async (t) => {
  const f = fixture(t);
  f.nativeAd.show = () => { throw new Error('synthetic sync error'); };
  const results = [];
  assert.doesNotThrow(() => f.sdk.showRewardedAd('retry', (ok) => results.push(ok)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(results, [false]);
  assert.equal(f.sdk.adBusy, false);
});

test('首轮展示失败仅加载重试一次，完整观看才发奖', async (t) => {
  const f = fixture(t);
  let attempts = 0;
  f.nativeAd.show = () => ++attempts === 1 ? Promise.reject(new Error('not loaded')) : Promise.resolve();
  const results = [];
  f.sdk.showRewardedAd('gear', (ok) => results.push(ok));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.deepEqual(results, []);
  f.events.adClose({ isEnded: false });
  assert.deepEqual(results, [false]);
});

test('生产配置下缺失广告能力不会模拟发奖', (t) => {
  const f = fixture(t, { ad: false });
  const results = [];
  f.sdk.showRewardedAd('gear', (ok) => results.push(ok));
  assert.deepEqual(results, [false]);
  assert.equal(f.sdk.adBusy, false);
});

test('后台暂停不能凑够三秒有效视频', (t) => {
  const f = fixture(t);
  f.start();
  f.advance(1000);
  f.life.hide();
  f.events.recordPause();
  f.advance(9000);
  f.life.show({});
  f.events.recordResume();
  f.advance(1000);
  f.sdk.stopRecord();
  f.advance(5000); // 异步停止回调的等待也不能算入视频
  f.events.recordStop({ videoPath: 'synthetic-short.mp4' });
  assert.equal(f.sdk.hasVideo(), false);
  assert.deepEqual(f.completions, []);
});

test('三秒有效录制后才可使用当前视频', (t) => {
  const f = fixture(t);
  f.start(); f.advance(3000);
  f.sdk.stopRecord();
  f.events.recordStop({ videoPath: 'synthetic-valid.mp4' });
  assert.equal(f.sdk.hasVideo(), true);
  assert.deepEqual(f.completions, ['synthetic-valid.mp4']);
});

test('旧录屏异步停止后才启动新局且不串用旧视频', (t) => {
  const f = fixture(t);
  f.start(); f.advance(4000);
  f.sdk.stopRecord();
  f.sdk.startRecord();
  assert.equal(f.calls.filter((x) => x === 'start').length, 1);
  f.events.recordStop({ videoPath: 'synthetic-old.mp4' });
  assert.equal(f.calls.filter((x) => x === 'start').length, 2);
  assert.equal(f.sdk.hasVideo(), false);
  assert.deepEqual(f.completions, []);
});

test('录屏尚未开始就重置时，onStart 到达后仍会停止', (t) => {
  const f = fixture(t);
  f.sdk.startRecord(); f.sdk.stopRecord();
  f.events.recordStart();
  assert.ok(f.calls.includes('stop'));
});

test('浏览器分享不会谎报调起原生发布器', () => {
  const sdk = new DouyinSDK({ isTT: false, reportAnalytics: () => {} });
  const results = [];
  sdk.shareVideo(12, '车长', (ok) => results.push(ok));
  assert.deepEqual(results, [false]);
});

test('当前录屏分享携带话题、称号并请求锚点视频回执', (t) => {
  const f = fixture(t);
  f.start(); f.advance(3000); f.sdk.stopRecord();
  f.events.recordStop({ videoPath: 'synthetic-ready.mp4' });
  f.sdk.shareVideo(12, '稳如老狗持证车长', () => {});
  const payload = f.calls.find((item) => typeof item === 'object' && item.channel === 'video');
  assert.ok(payload.title.includes('12') && payload.title.includes('稳如老狗持证车长'));
  assert.equal(payload.extra.videoPath, 'synthetic-ready.mp4');
  assert.equal(payload.extra.withVideoId, true);
  assert.ok(payload.extra.videoTopics.includes('超载快车'));
});

test('启动回调前取消并重开时串行建立新的录屏会话', (t) => {
  const f = fixture(t);
  f.sdk.startRecord();
  f.sdk.stopRecord({ discard: true });
  f.sdk.startRecord();
  f.events.recordStart();
  assert.equal(f.calls.filter((x) => x === 'stop').length, 1);
  f.events.recordStop({ videoPath: 'synthetic-cancelled.mp4' });
  assert.equal(f.calls.filter((x) => x === 'start').length, 2);
  f.events.recordStart(); f.advance(4000);
  f.sdk.stopRecord();
  f.events.recordStop({ videoPath: 'synthetic-new-session.mp4' });
  assert.deepEqual(f.completions, ['synthetic-new-session.mp4']);
});

test('等待原生 onResume 的时间不能算作有效录制', (t) => {
  const f = fixture(t);
  f.start(); f.advance(1000);
  f.life.hide(); f.events.recordPause();
  f.life.show({}); // 已请求恢复，但原生录屏仍暂停
  f.advance(2000);
  f.sdk.stopRecord();
  f.events.recordStop({ videoPath: 'synthetic-pending-resume.mp4' });
  assert.equal(f.sdk.hasVideo(), false);
});
