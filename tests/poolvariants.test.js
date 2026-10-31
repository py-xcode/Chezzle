// ============================================================================
// 药品池变种（电解池/加热池/高温池）+ 通电条件 + 电解规则测试
// ----------------------------------------------------------------------------
// 覆盖：
//   1) 引擎假 env 水电解（H2:O2 = 4:32，质量守恒；仅加热不反应）
//   2) 食盐水电解：onGas 捕获比例、NaOH 生成、不同时电解水（无 O2）
//   3) 食盐水电解 skipAbsorb：Cl2 直接逸出进大气，不被同池 NaOH 尾气吸收
//   4) CuCl2 电解：Cu 析出 + Cl2 进大气；无 electric 不反应
//   5) Scene + 电解池集成；普通 Pool 同条件不反应
//   6) 加热池 Ca(HCO3)2 受热分解；普通 Pool 不反应
//   7) 高温池 CaCO3 高温分解出 CaO；加热池（heat）不满足 highTemp 不分解
//   8) 开关控制：常开 / switchId 绑定 Switch 的 effectiveOpen
//   9) 条件接线：Scene.conditionsFor 给池自身与浸在池内的物块对应条件
//  10) 池变种契约（继承/标记/hoverLabel）与渲染冒烟
//  11) 电解电极几何 electrodeLayout 与产气点位 gasOriginPoint（H2 左阴极 / O2、Cl2 右阳极）
//  12) 铭牌可读性：世界尺寸 52~64×18~22（窄池 ≥44×16）、文字/字号 ≥13px、开/关态都可见
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChemistryEngine } from '../src/chem/engine.js';
import { Solution, SolutionMaterial } from '../src/chem/solution.js';
import { Atmosphere } from '../src/chem/atmosphere.js';
import { ELECTROLYSIS_RULES } from '../src/chem/rules.js';
import { Scene } from '../src/core/scene.js';
import { Floor } from '../src/objects/floor.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { Switch } from '../src/objects/switch.js';
import { VariantPool, ElectrolysisPool, HeatingPool, HighTempPool } from '../src/objects/poolvariants.js';

const TICK = 1 / 30;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** 引擎假 env（大气默认无成分：产气质量 = 实际产出量，便于断言） */
function makeEnv(cond = {}, opts = {}) {
  const { atmosphere = new Atmosphere({ totalAir: 0, init: {} }), ...rest } = opts;
  const env = {
    atmosphere,
    conditions: { heat: false, highTemp: false, electric: false, ignited: false, light: false, hasCatalyst: () => false, ...cond },
    globalIgnited: false,
    emitted: [],
    emit(p) { env.emitted.push(p); },
    ...rest,
  };
  return env;
}

function runSelf(engine, mat, env, ticks = 60) {
  for (let i = 0; i < ticks; i++) engine.reactSelf(mat, TICK, env, { skipDissolution: true });
}

function sumEmitted(env, id, phase) {
  return env.emitted.filter((e) => e.id === id && (!phase || e.phase === phase)).reduce((s, e) => s + e.mass, 0);
}

/** 平地上两个坑位（300..560、1000..1260）的场景，可放两个药品池 */
function poolScene() {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  scene.addObject(new Floor({ x: -200, y: 720, w: 500, h: 80 }));
  scene.addObject(new Floor({ x: 560, y: 720, w: 440, h: 80 }));
  scene.addObject(new Floor({ x: 1260, y: 720, w: 2000, h: 80 }));
  scene.status = 'running';
  return scene;
}

function run(scene, n) {
  for (let i = 0; i < n; i++) scene.step(TICK);
}

/** 假 canvas 上下文（同 tests/gaschamber.test.js：任意方法 noop，渐变返回 addColorStop 桩） */
function fakeCtx() {
  return new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      return () => {};
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

/** 记录型假 ctx：记录 fillText（含当时 font），用于断言铭牌文字与屏幕最小字号 */
function recordingCtx() {
  const state = { canvas: null };
  const calls = [];
  const ctx = new Proxy(state, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      if (prop === 'getTransform') return () => null; // 视为屏幕缩放 1（世界 px = 屏幕 px）
      return (...args) => { calls.push({ prop, args, font: t.font }); };
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  ctx._calls = calls;
  return ctx;
}

// ---- 1. 水电解（engine 假 env） ---------------------------------------------
test('水电解：electric 条件才产 H2/O2（质量比 4:32），水减少量 = 气体总质量；仅加热不产气', () => {
  const engine = new ChemistryEngine();
  const mat = new SolutionMaterial(new Solution({ volume: 100, water: 200 }));
  const env = makeEnv({ electric: true });
  const water0 = mat.solution.water;
  runSelf(engine, mat, env);
  const h2 = env.atmosphere.mass('H2');
  const o2 = env.atmosphere.mass('O2');
  assert.ok(h2 > 0.5, `应产出 H2，实际 ${h2.toFixed(3)}g`);
  assert.ok(near(o2, h2 * 8, 1e-6), `H2:O2 质量比应为 4:32（H2=${h2.toFixed(3)} O2=${o2.toFixed(3)}）`);
  const consumed = water0 - mat.solution.water;
  assert.ok(near(consumed, h2 + o2, 1e-6), `水减少量应等于气体总质量（水-${consumed.toFixed(3)} vs 气+${(h2 + o2).toFixed(3)}）`);

  // 仅加热（无 electric）→ 水不分解
  const mat2 = new SolutionMaterial(new Solution({ volume: 100, water: 200 }));
  const env2 = makeEnv({ heat: true });
  runSelf(engine, mat2, env2);
  assert.equal(env2.atmosphere.mass('H2'), 0, '仅加热不应产 H2');
  assert.equal(env2.atmosphere.mass('O2'), 0, '仅加热不应产 O2');
  assert.equal(mat2.solution.water, 200, '仅加热水不应减少');
});

// ---- 2. 食盐水电解：比例 + 不与水规则同时跑 ---------------------------------
test('电解食盐水：NaOH 增加、H2/Cl2 按 2:71、无 O2（电解液优先于水）', () => {
  const engine = new ChemistryEngine();
  const mat = new SolutionMaterial(new Solution({ volume: 200, solutes: { NaCl: 100 }, water: 100 }));
  const captured = {};
  const env = makeEnv({ electric: true }, {
    onGas: (id, mass) => { captured[id] = (captured[id] ?? 0) + mass; return mass; },
  });
  const nacl0 = mat.solution.mass('NaCl');
  runSelf(engine, mat, env);

  assert.ok(captured.H2 > 0.2, `应产 H2，实际 ${captured.H2?.toFixed(3)}g`);
  assert.ok(captured.Cl2 > 1, `应产 Cl2，实际 ${captured.Cl2?.toFixed(3)}g`);
  assert.ok(near(captured.Cl2, (captured.H2 * 71) / 2, 1e-6), `H2:Cl2 质量比应为 2:71（H2=${captured.H2.toFixed(3)} Cl2=${captured.Cl2.toFixed(3)}）`);
  assert.equal(captured.O2 ?? 0, 0, '有电解液时同刻不应电解水（无 O2）');

  // 2NaCl + 2H2O → 2NaOH + H2 + Cl2：消耗 NaCl 与生成 NaOH 的质量比 117:80
  const consumedNaCl = nacl0 - mat.solution.mass('NaCl');
  const naoh = mat.solution.mass('NaOH');
  assert.ok(naoh > 1, `应生成 NaOH，实际 ${naoh.toFixed(3)}g`);
  assert.ok(near(naoh, (consumedNaCl * 80) / 117, 1e-6), `NaOH 与消耗 NaCl 应满足计量比（NaCl-${consumedNaCl.toFixed(3)} → NaOH ${naoh.toFixed(3)}）`);
  // 气体全部被 onGas 截留 → 不进大气
  assert.equal(env.atmosphere.mass('H2'), 0);
  assert.equal(env.atmosphere.mass('Cl2'), 0);
});

test('电解 BaCl2 + NaOH 混合液：阴极 H2、阳极 Cl2、留 Ba(OH)2，不应只剩水电解 H2/O2', () => {
  const engine = new ChemistryEngine();
  const mat = new SolutionMaterial(new Solution({ volume: 250, solutes: { BaCl2: 60, NaOH: 40 }, water: 220 }));
  const env = makeEnv({ electric: true });
  const o2Before = env.atmosphere.mass('O2');
  runSelf(engine, mat, env, 180);
  const h2 = env.atmosphere.mass('H2');
  const cl2 = env.atmosphere.mass('Cl2');
  assert.ok(h2 > 0.2, `应产 H2，实际 ${h2.toFixed(3)}g`);
  assert.ok(cl2 > 0.2, `应产 Cl2（不是只有水电解的 O2），实际 ${cl2.toFixed(3)}g`);
  assert.ok(Math.abs(cl2 - h2 * 35.5) < 1e-6, `H2:Cl2 质量比应为 2:71（H2=${h2.toFixed(3)} Cl2=${cl2.toFixed(3)}）`);
  assert.ok(near(env.atmosphere.mass('O2'), o2Before, 1e-9), '电解质优先时不应同时电解水放 O2');
  assert.ok(mat.solution.mass('BaCl2') < 59, 'BaCl2 应被消耗');
  assert.ok(mat.solution.mass('Ba(OH)2') > 0.1, '应生成 Ba(OH)2');
});

test('Scene 电解池：BaCl2 + NaOH 混合液产 H2/Cl2，不产 O2', () => {
  const scene = poolScene();
  const ep = new ElectrolysisPool({
    x: 300, y: 700, w: 260, h: 60, volume: 250, water: 220,
    solutes: { BaCl2: 60, NaOH: 40 }, id: 'ep',
  });
  scene.addObject(ep);
  const o2Before = scene.atmosphere.mass('O2');
  run(scene, 180);
  assert.ok(scene.atmosphere.mass('Cl2') > 0.2, '应放出 Cl2');
  assert.ok(scene.atmosphere.mass('H2') > 0.2, '应放出 H2');
  assert.ok(near(scene.atmosphere.mass('O2'), o2Before, 1e-9), '不应同时生成 O2');
});

// ---- 3. skipAbsorb：阳极 Cl2 直接逸出，不被同池新生成的 NaOH 吃掉 ------------
test('电解食盐水 skipAbsorb：Cl2 进大气、不被 NaOH 尾气吸收（无 NaClO），比例不变', () => {
  const engine = new ChemistryEngine();
  const mat = new SolutionMaterial(new Solution({ volume: 200, solutes: { NaCl: 100 }, water: 100 }));
  const env = makeEnv({ electric: true }); // 不设 onGas → 气体走正常管线（含碱吸收）
  runSelf(engine, mat, env);

  const cl2 = env.atmosphere.mass('Cl2');
  const h2 = env.atmosphere.mass('H2');
  assert.ok(cl2 > 1, `Cl2 应进入大气，实际 ${cl2.toFixed(3)}g`);
  assert.ok(near(cl2, (h2 * 71) / 2, 1e-6), `H2:Cl2 比例仍应为 2:71（H2=${h2.toFixed(3)} Cl2=${cl2.toFixed(3)}）`);
  assert.equal(mat.solution.mass('NaClO'), 0, 'Cl2 不应被同池 NaOH 吸收生成 NaClO');
  assert.ok(mat.solution.mass('NaOH') > 1, 'NaOH 应留在溶液中');
  assert.equal(env.atmosphere.mass('O2'), 0, '有电解液时同刻不应电解水（无 O2）');
});

// ---- 4. CuCl2 电解（engine） -------------------------------------------------
test('电解 CuCl2：Cu 析出为沉淀、Cl2 进大气；无 electric 两者都为 0', () => {
  const engine = new ChemistryEngine();
  const mat = new SolutionMaterial(new Solution({ volume: 200, solutes: { CuCl2: 100 }, water: 100 }));
  const env = makeEnv({ electric: true });
  runSelf(engine, mat, env);
  const cu = sumEmitted(env, 'Cu', 'precipitate');
  const cl2 = env.atmosphere.mass('Cl2');
  assert.ok(cu > 0.5, `应析出 Cu，实际 ${cu.toFixed(3)}g`);
  assert.ok(cl2 > 0.5, `应放出 Cl2，实际 ${cl2.toFixed(3)}g`);
  const consumed = 100 - mat.solution.mass('CuCl2');
  assert.ok(near(cu + cl2, consumed, 1e-6), `Cu+Cl2 质量应等于消耗的 CuCl2（${(cu + cl2).toFixed(3)} vs ${consumed.toFixed(3)}）`);
  assert.ok(near(cu, (consumed * 64) / 135, 1e-6), `Cu 比例应为 64/135（实际 ${cu.toFixed(3)}）`);

  // 无 electric → 不电解（其余内置规则也不动 CuCl2 溶液）
  const mat2 = new SolutionMaterial(new Solution({ volume: 200, solutes: { CuCl2: 100 }, water: 100 }));
  const env2 = makeEnv();
  runSelf(engine, mat2, env2);
  assert.equal(sumEmitted(env2, 'Cu'), 0, '无电不析铜');
  assert.equal(env2.atmosphere.mass('Cl2'), 0, '无电不产氯气');
  assert.equal(mat2.solution.mass('CuCl2'), 100, '无电 CuCl2 不消耗');
});

// ---- 5. Scene + 电解池集成（普通池对照） -------------------------------------
test('Scene 电解池：CuCl2 溶液电解（Cu 沉淀/Cl2 入大气/CuCl2 减少），普通池同条件不反应', () => {
  const scene = poolScene();
  const ep = new ElectrolysisPool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { CuCl2: 100 }, id: 'ep' });
  const plain = new Pool({ x: 1000, y: 720, w: 260, h: 60, volume: 300, solutes: { CuCl2: 100 }, id: 'plain' });
  scene.addObject(ep);
  scene.addObject(plain);
  const o2Before = scene.atmosphere.mass('O2');
  run(scene, 60);

  assert.ok((ep.precipitates.get('Cu') ?? 0) > 0.5, `电解池应析出 Cu，实际 ${(ep.precipitates.get('Cu') ?? 0).toFixed(3)}g`);
  assert.ok(scene.atmosphere.mass('Cl2') > 0.5, `应放出 Cl2 进大气，实际 ${scene.atmosphere.mass('Cl2').toFixed(3)}g`);
  assert.ok(ep.solution.mass('CuCl2') < 99, `电解池 CuCl2 应减少，剩 ${ep.solution.mass('CuCl2').toFixed(3)}g`);
  // 电解液优先：同刻不电解水 → 大气 O2 不增加
  assert.ok(near(scene.atmosphere.mass('O2'), o2Before, 1e-9), '有 CuCl2 时不应同时电解水（O2 不增加）');

  // 同场景普通药品池（无变种 → 无 electric）：不反应
  assert.equal(plain.precipitates.get('Cu') ?? 0, 0, '普通池不应析铜');
  assert.equal(plain.solution.mass('CuCl2'), 100, '普通池 CuCl2 不应消耗');
});

// ---- 6. 加热池：Ca(HCO3)2 受热分解（普通池对照） -----------------------------
test('Scene 加热池：Ca(HCO3)2 溶液受热分解出 CaCO3 沉淀 + CO2；普通池不反应', () => {
  const scene = poolScene();
  const hp = new HeatingPool({ x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { 'Ca(HCO3)2': 60 }, id: 'hp' });
  const plain = new Pool({ x: 1000, y: 720, w: 260, h: 60, volume: 300, solutes: { 'Ca(HCO3)2': 60 }, id: 'plain' });
  scene.addObject(hp);
  scene.addObject(plain);
  run(scene, 60);

  assert.ok((hp.precipitates.get('CaCO3') ?? 0) > 1, `加热池应分解出 CaCO3 沉淀，实际 ${(hp.precipitates.get('CaCO3') ?? 0).toFixed(3)}g`);
  assert.ok(scene.atmosphere.mass('CO2') > 0.5, `应放出 CO2，实际 ${scene.atmosphere.mass('CO2').toFixed(3)}g`);
  assert.ok(hp.solution.mass('Ca(HCO3)2') < 55, `加热池 Ca(HCO3)2 应减少，剩 ${hp.solution.mass('Ca(HCO3)2').toFixed(3)}g`);

  // 普通池（无 heat 条件）：Ca(HCO3)2 稳定，不分解
  assert.equal(plain.precipitates.get('CaCO3') ?? 0, 0, '普通池不应有 CaCO3 沉淀');
  assert.equal(plain.solution.mass('Ca(HCO3)2'), 60, '普通池 Ca(HCO3)2 不应减少');
});

// ---- 7. 高温池：CaCO3 高温分解出 CaO；加热池不分解 ---------------------------
test('Scene 高温池：CaCO3 沉淀高温分解（CaO 沉淀 + CO2）；加热池（heat）不满足 highTemp', () => {
  const scene = poolScene();
  // 干池（water=0）：池内有 CaCO3 沉淀但无水；避免 CaO 立即水合成 Ca(OH)2
  //（CaO + H2O 是普通成对规则，有水时 CaO 存不住——与灯上高温分解同理）
  const hot = new HighTempPool({ x: 300, y: 720, w: 260, h: 60, volume: 200, water: 0, id: 'hot' });
  hot.addPrecipitate('CaCO3', 40);
  const heat = new HeatingPool({ x: 1000, y: 720, w: 260, h: 60, volume: 200, water: 0, id: 'heat' });
  heat.addPrecipitate('CaCO3', 40);
  scene.addObject(hot);
  scene.addObject(heat);
  run(scene, 60);

  const cao = hot.precipitates.get('CaO') ?? 0;
  assert.ok(cao > 1, `高温池应分解出 CaO，实际 ${cao.toFixed(3)}g`);
  assert.ok((hot.precipitates.get('CaCO3') ?? 0) < 39, `高温池 CaCO3 应减少，剩 ${(hot.precipitates.get('CaCO3') ?? 0).toFixed(3)}g`);
  assert.ok(scene.atmosphere.mass('CO2') > 0.5, `应放出 CO2，实际 ${scene.atmosphere.mass('CO2').toFixed(3)}g`);

  // 加热池只有 heat 条件 → highTemp 规则不满足（CaCO3 不分解）
  assert.equal(heat.precipitates.get('CaO') ?? 0, 0, '加热池不应分解出 CaO');
  assert.ok(near(heat.precipitates.get('CaCO3') ?? 0, 40, 1e-9), '加热池 CaCO3 应保持不变');
});

// ---- 8. 开关控制：常开 / 绑定 Switch 的有效开启态 ----------------------------
test('开关控制：switchId 留空常开；绑定 Switch 时 _isOpenTarget 为假不反应、为真才反应', () => {
  const scene = poolScene();
  const ep = new ElectrolysisPool({
    x: 300, y: 720, w: 260, h: 60, volume: 300, solutes: { CuCl2: 100 }, switchId: 'sw1', id: 'ep',
  });
  const sw = new Switch({ x: 700, y: 680, w: 40, h: 22, id: 'sw1' });
  sw._isOpenTarget = () => false; // 测试用：手动控制"开启条件"
  scene.addObject(ep);
  scene.addObject(sw);
  run(scene, 1); // 让开关按检测结果刷新 open
  assert.equal(scene.conditionsFor(ep).electric, false, '开关关 → 池不提供通电条件');
  run(scene, 60);
  assert.equal(ep.precipitates.get('Cu') ?? 0, 0, '开关关 → 不电解（无 Cu）');
  assert.equal(ep.solution.mass('CuCl2'), 100, '开关关 → CuCl2 不消耗');
  assert.equal(ep._activeNow, false, 'update 应记录关闭态（渲染用）');

  sw._isOpenTarget = () => true;
  run(scene, 60);
  assert.equal(scene.conditionsFor(ep).electric, true, '开关开 → 池提供通电条件');
  assert.ok((ep.precipitates.get('Cu') ?? 0) > 0.5, `开关开 → 应电解析铜，实际 ${(ep.precipitates.get('Cu') ?? 0).toFixed(3)}g`);
  assert.equal(ep._activeNow, true, 'update 应记录开启态（渲染用）');

  // 常开：switchId 留空 → 始终生效；指向不存在的开关 → 不生效
  const always = new ElectrolysisPool({ x: 0, y: 0, w: 100, h: 40, id: 'always' });
  assert.equal(always.active(scene), true, 'switchId 留空 = 常开');
  const dangling = new ElectrolysisPool({ x: 0, y: 0, w: 100, h: 40, switchId: 'nope', id: 'dangling' });
  assert.equal(dangling.active(scene), false, '绑定的开关不存在 → 不生效');
});

// ---- 9. 条件接线：pool 自身 / 浸在池内的物块 ---------------------------------
test('Scene.conditionsFor：变种池自身与浸在池内的物块获得对应 electric/heat/highTemp；普通池不带', () => {
  const scene = new Scene({ worldW: 1600, worldH: 800 });
  const ep = new ElectrolysisPool({ x: 300, y: 700, w: 200, h: 60, volume: 100, id: 'ep' });
  const hp = new HeatingPool({ x: 600, y: 700, w: 200, h: 60, volume: 100, id: 'hp' });
  const hot = new HighTempPool({ x: 900, y: 700, w: 200, h: 60, volume: 100, id: 'hot' });
  const plain = new Pool({ x: 1200, y: 700, w: 200, h: 60, volume: 100, id: 'plain' });
  scene.addObject(ep);
  scene.addObject(hp);
  scene.addObject(hot);
  scene.addObject(plain);
  // 浸在池内（innerRect 内）的物块
  const inEp = new Block({ x: 340, y: 720, w: 20, h: 20, substance: 'Fe' });
  const inHp = new Block({ x: 640, y: 720, w: 20, h: 20, substance: 'Fe' });
  const inHot = new Block({ x: 940, y: 720, w: 20, h: 20, substance: 'Fe' });
  const inPlain = new Block({ x: 1240, y: 720, w: 20, h: 20, substance: 'Fe' });
  for (const b of [inEp, inHp, inHot, inPlain]) scene.addObject(b);

  const cEp = scene.conditionsFor(ep);
  assert.equal(cEp.electric, true, '电解池应提供 electric');
  assert.equal(cEp.heat, false);
  assert.equal(cEp.highTemp, false);
  assert.equal(scene.conditionsFor(inEp).electric, true, '浸在电解池内的物块应获得 electric');

  const cHp = scene.conditionsFor(hp);
  assert.equal(cHp.heat, true, '加热池应提供 heat');
  assert.equal(cHp.electric, false);
  assert.equal(cHp.highTemp, false);
  assert.equal(scene.conditionsFor(inHp).heat, true, '浸在加热池内的物块应获得 heat');

  const cHot = scene.conditionsFor(hot);
  assert.equal(cHot.highTemp, true, '高温池应提供 highTemp');
  assert.equal(cHot.electric, false);
  assert.equal(scene.conditionsFor(inHot).highTemp, true, '浸在高温池内的物块应获得 highTemp');

  const cPlain = scene.conditionsFor(plain);
  assert.equal(cPlain.electric, false, '普通池不提供 electric');
  assert.equal(cPlain.heat, false, '普通池不提供 heat');
  assert.equal(cPlain.highTemp, false, '普通池不提供 highTemp');
  assert.equal(scene.conditionsFor(inPlain).electric, false, '浸在普通池内的物块也不带条件');

  // update 会刷新渲染用的 _activeNow
  scene.step(TICK);
  assert.equal(ep._activeNow, true);
  assert.equal(hp._activeNow, true);
  assert.equal(hot._activeNow, true);
});

// ---- 10. 池变种契约 + 渲染冒烟 ----------------------------------------------
test('池变种契约：继承 Pool（isPool 保持 true）、isVariantPool/mode/hoverLabel；render 冒烟不抛错', () => {
  const cases = [
    [ElectrolysisPool, 'electric', '电解池'],
    [HeatingPool, 'heat', '加热池'],
    [HighTempPool, 'highTemp', '高温池'],
  ];
  for (const [Cls, mode, label] of cases) {
    const p = new Cls({ x: 100, y: 100, w: 120, h: 60, volume: 100, solutes: { NaCl: 10 }, water: 50 });
    assert.ok(p instanceof Pool, `${label} 应继承 Pool`);
    assert.ok(p instanceof VariantPool);
    assert.equal(p.isPool, true, `${label} 的 isPool 应保持 true（导气管/提取器兼容）`);
    assert.equal(p.isVariantPool, true);
    assert.equal(p.mode, mode);
    assert.equal(p.hoverLabel, label);
    assert.equal(p.switchId, '', 'switchId 默认空 = 常开');
    assert.equal(p.active(null), true, '常开池无 scene 也生效');
  }
  // 元素顺序：电解液规则在前、水规则在最后（reactSelf 互斥循环依赖此顺序）
  assert.equal(ELECTROLYSIS_RULES.length, 7);
  assert.equal(ELECTROLYSIS_RULES[ELECTROLYSIS_RULES.length - 1].reactants[0].id, 'H2O', '水规则应在最后');
  for (const rule of ELECTROLYSIS_RULES.slice(0, -1)) {
    assert.equal(rule.skipAbsorb, true, '电解液规则的阳极气体应跳过本池碱吸收');
    assert.equal(rule.condition.electric, true);
  }

  // 渲染冒烟：假 ctx / 仅 opts.time / 带 scene 均不抛错；开关态切换也不抛错
  const ctx = fakeCtx();
  const scene = new Scene({ worldW: 800, worldH: 600 });
  for (const [Cls] of cases) {
    const p = new Cls({ x: 100, y: 100, w: 120, h: 60, volume: 100, solutes: { NaCl: 10 }, water: 50 });
    scene.addObject(p);
    assert.doesNotThrow(() => p.render(ctx, { time: 0 }), '仅 opts.time 渲染');
    assert.doesNotThrow(() => p.render(ctx, {}), '空 opts 渲染');
    assert.doesNotThrow(() => p.render(ctx, { time: 1.2, scene }), '带 scene 的 opts 渲染');
    p.update(TICK, scene);
    p._activeNow = true; // 开启态特效
    assert.doesNotThrow(() => p.render(ctx, { time: 1.2, scene }), '开启态特效渲染');
    p._activeNow = false; // 关闭态（电极灰暗/无特效）
    assert.doesNotThrow(() => p.render(ctx, { time: 1.2, scene }), '关闭态渲染');
  }
});

// ---- 11. 电解电极几何 / 产气点位映射（Scene._gasPlume 定点冒泡用） ------------
test('electrodeLayout/gasOriginPoint：H2→左阴极、O2/Cl2→右阳极，点位在池内水下；其它气体 null', () => {
  // 正常尺寸电解池（innerRect 放得下两根电极）
  const ep = new ElectrolysisPool({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NaCl: 80 }, water: 150 });
  const layout = ep.electrodeLayout();
  assert.ok(layout, '正常尺寸电解池应返回电极几何');
  assert.equal(layout.left.polarity, '-', '左 = 阴极(−)');
  assert.equal(layout.right.polarity, '+', '右 = 阳极(+)');
  assert.ok(layout.left.x < layout.right.x, '阴极在左、阳极在右');
  assert.ok(layout.topY < layout.botY, '电极上端应高于下端');
  const r = ep.innerRect();
  for (const [side, e] of [['left', layout.left], ['right', layout.right]]) {
    assert.ok(e.x > r.x && e.x < r.x + r.w, `${side} 电极 x 应在池内`);
    assert.ok(e.top < e.bottom);
    assert.ok(e.underwater.y > layout.waterY, `${side} 取气点应在水面以下`);
    assert.ok(e.underwater.y > r.y && e.underwater.y < r.y + r.h, `${side} 取气点应在池内（纵向）`);
    assert.ok(near(e.underwater.x, e.x), `${side} 取气点应在该电极的 x 上`);
  }
  // 气体 → 电极映射：H2 阴极（左）、O2/Cl2 阳极（右）、其它不指定
  const h2 = ep.gasOriginPoint('H2');
  const cl2 = ep.gasOriginPoint('Cl2');
  const o2 = ep.gasOriginPoint('O2');
  assert.ok(h2 && near(h2.x, layout.left.underwater.x) && near(h2.y, layout.left.underwater.y), 'H2 → 左阴极');
  assert.ok(cl2 && near(cl2.x, layout.right.underwater.x) && near(cl2.y, layout.right.underwater.y), 'Cl2 → 右阳极');
  assert.ok(o2 && near(o2.x, layout.right.underwater.x) && near(o2.y, layout.right.underwater.y), 'O2 → 右阳极');
  assert.equal(ep.gasOriginPoint('CO2'), null, '其它气体不指定电极');
  assert.equal(ep.gasOriginPoint('H2CO3'), null);

  // 加热池/高温池没有电解电极 → 不指定产气点
  for (const Cls of [HeatingPool, HighTempPool]) {
    const p = new Cls({ x: 0, y: 0, w: 260, h: 60, volume: 200, water: 100 });
    assert.equal(p.electrodeLayout(), null, `${p.hoverLabel} 无电解电极`);
    assert.equal(p.gasOriginPoint('H2'), null);
    assert.equal(p.gasOriginPoint('Cl2'), null);
  }

  // 池太小放不下装置 → null（与渲染门槛一致）
  const tiny = new ElectrolysisPool({ x: 0, y: 0, w: 40, h: 20, volume: 20, water: 10 });
  assert.equal(tiny.electrodeLayout(), null, '过小的池不返回电极几何');
  assert.equal(tiny.gasOriginPoint('H2'), null);

  // 尺寸自适应：不同尺寸下点位仍在池内、水面以下
  for (const [w, h, vol] of [[140, 50, 120], [400, 90, 500], [100, 40, 90]]) {
    const p = new ElectrolysisPool({ x: 100, y: 500, w, h, volume: vol, water: vol });
    const L = p.electrodeLayout();
    assert.ok(L, `${w}×${h} 的池应能放电极`);
    const ir = p.innerRect();
    for (const e of [L.left, L.right]) {
      assert.ok(e.underwater.x > ir.x && e.underwater.x < ir.x + ir.w, `${w}×${h}：取气点 x 在池内`);
      assert.ok(e.underwater.y > L.waterY && e.underwater.y < ir.y + ir.h, `${w}×${h}：取气点在水下且在池内`);
    }
    // 满液面：waterY = 池口；H2 仍映射到左侧
    assert.ok(near(p.gasOriginPoint('H2').x, L.left.underwater.x), `${w}×${h}：H2 仍在左阴极`);
  }

  // 极小的池渲染不抛错（放不下装置 → 只画池沿/铭牌）
  const ctx = fakeCtx();
  assert.doesNotThrow(() => tiny.render(ctx, { time: 0.5 }), '极小电解池渲染不应抛错');
});

// ---- 12. 铭牌可读性（真实关卡尺度看不清 → 放大+亮字回归） -------------------
test('铭牌可读性：世界尺寸约52~64×18~22（窄池≥44×16）、文字清晰且字号≥13px、开/关态都有牌', () => {
  const cases = [
    [ElectrolysisPool, '电解'],
    [HeatingPool, '加热'],
    [HighTempPool, '高温'],
  ];
  const scaleCtx = fakeCtx(); // 无变换 → 屏幕缩放 1（世界 px = 屏幕 px）
  for (const [Cls, label] of cases) {
    const p = new Cls({ x: 300, y: 700, w: 260, h: 60, volume: 300, solutes: { NaCl: 20 }, water: 200 });
    const r = p.innerRect();
    const nl = p._nameplateLayout(scaleCtx, r);
    assert.ok(nl, `${p.hoverLabel} 应有铭牌布局`);
    assert.equal(nl.text, label, '铭牌文字');
    assert.ok(nl.w >= 52 && nl.w <= 64, `${p.hoverLabel} 铭牌世界宽应约52~64（实际 ${nl.w}）`);
    assert.ok(nl.h >= 18 && nl.h <= 22, `${p.hoverLabel} 铭牌世界高应约18~22（实际 ${nl.h}）`);
    // 屏幕最小字号 13~14px（vscale=1 时世界字号即屏幕像素）
    assert.ok(nl.fs >= 13.4 && nl.fs <= 14.1, `${p.hoverLabel} 屏幕字号应 13~14px（实际 ${nl.fs.toFixed(2)}）`);
    // 位置：池口上方（不压液体/池底栅排/池底公式标签）
    assert.ok(nl.y < r.y, `${p.hoverLabel} 铭牌应在池口上方`);
    if (p.mode === 'electric') {
      const el = p.electrodeLayout();
      assert.ok(el && nl.y + nl.h <= el.topY, '电解铭牌应在电极顶端上方（避开电极/跨接电缆/绝缘座）');
    } else {
      assert.ok(nl.y + nl.h < r.y + 12, `${p.hoverLabel} 铭牌只轻微骑池沿、不深入液体`);
      assert.ok(nl.x > r.x && nl.x + nl.w < r.x + r.w, `${p.hoverLabel} 铭牌水平应在池口内（避开两侧卡箍）`);
    }

    // 渲染：确实画出铭牌文字，且字号≥13（clearText 实际用的 font）
    const ctx = recordingCtx();
    p._activeNow = true;
    p.render(ctx, { time: 0.8 });
    const hit = ctx._calls.find((c) => c.prop === 'fillText' && c.args[0] === label);
    assert.ok(hit, `${p.hoverLabel} 渲染时应画出铭牌文字「${label}」`);
    const px = parseFloat(String(hit.font).match(/([\d.]+)px/)?.[1] ?? '0');
    assert.ok(px >= 13, `${p.hoverLabel} 铭牌渲染字号应≥13px（实际 ${hit.font}）`);
  }

  // 窄池：等比缩小但不小于 44×16，文字仍完整可读
  const narrow = new HeatingPool({ x: 0, y: 0, w: 60, h: 40, volume: 60, water: 30 });
  const nlNarrow = narrow._nameplateLayout(scaleCtx, narrow.innerRect());
  assert.ok(nlNarrow.w >= 44, `窄池铭牌宽不小于 44（实际 ${nlNarrow.w}）`);
  assert.ok(nlNarrow.h >= 16, `窄池铭牌高不小于 16（实际 ${nlNarrow.h}）`);
  assert.ok(nlNarrow.fs >= 13.4, '窄池文字仍按屏幕最小字号补足');
  const narrowCtx = recordingCtx();
  narrow._activeNow = false;
  assert.doesNotThrow(() => narrow.render(narrowCtx, { time: 0.3 }), '窄池渲染不抛错');

  // 关态：牌面/文字保留（灰暗但可读）——关态渲染同样画出对应文字
  for (const [Cls, label] of cases) {
    const p = new Cls({ x: 0, y: 0, w: 260, h: 60, volume: 300, solutes: { NaCl: 20 }, water: 200 });
    const ctx = recordingCtx();
    p._activeNow = false;
    p.render(ctx, { time: 0.4 });
    const offHit = ctx._calls.find((c) => c.prop === 'fillText' && c.args[0] === label);
    assert.ok(offHit, `${p.hoverLabel} 关态也应画出铭牌文字`);
  }
});

