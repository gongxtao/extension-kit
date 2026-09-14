import { describe, expect, it, vi } from 'vitest';
import { createFlagStore } from './flag-store';
import type { StorageArea } from './storage';

/**
 * flag-store 测试——R63 语义矩阵。
 * 泛化点（F15）：createOnboardingStore(area) → createFlagStore(area, key)——
 * 位置参按序追加；键经 kit.key('onboarding-seen') 由调用方派生注入。
 */

/** 内存 StorageArea 假件（同源手法） */
const fakeArea = (impl: Partial<StorageArea> = {}): StorageArea & { dump(): Record<string, unknown> } => {
  let data: Record<string, unknown> = {};
  return {
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      data = { ...data, ...items };
    },
    async remove(keys) {
      data = Object.fromEntries(Object.entries(data).filter(([k]) => !keys.includes(k)));
    },
    dump: () => data,
    ...impl,
  };
};

describe('createFlagStore(area, key)（F15 位置参；R63 首启标记语义）', () => {
  it('get/mark 回环：未标记 get → false；mark 后 get → true（键写 true）', async () => {
    const area = fakeArea();
    const store = createFlagStore(area, 'testkit-onboarding-seen');
    expect(await store.get()).toBe(false);
    await store.mark();
    expect(await store.get()).toBe(true);
    expect(area.dump()['testkit-onboarding-seen']).toBe(true);
  });

  it('形状守卫：存储里脏数据（非 true）→ get → false 不炸', async () => {
    for (const bad of ['yes', 1, null, { seen: true }]) {
      const area = fakeArea();
      await area.set({ 'testkit-onboarding-seen': bad });
      expect(await createFlagStore(area, 'testkit-onboarding-seen').get()).toBe(false);
    }
  });

  it('storage 抛错 → get false / mark 不炸（标记失败仅下次仍见首启帧，无害）', async () => {
    const boom: StorageArea = {
      get: vi.fn(async () => {
        throw new Error('quota');
      }),
      set: vi.fn(async () => {
        throw new Error('quota');
      }),
      remove: vi.fn(async () => {}),
    };
    const store = createFlagStore(boom, 'testkit-onboarding-seen');
    await expect(store.get()).resolves.toBe(false);
    await expect(store.mark()).resolves.toBeUndefined();
  });

  it('键由调用方派生注入：不同 key 互不串台（ns 一根线的消费面）', async () => {
    const area = fakeArea();
    await createFlagStore(area, 'testkit-onboarding-seen').mark();
    expect(await createFlagStore(area, 'otherkit-onboarding-seen').get()).toBe(false);
  });
});
