// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSession } from './useSession';
import type { UseSessionApiDeps } from './useSession';
import type { StoredSession } from '../session/session-codec';
import type { MeCache, MeCacheEntry } from '../session/me-cache';
import type { ApiDeps, ApiResult } from '../api/api-client';
import { apiFetch } from '../api/api-client';

/**
 * useSession 测试——copy-out 自 ready-svg useSession.test.ts（433 行矩阵全保留），
 * 泛型化适配（F3/F19）：fetchMe → fetchAccount 注入（测试用真 apiFetch 组装——
 * 产品接线形态，保留无会话短路语义）、config.webOrigin 缺省删除（baseUrl 必填）、
 * meCache 条目 me → value、账户形状为产品自有（测试用 Me）。
 */

interface Me {
  email: string;
  credits: number;
}

const session = (over: Partial<StoredSession> = {}): StoredSession => ({
  access_token: 'at-hook',
  refresh_token: 'rt',
  expires_at: 1_700_000_600,
  ...over,
});

const ME: Me = { email: 'maker@example.com', credits: 7 };
const BASE = 'https://readysvg.net';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const meOk = (): Response => json(200, { ok: true, user: ME });
const authRequired = (): Response =>
  json(401, { ok: false, error: { code: 'authentication_required', message: 'invalid' } });

/** 产品侧 fetchAccount 接线形态：apiFetch 打 /api/me + user 解包（含无会话短路）。
 *  网络层走 deps.fetchFn（hook 注入的 fetchMock）——断言零网络落在 fetchMock 上 */
const makeFetchAccount = (): UseSessionApiDeps<Me>['fetchAccount'] =>
  vi.fn((deps: ApiDeps): Promise<ApiResult<Me>> =>
    apiFetch<{ user?: unknown }>(deps, '/api/me').then((r) => {
      if (!r.ok) return r;
      const user = r.data.user;
      return typeof user === 'object' && user !== null && typeof (user as Me).credits === 'number'
        ? { ok: true, data: user as Me }
        : { ok: false, status: 200, code: 'request_failed' };
    }),
  );

/** 手写 fake store（DI 惯例，不 vi.mock 模块）：可编程 getValidSession、可主动触发 listener */
const createFakeStore = (initial: StoredSession | null = null) => {
  let current = initial;
  const listeners = new Set<(s: StoredSession | null) => void>();
  const getValidSession = vi.fn(async () => current);
  const getSession = vi.fn(async () => current); // 乐观首绘的纯本地读
  const logoutMock = vi.fn(async () => {
    current = null;
    for (const l of [...listeners]) l(null); // 真 store：清 cookie → onChanged → onChange(null)
  });
  const store = {
    getValidSession,
    getSession,
    watch: (onChange: (s: StoredSession | null) => void): (() => void) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    logout: logoutMock,
  };
  /** 模拟 cookie 变更事件：换当前会话快照并通知全部 listener */
  const emit = (s: StoredSession | null): void => {
    current = s;
    for (const l of [...listeners]) l(s);
  };
  return { store, getValidSession, getSession, logoutMock, emit, listenerCount: () => listeners.size };
};

/** 手写 fake meCache（可预置条目、可断言 set/clear 侧效应）——条目 value 字段（F3） */
const createFakeMeCache = (initial: MeCacheEntry<Me> | null = null) => {
  let entry = initial;
  const get = vi.fn(async () => entry);
  const set = vi.fn(async (value: Me, userId: string) => {
    entry = { value, userId, savedAt: Date.now() };
  });
  const clear = vi.fn(async () => {
    entry = null;
  });
  return { cache: { get, set, clear } as MeCache<Me>, get, set, clear };
};

const renderSession = (
  store: ReturnType<typeof createFakeStore>['store'],
  fetchMock: Mock<typeof fetch>,
  opts: { meCache?: MeCache<Me>; revalidateTtlMs?: number } = {},
) => {
  // api 对象构造一次（hook 按 fields 解构依赖，函数引用稳定是 React 常规契约）
  const api = {
    baseUrl: BASE,
    fetchFn: fetchMock,
    fetchAccount: makeFetchAccount(),
    ...opts,
  };
  return renderHook(() => useSession<Me>(store, api));
};

describe('useSession（登录态状态机 + cookie 出现自动翻登录态）', () => {
  it('初始 loading → getValidSession null → signedOut，网络请求根本不发（/api 无会话短路）', async () => {
    const { store } = createFakeStore(null);
    const fetchMock = vi.fn<typeof fetch>();

    const { result } = renderSession(store, fetchMock);
    expect(result.current.state).toEqual({ status: 'loading', me: null });

    await waitFor(() => expect(result.current.state.status).toBe('signedOut'));
    expect(result.current.state.me).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getValidSession 返回会话 → fetchAccount 携该会话成功 → signedIn，me.email/credits 就位', async () => {
    const { store } = createFakeStore(session({ access_token: 'at-2' }));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());

    const { result } = renderSession(store, fetchMock);

    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(result.current.state.me).toEqual(ME);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${BASE}/api/me`);
  });

  it('authentication_required → signedOut（me 清空）', async () => {
    const { store } = createFakeStore(session());
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(authRequired());

    const { result } = renderSession(store, fetchMock);

    await waitFor(() => expect(result.current.state.status).toBe('signedOut'));
    expect(result.current.state.me).toBeNull();
  });

  it('request_failed（500）→ 落 signedOut 而非卡 loading / 误报登录（无登录证据：失败一律登出 + me null）', async () => {
    const { store } = createFakeStore(session());
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(500, { ok: false, error: { code: 'internal_error' } }));

    const { result } = renderSession(store, fetchMock);

    await waitFor(() => expect(result.current.state.status).toBe('signedOut'));
    expect(result.current.state.me).toBeNull();
  });

  it('验收行为：cookie 出现自动翻登录态——watch 通知 → 重走完整 load → signedOut 翻 signedIn；cookie 消失翻回 signedOut', async () => {
    const fake = createFakeStore(null);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());
    const { result } = renderSession(fake.store, fetchMock);
    await waitFor(() => expect(result.current.state.status).toBe('signedOut'));

    const loadsBefore = fake.getValidSession.mock.calls.length;
    await act(async () => {
      fake.emit(session({ access_token: 'at-web' })); // Web 侧种下会话 cookie
    });
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(result.current.state.me).toEqual(ME);
    expect(fake.getValidSession.mock.calls.length).toBe(loadsBefore + 1); // 重走完整 load

    await act(async () => {
      fake.emit(null); // Web 侧登出
    });
    await waitFor(() => expect(result.current.state.status).toBe('signedOut'));
    expect(result.current.state.me).toBeNull();
  });

  it('refresh() → 重跑 load（getValidSession 再被调，me 随新结果更新）', async () => {
    const { store } = createFakeStore(session());
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(meOk())
      .mockResolvedValueOnce(json(200, { ok: true, user: { ...ME, credits: 3 } }));
    const { result } = renderSession(store, fetchMock);
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(result.current.state.me?.credits).toBe(7);

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.state.me?.credits).toBe(3));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('logout() → store.logout 被调 → signedOut（me 清空）', async () => {
    const fake = createFakeStore(session());
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());
    const { result } = renderSession(fake.store, fetchMock);
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));

    await act(async () => {
      await result.current.logout();
    });

    expect(fake.logoutMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'signedOut', me: null });
  });

  it('unmount 退订：卸载后 listener 清空，此后 cookie 事件不再触发任何 load/fetch', async () => {
    const fake = createFakeStore(session());
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());
    const { result, unmount } = renderSession(fake.store, fetchMock);
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(fake.listenerCount()).toBe(1);

    unmount();
    expect(fake.listenerCount()).toBe(0);

    const fetchCalls = fetchMock.mock.calls.length;
    await act(async () => {
      fake.emit(session({ access_token: 'after-unmount' }));
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock.mock.calls.length).toBe(fetchCalls); // 无新 load
  });
});

describe('useSession 账户摘要缓存（乐观首绘 + TTL 节流校准 + 登出清缓存）', () => {
  const TTL = 10_000;
  const userSession = (id?: string): StoredSession =>
    session({ user: { id, email: 'maker@example.com' } });
  const cachedMe = (credits = 5): Me => ({ email: 'maker@example.com', credits });
  /** TTL 内（新鲜）条目 */
  const freshEntry = (value: Me, userId = 'u1'): MeCacheEntry<Me> => ({
    value,
    userId,
    savedAt: Date.now(),
  });
  /** TTL 外（过期待校准）条目 */
  const staleEntry = (value: Me, userId = 'u1'): MeCacheEntry<Me> => ({
    value,
    userId,
    savedAt: Date.now() - TTL - 1,
  });

  it('乐观首绘：cookie 有会话 + 缓存 userId 一致 + TTL 内 → 立即 signedIn（缓存 value），零网络', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(freshEntry(cachedMe(5)));
    const fetchMock = vi.fn<typeof fetch>();

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });

    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(result.current.state.me?.credits).toBe(5); // 缓存值
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).not.toHaveBeenCalled(); // TTL 内完全零网络
  });

  it('TTL 过期：乐观先落缓存值（校准在途不回退）→ 校准落定覆盖 me 并回写缓存', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(staleEntry(cachedMe(5)));
    let release!: (r: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => gate);

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });

    // 校准挂起中已乐观落缓存值——不回退 loading
    await waitFor(() => {
      expect(result.current.state.status).toBe('signedIn');
      expect(result.current.state.me?.credits).toBe(5);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // TTL 外：后台校准已发起

    await act(async () => {
      release(meOk());
    });
    await waitFor(() => expect(result.current.state.me?.credits).toBe(7));
    expect(c.set).toHaveBeenCalledWith(ME, 'u1'); // 回写
  });

  it('userId 不匹配（Web 端换账号）→ 不乐观：loading 直到权威 fetchAccount 落定，缓存不被采用', async () => {
    const fake = createFakeStore(userSession('u2'));
    const c = createFakeMeCache(freshEntry(cachedMe(5), 'u1'));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });

    expect(result.current.state.status).toBe('loading'); // 未被旧账号缓存乐观顶替
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(result.current.state.me).toEqual(ME); // 权威数据
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('无缓存常规 load：fetchAccount 成功 → 回写缓存（value + 会话 userId）', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(null);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());

    const { result } = renderSession(fake.store, fetchMock, { meCache: c.cache });

    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(c.set).toHaveBeenCalledWith(ME, 'u1');
  });

  it('会话无 user.id（形状防御）→ 不乐观也回写跳过，权威路径照常', async () => {
    const fake = createFakeStore(userSession(undefined));
    const c = createFakeMeCache(freshEntry(cachedMe(5)));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });

    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(result.current.state.me).toEqual(ME);
    expect(c.set).not.toHaveBeenCalled(); // 无 userId 可归属——不写缓存
  });

  it('refresh() 绕过 TTL：TTL 内零网络落定后，显式 refresh 立即拉新（转换/领奖后余额即时）', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(freshEntry(cachedMe(5)));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(200, { ok: true, user: { ...ME, credits: 3 } }));

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });

    await waitFor(() => expect(result.current.state.me?.credits).toBe(5));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).not.toHaveBeenCalled(); // TTL 内开面板零网络

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.state.me?.credits).toBe(3));
    expect(fetchMock).toHaveBeenCalledTimes(1); // 显式一致性动作即时拉新
  });

  it('Web 登出（watch null）→ signedOut 且缓存被清（缓存生命周期 = 登录生命周期）', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(freshEntry(cachedMe(5)));
    const fetchMock = vi.fn<typeof fetch>();

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));

    await act(async () => {
      fake.emit(null); // Web 侧登出，cookie 消失
    });
    await waitFor(() => expect(result.current.state.status).toBe('signedOut'));
    expect(c.clear).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled(); // 短路 signed_out，根本不发请求
  });

  it('logout() → store.logout 被调 + 缓存被清', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(freshEntry(cachedMe(5)));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));

    await act(async () => {
      await result.current.logout();
    });

    expect(fake.logoutMock).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'signedOut', me: null });
    expect(c.clear).toHaveBeenCalledTimes(1);
  });

  it('校准 request_failed（500）且已有登录证据 → 保持缓存登录态（服务端故障 ≠ 登出，语义精化）', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(staleEntry(cachedMe(5)));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(500, { ok: false, error: { code: 'internal_error' } }));

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });

    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.state.status).toBe('signedIn'); // 不翻登出
    expect(result.current.state.me?.credits).toBe(5); // 缓存值保持
    expect(c.clear).not.toHaveBeenCalled(); // 缓存不被服务端故障误清
  });

  it('TTL 内 watch 事件不省网：cookie 变化（登录翻转/轮换）→ 权威 fetchAccount 重走', async () => {
    const fake = createFakeStore(userSession('u1'));
    const c = createFakeMeCache(freshEntry(cachedMe(5)));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(meOk());

    const { result } = renderSession(fake.store, fetchMock, {
      meCache: c.cache,
      revalidateTtlMs: TTL,
    });
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      fake.emit(userSession('u1')); // token 轮换（同 user）
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.state.me?.credits).toBe(7));
  });
});
