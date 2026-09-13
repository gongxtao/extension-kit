// demo 插件 Chrome 冒烟（feat-011 出口门——框架端到端消费验证）
//
// 前置与 chrome-smoke 相同：品牌 Chrome 137+ 须经 chrome://extensions UI 载入一次
// demo/.output/chrome-mv3，Chrome 以调试端口启动（同一 profile 重启保留）。
//
// 断言：1) 扩展加载且 content 注入  2) 徽标抓图链（canvas 大图→挂徽标→点击→抓取→面板直开）
//       3) handoff 落 storage.session  4) 面板页渲染抓取内容（img + metadata 胶囊 + Copy 可见）
//       5) 首开标记 flag-store（demokit-onboarding-seen）  6) 模式切换持久化（panel-prefs）
//
// 用法：node scripts/demo-smoke.mjs [--cdp http://localhost:9222] [--profile /tmp/exkit-smoke]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const CDP = arg('--cdp', 'http://localhost:9222');
const PROFILE = arg('--profile', '/tmp/exkit-smoke');
const PAGE_URL = arg('--page', 'https://example.com');
const NS = 'demokit';
const HOST_ID = `${NS}-panel-host`;

const fail = (msg) => {
  console.error(`[demo-smoke] ✗ ${msg}`);
  process.exit(1);
};
const ok = (label, pass, extra = '') =>
  console.log(`[demo-smoke] ${pass ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
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

function findExtId() {
  for (const name of ['Secure Preferences', 'Preferences']) {
    const p = join(PROFILE, 'Default', name);
    if (!existsSync(p)) continue;
    const settings = JSON.parse(readFileSync(p, 'utf8')).extensions?.settings ?? {};
    for (const [id, s] of Object.entries(settings)) {
      const path = String(s.path ?? '');
      if (s.location === 4 && path.includes('demo') && path.endsWith('chrome-mv3')) return id;
    }
  }
  return null;
}

// —— 0) 驱动端：panel.html 扩展页（chrome.tabs / storage 全量可用；避 SW 空闲竞态）——
let targets = await list().catch(() => fail(`CDP ${CDP} 不可达——Chrome 未以 --remote-debugging-port 启动`));
const extId = findExtId() ?? fail('profile 里未发现已加载的 demo 扩展（先经 chrome://extensions 载入一次）');
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
ok('1) 扩展加载（panel.html 驱动页可达）', true, extCtx.url);

// —— 1) 目标页 + content 注入 ——
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
// 页面可能在扩展载入前就已打开（旧/无 content script）——重载保证注入的是当前构建
await pageConn.send('Page.reload');
await sleep(4000);

const tabId = await evalIn(extConn, `new Promise(res => chrome.tabs.query({ url: '${PAGE_URL}/*' }, ts => res(ts[0]?.id)))`);
if (tabId == null) fail(`未找到 ${PAGE_URL} 标签`);
const checkHost = () => evalIn(pageConn, `!!document.getElementById('${HOST_ID}')`);

// —— 2) 徽标抓图链：canvas 大图（自包含零网络）→ 挂徽标 → 点击 → 面板直开 ——
await evalIn(pageConn, `new Promise((res) => {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e15a2a'; ctx.fillRect(0, 0, 320, 240);
  ctx.fillStyle = '#fff'; ctx.font = '42px sans-serif'; ctx.fillText('DEMO', 90, 140);
  canvas.toBlob((blob) => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.style.width = '320px'; img.style.height = '240px';
    img.onload = () => res(true);
    img.onerror = () => res(false);
    document.body.appendChild(img);
  }, 'image/png');
})`);
await sleep(500);
// 挂徽标时序轮询（reload→content 注入→去抖扫描的窗口有波动，固定 sleep 会偶发早查）
let badgeOk = false;
for (let i = 0; i < 16 && !badgeOk; i += 1) {
  await sleep(500);
  badgeOk = await evalIn(pageConn, `!!document.querySelector('[data-${NS}-badge]')`);
}
ok('2a) 合格大图自动挂徽标', badgeOk);

let grabbed = false;
if (badgeOk) {
  await evalIn(pageConn, `document.querySelector('[data-${NS}-badge]').shadowRoot.querySelector('button').click()`);
  await sleep(3000);
  grabbed = await checkHost();
  ok('2b) 徽标点击 → 抓取 → 面板直开（R90）', grabbed);
}

// —— 3) handoff 落 storage.session ——
const record = await evalIn(
  extConn,
  `chrome.storage.session.get('${NS}-image-handoff').then((bag) => {
    const r = bag['${NS}-image-handoff'];
    return r ? { mime: r.mime, metadata: r.metadata, base64Length: r.base64.length, requestedAt: r.requestedAt } : null;
  })`,
);
const handoffOk =
  record !== null &&
  record.base64Length > 0 &&
  record.mime === 'image/png' &&
  record.metadata === 'demo-page' &&
  // 本次运行新鲜度：requestedAt 距今 1min 内（防读到上一轮冒烟的旧记录冒充）
  typeof record.requestedAt === 'number' &&
  record.requestedAt > Date.now() - 60_000;
ok('3) handoff 落 storage.session（metadata=demo-page 透传 + 本轮新鲜）', handoffOk, JSON.stringify(record));

// —— 4) 面板页渲染抓取内容（独立驱动页直开 panel.html；/json/new 的 url 参数无效，
//     必须开空白页后 Page.navigate——chrome-smoke 同款踩坑）——
const panelTab = await openTab('about:blank');
await sleep(800);
targets = await list();
const panelTabInfo = targets.find((t) => t.type === 'page' && t.id === panelTab.id);
const panelTabConn0 = await connect(panelTabInfo.webSocketDebuggerUrl);
await panelTabConn0.send('Page.enable');
await panelTabConn0.send('Page.navigate', { url: `chrome-extension://${extId}/panel.html` });
await sleep(2500);
const panelView = await evalIn(
  panelTabConn0,
  `(() => {
    const img = document.querySelector('img.preview');
    const pill = document.getElementById('pill');
    const copy = document.getElementById('copy');
    return {
      imgShown: !!img && (img.src ?? '').startsWith('data:image/png;base64,'),
      pillText: pill && !pill.hidden ? pill.textContent : null,
      copyVisible: !copy.hidden,
    };
  })()`,
);
const renderOk =
  panelView !== null &&
  typeof panelView === 'object' &&
  panelView.imgShown === true &&
  panelView.pillText === 'demo-page' &&
  panelView.copyVisible === true;
ok('4) 面板渲染抓取内容（img dataUrl + metadata 胶囊 + Copy 可见）', renderOk, JSON.stringify(panelView));
const panelConn = await connect(panelTab.webSocketDebuggerUrl);

// —— 5) 首开标记 flag-store ——
const flag = await evalIn(
  panelConn,
  `chrome.storage.local.get('${NS}-onboarding-seen').then((bag) => bag['${NS}-onboarding-seen'] === true)`,
);
ok('5) 首开标记（flag-store → storage.local）', flag === true);

// —— 6) 模式切换持久化（panel-prefs）：读前值 → 点击 → 断言翻转（跨运行状态持久化本身就是被测行为）——
const modeBefore = await evalIn(
  panelConn,
  `chrome.storage.local.get('${NS}-panel-mode').then((bag) => bag['${NS}-panel-mode'] ?? 'squeeze')`,
);
await evalIn(panelConn, `document.getElementById('mode').click()`);
await sleep(600);
const modeAfter = await evalIn(
  panelConn,
  `chrome.storage.local.get('${NS}-panel-mode').then((bag) => bag['${NS}-panel-mode'])`,
);
const expected = modeBefore === 'squeeze' ? 'overlay' : 'squeeze';
const modeOk = modeAfter === expected;
ok('6) 模式切换持久化（panel-prefs → storage.local）', modeOk, `${modeBefore} → ${modeAfter}`);
await closeTab(panelTab.id).catch(() => {});
await closeTab(wakeTab.id).catch(() => {});

const pass = badgeOk && grabbed && handoffOk && renderOk && flag === true && modeOk;
console.log(pass ? '[demo-smoke] ✓ 全部断言通过' : '[demo-smoke] ✗ 存在失败断言');
process.exit(pass ? 0 : 1);
