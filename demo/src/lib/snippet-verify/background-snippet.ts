/**
 * feat-012 教程编译门——内容 = docs/onboarding.md §3 background 入口代码块
 * 逐段一致（唯一差异：kit 导入路径 `../kit`，本文件比 entrypoints 深一级）。
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
import { kit } from '../kit';

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
