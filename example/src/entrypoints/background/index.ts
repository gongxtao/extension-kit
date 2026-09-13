/**
 * background 入口（P0 装配骨架）
 *
 * 演示 ns 化菜单 id + 消息 kind：
 * - toolbar 图标 → tabs.sendMessage {kind: kit.kind('toggle-panel')}——开↔关（R90 语义）
 * - 右键菜单（id = kit.menuId('convert')，F13 缺省派生）→ {kind: kit.kind('show-panel')}——
 *   菜单意图是开着面板（R49 语义）
 * - 幂等纪律（F22）：SW 每次唤醒 removeAll→rebuild；duplicate id 经 lastError 显式消费不炸
 *
 * framework 的 setupPageIntegration 参数化整体（菜单/toolbar/路由）随 feat-009
 * /content 落地；届时本文件收敛为「装配调用 + 产品值注入」的产品壳。
 */

import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { kit } from '../../lib/kit';

export default defineBackground(() => {
  const menuId = kit.menuId('convert');

  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create(
      { id: menuId, title: 'Open Example Panel', contexts: ['all'] },
      () => void browser.runtime.lastError,
    );
  });

  browser.action.onClicked.addListener((tab) => {
    if (tab?.id != null) {
      void browser.tabs.sendMessage(tab.id, { kind: kit.kind('toggle-panel') });
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === menuId && tab?.id != null) {
      void browser.tabs.sendMessage(tab.id, { kind: kit.kind('show-panel') });
    }
  });
});
