import { createKit } from '@gongxtao/extension-kit';

/**
 * 例子唯一的 kit 实例——ns 化名字一根线（design.md §5）。
 * 真实产品换成自己的单段 [a-z0-9]+ 命名空间；多产品同开互不串台靠它。
 */
export const kit = createKit({ namespace: 'exkit' });
