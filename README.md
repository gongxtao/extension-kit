# Extension Kit

浏览器插件通用能力框架（headless）——会话同步 / 页内面板宿主 / 页面集成抓取 / 消息协议 / 测试基建。新产品起步 = WXT 入口装配 + 业务视图，基础管线零重写。

## 状态

**设计阶段**（2026-09-12）——设计文档 [design.md](./design.md)（v2）定稿待审；实施未开始（P0–P3 见 design.md §8）。

## 关键事实

- **抽离源**：ready-svg 插件（`ready-svg/extension/src/lib`，基线 commit `95d0842`）——copy-out 抽离，ready-svg 仓零改动
- **形态**：`@gongxtao/extension-kit` 单包多入口（subpath exports ×9），headless（无 UI 组件；核心零 React，逻辑 hooks 走 /react 子路径 peer React），核心运行时零依赖
- **首个消费者**：产品 #2（需登录 web 账号 + 抓取页面内容的插件，待开工）
- **可选模块**：`/content` 页面集成——产品不 import 则不携带（无 content script、无 host 权限需求）

## 会话启动路径（对齐 ready-svg 仓惯例）

1. `pwd && git status --short --branch` 确认目录与分支
2. 读 `design.md`（本仓真源文档）+ `progress.md`（会话日志）+ `feature_list.json`（特性状态）
3. Run `./init.sh`（P0 建立后；lint → unit → build，fail-fast）
4. `git log --oneline -5` 对齐最近变更
