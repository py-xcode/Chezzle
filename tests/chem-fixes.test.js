// 化学引擎修复回归测试（alpha-1031）
// 覆盖：实际液体体积/浓度、碳酸化、稀硫酸、硝酸盐补全、Fe/HNO3 计量、
//       催化剂同容器、双水解、弱酸盐酸化、pH 水解、难溶硫化物、活动性、颜色、放置质量等。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/scene.js';
import { Pool } from '../src/objects/pool.js';
import { Block } from '../src/objects/block.js';
import { HeatingPool } from '../src/objects/poolvariants.js';
import { ElectrolysisPool } from '../src/objects/poolvariants.js';
import { Inventory } from '../src/objects/player.js';
import { Player } from '../src/objects/player.js';
import { GasDetector } from '../src/objects/gasdetector.js';
import { GasChamber } from '../src/objects/gaschamber.js';
import { Solution } from '../src/chem/solution.js';
import { getSubstance, isMoreActive, solubilityOf } from '../src/chem/substances.js';

const TICK = 1 / 30;
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));
function run(scene, n = 600) { for (let i = 0; i < n; i++) scene.step(TICK); }
function poolScene() { return new Scene({ worldW: 2000, worldH: 1000 }); }

test('P0-1 实际液体体积：加水稀释浓度，半杯不再按满杯算', () => {
  const sol = new Solution({ volume: 200, water: 20, solutes: { CuSO4: 2 } });
  assert.equal(sol.liquidVolume(), 22);
  assert.ok(near(sol.concentration('CuSO4'), 2 / 22), `浓度 ${sol.concentration('CuSO4')}`);
  sol.water += 200;
  assert.equal(sol.liquidVolume(), 200, '夹在容器容量内');
  assert.ok(near(sol.concentration('CuSO4'), 2 / 200), `稀释后浓度 ${sol.concentration('CuSO4')}`);
});

test('P0-2 碳酸化：CaCO3+CO2+H2O → Ca(HCO3)2（石灰水先浑后清）', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200 });
  s.addObject(p);
  p.addPrecipitate('CaCO3', 5, null, { kind: 'test' });
  s.atmosphere.add('CO2', 20);
  s.status = 'running';
  run(s, 900);
  assert.ok(p.solution.mass('Ca(HCO3)2') > 6, `应生成 Ca(HCO3)2：${p.solution.mass('Ca(HCO3)2')}`);
  assert.ok((p.precipitates.get('CaCO3') ?? 0) < 0.1, 'CaCO3 应被消耗');
  assert.ok(p.solution.water < 200, '应消耗水');
});

test('P0-2 碳酸化：Na2CO3 溶液通 CO2 → NaHCO3', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200, solutes: { Na2CO3: 20 } });
  s.addObject(p);
  s.atmosphere.add('CO2', 20);
  s.status = 'running';
  run(s, 600);
  assert.ok(p.solution.mass('NaHCO3') > 20, `应生成 NaHCO3：${p.solution.mass('NaHCO3')}`);
  assert.ok(p.solution.mass('Na2CO3') < 1, 'Na2CO3 应耗尽');
});

test('P0-3 稀硫酸 + Zn 产 H2（不产 SO2）', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 180, h: 60, volume: 200, solutes: { H2SO4: 20 } });
  s.addObject(p);
  s.addObject(new Block({ x: 340, y: 680, w: 30, h: 30, substance: 'Zn' }));
  s.status = 'running';
  run(s, 900);
  assert.ok(s.atmosphere.mass('H2') > 0.05, `应产 H2：${s.atmosphere.mass('H2')}`);
  assert.ok(s.atmosphere.mass('SO2') < 1e-6, '稀硫酸不应产 SO2');
});

test('P0-5 硝酸盐补全：Zn(NO3)2 有正确摩尔质量/离子（不是幽灵盐 mm=100）', () => {
  const zn = getSubstance('Zn(NO3)2');
  assert.equal(zn.mm, 189);
  assert.ok(zn.ions, '应有离子信息');
  assert.equal(zn.ions.an, 'NO3-');
  assert.equal(zn.soluble, 'soluble');
  const an = getSubstance('NH4NO3');
  assert.equal(an.mm, 80);
  assert.equal(an.soluble, 'soluble');
  assert.deepEqual(an.ions, { cat: 'NH4+', an: 'NO3-', catCount: 1, anCount: 1 });
});

test('P0-6 二元酸 + 碳酸钠产气（Na2CO3+H2SO4）', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200, solutes: { Na2CO3: 20, H2SO4: 20 } });
  s.addObject(p);
  s.status = 'running';
  run(s, 600);
  assert.ok(s.atmosphere.mass('CO2') > 0.2, `应产 CO2：${s.atmosphere.mass('CO2')}`);
  assert.ok(p.solution.mass('Na2CO3') < 1, 'Na2CO3 应被消耗');
});

test('P0-7 Fe 过量 + 稀 HNO3：主要生成 Fe(NO3)2 而不是 Fe(NO3)3', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200, solutes: { HNO3: 10 } });
  s.addObject(p);
  const b = new Block({ x: 340, y: 680, w: 30, h: 30, substance: 'Fe' });
  s.addObject(b);
  s.status = 'running';
  run(s, 900);
  assert.ok(p.solution.mass('Fe(NO3)2') > p.solution.mass('Fe(NO3)3'), 'Fe 过量应走 Fe2+');
});

test('P0-4 质量守恒：2Fe(OH)3 --加热--> Fe2O3+3H2O；Al+NaOH 产 H2', () => {
  // Fe(OH)3 热分解（加热池）
  const s = poolScene();
  const hp = new HeatingPool({ x: 300, y: 700, w: 220, h: 60, volume: 200, solutes: { 'Fe(OH)3': 0 } });
  s.addObject(hp);
  hp.addPrecipitate('Fe(OH)3', 2.14, null, { kind: 'test' });
  s.status = 'running';
  run(s, 60);
  assert.ok(hp.precipitates.get('Fe2O3') > 1.4, `Fe2O3=${hp.precipitates.get('Fe2O3')}`);
  // Al + NaOH 质量守恒（含大气 H2）
  const s2 = poolScene();
  const p2 = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200, solutes: { NaOH: 20 } });
  s2.addObject(p2);
  const al = new Block({ x: 340, y: 680, w: 30, h: 30, substance: 'Al' });
  s2.addObject(al);
  s2.status = 'running';
  const before = p2.solution.totalMass() + al.grid.totalMass();
  run(s2, 300);
  const after = p2.solution.totalMass() + al.grid.totalMass() + s2.atmosphere.mass('H2');
  assert.ok(near(after, before, 0.05), `Al+NaOH 质量守恒 ${before}→${after}`);
});

test('P1 催化剂：MnO2 作为同池沉淀也能催化 H2O2 分解', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200, solutes: { H2O2: 20 } });
  s.addObject(p);
  p.addPrecipitate('MnO2', 2, null, { kind: 'test' });
  s.status = 'running';
  run(s, 300);
  assert.ok(p.solution.mass('H2O2') < 1, `H2O2 应被催化分解：${p.solution.mass('H2O2')}`);
  assert.ok(s.atmosphere.mass('O2') > 400, '应产 O2');
});

test('P1 双水解：FeCl3+Na2CO3 生成 Fe(OH)3+CO2，不生成 Fe2(CO3)3', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 300, solutes: { FeCl3: 20, Na2CO3: 20 } });
  s.addObject(p);
  s.status = 'running';
  run(s, 600);
  assert.ok((p.precipitates.get('Fe(OH)3') ?? 0) > 1, '应有 Fe(OH)3 沉淀');
  assert.ok(s.atmosphere.mass('CO2') > 0.5, '应放出 CO2');
  assert.ok(!(p.precipitates.get('Fe2(CO3)3') > 0), '不应生成 Fe2(CO3)3 这种不存在的盐');
});

test('P1 弱酸盐 + 强酸：NaCH3COO+HCl → CH3COOH+NaCl', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 300, solutes: { NaCH3COO: 20, HCl: 10 } });
  s.addObject(p);
  s.status = 'running';
  run(s, 300);
  assert.ok(p.solution.mass('CH3COOH') > 5, '应生成醋酸');
  assert.ok(p.solution.mass('NaCH3COO') < 15, '醋酸钠应被消耗');
});

test('P1 pH 盐类水解：Na2CO3 碱性、NH4Cl 酸性、NaCl 中性', () => {
  const base = new Solution({ volume: 200, water: 200, solutes: { Na2CO3: 10 } });
  const acid = new Solution({ volume: 200, water: 200, solutes: { NH4Cl: 10 } });
  const neutral = new Solution({ volume: 200, water: 200, solutes: { NaCl: 10 } });
  assert.ok(base.pH() > 9, `Na2CO3 pH=${base.pH()}`);
  assert.ok(acid.pH() < 6, `NH4Cl pH=${acid.pH()}`);
  assert.ok(Math.abs(neutral.pH() - 7) < 0.3);
});

test('P1 难溶硫化物不溶于稀盐酸；活动性 Li>K>Na；Fe(OH)3 颜色/溶解度表', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200, solutes: { HCl: 20 } });
  s.addObject(p);
  p.addPrecipitate('CuS', 5, null, { kind: 'test' });
  s.status = 'running';
  run(s, 300);
  assert.ok((p.precipitates.get('CuS') ?? 0) > 4.9, 'CuS 不应溶于稀盐酸');
  assert.equal(s.atmosphere.mass('H2S'), 0, '不应放出 H2S');
  assert.ok(isMoreActive('Li', 'K') && isMoreActive('K', 'Na'), '活动性 Li>K>Na');
  assert.equal(getSubstance('Fe(OH)3').solid[0], '#a64b2a');
  assert.notEqual(getSubstance('Fe').solid[0], '#fdfdfd', '铁应为银灰金属色，不是白色');
  assert.equal(solubilityOf('Pb2+', 'SO4^2-'), 'insoluble');
  assert.equal(solubilityOf('Pb2+', 'I-'), 'insoluble');
});

test('P1 放置质量：格内不足 0.5g 时按实际剩余量放置，不凭空补足', () => {
  const inv = new Inventory();
  inv.slots[0] = { substance: 'NaCl', mass: 0.2 };
  inv.selected = 0;
  const res = inv.place(0.5);
  assert.ok(res && near(res.mass, 0.2, 1e-9), `实际放置 ${res && res.mass}`);
  assert.equal(inv.slots[0], null, '不足量应清空格');
});

test('P1 气相归中：Cl2 + NH3 → N2 + HCl(g)，氨过量继续生成 NH4Cl 白烟', () => {
  const s = new Scene();
  s.status = 'running';
  s.atmosphere.gas.clear();
  s.atmosphere._baseTotal = 0;
  s.atmosphere.add('NH3', 34);
  s.atmosphere.add('Cl2', 213);
  const total0 = s.atmosphere.total();
  const env = s.makeEnv(null);
  for (let i = 0; i < 600; i++) s.chem.reactAtmosphere(env, 1 / 30);
  assert.ok(s.atmosphere.mass('NH3') < 1e-6, 'NH3 应被消耗完');
  assert.ok(s.atmosphere.mass('Cl2') < 212, 'Cl2 应被消耗');
  assert.ok(s.atmosphere.mass('N2') > 1, '应生成 N2');
  assert.ok(s.atmosphere.mass('HCl(g)') > 1, '应生成 HCl(g)');
  const particleMass = s.particles.reduce((a, p) => a + (p.amount || 0), 0);
  assert.ok(s.particles.some((p) => p.substance === 'NH4Cl'), '应生成 NH4Cl 白烟颗粒');
  assert.ok(Math.abs(total0 - (s.atmosphere.total() + particleMass)) < 0.5, '气相加白烟总质量守恒');
});

test('P1 H2S 溶液：Fe 可与 H2S 中的 H+ 反应；HCl + H2S 不冒 H2', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 240, h: 60, volume: 300, water: 300, solutes: { H2S: 50 } });
  s.addObject(p);
  const fe = new Block({ x: 380, y: 650, w: 30, h: 30, substance: 'Fe', mass: 30 });
  s.addObject(fe);
  s.status = 'running';
  run(s, 300);
  assert.ok(s.atmosphere.mass('H2') > 0.1, 'Fe 与 H2S 溶液应产生 H2');
  assert.ok(p.solution.mass('H2S') < 49, 'H2S 应被消耗');
  assert.ok(fe.grid.avail('Fe') < 29, 'Fe 应被消耗');
  assert.ok(s.atmosphere.mass('H2S') < 1e-6, '反应不应生成 H2S 气体（否则会被水溶解造成闪烁）');

  // H+ 强度不足以氧化 H2S：HCl + H2S 不应走 H2 + S 的假反应
  const s2 = poolScene();
  const p2 = new Pool({ x: 300, y: 700, w: 220, h: 60, volume: 200, water: 200, solutes: { HCl: 20, H2S: 20 } });
  s2.addObject(p2);
  s2.status = 'running';
  run(s2, 300);
  assert.ok(s2.atmosphere.mass('H2') < 0.05, 'HCl 不应把 H2S 氧化出 H2');
});

test('P1 Cl2 通入 H2S + FeCl2 混合溶液：H2S 被氧化析出 S，Fe2+ 可继续被氧化', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 260, h: 60, volume: 300, water: 300, solutes: { H2S: 20, FeCl2: 20 } });
  s.addObject(p);
  s.status = 'running';
  for (let i = 0; i < 40; i++) {
    s.bubbleGas(p, 'Cl2', 0.6, 1 / 30);
    s.step(1 / 30);
  }
  for (let i = 0; i < 300; i++) s.step(1 / 30);
  assert.ok(p.solution.mass('H2S') < 19, `H2S 应被 Cl2/HClO 氧化：${p.solution.mass('H2S')}`);
  assert.ok((p.precipitates.get('S') ?? 0) > 0.2, '应析出硫');
});

test('P1 跳过药品池只擦到池边：不判定为浸入，也不与池液反应', () => {
  const scene = poolScene();
  const pool = new Pool({ x: 300, y: 700, w: 200, h: 60, volume: 200, water: 200, solutes: { HCl: 30 } });
  scene.addObject(pool);
  const p = new Player({ x: 0, y: 0, substance: 'Fe', mass: 30, id: 'p' });
  scene.addObject(p);
  const r = pool.innerRect();
  // 水平只插入池内 3px（擦边），纵向在池内
  p.x = r.x - p.w + 3;
  p.y = r.y + 10;
  scene.updateContainment();
  assert.equal(p._container, null, '擦池边不应被判定为进入池内');
  scene.stepChemistry(1 / 30);
  assert.equal(scene.atmosphere.mass('H2'), 0, '擦边不应触发 Fe + 池液反应');

  // 真正踏入池内 20px：应重新判定为浸入并反应
  p.x = r.x - p.w + 20;
  p.y = r.y + 10;
  scene.updateContainment();
  assert.equal(p._container, pool, '真正进入池内应判定浸入');
  for (let i = 0; i < 120; i++) scene.stepChemistry(1 / 30);
  assert.ok(scene.atmosphere.mass('H2') > 0.05, '浸入池内应发生 Fe + HCl 反应');
});

test('P1 氯酸钾 + 浓盐酸：KClO3 + 6HCl → KCl + 3Cl2↑ + 3H2O', () => {
  const s = poolScene();
  const p = new Pool({ x: 300, y: 700, w: 240, h: 60, volume: 300, water: 300, solutes: { KClO3: 30, HCl: 120 } });
  s.addObject(p);
  s.status = 'running';
  run(s, 300);
  assert.ok(p.solution.mass('KClO3') < 1e-6, 'KClO3 应被消耗');
  assert.ok(p.solution.mass('KCl') > 5, '应生成 KCl');
  assert.ok(s.atmosphere.mass('Cl2') > 1, '应放出 Cl2');
});

test('P1 气体探测器只检测气体，旧的开启物质/预设开启物旁路已移除', () => {
  const s = new Scene();
  s.status = 'running';
  const gd = new GasDetector({ x: 300, y: 678, gas: 'H2', threshold: 0.5, opening: 'Cu', id: 'gd1' });
  s.addObject(gd);
  gd.addPrecipitate('Cu', 2);
  s.step(1 / 30);
  assert.equal(gd.open, false, '旧 opening/precipitates 不应再开启探测器');
  s._reactGas.H2 = 1;
  s.step(1 / 30);
  assert.equal(gd.open, true, '反应产气中目标气体超标应开启');
});

test('气室气相 Cl2+NH3：生成的 N2 能被气室内探测器看到，白烟不在中心堆成一条线', () => {
  const s = new Scene();
  s.status = 'running';
  const c = new GasChamber({ x: 100, y: 80, w: 360, h: 320, gases: { NH3: 136, Cl2: 213 }, id: 'c1' });
  const gd = new GasDetector({ x: 180, y: 260, gas: 'N2', threshold: 0.5, id: 'detN2' });
  s.addObject(c);
  s.addObject(gd);
  for (let i = 0; i < 300; i++) s.step(1 / 30);
  assert.ok((c._reactGas.N2 ?? 0) > 0.5, '气室反应产 N2 应记入该气室 _reactGas');
  assert.equal(gd.open, true, '气室内 N2 探测器应开启');
  // 白烟颗粒 x 分布应有宽度（spread），不是全部从中心一条竖线
  const xs = s.particles.filter((p) => p.substance === 'NH4Cl').map((p) => p.x);
  assert.ok(xs.length > 1, '应生成多颗 NH4Cl 白烟颗粒');
  assert.ok(Math.max(...xs) - Math.min(...xs) > 8, `白烟 x 分布过窄：${Math.min(...xs)}~${Math.max(...xs)}`);
});

test('电解池：纯水会电解；有电解质时先电解电解质（水规则排最后）', () => {
  const waterOnly = new Scene();
  waterOnly.status = 'running';
  const p1 = new ElectrolysisPool({ x: 300, y: 700, w: 220, h: 60, volume: 200, water: 200, id: 'p1' });
  waterOnly.addObject(p1);
  const o2Before = waterOnly.atmosphere.mass('O2');
  for (let i = 0; i < 120; i++) waterOnly.step(1 / 30);
  assert.ok(p1.solution.water < 199, '纯水应被电解消耗');
  assert.ok(waterOnly.atmosphere.mass('H2') > 0.1, '应生成 H2');
  assert.ok(waterOnly.atmosphere.mass('O2') > o2Before, '应生成 O2');

  const withSalt = new Scene();
  withSalt.status = 'running';
  const p2 = new ElectrolysisPool({ x: 300, y: 700, w: 220, h: 60, volume: 200, water: 200, solutes: { NaCl: 100 }, id: 'p2' });
  withSalt.addObject(p2);
  const o2Before2 = withSalt.atmosphere.mass('O2');
  for (let i = 0; i < 120; i++) withSalt.step(1 / 30);
  assert.ok(withSalt.atmosphere.mass('Cl2') > 0.1, '有 NaCl 时应先电解食盐水放 Cl2');
  assert.ok(p2.solution.water < 200, '电解食盐水也会消耗水');
  // 短时间内食盐水还没耗尽 → 水自身电解规则不应抢跑出 O2
  assert.ok(withSalt.atmosphere.mass('O2') <= o2Before2 + 1e-6, '电解质优先时不应同时电解水放 O2');
});
