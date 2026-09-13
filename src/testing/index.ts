export {
  createFakeStorageArea,
  createFakeCookies,
  createFakeMenus,
  createFakeContentRuntime,
  createFakeObserverFactory,
  type FakeCookieEvent,
} from './fakes';
export {
  launchExtensionOptions,
  extIdFromContext,
  openExtensionPage,
  injectSessionCookie,
  routeJson,
  type ExtBrowserContext,
  type ExtPage,
  type ExtWorker,
} from './playwright';
