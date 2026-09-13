/**
 * clipboard —— 剪贴板写回退链（源 R116 + 复烟修复 R121 随码带走）
 *
 * 面板是嵌在宿主页里的跨源 iframe——clipboard-write 权限策略默认 allowlist
 * 为顶层同源，navigator.clipboard 在页内面板形态被拒。链路：
 *
 *   0. R121 策略预检：document.permissionsPolicy/featurePolicy.allowedFeatures()
 *      不含 clipboard-write 时**绝不触碰** navigator.clipboard——Chrome 在 getter
 *      被访问的瞬间即向控制台打 "Permissions policy violation" 错误（用户实测
 *      复现），预检后直接落 execCommand，控制台零噪音
 *   1. navigator.clipboard.writeText（直开 panel.html / allow 委派生效时直达）
 *   2. 失败回退 document.execCommand('copy')——隐藏 textarea + select，用户
 *      激活内可用、不受 permissions policy 管（点复制图标即用户激活）
 *
 * 两层都败 → false（调用方静默不显 ✓，沿 R23 口径不弹错）。
 *
 * 泛化缝（§5 清单 data 属性 ns 化）：源写死 data-rsvg-copy 标记 → copyAttr
 * 参数注入（调用方传 kit.dataAttr('copy')）；不传不设属性（框架零缺省）。
 */

/** R121：当前文档是否允许 clipboard-write（policy API 缺失按允许处理，行为不回退） */
const clipboardWriteAllowed = (): boolean => {
  try {
    const doc = document as Document & {
      permissionsPolicy?: { allowedFeatures?: () => string[] };
      featurePolicy?: { allowedFeatures?: () => string[] };
    };
    const allowed =
      doc.permissionsPolicy?.allowedFeatures?.() ?? doc.featurePolicy?.allowedFeatures?.();
    return !Array.isArray(allowed) || allowed.includes('clipboard-write');
  } catch {
    return true;
  }
};

export async function copyText(text: string, copyAttr?: string): Promise<boolean> {
  if (clipboardWriteAllowed()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 落 execCommand 兜底
    }
  }

  let ta: HTMLTextAreaElement | null = null;
  try {
    ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    if (copyAttr !== undefined) ta.setAttribute(copyAttr, '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta?.remove();
  }
}
