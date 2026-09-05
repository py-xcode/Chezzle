// 传送门跨场景同色配对：Multiscene 关卡中，任何场景的同色门都配对——
// 玩家走进门 A（场景 a）→ 切到场景 b，落在对侧门 B 前。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 最小浏览器 stub（switchTo 内部会 bindKeyboard 等）
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
const { Portal } = await import('../src/objects/portal.js');

function fakeCanvas() {
  return {
    width: 100, height: 100, style: {},
    addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {},
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 100, height: 80, left: 0, top: 0 }),
  };
}
function reg(M, name) {
  const sc = new Scene({ worldW: 2000, worldH: 800 });
  sc.status = 'running';
  sc.addObject(new Floor({ x: 0, y: 760, w: 2000, h: 40, id: 'f_' + name }));
  sc.multiscene = M; // buildAll 注入（此处手动注册等价）
  M.scenes.set(name, {
    name, builder: null, scene: sc, canvas: fakeCanvas(),
    renderer: null, hud: null, plugins: null, built: true, active: false,
  });
  return sc;
}
function makeM() {
  return new Multiscene({ appendChild: () => {} }, { width: 100, height: 100, canvasFactory: fakeCanvas });
}

const TICK = 1 / 30;
function run(scene, n) { for (let i = 0; i < n; i++) scene.step(TICK); }

test('跨场景同色配对：走进场景a的门 → 切到场景b，落在对侧门前', () => {
  const M = makeM();
  const a = reg(M, 'a');
  const b = reg(M, 'b');
  // a：门 A（顶上有落脚地面）；b：门 B（同色）
  const gateA = new Portal({ x: 400, y: 600, w: 44, h: 64, color: '#ff00ff', id: 'A' });
  const gateB = new Portal({ x: 1500, y: 600, w: 44, h: 64, color: '#ff00ff', id: 'B' });
  a.addObject(gateA);
  b.addObject(gateB);
  const pa = new Player({ x: 410, y: 620, id: 'p' }); // 站在 A 门里
  a.addObject(pa);
  M.scenes.get('a').active = true;
  M.current = 'a';
  // 走进 A：update 驱动跨场景传送
  run(a, 2);
  assert.equal(M.current, 'b', '切换到对侧场景');
  assert.ok(pa._portalLast === gateB || pa.x > 1000, `玩家已移到 b 场景（x=${pa.x.toFixed(0)}）`);
  assert.equal(b.byId['p'], pa, '玩家对象在 b 场景');
  assert.equal(a.byId['p'], undefined, 'a 场景玩家已搬走');
  // 落点 = 对侧门前（脚底对齐 B 门底、水平居中）
  const gx = gateB.x + gateB.w / 2;
  assert.ok(Math.abs((pa.x + pa.w / 2) - gx) < 40, `水平贴近对侧门中心（${pa.x.toFixed(0)} vs ${gx.toFixed(0)}）`);
  assert.ok(pa.y < 640, `落点贴近对侧门（y=${pa.y.toFixed(0)}；门底 664）`);
});

test('跨场景门开关激活：开关未开不传', () => {
  const M = makeM();
  const a = reg(M, 'a');
  const b = reg(M, 'b');
  const gateA = new Portal({ x: 400, y: 600, w: 44, h: 64, color: '#00ff88', id: 'A', switchId: 'sw' });
  const gateB = new Portal({ x: 1500, y: 600, w: 44, h: 64, color: '#00ff88', id: 'B' });
  a.addObject(gateA);
  b.addObject(gateB);
  const pa = new Player({ x: 410, y: 620, id: 'p' });
  a.addObject(pa);
  M.scenes.get('a').active = true;
  M.current = 'a';
  run(a, 2);
  assert.equal(M.current, 'a', '开关未开不传送');
});

test('单场景行为不变：同色门仍在本场景配对（scene.multiscene 未挂）', () => {
  const sc = new Scene({ worldW: 2000, worldH: 800 });
  sc.status = 'running';
  sc.addObject(new Floor({ x: 0, y: 760, w: 2000, h: 40 }));
  const g1 = new Portal({ x: 400, y: 600, w: 44, h: 64, color: '#123456', id: 'g1' });
  const g2 = new Portal({ x: 1500, y: 600, w: 44, h: 64, color: '#123456', id: 'g2' });
  sc.addObject(g1);
  sc.addObject(g2);
  const pa = new Player({ x: 410, y: 620, id: 'p' });
  sc.addObject(pa);
  run(sc, 2);
  assert.ok(pa.x > 1000, `单场景同色门照常传送（x=${pa.x.toFixed(0)}）`);
});
