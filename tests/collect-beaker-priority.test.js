// Q 优先级：最近的物品是"内有沉淀的烧杯"时，先收杯里的沉淀，不能直接把杯子捡走。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Beaker } from '../src/objects/beaker.js';

const TICK = 1 / 30;
const run = (scene, n) => { for (let i = 0; i < n; i++) scene.step(TICK); };

test('Q：最近物品是内有沉淀的烧杯 → 先收沉淀，杯子留在场景', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const p = new Player({ x: 320, y: 630 });
  scene.addObject(p);
  scene.player = p;
  const bk = new Beaker({ x: 430, y: 620, w: 60, h: 70, volume: 200, water: 100, id: 'bkPrecip' });
  scene.addObject(bk);
  bk.addPrecipitate('Cu(OH)2', 2);
  run(scene, 5);
  const before = bk.precipitates.get('Cu(OH)2') ?? 0;
  assert.ok(before > 0, '杯子应有沉淀');
  scene.pressed.add('collect');
  run(scene, 1);
  const got = p.inventory.slots.reduce((a, s) => a + (s && s.substance === 'Cu(OH)2' ? s.mass : 0), 0);
  assert.ok(got > 0, `Q 应先收杯内沉淀：${JSON.stringify(p.inventory.slots)}`);
  assert.ok(scene.objects.includes(bk), '杯子不应被捡走（应留在场景）');
  assert.ok((bk.precipitates.get('Cu(OH)2') ?? 0) < before, '杯子里的沉淀应减少');
});
