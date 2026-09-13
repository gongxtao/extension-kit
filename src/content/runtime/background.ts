/**
 * runtime/background —— background 装配面（近原样 copy-out 自 ready-svg
 * entrypoints/background/index.ts 的 setupPageIntegration；review3 修订 F13：
 * 整体参数化进框架——菜单 id/文案硬编码在函数体内物理切不开，保持函数结构 +
 * 参数化才是 copy-out 纪律，与 content 侧 startContentRuntime(deps) 对称）
 *
 * - setupPageIntegration：
 *   - action.onClicked（R90）：toolbar 图标 / ⌘⇧S → tabs.sendMessage 当前 tab
 *     ${ns}-toggle-panel——content 的 panel-host 开↔关（页内 iframe，无手势约束）。
 *   - R49 右键菜单：菜单 id 缺省 kit.menuId('convert') 派生；title/contexts 产品注入
 *     （F13——框架不持产品常量）。安装时建一次（SW 唤醒重复注册 duplicate id → 吞）；
 *     点击 → 先 sendMessage ${ns}-show-panel（菜单意图是开着面板收图，非关）→ 转发
 *     ${ns}-grab content 抓取。
 *   - R46 收口（deliverHandoff）：content 发 ${ns}-image-handoff →
 *     handoffStore.set（storage.session 单通道，键 ns 化注入）→ ack；QUOTA →
 *     too_large ack + tabs.sendMessage 同步告知（右键链 toast）。**不再开面板**——
 *     面板未开时徽标/菜单径本身就会开它（R90）。
 *   - R53 CDN 兜底（F26 声明式 opt-in）：content 终败发 ${ns}-cdn-grab → 源声明
 *     decodeCdn 才接（makeCanvas 注入 SW OffscreenCanvas 形态）→ SW 扩展权限 fetch
 *     免 CORS → encode → 复用 R46 收口；败因直通 ack。
 *
 * chrome.* 表面（browser 类型化的结构子集 + DI；测试全桩）。
 */

import {
  blobToBase64,
  createHandoffStore,
  type HandoffRecord,
} from './handoff';
import {
  isExtractFailReason,
  type CaptureSource,
  type ExtractResult,
} from '../capture/types';
import type { KitMessages } from '../../messaging/kitMessages';

/** chrome.* 表面（无 @types/chrome，browser 类型化的结构子集 + DI；测试全桩） */
export interface PageIntegrationCtx {
  menus: {
    /** R97：create 错误走回调通道（Chrome lastError 语义——重复 id 不抛同步异常） */
    create(
      props: { id: string; title: string; contexts: string[] },
      onError: (error?: string) => void,
    ): void;
    removeAll(callback: () => void): void;
    onClicked: {
      addListener(
        cb: (info: { menuItemId: string | number; srcUrl?: string }, tab?: { id?: number }) => void,
      ): void;
    };
  };
  runtime: {
    onMessage: {
      addListener(
        cb: (msg: unknown, sender: { tab?: { id?: number } }) => unknown,
      ): void;
    };
  };
  /** R90：toolbar/快捷键径——toggle 消息发当前 tab */
  action: {
    onClicked: { addListener(cb: (tab: { id?: number }) => void): void };
  };
  tabs: { sendMessage(tabId: number, msg: unknown): Promise<unknown> };
  /** 交接通道（createHandoffStore(browser.storage.session, kit.key('image-handoff'))——
   *  键 ns 化由装配注入） */
  handoffStore: ReturnType<typeof createHandoffStore>;
}

export interface PageIntegrationOptions {
  /** ns 化消息协议（kitMessages(...)——kind 一根线） */
  messages: KitMessages;
  /** 抓取源（F26）：其 decodeCdn 声明决定 R53 CDN 兜底分支是否接线（F5 opt-in） */
  captureSource: CaptureSource;
  /** SW 兜底转码面（源 makeOffscreenCanvas——SW 无 document；声明 decodeCdn 必传） */
  makeCanvas?: () => import('../capture/types').CanvasLike;
  /** 菜单 id（缺省派生面：装配层传 kit.menuId('convert')——F13 缺省 'convert'） */
  menuId: string;
  /** 菜单 title / contexts（产品值注入——F13/F23 框架不持产品常量） */
  menu: { title: string; contexts: string[] };
  /** blob → base64（缺省 blobToBase64；SW Blob 有 arrayBuffer 快路） */
  encode?(blob: Blob): Promise<string>;
}

export function setupPageIntegration(ctx: PageIntegrationCtx, opts: PageIntegrationOptions): void {
  const messages = opts.messages;
  const encode = opts.encode ?? blobToBase64;

  /** R53 兜底抓取（源 cdnGrab：SW 扩展权限 fetch + 注入转码面）；
   *  败因直通抓取链值域（SW 无 canvas 污染路，taint 不可达）。
   *  源未声明 decodeCdn → 不接线（F5 声明式 opt-in），onMessage 对 cdn-grab 静默 */
  const cdnGrab: ((srcUrl: string) => Promise<ExtractResult>) | null =
    opts.captureSource.decodeCdn !== undefined && opts.makeCanvas !== undefined
      ? (srcUrl) => opts.captureSource.extract!({ src: srcUrl }, { makeCanvas: opts.makeCanvas })
      : null;

  // R97 菜单幂等（官方模式）：菜单持久化跨 SW 生命周期，每次唤醒 removeAll 清场再建——
  // 永不撞 duplicate id；create 回调显式消费错误（Chrome 的 lastError 是回调式通道，
  // try/catch 捕不到、无回调时控制台打 Unchecked runtime.lastError——源轮病根）
  ctx.menus.removeAll(() => {
    ctx.menus.create(
      {
        id: opts.menuId,
        title: opts.menu.title,
        contexts: opts.menu.contexts,
        // R53 全站放开：不设 documentUrlPatterns（源两站白名单随 matches 全站化同废）
      },
      () => {
        /* 建败静默（菜单不可用不致命，本注册无重试语义） */
      },
    );
  });

  /** R90：toolbar 图标 / ⌘⇧S（_execute_action）→ 当前 tab toggle 页内面板。
   *  消息拒/无接收方（受限页面 chrome:// 等 R86）→ 静默 no-op */
  ctx.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    void ctx.tabs.sendMessage(tab.id, { kind: messages.togglePanel.kind }).catch(() => {});
  });

  ctx.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== opts.menuId) return;
    if (typeof info.srcUrl !== 'string' || info.srcUrl.length === 0) return;
    if (tab?.id === undefined) return;
    // 菜单意图 = 开着面板收图（非 toggle）：show 幂等开 → 转发抓取
    void ctx.tabs.sendMessage(tab.id, { kind: messages.showPanel.kind }).catch(() => {});
    void ctx.tabs
      .sendMessage(tab.id, { kind: messages.grab.kind, srcUrl: info.srcUrl })
      .catch(() => {
        // 接收方不在（受限页面边缘）→ 无回路，静默
      });
  });

  /** R46 收口（两分支共用）：store.set → ack；QUOTA：too_large ack +
   *  tabs.sendMessage 同步告知（右键链 toast）。面板显示归 content 侧各入口自理（R90） */
  const deliverHandoff = async (
    record: HandoffRecord,
    tabId: number | undefined,
  ): Promise<{ ok: true } | { ok: false; reason: 'too_large' }> => {
    const stored = await ctx.handoffStore.set(record);
    if (stored) return { ok: true };
    if (tabId !== undefined) {
      void ctx.tabs.sendMessage(tabId, { ok: false, reason: 'too_large' }).catch(() => {});
    }
    return { ok: false, reason: 'too_large' };
  };

  ctx.runtime.onMessage.addListener((msg, sender) => {
    const tabId = sender.tab?.id;
    if (messages.cdnGrab.is(msg)) {
      if (cdnGrab === null) return undefined; // 源未声明 opt-in——静默（F5）
      // R53 CDN 兜底：SW 扩展权限抓取 → 编码 → 复用 R46 收口（QUOTA 同链）
      return (async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
        const grabbed = await cdnGrab(msg.srcUrl);
        if (!grabbed.ok) return { ok: false, reason: grabbed.reason };
        return deliverHandoff(
          {
            kind: 'image',
            base64: await encode(grabbed.blob),
            mime: grabbed.mime,
            ...(msg.metadata !== undefined ? { metadata: msg.metadata } : {}),
            requestedAt: msg.requestedAt,
          },
          tabId,
        );
      })();
    }
    if (!messages.imageHandoff.is(msg)) return undefined;
    return (async (): Promise<{ ok: true } | { ok: false; reason: 'too_large' }> =>
      deliverHandoff(
        {
          kind: 'image',
          base64: msg.base64,
          mime: msg.mime,
          ...(msg.metadata !== undefined ? { metadata: msg.metadata } : {}),
          requestedAt: msg.requestedAt,
        },
        tabId,
      ))();
  });
}

/** 败因值域再导出（背景半段 ack 越值域回退用——F18 跨层标注） */
export { isExtractFailReason };
