/**
 * panel 页逻辑（demo 消费面）：
 * - 读 storage.session 的 handoff（框架 /content 通道）→ view-model 渲染
 * - storage.onChanged 即时重渲染（热路径——抓取落定面板已在开）
 * - Copy 按钮 → /io clipboard copyText（R116/R121 回退链）
 * - Mode 按钮 → /panel panel-prefs set（squeeze↔overlay，content 宿主即时生效）
 * - 首开标记 → /io flag-store（kit.key('onboarding-seen')）
 */

import { browser } from 'wxt/browser';
import {
  copyText,
  createFlagStore,
  createPanelPrefs,
  kitMessages,
} from '@gongxtao/extension-kit';
import type { HandoffRecord } from '@gongxtao/extension-kit/content';
import { handoffToView } from '../../lib/view-model';
import { kit } from '../../lib/kit';

const messages = kitMessages('demokit');

const prefs = createPanelPrefs(browser.storage.local, (listener) => {
  browser.storage.onChanged.addListener(listener as never);
  return () => browser.storage.onChanged.removeListener(listener as never);
}, { mode: kit.key('panel-mode'), width: kit.key('panel-width') });

const firstRun = createFlagStore(browser.storage.local, kit.key('onboarding-seen'));

const main = document.getElementById('main') as HTMLElement;
const pill = document.getElementById('pill') as HTMLElement;
const copyBtn = document.getElementById('copy') as HTMLButtonElement;
const modeBtn = document.getElementById('mode') as HTMLButtonElement;
const closeBtn = document.getElementById('close') as HTMLButtonElement;

let currentDataUrl: string | null = null;

function render(view: ReturnType<typeof handoffToView>): void {
  main.innerHTML = '';
  currentDataUrl = null;
  pill.hidden = true;
  copyBtn.hidden = true;

  if (view.state === 'empty' || view.state === 'stale') {
    const p = document.createElement('p');
    p.className = view.state === 'stale' ? 'stale' : 'hint';
    p.textContent = view.hint ?? '';
    main.appendChild(p);
    return;
  }

  const img = document.createElement('img');
  img.className = 'preview';
  img.src = view.dataUrl!;
  img.alt = 'Grabbed content';
  main.appendChild(img);

  if (view.pillText !== undefined) {
    pill.textContent = view.pillText;
    pill.hidden = false;
  }
  currentDataUrl = view.dataUrl ?? null;
  copyBtn.hidden = false;
}

async function refresh(): Promise<void> {
  const bag = await browser.storage.session.get(kit.key('image-handoff'));
  render(handoffToView((bag[kit.key('image-handoff')] as HandoffRecord | undefined) ?? null, {
    now: Date.now(),
  }));
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'session' && kit.key('image-handoff') in changes) void refresh();
});

// 首开标记（flag-store）：首次渲染后置 seen——再开不提示（R63 语义）
void firstRun.get().then(async (seen) => {
  await refresh();
  if (!seen) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '👋 首次打开——抓一张大图试试（徽标或右键菜单）。';
    main.prepend(p);
    await firstRun.mark();
  }
});

// Mode 切换：squeeze ↔ overlay（panel-prefs 持久化，content 宿主 onChanged 即时生效）
void prefs.get().then((m) => {
  modeBtn.textContent = `Mode: ${m}`;
});
modeBtn.addEventListener('click', () => {
  void prefs.get().then((m) => {
    const next = m === 'squeeze' ? 'overlay' : 'squeeze';
    void prefs.set(next);
    modeBtn.textContent = `Mode: ${next}`;
  });
});

copyBtn.addEventListener('click', () => {
  if (currentDataUrl === null) return;
  void copyText(currentDataUrl, kit.dataAttr('copy'));
});

closeBtn.addEventListener('click', () => {
  window.parent.postMessage({ kind: messages.closePanel.kind }, '*');
});
