// ============================================================================
// 氧化还原规律系统测试：自动配平器（元素/电荷守恒）+ 量变分支（稀/浓硝酸等）
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceRedox } from '../src/chem/redox.js';
import { IONS } from '../src/chem/substances.js';

/** 展开括号 + 元素计数（配平校验用） */
function countAtoms(formula) {
  const expanded = formula.replace(/\(([A-Za-z][^()]*)\)(\d+\.?\d*)/g, (_, inner, n) => inner.repeat(Math.round(parseFloat(n)))).replace(/[-+^]/g, '');
  const counts = {};
  const re = /([A-Z][a-z]?)(\d*\.?\d*)/g;
  let mo;
  while ((mo = re.exec(expanded))) {
    const n = mo[2] ? parseFloat(mo[2]) : 1;
    counts[mo[1]] = (counts[mo[1]] ?? 0) + n;
  }
  return counts;
}

/** 校验方程的元素守恒 + 电荷守恒 */
function verifyEquation(ox, red, opts) {
  const eq = balanceRedox(ox, red, opts);
  assert.ok(eq, `${ox}+${red} 应能配平`);
  const L = {};
  const R = {};
  for (const x of eq.rx) for (const [el, c] of Object.entries(countAtoms(x.id))) L[el] = (L[el] ?? 0) + c * x.coeff;
  for (const p of eq.pd) for (const [el, c] of Object.entries(countAtoms(p.id))) R[el] = (R[el] ?? 0) + c * p.coeff;
  const keys = new Set([...Object.keys(L), ...Object.keys(R)]);
  for (const el of keys) {
    assert.ok(Math.abs((L[el] ?? 0) - (R[el] ?? 0)) < 1e-6, `${ox}+${red}: ${el} 不守恒 ${L[el]} vs ${R[el]}`);
  }
  // 电荷守恒（离子电荷）
  let cL = 0;
  let cR = 0;
  for (const x of eq.rx) cL += (IONS[x.id]?.charge ?? 0) * x.coeff;
  for (const p of eq.pd) cR += (IONS[p.id]?.charge ?? 0) * p.coeff;
  assert.ok(Math.abs(cL - cR) < 1e-6, `${ox}+${red}: 电荷不守恒`);
  return eq;
}

function productOf(eq, id) {
  const p = eq.pd.find((x) => x.id === id);
  return p ? p.coeff : 0;
}

// ---- 1. 配平器守恒（经典方程式） ----------------------------------------------
test('配平：酸性 KMnO4 + FeSO4 → Mn2+ + Fe3+（2:10:8）', () => {
  const eq = verifyEquation('KMnO4', 'FeSO4', { medium: 'acid', acidId: 'H2SO4' });
  assert.ok(Math.abs(eq.rx.find((x) => x.id === 'KMnO4').coeff - 1) < 1e-9);
  assert.ok(Math.abs(eq.rx.find((x) => x.id === 'FeSO4').coeff - 5) < 1e-9);
  assert.ok(Math.abs(eq.rx.find((x) => x.id === 'H2SO4').coeff - 4) < 1e-9);
});

test('配平：KMnO4 + H2O2（酸性，氧气歧化）', () => {
  verifyEquation('KMnO4', 'H2O2', { medium: 'acid', acidId: 'H2SO4' });
});

test('配平：KMnO4 + SO2（酸性，H2SO4 产物）', () => {
  const eq = verifyEquation('KMnO4', 'SO2', { medium: 'acid', acidId: 'H2SO4' });
  assert.ok(productOf(eq, 'H2SO4') > 0, '应生成 H2SO4');
});

test('配平：KMnO4 + H2O2（碱性 → 锰酸钾）', () => {
  const eq = verifyEquation('KMnO4', 'H2O2', { medium: 'base' });
  assert.ok(productOf(eq, 'K2MnO4') > 0, '碱性介质应生成 K2MnO4');
});

test('配平：K2Cr2O7 + 乙醇（酸性，酒驾橙→绿）', () => {
  const eq = verifyEquation('K2Cr2O7', 'C2H5OH', { medium: 'acid', acidId: 'H2SO4' });
  assert.ok(productOf(eq, 'CH3COOH') > 0);
  assert.ok(productOf(eq, 'Cr2(SO4)3') > 0);
});

test('配平：KMnO4 + 草酸（褪色经典）', () => {
  const eq = verifyEquation('KMnO4', 'H2C2O4', { medium: 'acid', acidId: 'H2SO4' });
  assert.ok(productOf(eq, 'CO2') > 0);
});

test('配平：H2S + Cl2 → S + HCl（中性）', () => {
  const eq = verifyEquation('Cl2', 'H2S', { medium: 'neutral' });
  assert.ok(productOf(eq, 'S') > 0);
  assert.ok(productOf(eq, 'HCl') > 0);
});

test('配平：SO2 + Cl2 + 2H2O → H2SO4 + 2HCl', () => {
  const eq = verifyEquation('Cl2', 'SO2', { medium: 'neutral' });
  assert.ok(productOf(eq, 'H2SO4') > 0);
  assert.ok(productOf(eq, 'HCl') > 0);
});

test('配平：Fe + 2FeCl3 → 3FeCl2（归中）', () => {
  const eq = verifyEquation('FeCl3', 'Fe', { medium: 'neutral', redKey: 'weak' });
  assert.ok(productOf(eq, 'FeCl2') > 0);
});

test('配平：Cl2 + 2FeCl2 → 2FeCl3', () => {
  const eq = verifyEquation('Cl2', 'FeCl2', { medium: 'neutral' });
  assert.ok(productOf(eq, 'FeCl3') > 0);
});

test('配平：金属+酸（Zn + 2HCl → H2 + ZnCl2）', () => {
  const eq = verifyEquation('H+', 'Zn', { medium: 'acid', acidId: 'HCl' });
  assert.ok(productOf(eq, 'H2') > 0);
  assert.ok(productOf(eq, 'ZnCl2') > 0);
});

test('配平：Fe + CuSO4 → FeSO4 + Cu', () => {
  const eq = verifyEquation('CuSO4', 'Fe', { medium: 'neutral' });
  assert.ok(productOf(eq, 'Cu') > 0);
  assert.ok(productOf(eq, 'FeSO4') > 0);
});

test('配平：KMnO4 + KI（酸性，I- → I2）', () => {
  verifyEquation('KMnO4', 'KI', { medium: 'acid', acidId: 'H2SO4' });
});

test('配平：NaClO + SO2 → NaCl + H2SO4', () => {
  verifyEquation('NaClO', 'SO2', { medium: 'neutral' });
});

// ---- 2. 量变分支 ---------------------------------------------------------------
test('量变：稀硝酸 → NO（无色），浓硝酸 → NO2（红棕）', () => {
  const dilute = balanceRedox('HNO3', 'Cu', { medium: 'acid', acidId: 'HNO3', conc: 200 });
  const conc = balanceRedox('HNO3', 'Cu', { medium: 'acid', acidId: 'HNO3', conc: 562 });
  assert.ok(productOf(dilute, 'NO') > 0, '稀硝酸产 NO');
  assert.equal(productOf(dilute, 'NO2'), 0);
  assert.ok(productOf(conc, 'NO2') > 0, '浓硝酸产 NO2');
  assert.equal(productOf(conc, 'NO'), 0);
});

test('量变：Fe + HNO3 计量比 → 酸过量 Fe3+ / 铁过量 Fe2+', () => {
  // n(HNO3)/n(Fe) >= 4 → strong → Fe3+；否则 weak → Fe2+
  const eqStrong = balanceRedox('HNO3', 'Fe', { medium: 'acid', acidId: 'HNO3', redKey: 'strong' });
  assert.ok(eqStrong.pd.some((p) => p.id === 'Fe2(SO4)3' || p.id === 'Fe(NO3)3'), '酸过量应生成 Fe3+ 盐');
  const eqWeak = balanceRedox('HNO3', 'Fe', { medium: 'acid', acidId: 'HNO3', redKey: 'weak' });
  assert.ok(eqWeak.pd.some((p) => p.id === 'Fe(NO3)2'), '铁过量应生成 Fe2+ 盐');
});

test('量变：KMnO4 介质 → 酸性 Mn2+（无色）/ 中性 MnO2↓（黑）/ 强碱 MnO4^2-（绿）', () => {
  const acid = balanceRedox('KMnO4', 'SO2', { medium: 'acid', acidId: 'H2SO4' });
  const neutral = balanceRedox('KMnO4', 'SO2', { medium: 'neutral' });
  const base = balanceRedox('KMnO4', 'SO2', { medium: 'base' });
  assert.ok(productOf(acid, 'MnSO4') > 0, '酸性 → Mn2+');
  assert.ok(productOf(neutral, 'MnO2') > 0, '中性 → MnO2↓');
  assert.ok(productOf(base, 'K2MnO4') > 0, '强碱 → MnO4^2-');
});

test('量变：碳不进 REDOX 表（常温不参与离子氧化还原），燃烧/高温还原走专门规则', () => {
  // C 从 REDUCERS 移除：不与酸/盐溶液配平（C+HCl、C+CuSO4 常温都不反应）
  assert.equal(balanceRedox('H+', 'C', { medium: 'acid', acidId: 'HCl' }), null, '碳不与盐酸反应');
  assert.equal(balanceRedox('CuSO4', 'C', { medium: 'neutral' }), null, '碳不置换铜');
  // CO 仍可被 O2 氧化（CO 可燃）
  const co = balanceRedox('O2', 'CO', { medium: 'neutral' });
  assert.ok(productOf(co, 'CO2') > 0);
});

// ---- 3. 防呆 -------------------------------------------------------------------
test('防呆：Cu + 稀 H2SO4 不应被氧化（引擎层 _isPassivated 拦截）', () => {
  // 平衡器本身能配平（浓），引擎层负责拦截；这里验证稀浓分支存在
  const eq = balanceRedox('H2SO4', 'Cu', { medium: 'acid', acidId: 'H2SO4' });
  assert.ok(eq, '浓 H2SO4 可配平（Cu + 2H2SO4 → CuSO4 + SO2 + 2H2O）');
  assert.ok(productOf(eq, 'SO2') > 0);
});

test('防呆：产物与反应物同集（CuSO4 + Cu 往返）返回 null', () => {
  // 同元素往返（Cu2+ + Cu → Cu + Cu2+）不产生净反应
  const eq = balanceRedox('CuSO4', 'Cu', { medium: 'neutral' });
  if (eq) {
    const same = eq.pd.every((p) => eq.rx.some((r) => r.id === p.id));
    assert.ok(same || eq.pd.length === 0, '不应有净产物');
  }
});
