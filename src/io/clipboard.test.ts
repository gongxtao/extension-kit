// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { copyText } from './clipboard';

/**
 * copyText 测试——R116/R121 回退链矩阵。
 *
 * jsdom 缺省无 navigator.clipboard、无 document.execCommand 实现——各用例
 * 自行桩定：clipboard 用 Object.defineProperty（configurable 可删还原），
 * execCommand 直接实例属性覆盖（afterEach 删除还原原型）。
 */

function stubClipboard(impl: { writeText: (text: string) => Promise<void> }): void {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: impl,
    configurable: true,
  });
}

function stubExec(result: boolean | (() => never)): Mock {
  const impl = typeof result === 'function' ? result : () => result;
  const exec = vi.fn(impl as (...args: unknown[]) => boolean);
  Object.defineProperty(document, 'execCommand', {
    value: exec,
    configurable: true,
    writable: true,
  });
  return exec;
}

afterEach(() => {
  delete (window.navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand;
});

describe('copyText（R116：async clipboard → execCommand 回退链；R121 策略预检随码走）', () => {
  it('async clipboard 可用 → writeText 直达 true，不走 execCommand 兜底', async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText });
    const exec = stubExec(true);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(exec).not.toHaveBeenCalled();
  });

  it('async clipboard 被拒 → 回退 execCommand copy → true；辅助 textarea 用后即清', async () => {
    stubClipboard({
      writeText: vi.fn(async () => {
        throw new DOMException('Write permission denied', 'NotAllowedError');
      }),
    });
    const exec = stubExec(true);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('无 async clipboard（属性缺失）→ 直接落 execCommand 兜底', async () => {
    const exec = stubExec(true);
    await expect(copyText('hello')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('两层都败（execCommand 返 false）→ false（调用方静默不显 ✓）', async () => {
    stubClipboard({ writeText: vi.fn(async () => { throw new Error('no'); }) });
    stubExec(false);
    await expect(copyText('hello')).resolves.toBe(false);
  });

  it('execCommand 抛错也归 false（不炸调用方）', async () => {
    stubClipboard({ writeText: vi.fn(async () => { throw new Error('no'); }) });
    stubExec(() => {
      throw new Error('boom');
    });
    await expect(copyText('hello')).resolves.toBe(false);
  });

  it('R121 策略预检：文档权限策略不含 clipboard-write → 绝不触碰被封锁的 navigator.clipboard getter（Chrome 访问瞬间即打 violation），直接 execCommand', async () => {
    const doc = document as Document & {
      permissionsPolicy?: { allowedFeatures?: () => string[] };
    };
    doc.permissionsPolicy = { allowedFeatures: () => ['camera'] };
    const clipboardGetter = vi.fn(() => ({ writeText: vi.fn(async () => {}) }));
    Object.defineProperty(window.navigator, 'clipboard', { get: clipboardGetter, configurable: true });
    const exec = stubExec(true);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(clipboardGetter).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith('copy');
    delete doc.permissionsPolicy;
  });

  it('R121 策略预检：policy 含 clipboard-write → 照走 async 直达（委派生效形态不退化）', async () => {
    const doc = document as Document & {
      permissionsPolicy?: { allowedFeatures?: () => string[] };
    };
    doc.permissionsPolicy = { allowedFeatures: () => ['clipboard-write'] };
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText });
    const exec = stubExec(true);

    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(exec).not.toHaveBeenCalled();
    delete doc.permissionsPolicy;
  });

  it('R121 无 policy API（旧上下文/jsdom 缺省）→ 按允许处理，行为与现状一致', async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard({ writeText });
    stubExec(true);
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalled();
  });

  it("泛化缝（§5 清单 data 属性 ns 化）：传入 copyAttr → 辅助 textarea 带 data 属性（如 kit.dataAttr('copy')）；不传 → 不设属性（框架零缺省）", async () => {
    stubClipboard({
      writeText: vi.fn(async () => {
        throw new Error('fallback');
      }),
    });
    stubExec(true);

    await copyText('hello', 'data-testkit-copy');
    const ta = document.querySelector('textarea[data-testkit-copy]');
    expect(ta).toBeNull(); // copy 后 textarea 已清——此处断言「过程中曾带属性」改由下方 spying

    // 再走一次并在 execCommand 时刻检查 DOM（exec 调用时 textarea 还在）
    const exec = stubExec(true);
    exec.mockImplementation(() => {
      expect(document.querySelector('textarea[data-testkit-copy]')).not.toBeNull();
      return true;
    });
    await expect(copyText('hello', 'data-testkit-copy')).resolves.toBe(true);

    // 不传 copyAttr：execCommand 时刻无该属性
    const exec2 = stubExec(true);
    exec2.mockImplementation(() => {
      expect(document.querySelector('textarea[data-testkit-copy]')).toBeNull();
      return true;
    });
    await expect(copyText('hello')).resolves.toBe(true);
  });
});
