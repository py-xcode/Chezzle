// ============================================================================
// 化学引擎单元测试（node:test，零依赖）
// 覆盖：计量与质量守恒、双置换判定、限域试剂、速率与相位、条件门控、
//       活动性序、燃烧与大气、分解还原、溶解、碳酸特例、酸碱气体吸收。
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChemistryEngine } from '../src/chem/engine.js';
import { Solution, SolutionMaterial } from '../src/chem/solution.js';
import { Atmosphere } from '../src/chem/atmosphere.js';
import { buildSalt, solubilityOf, getSubstance } from '../src/chem/substances.js';

// ---- 测试用具 ---------------------------------------------------------------
const TICK = 1 / 30;

/** 简单的固体材料（玩家/物块/沉淀块），实现 Material 接口 */
class Solid {
  constructor(compo, opts = {}) {
    this.m = new Map(Object.entries(compo));
    this.phase = 'solid';
    this.isPlayer = !!opts.isPlayer;
    this.substance = opts.substance ?? null; // 玩家核心物质（=血量，不溶解）
    this.container = opts.container ?? null;
  }
  avail(id) { return this.m.get(id) ?? 0; }
  consume(id, mass) {
    const cur = this.m.get(id) ?? 0;
    const r = Math.min(cur, mass);
    const n = cur - r;
    if (n <= 1e-9) this.m.delete(id);
    else this.m.set(id, n);
    return r;
  }
  add(id, mass) { this.m.set(id, (this.m.get(id) ?? 0) + mass); }
  ids() { return [...this.m.keys()]; }
}

function makeEnv(cond = {}, opts = {}) {
  const { atmosphere = new Atmosphere(), ...rest } = opts;
  const env = {
    atmosphere,
    conditions: { heat: false, highTemp: false, ignited: false, hasCatalyst: () => false, ...cond },
    globalIgnited: false,
    emitted: [],
    emit(p) { env.emitted.push(p); },
    ...rest,
  };
  return env;
}

function runPair(engine, a, b, env, ticks = 20000) {
  for (let i = 0; i < ticks; i++) engine.reactPair(a, b, TICK, env);
}

function runSelf(engine, m, env, ticks = 20000) {
  for (let i = 0; i < ticks; i++) engine.reactSelf(m, TICK, env);
}

function sumEmitted(env, id, phase) {
  return env.emitted.filter((e) => e.id === id && (!phase || e.phase === phase)).reduce((s, e) => s + e.mass, 0);
}

// ---- 1. 盐公式与摩尔质量推导 ------------------------------------------------
test('离子推导盐的公式与摩尔质量', () => {
  assert.equal(buildSalt('Na+', 'SO4^2-').formula, 'Na2SO4');
  assert.equal(buildSalt('Fe3+', 'Cl-').formula, 'FeCl3');
  assert.equal(buildSalt('Ca2+', 'OH-').formula, 'Ca(OH)2');
  assert.equal(buildSalt('H+', 'OH-').formula, 'H2O');
  assert.equal(buildSalt('NH4+', 'Cl-').formula, 'NH4Cl');
  assert.equal(buildSalt('Fe3+', 'SO4^2-').formula, 'Fe2(SO4)3');
  assert.equal(buildSalt('Al3+', 'SO4^2-').formula, 'Al2(SO4)3');
  assert.equal(buildSalt('Ag+', 'CO3^2-').formula, 'Ag2CO3');
  assert.equal(buildSalt('H+', 'NO3-').formula, 'HNO3');
  assert.equal(buildSalt('Na+', 'Cl-').mm, 58.5);
});

// ---- 2. 溶解度规则 ----------------------------------------------------------
test('溶解度判定（初中规则）', () => {
  assert.equal(solubilityOf('Na+', 'SO4^2-'), 'soluble');
  assert.equal(solubilityOf('Ba2+', 'SO4^2-'), 'insoluble');
  assert.equal(solubilityOf('Ag+', 'Cl-'), 'insoluble');
  assert.equal(solubilityOf('Na+', 'Cl-'), 'soluble');
  assert.equal(solubilityOf('Ca2+', 'CO3^2-'), 'insoluble');
  assert.equal(solubilityOf('Cu2+', 'OH-'), 'insoluble');
  assert.equal(solubilityOf('Na+', 'OH-'), 'soluble');
  assert.equal(solubilityOf('K+', 'NO3-'), 'soluble');
  // CrO4^2- 铬酸盐：Ba/Pb/Sr/Ag 难溶（BaCrO4 黄、PbCrO4 铬黄、SrCrO4 黄、Ag2CrO4 砖红），其余溶
  assert.equal(solubilityOf('Ba2+', 'CrO4^2-'), 'insoluble');
  assert.equal(solubilityOf('Pb2+', 'CrO4^2-'), 'insoluble');
  assert.equal(solubilityOf('Sr2+', 'CrO4^2-'), 'insoluble');
  assert.equal(solubilityOf('Ag+', 'CrO4^2-'), 'insoluble');
  assert.equal(solubilityOf('K+', 'CrO4^2-'), 'soluble');
  // 铬酸盐沉淀有注册、有颜色（PbCrO4 铬黄 / Ag2CrO4 砖红）
  assert.equal(getSubstance('PbCrO4').solid[0], '#ffc93d');
  assert.equal(getSubstance('Ag2CrO4').solid[0], '#b8563a');
  assert.equal(getSubstance('SrCrO4').soluble, 'insoluble');
  // 铅/锶硝酸盐已注册（离子双置换的"可溶盐源"，可电离）
  assert.equal(getSubstance('Pb(NO3)2').soluble, 'soluble');
  assert.equal(getSubstance('Sr(NO3)2').soluble, 'soluble');
});

// ---- 2.5 微溶物质：过饱和析出（用户需求：CaCl2 持续滴 NaOH → 先浑浊后析出）----
test('Solution 微溶：接近饱和不析出（仅变浑浊），过饱和带（1.25×）后才析出', () => {
  const sol = new Solution({ volume: 200 }); // Ca(OH)2 上限 = 12g/L × 0.2L = 2.4g；过饱和带 1.25× = 3.0g
  let out = 0;
  sol.onOversaturate = (id, excess) => { out += excess; };
  sol.add('Ca(OH)2', 0.5); // 远低于饱和：不析出（只浑浊）
  assert.equal(out, 0, '低于饱和不析出');
  sol.add('Ca(OH)2', 2.0); // 2.5g < 3.0：仍不析出（过饱和带内——溶液已浑浊）
  assert.equal(out, 0, '过饱和带内（1×~1.25×）不析出——只是浑浊');
  assert.ok(Math.abs(sol.mass('Ca(OH)2') - 2.5) < 1e-9);
  sol.add('Ca(OH)2', 1.0); // 3.5 > 3.0 → 析出 0.5，溶液锁在过饱和带顶
  assert.ok(Math.abs(out - 0.5) < 1e-9, `析出 ${out.toFixed(3)}`);
  assert.ok(Math.abs(sol.mass('Ca(OH)2') - 3.0) < 1e-9, '溶液应锁定在过饱和带顶');
});

test('微溶驱动：CaCl2+NaOH 同池 → Ca(OH)2 生成并过饱和析出（浑浊→沉淀）', () => {
  const mat = new SolutionMaterial(new Solution({ volume: 200, solutes: { CaCl2: 20, NaOH: 20 } }));
  let precipitated = 0;
  mat.solution.onOversaturate = (id, excess) => { precipitated += excess; };
  const engine = new ChemistryEngine();
  const env = makeEnv();
  for (let i = 0; i < 600; i++) engine.reactSelf(mat, TICK, env, { skipDissolution: true });
  assert.ok(precipitated > 1, `应析出 Ca(OH)2（浑浊→沉淀）：${precipitated.toFixed(2)}g`);
  assert.ok(Math.abs(mat.solution.mass('Ca(OH)2') - 3.0) < 0.05, `溶液应锁定过饱和带顶：${mat.solution.mass('Ca(OH)2').toFixed(3)}`);
  assert.ok(mat.solution.mass('NaCl') > 5, `副产物 NaCl：${mat.solution.mass('NaCl').toFixed(2)}`);
});

// ---- 3. 中和反应与质量守恒 --------------------------------------------------
test('中和：NaOH + HCl → NaCl + H2O（质量守恒）', () => {
  const engine = new ChemistryEngine();
  const naoh = new Solid({ NaOH: 40 }, { isPlayer: true }); // 1 mol
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { HCl: 36.5 } })); // 1 mol
  naoh.container = pool;
  const env = makeEnv();
  runPair(engine, naoh, pool, env);
  assert.ok(naoh.avail('NaOH') <= 1e-3, 'NaOH 应耗尽（MIN_ENTRY=1e-4 残留是设计）');
  assert.ok(pool.solution.mass('HCl') <= 1e-3, 'HCl 应耗尽');
  // 玩家参与：可溶产物（非核心）直接进溶液（ZnCl2/NaCl 溶于水不堆积在身上）
  assert.ok(Math.abs(pool.solution.mass('NaCl') - 58.5) < 1e-3, `NaCl 进溶液=${pool.solution.mass('NaCl')}`);
  assert.ok(Math.abs(pool.solution.water - 18) < 1e-3, `water=${pool.solution.water}`);
});

// ---- 4. 双置换生成沉淀 ------------------------------------------------------
test('双置换生成沉淀：2NaOH + CuSO4 → Cu(OH)2↓ + Na2SO4', () => {
  const engine = new ChemistryEngine();
  const naoh = new Solid({ NaOH: 80 }, { isPlayer: true }); // 2 mol
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { CuSO4: 160 } })); // 1 mol
  naoh.container = pool;
  const env = makeEnv();
  runPair(engine, naoh, pool, env);
  assert.ok(naoh.avail('NaOH') <= 1e-3);
  assert.ok(pool.solution.mass('CuSO4') <= 1e-3);
  // 玩家参与：可溶产物（Na2SO4）直接进溶液；Cu(OH)2 絮状一律成核沉淀
  assert.ok(Math.abs(pool.solution.mass('Na2SO4') - 142) < 1e-3, `Na2SO4 进溶液=${pool.solution.mass('Na2SO4')}`);
  assert.ok(Math.abs(sumEmitted(env, 'Cu(OH)2', 'precipitate') - 98) < 1e-3, `Cu(OH)2 沉淀=${sumEmitted(env, 'Cu(OH)2', 'precipitate')}`);
});

// ---- 5. 限域试剂 ------------------------------------------------------------
test('限域试剂：NaOH 不足时按最小量停止', () => {
  const engine = new ChemistryEngine();
  const naoh = new Solid({ NaOH: 40 }, { isPlayer: true }); // 1 mol
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { CuSO4: 320 } })); // 2 mol
  naoh.container = pool;
  const env = makeEnv();
  runPair(engine, naoh, pool, env);
  assert.ok(naoh.avail('NaOH') <= 1e-6);
  assert.ok(Math.abs(pool.solution.mass('Na2SO4') - 71) < 1e-3, `Na2SO4 进溶液=${pool.solution.mass('Na2SO4')}`);
  // 1 mol NaOH 只消耗 0.5 mol CuSO4（80g），剩余 240g
  assert.ok(Math.abs(pool.solution.mass('CuSO4') - 240) < 1e-3, `CuSO4 剩余=${pool.solution.mass('CuSO4')}`);
});

// ---- 6. 无驱动力不反应 ------------------------------------------------------
test('无驱动力不反应：KNO3 + NaCl、Cu(OH)2 + NaOH', () => {
  const engine = new ChemistryEngine();
  const a = new Solid({ KNO3: 50 });
  const b = new Solid({ NaCl: 50 });
  const env1 = makeEnv();
  runPair(engine, a, b, env1);
  assert.equal(a.avail('KNO3'), 50);
  assert.equal(b.avail('NaCl'), 50);
  assert.equal(env1.emitted.length, 0);

  const cuoh = new Solid({ 'Cu(OH)2': 49 });
  const naoh = new Solid({ NaOH: 40 });
  const env2 = makeEnv();
  runPair(engine, cuoh, naoh, env2);
  assert.equal(cuoh.avail('Cu(OH)2'), 49);
  assert.equal(naoh.avail('NaOH'), 40);
});

// ---- 7. 酸 + 碳酸盐 → CO2 ---------------------------------------------------
test('酸+碳酸盐：CaCO3 + 2HCl → CaCl2 + CO2↑ + H2O', () => {
  const engine = new ChemistryEngine();
  const caco3 = new Solid({ CaCO3: 100 }); // 1 mol 不溶固体
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { HCl: 73 } })); // 2 mol
  caco3.container = pool;
  const env = makeEnv();
  runPair(engine, caco3, pool, env);
  assert.ok(caco3.avail('CaCO3') <= 1e-6);
  // 强酸主导：大部分 Ca 成 CaCl2；CO2 溶于池水成 H2CO3（弱酸）会缓慢溶蚀少量 CaCO3 → Ca(HCO3)2
  assert.ok(pool.solution.mass('CaCl2') > 80, `CaCl2=${pool.solution.mass('CaCl2')}`);
  const caMoles = pool.solution.mass('CaCl2') / 111 + pool.solution.mass('Ca(HCO3)2') / 162;
  assert.ok(Math.abs(caMoles - 1) < 1e-3, `Ca 摩尔守恒=${caMoles}`);
  // CO2 部分被池水吸收回 H2CO3（碳酸溶解平衡）：碳守恒 = 大气 CO2 + 溶液 H2CO3 + Ca(HCO3)2
  const co2Total = env.atmosphere.mass('CO2') + (pool.solution.mass('H2CO3') * 44) / 62 + pool.solution.mass('Ca(HCO3)2') * 88 / 162;
  assert.ok(Math.abs(co2Total - 44) < 1e-3, `CO2 碳守恒=${co2Total}`);
  // 中和产 1 mol 水；少量被 CO2 吸收消耗
  assert.ok(Math.abs(pool.solution.water - 18) < 1, `water=${pool.solution.water}`);
});

// ---- 8. 金属置换（活动性序） ------------------------------------------------
test('置换：Fe + CuSO4 → FeSO4 + Cu↓', () => {
  const engine = new ChemistryEngine();
  const fe = new Solid({ Fe: 56 });
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { CuSO4: 160 } }));
  fe.container = pool;
  const env = makeEnv();
  runPair(engine, fe, pool, env);
  assert.ok(fe.avail('Fe') <= 1e-6);
  assert.ok(Math.abs(pool.solution.mass('FeSO4') - 152) < 1e-3, `FeSO4=${pool.solution.mass('FeSO4')}`);
  const cu = sumEmitted(env, 'Cu', 'precipitate');
  assert.ok(Math.abs(cu - 64) < 1e-3, `Cu=${cu}`);
});

test('置换：Fe + 2HCl → FeCl2 + H2↑', () => {
  const engine = new ChemistryEngine();
  const fe = new Solid({ Fe: 56 });
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { HCl: 73 } }));
  fe.container = pool;
  const env = makeEnv();
  runPair(engine, fe, pool, env);
  assert.ok(fe.avail('Fe') <= 1e-6);
  assert.ok(Math.abs(pool.solution.mass('FeCl2') - 127) < 1e-3, `FeCl2=${pool.solution.mass('FeCl2')}`);
  assert.ok(Math.abs(env.atmosphere.mass('H2') - 2) < 1e-3, `H2=${env.atmosphere.mass('H2')}`);
});

test('置换：活动性不足不反应（Cu+FeSO4、Cu+HCl）', () => {
  const engine = new ChemistryEngine();
  const cu1 = new Solid({ Cu: 64 });
  const pool1 = new SolutionMaterial(new Solution({ volume: 200, solutes: { FeSO4: 152 } }));
  cu1.container = pool1;
  runPair(engine, cu1, pool1, makeEnv());
  assert.equal(cu1.avail('Cu'), 64);
  assert.equal(pool1.solution.mass('FeSO4'), 152);

  const cu2 = new Solid({ Cu: 64 });
  const pool2 = new SolutionMaterial(new Solution({ volume: 200, solutes: { HCl: 73 } }));
  cu2.container = pool2;
  runPair(engine, cu2, pool2, makeEnv());
  assert.equal(cu2.avail('Cu'), 64);
  assert.equal(pool2.solution.mass('HCl'), 73);
});

test('置换：Al + CuSO4（按电荷平衡）→ Al2(SO4)3 + Cu', () => {
  const engine = new ChemistryEngine();
  const al = new Solid({ Al: 54 }); // 2 mol
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { CuSO4: 480 } })); // 3 mol
  al.container = pool;
  const env = makeEnv();
  runPair(engine, al, pool, env);
  assert.ok(al.avail('Al') <= 1e-6);
  assert.ok(Math.abs(pool.solution.mass('Al2(SO4)3') - 342) < 1e-3, `Al2(SO4)3=${pool.solution.mass('Al2(SO4)3')}`);
  const cu = sumEmitted(env, 'Cu');
  assert.ok(Math.abs(cu - 192) < 1e-3, `Cu=${cu}`); // 3 mol = 192g
});

// ---- 9. 金属氧化物 + 酸（离子推导，O2- 参与） ------------------------------
test('氧化物+酸：CuO + H2SO4 → CuSO4 + H2O', () => {
  const engine = new ChemistryEngine();
  const cuo = new Solid({ CuO: 80 });
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { H2SO4: 98 } }));
  cuo.container = pool;
  const env = makeEnv();
  runPair(engine, cuo, pool, env);
  assert.ok(cuo.avail('CuO') <= 1e-3);
  assert.ok(Math.abs(pool.solution.mass('CuSO4') - 160) < 1e-3, `CuSO4=${pool.solution.mass('CuSO4')}`);
  assert.ok(Math.abs(pool.solution.water - 18) < 1e-3, `water=${pool.solution.water}`);
});

test('氧化物+酸：Fe2O3 + 6HCl → 2FeCl3 + 3H2O', () => {
  const engine = new ChemistryEngine();
  const fe2o3 = new Solid({ Fe2O3: 160 });
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { HCl: 219 } }));
  fe2o3.container = pool;
  const env = makeEnv();
  runPair(engine, fe2o3, pool, env);
  assert.ok(fe2o3.avail('Fe2O3') <= 1e-3);
  assert.ok(Math.abs(pool.solution.mass('FeCl3') - 325) < 1e-3, `FeCl3=${pool.solution.mass('FeCl3')}`);
  assert.ok(Math.abs(pool.solution.water - 54) < 1e-3, `water=${pool.solution.water}`);
});

// ---- 10. 特例：Fe3O4（混合价）+ 酸 -----------------------------------------
test('特例：Fe3O4 + 8HCl → 2FeCl3 + FeCl2 + 4H2O', () => {
  const engine = new ChemistryEngine();
  const fe3o4 = new Solid({ Fe3O4: 232 });
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { HCl: 292 } }));
  fe3o4.container = pool;
  const env = makeEnv();
  runPair(engine, fe3o4, pool, env);
  assert.ok(fe3o4.avail('Fe3O4') <= 1e-6);
  assert.ok(Math.abs(pool.solution.mass('FeCl3') - 325) < 1e-3, `FeCl3=${pool.solution.mass('FeCl3')}`);
  assert.ok(Math.abs(pool.solution.mass('FeCl2') - 127) < 1e-3, `FeCl2=${pool.solution.mass('FeCl2')}`);
  assert.ok(Math.abs(pool.solution.water - 72) < 1e-3, `water=${pool.solution.water}`);
});

// ---- 11. 氧化还原 -----------------------------------------------------------
test('还原：C + 2CuO --高温--> 2Cu + CO2（无高温不反应）', () => {
  const engine = new ChemistryEngine();
  const cuo = new Solid({ CuO: 160 }); // 2 mol
  const c = new Solid({ C: 12 }); // 1 mol
  const envCold = makeEnv();
  runPair(engine, cuo, c, envCold);
  assert.equal(cuo.avail('CuO'), 160);
  assert.equal(c.avail('C'), 12);

  const env = makeEnv({ highTemp: true });
  runPair(engine, cuo, c, env);
  assert.ok(cuo.avail('CuO') <= 1e-6);
  assert.ok(c.avail('C') <= 1e-6);
  const cu = sumEmitted(env, 'Cu', 'particle');
  assert.ok(Math.abs(cu - 128) < 1e-3, `Cu=${cu}`);
  assert.ok(Math.abs(env.atmosphere.mass('CO2') - 44) < 1e-3, `CO2=${env.atmosphere.mass('CO2')}`);
});

test('还原：同一材料内 CuO 粉 + 碳粉混合，高温自还原（碳粉场景）', () => {
  const engine = new ChemistryEngine();
  const powder = new Solid({ CuO: 160, C: 12 }); // 2 mol CuO + 1 mol C 混在同一粉末里
  const envCold = makeEnv();
  runSelf(engine, powder, envCold);
  assert.equal(powder.avail('CuO'), 160, '无高温不反应');
  assert.equal(powder.avail('C'), 12);

  const env = makeEnv({ highTemp: true });
  runSelf(engine, powder, env);
  assert.ok(powder.avail('CuO') <= 1e-6);
  assert.ok(powder.avail('C') <= 1e-6);
  const cu = sumEmitted(env, 'Cu', 'particle');
  assert.ok(Math.abs(cu - 128) < 1e-3, `Cu=${cu}`);
  assert.ok(Math.abs(env.atmosphere.mass('CO2') - 44) < 1e-3, `CO2=${env.atmosphere.mass('CO2')}`);
});

test('还原：CuO + CO --高温--> Cu + CO2（大气中 CO 作还原剂）', () => {
  const engine = new ChemistryEngine();
  const cuo = new Solid({ CuO: 80 });
  const env = makeEnv({ highTemp: true });
  env.atmosphere.add('CO', 56); // 2 mol
  runSelf(engine, cuo, env);
  assert.ok(cuo.avail('CuO') <= 1e-6);
  assert.ok(Math.abs(env.atmosphere.mass('CO2') - 44) < 1e-3, `CO2=${env.atmosphere.mass('CO2')}`);
  assert.ok(Math.abs(env.atmosphere.mass('CO') - 28) < 1e-3, `CO 剩余=${env.atmosphere.mass('CO')}`);
});

test('C + CO2 --高温--> 2CO', () => {
  const engine = new ChemistryEngine();
  const c = new Solid({ C: 12 });
  const env = makeEnv({ highTemp: true });
  env.atmosphere.add('CO2', 44);
  runSelf(engine, c, env);
  assert.ok(c.avail('C') <= 1e-6);
  assert.ok(Math.abs(env.atmosphere.mass('CO') - 56) < 1e-3, `CO=${env.atmosphere.mass('CO')}`);
  assert.ok(Math.abs(env.atmosphere.mass('CO2')) < 1e-3);
});

// ---- 12. 加热/高温分解 ------------------------------------------------------
test('不溶性碱加热分解：Cu(OH)2 --加热--> CuO + H2O（无加热不分解）', () => {
  const engine = new ChemistryEngine();
  const cuoh = new Solid({ 'Cu(OH)2': 98 });
  const envCold = makeEnv();
  runSelf(engine, cuoh, envCold);
  assert.equal(cuoh.avail('Cu(OH)2'), 98);

  const env = makeEnv({ heat: true });
  runSelf(engine, cuoh, env);
  assert.ok(cuoh.avail('Cu(OH)2') <= 1e-6);
  const cuo = sumEmitted(env, 'CuO', 'particle');
  assert.ok(Math.abs(cuo - 80) < 1e-3, `CuO=${cuo}`);
});

test('碳酸钙高温分解：CaCO3 --高温--> CaO + CO2↑', () => {
  const engine = new ChemistryEngine();
  const caco3 = new Solid({ CaCO3: 100 });
  const env = makeEnv({ highTemp: true });
  runSelf(engine, caco3, env);
  assert.ok(caco3.avail('CaCO3') <= 1e-6);
  assert.ok(Math.abs(env.atmosphere.mass('CO2') - 44) < 1e-3);
});

// ---- 13. 催化/加热制氧 ------------------------------------------------------
test('催化制氧：2H2O2 --MnO2--> 2H2O + O2↑（无催化剂不反应）', () => {
  const engine = new ChemistryEngine();
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { H2O2: 68 } }));
  const envNone = makeEnv();
  runSelf(engine, pool, envNone);
  assert.equal(pool.solution.mass('H2O2'), 68);

  const env = makeEnv({ hasCatalyst: (id) => id === 'MnO2' });
  runSelf(engine, pool, env);
  assert.ok(pool.solution.mass('H2O2') <= 1e-6);
  // 大气初始 O2=400g（totalAir 2000 × 20%），产氧 +32g → 432g
  assert.ok(Math.abs(env.atmosphere.mass('O2') - 432) < 1e-3, `O2=${env.atmosphere.mass('O2')}`);
  assert.ok(Math.abs(pool.solution.water - 36) < 1e-3, `water=${pool.solution.water}`);
});

test('制氧：2KMnO4 --加热--> K2MnO4 + MnO2↓ + O2↑', () => {
  const engine = new ChemistryEngine();
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { KMnO4: 316 } }));
  const env = makeEnv({ heat: true });
  runSelf(engine, pool, env);
  assert.ok(pool.solution.mass('KMnO4') <= 1e-6);
  // 大气初始 O2=400g，产氧 +32g → 432g
  assert.ok(Math.abs(env.atmosphere.mass('O2') - 432) < 1e-3, `O2=${env.atmosphere.mass('O2')}`);
  assert.ok(Math.abs(pool.solution.mass('K2MnO4') - 197) < 1e-3, `K2MnO4=${pool.solution.mass('K2MnO4')}`);
  const mno2 = sumEmitted(env, 'MnO2', 'precipitate');
  assert.ok(Math.abs(mno2 - 87) < 1e-3, `MnO2 沉淀=${mno2}`);
});

// ---- 14. 燃烧与大气 ---------------------------------------------------------
test('燃烧：C + O2 → CO2（耗氧、产 CO2，缺氧后熄灭）', () => {
  const engine = new ChemistryEngine();
  const c = new Solid({ C: 1000 });
  const env = makeEnv({ ignited: true });
  runSelf(engine, c, env, 20000);
  assert.ok(c.avail('C') > 0, '缺氧后 C 应剩余');
  assert.ok(env.atmosphere.mass('CO2') > 0, '应产生 CO2');
  assert.ok(Math.abs(env.atmosphere.o2Fraction() - 0.05) < 0.01, `O2 分数=${env.atmosphere.o2Fraction()}`);
  const cBurned = 1000 - c.avail('C');
  const o2Burned = 400 - env.atmosphere.mass('O2'); // 大气初始 O2=400g（totalAir 2000 × 20%）
  assert.ok(Math.abs(cBurned - (o2Burned * 12) / 32) < 1e-3, `耗 C=${cBurned}, 耗 O2=${o2Burned}`);
});

test('氢气爆鸣：H2 积累超爆炸下限 + 点燃源 → 爆炸（消耗 H2 与 O2）', () => {
  const engine = new ChemistryEngine();
  const env = makeEnv({ ignited: true }, { globalIgnited: true });
  env.atmosphere.add('H2', 8); // 4 mol，超过爆炸下限
  let exploded = false;
  env.explode = () => { exploded = true; };
  engine.reactAtmosphere(env, TICK);
  assert.ok(exploded, 'H2 遇火应爆炸');
  assert.ok(env.atmosphere.mass('H2') < 0.1, '爆炸应消耗 H2');
  assert.ok(env.atmosphere.mass('O2') < 400, '爆炸应消耗 O2');
});

test('可燃气体低浓度点燃：不爆炸也不被消耗（灯不产 CO2）', () => {
  const engine = new ChemistryEngine();
  const env = makeEnv({ ignited: true }, { globalIgnited: true });
  env.atmosphere.add('CO', 2); // 低浓度
  let exploded = false;
  env.explode = () => { exploded = true; };
  for (let i = 0; i < 200; i++) engine.reactAtmosphere(env, TICK);
  assert.equal(exploded, false, '低浓度 CO 不应爆炸');
  assert.equal(env.atmosphere.mass('CO'), 2, 'CO 应保留（灯点燃不消耗可燃气体、不产 CO2）');
  assert.equal(env.atmosphere.mass('CO2'), 0, '灯点燃不应产生 CO2');
});

// ---- 15. 自发分解（碳酸） ---------------------------------------------------
test('碳酸自发分解：H2CO3 → H2O + CO2↑', () => {
  const engine = new ChemistryEngine();
  const pool = new SolutionMaterial(new Solution({ volume: 200, solutes: { H2CO3: 62 } }));
  const env = makeEnv();
  runSelf(engine, pool, env);
  // 分解占绝对主导（部分 CO2 被池水吸收回碳酸，存在溶解平衡，但 62g 只剩微量）
  assert.ok(pool.solution.mass('H2CO3') < 1, `H2CO3 残留=${pool.solution.mass('H2CO3')}`);
  assert.ok(env.atmosphere.mass('CO2') > 40, `CO2=${env.atmosphere.mass('CO2')}`);
  // H2CO3 分解 = CO2 逸出（不额外产水）
  assert.ok(pool.solution.water < 1, `water=${pool.solution.water}`);
});

// ---- 16. 溶解 -----------------------------------------------------------------
test('可溶固体浸水溶解为溶质，玩家不溶解', () => {
  const engine = new ChemistryEngine();
  const salt = new Solid({ NaCl: 60 });
  const pool = new SolutionMaterial(new Solution({ volume: 200, water: 200 })); // 纯水
  salt.container = pool;
  runSelf(engine, salt, makeEnv());
  assert.ok(salt.avail('NaCl') <= 1e-6);
  assert.ok(Math.abs(pool.solution.mass('NaCl') - 60) < 1e-3);

  const player = new Solid({ NaCl: 60 }, { isPlayer: true, substance: 'NaCl' });
  player.container = pool;
  runSelf(engine, player, makeEnv());
  assert.equal(player.avail('NaCl'), 60, '玩家核心物质不溶解');
});

// ---- 17. 碱 + 酸性气体（大气吸收） -------------------------------------------
test('碱+酸性气体：NaOH 溶液吸收大气 CO2 → Na2CO3', () => {
  const engine = new ChemistryEngine();
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { NaOH: 80 } }));
  const env = makeEnv();
  env.atmosphere.add('CO2', 44);
  for (let i = 0; i < 20000; i++) engine.absorbAtmosphereGas(pool, TICK, env);
  assert.ok(Math.abs(pool.solution.mass('Na2CO3') - 106) < 1e-3, `Na2CO3=${pool.solution.mass('Na2CO3')}`);
  assert.ok(Math.abs(env.atmosphere.mass('CO2')) < 1e-3, 'CO2 应被吸收');
});

// ---- 18. 大气组成 -----------------------------------------------------------
test('大气初始组成与产气', () => {
  const atm = new Atmosphere({ totalAir: 5000, init: { N2: 0.8, O2: 0.2 } });
  assert.equal(atm.fraction('N2'), 0.8);
  assert.equal(atm.fraction('O2'), 0.2);
  atm.add('CO2', 44);
  assert.ok(Math.abs(atm.fraction('CO2') - 44 / 5044) < 1e-6);
});

// ---- 19. 相位要求（只有在溶液里才能反应） -----------------------------------
test('固-固接触不反应（需要溶液介质）；浸入溶液才反应', () => {
  const engine = new ChemistryEngine();
  // 固固：NaOH 块 + CuSO4 块直接接触 → 不反应
  const naoh2 = new Solid({ NaOH: 40 });
  const cuso4 = new Solid({ CuSO4: 160 });
  engine.reactPair(naoh2, cuso4, TICK, makeEnv());
  assert.equal(naoh2.avail('NaOH'), 40, '固-固接触不应反应');

  // 固液：NaOH 固体浸入 HCl 溶液 → 反应
  const naoh1 = new Solid({ NaOH: 40 }, { isPlayer: true });
  const pool1 = new SolutionMaterial(new Solution({ volume: 200, solutes: { HCl: 36.5 } }));
  naoh1.container = pool1;
  engine.reactPair(naoh1, pool1, TICK, makeEnv());
  assert.ok(40 - naoh1.avail('NaOH') > 0, '浸入溶液应反应');
});

// ---- 20. 开阔地玩家反应产物附着 -------------------------------------------
test('玩家浸入溶液反应：固体产物附着到玩家（不计入血量）', () => {
  const engine = new ChemistryEngine();
  const player = new Solid({ NaOH: 80 }, { isPlayer: true });
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { CuSO4: 160 } }));
  player.container = pool;
  const env = makeEnv();
  runPair(engine, player, pool, env);
  // Na2SO4（可溶，非核心）直接进溶液；Cu(OH)2 絮状沉淀特殊处理——成核沉淀
  assert.ok(Math.abs(pool.solution.mass('Na2SO4') - 142) < 1e-3, `Na2SO4 进溶液=${pool.solution.mass('Na2SO4')}`);
  const cu = sumEmitted(env, 'Cu(OH)2', 'precipitate');
  assert.ok(Math.abs(cu - 98) < 1e-3, `Cu(OH)2 成核沉淀=${cu}`);
});

// ---- 21. 反应不产生负质量 ---------------------------------------------------
test('反应过程不产生负质量', () => {
  const engine = new ChemistryEngine();
  const naoh = new Solid({ NaOH: 100 }, { isPlayer: true });
  const pool = new SolutionMaterial(new Solution({ volume: 300, solutes: { CuSO4: 100 } }));
  naoh.container = pool;
  const env = makeEnv();
  for (let i = 0; i < 200; i++) {
    engine.reactPair(naoh, pool, TICK, env);
    assert.ok(naoh.avail('NaOH') >= 0);
    for (const id of pool.solution.ids()) assert.ok(pool.solution.mass(id) >= 0);
    assert.ok(env.atmosphere.mass('CO2') >= 0);
  }
});

// ---- 22. 物质表完整性（产品必须可解析） -------------------------------------
test('规则中的产物均可解析出物质', () => {
  const products = [
    'H2O', 'H2', 'O2', 'CO2', 'SO2', 'CO', 'NH3',
    'NaCl', 'Na2CO3', 'Na2SO4', 'Na2SO3', 'K2CO3', 'K2SO3', 'CaCO3', 'CaSO3',
    'CuO', 'Fe2O3', 'MgO', 'CaO', 'Al2O3', 'P2O5', 'Fe3O4',
    'Cu', 'Fe', 'Mg', 'Al', 'Zn', 'Ag',
    'K2MnO4', 'MnO2', 'KCl', 'FeCl3', 'FeCl2', 'FeSO4', 'Al2(SO4)3',
  ];
  for (const id of products) {
    const s = getSubstance(id);
    assert.ok(s && s.mm > 0, `产物 ${id} 缺失`);
  }
});

// ---- 23. 反应日志防抖动（产物过滤 / 反应物排序 / 别名归一化） -----------------
test('日志防抖：产物只剩水时不记录（H2+O2 → H2O 无可见产物，不刷日志）', () => {
  const engine = new ChemistryEngine();
  const logs = [];
  const env = makeEnv({}, {
    onReaction: (t) => logs.push(t),
    debugMode: true,
    customReactions: [{ reactants: [{ id: 'H2', coeff: 2 }, { id: 'O2', coeff: 1 }], products: [{ id: 'H2O', coeff: 2 }] }],
  });
  const h2 = new SolutionMaterial(new Solution({ volume: 200, solutes: { H2: 5 } }));
  const o2 = new SolutionMaterial(new Solution({ volume: 200, solutes: { O2: 5 } }));
  engine.reactPair(h2, o2, TICK, env);
  assert.equal(logs.length, 0, `产物只剩水的反应不应记录日志，实际 ${logs.length} 条`);
});

test('日志防抖：产气反应必须可见——电解水 H2O → H2+O2 不被静默吞掉', () => {
  const engine = new ChemistryEngine();
  const logs = [];
  const env = makeEnv({}, {
    onReaction: (t) => logs.push(t),
    debugMode: true,
    customReactions: [{ reactants: [{ id: 'H2O', coeff: 2 }], products: [{ id: 'H2', coeff: 2 }, { id: 'O2', coeff: 1 }] }],
  });
  const water = new SolutionMaterial(new Solution({ volume: 200, water: 100 }));
  engine.reactSelf(water, TICK, env);
  assert.ok(logs.length > 0, '电解水（纯产气）应有日志');
  assert.equal(logs[0], 'H2O → H2+O2', `实际: ${logs[0]}`);
});

test('日志防抖：产气反应不再被整体过滤（氨水+NaOH → NH3 可见）', () => {
  const engine = new ChemistryEngine();
  const logs = [];
  const env = makeEnv({}, { onReaction: (t) => logs.push(t), debugMode: true });
  const ammonia = new SolutionMaterial(new Solution({ volume: 200, solutes: { 'NH3·H2O': 10 } }));
  const naoh = new Solid({ NaOH: 10 });
  naoh.container = ammonia;
  for (let i = 0; i < 10; i++) engine.reactPair(naoh, ammonia, TICK, env);
  assert.ok(logs.length > 0, '产氨反应应有日志');
  assert.match(logs[0], /^NH3·H2O\+NaOH → NH3$/, `实际: ${logs[0]}`);
});

test('日志防抖：反应物顺序不同视为同一反应（排序规范化）', () => {
  const engine = new ChemistryEngine();
  const logA = [];
  const envA = makeEnv({}, { onReaction: (t) => logA.push(t), debugMode: true });
  const a1 = new SolutionMaterial(new Solution({ volume: 200, solutes: { 'NH3·H2O': 10 } }));
  const b1 = new SolutionMaterial(new Solution({ volume: 200, solutes: { HClO: 10 } }));
  engine.reactPair(a1, b1, TICK, envA); // NH3·H2O 在前

  const logB = [];
  const envB = makeEnv({}, { onReaction: (t) => logB.push(t), debugMode: true });
  const a2 = new SolutionMaterial(new Solution({ volume: 200, solutes: { HClO: 10 } }));
  const b2 = new SolutionMaterial(new Solution({ volume: 200, solutes: { 'NH3·H2O': 10 } }));
  engine.reactPair(a2, b2, TICK, envB); // HClO 在前

  assert.ok(logA.length > 0 && logB.length > 0, '两个方向都应发生反应');
  assert.equal(logA[0], logB[0], `同一反应两种书写顺序应归一为同一条日志：${logA[0]} vs ${logB[0]}`);
  assert.match(logA[0], /^HClO\+NH3·H2O → NH4ClO$/, `反应物应按 id 排序：${logA[0]}`);
});

test('别名归一化：NH4OH ≡ NH3·H2O（同池共存不再分裂成两个 id）', () => {
  const solution = new Solution({ volume: 200, solutes: { NH4OH: 5 } });
  assert.deepEqual(solution.ids(), ['NH3·H2O'], 'NH4OH 溶质应归一化为 NH3·H2O');
  solution.add('NH4OH', 3);
  assert.equal(solution.mass('NH3·H2O'), 8, 'add(NH4OH) 应累加到 NH3·H2O');
  assert.equal(solution.mass('NH4OH'), 8, 'mass(NH4OH) 也应查询到同一溶质');
  solution.remove('NH3·H2O', 4);
  assert.equal(solution.mass('NH4OH'), 4, 'remove 同样归一化');
  assert.equal(getSubstance('NH4OH').id, 'NH3·H2O', 'getSubstance 别名应返回规范条目');
});

// ---- 24. 微量中间体振荡（"一个 tick 有、下一个 tick 没有"的根源） -----------------
test('微量中间体不振荡：NH4ClO 生成=消耗时稳定在非零稳态（防"有→无→有"抖动）', () => {
  const engine = new ChemistryEngine();
  // 混合池：氨水 + 次氯酸 + 氢氧化钠——NH3·H2O+HClO 生成 NH4ClO，
  // NH4ClO+NaOH 又立刻消耗它（旧代码每 tick 0↔0.0002g 翻转，溶液面板狂抖）
  const solution = new Solution({ volume: 200, solutes: { 'NH3·H2O': 1, HClO: 5, NaOH: 2, NaClO: 3 } });
  const mat = new SolutionMaterial(solution);
  const env = makeEnv();
  let flips = 0;
  let lastHas = null;
  for (let i = 0; i < 300; i++) {
    engine.reactSelf(mat, TICK, env);
    const has = solution.solutes.has('NH4ClO');
    if (lastHas !== null && has !== lastHas) flips++;
    lastHas = has;
  }
  assert.ok(flips <= 3, `NH4ClO 条目不应反复出现/消失（修复前每 tick 翻转），实际翻转 ${flips} 次`);
  assert.ok(solution.mass('NH4ClO') > 1e-4, `NH4ClO 应稳定在非零稳态，实际 ${solution.mass('NH4ClO')}g`);
});
