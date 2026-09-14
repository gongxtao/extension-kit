import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createSessionStore } from './session-store';
import type { CookieAccess } from './session-store';
import type { SessionStoreConfig } from './session-store';
import { decodeSessionCookie, encodeSessionCookies } from './session-codec';
import type { StoredSession } from './session-codec';

// F19/F23：产品常量经装配注入（框架只持本层结构子集）
const config: SessionStoreConfig = {
  supabaseUrl: 'https://test-ref.supabase.co',
  supabasePublishableKey: 'sb_publishable_test-key',
  webOrigin: 'https://myproduct.app',
  sessionCookieName: 'sb-test-ref-auth-token',
};
const NAME = config.sessionCookieName;
const HOST = 'myproduct.app';
const NOW_MS = 1_700_000_000_000;
const BASE_SEC = NOW_MS / 1000; // 1_700_000_000（Supabase expires_at 秒约定）
const DAY = 24 * 3600;

/** 会话工厂：默认相对 NOW_MS 新鲜 10 分钟（> SKEW 60s） */
const session = (over: Partial<StoredSession> = {}): StoredSession => ({
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: BASE_SEC + 600,
  ...over,
});
const bigSession = (over: Partial<StoredSession> = {}): StoredSession =>
  session({ user: { email: 'm@example.com', pad: 'x'.repeat(7000) }, ...over });

/** 手写 in-memory fake cookies——@webext-core/fake-browser 无 cookies API。
 *  domain 记为 set 时的 URL 主机名，getAll 按域（容忍前导点）过滤。
 *  修复轮一：每个 set/remove 在提交（改 jar + 发事件）前先异步等待——对齐真实
 *  Chrome 逐 cookie 提交，分块写的撕裂中间态可被观测；commitDelayFor 可按
 *  cookie 名注入额外延迟以构造确定性的交错时序。 */
const createFakeCookies = (commitDelayFor: (cookieName: string) => number = () => 0) => {
  const jar = new Map<string, { name: string; value: string; domain: string }>();
  const listeners = new Set<(e: { cookie: { name: string; domain: string } }) => void>();
  const setCalls: Parameters<CookieAccess['set']>[0][] = [];
  const removeCalls: Parameters<CookieAccess['remove']>[0][] = [];

  const emit = (name: string, domain: string): void => {
    for (const listener of listeners) listener({ cookie: { name, domain } });
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
      setCalls.push(details);
      await settle(details.name);
      const domain = new URL(details.url).hostname;
      jar.set(`${domain}|${details.name}`, { name: details.name, value: details.value, domain });
      emit(details.name, domain);
    },
    async remove(details) {
      removeCalls.push(details);
      await settle(details.name);
      const domain = new URL(details.url).hostname;
      if (jar.delete(`${domain}|${details.name}`)) emit(details.name, domain);
    },
    onChanged: {
      addListener: (cb) => {
        listeners.add(cb);
      },
      removeListener: (cb) => {
        listeners.delete(cb as (e: { cookie: { name: string; domain: string } }) => void);
      },
    },
  };
  return { cookies, setCalls, removeCalls };
};

/** 让 onChanged 异步 handler（getSession 重读）跑完的冲刷点 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (fetchMock: Mock<typeof fetch> = vi.fn<typeof fetch>(), fake = createFakeCookies()) => {
  let nowMs = NOW_MS;
  const store = createSessionStore({ cookies: fake.cookies, config, fetchFn: fetchMock, now: () => nowMs });
  const advance = (ms: number): void => {
    nowMs += ms;
  };
  /** 按编码布局种 cookie（默认种在 myproduct.app；传 url 可种去他域） */
  const seed = async (s: StoredSession, url = config.webOrigin): Promise<void> => {
    for (const c of encodeSessionCookies(NAME, s)) {
      await fake.cookies.set({
        url, name: c.name, value: c.value, path: '/', secure: true,
        httpOnly: false, sameSite: 'lax', expirationDate: 0,
      });
    }
  };
  const jar = async (): Promise<{ name: string; value: string }[]> => fake.cookies.getAll({ domain: HOST });
  const jarNames = async (): Promise<string[]> => (await jar()).map((c) => c.name);
  return { fake, store, advance, seed, jar, jarNames };
};

/** 取 mock fetch 的唯一一次调用参数 */
const soleCall = (fetchMock: Mock<typeof fetch>) => {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) throw new Error('fetch 未被调用');
  return { url: String(call[0]), init: call[1] ?? {} };
};

describe('session store（feat-003 Task 5，R8 DI：cookies/fetch/now 全注入）', () => {
  it('getSession：从 fake cookies 解出 session（getAll 域过滤 myproduct.app）；缺失/仅他域同名 → null', async () => {
    const { store, seed } = setup();
    expect(await store.getSession()).toBeNull(); // 无 cookie

    const s = session({ access_token: 'at-1' });
    await seed(s);
    expect(await store.getSession()).toEqual(s);

    // 同名 cookie 只存在于他域 → 域过滤后不可见
    const other = setup();
    await other.seed(session({ access_token: 'evil-at' }), 'https://evil.example');
    expect(await other.store.getSession()).toBeNull();
  });

  it('getValidSession：未过期（expires_at*1000 > now+60_000，SKEW 提前刷新）直接返回，不发 refresh', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const { store, seed } = setup(fetchMock);
    const fresh = session({ access_token: 'at-2', expires_at: BASE_SEC + 61 }); // 恰好越过 SKEW 线
    await seed(fresh);

    await expect(store.getValidSession()).resolves.toEqual(fresh);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('过期 → refresh（fetchFn 收到 refresh_token）→ 返回新 session 且写回：新块 + 缩块 remove（.0 槽豁免）+ 属性 path=/ secure !httpOnly lax + expirationDate=now/1000+400d', async () => {
    const newSession = session({ access_token: 'new-at', refresh_token: 'new-rt', expires_at: BASE_SEC + 3600 });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(newSession), { status: 200 }));
    const { fake, store, seed, jar } = setup(fetchMock);

    const oldChunks = encodeSessionCookies(NAME, bigSession({
      access_token: 'old-at', refresh_token: 'old-rt', expires_at: BASE_SEC,
    }));
    expect(oldChunks.length).toBeGreaterThanOrEqual(2); // 旧布局分块 .0/.1/…
    await seed(bigSession({ access_token: 'old-at', refresh_token: 'old-rt', expires_at: BASE_SEC }));

    await expect(store.getValidSession()).resolves.toEqual(newSession);

    // refresh 请求携存量 refresh_token
    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://test-ref.supabase.co/auth/v1/token?grant_type=refresh_token');
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: 'old-rt' });

    // 写回：fake cookies 可解出新 session；旧多余块被 remove（.0 槽豁免为 codec 计划锁定行为）
    expect(decodeSessionCookie(NAME, await jar())).toEqual(newSession);
    for (const c of oldChunks.slice(1)) {
      expect(fake.removeCalls.map((r) => r.name)).toContain(c.name);
    }

    // 写块属性
    const write = fake.setCalls.filter((c) => c.name === NAME).at(-1);
    if (write === undefined) throw new Error('未写回原名块');
    expect(write).toMatchObject({
      url: config.webOrigin,
      value: encodeSessionCookies(NAME, newSession)[0]!.value,
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax',
    });
    expect(write.expirationDate).toBe(BASE_SEC + 400 * DAY); // now 冻结 → 精确等于
  });

  it('single-flight（裁定 L6）：并发 getValidSession 共享在途刷新——StrictMode 双挂载双载入同持过期 rt，两次 refresh 中后者必败并抹掉前者写回（伪登出）；去重后 fetch 恰一次、两调用方同一会话、写回发生', async () => {
    const newSession = session({ access_token: 'sf-at', refresh_token: 'new-rt', expires_at: BASE_SEC + 3600 });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(newSession), { status: 200 }));
    const { fake, store, seed, jar } = setup(fetchMock);
    await seed(session({ access_token: 'old-at', refresh_token: 'old-rt', expires_at: BASE_SEC }));
    const nameWritesBefore = fake.setCalls.filter((c) => c.name === NAME).length; // seed 也走 fake.set

    // 两次调用之间不 await：捕获两个在途 promise（并发窗口真实存在——两个挂载效应各起一轮 load）
    const p1 = store.getValidSession();
    const p2 = store.getValidSession();

    const s1 = await p1;
    const s2 = await p2;
    expect(s1).toEqual(newSession);
    expect(s2).toBe(s1); // 共享同一产物（一次刷新的结果对象）
    expect(fetchMock).toHaveBeenCalledTimes(1); // 刷新去重为恰一次

    // 写回发生（并发方共享的是完整路径：刷新 + 写回）
    expect(decodeSessionCookie(NAME, await jar())).toEqual(newSession);

    // 落定后槽位清空：后续调用不再共享旧 promise（失败不毒化后续；本例新会话新鲜，无需再刷）
    await expect(store.getValidSession()).resolves.toEqual(newSession);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fake.setCalls.filter((c) => c.name === NAME)).toHaveLength(nameWritesBefore + 1);
  });

  it('终审 I-2 写代次守卫：logout 作废在途 refresh——refresh 落定晚于 clear 也不得复活会话（p 归 null、jar 无新块）', async () => {
    const refreshed = session({ access_token: 'race-at', refresh_token: 'new-rt', expires_at: BASE_SEC + 3600 });
    let resolveRefresh!: (r: Response) => void;
    const refreshGate = new Promise<Response>((res) => {
      resolveRefresh = res;
    });
    // 同一 fetchFn 承载两类调用：refresh（/token）挂起制造网络窗口；logout revoke（/logout）立即 204
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = String(input);
      return url.includes('/auth/v1/token')
        ? refreshGate
        : Promise.resolve(new Response(null, { status: 204 }));
    });
    const { fake, store, seed } = setup(fetchMock);
    await seed(session({ access_token: 'old-at', refresh_token: 'old-rt', expires_at: BASE_SEC })); // 过期会话

    // 1) refresh 在途（不 await）：对抗时序的网络窗口
    const p = store.getValidSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); // refresh 已发出

    // 2) logout：revoke 旧 token + 清全部同名块（此刻 refresh 仍未落定）
    await store.logout();
    expect(await store.getSession()).toBeNull();

    // 3) 在途 refresh 现在才落定（200 新会话）——stale 航班必须被丢弃，不得写回
    const nameWritesAfterLogout = fake.setCalls.filter((c) => c.name === NAME).length;
    resolveRefresh(new Response(JSON.stringify(refreshed), { status: 200 }));
    await expect(p).resolves.toBeNull(); // 不复活：调用方拿到 null（伪 signedIn 翻转被堵死）

    // 4) jar 无复活痕迹：session 名 set 数不增、解不出任何会话
    expect(fake.setCalls.filter((c) => c.name === NAME)).toHaveLength(nameWritesAfterLogout);
    expect(await store.getSession()).toBeNull();
  });

  it('refresh 返回 null（401）→ 清掉全部同名块（原名 + 各分块，含槽 0）→ 返回 null', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 401 }));
    const { fake, store, seed, jarNames } = setup(fetchMock);

    // 原名放可解出的 stale 会话，另残留同名前缀垃圾分块（异常布局）——
    // 验证清理走「全部同名」（含槽 0），而非 planCookieWrites 的 .0 豁免
    const stale = session({ access_token: 'old-at', refresh_token: 'old-rt', expires_at: BASE_SEC });
    await seed(stale);
    for (const [suffix, value] of [['0', 'base64-x'], ['1', 'base64-y']] as const) {
      await fake.cookies.set({
        url: config.webOrigin, name: `${NAME}.${suffix}`, value, path: '/', secure: true,
        httpOnly: false, sameSite: 'lax', expirationDate: 0,
      });
    }
    expect(await store.getSession()).toEqual(stale); // 原名优先，垃圾分块不干扰
    expect((await jarNames()).length).toBe(3);

    await expect(store.getValidSession()).resolves.toBeNull();
    expect(await jarNames()).toEqual([]);
    expect(fake.removeCalls.map((r) => r.name)).toEqual(expect.arrayContaining([NAME, `${NAME}.0`, `${NAME}.1`]));
    expect(await store.getSession()).toBeNull();
  });

  it('watch：同名同域 → 回调携带重读结果（多 watcher 全收）；他名/同名他域不回调；自写回恰好通知一次新会话；Web 侧新 token 照常；退订生效', async () => {
    const refreshed = session({ access_token: 'self-C', refresh_token: 'new-rt', expires_at: BASE_SEC + 3600 });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(refreshed), { status: 200 }));
    const { fake, store, advance, seed } = setup(fetchMock);
    await seed(session({ access_token: 'web-A', expires_at: BASE_SEC })); // 种子（注册前，不产生回调）

    const watcher1 = vi.fn<(s: StoredSession | null) => void>();
    const watcher2 = vi.fn<(s: StoredSession | null) => void>();
    const off1 = store.watch(watcher1);
    store.watch(watcher2);

    // Web 侧写入新 token → 两个 watcher 都收到重读结果
    const webB = session({ access_token: 'web-B' });
    await seed(webB);
    await vi.waitFor(() => expect(watcher1).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(watcher2).toHaveBeenCalledTimes(1));
    expect(watcher1.mock.calls[0]![0]).toEqual(webB);

    // 同域他名 → 不回调
    await fake.cookies.set({
      url: config.webOrigin, name: 'unrelated', value: 'x', path: '/', secure: true,
      httpOnly: false, sameSite: 'lax', expirationDate: 0,
    });
    await flush();
    expect(watcher1).toHaveBeenCalledTimes(1);
    expect(watcher2).toHaveBeenCalledTimes(1);

    // 同名他域 → 不回调
    await seed(session({ access_token: 'evil-at' }), 'https://evil.example');
    await flush();
    expect(watcher1).toHaveBeenCalledTimes(1);
    expect(watcher2).toHaveBeenCalledTimes(1);

    // 过期 → getValidSession 自写回 → 恰好通知一次、携带新会话（事件风暴折叠，消费者可恢复）
    advance(20 * 60_000); // web-B 也过期
    await expect(store.getValidSession()).resolves.toEqual(refreshed);
    await flush();
    await flush();
    expect(watcher1).toHaveBeenCalledTimes(2);
    expect(watcher2).toHaveBeenCalledTimes(2);
    expect(watcher1.mock.calls[1]![0]).toEqual(refreshed);

    // Web 侧再写真正的新 token → 仍通知（值变化穿透去重）
    const webD = session({ access_token: 'web-D' });
    await seed(webD);
    await vi.waitFor(() => expect(watcher1).toHaveBeenCalledTimes(3));
    expect(watcher1.mock.calls[2]![0]).toEqual(webD);

    // 退订后不再回调，未退订的照常收
    off1();
    await seed(session({ access_token: 'web-E' }));
    await vi.waitFor(() => expect(watcher2).toHaveBeenCalledTimes(4)); // B / self-C / D / E
    expect(watcher1).toHaveBeenCalledTimes(3);
  });

  it('修复轮一（a）增长布局写回（NAME → .0/.1/…，逐 cookie 异步提交）：零中间回调，恰好一次携带新会话（不吞自写结果）', async () => {
    const bigNew = bigSession({ access_token: 'grown-at', refresh_token: 'new-rt', expires_at: BASE_SEC + 3600 });
    expect(encodeSessionCookies(NAME, bigNew).length).toBeGreaterThanOrEqual(2); // 新布局分块
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(bigNew), { status: 200 }));
    const { store, seed } = setup(fetchMock);
    await seed(session({ access_token: 'old-small', expires_at: BASE_SEC })); // 旧布局单块原名

    const calls: (StoredSession | null)[] = [];
    store.watch((s) => calls.push(s));
    await expect(store.getValidSession()).resolves.toEqual(bigNew);
    await flush();
    await flush();

    expect(calls.filter((s) => s === null)).toHaveLength(0); // 撕裂中间态不得泄漏 null（假登出）
    expect(calls).toEqual([bigNew]); // 事件风暴折叠为恰一次，且携带新会话
  });

  it('修复轮一（b）撕裂时序（提交 .0、延迟提交 .1）永不发 null：watcher 等全部提交落定后才重读', async () => {
    const bigNew = bigSession({ access_token: 'torn-at', refresh_token: 'new-rt', expires_at: BASE_SEC + 3600 });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(bigNew), { status: 200 }));
    // .1 块延迟 25ms 提交：期间 jar 处于 [.0,.2] 撕裂态（解不出任何会话）
    const fake = createFakeCookies((n) => (n === `${NAME}.1` ? 25 : 0));
    const { store, seed } = setup(fetchMock, fake);
    await seed(session({ access_token: 'old-small', expires_at: BASE_SEC }));

    const calls: (StoredSession | null)[] = [];
    store.watch((s) => calls.push(s));
    await expect(store.getValidSession()).resolves.toEqual(bigNew); // 内部等待全部提交（含 25ms）
    await flush();
    await flush();

    expect(calls.filter((s) => s === null)).toHaveLength(0); // 撕裂窗口（~25ms）内不读
    expect(calls).toEqual([bigNew]);
  });

  it('修复轮一（c）清场（refresh 失败/登出共路）：watcher 恰好收到一次 onChange(null)，无旧会话闪烁', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 401 }));
    const { fake, store } = setup(fetchMock);

    // jar = NAME(完整值) + .0/.1(同一旧会话分块)：清理半程重读仍可解出旧会话的布局
    const bigOld = bigSession({ access_token: 'flicker-at', refresh_token: 'old-rt', expires_at: BASE_SEC });
    const chunks = encodeSessionCookies(NAME, bigOld);
    const fullValue = chunks.map((c) => c.value).join('');
    for (const [name, value] of [[NAME, fullValue] as const, ...chunks.map((c) => [c.name, c.value] as const)]) {
      await fake.cookies.set({
        url: config.webOrigin, name, value, path: '/', secure: true,
        httpOnly: false, sameSite: 'lax', expirationDate: 0,
      });
    }

    const calls: (StoredSession | null)[] = [];
    store.watch((s) => calls.push(s));
    await expect(store.getValidSession()).resolves.toBeNull();
    await flush();
    await flush();

    expect(calls).toEqual([null]); // 恰一次 null；无 'flicker-at' 旧会话闪烁、无重复 null
  });

  it('logout：POST /auth/v1/logout?scope=global + Bearer（R11）；fetch reject 也清全部同名块并 resolve；getSession 归 null', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const { store, seed } = setup(fetchMock);
    await seed(session({ access_token: 'at-6' }));

    await store.logout();
    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://test-ref.supabase.co/auth/v1/logout?scope=global');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer at-6');
    expect(await store.getSession()).toBeNull();

    // 网络拒绝（R11 容忍）：本地仍必清
    const rejectMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    const second = setup(rejectMock);
    await second.seed(bigSession({ access_token: 'at-6b' }));
    await expect(second.store.logout()).resolves.toBeUndefined();
    expect(await second.store.getSession()).toBeNull();
  });

  it('writeSession：encode + planCookieWrites 应用（缩块 remove）+ 全属性，getSession 立即可读', async () => {
    const { fake, store, seed } = setup();
    await seed(bigSession({ access_token: 'old-at' })); // 旧分块布局

    const injected = session({ access_token: 'injected-at' });
    await store.writeSession(injected);

    expect(await store.getSession()).toEqual(injected);
    const write = fake.setCalls.filter((c) => c.name === NAME).at(-1);
    if (write === undefined) throw new Error('未写回原名块');
    expect(write).toMatchObject({
      url: config.webOrigin, path: '/', secure: true, httpOnly: false, sameSite: 'lax',
      value: encodeSessionCookies(NAME, injected)[0]!.value,
    });
    expect(write.expirationDate).toBe(BASE_SEC + 400 * DAY);
    // 缩块：旧分块中未被新布局占用的（除 .0 槽豁免）被 remove
    expect(fake.removeCalls.map((r) => r.name)).toContain(`${NAME}.1`);
  });
});
