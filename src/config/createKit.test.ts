import { describe, expect, it } from 'vitest';
import { createKit } from './createKit';

// 断言规格 = docs/design.md §5「ns 化名字全量清单」（F11/F16）——
// ns='alpha' 时派生与 §5 全表逐项一致（F20 例外登记的验收基准）
describe('createKit —— ns 一根线穿过所有全局名字（design.md §5）', () => {
  it("ns='alpha'：存储键派生与源字面量逐字节等价（§5 清单·5 键）", () => {
    const kit = createKit({ namespace: 'alpha' });
    expect(kit.key('me-cache')).toBe('alpha-me-cache');
    expect(kit.key('panel-mode')).toBe('alpha-panel-mode');
    expect(kit.key('panel-width')).toBe('alpha-panel-width');
    expect(kit.key('image-handoff')).toBe('alpha-image-handoff');
    expect(kit.key('onboarding-seen')).toBe('alpha-onboarding-seen');
  });

  it("ns='alpha'：消息 kind 派生与源字面量逐字节等价（§5 清单·7 kind）", () => {
    const kit = createKit({ namespace: 'alpha' });
    expect(kit.kind('image-handoff')).toBe('alpha-image-handoff');
    expect(kit.kind('grab')).toBe('alpha-grab');
    expect(kit.kind('cdn-grab')).toBe('alpha-cdn-grab');
    expect(kit.kind('toggle-panel')).toBe('alpha-toggle-panel');
    expect(kit.kind('show-panel')).toBe('alpha-show-panel');
    expect(kit.kind('handoff-consumed')).toBe('alpha-handoff-consumed');
    expect(kit.kind('close-panel')).toBe('alpha-close-panel');
  });

  it("ns='alpha'：DOM id / data 属性 / Shadow CSS 名 / 菜单 id 逐字节等价（§5 清单）", () => {
    const kit = createKit({ namespace: 'alpha' });
    expect(kit.domId('panel-host')).toBe('alpha-panel-host');
    expect(kit.dataAttr('badge')).toBe('data-alpha-badge');
    expect(kit.dataAttr('toast')).toBe('data-alpha-toast');
    expect(kit.dataAttr('resize')).toBe('data-alpha-resize');
    expect(kit.dataAttr('copy')).toBe('data-alpha-copy');
    expect(kit.cssName('spin')).toBe('alpha-spin');
    expect(kit.cssName('shake')).toBe('alpha-shake');
    expect(kit.menuId('convert')).toBe('alpha-convert');
  });

  it("ns='testkit'：参数化派生 ${ns}-${suffix} / data-${ns}-${suffix}", () => {
    const kit = createKit({ namespace: 'testkit' });
    expect(kit.key('me-cache')).toBe('testkit-me-cache');
    expect(kit.kind('toggle-panel')).toBe('testkit-toggle-panel');
    expect(kit.domId('panel-host')).toBe('testkit-panel-host');
    expect(kit.dataAttr('badge')).toBe('data-testkit-badge');
    expect(kit.cssName('spin')).toBe('testkit-spin');
    expect(kit.menuId('convert')).toBe('testkit-convert');
  });

  it('namespace 约束 [a-z0-9]+ 单段：非法值拒绝（空/大写/多段/空白/符号）', () => {
    expect(() => createKit({ namespace: '' })).toThrow();
    expect(() => createKit({ namespace: 'Rsvg' })).toThrow();
    expect(() => createKit({ namespace: 'a-b' })).toThrow();
    expect(() => createKit({ namespace: 'a b' })).toThrow();
    expect(() => createKit({ namespace: 'a_b' })).toThrow();
    expect(() => createKit({ namespace: 'alpha1' })).not.toThrow();
  });

  it('纯字符串派生：无状态、同参同果（F20 例外登记约束）', () => {
    const a = createKit({ namespace: 'testkit' });
    const b = createKit({ namespace: 'testkit' });
    expect(a.key('x')).toBe(b.key('x'));
    expect(a.kind('x')).toBe(b.kind('x'));
    expect(a.domId('x')).toBe(b.domId('x'));
    expect(a.dataAttr('x')).toBe(b.dataAttr('x'));
    expect(a.cssName('x')).toBe(b.cssName('x'));
    expect(a.menuId('x')).toBe(b.menuId('x'));
  });
});
