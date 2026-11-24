# 《超载快车》抖音小游戏版（V3 · 锁横屏高留存首发版）

纯 Canvas2D、运行时零外部依赖、原生分支零 DOM、零 Emoji 的抖音小游戏工程。V3 目标为坚定横屏、10 关渐进主线、每日专列、轻量无尽与车队养成，构建主包保持 `< 300000 bytes`（当前含 24 张成就卡牌馆完整插画）。使用 **字节跳动开发者工具** 验证；本项目不进行真机测试。

当前依据为用户指定的 [V3 最终规划快照](docs/specs/douyin_minigame_plan.md)，开发、统一验收与剩余缺口见 [规划补齐验收记录](docs/plan-followup-acceptance.md)。[上一轮记录](docs/v3-acceptance.md) 保留历史范围。浏览器与合成 SDK 测试不代表真实平台审核通过。

---

## 一、目录结构

```text
overload-express-tt/
├── game.json             # 坚定横屏配置（deviceOrientation: "landscape"）
├── project.config.json   # 字节跳动开发者工具配置（packOptions 已排除本地调试文件）
├── package.json          # npm test / build / build:production（仅 esbuild 开发依赖）
├── build.mjs             # 压缩合并，主包字节校验，生产模式强制关闭模拟广告
├── dist/                 # 自动生成的三个主包文件；推荐导入此目录
├── game.js               # 唯一入口（0黑边宽屏、多点触控分区、撞洞1.18x特写+微顿帧、生命周期）
└── src/
    ├── config.js         # 广告位 ID、DEV_MOCK_AD 生产开关、分享模板、CADPA 8+ 适龄全文
    ├── levels.js         # 10关逐类解锁表、6种特征签、每日专列、8词条无尽肉鸽、5涂装、称号
    ├── progress.js       # 持久化存档（关卡进度、车票金币、3项车队升级、5套涂装、单日侧边栏）
    ├── icons.js          # 纯 Canvas2D 矢量图标库（全面替代系统 Emoji）
    ├── platform.js       # tt.* API 统一桥接（安全区、胶囊、震动、存储、reportAnalytics 埋点）
    ├── tt_sdk.js         # 抖音合规 SDK（录屏 pause/resume、激励视频、双态侧边栏、原生排行）
    ├── physics.js        # 固定步长 PBD，分阶段约束与缓存复用；零 GC 仍须实测
    ├── director.js       # 撞洞/同帧多人落车，0.12s 微顿与镜头导演
    ├── render.js         # 纯 Canvas 舞台渲染（0黑边延展、5套涂装、喜剧表情、特写与大字吐槽）
    ├── ui_canvas.js      # 全 Canvas 纯中文触控 UI 与合规弹窗（可点击 8+、双态侧边栏）
    └── audio.js          # WebAudio 合成音效 + 震动反馈 + 切后台/广告静音
```

---

## 二、导入字节跳动开发者工具与上线配置

1. 在本目录执行 `npm ci`、`npm run build`，再通过 **字节跳动开发者工具** →「小游戏」→「导入项目」选中 `dist/`。源码目录保留浏览器预览入口；直接导入源码不构成包体达标。
2. 候选中的 `project.config.json` 默认使用空白应用标识，由用户在本机开发者工具中配置。本轮不读取或迁移原工程 App ID。
3. 如需真实激励广告，由用户在本机配置 `src/config.js` 的 `rewardedAdUnitId`。执行 **`npm run build:production`** 会在编译时强制 `DEV_MOCK_AD=false`，不修改源配置；未配置广告能力时提示暂无广告并且不发奖。普通 `build` 仅用于开发，可模拟广告。
4. `dist/` 是可重建产物；重新构建会更新该目录，不要在其中维护唯一源码。上传、发布、资质和平台能力验收单独进行。

---

## 三、本地回归测试与横屏预览

Windows 安装 Node.js 后，双击 `start.cmd` 即可打开最新源码预览，无需安装 npm 依赖或重新打包。脚本自动选择空闲的本机端口，终端显示地址与 PID；按 Ctrl+C 或关闭启动窗口可停止服务。

命令行可用 `npm start`。`start.cmd --no-open` 只启动服务；`start.cmd --dist` 预览现有打包候选，不会自动构建或覆盖 `dist/`。

```bash
# 安装锁定的构建工具（运行时仍无第三方依赖）
npm ci

# 物理回归、SDK 事件时序、UI 热区/存档、构建与本机预览边界
npm test

# 开发候选 / 关闭模拟奖励的生产候选
npm run build
npm run build:production

# 启动本地预览服务（http://127.0.0.1:4174/）
node serve.mjs

# 预览当前打包候选
node serve.mjs --dist

# 可选浏览器路径回归，需要本机 Python Playwright 与已安装的 Chromium
# 脚本自行启动本机随机端口，结束后停止自有服务，保留原图和哈希
python tests/browser_qa.py
python tests/browser_qa.py --dist  # 开发候选，包含模拟广告路径
python tests/browser_qa.py --dist --smoke  # 生产候选基础页面
python tests/browser_qa.py --dist --width 844 --height 390  # 小屏全流程
python tests/browser_qa.py --dist --hints-only --width 844 --height 390

# 物理耗时/GC/分配采样；额外预热样本不能代表首局
node --expose-gc tests/performance.mjs
node --expose-gc tests/performance.mjs src/physics.js --warm
```

---

## 四、平台配置与待验收清单

- [ ] **资质材料**：软著登记与抖音小游戏备案材料已备齐（见 `docs/legal/README.md`），待本人实名提交与审核，尚未取得证书与备案号。
- [ ] **配置核查**：用户在开发者工具中完成应用标识配置；本机配置广告能力，使用 `npm run build:production` 生成候选。
- [ ] **适龄与忠告**：首页左下 `8+` 图标可点击弹出完整 CADPA 适龄说明弹窗，底部展示完整健康游戏忠告。
- [ ] **侧边栏复访双态**：非侧边栏进入时点「侧边栏礼」弹出引导卡并跳转侧边栏（不直接发奖）；从侧边栏进入后可领取当日奖励。
- [ ] **录屏与广告**：播激励视频时自动暂停并静音；切后台自动暂停录屏、返回恢复；录屏 ≥3 秒后可一键挂载 `#超载快车` 发布抖音。
- [ ] **内容与包体**：纯中文、无真实地名/铁路局商标、无 Emoji 乱码、线上主包 `< 300 KB`。

当前生产候选为 262539 bytes（低于 300000 bytes 限制，含完整 24 张热梗成就卡牌手绘插画与全部玩法系统），模拟广告已关闭。健康忠告已补「《健康游戏忠告》」标题以满足小游戏备案要求。十关人数为 25/32/40/48/55/62/68/74/80/90；新乘客提示 2.5 秒；强力胶 +30%、菜篮范围 +40%、竹竿拉索翻倍，两个空降词条直接上车，基础车票按实乘人数计算。

清单中的资质、真实平台能力及审核结果未在本轮核验。物理热循环已去掉显式临时数组，复用投影/统计/预警/索引并拆分求解阶段；Node 分配与 GC 样本仍记录到 GC，不能宣称绝对零 GC、整应用零分配或移动端 60fps。
