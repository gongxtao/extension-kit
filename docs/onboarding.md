# 新产品接入教程（extension-kit onboarding）

> 从零到「徽标抓内容 → 面板展示」的最小可跑插件，约 15 分钟。完整可运行参照 =
> [`demo/`](../demo/)（与本教程代码逐段一致，已通过真机六断言冒烟）。
> 框架设计与裁定依据见 [design.md](./design.md)；模块 API 见各 subpath 的类型导出。

## 0. 前置

- Node ≥ 24（仓 `.nvmrc` 口径；`nvm use`）
- Chrome（仅 Chromium MV3，≥123）
- 框架安装：GitHub Packages 私有包，每机一次性 `.npmrc`（PAT 需 `read:packages`）：

```
@gongxtao:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<GITHUB_PAT>
```

```bash
mkdir my-product && cd my-product && npm init -y
npm i @gongxtao/extension-kit
npm i -D wxt typescript
```

## 1. 第一步也是最重要的一步：选命名空间（ns）

ns 是一根线穿过你的产品所有全局名字（存储键 / 消息 kind / DOM id / CSS 动画名）。
规则：`[a-z0-9]+` 单段（`createKit` 会拒绝非法值）。**用户浏览器里同时装多个基于本
框架的产品互不串台，全靠它**——所以选一个你自己独有的短名（下文用 `demokit` 演示，
换成你的）。

```ts
// src/lib/kit.ts —— 全产品唯一 kit 实例
import { createKit } from '@gongxtao/extension-kit';

export const kit = createKit({ namespace: 'demokit' });
```

## 2. manifest：按你要的能力勾选（wxt.config.ts）

只用 /io 的 flag-store？那 permissions 只要 `storage`。下表按能力累加
（F21 映射表——**漏一项就是静默故障**，尤其 WAR）：

| 你要的能力 | manifest 必备 |
|---|---|
| /io flag-store / panel-prefs | `permissions: ['storage']` |
| /content（徽标/抓图/面板宿主） | `host_permissions: ['<all_urls>']`（可收窄） |
| background 装配面（右键菜单） | `permissions: ['contextMenus']` |
| /panel 页内 iframe 面板 | `web_accessible_resources`：`panel.html` + `chunks/*` + `assets/*` + `icons/*`（+ matches）——**漏一项 iframe 白屏且无报错** |
| /session 会话 | `permissions: ['cookies']`（+ storage） |
| /io asset-io 下载 | `permissions: ['downloads']` |

```ts
// wxt.config.ts —— 抓图+面板的最小形态（本教程全量）
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

## 3. background 入口（框架装配面：菜单 / toolbar / handoff 收口 / CDN 兜底）

`setupPageIntegration(ctx, opts)` 整体在框架内——你的壳只剩「值注入」：菜单文案、
kit 派生 id/键、SW 转码面。chrome.* 各面按结构子集接线 `browser` 单例：

```ts
// src/entrypoints/background/index.ts
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { kitMessages } from '@gongxtao/extension-kit';
import {
  createHandoffStore,
  imageCapture,
  makeOffscreenCanvas,
  setupPageIntegration,
} from '@gongxtao/extension-kit/content';
import { kit } from '../../lib/kit';

export default defineBackground(() => {
  setupPageIntegration(
    {
      menus: {
        create: (props, onError) => {
          browser.contextMenus.create(props as never, () => {
            onError((browser.runtime as { lastError?: { message?: string } }).lastError?.message);
          });
        },
        removeAll: (callback) => browser.contextMenus.removeAll(callback),
        onClicked: browser.contextMenus.onClicked,
      },
      runtime: browser.runtime,
      action: browser.action,
      tabs: browser.tabs,
      handoffStore: createHandoffStore(browser.storage.session, kit.key('image-handoff')),
    },
    {
      messages: kitMessages('demokit'),
      captureSource: imageCapture({ makeCanvas: makeOffscreenCanvas }),
      makeCanvas: makeOffscreenCanvas,
      menuId: kit.menuId('convert'),
      menu: { title: 'Grab with My Product', contexts: ['image'] },
    },
  );
});
```

注意 `create` 的错误走回调通道（Chrome lastError 语义）——这是 R97 踩坑记录，
照抄即可，别改成 try/catch。

## 4. content 入口（扫描 + 徽标 + 面板宿主）

`startContentRuntime(deps)` 同样整体在框架内。两件事你要注入：**面板宿主**
（createPanelHost——地址/键/DOM id 全 kit 派生）和**徽标装配面 badgeDeps**
（品牌/文案，F23：框架零缺省，全由你注入）：

```ts
// src/entrypoints/content/index.ts
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  createPanelHost,
  createPanelPrefs,
  kitMessages,
} from '@gongxtao/extension-kit';
import {
  imageCapture,
  makeDomCanvas,
  startContentRuntime,
} from '@gongxtao/extension-kit/content';
import { kit } from '../../lib/kit';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const messages = kitMessages('demokit');

    const panelHost = createPanelHost({
      getPanelUrl: () => browser.runtime.getURL('/panel.html'),
      prefs: createPanelPrefs(browser.storage.local, (listener) => {
        browser.storage.onChanged.addListener(listener as never);
        return () => browser.storage.onChanged.removeListener(listener as never);
      }, { mode: kit.key('panel-mode'), width: kit.key('panel-width') }),
      domId: kit.domId('panel-host'),
      closeMessage: kit.kind('close-panel'),
      resizeAttr: kit.dataAttr('resize'),
      ariaLabel: 'Resize my product panel',
    });

    startContentRuntime({
      doc: document,
      runtime: {
        sendMessage: (msg: unknown) => browser.runtime.sendMessage(msg),
        onMessage(listener: (msg: unknown) => void) {
          browser.runtime.onMessage.addListener(listener as never);
          return () => browser.runtime.onMessage.removeListener(listener as never);
        },
      },
      captureSource: imageCapture({ makeCanvas: makeDomCanvas }),
      messages,
      toastAttr: kit.dataAttr('toast'),
      panelHost,
      badgeDeps: {
        badgeAttr: kit.dataAttr('badge'),
        cssNames: { spin: kit.cssName('spin'), shake: kit.cssName('shake') },
        ariaLabel: 'Grab with My Product',
        fallbackText: 'Could not grab this image — try another',
        tooLargeText: 'Image too large for the handoff channel',
        branding: {
          badgeColor: '#7c5cff',
          icons: {
            logo: '<path d="M40 88V40h24a16 16 0 0 1 0 32H52" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>',
            lock: '<rect x="44" y="56" width="40" height="36" rx="6" fill="#fff"/>',
            check: '<path d="M36 66l20 20 36-44" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>',
          },
        },
        cornerFor: () => 'bottom-right',
        source: 'my-site',
      },
    });
  },
});
```

`badgeDeps` 里是产品身份所在：`branding`（徽标底色 + 三态图标 path）、四条文案、
角位策略。`source` 是你的来源值（如站点名）——它经 metadata 透传到面板（F24），
值域完全归你，框架不校验。

## 5. panel 页（消费抓取内容）

`src/entrypoints/panel/index.html` + `main.ts`。核心逻辑三段（完整可运行版见
[`demo/src/entrypoints/panel/main.ts`](../demo/src/entrypoints/panel/main.ts)）：

```ts
import { browser } from 'wxt/browser';
import { kitMessages } from '@gongxtao/extension-kit';
import type { HandoffRecord } from '@gongxtao/extension-kit/content';
import { kit } from '../../lib/kit';

const messages = kitMessages('demokit');

// ① 读 storage.session 的 handoff 记录（background 收口写入）
const bag = await browser.storage.session.get(kit.key('image-handoff'));
const record = bag[kit.key('image-handoff')] as HandoffRecord | undefined;

// ② TTL 新鲜度判定（R47：5min 过期不渲染，防旧内容突袭）
import { isFresh } from '@gongxtao/extension-kit/content';
if (record && isFresh(record, Date.now())) {
  img.src = `data:${record.mime};base64,${record.base64}`;   // 直接进 <img>
  pill.textContent = String(record.metadata);                 // 来源胶囊（F24）
}

// ③ Close 按钮 → postMessage 回宿主（iframe 与页面间唯一轻通路）
closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ kind: messages.closePanel.kind }, '*');
});
```

热路径同理：`browser.storage.onChanged` 监听 `session` 区本键，面板开着时抓取
落定即时重渲染。

## 6. 用 /testing 写第一个单测（不碰浏览器）

```ts
// src/lib/prefs.test.ts —— 示例：flag-store + fakeStorageArea（@testing-library 都不用）
import { describe, expect, it } from 'vitest';
import { createFlagStore } from '@gongxtao/extension-kit';
import { createFakeStorageArea } from '@gongxtao/extension-kit/testing';
import { kit } from './kit';

describe('首开标记', () => {
  it('mark 前后 get 翻转；坏数据不炸', async () => {
    const area = createFakeStorageArea();
    const flag = createFlagStore(area, kit.key('onboarding-seen'));
    expect(await flag.get()).toBe(false);
    await flag.mark();
    expect(await flag.get()).toBe(true);
  });
});
```

测试文件需要 DOM 时在首行加 `// @vitest-environment jsdom`（仓内惯例 per-file，
不全局切）。

## 7. 构建与真机验证

```bash
npm run build   # wxt build → .output/chrome-mv3
```

1. `chrome://extensions` → 开发者模式 → **加载已打包的扩展程序** → 选
   `.output/chrome-mv3`（品牌 Chrome 137+ 已禁 `--load-extension` 命令行，必须走 UI；
   Chromium / Chrome for Testing 不受限）
2. 打开有大图的页面（图片 ≥300px 原始尺寸且 ≥160px 渲染才挂徽标——头像/图标不触发是
   设计行为）→ 悬停图片右下角 → 徽标淡入 → 点击
3. 肉眼 checklist：面板直开并渲染刚抓的图 / 来源胶囊显示你的 source 值 /
   Close 关面板 / 重开浏览器模式与首开标记保持
4. 想脚本化？参照仓内 `scripts/demo-smoke.mjs`（CDP 六断言）改造你的 ns

## 8. 常见坑速查

| 症状 | 原因 |
|---|---|
| 面板 iframe 白屏、控制台无报错 | WAR 清单漏项（`panel.html`/`chunks/*`/`assets/*`/`icons/*` 缺一不可，R91） |
| 右键菜单注册报 duplicate id / Unchecked lastError | 没走 removeAll→rebuild 幂等模式 / create 回调未消费 lastError（§3 代码已内置） |
| 大图不挂徽标 | 阈值：natural ≥300、渲染 ≥160×160、`data:` 占位排除、`aria-hidden` 排除；`blob:` 可抓 |
| 换了新构建不生效 | UI 载入的扩展要点「重新加载」；已开页面要 reload 才注入新 content script |
| 两个产品互相干扰 | ns 没分开（存储/消息/DOM 名字全由 ns 派生） |
| 想改徽标文案/颜色 | 全在 `badgeDeps`（F23：框架零缺省，产品注入） |
| 抓取成功但面板不显示 | 记录 TTL 过期（5min，R47）——重新抓；或 metadata 形状与消费侧约定不符 |

## 9. 接真实后端时（/session /api /react）

本教程跳过会话层（demo 无后端）。接 Supabase 会话时：

- `/session`：`createSessionStore({ cookies, config, fetchFn?, now? })`——config 四字段
  （webOrigin/supabaseUrl/publishableKey/sessionCookieName）为产品常量注入
- `/api`：`apiFetch(deps, path, opts)` 纯传输（Bearer/信封守卫/multipart/raw）——端点
  函数你写（MeInfo 形状归产品，F3）
- `/react`：`useSession<TMe>(store, { fetchAccount, baseUrl, meCache?, ... })`——
  `fetchAccount` 用 apiFetch 封装你的账户端点

API 细节看各模块 `.d.mts` 类型导出（`node_modules/@gongxtao/extension-kit/dist/`），
行为语义与裁定出处看 [design.md](./design.md) §3/§4/§5。
