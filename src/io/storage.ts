/**
 * storage —— StorageArea 结构类型单点定义（review2 修订 F8）
 *
 * 源定义散在 convert-stores.ts:23（却被 me-cache/onboarding/panel-prefs 依赖）、
 * handoff.ts:132（HandoffStorageArea 重复声明）——框架收敛到 /io 单点。
 * 真实现直接传 chrome.storage.local / .session（结构兼容子集）。
 *
 * 扩展形状（F8）：含 onChanged 订阅——源 panel-prefs 以独立注入参数携带，
 * 框架升为扩展接口，随 feat-007 /panel 消费。
 */

/** chrome.storage.StorageArea 结构子集（get/set/remove） */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/** storage.onChanged 的单键变化记录 */
export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

/** onChanged 订阅面（chrome.storage.onChanged 结构子集） */
export interface StorageOnChanged {
  addListener(
    cb: (changes: Record<string, StorageChange>, areaName: string) => void,
  ): void;
  removeListener(
    cb: (changes: Record<string, StorageChange>, areaName: string) => void,
  ): void;
}

/** 带变更订阅的 StorageArea（panel-prefs 跨标签页即时同步用） */
export interface StorageAreaWithOnChanged extends StorageArea {
  readonly onChanged: StorageOnChanged;
}
