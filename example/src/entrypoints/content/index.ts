/**
 * content 入口（P1 起升级为框架真实装配：startContentRuntime + 框架徽标/面板/抓取源）
 *
 * 产品壳只剩「值注入」（F23 品牌/文案 + F17 来源值与角位策略 + kit 派生名字）。
 * 注入纪律（F27）由框架各面自持：Shadow DOM 隔离 + inline 自包含 + data-${ns}-*
 * 标记 + z-index 顶格。P0 时代的内联 iframe 骨架已被框架 createPanelHost 取代。
 */

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
    const messages = kitMessages('exkit');

    const panelHost = createPanelHost({
      getPanelUrl: () => browser.runtime.getURL('/panel.html'),
      prefs: createPanelPrefs(browser.storage.local, (listener) => {
        browser.storage.onChanged.addListener(listener as never);
        return () => browser.storage.onChanged.removeListener(listener as never);
      }, { mode: kit.key('panel-mode'), width: kit.key('panel-width') }),
      domId: kit.domId('panel-host'),
      closeMessage: kit.kind('close-panel'),
      resizeAttr: kit.dataAttr('resize'),
      ariaLabel: 'Resize example panel',
      borderStyle: '1px solid rgba(0,0,0,.08)',
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
      // F23 品牌/文案注入零缺省（demo 值——真实产品换自己的 logo path 与品牌色）
      badgeDeps: {
        badgeAttr: kit.dataAttr('badge'),
        cssNames: { spin: kit.cssName('spin'), shake: kit.cssName('shake') },
        ariaLabel: 'Convert with Extension Kit Example',
        fallbackText: 'Open the image directly, then try again',
        tooLargeText: 'Image too large for this demo',
        branding: {
          badgeColor: '#4a90d9',
          icons: {
            logo: '<circle cx="64" cy="64" r="34" fill="none" stroke="#fff" stroke-width="12"/>',
            lock: '<rect x="44" y="56" width="40" height="36" rx="6" fill="#fff"/>',
            check: '<path d="M36 66l20 20 36-44" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>',
          },
        },
        cornerFor: () => 'bottom-right',
        source: 'example',
      },
    });

    // 控制台打印 ns 化键/消息/DOM id——三断言观察点（保持 P0 口径）
    console.info('[extension-kit-example] ns=exkit 装配冒烟', {
      storageKey: kit.key('me-cache'),
      messageKind: kit.kind('toggle-panel'),
      domId: kit.domId('panel-host'),
    });
  },
});
