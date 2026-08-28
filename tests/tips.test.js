// ============================================================================
// 条件提示系统测试
// 覆盖：无条件顺序触发（每条只触发一次）、玩家位置范围、物品栏 有/没有、
//       提示序号比较（==/</> 系）、且/或 连接、无玩家场景位置条件不满足。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';

function setup(tips) {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const p = new Player({ x: 500, y: 600, mass: 30, id: 'p1' });
  scene.addObject(p);
  scene.status = 'running';
  for (const t of tips) {
    scene.tips.push({ text: t.text, when: t.when ?? { mode: 'and', items: [] }, shown: false });
  }
  return { scene, p };
}

const step = (scene, n = 1) => { for (let i = 0; i < n; i++) scene.step(1 / 30); };

// ---- 1. 无条件：按顺序逐条触发、每条一次 --------------------------------
test('提示：无条件两条 → 第 1 tick 出第 1 条、第 2 tick 出第 2 条，不重复', () => {
  const { scene } = setup([{ text: 'A' }, { text: 'B' }]);
  step(scene, 1);
  assert.equal(scene.tipSeq, 1);
  assert.equal(scene.tip, 'A');
  step(scene, 1);
  assert.equal(scene.tipSeq, 2);
  assert.equal(scene.tip, 'B');
  step(scene, 5);
  assert.equal(scene.tipSeq, 2, '已触发的提示不再重复');
});

// ---- 2. 玩家位置范围 -----------------------------------------------------
test('提示：玩家中心在矩形内才触发；移出不触发', () => {
  const { scene, p } = setup([{ text: '进圈', when: { mode: 'and', items: [{ type: 'pos', x: 100, y: 500, w: 200, h: 200 }] } }]);
  step(scene, 1);
  assert.equal(scene.tipSeq, 0, '玩家 (500,645) 不在 100..300 内');
  p.x = 150; p.y = 560;
  step(scene, 1);
  assert.equal(scene.tipSeq, 1, '进入范围 → 触发');
  assert.equal(scene.tip, '进圈');
});

// ---- 3. 物品栏 有/没有 ---------------------------------------------------
test('提示：物品栏有 K 触发（has:true）；没有 K 触发（has:false）', () => {
  const { scene, p } = setup([{ text: '有K', when: { mode: 'and', items: [{ type: 'inv', item: 'K', has: true }] } }]);
  step(scene, 1);
  assert.equal(scene.tipSeq, 0, '没有 K → 不触发');
  p.inventory.add('K', 1);
  step(scene, 1);
  assert.equal(scene.tipSeq, 1, '有 K → 触发');

  const s2 = setup([{ text: '没K', when: { mode: 'and', items: [{ type: 'inv', item: 'K', has: false }] } }]);
  step(s2.scene, 1);
  assert.equal(s2.scene.tipSeq, 1, '没有 K → 触发');
  s2.p.inventory.add('K', 1);
  step(s2.scene, 3);
  assert.equal(s2.scene.tipSeq, 1, '有 K 后 has:false 不再满足');
});

// ---- 4. 物品类型（烧杯） -------------------------------------------------
test('提示：物品栏有 beaker（物品类型）可判定', () => {
  const { scene, p } = setup([{ text: '有烧杯', when: { mode: 'and', items: [{ type: 'inv', item: 'beaker', has: true }] } }]);
  step(scene, 1);
  assert.equal(scene.tipSeq, 0);
  // 烧杯入物品栏：用可携带物品路径（pickupItem 需要场景容器）——直接塞格子
  const beakerSlot = { item: 'beaker', obj: { solution: { totalMass: () => 0 } } };
  p.inventory.slots[0] = beakerSlot;
  step(scene, 1);
  assert.equal(scene.tipSeq, 1, '有烧杯 → 触发');
});

// ---- 5. 提示序号比较 -----------------------------------------------------
test('提示：seq 条件按"下一条序号（从1起）"比较 ≥/>', () => {
  // 前两条无条件 → 第三条只在前两条之后（序号 3 > 2）触发
  const { scene } = setup([
    { text: '1' }, { text: '2' },
    { text: '3', when: { mode: 'and', items: [{ type: 'seq', op: '>', n: 2 }] } },
  ]);
  step(scene, 1);
  assert.equal(scene.tipSeq, 1);
  step(scene, 1);
  assert.equal(scene.tipSeq, 2);
  step(scene, 1);
  assert.equal(scene.tipSeq, 3, '第 3 条（序号 3>2）出现');
  assert.equal(scene.tipActive.text, '3');

  // 单独一条 seq「> 2」：永远不触发（序号只有 1）
  const s2 = setup([{ text: 'x', when: { mode: 'and', items: [{ type: 'seq', op: '>', n: 2 }] } }]);
  step(s2.scene, 5);
  assert.equal(s2.scene.tipSeq, 0, '序号 1 不满足 >2');

  // 恰好第 2 条（== 2）：前面有一条无条件 → 第 2 tick 触发
  const s3 = setup([
    { text: 'a' },
    { text: '第2条', when: { mode: 'and', items: [{ type: 'seq', op: '==', n: 2 }] } },
  ]);
  step(s3.scene, 2);
  assert.equal(s3.scene.tipSeq, 2);
  assert.equal(s3.scene.tipActive.text, '第2条');
});

// ---- 6. 且 / 或 ----------------------------------------------------------
test('提示：多个条件 or=任一满足、and=全部满足', () => {
  const base = [
    { type: 'pos', x: 0, y: 0, w: 100, h: 100 },   // 玩家(500,645) 不满足
    { type: 'inv', item: 'K', has: true },          // 未持有 K 时不满足
  ];
  const orSc = setup([{ text: '任一', when: { mode: 'any', items: base } }]);
  orSc.p.inventory.add('K', 1);
  step(orSc.scene, 1);
  assert.equal(orSc.scene.tipSeq, 1, 'or：有 K（位置不对）→ 触发');

  const andSc = setup([{ text: '全部', when: { mode: 'and', items: base } }]);
  andSc.p.inventory.add('K', 1);
  step(andSc.scene, 1);
  assert.equal(andSc.scene.tipSeq, 0, 'and：位置不对 → 不触发');
  andSc.p.x = 50; andSc.p.y = 50;
  step(andSc.scene, 1);
  assert.equal(andSc.scene.tipSeq, 1, 'and：位置 + 物品都满足 → 触发');
});

// ---- 7. 无玩家场景：位置条件恒不满足 -------------------------------------
test('提示：无玩家关卡位置条件不满足（不会误触发）', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  scene.tips.push({
    text: 'p',
    when: { mode: 'and', items: [{ type: 'pos', x: 0, y: 0, w: 1500, h: 800 }] },
    shown: false,
  });
  step(scene, 3);
  assert.equal(scene.tipSeq, 0, '无玩家 → 位置条件 false');
});

// ---- 8. 提示触发事件 -----------------------------------------------------
test('提示：触发时 fire("tip")，seq 为当前序号', () => {
  const { scene } = setup([{ text: 'A' }]);
  let got = null;
  scene.on('tip', (d) => { got = d; });
  step(scene, 1);
  assert.ok(got, '触发事件');
  assert.equal(got.seq, 1);
  assert.equal(got.tip.text, 'A');
});
