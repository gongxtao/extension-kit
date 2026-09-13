/**
 * capture/image —— 图片抓取源（源 page-image.ts R42/R45/R48 泛化，F26 首发实现）
 *
 * 职责（源语义随码走）：
 * - isTarget（R42）：哪些 <img> 挂徽标——尺寸阈值（natural ≥300、渲染 ≥160×160）
 *   + 排除占位（data:）、懒加载未落地（!complete）、装饰（aria-hidden / 宽高属性 ≤32）。
 *   阈值可调（imageCapture({...阈值})，F26 注入点）。
 * - extract（R45）：点击后两路抓取——① fetch(currentSrc)（同源/blob:/带 ACAO 的 CDN）；
 *   ② 失败退 canvas 重绘已渲染 img（污染抛 SecurityError）。非 png/jpeg（webp 等）
 *   canvas 转码 png；>7MB 拒（通道上限）。
 * - decodeCdn：声明式 opt-in（F5）——image 源声明（makeCanvas 由装配注入：DOM canvas
 *   或 SW OffscreenCanvas）。
 *
 * 泛化点（F17/F23/F24）：
 * - 站点映射 sourceOf 归产品：sources 注入（hostname → 产品来源值），框架零站点知识；
 * - cornerFor 角位策略注入（通用缺省右下角）；
 * - 阈值可配（BADGE_MIN_NATURAL/RENDER/ICON_ATTR_MAX）。
 *
 * 隐私契约（PRD 1.4）：判定函数只读几何属性不发网络请求；抓取只在用户点击后被调用。
 */

import { EXTRACT_MAX_BYTES, type CaptureSource, type ExtractDeps, type ExtractInput, type ExtractResult, type TargetInfo } from './types';

/** R42 阈值（可调常量，契约注记；imageCapture 可覆盖） */
export const BADGE_MIN_NATURAL = 300;
export const BADGE_MIN_RENDER = 160;
/** 装饰性图标排除阈值（width/height 属性 ≤32px 视为图标） */
export const BADGE_ICON_ATTR_MAX = 32;

/** 徽标挂角（R60 泛型化） */
export type BadgeCorner = 'top-right' | 'bottom-right';

/** 通用缺省角位：右下角（可被 cornerFor 覆盖——F17 角位策略注入） */
export const defaultCornerFor = (): BadgeCorner => 'bottom-right';

/** 判定阈值（全部可覆盖，F26 注入点） */
export interface ImageTargetThresholds {
  minNatural?: number;
  minRender?: number;
  iconAttrMax?: number;
}

/** 图片抓取源装配参数（imageCapture({...阈值})，design.md §4） */
export interface ImageCaptureOptions {
  /** 判定阈值覆盖（缺省 = 源 R42 常量） */
  thresholds?: ImageTargetThresholds;
  /** CDN 兜底解码面（声明式 opt-in，F5）：注入则源声明 decodeCdn——
   *  DOM 侧传 makeDomCanvas，SW 侧传 makeOffscreenCanvas */
  makeCanvas?: () => import('./types').CanvasLike;
}

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg']);

export function isImageTarget(
  info: TargetInfo,
  thresholds: ImageTargetThresholds = {},
): boolean {
  const minNatural = thresholds.minNatural ?? BADGE_MIN_NATURAL;
  const minRender = thresholds.minRender ?? BADGE_MIN_RENDER;
  const iconAttrMax = thresholds.iconAttrMax ?? BADGE_ICON_ATTR_MAX;
  if (!info.complete) return false; // 加载未完成（含 lazy 未落地）
  if (info.naturalWidth < minNatural) return false; // 图标/头像/表情
  if (info.currentSrc.startsWith('data:')) return false; // 占位/内联小图
  if (info.ariaHidden === true) return false; // 装饰
  if (info.attrWidth !== undefined && info.attrWidth <= iconAttrMax) return false;
  if (info.attrHeight !== undefined && info.attrHeight <= iconAttrMax) return false;
  return info.rect.width >= minRender && info.rect.height >= minRender;
}

/** canvas 工厂（真实实现 document.createElement；jsdom 无 canvas 走 fake 注入） */
export const makeDomCanvas = (): import('./types').CanvasLike => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas 2d context unavailable');
  return {
    drawImage(source) {
      ctx.drawImage(source as CanvasImageSource, 0, 0);
    },
    toBlob(type) {
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b === null ? reject(new Error('toBlob null')) : resolve(b)), type);
      });
    },
  };
};

/** SW 侧转码 canvas（R53）：SW 无 document，OffscreenCanvas 替位。DOM canvas
 *  drawImage 会自动扩面到图像尺寸，OffscreenCanvas 不会——必须先按 bitmap 宽高
 *  定面再绘制（改 width/height 会清画布，定面在绘制前完成即无碍）。 */
export const makeOffscreenCanvas = (): import('./types').CanvasLike => {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('offscreen canvas 2d context unavailable');
  return {
    drawImage(source) {
      const { width, height } = source as { width: number; height: number };
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(source as CanvasImageSource, 0, 0);
    },
    async toBlob(type) {
      return canvas.convertToBlob({
        type: type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
      });
    },
  };
};

const drawToPng = async (source: unknown, makeCanvas: () => import('./types').CanvasLike): Promise<Blob> => {
  const canvas = makeCanvas();
  canvas.drawImage(source);
  return canvas.toBlob('image/png');
};

/** R45 两路抓取链（近原样 grabImage；上限随通道常量） */
export async function grabImage(
  input: ExtractInput,
  deps: ExtractDeps = {},
): Promise<ExtractResult> {
  const fetchFn = deps.fetchFn ?? fetch;

  // 路一：fetch（同源 / blob: / 带 ACAO 的 CDN）
  let fetched: Blob | null = null;
  try {
    const res = await fetchFn(input.src);
    if (res.ok) fetched = await res.blob();
  } catch {
    /* 跨域/防盗链 → 落兜底路 */
  }

  if (fetched !== null) {
    if (fetched.size > EXTRACT_MAX_BYTES) return { ok: false, reason: 'too_large' };
    if (ACCEPTED_MIME.has(fetched.type)) {
      return { ok: true, blob: fetched, mime: fetched.type as 'image/png' | 'image/jpeg' };
    }
  }

  const makeCanvas = deps.makeCanvas ?? makeDomCanvas;

  // 路二 a：fetch 到但非 png/jpeg（webp 等）→ bitmap 解码 + canvas 转码 png
  if (fetched !== null) {
    try {
      const bitmap = await (deps.decodeBitmap ?? createImageBitmap)(fetched);
      return { ok: true, blob: await drawToPng(bitmap, makeCanvas), mime: 'image/png' };
    } catch {
      return { ok: false, reason: 'decode' };
    }
  }

  // 路二 b：fetch 失败 → 重绘页面已渲染的 img（污染即 SecurityError → taint）
  if (input.node !== undefined) {
    try {
      return { ok: true, blob: await drawToPng(input.node, makeCanvas), mime: 'image/png' };
    } catch (err) {
      if (err instanceof Error && err.name === 'SecurityError') {
        return { ok: false, reason: 'taint' };
      }
      return { ok: false, reason: 'decode' };
    }
  }

  return { ok: false, reason: 'network' };
}

/** 图片抓取源工厂（F26 首发实现；decodeCdn 声明式 opt-in——makeCanvas 注入才声明） */
export function imageCapture(options: ImageCaptureOptions = {}): CaptureSource {
  return {
    isTarget: (info) => isImageTarget(info, options.thresholds),
    extract: (input, deps) => grabImage(input, deps),
    ...(options.makeCanvas !== undefined ? { decodeCdn: { makeCanvas: options.makeCanvas } } : {}),
  };
}
