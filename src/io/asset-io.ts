/**
 * asset-io —— 资产两条 IO 链路核心（源 R38 下载 / R39 预览 / R124a 预取缓存）
 *
 * 全 DI：fetch 两个端点、blob URL 工厂、download 都注入——jsdom 无
 * URL.createObjectURL、测试无 chrome，全走假件。
 *
 * 泛化点：
 * - 产品 fetcher 注入化（§3 io 行）：端点函数留产品；TextResult 为本地结构类型
 *   （与 /api ApiResult<string> 结构等价——/io 底层零依赖，分层纪律 §4）
 * - filename 品牌资产注入（F23 判据：产品品牌串零缺省）：源 ready-svg-{id}.svg
 *   → deps.filename 回调（缺省通用 `${assetId}.svg`，无品牌）
 */

/** 与 /api ApiResult<string> 结构等价（/io 底层零依赖——分层纪律 §4，/api 结果可直接赋值） */
export interface TextResultOk {
  ok: true;
  data: string;
}
export interface TextResultFail {
  ok: false;
  status: number;
  code: string;
}
export type TextResult = TextResultOk | TextResultFail;

export interface AssetIoDeps {
  /** 预览 SVG 文本端点（产品绑定 /api 后注入） */
  fetchPreviewSvg(assetId: string): Promise<TextResult>;
  /** 导出 SVG 文本端点（产品绑定 /api 后注入） */
  fetchExportSvg(req: { assetId: string; outputWidthMm: number }): Promise<TextResult>;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** = chrome.downloads.download（MV3 Promise 形态；downloads 权限，F21） */
  download(options: { url: string; filename: string }): Promise<unknown>;
  /** 下载文件名（品牌资产注入；缺省 `${assetId}.svg`） */
  filename?(assetId: string): string;
}

export const svgBlob = (text: string): Blob => new Blob([text], { type: 'image/svg+xml' });

/**
 * preview 文本预取缓存（R124a）：轮询翻 succeeded 的瞬间即抢跑 preview 网络
 * （与 React 渲染/成功帧挂载并行）。缓存在 SVG 文本层——blob URL 的创建/回收
 * 纪律不变（R39）。在途去重；失败不缓存（下次 load 重试）。
 */
export interface PreviewPrefetch {
  prefetch(deps: AssetIoDeps, assetId: string): void;
  load(deps: AssetIoDeps, assetId: string): Promise<string | null>;
}

export function createPreviewPrefetch(): PreviewPrefetch {
  const cache = new Map<string, Promise<string | null>>();
  const fetchText = async (deps: AssetIoDeps, assetId: string): Promise<string | null> => {
    const res = await deps.fetchPreviewSvg(assetId);
    return res.ok ? res.data : null;
  };
  const start = (deps: AssetIoDeps, assetId: string): Promise<string | null> => {
    const existing = cache.get(assetId);
    if (existing !== undefined) return existing;
    const pending = fetchText(deps, assetId).catch(() => null);
    cache.set(assetId, pending);
    void pending.then((text) => {
      if (text === null) cache.delete(assetId); // 失败不缓存：下次 load 重试
    });
    return pending;
  };
  return {
    prefetch: (deps, assetId) => void start(deps, assetId),
    load: (deps, assetId) => start(deps, assetId),
  };
}

/** R39：成功 → blob URL；失败 → null（调用方渲染空底占位） */
export async function fetchPreviewUrl(deps: AssetIoDeps, assetId: string): Promise<string | null> {
  const res = await deps.fetchPreviewSvg(assetId);
  if (!res.ok) return null;
  return deps.createObjectURL(svgBlob(res.data));
}

/** R38：下载链路，成功 true / 任一环失败 false；URL 必回收 */
export async function exportAndDownload(
  deps: AssetIoDeps,
  assetId: string,
  outputWidthMm: number,
): Promise<boolean> {
  const res = await deps.fetchExportSvg({ assetId, outputWidthMm });
  if (!res.ok) return false;
  const url = deps.createObjectURL(svgBlob(res.data));
  try {
    await deps.download({ url, filename: deps.filename?.(assetId) ?? `${assetId}.svg` });
    return true;
  } catch {
    return false;
  } finally {
    deps.revokeObjectURL(url);
  }
}
