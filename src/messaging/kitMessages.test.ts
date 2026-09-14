import { describe, expect, it } from 'vitest';
import { kitMessages } from './kitMessages';

// 守卫矩阵（历史 is* 过/拒矩阵泛化——
// source 站点值域 → metadata 透传，框架只查存在性、值域归产品注入守卫，F17/F24）
describe('kitMessages —— 框架内置 7 kind（design.md §5；ack 是返回类型不占 kind，F12）', () => {
  it('kind ns 化：ns=exkit 七件齐全且形状为 ${ns}-${suffix}', () => {
    const m = kitMessages('exkit');
    expect(m.imageHandoff.kind).toBe('exkit-image-handoff');
    expect(m.grab.kind).toBe('exkit-grab');
    expect(m.cdnGrab.kind).toBe('exkit-cdn-grab');
    expect(m.handoffConsumed.kind).toBe('exkit-handoff-consumed');
    expect(m.togglePanel.kind).toBe('exkit-toggle-panel');
    expect(m.showPanel.kind).toBe('exkit-show-panel');
    expect(m.closePanel.kind).toBe('exkit-close-panel');
    expect(Object.keys(m)).toHaveLength(7);
  });

  it("ns='alpha' 时 kind kind 派生口径（§5 清单口径）", () => {
    const m = kitMessages('alpha');
    expect(m.imageHandoff.kind).toBe('alpha-image-handoff');
    expect(m.grab.kind).toBe('alpha-grab');
    expect(m.cdnGrab.kind).toBe('alpha-cdn-grab');
    expect(m.handoffConsumed.kind).toBe('alpha-handoff-consumed');
    expect(m.togglePanel.kind).toBe('alpha-toggle-panel');
    expect(m.showPanel.kind).toBe('alpha-show-panel');
    expect(m.closePanel.kind).toBe('alpha-close-panel');
  });

  it('imageHandoff 守卫：合法全过/无 metadata 合法；畸形全拒（源 isHandoffMessage 矩阵泛化）', () => {
    const m = kitMessages('testkit');
    const good = {
      kind: 'testkit-image-handoff',
      base64: 'AQID',
      mime: 'image/png',
      metadata: { source: 'gemini' },
      requestedAt: 1_000,
    };
    expect(m.imageHandoff.is(good)).toBe(true);
    expect(m.imageHandoff.is({ ...good, metadata: undefined })).toBe(true);
    expect(m.imageHandoff.is({ ...good, mime: 'image/jpeg' })).toBe(true);
    for (const bad of [
      null,
      'x',
      { ...good, kind: 'other' },
      { ...good, base64: 42 },
      { ...good, base64: '' },
      { ...good, mime: 'image/webp' },
      { ...good, requestedAt: Number.NaN },
    ]) {
      expect(m.imageHandoff.is(bad)).toBe(false);
    }
  });

  it('grab / handoffConsumed 守卫：过/拒矩阵（源 isGrabRequest / isHandoffConsumed）', () => {
    const m = kitMessages('testkit');
    expect(m.grab.is({ kind: 'testkit-grab', srcUrl: 'https://cdn/x.png' })).toBe(true);
    for (const bad of [
      null,
      { kind: 'testkit-grab' },
      { kind: 'testkit-grab', srcUrl: '' },
      { kind: 'testkit-grab', srcUrl: 42 },
      { kind: 'other', srcUrl: 'https://cdn/x.png' },
    ]) {
      expect(m.grab.is(bad)).toBe(false);
    }
    expect(m.handoffConsumed.is({ kind: 'testkit-handoff-consumed' })).toBe(true);
    expect(m.handoffConsumed.is({ kind: 'testkit-image-handoff' })).toBe(false);
    expect(m.handoffConsumed.is(null)).toBe(false);
  });

  it('cdnGrab 守卫：合法全过/无 metadata 合法；畸形全拒（源 isCdnGrabMessage 矩阵泛化，F24 双通道）', () => {
    const m = kitMessages('testkit');
    const good = {
      kind: 'testkit-cdn-grab',
      srcUrl: 'https://lh3.example/a.png',
      requestedAt: 2_000,
      metadata: { source: 'chatgpt' },
    };
    expect(m.cdnGrab.is(good)).toBe(true);
    expect(m.cdnGrab.is({ ...good, metadata: undefined })).toBe(true);
    for (const bad of [
      null,
      'x',
      { ...good, kind: 'other' },
      { ...good, srcUrl: '' },
      { ...good, srcUrl: 42 },
      { ...good, requestedAt: Number.NaN },
    ]) {
      expect(m.cdnGrab.is(bad)).toBe(false);
    }
  });

  it('togglePanel / showPanel / closePanel 守卫：kind 匹配过；他 kind/非对象/null 拒（源 isToggle/isShow + panel-host close-panel）', () => {
    const m = kitMessages('testkit');
    expect(m.togglePanel.is({ kind: 'testkit-toggle-panel' })).toBe(true);
    expect(m.showPanel.is({ kind: 'testkit-show-panel' })).toBe(true);
    expect(m.closePanel.is({ kind: 'testkit-close-panel' })).toBe(true);
    for (const bad of [null, 'x', { kind: 'other' }, { kind: 'testkit-image-handoff' }]) {
      expect(m.togglePanel.is(bad)).toBe(false);
      expect(m.showPanel.is(bad)).toBe(false);
      expect(m.closePanel.is(bad)).toBe(false);
    }
  });

  it('metadata 透传零值域约束：任意值（串/数/对象）均过守卫——值域校验归产品注入守卫回调（F17）', () => {
    const m = kitMessages('testkit');
    const base = { kind: 'testkit-image-handoff', base64: 'AQ', mime: 'image/png', requestedAt: 1 };
    expect(m.imageHandoff.is({ ...base, metadata: 42 })).toBe(true);
    expect(m.imageHandoff.is({ ...base, metadata: 'chatgpt' })).toBe(true);
    expect(m.imageHandoff.is({ ...base, metadata: null })).toBe(true);
  });
});
