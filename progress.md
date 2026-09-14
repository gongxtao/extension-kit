# Session Progress Log

> 本文件是跨会话状态的**唯一真源**之一（另一个是 `feature_list.json`）。每次会话结束前必须更新；聊天记录不可作为状态依据。

## Current State

**Last Updated:** 2026-09-14（feat-013 收口，13/13）
**Active Feature:** 无——框架十模块 + demo 端到端验证 + 接入教程 + 仓去标识全部收口；下一主题 = 产品 #2 开工（首个真实消费者）
**主线状态:** 框架 v0.1.0 已发布（GitHub Packages，github.com/gongxtao/extension-kit 私有）；基线 229 测试 + 10 入口；demo 真机六断言全绿；docs/onboarding.md 接入教程（代码块经编译门持续校验）；全仓已无历史内部仓引用

## Status

### What's Done

- [x] feat-001 harness + 工具链（init.sh 三步可跑）
- [x] feat-002 /config createKit（F20 六派生面）+ example + chrome-smoke 脚本化
- [x] feat-003 /messaging kitMessages 7 kind + defineMessages（metadata 透传 F17/F24）
- [x] feat-004 /io 四件（StorageArea 单点 F8 / clipboard R116+R121 / asset-io / flag-store F15）
- [x] feat-005 /session 四件（single-flight / 写代次 / watch 串行化矩阵；me-cache 泛型化 + key 缝补裁定）
- [x] feat-006 /api apiFetch 传输核（纯传输，账户形状归产品 F3）
- [x] feat-007 /panel（prefs keys 注入；host 三注入缝 + F23 文案零缺省）
- [x] feat-008 /react useSession 泛型化（react 可选 peer）
- [x] feat-009 /content 四层（CaptureSource 契约 F26 / imageCapture / handoff / badge F23 / runtime / background F13；§4 分层 eslint 第一刀）
- [x] feat-010 /testing 假件工厂 + README + release.yml + 0.1.0 出口门实测 + Actions 发布全绿
- [x] feat-011 demo 端到端消费验证（demo-smoke 六断言真机全绿复跑两轮）
- [x] feat-012 接入教程 docs/onboarding.md（snippet-verify 编译门 + 教程单测入套件）+ README 骨架修正
- [x] **feat-013 全仓去标识 + README 更新**（2026-09-14，用户指令）：README 重写（状态/教程/demo 链接）；CLAUDE.md 落地质则改为「design.md 唯一真源 + 既有实现为行为基准」；design.md 溯源章节去标识化为「§9 实施记录（模块→commit）」、§3/§5 表去源列、§10 改为演进纪律；源码注释去出处链（保留 F/R 裁定编号与踩坑记录本体）；测试夹具 ns 与域名中性化；状态三件套重写

### What's In Progress

- 无——全部特性收口

### What's Next

1. **产品 #2 开工**（首个真实消费者）：npm link / 钉版联调 DX 实战验证；新抓取源按 F26 契约随需加
2. 框架独立演进走 README「变更协议」（bump → v* 标签 → Actions 发布 → 产品升版全绿）

## Blockers / Risks

- [ ] 品牌 Chrome 137+ 禁 --load-extension（playwright 助手与 chrome-smoke/demo-smoke 均已注记；Chrome for Testing/Chromium 不受限）
- [ ] 分层 eslint 第二刀（上层值级 import 禁令）——no-restricted-imports 无法区分 import type，暂以 verbatimModuleSyntax + review 守
- [ ] npm link 联调 DX——产品 #2 接入时验证

## Decisions Made

- me-cache key 缝补裁定（feat-005）：F7/F15 文本漏列 key，按 F15「新增缝按序追加」补为第 3 位必填参
- sourceOf 站点映射不进框架（F17）：框架零站点知识，值域/映射/角位全注入
- example 采用 file:.. 符号链接而非 workspaces：根基线零扰动
- CDN 兜底接线收敛到源声明（feat-009）：decodeCdn 声明 + makeCanvas 注入才接线
- react 可选 peer（feat-008）：peerDependenciesMeta.optional
- /testing 假件零 vitest 依赖（feat-010）：发布物不强制消费方装 vitest
- **仓去标识（feat-013，用户指令 2026-09-14）**：清除历史内部参照仓的一切引用——技术契约/裁定编号（F/R）与踩坑记录保留为**本仓内部资产**，出处链（仓名/路径/commit/跨仓文件行号/外部文档引用）移除；CLAUDE.md 铁律同步改为以本仓 design.md 与既有实现为真源

## Files Modified This Session（feat-013）

- `README.md` / `package.json` / `CLAUDE.md` - 重写/去标识
- `docs/design.md` - 去标识化重写（§9 实施记录 / 表列裁剪 / §10 演进纪律）
- `src/**`（39 文件）- 注释出处链清除 + 夹具 ns/域名中性化
- `example/wxt.config.ts` / `demo/wxt.config.ts` - 注释清除
- `feature_list.json` / `progress.md` / `session-handoff.md` - 重写为当前纪元

## Evidence of Completion

- [x] 13/13 特性 done（feature_list.json 全带 evidence 与落地 commit）
- [x] `./init.sh` 三步绿：eslint+tsc 零错误 / vitest 全绿（229 tests）/ tsdown 10 入口 + assert-exports 对齐
- [x] Chrome 真机冒烟：example 四段 + demo 六断言各自 EXIT=0（demo 复跑两轮）
- [x] v0.1.0 已真实发布（Actions release workflow 四步 success）
- [x] feat-013 出口门：全仓 grep 对历史标识符（仓名/commit/ns 前缀等五种变体）零命中
