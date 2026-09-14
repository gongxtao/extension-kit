// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPanelHost,
  PANEL_DEFAULT_WIDTH_PX,
  PANEL_MAX_WIDTH_PX,
  PANEL_MIN_WIDTH_PX,
} from './panel-host';
import type { PanelHostDeps } from './panel-host';
import type { PanelMode } from './panel-prefs';

/**
 * panel-host 测试——R87–R98 矩阵，
 * ns='testkit' 参数化（§5 清单：DOM id / close 消息 kind / data 属性）+
 * F23 新增断言（aria-label 零缺省、边线样式可覆盖）。
 */

const PANEL_URL = 'chrome-extension://abc/panel.html';
const HOST_ID = 'testkit-panel-host';
const CLOSE_KIND = 'testkit-close-panel';
const RESIZE_ATTR = 'data-testkit-resize';

/** 组 deps：ns 化名字注入 + prefs 假件（over 可覆写任意缝） */
function makeDeps(
  prefs: PanelHostDeps['prefs'],
  over: Partial<PanelHostDeps> = {},
): PanelHostDeps {
  return {
    getPanelUrl: () => PANEL_URL,
    prefs,
    domId: HOST_ID,
    closeMessage: CLOSE_KIND,
    resizeAttr: RESIZE_ATTR,
    ...over,
  };
}

function fakePrefs(initial: PanelMode = 'squeeze', initialWidth = PANEL_DEFAULT_WIDTH_PX) {
  let mode = initial;
  let width = initialWidth;
  const modeListeners = new Set<(m: PanelMode) => void>();
  const widthListeners = new Set<(px: number) => void>();
  const setWidthCalls: number[] = [];
  return {
    prefs: {
      get: async () => mode,
      set: async (m: PanelMode) => {
        mode = m;
      },
      onChange: (cb: (m: PanelMode) => void) => {
        modeListeners.add(cb);
        return () => modeListeners.delete(cb);
      },
      getWidth: async () => width,
      setWidth: async (px: number) => {
        width = px;
        setWidthCalls.push(px);
      },
      onWidthChange: (cb: (px: number) => void) => {
        widthListeners.add(cb);
        return () => widthListeners.delete(cb);
      },
    },
    emitMode: (m: PanelMode) => {
      mode = m;
      for (const l of [...modeListeners]) l(m);
    },
    emitWidth: (px: number) => {
      width = px;
      for (const l of [...widthListeners]) l(px);
    },
    setWidthCalls,
  };
}

function hostEl(): HTMLElement | null {
  return document.getElementById(HOST_ID);
}

const cleanup = () => {
  document.getElementById(HOST_ID)?.remove();
  document.documentElement.style.marginRight = '';
};

afterEach(cleanup);

describe('panel-host（R87–R90：页内 iframe 面板宿主）', () => {
  it('show()：body 末位挂宿主（R59 顶层口径）+ Shadow DOM iframe 指向面板页；宿主盒 fixed 右缘默认宽 高 100vh 顶层；宿主 id = 注入 domId（ns 化）', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    const el = hostEl();
    expect(el).not.toBeNull();
    expect(document.body.lastElementChild).toBe(el); // body 末位 = 同值后到之上
    expect(el?.shadowRoot?.querySelector('iframe')?.getAttribute('src')).toBe(PANEL_URL);
    // R116（feat-015）：跨源 iframe 需显式委派 clipboard-write（面板内 Copy 失效修复层 a）
    expect(el?.shadowRoot?.querySelector('iframe')?.getAttribute('allow')).toBe('clipboard-write');
    const style = (el as HTMLElement).style;
    expect(style.position).toBe('fixed');
    expect(style.right).toBe('0px');
    expect(style.width).toBe(`${PANEL_DEFAULT_WIDTH_PX}px`);
    expect(style.zIndex).toBe('2147483647');
  });

  it('挤压默认（R85/R89）：squeeze 模式 show → html margin-right=默认宽；hide → 还原原值（清理纪律）', () => {
    document.documentElement.style.marginRight = '12px'; // 页面原有值必须被尊重还原
    const host = createPanelHost(makeDeps(fakePrefs('squeeze').prefs));
    host.show();
    expect(document.documentElement.style.marginRight).toBe(`${PANEL_DEFAULT_WIDTH_PX}px`);
    host.hide();
    expect(document.documentElement.style.marginRight).toBe('12px');
  });

  it('覆盖模式（R85）：overlay 不动页面 margin；模式切换即时生效（开面板中 squeeze→overlay 撤挤压 / 回挤压）', async () => {
    const { prefs, emitMode } = fakePrefs('overlay');
    const host = createPanelHost(makeDeps(prefs));
    await new Promise((r) => setTimeout(r, 0)); // 冲刷初始水合微任务（真实用径：点击远晚于构造）
    host.show();
    expect(document.documentElement.style.marginRight).toBe(''); // overlay 不挤压

    emitMode('squeeze');
    expect(document.documentElement.style.marginRight).toBe(`${PANEL_DEFAULT_WIDTH_PX}px`); // 即时挤压

    emitMode('overlay');
    expect(document.documentElement.style.marginRight).toBe(''); // 即时撤回
  });

  it('toggle 幂等：重复 show 单实例（不叠宿主）；toggle 开↔关；isOpen 状态', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    host.show();
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);

    expect(host.isOpen()).toBe(true);
    host.toggle();
    expect(host.isOpen()).toBe(false);
    expect(hostEl()).toBeNull();
    host.toggle();
    expect(host.isOpen()).toBe(true);
  });

  it('R88 关闭径：iframe 内 postMessage {kind: 注入 closeMessage} → 宿主隐藏（面板页 X 按钮通路）', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    window.dispatchEvent(new MessageEvent('message', { data: { kind: CLOSE_KIND } }));
    expect(host.isOpen()).toBe(false);
    expect(hostEl()).toBeNull();
    expect(document.documentElement.style.marginRight).toBe('');
    // 关闭后消息监听随卸（重复消息无害）
    window.dispatchEvent(new MessageEvent('message', { data: { kind: CLOSE_KIND } }));
    expect(host.isOpen()).toBe(false);
  });

  it('杂讯不误触：他 kind（含旧 kind 字面量）/ 非对象 data 不影响开面板态', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'legacy-close-panel' } }));
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'testkit-other' } }));
    window.dispatchEvent(new MessageEvent('message', { data: 'plain string' }));
    expect(host.isOpen()).toBe(true);
  });

  it('destroy：隐藏宿主 + 还原 margin + 退订模式监听（后续 emit 不再复活）——F22 清理纪律', () => {
    const { prefs, emitMode } = fakePrefs('squeeze');
    const host = createPanelHost(makeDeps(prefs));
    host.show();
    host.destroy();
    expect(hostEl()).toBeNull();
    expect(document.documentElement.style.marginRight).toBe('');

    emitMode('overlay'); // 已退订——不抛错不复活
    expect(hostEl()).toBeNull();
  });

  it('初始模式异步水合：构造即读 prefs，水合落定后首 show 即 overlay（无闪挤压）', async () => {
    const { prefs } = fakePrefs('overlay');
    const host = createPanelHost(makeDeps(prefs));
    await new Promise((r) => setTimeout(r, 0)); // 水合微任务冲刷
    host.show();
    expect(document.documentElement.style.marginRight).toBe(''); // overlay 已就位，不闪挤压
  });

  it('F23 aria-label 零缺省：传产品文案 → 手柄挂 aria-label；不传 → 不挂属性', () => {
    const labeled = createPanelHost(makeDeps(fakePrefs().prefs, { ariaLabel: 'Resize panel' }));
    labeled.show();
    expect(hostEl()?.shadowRoot?.querySelector<HTMLElement>(`[${RESIZE_ATTR}]`)?.getAttribute('aria-label')).toBe('Resize panel');
    labeled.hide();

    const unlabeled = createPanelHost(makeDeps(fakePrefs().prefs));
    unlabeled.show();
    expect(hostEl()?.shadowRoot?.querySelector<HTMLElement>(`[${RESIZE_ATTR}]`)?.getAttribute('aria-label')).toBeNull();
  });

  it('F23 边线样式可覆盖：不传 → 源 R98 通用缺省 1px 极浅线；传自定义 → 完整覆盖', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    expect(hostEl()?.style.borderLeft).toBe('1px solid rgba(0, 0, 0, 0.05)');
    host.hide();

    const custom = createPanelHost(makeDeps(fakePrefs().prefs, { borderStyle: '2px solid #f8b018' }));
    custom.show();
    expect(hostEl()?.style.borderLeft).toBe('2px solid rgb(248, 176, 24)');
  });
});

describe('panel-host 宽度（R96：左缘拖拽调宽 + 持久化 + 跨标签同步）', () => {
  /** jsdom 未暴露 PointerEvent——MouseEvent 兜底 + pointerId 附加属性 */
  const pointerEvent = (
    type: string,
    opts: { clientX: number; clientY?: number; pointerId?: number },
  ): Event => {
    const { pointerId = 1, clientX, clientY = 300 } = opts;
    if (typeof PointerEvent === 'function') {
      return new PointerEvent(type, { pointerId, clientX, clientY, bubbles: true });
    }
    const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    return event;
  };

  const drag = (from: number, to: number): void => {
    const handle = hostEl()?.shadowRoot?.querySelector<HTMLElement>(`[${RESIZE_ATTR}]`);
    if (handle === null || handle === undefined) throw new Error('resize handle not mounted');
    handle.dispatchEvent(pointerEvent('pointerdown', { clientX: from }));
    handle.dispatchEvent(pointerEvent('pointermove', { clientX: to }));
    handle.dispatchEvent(pointerEvent('pointerup', { clientX: to }));
  };

  it('show()：shadow 内挂左缘拖拽手柄（col-resize 光标 + 视觉提示态）', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    const handle = hostEl()?.shadowRoot?.querySelector<HTMLElement>(`[${RESIZE_ATTR}]`);
    expect(handle).not.toBeNull();
    expect(handle?.style.cursor).toBe('col-resize');
    expect(handle?.style.position).toBe('absolute');
  });

  it('R98 左缘层次感：宿主恰 1px 极浅分隔线 + 无阴影 + border-box（宽度语义不变）', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    const style = hostEl()?.style;
    expect(style?.boxSizing).toBe('border-box'); // 分隔线不外扩宽度（460 含 1px 线）
    expect(style?.borderLeft).toBe('1px solid rgba(0, 0, 0, 0.05)'); // 用户裁「更浅更细」
    expect(style?.boxShadow).toBe(''); // 用户裁「层次感太强」——阴影整体退役
  });

  it('R98 手柄默认可发现：淡灰细线提示（非全透明）；hover/active 蓝色高亮样式在册', () => {
    const host = createPanelHost(makeDeps(fakePrefs().prefs));
    host.show();
    const root = hostEl()?.shadowRoot;
    const handle = root?.querySelector<HTMLElement>(`[${RESIZE_ATTR}]`);
    expect(handle?.style.background).toContain('rgba(0,0,0,.12)'); // 中缝 2px 淡线——「这条线可拖」
    expect(root?.querySelector('style')?.textContent).toContain('col-resize');
    expect(root?.querySelector('style')?.textContent).toContain('rgba(37,99,235,.5)'); // hover 蓝块
  });

  it('拖拽全链：pointerdown→move→up 宿主实时变宽 + squeeze margin 同步 + up 时 setWidth 持久化一次', () => {
    const fake = fakePrefs('squeeze');
    const host = createPanelHost(makeDeps(fake.prefs));
    host.show();
    const vw = window.innerWidth; // jsdom 1024：面板左缘 x = vw - 460
    drag(vw - 460, vw - 560); // 左移 100px → 宽 560

    expect(hostEl()?.style.width).toBe('560px');
    expect(document.documentElement.style.marginRight).toBe('560px'); // 挤压随宽
    expect(fake.setWidthCalls).toEqual([560]); // up 才持久化（move 高频不写盘）
  });

  it('clamp：拖过界夹 [320, 720]；拖动后 hide→show 重挂用拖后宽', () => {
    const fake = fakePrefs('squeeze');
    const host = createPanelHost(makeDeps(fake.prefs));
    host.show();
    const vw = window.innerWidth;

    drag(vw - 460, 100); // 意图拖到 ~924px 宽 → 夹 720
    expect(hostEl()?.style.width).toBe(`${PANEL_MAX_WIDTH_PX}px`);
    expect(fake.setWidthCalls).toEqual([PANEL_MAX_WIDTH_PX]);

    drag(vw - 720, 900); // 意图收到 ~124px → 夹 320
    expect(hostEl()?.style.width).toBe(`${PANEL_MIN_WIDTH_PX}px`);

    host.hide();
    host.show();
    expect(hostEl()?.style.width).toBe(`${PANEL_MIN_WIDTH_PX}px`); // 重挂不回默认
  });

  it('overlay 拖拽同样变宽但不动页面 margin', async () => {
    const host = createPanelHost(makeDeps(fakePrefs('overlay').prefs));
    await new Promise((r) => setTimeout(r, 0)); // 冲刷初始水合（真实用径：拖拽远晚于构造）
    host.show();
    const vw = window.innerWidth;
    drag(vw - 460, vw - 640);
    expect(hostEl()?.style.width).toBe('640px');
    expect(document.documentElement.style.marginRight).toBe('');
  });

  it('宽度水合：构造读 getWidth，落定后 show 用持久宽（无闪默认宽）', async () => {
    const fake = fakePrefs('squeeze', 520);
    const host = createPanelHost(makeDeps(fake.prefs));
    await new Promise((r) => setTimeout(r, 0));
    host.show();
    expect(hostEl()?.style.width).toBe('520px');
    expect(document.documentElement.style.marginRight).toBe('520px');
  });

  it('跨标签同步：开面板中他页改宽 → onWidthChange 即时应用本页（宿主 + squeeze）', () => {
    const fake = fakePrefs('squeeze');
    const host = createPanelHost(makeDeps(fake.prefs));
    host.show();
    fake.emitWidth(600);
    expect(hostEl()?.style.width).toBe('600px');
    expect(document.documentElement.style.marginRight).toBe('600px');
  });

  it('destroy 退订宽度监听：后续 emitWidth 不复活不抛错', () => {
    const fake = fakePrefs('squeeze');
    const host = createPanelHost(makeDeps(fake.prefs));
    host.show();
    host.destroy();
    fake.emitWidth(640);
    expect(hostEl()).toBeNull();
  });
});
