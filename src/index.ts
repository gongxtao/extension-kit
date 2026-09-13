/**
 * @gongxtao/extension-kit —— 根便捷入口（createKit + 全类型，design.md §6）
 *
 * 模块按 docs/design.md §4 落地（/config /session /api /panel /content
 * /messaging /io /react /testing 九 subpath）；细节用法走各 subpath。
 */

export { createKit } from './config';
export type { Kit, KitConfig } from './config';
export {
  kitMessages,
  defineMessages,
  type KitMessages,
  type MessageEntry,
  type MessageDef,
  type MessageMap,
  type ImageHandoffMessage,
  type GrabRequestMessage,
  type HandoffConsumedMessage,
  type CdnGrabMessage,
  type TogglePanelMessage,
  type ShowPanelMessage,
  type ClosePanelMessage,
  type PanelMime,
} from './messaging';
export {
  copyText,
  fetchPreviewUrl,
  exportAndDownload,
  createPreviewPrefetch,
  createFlagStore,
  svgBlob,
  type AssetIoDeps,
  type TextResult,
  type PreviewPrefetch,
  type FlagStore,
  type StorageArea,
  type StorageAreaWithOnChanged,
} from './io';

export const KIT_NAME = '@gongxtao/extension-kit';
