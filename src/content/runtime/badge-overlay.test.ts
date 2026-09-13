// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BADGE_CORNER_INSET_PX,
  BADGE_HIDE_GRACE_MS,
  BADGE_SHOW_DELAY_MS,
  createBadgeOverlay,
} from './badge-overlay';
import { defaultCornerFor } from '../capture/image';
import type { BadgeOverlayDeps, GrabOutcome } from './badge-overlay';

/**
 * badge-overlay 测试——copy-out 自 ready-svg badge-overlay.test.ts（R43/R44/R58/R59/R60
 * 矩阵全保留）。泛化适配（F17/F23 + §5 清单）：品牌/文案/aria 注入零缺省、
 * data 属性与 CSS 动画名 ns 化注入（testkit-*）、source 产品域透传 metadata、
 * 角位策略 cornerFor 注入（缺省右下角）。
 */

const BADGE_ATTR = 'data-testkit-badge';
const TEXTS = {
  ariaLabel: 'Convert with Ready SVG',
  fallbackText: 'Paste or download, then upload',
  tooLargeText: 'Image too large — download it, then upload',
};

/** 构造带抓图桩的 overlay；encode 注入固定值（jsdom Blob 异步读取在 fake timers 下
 *  不落定；编解码在 handoff 测试已全覆盖，此处测状态机）；source 默认 chatgpt
 *  （产品域值——角位策略随注入 cornerFor 分角，右下角测须显式传 gemini/undefined） */
const setup = (
  grabImpl: (img: HTMLImageElement) => Promise<GrabOutcome>,
  source?: unknown,
  over: Partial<BadgeOverlayDeps> = {},
) => {
  const calls = { grab: 0, send: [] as Array<{ base64: string; mime: string }> };
  const send = vi.fn(async () => ({ ok: true } as const));
  const grab = vi.fn(async (img: HTMLImageElement) => {
    calls.grab += 1;
    return grabImpl(img);
  });
  const overlay = createBadgeOverlay({
    doc: document,
    grab,
    send,
    badgeAttr: BADGE_ATTR,
    cssNames: { spin: 'testkit-spin', shake: 'testkit-shake' },
    ariaLabel: TEXTS.ariaLabel,
    fallbackText: TEXTS.fallbackText,
    tooLargeText: TEXTS.tooLargeText,
    branding: {
      badgeColor: '#f8b018',
      icons: {
        logo: '<path d="M28 88c14-34 30-34 36-18s14 34 36-26" fill="none" stroke="#181818" stroke-width="12" stroke-linecap="round"/>',
        lock: '<path d="M52 60v-12a12 12 0 0 1 24 0v12" fill="none" stroke="#181818" stroke-width="10" stroke-linecap="round"/><rect x="44" y="60" width="40" height="32" rx="6" fill="#181818"/>',
        check: '<path d="M36 66l20 20 36-44" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>',
      },
    },
    cornerFor: (s) => (s === 'chatgpt' ? 'top-right' : 'bottom-right'),
    source: source ?? 'chatgpt',
    encode: async () => 'AQID',
    ...over,
  });
  return { overlay, grab, send, calls };
};

const pngBytes = new Uint8Array([1, 2, 3]);
const pngGrab: GrabOutcome = {
  ok: true,
  blob: new Blob([pngBytes], { type: 'image/png' }),
  mime: 'image/png',
};

const badgeButton = () => {
  const host = document.querySelector(`div[${BADGE_ATTR}]`);
  expect(host).not.toBeNull();
  return host!.shadowRoot!.querySelector('button') as HTMLButtonElement;
};

describe('badge-overlay（R43/R44 徽标 Shadow DOM + 三段过渡 + 回退气泡）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('attach：宿主挂 body + shadow root + aria-label（注入产品文案），初态 idle；品牌色/CSS 动画名注入生效', () => {
    const { overlay } = setup(async () => pngGrab);
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    const host = document.querySelector(`div[${BADGE_ATTR}]`) as HTMLDivElement;
    expect(host.shadowRoot).not.toBeNull();
    const button = host.shadowRoot!.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe(TEXTS.ariaLabel);
    expect(overlay.stateOf(img)).toBe('idle');
    // §5 清单：Shadow 内 CSS 动画名 ns 化（kit.cssName 派生注入）
    const styleText = host.shadowRoot!.querySelector('style')!.textContent ?? '';
    expect(styleText).toContain('testkit-spin');
    expect(styleText).toContain('testkit-shake');
    // F23：品牌色注入（badgeColor 进按钮底色）
    expect(styleText).toContain('#f8b018');
  });

  it('点击链（R44）：idle → grabbing → ok（0.9s）→ idle；send 收 base64+mime+metadata（F24 透传）', async () => {
    const { overlay, send } = setup(async () => pngGrab);
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    const button = badgeButton();

    button.click();
    expect(overlay.stateOf(img)).toBe('grabbing');
    await vi.advanceTimersByTimeAsync(0);
    expect(overlay.stateOf(img)).toBe('ok');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      base64: 'AQID',
      mime: 'image/png',
      metadata: 'chatgpt',
    });

    await vi.advanceTimersByTimeAsync(900);
    expect(overlay.stateOf(img)).toBe('idle');
  });

  it('grabbing 防重入：连点只触发一次抓图', async () => {
    const { overlay, grab } = setup(async () => pngGrab);
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    const button = badgeButton();

    button.click();
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(grab).toHaveBeenCalledTimes(1);
  });

  it('抓取失败（R45 两路全败）：fail 态 + 回退气泡（注入文案），5s 自消回 idle', async () => {
    const { overlay } = setup(async () => ({ ok: false, reason: 'taint' }));
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    const button = badgeButton();

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(overlay.stateOf(img)).toBe('fail');
    const bubble = document
      .querySelector(`div[${BADGE_ATTR}]`)!
      .shadowRoot!.querySelector('[data-bubble]') as HTMLElement;
    expect(bubble.hidden).toBe(false);
    expect(bubble.textContent).toBe(TEXTS.fallbackText);

    await vi.advanceTimersByTimeAsync(5000);
    expect(overlay.stateOf(img)).toBe('idle');
    expect(bubble.hidden).toBe(true);
  });

  it('send 拒 too_large（R46 通道上限）：fail + 专属文案（注入）', async () => {
    const send = vi.fn(async () => ({ ok: false as const, reason: 'too_large' }));
    const overlay = createBadgeOverlay({
      doc: document,
      grab: async () => pngGrab,
      send,
      badgeAttr: BADGE_ATTR,
      cssNames: { spin: 'testkit-spin', shake: 'testkit-shake' },
      ariaLabel: TEXTS.ariaLabel,
      fallbackText: TEXTS.fallbackText,
      tooLargeText: TEXTS.tooLargeText,
      branding: {
        badgeColor: '#f8b018',
        icons: {
          logo: '<path d="M28 88"/>',
          lock: '<path d="M52 60"/>',
          check: '<path d="M36 66"/>',
        },
      },
      source: 'gemini',
      encode: async () => 'AQID',
    });
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    badgeButton().click();
    await vi.advanceTimersByTimeAsync(0);

    expect(overlay.stateOf(img)).toBe('fail');
    const bubble = document
      .querySelector(`div[${BADGE_ATTR}]`)!
      .shadowRoot!.querySelector('[data-bubble]') as HTMLElement;
    expect(bubble.textContent).toBe(TEXTS.tooLargeText);
  });

  it('R53 CDN 兜底直送变体 {ok:true,sent:true}：跳过 encode/send，直接 ok 态（0.9s → idle）', async () => {
    const send = vi.fn(async () => ({ ok: true } as const));
    const encode = vi.fn(async () => {
      throw new Error('sent 变体不应走到本地 encode');
    });
    const overlay = createBadgeOverlay({
      doc: document,
      grab: async () => ({ ok: true, sent: true }),
      send,
      badgeAttr: BADGE_ATTR,
      cssNames: { spin: 'testkit-spin', shake: 'testkit-shake' },
      ariaLabel: TEXTS.ariaLabel,
      fallbackText: TEXTS.fallbackText,
      tooLargeText: TEXTS.tooLargeText,
      branding: {
        badgeColor: '#f8b018',
        icons: { logo: '<path d="M28 88"/>', lock: '<path d="M52 60"/>', check: '<path d="M36 66"/>' },
      },
      source: 'gemini',
      encode,
    });
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    const button = badgeButton();

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(overlay.stateOf(img)).toBe('ok');
    expect(send).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(900);
    expect(overlay.stateOf(img)).toBe('idle');
  });

  it('detach：宿主移除、状态清；dispose 全清', () => {
    const { overlay } = setup(async () => pngGrab);
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(1);

    overlay.detach(img);
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0);
    expect(overlay.stateOf(img)).toBeUndefined();

    overlay.attach(img);
    overlay.attach(document.createElement('img'));
    overlay.dispose();
    expect(document.querySelectorAll(`div[${BADGE_ATTR}]`).length).toBe(0);
  });
});

describe('badge-overlay R58 悬停隐现（默认隐身，鼠标入图才现）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const badgeHost = () => document.querySelector(`div[${BADGE_ATTR}]`) as HTMLDivElement;
  const shown = () => badgeHost().hasAttribute('data-shown');
  const enter = (el: Element) =>
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  const leave = (el: Element, relatedTarget: EventTarget | null) =>
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, relatedTarget }));

  const attachImg = () => {
    const { overlay } = setup(async () => pngGrab);
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    return { overlay, img };
  };

  it('默认隐身（无 data-shown）；鼠标入图 120ms 后淡入，移出（80ms 宽限）后淡出', () => {
    const { img } = attachImg();
    expect(shown()).toBe(false); // R58 静息零侵入

    enter(img);
    expect(shown()).toBe(false); // 延迟窗内不现
    vi.advanceTimersByTime(BADGE_SHOW_DELAY_MS);
    expect(shown()).toBe(true);

    leave(img, document.body);
    expect(shown()).toBe(true); // 宽限窗内仍现（淡出过渡中）
    vi.advanceTimersByTime(BADGE_HIDE_GRACE_MS);
    expect(shown()).toBe(false);
  });

  it('快速掠过（<120ms 即移出）不闪现', () => {
    const { img } = attachImg();
    enter(img);
    vi.advanceTimersByTime(60);
    leave(img, document.body);
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(false); // 淡入 timer 被移出取消
  });

  it('徽标覆于图上（R59 几何在图内，命中测试归 button）：img mouseleave 落徽标（宿主内）→ 豁免不隐；徽标自身移出才隐', () => {
    const { img } = attachImg();
    enter(img);
    vi.advanceTimersByTime(BADGE_SHOW_DELAY_MS);
    expect(shown()).toBe(true);

    // img → 徽标 button（真实指针事件只达 button，宿主 pointer-events:none）：
    // relatedTarget 落宿主内 → 豁免，正要点的徽标不能被收走
    leave(img, badgeButton());
    vi.advanceTimersByTime(1000);
    expect(shown()).toBe(true);

    // 徽标 → 页面空白：隐
    leave(badgeButton(), document.body);
    vi.advanceTimersByTime(BADGE_HIDE_GRACE_MS);
    expect(shown()).toBe(false);
  });

  it('反馈态钉住：ok 窗内移出仍显示，回 idle 且光标不在才隐（反馈不中途消失）', async () => {
    const { overlay, img } = attachImg();
    enter(img);
    vi.advanceTimersByTime(BADGE_SHOW_DELAY_MS);
    badgeButton().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(overlay.stateOf(img)).toBe('ok');

    leave(img, document.body); // 反馈期间移出
    vi.advanceTimersByTimeAsync(500); // ok 0.9s 窗内
    expect(shown()).toBe(true); // 钉住

    await vi.advanceTimersByTimeAsync(600); // 过 0.9s 回 idle，光标不在
    expect(overlay.stateOf(img)).toBe('idle');
    expect(shown()).toBe(false);
  });

  it('键盘 focus 唤起（可达性）：focus 即现（无延迟），blur 后隐', () => {
    attachImg();
    const button = badgeButton();
    button.focus();
    expect(shown()).toBe(true);
    button.blur();
    vi.advanceTimersByTime(BADGE_HIDE_GRACE_MS);
    expect(shown()).toBe(false);
  });
});

describe('badge-overlay R59 内嵌定位 + 最顶层', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const badgeHost = () => document.querySelector(`div[${BADGE_ATTR}]`) as HTMLDivElement;

  /** rect 桩（jsdom getBoundingClientRect 恒 0）：400×300 @ (0,0) */
  const stubRect = (img: HTMLImageElement) => {
    Object.defineProperty(img, 'getBoundingClientRect', {
      value: () => ({
        x: 0, y: 0, top: 0, left: 0, width: 400, height: 300, right: 400, bottom: 300,
      }),
    });
  };

  it('徽标右/下缘各内缩 6px 落在图片矩形内（圆角矩形图片不探出边缘；缺省角位右下）', () => {
    const { overlay } = setup(async () => pngGrab, 'gemini');
    const img = document.createElement('img');
    stubRect(img);
    document.body.appendChild(img);
    overlay.attach(img);

    const host = badgeHost();
    // 宿主 24×24：右缘 = left + 24 ≤ 图片右缘 − 内缩；下缘同理
    expect(parseFloat(host.style.left) + 24).toBe(400 - BADGE_CORNER_INSET_PX);
    expect(parseFloat(host.style.top) + 24).toBe(300 - BADGE_CORNER_INSET_PX);
    expect(BADGE_CORNER_INSET_PX).toBe(6);
  });

  it('F17 角位策略注入：cornerFor 返回 top-right → 徽标右上角内嵌（上缘内缩 6px）；缺省策略恒右下角', () => {
    const { overlay } = setup(async () => pngGrab, 'chatgpt');
    const img = document.createElement('img');
    stubRect(img);
    document.body.appendChild(img);
    overlay.attach(img);

    const host = badgeHost();
    expect(defaultCornerFor()).toBe('bottom-right'); // 通用缺省（可覆盖）
    expect(parseFloat(host.style.left) + 24).toBe(400 - BADGE_CORNER_INSET_PX); // 右缘同右下角
    expect(parseFloat(host.style.top)).toBe(0 + BADGE_CORNER_INSET_PX); // 上缘 = 图顶 + 6
  });

  it('最顶层：显身时宿主重挂 body 末位——后到的同 max z-index 覆盖层压不住（R59 同值后到压制防御）', () => {
    const { overlay } = setup(async () => pngGrab);
    const img = document.createElement('img');
    document.body.appendChild(img);
    overlay.attach(img);
    const host = badgeHost();

    // 页面在我们之后渲染的同 z-index 覆盖层（同值 z-index 按 DOM 序后者胜）
    const rival = document.createElement('div');
    rival.id = 'rival-overlay';
    rival.style.cssText = 'position:fixed;z-index:2147483647;';
    document.body.appendChild(rival);
    expect(document.body.lastElementChild).toBe(rival); // 前置：rival 压在宿主上

    // 悬停显身 → 宿主被重挂末位夺回最顶层
    img.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    vi.advanceTimersByTime(BADGE_SHOW_DELAY_MS);
    expect(host.hasAttribute('data-shown')).toBe(true);
    expect(document.body.lastElementChild).toBe(host);
  });
});
