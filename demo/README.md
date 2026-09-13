# Extension Kit Demo（feat-011 端到端消费验证）

framework 的「最小消费者」：徽标抓图 → handoff 通道 → 面板渲染 → 复制/偏好，全链在真实 Chrome 里跑通。与 example/ 的差异：example 证明「装配可复制」，demo 证明「产品可用」——有真实 UI、状态与交互。

## 消费的框架模块

| 模块 | demo 中的用途 |
|---|---|
| /config | `createKit({ namespace: 'demokit' })`——一根线派生全部名字 |
| /messaging | `kitMessages('demokit')`——toggle/show/grab/close-panel 等 7 kind |
| /content | `startContentRuntime`（扫描/徽标/handoff 消费）+ `imageCapture` + `setupPageIntegration`（background 装配面） |
| /panel | `createPanelHost`（iframe 宿主/挤压/拖宽）+ `createPanelPrefs`（模式切换，面板页按钮驱动） |
| /io | `copyText`（Copy data URL，R116/R121 回退链）+ `createFlagStore`（首开标记） |
| /testing | demo 单测消费假件工厂（闭环验证发布物） |
| /session /api /react | 范围裁定：不接真实后端（demo 无后端；三模块已由框架单测覆盖）——真实消费归产品 #2 |

## 面板功能

- **内容区**：渲染最近一次抓取（storage.session handoff → dataUrl），TTL 过期（5min）显示过期提示（isFresh/R47）
- **metadata 胶囊**：来源值透传展示（F24；demo 固定 `demo-page`）
- **Copy data URL**：/io clipboard（async clipboard → execCommand 回退链）
- **Mode 按钮**：squeeze ↔ overlay 切换，panel-prefs 持久化、content 宿主即时生效
- **首开标记**：flag-store（`demokit-onboarding-seen`），首次打开显示欢迎行

## 构建与冒烟

```bash
cd .. && npm run build   # 先构建框架（demo 以 file:.. 引用其 dist）
npm install
npm run compile          # wxt prepare + tsc
npm run build            # wxt build → .output/chrome-mv3
npm run smoke            # 真机断言（前置同 example/README：UI 载入一次 + 调试端口）
```

冒烟六断言（scripts/demo-smoke.mjs）：

1. 扩展加载（panel.html 驱动页可达）
2. 徽标抓图链：canvas 造大图（自包含零网络）→ 自动挂徽标 → 点击 → 抓取 + 面板直开（R90）
3. handoff 落 storage.session（metadata=demo-page 透传 + 本轮新鲜度防旧记录冒充）
4. 面板渲染抓取内容（img dataUrl + metadata 胶囊 + Copy 按钮可见）
5. 首开标记落 storage.local（flag-store）
6. 模式切换持久化（读前值 → 点击 → 断言翻转——跨运行持久化本身即被测行为）
