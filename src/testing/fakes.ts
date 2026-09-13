/**
 * /testing 假件工厂最小集（design.md §7 P3 最小集——发布物）
 *
 * 各假件语义取自 ready-svg 测试手写假件（session-store / panel-prefs /
 * background 各测试的 fakeArea / fakeCookies / fakeCtx）固化：
 * - createFakeStorageArea：get/set/remove + onChanged（changes 形
 *   {oldValue,newValue}）+ dump 观察缝 + 可编程抛错（防御路径测试）；
 * - createFakeCookies：domain 过滤 getAll + 逐 cookie 提交（可编程延迟——
 *   撕裂时序测试）+ onChanged（cookie {name,domain} 事件形）；
 * - createFakeMenus：create/removeAll/onClicked 记录 + click 分发 + lastError
 *   回调通道（Chrome 语义——重复 id 不抛同步异常）；
 * - createFakeContentRuntime：sendMessage 记录 + 可编程 ack + fire 分发。
 */

import type { StorageArea, StorageChange, StorageOnChanged } from '../io/storage';
import type { CookieAccess } from '../session/session-store';
import type { ContentRuntime, MutationObserverLike } from '../content/runtime/content-runtime';

export function createFakeStorageArea(
  initial: Record<string, unknown> = {},
  impl: { getError?: Error; setError?: Error; removeError?: Error } = {},
): StorageArea & {
  dump(): Record<string, unknown>;
  onChanged: StorageOnChanged & { emit(changes: Record<string, StorageChange>, areaName?: string): void };
} {
  const bag = { ...initial };
  const listeners = new Set<(changes: Record<string, StorageChange>, areaName: string) => void>();
  const emit = (changes: Record<string, StorageChange>, areaName = 'local'): void => {
    for (const l of [...listeners]) l(changes, areaName);
  };
  return {
    async get(keys) {
      if (impl.getError) throw impl.getError;
      const wanted = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(wanted.filter((k) => k in bag).map((k) => [k, bag[k]]));
    },
    async set(items) {
      if (impl.setError) throw impl.setError;
      const changes: Record<string, StorageChange> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: bag[k], newValue: v };
        bag[k] = v;
      }
      emit(changes);
    },
    async remove(keys) {
      if (impl.removeError) throw impl.removeError;
      const changes: Record<string, StorageChange> = {};
      for (const k of keys) {
        changes[k] = { oldValue: bag[k], newValue: undefined };
        delete bag[k];
      }
      emit(changes);
    },
    dump: () => ({ ...bag }),
    onChanged: {
      addListener: (cb) => listeners.add(cb),
      removeListener: (cb) => listeners.delete(cb),
      emit,
    },
  };
}

/** 会话 cookie 事件形（chrome.cookies.onChanged 结构子集） */
export interface FakeCookieEvent {
  cookie: { name: string; domain: string };
}

export function createFakeCookies(commitDelayFor: (cookieName: string) => number = () => 0): {
  cookies: CookieAccess;
  calls: {
    set: Array<Parameters<CookieAccess['set']>[0]>;
    remove: Array<Parameters<CookieAccess['remove']>[0]>;
  };
  onChanged: {
    addListener(cb: (e: FakeCookieEvent) => void): void;
    removeListener(cb: (e: FakeCookieEvent) => void): void;
  };
} {
  const jar = new Map<string, { name: string; value: string; domain: string }>();
  const listeners = new Set<(e: FakeCookieEvent) => void>();
  const calls = {
    set: [] as Array<Parameters<CookieAccess['set']>[0]>,
    remove: [] as Array<Parameters<CookieAccess['remove']>[0]>,
  };
  const emitCookie = (name: string, domain: string): void => {
    for (const l of [...listeners]) l({ cookie: { name, domain } });
  };
  const settle = async (cookieName: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, commitDelayFor(cookieName)));
  };
  const cookies: CookieAccess = {
    async getAll(filter) {
      return [...jar.values()]
        .filter((c) => c.domain === filter.domain || c.domain === `.${filter.domain}`)
        .map((c) => ({ name: c.name, value: c.value }));
    },
    async set(details) {
      calls.set.push(details);
      await settle(details.name);
      const domain = new URL(details.url).hostname;
      jar.set(`${domain}|${details.name}`, { name: details.name, value: details.value, domain });
      emitCookie(details.name, domain);
    },
    async remove(details) {
      calls.remove.push(details);
      await settle(details.name);
      const domain = new URL(details.url).hostname;
      if (jar.delete(`${domain}|${details.name}`)) emitCookie(details.name, domain);
    },
    onChanged: {
      addListener: (cb: (e: FakeCookieEvent) => void) => {
        listeners.add(cb);
      },
      removeListener: (cb: (e: FakeCookieEvent) => void) => {
        listeners.delete(cb);
      },
    },
  };
  return { cookies, calls, onChanged: cookies.onChanged };
}

export function createFakeMenus() {
  const menuClick = new Set<(info: { menuItemId: string | number; srcUrl?: string }, tab?: { id?: number }) => void>();
  return {
    calls: {
      create: [] as Array<{ id: string; title: string; contexts: string[] }>,
      createErrors: [] as Array<((error?: string) => void) | undefined>,
      removeAll: 0,
    },
    create(
      props: { id: string; title: string; contexts: string[] },
      onError: (error?: string) => void,
    ): void {
      this.calls.create.push(props);
      this.calls.createErrors.push(onError);
    },
    removeAll(callback: () => void): void {
      this.calls.removeAll += 1;
      callback();
    },
    onClicked: {
      addListener: (cb: (info: { menuItemId: string | number; srcUrl?: string }, tab?: { id?: number }) => void) =>
        menuClick.add(cb),
    },
    click(info: { menuItemId: string | number; srcUrl?: string }, tab?: { id?: number }): void {
      for (const l of [...menuClick]) l(info, tab);
    },
  };
}

export function createFakeContentRuntime(ack: unknown = { ok: true }): ContentRuntime & {
  sent: unknown[];
  fire(msg: unknown): void;
  listenerCount(): number;
} {
  const sent: unknown[] = [];
  const listeners = new Set<(msg: unknown) => void>();
  return {
    sent,
    async sendMessage(msg) {
      sent.push(msg);
      return ack;
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fire: (msg) => {
      for (const l of [...listeners]) l(msg);
    },
    listenerCount: () => listeners.size,
  };
}

/** MutationObserver 桩（content-runtime 测试手法固化）：fireMutation 手动驱动。
 *  零 vitest 依赖（发布物——消费方不必装 vitest） */
export function createFakeObserverFactory(): {
  makeObserver: (cb: () => void) => MutationObserverLike;
  fireMutation(): void;
  obs: MutationObserverLike;
} {
  const calls = { observe: 0, disconnect: 0 };
  const obs: MutationObserverLike = {
    observe() {
      calls.observe += 1;
    },
    disconnect() {
      calls.disconnect += 1;
    },
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
}
