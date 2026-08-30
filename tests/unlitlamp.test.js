// ============================================================================
// 复现：未点燃的酒精灯上放氢氧化铜 → 不应分解成氧化铜。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Lamp } from '../src/objects/lamp.js';
import { BlastLamp } from '../src/objects/blastlamp.js';

const TICK = 1 / 30;
function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

test('未点燃酒精灯：氢氧化铜不分解', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const lamp = new Lamp({ x: 400, y: 680, id: 'l1' }); // 未点燃
  scene.addObject(lamp);
  lamp.addPrecipitate('Cu(OH)2', 2);
  run(scene, 300);
  const cuo = lamp.precipitates.get('CuO') ?? 0;
  const left = lamp.precipitates.get('Cu(OH)2') ?? 0;
  console.log(`未点燃灯: Cu(OH)2 remaining=${left.toFixed(3)} CuO=${cuo.toFixed(3)}`);
  assert.ok(cuo < 0.01, `未点燃灯上不应生成 CuO: ${cuo.toFixed(3)}`);
  assert.ok(left > 1.9, `Cu(OH)2 应基本保留: ${left.toFixed(3)}`);
});

test('未点燃灯 + 另一盏点燃灯在场：氢氧化铜不分解（条件应只来自本灯）', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const unlit = new Lamp({ x: 400, y: 680, id: 'u1' }); // 未点燃
  scene.addObject(unlit);
  scene.addObject(new Lamp({ x: 1200, y: 680, autoOn: true, id: 'on1' })); // 远处点着的
  unlit.addPrecipitate('Cu(OH)2', 2);
  run(scene, 300);
  const cuo = unlit.precipitates.get('CuO') ?? 0;
  const left = unlit.precipitates.get('Cu(OH)2') ?? 0;
  console.log(`未点燃+他灯在场: Cu(OH)2 remaining=${left.toFixed(3)} CuO=${cuo.toFixed(3)}`);
  assert.ok(cuo < 0.01, `他灯不应让未点燃灯上的 Cu(OH)2 分解: ${cuo.toFixed(3)}`);
  assert.ok(left > 1.9, `Cu(OH)2 应基本保留: ${left.toFixed(3)}`);
});

test('点燃酒精灯：氢氧化铜分解', () => {
  const scene = new Scene();
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  scene.status = 'running';
  const lamp = new Lamp({ x: 400, y: 680, autoOn: true, id: 'l1' });
  scene.addObject(lamp);
  lamp.addPrecipitate('Cu(OH)2', 2);
  run(scene, 300);
  const cuo = lamp.precipitates.get('CuO') ?? 0;
  console.log(`点燃灯: CuO=${cuo.toFixed(3)}`);
  assert.ok(cuo > 1, `点燃灯上应生成 CuO: ${cuo.toFixed(3)}`);
});
