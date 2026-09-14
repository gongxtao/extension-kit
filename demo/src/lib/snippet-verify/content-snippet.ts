/**
 * feat-012 教程编译门——内容 = docs/onboarding.md §4 content 入口代码块
 * 逐段一致（唯一差异：kit 导入路径 `../kit`，本文件比 entrypoints 深一级）。
 * 保留在仓内作回归守：教程代码块对真实 API 的可编译性随 demo compile 持续受检。
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
import { kit } from '../kit';

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
      ariaLabel: 'Resize my product panel',
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
        ariaLabel: 'Grab with My Product',
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
        source: 'my-site',
      },
    });
  },
});
