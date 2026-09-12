# Extension Kit —— 插件通用能力框架设计（v2）

> 状态：设计定稿待审（2026-09-12）。v1 于 2026-09-06 定稿后撤回——因约束变化（ready-svg 冻结）修订为本版。
> 本仓 = 框架仓。抽离源 = ready-svg 插件（`ready-svg/extension/src/lib`，基线 commit `95d0842`，分支 `gongxtao`）。

## 1. 背景与目标

Ready SVG 插件（20/20 特性收口、待发版）沉淀了一套高质量的插件基础能力：会话同步、页内面板宿主、页面抓取集成、乐观缓存、消息协议、测试基建。用户将开发多个插件产品（产品 #2 已立项，需登录 web 账号 + 抓取页面内容），不希望每个产品从 0 起步。

### 目标

1. 通用能力进框架，单包分发；新产品起步 = WXT 入口装配 + 业务视图，基础管线零重写
2. 产品 #2 作为首个真实消费者，直接在框架上开发
3. **ready-svg 零改动**（copy-out 抽离：只抄不搬，本仓永不回头修改 ready-svg）

### 非目标（红线清单）

- 不做共享账号/计费后端（各产品独立 Supabase）
- 不做 UI 组件库（纯 headless；React 组件、业务状态机、API 端点、web 侧一概不进）
- 不做运行时接管型 SDK（不拥有入口/生命周期）
- 不抽象多认证后端（钉死 Supabase）
- 不做消息 RPC 框架、跨插件通信、消息版本协商
- 不迁移 ready-svg（除非用户未来明示发起）

## 2. 决策记录

| # | 决策点 | 裁定 | 备注 |
|---|---|---|---|
| D1 | 账号体系 | 各自独立 | auth 层配置驱动，无共享账号服务；保留 Supabase 特定 |
| D2 | 仓库形态 | 独立仓库 + npm 包 | 本仓；scope `@gongxtao`（假设 GitHub 用户名同名，不同则改 package.json 一处） |
| D3 | UI 层 | 纯 headless → **修订（review F2 用户裁定 2026-09-12）** | UI 组件不进框架不变；**逻辑 hooks 进新增 `/react` 子路径**（react 为 peerDependency，非框架依赖）——useSession 类每产品必写的编排零重写 |
| D4 | 产品形态 | 多数要页面集成 | content 层是核心能力，但为**可选模块**——产品不 import `/content` 则不携带页面集成 |
| D5' | ~~先迁移再发版~~ | **ready-svg 冻结** | copy-out 抽离；ready-svg 发版与框架工作完全解耦、随时可发；代价见 §10 分叉成本 |
| D6 | 抓取目标抽象 | 混合/未定 → 抽象接口 | `Grabber` 接口，图片抓取器首发实现，新内容类型随产品加 |
| D7 | 抽离时序 | 混合 | 确定性核心（session/api/messaging/io/panel）一次抽完；依赖消费者校准的（具体抓取器、testing 范围）随产品 #2 JIT |

v1 方案层三选一结论保留：**单包多入口模块库**（选定）vs 多包微集（否：单人开发版本矩阵仪式重）vs 运行时接管 SDK（否：抽象重、与 headless 相悖、YAGNI）。理由：ready-svg 现有代码 DI + 纯状态机纪律本就是 headless 库天然形态，本框架是把已验证的隐式架构显式化、泛化、版本化，而非发明新抽象。

## 3. 抽离源盘点（ready-svg@95d0842）

### 进框架（copy-out + 泛化）

| 能力 | 源文件（extension/src/lib/） | 泛化点 |
|---|---|---|
| 配置装配 | config.ts | 框架不持产品常量；KitConfig 注入；createKit 派生 ns 化资源 |
| 会话层 | session-codec / auth-rest / session-store / me-cache | 近原样（已 DI）；me-cache 泛型化（最小契约 `{ userId }`）+ 键 ns 化 |
| 逻辑 hooks | useSession（→ /react） | 近原样（编排已 DI）；依赖 session 模块（P1 步 ⑥；review F2 裁定迁入） |
| API 传输 | api-client 的 apiFetch 核心 | 端点函数留产品；MeInfo 完全归产品（review 修订 F3——框架只要最小身份契约 `{ userId }`，me-cache 泛型化，/api 收敛纯传输） |
| 页内面板 | panel-host / panel-prefs | 键/消息/DOM id ns 化；panel.html 地址、宽度、边线样式可配 |
| 页面集成 | badge-overlay / page-image / handoff | 重构为 §4 /content 子结构（Grabber 抽象） |
| 消息协议 | 散在 handoff.ts 的 7 消息形 | defineMessages 工厂化 |
| 工具件 | clipboard / asset-io 核 / onboarding | clipboard 原样；asset-io 产品 fetcher 注入化；onboarding → createFlagStore(ns) |
| 测试基建 | 各 test 假件模式 + e2e fixtures | 提炼假件工厂 + Playwright 助手（P3 最小集起步） |

### 留在 ready-svg（业务，永不抽）

全部 React 组件（Rail/ViewHead/AccountCard/SettingsCard/Convert*/Home*/Result*/RefineDock/CtxBar/ProfilePicker/OutOfCredits/LastResult*/Dropzone）、convert-flow / optimize-flow / useConvert / useOptimize / profiles、useClaimGrant（端点话术皆业务）、use-image-handoff（消费侧）、last-result / convert-stores（业务记录形状）、API 端点定义、web 侧一切。

### 运行时依赖：核心零

核心模块无 React、无 wxt 运行时依赖（`/react` 子路径的 react 为 peerDependency，由产品自带）；chrome.* 全 DI 结构类型（继承「browser 类型化结构子集」纪律）；DOM 能力（panel-host/badge）不依赖产品栈。devDeps 仅 tsdown/vitest/jsdom/@testing-library/react/eslint/typescript。

## 4. 模块划分（subpath exports）

```
@gongxtao/extension-kit
├── /config        createKit 脊椎：ns 派生键/消息 kind/DOM id
├── /session       cookie 编解码 ↔ Supabase 会话 ↔ me-cache 乐观首绘
├── /api           Bearer 传输骨架（信封守卫/401 映射/multipart/raw）
├── /panel         页内 iframe 宿主（挤压/覆盖/拖宽/关闭）
├── /content       页面集成（可选模块）—— 子结构见下
├── /messaging     defineMessages 轻量工厂（ns 前缀类型 + 守卫）
├── /io            clipboard / asset-io 核 / flag-store / 存储封装
├── /react         逻辑 hooks：useSession 等（react 为 peerDependency——D3 修订）
└── /testing       假件工厂 + Playwright 助手
```

`/content` 子结构（D6 抓取目标抽象；review 修订 F1——发现与抓取是同一内容类型的一体两面，不平行可换，捆绑为「抓取源」）：

```
/content
├── runtime/    目标无关运行时：徽标三态机（样式/角位策略注入）+ 悬停隐现 + 顶层重挂
│               + storage.session 交接通道（载荷 metadata 透传）
│               + 扫描机制（MutationObserver/去抖重扫/文档级 load 补扫——机制归运行时，
│                 候选判定归抓取源）
├── capture/    抓取源（capture source）插件：一体两面捆绑，不可拆配
│   ├── types/  接口：discover（候选判定）/ eligibility（资格）/ extract（提取编码）
│   │           / decodeCdn（SW 取回字节解码，可选——声明式 opt-in，F5）
│   ├── image/  图片抓取源（page-image 泛化：尺寸阈值/canvas 重绘/webp 转码 + CDN 解码）
│   └── (未来: selection/element/... 随产品加)
└── cdn/        SW 兜底通用层——扩展权限代理取字节（仅对声明了 decodeCdn 的抓取源生效）
```

产品装配：`contentRuntime({ captureSource: imageCapture({...阈值}), badge: {...样式} })`。

分层纪律（eslint no-restricted-imports 钉死）：config / messaging / io 为底层零依赖；session / api / panel / content 跨模块只允许 type 级引用——实际协作全走 DI 参数。

## 5. 命名空间与消息协议

**ns 一根线穿过所有全局名字**。`KitConfig.namespace`（约束 `[a-z0-9]+` 单段）→ `createKit` 派生：

```
storage 键:  ${ns}-me-cache / ${ns}-panel-mode / ${ns}-image-handoff ...
消息 kind:   ${ns}-toggle-panel / ${ns}-cdn-grab ...
DOM id:      ${ns}-panel-host / ${ns}-badge-host ...
iframe 消息: ${ns}-close-panel
```

核心收益：**浏览器内多产品共存**——用户同时装多个产品插件，消息/存储/DOM 宿主互不串台。（ready-svg 自带代码硬编码 `rsvg-*` 前缀，语义同构；若未来迁移其 ns='rsvg'，可逐字节兼容——仅记为后门，不进计划。）

**defineMessages 工厂**（轻量，非框架）：

```ts
const proto = kitMessages(ns);   // 框架内置：toggle/show/close-panel、grab、cdn-grab、handoff 三件套
const mine = defineMessages(ns, {
  exportRequested: { payload: (v): v is ExportRequested => ... },
});
```

守卫纪律继承：畸形消息**静默丢弃不炸 SW**（安全默认，不可配置）。

**业务 payload 与框架通道分离**：handoff 业务字段（如 source 站点值域）走 `metadata?: unknown` 透传，框架只查存在性，值域校验由产品注入守卫回调。徽标 `cornerFor(source)` 吃产品自有值域。

**键名集中管控**：所有存储键经 `kit.key('panel-mode')` 生成，禁止裸字符串散布。

## 6. 包工程、发布与联调

- **构建**：tsdown（tsup 等价备选）；纯 ESM + 每模块 d.ts；dist 按 `src/<module>/index.ts` 分入口；exports map 九入口 + 根便捷入口（createKit + 全类型）
- **发布**：GitHub Packages 私有（发布走 Actions GITHUB_TOKEN，安装侧每机一次性 `.npmrc` + PAT read:packages）。版本 0.x 起步，产品 #2 接入升 1.0。手工 semver + CHANGELOG.md，不上 changesets
- **联调 DX 双模式**（README 落地）：`npm link`（框架 tsdown --watch；本框架无 React 无双实例坑）用于同日改动；GitHub Packages 钉版用于稳定开发。**真实联调验证发生在产品 #2 接入时**——此前无跨仓消费者
- **example/ 最小示例插件**（仓内，workspace 相对引用）：P0 验证载体（WXT 构建 + Chrome 加载 + createKit 装配冒烟），兼作新产品装配参考的活样例
- **harness**：init.sh（lint → unit → build，fail-fast）+ feature_list.json + progress.md + CLAUDE.md 启动头——与产品仓同一会话启动路径

### 新产品起步路径（本设计第一目标，无脚手架生成器）

新建 WXT 项目 → `npm i @gongxtao/extension-kit` → 按 README 装配指南接线（manifest 模板 + 入口三件 + createKit + 消息装配）→ 直接写业务视图。装配指南内嵌可直接复制的 manifest/入口骨架片段（提炼自 example/）。

## 7. 测试策略

- **测试跟代码走**（copy-out 同款：测试复制进框架仓）；泛化本身 TDD——断言先 ns 参数化转红（夹具 ns 如 `testkit`），模块改绿
- **框架仓**：模块规格测试（jsdom；panel-host/badge DOM 级；/react hooks 测试用 @testing-library/react——devDep）+ example 插件 Chrome 冒烟（手动/可脚本化）+ init.sh
- **无 ready-svg 消费者验证**（v1 的 E2E 兜底随 D5' 作废）→ **产品 #2 是首个真实消费者**，其 init.sh + E2E 即框架的消费者集成测试
- **框架变更协议**（README 落地）：改框架 → bump → link 进产品 #2 → 产品 init.sh + E2E 全绿才算收口
- **/testing 发布物**（P3 最小集起步）：fakeStorageArea（local/session 语义 + onChanged）/ fakeCookies / fakeMenus / runtime 消息假件 / Playwright cookie 注入 + route-mock + openPanel(ns)

## 8. 实施切分（框架侧 P0–P3，每阶段硬门）

| Phase | 内容 | 出口门 |
|---|---|---|
| P0 | 仓 bootstrap：harness 四件套（含 .gitignore，F4）+ tsdown/vitest/eslint 接线 + **example/ 最小示例插件**（createKit 装配 + panel 骨架） | 框架 init.sh 绿 + example 插件 Chrome 手动加载验证（加载成功 + 面板开合 + createKit 产出的键/消息/DOM id 断言） |
| P1 | 确定性核心搬迁：①messaging（新写工厂，最小）②io ③session ④api ⑤panel ⑥react（useSession）——逐模块「复制测试改参数化（红）→ 复制代码泛化（绿）→ commit」 | 每模块框架 init.sh 绿 |
| P2 | content 层：badge/handoff/scan 骨架 + Grabber 接口 + image 抓取器 + cdn 双层拆分 | 同上 + example 集成徽标抓图链冒烟 |
| P3 | testing 最小集 + README（装配指南/变更协议/溯源映射表）+ GitHub 私有远程仓创建与首推（F4）+ GitHub Packages 发布管线打通 | 0.1.0 可安装（dry-run 验证） |
| —— | **产品 #2 开工**（首个真实消费者；npm link / 钉版联调 DX 实战验证；具体抓取器按需加） | 产品 #2 仓自身 harness |

量级估计：P0–P3 约 2–3 个工作会话（~10k 行含测试复制 + 泛化，无迁移回归负担——比 v1 少一个 P3 批次）。

## 9. 溯源映射（PORTING 后门）

| 框架模块 | 源（ready-svg@95d0842） | 抽离 commit |
|---|---|---|
| /config | extension/src/lib/config.ts | （P1 填） |
| /session | lib/session-codec·auth-rest·session-store·me-cache | （P1 填） |
| /api | lib/api-client.ts（传输核） | （P1 填） |
| /panel | lib/panel-host·panel-prefs | （P1 填） |
| /content/badge | lib/badge-overlay.ts | （P2 填） |
| /content/grab/image | lib/page-image.ts | （P2 填） |
| /content/handoff | lib/handoff.ts | （P2 填） |
| /io | lib/clipboard·asset-io·onboarding | （P1 填） |
| /messaging | （handoff.ts 内消息形提炼） | （P1 填） |
| /react | lib/useSession.ts | （P1 填） |

用途：ready-svg 侧若修了共享代码的 bug，按此表对照移植进框架（可选项，不承诺双向同步）。

## 10. 分叉成本（D5' 的诚实账）

代码存在两份：ready-svg 的 `lib/`（冻结核）+ 本仓（活体）。框架改进不回流 ready-svg；ready-svg 的 shared-code bug 就地小修、移植回框架为可选。成本**有界**：ready-svg 是 20/20 收口的维护态产品，活跃开发在框架 + 产品 #2——上线在即的稳定产品不为了内部平台统一而重构，这是标准取舍。

## 11. 开放项

- `@gongxtao` scope 假设 GitHub 用户名与 git user 同名——不同则改 package.json 一处（发布前核对）
- 产品 #2 具体抓取的目标类型（图片之外）未定——按 D6 抽象落地，新抓取器随产品 #2 需求加，不影响 P0–P3
- example/ 是否升级为 kitchen-sink E2E 载体——等框架开始「无消费者迁移在途的独立演进」时再议（产品 #2 存在后即有常驻消费者）
