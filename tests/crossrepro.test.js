// 复现关键：组号跨场景互通 + 传送后玩家可见性（temple 无摆玩家）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Portal } from '../src/objects/portal.js';

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

function fakeCanvas() {
  return {
    width: 100, height: 100, style: {},
    addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {},
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 100, height: 80, left: 0, top: 0 }),
  };
}
function reg(M, name, build = (sc) => {}) {
  const sc = new Scene({ worldW: 3000, worldH: 800 });
  sc.status = 'running';
  build(sc);
  sc.multiscene = M;
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

test('复现用户场景：basin(g1) → temple portal1(g1) 传送后玩家在 temple 场景内可见', () => {
  const M = makeM();
  // basin：地板 + b_p1a（g1，switchId b_det 常开） + 玩家
  const basin = reg(M, 'basin', (sc) => {
    sc.addObject(new Floor({ x: 902, y: 700, w: 1158, h: 130, id: 'b_floorb' }));
    sc.addObject(new Floor({ x: 915, y: 523, w: 125, h: 20, id: 'floor1' }));
    sc.addObject(new Portal({ x: 1453, y: 631, w: 44, h: 64, color: '#c78bff', uses: 1, switchId: null, group: 'g1', id: 'b_p1a' }));
    sc.addObject(new Player({ x: 322, y: 602, substance: 'NaOH', mass: 30, id: 'player1' }));
  });
  // temple：地板 + portal1（g1 同组）
  const temple = reg(M, 'temple', (sc) => {
    sc.addObject(new Floor({ x: 5, y: 652, w: 417, h: 161, id: 'floor1' }));
    sc.addObject(new Portal({ x: 57, y: 583, w: 44, h: 64, color: '#c78bff', uses: 1, switchId: null, group: 'g1', id: 'portal1' }));
  });
  M.scenes.get('basin').active = true;
  M.current = 'basin';
  const pa = basin.byId['player1'];
  // 玩家走到 b_p1a 门口（直接放进门内）
  pa.x = 1453 + 44 / 2 - pa.w / 2;
  pa.y = 631 + 64 - pa.h;
  run(basin, 3);
  assert.equal(M.current, 'temple', '切换到 temple');
  assert.equal(temple.byId['player1'], pa, '玩家搬到了 temple');
  assert.ok(pa.x >= 0 && pa.x <= 3000 && pa.y >= 0 && pa.y <= 800, `玩家在 temple 世界内: (${pa.x.toFixed(0)}, ${pa.y.toFixed(0)})`);
  // 玩家应在 portal1 附近，可见（相机聚焦玩家）
  console.log(`传送后玩家: (${pa.x.toFixed(0)}, ${pa.y.toFixed(0)}) portal1 at (57,583)`);
  assert.ok(Math.abs(pa.x - 57) < 100, `玩家贴近 portal1: x=${pa.x.toFixed(0)}`);
});

test('复现：temple 直接启动（无摆玩家）→ buildAll 后 scene.player 为 null，玩家无从出现', () => {
  const M = makeM();
  const temple = reg(M, 'temple', (sc) => {
    sc.addObject(new Floor({ x: 5, y: 652, w: 417, h: 161, id: 'floor1' }));
    sc.addObject(new Portal({ x: 57, y: 583, w: 44, h: 64, color: '#c78bff', group: 'g1', id: 'portal1' }));
  });
  assert.equal(temple.player, null, 'temple 无摆放玩家 → scene.player 为 null');
});

test('复现：一次性跨场景门（uses:1）用一次后整组消失 → 组不互通', () => {
  const M = makeM();
  const basin = reg(M, 'basin', (sc) => {
    sc.addObject(new Floor({ x: 902, y: 700, w: 1158, h: 130, id: 'b_floorb' }));
    sc.addObject(new Portal({ x: 1453, y: 631, w: 44, h: 64, color: '#c78bff', uses: 1, switchId: null, group: 'g1', id: 'b_p1a' }));
    sc.addObject(new Player({ x: 1453, y: 600, substance: 'NaOH', mass: 30, id: 'player1' }));
  });
  const temple = reg(M, 'temple', (sc) => {
    sc.addObject(new Floor({ x: 5, y: 652, w: 417, h: 161, id: 'floor1' }));
    sc.addObject(new Portal({ x: 57, y: 583, w: 44, h: 64, color: '#c78bff', uses: 1, switchId: null, group: 'g1', id: 'portal1' }));
  });
  M.scenes.get('basin').active = true;
  M.current = 'basin';
  const pa = basin.byId['player1'];
  pa.x = 1453 + 22 - pa.w / 2;
  pa.y = 631 + 64 - pa.h;
  run(basin, 3);
  assert.equal(M.current, 'temple', '传送到 temple');
  // 门用尽后消失
  const basinPortal = basin.byId['b_p1a'];
  const templePortal = temple.byId['portal1'];
  assert.equal(basinPortal, undefined, 'basin 门用尽后消失');
  assert.equal(templePortal, undefined, 'temple 门用尽后消失');
  console.log('一次性门用尽后两扇都消失（跨场景）——若用户期待可反复传送，这就是"组不互通"');
});
