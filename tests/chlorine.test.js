// ============================================================================
// 氯气默认不溶入水（用户规则）回归测试：
//  - 大气 Cl2 不主动进任何水（纯水池/玩家入水都不触发"氯水"——旧实现里
//    Cl2+H2O→HCl+HClO 是"成对反应"，玩家跳进纯水池就变成氯气泵，实测复现）；
//  - 例外：集气瓶主动通入（forceDissolve / scene.bubbleGas）才溶成氯水。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Pool } from '../src/objects/pool.js';

const TICK = 1 / 30;
function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

test('氯气默认不溶：玩家跳进纯水池 + 大气氯气 → 无氯水反应（氯气保持大气可见）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: {} });
  scene.addObject(pool);
  const p = new Player({ x: 400, y: 640, substance: 'Fe2O3', mass: 30, id: 'p' });
  scene.addObject(p);
  scene.atmosphere.add('Cl2', 1);
  // 收集反应文本：不应出现氯水歧化/归中
  const logs = [];
  const orig = scene.onReaction.bind(scene);
  scene.onReaction = (t) => { logs.push(t); orig(t); };
  run(scene, 200);
  assert.ok(!logs.some((t) => /HCl.*HClO|Cl2.*H2O/.test(t)), `不应出现氯水反应，日志：${[...new Set(logs)].join(' | ') || '无'}`);
  assert.equal(pool.solution.mass('Cl2'), 0, '池水不得出现氯水溶质');
  assert.ok(pool.solution.solutes.size === 0, `池水应保持纯净：${[...pool.solution.solutes.entries()].map(([id, m]) => `${id}:${m}`).join(' ')}`);
  assert.ok(scene.atmosphere.mass('Cl2') > 0.9, `大气氯气应保持可见（未被水吞掉）：${scene.atmosphere.mass('Cl2').toFixed(3)}`);
});

test('例外：集气瓶主动通入（bubbleGas 强制溶解）才产生氯水', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const pool = new Pool({ x: 300, y: 660, w: 260, h: 60, volume: 200, solutes: {} });
  scene.addObject(pool);
  const before = pool.solution.water;
  scene.bubbleGas(pool, 'Cl2', 0.2, TICK);
  assert.ok(pool.solution.mass('Cl2') > 0.1, `集气瓶通气应产生氯水：${pool.solution.mass('Cl2').toFixed(3)}`);
  assert.ok(pool.solution.water < before, '溶解消耗水');
});
