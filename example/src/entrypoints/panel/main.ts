import { kit } from '../../lib/kit';

// iframe 消息：${ns}-close-panel（源 panel-host.ts close-panel 语义）
document.getElementById('close')?.addEventListener('click', () => {
  window.parent.postMessage({ kind: kit.kind('close-panel') }, '*');
});
