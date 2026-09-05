// 压力提取器：未绑定开关 → 玩家/物块站上即提取（与压力开关同逻辑）；绑定开关 → 开关激活才提取
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Player } from '../src/objects/player.js';
import { Extractor } from '../src/objects/extractor.js';
import { Switch } from '../src/objects/switch.js';

const TICK = 1 / 30;
function run(scene, n) { for (let i = 0; i < n; i++) scene.step(TICK); }

function setup(switchId = null) {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 700, w: 1500, h: 100 }));
  const pool = new Pool({ x: 600, y: 690, w: 200, h: 60, volume: 200, solutes: { NaCl: 50 }, id: 'pool' });
  scene.addObject(pool);
  const ex = new Extractor({ x: 300, y: 686, w: 60, h: 14, poolId: 'pool', switchId, id: 'ex' });
  scene.addObject(ex);
  scene.status = 'running';
  return scene;
}

test('压力提取器（无开关）：玩家站上 → 提取 NaCl；离开 → 停止', () => {
  const scene = setup(null); // 压力模式
  const p = new Player({ x: 320, y: 600, substance: 'NaCl', mass: 30, id: 'p' });
  scene.addObject(p);
  run(scene, 60); // 玩家落地站上提取器
  assert.ok(p.onGround, '玩家落地');
  assert.ok(p.bottom >= 686 - 12 && p.bottom <= 686 + 14 + 4, `玩家站在提取器上: bottom=${p.bottom.toFixed(1)}`);
  run(scene, 300); // 提取 10s
  const left = scene.byId['pool'].solution.solutes.get('NaCl') ?? 0;
  assert.ok(left < 49, `压力触发提取：NaCl 池中剩余 ${left.toFixed(2)}g（应被提取）`);
  // 粒子出现（可收集）
  assert.ok(scene.particles.length > 0, '提取出沉淀粒子');
});

test('压力提取器：无物站上 → 不提取', () => {
  const scene = setup(null);
  run(scene, 300);
  assert.equal(pool_solution(scene), 50, '无人站上不提取');
  function pool_solution(s) { return s.byId['pool'].solution.solutes.get('NaCl') ?? 0; }
});

test('绑定开关（传统模式）：开关未开不提取；开关开才提取', () => {
  const scene = setup('sw1');
  const p = new Player({ x: 320, y: 600, substance: 'NaCl', mass: 30, id: 'p' });
  scene.addObject(p);
  run(scene, 60); // 玩家站上提取器（但开关未开）
  run(scene, 300);
  assert.equal(scene.byId['pool'].solution.solutes.get('NaCl') ?? 0, 50, '开关未开：站上也不提取');
  // 加一个化学开关并放入开启物质 → 有效开启（_isOpenTarget 由 openingMass 决定）
  const sw = new Switch({ x: 200, y: 660, mode: 'chemical', opening: 'NaCl', id: 'sw1' });
  scene.addObject(sw);
  sw.addPrecipitate('NaCl', 1);
  run(scene, 300);
  const left = scene.byId['pool'].solution.solutes.get('NaCl') ?? 0;
  assert.ok(left < 49.5, `开关开后提取：剩余 ${left.toFixed(2)}g`);
});
