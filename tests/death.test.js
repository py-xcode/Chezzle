// ============================================================================
// 死亡原因测试：虚空坠落 / 反应致死（强酸/强碱/其它伙伴）+ 死亡文案分类
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, reactionPartnerOf } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { deathQuip } from '../src/render/hud.js';

const RUN = 1 / 30;

// ---- 1. 掉入虚空 ----------------------------------------------------------
test('死亡原因：掉出世界下方 → void', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  const p = new Player({ x: 500, y: 760, mass: 30, id: 'p1' });
  scene.addObject(p);
  scene.status = 'running';
  // 直接推下虚空（无地板）
  scene.step(RUN);
  for (let i = 0; i < 80 && p.hp > 0; i++) scene.step(RUN);
  assert.equal(scene.status, 'died');
  assert.deepEqual(scene.deathCause, { kind: 'void' });
});

// ---- 2. 反应致死记录（伙伴 + 酸/碱分类）-----------------------------------
test('死亡原因：玩家反应记录伙伴物质（酸/碱分类）', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const p = new Player({ x: 500, y: 600, mass: 30, substance: 'Fe', id: 'p1' });
  scene.addObject(p);
  scene.status = 'running';
  // 模拟玩家反应发生：引擎会以 'Fe + 2HCl → FeCl2 + H2' 之类格式调用 onReaction
  scene.onReaction('2Fe + 3Cl2 → 2FeCl3');
  assert.equal(p.lastRxPartner, 'Cl2');
  assert.equal(p.lastRxAcid, false);
  assert.equal(p.lastRxBase, false);
  scene.onReaction('Fe + 2HCl → FeCl2 + H2↑');
  assert.equal(p.lastRxPartner, 'HCl');
  assert.equal(p.lastRxAcid, true, '盐酸 = 酸');
  assert.equal(p.lastRxBase, false);
  // 死亡判定用最近记录
  for (let i = 0; i < 20 && p.hp > 0; i++) p.grid.consume('Fe', p.grid.avail('Fe') + 1); // 耗光
  scene.step(RUN);
  assert.equal(scene.status, 'died');
  assert.deepEqual(scene.deathCause, { kind: 'acid', partner: 'HCl' });
});

// ---- 3. 强碱分类 ----------------------------------------------------------
test('死亡原因：强碱伙伴 → kind=base', () => {
  const scene = new Scene({ worldW: 1000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 100 }));
  const p = new Player({ x: 500, y: 600, mass: 30, substance: 'Al', id: 'p1' });
  scene.addObject(p);
  scene.status = 'running';
  scene.onReaction('2Al + 2NaOH + 2H2O → 2NaAlO2 + 3H2↑');
  assert.equal(p.lastRxPartner, 'NaOH');
  assert.equal(p.lastRxBase, true, 'NaOH = 碱');
});

// ---- 4. 反应伙伴解析（纯函数）---------------------------------------------
test('reactionPartnerOf：解析系数/排除玩家自身物质', () => {
  assert.equal(reactionPartnerOf('Fe + 2HCl → FeCl2 + H2', 'Fe'), 'HCl');
  assert.equal(reactionPartnerOf('2Al + Fe2O3 → Al2O3 + 2Fe', 'Fe2O3'), 'Al');
  assert.equal(reactionPartnerOf('Cu + CuSO4 → 无', 'Cu'), 'CuSO4');
  assert.equal(reactionPartnerOf('Fe + Fe → Fe', 'Fe'), null, '均为自身 → null');
  assert.equal(reactionPartnerOf('', 'Fe'), null);
  assert.equal(reactionPartnerOf('Fe → 虚空', 'Fe'), null);
});

// ---- 5. 死亡文案分类 ------------------------------------------------------
test('deathQuip：虚空/强酸/强碱/反应/无伙伴 五类（随机但仍符合分类）', () => {
  // 虚空
  const v = deathQuip({ kind: 'void' }, 'NaOH');
  assert.ok(v.includes('NaOH'), `含玩家物质：${v}`);
  // 强酸
  const a = deathQuip({ kind: 'acid', partner: 'HCl' }, 'Fe2O3');
  assert.ok(a.includes('Fe2O3') && a.includes('HCl') && a.includes('强酸'), `${a}`);
  // 强碱
  const b = deathQuip({ kind: 'base', partner: 'NaOH' }, 'Al');
  assert.ok(b.includes('Al') && (b.includes('NaOH') || b.includes('强碱')), `${b}`);
  // 其它伙伴
  const r = deathQuip({ kind: 'reaction', partner: 'Cl2' }, 'Fe');
  assert.ok(r.includes('Fe') && r.includes('Cl2'), `${r}`);
  // 无伙伴（溶解/耗尽）
  const n = deathQuip({ kind: 'reaction', partner: null }, 'NaOH');
  assert.ok(n.includes('NaOH'), `${n}`);
  assert.ok(!n.includes('不共戴天'), '无伙伴不用"与b"句式');
});
