// 隐藏玩家物理冻结：appearDelay 玩家在出现前位置不动（半空摆着不坠地）
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { Scene } = await import('../src/core/scene.js');
const { Player } = await import('../src/objects/player.js');
const { Floor } = await import('../src/objects/floor.js');

function make() {
  const sc = new Scene({ worldW: 2000, worldH: 800 });
  sc.addObject(new Floor({ x: 0, y: 720, w: 2000, h: 80, id: 'f1' }));
  const p = new Player({ x: 100, y: 300, id: 'p1' });
  p.appearDelay = 0.9;
  sc.addObject(p);
  sc.status = 'running';
  return sc;
}

test('applyAppearDelays 后玩家完全出活动索引（objects/dynamics/player 引用）', () => {
  const sc = make();
  sc.applyAppearDelays();
  assert.ok(sc.hidden.includes(sc.byId.p1), '在 hidden 列表');
  assert.ok(!sc.objects.includes(sc.byId.p1), '不在 objects');
  assert.ok(!sc.dynamics.includes(sc.byId.p1), '不在 dynamics');
  assert.equal(sc.player, null, 'player 引用清空');
});

test('隐藏期间玩家位置冻结（半空不坠地）', () => {
  const sc = make();
  sc.applyAppearDelays();
  const y0 = sc.byId.p1.y;
  for (let i = 0; i < 20; i++) sc.step(1 / 30); // ~0.67s < 0.9s
  assert.equal(sc.byId.p1.y, y0, '未到时位置不动');
  for (let i = 0; i < 14; i++) sc.step(1 / 30); // ~1.13s > 0.9s：已出现
  assert.ok(!sc.byId.p1.hidden, '到时出现');
  assert.ok(sc.dynamics.includes(sc.byId.p1), '回到 dynamics');
  const y1 = sc.byId.p1.y;
  for (let i = 0; i < 15; i++) sc.step(1 / 30);
  assert.ok(sc.byId.p1.y > y1, '出现后开始下落');
});
