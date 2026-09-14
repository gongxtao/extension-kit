import { defineConfig } from 'wxt';

// 装配形态最小化裁剪：P0 骨架不需要
// react 模块 / auto-icons / downloads（asset-io 随 feat-004）/ cookies（session 随 feat-005）。
export default defineConfig({
  srcDir: 'src',
  manifest: () => ({
    name: 'Extension Kit Example',
    description: 'extension-kit 装配活样例：createKit + 极简面板开合（P0）',
    action: {},
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    minimum_chrome_version: '123',
    // R91 纪律：页内 iframe 面板宿主需页面可载扩展页——WAR 漏一项 iframe 白屏（F21）
    web_accessible_resources: [
      {
        resources: ['panel.html', 'chunks/*', 'assets/*', 'icons/*'],
        matches: ['<all_urls>'],
      },
    ],
  }),
});
