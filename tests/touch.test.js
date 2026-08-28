// ============================================================================
// 移动端触控测试
// 覆盖：设备检测/覆盖开关、摇杆 5 向吸附（上/左上/右上/左/右，下半圆不触发）、
//       几何布局（摇杆半圆、按钮 2×2 与物品栏不重叠）、TouchUI 单点/多点管线
//       （摇杆→control、按钮 按住/边缘、物品栏选格、滴管点击滴液、玻璃段拖动、
//       死亡轻触重开）、移动端相机视野放大。
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
import { inventorySlotRects, uiMargins } from '../src/level/click.js';

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
