// 传送门物品栏重置 / 移动端隐藏拾取按钮 测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Portal } from '../src/objects/portal.js';
import { Floor } from '../src/objects/floor.js';
import { TouchUI } from '../src/core/touch.js';
import { parseInventorySetup, applyInventorySetup } from '../src/level/items.js';

function mkPlayer() {
  return new Player({ x: 100, y: 500, substance: 'NaOH', mass: 30 });
}

/** 双门同组场景：玩家站在 A 门内（重叠），step 一帧触发传送 */
function twoGateScene(portalAOpts = {}, spawn = { x: 82, y: 360 }) {
  const scene = new Scene({ worldW: 800, worldH: 600 });
  scene.status = 'running';
  const pA = new Portal({ x: 80, y: 400, group: 'G', ...portalAOpts, id: 'pa' });
  const pB = new Portal({ x: 200, y: 400, group: 'G', id: 'pb' });
  const player = new Player({ x: spawn.x, y: spawn.y, substance: 'NaOH', mass: 30 });
  scene.addObject(pA);
  scene.addObject(pB);
  scene.addObject(new Floor({ x: 0, y: 560, w: 800, h: 40 }));
  scene.addObject(player);
  return { scene, player };
}

// ---- 1. 配置文本解析 ---------------------------------------------------------
test('parseInventorySetup：物质行/物品行/注释/坏行', () => {
  const out = parseInventorySetup('# 注释\nCu:50\n\nbeaker\nbeaker:HCl:20, ZnCl2:5\ndropper:H2O:40\ngasbottle:H2:3\n坏行abc\n');
  const clean = out.filter(Boolean);
  assert.equal(clean.length, 5);
  assert.deepEqual(clean[0], { substance: 'Cu', amount: 50 });
  assert.deepEqual(clean[1], { item: 'beaker', opts: {} });
  assert.deepEqual(clean[2], { item: 'beaker', opts: { solutes: { HCl: 20, ZnCl2: 5 } } });
  assert.deepEqual(clean[3], { item: 'dropper', opts: { solutes: { H2O: 40 } } });
  assert.deepEqual(clean[4], { item: 'gasbottle', opts: { solutes: { H2: 3 } } });
});

test('parseInventorySetup：数组/非法输入', () => {
  assert.equal(parseInventorySetup(null).length, 0);
  assert.equal(parseInventorySetup(42).length, 0);
  const arr = parseInventorySetup([{ substance: 'Cu', amount: 10 }, { item: 'beaker', opts: {} }, { bogus: true }]);
  assert.equal(arr.length, 2, '数组：非 {substance|item} 项剔除');
  assert.equal(arr[0].substance, 'Cu');
});

// ---- 2. 应用：清空 + 装配 ----------------------------------------------------
test('applyInventorySetup：清空旧物品栏后装配（物质跨格+物品）', () => {
  const p = mkPlayer();
  p.inventory.add('AgCl', 3);
  const n = applyInventorySetup(p, 'Cu:120\nbeaker\n坏行abc');
  assert.equal(n, 2, '装配 2 项');
  assert.ok(!p.inventory.slots.some((s) => s && s.substance === 'AgCl'), '旧物质应清空');
  assert.equal(p.inventory.roomFor('Cu'), 280, 'Cu 120g 跨格（100+20），剩余空间 280');
  assert.ok(p.inventory.slots.some((s) => s && s.item === 'beaker'), '烧杯进格');
});

test('applyInventorySetup：clearOnly 只清空不装配', () => {
  const p = mkPlayer();
  p.inventory.add('NaOH', 5);
  const n = applyInventorySetup(p, 'Cu:50', true);
  assert.equal(n, 0);
  assert.ok(!p.inventory.slots.some(Boolean), '应全空');
});

test('applyInventorySetup：beaker 带溶质 → 满杯水溶剂；dropper 装液；gasbottle 装气', () => {
  const p = mkPlayer();
  applyInventorySetup(p, 'beaker:HCl:20\ndropper:H2O:40\ngasbottle:H2:3');
  const bk = p.inventory.slots.find((s) => s && s.item === 'beaker').obj;
  assert.ok(bk.solution.water > 0, '带溶质烧杯应含水（满杯）');
  assert.ok(bk.solution.mass('HCl') > 0);
  const dp = p.inventory.slots.find((s) => s && s.item === 'dropper').obj;
  assert.ok(dp.liquid !== undefined && dp.liquid > 0, '滴管应装液');
  const gb = p.inventory.slots.find((s) => s && s.item === 'gasbottle').obj;
  assert.ok(gb.totalGas() > 0, '集气瓶应装气');
});

// ---- 3. Portal 接入（构造字段 + 传送触发）-----------------------------------
test('portal：走入传送 → 物品栏重置（清空+装配配置）', () => {
  const { scene, player } = twoGateScene({ inventory: 'Cu:30' });
  player.inventory.add('AgCl', 2);
  scene.step(1 / 30);
  assert.ok(!player.inventory.slots.some((s) => s && s.substance === 'AgCl'), '旧物品栏应被重置');
  const cu = player.inventory.slots.filter((s) => s && s.substance === 'Cu').reduce((a, s) => a + s.mass, 0);
  assert.ok(Math.abs(cu - 30) < 1e-9, `应得到 Cu 30g（实际 ${cu}）`);
  assert.ok(player.x > 150 && player.x < 260, `应传送到对侧门附近（实际 x=${player.x}）`);
});

test('portal：clearInventory 只清空；未配置的门不动物品栏', () => {
  const { scene, player } = twoGateScene({ clearInventory: true });
  player.inventory.add('Cu', 10);
  scene.step(1 / 30);
  assert.ok(!player.inventory.slots.some(Boolean), '应只清空');

  const two = twoGateScene({});
  two.player.inventory.add('Cu', 10);
  two.scene.step(1 / 30);
  assert.ok(two.player.inventory.slots.some((s) => s && s.substance === 'Cu'), '无配置 → 物品栏不动');
});

// ---- 4. 移动端隐藏"拾取"按钮 ------------------------------------------------
test('hideTouchGrab：场景开关隐藏 grab 按钮（其余按钮保留）；默认显示', () => {
  const mk = (scene) => new TouchUI({ width: 800, height: 600, style: {}, addEventListener: () => {} }, () => ({ scene, hud: null }));
  const s1 = new Scene({ worldW: 800, worldH: 600, hideTouchGrab: true });
  s1.addObject(new Player({ x: 100, y: 400 }));
  const keys1 = mk(s1).buttonRects().map((r) => r.key);
  assert.ok(!keys1.includes('grab'), 'grab 应被隐藏');
  assert.ok(keys1.includes('use') && keys1.includes('collect') && keys1.includes('place'), '其余按钮保留');

  const s2 = new Scene({ worldW: 800, worldH: 600 });
  s2.addObject(new Player({ x: 100, y: 400 }));
  const keys2 = mk(s2).buttonRects().map((r) => r.key);
  assert.ok(keys2.includes('grab'), '默认应显示 grab');
});
