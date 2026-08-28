// ============================================================================
// 移动端触控测试
// 覆盖：设备检测/覆盖开关、摇杆 5 向吸附（上/左上/右上/左/右，下半圆不触发）、
//       几何布局（摇杆半圆、按钮 2×2 与物品栏不重叠）、TouchUI 单点/多点管线
//       （摇杆→control、按钮 按住/边缘、物品栏选格、滴管点击滴液、玻璃段拖动、
//       死亡轻触重开）、竖屏（请旋转设备）触点冻结、移动端相机视野放大。
// ============================================================================

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player, Inventory } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Dropper } from '../src/objects/dropper.js';
import { Beaker } from '../src/objects/beaker.js';
import { Camera } from '../src/render/camera.js';
import { CFG } from '../src/core/config.js';
import {
  TouchUI, joyInput, joyGeom, touchButtonRects, isTouchDevice, forceTouch,
} from '../src/core/touch.js';
import { inventorySlotRects, uiMargins, overviewButtonRect, handleSceneClick } from '../src/level/click.js';

const W = 844;
const H = 390;

function fakeCanvas(w = W, h = H) {
  return {
    width: w,
    height: h,
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  };
}

function flatScene() {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  return scene;
}

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(1 / 30);
}

after(() => forceTouch(false));

// ---- 1. 设备检测 -------------------------------------------------------------
test('设备检测：node/无触屏环境为桌面；forceTouch 可覆盖', () => {
  forceTouch(false);
  assert.equal(isTouchDevice(), false, '默认（无 window/无触屏）= 桌面');
  forceTouch(true);
  assert.equal(isTouchDevice(), true, 'forceTouch(true) 覆盖为移动端');
});

// ---- 2. 摇杆 5 向吸附 --------------------------------------------------------
test('摇杆 5 向吸附：上/左上/右上/左/右，下半圆一律不触发', () => {
  const R = CFG.touch.joyR;
  // 死区
  assert.deepEqual(joyInput(5, 0, R), { left: false, right: false, jump: false, sx: 0, sy: 0 });
  assert.deepEqual(joyInput(0, 10, R), { left: false, right: false, jump: false, sx: 0, sy: 0 }, '正下方=中性');
  // 5 向
  assert.equal(joyInput(100, 0, R).right, true, '右');
  assert.equal(joyInput(-100, 0, R).left, true, '左');
  assert.equal(joyInput(0, -100, R).jump, true, '上');
  assert.equal(joyInput(0, -100, R).left, false);
  assert.equal(joyInput(120, -100, R).right && joyInput(120, -100, R).jump, true, '右上=右+跳');
  assert.equal(joyInput(-120, -100, R).left && joyInput(-120, -100, R).jump, true, '左上=左+跳');
  // 下倾：仅水平（不跳）
  const dl = joyInput(-60, 60, R);
  assert.equal(dl.left, true, '左下倾=左');
  assert.equal(dl.jump, false, '左下倾不跳');
  const dr = joyInput(60, 60, R);
  assert.equal(dr.right, true, '右下倾=右');
  assert.equal(dr.jump, false, '右下倾不跳');
  // 接近竖直：小横向分量仍算"上"（不误判斜向）
  const up = joyInput(-20, -100, R);
  assert.equal(up.jump, true, '轻微偏左仍算上');
  assert.equal(up.left, false, '轻微偏左不算左上');
  // 大幅偏左倾斜：算左上（跳+左）
  const ul = joyInput(-80, -60, R);
  assert.equal(ul.jump && ul.left, true, '明显向左上=左上');
});

// ---- 2b. 摇杆起手容错圈 + 启动滞回 -------------------------------------------
test('摇杆容错：起手偏出圈内不动（点歪不跳错方向）；已启动后同幅度保持方向', () => {
  const R = CFG.touch.joyR;
  const ring = R * CFG.touch.joyDead;
  // 用户场景：想右走、出手偏左上方 ~33px（≈0.27R，旧死区 0.22R 已越界→左上跳）
  const off = joyInput(-30, -15, R);
  assert.deepEqual(off, { left: false, right: false, jump: false, sx: 0, sy: 0 }, '起手在容错圈内 → 完全不动');
  assert.ok(ring > 33, `容错圈 ≥33px：${ring.toFixed(0)}px`);
  // 已启动（engaged=true）：同样幅度 → 维持方向（滞回，不回抖）
  const on = joyInput(-30, -15, R, true);
  assert.ok(on.left || on.jump, '已启动后同幅度 → 方向保持');
  // 超出容错圈 → 正常 5 向吸附
  const big = joyInput(-90, -60, R);
  assert.ok(big.left && big.jump, '大偏移正常吸附');
});

// ---- 2c. TouchUI 用户场景：点歪起手 → 拖右 → 只向右走 -------------------------
test('摇杆：起手偏左 30px 先不动（不左跳），拖向右侧才向右走', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  run(scene, 40);
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  const g = joyGeom(W, H, ui.insets);
  // 起手偏左上 30px（旧逻辑：立即 左上=左跳）
  assert.equal(ui.down(1, g.cx - 30, g.cy - 15), 'joy');
  assert.equal(scene.control.size, 0, '起手偏左 → 完全不动');
  run(scene, 10);
  assert.ok(p.x >= 500 - 0.01, '玩家没左移');
  // 拖向右侧 → 只有右（无左、无跳）
  ui.move(1, g.cx + 70, g.cy - 2);
  assert.equal(scene.control.has('right'), true, '拖右 = 右走');
  assert.equal(scene.control.has('left'), false, '不左走');
  assert.equal(scene.control.has('jump'), false, '不上跳');
  ui.up(1);
});

// ---- 3. 几何布局 -------------------------------------------------------------
test('几何：摇杆半圆在左下、按钮 2×2 贴物品栏上沿、互不重叠', () => {
  const g = joyGeom(W, H, {});
  assert.equal(g.cx, 14 + CFG.touch.joyR, '圆心 x = 左边距+半径');
  assert.ok(g.cy < H && g.cx - g.R >= 0, '半圆在屏幕内左下');
  const slots = new Array(5).fill(null);
  const rects = touchButtonRects(W, H, slots, {});
  assert.equal(rects.length, 4);
  const keys = rects.map((r) => r.key).sort();
  assert.deepEqual(keys, ['collect', 'grab', 'place', 'use']);
  // 按钮块与物品栏不重叠（都在屏幕内；物品栏在按钮下方）
  const inv = inventorySlotRects(W, H, slots, { bottom: 10, right: 10 });
  const invTop = Math.min(...inv.map((r) => r.y));
  for (const r of rects) {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.size <= W && r.y + r.size <= H, '按钮在屏内');
    assert.ok(r.y + r.size <= invTop, '按钮在物品栏上方');
  }
  // 安全区边距生效
  const rects2 = touchButtonRects(W, H, slots, { bottom: 21, right: 44 });
  assert.ok(rects2[0].x < rects[0].x, '安全区右缘内收 → 按钮块左移');
  assert.ok(rects2[0].y < rects[0].y, '安全区上移');
  // 物品栏触屏边距：与桌面不同但命中几何一致（HUD/触控共用 uiMargins）
  const scene = flatScene();
  scene._touchUI = { enabled: () => true, insets: { bottom: 21, right: 44 } };
  const m = uiMargins(scene);
  assert.deepEqual(m, { bottom: 31, right: 54 }, '超屏边距 = 安全区+固定');
  delete scene._touchUI;
  assert.deepEqual(uiMargins(scene), { bottom: 10, right: 10 }, '无触控=桌面默认');
});

// ---- 4. TouchUI：摇杆 → control -------------------------------------------------
test('摇杆：按住左=control.left（玩家左移），上左=跳+左，抬指全部释放', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  run(scene, 40); // 落地
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  const g = joyGeom(W, H, ui.insets);
  // 按在半圆内（圆心附近）→ 中性
  assert.equal(ui.down(1, g.cx, g.cy - 20), 'joy');
  assert.equal(scene.control.has('left'), false);
  // 滑到左侧
  ui.move(1, g.cx - 90, g.cy - 2);
  assert.equal(scene.control.has('left'), true, '左滑=左走');
  assert.equal(scene.control.has('jump'), false, '纯左不跳');
  const x0 = p.x;
  run(scene, 20);
  assert.ok(p.x < x0 - 40, `左移生效：${x0.toFixed(1)} → ${p.x.toFixed(1)}`);
  // 滑到左上：跳+左
  ui.move(1, g.cx - 60, g.cy - 70);
  assert.equal(scene.control.has('left') && scene.control.has('jump'), true, '左上=跳+左');
  // 滑到上（接近竖直）：只跳不横
  ui.move(1, g.cx + 5, g.cy - 95);
  assert.equal(scene.control.has('jump'), true);
  assert.equal(scene.control.has('left'), false, '正上不横走');
  assert.equal(scene.control.has('right'), false);
  // 抬指：全部释放
  ui.up(1);
  assert.equal(scene.control.has('left') || scene.control.has('jump'), false, '抬指释放');
});

// ---- 5. TouchUI：右下按钮按住/边缘 + 多点 -------------------------------------
test('按钮：按下=keydown(pressed+control)，抬指=keyup；摇杆+按钮多点并行', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  run(scene, 2);
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  const rects = ui.buttonRects();
  const byKey = Object.fromEntries(rects.map((r) => [r.key, r]));
  const center = (r) => ({ x: r.x + r.size / 2, y: r.y + r.size / 2 });
  // Q 收集：边缘触发（一 tick 后 pressed 清空、control 保持到抬指）
  const q = center(byKey.collect);
  assert.equal(ui.down(2, q.x, q.y), 'btn');
  assert.equal(scene.pressed.has('collect') && scene.control.has('collect'), true);
  run(scene, 1);
  assert.equal(scene.pressed.has('collect'), false, 'pressed 每 tick 清空');
  assert.equal(scene.control.has('collect'), true, 'control 按住保持');
  ui.up(2);
  assert.equal(scene.control.has('collect'), false, '抬指释放');
  // C 按住 = 集气长按语义（control.has(grab)）
  const cBtn = center(byKey.grab);
  ui.down(3, cBtn.x, cBtn.y);
  assert.equal(scene.control.has('grab'), true, 'C 按住');
  // 摇杆 + C 键多点并行
  const g = joyGeom(W, H, ui.insets);
  ui.down(1, g.cx - 60, g.cy - 60); // 左上（135° 扇区 = 左+跳）
  assert.equal(scene.control.has('left') && scene.control.has('jump') && scene.control.has('grab'), true, '多点并存');
  ui.up(3);
  assert.equal(scene.control.has('grab'), false);
  assert.equal(scene.control.has('left'), true, '摇杆不受按钮抬指影响');
  ui.up(1);
  assert.equal(scene.control.has('left'), false, '摇杆抬指释放');
});

// ---- 6. TouchUI：物品栏选格 / 提示按钮 -----------------------------------------
test('HUD 命中：物品栏选格与提示按钮在触控管线里消费（点哪是哪）', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  const slots = p.inventory.slots;
  const rects = inventorySlotRects(W, H, slots, uiMargins(scene));
  // 选第 3 格（index 2）
  const r = rects[2];
  assert.equal(ui.down(9, r.x + r.size / 2, r.y + r.size / 2), 'ui');
  assert.equal(p.inventory.selected, 2, '选中物品栏第 3 格');
  ui.up(9);
  // 提示按钮（右上）
  assert.equal(ui.down(10, W - 40, 20), 'ui');
});

// ---- 7. TouchUI：场景管线（滴管点击滴液 + 玻璃段拖动） -------------------------
test('场景触点：点击胶头滴一滴；长按玻璃段拖动滴管位置', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const p = new Player({ x: 430, y: 620, mass: 30, id: 'p1' });
  scene.addObject(p);
  const beaker = new Beaker({ x: 460, y: 660, w: 60, h: 60, volume: 150, solutes: {} });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 500, y: 640, substance: 'HCl', capacity: 50, drop: 1 });
  scene.addObject(dr);
  run(scene, 40); // 落地 + 注册
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  // 世界→屏幕：scale=390/800，offsetX=(844-487.5)/2
  const sx = (wx) => wx * (H / 800) + (W - 1000 * (H / 800)) / 2;
  const sy = (wy) => wy * (H / 800);
  // ① 点击胶头（快速抬起 <0.5s）= 滴一滴
  const bx = sx(dr.x + dr.w / 2);
  const by = sy(dr.y + 4); // 胶头区（world y ≤ dr.y+12）
  assert.equal(ui.down(1, bx, by), 'scene', '触点进场景管线');
  ui.up(1);
  assert.ok(Math.abs(beaker.solution.mass('HCl') - 1) < 1e-9, `点击胶头应滴 1g：${beaker.solution.mass('HCl')}`);
  // ② 玻璃段拖动（不改位置不许滴）：按住 → 移动 → 拖动
  const gx = sx(dr.x + dr.w / 2);
  const gy = sy(dr.y + 24); // 玻璃段（world y > dr.y+12）
  assert.equal(ui.down(2, gx, gy), 'scene');
  const x0 = dr.x;
  ui.move(2, gx + 300, gy);
  ui.up(2);
  assert.ok(dr.x > x0 + 200, `玻璃段拖动应右移：${x0.toFixed(1)} → ${dr.x.toFixed(1)}`);
  // 拖动未滴（仍 1g）
  assert.ok(Math.abs(beaker.solution.mass('HCl') - 1) < 1e-9, '拖动不滴液');
});

// ---- 7b. 锁定滴管（noCarry）：不可拖动，胶头仍可滴 --------------------------
test('锁定滴管：玻璃段按下拖动无效（位置不变）；胶头点击仍滴液', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const p = new Player({ x: 430, y: 620, mass: 30, id: 'p1' });
  scene.addObject(p);
  const beaker = new Beaker({ x: 460, y: 660, w: 60, h: 60, volume: 150, solutes: {} });
  scene.addObject(beaker);
  const dr = new Dropper({ x: 500, y: 640, substance: 'HCl', capacity: 50, drop: 1, noCarry: true });
  scene.addObject(dr);
  run(scene, 40);
  assert.equal(dr.isDraggable, false, '锁定的滴管不可拖动');
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  const sx = (wx) => wx * (H / 800) + (W - 1000 * (H / 800)) / 2;
  const sy = (wy) => wy * (H / 800);
  // 玻璃段：按下 → 拖 300px → 抬起：位置不动、不滴
  const gx = sx(dr.x + dr.w / 2);
  const gy = sy(dr.y + 24);
  ui.down(2, gx, gy);
  ui.move(2, gx + 300, gy);
  ui.up(2);
  assert.ok(Math.abs(dr.x - 500) < 1e-6, `锁定滴管不应被拖动：x=${dr.x.toFixed(1)}`);
  assert.equal(beaker.solution.mass('HCl'), 0, '拖动不滴液');
  // 胶头：快速点击 = 仍可滴 1g（锁定≠不工作，固定装置照常滴加）
  const bx = sx(dr.x + dr.w / 2);
  const by = sy(dr.y + 4);
  ui.down(1, bx, by);
  ui.up(1);
  assert.ok(Math.abs(beaker.solution.mass('HCl') - 1) < 1e-9, '胶头点击照常滴液');
});

// ---- 8. 死亡轻触重开 -----------------------------------------------------------
test('死亡状态：轻触屏幕 = 重开（restart）', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  scene.setStatus('died');
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  // 不真的 location.reload —— 用指向断言：restart 会调 location.reload（node 无 location，静默）
  assert.equal(ui.down(1, 400, 200), 'died');
  assert.equal(scene.status, 'died', '重开由页面刷新完成');
});

// ---- 9. 移动端相机视野 ---------------------------------------------------------
test('相机 mobileViewH：横屏放大视野、竖屏保持桌面逻辑', () => {
  const cam = new Camera({ viewW: 1000, viewH: 800, worldW: 1500, worldH: 800 });
  const desk = cam.compute(844, 390, null);
  assert.ok(Math.abs(desk.scale - 0.4875) < 1e-9, `桌面 scale=${desk.scale}`);
  cam.mobileViewH = CFG.touch.viewH;
  const mob = cam.compute(844, 390, null);
  assert.ok(mob.scale > 0.6, `移动端 scale=${mob.scale}（应明显放大）`);
  // 竖屏：不放大（沿用桌面逻辑）
  const port = cam.compute(390, 844, null);
  assert.ok(port.scale < mob.scale, `竖屏 scale=${port.scale}`);
});

// ---- 10. TouchUI 竖屏判定 ------------------------------------------------------
test('isPortrait：竖屏画布（触屏端）为 true', () => {
  forceTouch(true);
  const ui = new TouchUI(fakeCanvas(390, 844), () => null);
  assert.equal(ui.isPortrait(), true);
  const ui2 = new TouchUI(fakeCanvas(844, 390), () => null);
  assert.equal(ui2.isPortrait(), false);
  forceTouch(false);
  assert.equal(ui.isPortrait(), false, '桌面端不做竖屏限制');
});

// ---- 10b. 竖屏（请旋转设备）：一切触点不吃，无法游玩 ---------------------------
test('竖屏：触点一律 rot，摇杆/按钮/场景输入全冻结；旋转中抬指仍清理', () => {
  forceTouch(true);
  const canvas = fakeCanvas(390, 844); // 竖屏
  const scene = flatScene();
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  run(scene, 40); // 落地
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  scene._touchUI = ui;
  assert.equal(ui.isPortrait(), true, '竖屏判定成立');
  // 摇杆区按下 → rot，不写任何输入
  const g = joyGeom(390, 844, ui.insets);
  assert.equal(ui.down(1, g.cx - 60, g.cy - 60), 'rot', '摇杆不吃');
  assert.equal(scene.control.size, 0, '无输入写入');
  // 场景区 / 按钮区 / 物品栏区 同样不吃
  assert.equal(ui.down(2, 300, 300), 'rot', '场景不吃');
  assert.equal(ui.down(3, 300, 60), 'rot', '按钮/HUD 不吃');
  assert.equal(handleSceneClick(scene, null, canvas, 40, 30), false, '鼠标点击管线同样冻结');
  const x0 = p.x;
  run(scene, 20);
  assert.equal(p.x, x0, '玩家不动（无输入泄漏）');
  // 横屏按下（摇杆激活）→ 转竖屏 → move 无效、up 仍释放（清理不设竖屏门槛）
  canvas.width = W; canvas.height = H; // 转回横屏
  const gl = joyGeom(W, H, ui.insets);
  assert.equal(ui.down(4, gl.cx - 90, gl.cy - 4), 'joy');
  assert.equal(scene.control.has('left'), true, '横屏可操作');
  canvas.width = 390; canvas.height = 844; // 竖屏（按住中）
  ui.move(4, 100, 100);
  ui.up(4);
  assert.equal(scene.control.size, 0, '抬指释放（竖屏不拦清理）');
});

// ---- 11. 鸟瞰手势：单指平移 / 双指捏合缩放 / 返回按钮退出 ----------------------
test('鸟瞰触控：单指拖动平移、双指捏合缩放、点返回退出', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1500, worldH: 800 });
  scene.setOverview(true);
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  // 先放大（fit 视图与世界同大时无平移余量），单指拖动：内容跟随手指（视窗原点左移）
  scene.camera.zoomOverview(2, W / 2, H / 2, W, H);
  assert.equal(ui.down(1, 400, 200), 'ov', '鸟瞰触点进手势管线');
  const ox0 = scene.camera._ov.ox;
  ui.move(1, 500, 200);
  assert.ok(scene.camera._ov.ox < ox0, '右拖 → 世界内容跟随手指右移');
  assert.equal(ui.up(1), undefined);
  // 双指捏合：距离变大 → 放大；中点保持
  const scale0 = scene.camera._ov.scale;
  ui.down(2, 300, 200);
  ui.down(3, 500, 200);
  ui.move(2, 250, 200); // 指距 300 → 350：放大
  const scale1 = scene.camera._ov.scale;
  assert.ok(scale1 > scale0, `捏开放大：${scale0.toFixed(3)} → ${scale1.toFixed(3)}`);
  ui.up(2);
  ui.up(3);
  assert.equal(ui.ovTouches.size, 0, '抬指清理');
  // 返回按钮：退出鸟瞰
  const b = overviewButtonRect(W);
  assert.equal(ui.down(4, b.x + b.w / 2, b.y + b.h / 2), 'ui');
  assert.equal(scene.overview, false, '返回按钮退出鸟瞰');
});

// ---- 12. 正常模式：触点点鸟瞰按钮进入（handleSceneClick 路径） ------------------
test('鸟瞰按钮（触屏）：TouchUI 命中 → toggleOverview', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  const b = overviewButtonRect(W);
  assert.equal(ui.down(1, b.x + 10, b.y + 10), 'ui', '按钮点击被 HUD 消费');
  assert.equal(scene.overview, true, '进入鸟瞰');
  ui.up(1);
});

// ---- 13. 鸟瞰下 releaseAll 兜底 ------------------------------------------------
test('鸟瞰：releaseAll 清空手势触点（失焦/切场景不泄漏）', () => {
  forceTouch(true);
  const canvas = fakeCanvas();
  const scene = flatScene();
  scene.setOverview(true);
  const ui = new TouchUI(canvas, () => ({ scene, hud: null }));
  ui.down(1, 400, 200);
  ui.down(2, 500, 220);
  assert.equal(ui.ovTouches.size, 2);
  ui.releaseAll();
  assert.equal(ui.ovTouches.size, 0, '全部清空');
});
