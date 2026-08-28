// 性能回归：大物块（20000 格网格）+ 大沉淀堆（粒子堆）不该卡顿。
// 相关优化：网格总量/暴露/minAABB 缓存 + 消耗局部快速路径 + 粒子数上限 + 物理空间哈希。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Block } from '../src/objects/block.js';
import { Deposit } from '../src/objects/deposit.js';
import { Particle } from '../src/objects/particle.js';
import { MaterialGrid } from '../src/render/gridrender.js';

const TICK = 1 / 30;

test('性能：2000g 物块 + 2000g 沉淀堆（120 颗粒子）600 帧', () => {
  const scene = new Scene({ worldW: 3000, worldH: 900 });
  scene.addObject(new Floor({ x: -200, y: 860, w: 4000, h: 60 }));
  scene.addObject(new Block({ x: 1000, y: 500, substance: 'Fe', mass: 2000 }));
  scene.addObject(new Deposit({ x: 1600, y: 500, substance: 'BaCO3', mass: 2000 }));
  scene.status = 'running';
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) scene.step(TICK);
  const dt = performance.now() - t0;
  // 优化前该场景 >120s 超时（>200ms/帧）；600 颗粒子 + 2000g 物块 ~5-12ms/帧。
  // 阈值按"≥3 倍恶化才算回归"定：正常上限 12ms/帧 × 3 ≈ 36ms/帧 → 600 帧 < 20000ms。
  // （旧阈值 15ms/帧≈9000ms 在开发机负载波动下频繁误报——满载时 9300ms 都见过，
  //   与性能无关，只浪费排查时间。真正的性能回归（如回到 200ms/帧）数值上毫无悬念。）
  assert.ok(dt < 20000, `600 帧 ${dt.toFixed(0)}ms（>33ms/帧 视为卡顿）`);
  assert.ok(scene.particles.length <= 610, `粒子应受上限约束: ${scene.particles.length}`);
  assert.ok(scene.particles.every((p) => p.amount <= 0.5 + 1e-9 || scene.particles.length >= 590), '小堆颗粒 ≤0.5g（大堆超出上限时合并）');
});

test('颗粒质量上限：≤0.5g（最小沉淀颗粒；大堆按堆叠上限 1.5g）', () => {
  const scene = new Scene();
  scene.spawnParticles('BaCO3', 15, { x: 0, y: 0 }, true, true, null, 200);
  assert.equal(scene.particles.length, 30, `15g → 30 颗（0.5g/颗）`);
  assert.ok(scene.particles.every((p) => Math.abs(p.amount - 0.5) < 1e-9), '每颗 0.5g');
});

test('颗粒尺寸随质量缩放：0.5g=5px；1.5g=0.5g 的 1.5 倍=7.5px（锚点精确匹配）', () => {
  // 参照：单颗 0.5g → 5px；1.5g（堆叠 3 个 0.5g）→ 7.5px（尺寸 1.5 倍，用户明确要求）；
  // 更大质量（大堆合并）被 7.5px 上限夹住；更小质量有 3px 下限
  const p05 = new Particle({ x: 0, y: 0, substance: 'BaCO3', amount: 0.5 });
  assert.ok(Math.abs(p05.w - 5) < 1e-9, `0.5g → 5px：${p05.w}`);
  const p150 = new Particle({ x: 0, y: 0, substance: 'BaCO3', amount: 1.5 });
  assert.ok(Math.abs(p150.w - 7.5) < 1e-9, `1.5g → 0.5g 的 1.5 倍 7.5px：${p150.w}`);
  const pBig = new Particle({ x: 0, y: 0, substance: 'BaCO3', amount: 3.3 });
  assert.ok(Math.abs(pBig.w - 7.5) < 1e-9, `超出上限被夹到 7.5px：${pBig.w}`);
  const pTiny = new Particle({ x: 0, y: 0, substance: 'BaCO3', amount: 0.05 });
  assert.ok(pTiny.w >= 3, `下限 3px：${pTiny.w}`);
  // spawnParticles：0.5g → 1 颗 0.5g @5px；大堆合并颗粒尺寸被 7.5px 夹住
  const scene = new Scene();
  scene.spawnParticles('BaCO3', 0.5, { x: 0, y: 0 }, true, true, null, 8);
  assert.equal(scene.particles.length, 1);
  assert.ok(Math.abs(scene.particles[0].w - 5) < 1e-9, `单颗 0.5g @5px：${scene.particles[0].w}`);
  scene.spawnParticles('BaCO3', 2000, { x: 200, y: 0 }, true, true, null, 200);
  assert.ok(scene.particles.every((p) => p.w <= 7.5 + 1e-9), `大堆合并颗粒 ≤7.5px`);
});

test('堆叠分配：常规堆 0.5g/颗；大堆按"堆叠 3 个 0.5g(=1.5g)"分配', () => {
  const s1 = new Scene();
  s1.spawnParticles('BaCO3', 30, { x: 0, y: 0 }, true, true, null, 200);
  assert.equal(s1.particles.length, 60, `30g → 60 颗（0.5g/颗 常规）`);
  assert.ok(s1.particles.every((p) => Math.abs(p.amount - 0.5) < 1e-9), '常规颗粒 0.5g');
  const s2 = new Scene();
  s2.spawnParticles('BaCO3', 151, { x: 0, y: 0 }, true, true, null, 200); // 超出 600 颗常规上限（每颗 0.5 → 302 颗，≤600 常规！）
  assert.ok(s2.particles.length <= 600, `151g ≤600 颗：${s2.particles.length}（0.5g/颗 302 颗，未触发堆叠）`);
  assert.ok(s2.particles.every((p) => p.amount <= 0.5 + 1e-9), `常规 0.5g`);
  const s3 = new Scene();
  s3.spawnParticles('BaCO3', 400, { x: 0, y: 0 }, true, true, null, 200); // 常规 800 颗 > 600 → 堆叠
  assert.ok(s3.particles.length <= 600 && s3.particles.length >= 260, `大堆按堆叠上限：${s3.particles.length} 颗`);
  assert.ok(s3.particles.every((p) => p.amount <= 1.5 + 1e-9), `堆叠上限 1.5g：${Math.max(...s3.particles.map((p) => p.amount))}`);
  const s4 = new Scene();
  s4.spawnParticles('BaCO3', 900, { x: 0, y: 0 }, true, true, null, 200);
  assert.equal(s4.particles.length, 600, `900g → 600 颗（正好 1.5g/颗）`);
  assert.ok(s4.particles.every((p) => Math.abs(p.amount - 1.5) < 1e-9), '每颗 1.5g');
  // 极端超大堆（>900g）仍合并保质量守恒（性能上限，与用户确认不再优化）
  const s5 = new Scene();
  s5.spawnParticles('BaCO3', 2000, { x: 0, y: 0 }, true, true, null, 200);
  const total = s5.particles.reduce((a, p) => a + p.amount, 0);
  assert.ok(Math.abs(total - 2000) < 1e-6, '总质量守恒');
});

test('网格总量缓存一致性：消耗/生长后 avail 精确', () => {
  const g = MaterialGrid.rect(100, 20, 'Fe'); // 20 宽 × 4 高 = 80 格 = 8g
  const a0 = g.avail('Fe');
  assert.ok(a0 > 7.9 && a0 < 8.05, `初始总量：${a0.toFixed(3)}`);
  g.consume('Fe', 2);
  assert.ok(Math.abs(g.avail('Fe') - (a0 - 2)) < 0.01, `消耗后：${g.avail('Fe').toFixed(3)}`);
  g.add('KCl', 1.2);
  const k = g.avail('KCl');
  assert.ok(Math.abs(k - 1.2) < 0.11, `生长后 KCl：${k.toFixed(3)}（半格累积器容差）`);
  // 总量 = 各物质之和
  const m = g.masses();
  assert.ok(Math.abs(Object.values(m).reduce((s, v) => s + v, 0) - g.totalMass()) < 1e-9);
});

test('minAABB 缓存：消耗后重新计算（尺寸/位置正确）', () => {
  const g = MaterialGrid.rect(100, 20, 'Fe'); // 80 格 = 8g
  const b0 = g.minAABB();
  assert.equal(b0.w, 100);
  g.consume('Fe', 2); // 消 20 格：边界消耗，尺寸应缩小或持平
  const b1 = g.minAABB();
  assert.ok(b1 !== null);
  assert.ok(b1.w <= b0.w && b1.h <= b0.h, `${b0.w}x${b0.h} → ${b1.w}x${b1.h}`);
});

test('spawnParticles 数量上限：大质量 → 合并颗粒', () => {
  const scene = new Scene();
  scene.spawnParticles('BaCO3', 2000, { x: 0, y: 0 }, true, true, null, 200);
  assert.ok(scene.particles.length <= 600, `粒子数 ${scene.particles.length} 应 ≤600`);
  const total = scene.particles.reduce((s, p) => s + p.amount, 0);
  assert.ok(Math.abs(total - 2000) < 1e-6, '总质量守恒');
});
