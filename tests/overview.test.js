// ============================================================================
// 鸟瞰模式（灵魂出窍）+ 相机移动端偏置 + 调试模式 URL 参数化 测试
// 覆盖：鸟瞰视图适配/平移/缩放/钳制、Scene.setOverview 状态与输入清理、
//       点击管线在鸟瞰下的守卫、鸟瞰按钮几何与命中（返回/进入）、
//       移动端 focusBias（玩家画面偏上）、.debugmode() 废弃为无副作用。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Camera } from '../src/render/camera.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { LevelBuilder } from '../src/level/builder.js';
import { CFG } from '../src/core/config.js';
import {
  handleSceneClick,
  handleScenePressDown,
  overviewButtonRect,
  fullscreenButtonRect,
  screenToWorld,
} from '../src/level/click.js';

const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`);

function fakeCanvas(w = 800, h = 400) {
  return { width: w, height: h, style: {} };
}

function flatScene() {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 3000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3400, h: 100 }));
  scene.addObject(new Player({ x: 1500, y: 600, mass: 30, id: 'p1' }));
  scene.status = 'running';
  return scene;
}

// ---- 1. 鸟瞰视图：适配 / 平移 / 缩放 / 钳制 ---------------------------------
test('鸟瞰相机：整关适配、平移钳制、缩放锚点保持', () => {
  const cam = new Camera({ viewW: 1000, viewH: 800, worldW: 3000, worldH: 800 });
  // 初始视图 = fit 整关（3000×800 → 800×400 画布：scale = min(800/3000, 400/800) ≈ 0.2667）
  cam.enterOverview();
  const v0 = cam.compute(800, 400, null);
  approx(v0.scale, 800 / 3000, 'fit scale = 宽度比');
  assert.ok(v0.ox >= 0 && v0.ox <= 3000 - 800 / v0.scale, '视窗在世界内');
  // 视图高于世界（1500 > 800）→ 垂直居中
  approx(v0.oy, (800 - 400 / v0.scale) / 2, '垂直居中');

  // 平移：先放大（fit 视图与世界同大时无平移余量），再拖——屏幕 100px = 100/scale 世界单位
  cam.enterOverview();
  cam.zoomOverview(2, 400, 200, 800, 400);
  const s2 = cam.compute(800, 400, null).scale;
  const ox0 = cam.compute(800, 400, null).ox;
  cam.panOverview(100, 0, 800, 400);
  const ox1 = cam.compute(800, 400, null).ox;
  approx(ox1, ox0 - 100 / s2, '平移量 = 屏幕px / scale');

  // 平移钳制：疯狂右拖 → ox 停在 0（视窗不滑出世界左缘；ox -= dx/scale）
  cam.panOverview(99999, 0, 800, 400);
  approx(cam.compute(800, 400, null).ox, 0, 'ox 钳到 0');

  // 缩放锚点：光标 (400,200) 下的世界点在缩放前后不变
  cam.enterOverview();
  const v1 = cam.compute(800, 400, null);
  const wx = v1.ox + 400 / v1.scale;
  const wy = v1.oy + 200 / v1.scale;
  cam.zoomOverview(2, 400, 200, 800, 400);
  const v2 = cam.compute(800, 400, null);
  approx(v2.scale, v1.scale * 2, '放大 2×');
  approx(v2.ox + 400 / v2.scale, wx, '锚点世界 x 不动');
  approx(v2.oy + 200 / v2.scale, wy, '锚点世界 y 不动');

  // 缩放下限：滚轮缩到底 = 整关一屏（不能再小），且视图大于世界 → 居中
  cam.zoomOverview(1e-6, 400, 200, 800, 400);
  const v3 = cam.compute(800, 400, null);
  approx(v3.scale, 800 / 3000, '最小 scale = fit');
  approx(v3.offsetX, (800 - 3000 * v3.scale) / 2, '水平居中');
});

// ---- 2. Scene.setOverview：状态 + 输入清理 + 相机联动 -----------------------
test('setOverview：切换状态、清空 control/pressed、相机进出台账、幂等', () => {
  const scene = flatScene();
  const p = scene.player;
  scene.control.add('left');
  scene.pressed.add('collect');
  scene._pressTap = { onTap: () => true };
  scene._drag = { obj: {} };

  assert.equal(scene.setOverview(true), true);
  assert.equal(scene.overview, true);
  assert.equal(scene.camera.overview, true, '相机进入鸟瞰');
  assert.equal(scene.control.size, 0, '持续输入清空');
  assert.equal(scene.pressed.size, 0, '边缘输入清空');
  assert.equal(scene._pressTap, null, '长按目标清空');
  assert.equal(scene._drag, null, '拖动清空');
  // 幂等：重复开启不重置相机视图（保留玩家拖到的位置）
  scene.camera.panOverview(50, 0, 800, 400);
  const kept = scene.camera._ov;
  scene.setOverview(true);
  assert.equal(scene.camera._ov, kept, '重复开启不重建视图');

  assert.equal(scene.toggleOverview(), false, 'toggle 退出');
  assert.equal(scene.overview, false);
  assert.equal(scene.camera.overview, false);
  assert.equal(scene.camera._ov, null, '退出清视图');
  assert.ok(Number.isFinite(p.x), '玩家不受影响');
});

// ---- 3. 鸟瞰下场景管线冻结 ---------------------------------------------------
test('鸟瞰：handleScenePressDown/Move/Up 冻结，点击只认返回按钮', () => {
  const scene = flatScene();
  const canvas = fakeCanvas();
  scene.setOverview(true);
  // 场景管线：全部拒绝
  assert.equal(handleScenePressDown(scene, canvas, 400, 200), false, '鸟瞰不进按下管线');
  assert.equal(scene._pressCand, null);
  // 点击空白：不消费（false）——交给拖动/缩放管线
  assert.equal(handleSceneClick(scene, null, canvas, 100, 100), false);
  assert.equal(scene.overview, true, '空白点击不退出');
  // 点击返回按钮：退出鸟瞰
  const b = overviewButtonRect(canvas.width);
  assert.equal(handleSceneClick(scene, null, canvas, b.x + b.w / 2, b.y + b.h / 2), false,
    '返回按钮在鸟瞰下不"消费"（避免吞掉手势），但已切换');
  assert.equal(scene.overview, false, '点击返回按钮退出鸟瞰');
});

// ---- 4. 鸟瞰/全屏按钮几何 + 正常模式进入鸟瞰 --------------------------------
test('按钮几何：鸟瞰在提示左侧、全屏在鸟瞰左侧、正常模式点击进入', () => {
  const W = 844;
  const ob = overviewButtonRect(W);
  const fb = fullscreenButtonRect(W);
  // 提示按钮：W-72..W-10（62×28）——全屏 ≤ 鸟瞰 ≤ 提示（同一行、留缝不重叠）
  assert.ok(ob.x + ob.w <= W - 72, '鸟瞰按钮不与提示按钮重叠');
  assert.ok(fb.x + fb.w <= ob.x, '全屏按钮不与鸟瞰按钮重叠');
  assert.equal(ob.h, 28, '同一行高度');
  assert.equal(fb.h, 28);

  // 正常模式：点击鸟瞰按钮进入
  const scene = flatScene();
  const canvas = fakeCanvas(W, 390);
  assert.equal(handleSceneClick(scene, null, canvas, ob.x + 10, ob.y + 10), true, '进入鸟瞰（消费）');
  assert.equal(scene.overview, true);
  scene.setOverview(false);
});

// ---- 5. 鸟瞰下 screenToWorld 与渲染同口径 ------------------------------------
test('鸟瞰：screenToWorld 走鸟瞰视图（与 compute 同一变换）', () => {
  const scene = flatScene();
  const canvas = fakeCanvas(800, 400);
  scene.setOverview(true);
  scene.camera.panOverview(120, 60, 800, 400);
  const v = scene.camera.compute(800, 400, null);
  const w = screenToWorld(scene, canvas, 300, 200);
  approx(w.x, v.ox + 300 / v.scale, '屏幕→世界 x 一致');
  approx(w.y, v.oy + 200 / v.scale, '屏幕→世界 y 一致');
});

// ---- 6. 移动端 focusBias：玩家画面偏上（不被 HUD 遮挡） ----------------------
test('移动端 focusBias：视窗中心下移 → 玩家屏幕 y 上移；桌面不受影响', () => {
  // focus 选取在钳制区间中部（世界 800 高、移动视野 560 → oy ∈ [0,240]）
  const focus = { x: 1400, y: 300, w: 60, h: 90 };
  const VH = CFG.touch.viewH;
  // 同为移动视野的两台相机：一台带偏置、一台临时关掉（同 scale，可直接比屏幕 y）
  const camA = new Camera({ viewW: 1000, viewH: 800, worldW: 3000, worldH: 800 });
  const camB = new Camera({ viewW: 1000, viewH: 800, worldW: 3000, worldH: 800 });
  camA.mobileViewH = VH;
  camB.mobileViewH = VH;
  const a = camA.compute(844, 390, focus);
  const saved = CFG.touch.focusBias;
  CFG.touch.focusBias = 0;
  const b = camB.compute(844, 390, focus);
  CFG.touch.focusBias = saved;
  // 世界→屏幕：screenY = worldY*scale + offsetY（offsetY 已含 -oy*scale 平移）
  const pcyA = (focus.y + focus.h / 2) * a.scale + a.offsetY;
  const pcyB = (focus.y + focus.h / 2) * b.scale + b.offsetY;
  assert.ok(pcyA < pcyB, `偏置后玩家画得更高：${pcyA.toFixed(0)} < ${pcyB.toFixed(0)}`);
  // 偏移量 = 视野高度 × focusBias × scale（未钳制段精确匹配）
  const expectShift = VH * saved * a.scale;
  assert.ok(Math.abs((pcyB - pcyA) - expectShift) < 1e-6, `偏移 ${pcyB - pcyA} ≈ ${expectShift}`);
  // 世界顶/底钳制：上缘放宽 padTop（可探出世界顶）、下缘放宽 biasY
  const topFocus = { x: 1400, y: -200, w: 60, h: 90 };
  const m2 = camA.compute(844, 390, topFocus);
  const padTop = VH * CFG.touch.padTop;
  assert.ok(m2.oy >= -padTop - 1e-9 && m2.oy < 0, `贴顶时探出世界顶但不超 padTop：oy=${m2.oy}`);
  // 桌面（mobileViewH=0）永远无偏置：跟随照常（世界宽 3000 > 视口 1000，横向有余量）
  const camDesk = new Camera({ viewW: 1000, viewH: 800, worldW: 3000, worldH: 800 });
  const d1 = camDesk.compute(844, 390, focus);
  const d2 = camDesk.compute(844, 390, { ...focus, x: focus.x + 50 });
  assert.ok(d1.scale < 1, '桌面 scale 独立');
  assert.ok(d2.ox > d1.ox, '桌面跟随不变（focus 右移 → 视窗右移）');
});

// ---- 6b. padTop 顶部探出：爬到世界顶相机跟进天空（双端） ----------------------
test('padTop：玩家爬高时视角继续上移（探出世界顶），玩家不被钉在屏幕顶缘', () => {
  // 玩家爬到 cy=100（世界顶部区域）——旧行为相机停在世界顶 oy=0，玩家被钉在
  // 屏幕最上缘、被左上卡片盖住；现在相机探出世界顶继续跟随 → 玩家画得更低
  const saved = CFG.touch.padTop;
  const mk = () => new Camera({ viewW: 1000, viewH: 800, worldW: 3000, worldH: 800 });
  const focusTop = { x: 1400, y: 55, w: 60, h: 90 };
  // 移动端
  const camM = mk();
  camM.mobileViewH = CFG.touch.viewH;
  const mOn = camM.compute(844, 390, focusTop);
  CFG.touch.padTop = 0;
  const mOff = mk(); mOff.mobileViewH = CFG.touch.viewH;
  const m0 = mOff.compute(844, 390, focusTop);
  CFG.touch.padTop = saved;
  assert.ok(mOn.oy < 0, `探出世界顶：oy=${mOn.oy}`);
  assert.ok(m0.oy === 0, '关闭 padTop 时相机停在世界顶');
  const pcyOn = 100 * mOn.scale + mOn.offsetY;
  const pcy0 = 100 * m0.scale + m0.offsetY;
  assert.ok(pcyOn > pcy0, `玩家离开屏幕顶缘：${pcyOn.toFixed(0)} > 钉顶 ${pcy0.toFixed(0)}`);
  // 桌面同样跟进（世界高=视口高 800 时旧相机完全不动，玩家贴顶被卡片挡）
  const camD = mk();
  const d = camD.compute(1100, 700, focusTop);
  assert.ok(d.oy < 0, `桌面也探出世界顶：oy=${d.oy}`);
  const dFloor = camD.compute(1100, 700, { x: 1400, y: 600, w: 60, h: 90 });
  assert.ok(dFloor.oy === 0, '地面时桌面相机不动（整关可见）');
});

// ---- 7. .debugmode() 废弃：不报错、不生效（node 无 location → 恒 false） -----
test('debugmode() 废弃为空操作；node 环境 build 后 debugMode 仍为 false', () => {
  const canvas = { width: 1100, height: 700, style: {}, getContext: () => ({}) };
  const L = new LevelBuilder(canvas, { worldW: 1500, worldH: 800 });
  const ret = L.debugmode();
  assert.equal(ret, L, '返回 this（链式兼容）');
  const scene = L.build();
  assert.equal(scene.debugMode, false, '调试模式不再由 .debugmode() 开启（URL ?debug=1）');
});

// ---- 8. 全屏助手：node 无 DOM 环境静默降级 -----------------------------------
test('fullscreen 助手：无 DOM 时不抛错、supported=false', async () => {
  const fs = await import('../src/core/fullscreen.js');
  assert.equal(fs.fullscreenSupported(), false);
  assert.equal(fs.isFullscreen(), false);
  assert.doesNotThrow(() => fs.toggleFullscreen());
  assert.doesNotThrow(() => fs.requestFullscreenOnce());
  assert.doesNotThrow(() => fs.exitFullscreen());
});
