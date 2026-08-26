// ============================================================================
// 物件层 + Scene 集成测试
// 覆盖：落地/行走、玩家入池反应损失血量并生成沉淀、收集、放置、物块推动、溶解、死亡、接触事件。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { Player } from '../src/objects/player.js';
import { Particle } from '../src/objects/particle.js';

const TICK = 1 / 30;

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

/** 连续地板（推挤测试用） */
function flatScene() {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 2000, h: 60 }));
  scene.status = 'running';
  return scene;
}

/** 带 CuSO4 池的场景（地板缺口精确对齐池子 [300,600]） */
function poolScene() {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 500, h: 60 })); // 到 300
  scene.addObject(new Floor({ x: 600, y: 700, w: 1500, h: 60 })); // 从 600
  const pool = new Pool({ x: 300, y: 700, w: 300, h: 60, volume: 300, solutes: { CuSO4: 150 } });
  scene.addObject(pool);
  scene.status = 'running';
  return { scene, pool };
}

// ---- 1. 落地与行走 -----------------------------------------------------------
test('玩家从空中落地并停在地板上', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 500 });
  scene.addObject(p);
  run(scene, 120);
  assert.equal(p.bottom, 700, `bottom=${p.bottom}`);
  assert.ok(p.onGround);
});

test('玩家水平行走', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 }); // bottom=700 站地板
  scene.addObject(p);
  scene.control.add('right');
  run(scene, 60);
  assert.ok(p.x > 100 + 100, `x=${p.x}`);
  assert.ok(p.hp > 0, '行走不掉血');
});

// ---- 2. 玩家入池反应 ---------------------------------------------------------
test('玩家 NaOH 掉入 CuSO4 池 → 反应、血量下降、Cu(OH)2 壳附着玩家', () => {
  const { scene, pool } = poolScene();
  const p = new Player({ x: 360, y: 300, substance: 'NaOH', mass: 100 });
  scene.addObject(p);
  run(scene, 80);
  assert.ok(p.hp < 100, `hp=${p.hp}`); // 入池后应损失质量
  assert.ok(pool.solution.mass('Na2SO4') > 0, 'Na2SO4（可溶）应被池水洗入溶液');
  // Cu(OH)2 絮状沉淀：一律成核沉淀（不附着玩家）
  assert.ok((pool.precipitates.get('Cu(OH)2') ?? 0) > 0, 'Cu(OH)2 应成核沉淀在池中');
  assert.notEqual(scene.status, 'died', '玩家不应这么快死');
});

test('玩家在池中只在浸入部分被反应（顶部保留、底部侵蚀）', () => {
  // 小池子（CuSO4 限域），玩家只损失浸入部分，顶部保留
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 500, h: 60 }));
  scene.addObject(new Floor({ x: 600, y: 700, w: 1500, h: 60 }));
  const pool = new Pool({ x: 300, y: 700, w: 300, h: 60, volume: 200, solutes: { CuSO4: 10 } });
  scene.addObject(pool);
  scene.status = 'running';
  const p = new Player({ x: 360, y: 600, substance: 'NaOH', mass: 40 });
  scene.addObject(p);
  run(scene, 300);
  const g = p.grid;
  let topHas = false;
  for (let x = 0; x < g.cols; x++) if (g.get(x, 0) === 'NaOH') topHas = true;
  assert.ok(topHas, '玩家顶部（未浸入）不应被反应');
  assert.ok(p.hp > 30, `玩家应只损失少量质量，hp=${p.hp}`);
  assert.ok((pool.precipitates.get('Cu(OH)2') ?? 0) > 0, 'Cu(OH)2 应成核沉淀在池中');
  // 自下而上溶解：每列从上到下连续，无侧边缺口/空洞
  for (let x = 0; x < g.cols; x++) {
    let seenEmpty = false;
    for (let y = 0; y < g.rows; y++) {
      if (g.get(x, y) !== 'NaOH') seenEmpty = true;
      else assert.ok(!seenEmpty, `列 ${x} 第 ${y} 行出现空洞（不应从侧面啃）`);
    }
  }
});

test('玩家在强酸池中被耗尽血量 → died（可溶壳被洗掉，不保护）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 500, h: 60 }));
  scene.addObject(new Floor({ x: 600, y: 700, w: 1500, h: 60 }));
  const pool = new Pool({ x: 300, y: 700, w: 300, h: 60, volume: 300, solutes: { HCl: 500 } });
  scene.addObject(pool);
  scene.status = 'running';
  const p = new Player({ x: 360, y: 600, substance: 'NaOH', mass: 20 });
  scene.addObject(p);
  run(scene, 500);
  assert.equal(scene.status, 'died');
});

// ---- 3. 收集沉淀 --------------------------------------------------------------
test('玩家收集附近沉淀', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 });
  scene.addObject(p);
  const particle = new Particle({ x: 150, y: 620, substance: 'Cu(OH)2' });
  scene.addObject(particle);
  scene.pressed.add('collect');
  scene.step(TICK);
  assert.ok(p.inventory.slots.some((s) => s && s.substance === 'Cu(OH)2'), '物品栏应有 Cu(OH)2');
  assert.equal(scene.particles.includes(particle), false, '粒子应被移除');
});

test('物品栏快满时收集容器沉淀不丢失：多余部分进空格（跨格收集）', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 });
  scene.addObject(p);
  const pool = new Pool({ x: 200, y: 500, w: 200, h: 60, volume: 100 }); // 任意容器，可直接装沉淀
  scene.addObject(pool);
  pool.addPrecipitate('Cu(OH)2', 3); // 容器里 3g
  p.inventory.add('Cu(OH)2', 99); // 已占 99g，容量 100 → 同物质格只放得下 1g，其余进空格
  scene.pressed.add('collect');
  scene.step(TICK);
  const total = p.inventory.slots.reduce((a, s) => a + (s?.substance === 'Cu(OH)2' ? s.mass : 0), 0);
  assert.ok(Math.abs(total - 102) < 1e-6, `物品栏应收下全部 102g，实际 ${total}`);
  const left = pool.precipitates.get('Cu(OH)2') ?? 0;
  assert.ok(Math.abs(left) < 1e-6, `容器不应有剩余（质量没丢），实际 ${left}`);
});

test('物品栏快满时收集自由粒子不丢失：粒子保留剩余量', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 });
  scene.addObject(p);
  p.inventory.add('Cu(OH)2', 99.95); // 剩空间 0.05g（同格），但有空格的房间（跨格）
  const particle = new Particle({ x: 150, y: 620, substance: 'Cu(OH)2', amount: 0.1 });
  scene.addObject(particle);
  scene.pressed.add('collect');
  scene.step(TICK);
  const total = p.inventory.slots.reduce((a, s) => a + (s?.substance === 'Cu(OH)2' ? s.mass : 0), 0);
  assert.ok(Math.abs(total - 100.05) < 1e-6, `物品栏应收下全部，实际 ${total}`);
  assert.ok(Math.abs(particle.amount) < 1e-6, `粒子应收完（跨格收集），实际 ${particle.amount}`);
});

test('容器沉淀按边沿距离拾取：远处收不到、贴边可收（旧=中心+容器宽，大池隔着老远能收）', () => {
  // 远：玩家中心 (140,585)，池 (300,600,200,60) —— 边沿距 160px > 70；旧逻辑中心距 ≈264 ≤ 270（能收到＝bug）
  const scene1 = flatScene();
  const p1 = new Player({ x: 100, y: 540 });
  scene1.addObject(p1);
  const pool1 = new Pool({ x: 300, y: 600, w: 200, h: 60, volume: 100 });
  scene1.addObject(pool1);
  pool1.addPrecipitate('Cu(OH)2', 3);
  scene1.pressed.add('collect');
  scene1.step(TICK);
  assert.ok(Math.abs((pool1.precipitates.get('Cu(OH)2') ?? 0) - 3) < 1e-9, '远距离不应收到（容器沉淀留在池里）');
  // 近：玩家贴池边（玩家右缘 ≈ 池左缘）
  const scene2 = flatScene();
  const p2 = new Player({ x: 250, y: 540 });
  scene2.addObject(p2);
  const pool2 = new Pool({ x: 300, y: 600, w: 200, h: 60, volume: 100 });
  scene2.addObject(pool2);
  pool2.addPrecipitate('Cu(OH)2', 3);
  scene2.pressed.add('collect');
  scene2.step(TICK);
  assert.ok((pool2.precipitates.get('Cu(OH)2') ?? 0) < 1e-9, '贴池边应能收到');
});

// ---- 4. 放置沉淀（地面） -----------------------------------------------------
test('玩家放置沉淀到脚下地面', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 });
  scene.addObject(p);
  p.inventory.add('Cu(OH)2', 5);
  scene.pressed.add('place');
  scene.step(TICK);
  assert.ok(scene.particles.length >= 1, '应生成粒子');
  const pt = scene.particles[0];
  assert.ok(Math.abs(pt.x + pt.w / 2 - (p.x + p.w / 2)) < 30, '粒子应在玩家脚下附近');
});

test('物品栏不足 0.5g 也放置 0.5g，格子清空', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 });
  scene.addObject(p);
  p.inventory.add('Cu(OH)2', 0.3);
  scene.pressed.add('place');
  scene.step(TICK);
  assert.equal(p.inventory.selectedSlot(), null, '格子应被清空');
  assert.equal(p.inventory.slots.some((s) => s), false);
});

// ---- 5. 物块推动 ---------------------------------------------------------------
test('玩家推动可推动物块', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 });
  const block = new Block({ x: 300, y: 660, w: 40, h: 40, substance: 'Fe', pushable: true });
  scene.addObject(p);
  scene.addObject(block);
  scene.control.add('right');
  run(scene, 90);
  assert.ok(block.x > 300 + 50, `block.x=${block.x}`);
});

// ---- 6. 可溶物块在水中溶解 ---------------------------------------------------
test('可溶物块 NaCl 落入水池溶解为溶质', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 500, h: 60 }));
  scene.addObject(new Floor({ x: 600, y: 700, w: 1500, h: 60 }));
  const pool = new Pool({ x: 300, y: 700, w: 300, h: 60, volume: 200 }); // 纯水
  scene.addObject(pool);
  scene.status = 'running';

  const block = new Block({ x: 360, y: 650, w: 40, h: 40, substance: 'NaCl' }); // 6.4g
  scene.addObject(block);
  run(scene, 400);
  assert.ok(pool.solution.mass('NaCl') > 0, `NaCl 应溶解，solution=${pool.solution.mass('NaCl')}`);
  assert.ok(block.grid.avail('NaCl') < 6.4, `物块质量应减少，剩余=${block.grid.avail('NaCl')}`);
});

// ---- 7. 接触事件 ---------------------------------------------------------------
test('玩家撞上物块触发 onContactBegin', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 540 });
  const block = new Block({ x: 300, y: 660, w: 40, h: 40, substance: 'Fe' });
  let began = 0;
  p.onContactBegin = () => began++;
  scene.addObject(p);
  scene.addObject(block);
  scene.control.add('right');
  run(scene, 90);
  assert.ok(began >= 1, `began=${began}`);
});
