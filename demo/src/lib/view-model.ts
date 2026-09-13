/**
 * view-model —— demo 面板的渲染视图模型（面板页唯一的有逻辑纯函数，TDD 覆盖）
 *
 * freshness 语义复用框架 /content isFresh（R47 TTL 5min——防陈图在用户无预期时
 * 突袭载入）；metadata 胶囊遵循 F24 透传零值域——展示层只做格式化不做校验。
 */

import { isFresh, type HandoffRecord } from '@gongxtao/extension-kit/content';

export interface HandoffView {
  state: 'empty' | 'ready' | 'stale';
  /** data:${mime};base64,${base64}——可直接交 <img src> */
  dataUrl?: string;
  /** metadata 胶囊文案（无来源不渲染，R41） */
  pillText?: string;
  /** 空态/过期态的提示文案 */
  hint?: string;
}

/** F24 透传零值域——展示层格式化：undefined 不渲染、字符串原样、其余 JSON 序列化 */
export function metadataLabel(metadata: unknown): string | null {
  if (metadata === undefined) return null;
  if (typeof metadata === 'string') return metadata;
  return JSON.stringify(metadata);
}

export function handoffToView(
  record: HandoffRecord | null,
  opts: { now: number },
): HandoffView {
  if (record === null) {
    return { state: 'empty', hint: 'Click the badge on a large image, or use the right-click menu.' };
  }
  if (!isFresh(record, opts.now)) {
    return {
      state: 'stale',
      hint: 'The captured content expired (older than 5 minutes). Grab it again.',
    };
  }
  const pillText = metadataLabel(record.metadata) ?? undefined;
  return {
    state: 'ready',
    dataUrl: `data:${record.mime};base64,${record.base64}`,
    ...(pillText !== undefined ? { pillText } : {}),
  };
}
