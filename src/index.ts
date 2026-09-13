/**
 * @gongxtao/extension-kit —— 根便捷入口（createKit + 全类型，design.md §6）
 *
 * 模块按 docs/design.md §4 落地（/config /session /api /panel /content
 * /messaging /io /react /testing 九 subpath）；细节用法走各 subpath。
 */

export { createKit } from './config';
export type { Kit, KitConfig } from './config';

export const KIT_NAME = '@gongxtao/extension-kit';
