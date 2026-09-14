import { describe, expect, it, vi } from 'vitest';
import {
  clampPanelWidth,
  createPanelPrefs,
  PANEL_DEFAULT_WIDTH_PX,
  PANEL_MAX_WIDTH_PX,
  PANEL_MIN_WIDTH_PX,
  type PanelMode,
} from './panel-prefs';
import type { StorageArea } from '../io/storage';

/**
 * panel-prefs 测试——R85/R96 矩阵，
 * keys 缝注入参数化（§5 键 ns 化：kit.key('panel-mode') / kit.key('panel-width')）。
 */

const MODE_KEY = 'testkit-panel-mode';
const WIDTH_KEY = 'testkit-panel-width';
const KEYS = { mode: MODE_KEY, width: WIDTH_KEY };

/** 内存版 StorageArea（惯例对齐 onboarding/last-result 测试假件） */
function fakeArea(initial: Record<string, unknown> = {}) {
  const bag = { ...initial };
  const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
  const area = {
    get: async (keys: string[]) => {
      const wanted = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(wanted.filter((k) => k in bag).map((k) => [k, bag[k]]));
    },
    set: async (items: Record<string, unknown>) => {
      const changes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { newValue: v };
        bag[k] = v;
      }
      for (const l of [...listeners]) l(changes, 'local');
    },
    remove: async (keys: string[]) => {
      for (const k of keys) delete bag[k];
    },
    emit: (changes: Record<string, unknown>, area = 'local') => {
      for (const l of [...listeners]) l(changes, area);
    },
  } as StorageArea & { emit(changes: Record<string, unknown>, area?: string): void };
  const onChanged = (listener: (changes: Record<string, unknown>, area: string) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { area, onChanged, emit: area.emit };
}

describe('panel-prefs（R85：挤压默认 + 可切覆盖，全局统一）', () => {
  it('get：缺席 → squeeze（R85 缺省）；storage 抛错 → squeeze 防御', async () => {
    const { area, onChanged } = fakeArea();
    const prefs = createPanelPrefs(area, onChanged, KEYS);
    expect(await prefs.get()).toBe('squeeze');

    const boom = {
      get: () => Promise.reject(new Error('quota')),
      set: () => Promise.resolve(),
    } as unknown as StorageArea;
    expect(await createPanelPrefs(boom, onChanged, KEYS).get()).toBe('squeeze');
  });

  it('get：合法值透出；非法值归 squeeze（形状守卫）', async () => {
    const { area, onChanged } = fakeArea({ [MODE_KEY]: 'overlay' });
    expect(await createPanelPrefs(area, onChanged, KEYS).get()).toBe('overlay');

    const bad = fakeArea({ [MODE_KEY]: 'floating' });
    expect(await createPanelPrefs(bad.area, bad.onChanged, KEYS).get()).toBe('squeeze');
  });

  it('set：写入 storage.local；抛错不炸（静默）', async () => {
    const { area, onChanged } = fakeArea();
    const prefs = createPanelPrefs(area, onChanged, KEYS);
    await prefs.set('overlay');
    expect(await prefs.get()).toBe('overlay');

    const boom = {
      get: async () => ({}),
      set: () => Promise.reject(new Error('quota')),
    } as unknown as StorageArea;
    await expect(createPanelPrefs(boom, onChanged, KEYS).set('overlay')).resolves.toBeUndefined();
  });

  it('onChange：local 区本键变更回调新值；session 区 / 他键 / 非法新值不回调；退订生效', () => {
    const { area, onChanged, emit } = fakeArea();
    const prefs = createPanelPrefs(area, onChanged, KEYS);
    const cb = vi.fn<(mode: PanelMode) => void>();
    const off = prefs.onChange(cb);

    emit({ [MODE_KEY]: { newValue: 'overlay' } }, 'local');
    expect(cb).toHaveBeenCalledWith('overlay');

    cb.mockClear();
    emit({ [MODE_KEY]: { newValue: 'overlay' } }, 'session'); // 他区
    emit({ 'testkit-other': { newValue: 'x' } }, 'local'); // 他键
    emit({ [MODE_KEY]: { newValue: 42 } }, 'local'); // 非法新值
    expect(cb).not.toHaveBeenCalled();

    off();
    emit({ [MODE_KEY]: { newValue: 'squeeze' } }, 'local');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('panel-prefs 宽度（R96：拖拽调宽 + 持久化，Monica 参考默认 460）', () => {
  it('clampPanelWidth：合法数透出取整；越界夹回 [MIN, MAX]；非数/NaN → 默认 460', () => {
    expect(clampPanelWidth(520)).toBe(520);
    expect(clampPanelWidth(520.6)).toBe(521); // 取整——px 粒度足够
    expect(clampPanelWidth(PANEL_MIN_WIDTH_PX - 80)).toBe(PANEL_MIN_WIDTH_PX);
    expect(clampPanelWidth(PANEL_MAX_WIDTH_PX + 500)).toBe(PANEL_MAX_WIDTH_PX);
    expect(clampPanelWidth('480')).toBe(PANEL_DEFAULT_WIDTH_PX); // 非数（字符串数字不收）
    expect(clampPanelWidth(Number.NaN)).toBe(PANEL_DEFAULT_WIDTH_PX);
    expect(clampPanelWidth(undefined)).toBe(PANEL_DEFAULT_WIDTH_PX);
  });

  it('getWidth：缺席 → 460（R96 缺省）；storage 抛错 → 460 防御；合法/越界值透出夹取', async () => {
    const { area, onChanged } = fakeArea();
    expect(await createPanelPrefs(area, onChanged, KEYS).getWidth()).toBe(PANEL_DEFAULT_WIDTH_PX);

    const boom = {
      get: () => Promise.reject(new Error('quota')),
      set: () => Promise.resolve(),
    } as unknown as StorageArea;
    expect(await createPanelPrefs(boom, onChanged, KEYS).getWidth()).toBe(PANEL_DEFAULT_WIDTH_PX);

    const seeded = fakeArea({ [WIDTH_KEY]: 540 });
    expect(await createPanelPrefs(seeded.area, seeded.onChanged, KEYS).getWidth()).toBe(540);
    const over = fakeArea({ [WIDTH_KEY]: 9999 });
    expect(await createPanelPrefs(over.area, over.onChanged, KEYS).getWidth()).toBe(PANEL_MAX_WIDTH_PX);
  });

  it('setWidth：写入夹取后的值（拖动端无需预夹）；抛错不炸（静默）', async () => {
    const { area, onChanged } = fakeArea();
    const prefs = createPanelPrefs(area, onChanged, KEYS);
    await prefs.setWidth(5000);
    expect(await prefs.getWidth()).toBe(PANEL_MAX_WIDTH_PX);

    const boom = {
      get: async () => ({}),
      set: () => Promise.reject(new Error('quota')),
    } as unknown as StorageArea;
    await expect(createPanelPrefs(boom, onChanged, KEYS).setWidth(500)).resolves.toBeUndefined();
  });

  it('onWidthChange：local 区本键回调夹取新值；session 区 / 他键 / 非法新值不回调；退订生效', () => {
    const { area, onChanged, emit } = fakeArea();
    const prefs = createPanelPrefs(area, onChanged, KEYS);
    const cb = vi.fn<(px: number) => void>();
    const off = prefs.onWidthChange(cb);

    emit({ [WIDTH_KEY]: { newValue: 560 } }, 'local');
    expect(cb).toHaveBeenCalledWith(560);

    cb.mockClear();
    emit({ [WIDTH_KEY]: { newValue: 560 } }, 'session');
    emit({ 'testkit-other': { newValue: 42 } }, 'local');
    emit({ [WIDTH_KEY]: { newValue: 'wide' } }, 'local');
    emit({ [WIDTH_KEY]: { newValue: 50 } }, 'local'); // 越界 → 夹 320（仍回调夹取值）
    expect(cb).toHaveBeenCalledWith(PANEL_MIN_WIDTH_PX);
    expect(cb).not.toHaveBeenCalledWith(50);

    off();
    emit({ [WIDTH_KEY]: { newValue: 600 } }, 'local');
    expect(cb).not.toHaveBeenCalledWith(600);
  });
});
