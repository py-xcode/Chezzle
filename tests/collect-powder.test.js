// 干式加热生成的**可溶固体粉末**也必须可被 Q 收集。
// 用户复现：NaHCO3 玩家跳上酒精灯 → 表面生成 Na2CO3 → 走动时以粉渣掉到地上，
// 但旧逻辑按 isSoluble(Na2CO3)=true 把散落粒子标成 collectible=false，Q 永远捡不起来。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Lamp } from '../src/objects/lamp.js';

const TICK = 1 / 30;
const run = (scene, n) => { for (let i = 0; i < n; i++) scene.step(TICK); };

test('NaHCO3 在灯上受热掉出的 Na2CO3 粉末可被 Q 收集', () => {
  const scene = new Scene({ worldW: 1200, worldH: 1100 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: 199, y: 928, w: 534, h: 118, id: 'floor1' }));
  const lamp = new Lamp({ x: 429, y: 891, autoOn: true, id: 'lamp1' });
  scene.addObject(lamp);
  const p = new Player({ x: 215, y: 832, substance: 'NaHCO3', mass: 30, id: 'player1' });
  scene.addObject(p);
  scene.player = p;
  run(scene, 20);
  // 跳上灯面：热分解在玩家表面生成 Na2CO3
  p.x = lamp.x + 20 - p.w / 2;
  p.y = lamp.y - p.h - 2;
  p.vel.x = 0;
  p.vel.y = 0;
  run(scene, 180);
  const powder = scene.particles.filter((q) => q.substance === 'Na2CO3');
  assert.ok(powder.length > 0, `应掉出 Na2CO3 粉末：${powder.length}`);
  assert.ok(powder.every((q) => q.collectible === true), '可溶固体粉末也必须 collectible=true');
  const total = powder.reduce((a, q) => a + q.amount, 0);
  assert.ok(total > 1, `粉末量应足够测试：${total.toFixed(2)}g`);
  // 走到一撮粉末旁边按 Q
  const target = powder[0];
  p.x = target.x - p.w / 2 + target.w / 2;
  p.y = target.y - p.h / 2;
  p.vel.x = 0;
  p.vel.y = 0;
  run(scene, 2);
  scene.pressed.add('collect');
  run(scene, 1);
  const got = p.inventory.slots.reduce((a, s) => a + (s && s.substance === 'Na2CO3' ? s.mass : 0), 0);
  assert.ok(got > 0, `Q 应收集到 Na2CO3：物品栏 ${JSON.stringify(p.inventory.slots)}`);
});
