// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { setupPageIntegration } from './background';
import type { PageIntegrationCtx, PageIntegrationOptions } from './background';
import type { HandoffRecord } from './handoff';
import type { ExtractResult } from '../capture/types';
import { imageCapture } from '../capture/image';
import { kitMessages } from '../../messaging/kitMessages';

/**
 * background 装配面测试——
 * （F13 整体参数化——菜单 id/title/contexts 注入；
 * R46/R49/R53/R97 + R90 打开链收敛矩阵全保留）。泛化适配（F17/F24/F26）：
 * kind 走 kitMessages('testkit')；source → metadata 透传；CDN 兜底由源声明
 * decodeCdn（makeCanvas 注入）才接线，抓取经 captureSource.extract。
 */

const MESSAGES = kitMessages('testkit');
const MENU_ID = 'testkit-convert';
const MENU = { title: 'Convert with Extension Kit', contexts: ['image'] };

const cdnPng = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

/** 抓取源桩：decodeCdn 已声明（CDN 兜底接线前提，F26）；extract 记录调用、可编程 */
const makeCaptureSource = (cdnImpl?: (srcUrl: string) => Promise<ExtractResult>) => {
  const extract = vi.fn(async (input: { src: string }): Promise<ExtractResult> =>
    cdnImpl?.(input.src) ?? { ok: true, blob: cdnPng, mime: 'image/png' },
  );
  const captureSource = imageCapture({ makeCanvas: () => ({}) as never });
  return { captureSource: { ...captureSource, extract }, extract };
};

/** 内存版 HandoffStore（set 可注入失败；lastSet 观察缝） */
const fakeStore = (ok = true): { store: PageIntegrationCtx['handoffStore']; lastSet(): HandoffRecord | undefined } => {
  let last: HandoffRecord | undefined;
  return {
    store: {
      async get() {
        return null;
      },
      async set(h) {
        last = h;
        return ok;
      },
      async clear() {},
    },
    lastSet: () => last,
  };
};

/** 全 DI 桩 ctx：事件源按 ctx 隔离（不跨测试累积），调用全记录。
 *  feat-011 R90：sidePanel/badge 面退役——action 只剩 onClicked（toggle 消息源） */
const fakeCtx = (
  over: {
    storeOk?: boolean;
    cdnImpl?: (srcUrl: string) => Promise<ExtractResult>;
  } = {},
) => {
  const menuClick = new Set<(info: { menuItemId: string | number; srcUrl?: string }, tab?: { id?: number }) => void>();
  const runtimeMsg = new Set<(msg: unknown, sender: { tab?: { id?: number } }) => unknown>();
  const actionClick = new Set<(tab: { id?: number }) => void>();
  const calls = {
    create: [] as unknown[],
    createErrors: [] as Array<((error?: string) => void) | undefined>,
    removeAll: 0,
    tabSend: [] as Array<{ tabId: number; msg: unknown }>,
    cdn: [] as string[],
    encode: [] as Blob[],
  };
  const { store, lastSet } = fakeStore(over.storeOk ?? true);
  const { captureSource, extract } = makeCaptureSource(over.cdnImpl);
  const ctx: PageIntegrationCtx = {
    menus: {
      // R97 Chrome 真语义：重复 id 不抛同步异常——错误文本走回调通道（lastError）
      removeAll(cb) {
        calls.removeAll += 1;
        cb();
      },
      create(props, onError) {
        calls.create.push(props);
        calls.createErrors.push(onError);
      },
      onClicked: { addListener: (cb) => menuClick.add(cb) },
    },
    runtime: { onMessage: { addListener: (cb) => runtimeMsg.add(cb) } },
    action: { onClicked: { addListener: (cb) => actionClick.add(cb) } },
    tabs: {
      async sendMessage(tabId, msg) {
        calls.tabSend.push({ tabId, msg });
        return undefined;
      },
    },
    handoffStore: store,
  };
  const opts: PageIntegrationOptions = {
    messages: MESSAGES,
    captureSource,
    makeCanvas: () => ({}) as never,
    menuId: MENU_ID,
    menu: MENU,
    encode: async (blob) => {
      calls.encode.push(blob);
      return 'AQID';
    },
  };
  const setup = (): void => setupPageIntegration(ctx, opts);
  return {
    ctx,
    opts,
    calls,
    lastSet,
    extract,
    setup,
    click: (info: { menuItemId: string | number; srcUrl?: string }, tab?: { id?: number }) => {
      for (const l of [...menuClick]) l(info, tab);
    },
    toolbar: (tab: { id?: number } = { id: 7 }) => {
      for (const l of [...actionClick]) l(tab);
    },
    send: (msg: unknown, sender: { tab?: { id?: number } } = { tab: { id: 7 } }): unknown => {
      let ret: unknown;
      for (const l of [...runtimeMsg]) ret = l(msg, sender);
      return ret;
    },
  };
};

const handoffMsg = {
  kind: MESSAGES.imageHandoff.kind,
  base64: 'AQID',
  mime: 'image/png' as const,
  metadata: 'chatgpt',
  requestedAt: 1_000,
};

const cdnMsg = {
  kind: MESSAGES.cdnGrab.kind,
  srcUrl: 'https://lh3.googleusercontent.com/a.png',
  requestedAt: 2_000,
  metadata: 'gemini',
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('background 页面集成（R46/R49/R97 + R90 打开链收敛；F13 菜单参数化）', () => {
  it('菜单注册（R49/R97）：removeAll 先清再建（SW 每次唤醒幂等）；id/title/contexts 为注入值（F13——产品值不持框架）；create 错误走回调通道静默', () => {
    const f = fakeCtx();
    f.setup();
    expect(f.calls.removeAll).toBe(1); // 先清场
    expect(f.calls.create).toEqual([
      {
        id: MENU_ID,
        title: MENU.title,
        contexts: MENU.contexts,
      },
    ]);
    // create 回调显式在册（无回调时 Chrome 打 Unchecked runtime.lastError——源轮病根）
    expect(f.calls.createErrors[0]).toBeInstanceOf(Function);

    f.setup(); // SW 重启再跑：removeAll 清场后重建，永不撞 duplicate
    expect(f.calls.removeAll).toBe(2);
    expect(f.calls.create).toHaveLength(2);

    // 回调收到错误文本（lastError 通道）——消费即静默，不炸不重试
    expect(() => (f.calls.createErrors[0] as (e?: string) => void)('Cannot create item with duplicate id')).not.toThrow();
  });

  it('R90 toolbar 径：action.onClicked(tab) → tabs.sendMessage {kind:${ns}-toggle-panel}；无 tab.id 忽略', () => {
    const f = fakeCtx();
    f.setup();

    f.toolbar({ id: 9 });
    expect(f.calls.tabSend).toEqual([{ tabId: 9, msg: { kind: MESSAGES.togglePanel.kind } }]);

    f.toolbar({ id: undefined });
    expect(f.calls.tabSend).toHaveLength(1);
  });

  it('R90 菜单径：onClicked → 先 show-panel（菜单意图开着收图非关）再转发 ${ns}-grab；他菜单/无 srcUrl/无 tab 忽略', () => {
    const f = fakeCtx();
    f.setup();

    f.click({ menuItemId: MENU_ID, srcUrl: 'https://cdn/x.png' }, { id: 7 });
    expect(f.calls.tabSend).toEqual([
      { tabId: 7, msg: { kind: MESSAGES.showPanel.kind } },
      { tabId: 7, msg: { kind: MESSAGES.grab.kind, srcUrl: 'https://cdn/x.png' } },
    ]);

    f.click({ menuItemId: 'other' }, { id: 7 });
    f.click({ menuItemId: MENU_ID }, { id: 7 });
    f.click({ menuItemId: MENU_ID, srcUrl: 'https://cdn/x.png' }, {});
    expect(f.calls.tabSend).toHaveLength(2);
  });

  it('R46 收口（R90 后）：合法 handoff → store.set 透传（metadata/requestedAt）→ ack {ok:true}——不再开面板（开面板归徽标/菜单径 content 侧自理）', async () => {
    const f = fakeCtx();
    f.setup();

    const ack = await f.send(handoffMsg);
    await flush();
    expect(f.lastSet()).toEqual({
      kind: 'image',
      base64: 'AQID',
      mime: 'image/png',
      metadata: 'chatgpt',
      requestedAt: 1_000,
    });
    expect(f.calls.tabSend).toHaveLength(0); // 无 open/无角标——SW 只管入库
    expect(ack).toEqual({ ok: true });
  });

  it('store.set 失败（QUOTA）→ 回 ack {ok:false,reason:"too_large"} + tabs.sendMessage 同步告知', async () => {
    const f = fakeCtx({ storeOk: false });
    f.setup();

    const ack = await f.send(handoffMsg);
    await flush();
    expect(ack).toEqual({ ok: false, reason: 'too_large' });
    expect(f.calls.tabSend).toEqual([{ tabId: 7, msg: { ok: false, reason: 'too_large' } }]);
  });

  it('畸形消息（kind 不符/base64 非串/mime 越枚举/requestedAt 非数）→ 不 set、不 sendMessage、不回 ack', async () => {
    const bad = [
      { kind: 'other' },
      { ...handoffMsg, base64: 42 },
      { ...handoffMsg, mime: 'image/webp' },
      { ...handoffMsg, requestedAt: Number.NaN },
    ];
    for (const msg of bad) {
      const f = fakeCtx();
      f.setup();
      const ack = f.send(msg);
      await flush();
      expect(f.lastSet()).toBeUndefined();
      expect(f.calls.tabSend).toHaveLength(0);
      expect(ack).toBeUndefined();
    }
  });

  it('metadata 透传零值域约束（F17/F24）：任意 metadata 值合法入库（值域校验归产品消费侧）', async () => {
    const f = fakeCtx();
    f.setup();
    await f.send({ ...handoffMsg, metadata: 'localhost' });
    await flush();
    expect(f.lastSet()).toMatchObject({ metadata: 'localhost' });
  });

  it('无 sender.tab：store 仍收 + ack ok；QUOTA 失败时 too_large 无处送 → 只走 ack', async () => {
    const ok = fakeCtx();
    ok.setup();
    await ok.send(handoffMsg, {});
    await flush();
    expect(ok.lastSet()).not.toBeUndefined();

    const quota = fakeCtx({ storeOk: false });
    quota.setup();
    const ack = await quota.send(handoffMsg, {});
    await flush();
    expect(ack).toEqual({ ok: false, reason: 'too_large' });
    expect(quota.calls.tabSend).toHaveLength(0);
  });

  it('consumed 消息（面板消费回执）：R90 后无角标链消费——no-op（不 set 不 sendMessage 不回 ack）', async () => {
    const f = fakeCtx();
    f.setup();
    const ack = f.send({ kind: MESSAGES.handoffConsumed.kind });
    await flush();
    expect(f.lastSet()).toBeUndefined();
    expect(f.calls.tabSend).toHaveLength(0);
    expect(ack).toBeUndefined();
  });
});

describe('background CDN 兜底（R53 + R90 后无 open/badge；F26 声明式 opt-in）', () => {
  it('成功链：extract(srcUrl)（SW 转码面）→ encode(blob) → store.set 完整记录（metadata/requestedAt 透传）→ ack {ok:true}', async () => {
    const f = fakeCtx();
    f.setup();
    const ack = await f.send(cdnMsg);
    await flush();
    expect(f.extract).toHaveBeenCalledTimes(1);
    expect(f.calls.encode).toHaveLength(1);
    expect(f.lastSet()).toEqual({
      kind: 'image',
      base64: 'AQID',
      mime: 'image/png',
      metadata: 'gemini',
      requestedAt: 2_000,
    });
    expect(f.calls.tabSend).toHaveLength(0);
    expect(ack).toEqual({ ok: true });
  });

  it('无 metadata 消息 → 记录无 metadata 字段（R41 口径）', async () => {
    const f = fakeCtx();
    f.setup();
    await f.send({ ...cdnMsg, metadata: undefined });
    await flush();
    expect(f.lastSet()).toEqual({
      kind: 'image',
      base64: 'AQID',
      mime: 'image/png',
      requestedAt: 2_000,
    });
  });

  it('extract network 败 → ack {ok:false,reason:"network"}；不 encode、不 set', async () => {
    const f = fakeCtx({ cdnImpl: async () => ({ ok: false, reason: 'network' }) });
    f.setup();
    const ack = await f.send(cdnMsg);
    await flush();
    expect(ack).toEqual({ ok: false, reason: 'network' });
    expect(f.calls.encode).toHaveLength(0);
    expect(f.lastSet()).toBeUndefined();
  });

  it('extract too_large 败 → ack 直通 too_large（不 set）', async () => {
    const f = fakeCtx({ cdnImpl: async () => ({ ok: false, reason: 'too_large' }) });
    f.setup();
    const ack = await f.send(cdnMsg);
    await flush();
    expect(ack).toEqual({ ok: false, reason: 'too_large' });
    expect(f.lastSet()).toBeUndefined();
  });

  it('store QUOTA → ack too_large + tabs.sendMessage 同步告知（R46 收口同款）', async () => {
    const f = fakeCtx({ storeOk: false });
    f.setup();
    const ack = await f.send(cdnMsg);
    await flush();
    expect(ack).toEqual({ ok: false, reason: 'too_large' });
    expect(f.calls.tabSend).toEqual([{ tabId: 7, msg: { ok: false, reason: 'too_large' } }]);
  });

  it('畸形消息（kind 不符/srcUrl 空串/requestedAt NaN）→ undefined ack，无副作用', async () => {
    for (const bad of [
      { kind: 'other' },
      { ...cdnMsg, srcUrl: '' },
      { ...cdnMsg, requestedAt: Number.NaN },
    ]) {
      const f = fakeCtx();
      f.setup();
      const ack = f.send(bad);
      await flush();
      expect(ack).toBeUndefined();
      expect(f.extract).not.toHaveBeenCalled();
      expect(f.lastSet()).toBeUndefined();
    }
  });
});
