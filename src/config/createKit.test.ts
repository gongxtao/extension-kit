import { describe, expect, it } from 'vitest';
import { createKit } from './createKit';

// 断言规格 = docs/design.md §5「ns 化名字全量清单」（F11/F16）——
// ns='rsvg' 时与 ready-svg@95d0842 源字面量逐字节等价（F20 例外登记的验收基准）
describe('createKit —— ns 一根线穿过所有全局名字（design.md §5）', () => {
  it("ns='rsvg'：存储键派生与源字面量逐字节等价（§5 清单·5 键）", () => {
    const kit = createKit({ namespace: 'rsvg' });
    expect(kit.key('me-cache')).toBe('rsvg-me-cache');
    expect(kit.key('panel-mode')).toBe('rsvg-panel-mode');
    expect(kit.key('panel-width')).toBe('rsvg-panel-width');
    expect(kit.key('image-handoff')).toBe('rsvg-image-handoff');
    expect(kit.key('onboarding-seen')).toBe('rsvg-onboarding-seen');
  });

  it("ns='rsvg'：消息 kind 派生与源字面量逐字节等价（§5 清单·7 kind）", () => {
    const kit = createKit({ namespace: 'rsvg' });
    expect(kit.kind('image-handoff')).toBe('rsvg-image-handoff');
    expect(kit.kind('grab')).toBe('rsvg-grab');
    expect(kit.kind('cdn-grab')).toBe('rsvg-cdn-grab');
    expect(kit.kind('toggle-panel')).toBe('rsvg-toggle-panel');
    expect(kit.kind('show-panel')).toBe('rsvg-show-panel');
    expect(kit.kind('handoff-consumed')).toBe('rsvg-handoff-consumed');
    expect(kit.kind('close-panel')).toBe('rsvg-close-panel');
  });

  it("ns='rsvg'：DOM id / data 属性 / Shadow CSS 名 / 菜单 id 逐字节等价（§5 清单）", () => {
    const kit = createKit({ namespace: 'rsvg' });
    expect(kit.domId('panel-host')).toBe('rsvg-panel-host');
    expect(kit.dataAttr('badge')).toBe('data-rsvg-badge');
    expect(kit.dataAttr('toast')).toBe('data-rsvg-toast');
    expect(kit.dataAttr('resize')).toBe('data-rsvg-resize');
    expect(kit.dataAttr('copy')).toBe('data-rsvg-copy');
    expect(kit.cssName('spin')).toBe('rsvg-spin');
    expect(kit.cssName('shake')).toBe('rsvg-shake');
    expect(kit.menuId('convert')).toBe('rsvg-convert');
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
    expect(() => createKit({ namespace: 'rsvg1' })).not.toThrow();
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
