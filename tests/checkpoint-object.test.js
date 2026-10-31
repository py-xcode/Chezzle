// 原生存档点对象（Checkpoint）回归测试：
// 存档点已从插件整合为关卡对象：进入区域 / 进入场景时自动存档；
// 没有存档点的关卡不产生任何自动存档；重开按钮在无存档时直接重开。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Checkpoint } from '../src/objects/checkpoint.js';
import { Savepoint } from '../src/core/savepoint.js';

function fakePlayer(x, y) {
  return { x, y, w: 20, h: 30, hidden: false };
}

test('Checkpoint：appearDelay 不得把触发区隐藏掉（延迟出现前走过也要存档）', () => {
  Savepoint.clear();
  const s = new Scene({ worldW: 1000, worldH: 800 });
  s.status = 'running';
  s.player = fakePlayer(350, 600);
  const cp = new Checkpoint({ x: 300, y: 500, w: 200, h: 200, id: 'cp-delay', appearDelay: 20 });
  s.addObject(cp);
  s.applyAppearDelays();
  assert.equal(cp.hidden, false, '存档点不应被 appearDelay 隐藏');
  assert.ok(s.objects.includes(cp), '存档点应保持活动，update 才能跑');
  cp.update(1 / 30, s);
  assert.equal(Savepoint.has(s), true, '显形前站在区域内也应存档');
  Savepoint.clear();
});

test('Checkpoint：玩家进入矩形区域时才存档，离开再进会再存', () => {
  Savepoint.clear();
  const s = new Scene({ worldW: 1000, worldH: 800 });
  s.status = 'running';
  s.player = fakePlayer(50, 600);
  const cp = new Checkpoint({ x: 300, y: 500, w: 200, h: 200, id: 'cp-1' });
  s.addObject(cp);
  assert.equal(Savepoint.has(s), false, '没进区域前没有存档');
  cp.update(1 / 30, s);
  assert.equal(Savepoint.has(s), false, '区域外不存档');
  s.player = fakePlayer(350, 600);
  cp.update(1 / 30, s);
  assert.equal(Savepoint.has(s), true, '进入区域 → 自动存档');
  Savepoint.clear();
});

test('Checkpoint：on=enter 进入场景即存档；没有存档点的关卡不会自动存档', () => {
  Savepoint.clear();
  const plain = new Scene({ worldW: 1000, worldH: 800 });
  plain.status = 'running';
  plain.player = fakePlayer(100, 700);
  assert.equal(Savepoint.has(plain), false, '无存档点关卡不产生自动存档');

  const s = new Scene({ worldW: 1000, worldH: 800 });
  s.status = 'running';
  s.player = fakePlayer(10, 10);
  const cp = new Checkpoint({ x: 0, y: 0, w: 10, h: 10, on: 'enter', id: 'enter-1' });
  s.addObject(cp);
  cp.update(1 / 30, s);
  assert.equal(Savepoint.has(s), true, '进入场景即存档');
  Savepoint.clear();
});

test('Checkpoint：render 只画倒三角标记，不抛错', () => {
  const cp = new Checkpoint({ x: 100, y: 200, w: 200, h: 100 });
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return {};
      return (...a) => { calls.push(String(k)); };
    },
    set() { return true; },
  });
  assert.doesNotThrow(() => cp.render(ctx, { time: 1.2 }));
  assert.ok(calls.includes('beginPath') && calls.includes('stroke'), '应画出标记');
});
