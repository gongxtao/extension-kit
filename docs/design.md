# Extension Kit —— 插件通用能力框架设计（v2）

> 状态：设计定稿（2026-09-12）。v1 于 2026-09-06 定稿后撤回——因约束变化（ready-svg 冻结）修订为 v2；同日多轮 review 修订：F1–F5（自审）/ F6–F11（二轮——entrypoint 溯源补全、me-cache 与 StorageArea 形状落墨、isTarget 合一、ns 全量清单、多产品布局红线、导出路径断言）/ F12–F16（三轮——名字计数一致性、background 边界参数化、溯源按能力归位、store 参数规则、菜单 id 登记）/ F17–F22 + F15 收紧（四轮——sourceOf 归产品、通道上限归位、配置三层规则、createKit 契约与例外登记、manifest 映射表、生命周期纪律）/ F23–F28（五轮——产品常量对账单与判据、双通道泛化、Grabber 正名、CaptureSource 契约、页内注入纪律、Chromium MV3 红线）。
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
- 不仲裁多产品同开的布局竞争——ns 只隔离身份（消息/存储/DOM 宿主不串台）；多面板挤压值覆写（margin-right 非叠加、各自记原值还原）与同值 z-index 叠放是源语义，跨产品调停不进框架（review2 修订）
- 仅 Chromium MV3（Chrome ≥123，随源钉）——OffscreenCanvas SW 转码 / storage.session / lastError 回调式语义皆 Chromium 形态；Firefox/Safari 不在范围（review5 修订 F28；未在更低版本验证，需要时另立裁定降限）

## 2. 决策记录

| # | 决策点 | 裁定 | 备注 |
|---|---|---|---|
| D1 | 账号体系 | 各自独立 | auth 层配置驱动，无共享账号服务；保留 Supabase 特定 |
| D2 | 仓库形态 | 独立仓库 + npm 包 | 本仓；scope `@gongxtao`（假设 GitHub 用户名同名，不同则改 package.json 一处） |
| D3 | UI 层 | 纯 headless → **修订（review F2 用户裁定 2026-09-12）** | UI 组件不进框架不变；**逻辑 hooks 进新增 `/react` 子路径**（react 为 peerDependency，非框架依赖）——useSession 类每产品必写的编排零重写 |
| D4 | 产品形态 | 多数要页面集成 | content 层是核心能力，但为**可选模块**——产品不 import `/content` 则不携带页面集成；`/panel` 同居 content script 上下文，两者都不用才无 content script / host 权限需求（review2 修订 F10） |
| D5' | ~~先迁移再发版~~ | **ready-svg 冻结** | copy-out 抽离；ready-svg 发版与框架工作完全解耦、随时可发；代价见 §10 分叉成本 |
| D6 | 抓取目标抽象 | 混合/未定 → 抽象接口 | **抓取源（capture source）**接口（F1 重切后正名，review5 修订 F25——旧名 Grabber 废弃），图片抓取源首发实现，新内容类型随产品加；接口契约见 §4（F26） |
| D7 | 抽离时序 | 混合 | 确定性核心（session/api/messaging/io/panel）一次抽完；依赖消费者校准的（具体抓取器、testing 范围）随产品 #2 JIT |

v1 方案层三选一结论保留：**单包多入口模块库**（选定）vs 多包微集（否：单人开发版本矩阵仪式重）vs 运行时接管 SDK（否：抽象重、与 headless 相悖、YAGNI）。理由：ready-svg 现有代码 DI + 纯状态机纪律本就是 headless 库天然形态，本框架是把已验证的隐式架构显式化、泛化、版本化，而非发明新抽象。

## 3. 抽离源盘点（ready-svg@95d0842）

### 进框架（copy-out + 泛化）

| 能力 | 源文件（extension/src/lib/） | 泛化点 |
|---|---|---|
| 配置装配 | config.ts | 框架不持产品常量；KitConfig 注入；createKit 派生 ns 化资源 |
| 会话层 | session-codec / auth-rest / session-store / me-cache | 近原样（已 DI）；me-cache 泛型化——F7 落形（F15 收紧后签名随源位置参）：`createMeCache<T>(area, validate: (v: unknown) => v is T, now?)`，条目 `{value, userId, savedAt}`，`set(value, userId)`（源 `me` 字段随 F3 更名 `value`；`isMeInfo` 硬 import 换守卫注入缝，ready-svg 消费侧传 `isMeInfo` 即适配）+ 键 ns 化 |
| 逻辑 hooks | useSession（→ /react） | 近原样（编排已 DI）；依赖 session 模块（P1 步 ⑥；review F2 裁定迁入） |
| API 传输 | api-client 的 apiFetch 核心 | 端点函数留产品；MeInfo 完全归产品（review 修订 F3——框架只要最小身份契约 `{ userId }`，me-cache 泛型化，/api 收敛纯传输） |
| 页内面板 | panel-host / panel-prefs | 键/消息/DOM id ns 化；panel.html 地址、宽度、边线样式可配 |
| 页面集成 | badge-overlay / page-image / handoff | 重构为 §4 /content 子结构（抓取源抽象，契约见 F26）；**sourceOf 站点映射与 ImageSource 值域归产品**（review4 修订 F17；review5 修订 F24——泛化须覆盖 **handoff 与 cdn-grab 两通道**（CdnGrabMessage 同携 source）及 isSource 两处守卫（handoff.ts:146，两消息形共用）的注入缝；框架零站点知识，通道只走 §5 metadata 透传 + `cornerFor(source)` 泛型（源名 badgeCornerFor，badge-overlay.ts:50）吃产品值域，映射表经装配注入） |
| 消息协议 | 散在 handoff.ts（6 形）+ panel-host.ts（close-panel）共 7 消息形 | defineMessages 工厂化 |
| 工具件 | clipboard / asset-io 核 / onboarding | clipboard 原样；asset-io 产品 fetcher 注入化；onboarding → createFlagStore(area, key)（源 createOnboardingStore(area)，键经 kit.key('onboarding-seen') 派生——review3 修订 F15）；**store 构造器参数风格规则**（F15，四轮收紧——判据 = 源的真实分界而非参数个数：源位置参（单主体 + 注入缝）一律保持位置参、新增缝按序追加（me-cache 即 `(area, validate, now?)`）；源 deps bag（createPanelHost / createSessionStore / createBadgeOverlay / createConvertStores）保持 deps bag）；**StorageArea 类型归宿 /io**（review2 修订 F8——定义在业务文件 convert-stores.ts:23 却被 me-cache/onboarding/panel-prefs 依赖：框架单点定义 get/set/remove + 含 `onChanged` 订阅的扩展形状（panel-prefs 用，源为独立注入参数），handoff.ts:132 的 HandoffStorageArea 重复声明收敛） |
| 测试基建 | 各 test 假件模式 + e2e fixtures | 提炼假件工厂 + Playwright 助手（P3 最小集起步） |

### 产品常量对账单（review5 修订 F23）

判据：**框架可持通用视觉默认值（可被产品覆盖），但产品文案与品牌资产一律注入、框架零缺省。**逐处对账：

| 源位置 | 常量 | 处置 |
|---|---|---|
| page-image.ts:27,57-66 | ImageSource 值域 + sourceOf 映射表 | 产品注入（F17/F24） |
| badge-overlay.ts:50 | badgeCornerFor 角位策略 | 产品注入（§4 注入点） |
| handoff.ts:146 | isSource 值域守卫（两消息形共用） | 产品注入守卫回调（§5 既有原则，F24 扩两通道） |
| badge-overlay.ts:31-32 | FALLBACK_TEXT / TOO_LARGE_TEXT 回退文案 | 产品注入 |
| badge-overlay.ts:83-90 | LOGO_PATH / LOCK_PATH + 品牌黄 #f8b018 | 产品注入（品牌资产） |
| config.ts:20-24 | web origin / Supabase ref / publishable key | KitConfig / 装配注入（D1 既有） |
| panel-host.ts:111 · content 入口:116-124 | aria-label 文案 / TOAST_STYLE / TOAST_TTL_MS | aria-label 注入；TOAST 样式与 TTL 属通用视觉默认（可覆盖） |

### 留在 ready-svg（业务，永不抽）

全部 React 组件（Rail/ViewHead/AccountCard/SettingsCard/Convert*/Home*/Result*/RefineDock/CtxBar/ProfilePicker/OutOfCredits/LastResult*/Dropzone）、convert-flow / optimize-flow / useConvert / useOptimize / profiles、useClaimGrant（端点话术皆业务）、use-image-handoff（消费侧）、last-result / convert-stores（业务记录形状）、API 端点定义、web 侧一切。

### 入口层边界（review2 修订 F6）

上表只盘 lib/；entrypoints 两文件同样二分——框架归属逻辑不登记溯源 = 诱导从零发明：

- **进框架**：`entrypoints/content/index.ts` 的 `startContentScript`（357 行：初始全量 + MutationObserver 去抖重扫 + 文档级 load 捕获补扫、toast 宿主、panel toggle/show 消息消费、点击复核 ineligible 映射、handoff/CDN 装配）→ /content/runtime；`entrypoints/background/index.ts` 的 `setupPageIntegration` **整体参数化进框架**（review3 修订 F13，裁定 a——菜单 id/文案硬编码在函数体内（:73-85）且 312 行测试正断言它们，「注册留产品壳」物理上切不开；保持函数结构 + 参数化才是 copy-out 纪律，与 content 侧 `startContentScript(deps)` 对称）：菜单 title/contexts 注入、id 缺省 `${ns}-convert` 派生，toolbar 接线与 onMessage 路由原样，内含 `deliverHandoff` 收口与 cdn 分支 → /content 装配面（background 侧）。测试随码 copy-out（index.test.ts 各 473 / 312 行；菜单断言参数化转红）。
- **留产品壳**：WXT `defineContentScript`/`defineBackground` 包装、matches 策略、菜单文案与 contexts 的**值**（经装配参数注入——框架不持产品常量）、快捷键绑定（manifest `_execute_action`，无框架代码）、panel.html 地址、dev 专用缝（extraHosts）。框架给可测装配函数（**两入口装配 DOM/browser 全 DI**；panel-host 直用全局 document/window——jsdom 提供测试环境，非全 DI），产品入口数行接线——example/ 即活样例。

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
│               + background 半段（setupPageIntegration 参数化：菜单/toolbar/路由——F13）
├── capture/    抓取源（capture source）插件：一体两面捆绑，不可拆配
│   ├── types/  接口：isTarget（候选判定——review2 修订 F9：扫描与点击复核同函数，
│   │           对应源 isBadgeTarget 的两次调用，不拆 discover/eligibility）
│   │           / extract（提取编码）
│   │           / decodeCdn（SW 取回字节解码，可选——声明式 opt-in，F5）
│   ├── image/  图片抓取源（page-image 泛化：尺寸阈值/canvas 重绘/webp 转码 + CDN 解码）
│   └── (未来: selection/element/... 随产品加)
└── cdn/        SW 兜底通用层——扩展权限代理取字节（仅对声明了 decodeCdn 的抓取源生效）
```

产品装配：`contentRuntime({ captureSource: imageCapture({...阈值}), badge: {...样式} })`。
点击链复核：runtime 在徽标点击时对同一 `isTarget` 再调（尺寸漂移防护）——不过 → `ineligible` 败因，且 ineligible / too_large 属确定性败不走 CDN 兜底（源语义随码走）。

**CaptureSource 接口契约**（review5 修订 F26——D6 的兑现、P2 落地依据；形状全部源自 page-image 导出面，非发明）：

```ts
/** 抓取源（capture source，D6/F1）——某内容类型的一体两面：发现与抓取捆绑，不可拆配 */
interface CaptureSource {
  /** 候选判定——源 isBadgeTarget（F9：扫描与点击复核同函数）；info 形状源自 BadgeTargetInfo，随源类型定义 */
  isTarget(info: TargetInfo): boolean
  /** 提取编码——源 grabImage 两路链（fetch → canvas 重绘/webp 转码，阈值参数化）；
   *  ExtractResult ↔ 源 GrabResult（败因六值跨层归属见 §9，F18） */
  extract(input: { src: string; node?: unknown }, deps?: ExtractDeps): Promise<ExtractResult>
  /** CDN 兜底解码——声明式 opt-in（F5）：在场则 SW 兜底以其转码面重走 extract
   *  （源 background:172 cdnGrab = grabImage({src}, {makeCanvas: makeOffscreenCanvas})）；
   *  缺席则该源不走 CDN 兜底 */
  decodeCdn?: { makeCanvas(): CanvasLike }
}
```

runtime 调用时序（源自 content 入口）：扫描——候选节点读 info → `isTarget` 过 → 挂徽标（样式/角位注入）；点击——`isTarget` 复核（不过 → ineligible，确定性败不走兜底）→ `extract` → 败且可救且源声明 `decodeCdn` → SW 兜底 → 编码 → handoff / cdn-grab 通道。注入点：`sourceOf` 映射（F17/F24）、`cornerFor` 角位（源 badgeCornerFor）、回退文案（F23）、尺寸阈值（`imageCapture({...阈值})`）。

分层纪律（eslint no-restricted-imports 钉死）：config / messaging / io 为底层零依赖；session / api / panel / content 跨模块只允许 type 级引用——实际协作全走 DI 参数。

**配置三层归属（review4 修订 F19）**——什么进 KitConfig、什么走模块装配参数、什么框架永不持：

| 层 | 归宿 | 现有成员 |
|---|---|---|
| KitConfig | 跨模块全局（createKit 入参）；升层规则：被 ≥2 模块消费或须全局唯一才进 | 当前仅 `namespace` |
| 模块装配参数 | 模块构造器/装配函数入参，模块内可配 | panel.html 地址/宽度/边线、菜单 title/contexts（F13）、徽标样式/角位、抓取阈值、sourceOf 映射（F17）、产品 fetcher |
| 产品常量 | 框架永不持（§3 铁则） | 站点表值、文案、API 端点、MeInfo 形状 |

**生命周期与清理纪律**（review4 修订 F22——模块进出契约，源内散落纪律上升为条款）：panel `destroy()` 必还原 margin 原值（记谁还谁）；`startContentScript` 返 `{rescan, stop}`——observer / load 捕获 / runtime 监听 / 徽标全摘；badge `dispose()`；菜单注册 removeAll→rebuild 幂等（SW 每次唤醒重建，duplicate id 经 lastError 回调显式消费不炸）。

**页内注入纪律**（review5 修订 F27——源三处注释实践（badge-overlay 头注 R43 / panel-host 头注 / toast `:host{all:initial}`）升为条款，产品 #2/#3 自行注入 DOM 时照此）：
- 注入元素一律 Shadow DOM 作用域隔离（`:host { all: initial }`）+ 宿主 inline style 自包含（R43 Tailwind-only 豁免先例——面板侧构建产物不可跨文档使用）
- 不改页面 DOM——唯一例外 squeeze 模式写 `<html>` margin-right（记原值必还原，F22）
- 宿主以 `data-${ns}-*` 属性标记（防御 + 可诊断）；z-index 2147483647 + 显身重挂 body 末位（同值后到压制防御，R59）

## 5. 命名空间与消息协议

**ns 一根线穿过所有全局名字**。`KitConfig.namespace`（约束 `[a-z0-9]+` 单段）→ `createKit` 派生：

```
storage 键:  ${ns}-me-cache / ${ns}-panel-mode / ${ns}-image-handoff ...
消息 kind:   ${ns}-toggle-panel / ${ns}-cdn-grab ...
DOM 宿主:    id ${ns}-panel-host；属性 data-${ns}-badge / -toast / -resize / -copy（徽标宿主无 id——源以 data 属性标记，review3 修订 F12）
iframe 消息: ${ns}-close-panel
```

核心收益：**浏览器内多产品共存**——用户同时装多个产品插件，消息/存储/DOM 宿主互不串台；布局竞争不在此列（§1 红线，review2 修订）。（framework-bound 文件硬编码 `rsvg-*` 前缀，语义同构；业务文件如 convert-stores 用无前缀 camelCase 键，不在兼容口径——若未来迁移其 ns='rsvg'，框架侧可逐字节兼容，仅记为后门，不进计划。）

ns 化名字全量清单（review2 修订 F11——P1/P2 搬运与验收基准；实现发现遗漏随补回填此表）：

| 类别 | 源名 | 框架派生 | 源所在 |
|---|---|---|---|
| 存储键 | rsvg-me-cache | ${ns}-me-cache | me-cache.ts |
| | rsvg-panel-mode / rsvg-panel-width | ${ns}-panel-mode / ${ns}-panel-width | panel-prefs.ts |
| | rsvg-image-handoff | ${ns}-image-handoff | handoff.ts |
| | rsvg-onboarding-seen | ${ns}-onboarding-seen | onboarding.ts |
| 消息 kind | rsvg-image-handoff / rsvg-grab / rsvg-cdn-grab / rsvg-toggle-panel / rsvg-show-panel / rsvg-handoff-consumed | ${ns}- 同后缀 | handoff.ts |
| | rsvg-close-panel（iframe postMessage） | ${ns}-close-panel | panel-host.ts |
| DOM id | rsvg-panel-host | ${ns}-panel-host | panel-host.ts |
| DOM data 属性 | data-rsvg-badge / -toast / -resize / -copy | data-${ns}-* | badge-overlay / content 入口 / panel-host / clipboard |
| Shadow 内 CSS | rsvg-spin / rsvg-shake | ${ns}-spin / ${ns}-shake | badge-overlay.ts |
| 菜单 id | rsvg-convert | ${ns}-convert（缺省派生；title/contexts 产品注入——F13） | background 入口 |

（rsvg-last-result 与 convertLastWidthMm / convertResume 为产品侧键，不进框架清单。P0 断言口径 = createKit 派生面**全表**——键/kind/id/属性/CSS 名皆纯字符串派生、不依赖模块实现，可在 P0 一次锁死 ns 契约；名字的**消费**随各模块 phase 进行为断言——review3 修订 F16。）

**createKit 接口契约**（review4 修订 F20——P0 断言的依据，先于 feat-002 钉死）：

```ts
interface KitConfig { namespace: string }   // [a-z0-9]+ 单段（§5）
interface Kit {
  key(suffix: string): string        // 存储键 `${ns}-${suffix}`
  kind(suffix: string): string       // 消息 kind `${ns}-${suffix}`
  domId(suffix: string): string      // DOM id `${ns}-${suffix}`
  dataAttr(suffix: string): string   // DOM 属性 `data-${ns}-${suffix}`
  cssName(suffix: string): string    // Shadow CSS/动画名 `${ns}-${suffix}`
  menuId(suffix: string): string     // 菜单 id（装配层缺省 'convert'，F13）
}
```

**唯一无源对应物的抽象，显式登记为例外**：源是 config.ts 单例装配 + 各文件散落的 `rsvg-` 前缀字面量，无集中派生函数。约束三则：纯字符串派生、无状态无新运行时概念；`ns='rsvg'` 时输出与源字面量逐字节等价（上文全量清单即其测试规格）；新派生类别须先回本节扩契约，不得散落。

**defineMessages 工厂**（轻量，非框架）：

```ts
const proto = kitMessages(ns);   // 框架内置 7 kind：面板三件（toggle/show/close-panel）+ 抓取两件
                                // （grab/cdn-grab）+ handoff 双向（image-handoff / handoff-consumed）
                                // ——ack 是返回类型不占 kind（review3 修订 F12）
const mine = defineMessages(ns, {
  exportRequested: { payload: (v): v is ExportRequested => ... },
});
```

守卫纪律继承：畸形消息**静默丢弃不炸 SW**（安全默认，不可配置）。

**业务 payload 与框架通道分离**：handoff 业务字段（如 source 站点值域）走 `metadata?: unknown` 透传，框架只查存在性，值域校验由产品注入守卫回调。徽标 `cornerFor(source)` 吃产品自有值域。

**键名集中管控**：所有存储键经 `kit.key('panel-mode')` 生成，禁止裸字符串散布。

## 6. 包工程、发布与联调

- **构建**：tsdown（tsup 等价备选）；纯 ESM + 每模块 d.ts；dist 按 `src/<module>/index.ts` 分入口；exports map 九入口 + 根便捷入口（createKit + 全类型）
- **导出路径断言**（review2 修订）：新增模块入口时 tsdown entry / package.json exports / dist 实产三者同步——init.sh 的 build 步末尾断言每条 exports 路径在 dist 存在再放行（feat-001 已实捕 .js→.mjs 不匹配一次，固化防再犯）
- **发布**：GitHub Packages 私有（发布走 Actions GITHUB_TOKEN，安装侧每机一次性 `.npmrc` + PAT read:packages）。版本 0.x 起步，产品 #2 接入升 1.0。手工 semver + CHANGELOG.md，不上 changesets
- **联调 DX 双模式**（README 落地）：`npm link`（框架 tsdown --watch；本框架无 React 无双实例坑）用于同日改动；GitHub Packages 钉版用于稳定开发。**真实联调验证发生在产品 #2 接入时**——此前无跨仓消费者
- **example/ 最小示例插件**（仓内，workspace 相对引用）：P0 验证载体（WXT 构建 + Chrome 加载 + createKit 装配冒烟），兼作新产品装配参考的活样例
- **harness**：init.sh（lint → unit → build，fail-fast）+ feature_list.json + progress.md + CLAUDE.md 启动头——与产品仓同一会话启动路径

### 新产品起步路径（本设计第一目标，无脚手架生成器）

新建 WXT 项目 → `npm i @gongxtao/extension-kit` → 按 README 装配指南接线（manifest 模板 + 入口三件 + createKit + 消息装配）→ 直接写业务视图。装配指南内嵌可直接复制的 manifest/入口骨架片段（提炼自 example/）。

**manifest 必备声明映射**（review4 修订 F21——装配指南骨架；F13 起 contextMenus 成框架必需权限，此类耦合登记于此）：

| 框架能力 | manifest 必备 | 源依据 |
|---|---|---|
| /panel | `web_accessible_resources`：panel.html + chunks/* + assets/* + icons/*（+ matches） | R91——漏一项 iframe 白屏（静默无报错），源 manifest.test 锁 |
| /session | `permissions`: cookies（+ storage） | session-store cookie 读写 |
| /content + cdn 兜底 | `host_permissions`: \<all_urls\>（产品可收窄） | R53 SW 免 CORS 取字节 |
| background 装配（F13 起） | `permissions`: contextMenus | setupPageIntegration 菜单注册 |
| /io asset-io | `permissions`: downloads | 资产导出 chrome.downloads |

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
| P2 | content 层：badge/handoff/scan 骨架 + CaptureSource 抓取源接口（契约 F26）+ image 抓取源 + cdn 双层拆分 | 同上 + example 集成徽标抓图链冒烟 |
| P3 | testing 最小集 + README（装配指南/变更协议/溯源映射表）+ GitHub 私有远程仓创建与首推（F4）+ GitHub Packages 发布管线打通 | 0.1.0 可安装（dry-run 验证） |
| —— | **产品 #2 开工**（首个真实消费者；npm link / 钉版联调 DX 实战验证；具体抓取器按需加） | 产品 #2 仓自身 harness |

量级估计：P0–P3 约 2–3 个工作会话（~10k 行含测试复制 + 泛化，无迁移回归负担——比 v1 少一个 P3 批次）。

## 9. 溯源映射（PORTING 后门）

| 框架模块 | 源（ready-svg@95d0842） | 抽离 commit |
|---|---|---|
| /config | extension/src/lib/config.ts（KitConfig 注入形态）+ §5 全量清单（createKit 派生规格，F20 例外登记） | e7d98b3（feat-002） |
| /session | lib/session-codec·auth-rest·session-store·me-cache | （P1 填） |
| /api | lib/api-client.ts（传输核） | （P1 填） |
| /panel | lib/panel-host·panel-prefs | （P1 填） |
| /content/badge | lib/badge-overlay.ts | （P2 填） |
| /content/runtime | entrypoints/content/index.ts（startContentScript：扫描/去抖/补扫/toast/装配；review2 修订 F6） | （P2 填） |
| /content/runtime（background 半段） | entrypoints/background/index.ts（setupPageIntegration 参数化整体：菜单注册/toolbar 接线/onMessage 路由；review3 修订 F13、四轮正名） | （P2 填） |
| /content/capture/image | lib/page-image.ts（GrabFailReason 六值跨层标注：taint/decode=canvas 路、too_large=通道（F18）、ineligible=点击复核、network/unsupported=抓取链；测试 231 行按能力拆分随 F14/F18 归位——review4 修订） | （P2 填） |
| /content/cdn | background 装配内 cdnGrab 分支（SW 扩展权限 fetch）+ lib/page-image.ts 的 makeOffscreenCanvas——按能力归位，review3 修订 F14 | （P2 填） |
| /content/handoff | lib/handoff.ts（store/守卫/编解码）+ background 装配内 deliverHandoff 收口（SW 半段，两分支共用：store.set → ack；QUOTA → too_large）+ HANDOFF_MAX_BYTES 通道上限（源自 page-image.ts:21，随通道走——产品换内容类型时门不丢；review4 修订 F18）——review3 修订 F14 | （P2 填） |
| /io | lib/clipboard·asset-io·onboarding + convert-stores.ts:23（仅 StorageArea 结构类型；review2 修订 F8） | （P1 填） |
| /messaging | （handoff.ts 6 消息形 + panel-host.ts close-panel 提炼；review2 修订——业务 source 值域泛化为 metadata 透传，F17/F24） | 9ec68a1（feat-003） |
| /react | lib/useSession.ts | （P1 填） |

用途：ready-svg 侧若修了共享代码的 bug，按此表对照移植进框架（可选项，不承诺双向同步）。

## 10. 分叉成本（D5' 的诚实账）

代码存在两份：ready-svg 的 `lib/`（冻结核）+ 本仓（活体）。框架改进不回流 ready-svg；ready-svg 的 shared-code bug 就地小修、移植回框架为可选。成本**有界**：ready-svg 是 20/20 收口的维护态产品，活跃开发在框架 + 产品 #2——上线在即的稳定产品不为了内部平台统一而重构，这是标准取舍。

## 11. 开放项

- `@gongxtao` scope 假设 GitHub 用户名与 git user 同名——不同则改 package.json 一处（发布前核对）
- 产品 #2 具体抓取的目标类型（图片之外）未定——按 D6 抽象落地，新抓取器随产品 #2 需求加，不影响 P0–P3
- example/ 是否升级为 kitchen-sink E2E 载体——等框架开始「无消费者迁移在途的独立演进」时再议（产品 #2 存在后即有常驻消费者）
