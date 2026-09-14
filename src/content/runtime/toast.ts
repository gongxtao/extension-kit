/**
 * runtime/toast —— 页面角回退 toast（右键链失败反馈；Shadow DOM 隔离
 * 同 R43 豁免口径，F27 页内注入纪律）。data-${ns}-toast 属性注入（§5 清单）。
 */

const TOAST_TTL_MS = 5000;

export function showPageToast(doc: Document, text: string, toastAttr: string): () => void {
  const host = doc.createElement('div');
  host.setAttribute(toastAttr, '');
  host.style.cssText = 'position:fixed;right:0;bottom:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `
:host { all: initial; }
[data-bubble] {
  position: fixed; right: 16px; bottom: 16px; max-width: 260px;
  background: #fff; color: #181818; font: 500 12px/1.4 system-ui, sans-serif;
  padding: 8px 12px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.25);
}
`;
  const bubble = doc.createElement('div');
  bubble.setAttribute('data-bubble', '');
  bubble.textContent = text;
  root.append(style, bubble);
  doc.body.appendChild(host);
  const timer = window.setTimeout(() => host.remove(), TOAST_TTL_MS);
  return () => {
    window.clearTimeout(timer);
    host.remove();
  };
}
