// ============================================================================
// 存档点 UI 测试（HUD 重开按钮 / 双击重开菜单 / 死亡点击 / 存档提示）
// ----------------------------------------------------------------------------
// 覆盖：
//   ① 几何：restartButtonRect 与右上按钮排（鸟瞰/全屏/提示）在桌面与触屏尺寸下
//      互不重叠；restartMenuLayout 两个按钮都在面板内、竖排不重叠、面板居中；
//   ② Scene 重开菜单暂停：openRestartMenu 后 step 不推进时间，close 后恢复；
//   ③ Savepoint.retryAfterDeath：无存档 → 整局重开；有存档 → 读档（真实小场景）；
//   ④ handleSceneClick：死亡点击（桌面）、重开按钮双击开菜单、菜单按钮命中/
//      无存档禁用/整局重开/点面板外关闭；
//   ⑤ HUD 绘制冒烟：restartMenu / saveToast 在最小 fake ctx 下不抛错，提示过期清理。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Scene } from '../src/core/scene.js';
import { Savepoint } from '../src/core/savepoint.js';
import { Hud } from '../src/render/hud.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Camera } from '../src/render/camera.js';
import {
  restartButtonRect,
  restartMenuLayout,
  overviewButtonRect,
  fullscreenButtonRect,
  handleSceneClick,
  handleScenePressDown,
  hudTopOffset,
} from '../src/level/click.js';
import { uiScaleOf, canvasLW, canvasLH } from '../src/render/canvas.js';

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

/** 矩形相交（严格相交；贴边不算重叠） */
function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 提示按钮的命中区（click.js handleSceneClick 现有内联几何，写死同源） */
function tipButtonRect(Wd, top = 10, right = 0) {
  return { x: Wd - right - 84, y: top, w: 76, h: 34 };
}

/** 与 handleSceneClick 同口径：画布坐标 → HUD 坐标空间（kUi 换算） */
function hitPoint(canvas, hx, hy) {
  const k = uiScaleOf(canvas);
  return { x: hx * k, y: hy * k, k, W: canvasLW(canvas) / k, H: canvasLH(canvas) / k };
}

// ---- 1. 顶部按钮排几何 --------------------------------------------------------
test('几何：重开按钮在右上按钮排最左，与鸟瞰/全屏/提示按钮互不重叠', () => {
  // 精确公式（绘制与命中共用）
  assert.deepEqual(restartButtonRect(1440, 10, 0, true), { x: 1168, y: 10, w: 52, h: 34 }, '带全屏：让出全屏位');
  assert.deepEqual(restartButtonRect(1440, 10, 0, false), { x: 1218, y: 10, w: 52, h: 34 }, '不带全屏：左移一格');
  assert.deepEqual(restartButtonRect(844, 10, 21, true), { x: 551, y: 10, w: 52, h: 34 }, '右侧安全区生效');

  for (const [Wd, Hd, right, label] of [[1440, 900, 0, '桌面'], [844, 390, 0, '触屏']]) {
    const top = 10;
    const rWithFs = restartButtonRect(Wd, top, right, true);
    const rNoFs = restartButtonRect(Wd, top, right, false);
    const ov = overviewButtonRect(Wd, top, right);
    const fs = fullscreenButtonRect(Wd, top, right);
    const tip = tipButtonRect(Wd, top, right);
    // 带全屏时（触屏且支持全屏）：重开与全屏/鸟瞰/提示都不重叠
    assert.equal(overlap(rWithFs, fs), false, `${label}：重开与全屏按钮不重叠`);
    assert.equal(overlap(rWithFs, ov), false, `${label}：重开与鸟瞰按钮不重叠`);
    assert.equal(overlap(rWithFs, tip), false, `${label}：重开与提示按钮不重叠`);
    // 不带全屏时（桌面/不支持全屏的触屏）：与鸟瞰/提示不重叠（全屏按钮不绘制）
    assert.equal(overlap(rNoFs, ov), false, `${label}：不带全屏的重开与鸟瞰不重叠`);
    assert.equal(overlap(rNoFs, tip), false, `${label}：不带全屏的重开与提示不重叠`);
    // 按钮排从左到右：重开 < 全屏 < 鸟瞰 < 提示
    assert.ok(rWithFs.x + rWithFs.w < fs.x, `${label}：重开在全屏左侧`);
    assert.ok(fs.x + fs.w < ov.x, `${label}：全屏在鸟瞰左侧`);
    assert.ok(ov.x + ov.w < tip.x, `${label}：鸟瞰在提示左侧`);
    // 都在屏内
    assert.ok(rNoFs.x >= 0 && rWithFs.x >= 0, `${label}：重开按钮不越左缘`);
  }
});

test('几何：重开菜单面板居中、两个按钮在面板内且竖排不重叠', () => {
  for (const [Wd, Hd] of [[1440, 900], [844, 390]]) {
    const L = restartMenuLayout(Wd, Hd);
    assert.ok(Math.abs(L.panel.w - Math.min(400, Wd * 0.84)) < 1e-9, `${Wd}×${Hd}：面板宽 min(400, W*0.84)`);
    assert.equal(L.panel.h, 214, '面板高 214');
    assert.ok(Math.abs((L.panel.x + L.panel.w / 2) - Wd / 2) < 1e-9, '水平居中');
    assert.ok(Math.abs((L.panel.y + L.panel.h / 2) - Hd / 2) < 1e-9, '垂直居中');
    for (const key of ['checkpoint', 'full']) {
      const r = L[key];
      assert.ok(r.x >= L.panel.x && r.x + r.w <= L.panel.x + L.panel.w, `${key} 在面板内（水平）`);
      assert.ok(r.y >= L.panel.y && r.y + r.h <= L.panel.y + L.panel.h, `${key} 在面板内（垂直）`);
      assert.equal(r.h, 46, `${key} 按钮高 46`);
      assert.ok(r.w > 0, `${key} 按钮宽为正`);
    }
    assert.ok(L.checkpoint.y + L.checkpoint.h <= L.full.y, '「回到存档点」在上、「整局重开」在下，不重叠');
    assert.equal(overlap(L.checkpoint, L.full), false, '两个按钮互不重叠');
  }
});

// ---- 2. Scene 重开菜单暂停 ----------------------------------------------------
test('重开菜单：打开时暂停模拟（step 不推进时间），关闭后恢复；死亡时不可打开', () => {
  const scene = new Scene({});
  scene.status = 'running';
  assert.equal(scene.openRestartMenu(), true, '运行中可打开');
  assert.equal(scene.restartMenuOpen, true);
  const t0 = scene.time;
  scene.step(1 / 30);
  assert.equal(scene.time, t0, '菜单打开时 step 不推进时间');
  assert.equal(scene.closeRestartMenu(), true, '可关闭');
  scene.step(1 / 30);
  assert.ok(scene.time > t0, '关闭后恢复推进');
  // 死亡/通关/鸟瞰状态不允许打开（打开 = 暂停，会和遮罩/鸟瞰输入打架）
  scene.status = 'died';
  assert.equal(scene.openRestartMenu(), false, '死亡时不可打开菜单');
  scene.status = 'running';
  scene.setOverview(true);
  assert.equal(scene.openRestartMenu(), false, '鸟瞰时不可打开菜单');
  scene.setOverview(false);
});

// ---- 3. 死亡后点屏幕（retryAfterDeath / handleSceneClick 桌面鼠标） ------------
test('retryAfterDeath：无存档 → 整局重开；有存档 → 原地读档回存档点', () => {
  // ① 无存档：走 scene.restart（stub 计数，不真的刷新页面）
  Savepoint.clear();
  const noSave = new Scene({});
  noSave.status = 'died';
  let restarts = 0;
  noSave.restart = () => { restarts++; };
  assert.equal(Savepoint.retryAfterDeath(noSave), 'restart');
  assert.equal(restarts, 1, '无存档时整局重开');

  // ② 有存档：真实小场景（空场景即可捕获/恢复），读档原地恢复、不刷新
  Savepoint.clear();
  const scene = new Scene({});
  scene.status = 'running';
  scene.time = 12.5;
  assert.equal(Savepoint.save(scene, { id: 'cp-ui' }), true, '存档成功');
  scene.time = 99;
  scene.status = 'died';
  let restarts2 = 0;
  scene.restart = () => { restarts2++; };
  assert.equal(Savepoint.retryAfterDeath(scene), 'restored', '有存档时读档');
  assert.equal(restarts2, 0, '有存档时不整局重开');
  assert.equal(scene.status, 'running', '读档后回到运行态');
  assert.ok(Math.abs(scene.time - 12.5) < 1e-9, '游戏时间恢复到存档时刻');
  assert.equal(Savepoint.has(scene), true, '读档不清存档（可重复读）');
  Savepoint.clear();
});

test('handleSceneClick（桌面）：死亡时点击屏幕 = 重开（无存档）/ 回存档点（有存档）', () => {
  const canvas = fakeCanvas();
  // ① 无存档 → restart
  Savepoint.clear();
  const a = new Scene({});
  a.status = 'running';
  let restarts = 0;
  a.restart = () => { restarts++; };
  a.status = 'died';
  const { x, y } = hitPoint(canvas, W / 2, H / 2);
  assert.equal(handleSceneClick(a, null, canvas, x, y), true, '死亡点击被消费');
  assert.equal(restarts, 1, '无存档 → 整局重开');
  // ② 有存档 → 读档（不 restart）
  Savepoint.clear();
  const b = new Scene({});
  b.status = 'running';
  b.time = 3.25;
  assert.equal(Savepoint.save(b), true);
  b.time = 50;
  b.status = 'died';
  let restarts2 = 0;
  b.restart = () => { restarts2++; };
  assert.equal(handleSceneClick(b, null, canvas, x, y), true);
  assert.equal(restarts2, 0, '有存档 → 不重开');
  assert.equal(b.status, 'running', '读档回到运行态');
  assert.ok(Math.abs(b.time - 3.25) < 1e-9, '状态恢复到存档时刻');
  Savepoint.clear();
});

// ---- 4. 重开按钮双击 + 菜单命中 -----------------------------------------------
test('重开按钮：单击不开菜单（只记时刻），400ms 内双击打开重开选择菜单', () => {
  Savepoint.clear();
  const canvas = fakeCanvas();
  const scene = new Scene({});
  scene.status = 'running';
  const top = hudTopOffset(scene, uiScaleOf(canvas));
  const r = restartButtonRect(W, top, 0, false); // 桌面：不带全屏按钮
  const px = r.x + r.w / 2;
  const py = r.y + r.h / 2;
  assert.equal(handleSceneClick(scene, null, canvas, px, py), true, '单击被消费');
  assert.equal(scene.restartMenuOpen, false, '单击不打开菜单');
  assert.ok(scene._restartTapAt > 0, '单击记录双击时刻');
  assert.equal(handleSceneClick(scene, null, canvas, px, py), true, '第二击');
  assert.equal(scene.restartMenuOpen, true, '400ms 内双击 → 打开菜单');
  assert.equal(scene._restartTapAt, 0, '打开后清空双击时刻（三击不会反复切换）');
  scene.closeRestartMenu();
});

test('重开菜单：按钮命中（无存档禁用 / 整局重开 / 点面板外关闭）', () => {
  Savepoint.clear();
  const canvas = fakeCanvas();
  const scene = new Scene({});
  scene.status = 'running';
  scene.openRestartMenu();
  const L = restartMenuLayout(W, H);
  const at = (rect) => hitPoint(canvas, rect.x + rect.w / 2, rect.y + rect.h / 2);
  // 无存档：主按钮禁用（点了不响应、菜单保持打开）
  const cp = at(L.checkpoint);
  assert.equal(handleSceneClick(scene, null, canvas, cp.x, cp.y), true, '菜单点击永远被消费');
  assert.equal(scene.restartMenuOpen, true, '无存档时「回到存档点」不响应，菜单保持打开');
  // 面板空白处：吞掉但菜单不关
  const blank = hitPoint(canvas, L.panel.x + 20, L.panel.y + 20);
  assert.equal(handleSceneClick(scene, null, canvas, blank.x, blank.y), true);
  assert.equal(scene.restartMenuOpen, true, '面板内空白不关闭');
  // 点面板外 → 关闭
  const outside = hitPoint(canvas, 4, H - 4);
  assert.equal(handleSceneClick(scene, null, canvas, outside.x, outside.y), true);
  assert.equal(scene.restartMenuOpen, false, '点面板外关闭菜单');
  // 整局重开：清存档 + 关菜单 + scene.restart
  scene.openRestartMenu();
  let restarts = 0;
  scene.restart = () => { restarts++; };
  const fl = at(restartMenuLayout(W, H).full);
  assert.equal(handleSceneClick(scene, null, canvas, fl.x, fl.y), true);
  assert.equal(restarts, 1, '「整局重开」→ scene.restart');
  assert.equal(scene.restartMenuOpen, false, '整局重开后菜单关闭');
});

test('重开菜单：有存档时「回到存档点」→ 读档并自动关菜单', () => {
  Savepoint.clear();
  const canvas = fakeCanvas();
  const scene = new Scene({});
  scene.status = 'running';
  scene.time = 7.5;
  assert.equal(Savepoint.save(scene), true);
  scene.time = 30;
  scene.openRestartMenu();
  assert.equal(scene.restartMenuOpen, true);
  const cp = restartMenuLayout(W, H).checkpoint;
  const p = hitPoint(canvas, cp.x + cp.w / 2, cp.y + cp.h / 2);
  assert.equal(handleSceneClick(scene, null, canvas, p.x, p.y), true);
  assert.equal(scene.restartMenuOpen, false, '读档自动关菜单');
  assert.equal(scene.status, 'running');
  assert.ok(Math.abs(scene.time - 7.5) < 1e-9, '回到存档时刻');
  Savepoint.clear();
});

// ---- 5. 菜单打开/死亡时世界按下管线冻结 ----------------------------------------
test('重开菜单打开/死亡时：场景按下管线冻结（点击不穿透到世界物体）', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.camera = new Camera({ viewW: 1000, viewH: 800, worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  scene.status = 'running';
  let taps = 0;
  const target = {
    id: 'tap-target', x: 400, y: 500, w: 80, h: 80, isDraggable: false,
    onTap: () => { taps++; return true; },
  };
  scene.addObject(target);
  const canvas = fakeCanvas();
  const cam = scene.camera.compute(W, H, scene.player);
  const px = (target.x + target.w / 2) * cam.scale + cam.offsetX;
  const py = (target.y + target.h / 2) * cam.scale + cam.offsetY;
  // 菜单打开：按下不触发世界物体
  scene.openRestartMenu();
  assert.equal(handleScenePressDown(scene, canvas, px, py), false, '菜单打开时按下管线冻结');
  assert.equal(taps, 0, '世界物体未被触发');
  scene.closeRestartMenu();
  // 正常态：同一位置命中并触发（证明上一步的 false 不是坐标算错）
  assert.equal(handleScenePressDown(scene, canvas, px, py), true, '正常态命中');
  assert.equal(taps, 1, '正常态 onTap 触发');
  // 死亡：同样冻结（该点击属于"点击屏幕重开"语义）
  scene.status = 'died';
  assert.equal(handleScenePressDown(scene, canvas, px, py), false, '死亡时按下管线冻结');
  assert.equal(taps, 1, '死亡时世界物体不被触发');
  scene.status = 'running';
  // 菜单暂停（Scene 已保证）：世界不推进
  scene.openRestartMenu();
  const t0 = scene.time;
  scene.step(1 / 30);
  assert.equal(scene.time, t0, '菜单打开时世界不推进');
  scene.closeRestartMenu();
});

// ---- 6. HUD 绘制冒烟（restartMenu / saveToast；Node 无 DOM 用最小 fake ctx）-----
function fakeCtx() {
  const noop = () => {};
  return {
    canvas: { width: W, height: H },
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
    arc: noop, arcTo: noop, fill: noop, stroke: noop, fillRect: noop, quadraticCurveTo: noop,
    setLineDash: noop, translate: noop, rotate: noop, scale: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: (t) => ({ width: t.length * 8 }),
    fillText: noop, strokeText: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    font: '', textAlign: '', textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
  };
}

test('HUD 冒烟：restartMenu 绘制（开关两态）与 saveToast 淡入淡出/过期清理不抛错', () => {
  const scene = new Scene({});
  scene.status = 'running';
  const hud = new Hud(scene);
  const ctx = fakeCtx();
  // 菜单关闭：不绘制
  hud.restartMenu(ctx, scene, W, H, 0);
  assert.equal(hud._menuAt, null);
  // 菜单打开（无存档/有存档两态都画）
  scene.openRestartMenu();
  hud.restartMenu(ctx, scene, W, H, 0);
  assert.ok(hud._menuAt > 0, '菜单打开时记录入场时刻');
  assert.equal(Savepoint.has(scene), false);
  Savepoint.clear();
  scene.status = 'running';
  assert.equal(Savepoint.save(scene, { force: true }), true);
  hud.restartMenu(ctx, scene, W, H, 0); // 有存档（主按钮亮态）不抛错
  scene.closeRestartMenu();
  hud.restartMenu(ctx, scene, W, H, 0);
  assert.equal(hud._menuAt, null, '关闭后重置入场时刻');

  // 存档提示：存活期间绘制、过期后清理
  scene._saveToast = { text: '已存档', at: (typeof performance !== 'undefined' ? performance.now() : Date.now()), dur: 1600 };
  hud._leftH = 123;
  hud.saveToast(ctx, scene, 10);
  assert.ok(scene._saveToast, '未过期 → 保留（继续淡入淡出）');
  scene._saveToast.at -= 5000;
  hud.saveToast(ctx, scene, 10);
  assert.equal(scene._saveToast, null, '过期 → 清理（下一句提示重新创建）');
  hud.saveToast(ctx, scene, 10); // 无提示时直接返回
  Savepoint.clear();
});
