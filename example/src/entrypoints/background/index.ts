/**
 * background 入口（P1 起升级为框架真实装配：setupPageIntegration 参数化整体）
 *
 * 产品壳只剩「值注入」：菜单 title/contexts 文案（F23）、kit 派生 id/键、
 * SW 转码面 makeOffscreenCanvas。chrome.* 各面按结构子集接线 browser 单例。
 */

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
      // R97 显式适配：create 错误在 chrome.runtime.lastError（回调内读取即消费）
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
      messages: kitMessages('exkit'),
      captureSource: imageCapture({ makeCanvas: makeOffscreenCanvas }),
      makeCanvas: makeOffscreenCanvas,
      menuId: kit.menuId('convert'),
      menu: { title: 'Open Example Panel', contexts: ['image'] },
    },
  );
});
