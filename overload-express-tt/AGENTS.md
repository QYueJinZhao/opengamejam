# overload-express-tt

- 产品依据为用户指定规划的原字节快照 `docs/specs/douyin_minigame_plan.md`；与旧 README 的参数差异以该规划为准。职责与验收边界见 `docs/project-role.md`。
- 本工程是抖音小游戏，运行时保持纯 Canvas2D、中文文案、零第三方依赖；浏览器仅作本地预览适配。
- 只改本目录；保留开始时的未跟踪文件，不提交、推送、部署或上传提审。
- 本地预览仅监听 `127.0.0.1`；已有预览进程视为外部进程，不接管或停止。
- 回归入口：`npm test`；开发包：`npm run build`；生产候选：`npm run build:production`。主包按 UTF-8 未压缩文件总字节严格小于 200000 验证。
- QA 收尾引用 `C:/Users/ASUS/.codex/skills/project-qa-lifecycle/SKILL.md`；本项目保留原始验收截图及 SHA-256。每次任务使用独立 `qa/<task-id>/` 与仓库忽略目录 `.workbuddy/tasks/<task-id>/` 存放证据及原件，单任务证据预算 10 MiB，旧证据保留原范围。
