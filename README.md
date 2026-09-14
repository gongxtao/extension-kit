# Extension Kit

浏览器插件通用能力框架（headless 核心 + `/react` 逻辑 hooks）——会话同步 / 页内面板宿主 / 页面集成抓取 / 消息协议 / 测试基建。新产品起步 = WXT 入口装配 + 业务视图，基础管线零重写。

- **状态**：v0.1.0 已发布（GitHub Packages 私有）；12/12 特性收口；228+ 单测 + 真机冒烟全绿
- **设计真源**：[docs/design.md](./docs/design.md)（模块契约 / 配置归属 / 命名空间协议 / 裁定记录）
- **接入教程**：[docs/onboarding.md](./docs/onboarding.md)——从零到「徽标抓内容 → 面板展示」的分步指南（代码块经编译门持续校验）
- **可运行参照**：[example/](./example/)（最小装配形态）· [demo/](./demo/)（端到端消费验证：抓图 → 面板渲染 → 复制/偏好，真机六断言冒烟）
- **仅 Chromium MV3**（Chrome ≥123）；核心运行时零依赖；`/react` 的 react 为可选 peerDependency

## 安装

GitHub Packages 私有包。每机一次性 `.npmrc`（PAT 需 `read:packages`）：

```
@gongxtao:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<GITHUB_PAT>
```

```bash
npm i @gongxtao/extension-kit
```

## 新产品起步路径（无脚手架生成器）

> **完整分步教程见 [docs/onboarding.md](./docs/onboarding.md)**（安装 → ns → manifest 勾选 →
> 三入口 → panel 页 → 首个单测 → 真机 checklist → 常见坑；代码块经 demo 编译门持续校验）。
> 下列骨架可直接复制，`<ns>` 换成产品自己的单段 `[a-z0-9]+` 命名空间。

### 1. manifest：按你要的能力勾选（wxt.config.ts）

只用 /io 的 flag-store？那 permissions 只要 `storage`。按能力累加（F21 映射表——
**漏一项就是静默故障**，尤其 WAR）：

| 你要的能力 | manifest 必备 |
|---|---|
| /io flag-store / panel-prefs | `permissions: ['storage']` |
| /content（徽标/抓图/面板宿主） | `host_permissions: ['<all_urls>']`（可收窄） |
| background 装配面（右键菜单） | `permissions: ['contextMenus']` |
| /panel 页内 iframe 面板 | `web_accessible_resources`：`panel.html` + `chunks/*` + `assets/*` + `icons/*`（+ matches）——**漏一项 iframe 白屏且无报错** |
| /session 会话 | `permissions: ['cookies']`（+ storage） |
| /io asset-io 下载 | `permissions: ['downloads']` |

```ts
// wxt.config.ts —— 抓图+面板的最小形态
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: () => ({
    name: 'My Product',
    action: {},
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    minimum_chrome_version: '123',
    web_accessible_resources: [
      { resources: ['panel.html', 'chunks/*', 'assets/*', 'icons/*'], matches: ['<all_urls>'] },
    ],
  }),
});
```

### 2. 唯一 kit 实例（ns 一根线穿过所有全局名字，§5）

```ts
// src/lib/kit.ts
import { createKit } from '@gongxtao/extension-kit';
export const kit = createKit({ namespace: '<ns>' });   // 存储键/消息 kind/DOM id 全由此派生
```

### 3. content 入口（页面集成 + 面板宿主，可选模块）

```ts
// src/entrypoints/content/index.ts
import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import {
  kitMessages, createPanelPrefs, createPanelHost, startContentRuntime,
  imageCapture, makeDomCanvas,
} from '@gongxtao/extension-kit';
import { kit } from '../lib/kit';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const messages = kitMessages('<ns>');
    const panelHost = createPanelHost({
      getPanelUrl: () => browser.runtime.getURL('/panel.html'),
      prefs: createPanelPrefs(browser.storage.local, (l) => {
        browser.storage.onChanged.addListener(l as never);
        return () => browser.storage.onChanged.removeListener(l as never);
      }, { mode: kit.key('panel-mode'), width: kit.key('panel-width') }),
      domId: kit.domId('panel-host'),
      closeMessage: kit.kind('close-panel'),
      resizeAttr: kit.dataAttr('resize'),
      // ariaLabel / borderStyle 可选（F23：aria 产品注入零缺省；边线通用缺省可覆盖）
    });
    startContentRuntime({
      doc: document,
      runtime: {
        sendMessage: (msg) => browser.runtime.sendMessage(msg),
        onMessage(l) {
          browser.runtime.onMessage.addListener(l as never);
          return () => browser.runtime.onMessage.removeListener(l as never);
        },
      },
      captureSource: imageCapture({ makeCanvas: makeDomCanvas }), // F26 抓取源
      messages, panelHost,
      toastAttr: kit.dataAttr('toast'),
      badgeDeps: {                      // 徽标装配面——runtime 内部组 createBadgeOverlay（勿自传 badge 实例）
        badgeAttr: kit.dataAttr('badge'),
        cssNames: { spin: kit.cssName('spin'), shake: kit.cssName('shake') },
        ariaLabel: '<产品文案>',          // F23：注入零缺省
        fallbackText: '<回退文案>', tooLargeText: '<超限文案>',
        branding: { badgeColor: '<品牌色>', icons: { logo: '<path…>', lock: '<path…>', check: '<path…>' } },
        cornerFor: (source) => (source === '<站点值>' ? 'top-right' : 'bottom-right'), // F17
        source: /* 产品来源值或省略 */,
      },
    });
  },
});
```

### 4. background 入口（菜单 / toolbar / handoff 收口 / CDN 兜底）

```ts
// src/entrypoints/background/index.ts —— setupPageIntegration(ctx, opts)：装配面整体在框架内
import { browser } from 'wxt/browser';
import { kitMessages } from '@gongxtao/extension-kit';
import {
  createHandoffStore, imageCapture, makeOffscreenCanvas, setupPageIntegration,
} from '@gongxtao/extension-kit/content';
import { kit } from '../lib/kit';

defineBackground(() => setupPageIntegration(
  {
    menus: { /* R97：create 错误走回调通道（lastError），照教程抄勿改 try/catch */ },
    runtime: browser.runtime, action: browser.action, tabs: browser.tabs,
    handoffStore: createHandoffStore(browser.storage.session, kit.key('image-handoff')),
  },
  {
    messages: kitMessages('<ns>'),
    captureSource: imageCapture({ makeCanvas: makeOffscreenCanvas }),
    makeCanvas: makeOffscreenCanvas,
    menuId: kit.menuId('convert'),                    // F13：缺省派生
    menu: { title: '<菜单文案>', contexts: ['image'] }, // 产品值注入（F23）
  },
));
```

（`defineBackground` 从 `wxt/utils/define-background` 导入；menus 接线全文见
[docs/onboarding.md §3](./docs/onboarding.md)——含 lastError 回调消费的完整写法。）

### 5. 测试

```ts
import { createFakeStorageArea, createFakeCookies, createFakeContentRuntime } from '@gongxtao/extension-kit/testing';
// 单测假件（storage onChanged / cookie 域过滤+提交时序 / 消息 fire）——零浏览器依赖
// E2E 助手：launchExtensionOptions / openExtensionPage / injectSessionCookie / routeJson
//（结构类型；运行时零依赖，消费方自带 @playwright/test）
```

## 模块一览（subpath exports）

| 入口 | 内容 | 依赖纪律 |
|---|---|---|
| `/config` | createKit（ns 派生键/消息 kind/DOM id，六派生面） | 底层零依赖 |
| `/messaging` | kitMessages 内置 7 kind + defineMessages 工厂（畸形静默丢弃） | 底层零依赖 |
| `/io` | clipboard 回退链 / asset-io 核 / flag-store / StorageArea 单点 | 底层零依赖 |
| `/session` | cookie codec（@supabase/ssr 对齐）/ auth-rest / session-store / me-cache 泛型 | type 级引用 |
| `/api` | apiFetch 传输骨架（Bearer / 401 映射 / 信封守卫 / multipart / raw） | type 级引用 |
| `/panel` | 页内 iframe 面板宿主（挤压/拖宽/跨标签同步）+ panel-prefs | type 级引用 |
| `/react` | useSession（乐观首绘 + TTL 节流；react peerDependency） | peer: react |
| `/content` | 抓取源接口（F26）/ 图片抓取源 / 徽标 / handoff / 扫描 / background 装配面 | type 级引用 |
| `/testing` | 假件工厂（storage/cookies/menus/runtime/observer）+ Playwright 助手 | 运行时零依赖 |

## 变更协议（改框架 → 产品跟随）

1. 改框架 → bump semver（手工 + CHANGELOG.md，不上 changesets）→ init.sh 全绿
2. 打 `v*` 标签推送 → Actions 自动发布 GitHub Packages（`.github/workflows/release.yml`）
3. 产品侧升版 → 产品 init.sh + E2E 全绿才算收口（无消费者迁移在途的独立演进期除外）

## 会话启动路径（代理/AI 协作）

1. `pwd && git status --short --branch`（新 shell 先 `nvm use`）
2. 读 `CLAUDE.md` 启动头 → `docs/design.md`（真源）→ `session-handoff.md` → `feature_list.json` / `progress.md`
3. Run `./init.sh`（lint → unit → build，fail-fast）
4. `git log --oneline -5` 对齐最近变更
