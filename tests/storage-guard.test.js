// 本地存储守卫（storage-guard.js）：
//  · Safari 无痕/禁用站点数据/配额写失败时禁止继续游玩；
//  · 设置里的跨会话存储测试：标记跨浏览器会话保留 → 弹「本地存储正常」，没弹就是存不住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('storage-guard.js', 'utf8');

function mapStore(map) {
  return {
    setItem: (k, v) => map.set(k, String(v)),
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem: (k) => map.delete(k),
  };
}

/** 最小 window/document 桩：返回追加的节点、注册的捕获监听器、存储 Map */
function loadGuard(opts = {}) {
  const local = opts.localStorage || new Map();
  const session = opts.sessionStorage || new Map();
  const cookies = opts.cookies || new Map();
  const appended = [];
  const listeners = [];
  const el = () => ({
    style: {}, id: '', innerHTML: '', parentNode: null,
    setAttribute() {}, addEventListener() {},
    querySelector: () => ({
      addEventListener() {}, focus() {},
    }),
    focus() {},
  });
  const document = {
    documentElement: {
      style: {},
      appendChild(n) { n.parentNode = this; appended.push(n); },
      removeChild(n) { const i = appended.indexOf(n); if (i >= 0) appended.splice(i, 1); n.parentNode = null; },
    },
    body: { style: {} },
    getElementById: (id) => appended.find((n) => n.id === id) || null,
    createElement: () => el(),
    addEventListener() {}, removeEventListener() {},
  };
  // 极简 cookie 罐：只用于验证"同一浏览器会话"标记
  Object.defineProperty(document, 'cookie', {
    get() { return [...cookies].map(([k, v]) => k + '=' + v).join('; '); },
    set(raw) {
      const s = String(raw).split(';')[0];
      const i = s.indexOf('=');
      if (i < 0) return;
      const k = s.slice(0, i);
      const v = s.slice(i + 1);
      if (!v || /Max-Age=0/i.test(String(raw))) cookies.delete(k);
      else cookies.set(k, v);
    },
  });
  const win = {
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture: !!capture }),
  };
  win.parent = opts.parent || win;
  if (opts.storageFactory) Object.defineProperty(win, 'localStorage', { get: opts.storageFactory });
  else Object.defineProperty(win, 'localStorage', { get: () => mapStore(local) });
  Object.defineProperty(win, 'sessionStorage', { get: () => mapStore(session) });
  const location = { reload() {} };
  new Function('window', 'document', 'location', SRC)(win, document, location);
  return { win, document, appended, listeners, local, session, cookies, location };
}

test('存储正常：探测后不留数据，不弹警告、不拦输入', () => {
  const { win, appended, listeners, local } = loadGuard();
  assert.equal(win.ChezzleStorageGuard.blocked, false);
  assert.equal(appended.length, 0, '不创建警告层/成功弹窗');
  assert.equal(listeners.length, 0, '不拦截输入');
  assert.equal(local.size, 0, '探测 key 用完即删');
});

test('setItem 抛异常（Safari 无痕）：全屏警告 + 拦输入 + 禁止继续', () => {
  const { win, appended, listeners } = loadGuard({
    storageFactory: () => ({
      setItem() { throw new Error('QuotaExceededError'); },
      getItem() { return null; },
      removeItem() {},
    }),
  });
  assert.equal(win.ChezzleStorageGuard.blocked, true);
  assert.equal(win.__CZ_STORAGE_BLOCKED, true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].id, 'czStorageBlock');
  assert.match(appended[0].innerHTML, /无法保存游戏数据/);
  assert.match(appended[0].innerHTML, /无痕/, '原因里要提到无痕模式');
  assert.ok(listeners.some((l) => l.type === 'keydown' && l.capture), '键盘在捕获阶段拦截');
  assert.ok(listeners.some((l) => l.type === 'touchstart' && l.capture), '触摸输入也要拦');
});

test('localStorage 被完全禁用（getter 抛 SecurityError）同样拦截', () => {
  const { win, appended } = loadGuard({ storageFactory: () => { throw new Error('SecurityError'); } });
  assert.equal(win.ChezzleStorageGuard.blocked, true);
  assert.equal(appended.length, 1);
});

test('写入成功但读回不一致（存储被截断/只读）也算不可用', () => {
  const { win } = loadGuard({
    storageFactory: () => ({ setItem() {}, getItem() { return null; }, removeItem() {} }),
  });
  assert.equal(win.ChezzleStorageGuard.blocked, true, '读回校验失败 → 视为无法保存');
});

test('markTest：写入测试标记；同一浏览器会话（刷新）不提前弹成功', () => {
  const local = new Map();
  const session = new Map();
  const cookies = new Map();
  const a = loadGuard({ localStorage: local, sessionStorage: session, cookies });
  const at = a.win.ChezzleStorageGuard.markTest();
  assert.ok(at > 0, '返回写入时间戳');
  assert.equal(a.win.ChezzleStorageGuard.testPending(), true);
  assert.equal(local.size, 1);
  assert.ok(cookies.size > 0, '写入会话 cookie（同浏览器会话内跨标签识别；重启后浏览器会清掉）');

  // 刷新页面（会话 cookie 仍在）→ 不能提前显示成功
  const b = loadGuard({ localStorage: local, sessionStorage: session, cookies });
  assert.equal(b.appended.length, 0, '同会话刷新不弹成功');
  assert.equal(b.win.ChezzleStorageGuard.testPending(), true, '标记保留，等真正退出重进');
});

test('同一会话新开标签（sessionStorage 空、cookie 在）：也不提前弹成功', () => {
  const local = new Map();
  const cookies = new Map();
  const a = loadGuard({ localStorage: local, sessionStorage: new Map(), cookies });
  a.win.ChezzleStorageGuard.markTest();
  const b = loadGuard({ localStorage: local, sessionStorage: new Map(), cookies });
  assert.equal(b.appended.length, 0, '新标签不弹成功');
  assert.equal(b.win.ChezzleStorageGuard.testPending(), true);
});

test('markTest 后完全退出浏览器（会话 cookie 清空、sessionStorage 可能被 Chrome 恢复）：标记还在 → 弹成功并清除标记', () => {
  const local = new Map();
  const session = new Map();
  const cookies = new Map();
  const a = loadGuard({ localStorage: local, sessionStorage: session, cookies });
  a.win.ChezzleStorageGuard.markTest();

  // 模拟「继续浏览上次打开的网页」：Chrome 会恢复 sessionStorage，但会话 cookie 被清掉
  const restoredSession = new Map([['chezzle-storage-test-session-v1', 'stale-restored-token']]);
  cookies.clear();
  const b = loadGuard({ localStorage: local, sessionStorage: restoredSession, cookies });
  const ok = b.appended.find((n) => n.id === 'czStorageTestOk');
  assert.ok(ok, '会话 cookie 已清 → 应判为新会话并弹成功提示（不能被恢复的 sessionStorage 挡住）');
  assert.match(ok.innerHTML, /本地存储正常/);
  assert.equal(b.win.ChezzleStorageGuard.testPending(), false, '弹完清掉标记');
  assert.equal(local.size, 0);
  assert.equal(cookies.size, 0, '测试 cookie 也清掉');
});

test('标记丢失（无痕关窗/清数据）：不弹成功，也不会误报别的弹窗', () => {
  const local = new Map();
  const session = new Map();
  const a = loadGuard({ localStorage: local, sessionStorage: session });
  a.win.ChezzleStorageGuard.markTest();
  // 无痕窗口关闭：localStorage / sessionStorage 全部清空
  local.clear();
  session.clear();
  const b = loadGuard({ localStorage: local, sessionStorage: session });
  assert.equal(b.win.ChezzleStorageGuard.testPending(), false);
  assert.equal(b.appended.length, 0, '没检测到标记就什么都不弹（用户按提示理解为无法保存）');
});

test('SPA iframe 里不重复消费测试标记（只在顶层页面弹一次）', () => {
  const local = new Map();
  local.set('chezzle-storage-test-v1', JSON.stringify({ v: 1, token: 't1', at: Date.now() }));
  const parent = {}; // 模拟 iframe：parent !== window
  const { appended, win } = loadGuard({ localStorage: local, sessionStorage: new Map(), parent });
  assert.equal(appended.length, 0, 'iframe 不弹');
  assert.equal(win.ChezzleStorageGuard.testPending(), true, '标记仍留给顶层页面');
});
