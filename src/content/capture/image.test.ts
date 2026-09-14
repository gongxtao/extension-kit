import { describe, expect, it, vi } from 'vitest';
import {
  BADGE_MIN_NATURAL,
  BADGE_MIN_RENDER,
  grabImage,
  imageCapture,
  isImageTarget,
  makeOffscreenCanvas,
} from './image';
import { EXTRACT_MAX_BYTES } from './types';

/**
 * 图片抓取源测试——R42/R45 矩阵。
 * 泛化适配（F17/F18/F26）：sourceOf 站点映射测试随 F17 删除（值域归产品——框架
 * 零站点知识）；HANDOFF_MAX_BYTES 正名 EXTRACT_MAX_BYTES 随通道走（F18）；
 * isBadgeTarget 正名 isImageTarget、image → node（F26 接口面）。
 */

/** R42 合格基准样本：只改被测字段 */
const eligible = {
  complete: true,
  naturalWidth: 1024,
  currentSrc: 'https://cdn.example.com/photo.png',
  loading: 'eager',
  ariaHidden: false,
  attrWidth: 512,
  attrHeight: 512,
  rect: { width: 400, height: 300 },
};

describe('isImageTarget（R42：尺寸阈值 + 排除图标/头像/占位/懒加载）', () => {
  it('常量守卫：R42 阈值 300/160 + R46 通道上限 7MB（防误改无声漂移）', () => {
    expect(BADGE_MIN_NATURAL).toBe(300);
    expect(BADGE_MIN_RENDER).toBe(160);
    expect(EXTRACT_MAX_BYTES).toBe(7 * 1024 * 1024);
  });

  it('合格样本 → true', () => {
    expect(isImageTarget(eligible)).toBe(true);
  });

  it('naturalWidth 边界：299 拒、300 收（图标/头像主信号）', () => {
    expect(isImageTarget({ ...eligible, naturalWidth: 299 })).toBe(false);
    expect(isImageTarget({ ...eligible, naturalWidth: 300 })).toBe(true);
  });

  it('渲染矩形边界：159px 拒、160px 收（宽高双门）', () => {
    expect(isImageTarget({ ...eligible, rect: { width: 159, height: 400 } })).toBe(false);
    expect(isImageTarget({ ...eligible, rect: { width: 400, height: 159 } })).toBe(false);
    expect(isImageTarget({ ...eligible, rect: { width: 160, height: 160 } })).toBe(true);
  });

  it('排除：data: URI（占位/内联小图）恒 false', () => {
    expect(isImageTarget({ ...eligible, currentSrc: 'data:image/png;base64,AAAA' })).toBe(false);
  });

  it('排除：complete=false（含 loading=lazy 未落地——懒加载缩略图）', () => {
    expect(isImageTarget({ ...eligible, complete: false })).toBe(false);
    expect(
      isImageTarget({ ...eligible, complete: false, loading: 'lazy' }),
    ).toBe(false);
  });

  it('排除：aria-hidden（装饰图）与 width/height 属性 ≤32（装饰性图标）', () => {
    expect(isImageTarget({ ...eligible, ariaHidden: true })).toBe(false);
    expect(isImageTarget({ ...eligible, attrWidth: 32, attrHeight: 32 })).toBe(false);
  });

  it('阈值覆盖（F26 注入点）：imageCapture({thresholds}) 可调——minRender 100 → 99 拒 100 收', () => {
    expect(isImageTarget({ ...eligible, rect: { width: 99, height: 400 } }, { minRender: 100 })).toBe(false);
    expect(isImageTarget({ ...eligible, rect: { width: 100, height: 100 } }, { minRender: 100 })).toBe(true);
  });
});

// —— grabImage（R45 两路链）——————————————————————————————————————

const pngBlob = (bytes = 64): Blob => new Blob([new Uint8Array(bytes)], { type: 'image/png' });
const okResponse = (blob: Blob): Response =>
  ({ ok: true, blob: async () => blob }) as unknown as Response;

/** fake canvas：记录 drawImage 调用；toBlob 可编程 */
const fakeCanvas = (toBlobImpl: () => Promise<Blob>) => ({
  drawn: [] as unknown[],
  drawImage(source: unknown): void {
    this.drawn.push(source);
  },
  toBlob: toBlobImpl,
});

describe('grabImage（R45 fetch→canvas 两路 + 转码 + 上限）', () => {
  it('fetch 直达：同源/CORS png → blob 原样透传，不走 canvas', async () => {
    const blob = pngBlob(128);
    const canvas = fakeCanvas(() => Promise.resolve(pngBlob()));
    const result = await grabImage(
      { src: 'blob:https://chatgpt.com/xyz' },
      { fetchFn: async () => okResponse(blob), makeCanvas: () => canvas as never },
    );
    expect(result).toEqual({ ok: true, blob, mime: 'image/png' });
    expect(canvas.drawn).toHaveLength(0);
  });

  it('fetch 拿到非 png/jpeg（webp）→ canvas 转码 image/png（R45.3）', async () => {
    const webp = new Blob([new Uint8Array(64)], { type: 'image/webp' });
    const png = pngBlob(96);
    const canvas = fakeCanvas(() => Promise.resolve(png));
    const result = await grabImage(
      { src: 'https://cdn.example.com/pic.webp' },
      {
        fetchFn: async () => okResponse(webp),
        makeCanvas: () => canvas as never,
        decodeBitmap: async () => ({ width: 8, height: 8 }),
      },
    );
    expect(result).toEqual({ ok: true, blob: png, mime: 'image/png' });
    expect(canvas.drawn).toHaveLength(1);
  });

  it('fetch 跨域失败 → 已渲染 img 的 canvas 兜底路（R45.2）→ png', async () => {
    const png = pngBlob(80);
    const canvas = fakeCanvas(() => Promise.resolve(png));
    const result = await grabImage(
      { src: 'https://cdn.example.com/x.png', node: {} as never },
      {
        fetchFn: async () => {
          throw new TypeError('Failed to fetch');
        },
        makeCanvas: () => canvas as never,
      },
    );
    expect(result).toEqual({ ok: true, blob: png, mime: 'image/png' });
  });

  it('canvas 兜底遇 SecurityError（跨域未授权污染）→ reason taint（回退引导，契约 §6.1）', async () => {
    const canvas = fakeCanvas(() => {
      const err = new Error('zepto');
      err.name = 'SecurityError';
      return Promise.reject(err);
    });
    const result = await grabImage(
      { src: 'https://cdn.example.com/x.png', node: {} as never },
      {
        fetchFn: async () => {
          throw new TypeError('Failed to fetch');
        },
        makeCanvas: () => canvas as never,
      },
    );
    expect(result).toEqual({ ok: false, reason: 'taint' });
  });

  it('fetch 失败且无已渲染源（右键链 new Image 加载前）→ reason network', async () => {
    const result = await grabImage(
      { src: 'https://cdn.example.com/x.png' },
      {
        fetchFn: async () => {
          throw new TypeError('Failed to fetch');
        },
      },
    );
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('fetch 成功但体积超通道上限 7MB（R46 通道约束）→ reason too_large', async () => {
    const huge = new Blob([new Uint8Array(EXTRACT_MAX_BYTES + 1)], { type: 'image/png' });
    const result = await grabImage(
      { src: 'https://cdn.example.com/huge.png' },
      { fetchFn: async () => okResponse(huge) },
    );
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('转码路径 bitmap 解码失败 → reason decode', async () => {
    const webp = new Blob([new Uint8Array(64)], { type: 'image/webp' });
    const result = await grabImage(
      { src: 'https://cdn.example.com/pic.webp' },
      {
        fetchFn: async () => okResponse(webp),
        decodeBitmap: async () => {
          throw new Error('decode failed');
        },
      },
    );
    expect(result).toEqual({ ok: false, reason: 'decode' });
  });
});

describe('imageCapture（F26 契约：一体两面捆绑 + decodeCdn 声明式 opt-in）', () => {
  it('isTarget/extract 即 isImageTarget/grabImage（一体两面，不可拆配）', async () => {
    const source = imageCapture();
    expect(source.isTarget(eligible)).toBe(true);
    expect(source.isTarget({ ...eligible, complete: false })).toBe(false);
    const blob = pngBlob(32);
    const result = await source.extract(
      { src: 'https://cdn.example.com/a.png' },
      { fetchFn: async () => okResponse(blob) },
    );
    expect(result).toEqual({ ok: true, blob, mime: 'image/png' });
  });

  it('decodeCdn 声明式 opt-in（F5）：makeCanvas 注入则声明；缺省不声明（不走 CDN 兜底）', () => {
    expect(imageCapture().decodeCdn).toBeUndefined();
    const canvas = fakeCanvas(() => Promise.resolve(pngBlob()));
    const opted = imageCapture({ makeCanvas: () => canvas as never });
    expect(opted.decodeCdn).toBeDefined();
    expect(opted.decodeCdn?.makeCanvas()).toBeDefined();
  });
});

describe('makeOffscreenCanvas（R53 SW 转码面：OffscreenCanvas 定尺寸语义）', () => {
  it('drawImage 按 bitmap 宽高先定面再绘制（DOM canvas 自动扩面，OffscreenCanvas 不会）；toBlob type 归一 png/jpeg', async () => {
    const drawAt: Array<{ w: number; h: number }> = [];
    const converted: string[] = [];
    /** jsdom 无 OffscreenCanvas——结构等价桩（字段真实可写，drawImage 时刻回读宽高） */
    class FakeOffscreenCanvas {
      width = 1;
      height = 1;
      getContext(): { drawImage(source: unknown): void } {
        return {
          drawImage: () => {
            drawAt.push({ w: this.width, h: this.height });
          },
        };
      }
      convertToBlob(opts: { type: string }): Promise<Blob> {
        converted.push(opts.type);
        return Promise.resolve(new Blob([new Uint8Array([9])], { type: opts.type }));
      }
    }
    try {
      vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
      const canvas = makeOffscreenCanvas();
      canvas.drawImage({ width: 400, height: 300 } as never);
      expect(drawAt).toEqual([{ w: 400, h: 300 }]); // 定面先于绘制
      await canvas.toBlob('image/png');
      await canvas.toBlob('image/webp'); // 转码路只产 png/jpeg——未知 type 归一 png
      await canvas.toBlob('image/jpeg');
      await canvas.toBlob();
      expect(converted).toEqual(['image/png', 'image/png', 'image/jpeg', 'image/png']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
