import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  blobToBase64,
  bytesToBase64,
  createHandoffStore,
  isFresh,
  HANDOFF_TTL_MS,
  type HandoffRecord,
} from './handoff';
import type { StorageArea } from '../../io/storage';

/**
 * runtime/handoff 测试——store/编解码/TTL
 * 矩阵（R46/R47 全保留）。泛化适配：键注入（kit.key('image-handoff') 派生口径，
 * 测试用 testkit-image-handoff）；消息守卫矩阵已归 /messaging kitMessages 测试
 * （F12 计数口径——ack 是返回类型不占 kind）；source → metadata 透传（F17/F24，
 * 框架零值域约束）。
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

const KEY = 'testkit-image-handoff';

const sample = (over: Partial<HandoffRecord> = {}): HandoffRecord => ({
  kind: 'image',
  base64: bytesToBase64(new Uint8Array([1, 2, 3, 255])),
  mime: 'image/png',
  metadata: { source: 'chatgpt' },
  requestedAt: 1_000,
  ...over,
});

describe('handoff store（R46 storage.session 单通道 + TTL；键 ns 化注入）', () => {
  // 300k buffer 分块编解码是性能敏感用例：全量并发跑（jsdom 环境争抢）实测 ~5.8s，
  // 单跑 1.2s——显式放宽时间预算（默认 5s），断言语义不变
  it('base64 编解码回环：空/任意字节/非 3 对齐/大 buffer（分块不爆栈）', { timeout: 20_000 }, () => {
    const cases = [
      new Uint8Array(0),
      new Uint8Array([0]),
      new Uint8Array([1, 2]),
      new Uint8Array([1, 2, 3, 255, 0, 128]),
      new Uint8Array(300_000).map((_, i) => i % 251),
    ];
    for (const bytes of cases) {
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it('store.set→get 回环；无记录 get → null', async () => {
    const store = createHandoffStore(fakeArea(), KEY);
    expect(await store.get()).toBeNull();
    expect(await store.set(sample())).toBe(true);
    expect(await store.get()).toEqual(sample());
  });

  it('store.clear 生效（面板处理完成后清，防冷启动重放）', async () => {
    const area = fakeArea();
    const store = createHandoffStore(area, KEY);
    await store.set(sample());
    await store.clear();
    expect(await store.get()).toBeNull();
    expect(area.dump()[KEY]).toBeUndefined();
  });

  it('store.set：storage 抛错（超限 QUOTA 等）→ false 不抛（background 收口可分支）', async () => {
    const store = createHandoffStore(
      fakeArea({
        async set() {
          throw new Error('QUOTA_BYTES quota exceeded');
        },
      }),
      KEY,
    );
    await expect(store.set(sample())).resolves.toBe(false);
  });

  it('store.get：畸形记录（非对象/kind 不符/base64 非串/mime 越枚举/requestedAt 非有限数）→ null', async () => {
    const bad = [
      'x',
      null,
      { ...sample(), kind: 'other' },
      { ...sample(), base64: 42 },
      { ...sample(), base64: '' },
      { ...sample(), mime: 'image/webp' },
      { ...sample(), requestedAt: Number.NaN },
      { kind: 'image' },
    ];
    for (const rec of bad) {
      const store = createHandoffStore(fakeArea(), KEY);
      await store.set(rec as unknown as HandoffRecord);
      expect(await store.get()).toBeNull();
    }
  });

  it('metadata 透传零值域约束（F17/F24）：任意 metadata（串/数）合法存取；无 metadata 合法', async () => {
    const store = createHandoffStore(fakeArea(), KEY);
    expect(await store.set(sample({ metadata: 'localhost' }))).toBe(true);
    expect((await store.get())?.metadata).toBe('localhost');
    const noMeta = sample();
    delete (noMeta as Partial<HandoffRecord>).metadata;
    await store.set(noMeta);
    expect(await store.get()).toEqual(noMeta);
  });

  it('isFresh（R47 新鲜度）：TTL 内 true、过期 false（防陈图突袭）', () => {
    const h = sample({ requestedAt: 0 });
    expect(isFresh(h, HANDOFF_TTL_MS - 1)).toBe(true);
    expect(isFresh(h, HANDOFF_TTL_MS)).toBe(false);
    expect(HANDOFF_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('键由调用方派生注入：不同 key 互不串台（§5 键名集中管控消费面）', async () => {
    const area = fakeArea();
    await createHandoffStore(area, 'testkit-image-handoff').set(sample());
    expect(await createHandoffStore(area, 'otherkit-image-handoff').get()).toBeNull();
  });

  it('blobToBase64：jsdom Blob FileReader 路兜底（arrayBuffer 缺席形态）', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 255])], { type: 'image/png' });
    const b64 = await blobToBase64(blob);
    expect(base64ToBytes(b64)).toEqual(new Uint8Array([1, 2, 3, 255]));
  });
});
