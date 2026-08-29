// ============================================================================
// 沉淀堆（Deposit）+ 梯形堆网格 + 像素模式（w/h 定尺寸）测试
// 覆盖：堆形/质量守恒、堆尺寸模式、不可推动/不可托起、可站立、可被酸反应消耗、
//       Block/Player 像素模式（编辑器缩放/放置的引擎侧规则）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Beaker } from '../src/objects/beaker.js';
import { Block } from '../src/objects/block.js';
import { Player } from '../src/objects/player.js';
import { Deposit } from '../src/objects/deposit.js';
import { MaterialGrid, CELL_MASS } from '../src/render/gridrender.js';
import { particleSizeOf, splitPile } from '../src/objects/particle.js';

const TICK = 1 / 30;
function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

// ---- 1. 梯形堆网格 -----------------------------------------------------------
test('heapForMass：质量守恒（±1 格舍入）且逐行收窄', () => {
  for (const m of [0.5, 1, 2, 5, 10, 20, 30, 50, 100]) {
    const g = MaterialGrid.heapForMass(m, 'BaCO3');
    const total = g.totalMass();
    assert.ok(Math.abs(total - m) <= 1, `mass=${m}g → 实际 ${total.toFixed(2)}g`);
    assert.ok(g.rows >= 2 && g.rows <= 6, `rows=${g.rows}`);
    // 从上往下（y=0 是顶）行宽应递增：顶窄底宽
    for (let k = 1; k < g.rows; k++) {
      const prev = g.cells[k - 1].filter(Boolean).length;
      const cur = g.cells[k].filter(Boolean).length;
      assert.ok(cur > prev, `第 ${k} 行应比第 ${k - 1} 行宽：${prev} → ${cur}`);
    }
    // 每格满质量
    assert.equal(Math.abs(g.totalMass() - g.cells.flat().filter(Boolean).length * CELL_MASS) < 1e-9, true);
  }
});

test('heapRect：按目标像素尺寸生成堆形（行数由高决定）', () => {
  const g = MaterialGrid.heapRect(200, 30, 'Cu(OH)2');
  assert.equal(g.cols, 40, `cols=${g.cols}`);
  assert.equal(g.rows, 6, `rows=${g.rows}`);
  // 总格数 = Σ(W-2k) = H*W - H(H-1) = 6*40-30 = 210
  assert.ok(Math.abs(g.totalMass() - 210 * CELL_MASS) < 1e-9, `totalMass=${g.totalMass()}`);
  // 顶行不应为空
  const top = g.cells[0].filter(Boolean).length;
  assert.ok(top >= 1, `顶行应有格：${top}`);
});

// ---- 2. 沉淀堆对象（编辑器占位形态：无实体，网格=堆形预览+物化布局）----------
test('沉淀堆默认不可推动、不可被气流托起、保持惰性壳', () => {
  const d = new Deposit({ x: 100, y: 600, substance: 'BaCO3', mass: 20 });
  assert.equal(d.pushable, false);
  assert.equal(d.noLift, true);
  assert.equal(d.solid, false, '沉淀堆不是实体块（粒子化后的粒子才是实体）');
  assert.equal(d.physicsKind, 'none');
  assert.equal(d.hoverLabel, '沉淀堆');
  assert.ok(Math.abs(d.grid.totalMass() - 20) <= 1, `质量=${d.grid.totalMass().toFixed(2)}`);
  assert.ok(Math.abs(d.mass - d.grid.totalMass()) < 1e-9, '占位质量=网格真实质量');
});

test('沉淀堆显式 w/h（像素模式）→ 堆形 + 质量=格数', () => {
  const d = new Deposit({ x: 0, y: 0, substance: 'BaCO3', w: 100, h: 40 });
  assert.equal(d.grid.rows, 6, `rows=${d.grid.rows}（行数 clamp 2..6）`);
  assert.equal(d.grid.cols, 20, `cols=${d.grid.cols}`);
  assert.ok(Math.abs(d.mass - d.grid.totalMass()) < 1e-9);
  assert.ok(d.grid.totalMass() > 0);
});

test('沉淀堆移动/缩放：syncGrid 让 gridOrigin 跟随逻辑位置（编辑器拖拽锚点）', () => {
  const d = new Deposit({ x: 100, y: 600, substance: 'BaCO3', mass: 20 });
  const aabb0 = d.grid.minAABB();
  d.x = 480;
  d.y = 620;
  d.syncGrid();
  assert.equal(d.gridOrigin.x, d.x - aabb0.x, 'gridOrigin.x 应跟随 x（拖走堆形不留在原位）');
  assert.equal(d.gridOrigin.y, d.y - aabb0.y, 'gridOrigin.y 应跟随 y');
  assert.equal(d.w, aabb0.w, 'w 与网格 AABB 一致');
  assert.equal(d.h, aabb0.h, 'h 与网格 AABB 一致');
  // 再次移动（连续拖拽）仍同步
  d.x = 900;
  d.y = 500;
  d.syncGrid();
  assert.equal(d.gridOrigin.x, d.x - aabb0.x);
  assert.equal(d.gridOrigin.y, d.y - aabb0.y);
});

test('玩家落进沉淀堆：颗粒堆有阻力、不会沉穿地板（粒子可垫脚）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 700, w: 2000, h: 60 }));
  scene.addObject(new Deposit({ x: 120, y: 685, substance: 'BaCO3', mass: 10 }));
  const p = new Player({ x: 140, y: 500 });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 240);
  assert.ok(p.onGround, '玩家应站在（垫脚的）沉淀/地板上');
  assert.ok(p.bottom <= 701, `bottom=${p.bottom} 不应陷进地板`);
  assert.ok(p.bottom >= 640, `bottom=${p.bottom} 应落在粒子堆/地板附近`);
});

test('沉淀堆浸入盐酸池：物化粒子被反应消耗（BaCO3 + HCl → BaCl2 + CO2）', () => {
  // 地板留 [300,560] 缺口，池放在缺口里
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 }));
  scene.addObject(new Floor({ x: 560, y: 720, w: 4000, h: 80 }));
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 200 } });
  scene.addObject(pool);
  const d = new Deposit({ x: 380, y: 690, substance: 'BaCO3', mass: 10 });
  scene.addObject(d);
  scene.status = 'running';
  run(scene, 3);
  const before = scene.particles.filter((p) => p.substance === 'BaCO3').reduce((a, p) => a + p.amount, 0);
  assert.ok(before > 5, `物化出粒子：${before.toFixed(2)}g`);
  run(scene, 600);
  const remaining = scene.particles.filter((p) => p.substance === 'BaCO3').reduce((a, p) => a + p.amount, 0);
  assert.ok(remaining < before * 0.5, `盐酸应消耗沉淀粒子：${before.toFixed(2)}g → ${remaining.toFixed(2)}g`);
  assert.ok(scene.atmosphere.mass('CO2') > 0.01 || pool.solution.mass('BaCl2') > 0.01, '应生成 CO2/BaCl2');
});

// ----------------------------------------------------------------------------
// 2.4 物化：开局整堆变成"一滩真实沉淀粒子"（实心可垫脚/可拾取/可反应，与玩家放置一致）
// ----------------------------------------------------------------------------
test('沉淀堆开局物化为粒子：质量守恒 + 壳退场（byId 保留）', () => {
  const scene = new Scene({ worldW: 600, worldH: 500 });
  scene.addObject(new Floor({ x: -60, y: 400, w: 800, h: 40 }));
  const d = new Deposit({ x: 220, y: 280, substance: 'BaCO3', mass: 20, id: 'dep1' });
  scene.addObject(d);
  scene.status = 'running';
  run(scene, 3); // 首帧物化
  assert.equal(d.grid, null, '壳应清空网格');
  assert.ok(d.hidden, '壳应隐藏');
  assert.equal(scene.byId['dep1'], d, 'byId 应保留（开关引用）');
  assert.ok(!scene.objects.includes(d), '壳不在活动物体里');
  const parts = scene.particles.filter((p) => p.substance === 'BaCO3');
  assert.ok(parts.length >= 38, `物化出粒子（20g → 40 颗 0.5g/颗）：${parts.length}`);
  assert.ok(parts.every((p) => p.amount <= 0.5 + 1e-9), '颗粒质量 ≤ 0.5g（最小沉淀颗粒）');
  const total = parts.reduce((a, p) => a + p.amount, 0);
  assert.ok(Math.abs(total - 20) <= 1, `粒子总质量≈20g：${total.toFixed(2)}g`);
  // 粒子落定在地板上（有物理,而非静止壳）；粒子彼此堆叠 → 顶部落得高些属正常
  run(scene, 120);
  const settled = scene.particles.filter((p) => p.substance === 'BaCO3');
  assert.ok(settled.length > 0, '粒子仍在场');
  const bottoms = settled.map((p) => p.bottom);
  assert.ok(Math.min(...bottoms) > 360 && Math.max(...bottoms) <= 410, `粒子落在地板附近：${Math.min(...bottoms).toFixed(0)}~${Math.max(...bottoms).toFixed(0)}`);
});

// ----------------------------------------------------------------------------
// 2.5 沉淀堆 vs 物块：粒子是"软体"——绝不推走/顶起物块（用户反馈：沉淀把物块挤走、
// 跑到物块底下把物块顶起来）
// ----------------------------------------------------------------------------
test('沉淀堆压向物块侧面：物块不被推开（粒子软性让位）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  const block = new Block({ x: 500, y: 680, w: 40, h: 40, substance: 'Fe', pushable: true });
  scene.addObject(block);
  scene.status = 'running';
  // 30 颗 0.25g 粒子紧贴物块左侧撒下（部分与侧缘重叠），塌下来压向物块侧面
  for (let i = 0; i < 30; i++) scene.spawnParticles('BaCO3', 0.25, { x: 484 + (i % 6) * 4, y: 640 }, true, true, null, 0);
  for (let i = 0; i < 240; i++) scene.step(TICK);
  assert.ok(Math.abs(block.x - 500) < 2, `物块不应被沉淀堆推开：x=${block.x.toFixed(1)}`);
  assert.ok(block.bottom > 718, `物块应仍在地板上：bottom=${block.bottom.toFixed(1)}`);
});

test('沉淀粒子楔到物块底缘：物块不被顶起（粒子被挤出/贴住不动）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  const block = new Block({ x: 500, y: 680, w: 40, h: 40, substance: 'Fe', pushable: true });
  scene.addObject(block);
  scene.status = 'running';
  // 粒子直接生成在物块底缘下一丢丢（模拟物化/反应时粒子撒进物块底部）
  scene.spawnParticles('BaCO3', 0.25, { x: 512, y: 720 }, true, true, null, 0);
  scene.spawnParticles('BaCO3', 0.25, { x: 526, y: 721 }, true, true, null, 0);
  scene.spawnParticles('BaCO3', 0.25, { x: 500, y: 722 }, true, true, null, 0);
  for (let i = 0; i < 120; i++) scene.step(TICK);
  assert.ok(Math.abs(block.x - 500) < 2, `物块不应被横向挤走：x=${block.x.toFixed(1)}`);
  assert.ok(Math.abs(block.bottom - 720) < 2.5, `物块不应被顶起：bottom=${block.bottom.toFixed(1)}`);
});

test('沉淀堆物化后可拾取：玩家 Q 收集粒子入物品栏', () => {
  const scene = new Scene({ worldW: 600, worldH: 500 });
  scene.addObject(new Floor({ x: -60, y: 400, w: 800, h: 40 }));
  scene.addObject(new Deposit({ x: 220, y: 280, substance: 'BaCO3', mass: 12, id: 'dep1' }));
  const p = new Player({ x: 196, y: 330, substance: 'NaOH', mass: 30 });
  scene.addObject(p);
  scene.player = p;
  scene.status = 'running';
  run(scene, 150); // 物化 + 粒子落定
  assert.equal(scene.objects.filter((o) => o.isDeposit).length, 0, '无活动沉淀堆壳');
  p.tryCollect(scene); // 站在堆旁按 Q
  const slot = p.inventory.slots.find((s) => s && s.substance === 'BaCO3');
  assert.ok(slot && slot.mass > 0, '物品栏应有拾取的 BaCO3');
  const remaining = scene.particles.filter((q) => q.substance === 'BaCO3').reduce((a, q) => a + q.amount, 0);
  assert.ok(remaining < 12 - 0.5, `粒子应被拾走：剩 ${remaining.toFixed(2)}g`);
});

test('沉淀堆卡在烧杯口上方：物化后粒子漏入杯内（像真沙子）', () => {
  // 固定随机种子（LCG，seed 29 → 6 颗入杯，完全确定性）：12g 堆心 cx≈382.5，杯正对堆心
  let seed = 29;
  const origRand = Math.random;
  Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const scene = new Scene({ worldW: 800, worldH: 700 });
  scene.addObject(new Floor({ x: -60, y: 560, w: 900, h: 40 }));
  scene.addObject(new Beaker({ x: 352.5, y: 480, w: 60, h: 80 })); // 底 560 贴地板，堆心正下方
  scene.addObject(new Deposit({ x: 300, y: 330, substance: 'BaCO3', mass: 12 })); // 宽 ~165 > 杯口
  scene.status = 'running';
  run(scene, 900);
  Math.random = origRand;
  const inBeaker = scene.particles.filter((p) => p.substance === 'BaCO3' && p.x > 352.5 && p.x < 412.5 && p.y > 460);
  assert.ok(inBeaker.length >= 5, `杯内应有漏入的沉淀粒子（12g→24 颗，≥5 颗入杯），实际 ${inBeaker.length}`);
});

// ----------------------------------------------------------------------------
// 2.6 自由粒子的堆叠：**玩家分批放置（spread 2）堆成错落有致的柱（可搭高垫脚）**；
//     大范围同时倾倒才是滩（冰面靠 iceSlip 滑走平摊——见 ice.test.js）。
// ----------------------------------------------------------------------------
test('自由沉淀粒子堆柱：分批放置（模拟玩家，spread 2）纵向堆叠、错落有致', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  // 玩家 Shift 放置：每放一颗等落地再放下一颗（真实节奏）
  for (let i = 0; i < 25; i++) {
    scene.spawnParticles('BaCO3', 0.5, { x: 500, y: 630 }, true, true, null, 2);
    for (let j = 0; j < 25; j++) scene.step(TICK);
  }
  for (let i = 0; i < 150; i++) scene.step(TICK);
  const ps = scene.particles;
  const ys = ps.map((p) => p.y + p.h / 2);
  const xs = ps.map((p) => p.x + p.w / 2);
  const yRange = Math.max(...ys) - Math.min(...ys);
  const xRange = Math.max(...xs) - Math.min(...xs);
  assert.ok(yRange > 40, `分批放置应堆成柱（高度 >40px），实际 ${yRange.toFixed(0)}px`);
  assert.ok(xRange <= 30, `柱应窄（宽 ≤30px，错落而非笔直），实际 ${xRange.toFixed(0)}px`);
  assert.ok(yRange > xRange, `柱状：高(${yRange.toFixed(0)}) > 宽(${xRange.toFixed(0)})`);
});

test('大范围倾倒（spread 80）是滩：铺开不瞬移、不穿墙', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  scene.spawnParticles('BaCO3', 100, { x: 500, y: 600 }, true, true, null, 80);
  for (let i = 0; i < 900; i++) scene.step(TICK);
  const ps = scene.particles;
  const xs = ps.map((p) => p.x + p.w / 2);
  for (const p of ps) {
    assert.ok(p.y + p.h <= 800, '粒子不穿出世界底');
    assert.ok(p.x >= -200 && p.x <= 2800, '粒子不瞬移到远处');
  }
});

test('外观契约：particleSizeOf / splitPile（两套沉淀共用：0.5g→5px、1.5g→7.5px）', () => {
  assert.ok(Math.abs(particleSizeOf(0.5) - 5) < 1e-9, '0.5g → 5px');
  assert.ok(Math.abs(particleSizeOf(1.5) - 7.5) < 1e-9, '1.5g（3×0.5g 合并）→ 7.5px（1.5 倍）');
  assert.ok(particleSizeOf(0.05) >= 3, '下限 3px');
  assert.ok(particleSizeOf(3.3) <= 7.5 + 1e-9, '上限 7.5px');
  const s1 = splitPile(100); // 100g → 200 颗 0.5g（常规）
  assert.equal(s1.n, 200);
  assert.ok(Math.abs(s1.per - 0.5) < 1e-9);
  const s2 = splitPile(301, 600); // 301g：常规 602 颗 > 600 → 按 1.5g 堆叠
  assert.ok(s2.n <= 600 && s2.n >= 200, `n=${s2.n}`);
  assert.ok(s2.per <= 1.5 + 1e-9, `per=${s2.per}`);
});

// ---- 3. 像素模式（编辑器缩放/放置的引擎侧规则）-------------------------------
test('Block：w/h + mass=0 → 按像素建网格，质量=格数×0.1g', () => {
  const b = new Block({ x: 0, y: 0, substance: 'Fe', w: 100, h: 30, mass: 0 });
  assert.equal(b.grid.cols, 20);
  assert.equal(b.grid.rows, 6);
  assert.ok(Math.abs(b.mass - 120 * CELL_MASS) < 1e-9, `mass=${b.mass}`);
});

test('Block：仅 mass → 仍按质量建矩形格网（旧行为不变）', () => {
  const b = new Block({ x: 0, y: 0, substance: 'Fe', mass: 10 });
  assert.ok(Math.abs(b.grid.totalMass() - 10) < 1e-9, `totalMass=${b.grid.totalMass()}`);
});

test('Player：w/h + mass=0 → 像素网格，血量=网格真实质量', () => {
  const p = new Player({ x: 0, y: 0, substance: 'NaOH', w: 80, h: 20, mass: 0 });
  assert.equal(p.grid.cols, 16);
  assert.equal(p.grid.rows, 4);
  assert.equal(p.maxHp, p.grid.totalMass());
  assert.equal(p.hp, p.maxHp);
});

test('Player：不给参数 → 默认质量 30（行为不变）', () => {
  const p = new Player({ x: 0, y: 0 });
  assert.equal(p.maxHp, 30);
  assert.ok(Math.abs(p.grid.totalMass() - 30) <= 1, `totalMass=${p.grid.totalMass()}`);
});

// ---- 4. 池的产气泡柱高度配置（编辑器 gasHeight 字段生效）----------------------
test('池的气泡柱高度生效：产气源无 gasHeight 时回退读容器配置', () => {
  // 地板留 [300,560] 缺口，池放在缺口里（与 highschool flatScene 一致）
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 }));
  scene.addObject(new Floor({ x: 560, y: 720, w: 4000, h: 80 }));
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 200 }, gasHeight: 140 });
  scene.addObject(pool);
  scene.addObject(new Block({ x: 380, y: 680, w: 30, h: 30, substance: 'Zn' }));
  scene.status = 'running';
  // 反应中采样（Zn 只有 3.6g，约 2 秒耗尽，气泡柱随之消散）
  run(scene, 60);
  const cols = scene.objects.filter((o) => o.constructor.name === 'GasColumn' && o.gasId === 'H2');
  assert.ok(cols.length > 0, '应有 H2 气泡柱');
  assert.equal(cols[0].h, 140, `气泡柱高度应为 140，实际 ${cols[0].h}`);
});
