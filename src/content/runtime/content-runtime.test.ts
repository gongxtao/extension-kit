// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTargetInfo, startContentRuntime } from './content-runtime';
import { showPageToast } from './toast';
import type { ContentRuntime, MutationObserverLike } from './content-runtime';
import type { ContentRuntimeDeps } from './content-runtime';
import type { ExtractInput, ExtractResult } from '../capture/types';
import { imageCapture } from '../capture/image';
import { kitMessages } from '../../messaging/kitMessages';
import type { PanelHost } from '../../panel/panel-host';

/**
 * content 运行时测试——copy-out 自 ready-svg entrypoints/content/index.test.ts
 * （扫描/去抖/补扫/R46 点击链/R49 接收/R53 兜底/R90 直开矩阵全保留）。
 * 泛化适配（F17/F24/F26）：消息 kind 走 kitMessages('testkit')；source 值由装配
 * 注入（框架零站点知识——原 hostname→sourceOf 分化测试改为注入分化）；extract
 * 注入缝替代 grabImage；CDN 兜底须源声明 decodeCdn（F5/F26）。
 */

const MESSAGES = kitMessages('testkit');
const TOAST_ATTR = 'data-testkit-toast';
const BADGE_ATTR = 'data-testkit-badge';
const FALLBACK_TEXT = 'Paste or download, then upload';
const TOO_LARGE_TEXT = 'Image too large — download it, then upload';

const BADGE_DEPS = {
  badgeAttr: BADGE_ATTR,
  cssNames: { spin: 'testkit-spin', shake: 'testkit-shake' },
  ariaLabel: 'Convert with Ready SVG',
  fallbackText: FALLBACK_TEXT,
  tooLargeText: TOO_LARGE_TEXT,
  branding: {
    badgeColor: '#f8b018',
    icons: { logo: '<path d="M28 88"/>', lock: '<path d="M52 60"/>', check: '<path d="M36 66"/>' },
  },
  cornerFor: (s: unknown) => (s === 'chatgpt' ? 'top-right' : 'bottom-right'),
  source: 'chatgpt',
} as const;

/** 合格宿主图（R42 矩阵的合格侧；jsdom 不加载资源 → 几何属性全 defineProperty） */
const eligibleImg = (over: { currentSrc?: string } = {}): HTMLImageElement => {
  const img = document.createElement('img');
  img.setAttribute('width', '400');
  img.setAttribute('height', '300');
  Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
  Object.defineProperty(img, 'complete', { value: true, configurable: true });
  Object.defineProperty(img, 'currentSrc', {
    value: over.currentSrc ?? 'https://cdn.example.test/a.png',
    configurable: true,
  });
  img.getBoundingClientRect = () => ({ width: 200, height: 200 }) as DOMRect;
  document.body.appendChild(img);
  return img;
};

/** 真实站形态图（gemini 冒烟 2026-08-24）：无 width/height 属性、纯 CSS 定尺寸——
 *  Number(null)===0 陷阱的回归守卫（attrWidth:0 会被当 ≤32 图标排除 → 全站无徽标） */
const cssSizedImg = (): HTMLImageElement => {
  const img = document.createElement('img');
  Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: 300, configurable: true });
  Object.defineProperty(img, 'complete', { value: true, configurable: true });
  Object.defineProperty(img, 'currentSrc', {
    value: 'https://lh3.googleusercontent.com/a.png',
    configurable: true,
  });
  img.getBoundingClientRect = () => ({ width: 240, height: 180 }) as DOMRect;
  document.body.appendChild(img);
  return img;
};

/** R90：页内面板宿主假件（记录 show/toggle/destroy 调用） */
const fakePanelHost = () => {
  const calls = { show: 0, toggle: 0, destroy: 0 };
  const panelHost: PanelHost = {
    show() {
      calls.show += 1;
    },
    toggle() {
      calls.toggle += 1;
    },
    hide() {},
    isOpen: () => false,
    destroy() {
      calls.destroy += 1;
    },
  };
  return { panelHost, calls };
};

const pngBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
const pngGrab: ExtractResult = { ok: true, blob: pngBlob, mime: 'image/png' };

/** runtime.sendMessage 桩：记录消息、可配置 ack */
const fakeRuntime = (ack: Promise<unknown> = Promise.resolve({ ok: true })) => {
  const sent: unknown[] = [];
  const listeners = new Set<(msg: unknown) => void>();
  const runtime: ContentRuntime = {
    async sendMessage(msg) {
      sent.push(msg);
      return ack;
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    runtime,
    sent,
    fire: (msg: unknown) => {
      for (const l of [...listeners]) l(msg);
    },
    listenerCount: () => listeners.size,
  };
};

/** MutationObserver 桩：fireMutation 手动驱动（真 observer 的微 task 时序不属被测代码）；
 *  命名避开 runtime 的 fire（消息分发）——同名会在 harness 展开时互相顶掉 */
const fakeObserver = () => {
  const obs = { observe: vi.fn(), disconnect: vi.fn() } as unknown as MutationObserverLike & {
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let cb: (() => void) | undefined;
  return {
    makeObserver: (callback: () => void) => {
      cb = callback;
      return obs;
    },
    fireMutation: () => cb?.(),
    obs,
  };
};

const harness = (
  ack: Promise<unknown> = Promise.resolve({ ok: true }),
): {
  start: (over?: Partial<ContentRuntimeDeps>) => ReturnType<typeof startContentRuntime>;
} & ReturnType<typeof fakeRuntime> & ReturnType<typeof fakeObserver> & { ph: ReturnType<typeof fakePanelHost> } => {
  const rt = fakeRuntime(ack);
  const fo = fakeObserver();
  const ph = fakePanelHost();
  const start = (over: Partial<ContentRuntimeDeps> = {}) => {
    const ctrl = startContentRuntime({
      doc: document,
      runtime: rt.runtime,
      panelHost: ph.panelHost,
      makeObserver: fo.makeObserver,
      debounceMs: 100,
      now: () => 1_000,
      messages: MESSAGES,
      toastAttr: TOAST_ATTR,
      captureSource: imageCapture({ makeCanvas: () => ({}) as never }), // 源声明 decodeCdn——CDN 兜底可走
      extract: vi.fn(async () => pngGrab),
      loadImage: vi.fn(async () => document.createElement('img')),
      encode: async () => 'AQID',
      badgeDeps: { ...BADGE_DEPS },
      ...over,
    });
    started.push(ctrl); // document 级 load 监听随实例——必须跨测试 stop（jsdom document 全文件共享）
    return ctrl;
  };
  return { ...rt, ...fo, ph, start };
};

/** 本文件所有 harness 实例（afterEach 统一 stop：清 document 上的 load 捕获监听） */
const started: ReturnType<typeof startContentRuntime>[] = [];

describe('content 运行时（扫描 + R46 点击链组装 + R49 接收）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    for (const s of started.splice(0)) s.stop();
    vi.useRealTimers();
  });

  it('readTargetInfo：DOM 读取面齐备（complete/naturalWidth/currentSrc/属性宽高/rect）', () => {
    const img = eligibleImg();
    expect(readTargetInfo(img)).toEqual({
      complete: true,
      naturalWidth: 400,
      currentSrc: 'https://cdn.example.test/a.png',
      ariaHidden: false,
      attrWidth: 400,
      attrHeight: 300,
      rect: { width: 200, height: 200 },
    });
  });

  it('start 初始全量扫描：合格 img 挂徽标宿主；不合格（naturalWidth 100）不挂', () => {
    const h = harness();
    eligibleImg();
    const avatar = eligibleImg();
    Object.defineProperty(avatar, 'naturalWidth', { value: 100 });
    h.start();

    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1);
    expect(document.querySelector(`div[${BADGE_ATTR}]`)?.contains(avatar)).toBe(false);
  });

  it('真实站形态（无 width/height 属性，CSS 定尺寸）：属性缺席不判图标——挂徽标（gemini 冒烟回归，Number(null)===0 陷阱）', () => {
    const img = cssSizedImg();
    const info = readTargetInfo(img);
    expect(info.attrWidth).toBeUndefined(); // 缺席 → undefined（非 0）
    expect(info.attrHeight).toBeUndefined();

    const h = harness();
    h.start();
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1); // 修复前：0（被当 ≤32 图标排除）
  });

  it('加载完成补扫：插入时未加载完（complete=false 不挂）→ load 事件落定（无 DOM 变更，MutationObserver 盲区）→ 文档级捕获监听补扫挂徽标；stop 摘除', () => {
    const h = harness();
    const img = eligibleImg();
    Object.defineProperty(img, 'complete', { value: false, configurable: true });
    const ctrl = h.start();
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0); // 初始不合格

    Object.defineProperty(img, 'complete', { value: true, configurable: true });
    img.dispatchEvent(new Event('load')); // 加载完成不产生 mutation
    vi.advanceTimersByTime(100); // 去抖
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1);

    ctrl.stop();
    expect(h.ph.calls.destroy).toBe(1); // R90：宿主随停清理
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0); // dispose 清既有宿主
    const late = eligibleImg();
    late.dispatchEvent(new Event('load')); // stop 后 load 捕获已摘——不复活
    vi.advanceTimersByTime(100);
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('rescan 幂等：重复扫描不重挂；img 移除（isConnected=false）→ 徽标宿主随清', () => {
    const h = harness();
    const ctrl = h.start();
    const img = eligibleImg();
    ctrl.rescan();
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1);

    ctrl.rescan(); // 幂等
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1);

    img.remove();
    ctrl.rescan();
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('Mutation 去抖重扫：记录到 → 去抖窗内不挂、到点补挂；observe 收 subtree+childList', async () => {
    const h = harness();
    h.start();
    expect(h.obs.observe).toHaveBeenCalledWith(document.documentElement, {
      subtree: true,
      childList: true,
    });

    eligibleImg();
    h.fireMutation(); // mutation 记录
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0); // 去抖窗内

    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1);
  });

  it('R49 接收 ${ns}-grab → grabByUrl 链（fetch 路成）→ sendMessage R46 消息形（装配 source 透传 metadata，F24）', async () => {
    const h = harness();
    h.start();
    h.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://cdn.example.test/x.png' });
    await vi.advanceTimersByTimeAsync(0);

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toEqual({
      kind: MESSAGES.imageHandoff.kind,
      base64: 'AQID',
      mime: 'image/png',
      metadata: 'chatgpt',
      requestedAt: 1_000,
    });
    expect(document.querySelector(`div[${TOAST_ATTR}]`)).toBeNull(); // 成功无 toast
  });

  it('非 grab 消息（kind 不符）不动；F17 source 归装配：注入 gemini → metadata gemini；不注入 → 无 metadata 字段', async () => {
    const gemini = harness();
    gemini.start({ badgeDeps: { ...BADGE_DEPS, source: 'gemini' } });
    gemini.fire({ kind: 'other' });
    gemini.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://lh3.googleusercontent.com/x.png' });
    await vi.advanceTimersByTimeAsync(0);
    expect(gemini.sent).toHaveLength(1);
    expect(gemini.sent[0]).toMatchObject({ metadata: 'gemini' });

    document.body.innerHTML = '';
    const local = harness();
    local.start({ badgeDeps: { ...BADGE_DEPS, source: undefined } });
    local.fire({ kind: MESSAGES.grab.kind, srcUrl: 'http://localhost/x.png' });
    await vi.advanceTimersByTimeAsync(0);
    expect(local.sent[0]).not.toHaveProperty('metadata');
  });

  it('R49 抓取失败（taint）→ R53 CDN 兜底：发 ${ns}-cdn-grab（srcUrl/requestedAt/metadata）→ ack ok → 直送成立，无 toast、无 handoff 消息', async () => {
    const h = harness();
    h.start({ extract: vi.fn(async () => ({ ok: false, reason: 'taint' }) as ExtractResult) });
    h.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://cdn.example.test/x.png' });
    await vi.advanceTimersByTimeAsync(0);

    expect(h.sent).toEqual([
      {
        kind: MESSAGES.cdnGrab.kind,
        srcUrl: 'https://cdn.example.test/x.png',
        requestedAt: 1_000,
        metadata: 'chatgpt',
      },
    ]);
    expect(document.querySelector(`div[${TOAST_ATTR}]`)).toBeNull();
  });

  it('R49 终败且 CDN 兜底也败（ack reason network）→ 页面角 toast 回退文案，5s 自消', async () => {
    const h = harness(Promise.resolve({ ok: false, reason: 'network' }));
    h.start({ extract: vi.fn(async () => ({ ok: false, reason: 'taint' }) as ExtractResult) });
    h.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://cdn.example.test/x.png' });
    await vi.advanceTimersByTimeAsync(0);

    expect(h.sent).toHaveLength(1); // cdn 兜底消息发出（仅一条）
    const toast = document.querySelector(`div[${TOAST_ATTR}]`) as HTMLDivElement;
    expect(toast).not.toBeNull();
    expect(toast.shadowRoot!.querySelector('[data-bubble]')!.textContent).toBe(FALLBACK_TEXT);

    await vi.advanceTimersByTimeAsync(5000);
    expect(document.querySelector(`div[${TOAST_ATTR}]`)).toBeNull();
  });

  it('R46 ack 拒 too_large → toast 专属文案', async () => {
    const h = harness(Promise.resolve({ ok: false, reason: 'too_large' }));
    h.start();
    h.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://cdn.example.test/x.png' });
    await vi.advanceTimersByTimeAsync(0);

    const toast = document.querySelector(`div[${TOAST_ATTR}]`) as HTMLDivElement;
    expect(toast.shadowRoot!.querySelector('[data-bubble]')!.textContent).toBe(TOO_LARGE_TEXT);
  });

  it('F5 声明式 opt-in：源未声明 decodeCdn → 终败不兜底，直接 toast 回退', async () => {
    const h = harness(Promise.resolve({ ok: true }));
    h.start({
      captureSource: imageCapture(), // 无 makeCanvas → 未声明 decodeCdn
      extract: vi.fn(async () => ({ ok: false, reason: 'taint' }) as ExtractResult),
    });
    h.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://cdn.example.test/x.png' });
    await vi.advanceTimersByTimeAsync(0);

    expect(h.sent).toEqual([]); // 无 cdn 兜底消息
    expect(document.querySelector(`div[${TOAST_ATTR}]`)).not.toBeNull(); // 终败 toast
  });

  it('默认 grabByUrl 链：fetch network 败 → loadImage 兜底带 node 二次抓；loadImage 也败 → network', async () => {
    const h = harness();
    const loaded = document.createElement('img');
    let call = 0;
    const extract = vi.fn(async (input: ExtractInput): Promise<ExtractResult> => {
      call += 1;
      if (call === 1) return { ok: false, reason: 'network' };
      expect(input.node).toBe(loaded);
      return pngGrab;
    });
    const loadImage = vi.fn(async () => loaded);
    h.start({ extract, loadImage });
    h.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://cdn.example.test/x.png' });
    await vi.advanceTimersByTimeAsync(0);

    expect(extract).toHaveBeenCalledTimes(2);
    expect(loadImage).toHaveBeenCalledWith('https://cdn.example.test/x.png');
    expect(h.sent).toHaveLength(1);

    // loadImage 也败（network 终局）→ R53 CDN 兜底接管：仅发一条 cdn 消息（默认 ack ok）→ 无 toast
    document.body.innerHTML = '';
    const h2 = harness();
    const once = vi.fn(async () => ({ ok: false, reason: 'network' }) as ExtractResult);
    h2.start({ extract: once, loadImage: vi.fn(async () => undefined) });
    h2.fire({ kind: MESSAGES.grab.kind, srcUrl: 'https://cdn.example.test/x.png' });
    await vi.advanceTimersByTimeAsync(0);
    expect(h2.sent).toEqual([
      { kind: MESSAGES.cdnGrab.kind, srcUrl: 'https://cdn.example.test/x.png', requestedAt: 1_000, metadata: 'chatgpt' },
    ]);
    expect(document.querySelector(`div[${TOAST_ATTR}]`)).toBeNull();
  });

  it('徽标点击链（默认 grab 包装）：复核合格 → extract({src: currentSrc, node: img}) → R46 消息；复核不合格（rect 缩 0）→ 不再抓、徽标 fail', async () => {
    const h = harness();
    const extract = vi.fn(async () => pngGrab);
    const ctrl = h.start({ extract });
    const img = eligibleImg();
    ctrl.rescan(); // 挂徽标
    const button = document.querySelector(`div[${BADGE_ATTR}]`)!.shadowRoot!
      .querySelector('button') as HTMLButtonElement;

    button.click();
    expect(button.dataset.state).toBe('grabbing');
    await vi.advanceTimersByTimeAsync(0);
    expect(button.dataset.state).toBe('ok');
    expect(extract).toHaveBeenCalledWith({
      src: 'https://cdn.example.test/a.png',
      node: img,
    });
    expect(h.sent).toEqual([
      {
        kind: MESSAGES.imageHandoff.kind,
        base64: 'AQID',
        mime: 'image/png',
        metadata: 'chatgpt',
        requestedAt: 1_000,
      },
    ]);
    expect(h.ph.calls.show).toBe(1); // R90：徽标点击直开面板（无预飞消息）

    await vi.advanceTimersByTimeAsync(900); // ok → idle
    expect(button.dataset.state).toBe('idle');

    img.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect; // 页面布局收缩
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.dataset.state).toBe('fail'); // 复核不合格 → fail 气泡回退
    expect(extract).toHaveBeenCalledTimes(1); // 未发起二次抓取
  });

  it('R90 直开时序（取代 R61 预飞）：点击同步帧即 panelHost.show()（无消息无手势概念），抓取完成后才 handoff', async () => {
    const h = harness();
    const ctrl = h.start();
    eligibleImg();
    ctrl.rescan();
    const button = document.querySelector(`div[${BADGE_ATTR}]`)!.shadowRoot!
      .querySelector('button') as HTMLButtonElement;

    button.click();
    expect(h.ph.calls.show).toBe(1); // 同步帧已直开（无需 SW 往返）
    expect(h.sent).toEqual([]); // 抓取未完——handoff 未发
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sent).toHaveLength(1); // 抓取完成后 handoff 才到
    expect(h.sent[0]).toMatchObject({ kind: MESSAGES.imageHandoff.kind });
  });

  it('R90 background 两径消息：${ns}-toggle-panel → panelHost.toggle()；${ns}-show-panel → panelHost.show()', () => {
    const h = harness();
    h.start();
    h.fire({ kind: MESSAGES.togglePanel.kind });
    expect(h.ph.calls.toggle).toBe(1);
    h.fire({ kind: MESSAGES.showPanel.kind });
    expect(h.ph.calls.show).toBe(1);
    h.fire({ kind: 'rsvg-unknown' }); // 杂讯不误触
    expect(h.ph.calls.toggle).toBe(1);
    expect(h.ph.calls.show).toBe(1);
  });

  it('R53 徽标点击链 CDN 兜底：extract taint → cdn 消息（srcUrl=currentSrc）→ ack ok → 徽标 ok 态且无 handoff 消息', async () => {
    const h = harness();
    const extract = vi.fn(async () => ({ ok: false, reason: 'taint' }) as ExtractResult);
    const ctrl = h.start({ extract });
    eligibleImg(); // 挂图即用途（rescan 扫 DOM，无需引用）
    ctrl.rescan();
    const button = document.querySelector(`div[${BADGE_ATTR}]`)!.shadowRoot!
      .querySelector('button') as HTMLButtonElement;

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.dataset.state).toBe('ok');
    expect(h.sent).toEqual([
      { kind: MESSAGES.cdnGrab.kind, srcUrl: 'https://cdn.example.test/a.png', requestedAt: 1_000, metadata: 'chatgpt' },
    ]);
    expect(h.ph.calls.show).toBe(1); // R90：兜底链同样先直开面板
  });

  it('R53 确定性败不走兜底：too_large（重取同字节必同超）→ 无 cdn 消息 + fail + TOO_LARGE 气泡；ineligible（复核不过）同不触发', async () => {
    const h = harness();
    const ctrl = h.start({ extract: vi.fn(async () => ({ ok: false, reason: 'too_large' }) as ExtractResult) });
    const img = eligibleImg();
    ctrl.rescan();
    const button = document.querySelector(`div[${BADGE_ATTR}]`)!.shadowRoot!
      .querySelector('button') as HTMLButtonElement;

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.dataset.state).toBe('fail');
    expect(h.sent).toEqual([]); // 无 cdn 兜底消息
    expect(h.ph.calls.show).toBe(1); // R90：面板已开（too_large 抓前不可知）
    const bubble = document.querySelector(`div[${BADGE_ATTR}]`)!.shadowRoot!
      .querySelector('[data-bubble]') as HTMLElement;
    expect(bubble.textContent).toBe(TOO_LARGE_TEXT);

    img.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect; // 复核不过
    await vi.advanceTimersByTimeAsync(5000); // fail 气泡 5s 自消回 idle
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.dataset.state).toBe('fail'); // ineligible 败
    expect(h.sent).toEqual([]); // 复核不过：无消息（不开面板、不发 cdn 兜底）
    expect(h.ph.calls.show).toBe(1); // 宿主维持一次——复核不过不直开
  });

  it('stop()：observer 断开 + onMessage 退订 + 徽标全清', () => {
    const h = harness();
    const ctrl = h.start();
    eligibleImg();
    ctrl.rescan();
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1);
    expect(h.listenerCount()).toBe(1);

    ctrl.stop();
    expect(h.obs.disconnect).toHaveBeenCalled();
    expect(h.listenerCount()).toBe(0);
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0);
  });

  it('showPageToast：宿主挂 body（data-${ns}-toast 标记）、文案可见、5s 自消', async () => {
    showPageToast(document, FALLBACK_TEXT, TOAST_ATTR);
    const toast = document.querySelector(`div[${TOAST_ATTR}]`) as HTMLDivElement;
    expect(toast).not.toBeNull();
    expect(toast.shadowRoot!.querySelector('[data-bubble]')!.textContent).toBe(FALLBACK_TEXT);

    await vi.advanceTimersByTimeAsync(5000);
    expect(document.querySelector(`div[${TOAST_ATTR}]`)).toBeNull();
  });
});
