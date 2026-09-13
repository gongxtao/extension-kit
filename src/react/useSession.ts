/**
 * useSession —— 登录态状态机（近原样 copy-out 自 ready-svg useSession.ts，
 * feat-003 Task 6 + feat-012 R101 账户摘要缓存；逻辑 hooks 走 /react 子路径，
 * react 为 peerDependency——design.md D3 修订）
 *
 * 数据流：store.watch 的会话快照只当「有变化」信号，统一重走完整 load
 * （getValidSession → fetchAccount）——快照可能过期（watch 发的是 getSession 原始
 * 解码结果），getValidSession 才做新鲜校验/必要时刷新。cookie 出现自动翻
 * 登录态（验收行为）、Web 端登出插件跟随登出，均由此闭环。
 *
 * 乐观首绘（开面板秒显登录态，免 1-2s 探测等待）：
 * - 仅初始 load（initial=true）在权威路径前先做乐观判定：纯本地 getSession +
 *   meCache.get 并行读，cookie 有会话且 user.id 与缓存条目一致 → 立即落
 *   signedIn（缓存 value）；TTL 内（savedAt 距今 < revalidateTtlMs）就此打住——
 *   完全零网络，O(存储读) 毫秒级出登录态。
 * - TTL 过期：乐观落定后继续权威 fetchAccount 后台静默校准（不回退 loading、无闪烁）。
 * - watch / refresh() 恒 initial=false：cookie 变化（登录翻转/轮换）与显式一致性
 *   动作（转换扣费/领奖后拉新余额）永远权威重走，TTL 只节流开面板这一处。
 * - 回写：fetchAccount 成功 → 会话 user.id 归属回写 meCache（stale 轮/无 id 不写）。
 * - 失效：signed_out / authentication_required / logout() → 清缓存（缓存生命
 *   周期 = 登录生命周期；stale 轮不清——logout 已自清，防重复）。
 * - meCache 缺省（未注入）→ 整套缓存行为旁路，退化为基础语义。
 *
 * 失败语义（源任务裁定 + feat-012 精化）：
 * - 无登录证据（本挂载内从未落过 signedIn）时任何不成功（无会话 /
 *   authentication_required / request_failed）一律落 signedOut + me null——不卡
 *   loading、不误报登录；
 * - 有登录证据（乐观命中或此前已 signedIn）时校准 request_failed（网络抖动/5xx/
 *   信封畸形）→ **保持现态不清缓存**——cookie 本地仍有效，服务端故障 ≠ 登出
 *   （与 /api「request_failed 与 signed_out 严格区分」原则对齐）。真登出
 *   信号（signed_out 短路 / authentication_required）不受此精化保护，照常翻。
 *
 * 竞态与生命周期：
 * - 轮次序号（loadSeq）：每轮 load 自增，仅最新一轮可写状态与动缓存——事件风暴
 *   折叠、「登出压线杀掉在途 fetchAccount」都不会被旧结果倒灌；
 * - aliveRef：卸载后不再 setState；StrictMode 双挂载下先卸后挂，
 *   第二轮 load 序号更新，第一轮结果自然作废；
 * - ⚠️ session-store 的 watch listener 本体自带 try/catch——本 hook 的 watch
 *   回调若向上抛异常会被它吞成二次 onChange(null)。回调必须同步不可抛：
 *   runLoad 内部自吞一切异常。
 *
 * DI 泛化点（F3 + F19）：
 * - 源硬 import fetchMe + config.webOrigin 缺省 → 框架零端点零站点知识：
 *   fetchAccount（产品用 /api apiFetch 封装的账户端点）与 baseUrl 必填注入；
 * - 账户形状泛型 TMe（MeInfo 完全归产品）；meCache 条目 value 字段（F3 更名）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiDeps, ApiResult } from '../api/api-client';
import type { StoredSession } from '../session/session-codec';
import type { SessionStore } from '../session/session-store';
import type { MeCache } from '../session/me-cache';

export interface SessionState<TMe> {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: TMe | null;
}

export interface UseSessionApiDeps<TMe> {
  /** 账户端点（产品用 /api apiFetch 封装，如 fetchMe）——框架零端点（F3） */
  fetchAccount(deps: ApiDeps): Promise<ApiResult<TMe>>;
  /** api.md §2.1 接口基址（产品 config.webOrigin——装配注入） */
  baseUrl: string;
  /** fetch 注入缝（测试）；缺省全局 fetch */
  fetchFn?: typeof fetch;
  /** 账户摘要缓存（乐观首绘 + TTL 节流校准 + 登出清理）；缺省不缓存 */
  meCache?: MeCache<TMe>;
  /** 开面板后台校准的节流窗口 ms（缺省 10 分钟）；watch/refresh 不受节流 */
  revalidateTtlMs?: number;
}

export interface UseSessionResult<TMe> {
  state: SessionState<TMe>;
  /** 重跑一次权威 load（getValidSession → fetchAccount）；绕过 TTL——显式一致性动作 */
  refresh(): void;
  /** store.logout 后立即落 signedOut（在途 load 轮作废）并清账户摘要缓存 */
  logout(): Promise<void>;
}

/** TTL 缺省：10 分钟内重开面板零网络（余额滞后窗口；扣费/领奖动作恒即时拉新） */
const REVALIDATE_TTL_MS = 10 * 60_000;

/** 会话归属 id：user.id 为非空 string 才可用（形状防御，缺省/畸形 → null） */
const userIdOf = (s: StoredSession | null): string | null => {
  const id = s?.user?.id;
  return typeof id === 'string' && id !== '' ? id : null;
};

export function useSession<TMe>(
  store: Pick<SessionStore, 'getValidSession' | 'getSession' | 'watch' | 'logout'>,
  api: UseSessionApiDeps<TMe>,
): UseSessionResult<TMe> {
  const baseUrl = api.baseUrl;
  const fetchFn = api.fetchFn ?? fetch;
  const fetchAccount = api.fetchAccount;
  const meCache = api.meCache;
  const revalidateTtlMs = api.revalidateTtlMs ?? REVALIDATE_TTL_MS;
  const [state, setState] = useState<SessionState<TMe>>({ status: 'loading', me: null });

  const aliveRef = useRef(true);
  const loadSeqRef = useRef(0);
  /** 登录证据（feat-012）：本挂载内曾落过 signedIn（乐观或权威）——request_failed
   *  时的保持判据；signedOut 落态与 logout() 翻 false */
  const evidenceRef = useRef(false);

  const runLoad = useCallback(
    async (initial: boolean): Promise<void> => {
      const seq = ++loadSeqRef.current;
      /** 本轮已作废（卸载/被更新轮顶替）——不得再写状态、不得再动缓存 */
      const stale = (): boolean => !aliveRef.current || seq !== loadSeqRef.current;
      const settle = (next: SessionState<TMe>): void => {
        if (stale()) return;
        setState(next);
      };

      // 乐观首绘：仅初始 load 尝试（watch/refresh 恒权威，防旧缓存顶替新数据）
      if (initial && meCache !== undefined) {
        try {
          const [snapshot, entry] = await Promise.all([store.getSession(), meCache.get()]);
          if (stale()) return;
          const uid = userIdOf(snapshot);
          if (uid !== null && entry !== null && entry.userId === uid) {
            evidenceRef.current = true;
            settle({ status: 'signedIn', me: entry.value });
            if (Date.now() - entry.savedAt < revalidateTtlMs) return; // TTL 内零网络
          }
        } catch {
          /* 乐观失败（storage 抖动等）——继续权威路径 */
        }
      }

      try {
        // /api 自带无会话短路：getValidSession null → signed_out 且不发请求
        const result = await fetchAccount({ getValidSession: store.getValidSession, baseUrl, fetchFn });
        if (result.ok) {
          evidenceRef.current = true;
          // 回写缓存先于落态：settle 可见时缓存必已更新（测试可确定性断言）
          if (meCache !== undefined) {
            const uid = userIdOf(await store.getSession());
            if (uid !== null && !stale()) await meCache.set(result.data, uid);
          }
          settle({ status: 'signedIn', me: result.data });
          return;
        }
        if (result.code === 'request_failed' && evidenceRef.current) {
          return; // feat-012 精化：有登录证据时服务端故障 ≠ 登出——保持现态
        }
        // 真登出信号（signed_out 短路 / authentication_required）：清缓存 + 落登出
        evidenceRef.current = false;
        if (meCache !== undefined && !stale()) await meCache.clear();
        settle({ status: 'signedOut', me: null });
      } catch {
        // 防御路径（fetchAccount 内部应已全兜，理论不到此）：同 request_failed 口径
        if (evidenceRef.current) return;
        settle({ status: 'signedOut', me: null });
      }
    },
    [store, fetchAccount, baseUrl, fetchFn, meCache, revalidateTtlMs],
  );

  useEffect(() => {
    aliveRef.current = true;
    void runLoad(true); // 初始 load：允许乐观首绘 + TTL 节流
    const unsubscribe = store.watch(() => {
      void runLoad(false); // cookie 变化恒权威（同步不可抛，见文件头；异常在 runLoad 内自吞）
    });
    return () => {
      aliveRef.current = false;
      unsubscribe();
    };
  }, [store, runLoad]);

  const refresh = useCallback((): void => {
    void runLoad(false); // 显式一致性动作：绕过 TTL（转换扣费/领奖后即时拉余额）
  }, [runLoad]);

  const logout = useCallback(async (): Promise<void> => {
    await store.logout();
    // 作废在途 load 轮（登出后不得再落 signedIn）；随后的 watch(null) 通知只会
    // 再确认 signedOut（stale 守卫下也不会重复清缓存）。卸载后不写状态。
    loadSeqRef.current++;
    evidenceRef.current = false;
    if (meCache !== undefined) await meCache.clear();
    if (aliveRef.current) setState({ status: 'signedOut', me: null });
  }, [store, meCache]);

  return { state, refresh, logout };
}
