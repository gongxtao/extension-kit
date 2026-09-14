/**
 * capture/types —— 抓取源（capture source）接口契约（design.md §4，F26——D6 的兑现、
 * P2 落地依据）
 *
 * 一体两面（F1）：发现（isTarget）与抓取（extract）是同一内容类型的两面，捆绑为
 * 「抓取源」，不可拆配。框架零站点知识（F17）——站点映射、来源值域、角位策略
 * 全部经装配注入。
 */

/** 抓取通道上限（R46——随通道走 F18；产品换内容类型时门不丢） */
export const EXTRACT_MAX_BYTES = 7 * 1024 * 1024;

/** 提取败因六值（跨层归属 F18：taint/decode=canvas 路、too_large=通道、
 *  ineligible=点击复核、network/unsupported=抓取链） */
export type ExtractFailReason =
  | 'network'
  | 'taint'
  | 'decode'
  | 'unsupported'
  | 'too_large'
  /** 点击时资格复核不合格（runtime 层包装抛出；尺寸漂移防护，非抓取链本身） */
  | 'ineligible';

/** 败因守卫（R53：ack 的 reason 越值域时回退原败因，不让任意串透传） */
export const isExtractFailReason = (v: unknown): v is ExtractFailReason =>
  v === 'network' ||
  v === 'taint' ||
  v === 'decode' ||
  v === 'unsupported' ||
  v === 'too_large' ||
  v === 'ineligible';

/** 候选判定输入面：DOM 读取在调用方（runtime readTargetInfo），判定函数保持纯。
 *  随源类型可扩展（metadata 透传同款纪律） */
export interface TargetInfo {
  complete: boolean;
  naturalWidth: number;
  currentSrc: string;
  loading?: string;
  ariaHidden?: boolean;
  /** width/height HTML 属性（装饰性小图标排除；undefined 不参与判定） */
  attrWidth?: number;
  attrHeight?: number;
  /** 渲染矩形（getBoundingClientRect） */
  rect: { width: number; height: number };
}

/** extract 输入：src 直链 + 可选绘制源（页面已渲染节点；右键链由调用方加载后传入） */
export interface ExtractInput {
  src: string;
  node?: unknown;
}

/** 提取结果 */
export type ExtractResult =
  | { ok: true; blob: Blob; mime: 'image/png' | 'image/jpeg' }
  | { ok: false; reason: ExtractFailReason };

/** canvas 注入面（真实实现 document.createElement；jsdom 无 canvas 走 fake） */
export interface CanvasLike {
  drawImage(source: unknown): void;
  toBlob(type?: string): Promise<Blob>;
}

export interface ExtractDeps {
  fetchFn?: typeof fetch;
  makeCanvas?(): CanvasLike;
  /** blob → bitmap 解码（真实 createImageBitmap；转码路用） */
  decodeBitmap?(blob: Blob): Promise<unknown>;
}

/**
 * 抓取源接口（F26 契约）：
 * - isTarget：候选判定——扫描与点击复核同函数（F9）；
 * - extract：提取编码（两路抓取链，阈值参数化）；
 * - decodeCdn：CDN 兜底解码——声明式 opt-in（F5）：在场则 SW 兜底以其转码面重走
 *   extract；缺席则该源不走 CDN 兜底。
 * TNode 输入/输出形状随源类型定义（image 源 = Blob 提取）。

 */
export interface CaptureSource {
  isTarget(info: TargetInfo): boolean;
  extract(input: ExtractInput, deps?: ExtractDeps): Promise<ExtractResult>;
  decodeCdn?: { makeCanvas(): CanvasLike };
}
