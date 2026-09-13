# Extension Kit

浏览器插件通用能力框架（headless 核心 + `/react` 逻辑 hooks）——会话同步 / 页内面板宿主 / 页面集成抓取 / 消息协议 / 测试基建。新产品起步 = WXT 入口装配 + 业务视图，基础管线零重写。

- **设计真源**：[docs/design.md](./docs/design.md)（v2，五轮 review 收口 F1–F28）
- **装配活样例**：[example/](./example/)（装配形态参照）· [demo/](./demo/)（端到端消费验证：徽标抓图 → 面板渲染 → 复制/偏好，含真机冒烟）
- **抽离源**：ready-svg 插件（基线 commit `95d0842`，冻结仓，copy-out 只抄不搬）
- **仅 Chromium MV3**（Chrome ≥123 随源钉）；核心运行时零依赖；`/react` 的 react 为可选 peerDependency

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

新建 WXT 项目 → 装包 → 按 [example/](./example/) 的形态接线（下列骨架可直接复制，`<ns>` 换成产品自己的单段 `[a-z0-9]+` 命名空间）。

### 1. manifest 必备声明（缺一项 = 静默故障，F21）

```ts
// wxt.config.ts（节选；完整形态见 example/wxt.config.ts）
export default defineConfig({
  srcDir: 'src',
  manifest: () => ({
    name: 'Your Product',
    permissions: ['storage', 'contextMenus', 'cookies' /* session */, 'downloads' /* asset-io */],
    host_permissions: ['<all_urls>'],          // /content + CDN 兜底（可收窄）
    minimum_chrome_version: '123',
    // /panel：页内 iframe 面板宿主需页面可载扩展页——漏一项 iframe 白屏（R91）
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
  createBadgeOverlay, imageCapture, makeDomCanvas,
} from '@gongxtao/extension-kit';
import { kit } from '../lib/kit';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const messages = kitMessages('<ns>');           // kitMessages(kit 派生面的 ns)
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
    const badge = createBadgeOverlay({
      doc: document,
      badgeAttr: kit.dataAttr('badge'),
      cssNames: { spin: kit.cssName('spin'), shake: kit.cssName('shake') },
      ariaLabel: '<产品文案>',                        // F23：注入零缺省
      fallbackText: '<回退文案>', tooLargeText: '<超限文案>',
      branding: { badgeColor: '<品牌色>', icons: { logo: '<path…>', lock: '<path…>', check: '<path…>' } },
      cornerFor: (source) => (source === '<站点值>' ? 'top-right' : 'bottom-right'), // F17
      source: /* 产品来源值或省略 */,
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
      messages, panelHost, badge,
      toastAttr: kit.dataAttr('toast'),
    });
  },
});
```

> 面包屑：`startContentRuntime` 的 deps（captureSource / messages / badgeDeps / panelHost）
> 与 `setupPageIntegration` 的 opts（menuId 缺省 `kit.menuId('convert')`）在
> docs/design.md §4 有逐条契约（F13/F17/F23/F26），example/ 是可运行参照。

### 4. background 入口（菜单 / toolbar / handoff 收口 / CDN 兜底）

```ts
// src/entrypoints/background/index.ts —— setupPageIntegration(ctx, opts)
// 完整可编译形态：待 /content 集成时照 ready-svg entrypoints/background 形态接线
//（ctx = browser 各面结构子集 + createHandoffStore(browser.storage.session, kit.key('image-handoff'))）
```

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
4. ready-svg 侧共享代码 bug：就地小修 + 按 design.md §9 溯源映射表对照移植（可选项）

## 会话启动路径（代理/AI 协作）

1. `pwd && git status --short --branch`（新 shell 先 `nvm use`）
2. 读 `CLAUDE.md` 启动头（含落地质则铁律）→ `docs/design.md`（真源）→ `session-handoff.md` → `feature_list.json` / `progress.md`
3. Run `./init.sh`（lint → unit → build，fail-fast）
4. `git log --oneline -5` 对齐最近变更
