/**
 * feat-012 教程单测门——内容 = docs/onboarding.md §6 首个单测代码块
 * （唯一差异：kit 导入路径 `../kit`）。真实跑进 demo 套件：教程的测试代码
 * 不止「可编译」，而且每次 init.sh 都在执行。
 */
import { describe, expect, it } from 'vitest';
import { createFlagStore } from '@gongxtao/extension-kit';
import { createFakeStorageArea } from '@gongxtao/extension-kit/testing';
import { kit } from '../kit';

describe('首开标记', () => {
  it('mark 前后 get 翻转；坏数据不炸', async () => {
    const area = createFakeStorageArea();
    const flag = createFlagStore(area, kit.key('onboarding-seen'));
    expect(await flag.get()).toBe(false);
    await flag.mark();
    expect(await flag.get()).toBe(true);
  });
});
