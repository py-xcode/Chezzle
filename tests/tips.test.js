// ============================================================================
// 条件提示系统测试（点击展示语义 · 靠后优先 · 可重复触发）
// 覆盖：tipReady=满足条件**最后一条**（不自动展示）、showNextTip 点击展示并可
//       重复触发（tipSeq 递增）、玩家位置/物品栏/序号条件、且/或、
//       俏皮话（无提示/时机未到）、面板 ✕ 关闭/动画状态。
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
    scene.tips.push({ text: t.text, when: t.when ?? { mode: 'and', items: [] } });
  }
  return { scene, p };
}

const step = (scene, n = 1) => { for (let i = 0; i < n; i++) scene.step(1 / 30); };

// ---- 1. 靠后优先 + 可重复 ------------------------------------------------
test('提示：tipReady=满足条件的最后一条；点击展示并可重复（tipSeq 递增）', () => {
  const { scene } = setup([{ text: 'A' }, { text: 'B' }]);
  step(scene, 2);
  assert.equal(scene.tipReady && scene.tipReady.text, 'B', '两条无条件 → 靠后的 B 优先');
  assert.equal(scene.tipSeq, 0, '不自动展示：计数仍为 0');
  assert.equal(scene.tip, '', '不自动展示：tip 文本未写入');
  assert.equal(scene.showNextTip(), 'B', '点击展示 B');
  assert.equal(scene.tipSeq, 1);
  assert.equal(scene.tip, 'B');
  assert.equal(scene.showNextTip(), 'B', '同一提示可重复触发');
  assert.equal(scene.tipSeq, 2);
  assert.ok(scene.tipReady, '条件仍满足 → 始终可点');
});

// ---- 2. 靠后优先 + 前条不可见：后来的满足后前条不显示 ----------------------
test('提示：满足条件的最后一条赢——条件不满足的前条让位', () => {
  const { scene } = setup([
    { text: '早段提示', when: { mode: 'and', items: [{ type: 'pos', x: 0, y: 0, w: 100, h: 100 }] } },
    { text: '晚段提示', when: { mode: 'and', items: [{ type: 'pos', x: 400, y: 500, w: 300, h: 300 }] } }, // 玩家(500,645) 在内
  ]);
  step(scene, 1);
  assert.equal(scene.tipReady && scene.tipReady.text, '晚段提示', '靠后的被满足，靠前的不出现');
  assert.equal(scene.showNextTip(), '晚段提示');
});

// ---- 3. 玩家位置范围 -----------------------------------------------------
test('提示：玩家在矩形内 → 可点；移出 → 空；全程不自动展示', () => {
  const { scene, p } = setup([{ text: '进圈', when: { mode: 'and', items: [{ type: 'pos', x: 100, y: 500, w: 200, h: 200 }] } }]);
  step(scene, 1);
  assert.equal(scene.tipReady, null, '玩家 (500,645) 不在 100..300');
  p.x = 150; p.y = 560;
  step(scene, 1);
  assert.ok(scene.tipReady, '进入范围 → 可点（仍不自动展示）');
  assert.equal(scene.tipSeq, 0);
  assert.equal(scene.showNextTip(), '进圈');
  p.x = 900;
  step(scene, 1);
  assert.equal(scene.tipReady, null, '条件失效 → 无可点');
});

// ---- 4. 物品栏 有/没有 ---------------------------------------------------
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

// ---- 5. 提示序号比较 -----------------------------------------------------
test('提示：seq 按"tipSeq+1（从1起）"比较；靠后优先在序号门开后胜出', () => {
  const { scene } = setup([
    { text: '首批', when: { mode: 'and', items: [] } },
    { text: '第二批', when: { mode: 'and', items: [{ type: 'seq', op: '>', n: 3 }] } },
  ]);
  // 序号门未开（tipSeq+1 ≤ 3）：只有首批（且靠后的一条还不满足）→ 首批可点，重复展示
  step(scene, 1);
  assert.equal(scene.tipReady && scene.tipReady.text, '首批');
  assert.equal(scene.showNextTip(), '首批');
  assert.equal(scene.showNextTip(), '首批');
  assert.equal(scene.showNextTip(), '首批', '先展示 3 次（tipSeq=3）');
  step(scene, 1);
  assert.equal(scene.tipReady && scene.tipReady.text, '第二批', '序号门开（4>3）→ 靠后的第二批接管');
  assert.equal(scene.showNextTip(), '第二批');

  const s2 = setup([{ text: 'x', when: { mode: 'and', items: [{ type: 'seq', op: '>', n: 2 }] } }]);
  step(s2.scene, 3);
  assert.equal(s2.scene.tipReady, null, '序号 1 不满足 >2');
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
  const s1 = setup([]);
  const h1 = new Hud(s1.scene);
  const q1 = h1.quipFor(s1.scene);
  assert.ok(q1.includes('提示') || q1.includes('想'), `无提示俏皮话：${q1}`);
  const s2 = setup([{ text: 'x', when: { mode: 'and', items: [{ type: 'pos', x: 0, y: 0, w: 10, h: 10 }] } }]);
  const h2 = new Hud(s2.scene);
  const q2 = h2.quipFor(s2.scene);
  assert.ok(!q2.includes('这么简单'), `时机未到类（不是嘲讽）：${q2}`);
  const s3 = setup([]);
  s3.scene.tip = '旧式提示：先向左走';
  const h3 = new Hud(s3.scene);
  assert.equal(h3.quipFor(s3.scene), '旧式提示：先向左走');
});

// ---- 10. 点击流程 + 关闭（✕/closeTip）-------------------------------------
test('onTipClick：可点 → 展示并展开；完成 → 再点收起 → 再点俏皮话；closeTip 复位', () => {
  const { scene } = setup([{ text: 'A' }]);
  step(scene, 1);
  const hud = new Hud(scene);
  hud.onTipClick(scene);
  assert.equal(hud.showTip, true);
  assert.equal(hud._tipText, 'A', '点击展示提示文本');
  assert.equal(scene.tipSeq, 1);
  // ✕ 关闭
  hud.closeTip();
  assert.equal(hud.showTip, false, '关闭');
  assert.equal(hud._tipA ?? 1, 1, '动画状态仍为展开时残值（淡出由 _tipA 渐降到 0）');
  // 无任何提示的关卡：开 → 俏皮话 → 再点收起
  const s2 = setup([]);
  const h2 = new Hud(s2.scene);
  h2.onTipClick(s2.scene);
  assert.equal(h2.showTip, true);
  assert.ok(h2._tipText && h2._tipText.length > 0, `俏皮话：${h2._tipText}`);
  h2.onTipClick(s2.scene);
  assert.equal(h2.showTip, false, '无可点且已展开 → 收起');
});

// ---- 11. 面板开合动画状态 -------------------------------------------------
test('面板动画：_tipA 平滑趋近 0/1（关闭后淡出）', () => {
  const { scene } = setup([{ text: 'A' }]);
  step(scene, 1);
  const hud = new Hud(scene);
  hud.showTip = true;
  for (let i = 0; i < 40; i++) hud.tipButton(fakeCtx(), 800, 10, 0, i * 0.033);
  assert.ok(hud._tipA > 0.95, `展开完成：${hud._tipA}`);
  hud.closeTip();
  for (let i = 0; i < 60; i++) hud.tipButton(fakeCtx(), 800, 10, 0, i * 0.033);
  assert.ok(hud._tipA < 0.05, `关闭完成：${hud._tipA}`);
});

function fakeCtx() {
  const noop = () => {};
  return {
    canvas: { width: 800, height: 600 },
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
    arc: noop, arcTo: noop, fill: noop, stroke: noop, fillRect: noop, quadraticCurveTo: noop,
    setLineDash: noop, translate: noop, rotate: noop, scale: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: (t) => ({ width: t.length * 8 }),
    fillText: noop, strokeText: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    font: '', textAlign: '', textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
  };
}
