// ============================================================================
// 可拾取物品（烧杯/滴管/集气瓶）：Q 拾取 + 选中物品的操作键
// ----------------------------------------------------------------------------
// 覆盖：
//  - 物品操作定义（名称/图标/键位/按住语义）由 carryActionsOf 数据驱动；
//  - Q（collect）拾取最近物品（可放进非选中空格）；C（grab）不再拾取；
//  - 选中烧杯：C 吸液 20g、X 倒出 10g；
//  - 选中滴管：C 吸液 5g、X 滴加 0.5g；
//  - 选中集气瓶：两个操作都是"按住"语义；
//  - 附近没有物品时 Q 仍能收集沉淀（原语义不变）。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Beaker } from '../src/objects/beaker.js';
import { Dropper } from '../src/objects/dropper.js';
import { GasBottle } from '../src/objects/gasbottle.js';
import { Particle } from '../src/objects/particle.js';
import { carryActionsOf } from '../src/level/items.js';
import { keyOf, actionKeyLabel } from '../src/core/prefs.js';

const T = 1 / 30;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function flatScene() {
  const scene = new Scene({ worldW: 1200, worldH: 800 });
  scene.status = 'running';
  scene.addObject(new Floor({ x: -200, y: 700, w: 2000, h: 100 }));
  return scene;
}

function addPlayer(scene, x = 300) {
  const p = new Player({ x, y: 560, substance: 'NaOH', mass: 30 });
  p.inventory.selected = 0;
  scene.addObject(p);
  scene.player = p;
  return p;
}

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(T);
}

// ---- 1. 物品操作定义（数据驱动：HUD/触屏/玩家共用） --------------------------

test('carryActionsOf：烧杯=吸液/倒出，滴管=吸液/滴加，集气瓶=集气/通气（按住）', () => {
  const beaker = new Beaker({ x: 0, y: 0 });
  const dropper = new Dropper({ x: 0, y: 0 });
  const bottle = new GasBottle({ x: 0, y: 0 });
  const beakerActions = carryActionsOf(beaker);
  assert.deepEqual(beakerActions.map((a) => [a.action, a.label, a.icon]), [
    ['grab', '吸液', 'beakerSuck'],
    ['use', '倒出', 'beakerPour'],
  ]);
  const dropperActions = carryActionsOf(dropper);
  assert.deepEqual(dropperActions.map((a) => [a.action, a.label, a.icon]), [
    ['grab', '吸液', 'dropperSuck'],
    ['use', '滴加', 'dropperDrip'],
  ]);
  const bottleActions = carryActionsOf(bottle);
  assert.deepEqual(bottleActions.map((a) => [a.action, a.label, a.icon, !!a.hold]), [
    ['grab', '集气', 'bottleCollect', true],
    ['use', '通气', 'bottleInject', true],
  ]);
  assert.deepEqual(carryActionsOf(null), [], '没有选中物品 → 无操作');
  assert.deepEqual(carryActionsOf(new Player({ x: 0, y: 0 })), [], '玩家不是可拾取物品');
});

test('键位：Q=拾取/收集、Shift=放置；物品操作 1/2 默认 C/X（可改键）', () => {
  assert.equal(keyOf('collect'), 'KeyQ');
  assert.equal(keyOf('place'), 'ShiftLeft');
  assert.equal(keyOf('grab'), 'KeyC');
  assert.equal(keyOf('use'), 'KeyX');
  assert.equal(actionKeyLabel('collect'), 'Q');
  assert.equal(actionKeyLabel('place'), 'Shift');
  assert.equal(actionKeyLabel('grab'), 'C');
  assert.equal(actionKeyLabel('use'), 'X');
});

// ---- 2. Q 拾取；C 不再拾取 ------------------------------------------------

test('Q 拾取：collect 捡起最近物品；grab 不再拾取', () => {
  const scene = flatScene();
  const p = addPlayer(scene, 320);
  const bk = new Beaker({ x: 430, y: 630, w: 70, h: 70, volume: 200, water: 100 });
  scene.addObject(bk);
  run(scene, 4);
  // C（grab）不再有拾取语义
  scene.pressed.add('grab');
  run(scene, 1);
  assert.equal(p.inventory.slots[0], null, 'C 不应拾取物品');
  assert.ok(scene.objects.includes(bk), '烧杯仍在场景里');
  // Q（collect）拾取
  scene.pressed.add('collect');
  run(scene, 1);
  assert.equal(p.inventory.slots[0]?.item, 'beaker', 'Q 应拾取烧杯');
  assert.equal(p.inventory.slots[0]?.obj, bk, '拾取的是同一个对象（内容物保留）');
  assert.equal(scene.objects.includes(bk), false, '烧杯应离开场景');
});

test('Q 拾取：选中格被物质占用时，放进别的空格（与收集沉淀一致）', () => {
  const scene = flatScene();
  const p = addPlayer(scene, 320);
  p.inventory.slots[0] = { substance: 'CuSO4', mass: 5 };
  p.inventory.selected = 0;
  const dr = new Dropper({ x: 430, y: 650, capacity: 50, liquid: 20, substance: 'HCl' });
  scene.addObject(dr);
  run(scene, 4);
  scene.pressed.add('collect');
  run(scene, 1);
  assert.equal(p.inventory.slots[0]?.substance, 'CuSO4', '选中格不被覆盖');
  assert.equal(p.inventory.slots[1]?.item, 'dropper', '物品放进第一个空格');
});

test('Q：附近没有物品时照常收集沉淀颗粒', () => {
  const scene = flatScene();
  const p = addPlayer(scene, 320);
  run(scene, 4);
  scene.addObject(new Particle({
    x: p.x + p.w / 2,
    y: p.bottom - 8,
    substance: 'Cu',
    amount: 1,
    collectible: true,
    placed: true,
  }));
  scene.pressed.add('collect');
  run(scene, 1);
  assert.ok(p.inventory.slots.some((s) => s && s.substance === 'Cu'), '沉淀应收进物品栏');
});

// ---- 3. 选中物品后的操作（C/X 由物品定义） ----------------------------------

test('选中烧杯：C 吸液 20g（按比例带溶质）；X 倒出 10g', () => {
  const scene = flatScene();
  const p = addPlayer(scene, 300);
  const pool = new Pool({ x: 400, y: 620, w: 160, h: 80, volume: 500, water: 400, solutes: { HCl: 40 } });
  scene.addObject(pool);
  const bk = new Beaker({ x: 0, y: 0, volume: 200, water: 0 });
  p.inventory.slots[0] = { item: 'beaker', obj: bk };
  p.inventory.selected = 0;
  run(scene, 2);
  scene.pressed.add('grab');
  run(scene, 1);
  assert.ok(near(bk.solution.totalMass(), 20), `烧杯应吸 20g：${bk.solution.totalMass()}`);
  assert.ok(near(bk.solution.mass('HCl'), 40 / 440 * 20), `溶质按比例：${bk.solution.mass('HCl')}`);
  const before = bk.solution.totalMass();
  scene.pressed.add('use');
  run(scene, 1);
  assert.ok(near(bk.solution.totalMass(), before - 10), `倒出 10g：${before} → ${bk.solution.totalMass()}`);
});

test('选中滴管：C 吸液 5g；X 向最近容器滴加 0.5g', () => {
  const scene = flatScene();
  const p = addPlayer(scene, 300);
  const pool = new Pool({ x: 400, y: 620, w: 160, h: 80, volume: 500, water: 400, solutes: { HCl: 40 } });
  scene.addObject(pool);
  const dr = new Dropper({ x: 0, y: 0, capacity: 50, liquid: 0, substance: 'H2O' });
  p.inventory.slots[0] = { item: 'dropper', obj: dr };
  p.inventory.selected = 0;
  run(scene, 2);
  scene.pressed.add('grab');
  run(scene, 1);
  assert.ok(near(dr.liquid, 5), `滴管吸 5g：${dr.liquid}`);
  assert.equal(dr.substance, 'HCl', '取占优溶质');
  const poolBefore = pool.solution.mass('HCl');
  scene.pressed.add('use');
  run(scene, 1);
  assert.ok(near(dr.liquid, 4.5), `滴加一击减少 0.5g：${dr.liquid}`);
  assert.ok(pool.solution.mass('HCl') > poolBefore, '目标溶液应增加 0.5g');
});

test('集气瓶：集气/通气是按住操作（HUD 会显示"按住集气/通气"）', () => {
  const bottle = new GasBottle({ x: 0, y: 0, capacity: 5, gases: { CO2: 2 } });
  const actions = carryActionsOf(bottle);
  assert.equal(actions[0].hold, true);
  assert.equal(actions[1].hold, true);
  // 未选中物品时，C/X 不产生物品操作（玩家只处理 carryActions）
  const scene = flatScene();
  const p = addPlayer(scene, 300);
  run(scene, 2);
  scene.pressed.add('grab');
  scene.pressed.add('use');
  assert.doesNotThrow(() => run(scene, 1), '没有选中物品时按 C/X 不应报错');
  assert.equal(p.inventory.slots[0], null);
});
