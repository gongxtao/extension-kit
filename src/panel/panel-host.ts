/**
 * panel-host —— 页内 iframe 面板宿主（源 feat-011，R87–R90 / R96–R98；近原样 copy-out）
 *
 * Monica 式架构：content script 在页面 DOM 挂 Shadow DOM 宿主（fixed 右缘、
 * 100vh、最顶层——R59 body 末位顶层口径），内嵌 chrome-extension://…/panel.html
 * （WAR 已在 manifest 声明，R91——漏一项 iframe 白屏）。
 *
 * 宽度（R96）：默认 460px，shadow 内左缘手柄可拖 320–720px（Pointer Events +
 * setPointerCapture，move 实时改宽、挤压随宽，up 才落盘）；宽度经 panel-prefs
 * （storage.local）持久化并跨标签页即时同步。
 *
 * 显示模式（R85）：squeeze 默认——宿主 `<html>` margin-right 挤压页面回流
 * （记原值，hide/destroy/切模式必还原——清理纪律 F22）；overlay——不动页面浮层。
 *
 * 关闭径（R88）：面板页 X 按钮 postMessage {kind:${ns}-close-panel} → 本宿主隐藏
 * （iframe 扩展源与页面间唯一轻通路）。
 *
 * 泛化点（§3 panel 行 + F12/F23 + §5 清单）：
 * - DOM id / close 消息 kind / resize data 属性 → deps 注入（kit.domId / kit.kind /
 *   kit.dataAttr 派生——ns 一根线；源徽标宿主同款 data 属性纪律）
 * - panel.html 地址可配（getPanelUrl 源本 DI）
 * - 手柄 aria-label 产品文案注入零缺省（F23——不传不挂属性）
 * - 宿主边线样式可覆盖（通用视觉缺省 = 源 R98 的 1px 极浅线）
 *
 * 样式豁免沿 R43 badge-overlay 先例：注入宿主物理上进不了面板的 tailwind 构建，
 * inline style 自包含。
 */

import type { PanelMode } from './panel-prefs';

export {
  PANEL_DEFAULT_WIDTH_PX,
  PANEL_MAX_WIDTH_PX,
  PANEL_MIN_WIDTH_PX,
} from './panel-prefs';
import {
  PANEL_DEFAULT_WIDTH_PX,
  PANEL_MAX_WIDTH_PX,
  PANEL_MIN_WIDTH_PX,
} from './panel-prefs';

export interface PanelPrefsView {
  get(): Promise<PanelMode>;
  onChange(cb: (mode: PanelMode) => void): () => void;
  getWidth(): Promise<number>;
  setWidth(px: number): Promise<void>;
  onWidthChange(cb: (px: number) => void): () => void;
}

export interface PanelHostDeps {
  /** 面板页地址（chrome.runtime.getURL('panel.html')——DI 供测试；地址可配） */
  getPanelUrl(): string;
  prefs: PanelPrefsView;
  /** DOM 宿主 id（kit.domId('panel-host') 派生——§5 ns 一根线） */
  domId: string;
  /** 关闭消息 kind（kit.kind('close-panel') 派生） */
  closeMessage: string;
  /** 拖拽手柄 data 属性（kit.dataAttr('resize') 派生） */
  resizeAttr: string;
  /** 手柄 aria-label（产品文案注入零缺省——F23；不传不挂属性） */
  ariaLabel?: string;
  /** 宿主左缘边线样式（通用视觉缺省可覆盖——F23；缺省 = 源 R98 的 1px 极浅线） */
  borderStyle?: string;
}

export interface PanelHost {
  toggle(): void;
  show(): void;
  hide(): void;
  isOpen(): boolean;
  destroy(): void;
}

/** 源 R98 边线视觉缺省（用户两轮修订：去影留线 → 线更浅） */
const DEFAULT_BORDER_STYLE = '1px solid rgba(0,0,0,.05)';

export function createPanelHost(deps: PanelHostDeps): PanelHost {
  let open = false;
  let mode: PanelMode = 'squeeze'; // R85 缺省；构造即异步水合真实偏好
  let width = PANEL_DEFAULT_WIDTH_PX; // R96 缺省；构造即异步水合持久宽
  let host: HTMLDivElement | null = null;
  let prevMarginRight: string | null = null;
  let offMode: (() => void) | null = null;
  let offWidth: (() => void) | null = null;
  let onMessage: ((event: MessageEvent) => void) | null = null;

  void deps.prefs.get().then((m) => {
    mode = m;
  });
  void deps.prefs.getWidth().then((w) => {
    width = w;
  });

  const applySqueeze = (): void => {
    if (mode !== 'squeeze') return;
    if (prevMarginRight === null) {
      prevMarginRight = document.documentElement.style.marginRight;
    }
    document.documentElement.style.marginRight = `${width}px`;
  };

  const releaseSqueeze = (): void => {
    if (prevMarginRight === null) return;
    document.documentElement.style.marginRight = prevMarginRight;
    prevMarginRight = null;
  };

  /** 宽度落地：宿主盒 + 挤压态同步（拖拽 move 高频路径直调） */
  const applyWidth = (): void => {
    if (host !== null) host.style.width = `${width}px`;
    if (open && mode === 'squeeze' && prevMarginRight !== null) {
      document.documentElement.style.marginRight = `${width}px`;
    }
  };

  /** R96 拖拽目标宽：右缘贴边 → 宽 = viewport - clientX；夹 [320,720] 且不吞满屏 */
  const draggedWidth = (clientX: number): number => {
    const viewportCap = Math.max(PANEL_MIN_WIDTH_PX, window.innerWidth - 64);
    return Math.round(
      Math.min(viewportCap, Math.max(PANEL_MIN_WIDTH_PX, Math.min(PANEL_MAX_WIDTH_PX, window.innerWidth - clientX))),
    );
  };

  const mountHandle = (shadow: ShadowRoot): void => {
    const handle = document.createElement('div');
    handle.setAttribute(deps.resizeAttr, '');
    if (deps.ariaLabel !== undefined) handle.setAttribute('aria-label', deps.ariaLabel);
    handle.style.cssText = [
      'position:absolute',
      'top:0',
      'left:-3px', // 负偏移居中在宿主左缘线上（总热区 6px，内外各半）
      'width:6px',
      'height:100%',
      'cursor:col-resize',
      'z-index:10',
      // R98 默认可见淡线（可发现性——全透明则「这条线能拖」无从察觉）：6px 热区中缝 2px 淡灰
      'background:linear-gradient(90deg,transparent 0 2px,rgba(0,0,0,.12) 2px 4px,transparent 4px 6px)',
      'transition:background .15s',
    ].join(';');
    const hint = document.createElement('style'); // hover/active 视觉提示（shadow 内自包含）
    hint.textContent =
      `[${deps.resizeAttr}]:hover,[${deps.resizeAttr}]:active{background:rgba(37,99,235,.5);cursor:col-resize}`;
    shadow.appendChild(hint);

    let dragging = false;
    handle.addEventListener('pointerdown', (event) => {
      dragging = true;
      event.preventDefault(); // 防拖选页面文本
      try {
        handle.setPointerCapture(event.pointerId); // move/up 全收于手柄——iframe 不吃事件
      } catch {
        /* jsdom/老引擎无活跃指针：捕获失败仍可拖（退化为元素内跟踪） */
      }
    });
    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      width = draggedWidth(event.clientX);
      applyWidth();
    });
    const endDrag = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
        /* 同上 */
      }
      void deps.prefs.setWidth(width); // up 才落盘（move 高频不写 storage）
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    shadow.appendChild(handle);
  };

  const mount = (): void => {
    if (host !== null) return;
    host = document.createElement('div');
    host.id = deps.domId;
    host.style.cssText = [
      'position:fixed',
      'top:0',
      'right:0',
      `width:${width}px`,
      'height:100vh',
      'z-index:2147483647',
      'box-sizing:border-box', // R98：分隔线画在宽度内——宽度语义（挤压/拖拽值）不变
      // R98 左缘层次感（Monica 参考；用户两轮修订：去影留线 → 线更浅）——通用视觉缺省可覆盖
      `border-left:${deps.borderStyle ?? DEFAULT_BORDER_STYLE}`,
    ].join(';');
    const shadow = host.attachShadow({ mode: 'open' }); // open：测试与诊断可入（隔离靠宿主唯一 id）
    const iframe = document.createElement('iframe');
    iframe.src = deps.getPanelUrl();
    iframe.style.cssText = 'display:block;width:100%;height:100%;border:0;';
    // R116（feat-015）：跨源 iframe 默认无 clipboard-write（policy allowlist=顶层同源），
    // 面板内 Copy 会静默被拒——显式委派 + /io clipboard execCommand 兜底双保险
    iframe.setAttribute('allow', 'clipboard-write');
    shadow.appendChild(iframe);
    mountHandle(shadow);
    document.body.appendChild(host); // body 末位（R59 同值后到之上）
  };

  const unmount = (): void => {
    releaseSqueeze();
    host?.remove();
    host = null;
  };

  const show = (): void => {
    if (open) return;
    open = true;
    mount();
    applySqueeze();
    if (onMessage === null) {
      onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (typeof data === 'object' && data !== null && (data as { kind?: unknown }).kind === deps.closeMessage) {
          hide();
        }
      };
      window.addEventListener('message', onMessage);
    }
  };

  const hide = (): void => {
    if (!open) return;
    open = false;
    unmount();
    if (onMessage !== null) {
      window.removeEventListener('message', onMessage);
      onMessage = null;
    }
  };

  offMode = deps.prefs.onChange((m) => {
    const wasOpen = open;
    if (wasOpen) {
      releaseSqueeze(); // 模式切换先撤旧挤压（overlay 或换值都从干净态起步）
    }
    mode = m;
    if (wasOpen) {
      applySqueeze();
    }
  });

  offWidth = deps.prefs.onWidthChange((px) => {
    width = px; // R96 跨标签页/设置件改宽 → 本页即时应用
    applyWidth();
  });

  return {
    toggle() {
      if (open) hide();
      else show();
    },
    show,
    hide,
    isOpen: () => open,
    destroy() {
      hide();
      offMode?.();
      offMode = null;
      offWidth?.();
      offWidth = null;
    },
  };
}
