// Multiscene 跨场景玩家落点：目标场景摆放玩家 = 传送落点（携带玩家落到其位置）
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 最小浏览器 stub（node --test 每文件独立进程）：switchTo 内部会 bindKeyboard 等
if (typeof window === 'undefined') {
  const noop = () => {};
  const el = () => ({
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    style: {}, setAttribute: noop, removeAttribute: noop,
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 100, height: 80, left: 0, top: 0 }),
  });
  globalThis.window = {
    addEventListener: noop, removeEventListener: noop,
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  globalThis.location = { search: '', href: 'http://localhost/x', origin: 'http://localhost', host: 'localhost' };
  globalThis.document = {
    hasFocus: () => true,
    head: el(), body: el(), documentElement: el(),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => el(), createTextNode: () => ({}),
    addEventListener: noop, removeEventListener: noop,
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
}

const { Multiscene } = await import('../src/level/multiscene.js');
const { Scene } = await import('../src/core/scene.js');
const { Player } = await import('../src/objects/player.js');
const { Floor } = await import('../src/objects/floor.js');

function fakeCanvas() {
  return {
    width: 100, height: 100, style: {},
    addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {},
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 100, height: 80, left: 0, top: 0 }),
  };
}

/** 手动注册场景（绕开 builder：Node 无浏览器 DOM；功能等价——scene 已 build） */
function reg(M, name, { playerAt = null, id = 'p_' + name } = {}) {
  const sc = new Scene({ worldW: 2000, worldH: 800 });
  sc.status = 'running';
  sc.addObject(new Floor({ x: 0, y: 760, w: 2000, h: 40, id: 'f_' + name }));
  if (playerAt) sc.addObject(new Player({ x: playerAt.x, y: playerAt.y, id }));
  M.scenes.set(name, {
    name, builder: null, scene: sc, canvas: fakeCanvas(),
    renderer: null, hud: null, plugins: null, built: true, active: false,
  });
  return sc;
}
function makeM() {
  return new Multiscene({ appendChild: () => {} }, { width: 100, height: 100, canvasFactory: fakeCanvas });
}

test('未传宽高 → 画布自适应窗口（逻辑=窗口，缓冲×dpr 高清）', () => {
  const M = new Multiscene({ appendChild: () => {} }, { canvasFactory: fakeCanvas });
  M.scene('auto');
  const c = M.scenes.get('auto').canvas;
  // window stub：innerWidth 1280 / innerHeight 800，dpr=1
  assert.equal(c.style.width, '1280px', 'CSS=窗口宽');
  assert.equal(c.style.height, '800px', 'CSS=窗口高');
  assert.equal(c.width, 1280, '缓冲=逻辑×dpr');
  assert.equal(c.height, 800);
});

test('container 是 <canvas> 时自动包装 div（旧导出模板兼容：场景画布不再成为不显示的 fallback）', () => {
  const parent = { insertBefore: (n) => { parent.first = n; } };
  const container = {
    tagName: 'CANVAS',
    style: { width: '1280px', height: '800px', display: 'block' },
    parentNode: parent,
    appendChild: () => {},
  };
  const M = new Multiscene(container, { canvasFactory: fakeCanvas });
  M.scene('a');
  const wrap = parent.first;
  assert.ok(wrap, '应创建包装 div 并插入原位置');
  assert.ok(wrap.style.cssText.includes('100vw'), '包装 div 全屏宽度（不依赖时序读数）');
  assert.ok(wrap.style.cssText.includes('100vh'), '包装 div 全屏高度');
  assert.equal(container.style.display, 'none', '原 canvas 隐藏（不再显示场景子画布）');
  assert.equal(M.container, wrap, 'Multiscene 内部容器 = 包装 div');
});

test('携带玩家落点是目标场景摆放玩家的位置', () => {
  const M = makeM();
  const a = reg(M, 'a', { playerAt: { x: 100, y: 600 } });
  const b = reg(M, 'b', { playerAt: { x: 1500, y: 500 } });
  const pa = a.player;
  M.scenes.get('a').active = true;
  M.current = 'a';
  M.switchTo('b');
  assert.equal(b.player, pa, '携带玩家替代目标场景摆放的玩家');
  assert.equal(Math.round(pa.x), 1500, '落到目标场景摆放玩家 x');
  assert.equal(Math.round(pa.y), 500, '落到目标场景摆放玩家 y');
});

test('摆放玩家位置优先于显式 spawn（用户约定：摆玩家=传送落点）', () => {
  const M = makeM();
  const a = reg(M, 'a', { playerAt: { x: 100, y: 600 } });
  reg(M, 'b', { playerAt: { x: 1500, y: 500 } });
  const pa = a.player;
  M.scenes.get('a').active = true;
  M.current = 'a';
  M.switchTo('b', { spawn: { x: 900, y: 620 } });
  assert.equal(Math.round(pa.x), 1500, '摆放玩家优先于 spawn');
  assert.equal(Math.round(pa.y), 500);
});

test('目标场景没摆玩家：位置保持原坐标（不漂移）', () => {
  const M = makeM();
  const a = reg(M, 'a', { playerAt: { x: 100, y: 600 } });
  reg(M, 'b');
  const pa = a.player;
  M.scenes.get('a').active = true;
  M.current = 'a';
  M.switchTo('b');
  assert.equal(Math.round(pa.x), 100, '无摆放玩家 → 原坐标');
  assert.equal(Math.round(pa.y), 600);
});

test('回程切换：切回原场景（玩家已携带位移）不回吐', () => {
  const M = makeM();
  const a = reg(M, 'a', { playerAt: { x: 100, y: 600 } });
  const b = reg(M, 'b', { playerAt: { x: 1500, y: 500 } });
  const pa = a.player;
  M.scenes.get('a').active = true;
  M.current = 'a';
  M.switchTo('b');
  M.switchTo('a'); // 回程：a 场景玩家对象已被搬走——应继续用携带玩家（同一对象）
  const aNow = M.scenes.get('a').scene;
  assert.equal(aNow.player, pa, '回程仍是同一个携带玩家对象');
});
