# Session Progress Log

> 本文件是跨会话状态的**唯一真源**之一（另一个是 `feature_list.json`）。每次会话结束前必须更新；聊天记录不可作为状态依据。

## Current State

**Last Updated:** 2026-09-13（feat-010 收口，10/10 全部完成）
**Active Feature:** 无——P0–P3 全量收口；下一主题 = 产品 #2 开工（首个真实消费者）
**主线状态:** 框架 v0.1.0 发布就绪（220 测试 / 10 subpath 入口 / Chrome 冒烟可脚本化 / tarball 真装实测）；远程仓 github.com/gongxtao/extension-kit（私有）已建并首推

## Status

### What's Done

- [x] 设计定稿（v2 + F1–F28 五轮 review）+ feat-001 harness（此前会话，见 git log）
- [x] **feat-002 /config + example**（e7d98b3，2026-09-13）：createKit 六派生面 TDD（§5 清单逐字节等价）+ 导出路径断言固化 + example WXT 插件 + Chrome 冒烟可脚本化（scripts/chrome-smoke.mjs）
- [x] **feat-003 /messaging**（9ec68a1）：kitMessages 7 kind + defineMessages（守卫矩阵 copy 源 is*；source→metadata F17/F24；ack 不占 kind F12）
- [x] **feat-004 /io**（ae07b7b）：StorageArea 单点 F8 / clipboard R116+R121 / asset-io 核 / flag-store F15
- [x] **feat-005 /session**（503f297）：四件 copy-out（single-flight/写代次/watch 串行化矩阵全保留）/ me-cache 泛型化 + **key 缝补裁定**（F7/F15 文本漏列按 F15 规则补位，design.md §3 已记）
- [x] **feat-006 /api**（2431c6b）：apiFetch 传输核（MeInfo 归产品 F3）
- [x] **feat-007 /panel**（0c656a1）：prefs keys 注入 + host 三注入缝 + ariaLabel 零缺省 F23 + borderStyle 可覆盖
- [x] **feat-008 /react**（1167b3a）：useSession 泛型化（fetchAccount/baseUrl 注入；react 可选 peer）
- [x] **feat-009 /content**（353aba1）：CaptureSource 契约 F26 / imageCapture（sourceOf 随 F17 删）/ badge F23 品牌注入 / runtime+background 矩阵全保留 / §4 分层 eslint 第一刀
- [x] **feat-010 /testing + 发布**（4f60eab）：假件工厂最小集（零 vitest 依赖）/ Playwright 助手（结构类型）/ README 重写 / release.yml / **0.1.0 出口门实测**（pack→tarball 真装→三入口导入）
- [x] 远程仓创建首推：github.com/gongxtao/extension-kit（私有，gh 已认证 gongxtao——原 scope 核对项关闭）

### What's In Progress

- 无——全部特性收口

### What's Next

1. **打 v0.1.0 标签触发发布管线**（或留给产品 #2 接入时机）——若 Actions 因 Workflow permissions 失败，开 read/write packages 后重打
2. **产品 #2 开工**（design.md §8 终行）：npm link / 钉版联调 DX 实战验证；新抓取源按 F26 契约随需加
3. 框架独立演进走 README「变更协议」

## Blockers / Risks

- [ ] GitHub Packages 首次真发布未验证（打标签即知；权限开关见 session-handoff）
- [ ] example 集成 /content 徽标抓图链的 Chrome 冒烟（P2 出口门的 example 侧）——框架侧矩阵单测全绿 + chrome-smoke 面板链全过；徽标抓图链真机冒烟待 example 升级为完整装配后做
- [ ] 品牌 Chrome 137+ 禁 --load-extension（playwright 助手与 chrome-smoke 均已注记）
- [ ] 分层 eslint 第二刀（session/api/panel/content 值级 import 禁令）——no-restricted-imports 无法区分 import type，暂以 verbatimModuleSyntax + review 守

## Decisions Made

- **me-cache key 缝补裁定**（2026-09-13，feat-005 实装）：F7/F15 文本签名 `(area, validate, now?)` 漏列 key——§5 键 ns 化要求键经 kit.key 派生，按 F15「新增缝按序追加」规则补为 `(area, validate, key, now?)`；design.md §3 已回写
- **sourceOf 站点映射随 F17 删除**（feat-009）：框架零站点知识——测试中 hostname→source 分化用例改为「装配注入分化」用例
- **example 采用 file:.. 符号链接而非 npm workspaces**（feat-002）：根基线零扰动（lint/test/build 不涉 example），file: 协议 npm 5+ 即符号链接，最贴近真实消费者 DX
- **CDN 兜底接线收敛到源声明**（feat-009）：background 的 cdnGrab 分支仅在 captureSource.decodeCdn 声明且 makeCanvas 注入时接线（F5 声明式 opt-in 的兑现）——无声明源发 cdn-grab 消息静默
- **react 可选 peer**（feat-008）：多入口包中仅 /react 需要 react——peerDependenciesMeta.optional 免除非 react 消费者的 peer 警告
- **/testing 假件零 vitest 依赖**（feat-010）：发布物不强制消费方装 vitest（observer 桩用计数器替代 vi.fn）

## Files Modified This Session

- `src/config` `/messaging` `/io` `/session` `/api` `/panel` `/react` `/content` `/testing` - 九个模块全量（源 + 测试 + index）
- `src/index.ts` - 根便捷入口（createKit + messaging/io/session/api/panel 全类型；**不含 /react**——react 隔离）
- `scripts/assert-exports.mjs` / `scripts/chrome-smoke.mjs` - 新建（§6 断言 + Chrome 冒烟）
- `example/` - 新建（WXT 装配活样例 + README）
- `package.json` - 0.1.0 / private:false / 10 入口 exports / publishConfig / peer react / repository
- `tsdown.config.ts` - 十入口
- `eslint.config.mjs` - ignores example + §4 分层第一刀
- `.github/workflows/release.yml` - 新建（v* 标签发布）
- `README.md` - 重写（装配指南/变更协议）
- `docs/design.md` - §9 溯源表 commit 列回填（feat-002~010）+ §3 me-cache key 裁定
- `feature_list.json` / `progress.md` / `session-handoff.md` - 全程随做随更

## Evidence of Completion

- [x] 10/10 特性 done（feature_list.json 全带 evidence 与抽离 commit）
- [x] `./init.sh` 三步绿（最终轮）：eslint+tsc 零错误 / vitest **220 tests (21 files)** / tsdown 十入口 + assert-exports「10 入口对齐」
- [x] Chrome 真机三断言（scripts/chrome-smoke.mjs，EXIT=0 两轮）
- [x] 0.1.0 可安装：pack dry-run → tarball 真装（/tmp 隔离目录）→ import('@gongxtao/extension-kit') + '/testing' + '/config' 冒烟通过
- [x] 远程仓首推：origin = github.com/gongxtao/extension-kit（私有）
