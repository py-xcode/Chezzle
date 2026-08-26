// ============================================================================
// 物理模块单元测试（node:test）
// 覆盖：重力落地、跳跃、墙阻挡、推挤（链式/被墙挡）、物块堆叠、自动上台阶、接触事件。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Body } from '../src/physics/body.js';
import { CollisionSystem, ContactTracker, overlaps } from '../src/physics/collision.js';

const TICK = 1 / 30;
const G = 1200;

function stepN(sys, n, dyn, stat) {
  for (let i = 0; i < n; i++) sys.step(TICK, { dynamics: dyn, statics: stat });
}

// ---- 1. 重力落地 ------------------------------------------------------------
test('重力落地：物块下落并停在地板上', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const box = new Body({ x: 100, y: 100, w: 40, h: 40 });
  stepN(sys, 300, [box], [floor]);
  assert.equal(box.bottom, 700, '底部应停在地板顶');
  assert.ok(box.onGround, '应判定站在地面上');
  assert.equal(box.vel.y, 0);
});

// ---- 2. 跳跃 -----------------------------------------------------------------
test('跳跃：向上、到最高点后回落并落地', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const box = new Body({ x: 100, y: 660, w: 40, h: 40 });
  box.vel.y = -520;
  // 上升阶段
  let rose = false;
  let minY = Infinity;
  for (let i = 0; i < 90; i++) {
    sys.step(TICK, { dynamics: [box], statics: [floor] });
    if (box.y < 660) rose = true;
    minY = Math.min(minY, box.y);
    if (i === 10) assert.ok(box.y < 620, '跳跃初期应在空中'); // t≈0.33s，尚在上升
  }
  assert.ok(rose, '应离开地面');
  // 理论最高点：v²/2g = 520²/2400 ≈ 112.7px → 箱顶 y ≈ 660-112.7 ≈ 547
  assert.ok(minY < 660 - 100, `应达到较高位置，minY=${minY}`);
  assert.equal(box.bottom, 700, '应落回地面');
  assert.ok(box.onGround);
});

// ---- 3. 墙阻挡 ---------------------------------------------------------------
test('墙阻挡：水平移动撞墙后停下', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const wall = new Body({ x: 300, y: 300, w: 30, h: 400, static: true });
  const player = new Body({ x: 100, y: 660, w: 40, h: 40 });
  player.vel.x = 250;
  stepN(sys, 30, [player], [floor, wall]);
  assert.equal(player.right, 300, '右缘应被墙挡住');
  assert.ok(player.blockedX);
});

// ---- 4. 推挤物块 ---------------------------------------------------------------
test('推挤：玩家推动可推动物块', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 2000, h: 60, static: true });
  const block = new Body({ x: 300, y: 660, w: 40, h: 40, pushable: true });
  const player = new Body({ x: 200, y: 660, w: 40, h: 40 });
  player.vel.x = 250;
  stepN(sys, 120, [player, block], [floor]);
  assert.ok(block.x > 300 + 200, `物块应被推走，x=${block.x}`);
  assert.ok(Math.abs(player.right - block.left) < 1.5, '玩家应紧贴物块左侧');
});

// ---- 5. 推挤被墙挡 -----------------------------------------------------------
test('推挤被墙挡：玩家推不动且停下', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const wall = new Body({ x: 340, y: 300, w: 30, h: 400, static: true });
  const block = new Body({ x: 300, y: 660, w: 40, h: 40, pushable: true }); // 右缘=340 贴墙
  const player = new Body({ x: 200, y: 660, w: 40, h: 40 });
  player.vel.x = 250;
  stepN(sys, 30, [player, block], [floor, wall]);
  assert.equal(block.x, 300, '物块应原地不动');
  assert.ok(Math.abs(player.right - 300) < 1.5, '玩家应停在物块左侧');
  assert.ok(player.blockedX);
});

// ---- 6. 链式推挤 ---------------------------------------------------------------
test('链式推挤：一排物块被连续推动', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 2000, h: 60, static: true });
  const b1 = new Body({ x: 300, y: 660, w: 40, h: 40, pushable: true });
  const b2 = new Body({ x: 340, y: 660, w: 40, h: 40, pushable: true }); // 紧贴 b1
  const player = new Body({ x: 200, y: 660, w: 40, h: 40 });
  player.vel.x = 250;
  stepN(sys, 60, [player, b1, b2], [floor]);
  assert.ok(b1.x > 300 + 100, `b1 被推走，x=${b1.x}`);
  assert.ok(b2.x > 340 + 100, `b2 被连锁推走，x=${b2.x}`);
});

// ---- 7. 物块堆叠 ---------------------------------------------------------------
test('堆叠：上物块落到下物块上并站住', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const low = new Body({ x: 100, y: 660, w: 40, h: 40 }); // 底=700 在地板上
  const top = new Body({ x: 100, y: 100, w: 40, h: 40 });
  stepN(sys, 300, [low, top], [floor]);
  assert.equal(top.bottom, low.top, '上物块底应停在下物块顶');
  assert.ok(top.onGround);
  assert.equal(low.bottom, 700);
});

// ---- 8. 自动上台阶 ---------------------------------------------------------------
test('自动上台阶：矮台阶直接走上去', () => {
  const sys = new CollisionSystem({ gravity: G, autoStepMax: 14 });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const step = new Body({ x: 300, y: 690, w: 60, h: 10, static: true }); // 台阶顶高于地板 10px
  const player = new Body({ x: 100, y: 660, w: 40, h: 40, autoStep: true });
  player.vel.x = 250;
  let steppedUp = false;
  for (let i = 0; i < 60; i++) {
    sys.step(TICK, { dynamics: [player], statics: [floor, step] });
    if (Math.abs(player.bottom - 690) < 0.5) steppedUp = true;
  }
  assert.ok(steppedUp, '玩家应走到台阶顶');
  assert.ok(player.x > 300, '玩家应越过台阶');
});

test('自动上台阶：高台阶挡住不上去', () => {
  const sys = new CollisionSystem({ gravity: G, autoStepMax: 14 });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const wall = new Body({ x: 300, y: 600, w: 30, h: 100, static: true }); // 台阶顶 100px 高
  const player = new Body({ x: 100, y: 660, w: 40, h: 40, autoStep: true });
  player.vel.x = 250;
  stepN(sys, 30, [player], [floor, wall]);
  assert.equal(player.right, 300, '玩家应被高台阶挡住');
  assert.equal(player.bottom, 700, '脚底仍在原地面');
});

// ---- 9. 接触事件 ---------------------------------------------------------------
test('接触跟踪：检测 begin/end', () => {
  const a = new Body({ id: 'a', x: 0, y: 0, w: 10, h: 10 });
  const b = new Body({ id: 'b', x: 5, y: 0, w: 10, h: 10 });
  const c = new Body({ id: 'c', x: 100, y: 0, w: 10, h: 10 });
  const tracker = new ContactTracker();
  const r1 = tracker.update([a, b, c]);
  assert.equal(r1.begun.length, 1, '应只有 a-b 开始接触');
  assert.equal(`${r1.begun[0][0].id}|${r1.begun[0][1].id}`, 'a|b');

  const r2 = tracker.update([a, b, c]);
  assert.equal(r2.begun.length, 0, '持续接触不再重复 begin');

  b.x = 200;
  const r3 = tracker.update([a, b, c]);
  assert.equal(r3.ended.length, 1, 'a-b 应结束接触');
  assert.equal(`${r3.ended[0][0].id}|${r3.ended[0][1].id}`, 'a|b');
});

test('快速下落不穿过薄地板（防穿模）', () => {
  const sys = new CollisionSystem({ gravity: G, maxFallSpeed: 1500 });
  const platform = new Body({ x: 400, y: 300, w: 200, h: 10, static: true }); // 薄地板
  const box = new Body({ x: 450, y: 100, w: 5, h: 5 });
  box.vel.y = 1490; // 高速下落
  for (let i = 0; i < 10; i++) sys.step(TICK, { dynamics: [box], statics: [platform] });
  assert.ok(box.bottom <= 310, `不应穿过薄地板，bottom=${box.bottom}`);
  assert.ok(box.bottom >= 300 - 2, `应停在地板上，bottom=${box.bottom}`);
});

test('出生嵌在实心内且有向上速度不会被瞬移到下方', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 720, w: 1000, h: 80, static: true });
  const box = new Body({ x: 100, y: 600, w: 40, h: 125 }); // bottom=725 嵌进地板 5px
  box.vel.y = -43; // 向上速度（如气泡柱）
  sys.step(TICK, { dynamics: [box], statics: [floor] });
  assert.ok(box.bottom <= 725, `不应被瞬移到地板下方，bottom=${box.bottom}`);
  assert.ok(box.y < 800, '不应穿墙');
});

test('出生嵌入地板表面内的粒子被顶回表面（防穿地板）', () => {
  const sys = new CollisionSystem({ gravity: G, maxYStep: 6 });
  const floor = new Body({ x: 0, y: 720, w: 1000, h: 80, static: true });
  // 站在地上放出沉淀：粒子 top 落在 player.bottom+1 = 表面下 1px
  const p = new Body({ x: 200, y: 721, w: 5, h: 5, solid: false, mass: 0.1, gravity: 1 });
  for (let i = 0; i < 60; i++) sys.step(TICK, { dynamics: [p], statics: [floor] });
  assert.ok(Math.abs(p.bottom - 720) < 2, `应停在地板表面，bottom=${p.bottom}`);
  assert.ok(p.onGround, '应判定落地');
});

test('落地后不再被剩余子步压回地板（一次落地彻底停住）', () => {
  const sys = new CollisionSystem({ gravity: G, maxYStep: 6 });
  const floor = new Body({ x: 0, y: 720, w: 1000, h: 80, static: true });
  const p = new Body({ x: 300, y: 600, w: 5, h: 5, solid: false, mass: 0.1, gravity: 1 });
  for (let i = 0; i < 120; i++) sys.step(TICK, { dynamics: [p], statics: [floor] });
  assert.ok(Math.abs(p.bottom - 720) < 2, `落地后应一直贴住表面，bottom=${p.bottom}`);
  assert.equal(p.vel.y, 0, '落地后速度应为 0');
  assert.ok(p.onGround);
});

test('overlaps：触碰边界按接触处理', () => {
  const a = new Body({ x: 0, y: 0, w: 10, h: 10 });
  const b = new Body({ x: 10, y: 0, w: 10, h: 10 }); // 右缘=10 与 a 左缘贴齐
  assert.ok(overlaps(a, b, 1), 'eps=1 时贴齐算接触');
  assert.ok(!overlaps(a, b, 0), 'eps=0 时严格不相交');
});

// ---- 10. 防穿模/防瞬移回归（杜绝"跳起被顶到池子上方"一类问题） -----------------------

test('高速上升撞顶：一帧内钳制在板底，子步不再继续嵌入（防顶穿）', () => {
  const sys = new CollisionSystem({ gravity: G, maxFallSpeed: 1500 });
  const platform = new Body({ x: 300, y: 300, w: 200, h: 8, static: true }); // 宽悬空板（池底），底 308
  const box = new Body({ x: 400, y: 500, w: 40, h: 40 });
  box.vel.y = -1500; // 高速上升：一帧 dy=50px → 9 个子步；撞顶钳制后剩余子步不得继续嵌入
  let clamped = false;
  for (let i = 0; i < 8; i++) {
    sys.step(TICK, { dynamics: [box], statics: [platform] });
    if (box.vel.y === 0) clamped = true;
    assert.ok(box.top >= 308 - 1e-6, `任何时刻不得嵌入/穿过板底(308)，实际 top=${box.top.toFixed(2)}`);
    assert.ok(box.bottom > 308, '体应在板下方（未穿过板）');
  }
  assert.ok(clamped, '上升途中应被撞顶钳制（旧代码会残留嵌入随后被顶穿）');
});

test('斜向冲入悬空板底：被推回板下方，不会瞬移到板上方', () => {
  const sys = new CollisionSystem({ gravity: G });
  const platform = new Body({ x: 400, y: 300, w: 200, h: 8, static: true }); // 板底 308
  // 头顶(304)已进入板的竖直范围(300..308)、横向尚未进入——模拟"斜向冲入板底"
  const box = new Body({ x: 350, y: 304, w: 40, h: 40 });
  box.vel.x = 300;
  box.vel.y = -200;
  for (let i = 0; i < 60; i++) {
    sys.step(TICK, { dynamics: [box], statics: [platform] });
    assert.ok(!overlaps(box, platform), `任何时刻体都不得与板重叠（不得被顶到板上/穿过板），i=${i}`);
  }
  assert.ok(box.top >= 308, '最终体应完整位于板下方');
});

test('深嵌宽地板 + 水平移动：不再被横向甩飞/漂移（落地瞬移回归）', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: -500, y: 780, w: 3000, h: 20, static: true });
  const box = new Body({ x: 400, y: 700, w: 40, h: 40 }); // bottom=740 嵌进地板 20px…实际 740<780
  // 改为真实深嵌：bottom 深 20px 于地板顶（780）
  box.y = 760; // 760..800，底边 20px 嵌进地板（780..800）
  box.vel.x = 200; // 水平移动 + 深嵌：旧代码每子步被横向推回（净向后漂移）
  for (let i = 0; i < 10; i++) sys.step(TICK, { dynamics: [box], statics: [floor] });
  assert.ok(box.x > 400 + 30, `深嵌期间应持续向右移动而非被横向甩退，x=${box.x.toFixed(1)}`);
  assert.equal(box.bottom, 780, '应被抬升到地板表面');
  assert.ok(box.onGround);
});

test('跳起顶到宽板底后回落：整个过程中不穿过板（泵穿回归）', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 60, static: true });
  const platform = new Body({ x: 300, y: 300, w: 200, h: 8, static: true }); // 底 308
  const box = new Body({ x: 400, y: 350, w: 40, h: 40 });
  box.vel.y = -520; // 普通跳跃速度
  let minTop = Infinity;
  for (let i = 0; i < 90; i++) {
    sys.step(TICK, { dynamics: [box], statics: [platform, floor] });
    minTop = Math.min(minTop, box.top);
    assert.ok(box.top >= 300 - 1e-6, `任何时刻都不得穿过板，top=${box.top.toFixed(2)}`);
  }
  assert.equal(box.bottom, 700, '应落回地面');
});

test('出生嵌入实心体内（顶在地面之上）：向上顶出而非向下穿（防下沉穿地）', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: 0, y: 700, w: 1000, h: 100, static: true }); // 700..800
  const box = new Body({ x: 200, y: 650, w: 40, h: 40 }); // bottom=690 尚在地面之上
  box.y = 680; // 680..720：底边 20px 嵌进地板顶
  sys.step(TICK, { dynamics: [box], statics: [floor] });
  assert.ok(box.bottom <= 700, `应被抬升回地面，bottom=${box.bottom}`);
  assert.ok(box.y < 700, '不应穿到地板下方');
});

// ---- 11. "骑物块"回归：玩家站在物块上移动不得带动物块/不得一起沉地 -----------------
test('站在物块上移动：物块不被带动、不随玩家下沉（骑物块回归）', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: -200, y: 720, w: 3000, h: 80, static: true });
  const blk = new Body({ x: 520, y: 670, w: 50, h: 50, pushable: true }); // 顶 670，站在地板上
  const p = new Body({ x: 502, y: 580, w: 85, h: 90, autoStep: true }); // bottom=670 == 物块顶
  stepN(sys, 60, [blk, p], [floor]);
  // 稳定后：物块应立在地板上（顶 670），玩家站在物块上（bottom == 物块顶）
  assert.equal(blk.top, 670, `物块不应沉入地板，top=${blk.top}`);
  assert.ok(Math.abs(p.bottom - blk.top) < 1.5, '玩家应站在物块上');
  // 向右走：物块不得被带动；玩家最终走下物块
  const bx0 = blk.x;
  p.vel.x = 250;
  stepN(sys, 120, [blk, p], [floor]);
  assert.ok(Math.abs(blk.x - bx0) < 1, `物块不应被站在上面的玩家带动，Δx=${(blk.x - bx0).toFixed(2)}`);
  assert.equal(blk.top, 670, '物块位置应保持在地板上（不沉地）');
  assert.ok(p.x > bx0 + blk.w, '玩家应走过物块');
  assert.ok(p.bottom > 671, `玩家走下物块后应下落，bottom=${p.bottom}`);
});

test('物块上跳跃：跳起后仍能落回物块顶（支撑关系不被破坏）', () => {
  const sys = new CollisionSystem({ gravity: G });
  const floor = new Body({ x: -200, y: 720, w: 3000, h: 80, static: true });
  const blk = new Body({ x: 520, y: 670, w: 50, h: 50, pushable: true });
  const p = new Body({ x: 502, y: 580, w: 85, h: 90, autoStep: true });
  stepN(sys, 60, [blk, p], [floor]);
  p.vel.y = -520; // 跳跃
  stepN(sys, 8, [blk, p], [floor]); // 上升中
  assert.ok(p.y < 545, `应跳起，y=${p.y}`);
  stepN(sys, 100, [blk, p], [floor]); // 落回
  assert.ok(Math.abs(p.bottom - blk.top) < 1.5, `玩家应落回物块顶，bottom=${p.bottom} vs 顶=${blk.top}`);
  assert.equal(blk.top, 670, '物块保持在地板上');
});
