/**
 * createKit —— ns 一根线派生所有全局名字（docs/design.md §5，F20 契约）
 *
 * 本抽象是框架唯一无 ready-svg 直接对应物的**登记例外**（F20）：源为 config.ts
 * 单例装配 + 各文件散落的 `rsvg-` 前缀字面量，无集中派生函数。约束三则：
 * 纯字符串派生、无状态无新运行时概念；ns='rsvg' 时输出与源字面量逐字节等价
 * （§5 全量清单即测试规格）；新派生类别须先回 design.md §5 扩契约，不得散落。
 */

export interface KitConfig {
  /** 命名空间：`[a-z0-9]+` 单段——一根线穿过存储键/消息 kind/DOM 名字（§5） */
  namespace: string;
}

export interface Kit {
  /** 存储键 `${ns}-${suffix}`（源形如 rsvg-me-cache） */
  key(suffix: string): string;
  /** 消息 kind `${ns}-${suffix}`（源形如 rsvg-toggle-panel） */
  kind(suffix: string): string;
  /** DOM id `${ns}-${suffix}`（源形如 rsvg-panel-host） */
  domId(suffix: string): string;
  /** DOM data 属性 `data-${ns}-${suffix}`（源形如 data-rsvg-badge；徽标宿主无 id，F12） */
  dataAttr(suffix: string): string;
  /** Shadow 内 CSS/动画名 `${ns}-${suffix}`（源形如 rsvg-spin） */
  cssName(suffix: string): string;
  /** 菜单 id `${ns}-${suffix}`（装配层缺省 suffix='convert'，F13） */
  menuId(suffix: string): string;
}

const NS_PATTERN = /^[a-z0-9]+$/;

export const createKit = (config: KitConfig): Kit => {
  const { namespace: ns } = config;
  if (!NS_PATTERN.test(ns)) {
    throw new Error(
      `createKit: namespace 必须为 [a-z0-9]+ 单段，收到 "${ns}"（design.md §5）`,
    );
  }
  return {
    key: (suffix) => `${ns}-${suffix}`,
    kind: (suffix) => `${ns}-${suffix}`,
    domId: (suffix) => `${ns}-${suffix}`,
    dataAttr: (suffix) => `data-${ns}-${suffix}`,
    cssName: (suffix) => `${ns}-${suffix}`,
    menuId: (suffix) => `${ns}-${suffix}`,
  };
};
