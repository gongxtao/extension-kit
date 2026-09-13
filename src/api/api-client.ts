/**
 * apiFetch —— Web API 传输骨架（近原样 copy-out 自 ready-svg api-client.ts 传输核）
 *
 * api.md §2.1：插件请求一律 `Authorization: Bearer <Supabase access token>`、
 * 不携带 refresh token、无 cookie 语义（credentials omit——Web 的 cookie 鉴权
 * 与插件无关）；成功体为 `{ok:true, <payload>}` 信封，错误体为
 * `{ok:false, error:{code, message, fieldErrors?}}`。
 *
 * 状态语义（useSession 的输入契约）：
 * - 无会话（getValidSession → null）→ 本器直接 `{ok:false,status:401,code:'signed_out'}`
 *   ——根本不发请求；
 * - 服务端 401 且 error.code=authentication_required → code 穿透（真实登出信号）；
 * - 其余一切非成功（500、网络拒绝、信封畸形）→ `request_failed`——服务端故障
 *   不得误读为登出态（与 signed_out 严格区分）。
 *
 * 纯 DI：getValidSession / baseUrl / fetchFn 全部注入，不 import config 单例
 * （产品接线时传 config.webOrigin 作为 baseUrl）。
 *
 * 边界（F3）：MeInfo 与一切端点函数（fetchMe/…）完全归产品——本模块只做传输，
 * 信封整体作为 data 返回，payload 键由封装方取。
 */

import type { StoredSession } from '../session/session-codec';

export interface ApiDeps {
  getValidSession(): Promise<StoredSession | null>;
  /** Web 站点源（api.md §2.1 接口基址），由接线方注入 */
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string };

/** api.md §2.1 错误信封取 code；形状不符（含非 JSON 体）→ null */
const errorCodeOf = (body: unknown): string | null => {
  if (typeof body !== 'object' || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
};

/** apiFetch 请求可选项：method 缺省 GET；给 body 即 POST JSON（feat-004 Task 1 扩展）；
 *  body 为 FormData 时 multipart 直传（feat-005 Task 1：generations 上传，浏览器补 boundary）；
 *  raw:'text' 时成功响应按纯文本返回（preview/exports 直出 SVG，非 JSON 信封端点）。 */
export interface ApiFetchOpts {
  method?: 'GET' | 'POST';
  body?: unknown;
  raw?: 'text';
}

export async function apiFetch<T>(
  deps: ApiDeps,
  path: string,
  opts: ApiFetchOpts = {},
): Promise<ApiResult<T>> {
  const session = await deps.getValidSession();
  if (session === null) return { ok: false, status: 401, code: 'signed_out' };

  const form = opts.body instanceof FormData ? opts.body : null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    Accept: 'application/json',
  };
  if (opts.body !== undefined && form === null) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await (deps.fetchFn ?? fetch)(`${deps.baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      // FormData 引用直传（multipart boundary 由浏览器生成，手工 content-type 反而破坏它）
      body: form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
      // 无 cookie 语义：Web 的登录 cookie 与插件请求完全隔离（api.md §2.1）
      credentials: 'omit',
    });
  } catch {
    return { ok: false, status: 0, code: 'request_failed' };
  }

  let body: unknown = null;
  let text: string | null = null;
  try {
    if (opts.raw === 'text') {
      text = await response.text();
      try {
        body = JSON.parse(text); // 错误路径仍需信封 code（401 穿透判定）
      } catch {
        // 纯文本体（SVG 直出成功态）无 JSON 可解——正常
      }
    } else {
      body = await response.json();
    }
  } catch {
    // 读体失败沿非成功路径归拢（携带真实 status）
  }

  if (opts.raw === 'text') {
    // raw 端点成功 = HTTP 200 即文本（api.md：响应体直接是 SVG），无信封校验
    if (response.ok && text !== null) return { ok: true, data: text as T };
  } else {
    const envelopeOk =
      typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true;
    if (response.ok && envelopeOk) {
      return { ok: true, data: body as T }; // 端点无关：信封整体作为 data，payload 键由封装方取
    }
  }

  if (response.status === 401 && errorCodeOf(body) === 'authentication_required') {
    return { ok: false, status: 401, code: 'authentication_required' };
  }

  return { ok: false, status: response.status, code: 'request_failed' };
}
