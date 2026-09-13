/**
 * defineMessages —— 产品自定义消息工厂（design.md §5）
 *
 * kitMessages 之外的业务消息走这里：ns 一根线派生 kind（缺省规则 = 消息名
 * camelCase → kebab-case，镜像源命名 ImageHandoffMessage ↔ rsvg-image-handoff；
 * def.kind 显式覆盖），payload 守卫由产品注入。守卫纪律继承：畸形消息静默拒。
 */

export interface MessageDef<T = unknown> {
  /** 显式 kind（缺省 `${ns}-${kebab(消息名)}`） */
  kind?: string;
  /** payload 守卫（缺省只查 kind——对齐源空载荷消息口径） */
  payload?: (value: unknown) => value is T;
}

type EntryOf<D> = D extends { payload: (value: unknown) => value is infer T }
  ? import('./kitMessages').MessageEntry<T>
  : import('./kitMessages').MessageEntry<unknown>;

export type MessageMap<D extends Record<string, MessageDef>> = {
  readonly [K in keyof D]: EntryOf<D[K]>;
};

const camelToKebab = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export const defineMessages = <D extends Record<string, MessageDef>>(
  ns: string,
  defs: D,
): MessageMap<D> => {
  const out: Record<string, import('./kitMessages').MessageEntry<unknown>> = {};
  for (const [name, def] of Object.entries(defs)) {
    const kind = def.kind ?? `${ns}-${camelToKebab(name)}`;
    const guard = def.payload;
    out[name] = {
      kind,
      is(value): value is unknown {
        if (typeof value !== 'object' || value === null) return false;
        if ((value as Record<string, unknown>).kind !== kind) return false;
        return guard ? guard(value) : true;
      },
    };
  }
  return out as MessageMap<D>;
};
