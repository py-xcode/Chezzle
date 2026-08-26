// ============================================================================
// 高中引擎集成测试：多物质网格/表层阻断/原地转化、爆炸、回血、指示剂、
// 焰色反应、反应顺序、新反应体系
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { Player } from '../src/objects/player.js';
import { Lamp } from '../src/objects/lamp.js';
import { Switch } from '../src/objects/switch.js';
import { BlastLamp } from '../src/objects/blastlamp.js';
import { Explosion } from '../src/objects/explosion.js';
import { Portal } from '../src/objects/portal.js';
import { GasDetector } from '../src/objects/gasdetector.js';
import { Extractor } from '../src/objects/extractor.js';
import { GasColumn } from '../src/objects/gascolumn.js';
import { Rope } from '../src/objects/rope.js';
import { MaterialGrid, CELL_MASS } from '../src/render/gridrender.js';
import { Solution } from '../src/chem/solution.js';
import { flameColorOf, getSubstance, parseReactionStr, reactionStrError } from '../src/chem/substances.js';
import { reactionEquation, ChemistryEngine } from '../src/chem/engine.js';
import { CollisionSystem, overlaps } from '../src/physics/collision.js';
import { AABB } from '../src/physics/aabb.js';

const TICK = 1 / 30;

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

function flatScene() {
  // 地板留出 [300,560] 缺口（测试池统一放这里）
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 }));
  scene.addObject(new Floor({ x: 560, y: 720, w: 4000, h: 80 }));
  scene.status = 'running';
  return scene;
}

// ---- 1. 多物质网格 ---------------------------------------------------------------
test('多物质网格：一格可含多种物质，总质量不超上限', () => {
  const g = MaterialGrid.rect(15, 15, 'Fe'); // 3×3
  // 原地转化：消耗 Fe 后在同一格附着 Cu
  g.consume('Fe', 0.05);
  const added = g.addInPlace('Cu', 0.05);
  assert.ok(Math.abs(added - 0.05) < 1e-9, `应写入 0.05g，实际 ${added}`);
  const cell = g.cell(0, 0);
  assert.ok(cell.has('Fe') && cell.has('Cu'), '同一格应含 Fe 和 Cu');
  const total = [...cell.values()].reduce((a, b) => a + b, 0);
  assert.ok(total <= CELL_MASS + 1e-9, '格总质量不超上限');
  assert.ok(g.avail('Fe') > 0 && g.avail('Cu') > 0, '两种物质都可查询');
});

test('表层模型：致密沉淀（BaCO3）包住内核阻断反应；絮状（Cu(OH)2）可渗透', () => {
  const dense = MaterialGrid.rect(25, 25, 'NaOH'); // 5×5
  // 外壳：把整圈外层换成 BaCO3（致密）
  for (let x = 0; x < 5; x++) {
    dense.set(x, 0, 'BaCO3');
    dense.set(x, 4, 'BaCO3');
  }
  for (let y = 0; y < 5; y++) {
    dense.set(0, y, 'BaCO3');
    dense.set(4, y, 'BaCO3');
  }
  const before = dense.avail('NaOH');
  const removedDense = dense.consume('NaOH', 10);
  assert.ok(removedDense < before * 0.1, `BaCO3 壳应阻断内核 NaOH，只消耗 ${removedDense.toFixed(3)}g`);

  // 絮状壳（Cu(OH)2 多缝隙可渗透）
  const floc = MaterialGrid.rect(25, 25, 'NaOH');
  for (let x = 0; x < 5; x++) {
    floc.set(x, 0, 'Cu(OH)2');
    floc.set(x, 4, 'Cu(OH)2');
  }
  for (let y = 0; y < 5; y++) {
    floc.set(0, y, 'Cu(OH)2');
    floc.set(4, y, 'Cu(OH)2');
  }
  const removedFloc = floc.consume('NaOH', 10);
  assert.ok(removedFloc > 0.5, `Cu(OH)2 絮状壳不应阻断，应消耗 ${removedFloc.toFixed(2)}g`);
});

test('固体产物附着：Fe 浸 CuSO4 表面就地变铜（原地转化）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { CuSO4: 60 } });
  scene.addObject(pool);
  const block = new Block({ x: 380, y: 600, w: 40, h: 40, substance: 'Fe' });
  scene.addObject(block);
  run(scene, 600);
  assert.ok(block.grid.avail('Cu') > 0, 'Fe 块表面应附着 Cu');
  assert.ok(block.grid.avail('Fe') < 40, 'Fe 应被消耗');
  // 镀层致密（Cu 过半）→ 内部铁被阻断（反应自限）
  const feAfter = block.grid.avail('Fe');
  run(scene, 300);
  assert.ok(Math.abs(block.grid.avail('Fe') - feAfter) < 0.1, 'Cu 镀层应阻隔内部 Fe 继续反应');
});

test('低浓度致密不阻断：Fe 浸 CuSO4 逐格渐进镀层（每格 Fe 用一半即停，盈余进外层新格）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { CuSO4: 60 } });
  scene.addObject(pool);
  const fe = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Fe' });
  scene.addObject(fe);
  scene.status = 'running';
  run(scene, 600);
  const g = fe.grid;
  // 1) 表面逐格镀铜，内部 Fe 被镀层保留（每格 Fe 不用完——致密格停止被消耗）
  assert.ok(g.avail('Cu') > 1, `应镀上 Cu，实际 ${g.avail('Cu').toFixed(2)}g`);
  assert.ok(g.avail('Fe') > 1, `内部 Fe 应被镀层保留，实际 ${g.avail('Fe').toFixed(2)}g`);
  // 2) 镀层完成格（Cu ≥ 半格=致密阈值）与低浓度生长格（< 半格，不阻断、可继续）并存
  let thick = 0, thin = 0;
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      const m = g.cells[y][x];
      if (!m) continue;
      const cu = m.get('Cu') ?? 0;
      if (cu >= CELL_MASS / 2) thick++;
      else if (cu > 1e-9) thin++;
    }
  }
  assert.ok(thick > 0, '应有镀层完成格（Cu ≥ 半格）');
  assert.ok(thin > 0, '应有低浓度 Cu 生长格（外层新格，不阻断反应）');
  // 3) 镀层完成后反应自限（内部 Fe 被阻隔）
  const feAfter = g.avail('Fe');
  run(scene, 300);
  assert.ok(Math.abs(g.avail('Fe') - feAfter) < 0.1, `镀层完成后内部 Fe 应被阻隔：${g.avail('Fe').toFixed(2)} vs ${feAfter.toFixed(2)}`);
});

// ---- 2. 爆炸 ----------------------------------------------------------------------
test('爆炸：物块被炸飞，冲量随距离衰减', () => {
  const scene = flatScene();
  const near = new Block({ x: 300, y: 600, w: 40, h: 40, substance: 'Fe' });
  const far = new Block({ x: 500, y: 600, w: 40, h: 40, substance: 'Fe' });
  scene.addObject(near);
  scene.addObject(far);
  scene.explode({ x: 280, y: 600 }, 80);
  run(scene, 5);
  assert.ok(near.vel.x > 0, '近处物块应被炸飞');
  assert.ok(far.vel.x < near.vel.x, '远处物块冲量应更小');
  assert.ok(scene.objects.some((o) => o instanceof Explosion), '应有爆炸视觉');
});

test('爆炸：冲击过强物块碎裂掉渣（自身变小、等量沉淀可收集）', () => {
  const scene = flatScene();
  const block = new Block({ x: 300, y: 600, w: 40, h: 40, substance: 'Fe' });
  scene.addObject(block);
  const m0 = block.grid.totalMass();
  scene.explode({ x: 280, y: 600 }, 300);
  run(scene, 5);
  assert.ok(block.grid.totalMass() < m0 - 0.2, '物块应掉渣变小');
  assert.ok(scene.particles.length > 0, '掉出的渣应是沉淀粒子');
});

test('爆炸：大气可燃气体（H2）超爆炸下限遇火引爆', () => {
  const scene = flatScene();
  scene.atmosphere.add('H2', 12);
  scene.addObject(new Lamp({ x: 300, y: 680, autoOn: true }));
  scene.step(TICK);
  assert.ok(scene.objects.some((o) => o instanceof Explosion), 'H2 遇火应爆炸');
  assert.ok(scene.atmosphere.mass('H2') < 1, '爆炸应消耗可燃气体');
});

// ---- 3. 玩家回血 -------------------------------------------------------------------
test('回血：接触同核心物质的沉淀粒子被吸收', () => {
  const scene = flatScene();
  const p = new Player({ x: 100, y: 600, substance: 'Fe', mass: 30 });
  scene.addObject(p);
  run(scene, 30);
  const hp0 = p.hp;
  scene.spawnParticles('Fe', 5, { x: p.x + p.w / 2, y: p.bottom - 2 }, true, true);
  run(scene, 120);
  assert.ok(p.hp > hp0 + 1, `接触吸收应回血 ${hp0.toFixed(1)} → ${p.hp.toFixed(1)}`);
});

test('回血：NaOH 玩家被大气 CO2 碳化（掉血），跳 Ba(OH)2 池再生（回血 + BaCO3 壳）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 }));
  scene.addObject(new Floor({ x: 560, y: 720, w: 4000, h: 80 }));
  const baPool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { 'Ba(OH)2': 80 } });
  scene.addObject(baPool);
  scene.status = 'running';
  const p = new Player({ x: 100, y: 500, substance: 'NaOH', mass: 40 });
  scene.addObject(p);
  scene.atmosphere.add('CO2', 15);
  run(scene, 600);
  assert.ok(p.hp < 39, `碳化后血量应下降（Na2CO3 致密壳形成后碳化自限，掉血但不过度）hp=${p.hp.toFixed(1)}`);
  assert.ok(p.grid.avail('Na2CO3') > 0.5, '玩家表面应生成 Na2CO3 壳');
  // 致密壳形成后大气 CO2 不再被吸收（壳保护）——清空剩余 CO2，模拟脱离碳化环境
  scene.atmosphere.remove('CO2', 100);
  // 缓步入池（不移动——移动会冲掉表面壳，落水冲击也会；站定反应回血最多）
  p.x = 380; p.y = 670; p.vel = { x: 0, y: 0 };
  const hpBefore = p.hp;
  run(scene, 240);
  const hpStand = p.hp;
  assert.ok(hpStand > hpBefore + 1, `入池再生应回血 ${hpBefore.toFixed(2)} → ${hpStand.toFixed(2)}`);
  assert.ok(p.grid.avail('BaCO3') > 0.5, '应生成 BaCO3 致密壳');
  assert.ok(p.grid.avail('Na2CO3') < 1, 'Na2CO3 应被转化完');
  // 池内来回移动把 BaCO3 壳冲掉（不溶物脱落系数 0.001 g/格/s——需要走 ~90 秒冲完）
  let dir = 1;
  for (let i = 0; i < 2700; i++) {
    if (i % 10 === 0) {
      scene.control.delete('left');
      scene.control.delete('right');
      dir = -dir;
      scene.control.add(dir > 0 ? 'right' : 'left');
    }
    scene.step(TICK);
  }
  scene.control.delete('left');
  scene.control.delete('right');
  // 移动冲壳后 BaCO3 壳被冲掉（玩家可以继续反应/不再被包住）
  assert.ok(p.grid.avail('BaCO3') < 2, `移动冲壳后 BaCO3 应大幅减少，剩 ${p.grid.avail('BaCO3').toFixed(2)}g`);
});

test('溯源：物块按物质显示来源——初始 Fe 关卡生成、镀上的 Cu 反应生成', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { CuSO4: 40 } });
  scene.addObject(pool);
  scene.status = 'running';
  const fe = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Fe' });
  scene.addObject(fe);
  assert.equal(fe.gridOrigins.get('Fe').kind, 'level', '初始 Fe 应标记关卡生成');
  run(scene, 600);
  assert.ok(fe.grid.avail('Cu') > 0.5, `Fe 表面应镀上 Cu，实际 ${fe.grid.avail('Cu')}`);
  const cuOrigin = fe.gridOrigins.get('Cu');
  assert.ok(cuOrigin && cuOrigin.kind === 'reaction', `Cu 应标记反应生成，实际 ${JSON.stringify(cuOrigin)}`);
  assert.match(cuOrigin.text, /CuSO4/);
  assert.match(cuOrigin.text, /Cu/);
});

test('质量守恒：Fe 被 Cu 壳包住后不再产铜/耗 CuSO4，也不长高（产物按暴露量生成）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { CuSO4: 40 } });
  scene.addObject(pool);
  scene.status = 'running';
  // 构造已完全被 Cu 壳包裹的 Fe 块（5x5，外壳一圈 Cu dense，内核 Fe）
  const g = MaterialGrid.rect(25, 25, 'Fe');
  for (let x = 0; x < 5; x++) { g.set(x, 0, 'Cu'); g.set(x, 4, 'Cu'); }
  for (let y = 0; y < 5; y++) { g.set(0, y, 'Cu'); g.set(4, y, 'Cu'); }
  const fe = new Block({ x: 380, y: 680, substance: 'Fe' });
  fe.grid = g;
  fe.syncGrid();
  scene.addObject(fe);
  const cu0 = fe.grid.avail('Cu');
  const cuso4_0 = pool.solution.mass('CuSO4');
  run(scene, 600);
  assert.ok(Math.abs(fe.grid.avail('Cu') - cu0) < 0.01, `包裹完成后 Cu 不应再增加：${cu0} → ${fe.grid.avail('Cu')}`);
  assert.ok(Math.abs(pool.solution.mass('CuSO4') - cuso4_0) < 0.01, `包裹完成后 CuSO4 不应再被消耗：${cuso4_0} → ${pool.solution.mass('CuSO4')}`);
  assert.equal(fe.grid.minAABB().h, 25, '物块不应长高（无 Cu 底座）');
});

test('爆炸：scene 记录最近爆炸原因（Na 遇水 → 方程式）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, water: 300 });
  scene.addObject(pool);
  const na = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Na' });
  scene.addObject(na);
  scene.status = 'running';
  run(scene, 300);
  assert.ok(scene._lastExplosion, '应记录最近爆炸');
  assert.match(scene._lastExplosion.cause, /Na/, `爆炸原因应含 Na：${scene._lastExplosion.cause}`);
  assert.match(scene._lastExplosion.cause, /H2O/, `爆炸原因应含 H2O：${scene._lastExplosion.cause}`);
  // 爆炸视觉对象也携带原因
  const ex = scene.objects.find((o) => o.constructor.name === 'Explosion');
  assert.ok(!ex || typeof ex.cause === 'string' || ex.cause === null, 'Explosion 携带 cause');
});

test('灯/开关是干式台子：内部不应有液体水（防 CaO+H2O/Na+H2O 在灯上凭空发生、Ca 消失）', () => {
  const lamp = new Lamp({ x: 0, y: 0, autoOn: true });
  const sw = new Switch({ x: 0, y: 0 });
  assert.ok(lamp.solution.water <= 1e-9, `灯不应有液体水，实际 ${lamp.solution.water}`);
  assert.ok(sw.solution.water <= 1e-9, `开关不应有液体水，实际 ${sw.solution.water}`);
});

test('干式台子不电离：灯上 NaOH 块 + CuSO4 粉末无水不反应；池内（有水）正常生成 Cu(OH)2', () => {
  // 灯上：NaOH 固体 + CuSO4 粉末都是固体，没有水就不能电离 → 不反应
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 700, w: 140, h: 10, autoOn: true });
  scene.addObject(lamp);
  lamp.addPrecipitate('CuSO4', 5);
  const naoh = new Block({ x: 330, y: 670, w: 30, h: 30, substance: 'NaOH' });
  scene.addObject(naoh);
  scene.status = 'running';
  run(scene, 300);
  assert.ok(Math.abs((lamp.precipitates.get('CuSO4') ?? 0) - 5) < 0.01, `灯上 CuSO4 粉末不应被消耗（无水不电离），剩 ${lamp.precipitates.get('CuSO4')}`);
  assert.ok(!lamp.precipitates.has('Cu(OH)2'), '灯上不应生成 Cu(OH)2（没有水）');
  // 对照组：池内（有水介质）NaOH + CuSO4 正常生成 Cu(OH)2 沉淀
  const s2 = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { CuSO4: 10 } });
  s2.addObject(pool);
  const nb = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'NaOH' });
  s2.addObject(nb);
  s2.status = 'running';
  run(s2, 300);
  assert.ok((pool.precipitates.get('Cu(OH)2') ?? 0) > 0.5, `池内应有水介质 → 正常生成 Cu(OH)2，实际 ${pool.precipitates.get('Cu(OH)2')}`);
});

test('CaCO3 高温分解：CaO 留在物块上（喷灯无水，不再被灯水消耗消失）', () => {
  const scene = flatScene();
  const lamp = new BlastLamp({ x: 300, y: 700, w: 140, h: 10, autoOn: true });
  scene.addObject(lamp);
  const caco3 = new Block({ x: 330, y: 670, w: 30, h: 30, substance: 'CaCO3' });
  scene.addObject(caco3);
  scene.status = 'running';
  run(scene, 900);
  assert.ok(caco3.grid.avail('CaO') > 0.5, `CaCO3 分解应留 CaO 在物块上，实际 ${caco3.grid.avail('CaO').toFixed(2)}`);
  assert.equal(caco3.grid.avail('CaCO3'), 0, 'CaCO3 应分解完');
  const origin = caco3.gridOrigins.get('CaO');
  assert.ok(origin && origin.kind === 'reaction', `CaO 应标反应生成：${JSON.stringify(origin)}`);
  assert.match(origin.text, /CaCO3/);
});

test('溯源：大气气体变化日志记录原因（Zn+HCl 产 H2）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { HCl: 400 } });
  scene.addObject(pool);
  const zn = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Zn' });
  scene.addObject(zn);
  scene.status = 'running';
  run(scene, 120);
  const h2log = scene.gasLog.find((g) => g.id === 'H2' && g.delta > 0);
  assert.ok(h2log, '应记录 H2 产生');
  assert.match(h2log.cause, /Zn/);
  assert.match(h2log.cause, /HCl/);
});

test('量变：稀硝酸+Cu 产 NO、浓硝酸+Cu 产 NO2（NO2 逃逸入大气）', () => {
  // 稀硝酸
  const s1 = flatScene();
  const p1 = new Pool({ x: 300, y: 700, w: 130, h: 60, volume: 200, solutes: { HNO3: 40 } });
  s1.addObject(p1);
  const cu1 = new Block({ x: 340, y: 680, w: 30, h: 30, substance: 'Cu' });
  s1.addObject(cu1);
  s1.status = 'running';
  run(s1, 600);
  assert.ok(s1.atmosphere.mass('NO') > 0.5, `稀硝酸应产 NO，实际 ${s1.atmosphere.mass('NO')}`);
  assert.ok(s1.atmosphere.mass('NO2') < 0.01, '稀硝酸不应产 NO2');
  // 浓硝酸
  const s2 = flatScene();
  const p2 = new Pool({ x: 300, y: 700, w: 110, h: 60, volume: 160, solutes: { HNO3: 90 } });
  s2.addObject(p2);
  const cu2 = new Block({ x: 340, y: 680, w: 30, h: 30, substance: 'Cu' });
  s2.addObject(cu2);
  s2.status = 'running';
  run(s2, 600);
  assert.ok(s2.atmosphere.mass('NO2') > 0.5, `浓硝酸应产 NO2，实际 ${s2.atmosphere.mass('NO2')}`);
  assert.ok(s2.atmosphere.mass('NO') < 0.1, `浓硝酸不应产 NO，实际 ${s2.atmosphere.mass('NO')}`);
});

test('H2CO3 不再无限循环：分解产 CO2 入大气、池中 H2CO3 耗尽', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { HCl: 40, ZnCl2: 30, NaCl: 30, H2CO3: 20 } });
  scene.addObject(pool);
  scene.status = 'running';
  run(scene, 600);
  assert.ok(pool.solution.mass('H2CO3') < 1, `H2CO3 应分解耗尽，剩 ${pool.solution.mass('H2CO3')}`);
  assert.ok(scene.atmosphere.mass('CO2') > 5, `CO2 应进入大气，实际 ${scene.atmosphere.mass('CO2')}`);
});

test('传送门：同色两门，物块走入一门被传到另一门', () => {
  const scene = flatScene();
  scene.status = 'running';
  const p1 = new Portal({ x: 300, y: 680, w: 40, h: 64, color: '#ff66cc' });
  const p2 = new Portal({ x: 600, y: 680, w: 40, h: 64, color: '#ff66cc' });
  scene.addObject(p1);
  scene.addObject(p2);
  const block = new Block({ x: 320, y: 690, w: 20, h: 20, substance: 'Fe' }); // 在 p1 内部
  scene.addObject(block);
  run(scene, 5);
  assert.ok(block.x > 500, `物块应被传到另一门，x=${block.x}`);
  // 站在对侧门内不会被再传（走出才重置）
  const xAfter = block.x;
  run(scene, 10);
  assert.ok(Math.abs(block.x - xAfter) < 5, '站在门内不应被反复传送');
});

test('气体探测器：只检测"反应产生的气体"，预置大气气体不触发', () => {
  const scene = flatScene();
  scene.status = 'running';
  const gd = new GasDetector({ x: 300, y: 700, gas: 'H2', threshold: 0.05 });
  let opened = 0;
  gd.onOpen(() => opened++);
  scene.addObject(gd);
  // 预置大气 H2（非反应产生）不应触发
  scene.atmosphere.add('H2', 8);
  run(scene, 10);
  assert.equal(opened, 0, '预置大气 H2 不应触发（只检测反应产气）');
  assert.ok(scene._reactGas['H2'] === undefined, '预置大气气体不应进入反应产气累积器');
  // 用 K + H2O 反应产生 H2 → 应触发
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { H2O: 100 } });
  scene.addObject(pool);
  const k = new Block({ x: 400, y: 720, w: 40, h: 40, substance: 'K', mass: 50 });
  scene.addObject(k);
  run(scene, 90);
  assert.ok(opened >= 1, '反应产生 H2 应触发 onOpen');
  assert.ok((scene._reactGas['H2'] ?? 0) > 0.05, '反应产 H2 应超过阈值');
});

test('物质提取器：激活开关后缓慢提取固体（CuSO4），不提取液体（HCl）', () => {
  const scene = flatScene();
  scene.status = 'running';
  const pool = new Pool({ x: 300, y: 700, w: 200, h: 60, volume: 200, solutes: { CuSO4: 20, HCl: 10 } });
  scene.addObject(pool);
  const sw = new Switch({ x: 540, y: 696, opening: 'CuSO4', id: 'exsw' });
  scene.addObject(sw);
  const ex = new Extractor({ x: 200, y: 700, w: 50, h: 14, poolId: pool.id, switchId: 'exsw', rate: 2 });
  scene.addObject(ex);
  run(scene, 30);
  assert.ok(pool.solution.mass('CuSO4') > 19, '未激活不应提取 CuSO4');
  // 激活开关（chemical：放入开启物质）
  sw.addPrecipitate('CuSO4', 3);
  run(scene, 120);
  assert.ok(pool.solution.mass('CuSO4') < 19, `激活后应提取 CuSO4，剩 ${pool.solution.mass('CuSO4')}`);
  assert.ok(scene.particles.some((p) => p.substance === 'CuSO4'), '应冒出 CuSO4 沉淀粒子');
  assert.ok(Math.abs(pool.solution.mass('HCl') - 10) < 0.01, `HCl 不应被提取，剩 ${pool.solution.mass('HCl')}`);
});

test('光照：HClO 见光分解（灯旁），无灯不分解', () => {
  // 无灯：不分解
  const s1 = flatScene();
  const p1 = new Pool({ x: 300, y: 700, w: 200, h: 60, volume: 200, solutes: { HClO: 10 } });
  s1.addObject(p1);
  s1.status = 'running';
  run(s1, 600);
  assert.ok(p1.solution.mass('HClO') > 9, `无光照 HClO 不应分解，剩 ${p1.solution.mass('HClO')}`);
  // 有灯靠近：见光分解
  const s2 = flatScene();
  const p2 = new Pool({ x: 300, y: 700, w: 200, h: 60, volume: 200, solutes: { HClO: 10 } });
  s2.addObject(p2);
  const lamp = new Lamp({ x: 400, y: 650, autoOn: true });
  s2.addObject(lamp);
  s2.status = 'running';
  run(s2, 600);
  assert.ok(p2.solution.mass('HCl') > 2, `见光应分解出 HCl，实际 ${p2.solution.mass('HCl')}`);
});

test('爆炸炸断绳子', () => {
  const scene = flatScene();
  scene.status = 'running';
  const hanging = new Block({ x: 300, y: 600, w: 20, h: 20, substance: 'Fe' });
  scene.addObject(hanging);
  const rope = new Rope({ x: 300, y: 500, length: 100, anchor: { fixed: { x: 300, y: 500 } }, hanging });
  scene.addObject(rope);
  scene.explode({ x: 300, y: 540 }, 30);
  assert.ok(rope.broken, '爆炸应炸断绳子');
});

test('开关 "&" 联锁：两开关需同时激活才输出开', () => {
  const scene = flatScene();
  scene.status = 'running';
  const s1 = new Switch({ x: 300, y: 696, opening: 'CuSO4', id: 'sA' });
  const s2 = new Switch({ x: 400, y: 696, opening: 'NaCl', id: 'sB', and: 'sA' });
  scene.addObject(s1);
  scene.addObject(s2);
  let opened = 0;
  let closed = 0;
  s2.onOpen(() => opened++);
  s2.onClose(() => closed++);
  run(scene, 5);
  // 只激活 s1：s2 不应输出开
  s1.addPrecipitate('CuSO4', 2);
  run(scene, 5);
  assert.equal(opened, 0, '单个开不应触发 onOpen');
  // 激活 s2：两者都开 → 输出开
  s2.addPrecipitate('NaCl', 2);
  run(scene, 5);
  assert.ok(opened >= 1, '双开应触发 onOpen');
  // 关闭 s1：输出关
  s1.takePrecipitate('CuSO4', 2);
  run(scene, 5);
  assert.ok(closed >= 1, 's1 关闭后应触发 onClose');
});

test('NaOH 块吸收大气 Cl2 生成 NaCl + NaClO（漂白液；尾气处理）', () => {
  const scene = flatScene();
  const naoh = new Block({ x: 500, y: 600, w: 30, h: 30, substance: 'NaOH' });
  scene.addObject(naoh);
  scene.atmosphere.add('Cl2', 5);
  scene.status = 'running';
  run(scene, 600);
  assert.ok(naoh.grid.avail('NaCl') > 0.5, `应生成 NaCl，实际 ${naoh.grid.avail('NaCl').toFixed(2)}`);
  assert.ok(naoh.grid.avail('NaClO') > 0.5, `应生成 NaClO（漂白液），实际 ${naoh.grid.avail('NaClO').toFixed(2)}`);
});

test('Cl2 吸收无内部空洞：NaOH 块吸收 Cl2 后网格内部格全部满质量（产物填回消耗面）', () => {
  const scene = flatScene();
  const naoh = new Block({ x: 500, y: 600, w: 30, h: 30, substance: 'NaOH' });
  scene.addObject(naoh);
  scene.atmosphere.add('Cl2', 5);
  scene.status = 'running';
  run(scene, 600);
  const g = naoh.grid;
  // 内部格（非外圈行/列）：不允许出现 null 或低质量残渣格（旧代码 NaCl 填不满
  // 消耗面且 NaClO 全堆底部 → 物块中间整片空洞）
  let bad = 0;
  for (let y = 1; y < g.rows - 1; y++) {
    for (let x = 1; x < g.cols - 1; x++) {
      const m = g.cells[y][x];
      if (!m || g._cellTotal(m) < CELL_MASS * 0.9) bad++;
    }
  }
  assert.equal(bad, 0, `Cl2 吸收后网格内部不应有空洞/残渣格，发现 ${bad} 个`);
  // 产物盈余长在所有暴露面（四面都接触大气），而非只堆底部（旧代码 cols 保持 6 不变）
  assert.ok(g.cols > 6, `左右侧面也应生长，实际 cols=${g.cols}`);
  assert.ok(g.rows > 6, `上下侧面也应生长，实际 rows=${g.rows}`);
});

test('暴露面渐进生长：物块盈余在四面边界同时开层，所有生长格同步涨满（无"一格一格蹦"）', () => {
  const g = MaterialGrid.rect(30, 30, 'NaOH'); // 6×6 全满
  // 首次小额注入：四面同时开层（rows/cols 同步 +2），层格全部是部分质量（渐进而非满格）
  g.growExposed('NaCl', 0.02);
  assert.equal(g.rows, 8, `上下应同时开层，实际 rows=${g.rows}`);
  assert.equal(g.cols, 8, `左右应同时开层，实际 cols=${g.cols}`);
  const layerMasses = [];
  for (let x = 0; x < g.cols; x++) {
    const a = g.cells[0][x], b = g.cells[g.rows - 1][x];
    if (a) layerMasses.push(g._cellTotal(a));
    if (b) layerMasses.push(g._cellTotal(b));
  }
  for (let y = 0; y < g.rows; y++) {
    const a = g.cells[y][0], b = g.cells[y][g.cols - 1];
    if (a) layerMasses.push(g._cellTotal(a));
    if (b) layerMasses.push(g._cellTotal(b));
  }
  assert.ok(layerMasses.length > 0, '应有生长层格子');
  assert.ok(layerMasses.every((t) => t > 0 && t < CELL_MASS), `所有生长格应为部分质量（渐进而非满格）`);
  assert.ok(layerMasses.every((t) => t < CELL_MASS * 0.5), `首次小额不应有格先满，最大 ${Math.max(...layerMasses).toFixed(4)}`);
  // 质量守恒：连续注入后，写入量 = 网格总质量增量（渐进模式无累积器滞留）
  const m0 = g.totalMass();
  let wrote = 0;
  for (let i = 0; i < 50; i++) wrote += g.growExposed('NaCl', 0.01);
  const delta = g.totalMass() - m0;
  assert.ok(Math.abs(wrote - delta) < 1e-9, `写入量应等于网格增量：wrote=${wrote.toFixed(4)} Δ=${delta.toFixed(4)}`);
  // 继续生长到满：所有生长格同步涨到满格（max ≈ CELL_MASS），且开出了第二层
  const wrote2 = g.growExposed('NaCl', 5);
  assert.ok(Math.abs(wrote2 - 5) < 1e-9, `大额注入不应丢失质量：wrote2=${wrote2.toFixed(4)}`);
  const t = g.totalMass();
  assert.ok(Math.abs(t - m0 - wrote - wrote2) < 1e-9, `再次注入后仍守恒：Δtotal=${(t - m0).toFixed(4)} vs wrote=${(wrote + wrote2).toFixed(4)}`);
  assert.ok(g.rows >= 8, `层满后应开第二层，实际 rows=${g.rows}`);
});

test('微量格不参与碰撞：生长层刚积累的微量格不扩大碰撞箱（防漂浮感），长满后参与', () => {
  const g = MaterialGrid.rect(30, 30, 'NaOH'); // 6×6 全满
  assert.equal(g.minAABB().w, 30, '初始 AABB 应为 30px');
  // 开层 + 微量注入：层格每格 < 半格（0.05g）→ 不参与碰撞（视觉上几乎透明）
  g.growExposed('NaCl', 0.02);
  let aabb = g.minAABB();
  assert.equal(aabb.w, 30, `微量层格不应扩大碰撞箱，实际 w=${aabb.w}`);
  assert.equal(aabb.h, 30, `微量层格不应扩大碰撞箱，实际 h=${aabb.h}`);
  // 层格长满（≥ 半格 = 实心）→ 参与碰撞
  g.growExposed('NaCl', 5);
  aabb = g.minAABB();
  assert.ok(aabb.w > 30 && aabb.h > 30, `层格长满后应参与碰撞，实际 ${aabb.w}x${aabb.h}`);
});

test('悬空修复：中间整行空 → 上方整体下移（坍塌填补，不悬空）', () => {
  // 整行 null
  const g = MaterialGrid.rect(30, 50, 'Fe'); // 6×10
  for (let x = 0; x < g.cols; x++) g.cells[4][x] = null;
  const rowsBefore = g.rows;
  g.collapseHollowRows();
  assert.equal(g.rows, rowsBefore - 1, `空行应被移除（上方下移），rows=${g.rows}`);
  assert.ok(g.cells[4][0] && g._cellTotal(g.cells[4][0]) > 0.01, '原 y=5 的内容应下移到 y=4');
  // 整行微量（< 0.01g）也视为空 → 坍塌，微量并入下方行（下方满则丢弃，不超上限）
  const g2 = MaterialGrid.rect(30, 40, 'Fe'); // 6×8
  for (let x = 0; x < g2.cols; x++) g2.cells[3][x] = new Map([['Fe', 0.005]]);
  const r2 = g2.rows;
  const m2 = g2.totalMass();
  g2.collapseHollowRows();
  assert.equal(g2.rows, r2 - 1, `微量行应视为空并坍塌，rows=${g2.rows}`);
  assert.ok(g2._cellTotal(g2.cells[3][0]) <= CELL_MASS + 1e-9, '下方行不应超过格子上限');
  assert.ok(Math.abs(g2.totalMass() - m2) < 0.05, `微量残余丢弃应在微量级（<0.1g），实际 Δ=${Math.abs(g2.totalMass() - m2).toFixed(4)}`);
  // 边界生长层（0 质量占位）不参与坍塌
  const g3 = MaterialGrid.rect(30, 30, 'Fe');
  g3.growExposed('Cu', 0.02); // 四面开层
  const r3 = g3.rows;
  g3.collapseHollowRows();
  assert.equal(g3.rows, r3, `边界生长层不应被坍塌，rows=${g3.rows}`);
});

test('生长贴着实际表面：缩水网格（顶部被消耗）生长开层在主体边界，不脱离', () => {
  const g = MaterialGrid.rect(30, 50, 'Fe'); // 6×10
  // 模拟缩水：顶部 2 行被消耗清空 → 主体从行 2 开始（cells 数组顶行是空的）
  for (let x = 0; x < g.cols; x++) { g.cells[0][x] = null; g.cells[1][x] = null; }
  g.growExposed('Cu', 0.5);
  // 顶层应开在主体顶行（y=2）上方 → 新层在 y=2（splice 插入），主体顶行下移到 y=3
  assert.ok(g.cells[2][0] && g._cellTotal(g.cells[2][0]) > 0, '新层应开在主体顶行上方（贴着主体）');
  assert.ok(g.cells[3][1] && g._cellTotal(g.cells[3][1]) > 0.05, '原主体顶行应下移到 y=3');
  assert.ok(!g.cells[0][0], 'cells 数组最顶行不应有内容（不脱离主体在原始大小位置开层）');
  // 质量守恒
  const cuTotal = g.avail('Cu');
  assert.ok(Math.abs(cuTotal - 0.5) < 1e-9, `Cu 总量应等于注入量：${cuTotal.toFixed(4)}`);
});

test('沉淀粒子质量守恒：微量产物不放大（0.03g → 单粒 0.03g，不是固定 0.1g/粒）', () => {
  const scene = flatScene();
  scene.spawnParticles('AgCl', 0.03, { x: 500, y: 500 }, true, false);
  assert.equal(scene.particles.length, 1, '应生成 1 粒');
  const total = scene.particles.reduce((s, p) => s + p.amount, 0);
  assert.ok(Math.abs(total - 0.03) < 1e-9, `粒子总量应等于注入量：${total.toFixed(4)}`);
  assert.ok(Math.abs(scene.particles[0].amount - 0.03) < 1e-9, `单粒质量应为 0.03g，实际 ${scene.particles[0].amount}`);
});

test('NaHCO3 + NaOH → Na2CO3 + H2O（酸式盐中和：同钠离子，离子引擎不驱动，走特例表）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NaHCO3: 20 } });
  scene.addObject(pool);
  const naoh = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'NaOH' });
  scene.addObject(naoh);
  scene.status = 'running';
  run(scene, 600);
  assert.ok(pool.solution.mass('Na2CO3') > 1, `应生成 Na2CO3，实际 ${pool.solution.mass('Na2CO3').toFixed(3)}`);
  assert.ok(pool.solution.mass('NaHCO3') < 19, `NaHCO3 应被消耗，剩 ${pool.solution.mass('NaHCO3').toFixed(3)}`);
});

test('漂白液遇酸放出氯气：NaClO + HCl → NaCl + Cl2↑', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NaClO: 20, HCl: 40 } });
  scene.addObject(pool);
  scene.status = 'running';
  run(scene, 300);
  assert.ok(pool.solution.mass('NaClO') < 5, `NaClO 应被消耗，剩 ${pool.solution.mass('NaClO')}`);
  assert.ok(scene.atmosphere.mass('Cl2') > 2, `应放出氯气（Cl2 入大气），实际 ${scene.atmosphere.mass('Cl2')}`);
  assert.ok(pool.solution.mass('NaCl') > 5, `应生成 NaCl，实际 ${pool.solution.mass('NaCl')}`);
});

test('归中：HCl + HClO → Cl2↑（浓盐酸+漂白液放出氯气）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { HCl: 30, HClO: 10 } });
  scene.addObject(pool);
  scene.status = 'running';
  run(scene, 300);
  assert.ok(pool.solution.mass('HClO') < 2, `HClO 应被消耗，剩 ${pool.solution.mass('HClO')}`);
  assert.ok(scene.atmosphere.mass('Cl2') > 2, `应放出氯气（Cl2 入大气），实际 ${scene.atmosphere.mass('Cl2')}`);
});

test('提取器质量守恒：提取总量不超过池中原有量', () => {
  const scene = flatScene();
  scene.status = 'running';
  const INITIAL = 10;
  const pool = new Pool({ x: 300, y: 700, w: 200, h: 60, volume: 200, solutes: { CuSO4: INITIAL } });
  scene.addObject(pool);
  const sw = new Switch({ x: 540, y: 696, opening: 'CuSO4', id: 'exsw' });
  scene.addObject(sw);
  sw.addPrecipitate('CuSO4', 3); // 激活
  const ex = new Extractor({ x: 200, y: 700, w: 50, h: 14, poolId: pool.id, switchId: 'exsw', rate: 5 });
  scene.addObject(ex);
  run(scene, 3000);
  const left = pool.solution.mass('CuSO4');
  const totalP = scene.particles.filter((p) => p.substance === 'CuSO4').reduce((s, p) => s + p.amount, 0);
  assert.ok(left + totalP <= INITIAL + 0.2, `提取总量不应超过池中原有量：池剩${left.toFixed(2)}+粒子${totalP.toFixed(2)}=${(left + totalP).toFixed(2)} vs 初始${INITIAL}`);
});

test('放置可溶物质到池中 → 溶解进溶液（CuSO4 不再成永不溶解的沉淀颗粒）', () => {
  const scene = flatScene();
  scene.status = 'running';
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { CuSO4: 20 } });
  scene.addObject(pool);
  const p = new Player({ x: 400, y: 660, substance: 'NaOH', mass: 30 });
  scene.addObject(p);
  // 放置可溶物质 CuSO4
  p.inventory.slots[0] = { substance: 'CuSO4', mass: 5 };
  p.inventory.selected = 0;
  const before = pool.solution.mass('CuSO4');
  p.tryPlace(scene);
  assert.ok(pool.solution.mass('CuSO4') > before, `可溶物质应溶解进溶液：${before} → ${pool.solution.mass('CuSO4')}`);
  assert.equal(pool.precipitates.size, 0, '不应生成沉淀颗粒');
  // 放置不溶物 Cu(OH)2 → 仍成沉淀（钥匙开启物质）
  p.inventory.slots[0] = { substance: 'Cu(OH)2', mass: 5 };
  p.inventory.selected = 0;
  p.tryPlace(scene);
  assert.ok(pool.precipitates.has('Cu(OH)2'), '不溶物应成为沉淀');
});

test('沉淀粒子能参与反应：爆炸掉落的 Zn 粒子在 HCl 中反应产 H2', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { HCl: 300 } });
  scene.addObject(pool);
  scene.status = 'running';
  scene.spawnParticles('Zn', 1, { x: 380, y: 740 }, true, false);
  run(scene, 300);
  const znLeft = scene.particles.filter((p) => p.substance === 'Zn').reduce((s, p) => s + p.amount, 0);
  assert.ok(znLeft < 0.5, `Zn 粒子应被 HCl 反应消耗，剩 ${znLeft.toFixed(2)}`);
  assert.ok(pool.solution.mass('ZnCl2') > 0.5, `应生成 ZnCl2，实际 ${pool.solution.mass('ZnCl2')}`);
});

test('碳化：NaOH 物块就地碳化，不生成"水沉淀"/游离 Na2CO3 粒子', () => {
  const scene = flatScene();
  scene.status = 'running';
  const nb = new Block({ x: 500, y: 600, w: 30, h: 30, substance: 'NaOH' });
  scene.addObject(nb);
  scene.atmosphere.add('CO2', 15);
  run(scene, 600);
  for (const pt of scene.particles) {
    assert.notEqual(pt.substance, 'H2O', '不应生成"水沉淀"粒子');
    assert.notEqual(pt.substance, 'Na2CO3', 'Na2CO3 应就地附着物块，不撒成游离粒子');
  }
  assert.ok(nb.grid.avail('Na2CO3') > 0.5, `物块表面应就地碳化生成 Na2CO3，实际 ${nb.grid.avail('Na2CO3').toFixed(3)}`);
});

test('溯源：药品池按物质显示来源——初始溶质关卡生成、反应产物反应生成', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { CuSO4: 40 } });
  scene.addObject(pool);
  scene.status = 'running';
  // 初始溶质 = 关卡生成
  assert.equal(pool.solOrigins.get('CuSO4').kind, 'level', '初始 CuSO4 应标记关卡生成');
  // Fe 浸入 CuSO4 池 → FeSO4（可溶→进溶液=反应生成）+ Cu（附着 Fe 表面）
  const fe = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Fe' });
  scene.addObject(fe);
  run(scene, 600);
  assert.ok(pool.solution.mass('FeSO4') > 0.5, `应生成 FeSO4，实际 ${pool.solution.mass('FeSO4')}`);
  const feOrigin = pool.solOrigins.get('FeSO4');
  assert.ok(feOrigin && feOrigin.kind === 'reaction', `FeSO4 应标记反应生成，实际 ${JSON.stringify(feOrigin)}`);
  assert.match(feOrigin.text, /Fe/);
  assert.match(feOrigin.text, /CuSO4/);
});

test('碳化：玩家碳化只附着 Na2CO3，不产生水沉淀粒子', () => {
  const scene = flatScene();
  scene.status = 'running';
  const p = new Player({ x: 200, y: 500, substance: 'NaOH', mass: 40 });
  scene.addObject(p);
  scene.atmosphere.add('CO2', 15);
  run(scene, 600);
  for (const pt of scene.particles) {
    assert.notEqual(pt.substance, 'H2O', '玩家碳化不应产生"水沉淀"粒子');
  }
  assert.ok(p.grid.avail('Na2CO3') > 0.5, '玩家表面应生成 Na2CO3 壳（致密壳自限）');
});

// ---- 4. pH 指示剂 ------------------------------------------------------------------
test('指示剂：石蕊酸红/中性紫/碱蓝；酚酞酸无色/碱深红', async () => {
  const acid = new Solution({ volume: 300, solutes: { HCl: 3.65, Litmus: 3 } });
  const neutral = new Solution({ volume: 300, solutes: { NaCl: 10, Litmus: 3 } });
  const base = new Solution({ volume: 300, solutes: { NaOH: 4, Litmus: 3 } });
  assert.ok(acid.pH() < 5, `酸 pH=${acid.pH().toFixed(1)}`);
  assert.ok(Math.abs(neutral.pH() - 7) < 0.5);
  assert.ok(base.pH() > 8, `碱 pH=${base.pH().toFixed(1)}`);

  const lr = (await import('../src/render/liquidrender.js')).solutionColor;
  const cAcid = lr(acid);
  const cBase = lr(base);
  // 石蕊红 vs 蓝（RGB 分量：红 > 蓝 vs 蓝 > 红）
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const [ra, ga, ba] = rgb(cAcid.color);
  const [rb, gb, bb] = rgb(cBase.color);
  assert.ok(ra > ba, `酸中石蕊应偏红 ${cAcid.color}`);
  assert.ok(bb > rb, `碱中石蕊应偏蓝 ${cBase.color}`);
  // 酚酞：酸中透明（低 alpha），碱中显色
  const pAcid = new Solution({ volume: 300, solutes: { HCl: 3.65, C20H14O4: 3 } });
  const pBase = new Solution({ volume: 300, solutes: { NaOH: 4, C20H14O4: 3 } });
  const pcAcid = lr(pAcid);
  const pcBase = lr(pBase);
  assert.ok(pcAcid.alpha < 0.2, '酚酞在酸中应近无色');
  assert.ok(pcBase.alpha > 0.4, '酚酞在碱中应显色');
});

// ---- 5. 焰色反应 ---------------------------------------------------------------------
test('焰色：NaCl 黄、KCl 紫、CaCl2 砖红、BaCl2 黄绿、CuSO4 绿；单质 Na 黄', () => {
  assert.equal(flameColorOf('NaCl'), '#ffd23f');
  assert.equal(flameColorOf('KCl'), '#c78bff');
  assert.equal(flameColorOf('CaCl2'), '#ff5f2e');
  assert.equal(flameColorOf('BaCl2'), '#b8ff4f');
  assert.equal(flameColorOf('CuSO4'), '#4dff5f');
  assert.equal(flameColorOf('Na'), '#ffd23f');
  assert.equal(flameColorOf('Fe'), null, '铁无特征焰色');
});

test('焰色：灯上放 NaCl 火焰变黄，移走恢复', () => {
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 680, autoOn: true });
  scene.addObject(lamp);
  lamp.addPrecipitate('NaCl', 2);
  run(scene, 3);
  assert.equal(lamp.flameTint, '#ffd23f', '灯上 NaCl → 金黄火焰');
  lamp.takePrecipitate('NaCl', 2);
  run(scene, 3);
  assert.equal(lamp.flameTint, null, '移走恢复默认火焰');
});

test('铁与硫化合优先：Fe 块 + 灯上 S 粉点燃 → FeS（不再被空气氧化殆尽）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -60, y: 560, w: 900, h: 40 }));
  const lamp = new Lamp({ x: 360, y: 520, autoOn: true });
  scene.addObject(lamp);
  lamp.addPrecipitate('S', 3);
  const fe = new Block({ x: 368, y: 490, w: 30, h: 30, substance: 'Fe' }); // 3.6g
  scene.addObject(fe);
  scene.status = 'running';
  run(scene, 600);
  // 化合优先：大部分 Fe 进了 FeS（灯上），只有硫用尽后的残余才被氧化成铁锈
  const feS = lamp.precipitates.get('FeS') ?? 0;
  assert.ok(feS > 2.5, `应生成足量 FeS（1.6g S × 88/32 ≈ 4.4g），实际 ${feS.toFixed(2)}g`);
  assert.ok(fe.grid.avail('Fe2O3') < 2, `硫耗尽后残余 Fe 才氧化（少量铁锈），实际 Fe2O3 ${fe.grid.avail('Fe2O3').toFixed(2)}g`);
  assert.ok((lamp.precipitates.get('S') ?? 0) < 2.5, `硫应被大量消耗，剩 ${(lamp.precipitates.get('S') ?? 0).toFixed(2)}g`);
});

test('铁在空气点燃：生成 Fe2O3（铁锈红）而非 Fe3O4（Fe3O4 仅纯氧富氧场景）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -60, y: 560, w: 900, h: 40 }));
  const lamp = new Lamp({ x: 360, y: 520, autoOn: true });
  scene.addObject(lamp);
  const fe = new Block({ x: 368, y: 490, w: 30, h: 30, substance: 'Fe' });
  scene.addObject(fe);
  scene.status = 'running';
  run(scene, 900);
  assert.ok(fe.grid.avail('Fe2O3') > 0.5, `点燃的铁应生成 Fe2O3（铁锈），实际 ${fe.grid.avail('Fe2O3').toFixed(2)}g`);
  assert.ok(fe.grid.avail('Fe3O4') < 0.01, '空气中不应生成 Fe3O4');
});

test('铁氧化是缓慢表面过程：2 秒只生成微量铁锈（不瞬间氧化）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -60, y: 560, w: 900, h: 40 }));
  const lamp = new Lamp({ x: 360, y: 520, autoOn: true });
  scene.addObject(lamp);
  const fe = new Block({ x: 368, y: 490, w: 30, h: 30, substance: 'Fe' });
  scene.addObject(fe);
  scene.status = 'running';
  run(scene, 60); // 2 秒
  assert.ok(fe.grid.avail('Fe2O3') < 0.5, `2 秒内铁锈应很少（慢速氧化），实际 ${fe.grid.avail('Fe2O3').toFixed(2)}g`);
  assert.ok(fe.grid.avail('Fe') > 3.0, `铁主体应保持金属态，剩 ${fe.grid.avail('Fe').toFixed(2)}g`);
});

test('金属燃烧现象：点燃的铁块迸发火星（Spark 粒子）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -60, y: 560, w: 900, h: 40 }));
  const lamp = new Lamp({ x: 360, y: 520, autoOn: true });
  scene.addObject(lamp);
  const fe = new Block({ x: 368, y: 490, w: 30, h: 30, substance: 'Fe' });
  scene.addObject(fe);
  scene.status = 'running';
  for (let i = 0; i < 45; i++) scene.step(TICK); // 燃烧进行中采样
  const sparks = scene.objects.filter((o) => o.constructor.name === 'Spark');
  assert.ok(sparks.length > 0, `铁燃烧应迸发火星，实际 ${sparks.length} 颗`);
});

test('焰色混色：多种盐按暴露质量加权平均（NaCl 2g 黄 + KCl 3g 紫 → 粉紫）', () => {
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 680, autoOn: true });
  scene.addObject(lamp);
  lamp.addPrecipitate('NaCl', 2); // #ffd23f (255,210,63)
  lamp.addPrecipitate('KCl', 3);  // #c78bff (199,139,255)
  run(scene, 3);
  // 加权平均: r=(255*2+199*3)/5≈221, g=(210*2+139*3)/5≈167, b=(63*2+255*3)/5≈178
  // 近似校验（不锁死舍入）
  const c = lamp.flameTint;
  assert.ok(c && c.startsWith('#'), `应有混合焰色，实际 ${c}`);
  const n = parseInt(c.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  assert.ok(Math.abs(r - 221) <= 1 && Math.abs(g - 167) <= 1 && Math.abs(b - 178) <= 1,
    `混合焰色应≈(221,167,178)，实际 ${c}`);
});

test('焰色混色：物块 + 沉淀同时存在也加权（灯上 KCl 3g + 灯顶 NaCl 块）', () => {
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 680, autoOn: true });
  scene.addObject(lamp);
  lamp.addPrecipitate('KCl', 3);
  const blk = new Block({ x: 300, y: 650, w: 30, h: 30, substance: 'NaCl' }); // 非致密 → 全格暴露（36 格=3.6g）
  scene.addObject(blk);
  run(scene, 6);
  const c = lamp.flameTint;
  assert.ok(c && c.startsWith('#'), `应有混合焰色，实际 ${c}`);
  // 期望 = 暴露量加权平均（NaCl 黄 × 暴露质量 + KCl 紫 × 3g）
  const wx = blk.grid.exposedMasses()['NaCl'] ?? 0;
  const wv = 3;
  const calc = (a, b) => Math.round((255 * wx + 199 * wv) / (wx + wv));
  const n = parseInt(c.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const er = calc(), eg = Math.round((210 * wx + 139 * wv) / (wx + wv)), eb = Math.round((63 * wx + 255 * wv) / (wx + wv));
  assert.ok(Math.abs(r - er) <= 1 && Math.abs(g - eg) <= 1 && Math.abs(b - eb) <= 1,
    `加权混色应≈(${er},${eg},${eb})，实际 ${c}（NaCl 暴露 ${wx.toFixed(2)}g）`);
});

// ---- 6. 反应顺序 ----------------------------------------------------------------------
test('顺序：Cl2 优先氧化 I-（还原性强），KI 先于 FeSO4 被消耗', () => {
  const scene = flatScene();
  // Cl2 作为氯水溶质在池内（大气 Cl2 不被动溶解）
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { KI: 16.6, FeSO4: 15.2, Cl2: 3 } });
  scene.addObject(pool);
  run(scene, 600);
  // KI（I- 还原性强）应先被 Cl2 氧化（KI 消耗比例 > FeSO4）
  const kiUsed = (16.6 - pool.solution.mass('KI')) / 16.6;
  const feUsed = (15.2 - pool.solution.mass('FeSO4')) / 15.2;
  assert.ok(kiUsed > 0.05, `KI 应被消耗 ${pool.solution.mass('KI').toFixed(2)}`);
  assert.ok(kiUsed >= feUsed - 1e-6, `I- 还原性强应优先：KI ${(kiUsed * 100).toFixed(0)}% vs FeSO4 ${(feUsed * 100).toFixed(0)}%`);
});

test('顺序：KMnO4(酸) 氧化 FeSO4 紫色褪去（MnO4- → Mn2+）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 180, solutes: { KMnO4: 2, H2SO4: 40 } });
  scene.addObject(pool);
  const block = new Block({ x: 380, y: 680, w: 60, h: 60, substance: 'FeSO4' }); // 14.4g ≈ 足量
  scene.addObject(block);
  run(scene, 1200);
  assert.ok(pool.solution.mass('KMnO4') < 0.5, 'KMnO4 应被还原（紫色褪去）');
  assert.ok(pool.solution.mass('MnSO4') > 1, '应生成 MnSO4');
});

test('顺序：K2Cr2O7 加碱变黄（CrO4^2-）、加酸回橙红（Cr2O7^2-）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 180, solutes: { K2Cr2O7: 30 } });
  scene.addObject(pool);
  const naoh = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'NaOH' });
  scene.addObject(naoh);
  run(scene, 900);
  assert.ok(pool.solution.mass('K2CrO4') > 5, '加碱应生成 K2CrO4（黄）');
  const hcl = new Block({ x: 420, y: 680, w: 30, h: 30, substance: 'HCl' });
  scene.addObject(hcl);
  run(scene, 900);
  assert.ok(pool.solution.mass('K2Cr2O7') > 5, '加酸应回到 K2Cr2O7（橙红）');
});

// ---- 7. 新反应体系 ---------------------------------------------------------------------
test('新反应：Na 遇水剧烈反应生成 NaOH + H2（爆炸）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, water: 200 });
  scene.addObject(pool);
  // 追踪爆炸事件
  let exploded = false;
  const origExplode = scene.explode.bind(scene);
  scene.explode = (...args) => {
    exploded = true;
    return origExplode(...args);
  };
  const na = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Na' });
  scene.addObject(na);
  run(scene, 60);
  assert.ok(exploded, 'Na 遇水应爆炸');
  assert.ok(pool.solution.mass('NaOH') > 0, '应生成 NaOH');
});

test('新反应：锌+盐酸产 H2（上升气泡柱带标签）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 200 } });
  scene.addObject(pool);
  const zn = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Zn' });
  scene.addObject(zn);
  run(scene, 300);
  assert.ok(scene.atmosphere.mass('H2') > 0.1, '应生成 H2');
  // 产气时气泡柱带 H2 标签（GasColumn 生命周期 2.5s，检测反应期间的柱）
  const cols = scene.objects.filter((o) => o.constructor.name === 'GasColumn');
  if (cols.length > 0) assert.ok(cols.some((c) => c.gasId === 'H2'), '气泡柱应标记 H2');
});

test('新反应：碳粉点燃产 CO2；高温+低氧产 CO', () => {
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 680, autoOn: true });
  scene.addObject(lamp);
  const c = new Block({ x: 300, y: 650, w: 30, h: 30, substance: 'C' });
  scene.addObject(c);
  run(scene, 600);
  assert.ok(scene.atmosphere.mass('CO2') > 1, '点燃碳粉应产 CO2');
});

test('新反应：铵盐检验 NH4Cl + NaOH → NH3↑', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { NaOH: 40 } });
  scene.addObject(pool);
  const nh4 = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'NH4Cl' });
  scene.addObject(nh4);
  run(scene, 600);
  // NH3 极易溶于水 → 大部分被池水吸收成氨水（化学正确）；部分逸散进大气
  assert.ok(scene.atmosphere.mass('NH3') > 0.01 || pool.solution.mass('NH3·H2O') > 0.5, '应生成 NH3（大气或氨水）');
});

test('新反应：FeCl3 + KSCN → 血红色（检验铁离子）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { FeCl3: 30 } });
  scene.addObject(pool);
  const kscn = new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'KSCN' });
  scene.addObject(kscn);
  run(scene, 600);
  assert.ok(pool.solution.mass('Fe(SCN)3') > 1, '应生成血红色 Fe(SCN)3');
});

// ---- 溯源（origin）：调试悬停显示"物体为何存在" -----------------------------------
test('溯源：reactionEquation 生成完整方程式文本', () => {
  assert.equal(reactionEquation(['Zn', 'HCl'], ['ZnCl2', 'H2']), 'Zn+HCl → ZnCl2+H2');
  assert.equal(reactionEquation(['NaOH', 'CO2'], ['Na2CO3', 'H2O']), 'NaOH+CO2 → Na2CO3+H2O');
});

test('溯源：spawnParticles 把 origin 透传到每个粒子', () => {
  const scene = flatScene();
  scene.spawnParticles('Cu', 0.5, { x: 500, y: 500 }, true, false, { kind: 'explosion', text: 'C 碎裂' });
  assert.ok(scene.particles.length > 0, '应生成粒子');
  for (const pt of scene.particles) {
    assert.equal(pt.origin.kind, 'explosion', '粒子应带爆炸来源');
    assert.equal(pt.origin.text, 'C 碎裂');
  }
});

test('溯源：池内反应沉淀记录来源方程式（AgNO3+NaCl → AgCl↓）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { AgNO3: 30, NaCl: 20 } });
  scene.addObject(pool);
  run(scene, 120);
  assert.ok(pool.precipitates.has('AgCl'), 'AgNO3+NaCl 应生成 AgCl 沉淀');
  const origin = pool.precipOrigins.get('AgCl');
  assert.ok(origin && origin.kind === 'reaction', `AgCl 应记录反应来源，实际 ${JSON.stringify(origin)}`);
  assert.match(origin.text, /AgNO3/);
  assert.match(origin.text, /AgCl/);
});

test('溯源：产气反应的气流柱带来源方程式（Zn+HCl → H2）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { HCl: 400 } });
  scene.addObject(pool);
  const zn = new Block({ x: 380, y: 660, w: 30, h: 30, substance: 'Zn' });
  scene.addObject(zn);
  run(scene, 60); // 60 tick = 2s：气流柱（寿命 2.5s）仍在
  const plume = scene.objects.find((o) => o.hoverLabel === '气流');
  assert.ok(plume, '应生成气流柱');
  assert.equal(plume.origin.kind, 'reaction');
  assert.match(plume.origin.text, /H2/);
});

// ---- 碰撞瞬移回归：穿透解压封顶 -------------------------------------------------
function physicsObj(x, y, w, h, extra = {}) {
  return {
    x, y, w, h, vel: { x: 0, y: 0 }, onGround: true, blockedX: false,
    collisions: [], static: false, solid: true, pushable: false, gravity: 1, autoStep: true,
    get left() { return this.x; },
    get right() { return this.x + this.w; },
    get top() { return this.y; },
    get bottom() { return this.y + this.h; },
    setBottom(y) { this.y = y - this.h; },
    setTop(y) { this.y = y; },
    collider() { return new AABB(this.x, this.y, this.w, this.h); },
    getShapes() { return [new AABB(this.x, this.y, this.w, this.h)]; },
    ...extra,
  };
}

test('碰撞封顶：高块侧贴玩家不会被拽到玩家头顶（旧代码穿透=玩家身高，一次拽飞）', () => {
  const physics = new CollisionSystem({ gravity: 1200 });
  // 玩家 50×90 站在地面；块 40×60 顶比玩家顶高 10px、横向重叠——横向擦碰，不该垫高
  const player = physicsObj(200, 700, 50, 90);
  const block = physicsObj(225, 690, 40, 60, { pushable: true });
  physics.relax([player, block]);
  assert.equal(block.y, 690, '侧贴的高块不得被拽上玩家头顶');
});

test('碰撞封顶：真站在块上（小穿透）仍正常垫高', () => {
  const physics = new CollisionSystem({ gravity: 1200 });
  const p2 = physicsObj(200, 400, 50, 90);
  const b2 = physicsObj(205, 488, 40, 40, { pushable: true });
  physics.relax([p2, b2]);
  assert.equal(p2.y, 398, '真站(2px 穿透)应垫高到块顶');
});

test('碰撞封顶：深嵌宽地板不会被横向一次性甩飞（旧代码两侧穿透巨大→横移瞬移）', () => {
  const physics = new CollisionSystem({ gravity: 1200 });
  const player = physicsObj(260, 700, 50, 90);
  const floor = physicsObj(0, 780, 1000, 20, { static: true });
  const px0 = player.x;
  physics.step(1 / 30, { dynamics: [player], statics: [floor] });
  assert.ok(Math.abs(player.x - px0) <= 16, `深嵌入宽地板一帧横向位移应 ≤16px，实际 ${Math.abs(player.x - px0)}`);
});

// ---- 传送门手感回归 -------------------------------------------------------------
test('传送门：对侧门旁有薄墙挡道时落在门旁，不被甩飞/不嵌进墙', () => {
  const scene = flatScene();
  scene.status = 'running';
  const p1 = new Portal({ x: 300, y: 680, w: 40, h: 64, color: '#aa11ff' });
  const p2 = new Portal({ x: 700, y: 680, w: 40, h: 64, color: '#aa11ff' });
  scene.addObject(p1);
  scene.addObject(p2);
  // 在 p2 右侧立一根薄墙（不盖住整扇门）：落点会自动滑到墙左旁
  scene.addObject(new Floor({ x: 714, y: 560, w: 10, h: 180 }));
  const block = new Block({ x: 320, y: 690, w: 20, h: 20, substance: 'Fe' }); // 在 p1 内
  scene.addObject(block);
  run(scene, 15);
  const tgt = p2;
  const dist = Math.hypot(block.x + 10 - (tgt.x + tgt.w / 2), block.y + 10 - (tgt.y + tgt.h / 2));
  assert.ok(dist < 150, `物块应落在对侧门附近（不甩飞/不嵌墙），实际距门心 ${Math.round(dist)}px 在 (${block.x},${block.y})`);
});

test('传送门：重叠摆放的同色门不连环传送（传一次即停）', () => {
  const scene = flatScene();
  scene.status = 'running';
  // 门下方垫一块地板，避免物块在 flatScene 的 x=300~560 缺口里坠落
  scene.addObject(new Floor({ x: 250, y: 760, w: 200, h: 60 }));
  const p1 = new Portal({ x: 300, y: 680, w: 40, h: 64, color: '#22cc88' });
  const p2 = new Portal({ x: 300, y: 680, w: 40, h: 64, color: '#22cc88' }); // 完全重叠
  scene.addObject(p1);
  scene.addObject(p2);
  const block = new Block({ x: 320, y: 690, w: 20, h: 20, substance: 'Fe' });
  scene.addObject(block);
  run(scene, 15); // 传送一次 + 落地稳定
  const x1 = block.x, y1 = block.y;
  run(scene, 20);
  assert.ok(Math.abs(block.x - x1) < 5 && Math.abs(block.y - y1) < 5, '重叠门只应传一次，不得连环传送');
});

test('传送门：走出对侧门再走回 → 再次传送（没走出不能再次传）', () => {
  const scene = flatScene();
  scene.status = 'running';
  const p1 = new Portal({ x: 300, y: 680, w: 40, h: 64, color: '#ffaa00' });
  const p2 = new Portal({ x: 900, y: 680, w: 40, h: 64, color: '#ffaa00' });
  scene.addObject(p1);
  scene.addObject(p2);
  const block = new Block({ x: 320, y: 690, w: 20, h: 20, substance: 'Fe' });
  scene.addObject(block);
  run(scene, 5);
  assert.ok(block.x > 500, `应先传到对侧，x=${block.x}`);
  // 走出 p2 门，再走回 → 应再次传到 p1
  block.x = 1100; block.y = 750;
  run(scene, 3);
  block.x = 920; block.y = 690; // 走回 p2
  run(scene, 3);
  assert.ok(block.x < 500, `走出再走回应再次传送回 p1，x=${block.x}`);
});

test('传送门：站在某门内未离开时，仍可进入另一扇门逃生（小房间玩家太大场景）', () => {
  const scene = new Scene({ worldW: 2000, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 400, w: 2000, h: 400 })); // 大平台
  scene.addObject(new Floor({ x: 900, y: 500, w: 200, h: 400 })); // 小房间右墙
  scene.status = 'running';
  const p1 = new Portal({ x: 200, y: 336, w: 44, h: 64, color: '#a000ff', id: 'p1' });
  const p2 = new Portal({ x: 950, y: 336, w: 44, h: 64, color: '#a000ff', id: 'p2' }); // 小房间入口
  const p3 = new Portal({ x: 1020, y: 336, w: 44, h: 64, color: '#00ff00', id: 'p3' }); // 小房间出口
  const p4 = new Portal({ x: 300, y: 336, w: 44, h: 64, color: '#00ff00', id: 'p4' });
  for (const p of [p1, p2, p3, p4]) scene.addObject(p);
  const player = scene.addObject(new Player({ x: 220, y: 272, substance: 'NaOH', mass: 30, id: 'p' }));
  // 走进 p1 → 传到 p2（小房间）
  run(scene, 3);
  assert.ok(Math.abs(player.x - 950) < 100, `应传到小房间 p2 附近，x=${Math.round(player.x)}`);
  assert.ok(overlaps(player, p2), '应落在 p2（小房间入口）内');
  // 没离开 p2，直接走进 p3（另一扇门）→ 应传到 p4 逃生
  player.x = 1042; player.y = 272;
  run(scene, 3);
  assert.ok(Math.abs(player.x - 300) < 100, `站在 p2 内应能进 p3 逃到 p4，x=${Math.round(player.x)}`);
  assert.ok(overlaps(player, p4), '应逃到 p4（外面）');
});

test('n次传送门：可用次数用尽后整组消失', () => {
  // uses=3：前三次都能传，第四次入口已消失
  const mk = () => {
    const scene = new Scene({ worldW: 1000, worldH: 800 });
    scene.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
    scene.status = 'running';
    const a = new Portal({ x: 100, y: 636, w: 44, h: 64, color: '#ff8800', uses: 3, id: 'a' });
    const b = new Portal({ x: 600, y: 636, w: 44, h: 64, color: '#ff8800', uses: 3, id: 'b' });
    scene.addObject(a);
    scene.addObject(b);
    const player = scene.addObject(new Player({ x: 120, y: 550, substance: 'NaOH', mass: 30, id: 'p' }));
    return { scene, player };
  };
  // ① 连走两次（每次走出再进），剩余次数 3→1
  const r = mk();
  assert.equal(r.scene.portals[0].usesLeft, 3, '初始 3 次');
  r.scene.step(TICK); // 第 1 次
  assert.equal(r.scene.portals[0].usesLeft, 2, '用 1 次后剩 2');
  r.player.x = 700; r.player.y = 620; r.scene.step(TICK); // 走出 b 门
  r.player.x = 120; r.scene.step(TICK); // 走回 a → 第 2 次
  assert.equal(r.scene.portals[0].usesLeft, 1, '用 2 次后剩 1');
  // ② uses=1：一次后整组消失
  const r1 = mk();
  r1.scene.portals[0].usesLeft = 1;
  r1.scene.portals[1].usesLeft = 1;
  r1.scene.step(TICK);
  assert.equal(r1.scene.portals.length, 0, '用尽后整个同色组消失');
  assert.ok(!r1.scene.byId['a'] && !r1.scene.byId['b'], '两扇门都不再存在');
});

test('传送门绑定开关：开关关不传、开关开才传（支持"&"联锁开关）', () => {
  const runCase = (hasOpening) => {
    const scene = new Scene({ worldW: 1000, worldH: 800 });
    scene.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
    scene.status = 'running';
    const sw = new Switch({ x: 400, y: 678, opening: 'Cu', id: 'sw1' });
    scene.addObject(sw);
    if (hasOpening) sw.addPrecipitate('Cu', 1);
    const a = new Portal({ x: 100, y: 636, w: 44, h: 64, color: '#ff00ff', switchId: 'sw1', id: 'a' });
    const b = new Portal({ x: 600, y: 636, w: 44, h: 64, color: '#ff00ff', id: 'b' });
    scene.addObject(a);
    scene.addObject(b);
    const p = scene.addObject(new Player({ x: 120, y: 550, substance: 'NaOH', mass: 30, id: 'p' }));
    scene.step(TICK);
    return p;
  };
  const off = runCase(false);
  assert.ok(Math.abs(off.x - 120) < 30, `开关关时不应传送，x=${Math.round(off.x)}`);
  const on = runCase(true);
  assert.ok(Math.abs(on.x - 600) < 100, `开关开时应传送到对侧，x=${Math.round(on.x)}`);
});

test('气体探测器：可设开启物质——气体超标 或 放入开启物质 任一即开（OR）', () => {
  // 只有开启物质：放入才开
  const s1 = new Scene();
  s1.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
  s1.status = 'running';
  const g1 = new GasDetector({ x: 300, y: 678, gas: '', opening: 'Cu', id: 'g1' });
  s1.addObject(g1);
  run(s1, 1);
  assert.equal(g1.open, false, '无气体且未放开启物应关');
  g1.addPrecipitate('Cu', 2);
  run(s1, 1);
  assert.equal(g1.open, true, '放入开启物应开');
  // 既有气体又有开启物质：任一满足即开
  const s3 = new Scene();
  s3.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
  s3.status = 'running';
  const g3 = new GasDetector({ x: 300, y: 678, gas: 'H2', threshold: 0.5, opening: 'Cu', id: 'g3' });
  s3.addObject(g3);
  run(s3, 1);
  assert.equal(g3.open, false, '都无应关');
  g3.addPrecipitate('Cu', 1);
  run(s3, 1);
  assert.equal(g3.open, true, '只放开启物（无气体）也应开（OR）');
});

test('传送门 render 收到 opts 而非 scene 时（渲染器实际传参）不崩溃', () => {
  const scene = new Scene();
  const gd = new GasDetector({ x: 0, y: 0, gas: 'H2', threshold: 0.5, id: 'gd' });
  scene.addObject(gd);
  const p = new Portal({ x: 0, y: 0, w: 44, h: 64, color: '#f00', switchId: 'gd', id: 'p' });
  scene.addObject(p);
  scene.status = 'running';
  scene.step(TICK);
  // 渲染器传的是 opts（{ scene, time }），不是 scene 本身——旧代码会崩在 scene.byId
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {}, width: 10 }) });
  assert.doesNotThrow(() => p.render(ctx, { scene, time: 0 }));
});

test('开关 deleteId：开启瞬间删除指定物体（含从 statics 移除，不再挡人）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  const wall = new Floor({ x: 500, y: 600, w: 40, h: 100, id: 'wall' });
  scene.addObject(wall);
  scene.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
  scene.status = 'running';
  const sw = new Switch({ x: 300, y: 678, opening: 'Cu', deleteId: 'wall', id: 'sw' });
  scene.addObject(sw);
  run(scene, 1);
  assert.ok(scene.byId['wall'], '开关未开时墙还在');
  sw.addPrecipitate('Cu', 1);
  run(scene, 1);
  assert.ok(!scene.byId['wall'], '开关开启后墙被删除');
  assert.ok(!scene.statics.includes(wall), '墙应同时从 statics 移除（不再挡人）');
  assert.ok(!scene.objects.includes(wall), '墙应从 objects 移除');
});

test('开关 showId：开启时显现初始隐藏的物体（无碰撞 → 有碰撞）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  const wall = new Floor({ x: 500, y: 600, w: 40, h: 100, id: 'wall', hidden: true });
  scene.addObject(wall);
  scene.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
  scene.status = 'running';
  const sw = new Switch({ x: 300, y: 678, opening: 'Cu', showId: 'wall', id: 'sw' });
  scene.addObject(sw);
  assert.ok(scene.byId['wall'], '隐藏物仍在 byId（可被引用）');
  assert.ok(!scene.objects.includes(wall), '隐藏物不在 objects（不渲染/不参与逻辑）');
  assert.ok(!scene.statics.includes(wall), '隐藏物不在 statics（无碰撞箱）');
  run(scene, 5);
  assert.ok(scene.byId['wall'].hidden, '开关未开时仍隐藏');
  sw.addPrecipitate('Cu', 1);
  run(scene, 1);
  assert.ok(!scene.byId['wall'].hidden, '开关开启后隐藏物显现');
  assert.ok(scene.objects.includes(wall), '显现后进入 objects');
  assert.ok(scene.statics.includes(wall), '显现后进入 statics（恢复碰撞箱）');
});

test('关卡自定义反应：最高优先级，覆盖内置反应', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { CuSO4: 60 } }));
  scene.status = 'running';
  // 内置 Fe+CuSO4→FeSO4+Cu；自定义改成 Fe+CuSO4→Fe2O3（假产物），应压过内置
  const rule = parseReactionStr('Fe + CuSO4 → Fe2O3');
  assert.ok(rule, '反应字符串应能解析');
  scene.customReactions.push(rule);
  const fe = new Block({ x: 400, y: 620, w: 40, h: 40, substance: 'Fe' });
  scene.addObject(fe);
  run(scene, 600);
  assert.ok(fe.grid.avail('Fe2O3') > 0.5, '自定义产物 Fe2O3 应生成（自定义生效）');
  assert.ok(fe.grid.avail('FeSO4') < 0.1, '内置产物 FeSO4 应被压制');
});

test('关卡自定义反应：解析器接受系数与箭头', () => {
  const r = parseReactionStr('2H2 + O2 → 2H2O');
  assert.ok(r, '应能解析');
  assert.equal(r.reactants[0].coeff, 2);
  assert.equal(r.reactants[0].id, 'H2');
  assert.equal(r.products[0].coeff, 2);
  assert.equal(parseReactionStr('Cu + 不存在的物质 → CuO'), null, '不存在的物质应解析失败');
});

test('关卡自定义反应：同一池内双反应物也能反应（3NaClO+2NH4OH→3NaCl+N2+5H2O）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
  scene.addObject(new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NH4OH: 60, NaClO: 60 } }));
  scene.status = 'running';
  scene.customReactions.push(parseReactionStr('3NaClO + 2NH4OH → 3NaCl + N2 + 5H2O'));
  const pool = scene.containers[0];
  run(scene, 600);
  assert.ok(pool.material.avail('NaCl') > 0.5, '同池双反应物自定义反应应生成 NaCl');
});

test('自定义反应：错误提示能指出无效物质', () => {
  assert.equal(reactionStrError('Cu + 假物质 → CuO'), '物质「假物质」不在物质表中');
  assert.equal(reactionStrError('Cu + HCl → CuCl2 + H2'), null, '合法反应无错误提示');
  assert.equal(parseReactionStr('3NaClO + 2NH4OH → 3NaCl + N2 + 5H2O') !== null, true, 'NH4OH 应可解析');
});

test('粉末沉淀 + 物块反应：固体产物以沉淀形式生成（不附着到物块）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 2000, h: 80 }));
  scene.status = 'running';
  const lamp = new BlastLamp({ x: 300, y: 660, autoOn: true, highTemp: true });
  scene.addObject(lamp);
  lamp.addPrecipitate('CuO', 8); // 灯上放 CuO 粉末
  const cBlock = new Block({ x: 305, y: 600, w: 20, h: 20, substance: 'C', mass: 5 });
  scene.addObject(cBlock);
  run(scene, 600); // C + CuO → Cu + CO2（固固还原）
  const cuOnBlock = cBlock.grid.avail('Cu');
  const cuParticles = scene.particles.filter((p) => p.substance === 'Cu').reduce((a, p) => a + p.amount, 0);
  const cuLamp = lamp.precipitates.get('Cu') ?? 0; // 灯上的沉淀粉末
  const cuTotal = cuParticles + cuLamp;
  assert.ok(cuTotal >= 0.1, `粉末+物块的产物应是沉淀 Cu（灯上粉末或粒子），实得 ${cuTotal.toFixed(2)}g`);
  assert.ok(cuOnBlock < 0.1, `Cu 不应附着到物块上，实得 ${cuOnBlock.toFixed(2)}g`);
});

test('粉末沉淀 + 玩家：不可溶产物以沉淀生成；核心物质仍附着回血', () => {
  const eng = new ChemistryEngine();
  const emitCtx = (over) => {
    let emitted = null;
    const ctx = {
      env: { emit: (p) => { emitted = p; } },
      inContainer: false, containerMat: null,
      playerInvolved: true, solidObj: null, playerCore: 'Fe2O3',
      powderInvolved: false, lastRxText: '铝热',
      ...over,
    };
    eng._emit('Fe', 1, ctx);
    return emitted;
  };
  assert.equal(emitCtx({ powderInvolved: true }).phase, 'precipitate', '玩家+粉末：产物应沉淀');
  assert.equal(emitCtx({ powderInvolved: false }).phase, 'adhere', '无粉末：仍附着（旧行为）');
  assert.equal(emitCtx({ powderInvolved: true, playerCore: 'Fe' }).phase, 'adhere', '产物=核心：仍附着回血');
});

test('noLift：标记不可被气流托起的物块不受气泡柱影响', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 700, w: 1400, h: 80 }));
  scene.status = 'running';
  scene.addObject(new GasColumn({ x: 200, y: 100, w: 300, h: 600, dir: -1 })); // 上升气流覆盖 y100-700
  const light = new Block({ x: 220, y: 660, w: 30, h: 30, substance: 'Al', mass: 2 });
  const heavy = new Block({ x: 420, y: 660, w: 30, h: 30, substance: 'Fe', mass: 20, noLift: true });
  scene.addObject(light);
  scene.addObject(heavy);
  run(scene, 180);
  assert.ok(light.y < 500, `可托起的块应被气流托起，y=${light.y.toFixed(0)}`);
  assert.ok(Math.abs(heavy.y - 640) < 15, `noLift 的块应留在原地，y=${heavy.y.toFixed(0)}`);
});

test('开关 igniteId/extinguishId：开启点燃灯、关闭熄灭灯', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 80 }));
  scene.status = 'running';
  const lamp = new Lamp({ x: 400, y: 660, autoOn: false, id: 'lamp1' });
  scene.addObject(lamp);
  const sw = new Switch({ x: 300, y: 668, mode: 'chemical', opening: 'Cu', igniteId: 'lamp1', extinguishId: 'lamp1', id: 'sw' });
  scene.addObject(sw);
  assert.equal(lamp.lit, false, '初始灯应灭');
  sw.addPrecipitate('Cu', 2);
  run(scene, 1);
  assert.equal(lamp.lit, true, '开关开启应点燃灯');
  sw.takePrecipitate('Cu', 2);
  run(scene, 1);
  assert.equal(lamp.lit, false, '开关关闭应熄灭灯');
});

test('压力开关：沉淀不压开，只有玩家/物块能压开', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 80 }));
  scene.status = 'running';
  const sw = new Switch({ x: 300, y: 678, mode: 'pressure', id: 'sw' });
  scene.addObject(sw);
  // 沉淀（有碰撞箱的 placed 粒子）在开关上：不应压开
  scene.spawnParticles('Cu', 10, { x: 320, y: 668 }, true, true);
  run(scene, 60);
  assert.equal(sw.open, false, '沉淀不应压开压力开关');
  // 清掉沉淀（避免玩家落在沉淀堆顶够不到开关），玩家站上开关：应压开
  for (const pt of [...scene.particles]) scene.removeObject(pt);
  const p = new Player({ x: 310, y: 570, substance: 'NaOH', mass: 30 });
  scene.addObject(p);
  run(scene, 90);
  assert.equal(sw.open, true, '玩家应压开压力开关');
});

// ---- NaN/幻影物质回归：玩家跳上含 Al 的喷灯（铝热）不得产生 Fe+S / NaN -------------
test('铝热场景无幻影物质/NaN：喷灯上 Fe+S 不应凭空出现（volume=0 的干式台子）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const lamp = new BlastLamp({ x: 368, y: 662, autoOn: true, highTemp: true, id: 'lamp' });
  scene.addObject(lamp);
  lamp.addPrecipitate('Al', 1); // level.html 开局：灯上 Al 粉
  const p = new Player({ x: 330, y: 600, substance: 'Fe2O3', mass: 30, id: 'p' });
  scene.addObject(p);
  // 收集反应日志（debugMode 记录所有）
  const logs = [];
  const orig = scene.onReaction.bind(scene);
  scene.onReaction = (t) => { logs.push(t); orig(t); };
  run(scene, 300);
  // 1) 不得出现 Fe+S（S 是 volume=0 的 0/0=NaN 幻影；关卡没有 S）
  assert.ok(!logs.some((t) => t.includes('Fe+S')), `不应出现 Fe+S 幻影反应，日志：${[...new Set(logs)].join(' | ')}`);
  // 2) 玩家与灯的全部质量不得为 NaN/Infinity
  const scan = (m) => { for (const [, v] of m) assert.ok(Number.isFinite(v), `质量非有限：${v}`); };
  scan(lamp.solution.solutes);
  scan(lamp.precipitates);
  if (p.grid && p.grid.masses) {
    for (const [, v] of Object.entries(p.grid.masses())) assert.ok(Number.isFinite(v), `玩家质量非有限：${v}`);
  }
  // 3) 铝热应正常发生（Fe 生成在灯上）
  assert.ok((lamp.precipitates.get('Fe') ?? 0) > 0.5, `铝热应还原出 Fe，实际 ${lamp.precipitates.get('Fe') ?? 0}g`);
});

// ---- 传送门：推物体过门后落点不重叠（防重叠抖动/一起被弹飞） -----------------------
test('传送门：玩家推物块过门后，玩家落点避开物块（不重叠不抖动）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const p1 = new Portal({ x: 300, y: 640, w: 44, h: 64, color: '#aa11ff', id: 'p1' });
  const p2 = new Portal({ x: 700, y: 640, w: 44, h: 64, color: '#aa11ff', id: 'p2' });
  scene.addObject(p1);
  scene.addObject(p2);
  const blk = new Block({ x: 250, y: 660, w: 44, h: 44, substance: 'Fe', mass: 10, id: 'blk' });
  scene.addObject(blk);
  const p = new Player({ x: 150, y: 600, mass: 30, id: 'p' });
  scene.addObject(p);
  run(scene, 30);
  // 推物块过门 A → 物块传到门 B
  scene.control.add('right');
  for (let i = 0; i < 120 && blk.x < 650; i++) run(scene, 1);
  assert.ok(blk.x > 650, `物块应被传送到对侧门，x=${blk.x.toFixed(1)}`);
  // 玩家继续走进门 A → 也被传送：落点必须避开物块（strict 落点）
  let overlap = 0;
  let maxStep = 0;
  let lastX = p.x;
  for (let i = 0; i < 90; i++) {
    run(scene, 1);
    if (p.right > blk.x && p.left < blk.x + blk.w && p.bottom > blk.top && p.top < blk.bottom) overlap++;
    maxStep = Math.max(maxStep, Math.abs(p.x - lastX));
    lastX = p.x;
  }
  scene.control.delete('right');
  assert.equal(overlap, 0, `传送后玩家与物块不得重叠（重叠会导致反复抖动/弹飞），重叠帧 ${overlap}`);
  assert.ok(p.x > 650, `玩家应已过门到对侧，x=${p.x.toFixed(1)}`);
});

// ---- 高中反应补齐：制氯/制氨/两性/硅酸/卤化银/NO 氧化等 ----

test('高锰酸钾制氯气：KMnO4 + HCl → Cl2（无需浓盐酸，稀盐酸也反应）', () => {
  // 稀盐酸（100 g/L < 300 阈值）：KMnO4 氧化性极强，仍制出氯气
  const s1 = flatScene();
  const p1 = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 200, solutes: { KMnO4: 5, HCl: 20 } });
  s1.addObject(p1);
  s1.status = 'running';
  run(s1, 600);
  assert.ok(s1.atmosphere.mass('Cl2') > 0.5, `KMnO4 + 稀盐酸也应制出 Cl2，实际 ${s1.atmosphere.mass('Cl2').toFixed(2)}g`);
  // 浓盐酸更快更多（对比不要求，仅验证也能反应）
  const s2 = flatScene();
  const p2 = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 200, solutes: { KMnO4: 5, HCl: 80 } });
  s2.addObject(p2);
  s2.status = 'running';
  run(s2, 600);
  assert.ok(s2.atmosphere.mass('Cl2') > 1, `浓盐酸应制出 Cl2，实际 ${s2.atmosphere.mass('Cl2').toFixed(2)}g`);
});

test('NH4Cl + Ca(OH)2 制氨：2NH4Cl + Ca(OH)2 --△--> CaCl2 + 2NH3↑ + 2H2O', () => {
  // 溶液制氨（CaCl2 不会被 NH3+HCl 白烟消耗，稳定可断言）；NH4Cl 自分解产物被 Ca(OH)2 吸收
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NH4Cl: 20 } });
  scene.addObject(pool);
  scene.addObject(new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Ca(OH)2' }));
  const lamp = new Lamp({ x: 300, y: 680, autoOn: true }); // 加热
  scene.addObject(lamp);
  scene.status = 'running';
  run(scene, 600);
  assert.ok(pool.solution.mass('CaCl2') > 0.5, `应生成 CaCl2（制氨进行），实际 ${pool.solution.mass('CaCl2').toFixed(2)}g`);
  assert.ok(scene.atmosphere.mass('NH3') > 0.01 || pool.solution.mass('NH3·H2O') > 0.1, `应产生 NH3（大气或氨水）`);
});

test('两性/酸性氧化物溶于强碱：Al2O3 + NaOH → NaAlO2；SiO2 + NaOH → Na2SiO3（需溶液介质）', () => {
  const s1 = flatScene();
  const p1 = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NaOH: 30 } });
  s1.addObject(p1);
  s1.addObject(new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Al2O3' }));
  s1.status = 'running';
  run(s1, 600);
  assert.ok(p1.solution.mass('NaAlO2') > 1, `Al2O3 应溶于 NaOH 生成 NaAlO2，实际 ${p1.solution.mass('NaAlO2').toFixed(2)}g`);
  const s2 = flatScene();
  const p2 = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NaOH: 30 } });
  s2.addObject(p2);
  s2.addObject(new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'SiO2' }));
  s2.status = 'running';
  run(s2, 600);
  assert.ok(p2.solution.mass('Na2SiO3') > 1, `SiO2 应溶于 NaOH 生成 Na2SiO3（水玻璃），实际 ${p2.solution.mass('Na2SiO3').toFixed(2)}g`);
});

test('水玻璃与酸：Na2SiO3 + HCl → H2SiO3↓（硅酸胶状沉淀）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { Na2SiO3: 10, HCl: 8 } });
  scene.addObject(pool);
  scene.status = 'running';
  run(scene, 300);
  assert.ok((pool.precipitates.get('H2SiO3') ?? 0) > 0.5, `应生成 H2SiO3 沉淀，实际 ${pool.precipitates.get('H2SiO3')}g`);
});

test('铜绿与盐酸：Cu2(OH)2CO3 + 4HCl → 2CuCl2 + CO2↑ + 3H2O', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { HCl: 30 } });
  scene.addObject(pool);
  scene.addObject(new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Cu2(OH)2CO3' }));
  scene.status = 'running';
  run(scene, 600);
  assert.ok(pool.solution.mass('CuCl2') > 1, `铜绿应溶于盐酸生成 CuCl2，实际 ${pool.solution.mass('CuCl2').toFixed(2)}g`);
  assert.ok(scene.atmosphere.mass('CO2') > 0.3, `应放出 CO2，实际 ${scene.atmosphere.mass('CO2').toFixed(2)}g`);
});

test('Ca(HCO3)2 加热分解：块放灯上 → CaCO3 + CO2 + H2O（水垢成因）', () => {
  const scene = flatScene();
  const lamp = new Lamp({ x: 300, y: 700, w: 140, h: 10, autoOn: true });
  scene.addObject(lamp);
  const b = new Block({ x: 330, y: 670, w: 30, h: 30, substance: 'Ca(HCO3)2' });
  scene.addObject(b);
  scene.status = 'running';
  run(scene, 600);
  assert.ok(b.grid.avail('CaCO3') > 0.5, `灯上应分解出 CaCO3，实际 ${b.grid.avail('CaCO3').toFixed(2)}g`);
  assert.ok(scene.atmosphere.mass('CO2') > 0.3, `应放出 CO2，实际 ${scene.atmosphere.mass('CO2').toFixed(2)}g`);
});

test('NO 遇 O2 氧化变 NO2：2NO + O2 → 2NO2（无色→红棕；需灯在场的大气反应）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 200, solutes: { HNO3: 40 } });
  scene.addObject(pool);
  scene.addObject(new Block({ x: 340, y: 680, w: 30, h: 30, substance: 'Cu' }));
  const lamp = new Lamp({ x: 500, y: 640, autoOn: true }); // 大气反应活跃环境（globalIgnited）
  scene.addObject(lamp);
  scene.status = 'running';
  run(scene, 600);
  assert.ok(scene.atmosphere.mass('NO2') > 0.2, `NO 应被 O2 氧化为红棕 NO2，实际 ${scene.atmosphere.mass('NO2').toFixed(2)}g`);
  assert.ok(scene.atmosphere.mass('NO') < scene.atmosphere.mass('NO2') + 1, `NO 应大部分转化：NO=${scene.atmosphere.mass('NO').toFixed(2)} NO2=${scene.atmosphere.mass('NO2').toFixed(2)}`);
});

test('卤化银沉淀：AgNO3 + KBr → AgBr↓（淡黄）、AgNO3 + KI → AgI↓（黄）', () => {
  const scene = flatScene();
  const pool = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { AgNO3: 10, KBr: 5, KI: 5 } });
  scene.addObject(pool);
  scene.status = 'running';
  run(scene, 300);
  assert.ok((pool.precipitates.get('AgBr') ?? 0) > 0.5, `应生成 AgBr 沉淀，实际 ${pool.precipitates.get('AgBr')}g`);
  assert.ok((pool.precipitates.get('AgI') ?? 0) > 0.5, `应生成 AgI 沉淀，实际 ${pool.precipitates.get('AgI')}g`);
});
