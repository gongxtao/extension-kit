/**
 * kitMessages —— 框架内置消息协议（design.md §5，7 kind）
 *
 * 形状 = 7 内置消息形（R46/R49/R53/R88/R90 裁定）
 * ——kitMessages(ns) 集中定义。
 *
 * - 面板三件（toggle/show/close-panel）+ 抓取两件（grab/cdn-grab）+ handoff 双向
 *   （image-handoff / handoff-consumed）；ack 是 sendMessage 返回类型不占 kind（F12）
 *   ——HandoffAck/CdnGrabAck 归 /content/handoff 通道。
 * - 业务 payload 与框架通道分离（§5/F17/F24）：源消息里的 source 站点值域在此泛化为
 *   `metadata?: unknown` 透传——框架零站点知识只查存在性，值域校验由产品注入守卫回调。
 * - 守卫纪律继承（§5）：畸形消息一律静默拒（is 返回 false）不抛错不炸 SW——安全默认，
 *   不可配置。
 */

export type PanelMime = 'image/png' | 'image/jpeg';

/** content → background：抓取成功交接（source → metadata 透传） */
export interface ImageHandoffMessage {
  kind: string;
  base64: string;
  mime: PanelMime;
  metadata?: unknown;
  requestedAt: number;
}

/** background → content：右键菜单/菜单转发抓取 */
export interface GrabRequestMessage {
  kind: string;
  srcUrl: string;
}

/** content → background：面板已消费交接内容 */
export interface HandoffConsumedMessage {
  kind: string;
}

/** content → background：CDN 兜底请求（metadata 透传，F24 双通道） */
export interface CdnGrabMessage {
  kind: string;
  srcUrl: string;
  requestedAt: number;
  metadata?: unknown;
}

/** background → content：面板开↔关 */
export interface TogglePanelMessage {
  kind: string;
}

/** background → content：面板幂等开 */
export interface ShowPanelMessage {
  kind: string;
}

/** panel.html → 宿主（iframe postMessage）：面板页请求关闭（iframe postMessage 通路） */
export interface ClosePanelMessage {
  kind: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isMime = (v: unknown): v is PanelMime => v === 'image/png' || v === 'image/jpeg';

export interface MessageEntry<T> {
  /** ns 化消息 kind（发送用） */
  readonly kind: string;
  /** 守卫：畸形消息静默拒（返回 false），不抛错——入口共用纪律 */
  is(value: unknown): value is T;
}

export interface KitMessages {
  imageHandoff: MessageEntry<ImageHandoffMessage>;
  grab: MessageEntry<GrabRequestMessage>;
  cdnGrab: MessageEntry<CdnGrabMessage>;
  handoffConsumed: MessageEntry<HandoffConsumedMessage>;
  togglePanel: MessageEntry<TogglePanelMessage>;
  showPanel: MessageEntry<ShowPanelMessage>;
  closePanel: MessageEntry<ClosePanelMessage>;
}

/** 框架内置协议：ns 一根线派生 7 kind（§5 清单） */
export const kitMessages = (ns: string): KitMessages => {
  const entry = <T>(
    suffix: string,
    guard: (value: Record<string, unknown>) => boolean,
  ): MessageEntry<T> => {
    const kind = `${ns}-${suffix}`;
    return {
      kind,
      is(value): value is T {
        return isRecord(value) && value.kind === kind && guard(value);
      },
    };
  };

  return {
    imageHandoff: entry<ImageHandoffMessage>('image-handoff', (rec) =>
      isNonEmptyString(rec.base64) &&
      isMime(rec.mime) &&
      isFiniteNumber(rec.requestedAt),
    ),
    grab: entry<GrabRequestMessage>('grab', (rec) => isNonEmptyString(rec.srcUrl)),
    cdnGrab: entry<CdnGrabMessage>('cdn-grab', (rec) =>
      isNonEmptyString(rec.srcUrl) && isFiniteNumber(rec.requestedAt),
    ),
    handoffConsumed: entry<HandoffConsumedMessage>('handoff-consumed', () => true),
    togglePanel: entry<TogglePanelMessage>('toggle-panel', () => true),
    showPanel: entry<ShowPanelMessage>('show-panel', () => true),
    closePanel: entry<ClosePanelMessage>('close-panel', () => true),
  };
};
