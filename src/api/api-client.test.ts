import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { apiFetch } from './api-client';
import type { ApiDeps } from './api-client';
import type { StoredSession } from '../session/session-codec';

/**
 * apiFetch 传输核测试——copy-out 自 ready-svg api-client.test.ts 的 apiFetch 矩阵
 * （原测试里经 fetchMe/fetchOptimize 等端点封装的用例，此处直接打 apiFetch——
 * 端点函数归产品（F3），传输语义矩阵逐条保留）。
 */

/** 会话工厂：字段含义同 session-store（access_token 是唯一被本层消费的字段） */
const session = (over: Partial<StoredSession> = {}): StoredSession => ({
  access_token: 'at-client',
  refresh_token: 'rt',
  expires_at: 1_700_000_600,
  ...over,
});

/** api.md GET /api/me 成功体（信封） */
const ME_BODY = {
  ok: true,
  user: { email: 'maker@example.com', plan: 'sub_100', credits: 7 },
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** 组 deps：fetchFn 注入 mock（默认 200 ME_BODY），getValidSession 默认返回会话 */
const setup = (over: Partial<ApiDeps> = {}) => {
  const fetchMock: Mock<typeof fetch> = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json(200, ME_BODY));
  return {
    fetchMock,
    d: {
      getValidSession: vi.fn(async () => session()),
      baseUrl: 'https://readysvg.net',
      fetchFn: fetchMock,
      ...over,
    } satisfies ApiDeps,
  };
};

/** 取 mock fetch 的唯一一次调用参数 */
const soleCall = (fetchMock: Mock<typeof fetch>) => {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) throw new Error('fetch 未被调用');
  return { url: String(call[0]), init: call[1] ?? {} };
};

describe('apiFetch（api.md §2.1：插件 Bearer / 无 cookie 语义；状态语义 = useSession 输入契约）', () => {
  it('无会话 → {ok:false,status:401,code:"signed_out"}，且 fetchFn 根本不被调用（无谓请求不发）', async () => {
    const { fetchMock, d } = setup({ getValidSession: vi.fn(async () => null) });

    await expect(apiFetch(d, '/api/me')).resolves.toEqual({ ok: false, status: 401, code: 'signed_out' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('有会话 → GET baseUrl+path + Authorization Bearer <access_token> + Accept json + credentials omit（不带任何 cookie 语义），200 → ok:true（data 为完整信封体）', async () => {
    const { fetchMock, d } = setup();

    const result = await apiFetch<typeof ME_BODY>(d, '/api/me');

    expect(result).toEqual({ ok: true, data: ME_BODY });
    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://readysvg.net/api/me');
    expect(init.method).toBe('GET');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer at-client');
    expect(headers.get('accept')).toBe('application/json');
    expect(init.credentials).toBe('omit');
  });

  it('服务端 401 + error.code=authentication_required → code 穿透（与 signed_out 可区分，useSession 据此翻登出）', async () => {
    const { d } = setup({
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(
        json(401, { ok: false, error: { code: 'authentication_required', message: 'Bearer token invalid' } }),
      ),
    });

    await expect(apiFetch(d, '/api/me')).resolves.toEqual({ ok: false, status: 401, code: 'authentication_required' });
  });

  it('服务端 500 → {ok:false,status:500,code:"request_failed"}（服务端故障不得误读为登出态）', async () => {
    const { d } = setup({
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(
        json(500, { ok: false, error: { code: 'internal_error', message: 'boom' } }),
      ),
    });

    await expect(apiFetch(d, '/api/me')).resolves.toEqual({ ok: false, status: 500, code: 'request_failed' });
  });

  it('网络拒绝（fetch reject）→ {ok:false,status:0,code:"request_failed"}', async () => {
    const { d } = setup({
      fetchFn: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')),
    });

    await expect(apiFetch(d, '/api/me')).resolves.toEqual({ ok: false, status: 0, code: 'request_failed' });
  });

  it('严格映射：401 但信封 code 非 authentication_required（或缺失）→ request_failed，不穿透', async () => {
    const malformed = setup({
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(json(401, { ok: false })),
    });
    await expect(apiFetch(malformed.d, '/api/me')).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'request_failed',
    });
  });
});

describe('apiFetch POST JSON 通道', () => {
  const OPT_BODY = { ok: true, optimizedPrompt: 'A minimal one-piece cat logo.' };

  const optSetup = (response?: Response) => {
    const fetchMock: Mock<typeof fetch> = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response ?? json(200, OPT_BODY));
    const d: ApiDeps = {
      getValidSession: vi.fn(async () => session()),
      baseUrl: 'https://readysvg.net',
      fetchFn: fetchMock,
    };
    return { fetchMock, d };
  };

  it('POST：method/content-type/body 就位，信封成功 → ok:true（data 为完整信封体）', async () => {
    const { fetchMock, d } = optSetup();

    const result = await apiFetch(d, '/api/prompts/optimize', {
      method: 'POST',
      body: { profile: 'cut', prompt: 'a simple cat logo' },
    });

    expect(result).toEqual({ ok: true, data: OPT_BODY });
    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://readysvg.net/api/prompts/optimize');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ profile: 'cut', prompt: 'a simple cat logo' }));
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('authorization')).toBe('Bearer at-client');
    expect(headers.get('accept')).toBe('application/json');
    expect(init.credentials).toBe('omit');
  });

  it('无 opts → 仍 GET 且不附 body/content-type（回归守卫）', async () => {
    const { fetchMock, d } = optSetup();

    await apiFetch(d, '/api/me');

    const { init } = soleCall(fetchMock);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get('content-type')).toBeNull();
  });
});

describe('apiFetch multipart + raw 双通道', () => {
  const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><path d="M10 10"/></svg>';
  const pngFile = (): File => new File([new Uint8Array([137, 80, 78, 71])], 'cat.png', { type: 'image/png' });

  const genSetup = (response?: Response) => {
    const fetchMock: Mock<typeof fetch> = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response ?? json(200, { ok: true }));
    const d: ApiDeps = {
      getValidSession: vi.fn(async () => session()),
      baseUrl: 'https://readysvg.net',
      fetchFn: fetchMock,
    };
    return { fetchMock, d };
  };

  it('FormData 通道：body 为 FormData 时引用直传（multipart 由浏览器补 boundary），不设 content-type，Bearer 仍就位', async () => {
    const { fetchMock, d } = genSetup();
    const form = new FormData();
    form.append('requestId', '11111111-2222-4333-8444-555555555555');
    form.append('image', pngFile());

    const result = await apiFetch(d, '/api/generations', { method: 'POST', body: form });

    expect(result.ok).toBe(true);
    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://readysvg.net/api/generations');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form); // 引用直传，不 JSON.stringify
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBeNull(); // multipart boundary 由浏览器生成
    expect(headers.get('authorization')).toBe('Bearer at-client');
    expect(init.credentials).toBe('omit');
  });

  it('raw 模式：200 非 JSON 体（SVG 直出）→ {ok:true, data:文本}，不做信封校验', async () => {
    const { fetchMock, d } = genSetup(new Response(SVG_TEXT, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }));

    const result = await apiFetch<string>(d, '/api/assets/x/preview', { raw: 'text' });

    expect(result).toEqual({ ok: true, data: SVG_TEXT });
    const { url, init } = soleCall(fetchMock);
    expect(url).toBe('https://readysvg.net/api/assets/x/preview');
    expect(init.method).toBe('GET');
  });

  it('raw 模式：500 → request_failed（携带真实 status）；401 authentication_required → code 穿透（R35 auth 门信号）', async () => {
    const failed = genSetup(new Response(SVG_TEXT, { status: 500, headers: { 'Content-Type': 'image/svg+xml' } }));
    await expect(apiFetch<string>(failed.d, '/api/exports', { raw: 'text' })).resolves.toEqual({
      ok: false,
      status: 500,
      code: 'request_failed',
    });

    const authed = genSetup(
      json(401, { ok: false, error: { code: 'authentication_required', message: 'expired' } }),
    );
    await expect(apiFetch<string>(authed.d, '/api/exports', { raw: 'text' })).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'authentication_required',
    });
  });

  it('raw 模式：401 但错误体非信封（纯文本）→ request_failed，不穿透', async () => {
    const { d } = genSetup(new Response('no auth', { status: 401 }));
    await expect(apiFetch<string>(d, '/api/exports', { raw: 'text' })).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'request_failed',
    });
  });
});
