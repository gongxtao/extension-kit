/**
 * Session cookie codec（feat-003 Task 3）
 *
 * 与 @supabase/ssr 0.6.1（cookieEncoding='base64url'）的 cookie 存储格式对齐，
 * 让插件直接读/写 Web 端种下的 `sb-<ref>-auth-token` 会话 cookie：
 * - 值 = 'base64-' + base64url(JSON.stringify(session))。base64url 为无 padding 的
 *   RFC 4648 §5（+→-、/→_、去 =），按 UTF-8 字节流编码——btoa/atob 仅支持 latin1，
 *   email 可能含中文/emoji，必须走 TextEncoder/TextDecoder（与 ssr 的
 *   stringToBase64URL/stringFromBase64URL 字节等价）。
 * - 总长 ≤ 3180：单块存无后缀原名；否则按 3180 顺序切为 .0/.1/…（0 起、无 -of-N）。
 * - decode 对齐 ssr combineChunks：先取原名（命中即用），否则从 .0 顺序取到缺口拼接。
 *
 * 等价性论证（升级 @supabase/ssr 时必须重验本文件全部测试）：
 * ssr createChunks 在 encodeURIComponent 的编码视图上做「转义序列/Unicode 边界」
 * 安全切片；而本 payload（'base64-' + base64url）的全部字符仅含 A-Za-z0-9、'-'、'_'，
 * 均在 encodeURIComponent 的不转义集合内 → encodeURIComponent(payload) === payload，
 * ssr 的边界回退恒为 no-op → 简单顺序切片 slice(i*3180, (i+1)*3180) ≡ ssr createChunks。
 */

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type?: string;
  user?: { email?: string | null } & Record<string, unknown>;
}

/** 单 cookie 值上限——与 @supabase/ssr 0.6.1 MAX_CHUNK_SIZE 对齐的不变量（cookie 4K 安全线） */
export const MAX_CHUNK_SIZE = 3180;

const BASE64_PREFIX = 'base64-';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** UTF-8 字符串 → 无 padding base64url；0x8000 分段防 fromCharCode 参数栈上限 */
const toBase64Url = (text: string): string => {
  const bytes = textEncoder.encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

/** 无 padding base64url → UTF-8 字符串；非法输入抛出（由 decode 统一归 null） */
const fromBase64Url = (encoded: string): string => {
  const normalized = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return textDecoder.decode(bytes);
};

/** 对齐 ssr combineChunks：原名优先；缺失则按 .0/.1/… 顺序取到缺口为止拼接 */
export function decodeSessionCookie(
  name: string,
  cookies: { name: string; value: string }[],
): StoredSession | null {
  const byName = new Map(cookies.map((c) => [c.name, c.value]));

  const original = byName.get(name) ?? '';
  let combined: string | null = original !== '' ? original : null;
  if (combined === null) {
    const parts: string[] = [];
    for (let i = 0; ; i++) {
      const chunk = byName.get(`${name}.${i}`);
      if (chunk === undefined || chunk === '') break;
      parts.push(chunk);
    }
    if (parts.length > 0) combined = parts.join('');
  }

  if (combined === null || !combined.startsWith(BASE64_PREFIX)) return null;

  try {
    const parsed: unknown = JSON.parse(fromBase64Url(combined.slice(BASE64_PREFIX.length)));
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof (parsed as { access_token?: unknown }).access_token !== 'string') return null;
    return parsed as StoredSession;
  } catch {
    // atob 非法 base64 / JSON.parse 非法 JSON 均视为不可用会话
    return null;
  }
}

/** 序列化 → 'base64-' 前缀 → ≤3180 单块原名 / 否则 0 起顺序切块 .0/.1/… */
export function encodeSessionCookies(
  name: string,
  session: StoredSession,
): { name: string; value: string }[] {
  const value = BASE64_PREFIX + toBase64Url(JSON.stringify(session));

  if (value.length <= MAX_CHUNK_SIZE) {
    return [{ name, value }];
  }

  const chunks: { name: string; value: string }[] = [];
  for (let i = 0; i * MAX_CHUNK_SIZE < value.length; i++) {
    chunks.push({
      name: `${name}.${i}`,
      value: value.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE),
    });
  }
  return chunks;
}

/**
 * 纯集合差 + 槽 0 豁免：set = desired 原样；remove = existingNames 中未被新布局
 * 占用的名字，其中旧 `${name}.0`（槽 0）豁免——新布局无论单块（占原名）还是分块
 * （.0 起）都占据槽 0。残留 .0 不可达（decode 原名优先，ssr combineChunks 同构），
 * Web 端下一次 ssr 写入也会按 isChunkLike 清掉全部旧块，自愈。
 * ⚠️ ssr 0.6.1 的 setItem 实际会连 .0 一并移除；本函数按计划测试锁定为保留 .0
 * （用例「缩块清理：旧 .0/.1/.2 → 新单块，remove 收 .1/.2」）。若后续要完全复刻
 * ssr 行为，需同步改 session-codec.test.ts 对应用例。
 */
export function planCookieWrites(
  name: string,
  existingNames: string[],
  desired: { name: string; value: string }[],
): { set: { name: string; value: string }[]; remove: string[] } {
  const desiredNames = new Set(desired.map((c) => c.name));
  const firstChunkName = `${name}.0`;
  const remove = existingNames.filter((n) => n !== firstChunkName && !desiredNames.has(n));
  return { set: desired, remove };
}
