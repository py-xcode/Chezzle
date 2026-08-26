// ============================================================================
// 新机制回归测试：沉淀踮脚 / 物块自动上台阶 / 开关从下方不触发 /
// 溶尽物块移除 / 绳子断绳 / 气泡方向按密度
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Block } from '../src/objects/block.js';
import { Player } from '../src/objects/player.js';
import { Switch } from '../src/objects/switch.js';
import { Rope } from '../src/objects/rope.js';
import { Bubble } from '../src/objects/bubble.js';
import { Beaker } from '../src/objects/beaker.js';
import { Pool } from '../src/objects/pool.js';
import { Deposit } from '../src/objects/deposit.js';

const TICK = 1 / 30;

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

function flatScene() {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  return scene;
}

// ---- 1. 沉淀踮脚 / 左脚踩右脚 ------------------------------------------------
test('玩家放置的沉淀不可垫脚：跳+空中放置循环不升天（断根：place 粒子永不支撑）', () => {
  const scene = flatScene();
  const p = new Player({ x: 300, y: 600 });
  scene.addObject(p);
  p.inventory.add('Cu(OH)2', 100);
  for (let round = 0; round < 12; round++) {
    scene.control.add('jump');
    scene.step(TICK);
    scene.control.delete('jump');
    for (let i = 0; i < 7; i++) { // 空中
      scene.step(TICK);
      if (i === 4) { scene.pressed.add('place'); } // 空中放置：左脚踩右脚的（曾经的）起手式
      else scene.pressed.delete('place');
    }
    for (let i = 0; i < 60; i++) {
      scene.step(TICK);
      if (p.onGround && i > 5) break;
    }
    assert.ok(p.bottom >= 719, `第 ${round} 轮应落回地面，bottom=${p.bottom.toFixed(1)}`);
  }
  assert.ok(p.bottom >= 719.5, `连续跳放 12 轮始终落回地面：bottom=${p.bottom.toFixed(1)}`);
});

// 关卡预设沉淀堆（Deposit 物化）踩实后可垫脚——同 deposit.test「落进沉淀堆」；
// 这里验证反面：从堆上起跳会把沙堆蹬散、玩家落回地面（跳+放式"接力升高"被禁）。
test('从踩实的预设沉淀堆上起跳：沙子被蹬散，玩家落回地面（无接力升高）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 2000, h: 60 }));
  scene.addObject(new Deposit({ x: 120, y: 685, substance: 'BaCO3', mass: 10 }));
  const p = new Player({ x: 140, y: 500 });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 240); // 玩家落进堆并站稳（同 deposit.test 场景）
  assert.ok(p.bottom <= 701 && p.onGround, `先站稳：bottom=${p.bottom.toFixed(1)}`);
  scene.control.add('jump');
  run(scene, 8);
  scene.control.delete('jump');
  run(scene, 90);
  assert.ok(p.bottom >= 699.5, `从堆上起跳后应落回地面（堆被蹬散），bottom=${p.bottom.toFixed(1)}`);
});

// ---- 2. 物块自动上小台阶 -------------------------------------------------------
test('被推动的物块自动上小台阶', () => {
  const scene = flatScene();
  scene.addObject(new Floor({ x: 800, y: 710, w: 400, h: 10 })); // 10px 台阶
  scene.addObject(new Floor({ x: 1200, y: 600, w: 20, h: 120 })); // 末端挡墙
  const block = new Block({ x: 720, y: 680, w: 40, h: 40, substance: 'Fe' });
  const p = new Player({ x: 300, y: 630 });
  scene.addObject(block);
  scene.addObject(p);
  scene.control.add('right');
  run(scene, 240);
  assert.ok(Math.abs(block.bottom - 710) < 2, `物块应被推上台阶，bottom=${block.bottom.toFixed(1)}`);
});

test('过高的台阶物块推不上去', () => {
  const scene = flatScene();
  scene.addObject(new Floor({ x: 800, y: 640, w: 400, h: 80 })); // 80px 高台
  const block = new Block({ x: 720, y: 680, w: 40, h: 40, substance: 'Fe' });
  const p = new Player({ x: 300, y: 630 });
  scene.addObject(block);
  scene.addObject(p);
  scene.control.add('right');
  run(scene, 240);
  assert.ok(block.x < 790, `高台阶应挡住物块，x=${block.x.toFixed(0)}`);
});

// ---- 3. 压力开关：从下方不触发 ---------------------------------------------------
test('压力开关：玩家站在下方地面不触发', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 })); // 地面
  scene.addObject(new Floor({ x: 200, y: 600, w: 200, h: 12 })); // 开关台（顶 600）
  scene.status = 'running';
  const sw = new Switch({ x: 260, y: 590, w: 40, h: 22, mode: 'pressure', id: 'sw' }); // 顶 590，在台上
  scene.addObject(sw);
  const p = new Player({ x: 270, y: 600 });
  scene.addObject(p);
  p.y = 720 - p.h; // 站到地面，开关在上方
  run(scene, 5);
  assert.equal(sw.open, false, '站在开关下方的地面不应触发');
  // 站到开关上（贴开关顶）→ 触发
  p.x = 260;
  p.y = 590 - p.h;
  p.vel = { x: 0, y: 0 };
  run(scene, 3);
  assert.equal(sw.open, true, '站在开关上应触发');
});

// ---- 4. 溶尽的固体物块被移除 -----------------------------------------------------
test('溶尽/烧尽的固体物块从场景移除（锚点物消失断绳的前提）', () => {
  const scene = flatScene();
  const block = new Block({ x: 300, y: 680, w: 20, h: 20, substance: 'NaCl', id: 'b1' });
  scene.addObject(block);
  block.grid.consume('NaCl', 999); // 全部溶尽
  run(scene, 2);
  assert.equal(scene.byId['b1'], undefined, '空网格物块应被移除');
});

// ---- 5. 绳子：锚点物消失 → 断绳 → 悬挂物坠地 -------------------------------------
test('绳子：锚点物消失则断绳，悬挂物恢复重力落地', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 })); // 地面
  scene.addObject(new Floor({ x: 460, y: 560, w: 120, h: 12 })); // 锚点台（顶 560）
  scene.status = 'running';
  const anchor = new Block({ x: 500, y: 520, w: 40, h: 40, substance: 'NaCl', id: 'anc' }); // 底 560，在台上
  const hung = new Block({ x: 500, y: 300, w: 40, h: 40, substance: 'Zn', id: 'hung' });
  scene.addObject(anchor);
  scene.addObject(hung);
  const rope = new Rope({ x: 520, y: 520, length: 100, anchor: { obj: anchor, dx: 20, dy: 0 }, hanging: hung, id: 'rp' });
  scene.addObject(rope);
  run(scene, 5);
  assert.equal(rope.broken, false, '初始绳子未断');
  assert.ok(hung.bottom < 700, `悬挂物应悬在空中，bottom=${hung.bottom.toFixed(1)}`);
  // 锚点物溶尽 → 被移除
  anchor.grid.consume('NaCl', 999);
  run(scene, 2);
  assert.ok(rope.broken, '锚点物消失应断绳');
  run(scene, 60);
  assert.ok(scene.byId['hung'], '悬挂物本身不应消失');
  assert.ok(Math.abs(hung.bottom - 720) < 2, `悬挂物应落到地面，bottom=${hung.bottom.toFixed(1)}`);
});

test('绳子：推动悬挂物带动锚点共同运动（不瞬移、不穿模）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 })); // 地面
  scene.addObject(new Floor({ x: 200, y: 560, w: 600, h: 12 })); // 平台
  scene.status = 'running';
  const anchor = new Block({ x: 300, y: 520, w: 40, h: 40, substance: 'NaCl', id: 'anc' });
  const hung = new Block({ x: 300, y: 300, w: 40, h: 40, substance: 'Zn', id: 'hung' });
  scene.addObject(anchor);
  scene.addObject(hung);
  scene.addObject(new Rope({ x: 320, y: 520, length: 160, anchor: { obj: anchor, dx: 20, dy: 0 }, hanging: hung, id: 'rp' }));
  const p = new Player({ x: 150, y: 600 });
  scene.addObject(p);
  run(scene, 20);
  assert.ok(hung.bottom < 700, `悬挂物应悬在空中，bottom=${hung.bottom.toFixed(1)}`);
  // 玩家站到悬挂物左侧并向右推
  p.x = hung.x - p.w - 5;
  p.y = 720 - p.h;
  p.vel = { x: 0, y: 0 };
  run(scene, 5);
  scene.control.add('right');
  run(scene, 40);
  scene.control.delete('right');
  assert.ok(anchor.x > 300 + 30, `推动悬挂物应带动锚点，anchor.x=${anchor.x.toFixed(0)}`);
  assert.ok(hung.x > 300 + 30, `悬挂物也应随之移动，hung.x=${hung.x.toFixed(0)}`);
  assert.ok(!scene.byId['rp'] || !scene.byId['rp'].broken, '推动悬挂物不应断绳');
});

// ---- 6. 气泡方向按密度 + 地板阻断 ------------------------------------------------
test('气泡：轻气体上升、重气体下沉', () => {
  const scene = flatScene();
  const b1 = new Bubble({ x: 300, y: 600, dir: -1 });
  const b2 = new Bubble({ x: 400, y: 600, dir: 1 });
  scene.addObject(b1);
  scene.addObject(b2);
  const y1 = b1.y;
  const y2 = b2.y;
  scene.step(TICK);
  assert.ok(b1.y < y1, '轻气体气泡应上升');
  assert.ok(b2.y > y2, '重气体气泡应下沉');
});

test('气泡：下沉的气泡被地板阻断消失', () => {
  const scene = flatScene(); // 地板顶 720
  const b = new Bubble({ x: 300, y: 680, dir: 1 });
  scene.addObject(b);
  run(scene, 30);
  assert.equal(scene.objects.includes(b), false, '下沉气泡应在地板处消失');
});

test('产气气泡柱方向按气体密度（H2 上、CO2 下）', () => {
  const scene = flatScene();
  scene._emitCtx = { point: { x: 300, y: 600 } };
  scene.onGas('H2', 1, {});
  scene.onGas('CO2', 1, {});
  const bubbles = scene.objects.filter((o) => o instanceof Bubble);
  assert.ok(bubbles.some((b) => b.dir === -1), 'H2 应生成上升气泡');
  assert.ok(bubbles.some((b) => b.dir === 1), 'CO2 应生成下沉气泡');
});

// ---- 7. 烧杯：实心杯壁 + 重力 + 太宽卡杯口 -------------------------------------
test('烧杯：玩家不能从侧面走进（杯壁实心），可从上方跳入', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: 0, y: 700, w: 3000, h: 80 }));
  scene.status = 'running';
  const beaker = new Beaker({ x: 300, y: 620, w: 260, h: 80, volume: 100 });
  scene.addObject(beaker);
  const p = new Player({ x: 250, y: 600 });
  scene.addObject(p);
  run(scene, 20);
  // 玩家从左侧向右走，应被杯壁挡住（不能走进杯内）
  p.x = beaker.x - p.w - 8;
  p.y = 700 - p.h;
  p.vel = { x: 0, y: 0 };
  run(scene, 5);
  scene.control.add('right');
  run(scene, 40);
  scene.control.delete('right');
  assert.ok(p.x + p.w <= beaker.x + 2, `玩家应被杯壁挡住，right=${(p.x + p.w).toFixed(0)}`);
  assert.equal(beaker.containsObj(p), false, '玩家不应从侧面进入');
});

test('烧杯：受重力下落，落到支撑面停住', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: 0, y: 550, w: 3000, h: 80 }));
  scene.status = 'running';
  const beaker = new Beaker({ x: 150, y: 300, w: 70, h: 70, volume: 50 });
  scene.addObject(beaker);
  run(scene, 60);
  assert.ok(Math.abs(beaker.y + beaker.h - 550) < 3, `烧杯应落到地面，底=${(beaker.y + beaker.h).toFixed(1)}`);
});

test('烧杯：太宽的玩家被卡在杯口进不去', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: 0, y: 700, w: 3000, h: 80 }));
  scene.status = 'running';
  const beaker = new Beaker({ x: 300, y: 620, w: 60, h: 70, volume: 40 }); // 窄烧杯
  scene.addObject(beaker);
  const p = new Player({ x: 310, y: 500 }); // 玩家宽 85 > 杯口宽 50
  scene.addObject(p);
  run(scene, 40);
  assert.equal(beaker.containsObj(p), false, '太宽的玩家不应进入窄烧杯');
});

// ---- 8. 推动沉淀优先于自动上台阶 -----------------------------------------------
test('推动沉淀优先于上台阶：玩家移动时把矮堆推走而非垫高', () => {
  const scene = flatScene(); // 地板顶 720
  const p = new Player({ x: 150, y: 600 });
  scene.addObject(p);
  run(scene, 20);
  // 玩家脚前放一小堆实心沉淀（0.4g = 4 颗）
  scene.spawnParticles('Cu', 0.4, { x: p.x + p.w - 2, y: 715 }, true, true);
  run(scene, 30);
  const pt = scene.particles[0];
  const x0 = pt.x;
  scene.control.add('right');
  run(scene, 40);
  scene.control.delete('right');
  assert.ok(pt.x > x0 + 10, `推动沉淀应把粒子推走，x=${pt.x.toFixed(1)}`);
  assert.ok(p.bottom <= 720.5, `玩家应停在地板上不被垫高，bottom=${p.bottom.toFixed(1)}`);
});

// ---- 9. 碰撞防瞬移回归：跳起顶到上方药品池底，绝不被顶穿到池上方 --------------------
test('跳起顶到上方药品池底：不会被顶穿瞬移到池上方（穿模回归）', () => {
  const scene = flatScene(); // 地板顶 720
  // 悬空药品池（两侧立柱支撑）：池底壁 452..460，池内 400..452
  scene.addObject(new Floor({ x: 400, y: 300, w: 10, h: 160 })); // 左立柱
  scene.addObject(new Floor({ x: 590, y: 300, w: 10, h: 160 })); // 右立柱
  const pool = new Pool({ x: 400, y: 400, w: 200, h: 60, volume: 200, solutes: { CuSO4: 30 } });
  scene.addObject(pool);
  const p = new Player({ x: 450, y: 600 }); // 顶 510，跳起最高点远高于池底
  scene.addObject(p);
  for (let k = 0; k < 20; k++) {
    scene.control.add('jump');
    run(scene, 5); // 按住跳：顶到池底（460）应被钳制
    scene.control.delete('jump');
    run(scene, 15); // 松开回落
    assert.ok(p.top >= 452 - 0.01, `玩家不得被顶到池子上方，top=${p.top.toFixed(1)}（第 ${k} 轮）`);
  }
  assert.ok(p.bottom <= 720.5, '玩家最终应回到地面');
});

// ---- 10. 反应日志防抖动：持续多反应竞争时 HUD 日志列表稳定 -------------------------
test('反应日志限频：持续反应下同一反应 1s 内只记一条（HUD 不抖）', () => {
  const scene = flatScene();
  // 混合池：氨水 + 次氯酸——持续竞争反应（中和 → 铵盐 → 与玩家反应…）
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 200, solutes: { 'NH3·H2O': 2, HClO: 3 }, id: 'pool' });
  scene.addObject(pool);
  const p = new Player({ x: 400, y: 630, substance: 'Fe2O3', mass: 30, id: 'p' }); // 玩家浸入池参与反应
  scene.addObject(p);
  scene.debugMode = true;
  scene.status = 'running';
  run(scene, 300); // 10s 持续反应
  const list = p.reactions ?? [];
  assert.ok(list.length > 0, '应有反应日志');
  assert.ok(list.length <= 12, `10s 内日志条数应被限频（≤12），实际 ${list.length}`);
  // 任意两条相同反应之间至少间隔 1s（30 tick）
  for (const text of new Set(list)) {
    const idx = list.map((t, i) => (t === text ? i : -1)).filter((i) => i >= 0);
    for (let i = 1; i < idx.length; i++) {
      assert.ok(idx[i] > idx[i - 1], '顺序异常');
    }
  }
});

// ---- 11. 骑物块回归（Scene 级）：玩家站在物块上走动不带动下方物块 -------------------
test('玩家站在物块上走动：物块不被带动、不沉地', () => {
  const scene = flatScene();
  const blk = new Block({ x: 520, y: 676, w: 44, h: 44, substance: 'Fe', mass: 10, id: 'blk' });
  scene.addObject(blk);
  const p = new Player({ x: 502, y: 580, mass: 30, id: 'p' });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 60);
  assert.ok(Math.abs(p.bottom - blk.top) < 1.5, `玩家应站在物块上（bottom=${p.bottom.toFixed(1)} vs 顶=${blk.top.toFixed(1)}）`);
  assert.equal(blk.top, 670, `物块应立在地板上不沉地，top=${blk.top}`);
  const x0 = blk.x;
  scene.control.add('right');
  run(scene, 150);
  scene.control.delete('right');
  assert.ok(Math.abs(blk.x - x0) < 1, `物块不得被玩家带动，Δx=${(blk.x - x0).toFixed(1)}`);
  assert.equal(blk.top, 670, '物块仍在地板上');
});
