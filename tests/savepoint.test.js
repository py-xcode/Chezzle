// 存档点系统（src/core/savepoint.js）：原地捕获/恢复整个游戏状态
// ----------------------------------------------------------------------------
// 重点验证用户要求的三件事：
//   ① 玩家自身状态（血量/位置/速度）与背包（物质 + 烧杯/滴管等物品内容）完整恢复；
//   ② 场景状态完整恢复（物块材料、药池溶液/沉淀、门/开关、大气、粒子、提示、计时器）；
//   ③ 读档可重复（同一次存档反复读），且死亡后"点屏幕"回到存档点（无存档则整局重开）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Player } from '../src/objects/player.js';
import { Block } from '../src/objects/block.js';
import { Pool } from '../src/objects/pool.js';
import { Door } from '../src/objects/door.js';
import { Dropper } from '../src/objects/dropper.js';
import { Savepoint } from '../src/core/savepoint.js';

const TICK = 1 / 30;

function makeScene() {
  const s = new Scene({ worldW: 900, worldH: 600 });
  s.status = 'running';
  s.addObject(new Floor({ x: 0, y: 520, w: 900, h: 80, id: 'floor' }));
  const p = new Player({ x: 100, y: 420, substance: 'NaOH', mass: 30, id: 'p1' });
  s.addObject(p);
  const b = new Block({ x: 300, y: 440, substance: 'Zn', w: 60, h: 80, id: 'b1' });
  s.addObject(b);
  const b2 = new Block({ x: 420, y: 440, substance: 'Cu', w: 50, h: 80, id: 'b2' });
  s.addObject(b2);
  const pool = new Pool({ x: 560, y: 430, w: 180, h: 90, volume: 300, solutes: { HCl: 30 }, id: 'pool1' });
  s.addObject(pool);
  const door = new Door({ x: 760, y: 440, w: 60, h: 80, id: 'door1' });
  s.addObject(door);
  return { s, p, b, b2, pool, door };
}

function stepN(s, n) {
  for (let i = 0; i < n; i++) s.step(TICK);
}

function snapValues(o) {
  return {
    items: o.s.objects.map((x) => x.id).sort(),
    particles: o.s.particles.length,
    blockZn: o.b.grid.avail('Zn'),
    poolWater: o.pool.solution.water,
    poolHCl: o.pool.solution.mass('HCl'),
    poolPrecipCu: o.pool.precipitates.get('Cu') ?? 0,
    playerX: o.p.x,
    playerHp: o.p.hp,
    inv: o.p.inventory.slots.map((sl) => (sl ? (sl.obj ? `${sl.item}:${sl.obj.liquid ?? ''}` : `${sl.substance}:${sl.mass}`) : null)),
    doorOpen: o.door.isOpen,
    co2: o.s.atmosphere.mass('CO2'),
    tip: o.s.tip,
    time: o.s.time,
  };
}

test('存档 → 大改 → 读档：玩家/背包/场景状态完全恢复，读档可重复', () => {
  Savepoint.clear();
  const o = makeScene();
  const { s, p, b, b2, pool, door } = o;
  stepN(s, 30); // 落地稳定

  // 构造"已经玩了一段"的状态
  p.inventory.add('Cu', 5);
  p.inventory.selected = 1;
  p.inventory.slots[2] = { item: 'dropper', obj: new Dropper({ x: p.x, y: p.y, capacity: 50, liquid: 20, substance: 'HCl' }) };
  b.grid.consume('Zn', 3);
  b.grid.add('Cu', 2);
  b.syncGrid();
  pool.solution.add('NaCl', 12);
  pool.addPrecipitate('Cu', 2);
  door.isOpen = true;
  s.atmosphere.add('CO2', 5);
  s.tip = '检查点提示';
  s.spawnParticles('Cu', 1, { x: 150, y: 300 }, true, true, { kind: 'place' });
  let fired = 0;
  s.wait(2, () => { fired++; });
  // 存档之后再删掉 b2、再加一个新物体：读档后都该回到存档时刻的样子
  s.removeObject(b2);
  const saved = snapValues(o);
  assert.equal(Savepoint.save(s, { id: 'cp1' }), true, '存档成功');
  assert.equal(Savepoint.has(s), true);
  assert.equal(s._saveToast.text, '已存档');

  // —— 存档后把一切改坏 ——
  p.x += 300;
  p.vel.x = -500;
  p.grid.consume('NaOH', 10);
  p.inventory.slots[0] = null;
  p.inventory.slots[2].obj.liquid = 0;
  p.inventory.selected = 0;
  b.grid.consume('Zn', 40);
  b.grid.consume('Cu', 2);
  pool.solution.water = 0;
  pool.solution.solutes.clear();
  pool.precipitates.clear();
  pool.grains.length = 0;
  door.isOpen = false;
  s.atmosphere.remove('CO2', 5);
  s.tip = '被改掉了';
  s.spawnParticles('Cu', 3, { x: 400, y: 300 }, true, false, { kind: 'reaction' });
  const extra = new Block({ x: 650, y: 300, substance: 'Zn', w: 40, h: 40, id: 'extra' });
  s.addObject(extra);
  stepN(s, 20);
  assert.notEqual(p.x, saved.playerX);

  // —— 读档 ——
  assert.equal(Savepoint.restore(s), true, '读档成功');
  assert.equal(s.status, 'running');
  assert.equal(p, s.player, '玩家对象身份不变（插件/脚本持有的引用仍有效）');
  const back = snapValues(o);
  assert.equal(s.objects.includes(extra), false, '存档后新加的物体会被丢弃');
  assert.deepEqual(back.items, saved.items, '物体列表恢复（含存档后被删的 b2）');
  assert.equal(back.particles, saved.particles, '自由沉淀粒子数量恢复');
  assert.ok(Math.abs(back.blockZn - saved.blockZn) < 1e-9, '物块材料恢复');
  assert.ok(Math.abs(back.poolWater - saved.poolWater) < 1e-9, '药池水量恢复');
  assert.ok(Math.abs(back.poolHCl - saved.poolHCl) < 1e-9, '药池溶质恢复');
  assert.ok(Math.abs(back.poolPrecipCu - saved.poolPrecipCu) < 1e-9, '药池沉淀恢复');
  assert.ok(Math.abs(back.playerX - saved.playerX) < 1e-9, '玩家位置恢复');
  assert.ok(Math.abs(back.playerHp - saved.playerHp) < 1e-9, '玩家血量/材料恢复');
  assert.deepEqual(back.inv, saved.inv, '背包（物质 + 滴管内容）恢复');
  assert.equal(back.doorOpen, true, '门状态恢复');
  assert.ok(Math.abs(back.co2 - saved.co2) < 1e-9, '大气恢复');
  assert.equal(back.tip, '检查点提示', '提示恢复');
  assert.ok(Math.abs(back.time - saved.time) < 1e-9, '游戏时间恢复');
  assert.equal(s._saveToast.text, '已回到存档点');

  // 读档恢复的计时器：存档时 wait(2)，恢复后走 2 秒应触发一次
  assert.equal(fired, 0);
  stepN(s, 70);
  assert.equal(fired, 1, '存档时刻的 wait 计时器恢复并继续计时');

  // —— 再改坏一次 → 同一次存档可重复读档 ——
  p.x += 100;
  pool.solution.water = 0;
  stepN(s, 5);
  assert.equal(Savepoint.restore(s), true, '重复读档');
  const back2 = snapValues(o);
  assert.ok(Math.abs(back2.playerX - saved.playerX) < 1e-9, '第二次读档玩家位置仍正确');
  assert.ok(Math.abs(back2.poolWater - saved.poolWater) < 1e-9, '第二次读档药池仍正确');
  assert.ok(Math.abs(back2.blockZn - saved.blockZn) < 1e-9, '第二次读档物块仍正确');
  Savepoint.clear();
});

test('死亡后点屏幕：无存档 → 整局重开；有存档 → 回到存档点', () => {
  Savepoint.clear();
  const o = makeScene();
  const { s, p } = o;
  stepN(s, 20);
  let restarts = 0;
  s.restart = () => { restarts++; };
  s.status = 'died';
  assert.equal(Savepoint.retryAfterDeath(s), 'restart');
  assert.equal(restarts, 1, '无存档时走整局重开');

  // 有存档：读档后状态恢复、不再重开页面
  s.status = 'running';
  s.tip = '存档时';
  assert.equal(Savepoint.save(s, { id: 'cp2' }), true);
  const savedX = p.x;
  p.x += 200;
  s.tip = '死亡时';
  s.status = 'died';
  assert.equal(Savepoint.retryAfterDeath(s), 'restored');
  assert.equal(restarts, 1, '有存档时不刷新');
  assert.equal(s.status, 'running');
  assert.ok(Math.abs(p.x - savedX) < 1e-9, '玩家位置恢复到存档时刻');
  assert.equal(s.tip, '存档时', '读档恢复提示');
  Savepoint.clear();
});

test('多场景（Multiscene）：整体快照 / 当前场景 / hold / 画布可见性恢复', () => {
  Savepoint.clear();
  const mk = () => {
    const s = new Scene({ worldW: 700, worldH: 500 });
    s.status = 'running';
    s.addObject(new Floor({ x: 0, y: 430, w: 700, h: 70, id: 'floor' }));
    const p = new Player({ x: 80, y: 330, substance: 'NaOH', mass: 30, id: 'p' });
    s.addObject(p);
    return s;
  };
  const sa = mk();
  const sb = mk();
  const cv = () => ({ style: { display: 'none' } });
  const M = {
    scenes: new Map([
      ['a', { name: 'a', scene: sa, active: true, canvas: cv() }],
      ['b', { name: 'b', scene: sb, active: false, canvas: cv() }],
    ]),
    current: 'b',
    switches: 7,
    hold: { key: 'value', ref: { deep: 1 } },
    _unbindKeys: null,
  };
  sa.multiscene = M;
  sb.multiscene = M;
  stepN(sa, 20);
  stepN(sb, 20);
  sb.player.x = 300;
  sb.player.inventory.add('NaCl', 4);
  sa.tip = 'A 场景提示';
  M.scenes.get('b').canvas.style.display = 'block';
  assert.equal(Savepoint.save(sb, { id: 'mcp' }), true);

  // 打乱：切场景、改两个场景、改 hold
  M.current = 'a';
  M.switches = 0;
  M.hold.key = 'changed';
  sa.player.x = 500;
  sb.player.x = 600;
  sb.player.inventory.slots = [null, null, null, null, null];
  sb.tip = '改了';

  assert.equal(Savepoint.restore(sb), true);
  assert.equal(M.current, 'b', '当前场景恢复');
  assert.equal(M.switches, 7, '切换计数恢复');
  assert.equal(M.hold.key, 'value', 'hold 恢复');
  assert.ok(Math.abs(sb.player.x - 300) < 1e-9, 'B 场景玩家位置恢复');
  assert.ok(Math.abs(sa.player.x - 80) < 1e-9, 'A 场景玩家位置恢复');
  assert.equal(M.scenes.get('a').active, false, '非当前场景不可见');
  assert.equal(M.scenes.get('b').active, true, '当前场景激活');
  assert.equal(sa.tip, 'A 场景提示', 'A 场景提示恢复');
  assert.equal(M.scenes.get('a').canvas.style.display, 'none');
  assert.equal(M.scenes.get('b').canvas.style.display, 'block');
  Savepoint.clear();
});

test('存档节流：200ms 内重复存档被忽略，force 可强制', async () => {
  Savepoint.clear();
  const o = makeScene();
  o.s.status = 'running';
  assert.equal(Savepoint.save(o.s, { id: 'x' }), true);
  assert.equal(Savepoint.save(o.s, { id: 'y' }), false, '短时间内重复存档忽略');
  await new Promise((r) => setTimeout(r, 230));
  assert.equal(Savepoint.save(o.s, { id: 'y' }), true);
  assert.equal(Savepoint.info().id, 'y');
  Savepoint.clear();
});

test('在 onTick 钩子里存档：延后到本刻结束再拍快照，读档后钩子表不丢', () => {
  // 回归：_runHooks 期间 _tickFns 正在"边跑边重建"，直接快照会漏掉当前及之后
  // 未执行的钩子 → 读档后插件 onTick 全部消失（插件系统依赖 onTick 持续工作）。
  Savepoint.clear();
  const o = makeScene();
  const { s, p } = o;
  let ticksA = 0;
  let ticksB = 0;
  let savedOnce = false;
  s.onTick(() => {
    ticksA++;
    if (!savedOnce) {
      savedOnce = true;
      Savepoint.save(s, { id: 'in-hook', force: true });
    }
  });
  s.onTick(() => { ticksB++; });
  s.step(TICK); // 本刻内请求存档 → postStep 时真正的快照
  assert.equal(Savepoint.has(s), true, '钩子里的存档请求已生效');
  assert.equal(ticksA, 1);
  assert.equal(ticksB, 1);

  // 读档后再跑：两个 onTick 钩子都还在（旧实现会全丢）
  p.x += 200;
  assert.equal(Savepoint.restore(s), true);
  const a0 = ticksA;
  const b0 = ticksB;
  stepN(s, 5);
  assert.equal(ticksA, a0 + 5, '钩子 A 读档后仍在');
  assert.equal(ticksB, b0 + 5, '钩子 B 读档后仍在');
  Savepoint.clear();
});
