import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { refreshSession, revokeSession } from './auth-rest';
import type { SupabaseAuthConfig } from './auth-rest';

// F19/F23：产品常量经装配注入（框架只持本层结构子集）
const config: SupabaseAuthConfig = {
  supabaseUrl: 'https://test-ref.supabase.co',
  supabasePublishableKey: 'sb_publishable_test-key',
};

const sessionBody = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  expires_at: 1780000000,
  token_type: 'bearer',
  user: { email: 'user@readysvg.net' },
};

/** 取 mock fetch 的唯一一次调用参数（headers 经 Headers 归一，兼容两种实现写法） */
const soleCall = (fetchMock: Mock<typeof fetch>) => {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) throw new Error('fetch 未被调用');
  return { url: String(call[0]), init: call[1] ?? {} };
};

describe('refreshSession（auth REST token 端点）', () => {
  it('200：POST {supabaseUrl}/auth/v1/token?grant_type=refresh_token，apikey + Bearer publishable，body {refresh_token}，返回原样映射的 session', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(sessionBody), { status: 200 }));

    const session = await refreshSession(config, 'old-refresh-token', fetchMock);

    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://test-ref.supabase.co/auth/v1/token?grant_type=refresh_token');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe('sb_publishable_test-key');
    expect(headers.get('authorization')).toBe('Bearer sb_publishable_test-key');
    expect(JSON.parse(String(init.body))).toEqual({ refresh_token: 'old-refresh-token' });

    expect(session).toEqual(sessionBody);
  });

  it.each([400, 401])('HTTP %i → null（refresh token 无效/过期）', async (status) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status }));

    expect(await refreshSession(config, 'bad-token', fetchMock)).toBeNull();
  });

  it('网络 reject → null（catch 归一）', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));

    expect(await refreshSession(config, 'any', fetchMock)).toBeNull();
  });

  it('200 但 body 无字符串 access_token → null（json() 解析后必须校验）', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ refresh_token: 'r' }), { status: 200 }));

    expect(await refreshSession(config, 'old', fetchMock)).toBeNull();
  });
});

describe('revokeSession（logout?scope=global，R11 永不 throw）', () => {
  it('POST {supabaseUrl}/auth/v1/logout?scope=global + Authorization Bearer accessToken', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(revokeSession(config, 'access-to-revoke', fetchMock)).resolves.toBeUndefined();

    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://test-ref.supabase.co/auth/v1/logout?scope=global');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-to-revoke');
  });

  it.each([401, 403, 404])('HTTP %i 静默 resolve（R11，对齐 auth-js 容忍行为）', async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));

    await expect(revokeSession(config, 'tok', fetchMock)).resolves.toBeUndefined();
  });

  it('网络 reject 静默 resolve（R11）', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));

    await expect(revokeSession(config, 'tok', fetchMock)).resolves.toBeUndefined();
  });
});
