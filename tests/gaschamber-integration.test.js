// ============================================================================
// 气室（GasChamber）场景集成测试
// ----------------------------------------------------------------------------
// 对象本体的单元测试见 tests/gaschamber.test.js；本文件验证 Scene 区域集成：
//   ① 气室内产气只进气室内部大气（气泡柱也被限制在气室内）；
//   ② 外部产气不进气室内部；③ 初始大气 seed（默认复制外部 / gases 独占预设）；
//   ④ 气体探测器按区域隔离；⑤ HUD 大气数据源；⑥ 存档快照恢复；
//   ⑦ 气室作为导气管输出端（多输出 GasTube）；⑧ 无碰撞箱。
// 手搭 Scene 的方式与 tests/gastube.test.js / tests/items.test.js 一致。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Scene } from '../src/core/scene.js';
import { Savepoint } from '../src/core/savepoint.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { Player } from '../src/objects/player.js';
import { GasChamber } from '../src/objects/gaschamber.js';
import { GasDetector } from '../src/objects/gasdetector.js';
import { GasTube } from '../src/objects/gastube.js';
import { GasColumn } from '../src/objects/gascolumn.js';

const TICK = 1 / 30;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** 跑 n tick（可选回调，用于逐帧检查视觉约束/状态） */
function run(scene, n, each = null) {
  for (let i = 0; i < n; i++) {
    scene.step(TICK);
    if (each) each(i);
  }
}

/** 气室矩形内是否完整包含一个矩形区域（气泡柱约束用） */
function rectInside(inner, outer) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** 当前场景里所有反应产气的气泡柱 */
function gasColumns(scene) {
  return scene.objects.filter((o) => o instanceof GasColumn);
}

// ---- 1. 气室内产气：只进气室内部大气，气泡柱被限制在气室内 ------------------
test('气室内反应产气：气体只进气室内部大气，外部大气为 0，气泡柱不越出气室', () => {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 })); // 到 300
  scene.addObject(new Floor({ x: 560, y: 720, w: 1040, h: 80 })); // 从 560（中间是池坑）
  const chamber = new GasChamber({ x: 260, y: 500, w: 340, h: 280, id: 'gc1' });
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolIn' });
  scene.addObject(chamber);
  scene.addObject(pool);
  const zn = new Block({ x: 340, y: 560, substance: 'Zn', mass: 20, id: 'znIn' });
  scene.addObject(zn);
  scene.status = 'running';

  // 池子与气室有重叠 → 池内产气算气室内产气
  assert.equal(scene.gasChamberFor(pool), chamber, '池子应与气室重叠（内部区域）');
  let sawColumn = 0;
  run(scene, 60, () => {
    for (const col of gasColumns(scene)) {
      sawColumn++;
      assert.ok(rectInside(col, chamber), `气室内气泡柱不应越出气室：柱 ${col.x},${col.y},${col.w},${col.h}`);
    }
  });

  assert.ok(sawColumn > 0, '气室内产气应生成气泡柱（视觉）');
  assert.ok(chamber.atmosphere.mass('H2') > 0.05, `气室内部应有 H2：${chamber.atmosphere.mass('H2').toFixed(3)}g`);
  assert.ok(scene.atmosphere.mass('H2') < 1e-6, `外部大气不应有 H2：${scene.atmosphere.mass('H2')}`);
  // 产气累积器同样分区（气体探测器数据源）
  assert.ok((chamber._reactGas.H2 ?? 0) > 0.05, '气室产气应记入气室自己的 _reactGas');
  assert.equal(scene._reactGas.H2 ?? 0, 0, '外部 _reactGas 不应记录气室内产气');
});

// ---- 2. 外部产气：不进气室内部 ---------------------------------------------
test('外部反应产气：只进外部大气，气室内部大气保持为 seed 时的组成', () => {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 })); // 坑 300..560
  scene.addObject(new Floor({ x: 560, y: 720, w: 1040, h: 80 }));
  const chamber = new GasChamber({ x: 1100, y: 300, w: 200, h: 160, id: 'gcFar' }); // 远离池子
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolOut' });
  scene.addObject(chamber);
  scene.addObject(pool);
  scene.addObject(new Block({ x: 340, y: 560, substance: 'Zn', mass: 20, id: 'znOut' }));
  scene.status = 'running';

  assert.equal(scene.gasChamberFor(pool), null, '池子在气室外');
  run(scene, 60);
  assert.ok(scene.atmosphere.mass('H2') > 0.05, `外部大气应有 H2：${scene.atmosphere.mass('H2').toFixed(3)}g`);
  assert.ok(chamber.atmosphere.mass('H2') < 1e-9, `气室内部不应有 H2：${chamber.atmosphere.mass('H2')}`);
  assert.ok((scene._reactGas.H2 ?? 0) > 0.05, '外部产气记入场景 _reactGas');
  assert.equal(chamber._reactGas.H2 ?? 0, 0, '气室 _reactGas 不应记录外部产气');
});

// ---- 3. 初始大气：默认复制外部；gases 独占预设 ------------------------------
test('初始大气 seed：默认复制外部大气；配置 gases 的气室走独占预设，互不影响', () => {
  const scene = new Scene({ worldW: 1200, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 1600, h: 80 }));
  scene.atmosphere.preset({ N2: 1200, O2: 300 }); // 关卡外部大气
  const copy = new GasChamber({ x: 100, y: 200, w: 160, h: 120, id: 'gcCopy' });
  const pure = new GasChamber({ x: 500, y: 200, w: 160, h: 120, id: 'gcPure', gases: { O2: 2000 } });
  scene.addObject(copy);
  scene.addObject(pure);
  scene.status = 'running';

  // 气室在第一次 step 时才 seed
  assert.equal(copy._seeded, false);
  run(scene, 2);
  assert.equal(copy._seeded, true);
  assert.equal(copy.atmosphere.mass('N2'), 1200, '默认气室复制外部 N2');
  assert.equal(copy.atmosphere.mass('O2'), 300, '默认气室复制外部 O2');
  assert.equal(copy.atmosphere._baseTotal, scene.atmosphere._baseTotal, '基准总质量一并复制');
  // 配置 gases：独占预设——只有 O2，没有 N2（不是复制外部大气）
  assert.equal(pure.atmosphere.mass('O2'), 2000, '配置 O2 = 2000g');
  assert.equal(pure.atmosphere.mass('N2'), 0, '没配置的 N2 应为 0');
  assert.equal(pure.atmosphere.total(), 2000, '总质量 = 配置气体之和');

  // seed 之后外部大气再变化 → 内部不受影响（两个气室各自独立）
  scene.atmosphere.remove('O2', 100);
  scene.atmosphere.add('CO2', 50);
  run(scene, 2);
  assert.equal(copy.atmosphere.mass('N2'), 1200, '外部变化不影响默认气室 N2');
  assert.ok(near(copy.atmosphere.mass('O2'), 300), '外部变化不影响默认气室 O2');
  assert.equal(copy.atmosphere.mass('CO2'), 0, '外部新增 CO2 不进气室');
  assert.equal(pure.atmosphere.total(), 2000, '配置气室不受外部变化影响');
});

// ---- 4. 气体探测器按区域隔离 -------------------------------------------------
test('气体探测器分区：气室内产气只开内部探测器；外部产气只开外部探测器', () => {
  const scene = new Scene({ worldW: 2200, worldH: 800 });
  const floor = (x, w) => scene.addObject(new Floor({ x, y: 720, w, h: 80 }));
  floor(-200, 500); // 到 300
  floor(560, 440); // 560..1000
  floor(1260, 140); // 1260..1400
  floor(1660, 540); // 1660..2200（1400..1660 是第二个池坑）
  const chamber = new GasChamber({ x: 260, y: 500, w: 340, h: 280, id: 'gc1' });
  const poolIn = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolIn' });
  const detIn = new GasDetector({ x: 280, y: 540, w: 40, h: 22, gas: 'H2', threshold: 0.5, id: 'detIn' });
  const detOut = new GasDetector({ x: 1300, y: 540, w: 40, h: 22, gas: 'H2', threshold: 0.5, id: 'detOut' });
  scene.addObject(chamber);
  scene.addObject(poolIn);
  scene.addObject(detIn);
  scene.addObject(detOut);
  scene.status = 'running';
  assert.equal(scene.gasChamberFor(detIn), chamber, '内部探测器应在气室内');
  assert.equal(scene.gasChamberFor(detOut), null, '外部探测器应在气室外');

  // —— 气室内产 H2：内部探测器开，外部关 ——
  scene.addObject(new Block({ x: 340, y: 560, substance: 'Zn', mass: 50, id: 'znIn' }));
  let tickIn = -1;
  run(scene, 300, (i) => { if (tickIn < 0 && detIn.open) tickIn = i + 1; });
  assert.ok(tickIn > 0, '气室内产 H2 应打开内部探测器');
  assert.equal(detIn.effectiveOpen(scene), true, '内部探测器有效状态=开');
  assert.equal(detOut.open, false, '外部探测器不应被气室内产气触发');
  assert.equal(scene._reactGas.H2 ?? 0, 0, '外部 _reactGas 未被气室内产气污染');

  // —— 外部产 H2：外部探测器开，内部保持开（_reactGas 不衰减） ——
  const poolOut = new Pool({ x: 1400, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolOut' });
  scene.addObject(poolOut);
  scene.addObject(new Block({ x: 1460, y: 560, substance: 'Zn', mass: 30, id: 'znOut' }));
  let tickOut = -1;
  run(scene, 300, (i) => { if (tickOut < 0 && detOut.open) tickOut = i + 1; });
  assert.ok(tickOut > 0, '外部产 H2 应打开外部探测器');
  assert.equal(detOut.effectiveOpen(scene), true, '外部探测器有效状态=开');
  assert.equal(detIn.open, true, '内部探测器保持开（反应产气累积不衰减）');
  assert.ok(chamber._reactGas.H2 > 0.5, '气室内产气累积仍在内部 _reactGas');
});

// ---- 5. HUD 大气数据源 -------------------------------------------------------
test('HUD 大气数据源：玩家在气室内显示气室大气，在气室外显示场景大气', () => {
  const scene = new Scene({ worldW: 1200, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 1600, h: 80 }));
  scene.atmosphere.preset({ N2: 800, O2: 200 });
  const chamber = new GasChamber({ x: 300, y: 300, w: 200, h: 160, id: 'gc1', gases: { O2: 50 } });
  scene.addObject(chamber);
  const player = new Player({ x: 340, y: 340, id: 'p1' }); // 与气室矩形重叠
  scene.addObject(player);
  scene.status = 'running';
  run(scene, 2); // 气室 seed

  assert.equal(scene.gasChamberFor(player), chamber, '玩家在气室内');
  assert.equal(scene.atmosphereForPlayer(), chamber.atmosphere, 'HUD 显示气室内部大气');
  assert.equal(chamber.atmosphere.mass('O2'), 50, '气室内部大气按配置 seed');

  // 玩家走到气室外 → HUD 回到外部大气
  player.x = 900;
  assert.equal(scene.gasChamberFor(player), null);
  assert.equal(scene.atmosphereForPlayer(), scene.atmosphere, 'HUD 显示外部大气');
});

// ---- 6. 存档：气室内部大气 / reactGas 随快照恢复 -----------------------------
test('存档/读档：气室内部大气与反应产气随快照恢复，气室对象引用不变', () => {
  Savepoint.clear();
  const scene = new Scene({ worldW: 1200, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 1600, h: 80 }));
  scene.atmosphere.preset({ N2: 1200, O2: 300 });
  const chamber = new GasChamber({ x: 300, y: 300, w: 200, h: 160, id: 'gc1' });
  scene.addObject(chamber);
  scene.status = 'running';
  run(scene, 5); // 气室 seed（默认复制外部大气）

  // 构造"玩了一段"的状态：内外大气都有变化 + 气室内有反应产气记录
  chamber.atmosphere.add('CO2', 8);
  chamber._reactGas = { H2: 5 };
  scene.atmosphere.add('CO2', 3);
  assert.equal(Savepoint.save(scene, { force: true }), true, '存档成功');

  // 存档后改坏：气室内外加气/减气、清空产气记录
  chamber.atmosphere.remove('N2', 500);
  chamber.atmosphere.add('H2', 50);
  chamber.atmosphere.remove('CO2', 8);
  chamber._reactGas = {};
  scene.atmosphere.remove('O2', 100);
  scene.atmosphere.remove('CO2', 3);
  run(scene, 2);

  assert.equal(Savepoint.restore(scene), true, '读档成功');
  assert.equal(scene.status, 'running');
  // 对象身份不变（关卡脚本/插件持有的引用仍有效）
  assert.equal(scene.gasChambers[0], chamber, '气室对象引用不变');
  assert.equal(scene.byId.gc1, chamber);
  // 气室内部大气恢复
  assert.equal(chamber.atmosphere.mass('N2'), 1200, '内部 N2 恢复');
  assert.ok(near(chamber.atmosphere.mass('O2'), 300), '内部 O2 恢复');
  assert.equal(chamber.atmosphere.mass('CO2'), 8, '内部 CO2 恢复');
  assert.equal(chamber.atmosphere.mass('H2'), 0, '存档后新增的 H2 被丢弃');
  // 气室反应产气记录恢复（气体探测器数据源）
  assert.equal(chamber._reactGas.H2, 5, '气室 _reactGas 恢复');
  assert.equal(chamber._seeded, true, 'seed 状态保持');
  // 外部大气恢复
  assert.equal(scene.atmosphere.mass('N2'), 1200, '外部 N2 恢复');
  assert.ok(near(scene.atmosphere.mass('O2'), 300), '外部 O2 恢复');
  assert.equal(scene.atmosphere.mass('CO2'), 3, '外部 CO2 恢复');
  Savepoint.clear();
});

// ---- 7. 气室作为导气管输出端（多输出 GasTube） -------------------------------
test('导气管输出到气室：气体直接进内部大气，外部大气/气泡柱都不出现', (t) => {
  // 前提：pipe-dev 的多输出 GasTube 接口（openBranches/branchSource/outIds）已就绪；
  // 未就绪时此用例跳过（不伪造实现细节）。
  const probe = new GasTube({ x: 0, y: 0 });
  if (typeof probe.openBranches !== 'function' || typeof probe.branchSource !== 'function') {
    t.skip('GasTube 多输出接口（openBranches/branchSource）未就绪');
    return;
  }
  const scene = new Scene({ worldW: 2000, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 })); // 坑 300..560
  scene.addObject(new Floor({ x: 560, y: 720, w: 1440, h: 80 }));
  const poolIn = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolIn' });
  const chamber = new GasChamber({ x: 1300, y: 300, w: 240, h: 200, id: 'gcOut' });
  const tube = new GasTube({ inId: 'poolIn', outIds: ['gcOut'], id: 'tube1' });
  scene.addObject(poolIn);
  scene.addObject(chamber);
  scene.addObject(tube);
  scene.addObject(new Block({ x: 340, y: 560, substance: 'Zn', mass: 50, id: 'znIn' }));
  scene.status = 'running';

  const geo = tube.geometry(scene);
  assert.ok(geo, '导气管两端接好应有几何');
  assert.equal(geo.branches.length, 1, '应有一条输出支路');
  assert.equal(geo.branches[0].target, chamber, '支路输出端 = 气室');
  assert.equal(geo.branches[0].targetKind, 'chamber');

  let columns = 0;
  run(scene, 60, () => { columns += gasColumns(scene).length; });
  assert.equal(columns, 0, '输入端不冒柱，气室输出直接进大气 → 全程无气泡柱');
  assert.equal(tube.gasId, 'H2', '管内记录已输送 H2');
  assert.ok(chamber.atmosphere.mass('H2') > 0.05, `气室内部应有 H2：${chamber.atmosphere.mass('H2').toFixed(3)}g`);
  assert.ok(scene.atmosphere.mass('H2') < 1e-6, `外部大气不应有 H2：${scene.atmosphere.mass('H2')}`);
  assert.ok((chamber._reactGas.H2 ?? 0) > 0.05, '主动充入气室的气体记入气室 _reactGas');
});

// ---- 8. 无碰撞：不进物理索引，玩家可直接穿过 --------------------------------
test('无碰撞：气室不进物理索引，玩家可以直接穿过气室区域', () => {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 2000, h: 80 }));
  const chamber = new GasChamber({ x: 400, y: 400, w: 200, h: 260, id: 'gc1' });
  scene.addObject(chamber);
  const player = new Player({ x: 200, y: 560, id: 'p1' });
  scene.addObject(player);
  scene.status = 'running';

  assert.equal(chamber.solid, false);
  assert.equal(chamber.physicsKind, 'none');
  assert.ok(!scene.statics.includes(chamber), '气室不应进 statics');
  assert.ok(!scene.dynamics.includes(chamber), '气室不应进 dynamics');
  assert.ok(scene.gasChambers.includes(chamber), '气室应进 gasChambers 逻辑索引');

  scene.control.add('right');
  run(scene, 40);
  assert.ok(player.x > chamber.x + 5, `玩家应直接穿过气室区域：player.x=${player.x.toFixed(1)}、气室 x=${chamber.x}`);
});
