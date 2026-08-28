// ============================================================================
// 标签避让测试：HUD 占位矩形 + labelPlacement 挑位（被面板压住时挪开）
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { hudOccluders, labelPlacement } from '../src/render/label.js';

const W = 668;
const H = 360;

function fakeCtx() {
  return {
    canvas: { width: W, height: H },
    getTransform: () => ({ a: 0.7, b: 0, c: 0, d: 0.7, e: 0, f: 0 }),
  };
}

function sceneWith(opts = {}) {
  const scene = new Scene({ worldW: 3000, worldH: 800 });
  scene.status = 'running';
  scene.camera = { compute: () => ({ scale: 0.7, ox: 0, oy: 0, offsetX: 0, offsetY: 0 }) };
  if (opts.player !== false) {
    scene.addObject(new Player({ x: 500, y: 600, mass: 30, id: 'p1' }));
  }
  if (opts.touch) {
    scene._touchUI = { enabled: () => true, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
  }
  return scene;
}

// ---- 1. hudOccluders：桌面/触屏/鸟瞰 ----------------------------------------
test('hudOccluders：桌面 3 块（卡/右下带/顶栏按钮），触屏 +摇杆，鸟瞰只留顶栏', () => {
  const desk = hudOccluders(sceneWith(), W, H);
  assert.equal(desk.length, 3, `桌面 ${desk.length} 块`);
  // 左上信息卡（触屏顶部偏移 48 起）
  assert.ok(desk.some((r) => r.x <= 10 && r.y <= 60 && r.w >= 280), '含左上卡');
  // 右下带（物品栏+面板）贴右缘
  assert.ok(desk.some((r) => r.x + r.w >= W - 8 && r.y + r.h >= H - 8), '含右下带');
  // 顶栏按钮
  assert.ok(desk.some((r) => r.x >= W - 240 && r.w <= 240), '含顶栏按钮');

  const touch = hudOccluders(sceneWith({ touch: true }), W, H);
  assert.equal(touch.length, 4, '触屏多一块摇杆');
  const joy = touch[3];
  assert.ok(joy.x < 260 && joy.y + joy.h >= H - 20, `摇杆占左下：${JSON.stringify(joy)}`);

  const ov = sceneWith();
  ov.overview = true;
  assert.equal(hudOccluders(ov, W, H).length, 0, '鸟瞰：HUD 藏起，无占位');
});

// ---- 2. labelPlacement：空地原位 / 被压挪开 / 深埋推边缘 --------------------
test('labelPlacement：空白原位不动；压在摇杆上挪开且不再重叠；深埋右下带被推出', () => {
  const scene = sceneWith({ touch: true });
  const ctx = fakeCtx();

  // ① 屏幕中部偏左（桌面布局的空地；触屏下右下占位带很宽，只有更靠左才空）
  const deskScene = sceneWith();
  const free = labelPlacement(ctx, deskScene, { x: 300, y: 150, w: 120, h: 20 });
  assert.deepEqual(free, { dx: 0, dy: 0 }, '空地不挪');
  // 触屏布局下同一位置：右下按钮带从 x≈352 起，120 宽的标签压进带里 57%
  // → 必须被挪走，且挪到的是真空档（卡片右缘 298 与带左缘 352 之间的上方）
  const tMoved = labelPlacement(ctx, scene, { x: 300, y: 150, w: 120, h: 20 });
  assert.ok(tMoved.dx !== 0 || tMoved.dy !== 0, '触屏下压带必挪');
  const tRect = { x: 300 + tMoved.dx, y: 150 + tMoved.dy, w: 120, h: 20 };
  for (const o of hudOccluders(scene, W, H)) {
    const w = Math.min(tRect.x + 120, o.x + o.w) - Math.max(tRect.x, o.x);
    const h = Math.min(tRect.y + 20, o.y + o.h) - Math.max(tRect.y, o.y);
    assert.ok(!(w > 0 && h > 0), `触屏挪后仍重叠：${JSON.stringify(o)}`);
  }

  // ② 压在摇杆上（左下）→ 挪开后压住面积 ≤35%（左下角已被卡片/摇杆/右下带
  //    挤满，120 宽标签无全空位置——算法取边缘擦过最少的近点）
  const occ = hudOccluders(scene, W, H);
  const joy = occ[3];
  const lx = joy.x + joy.w / 2 - 60;
  const ly = joy.y + joy.h / 2 - 10;
  const moved = labelPlacement(ctx, scene, { x: lx, y: ly, w: 120, h: 20 });
  assert.ok(moved.dx !== 0 || moved.dy !== 0, '被压必挪');
  const movedRect = { x: lx + moved.dx, y: ly + moved.dy, w: 120, h: 20 };
  let movedOv = 0;
  for (const o of occ) {
    const w = Math.min(movedRect.x + movedRect.w, o.x + o.w) - Math.max(movedRect.x, o.x);
    const h = Math.min(movedRect.y + movedRect.h, o.y + o.h) - Math.max(movedRect.y, o.y);
    if (w > 0 && h > 0) movedOv += w * h;
  }
  assert.ok(movedOv <= 120 * 20 * 0.35, `压住面积可控：${(movedOv / 2400 * 100).toFixed(0)}%`);
  // 挪得不远（还在锚点附近，±220px 内）
  assert.ok(Math.hypot(moved.dx, moved.dy) < 220, `挪动距离可控：${Math.hypot(moved.dx, moved.dy)}`);

  // ③ 深埋右下带中央 → 至少被推到带外（escape 逻辑）
  const band = occ[1];
  const deep = labelPlacement(ctx, scene, { x: band.x + band.w / 2 - 60, y: band.y + band.h / 2 - 10, w: 120, h: 20 });
  const deepRect = { x: band.x + band.w / 2 - 60 + deep.dx, y: band.y + band.h / 2 - 10 + deep.dy, w: 120, h: 20 };
  let deepOv = 0;
  for (const o of occ) {
    const w = Math.min(deepRect.x + deepRect.w, o.x + o.w) - Math.max(deepRect.x, o.x);
    const h = Math.min(deepRect.y + deepRect.h, o.y + o.h) - Math.max(deepRect.y, o.y);
    if (w > 0 && h > 0) deepOv += w * h;
  }
  assert.ok(deepOv < 120 * 20 * 0.5, `深埋标签大部分被推出：overlap=${deepOv.toFixed(0)}`);
});

// ---- 3. 候选优先级：轻微压边只挪一点，不跳远处 ------------------------------
test('labelPlacement：轻微压边就近小挪，优先级贴原位', () => {
  const scene = sceneWith();
  const ctx = fakeCtx();
  // 顶栏按钮带下缘：矩形略微压入 → 小挪即可脱离
  const occ = hudOccluders(scene, W, H);
  const topBar = occ.find((r) => r.x >= W - 240);
  const r0 = { x: topBar.x + 40, y: topBar.y + topBar.h - 8, w: 120, h: 20 };
  const mv = labelPlacement(ctx, scene, r0);
  assert.ok(Math.hypot(mv.dx, mv.dy) < 90, `小挪即可：${Math.hypot(mv.dx, mv.dy)}`);
  const moved = { x: r0.x + mv.dx, y: r0.y + mv.dy, w: 120, h: 20 };
  const w = Math.min(moved.x + 120, topBar.x + topBar.w) - Math.max(moved.x, topBar.x);
  const h = Math.min(moved.y + 20, topBar.y + topBar.h) - Math.max(moved.y, topBar.y);
  assert.ok(!(w > 0 && h > 0), '脱离占位');
});
