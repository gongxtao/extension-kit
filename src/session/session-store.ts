/**
 * Session store ——插件侧会话编排核心
 *
 * 裁定 R8：会话层住 sidepanel、DI 可上移——cookies / config / fetch / now
 * 全部注入，不 import config 单例，不触 window/document（SSR-safe，可搬 background）。
 *
 * - getSession：读本域 `sb-<ref>-auth-token`（及分块 .0/.1/…）→ codec 解码；缺失/非法 → null。
 * - getValidSession：新鲜（expires_at*1000 > now + 60_000，SKEW 对齐 supabase-js
 *   提前刷新余量）直接返回、不发网络；过期 → auth-rest refresh（携存量
 *   refresh_token）→ 成功则按 codec 布局写回（set 新块 + remove 多余块，属性
 *   path=/ secure !httpOnly lax、寿命 400 天 = cookie 上限）；失败（null）→
 *   清掉本域全部同名块（含槽 0，不走 planCookieWrites 豁免）→ 返回 null。
 * - watch：订阅 cookies.onChanged；仅当变更 cookie 名命中前缀过滤（原名或 .N 分块）
 *   且域匹配本 store 域名（容忍前导点）才进入通知流程。**重读串行化（修复轮一）**：
 *   本 store 的写/清场全程挂起 onChanged 重读（pendingWrite gate，等待期间又起
 *   新写则续等最新），分块半写 / 清理半程等撕裂中间态对 watcher 不可见——真实
 *   Chrome 逐 cookie 提交，撕裂组合解不出会话，直读会泄漏 onChange(null) 假登出
 *   或旧会话闪烁。落定后按 settled 状态通知，并按 access_token 去重：每个
 *   watcher 对每个连续状态恰好通知一次（null 也是状态；一次写触发的 N 个事件
 *   折叠为 1 次），自写回携带新会话通知一次（消费者可恢复），Web 侧真正的新
 *   token 照常穿透。返回退订函数，多 watcher 独立收事件；重读异常按 null 通知。
 * - logout：读当前会话 → revokeSession（R11：POST /auth/v1/logout?scope=global +
 *   Bearer，永不 throw）；无论服务端结果如何（含网络 reject）都清掉本域全部同名块，
 *   并翻写代次作废在途 refresh（终审 I-2，见 getValidSession 内守卫）。
 * - writeSession：公开写入口（E2E 注入 / hook 依赖缝），与刷新写回同路径。
 *
 * 并发 single-flight 已做（裁定 L6，见 getValidSession 内注释）。
 * CookieAccess 与 browser.cookies 结构兼容——真实现直接传 browser.cookies。
 *
 * 泛化点（F19/F23 配置三层）：源持 ExtensionConfig → 框架只持本层所需的
 * 结构子集 SessionStoreConfig（webOrigin + sessionCookieName；产品装配注入）。
 */

import type { StoredSession } from './session-codec';
import { decodeSessionCookie, encodeSessionCookies, planCookieWrites } from './session-codec';
import { refreshSession, revokeSession } from './auth-rest';

/** 会话编排全链所需配置（源 ExtensionConfig 原样——store 内部调 refresh/revoke；
 *  产品装配注入，F19/F23） */
export interface SessionStoreConfig {
  /** Web 站点源（cookie 域与 set/remove url 的基址） */
  webOrigin: string;
  /** Supabase 项目 URL（内部 refreshSession/revokeSession 用） */
  supabaseUrl: string;
  /** Supabase publishable（公开）key */
  supabasePublishableKey: string;
  /** 会话 cookie 名：sb-<ref>-auth-token */
  sessionCookieName: string;
}

export interface CookieAccess {
  getAll(f: { domain: string }): Promise<{ name: string; value: string }[]>;
  set(d: {
    url: string;
    name: string;
    value: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: 'lax';
    expirationDate: number;
  }): Promise<unknown>;
  remove(d: { url: string; name: string }): Promise<unknown>;
  onChanged: {
    addListener(cb: (e: { cookie: { name: string; domain: string } }) => void): void;
    removeListener(cb: unknown): void;
  };
}

export interface SessionStore {
  getSession(): Promise<StoredSession | null>;
  getValidSession(): Promise<StoredSession | null>;
  watch(onChange: (s: StoredSession | null) => void): () => void;
  logout(): Promise<void>;
  writeSession(s: StoredSession): Promise<void>;
}

/** 新鲜判定前置余量（ms）：expires_at 进入最后 60s 即视为过期，提前刷新 */
const SKEW_MS = 60_000;
/** 会话 cookie 寿命（秒）：400 天，cookie 允许的上限值 */
const COOKIE_TTL_SECONDS = 400 * 24 * 3600;

export function createSessionStore(deps: {
  cookies: CookieAccess;
  config: SessionStoreConfig;
  fetchFn?: typeof fetch;
  now?: () => number;
}): SessionStore {
  const { cookies, config } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now;
  const hostname = new URL(config.webOrigin).hostname;
  const cookieName = config.sessionCookieName;

  /**
   * 自写窗口（修复轮一）：写路径进入即立 gate，全部 cookie 提交落定后放行并撤窗。
   * onChanged 重读挂在 gate 之后 ⇒ 撕裂中间态（分块半写 / 清理半程）对 watcher 不可见。
   */
  let pendingWrite: Promise<void> | null = null;

  const runWrite = async <T>(op: () => Promise<T>): Promise<T> => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    pendingWrite = gate;
    try {
      return await op();
    } finally {
      release();
      if (pendingWrite === gate) pendingWrite = null;
    }
  };

  const isSessionCookieName = (n: string): boolean =>
    n === cookieName || n.startsWith(`${cookieName}.`);

  /** 读本域全部同名 cookie（域过滤交给 getAll，名字前缀过滤在此收口） */
  const readSessionCookies = async (): Promise<{ name: string; value: string }[]> => {
    const all = await cookies.getAll({ domain: hostname });
    return all.filter((c) => isSessionCookieName(c.name));
  };

  const getSession = async (): Promise<StoredSession | null> =>
    decodeSessionCookie(cookieName, await readSessionCookies());

  const isFresh = (session: StoredSession): boolean =>
    session.expires_at * 1000 > now() + SKEW_MS;

  /** 清掉本域全部同名 cookie（刷新失败 / 登出；含槽 0，不走 planCookieWrites 豁免） */
  const clearSessionCookies = (): Promise<void> =>
    runWrite(async () => {
      const existing = await readSessionCookies();
      await Promise.all(existing.map((c) => cookies.remove({ url: config.webOrigin, name: c.name })));
    });

  /** encode + planCookieWrites + 应用——刷新写回与 writeSession 的公共路径 */
  const applySessionWrite = (session: StoredSession): Promise<void> =>
    runWrite(async () => {
      const existing = await readSessionCookies();
      const desired = encodeSessionCookies(cookieName, session);
      const { set, remove } = planCookieWrites(
        cookieName,
        existing.map((c) => c.name),
        desired,
      );
      await Promise.all([
        ...set.map((c) =>
          cookies.set({
            url: config.webOrigin,
            name: c.name,
            value: c.value,
            path: '/',
            secure: true,
            httpOnly: false,
            sameSite: 'lax',
            expirationDate: Math.floor(now() / 1000) + COOKIE_TTL_SECONDS,
          }),
        ),
        ...remove.map((name) => cookies.remove({ url: config.webOrigin, name })),
      ]);
    });

  /**
   * single-flight（裁定 L6，步骤八前置）：并发 getValidSession 共享在途 promise——
   * StrictMode 双挂载（main.tsx）下 useSession 的挂载效应跑两次，两轮并发 load 各
   * 持同一过期 refresh_token 起刷新；token 轮换后第二个请求必 401，其失败路径
   * clearSessionCookies 会抹掉第一个刚写回的新会话 → 伪登出。去重后整个
   * 「读→判新鲜→刷新→写回」路径只走一次，两调用方拿到同一结果。finally 清槽：
   * 失败不毒化后续调用（下一次调用重新起一轮）。仅 getValidSession 去重——
   * getSession/watch/logout 语义不变。
   */
  let inFlight: Promise<StoredSession | null> | null = null;

  /** 写代次（终审 I-2）：logout 起飞前递增——在途 refresh 落定后对比代次即知
   *  自己是否已被登出作废（stale 航班不得把新会话写回已清空的 jar，
   *  否则 logout 被并行 refresh 复活、面板翻回 signedIn）。 */
  let writeGeneration = 0;

  const getValidSession = (): Promise<StoredSession | null> => {
    if (inFlight !== null) return inFlight;
    const generation = writeGeneration; // 本航班起飞时的代次（终审 I-2 守卫基准）
    const run = (async (): Promise<StoredSession | null> => {
      const session = await getSession();
      if (session === null) return null;
      if (isFresh(session)) return session;
      const refreshed = await refreshSession(config, session.refresh_token, fetchFn);
      if (generation !== writeGeneration) {
        // 终审 I-2：飞行途中发生过 logout——stale 结果丢弃，不写回；
        // clearSessionCookies 幂等再保险（jar 已被 logout 清过，此处确保净空）。
        await clearSessionCookies();
        return null;
      }
      if (refreshed === null) {
        await clearSessionCookies();
        return null;
      }
      await applySessionWrite(refreshed);
      return refreshed;
    })();
    inFlight = run;
    return run.finally(() => {
      if (inFlight === run) inFlight = null;
    });
  };

  const watch = (onChange: (s: StoredSession | null) => void): (() => void) => {
    // undefined = 尚未通知过（首个 null 也必须送达）；每个 watcher 独立去重
    let lastNotifiedToken: string | null | undefined;
    const listener = async (event: { cookie: { name: string; domain: string } }): Promise<void> => {
      const { name, domain } = event.cookie;
      const normalizedDomain = domain.startsWith('.') ? domain.slice(1) : domain;
      if (!isSessionCookieName(name) || normalizedDomain !== hostname) return;
      try {
        // 串行化：窗口内有写（含等待期间新起的写）就等它落定再读
        while (pendingWrite !== null) {
          const gate = pendingWrite;
          await gate;
        }
        const session = await getSession();
        const token = session === null ? null : session.access_token;
        if (token === lastNotifiedToken) return; // 同一 settled 状态只通知一次（事件风暴折叠）
        lastNotifiedToken = token;
        onChange(session);
      } catch {
        lastNotifiedToken = null;
        onChange(null); // 重读失败按无会话通知，不留未处理拒绝
      }
    };
    cookies.onChanged.addListener(listener);
    return () => cookies.onChanged.removeListener(listener);
  };

  const logout = async (): Promise<void> => {
    // 终审 I-2：先翻写代次再起飞——任何在途 getValidSession 的 refresh 落定后
    // 对比代次即知自己已过期（登出后的写回 = 复活登录，禁止）；同时清 inFlight
    // 槽，后续调用不再共享登出前的旧航班（起自己的新轮）。
    writeGeneration += 1;
    inFlight = null;
    const session = await getSession();
    try {
      if (session !== null) await revokeSession(config, session.access_token, fetchFn);
    } finally {
      // R11：服务端登出容忍失败，但本地会话必须无条件清干净
      await clearSessionCookies();
    }
  };

  return {
    getSession,
    getValidSession,
    watch,
    logout,
    writeSession: applySessionWrite,
  };
}
