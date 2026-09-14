# Extension Kit —— 插件通用能力框架设计（v2）

> 状态：设计定稿（2026-09-12）。v1 于 2026-09-06 定稿后撤回，因约束变化修订为 v2；同日多轮 review 修订：F1–F5（自审）/ F6–F11（二轮——entrypoint 边界补全、me-cache 与 StorageArea 形状落墨、isTarget 合一、ns 全量清单、多产品布局红线、导出路径断言）/ F12–F16（三轮——名字计数一致性、background 边界参数化、能力归位、store 参数规则、菜单 id 登记）/ F17–F22 + F15 收紧（四轮——sourceOf 归产品、通道上限归位、配置三层规则、createKit 契约与例外登记、manifest 映射表、生命周期纪律）/ F23–F28（五轮——产品常量对账单与判据、双通道泛化、抓取源正名、CaptureSource 契约、页内注入纪律、Chromium MV3 红线）。
> 本仓 = 框架仓（`@gongxtao/extension-kit`，github.com/gongxtao/extension-kit，私有）。

## 1. 背景与目标

一套经真实产品打磨的插件基础能力（会话同步、页内面板宿主、页面抓取集成、乐观缓存、消息协议、测试基建）沉淀为本框架。用户将开发多个插件产品（产品 #2 已立项，需登录 web 账号 + 抓取页面内容），不希望每个产品从 0 起步。

### 目标

1. 通用能力进框架，单包分发；新产品起步 = WXT 入口装配 + 业务视图，基础管线零重写
2. 产品 #2 作为首个真实消费者，直接在框架上开发

### 非目标（红线清单）

- 不做共享账号/计费后端（各产品独立 Supabase）
- 不做 UI 组件库（纯 headless；React 组件、业务状态机、API 端点、web 侧一概不进）
- 不做运行时接管型 SDK（不拥有入口/生命周期）
- 不抽象多认证后端（钉死 Supabase）
- 不做消息 RPC 框架、跨插件通信、消息版本协商
- 不仲裁多产品同开的布局竞争——ns 只隔离身份（消息/存储/DOM 宿主不串台）；多面板挤压值覆写（margin-right 非叠加、各自记原值还原）与同值 z-index 叠放是既定语义，跨产品调停不进框架（review2 修订）
- 仅 Chromium MV3（Chrome ≥123）——OffscreenCanvas SW 转码 / storage.session / lastError 回调式语义皆 Chromium 形态；Firefox/Safari 不在范围（review5 修订 F28；未在更低版本验证，需要时另立裁定降限）

## 2. 决策记录

| # | 决策点 | 裁定 | 备注 |
|---|---|---|---|
| D1 | 账号体系 | 各自独立 | auth 层配置驱动，无共享账号服务；保留 Supabase 特定 |
| D2 | 仓库形态 | 独立仓库 + npm 包 | 本仓；scope `@gongxtao`（GitHub 账号同名） |
| D3 | UI 层 | 纯 headless → **修订（review F2 用户裁定 2026-09-12）** | UI 组件不进框架不变；**逻辑 hooks 进新增 `/react` 子路径**（react 为 peerDependency，非框架依赖）——useSession 类每产品必写的编排零重写 |
| D4 | 产品形态 | 多数要页面集成 | content 层是核心能力，但为**可选模块**——产品不 import `/content` 则不携带页面集成；`/panel` 同居 content script 上下文，两者都不用才无 content script / host 权限需求（review2 修订 F10） |
| D5' | ~~先迁移再发版~~ | 框架独立演进 | 历史实现基线冻结、不再参照；框架独立演进与发版，见 §10 |
| D6 | 抓取目标抽象 | 混合/未定 → 抽象接口 | **抓取源（capture source）**接口（F1 重切后正名，review5 修订 F25），图片抓取源首发实现，新内容类型随产品加；接口契约见 §4（F26） |
| D7 | 能力节奏 | 混合 | 确定性核心（session/api/messaging/io/panel）一次收口；依赖消费者校准的（具体抓取器、testing 范围）随产品 #2 JIT |

v1 方案层三选一结论保留：**单包多入口模块库**（选定）vs 多包微集（否：单人开发版本矩阵仪式重）vs 运行时接管 SDK（否：抽象重、与 headless 相悖、YAGNI）。理由：本框架的 DI + 纯状态机纪律本就是 headless 库天然形态——把已验证的隐式架构显式化、泛化、版本化，而非发明新抽象。

## 3. 能力清单与泛化点

### 进框架（模块清单）

| 能力 | 泛化点 |
|---|---|
| 配置装配 | 框架不持产品常量；KitConfig 注入；createKit 派生 ns 化资源 |
| 会话层 | cookie 编解码 / auth REST / 会话编排 store 近原样（已 DI）；me-cache 泛型化——F7 落形（F15 收紧后签名）：`createMeCache<T>(area, validate: (v: unknown) => v is T, key, now?)`，条目 `{value, userId, savedAt}`，`set(value, userId)`（`me` 字段随 F3 更名 `value`；账户形状守卫为注入缝，消费侧传自己的 `isXxx` 即适配）+ 键 ns 化（**key 缝补裁定（feat-005 实装，2026-09-13）**：F7/F15 文本签名漏列 key，按 F15「新增缝按序追加」规则补为第 3 位必填参——§5 键 ns 化要求键经 `kit.key('me-cache')` 由调用方派生，与 flag-store (area, key) 同口径） |
| 逻辑 hooks | useSession（→ /react）近原样（编排已 DI）；依赖 session 模块（P1 步 ⑥；review F2 裁定迁入） |
| API 传输 | apiFetch 传输核；端点函数留产品；MeInfo 完全归产品（review 修订 F3——框架只要最小身份契约 `{ userId }`，me-cache 泛型化，/api 收敛纯传输） |
| 页内面板 | panel-host / panel-prefs：键/消息/DOM id ns 化；panel.html 地址、宽度、边线样式可配 |
| 页面集成 | badge-overlay / 图片抓取 / handoff 通道重构为 §4 /content 子结构（抓取源抽象，契约见 F26）；**sourceOf 站点映射与来源值域归产品**（review4 修订 F17；review5 修订 F24——泛化须覆盖 **handoff 与 cdn-grab 两通道**（CdnGrabMessage 同携 source）及 isSource 两处守卫（两消息形共用）的注入缝；框架零站点知识，通道只走 §5 metadata 透传 + `cornerFor(source)` 泛型吃产品值域，映射表经装配注入） |
| 消息协议 | 内置 7 消息形（面板三件 + 抓取两件 + handoff 双向） | defineMessages 工厂化 |
| 工具件 | clipboard / asset-io 核 / flag-store：clipboard 回退链原样；asset-io 产品 fetcher 注入化；flag-store `createFlagStore(area, key)`（键经 kit.key('onboarding-seen') 派生——review3 修订 F15）；**store 构造器参数风格规则**（F15，四轮收紧——判据 = 真实分界而非参数个数：位置参（单主体 + 注入缝）一律保持位置参、新增缝按序追加（me-cache 即 `(area, validate, key, now?)`）；deps bag（createPanelHost / createSessionStore / createBadgeOverlay / createConvertStores 形态）保持 deps bag）；**StorageArea 类型归宿 /io**（review2 修订 F8——单点定义 get/set/remove + 含 `onChanged` 订阅的扩展形状（panel-prefs 用）） |
| 测试基建 | 假件工厂 + Playwright 助手（P3 最小集起步） |

### 产品常量对账单（review5 修订 F23）

判据：**框架可持通用视觉默认值（可被产品覆盖），但产品文案与品牌资产一律注入、框架零缺省。**逐处对账：

| 常量 | 处置 |
|---|---|
| 来源值域 + sourceOf 映射表 | 产品注入（F17/F24） |
| 徽标角位策略 | 产品注入（§4 注入点） |
| 来源值域守卫（两消息形共用） | 产品注入守卫回调（§5 既有原则，F24 扩两通道） |
| 抓取失败/超限回退文案 | 产品注入 |
| 徽标图形 path + 品牌色 | 产品注入（品牌资产） |
| web origin / Supabase ref / publishable key | KitConfig / 装配注入（D1 既有） |
| 面板 aria-label / TOAST 样式与 TTL | aria-label 注入；TOAST 样式与 TTL 属通用视觉默认（可覆盖） |

### 不进框架的业务面（历史产品侧，永不进）

全部 React 组件与业务视图、业务流程编排（转换/优化类流程）、业务记录形状、API 端点定义、web 侧一切。

### 入口层边界（review2 修订 F6）

上表只盘 lib 层；产品入口文件同样二分——框架归属逻辑不登记 = 诱导从零发明：

- **进框架**：content 侧启动编排（初始全量 + MutationObserver 去抖重扫 + 文档级 load 捕获补扫、toast 宿主、panel toggle/show 消息消费、点击复核 ineligible 映射、handoff/CDN 装配）→ /content/runtime；background 侧 `setupPageIntegration` **整体参数化进框架**（review3 修订 F13，裁定 a——菜单 id/文案硬编码在函数体内且测试正断言之，「注册留产品壳」物理上切不开；保持函数结构 + 参数化才是纪律，与 content 侧启动编排对称）：菜单 title/contexts 注入、id 缺省 `${ns}-convert` 派生，toolbar 接线与 onMessage 路由原样，内含 `deliverHandoff` 收口与 cdn 分支 → /content 装配面（background 侧）。
- **留产品壳**：WXT `defineContentScript`/`defineBackground` 包装、matches 策略、菜单文案与 contexts 的**值**（经装配参数注入——框架不持产品常量）、快捷键绑定（manifest `_execute_action`，无框架代码）、panel.html 地址、dev 专用缝（extraHosts）。框架给可测装配函数（**两入口装配 DOM/browser 全 DI**；panel-host 直用全局 document/window——jsdom 提供测试环境，非全 DI），产品入口数行接线——example/ 即活样例。

### 运行时依赖：核心零

核心模块无 React、无 wxt 运行时依赖（`/react` 子路径的 react 为 peerDependency，由产品自带）；chrome.* 全 DI 结构类型（「browser 类型化结构子集」纪律）；DOM 能力（panel-host/badge）不依赖产品栈。devDeps 仅 tsdown/vitest/jsdom/@testing-library/react/eslint/typescript。

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
│   │           不拆 discover/eligibility）
│   │           / extract（提取编码）
│   │           / decodeCdn（SW 取回字节解码，可选——声明式 opt-in，F5）
│   ├── image/  图片抓取源（尺寸阈值/canvas 重绘/webp 转码 + CDN 解码）
│   └── (未来: selection/element/... 随产品加)
└── cdn/        SW 兜底通用层——扩展权限代理取字节（仅对声明了 decodeCdn 的抓取源生效）
```

产品装配：`contentRuntime({ captureSource: imageCapture({...阈值}), badge: {...样式} })`。
点击链复核：runtime 在徽标点击时对同一 `isTarget` 再调（尺寸漂移防护）——不过 → `ineligible` 败因，且 ineligible / too_large 属确定性败不走 CDN 兜底（既定语义随码走）。

**CaptureSource 接口契约**（review5 修订 F26——D6 的兑现、P2 落地依据；形状全部源自图片抓取源实现，非发明）：

```ts
/** 抓取源（capture source，D6/F1）——某内容类型的一体两面：发现与抓取捆绑，不可拆配 */
interface CaptureSource {
  /** 候选判定（F9：扫描与点击复核同函数）；info 形状为 TargetInfo，随源类型定义 */
  isTarget(info: TargetInfo): boolean
  /** 提取编码——两路链（fetch → canvas 重绘/webp 转码，阈值参数化）；
   *  ExtractResult 败因六值跨层归属见 F18 */
  extract(input: { src: string; node?: unknown }, deps?: ExtractDeps): Promise<ExtractResult>
  /** CDN 兜底解码——声明式 opt-in（F5）：在场则 SW 兜底以其转码面重走 extract；
   *  缺席则该源不走 CDN 兜底 */
  decodeCdn?: { makeCanvas(): CanvasLike }
}
```

runtime 调用时序（源自 content 入口）：扫描——候选节点读 info → `isTarget` 过 → 挂徽标（样式/角位注入）；点击——`isTarget` 复核（不过 → ineligible，确定性败不走兜底）→ `extract` → 败且可救且源声明 `decodeCdn` → SW 兜底 → 编码 → handoff / cdn-grab 通道。注入点：`sourceOf` 映射（F17/F24）、`cornerFor` 角位、回退文案（F23）、尺寸阈值（`imageCapture({...阈值})`）。

分层纪律（eslint no-restricted-imports 钉死）：config / messaging / io 为底层零依赖；session / api / panel / content 跨模块只允许 type 级引用——实际协作全走 DI 参数。

**配置三层归属（review4 修订 F19）**——什么进 KitConfig、什么走模块装配参数、什么框架永不持：

| 层 | 归宿 | 现有成员 |
|---|---|---|
| KitConfig | 跨模块全局（createKit 入参）；升层规则：被 ≥2 模块消费或须全局唯一才进 | 当前仅 `namespace` |
| 模块装配参数 | 模块构造器/装配函数入参，模块内可配 | panel.html 地址/宽度/边线、菜单 title/contexts（F13）、徽标样式/角位、抓取阈值、sourceOf 映射（F17）、产品 fetcher |
| 产品常量 | 框架永不持（§3 铁则） | 站点表值、文案、API 端点、MeInfo 形状 |

**生命周期与清理纪律**（review4 修订 F22——模块进出契约，散落纪律上升为条款）：panel `destroy()` 必还原 margin 原值（记谁还谁）；`startContentRuntime` 返 `{rescan, stop}`——observer / load 捕获 / runtime 监听 / 徽标全摘；badge `dispose()`；菜单注册 removeAll→rebuild 幂等（SW 每次唤醒重建，duplicate id 经 lastError 回调显式消费不炸）。

**页内注入纪律**（review5 修订 F27——三处注释实践升为条款，产品 #2/#3 自行注入 DOM 时照此）：
- 注入元素一律 Shadow DOM 作用域隔离（`:host { all: initial }`）+ 宿主 inline style 自包含（Tailwind-only 豁免先例——面板侧构建产物不可跨文档使用）
- 不改页面 DOM——唯一例外 squeeze 模式写 `<html>` margin-right（记原值必还原，F22）
- 宿主以 `data-${ns}-*` 属性标记（防御 + 可诊断）；z-index 2147483647 + 显身重挂 body 末位（同值后到压制防御，R59）

## 5. 命名空间与消息协议

**ns 一根线穿过所有全局名字**。`KitConfig.namespace`（约束 `[a-z0-9]+` 单段）→ `createKit` 派生：

```
storage 键:  ${ns}-me-cache / ${ns}-panel-mode / ${ns}-image-handoff ...
消息 kind:   ${ns}-toggle-panel / ${ns}-cdn-grab ...
DOM 宿主:    id ${ns}-panel-host；属性 data-${ns}-badge / -toast / -resize / -copy（徽标宿主无 id——以 data 属性标记，review3 修订 F12）
iframe 消息: ${ns}-close-panel
```

核心收益：**浏览器内多产品共存**——用户同时装多个产品插件，消息/存储/DOM 宿主互不串台；布局竞争不在此列（§1 红线，review2 修订）。

ns 化名字全量清单（review2 修订 F11——搬运与验收基准；实现发现遗漏随补回填此表）：

| 类别 | 框架派生 |
|---|---|
| 存储键 | ${ns}-me-cache / ${ns}-panel-mode / ${ns}-panel-width / ${ns}-image-handoff / ${ns}-onboarding-seen |
| 消息 kind | ${ns}-image-handoff / ${ns}-grab / ${ns}-cdn-grab / ${ns}-toggle-panel / ${ns}-show-panel / ${ns}-handoff-consumed |
| | ${ns}-close-panel（iframe postMessage） |
| DOM id | ${ns}-panel-host |
| DOM data 属性 | data-${ns}-badge / -toast / -resize / -copy |
| Shadow 内 CSS | ${ns}-spin / ${ns}-shake |
| 菜单 id | ${ns}-convert（缺省派生；title/contexts 产品注入——F13） |

（P0 断言口径 = createKit 派生面**全表**——键/kind/id/属性/CSS 名皆纯字符串派生、不依赖模块实现，可在 P0 一次锁死 ns 契约；名字的**消费**随各模块 phase 进行为断言——review3 修订 F16。）

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

**唯一无既有实现对应物的抽象，显式登记为例外**：约束三则：纯字符串派生、无状态无新运行时概念；对任意 ns 输出 `${ns}-${suffix}` 确定性派生（createKit.test 全表即测试规格）；新派生类别须先回本节扩契约，不得散落。

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

- **构建**：tsdown（tsup 等价备选）；纯 ESM + 每模块 d.ts；dist 按 `src/<module>/index.ts` 分入口；exports map 十入口 + 根便捷入口（createKit + 全类型；/react 隔离不进根）
- **导出路径断言**（review2 修订）：新增模块入口时 tsdown entry / package.json exports / dist 实产三者同步——init.sh 的 build 步末尾断言每条 exports 路径在 dist 存在再放行（feat-001 已实捕 .js→.mjs 不匹配一次，固化防再犯）
- **发布**：GitHub Packages 私有（发布走 Actions GITHUB_TOKEN，安装侧每机一次性 `.npmrc` + PAT read:packages）。版本 0.x 起步，产品 #2 接入升 1.0。手工 semver + CHANGELOG.md，不上 changesets
- **联调 DX 双模式**（README 落地）：`npm link`（框架 tsdown --watch；本框架无 React 无双实例坑）用于同日改动；GitHub Packages 钉版用于稳定开发。**真实联调验证发生在产品 #2 接入时**——此前无跨仓消费者
- **example/ 最小示例插件**（仓内，workspace 相对引用）：装配形态参照 + Chrome 加载冒烟载体
- **demo/ 端到端消费验证插件**（feat-011）：最小消费者——徽标抓图 → 面板渲染 → 复制/偏好的真实 UI，真机六断言冒烟（scripts/demo-smoke.mjs）
- **harness**：init.sh（lint → unit → build，fail-fast）+ feature_list.json + progress.md + CLAUDE.md 启动头——与产品仓同一会话启动路径

### 新产品起步路径（本设计第一目标，无脚手架生成器）

新建 WXT 项目 → `npm i @gongxtao/extension-kit` → 按 [docs/onboarding.md](./onboarding.md) 分步接线（manifest 勾选表 + 入口骨架 + 首个单测 + 真机 checklist）→ 直接写业务视图。

**manifest 必备声明映射**（review4 修订 F21——装配指南骨架；F13 起 contextMenus 成框架必需权限，此类耦合登记于此）：

| 框架能力 | manifest 必备 |
|---|---|
| /panel | `web_accessible_resources`：panel.html + chunks/* + assets/* + icons/*（+ matches）——漏一项 iframe 白屏（静默无报错），有测试锁 |
| /session | `permissions`: cookies（+ storage） |
| /content + cdn 兜底 | `host_permissions`: \<all_urls\>（产品可收窄） |
| background 装配（F13 起） | `permissions`: contextMenus |
| /io asset-io | `permissions`: downloads |

## 7. 测试策略

- **测试跟代码走**；泛化本身 TDD——断言先 ns 参数化转红（夹具 ns 如 `testkit`），模块改绿
- **框架仓**：模块规格测试（jsdom；panel-host/badge DOM 级；/react hooks 测试用 @testing-library/react——devDep）+ example/demo 插件 Chrome 冒烟（已脚本化）+ init.sh
- **产品 #2 是首个真实消费者**，其 init.sh + E2E 即框架的消费者集成测试
- **框架变更协议**（README 落地）：改框架 → bump → link 进产品 #2 → 产品 init.sh + E2E 全绿才算收口
- **/testing 发布物**（P3 最小集起步）：fakeStorageArea（local/session 语义 + onChanged）/ fakeCookies / fakeMenus / runtime 消息假件 / Playwright 助手（结构类型运行时零依赖）

## 8. 实施切分（框架侧 P0–P3，每阶段硬门）

| Phase | 内容 | 出口门 |
|---|---|---|
| P0 | 仓 bootstrap：harness 四件套（含 .gitignore，F4）+ tsdown/vitest/eslint 接线 + **example/ 最小示例插件**（createKit 装配 + panel 骨架） | 框架 init.sh 绿 + example 插件 Chrome 手动加载验证（加载成功 + 面板开合 + createKit 产出的键/消息/DOM id 断言） |
| P1 | 确定性核心搬迁：①messaging（新写工厂，最小）②io ③session ④api ⑤panel ⑥react（useSession）——逐模块「测试参数化（红）→ 泛化实现（绿）→ commit」 | 每模块框架 init.sh 绿 |
| P2 | content 层：badge/handoff/scan 骨架 + CaptureSource 抓取源接口（契约 F26）+ image 抓取源 + cdn 双层拆分 | 同上 + example 集成徽标抓图链冒烟 |
| P3 | testing 最小集 + README（装配指南/变更协议）+ GitHub 私有远程仓创建与首推（F4）+ GitHub Packages 发布管线打通 | 0.1.0 可安装（dry-run 验证） |
| —— | **产品 #2 开工**（首个真实消费者；npm link / 钉版联调 DX 实战验证；具体抓取器按需加） | 产品 #2 仓自身 harness |

（均已按期收口：P0–P3 + demo 端到端验证 + 接入教程，见 §9 实施记录与 feature_list.json。）

## 9. 实施记录（模块 → 落地 commit）

| 框架模块 | 落地 commit |
|---|---|
| /config（createKit） | e7d98b3（feat-002） |
| /messaging | 9ec68a1（feat-003） |
| /io | ae07b7b（feat-004） |
| /session | 503f297（feat-005） |
| /api | 2431c6b（feat-006） |
| /panel | 0c656a1（feat-007） |
| /react | 1167b3a（feat-008） |
| /content（capture/runtime/cdn/handoff/background） | 353aba1（feat-009） |
| /testing + README + 发布管线 | 4f60eab（feat-010） |
| demo 端到端消费验证 | e228e6d（feat-011） |
| 接入教程 docs/onboarding.md | 6564308（feat-012） |

用途：模块级实施追溯与回归定位。

## 10. 演进纪律（D5' 的落地）

历史实现基线已冻结并移出参照范围：框架独立演进，不承诺与任何历史代码双向同步。产品 #2 起以本框架为唯一管线；框架缺陷在本仓修复，按 §6 变更协议发版。

## 11. 开放项

- 产品 #2 具体抓取的目标类型（图片之外）未定——按 D6 抽象落地，新抓取源随产品 #2 需求加，不影响框架侧
- npm link 联调 DX 未实战验证——产品 #2 接入时验证（design.md §6）
- example/ 是否升级为 kitchen-sink E2E 载体——等框架开始「无消费者迁移在途的独立演进」时再议（产品 #2 存在后即有常驻消费者）
