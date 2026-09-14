/**
 * Supabase auth REST 客户端
 *
 * 插件不引 supabase-js SDK，直接调 Supabase auth REST：
 * - refreshSession：POST {supabaseUrl}/auth/v1/token?grant_type=refresh_token，
 *   headers 的 apikey 与 Authorization Bearer 均用 publishable（公开）key，body {refresh_token}。
 *   200 → Response.json() 解析并校验 access_token 为字符串后原样映射为 StoredSession；
 *   其余状态（400/401 无效或过期 refresh token 等）与网络失败一律归 null。
 * - revokeSession：POST {supabaseUrl}/auth/v1/logout?scope=global，
 *   Authorization Bearer <accessToken>。永不 throw：401/403/404/网络错均静默
 *   （R11，对齐 auth-js 登出容忍行为）。
 *
 * 纯 DI：config 与 fetch 均由参数注入（fetch 默认全局），不 import config 单例。
 * 泛化点（F19/F23 配置三层）：源持 ExtensionConfig 四字段 → 框架只持本层所需的
 * 结构子集 SupabaseAuthConfig（产品常量经装配注入，框架零缺省）。
 */

import type { StoredSession } from './session-codec';

/** Supabase auth REST 所需配置（源 ExtensionConfig 结构子集；产品装配注入） */
export interface SupabaseAuthConfig {
  /** Supabase 项目 URL */
  supabaseUrl: string;
  /** Supabase publishable（公开）key */
  supabasePublishableKey: string;
}

export async function refreshSession(
  config: SupabaseAuthConfig,
  refreshToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<StoredSession | null> {
  let response: Response;
  try {
    response = await fetchFn(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${config.supabasePublishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return null; // 网络失败 ⇒ 无可用会话
  }

  if (response.status !== 200) return null;

  try {
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null) return null;
    if (typeof (body as { access_token?: unknown }).access_token !== 'string') return null;
    return body as StoredSession; // 字段按响应原样映射（access/refresh/expires_at/token_type/user）
  } catch {
    return null; // 非法 JSON ⇒ 无可用会话
  }
}

export async function revokeSession(
  config: SupabaseAuthConfig,
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchFn(`${config.supabaseUrl}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // R11：网络错静默；响应状态（含 401/403/404）不检查、不抛
  }
}
