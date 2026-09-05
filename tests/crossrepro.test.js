// 复现关键：组号跨场景互通 + 传送后玩家可见性（temple 无摆玩家）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Portal } from '../src/objects/portal.js';
import { Extractor } from '../src/objects/extractor.js';
import { Renderer } from '../src/render/renderer.js';

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

// ---- 用户复现：跨场景传送后"画面里没有玩家" --------------------------------
// 根因：压力提取器（switchId=null）render 签名写成 render(ctx, scene)，渲染器实际传的是
// opts 对象 → _onTop(opts) 迭代 opts.objects（undefined）→ 抛异常 → Renderer.frame 抛出 →
// 游戏主循环 rAF 链断裂 → 传送进 temple 后首帧渲染即死循环：玩家悬在半空、gridOrigin
// 停在旧场景坐标（画在标牌/门后面）、画面永远不更新 = "画面里没有玩家"。

function fakeCanvas2() {
  return {
    width: 800, height: 600, style: {},
    addEventListener: () => {}, removeEventListener: () => {}, appendChild: () => {},
    getContext: () => ctxProxy(),
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
  };
}
function ctxProxy(store) {
  const calls = store ?? [];
  return new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      return (...args) => { calls.push([prop, args]); };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

test('复现用户场景：传送到含压力提取器的 temple 后，渲染帧不抛异常（此前 rAF 链断裂）', () => {
  const M = makeM();
  const basin = reg(M, 'basin', (sc) => {
    sc.addObject(new Floor({ x: 902, y: 700, w: 1158, h: 130, id: 'b_floorb' }));
    sc.addObject(new Portal({ x: 1453, y: 631, w: 44, h: 64, color: '#c78bff', uses: 1, switchId: null, group: 'g1', id: 'b_p1a' }));
    sc.addObject(new Player({ x: 322, y: 602, substance: 'NaOH', mass: 30, id: 'player1' }));
  });
  // temple = 用户关卡结构：floor + portal1(g1) + ★ 压力提取器（switchId=null！）
  const temple = reg(M, 'temple', (sc) => {
    sc.addObject(new Floor({ x: 5, y: 652, w: 417, h: 161, id: 'floor1' }));
    sc.addObject(new Floor({ x: 1249, y: 693, w: 549, h: 101, id: 'floor3' }));
    sc.addObject(new Portal({ x: 57, y: 583, w: 44, h: 64, color: '#c78bff', uses: 1, switchId: null, group: 'g1', id: 'portal1' }));
    sc.addObject(new Extractor({ x: 2078, y: 234, w: 43, h: 11, poolId: null, switchId: null, rate: 0.25, id: 'extractor1' }));
  });
  // 挂真实渲染器（game loop 用 active.renderer.frame —— 之前正是这里炸）
  temple.renderer = new Renderer(fakeCanvas2());
  M.scenes.get('basin').active = true;
  M.current = 'basin';
  const pa = basin.byId['player1'];
  pa.x = 1453 + 22 - pa.w / 2;
  pa.y = 631 + 64 - pa.h;
  run(basin, 3);
  assert.equal(M.current, 'temple', '传送到 temple');

  // 模拟游戏循环：temple 步进 + 渲染多帧（此帧此前必然抛异常）
  let threw = null;
  try {
    for (let i = 0; i < 5; i++) {
      temple.step(TICK);
      temple.renderer.frame(temple.objects, { hud: null, time: temple.time, scene: temple, focus: temple.player ?? null });
    }
  } catch (e) {
    threw = e;
  }
  assert.equal(threw, null, `渲染帧不应抛异常: ${threw?.message ?? ''}`);
  // 玩家可见性链：step 跑起来 → gridOrigin 跟随 x/y（渲染位置=逻辑位置）
  const p2 = temple.player;
  run(temple, 5);
  assert.ok(Math.abs(p2.gridOrigin.x - p2.x) < 1, `gridOrigin.x 应跟随 x: ${p2.gridOrigin.x} vs ${p2.x}`);
  assert.ok(Math.abs(p2.gridOrigin.y - p2.y) < 1, `gridOrigin.y 应跟随 y: ${p2.gridOrigin.y} vs ${p2.y}`);
});

test('压力提取器 render：opts 形式与无 scene 时不抛异常（签名兼容）', () => {
  const sc = new Scene({ worldW: 3000, worldH: 800 });
  sc.status = 'running';
  sc.addObject(new Floor({ x: 0, y: 652, w: 400, h: 161, id: 'floor1' }));
  const ex = new Extractor({ x: 2078, y: 234, w: 43, h: 11, poolId: null, switchId: null, rate: 0.25, id: 'extractor1' });
  sc.addObject(ex);
  const calls = [];
  const ctx = ctxProxy(calls);
  // 渲染器约定：render(ctx, opts)
  assert.doesNotThrow(() => ex.render(ctx, { scene: sc, time: 0 }), '带 scene 的 opts 渲染');
  assert.doesNotThrow(() => ex.render(ctx, {}), '空 opts 渲染（无 scene → 非 active，不探测）');
  assert.doesNotThrow(() => ex.render(ctx), '无参数渲染');
  // 玩家站在压力提取器上 → active 判定（update 走场景内探测）
  const p = new Player({ x: 2078, y: 234 - 90 - 4, substance: 'NaOH', mass: 30, id: 'p1' });
  sc.addObject(p);
  run(sc, 2);
  assert.equal(ex._onTop(sc), true, '玩家站上 → 压力激活');
});
