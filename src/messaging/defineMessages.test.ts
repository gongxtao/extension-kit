import { describe, expect, it } from 'vitest';
import { defineMessages } from './defineMessages';

// 工厂形状 = design.md §5 defineMessages 代码块（P0/P1 钉死契约）；
// kind 缺省派生规则 = 消息名 camelCase → kebab（镜像源命名 ImageHandoffMessage ↔ image-handoff）
describe('defineMessages —— 产品自定义消息工厂（design.md §5）', () => {
  interface ExportRequested {
    assetId: string;
    format: 'svg' | 'png';
  }
  const isExportRequested = (v: unknown): v is ExportRequested =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).assetId === 'string' &&
    ((v as Record<string, unknown>).format === 'svg' || (v as Record<string, unknown>).format === 'png');

  it('kind 缺省派生：消息名 camelCase → ${ns}-kebab-case', () => {
    const mine = defineMessages('testkit', {
      exportRequested: {},
      refreshAll: {},
    });
    expect(mine.exportRequested.kind).toBe('testkit-export-requested');
    expect(mine.refreshAll.kind).toBe('testkit-refresh-all');
  });

  it('kind 可显式覆盖：def.kind 优先于派生', () => {
    const mine = defineMessages('testkit', {
      legacyName: { kind: 'testkit-legacy' },
    });
    expect(mine.legacyName.kind).toBe('testkit-legacy');
  });

  it('payload 守卫接线：is 即产品守卫；畸形静默拒（守卫纪律继承，不炸 SW）', () => {
    const mine = defineMessages('testkit', {
      exportRequested: { payload: isExportRequested },
    });
    expect(mine.exportRequested.is({ kind: 'testkit-export-requested', assetId: 'a1', format: 'svg' })).toBe(true);
    for (const bad of [
      null,
      'x',
      { kind: 'testkit-export-requested', assetId: 'a1' },
      { kind: 'testkit-export-requested', assetId: 42, format: 'svg' },
      { kind: 'testkit-export-requested', assetId: 'a1', format: 'webp' },
      { kind: 'other', assetId: 'a1', format: 'svg' },
    ]) {
      expect(mine.exportRequested.is(bad)).toBe(false);
    }
  });

  it('无 payload 的 def：is 只查 kind（对齐源空载荷消息守卫口径）', () => {
    const mine = defineMessages('testkit', {
      ping: {},
    });
    expect(mine.ping.is({ kind: 'testkit-ping' })).toBe(true);
    expect(mine.ping.is({ kind: 'other' })).toBe(false);
    expect(mine.ping.is(null)).toBe(false);
    expect(mine.ping.is({ kind: 'testkit-ping', extra: 1 })).toBe(true);
  });
});
