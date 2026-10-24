// 用户流程回归：checkpoint 插件自动存档时背包有物质/滴管/烧杯 → 死亡/点屏幕回存档点 → 背包完全恢复
// ----------------------------------------------------------------------------
// 用户报告「恢复到上个存档点的时候，物品栏被清空了」：
//   · 快照本身（captureInventory/applyInventory）必须完整恢复物品栏；
//   · 本文件用真实 Scene + 真实 Savepoint + 真实 checkpoint 插件（plugin/checkpoint.js）
//     走真实触发路径（进区域 → 插件延迟一帧 → 引擎 postStep 拍快照）来锁定该行为；
//   · 完整状态恢复语义：存档之后新拾取的物品随世界一起回滚（不是丢数据，也不复制物品）；
//   · 存档节流：距上次存档 <200ms 的新进入区域存档不能被引擎 200ms 节流静默丢弃
//     （插件对真实区域进入/enter 事件传 force —— 先红后绿）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Scene } from '../src/core/scene.js';
import { Savepoint } from '../src/core/savepoint.js';
import { Plugins } from '../src/level/plugins.js';
import { Player } from '../src/objects/player.js';
import { Floor } from '../src/objects/floor.js';
import { Dropper } from '../src/objects/dropper.js';
import { Beaker } from '../src/objects/beaker.js';

const TICK = 1 / 30;
const pluginSrc = readFileSync('plugin/checkpoint.js', 'utf8');
new Function('Chezzle', pluginSrc)({ Plugin: Plugins, Savepoint });

function stepN(s, n) { for (let i = 0; i < n; i++) s.step(TICK); }

/**
 * 假墙钟（性能计时器）：让 savepoint 的「200ms 节流 / 1200ms 读档窗口」可控。
 * 存档节流与 restoredRecently 都走 performance.now；测试里每个用例用递增的起始
 * 时间，避免上一个用例的读档窗口污染下一个用例。
 */
function runWithClock(startNow, fn) {
  const clock = { now: startNow };
  const realNow = performance.now;
  performance.now = () => clock.now;
  try { return fn(clock); } finally { performance.now = realNow; }
}

/** 玩家的"存档时刻背包"：物质槽 + 滴管（含液体）+ 烧杯（含溶液） */
function fillInventory(p) {
  p.inventory.add('Cu(OH)2', 5);
  const dropper = new Dropper({ x: p.x, y: p.y, capacity: 50, liquid: 20, substance: 'HCl' });
  p.inventory.slots[1] = { item: 'dropper', obj: dropper };
  const beaker = new Beaker({ x: p.x, y: p.y, volume: 200, water: 120, solutes: { NaCl: 10 } });
  p.inventory.slots[2] = { item: 'beaker', obj: beaker };
  p.inventory.selected = 2;
  return { dropper, beaker };
}

/** 背包快照比较用：槽位内容（物质质量 / 物品类型 + 内容物） */
function invValues(p) {
  return p.inventory.slots.map((s) => {
    if (!s) return null;
    if (!s.obj) return `${s.substance}:${s.mass}`;
    if (s.item === 'dropper') return `dropper:${s.obj.substance}:${s.obj.liquid}`;
    if (s.item === 'beaker') return `beaker:${s.obj.solution.water}:${s.obj.solution.mass('NaCl')}`;
    return s.item;
  });
}

function makeSingleScene() {
  Savepoint.clear();
  const s = new Scene({ worldW: 900, worldH: 600 });
  s.status = 'running';
  s.addObject(new Floor({ x: 0, y: 520, w: 900, h: 80, id: 'floor' }));
  const p = new Player({ x: 100, y: 420, substance: 'NaOH', mass: 30, id: 'p1' });
  s.addObject(p);
  return { s, p };
}

/** 等插件把存档真正拍下来（插件 api.after 延迟一帧 + 引擎 postStep 队列） */
function waitSaved(s, ms = 60) {
  for (let i = 0; i < ms && !Savepoint.has(s); i++) s.step(TICK);
  assert.equal(Savepoint.has(s), true, 'checkpoint 插件应已自动存档');
}

test('用户流程：进区域自动存档时背包有物质+滴管+烧杯 → 死亡点屏幕回档 → 背包完全恢复', () => runWithClock(100000, () => {
  const { s, p } = makeSingleScene();
  const { dropper, beaker } = fillInventory(p);
  const saved = invValues(p);
  const savedX = p.x;
  // 真实触发路径：玩家进区域 → 插件自动存档
  Plugins.call('checkpoint', s, { points: [{ id: 'cp1', x: 0, y: 0, w: 500, h: 600 }] });
  waitSaved(s);
  assert.equal(Savepoint.info().id, 'cp1');
  assert.deepEqual(invValues(p), saved, '存档时刻背包应被快照');

  // 存档后玩家拿走/清空背包、走动、捡新东西（这些都应回滚）
  p.inventory.slots = [null, null, null, null, null];
  p.inventory.selected = 0;
  p.x += 260;
  p.inventory.add('KCl', 7);
  stepN(s, 5);
  assert.deepEqual(invValues(p), ['KCl:7', null, null, null, null], '读档前背包已被改坏');

  // 死亡 → 点屏幕回存档点（真实入口：Savepoint.retryAfterDeath）
  s.status = 'died';
  assert.equal(Savepoint.retryAfterDeath(s), 'restored');
  assert.equal(s.status, 'running');
  assert.equal(s.player, p, '玩家对象身份不变');

  // 背包完全恢复：物质 / 滴管液体 / 烧杯溶液 / 选中格 / 物品对象身份
  assert.deepEqual(invValues(p), saved, '背包（物质 + 滴管内容 + 烧杯内容）完全恢复');
  assert.equal(p.inventory.selected, 2, '选中格恢复');
  assert.equal(p.inventory.slots[1].obj, dropper, '滴管对象身份不变');
  assert.equal(p.inventory.slots[2].obj, beaker, '烧杯对象身份不变');
  assert.equal(p.inventory.slots[1].obj.liquid, 20, '滴管液体量恢复');
  assert.equal(p.inventory.slots[2].obj.solution.totalMass(), 130, '烧杯溶液总量恢复');
  assert.ok(Math.abs(p.x - savedX) < 1e-9, '玩家位置恢复');
  Savepoint.clear();
}));

test('用户流程（多场景搬运玩家）：进新章节自动存档时背包齐全 → 死亡回档 → 背包/场景都恢复', () => runWithClock(200000, () => {
  Savepoint.clear();
  // 两个场景：A（上一章，玩家被搬运走）+ B（当前章，携带玩家 P 在此）
  const sa = new Scene({ worldW: 700, worldH: 500 });
  sa.status = 'running';
  sa.addObject(new Floor({ x: 0, y: 430, w: 700, h: 70, id: 'fa' }));
  const sb = new Scene({ worldW: 700, worldH: 500 });
  sb.status = 'running';
  sb.addObject(new Floor({ x: 0, y: 430, w: 700, h: 70, id: 'fb' }));
  const p = new Player({ x: 120, y: 330, substance: 'NaOH', mass: 30, id: 'p1' });
  sb.addObject(p);
  const cv = () => ({ style: { display: 'none' } });
  const M = {
    scenes: new Map([
      ['a', { name: 'a', scene: sa, active: false, canvas: cv() }],
      ['b', { name: 'b', scene: sb, active: true, canvas: cv() }],
    ]),
    current: 'b',
    switches: 1,
    hold: {},
    _unbindKeys: null,
  };
  sa.multiscene = M;
  sb.multiscene = M;
  const { dropper, beaker } = fillInventory(p);
  const saved = invValues(p);
  // 两场景都注入 checkpoint（与 Multiscene.buildAll 一致）；只给 b 配点
  Plugins.call('checkpoint', sa, { points: [{ scene: 'b', id: 'cp_b', x: 0, y: 0, w: 300, h: 400 }] });
  Plugins.call('checkpoint', sb, { points: [{ scene: 'b', id: 'cp_b', x: 0, y: 0, w: 300, h: 400 }] });
  waitSaved(sb);
  assert.equal(Savepoint.info().id, 'cp_b');

  // 模拟真实搬运：玩家离开 b 去 a（Multiscene.switchTo 的 carryPlayer 语义）
  sb.removeObject(p);
  sa.addObject(p);
  M.current = 'a';
  p.inventory.slots = [null, null, null, null, null];
  p.x = 500;
  stepN(sa, 3);

  // 在 a 死亡 → 回档
  sa.status = 'died';
  assert.equal(Savepoint.retryAfterDeath(sa), 'restored', '从 a 场景也能读整个多场景快照');
  assert.equal(M.current, 'b', '当前场景恢复为存档时刻的 b');
  assert.equal(sb.player, p, '玩家回到 b 场景');
  assert.deepEqual(invValues(p), saved, '背包完全恢复（含滴管/烧杯内容）');
  assert.equal(p.inventory.slots[1].obj, dropper);
  assert.equal(p.inventory.slots[2].obj, beaker);
  assert.equal(sa.player, null, '非当前场景的玩家引用恢复为存档时刻（null）');
  Savepoint.clear();
}));

test('完整恢复语义：存档之后新拾取的物品随世界一起回滚（避免复制物品），不是数据丢失', () => runWithClock(300000, () => {
  const { s, p } = makeSingleScene();
  Plugins.call('checkpoint', s, { points: [{ id: 'cp1', x: 0, y: 0, w: 500, h: 600 }] });
  waitSaved(s);
  assert.deepEqual(invValues(p), [null, null, null, null, null], '存档时刻背包为空');
  // 存档后才捡到东西 → 死亡回档 → 回到"空背包 + 东西还在世界里"的存档时刻
  p.inventory.add('Cu(OH)2', 5);
  s.spawnParticles('Cu(OH)2', 5, { x: 300, y: 300 }, true, false, { kind: 'reaction' });
  stepN(s, 3);
  s.status = 'died';
  assert.equal(Savepoint.retryAfterDeath(s), 'restored');
  assert.deepEqual(invValues(p), [null, null, null, null, null], '背包回到存档时刻（本章新收集被回滚）');
  assert.equal(s.particles.length, 0, '世界也回到存档时刻（没有复制出多余物品）');
  Savepoint.clear();
}));

test('节流丢档：距上次存档 <200ms 再进入相邻区域 → 新快照落盘（force），读档回新存档点', () => runWithClock(400000, () => {
  const { s, p } = makeSingleScene();
  // 两块相邻的存档区域：A=玩家初始位置，B=右边
  Plugins.call('checkpoint', s, {
    points: [
      { id: 'cp_a', x: 0, y: 0, w: 300, h: 600 },
      { id: 'cp_b', x: 300, y: 0, w: 300, h: 600 },
    ],
  });
  waitSaved(s);
  assert.equal(Savepoint.info().id, 'cp_a', '先落在 A 区存档');
  const atA = Savepoint.info().at;

  // 墙钟不动（= 引擎 200ms 存档节流窗口内）：走进相邻的 B 区 → 触发新的区域进入存档。
  // 插件的自动存档走 api.after + 引擎 postStep 的延迟队列；若 save 不带 force，
  // captureNow 会被 200ms 节流静默丢弃（只弹"已存档"），插件又已把 inside 更新成 B
  // → 快照永远停在旧存档点 A。
  p.x = 340;
  stepN(s, 6);
  assert.ok(Savepoint.info().at - atA < 200, '确实落在引擎 200ms 存档节流窗口内');
  assert.equal(Savepoint.info().id, 'cp_b', '新区域存档没有被节流静默丢弃（force）');

  // 读档必须回到新存档点 B，而不是旧快照 A
  const savedX = p.x;
  p.x = 700;
  p.inventory.add('KCl', 3);
  stepN(s, 3);
  s.status = 'died';
  assert.equal(Savepoint.retryAfterDeath(s), 'restored');
  assert.equal(Savepoint.info().id, 'cp_b', '读档快照仍是最新存档点 B');
  assert.ok(Math.abs(p.x - savedX) < 1e-9, '读档回到 B 区存档时刻的位置（不是旧快照位置）');
  assert.deepEqual(invValues(p), [null, null, null, null, null], '背包回到 B 存档时刻');
  Savepoint.clear();
}));
