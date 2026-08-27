// ============================================================================
// 滴管（Dropper）+ 场景点击管线测试
// 覆盖：点击滴液入容器（溶质/水）、无容器不滴、耗尽、容量约束、管内颜色、
//       点击管线（提示按钮/物品栏/物体命中）、导出构建（.dropper 链）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Dropper } from '../src/objects/dropper.js';
import { Beaker } from '../src/objects/beaker.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Camera } from '../src/render/camera.js';
import { handleSceneClick } from '../src/level/click.js';

const TICK = 1 / 30;
function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

function flatScene(worldW = 1000, worldH = 800) {
  const scene = new Scene({ worldW, worldH });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  return scene;
}

// ---- 1. 滴入烧杯（溶质） ----------------------------------------------------
test('滴管点击向正下方烧杯滴液：溶质增加、管内剩余减少', () => {
  const scene = flatScene();
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150, solutes: {} });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 425, y: 615, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  run(scene, 2); // 注册容器/对象
  assert.equal(dr._containerBelow(scene), beaker, '滴管正下方应判定为烧杯');
  const ok = dr.onTap(scene);
  assert.equal(ok, true, '应成功滴液');
  assert.ok(Math.abs(beaker.solution.mass('HCl') - 1) < 1e-9, `HCl 应增加 1g：${beaker.solution.mass('HCl')}`);
  assert.ok(Math.abs(dr.liquid - 49) < 1e-9, `剩余应减 1g：${dr.liquid}`);
  // 再滴 3 次
  dr.onTap(scene); dr.onTap(scene); dr.onTap(scene);
  assert.ok(Math.abs(beaker.solution.mass('HCl') - 4) < 1e-9, `累计 4g：${beaker.solution.mass('HCl')}`);
  assert.ok(Math.abs(dr.liquid - 46) < 1e-9, `剩余 46g：${dr.liquid}`);
});

// ---- 2. 滴入药品池 + 滴 H2O 走"水"字段 --------------------------------------
test('滴管向药品池滴液；滴 H2O 增加溶液水量（不当溶质入账）', () => {
  const scene = flatScene();
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: {} });
  scene.addObject(pool);
  const dr = new Dropper({ x: 420, y: 640, substance: 'H2O', capacity: 20, drop: 2 });
  scene.addObject(dr);
  run(scene, 2);
  dr.onTap(scene);
  dr.onTap(scene);
  assert.ok(Math.abs(pool.solution.water - (200 + 4)) < 1e-9, `水应增加 4：${pool.solution.water}`);
  assert.equal(pool.solution.has('H2O'), false, 'H2O 不应作为溶质入账');
  // 滴 CuSO4（有色溶质进池）
  const dr2 = new Dropper({ x: 420, y: 640, substance: 'CuSO4', capacity: 50, drop: 0.5 });
  scene.addObject(dr2);
  dr2.onTap(scene);
  assert.ok(Math.abs(pool.solution.mass('CuSO4') - 0.5) < 1e-9, `CuSO4 0.5g：${pool.solution.mass('CuSO4')}`);
});

// ---- 3. 无容器/耗尽 -----------------------------------------------------------
test('滴管下方无容器不滴；滴空后不再滴', () => {
  const scene = flatScene();
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  const dr = new Dropper({ x: 500, y: 500, substance: 'HCl', capacity: 1, drop: 0.5 });
  scene.addObject(dr);
  run(scene, 2);
  assert.equal(dr.onTap(scene), false, '下方无容器 → 不滴');
  assert.equal(dr.liquid, 1, '剩余不变');
  // 放到烧杯上方：滴 2 次耗尽
  const beaker = new Beaker({ x: 480, y: 660, w: 60, h: 60, volume: 150 });
  scene.addObject(beaker);
  dr.x = 500; dr.y = 622; // bottom=660 在烧杯口上方
  assert.equal(dr.onTap(scene), true, '第一次滴出');
  assert.ok(Math.abs(dr.liquid - 0.5) < 1e-9);
  assert.equal(dr.onTap(scene), true, '第二次滴出');
  assert.ok(dr.liquid < 1e-9, `耗尽：${dr.liquid}`);
  assert.equal(dr.onTap(scene), false, '滴空后不再滴');
  assert.ok(Math.abs(beaker.solution.mass('HCl') - 1) < 1e-9, '总量 1g 守恒');
});

// ---- 4. 容器判定边界：水平不对齐不算；高度不限（下面有即可滴） -------------
test('容器判定：水平不在口内不算；悬在口上方任意高度都判定（用户要求）', () => {
  const scene = flatScene();
  scene.addObject(new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150 }));
  // 水平不对齐（x=200，不在杯口 400-460 内）→ 不算
  const drOff = new Dropper({ x: 200, y: 500, substance: 'HCl', capacity: 10, drop: 0.5 });
  scene.addObject(drOff);
  run(scene, 2);
  assert.equal(drOff._containerBelow(scene), null, '水平不对齐不应判定');
  // 悬在口上方很高（距口 108px）→ 仍然判定（高度不限）
  const drHi = new Dropper({ x: 425, y: 500, substance: 'HCl', capacity: 10, drop: 0.5 });
  scene.addObject(drHi);
  run(scene, 2);
  assert.equal(drHi._containerBelow(scene), scene.containers[0], '高度不应限制（下面有即可）');
});

// ---- 5. 管内颜色（溶液取色：水无色、有色溶质显色） --------------------------
test('管内液体颜色与溶液取色一致（H2O 淡、CuSO4 有色）', () => {
  const w = new Dropper({ x: 0, y: 0, substance: 'H2O', capacity: 50 });
  const c1 = w.liquidColor();
  const cu = new Dropper({ x: 0, y: 0, substance: 'CuSO4', capacity: 50 });
  const c2 = cu.liquidColor();
  assert.ok(c1 && typeof c1.color === 'string' && typeof c1.alpha === 'number', '水返回颜色对象');
  assert.ok(c2.alpha > c1.alpha, `CuSO4 应明显比水更不透明：水 ${c1.alpha}，CuSO4 ${c2.alpha}`);
  assert.notEqual(c1.color, c2.color, '颜色应不同');
});

// ---- 6. 点击管线：提示按钮 / 物品栏 / 物体命中 -------------------------------
test('handleSceneClick：提示按钮切换、点中滴管触发 onTap', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const beaker = new Beaker({ x: 400, y: 660, w: 60, h: 60, volume: 150 });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 425, y: 622, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  const hud = { showTip: false, slotSize: 36 };
  const canvas = { width: 1000, height: 800 };
  // 世界 (430, 630) → 屏幕 (430, 630)（等比例 1:1、无缩放时）
  const hit = handleSceneClick(scene, hud, canvas, 430, 630);
  assert.equal(hit, true, '点击滴管应被消费');
  assert.ok(Math.abs(beaker.solution.mass('HCl') - 1) < 1e-9, '点击滴管后溶液增加');
  // 提示按钮
  handleSceneClick(scene, hud, canvas, canvas.width - 40, 20);
  assert.equal(hud.showTip, true, '提示按钮切换');
  handleSceneClick(scene, hud, canvas, canvas.width - 40, 20);
  assert.equal(hud.showTip, false);
  // 空白处：不消费错误物体
  assert.equal(handleSceneClick(scene, hud, canvas, 900, 700), false, '空白点击不消费');
});

// ---- 7. camera 跟随时的屏幕→世界换算 ----------------------------------------
test('screenToWorld：相机跟随玩家时点击命中仍正确（非居中）', async () => {
  const { screenToWorld } = await import('../src/level/click.js');
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 3000, worldH: 800 });
  scene.player = { x: 2000, y: 700, w: 80, h: 90 }; // 玩家在右：相机跟随 → 窗口右移
  const canvas = { width: 1000, height: 800 };
  const w = screenToWorld(scene, canvas, 500, 400);
  // 窗口：cx=2040, vx=1000 → ox=1540；scale=1；offsetX=(1000-1000)/2 - 1540 = -1540
  assert.ok(Math.abs(w.x - (500 + 1540)) < 1e-9, `world.x=${w.x}（应 ≈2040）`);
});
