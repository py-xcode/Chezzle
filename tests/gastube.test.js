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
import { Savepoint } from '../src/core/savepoint.js';

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

// ============================================================================
// 8. 多输出支路 / 气室输出 / 阀门（对象级：假 Scene 只提供 byId，不依赖 Scene 路由）
// ============================================================================

/** 建一个药品池（不需要地板：这些用例只算几何，不跑物理/化学） */
function poolAt(id, x, y = 720, w = 260, h = 60, opts = {}) {
  return new Pool({ x, y, w, h, volume: 300, id, ...opts });
}

/** 假气室：真实类见 objects/gaschamber.js（本对象只满足 isGasChamber + 矩形） */
function fakeChamber(id, x, y, w = 160, h = 120, hidden = false) {
  return {
    id, x, y, w, h, hidden,
    isGasChamber: true,
    atmosphere: { gas: new Map() },
    containsPoint() { return false; },
  };
}

/** 假 Scene：几何/采集只读 byId；update 还用到 addObject（收集气泡） */
function fakeScene(...objs) {
  const scene = { byId: {}, objects: [], statics: [], time: 0 };
  for (const o of objs) scene.byId[o.id] = o;
  scene.addObject = (o) => { scene.objects.push(o); return o; };
  return scene;
}

/** 假 2D 上下文（Node 无 DOM：只验证绘制不抛错） */
function fakeCtx() {
  const noop = () => {};
  return {
    canvas: { width: 1100, height: 700 },
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
    arc: noop, arcTo: noop, quadraticCurveTo: noop, fill: noop, stroke: noop,
    fillRect: noop, strokeRect: noop, setLineDash: noop, translate: noop, rotate: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: (t) => ({ width: String(t).length * 8 }),
    fillText: noop, strokeText: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    font: '', textAlign: '', textBaseline: '', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
  };
}

test('多输出：一输入两输出 → 两条独立支路，各自插入输出池；主干从罩顶接出', () => {
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const c = poolAt('poolC', 1450);
  const scene = fakeScene(inPool, b, c);
  const tube = new GasTube({ inId: 'poolA', outIds: ['poolB', 'poolC'] });
  const g = tube.geometry(scene);
  assert.ok(g, '两输出都有效 → 有几何');
  assert.equal(g.branches.length, 2);
  assert.deepEqual(g.branches.map((x) => x.outId), ['poolB', 'poolC'], '支路顺序 = 配置顺序');
  // 主干：从罩顶中心竖直伸出，高过罩顶（各支路从主干不同高度分叉）
  assert.equal(g.trunk[0].x, g.hood.x + g.hood.w / 2);
  assert.ok(g.trunk[0].y <= g.hood.y + 4, '主干从罩顶接出');
  assert.ok(g.trunk[g.trunk.length - 1].y < g.hood.y - 10, '主干伸到罩顶以上');
  const laneYs = new Set();
  for (const br of g.branches) {
    assert.equal(br.targetKind, 'pool');
    // 药品池：管口水平插入池内（液面下 = innerRect 内）
    const r = br.target.innerRect();
    assert.ok(br.mouth.x > r.x && br.mouth.x < r.x + r.w, `${br.outId} 管口应在池内（横向）`);
    assert.ok(br.mouth.y > r.y && br.mouth.y < r.y + r.h, `${br.outId} 管口应在池内（纵向）`);
    assert.equal(br.valve, null, '未配置 valves → 无阀门');
    assert.equal(br.path[0].x, g.trunk[0].x, '支路从主干分叉');
    assert.equal(br.path[0].y, br.path[1].y, '横段水平');
    laneYs.add(br.path[1].y);
  }
  assert.equal(laneYs.size, 2, '两条支路横段高度不同（分开布管不重叠）');
  // 包围盒同步：覆盖罩体 + 所有管道点
  assert.ok(tube.x <= g.hood.x && tube.x + tube.w >= g.hood.x + g.hood.w);
  assert.ok(tube.y <= g.hood.y && tube.y + tube.h >= g.hood.y + g.hood.h);
  for (const br of g.branches) {
    for (const p of br.path) {
      assert.ok(p.x >= tube.x && p.x <= tube.x + tube.w, '包围盒横向覆盖支路');
      assert.ok(p.y >= tube.y && p.y <= tube.y + tube.h, '包围盒纵向覆盖支路');
    }
  }
  // 无阀门 → 所有支路都通气
  assert.equal(tube.openBranches(scene).length, 2);
});

test('气室输出：管子接在气室外壁法兰点（不进入内部），可与药品池支路混合', () => {
  const inPool = poolAt('poolA', 300);
  const chamber = fakeChamber('chamber1', 1000, 560, 180, 120);
  const scene = fakeScene(inPool, chamber);
  const tube = new GasTube({ inId: 'poolA', outIds: ['chamber1'] });
  const g = tube.geometry(scene);
  assert.ok(g);
  const br = g.branches[0];
  assert.equal(br.target, chamber);
  assert.equal(br.targetKind, 'chamber');
  // 从靠近输入端的一侧（左壁）接入：管口贴外壁、下降段贴外侧 → 不进入内部
  assert.equal(br.mouth.x, chamber.x, '管口贴气室左外壁');
  assert.equal(br.mouth.y, Math.round(chamber.y + chamber.h / 2));
  const prev = br.path[br.path.length - 2];
  assert.equal(prev.x, chamber.x - 22, '下降段在气室外侧');
  assert.ok(prev.x + 13 < chamber.x, '管道主体不进气室内部');
  // 混合：气室 + 药品池各一条支路
  const pool = poolAt('poolB', 1500);
  const scene2 = fakeScene(inPool, chamber, pool);
  const tube2 = new GasTube({ inId: 'poolA', outIds: ['chamber1', 'poolB'] });
  const g2 = tube2.geometry(scene2);
  assert.equal(g2.branches.length, 2);
  assert.deepEqual(g2.branches.map((b) => b.targetKind), ['chamber', 'pool']);
  // 阀门可装在气室支路上
  const tube3 = new GasTube({ inId: 'poolA', outIds: ['chamber1', 'poolB'], valves: { chamber1: false } });
  const g3 = tube3.geometry(scene2);
  assert.ok(g3.branches[0].valve, '气室支路应有阀门');
  assert.equal(g3.branches[0].valve.open, false);
  assert.deepEqual(tube3.openBranches(scene2).map((b) => b.outId), ['poolB']);
});

test('阀门：openBranches 过滤、toggleValve 返回值、valves 为纯数据普通对象', () => {
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const c = poolAt('poolC', 1450);
  const scene = fakeScene(inPool, b, c);
  const tube = new GasTube({ inId: 'poolA', outIds: ['poolB', 'poolC'], valves: { poolB: true, poolC: false } });
  // 存档自动捕获要求：普通对象（不是 Map/类实例）
  assert.equal(Object.getPrototypeOf(tube.valves), Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(tube.valves)), { poolB: true, poolC: false });
  assert.equal(tube.hasValve('poolB'), true);
  assert.equal(tube.hasValve('poolC'), true);
  assert.equal(tube.hasValve('poolA'), false, '输入端不是输出支路，没有阀门');
  assert.equal(tube.valveOpen('poolB'), true);
  assert.equal(tube.valveOpen('poolC'), false);
  // 几何：阀门在支路第一段横管中点，开/关状态随之
  const g = tube.geometry(scene);
  const openStates = {};
  for (const br of g.branches) {
    assert.ok(br.valve, `${br.outId} 应装阀门`);
    assert.ok(br.valve.r >= 8, '阀门有可点击半径');
    const x1 = Math.min(br.path[0].x, br.path[1].x);
    const x2 = Math.max(br.path[0].x, br.path[1].x);
    assert.ok(br.valve.x > x1 && br.valve.x < x2, '阀门在横段中点附近');
    assert.equal(br.valve.y, br.path[1].y);
    openStates[br.outId] = br.valve.open;
  }
  assert.deepEqual(openStates, { poolB: true, poolC: false });
  assert.deepEqual(tube.openBranches(scene).map((x) => x.outId), ['poolB']);
  // 切换：返回新状态
  assert.equal(tube.toggleValve('poolC'), true);
  assert.equal(tube.valveOpen('poolC'), true);
  assert.deepEqual(tube.openBranches(scene).map((x) => x.outId), ['poolB', 'poolC']);
  assert.equal(tube.toggleValve('poolB'), false);
  assert.deepEqual(tube.openBranches(scene).map((x) => x.outId), ['poolC']);
  // 没装阀门的支路不会凭空加阀门
  assert.equal(tube.toggleValve('poolA'), false);
  assert.equal(tube.hasValve('poolA'), false);
});

test('阀门点击：tapHit 只命中阀门圆；onTap 切换阀门且永远返回 false（不进长按连发）', () => {
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const scene = fakeScene(inPool, b);
  const tube = new GasTube({ inId: 'poolA', outId: 'poolB', valves: { poolB: true } });
  const g = tube.geometry(scene); // 点击管线读 _geom 做细粒度命中
  const v = g.branches[0].valve;
  assert.ok(v);
  assert.equal(tube.tapHit({ x: v.x, y: v.y }), true, '阀门圆心命中');
  assert.equal(tube.tapHit({ x: v.x + v.r + 20, y: v.y }), false, '阀门圆外不命中');
  // 整台装置 bbox 内的其它位置都不算阀门命中（不抢滴管点击）
  assert.equal(tube.tapHit(g.mouth), false, '管口不是阀门');
  assert.equal(tube.tapHit({ x: g.hood.x + g.hood.w / 2, y: g.hood.y + 2 }), false, '罩顶不是阀门');
  // onTap：命中→切换，返回 false；未命中→不动阀门，也返回 false
  assert.equal(tube.onTap(scene, { x: v.x, y: v.y }), false);
  assert.equal(tube.valveOpen('poolB'), false, '第一次点击后阀门关闭');
  assert.equal(tube.onTap(scene, { x: v.x, y: v.y }), false);
  assert.equal(tube.valveOpen('poolB'), true, '第二次点击后阀门打开');
  assert.equal(tube.onTap(scene, g.mouth), false);
  assert.equal(tube.valveOpen('poolB'), true, '未命中不误切换');
});

test('输出端解析：隐藏池 / 非容器 / 输入池自身 / 重复 id / 缺失 id 全部跳过', () => {
  const inPool = poolAt('poolA', 300);
  const hiddenPool = poolAt('poolB', 800);
  hiddenPool.hidden = true;
  const good = poolAt('poolC', 1450);
  const junk = { id: 'junk', x: 0, y: 0, w: 10, h: 10 }; // 不是药品池也不是气室
  const scene = fakeScene(inPool, hiddenPool, good, junk);
  const tube = new GasTube({ inId: 'poolA', outIds: ['poolB', 'junk', 'nope', 'poolC', 'poolC', 'poolA'] });
  const g = tube.geometry(scene);
  assert.ok(g, '至少 poolC 有效 → 有几何');
  assert.deepEqual(g.branches.map((x) => x.outId), ['poolC'], '只保留唯一有效输出');
  // 全无效 → null（装置不显示、不工作、不采集）
  const none = new GasTube({ inId: 'poolA', outIds: ['poolB', 'junk', 'poolA'] });
  assert.equal(none.geometry(scene), null);
  assert.equal(none.openBranches(scene).length, 0);
  assert.equal(none.captures(scene, { container: inPool }), false);
  // 输入池无效 → null
  assert.equal(new GasTube({ inId: 'nope', outIds: ['poolC'] }).geometry(scene), null);
});

test('阀门状态可被存档系统自动捕获（valves 是纯数据普通对象）', () => {
  const { scene, gtube } = twoPoolScene({ inSolutes: {} });
  gtube.valves = { poolB: true };
  const snap = Savepoint._captureScene(scene);
  gtube.valves.poolB = false; // 存档后：玩家把阀门关掉
  Savepoint._applyScene(scene, snap);
  assert.equal(gtube.valves.poolB, true, '读档后阀门开状态恢复');
  assert.deepEqual(gtube.outIds, ['poolB'], '输出端接线状态也随存档恢复');
});

test('旧 outId 兼容 + 新 outIds 优先；branchSource 是稳定的柱归属 token', () => {
  const legacy = new GasTube({ inId: 'poolA', outId: 'poolB' });
  assert.deepEqual(legacy.outIds, ['poolB'], '旧 outId → 单输出数组');
  assert.deepEqual(legacy.valves, {}, '旧配置无阀门');
  const dup = new GasTube({ inId: 'poolA', outIds: ['a', 'b', 'a'] });
  assert.deepEqual(dup.outIds, ['a', 'b'], '构造时去掉重复 id');
  // 单输出：整台装置就是唯一的气流归属（旧气泡柱 source === 导气管语义）
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const c = poolAt('poolC', 1450);
  const scene = fakeScene(inPool, b, c);
  legacy.geometry(scene);
  assert.equal(legacy.branchSource('poolB'), legacy, '单支路 → 归属=导气管自身');
  const multi = new GasTube({ inId: 'poolA', outIds: ['poolB', 'poolC'] });
  multi.geometry(scene);
  const s1 = multi.branchSource('poolB');
  const s2 = multi.branchSource('poolC');
  assert.ok(s1 && s2 && s1 !== s2, '多支路各有独立 token');
  assert.equal(multi.branchSource('poolB'), s1, '同一支路每次返回同一对象');
  assert.equal(multi.branchSource('poolC'), s2);
});

test('几何幂等：重复调用坐标不变；x/y/w/h 恒为整数包围盒', () => {
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const chamber = fakeChamber('chamber1', 1450, 520, 180, 120);
  const scene = fakeScene(inPool, b, chamber);
  const tube = new GasTube({
    inId: 'poolA', outIds: ['poolB', 'chamber1'], valves: { poolB: true, chamber1: false },
  });
  const snap = () => JSON.stringify({
    x: tube.x, y: tube.y, w: tube.w, h: tube.h,
    hood: tube._geom.hood,
    trunk: tube._geom.trunk,
    branches: tube._geom.branches.map((br) => ({ path: br.path, mouth: br.mouth, valve: br.valve })),
  });
  const g1 = tube.geometry(scene);
  const s1 = snap();
  const g2 = tube.geometry(scene);
  const s2 = snap();
  assert.equal(s2, s1, '几何必须幂等（_layout 每帧会被多次调用）');
  assert.ok(g1 && g2);
  for (const k of ['x', 'y', 'w', 'h']) assert.equal(Number.isInteger(tube[k]), true, `${k} 应为整数`);
  assert.ok(tube.x <= g1.hood.x && tube.y <= g1.hood.y, '包围盒包含罩体');
  assert.ok(tube.x + tube.w >= g1.hood.x + g1.hood.w);
  assert.ok(tube.y + tube.h >= g1.hood.y + g1.hood.h);
  for (const br of g1.branches) {
    if (!br.valve) continue;
    assert.ok(br.valve.x - br.valve.r >= tube.x && br.valve.x + br.valve.r <= tube.x + tube.w);
    assert.ok(br.valve.y - br.valve.r >= tube.y && br.valve.y + br.valve.r <= tube.y + tube.h);
  }
});

test('captures 语义不变：输入池内/池口外扩 8px 产气被采集，远端不被采集', () => {
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const scene = fakeScene(inPool, b);
  const tube = new GasTube({ inId: 'poolA', outId: 'poolB' });
  assert.equal(tube.captures(scene, { container: inPool }), true, '输入池自身反应');
  assert.equal(tube.captures(scene, { obj: inPool }), true, '输入池内物体产气');
  assert.equal(tube.captures(scene, { point: { x: inPool.x + 10, y: inPool.y - 4 } }), true, '池口贴合处');
  assert.equal(tube.captures(scene, { point: { x: inPool.x + inPool.w + 40, y: inPool.y } }), false, '池外远端');
  assert.equal(tube.captures(scene, null), false);
  // 未接线（无有效输出）→ 不采集，气体照常走正常管线
  assert.equal(new GasTube({ inId: 'poolA' }).captures(scene, { container: inPool }), false);
});

test('noteFlow 双参只点亮对应支路（管口气泡只在该支路冒）；旧单参点亮全部', () => {
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const c = poolAt('poolC', 1450);
  const bubbles = [];
  const scene = fakeScene(inPool, b, c);
  scene.addObject = (o) => { bubbles.push(o); return o; };
  const tube = new GasTube({ inId: 'poolA', outIds: ['poolB', 'poolC'] });
  const g = tube.geometry(scene);
  const mouthOf = (id) => g.branches.find((x) => x.outId === id).mouth;
  tube.noteFlow('poolB', 'H2');
  assert.ok(near(tube.flow, 1), '有气流 → 聚合强度 1');
  assert.equal(tube.gasId, 'H2');
  tube.update(0.2, scene); // 超过一个气泡间隔
  assert.ok(bubbles.length > 0, '有流量支路应冒管口气泡');
  assert.ok(bubbles.every((o) => o instanceof Bubble), '管口气泡是 Bubble');
  assert.ok(bubbles.some((o) => Math.hypot(o.x - mouthOf('poolB').x, o.y - mouthOf('poolB').y) < 30),
    'poolB 管口冒泡');
  assert.ok(!bubbles.some((o) => Math.hypot(o.x - mouthOf('poolC').x, o.y - mouthOf('poolC').y) < 30),
    '未点亮的 poolC 管口不冒泡');
  // 停止产气 → 逐支路衰减回灰色
  for (let i = 0; i < 40; i++) tube.update(TICK, scene);
  assert.ok(near(tube.flow, 0), `气流应衰减到 0：${tube.flow}`);
  // 旧单参 noteFlow(gasId)：视为整台装置流动 → 所有支路点亮（旧 Scene/旧测试兼容）
  bubbles.length = 0;
  tube.noteFlow('Cl2');
  assert.equal(tube.tintColor(), '#b8e01f', 'Cl2 黄绿');
  tube.update(0.2, scene);
  assert.ok(bubbles.some((o) => Math.hypot(o.x - mouthOf('poolB').x, o.y - mouthOf('poolB').y) < 30));
  assert.ok(bubbles.some((o) => Math.hypot(o.x - mouthOf('poolC').x, o.y - mouthOf('poolC').y) < 30),
    '旧单参 → 所有支路都冒泡');
});

test('渲染/编辑器命中冒烟：多支路 + 阀门 + 气室法兰不抛错；罩边/主干/支路/管口/阀门可选中', () => {
  const inPool = poolAt('poolA', 300);
  const b = poolAt('poolB', 1000);
  const chamber = fakeChamber('chamber1', 1450, 520, 180, 120);
  const scene = fakeScene(inPool, b, chamber);
  const tube = new GasTube({
    inId: 'poolA', outIds: ['poolB', 'chamber1'], valves: { poolB: true, chamber1: false },
  });
  const ctx = fakeCtx();
  const g = tube.geometry(scene);
  tube.noteFlow('poolB', 'CO2');
  tube.noteFlow('chamber1', 'Cl2');
  assert.doesNotThrow(() => tube.render(ctx, { scene, time: 0.7 }), '多支路+阀门+法兰渲染');
  assert.doesNotThrow(() => tube.render(ctx, { scene: null, time: 0.7 }), '无 scene 用缓存几何渲染');
  // 未接线：编辑器里画虚线占位框（render 不抛错）
  const empty = new GasTube({ x: 10, y: 20, w: 90, h: 70, id: 'tubeEmpty' });
  assert.doesNotThrow(() => empty.render(ctx, { scene, time: 0 }));
  // editorHit：罩边 / 主干 / 支路横段 / 管口 / 阀门 都能选中
  assert.equal(tube.editorHit(g.hood.x, g.hood.y + g.hood.h / 2), true, '罩边');
  assert.equal(tube.editorHit(g.trunk[0].x, g.trunk[0].y + 2), true, '主干');
  const br = g.branches[0];
  const midX = (br.path[0].x + br.path[1].x) / 2;
  assert.equal(tube.editorHit(midX, br.path[1].y), true, '支路横段');
  assert.equal(tube.editorHit(br.valve.x, br.valve.y), true, '阀门');
  assert.equal(tube.editorHit(g.branches[1].mouth.x, g.branches[1].mouth.y), true, '气室管口');
  // 罩子内部空间留给药品池选中（不抢）
  assert.equal(tube.editorHit(inPool.x + inPool.w / 2, inPool.y + 20), false, '罩内/池内不抢选中');
});

