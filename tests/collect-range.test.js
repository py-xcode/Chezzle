// Q 收集沉淀的判定范围：应按玩家身体边缘距离（不是身体中心）
// 回归场景：玩家站在 60px 高的物块上，沉淀在正下方地面——身体中心离沉淀 >70px，
// 但脚底离沉淀只有 ~50px；旧逻辑用中心距离会收不到（用户反馈"站在上面 Q 不了"）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Block } from '../src/objects/block.js';
import { CFG } from '../src/core/config.js';

const T = 1 / 30;

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(T);
}

test('Q 收集：站在物块上，能收到正下方地面的沉淀（按身体边缘距离）', () => {
  const scene = new Scene({ worldW: 900, worldH: 700 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: 0, y: 700, w: 900, h: 40 }));
  const block = new Block({ x: 300, y: 640, w: 120, h: 60, substance: 'Fe', mass: 0 }); // 像素模式：60px 高台阶
  scene.addObject(block);
  const p = new Player({ x: 320, y: 520, substance: 'NaOH', mass: 30 });
  scene.addObject(p);
  scene.player = p;
  run(scene, 30); // 落到物块顶面（物块顶 y=640 → 玩家 bottom≈640）
  assert.ok(Math.abs(p.bottom - block.top) < 2, `玩家应站在物块上：${p.bottom} vs ${block.top}`);
  // 沉淀在物块左侧地面（玩家站在物块上，沉淀不在物块实体里）
  scene.spawnParticles('Cu', 1, { x: 280, y: 690 }, true, true, { kind: 'level' }, 0);
  run(scene, 2);
  const particle = scene.particles.find((q) => q.substance === 'Cu');
  assert.ok(particle, '应有沉淀粒子');
  // 证明这是"中心距离超出、边缘距离在内"的场景
  const centerDist = Math.hypot(particle.x + particle.w / 2 - p.center.x, particle.y + particle.h / 2 - p.center.y);
  const nx = Math.max(p.x - (particle.x + particle.w), particle.x - (p.x + p.w), 0);
  const ny = Math.max(p.y - (particle.y + particle.h), particle.y - (p.y + p.h), 0);
  const edgeDist = Math.hypot(nx, ny);
  assert.ok(centerDist > CFG.collectRadius, `中心距离应超出半径：${centerDist.toFixed(1)} > ${CFG.collectRadius}`);
  assert.ok(edgeDist <= CFG.collectRadius, `边缘距离应在半径内：${edgeDist.toFixed(1)} <= ${CFG.collectRadius}`);
  scene.pressed.add('collect');
  run(scene, 1);
  assert.ok(p.inventory.slots.some((s) => s && s.substance === 'Cu'), 'Q 应收集到下方沉淀');
  assert.equal(scene.particles.some((q) => q.substance === 'Cu'), false, '粒子应被移除');
});

test('Q 收集：平地上远处的沉淀仍收不到（范围没有被放大）', () => {
  const scene = new Scene({ worldW: 900, worldH: 700 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: 0, y: 700, w: 900, h: 40 }));
  const p = new Player({ x: 100, y: 560, substance: 'NaOH', mass: 30 });
  scene.addObject(p);
  scene.player = p;
  run(scene, 20);
  scene.spawnParticles('Cu', 1, { x: 320, y: 690 }, true, true, { kind: 'level' }, 0);
  run(scene, 2);
  scene.pressed.add('collect');
  run(scene, 1);
  assert.equal(p.inventory.slots.some((s) => s && s.substance === 'Cu'), false, '超出 70px 不应收集');
});
