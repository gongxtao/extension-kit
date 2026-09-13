import { describe, expect, it } from 'vitest';
import { createMeCache } from './me-cache';
import type { StorageArea } from '../io/storage';

/**
 * me-cache 测试——copy-out 自 ready-svg me-cache.test.ts（R101 矩阵全保留），
 * 按 F3/F7/F15 泛型化适配：MeInfo → 产品形状（测试用最小身份契约）、me → value、
 * isMeInfo → validate 守卫注入、键经参数注入（kit.key('me-cache') 派生口径）。
 */

/** 内存 StorageArea 假件（结构兼容 chrome.storage.local 子集，沿源惯例） */
const fakeArea = (
  impl: Partial<StorageArea> = {},
): StorageArea & { dump(): Record<string, unknown> } => {
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

/** 测试用产品形状（源 MeInfo 结构子集——F3：形状归产品） */
interface Me {
  email: string;
  credits: number;
}
const isMe = (v: unknown): v is Me => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { email?: unknown; credits?: unknown };
  return typeof o.email === 'string' && typeof o.credits === 'number';
};

const ME: Me = { email: 'maker@example.com', credits: 7 };
const KEY = 'testkit-me-cache';

const create = (area: StorageArea, now?: () => number) =>
  now === undefined
    ? createMeCache<Me>(area, isMe, KEY)
    : createMeCache<Me>(area, isMe, KEY, now);

describe('createMeCache<T>(area, validate, key, now?)（F15 位置参 + §5 键注入）', () => {
  it('空 area → get null（无缓存不乐观，回退老 loading 路径）', async () => {
    const cache = create(fakeArea());
    expect(await cache.get()).toBeNull();
  });

  it('set → get 回环：全字段深等；savedAt 取注入 now（可测时钟）；条目形状 {value, userId, savedAt}（F3 me→value）', async () => {
    const fixed = 1_759_123_456_789;
    const cache = create(fakeArea(), () => fixed);
    await cache.set(ME, 'u1');
    expect(await cache.get()).toEqual({ value: ME, userId: 'u1', savedAt: fixed });
  });

  it('set 覆盖语义：再 set 换新条目（单键单条），旧 value 不残留', async () => {
    const area = fakeArea();
    const cache = create(area);
    await cache.set(ME, 'u1');
    await cache.set({ ...ME, credits: 3 }, 'u2');
    const got = await cache.get();
    expect(got?.userId).toBe('u2');
    expect(got?.value.credits).toBe(3);
    expect(Object.keys(area.dump()).filter((k) => k === KEY)).toHaveLength(1);
  });

  it('clear → get null', async () => {
    const cache = create(fakeArea());
    await cache.set(ME, 'u1');
    await cache.clear();
    expect(await cache.get()).toBeNull();
  });

  it('坏条目形状守卫：value 未过 validate / userId 非 string / savedAt 非 number / 条目非对象 → get null 不炸', async () => {
    const bad: unknown[] = [
      { value: { email: 'x' }, userId: 'u1', savedAt: 1 }, // value 缺 credits（validate 拒）
      { value: ME, userId: 42, savedAt: 1 }, // userId 非 string
      { value: ME, userId: 'u1', savedAt: 'soon' }, // savedAt 非 number
      'garbage', // 非对象
      null,
    ];
    for (const raw of bad) {
      const area = fakeArea();
      await area.set({ [KEY]: raw });
      const cache = create(area);
      expect(await cache.get()).toBeNull();
    }
  });

  it('storage 抛错静默：get → null；set/clear 不抛（缓存失败无财务影响，沿源惯例）', async () => {
    const boom = (): never => {
      throw new Error('storage down');
    };
    const area = fakeArea({ get: boom, set: boom, remove: boom } as Partial<StorageArea>);
    const cache = create(area);
    expect(await cache.get()).toBeNull();
    await expect(cache.set(ME, 'u1')).resolves.toBeUndefined();
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it('get 的 vi 序：坏条目不炸且不毒化——同一 area 下一轮 set 恢复可用', async () => {
    const area = fakeArea();
    await area.set({ [KEY]: { value: ME, userId: '', savedAt: 1 } }); // 空串 userId 拒收
    const cache = create(area);
    expect(await cache.get()).toBeNull();
    await cache.set(ME, 'u1');
    expect((await cache.get())?.userId).toBe('u1');
  });

  it('now 缺省 Date.now（生产形态冒烟：savedAt 为当前毫秒）', async () => {
    const before = Date.now();
    const cache = create(fakeArea());
    await cache.set(ME, 'u1');
    const savedAt = (await cache.get())?.savedAt ?? 0;
    expect(savedAt).toBeGreaterThanOrEqual(before);
  });

  it('键由调用方派生注入：不同 key 互不串台（§5 键名集中管控消费面）', async () => {
    const area = fakeArea();
    await createMeCache<Me>(area, isMe, 'testkit-me-cache').set(ME, 'u1');
    expect(await createMeCache<Me>(area, isMe, 'otherkit-me-cache').get()).toBeNull();
  });

  it('validate 守卫注入缝（F3/F7）：同 area 换产品守卫 → 不同形状互不采用', async () => {
    const area = fakeArea();
    await area.set({ [KEY]: { value: { weird: 'shape' }, userId: 'u1', savedAt: 1 } });
    // isMe 拒收 weird shape
    expect(await createMeCache<Me>(area, isMe, KEY).get()).toBeNull();
    // 换一套产品守卫则采用（ready-svg 消费侧传 isMeInfo 即适配的语义）
    interface Weird { weird: string }
    const isWeird = (v: unknown): v is Weird =>
      typeof v === 'object' && v !== null && typeof (v as { weird?: unknown }).weird === 'string';
    expect((await createMeCache<Weird>(area, isWeird, KEY).get())?.value.weird).toBe('shape');
  });
});
