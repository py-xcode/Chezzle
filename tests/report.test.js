// 进度上报（levels/report.js）测试：关卡 id 判定、同步落盘/结算层、"未识别"兜底。
// 背景：用户报告"本地正常，但部署到 Pages 后提示未识别关卡 id · 累计 0 关"；
// 以及"通关第一屏退出后进度/弹窗像没保存"——记录不能排在 levels.json 请求后面。
// report.js 是浏览器 IIFE（依赖 window/document/localStorage/fetch），这里用最小桩跑真实文件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('levels/report.js', 'utf8');

/** 用最小 DOM/存储/定时器桩加载 report.js → { R, store, state, timers } */
function loadReport({ pathname = '/levels/tutorial.html', json = null, jsonOk = true, fetchPending = false } = {}) {
  const store = {};
  const state = { overlay: null, fill: null, fetchUrls: [], appended: [] };
  const el = () => ({
    style: {}, dataset: {}, offsetHeight: 30, textContent: '',
    setAttribute() {}, addEventListener() {}, appendChild() {}, querySelector: () => null,
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; },
  });
  const document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => el(),
    body: { appendChild: (n) => state.appended.push(n) },
    addEventListener() {},
    fullscreenElement: null,
  };
  const timers = [];
  const setIntervalShim = (fn) => { timers.push(fn); return timers.length - 1; };
  const clearIntervalShim = () => {};
  const fetchFn = async (u) => {
    state.fetchUrls.push(u);
    if (fetchPending) return new Promise(() => {});   // 永远不返回：模拟慢网/断网下的 levels.json
    if (!jsonOk) return { ok: false, status: 404, json: async () => { throw new Error('not json'); } };
    return { ok: true, status: 200, json: async () => json };
  };
  const win = { matchMedia: () => ({ matches: false }) };
  new Function('window', 'location', 'localStorage', 'document', 'fetch', 'navigator', 'matchMedia',
    'setInterval', 'clearInterval', SRC)(
    win, { pathname, search: '' }, { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    document, fetchFn, { maxTouchPoints: 0 }, () => ({ matches: false }), setIntervalShim, clearIntervalShim,
  );
  const R = win.ChezzleReport;
  globalThis.ChezzleReport = R;                    // 浏览器里 window 属性就是全局变量，桩里补上
  R.overlay = (id, total, why, opts) => { state.overlay = { id, total, why, opts }; };  // 只测记录逻辑，不建 DOM
  R._fillWin = (data) => { state.fill = data; };   // onWin 的异步补数据（DOM 刷新）也跳过
  return { R, win, store, state, timers };
}

const CFG = {
  tutorial: { id: 'tutorial', name: '新手引导', file: 'levels/tutorial.html' },
  levels: { H: [{ id: 'H-1', name: '氕', file: 'levels/level (29).html' }] },
};
const cleared = (store) => JSON.parse(store['chezzle-progress-v1']).cleared;

test('bind(scene, id)：正常登记 + 通关记录进 localStorage', async () => {
  const { R, store } = loadReport({ json: CFG });
  const handlers = {};
  const scene = { status: 'running', on: (ev, fn) => { handlers[ev] = fn; } };
  R.bind(scene, 'H-1');
  handlers.win();
  // 关键：win 事件同步处理时就已经落盘，不用等任何 fetch / 下一轮微任务
  assert.deepEqual(cleared(store), ['H-1'], '通关瞬间同步记录进度');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(cleared(store), ['H-1']);
});

test('★ 结算层与进度都必须先于 levels.json 请求：慢网下第一屏退出也不能丢', () => {
  const { R, store, state } = loadReport({ json: CFG, fetchPending: true });
  R.onWin(null, 'H-1');                             // 不 await：fetch 永远不会返回
  assert.deepEqual(cleared(store), ['H-1'], 'levels.json 还没回来，进度已经写入');
  assert.equal(state.overlay.id, 'H-1', 'DOM 结算层同步建立（画布不会再先画一帧"通关"面板）');
  assert.equal(state.overlay.total, 1);
});

test('★ bind 拿到 undefined 场景（导出脚本 byName 取空）时，id 仍记在**页面**上', async () => {
  // 用户 Pages 上的现象：取不到场景句柄时 bind 直接 return，id 丢失 → 未识别
  const { R, store } = loadReport({ json: CFG });
  R.bind(undefined, 'H-1');
  assert.equal(R.getLevelId(), 'H-1', '页面级 id 要留下来');
  await R.onWin(null);                       // 引擎兜底路径：没有任何显式 id
  assert.deepEqual(cleared(store), ['H-1']);
});

test('★ 文件名带 %20 时也能到 levels.json 反查（部署后 URL 一定被编码）', async () => {
  const { R, store, state } = loadReport({ pathname: '/Chezzle/levels/level%20(29).html', json: CFG });
  await R.onWin(null);
  assert.deepEqual(cleared(store), ['H-1']);
  assert.equal(state.fill.id, 'H-1');
  assert.equal(state.overlay.id, '', '反查完成前先按页面 id 建层，不能等 fetch');
});

test('★ Cloudflare Pages 的 clean URL（.html 被剥掉）也要认得出来', async () => {
  // 用户实测：chezzle-99w.pages.dev 上 /levels/level (29).html → 301 → /levels/level (29)
  const a = loadReport({ pathname: '/levels/level%20(29)', json: CFG });   // 无扩展名
  await a.R.onWin(null);
  assert.deepEqual(cleared(a.store), ['H-1'], 'clean URL（无 .html）');

  const b = loadReport({ pathname: '/levels/level%20(29)/', json: CFG });  // 目录形式
  await b.R.onWin(null);
  assert.deepEqual(cleared(b.store), ['H-1'], '目录形式（尾斜杠）');

  const c = loadReport({ pathname: '/levels/TUTORIAL', json: CFG });       // 大小写不同
  await c.R.onWin(null);
  assert.deepEqual(cleared(c.store), ['tutorial'], '大小写不敏感');
});

test('★ 部署在子目录（Pages）时按多套相对路径找 levels.json', async () => {
  const { R, state } = loadReport({ pathname: '/Chezzle/levels/level%20(29).html', json: CFG });
  await R.onWin(null);
  assert.ok(state.fetchUrls.some((u) => u.includes('levels.json')), '至少试过 levels.json');
  assert.equal(state.fill.id, 'H-1');
});

test('关卡表读不到/查不到 → id 空 + why 说明原因（不再只有一句泛泛提示）', async () => {
  const { R, store, state } = loadReport({ pathname: '/levels/unknown.html', jsonOk: false });
  await R.onWin(null);
  assert.equal(state.overlay.id, '');
  assert.equal(state.fill.id, '');
  assert.equal(store['chezzle-progress-v1'], undefined, '认不出关卡就不写脏数据');
  assert.match(state.fill.why, /关卡表|levels\.json/, 'why 要说清是读不到还是查不到');
});

test('通关记录幂等 + 累计数正确', async () => {
  const { R, store, state } = loadReport({ json: CFG });
  await R.onWin(null, 'H-1');
  await R.onWin(null, 'H-1');
  await R.onWin(null, 'tutorial');
  assert.deepEqual(cleared(store), ['H-1', 'tutorial']);
  assert.equal(state.fill.total, 2);
});

test('结算数据补齐：本次新解锁只列"通关前没解锁"的关卡', async () => {
  const cfg = {
    tutorial: CFG.tutorial,
    levels: {
      H: [{ id: 'H-1', name: '氕', file: 'levels/level1-1.html', requires: ['tutorial'] }],
      He: [{ id: 'He-1', name: '氦-4', file: 'levels/level2-1.html', requires: ['H-1'] }],
    },
  };
  const { R, store, state } = loadReport({ json: cfg });
  await R.onWin(null, 'H-1');
  assert.deepEqual(cleared(store), ['H-1']);
  assert.deepEqual(state.fill.newly.map((n) => n.id), ['He-1']);
});

test('★ 调试通关开关：levels.json 的 debugClickWin 控制 window.__CZ_DEBUG_CLICK_WIN', async () => {
  const on = loadReport({ json: { ...CFG, debugClickWin: true } });
  assert.equal(on.win.__CZ_DEBUG_CLICK_WIN, false, '读取完成前默认关闭');
  await on.R.onWin(null, 'H-1');
  assert.equal(on.win.__CZ_DEBUG_CLICK_WIN, true, '配置为 true 才开启');

  const off = loadReport({ json: { ...CFG, debugClickWin: false } });
  await off.R.onWin(null, 'H-1');
  assert.equal(off.win.__CZ_DEBUG_CLICK_WIN, false, '未配置/为 false 时不生效');
});
