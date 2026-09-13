# Extension Kit Example（P0 骨架）

extension-kit 的装配活样例兼 P0 验证载体：createKit 装配 + 极简面板开合。

## 结构（= 新产品起步的最小形状）

```
example/
├── wxt.config.ts                      # manifest：permissions / WAR（R91 清单，漏一项 iframe 白屏）
└── src/
    ├── lib/kit.ts                     # 唯一 kit 实例：createKit({ namespace: 'exkit' })
    └── entrypoints/
        ├── background/index.ts        # 菜单（kit.menuId）+ toolbar → toggle/show 消息（kit.kind）
        ├── content/index.ts           # iframe 宿主（kit.domId('panel-host')）+ 消息开合
        └── panel/                     # 面板页（Close 按钮 → ${ns}-close-panel postMessage）
```

## 构建与冒烟

```bash
# 先在仓根构建框架（example 以 file:.. 符号链接引用其 dist）
cd .. && npm run build
npm install        # 本目录内，首次即可
npm run build      # wxt build → .output/chrome-mv3
```

Chrome 冒烟（P0 出口门三断言，design.md §7「手动/可脚本化」——本仓已脚本化为
`scripts/chrome-smoke.mjs`）：

```bash
# 一次性：品牌 Chrome 137+ 已禁用 --load-extension，须经 UI 载入一次
#   临时 profile 启动 Chrome（调试端口）：
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/tmp/exkit-smoke --no-first-run --remote-debugging-port=9222
#   chrome://extensions → 开发者模式 → 加载未打包的扩展程序 →
#   选本目录 .output/chrome-mv3（同一 profile 重启保留）
npm run smoke      # 三断言：扩展加载注入 / 面板开合 / ns 化键-消息-DOM id
```

三断言内容：

1. **加载成功**：扩展页经 CDP 可达，content script 注入目标页
2. **面板开合**：toggle 开 → 面板 iframe 内 Close 点击关 → toggle 再开再关
3. **键-消息-DOM id**：content console 对象三属性 = `exkit-me-cache` / `exkit-toggle-panel` / `exkit-panel-host`
