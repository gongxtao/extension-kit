/**
 * runtime/content-runtime —— 目标无关内容运行时（近原样 copy-out 自 ready-svg
 * entrypoints/content/index.ts 的 startContentScript；扫描机制归运行时，
 * 候选判定归抓取源——F26 调用时序）
 *
 * 职责：
 * - 扫描：初始全量 + MutationObserver（subtree/childList）去抖重扫；合格节点挂徽标，
 *   已挂不重挂，节点移除（isConnected=false）→ 徽标宿主随清。
 * - 徽标点击链组装（R44/R46 + F26 时序）：点击 → captureSource.isTarget 复核（尺寸
 *   漂移防护，不过 → ineligible 确定性败不走兜底）→ extract → 败且可救且源声明
 *   decodeCdn → SW 兜底（cdn-grab 通道）；send 包装 = ${ns}-image-handoff 消息
 *   （metadata 透传来源值，F24）→ runtime.sendMessage，ack 解析。
 * - R49 接收：${ns}-grab（右键菜单经 background 转发，无 DOM 引用）→ fetch 路 →
 *   network 败 → loadImage 兜底带 node 二次抓；终败/ack 拒 → 页面角 toast 回退文案
 *   （5s 自消）。onMessage 不回值（不占 sendResponse 通道）。
 * - R53 CDN 兜底：两路抓取终败（taint/network/decode——非确定性败）→ 发
 *   ${ns}-cdn-grab 托 background SW 扩展权限抓取（content 域 fetch 不豁免 CORS，
 *   SW 豁免）；ack ok = 已直送 store。
 * - R90 面板开合：toolbar/快捷键 toggle、右键菜单 show 消息消费；徽标点击复核过后
 *   即开本页面板（panelHost.show 幂等）。
 *
 * DOM/browser 面全 DI（jsdom 无 canvas/资源加载，测试注入 fake observer/runtime/extract）。
 * 消息 kind / DOM 属性 / 文案全部注入（ns 一根线 + F23）。
 */

import {
  blobToBase64,
  type HandoffRecord,
} from './handoff';
import { showPageToast } from './toast';
import { createBadgeOverlay } from './badge-overlay';
import {
  isExtractFailReason,
  type CaptureSource,
  type ExtractFailReason,
  type ExtractInput,
  type ExtractResult,
  type TargetInfo,
} from '../capture/types';
import type { KitMessages } from '../../messaging/kitMessages';

export interface MutationObserverLike {
  observe(target: Node, options: { subtree: boolean; childList: boolean }): void;
  disconnect(): void;
}

export interface ContentRuntime {
  sendMessage(msg: unknown): Promise<unknown>;
  /** 返回退订函数 */
  onMessage(listener: (msg: unknown) => void): () => void;
}

/** DOM 读取面（jsdom 测试靠 defineProperty/getBoundingClientRect 桩）。
 *  宽高属性缺席 = undefined（非 0）——Number(null)===0 陷阱曾把所有 CSS 定尺寸的
 *  真实站图片判成 ≤32 图标排除（gemini 冒烟 2026-08-24 发现，回归守卫见测试） */
export function readTargetInfo(img: HTMLImageElement): TargetInfo {
  const rawW = img.getAttribute('width');
  const rawH = img.getAttribute('height');
  const attrW = rawW === null ? undefined : Number(rawW);
  const attrH = rawH === null ? undefined : Number(rawH);
  const rect = img.getBoundingClientRect();
  return {
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    currentSrc: img.currentSrc,
    ariaHidden: img.getAttribute('aria-hidden') === 'true',
    ...(attrW !== undefined && Number.isFinite(attrW) ? { attrWidth: attrW } : {}),
    ...(attrH !== undefined && Number.isFinite(attrH) ? { attrHeight: attrH } : {}),
    rect: { width: rect.width, height: rect.height },
  };
}

/** 右键链 canvas 兜底源的加载（crossorigin 缺省 = 页面 img 同语义，R49） */
export function loadPageImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

/** ack 结构面（R46 与 R53 CDN 共用）：败因 reason 运行时可为任意串（HandoffAck
 *  字面量类型只覆盖 too_large），按结构收窄——越值域由调用方守卫回退 */
type AckShape = { ok: true } | { ok: false; reason: string };

const isAck = (raw: unknown): raw is AckShape => {
  if (typeof raw !== 'object' || raw === null) return false;
  const rec = raw as { ok?: unknown; reason?: unknown };
  return (
    (rec.ok === true && !('reason' in rec)) ||
    (rec.ok === false && typeof rec.reason === 'string')
  );
};

export interface ContentRuntimeDeps {
  doc: Document;
  runtime: ContentRuntime;
  /** 抓取源（一体两面——F26；候选判定/提取/CDN 声明全在此） */
  captureSource: CaptureSource;
  /** ns 化消息协议（kitMessages(kit.kind 处的 ns)——kind 派生一根线） */
  messages: KitMessages;
  /** data-${ns}-toast 属性（kit.dataAttr('toast') 派生——§5 清单） */
  toastAttr: string;
  /** 徽标装配面（F23 品牌/文案/attr/cssNames/cornerFor/source——运行时只接线
   *  grab/send/doc/encode，不持品牌；fallbackText/tooLargeText 即 toast 文案同源） */
  badgeDeps: Omit<
    import('./badge-overlay').BadgeOverlayDeps,
    'doc' | 'grab' | 'send' | 'encode'
  >;
  /** 页内面板宿主（R90：徽标/菜单径直开；toggle/show 消息消费） */
  panelHost: import('../../panel/panel-host').PanelHost;
  /** E2E 测试缝（R51：dev 映射 localhost；生产 undefined） */
  loadImage?: (src: string) => Promise<HTMLImageElement | undefined>;
  encode?: (blob: Blob) => Promise<string>;
  makeObserver?: (cb: () => void) => MutationObserverLike;
  debounceMs?: number;
  now?: () => number;
  /** extract 注入缝（测试；缺省 captureSource.extract） */
  extract?: (input: ExtractInput) => Promise<ExtractResult>;
}

export function startContentRuntime(deps: ContentRuntimeDeps): { rescan(): void; stop(): void } {
  const {
    doc,
    runtime,
    messages,
    debounceMs = 200,
    loadImage = loadPageImage,
  } = deps;
  const encode = deps.encode ?? blobToBase64;
  const now = deps.now ?? Date.now;
  const extract = deps.extract ?? ((input: ExtractInput) => deps.captureSource.extract(input));

  /** R46 send 包装：消息形 + ack 解析（无监听/畸形 ack → 按 network 败处理） */
  const sendHandoff = async (payload: {
    base64: string;
    mime: 'image/png' | 'image/jpeg';
    metadata?: unknown;
  }): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const msg: Record<string, unknown> = {
      kind: messages.imageHandoff.kind,
      ...payload,
      requestedAt: now(),
    };
    let ack: unknown;
    try {
      ack = await runtime.sendMessage(msg);
    } catch {
      ack = undefined; // 扩展上下文失效（background 重启窗口）→ 统一败路
    }
    if (isAck(ack) && ack.ok) return { ok: true };
    return { ok: false, reason: isAck(ack) && !ack.ok ? ack.reason : 'network' };
  };

  const failToast = (reason: string): void => {
    showPageToast(
      doc,
      reason === 'too_large' ? deps.badgeDeps.tooLargeText : deps.badgeDeps.fallbackText,
      deps.toastAttr,
    );
  };

  /** R53 CDN 兜底：两路终败（非确定性败）且源声明 decodeCdn（F26 声明式 opt-in）
   *  → 托 background SW 扩展权限抓取。ack ok = 已直送 store；ack 败/畸形
   *  （SW 重启窗口）→ 败因回传（越值域沿用原败因） */
  const rescueViaCdn = async (
    srcUrl: string,
    fail: { ok: false; reason: ExtractFailReason },
  ): Promise<import('./badge-overlay').GrabOutcome> => {
    if (deps.captureSource.decodeCdn === undefined) return fail; // 源未声明 opt-in（F5）
    const msg = {
      kind: messages.cdnGrab.kind,
      srcUrl,
      requestedAt: now(),
      ...(deps.badgeDeps.source !== undefined ? { metadata: deps.badgeDeps.source } : {}),
    };
    let ack: unknown;
    try {
      ack = await runtime.sendMessage(msg);
    } catch {
      ack = undefined; // 扩展上下文失效 → 统一败路
    }
    if (isAck(ack) && ack.ok) return { ok: true, sent: true };
    const ackReason = isAck(ack) && !ack.ok ? ack.reason : undefined;
    return { ok: false, reason: isExtractFailReason(ackReason) ? ackReason : fail.reason };
  };

  /** 确定性败不走兜底：ineligible（复核不过，重抓无意义）/ too_large（SW 重取
   *  同字节必同超，免一次注定失败的往返） */
  const rescuable = (result: { ok: false; reason: string }): boolean =>
    result.reason !== 'ineligible' && result.reason !== 'too_large';

  /** R90（feat-011，取代 R61 预飞）：徽标点击直接开本页面板——panel-host 与
   *  badge-overlay 同在 content 上下文，无 SW 往返、无手势窗口概念。show 幂等：
   *  面板已开时照旧（storage.onChanged 即时收新图） */
  const openPanel = (): void => {
    deps.panelHost.show();
  };

  /** 徽标点击链（F26 时序）：isTarget 点击复核 → extract → 可救败 + 源声明
   *  decodeCdn → CDN 兜底；复核过后开面板 */
  const grabNode = async (img: HTMLImageElement): Promise<import('./badge-overlay').GrabOutcome> => {
    if (!deps.captureSource.isTarget(readTargetInfo(img))) return { ok: false, reason: 'ineligible' };
    openPanel(); // R90：复核过后即开面板（已开幂等）；不过不开——无内容将送达
    const result = await extract({ src: img.currentSrc, node: img });
    if (!result.ok && rescuable(result)) return rescueViaCdn(img.currentSrc, result);
    return result;
  };

  /** R49 右键链：fetch 路 → network 败 → new Image() 兜底带 node 二次抓 →
   *  R53 终败托 SW 抓（源声明 decodeCdn 才走） */
  const grabByUrl = async (srcUrl: string): Promise<import('./badge-overlay').GrabOutcome> => {
    let result = await extract({ src: srcUrl });
    if (!result.ok && result.reason === 'network') {
      const el = await loadImage(srcUrl);
      if (el !== undefined) result = await extract({ src: srcUrl, node: el });
    }
    if (!result.ok && rescuable(result)) return rescueViaCdn(srcUrl, result);
    return result;
  };

  /** 徽标装配（源 startContentScript 内组 createBadgeOverlay——结构随码走）：
   *  grab/send/doc/encode 由运行时接线，品牌/文案/attr 经 badgeDeps 透传 */
  const badge = createBadgeOverlay({
    ...deps.badgeDeps,
    doc,
    grab: grabNode,
    send: sendHandoff,
    ...(deps.encode !== undefined ? { encode } : {}),
  });

  const tracked = new Set<HTMLImageElement>();
  const rescan = (): void => {
    for (const img of doc.querySelectorAll('img')) {
      if (tracked.has(img)) continue;
      const info = readTargetInfo(img);
      if (!deps.captureSource.isTarget(info)) continue; // 候选判定归抓取源（F26）
      tracked.add(img);
      badge.attach(img);
    }
    for (const img of [...tracked]) {
      if (!img.isConnected) {
        badge.detach(img);
        tracked.delete(img);
      }
    }
  };

  let debounceTimer: number | undefined;
  const scheduleRescan = (): void => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(rescan, debounceMs);
  };
  const makeObserver =
    deps.makeObserver ??
    ((cb: () => void): MutationObserverLike => new MutationObserver(() => cb()));
  const observer = makeObserver(scheduleRescan);
  observer.observe(doc.documentElement, { subtree: true, childList: true });

  // 加载完成不产生 mutation（MutationObserver 盲区）——真实站图片多为插入后再落定：
  // 文档级捕获监听 img load（不冒泡，捕获可见）补扫，同走去抖
  const onLoad = (e: Event): void => {
    if ((e.target as Node | null) instanceof HTMLImageElement) scheduleRescan();
  };
  doc.addEventListener('load', onLoad, true);

  const offRuntime = runtime.onMessage((msg) => {
    // R90：background 两径——toolbar/快捷键 toggle（开↔关）；右键菜单 show（幂等开）
    if (messages.togglePanel.is(msg)) {
      deps.panelHost.toggle();
      return;
    }
    if (messages.showPanel.is(msg)) {
      deps.panelHost.show();
      return;
    }
    if (!messages.grab.is(msg)) return;
    void (async () => {
      const result = await grabByUrl(msg.srcUrl);
      if (result.ok && 'sent' in result) return; // R53 已直送 store——无 toast 无后续消息
      if (!result.ok) {
        failToast(result.reason);
        return;
      }
      const sent = await sendHandoff({
        base64: await encode(result.blob),
        mime: result.mime,
        ...(deps.badgeDeps.source !== undefined ? { metadata: deps.badgeDeps.source } : {}),
      });
      if (!sent.ok) failToast(sent.reason);
    })();
  });

  rescan(); // 初始全量

  return {
    rescan,
    stop() {
      window.clearTimeout(debounceTimer);
      observer.disconnect();
      doc.removeEventListener('load', onLoad, true);
      offRuntime();
      badge.dispose();
      deps.panelHost.destroy();
    },
  };
}

/** 面板消费侧交接记录读取的类型再导出（HandoffRecord——metadata 透传） */
export type { HandoffRecord };
