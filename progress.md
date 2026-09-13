# Session Progress Log

> 本文件是跨会话状态的**唯一真源**之一（另一个是 `feature_list.json`）。每次会话结束前必须更新；聊天记录不可作为状态依据。

## Current State

**Last Updated:** 2026-09-13（feat-002 收口）
**Active Feature:** feat-002 /config createKit + example 插件——**done（2/10）**；下一特性 feat-003 /messaging（defineMessages 工厂 + kitMessages 内置协议）
**主线状态:** 设计定稿（F1–F28 收口）；P0 全部完成（feat-001 harness + feat-002 createKit/example）；P1 确定性核心搬迁待始（§8：messaging → io → session → api → panel → react）

## Status

### What's Done

- [x] 设计 v2 落库（commit `901fece`）+ 自审五处修订 F1–F5（`f5c22ad`）+ docs/ 归位（`79e1eee`）+ 会话交接 session-handoff.md（`4a8664a`）——详见 design.md 与 git log
- [x] feat-001 Harness & toolchain bootstrap（本会话，2026-09-12）：
  - harness 四件套定制：CLAUDE.md（启动头 + **落地质则铁律**进 Working Rules 上方）/ feature_list.json（10 特性种子对齐 design.md §8）/ progress.md / init.sh（三步 fail-fast）
  - 工具链骨架：package.json（`@gongxtao/extension-kit` 0.0.0 private，纯 ESM）+ tsconfig（strict/bundler/verbatimModuleSyntax）+ eslint flat（typescript-eslint recommended）+ vitest（node 环境，DOM 模块接入再切 jsdom）+ tsdown（esm + dts）+ src/index.ts 占位 + smoke 测试 + .gitignore + .nvmrc（24.13.1 对齐 ready-svg）
  - **实装期捕出真缺陷**：tsdown 0.23 esm 产物为 `.mjs`/`.d.mts`，package.json 初版指向 `.js`/`.d.ts` 会令消费者 import 404——入口修正为实产文件名
- [x] 依赖安装：typescript 5.9.3 / eslint 9.39.1 / typescript-eslint 8.67.0 / vitest 4.1.11 / @types/node 20.19.25 / tsdown 0.23.0（前五者与 ready-svg extension 同版本钉齐）
- [x] **设计二轮 review（外部 AI）修订 F6–F11**（本会话，2026-09-12）——8 条发现逐条对照 ready-svg 源码验证全部成立后落墨：
  - F6 §3 新增「入口层边界」小节（entrypoints content/background 框架壳 vs 产品壳二分）+ §9 补 /content/runtime、/content/cdn 两行溯源
  - F7 me-cache 泛型化落形：`createMeCache<T>({ area, validate, now? })`，条目 `{value, userId, savedAt}`（**签名已被 F15 收紧取代为位置参 `createMeCache<T>(area, validate, now?)`——以 design.md §3 为准**）
  - F8 StorageArea 类型归宿 /io（源定义在业务文件 convert-stores.ts:23；含 onChanged 扩展形状；handoff 重复声明收敛）
  - F9 capture source 接口合一为 `isTarget`（源 isBadgeTarget 本就被扫描/点击两次调用，双方法是发明）
  - F10 README + D4 权限说法修正（/panel 同居 content script 上下文）
  - F11 §5 附 ns 全量清单表（5 存储键 + 7 消息 kind + DOM id/data 属性/CSS 动画名，P1/P2 搬运验收基准）+ 逐字节兼容限定到 framework-bound 文件 + 非目标补多产品布局红线 + §6 补导出路径断言
- [x] **设计三轮 review（外部 AI 复核 F6–F11）修订 F12–F16**（本会话，2026-09-12）——复核确认 F6–F11 六条与源吻合；新提 7 发现（1 实质 + 6 一致性）逐条验证全成立：
  - F12 名字与计数一致性三处：§5 正文幽灵名 `${ns}-badge-host` 清除（源徽标宿主走 data 属性无 id）；§3「7 消息形」改「handoff 6 + panel-host close-panel」对齐 §9；kitMessages 注释「handoff 三件套」改 7 kind 正确分组（ack 是返回类型不占 kind）
  - F13 **background 边界参数化裁定 (a)**：`setupPageIntegration` 整体进框架参数化（菜单 title/contexts 注入、id 缺省 `${ns}-convert` 派生）——菜单硬编码在函数体内（:73-85）物理切不开，(b) 拆函数+拆 312 行测试 = 重构结构，违铁律「保持函数结构」；产品壳留**值的注入**与 manifest 快捷键
  - F14 溯源按能力归位：deliverHandoff（两分支共用收口）→ /content/handoff 行；cdn 行收敛为 cdnGrab 分支 + makeOffscreenCanvas；新增 /content（background 装配面）行
  - F15 createFlagStore(area, key) 落形 + store 构造器参数风格规则（同参个数保持位置参；新增注入缝 ≥3 参走对象参，对齐源 createPanelHost/createBadgeOverlay 先例）
  - F16 菜单 id rsvg-convert 登记进 §5 清单 + P0 断言口径 = createKit 派生面全表（纯字符串派生不依赖模块实现，P0 一次锁死 ns 契约）
- [x] `.workbuddy/`（外部 AI 记忆区）加入 .gitignore——保留不删
- [x] **设计四轮 review（外部 AI）修订 F17–F22 + F15 判据收紧**（本会话，2026-09-12）——复核确认 F12–F16 全部落准后，新提 6 设计缺口 + 2 小项，逐条验证全成立：
  - F17 sourceOf 站点映射与 ImageSource 值域归产品（源 page-image.ts:57-66 硬编码两域为纯业务；框架零站点知识，走 §5 metadata 透传 + cornerFor 泛型，映射经装配注入）
  - F18 HANDOFF_MAX_BYTES（源 page-image.ts:21，交接通道上限）按 F14 能力归位随 /content/handoff 走；GrabFailReason 六值跨层标注；page-image.test 231 行按能力拆分
  - F19 §4 配置三层归属表（KitConfig 跨模块全局·当前仅 ns / 模块装配参数 / 产品常量永不持）+ 升层规则（≥2 模块消费或全局唯一才升 KitConfig）
  - F20 §5 createKit 接口契约钉死（key/kind/domId/dataAttr/cssName/menuId 六派生面）+ **唯一无源对应物抽象的显式例外登记**（约束：纯字符串派生、ns='rsvg' 逐字节等价、新类别须回设计扩契约）
  - F21 §6 manifest 必备声明映射表（/panel WAR 漏一项 iframe 白屏·源有 manifest.test 锁 / cookies / host_permissions / contextMenus·F13 起框架必需 / downloads）
  - F22 §4 生命周期与清理纪律（destroy 还原 margin / {rescan, stop} 全摘 / dispose / 菜单幂等重建）
  - F15 收紧：判据从「≥3 参走对象参」改为「源的真实分界」——源位置参一律保持（新增缝按序追加），源 deps bag 四例（createPanelHost/createSessionStore/createBadgeOverlay/createConvertStores）保持；F7 的 me-cache 签名随改 `(area, validate, now?)`
  - 小项：§9 行正名 /content/runtime（background 半段）+ §4 runtime 树注 background 半段
- [x] **设计五轮 review（外部 AI）修订 F23–F28 + 两小项**（本会话，2026-09-12）——复核确认 F17–F22 + F15 收紧全部落准；新提 6 缺口逐条验证成立：
  - F23 §3 产品常量对账单 + 判据「框架可持通用视觉默认值（可覆盖），产品文案与品牌资产一律注入零缺省」——7 处逐行对账（sourceOf/badgeCornerFor/isSource 守卫/回退文案/LOGO_PATH+#f8b018/config 三常量/aria-label+TOAST）
  - F24 F17 泛化扩双通道：cdn-grab 同携 source（CdnGrabMessage/rescueViaCdn）+ isSource 两处守卫注入缝
  - F25 Grabber 正名废弃，统一「抓取源（capture source）」（D6/§3/§8 三处）
  - F26 §4 CaptureSource 接口契约（isTarget/extract/decodeCdn?{makeCanvas}——形状源自 page-image 导出面）+ runtime 调用时序 + 四注入点
  - F27 §4 页内注入纪律独立条款（Shadow DOM 隔离/:host all:initial、不改页面 DOM 唯一例外 squeeze、data-${ns}-* 标记 + z-index 2147483647 同值后到压制）
  - F28 §1 非目标补「仅 Chromium MV3（Chrome ≥123 随源钉）」
  - 小项①：本文件与 session-handoff 的 F7 陈旧签名补「已被 F15 取代」标注；小项②：F6 小节「全 DI」限定（panel-host 直用全局 document/window，非全 DI）
- [x] **feat-002 /config createKit + example 插件**（本会话，2026-09-13）——TDD 红→绿：
  - `src/config/createKit.ts`：KitConfig（namespace `[a-z0-9]+` 单段校验）+ Kit 六派生面（key/kind/domId/dataAttr/cssName/menuId，F20 契约）——唯一无源对应物抽象按 F20 例外登记约束实现（纯字符串派生无状态；ns='rsvg' 与源字面量逐字节等价，§5 全量清单即测试规格）
  - 测试 7 条：清单全表（5 存储键/7 消息 kind/DOM id+4 data 属性+2 CSS 名/菜单 id）+ testkit 参数化 + 非法 ns 拒绝 + 同参同果
  - 工程接线：tsdown/package.json 加 `./config` 入口；**§6 导出路径断言固化**（scripts/assert-exports.mjs 接进 build 步——每条 exports 路径 dist 实产存在再放行）；根入口重导出
  - `example/`：最小 WXT 插件（wxt 0.21.4 钉齐 ready-svg；`file:..` 引用框架 dist，非 npm workspaces——根基线零扰动）：kit.ts（ns='exkit'）+ background（菜单 kit.menuId('convert') + toolbar/menu 双消息链）+ content（iframe 宿主 kit.domId('panel-host') + toggle/show/close 三消息）+ panel.html（Close 按钮）；装配形态照 ready-svg 最小化裁剪
  - **Chrome 冒烟可脚本化**（§7「手动/可脚本化」兑现）：scripts/chrome-smoke.mjs——CDP 驱动（Page.navigate 直达扩展页作驱动上下文，避 MV3 SW 空闲自停竞态；扩展 id 从 profile Secure Preferences 自动发现），三断言全过复跑两轮
  - 实装期踩坑记录：品牌 Chrome 137+ 已禁 `--load-extension`（153 实证静默忽略）——须经 chrome://extensions UI 载入一次（README 记录）；/json/new 的 url 参数对扩展页无效须走 Page.navigate；残留顶层 panel.html 页会混入 target 列表，冒烟用 `window.parent !== window` 过滤真 iframe

### What's In Progress

- 无——feat-002 收口，无在途工作

### What's Next

1. **feat-003 /messaging**：defineMessages 轻量工厂（ns 前缀类型 + 守卫；畸形消息静默丢弃）+ kitMessages 框架内置 7 kind——源：handoff.ts 6 消息形 + panel-host.ts close-panel 提炼（§3/§9）
2. 其后按依赖序：feat-004 /io → feat-005 /session → feat-006 /api → feat-007 /panel → feat-008 /react → feat-009 /content → feat-010 /testing+发布

## Blockers / Risks

- [ ] `@gongxtao` scope 假设 GitHub 用户名与 git user（gongxtao）同名——feat-010 发布前核对，不同则改 package.json 一处（design.md §11）
- [ ] 产品 #2 抓取目标类型（图片之外）未定——D6 抓取源抽象已覆盖，不阻塞框架侧
- [ ] vitest node 环境：P1 接入 /panel /content /react 时需切 jsdom（vitest.config.ts 注记）
- [ ] npm link 联调 DX 未实战验证——无跨仓消费者，feat-010 发布管线 / 产品 #2 接入时验证（design.md §6）

## Decisions Made

- **harness 创建走 harness-creator skill 脚本打底 + 按 ready-svg 惯例全量定制**（2026-09-12，用户指示「先构建 harness，计划不着急」）
  - Context: 用户要求 extension-kit 遵循 harness 理论框架再谈实施计划
  - Alternatives: 仅写文档不接工具链（否——Verification 子系统必须 runnable，占位 init.sh 违背理论）；连 example/createKit 一起做（否——那是 feat-002，须走 writing-plans → 批准 → TDD 流程）
- **tsdown 产物入口用 `.mjs`/`.d.mts`**（对齐实产，不猜 outExtensions API）
  - Context: 初版 package.json 写 `.js`/`.d.ts` 与 tsdown 0.23 实际产物不符
  - Alternatives: tsdown outExtensions 改后缀（API 形状未验证，不赌）
- **设计 review 三裁定**（2026-09-12，用户确认 D/F、A 由用户授权以长期视角裁定）
  - A 入口层：§3 内紧凑小节 + §9 补行（否——只补行缺「框架壳/产品壳」裁决依据；独立一节为两个文件过度立章）
  - D 接口：isTarget 合一（否——双方法在源里无对应物，recheck 钩子同属发明）
  - F 形态：§5 附全量清单表（否——实现期自然长出则「键名集中管控」无验收基准，且丢搬运对账单）
- **三轮 review F13：background 边界走 (a) 整体参数化**（2026-09-12，我裁定、用户转发授权）
  - Context: setupPageIntegration 函数体内硬编码菜单 id/文案 + 312 行测试断言之，与 F6「注册留产品壳」自相矛盾
  - Alternatives: (b) 拆函数留壳（否——拆散函数结构 + 拆测试矩阵正是铁律禁止的重写式泛化；(a) 与 content 侧 startContentScript(deps) 对称且产品常量经注入兑现「框架不持产品常量」）
- **四轮 review 两裁定**（2026-09-12，依据铁律拍定，已在回复中向用户标明可否决）
  - F15 收紧选「一律保持源位置参」（否「含缝一律对象参」——后者要重写源里 5 个位置参构造器签名，违「保持函数结构」；判据换成源的真实分界 deps bag vs 单主体）
  - F19 配置三层表 + 升层规则（KitConfig 仅 ns；升层 = ≥2 模块消费或全局唯一——收拢 F13/§3/§4 已散落裁定，无新发明）
- **五轮 review 三裁定**（2026-09-12，依据铁律/先例拍定，已向用户标明可否决）
  - F26 时点 = 现在钉形（否「留 P2 实现反推」——D6 核心扩展点留到实现期正是铁律要防的自创 API；F20 已立「核心 API 先钉形」先例）
  - F27 强度 = 独立条款（否「并进 F22 一行」——约束对象不同：F22 进出契约 vs F27 页内静态纪律，产品自行注入 DOM 时要能查到）
  - F28 = 同意加非目标，版本下限跟源钉 123（未验证不承诺，需要时另立裁定）

## Files Modified This Session

- `src/config/createKit.ts` / `src/config/index.ts` / `src/config/createKit.test.ts` - 新建（/config 模块：KitConfig + Kit 六派生面 + 7 测试）
- `src/index.ts` - 根入口改便捷重导出（createKit + 全类型，保留 KIT_NAME smoke 锚点）
- `tsdown.config.ts` / `package.json` - 双入口（./config）+ build 步接导出路径断言
- `scripts/assert-exports.mjs` - 新建（§6 导出路径断言）
- `scripts/chrome-smoke.mjs` - 新建（example Chrome 冒烟可脚本化，三断言 CDP 驱动）
- `example/` - 新建（package.json / wxt.config.ts / tsconfig.json / README.md / src/lib/kit.ts / entrypoints background·content·panel）
- `eslint.config.mjs` - ignores 加 example/**
- `.gitignore` - 加 .output/ .wxt/（WXT 产物）
- `init.sh` - 尾注更新（冒烟可脚本化指向 example npm run smoke）
- `feature_list.json` / `progress.md` - feat-002 收口记录
- `docs/design.md` §9 /config 行 - 抽离 commit 回填（见 git log）

## Evidence of Completion

- [x] feat-002 出口门（2026-09-13 实跑）：
  - `./init.sh` 三步绿：eslint+tsc 零错误 / vitest 7/7（2 文件）/ tsdown 双入口 6 files + assert-exports「exports ↔ dist 全部对齐（2 入口）」
  - Chrome 真机三断言（scripts/chrome-smoke.mjs，EXIT=0 复跑两轮）：①扩展加载且 content 注入 ②面板开合全链（toggle 开 → 面板 iframe 内 Close 点击关 → toggle 再开 → 再关）③ns 三名字 console 实证 `{storageKey: exkit-me-cache, messageKind: exkit-toggle-panel, domId: exkit-panel-host}`
  - example 构建：wxt build 产物 manifest/panel.html/background.js/content 齐全；compile（tsc）零错误
- [ ] example Chrome 冒烟——feat-002 起已脚本化并实跑通过（上行）

## Notes for Next Session

- 落地质则铁律见 CLAUDE.md「落地质则」节 + session-handoff.md——**这是本仓最高优先级约束**（用户原话：框架一定要能落地，不能天马行空）
- createKit 是 feat-002 的 TDD 起点：接口契约已钉死在 **design.md §5 createKit 契约（F20）**——六派生面（key/kind/domId/dataAttr/cssName/menuId）+ 全量清单表（F11）即断言规格，勿再回源仓 grep 对账、勿自 invent 方法名
