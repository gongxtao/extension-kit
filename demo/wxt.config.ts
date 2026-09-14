import { defineConfig } from 'wxt';

// 装配形态最小化裁剪——demo 不接真实后端，
// 无 react 模块 / auto-icons；downloads（asset-io）与 cookies（session）留待产品 #2。
export default defineConfig({
  srcDir: 'src',
  manifest: () => ({
    name: 'Extension Kit Demo',
    description: 'extension-kit 端到端消费验证：徽标抓图 → 面板渲染 → 复制/偏好',
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
