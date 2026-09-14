/**
 * me-cache —— 账户快照乐观缓存（R101 语义，F3/F7/F15 + §5 键 ns 化）
 *
 * 动机：面板每次打开都同步探测 /api/me（1-2s 网络往返），期间
 * 已登录用户每次开面板都要闪一遍 loading。而登录态的权威信号是 cookie（watch
 * 双向同步独立工作），/api/me 只是显示数据。
 *
 * 语义：单键存 `{value, userId, savedAt}`。userId 绑定会话归属——乐观首绘仅在
 * 「cookie 会话的 user.id 与缓存一致」时采用（防 Web 端换账号后闪旧账号信息）；
 * 缓存生命周期 = 登录生命周期（登出/真 401 即清）。TTL 节流只管「开面板的后台
 * 静默校准」——显式拉新与 watch（cookie 变化）恒权威不省网。
 *
 * 泛型化（F3/F7/F15 + 本实现补裁定）：
 * - `MeInfo` 完全归产品（F3）——value: T 泛型，isMeInfo 硬 import 换 validate
 *   守卫注入缝（消费侧传自己的 isXxx 即适配）
 * - 条目字段源 `me` 更名 `value`（F3）
 * - 签名 `createMeCache<T>(area, validate, key, now?)`：F15 收紧后位置参按序追加；
 *   §5 键 ns 化要求 key 缝（F7/F15 文本漏列，实现按 F15 规则补位——键经
 *   kit.key('me-cache') 由调用方派生，键名集中管控）
 *
 * DI：StorageArea 注入（/io 结构子集）；now 注入可测时钟。
 * storage 抛错一律静默——缓存失败只损失「秒开」，无财务影响。
 */

import type { StorageArea } from '../io/storage';

export interface MeCacheEntry<T> {
  /** 上次成功拉取的账户快照（产品形状） */
  value: T;
  /** 归属会话的 user.id——乐观采用的一致性判据 */
  userId: string;
  /** 写入时刻（ms）——TTL 节流的基准 */
  savedAt: number;
}

export interface MeCache<T> {
  get(): Promise<MeCacheEntry<T> | null>;
  set(value: T, userId: string): Promise<void>;
  clear(): Promise<void>;
}

export function createMeCache<T>(
  area: StorageArea,
  validate: (v: unknown) => v is T,
  key: string,
  now: () => number = Date.now,
): MeCache<T> {
  /** 条目形状守卫：value 过产品守卫 + userId 非空 string + savedAt number；坏条目当 null */
  const isEntry = (v: unknown): v is MeCacheEntry<T> => {
    if (typeof v !== 'object' || v === null) return false;
    const o = v as { value?: unknown; userId?: unknown; savedAt?: unknown };
    return (
      validate(o.value) &&
      typeof o.userId === 'string' &&
      o.userId !== '' &&
      typeof o.savedAt === 'number'
    );
  };

  return {
    async get() {
      try {
        const bag = await area.get([key]);
        const raw = bag[key];
        return isEntry(raw) ? raw : null; // 形状不符（含手改/半写）不炸不采用
      } catch {
        return null;
      }
    },
    async set(value, userId) {
      try {
        await area.set({ [key]: { value, userId, savedAt: now() } });
      } catch {
        /* 静默：见文件头 */
      }
    },
    async clear() {
      try {
        await area.remove([key]);
      } catch {
        /* 静默：见文件头 */
      }
    },
  };
}
