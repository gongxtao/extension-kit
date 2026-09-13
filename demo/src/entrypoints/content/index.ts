/**
 * content 入口（demo 消费面：startContentRuntime + 框架徽标/面板/抓取源）
 *
 * 与 example 同构（ns=demokit）——证明装配形态可复制：产品壳只剩「值注入」。
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
      ariaLabel: 'Resize demo panel',
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
        ariaLabel: 'Grab with Demo',
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
        source: 'demo-page',
      },
    });

    console.info('[extension-kit-demo] ns=demokit 装配', {
      storageKey: kit.key('image-handoff'),
      messageKind: kit.kind('toggle-panel'),
      domId: kit.domId('panel-host'),
    });
  },
});
