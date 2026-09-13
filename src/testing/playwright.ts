/**
 * /testing Playwright 助手（design.md §7 P3 最小集——扩展 E2E 的公共形态提炼）
 *
 * 形态源自 ready-svg e2e/panel.spec.ts（launchPersistentContext + unpacked 加载 +
 * panel.html 直开 + cookie 注入 + route mock）。类型面为结构性最小子集——运行时
 * 零依赖（消费方自带 @playwright/test）。
 *
 * ⚠️ 品牌 Chrome 137+ 已禁 --load-extension（本仓 chrome-smoke 实证）——此助手
 * 适用于 Chromium / Chrome for Testing / 137 之前的品牌 Chrome。
 */

export interface ExtWorker {
  url(): string;
}

export interface ExtBrowserContext {
  serviceWorkers(): ExtWorker[];
  waitForEvent(event: 'serviceworker'): Promise<ExtWorker>;
  newPage(): Promise<ExtPage>;
  addCookies(cookies: unknown[]): Promise<void>;
  close(): Promise<void>;
}

export interface ExtPage {
  goto(url: string): Promise<unknown>;
  route(url: string | RegExp, handler: (route: { fulfill(options: unknown): Promise<void> | void }) => Promise<void> | void): Promise<void>;
}

/** 加载 unpacked 扩展（契约 §5：必须 headful——新 headless 不支持扩展）。
 *  每个用例独立 profile 由消费方经 userDataDir 传入（cookie/storage 互不渗透）。 */
export const launchExtensionOptions = (extPath: string): {
  headless: false;
  args: string[];
} => ({
  headless: false,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
});

/** 从 service worker 取扩展 id（SW URL host）；SW 未起则等首个 serviceworker 事件 */
export const extIdFromContext = async (context: ExtBrowserContext): Promise<string> => {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return new URL(sw.url()).host;
};

/** 打开扩展页（panel.html 形态）：面板 unlisted 页直开——App 挂载即读会话，
 *  cookie 注入 / route 拦截须先于 goto（prepare 缝） */
export const openExtensionPage = async (
  context: ExtBrowserContext,
  extId: string,
  pagePath: string,
  prepare?: (context: ExtBrowserContext, page: ExtPage) => Promise<void>,
): Promise<ExtPage> => {
  const page = await context.newPage();
  if (prepare) await prepare(context, page);
  await page.goto(`chrome-extension://${extId}/${pagePath.replace(/^\//, '')}`);
  return page;
};

/** 会话 cookie 注入（E2E 登录态前置）：Supabase sb-<ref>-auth-token 形态的
 *  chunked 免注——E2E 一般注入单块小会话即可让 session-codec 解出 */
export const injectSessionCookie = async (
  context: ExtBrowserContext,
  webOrigin: string,
  cookieName: string,
  value: string,
): Promise<void> => {
  const { hostname, protocol } = new URL(webOrigin);
  await context.addCookies([
    {
      name: cookieName,
      value,
      domain: hostname,
      path: '/',
      secure: protocol === 'https:',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
};

/** JSON route mock（Web API 端点拦截）：信封/错误体一率 JSON */
export const routeJson = async (
  page: ExtPage,
  urlPattern: string | RegExp,
  body: unknown,
  status = 200,
): Promise<void> => {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    }),
  );
};
