import { describe, expect, it } from 'vitest';
import { KIT_NAME } from './index';

/** 工具链基线 smoke（feat-001）：根入口可导入、断言可跑——非业务测试 */
describe('harness smoke', () => {
  it('根入口导出包名常量', () => {
    expect(KIT_NAME).toBe('@gongxtao/extension-kit');
  });
});
