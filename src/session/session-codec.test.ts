import { describe, expect, it } from 'vitest';
import { decodeSessionCookie, encodeSessionCookies, planCookieWrites, MAX_CHUNK_SIZE, type StoredSession } from './session-codec';

const NAME = 'sb-test-auth-token';
const session = (over: Partial<StoredSession> = {}): StoredSession => ({
  access_token: 'at', refresh_token: 'rt', expires_at: 1_800_000_000,
  user: { email: 'maker@example.com' }, ...over,
});
// base64url 编解码走 TextEncoder/TextDecoder + 手写 RFC4648（btoa 只支持 latin1，
// email 可能含中文/emoji，必须 UTF-8 安全）——实现内聚在 codec，测试只验行为。

describe('session cookie codec（@supabase/ssr 0.6.1 对齐）', () => {
  it('小会话存无后缀原名，round-trip 相等', () => {
    const s = session();
    const [c] = encodeSessionCookies(NAME, s);
    expect(c!.name).toBe(NAME);
    expect(decodeSessionCookie(NAME, [c!])).toEqual(s);
  });
  it('大会话按 3180 切块 .0/.1/…（0 起、无 -of-N），round-trip 相等', () => {
    const big = session({ user: { email: 'm@example.com', pad: 'x'.repeat(7000) } });
    const chunks = encodeSessionCookies(NAME, big);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => { expect(c.name).toBe(`${NAME}.${i}`); expect(c.value.length).toBeLessThanOrEqual(MAX_CHUNK_SIZE); });
    expect(decodeSessionCookie(NAME, [...chunks].reverse())).toEqual(big); // 乱序也能拼
  });
  it('base64url 字符集（-_）与多字节 email（中文/emoji）round-trip', () => {
    const s = session({ user: { email: '制作者@例え.jp' } });
    expect(decodeSessionCookie(NAME, encodeSessionCookies(NAME, s))).toEqual(s);
  });
  it('缺 base64- 前缀 / 非法 JSON / 缺 access_token → null', () => {
    expect(decodeSessionCookie(NAME, [{ name: NAME, value: 'e30=' }])).toBeNull();
    expect(decodeSessionCookie(NAME, [{ name: NAME, value: 'base64-not-json' }])).toBeNull();
    expect(decodeSessionCookie(NAME, [{ name: NAME, value: 'base64-' + btoa(JSON.stringify({ refresh_token: 'r' })) }])).toBeNull();
    expect(decodeSessionCookie(NAME, [])).toBeNull();
  });
  it('缩块清理：旧 .0/.1/.2 → 新单块，remove 收 .1/.2', () => {
    const desired = encodeSessionCookies(NAME, session());
    const { set, remove } = planCookieWrites(NAME, [`${NAME}.0`, `${NAME}.1`, `${NAME}.2`], desired);
    expect(set.map(c => c.name)).toEqual(desired.map(c => c.name));
    expect(remove).toEqual([`${NAME}.1`, `${NAME}.2`]);
  });
  it('增长：原名 → .0/.1，remove 含旧原名', () => {
    const desired = encodeSessionCookies(NAME, session({ user: { email: 'm@example.com', pad: 'y'.repeat(7000) } }));
    const { remove } = planCookieWrites(NAME, [NAME], desired);
    expect(remove).toEqual([NAME]);
  });
});
