// example 插件 Chrome 冒烟（P0 出口门三断言，可脚本化——design.md §7「手动/可脚本化」）
//
// 前置（一次性）：品牌 Chrome 137+ 已禁用 --load-extension，扩展需经
// chrome://extensions 开发者模式「加载未打包的扩展程序」载入 example/.output/chrome-mv3，
// 且 Chrome 以调试端口启动：
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     --user-data-dir=/tmp/exkit-smoke --no-first-run --remote-debugging-port=9222
// （同一 profile 重启保留已载扩展；扩展 id 从 profile 的 Secure Preferences 自动发现）
//
// 断言：1) 扩展加载且 content script 注入  2) 面板开合（toggle 开 → Close 关 → toggle 再开再关）
//       3) ns 化键/消息/DOM id（content console 对象三属性）
//
// 用法：node scripts/chrome-smoke.mjs [--cdp http://localhost:9222] [--profile /tmp/exkit-smoke]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const CDP = arg('--cdp', 'http://localhost:9222');
const PROFILE = arg('--profile', '/tmp/exkit-smoke');
const PAGE_URL = arg('--page', 'https://example.com');
const HOST_ID = arg('--host-id', 'exkit-panel-host');
const NS = arg('--ns', 'exkit');

const fail = (msg) => {
  console.error(`[chrome-smoke] ✗ ${msg}`);
  process.exit(1);
};
const ok = (label, pass, extra = '') =>
  console.log(`[chrome-smoke] ${pass ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = async () => (await fetch(`${CDP}/json/list`)).json();
const openTab = async (url) =>
  (await fetch(`${CDP}/json/new?url=${encodeURIComponent(url)}`, { method: 'PUT' })).json();
const closeTab = async (id) => fetch(`${CDP}/json/close/${id}`).catch(() => {});
const connect = async (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else res(m.result);
    } else if (m.method) {
      events.push(m);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, events };
};
const evalIn = async (conn, expression) => {
  const r = await conn.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

// —— 0) 驱动端：开一个空白标签后经 CDP Page.navigate 导航到 panel.html 扩展页
//    （chrome.tabs 全量可用；不连 SW——MV3 SW 空闲自停会造成连上即死的竞态；
//    /json/new 的 url 参数对该扩展页会被忽略，必须走 Page.navigate）——
let targets = await list().catch(() => fail(`CDP ${CDP} 不可达——Chrome 未以 --remote-debugging-port 启动`));
const extId = findExtId() ?? fail('profile 里未发现已加载的 example 扩展（先经 chrome://extensions 载入一次）');
const wake = await openTab('about:blank');
await sleep(800);
targets = await list();
const wakeTab = targets.find((t) => t.type === 'page' && t.id === wake.id) ?? targets.find((t) => t.type === 'page' && t.url === 'about:blank');
const wakeConn = await connect(wakeTab.webSocketDebuggerUrl);
await wakeConn.send('Page.enable');
await wakeConn.send('Page.navigate', { url: `chrome-extension://${extId}/panel.html` });
await sleep(2000);
targets = await list();
const extCtx = targets.find((t) => t.type === 'page' && t.url === `chrome-extension://${extId}/panel.html`);
if (!extCtx) fail('扩展上下文不可达（panel.html 驱动页打不开——扩展是否已加载？）');
const extConn = await connect(extCtx.webSocketDebuggerUrl);
void wakeConn;

function findExtId() {
  for (const name of ['Secure Preferences', 'Preferences']) {
    const p = join(PROFILE, 'Default', name);
    if (!existsSync(p)) continue;
    const settings = JSON.parse(readFileSync(p, 'utf8')).extensions?.settings ?? {};
    for (const [id, s] of Object.entries(settings)) {
      const path = String(s.path ?? '');
      if (s.location === 4 && path.includes('example') && path.endsWith('chrome-mv3')) return id;
    }
  }
  return null;
}

// —— 1) 打开目标页（content script 注入）——
targets = await list();
let page = targets.find((t) => t.type === 'page' && t.url.startsWith(PAGE_URL));
if (!page) {
  const blank = targets.find((t) => t.type === 'page' && t.url === 'about:blank') ?? (await openTab('about:blank'));
  const conn = await connect(blank.webSocketDebuggerUrl);
  await conn.send('Page.enable');
  await conn.send('Page.navigate', { url: PAGE_URL });
  await sleep(4000);
  targets = await list();
  page = targets.find((t) => t.type === 'page' && t.url.startsWith(PAGE_URL));
}
if (!page) fail(`页面 ${PAGE_URL} 打不开`);
const pageConn = await connect(page.webSocketDebuggerUrl);
await pageConn.send('Runtime.enable');
await pageConn.send('Page.enable');
ok('1) 扩展加载且目标页打开（content script 注入）', true, page.url);

const checkHost = () => evalIn(pageConn, `!!document.getElementById('${HOST_ID}')`);
const sendToTab = (tabId, kind) =>
  evalIn(extConn, `new Promise(res => chrome.tabs.sendMessage(${tabId}, { kind: '${kind}' }, () => void chrome.runtime.lastError ? res(false) : res(true)))`);

const tabId = await evalIn(extConn, `new Promise(res => chrome.tabs.query({ url: '${PAGE_URL}/*' }, ts => res(ts[0]?.id)))`);
if (tabId == null) fail(`未找到 ${PAGE_URL} 标签`);

// —— 2) 面板开合：初始无 → toggle 开 → Close 关 → toggle 再开 → toggle 再关 ——
const initialAbsent = (await checkHost()) === false;
await sendToTab(tabId, `${NS}-toggle-panel`);
await sleep(900);
const opened = await checkHost();
let closedByButton = false;
// 候选 = 非驱动页的 panel.html target 里真正嵌在页面里的 iframe（parent !== window）；
// 上一轮残留的顶层 panel.html 页会被过滤掉（postMessage 到不了 example.com 的监听器）
const panelCandidates = (await list()).filter(
  (t) => t.id !== wakeTab.id && (t.type === 'iframe' || t.type === 'page') && t.url.includes(`chrome-extension://${extId}/panel.html`),
);
for (const candidate of panelCandidates) {
  const panelConn = await connect(candidate.webSocketDebuggerUrl);
  const isEmbedded = await evalIn(panelConn, 'window.parent !== window && !!document.getElementById(\'close\')');
  if (!isEmbedded) continue;
  await evalIn(panelConn, `document.getElementById('close').click()`);
  await sleep(800);
  closedByButton = (await checkHost()) === false;
  break;
}
await sendToTab(tabId, `${NS}-toggle-panel`);
await sleep(600);
const reopened = await checkHost();
await sendToTab(tabId, `${NS}-toggle-panel`);
await sleep(600);
const reclosed = (await checkHost()) === false;
await closeTab(wakeTab.id).catch(() => {});
const toggleOk = initialAbsent && opened && reopened && reclosed;
ok('2) 面板开合（toggle 开 → Close 关 → toggle 开 → toggle 关）', toggleOk,
   `initAbsent=${initialAbsent} opened=${opened} closedByButton=${closedByButton} reopened=${reopened} reclosed=${reclosed}`);
ok('   panel.html iframe 可达且 Close 按钮生效', closedByButton);

// —— 3) ns 化三名字（content console 对象 preview；重载页面重触发日志）——
await pageConn.send('Page.reload');
await sleep(4000);
const consoleEvt = pageConn.events.filter(
  (e) => e.method === 'Runtime.consoleAPICalled' && JSON.stringify(e.params).includes(NS),
);
const props = {};
for (const e of consoleEvt) {
  for (const a of e.params.args) {
    for (const p of a.preview?.properties ?? []) props[p.name] = p.value;
  }
}
const namesOk =
  props.storageKey === `${NS}-me-cache` &&
  props.messageKind === `${NS}-toggle-panel` &&
  props.domId === `${NS}-panel-host`;
ok('3) ns 化键/消息/DOM id（content console 三属性）', namesOk, JSON.stringify(props));

const pass = toggleOk && closedByButton && namesOk;
console.log(pass ? '[chrome-smoke] ✓ 全部断言通过' : '[chrome-smoke] ✗ 存在失败断言');
process.exit(pass ? 0 : 1);
