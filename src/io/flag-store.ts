/**
 * flag-store —— 布尔标记存储（R63 首启标记语义，review3 修订 F15）
 *
 * `createFlagStore(area, key)`：位置参按序追加（F15——单主体构造器
 * 新增 key 缝按序追加）；键经 `kit.key('onboarding-seen')` 由调用方派生注入——
 * 框架不持 ns，键名集中管控（§5）。
 *
 * DI：StorageArea 注入（/io storage 结构子集），不 import browser 单例。
 * storage 抛错不炸——标记失败仅下次重见一次，无害（源语义随码走）。
 */

import type { StorageArea } from './storage';

export interface FlagStore {
  get(): Promise<boolean>;
  /** 置标记（幂等）；storage 抛错不炸 */
  mark(): Promise<void>;
}

export function createFlagStore(area: StorageArea, key: string): FlagStore {
  return {
    async get() {
      try {
        const bag = await area.get([key]);
        return bag[key] === true; // 形状守卫：仅字面 true 算已标记
      } catch {
        return false;
      }
    },
    async mark() {
      try {
        await area.set({ [key]: true });
      } catch {
        /* 静默：标记失败无害（标记失败无害口径） */
      }
    },
  };
}
