/**
 * content 入口（P0 面板骨架）
 *
 * 演示 ns 化 DOM id + 消息开合：iframe 宿主（id = kit.domId('panel-host')）承载
 * panel.html；runtime 消息 toggle/show，iframe postMessage 关（close-panel 语义）。
 *
 * 注入纪律预演（F27）：宿主 inline style 自包含、不改页面 DOM（面板 iframe 是
 * 追加宿主非改写）、z-index 顶格。framework 的 createPanelHost（feat-007 /panel）
 * 落地后，本文件换框架装配并收敛。
 *
 * 控制台打印 ns 化键/消息/DOM id——Chrome 手动加载三断言之一的观察点。
 */

import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { kit } from '../../lib/kit';

type PanelMessage = { kind?: string };

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const hostId = kit.domId('panel-host');
    let iframe: HTMLIFrameElement | null = null;

    const open = () => {
      if (iframe) return;
      iframe = document.createElement('iframe');
      iframe.id = hostId;
      iframe.style.cssText =
        'position:fixed;top:0;right:0;width:420px;height:100vh;border:none;z-index:2147483647;';
      iframe.src = browser.runtime.getURL('/panel.html');
      document.documentElement.appendChild(iframe);
    };
    const close = () => {
      iframe?.remove();
      iframe = null;
    };
    const toggle = () => (iframe ? close() : open());

    browser.runtime.onMessage.addListener((message: PanelMessage) => {
      if (message?.kind === kit.kind('toggle-panel')) toggle();
      if (message?.kind === kit.kind('show-panel')) open();
    });
    window.addEventListener('message', (event: MessageEvent<PanelMessage>) => {
      if (event.data?.kind === kit.kind('close-panel')) close();
    });

    console.info('[extension-kit-example] ns=exkit 装配冒烟', {
      storageKey: kit.key('me-cache'),
      messageKind: kit.kind('toggle-panel'),
      domId: hostId,
    });
  },
});
