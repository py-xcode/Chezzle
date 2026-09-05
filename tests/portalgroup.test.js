// 传送门 group（组号）配对：同组互通；颜色不同也配对；旧数据（无组号）按颜色兜底
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Portal } from '../src/objects/portal.js';

const TICK = 1 / 30;
function run(scene, n) { for (let i = 0; i < n; i++) scene.step(TICK); }

test('组号配对：同组（不同颜色）传送；异组（同颜色）不传', () => {
  const scene = new Scene({ worldW: 2000, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 760, w: 2000, h: 40 }));
  scene.status = 'running';
  const g1 = new Portal({ x: 400, y: 600, w: 44, h: 64, color: '#ff0000', group: 'A', id: 'g1' });
  const g2 = new Portal({ x: 1500, y: 600, w: 44, h: 64, color: '#00ff00', group: 'A', id: 'g2' }); // 不同色同组
  const g3 = new Portal({ x: 200, y: 600, w: 44, h: 64, color: '#ff0000', group: 'B', id: 'g3' }); // 同色异组
  scene.addObject(g1); scene.addObject(g2); scene.addObject(g3);
  const pa = new Player({ x: 410, y: 620, id: 'p' });
  scene.addObject(pa);
  run(scene, 2);
  assert.ok(pa.x > 1000, `同组应配对传送（x=${pa.x.toFixed(0)}，应到 1500 附近）`);
  assert.ok(Math.abs(pa.x - 1500) < 60, `落在 g2（1500）而不是 g3（200）：x=${pa.x.toFixed(0)}`);
});

test('组号配对：组内非玩家物体不跨组干扰（落点仍避 g3）', () => {
  const scene = new Scene({ worldW: 2000, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 760, w: 2000, h: 40 }));
  scene.status = 'running';
  const g1 = new Portal({ x: 400, y: 600, w: 44, h: 64, color: '#ff0000', group: 'A', id: 'g1' });
  const g2 = new Portal({ x: 1500, y: 600, w: 44, h: 64, color: '#00ff00', group: 'A', id: 'g2' });
  const g3 = new Portal({ x: 1450, y: 600, w: 44, h: 64, color: '#ff0000', group: 'B', id: 'g3' }); // 挡在 g2 旁
  scene.addObject(g1); scene.addObject(g2); scene.addObject(g3);
  const pa = new Player({ x: 410, y: 620, id: 'p' });
  scene.addObject(pa);
  run(scene, 2);
  assert.ok(pa.x > 1000, `传送发生（x=${pa.x.toFixed(0)}）`);
  // 落点避开异组门（不落到 g3 里）
  assert.ok(!(pa.x >= 1450 - 5 && pa.x + pa.w <= 1494 + 5), `不落在异组门 g3 内: x=${pa.x.toFixed(0)}`);
});

test('无组号旧数据：按颜色兜底配对（不同色无组号不传）', () => {
  const scene = new Scene({ worldW: 2000, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 760, w: 2000, h: 40 }));
  scene.status = 'running';
  const g1 = new Portal({ x: 400, y: 600, w: 44, h: 64, color: '#c78bff', id: 'g1' });
  const g2 = new Portal({ x: 1500, y: 600, w: 44, h: 64, color: '#c78bff', id: 'g2' });
  const g3 = new Portal({ x: 200, y: 600, w: 44, h: 64, color: '#ff0000', id: 'g3' });
  scene.addObject(g1); scene.addObject(g2); scene.addObject(g3);
  const pa = new Player({ x: 410, y: 620, id: 'p' });
  scene.addObject(pa);
  run(scene, 2);
  assert.ok(pa.x > 1000, `同色旧数据应配对传送（x=${pa.x.toFixed(0)}）`);
  assert.ok(Math.abs(pa.x - 1500) < 60, `落在同色 g2 而非异色 g3：x=${pa.x.toFixed(0)}`);
});

test('组号与颜色无关：红色组A + 红色组B 不互相配对（组号优先于颜色）', () => {
  const scene = new Scene({ worldW: 2000, worldH: 800 });
  scene.addObject(new Floor({ x: 0, y: 760, w: 2000, h: 40 }));
  scene.status = 'running';
  const g1 = new Portal({ x: 400, y: 600, w: 44, h: 64, color: '#ff0000', group: 'A', id: 'g1' });
  const g2 = new Portal({ x: 1500, y: 600, w: 44, h: 64, color: '#ff0000', group: 'B', id: 'g2' });
  scene.addObject(g1); scene.addObject(g2);
  const pa = new Player({ x: 410, y: 620, id: 'p' });
  scene.addObject(pa);
  run(scene, 2);
  assert.ok(pa.x < 600, `同色异组不配对（x=${pa.x.toFixed(0)}，仍在原处）`);
});
