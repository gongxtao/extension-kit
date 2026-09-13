export {
  // capture 接口与图片抓取源（F26 契约）
  type CaptureSource,
  type TargetInfo,
  type ExtractInput,
  type ExtractResult,
  type ExtractFailReason,
  type ExtractDeps,
  type CanvasLike,
  EXTRACT_MAX_BYTES,
  isExtractFailReason,
} from './capture/types';
export {
  imageCapture,
  grabImage,
  isImageTarget,
  makeDomCanvas,
  makeOffscreenCanvas,
  defaultCornerFor,
  BADGE_MIN_NATURAL,
  BADGE_MIN_RENDER,
  BADGE_ICON_ATTR_MAX,
  type ImageCaptureOptions,
  type ImageTargetThresholds,
  type BadgeCorner,
} from './capture/image';
export {
  createHandoffStore,
  isFresh,
  bytesToBase64,
  base64ToBytes,
  blobToBase64,
  HANDOFF_TTL_MS,
  HANDOFF_MAX_BYTES,
  type HandoffRecord,
  type HandoffStore,
  type HandoffStorageArea,
} from './runtime/handoff';
export {
  createBadgeOverlay,
  BADGE_SHOW_DELAY_MS,
  BADGE_HIDE_GRACE_MS,
  BADGE_CORNER_INSET_PX,
  type BadgeOverlay,
  type BadgeOverlayDeps,
  type BadgeBranding,
  type BadgeState,
  type GrabOutcome,
  type GrabSent,
} from './runtime/badge-overlay';
export { showPageToast } from './runtime/toast';
export {
  startContentRuntime,
  readTargetInfo,
  loadPageImage,
  type ContentRuntimeDeps,
  type ContentRuntime,
  type MutationObserverLike,
} from './runtime/content-runtime';
export {
  setupPageIntegration,
  type PageIntegrationCtx,
  type PageIntegrationOptions,
} from './runtime/background';
