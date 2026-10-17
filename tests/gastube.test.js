// ============================================================================
// 导气管（GasTube）测试：输入端罩内产气 → 输出端药品池；
//   输入端不冒柱/不进大气；输出端吸收不完才冒柱+进大气；单向；无碰撞箱；未接线不工作。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { Player } from '../src/objects/player.js';
import { GasTube } from '../src/objects/gastube.js';
import { GasColumn } from '../src/objects/gascolumn.js';
import { Bubble } from '../src/objects/bubble.js';
import { LevelBuilder } from '../src/level/builder.js';
import { ChemistryEngine } from '../src/chem/engine.js';
import { Atmosphere } from '../src/chem/atmosphere.js';

const TICK = 1 / 30;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function run(scene, n, fn = null) {
  for (let i = 0; i < n; i++) {
    scene.step(TICK);
    if (fn) fn(scene, i);
  }
}

/** 两块药池（地面挖两个坑）：输入池 poolA、输出池 poolB + 一根导气管 */
function twoPoolScene({ inSolutes = {}, outSolutes = {}, outWater = undefined, tube = true } = {}) {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 }));
  scene.addObject(new Floor({ x: 560, y: 720, w: 440, h: 80 }));
  scene.addObject(new Floor({ x: 1260, y: 720, w: 2000, h: 80 }));
  const inPool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: inSolutes, id: 'poolA' });
  const outPool = new Pool({ x: 1000, y: 720, w: 260, h: 60, volume: 300, solutes: outSolutes, water: outWater, id: 'poolB' });
  scene.addObject(inPool);
  scene.addObject(outPool);
  const gtube = tube ? new GasTube({ x: 0, y: 0, inId: 'poolA', outId: 'poolB', id: 'tube1' }) : null;
  if (gtube) scene.addObject(gtube);
  scene.status = 'running';
  return { scene, inPool, outPool, gtube };
}

/** 该气泡柱是否压在输入池（300..560）上方 */
const overInput = (outPool) => {
  const c = outPool;
  return (o) => o instanceof GasColumn && o.x + o.w > c.x && o.x < c.x + c.w;
};

// ---- 1. 基础：builder / 场景注册 / 两端解析 ---------------------------------
test('导气管：builder 可放置并注册；两端接好后几何罩住输入池、管口插入输出池', () => {
  const canvas = { width: 1100, height: 700, style: {}, getContext: () => ({}) };
  const L = new LevelBuilder(canvas, { worldW: 1600, worldH: 800 });
  L.pool(300, 720, 260, 60, { volume: 300, id: 'poolA' });
  L.pool(1000, 720, 260, 60, { volume: 300, id: 'poolB' });
  L.gastube(0, 0, { inId: 'poolA', outId: 'poolB', id: 'tube1' });
  const scene = L.build();
  assert.equal(scene.gasTubes.length, 1, '导气管应进入场景 gasTubes');
  const g = scene.gasTubes[0];
  const geo = g.geometry(scene);
  assert.ok(geo, '两端接好应有几何');
  // 罩体罩住整个输入池口（左右比池宽、底边落在池口地面线上）
  assert.ok(geo.hood.x < 300 && geo.hood.x + geo.hood.w > 560, '罩子应比池宽');
  assert.equal(geo.hood.y + geo.hood.h, 720, '罩底边 = 池口地面线');
  // 管口在输出池内（水平插入侧面、位于池深中部）
  const r = geo.outPool.innerRect();
  assert.ok(geo.mouth.x > r.x && geo.mouth.x < r.x + r.w, '管口应在输出池内（横向）');
  assert.ok(geo.mouth.y > r.y && geo.mouth.y < r.y + r.h, '管口应在输出池内（纵向）');
  // 管道从罩顶接出
  assert.equal(geo.path[0].x, geo.hood.x + geo.hood.w / 2);
  assert.ok(geo.path[0].y <= geo.hood.y + 4);
  // body 包围盒覆盖整根装置（编辑器选中/导出用）
  assert.ok(g.x <= geo.hood.x && g.x + g.w >= geo.mouth.x);
});

test('导气管未接线（inId/outId 缺省）：不显示装置、不工作', () => {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 3000, h: 80 }));
  const pool = new Pool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolA' });
  scene.addObject(pool);
  const g = new GasTube({ x: 0, y: 0, id: 'tube1' });
  scene.addObject(g);
  scene.status = 'running';
  assert.equal(g.geometry(scene), null, '未接好 → 无几何');
  // 产气照常走正常管线（冒柱/进大气），不被截留
  scene._emitCtx = { obj: null, container: pool, player: null, point: { x: 430, y: 730 }, spread: 20 };
  const cap = scene.onGas('H2', 1, null);
  assert.ok(near(cap, 0), `未接线不应截留：${cap}`);
  const cols = scene.objects.filter((o) => o instanceof GasColumn);
  assert.equal(cols.length, 1, '应照常冒气泡柱');
});

// ---- 2. 输入端产气 → 全部鼓入输出端；输入端不冒柱、不进大气 ------------------
test('输入端产气被罩住：CO2 全部鼓入输出端（石灰水变浑浊），输入端不冒柱、不进大气', () => {
  const { scene, inPool, outPool, gtube } = twoPoolScene({
    inSolutes: { HCl: 100 },
    outSolutes: { 'Ca(OH)2': 3 }, // 300ml 饱和线 3.6g：全溶
  });
  scene.addObject(new Block({ x: 360, y: 700, w: 30, h: 30, substance: 'Cu2(OH)2CO3' }));
  let inputCols = 0;
  let outputBubbles = 0;
  let flowed = false;
  run(scene, 900, () => {
    inputCols += scene.objects.filter(overInput(inPool)).length;
    for (const o of scene.objects) if (o instanceof Bubble) outputBubbles++;
    const g = gtube.geometry(scene);
    if (g && gtube.flow > 0.9 && gtube.gasId === 'CO2') flowed = true;
  });
  assert.ok(outputBubbles > 30, `输出端管口应冒气泡（视觉）：${outputBubbles}`);
  assert.ok(flowed, '产气期间管内应有气流（颜色/气泡依据）');
  const caco3 = outPool.precipitates.get('CaCO3') ?? 0;
  assert.ok(caco3 > 1, `输出端石灰水应被 CO2 通成 CaCO3 沉淀：${caco3.toFixed(2)}g`);
  assert.equal(inPool.solution.mass('H2CO3'), 0, '输入端不应自己吸收产出的气体（被罩住直接送走）');
  assert.ok(scene.atmosphere.mass('CO2') < 1e-6, `气体被完全吸收时不应进大气：${scene.atmosphere.mass('CO2')}`);
  assert.equal(inputCols, 0, '输入端无论如何都不生成气泡柱');
});

test('输入端罩内（池中物块）产气同样被送走；输出端吸收不完 → 输出端冒柱 + 进大气', () => {
  const { scene, inPool, outPool, gtube } = twoPoolScene({
    inSolutes: { HCl: 100 },
    outWater: 200, // 输出端清水：H2 不溶 → 吸收不完
  });
  scene.addObject(new Block({ x: 360, y: 700, w: 30, h: 30, substance: 'Zn' }));
  let inputCols = 0;
  let outputCols = 0;
  let lastCol = null;
  run(scene, 400, () => {
    inputCols += scene.objects.filter(overInput(inPool)).length;
    for (const o of scene.objects) {
      if (!(o instanceof GasColumn)) continue;
      if (o.x + o.w > outPool.x && o.x < outPool.x + outPool.w) {
        outputCols++;
        lastCol = { x: o.x, y: o.y, w: o.w, source: o.source, gasId: o.gasId };
      }
    }
  });
  assert.equal(inputCols, 0, '输入端无论如何都不生成气泡柱');
  assert.ok(outputCols > 0, '输出端吸收不完的气体应在管口生成气泡柱');
  assert.ok(scene.atmosphere.mass('H2') > 0.05, `多余气体应加入大气：${scene.atmosphere.mass('H2').toFixed(3)}`);
  assert.equal(gtube.gasId, 'H2', '管内记录流过的气体（颜色依据）');
  // 输出端气泡柱在管口附近（管口在输出池内，柱体罩住管口上方）
  assert.ok(lastCol, '应有输出端气泡柱');
  const mouth = gtube.geometry(scene).mouth;
  assert.ok(lastCol.x <= mouth.x + 1 && lastCol.x + lastCol.w >= mouth.x - 1, '柱体应覆盖管口');
  assert.equal(lastCol.source, gtube, '输出端多余气体柱归属该导气管（不是"某物块产气"）');
});

test('输出端完全吸收：不冒气泡柱（多余才冒柱）', () => {
  const { scene, inPool, outPool } = twoPoolScene({
    inSolutes: { HCl: 100 },
    outSolutes: { NaOH: 20 }, // 足量碱吸收 CO2
  });
  scene.addObject(new Block({ x: 360, y: 700, w: 30, h: 30, substance: 'Cu2(OH)2CO3' }));
  let cols = 0;
  run(scene, 900, () => {
    cols += scene.objects.filter((o) => o instanceof GasColumn).length;
  });
  assert.ok(outPool.solution.mass('Na2CO3') > 1, `输出端应生成 Na2CO3：${outPool.solution.mass('Na2CO3').toFixed(2)}g`);
  assert.equal(cols, 0, '气体全部被输出端吸收时不应有气泡柱');
  assert.ok(scene.atmosphere.mass('CO2') < 1e-6, '全部吸收 → 不进大气');
  assert.equal(inPool.solution.mass('H2CO3'), 0, '输入端不吸收');
});

// ---- 3. 单向：输出端产气不受管道影响 ---------------------------------------
test('单向：输出端产气不截留（照常冒柱/进大气），只有输入端产气才被送走', () => {
  const { scene, outPool, gtube } = twoPoolScene({
    inSolutes: {},
    outSolutes: { HCl: 100 }, // 输出池自己产 H2
  });
  scene.addObject(new Block({ x: 1060, y: 700, w: 30, h: 30, substance: 'Zn' }));
  let outCols = 0;
  run(scene, 400, () => {
    outCols += scene.objects.filter((o) => o instanceof GasColumn
      && o.x + o.w > outPool.x && o.x < outPool.x + outPool.w).length;
  });
  assert.ok(outCols > 0, '输出端自己产气应照常冒柱');
  assert.ok(scene.atmosphere.mass('H2') > 0.05, '输出端产气照常进大气');
  assert.equal(gtube.flow, 0, '输出端产气不应点亮导气管（单向）');
});

test('单向（直接命中判定）：输入端上下文截留、输出端上下文不截留', () => {
  // 输入端产气 → onGas 返回全部质量 = 截留
  {
    const { scene, inPool } = twoPoolScene({ outWater: 200 });
    scene._emitCtx = { obj: null, container: inPool, player: null, point: { x: 430, y: 730 }, spread: 20 };
    const cap = scene.onGas('H2', 1, null);
    assert.ok(near(cap, 1), `输入端应被导气管全部截留：${cap}`);
  }
  // 输出端产气 → onGas 不截留
  {
    const { scene, outPool } = twoPoolScene({ outWater: 200 });
    scene._emitCtx = { obj: null, container: outPool, player: null, point: { x: 1100, y: 740 }, spread: 20 };
    const cap = scene.onGas('H2', 1, null);
    assert.ok(near(cap, 0), `输出端不应被截留：${cap}`);
  }
});

// ---- 4. 无碰撞箱 -----------------------------------------------------------
test('无碰撞箱：玩家穿过罩子落入输入池（罩子不挡人）', () => {
  const { scene, inPool, gtube } = twoPoolScene({ inSolutes: {} });
  assert.equal(gtube.solid, false);
  assert.ok(!scene.statics.includes(gtube) && !scene.dynamics.includes(gtube), '导气管不参与物理');
  const p = new Player({ x: 400, y: 560 });
  scene.addObject(p);
  run(scene, 120);
  assert.ok(p.bottom > 730, `玩家应穿过罩子落进池内：bottom=${p.bottom.toFixed(1)}`);
  assert.ok(p.x + p.w > inPool.x && p.x < inPool.x + inPool.w, '玩家应落在输入池范围内');
});

// ---- 5. 视觉状态：气体颜色 / 停止产气后褪回灰色 -----------------------------
test('视觉：管内显示流过的气体颜色；停止产气后气流渐褪', () => {
  const { scene, gtube } = twoPoolScene({});
  const fresh = new GasTube({ x: 0, y: 0, inId: 'poolA', outId: 'poolB' });
  assert.equal(fresh.flow, 0);
  gtube.noteFlow('Cl2');
  assert.equal(gtube.tintColor(), '#b8e01f', 'Cl2 黄绿');
  assert.ok(near(gtube.flow, 1));
  gtube.noteFlow('H2'); // 未声明 gasColor 的气体：通用气流青
  assert.equal(gtube.tintColor(), '#78dcff');
  run(scene, 60); // 2s 无产气 → 褪回灰色
  assert.ok(near(gtube.flow, 0), `气流应衰减到 0：${gtube.flow}`);
});

// ---- 6. 引擎管线：skipOnGas / deferAtmosphere --------------------------------
test('引擎：导气管用"先吸收、余量交回"的管线（skipOnGas 不冒柱、deferAtmosphere 不回大气）', () => {
  const eng = new ChemistryEngine();
  let gasCalls = 0;
  const atm = new Atmosphere();
  const env = {
    atmosphere: atm,
    onGas: () => { gasCalls++; return 0.5; },
    emit: () => {},
    onReaction: () => {},
  };
  const left = eng._emitGas('CO2', 2, { env, inContainer: false, dt: TICK, lastRxText: null }, {
    skipOnGas: true,
    deferAtmosphere: true,
  });
  assert.equal(gasCalls, 0, 'skipOnGas：吸收阶段不进入产气钩子');
  assert.ok(near(left, 2), `剩余量应原样交回：${left}`);
  assert.ok(near(atm.mass('CO2'), 0), 'deferAtmosphere：剩余量暂不进大气');
  // 普通调用行为不变：onGas 截留 0.5 → 大气收 1.5
  const atm2 = new Atmosphere();
  const env2 = { atmosphere: atm2, onGas: () => 0.5, emit: () => {}, onReaction: () => {} };
  eng._emitGas('CO2', 2, { env: env2, inContainer: false, dt: TICK, lastRxText: null });
  assert.ok(near(atm2.mass('CO2'), 1.5), `普通管线仍按截留扣减：${atm2.mass('CO2')}`);
});

// ---- 7. 多根导气管：各接各的池，互不串气 -------------------------------------
test('两根导气管各接各的池：只截留自己输入端的产气（不串气）', () => {
  const scene = new Scene({ worldW: 2200, worldH: 800 });
  const floor = (x, w) => scene.addObject(new Floor({ x, y: 720, w, h: 80 }));
  floor(-200, 380); // 180..420 坑
  floor(420, 240); // 660..900 坑
  floor(900, 300); // 1200..1440 坑
  floor(1440, 240); // 1680..1920 坑
  floor(1920, 600);
  const a = new Pool({ x: 180, y: 720, w: 240, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolA' });
  const b = new Pool({ x: 660, y: 720, w: 240, h: 60, volume: 300, solutes: { NaOH: 20 }, id: 'poolB' });
  const c = new Pool({ x: 1200, y: 720, w: 240, h: 60, volume: 300, solutes: { KMnO4: 5, HCl: 120 }, id: 'poolC' });
  const d = new Pool({ x: 1680, y: 720, w: 240, h: 60, volume: 300, solutes: { NaOH: 20 }, id: 'poolD' });
  for (const p of [a, b, c, d]) scene.addObject(p);
  const t1 = new GasTube({ x: 0, y: 0, inId: 'poolA', outId: 'poolB', id: 'tube1' });
  const t2 = new GasTube({ x: 0, y: 0, inId: 'poolC', outId: 'poolD', id: 'tube2' });
  scene.addObject(t1);
  scene.addObject(t2);
  scene.addObject(new Block({ x: 220, y: 700, w: 30, h: 30, substance: 'Cu2(OH)2CO3' })); // A 产 CO2
  scene.status = 'running';
  run(scene, 150);
  assert.ok(b.solution.mass('Na2CO3') > 0.3, `B 应吸收 A 的 CO2：${b.solution.mass('Na2CO3').toFixed(2)}g`);
  assert.equal(b.solution.mass('NaCl'), 0, 'B 不该收到 C 的 Cl2');
  assert.ok(d.solution.mass('NaCl') > 0.3, `D 应吸收 C 的 Cl2：${d.solution.mass('NaCl').toFixed(2)}g`);
  assert.equal(d.solution.mass('Na2CO3'), 0, 'D 不该收到 A 的 CO2');
  assert.equal(t1.gasId, 'CO2');
  assert.equal(t2.gasId, 'Cl2');
});

test('两根导气管同种气体：输出端气泡柱各冒各的（不合并成一根）', () => {
  const scene = new Scene({ worldW: 2200, worldH: 800 });
  const floor = (x, w) => scene.addObject(new Floor({ x, y: 720, w, h: 80 }));
  floor(-200, 380);
  floor(420, 240);
  floor(900, 300);
  floor(1440, 240);
  floor(1920, 600);
  const a = new Pool({ x: 180, y: 720, w: 240, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolA' });
  const b = new Pool({ x: 660, y: 720, w: 240, h: 60, volume: 300, water: 200, id: 'poolB' });
  const c = new Pool({ x: 1200, y: 720, w: 240, h: 60, volume: 300, solutes: { HCl: 100 }, id: 'poolC' });
  const d = new Pool({ x: 1680, y: 720, w: 240, h: 60, volume: 300, water: 200, id: 'poolD' });
  for (const p of [a, b, c, d]) scene.addObject(p);
  const t1 = new GasTube({ x: 0, y: 0, inId: 'poolA', outId: 'poolB', id: 'tube1' });
  const t2 = new GasTube({ x: 0, y: 0, inId: 'poolC', outId: 'poolD', id: 'tube2' });
  scene.addObject(t1);
  scene.addObject(t2);
  scene.addObject(new Block({ x: 220, y: 700, w: 30, h: 30, substance: 'Zn' }));
  scene.addObject(new Block({ x: 1240, y: 700, w: 30, h: 30, substance: 'Zn' }));
  scene.status = 'running';
  let t1Col = null;
  let t2Col = null;
  run(scene, 120, () => {
    for (const o of scene.objects) {
      if (!(o instanceof GasColumn) || o.gasId !== 'H2') continue;
      if (o.source === t1) t1Col = o;
      if (o.source === t2) t2Col = o;
    }
  });
  assert.ok(t1Col, 'tube1 应有自己的 H2 气泡柱');
  assert.ok(t2Col, 'tube2 应有自己的 H2 气泡柱（不被 merge 成一根）');
  assert.notEqual(t1Col, t2Col);
  assert.ok(Math.abs(t1Col.x - t2Col.x) > 400, '两根柱分别在各自输出端');
});
