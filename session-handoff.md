# Session Handoff

> 跨会话状态真源 = `docs/design.md`（设计）+ `feature_list.json` / `progress.md`（状态）；本文件是给下一个会话的快速入口。

## Current Objective

- Goal: `@gongxtao/extension-kit` 插件通用能力框架——**已完成（2026-09-14）：13/13 特性收口，v0.1.0 已发布**
- Current status: 框架十模块（228+ 单测 / 10 subpath 入口）+ demo 端到端验证（真机六断言）+ 接入教程（docs/onboarding.md，代码块经编译门）+ 全仓去标识（无历史内部仓引用）；远程仓 github.com/gongxtao/extension-kit（私有）与 origin/main 同步
- Branch / commit: `main`（最新见 `git log --oneline -5`）

## 铁律：落地质则（最高优先级）

**docs/design.md 是唯一设计真源；已实装的十模块代码 + 测试是行为基准。改动先对齐它们，禁止从零发明。**

1. 新能力/新抽象：先回 design.md 对应节核对或补裁定（F/R 编号），再动手
2. 修行为：先读对应模块测试矩阵（锁定既有语义），改语义连测试一起改并说明理由
3. 泛化纪律：参数化优先；产品文案与品牌资产一律注入、框架零缺省（F23）
4. 多产品共存靠 ns 隔离（§5）——新全局名字必须经 kit 派生
5. 注释里的踩坑记录（lastError 回调语义 / z-index 同值压制 / cookie 撕裂时序）是资产，保留技术内容

## Completed（里程碑摘要）

- P0：harness + createKit + example + chrome-smoke 脚本化（feat-001/002）
- P1：messaging → io → session → api → panel → react 六模块 TDD 搬迁（feat-003~008）
- P2：/content 四层（CaptureSource 契约 F26 / imageCapture / badge / runtime / background F13）（feat-009）
- P3：/testing 假件工厂 + README + release.yml；v0.1.0 tarball 真装实测 → Actions 发布全绿（feat-010）
- demo 端到端消费验证（ns=demokit，demo-smoke 六断言真机全绿复跑两轮）（feat-011）
- 接入教程 docs/onboarding.md 九节 + README 骨架修正（snippet-verify 编译门 + 教程单测入套件）（feat-012）
- 全仓去标识 + README/CLAUDE/design 重写为当前纪元（feat-013）

## Verification Evidence

- `./init.sh` 三步绿（229 tests / 10 入口 exports↔dist 对齐）
- Chrome 真机：example 四段断言 + demo 六断言，各自 EXIT=0
- v0.1.0 发布：Actions release workflow lint/test/build/npm publish 四步 success
- 去标识 grep 门：全仓对 ready-svg|readysvg|Ready SVG|95d0842|rsvg 零命中（排除 node_modules/.git/dist/.omc/.workbuddy/.output）

## Next Session Startup

1. `pwd && git status --short --branch && git log --oneline -5`（新 shell 先 `nvm use`）
2. 读 `CLAUDE.md` 启动头 → `docs/design.md` → `docs/onboarding.md` → `progress.md` → 本文件
3. `./init.sh` 基线先绿
4. **产品 #2 开工**（首个真实消费者）：按 onboarding 教程接入；npm link / 钉版联调 DX 实战验证；新抓取源按 F26 契约加
5. 框架改进走 README「变更协议」

## Blockers / Risks

- 品牌 Chrome 137+ 禁 --load-extension：冒烟前置须 UI 载入一次（example/demo README 记录）；Chromium/Chrome for Testing 不受限
- 安装/查询包需按 README 配 .npmrc PAT（read:packages）——每机一次性前置
- npm link 联调 DX——产品 #2 接入时验证
- 分层 eslint 第二刀（上层值级 import 禁令）暂缓——no-restricted-imports 无法区分 import type
