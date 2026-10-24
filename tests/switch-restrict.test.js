// ============================================================================
// 开关投放限制：有"激活物质"的开关只接受该物质；错误物质不投入（留在物品栏）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Switch } from '../src/objects/switch.js';

const TICK = 1 / 30;

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

function setup(opening = 'Cu(OH)2') {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1400, h: 100 }));
  const sw = new Switch({ x: 400, y: 678, w: 40, h: 22, opening, id: 'sw1' });
  scene.addObject(sw);
  const p = new Player({ x: 340, y: 560, mass: 30, id: 'p1', substance: 'NaCl' });
  scene.addObject(p);
  scene.status = 'running';
  run(scene, 60); // 落地
  assert.ok(p.onGround, '玩家落地');
  assert.equal(scene.snapNearFeet(p), sw, '开关吸附命中');
  return { scene, sw, p };
}

test('化学开关：只接受开启所需物质，错误物质不投入且留在物品栏', () => {
  const { scene, sw, p } = setup('Cu(OH)2');
  p.inventory.add('Na2SO4', 10);
  const before = p.inventory.selectedSlot().mass;
  p.tryPlace(scene);
  run(scene, 20);
  assert.equal(sw.precipitates.get('Na2SO4') ?? 0, 0, 'Na2SO4 不得进入 Cu(OH)2 开关');
  assert.equal(sw.openingMass(), 0, '开关不应被错误物质激活');
  assert.equal(scene.particles.length, 0, '不应把错误物质丢到地面（放置不生效）');
  assert.equal(p.inventory.selectedSlot().substance, 'Na2SO4', '物品应留在物品栏');
  assert.equal(p.inventory.selectedSlot().mass, before, '物品质量不变');
});

test('化学开关：正确开启物质正常投入并打开', () => {
  const { scene, sw, p } = setup('Cu(OH)2');
  p.inventory.add('Cu(OH)2', 10);
  p.tryPlace(scene);
  run(scene, 30);
  assert.ok((sw.precipitates.get('Cu(OH)2') ?? 0) > 0.4, `Cu(OH)2 应进入开关：${sw.precipitates.get('Cu(OH)2')}`);
  assert.ok(sw.open, '开关应打开');
  assert.equal(scene.particles.length, 0, '不应有地面颗粒');
});

test('无 opening 的压力开关保持原有吸附行为（不受投放限制影响）', () => {
  const { scene, sw, p } = setup(null);
  p.inventory.add('Na2SO4', 10);
  p.tryPlace(scene);
  run(scene, 20);
  assert.ok((sw.precipitates.get('Na2SO4') ?? 0) > 0.4, '压力开关仍可接收物质');
  assert.equal(scene.particles.length, 0, '仍是吸附进开关而非地面');
});
