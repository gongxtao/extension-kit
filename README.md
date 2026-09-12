# Extension Kit

浏览器插件通用能力框架（headless）——会话同步 / 页内面板宿主 / 页面集成抓取 / 消息协议 / 测试基建。新产品起步 = WXT 入口装配 + 业务视图，基础管线零重写。

## 状态

**harness 就绪、实施待始**（2026-09-12）——设计 [docs/design.md](./docs/design.md)（v2）定稿；feat-001 harness & 工具链收口（`./init.sh` 三步全绿）；下一步 feat-002（P0 剩余：createKit + example 插件），入口见 [session-handoff.md](./session-handoff.md)。

## 关键事实

- **抽离源**：ready-svg 插件（`ready-svg/extension/src/lib`，基线 commit `95d0842`）——copy-out 抽离，ready-svg 仓零改动
- **形态**：`@gongxtao/extension-kit` 单包多入口（subpath exports ×9），headless（无 UI 组件；核心零 React，逻辑 hooks 走 /react 子路径 peer React），核心运行时零依赖
- **首个消费者**：产品 #2（需登录 web 账号 + 抓取页面内容的插件，待开工）
- **可选模块**：`/content` 页面集成——产品不 import 则不携带（无 content script、无 host 权限需求）

## 会话启动路径（对齐 ready-svg 仓惯例；harness 已就位）

1. `pwd && git status --short --branch` 确认目录与分支（新 shell 先 `nvm use`）
2. 读 `CLAUDE.md` 启动头（含落地质则铁律）→ `docs/design.md`（真源）→ `session-handoff.md`（会话入口）→ `feature_list.json` / `progress.md`
3. Run `./init.sh`（lint → unit → build，fail-fast）
4. `git log --oneline -5` 对齐最近变更
