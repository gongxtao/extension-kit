/**
 * runtime/badge-overlay —— 页面徽标浮层（
 * R43/R44/R58/R59/R60——三态机/悬停隐现/顶层重挂）
 *
 * R43 形态：宿主 div 挂 body（文档绝对坐标，随 scroll/resize 更新），徽标本体
 * 住 Shadow DOM——样式自包含（R43 Tailwind-only 豁免先例：注入宿主页面的元素
 * 必须作用域隔离，F27 页内注入纪律）。
 *
 * R44 三段过渡：idle → 点击 grabbing（锁形转圈）→ ok（绿底 ✓ 0.9s）→ 回落 idle；
 * 失败 fail（抖动）+ 回退气泡 5s 自消。
 *
 * R58 悬停隐现：徽标默认隐身——移入图片约 120ms 后淡入半透明，移出（80ms 宽限）
 * 淡出；反馈态钉住显示；键盘 focus 同样唤起。
 *
 * R59 内嵌定位 + 最顶层：徽标落在图片矩形内（右/下缘内缩 6px）；显身时宿主重挂
 * body 末位（同值后到元素压制防御，R59——z-index 2147483647）。
 *
 * 泛化点（F17/F23 + §5 清单）：
 * - 宿主标记属性 → badgeAttr 注入（kit.dataAttr('badge')）；
 * - Shadow 内 CSS 动画名 → cssNames 注入（kit.cssName 派生）；
 * - aria-label / 回退双文案 / 品牌色 / 图形 path → 产品注入零缺省（F23 对账单：
 *   badge-overlay.ts:31-32 文案 + :83-90 LOGO/LOCK path + 品牌黄）；
 * - source 站点值域归产品（F17）：source?: unknown 透传 metadata + cornerFor 输入
 *   （角位策略注入，通用缺省右下角）。
 */

import { blobToBase64 } from './handoff';
import { defaultCornerFor, type BadgeCorner } from '../capture/image';

/** R58 悬停隐现时序：入图 120ms 淡入（快速掠过不闪现）／移出 80ms 宽限淡出 */
export const BADGE_SHOW_DELAY_MS = 120;
export const BADGE_HIDE_GRACE_MS = 80;

/** R59 右下角内缩量：徽标整体落在图片矩形内（右/下缘各内缩 6px）——圆角矩形
 *  展示形态不探出边缘。6px 对圆角半径 r ≤ ~20px 恰好让徽标直角避开圆弧 */
export const BADGE_CORNER_INSET_PX = 6;

export type BadgeState = 'idle' | 'grabbing' | 'ok' | 'fail';

/** R53 CDN 兜底直送：grab 内部已托 background 写 store（SW 扩展权限抓取成功），
 *  本地无需 encode/send——直接落 ok 态 */
export interface GrabSent {
  ok: true;
  sent: true;
}

export type GrabOutcome = import('../capture/types').ExtractResult | GrabSent;

/** 品牌资产注入（F23——零缺省）：图形 path 与徽标底色 */
export interface BadgeBranding {
  /** 徽标底色（源品牌黄 #f8b018 归产品） */
  badgeColor: string;
  /** 三态图形（svg innerHTML，含各自 stroke/fill 配色） */
  icons: { logo: string; lock: string; check: string };
}

export interface BadgeOverlayDeps {
  doc: Document;
  grab(img: HTMLImageElement): Promise<GrabOutcome>;
  send(payload: { base64: string; mime: string; metadata?: unknown }): Promise<
    { ok: true } | { ok: false; reason: string }
  >;
  /** blob→base64（缺省 blobToBase64；测试注入——jsdom Blob 的异步读取在 fake
   *  timers 下不落定，编解码本身已在 handoff 测试全覆盖） */
  encode?(blob: Blob): Promise<string>;
  /** 来源值（产品自有域，F17/F24）——透传 metadata + cornerFor 输入；undefined 无来源 */
  source?: unknown;
  /** 角位策略注入（F17；缺省右下角） */
  cornerFor?(source: unknown): BadgeCorner;
  /** data-${ns}-badge 属性（kit.dataAttr('badge') 派生——§5 清单） */
  badgeAttr: string;
  /** Shadow 内 CSS 动画名（kit.cssName('spin'/'shake') 派生——§5 清单） */
  cssNames: { spin: string; shake: string };
  /** 徽标 aria-label（产品文案注入零缺省——F23 对账单 badge-overlay aria） */
  ariaLabel: string;
  /** 抓取失败回退文案（产品注入零缺省——F23 对账单 FALLBACK_TEXT） */
  fallbackText: string;
  /** 超限专属气泡文案（产品注入零缺省——F23 对账单 TOO_LARGE_TEXT） */
  tooLargeText: string;
  /** 品牌资产（零缺省——F23） */
  branding: BadgeBranding;
}

export interface BadgeOverlay {
  attach(img: HTMLImageElement): void;
  detach(img: HTMLImageElement): void;
  dispose(): void;
  /** 测试观察缝：未挂图 undefined */
  stateOf(img: HTMLImageElement): BadgeState | undefined;
}

/** 通用成功绿（非品牌——框架通用视觉缺省；品牌黄/图形 path 才是注入面） */
const CHECK_BACKGROUND = '#3d9a50';

const buildStyle = (deps: BadgeOverlayDeps): string => `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
button {
  pointer-events: none; width: 24px; height: 24px; border: none; border-radius: 8px;
  background: ${deps.branding.badgeColor}; cursor: pointer; display: grid; place-items: center;
  box-shadow: 0 1px 4px rgba(0,0,0,.25);
  opacity: 0; transition: opacity .12s ease, transform .12s ease;
}
/* R58 属性门：宿主 data-shown 才可见可点（默认隐身，悬停图片淡入） */
:host([data-shown]) button { opacity: .5; pointer-events: auto; }
:host([data-shown]) button:hover, :host([data-shown]) button:focus-visible {
  opacity: 1; transform: scale(1.15);
}
button svg { width: 16px; height: 16px; display: none; }
button[data-icon="logo"] .icon-logo { display: block; }
button[data-icon="lock"] .icon-lock { display: block; }
button[data-icon="check"] .icon-check { display: block; }
button[data-icon="lock"] svg { animation: ${deps.cssNames.spin} 1s linear infinite; }
:host([data-shown]) button[data-icon="check"] { background: ${CHECK_BACKGROUND}; opacity: 1; }
button[data-state="fail"] { animation: ${deps.cssNames.shake} .4s ease; }
@keyframes ${deps.cssNames.spin} { to { transform: rotate(360deg); } }
@keyframes ${deps.cssNames.shake} {
  20% { transform: translateX(-2px); } 40% { transform: translateX(2px); }
  60% { transform: translateX(-2px); } 80% { transform: translateX(2px); }
}
[data-bubble] {
  position: absolute; top: -34px; right: 0; white-space: nowrap;
  background: #fff; color: #181818; font: 500 11px/1.4 system-ui, sans-serif;
  padding: 5px 8px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
`;

interface BadgeEntry {
  host: HTMLDivElement;
  state: BadgeState;
  resetTimer: number | undefined;
  /** R58 显隐计时（淡入延迟 / 移出宽限）与光标在图标记 */
  showTimer: number | undefined;
  hideTimer: number | undefined;
  hovered: boolean;
  offPosition: () => void;
  offHover: () => void;
}

export function createBadgeOverlay(deps: BadgeOverlayDeps): BadgeOverlay {
  const entries = new Map<HTMLImageElement, BadgeEntry>();
  const cornerFor = deps.cornerFor ?? defaultCornerFor;

  const isPinned = (entry: BadgeEntry): boolean => entry.state !== 'idle';

  const showBadge = (entry: BadgeEntry): void => {
    // R59 最顶层：显身时重挂 body 末位——宿主已是 max z-index（2147483647），
    // 但同值 z-index 按 DOM 序后者胜；页面后渲染的同值覆盖层（对话站悬浮件等）
    // 会在我们 attach 之后入 DOM 而压过徽标，重挂夺回顶层
    if (entry.host.nextElementSibling !== null) deps.doc.body.appendChild(entry.host);
    entry.host.setAttribute('data-shown', '');
  };

  const hideBadge = (entry: BadgeEntry): void => {
    if (isPinned(entry) || entry.hovered) return;
    entry.host.removeAttribute('data-shown');
  };

  const setState = (img: HTMLImageElement, entry: BadgeEntry, state: BadgeState): void => {
    entry.state = state;
    const button = entry.host.shadowRoot?.querySelector('button');
    if (state !== 'idle') {
      // R58 反馈态钉住：抓取/✓/失败（含气泡窗）期间不随移出隐藏
      window.clearTimeout(entry.hideTimer);
      window.clearTimeout(entry.showTimer);
      showBadge(entry);
    }
    if (button === null || button === undefined) return;
    button.dataset.state = state;
    button.dataset.icon =
      state === 'grabbing' ? 'lock' : state === 'ok' ? 'check' : 'logo';
  };

  /** 回落 idle 的收尾：光标已不在图上 → 隐（hovered 则保持常显至移出） */
  const settleIdle = (img: HTMLImageElement, entry: BadgeEntry): void => {
    setState(img, entry, 'idle');
    hideBadge(entry);
  };

  const showBubble = (entry: BadgeEntry, text: string): void => {
    const bubble = entry.host.shadowRoot?.querySelector('[data-bubble]') as HTMLElement | null;
    if (bubble === null) return;
    bubble.textContent = text;
    bubble.hidden = false;
  };

  const hideBubble = (entry: BadgeEntry): void => {
    const bubble = entry.host.shadowRoot?.querySelector('[data-bubble]') as HTMLElement | null;
    if (bubble !== null) bubble.hidden = true;
  };

  const fail = (img: HTMLImageElement, entry: BadgeEntry, text: string): void => {
    setState(img, entry, 'fail');
    showBubble(entry, text);
    entry.resetTimer = window.setTimeout(() => {
      hideBubble(entry);
      if (entries.get(img) === entry) settleIdle(img, entry);
    }, 5000);
  };

  const handleClick = async (img: HTMLImageElement, entry: BadgeEntry): Promise<void> => {
    if (entry.state === 'grabbing') return; // 防重入
    window.clearTimeout(entry.resetTimer);
    setState(img, entry, 'grabbing');

    const result = await deps.grab(img);
    const live = entries.get(img);
    if (live !== entry) return; // 途中被 detach
    if (result.ok && 'sent' in result) {
      // R53 CDN 兜底已直送：跳过本地 encode/send，直接 ok 态
      setState(img, entry, 'ok');
      entry.resetTimer = window.setTimeout(() => {
        if (entries.get(img) === entry) settleIdle(img, entry);
      }, 900);
      return;
    }
    if (result.ok) {
      const sent = await deps.send({
        base64: await (deps.encode ?? blobToBase64)(result.blob),
        mime: result.mime,
        ...(deps.source !== undefined ? { metadata: deps.source } : {}),
      });
      if (entries.get(img) !== entry) return;
      if (sent.ok) {
        setState(img, entry, 'ok'); // R44：✓ 0.9s → idle
        entry.resetTimer = window.setTimeout(() => {
          if (entries.get(img) === entry) settleIdle(img, entry);
        }, 900);
      } else {
        fail(img, entry, sent.reason === 'too_large' ? deps.tooLargeText : deps.fallbackText);
      }
    } else {
      fail(img, entry, result.reason === 'too_large' ? deps.tooLargeText : deps.fallbackText);
    }
  };

  const positionHost = (host: HTMLDivElement, img: HTMLImageElement, corner: BadgeCorner): void => {
    const rect = img.getBoundingClientRect();
    // R59 内嵌定位：徽标整体落在图片矩形内——右缘恒内缩 BADGE_CORNER_INSET_PX；
    // 纵向按角，圆角矩形图片不悬空在圆弧外
    host.style.left = `${rect.right + window.scrollX - 24 - BADGE_CORNER_INSET_PX}px`;
    host.style.top =
      corner === 'top-right'
        ? `${rect.top + window.scrollY + BADGE_CORNER_INSET_PX}px`
        : `${rect.bottom + window.scrollY - 24 - BADGE_CORNER_INSET_PX}px`;
  };

  const attach = (img: HTMLImageElement): void => {
    if (entries.has(img)) return;
    const host = deps.doc.createElement('div');
    host.setAttribute(deps.badgeAttr, '');
    host.style.cssText =
      'position:absolute;width:24px;height:24px;z-index:2147483647;pointer-events:none;';
    // open root：测试观察缝与 E2E 断言需要 host.shadowRoot 可达（closed 不暴露）；
    // 宿主页无脚本通道需求，attribute 标记（data-${ns}-badge）已够防御
    const root = host.attachShadow({ mode: 'open' });
    const style = deps.doc.createElement('style');
    style.textContent = buildStyle(deps);
    const button = deps.doc.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', deps.ariaLabel);
    button.dataset.icon = 'logo';
    button.dataset.state = 'idle';
    button.innerHTML = [
      `<svg class="icon-logo" viewBox="0 0 128 128" aria-hidden="true">${deps.branding.icons.logo}</svg>`,
      `<svg class="icon-lock" viewBox="0 0 128 128" aria-hidden="true">${deps.branding.icons.lock}</svg>`,
      `<svg class="icon-check" viewBox="0 0 128 128" aria-hidden="true">${deps.branding.icons.check}</svg>`,
    ].join('');
    const bubble = deps.doc.createElement('div');
    bubble.setAttribute('data-bubble', '');
    bubble.hidden = true;
    root.append(style, button, bubble);

    // R58 悬停隐现接线：悬停区 = 图片 ∪ 徽标宿主（R59 后徽标覆于图上，但命中测试
    // 仍归 shadow button 而非 img——纯 img 口径会在移向徽标时把它收走，img
    // mouseleave 以 relatedTarget 落宿主内豁免）
    const onEnter = (): void => {
      entry.hovered = true;
      window.clearTimeout(entry.hideTimer);
      if (!entry.host.hasAttribute('data-shown') && !isPinned(entry)) {
        window.clearTimeout(entry.showTimer);
        entry.showTimer = window.setTimeout(() => showBadge(entry), BADGE_SHOW_DELAY_MS);
      }
    };
    const onLeave = (e: Event): void => {
      const related = (e as MouseEvent).relatedTarget;
      if (related instanceof Node && (related === img || entry.host.contains(related))) return;
      entry.hovered = false;
      window.clearTimeout(entry.showTimer);
      if (isPinned(entry)) return; // 反馈态钉住：只记账不排隐藏
      entry.hideTimer = window.setTimeout(() => hideBadge(entry), BADGE_HIDE_GRACE_MS);
    };
    const onFocus = (): void => {
      // 键盘可达：focus 即唤起（无淡入延迟）
      window.clearTimeout(entry.showTimer);
      window.clearTimeout(entry.hideTimer);
      showBadge(entry);
    };
    const onBlur = (): void => {
      if (isPinned(entry) || entry.hovered) return;
      window.clearTimeout(entry.hideTimer);
      entry.hideTimer = window.setTimeout(() => hideBadge(entry), BADGE_HIDE_GRACE_MS);
    };
    img.addEventListener('mouseenter', onEnter);
    img.addEventListener('mouseleave', onLeave);
    // 徽标侧监听挂 button（宿主 pointer-events:none，真实指针事件只达 button）
    button.addEventListener('mouseenter', onEnter);
    button.addEventListener('mouseleave', onLeave);
    button.addEventListener('focus', onFocus);
    button.addEventListener('blur', onBlur);

    const corner = cornerFor(deps.source); // R60 泛化：挂角随注入策略
    const entry: BadgeEntry = {
      host,
      state: 'idle',
      resetTimer: undefined,
      showTimer: undefined,
      hideTimer: undefined,
      hovered: false,
      offPosition: () => positionHost(host, img, corner),
      offHover: () => {
        img.removeEventListener('mouseenter', onEnter);
        img.removeEventListener('mouseleave', onLeave);
        button.removeEventListener('mouseenter', onEnter);
        button.removeEventListener('mouseleave', onLeave);
        button.removeEventListener('focus', onFocus);
        button.removeEventListener('blur', onBlur);
      },
    };
    entries.set(img, entry);
    positionHost(host, img, corner);
    deps.doc.body.appendChild(host);
    // 光标下插入的图（mouseenter 已错过）：真实浏览器命中 :hover 即现
    if (img.matches(':hover')) showBadge(entry);
    // 页面滚动/缩放跟随（scroll 不冒泡 → capture 捕获所有滚动容器）
    window.addEventListener('scroll', entry.offPosition, { capture: true, passive: true });
    window.addEventListener('resize', entry.offPosition, { passive: true });
    button.addEventListener('click', () => void handleClick(img, entry));
  };

  const detach = (img: HTMLImageElement): void => {
    const entry = entries.get(img);
    if (entry === undefined) return;
    window.clearTimeout(entry.resetTimer);
    window.clearTimeout(entry.showTimer);
    window.clearTimeout(entry.hideTimer);
    window.removeEventListener('scroll', entry.offPosition, { capture: true });
    window.removeEventListener('resize', entry.offPosition);
    entry.offHover();
    entry.host.remove();
    entries.delete(img);
  };

  return {
    attach,
    detach,
    dispose() {
      for (const img of [...entries.keys()]) detach(img);
    },
    stateOf(img) {
      return entries.get(img)?.state;
    },
  };
}
