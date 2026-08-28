// ============================================================================
// 条件提示系统测试（点击展示语义）
// 覆盖：条件满足→tipReady（**不自动展示**）、showNextTip 点击展示并推进计数、
//       玩家位置范围、物品栏 有/没有、提示序号比较、且/或连接、
//       无提示/时机未到时 HUD 俏皮话（quipFor）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Hud } from '../src/render/hud.js';

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

// ---- 1. 不自动出现：只求值 tipReady，点击才展示 ----------------------------
test('提示：条件满足 = 可点（tipReady）；点击（showNextTip）才展示并推进计数', () => {
  const { scene } = setup([{ text: 'A' }, { text: 'B' }]);
  step(scene, 2);
  assert.ok(scene.tipReady, '无条件 → 立即可点');
  assert.equal(scene.tipSeq, 0, '不自动展示：计数仍为 0');
  assert.equal(scene.tip, '', '不自动展示：tip 文本未写入');
  assert.equal(scene.showNextTip(), 'A', '点击展示 A');
  assert.equal(scene.tipSeq, 1);
  assert.equal(scene.tip, 'A');
  assert.ok(scene.tipReady, 'A 已展示 → B 可点');
  assert.equal(scene.showNextTip(), 'B');
  assert.equal(scene.tipSeq, 2);
  step(scene, 3);
  assert.equal(scene.tipReady, null, '全部展示完 → 无可点');
  assert.equal(scene.showNextTip(), null, '点击返回 null（HUD 显示俏皮话）');
});

// ---- 2. 玩家位置范围（只影响可点性） --------------------------------------
test('提示：玩家在矩形内 → tipReady；移出 → 空；全程不自动展示', () => {
  const { scene, p } = setup([{ text: '进圈', when: { mode: 'and', items: [{ type: 'pos', x: 100, y: 500, w: 200, h: 200 }] } }]);
  step(scene, 1);
  assert.equal(scene.tipReady, null, '玩家 (500,645) 不在 100..300');
  assert.equal(scene.tipSeq, 0);
  p.x = 150; p.y = 560;
  step(scene, 1);
  assert.ok(scene.tipReady, '进入范围 → 可点（仍不自动展示）');
  assert.equal(scene.tipSeq, 0);
  assert.equal(scene.showNextTip(), '进圈');
  p.x = 900;
  step(scene, 1);
  assert.equal(scene.tipReady, null, '已展示完且条件又失效 → 无可点');
});

// ---- 3. 物品栏 有/没有 ---------------------------------------------------
test('提示：物品栏有 K → 可点；has:false 反向', () => {
  const { scene, p } = setup([{ text: '有K', when: { mode: 'and', items: [{ type: 'inv', item: 'K', has: true }] } }]);
  step(scene, 1);
  assert.equal(scene.tipReady, null, '没有 K → 不可点');
  p.inventory.add('K', 1);
  step(scene, 1);
  assert.ok(scene.tipReady, '有 K → 可点');

  const s2 = setup([{ text: '没K', when: { mode: 'and', items: [{ type: 'inv', item: 'K', has: false }] } }]);
  step(s2.scene, 1);
  assert.ok(s2.scene.tipReady, '没有 K → 可点');
  s2.p.inventory.add('K', 1);
  step(s2.scene, 2);
  assert.equal(s2.scene.tipReady, null, '有 K 后 has:false 不满足');
});

// ---- 4. 物品类型（烧杯） -------------------------------------------------
test('提示：物品栏有 beaker（物品类型）可点', () => {
  const { scene, p } = setup([{ text: '有烧杯', when: { mode: 'and', items: [{ type: 'inv', item: 'beaker', has: true }] } }]);
  step(scene, 1);
  assert.equal(scene.tipReady, null);
  p.inventory.slots[0] = { item: 'beaker', obj: { solution: { totalMass: () => 0 } } };
  step(scene, 1);
  assert.ok(scene.tipReady, '有烧杯 → 可点');
});

// ---- 5. 提示序号比较 -----------------------------------------------------
test('提示：seq 按"下一条序号（从1起）"比较；单独 seq>2 永不满足', () => {
  const { scene } = setup([
    { text: '1' }, { text: '2' },
    { text: '3', when: { mode: 'and', items: [{ type: 'seq', op: '>', n: 2 }] } },
  ]);
  step(scene, 1);
  assert.equal(scene.showNextTip(), '1');
  assert.equal(scene.tipReady && scene.tipReady.text, '2');
  assert.equal(scene.showNextTip(), '2');
  step(scene, 1);
  assert.equal(scene.tipReady && scene.tipReady.text, '3', '第 3 条（序号 3>2）可点');
  assert.equal(scene.showNextTip(), '3');

  const s2 = setup([{ text: 'x', when: { mode: 'and', items: [{ type: 'seq', op: '>', n: 2 }] } }]);
  step(s2.scene, 3);
  assert.equal(s2.scene.tipReady, null, '序号 1 不满足 >2');
  assert.equal(s2.scene.showNextTip(), null);

  // ==2：正好作为第二条展示
  const s3 = setup([
    { text: 'a' },
    { text: '第2条', when: { mode: 'and', items: [{ type: 'seq', op: '==', n: 2 }] } },
  ]);
  step(s3.scene, 1);
  assert.equal(s3.scene.showNextTip(), 'a');
  step(s3.scene, 1);
  assert.equal(s3.scene.tipReady && s3.scene.tipReady.text, '第2条');
  assert.equal(s3.scene.showNextTip(), '第2条');
});

// ---- 6. 且 / 或 ----------------------------------------------------------
test('提示：or=任一满足即可点、and=全部满足才可点', () => {
  const base = [
    { type: 'pos', x: 0, y: 0, w: 100, h: 100 },   // 玩家(500,645) 不满足
    { type: 'inv', item: 'K', has: true },          // 未持有 K 时不满足
  ];
  const orSc = setup([{ text: '任一', when: { mode: 'any', items: base } }]);
  orSc.p.inventory.add('K', 1);
  step(orSc.scene, 1);
  assert.ok(orSc.scene.tipReady, 'or：有 K（位置不对）→ 可点');

  const andSc = setup([{ text: '全部', when: { mode: 'and', items: base } }]);
  andSc.p.inventory.add('K', 1);
  step(andSc.scene, 1);
  assert.equal(andSc.scene.tipReady, null, 'and：位置不对 → 不可点');
  andSc.p.x = 50; andSc.p.y = 50;
  step(andSc.scene, 1);
  assert.ok(andSc.scene.tipReady, 'and：条件全满足 → 可点');
});

// ---- 7. 无玩家位置条件恒不满足 -------------------------------------------
test('提示：无玩家关卡位置条件不可点', () => {
  const scene = new Scene({ worldW: 1500, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  scene.status = 'running';
  scene.tips.push({
    text: 'p',
    when: { mode: 'and', items: [{ type: 'pos', x: 0, y: 0, w: 1500, h: 800 }] },
    shown: false,
  });
  step(scene, 3);
  assert.equal(scene.tipReady, null, '无玩家 → 位置条件 false');
});

// ---- 8. 展示事件 ---------------------------------------------------------
test('提示：showNextTip 触发 fire("tip")；tipReady 变化触发 fire("tipReady")', () => {
  const { scene } = setup([{ text: 'A' }]);
  let gotTip = null;
  let gotReady = null;
  scene.on('tip', (d) => { gotTip = d; });
  scene.on('tipReady', (d) => { gotReady = d; });
  step(scene, 1);
  assert.ok(gotReady && gotReady.tip.text === 'A', '可点状态事件');
  assert.equal(gotTip, null, '还没点，未触发展示事件');
  scene.showNextTip();
  assert.ok(gotTip && gotTip.seq === 1 && gotTip.tip.text === 'A', '展示事件（seq=1）');
});

// ---- 9. HUD 俏皮话 -------------------------------------------------------
test('无提示关卡 = 嘲讽俏皮话；时机未到 = 等待俏皮话；旧 setTip 照常展示', () => {
  // 完全没有提示（也无 setTip）
  const s1 = setup([]);
  const h1 = new Hud(s1.scene);
  const q1 = h1.quipFor(s1.scene);
  assert.ok(q1.includes('提示') || q1.includes('想'), `无提示俏皮话：${q1}`);
  // 有提示但时机未到 → 等待类俏皮话
  const s2 = setup([{ text: 'x', when: { mode: 'and', items: [{ type: 'pos', x: 0, y: 0, w: 10, h: 10 }] } }]);
  const h2 = new Hud(s2.scene);
  const q2 = h2.quipFor(s2.scene);
  assert.ok(!q2.includes('这么简单'), `时机未到类（不是嘲讽）：${q2}`);
  // 旧式 setTip（scene.tip 字符串，无 tips 数组）→ 直接展示
  const s3 = setup([]);
  s3.scene.tip = '旧式提示：先向左走';
  const h3 = new Hud(s3.scene);
  assert.equal(h3.quipFor(s3.scene), '旧式提示：先向左走');
});

// ---- 10. 点击流程（HUD onTipClick）----------------------------------------
test('onTipClick：有可点 → 展示并展开面板；无可点 → 先收起、再点给俏皮话', () => {
  const { scene } = setup([{ text: 'A' }]);
  step(scene, 1);
  const hud = new Hud(scene);
  hud.onTipClick(scene);
  assert.equal(hud.showTip, true);
  assert.equal(hud._tipText, 'A', '点击展示提示文本');
  assert.equal(scene.tipSeq, 1);
  step(scene, 1);
  // 已展示完，无可点：已开 → 收起
  hud.onTipClick(scene);
  assert.equal(hud.showTip, false, '无可点且已展开 → 收起');
  // 再点：未开 → 俏皮话
  hud.onTipClick(scene);
  assert.equal(hud.showTip, true);
  assert.ok(!hud._tipText.includes('A'), `俏皮话替换正文：${hud._tipText}`);
});
