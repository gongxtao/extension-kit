/**
 * panel-prefs —— 页内面板偏好（源 feat-011，R85 模式 / R96 宽度；近原样 copy-out）
 *
 * storage.local 两键（全局统一，非按页——设置件写入，content 宿主与面板页共享读）：
 * - ${ns}-panel-mode：'squeeze'（默认，向左挤压页面）| 'overlay'（浮层覆盖）
 * - ${ns}-panel-width：number px，缺省 460（R96 用户裁「400 偏小、参考 Monica」），
 *   拖拽范围夹取 [320, 720]
 *
 * 泛化点（§3 panel 行 + §5 键 ns 化）：源硬编码 rsvg-panel-mode/-width → keys 缝注入
 * （调用方传 kit.key('panel-mode') / kit.key('panel-width')——键名集中管控）。
 * DI：StorageArea（/io 结构子集）+ onChanged 注册器注入。
 */

import type { StorageArea } from '../io/storage';

export type PanelMode = 'squeeze' | 'overlay';

/** 两键注入（kit.key 派生——键名集中管控 §5） */
export interface PanelPrefsKeys {
  mode: string;
  width: string;
}

/** R96：默认宽（Monica 参考大一档）；下限对齐 Chrome side panel 320 地板；上限留页面过半
 *  ——通用视觉缺省（F23 判据：可被产品覆盖的框架默认值） */
export const PANEL_DEFAULT_WIDTH_PX = 460;
export const PANEL_MIN_WIDTH_PX = 320;
export const PANEL_MAX_WIDTH_PX = 720;

export type ModeChangeListener = (mode: PanelMode) => void;
export type WidthChangeListener = (px: number) => void;

/** 形状守卫 + 夹取 + 取整：合法数 → [MIN, MAX] 整数 px；其余 → 默认宽 */
export const clampPanelWidth = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return PANEL_DEFAULT_WIDTH_PX;
  return Math.round(Math.min(PANEL_MAX_WIDTH_PX, Math.max(PANEL_MIN_WIDTH_PX, value)));
};

export interface PanelPrefs {
  get(): Promise<PanelMode>;
  set(mode: PanelMode): Promise<void>;
  /** storage.onChanged 过滤封装；返回退订函数 */
  onChange(cb: ModeChangeListener): () => void;
  getWidth(): Promise<number>;
  setWidth(px: number): Promise<void>;
  onWidthChange(cb: WidthChangeListener): () => void;
}

const isMode = (v: unknown): v is PanelMode => v === 'squeeze' || v === 'overlay';

export function createPanelPrefs(
  area: StorageArea,
  onChanged: (
    listener: (changes: Record<string, unknown>, areaName: string) => void,
  ) => () => void,
  keys: PanelPrefsKeys,
): PanelPrefs {
  const { mode: modeKey, width: widthKey } = keys;
  return {
    async get() {
      try {
        const bag = await area.get([modeKey]);
        const value = bag[modeKey];
        return isMode(value) ? value : 'squeeze'; // R85：缺省挤压；非法值归位
      } catch {
        return 'squeeze';
      }
    },
    async set(mode: PanelMode) {
      try {
        await area.set({ [modeKey]: mode });
      } catch {
        /* 静默：写失败仅本会话不生效，下次开面板再试 */
      }
    },
    onChange(cb) {
      const listener = (changes: Record<string, unknown>, areaName: string): void => {
        if (areaName !== 'local' || !(modeKey in changes)) return;
        const value = (changes[modeKey] as { newValue?: unknown }).newValue;
        if (isMode(value)) cb(value);
      };
      return onChanged(listener);
    },
    async getWidth() {
      try {
        const bag = await area.get([widthKey]);
        return clampPanelWidth(bag[widthKey]); // 缺席/非法 → 460；越界夹回
      } catch {
        return PANEL_DEFAULT_WIDTH_PX;
      }
    },
    async setWidth(px: number) {
      try {
        await area.set({ [widthKey]: clampPanelWidth(px) }); // 拖动端无需预夹
      } catch {
        /* 静默：写失败仅本会话不持久，拖拽当次仍生效 */
      }
    },
    onWidthChange(cb) {
      const listener = (changes: Record<string, unknown>, areaName: string): void => {
        if (areaName !== 'local' || !(widthKey in changes)) return;
        const value = (changes[widthKey] as { newValue?: unknown }).newValue;
        if (typeof value === 'number' && Number.isFinite(value)) cb(clampPanelWidth(value));
      };
      return onChanged(listener);
    },
  };
}
