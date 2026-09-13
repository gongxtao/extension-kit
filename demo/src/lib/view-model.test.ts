import { describe, expect, it } from 'vitest';
import { handoffToView, metadataLabel } from './view-model';
import type { HandoffRecord } from '@gongxtao/extension-kit/content';

/**
 * demo 面板视图模型测试（feat-011 TDD）——面板页唯一的有逻辑纯函数：
 * handoff 记录 → 渲染视图（空态 / 就绪 / 过期），freshness 语义复用框架
 * /content isFresh（R47 TTL），metadata 胶囊文案遵循 F24 透传零值域。
 */

const NOW = 1_000_000;
const record = (over: Partial<HandoffRecord> = {}): HandoffRecord => ({
  kind: 'image',
  base64: 'AQID',
  mime: 'image/png',
  metadata: 'shopify',
  requestedAt: NOW - 1000, // 1s 前
  ...over,
});

describe('handoffToView（demo 面板视图模型）', () => {
  it('无记录 → 空态（面板等待抓取的引导文案态）', () => {
    expect(handoffToView(null, { now: NOW })).toEqual({
      state: 'empty',
      hint: expect.any(String),
    });
  });

  it('TTL 内记录 → ready：dataUrl 可直接进 <img>，metadata 胶囊就位', () => {
    const view = handoffToView(record(), { now: NOW });
    expect(view.state).toBe('ready');
    expect(view.dataUrl).toBe('data:image/png;base64,AQID');
    expect(view.pillText).toBe('shopify');
  });

  it('R47 过期记录 → stale：不渲染旧内容（防陈图突袭），携带提示文案', () => {
    const stale = record({ requestedAt: NOW - 6 * 60 * 1000 }); // 超默认 5min TTL
    const view = handoffToView(stale, { now: NOW });
    expect(view.state).toBe('stale');
    expect(view.dataUrl).toBeUndefined();
    expect(view.hint).toEqual(expect.any(String));
  });

  it('无 metadata → 无胶囊（R41：无来源不渲染）', () => {
    const view = handoffToView(record({ metadata: undefined }), { now: NOW });
    expect(view.state).toBe('ready');
    expect(view.pillText).toBeUndefined();
  });

  it('jpeg mime 同样可组装 dataUrl', () => {
    const view = handoffToView(record({ mime: 'image/jpeg' }), { now: NOW });
    expect(view.dataUrl).toBe('data:image/jpeg;base64,AQID');
  });
});

describe('metadataLabel（F24 透传零值域——展示层格式化）', () => {
  it('undefined → null（不渲染胶囊）', () => {
    expect(metadataLabel(undefined)).toBeNull();
  });
  it('字符串原样透出', () => {
    expect(metadataLabel('chatgpt')).toBe('chatgpt');
  });
  it('对象 → JSON 序列化（展示层不丢信息）', () => {
    expect(metadataLabel({ source: 'gemini', page: 2 })).toBe('{"source":"gemini","page":2}');
  });
});
