# Session Handoff

> 跨会话状态真源 = `docs/design.md`（设计）+ `feature_list.json` / `progress.md`（状态）；本文件是给下一个会话的快速入口。

## Current Objective

- Goal: ~~按 `docs/design.md` 实施 P0–P3~~ → **已完成（2026-09-13）：10/10 特性 done，框架 v0.1.0 发布就绪**
- Current status: feat-001～feat-010 全部收口（220 测试 / 10 subpath 入口 / init.sh 三步绿 / Chrome 真机冒烟三断言可脚本化全过 / 0.1.0 tarball 真装实测）；远程仓 github.com/gongxtao/extension-kit（私有）已建并首推
- Branch / commit: `main`（最新见 `git log --oneline -5`）

## 铁律：落地质则（仍然最高优先级，产品 #2 接入期继续适用）

**所有实现以 ready-svg@95d0842 为唯一实现参照——copy-out（抄代码 + 抄测试）+ 按 design.md 泛化，禁止从零发明。**

1. 每个 API 形状能在 ready-svg 指出对应物（design.md §9 溯源映射表已回填抽离 commit 列）
2. 新抽象回 design.md 补裁定（唯一例外：createKit，F20 登记在案）
3. 泛化 = 参数化 + design.md 明列接口化；保持函数结构/DI 缝/守卫纪律/踩坑注释随码走

## Completed（2026-09-13 本会话：P0 剩余 + P1 + P2 + P3 全量实施）

- **feat-002 /config**（e7d98b3）：createKit 六派生面（F20 契约，TDD 7 测试：§5 清单 ns='rsvg' 逐字节等价）+ §6 导出路径断言固化（scripts/assert-exports.mjs）+ example/ 最小 WXT 插件（ns=exkit 装配）+ Chrome 冒烟可脚本化（scripts/chrome-smoke.mjs，CDP 三断言）
- **feat-003 /messaging**（9ec68a1）：kitMessages 内置 7 kind + defineMessages 工厂（守卫矩阵 copy 自源 is*；source→metadata 透传 F17/F24；ack 不占 kind F12）
- **feat-004 /io**（ae07b7b）：StorageArea 单点（F8）/ clipboard 回退链 R116+R121 / asset-io 核 / flag-store（F15 位置参）
- **feat-005 /session**（503f297）：session-codec / auth-rest / session-store 近原样（single-flight L6、写代次终审 I-2、watch 串行化修复轮一矩阵全保留）/ me-cache 泛型化（**key 缝补裁定**：F7/F15 文本漏列，按 F15 规则补 `(area, validate, key, now?)`——design.md §3 已记）
- **feat-006 /api**（2431c6b）：apiFetch 传输核（signed_out 短路/401 穿透/request_failed 归拢/multipart/raw 矩阵全保留；MeInfo 归产品 F3）
- **feat-007 /panel**（0c656a1）：panel-prefs keys 注入 + panel-host（domId/closeMessage/resizeAttr 注入 + ariaLabel 零缺省 + borderStyle 可覆盖 F23）
- **feat-008 /react**（1167b3a）：useSession 泛型化（fetchAccount/baseUrl 注入 + TMe；乐观首绘/TTL/request_failed 保持现态矩阵全保留；react 可选 peer）
- **feat-009 /content**（353aba1）：CaptureSource 契约（F26）/ imageCapture（sourceOf 随 F17 删除）/ handoff 键注入 + metadata 透传 / badge-overlay F23 品牌注入 + CSS 名 ns 化 / content-runtime（R42-R90 矩阵）/ background F13 整体参数化 / §4 分层 eslint 第一刀
- **feat-010 /testing + 发布**（4f60eab）：假件工厂最小集（storage/cookies/menus/runtime/observer，零 vitest 依赖）+ Playwright 助手（结构类型零依赖）+ README 重写 + release.yml + 0.1.0 出口门实测（pack→tarball 真装→三入口导入）

## Verification Evidence（本会话累计）

- `./init.sh` 三步绿：eslint+tsc 零错误 / vitest **220 tests（21 文件）** / tsdown 10 入口 + assert-exports 对齐
- Chrome 真机三断言（scripts/chrome-smoke.mjs EXIT=0 复跑两轮）：扩展加载注入 / 面板开合全链 / ns 三名字 console 实证
- 0.1.0 可安装：npm pack dry-run（40 files 49.4kB）→ /tmp 临时目录 tarball 真实 npm install → 根/config/testing 导入冒烟通过
- 远程仓：github.com/gongxtao/extension-kit（私有）已建，main 已首推

## Next Session Startup

1. `pwd && git status --short --branch && git log --oneline -5`（新 shell 先 `nvm use`）
2. 读 `CLAUDE.md` → `docs/design.md` → `progress.md` → 本文件
3. `./init.sh` 基线先绿
4. **产品 #2 开工**（design.md §8 最后一行——首个真实消费者）：npm link / 钉版联调 DX 实战验证；具体抓取源随产品需求按 F26 契约加
5. 框架后续改进走「变更协议」（README）：bump semver → 打 v* 标签 → Actions 发布 → 产品侧升版全绿

## Blockers / Risks

- [x] ~~GitHub Actions 发布管线未实战跑过~~ —— **v0.1.0 已真实发布**（release workflow 四步全绿含 npm publish；包已入 GitHub Packages）
- [x] ~~example 集成徽标抓图链冒烟（P2 出口门）~~ —— **已闭合**：example 升级为框架真实装配，chrome-smoke 扩四段断言真机全绿（canvas 造大图自包含零网络依赖）
- [x] ~~`@gongxtao` scope 核对~~ —— GitHub 账号同名（gongxtao），原 open item 关闭
- [ ] 品牌 Chrome 137+ 禁 --load-extension：playwright 助手标注适用 Chromium/CF T；chrome-smoke 前置须 UI 载入一次（example/README 记录）
- [ ] 本地/CI 外机器查询与安装包需按 README 配 .npmrc PAT（read:packages）——安装侧一次性前置
- [ ] npm link 联调 DX——产品 #2 接入时验证
