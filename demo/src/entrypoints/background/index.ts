/**
 * background 入口（demo 消费面：setupPageIntegration——菜单/toolbar/handoff 收口/CDN 兜底）
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
      menu: { title: 'Grab with Demo', contexts: ['image'] },
    },
  );
});
