// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createFakeStorageArea, createFakeCookies, createFakeMenus, createFakeContentRuntime } from './fakes';
import type { CookieAccess } from '../session/session-store';

/**
 * /testing 假件工厂测试——假件本身也是发布物（design.md §7 P3 最小集），
 * 语义与框架模块测试所用形态一致。
 */

describe('createFakeStorageArea（local/session 语义 + onChanged + emit 观察缝）', () => {
  it('get/set/remove 回环；缺席键不可见', async () => {
    const area = createFakeStorageArea();
    expect(await area.get(['k'])).toEqual({});
    await area.set({ k: 1 });
    expect(await area.get(['k'])).toEqual({ k: 1 });
    await area.remove(['k']);
    expect(await area.get(['k'])).toEqual({});
  });

  it('set 触发 onChanged（changes 形 {oldValue,newValue}，areaName local）；remove 也触发', async () => {
    const area = createFakeStorageArea();
    const listener = vi.fn();
    area.onChanged.addListener(listener);
    await area.set({ k: 1 });
    expect(listener).toHaveBeenCalledWith({ k: { oldValue: undefined, newValue: 1 } }, 'local');
    listener.mockClear();
    await area.set({ k: 2 });
    expect(listener).toHaveBeenCalledWith({ k: { oldValue: 1, newValue: 2 } }, 'local');
    await area.remove(['k']);
    expect(listener).toHaveBeenCalledTimes(2); // remove 也触发（含 oldValue→undefined）
    area.onChanged.removeListener(listener);
    await area.set({ k: 3 });
    expect(listener).toHaveBeenCalledTimes(2); // 退订后不再收
  });

  it('dump 观察缝 + 预置数据', async () => {
    const area = createFakeStorageArea({ seed: true });
    expect(await area.get(['seed'])).toEqual({ seed: true });
    expect(area.dump()).toEqual({ seed: true });
  });

  it('get 可编程抛错（防御路径测试用）', async () => {
    const area = createFakeStorageArea({}, { getError: new Error('quota') });
    await expect(area.get(['k'])).rejects.toThrow('quota');
  });
});

describe('createFakeCookies（domain 过滤 + 逐 cookie 提交时序 + onChanged）', () => {
  const setCookie = (cookies: CookieAccess, name: string, value: string): Promise<unknown> =>
    cookies.set({
      url: 'https://myproduct.app', name, value, path: '/', secure: true,
      httpOnly: false, sameSite: 'lax', expirationDate: 0,
    });

  it('set/getAll 回环：域过滤（他域不可见）；remove 生效', async () => {
    const { cookies } = createFakeCookies();
    await setCookie(cookies, 'sb-x-auth-token', 'v1');
    expect(await cookies.getAll({ domain: 'myproduct.app' })).toEqual([
      { name: 'sb-x-auth-token', value: 'v1' },
    ]);
    expect(await cookies.getAll({ domain: 'other.example' })).toEqual([]);
    await cookies.remove({ url: 'https://myproduct.app', name: 'sb-x-auth-token' });
    expect(await cookies.getAll({ domain: 'myproduct.app' })).toEqual([]);
  });

  it('set/remove 触发 onChanged（cookie name/domain 事件形）；可编程提交延迟（撕裂时序测试）', async () => {
    const delays: Record<string, number> = { slow: 25 };
    const { cookies } = createFakeCookies((name: string) => delays[name] ?? 0);
    const listener = vi.fn();
    cookies.onChanged.addListener(listener);
    await setCookie(cookies, 'fast', 'a');
    expect(listener).toHaveBeenCalledTimes(1);
    const p = setCookie(cookies, 'slow', 'b');
    expect(listener).toHaveBeenCalledTimes(1); // 延迟窗口内未提交
    await p;
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toEqual({ cookie: { name: 'slow', domain: 'myproduct.app' } });
  });
});

describe('createFakeMenus（create/removeAll/onClicked 记录 + click 分发）', () => {
  it('removeAll/create 记录；click 分发给监听者；create 回调消费 lastError（不炸）', () => {
    const menus = createFakeMenus();
    let lastError: string | undefined;
    menus.create({ id: 'testkit-convert', title: 'T', contexts: ['image'] }, (e?: string) => {
      lastError = e;
    });
    expect(menus.calls.create).toEqual([
      { id: 'testkit-convert', title: 'T', contexts: ['image'] },
    ]);
    menus.removeAll(() => {});
    expect(menus.calls.removeAll).toBe(1);

    const seen: Array<{ menuItemId: string | number; srcUrl?: string }> = [];
    menus.onClicked.addListener((info) => seen.push(info));
    menus.click({ menuItemId: 'testkit-convert', srcUrl: 'https://x/a.png' }, { id: 7 });
    expect(seen).toEqual([{ menuItemId: 'testkit-convert', srcUrl: 'https://x/a.png' }]);

    // 回调收到错误文本（lastError 通道）——消费即静默，不炸
    expect(() => menus.calls.createErrors[0]?.('duplicate id')).not.toThrow();
    expect(lastError).toBe('duplicate id');
  });
});

describe('createFakeContentRuntime（消息假件：send 记录 + fire 分发 + 退订）', () => {
  it('sendMessage 记录并回可编程 ack；fire 分发给监听者；退订生效', async () => {
    const rt = createFakeContentRuntime({ ok: true });
    await expect(rt.sendMessage({ kind: 'x' })).resolves.toEqual({ ok: true });
    expect(rt.sent).toEqual([{ kind: 'x' }]);

    const seen: unknown[] = [];
    const off = rt.onMessage((m) => seen.push(m));
    rt.fire({ kind: 'y' });
    expect(seen).toEqual([{ kind: 'y' }]);
    off();
    rt.fire({ kind: 'z' });
    expect(seen).toHaveLength(1);
  });
});
