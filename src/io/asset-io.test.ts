import { describe, expect, it, vi } from 'vitest';
import { createPreviewPrefetch, exportAndDownload, fetchPreviewUrl } from './asset-io';
import type { AssetIoDeps } from './asset-io';

/**
 * asset-io 测试——copy-out 自 ready-svg asset-io.test.ts（R38/R39/R124a 矩阵全保留）。
 * 泛化点：fetch* 返回本地结构 TextResult（与 /api ApiResult<string> 结构等价，
 * /io 底层零依赖）；filename 品牌资产注入（F23 判据——框架零缺省品牌串）。
 */

/** 全 DI 假件：create/revoke/download 均 vi.fn，fetch* 回 TextResult 字面量 */
const makeDeps = (over: Partial<AssetIoDeps> = {}): AssetIoDeps => ({
  fetchPreviewSvg: vi.fn().mockResolvedValue({ ok: true, data: '<svg/>' }),
  fetchExportSvg: vi.fn().mockResolvedValue({ ok: true, data: '<svg>final</svg>' }),
  createObjectURL: vi.fn().mockReturnValue('blob:io-url'),
  revokeObjectURL: vi.fn(),
  download: vi.fn().mockResolvedValue({ id: 1 }),
  ...over,
});

describe('fetchPreviewUrl（R39 预览链路 preview 文本 → blob URL）', () => {
  it('ok → SVG 文本包成 image/svg+xml Blob → createObjectURL 返回 URL', async () => {
    const deps = makeDeps();
    const url = await fetchPreviewUrl(deps, 'asset-1');
    expect(url).toBe('blob:io-url');
    expect(deps.fetchPreviewSvg).toHaveBeenCalledWith('asset-1');
    const [blob] = (deps.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0] as [Blob];
    expect(blob.type).toBe('image/svg+xml');
    // 回收责任在调用方（组件卸载/换图），此处不 revoke
    expect(deps.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('接口失败（!ok）→ null，不碰 blob 工厂', async () => {
    const deps = makeDeps({
      fetchPreviewSvg: vi.fn().mockResolvedValue({ ok: false, status: 500, code: 'server_error' }),
    });
    expect(await fetchPreviewUrl(deps, 'asset-1')).toBeNull();
    expect(deps.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('exportAndDownload（R38 下载链路 fetchExportSvg → Blob → download）', () => {
  it('全链：body 带 {assetId, outputWidthMm} → svg Blob → download({url, filename}) → 完成后 revoke；filename 缺省 ${assetId}.svg（通用缺省，非品牌）', async () => {
    const deps = makeDeps();
    const ok = await exportAndDownload(deps, 'asset-9', 140);
    expect(ok).toBe(true);
    expect(deps.fetchExportSvg).toHaveBeenCalledWith({ assetId: 'asset-9', outputWidthMm: 140 });
    const [blob] = (deps.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0] as [Blob];
    expect(blob.type).toBe('image/svg+xml');
    expect(deps.download).toHaveBeenCalledWith({
      url: 'blob:io-url',
      filename: 'asset-9.svg',
    });
    expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:io-url'); // 下载完成后回收
  });

  it('filename 注入（F23 品牌资产零缺省）：产品注入 filename 回调 → download 收产品串', async () => {
    const deps = makeDeps({
      filename: (assetId) => `ready-svg-${assetId}.svg`,
    });
    await exportAndDownload(deps, 'asset-9', 140);
    expect(deps.download).toHaveBeenCalledWith({
      url: 'blob:io-url',
      filename: 'ready-svg-asset-9.svg',
    });
  });

  it('导出接口失败 → false，不起 download', async () => {
    const deps = makeDeps({
      fetchExportSvg: vi.fn().mockResolvedValue({ ok: false, status: 400, code: 'bad_request' }),
    });
    expect(await exportAndDownload(deps, 'asset-9', 140)).toBe(false);
    expect(deps.download).not.toHaveBeenCalled();
  });

  it('download 抛错 → false，URL 仍被回收（不泄漏）', async () => {
    const deps = makeDeps({
      download: vi.fn().mockRejectedValue(new Error('download failed')),
    });
    expect(await exportAndDownload(deps, 'asset-9', 140)).toBe(false);
    expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:io-url');
  });
});

describe('preview 文本预取缓存（R124a：轮询 succeeded 即抢跑网络，blob URL 生命周期纪律不变）', () => {
  it('prefetch 去重：同 assetId 在途/已完成只发一次 fetch；load 命中缓存跳网络', async () => {
    const deps = makeDeps();
    const prefetcher = createPreviewPrefetch();
    prefetcher.prefetch(deps, 'asset-1');
    await prefetcher.load(deps, 'asset-1');
    await prefetcher.load(deps, 'asset-1');
    expect(deps.fetchPreviewSvg).toHaveBeenCalledTimes(1);
  });

  it('load 未命中自动拉取并写缓存（直接挂载场景）', async () => {
    const deps = makeDeps();
    const prefetcher = createPreviewPrefetch();
    expect(await prefetcher.load(deps, 'asset-2')).toBe('<svg/>');
    expect(await prefetcher.load(deps, 'asset-2')).toBe('<svg/>');
    expect(deps.fetchPreviewSvg).toHaveBeenCalledTimes(1);
  });

  it('失败不缓存（下次重试）+ load 失败返回 null', async () => {
    const deps = makeDeps({
      fetchPreviewSvg: vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 500, code: 'server_error' })
        .mockResolvedValueOnce({ ok: true, data: '<svg>ok</svg>' }),
    });
    const prefetcher = createPreviewPrefetch();
    expect(await prefetcher.load(deps, 'asset-3')).toBeNull();
    expect(await prefetcher.load(deps, 'asset-3')).toBe('<svg>ok</svg>');
  });
});
